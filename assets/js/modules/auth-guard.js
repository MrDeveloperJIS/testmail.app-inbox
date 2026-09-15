// modules/auth-guard.js
// Shared "redirect if not signed in" (and inverse) helper.
// Centralizes onAuthStateChanged boilerplate used by home.js, profile.js
// (requireAuth) and auth.js (redirectIfSignedIn).

import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

/**
 * Calls onSignedIn(user) once a signed-in user is confirmed.
 * Redirects to auth.html if no user is signed in.
 * @param {(user: import("firebase/auth").User) => void} onSignedIn
 * @returns {() => void} unsubscribe function
 */
export function requireAuth(onSignedIn) {
    return onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "auth.html";
        } else {
            onSignedIn(user);
        }
    });
}

/**
 * Redirects away from a signed-out-only page (e.g. auth.html) if a user
 * is already signed in.
 * @param {string} destination
 * @returns {() => void} unsubscribe function
 */
export function redirectIfSignedIn(destination = "home.html") {
    return onAuthStateChanged(auth, (user) => {
        if (user) window.location.href = destination;
    });
}
