// modules/accounts.js
// Shared helpers for the multi-account profile model.
//
// Firestore users/{uid} document shape:
//   { name, accounts: [{ id, label, api, namespace }], activeAccountId, accountSeq }
//
// Account ids are sequential: 1 letter + 1 digit (A0, A1 ... A9, B0 ... Z9),
// 260 in total. `accountSeq` is the next number to hand out and only ever
// goes up, so a deleted account's id is never reused.
//
// Per-account tags live in RTDB at {uid}/accounts/{accountId}/tags/...

/**
 * Turns a raw Firestore document into a safe profile object.
 * Falls back to the first account if activeAccountId is missing/stale.
 */
export function normalizeProfile(data = {}) {
    const accounts = Array.isArray(data.accounts)
        ? data.accounts
              .filter((a) => a && a.id)
              .map((a) => ({
                  id: String(a.id),
                  label: a.label || "",
                  api: a.api || "",
                  namespace: a.namespace || "",
              }))
        : [];

    const activeAccountId = accounts.some((a) => a.id === data.activeAccountId)
        ? data.activeAccountId
        : accounts[0]?.id || "";

    const accountSeq =
        Number.isInteger(data.accountSeq) && data.accountSeq >= 0 ? data.accountSeq : 0;

    return { name: data.name || "", accounts, activeAccountId, accountSeq };
}

/** @returns the active account object, or null if there are none. */
export function getActiveAccount(profile) {
    return profile.accounts.find((a) => a.id === profile.activeAccountId) || null;
}

/** Display name for an account: its label, else its namespace. */
export function accountName(account) {
    return account.label || account.namespace || "Account";
}

const ID_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const MAX_ACCOUNTS = ID_LETTERS.length * 10; // A0 .. Z9

/** 0 -> "A0", 9 -> "A9", 10 -> "B0", ... 259 -> "Z9". */
function seqToAccountId(n) {
    return ID_LETTERS[Math.floor(n / 10)] + String(n % 10);
}

/**
 * Next free sequential id (skipping any already in use).
 * @returns {{ id: string, accountSeq: number } | null} null once all 260 are used.
 *          `accountSeq` is the value to store back on the profile.
 */
export function nextAccountId(profile) {
    const used = new Set(profile.accounts.map((a) => a.id));
    let seq = profile.accountSeq || 0;
    while (seq < MAX_ACCOUNTS && used.has(seqToAccountId(seq))) seq += 1;
    if (seq >= MAX_ACCOUNTS) return null;
    return { id: seqToAccountId(seq), accountSeq: seq + 1 };
}

/** RTDB base path for one account's tags. */
export function tagsPath(uid, accountId) {
    return `${uid}/accounts/${accountId}/tags`;
}

/** RTDB path for one account's message states ({messageKey: {received, read?}}). */
export function messagesPath(uid, accountId) {
    return `${uid}/accounts/${accountId}/messages`;
}

/** The plain object that gets written to Firestore. */
export function toDoc(profile) {
    return {
        name: profile.name,
        accounts: profile.accounts,
        activeAccountId: profile.activeAccountId,
        accountSeq: profile.accountSeq || 0,
    };
}