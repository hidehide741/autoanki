import StorageManager, { uploadImageToSupabase } from './storage.js';

const PAGE_SIZE = 25;

let allCards  = [];
let genres    = [];
let filtered  = [];
let currentPage = 1;
let sortCol   = 'nextReviewDate';
let sortAsc   = true;
let activeCardId = null;
let pendingEditImages = {}; // { [fieldKey]: [] } の形式
const MAX_EDIT_IMAGES = 3;

const el = {
  searchInput:  document.getElementById('search-input'),
  genreFilter:  document.getElementById('genre-filter'),
  countBadge:   document.getElementById('count-badge'),
  tableWrap:    document.getElementById('table-wrap'),
  tableBody:    document.getElementById('table-body'),
  emptyState:   document.getElementById('empty-state'),
  pagination:   document.getElementById('pagination'),

  modalOverlay: document.getElementById('modal-overlay'),
  modalClose:   document.getElementById('modal-close'),
  modalGenre:   document.getElementById('modal-genre-badge'),
  modalQ:       document.getElementById('modal-question'),
  modalImages:  document.getElementById('modal-images'),
  modalAnswer:  document.getElementById('modal-answer'),
  statNext:     document.getElementById('stat-next'),
  statInterval: document.getElementById('stat-interval'),
  statEase:     document.getElementById('stat-ease'),
  modalDelete:  document.getElementById('modal-delete-btn'),
  modalEdit:    document.getElementById('modal-edit-btn'),

  editOverlay:  document.getElementById('edit-modal-overlay'),
  editClose:    document.getElementById('edit-modal-close'),
  editFields:   document.getElementById('edit-fields'),
  editImgPrev:  document.getElementById('edit-image-preview'),
  editSaveBtn:  document.getElementById('edit-save-btn'),
  editSaveMsg:  document.getElementById('edit-save-msg')
};

// ===== 初期化 =====
async function init() {
  [allCards, genres] = await Promise.all([
    StorageManager.getAllCards(),
    StorageManager.getGenres()
  ]);
  buildGenreFilter();
  setupHeaderSort();
  setupListeners();
  applyAndRender();
}

// ===== ジャンルフィルター =====
function buildGenreFilter() {
  const used = new Set(allCards.map(c => c.genre).filter(Boolean));
  genres.filter(g => used.has(g.id)).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    el.genreFilter.appendChild(opt);
  });
}

// ===== カラムヘッダーのソートクリック =====
function setupHeaderSort() {
  document.querySelectorAll('.db-table th[data-col]').forEach(th => {
    const col = th.dataset.col;
    if (!col || col === 'thumb') return;
    th.addEventListener('click', () => {
      if (sortCol === col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = col;
        sortAsc = true;
      }
      updateSortUI();
      applyAndRender();
    });
  });
}

function updateSortUI() {
  document.querySelectorAll('.db-table th[data-col]').forEach(th => {
    th.classList.remove('sorted');
    const ind = th.querySelector('.sort-indicator');
    if (ind) ind.textContent = '↕';
  });
  const active = document.querySelector(`.db-table th[data-col="${sortCol}"]`);
  if (active) {
    active.classList.add('sorted');
    const ind = active.querySelector('.sort-indicator');
    if (ind) ind.textContent = sortAsc ? '↑' : '↓';
  }
}

// ===== フィルター → ソート → 描画 =====
function applyAndRender() {
  const query = el.searchInput.value.trim().toLowerCase();
  const genre = el.genreFilter.value;

  filtered = allCards.filter(card => {
    const matchQ = !query || (card.question || '').toLowerCase().includes(query) || (card.answer || '').toLowerCase().includes(query);
    const matchG = !genre || card.genre === genre;
    return matchQ && matchG;
  });

  // ソート
  filtered.sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === 'nextReviewDate') { av = av || Infinity; bv = bv || Infinity; }
    if (sortCol === 'question' || sortCol === 'answer') {
      av = (av || '').toLowerCase();
      bv = (bv || '').toLowerCase();
    }
    if (sortCol === 'genre') {
      av = genreName(a.genre); bv = genreName(b.genre);
    }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ?  1 : -1;
    return 0;
  });

  currentPage = 1;
  renderTable();
  renderPagination();

  const totalLabel = query || genre ? `検索結果: ${filtered.length} 件 / 全 ${allCards.length} 件` : `全 ${allCards.length} 件`;
  el.countBadge.textContent = totalLabel;
}

// ===== テーブル描画 =====
function renderTable() {
  el.tableBody.innerHTML = '';
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    el.tableWrap.classList.add('hidden');
    el.emptyState.classList.remove('hidden');
    return;
  }
  el.emptyState.classList.add('hidden');
  el.tableWrap.classList.remove('hidden');

  page.forEach(card => {
    const isDue = card.nextReviewDate && card.nextReviewDate <= Date.now();
    const dueStr = card.nextReviewDate
      ? (isDue ? '🎯 今すぐ' : fmtDate(card.nextReviewDate))
      : '—';

    // サムネイル
    let thumbHtml = '<td><span style="color:var(--text-secondary);font-size:0.75rem;">—</span></td>';
    if (card.image) {
      try {
        const imgs = JSON.parse(card.image);
        const url = Array.isArray(imgs) ? imgs[0] : card.image;
        if (url) thumbHtml = `<td><img src="${esc(url)}" class="thumb-sm" alt="img" loading="lazy"></td>`;
      } catch {
        if (card.image.startsWith('http')) {
          thumbHtml = `<td><img src="${esc(card.image)}" class="thumb-sm" alt="img" loading="lazy"></td>`;
        }
      }
    }

    const tr = document.createElement('tr');
    tr.dataset.id = card.id;
    // テーブル用にはラベルを除去して最初の1行程度を表示
    const displayQ = (card.question || '').replace(/^\[.*?\]\n/, '').split('\n')[0];
    tr.innerHTML = `
      ${thumbHtml}
      <td class="cell-question"><div class="cell-text" title="${esc(card.question)}">${esc(displayQ || '無題')}</div></td>
      <td><span class="genre-badge">${esc(genreName(card.genre))}</span></td>
      <td><span class="due-badge ${isDue ? 'now' : 'later'}">${dueStr}</span></td>
      <td style="color:var(--text-secondary);">${fmtInterval(card.interval)}</td>
      <td class="action-cell">
        <button class="icon-btn-sm view-btn" data-id="${card.id}" title="閲覧">👁️</button>
        <button class="icon-btn-sm edit-btn" data-id="${card.id}" title="編集">✏️</button>
        <button class="icon-btn-sm del delete-btn" data-id="${card.id}" title="削除">🗑️</button>
      </td>
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn') || e.target.closest('.edit-btn') || e.target.closest('.view-btn')) return;
      openModal(card.id);
    });
    tr.querySelector('.view-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(card.id);
    });
    tr.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(card.id);
    });
    tr.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(card.id);
    });

    el.tableBody.appendChild(tr);
  });
}

// ===== ページネーション =====
function renderPagination() {
  el.pagination.innerHTML = '';
  const total = Math.ceil(filtered.length / PAGE_SIZE);
  if (total <= 1) return;

  const addBtn = (label, page, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (page === currentPage ? ' active' : '');
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener('click', () => {
      currentPage = page;
      renderTable();
      renderPagination();
      document.querySelector('.db-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    el.pagination.appendChild(btn);
  };

  addBtn('‹', currentPage - 1, currentPage === 1);
  const pages = new Set([1, total, currentPage - 1, currentPage, currentPage + 1].filter(p => p >= 1 && p <= total));
  let prev = null;
  [...pages].sort((a, b) => a - b).forEach(p => {
    if (prev !== null && p - prev > 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.cssText = 'color:var(--text-secondary);padding:0 0.25rem;font-size:0.85rem;';
      el.pagination.appendChild(dots);
    }
    addBtn(p, p);
    prev = p;
  });
  addBtn('›', currentPage + 1, currentPage === total);
}

// ===== 詳細モーダル =====
function openModal(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  activeCardId = id;

  const genreDef = genres.find(g => g.id === card.genre);
  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea' },
    { key: 'answer',   label: '答え', type: 'textarea' }
  ];

  el.modalGenre.textContent = genreDef?.name || 'その他';
  el.modalQ.innerHTML = ''; 
  el.modalImages.innerHTML = '';
  el.modalImages.className = 'image-grid hidden'; // 初期化
  el.modalAnswer.innerHTML = '';

  fields.forEach(field => {
    let val = '';
    const rawContent = (field.role === 'question' ? card.question : card.answer) || '';
    
    // "[ラベル]\n内容" 形式から抽出
    const searchStr = `[${field.label}]\n`;
    const startIdx = rawContent.indexOf(searchStr);
    if (startIdx !== -1) {
      const contentStart = startIdx + searchStr.length;
      const nextIdx = rawContent.indexOf('\n\n[', contentStart);
      val = (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
    } else if (field.key === 'question' || field.key === 'answer') {
      // 互換性のため、ラベルがない場合は全体を表示
      val = rawContent;
    }

    if (!val && !field.required) return;

    if (field.type === 'image') {
      // 画像は一括管理されているものを表示（便宜上、最初の画像フィールドにすべて表示）
      if (card.image && el.modalImages.childElementCount === 0) {
        try {
          const urls = JSON.parse(card.image).filter(u => u);
          if (urls.length > 0) {
            urls.forEach(url => {
              const img = document.createElement('img');
              img.src = url; img.alt = field.label;
              el.modalImages.appendChild(img);
            });
            el.modalImages.dataset.cols = Math.min(urls.length, 3);
            el.modalImages.classList.remove('hidden');
          }
        } catch {
          const img = document.createElement('img');
          img.src = card.image; img.alt = field.label;
          el.modalImages.appendChild(img);
          el.modalImages.dataset.cols = 1;
          el.modalImages.classList.remove('hidden');
        }
      }
    } else {
      const fieldWrap = document.createElement('div');
      fieldWrap.style.marginBottom = '1rem';
      fieldWrap.innerHTML = `
        <p class="modal-label">${esc(field.label)}</p>
        <div class="modal-value ${['answer', 'question'].includes(field.key) ? '' : 'modal-extra-value'}">${esc(val)}</div>
      `;
      // question 以外は answer 側に、question は Q 側に配置（既存UI互換）
      if (field.key === 'question') el.modalQ.appendChild(fieldWrap);
      else el.modalAnswer.appendChild(fieldWrap);
    }
  });

  const isDue = card.nextReviewDate && card.nextReviewDate <= Date.now();
  el.statNext.textContent     = card.nextReviewDate ? (isDue ? '🎯 今すぐ' : fmtDate(card.nextReviewDate)) : '未設定';
  el.statNext.style.color     = isDue ? '#10b981' : '#a78bfa';
  el.statInterval.textContent = fmtInterval(card.interval);
  el.statEase.textContent     = card.easeFactor != null ? card.easeFactor.toFixed(2) : '—';

  el.modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  el.modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  activeCardId = null;
}

// ===== 編集モーダル =====
function openEditModal(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  activeCardId = id;
  pendingEditImages = {};

  const genreDef = genres.find(g => g.id === card.genre);
  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea', required: true },
    { key: 'answer',   label: '答え', type: 'textarea', required: false }
  ];

  el.editFields.innerHTML = '';

  fields.forEach(field => {
    // image タイプは専用UI
    if (field.type === 'image') {
      if (!pendingEditImages[field.key]) pendingEditImages[field.key] = [];
      
      // 初回のみ既存画像をセット（もしあれば）
      // 現在のDBは一括保存なので、便宜上最初の画像フィールドにすべて入れる
      if (card.image && Object.keys(pendingEditImages).length === 1) {
        try {
          const urls = JSON.parse(card.image);
          if (Array.isArray(urls)) {
            urls.forEach(url => {
              if (pendingEditImages[field.key].length < MAX_EDIT_IMAGES) {
                pendingEditImages[field.key].push({ url });
              }
            });
          } else { // 単一URLの場合
            if (pendingEditImages[field.key].length < MAX_EDIT_IMAGES) {
              pendingEditImages[field.key].push({ url: card.image });
            }
          }
        } catch { // JSONパース失敗 (単一URLとみなす)
          if (pendingEditImages[field.key].length < MAX_EDIT_IMAGES) {
            pendingEditImages[field.key].push({ url: card.image });
          }
        }
      }

      el.editFields.appendChild(buildEditImagePasteUI(field));
      return;
    }

    const div = document.createElement('div');
    div.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = `edit-field-${field.key}`;
    label.innerHTML = field.label + (field.required
      ? '<span class="required-badge">必須</span>'
      : '');

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = ['number', 'date', 'url'].includes(field.type) ? field.type : 'text';
    }
    input.id = `edit-field-${field.key}`;
    input.name = field.key;
    input.dataset.key = field.key;
    if (field.required) input.required = true;
    input.placeholder = `${field.label}を入力…`;

    // 既存値をセット（[ラベル]\n内容 形式から抽出）
    const rawContent = (field.role === 'question' ? card.question : card.answer) || '';
    const searchStr = `[${field.label}]\n`;
    const startIdx = rawContent.indexOf(searchStr);
    if (startIdx !== -1) {
      const contentStart = startIdx + searchStr.length;
      const nextIdx = rawContent.indexOf('\n\n[', contentStart);
      input.value = (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
    } else if (!rawContent.includes('[') && (field.key === 'question' || field.key === 'answer')) {
      // 古い形式（ラベルなし）への互換性
      input.value = rawContent;
    } else {
      input.value = '';
    }

    div.appendChild(label);
    div.appendChild(input);
    el.editFields.appendChild(div);
  });

  el.editSaveMsg.classList.add('hidden');
  el.editOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function buildEditImagePasteUI(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'form-group image-field-group';
  wrapper.dataset.fieldKey = field.key;

  wrapper.innerHTML = `
    <label>${field.label}（任意・最大3枚）<span style="color:var(--text-secondary);font-size:0.8rem;margin-left:0.5rem;">Ctrl+V でペースト</span></label>
    <div class="edit-paste-zone" data-field-key="${field.key}" tabindex="0" style="
      border:2px dashed rgba(99,102,241,0.4);
      border-radius:12px;
      padding:1.5rem;
      text-align:center;
      color:var(--text-secondary);
      background:rgba(0,0,0,0.15);
      outline:none;
      cursor:pointer;
    ">
      <div style="font-size:2rem;margin-bottom:0.5rem;">🖼️</div>
      <div style="font-size:0.9rem;">Ctrl+V でスクリーンショットを貼り付け（最大3枚）</div>
    </div>
    <div class="edit-image-previews" data-field-key="${field.key}" style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.75rem;"></div>
  `;

  const pasteZone = wrapper.querySelector('.edit-paste-zone');
  pasteZone.addEventListener('click', () => pasteZone.focus());

  // 一度描画した後に表示を更新
  setTimeout(() => renderEditPreviews(field.key), 0);
  return wrapper;
}

function addEditImage(fieldKey, file) {
  if (!pendingEditImages[fieldKey]) pendingEditImages[fieldKey] = [];
  if (pendingEditImages[fieldKey].length >= MAX_EDIT_IMAGES) return;
  
  const url = URL.createObjectURL(file);
  pendingEditImages[fieldKey].push({ file, previewUrl: url });
  renderEditPreviews(fieldKey);
}

function renderEditPreviews(fieldKey) {
  const container = document.querySelector(`.edit-image-previews[data-field-key="${fieldKey}"]`);
  if (!container) return;
  container.innerHTML = '';

  const list = pendingEditImages[fieldKey] || [];
  list.forEach((img, i) => {
    const src = img.previewUrl || img.url || '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;';
    wrap.innerHTML = `
      <img src="${esc(src)}" style="max-height:120px;max-width:180px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);object-fit:cover;display:block;">
      <button type="button" class="remove-edit-img-btn" data-field-key="${fieldKey}" data-idx="${i}" style="position:absolute;top:-8px;right:-8px;background:#ef4444;color:white;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;justify-content:center;font-weight:bold;">✕</button>
    `;
    wrap.querySelector('.remove-edit-img-btn').addEventListener('click', e => {
      const fKey = e.target.dataset.fieldKey;
      const idx = parseInt(e.target.dataset.idx, 10);
      pendingEditImages[fKey].splice(idx, 1);
      renderEditPreviews(fKey);
    });
    container.appendChild(wrap);
  });

  const count = document.createElement('div');
  count.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);align-self:center;';
  count.textContent = `${list.length} / ${MAX_EDIT_IMAGES} 枚`;
  container.appendChild(count);
}

function closeEditModal() {
  el.editOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  pendingEditImages = {};
}

async function saveCardEdit() {
  const card = allCards.find(c => c.id === activeCardId);
  if (!card) return;

  const genreDef = genres.find(g => g.id === card.genre);
  const fields = genreDef?.fields || [];

  // 各フィールド値を収集
  const values = {};
  el.editFields.querySelectorAll('[id^="edit-field-"]').forEach(input => {
    const key = input.name || input.dataset.key;
    if (key) values[key] = input.value.trim();
  });

  // 役割ごとに結合（options.js と同じロジック）
  const qParts = [];
  const aParts = [];
  
  fields.forEach(f => {
    const val = values[f.key];
    if (!val) return;
    if (f.role === 'question') {
      qParts.push(`[${f.label}]\n${val}`);
    } else if (f.role === 'answer') {
      aParts.push(`[${f.label}]\n${val}`);
    }
  });

  if (qParts.length === 0 || aParts.length === 0) {
    alert('問題と答えをそれぞれ1つ以上入力してください。');
    return;
  }

  const newQuestion = qParts.join('\n\n');
  const newFullAnswer = aParts.join('\n\n');

  // 画像アップロード（新規追加分を統合してアップロード）
  let imageValue = null;
  const allUrls = [];

  for (const fieldKey in pendingEditImages) {
    const imagesForField = pendingEditImages[fieldKey];
    const newFiles = imagesForField.filter(img => img.file);
    const existingUrls = imagesForField.filter(img => img.url && !img.file).map(img => img.url);
    
    let uploadedUrls = [];
    if (newFiles.length > 0) {
      uploadedUrls = await Promise.all(newFiles.map(img => uploadImageToSupabase(img.file)));
    }
    allUrls.push(...existingUrls, ...uploadedUrls);
  }
  
  if (allUrls.length > 0) imageValue = JSON.stringify(allUrls);
  else imageValue = null; // 全削除された

  const updated = { ...card, question: newQuestion, answer: newFullAnswer, image: imageValue };
  await StorageManager.saveCardUpdate(updated);

  const idx = allCards.findIndex(c => c.id === activeCardId);
  if (idx !== -1) allCards[idx] = updated;

  el.editSaveMsg.classList.remove('hidden');
  setTimeout(() => el.editSaveMsg.classList.add('hidden'), 2500);
  applyAndRender();
}

// ===== 削除 =====
async function confirmDelete(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  if (!confirm(`「${(card.question || '').slice(0, 40)}」を削除しますか？`)) return;
  await StorageManager.deleteCard(id);
  allCards = allCards.filter(c => c.id !== id);
  closeModal();
  applyAndRender();
}

// ===== リスナー =====
function setupListeners() {
  el.searchInput.addEventListener('input', applyAndRender);
  el.genreFilter.addEventListener('change', applyAndRender);
  el.modalClose.addEventListener('click', closeModal);
  el.modalOverlay.addEventListener('click', e => { if (e.target === el.modalOverlay) closeModal(); });
  el.modalDelete.addEventListener('click', () => { if (activeCardId) confirmDelete(activeCardId); });
  el.modalEdit?.addEventListener('click', () => { if (activeCardId) { closeModal(); openEditModal(activeCardId); } });
  el.editClose.addEventListener('click', closeEditModal);
  el.editOverlay.addEventListener('click', e => { if (e.target === el.editOverlay) closeEditModal(); });
  el.editSaveBtn.addEventListener('click', saveCardEdit);
  // Ctrl+V ペースト
  document.addEventListener('paste', e => {
    if (el.editOverlay.classList.contains('hidden')) return;
    
    const activeZone = document.activeElement.closest('.edit-paste-zone');
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
          addEditImage(fieldKey, file);
          break;
        }
      }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeEditModal(); } });
}

// ===== ユーティリティ =====
function genreName(id) {
  return genres.find(g => g.id === id)?.name || id || 'その他';
}
function fmtInterval(ms) {
  if (ms == null) return '—';
  const DAY  = 86400000;
  const HOUR = 3600000;
  if (ms < HOUR)  return `${Math.round(ms / 60000)} 分`;
  if (ms < DAY)   return `${Math.round(ms / HOUR)} 時間`;
  return `${Math.round(ms / DAY)} 日`;
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"/]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;','/':'&#47;'}[t]));
}

document.addEventListener('DOMContentLoaded', init);
