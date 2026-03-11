import StorageManager from './storage.js';

let genres = [];
let newFields = []; // 追加フォームの一時フィールド

const el = {
  genreList: document.getElementById('genre-list'),
  newGenreName: document.getElementById('new-genre-name'),
  newFieldList: document.getElementById('new-field-list'),
  addFieldBtn: document.getElementById('add-field-btn'),
  saveGenreBtn: document.getElementById('save-genre-btn'),
  saveMsg: document.getElementById('save-msg')
};

async function init() {
  genres = await StorageManager.getGenres();
  renderGenreList();

  el.addFieldBtn.addEventListener('click', addFieldRow);
  el.saveGenreBtn.addEventListener('click', saveNewGenre);
}

function renderGenreList() {
  el.genreList.innerHTML = '';
  genres.forEach((genre, index) => {
    const item = document.createElement('div');
    item.className = 'genre-item';

    const fieldsPreview = genre.fields.map(f => f.label).join('・');

    item.innerHTML = `
      <div class="genre-item-info">
        <div class="genre-item-name">
          ${genre.name}
          ${genre.isDefault ? '<span class="default-badge">デフォルト</span>' : ''}
        </div>
        <div class="genre-fields-preview">${fieldsPreview}</div>
      </div>
      <div class="genre-item-actions">
        ${!genre.isDefault ? `<button class="danger-btn delete-genre-btn" data-index="${index}">🗑️ 削除</button>` : '<span style="font-size: 0.75rem; color: var(--text-secondary);">削除不可</span>'}
      </div>
    `;
    el.genreList.appendChild(item);
  });

  // 削除ボタンのイベント
  document.querySelectorAll('.delete-genre-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.closest('button').dataset.index, 10);
      if (confirm(`「${genres[index].name}」を削除しますか？`)) {
        genres.splice(index, 1);
        await StorageManager.saveGenres(genres);
        renderGenreList();
      }
    });
  });
}

function addFieldRow() {
  const row = document.createElement('div');
  row.className = 'field-row';
  const id = Date.now();
  row.innerHTML = `
    <input type="text" placeholder="フィールド名（例: 例文）" class="field-label-input" data-id="${id}">
    <select class="field-type-select" data-id="${id}">
      <option value="text">1行テキスト</option>
      <option value="textarea">複数行テキスト</option>
    </select>
    <button type="button" class="small-btn remove-field-btn" data-id="${id}">✕</button>
  `;
  el.newFieldList.appendChild(row);

  row.querySelector('.remove-field-btn').addEventListener('click', () => {
    row.remove();
  });
}

async function saveNewGenre() {
  const name = el.newGenreName.value.trim();
  if (!name) {
    alert('ジャンル名を入力してください');
    return;
  }

  // 基本フィールド（問題・答え）は自動追加
  const fields = [
    { key: 'question', label: '問題', type: 'textarea', required: true },
    { key: 'answer',   label: '答え', type: 'textarea', required: true }
  ];

  // 追加フィールドを収集
  document.querySelectorAll('.field-label-input').forEach((input, i) => {
    const label = input.value.trim();
    const type = document.querySelectorAll('.field-type-select')[i]?.value || 'text';
    if (label) {
      fields.push({
        key: 'custom_' + i + '_' + Date.now(),
        label,
        type
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

  // フォームリセット
  el.newGenreName.value = '';
  el.newFieldList.innerHTML = '';

  renderGenreList();

  el.saveMsg.classList.remove('hidden');
  setTimeout(() => el.saveMsg.classList.add('hidden'), 3000);
}

document.addEventListener('DOMContentLoaded', init);
