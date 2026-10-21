// profile.js — profile page: name, multiple testmail accounts, per-account overview.

import { auth, db, rtdb } from "./firebase-config.js";
import { requireAuth } from "./modules/auth-guard.js";
import { maskApiKey } from "./modules/utils.js";
import { sequelToIndex } from "./modules/tag-generator.js";
import {
    normalizeProfile,
    getActiveAccount,
    accountName,
    nextAccountId,
    MAX_ACCOUNTS,
    tagsPath,
    toDoc,
} from "./modules/accounts.js";
import {
    doc,
    getDoc,
    setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { ref, get, remove } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ---- DOM refs --------------------------------------------------------------

const editBtn = document.getElementById("edit-btn");
const editActions = document.getElementById("edit-actions");
const cancelBtn = document.getElementById("cancel-btn");
const saveBtn = document.getElementById("save-btn");
const errorBox = document.getElementById("profile-error");

const nameWrapper = document.getElementById("name-value").closest(".profile-field");
const nameValue = document.getElementById("name-value");
const nameInput = document.getElementById("name-input");

const accountListEl = document.getElementById("account-list");
const accountEmptyEl = document.getElementById("account-empty");
const addAccountBtn = document.getElementById("add-account-btn");
const accountForm = document.getElementById("account-form");
const accountFormTitle = document.getElementById("account-form-title");
const accountLabelInput = document.getElementById("account-label-input");
const accountApiInput = document.getElementById("account-api-input");
const accountNamespaceInput = document.getElementById("account-namespace-input");
const accountFormError = document.getElementById("account-form-error");
const accountCancelBtn = document.getElementById("account-cancel-btn");
const accountSaveBtn = document.getElementById("account-save-btn");
const accountDeleteBtn = document.getElementById("account-delete-btn");

const confirmBackdrop = document.getElementById("confirm-backdrop");
const confirmTextEl = document.getElementById("confirm-text");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");

const overviewAccountEl = document.getElementById("overview-account");
const sequelCountEl = document.getElementById("sequel-count");
const customTagsListEl = document.getElementById("custom-tags-list");
const customTagsEmptyEl = document.getElementById("custom-tags-empty");
const signOutBtn = document.getElementById("sign-out-btn");

// ---- State -------------------------------------------------------------

let uid = null;
let profile = { name: "", accounts: [], activeAccountId: "", accountSeq: 0 };
let editingAccountId = null; // null = adding a new account

// ---- Auth guard + bootstrap ------------------------------------------------

requireAuth(async (user) => {
    uid = user.uid;
    await loadProfile();
    await loadOverview();
});

async function loadProfile() {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) profile = normalizeProfile(snap.data());
    } catch (err) {
        showError("Couldn't load your profile — try refreshing the page.");
    }
    renderName();
    renderAccounts();
}

/** Writes the whole profile doc. Throws on failure. */
async function persist(next) {
    await setDoc(doc(db, "users", uid), toDoc(next));
    profile = next;
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
}

// ---- Name: edit / save / cancel ---------------------------------------------

function renderName() {
    nameValue.textContent = profile.name || "—";
    nameInput.value = profile.name;
}

function setEditing(isEditing) {
    editBtn.hidden = isEditing;
    editActions.hidden = !isEditing;
    nameWrapper.classList.toggle("is-editing", isEditing);
}

editBtn.addEventListener("click", () => {
    hideError();
    setEditing(true);
    nameInput.focus();
});

cancelBtn.addEventListener("click", () => {
    hideError();
    renderName();
    setEditing(false);
});

saveBtn.addEventListener("click", async () => {
    hideError();
    saveBtn.disabled = true;
    try {
        await persist({ ...profile, name: nameInput.value.trim() });
        renderName();
        setEditing(false);
    } catch (err) {
        showError("Couldn't save your changes — try again.");
    } finally {
        saveBtn.disabled = false;
    }
});

// ---- Accounts: list ---------------------------------------------------------

function renderAccounts() {
    accountListEl.innerHTML = "";
    const has = profile.accounts.length > 0;
    accountListEl.hidden = !has;
    accountEmptyEl.hidden = has || !accountForm.hidden;

    for (const account of profile.accounts) {
        const isActive = account.id === profile.activeAccountId;

        const li = document.createElement("li");
        li.className = "account-item" + (isActive ? " is-active" : "");

        const select = document.createElement("button");
        select.type = "button";
        select.className = "account-item__select";
        select.dataset.action = "select";
        select.dataset.id = account.id;
        select.setAttribute("aria-pressed", String(isActive));

        const dot = document.createElement("span");
        dot.className = "account-item__dot";
        dot.setAttribute("aria-hidden", "true");

        const text = document.createElement("span");
        text.className = "account-item__text";

        const title = document.createElement("span");
        title.className = "account-item__title";
        title.textContent = accountName(account);

        const meta = document.createElement("span");
        meta.className = "account-item__meta";
        meta.textContent = `${account.namespace} · ${maskApiKey(account.api)}`;

        text.append(title, meta);
        select.append(dot, text);

        const actions = document.createElement("div");
        actions.className = "account-item__actions";
        actions.append(
            iconButton("edit", account.id, "Edit account", "assets/img/icons/edit.svg")
        );

        li.append(select, actions);
        accountListEl.appendChild(li);
    }
}

function iconButton(action, id, label, src) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--icon";
    btn.dataset.action = action;
    btn.dataset.id = id;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    const img = document.createElement("img");
    img.className = "icon";
    img.src = src;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    btn.appendChild(img);
    return btn;
}

accountListEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "select") selectAccount(id);
    if (action === "edit") openAccountForm(id);
});

async function selectAccount(id) {
    if (id === profile.activeAccountId) return;
    hideError();
    const previous = profile;
    try {
        await persist({ ...profile, activeAccountId: id });
        renderAccounts();
        await loadOverview();
    } catch (err) {
        profile = previous;
        showError("Couldn't switch account — try again.");
    }
}

// ---- Delete confirmation popup ----------------------------------------------

let lastFocusedBeforeConfirm = null;

function openConfirm(account) {
    lastFocusedBeforeConfirm = document.activeElement;
    confirmTextEl.textContent =
        `"${accountName(account)}" and its saved tags will be removed. This can't be undone.`;
    confirmBackdrop.hidden = false;
    confirmCancelBtn.focus();
}

function closeConfirm() {
    confirmBackdrop.hidden = true;
    confirmDeleteBtn.disabled = false;
    if (lastFocusedBeforeConfirm) lastFocusedBeforeConfirm.focus();
}

confirmCancelBtn.addEventListener("click", closeConfirm);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !confirmBackdrop.hidden) closeConfirm();
});

accountDeleteBtn.addEventListener("click", () => {
    const account = profile.accounts.find((a) => a.id === editingAccountId);
    if (account) openConfirm(account);
});

confirmDeleteBtn.addEventListener("click", async () => {
    confirmDeleteBtn.disabled = true;
    const ok = await deleteAccount(editingAccountId);
    closeConfirm();
    if (!ok) showError("Couldn't delete the account — try again.");
});

/** @returns {Promise<boolean>} whether the account was deleted */
async function deleteAccount(id) {
    const account = profile.accounts.find((a) => a.id === id);
    if (!account) return false;

    hideError();
    const accounts = profile.accounts.filter((a) => a.id !== id);
    const activeAccountId =
        profile.activeAccountId === id ? accounts[0]?.id || "" : profile.activeAccountId;

    try {
        await persist({ ...profile, accounts, activeAccountId });
        // Best-effort cleanup of this account's tag data.
        remove(ref(rtdb, `${uid}/accounts/${id}`)).catch(() => { });
        closeAccountForm();
        renderAccounts();
        await loadOverview();
        return true;
    } catch (err) {
        return false;
    }
}

// ---- Accounts: add / edit form ----------------------------------------------

function openAccountForm(id = null) {
    hideError();
    editingAccountId = id;
    const account = id ? profile.accounts.find((a) => a.id === id) : null;

    accountFormTitle.textContent = account ? "Edit account" : "New account";
    accountDeleteBtn.hidden = !account; // delete only exists when editing
    accountLabelInput.value = account?.label || "";
    accountApiInput.value = account?.api || "";
    accountNamespaceInput.value = account?.namespace || "";
    accountFormError.hidden = true;
    accountFormError.textContent = "";

    accountForm.hidden = false;
    accountEmptyEl.hidden = true;
    accountLabelInput.focus();
}

function closeAccountForm() {
    editingAccountId = null;
    accountForm.hidden = true;
    accountEmptyEl.hidden = profile.accounts.length > 0;
}

addAccountBtn.addEventListener("click", () => openAccountForm(null));
accountCancelBtn.addEventListener("click", closeAccountForm);

accountForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const label = accountLabelInput.value.trim();
    const api = accountApiInput.value.trim();
    const namespace = accountNamespaceInput.value.trim();

    if (!api || !namespace) {
        accountFormError.textContent = "API key and namespace are required.";
        accountFormError.hidden = false;
        return;
    }

    let accounts;
    let activeAccountId = profile.activeAccountId;
    let accountSeq = profile.accountSeq;

    if (editingAccountId) {
        accounts = profile.accounts.map((a) =>
            a.id === editingAccountId ? { ...a, label, api, namespace } : a
        );
    } else {
        const next = nextAccountId(profile);
        if (!next) {
            accountFormError.textContent = `Account limit reached (${MAX_ACCOUNTS}).`;
            accountFormError.hidden = false;
            return;
        }
        accountSeq = next.accountSeq;
        const created = { id: next.id, label, api, namespace };
        accounts = [...profile.accounts, created];
        if (!activeAccountId) activeAccountId = created.id; // first account auto-selected
    }

    accountSaveBtn.disabled = true;
    try {
        await persist({ ...profile, accounts, activeAccountId, accountSeq });
        closeAccountForm();
        renderAccounts();
        await loadOverview();
    } catch (err) {
        accountFormError.textContent = "Couldn't save the account — try again.";
        accountFormError.hidden = false;
    } finally {
        accountSaveBtn.disabled = false;
    }
});

// ---- Overview: sequel count + custom tags list (active account) -------------

async function loadOverview() {
    const account = getActiveAccount(profile);
    overviewAccountEl.textContent = account ? accountName(account) : "";

    if (!account) {
        sequelCountEl.textContent = "0";
        renderCustomTags([]);
        return;
    }

    const base = tagsPath(uid, account.id);
    await Promise.all([loadSequelCount(base, account.id), loadCustomTags(base, account.id)]);
}

// Guards against a slow response for a previously selected account
// overwriting the overview of the one selected now.
const isStale = (accountId) => accountId !== profile.activeAccountId;

async function loadSequelCount(base, accountId) {
    try {
        const snap = await get(ref(rtdb, `${base}/sequel/last`));
        if (isStale(accountId)) return;
        const last = snap.exists() ? snap.val() : null;
        sequelCountEl.textContent = last ? String(sequelToIndex(last) + 1) : "0";
    } catch (err) {
        if (!isStale(accountId)) sequelCountEl.textContent = "—";
    }
}

async function loadCustomTags(base, accountId) {
    try {
        const snap = await get(ref(rtdb, `${base}/custom`));
        if (isStale(accountId)) return;
        if (!snap.exists()) {
            renderCustomTags([]);
            return;
        }
        const entries = snap.val(); // { "<timestamp>": "tagname", ... }
        // Keys are same-length millisecond timestamps, so a plain sort is
        // chronological; show most recently created first.
        const tags = Object.keys(entries)
            .sort()
            .reverse()
            .map((key) => entries[key]);
        renderCustomTags(tags);
    } catch (err) {
        if (!isStale(accountId)) renderCustomTags([]);
    }
}

function renderCustomTags(tags) {
    customTagsListEl.innerHTML = "";
    const hasTags = tags.length > 0;
    customTagsListEl.hidden = !hasTags;
    customTagsEmptyEl.hidden = hasTags;

    for (const tag of tags) {
        const li = document.createElement("li");
        li.className = "custom-tags__item";

        const icon = document.createElement("img");
        icon.className = "icon icon--sm";
        icon.src = "assets/img/icons/tag.svg";
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");

        const label = document.createElement("span");
        label.textContent = tag;

        li.append(icon, label);
        customTagsListEl.appendChild(li);
    }
}

// ---- Sign out --------------------------------------------------------

signOutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (err) {
        showError("Couldn't sign out — try again.");
    }
});