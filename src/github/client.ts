import { Octokit } from '@octokit/rest';

interface CompareData {
  files?: Array<{
    filename?: string;
    status?: string;
    additions?: number;
    deletions?: number;
    changes?: number;
  }>;
}

interface ContentData {
  type?: string;
  encoding?: string;
  content?: string;
  size?: number;
  git_url?: string | null;
}

interface BlobData {
  encoding?: string;
  content?: string;
  size?: number | null;
}

interface OctokitRest {
  repos: {
    compareCommits: (params: any) => Promise<{ data: CompareData }>;
    getContent: (params: any) => Promise<{ data: ContentData | ContentData[] }>;
  };
  pulls: {
    listFiles: (params: any) => Promise<{ data: PullRequestFileData[] }>;
  };
  git: {
    getBlob: (params: any) => Promise<{ data: BlobData }>;
  };
}

interface PullRequestFileData {
  filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
}

export interface ChangedFileInfo {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface CompareResult {
  files: ChangedFileInfo[];
  truncated: boolean;
  notes: string[];
}

export interface PullRequestFilesResult {
  files: ChangedFileInfo[];
  truncated: boolean;
  notes: string[];
}

export interface FetchedFile {
  path: string;
  content: Uint8Array;
  size: number;
  truncated: boolean;
  missing: boolean;
  symlink: boolean;
}

export class GitHubClient {
  private readonly octokit: { rest: OctokitRest };
  constructor(
    private readonly owner: string,
    private readonly repo: string,
    token: string | undefined,
  ) {
    this.octokit = new Octokit({
      auth: token && token.length > 0 ? token : undefined,
    }) as unknown as { rest: OctokitRest };
  }

  private async request<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const status = (err as { status?: number }).status ?? 0;
        if (status === 403 || status === 429 || status >= 500) {
          const delay = 1000 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async compareCommits(baseSha: string, headSha: string, maxPages: number): Promise<CompareResult> {
    const files: ChangedFileInfo[] = [];
    const notes: string[] = [];
    let truncated = false;
    let sawFullPage = false;
    for (let page = 1; page <= maxPages; page++) {
      const data = await this.request(() =>
        this.octokit.rest.repos
          .compareCommits({
            owner: this.owner,
            repo: this.repo,
            base: baseSha,
            head: headSha,
            per_page: 300,
            page,
          })
          .then((r) => r.data),
      );
      const pageFiles = data.files ?? [];
      for (const f of pageFiles) {
        if (!f.filename) continue;
        files.push({
          path: f.filename,
          status: f.status ?? 'modified',
          additions: f.additions ?? 0,
          deletions: f.deletions ?? 0,
          changes: f.changes ?? 0,
        });
      }
      sawFullPage = pageFiles.length >= 300;
      if (pageFiles.length < 300) break;
    }
    if (sawFullPage) {
      truncated = true;
      notes.push(
        'compare response reached the pagination limit; changed-file coverage may be partial',
      );
    }
    return { files, truncated, notes };
  }

  /**
   * Lists the files changed by a pull request. PR-scoped, so it works for
   * cross-repository (fork) pull requests where compare may not.
   */
  async listPullRequestFiles(prNumber: number, maxPages = 3): Promise<PullRequestFilesResult> {
    const files: ChangedFileInfo[] = [];
    const notes: string[] = [];
    let truncated = false;
    let sawFullPage = false;
    for (let page = 1; page <= maxPages; page++) {
      const data = await this.request(() =>
        this.octokit.rest.pulls
          .listFiles({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            per_page: 100,
            page,
          })
          .then((r) => r.data),
      );
      for (const f of data) {
        if (!f.filename) continue;
        files.push({
          path: f.filename,
          status: f.status ?? 'modified',
          additions: f.additions ?? 0,
          deletions: f.deletions ?? 0,
          changes: f.changes ?? 0,
        });
      }
      sawFullPage = data.length >= 100;
      if (data.length < 100) break;
    }
    if (sawFullPage) {
      truncated = true;
      notes.push(
        'pull-request files response reached the pagination limit; changed-file coverage may be partial',
      );
    }
    return { files, truncated, notes };
  }

  getRepoId(): string {
    return `${this.owner}/${this.repo}`;
  }

  async getFile(path: string, ref: string, maxFileSize = 2 * 1024 * 1024): Promise<FetchedFile> {
    try {
      const data = await this.request(() =>
        this.octokit.rest.repos
          .getContent({
            owner: this.owner,
            repo: this.repo,
            path,
            ref,
          })
          .then((r) => r.data),
      );
      if (Array.isArray(data)) {
        return {
          path,
          content: new Uint8Array(),
          size: 0,
          truncated: true,
          missing: false,
          symlink: false,
        };
      }
      if (data.type === 'symlink') {
        return {
          path,
          content: new Uint8Array(),
          size: 0,
          truncated: false,
          missing: false,
          symlink: true,
        };
      }
      if (data.type && data.type !== 'file') {
        // Directories, submodules, and other non-file entries are skipped.
        return {
          path,
          content: new Uint8Array(),
          size: 0,
          truncated: false,
          missing: false,
          symlink: true,
        };
      }
      const encoding = data.encoding as string | undefined;
      const size = data.size ?? 0;
      if (encoding === 'base64' && typeof data.content === 'string') {
        return {
          path,
          content: Buffer.from(data.content, 'base64'),
          size,
          truncated: false,
          missing: false,
          symlink: false,
        };
      }
      // Large file: contents API returns no inline content. Fall back to the
      // Git blobs API when the blob SHA is available.
      const gitUrl = data.git_url as string | undefined;
      if (gitUrl && size <= maxFileSize) {
        const m = /\/git\/blobs\/([0-9a-f]{40,64})$/.exec(gitUrl);
        if (m && m[1]) {
          const blob = await this.request(() =>
            this.octokit.rest.git
              .getBlob({
                owner: this.owner,
                repo: this.repo,
                file_sha: m[1]!,
              })
              .then((r) => r.data),
          );
          if (blob.encoding === 'base64' && typeof blob.content === 'string') {
            return {
              path,
              content: Buffer.from(blob.content, 'base64'),
              size: blob.size ?? size,
              truncated: false,
              missing: false,
              symlink: false,
            };
          }
        }
      }
      return {
        path,
        content: new Uint8Array(),
        size,
        truncated: true,
        missing: false,
        symlink: false,
      };
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      if (status === 404) {
        return {
          path,
          content: new Uint8Array(),
          size: 0,
          truncated: false,
          missing: true,
          symlink: false,
        };
      }
      throw err;
    }
  }
}
