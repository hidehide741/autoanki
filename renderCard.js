/**
 * renderCard.js
 * options.js (プレビュー) と newtab.js (クイズ) で共通のレンダリングロジック
 * ここを変更すれば両方に反映される
 */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"'`]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;', '`': '&#x60;'
  })[c]);
}

/**
 * 1フィールドを HTML 文字列に変換する
 * @param {object} f          - フィールド定義 { key, label, type, role, options }
 * @param {boolean} isQuestion - 問題面なら true、答え面なら false
 * @param {function} getValue  - (field) => string  フィールド値を返す関数
 * @param {Array}   imageList  - [{url:string}]  そのフィールドに対応する画像配列
 */
export function renderFieldHtml(f, isQuestion, getValue, imageList = []) {
  const esc    = escapeHtml;
  const opts   = f.options || {};
  const fsSz   = opts.fontSize === 'sm' ? '0.82rem' : opts.fontSize === 'lg' ? '1.25rem' : null;
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
    const v = getValue(f) || f.label;
    const showBorder = opts.border !== false;
    const borderStyle = showBorder
      ? 'background:rgba(99,102,241,0.08);border:1px solid rgba(167,139,250,0.35);border-radius:6px;'
      : 'background:transparent;border:none;border-radius:0;';
    return valignWrap(`<div style="padding:0.4rem 0.75rem;margin:0.3rem 0 0.6rem;${borderStyle}font-weight:${opts.bold?'700':'400'};font-size:${fsSz||'0.95rem'};color:${opts.color||'#a78bfa'};${alignSt}">${esc(v)}</div>`);
  }

  if (f.type === 'image') {
    if (!imageList.length) return '';
    const cols = Math.min(imageList.length, 3);
    const maxH = opts.size === 'sm' ? '100px' : opts.size === 'lg' ? '240px' : '160px';
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:0.5rem;margin:0.5rem 0 0.75rem;">
      ${imageList.map(img => `<img src="${esc(img.url)}" style="width:100%;max-height:${maxH};object-fit:contain;border-radius:10px;border:1px solid rgba(255,255,255,0.1);">`).join('')}
    </div>`;
  }

  if (f.type === 'fillblank') {
    const val = getValue(f) || '';
    const blankStyle = opts.blankStyle || 'underline';
    const blankSpanStyle = blankStyle === 'box'
      ? 'border:1px solid #fbbf24;border-radius:4px;padding:0 4px;color:#fbbf24;font-weight:700;'
      : blankStyle === 'highlight'
      ? 'background:rgba(251,191,36,0.4);padding:0 4px;border-radius:3px;color:#fbbf24;'
      : 'background:rgba(250,204,21,0.2);border-bottom:2px solid #fbbf24;padding:0 4px;color:#fbbf24;font-weight:700;';
    const displayed = val
      ? esc(val).replace(/\n/g, '<br>').replace(/\{\{(.+?)\}\}/g, `<span style="${blankSpanStyle}">___</span>`)
      : '<span style="color:#64748b;">（未入力）</span>';
    return valignWrap(`<div style="font-size:${fsSz||'1.05rem'};font-weight:${opts.bold?'700':'400'};line-height:1.7;margin-bottom:0.75rem;color:${opts.color||'#f1f5f9'};${alignSt}">${displayed}</div>`);
  }

  if (f.type === 'choice_single' || f.type === 'choice_multi') {
    const val = getValue(f);
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
    const val = getValue(f) || '';
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
    const v   = parseInt(getValue(f) || String(opts.defaultVal || 3));
    return `<div style="font-size:1.1rem;margin-bottom:0.75rem;">${'⭐'.repeat(v)}${'☆'.repeat(Math.max(0, max - v))} <span style="font-size:0.82rem;color:#94a3b8;">${v}/${max}</span></div>`;
  }

  if (f.type === 'hint') {
    const val = getValue(f) || '';
    if (!val) return '';
    return valignWrap(`<div style="background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:0.55rem 0.85rem;border-radius:6px;margin-bottom:0.75rem;font-size:${fsSz||'0.9rem'};color:${opts.color||'#fde68a'};${boldSt}${alignSt}">💡 ${esc(val).replace(/\n/g,'<br>')}</div>`);
  }

  if (f.type === 'explanation') {
    const val = getValue(f) || '';
    if (!val) return '';
    return valignWrap(`<div style="background:rgba(99,102,241,0.08);border-left:3px solid #6366f1;padding:0.55rem 0.85rem;border-radius:6px;margin-bottom:0.75rem;font-size:${fsSz||'0.9rem'};line-height:1.65;color:${opts.color||'#c7d2fe'};${boldSt}${alignSt}">📖 ${esc(val).replace(/\n/g,'<br>')}</div>`);
  }

  if (f.type === 'wrongexample') {
    const val = getValue(f);
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
    const val = getValue(f) || '';
    if (!val) return '';
    return valignWrap(`<div style="background:rgba(34,197,94,0.08);border-left:3px solid #22c55e;padding:0.55rem 0.85rem;border-radius:6px;margin-bottom:0.75rem;font-size:${fsSz||'0.9rem'};color:${opts.color||'#86efac'};${boldSt}${alignSt}">💬 ${esc(val).replace(/\n/g,'<br>')}</div>`);
  }

  if (f.type === 'timer') {
    const sec = parseInt(opts.defaultSec || getValue(f) || 30);
    return `<div style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;padding:0.3rem 0.75rem;margin-bottom:0.75rem;font-size:0.92rem;color:#f87171;">⏱ ${sec}秒</div>`;
  }

  if (f.type === 'url') {
    const val = getValue(f) || '';
    const label = opts.linkLabel || '参考資料を見る';
    if (!val) return '';
    return `<div style="margin-bottom:0.75rem;"><a href="${esc(val)}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;font-size:0.92rem;">🔗 ${esc(label)}</a></div>`;
  }

  // text / textarea / freetext / number / date / その他
  const val = getValue(f) || '';
  if (!val) return '';
  return valignWrap(`<p style="${baseTextStyle}">${esc(val).replace(/\n/g, '<br>')}</p>`);
}
