// Tests voor streak- en advieslogica.
import { computeStreak } from './.bundles/streak-bundle.mjs'
import { windowAdvice, scheduleAdvice, sportAdvice, swapAdvice, wellbeingSignal, proposeSchedule } from './.bundles/advice-bundle.mjs'

let failures = 0
function check(name, cond, detail = '') {
  if (!cond) { failures++; console.log(`FAIL ${name} ${detail}`) } else console.log(`ok   ${name}`)
}

const profile = { window_start: '12:00:00', window_end: '20:00:00', experience: 'some', user_id: 'u' }
const allFasting = Array.from({ length: 7 }, (_, weekday) => ({ weekday, fasting: true, window_start: null, window_end: null, sport_type: null }))
const sundayFree = allFasting.map((d) => (d.weekday === 6 ? { ...d, fasting: false } : d))

// ---- streak ----
// vandaag = runtime-datum; bouw dagen relatief
const dkey = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const fast = (offset, status) => ({ day: dkey(offset), status, heavy_presses: 0 })

// 3 dagen op rij gehaald t/m gisteren
let st = computeStreak([fast(-1, 'completed'), fast(-2, 'completed'), fast(-3, 'completed')], profile, allFasting)
check('streak 3 dagen', st.current === 3, `kreeg ${st.current}`)

// gebroken dag onderbreekt
st = computeStreak([fast(-1, 'completed'), fast(-2, 'broken'), fast(-3, 'completed')], profile, allFasting)
check('streak stopt bij broken', st.current === 1, `kreeg ${st.current}`)

// vrije dag (zondag) breekt niet — met sundayFree schema en gisteren+eergisteren completed rond een zondag is lastig deterministisch; test met skipped-status
st = computeStreak([fast(-1, 'completed'), fast(-2, 'skipped'), fast(-3, 'completed')], profile, allFasting)
check('skipped breekt streak niet', st.current === 2, `kreeg ${st.current}`)

// geen data → 0
st = computeStreak([], profile, allFasting)
check('lege streak', st.current === 0 && st.best === 0)

// ---- windowAdvice ----
check('extreem venster < 2u = warning', windowAdvice('17:00', '18:30').some((a) => a.level === 'warning'))
check('laat venster = caution', windowAdvice('14:00', '22:00').some((a) => a.level === 'caution'))
check('gunstig venster = info', windowAdvice('11:00', '19:00').some((a) => a.level === 'info') && !windowAdvice('11:00', '19:00').some((a) => a.level !== 'info'))

// ---- scheduleAdvice ----
check('7 dagen = caution', scheduleAdvice(allFasting, profile).some((a) => a.level === 'caution'))
const omadWeek = allFasting.map((d) => ({ ...d, window_start: '17:00', window_end: '18:00' }))
check('7 dagen OMAD = warning', scheduleAdvice(omadWeek, profile).some((a) => a.level === 'warning'))
const beginner = { ...profile, experience: 'none' }
check('beginner streng = caution', scheduleAdvice(omadWeek, beginner).some((a) => a.level === 'caution'))
check('redelijk schema = info', scheduleAdvice(sundayFree, profile).some((a) => a.level === 'info'))

// ---- sportAdvice (tijdgebonden) ----
const deepDay = { weekday: 0, fasting: true, window_start: '12:00', window_end: '20:00', sport_type: 'strength', sport_time: '07:00' }
const deep = sportAdvice('strength', deepDay, profile)
check('kracht diep in vast = warning', deep.some((a) => a.level === 'warning'))
check('warning noemt concrete opties', deep.some((a) => a.text.includes('11:00') && a.text.includes('08:00')))

const sweetDay = { ...deepDay, sport_time: '11:00' }
const sweet = sportAdvice('strength', sweetDay, profile)
check('sweet spot = geen warning', !sweet.some((a) => a.level === 'warning'))
check('sweet spot benoemd', sweet.some((a) => a.text.includes('sweet spot')))

const lateDay = { ...deepDay, sport_time: '21:30' }
check('trainen na venster = caution', sportAdvice('strength', lateDay, profile).some((a) => a.level === 'caution' && a.text.includes('venster')))

check('rustig = geen warning', !sportAdvice('easy', undefined, profile).some((a) => a.level === 'warning'))
check('advies altijd met onderbouwing', sportAdvice('intense', undefined, profile).every((a) => a.text.length > 30))
check('hersteladvies noemt isotone drank', sportAdvice('strength', sweetDay, profile).some((a) => a.text.includes('Isotone')))
check('geen traintijd = hint', sportAdvice('strength', { ...deepDay, sport_time: null }, profile).some((a) => a.text.includes('traintijd')))

// ---- swapAdvice ----
const weekSwap = [
  deepDay,
  ...[1, 2, 3, 4].map((weekday) => ({ weekday, fasting: true, window_start: null, window_end: null, sport_type: null, sport_time: null })),
  { weekday: 5, fasting: false, window_start: null, window_end: null, sport_type: null, sport_time: null },
  { weekday: 6, fasting: false, window_start: null, window_end: null, sport_type: null, sport_time: null },
]
check('ruiladvies bij zware dag + vrij weekend', swapAdvice(weekSwap, profile).some((a) => a.text.includes('Ruil')))
const noFree = weekSwap.map((d) => ({ ...d, fasting: true }))
check('geen ruiladvies zonder vrije dag', swapAdvice(noFree, profile).length === 0)

// ---- wellbeing ----
const heavyFasts = Array.from({ length: 12 }, (_, i) => ({ day: dkey(-i - 1), status: 'completed', heavy_presses: 3 }))
check('elke dag zwaar → signaal', wellbeingSignal(heavyFasts, []).show)
const mkMeasure = (offset, kg) => ({ id: String(offset), measured_on: dkey(offset), weight_kg: kg })
const crash = [mkMeasure(-28, 90), mkMeasure(-21, 88.5), mkMeasure(-14, 87), mkMeasure(-7, 85.5), mkMeasure(0, 84)]
check('snel gewichtsverlies → signaal', wellbeingSignal([], crash).show)
const gentle = [mkMeasure(-28, 90), mkMeasure(-14, 89.4), mkMeasure(0, 88.8)]
check('rustig verlies → geen signaal', !wellbeingSignal([], gentle).show)
check('geen data → geen signaal', !wellbeingSignal([], []).show)

// ---- proposeSchedule ----
const p1 = proposeSchedule('none', {})
check('beginner: 4 dagen 14:10', p1.daysPerWeek === 4 && p1.protocol === '14:10')
check('beginner: opbouw', p1.buildupWeeks > 0)
const p2 = proposeSchedule('some', {})
check('gemiddeld: 5 dagen, weekend vrij', p2.daysPerWeek === 5 && !p2.fastingWeekdays.includes(6) && !p2.fastingWeekdays.includes(5))
const p3 = proposeSchedule('experienced', {})
check('ervaren: 6 dagen, zondag vrij', p3.daysPerWeek === 6 && !p3.fastingWeekdays.includes(6))
check('altijd onderbouwing', [p1, p2, p3].every((p) => p.reasoning.length >= 2))

console.log(failures === 0 ? '\nALLE TESTS GESLAAGD' : `\n${failures} TESTS GEFAALD`)
process.exit(failures === 0 ? 0 : 1)
