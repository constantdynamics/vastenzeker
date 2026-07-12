# Vast en Zeker

Nederlandstalige PWA die helpt om intermittent fasting vol te houden. Eén blik op het scherm en je weet of je nu mag eten (groen) of nog vast (rood) — en bij elke opening van de app krijg je iets nieuws en nuttigs te lezen uit een voorraad van 250+ tips.

Gebouwd voor de drukke vader in een jong gezin: nuchter, praktisch, geen wellness-gezwets, geen pushnotificaties.

## Functionaliteit

- **Statusindicator** — groot en direct leesbaar: groen (eetvenster open) of rood (je vast), met timer en voortgangsring. Status wordt altijd ondersteund met tekst en icoon, niet alleen kleur.
- **Vensterinstelling met idealadvies** — presets (14:10, 16:8, 18:6, 20:4, OMAD) plus vrij instelbaar. De app adviseert (vroeg venster gunstiger, laat eten drukt de slaap), verbiedt niet — behalve expliciete waarschuwingen bij extreme instellingen.
- **250+ tips** met contextafhankelijke rotatie: de tip past bij de fase van je vast, sportdagen en zware momenten. Geen herhaling tot de voorraad op is.
- **Hartjes** — favoriete tips bewaren, filteren op categorie, en weer verwijderen.
- **"Ik heb het zwaar"-knop** — swipe-flow met kaarten: wat er nú in je lijf gebeurt, altijd de resterende tijd in beeld, en per kaart één directe actie. Stoppen kan altijd, zonder schuldgevoel.
- **Sportdagen** — per weekdag type sport instellen; de app adviseert nuchter of gevoed trainen en waarschuwt bij onverstandige combinaties, altijd met onderbouwing.
- **Schema met intake** — korte intake (ervaring, doel, gezin, sport, werkritme) leidt tot een voorstel; per dag aanpasbaar; waarschuwingen bij te ambitieuze schema's.
- **Bijhouden** — gewicht met grafiek, gevoel (energie/honger/focus in drie tikken), streaks met verstandige framing.
- **Export** — al je data als JSON en CSV.
- **Veiligheid** — medische disclaimer en uitvraag bij onboarding, doorverwijzing naar arts bij aandoeningen, rustige signalering bij patronen die op een ongezonde relatie met eten wijzen.

## Techniek

- **Frontend:** Vite + React + TypeScript, installeerbare PWA (service worker via `vite-plugin-pwa`, offline-first voor schil en tips).
- **Backend:** Supabase (project `eten-avontuur`), alle tabellen met `if_`-prefix, Row Level Security per gebruiker op elke tabel.
- **Auth:** Supabase Auth met e-mail en wachtwoord.
- **Hosting:** GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).

### Databaseschema

| Tabel | Inhoud |
|---|---|
| `if_profiles` | profiel + intake + standaardvenster |
| `if_schedule` | weekschema per weekdag (vasten ja/nee, venster, sporttype) |
| `if_fasts` | dag-log: status, gevoel, zwaar-momenten |
| `if_measurements` | gewichtsmetingen |
| `if_tips` | 250+ tips met categorie, fases, sportdag-flag en zwaar-flag |
| `if_tip_reads` | rotatiestatus per gebruiker per context |
| `if_tip_favorites` | hartjes |

Migraties staan in `supabase/migrations/`, de tips-seed in `supabase/seed/`.

## Lokaal draaien

```bash
npm install
npm run dev
```

## Deployen

Elke push naar `main` bouwt en deployt automatisch naar GitHub Pages. Vereist eenmalig: in de repo-instellingen onder **Settings → Pages** de source op **GitHub Actions** zetten (de workflow probeert dit zelf te activeren via `configure-pages`).

## Bewuste keuzes

- Geen pushnotificaties: de app zeurt niet, alles staat klaar als je hem opent.
- Geen calorieën tellen, geen maaltijden loggen, geen social feed, geen paywall.
- De app moedigt nooit aan om door te gaan als iemand zich onwel voelt.
