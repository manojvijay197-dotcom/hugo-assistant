# How to run Hugo Assistant

## 1. Open the project folder

```bash
cd "/Users/manoj-24261/Documents/npm hugo assistant package"
```

## 2. Install dependencies (first time only)

```bash
npm install
```

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

## Stop the tool

In the terminal where it is running, press:

```text
Ctrl + C
```
