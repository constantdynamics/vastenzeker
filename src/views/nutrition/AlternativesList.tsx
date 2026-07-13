// Uitklapbare alternatievenlijst onder een slotkaart. Rij aantikken wisselt
// de maaltijd (swapMeal); de dagmacro's rekenen automatisch mee omdat
// planResultFor van de plan-state is afgeleid.

import { useState } from 'react'
import { LABEL_NEW } from '../../lib/nutrition/copy'
import {
  mealPrefKey,
  type Alternative,
  type DayContext,
  type MealSlot,
} from '../../lib/nutrition/types'
import PrefButtons from './PrefButtons'
import RationaleBlock from './RationaleBlock'
import { useNutritionData } from './useNutrition'

export default function AlternativesList({
  date,
  ctx,
  slot,
  alternatives,
}: {
  date: Date
  ctx: DayContext
  slot: MealSlot
  alternatives: Alternative[]
}) {
  const { prefs, rateMeal, swapMeal } = useNutritionData()
  const [infoId, setInfoId] = useState<string | null>(null)

  if (alternatives.length === 0) {
    return <p className="faint">Geen alternatieven beschikbaar voor dit moment.</p>
  }

  return (
    <div className="alt-list">
      {alternatives.map((a) => (
        <div key={a.meal.id}>
          <div className="alt-row">
            <button
              className="alt-main"
              aria-label={`Kies ${a.meal.name} voor dit moment`}
              onClick={() => swapMeal(date, slot, a.meal.id).catch(() => {})}
            >
              <span className="alt-name">
                {a.meal.name}
                {a.novel && <span className="new-badge">{LABEL_NEW}</span>}
              </span>
              <span className="alt-macros faint">
                {Math.round(a.macros.kcal)} kcal · {Math.round(a.macros.proteinG)} g eiwit ·{' '}
                {a.meal.prepMinutes} min
              </span>
            </button>
            <div className="alt-actions">
              <button
                className="info-btn"
                aria-label={`Waarom ${a.meal.name}?`}
                aria-expanded={infoId === a.meal.id}
                onClick={() => setInfoId(infoId === a.meal.id ? null : a.meal.id)}
              >
                i
              </button>
              <PrefButtons
                value={prefs.meal[mealPrefKey(a.meal.id, slot)]}
                onChange={(state) => rateMeal(a.meal.id, slot, state).catch(() => {})}
              />
            </div>
          </div>
          {infoId === a.meal.id && (
            <RationaleBlock
              slot={slot}
              dayType={ctx.dayType}
              badNight={ctx.window.badNight}
              mealRationale={a.meal.rationale}
            />
          )}
        </div>
      ))}
    </div>
  )
}
