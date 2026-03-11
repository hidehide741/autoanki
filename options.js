import StorageManager from './storage.js';

const el = {
  addForm: document.getElementById('add-card-form'),
  questionInput: document.getElementById('question-input'),
  answerInput: document.getElementById('answer-input'),
  imageInput: document.getElementById('image-input'),
  successMsg: document.getElementById('add-success-msg'),
  
  optTodayCount: document.getElementById('opt-today-count'),
  optStreakCount: document.getElementById('opt-streak-count'),
  optTotalCards: document.getElementById('opt-total-cards')
};

async function init() {
  await renderStats();
  setupListeners();
}

async function renderStats() {
  const stats = await StorageManager.getStats();
  const cards = await StorageManager.getAllCards();
  
  el.optTodayCount.textContent = stats.todayReviews;
  el.optStreakCount.textContent = stats.streak;
  el.optTotalCards.textContent = cards.length;
}

function setupListeners() {
  // 追加フォーム送信
  el.addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = el.questionInput.value.trim();
    const a = el.answerInput.value.trim();
    const img = el.imageInput.value.trim();
    if (!q || !a) return;

    await StorageManager.addCard(q, a, img ? img : null);
    
    el.questionInput.value = '';
    el.answerInput.value = '';
    if (el.imageInput) el.imageInput.value = '';
    
    el.successMsg.classList.remove('hidden');
    
    setTimeout(() => {
      el.successMsg.classList.add('hidden');
    }, 3000);

    await renderStats();
  });

  // デモデータ復元ボタン
  el.resetDemoBtn?.addEventListener('click', async () => {
    if (confirm('現在のカードに追加して、デモデータを復元しますか？')) {
      await chrome.storage.local.remove('cards');
      await StorageManager.initDemoData();
      await renderStats();
      alert('デモデータを復元しました。');
    }
  });

  // サーバーシャットダウン
  const shutdownBtn = document.getElementById('shutdown-btn-opt');
  if (shutdownBtn) {
    shutdownBtn.addEventListener('click', async () => {
      if (confirm('PC側のサーバーを停止します。よろしいですか？\n(停止後はブラウザを閉じてください)')) {
        const success = await StorageManager.shutdownServer();
        if (success) {
          document.body.innerHTML = `
            <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: white; font-family: sans-serif; text-align: center;">
              <div>
                <h1 style="font-size: 3rem; margin-bottom: 1rem;">🔒 Closed</h1>
                <p style="font-size: 1.2rem; color: #94a3b8;">サーバーを安全に停止しました。<br>このブラウザタブを閉じて終了してください。</p>
              </div>
            </div>
          `;
        }
      }
    });
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag])
  );
}

document.addEventListener('DOMContentLoaded', init);
