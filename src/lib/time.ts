import type { Phase, Profile, ScheduleDay, SportType } from './types'

// Alle berekeningen in lokale tijd van het apparaat.
// Weekdag-conventie: 0 = maandag .. 6 = zondag.

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

interface Interval {
  start: number // ms epoch
  end: number
  free: boolean // hele vrije dag (geen venster)
}

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

/**
 * Bouwt eetintervallen (absoluut, ms) van gisteren tot +8 dagen.
 * Vastendag: het ingestelde venster. Vrije dag: de hele dag.
 * Venster over middernacht (eind <= start) loopt door naar de volgende dag.
 */
function eatingIntervals(now: Date, profile: Profile, schedule: ScheduleDay[]): Interval[] {
  const raw: Interval[] = []
  for (let offset = -1; offset <= 8; offset++) {
    const day = startOfDay(new Date(now.getTime() + offset * 86400000))
    // startOfDay + verschuiving vermijdt DST-drift bij optellen van hele dagen
    const dayStart = day.getTime()
    const plan = planForDate(day, profile, schedule)
    if (!plan.fasting) {
      raw.push({ start: dayStart, end: dayStart + 86400000, free: true })
    } else {
      const start = dayStart + plan.startMin * 60000
      let end = dayStart + plan.endMin * 60000
      if (plan.endMin <= plan.startMin) end += 86400000
      raw.push({ start, end, free: false })
    }
  }
  raw.sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const iv of raw) {
    const last = merged[merged.length - 1]
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end)
      last.free = last.free && iv.free
    } else {
      merged.push({ ...iv })
    }
  }
  return merged
}

export type StatusKind = 'eating' | 'fasting' | 'free' | 'unplanned'

export interface FastingStatus {
  kind: StatusKind
  /** ms tot de status omslaat */
  msToChange: number
  /** tijdstip waarop de status omslaat */
  changeAt: Date
  /** 0..1 voortgang van de huidige fase */
  progress: number
  /** hoe lang de huidige fase al loopt, in ms */
  elapsedMs: number
  /** totale duur van de huidige fase, in ms */
  totalMs: number
  /** fase-context voor tipselectie */
  phase: Phase
  /** sporttype van vandaag, indien ingesteld */
  sport: SportType | null
}

export function computeStatus(now: Date, profile: Profile, schedule: ScheduleDay[]): FastingStatus {
  const todayPlan = planForDate(now, profile, schedule)
  const anyFasting =
    schedule.length === 0 || schedule.some((s) => s.fasting)
  if (!anyFasting) {
    return {
      kind: 'unplanned',
      msToChange: 0,
      changeAt: now,
      progress: 0,
      elapsedMs: 0,
      totalMs: 1,
      phase: 'any',
      sport: todayPlan.sport,
    }
  }

  const intervals = eatingIntervals(now, profile, schedule)
  const t = now.getTime()
  const current = intervals.find((iv) => t >= iv.start && t < iv.end)

  if (current) {
    const elapsed = t - current.start
    const total = current.end - current.start
    const frac = elapsed / total
    const phase: Phase = frac < 0.25 ? 'eat_open' : frac < 0.8 ? 'eat_mid' : 'eat_close'
    return {
      kind: current.free ? 'free' : 'eating',
      msToChange: current.end - t,
      changeAt: new Date(current.end),
      progress: frac,
      elapsedMs: elapsed,
      totalMs: total,
      phase: current.free ? 'any' : phase,
      sport: todayPlan.sport,
    }
  }

  // We vasten: zoek het vorige einde en de volgende opening.
  const prev = [...intervals].reverse().find((iv) => iv.end <= t)
  const next = intervals.find((iv) => iv.start > t)
  const fastStart = prev ? prev.end : t - 1
  const fastEnd = next ? next.start : t + 1
  const total = Math.max(1, fastEnd - fastStart)
  const elapsed = t - fastStart
  const frac = Math.min(1, elapsed / total)
  const phase: Phase = frac < 0.33 ? 'fast_early' : frac < 0.75 ? 'fast_mid' : 'fast_late'
  return {
    kind: 'fasting',
    msToChange: fastEnd - t,
    changeAt: new Date(fastEnd),
    progress: frac,
    elapsedMs: elapsed,
    totalMs: total,
    phase,
    sport: todayPlan.sport,
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
