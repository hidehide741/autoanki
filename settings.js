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
  questionLabel: document.getElementById('question-label-input'),
  answerLabel: document.getElementById('answer-label-input'),
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
  el.questionLabel?.addEventListener('input', renderPreview);
  el.answerLabel?.addEventListener('input', renderPreview);
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
      <div class="genre-item-info">
        <div class="genre-item-name">${genre.name}</div>
        <div class="genre-fields-preview">${fieldsPreview}</div>
      </div>
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
    `;
    el.genreList.appendChild(item);
  });

  // 編集ボタン
  document.querySelectorAll('.edit-genre-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('button').dataset.index, 10);
      loadGenreIntoForm(index);
    });
  });

  // 削除ボタン
  document.querySelectorAll('.delete-genre-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.closest('button').dataset.index, 10);
      if (confirm(`「${genres[index].name}」を削除しますか？\nカードは削除されませんが、ジャンル表示は「その他」になります。`)) {
        if (editingIndex === index) cancelEdit();
        genres.splice(index, 1);
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

  // 問題・答えのラベル
  const qField = genre.fields.find(f => f.key === 'question');
  const aField = genre.fields.find(f => f.key === 'answer');
  if (el.questionLabel) el.questionLabel.value = qField?.label || '';
  if (el.answerLabel)   el.answerLabel.value   = aField?.label || '';

  // 追加フィールドをクリアして再構築
  el.newFieldList.innerHTML = '';
  const extraFields = genre.fields.filter(f => f.key !== 'question' && f.key !== 'answer');
  extraFields.forEach(field => {
    addFieldRow(field.label, field.type, field.required);
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
  el.newFieldList.innerHTML = '';
  if (el.questionLabel) el.questionLabel.value = '';
  if (el.answerLabel)   el.answerLabel.value = '';
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

function addFieldRow(defaultLabel = '', defaultType = 'text', defaultRequired = false) {
  const row = document.createElement('div');
  row.className = 'field-row';
  const id = Date.now() + Math.random();

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

  const questionLabel = el.questionLabel?.value.trim() || '問題';
  const answerLabel   = el.answerLabel?.value.trim()   || '答え';

  const fields = [
    { key: 'question', label: questionLabel, type: 'textarea', required: true },
    { key: 'answer',   label: answerLabel,   type: 'textarea', required: true }
  ];

  el.newFieldList.querySelectorAll('.field-row').forEach((row, i) => {
    const label    = row.querySelector('.field-label-input')?.value.trim();
    const type     = row.querySelector('.field-type-select')?.value || 'text';
    const required = row.querySelector('.field-required-check')?.checked || false;
    if (label) fields.push({ key: `custom_${i}_${Date.now()}`, label, type, required });
  });

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
  const questionLabel = el.questionLabel?.value.trim() || '問題';
  const answerLabel   = el.answerLabel?.value.trim()   || '答え';

  if (name) { badge.textContent = name; badge.style.display = 'inline-block'; }
  else      { badge.style.display = 'none'; }

  const extraFields = [];
  el.newFieldList.querySelectorAll('.field-row').forEach(row => {
    const label    = row.querySelector('.field-label-input')?.value.trim();
    const type     = row.querySelector('.field-type-select')?.value || 'text';
    const required = row.querySelector('.field-required-check')?.checked || false;
    if (label) extraFields.push({ label, type, required });
  });

  const allFields = [
    { label: questionLabel, type: 'textarea', required: true },
    { label: answerLabel,   type: 'textarea', required: true },
    ...extraFields
  ];

  const typeIcon = { text: '📝', textarea: '📄', number: '🔢', image: '🖼️', url: '🔗', date: '📅' };
  const inputStyle = `width:100%;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:0.5rem 0.75rem;color:rgba(255,255,255,0.4);font-family:inherit;font-size:0.88rem;pointer-events:none;`;

  previewForm.innerHTML = allFields.map(field => `
    <div>
      <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.3rem;">
        ${typeIcon[field.type] || '📝'} ${field.label}
        ${field.required ? '<span style="background:rgba(99,102,241,0.3);color:#a78bfa;font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:3px;margin-left:0.3rem;">必須</span>' : ''}
      </div>
      ${field.type === 'textarea'
        ? `<textarea rows="2" disabled placeholder="${field.label}の入力欄" style="${inputStyle}"></textarea>`
        : field.type === 'image'
        ? `<div style="${inputStyle}border:2px dashed rgba(99,102,241,0.3);border-radius:8px;padding:1rem;text-align:center;color:rgba(255,255,255,0.3);">🖼️ Ctrl+V で画像を貼り付け（最大3枚）</div>`
        : `<input type="${field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}" disabled placeholder="${field.label}の入力欄" style="${inputStyle}">`
      }
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', init);
