const $ = (id) => document.getElementById(id);
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const requested = new URLSearchParams(location.search).get("subject");
const subject = Object.hasOwn(TESTS, requested || "") ? requested : "math";
const test = TESTS[subject];
const total = Math.max(test.total, test.questions.length);
const storeKey = `pacemock-v6:${subject}${window.accountId ? `:${window.accountId}` : ""}`;

const question = (i) => test.questions[i] || {
  q: `Question ${i + 1} will appear here.`,
  options: LETTERS.slice(0, 5).map((letter) => `Option ${letter}`),
};

// Writes text into an element, turning ^{...} into superscript
function setText(element, text) {
  element.replaceChildren(...text.split(/\^\{([^}]*)\}/).map((part, i) => {
    if (i % 2 === 0) return document.createTextNode(part);
    const sup = document.createElement("sup");
    sup.textContent = part;
    return sup;
  }));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey));
    if (saved) return saved;
  } catch (e) {}
  return { current: 0, answers: {}, marked: {} };
}

let state = loadState(); // saved on every change, so a refresh picks up where it stopped
let timer;
let lastLeft;

function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) {}
}

function clearSaved() {
  try { localStorage.removeItem(storeKey); } catch (e) {}
}

const answeredCount = () => Object.keys(state.answers).length;
const markedCount = () => Object.keys(state.marked).length;

function statusOf(i) {
  if (i === state.current) return "is-current";
  if (state.marked[i]) return "is-marked";
  return i in state.answers ? "is-answered" : "";
}

function renderGrid() {
  const names = { "is-current": "current", "is-marked": "marked", "is-answered": "answered", "": "not answered" };
  $("grid").replaceChildren(...Array.from({ length: total }, (_, i) => {
    const button = document.createElement("button");
    const status = statusOf(i);
    button.type = "button";
    button.className = `number ${status}`;
    button.textContent = i + 1;
    button.setAttribute("aria-label", `Question ${i + 1}, ${names[status]}`);
    button.addEventListener("click", () => goTo(i));
    return button;
  }));
}

function renderOptions(q) {
  // Long option lists go in two columns: A to D, then E to H
  $("options").classList.toggle("two-columns", q.options.length > 5);
  $("options").style.setProperty("--rows", Math.ceil(q.options.length / 2));
  $("options").replaceChildren(...q.options.map((text, i) => {
    const button = document.createElement("button");
    const letter = document.createElement("span");
    const label = document.createElement("span");
    const chosen = state.answers[state.current] === i;
    button.type = "button";
    button.className = chosen ? "option chosen" : "option";
    button.setAttribute("aria-pressed", chosen);
    letter.className = "letter";
    letter.textContent = LETTERS[i];
    setText(label, text);
    button.append(letter, label);
    button.addEventListener("click", () => choose(i));
    return button;
  }));
}

function tableParts(table) {
  const row = (cells, tag) => {
    const tr = document.createElement("tr");
    tr.append(...cells.map((text) => {
      const cell = document.createElement(tag);
      cell.textContent = text;
      return cell;
    }));
    return tr;
  };
  const head = document.createElement("thead");
  const body = document.createElement("tbody");
  head.append(row(table.head, "th"));
  body.append(...table.rows.map((cells) => row(cells, "td")));
  return [head, body];
}

function renderTable(table) {
  $("question-table").hidden = !table;
  $("question-table").replaceChildren(...(table ? tableParts(table) : []));
}

function render() {
  const q = question(state.current);
  const worth = q.marks ? ` · ${q.marks} marks` : "";
  $("progress").textContent = `${test.title} · Question ${state.current + 1} of ${total}${worth}`;
  $("passage").hidden = !q.passage;
  setText($("passage"), q.passage || "");
  renderTable(q.table);
  setText($("question-text"), q.q);
  // A graph belongs to the passage, so it goes above the question
  $("question-text")[q.passage ? "before" : "after"]($("question-image"));
  $("question-image").hidden = !q.image;
  if (q.image) $("question-image").src = q.image;
  $("question-image").alt = q.alt || "";
  $("previous").disabled = state.current === 0;
  $("next").disabled = state.current === total - 1;
  const marked = Boolean(state.marked[state.current]);
  $("bookmark").classList.toggle("on", marked);
  $("bookmark").setAttribute("aria-pressed", marked);
  renderOptions(q);
  renderGrid();
}

function renderSide() {
  const closed = Boolean(state.sideClosed);
  $("exam").classList.toggle("side-closed", closed);
  $("toggle-side").setAttribute("aria-expanded", !closed);
  $("toggle-side").setAttribute("aria-label", closed ? "Show question list" : "Hide question list");
}

function update() {
  save();
  render();
}

function goTo(i) {
  state.current = i;
  update();
}

function choose(i) {
  // Tapping the chosen answer again clears it
  if (state.answers[state.current] === i) delete state.answers[state.current];
  else state.answers[state.current] = i;
  update();
}

function toggleMark() {
  if (state.marked[state.current]) delete state.marked[state.current];
  else state.marked[state.current] = true;
  update();
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return parts.map((n) => String(n).padStart(2, "0")).join(":");
}

function tick() {
  const left = state.endsAt - Date.now();
  $("time").textContent = formatTime(left);
  $("timer").classList.toggle("low", left <= 5 * 60000);
  const passed = [5, 1].find((minutes) => lastLeft > minutes * 60000 && left <= minutes * 60000);
  if (passed) $("time-alert").textContent = `${passed} minute${passed === 1 ? "" : "s"} left`;
  lastLeft = left;
  if (left <= 0) finish();
}

function runExam() {
  $("intro").hidden = true;
  $("exam").hidden = false;
  timer = setInterval(tick, 1000);
  tick();
  save();
}

function finish() {
  clearInterval(timer);
  if ($("confirm").open) $("confirm").close();

  // Kept in the saved state, so the results are still here after a refresh
  if (!state.finished) {
    state.finished = true;
    state.used = Math.min(test.minutes * 60000, test.minutes * 60000 - (state.endsAt - Date.now()));
    save();
  }
  const rows = [
    ["Answered", `${answeredCount()} of ${total}`],
    ["Marked", markedCount()],
    ["Time used", formatTime(state.used)],
  ];
  const worth = (q) => q.marks || 1;
  const sum = (list) => list.reduce((all, q) => all + worth(q), 0);
  const scored = sum(test.questions.filter((q, i) => "answer" in q && state.answers[i] === q.answer));
  if (test.questions.length) rows.unshift(["Score", `${scored} of ${sum(test.questions)}`]);
  $("show-review").hidden = !test.questions.length;
  renderTopics(worth);

  $("results-subject").textContent = test.title;
  $("stats").replaceChildren(...rows.map(([name, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = name;
    detail.textContent = value;
    row.append(term, detail);
    return row;
  }));
  $("intro").hidden = true;
  $("exam").hidden = true;
  $("results").hidden = false;
  if (test.questions.length) animateScore(scored, sum(test.questions));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) setText(node, text);
  return node;
}

// The logo's dot climbs the arc as the score counts up. Full marks reaches the end of the arc.
function animateScore(score, max) {
  const fill = $("gauge-fill");
  const length = fill.getTotalLength();
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = calm ? 0 : 1800;
  const start = performance.now();
  $("gauge").hidden = false;

  // A plain timer, because animation frames stop in a background tab and the score must still land
  const draw = () => {
    const t = duration ? Math.min(1, (performance.now() - start) / duration) : 1;
    const share = (score / max) * (1 - (1 - t) ** 3);
    const point = fill.getPointAtLength(share * length);
    fill.setAttribute("stroke-dasharray", `${share * 100} 100`);
    $("gauge-dot").setAttribute("cx", point.x);
    $("gauge-dot").setAttribute("cy", point.y);
    $("gauge-score").textContent = `${Math.round(share * max)}/${max}`;
    if (t < 1) setTimeout(draw, 16);
  };
  draw();
}

// Share of marks earned in each topic, listed on the results
function renderTopics(worth) {
  const topics = {};
  test.questions.forEach((q, i) => {
    if (!q.topic) return;
    topics[q.topic] = topics[q.topic] || { got: 0, max: 0 };
    topics[q.topic].max += worth(q);
    if (state.answers[i] === q.answer) topics[q.topic].got += worth(q);
  });
  const names = Object.keys(topics).sort();
  $("topics").hidden = !names.length;
  $("topic-list").replaceChildren(...names.map((name) => {
    const [code, ...rest] = name.split(" ");
    const percent = Math.round(topics[name].got / topics[name].max * 100);
    const row = element("div", "topic-row");
    const bar = element("span", "topic-bar");
    const fill = element("span", "topic-fill");
    fill.style.width = `${percent}%`;
    bar.append(fill);
    row.append(element("span", "topic-code", code), element("span", "topic-name", rest.join(" ")), bar,
      element("span", "topic-percent", `${percent}%`));
    return row;
  }));
}

function reviewOption(q, chosen, i, text) {
  const mark = i === q.answer ? " right" : i === chosen ? " wrong" : "";
  const option = element("div", `option${mark}`);
  const label = element("span", "", text);
  option.append(element("span", "letter", LETTERS[i]), label);
  return option;
}

function reviewItem(q, index) {
  const chosen = state.answers[index];
  const unanswered = chosen === undefined;
  const right = chosen === q.answer;
  const item = element("article", "review-item");
  const title = element("p", "review-title", `Question ${index + 1}${q.marks ? ` · ${q.marks} marks` : ""}`);
  const status = element("span", `review-status${unanswered ? "" : right ? " right" : " wrong"}`,
    unanswered ? "Not answered" : right ? "Correct" : "Wrong");
  title.append(status);
  item.append(title);

  const text = element("p", "question-text", q.q);
  const image = q.image ? element("img", "question-image") : null;
  if (image) {
    image.src = q.image;
    image.alt = q.alt || "";
  }
  if (q.passage) item.append(element("p", "passage", q.passage));
  if (q.table) {
    const table = element("table", "question-table");
    table.append(...tableParts(q.table));
    item.append(table);
  }
  item.append(...(q.passage ? [image, text] : [text, image]).filter(Boolean));

  const options = element("div", "options");
  options.append(...q.options.map((option, i) => reviewOption(q, chosen, i, option)));
  item.append(options);

  if (q.solutionImage) {
    const sheet = element("img", "solution-sheet");
    sheet.src = q.solutionImage;
    sheet.alt = q.solution.replace(/\^\{([^}]*)\}/g, "^$1");
    sheet.loading = "lazy";
    item.append(sheet);
  } else if (q.solution) {
    const solution = element("div", "solution");
    const heading = document.createElement("strong");
    heading.textContent = "Solution";
    const body = document.createElement("span");
    setText(body, q.solution);
    solution.append(heading, body);
    item.append(solution);
  }
  return item;
}

function showReview(open) {
  if (open && !$("review-list").children.length) {
    $("review-list").append(...test.questions.map(reviewItem));
  }
  $("results").hidden = open;
  $("review").hidden = !open;
  scrollTo(0, 0);
}

$("show-review").addEventListener("click", () => showReview(true));
$("retake").addEventListener("click", () => {
  clearSaved();
  location.reload();
});
$("hide-review").addEventListener("click", () => showReview(false));
$("previous").addEventListener("click", () => goTo(state.current - 1));
$("next").addEventListener("click", () => goTo(state.current + 1));
$("bookmark").addEventListener("click", toggleMark);
setupThemeButton($("theme"));
$("toggle-side").addEventListener("click", () => {
  state.sideClosed = !state.sideClosed;
  save();
  renderSide();
});
$("finish").addEventListener("click", () => {
  $("confirm-text").textContent = `You've answered ${answeredCount()} of ${total} questions.`;
  $("confirm").showModal();
});
$("keep-going").addEventListener("click", () => $("confirm").close());
$("confirm-finish").addEventListener("click", finish);
$("begin").addEventListener("click", () => {
  state.endsAt = Date.now() + test.minutes * 60000;
  runExam();
});

$("intro-subject").textContent = `${test.title} · ${total} questions · ${test.minutes} minutes`;
render();
renderSide();
if (state.finished) finish();
else if (state.endsAt) runExam();
