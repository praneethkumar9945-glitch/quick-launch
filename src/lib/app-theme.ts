export type AppTheme = "light" | "dark";

export const APP_THEME_STORAGE_KEY = "manager-edu-theme";

export function parseAppTheme(value: string | null | undefined): AppTheme {
  return value === "light" ? "light" : "dark";
}

export function applyAppTheme(theme: AppTheme, doc: Document = document) {
  for (const element of [doc.documentElement, doc.body]) {
    if (!element) continue;
    element.classList.toggle("light", theme === "light");
    element.classList.toggle("dark", theme === "dark");
  }
  doc.documentElement.style.colorScheme = theme;
}
