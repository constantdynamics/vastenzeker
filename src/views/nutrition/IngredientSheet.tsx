// Onderscherm met ingrediëntdetails: macro's per 100 g, per-stuk-info,
// rationale (letterlijk uit de spec) en ♡/✕ op ingrediëntniveau. Een dislike
// op een ingrediënt dat primary is in 3+ maaltijden vraagt eerst bevestiging.

import { useState } from 'react'
import { dislikeImpactWarning, WHOLE_NUTS_RATIONALE } from '../../lib/nutrition/copy'
import { mealsWithPrimaryIngredient } from '../../lib/nutrition/engine'
import type { Ingredient, IngredientPrefState } from '../../lib/nutrition/types'
import { useNutritionData } from './useNutrition'

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('nl-NL')
}

export default function IngredientSheet({
  ingredient,
  onClose,
}: {
  ingredient: Ingredient
  onClose: () => void
}) {
  const { meals, prefs, rateIngredient } = useNutritionData()
  const [confirming, setConfirming] = useState(false)
  const pref = prefs.ingredient[ingredient.id]
  const impacted = mealsWithPrimaryIngredient(ingredient.id, meals).length

  function setPref(state: IngredientPrefState) {
    if (pref === state) {
      rateIngredient(ingredient.id, null).catch(() => {})
      return
    }
    if (state === 'dislike' && impacted >= 3) {
      setConfirming(true)
      return
    }
    rateIngredient(ingredient.id, state).catch(() => {})
  }

  return (
    <div className="nsheet-backdrop" onClick={onClose}>
      <div
        className="nsheet"
        role="dialog"
        aria-modal="true"
        aria-label={ingredient.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nsheet-head">
          <h3>{ingredient.name}</h3>
          <button className="nsheet-close" aria-label="Sluiten" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="faint">Per 100 g</p>
        <div className="nsheet-macros">
          <div className="cell">
            <b>{fmt(ingredient.kcal100)}</b>
            <span>kcal</span>
          </div>
          <div className="cell">
            <b>{fmt(ingredient.protein100)}</b>
            <span>eiwit</span>
          </div>
          <div className="cell">
            <b>{fmt(ingredient.carb100)}</b>
            <span>koolh.</span>
          </div>
          <div className="cell">
            <b>{fmt(ingredient.fat100)}</b>
            <span>vet</span>
          </div>
          <div className="cell">
            <b>{fmt(ingredient.fiber100)}</b>
            <span>vezels</span>
          </div>
        </div>

        {ingredient.pieceGrams !== null && ingredient.pieceGrams > 0 && (
          <p className="small muted">1 stuk ≈ {fmt(ingredient.pieceGrams)} g</p>
        )}

        {ingredient.rationale && <p className="tip-body">{ingredient.rationale}</p>}
        {ingredient.isNut && <p className="faint">{WHOLE_NUTS_RATIONALE}</p>}

        {confirming ? (
          <div className="advice caution" role="alertdialog" aria-label="Ingrediënt verwijderen?">
            <span>
              {dislikeImpactWarning(impacted)}
              <span className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn small"
                  onClick={() => {
                    setConfirming(false)
                    rateIngredient(ingredient.id, 'dislike').catch(() => {})
                  }}
                >
                  Ja, doorgaan
                </button>
                <button className="btn btn-ghost small" onClick={() => setConfirming(false)}>
                  Annuleer
                </button>
              </span>
            </span>
          </div>
        ) : (
          <div className="pref-btns" role="group" aria-label={`Beoordeling ${ingredient.name}`}>
            <button
              className={`pref-btn like ${pref === 'like' ? 'on' : ''}`}
              aria-label="Vind ik lekker"
              aria-pressed={pref === 'like'}
              onClick={() => setPref('like')}
            >
              {pref === 'like' ? '♥' : '♡'}
            </button>
            <button
              className={`pref-btn dislike ${pref === 'dislike' ? 'on' : ''}`}
              aria-label="Niet lekker — liever niet gebruiken"
              aria-pressed={pref === 'dislike'}
              onClick={() => setPref('dislike')}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
