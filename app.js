const MAP_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const state = {
  mode: null,
  region: 'all',
  total: 10,
  answerStyle: 'choice', // 'choice' | 'text' (place-to-name only)
  pool: [],
  questions: [],
  current: 0,
  score: 0,
  selectedCountryId: null,
  selectedChoiceId: null,
  locked: false,
  pendingAdvance: false,
};

const els = {
  loading: document.getElementById('loading'),
  menu: document.getElementById('menu'),
  game: document.getElementById('game'),
  result: document.getElementById('result'),
  promptArea: document.getElementById('prompt-area'),
  mapContainer: document.getElementById('map-container'),
  choices: document.getElementById('choices'),
  feedback: document.getElementById('feedback'),
  progress: document.getElementById('progress'),
  scoreDisplay: document.getElementById('score-display'),
  finalScore: document.getElementById('final-score'),
  finalComment: document.getElementById('final-comment'),
  confirmBtn: document.getElementById('confirm-btn'),
  textAnswer: document.getElementById('text-answer'),
  answerInput: document.getElementById('answer-input'),
};

let svg, gMap, path, projection, zoomBehavior;
let allFeatures = [];

function normId(id) { return String(parseInt(id, 10)); }

async function init() {
  try {
    const world = await d3.json(MAP_URL);
    allFeatures = topojson.feature(world, world.objects.countries).features;
  } catch (e) {
    els.loading.innerHTML = '<p>地図の読み込みに失敗しました。ネットワーク接続を確認してリロードしてください。</p>';
    console.error(e);
    return;
  }

  setupMap();
  setupMenu();
  setupZoomControls();
  setupConfirm();
  setupAnswerInput();

  els.loading.hidden = true;
  els.menu.hidden = false;
}

function setupMap() {
  const width = 980, height = 500;
  // remove only the existing svg, keep zoom controls
  const existingSvg = els.mapContainer.querySelector('svg');
  if (existingSvg) existingSvg.remove();

  svg = d3.select(els.mapContainer).insert('svg', '.zoom-controls')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  projection = d3.geoNaturalEarth1().fitSize([width, height], { type: 'Sphere' });
  path = d3.geoPath(projection);

  gMap = svg.append('g');
  gMap.selectAll('path')
    .data(allFeatures)
    .join('path')
    .attr('class', 'country')
    .attr('d', path)
    .attr('data-id', d => normId(d.id));

  zoomBehavior = d3.zoom()
    .scaleExtent([1, 100])
    .translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]])
    .on('zoom', (event) => {
      gMap.attr('transform', event.transform);
    });
  svg.call(zoomBehavior);
  svg.on('dblclick.zoom', null); // disable double-click zoom (interferes with selection)
}

function setupZoomControls() {
  document.getElementById('zoom-in').addEventListener('click', () => {
    svg.transition().duration(200).call(zoomBehavior.scaleBy, 1.6);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    svg.transition().duration(200).call(zoomBehavior.scaleBy, 1 / 1.6);
  });
  document.getElementById('zoom-reset').addEventListener('click', () => {
    svg.transition().duration(250).call(zoomBehavior.transform, d3.zoomIdentity);
  });
}

function resetZoom(animate = false) {
  if (!svg || !zoomBehavior) return;
  const sel = animate ? svg.transition().duration(250) : svg;
  sel.call(zoomBehavior.transform, d3.zoomIdentity);
}

function setupMenu() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const region = document.querySelector('input[name="region"]:checked').value;
      const total = parseInt(document.querySelector('input[name="count"]:checked').value, 10);
      const styleEl = document.querySelector('input[name="answer-style"]:checked');
      const answerStyle = styleEl ? styleEl.value : 'choice';
      startMode(mode, region, total, answerStyle);
    });
  });

  document.getElementById('back-btn').addEventListener('click', backToMenu);
  document.getElementById('back-to-menu').addEventListener('click', backToMenu);
  document.getElementById('play-again').addEventListener('click', () => startMode(state.mode, state.region, state.total, state.answerStyle));
}

function setupConfirm() {
  els.confirmBtn.addEventListener('click', () => {
    if (state.pendingAdvance) {
      advanceQuestion();
      return;
    }
    if (state.mode === 'name-to-place') {
      if (!state.selectedCountryId) return;
      judgeNameToPlace();
    } else if (state.mode === 'place-to-name') {
      if (state.answerStyle === 'text') {
        if (!els.answerInput.value.trim()) return;
        judgePlaceToNameText();
      } else {
        if (!state.selectedChoiceId) return;
        judgePlaceToName();
      }
    }
  });
}

function setupAnswerInput() {
  els.answerInput.addEventListener('input', () => {
    if (state.locked || state.mode !== 'place-to-name' || state.answerStyle !== 'text') return;
    setConfirmState('確定', { disabled: !els.answerInput.value.trim() });
  });
  els.answerInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing) return; // IME変換中のEnterは無視
    if (els.confirmBtn.disabled) return;
    e.preventDefault();
    els.confirmBtn.click();
  });
}

function startMode(mode, region, total, answerStyle) {
  state.mode = mode;
  state.region = region;
  state.total = total || 10;
  state.answerStyle = answerStyle || 'choice';
  state.pool = buildPool(region);
  state.score = 0;
  state.current = 0;

  resetMapInteractions();
  resetCountryClasses();
  resetZoom(false);

  if (state.pool.length === 0) {
    alert('対象の国がありません。');
    return;
  }

  document.body.classList.add('game-mode');
  els.menu.hidden = true;
  els.result.hidden = true;
  els.game.hidden = false;
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';
  els.choices.innerHTML = '';
  els.textAnswer.hidden = true;

  if (mode === 'explore') {
    runExplore();
  } else {
    state.questions = pickQuestions(state.pool, state.total);
    nextQuestion();
  }
}

function buildPool(region) {
  const pool = [];
  for (const f of allFeatures) {
    const id = normId(f.id);
    const meta = COUNTRIES[id];
    if (!meta) continue;
    const [name, r, inPool = true] = meta;
    if (!inPool) continue;
    if (region === 'all' || r === region) {
      pool.push({ id, name, region: r, feature: f });
    }
  }
  return pool;
}

function pickQuestions(pool, n) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function resetMapInteractions() {
  gMap.selectAll('.country')
    .on('click', null)
    .on('mouseover', null)
    .on('mousemove', null)
    .on('mouseout', null);
}

function resetCountryClasses() {
  gMap.selectAll('.country').classed('target correct wrong selected locked', false);
}

function setConfirmState(label, opts = {}) {
  els.confirmBtn.textContent = label;
  els.confirmBtn.disabled = !!opts.disabled;
  els.confirmBtn.classList.toggle('next', !!opts.next);
  els.confirmBtn.style.display = opts.hidden ? 'none' : '';
}

function nextQuestion() {
  if (state.current >= state.questions.length) return showResult();

  state.locked = false;
  state.pendingAdvance = false;
  state.selectedCountryId = null;
  state.selectedChoiceId = null;

  const q = state.questions[state.current];
  els.progress.textContent = `${state.current + 1} / ${state.questions.length}`;
  els.scoreDisplay.textContent = `スコア: ${state.score}`;
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';
  els.choices.innerHTML = '';
  els.textAnswer.hidden = true;
  els.answerInput.value = '';
  els.answerInput.disabled = false;
  els.answerInput.classList.remove('correct', 'wrong');
  resetCountryClasses();
  resetZoom(true);

  if (state.mode === 'name-to-place') {
    runNameToPlace(q);
  } else if (state.mode === 'place-to-name') {
    if (state.answerStyle === 'text') runPlaceToNameText(q);
    else runPlaceToName(q);
  }
}

function runNameToPlace(q) {
  els.promptArea.innerHTML = `<span>地図でタップ →</span><span class="prompt-country">${q.name}</span>`;
  setConfirmState('確定', { disabled: true });

  gMap.selectAll('.country').on('click', function(event, d) {
    if (state.locked) return;
    const clickedId = normId(d.id);
    const meta = COUNTRIES[clickedId];
    if (!meta) {
      // unmapped clickable territory — ignore as selection
      return;
    }
    state.selectedCountryId = clickedId;
    gMap.selectAll('.country').classed('selected', false);
    d3.select(this).classed('selected', true);
    setConfirmState('確定', { disabled: false });
  });
}

function judgeNameToPlace() {
  const q = state.questions[state.current];
  state.locked = true;
  state.pendingAdvance = true;

  const correctSel = gMap.selectAll('.country').filter(d => normId(d.id) === q.id);
  const selected = state.selectedCountryId;

  if (selected === q.id) {
    state.score++;
    correctSel.classed('selected', false).classed('correct', true);
    showFeedback(`正解！ ${q.name}`, 'correct');
  } else {
    const selectedSel = gMap.selectAll('.country').filter(d => normId(d.id) === selected);
    const meta = COUNTRIES[selected];
    const selectedName = meta ? meta[0] : '不明';
    selectedSel.classed('selected', false).classed('wrong', true);
    correctSel.classed('correct', true);
    showFeedback(`不正解：${selectedName} / 正解は ${q.name}`, 'wrong');
  }
  els.scoreDisplay.textContent = `スコア: ${state.score}`;
  gMap.selectAll('.country').classed('locked', true);

  const isLast = state.current >= state.questions.length - 1;
  setConfirmState(isLast ? '結果を見る' : '次の問題へ', { next: true });
}

function runPlaceToName(q) {
  els.promptArea.innerHTML = `<span>赤色で示された国は？</span>`;
  gMap.selectAll('.country').filter(d => normId(d.id) === q.id).classed('target', true);
  // disable map clicks in this mode
  gMap.selectAll('.country').classed('locked', true);

  const distractors = pickDistractors(q, 3);
  const choices = [q, ...distractors].sort(() => Math.random() - 0.5);

  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.textContent = choice.name;
    btn.dataset.choiceId = choice.id;
    btn.addEventListener('click', () => {
      if (state.locked) return;
      state.selectedChoiceId = choice.id;
      els.choices.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      setConfirmState('確定', { disabled: false });
    });
    els.choices.appendChild(btn);
  }

  setConfirmState('確定', { disabled: true });
}

function runPlaceToNameText(q) {
  els.promptArea.innerHTML = '<span>赤色の国名を入力</span>';
  gMap.selectAll('.country').filter(d => normId(d.id) === q.id).classed('target', true);
  gMap.selectAll('.country').classed('locked', true);

  els.choices.innerHTML = '';
  els.textAnswer.hidden = false;
  els.answerInput.value = '';
  els.answerInput.disabled = false;
  els.answerInput.classList.remove('correct', 'wrong');
  setConfirmState('確定', { disabled: true });

  // モバイルでも自動フォーカス（タッチ確実性のため遅延）
  setTimeout(() => { try { els.answerInput.focus(); } catch (e) {} }, 80);
}

function judgePlaceToNameText() {
  const q = state.questions[state.current];
  state.locked = true;
  state.pendingAdvance = true;

  const userInput = els.answerInput.value;
  els.answerInput.disabled = true;

  if (checkTextAnswer(userInput, q)) {
    state.score++;
    els.answerInput.classList.add('correct');
    showFeedback(`正解！ ${q.name}`, 'correct');
  } else {
    els.answerInput.classList.add('wrong');
    showFeedback(`不正解。 正解は ${q.name}`, 'wrong');
  }
  els.scoreDisplay.textContent = `スコア: ${state.score}`;

  const isLast = state.current >= state.questions.length - 1;
  setConfirmState(isLast ? '結果を見る' : '次の問題へ', { next: true });
}

function normalizeText(s) {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .replace(/[\s　・·・‐‑‒–—―\-]/g, '')
    .toLowerCase();
}

function checkTextAnswer(input, country) {
  const n = normalizeText(input);
  if (!n) return false;
  const meta = COUNTRIES[country.id];
  if (!meta) return false;
  const candidates = [meta[0], ...((meta[3] || []))];
  return candidates.some(c => normalizeText(c) === n);
}

function pickDistractors(target, n) {
  const sameRegion = state.pool.filter(c => c.id !== target.id && c.region === target.region);
  const others = state.pool.filter(c => c.id !== target.id && c.region !== target.region);
  const shuffle = arr => arr.sort(() => Math.random() - 0.5);
  shuffle(sameRegion);
  shuffle(others);
  const result = [];
  for (const c of sameRegion) {
    if (result.length >= n) break;
    result.push(c);
  }
  for (const c of others) {
    if (result.length >= n) break;
    result.push(c);
  }
  return result;
}

function judgePlaceToName() {
  const q = state.questions[state.current];
  state.locked = true;
  state.pendingAdvance = true;

  const buttons = els.choices.querySelectorAll('button');
  const selectedId = state.selectedChoiceId;

  buttons.forEach(b => {
    b.disabled = true;
    b.classList.remove('selected');
    const id = b.dataset.choiceId;
    if (id === q.id) b.classList.add('correct');
    else if (id === selectedId) b.classList.add('wrong');
  });

  if (selectedId === q.id) {
    state.score++;
    showFeedback(`正解！`, 'correct');
  } else {
    showFeedback(`不正解。 正解は ${q.name}`, 'wrong');
  }
  els.scoreDisplay.textContent = `スコア: ${state.score}`;

  const isLast = state.current >= state.questions.length - 1;
  setConfirmState(isLast ? '結果を見る' : '次の問題へ', { next: true });
}

function advanceQuestion() {
  state.current++;
  nextQuestion();
}

function runExplore() {
  els.promptArea.innerHTML = '国をタップ／カーソル合わせで国名を表示';
  els.progress.textContent = '';
  els.scoreDisplay.textContent = '';
  setConfirmState('', { hidden: true });

  const showName = function(event, d) {
    const id = normId(d.id);
    const meta = COUNTRIES[id];
    els.feedback.textContent = meta ? meta[0] : '—';
    els.feedback.className = 'feedback';
  };

  gMap.selectAll('.country')
    .on('mouseover', showName)
    .on('click', showName);
}

function showFeedback(msg, kind) {
  els.feedback.textContent = msg;
  els.feedback.className = 'feedback ' + (kind || '');
  if (kind === 'correct') playCorrectSound();
  else if (kind === 'wrong') playWrongSound();
}

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone({ freq, duration = 0.18, type = 'sine', gain = 0.18, when = 0 }) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function playCorrectSound() {
  // major arpeggio C5 → E5 → G5
  playTone({ freq: 523.25, duration: 0.12, when: 0,    gain: 0.16 });
  playTone({ freq: 659.25, duration: 0.12, when: 0.08, gain: 0.16 });
  playTone({ freq: 783.99, duration: 0.24, when: 0.16, gain: 0.18 });
}

function playWrongSound() {
  // low descending buzz
  playTone({ freq: 220, duration: 0.18, type: 'square', when: 0,    gain: 0.10 });
  playTone({ freq: 155, duration: 0.32, type: 'square', when: 0.10, gain: 0.10 });
}

function showResult() {
  document.body.classList.remove('game-mode');
  els.game.hidden = true;
  els.result.hidden = false;
  const total = state.questions.length;
  const ratio = total > 0 ? state.score / total : 0;
  els.finalScore.textContent = `${state.score} / ${total}`;
  let comment = '';
  if (ratio === 1) comment = 'パーフェクト！';
  else if (ratio >= 0.8) comment = '素晴らしい！';
  else if (ratio >= 0.5) comment = 'いい調子です';
  else if (ratio > 0) comment = 'まだまだ伸びしろあり';
  else comment = '地図を眺めてから再挑戦！';
  els.finalComment.textContent = comment;
}

function backToMenu() {
  resetMapInteractions();
  resetCountryClasses();
  resetZoom(false);
  document.body.classList.remove('game-mode');
  els.game.hidden = true;
  els.result.hidden = true;
  els.menu.hidden = false;
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
