// Scenario-tests voor de status-engine (computeStatus).
import { computeStatus, windowLengthHours, protocolName } from './.bundles/time-bundle.mjs'

const profile = { window_start: '12:00:00', window_end: '20:00:00' }
const allFasting = Array.from({ length: 7 }, (_, weekday) => ({
  weekday, fasting: true, window_start: null, window_end: null, sport_type: null,
}))
// zondag (weekday 6) vrij
const sundayFree = allFasting.map((d) => (d.weekday === 6 ? { ...d, fasting: false } : d))

// 2026-07-12 is een zondag; 2026-07-13 een maandag
const at = (dateStr) => new Date(dateStr)

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

// 1. Maandag 14:00, venster 12-20 → eten, omslag 20:00
let s = computeStatus(at('2026-07-13T14:00:00'), profile, allFasting)
check('eten om 14u', [s.kind, s.changeAt.getHours()], ['eating', 20])

// 2. Maandag 22:00 → vasten, omslag dinsdag 12:00 (14 uur later)
s = computeStatus(at('2026-07-13T22:00:00'), profile, allFasting)
check('vasten om 22u', [s.kind, s.changeAt.getDate(), s.changeAt.getHours()], ['fasting', 14, 12])
check('vast-duur 16u totaal', Math.round(s.totalMs / 3600000), 16)
check('vast 2u bezig', Math.round(s.elapsedMs / 3600000), 2)

// 3. Maandag 08:00 → vasten, omslag vandaag 12:00
s = computeStatus(at('2026-07-13T08:00:00'), profile, allFasting)
check('vasten om 8u', [s.kind, s.changeAt.getDate(), s.changeAt.getHours()], ['fasting', 13, 12])
check('fase laat in de vast', s.phase, 'fast_late')

// 4. Zondag vrij → free
s = computeStatus(at('2026-07-12T10:00:00'), profile, sundayFree)
check('vrije zondag', s.kind, 'free')

// 5. Zaterdagavond 22:00 met vrije zondag → vasten tot middernacht, dan vrij
s = computeStatus(at('2026-07-11T22:00:00'), profile, sundayFree)
check('za-avond voor vrije zondag', [s.kind, s.changeAt.getDate(), s.changeAt.getHours()], ['fasting', 12, 0])

// 6. Zondag (vrij) 23:00 → nog steeds vrij; omslag maandag 00:00? Nee: vrij tot 24:00, daarna vast tot ma 12:00
s = computeStatus(at('2026-07-12T23:00:00'), profile, sundayFree)
check('zo-avond vrij', [s.kind, s.changeAt.getDate(), s.changeAt.getHours()], ['free', 13, 0])

// 7. Venster over middernacht: 18:00–02:00
const nightProfile = { window_start: '18:00:00', window_end: '02:00:00' }
s = computeStatus(at('2026-07-13T23:00:00'), nightProfile, allFasting)
check('nachtvenster: eten om 23u', [s.kind, s.changeAt.getDate(), s.changeAt.getHours()], ['eating', 14, 2])
s = computeStatus(at('2026-07-13T10:00:00'), nightProfile, allFasting)
check('nachtvenster: vasten om 10u', [s.kind, s.changeAt.getHours()], ['fasting', 18])

// 8. Geen enkele vastendag → unplanned
const noneFasting = allFasting.map((d) => ({ ...d, fasting: false }))
s = computeStatus(at('2026-07-13T10:00:00'), profile, noneFasting)
check('geen schema', s.kind, 'unplanned')

// 9. Leeg schema (nog niets opgeslagen) → val terug op profiel, elke dag vasten
s = computeStatus(at('2026-07-13T13:00:00'), profile, [])
check('leeg schema: profielvenster', s.kind, 'eating')

// 10. hulpfuncties
check('vensterlengte 16:8', windowLengthHours('12:00', '20:00'), 8)
check('vensterlengte nachtvenster', windowLengthHours('18:00', '02:00'), 8)
check('protocolnaam 16:8', protocolName('12:00', '20:00'), '16:8')
check('protocolnaam OMAD', protocolName('17:00', '18:00'), 'OMAD')
check('protocolnaam 18:6', protocolName('12:00', '18:00'), '18:6')

// 11. voortgang: om 04:00 (8u in 16u-vast) ≈ 0.5
s = computeStatus(at('2026-07-13T04:00:00'), profile, allFasting)
check('voortgang halverwege', Math.round(s.progress * 100), 50)

console.log(failures === 0 ? '\nALLE TESTS GESLAAGD' : `\n${failures} TESTS GEFAALD`)
process.exit(failures === 0 ? 0 : 1)
