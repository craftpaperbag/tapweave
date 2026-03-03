/**
 * TapWeave - Gemini API 統合モジュール
 *
 * ブラウザから直接 Gemini API を呼び出す。
 * APIキーは localStorage に保存（仮説H7参照）。
 */

const GeminiClient = (() => {
  const STORAGE_KEY_API = 'tapweave_gemini_api_key';
  const STORAGE_KEY_MODEL = 'tapweave_gemini_model';
  const STORAGE_KEY_COUNT = 'tapweave_suggestion_count';
  const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  // --- 設定の読み書き ---

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY_API) || '';
  }

  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY_API, key.trim());
  }

  function getModel() {
    return localStorage.getItem(STORAGE_KEY_MODEL) || 'gemini-2.0-flash';
  }

  function setModel(model) {
    localStorage.setItem(STORAGE_KEY_MODEL, model);
  }

  function getSuggestionCount() {
    return parseInt(localStorage.getItem(STORAGE_KEY_COUNT) || '3', 10);
  }

  function setSuggestionCount(count) {
    localStorage.setItem(STORAGE_KEY_COUNT, String(count));
  }

  function isConfigured() {
    return getApiKey().length > 0;
  }

  // --- API呼び出し ---

  /**
   * テキストの続きの候補を取得する
   * @param {string} currentText - 現在の入力テキスト
   * @param {AbortSignal} [signal] - キャンセル用シグナル
   * @returns {Promise<string[]>} 提案テキストの配列
   */
  async function getSuggestions(currentText, signal) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('APIキーが設定されていません');
    }

    const model = getModel();
    const count = getSuggestionCount();
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const systemPrompt = buildSystemPrompt(count);
    const userPrompt = buildUserPrompt(currentText);

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 512,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || `API Error: ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    return parseSuggestions(data, count);
  }

  /**
   * 空白状態用のテーマ提案を取得する
   * @param {AbortSignal} [signal] - キャンセル用シグナル
   * @returns {Promise<string[]>}
   */
  async function getThemeSuggestions(signal) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('APIキーが設定されていません');
    }

    const model = getModel();
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: '何か書き始めたいけど、何を書こうか迷っています。今の気分に合いそうな書き出しを提案してください。' }]
        }
      ],
      systemInstruction: {
        parts: [{
          text: `あなたはクリエイティブライティングの導き手です。
ユーザーが何かを書き始めるための、短い書き出しの候補を5つ提案してください。

ルール:
- 各候補は10〜25文字程度の短い書き出し文にすること
- 多様なジャンル（日記、エッセイ、物語、詩、アイデアメモ）から出すこと
- 「今日は」のようなありきたりな書き出しは避けること
- 疲れた夜でも「あ、これ書きたいかも」と思えるような、ちょっとした引力のある文にすること

必ず以下のJSON形式のみで応答してください:
{"suggestions": ["書き出し1", "書き出し2", "書き出し3", "書き出し4", "書き出し5"]}`
        }]
      },
      generationConfig: {
        temperature: 1.0,
        topP: 0.95,
        maxOutputTokens: 256,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return parseSuggestions(data, 5);
  }

  // --- プロンプト構築 ---

  function buildSystemPrompt(count) {
    return `あなたはTapWeaveという先回り執筆アシスタントです。
ユーザーが書いている文章の「続き」の候補を${count}個提案してください。

【絶対ルール】
- ユーザーの文脈・トーンを読み取り、自然な続きを提案すること
- 各候補は5〜40文字程度。長すぎず、短すぎず
- 思考の「枝分かれ」を意識し、異なる方向性の続きを混ぜること
  - 例: ストレートな続き、意外な展開、感情を掘り下げる続き
- 「AIが書きました」感のない、ユーザー自身の言葉のように自然な文体であること
- 句読点や改行も含めてよい
- 必ず以下のJSON形式のみで応答すること:
  {"suggestions": ["候補1", "候補2", "候補3"]}

【やってはいけないこと】
- ユーザーが書いた内容を繰り返すこと
- 定型的・テンプレ的な文章を出すこと
- 丁寧語・敬語を勝手に挿入すること（ユーザーの文体に合わせる）`;
  }

  function buildUserPrompt(currentText) {
    // 仮説H5: 直近500文字 + 先頭100文字でコンテキスト構築
    let context;
    if (currentText.length <= 600) {
      context = currentText;
    } else {
      const head = currentText.slice(0, 100);
      const tail = currentText.slice(-500);
      context = head + '\n...\n' + tail;
    }

    return `以下の文章の続きの候補を提案してください:\n\n---\n${context}\n---`;
  }

  // --- レスポンスパース ---

  function parseSuggestions(data, expectedCount) {
    try {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return getDefaultSuggestions();

      const parsed = JSON.parse(text);
      const suggestions = parsed.suggestions || parsed.candidates || [];

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        return getDefaultSuggestions();
      }

      return suggestions.slice(0, expectedCount).map(s => String(s).trim()).filter(Boolean);
    } catch {
      return getDefaultSuggestions();
    }
  }

  function getDefaultSuggestions() {
    return ['...と思った。', 'それから、', 'でも実は、'];
  }

  // --- Public API ---
  return {
    getApiKey,
    setApiKey,
    getModel,
    setModel,
    getSuggestionCount,
    setSuggestionCount,
    isConfigured,
    getSuggestions,
    getThemeSuggestions
  };
})();
