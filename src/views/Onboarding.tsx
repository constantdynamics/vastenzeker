import { useState } from 'react'
import { useAppData } from '../App'
import { proposeSchedule, type ScheduleProposal } from '../lib/advice'
import { WEEKDAY_FULL, WEEKDAY_LABELS, SPORT_LABELS } from '../lib/types'
import type { Experience, Family, Goal, SportType, WorkRhythm } from '../lib/types'

const MEDICAL_OPTIONS = [
  { key: 'diabetes', label: 'Diabetes (type 1 of 2)' },
  { key: 'heart', label: 'Hart- of vaatziekte' },
  { key: 'eating_disorder', label: 'Eetstoornis, nu of in het verleden' },
  { key: 'medication', label: 'Dagelijks medicijngebruik' },
]

export default function Onboarding() {
  const { updateProfile, saveScheduleDay } = useAppData()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  // intake-antwoorden
  const [medical, setMedical] = useState<string[]>([])
  const [medicalAck, setMedicalAck] = useState(false)
  const [experience, setExperience] = useState<Experience>('none')
  const [goal, setGoal] = useState<Goal>('weight')
  const [family, setFamily] = useState<Family>('young_kids')
  const [work, setWork] = useState<WorkRhythm>('office')
  const [sportDays, setSportDays] = useState<Partial<Record<number, SportType>>>({})
  const [sportTime, setSportTime] = useState('18:00')
  const [proposal, setProposal] = useState<ScheduleProposal | null>(null)

  const steps = 5
  const needsDoctor = medical.length > 0

  function toggleMedical(key: string) {
    setMedical((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    setMedicalAck(false)
  }

  function cycleSport(day: number) {
    const order: (SportType | undefined)[] = [undefined, 'strength', 'endurance', 'intense', 'easy']
    const current = sportDays[day]
    const next = order[(order.indexOf(current) + 1) % order.length]
    setSportDays((prev) => {
      const copy = { ...prev }
      if (next === undefined) delete copy[day]
      else copy[day] = next
      return copy
    })
  }

  async function finish() {
    if (!proposal) return
    setBusy(true)
    const now = new Date().toISOString()
    await updateProfile({
      experience,
      goal,
      family,
      work_rhythm: work,
      medical_flags: medical,
      medical_ack: medicalAck,
      disclaimer_accepted_at: now,
      onboarded_at: now,
      protocol: proposal.protocol,
      window_start: proposal.windowStart,
      window_end: proposal.windowEnd,
      buildup_weeks: proposal.buildupWeeks,
    })
    for (let d = 0; d < 7; d++) {
      await saveScheduleDay({
        user_id: '',
        weekday: d,
        fasting: proposal.fastingWeekdays.includes(d),
        window_start: null,
        window_end: null,
        sport_type: sportDays[d] ?? null,
        sport_time: sportDays[d] ? sportTime || null : null,
      })
    }
    setBusy(false)
  }

  return (
    <main className="app-main">
      <div className="onb-progress" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={i <= step ? 'done' : ''} />
        ))}
      </div>

      {step === 0 && (
        <div className="onb-step">
          <div className="logo">Zip Your Lip</div>
          <div className="card stack">
            <h2>Eerst even dit</h2>
            <p className="muted small">
              Deze app is geen medisch advies. Intermittent fasting is voor de meeste gezonde
              volwassenen veilig, maar niet voor iedereen. Twijfel je, gebruik je medicijnen of heb
              je een aandoening: overleg eerst met je huisarts.
            </p>
            <p className="muted small">
              De app verbiedt niets en beloont geen doorbijten als je je beroerd voelt. Stoppen mag
              altijd.
            </p>
          </div>
          <button className="btn btn-primary btn-wide" onClick={() => setStep(1)}>
            Begrepen, verder
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="onb-step">
          <h2>Gezondheid</h2>
          <p className="muted small">Is een van deze situaties op jou van toepassing?</p>
          <div className="stack">
            {MEDICAL_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`day-row ${medical.includes(opt.key) ? '' : 'free'}`}
                onClick={() => toggleMedical(opt.key)}
                aria-pressed={medical.includes(opt.key)}
              >
                <span className={`toggle ${medical.includes(opt.key) ? 'on' : ''}`} />
                <span style={{ textAlign: 'left' }}>{opt.label}</span>
              </button>
            ))}
          </div>
          {needsDoctor && (
            <div className="advice warning">
              <span>
                Met een van deze situaties hoort vasten alleen in overleg met een arts. Bespreek het
                eerst met je huisarts voordat je begint. De app kan die afweging niet voor je maken.
              </span>
            </div>
          )}
          {needsDoctor && (
            <button
              className={`day-row ${medicalAck ? '' : 'free'}`}
              onClick={() => setMedicalAck(!medicalAck)}
              aria-pressed={medicalAck}
            >
              <span className={`toggle ${medicalAck ? 'on' : ''}`} />
              <span style={{ textAlign: 'left' }}>
                Ik heb dit met mijn arts besproken en kan verantwoord beginnen
              </span>
            </button>
          )}
          <button
            className="btn btn-primary btn-wide"
            disabled={needsDoctor && !medicalAck}
            onClick={() => setStep(2)}
          >
            Verder
          </button>
          <p className="faint">
            Geen van deze situaties? Dan kun je gewoon door. Dit blijft privé in je eigen profiel.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="onb-step">
          <h2>Over jou</h2>
          <ChoiceField
            label="Ervaring met vasten"
            value={experience}
            onChange={(v) => setExperience(v as Experience)}
            options={[
              ['none', 'Nog nooit gedaan'],
              ['some', 'Wel eens geprobeerd'],
              ['experienced', 'Ervaren'],
            ]}
          />
          <ChoiceField
            label="Belangrijkste doel"
            value={goal}
            onChange={(v) => setGoal(v as Goal)}
            options={[
              ['weight', 'Gewicht verliezen'],
              ['energy', 'Meer energie'],
              ['health', 'Gezondheid'],
              ['habit', 'Grip op eetgewoontes'],
            ]}
          />
          <ChoiceField
            label="Thuissituatie"
            value={family}
            onChange={(v) => setFamily(v as Family)}
            options={[
              ['young_kids', 'Jonge kinderen'],
              ['older_kids', 'Oudere kinderen'],
              ['partner', 'Met partner'],
              ['single', 'Alleen'],
            ]}
          />
          <ChoiceField
            label="Werkritme"
            value={work}
            onChange={(v) => setWork(v as WorkRhythm)}
            options={[
              ['office', 'Kantoortijden'],
              ['home', 'Veel thuis'],
              ['shifts', 'Ploegen/onregelmatig'],
              ['irregular', 'Wisselt sterk'],
            ]}
          />
          <button className="btn btn-primary btn-wide" onClick={() => setStep(3)}>
            Verder
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="onb-step">
          <h2>Sportdagen</h2>
          <p className="muted small">
            Tik op een dag om het type te kiezen. De app past het advies daarop aan.
          </p>
          <div className="stack">
            {WEEKDAY_LABELS.map((label, d) => (
              <button key={d} className="day-row" onClick={() => cycleSport(d)}>
                <span className="day-label">{label}</span>
                <span style={{ flex: 1, textAlign: 'left' }} className="muted">
                  {sportDays[d] ? SPORT_LABELS[sportDays[d]!] : 'geen sport'}
                </span>
                {sportDays[d] && (
                  <span
                    className="chip on"
                    style={{ ['--chip-color' as string]: 'var(--neon-orange)' }}
                  >
                    {SPORT_LABELS[sportDays[d]!]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {Object.keys(sportDays).length > 0 && (
            <div className="field">
              <label htmlFor="sport-time">Hoe laat train je meestal?</label>
              <input
                id="sport-time"
                type="time"
                value={sportTime}
                onChange={(e) => setSportTime(e.target.value)}
              />
              <p className="faint">Per dag aanpassen kan later onder ‘Schema’.</p>
            </div>
          )}
          <button
            className="btn btn-primary btn-wide"
            onClick={() => {
              setProposal(proposeSchedule(experience, sportDays))
              setStep(4)
            }}
          >
            Stel een schema voor
          </button>
        </div>
      )}

      {step === 4 && proposal && (
        <div className="onb-step">
          <h2>Je voorstel</h2>
          <div className="card card-accent stack" style={{ ['--accent' as string]: 'var(--neon-cyan)' }}>
            <div className="spread">
              <span className="muted">Protocol</span>
              <strong>{proposal.protocol}</strong>
            </div>
            <div className="spread">
              <span className="muted">Eetvenster</span>
              <strong>
                {proposal.windowStart} – {proposal.windowEnd}
              </strong>
            </div>
            <div className="spread">
              <span className="muted">Vastendagen</span>
              <strong>
                {proposal.fastingWeekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}
              </strong>
            </div>
            {proposal.buildupWeeks > 0 && (
              <div className="spread">
                <span className="muted">Opbouw</span>
                <strong>{proposal.buildupWeeks} weken</strong>
              </div>
            )}
          </div>
          {proposal.reasoning.map((r, i) => (
            <div className="advice info" key={i}>
              <span>{r}</span>
            </div>
          ))}
          <div className="advice info">
            <span>{proposal.blockAdvice}</span>
          </div>
          <p className="faint">
            Dit is een voorstel. Onder ‘Schema’ pas je straks alles aan: dagen, tijden en
            uitzonderingen per dag ({WEEKDAY_FULL[6]} vrij houden is populair).
          </p>
          <button className="btn btn-primary btn-wide" disabled={busy} onClick={finish}>
            {busy ? 'Opslaan…' : 'Aan de slag'}
          </button>
        </div>
      )}
    </main>
  )
}

function ChoiceField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips">
        {options.map(([key, text]) => (
          <button
            key={key}
            className={`chip ${value === key ? 'on' : ''}`}
            onClick={() => onChange(key)}
            aria-pressed={value === key}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
