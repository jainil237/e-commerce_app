#!/usr/bin/env node
// W-12 gate: CLAUDE.md forbids mixing Tailwind utility classes with BEM/.scss
// in the same component, but nothing enforced it — the audit found 29 (later
// re-verified as 8) violating files. No built-in ESLint rule can express
// "this file imports a .scss AND uses a Tailwind utility class" without a
// custom AST plugin, so this is a small checked-in script instead, the same
// pattern as verify-contrast.mjs.
//
// Ratcheted, not zero-tolerance: the existing debt is not this phase's to
// fix, so violations at or below the recorded baseline pass. Any file not in
// the baseline that mixes the two fails the check — the ratchet only
// tightens.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const TAILWIND_PATTERN = /className="[^"]*\b(flex|grid|w-\d|h-\d|p-\d|m-\d|px-\d|py-\d|mt-\d|mb-\d|text-\[|gap-\d|shrink-0|items-center|justify-|rounded-|bg-\w+-\d)/

const BASELINE = new Set([
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/account/addresses/page.tsx',
  'apps/web/src/app/checkout/page.tsx',
  'apps/web/src/app/account/orders/page.tsx',
  'apps/web/src/app/account/register/page.tsx',
  'apps/web/src/app/account/page.tsx',
  'apps/web/src/app/account/login/page.tsx',
  'apps/web/src/app/wishlist/page.tsx',
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (entry.endsWith('.tsx')) out.push(full)
  }
}

const files = []
walk(join(ROOT, 'apps/web/src'), files)

const violations = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // SCSS imports are side-effect imports (`import './x.scss'`), not `import x from`.
  if (!/^import ['"].*\.scss['"]/m.test(src)) continue
  if (!TAILWIND_PATTERN.test(src)) continue
  violations.push(relative(ROOT, file).split('\\').join('/'))
}

const newViolations = violations.filter((f) => !BASELINE.has(f))
const fixed = [...BASELINE].filter((f) => !violations.includes(f))

console.log(`Tailwind + .scss mix: ${violations.length} file(s), baseline ${BASELINE.size}`)
if (fixed.length) console.log(`  Fixed since baseline (consider shrinking BASELINE): ${fixed.join(', ')}`)
if (newViolations.length) {
  console.log(`FAIL — new violations not in the baseline:\n  ${newViolations.join('\n  ')}`)
  process.exit(1)
}
console.log('PASS — no new Tailwind/.scss mixing beyond the recorded baseline.')
