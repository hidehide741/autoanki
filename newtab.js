import StorageManager from './storage.js';
import { renderFieldHtml as _renderFieldHtml, escapeHtml } from './renderCard.js';

let currentCard = null;
let answerShown = false;
let isProcessing = false; // 二重送信防止用
let isInitialLoad = true;  // 初回ページロードかどうか（Googleリダイレクト後は false）
let cachedCardTypes = null;  // カード型キャッシュ
let activeTimers = [];    // アクティブなタイマー

// DOM要素（DOMContentLoaded後に init() で初期化）
let el = {};

// 初期化
async function init() {
  // DOMContentLoaded後にDOM要素を取得（必ず要素が存在する状態で参照する）
  el = {
    cardContainer: document.getElementById('card-container'),
    doneContainer: document.getElementById('done-container'),
    answerSection: document.getElementById('answer-section'),
    showAnswerBtn: document.getElementById('show-answer-btn'),
    ratingButtons: document.querySelectorAll('.rating-btn'),
    skipBtn:       document.getElementById('skip-btn'),
    todayCount:    document.getElementById('today-count'),
    streakCount:   document.getElementById('streak-count'),
    cardTypeBadge:   document.getElementById('cardtype-badge'),
    progressBar:   document.getElementById('progress-bar'),
    doneToday:     document.getElementById('done-today'),
    doneStreak:    document.getElementById('done-streak'),
    questionArea:    document.getElementById('question-area'),
    answerArea:      document.getElementById('answer-area'),
    emptyContainer:  document.getElementById('empty-container'),
    errorContainer:  document.getElementById('error-container'),
    errorMessage:    document.getElementById('error-message'),
    cardCounter:     document.getElementById('card-counter'),
    nextBtn:         document.getElementById('next-btn'),
    categoryFilter:   document.getElementById('category-filter'),
    settingsPanel:   document.getElementById('quiz-settings-panel'),
    settingsBtn:     document.getElementById('quiz-settings-btn'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
  };
  await updateStats();
  await initCategoryFilter();
  await initQuizSettings();
  await loadNextCard();
  setupEventListeners();
}

async function updateStats() {
  const stats = await StorageManager.getStats();
  if (el.todayCount)  el.todayCount.textContent = stats.todayReviews;
  if (el.streakCount) el.streakCount.textContent = stats.streak;
}

// ===== カテゴリフィルターチップ =====
async function initCategoryFilter() {
  if (!el.categoryFilter) return;
  const categories = await StorageManager.getDistinctCategories();
  const qs = await StorageManager.getQuizSettings();
  const selected = qs.categoryFilter || [];

  el.categoryFilter.innerHTML = '';

  // 「すべて」チップ
  const allChip = document.createElement('button');
  allChip.className = 'category-chip' + (selected.length === 0 ? ' active' : '');
  allChip.textContent = 'すべて';
  allChip.addEventListener('click', () => selectCategory(null));
  el.categoryFilter.appendChild(allChip);

  categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'category-chip' + (selected.includes(cat) ? ' active' : '');
    chip.textContent = cat;
    chip.addEventListener('click', () => selectCategory(cat));
    el.categoryFilter.appendChild(chip);
  });
}

async function selectCategory(categoryName) {
  const qs = await StorageManager.getQuizSettings();
  let selected = Array.isArray(qs.categoryFilter) ? [...qs.categoryFilter] : [];

  if (categoryName === null) {
    // 「すべて」を選択 → フィルタークリア
    selected = null;
  } else {
    // トグル: 既に選択済みなら除外、未選択なら追加
    const idx = selected.indexOf(categoryName);
    if (idx >= 0) {
      selected.splice(idx, 1);
      if (selected.length === 0) selected = null;
    } else {
      selected.push(categoryName);
    }
  }

  qs.categoryFilter = selected;
  await StorageManager.saveQuizSettings(qs);

  // チップUI更新
  el.categoryFilter.querySelectorAll('.category-chip').forEach((chip, i) => {
    if (i === 0) {
      chip.classList.toggle('active', !selected || selected.length === 0);
    } else {
      chip.classList.toggle('active', Array.isArray(selected) && selected.includes(chip.textContent));
    }
  });

  // 次のカードをリロード
  await loadNextCard();
  updateCardCounter();
}

// ===== 出題設定パネル =====
async function initQuizSettings() {
  const qs = await StorageManager.getQuizSettings();
  const hideMastered = document.getElementById('setting-hide-mastered');
  const newFirst     = document.getElementById('setting-new-first');
  const order        = document.getElementById('setting-order');
  const cooldown     = document.getElementById('setting-cooldown');

  if (hideMastered) hideMastered.checked = qs.hideMastered;
  if (newFirst)     newFirst.checked     = qs.newFirst;
  if (order)        order.value          = qs.order;
  if (cooldown)     cooldown.value       = String(qs.cooldown);

  // 変更時に即保存 + リロード
  const onSettingChange = async () => {
    const updated = {
      hideMastered: hideMastered?.checked || false,
      newFirst:     newFirst?.checked     || false,
      order:        order?.value          || 'due',
      cooldown:     parseInt(cooldown?.value || '15', 10),
      categoryFilter:  (await StorageManager.getQuizSettings()).categoryFilter
    };
    await StorageManager.saveQuizSettings(updated);
    await loadNextCard();
    updateCardCounter();
  };

  [hideMastered, newFirst, order, cooldown].forEach(input => {
    if (input) input.addEventListener('change', onSettingChange);
  });

  // パネル開閉
  if (el.settingsBtn) {
    el.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      el.settingsPanel.classList.toggle('hidden');
    });
  }
  if (el.settingsCloseBtn) {
    el.settingsCloseBtn.addEventListener('click', () => {
      el.settingsPanel.classList.add('hidden');
    });
  }
  // パネル外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (el.settingsPanel && !el.settingsPanel.classList.contains('hidden')) {
      if (!el.settingsPanel.contains(e.target) && e.target !== el.settingsBtn) {
        el.settingsPanel.classList.add('hidden');
      }
    }
  });
}

// カードの読み込み
async function loadNextCard() {
  // 初回ロード時のみ Googleリダイレクトを許可（評価・スキップ後の再呼び出しではリダイレクトしない）
  const isActualNewTab = StorageManager.isExtension && !document.referrer && isInitialLoad;
  isInitialLoad = false;

  try {
    const result = await StorageManager.getDueCardOrStatus();
    
    if (result.status === 'empty') {
      if (isActualNewTab) {
        // 新規タブのみ: 1回だけ「問題なし」表示、2回目以降はGoogle
        const alreadyNotified = await StorageManager.getEmptyNotified();
        if (alreadyNotified) {
          window.location.replace('https://www.google.com/');
          return;
        }
        await StorageManager.setEmptyNotified(true);
      }
      showEmptyMode();
      isProcessing = false;
      return;
    }

    if (result.status === 'cooldown') {
      if (isActualNewTab) {
        // 新規タブのみ: 15分クールタイム中はGoogle
        window.location.replace('https://www.google.com/');
        return;
      } else {
        const remainMs = await StorageManager.getCooldownRemainingMs();
        showCooldownMode(remainMs);
      }
      isProcessing = false;
      return;
    }

    currentCard = result.card;
    
    if (currentCard) {
      // dueカードあり → emptyNotifiedをリセット（次にemptyになったとき再度通知する）
      if (StorageManager.isExtension) {
        await StorageManager.setEmptyNotified(false);
      }
      const cardTypes = cachedCardTypes || (cachedCardTypes = await StorageManager.getCardTypes());
      let cardTypeDef = cardTypes.find(g => g.id === currentCard.cardType);
      // カード型のフィールドラベルがデータと合致しない場合はフォールバック
      if (cardTypeDef) {
        const textQFields = cardTypeDef.fields.filter(f => f.role === 'question' && f.type !== 'static' && f.type !== 'image');
        if (textQFields.length > 0 && !textQFields.some(f => (currentCard.question || '').includes(`[${f.label}]`))) {
          cardTypeDef = null;
        }
      }
      
      showQuestionMode(cardTypeDef);
      updateRatingLabels();
      updateLearningStage();
      updateCardCounter();
      
      // カード型バッジ（型名は表示しない）
      if (el.cardTypeBadge) {
        el.cardTypeBadge.classList.add('hidden');
      }

      // アニメーションのリセット
      el.cardContainer.classList.remove('hidden', 'fade-out');
      el.doneContainer.classList.add('hidden');
      if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
      if (el.errorContainer) el.errorContainer.classList.add('hidden');
      el.cardContainer.style.animation = 'none';
      setTimeout(() => {
        el.cardContainer.style.animation = 'floatIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        isProcessing = false;
      }, 10);
    } else {
      showDoneMode();
      isProcessing = false;
    }
  } catch (err) {
    console.error('loadNextCard Failed:', err);
    showErrorMode(err.message);
    isProcessing = false;
  }
}

// rawテキストから最初のセクション内容を抽出（ラベル・タグを除去）
function extractFirstSectionContent(raw) {
  let cleaned = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // [__tags__] セクション除去
  cleaned = cleaned.replace(/\n\n\[__tags__\]\n[\s\S]*$/, '');
  // [ラベル]\n形式のセクション区切りがある場合、最初のセクション内容を返す
  const m = cleaned.match(/^\[.*?\]\n([\s\S]*?)(?:\n\n\[|$)/);
  if (m) return m[1].trim();
  // セクション形式でなければそのまま返す
  return cleaned.trim();
}

function showQuestionMode(cardTypeDef) {
  answerShown = false;
  el.answerSection.classList.add('hidden');
  el.showAnswerBtn.classList.remove('hidden');

  // 前回のタイマーをクリア
  activeTimers.forEach(id => clearInterval(id));
  activeTimers = [];

  const defaultFields = [
    { key: 'question', label: '問題', type: 'textarea', role: 'question' },
    { key: 'answer',   label: '答え', type: 'textarea', role: 'answer' }
  ];
  const fields = (cardTypeDef?.fields?.length) ? cardTypeDef.fields : defaultFields;

  // 画像データのパース
  let images = [];
  if (currentCard.image) {
    try {
      const parsed = JSON.parse(currentCard.image);
      images = Array.isArray(parsed) ? parsed : [{ url: currentCard.image, role: 'question' }];
      if (images.length > 0 && typeof images[0] === 'string') {
        images = images.map(url => ({ url, role: 'question' }));
      }
    } catch {
      images = [{ url: currentCard.image, role: 'question' }];
    }
  }

  // rawContent から [ラベル]\n値 形式で値を取得
  // 同一ラベルが複数存在する場合（例: static見出し + textarea内容）も正しく処理するため
  // 「消費済みインデックス」を追跡し、次のフィールドは次の出現を使う
  const consumedQPos = new Set();
  const consumedAPos = new Set();

  function getFieldValue(field) {
    // static フィールドはジャンル定義のラベルをそのまま表示（保存データ不要）
    if (field.type === 'static') {
      // 旧データに [ラベル]\nラベル 形式で保存されている場合のみ消費（新カードはstatic未保存）
      const raw2 = (field.role === 'question' ? currentCard.question : currentCard.answer) || '';
      const rc2 = raw2.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const ss2 = `[${field.label}]\n`;
      const consumedSet2 = field.role === 'question' ? consumedQPos : consumedAPos;
      let sf2 = 0;
      while (true) {
        const si2 = rc2.indexOf(ss2, sf2);
        if (si2 === -1) break;
        if (!consumedSet2.has(si2)) {
          // そのセクションの内容がラベル自身と一致する場合のみ消費（旧static保存データ）
          const cs2 = si2 + ss2.length;
          const ni2 = rc2.indexOf('\n\n[', cs2);
          const content2 = (ni2 !== -1 ? rc2.substring(cs2, ni2) : rc2.substring(cs2)).trim();
          if (content2 === field.label) {
            consumedSet2.add(si2);
          }
          break;
        }
        sf2 = si2 + 1;
      }
      return field.label;
    }

    const raw = (field.role === 'question' ? currentCard.question : currentCard.answer) || '';
    const rawContent = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const searchStr = `[${field.label}]\n`;
    const consumedPos = field.role === 'question' ? consumedQPos : consumedAPos;

    let searchFrom = 0;
    while (true) {
      const startIdx = rawContent.indexOf(searchStr, searchFrom);
      if (startIdx === -1) break;
      if (!consumedPos.has(startIdx)) {
        consumedPos.add(startIdx);
        const contentStart = startIdx + searchStr.length;
        // [__tags__] や次の [ セクション手前まで
        const nextIdx = rawContent.indexOf('\n\n[', contentStart);
        return (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
      }
      searchFrom = startIdx + 1;
    }
    // ラベル不一致でも raw テキストからコンテンツを救出する
    if (consumedPos.size === 0 && rawContent) {
      return extractFirstSectionContent(rawContent);
    }
    return '';
  }

  // カテゴリタグを question テキストから抽出してバッジエリアに表示
  const tagsMatch = /\[__tags__\]\n([\s\S]*)$/.exec((currentCard.question || '').replace(/\r\n/g, '\n'));
  const categoryTags = tagsMatch ? tagsMatch[1].trim().split(',').map(t => t.trim()).filter(Boolean) : [];
  const catBadgeArea = document.getElementById('category-badge-area');
  if (catBadgeArea) {
    catBadgeArea.innerHTML = categoryTags.map(tag =>
      `<span style="display:inline-block;background:rgba(20,184,166,0.18);border:1px solid rgba(20,184,166,0.35);color:#14b8a6;padding:0.1rem 0.55rem;border-radius:12px;font-size:0.72rem;font-weight:600;">${tag.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])}</span>`
    ).join('');
    catBadgeArea.style.display = categoryTags.length ? 'flex' : 'none';
  }

  // options.js のプレビューと完全同一のロジックで描画（renderCard.js 共通関数を使用）
  function renderFieldHtml(f, isQuestion) {
    const imageList = images.filter(img => img.fieldKey ? img.fieldKey === f.key : img.role === f.role);
    return _renderFieldHtml(f, isQuestion, getFieldValue, imageList);
  }

  // 問題側の選択肢を答え面に表示する時は answer テキストから値を取得する
  // （保存時に choice フィールドは qParts と aParts の両方に書き込まれるため）
  function getChoiceAnswerValue(field) {
    const raw = (currentCard.answer || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const searchStr = `[${field.label}]\n`;
    let searchFrom = 0;
    while (true) {
      const startIdx = raw.indexOf(searchStr, searchFrom);
      if (startIdx === -1) break;
      if (!consumedAPos.has(startIdx)) {
        consumedAPos.add(startIdx);
        const contentStart = startIdx + searchStr.length;
        const nextIdx = raw.indexOf('\n\n[', contentStart);
        return (nextIdx !== -1 ? raw.substring(contentStart, nextIdx) : raw.substring(contentStart)).trim();
      }
      searchFrom = startIdx + 1;
    }
    return '';
  }

  // プレビューと同じ構造でレンダリング
  const qFields = fields.filter(f => f.role === 'question');
  const aFields = fields.filter(f => f.role === 'answer');
  // 問題側の選択肢フィールドを答え側にも自動反映（○×表示）
  const qChoiceFields = qFields.filter(f => f.type === 'choice_multi' || f.type === 'choice_single');

  el.questionArea.innerHTML = qFields.map(f => renderFieldHtml(f, true)).join('');

  // 安全策: フィールドレンダリングで何も表示されなかった場合、raw テキストを直接表示
  if (!el.questionArea.textContent.trim() && currentCard.question) {
    const raw = extractFirstSectionContent(currentCard.question);
    if (raw) {
      el.questionArea.innerHTML = `<p style="font-size:1.1rem;line-height:1.55;background:linear-gradient(135deg,#f1f5f9,#cbd5e1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;white-space:pre-wrap;margin-bottom:0.75rem;display:block;">${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
    }
  }

  el.answerArea.innerHTML   = aFields.map(f => renderFieldHtml(f, false)).join('') +
                               qChoiceFields.map(f => {
                                 const imageList = images.filter(img => img.fieldKey ? img.fieldKey === f.key : img.role === f.role);
                                 return _renderFieldHtml(f, false, getChoiceAnswerValue, imageList);
                               }).join('');

  // 安全策: 答えエリアも空なら raw テキストを表示
  if (!el.answerArea.textContent.trim() && currentCard.answer) {
    const raw = extractFirstSectionContent(currentCard.answer);
    if (raw) {
      el.answerArea.innerHTML = `<p style="font-size:1rem;font-weight:600;color:#a78bfa;line-height:1.5;white-space:pre-wrap;margin-bottom:0.75rem;display:block;">${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
    }
  }

  // F6: タイマーカウントダウン開始
  el.questionArea.querySelectorAll('.timer-field').forEach(timerEl => {
    let sec = parseInt(timerEl.dataset.seconds, 10) || 30;
    const display = timerEl.querySelector('.timer-display');
    if (!display) return;
    const id = setInterval(() => {
      sec--;
      if (sec <= 0) {
        clearInterval(id);
        display.textContent = 'タイムアップ！';
        timerEl.style.borderColor = '#ef4444';
        timerEl.style.background = 'rgba(239,68,68,0.2)';
      } else {
        display.textContent = `${sec}秒`;
      }
    }, 1000);
    activeTimers.push(id);
  });
}

// インターバルを人間が読める文字列に変換
function formatInterval(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分`;
  const hr = Math.round(ms / 3600000);
  if (hr < 24) return `${hr}時間`;
  const day = Math.round(ms / 86400000);
  if (day < 30) return `${day}日`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}ヶ月`;
  const year = (day / 365).toFixed(1);
  return `${year}年`;
}

// 各評価ボタンに「次回までの間隔」を動的表示（「覚えていた」のみ更新）
function updateRatingLabels() {
  if (!currentCard) return;
  const intervals = StorageManager.simulateIntervals(currentCard);
  // quality=4（覚えていた）の次回インターバルのみ表示する
  const sub = document.querySelector(`.rating-btn[data-quality="4"] .sub[data-quality="4"]`);
  if (sub) sub.textContent = formatInterval(intervals[4]);
}

// カードの学習ステージを表示（New / Learning / Review / Mature）
function updateLearningStage() {
  const stageEl = document.getElementById('learning-stage');
  if (!stageEl || !currentCard) return;

  const rep = currentCard.repetition || 0;
  const intervalDays = (currentCard.interval || 0) / 86400000;

  let label, className;
  if (rep === 0) {
    label = '🆕 はじめて';
    className = 'stage-new';
  } else if (rep <= 2) {
    label = '📖 学習中';
    className = 'stage-learning';
  } else if (intervalDays < 21) {
    label = '🔄 復習';
    className = 'stage-review';
  } else {
    label = '✅ 定着';
    className = 'stage-mature';
  }

  stageEl.textContent = label;
  stageEl.className = 'learning-stage ' + className;
}

// 残りカード数を表示
async function updateCardCounter() {
  if (!el.cardCounter) return;
  const count = await StorageManager.getDueCount();
  el.cardCounter.textContent = count != null ? count : '—';
}

function showAnswerMode() {
  if (isProcessing) return;
  answerShown = true;
  el.showAnswerBtn.classList.add('hidden');
  el.answerSection.classList.remove('hidden');
}

function showDoneMode() {
  el.cardContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.add('hidden');
  el.doneContainer.classList.remove('hidden');
  if (el.doneToday)  el.doneToday.textContent  = el.todayCount?.textContent  || '0';
  if (el.doneStreak) el.doneStreak.textContent = el.streakCount?.textContent || '0';
}

function showEmptyMode() {
  el.cardContainer.classList.add('hidden');
  el.doneContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.remove('hidden');
}

function showErrorMode(msg = '') {
  el.cardContainer.classList.add('hidden');
  el.doneContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.remove('hidden');
  if (el.errorMessage && msg) el.errorMessage.textContent = msg;
}

function showCooldownMode(remainMs) {
  const mins = Math.max(1, Math.ceil(remainMs / 60000));
  el.cardContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.add('hidden');
  el.doneContainer.classList.remove('hidden');
  if (el.doneToday)  el.doneToday.textContent  = el.todayCount?.textContent  || '0';
  if (el.doneStreak) el.doneStreak.textContent = el.streakCount?.textContent || '0';
  // cooldown 残り時間を表示
  const existing = el.doneContainer.querySelector('.cooldown-notice');
  const text = `⏳ 次の問題まで約 ${mins} 分`;
  if (!existing) {
    const notice = document.createElement('p');
    notice.className = 'cooldown-notice';
    notice.style.cssText = 'font-size:0.9rem;opacity:0.7;margin-top:0.75rem;';
    notice.textContent = text;
    el.doneContainer.appendChild(notice);
  } else {
    existing.textContent = text;
  }
}

async function handleRating(quality) {
  if (!currentCard || isProcessing) return;
  isProcessing = true;

  el.cardContainer.classList.add('fade-out');
  
  try {
    await StorageManager.updateCard(currentCard.id, parseInt(quality, 10));
    await updateStats();
    setTimeout(async () => {
      await loadNextCard();
    }, 300);
  } catch (err) {
    console.error('handleRating Failed:', err);
    isProcessing = false;
  }
}

function setupEventListeners() {
  el.showAnswerBtn.addEventListener('click', showAnswerMode);

  el.ratingButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleRating(btn.getAttribute('data-quality'));
    });
  });

  el.skipBtn.addEventListener('click', async () => {
    if (isProcessing) return;
    isProcessing = true;
    
    if(!el.cardContainer.classList.contains('hidden')) {
      el.cardContainer.classList.add('fade-out');
      await StorageManager.updateLastAnswerTime();
      setTimeout(async () => {
        await loadNextCard();
      }, 300);
    } else {
      await loadNextCard();
    }
  });

  // 次の問題へ進む（評価せずにスキップ）
  if (el.nextBtn) {
    el.nextBtn.addEventListener('click', async () => {
      if (isProcessing) return;
      isProcessing = true;
      el.cardContainer.classList.add('fade-out');
      await StorageManager.updateLastAnswerTime();
      setTimeout(async () => {
        await loadNextCard();
      }, 300);
    });
  }

  // エラー画面の再読み込みボタン（onclick属性は使えないためここで登録）
  const reloadBtn = document.getElementById('reload-btn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());

  document.addEventListener('keydown', (e) => {
    if (el.cardContainer.classList.contains('hidden') || isProcessing) return;
    
    if (e.key === 'Escape') {
      el.skipBtn.click();
      return;
    }

    if (!answerShown) {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        showAnswerMode();
      }
    } else {
      // 2択キーボードショートカット: Space/Enter/2=覚えていた、1=覚えていなかった
      if (e.key === '1') {
        e.preventDefault();
        handleRating('1'); // 覚えていなかった
      } else if (e.key === '2' || e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleRating('4'); // 覚えていた
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
