# Hugo Assistant

Hugo migration checker. Installed from the internal registry and run on the current project (Trago gulp task or `hugo-assistant`). It does not ask for a folder.

- **Regular repo** — `trago.js` or `website/trago.js` is in the project. Current Hugo version is read from that file. You pick the target version.
- **Hugo module** — no `trago.js`. You pick the target version only.

Browser upload (choose a mode, then a folder) is still available with `npm run dev` for local use.

Choose one mode per upload:

- **Regular Repo** — project with `website/trago.js` (current version detected)
- **Hugo modules (vendor)** — module/theme folder without `trago.js` (you pick target version)

Each upload is scanned separately (not in parallel). Regular mode does **not** walk `_vendor/` or `themes/`.

Scans for:

- **Hugo code deprecations** (with fix + official docs link)
- **Hugo structure changes** (e.g. `layouts/partials` → `layouts/_partials`)

No image / SEO / accessibility / performance / link audits.

**Repo:** https://github.com/manojvijay197-dotcom/hugo-assistant

---

## How to run (any device)

See **[STEPS.md](./STEPS.md)** for the full guide.

```bash
git clone https://github.com/manojvijay197-dotcom/hugo-assistant.git
cd hugo-assistant
npm install
npm run dev
```

Open **http://localhost:5173/** (or the port Vite prints) and follow the UI.

---

## Project layout expected

### Regular Repo

```text
your-repo/
└── website/
    ├── trago.js          ← Hugo version lives here
    ├── config.yaml       ← or hugo.toml / config.toml, etc.
    ├── content/
    ├── layouts/
    ├── data/
    ├── i18n/
    ├── assets/
    └── static/
```

### Hugo modules (vendor)

```text
my-module/
├── layouts/
├── content/              ← optional
├── config.yaml           ← or hugo.toml, optional
├── assets/
├── data/
└── i18n/
```

No `trago.js` in module uploads.

### `trago.js` example

```js
module.exports = {
  hugoVersion: '0.120.0'
};
```

Also accepts `hugo_version`, `HUGO_VERSION`, and similar patterns.

---

## What gets scanned

| Scope | Paths |
|-------|--------|
| **Website** | `content/`, `layouts/`, `data/`, `i18n/`, config files, `assets/`, `static/` |
| **Vendor** | `_vendor/<module>/` → `layouts/`, `assets/`, `static/`, `data/`, `i18n/` |

---

## Reports

Only these artifacts (no `report.txt`, no CLI output files):

- `report.html`
- `report.json`

Use **Save .hugo-assistant reports** in the UI, or download PDF / Sheet / JSON from the results panel.

---

## Run inside a project (Trago)

The command scans the project it is started in. Copy `examples/trago-task.js` to `trago/tasks/hugoAssistant.js`, depend on this package, then run:

```bash
trago hugoAssistant
```

Or from the project directory, without a gulp task:

```bash
hugo-assistant
hugo-assistant --target 0.146.0
```

Reports are written to `.hugo-assistant/report.html`, `report.json`, and `report.csv`.

## Notes

- The published package runs in Node on the current project. The browser UI remains for local folder uploads.
- Prefer **Chrome/Edge** for the browser UI so folder access uses the File System Access API.
- Node.js **18+** required.
