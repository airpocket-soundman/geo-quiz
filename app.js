const MAP_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const state = {
  mode: null,
  region: 'all',
  total: 10,
  pool: [],
  questions: [],
  current: 0,
  score: 0,
  awaitingAnswer: false,
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
};

let svg, gMap, path, projection, tooltip;
let allFeatures = [];

function normId(id) {
  return String(parseInt(id, 10));
}

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

  els.loading.hidden = true;
  els.menu.hidden = false;
}

function setupMap() {
  const width = 980, height = 500;
  els.mapContainer.innerHTML = '';
  svg = d3.select(els.mapContainer).append('svg')
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

  tooltip = d3.select(els.mapContainer).append('div').attr('class', 'tooltip');
}

function setupMenu() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const region = document.querySelector('input[name="region"]:checked').value;
      const total = parseInt(document.querySelector('input[name="count"]:checked').value, 10);
      startMode(mode, region, total);
    });
  });

  document.getElementById('back-btn').addEventListener('click', backToMenu);
  document.getElementById('back-to-menu').addEventListener('click', backToMenu);
  document.getElementById('play-again').addEventListener('click', () => startMode(state.mode, state.region, state.total));
}

function startMode(mode, region, total) {
  state.mode = mode;
  state.region = region;
  state.total = total || 10;
  state.pool = buildPool(region);
  state.score = 0;
  state.current = 0;

  resetMapInteractions();
  resetCountryClasses();

  if (state.pool.length === 0) {
    alert('対象の国がありません。');
    return;
  }

  els.menu.hidden = true;
  els.result.hidden = true;
  els.game.hidden = false;
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';
  els.choices.innerHTML = '';

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
  if (tooltip) tooltip.style('display', 'none');
}

function resetCountryClasses() {
  gMap.selectAll('.country').classed('target correct wrong disabled', false);
}

function nextQuestion() {
  if (state.current >= state.questions.length) return showResult();

  const q = state.questions[state.current];
  els.progress.textContent = `${state.current + 1} / ${state.questions.length}`;
  els.scoreDisplay.textContent = `スコア: ${state.score}`;
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';
  els.choices.innerHTML = '';
  resetCountryClasses();

  if (state.mode === 'name-to-place') {
    runNameToPlace(q);
  } else if (state.mode === 'place-to-name') {
    runPlaceToName(q);
  }
}

function runNameToPlace(q) {
  els.promptArea.innerHTML = `<span>地図でクリック →</span><span class="prompt-country">${q.name}</span>`;
  state.awaitingAnswer = true;

  gMap.selectAll('.country').on('click', function(event, d) {
    if (!state.awaitingAnswer) return;
    const clickedId = normId(d.id);
    const meta = COUNTRIES[clickedId];
    if (!meta) {
      els.feedback.textContent = 'この地域はクイズ対象外です';
      els.feedback.className = 'feedback';
      return;
    }
    handleNameToPlaceAnswer(clickedId, q);
  });
}

function handleNameToPlaceAnswer(clickedId, q) {
  state.awaitingAnswer = false;
  const correctSel = gMap.selectAll('.country').filter(d => normId(d.id) === q.id);

  if (clickedId === q.id) {
    state.score++;
    correctSel.classed('correct', true);
    showFeedback(`正解！ ${q.name}`, 'correct');
  } else {
    const clickedSel = gMap.selectAll('.country').filter(d => normId(d.id) === clickedId);
    const clickedMeta = COUNTRIES[clickedId];
    const clickedName = clickedMeta ? clickedMeta[0] : '不明';
    clickedSel.classed('wrong', true);
    correctSel.classed('correct', true);
    showFeedback(`不正解：${clickedName} / 正解は ${q.name}`, 'wrong');
  }
  els.scoreDisplay.textContent = `スコア: ${state.score}`;

  setTimeout(() => {
    state.current++;
    nextQuestion();
  }, 1700);
}

function runPlaceToName(q) {
  els.promptArea.innerHTML = `<span>赤色で示された国は？</span>`;
  gMap.selectAll('.country').filter(d => normId(d.id) === q.id).classed('target', true);

  const distractors = pickDistractors(q, 3);
  const choices = [q, ...distractors].sort(() => Math.random() - 0.5);

  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.textContent = choice.name;
    btn.addEventListener('click', () => handlePlaceToNameAnswer(btn, choice, q));
    els.choices.appendChild(btn);
  }
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

function handlePlaceToNameAnswer(btn, choice, q) {
  els.choices.querySelectorAll('button').forEach(b => b.disabled = true);

  if (choice.id === q.id) {
    state.score++;
    btn.classList.add('correct');
    showFeedback(`正解！`, 'correct');
  } else {
    btn.classList.add('wrong');
    els.choices.querySelectorAll('button').forEach(b => {
      if (b.textContent === q.name) b.classList.add('correct');
    });
    showFeedback(`不正解。 正解は ${q.name}`, 'wrong');
  }
  els.scoreDisplay.textContent = `スコア: ${state.score}`;

  setTimeout(() => {
    state.current++;
    nextQuestion();
  }, 1700);
}

function runExplore() {
  els.promptArea.innerHTML = '国にカーソルを合わせる、またはタップで国名を表示';
  els.progress.textContent = '';
  els.scoreDisplay.textContent = '';

  const showName = (event, d) => {
    const id = normId(d.id);
    const meta = COUNTRIES[id];
    if (!meta) {
      tooltip.style('display', 'none');
      return;
    }
    const rect = els.mapContainer.getBoundingClientRect();
    tooltip
      .style('display', 'block')
      .style('left', (event.clientX - rect.left + 10) + 'px')
      .style('top', (event.clientY - rect.top + 10) + 'px')
      .text(meta[0]);
  };

  gMap.selectAll('.country')
    .on('mouseover', showName)
    .on('mousemove', showName)
    .on('mouseout', () => tooltip.style('display', 'none'))
    .on('click', showName);
}

function showFeedback(msg, kind) {
  els.feedback.textContent = msg;
  els.feedback.className = 'feedback ' + (kind || '');
}

function showResult() {
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
  els.game.hidden = true;
  els.result.hidden = true;
  els.menu.hidden = false;
}

init();
