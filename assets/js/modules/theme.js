// modules/theme.js
// Shared dark/light theme toggle, self-initializing on import.
//
// The actual `data-theme` attribute on <html> is set as early as possible
// by a tiny inline script in each page's <head> (before any stylesheet
// paints), reading localStorage or falling back to the OS preference —
// that avoids a flash of the wrong theme. This module just keeps a page's
// toggle button (#theme-toggle-btn / #theme-toggle-icon) in sync with
// that state and handles clicks, if the page has one.

const STORAGE_KEY = "theme"; // "light" | "dark"

function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function updateToggleIcon(theme) {
    const btn = document.getElementById("theme-toggle-btn");
    const icon = document.getElementById("theme-toggle-icon");
    if (!btn || !icon) return;

    // The icon shown is the theme you'd switch TO on click.
    icon.setAttribute(
        "href",
        theme === "dark"
            ? "assets/img/icons/icons.svg#icon-sun"
            : "assets/img/icons/icons.svg#icon-moon"
    );
    btn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
        // Storage unavailable (private mode, etc.) — theme still applies
        // for this page load, just won't persist. Non-fatal.
    }
    updateToggleIcon(theme);
}

function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
}

const toggleBtn = document.getElementById("theme-toggle-btn");
if (toggleBtn) {
    updateToggleIcon(currentTheme());
    toggleBtn.addEventListener("click", toggleTheme);
}
