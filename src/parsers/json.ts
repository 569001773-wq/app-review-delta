export interface JsonParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
