import { useState } from 'react'
import { formatHm } from '../lib/time'

/**
 * De drie variabelen van een lopende vast, naast elkaar en direct bedienbaar:
 * [ start vast ] [ protocol (16:8) ] [ einde vast ]
 * Start en einde zijn klikbaar en openen een tijdveld. De duur ligt vast via
 * het protocol, dus het andere uiteinde schuift altijd mee — dezelfde regel
 * als bij het draaien aan de ring.
 */

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'gisteren ', 'morgen ' of een korte datum; leeg als het vandaag is. */
function dayPrefix(d: Date, now: Date): string {
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(now)) return ''
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key(d) === key(yesterday)) return 'gisteren '
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (key(d) === key(tomorrow)) return 'morgen '
  return `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} `
}

export default function FastEndpoints({
  start,
  end,
  protocol,
  onChangeStart,
}: {
  start: Date
  end: Date
  /** Naam van het vastendieet, bv. '16:8'. */
  protocol: string
  onChangeStart: (newStart: Date) => void
}) {
  const [editing, setEditing] = useState<'start' | 'end' | null>(null)

  const now = new Date()
  const durationMs = Math.max(60000, end.getTime() - start.getTime())
  const durationH = Math.round(durationMs / 3600000)

  function applyInput(value: string) {
    if (!value) return
    const chosen = new Date(value)
    if (Number.isNaN(chosen.getTime())) return
    // Einde gekozen? Dan schuift de start mee: duur blijft het protocol volgen.
    let newStart = editing === 'end' ? new Date(chosen.getTime() - durationMs) : chosen
    // Een vast kan niet in de toekomst begonnen zijn.
    if (newStart.getTime() > Date.now()) newStart = new Date()
    onChangeStart(newStart)
  }

  return (
    <div className="fast-endpoints">
      <button
        className={`fe-chip fe-start ${editing === 'start' ? 'on' : ''}`}
        onClick={() => setEditing(editing === 'start' ? null : 'start')}
        aria-expanded={editing === 'start'}
        aria-label={`Start van het vasten: ${dayPrefix(start, now)}${formatHm(start)}. Tik om aan te passen.`}
      >
        <span className="fe-label">start vast</span>
        <span className="fe-time">
          {dayPrefix(start, now)}
          {formatHm(start)}
        </span>
      </button>

      <div className="fe-proto" title={`Vastenduur ${durationH} uur — wijzig je protocol via Schema`}>
        <span className="fe-proto-name">{protocol}</span>
        <span className="fe-proto-sub">{durationH}u vast</span>
      </div>

      <button
        className={`fe-chip fe-end ${editing === 'end' ? 'on' : ''}`}
        onClick={() => setEditing(editing === 'end' ? null : 'end')}
        aria-expanded={editing === 'end'}
        aria-label={`Einde van het vasten: ${dayPrefix(end, now)}${formatHm(end)}. Tik om aan te passen.`}
      >
        <span className="fe-label">einde vast</span>
        <span className="fe-time">
          {dayPrefix(end, now)}
          {formatHm(end)}
        </span>
      </button>

      {editing && (
        <div className="fe-editor card stack">
          <div className="field">
            <label htmlFor="fe-input">
              {editing === 'start' ? 'Begon met vasten om' : 'Vast klaar om'}
            </label>
            <input
              id="fe-input"
              type="datetime-local"
              value={toLocalInputValue(editing === 'start' ? start : end)}
              max={editing === 'start' ? toLocalInputValue(now) : undefined}
              onChange={(e) => applyInput(e.target.value)}
            />
          </div>
          <p className="faint">
            Je vast duurt {durationH} uur ({protocol}), dus het andere uiteinde schuift mee.
            Finetunen kan ook door aan de ring te draaien.
          </p>
          <button className="btn btn-ghost small" onClick={() => setEditing(null)}>
            Klaar
          </button>
        </div>
      )}
    </div>
  )
}
