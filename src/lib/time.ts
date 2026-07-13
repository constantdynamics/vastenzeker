import type { Phase, Profile, ScheduleDay, SportType } from './types'

// Alle berekeningen in lokale tijd van het apparaat.
// Weekdag-conventie: 0 = maandag .. 6 = zondag.
//
// Model: vasten start NIET automatisch op de klok. De app adviseert een
// starttijd (de indicator), maar het vasten begint pas als de gebruiker
// op de startknop drukt (started_at). Rood = er loopt een gestarte vast.

export function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7
}

export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'HH:MM' of 'HH:MM:SS' naar minuten sinds middernacht. */
export function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  return `${h}u ${String(m).padStart(2, '0')}m`
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatHm(d: Date): string {
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

export interface DayPlan {
  fasting: boolean
  startMin: number
  endMin: number
  sport: SportType | null
}

export function planForDate(date: Date, profile: Profile, schedule: ScheduleDay[]): DayPlan {
  const row = schedule.find((s) => s.weekday === weekdayOf(date))
  const startMin = parseTime(row?.window_start ?? profile.window_start)
  const endMin = parseTime(row?.window_end ?? profile.window_end)
  return {
    fasting: row ? row.fasting : true,
    startMin,
    endMin,
    sport: row?.sport_type ?? null,
  }
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

interface Opening {
  open: number // ms epoch: venster opent
  close: number // ms epoch: venster sluit
  fastHours: number // hoeveel uur vasten hoort vooraf te gaan (24 - vensterlengte)
}

/** Vensteropeningen van vastendagen, van gisteren tot +8 dagen, gesorteerd. */
function windowOpenings(now: Date, profile: Profile, schedule: ScheduleDay[]): Opening[] {
  const out: Opening[] = []
  for (let offset = -1; offset <= 8; offset++) {
    const day = startOfDay(new Date(now.getTime() + offset * 86400000))
    const plan = planForDate(day, profile, schedule)
    if (!plan.fasting) continue
    const open = day.getTime() + plan.startMin * 60000
    let close = day.getTime() + plan.endMin * 60000
    if (plan.endMin <= plan.startMin) close += 86400000
    out.push({ open, close, fastHours: 24 - (close - open) / 3600000 })
  }
  return out.sort((a, b) => a.open - b.open)
}

export type StatusKind = 'fasting' | 'eating' | 'idle' | 'free' | 'unplanned'

export interface FastingStatus {
  kind: StatusKind
  /** ms tot het volgende relevante omslagpunt */
  msToChange: number
  changeAt: Date
  /** 0..1 voortgang van de huidige fase */
  progress: number
  elapsedMs: number
  totalMs: number
  /** fase-context voor tipselectie */
  phase: Phase
  sport: SportType | null
  /** geadviseerd startmoment van de (volgende) vast — de dagelijkse indicator */
  advisedStart: Date | null
  /** het geadviseerde startmoment is al verstreken en er loopt geen vast */
  overdue: boolean
  /** einddoel van de actieve vast (alleen bij kind 'fasting') */
  fastTargetEnd: Date | null
}

/**
 * Einddoel van een vast die op `startedAt` begon: starttijd + de vastduur
 * van het protocol (bijv. 16 uur bij 16:8). De knop start dus een teller
 * met vaste duur — eerder starten betekent eerder klaar, later starten
 * betekent later klaar. De duur komt van de eerstvolgende vastendag in
 * het schema, met de profielinstelling als vangnet.
 */
export function fastTarget(
  startedAt: Date,
  profile: Profile,
  schedule: ScheduleDay[],
): Date {
  const openings = windowOpenings(startedAt, profile, schedule)
  const next = openings.find((o) => o.open > startedAt.getTime())
  let fastHours: number
  if (next) {
    fastHours = next.fastHours
  } else {
    const s = parseTime(profile.window_start)
    let e = parseTime(profile.window_end)
    if (e <= s) e += 1440
    fastHours = 24 - (e - s) / 60
  }
  return new Date(startedAt.getTime() + fastHours * 3600000)
}

export function computeStatus(
  now: Date,
  profile: Profile,
  schedule: ScheduleDay[],
  activeFastStartedAt?: string | null,
): FastingStatus {
  const todayPlan = planForDate(now, profile, schedule)
  const anyFasting = schedule.length === 0 || schedule.some((s) => s.fasting)
  const base = {
    sport: todayPlan.sport,
    advisedStart: null as Date | null,
    overdue: false,
    fastTargetEnd: null as Date | null,
  }

  if (!anyFasting) {
    return {
      ...base,
      kind: 'unplanned',
      msToChange: 0,
      changeAt: now,
      progress: 0,
      elapsedMs: 0,
      totalMs: 1,
      phase: 'any',
    }
  }

  const t = now.getTime()
  const openings = windowOpenings(now, profile, schedule)

  // 1. Loopt er een gestarte vast?
  if (activeFastStartedAt) {
    const start = new Date(activeFastStartedAt)
    const target = fastTarget(start, profile, schedule)
    // Geen ondergrens op t: een tick-achterstand van de klok mag een net
    // gestarte vast niet als "voorbij" behandelen.
    if (t < target.getTime()) {
      const total = Math.max(1, target.getTime() - start.getTime())
      const elapsed = Math.max(0, t - start.getTime())
      const frac = elapsed / total
      return {
        ...base,
        kind: 'fasting',
        msToChange: target.getTime() - t,
        changeAt: target,
        progress: frac,
        elapsedMs: elapsed,
        totalMs: total,
        phase: frac < 0.33 ? 'fast_early' : frac < 0.75 ? 'fast_mid' : 'fast_late',
        fastTargetEnd: target,
      }
    }
    // vast is voorbij zijn doel: behandel als niet-actief; de UI rondt hem af
  }

  // 2. Geen actieve vast. De indicator: wanneer zou de volgende vast moeten starten?
  const nextOpening = openings.find((o) => o.open > t)
  const advisedStart = nextOpening
    ? new Date(nextOpening.open - nextOpening.fastHours * 3600000)
    : null
  const overdue = advisedStart !== null && advisedStart.getTime() <= t

  // Zitten we nu in een eetvenster van een vastendag?
  const inWindow = openings.find((o) => t >= o.open && t < o.close)
  if (inWindow) {
    const total = inWindow.close - inWindow.open
    const elapsed = t - inWindow.open
    const frac = elapsed / total
    return {
      ...base,
      kind: 'eating',
      msToChange: inWindow.close - t,
      changeAt: new Date(inWindow.close),
      progress: frac,
      elapsedMs: elapsed,
      totalMs: total,
      phase: frac < 0.25 ? 'eat_open' : frac < 0.8 ? 'eat_mid' : 'eat_close',
      advisedStart,
      overdue,
    }
  }

  // Vrije dag (geen venster vandaag) en geen actieve vast → vrij
  if (!todayPlan.fasting) {
    const changeAt = advisedStart && advisedStart.getTime() > t ? advisedStart : startOfDay(new Date(t + 86400000))
    return {
      ...base,
      kind: 'free',
      msToChange: changeAt.getTime() - t,
      changeAt,
      progress: 0,
      elapsedMs: 0,
      totalMs: 1,
      phase: 'any',
      advisedStart,
      overdue,
    }
  }

  // 3. Venster dicht, vast niet gestart: idle. Omslagpunt = volgende opening.
  const next = nextOpening ?? openings[openings.length - 1]
  const ref = advisedStart ? advisedStart.getTime() : t
  const total = next ? Math.max(1, next.open - ref) : 1
  const elapsed = Math.max(0, t - ref)
  return {
    ...base,
    kind: 'idle',
    msToChange: next ? next.open - t : 0,
    changeAt: next ? new Date(next.open) : now,
    progress: Math.min(1, elapsed / total),
    elapsedMs: elapsed,
    totalMs: total,
    phase: 'any',
    advisedStart,
    overdue,
  }
}

/** Lengte van het eetvenster in uren (kan over middernacht lopen). */
export function windowLengthHours(start: string, end: string): number {
  const s = parseTime(start)
  let e = parseTime(end)
  if (e <= s) e += 1440
  return (e - s) / 60
}

export function protocolName(start: string, end: string): string {
  const eat = windowLengthHours(start, end)
  const fast = 24 - eat
  const known: Record<string, string> = {
    '14:10': '14:10',
    '16:8': '16:8',
    '18:6': '18:6',
    '20:4': '20:4',
  }
  const key = `${Math.round(fast)}:${Math.round(eat)}`
  if (eat <= 1.5) return 'OMAD'
  return known[key] ?? `${Math.round(fast)} uur vasten / ${Math.round(eat)} uur eten`
}
