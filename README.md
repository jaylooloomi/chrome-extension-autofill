# Autofy

**AI semantic autofill for Chrome.** A floating button reads any form's fields,
understands what each one is asking with an LLM, and fills it from your profile —
accurately, into framework-controlled inputs, and **never touching your data**.

- **BYOK** (bring your own key): your profile and API key live only in
  `chrome.storage.local`. There is no Autofy server. Calls go straight to *your*
  chosen provider (Gemini / OpenAI / Anthropic).
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
