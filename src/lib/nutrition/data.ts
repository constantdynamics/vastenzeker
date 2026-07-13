// Datalaag van de voedingsmodule: Supabase in/uit, met localStorage-cache en
// seed-fallback (zelfde patroon als tips.ts) zodat de app offline blijft werken.
// Geen React hier; alle logica die de engine nodig heeft blijft puur.

import { supabase } from '../supabase'
import { SEED_INGREDIENTS, SEED_MEALS } from './seedData'
import {
  DEFAULT_NUTRITION_PROFILE,
  mealPrefKey,
  type DayPlanResult,
  type DayType,
  type Ingredient,
  type IngredientCategory,
  type IngredientPrefState,
  type Meal,
  type MealLogStatus,
  type MealPrefState,
  type MealSlot,
  type NutritionProfile,
  type PreferenceState,
  type ServeHistory,
} from './types'

const CONTENT_CACHE_KEY = 'vz_nutrition_content_v1'

// -- Rijvormen zoals ze uit Supabase komen (snake_case) --------------------

interface IngredientRow {
  id: number
  slug: string
  name: string
  kcal_100g: number
  protein_100g: number
  carb_100g: number
  fat_100g: number
  fiber_100g: number
  category: IngredientCategory
  is_nut: boolean
  nut_type: string | null
  piece_grams: number | null
  is_peanut_butter: boolean
  rationale: string | null
  source: 'seed' | 'openfoodfacts' | 'custom'
  external_id: string | null
}

interface MealRow {
  id: number
  code: string
  name: string
  description: string | null
  eligible_slots: MealSlot[]
  temperature: Meal['temperature']
  portability: Meal['portability']
  digestion_speed: Meal['digestionSpeed']
  casein_dominant: boolean
  prep_minutes: number
  family: string
  rationale: string
  rationale_short: string
}

interface MealIngredientRow {
  meal_id: number
  ingredient_id: number
  grams: number
  role: 'primary' | 'supporting' | 'optional'
}

export interface MealLogRow {
  id: string
  day: string // 'YYYY-MM-DD'
  slot: MealSlot
  meal_id: number
  status: MealLogStatus
  actual_grams: Record<string, number> | null
}

function mapIngredient(row: IngredientRow): Ingredient {
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    kcal100: Number(row.kcal_100g),
    protein100: Number(row.protein_100g),
    carb100: Number(row.carb_100g),
    fat100: Number(row.fat_100g),
    fiber100: Number(row.fiber_100g),
    category: row.category,
    isNut: row.is_nut,
    nutType: row.nut_type,
    pieceGrams: row.piece_grams === null ? null : Number(row.piece_grams),
    isPeanutButter: row.is_peanut_butter,
    rationale: row.rationale,
    source: row.source,
    externalId: row.external_id,
  }
}

function mapMeal(row: MealRow, links: MealIngredientRow[]): Meal {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    eligibleSlots: row.eligible_slots,
    temperature: row.temperature,
    portability: row.portability,
    digestionSpeed: row.digestion_speed,
    caseinDominant: row.casein_dominant,
    prepMinutes: row.prep_minutes,
    family: row.family,
    rationale: row.rationale,
    rationaleShort: row.rationale_short,
    ingredients: links
      .filter((l) => l.meal_id === row.id)
      .map((l) => ({
        ingredientId: String(l.ingredient_id),
        grams: Number(l.grams),
        role: l.role,
      })),
  }
}

export interface NutritionContent {
  ingredients: Ingredient[]
  meals: Meal[]
}

/**
 * Laadt de gedeelde content (ingrediënten + maaltijden + compositie).
 * Volgorde bij problemen: verse data → localStorage-cache → TypeScript-seed,
 * zodat de engine altijd een bibliotheek heeft.
 */
export async function loadNutritionContent(): Promise<NutritionContent> {
  try {
    const [ings, meals, links] = await Promise.all([
      supabase.from('if_ingredients').select('*').order('id'),
      supabase.from('if_meals').select('*').order('id'),
      supabase.from('if_meal_ingredients').select('*'),
    ])
    if (ings.error || meals.error || links.error) throw ings.error ?? meals.error ?? links.error
    if (ings.data && ings.data.length > 0 && meals.data && meals.data.length > 0) {
      const linkRows = (links.data ?? []) as MealIngredientRow[]
      const content: NutritionContent = {
        ingredients: (ings.data as IngredientRow[]).map(mapIngredient),
        meals: (meals.data as MealRow[]).map((m) => mapMeal(m, linkRows)),
      }
      localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(content))
      return content
    }
  } catch {
    // offline of fout: val terug op cache of seed
  }
  try {
    const cached = localStorage.getItem(CONTENT_CACHE_KEY)
    if (cached) return JSON.parse(cached) as NutritionContent
  } catch {
    // corrupte cache: negeer, seed is er altijd nog
  }
  return { ingredients: SEED_INGREDIENTS, meals: SEED_MEALS }
}

// -- Profiel ----------------------------------------------------------------

interface ProfileRow {
  weight_kg: number
  goal: string
  protein_target_g: number
  protein_floor_g: number
  kcal_min: number
  kcal_max: number
}

export async function loadNutritionProfile(userId: string): Promise<NutritionProfile> {
  try {
    const { data, error } = await supabase
      .from('if_nutrition_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (data) {
      const row = data as ProfileRow
      return {
        weightKg: Number(row.weight_kg),
        goal: row.goal,
        proteinTargetG: row.protein_target_g,
        proteinFloorG: row.protein_floor_g,
        kcalMin: row.kcal_min,
        kcalMax: row.kcal_max,
      }
    }
    // Nog geen rij: zet de defaults klaar zodat latere edits ergens landen.
    const d = DEFAULT_NUTRITION_PROFILE
    await supabase.from('if_nutrition_profiles').upsert({
      user_id: userId,
      weight_kg: d.weightKg,
      goal: d.goal,
      protein_target_g: d.proteinTargetG,
      protein_floor_g: d.proteinFloorG,
      kcal_min: d.kcalMin,
      kcal_max: d.kcalMax,
    })
  } catch {
    // offline: defaults zijn prima
  }
  return { ...DEFAULT_NUTRITION_PROFILE }
}

// -- Voorkeuren ---------------------------------------------------------------

export async function loadPreferences(userId: string): Promise<PreferenceState> {
  const prefs: PreferenceState = { meal: {}, ingredient: {} }
  try {
    const [meals, ings] = await Promise.all([
      supabase.from('if_meal_preferences').select('meal_id, slot, state').eq('user_id', userId),
      supabase
        .from('if_ingredient_preferences')
        .select('ingredient_id, state')
        .eq('user_id', userId),
    ])
    for (const row of (meals.data ?? []) as { meal_id: number; slot: MealSlot; state: MealPrefState }[]) {
      prefs.meal[mealPrefKey(String(row.meal_id), row.slot)] = row.state
    }
    for (const row of (ings.data ?? []) as { ingredient_id: number; state: IngredientPrefState }[]) {
      prefs.ingredient[String(row.ingredient_id)] = row.state
    }
  } catch {
    // offline: lege voorkeuren, de engine kan zonder
  }
  return prefs
}

export async function setMealPreference(
  userId: string,
  mealId: string,
  slot: MealSlot,
  state: MealPrefState | null,
): Promise<void> {
  try {
    if (state === null) {
      await supabase
        .from('if_meal_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('meal_id', Number(mealId))
        .eq('slot', slot)
    } else {
      await supabase.from('if_meal_preferences').upsert({
        user_id: userId,
        meal_id: Number(mealId),
        slot,
        state,
        updated_at: new Date().toISOString(),
      })
    }
  } catch {
    // offline: voorkeur gaat verloren, niet fataal
  }
}

export async function setIngredientPreference(
  userId: string,
  ingredientId: string,
  state: IngredientPrefState | null,
): Promise<void> {
  try {
    if (state === null) {
      await supabase
        .from('if_ingredient_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('ingredient_id', Number(ingredientId))
    } else {
      await supabase.from('if_ingredient_preferences').upsert({
        user_id: userId,
        ingredient_id: Number(ingredientId),
        state,
        updated_at: new Date().toISOString(),
      })
    }
  } catch {
    // offline: idem
  }
}

// -- Maaltijdlog ---------------------------------------------------------------

export async function loadMealLog(
  userId: string,
  fromDay: string,
  toDay: string,
): Promise<MealLogRow[]> {
  try {
    const { data, error } = await supabase
      .from('if_meal_log')
      .select('id, day, slot, meal_id, status, actual_grams')
      .eq('user_id', userId)
      .gte('day', fromDay)
      .lte('day', toDay)
      .order('day')
    if (error) throw error
    return (data ?? []) as MealLogRow[]
  } catch {
    return []
  }
}

/** Dagen tussen twee 'YYYY-MM-DD'-sleutels; UTC zodat zomertijd niet stoort. */
function daysBetween(fromKey: string, toKey: string): number {
  const parse = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000)
}

/**
 * Serveerhistorie voor cooldown/novelty: kleinste afstand in dagen per maaltijd.
 * Elke logstatus telt als "geserveerd" — ook geskipt of geruild betekent dat
 * de maaltijd recent op tafel lag.
 */
export function buildServeHistory(rows: MealLogRow[], todayKey: string): ServeHistory {
  const daysSinceServed: Record<string, number> = {}
  for (const row of rows) {
    const mealId = String(row.meal_id)
    const days = daysBetween(row.day, todayKey)
    if (days < 0) continue // toekomstige planrijen tellen niet als historie
    const prev = daysSinceServed[mealId]
    if (prev === undefined || days < prev) daysSinceServed[mealId] = days
  }
  return { daysSinceServed }
}

export async function upsertMealLog(
  userId: string,
  day: string,
  slot: MealSlot,
  mealId: string,
  status: MealLogStatus,
  actualGrams?: Record<string, number>,
): Promise<void> {
  try {
    await supabase.from('if_meal_log').upsert(
      {
        user_id: userId,
        day,
        slot,
        meal_id: Number(mealId),
        status,
        actual_grams: actualGrams ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,day,slot' },
    )
  } catch {
    // offline: log ontbreekt dan, geen crash
  }
}

// -- Dagplannen ---------------------------------------------------------------

export interface StoredDayPlan {
  day: string
  dayType: DayType
  slots: Record<MealSlot, { mealId: string; proteinScale: number; pinned: boolean; timeMin: number }>
  locked: boolean
}

interface DayPlanRow {
  day: string
  day_type: DayType
  slots: Record<string, { meal_id: number; protein_scale: number; pinned: boolean; time_min: number }>
  locked: boolean
}

function mapDayPlan(row: DayPlanRow): StoredDayPlan {
  const slots = {} as StoredDayPlan['slots']
  for (const [slot, s] of Object.entries(row.slots)) {
    slots[slot as MealSlot] = {
      mealId: String(s.meal_id),
      proteinScale: s.protein_scale,
      pinned: s.pinned,
      timeMin: s.time_min,
    }
  }
  return { day: row.day, dayType: row.day_type, slots, locked: row.locked }
}

export async function loadDayPlans(
  userId: string,
  fromDay: string,
  toDay: string,
): Promise<StoredDayPlan[]> {
  try {
    const { data, error } = await supabase
      .from('if_day_plans')
      .select('day, day_type, slots, locked')
      .eq('user_id', userId)
      .gte('day', fromDay)
      .lte('day', toDay)
      .order('day')
    if (error) throw error
    return ((data ?? []) as DayPlanRow[]).map(mapDayPlan)
  } catch {
    return []
  }
}

export async function saveDayPlan(userId: string, plan: DayPlanResult): Promise<void> {
  const slots: Record<string, { meal_id: number; protein_scale: number; pinned: boolean; time_min: number }> = {}
  for (const s of plan.slots) {
    slots[s.slot] = {
      meal_id: Number(s.mealId),
      protein_scale: s.proteinScale,
      pinned: s.pinned,
      time_min: s.spec.timeMin,
    }
  }
  try {
    await supabase.from('if_day_plans').upsert(
      {
        user_id: userId,
        day: plan.dateKey,
        day_type: plan.dayType,
        slots,
        generated_at: new Date().toISOString(),
        locked: false,
      },
      { onConflict: 'user_id,day' },
    )
  } catch {
    // offline: plan blijft dan alleen in het geheugen van de sessie
  }
}

export async function deleteDayPlan(userId: string, day: string): Promise<void> {
  try {
    await supabase.from('if_day_plans').delete().eq('user_id', userId).eq('day', day)
  } catch {
    // offline: negeer
  }
}

// -- Open Food Facts ------------------------------------------------------------

export interface OffCandidate {
  externalId: string
  name: string
  kcal100: number
  protein100: number
  carb100: number
  fat100: number
  fiber100: number
}

interface OffProduct {
  code?: string
  product_name?: string
  product_name_nl?: string
  brands?: string
  nutriments?: Record<string, number | string>
}

/** Zoekt in Open Food Facts; producten zonder kcal of eiwit zijn onbruikbaar en vallen af. */
export async function searchOpenFoodFacts(query: string): Promise<OffCandidate[]> {
  try {
    const url =
      'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' +
      encodeURIComponent(query) +
      '&search_simple=1&action=process&json=1&page_size=20' +
      '&fields=code,product_name,product_name_nl,brands,nutriments'
    const res = await fetch(url)
    if (!res.ok) return []
    const body = (await res.json()) as { products?: OffProduct[] }
    const out: OffCandidate[] = []
    for (const p of body.products ?? []) {
      const nut = p.nutriments ?? {}
      const num = (key: string): number | null => {
        const v = nut[key]
        const parsed = typeof v === 'string' ? Number(v) : v
        return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
      }
      const kcal = num('energy-kcal_100g')
      const protein = num('proteins_100g')
      if (!p.code || kcal === null || protein === null) continue
      const baseName = p.product_name_nl || p.product_name
      if (!baseName) continue
      out.push({
        externalId: p.code,
        name: p.brands ? `${baseName} (${p.brands})` : baseName,
        kcal100: kcal,
        protein100: protein,
        carb100: num('carbohydrates_100g') ?? 0,
        fat100: num('fat_100g') ?? 0,
        fiber100: num('fiber_100g') ?? 0,
      })
    }
    return out
  } catch {
    return []
  }
}

export async function addIngredientFromOff(
  userId: string,
  candidate: OffCandidate,
  category: IngredientCategory,
): Promise<Ingredient | null> {
  try {
    const { data, error } = await supabase
      .from('if_ingredients')
      .insert({
        slug: `off-${candidate.externalId}`,
        name: candidate.name,
        kcal_100g: candidate.kcal100,
        protein_100g: candidate.protein100,
        carb_100g: candidate.carb100,
        fat_100g: candidate.fat100,
        fiber_100g: candidate.fiber100,
        category,
        source: 'openfoodfacts',
        external_id: candidate.externalId,
        created_by: userId,
      })
      .select('*')
      .single()
    if (error || !data) return null
    return mapIngredient(data as IngredientRow)
  } catch {
    return null
  }
}
