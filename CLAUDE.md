# runthink-website

Marketing site for the RunThink app (app repo: `~/Desktop/RunThink`). Plain static HTML, no build step. One serverless function: `api/weather.js` (NWS + Open-Meteo, no keys).

- Each page is a folder with an `index.html` (`about/`, `privacy/`, `terms/`, `support/`, `beta/`, `weather/`, `ig/`, `android/`).
- `consent.js` gates Google Analytics behind the cookie banner. New pages must include it rather than loading GA directly.
- Keep `sitemap.xml` and `llms.txt` in sync when adding or removing a page.
- Preview: `python3 -m http.server 4173`.
- Copy follows the app's rules: first person "I", no em dashes.
