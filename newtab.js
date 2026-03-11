import StorageManager from './storage.js';

let currentCard = null;
let answerShown = false;
let isProcessing = false; // 二重送信防止用

// DOM要素
const el = {
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
  questionArea:  document.getElementById('question-area'),
  answerArea:    document.getElementById('answer-area'),
};

// 初期化
async function init() {
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
    
    if (result.status === 'cooldown') {
      if (StorageManager.isExtension) {
        window.location.replace('https://www.google.com/');
        return;
      } else {
        showDoneMode();
        return;
      }
    }

    currentCard = result.card;
    
    if (currentCard) {
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
      el.cardContainer.style.animation = 'none';
      setTimeout(() => {
        el.cardContainer.style.animation = 'floatIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        isProcessing = false;
      }, 10);
    } else {
      await StorageManager.updateLastAnswerTime();
      showDoneMode();
      isProcessing = false;
    }
  } catch (err) {
    console.error('loadNextCard Failed:', err);
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
      const staticEl = document.createElement('div');
      staticEl.className = 'static-text-display';
      staticEl.style.cssText = 'padding: 0.75rem 1rem; margin: 1rem 0; background: rgba(99,102,241,0.08); border-radius: 8px; border-left: 4px solid #a78bfa; font-weight: 600; font-size: 1.1rem; color: #a78bfa;';
      staticEl.textContent = field.label;
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
  el.doneContainer.classList.remove('hidden');
  if (el.doneToday)  el.doneToday.textContent  = el.todayCount?.textContent  || '0';
  if (el.doneStreak) el.doneStreak.textContent = el.streakCount?.textContent || '0';
}

async function handleRating(quality) {
  if (!currentCard || isProcessing) return;
  isProcessing = true;

  el.cardContainer.classList.add('fade-out');
  
  try {
    await StorageManager.updateCard(currentCard.id, parseInt(quality, 10));
    await updateStats();
    setTimeout(() => {
      showDoneMode();
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
      setTimeout(() => {
        showDoneMode();
      }, 300);
    } else {
      showDoneMode();
    }
  });

  el.optionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = 'options.html';
    }
  });

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
