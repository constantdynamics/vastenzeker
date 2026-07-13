// Domeintypes van de voedingsmodule. Pure types en constanten — geen imports
// uit browser- of Supabase-code, zodat de engine in Node-tests draait.

export type MealSlot = 'BREAK_FAST' | 'SNACK' | 'DINNER' | 'CLOSE'
export const ALL_SLOTS: MealSlot[] = ['BREAK_FAST', 'SNACK', 'DINNER', 'CLOSE']

export type DayType = 'FASTED_STRENGTH' | 'FED_STRENGTH' | 'CARDIO' | 'REST'

export type Temperature = 'cold' | 'warm' | 'either'
export type Portability = 'home_only' | 'portable' | 'on_the_go'
export type DigestionSpeed = 'fast' | 'medium' | 'slow'
export type IngredientRole = 'primary' | 'supporting' | 'optional'
export type IngredientCategory =
  | 'dairy'
  | 'nut'
  | 'grain'
  | 'protein'
  | 'fruit'
  | 'veg'
  | 'fat'
  | 'drink'
  | 'other'

export type MealPrefState = 'superlike' | 'like' | 'dislike'
export type IngredientPrefState = 'like' | 'dislike'
export type MealLogStatus = 'suggested' | 'eaten' | 'skipped' | 'swapped'

export interface NutritionProfile {
  weightKg: number
  goal: string
  proteinTargetG: number
  proteinFloorG: number
  kcalMin: number
  kcalMax: number
}

/** Mijn profiel (§1 van de spec). Hardcoded default; de rij in Supabase wint. */
export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  weightKg: 95,
  goal: 'recomp',
  proteinTargetG: 190,
  proteinFloorG: 170,
  kcalMin: 2200,
  kcalMax: 2400,
}

export interface Ingredient {
  /** In de app het numerieke Supabase-id als string; in seed/tests de slug. */
  id: string
  slug: string
  name: string
  kcal100: number
  protein100: number
  carb100: number
  fat100: number
  fiber100: number
  category: IngredientCategory
  isNut: boolean
  nutType: string | null
  /** Gewicht per stuk (ei, banaan, rijstwafel) voor weergave in stuks. */
  pieceGrams: number | null
  /** Pindakaas telt mee voor de 15 g/dag-cap. */
  isPeanutButter: boolean
  /** i-button op ingrediëntniveau; letterlijke spec-tekst waar gegeven. */
  rationale: string | null
  source: 'seed' | 'openfoodfacts' | 'custom'
  externalId: string | null
}

export interface MealIngredient {
  ingredientId: string
  grams: number
  role: IngredientRole
}

export interface Meal {
  id: string
  /** Stabiele code uit de spec (b01, s11, …) of eigen code voor aanvullingen. */
  code: string
  name: string
  description: string | null
  eligibleSlots: MealSlot[]
  temperature: Temperature
  portability: Portability
  digestionSpeed: DigestionSpeed
  caseinDominant: boolean
  prepMinutes: number
  /** Voor diversiteit in de alternatievenlijst (max 3 per family). */
  family: string
  /** Laag [2] van het i'tje. */
  rationale: string
  /** Eén regel, inline zichtbaar op de slotkaart. */
  rationaleShort: string
  ingredients: MealIngredient[]
}

export interface MacroTotals {
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
  fiberG: number
  /** Grammen hele noten (is_nut) — voor het notenbudget. */
  nutG: number
  /** Grammen pindakaas — voor de 15 g/dag-cap. */
  peanutButterG: number
}

export interface TrainingSession {
  type: 'strength' | 'cardio'
  startMin: number
  endMin: number
}

/** Afgeleide eisen per maaltijdslot (§4). */
export interface SlotSpec {
  slot: MealSlot
  timeMin: number
  requiresCold: boolean
  requiresPortable: boolean
  requiresFastDigestion: boolean
  requiresCasein: boolean
  /** null = geen limiet */
  maxFatG: number | null
  /** FED_STRENGTH-snack: weinig vet en vezels (zacht criterium in de score). */
  lowFatFiber: boolean
  proteinTargetG: [number, number]
}

export interface DayWindow {
  openMin: number
  closeMin: number
  /** false op een vrije of slechte-nacht-dag: geen vast, wel een eetplan. */
  fasting: boolean
  /** Vandaag gemarkeerd als "slechte nacht, niet vasten". */
  badNight: boolean
}

export interface DayContext {
  dateKey: string // 'YYYY-MM-DD'
  dayType: DayType
  window: DayWindow
  sessions: TrainingSession[]
  isTrainingDay: boolean
  /** 40 g op trainingsdagen, 30 g op rustdagen (§2 regel 3). */
  nutBudgetG: number
}

/** Voorkeuren als platte records zodat de engine puur blijft. */
export interface PreferenceState {
  /** key: `${mealId}|${slot}` */
  meal: Record<string, MealPrefState>
  /** key: ingredientId */
  ingredient: Record<string, IngredientPrefState>
}

export function mealPrefKey(mealId: string, slot: MealSlot): string {
  return `${mealId}|${slot}`
}

/** Serveerhistorie voor cooldown, novelty en de 4-dagen-uitsluiting. */
export interface ServeHistory {
  /** dagen geleden voor het laatst geserveerd (0 = vandaag); afwezig = nooit. */
  daysSinceServed: Record<string, number>
}

export interface PlannedSlot {
  slot: MealSlot
  spec: SlotSpec
  mealId: string
  /** Portie-flex: schaal van de eiwitcomponent, 0.75–1.25 (§6). */
  proteinScale: number
  pinned: boolean
  macros: MacroTotals
}

export interface DayPlanResult {
  dateKey: string
  dayType: DayType
  window: DayWindow
  slots: PlannedSlot[]
  totals: MacroTotals
  /** Niet-blokkerende signalen, bv. calorieband niet haalbaar met deze bibliotheek. */
  warnings: string[]
}

export interface Alternative {
  meal: Meal
  macros: MacroTotals
  score: number
  /** Nog nooit beoordeeld — krijgt het label "Nieuw voor jou". */
  novel: boolean
}

export const SLOT_LABELS: Record<MealSlot, string> = {
  BREAK_FAST: 'Lunch — vasten breken',
  SNACK: 'Eiwitmoment',
  DINNER: 'Diner',
  CLOSE: 'Venster sluiten',
}

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  FASTED_STRENGTH: 'Nuchtere krachtdag',
  FED_STRENGTH: 'Gevoede krachtdag',
  CARDIO: 'Cardiodag',
  REST: 'Rustdag',
}

export const CATEGORY_ORDER: IngredientCategory[] = [
  'dairy',
  'nut',
  'protein',
  'veg',
  'fruit',
  'grain',
  'fat',
  'drink',
  'other',
]

export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  dairy: 'Zuivel',
  nut: 'Noten',
  protein: 'Vlees, vis & eiwit',
  veg: 'Groente',
  fruit: 'Fruit',
  grain: 'Brood & granen',
  fat: 'Vetten & smeersels',
  drink: 'Dranken',
  other: 'Overig',
}
