import StorageManager, { uploadImageToSupabase } from './storage.js';

const MAX_IMAGES = 3;

let selectedGenreId = 'other';
let genres = [];
let pendingImages = {}; // { [fieldKey]: [{file, previewUrl}] } の形式

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
  pendingImages = {};

  const genre = genres.find(g => g.id === selectedGenreId);
  if (!genre) return;

  genre.fields.forEach(field => {
    // image タイプはペーストUIを使う
    if (field.type === 'image') {
      pendingImages[field.key] = [];
      el.formFields.appendChild(buildImagePasteUI(field));
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
      // number / date / url などをそのまま利用
      input.type = ['number', 'date', 'url'].includes(field.type) ? field.type : 'text';
    }
    input.id = `field-${field.key}`;
    input.name = field.key;
    if (field.required) input.required = true;
    // プレースホルダーはフィールドラベルから自動生成（プレビューと統一）
    input.placeholder = `${field.label}を入力…`;

    div.appendChild(label);
    div.appendChild(input);
    el.formFields.appendChild(div);
  });
}

function buildImagePasteUI(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'form-group image-field-group';
  wrapper.dataset.fieldKey = field.key;

  wrapper.innerHTML = `
    <label>${field.label}（任意・最大3枚）<span style="color: var(--text-secondary); font-size: 0.8rem; margin-left: 0.5rem;">Ctrl+V でベースト</span></label>
    <div class="paste-zone" data-field-key="${field.key}" tabindex="0" style="
      border: 2px dashed rgba(99,102,241,0.4);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
      color: var(--text-secondary);
      background: rgba(0,0,0,0.15);
      outline: none;
      cursor: pointer;
    ">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">🖼️</div>
      <div style="font-size: 0.9rem;">Ctrl+V でスクリーンショットを貼り付け（最大3枚）</div>
    </div>
    <div class="image-previews" data-field-key="${field.key}" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem;"></div>
  `;

  // ペーストゾーンをクリックでフォーカス（Ctrl+Vしやすくするため）
  const pasteZone = wrapper.querySelector('.paste-zone');
  pasteZone.addEventListener('click', () => pasteZone.focus());

  return wrapper;
}

function addImage(fieldKey, file) {
  if (!pendingImages[fieldKey]) pendingImages[fieldKey] = [];
  if (pendingImages[fieldKey].length >= MAX_IMAGES) return;
  
  const url = URL.createObjectURL(file);
  pendingImages[fieldKey].push({ file, previewUrl: url });
  renderPreviews(fieldKey);
}

function renderPreviews(fieldKey) {
  const container = document.querySelector(`.image-previews[data-field-key="${fieldKey}"]`);
  if (!container) return;
  container.innerHTML = '';

  pendingImages[fieldKey].forEach((img, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position: relative; display: inline-block;';
    wrap.innerHTML = `
      <img src="${img.previewUrl}" alt="preview" style="max-height: 120px; max-width: 180px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); object-fit: cover; display: block;">
      <button type="button" class="remove-img-btn" data-field-key="${fieldKey}" data-idx="${i}" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; font-weight: bold;">✕</button>
    `;
    wrap.querySelector('.remove-img-btn').addEventListener('click', (e) => {
      const fKey = e.target.dataset.fieldKey;
      const idx = parseInt(e.target.dataset.idx, 10);
      pendingImages[fKey].splice(idx, 1);
      renderPreviews(fKey);
    });
    container.appendChild(wrap);
  });

  // アップロード上限表示
  const countEl = document.createElement('div');
  countEl.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); align-self: center;';
  countEl.textContent = `${pendingImages[fieldKey].length} / ${MAX_IMAGES} 枚`;
  container.appendChild(countEl);
}

function setupListeners() {
  // Ctrl+V でクリップボードから画像を取得
  document.addEventListener('paste', (e) => {
    // アクティブな要素が paste-zone かどうかを確認
    const activeZone = document.activeElement.closest('.paste-zone');
    if (!activeZone) return;

    const fieldKey = activeZone.dataset.fieldKey;
    if (!fieldKey) return;

    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          addImage(fieldKey, file);
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
        const input = document.getElementById(`field-${field.key}`);
        if (input) values[field.key] = input.value.trim();
      });

      // 役割ごとに結合
      const qParts = [];
      const aParts = [];
      
      genre.fields.forEach(f => {
        const val = values[f.key];
        if (!val) return;
        if (f.role === 'question') {
          qParts.push(`[${f.label}]\n${val}`);
        } else if (f.role === 'answer') {
          aParts.push(`[${f.label}]\n${val}`);
        }
      });

      if (qParts.length === 0 || aParts.length === 0) {
        throw new Error('問題と答えをそれぞれ1つ以上入力してください。');
      }

      const question = qParts.join('\n\n');
      const fullAnswer = aParts.join('\n\n');

      // 画像をSupabaseにアップロード
      // 全フィールドの画像を1つのJSON配列に集約
      let imageValue = null;
      const allFiles = [];
      const imageFieldKeys = Object.keys(pendingImages);
      
      for (const key of imageFieldKeys) {
        pendingImages[key].forEach(img => {
          allFiles.push(img.file);
        });
      }

      if (allFiles.length > 0) {
        const urls = await Promise.all(allFiles.map(file => uploadImageToSupabase(file)));
        imageValue = JSON.stringify(urls);
      }

      await StorageManager.addCard(question, fullAnswer, imageValue, selectedGenreId);

      // フォームリセット
      el.addForm.querySelectorAll('input:not([type="file"]), textarea').forEach(i => i.value = '');
      pendingImages = {};
      Object.keys(pendingImages).forEach(key => renderPreviews(key)); // 念のため初期化
      renderForm(); // フォームを再生成してリセット

      el.successMsg.classList.remove('hidden');
      setTimeout(() => el.successMsg.classList.add('hidden'), 3000);

    } catch (err) {
      console.error(err);
      alert('エラーが発生しました: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '追加する';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
