import StorageManager from './storage.js';

let allMemos = [];
let activeMemoId = null;
let saveTimeout = null;
let hasUnsavedChanges = false;

const el = {
  memoList: document.getElementById('memo-list'),
  memoEditor: document.getElementById('memo-editor'),
  noSelection: document.getElementById('no-memo-selected'),
  titleInput: document.getElementById('memo-title'),
  contentInput: document.getElementById('memo-content'),
  newBtn: document.getElementById('new-memo-btn'),
  saveBtn: document.getElementById('save-memo-btn'),
  deleteBtn: document.getElementById('delete-memo-btn'),
  saveStatus: document.getElementById('save-status'),
  toast: document.getElementById('toast')
};

async function init() {
  await loadMemos();
  setupListeners();
}

async function loadMemos() {
  el.memoList.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);font-size:0.85rem;">取得中...</div>';
  allMemos = await StorageManager.getMemos();
  renderMemoList();
}

function renderMemoList() {
  el.memoList.innerHTML = '';
  if (allMemos.length === 0) {
    el.memoList.innerHTML = '<div style="padding:1rem;color:var(--text-secondary);font-size:0.85rem;">メモがありません</div>';
    return;
  }

  allMemos.forEach(memo => {
    const item = document.createElement('div');
    item.className = `memo-item ${memo.id === activeMemoId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="memo-item-title">${escapeHtml(memo.title || '無題のメモ')}</div>
      <div class="memo-item-date">${formatDate(memo.updatedAt)}</div>
    `;
    item.addEventListener('click', () => selectMemo(memo.id));
    el.memoList.appendChild(item);
  });
}

function selectMemo(id) {
  activeMemoId = id;
  const memo = allMemos.find(m => m.id === id);
  if (!memo) return;

  el.noSelection.classList.add('hidden');
  el.memoEditor.classList.remove('hidden');
  
  el.titleInput.value = memo.title;
  el.contentInput.value = memo.content;
  
  renderMemoList();
}

async function createNewMemo() {
  const newMemo = {
    id: 'memo-' + Date.now(),
    title: '',
    content: '',
    updatedAt: new Date().toISOString()
  };
  
  allMemos.unshift(newMemo);
  activeMemoId = newMemo.id;
  
  el.noSelection.classList.add('hidden');
  el.memoEditor.classList.remove('hidden');
  el.titleInput.value = '';
  el.contentInput.value = '';
  el.titleInput.focus();
  
  renderMemoList();
  await StorageManager.saveMemo(newMemo);
}

async function deleteActiveMemo() {
  if (!activeMemoId) return;
  if (!confirm('このメモを削除してもよろしいですか？')) return;

  try {
    await StorageManager.deleteMemo(activeMemoId);
    allMemos = allMemos.filter(m => m.id !== activeMemoId);
    activeMemoId = null;
    
    el.memoEditor.classList.add('hidden');
    el.noSelection.classList.remove('hidden');
    
    renderMemoList();
    showToast('削除しました');
  } catch (err) {
    alert('削除に失敗しました');
  }
}

async function performSave() {
  if (!activeMemoId) return;
  
  const memo = allMemos.find(m => m.id === activeMemoId);
  if (!memo) return;

  clearTimeout(saveTimeout);
  el.saveStatus.textContent = '保存中...';
  el.saveStatus.style.color = 'var(--accent)';

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await StorageManager.saveMemo(memo);
      el.saveStatus.textContent = '保存完了';
      el.saveStatus.style.color = 'var(--text-secondary)';
      hasUnsavedChanges = false;
      renderMemoList();
      return;
    } catch (err) {
      console.error(`Save failed (attempt ${attempt + 1}):`, err);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  el.saveStatus.textContent = '保存失敗（リトライ済）';
  el.saveStatus.style.color = '#ef4444';
  hasUnsavedChanges = true;
}

function handleInput() {
  if (!activeMemoId) return;
  
  hasUnsavedChanges = true;
  el.saveStatus.textContent = '変更あり...';
  el.saveStatus.style.color = 'var(--text-secondary)';
  
  // メモリ上のデータを更新
  const memo = allMemos.find(m => m.id === activeMemoId);
  if (memo) {
    memo.title = el.titleInput.value;
    memo.content = el.contentInput.value;
    memo.updatedAt = new Date().toISOString();
  }

  // オートセーブのデバウンス処理
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(performSave, 1500);
}

function setupListeners() {
  el.newBtn.addEventListener('click', createNewMemo);
  el.saveBtn.addEventListener('click', performSave);
  el.deleteBtn.addEventListener('click', deleteActiveMemo);
  
  el.titleInput.addEventListener('input', handleInput);
  el.contentInput.addEventListener('input', handleInput);

  // B5: 未保存の変更がある場合に画面遷移を警告
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 3000);
}

function formatDate(isoStr) {
  const date = new Date(isoStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
