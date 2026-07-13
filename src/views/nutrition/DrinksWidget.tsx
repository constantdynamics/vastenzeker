// Kaart "Dranken": contextueel de juiste lijst vooraan (binnen/buiten het
// eetvenster van vandaag), de andere lijst ingeklapt eronder. Op een andere
// dag dan vandaag staan beide lijsten gewoon open met kopjes.

import { useState } from 'react'
import { FASTING_DRINKS, WINDOW_DRINKS, type Drink } from '../../lib/nutrition/copy'

const FASTING_HEAD = 'Tijdens het vasten — 0 kcal, breekt je vasten niet'
const WINDOW_HEAD = 'Binnen je eetvenster'

function DrinkList({ drinks }: { drinks: Drink[] }) {
  const [openInfo, setOpenInfo] = useState<string | null>(null)
  return (
    <ul className="drink-list">
      {drinks.map((d) => (
        <li key={d.name}>
          <div className="drink-row">
            <span className="drink-name">{d.name}</span>
            {d.detail && <span className="faint">{d.detail}</span>}
            {d.rationale && (
              <button
                className="info-btn"
                aria-label={`Uitleg over ${d.name}`}
                aria-expanded={openInfo === d.name}
                onClick={() => setOpenInfo(openInfo === d.name ? null : d.name)}
              >
                i
              </button>
            )}
          </div>
          {d.rationale && openInfo === d.name && <div className="rationale"><p>{d.rationale}</p></div>}
        </li>
      ))}
    </ul>
  )
}

export default function DrinksWidget({
  isToday,
  inWindow,
}: {
  isToday: boolean
  inWindow: boolean
}) {
  const [showOther, setShowOther] = useState(false)

  if (!isToday) {
    return (
      <section className="card stack" aria-label="Dranken">
        <h3>Dranken</h3>
        <p className="drink-head">{WINDOW_HEAD}</p>
        <DrinkList drinks={WINDOW_DRINKS} />
        <p className="drink-head">{FASTING_HEAD}</p>
        <DrinkList drinks={FASTING_DRINKS} />
      </section>
    )
  }

  const primary = inWindow ? WINDOW_DRINKS : FASTING_DRINKS
  const other = inWindow ? FASTING_DRINKS : WINDOW_DRINKS
  const toggleLabel = inWindow
    ? 'Ook zien wat je tijdens het vasten kunt drinken?'
    : 'Ook zien wat je binnen je eetvenster kunt drinken?'

  return (
    <section className="card stack" aria-label="Dranken">
      <h3>Dranken</h3>
      <p className="drink-head">{inWindow ? WINDOW_HEAD : FASTING_HEAD}</p>
      <DrinkList drinks={primary} />
      <button
        className="link-btn drink-toggle"
        aria-expanded={showOther}
        onClick={() => setShowOther((v) => !v)}
      >
        {toggleLabel}
      </button>
      {showOther && (
        <>
          <p className="drink-head">{inWindow ? FASTING_HEAD : WINDOW_HEAD}</p>
          <DrinkList drinks={other} />
        </>
      )}
    </section>
  )
}
