# testmail.app Inbox — Project Guideline

Personal-use static web app that reads mail from the testmail.app JSON API,
hosted on GitHub Pages (HTML/CSS/JS only), using Firebase (Spark/free plan)
for Auth, Firestore, and Realtime Database (RTDB).

Verified before writing this doc:
- Browser → `https://api.testmail.app/api/json` works directly (CORS OK) — confirmed by you.
- You're on the testmail.app **Essential** plan (free via GitHub Student
  Developer Pack): unlimited emails/month, 3-day retention, 1 (random)
  namespace. This is better than the base Free tier (100 emails/month, 1-day
  retention) — no functional change to the app, just more headroom and a
  longer window before old test emails disappear.
- API key rate limit on **paid** plans (Essential counts as paid here):
  throttling only kicks in above **>5 requests/second sustained for an hour
  or more**. Manual-refresh-only (your decision) keeps you nowhere near
  this regardless of plan.
- JSON API is GET-only, query-param auth (`apikey`, `namespace`), max
  `limit=100`, default `limit=10`, sorted newest-first by default.

---

## 1. Tech decisions (locked in)

| Area | Decision |
|---|---|
| Hosting | GitHub Pages, static files only |
| Auth | Firebase Auth — email/password only, no sign-up UI, no password reset UI (account created manually via Firebase console) |
| Mail source | testmail.app JSON API, called directly from the browser with the user's own API key |
| Storage (tags) | Firebase RTDB, scoped per uid |
| Storage (profile) | Firestore, scoped per uid |
| Message storage | None — always fetched live, never cached in Firebase |
| Refresh | Manual button only (no polling/auto-refresh) |
| Message count | Latest 40 per fetch (`limit=40`) |
| Styling | `base.css` root variables, consumed by 4 page-specific CSS files |
| Color palette | `#f0f8ff` (near-white/alice-blue) + `#0c0c0c` (near-black) + greyscale shades only |
| Icons | Hand-rolled SVGs in `assets/img/icons/`, no icon library |

---

## 2. Folder structure

```
testmail.app-inbox/ (repo root — served by gh-pages)
│
├── index.html
├── auth.html
├── home.html
├── profile.html
│
└── assets/
    ├── css/
    │   ├── base.css          # :root variables, resets, shared utility classes
    │   ├── index.css
    │   ├── auth.css
    │   ├── home.css
    │   └── profile.css
    │
    ├── js/
    │   ├── firebase-config.js   # Firebase init, exports app/auth/db/rtdb
    │   ├── index.js
    │   ├── auth.js
    │   ├── home.js
    │   ├── profile.js
    │   └── modules/
    │       ├── testmail-api.js  # fetch wrapper for testmail.app JSON API
    │       ├── tag-generator.js # sequel tag generation/rollover logic
    │       ├── auth-guard.js    # shared "redirect if not signed in" helper
    │       └── utils.js         # debounce, escapeHtml, date formatting, etc.
    │
    └── img/
        └── icons/
            ├── icons.svg     # single <symbol> sprite (preferred, see §7)
            ├── add.svg
            ├── refresh.svg
            ├── search.svg
            ├── edit.svg
            ├── save.svg
            ├── cancel.svg
            ├── sign-out.svg
            ├── eye.svg
            ├── eye-off.svg
            ├── close.svg
            ├── chevron-down.svg
            ├── chevron-left.svg
            ├── mail.svg
            ├── tag.svg
            └── copy.svg
```

Each `.svg` file also gets baked into `icons.svg` as a `<symbol>` for sprite
use (§7). Keep the individual files as the source of truth; the sprite is
generated/copied from them.

---

## 3. Data model

### 3.1 Firestore — `users/{uid}`

```json
{
  "name": "Your Name",
  "api": "your-testmail-api-key",
  "namespace": "your-namespace"
}
```

- One document per user, doc ID = `uid`.
- Only `profile.js` reads/writes this. `home.js` also reads `api` + `namespace`
  from here (needed to call testmail.app) — do **not** duplicate them into RTDB.

**Firestore security rules:**

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

No other collection exists. Everything else is denied by default (no
catch-all rule).

### 3.2 Realtime Database — `/{uid}/tags/`

```json
{
  "uid_abc123": {
    "tags": {
      "custom": {
        "1699999999999": "invoice",
        "1700000012345": "newsletter"
      },
      "sequel": {
        "last": "AAA07"
      }
    }
  }
}
```

- `custom/{timestamp}`: key is `Date.now()` (milliseconds since epoch, as a
  string key) at creation time → value is the tag name string. This acts as
  your "array" — object keys sort lexicographically, and since all keys are
  same-length millisecond timestamps, iterating `Object.keys(...).sort()`
  gives chronological order for free, with no extra ordering field needed.
- `sequel/last`: single string, the last sequel tag generated. Absent on
  first run (code must default to `AAA00` before the first-ever generation,
  i.e. next-shown tag if none exists yet).

**RTDB security rules** (kept intentionally simple — no per-field
`.validate` rules; validation happens client-side in `tag-generator.js` /
the custom-tag input handler before any write is attempted):

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

### 3.3 What is never stored in Firebase

Actual email messages/bodies are never written to Firestore or RTDB — always
fetched live from testmail.app on demand (manual refresh or initial load).

---

## 4. testmail.app API usage

Endpoint: `GET https://api.testmail.app/api/json`

Called only from `home.js` (main inbox fetch) via `js/modules/testmail-api.js`.

**Standard inbox fetch:**
```
https://api.testmail.app/api/json
  ?apikey={api}
  &namespace={namespace}
  &limit=40
```

- No `pretty=true` in production calls (only useful for manual browser testing).
- No `tag` / `tag_prefix` filter server-side — search/filter for tag + subject
  happens **client-side** on the 40 fetched messages (see §6.4), since you
  want to filter across both fields simultaneously and testmail's JSON API
  can't combine tag + subject filters (that needs GraphQL, which is
  intentionally out of scope here to keep this simple).
- `&headers=true` / `&spam_report=true`: not needed, omit.

**Response shape (relevant fields on each email object):**
```json
{
  "result": "success",
  "count": 12,
  "limit": 40,
  "offset": 0,
  "emails": [
    {
      "tag": "invoice",
      "timestamp": 1699999999999,
      "from": "Sender Name <sender@example.com>",
      "subject": "Subject line",
      "text": "plain text body",
      "html": "<p>html body</p>"
    }
  ]
}
```

**Error handling in `testmail-api.js`:**
- `result: "fail"` → surface `message` field to the user in a small inline
  banner in the inbox (don't throw a raw alert()).
- Network failure / non-200 → show "Couldn't reach testmail.app — try again."
- Empty `emails` array → show empty-state illustration/text in the inbox, not
  an error.

---

## 5. Sequel tag generation logic (`tag-generator.js`)

Format: `AAA00` — 3 uppercase letters + 2 digits. Rollover rule (digits
increment fastest, then rightmost letter, then middle, then leftmost):

```
AAA00 → AAA01 → ... → AAA99 → AAB00 → AAB01 → ... → AAZ99 → ABA00 → ...
... → AZZ99 → BAA00 → ... → ZZZ99 (max, ~1.76M combinations — effectively unlimited for personal use)
```

**Algorithm:**
1. Read `sequel/last` from RTDB. If it doesn't exist, the *next* tag to
   generate is `AAA00` (and there's nothing to increment yet).
2. To generate the *next* tag from an existing `last`:
   - Split into letters `[L1, L2, L3]` and digits `DD` (parse as int).
   - If `DD < 99`: `DD += 1`.
   - Else: `DD = 0`, increment `L3` (Z → wrap to A and carry to `L2`, same
     cascading logic up to `L1`). If `L1` overflows past `Z`, the range is
     exhausted (extremely unlikely — show an error rather than silently
     wrapping).
3. Write the new value to `sequel/last` **only when the user actually
   confirms tag creation** in the popup (not just on preview/display —
   see §6.2).
4. The popup should always show a **preview** of "next tag to be generated"
   by computing it from the currently-stored `last` without writing
   anything — the write happens on confirm.

---

## 5.1 Custom tag validation

- Trim whitespace, disallow empty string.
- testmail.app tags are just the local-part after the namespace, so keep it
  DNS/email-safe: allow only `a-z0-9._-`, lowercase-normalize before saving
  (testmail tags are case-sensitive at the API level in practice, so
  normalizing avoids you accidentally creating near-duplicate tags like
  `Invoice` vs `invoice`).
- No duplicate-check against existing custom tags is required per your
  spec, but it's cheap to warn ("this tag already exists") — optional nice-to-have, not blocking.

---

## 6. Page specifications

### 6.1 `index.html` / `index.js` / `index.css`

**Purpose:** Landing page, auth-state router.

- Static marketing-style blurb: what testmail.app is, what this tool does
  (2–3 short paragraphs / feature bullets). No live data needed here.
- On load: `onAuthStateChanged` listener from `firebase-config.js`.
  - While auth state is resolving: show a lightweight skeleton/spinner on
    the "Get Started" button (avoid a flash of the wrong destination).
  - Signed in → clicking "Get Started" goes to `home.html`.
  - Signed out → clicking "Get Started" goes to `auth.html`.
- No Firestore/RTDB reads here — auth state alone is enough to route.

### 6.2 `auth.html` / `auth.js` / `auth.css`

**Purpose:** Sign-in only.

- Single form: email + password + submit button. Nothing else (no sign-up
  link, no "forgot password", no social login).
- On submit: `signInWithEmailAndPassword`.
  - Success → redirect to `home.html`.
  - Failure → inline error message under the form (wrong password, user
    not found, etc. — map Firebase error codes to short human text).
- If a signed-in user lands on `auth.html` directly (e.g. via back button),
  redirect them straight to `home.html` (auth guard, §8).
- Password field needs a show/hide toggle using `eye.svg` / `eye-off.svg`.

### 6.3 `home.html` / `home.js` / `home.css`

**Purpose:** Core inbox.

**Auth guard:** if not signed in, redirect to `auth.html` immediately.

**Top bar:**
- "New tag" button (`add.svg`) → opens popup (see below).
- Refresh button (`refresh.svg`) → manually re-fetches latest 40 messages.
  Shows a brief spinning animation on the icon while fetching, disabled
  during the in-flight request (prevent double-clicks).
- Search input (`search.svg`) → live client-side filter (§6.4).
- Link/avatar to `profile.html`.

**New Tag popup:**
- Two tabs/segments: **Custom** and **Sequel**.
  - Custom: text input + "Create" button → validates (§5.1), writes to
    `rtdb/{uid}/tags/custom/{Date.now()}`.
  - Sequel: read-only preview of "next tag" (computed per §5), "Create"
    button → generates + writes `sequel/last`.
- **On successful creation (both tabs):** the popup switches to a
  "created" state — instead of closing immediately, it shows:
  - The full generated address: `{namespace}.{tag}@inbox.testmail.app`
    (built client-side from the profile's stored `namespace` + the tag just
    created — no extra RTDB field needed for this).
  - A copy icon button (`copy.svg`) next to it — `navigator.clipboard.writeText(address)`
    on click, with a brief "Copied!" tooltip/label swap for feedback
    (revert after ~1.5s).
  - A "Done" / close affordance to dismiss the popup once copied (or the
    user can just click the backdrop/`close.svg` as usual).
- Popup closes on backdrop click, `close.svg` button, or `Esc` (at any
  state, including the "created" state above).
- Popup should not trap focus incorrectly — basic accessible modal pattern
  (return focus to the "New tag" button on close).

**Inbox (two-pane layout):**
- Left pane: scrollable list of messages, each row showing tag, subject,
  sender, relative timestamp (e.g. "3m ago"). Compact density, single-line
  truncation with ellipsis for long subjects.
- Right pane: full message view for the selected row — subject, from, tag,
  timestamp, and the body. Render `html` in a **sandboxed** way:
  - Use an `<iframe sandbox="allow-same-origin">` (no `allow-scripts`) for
    the HTML body, or sanitize with a lightweight sanitizer before
    inserting into the DOM. Since you asked for "very minimal" dependencies,
    an `<iframe sandbox>` with no script permissions is the simplest safe
    option and needs no external library.
  - Provide a toggle to view **plain text** instead of HTML per message
    (small "View as text/HTML" switch) — cheap to add, avoids broken HTML
    emails looking bad.
- Empty state (no message selected): simple placeholder ("Select a message
  to read it") — no heavy illustration needed given the minimal aesthetic.
- Empty inbox state (0 messages / 0 matches after search): short text +
  perhaps a subtle icon (`mail.svg`).

### 6.4 Search / filter behavior

- Single search input filters the **already-fetched 40 messages** in
  memory — no new API call on keystroke.
- Debounce input (~150–200ms) before filtering, to keep it snappy without
  re-rendering on every keystroke.
- Match if the search string (case-insensitive) is a substring of **either**
  the message's `tag` **or** its `subject`.
- Filtering only affects the left-pane list; if the currently-selected
  message is filtered out, clear the right-pane selection.

### 6.5 `profile.html` / `profile.js` / `profile.css`

**Auth guard:** if not signed in, redirect to `auth.html`.

**Display (read-only) state:**
- Name, API key (**always masked, no reveal option** — format
  `abc**********xyz`, i.e. first 3 and last 3 characters shown, everything
  between replaced with a fixed run of asterisks regardless of actual key
  length), Namespace.
- This masking is permanent in read-only state — there is no eye/eye-off
  toggle here (that pattern is only used on the auth page's password
  field). If you ever need the real key (e.g. to paste it elsewhere), use
  **edit mode**, where the field becomes a real editable text input showing
  the actual value (see Edit mode below) — that's the only place the full
  key is ever visible in the UI.
- "Edit" button (`edit.svg`) switches the three fields into editable inputs.
- Overview section: total count of sequel tags generated so far (i.e. how
  many times "sequel" has been incremented — this needs a **counter**, not
  just the last value; see note below) and the full list of previously
  created **custom** tags (scrollable list, read from
  `rtdb/{uid}/tags/custom`).
- Sign-out button (`sign-out.svg`) at the bottom → `signOut()` → redirect to
  `index.html`.

**Edit mode:**
- Same three fields become editable inputs, pre-filled with current values.
- "Save" (`save.svg`) → writes to `users/{uid}` in Firestore, then returns
  to display mode with updated values.
- "Cancel" (`cancel.svg`) → discards changes, returns to display mode with
  original values (no write).

> **Note on "total sequel tags generated":** the current RTDB model
> (§3.2) only stores the *last* sequel value, not a count. Since sequel tags
> increment deterministically from `AAA00`, the count **can be derived**
> from `last` alone (e.g. `AAA07` = 8th tag generated, since digits/letters
> map to a base-26/base-10 index) — no extra RTDB field needed. This
> derivation logic lives in `tag-generator.js` as a small
> `sequelToIndex(tag)` helper, reused by both `home.js` (to show "next tag")
> and `profile.js` (to show "total generated").

---

## 7. Icons

- All icons: simple 24×24 (or 20×20) outline-style SVGs, single `currentColor`
  stroke/fill so they inherit text color from CSS (no hardcoded colors inside
  the SVG files) — this keeps them themeable via the black/white/grey palette
  without duplicating assets.
- Store originals individually in `assets/img/icons/` for clarity/editing.
- Additionally combine them into one `icons.svg` sprite using `<symbol id="icon-add">…</symbol>` per icon, and reference via:
  ```html
  <svg class="icon"><use href="assets/img/icons/icons.svg#icon-add"></use></svg>
  ```
  This avoids 14 separate HTTP requests and keeps markup clean. (On
  GitHub Pages this is a static file, so caching is free — one fetch total.)
- `.icon` utility class in `base.css` controls sizing (`width`/`height`) and
  `color` (which the SVG's `currentColor` picks up).

---

## 8. Shared auth-guard pattern (`modules/auth-guard.js`)

Both `home.js` and `profile.js` need "redirect to auth.html if signed out";
`auth.js` needs the inverse. Centralize in one module:

```js
// modules/auth-guard.js
import { auth } from '../firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';

export function requireAuth(onSignedIn) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = 'auth.html';
    } else {
      onSignedIn(user);
    }
  });
}

export function redirectIfSignedIn(destination = 'home.html') {
  onAuthStateChanged(auth, (user) => {
    if (user) window.location.href = destination;
  });
}
```

This avoids duplicating `onAuthStateChanged` boilerplate across 4 page
scripts and keeps redirect logic consistent.

---

## 9. `base.css` — root variables (starting point)

```css
:root {
  /* Core palette */
  --color-bg: #f0f8ff;
  --color-fg: #0c0c0c;

  /* Greyscale shades (light → dark), derived from the two anchors */
  --grey-50:  #fbfdff;
  --grey-100: #e9eef2;
  --grey-200: #d3dade;
  --grey-300: #a9b1b6;
  --grey-400: #7a8288;
  --grey-500: #52585c;
  --grey-600: #34383b;
  --grey-700: #212426;
  --grey-800: #161819;
  --grey-900: #0c0c0c;

  /* Semantic tokens (build components against these, not raw colors) */
  --surface: var(--color-bg);
  --surface-alt: var(--grey-100);
  --border: var(--grey-200);
  --text-primary: var(--color-fg);
  --text-secondary: var(--grey-500);
  --accent: var(--grey-800); /* used sparingly for active/primary buttons */

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Radius / motion */
  --radius-sm: 6px;
  --radius-md: 10px;
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;

  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* Dark-mode-ish inversion is NOT in scope unless you want it — palette is
   deliberately single-theme (light bg, near-black text) per your spec. */

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--text-primary);
}
```

Every other CSS file (`index.css`, `auth.css`, `home.css`, `profile.css`)
only ever references `var(--...)` tokens — no new raw hex values introduced
outside `base.css`.

---

## 10. Animations (subtle, functional — not decorative-heavy)

- Buttons: `transform: scale(0.97)` + `background` transition on `:active`,
  `var(--dur-fast)`.
- Popup (new tag modal): backdrop fade-in (`opacity`), panel scale+fade from
  `0.96 → 1` over `var(--dur-base)`.
- Refresh icon: `@keyframes spin` applied only while a fetch is in-flight,
  removed on completion.
- Inbox row selection: background-color transition on click, plus a subtle
  left-border accent that grows in (`width` or `transform: scaleX`) for the
  active row.
- Page-level: a very small fade-in on initial content load (avoid layout
  shift — animate opacity only, not position).
- Edit-mode transition on profile fields: swap text ↔ input with a quick
  cross-fade rather than an abrupt DOM replace.
- Respect `prefers-reduced-motion: reduce` — wrap non-essential animations
  in a media query that disables/shortens them.

---

## 11. `firebase-config.js` shape

```js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  databaseURL: "...",   // required for RTDB
  storageBucket: "...", // unused but harmless to keep
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
```

Since GitHub Pages serves plain static files, use the Firebase **modular
CDN URLs** (`https://www.gstatic.com/firebasejs/<version>/firebase-app.js`,
etc.) as ES module imports directly in `firebase-config.js` — no bundler
needed. All 4 page scripts import `{ auth, db, rtdb }` from this one file.

Note: Firebase web config values are not secret (they identify the project,
not authorize access) — safe to commit as-is. Security comes entirely from
the Firestore/RTDB rules in §3, not from hiding this config.

---

## 12. Build phases

### Phase 0 — Firebase & repo setup
- Create Firebase project, enable Auth (email/password provider only),
  Firestore, RTDB.
- Manually create your one user account in the Firebase console.
- Write and deploy the Firestore + RTDB security rules from §3.
- Set up the GitHub repo with gh-pages branch/output, empty folder skeleton
  from §2.

### Phase 1 — Shared foundation
- `base.css` with the full token set (§9).
- `firebase-config.js`.
- `modules/auth-guard.js`, `modules/utils.js`.
- Icon set drafted + `icons.svg` sprite assembled.

### Phase 2 — Auth page
- `auth.html/css/js`: sign-in form, error handling, redirect-if-signed-in
  guard, password show/hide.

### Phase 3 — Index page
- `index.html/css/js`: static content + auth-aware "Get Started" routing.

### Phase 4 — Home page (core, biggest phase — consider sub-splitting)
- 4a: layout shell (top bar, two-pane inbox skeleton, empty states).
- 4b: `testmail-api.js` + wiring up manual refresh → render 40 messages.
- 4c: message selection → right-pane render (iframe-sandboxed HTML + text
  toggle).
- 4d: search/filter (§6.4).
- 4e: New Tag popup — custom tab (RTDB write) + sequel tab
  (`tag-generator.js`, preview + confirm-to-write).

### Phase 5 — Profile page
- Display mode (Firestore read, masked API key, sequel-count derivation,
  custom tags list from RTDB).
- Edit mode (save/cancel, Firestore write).
- Sign-out.

### Phase 6 — Polish
- Animations pass (§10), `prefers-reduced-motion` support.
- Empty/error/loading states audited across all 4 pages.
- Manual test pass: sign in → create both tag types → send a real email to
  a generated tag address → refresh → confirm it appears → search → open →
  sign out → confirm auth-guard redirects work in both directions.

### Phase 7 — Deploy
- Push to `gh-pages` branch (or configure Pages to serve from
  `main`/`docs`, whichever you prefer).
- Add your Firebase project's authorized domain (your `*.github.io` URL) in
  Firebase Auth settings — **required** or sign-in will fail on the deployed
  site even though it works on localhost.

---

## 13. Open items / assumptions to confirm before Phase 4

1. **HTML rendering approach** (§6.3): I've proposed a sandboxed `<iframe>`
   with no scripting as the zero-dependency safe default. If you'd rather
   pull in a small sanitizer (e.g. DOMPurify via CDN) and inject HTML
   directly instead of using an iframe, say so — it changes `home.js`
   structure a bit (iframe needs `srcdoc`, direct injection needs the
   sanitize step first).
2. **Relative timestamps** ("3m ago") — fine to hand-roll a tiny formatter
   in `utils.js`; confirming you don't want a library like `dayjs` pulled
   in just for this (keeping dependency count at zero besides Firebase).
3. Confirmed no pagination/offset UI is needed for Phase 1 — you get the
   latest 40 and that's the full inbox view for now.
4. **Edit-mode API key visibility** — since read-only mode always masks the
   key with no reveal, I assumed edit mode shows the real value in a plain
   input (so you can actually see what you're changing). If you'd rather
   edit mode *also* keep it masked/blank-until-typed (i.e. you always
   retype the full key to change it, never see the stored one again),
   let me know and I'll flip that.

Let me know if you want changes to any section, or if you'd like me to
start writing actual code for Phase 0/1 next.
