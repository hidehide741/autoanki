// storage.js
// 忘却曲線アルゴリズムとデータのCRUD操作を担当
// ※ Supabase クラウド DB を使用します
const SUPABASE_URL = 'https://qahkvamgssedhjvtlika.supabase.co';
const SUPABASE_KEY = 'sb_publishable_g3U08ZrJjKyXaeaEuPeuaQ_SNoUxyVg';
const API_BASE = `${SUPABASE_URL}/rest/v1/cards`;

const isExtension = typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id && window.location.protocol.startsWith('chrome-extension');
const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`
};

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

  // カードを個別に更新 (Supabase REST APIのPATCHを使用)
  async saveCardUpdate(card) {
    try {
      await fetch(`${API_BASE}?id=eq.${card.id}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({
          question: card.question,
          answer: card.answer,
          image: card.image,
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
        streak: 0
      });
    }
  },

  // 今日復習すべきカードを1件取得（なければnull）
  // 状態（クールダウン中か、単にカードがないか）を付与して返す
  async getDueCardOrStatus() {
    const cards = await this.getAllCards();
    if (cards.length === 0) return { status: 'empty', card: null };

    // ======= WEBアプリ版（URLからのアクセス）の場合 =======
    // 忘却曲線の時間制限や15分クールダウンを完全に無視し、常に問題を出す（ランダム出題）
    if (!this.isExtension) {
      const randomCard = cards[Math.floor(Math.random() * cards.length)];
      return { status: 'due', card: randomCard };
    }

    // ======= Chrome拡張機能（新しいタブ）の場合 =======
    // 従来の厳しい制限（15分クールダウン ＆ Spaced Repetition）を適用する
    const lastAnswerTime = await LocalStore.get('lastAnswerTime');
    const now = Date.now();
    
    // 15分（15 * 60 * 1000 ミリ秒）経過しているかチェック
    if (lastAnswerTime && (now - lastAnswerTime < 15 * 60 * 1000)) {
      return { status: 'cooldown', card: null };
    }

    const dueCards = cards.filter(c => c.nextReviewDate <= now);
    if (dueCards.length === 0) return { status: 'empty', card: null };

    // 最も古い（期限が過ぎている）ものを1つ返す
    dueCards.sort((a, b) => a.nextReviewDate - b.nextReviewDate);
    return { status: 'due', card: dueCards[0] };
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

    const todayString = new Date().toDateString();
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
    
    await LocalStore.set('stats', stats);
  },

  // 統計情報取得（ストレージから）
  async getStats() {
    const stats = await LocalStore.get('stats');
    return stats || { todayReviews: 0, streak: 0 };
  },

  // カード管理用メソッド（追加・削除）-> Dドライブのサーバーへ
  async addCard(question, answer, imagePath = null) {
    const cards = await this.getAllCards();
    const newCard = {
      id: 'card-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      question,
      answer,
      nextReviewDate: Date.now(),
      interval: 0,
      repetition: 0,
      easiness: 2.5
    };
    
    if (imagePath) {
      newCard.image = imagePath;
    }

    // Supabaseヘ挿入
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
          easiness: newCard.easiness
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
  },

  // サーバーを遠隔停止させる
  async shutdownServer() {
    try {
      await fetch(API_BASE.replace('/cards', '/shutdown'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return true;
    } catch (e) {
      console.error("シャットダウンに失敗しました。", e);
      return false;
    }
  }
};

export default StorageManager;
