import StorageManager from './storage.js';

const PAGE_SIZE = 25;

let allCards  = [];
let genres    = [];
let filtered  = [];
let currentPage = 1;
let sortCol   = 'nextReviewDate';
let sortAsc   = true;
let activeCardId = null;

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
    tr.innerHTML = `
      ${thumbHtml}
      <td class="cell-question"><div class="cell-text">${esc(card.question || '')}</div></td>
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

// ===== モーダル =====
function openModal(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  activeCardId = id;

  el.modalGenre.textContent = genreName(card.genre);
  el.modalQ.textContent = card.question || '';
  el.modalAnswer.textContent = card.answer || '';

  el.modalImages.innerHTML = '';
  if (card.image) {
    let urls = [];
    try { const p = JSON.parse(card.image); urls = Array.isArray(p) ? p : [card.image]; }
    catch { urls = [card.image]; }
    urls.forEach(url => {
      const img = document.createElement('img');
      img.src = url; img.alt = '画像';
      el.modalImages.appendChild(img);
    });
  }

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

  const genreDef = genres.find(g => g.id === card.genre);
  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea', required: true },
    { key: 'answer',   label: '答え', type: 'textarea', required: false }
  ];

  const inputStyle = `
    width:100%;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);
    border-radius:6px;padding:0.55rem 0.75rem;color:var(--text-primary);
    font-family:inherit;font-size:0.9rem;box-sizing:border-box;
    transition:border-color 0.2s;
  `;

  el.editFields.innerHTML = '';
  el.editImgPrev.innerHTML = '';

  fields.forEach(field => {
    if (field.type === 'image') return; // 画像は別途処理

    const wrapper = document.createElement('div');
    const labelEl = document.createElement('label');
    labelEl.style.cssText = 'display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.3rem;';
    labelEl.textContent = field.label + (field.required ? ' *' : '');

    let inputEl;
    if (field.type === 'textarea') {
      inputEl = document.createElement('textarea');
      inputEl.rows = 3;
    } else {
      inputEl = document.createElement('input');
      inputEl.type = ['number','date','url'].includes(field.type) ? field.type : 'text';
    }
    inputEl.dataset.key = field.key;
    inputEl.style.cssText = inputStyle;
    inputEl.value = card[field.key] || '';
    inputEl.addEventListener('focus', () => inputEl.style.borderColor = 'var(--primary-accent)');
    inputEl.addEventListener('blur',  () => inputEl.style.borderColor = 'var(--glass-border)');

    wrapper.appendChild(labelEl);
    wrapper.appendChild(inputEl);
    el.editFields.appendChild(wrapper);
  });

  // 画像プレビュー
  if (card.image) {
    let urls = [];
    try { const p = JSON.parse(card.image); urls = Array.isArray(p) ? p : [card.image]; }
    catch { urls = [card.image]; }
    urls.forEach(url => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;display:inline-block;';
      wrap.innerHTML = `
        <img src="${esc(url)}" style="max-height:100px;border-radius:6px;border:1px solid var(--glass-border);">
        <span style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.7rem;padding:0.1rem 0.3rem;border-radius:3px;pointer-events:none;">現在の画像</span>
      `;
      el.editImgPrev.appendChild(wrap);
    });
  }

  el.editSaveMsg.classList.add('hidden');
  el.editOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  el.editOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveCardEdit() {
  const card = allCards.find(c => c.id === activeCardId);
  if (!card) return;

  // フィールド値を収集
  const inputs = el.editFields.querySelectorAll('[data-key]');
  inputs.forEach(input => {
    const key = input.dataset.key;
    card[key] = input.value.trim();
  });

  // SupabaseにPATCH送信
  await StorageManager.saveCardUpdate(card);

  // ローカルデータも更新
  const idx = allCards.findIndex(c => c.id === activeCardId);
  if (idx !== -1) allCards[idx] = { ...allCards[idx], ...card };

  el.editSaveMsg.classList.remove('hidden');
  setTimeout(() => el.editSaveMsg.classList.add('hidden'), 2500);

  applyAndRender(); // テーブル更新
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
