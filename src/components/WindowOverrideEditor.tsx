import { useState } from 'react'
import { useAppData } from '../App'
import { dateKey, formatTime, planForDate } from '../lib/time'

/**
 * Handmatige correctie van het eetvenster voor één specifieke dag — ook
 * achteraf. Het weekschema (Schema-tabblad) blijft het terugkerende patroon;
 * dit corrigeert alleen déze datum, in dezelfde if_fasts-kolommen die de
 * status-engine (computeStatus/fastTarget) en de voedingsmodule al per dag
 * als override lezen. Zelfstandig herbruikbaar: geen props buiten de datum.
 */
export default function WindowOverrideEditor({ date }: { date: Date }) {
  const { profile, schedule, fasts, patchFast } = useAppData()
  const [expanded, setExpanded] = useState(false)

  const dk = dateKey(date)
  const fastRow = fasts.find((f) => f.day === dk)
  const plan = planForDate(date, profile, schedule)
  const overridden = Boolean(fastRow?.window_start || fastRow?.window_end)

  const startVal = fastRow?.window_start ? fastRow.window_start.slice(0, 5) : formatTime(plan.startMin)
  const endVal = fastRow?.window_end ? fastRow.window_end.slice(0, 5) : formatTime(plan.endMin)

  if (!expanded) {
    return (
      <button className="link-btn window-override-toggle" onClick={() => setExpanded(true)}>
        {overridden ? `Eetvenster aangepast: ${startVal}–${endVal}` : 'Eetvenster (open/sluit) aanpassen'}
      </button>
    )
  }

  return (
    <div className="card stack window-override">
      <p className="muted small">
        Corrigeer hoe laat het venster op deze dag écht opende of gaat sluiten — ook achteraf. Dit
        past alleen deze dag aan; je schema (tabblad Schema) blijft ongewijzigd.
      </p>
      <div className="row">
        <div className="field">
          <label htmlFor={`win-ov-start-${dk}`}>Opende om</label>
          <input
            id={`win-ov-start-${dk}`}
            type="time"
            value={startVal}
            onChange={(e) => e.target.value && patchFast(dk, { window_start: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`win-ov-end-${dk}`}>Sluit om</label>
          <input
            id={`win-ov-end-${dk}`}
            type="time"
            value={endVal}
            onChange={(e) => e.target.value && patchFast(dk, { window_end: e.target.value })}
          />
        </div>
      </div>
      <div className="row">
        {overridden && (
          <button
            className="btn btn-ghost small"
            onClick={() => patchFast(dk, { window_start: null, window_end: null })}
          >
            Terug naar schema
          </button>
        )}
        <button className="btn btn-ghost small" onClick={() => setExpanded(false)}>
          Klaar
        </button>
      </div>
    </div>
  )
}
