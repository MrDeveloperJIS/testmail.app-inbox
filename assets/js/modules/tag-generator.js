// modules/tag-generator.js
// Sequel tag generation/rollover logic (§5), plus custom tag validation
// (§5.1). Sequel format: AAA00 — 3 uppercase letters + 2 digits, digits
// increment fastest, then rightmost letter, then middle, then leftmost.

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTER_BASE = LETTERS.length; // 26
const DIGIT_BASE = 100; // 00-99
const MAX_INDEX = LETTER_BASE ** 3 * DIGIT_BASE - 1; // ZZZ99, ~1.76M combos

const SEQUEL_PATTERN = /^([A-Z]{3})(\d{2})$/;

function parseSequelTag(tag) {
    const match = SEQUEL_PATTERN.exec(tag);
    if (!match) {
        throw new Error(`Invalid sequel tag: ${tag}`);
    }
    const [, letters, digits] = match;
    return { letters, digits: parseInt(digits, 10) };
}

function lettersToIndex(letters) {
    let index = 0;
    for (const ch of letters) {
        index = index * LETTER_BASE + LETTERS.indexOf(ch);
    }
    return index;
}

function indexToLetters(letterIndex) {
    const chars = ["A", "A", "A"];
    let remaining = letterIndex;
    for (let i = 2; i >= 0; i -= 1) {
        chars[i] = LETTERS[remaining % LETTER_BASE];
        remaining = Math.floor(remaining / LETTER_BASE);
    }
    return chars.join("");
}

/**
 * Converts a sequel tag to its 0-based generation index (AAA00 -> 0,
 * AAA07 -> 7, ...). Used to derive "total generated" counts.
 * @param {string} tag
 */
export function sequelToIndex(tag) {
    const { letters, digits } = parseSequelTag(tag);
    return lettersToIndex(letters) * DIGIT_BASE + digits;
}

/**
 * Converts a 0-based generation index back into a sequel tag string.
 * @param {number} index
 */
export function indexToSequelTag(index) {
    if (index < 0 || index > MAX_INDEX) {
        throw new Error("Sequel tag range exhausted.");
    }
    const letterIndex = Math.floor(index / DIGIT_BASE);
    const digits = index % DIGIT_BASE;
    return `${indexToLetters(letterIndex)}${String(digits).padStart(2, "0")}`;
}

/**
 * Computes the next sequel tag to generate, given the last one written to
 * RTDB (`sequel/last`), or null/undefined if none has been generated yet.
 * Pure/no side effects — safe to call repeatedly for a preview; the caller
 * is responsible for writing the result to RTDB only on confirm.
 * @param {string | null | undefined} lastTag
 */
export function computeNextSequelTag(lastTag) {
    if (!lastTag) return indexToSequelTag(0); // AAA00
    return indexToSequelTag(sequelToIndex(lastTag) + 1);
}

/**
 * Validates + normalizes a custom tag (§5.1): trims whitespace, disallows
 * empty, restricts to DNS/email-safe characters, lowercase-normalizes.
 * @param {string} rawInput
 * @returns {{ valid: true, tag: string } | { valid: false, error: string }}
 */
export function normalizeCustomTag(rawInput) {
    const trimmed = (rawInput ?? "").trim().toLowerCase();

    if (!trimmed) {
        return { valid: false, error: "Tag can't be empty." };
    }
    if (!/^[a-z0-9._-]+$/.test(trimmed)) {
        return {
            valid: false,
            error: "Only letters, numbers, dots, underscores, and hyphens are allowed.",
        };
    }
    return { valid: true, tag: trimmed };
}