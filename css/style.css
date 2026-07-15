/* =========================================================
   Travel Intelligence Center
   Global Premium Design System V2.3.1

   File Path:
   css/style.css

   Purpose:
   - Restores the complete application design system.
   - Keeps all current pages and shared components styled.
   - Supports Home Page V2.3.0.
   - Supports Fast Single-Page Trip Form V4.0.0.
   - Fixes iPhone RTL sizing, date fields and safe areas.
   - Fixes full travel-date display and compact flight timeline.
========================================================= */

/* =========================================================
   1. Design Tokens
========================================================= */

:root {
  color-scheme: light;

  --tic-bg: #f5f7fb;
  --tic-bg-soft: #eef3f8;
  --tic-surface: #ffffff;
  --tic-surface-soft: #f8fafc;
  --tic-surface-strong: #eef2f7;

  --tic-text: #0b1730;
  --tic-text-soft: #334155;
  --tic-muted: #738198;
  --tic-muted-light: #9aa7b8;

  --tic-primary: #0f766e;
  --tic-primary-dark: #0b5f59;
  --tic-primary-light: #17a99a;
  --tic-primary-soft: #e7f7f4;

  --tic-navy: #08172b;
  --tic-navy-2: #10233f;
  --tic-navy-soft: #eaf0f8;

  --tic-success: #15915e;
  --tic-success-soft: #e8f8ef;

  --tic-warning: #b7791f;
  --tic-warning-soft: #fff6df;

  --tic-danger: #c2414f;
  --tic-danger-soft: #fff0f2;

  --tic-info: #2563eb;
  --tic-info-soft: #eaf1ff;

  --tic-border: #e2e8f0;
  --tic-border-strong: #cfd9e6;

  --tic-shadow-xs: 0 5px 16px rgba(15, 23, 42, 0.045);
  --tic-shadow-sm: 0 10px 28px rgba(15, 23, 42, 0.07);
  --tic-shadow-md: 0 20px 48px rgba(15, 23, 42, 0.10);
  --tic-shadow-lg: 0 28px 72px rgba(15, 23, 42, 0.16);
  --tic-shadow-primary: 0 24px 54px rgba(15, 118, 110, 0.24);

  --tic-radius-sm: 12px;
  --tic-radius-md: 16px;
  --tic-radius-lg: 22px;
  --tic-radius-xl: 28px;
  --tic-radius-2xl: 34px;
  --tic-radius-pill: 999px;

  --tic-page-max: 1180px;
  --tic-page-inline: 16px;
  --tic-topbar-height: 72px;
  --tic-bottom-nav-height: 86px;

  --tic-transition-fast: 140ms ease;
  --tic-transition: 220ms ease;
}

/* =========================================================
   2. Reset
========================================================= */

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  scroll-behavior: smooth;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.08), transparent 30%),
    linear-gradient(180deg, #fbfdff 0%, var(--tic-bg) 100%);
  color: var(--tic-text);
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "Noto Sans Arabic",
    Tahoma,
    Arial,
    sans-serif;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body.tic-modal-open {
  overflow: hidden;
}

button,
input,
select,
textarea {
  font: inherit;
}

button,
a,
[role="button"] {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

button {
  border: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

img,
svg {
  display: block;
  max-width: 100%;
}

h1,
h2,
h3,
h4,
p {
  margin: 0;
}

[hidden] {
  display: none !important;
}

::selection {
  background: rgba(15, 118, 110, 0.18);
}

/* =========================================================
   3. App Shell
========================================================= */

.tic-app {
  min-height: 100vh;
  min-height: 100dvh;
}

.tic-topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: calc(var(--tic-topbar-height) + env(safe-area-inset-top));
  padding:
    calc(12px + env(safe-area-inset-top))
    var(--tic-page-inline)
    12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
  background: rgba(250, 252, 255, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.tic-topbar-brand {
  min-width: 0;
  text-align: start;
}

.tic-kicker {
  margin-bottom: 3px;
  color: var(--tic-primary);
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tic-topbar h1 {
  overflow: hidden;
  color: var(--tic-navy);
  font-size: clamp(1.25rem, 5.5vw, 1.75rem);
  line-height: 1.15;
  font-weight: 900;
  letter-spacing: -0.03em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tic-icon-btn {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 1px solid var(--tic-border);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--tic-shadow-xs);
  color: var(--tic-text);
  font-size: 1.15rem;
  cursor: pointer;
  transition:
    transform var(--tic-transition-fast),
    box-shadow var(--tic-transition-fast);
}

.tic-icon-btn:active {
  transform: scale(0.96);
}

.tic-page {
  width: 100%;
  max-width: var(--tic-page-max);
  margin: 0 auto;
  padding:
    16px
    var(--tic-page-inline)
    calc(var(--tic-bottom-nav-height) + 34px + env(safe-area-inset-bottom));
  outline: none;
}

.tic-module {
  width: 100%;
  min-width: 0;
}

.tic-page-section {
  margin-top: 28px;
}

/* =========================================================
   4. Typography
========================================================= */

.tic-eyebrow {
  margin-bottom: 6px;
  color: var(--tic-primary);
  font-size: 0.78rem;
  font-weight: 900;
}

.tic-title {
  color: var(--tic-text);
  font-size: clamp(1.45rem, 6vw, 2rem);
  line-height: 1.2;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.tic-subtitle {
  margin-top: 8px;
  color: var(--tic-muted);
  font-size: 0.93rem;
  line-height: 1.75;
}

.tic-section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.tic-section-heading-copy {
  min-width: 0;
}

/* =========================================================
   5. Hero
========================================================= */

.tic-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 24px;
  border-radius: var(--tic-radius-2xl);
  background:
    linear-gradient(135deg, #1ba895 0%, #0f766e 42%, #0c1f38 100%);
  box-shadow: var(--tic-shadow-primary);
  color: #ffffff;
}

.tic-hero::before,
.tic-hero::after {
  content: "";
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  pointer-events: none;
}

.tic-hero::before {
  width: 260px;
  height: 260px;
  top: -145px;
  inset-inline-end: -90px;
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.tic-hero::after {
  width: 300px;
  height: 300px;
  inset-inline-start: -170px;
  bottom: -210px;
  background: rgba(255, 255, 255, 0.07);
}

.tic-hero-badge {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--tic-radius-pill);
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 900;
}

.tic-hero h1,
.tic-hero h2 {
  margin-top: 22px;
  color: #ffffff;
  font-size: clamp(2rem, 9vw, 3.25rem);
  line-height: 1.06;
  font-weight: 900;
  letter-spacing: -0.045em;
}

.tic-hero p {
  margin-top: 12px;
  max-width: 680px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.96rem;
  line-height: 1.78;
}

.tic-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.tic-hero-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: var(--tic-radius-pill);
  background: rgba(5, 20, 35, 0.26);
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.72rem;
  font-weight: 800;
}

/* =========================================================
   6. Grids & Cards
========================================================= */

.tic-grid {
  display: grid;
  gap: 14px;
}

.tic-grid-2,
.tic-grid-3,
.tic-grid-4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.tic-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--tic-border);
  border-radius: var(--tic-radius-xl);
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-sm);
}

.tic-card-body {
  padding: 18px;
}

.tic-card-title {
  color: var(--tic-text);
  font-size: 1.04rem;
  line-height: 1.4;
  font-weight: 900;
}

.tic-card-text {
  margin-top: 7px;
  color: var(--tic-muted);
  font-size: 0.86rem;
  line-height: 1.7;
}

.tic-card-interactive {
  cursor: pointer;
  transition:
    transform var(--tic-transition),
    box-shadow var(--tic-transition),
    border-color var(--tic-transition);
}

.tic-card-interactive:active {
  transform: scale(0.985);
}

.tic-stat-card {
  min-height: 132px;
  padding: 16px;
  border: 1px solid var(--tic-border);
  border-radius: var(--tic-radius-lg);
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-xs);
}

.tic-stat-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 15px;
  background: var(--tic-primary-soft);
  font-size: 1.15rem;
}

.tic-stat-value {
  display: block;
  margin-top: 14px;
  color: var(--tic-text);
  font-size: 1.8rem;
  line-height: 1;
  font-weight: 900;
}

.tic-stat-label {
  display: block;
  margin-top: 8px;
  color: var(--tic-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

/* =========================================================
   7. Buttons
========================================================= */

.tic-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 48px;
  padding: 11px 16px;
  border: 1px solid transparent;
  border-radius: var(--tic-radius-md);
  font-size: 0.9rem;
  font-weight: 900;
  cursor: pointer;
  transition:
    transform var(--tic-transition-fast),
    box-shadow var(--tic-transition-fast),
    background var(--tic-transition-fast);
}

.tic-btn:active {
  transform: scale(0.98);
}

.tic-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.tic-btn-primary {
  border-color: var(--tic-primary);
  background: linear-gradient(135deg, var(--tic-primary-light), var(--tic-primary));
  box-shadow: 0 12px 24px rgba(15, 118, 110, 0.22);
  color: #ffffff;
}

.tic-btn-secondary {
  border-color: var(--tic-border-strong);
  background: var(--tic-surface);
  color: var(--tic-text);
}

.tic-btn-soft {
  background: var(--tic-primary-soft);
  color: var(--tic-primary);
}

.tic-btn-danger {
  border-color: #f1ccd2;
  background: var(--tic-danger-soft);
  color: var(--tic-danger);
}

.tic-btn-block {
  width: 100%;
}

/* =========================================================
   8. Forms
========================================================= */

.tic-form {
  display: grid;
  gap: 18px;
}

.tic-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.tic-field {
  min-width: 0;
}

.tic-field label {
  display: block;
  margin-bottom: 7px;
  color: var(--tic-text-soft);
  font-size: 0.8rem;
  font-weight: 850;
}

.tic-field label span {
  color: var(--tic-danger);
}

.tic-input,
.tic-select,
.tic-textarea {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 50px;
  padding: 12px 14px;
  border: 1px solid var(--tic-border-strong);
  border-radius: var(--tic-radius-md);
  outline: none;
  background: var(--tic-surface-soft);
  color: var(--tic-text);
  transition:
    border-color var(--tic-transition-fast),
    box-shadow var(--tic-transition-fast),
    background var(--tic-transition-fast);
}

.tic-textarea {
  min-height: 116px;
  resize: vertical;
}

.tic-input:focus,
.tic-select:focus,
.tic-textarea:focus {
  border-color: var(--tic-primary);
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.1);
}

.tic-field-hint {
  display: block;
  margin-top: 7px;
  color: var(--tic-muted);
  font-size: 0.74rem;
  line-height: 1.55;
}

.tic-form-message {
  display: block;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 13px;
  font-size: 0.78rem;
  font-weight: 700;
}

.tic-form-message[data-type="error"] {
  border: 1px solid #f0c4ca;
  background: var(--tic-danger-soft);
  color: var(--tic-danger);
}

.tic-form-message[data-type="success"] {
  border: 1px solid #bfe8d2;
  background: var(--tic-success-soft);
  color: var(--tic-success);
}

.tic-field.has-error .tic-input,
.tic-field.has-error .tic-select,
.tic-field.has-error .tic-textarea {
  border-color: #e7a8b1;
  background: var(--tic-danger-soft);
}

/* =========================================================
   9. Chips & Progress
========================================================= */

.tic-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 31px;
  padding: 6px 10px;
  border-radius: var(--tic-radius-pill);
  background: var(--tic-surface-strong);
  color: var(--tic-text-soft);
  font-size: 0.7rem;
  font-weight: 900;
  white-space: nowrap;
}

.tic-chip-success {
  background: var(--tic-success-soft);
  color: var(--tic-success);
}

.tic-chip-warning {
  background: var(--tic-warning-soft);
  color: var(--tic-warning);
}

.tic-chip-danger {
  background: var(--tic-danger-soft);
  color: var(--tic-danger);
}

.tic-chip-info {
  background: var(--tic-info-soft);
  color: var(--tic-info);
}

.tic-progress {
  width: 100%;
  height: 9px;
  overflow: hidden;
  border-radius: var(--tic-radius-pill);
  background: #e3eaf1;
}

.tic-progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--tic-primary-light), var(--tic-primary));
  transition: width 350ms ease;
}

/* =========================================================
   10. Empty States
========================================================= */

.tic-empty-state {
  display: grid;
  justify-items: center;
  padding: 30px 20px;
  border: 1px solid var(--tic-border);
  border-radius: var(--tic-radius-xl);
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-sm);
  text-align: center;
}

.tic-empty-icon {
  display: grid;
  place-items: center;
  width: 70px;
  height: 70px;
  border-radius: 22px;
  background: var(--tic-primary-soft);
  font-size: 1.9rem;
}

.tic-empty-state h2,
.tic-empty-state h3 {
  margin-top: 15px;
  color: var(--tic-text);
  font-size: 1.35rem;
  line-height: 1.35;
  font-weight: 900;
}

.tic-empty-state p {
  max-width: 520px;
  margin-top: 9px;
  color: var(--tic-muted);
  font-size: 0.9rem;
  line-height: 1.75;
}

.tic-empty-state .tic-btn {
  margin-top: 18px;
}

/* =========================================================
   11. Home Page V2.3.0
========================================================= */

.tic-home-page {
  display: grid;
  gap: 26px;
  width: 100%;
  min-width: 0;
}

.tic-home-welcome {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 150px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 26px;
  background:
    linear-gradient(135deg, #159587 0%, #0f766e 52%, #0c2b3f 100%);
  box-shadow: 0 18px 40px rgba(15, 118, 110, 0.16);
  color: #ffffff;
}

.tic-home-welcome::before {
  content: "";
  position: absolute;
  z-index: -1;
  width: 180px;
  height: 180px;
  top: -100px;
  inset-inline-end: -70px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
}

.tic-home-welcome-copy {
  min-width: 0;
}

.tic-home-welcome-label {
  display: block;
  color: rgba(255, 255, 255, 0.74);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.09em;
}

.tic-home-welcome h1 {
  margin-top: 8px;
  color: #ffffff;
  font-size: clamp(1.75rem, 7vw, 2.35rem);
  line-height: 1.08;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.tic-home-welcome p {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.86rem;
  line-height: 1.65;
}

.tic-home-welcome-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 19px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 1.55rem;
}

.tic-home-section {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.tic-home-section-header {
  padding-inline: 2px;
}

.tic-home-section-header > span {
  display: block;
  color: var(--tic-primary);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.tic-home-section-header h2 {
  margin-top: 3px;
  color: var(--tic-navy);
  font-size: clamp(1.35rem, 5.8vw, 1.7rem);
  line-height: 1.2;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.tic-home-section-header p {
  margin-top: 5px;
  color: var(--tic-muted);
  font-size: 0.8rem;
  line-height: 1.55;
}

.tic-home-next-card {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--tic-border);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: var(--tic-shadow-xs);
}

.tic-home-next-card-empty {
  min-height: 170px;
}

.tic-home-next-card-smart {
  display: grid;
  gap: 14px;
}

.tic-home-next-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.tic-home-next-top > div:first-child {
  min-width: 0;
}

.tic-home-kicker {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: var(--tic-radius-pill);
  background: var(--tic-primary-soft);
  color: var(--tic-primary);
  font-size: 0.68rem;
  font-weight: 900;
}

.tic-home-next-card h3 {
  margin-top: 10px;
  color: var(--tic-text);
  font-size: 1.08rem;
  line-height: 1.35;
  font-weight: 900;
}

.tic-home-next-card p {
  margin-top: 5px;
  color: var(--tic-muted);
  font-size: 0.8rem;
  line-height: 1.55;
}

.tic-home-next-message {
  max-width: 420px;
}

.tic-home-next-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 50px;
  height: 50px;
  border-radius: 17px;
  background: var(--tic-primary-soft);
  color: var(--tic-primary);
  font-size: 1.35rem;
}

.tic-home-trip-highlight {
  padding: 13px 14px;
  border: 1px solid #dceeea;
  border-radius: 16px;
  background: linear-gradient(135deg, #f7fffd, #effaf7);
}

.tic-home-trip-highlight strong {
  display: block;
  color: var(--tic-primary-dark);
  font-size: 0.86rem;
  font-weight: 900;
}

.tic-home-trip-highlight p {
  margin-top: 4px;
  font-size: 0.76rem;
  line-height: 1.55;
}

.tic-home-trip-meta {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) repeat(2, minmax(0, 0.78fr));
  gap: 8px;
  margin-top: 0;
}

.tic-home-trip-fact {
  min-width: 0;
  padding: 11px;
  border: 1px solid #e8edf3;
  border-radius: 14px;
  background: var(--tic-surface-soft);
}

.tic-home-trip-fact span {
  display: block;
  color: var(--tic-muted);
  font-size: 0.62rem;
  line-height: 1.35;
}

.tic-home-trip-fact strong {
  display: block;
  margin-top: 5px;
  overflow: visible;
  color: var(--tic-text);
  font-size: 0.76rem;
  line-height: 1.45;
  font-weight: 900;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.tic-home-trip-fact.is-full strong {
  font-size: 0.72rem;
}

.tic-home-trip-fact.is-emphasis {
  border-color: #bfe5dc;
  background: var(--tic-primary-soft);
}

.tic-home-trip-fact.is-emphasis strong {
  color: var(--tic-primary-dark);
}

.tic-home-detail-block {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--tic-border);
  border-radius: 18px;
  background: #ffffff;
}

.tic-home-detail-block > header {
  margin-bottom: 10px;
}

.tic-home-detail-block > header span {
  display: block;
  color: var(--tic-primary);
  font-size: 0.64rem;
  font-weight: 900;
}

.tic-home-detail-block > header strong {
  display: block;
  margin-top: 2px;
  color: var(--tic-text);
  font-size: 0.9rem;
  line-height: 1.4;
  font-weight: 900;
  overflow-wrap: anywhere;
}

.tic-home-detail-block > header p {
  margin-top: 5px;
  color: var(--tic-muted);
  font-size: 0.72rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.tic-home-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tic-home-flight-block {
  overflow: hidden;
}

.tic-home-flight-timeline {
  position: relative;
  display: grid;
  gap: 0;
  padding: 2px 0;
}

.tic-home-flight-timeline::before {
  content: "";
  position: absolute;
  top: 21px;
  bottom: 21px;
  inset-inline-start: 9px;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--tic-primary-light), var(--tic-primary));
  opacity: 0.34;
}

.tic-home-flight-stop {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  padding: 9px 0;
}

.tic-home-flight-dot {
  position: relative;
  z-index: 1;
  display: block;
  width: 18px;
  height: 18px;
  margin-top: 3px;
  border: 5px solid #ffffff;
  border-radius: 50%;
  background: var(--tic-primary);
  box-shadow:
    0 0 0 1px #bfe5dc,
    0 5px 12px rgba(15, 118, 110, 0.16);
}

.tic-home-flight-stop[data-flight-stop="arrival"] .tic-home-flight-dot {
  background: var(--tic-navy);
  box-shadow:
    0 0 0 1px #cfd9e6,
    0 5px 12px rgba(8, 23, 43, 0.14);
}

.tic-home-flight-stop-copy {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e8edf3;
  border-radius: 15px;
  background: var(--tic-surface-soft);
}

.tic-home-flight-stop-copy small {
  display: block;
  color: var(--tic-muted);
  font-size: 0.65rem;
  line-height: 1.3;
}

.tic-home-flight-stop-copy strong {
  display: block;
  margin-top: 3px;
  color: var(--tic-text);
  font-size: 1rem;
  line-height: 1.25;
  font-weight: 900;
}

.tic-home-flight-stop-copy p {
  margin-top: 4px;
  color: var(--tic-text-soft);
  font-size: 0.72rem;
  line-height: 1.45;
  font-weight: 800;
}

.tic-home-flight-stop-copy em {
  display: block;
  margin-top: 4px;
  color: var(--tic-primary);
  font-size: 0.66rem;
  line-height: 1.4;
  font-style: normal;
  font-weight: 850;
}

.tic-home-airport-time {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 13px 14px;
  border: 1px solid #bfe5dc;
  border-radius: 16px;
  background: linear-gradient(135deg, #f7fffd 0%, var(--tic-primary-soft) 100%);
}

.tic-home-airport-time > div {
  min-width: 0;
}

.tic-home-airport-time small {
  display: block;
  color: var(--tic-muted);
  font-size: 0.65rem;
}

.tic-home-airport-time strong {
  display: block;
  margin-top: 3px;
  color: var(--tic-primary-dark);
  font-size: 1.08rem;
  line-height: 1.2;
  font-weight: 900;
}

.tic-home-airport-time > span {
  flex: 0 0 auto;
  max-width: 46%;
  padding: 6px 9px;
  border-radius: var(--tic-radius-pill);
  background: rgba(15, 118, 110, 0.1);
  color: var(--tic-primary-dark);
  font-size: 0.62rem;
  line-height: 1.35;
  font-weight: 900;
  text-align: center;
}

.tic-home-flight-facts {
  margin-top: 10px;
}

.tic-home-add-details {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px dashed #a9d8cf;
  border-radius: 15px;
  background: #f7fffd;
  color: var(--tic-primary);
  font-size: 0.78rem;
  font-weight: 900;
  cursor: pointer;
}

.tic-home-next-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 0;
}

.tic-home-next-actions .tic-btn {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 9px 14px;
  border-radius: 14px;
  font-size: 0.8rem;
}

.tic-home-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.tic-home-stat {
  display: grid;
  justify-items: center;
  min-width: 0;
  padding: 13px 7px;
  border: 1px solid var(--tic-border);
  border-radius: 18px;
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-xs);
  text-align: center;
}

.tic-home-stat-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: var(--tic-primary-soft);
  color: var(--tic-primary);
  font-size: 0.92rem;
}

.tic-home-stat strong {
  margin-top: 8px;
  color: var(--tic-text);
  font-size: 1.25rem;
  line-height: 1;
  font-weight: 900;
}

.tic-home-stat small {
  margin-top: 5px;
  overflow: hidden;
  width: 100%;
  color: var(--tic-muted);
  font-size: 0.64rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tic-home-inspiration {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border: 1px solid #d8eee9;
  border-radius: 22px;
  background: linear-gradient(135deg, #f7fffd 0%, #edf9f6 100%);
  box-shadow: var(--tic-shadow-xs);
}

.tic-home-inspiration-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 15px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.08);
  color: var(--tic-primary);
  font-size: 1.15rem;
}

.tic-home-inspiration-copy {
  min-width: 0;
}

.tic-home-inspiration-copy > span {
  display: block;
  color: var(--tic-primary);
  font-size: 0.66rem;
  font-weight: 900;
}

.tic-home-inspiration h3 {
  margin-top: 4px;
  color: var(--tic-text);
  font-size: 1rem;
  line-height: 1.4;
  font-weight: 900;
}

.tic-home-inspiration p {
  margin-top: 5px;
  color: var(--tic-muted);
  font-size: 0.8rem;
  line-height: 1.65;
}

/* =========================================================
   12. Fast Single-Page Trip Form V4.0.0
========================================================= */

.tic-trip-form-page {
  width: 100%;
  max-width: 760px;
  margin-inline: auto;
}

.tic-trip-form-simple,
.tic-trip-form-compact {
  display: grid;
  gap: 16px;
}

.tic-trip-form-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 24px;
  background: linear-gradient(135deg, #159587 0%, #0f766e 55%, #0b2b40 100%);
  box-shadow: 0 18px 42px rgba(15, 118, 110, 0.16);
  color: #ffffff;
}

.tic-trip-form-intro > div {
  min-width: 0;
}

.tic-trip-form-intro span {
  display: block;
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.tic-trip-form-intro h1 {
  margin-top: 4px;
  color: #ffffff;
  font-size: clamp(1.45rem, 6vw, 1.9rem);
  line-height: 1.15;
  font-weight: 900;
}

.tic-trip-form-intro p {
  margin-top: 6px;
  max-width: 520px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.78rem;
  line-height: 1.55;
}

.tic-trip-form-intro .tic-icon-btn {
  width: 42px;
  height: 42px;
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.12);
  box-shadow: none;
  color: #ffffff;
}

.tic-trip-main-card {
  overflow: visible;
  padding: 18px;
}

.tic-trip-form-simple-header {
  margin-bottom: 14px;
}

.tic-trip-form-simple-header > span {
  display: block;
  color: var(--tic-primary);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.tic-trip-form-simple-header h2 {
  margin-top: 3px;
  color: var(--tic-navy);
  font-size: 1.18rem;
  line-height: 1.3;
  font-weight: 900;
}

.tic-trip-form-simple-header p {
  margin-top: 4px;
  color: var(--tic-muted);
  font-size: 0.76rem;
  line-height: 1.55;
}

.tic-trip-form-simple .tic-form-grid,
.tic-trip-form-simple .tic-field,
.tic-trip-form-simple .tic-input,
.tic-trip-form-simple .tic-select,
.tic-trip-form-simple .tic-textarea {
  min-width: 0;
  max-width: 100%;
}

.tic-trip-form-simple .tic-input,
.tic-trip-form-simple .tic-select {
  min-height: 48px;
}

.tic-trip-form-simple input[type="date"],
.tic-trip-form-simple input[type="time"] {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding-inline: 12px;
  -webkit-appearance: none;
  appearance: none;
}

.tic-trip-form-simple input[type="date"]::-webkit-date-and-time-value,
.tic-trip-form-simple input[type="time"]::-webkit-date-and-time-value {
  min-width: 0;
  text-align: start;
}

.tic-trip-form-simple input[type="date"]::-webkit-calendar-picker-indicator,
.tic-trip-form-simple input[type="time"]::-webkit-calendar-picker-indicator {
  margin: 0;
  padding: 2px;
}

.tic-trip-duration-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 54px;
  padding: 11px 13px;
  border: 1px solid #dcece8;
  border-radius: 15px;
  background: var(--tic-primary-soft);
}

.tic-trip-duration-card span {
  color: var(--tic-primary-dark);
  font-size: 0.75rem;
  font-weight: 800;
}

.tic-trip-duration-card strong {
  color: var(--tic-primary-dark);
  font-size: 0.96rem;
  font-weight: 900;
}

.tic-trip-smart-import,
.tic-trip-import-grid {
  display: grid;
  gap: 10px;
}

.tic-trip-import-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 13px;
  border: 1px dashed #a9d8cf;
  border-radius: 18px;
  background: linear-gradient(135deg, #f8fffd 0%, #effaf7 100%);
}

.tic-trip-import-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: var(--tic-shadow-xs);
  color: var(--tic-primary);
  font-size: 1.08rem;
}

.tic-trip-import-copy {
  min-width: 0;
}

.tic-trip-import-copy strong {
  display: block;
  overflow: hidden;
  color: var(--tic-text);
  font-size: 0.84rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tic-trip-import-copy p {
  margin-top: 3px;
  color: var(--tic-muted);
  font-size: 0.69rem;
  line-height: 1.45;
}

.tic-trip-import-card .tic-btn {
  min-height: 39px;
  padding: 8px 12px;
  border-radius: 13px;
  font-size: 0.73rem;
}

.tic-trip-import-status {
  grid-column: 2 / -1;
  overflow: hidden;
  color: var(--tic-muted);
  font-size: 0.65rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tic-trip-import-status[data-tone="success"] {
  color: var(--tic-success);
}

.tic-trip-import-status[data-tone="warning"] {
  color: var(--tic-warning);
}

.tic-trip-import-status[data-tone="info"] {
  color: var(--tic-info);
}

.tic-trip-advanced {
  overflow: hidden;
  border: 1px solid var(--tic-border);
  border-radius: 20px;
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-xs);
}

.tic-trip-advanced-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 74px;
  padding: 15px 17px;
  list-style: none;
  cursor: pointer;
}

.tic-trip-advanced-summary::-webkit-details-marker {
  display: none;
}

.tic-trip-advanced-summary > div {
  min-width: 0;
}

.tic-trip-advanced-summary strong {
  display: block;
  color: var(--tic-text);
  font-size: 0.9rem;
  font-weight: 900;
}

.tic-trip-advanced-summary small {
  display: block;
  margin-top: 3px;
  color: var(--tic-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.tic-trip-advanced-summary > span {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: var(--tic-primary-soft);
  color: var(--tic-primary);
  font-size: 1rem;
  transition: transform var(--tic-transition);
}

.tic-trip-advanced[open] .tic-trip-advanced-summary {
  border-bottom: 1px solid var(--tic-border);
}

.tic-trip-advanced[open] .tic-trip-advanced-summary > span {
  transform: rotate(45deg);
}

.tic-trip-advanced-content {
  display: grid;
  gap: 20px;
  padding: 17px;
}

.tic-trip-advanced-section {
  display: grid;
  gap: 12px;
}

.tic-trip-advanced-section + .tic-trip-advanced-section {
  padding-top: 18px;
  border-top: 1px solid var(--tic-border);
}

.tic-trip-advanced-section > header span {
  display: block;
  color: var(--tic-primary);
  font-size: 0.63rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.tic-trip-advanced-section > header h3 {
  margin-top: 3px;
  color: var(--tic-text);
  font-size: 0.98rem;
  font-weight: 900;
}

.tic-trip-form-actions {
  position: sticky;
  z-index: 20;
  bottom: calc(var(--tic-bottom-nav-height) + 7px + env(safe-area-inset-bottom));
  display: flex;
  gap: 9px;
  margin-top: 2px;
  padding: 10px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.11);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.tic-trip-form-actions .tic-btn {
  flex: 1;
  min-height: 44px;
  border-radius: 14px;
  font-size: 0.8rem;
}

.tic-trip-form-actions-simple .tic-btn-primary {
  flex: 1.35;
}

.tic-trip-form-simple .tic-field label small {
  margin-inline-start: 5px;
  color: var(--tic-muted);
  font-size: 0.66rem;
  font-weight: 700;
}

/* =========================================================
   13. Trips Page
========================================================= */

.tic-trips-list {
  display: grid;
  gap: 16px;
}

.tic-trip-card {
  overflow: hidden;
}

.tic-trip-cover {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 156px;
  background: linear-gradient(135deg, #d7f5ee, #b6e8df 48%, #153247);
}

.tic-trip-cover-emoji {
  font-size: 3rem;
  filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.17));
}

.tic-trip-card-body {
  padding: 18px;
}

.tic-trip-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
  margin-top: 15px;
}

.tic-info-box {
  min-width: 0;
  padding: 11px;
  border: 1px solid #e6edf2;
  border-radius: 15px;
  background: var(--tic-surface-soft);
}

.tic-info-box small {
  display: block;
  color: var(--tic-muted);
  font-size: 0.69rem;
}

.tic-info-box strong {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--tic-text);
  font-size: 0.82rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tic-toolbar {
  display: grid;
  gap: 12px;
  padding: 15px;
  border: 1px solid var(--tic-border);
  border-radius: var(--tic-radius-lg);
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-xs);
}

.tic-filter-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.tic-filter-row::-webkit-scrollbar {
  display: none;
}

.tic-filter-chip {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid var(--tic-border);
  border-radius: var(--tic-radius-pill);
  background: var(--tic-surface);
  color: var(--tic-text-soft);
  font-size: 0.78rem;
  font-weight: 850;
  cursor: pointer;
}

.tic-filter-chip.is-active {
  border-color: var(--tic-primary);
  background: var(--tic-primary);
  color: #ffffff;
}

/* =========================================================
   14. Guide
========================================================= */

.tic-destination-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.tic-destination-card {
  min-height: 186px;
}

.tic-destination-visual {
  display: grid;
  place-items: center;
  min-height: 100px;
  background: linear-gradient(135deg, var(--tic-primary-soft), #c8eee7);
  font-size: 2.35rem;
}

.tic-destination-card .tic-card-body {
  padding: 14px;
}

/* =========================================================
   15. Budget
========================================================= */

.tic-budget-overview {
  padding: 22px;
  border-radius: var(--tic-radius-xl);
  background: linear-gradient(135deg, var(--tic-navy-2), var(--tic-navy));
  box-shadow: var(--tic-shadow-lg);
  color: #ffffff;
}

.tic-budget-overview small {
  color: rgba(255, 255, 255, 0.64);
}

.tic-budget-overview strong {
  display: block;
  margin-top: 7px;
  color: #ffffff;
  font-size: clamp(2rem, 9vw, 3rem);
  line-height: 1;
  font-weight: 900;
}

.tic-budget-breakdown {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 18px;
}

.tic-budget-breakdown-item {
  padding: 12px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.08);
}

.tic-budget-breakdown-item strong {
  margin-top: 5px;
  font-size: 0.88rem;
}

/* =========================================================
   16. More
========================================================= */

.tic-settings-list {
  display: grid;
  gap: 10px;
}

.tic-settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 68px;
  padding: 14px 16px;
  border: 1px solid var(--tic-border);
  border-radius: var(--tic-radius-lg);
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-xs);
}

.tic-settings-item-main {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
}

.tic-settings-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--tic-primary-soft);
  font-size: 1.08rem;
}

.tic-settings-copy {
  min-width: 0;
}

.tic-settings-copy strong {
  display: block;
  font-size: 0.9rem;
}

.tic-settings-copy small {
  display: block;
  margin-top: 4px;
  color: var(--tic-muted);
  font-size: 0.73rem;
  line-height: 1.45;
}

/* =========================================================
   17. Modal
========================================================= */

.tic-modal,
.tic-sheet {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  align-items: end;
  padding:
    max(10px, env(safe-area-inset-top))
    8px
    max(8px, env(safe-area-inset-bottom));
  background: rgba(15, 23, 42, 0.54);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.tic-modal-panel {
  width: min(100%, 680px);
  max-height: 92dvh;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 26px 26px 18px 18px;
  background: var(--tic-surface);
  box-shadow: var(--tic-shadow-lg);
}

.tic-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 17px;
  border-bottom: 1px solid var(--tic-border);
}

.tic-modal-header h2 {
  font-size: 1.08rem;
  font-weight: 900;
}

.tic-modal-close {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--tic-border);
  border-radius: 13px;
  background: var(--tic-surface-soft);
  color: var(--tic-text);
  font-size: 1.05rem;
  cursor: pointer;
}

.tic-modal-body {
  max-height: calc(92dvh - 144px);
  overflow-y: auto;
  padding: 17px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.tic-modal-footer {
  display: flex;
  gap: 10px;
  padding: 14px 17px 17px;
  border-top: 1px solid var(--tic-border);
  background: var(--tic-surface);
}

.tic-modal-footer .tic-btn {
  flex: 1;
}

/* =========================================================
   18. Toast
========================================================= */

.tic-toast {
  position: fixed;
  z-index: 1200;
  inset-inline: 16px;
  bottom: calc(var(--tic-bottom-nav-height) + 18px + env(safe-area-inset-bottom));
  max-width: 520px;
  margin: 0 auto;
  padding: 13px 15px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  background: rgba(8, 23, 43, 0.96);
  box-shadow: var(--tic-shadow-lg);
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 750;
  text-align: center;
}

/* =========================================================
   19. Bottom Navigation
========================================================= */

.tic-bottom-nav {
  position: fixed;
  z-index: 900;
  inset-inline: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 3px;
  min-height: calc(var(--tic-bottom-nav-height) + env(safe-area-inset-bottom));
  padding:
    7px
    max(7px, env(safe-area-inset-right))
    calc(7px + env(safe-area-inset-bottom))
    max(7px, env(safe-area-inset-left));
  border-top: 1px solid rgba(207, 217, 230, 0.8);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -12px 32px rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.tic-nav-item {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 5px;
  min-width: 0;
  min-height: 68px;
  padding: 7px 3px;
  border-radius: 20px;
  background: transparent;
  color: #6f7c90;
  cursor: pointer;
  transition:
    transform var(--tic-transition-fast),
    color var(--tic-transition-fast),
    background var(--tic-transition-fast),
    box-shadow var(--tic-transition-fast);
}

.tic-nav-item > span {
  font-size: 1.2rem;
  line-height: 1;
}

.tic-nav-item > small {
  overflow: hidden;
  width: 100%;
  font-size: clamp(0.58rem, 2.5vw, 0.7rem);
  font-weight: 850;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tic-nav-item.active,
.tic-nav-item[aria-current="page"] {
  background: var(--tic-navy);
  box-shadow: 0 12px 28px rgba(8, 23, 43, 0.22);
  color: #ffffff;
}

.tic-nav-item:active {
  transform: scale(0.96);
}

/* =========================================================
   20. Footer & Loading
========================================================= */

.tic-footer {
  margin-top: 28px;
  padding: 22px 0 8px;
  border-top: 1px solid var(--tic-border);
  text-align: center;
}

.tic-footer strong,
.tic-footer span {
  display: block;
}

.tic-footer strong {
  color: var(--tic-text);
  font-size: 0.9rem;
}

.tic-footer span {
  margin-top: 5px;
  color: var(--tic-muted);
  font-size: 0.76rem;
}

.tic-loading {
  display: grid;
  place-items: center;
  min-height: 220px;
}

.tic-spinner {
  width: 42px;
  height: 42px;
  border: 4px solid rgba(15, 118, 110, 0.16);
  border-top-color: var(--tic-primary);
  border-radius: 50%;
  animation: tic-spin 0.8s linear infinite;
}

@keyframes tic-spin {
  to {
    transform: rotate(360deg);
  }
}

/* =========================================================
   21. Responsive
========================================================= */

@media (min-width: 560px) {
  :root {
    --tic-page-inline: 22px;
  }

  .tic-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tic-field.is-full {
    grid-column: 1 / -1;
  }

  .tic-trip-meta,
  .tic-budget-breakdown {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tic-home-page {
    gap: 30px;
  }

  .tic-home-welcome {
    min-height: 164px;
    padding: 26px;
  }

  .tic-home-next-card {
    padding: 21px;
  }

  .tic-home-stats {
    gap: 12px;
  }
}

@media (min-width: 760px) {
  .tic-modal,
  .tic-sheet {
    align-items: center;
  }

  .tic-trips-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tic-destination-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tic-grid-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tic-grid-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .tic-home-page {
    max-width: 820px;
    margin-inline: auto;
  }

  .tic-trip-import-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tic-trip-main-card,
  .tic-trip-advanced-content {
    padding: 20px;
  }

  .tic-home-detail-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tic-home-trip-meta {
    grid-template-columns: 1.4fr repeat(2, minmax(0, 0.7fr));
  }

  .tic-home-flight-facts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1020px) {
  .tic-topbar {
    padding-inline: max(34px, calc((100vw - var(--tic-page-max)) / 2));
  }

  .tic-destination-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .tic-bottom-nav {
    inset-inline: max(16px, calc((100vw - 720px) / 2));
    bottom: 14px;
    border: 1px solid var(--tic-border);
    border-radius: 28px;
    box-shadow: var(--tic-shadow-lg);
  }
}

@media (max-width: 520px) {
  .tic-home-trip-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tic-home-trip-fact.is-full {
    grid-column: 1 / -1;
  }

  .tic-home-trip-fact.is-full strong {
    font-size: 0.76rem;
  }

  .tic-home-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tic-home-flight-facts .tic-home-trip-fact:first-child {
    grid-column: 1 / -1;
  }

  .tic-home-airport-time {
    align-items: stretch;
    flex-direction: column;
  }

  .tic-home-airport-time > span {
    width: fit-content;
    max-width: none;
  }

  .tic-trip-form-intro {
    padding: 16px;
    border-radius: 21px;
  }

  .tic-trip-main-card {
    padding: 15px;
    border-radius: 20px;
  }

  .tic-trip-form-simple .tic-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .tic-trip-form-simple .tic-field {
    grid-column: 1 / -1;
  }

  .tic-trip-import-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .tic-trip-import-card .tic-btn {
    grid-column: 1 / -1;
    width: 100%;
  }

  .tic-trip-import-status {
    grid-column: 1 / -1;
  }

  .tic-trip-advanced-summary {
    min-height: 68px;
    padding: 14px 15px;
  }

  .tic-trip-advanced-content {
    padding: 15px;
  }

  .tic-trip-form-actions {
    bottom: calc(var(--tic-bottom-nav-height) + 5px + env(safe-area-inset-bottom));
  }
}

@media (max-width: 390px) {
  :root {
    --tic-page-inline: 12px;
    --tic-bottom-nav-height: 82px;
  }

  .tic-page {
    padding-top: 12px;
  }

  .tic-hero {
    padding: 21px;
  }

  .tic-nav-item {
    min-height: 64px;
    border-radius: 18px;
  }

  .tic-home-page {
    gap: 22px;
  }

  .tic-home-welcome {
    min-height: 138px;
    padding: 18px;
    border-radius: 22px;
  }

  .tic-home-welcome-icon {
    width: 50px;
    height: 50px;
    border-radius: 16px;
  }

  .tic-home-next-card {
    padding: 15px;
    border-radius: 20px;
  }

  .tic-home-next-card-smart {
    gap: 12px;
  }

  .tic-home-trip-meta {
    gap: 6px;
  }

  .tic-home-trip-fact {
    padding: 9px;
    border-radius: 13px;
  }

  .tic-home-trip-fact span {
    font-size: 0.58rem;
  }

  .tic-home-trip-fact strong {
    font-size: 0.69rem;
  }

  .tic-home-trip-fact.is-full strong {
    font-size: 0.72rem;
  }

  .tic-home-detail-block {
    padding: 12px;
    border-radius: 16px;
  }

  .tic-home-flight-stop-copy {
    padding: 9px 10px;
  }

  .tic-home-flight-stop-copy strong {
    font-size: 0.93rem;
  }

  .tic-home-next-actions {
    grid-template-columns: 1fr;
  }

  .tic-home-stat {
    padding: 11px 5px;
    border-radius: 16px;
  }

  .tic-home-stat-icon {
    width: 31px;
    height: 31px;
  }

  .tic-home-stat strong {
    font-size: 1.1rem;
  }

  .tic-home-stat small {
    font-size: 0.58rem;
  }

  .tic-home-inspiration {
    padding: 15px;
    border-radius: 19px;
  }
}

/* =========================================================
   22. Accessibility
========================================================= */

:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.5);
  outline-offset: 3px;
}

@media (hover: hover) and (pointer: fine) {
  .tic-card-interactive:hover {
    transform: translateY(-3px);
    border-color: var(--tic-border-strong);
    box-shadow: var(--tic-shadow-md);
  }

  .tic-btn-primary:hover {
    box-shadow: 0 15px 30px rgba(15, 118, 110, 0.27);
  }

  .tic-icon-btn:hover {
    box-shadow: var(--tic-shadow-md);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}