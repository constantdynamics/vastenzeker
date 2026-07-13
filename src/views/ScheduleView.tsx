import { useMemo, useState } from 'react'
import { useAppData } from '../App'
import { scheduleAdvice, sportAdvice, sportFixes, swapAdvice, windowAdvice } from '../lib/advice'
import { formatTime, parseTime, weekdayOf, windowLengthHours } from '../lib/time'
import WeekGrid from '../components/WeekGrid'
import { SPORT_LABELS, WEEKDAY_FULL, WEEKDAY_LABELS } from '../lib/types'
import type { ScheduleDay, SportType } from '../lib/types'

const PRESETS: { name: string; len: number; start: string; end: string }[] = [
  { name: '14:10', len: 10, start: '10:00', end: '20:00' },
  { name: '16:8', len: 8, start: '12:00', end: '20:00' },
  { name: '18:6', len: 6, start: '12:00', end: '18:00' },
  { name: '20:4', len: 4, start: '14:00', end: '18:00' },
  { name: 'OMAD', len: 1, start: '17:00', end: '18:00' },
]

export default function ScheduleView() {
  const { profile, schedule, updateProfile, saveScheduleDay } = useAppData()
  const [saving, setSaving] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => weekdayOf(new Date()))

  const start = profile.window_start.slice(0, 5)
  const end = profile.window_end.slice(0, 5)

  const days: ScheduleDay[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, d) => {
      const existing = schedule.find((s) => s.weekday === d)
      return (
        existing ?? {
          user_id: profile.user_id,
          weekday: d,
          fasting: true,
          window_start: null,
          window_end: null,
          sport_type: null,
          sport_time: null,
          sport_end_time: null,
        }
      )
    })
  }, [schedule, profile.user_id])

  const winAdvice = useMemo(() => windowAdvice(start, end), [start, end])
  const schedAdvice = useMemo(() => scheduleAdvice(days, profile), [days, profile])

  // Het protocol is leidend: staat er een preset aan, dan houdt het venster
  // zijn vaste lengte en schuift de andere kant automatisch mee.
  const activePreset = PRESETS.find((p) => p.name === profile.protocol) ?? null

  async function setWindow(newStart: string, newEnd: string, protocol: string) {
    setSaving(true)
    await updateProfile({ window_start: newStart, window_end: newEnd, protocol })
    setSaving(false)
  }

  function onStartChange(v: string) {
    if (!v) return
    if (activePreset) {
      const s = parseTime(v)
      setWindow(v, formatTime(s + activePreset.len * 60), activePreset.name)
    } else {
      setWindow(v, end, 'vrij')
    }
  }

  function onEndChange(v: string) {
    if (!v) return
    if (activePreset) {
      const e = parseTime(v)
      setWindow(formatTime(e - activePreset.len * 60), v, activePreset.name)
    } else {
      setWindow(start, v, 'vrij')
    }
  }

  async function patchDay(day: ScheduleDay, patch: Partial<ScheduleDay>) {
    await saveScheduleDay({ ...day, ...patch })
  }

  const eatHours = windowLengthHours(start, end)

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h2>Eetvenster</h2>

      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`chip ${activePreset?.name === p.name ? 'on' : ''}`}
            style={{ ['--chip-color' as string]: 'var(--neon-cyan)' }}
            onClick={() => setWindow(p.start, p.end, p.name)}
          >
            {p.name}
          </button>
        ))}
        <button
          className={`chip ${activePreset ? '' : 'on'}`}
          style={{ ['--chip-color' as string]: 'var(--neon-purple)' }}
          onClick={() => updateProfile({ protocol: 'vrij' })}
        >
          vrij
        </button>
      </div>

      <div className="card stack">
        <div className="row">
          <div className="field">
            <label htmlFor="win-start">Venster opent</label>
            <input
              id="win-start"
              type="time"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="win-end">Venster sluit</label>
            <input
              id="win-end"
              type="time"
              value={end}
              onChange={(e) => onEndChange(e.target.value)}
            />
          </div>
        </div>
        <p className="muted small">
          {Math.round(24 - eatHours)} uur vasten, {Math.round(eatHours)} uur eten
          {activePreset
            ? ` — ${activePreset.name} blijft vast staan: pas je één tijd aan, dan schuift de andere mee`
            : ' — vrij ingesteld: beide tijden los aanpasbaar'}
          {saving ? ' · opslaan…' : ''}
        </p>
      </div>

      {winAdvice.map((a, i) => (
        <div className={`advice ${a.level}`} key={i}>
          <span>{a.text}</span>
        </div>
      ))}

      <h2>Weekschema</h2>
      <p className="muted small">
        Groen is je eetvenster, oranje je sport, de magenta lijn het geadviseerde startmoment van
        je vast. Tik op een dag om hem aan te passen — het advies rekent direct mee.
      </p>

      <WeekGrid
        days={days}
        profile={profile}
        selected={selectedDay}
        onSelect={setSelectedDay}
        onPatch={patchDay}
      />

      <div className="wg-legend">
        <span><i style={{ background: 'rgba(46,224,106,0.4)' }} /> eetvenster</span>
        <span><i style={{ background: 'rgba(255,160,46,0.5)' }} /> sport</span>
        <span><i style={{ borderTop: '2px dashed var(--neon-magenta)', height: 0, width: 12 }} /> start vasten</span>
        <span><i style={{ borderTop: '2px solid var(--neon-cyan)', height: 0, width: 12 }} /> nu</span>
      </div>

      <h3 style={{ fontSize: 16 }}>{WEEKDAY_FULL[selectedDay]}</h3>
      <DayEditor
        key={selectedDay}
        day={days[selectedDay]}
        defaults={{ start, end }}
        onPatch={patchDay}
        defaultExpanded
      />
      {days[selectedDay].sport_type && (
        <div className="stack" style={{ gap: 8 }}>
          {sportAdvice(days[selectedDay].sport_type!, days[selectedDay], profile).map((a, i) => (
            <div className={`advice ${a.level}`} key={i}>
              <span>{a.text}</span>
            </div>
          ))}
          {sportFixes(days[selectedDay], profile).length > 0 && (
            <div className="chips">
              {sportFixes(days[selectedDay], profile).map((f, i) => (
                <button
                  key={i}
                  className="chip"
                  style={{ ['--chip-color' as string]: 'var(--neon-lime)' }}
                  onClick={() => patchDay(days[selectedDay], f.patch)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {schedAdvice.map((a, i) => (
        <div className={`advice ${a.level}`} key={i}>
          <span>{a.text}</span>
        </div>
      ))}

      <SportAdviceBlock days={days} exclude={selectedDay} />

      <div className="card stack">
        <h3 style={{ fontSize: 16 }}>Hoe lang hou je dit vol?</h3>
        <p className="muted small">
          Denk in blokken van 4 tot 6 weken. Daarna een lichtere week: minder dagen of een ruimer
          venster. Zo voorkom je sluipende vermoeidheid en blijft het ritme houdbaar. Merk je dat
          een blok zwaar blijft voelen, versoepel dan eerder.
        </p>
      </div>
    </div>
  )
}

function DayEditor({
  day,
  defaults,
  onPatch,
  defaultExpanded = false,
}: {
  day: ScheduleDay
  defaults: { start: string; end: string }
  onPatch: (day: ScheduleDay, patch: Partial<ScheduleDay>) => void
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const sportOrder: (SportType | null)[] = [null, 'strength', 'endurance', 'intense', 'easy']

  return (
    <div className={`day-row ${day.fasting ? '' : 'free'}`} style={{ flexWrap: 'wrap' }}>
      <span className="day-label">{WEEKDAY_LABELS[day.weekday]}</span>
      <button
        className={`toggle ${day.fasting ? 'on' : ''}`}
        onClick={() => onPatch(day, { fasting: !day.fasting })}
        aria-label={`${WEEKDAY_LABELS[day.weekday]}: ${day.fasting ? 'vastendag' : 'vrije dag'}`}
        aria-pressed={day.fasting}
      />
      <span className="muted small" style={{ flex: 1 }}>
        {day.fasting
          ? `${(day.window_start ?? defaults.start).slice(0, 5)}–${(day.window_end ?? defaults.end).slice(0, 5)}`
          : 'vrij'}
        {day.sport_type
          ? ` · ${SPORT_LABELS[day.sport_type]}${day.sport_time ? ` om ${day.sport_time.slice(0, 5)}` : ''}`
          : ''}
      </span>
      <button className="btn btn-ghost small" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div className="stack" style={{ width: '100%', marginTop: 8 }}>
          {day.fasting && (
            <div className="row">
              <input
                type="time"
                value={(day.window_start ?? defaults.start).slice(0, 5)}
                onChange={(e) => e.target.value && onPatch(day, { window_start: e.target.value })}
                aria-label="Venster opent op deze dag"
              />
              <input
                type="time"
                value={(day.window_end ?? defaults.end).slice(0, 5)}
                onChange={(e) => e.target.value && onPatch(day, { window_end: e.target.value })}
                aria-label="Venster sluit op deze dag"
              />
            </div>
          )}
          <div className="field">
            <label>Sport op deze dag</label>
            <div className="chips">
              {sportOrder.map((s) => (
                <button
                  key={s ?? 'geen'}
                  className={`chip ${day.sport_type === s ? 'on' : ''}`}
                  style={{ ['--chip-color' as string]: 'var(--neon-orange)' }}
                  onClick={() => onPatch(day, { sport_type: s, ...(s ? {} : { sport_time: null }) })}
                >
                  {s ? SPORT_LABELS[s] : 'geen'}
                </button>
              ))}
            </div>
          </div>
          {day.sport_type && (
            <div className="field">
              <label>Hoe laat train je (ongeveer)?</label>
              <div className="row">
                <input
                  type="time"
                  value={(day.sport_time ?? '').slice(0, 5)}
                  onChange={(e) => onPatch(day, { sport_time: e.target.value || null })}
                  aria-label="Traintijd op deze dag"
                />
                <input
                  type="time"
                  value={(day.sport_end_time ?? '').slice(0, 5)}
                  onChange={(e) => onPatch(day, { sport_end_time: e.target.value || null })}
                  aria-label="Tot hoe laat train je op deze dag"
                />
              </div>
              <p className="faint" style={{ margin: 0 }}>
                Van–tot. De eindtijd stuurt de maaltijdtiming in het Eten-tabblad: je lunch na een
                nuchtere training, je pre-workout ervoor.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SportAdviceBlock({ days, exclude }: { days: ScheduleDay[]; exclude?: number }) {
  const { profile } = useAppData()
  const sportDays = days.filter((d) => d.sport_type && d.weekday !== exclude)
  const swaps = swapAdvice(days, profile)
  if (sportDays.length === 0 && swaps.length === 0) return null
  return (
    <div className="stack">
      <h2>Sport en vasten</h2>
      {sportDays.map((d) => (
        <div className="card stack" key={d.weekday} style={{ gap: 8 }}>
          <strong className="small" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {WEEKDAY_LABELS[d.weekday]} · {SPORT_LABELS[d.sport_type!]}
            {d.sport_time ? ` om ${d.sport_time.slice(0, 5)}` : ''}
          </strong>
          {sportAdvice(d.sport_type!, d, profile).map((a, i) => (
            <div className={`advice ${a.level}`} key={i}>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      ))}
      {swaps.map((a, i) => (
        <div className={`advice ${a.level}`} key={`swap-${i}`}>
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  )
}
