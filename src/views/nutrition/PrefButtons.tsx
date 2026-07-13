// Kleine helper: de drie beoordelingsknoppen ♡ ★ ✕. Nogmaals tikken op de
// actieve staat zet hem terug naar neutraal (null).

import type { MealPrefState } from '../../lib/nutrition/types'

const OPTIONS: { state: MealPrefState; icon: string; onIcon: string; label: string }[] = [
  { state: 'like', icon: '♡', onIcon: '♥', label: 'Vind ik lekker' },
  { state: 'superlike', icon: '★', onIcon: '★', label: 'Superlike — vast op dit moment' },
  { state: 'dislike', icon: '✕', onIcon: '✕', label: 'Niet meer voorstellen' },
]

export default function PrefButtons({
  value,
  onChange,
}: {
  value: MealPrefState | undefined
  onChange: (state: MealPrefState | null) => void
}) {
  return (
    <div className="pref-btns" role="group" aria-label="Beoordeling">
      {OPTIONS.map((o) => {
        const on = value === o.state
        return (
          <button
            key={o.state}
            className={`pref-btn ${o.state} ${on ? 'on' : ''}`}
            aria-label={o.label}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              onChange(on ? null : o.state)
            }}
          >
            {on ? o.onIcon : o.icon}
          </button>
        )
      })}
    </div>
  )
}
