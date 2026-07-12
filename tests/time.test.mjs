// Scenario-tests voor de status-engine (computeStatus) met handmatige start:
// rood alleen als er een gestarte vast loopt; anders adviseert de app een starttijd.
import { computeStatus, fastTarget, windowLengthHours, protocolName } from './.bundles/time-bundle.mjs'

const profile = { window_start: '12:00:00', window_end: '20:00:00' }
const allFasting = Array.from({ length: 7 }, (_, weekday) => ({
  weekday, fasting: true, window_start: null, window_end: null, sport_type: null,
}))
const sundayFree = allFasting.map((d) => (d.weekday === 6 ? { ...d, fasting: false } : d))

// 2026-07-12 is een zondag; 2026-07-13 een maandag
const at = (s) => new Date(s)

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures++
    console.log(`FAIL ${name}: kreeg ${JSON.stringify(actual)}, verwachtte ${JSON.stringify(expected)}`)
  } else {
    console.log(`ok   ${name}`)
  }
}

// 1. Geen actieve vast, maandag 14:00 in venster → eten; indicator wijst 20:00 aan
let s = computeStatus(at('2026-07-13T14:00:00'), profile, allFasting, null)
check('eten om 14u', [s.kind, s.changeAt.getHours()], ['eating', 20])
check('indicator: start rond 20u', [s.advisedStart.getHours(), s.overdue], [20, false])

// 2. Geen actieve vast, maandag 22:00 → idle (niet rood!), overdue, venster opent di 12:00
s = computeStatus(at('2026-07-13T22:00:00'), profile, allFasting, null)
check('avond zonder start = idle', [s.kind, s.overdue], ['idle', true])
check('idle omslagpunt di 12u', [s.changeAt.getDate(), s.changeAt.getHours()], [14, 12])

// 3. Vast gestart ma 20:15 → om 23:00 rood, doel = start + 16u = di 12:15
s = computeStatus(at('2026-07-13T23:00:00'), profile, allFasting, '2026-07-13T20:15:00')
check('gestarte vast = rood', s.kind, 'fasting')
check('doel di 12:15', [s.fastTargetEnd.getDate(), s.fastTargetEnd.getHours(), s.fastTargetEnd.getMinutes()], [14, 12, 15])
check('2u45m bezig', Math.round(s.elapsedMs / 60000), 165)

// 3b. Eerder gestart = eerder klaar: start ma 18:25 → klaar di 10:25 (16 uur)
s = computeStatus(at('2026-07-13T20:20:00'), profile, allFasting, '2026-07-13T18:25:00')
check('vroege start: klaar om 10:25', [s.fastTargetEnd.getDate(), s.fastTargetEnd.getHours(), s.fastTargetEnd.getMinutes()], [14, 10, 25])

// 4. Vast voorbij doel → niet meer rood; in venster → eten (UI rondt af)
s = computeStatus(at('2026-07-14T13:00:00'), profile, allFasting, '2026-07-13T20:00:00')
check('voorbij doel = eten', s.kind, 'eating')

// 5. Maandagochtend 08:00 zonder start → idle, overdue (advies was gisteravond)
s = computeStatus(at('2026-07-13T08:00:00'), profile, allFasting, null)
check('ochtend zonder start = idle+overdue', [s.kind, s.overdue], ['idle', true])
check('ochtend: venster opent 12u', s.changeAt.getHours(), 12)

// 6. Vrije zondag → free; indicator wijst naar zo-avond 20:00 (voor ma 12:00)
s = computeStatus(at('2026-07-12T10:00:00'), profile, sundayFree, null)
check('vrije zondag', s.kind, 'free')
check('indicator op vrije dag: zo 20u', [s.advisedStart.getDate(), s.advisedStart.getHours()], [12, 20])

// 7. Nachtvenster 18:00-02:00: om 23:00 in venster
const nightProfile = { window_start: '18:00:00', window_end: '02:00:00' }
s = computeStatus(at('2026-07-13T23:00:00'), nightProfile, allFasting, null)
check('nachtvenster: eten om 23u', [s.kind, s.changeAt.getDate(), s.changeAt.getHours()], ['eating', 14, 2])

// 8. fastTarget: altijd start + protocolduur (16u bij 16:8)
let target = fastTarget(at('2026-07-13T20:15:00'), profile, allFasting)
check('fastTarget = start + 16u', [target.getDate(), target.getHours(), target.getMinutes()], [14, 12, 15])

// 9. fastTarget zonder vastendag in zicht → profielduur (16u)
const onlyMonday = Array.from({ length: 7 }, (_, weekday) => ({
  weekday, fasting: weekday === 0, window_start: null, window_end: null, sport_type: null,
}))
target = fastTarget(at('2026-07-14T20:00:00'), profile, onlyMonday) // di-avond, volgende vastendag pas ma
check('fastTarget vangnet 16u', Math.round((target.getTime() - at('2026-07-14T20:00:00').getTime()) / 3600000), 16)

// 10. Geen enkele vastendag → unplanned
const noneFasting = allFasting.map((d) => ({ ...d, fasting: false }))
s = computeStatus(at('2026-07-13T10:00:00'), profile, noneFasting, null)
check('geen schema', s.kind, 'unplanned')

// 11. Leeg schema → profielvenster geldt, elke dag
s = computeStatus(at('2026-07-13T13:00:00'), profile, [], null)
check('leeg schema: profielvenster', s.kind, 'eating')

// 12. Voortgang: gestart 20:00, om 04:00 halverwege een 16-uursvast
s = computeStatus(at('2026-07-14T04:00:00'), profile, allFasting, '2026-07-13T20:00:00')
check('voortgang halverwege', Math.round(s.progress * 100), 50)
check('fase midden in de vast', s.phase, 'fast_mid')

// 13. hulpfuncties
check('vensterlengte 16:8', windowLengthHours('12:00', '20:00'), 8)
check('vensterlengte nachtvenster', windowLengthHours('18:00', '02:00'), 8)
check('protocolnaam 16:8', protocolName('12:00', '20:00'), '16:8')
check('protocolnaam OMAD', protocolName('17:00', '18:00'), 'OMAD')
check('protocolnaam 18:6', protocolName('12:00', '18:00'), '18:6')

console.log(failures === 0 ? '\nALLE TESTS GESLAAGD' : `\n${failures} TESTS GEFAALD`)
process.exit(failures === 0 ? 0 : 1)
