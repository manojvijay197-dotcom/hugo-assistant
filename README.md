# Hugo Assistant

Browser-only Hugo migration checker. Clone and run on any device.

Choose one mode per upload:

- **Regular Repo** — project with `website/trago.js` (current version detected)
- **Hugo modules (vendor)** — module/theme folder without `trago.js` (you pick target version)

Each upload is scanned separately (not in parallel). Regular mode does **not** walk `_vendor/` or `themes/`.

Scans for:

- **Hugo code deprecations** (with fix + official docs link)
- **Hugo structure changes** (e.g. `layouts/partials` → `layouts/_partials`)

No CLI. No image / SEO / accessibility / performance / link audits.

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

## Notes

- Analysis runs **entirely in the browser** on the folder you select (`"private": true` — not published as an npm package).
- Prefer **Chrome/Edge** so folder access uses the File System Access API (avoids Chrome’s “Upload N files to this site?” dialog from the old file-input method).
- Node.js **18+** required.
