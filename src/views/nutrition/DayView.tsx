// Dagweergave (§11): datumnavigatie, dagheader met eetvensterbalk, live
// dagmeters, warnings, vier slotkaarten, dranken en regenereren.

import { useEffect, useMemo, useState } from 'react'
import BadNightButton from '../../components/BadNightButton'
import { EMPTY_TOTALS, sumTotals } from '../../lib/nutrition/macros'
import { DAY_TYPE_LABELS } from '../../lib/nutrition/types'
import { dateKey, formatTime } from '../../lib/time'
import DrinksWidget from './DrinksWidget'
import Meters from './Meters'
import SlotCard from './SlotCard'
import { useNutritionData } from './useNutrition'

function addDays(d: Date, days: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + days)
  return c
}

function fmtRemaining(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}u ${m}m` : `${m}m`
}

export default function DayView() {
  const { contextFor, planResultFor, logsFor, ensurePlan, regenerate, nutritionProfile, loading } =
    useNutritionData()

  const [date, setDate] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())
  const [regenBusy, setRegenBusy] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  // Bij mount en elke datumwissel: plan garanderen (fire-and-forget).
  const dk = dateKey(date)
  useEffect(() => {
    ensurePlan(date).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dk, ensurePlan])

  const ctx = useMemo(() => contextFor(date), [contextFor, date])
  const plan = useMemo(() => planResultFor(date), [planResultFor, date])

  const isToday = dk === dateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const { openMin, closeMin } = ctx.window
  const inWindow = nowMin >= openMin && nowMin < closeMin

  let windowText: string | null = null
  if (isToday) {
    if (nowMin < openMin) windowText = `opent over ${fmtRemaining(openMin - nowMin)}`
    else if (nowMin < closeMin) windowText = `sluit over ${fmtRemaining(closeMin - nowMin)}`
    else windowText = 'venster gesloten'
  }

  const eatenSlots = useMemo(
    () => new Set(logsFor(dk).filter((l) => l.status === 'eaten').map((l) => l.slot)),
    [dk, logsFor],
  )
  const eatenTotals = useMemo(
    () =>
      plan
        ? sumTotals(plan.slots.filter((s) => eatenSlots.has(s.slot)).map((s) => s.macros))
        : { ...EMPTY_TOTALS },
    [eatenSlots, plan],
  )

  const pct = (min: number) => `${Math.max(0, Math.min(100, (min / 1440) * 100))}%`

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card stack nday-head">
        <div className="spread">
          <button
            className="btn btn-ghost nday-arrow"
            aria-label="Vorige dag"
            onClick={() => setDate((d) => addDays(d, -1))}
          >
            ‹
          </button>
          <div className="nday-title">
            <h2>{date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div className="nday-badges">
              <span className="day-badge">{DAY_TYPE_LABELS[ctx.dayType]}</span>
              {ctx.window.badNight && <span className="day-badge recover">Hersteldag — geen vast</span>}
            </div>
          </div>
          <button
            className="btn btn-ghost nday-arrow"
            aria-label="Volgende dag"
            onClick={() => setDate((d) => addDays(d, 1))}
          >
            ›
          </button>
        </div>

        {!isToday && (
          <button className="link-btn nday-today" onClick={() => setDate(new Date())}>
            vandaag
          </button>
        )}

        <div className="nwin" aria-label="Eetvenster">
          <div className="nwin-track">
            <div
              className="nwin-fill"
              style={{ left: pct(openMin), width: `calc(${pct(closeMin)} - ${pct(openMin)})` }}
            />
            {isToday && <div className="nwin-now" style={{ left: pct(nowMin) }} aria-hidden />}
          </div>
          <div className="nwin-times small muted">
            <span>{formatTime(openMin)}</span>
            {windowText && <span className="nwin-remaining">{windowText}</span>}
            <span>{formatTime(closeMin)}</span>
          </div>
        </div>
      </section>

      {isToday && <BadNightButton />}

      {plan && (
        <Meters
          eaten={eatenTotals}
          planned={plan.totals}
          profile={nutritionProfile}
          nutBudgetG={ctx.nutBudgetG}
        />
      )}

      {plan?.warnings.map((w, i) => (
        <div className="advice caution" role="status" key={i}>
          <span>{w}</span>
        </div>
      ))}

      {plan ? (
        <div className="slot-grid">
          {[...plan.slots]
            .sort((a, b) => a.spec.timeMin - b.spec.timeMin)
            .map((s) => (
              <SlotCard key={s.slot} date={date} ctx={ctx} planned={s} eaten={eatenSlots.has(s.slot)} />
            ))}
        </div>
      ) : (
        !loading && (
          <section className="card stack" style={{ alignItems: 'center' }}>
            <p className="muted small">Nog geen dagplan voor deze dag.</p>
            <button className="btn btn-primary" onClick={() => ensurePlan(date).catch(() => {})}>
              Genereer dagplan
            </button>
          </section>
        )
      )}

      <DrinksWidget isToday={isToday} inWindow={isToday && inWindow} />

      {plan && (
        <button
          className="btn btn-ghost btn-wide"
          disabled={regenBusy}
          onClick={async () => {
            setRegenBusy(true)
            try {
              await regenerate(date)
            } catch {
              // stil: de volgende poging kan gewoon opnieuw
            } finally {
              setRegenBusy(false)
            }
          }}
        >
          {regenBusy ? 'Bezig…' : 'Regenereer deze dag'}
        </button>
      )}
    </div>
  )
}
