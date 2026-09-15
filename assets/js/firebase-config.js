// firebase-config.js
// Firebase init — exports app/auth/db/rtdb for the 4 page scripts to import.
//
// GitHub Pages serves plain static files, so we use the Firebase modular
// CDN URLs as ES module imports directly here — no bundler needed.
//
// Note: these config values are not secret (they identify the project, not
// authorize access) — safe to commit as-is. Security comes entirely from
// the Firestore/RTDB rules, not from hiding this config.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBr0LA7l3Lmy1V2AYYsNqxZ32waZ0a1E80",
    authDomain: "testmail-app-inbox.firebaseapp.com",
    databaseURL: "https://testmail-app-inbox-default-rtdb.firebaseio.com",
    projectId: "testmail-app-inbox",
    storageBucket: "testmail-app-inbox.firebasestorage.app",
    messagingSenderId: "210814906804",
    appId: "1:210814906804:web:7231636d400357450902e1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
