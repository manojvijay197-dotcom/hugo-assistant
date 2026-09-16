# How to run Hugo Assistant

Works on any device after cloning from GitHub.

## 1. Clone the repository

```bash
git clone https://github.com/manojvijay197-dotcom/hugo-assistant.git
cd hugo-assistant
```

If you already have the folder:

```bash
cd hugo-assistant
```

## 2. Install dependencies (first time only)

```bash
npm install
```

Requires **Node.js 18+**.

## 3. Start the tool

```bash
npm run dev
```

## 4. Open the UI

Go to the URL shown in the terminal (usually):

**http://localhost:5173/**

## 5. Use the tool

1. Choose **Regular Repo** or **Hugo modules (vendor)** (required before folder select)
2. Click **Select folder**
3. Confirm in the popup
4. Upload the matching folder type:
   - **Regular Repo** → root that contains `website/` + `website/trago.js`
   - **Hugo modules** → module/theme folder **without** `trago.js` (layouts, content, config, assets, data, i18n)
5. For Regular Repo: check detected Hugo version, then pick a **target version**
6. For Hugo modules: pick the **target Hugo version** only (no trago.js)
7. Click **Run checks**
8. Review structure vs other changes
9. Download **PDF**, **Sheet**, **JSON**, or save `.hugo-assistant` reports

Mismatch uploads are rejected (e.g. modules mode + folder with `trago.js`).

### Quick test with mock project

**Regular Repo:** select `mock-hugo-project`

**Hugo modules:** select `mock-hugo-project/website/themes/demo-theme`

## Stop the tool

In the terminal where it is running, press:

```text
Ctrl + C
```
