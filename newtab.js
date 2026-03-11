import StorageManager from './storage.js';

let currentCard = null;
let answerShown = false;

// DOM要素
const el = {
  cardContainer: document.getElementById('card-container'),
  doneContainer: document.getElementById('done-container'),
  questionText: document.getElementById('question-text'),
  questionImage: document.getElementById('question-image'),
  answerSection: document.getElementById('answer-section'),
  answerText: document.getElementById('answer-text'),
  showAnswerBtn: document.getElementById('show-answer-btn'),
  ratingButtons: document.querySelectorAll('.rating-btn'),
  skipBtn: document.getElementById('skip-btn'),
  optionsBtn: document.getElementById('options-btn'),
  todayCount: document.getElementById('today-count'),
  streakCount: document.getElementById('streak-count')
};

// 初期化
async function init() {
  await updateStats();
  await loadNextCard();
  setupEventListeners();
}

async function updateStats() {
  const stats = await StorageManager.getStats();
  el.todayCount.textContent = stats.todayReviews;
  el.streakCount.textContent = stats.streak;
}

// カードの読み込み
async function loadNextCard() {
  const result = await StorageManager.getDueCardOrStatus();
  
  if (result.status === 'cooldown') {
    if (StorageManager.isExtension) {
      // Chrome拡張として「新しいタブ」を開いた時だけ、無限ループ避けのためGoogleに安全退避
      window.location.replace('https://www.google.com/');
    } else {
      // WEBアプリ版（URLから直接アクセス）の場合は、単にAll Done画面を見せるだけにする
      showDoneMode();
    }
    return;
  }

  currentCard = result.card;
  
  if (currentCard) {
    showQuestionMode();
    el.questionText.textContent = currentCard.question;
    el.answerText.textContent = currentCard.answer;
    
    // アニメーションのリセット
    el.cardContainer.classList.remove('hidden', 'fade-out');
    el.doneContainer.classList.add('hidden');
    // 少し遅延を入れてアニメーションを再トリガー（新しい問題が来た感触）
    el.cardContainer.style.animation = 'none';
    setTimeout(() => {
      el.cardContainer.style.animation = 'popIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }, 10);
  } else {
    // 問題が0件（All Done画面）の場合も、これを表示した時刻を記録して
    // 15分間は新しいタブを開いてもGoogleに行くように（クールダウン）設定する
    await StorageManager.updateLastAnswerTime();
    showDoneMode();
  }
}

function showQuestionMode() {
  answerShown = false;
  el.answerSection.classList.add('hidden');
  el.showAnswerBtn.classList.remove('hidden');

  if (currentCard && currentCard.image) {
    el.questionImage.src = `${StorageManager.getBaseUrl()}${currentCard.image}`;
    el.questionImage.classList.remove('hidden');
  } else {
    el.questionImage.classList.add('hidden');
    el.questionImage.src = '';
  }
}

function showAnswerMode() {
  answerShown = true;
  el.showAnswerBtn.classList.add('hidden');
  el.answerSection.classList.remove('hidden');
  
  // Ratingボタンのインターバル表示を更新 (擬似的にSM-2の次期間を表示)
  // 今回は簡易的に静的表示でも良いが、より高品質にするならここで表示を上書きできる
}

function showDoneMode() {
  el.cardContainer.classList.add('hidden');
  el.doneContainer.classList.remove('hidden');
}

// 評価を送信して終了（または次のカードがあれば表示するが、「1回1問」のコンセプトにより完了画面へ移行）
async function handleRating(quality) {
  if (!currentCard) return;

  // アニメーションでカードを退出させる
  el.cardContainer.classList.add('fade-out');
  
  // データの更新
  await StorageManager.updateCard(currentCard.id, parseInt(quality, 10));
  await updateStats();
  
  // 1回1問で終わらせるため、アニメーション後に完了画面へ
  // 逃げ道を作るため、次回開いたときのためにすぐ完了画面にしておく
  setTimeout(() => {
    showDoneMode();
  }, 300);
}

function setupEventListeners() {
  // 答えを見る
  el.showAnswerBtn.addEventListener('click', showAnswerMode);

  // 評価ボタン
  el.ratingButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const quality = btn.getAttribute('data-quality');
      handleRating(quality);
    });
  });

  // スキップボタン（完了画面に移行し、15分出題制限をかける）
  el.skipBtn.addEventListener('click', async () => {
    if(!el.cardContainer.classList.contains('hidden')) {
      el.cardContainer.classList.add('fade-out');
      
      // スキップ時もlastAnswerTimeを更新し、15分間出題しないようにする
      await StorageManager.updateLastAnswerTime();

      setTimeout(() => {
        showDoneMode();
      }, 300);
    } else {
      showDoneMode();
    }
  });

  // 設定ボタン
  el.optionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = 'options.html';
    }
  });



  // キーボードショートカット
  document.addEventListener('keydown', async (e) => {
    if (el.cardContainer.classList.contains('hidden')) return;
    
    // スキップ
    if (e.key === 'Escape') {
      // ※クリックイベント内でlastAnswerTimeは更新されるのでここではクリックのみトリガーする
      el.skipBtn.click();
      return;
    }

    if (!answerShown) {
      // 答えを見る
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        showAnswerMode();
      }
    } else {
      // キーボードで評価 (1, 2, 3, 4)
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const mapping = { '1': '1', '2': '3', '3': '4', '4': '5' }; // 1:忘れた 2:難しい 3:普通 4:簡単
        handleRating(mapping[e.key]);
      } else if (e.code === 'Space' || e.key === 'Enter') {
        // スペースキー連打の人は「普通(3)」で進める機能を付けると便利
        e.preventDefault();
        handleRating('4'); // Good
      }
    }
  });
}

// 起動
document.addEventListener('DOMContentLoaded', init);
