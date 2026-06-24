<div align="center">

# Autofy

### AI semantic autofill, one click away.

**Click `AutoFill` · any form gets understood and filled from your profile — accurate, BYOK, your data never leaves your machine.**

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](#install)
[![Built with TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](#development)
[![BYOK](https://img.shields.io/badge/BYOK-Ollama%20%C2%B7%20Gemini%20%C2%B7%20OpenAI%20%C2%B7%20Claude-4f46e5?style=flat-square)](#byok--providers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](#license)

🌐 &nbsp; **English** &nbsp;·&nbsp; [繁體中文](README.zh-TW.md)

</div>

---

> Autofy is a Chrome extension that **understands any web form with an LLM and fills it from your profile in one click**. A button appears next to the form's submit button; press it and Autofy reads each field's *meaning* — not just its `name` attribute — maps it to your data, fills it (even React/Vue-controlled inputs), and shows you everything **before you submit**. Bring your own key: free local **Ollama** models, or **Gemini / OpenAI / Claude**. There is no Autofy server — your profile and key never leave your machine.

---

## The problem

Filling the same personal data into form after form is miserable, and today's autofill tools don't really solve it:

- **They match fields by rigid rules.** Classic autofill (built-in or extensions) keys off fixed `name`/`id` patterns and regex. The moment a field is non-standard — a custom label, Chinese text, "Barcode / PIN", a wrapped `<div>` label — it **misses or mis-fills**, and you end up with a half-empty form.
- **Greedy paywalls.** Popular fillers cap you at *N* free fills, then nag for money.
- **Privacy distrust.** "Where does my personal data go?" Most autofill tools are black boxes.
- **Job applications are the worst.** Workday / Greenhouse / Lever forms are long, repetitive, and ask for the same dozens of fields over and over.

The people who fill the most forms get the least reliable help.

## The solution

**Autofy treats each field as a natural-language question and answers it with an LLM.**

```
Click AutoFill  →  reads every field's meaning + your profile  →  LLM maps field → value
                                   ↓
        fills the form (controlled inputs included) → you review → you submit
```

No rigid selectors. No fees (you use your own key — free Ollama works great). No black box (open-source core, data stays local). It understands the field "企業名稱" or "Are you authorized to work?" the same way a person would — then fills it, flags anything it couldn't, and **never submits on your behalf**.

---

## Key features

- 🧠 **Semantic field understanding.** An LLM reads each field's label, placeholder, nearby text, and options — so it fills non-standard, multilingual, and custom-`div` forms that regex-based fillers miss.
- 🔘 **The button finds your form.** Autofy detects the form's submit button (`送出` / `Submit` / `立即預約` / `Apply` …) and places **`AutoFill`** right next to it — in-flow, scrolling with the page. No submit button? It floats and you can drag it.
- 🔑 **BYOK — your data never leaves your machine.** Use **free local Ollama** models (incl. cloud models like `minimax-m2.5:cloud`), or **Gemini / OpenAI / Anthropic Claude**. The key + profile live only in `chrome.storage.local`; calls go straight to *your* provider. No developer server, zero telemetry.
- 🛡️ **A fill engine that doesn't lie.** Uses native setters + framework events so **React/Vue-controlled inputs actually accept the value**; handles `<select>` / radio / checkbox / contenteditable; anything it can't fill is **flagged, never silently skipped**.
- 👀 **Review before submit.** Fills are highlighted on the page and listed in a side panel — every value editable, every captcha flagged **manual ✋**. Autofy **never auto-submits**.
- 🎭 **Sample-data modes.** No profile yet? Get a complete, consistent fake profile in one click. Profile missing a field? Autofy fills the gap with **profile-consistent** sample data (toggleable). Captchas are always left for you.
- ⚡ **Learns each site.** The second visit to the same form fills **instantly with zero AI calls** from a local cache.
- 📄 **Three ways to build your profile.** Paste a résumé, import a `.txt` file, or **generate a full sample profile with AI** — all editable before saving.
- 🌐 **Localized UI + fill language.** Interface in English / 繁體中文 / 简体中文 / 日本語; choose the language Autofy fills in (or auto-detect from the page).
- 🚫 **Per-site off switch.** One click in the popup disables Autofy on the current site — applied live, no reload.

---

## Why Autofy

|  | Built-in / classic autofill | "Free" filler extensions | **Autofy** |
|---|---|---|---|
| **How it matches fields** | Fixed `name`/regex | Fixed profile + rules | **LLM reads the field's meaning** |
| **Non-standard / multilingual fields** | ❌ misses them | ⚠️ partial | ✅ **understood** |
| **Controlled inputs (React/Vue)** | ⚠️ often reverts | ⚠️ patchy | ✅ **native setter + events** |
| **Cost** | Free | Free up to *N*, then paid | **Free** (BYOK; Ollama free tier) |
| **Privacy** | Browser/vendor | Often a black box | ✅ **No server, key + data stay local** |
| **Submits for you?** | n/a | Sometimes | ❌ **Never — you review & submit** |
| **Captcha / verification** | Tries & fails | Tries & fails | ✅ **Skipped, flagged manual** |

**The wedge:** Autofy is the only one that *understands* the form instead of pattern-matching it — so it fills the long, weird, real-world forms the others give up on, without ever sending your data to anyone but the model you chose.

---

## How it works

```
┌─ Content script (injected into the page) ───────────────────────┐
│  detector    scan fields → semantic FieldSchema[] (no raw HTML)  │
│  fill-engine native setter + framework events; per-type fill     │
│  review-ui   AutoFill button (beside submit) + pre-submit panel  │
└──────────▲ schema / corrections ──────────────┬ { ref → value } ─┘
           │                                     ▼
┌─ Service worker (background) ────────────────────────────────────┐
│  mapping     build prompt (schema + profile) → call LLM → JSON   │
│  llm/*       provider adapters: ollama / gemini / openai / claude│
│  cache       per-site mapping cache + learning from corrections  │
└──────────▲───────────────────────────────────────────────────────┘
           │
┌─ chrome.storage.local ───────────────────────────────────────────┐
│  profile · apiConfig (key+model) · siteCache · prefs             │
└──────────────────────────────────────────────────────────────────┘
```

The content script reduces each field to a compact semantic schema (label → aria → placeholder → name → nearby text), never sending raw HTML. The service worker builds a JSON-only prompt from the schema + your profile, calls **your** provider, validates the `{ ref → value }` response, and the fill engine writes the values back. Same form next time → served from the local cache, no AI call.

---

## BYOK & providers

| Provider | Notes |
|---|---|
| **Ollama** (default) | Local daemon (`http://localhost:11434/v1`), **no key needed**. Supports cloud models like `minimax-m2.5:cloud`, `qwen3-coder-next:cloud`. Set `OLLAMA_ORIGINS=*` so the extension can reach it. |
| **Google Gemini** | Has a free tier — lowest-friction cloud option. |
| **OpenAI** | Any OpenAI-compatible endpoint. |
| **Anthropic Claude** | e.g. `claude-haiku-4-5` (cheap/fast), `claude-opus-4-8`. |

A **Test connection** button in settings verifies reachability and auto-loads your available models into a picker.

---

## Install

> Not on the Chrome Web Store yet — load it unpacked.

```bash
git clone https://github.com/jaylooloomi/chrome-extension-autofill
cd chrome-extension-autofill
npm install
npm run build        # → dist/
```

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `dist/` folder.
3. Click the Autofy icon → **Open settings** → pick a provider (Ollama is preselected), set your profile.

---

## Usage

1. Click the Autofy icon → **Open settings**.
   - **Provider:** Ollama is preselected (no key). For cloud, paste your key and hit **Test connection** to load models.
   - **Profile:** fill it in, paste a résumé, import a `.txt`, or **Generate full profile with AI**.
2. Go to any form page. The **`AutoFill`** button appears next to the form's submit button.
3. Click it → Autofy fills the form and opens the **review panel**.
4. Check / edit the values, then **submit the form yourself**.

| Action | Where |
|---|---|
| Fill the current form | `AutoFill` button (beside submit, or floating) |
| Review & edit before submit | Side panel after filling |
| Disable on this site | Popup → "Disable on this site" (live) |
| Settings / profile | Popup → "Open settings" |

---

## Settings

Popup → **Open settings**.

| Option | Description |
|---|---|
| Interface language | English / 繁體中文 / 简体中文 / 日本語 (or follow the browser) |
| Provider · Model · Key | BYOK; **Test connection** loads your models |
| Fill language | Language Autofy fills in; Auto-detect uses the page language |
| Fill empty fields with AI sample data | Complete gaps the profile doesn't cover (default on) |
| Profile | Edit fields; or draft from résumé text / file / full AI generation |
| Backup | Export / import everything as JSON (survives reinstall) |

---

## Privacy & security

- **No Autofy server, zero telemetry.** Your profile, key, and learned sites live only in `chrome.storage.local`.
- **The key is only ever sent to the provider you chose.** Nothing else.
- **Never auto-submits.** Autofy fills and shows you a review panel; you press submit.
- **Captchas / verification codes are never filled** — they're detected and flagged *manual* for you to type.
- **Sample data is flagged** in the review panel and **not cached** as if it were your real data.

---

## Engineering highlights

- **MV3, TypeScript, dependency-free build.** `esbuild` bundles the content script (IIFE), service worker (ESM module), and pages; `vitest` covers the logic.
- **Framework-aware fill engine.** Walks the prototype chain for the real `value` setter and dispatches `input`/`change`, so React/Vue controlled components accept the value instead of reverting it.
- **Provider adapter layer.** One `LLMProvider` interface; Ollama / OpenAI / Gemini / Anthropic behind it, each forcing JSON output.
- **Stable cache signatures.** Per-field signatures (normalized name/id/label) + a form signature drive zero-AI replays and "learn from corrections".
- **Style-isolated UI.** Buttons and panel render in a Shadow DOM so host-page CSS can't break them.
- **Dependency-free PNG icons.** A pure-Node rasterizer (`scripts/make-icons.mjs`) renders the icon with 4× supersampling and a hand-written PNG encoder.
- **Tested.** 50+ vitest unit/integration tests (detector, fill engine, mapping, cache, providers, i18n).

---

## Roadmap

- [ ] Chrome Web Store listing
- [ ] Multiple profiles
- [ ] Better Shadow-DOM / custom-widget coverage
- [ ] Optional per-site field-mapping editor

## Known limitations

- **Cross-origin iframes** (payment/checkout) can't be accessed by the browser — Autofy can't fill them.
- **Anti-bot sites** may block programmatic filling.
- **Canvas / image-rendered inputs** have no DOM to fill.
- **Shadow DOM / custom `<div>` widgets** are best-effort and flagged on failure, not guaranteed.
- **"Thinking" cloud models are slow** (e.g. `minimax-m2.5:cloud` ~20s). Switch to a non-thinking model (e.g. `qwen3-coder-next:cloud`) for speed.
- Settings persist across reloads/updates, but a full **uninstall** clears them — use **Backup → Export** first.

---

## Development

```
src/
├── background/   service worker: message router, mapping, cache, resume, llm/*
├── content/      detector, refs, fill-engine, review-ui, bootstrap
├── options/      profile + API key + résumé/generate page
├── popup/        status, per-site toggle, settings shortcut
└── shared/       types, messages, storage, profile-schema, i18n
tests/            vitest specs   ·   scripts/make-icons.mjs   ·   test/manual/ (local test form)
```

```bash
npm install        # install dev deps
npm run dev        # esbuild watch → dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # production build → dist/
npm run icons      # regenerate PNG icons
```

A local test form is included: `node test/manual/serve.mjs` → http://localhost:8765/job-form.html

## System requirements

- Google Chrome (or Chromium) with Manifest V3
- Node.js 18+ to build
- A provider: local Ollama (free) **or** a Gemini / OpenAI / Anthropic key

---

## Disclaimer

Autofy is an independent, open-source project and is **not affiliated with, endorsed by, or sponsored by** Google, OpenAI, Anthropic, or Ollama. "Chrome" is a trademark of Google; "Claude" of Anthropic; other names belong to their respective owners. Autofy calls those services under **your own** key/account. Use autofill responsibly and review every form before submitting.

## License

MIT
