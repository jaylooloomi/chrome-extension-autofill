# Autofy

**AI semantic autofill for Chrome.** A floating button reads any form's fields,
understands what each one is asking with an LLM, and fills it from your profile —
accurately, into framework-controlled inputs, and **never touching your data**.

- **BYOK** (bring your own key): your profile and API key live only in
  `chrome.storage.local`. There is no Autofy server. Calls go straight to *your*
  chosen provider (Gemini / OpenAI / Anthropic / **Ollama**).
- **Never auto-submits**: it fills, highlights, and lets you review/edit. You
  press submit.
- **Learns each site**: the second visit to the same form fills from a local
  cache — zero AI calls.

Beachhead: long, repetitive **job-application (ATS)** forms — Workday,
Greenhouse, Lever. See [plan.md](plan.md) and the
[design spec](docs/superpowers/specs/2026-06-23-autofy-design.md).

## Develop

```bash
npm install
npm run build      # → dist/  (esbuild)
npm run dev        # watch mode
npm run typecheck  # tsc --noEmit
npm test           # vitest (36 tests)
```

## Load in Chrome

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Click the Autofy icon → **Open settings**:
   - Pick a provider, paste your API key (Gemini Flash has a free tier:
     <https://aistudio.google.com/app/apikey>), and save.
   - Fill in your profile (or paste a résumé and let it draft one), then save.
5. Visit any form page → click the floating **Fill** button → review → submit.

## Using Ollama (local or cloud models, e.g. MiniMax 2.5)

Autofy can talk to a local [Ollama](https://ollama.com) daemon, which can also
broker cloud models such as `minimax-m2.5:cloud`.

1. In settings, choose **Ollama (local / cloud)**.
2. Ollama URL defaults to `http://localhost:11434/v1`; the API key can be blank.
3. Model: `minimax-m2.5:cloud` (or any local tag like `llama3.1`). For cloud
   models run `ollama signin` once.
4. **Let the extension reach Ollama** — Ollama blocks unknown origins by default.
   Allow the extension and restart Ollama:
   - Windows (PowerShell): `setx OLLAMA_ORIGINS "*"` then restart Ollama.
   - macOS/Linux: `OLLAMA_ORIGINS=* ollama serve`.

Without that last step the request fails with a CORS error.

## What's verified

`npm test` covers the core logic with unit tests (jsdom + mocked provider/storage):

| Module | Covered |
|---|---|
| `detector` | label resolution, schema extraction, radio grouping, stable signatures |
| `fill-engine` | native-setter fill + events, `<select>`/radio/checkbox/contenteditable, skip/error reporting |
| `mapping` | prompt build, JSON validation/coercion, retry-once, no-retry on auth |
| `cache` | reverse-lookup, learn + replay, profile-aware resolution |
| `llm/provider` | JSON extraction, status→code mapping, adapter selection, fetch errors |
| `profile-schema` | dotted-path get/set, immutability, path listing |

**Needs your machine + key (manual E2E):** loading in Chrome and running against
a live ATS form with a real API key. The above gives high confidence in the
logic; this last mile exercises real network + real DOM.

## Behavior notes

- **Captcha / verification codes are never auto-filled.** Fields whose
  label/name/placeholder look like a captcha (`驗證碼`, "verification code", …)
  are detected, excluded from the AI request, and shown as **manual ✋** in the
  review panel for you to type. Their value lives in an image, so any filled
  value would be wrong.
- **Fake-data mode**: with an empty profile, the form is filled with consistent
  sample data (flagged "SAMPLE DATA"); captcha fields are still left blank.
- **Button placement**: the Fill button anchors to each `<form>` on the page
  (floats bottom-right when there is no form). This is pure DOM — no AI cost.
- **Fill language**: choose a target language in settings, or leave it on
  Auto-detect (uses the page's language) — affects generated/sample text.
- **Profile import**: paste résumé text *or* import a `.txt` file; AI drafts a
  profile you review before saving.
- **Interface language**: the options/popup UI is translated (English, 繁體中文,
  简体中文, 日本語), selectable in settings or following the browser.

## Known limits (spec §11)

Cross-origin iframes (payment pages), anti-bot sites, and canvas-rendered inputs
can't be filled. Shadow DOM / custom div widgets are best-effort and flagged on
failure rather than silently skipped.

## Project layout

```
src/
  background/  service worker: message router, mapping, cache, resume, llm/*
  content/     detector, refs, fill-engine, review-ui, bootstrap
  options/     profile + API key + résumé-paste settings page
  popup/       status + shortcut
  shared/      types, messages, storage, profile-schema (single source of truth)
tests/         vitest specs for the core logic
```
