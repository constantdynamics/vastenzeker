// Genereert supabase/seed/if_nutrition_seed.sql uit src/lib/nutrition/seedData.ts.
// Zo blijft er één bron van waarheid: de TypeScript-seed die ook in tests draait.
// Idempotent: on conflict do update, en compositie per meal delete + insert.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const seedSrc = join(root, 'src', 'lib', 'nutrition', 'seedData.ts')
if (!existsSync(seedSrc)) {
  console.error(`Ontbreekt: ${seedSrc} — genereer de seed pas als seedData.ts bestaat.`)
  process.exit(1)
}

const out = join(root, 'scripts', '.bundles')
mkdirSync(out, { recursive: true })
const bundle = join(out, 'seed-data-bundle.mjs')
const esbuild = join(root, 'node_modules', '.bin', 'esbuild')
execFileSync(esbuild, [seedSrc, '--bundle', '--format=esm', `--outfile=${bundle}`])

const { SEED_INGREDIENTS, SEED_MEALS } = await import(pathToFileURL(bundle).href)

// SQL-literal-helpers: aanhalingstekens verdubbelen, null netjes uitschrijven.
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined ? 'null' : String(v))
const b = (v) => (v ? 'true' : 'false')
const slotArr = (slots) => `array[${slots.map(q).join(',')}]::text[]`

const lines = []
lines.push('-- GEGENEREERD door scripts/gen-nutrition-seed.mjs — niet met de hand bewerken.')
lines.push('-- Bron: src/lib/nutrition/seedData.ts. Idempotent: veilig opnieuw te draaien.')
lines.push('')

lines.push('-- Ingrediënten')
for (const ing of SEED_INGREDIENTS) {
  lines.push(
    `insert into public.if_ingredients (slug, name, kcal_100g, protein_100g, carb_100g, fat_100g, fiber_100g, category, is_nut, nut_type, piece_grams, is_peanut_butter, rationale, source, external_id) values` +
      ` (${q(ing.slug)}, ${q(ing.name)}, ${n(ing.kcal100)}, ${n(ing.protein100)}, ${n(ing.carb100)}, ${n(ing.fat100)}, ${n(ing.fiber100)}, ${q(ing.category)}, ${b(ing.isNut)}, ${q(ing.nutType)}, ${n(ing.pieceGrams)}, ${b(ing.isPeanutButter)}, ${q(ing.rationale)}, ${q(ing.source ?? 'seed')}, ${q(ing.externalId)})` +
      `\n  on conflict (slug) do update set name = excluded.name, kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g, carb_100g = excluded.carb_100g, fat_100g = excluded.fat_100g, fiber_100g = excluded.fiber_100g, category = excluded.category, is_nut = excluded.is_nut, nut_type = excluded.nut_type, piece_grams = excluded.piece_grams, is_peanut_butter = excluded.is_peanut_butter, rationale = excluded.rationale, source = excluded.source, external_id = excluded.external_id;`,
  )
}
lines.push('')

lines.push('-- Maaltijden')
for (const meal of SEED_MEALS) {
  lines.push(
    `insert into public.if_meals (code, name, description, eligible_slots, temperature, portability, digestion_speed, casein_dominant, prep_minutes, family, rationale, rationale_short) values` +
      ` (${q(meal.code)}, ${q(meal.name)}, ${q(meal.description)}, ${slotArr(meal.eligibleSlots)}, ${q(meal.temperature)}, ${q(meal.portability)}, ${q(meal.digestionSpeed)}, ${b(meal.caseinDominant)}, ${n(meal.prepMinutes)}, ${q(meal.family)}, ${q(meal.rationale)}, ${q(meal.rationaleShort)})` +
      `\n  on conflict (code) do update set name = excluded.name, description = excluded.description, eligible_slots = excluded.eligible_slots, temperature = excluded.temperature, portability = excluded.portability, digestion_speed = excluded.digestion_speed, casein_dominant = excluded.casein_dominant, prep_minutes = excluded.prep_minutes, family = excluded.family, rationale = excluded.rationale, rationale_short = excluded.rationale_short;`,
  )
}
lines.push('')

lines.push('-- Composities: per maaltijd eerst leegmaken, dan opnieuw opbouwen.')
lines.push('-- In de seed verwijst ingredientId naar de slug; hier vertaald via subselects.')
for (const meal of SEED_MEALS) {
  const mealSel = `(select id from public.if_meals where code = ${q(meal.code)})`
  lines.push(`delete from public.if_meal_ingredients where meal_id = ${mealSel};`)
  for (const mi of meal.ingredients) {
    lines.push(
      `insert into public.if_meal_ingredients (meal_id, ingredient_id, grams, role) values` +
        ` (${mealSel}, (select id from public.if_ingredients where slug = ${q(mi.ingredientId)}), ${n(mi.grams)}, ${q(mi.role)});`,
    )
  }
}
lines.push('')

const outFile = join(root, 'supabase', 'seed', 'if_nutrition_seed.sql')
writeFileSync(outFile, lines.join('\n'))
console.log(
  `Geschreven: ${outFile} (${SEED_INGREDIENTS.length} ingrediënten, ${SEED_MEALS.length} maaltijden)`,
)
