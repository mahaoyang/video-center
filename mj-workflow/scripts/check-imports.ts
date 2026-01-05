import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

type Layer = 'atoms' | 'state' | 'adapters' | 'storage' | 'headless' | 'blocks' | 'app' | 'other';

const ROOT = resolve(process.cwd(), 'src/public');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) out.push(full);
  }
  return out;
}

function layerOf(absPath: string): Layer {
  const rel = absPath.replace(ROOT + '/', '');
  if (rel.startsWith('atoms/')) return 'atoms';
  if (rel.startsWith('state/')) return 'state';
  if (rel.startsWith('adapters/')) return 'adapters';
  if (rel.startsWith('storage/')) return 'storage';
  if (rel.startsWith('headless/')) return 'headless';
  if (rel.startsWith('blocks/')) return 'blocks';
  if (rel === 'app.ts') return 'app';
  return 'other';
}

function readImports(source: string): string[] {
  const imports: string[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (;;) {
    const m = re.exec(source);
    if (!m) break;
    imports.push(String(m[1]));
  }
  return imports;
}

function resolveRelative(fromAbs: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromAbs), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

function isViolation(from: Layer, to: Layer): string | null {
  if (from === 'atoms') {
    if (to !== 'atoms') return 'atoms must only import atoms';
  }
  if (from === 'headless') {
    if (to === 'blocks') return 'headless must not import blocks';
    if (to === 'storage') return 'headless must not import storage (IO stays in UI/storage)';
  }
  if (from === 'blocks') {
    if (to === 'blocks') return 'blocks must not import blocks (no same-level links)';
  }
  return null;
}

function main() {
  const files = walk(ROOT);
  const violations: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const fromLayer = layerOf(file);
    for (const spec of readImports(source)) {
      const resolved = resolveRelative(file, spec);
      if (!resolved) continue;
      if (!resolved.startsWith(ROOT)) continue;
      const toLayer = layerOf(resolved);
      const why = isViolation(fromLayer, toLayer);
      if (why) {
        const relFrom = file.replace(ROOT + '/', '');
        const relTo = resolved.replace(ROOT + '/', '');
        violations.push(`${relFrom} -> ${spec} (${relTo}): ${why}`);
      }
    }
  }

  if (violations.length) {
    console.error('Import boundary violations:\n' + violations.map((v) => `- ${v}`).join('\n'));
    process.exit(1);
  }

  console.log('Import boundaries OK');
}

main();

