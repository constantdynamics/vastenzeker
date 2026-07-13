// Het uitgeklapte i'tje: drie lagen, letterlijk uit copy.ts.
// [1] slot en [2] maaltijd normaal, [3] doel gedempt.

import { composeRationale } from '../../lib/nutrition/copy'
import type { DayType, MealSlot } from '../../lib/nutrition/types'

export default function RationaleBlock({
  slot,
  dayType,
  badNight,
  mealRationale,
}: {
  slot: MealSlot
  dayType: DayType
  badNight: boolean
  mealRationale: string
}) {
  const r = composeRationale(slot, dayType, badNight, mealRationale)
  return (
    <div className="rationale">
      <p>{r.slot}</p>
      <p>{r.meal}</p>
      <p className="faint">{r.goal}</p>
    </div>
  )
}
