import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../App'
import StatusRing from '../components/StatusRing'
import TipCard from '../components/TipCard'
import BadNightButton from '../components/BadNightButton'
import HeavyFlow from './HeavyFlow'
import { computeStatus, dateKey, fastTarget, formatDuration, formatHm } from '../lib/time'
import { pickTip } from '../lib/tips'
import { computeStreak } from '../lib/streak'
import { wellbeingSignal } from '../lib/advice'
import type { Tip } from '../lib/types'

export default function Home() {
  const data = useAppData()
  const {
    profile,
    schedule,
    tips,
    reads,
    favorites,
    toggleFavorite,
    markRead,
    fasts,
    measurements,
    patchFast,
    upsertToday,
    activeFast,
    refresh,
  } = data

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const status = useMemo(
    () => computeStatus(now, profile, schedule, activeFast?.started_at ?? null, fasts),
    [now, profile, schedule, activeFast, fasts],
  )

  // Vast die zijn doel heeft bereikt: rustig afronden als 'gehaald'.
  // Toets tegen het doel zelf, niet tegen de afgeleide status — die kan een
  // tik achterlopen op de klok.
  const completing = useRef(false)
  useEffect(() => {
    if (!activeFast?.started_at || completing.current) return
    const target = fastTarget(new Date(activeFast.started_at), profile, schedule, fasts)
    if (Date.now() < target.getTime()) return
    completing.current = true
    patchFast(activeFast.day, {
      status: 'completed',
      ended_at: target.toISOString(),
    }).finally(() => {
      completing.current = false
    })
  }, [activeFast, status.kind, profile, schedule, fasts, patchFast])

  // Er staat altijd één tip op dit scherm. Hij ververst elk uur, maar alleen
  // als je hem ook echt gezien hebt: binnen het uur terugkomen (of van tabblad
  // wisselen) toont dezelfde tip, en er rouleert niets terwijl de app dicht
  // is of op de achtergrond staat.
  const TIP_STATE_KEY = 'vz_tip_state_v1'
  const TIP_TTL = 60 * 60 * 1000
  const [tip, setTip] = useState<Tip | null>(null)
  const [tipShownAt, setTipShownAt] = useState(0)
  const [shownIds, setShownIds] = useState<number[]>([])
  const pickedOnce = useRef(false)

  function pickFresh(exclude: number[]) {
    const s = computeStatus(new Date(), profile, schedule, activeFast?.started_at ?? null, fasts)
    const t = pickTip(tips, reads, { phase: s.phase, sportDay: s.sport !== null, heavy: false }, exclude)
    if (t) {
      setTip(t)
      setTipShownAt(Date.now())
      setShownIds((prev) => [...prev.slice(-20), t.id])
      markRead(t.id, false)
      try {
        localStorage.setItem(TIP_STATE_KEY, JSON.stringify({ tipId: t.id, shownAt: Date.now() }))
      } catch {
        // opslag vol of geblokkeerd: geen ramp, dan rouleert hij vaker
      }
    }
  }

  useEffect(() => {
    if (pickedOnce.current || tips.length === 0) return
    pickedOnce.current = true
    try {
      const stored = JSON.parse(localStorage.getItem(TIP_STATE_KEY) ?? 'null') as {
        tipId: number
        shownAt: number
      } | null
      if (stored && Date.now() - stored.shownAt < TIP_TTL) {
        const t = tips.find((x) => x.id === stored.tipId)
        if (t) {
          // dezelfde tip als eerder dit uur; niet opnieuw als gelezen tellen
          setTip(t)
          setTipShownAt(stored.shownAt)
          setShownIds([t.id])
          return
        }
      }
    } catch {
      // kapotte cache: gewoon vers kiezen
    }
    pickFresh([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips])

  // Uurlijkse verversing zolang het scherm open en zichtbaar is
  useEffect(() => {
    if (!tip || tipShownAt === 0) return
    if (Date.now() - tipShownAt >= TIP_TTL && document.visibilityState === 'visible') {
      pickFresh(shownIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  function nextTip() {
    pickFresh(shownIds)
  }

  const [heavyOpen, setHeavyOpen] = useState(false)
  const streak = useMemo(() => computeStreak(fasts, profile, schedule), [fasts, profile, schedule])
  const signal = useMemo(() => wellbeingSignal(fasts, measurements), [fasts, measurements])

  const todayFast = fasts.find((f) => f.day === dateKey(now))

  async function openHeavy() {
    setHeavyOpen(true)
    const day = activeFast?.day ?? dateKey(now)
    const row = fasts.find((f) => f.day === day)
    await patchFast(day, { heavy_presses: (row?.heavy_presses ?? 0) + 1 })
  }

  async function startFast() {
    await upsertToday({
      status: 'active',
      started_at: new Date().toISOString(),
      ended_at: null,
    })
  }

  const fasting = status.kind === 'fasting'

  return (
    <>
      <div className="home-cols">
        <div className="home-col">
          <section className="status-hero" aria-live="polite">
            <StatusBadge kind={status.kind} />
            <StatusRing status={status} />
            <p className="muted small" style={{ textAlign: 'center' }}>
              {statusLine(status, activeFast?.started_at ?? null)}
            </p>
          </section>

          {!fasting && status.kind !== 'unplanned' && status.advisedStart && (
            <div className={`advice ${status.overdue ? 'caution' : 'info'}`} role="status">
              <span>
                {status.overdue
                  ? `Je wilde rond ${formatHm(status.advisedStart)} beginnen met vasten. Later starten kan gewoon — je vast duurt even lang en is dus later klaar.`
                  : `Indicator voor vandaag: rond ${formatHm(status.advisedStart)} beginnen met vasten.`}
              </span>
            </div>
          )}

          {!fasting && status.kind !== 'unplanned' && (
            <button className="btn-start" onClick={startFast}>
              <span className="btn-start-label">Start het vasten</span>
              <span className="btn-start-sub">vanaf dit moment</span>
            </button>
          )}

          {fasting && (
            <button className="btn-heavy" onClick={openHeavy}>
              Ik heb het zwaar
            </button>
          )}

          <BadNightButton />

          {signal.show && (
            <div className="advice caution" role="status">
              <span>{signal.text}</span>
            </div>
          )}

          {todayFast?.status === 'broken' && !fasting && (
            <p className="faint" style={{ textAlign: 'center' }}>
              Vandaag eerder gestopt. Prima keuze als het niet ging — morgen weer een kans.
            </p>
          )}
        </div>

        <div className="home-col">
          {tip && (
            <TipCard
              tip={tip}
              isFavorite={favorites.has(tip.id)}
              onToggleFavorite={() => toggleFavorite(tip.id)}
              onNext={nextTip}
            />
          )}
          {!tip && tips.length === 0 && (
            <div className="card stack">
              <p className="muted small">
                De tips konden niet geladen worden. Controleer je verbinding en probeer het
                opnieuw.
              </p>
              <button className="btn" onClick={() => refresh()}>
                Opnieuw laden
              </button>
            </div>
          )}

          {streak.current > 0 && (
            <div className="card row">
              <div className="stat-tile">
                <div className="stat-value" style={{ color: 'var(--neon-lime)' }}>
                  {streak.current}
                </div>
                <div className="stat-label">dagen op rij</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value" style={{ color: 'var(--neon-cyan)' }}>
                  {streak.best}
                </div>
                <div className="stat-label">beste reeks</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {heavyOpen && <HeavyFlow onClose={() => setHeavyOpen(false)} />}
    </>
  )
}

function StatusBadge({ kind }: { kind: string }) {
  if (kind === 'fasting') {
    return (
      <span className="status-badge fast">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M6 3h12M6 21h12M8 3c0 6 8 6 8 10s-8 4-8 8M16 3c0 6-8 6-8 10s8 4 8 8" />
        </svg>
        JE VAST NU
      </span>
    )
  }
  if (kind === 'unplanned') {
    return <span className="chip">Nog geen schema</span>
  }
  return (
    <span className="status-badge eat">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M5 12l5 5L20 7" />
      </svg>
      {kind === 'free' ? 'VRIJE DAG' : 'JE MAG ETEN'}
    </span>
  )
}

function statusLine(
  status: ReturnType<typeof computeStatus>,
  startedAt: string | null,
): string {
  const t = formatHm(status.changeAt)
  switch (status.kind) {
    case 'fasting':
      return `Gestart om ${startedAt ? formatHm(new Date(startedAt)) : '—'}, al ${formatDuration(status.elapsedMs)} bezig. Klaar om ${t}.`
    case 'eating':
      return `Je venster sluit om ${t}. Eet rustig en bewust; proppen hoeft niet.`
    case 'idle':
      return `Je venster opent om ${t}. Nog niet gegeten? Dan vast je feitelijk al — druk op start om de teller te laten lopen.`
    case 'free':
      return 'Vandaag geen vast gepland. Eet normaal; de knop staat klaar voor vanavond.'
    default:
      return 'Stel onder ‘Schema’ je vastendagen en eetvenster in.'
  }
}
