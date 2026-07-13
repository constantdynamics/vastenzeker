// Boodschappenlijst uit geplande maaltijden. Rekent met effectiveGrams zodat
// portie-flex én stil verwijderde optionals (§5) meteen kloppen: wat niet op
// het bord komt, hoort ook niet op de lijst.

import { excludedOptionalIds } from './engine'
import { effectiveGrams } from './macros'
import type { Ingredient, IngredientCategory, Meal, PreferenceState } from './types'
import { CATEGORY_ORDER, INGREDIENT_CATEGORY_LABELS } from './types'

export interface ShoppingItem {
  ingredient: Ingredient
  grams: number
}

export interface ShoppingGroup {
  category: IngredientCategory
  label: string
  items: ShoppingItem[]
}

export function buildShoppingList(
  entries: { meal: Meal; proteinScale: number }[],
  ingredientsById: Record<string, Ingredient>,
  prefs: PreferenceState,
): ShoppingGroup[] {
  const byIngredient = new Map<string, ShoppingItem>()
  for (const { meal, proteinScale } of entries) {
    const excluded = excludedOptionalIds(meal, prefs)
    for (const { ingredient, grams } of effectiveGrams(meal, ingredientsById, {
      proteinScale,
      excludeIngredientIds: excluded,
    })) {
      const existing = byIngredient.get(ingredient.id)
      if (existing) existing.grams += grams
      else byIngredient.set(ingredient.id, { ingredient, grams })
    }
  }

  const groups: ShoppingGroup[] = []
  for (const category of CATEGORY_ORDER) {
    const items = [...byIngredient.values()]
      .filter((it) => it.ingredient.category === category)
      // grootste hoeveelheid bovenaan; naam als tie-break voor determinisme
      .sort(
        (a, b) =>
          b.grams - a.grams ||
          (a.ingredient.name < b.ingredient.name ? -1 : a.ingredient.name > b.ingredient.name ? 1 : 0),
      )
    if (items.length === 0) continue
    groups.push({ category, label: INGREDIENT_CATEGORY_LABELS[category], items })
  }
  return groups
}
