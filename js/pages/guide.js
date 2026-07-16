/* =========================================================
   Travel Intelligence Center
   Guide Intelligence Platform Page V4.4.0

   File Path:
   js/pages/guide.js

   Purpose:
   - Rebuilds the Guide page into a shorter, smoother iPhone-first experience.
   - Replaces the long vertical recommendation list with a compact horizontal rail.
   - Keeps only the most useful information visible inside recommendation cards.
   - Uses one delegated event layer instead of rebinding many listeners after every render.
   - Prevents Store refreshes and full page rendering while the user is actively scrolling.
   - Keeps the country picker mounted safely under document.body.
   - Preserves GuideEngine, TravelAI, PlannerEngine, Store, Router and UI integration.
   - Preserves wishlist, annual planning, country details and trip creation flows.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/world-data.js
   - js/features/guide-engine.js
   - js/features/travel-ai.js
   - js/features/planner-engine.js

   Global APIs:
   - window.TIC.Pages.guide
   - window.TICGuidePage
========================================================= */

(function guidePageFactory(window, document) {
  "use strict";

  const PAGE_ID = "guide";
  const PAGE_VERSION = "4.4.0";
  const RECOMMENDATION_LIMIT = 8;
  const SEARCH_RESULT_LIMIT = 300;
  const STORE_REFRESH_DELAY = 220;
  const SCROLL_IDLE_DELAY = 220;

  const MONTHS_AR = Object.freeze([
    "",
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ]);

  const VIEW_SECTIONS = Object.freeze([
    { id: "overview", label: "نظرة عامة", icon: "◎" },
    { id: "weather", label: "الطقس", icon: "☀️" },
    { id: "stay", label: "الفنادق", icon: "⌂" },
    { id: "explore", label: "الأماكن", icon: "✦" },
    { id: "essentials", label: "الأساسيات", icon: "◈" },
    { id: "planner", label: "الخطة", icon: "▣" }
  ]);

  const state = {
    initialized: false,
    mounted: false,
    container: null,

    activeView: "discover",
    activeSection: "overview",
    selectedCountryCode: "",

    selectedDays: 7,
    selectedTravelers: 2,
    selectedMonth: new Date().getMonth() + 1,
    selectedBudget: 0,

    search: "",
    countryPickerOpen: false,
    countrySheetRoot: null,
    countrySheetReturnFocus: null,
    bodyScrollY: 0,

    snapshot: null,
    cacheKey: "",
    cacheSnapshot: null,

    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),

    rendering: false,
    refreshQueued: false,
    isUserScrolling: false,

    storeRefreshTimer: null,
    scrollTimer: null,
    searchTimer: null,
    scrollFrame: null,

    delegatedClickHandler: null,
    delegatedChangeHandler: null,
    delegatedInputHandler: null,
    scrollHandler: null,
    scrollTarget: null,
    escapeHandler: null
  };

  /* =========================================================
     Utilities
  ========================================================= */

  const clone = (value) => {
    if (value === undefined) return undefined;

    try {
      return structuredClone(value);
    } catch (_) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    }
  };

  const safeArray = (value) =>
    Array.isArray(value) ? clone(value) : [];

  const text = (value, fallback = "") =>
    String(
      value === undefined || value === null
        ? fallback
        : value
    ).trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const normalizeSearch = (value) =>
    text(value)
      .toLocaleLowerCase("ar")
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/\s+/g, " ");

  const formatAED = (value) =>
    `${Math.round(number(value, 0)).toLocaleString("ar-AE")} د.إ`;

  const monthLabel = (month) =>
    MONTHS_AR[clamp(number(month, 1), 1, 12)] || "";

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    window.Store ||
    window.TravelStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getGuideEngine = () =>
    window.GuideEngine || null;

  const getTravelAI = () =>
    window.TravelAI ||
    window.TravelIntelligence ||
    null;

  const getPlannerEngine = () =>
    window.PlannerEngine ||
    window.TravelPlannerEngine ||
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

  const safeToast = (message, tone = "success") => {
    const ui = getUI();

    try {
      if (typeof ui?.toast === "function") {
        ui.toast(message, tone);
        return true;
      }
    } catch (_) {
      try {
        ui.toast(message, { tone });
        return true;
      } catch (_) {
        return false;
      }
    }

    return false;
  };

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      version: PAGE_VERSION,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Guide subscriber error:", error);
      }
    });

    try {
      window.dispatchEvent(
        new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
          detail: payload
        })
      );
    } catch (_) {
      // Ignore unsupported test environments.
    }

    return payload;
  };

  const renderButton = ({
    label,
    action,
    params = {},
    primary = false,
    block = false,
    icon = "",
    compact = false
  }) => {
    const ui = getUI();

    if (typeof ui?.button === "function" && !compact) {
      return ui.button({
        label,
        action,
        params,
        primary,
        block,
        icon
      });
    }

    const attributes = Object.entries(params)
      .map(
        ([key, value]) =>
          `data-param-${escapeHTML(key)}="${escapeHTML(value)}"`
      )
      .join(" ");

    return `
      <button
        type="button"
        class="tic-button ${primary ? "is-primary" : ""} ${
          block ? "is-block" : ""
        } ${compact ? "guide-button-compact" : ""}"
        data-action="${escapeHTML(action)}"
        ${attributes}
      >
        ${icon ? `<span aria-hidden="true">${escapeHTML(icon)}</span>` : ""}
        ${escapeHTML(label)}
      </button>
    `;
  };

  const cacheSignature = () =>
    [
      state.activeView,
      state.activeSection,
      state.selectedCountryCode,
      state.selectedDays,
      state.selectedTravelers,
      state.selectedMonth,
      state.selectedBudget
    ].join("|");

  const invalidateSnapshotCache = () => {
    state.cacheKey = "";
    state.cacheSnapshot = null;
  };

  const getScrollTop = () => {
    if (
      state.container &&
      state.container.scrollHeight > state.container.clientHeight
    ) {
      return state.container.scrollTop;
    }

    return window.scrollY || document.documentElement.scrollTop || 0;
  };

  const restoreScrollTop = (value) => {
    window.requestAnimationFrame(() => {
      if (
        state.container &&
        state.container.scrollHeight > state.container.clientHeight
      ) {
        state.container.scrollTop = value;
      } else {
        window.scrollTo(0, value);
      }
    });
  };

  /* =========================================================
     Snapshot
  ========================================================= */

  const getAllCountries = (guide) => {
    try {
      return safeArray(guide.getCountries?.({ query: "" }));
    } catch (_) {
      return [];
    }
  };

  const filterCountries = (countries, query) => {
    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {
      return countries.slice(0, SEARCH_RESULT_LIMIT);
    }

    return countries
      .filter((country) => {
        const haystack = normalizeSearch(
          [
            country.nameAr,
            country.nameEn,
            country.code,
            country.capital,
            safeArray(country.cities)
              .map((city) => city?.nameAr || city?.name || city)
              .join(" ")
          ].join(" ")
        );

        return haystack.includes(normalizedQuery);
      })
      .slice(0, SEARCH_RESULT_LIMIT);
  };

  const buildSnapshot = async ({ force = false } = {}) => {
    const signature = cacheSignature();

    if (
      !force &&
      state.cacheSnapshot &&
      state.cacheKey === signature
    ) {
      return clone(state.cacheSnapshot);
    }

    const guide = getGuideEngine();
    const ai = getTravelAI();
    const planner = getPlannerEngine();

    if (!guide) {
      return {
        ready: false,
        error: "GuideEngine غير متوفر."
      };
    }

    await guide.init?.();

    const summary = guide.getSummary?.() || {};
    const allCountries = getAllCountries(guide);

    const selectedCountry = state.selectedCountryCode
      ? guide.getCountry?.(state.selectedCountryCode)
      : null;

    const countryGuide = selectedCountry
      ? guide.getCountryGuide?.(
          selectedCountry.code,
          {
            days: state.selectedDays,
            travelers: state.selectedTravelers,
            month: state.selectedMonth,
            budget: state.selectedBudget
          }
        )
      : null;

    let recommendations = [];

    try {
      recommendations =
        (await guide.getRecommendations?.({
          limit: RECOMMENDATION_LIMIT,
          budget: state.selectedBudget || undefined,
          days: state.selectedDays,
          month: state.selectedMonth,
          excludeLowRated: true,
          useRatings: true,
          useTravelDNA: true
        })) || [];
    } catch (error) {
      console.error("TIC Guide recommendations error:", error);
    }

    let itinerary = null;

    if (selectedCountry && state.activeSection === "planner") {
      try {
        itinerary =
          ai?.generateItinerary?.(
            selectedCountry,
            {
              days: state.selectedDays,
              travelers: state.selectedTravelers,
              month: state.selectedMonth,
              budget: state.selectedBudget
            }
          ) || null;
      } catch (error) {
        console.error("TIC Guide itinerary error:", error);
      }
    }

    const wishlist =
      planner?.getWishlist?.() ||
      guide.getWishlist?.() ||
      [];

    const annualPlans =
      planner?.getAnnualPlans?.() ||
      [];

    const snapshot = {
      ready: true,
      summary,
      allCountries,
      countries: filterCountries(allCountries, state.search),
      selectedCountry,
      countryGuide,
      recommendations: safeArray(recommendations),
      itinerary,
      wishlist: safeArray(wishlist),
      annualPlans: safeArray(annualPlans)
    };

    state.cacheKey = signature;
    state.cacheSnapshot = clone(snapshot);

    return snapshot;
  };

  /* =========================================================
     Shared renderers
  ========================================================= */

  const renderSection = ({
    eyebrow,
    title,
    subtitle,
    content,
    compact = false,
    className = ""
  }) => `
    <section
      class="tic-section guide-section ${compact ? "is-compact" : ""} ${escapeHTML(className)}"
    >
      <div class="tic-section-head guide-section-head">
        <div>
          ${eyebrow ? `<span class="tic-eyebrow">${escapeHTML(eyebrow)}</span>` : ""}
          <h2>${escapeHTML(title)}</h2>
          ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
        </div>
      </div>
      ${content}
    </section>
  `;

  const renderEmpty = (
    title,
    message,
    icon = "⌕",
    compact = false
  ) => `
    <div class="tic-empty guide-empty ${compact ? "is-compact" : ""}">
      <span>${escapeHTML(icon)}</span>
      <div>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(message)}</p>
      </div>
    </div>
  `;

  const renderCompactOverview = (snapshot) => {
    const stats = [
      {
        icon: "🌍",
        value:
          snapshot.summary.totalCountries ||
          snapshot.allCountries.length,
        label: "دولة"
      },
      {
        icon: "✓",
        value: snapshot.summary.visitedCountries || 0,
        label: "زرتها"
      },
      {
        icon: "☆",
        value:
          snapshot.summary.wishlistCountries ||
          snapshot.wishlist.length,
        label: "أمنية"
      },
      {
        icon: "🗓️",
        value:
          snapshot.summary.annualPlans ||
          snapshot.annualPlans.length,
        label: "خطة"
      }
    ];

    return `
      <div class="guide-overview-strip" aria-label="ملخص الدليل">
        ${stats
          .map(
            (item) => `
              <article class="guide-overview-item">
                <span class="guide-overview-icon">
                  ${escapeHTML(item.icon)}
                </span>
                <strong>${escapeHTML(item.value)}</strong>
                <small>${escapeHTML(item.label)}</small>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderPlannerControls = ({
    compact = true
  } = {}) => `
    <div class="tic-card guide-planner-card ${compact ? "is-compact" : ""}">
      <div class="tic-card-body">
        <div class="guide-quick-grid">
          <label class="guide-quick-field">
            <span>الأيام</span>
            <input
              type="number"
              min="1"
              max="30"
              value="${escapeHTML(state.selectedDays)}"
              data-guide-days
              inputmode="numeric"
            >
          </label>

          <label class="guide-quick-field">
            <span>المسافرون</span>
            <input
              type="number"
              min="1"
              max="20"
              value="${escapeHTML(state.selectedTravelers)}"
              data-guide-travelers
              inputmode="numeric"
            >
          </label>

          <label class="guide-quick-field">
            <span>الشهر</span>
            <select data-guide-month>
              ${MONTHS_AR.slice(1)
                .map(
                  (label, index) => `
                    <option
                      value="${index + 1}"
                      ${state.selectedMonth === index + 1 ? "selected" : ""}
                    >
                      ${escapeHTML(label)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          <label class="guide-quick-field">
            <span>الميزانية</span>
            <input
              type="number"
              min="0"
              step="500"
              value="${escapeHTML(state.selectedBudget || "")}"
              placeholder="15000"
              data-guide-budget
              inputmode="numeric"
            >
          </label>
        </div>
      </div>
    </div>
  `;

  /* =========================================================
     Discover view
  ========================================================= */

  const renderHero = () => `
    <section class="tic-hero guide-hero">
      <span class="tic-chip">Travel Intelligence Guide</span>
      <h1>دليل السفر الذكي</h1>
      <p>
        اختر وجهتك وخذ دليلاً عملياً يناسب ميزانيتك ومدة رحلتك
        وتفضيلاتك الحقيقية.
      </p>

      <div class="guide-hero-actions">
        ${renderButton({
          label: "ابدأ التخطيط",
          action: "guide-focus-country-search",
          primary: true,
          block: true,
          icon: "🌍"
        })}

        ${renderButton({
          label: "خططي",
          action: "guide-scroll-annual-plans",
          block: true,
          icon: "🗓️"
        })}
      </div>
    </section>
  `;

  const renderCountryOptions = (countries) => {
    if (!countries.length) {
      return renderEmpty(
        "لا توجد نتيجة",
        "جرب كتابة اسم الدولة بالعربي أو الإنجليزي.",
        "⌕",
        true
      );
    }

    return countries
      .map(
        (country) => `
          <button
            type="button"
            class="guide-country-option"
            data-guide-country-option="${escapeHTML(country.code)}"
          >
            <span class="guide-country-flag">
              ${escapeHTML(country.flag || "🌍")}
            </span>

            <span class="guide-country-option-copy">
              <strong>${escapeHTML(country.nameAr)}</strong>
              <small>${escapeHTML(country.nameEn || country.code)}</small>
            </span>

            <span aria-hidden="true">‹</span>
          </button>
        `
      )
      .join("");
  };

  const renderCountryPicker = (snapshot) => {
    const selected =
      snapshot.allCountries.find(
        (country) =>
          country.code === state.selectedCountryCode
      ) || null;

    return `
      <div class="tic-card guide-country-card" data-guide-search-card>
        <div class="tic-card-body">
          <div class="guide-picker-summary">
            <div>
              <span>الدولة</span>
              <strong>
                ${
                  selected
                    ? `${escapeHTML(selected.flag || "🌍")} ${escapeHTML(selected.nameAr)}`
                    : "اختر وجهتك"
                }
              </strong>
              <small>ابحث واختر من قائمة الدول الكاملة.</small>
            </div>

            <span
              class="guide-picker-summary-icon"
              aria-hidden="true"
            >
              🌍
            </span>
          </div>

          <button
            type="button"
            class="guide-country-open-button"
            data-guide-open-country-sheet
            aria-haspopup="dialog"
            aria-expanded="${state.countryPickerOpen ? "true" : "false"}"
          >
            <span aria-hidden="true">⌕</span>
            <span>
              ${selected ? "تغيير الدولة" : "ابحث واختر الدولة"}
            </span>
            <span aria-hidden="true">‹</span>
          </button>
        </div>
      </div>
    `;
  };

  const renderCountrySheet = (snapshot) => {
    if (!state.countryPickerOpen) return "";

    return `
      <div
        class="guide-country-sheet-backdrop"
        data-guide-country-sheet-backdrop
        role="presentation"
      >
        <section
          class="guide-country-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-country-sheet-title"
          data-guide-country-sheet
        >
          <div
            class="guide-country-sheet-handle"
            aria-hidden="true"
          ></div>

          <header class="guide-country-sheet-header">
            <div>
              <span>DESTINATION PICKER</span>
              <h2 id="guide-country-sheet-title">اختر الدولة</h2>
              <p>ابحث بالعربي أو الإنجليزي ثم اضغط على الدولة.</p>
            </div>

            <button
              type="button"
              class="guide-country-sheet-close"
              data-guide-close-country-sheet
              aria-label="إغلاق قائمة الدول"
            >
              ×
            </button>
          </header>

          <div class="guide-country-sheet-search">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              data-guide-sheet-search
              value="${escapeHTML(state.search)}"
              placeholder="اكتب اسم الدولة..."
              autocomplete="off"
              enterkeyhint="search"
              aria-label="البحث عن دولة"
            >

            ${
              state.search
                ? `
                  <button
                    type="button"
                    data-guide-clear-sheet-search
                    aria-label="مسح البحث"
                  >
                    ×
                  </button>
                `
                : ""
            }
          </div>

          <div class="guide-country-sheet-count">
            <span>
              ${escapeHTML(snapshot.countries.length)}
              ${snapshot.countries.length === 1 ? "نتيجة" : "دولة"}
            </span>
            <small>مرر داخل القائمة فقط</small>
          </div>

          <div
            class="guide-country-sheet-list"
            data-guide-country-sheet-list
          >
            ${renderCountryOptions(snapshot.countries)}
          </div>
        </section>
      </div>
    `;
  };

  const renderRecommendationCard = (item, index) => {
    const country = item.country || item;
    const score = Math.round(
      number(
        item.score || country.recommendationScore,
        0
      )
    );

    const estimate =
      item.estimate ||
      country.estimatedIdealTrip ||
      item.budgetFit?.estimate ||
      {};

    const bestMonths = safeArray(
      item.bestMonths || country.bestMonths
    )
      .slice(0, 2)
      .map(monthLabel)
      .filter(Boolean)
      .join("، ");

    const firstReason =
      safeArray(item.reasons)
        .filter(Boolean)
        .slice(0, 1)[0] ||
      "قريبة من إعدادات رحلتك الحالية.";

    return `
      <article
        class="tic-card guide-recommendation-card is-compact"
        data-guide-recommendation-index="${escapeHTML(index)}"
      >
        <div class="tic-card-body">
          <div class="guide-recommendation-head">
            <span class="guide-recommendation-rank">
              ${escapeHTML(index + 1)}
            </span>

            <button
              type="button"
              class="tic-icon-button guide-wishlist-button"
              data-action="guide-toggle-wishlist"
              data-param-country-code="${escapeHTML(country.code)}"
              aria-label="إضافة أو إزالة من الأمنيات"
            >
              ${country.wishlisted ? "★" : "☆"}
            </button>
          </div>

          <button
            type="button"
            class="guide-recommendation-main"
            data-action="guide-open-country"
            data-param-country-code="${escapeHTML(country.code)}"
          >
            <span class="guide-recommendation-flag">
              ${escapeHTML(country.flag || "🌍")}
            </span>

            <strong>
              ${escapeHTML(
                country.nameAr ||
                country.countryName ||
                country.code
              )}
            </strong>

            <small>
              ${escapeHTML(firstReason)}
            </small>
          </button>

          <div class="guide-recommendation-score">
            <strong>${escapeHTML(score)}%</strong>
            <span>تطابق</span>
          </div>

          <div class="guide-recommendation-meta is-compact">
            ${
              bestMonths
                ? `<span>🗓️ ${escapeHTML(bestMonths)}</span>`
                : ""
            }

            ${
              estimate.totalAED
                ? `<span>💳 ${escapeHTML(formatAED(estimate.totalAED))}</span>`
                : ""
            }
          </div>

          ${renderButton({
            label: "فتح الدليل",
            action: "guide-open-country",
            params: { countryCode: country.code },
            primary: true,
            block: true,
            compact: true
          })}
        </div>
      </article>
    `;
  };

  const renderRecommendations = (snapshot) => {
    if (!snapshot.recommendations.length) {
      return renderEmpty(
        "ما عندنا اقتراحات دقيقة للحين",
        "حدد الميزانية والشهر أو أضف تقييمات لرحلاتك السابقة.",
        "✦",
        true
      );
    }

    return `
      <div class="guide-recommendation-shell">
        <div
          class="guide-recommendation-rail"
          data-guide-recommendation-rail
          aria-label="اقتراحات السفر"
        >
          ${snapshot.recommendations
            .slice(0, RECOMMENDATION_LIMIT)
            .map(renderRecommendationCard)
            .join("")}
        </div>

        <div class="guide-rail-footer">
          <span>
            اسحب يمين ويسار لمشاهدة بقية الاقتراحات
          </span>

          <div class="guide-rail-controls">
            <button
              type="button"
              data-guide-rail-next
              aria-label="الاقتراح التالي"
            >
              ›
            </button>

            <button
              type="button"
              data-guide-rail-previous
              aria-label="الاقتراح السابق"
            >
              ‹
            </button>
          </div>
        </div>
      </div>
    `;
  };

  const renderWishlist = (snapshot) => {
    if (!snapshot.wishlist.length) {
      return renderEmpty(
        "قائمة الأمنيات فاضية",
        "احفظ أي دولة بالنجمة وستظهر هنا.",
        "☆",
        true
      );
    }

    return `
      <div class="guide-mini-rail">
        ${snapshot.wishlist
          .slice(0, 6)
          .map((item) => {
            const country =
              item.country ||
              snapshot.allCountries.find(
                (entry) =>
                  entry.code === item.countryCode
              );

            return `
              <button
                type="button"
                class="guide-mini-card"
                data-action="guide-open-country"
                data-param-country-code="${escapeHTML(item.countryCode)}"
              >
                <span>${escapeHTML(country?.flag || "🌍")}</span>
                <strong>
                  ${escapeHTML(
                    country?.nameAr ||
                    item.countryName ||
                    item.countryCode
                  )}
                </strong>
                <small>فتح الدليل</small>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  };

  const renderAnnualPlans = (snapshot) => {
    if (!snapshot.annualPlans.length) {
      return renderEmpty(
        "ما عندك خطط سنوية",
        "افتح أي دولة وأضفها إلى خطتك السنوية.",
        "🗓️",
        true
      );
    }

    return `
      <div class="guide-plan-list is-compact">
        ${snapshot.annualPlans
          .slice(0, 4)
          .map(
            (plan) => `
              <article class="tic-card guide-plan-card">
                <div class="tic-card-body">
                  <div>
                    <strong>
                      ${escapeHTML(plan.country?.flag || "🌍")}
                      ${escapeHTML(
                        plan.country?.nameAr ||
                        plan.countryName ||
                        plan.countryCode
                      )}
                    </strong>

                    <small>
                      ${escapeHTML(
                        `${plan.month ? monthLabel(plan.month) : "غير محدد"} ${plan.year || ""}`
                      )}
                      · ${escapeHTML(plan.days || 0)} أيام
                    </small>
                  </div>

                  ${renderButton({
                    label: "تحويل",
                    action: "guide-convert-plan-to-trip",
                    params: { planId: plan.id },
                    primary: true,
                    compact: true
                  })}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderTravelProfile = (snapshot) => {
    const profile = snapshot.summary.profile || {};
    const budget = snapshot.summary.budget || {};

    const items = [
      {
        label: "أسلوب السفر",
        value: profile.travelStyle || "غير محدد"
      },
      {
        label: "المطار الأساسي",
        value: profile.homeAirport || "أبوظبي"
      },
      {
        label: "الميزانية السنوية",
        value: formatAED(
          budget.annualTravelBudget || 0
        )
      },
      {
        label: "الادخار الشهري",
        value: formatAED(
          budget.monthlySaving || 0
        )
      }
    ];

    return `
      <details class="guide-profile-details">
        <summary>
          <span>
            <small>YOUR PROFILE</small>
            <strong>ملف سفرك</strong>
          </span>
          <span aria-hidden="true">⌄</span>
        </summary>

        <div class="guide-profile-grid">
          ${items
            .map(
              (item) => `
                <article class="guide-profile-item">
                  <small>${escapeHTML(item.label)}</small>
                  <strong>${escapeHTML(item.value)}</strong>
                </article>
              `
            )
            .join("")}
        </div>
      </details>
    `;
  };

  const renderDiscoverView = (snapshot) => `
    ${renderHero()}

    ${renderSection({
      eyebrow: "OVERVIEW",
      title: "ملخص سفرك",
      compact: true,
      content: renderCompactOverview(snapshot)
    })}

    ${renderSection({
      eyebrow: "PLAN YOUR TRIP",
      title: "خطط رحلتك",
      subtitle: "حدد المدة والميزانية ثم اختر الدولة.",
      compact: true,
      content: `
        <div class="guide-planning-stack">
          ${renderPlannerControls({ compact: true })}
          ${renderCountryPicker(snapshot)}
        </div>
      `
    })}

    ${renderSection({
      eyebrow: "RECOMMENDED FOR YOU",
      title: "أفضل اقتراحاتك",
      subtitle: "اقتراحات مختصرة؛ اسحب أفقياً بدل النزول الطويل.",
      compact: true,
      className: "guide-recommendations-section",
      content: renderRecommendations(snapshot)
    })}

    <div class="guide-secondary-sections">
      ${renderSection({
        eyebrow: "WISHLIST",
        title: "قائمة الأمنيات",
        compact: true,
        content: renderWishlist(snapshot)
      })}

      <div data-guide-annual-plans>
        ${renderSection({
          eyebrow: "ANNUAL PLANNER",
          title: "خطتك السنوية",
          compact: true,
          content: renderAnnualPlans(snapshot)
        })}
      </div>
    </div>

    ${renderTravelProfile(snapshot)}
  `;

  /* =========================================================
     Country view
  ========================================================= */

  const renderCountryTabs = () => `
    <div class="guide-country-tabs">
      ${VIEW_SECTIONS.map(
        (section) => `
          <button
            type="button"
            class="${state.activeSection === section.id ? "is-active" : ""}"
            data-action="guide-set-section"
            data-param-section="${escapeHTML(section.id)}"
          >
            <span>${escapeHTML(section.icon)}</span>
            ${escapeHTML(section.label)}
          </button>
        `
      ).join("")}
    </div>
  `;

  const renderCountryHero = (snapshot) => {
    const country = snapshot.selectedCountry;
    const guide = snapshot.countryGuide;

    const score =
      guide?.aiInsights?.matchScore ||
      country?.recommendationScore ||
      0;

    return `
      <section class="tic-hero guide-country-hero">
        <div class="guide-country-hero-head">
          <div>
            <span class="tic-chip">
              ${escapeHTML(country.flag || "🌍")}
              ${escapeHTML(country.nameEn || country.code)}
            </span>

            <h1>${escapeHTML(country.nameAr)}</h1>

            <p>
              ${escapeHTML(
                country.summary ||
                "دليل عملي لهذه الوجهة."
              )}
            </p>
          </div>

          <button
            type="button"
            class="tic-icon-button"
            data-action="guide-toggle-wishlist"
            data-param-country-code="${escapeHTML(country.code)}"
            aria-label="إضافة أو إزالة من الأمنيات"
          >
            ${country.wishlisted ? "★" : "☆"}
          </button>
        </div>

        <div class="guide-country-score">
          <span>التطابق معك</span>
          <strong>
            ${escapeHTML(Math.round(number(score)))}%
          </strong>
        </div>

        <div class="guide-country-actions">
          ${renderButton({
            label: "إضافة للخطة",
            action: "guide-add-annual-plan",
            params: { countryCode: country.code },
            primary: true,
            block: true,
            icon: "🗓️"
          })}

          ${renderButton({
            label: "إنشاء رحلة",
            action: "guide-create-trip",
            params: { countryCode: country.code },
            block: true,
            icon: "✈️"
          })}
        </div>

        <div class="guide-back-wrap">
          ${renderButton({
            label: "العودة للدليل",
            action: "guide-show-discover",
            block: true,
            compact: true
          })}
        </div>
      </section>
    `;
  };

  const renderInfoRows = (title, rows) => {
    const visible = rows.filter((row) =>
      text(row.value)
    );

    if (!visible.length) return "";

    return `
      <section class="tic-card guide-info-card">
        <div class="tic-card-body">
          <h3>${escapeHTML(title)}</h3>

          <div class="guide-info-list">
            ${visible
              .map(
                (row) => `
                  <div>
                    <span>${escapeHTML(row.label)}</span>
                    <strong>${escapeHTML(row.value)}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  };

  const renderSimpleList = (
    title,
    items,
    emptyText = ""
  ) => {
    const normalized = safeArray(items);

    if (!normalized.length) {
      return emptyText
        ? `
          <section class="tic-card guide-info-card">
            <div class="tic-card-body">
              <h3>${escapeHTML(title)}</h3>
              <p class="tic-subtitle">
                ${escapeHTML(emptyText)}
              </p>
            </div>
          </section>
        `
        : "";
    }

    return `
      <section class="tic-card guide-info-card">
        <div class="tic-card-body">
          <h3>${escapeHTML(title)}</h3>

          <div class="guide-list">
            ${normalized
              .map((item) => {
                const value =
                  typeof item === "string"
                    ? item
                    : item.nameAr ||
                      item.name ||
                      item.title ||
                      item.description ||
                      "معلومة";

                const secondary =
                  typeof item === "object"
                    ? item.city ||
                      item.notes ||
                      item.description ||
                      ""
                    : "";

                return `
                  <div>
                    <strong>${escapeHTML(value)}</strong>
                    ${
                      secondary
                        ? `<small>${escapeHTML(secondary)}</small>`
                        : ""
                    }
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      </section>
    `;
  };

  const renderOverviewSection = (snapshot) => {
    const country = snapshot.selectedCountry;
    const guide = snapshot.countryGuide;
    const estimate = guide?.cost || {};

    const idealDays =
      country.recommendedDays?.ideal ||
      state.selectedDays;

    return `
      <div class="guide-country-grid">
        ${renderInfoRows("نظرة سريعة", [
          {
            label: "العاصمة",
            value: country.capital
          },
          {
            label: "القارة",
            value: country.continent
          },
          {
            label: "العملة",
            value: country.currency
          },
          {
            label: "مدة الطيران من أبوظبي",
            value: country.flightDurationFromAbuDhabiHours
              ? `${country.flightDurationFromAbuDhabiHours} ساعات تقريباً`
              : ""
          },
          {
            label: "المدة المثالية",
            value: `${idealDays} أيام`
          }
        ])}

        ${renderInfoRows("التكلفة التقريبية", [
          {
            label: "الطيران",
            value: estimate.flightAED
              ? formatAED(estimate.flightAED)
              : ""
          },
          {
            label: "الفندق",
            value: estimate.hotelAED
              ? formatAED(estimate.hotelAED)
              : ""
          },
          {
            label: "المصروف اليومي",
            value: estimate.dailyExpensesAED
              ? formatAED(estimate.dailyExpensesAED)
              : ""
          },
          {
            label: "الإجمالي",
            value: estimate.totalAED
              ? formatAED(estimate.totalAED)
              : ""
          }
        ])}

        ${renderSimpleList(
          "أفضل المدن",
          country.cities
        )}

        ${renderSimpleList(
          "أنسب أنماط السفر",
          country.travelStyles
        )}
      </div>
    `;
  };

  const renderWeatherSection = (snapshot) => {
    const country = snapshot.selectedCountry;
    const guide = snapshot.countryGuide;

    return `
      <div class="guide-country-grid">
        ${renderInfoRows("طقس الشهر المختار", [
          {
            label: "الشهر",
            value: monthLabel(state.selectedMonth)
          },
          {
            label: "أقل درجة",
            value:
              guide?.weather?.min !== null &&
              guide?.weather?.min !== undefined
                ? `${guide.weather.min}°`
                : ""
          },
          {
            label: "أعلى درجة",
            value:
              guide?.weather?.max !== null &&
              guide?.weather?.max !== undefined
                ? `${guide.weather.max}°`
                : ""
          },
          {
            label: "التقييم",
            value: guide?.weather?.recommended
              ? "من أفضل الشهور"
              : guide?.weather?.avoid
                ? "يفضل تجنبه"
                : "مقبول"
          }
        ])}

        ${renderSimpleList(
          "أفضل أشهر السفر",
          safeArray(guide?.bestMonths).map(monthLabel)
        )}

        ${renderSimpleList(
          "المواسم المناسبة",
          country.seasons
        )}

        ${renderSimpleList(
          "أشهر يفضل تجنبها",
          safeArray(country.monthsToAvoid).map(monthLabel),
          "لا توجد أشهر محددة لتجنبها حالياً."
        )}
      </div>
    `;
  };

  const renderStaySection = (snapshot) => {
    const country = snapshot.selectedCountry;

    const recommendations =
      snapshot.countryGuide?.aiInsights
        ?.hotelRecommendations || [];

    return `
      <div class="guide-country-grid">
        ${
          recommendations.length
            ? recommendations
                .map(
                  (item) => `
                    <article class="tic-card guide-info-card">
                      <div class="tic-card-body">
                        <span class="tic-chip">
                          ${escapeHTML(
                            item.hotel.city ||
                            country.nameAr
                          )}
                        </span>

                        <h3>
                          ${escapeHTML(
                            item.hotel.nameAr ||
                            item.hotel.name
                          )}
                        </h3>

                        <div class="guide-info-list">
                          <div>
                            <span>التقييم الذكي</span>
                            <strong>
                              ${escapeHTML(item.score)}%
                            </strong>
                          </div>

                          <div>
                            <span>الشطاف</span>
                            <strong>
                              ${
                                item.hotel.hasShattaf
                                  ? "متوفر"
                                  : "يحتاج تأكيد"
                              }
                            </strong>
                          </div>

                          <div>
                            <span>السعر لليلة</span>
                            <strong>
                              ${escapeHTML(
                                formatAED(
                                  item.hotel.estimatedNightlyAED
                                )
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </article>
                  `
                )
                .join("")
            : renderEmpty(
                "لا توجد فنادق مفصلة حالياً",
                "ستظهر الفنادق عند توفر بياناتها في قاعدة الدليل.",
                "⌂",
                true
              )
        }

        ${renderSimpleList("معلومات الإقامة", [
          `توفر الشطاف: ${
            country.shattafAvailability ||
            "غير معروف"
          }`,
          country.familyFriendly
            ? "مناسبة للعائلات"
            : "راجع ملاءمتها للعائلة",
          country.halal?.friendly
            ? "خيارات الحلال متوفرة"
            : "ابحث مسبقاً عن خيارات الحلال"
        ])}
      </div>
    `;
  };

  const renderExploreSection = (snapshot) => {
    const country = snapshot.selectedCountry;

    return `
      <div class="guide-country-grid">
        ${renderSimpleList(
          "أفضل المدن",
          country.cities
        )}

        ${renderSimpleList(
          "الأماكن السياحية",
          country.attractions,
          "لا توجد أماكن مفصلة لهذه الوجهة حالياً."
        )}

        ${renderSimpleList(
          "الشواطئ",
          country.beaches,
          "لا توجد شواطئ مضافة لهذه الوجهة."
        )}

        ${renderSimpleList(
          "الأنشطة والتجارب",
          country.experiences,
          "لا توجد تجارب مضافة لهذه الوجهة."
        )}

        ${renderSimpleList(
          "المطاعم الحلال",
          country.halalRestaurants,
          "راجع المطاعم الحلال قبل السفر."
        )}
      </div>
    `;
  };

  const renderEssentialsSection = (snapshot) => {
    const country = snapshot.selectedCountry;

    return `
      <div class="guide-country-grid">
        ${renderInfoRows("التأشيرة والدخول", [
          {
            label: "الحالة",
            value: country.visa?.status
          },
          {
            label: "ملاحظة",
            value: country.visa?.note
          }
        ])}

        ${renderSimpleList(
          "متطلبات الدخول",
          country.entryRequirements
        )}

        ${renderInfoRows("اللغة والعملة", [
          {
            label: "اللغات",
            value: safeArray(country.languages).join("، ")
          },
          {
            label: "العملة",
            value: country.currency
          },
          {
            label: "فرق التوقيت",
            value: country.timezone
          }
        ])}

        ${renderInfoRows("المواصلات", [
          {
            label: "المواصلات العامة",
            value:
              country.transport?.publicTransport
          },
          {
            label: "هل السيارة مطلوبة؟",
            value: country.transport?.carRecommended
              ? "نعم"
              : "غالباً لا"
          },
          {
            label: "ملاحظات",
            value: country.transport?.notes
          }
        ])}

        ${renderInfoRows("الاتصال والكهرباء", [
          {
            label: "eSIM",
            value: country.connectivity?.esim
          },
          {
            label: "SIM",
            value: country.connectivity?.sim
          },
          {
            label: "المحول الكهربائي",
            value: country.electricity
              ?.adapterRecommended
              ? "يفضل حمله"
              : "غالباً غير مطلوب"
          }
        ])}

        ${renderInfoRows("الملاءمة", [
          {
            label: "الحلال",
            value: country.halal?.friendly
              ? "متوفر"
              : "يحتاج تخطيط"
          },
          {
            label: "الشطاف",
            value:
              country.shattafAvailability ||
              "غير معروف"
          },
          {
            label: "العائلة",
            value: country.familyFriendly
              ? "مناسبة"
              : "راجع التفاصيل"
          }
        ])}
      </div>
    `;
  };

  const renderPlannerSection = (snapshot) => {
    const itinerary = snapshot.itinerary;

    if (!itinerary?.itinerary?.length) {
      return renderEmpty(
        "تعذر إنشاء الجدول",
        "تأكد من اختيار الدولة والأيام ثم أعد المحاولة.",
        "▣",
        true
      );
    }

    return `
      ${renderPlannerControls({ compact: true })}

      <div class="guide-itinerary-list">
        ${itinerary.itinerary
          .map(
            (day) => `
              <article class="tic-card guide-itinerary-day">
                <div class="tic-card-body">
                  <span class="tic-chip">
                    اليوم ${escapeHTML(day.day)}
                    ${
                      day.city
                        ? ` · ${escapeHTML(day.city)}`
                        : ""
                    }
                  </span>

                  <h3>${escapeHTML(day.theme)}</h3>

                  <div class="guide-list">
                    ${safeArray(day.activities)
                      .map(
                        (activity) => `
                          <div>
                            <strong>
                              ${escapeHTML(activity.name)}
                            </strong>
                            <small>
                              ${escapeHTML(
                                activity.period ||
                                activity.type ||
                                ""
                              )}
                            </small>
                          </div>
                        `
                      )
                      .join("")}
                  </div>

                  ${
                    day.notes
                      ? `
                        <p class="tic-subtitle">
                          ${escapeHTML(day.notes)}
                        </p>
                      `
                      : ""
                  }
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderCountrySection = (snapshot) => {
    switch (state.activeSection) {
      case "weather":
        return renderWeatherSection(snapshot);

      case "stay":
        return renderStaySection(snapshot);

      case "explore":
        return renderExploreSection(snapshot);

      case "essentials":
        return renderEssentialsSection(snapshot);

      case "planner":
        return renderPlannerSection(snapshot);

      case "overview":
      default:
        return renderOverviewSection(snapshot);
    }
  };

  const renderCountryView = (snapshot) => {
    if (!snapshot.selectedCountry) {
      return renderEmpty(
        "تعذر تحميل الدولة",
        "ارجع للدليل واختر الدولة مرة ثانية.",
        "⚠️"
      );
    }

    return `
      ${renderCountryHero(snapshot)}

      ${renderSection({
        eyebrow: "TRIP SETTINGS",
        title: "إعدادات رحلتك",
        subtitle: "غيّر الأيام والشهر والميزانية.",
        compact: true,
        content: renderPlannerControls({
          compact: true
        })
      })}

      ${renderCountryTabs()}

      ${renderSection({
        eyebrow: "COUNTRY INTELLIGENCE",
        title: `دليل ${snapshot.selectedCountry.nameAr}`,
        compact: true,
        content: renderCountrySection(snapshot)
      })}
    `;
  };

  const renderPage = (snapshot) => {
    if (!snapshot.ready) {
      return `
        <div
          class="tic-module guide-page"
          data-page="${PAGE_ID}"
          data-page-version="${PAGE_VERSION}"
        >
          ${renderEmpty(
            "الدليل غير جاهز",
            snapshot.error ||
              "تأكد من تحميل ملفات الدليل.",
            "⚠️"
          )}
        </div>
      `;
    }

    return `
      <div
        class="tic-module guide-page"
        data-page="${PAGE_ID}"
        data-page-version="${PAGE_VERSION}"
        data-guide-view="${escapeHTML(state.activeView)}"
      >
        ${
          state.activeView === "country"
            ? renderCountryView(snapshot)
            : renderDiscoverView(snapshot)
        }
      </div>
    `;
  };

  /* =========================================================
     Country sheet
  ========================================================= */

  const getCountrySheetRoot = () =>
    state.countrySheetRoot ||
    document.querySelector(
      "[data-guide-country-sheet-portal]"
    );

  const syncCountrySheetBodyLock = () => {
    const shouldLock = Boolean(
      state.countryPickerOpen
    );

    document.body.classList.toggle(
      "guide-country-sheet-open",
      shouldLock
    );

    if (shouldLock) {
      if (!document.body.dataset.guideSheetLocked) {
        state.bodyScrollY =
          window.scrollY ||
          document.documentElement.scrollTop ||
          0;

        document.body.dataset.guideSheetLocked =
          "true";
        document.body.style.position = "fixed";
        document.body.style.top =
          `-${state.bodyScrollY}px`;
        document.body.style.insetInline = "0";
        document.body.style.width = "100%";
      }

      return;
    }

    if (document.body.dataset.guideSheetLocked) {
      const restoreY = state.bodyScrollY;

      delete document.body.dataset.guideSheetLocked;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.insetInline = "";
      document.body.style.width = "";

      window.requestAnimationFrame(() => {
        window.scrollTo(0, restoreY);
      });
    }
  };

  const removeCountrySheetPortal = () => {
    const root = getCountrySheetRoot();

    if (root?.parentNode) {
      root.parentNode.removeChild(root);
    }

    state.countrySheetRoot = null;
    return true;
  };

  const updateSearchResultsOnly = () => {
    const root = getCountrySheetRoot();

    if (!root || !state.snapshot) return;

    const allCountries =
      state.snapshot.allCountries?.length
        ? state.snapshot.allCountries
        : getAllCountries(getGuideEngine());

    const countries = filterCountries(
      allCountries,
      state.search
    );

    const list = root.querySelector(
      "[data-guide-country-sheet-list]"
    );

    const count = root.querySelector(
      ".guide-country-sheet-count span"
    );

    const clearHost = root.querySelector(
      ".guide-country-sheet-search"
    );

    const existingClear = root.querySelector(
      "[data-guide-clear-sheet-search]"
    );

    if (count) {
      count.textContent =
        `${countries.length} ${
          countries.length === 1
            ? "نتيجة"
            : "دولة"
        }`;
    }

    if (list) {
      list.innerHTML =
        renderCountryOptions(countries);
    }

    if (state.search && !existingClear && clearHost) {
      const clearButton =
        document.createElement("button");

      clearButton.type = "button";
      clearButton.setAttribute(
        "data-guide-clear-sheet-search",
        ""
      );
      clearButton.setAttribute(
        "aria-label",
        "مسح البحث"
      );
      clearButton.textContent = "×";
      clearHost.appendChild(clearButton);
    } else if (!state.search && existingClear) {
      existingClear.remove();
    }
  };

  const bindCountrySheetListeners = (root) => {
    if (!root) return;

    root.addEventListener("click", (event) => {
      const closeButton = event.target.closest(
        "[data-guide-close-country-sheet]"
      );

      if (closeButton) {
        closeCountrySheet();
        return;
      }

      const clearButton = event.target.closest(
        "[data-guide-clear-sheet-search]"
      );

      if (clearButton) {
        state.search = "";

        const input = root.querySelector(
          "[data-guide-sheet-search]"
        );

        if (input) {
          input.value = "";
          input.focus();
        }

        updateSearchResultsOnly();
        return;
      }

      const countryButton = event.target.closest(
        "[data-guide-country-option]"
      );

      if (countryButton) {
        openCountry(
          countryButton.getAttribute(
            "data-guide-country-option"
          )
        );
        return;
      }

      const backdrop = event.target.closest(
        "[data-guide-country-sheet-backdrop]"
      );

      if (
        backdrop &&
        event.target === backdrop
      ) {
        closeCountrySheet();
      }
    });

    root.addEventListener("input", (event) => {
      if (
        !event.target.matches(
          "[data-guide-sheet-search]"
        )
      ) {
        return;
      }

      state.search = event.target.value;

      window.clearTimeout(state.searchTimer);

      state.searchTimer = window.setTimeout(
        updateSearchResultsOnly,
        70
      );
    });
  };

  const mountCountrySheetPortal = ({
    focusSearch = true
  } = {}) => {
    removeCountrySheetPortal();

    if (!state.snapshot?.ready) return false;

    const root = document.createElement("div");

    root.setAttribute(
      "data-guide-country-sheet-portal",
      ""
    );

    root.innerHTML = renderCountrySheet({
      ...state.snapshot,
      countries: filterCountries(
        state.snapshot.allCountries || [],
        state.search
      )
    });

    document.body.appendChild(root);
    state.countrySheetRoot = root;

    bindCountrySheetListeners(root);
    syncCountrySheetBodyLock();

    if (focusSearch) {
      window.setTimeout(() => {
        root
          .querySelector(
            "[data-guide-sheet-search]"
          )
          ?.focus?.();
      }, 80);
    }

    return true;
  };

  const openCountrySheet = async ({
    focusSearch = true
  } = {}) => {
    if (state.countryPickerOpen) {
      const root = getCountrySheetRoot();

      if (!root) {
        mountCountrySheetPortal({
          focusSearch
        });
      } else if (focusSearch) {
        root
          .querySelector(
            "[data-guide-sheet-search]"
          )
          ?.focus?.();
      }

      return true;
    }

    state.countryPickerOpen = true;
    state.search = "";
    state.countrySheetReturnFocus =
      document.activeElement;

    if (!state.snapshot?.ready) {
      state.snapshot = await buildSnapshot();
    }

    mountCountrySheetPortal({ focusSearch });
    emit("country-picker-opened");

    return true;
  };

  const closeCountrySheet = async ({
    preserveSearch = false,
    restoreFocus = true
  } = {}) => {
    if (
      !state.countryPickerOpen &&
      !getCountrySheetRoot()
    ) {
      return true;
    }

    state.countryPickerOpen = false;

    if (!preserveSearch) {
      state.search = "";
    }

    removeCountrySheetPortal();
    syncCountrySheetBodyLock();

    if (
      restoreFocus &&
      state.countrySheetReturnFocus instanceof
        window.HTMLElement
    ) {
      window.setTimeout(() => {
        state.countrySheetReturnFocus?.focus?.();
        state.countrySheetReturnFocus = null;
      }, 0);
    } else {
      state.countrySheetReturnFocus = null;
    }

    emit("country-picker-closed");
    return true;
  };

  /* =========================================================
     Page events
  ========================================================= */

  const scrollRecommendationRail = (
    direction
  ) => {
    const rail = state.container?.querySelector(
      "[data-guide-recommendation-rail]"
    );

    if (!rail) return false;

    const card = rail.querySelector(
      ".guide-recommendation-card"
    );

    const distance =
      (card?.getBoundingClientRect?.().width ||
        rail.clientWidth * 0.78) + 14;

    rail.scrollBy({
      left:
        direction === "next"
          ? -distance
          : distance,
      behavior: "smooth"
    });

    return true;
  };

  const bindDelegatedPageEvents = () => {
    if (!state.container) return;

    unbindDelegatedPageEvents();

    state.delegatedClickHandler = (event) => {
      if (
        event.target.closest(
          "[data-guide-open-country-sheet]"
        )
      ) {
        openCountrySheet({
          focusSearch: true
        });
        return;
      }

      if (
        event.target.closest(
          "[data-guide-rail-next]"
        )
      ) {
        scrollRecommendationRail("next");
        return;
      }

      if (
        event.target.closest(
          "[data-guide-rail-previous]"
        )
      ) {
        scrollRecommendationRail("previous");
      }
    };

    state.delegatedChangeHandler = (event) => {
      const target = event.target;

      if (target.matches("[data-guide-days]")) {
        state.selectedDays = clamp(
          number(target.value, 7),
          1,
          30
        );
      } else if (
        target.matches("[data-guide-travelers]")
      ) {
        state.selectedTravelers = clamp(
          number(target.value, 2),
          1,
          20
        );
      } else if (
        target.matches("[data-guide-month]")
      ) {
        state.selectedMonth = clamp(
          number(target.value, 1),
          1,
          12
        );
      } else if (
        target.matches("[data-guide-budget]")
      ) {
        state.selectedBudget = Math.max(
          0,
          number(target.value, 0)
        );
      } else {
        return;
      }

      invalidateSnapshotCache();

      refresh({
        force: true,
        preserveScroll: true,
        allowDuringScroll: false
      });
    };

    state.container.addEventListener(
      "click",
      state.delegatedClickHandler
    );

    state.container.addEventListener(
      "change",
      state.delegatedChangeHandler
    );
  };

  const unbindDelegatedPageEvents = () => {
    if (!state.container) return;

    if (state.delegatedClickHandler) {
      state.container.removeEventListener(
        "click",
        state.delegatedClickHandler
      );
    }

    if (state.delegatedChangeHandler) {
      state.container.removeEventListener(
        "change",
        state.delegatedChangeHandler
      );
    }

    state.delegatedClickHandler = null;
    state.delegatedChangeHandler = null;
  };

  const registerScrollState = () => {
    unregisterScrollState();

    const target =
      state.container &&
      state.container.scrollHeight >
        state.container.clientHeight
        ? state.container
        : window;

    state.scrollTarget = target;

    state.scrollHandler = () => {
      if (state.scrollFrame) return;

      state.scrollFrame =
        window.requestAnimationFrame(() => {
          state.scrollFrame = null;
          state.isUserScrolling = true;

          window.clearTimeout(
            state.scrollTimer
          );

          state.scrollTimer =
            window.setTimeout(() => {
              state.isUserScrolling = false;

              if (
                state.refreshQueued &&
                !state.rendering
              ) {
                state.refreshQueued = false;

                refresh({
                  preserveScroll: true,
                  allowDuringScroll: true
                });
              }
            }, SCROLL_IDLE_DELAY);
        });
    };

    target.addEventListener(
      "scroll",
      state.scrollHandler,
      { passive: true }
    );
  };

  const unregisterScrollState = () => {
    if (
      state.scrollTarget &&
      state.scrollHandler
    ) {
      state.scrollTarget.removeEventListener(
        "scroll",
        state.scrollHandler
      );
    }

    if (state.scrollFrame) {
      window.cancelAnimationFrame(
        state.scrollFrame
      );
    }

    state.scrollTarget = null;
    state.scrollHandler = null;
    state.scrollFrame = null;
  };

  /* =========================================================
     Refresh and navigation
  ========================================================= */

  const refresh = async (options = {}) => {
    if (!state.container || !state.mounted) {
      return false;
    }

    if (state.rendering) {
      state.refreshQueued = true;
      return false;
    }

    if (
      state.isUserScrolling &&
      options.allowDuringScroll !== true
    ) {
      state.refreshQueued = true;
      return false;
    }

    state.rendering = true;

    const scrollTop = getScrollTop();

    try {
      const snapshot = await buildSnapshot({
        force: options.force === true
      });

      state.snapshot = snapshot;
      state.container.innerHTML =
        renderPage(snapshot);

      if (options.preserveScroll !== false) {
        restoreScrollTop(scrollTop);
      }

      emit("refreshed", {
        activeView: state.activeView,
        activeSection: state.activeSection,
        selectedCountryCode:
          state.selectedCountryCode
      });

      return true;
    } finally {
      state.rendering = false;

      if (
        state.refreshQueued &&
        !state.isUserScrolling
      ) {
        state.refreshQueued = false;

        window.setTimeout(() => {
          refresh({
            preserveScroll: true,
            allowDuringScroll: false
          });
        }, 50);
      }
    }
  };

  const openCountry = async (countryCode) => {
    const guide = getGuideEngine();
    const code = text(
      countryCode
    ).toUpperCase();

    if (!guide || !code) {
      safeToast(
        "تعذر فتح الدولة.",
        "error"
      );
      return false;
    }

    const country =
      guide.selectCountry?.(code);

    if (!country) {
      safeToast(
        "لا توجد بيانات لهذه الدولة.",
        "info"
      );
      return false;
    }

    state.selectedCountryCode = code;
    state.selectedDays =
      country.recommendedDays?.ideal ||
      state.selectedDays;
    state.activeView = "country";
    state.activeSection = "overview";
    state.search = "";
    state.countryPickerOpen = false;

    removeCountrySheetPortal();
    syncCountrySheetBodyLock();

    invalidateSnapshotCache();

    getStore()?.setSelectedGuideCountry?.(
      code
    );

    await refresh({
      force: true,
      preserveScroll: false,
      allowDuringScroll: true
    });

    restoreScrollTop(0);

    emit("country-opened", {
      countryCode: code
    });

    return true;
  };

  /* =========================================================
     Actions
  ========================================================= */

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

      if (
        typeof unsubscribe === "function"
      ) {
        state.actionUnsubscribers.push(
          unsubscribe
        );
      }
    };

    register(
      "guide-show-discover",
      async () => {
        state.activeView = "discover";
        state.activeSection = "overview";
        state.selectedCountryCode = "";
        state.search = "";
        state.countryPickerOpen = false;

        removeCountrySheetPortal();
        syncCountrySheetBodyLock();
        invalidateSnapshotCache();

        getGuideEngine()?.clearSelection?.();

        await refresh({
          force: true,
          preserveScroll: false,
          allowDuringScroll: true
        });

        restoreScrollTop(0);
        return true;
      }
    );

    register(
      "guide-focus-country-search",
      async () => {
        state.activeView = "discover";

        await refresh({
          preserveScroll: true,
          allowDuringScroll: true
        });

        window.setTimeout(() => {
          state.container
            ?.querySelector(
              "[data-guide-search-card]"
            )
            ?.scrollIntoView?.({
              behavior: "smooth",
              block: "center"
            });

          openCountrySheet({
            focusSearch: true
          });
        }, 80);

        return true;
      }
    );

    register(
      "guide-scroll-annual-plans",
      async () => {
        state.activeView = "discover";

        await refresh({
          preserveScroll: true,
          allowDuringScroll: true
        });

        window.setTimeout(() => {
          state.container
            ?.querySelector(
              "[data-guide-annual-plans]"
            )
            ?.scrollIntoView?.({
              behavior: "smooth",
              block: "start"
            });
        }, 50);

        return true;
      }
    );

    register(
      "guide-open-country",
      ({ params }) =>
        openCountry(
          params.countryCode ||
          params.country ||
          params.code
        )
    );

    register(
      "guide-set-section",
      async ({ params }) => {
        const section = text(
          params.section
        );

        if (
          !VIEW_SECTIONS.some(
            (item) => item.id === section
          )
        ) {
          return false;
        }

        state.activeSection = section;
        invalidateSnapshotCache();

        await refresh({
          force: section === "planner",
          preserveScroll: true,
          allowDuringScroll: true
        });

        return true;
      }
    );

    register(
      "guide-toggle-wishlist",
      async ({ params }) => {
        const code = text(
          params.countryCode
        ).toUpperCase();

        if (!code) return false;

        try {
          const result =
            await getGuideEngine()
              ?.toggleWishlist?.(code);

          safeToast(
            result?.wishlisted
              ? "تمت إضافة الدولة إلى الأمنيات."
              : "تمت إزالة الدولة من الأمنيات.",
            "success"
          );

          invalidateSnapshotCache();

          await refresh({
            force: true,
            preserveScroll: true,
            allowDuringScroll: true
          });

          return result || true;
        } catch (error) {
          console.error(
            "TIC Guide wishlist error:",
            error
          );

          safeToast(
            "تعذر تحديث قائمة الأمنيات.",
            "error"
          );

          return false;
        }
      }
    );

    register(
      "guide-add-annual-plan",
      async ({ params }) => {
        const code = text(
          params.countryCode ||
          state.selectedCountryCode
        ).toUpperCase();

        if (!code) return false;

        try {
          const plan =
            await getGuideEngine()
              ?.addToAnnualPlan?.(
                code,
                {
                  year:
                    new Date().getFullYear(),
                  month:
                    state.selectedMonth,
                  days:
                    state.selectedDays,
                  travelers:
                    state.selectedTravelers,
                  budgetAED:
                    state.selectedBudget,
                  status: "planned"
                }
              );

          safeToast(
            plan?.duplicate
              ? "هذه الخطة موجودة مسبقاً."
              : "تمت إضافة الدولة إلى خطتك السنوية.",
            "success"
          );

          invalidateSnapshotCache();

          await refresh({
            force: true,
            preserveScroll: true,
            allowDuringScroll: true
          });

          return plan || true;
        } catch (error) {
          console.error(
            "TIC Guide annual plan error:",
            error
          );

          safeToast(
            "تعذر حفظ الخطة السنوية.",
            "error"
          );

          return false;
        }
      }
    );

    register(
      "guide-create-trip",
      async ({ params }) => {
        const code = text(
          params.countryCode ||
          state.selectedCountryCode
        ).toUpperCase();

        if (!code) return false;

        try {
          const country =
            getGuideEngine()?.getCountry?.(
              code
            );

          const itinerary =
            getTravelAI()
              ?.generateItinerary?.(
                country,
                {
                  days:
                    state.selectedDays,
                  travelers:
                    state.selectedTravelers,
                  month:
                    state.selectedMonth,
                  budget:
                    state.selectedBudget
                }
              );

          const trip =
            await getGuideEngine()
              ?.createTripDraft?.(
                code,
                {
                  days:
                    state.selectedDays,
                  travelers:
                    state.selectedTravelers,
                  budget:
                    state.selectedBudget,
                  itinerary,
                  checklist: {
                    itineraryReady:
                      Boolean(itinerary)
                  }
                }
              );

          safeToast(
            "تم إنشاء الرحلة داخل رحلاتي.",
            "success"
          );

          emit("trip-created", {
            countryCode: code,
            tripId: trip?.id
          });

          return trip || true;
        } catch (error) {
          console.error(
            "TIC Guide trip creation error:",
            error
          );

          safeToast(
            "تعذر إنشاء الرحلة.",
            "error"
          );

          return false;
        }
      }
    );

    register(
      "guide-convert-plan-to-trip",
      async ({ params }) => {
        const planId = text(
          params.planId
        );

        if (!planId) return false;

        try {
          const result =
            await getPlannerEngine()
              ?.convertPlanToTrip?.(
                planId
              );

          safeToast(
            result?.duplicate
              ? "هذه الخطة مرتبطة برحلة مسبقاً."
              : "تم تحويل الخطة إلى رحلة.",
            "success"
          );

          invalidateSnapshotCache();

          await refresh({
            force: true,
            preserveScroll: true,
            allowDuringScroll: true
          });

          return result || true;
        } catch (error) {
          console.error(
            "TIC Guide plan conversion error:",
            error
          );

          safeToast(
            "تعذر تحويل الخطة إلى رحلة.",
            "error"
          );

          return false;
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
        if (
          !state.mounted ||
          state.rendering
        ) {
          return;
        }

        window.clearTimeout(
          state.storeRefreshTimer
        );

        state.storeRefreshTimer =
          window.setTimeout(() => {
            invalidateSnapshotCache();

            refresh({
              force: true,
              preserveScroll: true,
              allowDuringScroll: false
            });
          }, STORE_REFRESH_DELAY);
      });
  };

  /* =========================================================
     Public page API
  ========================================================= */

  const GuidePage = {
    id: PAGE_ID,
    title: "دليل السفر",
    icon: "⌕",
    version: PAGE_VERSION,

    async init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      registerActions();
      subscribeToStore();

      state.escapeHandler = (event) => {
        if (
          event.key === "Escape" &&
          state.countryPickerOpen
        ) {
          closeCountrySheet();
        }
      };

      document.addEventListener(
        "keydown",
        state.escapeHandler
      );

      await getPlannerEngine()?.init?.();
      await getTravelAI()?.init?.();
      await getGuideEngine()?.init?.();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION
      });

      return this.diagnostics();
    },

    async render(context = {}) {
      await this.init();

      const routeCode = text(
        context.countryCode ||
        context.params?.country ||
        context.query?.country
      ).toUpperCase();

      if (routeCode) {
        state.selectedCountryCode =
          routeCode;
        state.activeView = "country";
        invalidateSnapshotCache();
      }

      const snapshot =
        await buildSnapshot();

      state.snapshot = snapshot;

      return renderPage(snapshot);
    },

    async mount(context = {}) {
      await this.init();

      const container =
        resolveContainer(
          context.container
        );

      if (!container) {
        throw new Error(
          "TIC Guide Error: route container not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const routeCode = text(
        context.countryCode ||
        context.params?.country ||
        context.query?.country
      ).toUpperCase();

      if (routeCode) {
        state.selectedCountryCode =
          routeCode;
        state.activeView = "country";
        invalidateSnapshotCache();
      }

      const snapshot =
        await buildSnapshot();

      state.snapshot = snapshot;
      container.innerHTML =
        renderPage(snapshot);

      bindDelegatedPageEvents();
      registerScrollState();

      emit("mounted", {
        totalCountries:
          snapshot.summary
            ?.totalCountries || 0,
        selectedCountryCode:
          state.selectedCountryCode
      });

      return container;
    },

    async afterEnter(context = {}) {
      const container =
        resolveContainer(
          context.container
        );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      removeCountrySheetPortal();
      state.countryPickerOpen = false;
      syncCountrySheetBodyLock();

      bindDelegatedPageEvents();
      registerScrollState();

      return true;
    },

    unmount() {
      unbindDelegatedPageEvents();
      unregisterScrollState();

      state.mounted = false;
      state.container = null;

      window.clearTimeout(
        state.searchTimer
      );

      window.clearTimeout(
        state.storeRefreshTimer
      );

      window.clearTimeout(
        state.scrollTimer
      );

      state.countryPickerOpen = false;
      state.search = "";

      removeCountrySheetPortal();
      syncCountrySheetBodyLock();

      emit("unmounted");
      return true;
    },

    refresh,
    openCountry,

    subscribe(listener) {
      if (
        typeof listener !== "function"
      ) {
        throw new TypeError(
          "TIC Guide subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    getSnapshot() {
      return clone(state.snapshot);
    },

    destroy() {
      this.unmount();

      if (
        typeof state.unsubscribeStore ===
        "function"
      ) {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          try {
            unsubscribe?.();
          } catch (_) {
            // Ignore cleanup errors.
          }
        }
      );

      if (state.escapeHandler) {
        document.removeEventListener(
          "keydown",
          state.escapeHandler
        );
      }

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.snapshot = null;
      state.cacheSnapshot = null;
      state.cacheKey = "";
      state.escapeHandler = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      return {
        id: PAGE_ID,
        version: PAGE_VERSION,
        initialized: state.initialized,
        mounted: state.mounted,
        activeView: state.activeView,
        activeSection:
          state.activeSection,
        selectedCountryCode:
          state.selectedCountryCode,
        search: state.search,
        countryPickerOpen:
          state.countryPickerOpen,
        countrySheetPortalMounted:
          Boolean(
            getCountrySheetRoot()
          ),
        recommendationLimit:
          RECOMMENDATION_LIMIT,
        isUserScrolling:
          state.isUserScrolling,
        refreshQueued:
          state.refreshQueued,
        storeAvailable:
          Boolean(getStore()),
        routerAvailable:
          Boolean(getRouter()),
        uiAvailable:
          Boolean(getUI()),
        guideEngineAvailable:
          Boolean(getGuideEngine()),
        travelAIAvailable:
          Boolean(getTravelAI()),
        plannerEngineAvailable:
          Boolean(getPlannerEngine()),
        actionCount:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages =
    window.TIC.Pages || {};
  window.TIC.Pages.guide = GuidePage;
  window.TICGuidePage = GuidePage;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("guide")) {
      router.register("guide", {
        id: "guide",
        title: "الدليل",
        module: "guide",
        icon: "⌕",
        visible: true,
        order: 3
      });
    }

    router.registerPage?.(
      "guide",
      GuidePage
    );
  }

  GuidePage.init();
})(window, document);
