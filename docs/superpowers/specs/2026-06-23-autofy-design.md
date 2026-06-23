# Autofy — 細部實作設計 Spec（v1）

> 對應 `plan.md`。本文件把高層計畫展開成「可交給工程執行」的設計：定檔案結構、定模組介面、定資料合約、定資料流、定測試與驗收。
>
> 一句話定位：**一顆浮動按鈕，用 LLM 看懂網頁上任何表單欄位的意圖，依你的個人檔案一鍵填完——填得準、填得進、碰不到你的資料。**

---

## 0. 決策摘要（§11 + 技術選型，已拍板）

| 項目 | 定案 | 備註 |
|---|---|---|
| 模型 / 隱私 | **BYOK 自帶金鑰** | 個資只進用戶自己的金鑰；無開發者伺服器 |
| 模型供應商 | **多供應商 adapter**：OpenAI / Gemini / Anthropic | 引導頁**預設推薦 Gemini Flash**（有免費額度，降上手門檻） |
| Profile 起手 | **手動結構化建檔 ＋ 可選「貼履歷文字 → AI 解析草稿 → 過目修改」** | 複用同一套 BYOK/JSON 基礎建設；手動仍是真相來源 |
| 開源 | **核心開源** | 強化「不偷資料」信任；授權條款上架前定 |
| 命名 | 開發品牌 **Autofy**；ASO 標題塞 autofill / job application 關鍵字 | `.com` 被占（QuickBooks SaaS），上架前再鎖定網域/商標 |
| 建構工具 | **TypeScript + Vite** | 型別安全的訊息合約、可測試、開源可讀 |
| API key 儲存 | **`chrome.storage.local` 明文（v1）** | 誠實揭露威脅模型；密碼加密留待 v1.x |
| 送出行為 | **永不自動送出** | 填完高亮、用戶過目才自己送 |
| MVP 範圍 | **窄而深**，灘頭 = 求職 / ATS 表單 | Workday / Greenhouse / Lever |

---

## 1. 架構總覽（Manifest V3）

```
┌─ Content Script（注入頁面）──────────────────────────┐
│  detector   欄位偵測 → FieldSchema[]                  │
│  refs       ref ↔ 真實 DOM 節點 登記表                 │
│  fill-engine 穩健填值（原生 setter + 派框架事件）       │
│  review-ui  浮動按鈕 + 填前檢視側欄（高亮/標紅/可改）   │
└─────────▲ schema / 修正 ───────────┬ {ref→值} ────────┘
          │                           ▼
┌─ Service Worker（背景）──────────────────────────────┐
│  mapping    組 prompt（schema+profile）→ 呼叫 LLM      │
│  llm/*      provider adapter（openai/gemini/anthropic）│
│  cache      站點對應快取讀寫                            │
│  index      訊息路由                                    │
└─────────▲───────────────────────────────────────────┘
          │
┌─ chrome.storage.local ───────────────────────────────┐
│  profile（個資）/ apiConfig（金鑰+模型）/ siteCache    │
└──────────────────────────────────────────────────────┘
```

**為什麼這樣切**：個資與金鑰只在本機 `storage.local`；LLM 走用戶金鑰；無開發者伺服器、零 telemetry。這是「我們碰不到你的資料」的技術底氣。Content Script 與 Service Worker 透過**型別化訊息**通訊（見 §4）。

---

## 2. 檔案結構

```
autofy/
├─ manifest.json
├─ package.json / tsconfig.json / vite.config.ts
├─ src/
│  ├─ background/
│  │  ├─ index.ts            # 訊息路由：MAP_FIELDS / PARSE_RESUME …
│  │  ├─ mapping.ts          # buildMappingPrompt → provider.complete → 驗證
│  │  ├─ resume.ts           # 貼履歷 → Profile 草稿
│  │  ├─ cache.ts            # 站點快取讀寫 + 從修正學習
│  │  └─ llm/
│  │     ├─ provider.ts      # LLMProvider 介面 + 工廠
│  │     ├─ openai.ts
│  │     ├─ gemini.ts
│  │     └─ anthropic.ts
│  ├─ content/
│  │  ├─ index.ts            # bootstrap：注入按鈕、監聽訊息
│  │  ├─ detector.ts         # DOM 掃描 → FieldSchema[] + formSignature
│  │  ├─ refs.ts             # ref ↔ Element 登記表（WeakMap）
│  │  ├─ fill-engine.ts      # setNativeValue + 逐型別填值
│  │  └─ review-ui.ts        # 浮動按鈕 + 檢視側欄（Shadow DOM 隔離樣式）
│  ├─ options/               # Profile + 金鑰 管理頁（含貼履歷）
│  │  ├─ options.html / options.ts / options.css
│  ├─ popup/                 # 快捷：填寫本頁 / 開設定
│  │  ├─ popup.html / popup.ts
│  └─ shared/
│     ├─ types.ts            # 所有介面（單一真相來源）
│     ├─ messages.ts         # 訊息型別 + 收發 helper
│     ├─ storage.ts          # storage.local 型別化封裝
│     └─ profile-schema.ts   # Profile 欄位定義（options 表單 + 驗證共用）
├─ tests/
│  ├─ detector.test.ts
│  ├─ fill-engine.test.ts
│  ├─ mapping.test.ts
│  └─ fixtures/              # 真實 ATS 表單 HTML 樣本
└─ docs/
```

---

## 3. 核心資料合約（`shared/types.ts`）

```ts
// —— 欄位偵測（§4.1）——
export interface FieldSchema {
  ref: string;                 // 內部引用，對應 refs 登記表中的 Element
  tag: 'input' | 'select' | 'textarea' | 'contenteditable';
  type: string;                // text/email/tel/number/date/checkbox/radio/...
  label?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  nearbyText?: string;         // 最近的標題/群組文字
  required?: boolean;
  options?: { value: string; text: string }[] | null;  // select/radio 才有
  signature: string;           // 穩定欄位簽章（快取用，見 §7）
}

// —— 個人檔案（結構化）——
export interface Profile {
  basics?: { fullName?: string; firstName?: string; lastName?: string;
             email?: string; phone?: string; };
  address?: { line1?: string; line2?: string; city?: string;
              state?: string; postalCode?: string; country?: string; };
  job?: {
    availableFrom?: string; expectedSalary?: string; summary?: string;
    linkedin?: string; website?: string; portfolio?: string;
    workAuthorization?: string;
    experience?: { company?: string; title?: string; start?: string;
                   end?: string; description?: string }[];
    education?: { school?: string; degree?: string; field?: string;
                  start?: string; end?: string }[];
  };
  custom?: Record<string, string>;   // 用戶自訂鍵值
}

// —— AI 對應（§4.2）——
export interface MappingRequest { fields: FieldSchema[]; profile: Profile; }
export type MappingResponse = Record<string /*ref*/, string | null>;  // null = 留空

// —— 站點快取（§4.5）——
export interface SiteCacheEntry {
  domain: string;
  formSignature: string;       // 整張表單結構簽章
  version: number;             // schema 版本，升級不破壞
  map: Record<string /*field.signature*/, ProfilePath>;  // 欄位 → profile 路徑
  updatedAt: number;
}
export type ProfilePath = string;  // 例：'basics.email'、'custom.門禁PIN'

// —— 設定 ——
export interface ApiConfig {
  provider: 'openai' | 'gemini' | 'anthropic';
  apiKey: string;
  model: string;               // 例：'gemini-2.x-flash'
  endpoint?: string;           // 自訂相容端點（選填）
}

// —— LLM 供應商抽象 ——
export interface LLMProvider {
  readonly name: ApiConfig['provider'];
  /** 強制 JSON 輸出；回傳已解析、符合 schema 的物件 */
  complete(opts: { prompt: string; jsonSchema: object; signal?: AbortSignal })
    : Promise<unknown>;
}
```

---

## 4. 訊息合約（`shared/messages.ts`）

Content Script ↔ Service Worker 全部走型別化訊息（discriminated union）：

```ts
export type Msg =
  | { kind: 'MAP_FIELDS'; req: MappingRequest }            // CS → SW
  | { kind: 'MAP_FIELDS_RESULT'; map: MappingResponse; fromCache: boolean }
  | { kind: 'PARSE_RESUME'; text: string }                 // Options → SW
  | { kind: 'PARSE_RESUME_RESULT'; profile: Profile }
  | { kind: 'RECORD_CORRECTIONS'; domain: string;          // CS → SW（學習）
      formSignature: string; corrections: Record<string /*field.sig*/, ProfilePath> }
  | { kind: 'ERROR'; code: string; message: string };
```

錯誤一律以 `ERROR` 回傳並在 UI 顯示（金鑰錯誤、額度用盡、網路、JSON 解析失敗…），絕不靜默失敗。

---

## 5. 模組設計

### 5.1 detector（欄位偵測 → schema）
- 掃描可填元素：`input`（排除 hidden/submit/button）、`select`、`textarea`、`[contenteditable]`。
- **label 訊號優先序**（§4.1）：關聯 `<label for>` → `aria-label`/`aria-labelledby` → `placeholder` → `name`/`id` → 鄰近文字節點。
- 每個欄位產生 `ref`（遞增 id）並登記到 `refs`（WeakMap：ref→Element），AI 永遠只看 `ref`，碰不到真實 DOM。
- 計算 `field.signature`（穩定）與 `formSignature`（整表，見 §7）。
- v1「盡力而為」：shadow DOM 淺層嘗試；跨來源 iframe 直接略過並標示（§9 已知極限）。

### 5.2 fill-engine（穩健填值，← 真正護城河）
逐型別正確填值並**派發框架認得的事件**：
```ts
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')!;
  desc.set!.call(el, value);                                  // 繞過 React/Vue 受控攔截
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```
- `text/email/tel/number/date…`：`setNativeValue`
- `<select>`：設 value + `change`；無完全相符選項時，以 AI 回值對 `options.text` 做最相近比對
- `checkbox/radio`：依語意設 `checked` + 派事件
- `contenteditable`：設 `textContent` + `input`
- **失敗即略過並回報給 review-ui 標紅**，絕不靜默漏填（直擊「会漏填数据」）。

### 5.3 review-ui（填前檢視，信任關鍵）
- 注入**浮動按鈕**（可拖曳）；樣式用 **Shadow DOM 隔離**避免被宿主頁 CSS 污染。
- 填完**不送出**：高亮所有被填欄位；側欄列「欄位 → 填入值」，每欄**可改可清**；失敗欄位標紅。
- 用戶確認後自己按頁面的送出鍵。用戶的逐欄修正 → 經 `RECORD_CORRECTIONS` 餵快取/學習。

### 5.4 background/mapping（AI 語意對應）
- 組 prompt：`欄位 schema + profile（+ 求職表單 few-shot）`，要求**只回 JSON**：`{ref: 值 | null}`。
- 透過 provider adapter 強制 JSON 輸出（json schema / json mode）。
- profile 沒有的資料 → `null`，**寧可留空不亂編**（避免「漏填還填錯」二次傷害）。
- 回傳前驗證：key 必須屬於送出的 ref 集合、值為 string|null；不合則重試一次或回 `ERROR`。

### 5.5 background/llm（provider adapter）
三個 adapter 實作同一 `LLMProvider` 介面，差異封裝在各自檔案：
- **OpenAI**：`response_format: { type: 'json_schema', ... }`
- **Gemini**：`generationConfig.responseMimeType='application/json'` + `responseSchema`
- **Anthropic**：tool/JSON 輸出；瀏覽器直呼需 `anthropic-dangerous-direct-browser-access: true`（CORS）
- 各 provider 的 host 需列入 `host_permissions`（見 §8）。
- 模型 ID 與確切 API 參數於實作該 adapter 時逐一確認（Anthropic 部分屆時參照 claude-api 技能）。

### 5.6 background/cache（站點快取 + 學習）
- key = `domain + formSignature`；value = `field.signature → ProfilePath`。
- 命中：**本地直接套用、0 AI、目標 <300ms**；未命中或套用後欄位對不上 → 回退呼叫 AI。
- `RECORD_CORRECTIONS` 收斂：把用戶修正寫回 map，下次更準。

### 5.7 options / 貼履歷起手
- 結構化表單（依 `profile-schema.ts`）手動建立 Profile；**匯出/匯入 JSON 備份**（直擊「改版/關頁資料全沒」）。
- 「貼上履歷文字」→ `PARSE_RESUME` → SW 呼叫 LLM 抽成 `Profile` 草稿 → **回填表單供用戶過目修改** → 存。手動編輯永遠是真相來源。
- 金鑰設定：選 provider、貼 key、選 model；附「如何拿 key」說明，預設指向 Gemini Flash 免費額度。

---

## 6. 關鍵資料流

**填寫（主流程）**
1. 用戶按浮動按鈕 → `detector` 掃描 → `FieldSchema[]` + `formSignature`
2. `cache` 查 `domain+formSignature`
   - **命中** → 本地套用 map → `fill-engine` 填（0 AI）
   - **未命中** → `MAP_FIELDS` → `mapping` 呼叫 LLM → `{ref→值}`
3. `fill-engine` 逐欄填、失敗標紅 → `review-ui` 高亮 + 列表
4. 用戶逐欄過目/修改 → **自己按送出**
5. 修正經 `RECORD_CORRECTIONS` → `cache` 收斂

**貼履歷起手**：Options 貼文字 → `PARSE_RESUME` → 草稿回填 → 用戶改 → 存。

**永不自動送出**：`fill-engine` 只填值，從不觸發 `form.submit()` 或點擊送出鍵。

---

## 7. 快取簽章設計

- `field.signature` = normalize(`name || id || label`) + `:type`（去空白、轉小寫、去序號雜訊）。穩定對應同一語意欄位。
- `formSignature` = hash(排序後的 `field.signature` 列表 + 欄位數)。對表單微調有一定容忍；大改則自然 miss → 回退 AI → 重新學習。
- `version` 用於 schema 升級時的相容處理（升級不清空用戶資料）。

---

## 8. Manifest 與權限

```jsonc
{
  "manifest_version": 3,
  "name": "Autofy — AI Autofill for Job Applications (Workday · Greenhouse · Lever)",
  "permissions": ["storage", "scripting", "activeTab"],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://api.anthropic.com/*"
  ],
  "background": { "service_worker": "background/index.js", "type": "module" },
  "content_scripts": [{ "matches": ["http://*/*", "https://*/*"],
                        "js": ["content/index.js"], "run_at": "document_idle" }],
  "options_page": "options/options.html",
  "action": { "default_popup": "popup/popup.html" }
}
```
- 商店標題即 ASO 主戰場（品牌 `Autofy` + 關鍵字）。
- **權限說明**：`content_scripts` 用 `<all_urls>` 是浮動按鈕 UX 的需要（與多數 autofill 擴充一致）；上架說明會誠實交代「不外傳、無伺服器」。未來可改 optional host permissions 做逐站授權（§future）。
- LLM provider host 列入 `host_permissions` 以允許 SW `fetch`。

---

## 9. 測試策略

| 模組 | 測試重點 | 工具 |
|---|---|---|
| detector | 對 fixtures（真實 ATS HTML）抽出 ≥90% 欄位、label 優先序正確 | vitest + jsdom |
| fill-engine | React/Vue 受控元件填得進、select 相近比對、失敗回報 | vitest + jsdom |
| mapping | prompt 組裝、JSON 驗證、null 留空、非法回應重試 | vitest（mock provider）|
| cache | 簽章穩定性、命中/回退、修正學習收斂 | vitest |
| provider | 各 adapter 請求格式 + JSON 解析 | vitest（mock fetch）|
| 端到端 | 三大 ATS 手動實測（P5） | 手動 + 錄影 |

fixtures 收集 Workday / Greenhouse / Lever 的真實表單 HTML 片段。

---

## 10. 里程碑與驗收（對應 plan §7，細化）

| 階段 | 產出 | 驗收（可量測） |
|---|---|---|
| **P0 骨架** | Vite+TS scaffold、manifest、storage 封裝、Options 存讀 profile+金鑰 | 能存讀 profile 與金鑰；擴充可 load |
| **P1 偵測** | `detector` + `refs` + 簽章 | 3 個 ATS fixtures 抽出 ≥90% 欄位（單元測試綠）|
| **P2 對應** | provider adapter（先 Gemini）+ `mapping` + JSON 驗證 | 標準表單對應正確率 ≥90%（mock + 真站抽測）|
| **P3 填寫** | `fill-engine` + `review-ui`（浮動按鈕 + 檢視） | React 站填得進、漏填標紅、**不自動送出** |
| **P4 快取** | `cache` + 修正學習 + 貼履歷起手 | 同站第二次 0 AI 呼叫、<300ms 套用 |
| **P5 灘頭打磨** | OpenAI/Anthropic adapter、ATS 實測調校 | 三大 ATS 端到端成功率 ≥80% |
| **P6 上架** | 商店素材、隱私說明、開源 repo 整理、最終命名/網域/商標 | 上架 + 前 100 用戶（plan §9）|

**成功指標**（plan §8）：欄位 precision ≥95%、recall ≥90%、零誤送、快取命中延遲 <300ms、ATS 端到端 ≥80%。

---

## 11. 已知極限（誠實揭露，產品內也標示）
- **跨來源 iframe**（金流結帳等）：瀏覽器禁止存取，填不了。
- **反機器人偵測**站：可能擋程式化填寫。
- **canvas / 圖片渲染輸入框**：無 DOM 可填。
- shadow DOM / 自訂 div 控件：v1「盡力而為」，失敗標示而非保證。

---

## 12. 後續（v2+，不在 v1）
- 多 profile、逐站 optional host 授權、雲端同步（選擇性）、履歷「檔案」(PDF/Word) 解析、金鑰密碼加密。

---

*下一步：依本 spec，由 writing-plans 技能產出逐階段、可逐項勾選的實作計畫（含每項的測試與完成定義），再開始 P0 開發。*
