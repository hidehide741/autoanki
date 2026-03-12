import StorageManager from './storage.js';

let genres = [];
let editingGenreId = null; // null = 新規追加, string = 編集中のジャンルID

const el = {
  genreList:    document.getElementById('genre-list'),
  addGenreBtn:  document.getElementById('add-genre-btn'),
  genreEditor:  document.getElementById('genre-editor'),
  genreName:    document.getElementById('genre-name'),
  qContainer:   document.getElementById('q-fields-container'),
  aContainer:   document.getElementById('a-fields-container'),
  addQBtn:      document.getElementById('add-q-field-btn'),
  addABtn:      document.getElementById('add-a-field-btn'),
  cancelBtn:    document.getElementById('cancel-btn'),
  saveGenreBtn: document.getElementById('save-genre-btn'),
  previewPanel: document.getElementById('preview-panel'),
  toast:        document.getElementById('toast'),
  toastMsg:     document.getElementById('toast-msg')
};

async function init() {
  genres = await StorageManager.getGenres();
  renderGenreList();

  el.addGenreBtn.addEventListener('click', () => {
    editingGenreId = null;
    document.getElementById('editor-title').textContent = '➕ ジャンルを追加';
    el.saveGenreBtn.textContent = '保存する';
    el.genreName.value = '';
    el.qContainer.innerHTML = '';
    el.aContainer.innerHTML = '';
    addFieldRow(el.qContainer, '問題', 'textarea', true);
    addFieldRow(el.aContainer, '答え', 'textarea', true);
    openEditor();
  });
  el.addQBtn.addEventListener('click', () => addFieldRow(el.qContainer));
  el.addABtn.addEventListener('click', () => addFieldRow(el.aContainer));
  el.saveGenreBtn.addEventListener('click', saveGenre);
  el.cancelBtn.addEventListener('click', closeEditor);

  el.genreName.addEventListener('input', renderPreview);
  el.qContainer.addEventListener('input', renderPreview);
  el.qContainer.addEventListener('change', renderPreview);
  el.aContainer.addEventListener('input', renderPreview);
  el.aContainer.addEventListener('change', renderPreview);
}

function esc(str) {
  return String(str).replace(/[&<>"'`]/g, function (s) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#x60;'
    }[s];
  });
}

function showToast(message, isError = false) {
  el.toastMsg.textContent = message;
  el.toast.className = `toast ${isError ? 'error' : ''}`;
  el.toast.classList.add('show');
  setTimeout(() => {
    el.toast.classList.remove('show');
  }, 3000);
}

function openEditor() {
  el.genreEditor.classList.remove('hidden');
  el.addGenreBtn.classList.add('hidden');
  document.getElementById('genre-list-section').classList.add('hidden');
  renderPreview();
  el.genreEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  editingGenreId = null;
  el.genreEditor.classList.add('hidden');
  el.addGenreBtn.classList.remove('hidden');
  document.getElementById('genre-list-section').classList.remove('hidden');
  renderGenreList();
}

function renderGenreList() {
  el.genreList.innerHTML = '';
  if (genres.length === 0) {
    el.genreList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem; grid-column: 1/-1;">ジャンルがまだありません。「新規ジャンル」から追加してください。</p>';
    return;
  }

  genres.forEach((genre) => {
    const item = document.createElement('div');
    item.className = 'genre-card';
    if (editingGenreId === genre.id) {
      item.style.borderColor = 'rgba(99,102,241,0.6)';
    }

    const typeIcon = { text: '📝', textarea: '📄', number: '🔢', image: '🖼️', url: '🔗', date: '📅', static: '🔖' };
    const qFields = genre.fields.filter(f => f.role === 'question');
    const aFields = genre.fields.filter(f => f.role === 'answer');
    const fieldsPreview = genre.fields.map(f => `${typeIcon[f.type] || '📝'} ${f.label}`).join('&ensp;');

    item.innerHTML = `
      <div class="genre-card-name">${esc(genre.name)}</div>
      <div class="genre-card-fields">${fieldsPreview || '<span style="opacity:0.5;">フィールドなし</span>'}</div>
      <div class="genre-card-actions">
        <button class="btn btn-secondary btn-sm edit-genre-btn" data-id="${genre.id}">✏️ 編集</button>
        <button class="btn btn-danger  btn-sm delete-genre-btn" data-id="${genre.id}">🗑️ 削除</button>
      </div>
    `;

    item.querySelector('.edit-genre-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      loadGenreIntoForm(genre.id);
    });

    item.querySelector('.delete-genre-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`「${genre.name}」を削除しますか？\nカードは削除されませんが、ジャンル表示は「その他」になります。`)) {
        if (editingGenreId === genre.id) closeEditor();
        genres = genres.filter(g => g.id !== genre.id);
        await StorageManager.deleteGenre(genre.id);
        await StorageManager.saveGenres(genres);
        renderGenreList();
      }
    });

    el.genreList.appendChild(item);
  });
}

// 既存ジャンルをフォームに読み込む
function loadGenreIntoForm(id) {
  const genre = genres.find(g => g.id === id);
  if (!genre) return;

  editingGenreId = id;
  document.getElementById('editor-title').textContent = '✏️ ジャンルを編集';

  // ジャンル名
  el.genreName.value = genre.name;

  // フィールドをクリアして再構築
  el.qContainer.innerHTML = '';
  el.aContainer.innerHTML = '';

  genre.fields.forEach(f => {
    const container = f.role === 'question' ? el.qContainer : el.aContainer;
    addFieldRow(container, f.label, f.type, f.required, f.options || {});
  });

  // 保存ボタン・キャンセルボタンの切り替え
  el.saveGenreBtn.textContent = '更新する';
  openEditor(); // エディタを開く
}

// フィールドタイプの選択肢
const FIELD_TYPES = [
  { val: 'text',          label: '📝 1行テキスト' },
  { val: 'textarea',      label: '📄 複数行テキスト' },
  { val: 'freetext',      label: '✏️ 記述式（自由記述）' },
  { val: 'fillblank',     label: '🔍 穴埋め（{{空欄}}形式）' },
  { val: 'choice_single', label: '🔘 選択肢（単一選択）' },
  { val: 'choice_multi',  label: '☑️ 選択肢（複数選択）' },
  { val: 'hint',          label: '💡 ヒント' },
  { val: 'tags',          label: '🏷️ タグ' },
  { val: 'difficulty',    label: '⭐ 難易度（1〜5）' },
  { val: 'explanation',   label: '📖 解説' },
  { val: 'wrongexample',  label: '❌ 誤答例（複数可）' },
  { val: 'timer',         label: '⏱️ 制限時間（秒）' },
  { val: 'feedback',      label: '💬 フィードバック' },
  { val: 'number',        label: '🔢 数値' },
  { val: 'image',         label: '🖼️ 画像（Ctrl+V）' },
  { val: 'url',           label: '🔗 URL / 関連リンク' },
  { val: 'date',          label: '📅 日付' },
  { val: 'static',        label: '🔖 固定テキスト（表示専用）' }
];

function addFieldRow(container, label = '', type = 'textarea', required = false, options = {}) {
  // 詳細設定の定義（タイプごと）
  const DETAIL_DEFS = {
    _common: [
      { key: 'align',    label: '文字揃え',   type: 'select', choices: [['left','左寄り'],['center','中央'],['right','右寄り']], default: 'left' },
      { key: 'bold',     label: '太字',       type: 'toggle', default: false },
      { key: 'fontSize', label: '文字サイズ', type: 'select', choices: [['sm','小'],['md','中'],['lg','大']], default: 'md' },
      { key: 'color',    label: '文字色',     type: 'color',  choices: ['#ffffff','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171'], default: '' },
    ],
    textarea:      [{ key: 'rows',      label: '表示行数',   type: 'number', min:1, max:10, default: 3 }, { key: 'maxlen', label: '最大文字数', type: 'number', min:0, default: 0, hint:'0=無制限' }],
    text:          [{ key: 'maxlen',    label: '最大文字数', type: 'number', min:0, default: 0, hint:'0=無制限' }],
    freetext:      [{ key: 'rows',      label: '表示行数',   type: 'number', min:1, max:10, default: 3 }],
    explanation:   [{ key: 'rows',      label: '表示行数',   type: 'number', min:1, max:10, default: 3 }],
    fillblank:     [{ key: 'blankStyle',label: '空欄スタイル', type: 'select', choices: [['underline','下線'],['box','ボックス'],['highlight','ハイライト']], default: 'underline' }, { key: 'showHint', label: '正解ヒント表示', type: 'toggle', default: false }],
    choice_single: [{ key: 'layout',   label: '並び方',     type: 'select', choices: [['vertical','縦'],['horizontal','横']], default: 'vertical' }, { key: 'shuffle', label: 'シャッフル', type: 'toggle', default: true }, { key: 'defaultCount', label: 'デフォルト選択肢数', type: 'number', min:2, max:6, default: 3 }],
    choice_multi:  [{ key: 'layout',   label: '並び方',     type: 'select', choices: [['vertical','縦'],['horizontal','横']], default: 'vertical' }, { key: 'shuffle', label: 'シャッフル', type: 'toggle', default: true }, { key: 'defaultCount', label: 'デフォルト選択肢数', type: 'number', min:2, max:6, default: 3 }],
    image:         [{ key: 'maxCount', label: '最大枚数',   type: 'select', choices: [['1','1枚'],['2','2枚'],['3','3枚']], default: '3' }, { key: 'size', label: '表示サイズ', type: 'select', choices: [['sm','小(サムネ)'],['md','中'],['lg','大(full幅)']], default: 'md' }],
    hint:          [{ key: 'showTiming',label: '表示タイミング', type: 'select', choices: [['button','ボタン後'],['always','常時']], default: 'button' }],
    difficulty:    [{ key: 'maxStars', label: '最大値',     type: 'select', choices: [['3','3段階'],['5','5段階'],['10','10段階']], default: '5' }, { key: 'defaultVal', label: 'デフォルト値', type: 'number', min:1, max:10, default: 3 }],
    timer:         [{ key: 'defaultSec',label: 'デフォルト秒数', type: 'number', min:5, max:600, default: 30 }, { key: 'timeupAction', label: 'タイムアップ時', type: 'select', choices: [['warn','警告のみ'],['auto','自動送り']], default: 'warn' }],
    url:           [{ key: 'linkLabel', label: 'リンクラベル', type: 'text', default: '参考資料を見る' }],
  };

  const typeDefs = DETAIL_DEFS[type] || [];
  const allDefs = [...DETAIL_DEFS._common, ...typeDefs];

  const row = document.createElement('div');
  row.className = 'field-row';
  row.draggable = true;

  // メイン行HTML
  row.innerHTML = `
    <div class="drag-handle" title="ドラッグして並び替え">⋮⋮</div>
    <select class="field-type">
      ${FIELD_TYPES.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>
    <button type="button" class="detail-toggle-btn" title="詳細設定" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#a78bfa;border-radius:6px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.8rem;white-space:nowrap;">⚙ 詳細</button>
    <label class="required-toggle"><input type="checkbox" class="field-required" ${required ? 'checked' : ''}>必須</label>
    <button type="button" class="btn-remove" title="削除">×</button>
  `;

  // 詳細設定パネル（アコーディオン）
  const detailPanel = document.createElement('div');
  detailPanel.className = 'detail-panel';
  detailPanel.style.cssText = 'display:none;grid-column:1/-1;background:rgba(0,0,0,0.25);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:0.75rem 1rem;margin-top:0.25rem;';

  const buildDetailPanel = (currentType, currentOptions) => {
    const typeDefs2 = DETAIL_DEFS[currentType] || [];
    const allDefs2 = [...DETAIL_DEFS._common, ...typeDefs2];
    detailPanel.innerHTML = `
      <div style="font-size:0.75rem;color:#a78bfa;font-weight:600;margin-bottom:0.6rem;letter-spacing:0.04em;">⚙ 詳細設定</div>
      <div class="detail-fields" style="display:flex;flex-wrap:wrap;gap:0.5rem 1.5rem;"></div>
    `;
    const fieldsContainer = detailPanel.querySelector('.detail-fields');
    allDefs2.forEach(def => {
      const val = currentOptions[def.key] !== undefined ? currentOptions[def.key] : def.default;
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;';
      if (def.type === 'toggle') {
        wrap.innerHTML = `<input type="checkbox" class="detail-input" data-key="${def.key}" ${val ? 'checked' : ''} style="accent-color:#6366f1;width:14px;height:14px;"> ${def.label}`;
      } else if (def.type === 'select') {
        wrap.innerHTML = `${def.label}: <select class="detail-input" data-key="${def.key}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;font-size:0.8rem;">${def.choices.map(([v,l]) => `<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;
      } else if (def.type === 'number') {
        wrap.innerHTML = `${def.label}${def.hint?` <span style="opacity:0.5;font-size:0.75rem;">(${def.hint})</span>`:''}: <input type="number" class="detail-input" data-key="${def.key}" value="${val}" min="${def.min||0}" max="${def.max||9999}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;width:70px;font-size:0.8rem;">`;
      } else if (def.type === 'color') {
        const swatches = def.choices.map(c => `<button type="button" class="color-swatch" data-color="${c}" style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid ${String(val)===c?'#fff':'transparent'};cursor:pointer;flex-shrink:0;"></button>`).join('');
        wrap.innerHTML = `${def.label}: <span class="color-swatches" style="display:flex;gap:4px;align-items:center;">${swatches}<button type="button" class="color-swatch" data-color="" style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.1);border:2px solid ${!val?'#fff':'transparent'};cursor:pointer;font-size:0.65rem;display:flex;align-items:center;justify-content:center;">✕</button></span><input type="hidden" class="detail-input" data-key="${def.key}" value="${val}">`;
      } else if (def.type === 'text') {
        wrap.innerHTML = `${def.label}: <input type="text" class="detail-input" data-key="${def.key}" value="${esc(String(val))}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;font-size:0.8rem;min-width:120px;">`;
      }
      fieldsContainer.appendChild(wrap);
    });
    // カラースウォッチのクリック処理
    detailPanel.querySelectorAll('.color-swatches').forEach(group => {
      group.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          const color = btn.dataset.color;
          group.querySelectorAll('.color-swatch').forEach(b => b.style.borderColor = 'transparent');
          btn.style.borderColor = '#fff';
          const hiddenInput = group.parentElement.querySelector('.detail-input[data-key="color"]');
          if (hiddenInput) hiddenInput.value = color;
          renderPreview();
        });
      });
    });
    detailPanel.querySelectorAll('.detail-input').forEach(inp => {
      inp.addEventListener('change', renderPreview);
      inp.addEventListener('input', renderPreview);
    });
  };

  buildDetailPanel(type, options);

  // wrapper: メイン行 + 詳細パネルをまとめる
  const wrapper = document.createElement('div');
  wrapper.className = 'field-row-wrapper';
  wrapper.style.cssText = 'margin-bottom:0.75rem;';
  wrapper.appendChild(row);
  wrapper.appendChild(detailPanel);

  // フィールドタイプ変更時に詳細パネルを再構築
  const typeSelect = row.querySelector('.field-type');
  typeSelect.addEventListener('change', () => {
    buildDetailPanel(typeSelect.value, {});
    renderPreview();
  });

  // 詳細ボタンのトグル
  row.querySelector('.detail-toggle-btn').addEventListener('click', () => {
    const isOpen = detailPanel.style.display !== 'none';
    detailPanel.style.display = isOpen ? 'none' : 'block';
    row.querySelector('.detail-toggle-btn').style.background = isOpen ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.3)';
  });

  // ドラッグ＆ドロップ
  row.addEventListener('dragstart', (e) => { wrapper.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  row.addEventListener('dragend',   () => { wrapper.classList.remove('dragging'); renderPreview(); });
  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = container.querySelector('.field-row-wrapper.dragging');
    if (!dragging || dragging === wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const next = (e.clientY - rect.top) > (rect.height / 2);
    container.insertBefore(dragging, next ? wrapper.nextSibling : wrapper);
  });

  row.querySelector('.btn-remove').addEventListener('click', () => { wrapper.remove(); renderPreview(); });

  container.appendChild(wrapper);
  renderPreview();
}

// フィールド行から設定値を収集するヘルパー
function collectFieldData(wrapper) {
  const row = wrapper.querySelector('.field-row');
  const typeSelect = row.querySelector('.field-type');
  const type = typeSelect.value;
  const required = row.querySelector('.field-required').checked;
  const typeInfo = FIELD_TYPES.find(t => t.val === type);
  // ラベルは種類名から自動生成（絵文字除去）
  const label = typeInfo ? typeInfo.label.replace(/^\S+\s/, '') : type;
  const options = {};
  wrapper.querySelectorAll('.detail-input').forEach(inp => {
    const key = inp.dataset.key;
    if (!key) return;
    if (inp.type === 'checkbox') options[key] = inp.checked;
    else if (inp.type === 'number') options[key] = Number(inp.value);
    else options[key] = inp.value;
  });
  return { type, required, label, options };
}

async function saveGenre() {
  const name = el.genreName.value.trim();
  if (!name) { showToast('ジャンル名を入力してください', true); return; }

  const fields = [];

  let qIdx = 0;
  let aIdx = 0;
  const collectFields = (container, role) => {
    container.querySelectorAll('.field-row-wrapper').forEach(wrapper => {
      const { type, required, label, options } = collectFieldData(wrapper);
      const key = (role === 'question' ? `q_${qIdx++}` : `a_${aIdx++}`);
      fields.push({ key, label, type, required, role, options });
    });
  };

  collectFields(el.qContainer, 'question');
  collectFields(el.aContainer, 'answer');

  if (fields.filter(f => f.role === 'question').length === 0) {
    showToast('問題フィールドを1つ以上追加してください', true);
    return;
  }
  if (fields.filter(f => f.role === 'answer').length === 0) {
    showToast('答えフィールドを1つ以上追加してください', true);
    return;
  }

  if (editingGenreId) {
    // 編集モード：既存ジャンルを上書き（id・isDefault は保持）
    const index = genres.findIndex(g => g.id === editingGenreId);
    if (index !== -1) {
      genres[index] = {
        ...genres[index],
        name,
        fields
      };
    }
  } else {
    // 新規追加
    genres.push({ id: 'custom_' + Date.now(), name, isDefault: false, fields });
  }

  await StorageManager.saveGenres(genres);
  closeEditor(); // フォームリセット
  showToast('ジャンルを保存しました！');
}

// リアルタイムプレビュー
function renderPreview() {
  const collectPreviewData = (container) => {
    const data = [];
    container.querySelectorAll('.field-row-wrapper').forEach(wrapper => {
      const { type } = collectFieldData(wrapper);
      const typeInfo = FIELD_TYPES.find(t => t.val === type);
      const typeName = typeInfo ? typeInfo.label : type;
      data.push({ label: typeName, type });
    });
    return data;
  };

  const qData = collectPreviewData(el.qContainer);
  const aData = collectPreviewData(el.aContainer);

  const renderSection = (title, data) => {
    if (data.length === 0) return '';
    // フィールド名をボックス内部にプレースホルダー風で表示
    const dummyBox = (f) => {
      const labelInner = `<span style="opacity:0.55;font-size:0.8rem;">${esc(f.label)}</span>`;
      if (f.type === 'textarea' || f.type === 'freetext' || f.type === 'fillblank' || f.type === 'explanation') {
        return `<div style="min-height:52px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;display:flex;align-items:center;justify-content:center;padding:0.4rem 0.75rem;color:var(--text-secondary);">${labelInner}</div>`;
      } else if (f.type === 'image') {
        return `<div style="height:64px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;display:flex;align-items:center;justify-content:center;gap:0.4rem;color:var(--text-secondary);">🖼️ ${labelInner}</div>`;
      } else if (f.type === 'choice_single' || f.type === 'choice_multi') {
        return `<div style="display:flex;flex-direction:column;gap:3px;">${['A','B','C'].map((l,i) => `<div style="height:22px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:3px;display:flex;align-items:center;padding:0 6px;font-size:0.72rem;color:var(--text-secondary);">${i===0?'✅':(f.type==='choice_multi'?'☐':'○')} ${i===0?esc(f.label)+' (正解例)':'選択肢'}</div>`).join('')}</div>`;
      } else if (f.type === 'difficulty') {
        return `<div style="height:30px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:5px;display:flex;align-items:center;padding:0 0.75rem;gap:0.3rem;font-size:1rem;">⭐⭐⭐☆☆ ${labelInner}</div>`;
      } else if (f.type === 'tags') {
        return `<div style="height:30px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:5px;display:flex;align-items:center;padding:0 0.75rem;gap:0.4rem;"><span style="background:rgba(20,184,166,0.2);border:1px solid rgba(20,184,166,0.35);color:#14b8a6;padding:0.1rem 0.45rem;border-radius:10px;font-size:0.72rem;">${esc(f.label)}</span></div>`;
      } else if (f.type === 'hint') {
        return `<div style="height:30px;background:rgba(251,191,36,0.07);border:1px dashed rgba(251,191,36,0.3);border-radius:5px;display:flex;align-items:center;padding:0 0.75rem;gap:0.4rem;color:var(--text-secondary);">💡 ${labelInner}</div>`;
      } else if (f.type === 'wrongexample') {
        return `<div style="display:flex;flex-direction:column;gap:2px;">${['誤答例1','誤答例2'].map(w => `<div style="height:22px;background:rgba(239,68,68,0.07);border-left:2px solid rgba(239,68,68,0.4);border-radius:3px;padding:0 8px;display:flex;align-items:center;font-size:0.72rem;color:var(--text-secondary);">❌ ${w}</div>`).join('')}</div>`;
      } else if (f.type === 'feedback') {
        return `<div style="height:30px;background:rgba(34,197,94,0.07);border:1px dashed rgba(34,197,94,0.3);border-radius:5px;display:flex;align-items:center;padding:0 0.75rem;gap:0.4rem;color:var(--text-secondary);">💬 ${labelInner}</div>`;
      } else {
        return `<div style="height:30px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;display:flex;align-items:center;padding:0 0.75rem;color:var(--text-secondary);">${labelInner}</div>`;
      }
    };
    return `
      <div style="margin-bottom: 1rem;">
        <div style="font-size: 0.75rem; color: #a78bfa; font-weight: 600; margin-bottom: 0.5rem; text-transform: uppercase; border-bottom: 1px solid rgba(167,139,250,0.2);">${title}</div>
        ${data.map(f => `<div style="margin-bottom: 0.4rem;">${dummyBox(f)}</div>`).join('')}
      </div>
    `;
  };

  el.previewPanel.innerHTML = `
    <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.75rem; font-weight: 500;">カードプレビュー</div>
    <div style="background: rgba(15,23,42,0.6); padding: 1.25rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
      ${renderSection('FRONT (問題)', qData)}
      ${renderSection('BACK (回答)', aData)}
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
