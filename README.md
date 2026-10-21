# testmail.app Inbox

A small, personal-use static web app for reading mail from your
[testmail.app](https://testmail.app) namespace in a clean, minimal inbox —
no build step, no framework, just HTML/CSS/JS hosted on GitHub Pages.

## Features

- **Sign-in only** — single email/password form (Firebase Auth). No public
  sign-up; the one account is created manually in the Firebase console.
- **Inbox** — fetches your latest 40 messages from the testmail.app JSON API
  on demand (manual refresh button, no polling). Two-pane layout: message
  list on the left, sandboxed message view (HTML or plain-text toggle) on
  the right.
- **Search** — instant client-side filter over the fetched messages by tag
  or subject.
- **Tags** — generate addressable inbox tags two ways:
  - *Custom* — your own text, validated and saved.
  - *Sequel* — auto-incrementing `AAA00`-style tags, previewed before
    you confirm creation.
- **Multiple accounts** — add several API key + namespace accounts on the
  profile page and pick the active one; the inbox and tags follow it.
- **Profile** — edit your name, manage accounts (API keys masked), and see
  the active account's custom tag history and sequel count.
- **Dark theme only**, no toggle or light-mode branch.

## Tech stack

- Plain HTML/CSS/JS, ES modules, no bundler or framework.
- **Firebase** (Spark/free plan): Auth (email/password), Firestore (profile
  storage), Realtime Database (tag storage).
- **testmail.app JSON API**, called directly from the browser.
- Hosted as static files on **GitHub Pages**.

Messages themselves are never stored in Firebase — always fetched live.

## Project structure

```
testmail.app-inbox/
│
├── index.html
├── auth.html
├── inbox.html
├── profile.html
└── assets/
    ├── css/
    │   ├── base.css              # design tokens
    │   ├── index.css
    │   ├── auth.css
    │   ├── inbox.css
    │   └── profile.css
    ├── js/
    │   ├── firebase-config.js    # firebase init
    │   ├── index.js
    │   ├── auth.js
    │   ├── inbox.js
    │   ├── profile.js
    │   └── modules/
    │       ├── testmail-api.js   # testmail.app fetch wrapper
    │       ├── tag-generator.js  # sequel tag generation/rollover
    │       ├── auth-guard.js     # redirect-if-signed-(in|out) helper
    │       ├── accounts.js       # multi-account profile helpers + per-account tag paths
    │       └── utils.js          # debounce, escapeHtml, date formatting, masking
    └── img/icons/                # hand-rolled SVGs, referenced directly (no sprite)
```

## Setup

1. Create a Firebase project (Spark plan is enough) with **Auth**
   (email/password provider), **Firestore**, and **Realtime Database**
   enabled, and drop your config into `assets/js/firebase-config.js`.
2. Deploy the Firestore and RTDB security rules that scope everything to
   `request.auth.uid`.
3. Create your one user account manually via the Firebase console (there's
   no sign-up UI).
4. Add your `*.github.io` domain to Firebase Auth's authorized domains, or
   sign-in will fail once deployed even though it works locally.
5. Sign in and add your testmail.app account(s) from the Profile page.
6. Serve the repo root as static files (e.g. GitHub Pages).

## Notes

- The Firebase web config in `firebase-config.js` is not a secret — it
  identifies the project, it doesn't authorize access. Security comes from
  the Firestore/RTDB rules, not from hiding this file.
- `.private/guideline.md` holds the original build/design notes for this
  project (data model, API details, phase-by-phase plan). It's kept out of
  the deployed site via `.gitignore` and is reference material at this
  point rather than a live spec — see `CHANGELOG.md` for where the app has
  since diverged from it.

See [CHANGELOG](./CHANGELOG.md) for version history.