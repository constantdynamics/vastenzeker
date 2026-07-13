// Centrale React-laag van de voedingsmodule: laadt content/voorkeuren/logs,
// draait de engine en stelt acties beschikbaar aan de subviews via context.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAppData } from '../../App'
import { dateKey } from '../../lib/time'
import {
  addIngredientFromOff,
  buildServeHistory,
  deleteDayPlan,
  loadDayPlans,
  loadMealLog,
  loadNutritionContent,
  loadNutritionProfile,
  loadPreferences,
  saveDayPlan,
  setIngredientPreference,
  setMealPreference,
  upsertMealLog,
  type MealLogRow,
  type OffCandidate,
  type StoredDayPlan,
} from '../../lib/nutrition/data'
import { dayContextFor, deriveSlots } from '../../lib/nutrition/daytype'
import {
  dayIndexFromDateKey,
  generateDayPlan,
  hashStringToSeed,
  mulberry32,
  refitDayPlan,
} from '../../lib/nutrition/engine'
import { effectiveGrams } from '../../lib/nutrition/macros'
import {
  DEFAULT_NUTRITION_PROFILE,
  type DayContext,
  type DayPlanResult,
  type Ingredient,
  type IngredientCategory,
  type IngredientPrefState,
  type Meal,
  type MealPrefState,
  type MealSlot,
  type NutritionProfile,
  type PreferenceState,
  type ServeHistory,
  type SlotSpec,
} from '../../lib/nutrition/types'

export interface NutritionData {
  loading: boolean
  ingredients: Ingredient[]
  meals: Meal[]
  ingredientsById: Record<string, Ingredient>
  mealsById: Record<string, Meal>
  nutritionProfile: NutritionProfile
  prefs: PreferenceState
  logs: MealLogRow[]
  plans: StoredDayPlan[]
  /** Historie t.o.v. vandaag (voor scores in alternatievenlijsten). */
  history: ServeHistory

  contextFor(date: Date): DayContext
  slotsFor(ctx: DayContext): SlotSpec[]
  planFor(dk: string): StoredDayPlan | undefined
  logsFor(dk: string): MealLogRow[]
  /** Opgeslagen plan → levend DayPlanResult (macro's, totalen, warnings). */
  planResultFor(date: Date): DayPlanResult | null
  /** Historie zoals de engine hem voor deze datum hoort te zien (incl. omliggende plannen). */
  historyFor(dk: string): ServeHistory

  ensurePlan(date: Date): Promise<void>
  regenerate(date: Date): Promise<void>
  generateWeek(dates: Date[]): Promise<void>
  swapMeal(date: Date, slot: MealSlot, mealId: string): Promise<void>
  setEaten(date: Date, slot: MealSlot, mealId: string, eaten: boolean): Promise<void>
  rateMeal(mealId: string, slot: MealSlot, state: MealPrefState | null): Promise<void>
  rateIngredient(ingredientId: string, state: IngredientPrefState | null): Promise<void>
  addOffIngredient(c: OffCandidate, category: IngredientCategory): Promise<Ingredient | null>
  refresh(): Promise<void>
}

const NutritionContext = createContext<NutritionData | null>(null)

export function useNutritionData(): NutritionData {
  const ctx = useContext(NutritionContext)
  if (!ctx) throw new Error('useNutritionData buiten provider')
  return ctx
}

export { NutritionContext }

function addDays(d: Date, days: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + days)
  return c
}

export function useNutrition(): NutritionData {
  const { userId, profile, schedule, fasts } = useAppData()

  const [loading, setLoading] = useState(true)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [nutritionProfile, setNutritionProfile] = useState<NutritionProfile>(
    DEFAULT_NUTRITION_PROFILE,
  )
  const [prefs, setPrefs] = useState<PreferenceState>({ meal: {}, ingredient: {} })
  const [logs, setLogs] = useState<MealLogRow[]>([])
  const [plans, setPlans] = useState<StoredDayPlan[]>([])

  const refresh = useCallback(async () => {
    const today = new Date()
    const [content, nProfile, p, logRows, planRows] = await Promise.all([
      loadNutritionContent(),
      loadNutritionProfile(userId),
      loadPreferences(userId),
      loadMealLog(userId, dateKey(addDays(today, -30)), dateKey(addDays(today, 14))),
      loadDayPlans(userId, dateKey(addDays(today, -1)), dateKey(addDays(today, 14))),
    ])
    setIngredients(content.ingredients)
    setMeals(content.meals)
    setNutritionProfile(nProfile)
    setPrefs(p)
    setLogs(logRows)
    setPlans(planRows)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const ingredientsById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const i of ingredients) map[i.id] = i
    return map
  }, [ingredients])

  const mealsById = useMemo(() => {
    const map: Record<string, Meal> = {}
    for (const m of meals) map[m.id] = m
    return map
  }, [meals])

  const history = useMemo(() => buildServeHistory(logs, dateKey(new Date())), [logs])

  const contextFor = useCallback(
    (date: Date) => {
      const fastRow = fasts.find((f) => f.day === dateKey(date))
      return dayContextFor(date, profile, schedule, fastRow)
    },
    [fasts, profile, schedule],
  )

  const slotsFor = useCallback(
    (ctx: DayContext) => deriveSlots(ctx.dayType, ctx.window, ctx.sessions),
    [],
  )

  const planFor = useCallback((dk: string) => plans.find((p) => p.day === dk), [plans])
  const logsFor = useCallback((dk: string) => logs.filter((l) => l.day === dk), [logs])

  /**
   * Historie voor een specifieke datum: logs plus de geplande maaltijden van
   * omliggende dagen. Zo werkt de 4-dagen-cooldown ook vooruit bij het
   * genereren van een hele week (niet drie keer dezelfde kwarkbak plannen).
   */
  const historyForPlans = useCallback(
    (dk: string, extraPlans: StoredDayPlan[]): ServeHistory => {
      const base = buildServeHistory(logs, dk)
      const daysSinceServed = { ...base.daysSinceServed }
      const dayIdx = dayIndexFromDateKey(dk)
      for (const plan of extraPlans) {
        if (plan.day === dk) continue
        const dist = Math.abs(dayIdx - dayIndexFromDateKey(plan.day))
        for (const s of Object.values(plan.slots)) {
          const prev = daysSinceServed[s.mealId]
          if (prev === undefined || dist < prev) daysSinceServed[s.mealId] = dist
        }
      }
      return { daysSinceServed }
    },
    [logs],
  )

  const historyFor = useCallback(
    (dk: string) => historyForPlans(dk, plans),
    [historyForPlans, plans],
  )

  const buildPlan = useCallback(
    (date: Date, seedSuffix: string, allPlans: StoredDayPlan[]): DayPlanResult => {
      const ctx = contextFor(date)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      const dk = ctx.dateKey
      // Gegeten slots liggen vast: regenereren mag een gegeten maaltijd niet wegtoveren.
      const eaten = logs.filter((l) => l.day === dk && l.status === 'eaten')
      const stored = allPlans.find((p) => p.day === dk)
      const lockedSlots: Partial<Record<MealSlot, { mealId: string; proteinScale: number }>> = {}
      for (const row of eaten) {
        lockedSlots[row.slot] = {
          mealId: String(row.meal_id),
          proteinScale: stored?.slots[row.slot]?.proteinScale ?? 1,
        }
      }
      return generateDayPlan({
        ctx,
        slots,
        meals,
        ingredientsById,
        profile: nutritionProfile,
        prefs,
        history: historyForPlans(dk, allPlans),
        rng: mulberry32(hashStringToSeed(dk + seedSuffix)),
        lockedSlots,
      })
    },
    [contextFor, historyForPlans, ingredientsById, logs, meals, nutritionProfile, prefs],
  )

  const persistPlan = useCallback(
    async (result: DayPlanResult): Promise<StoredDayPlan> => {
      await saveDayPlan(userId, result)
      const storedSlots = {} as StoredDayPlan['slots']
      for (const s of result.slots) {
        storedSlots[s.slot] = {
          mealId: s.mealId,
          proteinScale: s.proteinScale,
          pinned: s.pinned,
          timeMin: s.spec.timeMin,
        }
        // 'suggested' markeert de maaltijd als geserveerd (cooldown/novelty);
        // een al gegeten slot niet overschrijven.
        const existing = logs.find(
          (l) => l.day === result.dateKey && l.slot === s.slot && l.status === 'eaten',
        )
        if (!existing) await upsertMealLog(userId, result.dateKey, s.slot, s.mealId, 'suggested')
      }
      const plan: StoredDayPlan = {
        day: result.dateKey,
        dayType: result.dayType,
        slots: storedSlots,
        locked: false,
      }
      setPlans((prev) => [...prev.filter((p) => p.day !== plan.day), plan])
      setLogs((prev) => {
        const keep = prev.filter(
          (l) => l.day !== result.dateKey || l.status === 'eaten',
        )
        const fresh = result.slots
          .filter((s) => !keep.some((l) => l.day === result.dateKey && l.slot === s.slot))
          .map((s) => ({
            id: `local-${result.dateKey}-${s.slot}`,
            day: result.dateKey,
            slot: s.slot,
            meal_id: Number(s.mealId),
            status: 'suggested' as const,
            actual_grams: null,
          }))
        return [...keep, ...fresh]
      })
      return plan
    },
    [logs, userId],
  )

  const ensurePlan = useCallback(
    async (date: Date) => {
      if (loading || meals.length === 0) return
      const dk = dateKey(date)
      if (plans.some((p) => p.day === dk)) return
      await persistPlan(buildPlan(date, '', plans))
    },
    [buildPlan, loading, meals.length, persistPlan, plans],
  )

  const regenerate = useCallback(
    async (date: Date) => {
      const dk = dateKey(date)
      await deleteDayPlan(userId, dk)
      // Nieuwe seed per regeneratie: anders krijg je exact hetzelfde plan terug.
      await persistPlan(buildPlan(date, `:${Date.now()}`, plans.filter((p) => p.day !== dk)))
    },
    [buildPlan, persistPlan, plans, userId],
  )

  const generateWeek = useCallback(
    async (dates: Date[]) => {
      let working = [...plans]
      for (const date of dates) {
        const dk = dateKey(date)
        if (working.some((p) => p.day === dk)) continue
        const result = buildPlan(date, '', working)
        const plan = await persistPlan(result)
        working = [...working.filter((p) => p.day !== dk), plan]
      }
    },
    [buildPlan, persistPlan, plans],
  )

  const planResultFor = useCallback(
    (date: Date): DayPlanResult | null => {
      const dk = dateKey(date)
      const stored = plans.find((p) => p.day === dk)
      if (!stored || meals.length === 0) return null
      const ctx = contextFor(date)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      const eaten = new Set(
        logs.filter((l) => l.day === dk && l.status === 'eaten').map((l) => l.slot),
      )
      const chosen: Partial<
        Record<MealSlot, { mealId: string; locked?: boolean; pinned?: boolean; proteinScale?: number }>
      > = {}
      for (const [slot, s] of Object.entries(stored.slots)) {
        chosen[slot as MealSlot] = {
          mealId: s.mealId,
          locked: eaten.has(slot as MealSlot),
          pinned: s.pinned,
          proteinScale: s.proteinScale,
        }
      }
      return refitDayPlan(
        { ctx, slots, meals, ingredientsById, profile: nutritionProfile, prefs },
        chosen,
      )
    },
    [contextFor, ingredientsById, logs, meals, nutritionProfile, plans, prefs],
  )

  const swapMeal = useCallback(
    async (date: Date, slot: MealSlot, mealId: string) => {
      const dk = dateKey(date)
      const stored = plans.find((p) => p.day === dk)
      if (!stored) return
      const next: StoredDayPlan = {
        ...stored,
        slots: {
          ...stored.slots,
          [slot]: { ...stored.slots[slot], mealId, pinned: false, proteinScale: 1 },
        },
      }
      setPlans((prev) => [...prev.filter((p) => p.day !== dk), next])
      setLogs((prev) => [
        ...prev.filter((l) => !(l.day === dk && l.slot === slot)),
        {
          id: `local-${dk}-${slot}`,
          day: dk,
          slot,
          meal_id: Number(mealId),
          status: 'swapped',
          actual_grams: null,
        },
      ])
      // Persisteren via het herrekende resultaat, zodat de schaal ook in de DB klopt.
      const ctx = contextFor(date)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      const chosen: Partial<
        Record<MealSlot, { mealId: string; locked?: boolean; pinned?: boolean; proteinScale?: number }>
      > = {}
      const eaten = new Set(
        logs.filter((l) => l.day === dk && l.status === 'eaten').map((l) => l.slot),
      )
      for (const [sl, s] of Object.entries(next.slots)) {
        chosen[sl as MealSlot] = {
          mealId: s.mealId,
          locked: eaten.has(sl as MealSlot),
          pinned: s.pinned,
          proteinScale: s.proteinScale,
        }
      }
      const refit = refitDayPlan(
        { ctx, slots, meals, ingredientsById, profile: nutritionProfile, prefs },
        chosen,
      )
      await saveDayPlan(userId, refit)
      await upsertMealLog(userId, dk, slot, mealId, 'swapped')
    },
    [contextFor, ingredientsById, logs, meals, nutritionProfile, plans, prefs, userId],
  )

  const setEaten = useCallback(
    async (date: Date, slot: MealSlot, mealId: string, eaten: boolean) => {
      const dk = dateKey(date)
      const status = eaten ? 'eaten' : 'suggested'
      let actualGrams: Record<string, number> | undefined
      if (eaten) {
        const meal = mealsById[mealId]
        const stored = plans.find((p) => p.day === dk)
        if (meal) {
          actualGrams = {}
          for (const row of effectiveGrams(meal, ingredientsById, {
            proteinScale: stored?.slots[slot]?.proteinScale ?? 1,
          })) {
            actualGrams[row.ingredient.slug] = Math.round(row.grams)
          }
        }
      }
      setLogs((prev) => [
        ...prev.filter((l) => !(l.day === dk && l.slot === slot)),
        {
          id: `local-${dk}-${slot}`,
          day: dk,
          slot,
          meal_id: Number(mealId),
          status,
          actual_grams: actualGrams ?? null,
        },
      ])
      await upsertMealLog(userId, dk, slot, mealId, status, actualGrams)
    },
    [ingredientsById, mealsById, plans, userId],
  )

  const rateMeal = useCallback(
    async (mealId: string, slot: MealSlot, state: MealPrefState | null) => {
      setPrefs((prev) => {
        const meal = { ...prev.meal }
        const key = `${mealId}|${slot}`
        if (state === null) delete meal[key]
        else meal[key] = state
        return { ...prev, meal }
      })
      await setMealPreference(userId, mealId, slot, state)
    },
    [userId],
  )

  const rateIngredient = useCallback(
    async (ingredientId: string, state: IngredientPrefState | null) => {
      setPrefs((prev) => {
        const ingredient = { ...prev.ingredient }
        if (state === null) delete ingredient[ingredientId]
        else ingredient[ingredientId] = state
        return { ...prev, ingredient }
      })
      await setIngredientPreference(userId, ingredientId, state)
    },
    [userId],
  )

  const addOffIngredient = useCallback(
    async (c: OffCandidate, category: IngredientCategory) => {
      const added = await addIngredientFromOff(userId, c, category)
      if (added) setIngredients((prev) => [...prev, added])
      return added
    },
    [userId],
  )

  return {
    loading,
    ingredients,
    meals,
    ingredientsById,
    mealsById,
    nutritionProfile,
    prefs,
    logs,
    plans,
    history,
    contextFor,
    slotsFor,
    planFor,
    logsFor,
    planResultFor,
    historyFor,
    ensurePlan,
    regenerate,
    generateWeek,
    swapMeal,
    setEaten,
    rateMeal,
    rateIngredient,
    addOffIngredient,
    refresh,
  }
}
