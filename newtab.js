import StorageManager from './storage.js';

let currentCard = null;
let answerShown = false;
let isProcessing = false; // 二重送信防止用

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
    optionsBtn:    document.getElementById('options-btn'),
    todayCount:    document.getElementById('today-count'),
    streakCount:   document.getElementById('streak-count'),
    genreBadge:    document.getElementById('genre-badge'),
    progressBar:   document.getElementById('progress-bar'),
    doneToday:     document.getElementById('done-today'),
    doneStreak:    document.getElementById('done-streak'),
    questionArea:    document.getElementById('question-area'),
    answerArea:      document.getElementById('answer-area'),
    emptyContainer:  document.getElementById('empty-container'),
    errorContainer:  document.getElementById('error-container'),
    errorMessage:    document.getElementById('error-message'),
  };
  await updateStats();
  await loadNextCard();
  setupEventListeners();
}

async function updateStats() {
  const stats = await StorageManager.getStats();
  if (el.todayCount)  el.todayCount.textContent = stats.todayReviews;
  if (el.streakCount) el.streakCount.textContent = stats.streak;
}

// カードの読み込み
async function loadNextCard() {
  try {
    const result = await StorageManager.getDueCardOrStatus();
    
    if (result.status === 'empty') {
      if (StorageManager.isExtension) {
        // 拡張機能モード: 1回だけ「問題なし」表示、2回目以降はGoogle
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
      if (StorageManager.isExtension) {
        // 拡張機能モード: 15分クールタイム中はGoogle
        window.location.replace('https://www.google.com/');
        return;
      } else {
        showDoneMode();
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
      const genres = await StorageManager.getGenres();
      const genreDef = genres.find(g => g.id === currentCard.genre);
      
      showQuestionMode(genreDef);
      
      // ジャンルバッジ
      if (el.genreBadge) {
        if (genreDef) {
          el.genreBadge.textContent = genreDef.name;
          el.genreBadge.classList.remove('hidden');
        } else {
          el.genreBadge.classList.add('hidden');
        }
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

function showQuestionMode(genreDef) {
  answerShown = false;
  el.answerSection.classList.add('hidden');
  el.showAnswerBtn.classList.remove('hidden');

  el.questionArea.innerHTML = '';
  el.answerArea.innerHTML = '';

  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea', role: 'question' },
    { key: 'answer',   label: '答え', type: 'textarea', role: 'answer' }
  ];

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

  // フィールドごとのレンダリング
  fields.forEach(field => {
    const container = field.role === 'question' ? el.questionArea : el.answerArea;
    const rawContent = (field.role === 'question' ? currentCard.question : currentCard.answer) || '';
    
    if (field.type === 'static') {
      // rawContent から [ラベル]\n値 の形式で値を読み出す
      let staticVal = field.label; // デフォルトはジャンル定義のラベル
      const searchStr = `[${field.label}]\n`;
      const startIdx = rawContent.indexOf(searchStr);
      if (startIdx !== -1) {
        const contentStart = startIdx + searchStr.length;
        const nextIdx = rawContent.indexOf('\n\n[', contentStart);
        const extracted = (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
        if (extracted) staticVal = extracted;
      }
      const staticEl = document.createElement('div');
      staticEl.className = 'static-text-display';
      staticEl.style.cssText = 'padding: 0.6rem 1rem; margin: 0.75rem 0; background: rgba(99,102,241,0.1); border-radius: 8px; border-left: 4px solid #a78bfa; font-weight: 600; font-size: 1rem; color: #a78bfa;';
      staticEl.textContent = staticVal;
      container.appendChild(staticEl);
    } else if (field.type === 'image') {
      // role と fieldKey モードの両方に対応
      const fieldImages = images.filter(img => {
        if (img.fieldKey) {
          return img.fieldKey === field.key;
        }
        return img.role === field.role;
      });

      if (fieldImages.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'image-grid';
        grid.dataset.cols = Math.min(fieldImages.length, 3);
        fieldImages.forEach(img => {
          const imgEl = document.createElement('img');
          imgEl.src = img.url;
          grid.appendChild(imgEl);
        });
        container.appendChild(grid);
      }
    } else {
      let val = '';
      const searchStr = `[${field.label}]\n`;
      const startIdx = rawContent.indexOf(searchStr);
      if (startIdx !== -1) {
        const contentStart = startIdx + searchStr.length;
        const nextIdx = rawContent.indexOf('\n\n[', contentStart);
        val = (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
      } else if (field.key === 'question' || field.key === 'answer') {
        val = rawContent;
      }

      if (val) {
        const p = document.createElement('p');
        p.className = field.role === 'question' ? 'question' : 'answer';
        p.style.whiteSpace = 'pre-wrap';
        p.textContent = val;
        container.appendChild(p);
      }
    }
  });
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

  el.optionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = 'options.html';
    }
  });

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
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const mapping = { '1': '1', '2': '3', '3': '4', '4': '5' };
        handleRating(mapping[e.key]);
      } else if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleRating('4');
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
