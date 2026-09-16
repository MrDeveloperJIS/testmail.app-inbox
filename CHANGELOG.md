# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

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

[1.0.0]: #