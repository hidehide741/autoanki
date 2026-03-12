import StorageManager from './storage.js';

let genres = [];
let editingGenreId = null; // null = 新規追加, string = 編集中のジャンルID

const el = {
  genreList:    document.getElementById('genre-list'),
  addGenreBtn:  document.getElementById('add-genre-btn'),
  genreEditor:  document.getElementById('genre-editor'),
  genreName:    document.getElementById('genre-name'),
  qContainer:   document.getElementById('q-fields-container'),
  aContainer:   document.getElementById('a-fields-container'),
  addQBtn:      document.getElementById('add-q-field-btn'),
  addABtn:      document.getElementById('add-a-field-btn'),
  cancelBtn:    document.getElementById('cancel-btn'),
  saveGenreBtn: document.getElementById('save-genre-btn'),
  previewPanel: document.getElementById('preview-panel'),
  toast:        document.getElementById('toast'),
  toastMsg:     document.getElementById('toast-msg')
};

async function init() {
  genres = await StorageManager.getGenres();
  renderGenreList();

  el.addGenreBtn.addEventListener('click', () => {
    editingGenreId = null;
    document.getElementById('editor-title').textContent = '➕ ジャンルを追加';
    el.saveGenreBtn.textContent = '保存する';
    el.genreName.value = '';
    el.qContainer.innerHTML = '';
    el.aContainer.innerHTML = '';
    addFieldRow(el.qContainer, '問題', 'textarea', true);
    addFieldRow(el.aContainer, '答え', 'textarea', true);
    openEditor();
  });
  el.addQBtn.addEventListener('click', () => addFieldRow(el.qContainer));
  el.addABtn.addEventListener('click', () => addFieldRow(el.aContainer));
  el.saveGenreBtn.addEventListener('click', saveGenre);
  el.cancelBtn.addEventListener('click', closeEditor);

  el.genreName.addEventListener('input', renderPreview);
  el.qContainer.addEventListener('input', renderPreview);
  el.qContainer.addEventListener('change', renderPreview);
  el.aContainer.addEventListener('input', renderPreview);
  el.aContainer.addEventListener('change', renderPreview);
}

function esc(str) {
  return String(str).replace(/[&<>"'`]/g, function (s) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#x60;'
    }[s];
  });
}

function showToast(message, isError = false) {
  el.toastMsg.textContent = message;
  el.toast.className = `toast ${isError ? 'error' : ''}`;
  el.toast.classList.add('show');
  setTimeout(() => {
    el.toast.classList.remove('show');
  }, 3000);
}

function openEditor() {
  el.genreEditor.classList.remove('hidden');
  el.addGenreBtn.classList.add('hidden');
  document.getElementById('genre-list-section').classList.add('hidden');
  renderPreview();
  el.genreEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  editingGenreId = null;
  el.genreEditor.classList.add('hidden');
  el.addGenreBtn.classList.remove('hidden');
  document.getElementById('genre-list-section').classList.remove('hidden');
  renderGenreList();
}

function renderGenreList() {
  el.genreList.innerHTML = '';
  if (genres.length === 0) {
    el.genreList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem; grid-column: 1/-1;">ジャンルがまだありません。「新規ジャンル」から追加してください。</p>';
    return;
  }

  genres.forEach((genre) => {
    const item = document.createElement('div');
    item.className = 'genre-card';
    if (editingGenreId === genre.id) {
      item.style.borderColor = 'rgba(99,102,241,0.6)';
    }

    const typeIcon = { text: '📝', textarea: '📄', number: '🔢', image: '🖼️', url: '🔗', date: '📅', static: '🔖' };
    const qFields = genre.fields.filter(f => f.role === 'question');
    const aFields = genre.fields.filter(f => f.role === 'answer');
    const fieldsPreview = genre.fields.map(f => `${typeIcon[f.type] || '📝'} ${f.label}`).join('&ensp;');

    item.innerHTML = `
      <div class="genre-card-name">${esc(genre.name)}</div>
      <div class="genre-card-fields">${fieldsPreview || '<span style="opacity:0.5;">フィールドなし</span>'}</div>
      <div class="genre-card-actions">
        <button class="btn btn-secondary btn-sm edit-genre-btn" data-id="${genre.id}">✏️ 編集</button>
        <button class="btn btn-danger  btn-sm delete-genre-btn" data-id="${genre.id}">🗑️ 削除</button>
      </div>
    `;

    item.querySelector('.edit-genre-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      loadGenreIntoForm(genre.id);
    });

    item.querySelector('.delete-genre-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`「${genre.name}」を削除しますか？\nカードは削除されませんが、ジャンル表示は「その他」になります。`)) {
        if (editingGenreId === genre.id) closeEditor();
        genres = genres.filter(g => g.id !== genre.id);
        await StorageManager.deleteGenre(genre.id);
        await StorageManager.saveGenres(genres);
        renderGenreList();
      }
    });

    el.genreList.appendChild(item);
  });
}

// 既存ジャンルをフォームに読み込む
function loadGenreIntoForm(id) {
  const genre = genres.find(g => g.id === id);
  if (!genre) return;

  editingGenreId = id;
  document.getElementById('editor-title').textContent = '✏️ ジャンルを編集';

  // ジャンル名
  el.genreName.value = genre.name;

  // フィールドをクリアして再構築
  el.qContainer.innerHTML = '';
  el.aContainer.innerHTML = '';

  genre.fields.forEach(f => {
    const container = f.role === 'question' ? el.qContainer : el.aContainer;
    addFieldRow(container, f.label, f.type, f.required);
  });

  // 保存ボタン・キャンセルボタンの切り替え
  el.saveGenreBtn.textContent = '更新する';
  openEditor(); // エディタを開く
}

// フィールドタイプの選択肢
const FIELD_TYPES = [
  { val: 'text',     label: '📝 1行テキスト' },
  { val: 'textarea', label: '📄 複数行テキスト' },
  { val: 'number',   label: '🔢 数値' },
  { val: 'image',    label: '🖼️ 画像（Ctrl+V）' },
  { val: 'url',      label: '🔗 URL' },
  { val: 'date',     label: '📅 日付' },
  { val: 'static',   label: '🔖 固定テキスト（表示専用）' }
];

function addFieldRow(container, label = '', type = 'textarea', required = false) {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.draggable = true; // ドラッグ可能にする
  row.innerHTML = `
    <div class="drag-handle" title="ドラッグして並び替え">⋮⋮</div>
    <input type="text" class="field-label" value="${esc(label)}" placeholder="ラベル名 (例: 例文)" ${type === 'static' ? '' : 'disabled'}>
    <select class="field-type">
      ${FIELD_TYPES.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>
    <label class="required-toggle"><input type="checkbox" class="field-required" ${required ? 'checked' : ''}>必須</label>
    <button type="button" class="btn-remove" title="削除">×</button>
  `;

  // フィールドタイプ変更時、staticならlabel input有効、それ以外は無効
  const typeSelect = row.querySelector('.field-type');
  const labelInput = row.querySelector('.field-label');
  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'static') {
      labelInput.disabled = false;
      labelInput.placeholder = '表示するテキスト';
    } else {
      labelInput.disabled = true;
      labelInput.placeholder = '（ラベルは自動）';
    }
    renderPreview();
  });

  // === ドラッグ＆ドロップのイベント制御 ===
  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    renderPreview();
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingRow = container.querySelector('.dragging');
    if (!draggingRow || draggingRow === row) return;

    // マウス位置によって上か下に挿入
    const rect = row.getBoundingClientRect();
    const next = (e.clientY - rect.top) > (rect.height / 2);
    container.insertBefore(draggingRow, next ? row.nextSibling : row);
  });

  // ======================================

  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    renderPreview();
  });
  row.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('change', renderPreview);
    if (input.tagName === 'INPUT') input.addEventListener('input', renderPreview);
  });

  container.appendChild(row);
  renderPreview();
}

async function saveGenre() {
  const name = el.genreName.value.trim();
  if (!name) { showToast('ジャンル名を入力してください', true); return; }

  const fields = [];

  let qIdx = 0;
  let aIdx = 0;
  const collectFields = (container, role) => {
    container.querySelectorAll('.field-row').forEach(row => {
      const label = row.querySelector('.field-label').value.trim();
      const type  = row.querySelector('.field-type').value;
      const req   = row.querySelector('.field-required').checked;
      if (!label) return;
      const key = (role === 'question' ? `q_${qIdx++}` : `a_${aIdx++}`);
      fields.push({ key, label, type, required: req, role });
    });
  };

  collectFields(el.qContainer, 'question');
  collectFields(el.aContainer, 'answer');

  if (fields.filter(f => f.role === 'question').length === 0) {
    showToast('問題フィールドを1つ以上追加してください', true);
    return;
  }
  if (fields.filter(f => f.role === 'answer').length === 0) {
    showToast('答えフィールドを1つ以上追加してください', true);
    return;
  }

  if (editingGenreId) {
    // 編集モード：既存ジャンルを上書き（id・isDefault は保持）
    const index = genres.findIndex(g => g.id === editingGenreId);
    if (index !== -1) {
      genres[index] = {
        ...genres[index],
        name,
        fields
      };
    }
  } else {
    // 新規追加
    genres.push({ id: 'custom_' + Date.now(), name, isDefault: false, fields });
  }

  await StorageManager.saveGenres(genres);
  closeEditor(); // フォームリセット
  showToast('ジャンルを保存しました！');
}

// リアルタイムプレビュー
function renderPreview() {
  const collectPreviewData = (container) => {
    const data = [];
    container.querySelectorAll('.field-row').forEach(row => {
      const label = row.querySelector('.field-label').value.trim() || 'ラベル';
      const type  = row.querySelector('.field-type').value;
      data.push({ label, type });
    });
    return data;
  };

  const qData = collectPreviewData(el.qContainer);
  const aData = collectPreviewData(el.aContainer);

  const renderSection = (title, data) => {
    if (data.length === 0) return '';
    return `
      <div style="margin-bottom: 1rem;">
        <div style="font-size: 0.75rem; color: #a78bfa; font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase; border-bottom: 1px solid rgba(167,139,250,0.2);">${title}</div>
        ${data.map(f => `
          <div style="margin-bottom: 0.75rem;">
            <p style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${esc(f.label)}</p>
            ${f.type === 'textarea' ? `<div style="height: 48px; background: rgba(0,0,0,0.2); border: 1px dashed var(--glass-border); border-radius: 4px;"></div>` : 
              f.type === 'image' ? `<div style="height: 80px; background: rgba(0,0,0,0.2); border: 1px dashed var(--glass-border); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.8rem;">🖼️ 画像エリア</div>` :
              `<div style="height: 32px; background: rgba(0,0,0,0.2); border: 1px dashed var(--glass-border); border-radius: 4px;"></div>`}
          </div>
        `).join('')}
      </div>
    `;
  };

  el.previewPanel.innerHTML = `
    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.75rem; font-weight: 500;">カードプレビュー</div>
    <div style="background: rgba(15,23,42,0.6); padding: 1.25rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
      ${renderSection('FRONT (問題)', qData)}
      ${renderSection('BACK (回答)', aData)}
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
