// Testrunner: bundelt de pure-logica-modules met esbuild en draait de scenario-tests.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'tests', '.bundles')
mkdirSync(out, { recursive: true })
const esbuild = join(root, 'node_modules', '.bin', 'esbuild')

for (const [src, name] of [
  ['src/lib/time.ts', 'time-bundle.mjs'],
  ['src/lib/streak.ts', 'streak-bundle.mjs'],
  ['src/lib/advice.ts', 'advice-bundle.mjs'],
  ['src/lib/nutrition/daytype.ts', 'nutrition-daytype-bundle.mjs'],
  ['src/lib/nutrition/engine.ts', 'nutrition-engine-bundle.mjs'],
  ['src/lib/nutrition/macros.ts', 'nutrition-macros-bundle.mjs'],
  ['src/lib/nutrition/copy.ts', 'nutrition-copy-bundle.mjs'],
  ['src/lib/nutrition/seedData.ts', 'nutrition-seed-bundle.mjs'],
  ['src/lib/nutrition/shopping.ts', 'nutrition-shopping-bundle.mjs'],
]) {
  execFileSync(esbuild, [join(root, src), '--bundle', '--format=esm', `--outfile=${join(out, name)}`])
}

let failed = false
for (const test of ['time.test.mjs', 'logic.test.mjs', 'nutrition.test.mjs']) {
  console.log(`\n== ${test} ==`)
  try {
    execFileSync('node', [join(root, 'tests', test)], { stdio: 'inherit' })
  } catch {
    failed = true
  }
}
process.exit(failed ? 1 : 0)
