// Eén maaltijdslot als kaart: tijd + slotlabel, maaltijd, macro's (altijd
// berekend, uit planned.macros), portie-flexregel, ingrediëntchips,
// beoordeling, gegeten-status en de uitklapbare alternatieven.

import { useMemo, useState } from 'react'
import { LABEL_PINNED } from '../../lib/nutrition/copy'
import {
  alternativesForSlot,
  excludedOptionalIds,
  hashStringToSeed,
  mulberry32,
} from '../../lib/nutrition/engine'
import { effectiveGrams, formatIngredientAmount } from '../../lib/nutrition/macros'
import {
  mealPrefKey,
  SLOT_LABELS,
  type DayContext,
  type Ingredient,
  type MealPrefState,
  type PlannedSlot,
} from '../../lib/nutrition/types'
import { formatTime } from '../../lib/time'
import AlternativesList from './AlternativesList'
import IngredientSheet from './IngredientSheet'
import PrefButtons from './PrefButtons'
import RationaleBlock from './RationaleBlock'
import { useNutritionData } from './useNutrition'

export default function SlotCard({
  date,
  ctx,
  planned,
  eaten,
}: {
  date: Date
  ctx: DayContext
  planned: PlannedSlot
  eaten: boolean
}) {
  const {
    mealsById,
    ingredientsById,
    meals,
    nutritionProfile,
    prefs,
    slotsFor,
    historyFor,
    rateMeal,
    swapMeal,
    setEaten,
  } = useNutritionData()

  const [showInfo, setShowInfo] = useState(false)
  const [showAlts, setShowAlts] = useState(false)
  const [confirmDislike, setConfirmDislike] = useState(false)
  const [sheetIngredient, setSheetIngredient] = useState<Ingredient | null>(null)

  const dk = ctx.dateKey
  const meal = mealsById[planned.mealId]

  const alternatives = useMemo(() => {
    if (!meal) return []
    return alternativesForSlot(
      {
        ctx,
        slots: slotsFor(ctx),
        meals,
        ingredientsById,
        profile: nutritionProfile,
        prefs,
        history: historyFor(dk),
        rng: mulberry32(hashStringToSeed(dk + planned.slot)),
      },
      planned.slot,
      meal.id,
    )
  }, [ctx, dk, historyFor, ingredientsById, meal, meals, nutritionProfile, planned.slot, prefs, slotsFor])

  if (!meal) return null

  const pref = prefs.meal[mealPrefKey(meal.id, planned.slot)]
  const excluded = excludedOptionalIds(meal, prefs)
  // Stil verwijderde optionals zitten hier al niet meer in.
  const rows = effectiveGrams(meal, ingredientsById, {
    proteinScale: planned.proteinScale,
    excludeIngredientIds: excluded,
  })

  const scaled = Math.abs(planned.proteinScale - 1) > 0.001
  const baseGrams: Record<string, number> = {}
  for (const mi of meal.ingredients) baseGrams[mi.ingredientId] = mi.grams
  const changedRows = scaled
    ? rows.filter((r) => Math.abs(r.grams - (baseGrams[r.ingredient.id] ?? r.grams)) > 0.5)
    : []
  const scaleLabel = planned.proteinScale.toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  function handlePref(state: MealPrefState | null) {
    if (state === 'dislike') {
      setConfirmDislike(true)
      return
    }
    rateMeal(meal.id, planned.slot, state).catch(() => {})
  }

  async function confirmDislikeNow() {
    setConfirmDislike(false)
    await rateMeal(meal.id, planned.slot, 'dislike').catch(() => {})
    // Slot direct hergenereren: wissel naar het hoogst scorende alternatief.
    const best = alternatives[0]
    if (best) await swapMeal(date, planned.slot, best.meal.id).catch(() => {})
  }

  return (
    <section className={`card slot-card ${eaten ? 'eaten' : ''}`} aria-label={SLOT_LABELS[planned.slot]}>
      <div className="slot-head">
        <span className="slot-time">{formatTime(planned.spec.timeMin)}</span>
        <span className="slot-label">{SLOT_LABELS[planned.slot]}</span>
        {(planned.pinned || pref === 'superlike') && (
          <span className="pin-badge">★ {LABEL_PINNED}</span>
        )}
      </div>

      <h3 className="slot-meal-name">
        {meal.name} <span className="muted small slot-short">— {meal.rationaleShort}</span>
      </h3>

      <p className="slot-macros small muted">
        {Math.round(planned.macros.kcal)} kcal · {Math.round(planned.macros.proteinG)} g eiwit ·{' '}
        {meal.prepMinutes} min bereiding
      </p>

      {changedRows.length > 0 && (
        <p className="small muted portion-line">
          {changedRows
            .map(
              (r) =>
                `${formatIngredientAmount(r.ingredient, r.grams)} i.p.v. ${Math.round(
                  baseGrams[r.ingredient.id],
                )} g`,
            )
            .join(', ')}{' '}
          <span className="faint">(×{scaleLabel})</span>
        </p>
      )}

      <div className="chips">
        {rows.map((r) => (
          <button
            key={r.ingredient.id}
            className="chip"
            aria-label={`Details van ${r.ingredient.name}`}
            onClick={() => setSheetIngredient(r.ingredient)}
          >
            {r.ingredient.name}
          </button>
        ))}
      </div>

      <div className="slot-actions">
        <button
          className="info-btn"
          aria-label="Waarom deze maaltijd op dit moment?"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          i
        </button>
        <PrefButtons value={pref} onChange={handlePref} />
        <button
          className={`eaten-btn ${eaten ? 'on' : ''}`}
          aria-pressed={eaten}
          aria-label={`${SLOT_LABELS[planned.slot]} gegeten`}
          onClick={() => setEaten(date, planned.slot, meal.id, !eaten).catch(() => {})}
        >
          {eaten ? '✓ Gegeten' : 'Gegeten?'}
        </button>
        <button
          className="alt-toggle"
          aria-expanded={showAlts}
          onClick={() => setShowAlts((v) => !v)}
        >
          Alternatieven ({alternatives.length}) {showAlts ? '▴' : '▾'}
        </button>
      </div>

      {confirmDislike && (
        <div className="advice caution" role="alertdialog" aria-label="Niet meer voorstellen?">
          <span>
            Niet meer voorstellen op dit moment? Je krijgt direct een ander voorstel voor dit slot.
            <span className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={confirmDislikeNow}>
                Ja, vervang
              </button>
              <button className="btn btn-ghost small" onClick={() => setConfirmDislike(false)}>
                Annuleer
              </button>
            </span>
          </span>
        </div>
      )}

      {showInfo && (
        <RationaleBlock
          slot={planned.slot}
          dayType={ctx.dayType}
          badNight={ctx.window.badNight}
          mealRationale={meal.rationale}
        />
      )}

      {showAlts && (
        <AlternativesList date={date} ctx={ctx} slot={planned.slot} alternatives={alternatives} />
      )}

      {sheetIngredient && (
        <IngredientSheet ingredient={sheetIngredient} onClose={() => setSheetIngredient(null)} />
      )}
    </section>
  )
}
