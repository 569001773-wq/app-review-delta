import { parse as babelParse, ParserOptions } from '@babel/parser';
import { isArray, isDict, PlistValue } from './plist';

/**
 * Static extraction of Expo app config. app.config.js / app.config.ts are
 * NEVER executed or imported. Only provably safe literal values are resolved;
 * everything else is marked unresolved so the analysis reports a coverage gap
 * instead of guessing.
 */

export type ResolvedValue = { resolved: true; value: PlistValue } | { resolved: false };

export interface StaticExpoConfig {
  /** True when an app.config.js/ts exists but could not be statically resolved. */
  dynamic: boolean;
  /** Fields that could not be resolved statically (dotted paths under `expo`). */
  unresolvedFields: string[];
  /** Statically resolved `expo` subtree (app.json / app.config.json merged with resolved app.config.* fields). */
  expo: { [key: string]: PlistValue } | null;
  sourceFiles: string[];
}

type BabelNode = {
  type: string;
  [key: string]: unknown;
};

function isNode(v: unknown): v is BabelNode {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}

function nodeText(n: unknown): string {
  if (typeof n === 'string') return n;
  if (isNode(n)) {
    const v = n.value;
    if (typeof v === 'string') return v;
    const name = n.name;
    if (typeof name === 'string') return name;
  }
  return '';
}

/**
 * Evaluate a Babel AST node to a plain literal value. Any dynamic construct
 * (calls, identifiers, member expressions, computed spreads, template
 * interpolation, etc.) yields { resolved: false }.
 */
function evaluateNode(node: BabelNode | undefined | null): ResolvedValue {
  if (!node) return { resolved: false };
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return { resolved: true, value: node.value as string | number | boolean };
    case 'NullLiteral':
      return { resolved: true, value: null };
    case 'TemplateLiteral': {
      const expressions = node.expressions as BabelNode[];
      if (expressions.length > 0) return { resolved: false };
      const quasis = node.quasis as BabelNode[];
      const text = quasis.map((q) => nodeText(q.value)).join('');
      return { resolved: true, value: text };
    }
    case 'ArrayExpression': {
      const elements = node.elements as (BabelNode | null)[];
      const out: PlistValue[] = [];
      for (const el of elements) {
        if (el === null || el.type === 'SpreadElement') return { resolved: false };
        const r = evaluateNode(el);
        if (!r.resolved) return { resolved: false };
        out.push(r.value);
      }
      return { resolved: true, value: out };
    }
    case 'ObjectExpression': {
      const props = node.properties as BabelNode[];
      // Null prototype: attacker-controlled config keys ("__proto__") must
      // not pollute Object.prototype or inject inherited values.
      const out: { [key: string]: PlistValue } = Object.create(null) as {
        [key: string]: PlistValue;
      };
      for (const prop of props) {
        if (prop.type !== 'ObjectProperty') return { resolved: false };
        const key = nodeText(prop.key);
        if (!key) return { resolved: false };
        const r = evaluateNode(prop.value as BabelNode);
        if (!r.resolved) return { resolved: false };
        out[key] = r.value;
      }
      return { resolved: true, value: out };
    }
    case 'UnaryExpression': {
      if ((node.operator as string) !== '-') return { resolved: false };
      const arg = evaluateNode(node.argument as BabelNode);
      if (!arg.resolved || typeof arg.value !== 'number') return { resolved: false };
      return { resolved: true, value: -arg.value };
    }
    case 'BinaryExpression': {
      const op = node.operator as string;
      const l = evaluateNode(node.left as BabelNode);
      const r = evaluateNode(node.right as BabelNode);
      if (!l.resolved || !r.resolved) return { resolved: false };
      if (op === '+') {
        if (typeof l.value === 'string' && typeof r.value === 'string') {
          return { resolved: true, value: l.value + r.value };
        }
        if (typeof l.value === 'number' && typeof r.value === 'number') {
          return { resolved: true, value: l.value + r.value };
        }
      }
      if (op === '-') {
        if (typeof l.value === 'number' && typeof r.value === 'number') {
          return { resolved: true, value: l.value - r.value };
        }
      }
      return { resolved: false };
    }
    default:
      return { resolved: false };
  }
}

function getExportExpression(ast: BabelNode): BabelNode | null {
  const body = (ast.program as { body?: BabelNode[] } | undefined)?.body ?? [];
  for (const stmt of body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = stmt.declaration as BabelNode;
      if (decl.type === 'CallExpression') {
        const args = decl.arguments as BabelNode[];
        const first = args[0];
        if (first && first.type === 'ObjectExpression') return first;
        return decl;
      }
      return decl;
    }
    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression as BabelNode;
      const left = expr.left as BabelNode | undefined;
      if (
        expr.type === 'AssignmentExpression' &&
        left &&
        left.type === 'MemberExpression' &&
        (left.object as BabelNode | undefined)?.type === 'Identifier' &&
        (left.object as { name?: string }).name === 'module' &&
        (left.property as { name?: string } | undefined)?.name === 'exports'
      ) {
        const right = expr.right as BabelNode;
        if (right.type === 'ObjectExpression') return right;
        return right;
      }
    }
  }
  return null;
}

/**
 * Statically parse app.config.js / app.config.ts source.
 * Returns the statically resolvable top-level object, or null when dynamic.
 */
export function staticAppConfigJs(
  source: string,
  filename: string,
): {
  resolved: boolean;
  object?: { [key: string]: PlistValue };
  unresolvedFields: string[];
} {
  let ast: BabelNode;
  try {
    const options: ParserOptions = {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: false,
    };
    ast = babelParse(source, options) as unknown as BabelNode;
  } catch {
    return { resolved: false, unresolvedFields: ['*'] };
  }
  const expr = getExportExpression(ast);
  if (!expr) return { resolved: false, unresolvedFields: ['*'] };
  if (expr.type !== 'ObjectExpression') {
    return { resolved: false, unresolvedFields: ['*'] };
  }
  const unresolvedFields: string[] = [];
  const object = walkPartial(expr, [], unresolvedFields);
  void filename;
  return { resolved: true, object: object ?? undefined, unresolvedFields };
}

/**
 * Walk an object literal, keeping provably safe values and recording the
 * dotted paths of anything dynamic (calls, identifiers, computed spreads,
 * template interpolation, etc.). Never executes or imports anything.
 */
function walkPartial(
  node: BabelNode,
  path: string[],
  unresolved: string[],
): { [key: string]: PlistValue } | null {
  if (node.type !== 'ObjectExpression') return null;
  const out: { [key: string]: PlistValue } = Object.create(null) as { [key: string]: PlistValue };
  const props = node.properties as BabelNode[];
  for (const prop of props) {
    if (prop.type !== 'ObjectProperty') {
      unresolved.push(path.join('.') || '*');
      continue;
    }
    const key = nodeText(prop.key);
    if (!key) {
      unresolved.push(path.join('.') || '*');
      continue;
    }
    const val = prop.value as BabelNode;
    const childPath = [...path, key];
    if (val.type === 'ObjectExpression') {
      const child = walkPartial(val, childPath, unresolved);
      if (child !== null) out[key] = child;
      else unresolved.push(childPath.join('.'));
      continue;
    }
    const r = evaluateNode(val);
    if (r.resolved) {
      out[key] = r.value;
    } else {
      unresolved.push(childPath.join('.'));
    }
  }
  return out;
}

function deepMerge(
  base: { [key: string]: PlistValue },
  overlay: { [key: string]: PlistValue },
): { [key: string]: PlistValue } {
  const out: { [key: string]: PlistValue } = Object.create(null) as { [key: string]: PlistValue };
  for (const [k, v] of Object.entries(base)) out[k] = v;
  for (const [k, v] of Object.entries(overlay)) {
    const existing = out[k];
    if (isDict(existing) && isDict(v)) {
      out[k] = deepMerge(existing, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Build the effective static Expo config from a snapshot's app config files.
 * app.config.js/ts are parsed as data only.
 */
export function buildStaticExpoConfig(files: { path: string; text: string }[]): StaticExpoConfig {
  const jsonFiles = files.filter((f) => f.path === 'app.json' || f.path === 'app.config.json');
  const jsFiles = files.filter((f) => f.path === 'app.config.js' || f.path === 'app.config.ts');
  const sourceFiles = [...jsonFiles, ...jsFiles].map((f) => f.path);
  if (sourceFiles.length === 0) {
    return { dynamic: false, unresolvedFields: [], expo: null, sourceFiles: [] };
  }

  let expo: { [key: string]: PlistValue } | null = null;
  const unresolvedFields: string[] = [];

  for (const f of jsonFiles) {
    try {
      const parsed = JSON.parse(f.text) as { expo?: unknown };
      if (parsed && typeof parsed.expo === 'object' && parsed.expo !== null) {
        expo = deepMerge(expo ?? {}, parsed.expo as { [key: string]: PlistValue });
      }
    } catch {
      unresolvedFields.push(f.path);
    }
  }

  const sortedJs = [...jsFiles].sort((a, b) => a.path.localeCompare(b.path));
  let dynamic = false;
  for (const f of sortedJs) {
    const r = staticAppConfigJs(f.text, f.path);
    if (!r.resolved) {
      dynamic = true;
      unresolvedFields.push('*');
      continue;
    }
    if (r.object) {
      const inner =
        r.object['expo'] !== undefined
          ? r.object['expo']
          : isDict(r.object) &&
              (r.object['ios'] !== undefined ||
                r.object['name'] !== undefined ||
                r.object['slug'] !== undefined)
            ? r.object
            : undefined;
      if (inner !== undefined && isDict(inner)) {
        expo = deepMerge(expo ?? {}, inner);
      } else {
        // Dynamic top-level shape without an `expo` key: cannot be sure.
        dynamic = true;
        unresolvedFields.push('*');
        continue;
      }
    }
    unresolvedFields.push(...r.unresolvedFields);
  }

  return {
    dynamic,
    unresolvedFields: [...new Set(unresolvedFields)],
    expo,
    sourceFiles,
  };
}

export { isArray, isDict };
