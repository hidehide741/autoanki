import StorageManager, { uploadImageToSupabase } from './storage.js';
import { renderFieldHtml as _renderFieldHtml, escapeHtml } from './renderCard.js';

const MAX_IMAGES = 3;

// HTML エスケープ（renderCard.js からインポートした escapeHtml のエイリアス）
const esc = escapeHtml;
let genres = [];
let pendingImages = {};
let editingCardId = null;
let editingCardOriginal = null;

// ===== ステップ管理 =====
let currentStep = 1;          // 1=型選択, 2=微調整, 3=入力
let activeGenre = null;       // ステップ2・3で使う「現在の型」(fields配列を含む)
let activeGenreId = null;     // 選択したジャンルのid（保存時に使う）

// settings.jsと共通のフィールドタイプ定義
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

// フィールドタイプ別詳細設定定義（wrapFieldWithToolbar 内の詳細パネルで使用）
const FIELD_DETAIL_DEFS = {
  _common: [
    { key: 'align',    label: '文字揃え(横)',   type: 'select', choices: [['left','左寄り'],['center','中央'],['right','右寄り']], default: 'left' },
    { key: 'valign',   label: '文字揃え(縦)',   type: 'select', choices: [['top','上'],['middle','中'],['bottom','下']], default: 'middle' },
    { key: 'bold',     label: '太字',           type: 'toggle', default: false },
    { key: 'fontSize', label: '文字サイズ',     type: 'select', choices: [['sm','小'],['md','中'],['lg','大']], default: 'md' },
    { key: 'color',    label: '文字色',         type: 'color',  choices: ['#ffffff','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#000000'], default: '' },
  ],
  textarea:      [{ key: 'rows', label: '表示行数', type: 'number', min:1, max:10, default: 3 }],
  freetext:      [{ key: 'rows', label: '表示行数', type: 'number', min:1, max:10, default: 3 }],
  explanation:   [{ key: 'rows', label: '表示行数', type: 'number', min:1, max:10, default: 3 }],
  fillblank:     [{ key: 'blankStyle', label: '空欄スタイル', type: 'select', choices: [['underline','下線'],['box','ボックス'],['highlight','ハイライト']], default: 'underline' }, { key: 'showHint', label: 'ヒント表示', type: 'toggle', default: false }],
  choice_single: [{ key: 'layout', label: '並び方', type: 'select', choices: [['vertical','縦'],['horizontal','横']], default: 'vertical' }, { key: 'shuffle', label: 'シャッフル', type: 'toggle', default: true }, { key: 'defaultCount', label: 'デフォルト選択肢数', type: 'number', min:2, max:6, default: 3 }],
  choice_multi:  [{ key: 'layout', label: '並び方', type: 'select', choices: [['vertical','縦'],['horizontal','横']], default: 'vertical' }, { key: 'shuffle', label: 'シャッフル', type: 'toggle', default: true }, { key: 'defaultCount', label: 'デフォルト選択肢数', type: 'number', min:2, max:6, default: 3 }],
  image:         [{ key: 'maxCount', label: '最大枚数', type: 'select', choices: [['1','1枚'],['2','2枚'],['3','3枚']], default: '3' }, { key: 'size', label: '表示サイズ', type: 'select', choices: [['sm','小'],['md','中'],['lg','大']], default: 'md' }],
  hint:          [{ key: 'showTiming', label: '表示タイミング', type: 'select', choices: [['button','ボタン後'],['always','常時']], default: 'button' }],
  difficulty:    [{ key: 'maxStars', label: '最大値', type: 'select', choices: [['3','3段階'],['5','5段階'],['10','10段階']], default: '5' }, { key: 'defaultVal', label: 'デフォルト値', type: 'number', min:1, max:10, default: 3 }],
  timer:         [{ key: 'defaultSec', label: 'デフォルト秒数', type: 'number', min:5, max:600, default: 30 }, { key: 'timeupAction', label: 'タイムアップ時', type: 'select', choices: [['warn','警告のみ'],['auto','自動送り']], default: 'warn' }],
  url:           [{ key: 'linkLabel', label: 'リンクラベル', type: 'text', default: '参考資料を見る' }],
  static:        [{ key: 'border', label: '枠を表示', type: 'toggle', default: true }],
};

const el = {
  formFields: document.getElementById('form-fields'),
  addForm: document.getElementById('add-card-form'),
  successMsg: document.getElementById('add-success-msg')
};

// ===== ステップ遷移 =====
function goStep(n) {
  currentStep = n;
  document.getElementById('step1-panel').classList.toggle('hidden', n !== 1);
  document.getElementById('step2-panel').classList.toggle('hidden', n !== 2);
  document.getElementById('step3-panel').classList.toggle('hidden', n !== 3);
  // ステップインジケーター更新
  document.querySelectorAll('.step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (s === n) dot.classList.add('active');
    else if (s < n) dot.classList.add('done');
  });
  document.querySelectorAll('.step-line').forEach((line, i) => {
    line.classList.toggle('done', i + 1 < n);
  });
}

async function init() {
  genres = await StorageManager.getGenres();

  // URLパラメータ ?edit=<id> を検知して編集モードへ（直接STEP3）
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    editingCardId = editId;
    await enterEditMode(editId);
    return;
  }

  // ステップインジケーター非表示（直接フォームへ）
  const stepInd = document.getElementById('step-indicator');
  if (stepInd) stepInd.style.display = 'none';

  // デフォルトで最初のジャンルを選択
  if (genres.length) {
    activeGenre = { ...genres[0], fields: JSON.parse(JSON.stringify(genres[0].fields)) };
    activeGenreId = genres[0].id;
  }

  renderGenreTags();
  goStep(3);
  renderForm();
  setupGlobalListeners();
}

// ===== ジャンルタグ =====
function renderGenreTags() {
  const container = document.getElementById('genre-tags-container');
  if (!container) return;
  container.innerHTML = '';
  genres.forEach(g => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = g.name;
    btn.className = 'genre-tag-btn' + (g.id === activeGenreId ? ' active' : '');
    btn.addEventListener('click', () => switchGenreWithWarning(g));
    container.appendChild(btn);
  });
}

function hasFormContent() {
  return [...document.querySelectorAll(
    '#form-fields input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), #form-fields textarea'
  )].some(i => i.value.trim() !== '');
}

function switchGenreWithWarning(genre) {
  if (genre.id === activeGenreId) return;
  if (hasFormContent() && !confirm(`「${genre.name}」に切り替えます。\n入力済みの内容は消えます。よろしいですか？`)) return;
  activeGenre = { ...genre, fields: JSON.parse(JSON.stringify(genre.fields)) };
  activeGenreId = genre.id;
  renderGenreTags();
  renderForm();
}

// ===== フィールドツールバーラッパー（⚙ 詳細・× 削除・☷☷ D&D） =====
function wrapFieldWithToolbar(field, formGroupDiv) {
  const container = document.createElement('div');
  container.className = 'field-container';
  container.dataset.fieldKey = field.key;
  container.dataset.fieldType = field.type;
  container.dataset.fieldRole = field.role;
  container.dataset.fieldLabel = field.label;
  container.dataset.fieldRequired = field.required ? '1' : '0';
  container.style.cssText = 'margin-bottom:1.25rem;';
  container.draggable = false;

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:0.35rem;margin-bottom:0.3rem;';

  // 左側: ドラッグハンドル + フィールド名
  const leftSide = document.createElement('div');
  leftSide.style.cssText = 'display:flex;align-items:center;gap:0.4rem;overflow:hidden;';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'fc-drag-handle';
  dragHandle.title = 'ドラッグして並び替え';
  dragHandle.textContent = '⋯⋯';
  dragHandle.addEventListener('mousedown', () => { container.draggable = true; });
  dragHandle.addEventListener('mouseleave', () => { if (!_formDragSrc) container.draggable = false; });

  const typeLabel = document.createElement('span');
  typeLabel.style.cssText = 'font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  typeLabel.textContent = (FIELD_TYPES.find(t => t.val === field.type)?.label || field.type).replace(/^\S+\s/, '') + ' 「' + field.label + '」';

  leftSide.appendChild(dragHandle);
  leftSide.appendChild(typeLabel);

  // 右側: 詳細ボタン + 削除ボタン
  const rightSide = document.createElement('div');
  rightSide.style.cssText = 'display:flex;align-items:center;gap:0.35rem;flex-shrink:0;';

  const detailBtn = document.createElement('button');
  detailBtn.type = 'button';
  detailBtn.textContent = '⚙ 詳細';
  detailBtn.style.cssText = 'background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);color:#a78bfa;border-radius:5px;padding:0.18rem 0.55rem;cursor:pointer;font-size:0.75rem;line-height:1.6;transition:background 0.15s;';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.title = 'このフィールドを削除';
  removeBtn.style.cssText = 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:5px;width:26px;height:26px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s;';

  rightSide.appendChild(detailBtn);
  rightSide.appendChild(removeBtn);

  toolbar.appendChild(leftSide);
  toolbar.appendChild(rightSide);

  const detailPanel = createFieldDetailPanel(field);
  detailPanel.style.cssText = 'display:none;background:rgba(0,0,0,0.25);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:0.75rem 1rem;margin-bottom:0.5rem;';

  detailBtn.addEventListener('click', () => {
    const open = detailPanel.style.display !== 'none';
    detailPanel.style.display = open ? 'none' : 'block';
    detailBtn.style.background = open ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.3)';
  });

  removeBtn.addEventListener('click', () => {
    container.remove();
    activeGenre.fields = activeGenre.fields.filter(f => f.key !== field.key);
    updateCardPreview(activeGenre, currentPreviewValues);
  });

  // ===== D&D 処理 =====
  // ドラッグ開始：container 自体をドラッグソースに
  container.addEventListener('dragstart', (e) => {
    // ドラッグハンドルかどうかはチェック不要（container全体が draggable）
    _formDragSrc = container;
    e.dataTransfer.effectAllowed = 'move';
    const rect = container.getBoundingClientRect();
    const ghost = container.cloneNode(true);
    ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${rect.width}px;pointer-events:none;opacity:0.8;`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
    requestAnimationFrame(() => ghost.remove());
    requestAnimationFrame(() => container.classList.add('fc-dragging'));
  });

  container.addEventListener('dragend', () => {
    if (_formDragSrc) _formDragSrc.classList.remove('fc-dragging');
    document.querySelectorAll('.field-container').forEach(c => c.classList.remove('fc-drop-above','fc-drop-below'));
    container.draggable = false;
    _formDragSrc = null;
    // DOM 順序から activeGenre.fields を再構築
    syncFieldsFromDom();
    updateCardPreview(activeGenre, currentPreviewValues);
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!_formDragSrc || _formDragSrc === container) return;
    // 別ロールブロック間の移動は不可
    if (_formDragSrc.dataset.fieldRole !== container.dataset.fieldRole) return;
    document.querySelectorAll('.field-container').forEach(c => c.classList.remove('fc-drop-above','fc-drop-below'));
    const rect = container.getBoundingClientRect();
    const goBelow = e.clientY > rect.top + rect.height / 2;
    container.classList.add(goBelow ? 'fc-drop-below' : 'fc-drop-above');
    // 実際に DOM を入れ替え（リアルタイムに動く）
    const parent = container.parentElement;
    if (goBelow) {
      // 「フィールドを追加」ボタンの维思笠（.add-field-wrap）の直前に插入
      const addWrap = parent.querySelector('.add-field-wrap');
      const refNode = container.nextSibling;
      if (refNode && refNode !== _formDragSrc) {
        parent.insertBefore(_formDragSrc, refNode === addWrap ? addWrap : refNode);
      } else if (!refNode || refNode === addWrap) {
        parent.insertBefore(_formDragSrc, addWrap || null);
      }
    } else {
      parent.insertBefore(_formDragSrc, container);
    }
  });

  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) container.classList.remove('fc-drop-above','fc-drop-below');
  });

  container.appendChild(toolbar);
  container.appendChild(detailPanel);
  formGroupDiv.style.marginBottom = '0';
  container.appendChild(formGroupDiv);
  return container;
}

function createFieldDetailPanel(field) {
  const panel = document.createElement('div');
  const defs = [...(FIELD_DETAIL_DEFS._common || []), ...(FIELD_DETAIL_DEFS[field.type] || [])];
  const curOpts = field.options || {};

  const header = document.createElement('div');
  header.style.cssText = 'font-size:0.75rem;color:#a78bfa;font-weight:600;margin-bottom:0.6rem;';
  header.textContent = '⚙ 詳細設定 ─ ' + field.label;

  const fieldsRow = document.createElement('div');
  fieldsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem 1.5rem;';

  if (!defs.length) {
    const msg = document.createElement('span');
    msg.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);';
    msg.textContent = 'このフィールドタイプの詳細設定はありません';
    fieldsRow.appendChild(msg);
  }

  defs.forEach(def => {
    const val = curOpts[def.key] !== undefined ? curOpts[def.key] : def.default;
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;';
    if (def.type === 'toggle') {
      wrap.innerHTML = `<input type="checkbox" class="detail-input" data-key="${def.key}" ${val ? 'checked' : ''} style="accent-color:#6366f1;width:14px;height:14px;"> ${def.label}`;
    } else if (def.type === 'select') {
      wrap.innerHTML = `${def.label}: <select class="detail-input" data-key="${def.key}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;font-size:0.8rem;">${def.choices.map(([v,l]) => `<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;
    } else if (def.type === 'number') {
      wrap.innerHTML = `${def.label}: <input type="number" class="detail-input" data-key="${def.key}" value="${val}" min="${def.min||0}" max="${def.max||9999}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;width:70px;font-size:0.8rem;">`;
    } else if (def.type === 'color') {
      const swatches = def.choices.map(c => `<button type="button" class="color-swatch" data-color="${c}" style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid ${String(val)===c?'#fff':'rgba(255,255,255,0.25)'};cursor:pointer;flex-shrink:0;"></button>`).join('');
      wrap.innerHTML = `${def.label}: <span class="color-swatches" style="display:flex;gap:4px;align-items:center;">${swatches}</span><input type="hidden" class="detail-input" data-key="${def.key}" value="${val}">`;
    } else if (def.type === 'text') {
      wrap.innerHTML = `${def.label}: <input type="text" class="detail-input" data-key="${def.key}" value="${esc(String(val))}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;font-size:0.8rem;min-width:120px;">`;
    }
    fieldsRow.appendChild(wrap);
  });

  panel.appendChild(header);
  panel.appendChild(fieldsRow);

  // カラースウォッチのクリック処理（hidden inputを直接更新 + field.options反映）
  panel.querySelectorAll('.color-swatches').forEach(group => {
    group.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        group.querySelectorAll('.color-swatch').forEach(b => b.style.borderColor = 'rgba(255,255,255,0.25)');
        btn.style.borderColor = '#fff';
        const hiddenInput = group.parentElement.querySelector('.detail-input[data-key="color"]');
        if (hiddenInput) hiddenInput.value = color;
        if (!field.options) field.options = {};
        field.options.color = color;
        updateCardPreview(activeGenre, currentPreviewValues);
      });
    });
  });

  // 変更時に field.options を即時反映 + プレビュー更新
  panel.addEventListener('change', () => {
    panel.querySelectorAll('.detail-input').forEach(inp => {
      const k = inp.dataset.key;
      if (!k) return;
      if (!field.options) field.options = {};
      const newVal = inp.type === 'checkbox' ? inp.checked
                   : inp.type === 'number'   ? Number(inp.value)
                   :                           inp.value;
      field.options[k] = newVal;
      // 選択肢数が変更されたら選択肢リストを更新
      if (k === 'defaultCount' && typeof field._updateChoiceCount === 'function') {
        field._updateChoiceCount(Number(newVal));
      }
    });
    updateCardPreview(activeGenre, currentPreviewValues);
  });
  return panel;
}

// ===== DOM 順序から activeGenre.fields を再構築 =====
function syncFieldsFromDom() {
  if (!activeGenre) return;
  const keyMap = Object.fromEntries(activeGenre.fields.map(f => [f.key, f]));
  const newFields = [];
  document.querySelectorAll('#form-fields .field-container').forEach(c => {
    const f = keyMap[c.dataset.fieldKey];
    if (f) newFields.push(f);
  });
  // DOM に出ていないフィールド（万一）は末尾に追加
  activeGenre.fields.forEach(f => { if (!newFields.includes(f)) newFields.push(f); });
  activeGenre.fields = newFields;
}

// ===== フィールド追加ボタン & 新フィールド追加 =====
function createAddFieldBtn(inner, role) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:0.5rem;';
  wrap.className = 'add-field-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '＋ フィールドを追加';
  btn.style.cssText = 'background:rgba(99,102,241,0.08);border:1px dashed rgba(99,102,241,0.35);color:#a78bfa;padding:0.4rem 1rem;border-radius:6px;cursor:pointer;font-size:0.82rem;width:100%;transition:all 0.2s;font-family:inherit;';

  const picker = document.createElement('div');
  picker.style.cssText = 'display:none;flex-wrap:wrap;gap:0.35rem;padding:0.75rem;background:rgba(0,0,0,0.3);border-radius:8px;margin-top:0.4rem;border:1px solid rgba(255,255,255,0.08);';

  FIELD_TYPES.forEach(ft => {
    const ftBtn = document.createElement('button');
    ftBtn.type = 'button';
    ftBtn.textContent = ft.label;
    ftBtn.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:var(--text-secondary);padding:0.28rem 0.65rem;border-radius:6px;cursor:pointer;font-size:0.78rem;font-family:inherit;transition:background 0.15s;';
    ftBtn.addEventListener('mouseenter', () => ftBtn.style.background = 'rgba(99,102,241,0.15)');
    ftBtn.addEventListener('mouseleave', () => ftBtn.style.background = 'rgba(255,255,255,0.04)');
    ftBtn.addEventListener('click', () => {
      addNewFormField(inner, role, ft.val);
      picker.style.display = 'none';
      btn.textContent = '＋ フィールドを追加';
    });
    picker.appendChild(ftBtn);
  });

  btn.addEventListener('click', () => {
    const isOpen = picker.style.display !== 'none';
    picker.style.display = isOpen ? 'none' : 'flex';
    btn.textContent = isOpen ? '＋ フィールドを追加' : '▲ 閉じる';
  });

  wrap.appendChild(btn);
  wrap.appendChild(picker);
  return wrap;
}

function addNewFormField(inner, role, type) {
  const typeInfo = FIELD_TYPES.find(t => t.val === type);
  const label = typeInfo ? typeInfo.label.replace(/^\S+\s/, '') : type;
  const key = (role === 'answer' ? 'a' : 'q') + '_' + Date.now();
  const newField = { key, type, label, required: false, role, options: {} };
  activeGenre.fields.push(newField);

  if (type === 'image') {
    if (!pendingImages[newField.key]) pendingImages[newField.key] = [];
    inner.insertBefore(wrapFieldWithToolbar(newField, buildImagePasteUI(newField)), inner.lastChild);
    return;
  }

  if (type === 'choice_single' || type === 'choice_multi') {
    inner.insertBefore(wrapFieldWithToolbar(newField, buildChoiceFieldUI(newField, activeGenre)), inner.lastChild);
    return;
  }

  const div = document.createElement('div');
  div.className = 'form-group';
  const labelEl = document.createElement('label');
  labelEl.htmlFor = `field-${newField.key}`;
  labelEl.innerHTML = label + (newField.required ? '<span class="required-badge">必須</span>' : '');

  if (type === 'fillblank') {
    const guide = document.createElement('div');
    guide.style.cssText = 'font-size:0.8rem;color:#fbbf24;margin-bottom:0.5rem;background:rgba(251,191,36,0.08);padding:0.4rem 0.75rem;border-radius:6px;';
    guide.innerHTML = '空欄にしたい部分を <code style="background:rgba(0,0,0,0.3);padding:0.1rem 0.3rem;border-radius:3px;color:#fde68a;">{{正解}}</code> で囲む';
    const ta = document.createElement('textarea');
    ta.rows = 3; ta.id = `field-${newField.key}`; ta.name = newField.key;
    ta.placeholder = '例: 日本の首都は{{東京}}です';
    ta.addEventListener('input', () => { currentPreviewValues[newField.key] = ta.value; updateCardPreview(activeGenre, currentPreviewValues); });
    div.appendChild(labelEl); div.appendChild(guide); div.appendChild(ta);
  } else if (type === 'static') {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = `field-${newField.key}`; inp.name = newField.key;
    inp.value = label; inp.placeholder = label;
    inp.style.cssText = 'border-left:3px solid #a78bfa;color:#a78bfa;';
    inp.addEventListener('input', () => { currentPreviewValues[newField.key] = inp.value; updateCardPreview(activeGenre, currentPreviewValues); });
    currentPreviewValues[newField.key] = inp.value;
    div.appendChild(labelEl); div.appendChild(inp);
  } else if (['textarea', 'freetext', 'explanation'].includes(type)) {
    const ta = document.createElement('textarea');
    ta.rows = 3; ta.id = `field-${newField.key}`; ta.name = newField.key;
    ta.placeholder = `${label}を入力…`;
    ta.addEventListener('input', () => { currentPreviewValues[newField.key] = ta.value; updateCardPreview(activeGenre, currentPreviewValues); });
    div.appendChild(labelEl); div.appendChild(ta);
  } else {
    const inp = document.createElement('input');
    inp.type = ['number','date','url'].includes(type) ? type : (type === 'timer' ? 'number' : 'text');
    inp.id = `field-${newField.key}`; inp.name = newField.key;
    inp.placeholder = `${label}を入力…`;
    inp.addEventListener('input', () => { currentPreviewValues[newField.key] = inp.value; updateCardPreview(activeGenre, currentPreviewValues); });
    div.appendChild(labelEl); div.appendChild(inp);
  }

  inner.insertBefore(wrapFieldWithToolbar(newField, div), inner.lastChild);
  updateCardPreview(activeGenre, currentPreviewValues);
}

// ===== 現在のフィールド構成を型として保存 =====
async function saveCurrentAsGenre() {
  const fields = [];
  document.querySelectorAll('#form-fields .field-container').forEach(container => {
    fields.push({
      key:      container.dataset.fieldKey,
      type:     container.dataset.fieldType,
      role:     container.dataset.fieldRole,
      label:    container.dataset.fieldLabel,
      required: container.dataset.fieldRequired === '1',
      options:  (() => {
        const opts = {};
        container.querySelectorAll('.detail-input').forEach(inp => {
          const k = inp.dataset.key; if (!k) return;
          if (inp.type === 'checkbox') opts[k] = inp.checked;
          else if (inp.type === 'number') opts[k] = Number(inp.value);
          else opts[k] = inp.value;
        });
        return opts;
      })()
    });
  });
  if (!fields.length) { alert('フィールドが1つもありません'); return; }

  const defaultName = activeGenre?.name || '新しいジャンル';
  const isExisting = genres.find(g => g.id === activeGenreId && !g.isDefault);
  const name = prompt(
    isExisting
      ? `「${defaultName}」を上書き保存しますか？\n別名にする場合は変更してください。`
      : 'ジャンル名を入力してください',
    defaultName
  );
  if (!name) return;

  const id = (name.trim() === defaultName && activeGenreId) ? activeGenreId : ('custom_' + Date.now());
  const newGenre = { id, name: name.trim(), isDefault: false, fields };
  genres = await StorageManager.getGenres();
  const idx = genres.findIndex(g => g.id === id);
  if (idx !== -1) genres[idx] = newGenre; else genres.push(newGenre);
  await StorageManager.saveGenres(genres);

  activeGenre = { ...newGenre, fields: JSON.parse(JSON.stringify(newGenre.fields)) };
  activeGenreId = id;
  renderGenreTags();

  const saveBtn = document.getElementById('save-genre-btn');
  if (saveBtn) {
    saveBtn.textContent = '✅ 保存しました';
    setTimeout(() => { saveBtn.textContent = '💾 型を保存'; }, 2000);
  }
}

// ===== STEP 1: 型を選ぶ =====
function renderStep1() {
  const grid = document.getElementById('template-grid');
  grid.innerHTML = '';

  genres.forEach(genre => {
    const card = document.createElement('div');
    card.className = 'template-card';
    const fieldNames = genre.fields.map(f => {
      const ti = FIELD_TYPES.find(t => t.val === f.type);
      return (ti ? ti.label.replace(/^\S+\s/, '') : f.type);
    }).slice(0, 4).join('、') + (genre.fields.length > 4 ? '…' : '');
    card.innerHTML = `
      <div class="template-card-name">${esc(genre.name)}</div>
      <div class="template-card-fields">${fieldNames}</div>
    `;
    card.addEventListener('click', () => {
      // ジャンルのフィールドをディープコピーしてSTEP2へ
      activeGenre = { ...genre, fields: JSON.parse(JSON.stringify(genre.fields)) };
      activeGenreId = genre.id;
      goStep(2);
      renderStep2();
    });
    grid.appendChild(card);
  });

  document.getElementById('scratch-btn').onclick = () => {
    // 空の型でSTEP2へ
    activeGenre = {
      id: null,
      name: '新しい型',
      fields: [
        { key: 'q_0', label: '問題', type: 'textarea', required: true, role: 'question', options: {} },
        { key: 'a_0', label: '答え', type: 'textarea', required: true, role: 'answer',   options: {} }
      ]
    };
    activeGenreId = null;
    goStep(2);
    renderStep2();
  };
}

// ===== STEP 2: フィールド微調整 =====
// settings.jsのaddFieldRow相当の実装（options.js内完結版）
let _s2DragSrcWrapper = null;
let _formDragSrc = null; // renderForm フィールドの D&D 用

function s2AddFieldRow(container, type = 'textarea', required = false, options = {}) {
  const DETAIL_DEFS = {
    _common: [
      { key: 'align',    label: '文字揃え(横)',   type: 'select', choices: [['left','左寄り'],['center','中央'],['right','右寄り']], default: 'left' },
      { key: 'valign',   label: '文字揃え(縦)',   type: 'select', choices: [['top','上'],['middle','中'],['bottom','下']], default: 'middle' },
      { key: 'bold',     label: '太字',           type: 'toggle', default: false },
      { key: 'fontSize', label: '文字サイズ',     type: 'select', choices: [['sm','小'],['md','中'],['lg','大']], default: 'md' },
      { key: 'color',    label: '文字色',         type: 'color',  choices: ['#ffffff','#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#000000'], default: '' },
    ],
    textarea:      [{ key: 'rows', label: '表示行数', type: 'number', min:1, max:10, default: 3 }],
    freetext:      [{ key: 'rows', label: '表示行数', type: 'number', min:1, max:10, default: 3 }],
    explanation:   [{ key: 'rows', label: '表示行数', type: 'number', min:1, max:10, default: 3 }],
    fillblank:     [{ key: 'blankStyle', label: '空欄スタイル', type: 'select', choices: [['underline','下線'],['box','ボックス'],['highlight','ハイライト']], default: 'underline' }, { key: 'showHint', label: 'ヒント表示', type: 'toggle', default: false }],
    choice_single: [{ key: 'layout', label: '並び方', type: 'select', choices: [['vertical','縦'],['horizontal','横']], default: 'vertical' }, { key: 'shuffle', label: 'シャッフル', type: 'toggle', default: true }, { key: 'defaultCount', label: 'デフォルト選択肢数', type: 'number', min:2, max:6, default: 3 }],
    choice_multi:  [{ key: 'layout', label: '並び方', type: 'select', choices: [['vertical','縦'],['horizontal','横']], default: 'vertical' }, { key: 'shuffle', label: 'シャッフル', type: 'toggle', default: true }, { key: 'defaultCount', label: 'デフォルト選択肢数', type: 'number', min:2, max:6, default: 3 }],
    image:         [{ key: 'maxCount', label: '最大枚数', type: 'select', choices: [['1','1枚'],['2','2枚'],['3','3枚']], default: '3' }, { key: 'size', label: '表示サイズ', type: 'select', choices: [['sm','小'],['md','中'],['lg','大']], default: 'md' }],
    hint:          [{ key: 'showTiming', label: '表示タイミング', type: 'select', choices: [['button','ボタン後'],['always','常時']], default: 'button' }],
    difficulty:    [{ key: 'maxStars', label: '最大値', type: 'select', choices: [['3','3段階'],['5','5段階'],['10','10段階']], default: '5' }, { key: 'defaultVal', label: 'デフォルト値', type: 'number', min:1, max:10, default: 3 }],
    timer:         [{ key: 'defaultSec', label: 'デフォルト秒数', type: 'number', min:5, max:600, default: 30 }, { key: 'timeupAction', label: 'タイムアップ時', type: 'select', choices: [['warn','警告のみ'],['auto','自動送り']], default: 'warn' }],
    url:           [{ key: 'linkLabel', label: 'リンクラベル', type: 'text', default: '参考資料を見る' }],
    static:        [{ key: 'border', label: '枠を表示', type: 'toggle', default: true }],
  };

  const row = document.createElement('div');
  row.className = 'field-row';
  row.draggable = true;
  row.innerHTML = `
    <div class="drag-handle" title="ドラッグして並び替え">⋮⋮</div>
    <select class="field-type">
      ${FIELD_TYPES.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>
    <button type="button" class="detail-toggle-btn" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#a78bfa;border-radius:6px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.8rem;white-space:nowrap;">⚙ 詳細</button>
    <label class="required-toggle"><input type="checkbox" class="field-required" ${required ? 'checked' : ''}>必須</label>
    <button type="button" class="btn-remove" title="削除">×</button>
  `;

  const detailPanel = document.createElement('div');
  detailPanel.className = 'detail-panel';
  detailPanel.style.cssText = 'display:none;grid-column:1/-1;background:rgba(0,0,0,0.25);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:0.75rem 1rem;margin-top:0.25rem;';

  const buildDetail = (curType, curOpts) => {
    const defs = [...(DETAIL_DEFS._common || []), ...(DETAIL_DEFS[curType] || [])];
    detailPanel.innerHTML = `<div style="font-size:0.75rem;color:#a78bfa;font-weight:600;margin-bottom:0.6rem;">⚙ 詳細設定</div><div class="detail-fields" style="display:flex;flex-wrap:wrap;gap:0.5rem 1.5rem;"></div>`;
    const fc = detailPanel.querySelector('.detail-fields');
    defs.forEach(def => {
      const val = curOpts[def.key] !== undefined ? curOpts[def.key] : def.default;
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--text-secondary);cursor:pointer;';
      if (def.type === 'toggle') {
        wrap.innerHTML = `<input type="checkbox" class="detail-input" data-key="${def.key}" ${val ? 'checked' : ''} style="accent-color:#6366f1;width:14px;height:14px;"> ${def.label}`;
      } else if (def.type === 'select') {
        wrap.innerHTML = `${def.label}: <select class="detail-input" data-key="${def.key}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;font-size:0.8rem;">${def.choices.map(([v,l]) => `<option value="${v}" ${String(val)===v?'selected':''}>${l}</option>`).join('')}</select>`;
      } else if (def.type === 'number') {
        wrap.innerHTML = `${def.label}: <input type="number" class="detail-input" data-key="${def.key}" value="${val}" min="${def.min||0}" max="${def.max||9999}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;width:70px;font-size:0.8rem;">`;
      } else if (def.type === 'color') {
        const swatches = def.choices.map(c => `<button type="button" class="color-swatch" data-color="${c}" style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid ${String(val)===c?'#fff':'rgba(255,255,255,0.25)'};cursor:pointer;flex-shrink:0;"></button>`).join('');
        wrap.innerHTML = `${def.label}: <span class="color-swatches" style="display:flex;gap:4px;align-items:center;">${swatches}</span><input type="hidden" class="detail-input" data-key="${def.key}" value="${val}">`;
      } else if (def.type === 'text') {
        wrap.innerHTML = `${def.label}: <input type="text" class="detail-input" data-key="${def.key}" value="${esc(String(val))}" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.25rem 0.5rem;border-radius:5px;font-size:0.8rem;min-width:120px;">`;
      }
      fc.appendChild(wrap);
    });
    detailPanel.querySelectorAll('.color-swatches').forEach(group => {
      group.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.color-swatch').forEach(b => b.style.borderColor = 'transparent');
          btn.style.borderColor = '#fff';
          const hi = group.parentElement.querySelector('.detail-input[data-key="color"]');
          if (hi) hi.value = btn.dataset.color;
          renderStep2Preview();
        });
      });
    });
    detailPanel.querySelectorAll('.detail-input').forEach(inp => {
      inp.addEventListener('change', renderStep2Preview);
      inp.addEventListener('input', renderStep2Preview);
    });
  };
  buildDetail(type, options);

  const wrapper = document.createElement('div');
  wrapper.className = 'field-row-wrapper';
  wrapper.style.cssText = 'margin-bottom:0.75rem;';
  wrapper.appendChild(row);
  wrapper.appendChild(detailPanel);

  row.querySelector('.field-type').addEventListener('change', (e) => {
    buildDetail(e.target.value, {});
    renderStep2Preview();
  });
  row.querySelector('.detail-toggle-btn').addEventListener('click', () => {
    const open = detailPanel.style.display !== 'none';
    detailPanel.style.display = open ? 'none' : 'block';
    row.querySelector('.detail-toggle-btn').style.background = open ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.3)';
  });
  row.querySelector('.btn-remove').addEventListener('click', () => { wrapper.remove(); renderStep2Preview(); });
  row.querySelector('.field-required').addEventListener('change', renderStep2Preview);

  // D&D
  row.addEventListener('dragstart', (e) => {
    _s2DragSrcWrapper = wrapper;
    e.dataTransfer.effectAllowed = 'move';
    const rect = wrapper.getBoundingClientRect();
    const ghost = wrapper.cloneNode(true);
    ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${rect.width}px;pointer-events:none;`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
    requestAnimationFrame(() => ghost.remove());
    requestAnimationFrame(() => wrapper.classList.add('dragging'));
  });
  row.addEventListener('dragend', () => {
    if (_s2DragSrcWrapper) _s2DragSrcWrapper.classList.remove('dragging');
    container.querySelectorAll('.field-row-wrapper').forEach(w => w.classList.remove('drop-above','drop-below'));
    _s2DragSrcWrapper = null;
    renderStep2Preview();
  });
  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!_s2DragSrcWrapper || _s2DragSrcWrapper === wrapper) return;
    container.querySelectorAll('.field-row-wrapper').forEach(w => w.classList.remove('drop-above','drop-below'));
    const rect = wrapper.getBoundingClientRect();
    const goBelow = e.clientY > rect.top + rect.height / 2;
    wrapper.classList.add(goBelow ? 'drop-below' : 'drop-above');
    container.insertBefore(_s2DragSrcWrapper, goBelow ? wrapper.nextSibling : wrapper);
  });
  wrapper.addEventListener('dragleave', (e) => {
    if (!wrapper.contains(e.relatedTarget)) wrapper.classList.remove('drop-above','drop-below');
  });

  container.appendChild(wrapper);
  renderStep2Preview();
}

function s2CollectFieldData(wrapper) {
  const row = wrapper.querySelector('.field-row');
  const type = row.querySelector('.field-type').value;
  const required = row.querySelector('.field-required').checked;
  const typeInfo = FIELD_TYPES.find(t => t.val === type);
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

function renderStep2() {
  const qCont = document.getElementById('s2-q-container');
  const aCont = document.getElementById('s2-a-container');
  qCont.innerHTML = '';
  aCont.innerHTML = '';

  const genre = activeGenre;
  genre.fields.forEach(f => {
    const cont = f.role === 'answer' ? aCont : qCont;
    s2AddFieldRow(cont, f.type, f.required, f.options || {});
  });

  document.getElementById('s2-add-q-btn').onclick = () => s2AddFieldRow(qCont);
  document.getElementById('s2-add-a-btn').onclick = () => s2AddFieldRow(aCont);

  document.getElementById('back-to-step1').onclick = () => goStep(1);

  document.getElementById('step2-next-btn').onclick = async () => {
    // フィールドを収集してactiveGenreに反映
    const fields = [];
    let qi = 0, ai = 0;
    document.getElementById('s2-q-container').querySelectorAll('.field-row-wrapper').forEach(w => {
      const d = s2CollectFieldData(w);
      fields.push({ key: `q_${qi++}`, ...d, role: 'question' });
    });
    document.getElementById('s2-a-container').querySelectorAll('.field-row-wrapper').forEach(w => {
      const d = s2CollectFieldData(w);
      fields.push({ key: `a_${ai++}`, ...d, role: 'answer' });
    });
    if (fields.filter(f => f.role === 'question').length === 0) { alert('問題フィールドを1つ以上追加してください'); return; }
    if (fields.filter(f => f.role === 'answer').length === 0) { alert('答えフィールドを1つ以上追加してください'); return; }

    activeGenre = { ...activeGenre, fields };

    // 「ジャンルとして保存」チェックが入っていれば保存
    if (document.getElementById('save-as-genre-chk').checked) {
      const newGenre = {
        id: activeGenreId || ('custom_' + Date.now()),
        name: activeGenre.name || '新しい型',
        isDefault: false,
        fields
      };
      // 既存ジャンルの更新か新規追加
      const idx = genres.findIndex(g => g.id === newGenre.id);
      if (idx !== -1) genres[idx] = newGenre;
      else genres.push(newGenre);
      await StorageManager.saveGenres(genres);
      activeGenreId = newGenre.id;
    }

    goStep(3);
    renderForm();
  };

  // コンテナの変更をリアルタイムプレビューに反映
  qCont.addEventListener('change', renderStep2Preview);
  aCont.addEventListener('change', renderStep2Preview);
  renderStep2Preview();
}

function renderStep2Preview() {
  const panel = document.getElementById('step2-preview-panel');
  if (!panel) return;

  const collectData = (contId) => {
    const data = [];
    document.getElementById(contId).querySelectorAll('.field-row-wrapper').forEach(w => {
      const d = s2CollectFieldData(w);
      data.push(d);
    });
    return data;
  };

  const qData = collectData('s2-q-container');
  const aData = collectData('s2-a-container');

  const dummyBox = (f) => {
    const opts = f.options || {};
    const align = opts.align || 'left';
    const jcMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
    const jc = jcMap[align] || 'flex-start';
    const ai = ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' })[opts.valign || 'middle'] || 'center';
    const fontSize = ({ sm: '0.72rem', md: '0.85rem', lg: '1.05rem' })[opts.fontSize || 'md'];
    const color = opts.color || '';
    const bold = opts.bold;
    const labelStyle = `opacity:0.7;font-size:${fontSize};${bold?'font-weight:700;':''}${color?`color:${color};`:'color:var(--text-secondary);'}`;
    const label = `<span style="${labelStyle}">${esc(f.label)}</span>`;

    if (['textarea','freetext','fillblank','explanation'].includes(f.type)) {
      return `<div style="min-height:52px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;display:flex;align-items:${jc==='flex-end'?'flex-end':(jc==='center'?'center':'flex-start')};justify-content:${ai};padding:0.4rem 0.75rem;">${label}${f.type==='fillblank'?'<span style="opacity:0.45;font-size:0.7rem;margin-left:0.4rem;">{{空欄}}形式</span>':''}</div>`;
    }
    if (f.type === 'image') {
      return `<div style="height:52px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;display:flex;align-items:center;justify-content:${jc};padding:0 0.75rem;gap:0.5rem;"><span>🖼️</span>${label}</div>`;
    }
    if (f.type === 'choice_single' || f.type === 'choice_multi') {
      const count = Math.min(Number(opts.defaultCount) || 3, 3);
      const rows = Array.from({length:count},(_,i) => `<div style="height:20px;background:rgba(0,0,0,0.18);border:1px dashed rgba(255,255,255,0.1);border-radius:3px;padding:0 6px;font-size:0.7rem;color:var(--text-secondary);display:flex;align-items:center;">${i===0?'✅':'○'} ${i===0?'正解':`選択肢${i+1}`}</div>`).join('');
      return `<div style="display:flex;flex-direction:column;gap:2px;">${rows}</div>`;
    }
    if (f.type === 'difficulty') {
      const max = Number(opts.maxStars || 5), def = Number(opts.defaultVal || 3);
      return `<div style="background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:5px;padding:0.3rem 0.75rem;font-size:${fontSize};">${'⭐'.repeat(def)}${'☆'.repeat(max-def)} <span style="opacity:0.5;font-size:0.68rem;">${def}/${max}</span></div>`;
    }
    if (f.type === 'tags') return `<div style="background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.1);border-radius:5px;padding:0.3rem 0.75rem;"><span style="background:rgba(20,184,166,0.2);border:1px solid rgba(20,184,166,0.35);color:${color||'#14b8a6'};padding:0.1rem 0.45rem;border-radius:10px;font-size:${fontSize};">タグ例</span></div>`;
    if (f.type === 'hint') return `<div style="background:rgba(251,191,36,0.07);border:1px dashed rgba(251,191,36,0.3);border-radius:5px;padding:0.3rem 0.75rem;font-size:${fontSize};color:${color||'#fbbf24'};">💡 ${esc(f.label)}</div>`;
    if (f.type === 'wrongexample') return `<div style="background:rgba(239,68,68,0.07);border-left:2px solid rgba(239,68,68,0.4);border-radius:3px;padding:0.3rem 0.75rem;font-size:${fontSize};color:var(--text-secondary);">❌ 誤答例</div>`;
    if (f.type === 'feedback') return `<div style="background:rgba(34,197,94,0.07);border:1px dashed rgba(34,197,94,0.3);border-radius:5px;padding:0.3rem 0.75rem;font-size:${fontSize};color:${color||'#22c55e'};">💬 ${esc(f.label)}</div>`;
    if (f.type === 'timer') return `<div style="background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;padding:0.3rem 0.75rem;font-size:${fontSize};color:${color||'#f87171'};">⏱ ${opts.defaultSec||30}秒</div>`;
    if (f.type === 'static') {
      const hasBorder = opts.border !== false;
      return `<div style="min-height:28px;display:flex;align-items:${ai};justify-content:${jc};${hasBorder?'background:rgba(99,102,241,0.08);border:1px solid rgba(167,139,250,0.35);border-radius:6px;':''}padding:0.3rem 0.75rem;"><span style="font-size:${fontSize};${bold?'font-weight:700;':''}color:${color||'#a78bfa'};">🔖 固定テキスト</span></div>`;
    }
    return `<div style="min-height:30px;background:rgba(0,0,0,0.2);border:1px dashed rgba(255,255,255,0.12);border-radius:5px;display:flex;align-items:${ai};justify-content:${jc};padding:0 0.75rem;">${label}</div>`;
  };

  const renderSection = (title, data) => {
    if (!data.length) return '';
    return `<div style="margin-bottom:0.75rem;">
      <div style="font-size:0.72rem;color:#a78bfa;font-weight:600;margin-bottom:0.4rem;border-bottom:1px solid rgba(167,139,250,0.2);padding-bottom:0.25rem;">${title}</div>
      ${data.map(f => `<div style="margin-bottom:0.35rem;">${dummyBox(f)}</div>`).join('')}
    </div>`;
  };

  panel.innerHTML = `
    <div style="background:rgba(15,23,42,0.6);padding:1.25rem;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
      ${renderSection('FRONT（問題）', qData)}
      ${renderSection('BACK（答え）', aData)}
    </div>
  `;
}

// ===== 編集モード（STEP3直行） =====
async function enterEditMode(cardId) {
  let card;
  try {
    const res = await fetch(
      `https://qahkvamgssedhjvtlika.supabase.co/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}&select=*`,
      { headers: {
        'apikey': 'sb_publishable_g3U08ZrJjKyXaeaEuPeuaQ_SNoUxyVg',
        'Authorization': 'Bearer sb_publishable_g3U08ZrJjKyXaeaEuPeuaQ_SNoUxyVg'
      }}
    );
    const rows = await res.json();
    if (!rows.length) throw new Error('カードが見つかりません');
    const c = rows[0];
    card = { id: c.id, question: c.question, answer: c.answer, image: c.image, genre: c.genre };
  } catch (e) {
    alert('カードの読み込みに失敗しました: ' + e.message);
    window.location.href = 'cardlist.html';
    return;
  }
  editingCardOriginal = card;

  // 対応するジャンルを activeGenre に設定
  const genreExists = genres.find(g => g.id === card.genre);
  activeGenre = genreExists ? { ...genreExists, fields: JSON.parse(JSON.stringify(genreExists.fields)) }
                            : { ...genres[0], fields: JSON.parse(JSON.stringify(genres[0]?.fields || [])) };
  activeGenreId = activeGenre?.id || null;

  // ステップインジケーター非表示（編集モードはSTEP3直行）
  const stepInd = document.getElementById('step-indicator');
  if (stepInd) stepInd.style.display = 'none';

  // UIを編集モードに切り替え
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.textContent = '✏️ カードを編集';
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.textContent = '更新する';
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  goStep(3);
  renderGenreTags();
  renderForm();
  fillFormWithCard(card);
  setupGlobalListeners();
}

let currentPreviewGenre = null;
let currentPreviewValues = {};

// 編集モード用: フォームに既存カードデータを流し込む
function fillFormWithCard(card) {
  const genre = activeGenre;
  if (!genre) return;
  const parseSection = (text) => {
    const result = {};
    if (!text) return result;
    const parts = text.split(/\n\n(?=\[)/);
    parts.forEach(part => {
      const match = part.match(/^\[(.+?)\]\n([\s\S]*)/);
      if (match) result[match[1]] = match[2].trim();
    });
    return result;
  };
  const qParsed = parseSection(card.question);
  const aParsed = parseSection(card.answer);
  genre.fields.forEach(field => {
    const parsed = field.role === 'question' ? qParsed : aParsed;
    const val = parsed[field.label];
    if (field.type === 'image') {
      try {
        const imgs = card.image ? JSON.parse(card.image) : [];
        const fieldImgs = imgs.filter(img => img.fieldKey === field.key || img.role === field.role);
        fieldImgs.forEach(img => {
          if (!pendingImages[field.key]) pendingImages[field.key] = [];
          pendingImages[field.key].push({ existingUrl: img.url, previewUrl: img.url });
        });
        renderPreviews(field.key);
      } catch {}
      return;
    }
    if (!val) return;
    if (field.type === 'choice_single' || field.type === 'choice_multi') {
      const container = document.getElementById(`field-container-${field.key}`);
      if (container && container._setChoiceData) {
        try { container._setChoiceData(JSON.parse(val)); } catch {}
      }
      return;
    }
    if (field.type === 'wrongexample') {
      const container = document.getElementById(`field-container-${field.key}`);
      if (container && container._setWrongExampleData) {
        try {
          let items;
          try { items = JSON.parse(val); } catch { items = val.split('\n').filter(v => v); }
          container._setWrongExampleData(items);
        } catch {}
      }
      return;
    }
    const input = document.getElementById(`field-${field.key}`);
    if (input) {
      if (typeof input._setDifficultyValue === 'function') {
        input._setDifficultyValue(val);
      } else {
        input.value = val;
      }
      currentPreviewValues[field.key] = val;
    }
  });
  updateCardPreview(genre, currentPreviewValues);
}

// ===== 選択肢フィールドUI構築（renderForm / addNewFormField 共通） =====
function buildChoiceFieldUI(field, genre) {
  const isMulti = field.type === 'choice_multi';
  const div = document.createElement('div');
  div.className = 'form-group';
  div.id = `field-container-${field.key}`;

  const label = document.createElement('label');
  label.innerHTML = `${isMulti ? '☑️' : '🔘'} ${field.label}${field.required ? '<span class="required-badge">必須</span>' : ''}`;

  const choiceList = document.createElement('div');
  choiceList.className = 'choice-list';
  choiceList.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;';

  const updateChoicePreview = () => {
    const opts = Array.from(choiceList.querySelectorAll('.choice-option-input')).map(i => i.value.trim());
    const correct = Array.from(choiceList.querySelectorAll('.choice-correct-btn'))
      .map((btn, i) => btn.dataset.correct === '1' ? i : -1)
      .filter(i => i !== -1);
    currentPreviewValues[field.key] = JSON.stringify({ options: opts, correct });
    updateCardPreview(genre, currentPreviewValues);
  };

  const applyMarkStyle = (btn, isCorrect) => {
    btn.style.cssText = `width:32px;height:32px;border-radius:50%;font-weight:700;font-size:1rem;cursor:pointer;flex-shrink:0;border:2px solid ${isCorrect ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.4)'};background:${isCorrect ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)'};color:${isCorrect ? '#4ade80' : '#f87171'};transition:all 0.2s;display:flex;align-items:center;justify-content:center;`;
  };

  const addOption = (text = '', isCorrect = false) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'choice-correct-btn';
    markBtn.dataset.correct = isCorrect ? '1' : '0';
    markBtn.textContent = isCorrect ? '○' : '×';
    markBtn.title = isMulti ? '○=正解 / ×=不正解（複数可）' : '○=正解 / ×=不正解（1つのみ）';
    applyMarkStyle(markBtn, isCorrect);

    markBtn.addEventListener('click', () => {
      const wasCorrect = markBtn.dataset.correct === '1';
      if (!wasCorrect && !isMulti) {
        // choice_single: 他の○をすべて×にリセット
        choiceList.querySelectorAll('.choice-correct-btn').forEach(btn => {
          btn.dataset.correct = '0';
          btn.textContent = '×';
          applyMarkStyle(btn, false);
        });
      }
      const newState = !wasCorrect;
      markBtn.dataset.correct = newState ? '1' : '0';
      markBtn.textContent = newState ? '○' : '×';
      applyMarkStyle(markBtn, newState);
      updateChoicePreview();
    });

    const optionInput = document.createElement('input');
    optionInput.type = 'text';
    optionInput.className = 'choice-option-input';
    optionInput.value = text;
    optionInput.placeholder = '選択肢を入力…';
    optionInput.style.cssText = 'flex:1;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:6px;padding:0.5rem 0.75rem;color:var(--text-primary);font-family:inherit;font-size:0.9rem;';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.style.cssText = 'background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:0.9rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
    removeBtn.addEventListener('click', () => { row.remove(); updateChoicePreview(); });

    optionInput.addEventListener('input', updateChoicePreview);
    row.appendChild(markBtn);
    row.appendChild(optionInput);
    row.appendChild(removeBtn);
    choiceList.appendChild(row);
    updateChoicePreview();
  };

  // 詳細設定の「選択肢数」変更に対応するコールバック
  field._updateChoiceCount = (newCount) => {
    newCount = Math.max(2, Math.min(6, Number(newCount) || 3));
    const rows = choiceList.querySelectorAll('.choice-option-input');
    const currentCount = rows.length;
    if (newCount > currentCount) {
      for (let i = currentCount; i < newCount; i++) addOption();
    } else if (newCount < currentCount) {
      // 末尾から空の選択肢を削除
      const allRows = choiceList.children;
      for (let i = allRows.length - 1; i >= newCount; i--) {
        const inp = allRows[i]?.querySelector('.choice-option-input');
        if (inp && !inp.value.trim()) allRows[i].remove();
      }
    }
    updateChoicePreview();
  };

  // 初期選択肢数は詳細設定の defaultCount に従う
  const initCount = Math.max(2, Math.min(6, Number(field.options?.defaultCount) || 3));
  addOption('', true);
  for (let i = 1; i < initCount; i++) addOption();

  div._setChoiceData = (data) => {
    choiceList.innerHTML = '';
    (data.options || []).forEach((opt, i) => addOption(opt, (data.correct || []).includes(i)));
  };

  const addChoiceBtn = document.createElement('button');
  addChoiceBtn.type = 'button';
  addChoiceBtn.textContent = '＋ 選択肢を追加';
  addChoiceBtn.style.cssText = 'background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a78bfa;padding:0.35rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.85rem;';
  addChoiceBtn.addEventListener('click', () => addOption());

  const choiceHint = document.createElement('div');
  choiceHint.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);margin-top:0.3rem;';
  choiceHint.textContent = isMulti ? '○=正解（複数可） / ×=不正解　でマーク' : '○=正解 / ×=不正解　でマーク（正解は1つ）';

  div.appendChild(label);
  div.appendChild(choiceList);
  div.appendChild(addChoiceBtn);
  div.appendChild(choiceHint);
  return div;
}

function renderForm() {
  el.formFields.innerHTML = '';
  pendingImages = {};
  currentPreviewValues = {};

  const genre = activeGenre;
  if (!genre) return;
  currentPreviewGenre = genre;

  // role ごとのブロックコンテナを作成
  const qBlock = createRoleBlock('問題（おもて）', '#6366f1');
  const aBlock = createRoleBlock('答え（うら）', '#8b5cf6');
  const qInner = qBlock.querySelector('.role-block-inner');
  const aInner = aBlock.querySelector('.role-block-inner');

  genre.fields.forEach(field => {
    // role 未定義の場合: key名で判定（'answer'/'a_'始まり→answer、それ以外→question）
    if (!field.role) {
      field.role = (field.key === 'answer' || field.key.startsWith('a_')) ? 'answer' : 'question';
    }
    const targetInner = field.role === 'answer' ? aInner : qInner;

    // image タイプはペーストUIを使う
    if (field.type === 'image') {
      pendingImages[field.key] = [];
      targetInner.appendChild(wrapFieldWithToolbar(field, buildImagePasteUI(field)));
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
      targetInner.appendChild(wrapFieldWithToolbar(field, div));
      return;
    }

    // ===== 穴埋め (fillblank) =====
    if (field.type === 'fillblank') {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.innerHTML = `🔍 ${field.label}${field.required ? '<span class="required-badge">必須</span>' : ''}`;
      const guide = document.createElement('div');
      guide.style.cssText = 'font-size:0.8rem;color:#fbbf24;margin-bottom:0.5rem;background:rgba(251,191,36,0.08);padding:0.4rem 0.75rem;border-radius:6px;';
      guide.innerHTML = '空欄にしたい部分を <code style="background:rgba(0,0,0,0.3);padding:0.1rem 0.3rem;border-radius:3px;color:#fde68a;">{{正解}}</code> で囲む &nbsp; 例: <code style="background:rgba(0,0,0,0.3);padding:0.1rem 0.3rem;border-radius:3px;color:#fde68a;">日本の首都は{{東京}}です</code>';
      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.id = `field-${field.key}`;
      textarea.name = field.key;
      if (field.required) textarea.required = true;
      textarea.placeholder = '例: 日本の首都は{{東京}}です';
      textarea.style.cssText = 'width:100%;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:8px;padding:0.8rem 1rem;color:var(--text-primary);font-family:inherit;font-size:0.95rem;resize:vertical;transition:border-color 0.2s;border-left:3px solid #f59e0b;';
      textarea.addEventListener('input', () => {
        currentPreviewValues[field.key] = textarea.value;
        updateCardPreview(genre, currentPreviewValues);
      });
      div.appendChild(label);
      div.appendChild(guide);
      div.appendChild(textarea);
      targetInner.appendChild(wrapFieldWithToolbar(field, div));
      return;
    }

    // ===== 選択肢 (choice_single / choice_multi) =====
    if (field.type === 'choice_single' || field.type === 'choice_multi') {
      targetInner.appendChild(wrapFieldWithToolbar(field, buildChoiceFieldUI(field, genre)));
      return;
    }

    // ===== タグ (tags) =====
    if (field.type === 'tags') {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.innerHTML = `🏷️ ${field.label}`;
      const guide = document.createElement('div');
      guide.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.4rem;';
      guide.textContent = 'カンマ区切りで複数タグを入力（例: 英語, 文法, 基礎）';
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `field-${field.key}`;
      input.name = field.key;
      input.placeholder = '例: 英語, 文法, 基礎';
      input.style.cssText = 'width:100%;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:8px;padding:0.8rem 1rem;color:var(--text-primary);font-family:inherit;font-size:0.95rem;border-left:3px solid #14b8a6;transition:border-color 0.2s;';
      const tagDisplay = document.createElement('div');
      tagDisplay.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.4rem;min-height:20px;';
      const renderTagDisplay = () => {
        const tags = input.value.split(',').map(t => t.trim()).filter(t => t);
        tagDisplay.innerHTML = tags.map(t => `<span style="background:rgba(20,184,166,0.2);border:1px solid rgba(20,184,166,0.4);color:#14b8a6;padding:0.15rem 0.5rem;border-radius:12px;font-size:0.8rem;">${escapeHtml(t)}</span>`).join('');
        currentPreviewValues[field.key] = input.value;
        updateCardPreview(genre, currentPreviewValues);
      };
      input.addEventListener('input', renderTagDisplay);
      div.appendChild(label);
      div.appendChild(guide);
      div.appendChild(input);
      div.appendChild(tagDisplay);
      targetInner.appendChild(wrapFieldWithToolbar(field, div));
      return;
    }

    // ===== 難易度 (difficulty) =====
    if (field.type === 'difficulty') {
      const div = document.createElement('div');
      div.className = 'form-group';
      const label = document.createElement('label');
      label.innerHTML = `⭐ ${field.label}`;
      const starContainer = document.createElement('div');
      starContainer.style.cssText = 'display:flex;gap:0.3rem;margin-top:0.3rem;align-items:center;';
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = `field-${field.key}`;
      hiddenInput.name = field.key;
      hiddenInput.value = '3';
      let currentStars = 3;
      const starBtns = [];
      const valLabel = document.createElement('span');
      valLabel.style.cssText = 'font-size:0.85rem;color:var(--text-secondary);margin-left:0.5rem;';
      valLabel.textContent = '3 / 5';
      const renderStars = (hov = null) => {
        const count = hov !== null ? hov : currentStars;
        starBtns.forEach((btn, i) => {
          btn.textContent = i < count ? '⭐' : '☆';
          btn.style.opacity = i < count ? '1' : '0.35';
        });
        if (hov === null) valLabel.textContent = `${currentStars} / 5`;
      };
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'star-btn';
        star.textContent = i <= 3 ? '⭐' : '☆';
        star.dataset.value = i;
        star.style.cssText = `background:none;border:none;cursor:pointer;font-size:1.5rem;padding:0.1rem;transition:opacity 0.1s;opacity:${i<=3?'1':'0.35'};`;
        star.addEventListener('mouseenter', () => renderStars(i));
        star.addEventListener('mouseleave', () => renderStars());
        star.addEventListener('click', () => {
          currentStars = i;
          hiddenInput.value = i;
          renderStars();
          currentPreviewValues[field.key] = String(i);
          updateCardPreview(genre, currentPreviewValues);
        });
        starBtns.push(star);
        starContainer.appendChild(star);
      }
      starContainer.appendChild(valLabel);
      hiddenInput._setDifficultyValue = (val) => {
        currentStars = parseInt(val) || 3;
        hiddenInput.value = currentStars;
        renderStars();
        currentPreviewValues[field.key] = String(currentStars);
        updateCardPreview(genre, currentPreviewValues);
      };
      currentPreviewValues[field.key] = '3';
      div.appendChild(label);
      div.appendChild(starContainer);
      div.appendChild(hiddenInput);
      targetInner.appendChild(wrapFieldWithToolbar(field, div));
      return;
    }

    // ===== 誤答例 (wrongexample) =====
    if (field.type === 'wrongexample') {
      const div = document.createElement('div');
      div.className = 'form-group';
      div.id = `field-container-${field.key}`;
      const label = document.createElement('label');
      label.innerHTML = `❌ ${field.label}`;
      const weList = document.createElement('div');
      weList.className = 'wrongexample-list';
      weList.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;';
      const updateWEPreview = () => {
        const vals = Array.from(weList.querySelectorAll('.we-input')).map(i => i.value.trim()).filter(v => v);
        currentPreviewValues[field.key] = JSON.stringify(vals);
        updateCardPreview(genre, currentPreviewValues);
      };
      const addWERow = (val = '') => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'we-input';
        input.value = val;
        input.placeholder = '誤答例を入力…';
        input.style.cssText = 'flex:1;background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:6px;padding:0.5rem 0.75rem;color:var(--text-primary);font-family:inherit;font-size:0.9rem;border-left:3px solid #ef4444;';
        input.addEventListener('input', updateWEPreview);
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.style.cssText = 'background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:0.9rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
        removeBtn.addEventListener('click', () => { row.remove(); updateWEPreview(); });
        row.appendChild(input);
        row.appendChild(removeBtn);
        weList.appendChild(row);
      };
      div._setWrongExampleData = (items) => {
        weList.innerHTML = '';
        items.forEach(item => addWERow(item));
        updateWEPreview();
      };
      addWERow();
      const addWEBtn = document.createElement('button');
      addWEBtn.type = 'button';
      addWEBtn.textContent = '＋ 誤答例を追加';
      addWEBtn.style.cssText = 'background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:0.35rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.85rem;';
      addWEBtn.addEventListener('click', () => addWERow());
      div.appendChild(label);
      div.appendChild(weList);
      div.appendChild(addWEBtn);
      targetInner.appendChild(wrapFieldWithToolbar(field, div));
      return;
    }

    // ===== 通常フィールド (text, textarea, hint, explanation, freetext, feedback, timer, url, number, date) =====
    const div = document.createElement('div');
    div.className = 'form-group';
    const typeIcons = { hint: '💡', explanation: '📖', freetext: '✏️', feedback: '💬', timer: '⏱️', url: '🔗' };
    const fieldIcon = typeIcons[field.type] || '';
    const label = document.createElement('label');
    label.htmlFor = `field-${field.key}`;
    label.innerHTML = (fieldIcon ? fieldIcon + ' ' : '') + field.label + (field.required ? '<span class="required-badge">必須</span>' : '');

    let input;
    if (['textarea', 'freetext', 'explanation'].includes(field.type)) {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = ['number', 'date', 'url'].includes(field.type) ? field.type : (field.type === 'timer' ? 'number' : 'text');
      if (field.type === 'timer') { input.min = '0'; input.step = '1'; }
    }
    input.id = `field-${field.key}`;
    input.name = field.key;
    if (field.required) input.required = true;
    input.placeholder = `${field.label}を入力…`;
    if (field.type === 'hint') input.style.borderLeft = '3px solid #fbbf24';
    else if (field.type === 'explanation') input.style.borderLeft = '3px solid #6366f1';
    else if (field.type === 'feedback') input.style.borderLeft = '3px solid #22c55e';
    else if (field.type === 'url') input.style.borderLeft = '3px solid #3b82f6';

    // 入力イベントでプレビュー更新
    input.addEventListener('input', () => {
      currentPreviewValues[field.key] = input.value;
      updateCardPreview(genre, currentPreviewValues);
    });

    div.appendChild(label);
    div.appendChild(input);
    targetInner.appendChild(wrapFieldWithToolbar(field, div));
  });

  // 「＋ フィールドを追加」ボタンを各ロールブロックに追加
  qInner.appendChild(createAddFieldBtn(qInner, 'question'));
  aInner.appendChild(createAddFieldBtn(aInner, 'answer'));

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

// ===== プレビューパネル：実際のカード表示と同じ見た目で描画 =====
let _previewAnswerShown = false; // 答えエリアの表示状態を保持
function updateCardPreview(genre, values) {
  const panel = document.getElementById('card-preview-panel');
  if (!panel) return;

  // 1フィールドを renderCard.js の共通ロジックでHTMLに変換（newtab.js と完全同一）
  function renderFieldHtml(f, isQuestion) {
    const imageList = (pendingImages[f.key] || []).map(img => ({ url: img.previewUrl || img.existingUrl || '' }));
    const html = _renderFieldHtml(f, isQuestion, (field) => values[field.key] || '', imageList);
    if (html) return html;
    // 空フィールドでもプレビューに表示（プレースホルダー）
    const typeInfo = FIELD_TYPES.find(t => t.val === f.type);
    const icon = typeInfo ? typeInfo.label.split(' ')[0] : '📝';
    return `<div style="padding:0.4rem 0.75rem;margin:0.2rem 0 0.5rem;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:6px;color:#475569;font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;">
      <span>${icon}</span><span>${escapeHtml(f.label)}（未入力）</span>
    </div>`;
  }

  // 問題・答えそれぞれのフィールドをHTML化
  const qFields = genre.fields.filter(f => f.role === 'question');
  const aFields = genre.fields.filter(f => f.role === 'answer');

  const qHtml = qFields.map(f => renderFieldHtml(f, true)).join('') ||
    '<p style="color:#475569;font-size:0.9rem;">（問題フィールドなし）</p>';
  const aHtml = aFields.map(f => renderFieldHtml(f, false)).join('') ||
    '<p style="color:#475569;font-size:0.9rem;">（答えフィールドなし）</p>';

  // カード本体HTML（newtab.htmlの.glass-cardに近いスタイル）
  panel.innerHTML = `
    <div style="background:rgba(20,27,50,0.75);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:1.75rem 2rem;box-shadow:0 20px 40px -10px rgba(0,0,0,0.5);">

      <!-- ジャンルバッジ -->
      <div style="display:inline-block;font-size:0.68rem;font-weight:600;color:#a78bfa;background:rgba(99,102,241,0.15);padding:0.12rem 0.55rem;border-radius:4px;margin-bottom:1rem;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(genre.name || 'プレビュー')}</div>

      <!-- 問題エリア -->
      <div id="preview-q-area">${qHtml}</div>

      <!-- 答えを見るボタン -->
      <button id="preview-show-answer-btn" type="button" style="width:100%;padding:0.8rem;background:${_previewAnswerShown ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#6366f1,#4f46e5)'};color:${_previewAnswerShown ? '#94a3b8' : 'white'};border:none;border-radius:12px;font-size:0.95rem;font-weight:600;cursor:pointer;margin-top:0.5rem;box-shadow:${_previewAnswerShown ? 'none' : '0 4px 15px rgba(99,102,241,0.35)'};font-family:inherit;transition:all 0.2s;">${_previewAnswerShown ? '答えを隠す' : '答えを見る'}</button>

      <!-- 答えエリア -->
      <div id="preview-a-area" style="display:${_previewAnswerShown ? 'block' : 'none'};">
        <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent);margin:1.25rem 0;"></div>
        ${aHtml}

        <!-- 評価ボタン（ダミー） -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem;margin-top:0.5rem;opacity:0.5;pointer-events:none;">
          <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:0.65rem 0.25rem;display:flex;flex-direction:column;align-items:center;gap:0.2rem;">
            <span style="font-size:1rem;">😰</span><span style="font-size:0.8rem;font-weight:700;color:#ef4444;">忘れた</span><span style="font-size:0.65rem;color:#94a3b8;">12時間</span>
          </div>
          <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:0.65rem 0.25rem;display:flex;flex-direction:column;align-items:center;gap:0.2rem;">
            <span style="font-size:1rem;">😓</span><span style="font-size:0.8rem;font-weight:700;color:#f59e0b;">難しい</span><span style="font-size:0.65rem;color:#94a3b8;">1日</span>
          </div>
          <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:0.65rem 0.25rem;display:flex;flex-direction:column;align-items:center;gap:0.2rem;">
            <span style="font-size:1rem;">😊</span><span style="font-size:0.8rem;font-weight:700;color:#10b981;">普通</span><span style="font-size:0.65rem;color:#94a3b8;">3日</span>
          </div>
          <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.25);border-radius:12px;padding:0.65rem 0.25rem;display:flex;flex-direction:column;align-items:center;gap:0.2rem;">
            <span style="font-size:1rem;">🎯</span><span style="font-size:0.8rem;font-weight:700;color:#3b82f6;">簡単</span><span style="font-size:0.65rem;color:#94a3b8;">7日+</span>
          </div>
        </div>
      </div>
    </div>`;

  // 「答えを見る」ボタンのトグル（状態を保持）
  const showBtn = document.getElementById('preview-show-answer-btn');
  const aArea   = document.getElementById('preview-a-area');
  if (showBtn && aArea) {
    showBtn.addEventListener('click', () => {
      _previewAnswerShown = !_previewAnswerShown;
      aArea.style.display = _previewAnswerShown ? 'block' : 'none';
      showBtn.textContent = _previewAnswerShown ? '答えを隠す' : '答えを見る';
      showBtn.style.background = _previewAnswerShown
        ? 'rgba(255,255,255,0.05)'
        : 'linear-gradient(135deg,#6366f1,#4f46e5)';
      showBtn.style.color = _previewAnswerShown ? '#94a3b8' : 'white';
      showBtn.style.boxShadow = _previewAnswerShown ? 'none' : '0 4px 15px rgba(99,102,241,0.35)';
    });
  }
}

// HTMLエスケープ関数
// escapeHtml は renderCard.js からインポート済み

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

function setupGlobalListeners() {
  // 💾 型を保存ボタン
  const saveGenreBtn = document.getElementById('save-genre-btn');
  if (saveGenreBtn) saveGenreBtn.addEventListener('click', saveCurrentAsGenre);

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
      const genre = activeGenre;
      if (!genre) return;

      const values = {};
      genre.fields.forEach(field => {
        if (field.type === 'choice_single' || field.type === 'choice_multi') {
          const container = document.getElementById(`field-container-${field.key}`);
          if (container) {
            const opts = Array.from(container.querySelectorAll('.choice-option-input')).map(i => i.value.trim());
            const correct = Array.from(container.querySelectorAll('.choice-correct-btn'))
              .map((btn, i) => btn.dataset.correct === '1' ? i : -1)
              .filter(i => i !== -1);
            if (opts.some(o => o)) values[field.key] = JSON.stringify({ options: opts, correct });
          }
        } else if (field.type === 'wrongexample') {
          const container = document.getElementById(`field-container-${field.key}`);
          if (container) {
            const items = Array.from(container.querySelectorAll('.we-input')).map(i => i.value.trim()).filter(v => v);
            values[field.key] = JSON.stringify(items);
          }
        } else {
          const input = document.getElementById(`field-${field.key}`);
          if (input) values[field.key] = input.value.trim();
        }
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

      // 画像: 既存URL はそのまま使い、新規ファイルのみアップロード
      let imageValue = null;
      const uploadTasks = [];
      const imageFieldKeys = Object.keys(pendingImages);

      for (const key of imageFieldKeys) {
        const field = genre.fields.find(f => f.key === key);
        const role = field?.role || 'question';

        pendingImages[key].forEach(img => {
          if (img.existingUrl) {
            // 既存画像はアップロード不要、URLをそのまま使用
            uploadTasks.push(Promise.resolve({ url: img.existingUrl, role, fieldKey: key }));
          } else {
            uploadTasks.push((async () => {
              const url = await uploadImageToSupabase(img.file);
              return { url, role, fieldKey: key };
            })());
          }
        });
      }

      if (uploadTasks.length > 0) {
        const results = await Promise.all(uploadTasks);
        imageValue = JSON.stringify(results);
      }

      if (editingCardId) {
        // ===== 編集モード: 既存カードを更新 =====
        await StorageManager.updateCardContent(editingCardId, question, fullAnswer, imageValue);

        // field.options（詳細設定）の変更をジャンル定義に反映して保存
        if (activeGenreId && activeGenre) {
          const gIdx = genres.findIndex(g => g.id === activeGenreId);
          if (gIdx !== -1) {
            genres[gIdx] = { ...genres[gIdx], fields: activeGenre.fields };
            await StorageManager.saveGenres(genres);
          }
        }

        el.successMsg.classList.remove('hidden');
        setTimeout(() => {
          el.successMsg.classList.add('hidden');
          window.location.href = 'cardlist.html';
        }, 1500);
      } else {
        // ===== 新規モード: カードを追加 =====
        await StorageManager.addCard(question, fullAnswer, imageValue, activeGenreId || 'other');

        // フォームリセット
        el.addForm.querySelectorAll('input:not([type="file"]), textarea').forEach(i => i.value = '');
        Object.values(pendingImages).forEach(imgs =>
          imgs.forEach(img => img.previewUrl && !img.existingUrl && URL.revokeObjectURL(img.previewUrl))
        );
        pendingImages = {};
        renderForm();

        el.successMsg.classList.remove('hidden');
        setTimeout(() => el.successMsg.classList.add('hidden'), 3000);
      }

    } catch (err) {
      console.error(err);
      alert('エラーが発生しました: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingCardId ? '更新する' : '追加する';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

