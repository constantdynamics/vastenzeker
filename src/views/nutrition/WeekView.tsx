// Weekweergave (§11): maandag t/m zondag plannen, navigeren en regenereren.
// Exporteert ook de week-helpers en de navigatiebalk voor ShoppingView.

import { useMemo, useState } from 'react'
import './nutrition-plan.css'
import { LABEL_PINNED } from '../../lib/nutrition/copy'
import { DAY_TYPE_LABELS, type DayType } from '../../lib/nutrition/types'
import { dateKey, formatTime, weekdayOf } from '../../lib/time'
import { WEEKDAY_FULL, WEEKDAY_LABELS } from '../../lib/types'
import { useNutritionData } from './useNutrition'

export const DAY_TYPE_COLORS: Record<DayType, string> = {
  FASTED_STRENGTH: 'var(--neon-magenta)',
  FED_STRENGTH: 'var(--neon-purple)',
  CARDIO: 'var(--neon-orange)',
  REST: 'var(--text-dim)',
}

/** Maandag van de week met offset t.o.v. deze week (0 = deze week). */
export function mondayOfWeek(weekOffset: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - weekdayOf(d) + weekOffset * 7)
  return d
}

/** De zeven datums (ma–zo) van de week met offset. */
export function weekDates(weekOffset: number): Date[] {
  const monday = mondayOfWeek(weekOffset)
  return Array.from({ length: 7 }, (_, i) => {
    const c = new Date(monday)
    c.setDate(monday.getDate() + i)
    return c
  })
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export function WeekNav({
  weekOffset,
  onWeekOffset,
}: {
  weekOffset: number
  onWeekOffset: (offset: number) => void
}) {
  const dates = weekDates(weekOffset)
  return (
    <div className="nplan-weeknav">
      <button
        className="nplan-iconbtn"
        onClick={() => onWeekOffset(weekOffset - 1)}
        aria-label="Vorige week"
      >
        ‹
      </button>
      <div className="nplan-weeknav-label">
        <strong>
          {shortDate(dates[0])} – {shortDate(dates[6])}
        </strong>
        {weekOffset !== 0 && (
          <button className="link-btn" onClick={() => onWeekOffset(0)}>
            deze week
          </button>
        )}
      </div>
      <button
        className="nplan-iconbtn"
        onClick={() => onWeekOffset(weekOffset + 1)}
        aria-label="Volgende week"
      >
        ›
      </button>
    </div>
  )
}

export default function WeekView({ onOpenDay }: { onOpenDay?: (date: Date) => void }) {
  const data = useNutritionData()
  const [weekOffset, setWeekOffset] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [busyDay, setBusyDay] = useState<string | null>(null)

  const dates = useMemo(() => weekDates(weekOffset), [weekOffset])
  const todayKey = dateKey(new Date())

  const generate = async () => {
    setGenerating(true)
    try {
      await data.generateWeek(dates)
    } finally {
      setGenerating(false)
    }
  }

  const regenerateDay = async (date: Date) => {
    setBusyDay(dateKey(date))
    try {
      await data.regenerate(date)
    } finally {
      setBusyDay(null)
    }
  }

  const planDay = async (date: Date) => {
    setBusyDay(dateKey(date))
    try {
      await data.ensurePlan(date)
    } finally {
      setBusyDay(null)
    }
  }

  // Weektotalen over de geplande dagen — macro's altijd via planResultFor.
  const stats = useMemo(() => {
    let proteinG = 0
    let kcal = 0
    let planned = 0
    for (const date of dates) {
      const result = data.planResultFor(date)
      if (!result) continue
      proteinG += result.totals.proteinG
      kcal += result.totals.kcal
      planned++
    }
    if (planned === 0) return null
    return {
      proteinG: Math.round(proteinG / planned),
      kcal: Math.round(kcal / planned),
      planned,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, data.planResultFor])

  return (
    <div className="stack nplan">
      <WeekNav weekOffset={weekOffset} onWeekOffset={setWeekOffset} />

      <button
        className="btn btn-primary btn-wide"
        onClick={() => void generate()}
        disabled={generating}
        aria-label="Genereer deze week"
      >
        {generating ? 'Bezig met plannen…' : 'Genereer deze week'}
      </button>

      <div className="nweek-grid">
        {dates.map((date) => {
          const dk = dateKey(date)
          const isPast = dk < todayKey
          const stored = data.planFor(dk)
          const result = data.planResultFor(date)
          const dayType = stored?.dayType ?? data.contextFor(date).dayType
          const slots = stored
            ? Object.entries(stored.slots).sort((a, b) => a[1].timeMin - b[1].timeMin)
            : []
          return (
            <article key={dk} className={`card nweek-day ${dk === todayKey ? 'today' : ''}`}>
              <header className="nweek-day-head">
                {onOpenDay ? (
                  <button
                    className="nweek-date nweek-date-btn"
                    onClick={() => onOpenDay(date)}
                    aria-label={`Open ${WEEKDAY_FULL[weekdayOf(date)]} ${shortDate(date)} in de dagweergave`}
                  >
                    {WEEKDAY_LABELS[weekdayOf(date)]} {shortDate(date)} ›
                  </button>
                ) : (
                  <span className="nweek-date">
                    {WEEKDAY_LABELS[weekdayOf(date)]} {shortDate(date)}
                  </span>
                )}
                <span className="nweek-daytype" style={{ color: DAY_TYPE_COLORS[dayType] }}>
                  {DAY_TYPE_LABELS[dayType]}
                </span>
              </header>

              {stored ? (
                <>
                  <ul className="nweek-slots">
                    {slots.map(([slot, s]) => {
                      const meal = data.mealsById[s.mealId]
                      const proteinG = result?.slots.find((rs) => rs.slot === slot)?.macros
                        .proteinG
                      return (
                        <li key={slot} className="nweek-slot">
                          <span className="nweek-slot-time">{formatTime(s.timeMin)}</span>
                          <span className="nweek-slot-name">
                            {s.pinned && (
                              <span
                                className="nweek-pin"
                                title={LABEL_PINNED}
                                aria-label={LABEL_PINNED}
                              >
                                ★{' '}
                              </span>
                            )}
                            {meal?.name ?? 'Onbekende maaltijd'}
                          </span>
                          {proteinG !== undefined && (
                            <span className="nweek-slot-protein">{Math.round(proteinG)} g</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {!isPast && (
                    <button
                      className="nplan-iconbtn"
                      onClick={() => void regenerateDay(date)}
                      disabled={busyDay === dk}
                      aria-label="Regenereer deze dag"
                    >
                      {busyDay === dk ? '…' : '⟳'}
                    </button>
                  )}
                </>
              ) : (
                <div className="nweek-empty">
                  <span className="faint">{isPast ? '— geen plan bewaard' : '— nog geen plan'}</span>
                  {!isPast && (
                    <button
                      className="btn"
                      onClick={() => void planDay(date)}
                      disabled={busyDay === dk}
                      aria-label={`Plan ${WEEKDAY_FULL[weekdayOf(date)]} ${shortDate(date)}`}
                    >
                      {busyDay === dk ? '…' : 'Plan'}
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {stats && (
        <>
          <div className="card row">
            <div className="stat-tile">
              <div className="stat-value" style={{ color: 'var(--neon-lime)' }}>
                {stats.proteinG}
              </div>
              <div className="stat-label">g eiwit / dag</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value" style={{ color: 'var(--neon-cyan)' }}>
                {stats.kcal}
              </div>
              <div className="stat-label">kcal / dag</div>
            </div>
          </div>
          <p className="faint">
            Gemiddelden over {stats.planned} geplande {stats.planned === 1 ? 'dag' : 'dagen'} van
            deze week.
          </p>
        </>
      )}
    </div>
  )
}
