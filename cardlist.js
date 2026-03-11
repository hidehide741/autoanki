import StorageManager from './storage.js';

const el = {
  cardsTbody: document.getElementById('cards-tbody'),
  emptyState: document.getElementById('empty-state'),
  resetDemoBtn: document.getElementById('reset-demo-btn')
};

async function init() {
  await renderCardList();
  setupListeners();
}

async function renderCardList() {
  const cards = await StorageManager.getAllCards();
  el.cardsTbody.innerHTML = '';
  
  if (cards.length === 0) {
    el.emptyState.classList.remove('hidden');
    document.querySelector('.table-container').classList.add('hidden');
  } else {
    el.emptyState.classList.add('hidden');
    document.querySelector('.table-container').classList.remove('hidden');
    
    // 次回のレビュー日時の昇順でソート
    cards.sort((a, b) => a.nextReviewDate - b.nextReviewDate);

    cards.forEach(card => {
      const tr = document.createElement('tr');
      
      const nextDate = new Date(card.nextReviewDate);
      const isDue = card.nextReviewDate <= Date.now();
      
      tr.innerHTML = `
        <td style="max-width: 200px; white-space: pre-wrap;">${escapeHtml(card.question)}</td>
        <td style="max-width: 150px; font-size: 0.8rem; color: #a78bfa; word-break: break-all;">${card.image ? escapeHtml(card.image) : '-'}</td>
        <td style="max-width: 200px; white-space: pre-wrap;">${escapeHtml(card.answer)}</td>
        <td style="color: ${isDue ? '#10b981' : 'inherit'}">${isDue ? '🎯 Review Now!' : nextDate.toLocaleString()}</td>
        <td style="min-width: 200px; display: flex; gap: 0.5rem;">
          <button class="nav-btn secondary outline action-btn view-btn" data-id="${card.id}" style="padding: 0.4rem 0.8rem; margin: 0; font-size: 0.85rem;" title="閲覧">👁️</button>
          <button class="primary-btn action-btn edit-btn" data-id="${card.id}" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" title="編集">✏️</button>
          <button class="danger-btn action-btn delete-btn" data-id="${card.id}" title="削除">🗑️</button>
        </td>
      `;
      el.cardsTbody.appendChild(tr);
    });
    
    // 削除イベントのバインド
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('button').getAttribute('data-id');
        if (confirm('このカードを削除しますか？')) {
          await StorageManager.deleteCard(id);
          await renderCardList();
        }
      });
    });

    // アラート（閲覧・編集は今後の実装予定用）
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => alert('機能準備中：カードの詳細表示を予定しています'));
    });
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => alert('機能準備中：カードの編集画面（options.html）へ移動を予定しています'));
    });
  }
}

function setupListeners() {
  // サーバーシャットダウン
  const shutdownBtn = document.getElementById('shutdown-btn-list');
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
