// The statistics page: every mock this account finished, summed up and drawn.
// Each attempt's answers hold a summary (title, time used, right per topic) saved by mock.js.
// Attempts saved before those summaries only have a score, so they count for scores alone.

const $ = (id) => document.getElementById(id);
const OUT_OF = 120;
const PACE = 120; // seconds per question in the real exam: 60 minutes for 30 questions
const TITLES = {
  math: "Mathematics Mock 1",
  math2: "Mathematics Mock 2",
  math3: "Mathematics Mock 3",
  crit: "Critical Thinking & PS Mock 1",
  crit2: "Critical Thinking & PS Mock 2",
};
const ORDER = Object.keys(TITLES);

setupThemeButton($("theme"));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const titleOf = (attempt) => attempt.answers?.title || TITLES[attempt.mock_id] || attempt.mock_id;
const summaryOf = (attempt) => (typeof attempt.answers?.total === "number" ? attempt.answers : null);
const average = (list) => list.reduce((all, n) => all + n, 0) / list.length;
const shortDate = (when) => new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function duration(seconds) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  return minutes ? `${minutes} min ${String(whole % 60).padStart(2, "0")} s` : `${whole} s`;
}

// One tooltip for every mark with data-tip, on hover and on keyboard focus
const tip = $("tip");
function showTip(target, x, y) {
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const box = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - box.width / 2), innerWidth - box.width - 8);
  tip.style.left = `${left + scrollX}px`;
  tip.style.top = `${y - box.height - 12 + scrollY}px`;
}
document.addEventListener("pointermove", (e) => {
  const target = e.target.closest("[data-tip]");
  if (target) showTip(target, e.clientX, e.clientY);
  else tip.hidden = true;
});
document.addEventListener("focusin", (e) => {
  const target = e.target.closest("[data-tip]");
  if (!target) return;
  const box = target.getBoundingClientRect();
  showTip(target, box.left + box.width / 2, box.top);
});
document.addEventListener("focusout", () => { tip.hidden = true; });

function tiles(attempts) {
  const scores = attempts.map((a) => a.score);
  const best = attempts.reduce((top, a) => (a.score > top.score ? a : top));
  const timed = attempts.map(summaryOf).filter((s) => s && s.used);
  const perQuestion = timed.length ? timed.reduce((all, s) => all + s.used, 0) / 1000 / timed.reduce((all, s) => all + s.total, 0) : null;
  const totalTime = timed.reduce((all, s) => all + s.used, 0) / 1000;
  const list = [
    ["Mocks finished", String(attempts.length), totalTime ? `${duration(totalTime)} of practice` : ""],
    ["Average score", `${Math.round(average(scores))}`, `out of ${OUT_OF}`],
    ["Best score", `${best.score}`, titleOf(best)],
    ["Time per question", perQuestion ? duration(perQuestion) : "–", perQuestion ? (perQuestion <= PACE ? "within the 2-minute pace" : "slower than the 2-minute pace") : "from your next mock"],
  ];
  $("tiles").replaceChildren(...list.map(([label, value, note]) => {
    const tile = element("div", "tile");
    tile.append(element("p", "tile-label", label), element("p", "tile-value", value), element("p", "tile-note", note));
    return tile;
  }));
}

// Columns for each attempt, on a fixed 0–120 scale with light guide lines
function timeline(attempts) {
  const shown = attempts.slice(-24);
  const plot = element("div", "columns-plot");
  for (const mark of [0, 30, 60, 90, 120]) {
    const line = element("div", "guide");
    line.style.bottom = `${(mark / OUT_OF) * 100}%`;
    line.append(element("span", "guide-label", String(mark)));
    plot.append(line);
  }
  const bars = element("div", "columns-bars");
  shown.forEach((attempt) => {
    const slot = element("div", "column-slot");
    const bar = element("div", "column");
    bar.style.height = `${Math.max(1.5, (attempt.score / OUT_OF) * 100)}%`;
    bar.tabIndex = 0;
    bar.dataset.tip = `${titleOf(attempt)} · ${attempt.score}/${OUT_OF} · ${shortDate(attempt.finished_at)}`;
    bar.setAttribute("aria-label", bar.dataset.tip);
    slot.append(bar);
    bars.append(slot);
  });
  plot.append(bars);
  // Dates only under the first and last column, so they never collide
  const axis = element("div", "columns-axis");
  axis.append(element("span", "", shortDate(shown[0].finished_at)));
  if (shown.length > 1) axis.append(element("span", "", shortDate(shown.at(-1).finished_at)));
  $("timeline").replaceChildren(plot, axis);
}

function hbar(label, value, max, valueText, tipText, marker) {
  const row = element("div", "hbar");
  const track = element("div", "hbar-track");
  const fill = element("div", "hbar-fill");
  fill.style.width = `${Math.max(1, Math.min(100, (value / max) * 100))}%`;
  fill.tabIndex = 0;
  fill.dataset.tip = tipText;
  fill.setAttribute("aria-label", tipText);
  track.append(fill);
  if (marker !== undefined) {
    const line = element("div", "hbar-marker");
    line.style.left = `${(marker / max) * 100}%`;
    track.append(line);
  }
  row.append(element("span", "hbar-label", label), track, element("span", "hbar-value", valueText));
  return row;
}

function groupByMock(attempts) {
  const groups = new Map();
  for (const attempt of attempts) {
    if (!groups.has(attempt.mock_id)) groups.set(attempt.mock_id, []);
    groups.get(attempt.mock_id).push(attempt);
  }
  const rank = (id) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

function byMock(groups) {
  $("by-mock").replaceChildren(...groups.map(([, list]) => {
    const scores = list.map((a) => a.score);
    const mean = Math.round(average(scores));
    const best = Math.max(...scores);
    const tries = `${list.length} ${list.length === 1 ? "try" : "tries"}`;
    return hbar(titleOf(list[0]), mean, OUT_OF, String(mean), `${titleOf(list[0])} · average ${mean}/${OUT_OF} · best ${best} · ${tries}`);
  }));
}

function byTime(groups) {
  const rows = groups.map(([, list]) => {
    const timed = list.map(summaryOf).filter((s) => s && s.used);
    if (!timed.length) return null;
    const seconds = timed.reduce((all, s) => all + s.used, 0) / 1000 / timed.reduce((all, s) => all + s.total, 0);
    return [titleOf(list[0]), seconds];
  }).filter(Boolean);
  if (!rows.length) {
    $("by-time").replaceChildren(element("p", "panel-empty", "Your next finished mock will show here."));
    return;
  }
  const max = Math.max(PACE * 1.5, ...rows.map(([, s]) => s));
  $("by-time").replaceChildren(...rows.map(([title, seconds]) =>
    hbar(title, seconds, max, duration(seconds), `${title} · ${duration(seconds)} per question`, PACE)));
}

// Topics are named like "M4 Algebra" or "CT Identifying an Assumption"
const AREAS = { M: "Math", CT: "Critical Thinking", PS: "Problem Solving" };

function byTopic(attempts) {
  const topics = {};
  for (const summary of attempts.map(summaryOf).filter(Boolean)) {
    for (const [name, [right, count]] of Object.entries(summary.topics || {})) {
      topics[name] = topics[name] || [0, 0];
      topics[name][0] += right;
      topics[name][1] += count;
    }
  }
  const names = Object.keys(topics);
  if (!names.length) {
    $("by-topic").replaceChildren(element("p", "panel-empty", "Your next finished mock will show here."));
    return;
  }
  const groups = {};
  for (const name of names) {
    const code = name.split(" ")[0];
    const area = AREAS[code] || AREAS[code.replace(/\d+$/, "")] || "Other";
    (groups[area] = groups[area] || []).push(name);
  }
  const blocks = Object.entries(groups).map(([area, list]) => {
    const block = element("div", "topic-group");
    block.append(element("h3", "", area));
    list.sort((a, b) => topics[a][0] / topics[a][1] - topics[b][0] / topics[b][1]);
    const bars = element("div", "hbars");
    bars.append(...list.map((name) => {
      const [right, count] = topics[name];
      const percent = Math.round((right / count) * 100);
      const label = name.split(" ").slice(1).join(" ");
      return hbar(label, percent, 100, `${percent}%`, `${label} · ${right} of ${count} right`);
    }));
    block.append(bars);
    return block;
  });
  $("by-topic").replaceChildren(...blocks);
}

function table(attempts) {
  $("attempt-rows").replaceChildren(...attempts.slice(-15).reverse().map((attempt) => {
    const summary = summaryOf(attempt);
    const row = document.createElement("tr");
    const cells = [
      titleOf(attempt),
      `${attempt.score}/${OUT_OF}`,
      summary ? `${summary.correct} of ${summary.total}` : "–",
      summary?.used ? duration(summary.used / 1000) : "–",
      shortDate(attempt.finished_at),
    ];
    row.append(...cells.map((text) => element("td", "", text)));
    return row;
  }));
}

(async () => {
  const user = await setupAccount();
  if (!user) {
    location.replace("login.html");
    return;
  }
  $("me-email").textContent = user.email;
  $("me-avatar").textContent = user.email[0].toUpperCase();
  $("me-joined").textContent = `Member since ${new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`;

  const { data, error } = await db.from("attempts").select("mock_id, score, answers, finished_at").order("finished_at", { ascending: true }).limit(1000);
  if (error) {
    $("message").textContent = "Your results couldn't be loaded. Refresh the page to try again.";
    return;
  }
  if (!data.length) {
    $("message").textContent = "No finished mocks yet. Finish a mock while signed in and your statistics will appear here.";
    return;
  }
  $("message").hidden = true;
  $("stats-body").hidden = false;
  const groups = groupByMock(data);
  tiles(data);
  timeline(data);
  byMock(groups);
  byTime(groups);
  byTopic(data);
  table(data);
})();
