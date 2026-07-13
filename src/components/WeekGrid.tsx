import { useMemo, useState } from 'react'
import { sportAdvice } from '../lib/advice'
import { parseTime, weekdayOf } from '../lib/time'
import { SPORT_LABELS, WEEKDAY_LABELS } from '../lib/types'
import type { Profile, ScheduleDay } from '../lib/types'

// Weekoverzicht in de stijl van "de week van": dagkolommen op een tijdas.
// Groen = eetvenster, oranje = sportblok, magenta stippellijn = geadviseerde
// start van het vasten. Sleep het sport- of eetvensterblok om tijden te
// verschuiven; het advies rekent direct mee.

const DAY_START = 6 * 60 // as van 06:00
const DAY_END = 24 * 60 // tot 24:00
const SCALE = 0.42 // px per minuut
const H = (DAY_END - DAY_START) * SCALE
const SPORT_BLOCK_MIN = 90

const y = (min: number) => (Math.max(DAY_START, Math.min(DAY_END, min)) - DAY_START) * SCALE
const clampMin = (min: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, min))

interface DragState {
  weekday: number
  kind: 'sport' | 'eat'
  startY: number
  origMin: number
  deltaMin: number
}

export default function WeekGrid({
  days,
  profile,
  selected,
  onSelect,
  onPatch,
}: {
  days: ScheduleDay[]
  profile: Profile
  selected: number
  onSelect: (weekday: number) => void
  onPatch?: (day: ScheduleDay, patch: Partial<ScheduleDay>) => void
}) {
  const now = new Date()
  const today = weekdayOf(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [drag, setDrag] = useState<DragState | null>(null)

  const hours = useMemo(() => {
    const out: number[] = []
    for (let h = DAY_START / 60; h <= DAY_END / 60; h += 3) out.push(h)
    return out
  }, [])

  function startDrag(
    e: React.PointerEvent,
    weekday: number,
    kind: 'sport' | 'eat',
    origMin: number,
  ) {
    if (!onPatch) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ weekday, kind, startY: e.clientY, origMin, deltaMin: 0 })
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return
    const delta = Math.round((e.clientY - drag.startY) / SCALE / 15) * 15
    if (delta !== drag.deltaMin) setDrag({ ...drag, deltaMin: delta })
  }

  function endDrag(day: ScheduleDay, windowLen: number) {
    if (!drag || !onPatch) {
      setDrag(null)
      return
    }
    if (drag.deltaMin !== 0) {
      if (drag.kind === 'sport') {
        const t = clampMin(drag.origMin + drag.deltaMin, DAY_START, DAY_END - 30)
        onPatch(day, { sport_time: fmt(t) })
      } else {
        const start = clampMin(drag.origMin + drag.deltaMin, 5 * 60, 1440 - 60)
        onPatch(day, { window_start: fmt(start), window_end: fmt((start + windowLen) % 1440) })
      }
    }
    setDrag(null)
  }

  return (
    <div
      className="week-grid"
      role="grid"
      aria-label="Weekoverzicht vasten en sport"
      style={{ ['--wg-hour' as string]: `${60 * SCALE}px` }}
    >
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
        const windowLen = close - open
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
        const dragging = drag && drag.weekday === day.weekday ? drag : null
        const eatOffset = dragging?.kind === 'eat' ? dragging.deltaMin : 0
        const sportOffset = dragging?.kind === 'sport' ? dragging.deltaMin : 0
        const eatStart = clampMin(open + eatOffset, 5 * 60, 1440 - 60)
        const sportMin = day.sport_time
          ? clampMin(parseTime(day.sport_time) + sportOffset, DAY_START, DAY_END - 30)
          : null
        const worst = day.sport_type
          ? sportAdvice(day.sport_type, day, profile).reduce(
              (acc, a) =>
                a.level === 'warning' ? 'warning' : a.level === 'caution' && acc !== 'warning' ? 'caution' : acc,
              'info' as 'info' | 'caution' | 'warning',
            )
          : null
        const isToday = day.weekday === today
        const isSelected = day.weekday === selected

        return (
          <div
            key={day.weekday}
            className={`wg-col ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${day.fasting ? '' : 'free'}`}
            onClick={() => onSelect(day.weekday)}
            role="gridcell"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(day.weekday)}
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
                  className={`wg-eat ${dragging?.kind === 'eat' ? 'dragging' : ''}`}
                  style={{
                    top: y(eatStart),
                    height: Math.max(14, y(Math.min(eatStart + windowLen, DAY_END)) - y(eatStart)),
                  }}
                  onPointerDown={(e) => startDrag(e, day.weekday, 'eat', open)}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(day, windowLen)}
                  onPointerCancel={() => setDrag(null)}
                  title={`Eetvenster ${fmt(eatStart)}–${fmt((eatStart + windowLen) % 1440)} — sleep om te verschuiven`}
                >
                  <em>{fmt(eatStart)}</em>
                  <em className="end">{fmt((eatStart + windowLen) % 1440)}</em>
                </span>
              ) : (
                <span className="wg-free-label">vrij</span>
              )}
              {sportMin !== null && (
                <span
                  className={`wg-sport ${dragging?.kind === 'sport' ? 'dragging' : ''}`}
                  style={{ top: y(sportMin), height: Math.max(12, SPORT_BLOCK_MIN * SCALE) }}
                  onPointerDown={(e) => startDrag(e, day.weekday, 'sport', parseTime(day.sport_time!))}
                  onPointerMove={moveDrag}
                  onPointerUp={() => endDrag(day, windowLen)}
                  onPointerCancel={() => setDrag(null)}
                  title={`${day.sport_type ? SPORT_LABELS[day.sport_type] : 'sport'} om ${fmt(sportMin)} — sleep om te verschuiven`}
                >
                  {day.sport_type ? SPORT_LABELS[day.sport_type].slice(0, 1).toUpperCase() : ''}
                  <em>{fmt(sportMin)}</em>
                </span>
              )}
              {adviseMin !== null && adviseMin >= DAY_START && (
                <span className="wg-advise" style={{ top: y(adviseMin) }}>
                  <em>▶ {fmt(adviseMin)}</em>
                </span>
              )}
              {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
                <span className="wg-now" style={{ top: y(nowMin) }} />
              )}
            </span>
          </div>
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
  if (day.sport_type)
    parts.push(`sport: ${SPORT_LABELS[day.sport_type]}${day.sport_time ? ` om ${day.sport_time.slice(0, 5)}` : ''}`)
  if (worst === 'warning') parts.push('waarschuwing')
  return parts.join(', ')
}
