// Ingrediëntenscherm (§11): zoeken, filteren, beoordelen (♥/✕ met
// impact-bevestiging) en producten toevoegen via Open Food Facts.

import { useMemo, useState } from 'react'
import { dislikeImpactWarning } from '../../lib/nutrition/copy'
import { searchOpenFoodFacts, type OffCandidate } from '../../lib/nutrition/data'
import { mealsWithPrimaryIngredient } from '../../lib/nutrition/engine'
import {
  CATEGORY_ORDER,
  INGREDIENT_CATEGORY_LABELS,
  type Ingredient,
  type IngredientCategory,
} from '../../lib/nutrition/types'
import IngredientSheet from './IngredientSheet'
import { useNutritionData } from './useNutrition'

type Filter = 'all' | 'rated' | 'disliked' | IngredientCategory

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Alles' },
  ...CATEGORY_ORDER.map((c) => ({ key: c as Filter, label: INGREDIENT_CATEGORY_LABELS[c] })),
  { key: 'rated', label: 'Beoordeeld' },
  { key: 'disliked', label: 'Weggestreept' },
]

/** "3,4" in plaats van "3.4" — Nederlandse notatie, één decimaal. */
function fmtNum(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return String(rounded).replace('.', ',')
}

export default function IngredientsView() {
  const data = useNutritionData()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sheetId, setSheetId] = useState<string | null>(null)

  // Open Food Facts
  const [offQuery, setOffQuery] = useState('')
  const [offBusy, setOffBusy] = useState(false)
  const [offResults, setOffResults] = useState<OffCandidate[] | null>(null)
  const [offMessage, setOffMessage] = useState<string | null>(null)
  const [offCats, setOffCats] = useState<Record<string, IngredientCategory>>({})
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.ingredients.filter((ing) => {
      if (q && !ing.name.toLowerCase().includes(q)) return false
      const pref = data.prefs.ingredient[ing.id]
      if (filter === 'rated') return pref !== undefined
      if (filter === 'disliked') return pref === 'dislike'
      if (filter !== 'all') return ing.category === filter
      return true
    })
  }, [data.ingredients, data.prefs, filter, search])

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: INGREDIENT_CATEGORY_LABELS[category],
        items: visible
          .filter((ing) => ing.category === category)
          .sort((a, b) => a.name.localeCompare(b.name, 'nl')),
      })).filter((g) => g.items.length > 0),
    [visible],
  )

  const toggleLike = async (ing: Ingredient) => {
    const current = data.prefs.ingredient[ing.id]
    await data.rateIngredient(ing.id, current === 'like' ? null : 'like')
  }

  // Zelfde gedrag als in de sheet: dislike op een primary-ingrediënt in 3+
  // maaltijden eerst bevestigen — dat haalt die maaltijden uit de rotatie.
  const toggleDislike = async (ing: Ingredient) => {
    const current = data.prefs.ingredient[ing.id]
    if (current === 'dislike') {
      await data.rateIngredient(ing.id, null)
      return
    }
    const affected = mealsWithPrimaryIngredient(ing.id, data.meals)
    if (affected.length >= 3 && !window.confirm(dislikeImpactWarning(affected.length))) return
    await data.rateIngredient(ing.id, 'dislike')
  }

  const searchOff = async () => {
    const q = offQuery.trim()
    if (!q) {
      setOffResults(null)
      setOffMessage('Vul eerst een zoekterm in.')
      return
    }
    setOffBusy(true)
    setOffMessage(null)
    try {
      const results = await searchOpenFoodFacts(q)
      setOffResults(results)
      if (results.length === 0) setOffMessage('Niets gevonden.')
    } finally {
      setOffBusy(false)
    }
  }

  const addOff = async (candidate: OffCandidate) => {
    setAddingId(candidate.externalId)
    setOffMessage(null)
    try {
      const added = await data.addOffIngredient(
        candidate,
        offCats[candidate.externalId] ?? 'other',
      )
      if (added) {
        setAddedIds((prev) => new Set(prev).add(candidate.externalId))
      } else {
        setOffMessage('Toevoegen mislukt — controleer je verbinding en probeer het opnieuw.')
      }
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="stack nplan">
      <h2>Ingrediënten</h2>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Zoek op naam"
        aria-label="Zoek ingrediënt op naam"
      />

      <div className="chips" role="tablist" aria-label="Filter ingrediënten">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={`chip ${filter === f.key ? 'on' : ''}`}
            style={{ ['--chip-color' as string]: 'var(--neon-teal)' }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 && <p className="muted small">Geen ingrediënten gevonden.</p>}

      {grouped.map((group) => (
        <section key={group.category} className="card">
          <h3>{group.label}</h3>
          <ul className="ning-list">
            {group.items.map((ing) => {
              const pref = data.prefs.ingredient[ing.id]
              return (
                <li key={ing.id} className="ning-row">
                  <button
                    className="ning-main"
                    onClick={() => setSheetId(ing.id)}
                    aria-label={`Details van ${ing.name}`}
                  >
                    <span className="ning-name">
                      {ing.name}
                      {ing.isNut && <span className="ning-nut">noot</span>}
                    </span>
                    <span className="faint">
                      {Math.round(ing.kcal100)} kcal · {fmtNum(ing.protein100)} g eiwit per 100 g
                    </span>
                  </button>
                  <button
                    className={`ning-pref ${pref === 'like' ? 'on-like' : ''}`}
                    onClick={() => void toggleLike(ing)}
                    aria-label={`${ing.name} lekker`}
                    aria-pressed={pref === 'like'}
                  >
                    {pref === 'like' ? '♥' : '♡'}
                  </button>
                  <button
                    className={`ning-pref ${pref === 'dislike' ? 'on-dislike' : ''}`}
                    onClick={() => void toggleDislike(ing)}
                    aria-label={`${ing.name} wegstrepen`}
                    aria-pressed={pref === 'dislike'}
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <section className="card stack">
        <h3>Product opzoeken (Open Food Facts)</h3>
        <form
          className="row ning-off-form"
          onSubmit={(e) => {
            e.preventDefault()
            void searchOff()
          }}
        >
          <input
            value={offQuery}
            onChange={(e) => setOffQuery(e.target.value)}
            placeholder="Bijv. skyr of hüttenkäse"
            aria-label="Zoekterm voor Open Food Facts"
          />
          <button type="submit" className="btn" disabled={offBusy} aria-label="Zoek product op">
            {offBusy ? 'Zoeken…' : 'Zoek'}
          </button>
        </form>

        {offMessage && <p className="muted small">{offMessage}</p>}

        {offResults && offResults.length > 0 && (
          <ul className="ning-list">
            {offResults.map((c) => (
              <li key={c.externalId} className="ning-off-result">
                <div className="ning-off-info">
                  <span>{c.name}</span>
                  <span className="faint">
                    {Math.round(c.kcal100)} kcal · {fmtNum(c.protein100)} g eiwit per 100 g
                  </span>
                </div>
                <div className="row">
                  <select
                    value={offCats[c.externalId] ?? 'other'}
                    onChange={(e) =>
                      setOffCats((prev) => ({
                        ...prev,
                        [c.externalId]: e.target.value as IngredientCategory,
                      }))
                    }
                    aria-label={`Categorie voor ${c.name}`}
                  >
                    {CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>
                        {INGREDIENT_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                  {addedIds.has(c.externalId) ? (
                    <span className="ok-text">Toegevoegd</span>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => void addOff(c)}
                      disabled={addingId === c.externalId}
                      aria-label={`Voeg ${c.name} toe`}
                    >
                      {addingId === c.externalId ? 'Toevoegen…' : 'Voeg toe'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="faint">
          Open Food Facts-gegevens komen van het etiket en kunnen afwijken van wat je
          daadwerkelijk eet.
        </p>
      </section>

      {sheetId && data.ingredientsById[sheetId] && (
        <IngredientSheet
          ingredient={data.ingredientsById[sheetId]}
          onClose={() => setSheetId(null)}
        />
      )}
    </div>
  )
}
