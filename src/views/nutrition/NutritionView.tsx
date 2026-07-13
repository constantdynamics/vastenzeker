import { useState } from 'react'
import { NutritionContext, useNutrition } from './useNutrition'
import DayView from './DayView'
import WeekView from './WeekView'
import ShoppingView from './ShoppingView'
import IngredientsView from './IngredientsView'
import './nutrition.css'

type SubView = 'dag' | 'week' | 'lijst' | 'ingredienten'

const SUBVIEWS: { key: SubView; label: string }[] = [
  { key: 'dag', label: 'Vandaag' },
  { key: 'week', label: 'Week' },
  { key: 'lijst', label: 'Boodschappen' },
  { key: 'ingredienten', label: 'Ingrediënten' },
]

export default function NutritionView() {
  const nutrition = useNutrition()
  const [view, setView] = useState<SubView>('dag')

  return (
    <NutritionContext.Provider value={nutrition}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="chips" role="tablist" aria-label="Voedingsweergave">
          {SUBVIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              className={`chip ${view === v.key ? 'on' : ''}`}
              style={{ ['--chip-color' as string]: 'var(--neon-teal)' }}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {nutrition.loading ? (
          <p className="muted small">Voedingsbibliotheek laden…</p>
        ) : (
          <>
            {view === 'dag' && <DayView />}
            {view === 'week' && <WeekView />}
            {view === 'lijst' && <ShoppingView />}
            {view === 'ingredienten' && <IngredientsView />}
          </>
        )}
      </div>
    </NutritionContext.Provider>
  )
}
