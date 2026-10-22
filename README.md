# testmail.app Inbox

A small, personal-use static web app for reading mail from your
[testmail.app](https://testmail.app) namespace in a clean, minimal inbox —
no build step, no framework, just HTML/CSS/JS hosted on GitHub Pages.

## Features

- **Sign-in only** — single email/password form (Firebase Auth). No public
  sign-up; the one account is created manually in the Firebase console.
- **Inbox** — fetches your latest 40 messages from the testmail.app JSON API.
  One automatic fetch runs 5 seconds after the page loads (never repeated),
  then it's the manual refresh button only — no polling. **Load more** pulls
  the next 40 using the API's `offset`. Two-pane layout: message list on the
  left, sandboxed message view (HTML or plain-text toggle) on the right; on
  phones it shows one pane at a time with a back button.
- **Unread state** — unopened messages are bold with a dot. Each fetched message
  gets an entry in Realtime Database
  (`{uid}/accounts/{accountId}/messages/{id}` with a `received` timestamp, plus
  a `read` timestamp once opened). A message with a `read` timestamp is read,
  so the state syncs across devices (loaded on page open and on refresh), with
  a `localStorage` copy as an offline cache. Entries are deleted 72 hours after
  they were received, matching testmail.app's 3-day retention.
- **Relative times** — "Xm ago" labels update on the client every 30 seconds,
  with no refetch.
- **Search** — instant client-side filter over the loaded messages by tag,
  subject, sender or body text (all words must match). Use **Load more** to
  include older mail.
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
2. Deploy the Firestore and RTDB security rules from
   [Security rules](#security-rules) below, which scope everything to
   `request.auth.uid`.
3. Create your one user account manually via the Firebase console (there's
   no sign-up UI).
4. Add `your-username.github.io` to Firebase Auth's authorized domains
   (Authentication → Settings → Authorized domains), or sign-in will fail
   once deployed even though it works locally.
5. Sign in and add your testmail.app account(s) from the Profile page.
6. Serve the repo root as static files (e.g. GitHub Pages).

## Security rules

**Firestore** (profile document `users/{uid}`):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

**Realtime Database** (tags at `{uid}/accounts/{accountId}/tags/...`, message state at
`{uid}/accounts/{accountId}/messages/...`):

```json
{
  "rules": {
    "$uid": {
      ".read": "auth != null && auth.uid === $uid",
      ".write": "auth != null && auth.uid === $uid"
    }
  }
}
```

Optionally, also restrict the Firebase web API key in Google Cloud Console
(APIs & Services → Credentials) to the HTTP referrer
`https://your-username.github.io/*`, so other sites can't use your project's quota.

## Notes

- The Firebase web config in `firebase-config.js` is not a secret — it
  identifies the project, it doesn't authorize access. Security comes from
  the Firestore/RTDB rules, not from hiding this file.

See [CHANGELOG](./CHANGELOG.md) for version history.