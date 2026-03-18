// storage.js
// 忘却曲線アルゴリズムとデータのCRUD操作を担当
// ※ Supabase クラウド DB を使用します
const SUPABASE_URL = 'https://qahkvamgssedhjvtlika.supabase.co';
const SUPABASE_KEY = 'sb_publishable_g3U08ZrJjKyXaeaEuPeuaQ_SNoUxyVg';
const API_BASE = `${SUPABASE_URL}/rest/v1/cards`;
const CARD_TYPE_API_BASE = `${SUPABASE_URL}/rest/v1/card_types`;
const MEMO_API_BASE = `${SUPABASE_URL}/rest/v1/memos`;
const SETTINGS_API_BASE = `${SUPABASE_URL}/rest/v1/settings`;

// デフォルトカード型定義
const DEFAULT_CARD_TYPES = [
  {
    id: 'language', name: '🌐 語学', isDefault: true,
    fields: [
      { key: 'question', label: '単語・フレーズ',         type: 'textarea', required: true,  role: 'question' },
      { key: 'answer',   label: '意味（日本語）',         type: 'textarea', required: true,  role: 'answer' },
      { key: 'example',  label: '例文',                   type: 'textarea', required: false, role: 'answer' },
      { key: 'note',     label: '補足（発音・品詞など）', type: 'text',     required: false, role: 'answer' },
      { key: 'image',    label: '画像',                   type: 'image',    required: false, role: 'question' }
    ]
  },
  {
    id: 'science', name: '🔬 理科', isDefault: true,
    fields: [
      { key: 'question', label: '用語・概念名', type: 'textarea', required: true,  role: 'question' },
      { key: 'answer',   label: '定義・説明',   type: 'textarea', required: true,  role: 'answer' },
      { key: 'note',     label: '仕組み・機能', type: 'textarea', required: false, role: 'answer' },
      { key: 'image',    label: '画像',         type: 'image',    required: false, role: 'question' }
    ]
  },
  {
    id: 'math', name: '📐 数学', isDefault: true,
    fields: [
      { key: 'question', label: '概念・定理名',   type: 'textarea', required: true,  role: 'question' },
      { key: 'answer',   label: '公式・定義',     type: 'textarea', required: true,  role: 'answer' },
      { key: 'example',  label: '例題',           type: 'textarea', required: false, role: 'answer' },
      { key: 'note',     label: '注意点・記憶術', type: 'text',     required: false, role: 'answer' }
    ]
  },
  {
    id: 'history', name: '📅 歴史', isDefault: true,
    fields: [
      { key: 'question', label: '出来事・人名', type: 'textarea', required: true,  role: 'question' },
      { key: 'answer',   label: '内容・説明',   type: 'textarea', required: true,  role: 'answer' },
      { key: 'note',     label: '年号・時代',   type: 'text',     required: false, role: 'answer' },
      { key: 'image',    label: '画像',         type: 'image',    required: false, role: 'question' }
    ]
  },
  {
    id: 'other', name: '📝 その他', isDefault: true,
    fields: [
      { key: 'question', label: '問題', type: 'textarea', required: true,  role: 'question' },
      { key: 'answer',   label: '答え', type: 'textarea', required: true,  role: 'answer' },
      { key: 'image',    label: '画像', type: 'image',    required: false, role: 'question' }
    ]
  }
];


const isExtension = typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id &&
  (typeof window !== 'undefined' ? window.location.protocol.startsWith('chrome-extension') : true);
const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

// ===== オフラインキュー =====
const OfflineQueue = {
  QUEUE_KEY: 'offline_queue',
  async getQueue() {
    return (await LocalStore.get(this.QUEUE_KEY)) || [];
  },
  async enqueue(op) {
    const queue = await this.getQueue();
    queue.push({ ...op, timestamp: Date.now() });
    await LocalStore.set(this.QUEUE_KEY, queue);
  },
  async replay() {
    const queue = await this.getQueue();
    if (!queue.length) return;
    const remaining = [];
    for (const op of queue) {
      try {
        const res = await fetch(op.url, { method: op.method, headers: HEADERS, body: op.body || undefined });
        if (!res.ok) throw new Error(res.status);
      } catch {
        remaining.push(op);
      }
    }
    await LocalStore.set(this.QUEUE_KEY, remaining);
  }
};

// オンライン復帰時にキューを再生
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => OfflineQueue.replay());
}

// Supabase Storage へ画像ファイルをアップロードし、Public URL を返す
async function uploadImageToSupabase(file) {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/anki-images/${fileName}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'true'
    },
    body: file
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`画像アップロード失敗: ${err}`);
  }

  // Public URL
  return `${SUPABASE_URL}/storage/v1/object/public/anki-images/${fileName}`;
}

// Chrome拡張とWebブラウザの両方で動くようにストレージAPIを吸収
const LocalStore = {
  async get(key) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(key);
      return data[key];
    } else {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    }
  },
  async set(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [key]: value });
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }
};

// ===== Supabase settings テーブルへのKVアクセス =====
// quizSettings, stats, lastAnswerTime, emptyNotified 等を全てクラウドに保存
const CloudSettings = {
  async get(key) {
    try {
      const res = await fetch(`${SETTINGS_API_BASE}?key=eq.${encodeURIComponent(key)}&select=value`, { headers: HEADERS });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows.length > 0 ? rows[0].value : null;
    } catch { return null; }
  },
  async set(key, value) {
    try {
      const res = await fetch(SETTINGS_API_BASE, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
      });
      if (!res.ok) console.error('CloudSettings.set failed:', await res.text());
    } catch (e) {
      console.error('CloudSettings.set failed:', e);
    }
  }
};

const StorageManager = {
  isExtension: isExtension,
  
  // URLのベース（画像表示用など）を取得する
  getBaseUrl() {
    return '';
  },

  // ========== クイズ設定 ==========
  async getQuizSettings() {
    const defaults = { hideMastered: false, newFirst: false, order: 'due', cooldown: 15, categoryFilter: null };
    // まずSupabaseから取得、失敗時はLocalStore（移行用フォールバック）
    let saved = await CloudSettings.get('quizSettings');
    if (!saved) saved = await LocalStore.get('quizSettings');
    if (saved) {
      // 旧 genreFilter → categoryFilter マイグレーション
      if (saved.genreFilter !== undefined && saved.categoryFilter === undefined) {
        saved.categoryFilter = null;
        delete saved.genreFilter;
      }
      return { ...defaults, ...saved };
    }
    return defaults;
  },
  async saveQuizSettings(settings) {
    await CloudSettings.set('quizSettings', settings);
  },

  // ========== カード型管理 (Supabase 同期) ==========
  async getCardTypes() {
    try {
      // 1. Supabase からカード型一覧を取得
      const res = await fetch(`${CARD_TYPE_API_BASE}?select=*&order=created_at.asc`, { headers: HEADERS });
      if (!res.ok) throw new Error('Supabase Fetch Error');
      const cloudTypes = await res.json();

      // DB形式 (snake_case) から Object形式 (isDefault, etc) へ変換
      const mappedCloud = cloudTypes.map(g => ({
        id: g.id,
        name: g.name,
        isDefault: g.is_default,
        fields: g.fields,
        createdAt: g.created_at
      }));

      // 最初の起動時などでクラウドが空の場合、ローカルから移行を試みる
      if (cloudTypes.length === 0) {
        const localSaved = await LocalStore.get('cardTypes');
        const initialToSave = (localSaved && localSaved.length > 0) ? localSaved : DEFAULT_CARD_TYPES;
        
        console.log('Initializing cloud card types...');
        await this.saveCardTypes(initialToSave);
        return initialToSave;
      }

      // ローカルキャッシュも更新
      await LocalStore.set('cardTypes', mappedCloud);
      return mappedCloud;
    } catch (err) {
      console.error('getCardTypes failed, falling back to local storage:', err);
      const local = await LocalStore.get('cardTypes');
      return local || DEFAULT_CARD_TYPES;
    }
  },

  async saveCardTypes(cardTypes) {
    try {
      // 1. 各カード型をバッチでアップサート (Upsert)
      // Supabase REST API では、POST + Prefer: resolution=merge-duplicates でアップサート
      const payloads = cardTypes.map(g => ({
        id: g.id,
        name: g.name,
        is_default: !!g.isDefault,
        fields: g.fields
      }));

      const res = await fetch(CARD_TYPE_API_BASE, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payloads)
      });

      if (!res.ok) throw new Error('Supabase Upsert Error');

      // ローカル保存（バックアップ兼キャッシュ）
      await LocalStore.set('cardTypes', cardTypes);
    } catch (err) {
      console.error('saveCardTypes failed:', err);
      // 通信エラーでも利便性のためにローカルには保存
      await LocalStore.set('cardTypes', cardTypes);
    }
  },

  async deleteCardType(cardTypeId) {
    try {
      const res = await fetch(`${CARD_TYPE_API_BASE}?id=eq.${encodeURIComponent(cardTypeId)}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      if (!res.ok) throw new Error('Supabase Delete Error');
    } catch (err) {
      console.error('deleteCardType failed:', err);
    }
  },
  // ==================================

  // サーバーから全カードを取得（ページネーション付き）
  async getCardById(cardId) {
    const res = await fetch(`${API_BASE}?id=eq.${encodeURIComponent(cardId)}&select=*`, { headers: HEADERS });
    if (!res.ok) throw new Error('カードの取得に失敗しました');
    const rows = await res.json();
    if (rows.length === 0) return null;
    const c = rows[0];
    return {
      id: c.id, question: c.question, answer: c.answer, image: c.image, cardType: c.card_type, category: c.category,
      nextReviewDate: parseInt(c.next_review_date, 10), interval: parseInt(c.interval, 10),
      repetition: c.repetition, easiness: c.easiness
    };
  },

  async getAllCards() {
    try {
      let allData = [];
      let offset = 0;
      const limit = 1000;
      while (true) {
        const res = await fetch(`${API_BASE}?select=*&order=id.asc&offset=${offset}&limit=${limit}`, {
          headers: { ...HEADERS, 'Range-Unit': 'items', 'Range': `${offset}-${offset + limit - 1}` }
        });
        if (!res.ok) throw new Error('Supabase API Error');
        const batch = await res.json();
        allData = allData.concat(batch);
        if (batch.length < limit) break;
        offset += limit;
      }
      const cards = allData;
      // DBのカラム名(snake_case)をJSのオブジェクト名(camelCase)にマッピング
      return cards.map(c => ({
        id: c.id,
        question: c.question,
        answer: c.answer,
        image: c.image,
        cardType: c.card_type,
        category: c.category,
        nextReviewDate: parseInt(c.next_review_date, 10),
        interval: parseInt(c.interval, 10),
        repetition: c.repetition,
        easiness: c.easiness
      }));
    } catch (e) {
      console.error("クラウドからデータを取得できませんでした。", e);
      return [];
    }
  },

  async saveCardUpdate(card) {
    const url = `${API_BASE}?id=eq.${encodeURIComponent(card.id)}`;
    const body = JSON.stringify({
      question: card.question,
      answer: card.answer,
      image: card.image,
      card_type: card.cardType,
      category: card.category,
      next_review_date: card.nextReviewDate,
      interval: card.interval,
      repetition: card.repetition,
      easiness: card.easiness
    });
    try {
      const res = await fetch(url, { method: 'PATCH', headers: HEADERS, body });
      if (!res.ok) {
        const errText = await res.text();
        console.error("クラウドへのデータ保存に失敗しました。", res.status, errText);
        throw new Error(errText);
      }
    } catch (e) {
      console.error("オフラインキューに追加:", e);
      await OfflineQueue.enqueue({ url, method: 'PATCH', body });
    }
  },

  // カードを新規追加 (Supabase REST API の POST を使用)
  async addCard(question, answer, image = null, cardType = 'other', category = null) {
    const now = Date.now();
    const id = 'card-' + now + '-' + Math.random().toString(36).substr(2, 9);
    const body = {
      id,
      question,
      answer,
      image,
      card_type: cardType,
      category: category,
      next_review_date: now,
      interval:         86400000,     // 初期インターバル 1日
      repetition:       0,
      easiness:         2.5
    };
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`カード追加失敗: ${err}`);
      }
    } catch (e) {
      console.error("カードの追加に失敗しました。", e);
      throw e;
    }
  },


  // インストール時の初期処理
  async initDemoData() {
    await this.initStats();
  },

  async initStats() {
    const stats = await CloudSettings.get('stats');
    if (!stats) {
      await CloudSettings.set('stats', {
        todayReviews: 0,
        lastReviewDate: new Date().toDateString(),
        streak: 0,
        history: {} // 日別レビュー数を記録: { 'YYYY-MM-DD': count }
      });
    } else if (!stats.history) {
      stats.history = {};
      await CloudSettings.set('stats', stats);
    }
  },

  // 今日復習すべきカードを1件取得（なければnull）
  async getDueCardOrStatus() {
    const now = Date.now();
    const qs = await this.getQuizSettings();

    // ======= WEBアプリ版（URLからのアクセス）の場合：ランダム出題 =======
    if (!this.isExtension) {
      try {
        const res = await fetch(`${API_BASE}?select=*&limit=100&order=id.desc`, { headers: HEADERS });
        if (!res.ok) throw new Error('Fetch Error');
        const cards = await res.json();
        if (cards.length === 0) return { status: 'empty', card: null };
        const mapped = cards.map(c => ({
          id: c.id, question: c.question, answer: c.answer, image: c.image, cardType: c.card_type, category: c.category,
          nextReviewDate: parseInt(c.next_review_date, 10), interval: parseInt(c.interval, 10),
          repetition: c.repetition, easiness: c.easiness
        }));
        const randomCard = mapped[Math.floor(Math.random() * mapped.length)];
        return { status: 'due', card: randomCard };
      } catch (e) {
        console.error(e);
        return { status: 'empty', card: null };
      }
    }

    // ======= Chrome拡張機能（Spaced Repetition）の場合 =======
    const cooldownMs = (qs.cooldown || 0) * 60 * 1000;
    if (cooldownMs > 0) {
      const lastAnswerTime = await CloudSettings.get('lastAnswerTime');
      if (lastAnswerTime && (now - lastAnswerTime < cooldownMs)) {
        return { status: 'cooldown', card: null };
      }
    }

    try {
      // PostgREST フィルターを構築
      let filters = `next_review_date=lte.${now}`;
      if (qs.hideMastered) filters += '&repetition=lt.6';
      if (qs.categoryFilter)  filters += `&category=eq.${encodeURIComponent(qs.categoryFilter)}`;

      // 並び順
      let orderClause;
      if (qs.newFirst)             orderClause = 'repetition.asc,next_review_date.asc';
      else if (qs.order === 'random') orderClause = 'id.asc';
      else                          orderClause = 'next_review_date.asc';

      const limit = qs.order === 'random' ? 50 : 1;
      const res = await fetch(`${API_BASE}?select=*&${filters}&order=${orderClause}&limit=${limit}`, { headers: HEADERS });
      if (!res.ok) throw new Error('Fetch Error');
      const cards = await res.json();
      if (cards.length === 0) return { status: 'empty', card: null };

      const pick = qs.order === 'random' ? cards[Math.floor(Math.random() * cards.length)] : cards[0];
      const card = {
        id: pick.id, question: pick.question, answer: pick.answer, image: pick.image, cardType: pick.card_type, category: pick.category,
        nextReviewDate: parseInt(pick.next_review_date, 10), interval: parseInt(pick.interval, 10),
        repetition: pick.repetition, easiness: pick.easiness
      };
      return { status: 'due', card: card };
    } catch (e) {
      console.error(e);
      return { status: 'empty', card: null };
    }
  },

  // 期限切れカードの残り枚数を取得（Supabase HEAD + count=exact）
  async getDueCount() {
    if (!this.isExtension) return null;
    try {
      const now = Date.now();
      const qs = await this.getQuizSettings();
      let filters = `next_review_date=lte.${now}`;
      if (qs.hideMastered) filters += '&repetition=lt.6';
      if (qs.categoryFilter)  filters += `&category=eq.${encodeURIComponent(qs.categoryFilter)}`;
      const res = await fetch(
        `${API_BASE}?select=id&${filters}&limit=0`,
        { method: 'HEAD', headers: { ...HEADERS, 'Prefer': 'count=exact' } }
      );
      const range = res.headers.get('content-range');
      if (range) {
        const m = range.match(/\/(\d+)/);
        if (m) return parseInt(m[1], 10);
      }
      return null;
    } catch { return null; }
  },

  // カードに設定されているカテゴリの一覧を取得（重複排除済み）
  async getDistinctCategories() {
    try {
      const res = await fetch(`${API_BASE}?select=category&category=not.is.null&order=category.asc&limit=1000`, { headers: HEADERS });
      if (!res.ok) return [];
      const rows = await res.json();
      return [...new Set(rows.map(r => r.category).filter(Boolean))];
    } catch { return []; }
  },

  // SM-2 インターバル計算（純粋関数 — シミュレーションにも使う）
  _calcNext(card, quality) {
    let { interval, repetition, easiness } = card;
    const DAY = 24 * 60 * 60 * 1000;

    if (quality < 3) {
      // 忘れた → リセット。10分後に再挑戦
      repetition = 0;
      interval = 10 * 60 * 1000; // 10分
    } else {
      // quality 3=難しい, 4=普通, 5=簡単
      if (repetition === 0) {
        // 初回正解
        interval = quality === 3 ? 1 * DAY
                 : quality === 5 ? 4 * DAY
                 :                 1 * DAY;
      } else if (repetition === 1) {
        // 2回目正解
        interval = quality === 3 ? 3 * DAY
                 : quality === 5 ? 7 * DAY
                 :                 3 * DAY;
      } else {
        // 3回目以降: easiness × quality係数で伸び率を調整
        const qMul = quality === 3 ? 1.0 : quality === 5 ? 1.3 : 1.0;
        interval = Math.round(interval * easiness * qMul);
      }
      repetition += 1;
    }

    // Easiness factor の更新
    easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easiness < 1.3) easiness = 1.3;

    return { interval, repetition, easiness };
  },

  // ボタン表示用: 各quality(1,3,4,5)を押した場合の次回インターバルを返す
  simulateIntervals(card) {
    const results = {};
    for (const q of [1, 3, 4, 5]) {
      results[q] = this._calcNext(card, q).interval;
    }
    return results;
  },

  // カードの学習結果を記録し、次の復習日時を計算 (SM-2類似アルゴリズム)
  async updateCard(cardId, quality) {
    // 全件取得ではなくID指定の1件だけ取得する（ブラウザフリーズ防止）
    let card;
    try {
      const res = await fetch(`${API_BASE}?id=eq.${cardId}&select=*`, { headers: HEADERS });
      if (!res.ok) throw new Error('Fetch Error');
      const rows = await res.json();
      if (rows.length === 0) return;
      const c = rows[0];
      card = {
        id: c.id, question: c.question, answer: c.answer, image: c.image, cardType: c.card_type, category: c.category,
        nextReviewDate: parseInt(c.next_review_date, 10),
        interval: parseInt(c.interval, 10),
        repetition: c.repetition,
        easiness: c.easiness
      };
    } catch (e) {
      console.error('updateCard fetch failed:', e);
      return;
    }

    const next = this._calcNext(card, quality);
    card.interval   = next.interval;
    card.repetition = next.repetition;
    card.easiness   = next.easiness;
    card.nextReviewDate = Date.now() + card.interval;

    // サーバーに個別保存
    await this.saveCardUpdate(card);

    // lastAnswerTime をSupabaseに記録して次回出題を制限する
    await CloudSettings.set('lastAnswerTime', Date.now());
    
    // Statsの更新
    await this.incrementStats();
  },

  // カードの内容（question/answer/image）だけを更新する（編集画面から呼び出す）
  async updateCardContent(cardId, question, answer, image) {
    try {
      const body = { question, answer };
      if (image !== undefined) body.image = image;
      console.log('[updateCardContent] cardId:', cardId, 'body:', body);
      const res = await fetch(`${API_BASE}?id=eq.${encodeURIComponent(cardId)}`, {
        method: 'PATCH',
        headers: { ...HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      console.log('[updateCardContent] response status:', res.status);
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      console.log('[updateCardContent] updated rows:', updated);
      if (!updated || updated.length === 0) {
        throw new Error(`カードが見つかりませんでした（ID: ${cardId}）`);
      }
    } catch (e) {
      console.error('カード内容の更新に失敗しました', e);
      throw e;
    }
  },

  async updateLastAnswerTime() {
    await CloudSettings.set('lastAnswerTime', Date.now());
  },

  async getCooldownRemainingMs() {
    const qs = await this.getQuizSettings();
    const cooldownMs = (qs.cooldown || 0) * 60 * 1000;
    if (cooldownMs <= 0) return 0;
    const lastAnswerTime = await CloudSettings.get('lastAnswerTime');
    if (!lastAnswerTime) return 0;
    const remaining = cooldownMs - (Date.now() - lastAnswerTime);
    return remaining > 0 ? remaining : 0;
  },

  // 「問題なし」画面を一度表示したかフラグ
  async getEmptyNotified() {
    return await CloudSettings.get('emptyNotified');
  },
  async setEmptyNotified(val) {
    await CloudSettings.set('emptyNotified', !!val);
  },

  async incrementStats() {
    let stats = await CloudSettings.get('stats');
    if (!stats) {
      stats = { todayReviews: 0, lastReviewDate: new Date().toDateString(), streak: 0, history: {} };
    }

    const todayObj = new Date();
    const todayString = todayObj.toDateString();
    
    // YYYY-MM-DD フォーマットで履歴用キーを作成
    const historyKey = todayObj.toISOString().split('T')[0];
    if (!stats.history) stats.history = {};

    if (stats.lastReviewDate !== todayString) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (stats.lastReviewDate === yesterday.toDateString()) {
        stats.streak += 1;
      } else {
        stats.streak = 1; // 途切れたら1にする
      }
      stats.todayReviews = 1;
      stats.lastReviewDate = todayString;
    } else {
      stats.todayReviews += 1;
    }
    
    // 履歴を更新
    stats.history[historyKey] = (stats.history[historyKey] || 0) + 1;
    
    await CloudSettings.set('stats', stats);
  },

  // 統計情報取得（Supabaseから）
  async getStats() {
    const stats = await CloudSettings.get('stats');
    return stats || { todayReviews: 0, streak: 0 };
  },

  async deleteCard(cardId) {
    try {
      await fetch(`${API_BASE}?id=eq.${encodeURIComponent(cardId)}`, {
        method: 'DELETE',
        headers: HEADERS
      });
    } catch (e) {
      console.error("カードの削除に失敗しました。", e);
    }
  },

  // ========== メモ管理 (Supabase 同期) ==========
  async getMemos() {
    try {
      const res = await fetch(`${MEMO_API_BASE}?select=*&order=updated_at.desc`, { headers: HEADERS });
      if (!res.ok) throw new Error('Supabase Fetch Error');
      const memos = await res.json();
      return memos.map(m => ({
        id: m.id,
        title: m.title,
        content: m.content,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }));
    } catch (err) {
      console.error('getMemos failed:', err);
      return [];
    }
  },

  async saveMemo(memo) {
    try {
      const payload = {
        id: memo.id,
        title: memo.title || '',
        content: memo.content || '',
        updated_at: new Date().toISOString()
      };
      
      const url = `${MEMO_API_BASE}?on_conflict=id`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        // PostgreSQL (PostgREST) の UPSERT は配列形式で送るのが標準
        body: JSON.stringify([payload])
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Supabase UPSERT Error: ${res.status} ${res.statusText}`, errorText);
        console.error('URL:', url);
        console.error('Payload:', payload);
        throw new Error(`Supabase Upsert Error: ${res.status} ${errorText}`);
      }
    } catch (err) {
      console.error('saveMemo failed:', err);
      throw err;
    }
  },

  async deleteMemo(memoId) {
    try {
      const res = await fetch(`${MEMO_API_BASE}?id=eq.${encodeURIComponent(memoId)}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      if (!res.ok) throw new Error('Supabase Delete Error');
    } catch (err) {
      console.error('deleteMemo failed:', err);
      throw err;
    }
  }
};

export default StorageManager;
export { uploadImageToSupabase };
