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

1. Click **Select folder**
2. Confirm in the popup
3. Choose the project root that contains `website/` (and `website/trago.js`)
4. Check the detected Hugo version
5. Select a **target version**
6. Click **Run checks**
7. Review **Website Result** and **Vendor Result**
8. Download **PDF**, **Sheet**, **JSON**, or save `.hugo-assistant` reports

### Quick test with mock project

When asked for a folder, select:

```text
mock-hugo-project
```

(inside this cloned repo)

## Stop the tool

In the terminal where it is running, press:

```text
Ctrl + C
```
