import { parseTime, windowLengthHours } from './time'
import type {
  Experience,
  FastDay,
  Measurement,
  Profile,
  ScheduleDay,
  SportType,
} from './types'

export interface Advice {
  level: 'info' | 'caution' | 'warning'
  text: string
}

/**
 * Advies bij een gekozen eetvenster. De app adviseert, verbiedt niet —
 * behalve de veiligheidsgrenzen, die krijgen een expliciete waarschuwing.
 */
export function windowAdvice(start: string, end: string): Advice[] {
  const out: Advice[] = []
  const startMin = parseTime(start)
  const endMin = parseTime(end)
  const len = windowLengthHours(start, end)

  if (len < 2) {
    out.push({
      level: 'warning',
      text: 'Een venster korter dan 2 uur is extreem. Dit raden we af zonder ervaring én overleg met je huisarts.',
    })
  } else if (len < 4) {
    out.push({
      level: 'caution',
      text: 'Een venster onder de 4 uur (richting OMAD) is zwaar en lastig vol te houden naast een gezin. Bouw hier langzaam naartoe op.',
    })
  }

  if (endMin > 21 * 60 && endMin > startMin) {
    out.push({
      level: 'caution',
      text: 'Je venster sluit na 21:00. Eten vlak voor het slapen drukt de slaapkwaliteit. Eerder sluiten slaapt meestal beter.',
    })
  }
  if (endMin <= startMin) {
    out.push({
      level: 'caution',
      text: 'Je venster loopt over middernacht. Laat eten verstoort slaap en bloedsuikerregulatie. Kan, maar het is niet de gunstigste keuze.',
    })
  }

  if (startMin >= 9 * 60 && startMin <= 13 * 60 && endMin <= 20 * 60 && endMin > startMin && len >= 6 && len <= 10) {
    out.push({
      level: 'info',
      text: 'Dit venster ligt in de gunstige zone. Een venster vroeger op de dag lijkt beter voor de bloedsuikerregulatie dan laat op de avond eten.',
    })
  } else if (len >= 4) {
    out.push({
      level: 'info',
      text: 'Als ideaal geldt ruwweg: openen tussen 9:00 en 13:00, sluiten uiterlijk 20:00. Vroeg op de dag eten lijkt gunstiger voor je bloedsuiker dan laat op de avond. Afwijken mag; dit is advies, geen verbod.',
    })
  }

  return out
}

/** Waarschuwingen bij een te ambitieus weekschema. */
export function scheduleAdvice(
  schedule: ScheduleDay[],
  profile: Profile,
): Advice[] {
  const out: Advice[] = []
  const fastingDays = schedule.filter((s) => s.fasting)
  const n = fastingDays.length

  if (n === 7) {
    out.push({
      level: 'caution',
      text: 'Zeven dagen per week zonder één vrije dag. Kan, maar een vaste hersteldag (bijvoorbeeld zondag, taart bij het ontbijt) maakt dit veel beter vol te houden.',
    })
  }

  const avgLen =
    fastingDays.length === 0
      ? 8
      : fastingDays.reduce(
          (sum, d) =>
            sum +
            windowLengthHours(
              d.window_start ?? profile.window_start,
              d.window_end ?? profile.window_end,
            ),
          0,
        ) / fastingDays.length

  if (n >= 6 && avgLen <= 4) {
    out.push({
      level: 'warning',
      text: 'Zes of zeven dagen met een venster van 4 uur of korter is een zware combinatie. Grote kans dat dit binnen een paar weken strandt. Kies minder dagen of een ruimer venster.',
    })
  }

  if (profile.experience === 'none' && (n > 5 || avgLen < 8)) {
    out.push({
      level: 'caution',
      text: 'Je begint net. Start met 3 tot 5 dagen en een venster van 8 tot 10 uur (14:10 of 16:8). Streng beginnen is de meest voorkomende reden om af te haken.',
    })
  }

  if (n > 0 && out.length === 0) {
    out.push({
      level: 'info',
      text: 'Dit schema oogt haalbaar. Houd het 4 tot 6 weken vol, kijk dan pas of je wilt aanscherpen.',
    })
  }

  return out
}

function fmtMin(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

/**
 * Sportadvies per dag: nuchter of gevoed, tijdgebonden waarschuwingen bij
 * onverstandige combinaties, en concrete suggesties om de training óf het
 * venster te verschuiven. Altijd met onderbouwing.
 */
export function sportAdvice(
  sport: SportType,
  day: ScheduleDay | undefined,
  profile: Profile,
): Advice[] {
  const out: Advice[] = []
  const start = day?.window_start ?? profile.window_start
  const end = day?.window_end ?? profile.window_end
  const openMin = parseTime(start)
  let closeMin = parseTime(end)
  if (closeMin <= openMin) closeMin += 1440
  const isFastingDay = day?.fasting ?? true
  const heavySport = sport === 'strength' || sport === 'intense'

  // Basisadvies per type
  switch (sport) {
    case 'easy':
      out.push({
        level: 'info',
        text: 'Rustig bewegen (wandelen, fietsen, zone 2) kan prima nuchter, op elk moment. Je lichaam gebruikt dan vooral vet als brandstof. Water is genoeg.',
      })
      break
    case 'endurance':
      out.push({
        level: 'info',
        text: 'Rustige duurtraining kan nuchter, zeker onder een uur. Wordt de sessie lang of pittig, plan hem dan tegen het einde van je vast zodat je erna direct kunt eten.',
      })
      break
    case 'strength':
      out.push({
        level: 'info',
        text: 'Krachttraining kan nuchter, maar je presteert meestal beter gevoed of vlak voor je venster. Eet na je training eiwit; dat helpt spierbehoud en herstel.',
      })
      break
    case 'intense':
      out.push({
        level: 'caution',
        text: 'Intensieve intervallen of wedstrijden vragen om koolhydraten. Nuchter presteer je dan aantoonbaar minder en voelt het zwaarder. Plan deze training in of vlak voor je eetvenster.',
      })
      break
  }

  // Tijdgebonden advies, alleen zinvol als er een traintijd is ingesteld
  if (!day?.sport_time) {
    out.push({
      level: 'info',
      text: 'Stel je traintijd in, dan kan de app precies adviseren of je beter je training of je venster verschuift.',
    })
  } else if (isFastingDay) {
    const t = parseTime(day.sport_time)
    const beforeOpen = openMin - t

    if (t >= openMin && t < closeMin) {
      out.push({
        level: 'info',
        text: `Je traint om ${fmtMin(t)}, binnen je eetvenster (${fmtMin(openMin)}–${fmtMin(closeMin % 1440)}). Ideaal: je kunt vooraf iets lichts eten en na afloop een volwaardige maaltijd met eiwit.`,
      })
    } else if (t < openMin && beforeOpen <= 90) {
      out.push({
        level: 'info',
        text: `Je traint om ${fmtMin(t)}, vlak voordat je venster om ${fmtMin(openMin)} opent. Dat is de sweet spot: nuchter trainen en direct daarna eten. Zo houd je herstel en vasten allebei intact.`,
      })
    } else if (t < openMin && beforeOpen <= 4 * 60) {
      if (heavySport) {
        out.push({
          level: 'caution',
          text: `Je traint om ${fmtMin(t)}, maar kunt pas om ${fmtMin(openMin)} eten — ${Math.round(beforeOpen / 60)} uur wachten na een zware sessie is niet handig voor herstel. Slimmer: verschuif je training naar ${fmtMin(openMin - 60)}, of open je venster op deze dag om ${fmtMin(t + 60)}.`,
        })
      }
    } else if (t < openMin) {
      if (heavySport) {
        out.push({
          level: 'warning',
          text: `Zwaar trainen om ${fmtMin(t)} betekent diep in je vast trainen én lang wachten op je eerste maaltijd (venster opent pas om ${fmtMin(openMin)}). Je glycogeen is dan laag en je herstel lijdt eronder. Kies één van deze opties: train later (rond ${fmtMin(openMin - 60)}), open je venster op deze dag rond ${fmtMin(t + 60)}, of maak van deze dag een vrije dag.`,
        })
      } else if (sport === 'endurance') {
        out.push({
          level: 'caution',
          text: `Lange duurtraining om ${fmtMin(t)} valt diep in je vast en je eet pas om ${fmtMin(openMin)}. Houd het kort en rustig, of verschuif je training richting je venster.`,
        })
      }
    } else {
      // training na venstersluiting
      if (heavySport) {
        out.push({
          level: 'caution',
          text: `Je traint om ${fmtMin(t)}, ná het sluiten van je venster (${fmtMin(closeMin % 1440)}). Je kunt dan niet meer eten na je training, en dat is precies het moment waarop eiwit het hardst nodig is. Verschuif op deze dag je venster naar later (bijvoorbeeld ${fmtMin(t - 5 * 60)}–${fmtMin(t + 90)}), of train eerder. Let wel: laat eten kan je slaap drukken.`,
        })
      } else {
        out.push({
          level: 'info',
          text: `Je traint om ${fmtMin(t)}, na je venster. Voor rustige sessies is dat prima; drink water en eet morgen in je venster gewoon door.`,
        })
      }
    }
  } else {
    out.push({
      level: 'info',
      text: 'Vrije dag: train wanneer het uitkomt en eet gewoon na afloop. Eiwit na krachttraining blijft het advies.',
    })
  }

  // Herstel: eten en drinken na de training
  out.push({
    level: 'info',
    text:
      sport === 'easy'
        ? 'Na afloop: water is genoeg. Een isotone sportdrank is bij rustig bewegen overbodig — en tijdens je vast breekt hij je vast, want hij bevat suiker.'
        : 'Na je training, in je venster: 20–40 gram eiwit (kwark, eieren, kip, een shake) plus koolhydraten en ruim water. Isotone drank bevat suiker: tijdens je vast breekt hij je vast, maar in je venster na een lange, zware sessie is hij prima. Bij minder dan een uur sporten volstaat water met eventueel wat zout.',
  })

  return out
}

export interface SportFix {
  label: string
  patch: Partial<ScheduleDay>
}

/**
 * Eén-tik-oplossingen bij een botsing tussen sport en vasten op een dag:
 * training verschuiven, het venster van die dag meeschuiven, of de dag
 * vrijgeven. De app past niets stilzwijgend aan — de gebruiker kiest.
 */
export function sportFixes(day: ScheduleDay, profile: Profile): SportFix[] {
  if (!day.fasting || !day.sport_type || !day.sport_time) return []
  const heavy = day.sport_type === 'strength' || day.sport_type === 'intense'
  if (!heavy) return []

  const open = parseTime(day.window_start ?? profile.window_start)
  let close = parseTime(day.window_end ?? profile.window_end)
  if (close <= open) close += 1440
  const len = close - open
  const t = parseTime(day.sport_time)
  const fixes: SportFix[] = []

  const shiftWindow = (newOpen: number): SportFix => ({
    label: `Verschuif venster naar ${fmtMin(newOpen)}–${fmtMin((newOpen + len) % 1440)}`,
    patch: { window_start: fmtMin(newOpen), window_end: fmtMin((newOpen + len) % 1440) },
  })

  if (t < open && open - t > 90) {
    // zwaar trainen diep in de vast
    fixes.push({ label: `Train om ${fmtMin(open - 60)}`, patch: { sport_time: fmtMin(open - 60) } })
    fixes.push(shiftWindow(t + 60))
    fixes.push({ label: 'Maak deze dag vrij', patch: { fasting: false } })
  } else if (t >= close) {
    // trainen na venstersluiting: schuif het venster zo dat je erna nog kunt eten
    fixes.push(shiftWindow(Math.max(open, t + 90 - len)))
    fixes.push({ label: `Train om ${fmtMin(open - 60)}`, patch: { sport_time: fmtMin(open - 60) } })
  }
  return fixes
}

/**
 * Ruiladvies: als een zware sportdag botst met vasten en er is een vrije
 * (weekend)dag, stel dan voor om te ruilen. Vasten in het weekend is prima;
 * een zware sportdag is juist de logischste dag om niet te vasten.
 */
export function swapAdvice(schedule: ScheduleDay[], profile: Profile): Advice[] {
  const out: Advice[] = []
  const dayNames = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
  const freeDays = schedule.filter((d) => !d.fasting && !d.sport_type)

  for (const d of schedule) {
    if (!d.fasting || (d.sport_type !== 'strength' && d.sport_type !== 'intense')) continue
    const open = parseTime(d.window_start ?? profile.window_start)
    const t = d.sport_time ? parseTime(d.sport_time) : null
    const deepInFast = t !== null && t < open && open - t > 4 * 60
    if (!deepInFast) continue
    const swap = freeDays[0]
    if (swap) {
      out.push({
        level: 'info',
        text: `Ruil-optie: maak van ${dayNames[d.weekday]} (zware training om ${d.sport_time!.slice(0, 5)}) een vrije dag en vast in plaats daarvan op ${dayNames[swap.weekday]}. Zwaar trainen en diep vasten gaan slecht samen; vasten in het weekend werkt net zo goed, als het in je gezinsritme past.`,
      })
    }
  }
  return out
}

export interface ScheduleProposal {
  daysPerWeek: number
  fastingWeekdays: number[] // 0 = maandag
  windowStart: string
  windowEnd: string
  protocol: string
  buildupWeeks: number
  blockAdvice: string
  reasoning: string[]
}

/** Stelt op basis van de intake een schema voor. De gebruiker mag alles aanpassen. */
export function proposeSchedule(
  experience: Experience,
  sportDays: Partial<Record<number, SportType>>,
): ScheduleProposal {
  let daysPerWeek: number
  let windowStart: string
  let windowEnd: string
  let protocol: string
  let buildupWeeks: number
  const reasoning: string[] = []

  if (experience === 'none') {
    daysPerWeek = 4
    windowStart = '10:00'
    windowEnd = '20:00'
    protocol = '14:10'
    buildupWeeks = 3
    reasoning.push(
      'Je begint net: 4 dagen met een venster van 10 uur (14:10). Na 3 weken kun je naar 16:8 als dit goed gaat.',
      'De vrije dagen liggen in het weekend en midweeks, zodat je nooit twee zware dagen zonder onderbreking hebt.',
    )
  } else if (experience === 'some') {
    daysPerWeek = 5
    windowStart = '12:00'
    windowEnd = '20:00'
    protocol = '16:8'
    buildupWeeks = 0
    reasoning.push(
      'Je hebt al eens gevast: 5 doordeweekse dagen 16:8 is een bewezen, houdbaar ritme voor iemand met een gezin.',
      'Weekend vrij: ontbijt met de kinderen, verjaardagen, taart op zondag. Dat is geen zwakte maar de reden dat dit vol te houden is.',
    )
  } else {
    daysPerWeek = 6
    windowStart = '12:00'
    windowEnd = '19:00'
    protocol = '17:7'
    buildupWeeks = 0
    reasoning.push(
      'Met jouw ervaring: 6 dagen met een venster van 7 uur, vroeg sluitend voor betere slaap.',
      'Eén vaste vrije dag houdt het sociaal werkbaar en voorkomt dat het een dwangbuis wordt.',
    )
  }

  // Vrije dagen kiezen: zondag altijd vrij (gezinsdag), daarna zaterdag, dan woensdag.
  const freeCount = 7 - daysPerWeek
  const freeOrder = [6, 5, 2, 4, 0]
  const freeDays = freeOrder.slice(0, freeCount)
  const fastingWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !freeDays.includes(d))

  const sportEntries = Object.entries(sportDays) as unknown as [string, SportType][]
  if (sportEntries.some(([, t]) => t === 'strength' || t === 'intense')) {
    reasoning.push(
      'Op je zwaardere sportdagen stelt de app een eerder geopend venster voor, zodat je na je training binnen redelijke tijd kunt eten.',
    )
  }

  return {
    daysPerWeek,
    fastingWeekdays,
    windowStart,
    windowEnd,
    protocol,
    buildupWeeks,
    blockAdvice:
      'Houd dit schema 4 tot 6 weken aan en las dan een lichtere week in (korter vasten of minder dagen). Dat voorkomt sluipende vermoeidheid en houdt het ritme fris. Evalueer daarna: doorgaan, aanscherpen of juist versoepelen.',
    reasoning,
  }
}

export interface WellbeingSignal {
  show: boolean
  text: string
}

/**
 * Rustige, niet-alarmerende signalering bij patronen die op een ongezonde
 * relatie met eten kunnen wijzen. Geen diagnose, wel een suggestie.
 */
export function wellbeingSignal(
  fasts: FastDay[],
  measurements: Measurement[],
): WellbeingSignal {
  const recent = fasts
    .filter((f) => f.status !== 'planned')
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 14)

  // Elke dag zwaar: veel "ik heb het zwaar" over minstens tien recente dagen
  const heavyDays = recent.filter((f) => f.heavy_presses >= 2).length
  const heavyEveryday = recent.length >= 10 && heavyDays >= recent.length * 0.8

  // Gewicht dat hard daalt: meer dan 1% lichaamsgewicht per week over 3+ weken
  let rapidLoss = false
  const sorted = [...measurements].sort((a, b) => (a.measured_on < b.measured_on ? -1 : 1))
  if (sorted.length >= 4) {
    const last = sorted[sorted.length - 1]
    const threeWeeksAgo = new Date(last.measured_on)
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21)
    const ref = sorted.find((m) => new Date(m.measured_on) >= threeWeeksAgo)
    if (ref && ref.id !== last.id) {
      const days =
        (new Date(last.measured_on).getTime() - new Date(ref.measured_on).getTime()) / 86400000
      if (days >= 18) {
        const lossPerWeek = ((ref.weight_kg - last.weight_kg) / ref.weight_kg / days) * 7
        rapidLoss = lossPerWeek > 0.012
      }
    }
  }

  if (heavyEveryday && rapidLoss) {
    return {
      show: true,
      text: 'Je gewicht daalt snel en het vasten voelt bijna elke dag zwaar. Dat is geen teken van discipline maar van een schema dat niet past. Overweeg een pauze en bespreek dit eens met je huisarts.',
    }
  }
  if (rapidLoss) {
    return {
      show: true,
      text: 'Je gewicht daalt op dit moment sneller dan ongeveer 1% per week. Sneller is niet beter: het kost spiermassa en is zelden houdbaar. Verruim je venster of las een rustige week in. Bij twijfel: huisarts.',
    }
  }
  if (heavyEveryday) {
    return {
      show: true,
      text: 'Het vasten voelt al ruim een week bijna elke dag zwaar. Dat hoort niet zo te blijven. Versoepel je schema, en als eten veel in je hoofd zit: er met een professional over praten is verstandig, niet overdreven.',
    }
  }
  return { show: false, text: '' }
}
