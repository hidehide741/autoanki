import StorageManager from './storage.js';

let genres = [];
let editingIndex = null; // null = 新規追加, number = 編集中のインデックス

const el = {
  genreList: document.getElementById('genre-list'),
  newGenreName: document.getElementById('new-genre-name'),
  newFieldList: document.getElementById('new-field-list'),
  addFieldBtn: document.getElementById('add-field-btn'),
  saveGenreBtn: document.getElementById('save-genre-btn'),
  saveMsg: document.getElementById('save-msg'),
  formTitle: document.getElementById('form-section-title'),
  cancelEditBtn: document.getElementById('cancel-edit-btn')
};

async function init() {
  genres = await StorageManager.getGenres();
  renderGenreList();

  el.addFieldBtn.addEventListener('click', () => { addFieldRow(); renderPreview(); });
  el.saveGenreBtn.addEventListener('click', saveGenre);
  el.cancelEditBtn?.addEventListener('click', cancelEdit);

  el.newGenreName.addEventListener('input', renderPreview);
  
  addDefaultFields();
}

function addDefaultFields() {
  el.newFieldList.innerHTML = '';
  addFieldRow('問題', 'textarea', true, 'question');
  addFieldRow('答え', 'textarea', true, 'answer');
}

function renderGenreList() {
  el.genreList.innerHTML = '';
  if (genres.length === 0) {
    el.genreList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">ジャンルがありません。下のフォームから追加してください。</p>';
    return;
  }

  genres.forEach((genre, index) => {
    const item = document.createElement('div');
    item.className = 'genre-item';
    if (editingIndex === index) item.style.border = '1px solid rgba(99,102,241,0.6)';

    const typeIcon = { text: '📝', textarea: '📄', number: '🔢', image: '🖼️', url: '🔗', date: '📅' };
    const fieldsPreview = genre.fields.map(f => `${typeIcon[f.type] || '📝'} ${f.label}`).join('  ');

    item.innerHTML = `
      <div class="genre-item-header">
        <div class="genre-item-info">
          <div class="genre-item-name">
            ${genre.name}
            <span class="toggle-icon">▼</span>
          </div>
        </div>
      </div>
      <div class="genre-item-content">
        <div class="genre-fields-preview">${fieldsPreview}</div>
        <div class="genre-item-actions">
          <button class="edit-genre-btn" data-index="${index}" style="
            background: rgba(99,102,241,0.15);
            border: 1px solid rgba(99,102,241,0.4);
            color: #a78bfa;
            padding: 0.4rem 0.8rem;
            border-radius: 6px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s;
          ">✏️ 編集</button>
          <button class="danger-btn delete-genre-btn" data-index="${index}">🗑️ 削除</button>
        </div>
      </div>
    `;
    
    // アコーディオン開閉ロジック
    const header = item.querySelector('.genre-item-header');
    header.addEventListener('click', () => {
      // 他のすべてを閉じる
      document.querySelectorAll('.genre-item').forEach(el => {
        if (el !== item) el.classList.remove('expanded');
      });
      // 自身の開閉をトグル
      item.classList.toggle('expanded');
    });

    el.genreList.appendChild(item);
  });

  // 編集ボタン
  document.querySelectorAll('.edit-genre-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // アコーディオンの開閉を防止
      const index = parseInt(e.target.closest('button').dataset.index, 10);
      loadGenreIntoForm(index);
    });
  });

  // 削除ボタン
  document.querySelectorAll('.delete-genre-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // アコーディオンの開閉を防止
      const index = parseInt(e.target.closest('button').dataset.index, 10);
      if (confirm(`「${genres[index].name}」を削除しますか？\nカードは削除されませんが、ジャンル表示は「その他」になります。`)) {
        if (editingIndex === index) cancelEdit();
        const genreId = genres[index].id;
        genres.splice(index, 1);
        await StorageManager.deleteGenre(genreId);
        await StorageManager.saveGenres(genres);
        renderGenreList();
      }
    });
  });
}

// 既存ジャンルをフォームに読み込む
function loadGenreIntoForm(index) {
  const genre = genres[index];
  editingIndex = index;

  // フォームタイトル変更
  if (el.formTitle) {
    el.formTitle.textContent = `✏️ ジャンルを編集：${genre.name}`;
  }

  // ジャンル名
  el.newGenreName.value = genre.name;

  // フィールドをクリアして再構築
  el.newFieldList.innerHTML = '';
  genre.fields.forEach(field => {
    addFieldRow(field.label, field.type, field.required, field.key);
  });

  // 保存ボタン・キャンセルボタンの切り替え
  el.saveGenreBtn.textContent = '更新する';
  el.cancelEditBtn?.classList.remove('hidden');

  // フォームまでスクロール
  document.getElementById('add-genre-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderGenreList(); // ハイライト更新
  renderPreview();
}

function cancelEdit() {
  editingIndex = null;
  el.newGenreName.value = '';
  addDefaultFields();
  el.saveGenreBtn.textContent = '保存する';
  el.cancelEditBtn?.classList.add('hidden');
  if (el.formTitle) el.formTitle.textContent = '➕ ジャンルを追加';
  renderGenreList();
  renderPreview();
}

// フィールドタイプの選択肢
const FIELD_TYPES = [
  { value: 'text',     label: '📝 1行テキスト' },
  { value: 'textarea', label: '📄 複数行テキスト' },
  { value: 'number',   label: '🔢 数値' },
  { value: 'image',    label: '🖼️ 画像（Ctrl+V）' },
  { value: 'url',      label: '🔗 URL' },
  { value: 'date',     label: '📅 日付' }
];

function addFieldRow(defaultLabel = '', defaultType = 'text', defaultRequired = false, fieldKey = null) {
  const row = document.createElement('div');
  row.className = 'field-row';
  const id = fieldKey || ('custom_' + Date.now() + Math.random().toString(36).substring(2));
  row.dataset.key = id;

  const typeOptions = FIELD_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === defaultType ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  row.innerHTML = `
    <input type="text" value="${defaultLabel}" placeholder="フィールド名（例: 例文）" class="field-label-input" data-id="${id}">
    <select class="field-type-select" data-id="${id}" title="フィールドの種類">
      ${typeOptions}
    </select>
    <label class="required-check-wrap" title="必須フィールドにする">
      <input type="checkbox" class="field-required-check" data-id="${id}" ${defaultRequired ? 'checked' : ''}>
      <span style="font-size: 0.8rem; white-space: nowrap;">必須</span>
    </label>
    <button type="button" class="small-btn remove-field-btn" data-id="${id}">✕</button>
  `;
  el.newFieldList.appendChild(row);

  row.querySelector('.remove-field-btn').addEventListener('click', () => { row.remove(); renderPreview(); });
  row.querySelector('.field-label-input').addEventListener('input', renderPreview);
  row.querySelector('.field-type-select').addEventListener('change', renderPreview);
  row.querySelector('.field-required-check').addEventListener('change', renderPreview);
}

async function saveGenre() {
  const name = el.newGenreName.value.trim();
  if (!name) { alert('ジャンル名を入力してください'); return; }

  const fields = [];
  let foundQuestion = false;
  let foundAnswer = false;

  el.newFieldList.querySelectorAll('.field-row').forEach((row, i) => {
    const label    = row.querySelector('.field-label-input')?.value.trim();
    const type     = row.querySelector('.field-type-select')?.value || 'text';
    const required = row.querySelector('.field-required-check')?.checked || false;
    let key = row.dataset.key;

    if (key === 'question') foundQuestion = true;
    if (key === 'answer') foundAnswer = true;

    if (label) fields.push({ key, label, type, required });
  });

  if (fields.length < 2) {
    alert('少なくとも2つのフィールド（問題と答えを含む）が必要です。');
    return;
  }

  // question / answer のキーを持つフィールドが消されていたら、先頭の2つを強制設定
  if (!foundQuestion && fields.length > 0) fields[0].key = 'question';
  if (!foundAnswer && fields.length > 1) {
    const possibleAnswers = fields.filter(f => f.key !== 'question');
    if (possibleAnswers.length > 0) possibleAnswers[0].key = 'answer';
  }

  if (editingIndex !== null) {
    // 編集モード：既存ジャンルを上書き（id・isDefault は保持）
    genres[editingIndex] = {
      ...genres[editingIndex],
      name,
      fields
    };
  } else {
    // 新規追加
    genres.push({ id: 'custom_' + Date.now(), name, isDefault: false, fields });
  }

  await StorageManager.saveGenres(genres);
  cancelEdit(); // フォームリセット

  el.saveMsg.classList.remove('hidden');
  setTimeout(() => el.saveMsg.classList.add('hidden'), 3000);
}

// リアルタイムプレビュー
function renderPreview() {
  const previewForm = document.getElementById('preview-form');
  const badge = document.getElementById('preview-genre-name-badge');
  if (!previewForm) return;

  const name = el.newGenreName.value.trim();
  const allFields = [];
  el.newFieldList.querySelectorAll('.field-row').forEach(row => {
    const label    = row.querySelector('.field-label-input')?.value.trim();
    const type     = row.querySelector('.field-type-select')?.value || 'text';
    const required = row.querySelector('.field-required-check')?.checked || false;
    if (label) allFields.push({ label, type, required });
  });

  if (allFields.length === 0) {
    previewForm.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.88rem; text-align: center;">ジャンル名やフィールドを入力するとここにプレビューが表示されます</p>';
    return;
  }

  const typeIcon = { text: '📝', textarea: '📄', number: '🔢', image: '🖼️', url: '🔗', date: '📅' };
  const inputStyle = `width:100%;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:0.5rem 0.75rem;color:rgba(255,255,255,0.4);font-family:inherit;font-size:0.88rem;pointer-events:none;`;

  previewForm.innerHTML = allFields.map(field => `
    <div>
      <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.3rem;">
        ${typeIcon[field.type] || '📝'} ${field.label}
        ${field.required ? '<span style="background:rgba(99,102,241,0.3);color:#a78bfa;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:3px;margin-left:0.3rem;">必須</span>' : ''}
      </div>
      ${field.type === 'textarea'
        ? `<textarea rows="2" disabled placeholder="${field.label}を入力…" style="${inputStyle}"></textarea>`
        : field.type === 'image'
        ? `<div style="${inputStyle}border:2px dashed rgba(99,102,241,0.3);border-radius:8px;padding:1rem;text-align:center;color:rgba(255,255,255,0.3);">🖼️ Ctrl+V で画像を貼り付け（最大3枚）</div>`
        : `<input type="${field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}" disabled placeholder="${field.label}を入力…" style="${inputStyle}">`
      }
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', init);
