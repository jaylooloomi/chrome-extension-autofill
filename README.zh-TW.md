<div align="center">

# Autofy

### AI 語意自動填表,一鍵完成。

**點一下 `自動填寫` · 看懂網頁上任何表單欄位,依你的個人檔案填完 — 填得準、BYOK、資料不離開你的電腦。**

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](#安裝)
[![Built with TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](#開發)
[![BYOK](https://img.shields.io/badge/BYOK-Ollama%20%C2%B7%20Gemini%20%C2%B7%20OpenAI%20%C2%B7%20Claude-4f46e5?style=flat-square)](#byok--供應商)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](#授權)

🌐 &nbsp; [English](README.md) &nbsp;·&nbsp; **繁體中文**

</div>

---

> Autofy 是一個 Chrome 擴充,**用 LLM 看懂網頁上任何表單,並依你的個人檔案一鍵填完**。按鈕會出現在表單的送出鈕旁邊,按下去 Autofy 會讀懂每個欄位的「意思」(不只是 `name` 屬性),對應到你的資料、填回去(連 React/Vue 受控元件都填得進),並在**送出前**讓你過目。自帶金鑰:可用免費的本機 **Ollama** 模型,或 **Gemini / OpenAI / Claude**。沒有 Autofy 伺服器 — 你的個資與金鑰不離開本機。

---

## 痛點

把同一份個資一張張表單地填,很痛苦,而現有的自動填表工具其實沒解決:

- **靠死規則比對欄位。** 傳統自動填表(瀏覽器內建或擴充)依固定 `name`/`id`、正則來比對。欄位一非標準 — 自訂 label、中文、「條碼 / PIN」、包在 `<div>` 裡的標題 — 就**漏填或填錯**,你最後拿到一張半空的表單。
- **貪婪課金。** 熱門填表工具免費填 N 次後就一直要錢。
- **隱私不信任。** 「我的個資跑去哪了?」多數工具是黑箱。
- **求職表單最慘。** Workday / Greenhouse / Lever 又長又重複,同樣幾十個欄位一填再填。

填最多表單的人,得到的幫助最不可靠。

## 解法

**Autofy 把每個欄位當成一道自然語言題,用 LLM 來作答。**

```
點「自動填寫」 → 讀懂每個欄位的意思 + 你的 profile → LLM 對應 欄位 → 值
                          ↓
        填回表單(含受控元件) → 你檢視 → 你自己送出
```

沒有死選擇器、不收費(用你自己的金鑰,免費 Ollama 就很夠)、不是黑箱(核心開源、資料留本機)。它像人一樣看懂「企業名稱」或「是否具工作許可」,填好、把填不了的標出來,而且**絕不替你送出**。

---

## 主要功能

- 🧠 **語意級欄位理解。** LLM 讀欄位的 label、placeholder、鄰近文字與選項 — 連正則填表工具會漏的非標準、多語言、自訂 `<div>` 表單都能填。
- 🔘 **按鈕自己找到表單。** Autofy 偵測表單送出鈕(`送出` / `Submit` / `立即預約` / `Apply`…),把 **`自動填寫`** 放在它旁邊 — 內嵌於頁面、跟著捲動。沒有送出鈕時則浮動且可拖拉。
- 🔑 **BYOK — 資料不離開本機。** 可用**免費本機 Ollama**(含雲端模型如 `minimax-m2.5:cloud`、`qwen3-coder-next:cloud`),或 **Gemini / OpenAI / Anthropic Claude**。金鑰與 profile 只存在 `chrome.storage.local`;請求直接送到**你選的**供應商。無開發者伺服器、零 telemetry。
- 🛡️ **不會說謊的填寫引擎。** 走原生 setter + 派發框架事件,讓 **React/Vue 受控元件真的吃得進值**;處理 `<select>` / radio / checkbox / contenteditable;填不了的**會標示、絕不靜默略過**。
- 👀 **送出前檢視。** 被填的欄位在頁面上高亮、側欄逐項列出 — 每個值可改、每個驗證碼標 **manual ✋**。Autofy **永不自動送出**。
- 🎭 **假資料模式。** 還沒 profile?一鍵生成完整、一致的假 profile。Profile 缺某欄位?Autofy 用**與 profile 一致**的假資料補滿(可開關)。驗證碼永遠留給你。
- ⚡ **學會每個網站。** 第二次造訪同一張表單 → **零 AI 呼叫、本機快取秒填**。
- 📄 **三種方式建立 profile。** 貼履歷、匯入 `.txt`,或**用 AI 生成完整 profile** — 都可在儲存前修改。
- 🌐 **介面 + 填寫語言在地化。** 介面支援 English / 繁體中文 / 简体中文 / 日本語;填寫語言可指定或自動偵測頁面語言。
- 🚫 **逐站開關。** 在 popup 一鍵停用目前網站 — 即時生效,免重整。

---

## 為什麼選 Autofy

|  | 內建 / 傳統自動填表 | 「免費」填表擴充 | **Autofy** |
|---|---|---|---|
| **怎麼比對欄位** | 固定 `name`/正則 | 固定 profile + 規則 | **LLM 讀欄位的意思** |
| **非標準 / 多語言欄位** | ❌ 漏掉 | ⚠️ 部分 | ✅ **看得懂** |
| **受控元件(React/Vue)** | ⚠️ 常被打回 | ⚠️ 不穩 | ✅ **原生 setter + 事件** |
| **費用** | 免費 | 免費 N 次後收費 | **免費**(BYOK;Ollama 免費額度) |
| **隱私** | 瀏覽器/廠商 | 常是黑箱 | ✅ **無伺服器,金鑰與資料留本機** |
| **會幫你送出嗎?** | — | 有時會 | ❌ **不會 — 你檢視後自己送** |
| **驗證碼** | 嘗試但填錯 | 嘗試但填錯 | ✅ **跳過、標 manual** |

**切入點:** 只有 Autofy 是「**看懂**」表單而非「比對」表單 — 所以它能填那些別人放棄的又長又怪的真實表單,而且資料只會送到你選的模型,不送給任何其他人。

---

## 運作方式

```
┌─ Content script(注入頁面）─────────────────────────────────────┐
│  detector    掃描欄位 → 語意 FieldSchema[](不送整段 HTML)         │
│  fill-engine 原生 setter + 框架事件;逐型別填值                    │
│  review-ui   自動填寫按鈕(在送出鈕旁)+ 送出前檢視側欄            │
└──────────▲ schema / 修正 ─────────────────────┬ { ref → 值 } ────┘
           │                                     ▼
┌─ Service worker(背景）──────────────────────────────────────────┐
│  mapping     組 prompt(schema + profile)→ 呼叫 LLM → JSON       │
│  llm/*       provider adapter:ollama / gemini / openai / claude │
│  cache       站點對應快取 + 從修正學習                            │
└──────────▲───────────────────────────────────────────────────────┘
           │
┌─ chrome.storage.local ───────────────────────────────────────────┐
│  profile · apiConfig(金鑰+模型) · siteCache · prefs             │
└──────────────────────────────────────────────────────────────────┘
```

Content script 把每個欄位縮成精簡的語意 schema(label → aria → placeholder → name → 鄰近文字),不送整段 HTML。Service worker 用 schema + 你的 profile 組出「只回 JSON」的 prompt,呼叫**你的**供應商,驗證 `{ ref → 值 }` 回應,再由填寫引擎寫回值。下次同一張表單 → 直接讀本機快取,不呼叫 AI。

---

## BYOK & 供應商

| 供應商 | 說明 |
|---|---|
| **Ollama**(預設) | 本機 daemon(`http://localhost:11434/v1`),**免金鑰**。支援雲端模型如 `minimax-m2.5:cloud`、`qwen3-coder-next:cloud`。請設 `OLLAMA_ORIGINS=*` 讓擴充連得到。 |
| **Google Gemini** | 有免費額度 — 上手門檻最低的雲端選項。 |
| **OpenAI** | 任何 OpenAI 相容端點。 |
| **Anthropic Claude** | 例如 `claude-haiku-4-5`(便宜快)、`claude-opus-4-8`。 |

設定頁有「**測試連線**」按鈕,可驗證連線並自動把你可用的模型載入下拉清單。

---

## 安裝

> 尚未上架 Chrome Web Store — 以開發者模式載入。

```bash
git clone https://github.com/jaylooloomi/chrome-extension-autofill
cd chrome-extension-autofill
npm install
npm run build        # → dist/
```

1. 開 `chrome://extensions`,開啟**開發人員模式**。
2. **載入未封裝項目** → 選 `dist/` 資料夾。
3. 點 Autofy 圖示 → **開啟設定** → 選供應商(預設 Ollama)、填好 profile。

---

## 使用

1. 點 Autofy 圖示 → **開啟設定**。
   - **供應商:** 預設 Ollama(免金鑰)。雲端則貼金鑰後按**測試連線**載入模型。
   - **Profile:** 直接填、貼履歷、匯入 `.txt`,或**用 AI 生成完整 profile**。
2. 到任何表單頁,**`自動填寫`** 按鈕會出現在表單送出鈕旁邊。
3. 點它 → Autofy 填好表單並開啟**檢視側欄**。
4. 檢查 / 修改值,然後**自己送出表單**。

| 動作 | 位置 |
|---|---|
| 填寫目前表單 | `自動填寫` 按鈕(送出鈕旁,或浮動) |
| 送出前檢視/修改 | 填寫後的側欄 |
| 在此網站停用 | popup →「在此網站停用」(即時) |
| 設定 / profile | popup →「開啟設定」 |

---

## 設定

popup → **開啟設定**。

| 選項 | 說明 |
|---|---|
| 介面語言 | English / 繁體中文 / 简体中文 / 日本語(或跟隨瀏覽器) |
| 供應商 · 模型 · 金鑰 | BYOK;**測試連線**會載入你的模型 |
| 填寫語言 | Autofy 填表用的語言;自動偵測會採用頁面語言 |
| 缺少的欄位用 AI 假資料補滿 | 補上 profile 沒有的欄位(預設開) |
| Profile | 編輯欄位;或從履歷文字/檔案/完整 AI 生成草擬 |
| 備份 | 匯出 / 匯入全部設定為 JSON(重裝也能還原) |

---

## 隱私與安全

- **無 Autofy 伺服器、零 telemetry。** profile、金鑰、已學站點只存在 `chrome.storage.local`。
- **金鑰只會送到你選的供應商**,不送別處。
- **永不自動送出。** Autofy 填好後給你檢視側欄,你自己按送出。
- **驗證碼絕不自動填** — 偵測到就標 *manual* 讓你自己輸入。
- **假資料會被標示**,且**不會被當成你的真資料寫入快取**。

---

## 工程亮點

- **MV3、TypeScript、免依賴打包。** `esbuild` 打包 content script(IIFE)、service worker(ESM module)與頁面;`vitest` 覆蓋邏輯。
- **框架感知的填寫引擎。** 沿原型鏈找出真正的 `value` setter 並派發 `input`/`change`,讓 React/Vue 受控元件吃進值而非打回。
- **Provider adapter 層。** 統一 `LLMProvider` 介面;Ollama / OpenAI / Gemini / Anthropic 在後面,各自強制 JSON 輸出。
- **穩定的快取簽章。** 每欄位簽章(正規化 name/id/label)+ 表單簽章,驅動零 AI 重播與「從修正學習」。
- **樣式隔離 UI。** 按鈕與側欄渲染在 Shadow DOM,宿主頁 CSS 弄不亂它。
- **免依賴 PNG icon。** 純 Node 光柵化器(`scripts/make-icons.mjs`),4× 超取樣 + 手寫 PNG 編碼。
- **有測試。** 50+ 個 vitest 單元/整合測試(detector、fill engine、mapping、cache、providers、i18n)。

---

## 開發路線

- [ ] 上架 Chrome Web Store
- [ ] 多 profile
- [ ] 更完整的 Shadow-DOM / 自訂控件支援
- [ ] 逐站欄位對應編輯器(選用)

## 已知限制

- **跨來源 iframe**(金流/結帳)瀏覽器禁止存取 — Autofy 填不了。
- **反機器人偵測站**可能擋程式化填寫。
- **canvas / 圖片渲染輸入框**沒有 DOM 可填。
- **Shadow DOM / 自訂 `<div>` 控件**為「盡力而為」,失敗會標示而非保證。
- **thinking 雲端模型較慢**(如 `minimax-m2.5:cloud` 約 20 秒)。要快就換非 thinking 模型(如 `qwen3-coder-next:cloud`)。
- 設定在重載/更新後都會保留,但**完全移除擴充**會清空 — 先用**備份 → 匯出**。

---

## 開發

```
src/
├── background/   service worker:訊息路由、mapping、cache、resume、llm/*
├── content/      detector、refs、fill-engine、review-ui、bootstrap
├── options/      profile + 金鑰 + 履歷/生成 設定頁
├── popup/        狀態、逐站開關、設定捷徑
└── shared/       types、messages、storage、profile-schema、i18n
tests/            vitest 測試   ·   scripts/make-icons.mjs   ·   test/manual/(本機測試表單)
```

```bash
npm install        # 安裝開發相依
npm run dev        # esbuild watch → dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # 正式建構 → dist/
npm run icons      # 重新產生 PNG icon
```

內附本機測試表單:`node test/manual/serve.mjs` → http://localhost:8765/job-form.html

## 系統需求

- Google Chrome(或 Chromium),支援 Manifest V3
- 建構需 Node.js 18+
- 一個供應商:本機 Ollama(免費)**或** Gemini / OpenAI / Anthropic 金鑰

---

## 免責聲明

Autofy 是獨立的開源專案,**與 Google、OpenAI、Anthropic、Ollama 無任何隸屬、背書或贊助關係**。「Chrome」為 Google 商標;「Claude」為 Anthropic 商標;其餘名稱屬各自所有者。Autofy 以**你自己的**金鑰/帳號呼叫這些服務。請負責任地使用自動填表,並在送出前檢查每一張表單。

## 授權

MIT
