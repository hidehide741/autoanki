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

let currentPreviewGenre = null;
let currentPreviewValues = {};

function renderForm() {
  el.formFields.innerHTML = '';
  pendingImages = {};
  currentPreviewValues = {};

  const genre = genres.find(g => g.id === selectedGenreId);
  if (!genre) return;
  currentPreviewGenre = genre;

  // role ごとのブロックコンテナを作成
  const qBlock = createRoleBlock('問題（おもて）', '#6366f1');
  const aBlock = createRoleBlock('答え（うら）', '#8b5cf6');
  const qInner = qBlock.querySelector('.role-block-inner');
  const aInner = aBlock.querySelector('.role-block-inner');

  genre.fields.forEach(field => {
    const targetInner = field.role === 'answer' ? aInner : qInner;

    // image タイプはペーストUIを使う
    if (field.type === 'image') {
      pendingImages[field.key] = [];
      targetInner.appendChild(buildImagePasteUI(field));
      return;
    }

    // static (固定テキスト) タイプはユーザーが自由にテキストを入力できる input を表示
    if (field.type === 'static') {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.htmlFor = `field-${field.key}`;
      label.innerHTML = `🔖 ラベルテキスト`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `field-${field.key}`;
      input.name = field.key;
      input.placeholder = `${field.label}`;
      input.value = field.label; // 初期値は設定時のラベル
      input.style.cssText = 'border-left: 3px solid #a78bfa; color: #a78bfa;';
      input.addEventListener('input', () => {
        currentPreviewValues[field.key] = input.value;
        updateCardPreview(genre, currentPreviewValues);
      });
      // 初期値をプレビュー値にも反映
      currentPreviewValues[field.key] = input.value;
      div.appendChild(label);
      div.appendChild(input);
      targetInner.appendChild(div);
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
      input.type = ['number', 'date', 'url'].includes(field.type) ? field.type : 'text';
    }
    input.id = `field-${field.key}`;
    input.name = field.key;
    if (field.required) input.required = true;
    input.placeholder = `${field.label}を入力…`;

    // 入力イベントでプレビュー更新
    input.addEventListener('input', () => {
      currentPreviewValues[field.key] = input.value;
      updateCardPreview(genre, currentPreviewValues);
    });

    div.appendChild(label);
    div.appendChild(input);
    targetInner.appendChild(div);
  });

  el.formFields.appendChild(qBlock);
  el.formFields.appendChild(aBlock);

  // 初期プレビュー
  updateCardPreview(genre, currentPreviewValues);
}

function createRoleBlock(title, color) {
  const block = document.createElement('div');
  block.style.cssText = `
    background: rgba(0,0,0,0.18);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    padding: 1.25rem 1.5rem 1rem;
    margin-bottom: 1.25rem;
  `;
  block.innerHTML = `
    <div style="font-size:0.8rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
      ${title}
    </div>
    <div class="role-block-inner"></div>
  `;
  return block;
}

// プレビューパネルを更新する関数
function updateCardPreview(genre, values) {
  const panel = document.getElementById('card-preview-panel');
  if (!panel) return;

  // role ごとに HTML を組み立てる（テキスト＋画像両対応）
  function buildSideHtml(role) {
    const fields = genre.fields.filter(f => f.role === role);
    let html = '';
    fields.forEach(f => {
      if (f.type === 'static') {
        // 固定テキスト：ユーザーが入力した値（なければ field.label）をラベルとして表示
        const staticVal = (values[f.key] !== undefined && values[f.key] !== '') ? values[f.key] : f.label;
        html += `<div style="padding:0.6rem 1rem;margin:0.4rem 0 0.6rem 0;background:rgba(99,102,241,0.1);border-radius:8px;border-left:4px solid #a78bfa;font-weight:600;font-size:1rem;color:#a78bfa;">${escapeHtml(staticVal)}</div>`;
      } else if (f.type === 'image') {
        const imgs = pendingImages[f.key] || [];
        if (imgs.length > 0) {
          html += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.6rem;">`;
          imgs.forEach(img => {
            html += `<img src="${img.previewUrl}" style="max-height:100px;max-width:140px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);object-fit:cover;">`;
          });
          html += `</div>`;
        }
      } else {
        const val = values[f.key] || '';
        html += `<div style="background:rgba(0,0,0,0.12);padding:0.9rem;border-radius:8px;margin-bottom:0.6rem;min-height:36px;font-size:0.92rem;">${val ? escapeHtml(val).replace(/\n/g,'<br>') : '<span style=\"color:#94a3b8;\">（未入力）</span>'}</div>`;
      }
    });
    if (!html) html = `<div style="background:rgba(0,0,0,0.08);padding:0.8rem;border-radius:8px;color:#94a3b8;font-size:0.85rem;">（フィールドがありません）</div>`;
    return html;
  }

  const qBodyHtml = buildSideHtml('question');
  const aBodyHtml = buildSideHtml('answer');

  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div>
        <div style="color:#a78bfa;font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em;">問題</div>
        ${qBodyHtml}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <div style="color:#a78bfa;font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">答え</div>
          <button id="preview-toggle-answer" type="button" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:var(--text-secondary);padding:0.25rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">表示</button>
        </div>
        <div id="preview-answer-body" style="display:none;">${aBodyHtml}</div>
      </div>
    </div>`;

  const toggleBtn = document.getElementById('preview-toggle-answer');
  const answerDiv = document.getElementById('preview-answer-body');
  if (toggleBtn && answerDiv) {
    toggleBtn.addEventListener('click', () => {
      const shown = answerDiv.style.display === 'block';
      answerDiv.style.display = shown ? 'none' : 'block';
      toggleBtn.textContent = shown ? '表示' : '非表示';
      toggleBtn.style.color = shown ? 'var(--text-secondary)' : '#a78bfa';
    });
  }
}

// HTMLエスケープ関数
function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, function(tag) {
    const chars = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    };
    return chars[tag] || tag;
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

  // カードプレビューも同期更新
  if (currentPreviewGenre) updateCardPreview(currentPreviewGenre, currentPreviewValues);

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
      const removed = pendingImages[fKey].splice(idx, 1);
      if (removed[0]?.previewUrl) URL.revokeObjectURL(removed[0].previewUrl);
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
        // static は値が空のとき field.label を使用、それ以外は値がなければスキップ
        const saveVal = f.type === 'static' ? (val || f.label) : val;
        if (!saveVal) return;
        if (f.role === 'question') {
          qParts.push(`[${f.label}]\n${saveVal}`);
        } else if (f.role === 'answer') {
          aParts.push(`[${f.label}]\n${saveVal}`);
        }
      });

      if (qParts.length === 0 || aParts.length === 0) {
        throw new Error('問題と答えをそれぞれ1つ以上入力してください。');
      }

      const question = qParts.join('\n\n');
      const fullAnswer = aParts.join('\n\n');

      // 画像をSupabaseにアップロード
      // 全フィールドの画像を role 情報付きで集約
      let imageValue = null;
      const uploadTasks = [];
      const imageFieldKeys = Object.keys(pendingImages);
      
      for (const key of imageFieldKeys) {
        const field = genre.fields.find(f => f.key === key);
        const role = field?.role || 'question';
        
        pendingImages[key].forEach(img => {
          uploadTasks.push((async () => {
            const url = await uploadImageToSupabase(img.file);
            return { url, role, fieldKey: key }; // fieldKey を追加
          })());
        });
      }
      
      if (uploadTasks.length > 0) {
        const results = await Promise.all(uploadTasks);
        imageValue = JSON.stringify(results);
      }

      await StorageManager.addCard(question, fullAnswer, imageValue, selectedGenreId);

      // フォームリセット
      el.addForm.querySelectorAll('input:not([type="file"]), textarea').forEach(i => i.value = '');
      // blob URL を解放してメモリリークを防止
      Object.values(pendingImages).forEach(imgs =>
        imgs.forEach(img => img.previewUrl && URL.revokeObjectURL(img.previewUrl))
      );
      pendingImages = {};
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
