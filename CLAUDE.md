# CLAUDE.md

Context for this repository lives in **[AGENTS.md](AGENTS.md)** — read that first, then
load only the reference page you need from [`docs/agents/`](docs/agents/).

Fast path, so you do not have to open anything else for a small task:

- Express + SQLite + vanilla JS appliance on Distiller hardware. Drives an RGB LED and a
  250×128 1-bit e-ink panel from a merged agenda of local tasks and read-only iCal feeds.
- Server: `backend/server.js` on port **5000**, started with `bash start.sh`.
  **Backend edits need a manual restart**; frontend edits do not (no build step).
- `backend/agenda.js` decides what is active — never duplicate that logic elsewhere.
- Every user-facing string exists twice: `locales/{es,en}.json` and the inline catalogs in
  `frontend/i18n.js`.
- This directory is **not a git repository** — there is no undo. Make surgical edits.
- Do not stop or kill anything on ports 3000, 3005, 8080 or 48081 (Distiller platform
  services, including the one hosting your session).
- All code, comments and documentation are written in **English**.
