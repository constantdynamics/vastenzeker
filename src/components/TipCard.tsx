import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/types'
import type { Tip } from '../lib/types'

export default function TipCard({
  tip,
  isFavorite,
  onToggleFavorite,
  onNext,
}: {
  tip: Tip
  isFavorite: boolean
  onToggleFavorite: () => void
  onNext?: () => void
}) {
  const accent = CATEGORY_COLORS[tip.category]
  return (
    <article className="card card-accent" style={{ ['--accent' as string]: accent }}>
      <div className="spread">
        <span className="tip-cat">{CATEGORY_LABELS[tip.category]}</span>
        <button
          className={`heart ${isFavorite ? 'on' : ''}`}
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'}
          aria-pressed={isFavorite}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      </div>
      <h3 className="tip-title">{tip.title}</h3>
      <p className="tip-body">{tip.body}</p>
      {tip.evidence && <p className="tip-evidence">Eerlijk is eerlijk: {tip.evidence}.</p>}
      {onNext && (
        <button className="btn btn-ghost small" style={{ marginTop: 10, color: 'var(--text-dim)' }} onClick={onNext}>
          Volgende tip →
        </button>
      )}
    </article>
  )
}
