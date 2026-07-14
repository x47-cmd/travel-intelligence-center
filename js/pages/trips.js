/* =========================================================
   Travel Intelligence Center
   Trips Page Module V3.0.1

   File Path:
   js/pages/trips.js

   Purpose:
   - Complete redesign of "رحلاتي" as a personal travel hub.
   - Separates upcoming, ongoing, memories and visited countries.
   - Supports adding old trips without forcing full booking details.
   - Automatically includes completed future trips in travel memories.
   - Preserves current Store / Router / UI / Trip Form integrations.
   - Injects scoped styles so the page is complete from one file.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/features/trip-form.js

   Global APIs:
   - window.TIC.Pages.trips
   - window.TICTripsPage
========================================================= */

(function (window, document) {
  "use strict";

  const PAGE_ID = "trips";
  const PAGE_VERSION = "3.1.0";
  const STYLE_ID = "tic-trips-v3-styles";

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    activeView: "hub",
    activeTab: "upcoming",
    activeTripId: null,
    filtersOpen: false,
    filters: {
      search: "",
      status: "all",
      type: "all",
      sort: "start-asc"
    },
    memoryDraft: null,
    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null
  };

  const STATUS_LABELS = {
    planning: "قيد التخطيط",
    booked: "تم الحجز",
    ready: "جاهزة للسفر",
    ongoing: "جارية الآن",
    completed: "مكتملة",
    cancelled: "ملغاة"
  };

  const TYPE_LABELS = {
    family: "عائلية",
    couple: "زوجية",
    friends: "أصدقاء",
    solo: "فردية",
    business: "عمل",
    weekend: "عطلة قصيرة"
  };

  const SORT_OPTIONS = [
    { value: "start-asc", label: "الأقرب أولاً" },
    { value: "start-desc", label: "الأحدث تاريخاً" },
    { value: "created-desc", label: "الأحدث إضافة" },
    { value: "budget-desc", label: "الأعلى ميزانية" },
    { value: "title-asc", label: "الاسم أبجدياً" }
  ];

  const TAB_LABELS = {
    upcoming: "القادمة",
    ongoing: "الجارية",
    all: "كل الرحلات"
  };

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (error) {
        // Continue to JSON fallback.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const text = (value) =>
    String(value ?? "").trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const toDate = (value) => {
    if (!value) return null;

    const parsed =
      value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  };

  const startOfDay = (value) => {
    const parsed = new Date(value);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const createId = (prefix = "trip") =>
    `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getTripForm = () =>
    window.TIC?.Features?.TripForm ||
    window.TICTripForm ||
    null;

  const resolveContainer = (container) => {
    if (container instanceof window.Element) {
      return container;
    }

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content")
    );
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Trips subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-page="trips"][data-page-version="3.1.0"] {
        --trips-navy: #061b38;
        --trips-teal: #0f8f83;
        --trips-teal-dark: #08756d;
        --trips-mint: #e8f7f4;
        --trips-soft: #f6f9fc;
        --trips-line: #dce5ef;
        --trips-muted: #75839b;
        --trips-gold: #bf7d13;
        --trips-shadow: 0 18px 45px rgba(16, 40, 70, .09);
        color: var(--trips-navy);
        padding-bottom: 28px;
      }

      [data-page="trips"] * {
        box-sizing: border-box;
      }

      .trips-shell {
        display: grid;
        gap: 22px;
      }

      .trips-hero {
        position: relative;
        overflow: hidden;
        min-height: 315px;
        padding: 28px;
        border-radius: 34px;
        background:
          radial-gradient(circle at 15% 5%, rgba(255,255,255,.13) 0 120px, transparent 122px),
          linear-gradient(140deg, #16a797 0%, #0c8079 52%, #082b50 100%);
        color: #fff;
        box-shadow: 0 24px 56px rgba(7, 54, 79, .20);
      }

      .trips-hero::after {
        content: "";
        position: absolute;
        inset-inline-end: -65px;
        bottom: -70px;
        width: 245px;
        height: 170px;
        border-radius: 50%;
        background: rgba(2, 19, 48, .28);
        transform: rotate(-12deg);
      }

      .trips-hero__top,
      .trips-hero__content,
      .trips-hero__actions {
        position: relative;
        z-index: 1;
      }

      .trips-hero__eyebrow {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 0 18px;
        border: 1px solid rgba(255,255,255,.20);
        border-radius: 999px;
        background: rgba(255,255,255,.10);
        font-weight: 800;
      }

      .trips-hero h1 {
        margin: 30px 0 8px;
        color: #fff;
        font-size: clamp(38px, 10vw, 58px);
        line-height: 1.05;
      }

      .trips-hero p {
        max-width: 520px;
        margin: 0;
        color: rgba(255,255,255,.82);
        font-size: 18px;
        line-height: 1.9;
      }

      .trips-hero__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 25px;
      }

      .trips-action {
        min-height: 52px;
        padding: 0 20px;
        border: 0;
        border-radius: 18px;
        font: inherit;
        font-weight: 900;
        cursor: pointer;
      }

      .trips-action--primary {
        background: #fff;
        color: var(--trips-navy);
      }

      .trips-action--glass {
        border: 1px solid rgba(255,255,255,.24);
        background: rgba(255,255,255,.12);
        color: #fff;
      }

      .trips-section {
        display: grid;
        gap: 14px;
      }

      .trips-section__header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 14px;
      }

      .trips-section__eyebrow {
        margin: 0 0 4px;
        color: var(--trips-teal-dark);
        font-size: 13px;
        font-weight: 950;
        letter-spacing: .07em;
      }

      .trips-section h2 {
        margin: 0;
        color: var(--trips-navy);
        font-size: clamp(27px, 7vw, 38px);
        line-height: 1.2;
      }

      .trips-section__subtitle {
        margin: 6px 0 0;
        color: var(--trips-muted);
        line-height: 1.7;
      }

      .trips-overview {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .trips-stat {
        min-height: 156px;
        padding: 18px;
        border: 1px solid var(--trips-line);
        border-radius: 27px;
        background: #fff;
        box-shadow: 0 11px 28px rgba(16, 40, 70, .045);
      }

      .trips-stat__icon {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 17px;
        background: var(--trips-mint);
        color: var(--trips-navy);
        font-size: 22px;
      }

      .trips-stat strong {
        display: block;
        margin-top: 18px;
        font-size: 31px;
        line-height: 1;
      }

      .trips-stat span {
        display: block;
        margin-top: 9px;
        color: var(--trips-muted);
        font-weight: 800;
      }

      .trips-tabs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 5px;
        border: 1px solid var(--trips-line);
        border-radius: 22px;
        background: #fff;
        scrollbar-width: none;
      }

      .trips-tabs::-webkit-scrollbar {
        display: none;
      }

      .trips-tab {
        flex: 0 0 auto;
        min-height: 46px;
        padding: 0 18px;
        border: 0;
        border-radius: 17px;
        background: transparent;
        color: var(--trips-muted);
        font: inherit;
        font-weight: 900;
        cursor: pointer;
      }

      .trips-tab.is-active {
        background: var(--trips-navy);
        color: #fff;
        box-shadow: 0 10px 20px rgba(6, 27, 56, .18);
      }

      .trips-tools {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .trips-search {
        flex: 1;
        min-height: 55px;
        padding: 0 18px;
        border: 1px solid var(--trips-line);
        border-radius: 18px;
        background: #fff;
        color: var(--trips-navy);
        font: inherit;
        outline: none;
      }

      .trips-search:focus {
        border-color: rgba(15, 143, 131, .55);
        box-shadow: 0 0 0 4px rgba(15, 143, 131, .09);
      }

      .trips-filter-toggle {
        min-width: 55px;
        min-height: 55px;
        border: 1px solid var(--trips-line);
        border-radius: 18px;
        background: #fff;
        color: var(--trips-navy);
        font: inherit;
        font-weight: 900;
      }

      .trips-filters {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        padding: 16px;
        border: 1px solid var(--trips-line);
        border-radius: 24px;
        background: #fff;
      }

      .trips-field {
        display: grid;
        gap: 7px;
      }

      .trips-field label {
        color: var(--trips-navy);
        font-size: 13px;
        font-weight: 900;
      }

      .trips-field input,
      .trips-field select,
      .trips-field textarea {
        width: 100%;
        min-height: 52px;
        padding: 0 14px;
        border: 1px solid var(--trips-line);
        border-radius: 16px;
        background: var(--trips-soft);
        color: var(--trips-navy);
        font: inherit;
        outline: none;
      }

      .trips-field textarea {
        min-height: 105px;
        padding-top: 14px;
        resize: vertical;
      }

      .trips-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .trip-card-v3 {
        overflow: hidden;
        border: 1px solid var(--trips-line);
        border-radius: 30px;
        background: #fff;
        box-shadow: var(--trips-shadow);
      }

      .trip-card-v3__cover {
        position: relative;
        display: flex;
        align-items: flex-end;
        min-height: 155px;
        padding: 20px;
        background:
          linear-gradient(135deg, rgba(196,246,234,.96), rgba(41,129,142,.69) 56%, rgba(7,39,68,.96));
      }

      .trip-card-v3__emoji {
        position: absolute;
        inset-inline-start: 22px;
        top: 22px;
        font-size: 48px;
      }

      .trip-card-v3__badge {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(255,255,255,.88);
        color: var(--trips-navy);
        font-size: 12px;
        font-weight: 950;
      }

      .trip-card-v3__body {
        padding: 20px;
      }

      .trip-card-v3__title-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }

      .trip-card-v3 h3 {
        margin: 0;
        color: var(--trips-navy);
        font-size: 24px;
      }

      .trip-card-v3__destination {
        margin: 6px 0 0;
        color: var(--trips-muted);
      }

      .trip-status-v3 {
        display: inline-flex;
        align-items: center;
        min-height: 31px;
        padding: 0 11px;
        border-radius: 999px;
        background: #eef2f7;
        color: #40506a;
        font-size: 12px;
        font-weight: 950;
        white-space: nowrap;
      }

      .trip-status-v3[data-status="ongoing"] {
        background: #fff0d1;
        color: #9d6300;
      }

      .trip-status-v3[data-status="ready"],
      .trip-status-v3[data-status="completed"] {
        background: #e5f6ef;
        color: #0d7563;
      }

      .trip-status-v3[data-status="cancelled"] {
        background: #fdebed;
        color: #a42f3b;
      }

      .trip-card-v3__meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 18px;
      }

      .trip-card-v3__meta-item {
        min-height: 75px;
        padding: 12px;
        border-radius: 17px;
        background: var(--trips-soft);
      }

      .trip-card-v3__meta-item small {
        display: block;
        color: var(--trips-muted);
      }

      .trip-card-v3__meta-item strong {
        display: block;
        margin-top: 7px;
        font-size: 14px;
      }

      .trip-card-v3__progress {
        margin-top: 16px;
      }

      .trip-card-v3__progress-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 7px;
        color: var(--trips-muted);
        font-size: 13px;
      }

      .trip-card-v3__bar {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e5ebf2;
      }

      .trip-card-v3__bar > span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #16a797, #08766d);
      }

      .trip-card-v3__actions {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        margin-top: 18px;
      }

      .trip-card-v3__open {
        min-height: 50px;
        border: 0;
        border-radius: 17px;
        background: linear-gradient(135deg, #17a797, #0a7d74);
        color: #fff;
        font: inherit;
        font-weight: 950;
      }

      .trip-card-v3__menu {
        min-width: 50px;
        min-height: 50px;
        border: 1px solid var(--trips-line);
        border-radius: 17px;
        background: #fff;
        color: var(--trips-navy);
        font: inherit;
        font-weight: 950;
      }

      .memory-card {
        overflow: hidden;
        border: 1px solid var(--trips-line);
        border-radius: 28px;
        background: #fff;
        box-shadow: var(--trips-shadow);
      }

      .memory-card__cover {
        min-height: 125px;
        padding: 18px;
        background:
          radial-gradient(circle at 75% 15%, rgba(255,255,255,.35), transparent 33%),
          linear-gradient(135deg, #d8f8ef, #81cabb 55%, #0a4962);
      }

      .memory-card__stamp {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 13px;
        border: 2px solid rgba(6, 27, 56, .34);
        border-radius: 13px;
        color: var(--trips-navy);
        font-weight: 950;
        transform: rotate(-2deg);
      }

      .memory-card__body {
        padding: 19px;
      }

      .memory-card h3 {
        margin: 0;
        font-size: 23px;
      }

      .memory-card p {
        margin: 7px 0 0;
        color: var(--trips-muted);
        line-height: 1.7;
      }

      .memory-card__facts {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 14px;
      }

      .memory-card__fact {
        padding: 7px 10px;
        border-radius: 999px;
        background: var(--trips-soft);
        color: #56657d;
        font-size: 12px;
        font-weight: 850;
      }

      .country-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .country-magnet {
        position: relative;
        overflow: hidden;
        min-height: 185px;
        padding: 20px;
        border: 1px solid var(--trips-line);
        border-radius: 31px;
        background:
          radial-gradient(circle at 85% 10%, rgba(255,255,255,.65), transparent 28%),
          linear-gradient(145deg, #effcf9, #c5eee6);
        box-shadow: 0 13px 30px rgba(16, 40, 70, .07);
      }

      .country-magnet::after {
        content: "";
        position: absolute;
        inset-inline-end: -25px;
        bottom: -35px;
        width: 110px;
        height: 110px;
        border: 14px solid rgba(15,143,131,.11);
        border-radius: 50%;
      }

      .country-magnet__flag {
        font-size: 38px;
      }

      .country-magnet h3 {
        margin: 22px 0 4px;
        font-size: 22px;
      }

      .country-magnet p {
        margin: 0;
        color: var(--trips-muted);
      }

      .country-magnet__count {
        position: absolute;
        inset-inline-end: 16px;
        top: 16px;
        display: grid;
        place-items: center;
        min-width: 38px;
        height: 38px;
        padding: 0 9px;
        border-radius: 999px;
        background: var(--trips-navy);
        color: #fff;
        font-size: 13px;
        font-weight: 950;
      }

      .trips-empty {
        padding: 35px 20px;
        border: 1px dashed #cbd8e6;
        border-radius: 28px;
        background: rgba(255,255,255,.75);
        text-align: center;
      }

      .trips-empty__icon {
        font-size: 42px;
      }

      .trips-empty h3 {
        margin: 12px 0 5px;
        font-size: 23px;
      }

      .trips-empty p {
        margin: 0;
        color: var(--trips-muted);
        line-height: 1.7;
      }

      .trips-empty button {
        margin-top: 16px;
      }

      .trips-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        align-items: end;
        padding: 18px;
        background: rgba(4, 14, 32, .52);
        backdrop-filter: blur(9px);
      }

      .trips-modal {
        width: min(720px, 100%);
        max-height: calc(100vh - 36px);
        margin-inline: auto;
        overflow: auto;
        border-radius: 32px 32px 22px 22px;
        background: #fff;
        box-shadow: 0 35px 90px rgba(0,0,0,.25);
      }

      .trips-modal__header {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 20px;
        border-bottom: 1px solid var(--trips-line);
        background: rgba(255,255,255,.96);
        backdrop-filter: blur(12px);
      }

      .trips-modal__header h3 {
        margin: 0;
        font-size: 23px;
      }

      .trips-modal__close {
        width: 42px;
        height: 42px;
        border: 1px solid var(--trips-line);
        border-radius: 14px;
        background: #fff;
        font: inherit;
        font-size: 24px;
      }

      .trips-modal__body {
        display: grid;
        gap: 15px;
        padding: 20px;
      }

      .trips-modal__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .trips-modal__footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 0 20px 22px;
      }

      .trips-btn {
        min-height: 52px;
        border-radius: 17px;
        font: inherit;
        font-weight: 950;
        cursor: pointer;
      }

      .trips-btn--primary {
        border: 0;
        background: linear-gradient(135deg, #17a797, #0b7a72);
        color: #fff;
      }

      .trips-btn--secondary {
        border: 1px solid var(--trips-line);
        background: #fff;
        color: var(--trips-navy);
      }

      .trips-detail-hero {
        padding: 24px;
        border-radius: 31px;
        background:
          radial-gradient(circle at 10% 10%, rgba(255,255,255,.17), transparent 30%),
          linear-gradient(140deg, #139f90, #0a706e 55%, #072746);
        color: #fff;
      }

      .trips-detail-hero__back {
        min-height: 42px;
        padding: 0 14px;
        border: 1px solid rgba(255,255,255,.22);
        border-radius: 14px;
        background: rgba(255,255,255,.10);
        color: #fff;
        font: inherit;
        font-weight: 900;
      }

      .trips-detail-hero h1 {
        margin: 28px 0 8px;
        color: #fff;
        font-size: 38px;
      }

      .trips-detail-hero p {
        margin: 0;
        color: rgba(255,255,255,.80);
      }

      .trips-detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 20px;
      }

      .trips-details-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .trips-detail-box {
        min-height: 105px;
        padding: 17px;
        border: 1px solid var(--trips-line);
        border-radius: 22px;
        background: #fff;
      }

      .trips-detail-box small {
        display: block;
        color: var(--trips-muted);
      }

      .trips-detail-box strong {
        display: block;
        margin-top: 10px;
        font-size: 18px;
        line-height: 1.5;
      }

      @media (max-width: 760px) {
        .trips-overview {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .trips-grid,
        .country-grid {
          grid-template-columns: 1fr;
        }

        .trips-filters,
        .trips-modal__grid,
        .trips-details-grid {
          grid-template-columns: 1fr;
        }

        .trips-hero {
          min-height: 330px;
          padding: 24px 22px;
          border-radius: 31px;
        }

        .trips-section__header {
          align-items: start;
          flex-direction: column;
        }
      }

      /* =====================================================
         Trips V3.1.0 — Compact & Personal Refinement
      ===================================================== */

      [data-page="trips"][data-page-version="3.1.0"] .trips-shell {
        gap: 24px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-hero {
        min-height: 0;
        padding: 22px;
        border-radius: 27px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-hero__eyebrow {
        min-height: 30px;
        padding: 0 13px;
        font-size: 11px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-hero h1 {
        margin-top: 18px;
        font-size: clamp(32px, 8vw, 44px);
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-hero p {
        max-width: 470px;
        font-size: 14px;
        line-height: 1.75;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-hero__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 18px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-action {
        min-height: 46px;
        padding: 0 12px;
        border-radius: 15px;
        font-size: 13px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-section h2 {
        font-size: clamp(24px, 6vw, 32px);
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-section__subtitle {
        margin-top: 4px;
        font-size: 13px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-overview {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-stat {
        min-height: 104px;
        padding: 12px 9px;
        border-radius: 20px;
        text-align: center;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-stat__icon {
        width: 35px;
        height: 35px;
        margin-inline: auto;
        border-radius: 12px;
        font-size: 16px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-stat strong {
        margin-top: 10px;
        font-size: 23px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-stat span {
        margin-top: 6px;
        font-size: 10px;
        line-height: 1.35;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-tabs {
        padding: 4px;
        border-radius: 19px;
      }

      [data-page="trips"][data-page-version="3.1.0"] .trips-tab {
        flex: 1 0 auto;
        min-height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        font-size: 13px;
      }

      .trips-personal-section {
        position: relative;
        overflow: hidden;
        display: grid;
        gap: 16px;
        padding: 20px;
        border: 1px solid var(--trips-line);
        border-radius: 29px;
        background: #fff;
        box-shadow: var(--trips-shadow);
      }

      .trips-personal-section--memory {
        background:
          radial-gradient(circle at 8% 0%, rgba(28, 167, 151, .12), transparent 31%),
          linear-gradient(145deg, #ffffff, #f5fbfa);
      }

      .trips-personal-section--passport {
        background:
          radial-gradient(circle at 90% 0%, rgba(9, 39, 70, .10), transparent 30%),
          linear-gradient(145deg, #ffffff, #f5f8fc);
      }

      .trips-personal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 13px;
      }

      .trips-personal-copy {
        min-width: 0;
      }

      .trips-personal-kicker {
        display: block;
        color: var(--trips-teal-dark);
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .08em;
      }

      .trips-personal-head h2 {
        margin: 4px 0 0;
        font-size: clamp(25px, 7vw, 34px);
      }

      .trips-personal-head p {
        margin: 5px 0 0;
        color: var(--trips-muted);
        font-size: 13px;
        line-height: 1.65;
      }

      .trips-personal-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 17px;
        background: var(--trips-mint);
        font-size: 23px;
      }

      .trips-personal-action {
        width: 100%;
        min-height: 48px;
        border: 0;
        border-radius: 16px;
        background: linear-gradient(135deg, #17a797, #0b7a72);
        color: #fff;
        font: inherit;
        font-size: 13px;
        font-weight: 950;
      }

      .trips-memory-preview,
      .trips-country-preview {
        display: grid;
        gap: 12px;
      }

      .trips-personal-empty {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 13px;
        min-height: 105px;
        padding: 15px;
        border: 1px dashed #cbd8e6;
        border-radius: 21px;
        background: rgba(255,255,255,.72);
      }

      .trips-personal-empty__icon {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 16px;
        background: #fff;
        font-size: 22px;
        box-shadow: 0 8px 20px rgba(16,40,70,.06);
      }

      .trips-personal-empty strong {
        display: block;
        font-size: 16px;
      }

      .trips-personal-empty p {
        margin: 4px 0 0;
        color: var(--trips-muted);
        font-size: 12px;
        line-height: 1.55;
      }

      .trips-memory-preview .memory-card {
        box-shadow: none;
      }

      .trips-country-preview .country-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .trips-country-preview .country-magnet {
        min-height: 150px;
        padding: 16px;
        border-radius: 24px;
      }

      .trips-country-preview .country-magnet__flag {
        font-size: 31px;
      }

      .trips-country-preview .country-magnet h3 {
        margin-top: 16px;
        font-size: 18px;
      }

      @media (max-width: 520px) {
        [data-page="trips"][data-page-version="3.1.0"] .trips-overview {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        [data-page="trips"][data-page-version="3.1.0"] .trips-stat {
          min-height: 96px;
          padding: 10px 5px;
        }

        [data-page="trips"][data-page-version="3.1.0"] .trips-stat__icon {
          width: 31px;
          height: 31px;
          font-size: 14px;
        }

        [data-page="trips"][data-page-version="3.1.0"] .trips-stat strong {
          font-size: 20px;
        }

        [data-page="trips"][data-page-version="3.1.0"] .trips-stat span {
          font-size: 9px;
        }

        .trips-personal-section {
          padding: 17px;
          border-radius: 25px;
        }
      }

      @media (max-width: 390px) {
        [data-page="trips"][data-page-version="3.1.0"] .trips-hero__actions {
          grid-template-columns: 1fr;
        }

        .trips-country-preview .country-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (min-width: 761px) {
        .trips-modal-backdrop {
          align-items: center;
        }

        .trips-modal {
          border-radius: 30px;
        }
      }
    `;

    document.head.appendChild(style);
  };

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    if (typeof store.get === "function") {
      return {
        profile: store.get("profile"),
        trips: store.get("trips"),
        documents: store.get("documents"),
        packing: store.get("packing"),
        budgets: store.get("budgets"),
        memories: store.get("memories"),
        notifications: store.get("notifications")
      };
    }

    return {};
  };

  const getTrips = () => {
    const snapshot = getStoreState();

    return Array.isArray(snapshot.trips)
      ? clone(snapshot.trips)
      : [];
  };

  const findTrip = (tripId) =>
    getTrips().find(
      (trip) =>
        String(trip.id) === String(tripId)
    ) || null;

  const saveTrips = (trips) => {
    const store = getStore();

    if (!store) {
      throw new Error("TIC Trips Error: store is unavailable.");
    }

    if (typeof store.set === "function") {
      store.set("trips", clone(trips));
      return true;
    }

    if (typeof store.patch === "function") {
      store.patch({ trips: clone(trips) });
      return true;
    }

    if (typeof store.update === "function") {
      store.update((currentState) => ({
        ...currentState,
        trips: clone(trips)
      }));
      return true;
    }

    throw new Error("TIC Trips Error: persistence is unavailable.");
  };

  const addTripToStore = async (trip) => {
    const store = getStore();

    if (typeof store?.addTrip === "function") {
      return (await store.addTrip(trip)) || trip;
    }

    if (typeof store?.createTrip === "function") {
      return (await store.createTrip(trip)) || trip;
    }

    if (typeof store?.upsertTrip === "function") {
      await store.upsertTrip(trip);
      return trip;
    }

    const trips = getTrips();
    trips.unshift(clone(trip));
    saveTrips(trips);

    return trip;
  };

  const updateTrip = async (tripId, patch) => {
    const store = getStore();
    const existing = findTrip(tripId);

    if (!existing) return null;

    const updated = {
      ...existing,
      ...clone(patch),
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    if (typeof store?.updateTrip === "function") {
      await store.updateTrip(tripId, updated);
      return updated;
    }

    if (typeof store?.upsertTrip === "function") {
      await store.upsertTrip(updated);
      return updated;
    }

    const trips = getTrips();
    const index = trips.findIndex(
      (trip) =>
        String(trip.id) === String(tripId)
    );

    if (index >= 0) {
      trips[index] = updated;
      saveTrips(trips);
    }

    return updated;
  };

  const deleteTripFromStore = async (tripId) => {
    const store = getStore();

    if (typeof store?.deleteTrip === "function") {
      await store.deleteTrip(tripId);
      return true;
    }

    if (typeof store?.removeTrip === "function") {
      await store.removeTrip(tripId);
      return true;
    }

    saveTrips(
      getTrips().filter(
        (trip) =>
          String(trip.id) !== String(tripId)
      )
    );

    return true;
  };

  const duplicateTripInStore = async (tripId) => {
    const original = findTrip(tripId);

    if (!original) return null;

    const now = new Date().toISOString();

    const duplicate = {
      ...clone(original),
      id: createId(),
      title: `${
        original.title ||
        original.destination ||
        "رحلة"
      } - نسخة`,
      status: "planning",
      isMemory: false,
      memorySource: "",
      spent: 0,
      featured: false,
      createdAt: now,
      updatedAt: now
    };

    return addTripToStore(duplicate);
  };

  const durationDays = (trip) => {
    if (number(trip.durationDays) > 0) {
      return number(trip.durationDays);
    }

    const start = toDate(trip.startDate);
    const end = toDate(trip.endDate);

    if (!start || !end || end < start) {
      return 0;
    }

    return (
      Math.floor(
        (
          startOfDay(end).getTime() -
          startOfDay(start).getTime()
        ) / 86400000
      ) + 1
    );
  };

  const daysUntil = (trip) => {
    const start = toDate(trip.startDate);

    if (!start) return null;

    return Math.ceil(
      (
        startOfDay(start).getTime() -
        startOfDay(new Date()).getTime()
      ) / 86400000
    );
  };

  const tripStatus = (trip) => {
    const raw = text(trip.status).toLowerCase();

    if (raw === "cancelled") return raw;

    const today = startOfDay(new Date());
    const start = toDate(trip.startDate);
    const end = toDate(trip.endDate);

    if (
      start &&
      end &&
      today >= startOfDay(start) &&
      today <= startOfDay(end)
    ) {
      return "ongoing";
    }

    if (
      end &&
      startOfDay(end) < today
    ) {
      return "completed";
    }

    if (raw) return raw;

    return "planning";
  };

  const isMemoryTrip = (trip) =>
    trip.isMemory === true ||
    trip.memorySource === "manual-history" ||
    tripStatus(trip) === "completed";

  const isUpcomingTrip = (trip) =>
    ["planning", "booked", "ready"].includes(
      tripStatus(trip)
    );

  const formatDate = (value, options = {}) => {
    const parsed = toDate(value);

    if (!parsed) return "غير محدد";

    try {
      return new Intl.DateTimeFormat("ar-AE", {
        day: options.yearOnly ? undefined : "numeric",
        month: options.yearOnly ? undefined : "long",
        year: "numeric"
      }).format(parsed);
    } catch (error) {
      return parsed.toLocaleDateString("ar-AE");
    }
  };

  const currency = (value) => {
    const ui = getUI();

    if (typeof ui?.currency === "function") {
      return ui.currency(number(value));
    }

    return `${number(value).toLocaleString("ar-AE")} د.إ`;
  };

  const countryFlag = (country) => {
    const normalized = text(country).toLowerCase();

    const flags = {
      "الإمارات": "🇦🇪",
      "الامارات": "🇦🇪",
      "united arab emirates": "🇦🇪",
      "السعودية": "🇸🇦",
      "saudi arabia": "🇸🇦",
      "البحرين": "🇧🇭",
      "bahrain": "🇧🇭",
      "عمان": "🇴🇲",
      "oman": "🇴🇲",
      "قطر": "🇶🇦",
      "qatar": "🇶🇦",
      "الكويت": "🇰🇼",
      "kuwait": "🇰🇼",
      "المالديف": "🇲🇻",
      "maldives": "🇲🇻",
      "تايلند": "🇹🇭",
      "تايلاند": "🇹🇭",
      "thailand": "🇹🇭",
      "كازاخستان": "🇰🇿",
      "kazakhstan": "🇰🇿",
      "إسبانيا": "🇪🇸",
      "اسبانيا": "🇪🇸",
      "spain": "🇪🇸",
      "تركيا": "🇹🇷",
      "turkey": "🇹🇷",
      "جورجيا": "🇬🇪",
      "georgia": "🇬🇪",
      "أذربيجان": "🇦🇿",
      "اذربيجان": "🇦🇿",
      "azerbaijan": "🇦🇿",
      "المملكة المتحدة": "🇬🇧",
      "بريطانيا": "🇬🇧",
      "united kingdom": "🇬🇧",
      "فرنسا": "🇫🇷",
      "france": "🇫🇷",
      "إيطاليا": "🇮🇹",
      "ايطاليا": "🇮🇹",
      "italy": "🇮🇹",
      "سويسرا": "🇨🇭",
      "switzerland": "🇨🇭",
      "اليابان": "🇯🇵",
      "japan": "🇯🇵",
      "ماليزيا": "🇲🇾",
      "malaysia": "🇲🇾",
      "إندونيسيا": "🇮🇩",
      "اندونيسيا": "🇮🇩",
      "indonesia": "🇮🇩"
    };

    return flags[normalized] || "🌍";
  };

  const normalizeCities = (trip) => {
    const cities = [];

    if (Array.isArray(trip.cities)) {
      cities.push(...trip.cities);
    }

    if (trip.city) {
      cities.push(trip.city);
    }

    if (trip.destination && !trip.country) {
      cities.push(trip.destination);
    }

    return [...new Set(
      cities
        .map(text)
        .filter(Boolean)
    )];
  };

  const buildCountries = (trips) => {
    const map = new Map();

    trips
      .filter(isMemoryTrip)
      .forEach((trip) => {
        const country =
          text(trip.country) ||
          text(trip.destinationCountry) ||
          text(trip.destination) ||
          "وجهة غير محددة";

        const key = country.toLowerCase();

        if (!map.has(key)) {
          map.set(key, {
            key,
            country,
            flag:
              text(trip.countryFlag) ||
              countryFlag(country),
            visits: 0,
            cities: new Set(),
            firstVisit: null,
            lastVisit: null,
            tripIds: []
          });
        }

        const item = map.get(key);
        const date =
          toDate(trip.startDate) ||
          toDate(trip.endDate) ||
          toDate(trip.createdAt);

        item.visits += 1;
        item.tripIds.push(trip.id);

        normalizeCities(trip).forEach((city) =>
          item.cities.add(city)
        );

        if (date) {
          if (!item.firstVisit || date < item.firstVisit) {
            item.firstVisit = date;
          }

          if (!item.lastVisit || date > item.lastVisit) {
            item.lastVisit = date;
          }
        }
      });

    return [...map.values()]
      .map((item) => ({
        ...item,
        cities: [...item.cities]
      }))
      .sort((a, b) =>
        a.country.localeCompare(b.country, "ar")
      );
  };

  const statisticsFrom = (trips, countries) => ({
    total: trips.length,
    upcoming: trips.filter(isUpcomingTrip).length,
    ongoing: trips.filter(
      (trip) =>
        tripStatus(trip) === "ongoing"
    ).length,
    memories: trips.filter(isMemoryTrip).length,
    countries: countries.length,
    cities: new Set(
      trips
        .filter(isMemoryTrip)
        .flatMap(normalizeCities)
        .map((city) => city.toLowerCase())
    ).size
  });

  const filteredTripsFrom = (trips) => {
    const search =
      text(state.filters.search).toLowerCase();

    const byTab = trips.filter((trip) => {
      const status = tripStatus(trip);

      switch (state.activeTab) {
        case "upcoming":
          return isUpcomingTrip(trip);

        case "ongoing":
          return status === "ongoing";

        case "memories":
          return isMemoryTrip(trip);

        case "all":
          return true;

        default:
          return true;
      }
    });

    const result = byTab.filter((trip) => {
      const status = tripStatus(trip);
      const type =
        text(trip.tripType).toLowerCase();

      const searchable = [
        trip.title,
        trip.destination,
        trip.country,
        trip.city,
        ...(Array.isArray(trip.cities) ? trip.cities : []),
        trip.accommodation,
        trip.airline,
        trip.bestMemory,
        trip.notes
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !search ||
        searchable.includes(search);

      const matchesStatus =
        state.filters.status === "all" ||
        status === state.filters.status;

      const matchesType =
        state.filters.type === "all" ||
        type === state.filters.type;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType
      );
    });

    result.sort((a, b) => {
      switch (state.filters.sort) {
        case "start-desc":
          return (
            (toDate(b.startDate)?.getTime() || 0) -
            (toDate(a.startDate)?.getTime() || 0)
          );

        case "created-desc":
          return (
            (toDate(b.createdAt)?.getTime() || 0) -
            (toDate(a.createdAt)?.getTime() || 0)
          );

        case "budget-desc":
          return number(b.budget) - number(a.budget);

        case "title-asc":
          return text(
            a.title ||
            a.destination
          ).localeCompare(
            text(
              b.title ||
              b.destination
            ),
            "ar"
          );

        case "start-asc":
        default:
          return (
            (
              toDate(a.startDate)?.getTime() ||
              Number.MAX_SAFE_INTEGER
            ) -
            (
              toDate(b.startDate)?.getTime() ||
              Number.MAX_SAFE_INTEGER
            )
          );
      }
    });

    return result;
  };

  const buildSnapshot = () => {
    const trips = getTrips();
    const countries = buildCountries(trips);

    const snapshot = {
      trips,
      countries,
      filteredTrips: filteredTripsFrom(trips),
      activeTrip: state.activeTripId
        ? trips.find(
            (trip) =>
              String(trip.id) ===
              String(state.activeTripId)
          ) || null
        : null,
      statistics: statisticsFrom(trips, countries),
      filters: clone(state.filters),
      activeView: state.activeView,
      activeTab: state.activeTab
    };

    state.lastSnapshot = snapshot;

    return snapshot;
  };

  const renderOverview = (statistics) => {
    const items = [
      {
        icon: "✈",
        value: statistics.upcoming,
        label: "رحلات قادمة"
      },
      {
        icon: "◎",
        value: statistics.ongoing,
        label: "رحلات جارية"
      },
      {
        icon: "◈",
        value: statistics.countries,
        label: "دول زرتها"
      },
      {
        icon: "♡",
        value: statistics.memories,
        label: "ذكريات سفر"
      }
    ];

    return `
      <div class="trips-overview">
        ${items.map((item) => `
          <article class="trips-stat">
            <span class="trips-stat__icon">
              ${escapeHTML(item.icon)}
            </span>

            <strong>
              ${escapeHTML(item.value)}
            </strong>

            <span>
              ${escapeHTML(item.label)}
            </span>
          </article>
        `).join("")}
      </div>
    `;
  };

  const renderTabs = () => `
    <div class="trips-tabs" role="tablist">
      ${Object.entries(TAB_LABELS)
        .map(([value, label]) => `
          <button
            type="button"
            class="trips-tab ${
              state.activeTab === value
                ? "is-active"
                : ""
            }"
            data-trips-tab="${escapeHTML(value)}"
            role="tab"
            aria-selected="${
              state.activeTab === value
                ? "true"
                : "false"
            }"
          >
            ${escapeHTML(label)}
          </button>
        `)
        .join("")}
    </div>
  `;

  const renderFilters = () => {
    const selected = (value, current) =>
      value === current ? "selected" : "";

    return `
      <div class="trips-tools">
        <input
          type="search"
          class="trips-search"
          data-trips-search
          value="${escapeHTML(
            state.filters.search
          )}"
          placeholder="ابحث باسم الرحلة أو الدولة أو المدينة..."
          aria-label="البحث في الرحلات"
        >

        <button
          type="button"
          class="trips-filter-toggle"
          data-action="trips-toggle-filters"
          aria-label="إظهار أو إخفاء الفلاتر"
        >
          ⚙
        </button>
      </div>

      ${
        state.filtersOpen
          ? `
            <div class="trips-filters">
              <div class="trips-field">
                <label>الحالة</label>

                <select data-trips-filter-status>
                  <option
                    value="all"
                    ${selected("all", state.filters.status)}
                  >
                    كل الحالات
                  </option>

                  ${Object.entries(STATUS_LABELS)
                    .map(([value, label]) => `
                      <option
                        value="${escapeHTML(value)}"
                        ${selected(value, state.filters.status)}
                      >
                        ${escapeHTML(label)}
                      </option>
                    `)
                    .join("")}
                </select>
              </div>

              <div class="trips-field">
                <label>نوع الرحلة</label>

                <select data-trips-filter-type>
                  <option
                    value="all"
                    ${selected("all", state.filters.type)}
                  >
                    كل الأنواع
                  </option>

                  ${Object.entries(TYPE_LABELS)
                    .map(([value, label]) => `
                      <option
                        value="${escapeHTML(value)}"
                        ${selected(value, state.filters.type)}
                      >
                        ${escapeHTML(label)}
                      </option>
                    `)
                    .join("")}
                </select>
              </div>

              <div class="trips-field">
                <label>الترتيب</label>

                <select data-trips-sort>
                  ${SORT_OPTIONS.map((option) => `
                    <option
                      value="${escapeHTML(option.value)}"
                      ${selected(option.value, state.filters.sort)}
                    >
                      ${escapeHTML(option.label)}
                    </option>
                  `).join("")}
                </select>
              </div>

              <button
                type="button"
                class="trips-btn trips-btn--secondary"
                data-action="trips-clear-filters"
              >
                مسح الفلاتر
              </button>
            </div>
          `
          : ""
      }
    `;
  };

  const renderTripCard = (trip) => {
    const status = tripStatus(trip);
    const remaining = daysUntil(trip);
    const budget = number(trip.budget);
    const spent = number(trip.spent);
    const usage =
      budget > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round((spent / budget) * 100)
            )
          )
        : 0;

    const countdown =
      status === "completed"
        ? "ضمن ذكريات السفر"
        : remaining === null
          ? "الموعد غير محدد"
          : remaining === 0
            ? "السفر اليوم"
            : remaining === 1
              ? "متبقي يوم"
              : remaining > 1
                ? `متبقي ${remaining} يوم`
                : "بدأت الرحلة";

    const location =
      trip.destination ||
      [trip.city, trip.country]
        .filter(Boolean)
        .join("، ") ||
      "وجهة غير محددة";

    return `
      <article
        class="trip-card-v3"
        data-trip-card="${escapeHTML(trip.id)}"
      >
        <div class="trip-card-v3__cover">
          <span class="trip-card-v3__emoji">
            ${escapeHTML(
              trip.emoji ||
              trip.icon ||
              countryFlag(trip.country) ||
              "✈"
            )}
          </span>

          <span class="trip-card-v3__badge">
            ${escapeHTML(countdown)}
          </span>
        </div>

        <div class="trip-card-v3__body">
          <div class="trip-card-v3__title-row">
            <div>
              <h3>
                ${escapeHTML(
                  trip.title ||
                  trip.destination ||
                  "رحلة بدون اسم"
                )}
              </h3>

              <p class="trip-card-v3__destination">
                ${escapeHTML(location)}
              </p>
            </div>

            <span
              class="trip-status-v3"
              data-status="${escapeHTML(status)}"
            >
              ${escapeHTML(
                STATUS_LABELS[status] ||
                status
              )}
            </span>
          </div>

          <div class="trip-card-v3__meta">
            <div class="trip-card-v3__meta-item">
              <small>التاريخ</small>
              <strong>
                ${escapeHTML(formatDate(trip.startDate))}
              </strong>
            </div>

            <div class="trip-card-v3__meta-item">
              <small>المدة</small>
              <strong>
                ${
                  durationDays(trip)
                    ? `${durationDays(trip)} يوم`
                    : "—"
                }
              </strong>
            </div>

            <div class="trip-card-v3__meta-item">
              <small>النوع</small>
              <strong>
                ${escapeHTML(
                  TYPE_LABELS[trip.tripType] ||
                  "رحلة"
                )}
              </strong>
            </div>
          </div>

          ${
            budget > 0
              ? `
                <div class="trip-card-v3__progress">
                  <div class="trip-card-v3__progress-row">
                    <span>استخدام الميزانية</span>
                    <strong>${usage}%</strong>
                  </div>

                  <div class="trip-card-v3__bar">
                    <span style="width:${usage}%"></span>
                  </div>
                </div>
              `
              : ""
          }

          <div class="trip-card-v3__actions">
            <button
              type="button"
              class="trip-card-v3__open"
              data-action="trips-view-details"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              فتح الرحلة
            </button>

            <button
              type="button"
              class="trip-card-v3__menu"
              data-action="trips-card-menu"
              data-trip-id="${escapeHTML(trip.id)}"
              aria-label="إجراءات الرحلة"
            >
              •••
            </button>
          </div>
        </div>
      </article>
    `;
  };

  const renderMemoryCard = (trip) => {
    const location =
      [trip.city, trip.country]
        .filter(Boolean)
        .join("، ") ||
      trip.destination ||
      "وجهة غير محددة";

    const year =
      toDate(trip.startDate)?.getFullYear() ||
      trip.travelYear ||
      "—";

    const cities = normalizeCities(trip);

    return `
      <article class="memory-card">
        <div class="memory-card__cover">
          <span class="memory-card__stamp">
            ${escapeHTML(
              trip.countryFlag ||
              countryFlag(trip.country)
            )}
            ${escapeHTML(year)}
          </span>
        </div>

        <div class="memory-card__body">
          <h3>
            ${escapeHTML(
              trip.title ||
              trip.destination ||
              "ذكرى سفر"
            )}
          </h3>

          <p>
            ${escapeHTML(location)}
          </p>

          <div class="memory-card__facts">
            <span class="memory-card__fact">
              ${escapeHTML(
                TYPE_LABELS[trip.tripType] ||
                "رحلة"
              )}
            </span>

            ${
              cities.length
                ? `
                  <span class="memory-card__fact">
                    ${escapeHTML(cities.length)} مدينة
                  </span>
                `
                : ""
            }

            ${
              number(trip.rating) > 0
                ? `
                  <span class="memory-card__fact">
                    ★ ${escapeHTML(trip.rating)}/5
                  </span>
                `
                : ""
            }

            ${
              trip.wouldVisitAgain === true
                ? `
                  <span class="memory-card__fact">
                    أزورها مرة أخرى
                  </span>
                `
                : ""
            }
          </div>

          ${
            trip.bestMemory
              ? `
                <p style="margin-top:14px">
                  “${escapeHTML(trip.bestMemory)}”
                </p>
              `
              : ""
          }

          <div class="trip-card-v3__actions">
            <button
              type="button"
              class="trip-card-v3__open"
              data-action="trips-view-details"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              فتح الذكرى
            </button>

            <button
              type="button"
              class="trip-card-v3__menu"
              data-action="trips-card-menu"
              data-trip-id="${escapeHTML(trip.id)}"
              aria-label="إجراءات الرحلة"
            >
              •••
            </button>
          </div>
        </div>
      </article>
    `;
  };

  const renderCountryCard = (country) => `
    <article class="country-magnet">
      <span class="country-magnet__count">
        ${escapeHTML(country.visits)}
      </span>

      <div class="country-magnet__flag">
        ${escapeHTML(country.flag)}
      </div>

      <h3>
        ${escapeHTML(country.country)}
      </h3>

      <p>
        ${
          country.cities.length
            ? escapeHTML(country.cities.join("، "))
            : "المدن غير مسجلة"
        }
      </p>

      <p style="margin-top:9px;font-size:13px">
        ${
          country.firstVisit
            ? `أول زيارة: ${escapeHTML(
                country.firstVisit.getFullYear()
              )}`
            : "تاريخ الزيارة غير محدد"
        }
      </p>
    </article>
  `;

  const renderEmpty = ({
    icon = "✈",
    title,
    message,
    actionLabel,
    action
  }) => `
    <div class="trips-empty">
      <div class="trips-empty__icon">
        ${escapeHTML(icon)}
      </div>

      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>

      ${
        actionLabel && action
          ? `
            <button
              type="button"
              class="trips-btn trips-btn--primary"
              data-action="${escapeHTML(action)}"
            >
              ${escapeHTML(actionLabel)}
            </button>
          `
          : ""
      }
    </div>
  `;

  const renderTabContent = (snapshot) => {
    if (!snapshot.filteredTrips.length) {
      const emptyByTab = {
        upcoming: {
          icon: "✈",
          title: "لا توجد رحلات قادمة",
          message:
            "أنشئ رحلتك القادمة، وأضف تفاصيل الحجز والميزانية والتجهيز.",
          actionLabel: "إنشاء رحلة جديدة",
          action: "trips-new"
        },
        ongoing: {
          icon: "◎",
          title: "لا توجد رحلة جارية الآن",
          message:
            "عندما يبدأ موعد إحدى رحلاتك ستنتقل إلى هذا القسم تلقائياً."
        },
        all: {
          icon: "✈",
          title: "لا توجد رحلات",
          message:
            "أضف رحلة قادمة أو سجّل رحلة سابقة لبناء سجل سفرك.",
          actionLabel: "إنشاء رحلة جديدة",
          action: "trips-new"
        }
      };

      return renderEmpty(
        emptyByTab[state.activeTab] ||
        emptyByTab.all
      );
    }

    return `
      <div class="trips-grid">
        ${snapshot.filteredTrips
          .map(renderTripCard)
          .join("")}
      </div>
    `;
  };

  const renderMemoriesShowcase = (snapshot) => {
    const memories = snapshot.trips
      .filter(isMemoryTrip)
      .sort((a, b) =>
        (toDate(b.startDate)?.getTime() || 0) -
        (toDate(a.startDate)?.getTime() || 0)
      );

    return `
      <section class="trips-personal-section trips-personal-section--memory">
        <div class="trips-personal-head">
          <div class="trips-personal-copy">
            <span class="trips-personal-kicker">
              MY TRAVEL LIBRARY
            </span>

            <h2>مكتبة سفراتي</h2>

            <p>
              مكانك الشخصي للرحلات السابقة والذكريات الجميلة
              التي صنعتها في كل وجهة.
            </p>
          </div>

          <span class="trips-personal-icon">♡</span>
        </div>

        ${
          memories.length
            ? `
              <div class="trips-memory-preview">
                ${memories
                  .slice(0, 2)
                  .map(renderMemoryCard)
                  .join("")}
              </div>
            `
            : `
              <div class="trips-personal-empty">
                <span class="trips-personal-empty__icon">♡</span>

                <div>
                  <strong>ابدأ مكتبة ذكرياتك</strong>
                  <p>
                    أضف الرحلات التي سافرتها قبل البرنامج،
                    والرحلات المكتملة ستنضم تلقائياً.
                  </p>
                </div>
              </div>
            `
        }

        <button
          type="button"
          class="trips-personal-action"
          data-action="trips-add-memory"
        >
          ＋ إضافة رحلة سابقة
        </button>
      </section>
    `;
  };

  const renderCountriesShowcase = (snapshot) => `
    <section class="trips-personal-section trips-personal-section--passport">
      <div class="trips-personal-head">
        <div class="trips-personal-copy">
          <span class="trips-personal-kicker">
            MY TRAVEL PASSPORT
          </span>

          <h2>الدول التي زرتها</h2>

          <p>
            كل دولة تزورها تصبح جزءاً من جواز سفرك الشخصي،
            مع عدد الزيارات والمدن المرتبطة بها.
          </p>
        </div>

        <span class="trips-personal-icon">🌍</span>
      </div>

      ${
        snapshot.countries.length
          ? `
            <div class="trips-country-preview">
              <div class="country-grid">
                ${snapshot.countries
                  .map(renderCountryCard)
                  .join("")}
              </div>
            </div>
          `
          : `
            <div class="trips-personal-empty">
              <span class="trips-personal-empty__icon">🌍</span>

              <div>
                <strong>جواز سفرك ما زال فارغاً</strong>
                <p>
                  عند إضافة رحلاتك السابقة ستظهر كل دولة
                  كمغناطيس سفر مميز داخل هذا القسم.
                </p>
              </div>
            </div>
          `
      }
    </section>
  `;

  const renderHub = (snapshot) => `
    <div class="trips-shell">
      <section class="trips-hero">
        <div class="trips-hero__top">
          <span class="trips-hero__eyebrow">
            TRIPS CENTER
          </span>
        </div>

        <div class="trips-hero__content">
          <h1>رحلاتي</h1>

          <p>
            نظّم رحلاتك القادمة واحتفظ بسجل سفر شخصي
            يجمع ذكرياتك والدول التي زرتها.
          </p>
        </div>

        <div class="trips-hero__actions">
          <button
            type="button"
            class="trips-action trips-action--primary"
            data-action="trips-new"
          >
            ＋ رحلة جديدة
          </button>

          <button
            type="button"
            class="trips-action trips-action--glass"
            data-action="trips-add-memory"
          >
            ♡ رحلة سابقة
          </button>
        </div>
      </section>

      <section class="trips-section">
        <div class="trips-section__header">
          <div>
            <p class="trips-section__eyebrow">
              QUICK OVERVIEW
            </p>

            <h2>ملخص سفراتك</h2>

            <p class="trips-section__subtitle">
              أرقام سريعة بدون مساحات كبيرة أو تفاصيل زائدة.
            </p>
          </div>
        </div>

        ${renderOverview(snapshot.statistics)}
      </section>

      <section class="trips-section">
        <div class="trips-section__header">
          <div>
            <p class="trips-section__eyebrow">
              ACTIVE JOURNEYS
            </p>

            <h2>
              ${escapeHTML(
                TAB_LABELS[state.activeTab] ||
                "رحلاتك"
              )}
            </h2>

            <p class="trips-section__subtitle">
              رحلاتك القادمة والجارية في مكان واضح وسريع.
            </p>
          </div>
        </div>

        ${renderTabs()}
        ${renderFilters()}
        ${renderTabContent(snapshot)}
      </section>

      ${renderMemoriesShowcase(snapshot)}
      ${renderCountriesShowcase(snapshot)}
    </div>
  `;

  const renderDetails = (trip) => {
    if (!trip) {
      return renderEmpty({
        icon: "!",
        title: "تعذر العثور على الرحلة",
        message:
          "قد تكون الرحلة حُذفت أو لم تعد متوفرة.",
        actionLabel: "العودة إلى رحلاتي",
        action: "trips-back-to-hub"
      });
    }

    const status = tripStatus(trip);
    const fields = [
      ["الدولة", trip.country || "—"],
      ["المدينة", trip.city || "—"],
      ["التاريخ", formatDate(trip.startDate)],
      [
        "المدة",
        durationDays(trip)
          ? `${durationDays(trip)} يوم`
          : "—"
      ],
      [
        "الميزانية",
        number(trip.budget) > 0
          ? currency(trip.budget)
          : "غير مسجلة"
      ],
      [
        "المصروف",
        number(trip.spent) > 0
          ? currency(trip.spent)
          : "غير مسجل"
      ],
      ["شركة الطيران", trip.airline || "—"],
      ["رقم الرحلة", trip.flightNumber || "—"],
      ["الفندق", trip.accommodation || "—"],
      ["رقم الحجز", trip.bookingReference || "—"],
      [
        "التقييم",
        number(trip.rating) > 0
          ? `${trip.rating}/5`
          : "غير مقيّمة"
      ],
      [
        "أزورها مرة أخرى",
        trip.wouldVisitAgain === true
          ? "نعم"
          : "غير محدد"
      ]
    ];

    return `
      <div class="trips-shell">
        <section class="trips-detail-hero">
          <button
            type="button"
            class="trips-detail-hero__back"
            data-action="trips-back-to-hub"
          >
            ← العودة
          </button>

          <h1>
            ${escapeHTML(
              trip.title ||
              trip.destination ||
              "تفاصيل الرحلة"
            )}
          </h1>

          <p>
            ${escapeHTML(
              trip.destination ||
              [trip.city, trip.country]
                .filter(Boolean)
                .join("، ")
            )}
          </p>

          <div class="trips-detail-actions">
            <span
              class="trip-status-v3"
              data-status="${escapeHTML(status)}"
            >
              ${escapeHTML(
                STATUS_LABELS[status] ||
                status
              )}
            </span>

            <span class="trip-status-v3">
              ${escapeHTML(
                TYPE_LABELS[trip.tripType] ||
                "رحلة"
              )}
            </span>
          </div>

          <div class="trips-detail-actions">
            <button
              type="button"
              class="trips-action trips-action--primary"
              data-action="trips-edit"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              تعديل الرحلة
            </button>

            <button
              type="button"
              class="trips-action trips-action--glass"
              data-action="trips-card-menu"
              data-trip-id="${escapeHTML(trip.id)}"
            >
              إجراءات إضافية
            </button>
          </div>
        </section>

        <section class="trips-section">
          <div class="trips-section__header">
            <div>
              <p class="trips-section__eyebrow">
                JOURNEY DETAILS
              </p>

              <h2>تفاصيل الرحلة</h2>
            </div>
          </div>

          <div class="trips-details-grid">
            ${fields.map(([label, value]) => `
              <article class="trips-detail-box">
                <small>${escapeHTML(label)}</small>
                <strong>${escapeHTML(value)}</strong>
              </article>
            `).join("")}
          </div>
        </section>

        ${
          trip.bestMemory || trip.notes
            ? `
              <section class="trips-section">
                <div class="trips-section__header">
                  <div>
                    <p class="trips-section__eyebrow">
                      MEMORIES
                    </p>

                    <h2>ذكريات وملاحظات</h2>
                  </div>
                </div>

                <div class="trips-details-grid">
                  ${
                    trip.bestMemory
                      ? `
                        <article class="trips-detail-box">
                          <small>أجمل ذكرى</small>
                          <strong>
                            ${escapeHTML(trip.bestMemory)}
                          </strong>
                        </article>
                      `
                      : ""
                  }

                  ${
                    trip.notes
                      ? `
                        <article class="trips-detail-box">
                          <small>ملاحظات الرحلة</small>
                          <strong>
                            ${escapeHTML(trip.notes)}
                          </strong>
                        </article>
                      `
                      : ""
                  }
                </div>
              </section>
            `
            : ""
        }
      </div>
    `;
  };

  const renderPage = (snapshot) => `
    <div
      class="tic-module"
      data-page="trips"
      data-view="${escapeHTML(state.activeView)}"
      data-page-version="${PAGE_VERSION}"
    >
      ${
        state.activeView === "details"
          ? renderDetails(snapshot.activeTrip)
          : renderHub(snapshot)
      }
    </div>
  `;

  const renderMemoryModal = () => {
    const draft = state.memoryDraft || {};

    return `
      <div class="trips-modal-backdrop" data-trips-modal>
        <form class="trips-modal" data-memory-form>
          <div class="trips-modal__header">
            <div>
              <h3>إضافة رحلة سابقة</h3>
              <small style="color:#75839b">
                سجل بسيط لذكرياتك، ويمكنك استكمال التفاصيل لاحقاً.
              </small>
            </div>

            <button
              type="button"
              class="trips-modal__close"
              data-action="trips-close-modal"
              aria-label="إغلاق"
            >
              ×
            </button>
          </div>

          <div class="trips-modal__body">
            <div class="trips-modal__grid">
              <div class="trips-field">
                <label>اسم الرحلة *</label>
                <input
                  name="title"
                  required
                  value="${escapeHTML(draft.title || "")}"
                  placeholder="مثال: رحلة المالديف"
                >
              </div>

              <div class="trips-field">
                <label>الدولة *</label>
                <input
                  name="country"
                  required
                  value="${escapeHTML(draft.country || "")}"
                  placeholder="مثال: المالديف"
                >
              </div>

              <div class="trips-field">
                <label>المدينة أو الجزيرة</label>
                <input
                  name="city"
                  value="${escapeHTML(draft.city || "")}"
                  placeholder="مثال: جنوب ماليه"
                >
              </div>

              <div class="trips-field">
                <label>السنة</label>
                <input
                  name="travelYear"
                  type="number"
                  min="1950"
                  max="2100"
                  value="${escapeHTML(
                    draft.travelYear ||
                    new Date().getFullYear()
                  )}"
                >
              </div>

              <div class="trips-field">
                <label>تاريخ البداية</label>
                <input
                  name="startDate"
                  type="date"
                  value="${escapeHTML(draft.startDate || "")}"
                >
              </div>

              <div class="trips-field">
                <label>تاريخ النهاية</label>
                <input
                  name="endDate"
                  type="date"
                  value="${escapeHTML(draft.endDate || "")}"
                >
              </div>

              <div class="trips-field">
                <label>نوع الرحلة</label>
                <select name="tripType">
                  ${Object.entries(TYPE_LABELS)
                    .map(([value, label]) => `
                      <option
                        value="${escapeHTML(value)}"
                        ${
                          (draft.tripType || "family") === value
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHTML(label)}
                      </option>
                    `)
                    .join("")}
                </select>
              </div>

              <div class="trips-field">
                <label>من سافر معك؟</label>
                <input
                  name="travelCompanions"
                  value="${escapeHTML(draft.travelCompanions || "")}"
                  placeholder="العائلة، الزوجة، الأصدقاء..."
                >
              </div>

              <div class="trips-field">
                <label>الفندق أو السكن</label>
                <input
                  name="accommodation"
                  value="${escapeHTML(draft.accommodation || "")}"
                  placeholder="اختياري"
                >
              </div>

              <div class="trips-field">
                <label>التقييم</label>
                <select name="rating">
                  <option value="">غير محدد</option>
                  ${[5, 4, 3, 2, 1]
                    .map((rating) => `
                      <option
                        value="${rating}"
                        ${
                          String(draft.rating || "") === String(rating)
                            ? "selected"
                            : ""
                        }
                      >
                        ${rating} من 5
                      </option>
                    `)
                    .join("")}
                </select>
              </div>
            </div>

            <div class="trips-field">
              <label>المدن أو الأماكن التي زرتها</label>
              <input
                name="cities"
                value="${escapeHTML(
                  Array.isArray(draft.cities)
                    ? draft.cities.join("، ")
                    : draft.cities || ""
                )}"
                placeholder="افصل بينها بفاصلة"
              >
            </div>

            <div class="trips-field">
              <label>أجمل ذكرى</label>
              <textarea
                name="bestMemory"
                placeholder="ما أكثر شيء بقي في ذاكرتك؟"
              >${escapeHTML(draft.bestMemory || "")}</textarea>
            </div>

            <div class="trips-field">
              <label>ملاحظات إضافية</label>
              <textarea
                name="notes"
                placeholder="أماكن، مطاعم، نصائح أو مواقف جميلة..."
              >${escapeHTML(draft.notes || "")}</textarea>
            </div>

            <label style="display:flex;align-items:center;gap:10px;font-weight:900">
              <input
                type="checkbox"
                name="wouldVisitAgain"
                value="true"
                ${
                  draft.wouldVisitAgain === true
                    ? "checked"
                    : ""
                }
              >
              أرغب بزيارة هذه الوجهة مرة أخرى
            </label>
          </div>

          <div class="trips-modal__footer">
            <button
              type="button"
              class="trips-btn trips-btn--secondary"
              data-action="trips-close-modal"
            >
              إلغاء
            </button>

            <button
              type="submit"
              class="trips-btn trips-btn--primary"
            >
              حفظ في مكتبة السفر
            </button>
          </div>
        </form>
      </div>
    `;
  };

  const showMemoryModal = () => {
    closeModal();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderMemoryModal();

    const modal =
      wrapper.firstElementChild;

    if (!modal) return false;

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";

    const form =
      modal.querySelector("[data-memory-form]");

    form?.addEventListener(
      "submit",
      handleMemorySubmit
    );

    modal.addEventListener("click", (event) => {
      if (
        event.target === modal ||
        event.target.closest(
          '[data-action="trips-close-modal"]'
        )
      ) {
        closeModal();
      }
    });

    return true;
  };

  const closeModal = () => {
    document
      .querySelector("[data-trips-modal]")
      ?.remove();

    document.body.style.overflow = "";
  };

  const handleMemorySubmit = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const title = text(formData.get("title"));
    const country = text(formData.get("country"));
    const travelYear =
      number(formData.get("travelYear")) ||
      new Date().getFullYear();

    if (!title || !country) {
      getUI()?.toast?.(
        "أدخل اسم الرحلة والدولة.",
        "error"
      );

      return false;
    }

    const rawStart =
      text(formData.get("startDate"));

    const rawEnd =
      text(formData.get("endDate"));

    const fallbackStart =
      `${travelYear}-01-01`;

    const now =
      new Date().toISOString();

    const cities = text(
      formData.get("cities")
    )
      .split(/[،,]/)
      .map(text)
      .filter(Boolean);

    const trip = {
      id: createId("memory"),
      title,
      destination:
        [text(formData.get("city")), country]
          .filter(Boolean)
          .join("، "),
      country,
      city: text(formData.get("city")),
      cities,
      countryFlag: countryFlag(country),
      travelYear,
      startDate: rawStart || fallbackStart,
      endDate: rawEnd || rawStart || fallbackStart,
      tripType:
        text(formData.get("tripType")) ||
        "family",
      travelCompanions: text(
        formData.get("travelCompanions")
      ),
      accommodation: text(
        formData.get("accommodation")
      ),
      rating: number(formData.get("rating")),
      bestMemory: text(
        formData.get("bestMemory")
      ),
      notes: text(formData.get("notes")),
      wouldVisitAgain:
        formData.get("wouldVisitAgain") === "true",
      status: "completed",
      isMemory: true,
      memorySource: "manual-history",
      budget: 0,
      spent: 0,
      createdAt: now,
      updatedAt: now
    };

    try {
      getUI()?.showLoader?.(
        "جاري حفظ ذكرى السفر..."
      );

      await addTripToStore(trip);

      closeModal();

      state.activeTab = "upcoming";
      state.activeView = "hub";
      state.memoryDraft = null;

      refresh();

      getUI()?.toast?.(
        "تمت إضافة الرحلة إلى مكتبة السفر.",
        "success"
      );

      emit("memory-created", {
        tripId: trip.id,
        country: trip.country
      });

      return true;
    } catch (error) {
      console.error(
        "TIC Trips memory create error:",
        error
      );

      getUI()?.toast?.(
        "تعذر حفظ رحلة الذكريات.",
        "error"
      );

      return false;
    } finally {
      getUI()?.hideLoader?.();
    }
  };

  const readActionParams = (payload = {}) => {
    const event =
      payload.event ||
      payload.originalEvent ||
      null;

    const source =
      event?.target?.closest?.(
        "[data-trip-id]"
      ) ||
      null;

    return {
      ...(payload.params || {}),
      tripId:
        payload.params?.tripId ||
        payload.params?.id ||
        source?.getAttribute("data-trip-id") ||
        null
    };
  };

  const applyInputBindings = () => {
    if (!state.container) return;

    state.container
      .querySelectorAll("[data-trips-tab]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            state.activeTab =
              button.getAttribute(
                "data-trips-tab"
              ) || "upcoming";

            state.filters.search = "";
            state.filters.status = "all";
            state.filters.type = "all";

            refresh();

            state.container
              ?.querySelector(
                ".trips-section:last-of-type"
              )
              ?.scrollIntoView({
                behavior: "smooth",
                block: "start"
              });
          }
        );
      });

    const searchInput =
      state.container.querySelector(
        "[data-trips-search]"
      );

    searchInput?.addEventListener(
      "input",
      (event) => {
        state.filters.search =
          event.target.value;

        refresh({
          preserveFocus: true
        });
      }
    );

    state.container
      .querySelector(
        "[data-trips-filter-status]"
      )
      ?.addEventListener(
        "change",
        (event) => {
          state.filters.status =
            event.target.value;
          refresh();
        }
      );

    state.container
      .querySelector(
        "[data-trips-filter-type]"
      )
      ?.addEventListener(
        "change",
        (event) => {
          state.filters.type =
            event.target.value;
          refresh();
        }
      );

    state.container
      .querySelector("[data-trips-sort]")
      ?.addEventListener(
        "change",
        (event) => {
          state.filters.sort =
            event.target.value;
          refresh();
        }
      );
  };

  const refresh = (options = {}) => {
    if (!state.container || !state.mounted) {
      return false;
    }

    const activeElement =
      document.activeElement;

    const preserveSearch =
      options.preserveFocus === true &&
      activeElement?.matches?.(
        "[data-trips-search]"
      );

    const cursor =
      preserveSearch &&
      typeof activeElement.selectionStart ===
        "number"
        ? activeElement.selectionStart
        : null;

    const snapshot = buildSnapshot();

    state.container.innerHTML =
      renderPage(snapshot);

    applyInputBindings();

    if (preserveSearch) {
      const input =
        state.container.querySelector(
          "[data-trips-search]"
        );

      if (input) {
        input.focus();

        if (cursor !== null) {
          input.setSelectionRange(
            cursor,
            cursor
          );
        }
      }
    }

    emit("refreshed", {
      view: state.activeView,
      tab: state.activeTab,
      tripCount:
        snapshot.filteredTrips.length,
      activeTripId: state.activeTripId
    });

    return true;
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !== "function"
    ) {
      return;
    }

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe =
        ui.registerAction(name, handler);

      if (typeof unsubscribe === "function") {
        state.actionUnsubscribers.push(
          unsubscribe
        );
      }
    };

    register("trips-new", () => {
      const tripForm = getTripForm();

      if (tripForm?.openCreate) {
        return tripForm.openCreate();
      }

      return getRouter()?.go?.("trip-form", {
        params: {
          mode: "create"
        },
        source: "trips-new"
      });
    });

    register("trips-add-memory", () => {
      state.memoryDraft = {};
      return showMemoryModal();
    });

    register("trips-close-modal", () => {
      closeModal();
      return true;
    });

    register("trips-toggle-filters", () => {
      state.filtersOpen =
        !state.filtersOpen;
      refresh();
      return true;
    });

    register("trips-clear-filters", () => {
      state.filters = {
        search: "",
        status: "all",
        type: "all",
        sort: "start-asc"
      };

      refresh();
      return true;
    });

    register(
      "trips-view-details",
      (payload) => {
        const { tripId } =
          readActionParams(payload);

        if (!tripId || !findTrip(tripId)) {
          return false;
        }

        state.activeTripId = tripId;
        state.activeView = "details";

        refresh();

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });

        return true;
      }
    );

    register("trips-back-to-hub", () => {
      state.activeView = "hub";
      state.activeTripId = null;

      refresh();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      return true;
    });

    register("trips-edit", (payload) => {
      const { tripId } =
        readActionParams(payload);

      if (!tripId) return false;

      const trip = findTrip(tripId);

      if (!trip) return false;

      const tripForm = getTripForm();

      if (
        trip.isMemory === true &&
        !tripForm?.openEdit
      ) {
        state.memoryDraft = clone(trip);
        return showMemoryModal();
      }

      if (tripForm?.openEdit) {
        return tripForm.openEdit(tripId);
      }

      return getRouter()?.go?.("trip-form", {
        params: {
          mode: "edit",
          tripId
        },
        source: "trips-edit"
      });
    });

    register(
      "trips-card-menu",
      async (payload) => {
        const { tripId } =
          readActionParams(payload);

        const trip = findTrip(tripId);

        if (!trip) {
          ui.toast?.(
            "تعذر العثور على الرحلة.",
            "error"
          );
          return false;
        }

        const choice =
          typeof ui.dialog === "function"
            ? await ui.dialog({
                title: "إجراءات الرحلة",
                message:
                  trip.title ||
                  trip.destination ||
                  "الرحلة",
                icon: "✈",
                actions: [
                  {
                    label: "إلغاء",
                    result: "cancel"
                  },
                  {
                    label: "تعديل",
                    result: "edit",
                    primary: true
                  },
                  {
                    label: "نسخ",
                    result: "duplicate"
                  },
                  {
                    label: "حذف",
                    result: "delete",
                    danger: true
                  }
                ]
              })
            : window.prompt(
                "اكتب: edit أو duplicate أو delete"
              );

        if (choice === "edit") {
          const tripForm = getTripForm();

          if (tripForm?.openEdit) {
            return tripForm.openEdit(tripId);
          }

          return getRouter()?.go?.("trip-form", {
            params: {
              mode: "edit",
              tripId
            },
            source: "trips-card-menu-edit"
          });
        }

        if (choice === "duplicate") {
          const confirmed =
            typeof ui.confirm === "function"
              ? await ui.confirm({
                  title: "تكرار الرحلة",
                  message:
                    `سيتم إنشاء نسخة جديدة من "${
                      trip.title ||
                      trip.destination
                    }".`,
                  confirmLabel: "إنشاء نسخة",
                  cancelLabel: "إلغاء"
                })
              : window.confirm(
                  "هل تريد إنشاء نسخة من هذه الرحلة؟"
                );

          if (confirmed !== true) {
            return false;
          }

          try {
            ui.showLoader?.(
              "جاري إنشاء نسخة..."
            );

            const duplicate =
              await duplicateTripInStore(
                tripId
              );

            state.activeView = "hub";
            state.activeTab = "upcoming";
            state.activeTripId = null;

            refresh();

            ui.toast?.(
              "تم إنشاء نسخة جديدة.",
              "success"
            );

            return duplicate;
          } finally {
            ui.hideLoader?.();
          }
        }

        if (choice === "delete") {
          const confirmed =
            typeof ui.confirm === "function"
              ? await ui.confirm({
                  title: "حذف الرحلة",
                  message:
                    `سيتم حذف "${
                      trip.title ||
                      trip.destination
                    }" نهائياً.`,
                  confirmLabel: "حذف",
                  cancelLabel: "إلغاء",
                  danger: true
                })
              : window.confirm(
                  "هل تريد حذف هذه الرحلة نهائياً؟"
                );

          if (confirmed !== true) {
            return false;
          }

          try {
            ui.showLoader?.(
              "جاري حذف الرحلة..."
            );

            await deleteTripFromStore(tripId);

            state.activeView = "hub";
            state.activeTripId = null;

            refresh();

            ui.toast?.(
              "تم حذف الرحلة.",
              "success"
            );

            return true;
          } finally {
            ui.hideLoader?.();
          }
        }

        return false;
      }
    );

    register(
      "trips-duplicate",
      async (payload) => {
        const { tripId } =
          readActionParams(payload);

        const trip = findTrip(tripId);

        if (!trip) return false;

        const confirmed =
          typeof ui.confirm === "function"
            ? await ui.confirm({
                title: "تكرار الرحلة",
                message:
                  `سيتم إنشاء نسخة جديدة من "${
                    trip.title ||
                    trip.destination
                  }".`,
                confirmLabel: "إنشاء نسخة",
                cancelLabel: "إلغاء"
              })
            : window.confirm(
                "هل تريد إنشاء نسخة من هذه الرحلة؟"
              );

        if (confirmed !== true) {
          return false;
        }

        try {
          ui.showLoader?.(
            "جاري إنشاء نسخة..."
          );

          const duplicate =
            await duplicateTripInStore(
              tripId
            );

          state.activeView = "hub";
          state.activeTab = "upcoming";
          state.activeTripId = null;

          refresh();

          ui.toast?.(
            "تم إنشاء نسخة جديدة.",
            "success"
          );

          emit("duplicated", {
            sourceTripId: tripId,
            duplicateTripId:
              duplicate?.id || null
          });

          return duplicate;
        } catch (error) {
          console.error(
            "TIC Trips duplicate error:",
            error
          );

          ui.toast?.(
            "تعذر تكرار الرحلة.",
            "error"
          );

          return false;
        } finally {
          ui.hideLoader?.();
        }
      }
    );

    register(
      "trips-delete",
      async (payload) => {
        const { tripId } =
          readActionParams(payload);

        const trip = findTrip(tripId);

        if (!trip) return false;

        const confirmed =
          typeof ui.confirm === "function"
            ? await ui.confirm({
                title: "حذف الرحلة",
                message:
                  `سيتم حذف "${
                    trip.title ||
                    trip.destination
                  }" نهائياً.`,
                confirmLabel: "حذف",
                cancelLabel: "إلغاء",
                danger: true
              })
            : window.confirm(
                "هل تريد حذف هذه الرحلة نهائياً؟"
              );

        if (confirmed !== true) {
          return false;
        }

        try {
          ui.showLoader?.(
            "جاري حذف الرحلة..."
          );

          await deleteTripFromStore(tripId);

          state.activeView = "hub";
          state.activeTripId = null;

          refresh();

          ui.toast?.(
            "تم حذف الرحلة.",
            "success"
          );

          emit("deleted", {
            tripId
          });

          return true;
        } catch (error) {
          console.error(
            "TIC Trips delete error:",
            error
          );

          ui.toast?.(
            "تعذر حذف الرحلة.",
            "error"
          );

          return false;
        } finally {
          ui.hideLoader?.();
        }
      }
    );
  };

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !== "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    state.unsubscribeStore =
      store.subscribe(() => {
        if (state.mounted) {
          refresh();
        }
      });
  };

  const TripsPage = {
    id: PAGE_ID,
    title: "رحلاتي",
    icon: "✈",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      ensureStyles();
      registerActions();
      subscribeToStore();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION
      });

      return this.diagnostics();
    },

    render(context = {}) {
      this.init();

      const params =
        context.params || {};

      if (params.tripId) {
        state.activeTripId =
          params.tripId;
      }

      if (
        params.view === "details" &&
        params.tripId
      ) {
        state.activeView = "details";
      } else {
        state.activeView = "hub";
      }

      if (params.tab && TAB_LABELS[params.tab]) {
        state.activeTab = params.tab;
      }

      return renderPage(buildSnapshot());
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Trips Error: route container not found."
        );
      }

      const params =
        context.params || {};

      state.activeView =
        params.view === "details" &&
        params.tripId
          ? "details"
          : "hub";

      state.activeTripId =
        params.tripId || null;

      if (params.tab && TAB_LABELS[params.tab]) {
        state.activeTab = params.tab;
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      applyInputBindings();

      emit("mounted", {
        view: state.activeView,
        tab: state.activeTab,
        activeTripId: state.activeTripId,
        tripCount: snapshot.trips.length
      });

      return container;
    },

    afterEnter(context = {}) {
      const container = resolveContainer(
        context.container
      );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      applyInputBindings();
      return true;
    },

    unmount() {
      closeModal();

      state.mounted = false;
      state.container = null;

      emit("unmounted", {
        view: state.activeView,
        tab: state.activeTab,
        activeTripId: state.activeTripId
      });

      return true;
    },

    refresh,

    openTrip(tripId) {
      if (!findTrip(tripId)) {
        return false;
      }

      state.activeTripId = tripId;
      state.activeView = "details";

      return refresh();
    },

    openHub(tab = "upcoming") {
      state.activeTripId = null;
      state.activeView = "hub";

      if (TAB_LABELS[tab]) {
        state.activeTab = tab;
      }

      return refresh();
    },

    openList() {
      return this.openHub("all");
    },

    openMemories() {
      state.activeView = "hub";
      state.activeTab = "upcoming";
      const result = refresh();

      window.requestAnimationFrame(() => {
        state.container
          ?.querySelector(".trips-personal-section--memory")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      });

      return result;
    },

    openCountries() {
      state.activeView = "hub";
      state.activeTab = "upcoming";
      const result = refresh();

      window.requestAnimationFrame(() => {
        state.container
          ?.querySelector(".trips-personal-section--passport")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      });

      return result;
    },

    addPastTrip() {
      state.memoryDraft = {};
      return showMemoryModal();
    },

    setFilters(filters = {}) {
      state.filters = {
        ...state.filters,
        ...clone(filters)
      };

      refresh();

      return clone(state.filters);
    },

    getFilters() {
      return clone(state.filters);
    },

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Trips subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    destroy() {
      this.unmount();

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          if (
            typeof unsubscribe === "function"
          ) {
            unsubscribe();
          }
        }
      );

      document
        .getElementById(STYLE_ID)
        ?.remove();

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.activeView = "hub";
      state.activeTab = "upcoming";
      state.activeTripId = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized: state.initialized,
        mounted: state.mounted,
        activeView: state.activeView,
        activeTab: state.activeTab,
        activeTripId: state.activeTripId,
        filters: clone(state.filters),
        filtersOpen: state.filtersOpen,
        hasContainer: Boolean(state.container),
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI()),
        tripFormAvailable: Boolean(
          getTripForm()
        ),
        actionCount:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot: Boolean(
          state.lastSnapshot
        )
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.trips = TripsPage;
  window.TICTripsPage = TripsPage;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("trips")) {
      router.register("trips", {
        id: "trips",
        title: "رحلاتي",
        module: "trips",
        icon: "✈",
        visible: true,
        order: 2
      });
    }

    if (
      typeof router.registerPage === "function"
    ) {
      router.registerPage(
        "trips",
        TripsPage
      );
    }
  }

  TripsPage.init();
})(window, document);
