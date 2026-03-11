import StorageManager, { uploadImageToSupabase } from './storage.js';

const MAX_IMAGES = 3;

let selectedGenreId = 'other';
let genres = [];
let pendingImages = []; // { file, previewUrl } の配列（最大3枚）

const el = {
  genreTabs: document.getElementById('genre-tabs'),
  formFields: document.getElementById('form-fields'),
  addForm: document.getElementById('add-card-form'),
  successMsg: document.getElementById('add-success-msg')
};

async function init() {
  genres = await StorageManager.getGenres();
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
  pendingImages = [];

  const genre = genres.find(g => g.id === selectedGenreId);
  if (!genre) return;

  genre.fields.forEach(field => {
    if (field.key === 'image') {
      // 通常の URL 入力の代わりに画像ペーストエリアを挿入
      el.formFields.appendChild(buildImagePasteUI());
      return;
    }

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

function buildImagePasteUI() {
  const wrapper = document.createElement('div');
  wrapper.className = 'form-group';
  wrapper.id = 'image-upload-area';

  wrapper.innerHTML = `
    <label>画像（任意・最大3枚）<span style="color: var(--text-secondary); font-size: 0.8rem; margin-left: 0.5rem;">Ctrl+V でペースト、またはクリックで選択</span></label>
    <div id="paste-zone" style="
      border: 2px dashed rgba(99,102,241,0.4);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      color: var(--text-secondary);
      background: rgba(0,0,0,0.15);
    ">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">🖼️</div>
      <div style="font-size: 0.9rem;">ここにスクリーンショットをCtrl+Vで貼り付け</div>
      <div style="font-size: 0.8rem; margin-top: 0.3rem; opacity: 0.6;">またはクリックしてファイルを選択</div>
      <input type="file" id="image-file-input" accept="image/*" multiple style="display:none">
    </div>
    <div id="image-previews" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem;"></div>
  `;

  // ファイル選択クリック
  wrapper.querySelector('#paste-zone').addEventListener('click', () => {
    wrapper.querySelector('#image-file-input').click();
  });

  // ファイル選択
  wrapper.querySelector('#image-file-input').addEventListener('change', (e) => {
    Array.from(e.target.files).slice(0, MAX_IMAGES - pendingImages.length).forEach(file => addImage(file));
  });

  return wrapper;
}

function addImage(file) {
  if (pendingImages.length >= MAX_IMAGES) return;
  const url = URL.createObjectURL(file);
  const idx = pendingImages.length;
  pendingImages.push({ file, previewUrl: url });
  renderPreviews();
}

function renderPreviews() {
  const container = document.getElementById('image-previews');
  if (!container) return;
  container.innerHTML = '';

  pendingImages.forEach((img, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position: relative; display: inline-block;';
    wrap.innerHTML = `
      <img src="${img.previewUrl}" alt="preview" style="max-height: 120px; max-width: 180px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); object-fit: cover; display: block;">
      <button type="button" class="remove-img-btn" data-idx="${i}" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; font-weight: bold;">✕</button>
    `;
    wrap.querySelector('.remove-img-btn').addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      pendingImages.splice(idx, 1);
      renderPreviews();
    });
    container.appendChild(wrap);
  });

  // アップロード上限表示
  const countEl = document.createElement('div');
  countEl.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); align-self: center;';
  countEl.textContent = `${pendingImages.length} / ${MAX_IMAGES} 枚`;
  container.appendChild(countEl);
}

function setupListeners() {
  // Ctrl+V でクリップボードから画像を取得
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          addImage(file);
          break;
        }
      }
    }
  });

  el.addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = el.addForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';

    try {
      const genre = genres.find(g => g.id === selectedGenreId);
      if (!genre) return;

      const values = {};
      genre.fields.forEach(field => {
        if (field.key === 'image') return; // 画像は別処理
        const input = document.getElementById(`field-${field.key}`);
        if (input) values[field.key] = input.value.trim();
      });

      const question = values['question'] || '';
      const answer = values['answer'] || '';
      if (!question || !answer) return;

      // 補足フィールドを answer に結合
      const extraParts = [];
      genre.fields
        .filter(f => !['question', 'answer', 'image'].includes(f.key))
        .forEach(f => {
          if (values[f.key]) extraParts.push(`[${f.label}]\n${values[f.key]}`);
        });
      const fullAnswer = extraParts.length > 0 ? answer + '\n\n---\n' + extraParts.join('\n\n') : answer;

      // 画像をSupabaseにアップロード
      let imageValue = null;
      if (pendingImages.length > 0) {
        const urls = await Promise.all(pendingImages.map(img => uploadImageToSupabase(img.file)));
        imageValue = JSON.stringify(urls); // 配列をJSON文字列として保存
      }

      await StorageManager.addCard(question, fullAnswer, imageValue, selectedGenreId);

      // フォームリセット
      el.addForm.querySelectorAll('input:not([type="file"]), textarea').forEach(i => i.value = '');
      pendingImages = [];
      renderPreviews();

      el.successMsg.classList.remove('hidden');
      setTimeout(() => el.successMsg.classList.add('hidden'), 3000);

    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '追加する';
    }
  });
}

function getPlaceholder(key) {
  const placeholders = {
    question: '例: What is photosynthesis?',
    answer: '例: 光合成とは、植物が光エネルギーを使って...',
    example: '例: The sun provides energy for photosynthesis.',
    note: '例: /ˌfoʊtəˈsɪnθɪsɪs/ (名詞)',
    formula: '例: E = mc²',
    definition: '例: 物質の最小単位',
    year: '例: 1945年',
    process: '例: ミトコンドリアが...'
  };
  return placeholders[key] || '';
}

document.addEventListener('DOMContentLoaded', init);
