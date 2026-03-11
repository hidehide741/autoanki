import StorageManager from './storage.js';

let genres = [];

const el = {
  genreList: document.getElementById('genre-list'),
  newGenreName: document.getElementById('new-genre-name'),
  newFieldList: document.getElementById('new-field-list'),
  addFieldBtn: document.getElementById('add-field-btn'),
  saveGenreBtn: document.getElementById('save-genre-btn'),
  saveMsg: document.getElementById('save-msg'),
  questionLabel: document.getElementById('question-label-input'),
  answerLabel: document.getElementById('answer-label-input')
};

async function init() {
  genres = await StorageManager.getGenres();
  renderGenreList();

  el.addFieldBtn.addEventListener('click', addFieldRow);
  el.saveGenreBtn.addEventListener('click', saveNewGenre);
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

    const fieldsPreview = genre.fields.map(f => {
      const typeIcon = { text: '📝', textarea: '📄', number: '🔢', image: '🖼️', url: '🔗', date: '📅' };
      return `${typeIcon[f.type] || '📝'} ${f.label}`;
    }).join('  ');

    item.innerHTML = `
      <div class="genre-item-info">
        <div class="genre-item-name">${genre.name}</div>
        <div class="genre-fields-preview">${fieldsPreview}</div>
      </div>
      <div class="genre-item-actions">
        <button class="danger-btn delete-genre-btn" data-index="${index}">🗑️ 削除</button>
      </div>
    `;
    el.genreList.appendChild(item);
  });

  document.querySelectorAll('.delete-genre-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.closest('button').dataset.index, 10);
      if (confirm(`「${genres[index].name}」を削除しますか？\nこのジャンルで作ったカードは削除されませんが、ジャンル表示は「その他」になります。`)) {
        genres.splice(index, 1);
        await StorageManager.saveGenres(genres);
        renderGenreList();
      }
    });
  });
}

// フィールドタイプの選択肢
const FIELD_TYPES = [
  { value: 'text',     label: '📝 1行テキスト',      desc: '短い文章・単語' },
  { value: 'textarea', label: '📄 複数行テキスト',    desc: '長い説明・解説' },
  { value: 'number',   label: '🔢 数値',              desc: '年号・数式の答え' },
  { value: 'image',    label: '🖼️ 画像（Ctrl+V）',    desc: '画像を貼り付け' },
  { value: 'url',      label: '🔗 URL',               desc: '参考リンク' },
  { value: 'date',     label: '📅 日付',              desc: '年月日' }
];

function addFieldRow() {
  const row = document.createElement('div');
  row.className = 'field-row';
  const id = Date.now();

  const typeOptions = FIELD_TYPES.map(t =>
    `<option value="${t.value}">${t.label}</option>`
  ).join('');

  row.innerHTML = `
    <input type="text" placeholder="フィールド名（例: 例文）" class="field-label-input" data-id="${id}">
    <select class="field-type-select" data-id="${id}" title="フィールドの種類">
      ${typeOptions}
    </select>
    <label class="required-check-wrap" title="必須フィールドにする">
      <input type="checkbox" class="field-required-check" data-id="${id}">
      <span style="font-size: 0.8rem; white-space: nowrap;">必須</span>
    </label>
    <button type="button" class="small-btn remove-field-btn" data-id="${id}">✕</button>
  `;
  el.newFieldList.appendChild(row);

  row.querySelector('.remove-field-btn').addEventListener('click', () => row.remove());
}

async function saveNewGenre() {
  const name = el.newGenreName.value.trim();
  if (!name) {
    alert('ジャンル名を入力してください');
    return;
  }

  // 問題・答えのカスタムラベル
  const questionLabel = el.questionLabel?.value.trim() || '問題';
  const answerLabel = el.answerLabel?.value.trim() || '答え';

  const fields = [
    { key: 'question', label: questionLabel, type: 'textarea', required: true },
    { key: 'answer',   label: answerLabel,   type: 'textarea', required: true }
  ];

  // 追加フィールドを収集
  const fieldRows = el.newFieldList.querySelectorAll('.field-row');
  fieldRows.forEach((row, i) => {
    const label = row.querySelector('.field-label-input')?.value.trim();
    const type  = row.querySelector('.field-type-select')?.value || 'text';
    const required = row.querySelector('.field-required-check')?.checked || false;
    if (label) {
      fields.push({
        key: `custom_${i}_${Date.now()}`,
        label,
        type,
        required
      });
    }
  });

  const newGenre = {
    id: 'custom_' + Date.now(),
    name,
    isDefault: false,
    fields
  };

  genres.push(newGenre);
  await StorageManager.saveGenres(genres);

  el.newGenreName.value = '';
  el.newFieldList.innerHTML = '';
  if (el.questionLabel) el.questionLabel.value = '';
  if (el.answerLabel) el.answerLabel.value = '';

  renderGenreList();

  el.saveMsg.classList.remove('hidden');
  setTimeout(() => el.saveMsg.classList.add('hidden'), 3000);
}

document.addEventListener('DOMContentLoaded', init);
