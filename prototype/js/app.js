/**
 * TapWeave - アプリケーションメインロジック
 *
 * CORE哲学: タップドリブン、先回り執筆、優秀な黒子
 */

(() => {
  'use strict';

  // --- DOM要素 ---
  const writingArea = document.getElementById('writing-area');
  const suggestionChips = document.getElementById('suggestion-chips');
  const suggestionsArea = document.getElementById('suggestions-area');
  const charCount = document.getElementById('char-count');
  const aiStatus = document.getElementById('ai-status');
  const aiTimestamp = document.getElementById('ai-timestamp');
  const settingsOverlay = document.getElementById('settings-overlay');
  const apiKeyInput = document.getElementById('api-key-input');
  const modelSelect = document.getElementById('model-select');
  const suggestionCountSelect = document.getElementById('suggestion-count');
  const aiBtnPositionSelect = document.getElementById('ai-btn-position');
  const saveSettingsBtn = document.getElementById('save-settings');
  const closeSettingsBtn = document.getElementById('close-settings');
  const settingsBtn = document.getElementById('settings-btn');
  const clearBtn = document.getElementById('clear-btn');
  const copyBtn = document.getElementById('copy-btn');
  const toggleKeyBtn = document.getElementById('toggle-key-visibility');
  const aiBtn = document.getElementById('ai-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeSwitchLabel = document.getElementById('theme-switch-label');
  const clearChipsBtn = document.getElementById('clear-chips-btn');

  // --- 状態 ---
  let currentAbortController = null;

  // --- 初期化 ---
  function init() {
    loadSettings();
    loadTheme();
    loadAiBtnPosition();
    setupEventListeners();

    restoreText();

    if (!GeminiClient.isConfigured()) {
      showSettings();
    }

    updateCharCount();
  }

  function loadSettings() {
    apiKeyInput.value = GeminiClient.getApiKey();
    modelSelect.value = GeminiClient.getModel();
    suggestionCountSelect.value = String(GeminiClient.getSuggestionCount());
    aiBtnPositionSelect.value = localStorage.getItem('tapweave_ai_btn_position') || 'right';
  }

  // --- テーマ ---
  function loadTheme() {
    const saved = localStorage.getItem('tapweave_theme') || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSwitchLabel.textContent = theme === 'dark' ? 'ダーク' : 'ライト';
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('tapweave_theme', next);
    applyTheme(next);
  }

  // --- AIボタン位置 ---
  function loadAiBtnPosition() {
    const pos = localStorage.getItem('tapweave_ai_btn_position') || 'right';
    applyAiBtnPosition(pos);
  }

  function applyAiBtnPosition(pos) {
    if (pos === 'left') {
      suggestionsArea.classList.add('ai-btn-left');
    } else {
      suggestionsArea.classList.remove('ai-btn-left');
    }
  }

  // --- イベントリスナー ---
  function setupEventListeners() {
    // 執筆エリアの入力監視（文字数カウントのみ）
    writingArea.addEventListener('input', onTextInput);

    // AIボタン
    aiBtn.addEventListener('click', onAiBtnClick);

    // テーマ切替
    themeToggleBtn.addEventListener('click', toggleTheme);

    // チップクリア
    clearChipsBtn.addEventListener('click', clearChips);

    // 設定パネル
    settingsBtn.addEventListener('click', showSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);
    closeSettingsBtn.addEventListener('click', hideSettings);
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) hideSettings();
    });
    toggleKeyBtn.addEventListener('click', toggleKeyVisibility);

    // ヘッダーアクション
    clearBtn.addEventListener('click', clearText);
    copyBtn.addEventListener('click', copyText);

    // キーボードでEscで設定を閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) {
        hideSettings();
      }
    });

    // モバイルキーボード対応: visualViewportでレイアウト調整
    setupKeyboardHandler();
  }

  // --- モバイルキーボード対応 ---
  function setupKeyboardHandler() {
    if (!window.visualViewport) return;

    const onViewportResize = () => {
      const vvHeight = window.visualViewport.height;
      const offsetTop = window.visualViewport.offsetTop;
      document.documentElement.style.setProperty('--app-height', `${vvHeight}px`);
      document.getElementById('app').style.transform = `translateY(${offsetTop}px)`;
    };

    window.visualViewport.addEventListener('resize', onViewportResize);
    window.visualViewport.addEventListener('scroll', onViewportResize);
  }

  // --- テキスト保存・復元 ---
  function saveText() {
    localStorage.setItem('tapweave_text', writingArea.innerHTML);
  }

  function restoreText() {
    const saved = localStorage.getItem('tapweave_text');
    if (saved) {
      writingArea.innerHTML = saved;
    }
  }

  // --- テキスト入力処理 ---
  function onTextInput() {
    updateCharCount();
    saveText();
  }

  function getPlainText() {
    return writingArea.innerText || '';
  }

  function updateCharCount() {
    const len = getPlainText().length;
    charCount.textContent = `${len}文字`;
  }

  // --- AIボタン処理 ---
  function onAiBtnClick() {
    const text = getPlainText();
    if (text.length === 0) {
      showInitialSuggestions();
    } else {
      fetchSuggestions(text);
    }
  }

  // --- AI提案取得 ---
  async function fetchSuggestions(text) {
    // 前のリクエストをキャンセル
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    updateTimestamp();
    setAiStatus('thinking', '考え中...');
    showLoadingChips();

    try {
      const suggestions = await GeminiClient.getSuggestions(
        text,
        currentAbortController.signal
      );
      renderSuggestionChips(suggestions, false);
      setAiStatus('', '');
    } catch (err) {
      if (err.name === 'AbortError') return; // キャンセルは無視
      console.error('Suggestion fetch error:', err);
      setAiStatus('error', 'エラー');
      renderErrorInChips(err.message);
    }
  }

  async function showInitialSuggestions() {
    if (!GeminiClient.isConfigured()) {
      renderThemeChipsStatic();
      return;
    }

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    updateTimestamp();
    setAiStatus('thinking', '準備中...');
    showLoadingChips();

    try {
      const themes = await GeminiClient.getThemeSuggestions(currentAbortController.signal);
      renderSuggestionChips(themes, true);
      setAiStatus('', '');
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Theme fetch error:', err);
      renderThemeChipsStatic();
      setAiStatus('', '');
    }
  }

  // --- チップ描画 ---
  function renderSuggestionChips(suggestions, isTheme) {
    suggestionChips.innerHTML = '';
    suggestions.forEach((text) => {
      const chip = document.createElement('button');
      chip.className = isTheme ? 'chip theme-chip' : 'chip';
      chip.textContent = text;
      chip.addEventListener('mousedown', (e) => e.preventDefault());
      chip.addEventListener('click', () => onChipTap(text, isTheme));
      suggestionChips.appendChild(chip);
    });
  }

  function renderThemeChipsStatic() {
    // 仮説H6: 静的なフォールバックテーマ
    const fallbackThemes = [
      'ふと、窓の外を見て思った。',
      'もし明日、全てが変わるとしたら',
      '最近ずっと気になっていること',
      'あの日のことを、書き残しておこう',
      '眠れない夜に浮かんだ、ひとつのアイデア'
    ];
    renderSuggestionChips(fallbackThemes, true);
  }

  function renderFallbackChips() {
    const fallbacks = ['...と思った。', 'それから、', 'でも実は、'];
    renderSuggestionChips(fallbacks, false);
  }

  function renderErrorInChips(message) {
    suggestionChips.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'chip-error';
    errorDiv.textContent = message;
    suggestionChips.appendChild(errorDiv);
  }

  function clearChips() {
    suggestionChips.innerHTML = '';
  }

  function showLoadingChips() {
    suggestionChips.innerHTML = `
      <div class="chip-loading">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>`;
  }

  // --- チップタップ処理 ---
  function onChipTap(text, isTheme) {
    // キーボードが閉じないよう先にフォーカスを戻す
    writingArea.focus();

    if (isTheme && getPlainText().length === 0) {
      // テーマチップ: 書き出しとして挿入（改行を保持するためinnerHTMLをクリアしてテキストノード追加）
      writingArea.innerHTML = '';
      writingArea.appendChild(document.createTextNode(text));
    } else {
      // 続きチップ: 末尾に追加
      appendText(text);
    }

    // チップを全消し
    clearChips();

    // カーソルを末尾に移動（フォーカスは既にあるので不要）
    moveCursorToEnd(false);
    updateCharCount();
    saveText();
  }

  function appendText(text) {
    // 改行を保持するため、textContentではなくテキストノードを末尾に追加
    writingArea.appendChild(document.createTextNode(text));
  }

  function moveCursorToEnd(shouldFocus = true) {
    const range = document.createRange();
    const sel = window.getSelection();
    if (writingArea.childNodes.length > 0) {
      const lastNode = writingArea.childNodes[writingArea.childNodes.length - 1];
      range.setStartAfter(lastNode);
    } else {
      range.setStart(writingArea, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    if (shouldFocus) writingArea.focus();
  }

  // --- 設定パネル ---
  function showSettings() {
    loadSettings();
    settingsOverlay.classList.remove('hidden');
  }

  function hideSettings() {
    if (!GeminiClient.isConfigured()) return; // キーがないと閉じられない
    settingsOverlay.classList.add('hidden');
  }

  function saveSettings() {
    const key = apiKeyInput.value.trim();
    if (!key) {
      apiKeyInput.focus();
      return;
    }

    GeminiClient.setApiKey(key);
    GeminiClient.setModel(modelSelect.value);
    GeminiClient.setSuggestionCount(parseInt(suggestionCountSelect.value, 10));

    // AIボタン位置を保存・適用
    const btnPos = aiBtnPositionSelect.value;
    localStorage.setItem('tapweave_ai_btn_position', btnPos);
    applyAiBtnPosition(btnPos);

    settingsOverlay.classList.add('hidden');
  }

  function toggleKeyVisibility() {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
  }

  // --- ヘッダーアクション ---
  function clearText() {
    if (getPlainText().length === 0) return;
    writingArea.innerHTML = '';
    updateCharCount();
    localStorage.removeItem('tapweave_text');
  }

  async function copyText() {
    const text = getPlainText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      showToast('コピーしました');
    } catch {
      // フォールバック
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('コピーしました');
    }
  }

  // --- ユーティリティ ---
  function setAiStatus(className, text) {
    aiStatus.className = className;
    aiStatus.textContent = text;
  }

  function truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '...' : str;
  }

  function updateTimestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    aiTimestamp.textContent = `${h}:${m}:${s}`;
  }

  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
  }

  // --- 起動 ---
  document.addEventListener('DOMContentLoaded', init);
})();
