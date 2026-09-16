// home.js — core inbox page.

import { auth, db, rtdb } from "./firebase-config.js";
import { requireAuth } from "./modules/auth-guard.js";
import { debounce, escapeHtml, formatRelativeTime } from "./modules/utils.js";
import { fetchInbox } from "./modules/testmail-api.js";
import { computeNextSequelTag, normalizeCustomTag } from "./modules/tag-generator.js";
import {
    doc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
    ref,
    get,
    set,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const MESSAGE_LIMIT = 40;
const SEARCH_DEBOUNCE_MS = 180;

// ---- DOM refs --------------------------------------------------------------

const newTagBtn = document.getElementById("new-tag-btn");
const demoTagBtn = document.getElementById("demo-tag-btn");
const refreshBtn = document.getElementById("refresh-btn");
const refreshIcon = document.getElementById("refresh-icon");
const searchInput = document.getElementById("search-input");

const banner = document.getElementById("inbox-banner");

const inboxEl = document.querySelector(".inbox");
const messageListEl = document.getElementById("message-list");
const inboxEmptyEl = document.getElementById("inbox-empty");
const inboxEmptyTextEl = document.getElementById("inbox-empty-text");

const readerEmptyEl = document.getElementById("reader-empty");
const readerContentEl = document.getElementById("reader-content");
const readerSubjectEl = document.getElementById("reader-subject");
const readerFromEl = document.getElementById("reader-from");
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
let profile = { name: "", api: "", namespace: "" };
let allMessages = []; // last fetch, up to 40, newest-first
let filteredIndices = []; // indices into allMessages currently shown
let selectedIndex = null; // index into allMessages
let isFetching = false;
let lastFocusedBeforeModal = null;
let existingCustomTags = new Set();

// ---- Auth guard + bootstrap ------------------------------------------------

requireAuth(async (user) => {
    uid = user.uid;
    await loadProfile();
    applyFilter(searchInput.value);
});

async function loadProfile() {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            const data = snap.data();
            profile = {
                name: data.name || "",
                api: data.api || "",
                namespace: data.namespace || "",
            };
        }
    } catch (err) {
        showBanner("Couldn't load your profile — try refreshing the page.");
    }

    if (!profile.api || !profile.namespace) {
        showBanner("Add your testmail.app API key and namespace in Profile before refreshing.");
        refreshBtn.disabled = true;
    }
}

function showBanner(message) {
    banner.textContent = message;
    banner.hidden = false;
}

function hideBanner() {
    banner.hidden = true;
    banner.textContent = "";
}

// ---- Refresh / fetch --------------------------------------------------

refreshBtn.addEventListener("click", () => {
    refreshInbox();
});

async function refreshInbox() {
    if (isFetching || !profile.api || !profile.namespace) return;

    isFetching = true;
    refreshBtn.disabled = true;
    refreshIcon.classList.add("spin");
    hideBanner();

    try {
        const emails = await fetchInbox({
            apiKey: profile.api,
            namespace: profile.namespace,
            limit: MESSAGE_LIMIT,
        });
        allMessages = emails;
        selectedIndex = null;
        renderReaderEmpty();
        applyFilter(searchInput.value);
    } catch (err) {
        showBanner(err.message);
    } finally {
        isFetching = false;
        refreshBtn.disabled = false;
        refreshIcon.classList.remove("spin");
    }
}

function updateInboxEmptyText() {
    inboxEmptyTextEl.textContent =
        allMessages.length === 0
            ? "No messages yet — hit refresh to check your inbox."
            : "No messages match your search.";
}

// ---- Rendering: message list --------------------------------------------

function applyFilter(query) {
    const q = query.trim().toLowerCase();
    filteredIndices = allMessages
        .map((_, i) => i)
        .filter((i) => {
            if (!q) return true;
            const msg = allMessages[i];
            return (
                (msg.tag || "").toLowerCase().includes(q) ||
                (msg.subject || "").toLowerCase().includes(q)
            );
        });

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

function renderMessageList() {
    messageListEl.innerHTML = "";

    const hasResults = filteredIndices.length > 0;
    inboxEmptyEl.classList.toggle("is-visible", !hasResults);
    messageListEl.hidden = !hasResults;

    for (const i of filteredIndices) {
        const msg = allMessages[i];
        const li = document.createElement("li");
        li.innerHTML = `
      <button type="button" class="message-row${i === selectedIndex ? " is-selected" : ""}" data-index="${i}">
        <div class="message-row__top">
          <span class="message-row__tag">${escapeHtml(msg.tag || "")}</span>
          <span class="message-row__time">${escapeHtml(formatRelativeTime(msg.timestamp))}</span>
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

// ---- Rendering: reader pane ----------------------------------------------

function selectMessage(index) {
    selectedIndex = index;
    renderMessageList();
    renderReaderContent(allMessages[index]);
    inboxEl.classList.add("is-reading"); // mobile: swap to reader pane
}

function renderReaderEmpty() {
    readerEmptyEl.hidden = false;
    readerContentEl.hidden = true;
    inboxEl.classList.remove("is-reading");
}

function renderReaderContent(msg) {
    readerEmptyEl.hidden = true;
    readerContentEl.hidden = false;

    readerSubjectEl.textContent = msg.subject || "(no subject)";
    readerFromEl.textContent = msg.from || "";
    readerTagEl.textContent = msg.tag || "";
    readerTimestampEl.textContent = new Date(msg.timestamp).toLocaleString();

    readerIframeEl.srcdoc = msg.html || "";
    readerTextEl.textContent = msg.text || "";

    const hasHtml = Boolean(msg.html);
    setReaderView(hasHtml ? "html" : "text");
    viewHtmlBtn.disabled = !hasHtml;
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

// Mobile: tapping back out of the reader pane returns to the list. We reuse
// the profile link area minimally — simplest is a swipe-free back via list
// pane always being reachable through browser back is out of scope; instead
// clicking the (already visible) top bar search/new-tag areas is unaffected
// since .is-reading only hides panes below the top bar.

// =========================================================================
// New Tag modal
// =========================================================================

function openModal() {
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
        const snap = await get(ref(rtdb, `${uid}/tags/custom`));
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
        await set(ref(rtdb, `${uid}/tags/custom/${Date.now()}`), result.tag);
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
        const snap = await get(ref(rtdb, `${uid}/tags/sequel/last`));
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
        await set(ref(rtdb, `${uid}/tags/sequel/last`), sequelNextPreview);
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

    const address = profile.namespace
        ? `${profile.namespace}.${tag}@inbox.testmail.app`
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
    return profile.namespace
        ? `${profile.namespace}.${DEMO_TAG}@inbox.testmail.app`
        : "";
}

function openDemoModal() {
    lastFocusedBeforeDemoModal = document.activeElement;

    const address = demoAddress();
    demoAddressText.textContent =
        address || "Add your namespace in Profile first.";
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
    // Stale home.html (markup missing) — skip wiring rather than throwing,
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