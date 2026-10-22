// inbox.js — core inbox page.

import {
    db,
    rtdb
} from "./firebase-config.js";
import {
    requireAuth
} from "./modules/auth-guard.js";
import {
    debounce,
    escapeHtml,
    formatRelativeTime
} from "./modules/utils.js";
import {
    fetchInbox
} from "./modules/testmail-api.js";
import {
    computeNextSequelTag,
    normalizeCustomTag
} from "./modules/tag-generator.js";
import {
    normalizeProfile,
    getActiveAccount,
    accountName,
    tagsPath,
    messagesPath,
} from "./modules/accounts.js";
import {
    doc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
    ref,
    get,
    set,
    update,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const MESSAGE_LIMIT = 40; // page size for both the first load and "Load more"
const SEARCH_DEBOUNCE_MS = 180;
const AUTO_FETCH_DELAY_MS = 5000; // single auto fetch after page load
const RELATIVE_TIME_TICK_MS = 30000; // re-render "3m ago" labels, no network
const READ_STORE_PREFIX = "tmi:read:"; // localStorage cache: tmi:read:{uid}:{accountId}
// testmail.app keeps mail for 3 days, so a message entry is useless after that.
// One extra hour absorbs clock differences between devices and the server.
const READ_TTL_MS = 73 * 60 * 60 * 1000;

// ---- DOM refs --------------------------------------------------------------

const newTagBtn = document.getElementById("new-tag-btn");
const demoTagBtn = document.getElementById("demo-tag-btn");
const refreshBtn = document.getElementById("refresh-btn");
const refreshIcon = document.getElementById("refresh-icon");
const searchInput = document.getElementById("search-input");
const backBtn = document.getElementById("back-btn");
const pageEl = document.querySelector(".inbox-page");
const listPaneEl = document.querySelector(".inbox__list-pane");
const readerPaneEl = document.querySelector(".inbox__reader-pane");
const loadMoreWrapEl = document.getElementById("load-more-wrap");
const loadMoreBtn = document.getElementById("load-more-btn");

const banner = document.getElementById("inbox-banner");

const inboxEl = document.querySelector(".inbox");
const messageListEl = document.getElementById("message-list");
const inboxEmptyEl = document.getElementById("inbox-empty");
const inboxEmptyTextEl = document.getElementById("inbox-empty-text");

const readerEmptyEl = document.getElementById("reader-empty");
const readerContentEl = document.getElementById("reader-content");
const readerSubjectEl = document.getElementById("reader-subject");
const readerFromEl = document.getElementById("reader-from");
const readerToEl = document.getElementById("reader-to");
const readerTagEl = document.getElementById("reader-tag");
const readerTimestampEl = document.getElementById("reader-timestamp");
const readerIframeEl = document.getElementById("reader-iframe");
const readerTextEl = document.getElementById("reader-text");
const viewHtmlBtn = document.getElementById("view-html-btn");
const viewTextBtn = document.getElementById("view-text-btn");

const modalBackdrop = document.getElementById("tag-modal-backdrop");
const modalEl = document.getElementById("tag-modal");
const modalCloseBtn = document.getElementById("tag-modal-close");
const tabCustomBtn = document.getElementById("tab-custom");
const tabSequelBtn = document.getElementById("tab-sequel");
const modalTabsEl = document.getElementById("tag-modal-tabs");
const panelCustomEl = document.getElementById("panel-custom");
const panelSequelEl = document.getElementById("panel-sequel");
const panelCreatedEl = document.getElementById("panel-created");
const customTagInput = document.getElementById("custom-tag-input");
const customTagHint = document.getElementById("custom-tag-hint");
const customTagCreateBtn = document.getElementById("custom-tag-create");
const sequelPreviewEl = document.getElementById("sequel-preview");
const sequelTagCreateBtn = document.getElementById("sequel-tag-create");
const createdAddressText = document.getElementById("created-address-text");
const copyAddressBtn = document.getElementById("copy-address-btn");
const copyFeedback = document.getElementById("copy-feedback");
const tagModalDoneBtn = document.getElementById("tag-modal-done");

const demoModalBackdrop = document.getElementById("demo-modal-backdrop");
const demoModalCloseBtn = document.getElementById("demo-modal-close");
const demoAddressText = document.getElementById("demo-address-text");
const demoCopyBtn = document.getElementById("demo-copy-btn");
const demoCopyFeedback = document.getElementById("demo-copy-feedback");

// ---- State -------------------------------------------------------------

let uid = null;
let profile = { name: "", accounts: [], activeAccountId: "" };
let account = null; // the active account (api + namespace) the inbox reads from
let allMessages = []; // fetched so far (first page + any "Load more"), newest-first
let searchIndex = []; // lowercase searchable text, parallel to allMessages
let filteredIndices = []; // indices into allMessages currently shown
let selectedIndex = null; // index into allMessages
let fetchedCount = 0; // emails the server has returned so far = next `offset`
let hasMore = false; // whether "Load more" should be offered
let isFetching = false;
let readMap = new Map(); // db key -> { received, read? } timestamps in ms (see read state)
let readSync = Promise.resolve(); // the latest syncReadState() run
let listScrollTop = 0; // list scroll position to restore on mobile "back"
let autoFetchTimerElapsed = false;
let profileReady = false;
let autoFetchDone = false;
let lastFocusedBeforeModal = null;
let existingCustomTags = new Set();

// ---- Auth guard + bootstrap ------------------------------------------------

requireAuth(async (user) => {
    uid = user.uid;
    await loadProfile();
    applyFilter(searchInput.value);
    profileReady = true;
    maybeAutoFetch();
});

async function loadProfile() {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) profile = normalizeProfile(snap.data());
    } catch (err) {
        showBanner("Couldn't load your profile — try refreshing the page.");
    }

    account = getActiveAccount(profile);
    readMap = loadReadCache();
    syncReadState(); // background: merge with RTDB, no need to wait for it

    if (!account || !account.api || !account.namespace) {
        showBanner("Add a testmail.app account in Profile before refreshing.");
        refreshBtn.disabled = true;
    }
}

// Coming back via the browser's back button can restore a stale page from
// the bfcache (old account still selected) — reload so it re-reads the profile.
window.addEventListener("pageshow", (e) => {
    if (e.persisted) window.location.reload();
});

/** RTDB base path for the active account's tags (null when no account). */
function tagsBase() {
    return account ? tagsPath(uid, account.id) : null;
}

function showBanner(message) {
    banner.textContent = message;
    banner.hidden = false;
}

function hideBanner() {
    banner.hidden = true;
    banner.textContent = "";
}

// ---- Refresh / fetch / load more -------------------------------------------

refreshBtn.addEventListener("click", () => {
    loadMessages({ append: false });
});

loadMoreBtn.addEventListener("click", () => {
    loadMessages({ append: true });
});

/**
 * Fetches one page of messages. `append: false` replaces the list with the
 * newest page (refresh); `append: true` asks testmail.app for the next page
 * via `offset` and adds it to the end of the list.
 */
async function loadMessages({ append, syncRead = true }) {
    if (isFetching || !account || !account.api || !account.namespace) return;

    // Any fetch, manual or automatic, uses up the one-time auto fetch.
    autoFetchDone = true;

    isFetching = true;
    refreshBtn.disabled = true;
    loadMoreBtn.disabled = true;
    if (append) loadMoreBtn.textContent = "Loading…";
    else refreshIcon.classList.add("spin");
    hideBanner();

    // A manual refresh also pulls read state, so reads made on other devices show up.
    if (!append && syncRead) syncReadState();

    const offset = append ? fetchedCount : 0;

    try {
        const { emails, total } = await fetchInbox({
            apiKey: account.api,
            namespace: account.namespace,
            limit: MESSAGE_LIMIT,
            offset,
        });

        if (append) {
            // New mail arriving between pages shifts offsets, so skip repeats.
            const seen = new Set(allMessages.map(messageKey));
            const fresh = emails.filter((m) => !seen.has(messageKey(m)));
            allMessages = allMessages.concat(fresh);
            searchIndex = searchIndex.concat(fresh.map(buildSearchText));
            registerReceived(fresh);
        } else {
            allMessages = emails;
            searchIndex = emails.map(buildSearchText);
            registerReceived(emails);
            selectedIndex = null;
            renderReaderEmpty();
        }

        fetchedCount = offset + emails.length;
        hasMore =
            emails.length > 0 &&
            (total !== null ? fetchedCount < total : emails.length === MESSAGE_LIMIT);

        applyFilter(searchInput.value);
    } catch (err) {
        showBanner(err.message);
    } finally {
        isFetching = false;
        refreshBtn.disabled = false;
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "Load more";
        refreshIcon.classList.remove("spin");
    }
}

// ---- One-time auto fetch -------------------------------------------------
// Runs once, AUTO_FETCH_DELAY_MS after page load and only after the profile
// has loaded. It never repeats; a manual refresh before it fires cancels it.

setTimeout(() => {
    autoFetchTimerElapsed = true;
    maybeAutoFetch();
}, AUTO_FETCH_DELAY_MS);

function maybeAutoFetch() {
    if (autoFetchDone || !autoFetchTimerElapsed || !profileReady) return;
    autoFetchDone = true;
    loadMessages({ append: false, syncRead: false }); // profile load already synced
}

function updateInboxEmptyText() {
    const where = account ? ` for ${accountName(account)}` : "";
    if (allMessages.length === 0) {
        inboxEmptyTextEl.textContent = `No messages yet${where} — hit refresh to check your inbox.`;
    } else if (hasMore) {
        inboxEmptyTextEl.textContent = "No loaded messages match — load more to search older mail.";
    } else {
        inboxEmptyTextEl.textContent = "No messages match your search.";
    }
}

// ---- Search ----------------------------------------------------------------

/** Stable per-message key (testmail.app `id`, with a fallback). */
function messageKey(msg) {
    return String(msg.id || `${msg.timestamp}|${msg.tag}|${msg.subject}`);
}

function stripHtml(html) {
    if (!html) return "";
    return html
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ");
}

/** Lowercased tag + subject + sender + body, built once per message. */
function buildSearchText(msg) {
    const parts = [msg.tag, msg.subject, msg.from];
    if (Array.isArray(msg.from_parsed)) {
        for (const p of msg.from_parsed) parts.push(p?.name, p?.address);
    }
    parts.push(msg.text || stripHtml(msg.html));
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").toLowerCase();
}

function applyFilter(query) {
    // Every word must appear somewhere in the message (order doesn't matter).
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    filteredIndices = allMessages
        .map((_, i) => i)
        .filter((i) => terms.every((t) => searchIndex[i].includes(t)));

    if (selectedIndex !== null && !filteredIndices.includes(selectedIndex)) {
        selectedIndex = null;
        renderReaderEmpty();
    }

    updateInboxEmptyText();
    renderMessageList();
}

const handleSearchInput = debounce((value) => {
    applyFilter(value);
}, SEARCH_DEBOUNCE_MS);

searchInput.addEventListener("input", (e) => {
    handleSearchInput(e.target.value);
});

// ---- Read / unread state -----------------------------------------------------
// Every fetched message gets an entry in RTDB at
//   {uid}/accounts/{accountId}/messages/{messageKey} = { received, read? }
// `received` is the mail's own timestamp, stored by the fetch the first time
// the message is seen. `read` is set when the message is opened. A message is
// read when its entry has a `read` timestamp, otherwise unread. Because it is
// in RTDB, the state follows you across devices; localStorage mirrors it as an
// instant/offline cache.
// Entries whose `received` is older than READ_TTL_MS are deleted (testmail.app
// has dropped the mail by then). RTDB has no TTL, so the sweep runs from
// syncReadState() on page load and manual refresh.

/** Message key made safe for an RTDB key (no . $ # [ ] / or control chars). */
function readDbKey(msg) {
    return messageKey(msg)
        .replace(/[.$#\[\]\/\u0000-\u001f\u007f]/g, "_")
        .slice(0, 200);
}

function isRead(msg) {
    return typeof readMap.get(readDbKey(msg))?.read === "number";
}

function isTs(v) {
    return typeof v === "number" && Number.isFinite(v);
}

/** Validates one stored entry; returns { received, read? } or null. */
function cleanEntry(v) {
    if (!v || typeof v !== "object") return null;
    const received = isTs(v.received) ? v.received : isTs(v.read) ? v.read : null;
    if (received === null) return null;
    const entry = { received };
    if (isTs(v.read)) entry.read = v.read;
    return entry;
}

function readStoreKey() {
    return uid && account ? `${READ_STORE_PREFIX}${uid}:${account.id}` : null;
}

function loadReadCache() {
    const key = readStoreKey();
    const map = new Map();
    if (!key) return map;
    try {
        const stored = JSON.parse(localStorage.getItem(key) || "{}");
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
            const cutoff = Date.now() - READ_TTL_MS;
            for (const [k, v] of Object.entries(stored)) {
                const entry = cleanEntry(v);
                if (entry && entry.received >= cutoff) map.set(k, entry);
            }
        }
    } catch (err) {
        // Unreadable cache: start empty; RTDB will refill it.
    }
    return map;
}

function saveReadCache() {
    const key = readStoreKey();
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(Object.fromEntries(readMap)));
    } catch (err) {
        // Storage unavailable/full: read state still works for this session.
    }
}

/**
 * Merges RTDB and the local cache, deletes expired RTDB entries, and uploads
 * whatever RTDB is missing (e.g. a write that failed while offline).
 * Resolves when done; never rejects.
 */
function syncReadState() {
    readSync = runReadSync();
    return readSync;
}

async function runReadSync() {
    const base = account ? messagesPath(uid, account.id) : null;
    if (!base) return;

    try {
        const snap = await get(ref(rtdb, base));
        const remote = snap.exists() ? snap.val() : {};
        const cutoff = Date.now() - READ_TTL_MS;
        const changes = {};
        const expired = new Set();
        const remoteClean = new Map();

        for (const [k, v] of Object.entries(remote)) {
            const entry = cleanEntry(v);
            if (!entry || entry.received < cutoff) {
                changes[k] = null; // expired or malformed
                expired.add(k);
            } else {
                remoteClean.set(k, entry);
            }
        }

        // Remote wins for what it has; local fills the gaps.
        for (const [k, entry] of remoteClean) {
            const local = readMap.get(k);
            const merged = { received: entry.received };
            const read = entry.read ?? local?.read;
            if (read !== undefined) merged.read = read;
            readMap.set(k, merged);
        }

        for (const [k, local] of [...readMap]) {
            if (expired.has(k) || local.received < cutoff) {
                readMap.delete(k);
                continue;
            }
            const rem = remoteClean.get(k);
            if (!rem || !isTs(remote[k]?.received)) changes[`${k}/received`] = local.received;
            if (local.read !== undefined && !isTs(remote[k]?.read)) changes[`${k}/read`] = local.read;
        }

        if (Object.keys(changes).length > 0) await update(ref(rtdb, base), changes);
    } catch (err) {
        // Offline or rules problem: keep working from the local cache.
    }

    saveReadCache();
    renderMessageList();
}

/**
 * Called after a fetch. Any message without an entry gets one with its
 * `received` timestamp (so it stays unread until opened). Entries that already
 * exist, including ones with a `read` timestamp, are left alone.
 */
async function registerReceived(messages) {
    await readSync; // know what RTDB already has before deciding what is new
    const base = account ? messagesPath(uid, account.id) : null;
    if (!base) return;

    const cutoff = Date.now() - READ_TTL_MS;
    const changes = {};
    for (const msg of messages) {
        const received = Number(msg.timestamp);
        if (!isTs(received) || received < cutoff) continue;
        const key = readDbKey(msg);
        if (readMap.has(key)) continue;
        readMap.set(key, { received });
        changes[`${key}/received`] = received;
    }
    if (Object.keys(changes).length === 0) return;

    saveReadCache();
    try {
        await update(ref(rtdb, base), changes);
    } catch (err) {
        // Retried by the next syncReadState().
    }
}

/** Marks a message read. @returns {boolean} true if it was previously unread. */
function markRead(msg) {
    const key = readDbKey(msg);
    const entry = readMap.get(key) || { received: Number(msg.timestamp) || Date.now() };
    if (isTs(entry.read)) return false;

    entry.read = Date.now();
    readMap.set(key, entry);
    saveReadCache();

    if (account) {
        // Fire and forget: a failed write is retried by the next syncReadState().
        update(ref(rtdb, messagesPath(uid, account.id)), {
            [`${key}/received`]: entry.received,
            [`${key}/read`]: entry.read,
        }).catch(() => { });
    }
    return true;
}

// ---- Rendering: message list --------------------------------------------

function renderMessageList() {
    messageListEl.innerHTML = "";

    const hasResults = filteredIndices.length > 0;
    inboxEmptyEl.classList.toggle("is-visible", !hasResults);
    messageListEl.hidden = !hasResults;
    loadMoreWrapEl.hidden = !hasMore;

    for (const i of filteredIndices) {
        const msg = allMessages[i];
        const isUnread = !isRead(msg);
        const li = document.createElement("li");
        li.innerHTML = `
      <button type="button" class="message-row${i === selectedIndex ? " is-selected" : ""}${isUnread ? " is-unread" : ""}" data-index="${i}">
        <div class="message-row__top">
          <span class="message-row__tag">${isUnread ? '<span class="visually-hidden">Unread. </span>' : ""}${escapeHtml(msg.tag || "")}</span>
          <span class="message-row__time" data-ts="${Number(msg.timestamp) || 0}">${escapeHtml(formatRelativeTime(msg.timestamp))}</span>
        </div>
        <span class="message-row__subject">${escapeHtml(msg.subject || "(no subject)")}</span>
        <span class="message-row__from">${escapeHtml(msg.from || "")}</span>
      </button>
    `;
        messageListEl.appendChild(li);
    }
}

messageListEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".message-row");
    if (!btn) return;
    selectMessage(Number(btn.dataset.index));
});

// ---- Relative time (client-side only, no refetch) -----------------------------

function refreshRelativeTimes() {
    const now = new Date();
    for (const el of messageListEl.querySelectorAll(".message-row__time")) {
        el.textContent = formatRelativeTime(Number(el.dataset.ts), now);
    }
}

setInterval(refreshRelativeTimes, RELATIVE_TIME_TICK_MS);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshRelativeTimes();
});

// ---- Rendering: reader pane ----------------------------------------------

/** Mobile: swaps between list pane and reader pane (and shows the back button). */
function setReading(isReading) {
    inboxEl.classList.toggle("is-reading", isReading);
    pageEl.classList.toggle("is-reading", isReading);
}

function selectMessage(index) {
    if (!inboxEl.classList.contains("is-reading")) {
        listScrollTop = listPaneEl.scrollTop; // restored by the back button
    }
    selectedIndex = index;
    markRead(allMessages[index]);
    renderMessageList();
    renderReaderContent(allMessages[index]);
    readerPaneEl.scrollTop = 0;
    setReading(true);
}

function renderReaderEmpty() {
    readerEmptyEl.hidden = false;
    readerContentEl.hidden = true;
    setReading(false);
}

function renderReaderContent(msg) {
    readerEmptyEl.hidden = true;
    readerContentEl.hidden = false;

    readerSubjectEl.textContent = msg.subject || "(no subject)";
    readerFromEl.textContent = msg.from || "";
    readerToEl.textContent = formatRecipients(msg);
    readerTagEl.textContent = msg.tag || "";
    readerTimestampEl.textContent = new Date(msg.timestamp).toLocaleString();

    readerIframeEl.srcdoc = msg.html ? withScrollbarStyle(msg.html) : "";
    readerTextEl.textContent = msg.text || "";

    const hasHtml = Boolean(msg.html);
    setReaderView(hasHtml ? "html" : "text");
    viewHtmlBtn.disabled = !hasHtml;
}

// ---- Reader helpers ------------------------------------------------------

/**
 * Builds the "To" line. Prefers the parsed recipient list from testmail.app,
 * then the raw `to` / `envelope_to` strings, and finally reconstructs the
 * address from the namespace + tag so the row is never blank.
 */
function formatRecipients(msg) {
    if (Array.isArray(msg.to_parsed) && msg.to_parsed.length > 0) {
        const list = msg.to_parsed
            .map(({ address, name }) =>
                address && name && name !== address ? `${name} <${address}>` : address || name
            )
            .filter(Boolean);
        if (list.length > 0) return list.join(", ");
    }
    if (msg.to) return msg.to;
    if (msg.envelope_to) return msg.envelope_to;
    if (account?.namespace && msg.tag) {
        return `${account.namespace}.${msg.tag}@inbox.testmail.app`;
    }
    return "—";
}

/**
 * The email body lives in its own iframe document, so the page's scrollbar
 * styles don't reach it. Append a matching rule set (colours read from the
 * base.css tokens, so nothing is hard-coded here). It goes at the end rather
 * than the start so the email's own <!doctype> keeps standards mode.
 */
function withScrollbarStyle(html) {
    const styles = getComputedStyle(document.documentElement);
    const token = (name) => styles.getPropertyValue(name).trim();
    const thumb = token("--scrollbar-thumb");
    const hover = token("--scrollbar-thumb-hover");
    const active = token("--scrollbar-thumb-active");

    return `${html}<style>
html{scrollbar-width:thin;scrollbar-color:${thumb} transparent}
@supports selector(::-webkit-scrollbar){
html{scrollbar-width:auto;scrollbar-color:auto}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{min-height:40px;background:${thumb};border:3px solid transparent;border-radius:999px;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:${hover};background-clip:padding-box}
::-webkit-scrollbar-thumb:active{background:${active};background-clip:padding-box}
}
</style>`;
}

function setReaderView(mode) {
    const isHtml = mode === "html";
    readerIframeEl.hidden = !isHtml;
    readerTextEl.hidden = isHtml;
    viewHtmlBtn.setAttribute("aria-pressed", String(isHtml));
    viewTextBtn.setAttribute("aria-pressed", String(!isHtml));
}

viewHtmlBtn.addEventListener("click", () => setReaderView("html"));
viewTextBtn.addEventListener("click", () => setReaderView("text"));

// Mobile: the top-bar back button returns from the reader to the list,
// restoring the list's scroll position.
backBtn.addEventListener("click", () => {
    selectedIndex = null;
    renderReaderEmpty();
    renderMessageList();
    listPaneEl.scrollTop = listScrollTop;
});

// =========================================================================
// New Tag modal
// =========================================================================

function openModal() {
    if (!account) {
        showBanner("Add a testmail.app account in Profile before creating tags.");
        return;
    }
    lastFocusedBeforeModal = document.activeElement;
    modalBackdrop.hidden = false;
    switchTab("custom");
    loadExistingCustomTags();
    customTagInput.focus();
}

function closeModal() {
    modalBackdrop.hidden = true;
    resetModalFields();
    if (lastFocusedBeforeModal) lastFocusedBeforeModal.focus();
}

modalCloseBtn.addEventListener("click", closeModal);
tagModalDoneBtn.addEventListener("click", closeModal);
newTagBtn.addEventListener("click", openModal);

function resetModalFields() {
    customTagInput.value = "";
    customTagHint.hidden = true;
    customTagHint.textContent = "";
    customTagCreateBtn.disabled = false;
    sequelTagCreateBtn.disabled = false;
    copyFeedback.textContent = "";
}

// ---- Tabs ----------------------------------------------------------------

function switchTab(tab) {
    const isCustom = tab === "custom";
    tabCustomBtn.setAttribute("aria-selected", String(isCustom));
    tabSequelBtn.setAttribute("aria-selected", String(!isCustom));
    panelCustomEl.hidden = !isCustom;
    panelSequelEl.hidden = isCustom;
    panelCreatedEl.hidden = true;
    modalTabsEl.hidden = false;

    if (!isCustom) loadSequelPreview();
}

tabCustomBtn.addEventListener("click", () => switchTab("custom"));
tabSequelBtn.addEventListener("click", () => switchTab("sequel"));

// ---- Custom tag tab --------------------------------------------------

async function loadExistingCustomTags() {
    existingCustomTags = new Set();
    try {
        const snap = await get(ref(rtdb, `${tagsBase()}/custom`));
        if (snap.exists()) {
            existingCustomTags = new Set(Object.values(snap.val()));
        }
    } catch (err) {
        // Non-blocking: duplicate-check is a nice-to-have, silently skip.
    }
}

customTagInput.addEventListener(
    "input",
    debounce(() => {
        const trimmed = customTagInput.value.trim().toLowerCase();
        if (trimmed && existingCustomTags.has(trimmed)) {
            customTagHint.textContent = "This tag already exists.";
            customTagHint.hidden = false;
        } else {
            customTagHint.hidden = true;
        }
    }, 150)
);

customTagCreateBtn.addEventListener("click", async () => {
    const result = normalizeCustomTag(customTagInput.value);
    if (!result.valid) {
        customTagHint.textContent = result.error;
        customTagHint.hidden = false;
        return;
    }

    customTagCreateBtn.disabled = true;
    try {
        await set(ref(rtdb, `${tagsBase()}/custom/${Date.now()}`), result.tag);
        showCreatedState(result.tag);
    } catch (err) {
        customTagHint.textContent = "Couldn't save the tag — try again.";
        customTagHint.hidden = false;
        customTagCreateBtn.disabled = false;
    }
});

// ---- Sequel tab --------------------------------------------------------

let sequelLastKnown = null;
let sequelNextPreview = null;

async function loadSequelPreview() {
    sequelPreviewEl.textContent = "…";
    try {
        const snap = await get(ref(rtdb, `${tagsBase()}/sequel/last`));
        sequelLastKnown = snap.exists() ? snap.val() : null;
        sequelNextPreview = computeNextSequelTag(sequelLastKnown);
        sequelPreviewEl.textContent = sequelNextPreview;
    } catch (err) {
        sequelPreviewEl.textContent = "—";
        sequelTagCreateBtn.disabled = true;
    }
}

sequelTagCreateBtn.addEventListener("click", async () => {
    if (!sequelNextPreview) return;

    sequelTagCreateBtn.disabled = true;
    try {
        await set(ref(rtdb, `${tagsBase()}/sequel/last`), sequelNextPreview);
        showCreatedState(sequelNextPreview);
    } catch (err) {
        sequelPreviewEl.textContent = "Couldn't create tag — try again.";
        sequelTagCreateBtn.disabled = false;
    }
});

// ---- Created state -------------------------------------------------------

function showCreatedState(tag) {
    panelCustomEl.hidden = true;
    panelSequelEl.hidden = true;
    panelCreatedEl.hidden = false;
    modalTabsEl.hidden = true;

    const address = account?.namespace
        ? `${account.namespace}.${tag}@inbox.testmail.app`
        : tag;
    createdAddressText.textContent = address;
    copyFeedback.textContent = "";
}

copyAddressBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(createdAddressText.textContent);
        copyFeedback.textContent = "Copied!";
        setTimeout(() => {
            copyFeedback.textContent = "";
        }, 1500);
    } catch (err) {
        copyFeedback.textContent = "Couldn't copy — select and copy manually.";
    }
});
// =========================================================================
// "demo" tag address popup
//
// Dismiss policy differs from the New Tag modal on purpose: this one closes
// only via its close button — no backdrop click, no Esc.
// =========================================================================

const DEMO_TAG = "demo";

let lastFocusedBeforeDemoModal = null;

function demoAddress() {
    return account?.namespace
        ? `${account.namespace}.${DEMO_TAG}@inbox.testmail.app`
        : "";
}

function openDemoModal() {
    lastFocusedBeforeDemoModal = document.activeElement;

    const address = demoAddress();
    demoAddressText.textContent =
        address || "Add an account in Profile first.";
    demoCopyBtn.disabled = !address;
    demoCopyFeedback.textContent = "";

    demoModalBackdrop.hidden = false;
    demoModalCloseBtn.focus();
}

function closeDemoModal() {
    demoModalBackdrop.hidden = true;
    demoCopyFeedback.textContent = "";
    if (lastFocusedBeforeDemoModal) lastFocusedBeforeDemoModal.focus();
}

if (!demoTagBtn || !demoModalBackdrop) {
    // Stale inbox.html (markup missing) — skip wiring rather than throwing,
    // which would kill every listener registered after this point.
    console.warn("Demo address popup markup not found — skipping setup.");
} else {
    demoTagBtn.addEventListener("click", openDemoModal);
    demoModalCloseBtn.addEventListener("click", closeDemoModal);

    demoCopyBtn.addEventListener("click", async () => {
        const address = demoAddress();
        if (!address) return;

        try {
            await navigator.clipboard.writeText(address);
            demoCopyFeedback.textContent = "Copied!";
            setTimeout(() => {
                demoCopyFeedback.textContent = "";
            }, 1500);
        } catch (err) {
            demoCopyFeedback.textContent =
                "Couldn't copy — select and copy manually.";
        }
    });
}