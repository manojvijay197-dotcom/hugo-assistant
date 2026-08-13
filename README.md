# Hugo Assistant

Browser-only Hugo upgrade checker. Clone and run on any device.

Scans for:

- **Hugo deprecations** (reported as errors, with fix + official docs link)
- **Broken images** (checks against `static/` and `assets/`)

No CLI. No SEO / accessibility / performance / link audits.

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
    ├── static/
    └── _vendor/          ← optional Hugo modules
        └── …/layouts|assets|static|data|i18n
```

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
