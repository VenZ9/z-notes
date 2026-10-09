export type Theme = "light" | "dark" | "system";

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;

  localStorage.setItem("znotes-theme", theme);

  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  document.documentElement.dataset.theme = resolved;
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const value = localStorage.getItem("znotes-theme");
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}
