// Lightweight runtime i18n for the extension UI (options + popup).
// Locale is user-selectable ('auto' follows the browser). Strings fall back to
// English when a key/locale is missing.

export type Locale = 'en' | 'zh-TW' | 'zh-CN' | 'ja';

export const LOCALES: { code: Locale; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'ja', name: '日本語' },
];

/** Languages offered for the *fill output* (plus auto-detect). */
export const FILL_LANGUAGES: { code: string; name: string }[] = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
];

type Dict = Record<string, string>;

const EN: Dict = {
  tagline: 'AI semantic autofill · BYOK · your data never leaves this machine.',
  ui_language: 'Interface language',
  auto: 'Auto',
  sec_api: '1 · API key (BYOK)',
  api_hint: 'Pick a provider and paste your key. We recommend Gemini Flash — it has a free tier.',
  key_help: 'How to get a key',
  provider: 'Provider',
  model: 'Model',
  api_key: 'API key',
  key_optional: '(optional for Ollama)',
  endpoint: 'Custom endpoint (optional)',
  fill_language: 'Fill language',
  fill_language_hint: 'Language used when filling. Auto-detect uses the page language.',
  save_api: 'Save API settings',
  sec_resume: '2 · Quick start from your résumé (optional)',
  resume_hint: 'Paste résumé text or import a text file. Autofy drafts a profile with AI — you review and edit below before saving.',
  resume_placeholder: 'Paste résumé text here…',
  draft_profile: 'Draft profile with AI',
  import_file: 'Import text file',
  sec_profile: '3 · Your profile',
  profile_hint: 'This is what Autofy fills forms from. Edit anything; blank fields are ignored.',
  save_profile: 'Save profile',
  sec_backup: '4 · Backup',
  backup_hint: 'Export everything (profile + settings + learned sites) to a file, or import a backup.',
  export: 'Export backup',
  import: 'Import backup',
  saved: 'Saved.',
  popup_open_settings: 'Open settings',
  popup_foot: 'Click the floating Fill button on a form page to autofill.',
  popup_need_key: 'Add your API key in settings to start.',
  popup_need_profile: 'Provider set. Now fill in your profile.',
  popup_ready: 'Ready',
};

const ZH_TW: Dict = {
  tagline: 'AI 語意自動填表 · BYOK · 你的資料不離開本機。',
  ui_language: '介面語言',
  auto: '自動',
  sec_api: '1 · API 金鑰 (BYOK)',
  api_hint: '選擇供應商並貼上金鑰。建議用 Gemini Flash — 有免費額度。',
  key_help: '如何取得金鑰',
  provider: '供應商',
  model: '模型',
  api_key: 'API 金鑰',
  key_optional: '(Ollama 可留空)',
  endpoint: '自訂端點(選填)',
  fill_language: '填寫語言',
  fill_language_hint: '填表時使用的語言。自動判斷會採用頁面語言。',
  save_api: '儲存 API 設定',
  sec_resume: '2 · 用履歷快速開始(選填)',
  resume_hint: '貼上履歷文字或匯入文字檔。Autofy 會用 AI 草擬 profile — 你在下方檢視修改後再儲存。',
  resume_placeholder: '在此貼上履歷文字…',
  draft_profile: '用 AI 草擬 profile',
  import_file: '匯入文字檔',
  sec_profile: '3 · 你的個人檔案',
  profile_hint: 'Autofy 會依此填表。任意修改;留空的欄位會被忽略。',
  save_profile: '儲存個人檔案',
  sec_backup: '4 · 備份',
  backup_hint: '把全部(profile + 設定 + 已學站點)匯出成檔案,或匯入備份。',
  export: '匯出備份',
  import: '匯入備份',
  saved: '已儲存。',
  popup_open_settings: '開啟設定',
  popup_foot: '在表單頁點浮動的 Fill 按鈕即可自動填寫。',
  popup_need_key: '請先到設定貼上 API 金鑰。',
  popup_need_profile: '供應商已設定。接著填你的個人檔案。',
  popup_ready: '就緒',
};

const ZH_CN: Dict = {
  tagline: 'AI 语义自动填表 · BYOK · 你的数据不离开本机。',
  ui_language: '界面语言',
  auto: '自动',
  sec_api: '1 · API 密钥 (BYOK)',
  api_hint: '选择服务商并粘贴密钥。建议用 Gemini Flash — 有免费额度。',
  key_help: '如何获取密钥',
  provider: '服务商',
  model: '模型',
  api_key: 'API 密钥',
  key_optional: '(Ollama 可留空)',
  endpoint: '自定义端点(可选)',
  fill_language: '填写语言',
  fill_language_hint: '填表时使用的语言。自动判断会采用页面语言。',
  save_api: '保存 API 设置',
  sec_resume: '2 · 用简历快速开始(可选)',
  resume_hint: '粘贴简历文本或导入文本文件。Autofy 会用 AI 起草 profile — 你在下方查看修改后再保存。',
  resume_placeholder: '在此粘贴简历文本…',
  draft_profile: '用 AI 起草 profile',
  import_file: '导入文本文件',
  sec_profile: '3 · 你的个人资料',
  profile_hint: 'Autofy 会据此填表。可任意修改;留空的字段会被忽略。',
  save_profile: '保存个人资料',
  sec_backup: '4 · 备份',
  backup_hint: '把全部(profile + 设置 + 已学站点)导出为文件,或导入备份。',
  export: '导出备份',
  import: '导入备份',
  saved: '已保存。',
  popup_open_settings: '打开设置',
  popup_foot: '在表单页点击浮动的 Fill 按钮即可自动填写。',
  popup_need_key: '请先到设置粘贴 API 密钥。',
  popup_need_profile: '服务商已设置。接着填你的个人资料。',
  popup_ready: '就绪',
};

const JA: Dict = {
  tagline: 'AI セマンティック自動入力 · BYOK · データは端末から出ません。',
  ui_language: '表示言語',
  auto: '自動',
  sec_api: '1 · API キー (BYOK)',
  api_hint: 'プロバイダーを選びキーを貼り付けます。Gemini Flash 推奨 — 無料枠あり。',
  key_help: 'キーの取得方法',
  provider: 'プロバイダー',
  model: 'モデル',
  api_key: 'API キー',
  key_optional: '(Ollama は任意)',
  endpoint: 'カスタムエンドポイント(任意)',
  fill_language: '入力言語',
  fill_language_hint: '入力時に使う言語。自動判定はページの言語を使います。',
  save_api: 'API 設定を保存',
  sec_resume: '2 · 履歴書からクイックスタート(任意)',
  resume_hint: '履歴書テキストを貼るかファイルを取り込みます。AI が profile を下書きします — 下で確認・編集して保存。',
  resume_placeholder: 'ここに履歴書テキストを貼り付け…',
  draft_profile: 'AI で profile を下書き',
  import_file: 'テキストファイルを取り込む',
  sec_profile: '3 · プロフィール',
  profile_hint: 'Autofy はこれを元に入力します。自由に編集可;空欄は無視されます。',
  save_profile: 'プロフィールを保存',
  sec_backup: '4 · バックアップ',
  backup_hint: 'すべて(profile + 設定 + 学習済みサイト)をファイルに書き出し、または取り込み。',
  export: 'バックアップを書き出す',
  import: 'バックアップを取り込む',
  saved: '保存しました。',
  popup_open_settings: '設定を開く',
  popup_foot: 'フォームページで浮かぶ Fill ボタンを押すと自動入力します。',
  popup_need_key: 'まず設定で API キーを貼り付けてください。',
  popup_need_profile: 'プロバイダー設定済み。次にプロフィールを入力。',
  popup_ready: '準備完了',
};

const MESSAGES: Record<Locale, Dict> = {
  en: EN,
  'zh-TW': ZH_TW,
  'zh-CN': ZH_CN,
  ja: JA,
};

/** Map a browser locale string (e.g. 'zh-TW', 'zh', 'ja-JP') to a supported one. */
export function resolveLocale(pref: string | undefined): Locale {
  const candidate = pref && pref !== 'auto' ? pref : navigatorLocale();
  if (candidate in MESSAGES) return candidate as Locale;
  const lower = candidate.toLowerCase();
  if (lower.startsWith('zh')) return lower.includes('cn') || lower.includes('hans') ? 'zh-CN' : 'zh-TW';
  if (lower.startsWith('ja')) return 'ja';
  return 'en';
}

function navigatorLocale(): string {
  return typeof navigator !== 'undefined' ? navigator.language : 'en';
}

export function t(key: string, locale: Locale): string {
  return MESSAGES[locale]?.[key] ?? EN[key] ?? key;
}
