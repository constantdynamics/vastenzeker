// Macro's van een maaltijd worden ALTIJD berekend uit compositie × ingrediënt
// (§9): nooit los opslaan, dan lopen ze uit de pas.

import type { Ingredient, MacroTotals, Meal, MealIngredient } from './types'

export const EMPTY_TOTALS: MacroTotals = {
  kcal: 0,
  proteinG: 0,
  carbG: 0,
  fatG: 0,
  fiberG: 0,
  nutG: 0,
  peanutButterG: 0,
}

export interface MacroOptions {
  /** Portie-flex: schaal van de eiwitcomponent, geklemd op 0.75–1.25. */
  proteinScale?: number
  /** Stil verwijderde optional-ingrediënten (dislike op ingrediëntniveau). */
  excludeIngredientIds?: ReadonlySet<string>
}

/**
 * De eiwitcomponent die met portie-flex meeschaalt: primaire ingrediënten die
 * echt eiwit leveren. Noten en pindakaas schalen bewust nooit mee — die zitten
 * aan een dagbudget vast (§2 regels 3 en 4).
 */
export function scalesWithProtein(ing: Ingredient, mi: MealIngredient): boolean {
  return mi.role === 'primary' && ing.protein100 >= 8 && !ing.isNut && !ing.isPeanutButter
}

export function clampProteinScale(scale: number): number {
  return Math.min(1.25, Math.max(0.75, scale))
}

/** Effectieve grammen per ingrediënt, na portie-flex en stille verwijdering. */
export function effectiveGrams(
  meal: Meal,
  ingredientsById: Record<string, Ingredient>,
  opts: MacroOptions = {},
): { ingredient: Ingredient; grams: number; role: MealIngredient['role'] }[] {
  const scale = clampProteinScale(opts.proteinScale ?? 1)
  const out: { ingredient: Ingredient; grams: number; role: MealIngredient['role'] }[] = []
  for (const mi of meal.ingredients) {
    if (opts.excludeIngredientIds?.has(mi.ingredientId)) continue
    const ing = ingredientsById[mi.ingredientId]
    if (!ing) continue
    const grams = scalesWithProtein(ing, mi) ? mi.grams * scale : mi.grams
    out.push({ ingredient: ing, grams, role: mi.role })
  }
  return out
}

export function computeMealMacros(
  meal: Meal,
  ingredientsById: Record<string, Ingredient>,
  opts: MacroOptions = {},
): MacroTotals {
  const totals = { ...EMPTY_TOTALS }
  for (const { ingredient: ing, grams } of effectiveGrams(meal, ingredientsById, opts)) {
    const f = grams / 100
    totals.kcal += ing.kcal100 * f
    totals.proteinG += ing.protein100 * f
    totals.carbG += ing.carb100 * f
    totals.fatG += ing.fat100 * f
    totals.fiberG += ing.fiber100 * f
    if (ing.isNut) totals.nutG += grams
    if (ing.isPeanutButter) totals.peanutButterG += grams
  }
  return totals
}

export function sumTotals(parts: MacroTotals[]): MacroTotals {
  const totals = { ...EMPTY_TOTALS }
  for (const p of parts) {
    totals.kcal += p.kcal
    totals.proteinG += p.proteinG
    totals.carbG += p.carbG
    totals.fatG += p.fatG
    totals.fiberG += p.fiberG
    totals.nutG += p.nutG
    totals.peanutButterG += p.peanutButterG
  }
  return totals
}

/** Weergave: "500 g magere kwark" of "2 eieren (110 g)". */
export function formatIngredientAmount(ing: Ingredient, grams: number): string {
  if (ing.pieceGrams && ing.pieceGrams > 0) {
    const pieces = grams / ing.pieceGrams
    const rounded = Math.round(pieces * 2) / 2 // halve stuks zijn nog uitlegbaar
    if (rounded >= 1) {
      const n = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',')
      return `${n} × ${ing.name} (${Math.round(grams)} g)`
    }
  }
  return `${Math.round(grams)} g ${ing.name}`
}
