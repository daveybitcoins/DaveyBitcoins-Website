"use client";

export function ThemeToggle() {
  function toggleTheme() {
    const nextTheme =
      document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("davey-theme", nextTheme);
    window.dispatchEvent(new CustomEvent("davey-theme-change"));
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      <span aria-hidden="true">◐</span>
    </button>
  );
}
