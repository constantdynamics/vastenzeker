// Suggestie-engine (§6–§7). Puur: alle randomness komt binnen via een
// geïnjecteerde rng, zodat een dagplan reproduceerbaar is (mulberry32 op een
// dateKey-seed) en alles in Node testbaar blijft zonder React of Supabase.

import {
  clampProteinScale,
  computeMealMacros,
  EMPTY_TOTALS,
  scalesWithProtein,
  sumTotals,
} from './macros'
import type {
  Alternative,
  DayContext,
  DayPlanResult,
  Ingredient,
  MacroTotals,
  Meal,
  MealSlot,
  NutritionProfile,
  PlannedSlot,
  PreferenceState,
  ServeHistory,
  SlotSpec,
} from './types'
import { ALL_SLOTS, mealPrefKey, SLOT_LABELS } from './types'

// ---------- Deterministische randomness ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a: goedkoop en stabiel genoeg om een dateKey tot rng-seed te hashen. */
export function hashStringToSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Dagen sinds epoch. Bewust via Date.UTC: `new Date('YYYY-MM-DD')` parseert
 * als UTC maar rekent daarna in lokale tijd, wat rond middernacht een dag
 * kan verschuiven.
 */
export function dayIndexFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

// ---------- Exploit/explore ----------

/**
 * Kans om uit de beoordeelde (bekende) pool te kiezen. De cap op 0.80 is
 * harde regel 7: altijd minstens 20% kans op iets nieuws.
 */
export function pExploit(ratedCount: number, eligibleCount: number): number {
  if (eligibleCount <= 0) return 0.35
  const p = 0.35 + 0.5 * (ratedCount / eligibleCount)
  return Math.min(0.8, Math.max(0.35, p))
}

// ---------- Harde regel 1: geen eiwitpoeder ----------

// De seed bevat deze producten niet, maar via Open Food Facts toegevoegde
// ingrediënten kunnen het wél zijn — daarom een naamfilter.
const PROTEIN_POWDER_RE =
  /whey|caseïnepoeder|caseinepoeder|eiwitpoeder|proteïnepoeder|protein\s*powder|eiwitshake|eiwitreep|proteïnereep/i

export function isProteinPowder(ing: Ingredient): boolean {
  return PROTEIN_POWDER_RE.test(ing.name)
}

// ---------- Voorkeuren op ingrediëntniveau ----------

/** Optionals met een dislike worden stil weggelaten (§5) — geen blokkade. */
export function excludedOptionalIds(meal: Meal, prefs: PreferenceState): Set<string> {
  const out = new Set<string>()
  for (const mi of meal.ingredients) {
    if (mi.role === 'optional' && prefs.ingredient[mi.ingredientId] === 'dislike') {
      out.add(mi.ingredientId)
    }
  }
  return out
}

export function dislikedSupportingCount(meal: Meal, prefs: PreferenceState): number {
  let n = 0
  for (const mi of meal.ingredients) {
    if (mi.role === 'supporting' && prefs.ingredient[mi.ingredientId] === 'dislike') n++
  }
  return n
}

export function mealBlockedByIngredients(
  meal: Meal,
  prefs: PreferenceState,
  ingredientsById: Record<string, Ingredient>,
): boolean {
  for (const mi of meal.ingredients) {
    if (mi.role === 'primary' && prefs.ingredient[mi.ingredientId] === 'dislike') return true
    const ing = ingredientsById[mi.ingredientId]
    if (ing && isProteinPowder(ing)) return true
  }
  return false
}

/** Voor de impact-waarschuwing "Dit verwijdert N maaltijden uit je rotatie". */
export function mealsWithPrimaryIngredient(ingredientId: string, meals: Meal[]): Meal[] {
  return meals.filter((m) =>
    m.ingredients.some((mi) => mi.role === 'primary' && mi.ingredientId === ingredientId),
  )
}

// ---------- Harde filters (§6) ----------

export function hardFilters(
  meals: Meal[],
  spec: SlotSpec,
  _ctx: DayContext,
  prefs: PreferenceState,
  ingredientsById: Record<string, Ingredient>,
): Meal[] {
  return meals.filter((m) => {
    if (!m.eligibleSlots.includes(spec.slot)) return false
    if (prefs.meal[mealPrefKey(m.id, spec.slot)] === 'dislike') return false
    if (mealBlockedByIngredients(m, prefs, ingredientsById)) return false
    if (spec.requiresCold && m.temperature === 'warm') return false // harde regel 2
    if (spec.requiresPortable && m.portability !== 'portable' && m.portability !== 'on_the_go') {
      return false
    }
    if (spec.requiresFastDigestion && m.digestionSpeed !== 'fast') return false
    if (spec.requiresCasein && !m.caseinDominant) return false
    if (spec.maxFatG !== null) {
      const macros = computeMealMacros(m, ingredientsById, {
        excludeIngredientIds: excludedOptionalIds(m, prefs),
      })
      if (macros.fatG > spec.maxFatG) return false
    }
    return true
  })
}

// ---------- Score ----------

function hasAnyMealPref(mealId: string, prefs: PreferenceState): boolean {
  return ALL_SLOTS.some((slot) => prefs.meal[mealPrefKey(mealId, slot)] !== undefined)
}

export function scoreMeal(
  meal: Meal,
  slot: MealSlot,
  prefs: PreferenceState,
  history: ServeHistory,
): number {
  let score = 1.0
  // superlike telt als like: het wordt toch gepind, dubbel belonen hoeft niet
  const pref = prefs.meal[mealPrefKey(meal.id, slot)]
  if (pref === 'like' || pref === 'superlike') score += 3.0
  for (const mi of meal.ingredients) {
    const ip = prefs.ingredient[mi.ingredientId]
    if (ip === 'like') {
      if (mi.role === 'primary') score += 0.5
      else if (mi.role === 'supporting') score += 0.25
    } else if (ip === 'dislike' && mi.role === 'supporting') {
      score -= 1.0
    }
  }
  const days = history.daysSinceServed[meal.id]
  if (days === undefined && !hasAnyMealPref(meal.id, prefs)) score += 0.5 // novelty
  // Cooldown loopt door onder de 4 dagen: normaliter is dat al uitgefilterd,
  // maar als de pool leegloopt en de uitsluiting wordt losgelaten moet deze
  // penalty herhaling alsnog ontmoedigen.
  if (days !== undefined && days < 8) score -= 0.25 * (8 - days)
  return score
}

// ---------- Macro-penalty (§6) ----------

export function macroPenalty(
  totals: MacroTotals,
  profile: NutritionProfile,
  ctx: DayContext,
): number {
  let pen = 0
  const p = totals.proteinG
  if (p < profile.proteinFloorG) pen += 20 * (profile.proteinFloorG - p) // harde regel 5
  pen += 0.5 * Math.abs(p - profile.proteinTargetG)
  const k = totals.kcal
  if (k < profile.kcalMin) pen += 2 * (profile.kcalMin - k) // harde regel 6
  if (k > profile.kcalMax) pen += 2 * (k - profile.kcalMax)
  if (totals.nutG > ctx.nutBudgetG) pen += 5 * (totals.nutG - ctx.nutBudgetG) // regel 3
  // pindakaas even zwaar als noten: het is dezelfde soort harde dagcap (regel 4)
  if (totals.peanutButterG > 15) pen += 5 * (totals.peanutButterG - 15)
  return pen
}

// ---------- Interne planhulpen ----------

interface MacroSplit {
  /** Macro's op schaal 1 van het niet-meeschalende deel (incl. noten/pindakaas). */
  fixed: MacroTotals
  /** Macro's op schaal 1 van de eiwitcomponent die met portie-flex meeschaalt. */
  scaling: MacroTotals
}

interface WorkSlot {
  spec: SlotSpec
  meal: Meal
  locked: boolean
  pinned: boolean
  /** Alleen betekenisvol als locked: de schaal waarmee al gegeten/vastgezet is. */
  lockedScale: number
  split: MacroSplit
}

function scaleAdd(base: MacroTotals, part: MacroTotals, f: number): MacroTotals {
  return {
    kcal: base.kcal + part.kcal * f,
    proteinG: base.proteinG + part.proteinG * f,
    carbG: base.carbG + part.carbG * f,
    fatG: base.fatG + part.fatG * f,
    fiberG: base.fiberG + part.fiberG * f,
    nutG: base.nutG + part.nutG * f,
    peanutButterG: base.peanutButterG + part.peanutButterG * f,
  }
}

function slotMacrosAt(w: WorkSlot, s: number): MacroTotals {
  const eff = clampProteinScale(w.locked ? w.lockedScale : s)
  return scaleAdd(w.split.fixed, w.split.scaling, eff)
}

// Splitsing in vast + meeschalend deel maakt totalen lineair in s:
// totals(s) = fixed + s·scaling. Zo blijft de schaalscan (51 stappen × 200
// kandidaten) goedkoop zonder telkens computeMealMacros aan te roepen.
function splitMealMacros(
  meal: Meal,
  ingredientsById: Record<string, Ingredient>,
  excluded: ReadonlySet<string>,
): MacroSplit {
  const fixed = { ...EMPTY_TOTALS }
  const scaling = { ...EMPTY_TOTALS }
  for (const mi of meal.ingredients) {
    if (excluded.has(mi.ingredientId)) continue
    const ing = ingredientsById[mi.ingredientId]
    if (!ing) continue
    const t = scalesWithProtein(ing, mi) ? scaling : fixed
    const f = mi.grams / 100
    t.kcal += ing.kcal100 * f
    t.proteinG += ing.protein100 * f
    t.carbG += ing.carb100 * f
    t.fatG += ing.fat100 * f
    t.fiberG += ing.fiber100 * f
    if (ing.isNut) t.nutG += mi.grams
    if (ing.isPeanutButter) t.peanutButterG += mi.grams
  }
  return { fixed, scaling }
}

function weightedPick(items: Meal[], weightOf: (m: Meal) => number, rng: () => number): Meal {
  let total = 0
  const weights = items.map((m) => {
    const w = weightOf(m)
    total += w
    return w
  })
  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function byScoreDescCodeAsc(scoreOf: (m: Meal) => number) {
  // tie-break op code: deterministische volgorde, onafhankelijk van invoervolgorde
  return (a: Meal, b: Meal) =>
    scoreOf(b) - scoreOf(a) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
}

const EPS = 1e-9
const PEANUT_BUTTER_CAP_G = 15 // harde regel 4

/** Niet-blokkerende signalen over dagbudgetten: concreet wat en hoeveel. */
function budgetWarnings(
  totals: MacroTotals,
  profile: NutritionProfile,
  ctx: DayContext,
): string[] {
  const warnings: string[] = []
  if (totals.nutG > ctx.nutBudgetG + EPS) {
    warnings.push(
      `Notenbudget overschreden: ${Math.round(totals.nutG)} g noten bij een budget van ${ctx.nutBudgetG} g — er is geen notenvrij alternatief beschikbaar.`,
    )
  }
  if (totals.peanutButterG > PEANUT_BUTTER_CAP_G + EPS) {
    warnings.push(
      `Pindakaas boven het maximum: ${Math.round(totals.peanutButterG)} g bij een cap van ${PEANUT_BUTTER_CAP_G} g.`,
    )
  }
  if (totals.proteinG < profile.proteinFloorG - EPS) {
    warnings.push(
      `Eiwitvloer niet gehaald: dit plan komt op ${Math.round(totals.proteinG)} g eiwit, ${Math.round(profile.proteinFloorG - totals.proteinG)} g onder de ${profile.proteinFloorG} g — voeg eiwitrijkere maaltijden toe of beoordeel er minder als 'niet lekker'.`,
    )
  }
  if (totals.kcal < profile.kcalMin - 0.5) {
    warnings.push(
      `Deze dag komt ${Math.round(profile.kcalMin - totals.kcal)} kcal onder je band uit — kies grotere porties of een XL-variant.`,
    )
  } else if (totals.kcal > profile.kcalMax + 0.5) {
    warnings.push(
      `Deze dag komt ${Math.round(totals.kcal - profile.kcalMax)} kcal boven je band uit — kies een lichtere variant of kleinere porties.`,
    )
  }
  return warnings
}

// ---------- Dagplan (§6) ----------

export interface EngineInput {
  ctx: DayContext
  slots: SlotSpec[]
  meals: Meal[]
  ingredientsById: Record<string, Ingredient>
  profile: NutritionProfile
  prefs: PreferenceState
  history: ServeHistory
  rng: () => number
  lockedSlots?: Partial<Record<MealSlot, { mealId: string; proteinScale: number }>>
}

export function generateDayPlan(input: EngineInput): DayPlanResult {
  const { ctx, meals, ingredientsById, profile, prefs, history, rng } = input
  const warnings: string[] = []
  const specs = [...input.slots].sort((a, b) => a.timeMin - b.timeMin)
  const mealsById = new Map(meals.map((m) => [m.id, m]))

  // Caches: prefs en history staan vast binnen één aanroep.
  const splitCache = new Map<string, MacroSplit>()
  const splitFor = (meal: Meal): MacroSplit => {
    let s = splitCache.get(meal.id)
    if (!s) {
      s = splitMealMacros(meal, ingredientsById, excludedOptionalIds(meal, prefs))
      splitCache.set(meal.id, s)
    }
    return s
  }
  const scoreCache = new Map<string, number>()
  const scoreOf = (meal: Meal, slot: MealSlot): number => {
    const key = mealPrefKey(meal.id, slot)
    let s = scoreCache.get(key)
    if (s === undefined) {
      s = scoreMeal(meal, slot, prefs, history)
      scoreCache.set(key, s)
    }
    return s
  }
  const makeWork = (
    spec: SlotSpec,
    meal: Meal,
    locked: boolean,
    pinned: boolean,
    lockedScale: number,
  ): WorkSlot => ({ spec, meal, locked, pinned, lockedScale, split: splitFor(meal) })

  // Eén uniforme schaal s voor alle niet-gelockte slots: per slot schalen zou
  // het plan visueel onrustig maken (elke portie anders) terwijl één knop
  // "iets meer/minder eiwit vandaag" hetzelfde doel haalt.
  const fitPortions = (work: WorkSlot[]): { s: number; penalty: number; totals: MacroTotals } => {
    let bestS = 1
    let bestPen = Infinity
    let bestTotals: MacroTotals = { ...EMPTY_TOTALS }
    for (let i = 75; i <= 125; i++) {
      const s = i / 100
      const totals = sumTotals(work.map((w) => slotMacrosAt(w, s)))
      const pen = macroPenalty(totals, profile, ctx)
      if (pen < bestPen) {
        bestPen = pen
        bestS = s
        bestTotals = totals
      }
    }
    return { s: bestS, penalty: bestPen, totals: bestTotals }
  }

  // 1. Gelockte slots (al gegeten/vastgezet) gaan letterlijk over, eigen schaal.
  const fixedWork: WorkSlot[] = []
  const usedFixed = new Set<string>()
  const openSpecs: SlotSpec[] = []
  for (const spec of specs) {
    const lock = input.lockedSlots?.[spec.slot]
    if (lock) {
      const meal = mealsById.get(lock.mealId)
      if (meal) {
        fixedWork.push(makeWork(spec, meal, true, false, lock.proteinScale))
        usedFixed.add(meal.id)
        continue
      }
      warnings.push(
        `Vastgezette maaltijd voor '${SLOT_LABELS[spec.slot]}' niet gevonden — slot opnieuw ingepland.`,
      )
    }
    openSpecs.push(spec)
  }

  // 2. Superlikes pinnen. De 4-dagen-uitsluiting geldt hier bewust niet:
  // een superlike is een expliciete "dit wil ik vaak". Meerdere superlikes
  // roteren op dag-index zodat elke dag deterministisch een andere pin krijgt.
  const sampleSpecs: SlotSpec[] = []
  for (const spec of openSpecs) {
    const supers = hardFilters(meals, spec, ctx, prefs, ingredientsById)
      .filter((m) => prefs.meal[mealPrefKey(m.id, spec.slot)] === 'superlike')
      .filter((m) => !usedFixed.has(m.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (supers.length > 0) {
      const pick = supers[dayIndexFromDateKey(ctx.dateKey) % supers.length]
      fixedWork.push(makeWork(spec, pick, false, true, 1))
      usedFixed.add(pick.id)
    } else {
      sampleSpecs.push(spec)
    }
  }

  // Basispools per open slot; de harde filters veranderen niet per kandidaat.
  const basePools = new Map<MealSlot, Meal[]>()
  for (const spec of sampleSpecs) {
    const pool = hardFilters(meals, spec, ctx, prefs, ingredientsById).filter(
      (m) => !usedFixed.has(m.id),
    )
    basePools.set(spec.slot, pool)
    if (pool.length === 0) {
      warnings.push(
        `Geen geschikte maaltijd gevonden voor '${SLOT_LABELS[spec.slot]}' — versoepel je voorkeuren of voeg maaltijden toe.`,
      )
    }
  }

  // 3. Sample-and-score op DAGNIVEAU: greedy per slot kiest lokaal de beste
  // maaltijd maar mist het dag-eiwitdoel (drie goede-maar-magere keuzes halen
  // samen de 170 g niet). Hele dagen samplen en op de dagpenalty scoren wél.
  let bestWork: WorkSlot[] | null = null
  let bestScore = -Infinity
  const iterations = sampleSpecs.length > 0 ? 200 : 1
  for (let iter = 0; iter < iterations; iter++) {
    const work = [...fixedWork]
    const used = new Set(usedFixed)
    let prefScore = 0
    for (const spec of sampleSpecs) {
      let pool = (basePools.get(spec.slot) ?? []).filter((m) => !used.has(m.id))
      // 4-dagen-uitsluiting, tenzij die de pool leegtrekt — dan neemt de
      // cooldown-penalty in scoreMeal het over.
      const rested = pool.filter((m) => (history.daysSinceServed[m.id] ?? Infinity) >= 4)
      if (rested.length > 0) pool = rested
      if (pool.length === 0) continue
      const known = pool.filter((m) => prefs.meal[mealPrefKey(m.id, spec.slot)] !== undefined)
      const fresh = pool.filter((m) => prefs.meal[mealPrefKey(m.id, spec.slot)] === undefined)
      let source = rng() < pExploit(known.length, pool.length) ? known : fresh
      if (source.length === 0) source = source === known ? fresh : known
      const pick = weightedPick(source, (m) => Math.max(0.05, scoreOf(m, spec.slot)), rng)
      work.push(makeWork(spec, pick, false, false, 1))
      used.add(pick.id)
      prefScore += scoreOf(pick, spec.slot)
    }
    const fit = fitPortions(work)
    const total = prefScore - fit.penalty
    if (total > bestScore) {
      bestScore = total
      bestWork = work
    }
  }
  const work = bestWork ?? [...fixedWork]
  let fit = fitPortions(work)

  // Alternatieven voor een slot in de reparatiepassen: door de filters, nog
  // niet elders op de dag gebruikt.
  const repairAlts = (spec: SlotSpec): Meal[] => {
    const usedNow = new Set(work.map((w) => w.meal.id))
    return hardFilters(meals, spec, ctx, prefs, ingredientsById).filter((m) => !usedNow.has(m.id))
  }

  // 6a. Reparatiepas noten/pindakaas: de sampler minimaliseert alleen een
  // penalty en garandeert niets, terwijl de harde regels 3 en 4 wél een
  // garantie eisen. Daarom hierna deterministisch repareren.
  // Gelockte slots blijven staan (al gegeten); pins mogen als laatste redmiddel
  // wél sneuvelen — harde regels gaan boven een superlike.
  for (let swaps = 0; swaps < 4; swaps++) {
    const nutOver = fit.totals.nutG > ctx.nutBudgetG + EPS
    const pbOver = fit.totals.peanutButterG > PEANUT_BUTTER_CAP_G + EPS
    if (!nutOver && !pbOver) break
    const offending = (t: MacroTotals) =>
      (nutOver ? t.nutG : 0) + (pbOver ? t.peanutButterG : 0)
    let victimIdx = -1
    let victimGrams = 0
    work.forEach((w, i) => {
      if (w.locked) return
      const g = offending(slotMacrosAt(w, fit.s))
      if (g > victimGrams) {
        victimGrams = g
        victimIdx = i
      }
    })
    if (victimIdx < 0) break // alle overschrijding zit in gelockte slots
    const victim = work[victimIdx]
    const alts = repairAlts(victim.spec).filter((m) => {
      const total = scaleAdd(splitFor(m).fixed, splitFor(m).scaling, 1)
      return (!nutOver || total.nutG === 0) && (!pbOver || total.peanutButterG === 0)
    })
    if (alts.length === 0) break
    alts.sort(byScoreDescCodeAsc((m) => scoreOf(m, victim.spec.slot)))
    work[victimIdx] = makeWork(victim.spec, alts[0], false, false, 1)
    fit = fitPortions(work)
  }

  // 6b. Eiwitvloer (harde regel 5): haalt zelfs de maximale portieschaal de
  // vloer niet, wissel dan het eiwit-armste slot voor het eiwitrijkste
  // alternatief — zonder de net gerepareerde noten-/pindakaascaps te breken.
  const proteinAtMax = () => sumTotals(work.map((w) => slotMacrosAt(w, 1.25))).proteinG
  for (let swaps = 0; swaps < 4; swaps++) {
    if (proteinAtMax() >= profile.proteinFloorG - EPS) break
    let victimIdx = -1
    let victimProtein = Infinity
    work.forEach((w, i) => {
      if (w.locked) return
      const p = slotMacrosAt(w, 1.25).proteinG
      if (p < victimProtein) {
        victimProtein = p
        victimIdx = i
      }
    })
    if (victimIdx < 0) break
    const victim = work[victimIdx]
    let restNut = 0
    let restPb = 0
    work.forEach((w, i) => {
      if (i === victimIdx) return
      const t = slotMacrosAt(w, 1)
      restNut += t.nutG
      restPb += t.peanutButterG
    })
    const alts = repairAlts(victim.spec)
      .map((m) => {
        const sp = splitFor(m)
        return {
          meal: m,
          protein: sp.fixed.proteinG + 1.25 * sp.scaling.proteinG,
          nutG: sp.fixed.nutG + sp.scaling.nutG,
          peanutButterG: sp.fixed.peanutButterG + sp.scaling.peanutButterG,
        }
      })
      .filter((a) => a.protein > victimProtein + EPS) // anders geen vooruitgang
      .filter(
        (a) =>
          restNut + a.nutG <= ctx.nutBudgetG + EPS &&
          restPb + a.peanutButterG <= PEANUT_BUTTER_CAP_G + EPS,
      )
    if (alts.length === 0) break
    alts.sort(
      (a, b) =>
        b.protein - a.protein ||
        (a.meal.code < b.meal.code ? -1 : a.meal.code > b.meal.code ? 1 : 0),
    )
    work[victimIdx] = makeWork(victim.spec, alts[0].meal, false, false, 1)
  }

  // 6c. Calorieband (harde regel 6, onderkant): haalt zelfs de maximale
  // portieschaal kcalMin niet, wissel dan het calorie-armste slot voor het
  // calorierijkste alternatief — zonder de caps te breken en zonder de
  // eiwitvloer weer onhaalbaar te maken. De bovenkant heeft geen pas nodig:
  // schaal 0.75 plus de sampler-penalty drukken overschot al weg.
  const kcalAtMax = () => sumTotals(work.map((w) => slotMacrosAt(w, 1.25))).kcal
  for (let swaps = 0; swaps < 4; swaps++) {
    if (kcalAtMax() >= profile.kcalMin - EPS) break
    let victimIdx = -1
    let victimKcal = Infinity
    work.forEach((w, i) => {
      if (w.locked) return
      const k = slotMacrosAt(w, 1.25).kcal
      if (k < victimKcal) {
        victimKcal = k
        victimIdx = i
      }
    })
    if (victimIdx < 0) break
    const victim = work[victimIdx]
    let restNut = 0
    let restPb = 0
    let restProteinMax = 0
    work.forEach((w, i) => {
      if (i === victimIdx) return
      const t = slotMacrosAt(w, 1)
      restNut += t.nutG
      restPb += t.peanutButterG
      restProteinMax += slotMacrosAt(w, 1.25).proteinG
    })
    const alts = repairAlts(victim.spec)
      .map((m) => {
        const sp = splitFor(m)
        return {
          meal: m,
          kcal: sp.fixed.kcal + 1.25 * sp.scaling.kcal,
          protein: sp.fixed.proteinG + 1.25 * sp.scaling.proteinG,
          nutG: sp.fixed.nutG + sp.scaling.nutG,
          peanutButterG: sp.fixed.peanutButterG + sp.scaling.peanutButterG,
        }
      })
      .filter((a) => a.kcal > victimKcal + EPS) // anders geen vooruitgang
      .filter(
        (a) =>
          restNut + a.nutG <= ctx.nutBudgetG + EPS &&
          restPb + a.peanutButterG <= PEANUT_BUTTER_CAP_G + EPS &&
          restProteinMax + a.protein >= profile.proteinFloorG - EPS,
      )
    if (alts.length === 0) break
    alts.sort(
      (a, b) =>
        b.kcal - a.kcal || (a.meal.code < b.meal.code ? -1 : a.meal.code > b.meal.code ? 1 : 0),
    )
    work[victimIdx] = makeWork(victim.spec, alts[0].meal, false, false, 1)
  }
  fit = fitPortions(work)

  // 7. Niet-blokkerende signalen: concreet wat en hoeveel.
  warnings.push(...budgetWarnings(fit.totals, profile, ctx))

  // 8. Slots op tijd; totals = som van de slot-macro's (zelfde berekening).
  const slots: PlannedSlot[] = work
    .sort((a, b) => a.spec.timeMin - b.spec.timeMin)
    .map((w) => ({
      slot: w.spec.slot,
      spec: w.spec,
      mealId: w.meal.id,
      proteinScale: w.locked ? w.lockedScale : fit.s,
      pinned: w.pinned,
      macros: slotMacrosAt(w, fit.s),
    }))

  return {
    dateKey: ctx.dateKey,
    dayType: ctx.dayType,
    window: ctx.window,
    slots,
    totals: fit.totals,
    warnings,
  }
}

// ---------- Alternatievenlijst (§7) ----------

export function alternativesForSlot(
  input: EngineInput,
  slot: MealSlot,
  currentMealId: string,
): Alternative[] {
  const { ctx, meals, ingredientsById, prefs, history } = input
  const spec = input.slots.find((s) => s.slot === slot)
  if (!spec) return []

  let pool = hardFilters(meals, spec, ctx, prefs, ingredientsById).filter(
    (m) => m.id !== currentMealId,
  )
  // 4-dagen-uitsluiting alleen zolang er 10 alternatieven overblijven.
  const rested = pool.filter((m) => (history.daysSinceServed[m.id] ?? Infinity) >= 4)
  if (rested.length >= 10) pool = rested

  const scoreCache = new Map<string, number>()
  const scoreOf = (m: Meal): number => {
    let s = scoreCache.get(m.id)
    if (s === undefined) {
      s = scoreMeal(m, slot, prefs, history)
      scoreCache.set(m.id, s)
    }
    return s
  }
  pool = [...pool].sort(byScoreDescCodeAsc(scoreOf))

  const isKnown = (m: Meal) => prefs.meal[mealPrefKey(m.id, slot)] !== undefined
  const isNovel = (m: Meal) => !isKnown(m) && history.daysSinceServed[m.id] === undefined

  const famCount = new Map<string, number>()
  const selectedIds = new Set<string>()
  const selected: Meal[] = []
  const underCap = (m: Meal) => (famCount.get(m.family) ?? 0) < 3
  const add = (m: Meal) => {
    selected.push(m)
    selectedIds.add(m.id)
    famCount.set(m.family, (famCount.get(m.family) ?? 0) + 1)
  }
  const removeAt = (i: number) => {
    const m = selected[i]
    selected.splice(i, 1)
    selectedIds.delete(m.id)
    famCount.set(m.family, (famCount.get(m.family) ?? 0) - 1)
  }

  // Pas A: bekende items (beoordeeld op dit slot) tot 6, max 3 per family.
  let knownTaken = 0
  for (const m of pool) {
    if (knownTaken >= 6) break
    if (!isKnown(m) || !underCap(m)) continue
    add(m)
    knownTaken++
  }
  // Pas B: nooit op dit slot beoordeelde items tot 4, zelfde family-cap.
  let freshTaken = 0
  for (const m of pool) {
    if (freshTaken >= 4) break
    if (selectedIds.has(m.id) || isKnown(m) || !underCap(m)) continue
    add(m)
    freshTaken++
  }
  // Aanvullen tot 10: eerst mét family-cap, dan zonder — exact 10 zodra de
  // pool het toelaat.
  for (const m of pool) {
    if (selected.length >= 10) break
    if (selectedIds.has(m.id) || !underCap(m)) continue
    add(m)
  }
  for (const m of pool) {
    if (selected.length >= 10) break
    if (selectedIds.has(m.id)) continue
    add(m)
  }

  // Harde regel 7 in het klein: minstens 2 novel items zodra de pool ze heeft.
  const novelInPool = pool.filter(isNovel)
  const wantNovel = Math.min(2, novelInPool.length)
  let haveNovel = selected.filter(isNovel).length
  while (haveNovel < wantNovel) {
    const pickVictim = (pred: (m: Meal) => boolean): number => {
      let idx = -1
      let low = Infinity
      selected.forEach((m, i) => {
        if (!pred(m)) return
        const s = scoreOf(m)
        if (s < low) {
          low = s
          idx = i
        }
      })
      return idx
    }
    // Laagst scorende bekende eruit; zonder bekende elk niet-novel item.
    let victimIdx = pickVictim(isKnown)
    if (victimIdx < 0) victimIdx = pickVictim((m) => !isNovel(m))
    if (victimIdx < 0) break
    removeAt(victimIdx)
    const remaining = novelInPool.filter((m) => !selectedIds.has(m.id))
    const replacement = remaining.find(underCap) ?? remaining[0]
    if (!replacement) break
    add(replacement)
    haveNovel++
  }

  return selected.sort(byScoreDescCodeAsc(scoreOf)).map((m) => ({
    meal: m,
    // macros op schaal 1, exclusief stil verwijderde optionals
    macros: computeMealMacros(m, ingredientsById, {
      excludeIngredientIds: excludedOptionalIds(m, prefs),
    }),
    score: scoreOf(m),
    novel: isNovel(m),
  }))
}

// ---------- Herberekening bij een handmatige wissel ----------

/**
 * Herbereken portie-flex, totalen en waarschuwingen voor een dag waarvan de
 * maaltijden al vastliggen — bv. nadat de gebruiker een alternatief inwisselt.
 * Gegeten (locked) slots houden hun eigen schaal; de rest krijgt opnieuw één
 * uniforme schaal. Er wordt niets gewisseld of gesampled.
 */
export function refitDayPlan(
  input: Pick<EngineInput, 'ctx' | 'slots' | 'meals' | 'ingredientsById' | 'profile' | 'prefs'>,
  chosen: Partial<
    Record<MealSlot, { mealId: string; locked?: boolean; pinned?: boolean; proteinScale?: number }>
  >,
): DayPlanResult {
  const { ctx, meals, ingredientsById, profile, prefs } = input
  const mealsById = new Map(meals.map((m) => [m.id, m]))
  const warnings: string[] = []
  const work: WorkSlot[] = []
  for (const spec of [...input.slots].sort((a, b) => a.timeMin - b.timeMin)) {
    const c = chosen[spec.slot]
    if (!c) continue
    const meal = mealsById.get(c.mealId)
    if (!meal) {
      warnings.push(`Maaltijd voor '${SLOT_LABELS[spec.slot]}' niet gevonden.`)
      continue
    }
    work.push({
      spec,
      meal,
      locked: c.locked ?? false,
      pinned: c.pinned ?? false,
      lockedScale: c.proteinScale ?? 1,
      split: splitMealMacros(meal, ingredientsById, excludedOptionalIds(meal, prefs)),
    })
  }

  let bestS = 1
  let bestPen = Infinity
  let bestTotals: MacroTotals = { ...EMPTY_TOTALS }
  for (let i = 75; i <= 125; i++) {
    const s = i / 100
    const totals = sumTotals(work.map((w) => slotMacrosAt(w, s)))
    const pen = macroPenalty(totals, profile, ctx)
    if (pen < bestPen) {
      bestPen = pen
      bestS = s
      bestTotals = totals
    }
  }
  warnings.push(...budgetWarnings(bestTotals, profile, ctx))

  return {
    dateKey: ctx.dateKey,
    dayType: ctx.dayType,
    window: ctx.window,
    slots: work.map((w) => ({
      slot: w.spec.slot,
      spec: w.spec,
      mealId: w.meal.id,
      proteinScale: w.locked ? w.lockedScale : bestS,
      pinned: w.pinned,
      macros: slotMacrosAt(w, bestS),
    })),
    totals: bestTotals,
    warnings,
  }
}
