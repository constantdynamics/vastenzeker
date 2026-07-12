import { dateKey, planForDate } from './time'
import type { FastDay, Profile, ScheduleDay } from './types'

export interface StreakInfo {
  current: number
  best: number
}

/**
 * Streak = aaneengesloten geplande vastendagen met status 'completed',
 * teruggeteld vanaf vandaag/gisteren. Vrije dagen breken een streak niet.
 * Een gebroken streak is geen ramp; de app frameert dat ook zo.
 */
export function computeStreak(
  fasts: FastDay[],
  profile: Profile,
  schedule: ScheduleDay[],
): StreakInfo {
  const byDay = new Map(fasts.map((f) => [f.day, f]))
  const today = new Date()

  const statusFor = (d: Date): 'ok' | 'skip' | 'fail' | 'open' => {
    const plan = planForDate(d, profile, schedule)
    if (!plan.fasting) return 'skip'
    const f = byDay.get(dateKey(d))
    if (!f) return 'open'
    if (f.status === 'completed') return 'ok'
    if (f.status === 'skipped') return 'skip'
    if (f.status === 'planned' || f.status === 'active') return 'open'
    return 'fail'
  }

  let current = 0
  const cursor = new Date(today)
  // Vandaag telt mee als hij al voltooid is, anders beginnen we bij gisteren.
  if (statusFor(cursor) !== 'ok') cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i < 366; i++) {
    const s = statusFor(cursor)
    if (s === 'ok') current++
    else if (s === 'skip') {
      // vrije dag: telt niet, breekt niet
    } else break
    cursor.setDate(cursor.getDate() - 1)
  }

  // Beste streak over de hele historie
  let best = 0
  let run = 0
  const days = [...byDay.keys()].sort()
  if (days.length > 0) {
    const start = new Date(days[0])
    const end = new Date()
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const s = statusFor(d)
      if (s === 'ok') {
        run++
        best = Math.max(best, run)
      } else if (s === 'fail') {
        run = 0
      }
      // skip/open: run loopt door zonder op te tellen
    }
  }
  best = Math.max(best, current)

  return { current, best }
}
