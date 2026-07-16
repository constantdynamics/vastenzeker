// Dev-harness (harness.html): rendert de belangrijkste schermen met nepdata,
// zonder Supabase-login. Alleen voor lokaal ontwerpen en screenshotten — dit
// bestand zit niet in de productie-build (vite bundelt alleen index.html).

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { DataContext, type AppData } from '../App'
import Home from '../views/Home'
import DayView from '../views/nutrition/DayView'
import WeekView from '../views/nutrition/WeekView'
import ShoppingView from '../views/nutrition/ShoppingView'
import IngredientsView from '../views/nutrition/IngredientsView'
import { NutritionContext, type NutritionData } from '../views/nutrition/useNutrition'
import { buildServeHistory, type MealLogRow, type StoredDayPlan } from '../lib/nutrition/data'
import { dayContextFor, deriveSlots } from '../lib/nutrition/daytype'
import {
  dayIndexFromDateKey,
  generateDayPlan,
  hashStringToSeed,
  mulberry32,
  refitDayPlan,
} from '../lib/nutrition/engine'
import { SEED_INGREDIENTS, SEED_MEALS, seedIngredientsById } from '../lib/nutrition/seedData'
import {
  DEFAULT_NUTRITION_PROFILE,
  type DayPlanResult,
  type MealSlot,
  type PreferenceState,
  type ServeHistory,
} from '../lib/nutrition/types'
import { dateKey } from '../lib/time'
import type { FastDay, Profile, ScheduleDay, Tip } from '../lib/types'
import '../styles.css'
import '../views/nutrition/nutrition.css'
import '../views/nutrition/nutrition-plan.css'

// ---------- Nep-basisdata ----------

const USER = 'harness-user'

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3600_000)
}

function makeProfile(windowStart: string, windowEnd: string): Profile {
  return {
    user_id: USER,
    display_name: 'Test',
    experience: 'some',
    goal: 'weight',
    family: 'partner',
    work_rhythm: 'home',
    medical_flags: [],
    medical_ack: false,
    disclaimer_accepted_at: '2026-01-01T00:00:00Z',
    onboarded_at: '2026-01-01T00:00:00Z',
    protocol: '16:8',
    window_start: windowStart,
    window_end: windowEnd,
    buildup_weeks: 0,
  }
}

// 0 = maandag. Trainingsschema uit de spec: ma cardio, di kracht (ochtend,
// nuchter), vr kracht (middag).
const SCHEDULE: ScheduleDay[] = Array.from({ length: 7 }, (_, weekday) => {
  const base: ScheduleDay = {
    user_id: USER,
    weekday,
    fasting: true,
    window_start: null,
    window_end: null,
    sport_type: null,
    sport_time: null,
    sport_end_time: null,
  }
  if (weekday === 0)
    return { ...base, sport_type: 'endurance' as const, sport_time: '15:30:00', sport_end_time: '16:15:00' }
  if (weekday === 1)
    return { ...base, sport_type: 'strength' as const, sport_time: '10:00:00', sport_end_time: '12:00:00' }
  if (weekday === 4)
    return { ...base, sport_type: 'strength' as const, sport_time: '15:30:00', sport_end_time: '17:00:00' }
  return base
})

const FAKE_TIPS: Tip[] = [
  {
    id: 1,
    slug: 'harness-koffie',
    category: 'praktisch',
    title: 'Zwarte koffie mag',
    body: 'Zwarte koffie en thee zonder melk of suiker breken je vast niet. Sterker: cafeïne dempt het hongergevoel in de ochtend een beetje.',
    phases: ['any'],
    sport_day: null,
    heavy: false,
    action: 'Zet je kopje zonder melk — went sneller dan je denkt.',
    evidence: null,
  },
]

function pastFasts(days: number): FastDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (i + 1))
    const start = new Date(d)
    start.setHours(19, 30, 0, 0)
    const end = new Date(start.getTime() + 16.5 * 3600_000)
    return {
      id: `past-${i}`,
      user_id: USER,
      day: dateKey(d),
      status: 'completed' as const,
      window_start: null,
      window_end: null,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      energy: null,
      hunger: null,
      focus: null,
      heavy_presses: 0,
      note: null,
      skip_reason: null,
    }
  })
}

// ---------- Nep-AppData provider ----------

type HomeVariant = 'fasting' | 'eating' | 'idle'

function useFakeAppData(variant: HomeVariant): AppData {
  const profile = useMemo(() => {
    if (variant === 'eating') return makeProfile(hhmm(hoursFromNow(-2)), hhmm(hoursFromNow(3)))
    if (variant === 'idle') return makeProfile(hhmm(hoursFromNow(2)), hhmm(hoursFromNow(8)))
    return makeProfile('12:00:00', '19:00:00')
  }, [variant])

  const [fasts, setFasts] = useState<FastDay[]>(() => {
    const past = pastFasts(5)
    if (variant !== 'fasting') return past
    const today: FastDay = {
      id: 'active-today',
      user_id: USER,
      day: dateKey(new Date()),
      status: 'active',
      window_start: null,
      window_end: null,
      started_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
      ended_at: null,
      energy: null,
      hunger: null,
      focus: null,
      heavy_presses: 0,
      note: null,
      skip_reason: null,
    }
    return [today, ...past]
  })

  const patchFast = useCallback(async (day: string, patch: Partial<FastDay>) => {
    setFasts((prev) => {
      const existing = prev.find((f) => f.day === day)
      const row: FastDay = existing
        ? { ...existing, ...patch }
        : {
            id: `local-${day}`,
            user_id: USER,
            day,
            status: 'planned',
            window_start: null,
            window_end: null,
            started_at: null,
            ended_at: null,
            energy: null,
            hunger: null,
            focus: null,
            heavy_presses: 0,
            note: null,
            skip_reason: null,
            ...patch,
          }
      return [row, ...prev.filter((f) => f.day !== day)]
    })
  }, [])

  const activeFast = fasts.find((f) => f.status === 'active' && f.started_at) ?? null

  return {
    userId: USER,
    profile,
    schedule: SCHEDULE,
    tips: FAKE_TIPS,
    reads: [],
    favorites: new Set<number>(),
    fasts,
    measurements: [],
    refresh: async () => {},
    updateProfile: async () => {},
    saveScheduleDay: async () => {},
    toggleFavorite: async () => {},
    patchFast,
    upsertToday: async (patch) => patchFast(dateKey(new Date()), patch),
    addMeasurement: async () => {},
    markRead: () => {},
    activeFast,
  }
}

function FakeApp({ variant, children }: { variant: HomeVariant; children: ReactNode }) {
  const data = useFakeAppData(variant)
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

// ---------- Nep-NutritionData provider ----------

function mondayOfThisWeek(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const wd = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - wd)
  return d
}

function FakeNutrition({ children }: { children: ReactNode }) {
  const appData = useFakeAppData('fasting')
  const profile = appData.profile
  const schedule = appData.schedule

  const ingredients = SEED_INGREDIENTS
  const meals = SEED_MEALS
  const ingredientsById = useMemo(() => seedIngredientsById(), [])
  const mealsById = useMemo(() => {
    const map: Record<string, (typeof meals)[number]> = {}
    for (const m of meals) map[m.id] = m
    return map
  }, [meals])

  const [prefs, setPrefs] = useState<PreferenceState>({
    meal: { 'b01|BREAK_FAST': 'superlike', 's01|SNACK': 'like', 'd02|DINNER': 'like' },
    ingredient: { kaneel: 'dislike' },
  })

  const contextFor = useCallback(
    (date: Date) => dayContextFor(date, profile, schedule, undefined),
    [profile, schedule],
  )

  // Weekplannen één keer genereren (deterministische seeds per datum).
  const initial = useMemo(() => {
    const monday = mondayOfThisWeek()
    const plans: StoredDayPlan[] = []
    const history = (dk: string): ServeHistory => {
      const daysSinceServed: Record<string, number> = {}
      const idx = dayIndexFromDateKey(dk)
      for (const p of plans) {
        const dist = Math.abs(idx - dayIndexFromDateKey(p.day))
        for (const s of Object.values(p.slots)) {
          const prev = daysSinceServed[s.mealId]
          if (prev === undefined || dist < prev) daysSinceServed[s.mealId] = dist
        }
      }
      return { daysSinceServed }
    }
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      const ctx = dayContextFor(date, profile, schedule, undefined)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      const result = generateDayPlan({
        ctx,
        slots,
        meals,
        ingredientsById,
        profile: DEFAULT_NUTRITION_PROFILE,
        prefs: { meal: { 'b01|BREAK_FAST': 'superlike' }, ingredient: {} },
        history: history(ctx.dateKey),
        rng: mulberry32(hashStringToSeed(ctx.dateKey)),
      })
      const stored = {} as StoredDayPlan['slots']
      for (const s of result.slots) {
        stored[s.slot] = {
          mealId: s.mealId,
          proteinScale: s.proteinScale,
          pinned: s.pinned,
          timeMin: s.spec.timeMin,
        }
      }
      plans.push({ day: ctx.dateKey, dayType: result.dayType, slots: stored, locked: false })
    }
    // Vandaag: BREAK_FAST als gegeten loggen, de rest als voorgesteld.
    const todayKey = dateKey(new Date())
    const todayPlan = plans.find((p) => p.day === todayKey)
    const logs: MealLogRow[] = []
    if (todayPlan) {
      for (const [slot, s] of Object.entries(todayPlan.slots)) {
        logs.push({
          id: `local-${todayKey}-${slot}`,
          day: todayKey,
          slot: slot as MealSlot,
          meal_id: s.mealId,
          status: slot === 'BREAK_FAST' ? 'eaten' : 'suggested',
          actual_grams: null,
        })
      }
    }
    return { plans, logs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [plans, setPlans] = useState<StoredDayPlan[]>(initial.plans)
  const [logs, setLogs] = useState<MealLogRow[]>(initial.logs)

  const historyForPlans = useCallback(
    (dk: string, allPlans: StoredDayPlan[]): ServeHistory => {
      const base = buildServeHistory(logs, dk)
      const daysSinceServed = { ...base.daysSinceServed }
      const idx = dayIndexFromDateKey(dk)
      for (const p of allPlans) {
        if (p.day === dk) continue
        const dist = Math.abs(idx - dayIndexFromDateKey(p.day))
        for (const s of Object.values(p.slots)) {
          const prev = daysSinceServed[s.mealId]
          if (prev === undefined || dist < prev) daysSinceServed[s.mealId] = dist
        }
      }
      return { daysSinceServed }
    },
    [logs],
  )

  const buildPlan = useCallback(
    (date: Date, seedSuffix: string, allPlans: StoredDayPlan[]): DayPlanResult => {
      const ctx = contextFor(date)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      return generateDayPlan({
        ctx,
        slots,
        meals,
        ingredientsById,
        profile: DEFAULT_NUTRITION_PROFILE,
        prefs,
        history: historyForPlans(ctx.dateKey, allPlans),
        rng: mulberry32(hashStringToSeed(ctx.dateKey + seedSuffix)),
      })
    },
    [contextFor, historyForPlans, ingredientsById, meals, prefs],
  )

  const storePlan = useCallback((result: DayPlanResult) => {
    const stored = {} as StoredDayPlan['slots']
    for (const s of result.slots) {
      stored[s.slot] = {
        mealId: s.mealId,
        proteinScale: s.proteinScale,
        pinned: s.pinned,
        timeMin: s.spec.timeMin,
      }
    }
    const plan: StoredDayPlan = {
      day: result.dateKey,
      dayType: result.dayType,
      slots: stored,
      locked: false,
    }
    setPlans((prev) => [...prev.filter((p) => p.day !== plan.day), plan])
    return plan
  }, [])

  const planResultFor = useCallback(
    (date: Date): DayPlanResult | null => {
      const dk = dateKey(date)
      const storedPlan = plans.find((p) => p.day === dk)
      if (!storedPlan) return null
      const ctx = contextFor(date)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      const eaten = new Set(
        logs.filter((l) => l.day === dk && l.status === 'eaten').map((l) => l.slot),
      )
      const chosen: Partial<
        Record<MealSlot, { mealId: string; locked?: boolean; pinned?: boolean; proteinScale?: number }>
      > = {}
      for (const [slot, s] of Object.entries(storedPlan.slots)) {
        chosen[slot as MealSlot] = {
          mealId: s.mealId,
          locked: eaten.has(slot as MealSlot),
          pinned: s.pinned,
          proteinScale: s.proteinScale,
        }
      }
      return refitDayPlan(
        { ctx, slots, meals, ingredientsById, profile: DEFAULT_NUTRITION_PROFILE, prefs },
        chosen,
      )
    },
    [contextFor, ingredientsById, logs, meals, plans, prefs],
  )

  const data: NutritionData = {
    loading: false,
    ingredients,
    meals,
    ingredientsById,
    mealsById,
    nutritionProfile: DEFAULT_NUTRITION_PROFILE,
    prefs,
    logs,
    plans,
    history: useMemo(() => buildServeHistory(logs, dateKey(new Date())), [logs]),
    contextFor,
    slotsFor: useCallback((ctx) => deriveSlots(ctx.dayType, ctx.window, ctx.sessions), []),
    planFor: useCallback((dk: string) => plans.find((p) => p.day === dk), [plans]),
    logsFor: useCallback((dk: string) => logs.filter((l) => l.day === dk), [logs]),
    planResultFor,
    historyFor: useCallback((dk: string) => historyForPlans(dk, plans), [historyForPlans, plans]),
    ensurePlan: async (date) => {
      const dk = dateKey(date)
      if (dk < dateKey(new Date())) return
      if (plans.some((p) => p.day === dk)) return
      storePlan(buildPlan(date, '', plans))
    },
    regenerate: async (date) => {
      const dk = dateKey(date)
      storePlan(buildPlan(date, `:${Date.now()}`, plans.filter((p) => p.day !== dk)))
    },
    generateWeek: async (dates) => {
      let working = [...plans]
      for (const date of dates) {
        const dk = dateKey(date)
        if (working.some((p) => p.day === dk)) continue
        working = [...working, storePlan(buildPlan(date, '', working))]
      }
    },
    swapMeal: async (date, slot, mealId) => {
      const dk = dateKey(date)
      const storedPlan = plans.find((p) => p.day === dk)
      if (!storedPlan) return
      const ctx = contextFor(date)
      const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
      const chosen: Partial<
        Record<MealSlot, { mealId: string; pinned?: boolean; proteinScale?: number }>
      > = {}
      for (const [sl, s] of Object.entries(storedPlan.slots)) {
        chosen[sl as MealSlot] = {
          mealId: sl === slot ? mealId : s.mealId,
          pinned: sl === slot ? false : s.pinned,
          proteinScale: s.proteinScale,
        }
      }
      storePlan(
        refitDayPlan(
          { ctx, slots, meals, ingredientsById, profile: DEFAULT_NUTRITION_PROFILE, prefs },
          chosen,
        ),
      )
    },
    setEaten: async (date, slot, mealId, eaten) => {
      const dk = dateKey(date)
      setLogs((prev) => [
        ...prev.filter((l) => !(l.day === dk && l.slot === slot)),
        {
          id: `local-${dk}-${slot}`,
          day: dk,
          slot,
          meal_id: mealId,
          status: eaten ? 'eaten' : 'suggested',
          actual_grams: null,
        },
      ])
    },
    rateMeal: async (mealId, slot, state) => {
      setPrefs((prev) => {
        const meal = { ...prev.meal }
        const key = `${mealId}|${slot}`
        if (state === null) delete meal[key]
        else meal[key] = state
        return { ...prev, meal }
      })
    },
    rateIngredient: async (ingredientId, state) => {
      setPrefs((prev) => {
        const ingredient = { ...prev.ingredient }
        if (state === null) delete ingredient[ingredientId]
        else ingredient[ingredientId] = state
        return { ...prev, ingredient }
      })
    },
    addOffIngredient: async () => null,
    refresh: async () => {},
  }

  return (
    <DataContext.Provider value={appData}>
      <NutritionContext.Provider value={data}>{children}</NutritionContext.Provider>
    </DataContext.Provider>
  )
}

// ---------- Harnas-layout ----------

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 48 }}>
      <h2
        style={{
          color: 'var(--text-dim, #888)',
          font: '600 12px/1.4 system-ui',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '8px 16px',
          borderBottom: '1px dashed rgba(128,128,128,0.4)',
        }}
      >
        {title}
      </h2>
      <main className="app-main">{children}</main>
    </section>
  )
}

function NutritionDaySection() {
  const [date, setDate] = useState(() => new Date())
  return <DayView date={date} onDateChange={setDate} />
}

function Harness() {
  return (
    <>
      <Section id="home-fasting" title="Home — aan het vasten (6u bezig)">
        <FakeApp variant="fasting">
          <Home />
        </FakeApp>
      </Section>
      <Section id="home-eating" title="Home — eetvenster open">
        <FakeApp variant="eating">
          <Home />
        </FakeApp>
      </Section>
      <Section id="home-idle" title="Home — venster nog dicht (idle)">
        <FakeApp variant="idle">
          <Home />
        </FakeApp>
      </Section>
      <FakeNutrition>
        <Section id="nut-day" title="Eten — dagweergave">
          <NutritionDaySection />
        </Section>
        <Section id="nut-week" title="Eten — weekweergave">
          <WeekView onOpenDay={() => {}} />
        </Section>
        <Section id="nut-shopping" title="Eten — boodschappen">
          <ShoppingView />
        </Section>
        <Section id="nut-ingredients" title="Eten — ingrediënten">
          <IngredientsView />
        </Section>
      </FakeNutrition>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />)
