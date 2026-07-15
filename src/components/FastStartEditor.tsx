import { useState } from 'react'
import { useAppData } from '../App'
import { formatHm } from '../lib/time'

/**
 * Correctie van hoe laat het huidige vasten écht begon — ook met
 * terugwerkende kracht. Dit is een ander veld dan het eetvenster
 * (window_start/window_end): `started_at` is precies wat computeStatus en
 * fastTarget gebruiken voor de lopende teller, dus een wijziging hier werkt
 * direct door in de ring/countdown op dit scherm, zonder extra syncstap.
 */

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function FastStartEditor() {
  const { activeFast, patchFast, upsertToday } = useAppData()
  const [expanded, setExpanded] = useState(false)

  const nowLocal = toLocalInputValue(new Date())

  function parseInput(value: string): Date | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  // Er loopt al een vast: starttijd corrigeren, direct zichtbaar in de teller.
  if (activeFast?.started_at) {
    const started = new Date(activeFast.started_at)

    if (!expanded) {
      return (
        <button className="link-btn fast-start-toggle" onClick={() => setExpanded(true)}>
          Gestart om {formatHm(started)} — starttijd aanpassen
        </button>
      )
    }

    return (
      <div className="card stack fast-start-editor">
        <p className="muted small">
          Klopt de starttijd van je huidige vasten niet? Pas hem aan — de teller en je doeltijd
          herrekenen meteen.
        </p>
        <div className="field">
          <label htmlFor="fast-start-input">Begon met vasten om</label>
          <input
            id="fast-start-input"
            type="datetime-local"
            value={toLocalInputValue(started)}
            max={nowLocal}
            onChange={(e) => {
              const d = parseInput(e.target.value)
              if (d) patchFast(activeFast.day, { started_at: d.toISOString() })
            }}
          />
        </div>
        <button className="btn btn-ghost small" onClick={() => setExpanded(false)}>
          Klaar
        </button>
      </div>
    )
  }

  // Nog geen actief vasten: toestaan om alsnog vanaf een eerder moment te starten.
  if (!expanded) {
    return (
      <button className="link-btn fast-start-toggle" onClick={() => setExpanded(true)}>
        Al eerder begonnen met vasten?
      </button>
    )
  }

  return (
    <div className="card stack fast-start-editor">
      <p className="muted small">
        Startte je je vasten eigenlijk al eerder (bijvoorbeeld gisteravond)? Geef het moment op —
        de teller begint dan meteen vanaf die tijd.
      </p>
      <div className="field">
        <label htmlFor="fast-start-input-new">Begon met vasten om</label>
        <input
          id="fast-start-input-new"
          type="datetime-local"
          defaultValue={nowLocal}
          max={nowLocal}
          onChange={(e) => {
            const d = parseInput(e.target.value)
            if (!d) return
            upsertToday({ status: 'active', started_at: d.toISOString(), ended_at: null })
            setExpanded(false)
          }}
        />
      </div>
      <button className="btn btn-ghost small" onClick={() => setExpanded(false)}>
        Annuleer
      </button>
    </div>
  )
}
