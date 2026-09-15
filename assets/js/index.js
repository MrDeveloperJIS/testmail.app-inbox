// index.js — landing page, auth-state router.
// No Firestore/RTDB reads here — auth state alone is enough to route.

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const getStartedBtn = document.getElementById("get-started");
const getStartedLabel = document.getElementById("get-started-label");

let destination = null;

onAuthStateChanged(auth, (user) => {
    destination = user ? "home.html" : "auth.html";
    getStartedLabel.textContent = "Get started";
    getStartedBtn.disabled = false;
});

getStartedBtn.addEventListener("click", () => {
    if (!destination) return;
    window.location.href = destination;
});