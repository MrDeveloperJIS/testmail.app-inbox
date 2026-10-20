// profile.js — profile page.

import { auth, db, rtdb } from "./firebase-config.js";
import { requireAuth } from "./modules/auth-guard.js";
import { maskApiKey } from "./modules/utils.js";
import { sequelToIndex } from "./modules/tag-generator.js";
import {
    doc,
    getDoc,
    setDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ---- DOM refs --------------------------------------------------------------

const editBtn = document.getElementById("edit-btn");
const editActions = document.getElementById("edit-actions");
const cancelBtn = document.getElementById("cancel-btn");
const saveBtn = document.getElementById("save-btn");
const errorBox = document.getElementById("profile-error");
const form = document.getElementById("profile-form");

const fields = {
    name: {
        wrapper: document.querySelector('[id="name-value"]').closest(".profile-field"),
        value: document.getElementById("name-value"),
        input: document.getElementById("name-input"),
    },
    api: {
        wrapper: document.querySelector('[id="api-value"]').closest(".profile-field"),
        value: document.getElementById("api-value"),
        input: document.getElementById("api-input"),
    },
    namespace: {
        wrapper: document.querySelector('[id="namespace-value"]').closest(".profile-field"),
        value: document.getElementById("namespace-value"),
        input: document.getElementById("namespace-input"),
    },
};

const sequelCountEl = document.getElementById("sequel-count");
const customTagsListEl = document.getElementById("custom-tags-list");
const customTagsEmptyEl = document.getElementById("custom-tags-empty");
const signOutBtn = document.getElementById("sign-out-btn");

// ---- State -------------------------------------------------------------

let uid = null;
let profile = { name: "", api: "", namespace: "" };

// ---- Auth guard + bootstrap ------------------------------------------------

requireAuth(async (user) => {
    uid = user.uid;
    await loadProfile();
    await loadOverview();
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
        showError("Couldn't load your profile — try refreshing the page.");
    }
    renderDisplayValues();
}

function renderDisplayValues() {
    fields.name.value.textContent = profile.name || "—";
    fields.api.value.textContent = profile.api ? maskApiKey(profile.api) : "—";
    fields.namespace.value.textContent = profile.namespace || "—";

    fields.name.input.value = profile.name;
    fields.api.input.value = profile.api;
    fields.namespace.input.value = profile.namespace;
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
}

// ---- Edit / Save / Cancel -------------------------------------------------

function setEditing(isEditing) {
    editBtn.hidden = isEditing;
    editActions.hidden = !isEditing;
    Object.values(fields).forEach(({ wrapper }) => {
        wrapper.classList.toggle("is-editing", isEditing);
    });
}

editBtn.addEventListener("click", () => {
    hideError();
    setEditing(true);
    fields.name.input.focus();
});

cancelBtn.addEventListener("click", () => {
    hideError();
    renderDisplayValues(); // discard any typed changes
    setEditing(false);
});

saveBtn.addEventListener("click", async () => {
    hideError();

    const updated = {
        name: fields.name.input.value.trim(),
        api: fields.api.input.value.trim(),
        namespace: fields.namespace.input.value.trim(),
    };

    saveBtn.disabled = true;
    try {
        await setDoc(doc(db, "users", uid), updated);
        profile = updated;
        renderDisplayValues();
        setEditing(false);
    } catch (err) {
        showError("Couldn't save your changes — try again.");
    } finally {
        saveBtn.disabled = false;
    }
});

// ---- Overview: sequel count + custom tags list -----------------------------

async function loadOverview() {
    await Promise.all([loadSequelCount(), loadCustomTags()]);
}

async function loadSequelCount() {
    try {
        const snap = await get(ref(rtdb, `${uid}/tags/sequel/last`));
        const last = snap.exists() ? snap.val() : null;
        sequelCountEl.textContent = last ? String(sequelToIndex(last) + 1) : "0";
    } catch (err) {
        sequelCountEl.textContent = "—";
    }
}

async function loadCustomTags() {
    try {
        const snap = await get(ref(rtdb, `${uid}/tags/custom`));
        if (!snap.exists()) {
            renderCustomTags([]);
            return;
        }
        const entries = snap.val(); // { "<timestamp>": "tagname", ... }
        // Object keys are same-length millisecond timestamps, so a plain sort
        // gives chronological order for free; show most recently created first.
        const tags = Object.keys(entries)
            .sort()
            .reverse()
            .map((key) => entries[key]);
        renderCustomTags(tags);
    } catch (err) {
        renderCustomTags([]);
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