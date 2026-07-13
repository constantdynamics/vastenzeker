import { useMemo, useState } from 'react'
import { useAppData } from '../App'
import TipCard from '../components/TipCard'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/types'
import type { TipCategory } from '../lib/types'

export default function Favorites() {
  const { tips, favorites, toggleFavorite } = useAppData()
  const [filter, setFilter] = useState<TipCategory | 'alle'>('alle')

  const favTips = useMemo(
    () => tips.filter((t) => favorites.has(t.id) && (filter === 'alle' || t.category === filter)),
    [tips, favorites, filter],
  )

  const presentCategories = useMemo(() => {
    const cats = new Set(tips.filter((t) => favorites.has(t.id)).map((t) => t.category))
    return [...cats]
  }, [tips, favorites])

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2>Je hartjes</h2>

      {presentCategories.length > 1 && (
        <div className="chips">
          <button
            className={`chip ${filter === 'alle' ? 'on' : ''}`}
            onClick={() => setFilter('alle')}
          >
            alle
          </button>
          {presentCategories.map((c) => (
            <button
              key={c}
              className={`chip ${filter === c ? 'on' : ''}`}
              style={{ ['--chip-color' as string]: CATEGORY_COLORS[c] }}
              onClick={() => setFilter(c)}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {favTips.length === 0 ? (
        <div className="card">
          <p className="muted small">
            {favorites.size === 0
              ? 'Nog geen favorieten. Zie je op het hoofdscherm een tip die raakt, tik dan op het hartje.'
              : 'Geen favorieten in deze categorie.'}
          </p>
        </div>
      ) : (
        <div className="fav-grid">
          {favTips.map((t) => (
            <TipCard
              key={t.id}
              tip={t}
              isFavorite={favorites.has(t.id)}
              onToggleFavorite={() => toggleFavorite(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
