import StorageManager from './storage.js';

let currentCard = null;
let answerShown = false;
let isProcessing = false; // 二重送信防止用

// DOM要素（DOMContentLoaded後に init() で初期化）
let el = {};

// 初期化
async function init() {
  // DOMContentLoaded後にDOM要素を取得（必ず要素が存在する状態で参照する）
  el = {
    cardContainer: document.getElementById('card-container'),
    doneContainer: document.getElementById('done-container'),
    answerSection: document.getElementById('answer-section'),
    showAnswerBtn: document.getElementById('show-answer-btn'),
    ratingButtons: document.querySelectorAll('.rating-btn'),
    skipBtn:       document.getElementById('skip-btn'),
    optionsBtn:    document.getElementById('options-btn'),
    todayCount:    document.getElementById('today-count'),
    streakCount:   document.getElementById('streak-count'),
    genreBadge:    document.getElementById('genre-badge'),
    progressBar:   document.getElementById('progress-bar'),
    doneToday:     document.getElementById('done-today'),
    doneStreak:    document.getElementById('done-streak'),
    questionArea:    document.getElementById('question-area'),
    answerArea:      document.getElementById('answer-area'),
    emptyContainer:  document.getElementById('empty-container'),
    errorContainer:  document.getElementById('error-container'),
    errorMessage:    document.getElementById('error-message'),
  };
  await updateStats();
  await loadNextCard();
  setupEventListeners();
}

async function updateStats() {
  const stats = await StorageManager.getStats();
  if (el.todayCount)  el.todayCount.textContent = stats.todayReviews;
  if (el.streakCount) el.streakCount.textContent = stats.streak;
}

// カードの読み込み
async function loadNextCard() {
  // Chromeが自動で新しいタブを開いた場合のみ true（referrerが空 = 新規タブ）
  // サイドバーのリンクから来た場合は referrer に遷移元URLが入るので false
  const isActualNewTab = StorageManager.isExtension && !document.referrer;

  try {
    const result = await StorageManager.getDueCardOrStatus();
    
    if (result.status === 'empty') {
      if (isActualNewTab) {
        // 新規タブのみ: 1回だけ「問題なし」表示、2回目以降はGoogle
        const alreadyNotified = await StorageManager.getEmptyNotified();
        if (alreadyNotified) {
          window.location.replace('https://www.google.com/');
          return;
        }
        await StorageManager.setEmptyNotified(true);
      }
      showEmptyMode();
      isProcessing = false;
      return;
    }

    if (result.status === 'cooldown') {
      if (isActualNewTab) {
        // 新規タブのみ: 15分クールタイム中はGoogle
        window.location.replace('https://www.google.com/');
        return;
      } else {
        showDoneMode();
      }
      isProcessing = false;
      return;
    }

    currentCard = result.card;
    
    if (currentCard) {
      // dueカードあり → emptyNotifiedをリセット（次にemptyになったとき再度通知する）
      if (StorageManager.isExtension) {
        await StorageManager.setEmptyNotified(false);
      }
      const genres = await StorageManager.getGenres();
      const genreDef = genres.find(g => g.id === currentCard.genre);
      
      showQuestionMode(genreDef);
      
      // ジャンルバッジ
      if (el.genreBadge) {
        if (genreDef) {
          el.genreBadge.textContent = genreDef.name;
          el.genreBadge.classList.remove('hidden');
        } else {
          el.genreBadge.classList.add('hidden');
        }
      }

      // アニメーションのリセット
      el.cardContainer.classList.remove('hidden', 'fade-out');
      el.doneContainer.classList.add('hidden');
      if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
      if (el.errorContainer) el.errorContainer.classList.add('hidden');
      el.cardContainer.style.animation = 'none';
      setTimeout(() => {
        el.cardContainer.style.animation = 'floatIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        isProcessing = false;
      }, 10);
    } else {
      showDoneMode();
      isProcessing = false;
    }
  } catch (err) {
    console.error('loadNextCard Failed:', err);
    showErrorMode(err.message);
    isProcessing = false;
  }
}

function showQuestionMode(genreDef) {
  answerShown = false;
  el.answerSection.classList.add('hidden');
  el.showAnswerBtn.classList.remove('hidden');

  const fields = genreDef?.fields || [
    { key: 'question', label: '問題', type: 'textarea', role: 'question' },
    { key: 'answer',   label: '答え', type: 'textarea', role: 'answer' }
  ];

  // 画像データのパース
  let images = [];
  if (currentCard.image) {
    try {
      const parsed = JSON.parse(currentCard.image);
      images = Array.isArray(parsed) ? parsed : [{ url: currentCard.image, role: 'question' }];
      if (images.length > 0 && typeof images[0] === 'string') {
        images = images.map(url => ({ url, role: 'question' }));
      }
    } catch {
      images = [{ url: currentCard.image, role: 'question' }];
    }
  }

  // HTMLエスケープ
  const esc = (s) => String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;'})[c]);

  // rawContent から [ラベル]\n値 形式で値を取得
  function getFieldValue(field) {
    const rawContent = (field.role === 'question' ? currentCard.question : currentCard.answer) || '';
    const searchStr = `[${field.label}]\n`;
    const startIdx = rawContent.indexOf(searchStr);
    if (startIdx !== -1) {
      const contentStart = startIdx + searchStr.length;
      const nextIdx = rawContent.indexOf('\n\n[', contentStart);
      return (nextIdx !== -1 ? rawContent.substring(contentStart, nextIdx) : rawContent.substring(contentStart)).trim();
    }
    if (field.key === 'question' || field.key === 'answer') return rawContent;
    return '';
  }

  // options.js の renderFieldHtml と同じロジックでHTMLを生成
  function renderFieldHtml(f, isQuestion) {
    const opts    = f.options || {};
    const fsSz    = opts.fontSize === 'sm' ? '0.82rem' : opts.fontSize === 'lg' ? '1.25rem' : null;
    const alignSt = opts.align ? `text-align:${opts.align};` : '';
    const boldSt  = opts.bold  ? 'font-weight:700;' : '';

    const valignWrap = (html) => {
      const v = opts.valign || 'top';
      if (v === 'top') return html;
      const jc = v === 'bottom' ? 'flex-end' : 'center';
      return `<div style="display:flex;flex-direction:column;justify-content:${jc};min-height:5rem;">${html}</div>`;
    };

    const baseTextStyle = isQuestion
      ? `font-size:${fsSz||'1.1rem'};font-weight:${opts.bold?'700':'400'};line-height:1.55;letter-spacing:-0.01em;${
          opts.color
            ? `color:${opts.color};-webkit-text-fill-color:${opts.color};background:none;-webkit-background-clip:initial;background-clip:initial;`
            : 'background:linear-gradient(135deg,#f1f5f9,#cbd5e1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;'
        }white-space:pre-wrap;margin-bottom:0.75rem;display:block;${alignSt}`
      : `font-size:${fsSz||'1rem'};font-weight:${opts.bold?'700':'600'};${
          opts.color ? `color:${opts.color};` : 'color:#a78bfa;'
        }line-height:1.5;white-space:pre-wrap;margin-bottom:0.75rem;display:block;${alignSt}`;

    if (f.type === 'static') {
      const v = getFieldValue(f) || f.label;
      const showBorder = opts.border !== false;
      const borderStyle = showBorder
        ? 'background:rgba(99,102,241,0.08);border:1px solid rgba(167,139,250,0.35);border-radius:6px;'
        : 'background:transparent;border:none;border-radius:0;';
      return valignWrap(`<div style="padding:0.4rem 0.75rem;margin:0.3rem 0 0.6rem;${borderStyle}font-weight:${opts.bold?'700':'400'};font-size:${fsSz||'0.95rem'};color:${opts.color||'#a78bfa'};${alignSt}">${esc(v)}</div>`);
    }

    if (f.type === 'image') {
      const fieldImages = images.filter(img => img.fieldKey ? img.fieldKey === f.key : img.role === f.role);
      if (!fieldImages.length) return '';
      const cols = Math.min(fieldImages.length, 3);
      const maxH = opts.size === 'sm' ? '100px' : opts.size === 'lg' ? '240px' : '160px';
      return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:0.5rem;margin:0.5rem 0 0.75rem;">
        ${fieldImages.map(img => `<img src="${esc(img.url)}" style="width:100%;max-height:${maxH};object-fit:contain;border-radius:10px;border:1px solid rgba(255,255,255,0.1);">`).join('')}
      </div>`;
    }

    if (f.type === 'fillblank') {
      const val = getFieldValue(f);
      const blankStyle = opts.blankStyle || 'underline';
      const blankSpanStyle = blankStyle === 'box'
        ? 'border:1px solid #fbbf24;border-radius:4px;padding:0 4px;color:#fbbf24;font-weight:700;'
        : blankStyle === 'highlight'
        ? 'background:rgba(251,191,36,0.4);padding:0 4px;border-radius:3px;color:#fbbf24;'
        : 'background:rgba(250,204,21,0.2);border-bottom:2px solid #fbbf24;padding:0 4px;color:#fbbf24;font-weight:700;';
      const displayed = val
        ? esc(val).replace(/\{\{(.+?)\}\}/g, `<span style="${blankSpanStyle}">___</span>`)
        : '<span style="color:#64748b;">（未入力）</span>';
      return valignWrap(`<div style="font-size:${fsSz||'1.05rem'};font-weight:${opts.bold?'700':'400'};line-height:1.7;margin-bottom:0.75rem;color:${opts.color||'#f1f5f9'};${alignSt}">${displayed}</div>`);
    }

    if (f.type === 'choice_single' || f.type === 'choice_multi') {
      const val = getFieldValue(f);
      if (!val) return '';
      try {
        const data = JSON.parse(val);
        const layout = opts.layout === 'horizontal' ? 'flex-direction:row;flex-wrap:wrap;' : 'flex-direction:column;';
        const choiceItems = (data.options || []).map((opt, i) => {
          const isCorrect = (data.correct || []).includes(i);
          return `<div style="padding:0.45rem 0.85rem;border-radius:8px;font-size:0.92rem;background:${isCorrect ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)'};border:1px solid ${isCorrect ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.07)'};color:${isCorrect ? '#4ade80' : '#e2e8f0'};display:flex;align-items:center;gap:0.5rem;">
            <span style="opacity:0.8;">${isCorrect ? '✅' : (f.type === 'choice_multi' ? '☐' : '○')}</span>
            ${esc(opt) || '<span style="color:#64748b;">（未入力）</span>'}
          </div>`;
        }).join('');
        return valignWrap(`<div style="display:flex;${layout}gap:0.35rem;margin-bottom:0.75rem;">${choiceItems}</div>`);
      } catch { return ''; }
    }

    if (f.type === 'tags') {
      const val = getFieldValue(f);
      if (!val) return '';
      const tags = val.split(',').map(t => t.trim()).filter(t => t);
      const tagColor  = opts.color || '#2dd4bf';
      const tagBg     = opts.color ? 'rgba(255,255,255,0.1)' : 'rgba(20,184,166,0.18)';
      const tagBorder = opts.color ? 'rgba(255,255,255,0.2)' : 'rgba(20,184,166,0.4)';
      const justifySt = opts.align === 'center' ? 'justify-content:center;' : opts.align === 'right' ? 'justify-content:flex-end;' : '';
      return valignWrap(`<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.75rem;${justifySt}">${tags.map(t =>
        `<span style="background:${tagBg};border:1px solid ${tagBorder};color:${tagColor};padding:0.18rem 0.55rem;border-radius:12px;font-size:0.82rem;">${esc(t)}</span>`
      ).join('')}</div>`);
    }

    if (f.type === 'difficulty') {
      const max = parseInt(opts.maxStars || 5);
      const v   = parseInt(getFieldValue(f) || String(opts.defaultVal || 3));
      return `<div style="font-size:1.1rem;margin-bottom:0.75rem;">${'⭐'.repeat(v)}${'☆'.repeat(Math.max(0, max - v))} <span style="font-size:0.82rem;color:#94a3b8;">${v}/${max}</span></div>`;
    }

    if (f.type === 'hint') {
      const val = getFieldValue(f);
      if (!val) return '';
      return valignWrap(`<div style="background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:0.55rem 0.85rem;border-radius:6px;margin-bottom:0.75rem;font-size:${fsSz||'0.9rem'};color:${opts.color||'#fde68a'};${boldSt}${alignSt}">💡 ${esc(val)}</div>`);
    }

    if (f.type === 'explanation') {
      const val = getFieldValue(f);
      if (!val) return '';
      return valignWrap(`<div style="background:rgba(99,102,241,0.08);border-left:3px solid #6366f1;padding:0.55rem 0.85rem;border-radius:6px;margin-bottom:0.75rem;font-size:${fsSz||'0.9rem'};line-height:1.65;color:${opts.color||'#c7d2fe'};${boldSt}${alignSt}">📖 ${esc(val).replace(/\n/g,'<br>')}</div>`);
    }

    if (f.type === 'wrongexample') {
      const val = getFieldValue(f);
      if (!val) return '';
      try {
        const items = JSON.parse(val).filter(v => v);
        if (!items.length) return '';
        return valignWrap(`<div style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.75rem;">${items.map(item =>
          `<div style="background:rgba(239,68,68,0.08);border-left:3px solid #ef4444;padding:0.4rem 0.75rem;border-radius:5px;font-size:${fsSz||'0.9rem'};color:${opts.color||'#fca5a5'};${boldSt}${alignSt}">❌ ${esc(item)}</div>`
        ).join('')}</div>`);
      } catch { return ''; }
    }

    if (f.type === 'feedback') {
      const val = getFieldValue(f);
      if (!val) return '';
      return valignWrap(`<div style="background:rgba(34,197,94,0.08);border-left:3px solid #22c55e;padding:0.55rem 0.85rem;border-radius:6px;margin-bottom:0.75rem;font-size:${fsSz||'0.9rem'};color:${opts.color||'#86efac'};${boldSt}${alignSt}">💬 ${esc(val)}</div>`);
    }

    if (f.type === 'timer') {
      const sec = parseInt(opts.defaultSec || getFieldValue(f) || 30);
      return `<div style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;padding:0.3rem 0.75rem;margin-bottom:0.75rem;font-size:0.92rem;color:#f87171;">⏱ ${sec}秒</div>`;
    }

    if (f.type === 'url') {
      const val = getFieldValue(f);
      const label = opts.linkLabel || '参考資料を見る';
      if (!val) return '';
      return `<div style="margin-bottom:0.75rem;"><a href="${esc(val)}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;font-size:0.92rem;">🔗 ${esc(label)}</a></div>`;
    }

    // text / textarea / freetext / number / date / その他
    const val = getFieldValue(f);
    if (!val) return '';
    return valignWrap(`<p style="${baseTextStyle}">${esc(val).replace(/\n/g,'<br>')}</p>`);
  }

  // プレビューと同じ構造でレンダリング
  el.questionArea.innerHTML = fields.filter(f => f.role === 'question').map(f => renderFieldHtml(f, true)).join('');
  el.answerArea.innerHTML   = fields.filter(f => f.role === 'answer').map(f => renderFieldHtml(f, false)).join('');
}

function showAnswerMode() {
  if (isProcessing) return;
  answerShown = true;
  el.showAnswerBtn.classList.add('hidden');
  el.answerSection.classList.remove('hidden');
}

function showDoneMode() {
  el.cardContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.add('hidden');
  el.doneContainer.classList.remove('hidden');
  if (el.doneToday)  el.doneToday.textContent  = el.todayCount?.textContent  || '0';
  if (el.doneStreak) el.doneStreak.textContent = el.streakCount?.textContent || '0';
}

function showEmptyMode() {
  el.cardContainer.classList.add('hidden');
  el.doneContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.remove('hidden');
}

function showErrorMode(msg = '') {
  el.cardContainer.classList.add('hidden');
  el.doneContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.remove('hidden');
  if (el.errorMessage && msg) el.errorMessage.textContent = msg;
}

function showCooldownMode(remainMs) {
  const mins = Math.max(1, Math.ceil(remainMs / 60000));
  el.cardContainer.classList.add('hidden');
  if (el.emptyContainer) el.emptyContainer.classList.add('hidden');
  if (el.errorContainer) el.errorContainer.classList.add('hidden');
  el.doneContainer.classList.remove('hidden');
  if (el.doneToday)  el.doneToday.textContent  = el.todayCount?.textContent  || '0';
  if (el.doneStreak) el.doneStreak.textContent = el.streakCount?.textContent || '0';
  // cooldown 残り時間を表示
  const existing = el.doneContainer.querySelector('.cooldown-notice');
  const text = `⏳ 次の問題まで約 ${mins} 分`;
  if (!existing) {
    const notice = document.createElement('p');
    notice.className = 'cooldown-notice';
    notice.style.cssText = 'font-size:0.9rem;opacity:0.7;margin-top:0.75rem;';
    notice.textContent = text;
    el.doneContainer.appendChild(notice);
  } else {
    existing.textContent = text;
  }
}

async function handleRating(quality) {
  if (!currentCard || isProcessing) return;
  isProcessing = true;

  el.cardContainer.classList.add('fade-out');
  
  try {
    await StorageManager.updateCard(currentCard.id, parseInt(quality, 10));
    await updateStats();
    setTimeout(async () => {
      await loadNextCard();
    }, 300);
  } catch (err) {
    console.error('handleRating Failed:', err);
    isProcessing = false;
  }
}

function setupEventListeners() {
  el.showAnswerBtn.addEventListener('click', showAnswerMode);

  el.ratingButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleRating(btn.getAttribute('data-quality'));
    });
  });

  el.skipBtn.addEventListener('click', async () => {
    if (isProcessing) return;
    isProcessing = true;
    
    if(!el.cardContainer.classList.contains('hidden')) {
      el.cardContainer.classList.add('fade-out');
      await StorageManager.updateLastAnswerTime();
      setTimeout(async () => {
        await loadNextCard();
      }, 300);
    } else {
      await loadNextCard();
    }
  });

  el.optionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = 'options.html';
    }
  });

  // エラー画面の再読み込みボタン（onclick属性は使えないためここで登録）
  const reloadBtn = document.getElementById('reload-btn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());

  document.addEventListener('keydown', (e) => {
    if (el.cardContainer.classList.contains('hidden') || isProcessing) return;
    
    if (e.key === 'Escape') {
      el.skipBtn.click();
      return;
    }

    if (!answerShown) {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        showAnswerMode();
      }
    } else {
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const mapping = { '1': '1', '2': '3', '3': '4', '4': '5' };
        handleRating(mapping[e.key]);
      } else if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        handleRating('4');
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
