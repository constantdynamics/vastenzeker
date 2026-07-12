import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../App'
import { computeStatus, formatClock } from '../lib/time'
import { pickTip } from '../lib/tips'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/types'
import type { Tip } from '../lib/types'

/**
 * De "ik heb het zwaar"-flow: swipebare kaarten met één krachtig inzicht
 * en één directe actie per kaart. Bovenaan altijd: hoelang nog.
 * Stoppen kan altijd, zonder schuldgevoel en zonder straf.
 */
export default function HeavyFlow({ onClose }: { onClose: () => void }) {
  const { profile, schedule, tips, reads, markRead, upsertToday } = useAppData()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const status = useMemo(() => computeStatus(now, profile, schedule), [now, profile, schedule])

  const [card, setCard] = useState<Tip | null>(null)
  const [seen, setSeen] = useState<number[]>([])
  const [stopScreen, setStopScreen] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current || tips.length === 0) return
    started.current = true
    advance([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips])

  function advance(exclude: number[]) {
    const s = computeStatus(new Date(), profile, schedule)
    const t = pickTip(tips, reads, { phase: s.phase, sportDay: s.sport !== null, heavy: true }, exclude)
    if (t) {
      setCard(t)
      setSeen((prev) => [...prev, t.id])
      markRead(t.id, true)
    }
  }

  // swipe-afhandeling
  const [dragX, setDragX] = useState(0)
  const dragStart = useRef<number | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientX
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStart.current !== null) setDragX(e.touches[0].clientX - dragStart.current)
  }
  function onTouchEnd() {
    if (Math.abs(dragX) > 70) advance(seen.slice(-30))
    setDragX(0)
    dragStart.current = null
  }

  async function stopToday() {
    await upsertToday({ status: 'broken', ended_at: new Date().toISOString() })
    onClose()
  }

  const accent = card ? CATEGORY_COLORS[card.category] : 'var(--neon-purple)'

  if (stopScreen) {
    return (
      <div className="heavy-screen">
        <div className="heavy-card-zone">
          <div className="heavy-card" style={{ ['--accent' as string]: 'var(--neon-teal)' }}>
            <h2>Stoppen is oké</h2>
            <p className="tip-body">
              Voel je je beroerd, duizelig of gewoon op? Dan is stoppen de verstandige keuze, geen
              zwakke. Eén ingekorte dag verandert niets aan het grotere plaatje. Eet iets rustigs,
              drink water en pak het morgen of overmorgen weer op.
            </p>
            <p className="tip-body">
              Voelt het vasten bijna elke dag zo? Dan is je schema te streng. Versoepel het onder
              ‘Schema’.
            </p>
          </div>
        </div>
        <div className="heavy-foot">
          <button className="btn btn-primary btn-wide" onClick={stopToday}>
            Ik stop voor vandaag
          </button>
          <button className="btn btn-ghost btn-wide" onClick={() => setStopScreen(false)}>
            Toch nog even volhouden
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="heavy-screen">
      <div className="heavy-head">
        <span className="faint" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          nog te gaan
        </span>
        <div className="heavy-count">
          {status.kind === 'fasting' ? formatClock(status.msToChange) : '00:00:00'}
        </div>
        <span className="faint">Dit is tijdelijk. De golf zakt vanzelf.</span>
      </div>

      <div
        className="heavy-card-zone"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {card ? (
          <article
            className={`heavy-card ${dragStart.current !== null ? 'swiping' : ''}`}
            style={{
              ['--accent' as string]: accent,
              transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)`,
              opacity: 1 - Math.min(0.5, Math.abs(dragX) / 300),
            }}
          >
            <span className="tip-cat" style={{ ['--accent' as string]: accent }}>
              {CATEGORY_LABELS[card.category]}
            </span>
            <h2 style={{ fontSize: 20 }}>{card.title}</h2>
            <p className="tip-body">{card.body}</p>
            {card.action && <div className="heavy-action">Doe nu: {card.action}</div>}
          </article>
        ) : (
          <p className="muted">Kaarten laden…</p>
        )}
      </div>

      <div className="heavy-foot">
        <div className="row">
          <button className="btn" onClick={() => advance(seen.slice(-30))}>
            Volgende kaart →
          </button>
          <button className="btn" onClick={onClose}>
            Het gaat weer
          </button>
        </div>
        <button className="btn btn-ghost btn-wide muted" onClick={() => setStopScreen(true)}>
          Ik wil stoppen
        </button>
      </div>
    </div>
  )
}
