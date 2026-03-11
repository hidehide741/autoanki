// storage.js
// 忘却曲線アルゴリズムとデータのCRUD操作を担当
// ※ Supabase クラウド DB を使用します
const SUPABASE_URL = 'https://qahkvamgssedhjvtlika.supabase.co';
const SUPABASE_KEY = 'sb_publishable_g3U08ZrJjKyXaeaEuPeuaQ_SNoUxyVg';
const API_BASE = `${SUPABASE_URL}/rest/v1/cards`;
const GENRE_API_BASE = `${SUPABASE_URL}/rest/v1/genres`;

// デフォルトジャンル定義
const DEFAULT_GENRES = [
  {
    id: 'language', name: '🌐 語学', isDefault: true,
    fields: [
      { key: 'question', label: '単語・フレーズ', type: 'textarea', required: true },
      { key: 'answer',   label: '意味（日本語）', type: 'textarea', required: true },
      { key: 'example',  label: '例文',             type: 'textarea' },
      { key: 'note',     label: '補足（発音・品詞など）', type: 'text' },
      { key: 'image',    label: '画像',             type: 'image' }
    ]
  },
  {
    id: 'science', name: '🔬 理科', isDefault: true,
    fields: [
      { key: 'question', label: '用語・概念名', type: 'textarea', required: true },
      { key: 'answer',   label: '定義・説明',   type: 'textarea', required: true },
      { key: 'note',     label: '仕組み・機能', type: 'textarea' },
      { key: 'image',    label: '画像',         type: 'image' }
    ]
  },
  {
    id: 'math', name: '📐 数学', isDefault: true,
    fields: [
      { key: 'question', label: '概念・定理名', type: 'textarea', required: true },
      { key: 'answer',   label: '公式・定義',   type: 'textarea', required: true },
      { key: 'example',  label: '例題',         type: 'textarea' },
      { key: 'note',     label: '注意点・記憶術', type: 'text' }
    ]
  },
  {
    id: 'history', name: '📅 歴史', isDefault: true,
    fields: [
      { key: 'question', label: '出来事・人名', type: 'textarea', required: true },
      { key: 'answer',   label: '内容・説明',   type: 'textarea', required: true },
      { key: 'note',     label: '年号・時代',   type: 'text' },
      { key: 'image',    label: '画像',         type: 'image' }
    ]
  },
  {
    id: 'other', name: '📝 その他', isDefault: true,
    fields: [
      { key: 'question', label: '問題', type: 'textarea', required: true },
      { key: 'answer',   label: '答え', type: 'textarea', required: true },
      { key: 'image',    label: '画像', type: 'image' }
    ]
  }
];


const isExtension = typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id && window.location.protocol.startsWith('chrome-extension');
const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

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

const StorageManager = {
  isExtension: isExtension,
  
  // URLのベース（画像表示用など）を取得する
  getBaseUrl() {
    // 画像がURL形式ならそのまま、相対パスならSupabaseなどを考慮（今回は一旦そのまま）
    return '';
  },

  // ========== ジャンル管理 (Supabase 同期) ==========
  async getGenres() {
    try {
      // 1. Supabase からジャンル一覧を取得
      const res = await fetch(`${GENRE_API_BASE}?select=*&order=created_at.asc`, { headers: HEADERS });
      if (!res.ok) throw new Error('Supabase Fetch Error');
      const cloudGenres = await res.json();

      // DB形式 (snake_case) から Object形式 (isDefault, etc) へ変換
      const mappedCloud = cloudGenres.map(g => ({
        id: g.id,
        name: g.name,
        isDefault: g.is_default,
        fields: g.fields,
        createdAt: g.created_at
      }));

      // 最初の起動時などでクラウドが空の場合、ローカルから移行を試みる
      if (cloudGenres.length === 0) {
        const localSaved = await LocalStore.get('genres');
        const initialToSave = (localSaved && localSaved.length > 0) ? localSaved : DEFAULT_GENRES;
        
        console.log('Initializing cloud genres...');
        await this.saveGenres(initialToSave);
        return initialToSave;
      }

      // ローカルキャッシュも更新
      await LocalStore.set('genres', mappedCloud);
      return mappedCloud;
    } catch (err) {
      console.error('getGenres failed, falling back to local storage:', err);
      const local = await LocalStore.get('genres');
      return local || DEFAULT_GENRES;
    }
  },

  async saveGenres(genres) {
    try {
      // 1. 各ジャンルをバッチでアップサート (Upsert)
      // Supabase REST API では、POST + Prefer: resolution=merge-duplicates でアップサート
      const payloads = genres.map(g => ({
        id: g.id,
        name: g.name,
        is_default: !!g.isDefault,
        fields: g.fields
      }));

      const res = await fetch(GENRE_API_BASE, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payloads)
      });

      if (!res.ok) throw new Error('Supabase Upsert Error');

      // ローカル保存（バックアップ兼キャッシュ）
      await LocalStore.set('genres', genres);
    } catch (err) {
      console.error('saveGenres failed:', err);
      // 通信エラーでも利便性のためにローカルには保存
      await LocalStore.set('genres', genres);
    }
  },

  async deleteGenre(genreId) {
    try {
      const res = await fetch(`${GENRE_API_BASE}?id=eq.${genreId}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      if (!res.ok) throw new Error('Supabase Delete Error');
    } catch (err) {
      console.error('deleteGenre failed:', err);
    }
  },
  // ==================================

  // サーバーから全カードを取得
  async getAllCards() {
    try {
      const res = await fetch(`${API_BASE}?select=*`, { headers: HEADERS });
      if (!res.ok) throw new Error('Supabase API Error');
      const cards = await res.json();
      // DBのカラム名(snake_case)をJSのオブジェクト名(camelCase)にマッピング
      return cards.map(c => ({
        id: c.id,
        question: c.question,
        answer: c.answer,
        image: c.image,
        genre: c.genre,
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
    try {
      await fetch(`${API_BASE}?id=eq.${card.id}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({
          question: card.question,
          answer: card.answer,
          image: card.image,
          genre: card.genre,
          next_review_date: card.nextReviewDate,
          interval: card.interval,
          repetition: card.repetition,
          easiness: card.easiness
        })
      });
    } catch (e) {
      console.error("クラウドへのデータ保存に失敗しました。", e);
    }
  },

  // カードを新規追加 (Supabase REST API の POST を使用)
  async addCard(question, answer, image = null, genre = 'other') {
    const now = Date.now();
    const id = 'card-' + now + '-' + Math.random().toString(36).substr(2, 6);
    const body = {
      id,
      question,
      answer,
      image,
      genre,
      next_review_date: now,          // 今すぐ出題
      interval:         86400000,     // 初期インターバル 1日
      repetition:       0,
      easiness:         2.5
    };
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'return=representation' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`カード追加失敗: ${err}`);
      }
      return await res.json();
    } catch (e) {
      console.error("カードの追加に失敗しました。", e);
      throw e;
    }
  },


  // インストール時の初期処理（統計のみブラウザに残す）
  async initDemoData() {
    await this.initStats();
  },

  async initStats() {
    const stats = await LocalStore.get('stats');
    if (!stats) {
      await LocalStore.set('stats', {
        todayReviews: 0,
        lastReviewDate: new Date().toDateString(),
        streak: 0,
        history: {} // 日別レビュー数を記録: { 'YYYY-MM-DD': count }
      });
    } else if (!stats.history) {
      stats.history = {};
      await LocalStore.set('stats', stats);
    }
  },

  // 今日復習すべきカードを1件取得（なければnull）
  async getDueCardOrStatus() {
    const now = Date.now();

    // ======= WEBアプリ版（URLからのアクセス）の場合：ランダム出題 =======
    if (!this.isExtension) {
      try {
        // 全件からランダムに1件取得するのはクエリで書くと複雑（かつ重い）ため、
        // Web版では以前の「一旦全て取って計算」を許容するか、あるいは「最近追加されたものからランダム」などで妥協する。
        // ここでは、直近に追加された100件からランダムに選ぶことで負荷を抑える。
        const res = await fetch(`${API_BASE}?select=*&limit=100&order=id.desc`, { headers: HEADERS });
        if (!res.ok) throw new Error('Fetch Error');
        const cards = await res.json();
        if (cards.length === 0) return { status: 'empty', card: null };
        const mapped = cards.map(c => ({
          id: c.id, question: c.question, answer: c.answer, image: c.image, genre: c.genre,
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
    const lastAnswerTime = await LocalStore.get('lastAnswerTime');
    if (lastAnswerTime && (now - lastAnswerTime < 15 * 60 * 1000)) {
      return { status: 'cooldown', card: null };
    }

    try {
      // 期限切れ(next_review_date <= now) のものを1つだけ取得
      const res = await fetch(`${API_BASE}?select=*&next_review_date=lte.${now}&order=next_review_date.asc&limit=1`, { headers: HEADERS });
      if (!res.ok) throw new Error('Fetch Error');
      const cards = await res.json();
      if (cards.length === 0) return { status: 'empty', card: null };

      const c = cards[0];
      const card = {
        id: c.id, question: c.question, answer: c.answer, image: c.image, genre: c.genre,
        nextReviewDate: parseInt(c.next_review_date, 10), interval: parseInt(c.interval, 10),
        repetition: c.repetition, easiness: c.easiness
      };
      return { status: 'due', card: card };
    } catch (e) {
      console.error(e);
      return { status: 'empty', card: null };
    }
  },

  // カードの学習結果を記録し、次の復習日時を計算 (SM-2類似アルゴリズム)
  async updateCard(cardId, quality) {
    const cards = await this.getAllCards();
    const cardIndex = cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = cards[cardIndex];

    if (quality < 3) {
      // 忘れていた場合、リセット
      card.repetition = 0;
      card.interval = 0.5 * 24 * 60 * 60 * 1000; // 12時間後
    } else {
      if (card.repetition === 0) {
        card.interval = 1 * 24 * 60 * 60 * 1000; // 1日後
      } else if (card.repetition === 1) {
        card.interval = 3 * 24 * 60 * 60 * 1000; // 3日後
      } else {
        card.interval = Math.round(card.interval * card.easiness);
      }
      card.repetition += 1;
    }

    // Easiness factorの更新
    card.easiness = card.easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (card.easiness < 1.3) card.easiness = 1.3;

    card.nextReviewDate = Date.now() + card.interval;

    // サーバーに個別保存
    await this.saveCardUpdate(card);

    // lastAnswerTime をブラウザに記録して次回出題を15分後に制限する
    await LocalStore.set('lastAnswerTime', Date.now());
    
    // Statsの更新
    await this.incrementStats();
  },

  async updateLastAnswerTime() {
    await LocalStore.set('lastAnswerTime', Date.now());
  },

  async incrementStats() {
    let stats = await LocalStore.get('stats');
    if (!stats) return;

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
    
    await LocalStore.set('stats', stats);
  },

  // 統計情報取得（ストレージから）
  async getStats() {
    const stats = await LocalStore.get('stats');
    return stats || { todayReviews: 0, streak: 0 };
  },

  // カード管理用メソッド（追加・削除）-> Supabaseへ
  async addCard(question, answer, imagePath = null, genre = 'その他', extraFields = {}) {
    const newCard = {
      id: 'card-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      question,
      answer,
      nextReviewDate: Date.now(),
      interval: 0,
      repetition: 0,
      easiness: 2.5,
      genre
    };
    
    if (imagePath) {
      newCard.image = imagePath;
    }

    // Supabaseへ挿入
    try {
      await fetch(API_BASE, {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          id: newCard.id,
          question: newCard.question,
          answer: newCard.answer,
          image: newCard.image,
          next_review_date: newCard.nextReviewDate,
          interval: newCard.interval,
          repetition: newCard.repetition,
          easiness: newCard.easiness,
          genre: newCard.genre
        })
      });
    } catch (e) {
      console.error("カードの追加に失敗しました。", e);
    }
  },

  async deleteCard(cardId) {
    try {
      await fetch(`${API_BASE}?id=eq.${cardId}`, {
        method: 'DELETE',
        headers: HEADERS
      });
    } catch (e) {
      console.error("カードの削除に失敗しました。", e);
    }
  }
};

export default StorageManager;
export { uploadImageToSupabase };
