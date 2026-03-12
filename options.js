import StorageManager, { uploadImageToSupabase } from './storage.js';

const MAX_IMAGES = 3;

let selectedGenreId = 'other';
let genres = [];
let pendingImages = {}; // { [fieldKey]: [{file, previewUrl}] } の形式
let editingCardId = null;  // 編集モード時のカードID（null=新規）
let editingCardOriginal = null; // 編集対象の元カードデータ

const el = {
  genreTabs: document.getElementById('genre-tabs'),
  formFields: document.getElementById('form-fields'),
  addForm: document.getElementById('add-card-form'),
  successMsg: document.getElementById('add-success-msg')
};

async function init() {
  genres = await StorageManager.getGenres();

  // URLパラメータ ?edit=<id> を検知して編集モードへ
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) {
    editingCardId = editId;
    await enterEditMode(editId);
  } else {
    selectedGenreId = genres[genres.length - 1]?.id || 'other';
    renderTabs();
    renderForm();
  }
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

// 編集モード: カードデータ取得 → ジャンル選択 → フォーム生成 → 既存値反映
async function enterEditMode(cardId) {
  // カードを1件取得
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

  // ジャンルを合わせる
  const genreExists = genres.find(g => g.id === card.genre);
  selectedGenreId = genreExists ? card.genre : (genres[0]?.id || 'other');

  // UIを編集モードに切り替え
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.textContent = '✏️ カードを編集';
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.textContent = '更新する';
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  // 編集モード中はジャンルタブを非表示（ジャンルは変更不可）
  el.genreTabs.style.display = 'none';

  renderTabs();
  renderForm();

  // フォームに既存データを流し込む
  fillFormWithCard(card);
}

let currentPreviewGenre = null;
let currentPreviewValues = {};

// 編集モード用: フォームに既存カードデータを流し込む
function fillFormWithCard(card) {
  const genre = genres.find(g => g.id === selectedGenreId);
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
      targetInner.appendChild(div);
      return;
    }

    // ===== 選択肢 (choice_single / choice_multi) =====
    if (field.type === 'choice_single' || field.type === 'choice_multi') {
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
        const corrects = Array.from(choiceList.querySelectorAll('.choice-correct-input')).map(i => i.checked);
        const correct = corrects.reduce((acc, v, i) => v ? [...acc, i] : acc, []);
        currentPreviewValues[field.key] = JSON.stringify({ options: opts, correct });
        updateCardPreview(genre, currentPreviewValues);
      };
      const addOption = (text = '', isCorrect = false) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';
        const correctInput = document.createElement('input');
        correctInput.type = isMulti ? 'checkbox' : 'radio';
        correctInput.name = `choice-correct-${field.key}`;
        correctInput.className = 'choice-correct-input';
        correctInput.checked = isCorrect;
        correctInput.title = isMulti ? '複数の正解をマーク' : '正解をマーク';
        correctInput.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:#6366f1;flex-shrink:0;';
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
        correctInput.addEventListener('change', updateChoicePreview);
        row.appendChild(correctInput);
        row.appendChild(optionInput);
        row.appendChild(removeBtn);
        choiceList.appendChild(row);
        updateChoicePreview();
      };
      addOption('', true);
      addOption();
      addOption();
      const addChoiceBtn = document.createElement('button');
      addChoiceBtn.type = 'button';
      addChoiceBtn.textContent = '＋ 選択肢を追加';
      addChoiceBtn.style.cssText = 'background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a78bfa;padding:0.35rem 0.8rem;border-radius:6px;cursor:pointer;font-size:0.85rem;';
      addChoiceBtn.addEventListener('click', () => addOption());
      const choiceHint = document.createElement('div');
      choiceHint.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);margin-top:0.3rem;';
      choiceHint.textContent = isMulti ? '☑️ で正解をすべてマーク（複数可）' : '🔘 で正解の1つをマーク';
      div._setChoiceData = (data) => {
        choiceList.innerHTML = '';
        (data.options || []).forEach((opt, i) => addOption(opt, (data.correct || []).includes(i)));
      };
      div.appendChild(label);
      div.appendChild(choiceList);
      div.appendChild(addChoiceBtn);
      div.appendChild(choiceHint);
      targetInner.appendChild(div);
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
      targetInner.appendChild(div);
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
      targetInner.appendChild(div);
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
      targetInner.appendChild(div);
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
      } else if (f.type === 'fillblank') {
        const val = values[f.key] || '';
        if (val) {
          const displayed = escapeHtml(val).replace(/\{\{(.+?)\}\}/g, '<span style="background:rgba(250,204,21,0.2);border-bottom:2px solid #fbbf24;padding:0 3px;color:#fbbf24;font-weight:600;">___</span>');
          html += `<div style="background:rgba(0,0,0,0.12);padding:0.9rem;border-radius:8px;margin-bottom:0.6rem;font-size:0.92rem;line-height:1.7;">${displayed}</div>`;
        } else {
          html += `<div style="background:rgba(0,0,0,0.12);padding:0.9rem;border-radius:8px;margin-bottom:0.6rem;min-height:36px;font-size:0.92rem;"><span style="color:#94a3b8;">（未入力）</span></div>`;
        }
      } else if (f.type === 'choice_single' || f.type === 'choice_multi') {
        const val = values[f.key];
        if (val) {
          try {
            const data = JSON.parse(val);
            html += `<div style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;">`;
            (data.options || []).forEach((opt, i) => {
              const isCorrect = (data.correct || []).includes(i);
              html += `<div style="padding:0.4rem 0.75rem;border-radius:6px;font-size:0.9rem;background:${isCorrect ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.12)'};border:1px solid ${isCorrect ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.05)'}">${isCorrect ? '✅' : (f.type === 'choice_multi' ? '☐' : '○')} ${escapeHtml(opt)}</div>`;
            });
            html += `</div>`;
          } catch {}
        }
      } else if (f.type === 'tags') {
        const val = values[f.key] || '';
        if (val) {
          const tags = val.split(',').map(t => t.trim()).filter(t => t);
          html += `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.6rem;">${tags.map(t => `<span style="background:rgba(20,184,166,0.2);border:1px solid rgba(20,184,166,0.4);color:#14b8a6;padding:0.15rem 0.5rem;border-radius:12px;font-size:0.8rem;">${escapeHtml(t)}</span>`).join('')}</div>`;
        }
      } else if (f.type === 'difficulty') {
        const v = parseInt(values[f.key] || '3');
        html += `<div style="font-size:1.2rem;margin-bottom:0.6rem;">${'⭐'.repeat(v)}${'☆'.repeat(5 - v)} <span style="font-size:0.85rem;color:var(--text-secondary);">${v}/5</span></div>`;
      } else if (f.type === 'hint') {
        const val = values[f.key] || '';
        if (val) html += `<div style="background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:0.6rem 0.75rem;border-radius:6px;margin-bottom:0.6rem;font-size:0.9rem;">💡 ${escapeHtml(val)}</div>`;
      } else if (f.type === 'explanation') {
        const val = values[f.key] || '';
        if (val) html += `<div style="background:rgba(99,102,241,0.08);border-left:3px solid #6366f1;padding:0.6rem 0.75rem;border-radius:6px;margin-bottom:0.6rem;font-size:0.9rem;line-height:1.6;">📖 ${escapeHtml(val).replace(/\n/g,'<br>')}</div>`;
      } else if (f.type === 'wrongexample') {
        const val = values[f.key];
        if (val) {
          try {
            const items = JSON.parse(val);
            if (items.length > 0) {
              html += `<div style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;">`;
              items.forEach(item => {
                html += `<div style="background:rgba(239,68,68,0.08);border-left:3px solid #ef4444;padding:0.4rem 0.75rem;border-radius:6px;font-size:0.9rem;">❌ ${escapeHtml(item)}</div>`;
              });
              html += `</div>`;
            }
          } catch {}
        }
      } else if (f.type === 'feedback') {
        const val = values[f.key] || '';
        if (val) html += `<div style="background:rgba(34,197,94,0.08);border-left:3px solid #22c55e;padding:0.6rem 0.75rem;border-radius:6px;margin-bottom:0.6rem;font-size:0.9rem;">💬 ${escapeHtml(val)}</div>`;
      } else {
        const val = values[f.key] || '';
        html += `<div style="background:rgba(0,0,0,0.12);padding:0.9rem;border-radius:8px;margin-bottom:0.6rem;min-height:36px;font-size:0.92rem;">${val ? escapeHtml(val).replace(/\n/g,'<br>') : '<span style="color:#94a3b8;">（未入力）</span>'}</div>`;
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
        if (field.type === 'choice_single' || field.type === 'choice_multi') {
          const container = document.getElementById(`field-container-${field.key}`);
          if (container) {
            const opts = Array.from(container.querySelectorAll('.choice-option-input')).map(i => i.value.trim()).filter(v => v);
            const corrects = Array.from(container.querySelectorAll('.choice-correct-input'));
            const correct = corrects.reduce((acc, inp, i) => inp.checked ? [...acc, i] : acc, []);
            values[field.key] = JSON.stringify({ options: opts, correct });
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
        el.successMsg.classList.remove('hidden');
        setTimeout(() => {
          el.successMsg.classList.add('hidden');
          window.location.href = 'cardlist.html';
        }, 1500);
      } else {
        // ===== 新規モード: カードを追加 =====
        await StorageManager.addCard(question, fullAnswer, imageValue, selectedGenreId);

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
