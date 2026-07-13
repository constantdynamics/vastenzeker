// Drie live dagmeters: eiwit, calorieën en notenbudget. Waarde = som van de
// gegeten slots; het geplande dagtotaal staat er gedempt naast. Alles komt
// berekend binnen (plan-macro's) — hier wordt niets zelf opgeteld per maaltijd.

import type { MacroTotals, NutritionProfile } from '../../lib/nutrition/types'

function Meter({
  label,
  valueText,
  plannedText,
  fraction,
  color,
  over = false,
}: {
  label: string
  valueText: string
  plannedText: string
  fraction: number
  color: string
  over?: boolean
}) {
  const pct = Math.max(0, Math.min(100, fraction * 100))
  return (
    <div className={`meter ${over ? 'over' : ''}`}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">
          {valueText} <span className="faint meter-planned">{plannedText}</span>
        </span>
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="meter-fill"
          style={{ width: `${pct}%`, ['--meter-color' as string]: color }}
        />
      </div>
    </div>
  )
}

export default function Meters({
  eaten,
  planned,
  profile,
  nutBudgetG,
}: {
  eaten: MacroTotals
  planned: MacroTotals
  profile: NutritionProfile
  nutBudgetG: number
}) {
  const showPb = planned.peanutButterG > 0.5 || eaten.peanutButterG > 0.5
  return (
    <section className="card meters" aria-label="Dagtotalen">
      <Meter
        label="Eiwit"
        valueText={`${Math.round(eaten.proteinG)} / ${profile.proteinTargetG} g`}
        plannedText={`gepland ${Math.round(planned.proteinG)} g`}
        fraction={profile.proteinTargetG > 0 ? eaten.proteinG / profile.proteinTargetG : 0}
        color="var(--neon-cyan)"
      />
      <Meter
        label="Calorieën"
        valueText={`${Math.round(eaten.kcal)} / ${profile.kcalMin}–${profile.kcalMax}`}
        plannedText={`gepland ${Math.round(planned.kcal)}`}
        fraction={profile.kcalMax > 0 ? eaten.kcal / profile.kcalMax : 0}
        color="var(--neon-lime)"
      />
      <div>
        <Meter
          label="Notenbudget"
          valueText={`${Math.round(eaten.nutG)} / ${nutBudgetG} g`}
          plannedText={`gepland ${Math.round(planned.nutG)} g`}
          fraction={nutBudgetG > 0 ? eaten.nutG / nutBudgetG : 0}
          over={eaten.nutG > nutBudgetG + 0.001}
          color="var(--neon-orange)"
        />
        {showPb && (
          <p className="faint meter-sub">
            pindakaas {Math.round(eaten.peanutButterG)}/15 g · gepland{' '}
            {Math.round(planned.peanutButterG)} g
          </p>
        )}
      </div>
    </section>
  )
}
