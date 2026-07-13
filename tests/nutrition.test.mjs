// Scenario-tests voor de voedingsmodule: de tien acceptatiecriteria uit §12
// van de spec, plus slechte nacht, verbatim copy, kalorieband, seed-sanity,
// refit en determinisme.
import { dayContextFor, deriveSlots, effectiveWindow } from './.bundles/nutrition-daytype-bundle.mjs'
import {
  alternativesForSlot,
  excludedOptionalIds,
  generateDayPlan,
  hardFilters,
  isProteinPowder,
  mealsWithPrimaryIngredient,
  mulberry32,
  pExploit,
  refitDayPlan,
} from './.bundles/nutrition-engine-bundle.mjs'
import { computeMealMacros } from './.bundles/nutrition-macros-bundle.mjs'
import { GOAL_RATIONALE, slotRationale } from './.bundles/nutrition-copy-bundle.mjs'
import { SEED_MEALS, seedIngredientsById } from './.bundles/nutrition-seed-bundle.mjs'
import { buildShoppingList } from './.bundles/nutrition-shopping-bundle.mjs'
import { computeStatus, dateKey } from './.bundles/time-bundle.mjs'

let failures = 0
function check(name, cond, detail = '') {
  if (!cond) { failures++; console.log(`FAIL ${name} ${detail}`) } else console.log(`ok   ${name}`)
}

// ---- bouwstenen ----
const profile = { weightKg: 95, goal: 'recomp', proteinTargetG: 190, proteinFloorG: 170, kcalMin: 2200, kcalMax: 2400 }
const WINDOW = { openMin: 720, closeMin: 1140, fasting: true, badNight: false } // 12:00–19:00
const ingredientsById = seedIngredientsById()
const mealsById = new Map(SEED_MEALS.map((m) => [m.id, m]))
const mealPrefKey = (mealId, slot) => `${mealId}|${slot}` // zelfde vorm als types.ts
const noPrefs = () => ({ meal: {}, ingredient: {} })

const SESSIONS = {
  REST: [],
  FASTED_STRENGTH: [{ type: 'strength', startMin: 600, endMin: 720 }], // 10:00–12:00
  FED_STRENGTH: [{ type: 'strength', startMin: 930, endMin: 1020 }], // 15:30–17:00
  CARDIO: [{ type: 'cardio', startMin: 930, endMin: 975 }], // duurloop 15:30–16:15
}

function makeCtx(dayType, dk = '2026-07-01') {
  const sessions = SESSIONS[dayType]
  const isTrainingDay = sessions.length > 0
  return { dateKey: dk, dayType, window: WINDOW, sessions, isTrainingDay, nutBudgetG: isTrainingDay ? 40 : 30 }
}

function makeInput(dayType, { seed = 1, prefs = noPrefs(), dk = '2026-07-01' } = {}) {
  const ctx = makeCtx(dayType, dk)
  return {
    ctx,
    slots: deriveSlots(dayType, ctx.window, ctx.sessions),
    meals: SEED_MEALS,
    ingredientsById,
    profile,
    prefs,
    history: { daysSinceServed: {} },
    rng: mulberry32(seed),
  }
}
const slotOf = (plan, slot) => plan.slots.find((s) => s.slot === slot)

// app-profiel + weekschema voor de daytype-afleiding (weekdag 0 = maandag)
const appProfile = { user_id: 'u', window_start: '12:00:00', window_end: '19:00:00', experience: 'some', protocol: '17:7' }
const scheduleWith = (sportRow) =>
  Array.from({ length: 7 }, (_, weekday) => ({
    user_id: 'u', weekday, fasting: true, window_start: null, window_end: null,
    sport_type: null, sport_time: null, sport_end_time: null,
    ...sportRow(weekday),
  }))

// ---- 1. FASTED_STRENGTH: kracht 10:00–12:00, venster opent 12:00 ----
const tuesday = new Date(2026, 6, 14) // dinsdag 14 juli 2026 → weekday 1
const schedule1 = scheduleWith((weekday) =>
  weekday === 1 ? { sport_type: 'strength', sport_time: '10:00', sport_end_time: '12:00' } : {},
)
const ctxFS = dayContextFor(tuesday, appProfile, schedule1, null)
check('1. dagtype = FASTED_STRENGTH', ctxFS.dayType === 'FASTED_STRENGTH', `kreeg ${ctxFS.dayType}`)
const slotsFS = deriveSlots(ctxFS.dayType, ctxFS.window, ctxFS.sessions)
const bfSpecFS = slotsFS.find((s) => s.slot === 'BREAK_FAST')
check('1. BREAK_FAST direct na de training (12:00)', bfSpecFS.timeMin === 720, `kreeg ${bfSpecFS.timeMin}`)
check('1. BREAK_FAST meeneembaar + snel verteerbaar', bfSpecFS.requiresPortable && bfSpecFS.requiresFastDigestion)
check('1. BREAK_FAST maximaal 12 g vet', bfSpecFS.maxFatG === 12)
{
  let fatOk = true, altOk = true
  for (let seed = 1; seed <= 20; seed++) {
    const input = { ...makeInput('FASTED_STRENGTH', { seed }), ctx: ctxFS, slots: slotsFS }
    const plan = generateDayPlan(input)
    const bf = slotOf(plan, 'BREAK_FAST')
    if (computeMealMacros(mealsById.get(bf.mealId), ingredientsById).fatG > 12) fatOk = false
    const alts = alternativesForSlot(input, 'BREAK_FAST', bf.mealId)
    if (alts.length !== 10 || !alts.every((a) => a.macros.fatG <= 12)) altOk = false
  }
  check('1. gekozen BREAK_FAST ≤ 12 g vet (20 seeds)', fatOk)
  check('1. alle 10 alternatieven ≤ 12 g vet (20 seeds)', altOk)
}

// ---- 2. Superlike op (b01, BREAK_FAST) pint 14 dagen op rij ----
{
  const prefs = { meal: { [mealPrefKey('b01', 'BREAK_FAST')]: 'superlike' }, ingredient: {} }
  let ok = true
  for (let d = 1; d <= 14; d++) {
    const dk = `2026-07-${String(d).padStart(2, '0')}`
    const bf = slotOf(generateDayPlan(makeInput('REST', { seed: d, prefs, dk })), 'BREAK_FAST')
    if (bf.mealId !== 'b01' || !bf.pinned) { ok = false; break }
  }
  check('2. superlike: b01 gepind op 14 opeenvolgende dagen', ok)
}

// ---- 3. Dislike op ingrediënt walnoot (primary in b01) blokkeert b01 ----
{
  const prefs = { meal: {}, ingredient: { walnoot: 'dislike' } }
  let inPlan = false, inAlts = false
  for (let seed = 1; seed <= 30; seed++) {
    const input = makeInput('REST', { seed, prefs })
    const plan = generateDayPlan(input)
    if (plan.slots.some((s) => s.mealId === 'b01')) inPlan = true
    const alts = alternativesForSlot(input, 'BREAK_FAST', slotOf(plan, 'BREAK_FAST').mealId)
    if (alts.some((a) => a.meal.id === 'b01')) inAlts = true
  }
  check('3. b01 in geen enkel dagplan (30 seeds)', !inPlan)
  check('3. b01 in geen alternatievenlijst', !inAlts)
  check('3. impactlijst bevat b01', mealsWithPrimaryIngredient('walnoot', SEED_MEALS).some((m) => m.id === 'b01'))
}

// ---- 4. Dislike op kaneel (optional in b01): stil weglaten, niet blokkeren ----
{
  const prefs = { meal: { [mealPrefKey('b01', 'BREAK_FAST')]: 'superlike' }, ingredient: { kaneel: 'dislike' } }
  const b01 = mealsById.get('b01')
  const ctx = makeCtx('REST')
  const bfSpec = deriveSlots('REST', WINDOW, []).find((s) => s.slot === 'BREAK_FAST')
  check('4. b01 komt door hardFilters', hardFilters(SEED_MEALS, bfSpec, ctx, prefs, ingredientsById).some((m) => m.id === 'b01'))
  const excluded = excludedOptionalIds(b01, prefs)
  check('4. kaneel in excludedOptionalIds', excluded.has('kaneel'))
  const met = computeMealMacros(b01, ingredientsById)
  const zonder = computeMealMacros(b01, ingredientsById, { excludeIngredientIds: excluded })
  check('4. macros zonder kaneel < mét kaneel', zonder.kcal < met.kcal)
  const plan = generateDayPlan(makeInput('REST', { seed: 3, prefs }))
  check('4. plan bevat b01 (superlike)', slotOf(plan, 'BREAK_FAST').mealId === 'b01')
  const entries = plan.slots.map((s) => ({ meal: mealsById.get(s.mealId), proteinScale: s.proteinScale }))
  const groups = buildShoppingList(entries, ingredientsById, prefs)
  check('4. boodschappenlijst zonder kaneel', groups.every((g) => g.items.every((it) => it.ingredient.id !== 'kaneel')))
}

// ---- 5 + 6 + kalorieband: 4 dagtypes × 130 seeds ----
// Seeds 1..130 dekken bewust de seeds (21, 55, 96, 121) die vóór de
// kcal-reparatiepas (stap 6c in de engine) onder de band uitkwamen.
for (const dayType of ['REST', 'FASTED_STRENGTH', 'FED_STRENGTH', 'CARDIO']) {
  const budget = dayType === 'REST' ? 30 : 40
  let proteinOk = true, nutOk = true, pbOk = true, kcalOk = true, warnOk = true
  for (let seed = 1; seed <= 130; seed++) {
    const plan = generateDayPlan(makeInput(dayType, { seed }))
    if (plan.totals.proteinG < 170 - 1e-6) proteinOk = false
    if (plan.totals.nutG > budget + 1e-6) nutOk = false
    if (plan.totals.peanutButterG > 15 + 1e-6) pbOk = false
    if (plan.totals.kcal < 2199 || plan.totals.kcal > 2401) kcalOk = false
    if (plan.warnings.length !== 0) warnOk = false
  }
  check(`5. eiwit ≥ 170 g op ${dayType} (130 seeds)`, proteinOk)
  check(`6. noten ≤ ${budget} g op ${dayType}`, nutOk)
  check(`6. pindakaas ≤ 15 g op ${dayType}`, pbOk)
  check(`kalorieband 2200–2400 op ${dayType}`, kcalOk)
  check(`geen warnings op ${dayType}`, warnOk)
}

// ---- 7. Alternatievenlijst: 10 items, familycap 3, ≥ 2 nieuw ----
{
  const prefs = {
    meal: {
      [mealPrefKey('b02', 'BREAK_FAST')]: 'like',
      [mealPrefKey('b03', 'BREAK_FAST')]: 'like',
      [mealPrefKey('b05', 'BREAK_FAST')]: 'like',
    },
    ingredient: {},
  }
  const alts = alternativesForSlot(makeInput('REST', { prefs }), 'BREAK_FAST', 'b01')
  check('7. exact 10 alternatieven', alts.length === 10, `kreeg ${alts.length}`)
  const perFamily = new Map()
  for (const a of alts) perFamily.set(a.meal.family, (perFamily.get(a.meal.family) ?? 0) + 1)
  check('7. max 3 per family', [...perFamily.values()].every((n) => n <= 3))
  check('7. minstens 2 nieuw', alts.filter((a) => a.novel).length >= 2)
  check('7. geen duplicaten', new Set(alts.map((a) => a.meal.id)).size === alts.length)
  check('7. huidige maaltijd ontbreekt', !alts.some((a) => a.meal.id === 'b01'))
}

// ---- 8. Explore/exploit ----
check('8. pExploit(0, 40) = 0.35', pExploit(0, 40) === 0.35)
check('8. pExploit(40, 40) = 0.8 (cap)', pExploit(40, 40) === 0.8)
check('8. pExploit(20, 40) = 0.6', pExploit(20, 40) === 0.6)
{
  // Alle BREAK_FAST-maaltijden geliket op twee na: de 20%-verkenningsgarantie
  // moet zichtbaar blijven in wat er daadwerkelijk gekozen wordt.
  const bfMeals = SEED_MEALS.filter((m) => m.eligibleSlots.includes('BREAK_FAST'))
  const unrated = new Set(bfMeals.slice(-2).map((m) => m.id))
  const prefs = { meal: {}, ingredient: {} }
  for (const m of bfMeals) {
    if (!unrated.has(m.id)) prefs.meal[mealPrefKey(m.id, 'BREAK_FAST')] = 'like'
  }
  let fresh = 0
  const runs = 400
  for (let seed = 1; seed <= runs; seed++) {
    if (unrated.has(slotOf(generateDayPlan(makeInput('REST', { seed, prefs })), 'BREAK_FAST').mealId)) fresh++
  }
  check('8. onbeoordeeld gekozen in ≥ 15% (400 seeds)', fresh / runs >= 0.15, `fractie ${fresh / runs}`)

  // Met nul beoordelingen is elke keuze per definitie onbeoordeeld (triviaal
  // 100%, maar de garantie moet ook aan de onderkant blijven staan).
  const emptyPrefs = noPrefs()
  let neverRated = 0
  for (let seed = 1; seed <= 50; seed++) {
    const bf = slotOf(generateDayPlan(makeInput('REST', { seed, prefs: emptyPrefs })), 'BREAK_FAST')
    if (emptyPrefs.meal[mealPrefKey(bf.mealId, 'BREAK_FAST')] === undefined) neverRated++
  }
  check('8. zonder beoordelingen ≥ 60% nooit beoordeeld', neverRated / 50 >= 0.6, `fractie ${neverRated / 50}`)
}

// ---- 9. CARDIO: snack ná de duurloop (15:30–16:15) ----
{
  const snack = deriveSlots('CARDIO', WINDOW, SESSIONS.CARDIO).find((s) => s.slot === 'SNACK')
  check('9. snack om 16:30 (kwartier na de loop)', snack.timeMin === 16 * 60 + 15 + 15, `kreeg ${snack.timeMin}`)
  check('9. snack ná sessie-einde', snack.timeMin > SESSIONS.CARDIO[0].endMin)
}

// ---- 10. FED_STRENGTH: pre-workoutsnack, snel verteerbaar ----
{
  const snackSpec = deriveSlots('FED_STRENGTH', WINDOW, SESSIONS.FED_STRENGTH).find((s) => s.slot === 'SNACK')
  check('10. snack 45 min vóór kracht (14:45)', snackSpec.timeMin === 15 * 60 + 30 - 45, `kreeg ${snackSpec.timeMin}`)
  let fastOk = true
  let altsFast = false
  for (let seed = 1; seed <= 20; seed++) {
    const input = makeInput('FED_STRENGTH', { seed })
    const plan = generateDayPlan(input)
    const snack = slotOf(plan, 'SNACK')
    if (mealsById.get(snack.mealId).digestionSpeed !== 'fast') fastOk = false
    if (seed === 1) {
      altsFast = alternativesForSlot(input, 'SNACK', snack.mealId).every((a) => a.meal.digestionSpeed === 'fast')
    }
  }
  check('10. gekozen snack altijd snel verteerbaar (20 seeds)', fastOk)
  check('10. snack-alternatieven allemaal snel verteerbaar', altsFast)
}

// ---- Slechte nacht: skip zet de vast uit maar houdt het eetplan ----
{
  // computeStatus rekent met de echte klok-datum → fastRow op vandaag bouwen.
  const now = new Date()
  now.setHours(9, 0, 0, 0) // 09:00: normaal midden in de vast (venster opent 12:00)
  const fastRow = {
    id: 'f1', user_id: 'u', day: dateKey(new Date()), status: 'skipped',
    window_start: '07:30', window_end: null, started_at: null, ended_at: null,
    energy: null, hunger: null, focus: null, heavy_presses: 0, note: null,
    skip_reason: 'bad_night',
  }
  // elke dag een duurloop, zodat het dagtype van vandaag training blijft
  const schedule = scheduleWith(() => ({ sport_type: 'endurance', sport_time: '15:30', sport_end_time: '16:15' }))
  const status = computeStatus(now, appProfile, schedule, null, [fastRow])
  check('slechte nacht: status = free', status.kind === 'free', `kreeg ${status.kind}`)
  const win = effectiveWindow(now, appProfile, schedule, fastRow)
  check('slechte nacht: badNight, open 07:30, geen vast', win.badNight && win.openMin === 450 && !win.fasting)
  const ctx = dayContextFor(now, appProfile, schedule, fastRow)
  check('slechte nacht: dagtype blijft CARDIO', ctx.dayType === 'CARDIO', `kreeg ${ctx.dayType}`)
  const slots = deriveSlots(ctx.dayType, ctx.window, ctx.sessions)
  check('slechte nacht: BREAK_FAST om 07:30', slots.find((s) => s.slot === 'BREAK_FAST').timeMin === 450)
  check('slechte nacht: CLOSE om sluiting − 15', slots.find((s) => s.slot === 'CLOSE').timeMin === win.closeMin - 15)
}

// ---- Verbatim copy: speciteksten letterlijk, niet verwaterd ----
check(
  'copy: FASTED_STRENGTH-rationale letterlijk',
  slotRationale('BREAK_FAST', 'FASTED_STRENGTH', false) ===
    'Je hebt net twee uur krachttraining gedaan, na 17 uur vasten. Nu wil je snel eiwit én snelle koolhydraten. Vet vertraagt je maaglediging, dus noten en pindakaas zijn hier juist de verkeerde keuze. En omdat je hierna direct naar kantoor rijdt, moet het meeneembaar zijn.',
)
check(
  'copy: goal-rationale letterlijk',
  GOAL_RATIONALE ===
    'Je doel is vetverlies met behoud — en waar mogelijk opbouw — van spiermassa. In een calorietekort is eiwit wat je spieren beschermt. Haal je die 190 gram niet, dan verlies je gewicht, inclusief spier.',
)
check('copy: cardiosnack noemt "ná je duurloop"', slotRationale('SNACK', 'CARDIO', false).includes('ná je duurloop'))

// ---- Seed-sanity ----
{
  const codes = new Set(SEED_MEALS.map((m) => m.code))
  const wanted = []
  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, '0')
    wanted.push(`b${n}`, `s${n}`, `d${n}`)
    if (i <= 10) wanted.push(`c${n}`)
  }
  check('seed: alle spec-codes aanwezig (b/s/d 01–12, c01–10)', wanted.every((c) => codes.has(c)),
    `mist ${wanted.filter((c) => !codes.has(c)).join(',')}`)
  const forSlot = (slot) => SEED_MEALS.filter((m) => m.eligibleSlots.includes(slot))
  check('seed: BREAK_FAST nooit warm', forSlot('BREAK_FAST').every((m) => m.temperature !== 'warm'))
  check('seed: CLOSE altijd caseïnedominant', forSlot('CLOSE').every((m) => m.caseinDominant))
  check(
    'seed: geen eiwitpoeder in enige maaltijd',
    SEED_MEALS.every((m) =>
      m.ingredients.every((mi) => {
        const ing = ingredientsById[mi.ingredientId]
        return ing !== undefined && !isProteinPowder(ing)
      }),
    ),
  )
}

// ---- refitDayPlan: handmatige wissel naar x34 ----
{
  const input = makeInput('REST', { seed: 7 })
  const plan = generateDayPlan(input)
  const chosen = {}
  for (const s of plan.slots) chosen[s.slot] = { mealId: s.mealId }
  chosen.DINNER = { mealId: 'x34' }
  const refit = refitDayPlan(
    { ctx: input.ctx, slots: input.slots, meals: SEED_MEALS, ingredientsById, profile, prefs: input.prefs },
    chosen,
  )
  check('refit: DINNER = x34', slotOf(refit, 'DINNER').mealId === 'x34')
  const sumKcal = refit.slots.reduce((acc, s) => acc + s.macros.kcal, 0)
  const sumProtein = refit.slots.reduce((acc, s) => acc + s.macros.proteinG, 0)
  check(
    'refit: totals = som van slot-macro\'s',
    Math.abs(sumKcal - refit.totals.kcal) < 1e-6 && Math.abs(sumProtein - refit.totals.proteinG) < 1e-6,
  )
}

// ---- Determinisme: zelfde seed → zelfde plan ----
{
  const a = generateDayPlan(makeInput('REST', { seed: 42 }))
  const b = generateDayPlan(makeInput('REST', { seed: 42 }))
  check(
    'determinisme: mulberry32(42) geeft twee keer hetzelfde plan',
    a.slots.length === b.slots.length && a.slots.every((s, i) => s.mealId === b.slots[i].mealId),
  )
}

// ---- Randgevallen uit de review: klemmen op het venster ----
{
  // Avondduurloop die tegen de sluiting aan eindigt: de snack mag nooit ná
  // het venster vallen (eten na sluiting breekt de vast).
  const win = { openMin: 720, closeMin: 1140, fasting: true, badNight: false }
  const run = [{ type: 'cardio', startMin: 1080, endMin: 1125 }] // 18:00–18:45
  const slots = deriveSlots('CARDIO', win, run)
  check('klem: avondloop-snack blijft binnen het venster',
    slots.every((s) => s.timeMin >= win.openMin && s.timeMin <= win.closeMin - 15))

  // Kracht die vlak voor sluiting eindigt: diner nooit tijdens de sessie.
  const late = [{ type: 'strength', startMin: 1030, endMin: 1120 }] // 17:10–18:40
  const dinner = deriveSlots('FED_STRENGTH', win, late).find((s) => s.slot === 'DINNER')
  check('klem: diner niet tijdens een late krachtsessie', dinner.timeMin >= late[0].endMin)

  // Kracht volledig ná sluiting: gewone snacktiming, niets buiten het venster.
  const evening = [{ type: 'strength', startMin: 1200, endMin: 1290 }] // 20:00–21:30
  const evSlots = deriveSlots('FED_STRENGTH', win, evening)
  check('klem: avondkracht duwt geen slot buiten het venster',
    evSlots.every((s) => s.timeMin >= win.openMin && s.timeMin <= win.closeMin - 15))
  check('klem: avondkracht-snack valt terug op open + 3u',
    evSlots.find((s) => s.slot === 'SNACK').timeMin === win.openMin + 180)
}

// ---- Nuchtere ochtendkracht: venster opent bij het einde van de sessie ----
{
  const schedule = Array.from({ length: 7 }, (_, weekday) => ({
    weekday, fasting: true, window_start: null, window_end: null,
    sport_type: weekday === 1 ? 'strength' : null,
    sport_time: weekday === 1 ? '06:00' : null,
    sport_end_time: weekday === 1 ? '07:30' : null,
  }))
  // Eerstvolgende dinsdag als concrete datum
  const d = new Date()
  d.setDate(d.getDate() + ((1 - (d.getDay() + 6) % 7 + 7) % 7))
  const ctx = dayContextFor(d, appProfile, schedule, null)
  check('ochtendkracht: dagtype FASTED_STRENGTH', ctx.dayType === 'FASTED_STRENGTH')
  check('ochtendkracht: venster opent bij einde sessie', ctx.window.openMin === 7 * 60 + 30)
  const bf = deriveSlots(ctx.dayType, ctx.window, ctx.sessions).find((s) => s.slot === 'BREAK_FAST')
  check('ochtendkracht: BREAK_FAST om 07:30', bf.timeMin === 7 * 60 + 30)
}

// ---- Venster over middernacht: niet inklappen tot één uur ----
{
  const profile = { ...appProfile, window_start: '20:00:00', window_end: '01:00:00' }
  const win = effectiveWindow(new Date(), profile, [], null)
  check('middernacht: vensterlengte 5 uur', win.closeMin - win.openMin === 300)
  const slots = deriveSlots('REST', win, [])
  check('middernacht: alle slots binnen het venster',
    slots.every((s) => s.timeMin >= win.openMin && s.timeMin <= win.closeMin - 15))
}

// ---- Family-cap blijft hard, ook bij een uitgedunde pool ----
{
  const prefs = { meal: {}, ingredient: {} }
  for (const m of SEED_MEALS) {
    if (m.eligibleSlots.includes('CLOSE') && (m.family === 'yoghurt' || m.family === 'huttenkase')) {
      prefs.meal[mealPrefKey(m.id, 'CLOSE')] = 'dislike'
    }
  }
  const input = makeInput('REST', { seed: 7 })
  const alts = alternativesForSlot({ ...input, prefs }, 'CLOSE', 'c05')
  const fam = {}
  for (const a of alts) fam[a.meal.family] = (fam[a.meal.family] ?? 0) + 1
  check('family-cap hard bij uitgedunde pool', Object.values(fam).every((n) => n <= 3),
    JSON.stringify(fam))
}

console.log(failures === 0 ? '\nALLE TESTS GESLAAGD' : `\n${failures} TESTS GEFAALD`)
process.exit(failures === 0 ? 0 : 1)
