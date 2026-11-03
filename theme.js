// Loaded in <head>: sets the mode before the page paints, so it never flashes the wrong one
(function () {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved : prefersDark ? "dark" : "light";
})();

function setupThemeButton(button) {
  const nextTheme = () => (document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  const label = () => button.setAttribute("aria-label", `Switch to ${nextTheme()} mode`);
  label();
  button.addEventListener("click", () => {
    const next = nextTheme();
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    label();
  });
}

// Pages marked no-copy keep their text from being copied. Typing fields still work.
if (document.documentElement.classList.contains("no-copy")) {
  const block = (e) => {
    if (!(e.target instanceof Element && e.target.closest("input, textarea"))) e.preventDefault();
  };
  document.addEventListener("copy", block);
  document.addEventListener("cut", block);
}
