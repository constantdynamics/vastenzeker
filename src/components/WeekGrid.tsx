import { useMemo } from 'react'
import { sportAdvice } from '../lib/advice'
import { parseTime, weekdayOf } from '../lib/time'
import { SPORT_LABELS, WEEKDAY_LABELS } from '../lib/types'
import type { Profile, ScheduleDay } from '../lib/types'

// Weekoverzicht in de stijl van "de week van": dagkolommen op een tijdas.
// Groen = eetvenster, oranje = sportblok, magenta stippellijn = geadviseerde
// start van het vasten. Tik op een dag om hem te bewerken.

const DAY_START = 6 * 60 // as van 06:00
const DAY_END = 24 * 60 // tot 24:00
const SCALE = 0.42 // px per minuut
const H = (DAY_END - DAY_START) * SCALE
const SPORT_BLOCK_MIN = 90

const y = (min: number) => (Math.max(DAY_START, Math.min(DAY_END, min)) - DAY_START) * SCALE

export default function WeekGrid({
  days,
  profile,
  selected,
  onSelect,
}: {
  days: ScheduleDay[]
  profile: Profile
  selected: number
  onSelect: (weekday: number) => void
}) {
  const now = new Date()
  const today = weekdayOf(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const hours = useMemo(() => {
    const out: number[] = []
    for (let h = DAY_START / 60; h <= DAY_END / 60; h += 3) out.push(h)
    return out
  }, [])

  return (
    <div className="week-grid" role="grid" aria-label="Weekoverzicht vasten en sport">
      <div className="wg-axis" style={{ height: H + 34 }}>
        {hours.map((h) => (
          <span key={h} style={{ top: y(h * 60) + 34 }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      {days.map((day) => {
        const open = parseTime(day.window_start ?? profile.window_start)
        let close = parseTime(day.window_end ?? profile.window_end)
        if (close <= open) close += 1440
        // geadviseerde start op deze dag = sluitingstijd van het venster van
        // de eerstvolgende vastendag (zelfde kloktijd, avond ervoor)
        const tomorrow = days.find((d) => d.weekday === (day.weekday + 1) % 7)
        const tomorrowFasting = tomorrow ? tomorrow.fasting : true
        let adviseMin: number | null = null
        if (tomorrowFasting) {
          const tOpen = parseTime(tomorrow?.window_start ?? profile.window_start)
          let tClose = parseTime(tomorrow?.window_end ?? profile.window_end)
          if (tClose <= tOpen) tClose += 1440
          adviseMin = tClose % 1440
        }
        const sportMin = day.sport_time ? parseTime(day.sport_time) : null
        const worst = day.sport_type
          ? sportAdvice(day.sport_type, day, profile).reduce(
              (acc, a) => (a.level === 'warning' ? 'warning' : a.level === 'caution' && acc !== 'warning' ? 'caution' : acc),
              'info' as 'info' | 'caution' | 'warning',
            )
          : null
        const isToday = day.weekday === today
        const isSelected = day.weekday === selected

        return (
          <button
            key={day.weekday}
            className={`wg-col ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${day.fasting ? '' : 'free'}`}
            onClick={() => onSelect(day.weekday)}
            role="gridcell"
            aria-label={colLabel(day, worst)}
          >
            <span className="wg-head">
              {WEEKDAY_LABELS[day.weekday]}
              {worst === 'warning' && <span className="wg-flag warn" title="Waarschuwing bij deze dag">⚠</span>}
              {worst === 'caution' && <span className="wg-flag caution" title="Let op bij deze dag">!</span>}
            </span>
            <span className="wg-body" style={{ height: H }}>
              {day.fasting ? (
                <span
                  className="wg-eat"
                  style={{ top: y(open), height: Math.max(6, y(Math.min(close, DAY_END)) - y(open)) }}
                  title={`Eetvenster ${fmt(open)}–${fmt(close % 1440)}`}
                />
              ) : (
                <span className="wg-free-label">vrij</span>
              )}
              {sportMin !== null && (
                <span
                  className="wg-sport"
                  style={{ top: y(sportMin), height: Math.max(8, SPORT_BLOCK_MIN * SCALE) }}
                  title={`${day.sport_type ? SPORT_LABELS[day.sport_type] : 'sport'} om ${fmt(sportMin)}`}
                >
                  {day.sport_type ? SPORT_LABELS[day.sport_type].slice(0, 1).toUpperCase() : ''}
                </span>
              )}
              {adviseMin !== null && adviseMin >= DAY_START && (
                <span className="wg-advise" style={{ top: y(adviseMin) }}>
                  <em>{fmt(adviseMin)}</em>
                </span>
              )}
              {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
                <span className="wg-now" style={{ top: y(nowMin) }} />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function colLabel(day: ScheduleDay, worst: string | null): string {
  const parts = [WEEKDAY_LABELS[day.weekday], day.fasting ? 'vastendag' : 'vrije dag']
  if (day.sport_type) parts.push(`sport: ${SPORT_LABELS[day.sport_type]}${day.sport_time ? ` om ${day.sport_time.slice(0, 5)}` : ''}`)
  if (worst === 'warning') parts.push('waarschuwing')
  return parts.join(', ')
}
