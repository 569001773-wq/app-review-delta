import { XMLParser } from 'fast-xml-parser';

export type PlistValue =
  string | number | boolean | null | PlistValue[] | { [key: string]: PlistValue };

export interface PlistParseResult {
  ok: boolean;
  value?: PlistValue;
  error?: string;
}

type PONode = Record<string, PONode[]>;

/**
 * Cheap structural guard: XML tag balance. fast-xml-parser is intentionally
 * tolerant, so without this check malformed plists would parse "successfully"
 * and hide structural invalidity. Comments, processing instructions and
 * DOCTYPE declarations are ignored.
 */
function assertBalancedTags(xml: string): string | null {
  const cleaned = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '');
  const stack: string[] = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)((?:\s[^<>]*?)?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = tagRe.exec(cleaned)) !== null) {
    if (++count > 200000) return 'document too complex';
    const name = m[1]!;
    const selfClosing = m[3] === '/' || m[2]!.trim().endsWith('/');
    if (m[0].startsWith('</')) {
      const open = stack.pop();
      if (open !== name) return `mismatched closing tag </${name}> (expected </${open ?? '?'}>)`;
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (stack.length > 0) return `unclosed tag <${stack[stack.length - 1]}>`;
  return null;
}

function textOf(node: PONode): string {
  const t = node['#text'];
  const raw = Array.isArray(t) ? t[0] : t;
  if (typeof raw === 'string') return raw;
  if (raw !== undefined && typeof raw === 'object') {
    const inner = (raw as PONode)['#text'];
    const innerRaw = Array.isArray(inner) ? inner[0] : inner;
    if (typeof innerRaw === 'string') return innerRaw;
  }
  // Nested text (e.g. { key: [ { '#text': '...' } ] }).
  for (const [, kids] of Object.entries(node)) {
    if (!Array.isArray(kids)) continue;
    for (const kid of kids) {
      const s = textOf(kid);
      if (s) return s;
    }
  }
  return '';
}

function convertNode(node: PONode): PlistValue {
  const entries = Object.entries(node);
  const first = entries[0];
  if (!first) return '';
  const [tag, children] = first;
  switch (tag) {
    case '#text':
      return typeof children === 'string'
        ? children
        : String((Array.isArray(children) ? children[0] : '') ?? '');
    case 'dict': {
      // Null prototype: attacker-controlled plist keys must never pollute
      // Object.prototype (e.g. a "__proto__" key) or inject values.
      const out: { [key: string]: PlistValue } = Object.create(null) as {
        [key: string]: PlistValue;
      };
      let pendingKey: string | null = null;
      for (const child of children) {
        const childEntry = Object.entries(child)[0];
        if (!childEntry) continue;
        const [ctag] = childEntry;
        if (ctag === 'key') {
          pendingKey = textOf(child);
          continue;
        }
        if (pendingKey !== null) {
          out[pendingKey] = convertNode(child);
          pendingKey = null;
        }
      }
      return out;
    }
    case 'array':
      return children.map(convertNode);
    case 'string':
      return textOf(node);
    case 'integer':
    case 'real': {
      const n = Number(textOf(node));
      return Number.isNaN(n) ? textOf(node) : n;
    }
    case 'true':
      return true;
    case 'false':
      return false;
    case 'data':
    case 'date':
      return textOf(node);
    default:
      // Unknown leaf: return text if present.
      return children.length === 0 ? '' : convertNode({ [tag]: children });
  }
}

/**
 * Parses an XML plist into plain JSON-like data. Never executes anything.
 * Malformed XML or plist structure returns { ok: false, error }.
 */
export function parsePlist(xml: string): PlistParseResult {
  const balanceError = assertBalancedTags(xml);
  if (balanceError) return { ok: false, error: balanceError };
  let parsed: PONode[];
  try {
    parsed = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: false,
      trimValues: true,
      processEntities: true,
      allowBooleanAttributes: true,
      preserveOrder: true,
    }).parse(xml) as PONode[];
  } catch (err) {
    return { ok: false, error: `XML parse failed: ${(err as Error).message}` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'plist is not a document' };
  }
  const plistNode = parsed.find((n) => n['plist']);
  if (!plistNode) {
    return { ok: false, error: 'plist root element missing' };
  }
  const plistChildren = plistNode['plist'];
  const body = plistChildren && plistChildren[0];
  if (!body) return { ok: false, error: 'plist is empty' };
  const child = Object.entries(body)[0];
  if (!child) return { ok: false, error: 'plist body is empty' };
  const [childTag, childChildren] = child;
  if (!childChildren) return { ok: false, error: 'plist body is empty' };
  try {
    return { ok: true, value: convertNode({ [childTag]: childChildren }) };
  } catch (err) {
    return { ok: false, error: `plist conversion failed: ${(err as Error).message}` };
  }
}

export function isDict(v: PlistValue | undefined): v is { [key: string]: PlistValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isArray(v: PlistValue | undefined): v is PlistValue[] {
  return Array.isArray(v);
}
