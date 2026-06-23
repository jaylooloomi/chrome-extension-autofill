# FillPilot（暫定名）— AI 語意自動填表 Chrome Extension｜開發計畫

> 一句話：**一顆浮動按鈕，看懂網頁上「任何」表單欄位的意圖，依你的個人檔案一鍵填完——填得準、填得進、碰不到你的資料。**

---

## 0. 為什麼是現在（grounded，不是空想）

這個產品的每一個決定，都是從**現有產品的真實負評**長出來的：

| 在位者 | 證據 | 缺口 |
|---|---|---|
| Lightning Autofill（3.4★ / 50 萬裝） | 評論區用戶公開求替代「请问有其他类似的工具推荐吗？」；「限制10次後廢掉了」；「会漏填数据」 | 貪婪課金 + 漏填 |
| 1Password / Bitwarden | 「some sites just don't work at all」「the autofill prompt doesn't suggest a login」 | 跨站不一致、認不出非標準欄位（Barcode/PIN） |

**機會本質**：在位者全靠「固定 profile / 正則 / 關鍵字硬比對」，網站欄位一非標準（自訂控件、中文、奇怪 label）就漏填認錯。**LLM 能做語意級欄位理解**——這格在「問什麼」，當成自然語言題來解。這是以前做不到、現在剛好能做的格子。

---

## 1. 定位與範圍

- **核心用戶**：需要反覆把同一份個資填進不同網站表單的人。
- **灘頭場景（行銷與測試先聚焦）**：**線上求職 / 投履歷**。Workday、Greenhouse、Lever 這類 ATS 表單超長、欄位重複度高、同一份資料要重填幾十次——痛感最高、用戶群明確、口碑易擴散。
- **架構維持通用**：技術上支援任意表單，只是初期主打求職場景。

### MVP = 窄而深（v1 範圍）

**做（In）**
- 偵測標準表單欄位：`<input>`（text/email/tel/number/date/checkbox/radio…）、`<select>`、`<textarea>`
- 單一 user profile（手動填寫 + 結構化儲存）
- AI 語意對應：欄位 ↔ profile 資料
- 浮動按鈕一鍵填寫
- **填寫前可檢視、可逐欄修改、絕不自動送出**
- 站點對應**快取**（同站第二次秒填、不再花 AI 錢）
- BYOK：用戶自帶 API key

**不做（Out，留待後續）**
- 自訂 `<div>` 控件、shadow DOM、跨來源 iframe 的完整支援（v1 盡力而為、失敗則略過並標示）
- 多 profile、用 AI 從履歷檔自動解析 profile
- 假資料模式（吃 Fake Filler 用戶）
- 雲端同步

---

## 2. 關鍵架構決定（已拍板）

| 決定 | 選擇 | 為什麼 |
|---|---|---|
| AI / 隱私模型 | **BYOK 自帶金鑰** | 你零 API 成本；個資只進用戶自己的金鑰；可主打「我們碰不到你的資料」——直接打死在位者的貪婪 + 隱私疑慮 |
| MVP 範圍 | **窄而深** | 先把「填得準、填得進」做到碾壓 Lightning Autofill 的「漏填」 |
| 灘頭 | **求職 / ATS 表單** | 痛感最高、用戶明確、易擴散 |
| 送出行為 | **永不自動送出** | 填表工具最致命的是誤填誤送；填完高亮、用戶過目才送 |

---

## 3. 技術架構（Manifest V3）

```
┌─ Content Script（注入頁面）────────────────────────┐
│  • 偵測欄位 → 抽出「欄位 schema」                    │
│  • 注入浮動按鈕 + 填寫前檢視 UI                       │
│  • 執行「穩健 fill 引擎」把值填回欄位                  │
└───────────────▲───────────────────┬────────────────┘
                │ schema             │ {欄位→值}
                │                    ▼
┌─ Service Worker（背景）────────────────────────────┐
│  • 用「用戶的 API key」呼叫 LLM                      │
│  • 組 prompt（欄位 schema + profile）→ 解析 JSON     │
│  • 站點對應快取讀寫                                   │
└───────────────▲────────────────────────────────────┘
                │
┌─ chrome.storage.local ─────────────────────────────┐
│  • user profile（個資）                              │
│  • API key（加密儲存）                               │
│  • 站點 → 欄位對應 快取                               │
└────────────────────────────────────────────────────┘
```

**為什麼這樣切**：個資與 API key 只存在用戶本機 `chrome.storage.local`；LLM 呼叫走用戶自己的金鑰；我們（開發者）的伺服器全程不存在、碰不到任何資料。這就是「我們碰不到你的資料」這句行銷的技術底氣。

---

## 4. 核心技術設計

### 4.1 欄位偵測 → 欄位 schema（省錢的關鍵）

**不要把整段 HTML 丟給 AI**（又貴又雜）。掃描每個可填欄位，抽出精簡語意脈絡：

```jsonc
[
  {
    "ref": "field_3",          // 內部引用（對應到真實 DOM 節點）
    "tag": "input", "type": "email",
    "label": "電子郵件",        // 來自 <label for>、aria-label、前後文字
    "placeholder": "you@example.com",
    "name": "applicant_email",
    "nearbyText": "聯絡資訊",   // 最近的標題/群組
    "options": null            // select/radio 才有
  }
]
```

訊號優先序：關聯 `<label>` → `aria-label`/`aria-labelledby` → `placeholder` → `name`/`id` → 鄰近文字節點。

### 4.2 AI 語意對應

把「欄位 schema + user profile」丟 LLM，要求**只回傳 JSON 對應**：

```jsonc
{ "field_3": "wang@example.com", "field_7": "王大明", "field_9": null }  // null = 沒對應資料，留空
```

- 強制 JSON 輸出（structured output / JSON mode）。
- profile 沒有的資料 → 回 `null`，**寧可留空不亂編**（避免「漏填還填錯」的二次傷害）。
- 灘頭優化：prompt 內附「求職表單常見欄位」few-shot，提升 ATS 表單命中率。

### 4.3 穩健 Fill 引擎（← 真正的護城河，不是 AI）

這層決定你贏不贏。逐型別正確填值並**派發框架認得的事件**：

```js
// React/Vue 受控元件：只設 .value 會被框架清掉，必須走原生 setter + 派事件
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc.set.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

- `text/email/...`：`setNativeValue`
- `<select>`：設 value + `change`；找不到完全相符選項時，用 AI 回值做最相近比對
- `checkbox/radio`：依語意設 `checked` + 派事件
- `contenteditable`：設 `textContent` + `input`
- **失敗就略過並在檢視 UI 標紅**，絕不靜默漏填（直擊「会漏填数据」最大痛點）。

### 4.4 填寫前檢視（信任的關鍵）

填完**不送出**：高亮所有被填欄位、側欄列出「欄位 → 填入值」、每欄可改可清。用戶確認後才自己按送出。順手記錄「用戶的修正」→ 餵 4.5 的快取/學習。

### 4.5 站點對應快取

以「網域 + 表單結構簽章」為 key，存「欄位特徵 → profile 欄位」的對應。下次同站：**直接套快取、秒填、零 AI 成本**；快取失準時再回退呼叫 AI。同時提升速度與可靠度（在位者兩大短板）。

### 4.6 Profile 管理

Options 頁手動建立結構化 profile（姓名、聯絡、地址、求職常用欄位：學經歷、可到職日、期望薪資、自我介紹段落…）。存 `chrome.storage.local`；提供**匯出/匯入備份**（直擊 OneTab/Lightning「改版/關頁資料全沒」的痛點）。

---

## 5. 負評覆蓋對照（驗收標準）

| 真實負評痛點 | v1 是否解決 | 對應設計 |
|---|---|---|
| 限 10 次課金「吃相難看」 | ✅ | BYOK = 你無成本、用戶用自己的額度，免費大方 |
| 「会漏填数据」 | ✅ 核心 | §4.3 穩健 fill 引擎 + §4.4 填前檢視 + §4.5 從修正學習 |
| 改版/關頁資料清空 | ✅ | `storage.local` + 匯出備份 + 升級不破壞 schema |
| 跨站不一致、某些站不動 | ⚠️ 大幅改善 | §4.1 語意偵測 + §4.3 多型別 fill；**跨來源 iframe 仍無解** |
| 認不出非標準欄位（Barcode/PIN/中文） | ✅ 主賣點 | §4.2 LLM 語意理解 |
| 「偷我資料」不信任 | ✅ | BYOK 架構 + 個資不離開本機 |
| 多帳號/資料選不對 | 🔜 v2 | v1 單 profile；多 profile 留待後續 |

---

## 6. 已知極限（誠實揭露，產品內也要標示）

- **跨來源 iframe**（金流結帳頁等）：瀏覽器禁止存取，填不了。
- **反機器人偵測**站：可能擋程式化填寫。
- **canvas / 圖片渲染輸入框**：無 DOM 可填。
- v1 對 **shadow DOM / 自訂 div 控件** 僅「盡力而為」，失敗標示而非保證。

---

## 7. 開發里程碑

| 階段 | 產出 | 驗收 |
|---|---|---|
| P0 骨架 | MV3 scaffold、Options 頁、profile + API key 儲存 | 能存讀 profile 與金鑰 |
| P1 偵測 | 欄位掃描 → schema 抽取 | 在 3 個 ATS 表單抽出 ≥90% 欄位 |
| P2 對應 | BYOK 呼叫 + JSON 對應 | 標準表單對應正確率 ≥90% |
| P3 填寫 | 穩健 fill 引擎 + 浮動按鈕 + 填前檢視 | React 站填得進、漏填標紅、不自動送出 |
| P4 快取 | 站點對應快取 + 修正學習 | 同站第二次零 AI 呼叫秒填 |
| P5 灘頭打磨 | Workday/Greenhouse/Lever 實測調校 | 三大 ATS 端到端成功率 ≥80% |
| P6 上架 | Chrome Web Store 上架 + 前 100 用戶 | 見 §9 |

---

## 8. 成功指標（怎麼知道贏過 Lightning Autofill）

- **欄位正確率（precision）**：填入值正確 / 已填欄位 ≥ 95%
- **覆蓋率（recall）**：正確填入 / 應填欄位 ≥ 90%
- **零誤送**：永不自動送出 → 誤送事故 = 0
- **快取命中後延遲** < 300ms（秒填體感）
- **ATS 端到端成功率**（一鍵填完整張、用戶只需微調）≥ 80%

---

## 9. 前 100 用戶（GTM）

1. **現成怒火名單**：Lightning Autofill 評論區、各「Lightning Autofill alternative」討論——這些人已在公開找替代品。
2. **求職社群**：Reddit r/jobs、r/cscareerquestions、Workday 苦主討論串、LinkedIn 求職社群——主打「填 Workday 不再想死」。
3. **定位金句**：「BYOK，免費大方、不偷你資料、填得準」——逐條對打在位者被罵的點。

---

## 10. 風險與對策

| 風險 | 對策 |
|---|---|
| BYOK 設定門檻嚇跑用戶 | 極簡引導：貼上 key 即可；附「如何拿 key」圖解；可選預設便宜模型 |
| LLM 偶爾對應錯 | 填前檢視兜底 + 從修正學習 + 站點快取收斂 |
| ATS 表單結構善變 | 以語意（非死選擇器）偵測；快取失準自動回退 AI |
| 隱私疑慮 | 開源核心 / 公開「資料不離開本機」架構說明 |
| 瀏覽器原生填表追上 | 我們的語意理解 + 求職深耕 + 跨站可靠度，是原生短期難及之處 |

---

## 11. 開放問題（待你決定）

1. **模型預設**：BYOK 之外，要不要附一個「便宜預設模型」建議（如 GPT-4o-mini / Gemini Flash）降低選擇門檻？
2. **命名**：FillPilot 只是暫定，要不要另起？
3. **開源與否**：核心開源有助建立「不偷資料」信任，但也降低競爭門檻——要走哪條？
4. **profile 起手**：v1 純手動建 profile，還是 P2 就先做「貼上履歷文字 → AI 解析成 profile」（介於窄與中之間）？

---

*下一步：本計畫確認後，可再展開成逐階段、可交給工程執行的細部實作計畫（每階段拆任務、定介面、定測試）。*
