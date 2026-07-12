import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../App'
import StatusRing from '../components/StatusRing'
import TipCard from '../components/TipCard'
import HeavyFlow from './HeavyFlow'
import { computeStatus, dateKey, formatDuration } from '../lib/time'
import { pickTip } from '../lib/tips'
import { computeStreak } from '../lib/streak'
import { wellbeingSignal } from '../lib/advice'
import type { Tip } from '../lib/types'

export default function Home() {
  const data = useAppData()
  const { profile, schedule, tips, reads, favorites, toggleFavorite, markRead, fasts, measurements, upsertToday } = data

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const status = useMemo(() => computeStatus(now, profile, schedule), [
    // herbereken elke seconde; goedkoop genoeg
    now, profile, schedule,
  ])

  const [tip, setTip] = useState<Tip | null>(null)
  const [shownIds, setShownIds] = useState<number[]>([])
  const pickedOnce = useRef(false)

  useEffect(() => {
    if (pickedOnce.current || tips.length === 0) return
    pickedOnce.current = true
    const s = computeStatus(new Date(), profile, schedule)
    const t = pickTip(tips, reads, { phase: s.phase, sportDay: s.sport !== null, heavy: false })
    if (t) {
      setTip(t)
      setShownIds([t.id])
      markRead(t.id, false)
    }
  }, [tips, reads, profile, schedule, markRead])

  function nextTip() {
    const t = pickTip(tips, reads, { phase: status.phase, sportDay: status.sport !== null, heavy: false }, shownIds)
    if (t) {
      setTip(t)
      setShownIds((prev) => [...prev.slice(-20), t.id])
      markRead(t.id, false)
    }
  }

  const [heavyOpen, setHeavyOpen] = useState(false)
  const streak = useMemo(() => computeStreak(fasts, profile, schedule), [fasts, profile, schedule])
  const signal = useMemo(() => wellbeingSignal(fasts, measurements), [fasts, measurements])

  const todayFast = fasts.find((f) => f.day === dateKey(now))

  async function openHeavy() {
    setHeavyOpen(true)
    await upsertToday({ heavy_presses: (todayFast?.heavy_presses ?? 0) + 1 })
  }

  return (
    <>
      <section className="status-hero" aria-live="polite">
        <StatusBadge kind={status.kind} />
        <StatusRing status={status} />
        <p className="muted small" style={{ textAlign: 'center' }}>
          {statusLine(status.kind, status.changeAt, status.elapsedMs)}
        </p>
      </section>

      {status.kind === 'fasting' && (
        <button className="btn-heavy" onClick={openHeavy}>
          Ik heb het zwaar
        </button>
      )}

      {signal.show && (
        <div className="advice caution" role="status">
          <span>{signal.text}</span>
        </div>
      )}

      {tip && (
        <TipCard
          tip={tip}
          isFavorite={favorites.has(tip.id)}
          onToggleFavorite={() => toggleFavorite(tip.id)}
          onNext={nextTip}
        />
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

      {heavyOpen && <HeavyFlow onClose={() => setHeavyOpen(false)} />}
    </>
  )
}

function StatusBadge({ kind }: { kind: string }) {
  if (kind === 'eating' || kind === 'free') {
    return (
      <span className="status-badge eat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M5 12l5 5L20 7" />
        </svg>
        {kind === 'free' ? 'VRIJE DAG' : 'JE MAG ETEN'}
      </span>
    )
  }
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
  return <span className="chip">Nog geen schema</span>
}

function statusLine(kind: string, changeAt: Date, elapsedMs: number): string {
  const t = changeAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  switch (kind) {
    case 'fasting':
      return `Al ${formatDuration(elapsedMs)} bezig. Je venster opent om ${t}.`
    case 'eating':
      return `Je venster sluit om ${t}. Eet rustig en bewust; proppen hoeft niet.`
    case 'free':
      return 'Vandaag geen vastenvenster. Eet normaal, morgen pak je het ritme weer op.'
    default:
      return 'Stel onder ‘Schema’ je vastendagen en eetvenster in.'
  }
}
