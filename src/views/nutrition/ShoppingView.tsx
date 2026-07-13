// Boodschappenlijst (§11): aggregeert de geplande week per ingrediënt,
// gegroepeerd per categorie, met persistente vinkjes per week in localStorage.

import { useEffect, useMemo, useState } from 'react'
import { formatIngredientAmount } from '../../lib/nutrition/macros'
import { buildShoppingList } from '../../lib/nutrition/shopping'
import type { Meal } from '../../lib/nutrition/types'
import { dateKey } from '../../lib/time'
import { useNutritionData } from './useNutrition'
import { WeekNav, weekDates } from './WeekView'

function loadChecked(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // corrupte opslag: begin gewoon met een lege lijst
  }
  return new Set()
}

export default function ShoppingView() {
  const data = useNutritionData()
  const [weekOffset, setWeekOffset] = useState(0)
  const [generating, setGenerating] = useState(false)

  const dates = useMemo(() => weekDates(weekOffset), [weekOffset])
  const storageKey = `vz_shop_v1:${dateKey(dates[0])}`

  const [checked, setChecked] = useState<Set<string>>(() => loadChecked(storageKey))
  useEffect(() => {
    setChecked(loadChecked(storageKey))
  }, [storageKey])

  const toggle = (ingredientId: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(ingredientId)) next.delete(ingredientId)
      else next.add(ingredientId)
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // opslag vol of geblokkeerd: vinkje geldt dan alleen deze sessie
      }
      return next
    })
  }

  // Per geplande dag: elk slot met zijn portie-flex de lijst in. Stil
  // verwijderde optionals regelt buildShoppingList zelf via prefs.
  const { groups, plannedDays } = useMemo(() => {
    const entries: { meal: Meal; proteinScale: number }[] = []
    let planned = 0
    for (const date of dates) {
      const result = data.planResultFor(date)
      if (!result) continue
      planned++
      for (const s of result.slots) {
        const meal = data.mealsById[s.mealId]
        if (meal) entries.push({ meal, proteinScale: s.proteinScale })
      }
    }
    return {
      groups: buildShoppingList(entries, data.ingredientsById, data.prefs),
      plannedDays: planned,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, data.planResultFor, data.mealsById, data.ingredientsById, data.prefs])

  const generate = async () => {
    setGenerating(true)
    try {
      await data.generateWeek(dates)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="stack nplan">
      <WeekNav weekOffset={weekOffset} onWeekOffset={setWeekOffset} />

      {plannedDays === 0 ? (
        <div className="card stack">
          <p className="muted">Nog geen weekplan — genereer eerst je week.</p>
          <button
            className="btn btn-primary btn-wide"
            onClick={() => void generate()}
            disabled={generating}
            aria-label="Genereer deze week"
          >
            {generating ? 'Bezig met plannen…' : 'Genereer deze week'}
          </button>
        </div>
      ) : (
        <>
          <p className="muted small">
            Boodschappen voor {plannedDays} geplande {plannedDays === 1 ? 'dag' : 'dagen'}.
          </p>
          {groups.map((group) => (
            <section key={group.category} className="card">
              <h3>{group.label}</h3>
              <ul className="nshop-list">
                {group.items.map((item) => {
                  const done = checked.has(item.ingredient.id)
                  return (
                    <li key={item.ingredient.id} className={`nshop-item ${done ? 'done' : ''}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggle(item.ingredient.id)}
                          aria-label={`${item.ingredient.name} afvinken`}
                        />
                        <span className="nshop-name">
                          {formatIngredientAmount(item.ingredient, item.grams)}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          <p className="faint">
            Hoeveelheden volgen de aangepaste porties (portie-flex) en laten weggestreepte
            ingrediënten weg.
          </p>
        </>
      )}
    </div>
  )
}
