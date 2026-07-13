// Alle i-button-teksten. De teksten uit de specificatie staan hier LETTERLIJK —
// niet herformuleren, niet verwateren. Alleen de slechte-nacht-variant is nieuw
// (die feature komt niet uit de oorspronkelijke spec).

import type { DayType, MealSlot } from './types'

// ---------- Laag [1]: slot-rationales ----------

const BREAK_FAST_NORMAL = `Dit is je eerste maaltijd na 17 uur vasten. Hij is koud — jouw voorkeur — en moet 40 tot 50 gram eiwit leveren zonder je calorieënbudget op te eten. Kwark is hier de referentie: 40 gram eiwit voor 215 kcal.`

const BREAK_FAST_FASTED_STRENGTH = `Je hebt net twee uur krachttraining gedaan, na 17 uur vasten. Nu wil je snel eiwit én snelle koolhydraten. Vet vertraagt je maaglediging, dus noten en pindakaas zijn hier juist de verkeerde keuze. En omdat je hierna direct naar kantoor rijdt, moet het meeneembaar zijn.`

// Nieuw voor de slechte-nacht-dag: op zo'n dag klopt "na 17 uur vasten" niet.
const BREAK_FAST_BAD_NIGHT = `Slechte nacht, dus vandaag geen vast — verstandig. Na een korte nacht staan je hongerhormonen hoger en grijp je sneller naar snelle suiker. Juist daarom begint deze dag met structuur: een koude, eiwitrijke eerste maaltijd van 40 tot 50 gram eiwit, zodat je verzadigd de dag in gaat in plaats van snaaiend.`

const SNACK_NORMAL = `Je hebt 190 gram eiwit te verdelen over 7 uur. Zonder een derde eiwitmoment red je dat niet. Dit is geen 'snack' in de gebruikelijke zin — het is een eiwitmoment.`

const SNACK_CARDIO = `Deze snack staat ná je duurloop, niet ervoor. Voor 45 minuten rennen, 3,5 uur na je lunch, heb je geen extra brandstof nodig — en eten vlak voor het rennen geeft alleen maagklachten.`

const SNACK_FED_STRENGTH = `Dit is je pre-workout, 45 minuten voordat je gaat tillen. Snelle koolhydraten, wat eiwit, weinig vet en vezels — die vertragen je vertering en dat merk je in de sportschool.`

const DINNER_ALL = `Je grootste eiwitmoment van de dag, en de enige maaltijd die warm mag. Op krachtdagen is dit tegelijk je herstelmaaltijd.`

const CLOSE_ALL = `Kwark is caseïne: langzaam verteerbaar eiwit dat 6 tot 8 uur druppelsgewijs vrijkomt. Vlak voor een vasten van 17 uur is dat precies wat je wilt — je spieren blijven gevoed terwijl je niet eet. Dit is het moment waarop je de laatste 40 gram van je 190 binnenhaalt.`

export function slotRationale(slot: MealSlot, dayType: DayType, badNight: boolean): string {
  switch (slot) {
    case 'BREAK_FAST':
      if (badNight) return BREAK_FAST_BAD_NIGHT
      return dayType === 'FASTED_STRENGTH' ? BREAK_FAST_FASTED_STRENGTH : BREAK_FAST_NORMAL
    case 'SNACK':
      if (dayType === 'CARDIO') return SNACK_CARDIO
      if (dayType === 'FED_STRENGTH') return SNACK_FED_STRENGTH
      return SNACK_NORMAL
    case 'DINNER':
      return DINNER_ALL
    case 'CLOSE':
      return CLOSE_ALL
  }
}

// ---------- Laag [3]: goal-rationale (altijd onderaan, gedempt) ----------

export const GOAL_RATIONALE = `Je doel is vetverlies met behoud — en waar mogelijk opbouw — van spiermassa. In een calorietekort is eiwit wat je spieren beschermt. Haal je die 190 gram niet, dan verlies je gewicht, inclusief spier.`

// ---------- Samenstelling van het i'tje ----------

export interface ComposedRationale {
  slot: string
  meal: string
  goal: string
}

/** [1] slot + [2] maaltijd + [3] doel — in die volgorde tonen. */
export function composeRationale(
  slot: MealSlot,
  dayType: DayType,
  badNight: boolean,
  mealRationale: string,
): ComposedRationale {
  return {
    slot: slotRationale(slot, dayType, badNight),
    meal: mealRationale,
    goal: GOAL_RATIONALE,
  }
}

// ---------- Dranken (contextuele lijsten) ----------

export interface Drink {
  name: string
  detail: string | null
  rationale: string | null
}

/** Tijdens het vasten: 0 kcal, breekt de vasten niet. */
export const FASTING_DRINKS: Drink[] = [
  { name: 'Water, spa rood', detail: null, rationale: null },
  { name: 'Zwarte koffie', detail: null, rationale: null },
  { name: 'Thee', detail: null, rationale: null },
  { name: 'Verse gember in heet water', detail: 'met citroen', rationale: null },
  {
    name: 'Creatine',
    detail: '3–5 g, geen calorieën, geen insulinerespons',
    rationale: null,
  },
]

export const GINGER_DRINK_RATIONALE = `Het tweede ingrediënt is rijstsiroop — snelle suiker. 23 gram suiker per 100 ml. Alleen binnen je eetvenster: in je vasten geeft dit een insulinerespons en breek je je vasten. Wil je 's ochtends gember, neem dan verse gember in heet water — nul calorieën, zelfde ritueel. En let op: vloeibare calorieën zijn bij vetverlies het klassieke lek. Ze verzadigen niet.`

/** Binnen het eetvenster. */
export const WINDOW_DRINKS: Drink[] = [
  { name: 'Kefir', detail: '50 kcal/100 ml', rationale: null },
  { name: 'Halfvolle melk', detail: '46 kcal/100 ml', rationale: null },
  {
    name: "BioToday Ging'r gemberdrank",
    detail: '138 kcal/100 ml, 23 g suiker/100 ml',
    rationale: GINGER_DRINK_RATIONALE,
  },
]

// ---------- Ingrediënt-rationales (letterlijk uit de spec) ----------
// Gekoppeld op slug; de seed neemt ze over in het rationale-veld.

export const INGREDIENT_RATIONALES: Record<string, string> = {
  'magere-kwark': `10 gram eiwit per 100 gram voor 54 kcal. De beste eiwit/calorie-verhouding in je hele lijst. Caseïne, dus langzaam verteerbaar.`,
  kefir: `3,4 gram eiwit per 100 ml — een derde van kwark. Prima als drank of om kwark drinkbaar te maken, maar reken het niet mee als eiwitbron.`,
  'halfvolle-melk': `Zelfde verhaal als kefir: 3,5 gram eiwit per 100 ml. Om 40 gram eiwit uit melk te halen moet je meer dan een liter drinken. Ingrediënt, geen eiwitbron.`,
  walnoot: `Veruit de meeste plantaardige omega-3 (ALA) van alle noten, en het sterkste onderzoek naar LDL-verlaging. Belangrijk: dat effect komt uit vervangen, niet uit toevoegen. Walnoten in plaats van kaas of koek is winst; walnoten er bovenop is 300 kcal. Doelportie: 20–25 gram per dag.`,
  amandel: `Meeste eiwit van alle noten, plus vitamine E en vezels. Als je één noot kiest voor je doel: deze.`,
  cashew: `Minste calorieën van de noten, maar ook de minste goede vetten. Prima voor de variatie.`,
  pistache: `Koop ze met dop. Je moet ze pellen, dus je eet automatisch langzamer en minder — en de doppen liggen als een ingebouwde teller voor je neus.`,
  pecan: `Meeste calorieën, minste eiwit van alle noten. Lekker, maar dit is dessert — geen gezondheidskeuze.`,
  paranoot: `Eén per dag dekt je hele seleniumbehoefte. Maximaal 3 — selenium is een van de weinige voedingsstoffen waar méér echt slechter is.`,
  pindakaas: `Voor de helft vet (9 kcal per gram) en maar 25 gram eiwit per 100 gram. Het is een vetbron met een beetje eiwit — geen eiwitbron. Gecapt op 15 gram per dag: één afgestreken lepel.`,
}

/** "Hele noten (algemeen)" — getoond bij elke hele noot onder de eigen rationale. */
export const WHOLE_NUTS_RATIONALE = `Bij hele noten wordt een deel van het vet niet opgenomen; de celwanden verzetten zich tegen vertering. Bij amandelen scheelt dat naar schatting 20% ten opzichte van het etiket. Dat voordeel verdwijnt zodra je ze vermaalt tot pasta.`

// ---------- UI-microcopy uit de spec ----------

export const LABEL_NEW = 'Nieuw voor jou'
export const LABEL_PINNED = 'Vast op dit moment'

export function dislikeImpactWarning(mealCount: number): string {
  return `Dit verwijdert ${mealCount} maaltijden uit je rotatie. Doorgaan?`
}
