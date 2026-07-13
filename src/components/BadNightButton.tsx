import { useState } from 'react'
import { useAppData } from '../App'
import { dateKey, formatTime, parseTime, planForDate } from '../lib/time'

/**
 * "Zeer slechte nacht gehad" → vandaag niet vasten. Eén plek voor de logica,
 * getoond op Home én in de voedingsmodule:
 * - een lopende (nacht)vast wordt afgerond als 'skipped' — telt niet, breekt
 *   de reeks niet (skipped-dagen tellen in de streak als vrije dag);
 * - vandaag krijgt status 'skipped' met reden 'bad_night';
 * - het eetvenster opent per direct (of op de normale tijd als die al voorbij
 *   is), zodat het voedingsplan van vandaag meteen herrekent.
 */
export default function BadNightButton({ onChanged }: { onChanged?: () => void }) {
  const { profile, schedule, fasts, activeFast, patchFast } = useAppData()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const now = new Date()
  const todayKey = dateKey(now)
  const todayFast = fasts.find((f) => f.day === todayKey)
  const isBadNightToday = todayFast?.status === 'skipped' && todayFast.skip_reason === 'bad_night'

  async function markBadNight() {
    setBusy(true)
    const nowIso = now.toISOString()
    // Nachtvast die nog loopt (gestart op een eerdere dag): rustig afronden.
    if (activeFast && activeFast.day !== todayKey) {
      await patchFast(activeFast.day, { status: 'skipped', ended_at: nowIso })
    }
    const plan = planForDate(now, profile, schedule)
    const nowMin = now.getHours() * 60 + now.getMinutes()
    await patchFast(todayKey, {
      status: 'skipped',
      skip_reason: 'bad_night',
      window_start: formatTime(Math.min(nowMin, plan.startMin)),
      ...(activeFast?.day === todayKey ? { ended_at: nowIso } : {}),
    })
    setBusy(false)
    setConfirming(false)
    onChanged?.()
  }

  async function undoBadNight() {
    setBusy(true)
    await patchFast(todayKey, {
      status: 'planned',
      skip_reason: null,
      window_start: null,
      ended_at: null,
    })
    setBusy(false)
    onChanged?.()
  }

  if (isBadNightToday) {
    const opened = todayFast?.window_start
      ? formatTime(parseTime(todayFast.window_start))
      : null
    return (
      <div className="advice info" role="status">
        <span>
          Slechte nacht — vandaag geen vast. {opened ? `Je eetvenster is open sinds ${opened}. ` : ''}
          Eet normaal, houd je eiwit op peil, en vanavond staat de startknop gewoon weer klaar.{' '}
          <button className="link-btn" onClick={undoBadNight} disabled={busy}>
            Toch vasten vandaag
          </button>
        </span>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="advice caution" role="alertdialog" aria-label="Vandaag niet vasten?">
        <span>
          Vandaag niet vasten na een zeer slechte nacht? Je eetvenster opent dan per direct en je
          reeks blijft gewoon staan — slaaptekort uitvechten met honger is geen discipline, het is
          slijtage.
          <span className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={markBadNight} disabled={busy}>
              Ja, vandaag niet vasten
            </button>
            <button className="btn btn-ghost small" onClick={() => setConfirming(false)}>
              Annuleer
            </button>
          </span>
        </span>
      </div>
    )
  }

  return (
    <button className="btn btn-ghost btn-wide bad-night-btn" onClick={() => setConfirming(true)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
      </svg>
      Zeer slechte nacht? Sla het vasten vandaag over
    </button>
  )
}
