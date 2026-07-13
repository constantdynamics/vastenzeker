// Dagtype en maaltijdslots zijn AFGELEID, niet hardcoded (§3–§4).
// Bron: het bestaande weekschema (if_schedule) + profiel-/dagvenster,
// plus het dag-log (if_fasts) voor slechte-nacht-overrides.

import { parseTime, planForDate, weekdayOf, dateKey } from '../time'
import type { FastDay, Profile, ScheduleDay, SportType } from '../types'
import type { DayContext, DayType, DayWindow, MealSlot, SlotSpec, TrainingSession } from './types'

/** Standaardduur als er geen eindtijd is ingesteld. */
const DEFAULT_DURATION_MIN: Record<'strength' | 'cardio', number> = {
  strength: 90,
  cardio: 45,
}

/** Vrije of slechte-nacht-dag zonder expliciete opening: venster opent om 9:00. */
export const FREE_DAY_OPEN_MIN = 9 * 60

/**
 * Bestaande sporttypes → engine-types. 'easy' (wandelen, zone 2) vraagt geen
 * eigen maaltijdtiming en telt hier niet als training.
 */
export function toSessionType(sport: SportType): 'strength' | 'cardio' | null {
  if (sport === 'strength') return 'strength'
  if (sport === 'endurance' || sport === 'intense') return 'cardio'
  return null
}

export function sessionsForScheduleDay(row: ScheduleDay | undefined): TrainingSession[] {
  if (!row?.sport_type || !row.sport_time) return []
  const type = toSessionType(row.sport_type)
  if (!type) return []
  const startMin = parseTime(row.sport_time)
  const endMin = row.sport_end_time
    ? parseTime(row.sport_end_time)
    : startMin + DEFAULT_DURATION_MIN[type]
  return [{ type, startMin, endMin: Math.max(endMin, startMin + 15) }]
}

/** §3, letterlijk gevolgd. Kracht die over de vensteropening heen loopt telt als gevoed. */
export function deriveDayType(sessions: TrainingSession[], openMin: number): DayType {
  if (sessions.some((s) => s.type === 'strength' && s.endMin <= openMin + 30)) {
    return 'FASTED_STRENGTH'
  }
  if (sessions.some((s) => s.type === 'strength')) {
    return 'FED_STRENGTH'
  }
  if (sessions.some((s) => s.type === 'cardio')) {
    return 'CARDIO'
  }
  return 'REST'
}

/**
 * Effectief eetvenster van een datum. Het weekschema/profiel bepaalt de basis;
 * een dag-log-rij met status 'skipped' (slechte nacht of vrije keuze) zet de
 * vast uit en mag de opening vervroegen. Op een niet-vastendag zonder expliciete
 * tijden opent het venster om 9:00 — er is dan geen vast, wél een eetplan.
 */
export function effectiveWindow(
  date: Date,
  profile: Profile,
  schedule: ScheduleDay[],
  fastRow: FastDay | null | undefined,
): DayWindow {
  const plan = planForDate(date, profile, schedule)
  const skipped = fastRow?.status === 'skipped'
  const fasting = plan.fasting && !skipped
  const badNight = skipped && fastRow?.skip_reason === 'bad_night'

  let openMin = plan.startMin
  let closeMin = plan.endMin
  if (!fasting) {
    openMin = fastRow?.window_start
      ? parseTime(fastRow.window_start)
      : Math.min(FREE_DAY_OPEN_MIN, plan.startMin)
    if (fastRow?.window_end) closeMin = parseTime(fastRow.window_end)
  } else if (fastRow?.window_start || fastRow?.window_end) {
    if (fastRow.window_start) openMin = parseTime(fastRow.window_start)
    if (fastRow.window_end) closeMin = parseTime(fastRow.window_end)
  }
  // Venster over middernacht: net als in time.ts telt de sluiting dan bij de
  // volgende dag (closeMin > 1440). formatTime wrapt de weergave zelf.
  if (closeMin <= openMin) closeMin += 1440
  return { openMin, closeMin, fasting, badNight }
}

/**
 * §4: tijd én eisen per slot volgen uit dagtype en trainingstijden.
 * Alle slottijden worden op het venster geklemd ([open, close − 15]): eten na
 * sluiting zou de vast breken, en een sessie die de venstergrens kruist mag
 * geen slot buiten het venster duwen. Bij extreem krappe configuraties kunnen
 * slottijden daardoor samenvallen — de volgorde blijft dan op tijd gesorteerd.
 */
export function deriveSlots(
  dayType: DayType,
  window: DayWindow,
  sessions: TrainingSession[],
): SlotSpec[] {
  const open = window.openMin
  const close = window.closeMin
  const lastEat = close - 15
  const clampT = (t: number) => Math.min(Math.max(t, open), lastEat)
  const strength = sessions.find((s) => s.type === 'strength') ?? null
  const cardio = sessions.find((s) => s.type === 'cardio') ?? null

  const breakFast: SlotSpec = {
    slot: 'BREAK_FAST',
    timeMin: clampT(dayType === 'FASTED_STRENGTH' && strength ? strength.endMin : open),
    requiresCold: true, // altijd, mijn voorkeur (§2 regel 2)
    requiresPortable: dayType === 'FASTED_STRENGTH',
    requiresFastDigestion: dayType === 'FASTED_STRENGTH',
    requiresCasein: false,
    maxFatG: dayType === 'FASTED_STRENGTH' ? 12 : null,
    lowFatFiber: false,
    proteinTargetG: [40, 50],
  }

  let snackTime: number
  if (dayType === 'CARDIO' && cardio) {
    snackTime = cardio.endMin + 15 // NA het rennen
  } else if (dayType === 'FED_STRENGTH' && strength && strength.startMin < close) {
    snackTime = Math.max(open, strength.startMin - 45) // pre-workout
  } else {
    // geen sessie binnen het venster (bv. kracht ná sluiting): gewone timing
    snackTime = open + 180
  }
  const snack: SlotSpec = {
    slot: 'SNACK',
    timeMin: clampT(snackTime),
    requiresCold: false,
    requiresPortable: false,
    requiresFastDigestion: dayType === 'FED_STRENGTH',
    requiresCasein: false,
    maxFatG: null,
    lowFatFiber: dayType === 'FED_STRENGTH',
    proteinTargetG: [30, 45],
  }

  // Diner: uiterlijk een uur voor sluiting, maar nooit binnen 30 min na een
  // krachtsessie die in het venster eindigt — die regel wint van de marge tot
  // CLOSE, omdat eten tijdens/direct na de sessie fysiek niet kan.
  let dinnerTime = close - 60
  if (strength && strength.endMin <= close && strength.endMin + 30 > dinnerTime) {
    dinnerTime = strength.endMin + 30
  }
  dinnerTime = clampT(dinnerTime)
  const dinner: SlotSpec = {
    slot: 'DINNER',
    timeMin: dinnerTime,
    requiresCold: false, // hier mag warm
    requiresPortable: false,
    requiresFastDigestion: false,
    requiresCasein: false,
    maxFatG: null,
    lowFatFiber: false,
    proteinTargetG: [55, 65],
  }

  const closeSlot: SlotSpec = {
    slot: 'CLOSE',
    timeMin: close - 15,
    requiresCold: false,
    requiresPortable: false,
    requiresFastDigestion: false,
    requiresCasein: true, // altijd kwark/hüttenkäse
    maxFatG: null,
    lowFatFiber: false,
    proteinTargetG: [35, 45],
  }

  return [breakFast, snack, dinner, closeSlot].sort((a, b) => a.timeMin - b.timeMin)
}

/** Alles-in-één voor UI en tests: context van een datum. */
export function dayContextFor(
  date: Date,
  profile: Profile,
  schedule: ScheduleDay[],
  fastRow: FastDay | null | undefined,
): DayContext {
  const row = schedule.find((s) => s.weekday === weekdayOf(date))
  const sessions = sessionsForScheduleDay(row)
  let window = effectiveWindow(date, profile, schedule, fastRow)
  const dayType = deriveDayType(sessions, window.openMin)
  // Nuchtere kracht die vóór de vensteropening eindigt: het venster opent
  // effectief bij het einde van de sessie — direct eiwit na de training is
  // het hele punt van dit dagtype (§4: BREAK_FAST = session.end).
  const strength = sessions.find((s) => s.type === 'strength')
  if (dayType === 'FASTED_STRENGTH' && strength && strength.endMin < window.openMin) {
    window = { ...window, openMin: strength.endMin }
  }
  const isTrainingDay = sessions.length > 0
  return {
    dateKey: dateKey(date),
    dayType,
    window,
    sessions,
    isTrainingDay,
    nutBudgetG: isTrainingDay ? 40 : 30, // §2 regel 3
  }
}

export function slotOrder(slots: SlotSpec[]): MealSlot[] {
  return [...slots].sort((a, b) => a.timeMin - b.timeMin).map((s) => s.slot)
}
