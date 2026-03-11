import StorageManager from './storage.js';

let selectedGenreId = 'other';
let genres = [];

const el = {
  genreTabs: document.getElementById('genre-tabs'),
  formFields: document.getElementById('form-fields'),
  addForm: document.getElementById('add-card-form'),
  successMsg: document.getElementById('add-success-msg')
};

async function init() {
  genres = await StorageManager.getGenres();

  // デフォルトは「その他」
  selectedGenreId = genres[genres.length - 1]?.id || 'other';

  renderTabs();
  renderForm();
  setupListeners();
}

function renderTabs() {
  el.genreTabs.innerHTML = '';
  genres.forEach(genre => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'genre-tab' + (genre.id === selectedGenreId ? ' active' : '');
    btn.textContent = genre.name;
    btn.dataset.genreId = genre.id;
    btn.addEventListener('click', () => {
      selectedGenreId = genre.id;
      renderTabs();
      renderForm();
    });
    el.genreTabs.appendChild(btn);
  });
}

function renderForm() {
  el.formFields.innerHTML = '';
  const genre = genres.find(g => g.id === selectedGenreId);
  if (!genre) return;

  genre.fields.forEach(field => {
    const div = document.createElement('div');
    div.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = `field-${field.key}`;
    label.innerHTML = field.label + (field.required ? '<span class="required-badge">必須</span>' : '');

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = `field-${field.key}`;
    input.name = field.key;
    if (field.required) input.required = true;
    input.placeholder = getPlaceholder(field.key);

    div.appendChild(label);
    div.appendChild(input);
    el.formFields.appendChild(div);
  });
}

function getPlaceholder(key) {
  const placeholders = {
    question: '例: What is photosynthesis?',
    answer: '例: 光合成とは、植物が光エネルギーを使って...',
    example: '例: The sun provides energy for photosynthesis.',
    note: '例: /ˌfoʊtəˈsɪnθɪsɪs/ (名詞)',
    image: '例: https://example.com/image.png',
    formula: '例: E = mc²',
    definition: '例: 物質の最小単位',
    year: '例: 1945年',
    process: '例: ミトコンドリアが...'
  };
  return placeholders[key] || '';
}

function setupListeners() {
  el.addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const genre = genres.find(g => g.id === selectedGenreId);
    if (!genre) return;

    // 各フィールドの値を収集
    const values = {};
    genre.fields.forEach(field => {
      const input = document.getElementById(`field-${field.key}`);
      if (input) values[field.key] = input.value.trim();
    });

    const question = values['question'] || '';
    const answer = values['answer'] || '';
    if (!question || !answer) return;

    // 追加項目（example, note 等）は answer に補足として結合
    const extraParts = [];
    genre.fields
      .filter(f => !['question', 'answer', 'image'].includes(f.key))
      .forEach(f => {
        if (values[f.key]) extraParts.push(`[${f.label}]\n${values[f.key]}`);
      });

    const fullAnswer = extraParts.length > 0
      ? answer + '\n\n---\n' + extraParts.join('\n\n')
      : answer;

    const imagePath = values['image'] || null;

    await StorageManager.addCard(question, fullAnswer, imagePath, selectedGenreId);

    // フォームリセット
    el.addForm.querySelectorAll('input, textarea').forEach(i => i.value = '');

    el.successMsg.classList.remove('hidden');
    setTimeout(() => el.successMsg.classList.add('hidden'), 3000);
  });
}

document.addEventListener('DOMContentLoaded', init);
