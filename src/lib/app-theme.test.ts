import { afterEach, describe, expect, it } from "vitest";

import { applyAppTheme, parseAppTheme } from "@/lib/app-theme";

afterEach(() => {
  document.documentElement.className = "";
  document.body.className = "";
  document.documentElement.style.colorScheme = "";
});

describe("app theme", () => {
  it("uses light mode only for a saved light preference", () => {
    expect(parseAppTheme("light")).toBe("light");
    expect(parseAppTheme("dark")).toBe("dark");
    expect(parseAppTheme(null)).toBe("dark");
    expect(parseAppTheme("unexpected")).toBe("dark");
  });

  it("applies light mode to the page and its portaled popups", () => {
    applyAppTheme("light");

    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.body).toHaveClass("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("switches back to dark mode", () => {
    applyAppTheme("light");
    applyAppTheme("dark");

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveClass("light");
    expect(document.body).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
