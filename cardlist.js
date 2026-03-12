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
        let url = '';
        if (Array.isArray(imgs) && imgs.length > 0) {
          url = typeof imgs[0] === 'object' ? imgs[0].url : imgs[0];
        } else if (typeof imgs === 'object' && imgs.url) {
          url = imgs.url;
        } else {
          url = card.image;
        }
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

  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea', role: 'question' },
    { key: 'answer',   label: '答え', type: 'textarea', role: 'answer' }
  ];

  // 画像のパース
  let images = [];
  if (card.image) {
    try {
      const parsed = JSON.parse(card.image);
      images = Array.isArray(parsed) ? parsed : [{ url: card.image, role: 'question' }];
      if (images.length > 0 && typeof images[0] === 'string') {
        images = images.map(url => ({ url, role: 'question' }));
      }
    } catch {
      images = [{ url: card.image, role: 'question' }];
    }
  }

  el.modalGenre.textContent = genreDef?.name || 'その他';
  el.modalQ.innerHTML = ''; 
  el.modalAnswer.innerHTML = '';
  el.modalImages.innerHTML = ''; // Clear the old modalImages container
  el.modalImages.classList.add('hidden'); // Hide it by default

  // フィールドごとのレンダリング
  fields.forEach(field => {
    let val = '';
    const rawContent = (field.role === 'question' ? card.question : card.answer) || '';
    
    // テキスト抽出
    const searchStr = `[${field.label}]\n`;
    const startIdx = rawContent.indexOf(searchStr);
    if (startIdx !== -1) {
      const contentStart = startIdx + searchStr.length;
      const nextIdx = rawContent.indexOf('\n\n[', contentStart);
      val = (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
    } else if (field.key === 'question' || field.key === 'answer') {
      val = rawContent;
    }

    if (!val && !field.required && field.type !== 'image') return;

    if (field.type === 'static') {
      const staticEl = document.createElement('div');
      staticEl.style.cssText = 'padding: 0.75rem 1rem; margin: 1rem 0; background: rgba(99,102,241,0.08); border-radius: 8px; border-left: 4px solid #a78bfa; font-weight: 600; font-size: 1rem; color: #a78bfa;';
      staticEl.textContent = field.label;
      (field.role === 'question' ? el.modalQ : el.modalAnswer).appendChild(staticEl);
    } else if (field.type === 'image') {
      const fieldImages = images.filter(img => img.role === field.role);
      if (fieldImages.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'image-grid';
        grid.style.marginTop = '0.5rem';
        grid.dataset.cols = Math.min(fieldImages.length, 3);
        fieldImages.forEach(img => {
          const imgEl = document.createElement('img');
          imgEl.src = img.url;
          grid.appendChild(imgEl);
        });
        (field.role === 'question' ? el.modalQ : el.modalAnswer).appendChild(grid);
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

let editPreviewValues = {};
let editPreviewGenre = null;

// ===== 編集プレビュー更新 =====
function updateEditPreview() {
  const panel = document.getElementById('edit-preview-panel');
  if (!panel || !editPreviewGenre) return;

  function buildSideHtml(role) {
    const fields = editPreviewGenre.fields.filter(f => f.role === role);
    let html = '';
    fields.forEach(f => {
      if (f.type === 'image') {
        const imgs = pendingEditImages[f.key] || [];
        if (imgs.length > 0) {
          html += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.6rem;">`;
          imgs.forEach(img => {
            const src = img.previewUrl || img.url || '';
            html += `<img src="${esc(src)}" style="max-height:100px;max-width:140px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);object-fit:cover;">`;
          });
          html += `</div>`;
        }
      } else if (f.type !== 'static') {
        const val = editPreviewValues[f.key] || '';
        html += `<div style="background:rgba(0,0,0,0.12);padding:0.9rem;border-radius:8px;margin-bottom:0.6rem;min-height:36px;font-size:0.92rem;">${val ? escHtml(val).replace(/\n/g,'<br>') : '<span style="color:#94a3b8;">（未入力）</span>'}</div>`;
      }
    });
    if (!html) html = `<div style="background:rgba(0,0,0,0.08);padding:0.8rem;border-radius:8px;color:#94a3b8;font-size:0.85rem;">（フィールドがありません）</div>`;
    return html;
  }

  const qHtml = buildSideHtml('question');
  const aHtml = buildSideHtml('answer');

  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div>
        <div style="color:#a78bfa;font-size:0.85rem;font-weight:600;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em;">問題</div>
        ${qHtml}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <div style="color:#a78bfa;font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">答え</div>
          <button id="edit-preview-toggle" type="button" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:var(--text-secondary);padding:0.25rem 0.6rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">表示</button>
        </div>
        <div id="edit-preview-answer-body" style="display:none;">${aHtml}</div>
      </div>
    </div>`;

  const btn = document.getElementById('edit-preview-toggle');
  const body = document.getElementById('edit-preview-answer-body');
  if (btn && body) {
    btn.addEventListener('click', () => {
      const shown = body.style.display === 'block';
      body.style.display = shown ? 'none' : 'block';
      btn.textContent = shown ? '表示' : '非表示';
      btn.style.color = shown ? 'var(--text-secondary)' : '#a78bfa';
    });
  }
}

function escHtml(str) {
  return String(str).replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]));
}

// ===== 編集モーダル =====
function openEditModal(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  activeCardId = id;
  pendingEditImages = {};
  editPreviewValues = {};

  const genreDef = genres.find(g => g.id === card.genre);
  editPreviewGenre = genreDef || null;
  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea', required: true, role: 'question' },
    { key: 'answer',   label: '答え', type: 'textarea', required: false, role: 'answer' }
  ];

  el.editFields.innerHTML = '';

  // 画像の事前配分（刷新ロジック）
  if (card.image) {
    try {
      const parsed = JSON.parse(card.image);
      const imgs = Array.isArray(parsed) ? parsed : [{ url: card.image, role: 'question' }];
      
      imgs.forEach(img => {
        const url = typeof img === 'object' ? img.url : img;
        const role = typeof img === 'object' ? img.role : 'question';
        const fKey = typeof img === 'object' ? img.fieldKey : null;
        
        const targetKey = fKey || fields.find(f => f.type === 'image' && f.role === role)?.key;
        if (targetKey) {
          if (!pendingEditImages[targetKey]) pendingEditImages[targetKey] = [];
          if (pendingEditImages[targetKey].length < MAX_EDIT_IMAGES) {
            pendingEditImages[targetKey].push({ url });
          }
        }
      });
    } catch (e) {
      console.error('Image parse failed in edit:', e);
    }
  }

  // role ごとのブロックコンテナを作成
  const qBlock = createEditRoleBlock('問題（おもて）', '#6366f1');
  const aBlock = createEditRoleBlock('答え（うら）', '#8b5cf6');
  const qInner = qBlock.querySelector('.role-block-inner');
  const aInner = aBlock.querySelector('.role-block-inner');

  fields.forEach(field => {
    const targetInner = field.role === 'answer' ? aInner : qInner;

    if (field.type === 'static') {
      const div = document.createElement('div');
      div.className = 'form-group static-field';
      div.style.marginBottom = '1rem';
      div.innerHTML = `<div style="padding: 0.6rem 0.8rem; background: rgba(99,102,241,0.1); border-left: 3px solid #a78bfa; border-radius: 4px; font-weight: 500; color: #a78bfa; font-size: 0.9rem;">${field.label}</div>`;
      targetInner.appendChild(div);
      return;
    }

    if (field.type === 'image') {
      if (!pendingEditImages[field.key]) pendingEditImages[field.key] = [];
      targetInner.appendChild(buildEditImagePasteUI(field));
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

    const rawContent = (field.role === 'question' ? card.question : card.answer) || '';
    const searchStr = `[${field.label}]\n`;
    const startIdx = rawContent.indexOf(searchStr);
    if (startIdx !== -1) {
      const contentStart = startIdx + searchStr.length;
      const nextIdx = rawContent.indexOf('\n\n[', contentStart);
      input.value = (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
    } else if (!rawContent.includes('[') && (field.key === 'question' || field.key === 'answer')) {
      input.value = rawContent;
    } else {
      input.value = '';
    }

    // 初期値をプレビュー値に反映
    editPreviewValues[field.key] = input.value;

    // 入力イベントでプレビュー更新
    input.addEventListener('input', () => {
      editPreviewValues[field.key] = input.value;
      updateEditPreview();
    });

    div.appendChild(label);
    div.appendChild(input);
    targetInner.appendChild(div);
  });

  el.editFields.appendChild(qBlock);
  el.editFields.appendChild(aBlock);

  el.editSaveMsg.classList.add('hidden');
  el.editOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // 初期プレビュー表示
  setTimeout(() => updateEditPreview(), 0);
}

function createEditRoleBlock(title, color) {
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
  updateEditPreview(); // カードプレビューも同期
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
      const removed = pendingEditImages[fKey].splice(idx, 1);
      if (removed[0]?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed[0].previewUrl);
      renderEditPreviews(fKey);
      updateEditPreview(); // カードプレビューも同期
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
  // blob URL を解放してメモリリークを防止
  Object.values(pendingEditImages).forEach(imgs =>
    imgs.forEach(img => img.previewUrl?.startsWith('blob:') && URL.revokeObjectURL(img.previewUrl))
  );
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
    const fieldDef = fields.find(f => f.key === fieldKey);
    const role = fieldDef?.role || 'question';
    
    const imagesForField = pendingEditImages[fieldKey];
    const newFiles = imagesForField.filter(img => img.file);
    const existingUrls = imagesForField.filter(img => img.url && !img.file).map(img => img.url);
    
    let uploadedUrls = [];
    if (newFiles.length > 0) {
      uploadedUrls = await Promise.all(newFiles.map(img => uploadImageToSupabase(img.file)));
    }
    
    const combined = [...existingUrls, ...uploadedUrls].map(url => ({ url, role }));
    allUrls.push(...combined);
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
  el.modalEdit?.addEventListener('click', () => {
    if (activeCardId) {
      window.location.href = `options.html?edit=${encodeURIComponent(activeCardId)}`;
    }
  });
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
