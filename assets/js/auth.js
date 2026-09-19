// auth.js — sign-in page logic.

import { auth } from "./firebase-config.js";
import { redirectIfSignedIn } from "./modules/auth-guard.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// If already signed in (e.g. via back button), skip straight to inbox.html.
redirectIfSignedIn("inbox.html");

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorBox = document.getElementById("auth-error");
const submitBtn = document.getElementById("submit-btn");
const submitLabel = document.getElementById("submit-label");
const togglePasswordBtn = document.getElementById("toggle-password");
const eyeIcon = document.getElementById("icon-eye");
const eyeOffIcon = document.getElementById("icon-eye-off");

// --- Password show/hide toggle -------------------------------------------

let passwordVisible = false;

togglePasswordBtn.addEventListener("click", () => {
    passwordVisible = !passwordVisible;
    passwordInput.type = passwordVisible ? "text" : "password";
    eyeIcon.hidden = passwordVisible;
    eyeOffIcon.hidden = !passwordVisible;
    togglePasswordBtn.setAttribute("aria-pressed", String(passwordVisible));
    togglePasswordBtn.setAttribute(
        "aria-label",
        passwordVisible ? "Hide password" : "Show password"
    );
});

// --- Firebase error code -> short human text ------------------------------

const ERROR_MESSAGES = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts — try again in a bit.",
    "auth/network-request-failed": "Network error — check your connection.",
};

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
}

function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitLabel.textContent = isSubmitting ? "Signing in…" : "Sign in";
}

// --- Form submit -----------------------------------------------------------

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showError("Enter your email and password.");
        return;
    }

    setSubmitting(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "inbox.html";
    } catch (err) {
        const message = ERROR_MESSAGES[err.code] || "Couldn't sign in — try again.";
        showError(message);
        setSubmitting(false);
    }
});