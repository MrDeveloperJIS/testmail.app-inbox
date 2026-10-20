# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [1.4.0] - 2026-10-20

### Added

- **Inbox: "To" field** — the reader header now lists From, To, Tag and
  Received. To uses testmail.app's parsed recipient list, falling back to the
  raw `to` / `envelope_to` strings and finally `namespace.tag@inbox.testmail.app`.
- **Custom scrollbars** — thin, rounded, transparent-track scrollbars with
  hover/active states, defined once in `base.css` via `--scrollbar-*` tokens
  (WebKit pseudo-elements, with standard `scrollbar-*` properties for Firefox).
  The email iframe receives the same styling.

### Changed

- **Profile page** restyled to match the landing page: centred 480px column,
  icon/title/lede hero, surface-alt detail tiles, and tag tiles with the tag
  icon. Edit mode now uses the floating-label input from the sign-in page.
  Hidden fields are removed from the tab order while not editing.
- **`.float-field`** (floating-label input) moved from `auth.css` to
  `base.css` so the profile page can share it; `auth.css` keeps only the
  password-toggle parts.
- **Reader meta** is now a two-column label/value grid so values align and
  long addresses wrap cleanly.

## [1.3.0] - 2026-09-19

### Changed

- **Inbox page renamed** — `home.html` is now `inbox.html`, with its
  stylesheet and script renamed to match (`assets/css/inbox.css`,
  `assets/js/inbox.js`). The page wrapper class `.home-page` became
  `.inbox-page`. Sign-in redirects (`auth.js`, `index.js`) and the
  `redirectIfSignedIn` default in `auth-guard.js` now point at
  `inbox.html`; comments and the README file tree were updated too. Any
  old `home.html` bookmark will 404.
- **Profile back link** — now uses the `mail.svg` icon (with
  `alt="Inbox"`) instead of a chevron.

### Removed

- `assets/img/icons/chevron-left.svg` — no longer referenced by anything.

## [1.2.0] - 2026-09-16

### Changed

- **Theme** — dropped light/dark switching; the app is dark-only now. Removed
  the toggle button and the pre-paint theme-detection script from every
  page, and the `[data-theme="dark"]` override in `base.css` (its values
  are just the `:root` defaults now).
- **Icons** — stopped using the `icons.svg` `<symbol>` sprite referenced via
  `<use href="...#icon-x">`. Every icon is now a plain `<img src="assets/img/icons/name.svg">`
  pointing straight at its own file. Since an `<img>` can't inherit
  `currentColor` from page CSS, the icon files themselves now carry a fixed
  stroke/fill color instead. The password show/hide toggle on the auth page
  works by swapping which of two `<img>` tags is `hidden`, instead of
  swapping one element's `href`.

### Added

- **Favicon** — `assets/img/favicon.svg`, an envelope on a dark
  rounded-square background, linked on all four pages.

### Removed

- `assets/js/modules/theme.js`, `assets/img/icons/icons.svg`,
  `assets/img/icons/sun.svg`, `assets/img/icons/moon.svg` — no longer
  referenced by anything.

## [1.1.0] - 2026-09-15

### Added

- **Quick "demo" address** — a tag button in the inbox top bar opens a
  popup showing the full `{namespace}.demo@inbox.testmail.app` address
  with a copy button. Unlike the New Tag modal, this popup is dismissed
  only by its close button (backdrop clicks and `Esc` are ignored).

### Changed

- **New Tag modal** — no longer closes on backdrop click or `Esc`; only
  its close button or the "Done" button (after tag creation) dismiss it
  now — same dismissal behavior as the "demo" address popup.

## [1.0.0] - 2026-09-15

Initial release.

### Added

- **Auth** — single email/password sign-in page (Firebase Auth). No
  public sign-up; the one account is created manually via the Firebase
  console.
- **Inbox (home)** — fetches the latest 40 messages from the
  testmail.app JSON API on demand via a manual refresh button (no
  polling). Two-pane layout: message list on the left, sandboxed
  message view on the right with an HTML / plain-text toggle.
- **Search** — instant client-side filter over fetched messages by tag
  or subject.
- **Tags** — generate addressable inbox tags two ways:
  - *Custom* — user-entered text, validated and saved.
  - *Sequel* — auto-incrementing `AAA00`-style tags, previewed before
    creation is confirmed.
- **Profile** — view/edit display name, testmail.app API key (masked
  by default) and namespace; view custom tag history and sequel tag
  count.
- **Theme** — light/dark mode, applied before first paint to avoid a
  flash of the wrong theme, with a toggle on every page.
- **Storage** — Firestore for profile data, Realtime Database for
  tags, both scoped to `request.auth.uid`. Messages themselves are
  never stored in Firebase and are always fetched live from
  testmail.app.
- Hand-rolled SVG icon set (`assets/img/icons/`), including a combined
  `icons.svg` sprite.
- Static HTML/CSS/JS site (no build step, no framework), structured
  for GitHub Pages hosting.