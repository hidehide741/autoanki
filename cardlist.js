import StorageManager from './storage.js';

const PAGE_SIZE = 20;

let allCards = [];
let genres = [];
let filtered = [];
let currentPage = 1;
let activeCardId = null;

const el = {
  searchInput:  document.getElementById('search-input'),
  genreFilter:  document.getElementById('genre-filter'),
  sortSelect:   document.getElementById('sort-select'),
  countBadge:   document.getElementById('count-badge'),
  cardGrid:     document.getElementById('card-grid'),
  emptyState:   document.getElementById('empty-state'),
  pagination:   document.getElementById('pagination'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalClose:   document.getElementById('modal-close'),
  modalGenre:   document.getElementById('modal-genre-badge'),
  modalQ:       document.getElementById('modal-question'),
  modalImages:  document.getElementById('modal-images'),
  modalAnswer:  document.getElementById('modal-answer'),
  modalMeta:    document.getElementById('modal-meta'),
  modalDelete:  document.getElementById('modal-delete-btn')
};

// ===== 初期化 =====
async function init() {
  [allCards, genres] = await Promise.all([
    StorageManager.getAllCards(),
    StorageManager.getGenres()
  ]);

  buildGenreFilter();
  applyAndRender();
  setupListeners();
}

// ===== ジャンルフィルター選択肢を構築 =====
function buildGenreFilter() {
  const used = new Set(allCards.map(c => c.genre).filter(Boolean));
  genres.filter(g => used.has(g.id)).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    el.genreFilter.appendChild(opt);
  });
  // ジャンルIDで保存されていない場合のフォールバック
  const unknowns = [...used].filter(id => !genres.find(g => g.id === id));
  unknowns.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    el.genreFilter.appendChild(opt);
  });
}

// ===== フィルター＆ソート＆レンダー =====
function applyAndRender() {
  const query  = el.searchInput.value.trim().toLowerCase();
  const genre  = el.genreFilter.value;
  const sort   = el.sortSelect.value;

  filtered = allCards.filter(card => {
    const matchQ = !query || card.question?.toLowerCase().includes(query) || card.answer?.toLowerCase().includes(query);
    const matchG = !genre || card.genre === genre;
    return matchQ && matchG;
  });

  // ソート
  filtered.sort((a, b) => {
    if (sort === 'due')      return (a.nextReviewDate || 0) - (b.nextReviewDate || 0);
    if (sort === 'question') return (a.question || '').localeCompare(b.question || '', 'ja');
    if (sort === 'newest')   return (b.id || '').localeCompare(a.id || '');
    return 0;
  });

  currentPage = 1;
  renderGrid();
  renderPagination();
  el.countBadge.textContent = query || genre
    ? `検索結果: ${filtered.length} 件 / 全 ${allCards.length} 件`
    : `全 ${allCards.length} 件`;
}

// ===== カードグリッド描画 =====
function renderGrid() {
  el.cardGrid.innerHTML = '';
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    el.emptyState.classList.remove('hidden');
    el.cardGrid.classList.add('hidden');
    return;
  }
  el.emptyState.classList.add('hidden');
  el.cardGrid.classList.remove('hidden');

  page.forEach(card => {
    const genreDef = genres.find(g => g.id === card.genre);
    const isDue = card.nextReviewDate && card.nextReviewDate <= Date.now();
    const dueText = card.nextReviewDate
      ? (isDue ? '🎯 今すぐ復習' : `📅 ${new Date(card.nextReviewDate).toLocaleDateString('ja-JP')}`)
      : '—';

    // サムネイル（1枚目のみ）
    let thumbHtml = '';
    if (card.image) {
      try {
        const imgs = JSON.parse(card.image);
        if (Array.isArray(imgs) && imgs[0]) {
          thumbHtml = `<img src="${escapeHtml(imgs[0])}" alt="thumb" class="db-card-thumb" loading="lazy">`;
        }
      } catch {
        if (card.image.startsWith('http')) {
          thumbHtml = `<img src="${escapeHtml(card.image)}" alt="thumb" class="db-card-thumb" loading="lazy">`;
        }
      }
    }

    const div = document.createElement('div');
    div.className = 'db-card';
    div.dataset.id = card.id;
    div.innerHTML = `
      ${genreDef ? `<span class="db-card-genre">${genreDef.name}</span>` : ''}
      <div class="db-card-question">${escapeHtml(card.question || '')}</div>
      ${thumbHtml}
      <div class="db-card-answer">${escapeHtml(card.answer || '')}</div>
      <div class="db-card-footer">
        <span class="db-card-due ${isDue ? 'due-now' : 'due-later'}">${dueText}</span>
        <div class="db-card-actions">
          <button class="icon-action-btn del delete-btn" data-id="${card.id}" title="削除">🗑️</button>
        </div>
      </div>
    `;

    // カードクリック → モーダル
    div.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      openModal(card.id);
    });

    // 削除ボタン
    div.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(card.id);
    });

    el.cardGrid.appendChild(div);
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
    btn.addEventListener('click', () => { currentPage = page; renderGrid(); renderPagination(); window.scrollTo(0, 0); });
    el.pagination.appendChild(btn);
  };

  addBtn('‹', currentPage - 1, currentPage === 1);
  // 前後2ページ + 先頭末尾
  const pages = new Set([1, total, currentPage - 1, currentPage, currentPage + 1].filter(p => p >= 1 && p <= total));
  [...pages].sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i > 0 && p - arr[i - 1] > 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.cssText = 'color:var(--text-secondary);padding:0 0.25rem;';
      el.pagination.appendChild(dots);
    }
    addBtn(p, p);
  });
  addBtn('›', currentPage + 1, currentPage === total);
}

// ===== モーダル =====
function openModal(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  activeCardId = id;

  const genreDef = genres.find(g => g.id === card.genre);
  el.modalGenre.textContent = genreDef ? genreDef.name : (card.genre || 'その他');
  el.modalQ.textContent = card.question || '';
  el.modalAnswer.textContent = card.answer || '';

  // 画像
  el.modalImages.innerHTML = '';
  if (card.image) {
    let urls = [];
    try {
      const parsed = JSON.parse(card.image);
      urls = Array.isArray(parsed) ? parsed : [card.image];
    } catch { urls = [card.image]; }
    urls.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '画像';
      el.modalImages.appendChild(img);
    });
  }

  // メタ情報
  const isDue = card.nextReviewDate && card.nextReviewDate <= Date.now();
  const nextStr = card.nextReviewDate
    ? (isDue ? '🎯 今すぐ復習' : `📅 ${new Date(card.nextReviewDate).toLocaleString('ja-JP')}`)
    : '未設定';
  el.modalMeta.innerHTML = `
    <span>次回レビュー: <strong>${nextStr}</strong></span>
    <span>インターバル: <strong>${card.interval ?? '—'} 日</strong></span>
    <span>難易度係数: <strong>${card.easeFactor?.toFixed(2) ?? '—'}</strong></span>
  `;

  el.modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  el.modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  activeCardId = null;
}

// ===== 削除 =====
async function confirmDelete(id) {
  const card = allCards.find(c => c.id === id);
  if (!card) return;
  if (!confirm(`「${card.question?.slice(0, 30)}」を削除しますか？`)) return;

  await StorageManager.deleteCard(id);
  allCards = allCards.filter(c => c.id !== id);
  closeModal();
  applyAndRender();
}

// ===== リスナー =====
function setupListeners() {
  el.searchInput.addEventListener('input', applyAndRender);
  el.genreFilter.addEventListener('change', applyAndRender);
  el.sortSelect.addEventListener('change', applyAndRender);
  el.modalClose.addEventListener('click', closeModal);
  el.modalOverlay.addEventListener('click', (e) => { if (e.target === el.modalOverlay) closeModal(); });
  el.modalDelete.addEventListener('click', () => { if (activeCardId) confirmDelete(activeCardId); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

// ===== ユーティリティ =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"/]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '/': '&#47;'
  }[tag]));
}

document.addEventListener('DOMContentLoaded', init);
