// modules/utils.js
// Small shared helpers used across page scripts. No external dependencies.

/**
 * Returns a debounced version of `fn` that waits `wait` ms of silence
 * before firing. Used for the search input (§6.4).
 * @param {Function} fn
 * @param {number} wait
 */
export function debounce(fn, wait = 180) {
    let timer = null;
    return function debounced(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Escapes HTML-significant characters so untrusted strings (subject,
 * sender, tag) can be safely interpolated into markup.
 * @param {string} str
 */
export function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Formats a millisecond timestamp as a short relative-time string
 * ("just now", "3m ago", "2h ago", "5d ago"), falling back to a plain
 * date once it's more than a week old.
 * @param {number} timestampMs
 * @param {Date} [now]
 */
export function formatRelativeTime(timestampMs, now = new Date()) {
    const diffSec = Math.max(0, Math.round((now.getTime() - timestampMs) / 1000));

    if (diffSec < 10) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;

    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;

    return new Date(timestampMs).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/**
 * Masks an API key for display: first 3 and last 3 characters shown,
 * everything between replaced with a fixed run of asterisks — regardless
 * of the actual key length (per profile.html spec, §6.5).
 * @param {string} key
 */
export function maskApiKey(key) {
    if (!key) return "";
    if (key.length <= 6) return `${key[0] ?? ""}**********${key[key.length - 1] ?? ""}`;
    const start = key.slice(0, 3);
    const end = key.slice(-3);
    return `${start}**********${end}`;
}
