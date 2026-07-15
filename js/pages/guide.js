/* =========================================================
   Travel Intelligence Center
   Guide Intelligence Platform Page V4.0.0

   File Path:
   js/pages/guide.js

   Purpose:
   - Rebuilt practical Guide Intelligence experience.
   - Uses WorldGuideData, GuideEngine, TravelAI and PlannerEngine.
   - Reads visited countries directly from Trips and Passport.
   - Provides country search, recommendations, country details,
     budget fit, best months, hotel intelligence, itinerary creation,
     wishlist actions and annual-plan creation.
   - Preserves Router, UI actions, Store subscriptions and iPhone-first UX.
   - Removes empty placeholder actions and replaces them with useful flows.

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
  const PAGE_VERSION = "4.0.0";

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
    { id: "explore", label: "المدن والأماكن", icon: "✦" },
    { id: "essentials", label: "الأساسيات", icon: "◈" },
    { id: "planner", label: "الخطة اليومية", icon: "▣" }
  ]);

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    activeView: "discover",
    activeSection: "overview",
    selectedCountryCode: "",
    search: "",
    selectedDays: 7,
    selectedTravelers: 2,
    selectedMonth: new Date().getMonth() + 1,
    selectedBudget: 0,
    snapshot: null,
    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    pendingFocusSelector: null,
    rendering: false
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

  const safeObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const text = (value, fallback = "") =>
    String(value === undefined || value === null ? fallback : value).trim();

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
    if (container instanceof window.Element) return container;

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
      // Ignore in older test environments.
    }

    return payload;
  };

  const renderButton = ({
    label,
    action,
    params = {},
    primary = false,
    block = false,
    icon = ""
  }) => {
    const ui = getUI();

    if (typeof ui?.button === "function") {
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
        }"
        data-action="${escapeHTML(action)}"
        ${attributes}
      >
        ${icon ? `<span>${escapeHTML(icon)}</span>` : ""}
        ${escapeHTML(label)}
      </button>
    `;
  };

  /* =========================================================
     Snapshot
  ========================================================= */

  const buildSnapshot = async () => {
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
    const countries = guide.getCountries?.({
      query: state.search
    }) || [];

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
        await guide.getRecommendations?.({
          limit: 8,
          budget: state.selectedBudget || undefined,
          days: state.selectedDays,
          month: state.selectedMonth
        }) || [];
    } catch (error) {
      console.error("TIC Guide recommendations error:", error);
    }

    let itinerary = null;

    if (
      selectedCountry &&
      state.activeSection === "planner"
    ) {
      try {
        itinerary = ai?.generateItinerary?.(
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

    const planningSummary =
      planner?.getPlanningSummary?.() || {};

    const wishlist =
      planner?.getWishlist?.() ||
      guide.getWishlist?.() ||
      [];

    const annualPlans =
      planner?.getAnnualPlans?.() ||
      [];

    return {
      ready: true,
      summary,
      countries,
      selectedCountry,
      countryGuide,
      recommendations,
      itinerary,
      planningSummary,
      wishlist,
      annualPlans
    };
  };

  /* =========================================================
     Common renderers
  ========================================================= */

  const renderSection = ({
    eyebrow,
    title,
    subtitle,
    content
  }) => {
    const ui = getUI();

    if (typeof ui?.section === "function") {
      return ui.section({
        eyebrow,
        title,
        subtitle,
        content
      });
    }

    return `
      <section class="tic-section">
        <div class="tic-section-head">
          <div>
            ${eyebrow ? `<span class="tic-eyebrow">${escapeHTML(eyebrow)}</span>` : ""}
            <h2>${escapeHTML(title)}</h2>
            ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
          </div>
        </div>
        ${content}
      </section>
    `;
  };

  const renderEmpty = (title, message, icon = "⌕") => `
    <div class="tic-empty">
      <span>${escapeHTML(icon)}</span>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
    </div>
  `;

  const renderStatGrid = (snapshot) => {
    const stats = [
      {
        icon: "🌍",
        value: snapshot.summary.totalCountries || snapshot.countries.length,
        label: "دولة",
        subtitle: "في الدليل"
      },
      {
        icon: "✓",
        value: snapshot.summary.visitedCountries || 0,
        label: "زرتها",
        subtitle: "من رحلاتك وجوازك"
      },
      {
        icon: "☆",
        value: snapshot.summary.wishlistCountries || snapshot.wishlist.length,
        label: "أمنيات",
        subtitle: "وجهات محفوظة"
      },
      {
        icon: "🗓️",
        value: snapshot.summary.annualPlans || snapshot.annualPlans.length,
        label: "خطط",
        subtitle: "في خطتك السنوية"
      }
    ];

    return `
      <div class="tic-stats-grid">
        ${stats
          .map(
            (item) => `
              <article class="tic-card">
                <div class="tic-stat-icon">${escapeHTML(item.icon)}</div>
                <strong>${escapeHTML(item.value)}</strong>
                <span>${escapeHTML(item.label)}</span>
                <small>${escapeHTML(item.subtitle)}</small>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderPlannerControls = () => `
    <div class="tic-card">
      <div class="tic-card-body">
        <div class="tic-form-grid">
          <label class="tic-field">
            <span class="tic-field-label">عدد الأيام</span>
            <input
              class="tic-input"
              type="number"
              min="1"
              max="30"
              value="${escapeHTML(state.selectedDays)}"
              data-guide-days
            >
          </label>

          <label class="tic-field">
            <span class="tic-field-label">عدد المسافرين</span>
            <input
              class="tic-input"
              type="number"
              min="1"
              max="20"
              value="${escapeHTML(state.selectedTravelers)}"
              data-guide-travelers
            >
          </label>

          <label class="tic-field">
            <span class="tic-field-label">شهر السفر</span>
            <select class="tic-input" data-guide-month>
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

          <label class="tic-field">
            <span class="tic-field-label">الميزانية</span>
            <input
              class="tic-input"
              type="number"
              min="0"
              step="500"
              value="${escapeHTML(state.selectedBudget || "")}"
              placeholder="مثال: 15000"
              data-guide-budget
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
    <section class="tic-hero">
      <span class="tic-chip">Travel Intelligence Guide</span>

      <h1>دليل السفر الذكي</h1>

      <p>
        اختر الدولة والمدة والشهر والميزانية، وخذ معلومات عملية
        وجدولاً سياحياً واقتراحات تناسب رحلاتك السابقة.
      </p>

      <div
        class="tic-action-row"
        style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px"
      >
        ${renderButton({
          label: "ابدأ التخطيط",
          action: "guide-focus-country-search",
          primary: true,
          block: true,
          icon: "🌍"
        })}

        ${renderButton({
          label: "عرض خططي",
          action: "guide-scroll-annual-plans",
          block: true,
          icon: "🗓️"
        })}
      </div>
    </section>
  `;

  const renderCountrySearch = (snapshot) => {
    const results = snapshot.countries.slice(0, 20);

    return `
      <div class="tic-card" data-guide-search-card>
        <div class="tic-card-body">
          <label class="tic-field">
            <span class="tic-field-label">ابحث عن دولة</span>
            <input
              type="search"
              class="tic-input"
              data-guide-search
              value="${escapeHTML(state.search)}"
              placeholder="مثال: اليابان، سويسرا، إسبانيا..."
              autocomplete="off"
            >
          </label>

          <label class="tic-field" style="margin-top:14px">
            <span class="tic-field-label">اختر الدولة</span>
            <select class="tic-input" data-guide-country-select>
              <option value="">اختر دولة</option>
              ${snapshot.countries
                .map(
                  (country) => `
                    <option value="${escapeHTML(country.code)}">
                      ${escapeHTML(`${country.flag || "🌍"} ${country.nameAr}`)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          ${
            state.search
              ? `
                <div class="tic-settings-list" style="margin-top:14px">
                  ${
                    results.length
                      ? results
                          .map(
                            (country) => `
                              <button
                                type="button"
                                class="tic-settings-item"
                                style="width:100%;text-align:right"
                                data-action="guide-open-country"
                                data-param-country-code="${escapeHTML(country.code)}"
                              >
                                <div class="tic-settings-item-main">
                                  <div class="tic-settings-icon">
                                    ${escapeHTML(country.flag || "🌍")}
                                  </div>
                                  <div class="tic-settings-copy">
                                    <strong>${escapeHTML(country.nameAr)}</strong>
                                    <small>${escapeHTML(country.nameEn || country.code)}</small>
                                  </div>
                                </div>
                                <span>‹</span>
                              </button>
                            `
                          )
                          .join("")
                      : renderEmpty(
                          "لا توجد نتيجة",
                          "جرب كتابة الاسم بالعربي أو الإنجليزي.",
                          "⌕"
                        )
                  }
                </div>
              `
              : ""
          }
        </div>
      </div>
    `;
  };

  const renderRecommendationCard = (item) => {
    const country = item.country || item;
    const score = number(item.score || country.recommendationScore, 0);
    const reasons = safeArray(item.reasons);
    const warnings = safeArray(item.warnings);
    const estimate =
      item.estimate ||
      country.estimatedIdealTrip ||
      item.budgetFit?.estimate ||
      {};

    return `
      <article class="tic-card tic-destination-card">
        <div class="tic-card-body">
          <div class="tic-feature-row">
            <div>
              <span class="tic-chip">
                ${escapeHTML(country.flag || "🌍")}
                ${escapeHTML(country.nameAr || country.countryName || country.code)}
              </span>
              <h3 class="tic-card-title" style="margin-top:10px">
                تطابق ${escapeHTML(score)}%
              </h3>
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

          ${
            reasons.length
              ? `
                <ul class="tic-list" style="margin-top:12px">
                  ${reasons
                    .slice(0, 4)
                    .map((reason) => `<li>${escapeHTML(reason)}</li>`)
                    .join("")}
                </ul>
              `
              : `
                <p class="tic-subtitle">
                  وجهة قريبة من أسلوب سفرك الحالي.
                </p>
              `
          }

          ${
            estimate.totalAED
              ? `
                <div class="tic-settings-list" style="margin-top:12px">
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>التكلفة التقريبية</strong>
                        <small>${escapeHTML(formatAED(estimate.totalAED))}</small>
                      </div>
                    </div>
                  </div>
                </div>
              `
              : ""
          }

          ${
            warnings.length
              ? `
                <p class="tic-subtitle" style="margin-top:10px">
                  ${escapeHTML(warnings[0])}
                </p>
              `
              : ""
          }

          <div style="margin-top:14px">
            ${renderButton({
              label: "استكشف الدليل",
              action: "guide-open-country",
              params: { countryCode: country.code },
              primary: true,
              block: true
            })}
          </div>
        </div>
      </article>
    `;
  };

  const renderRecommendations = (snapshot) => {
    if (!snapshot.recommendations.length) {
      return renderEmpty(
        "ما عندنا اقتراحات كافية للحين",
        "أضف رحلاتك السابقة أو حدّد ميزانيتك وشهرك المفضل.",
        "✦"
      );
    }

    return `
      <div class="tic-destination-grid">
        ${snapshot.recommendations
          .map(renderRecommendationCard)
          .join("")}
      </div>
    `;
  };

  const renderTravelDNA = (snapshot) => {
    const dna = snapshot.summary.profile || {};
    const budget = snapshot.summary.budget || {};

    const rows = [
      ["أسلوب السفر", dna.travelStyle || "غير محدد"],
      ["المطار الأساسي", dna.homeAirport || "أبوظبي"],
      ["الميزانية السنوية", formatAED(budget.annualTravelBudget || 0)],
      ["المتاح حالياً", formatAED(
        budget.availableTravelBudget ||
        budget.savedAmount ||
        0
      )],
      ["متوسط الادخار الشهري", formatAED(budget.monthlySaving || 0)]
    ];

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <span class="tic-chip">Travel Profile</span>
          <h3 class="tic-card-title" style="margin-top:10px">
            ملف سفرك الحالي
          </h3>

          <p class="tic-subtitle">
            هذه البيانات هي التي يعتمد عليها الدليل في اختيار
            الوجهات المناسبة لك.
          </p>

          <div class="tic-settings-list" style="margin-top:14px">
            ${rows
              .map(
                ([label, value]) => `
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>${escapeHTML(label)}</strong>
                        <small>${escapeHTML(value)}</small>
                      </div>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  };

  const renderWishlist = (snapshot) => {
    if (!snapshot.wishlist.length) {
      return renderEmpty(
        "قائمة الأمنيات فاضية",
        "اضغط النجمة على أي دولة لحفظها هنا.",
        "☆"
      );
    }

    return `
      <div class="tic-destination-grid">
        ${snapshot.wishlist
          .slice(0, 6)
          .map((item) => {
            const country = item.country || getGuideEngine()?.getCountry?.(
              item.countryCode
            );

            return `
              <article class="tic-card">
                <div class="tic-card-body">
                  <span class="tic-chip">
                    ${escapeHTML(country?.flag || "🌍")}
                    ${escapeHTML(
                      country?.nameAr ||
                      item.countryName ||
                      item.countryCode
                    )}
                  </span>

                  <p class="tic-subtitle" style="margin-top:10px">
                    محفوظة منذ ${escapeHTML(
                      item.addedAt
                        ? new Date(item.addedAt).toLocaleDateString("ar-AE")
                        : "الآن"
                    )}
                  </p>

                  <div style="margin-top:12px">
                    ${renderButton({
                      label: "فتح الدليل",
                      action: "guide-open-country",
                      params: { countryCode: item.countryCode },
                      primary: true,
                      block: true
                    })}
                  </div>
                </div>
              </article>
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
        "افتح أي دولة واضغط أضف إلى الخطة السنوية.",
        "🗓️"
      );
    }

    return `
      <div class="tic-destination-grid">
        ${snapshot.annualPlans
          .slice(0, 8)
          .map(
            (plan) => `
              <article class="tic-card">
                <div class="tic-card-body">
                  <span class="tic-chip">
                    ${escapeHTML(plan.country?.flag || "🌍")}
                    ${escapeHTML(
                      plan.country?.nameAr ||
                      plan.countryName ||
                      plan.countryCode
                    )}
                  </span>

                  <div class="tic-settings-list" style="margin-top:12px">
                    <div class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-copy">
                          <strong>موعد السفر</strong>
                          <small>
                            ${escapeHTML(
                              `${plan.month ? monthLabel(plan.month) : "غير محدد"} ${plan.year}`
                            )}
                          </small>
                        </div>
                      </div>
                    </div>

                    <div class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-copy">
                          <strong>المدة والميزانية</strong>
                          <small>
                            ${escapeHTML(`${plan.days} أيام · ${formatAED(plan.budgetAED)}`)}
                          </small>
                        </div>
                      </div>
                    </div>

                    <div class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-copy">
                          <strong>الجاهزية</strong>
                          <small>
                            ${escapeHTML(plan.readiness?.percent || 0)}%
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style="margin-top:12px">
                    ${renderButton({
                      label: "تحويل إلى رحلة",
                      action: "guide-convert-plan-to-trip",
                      params: { planId: plan.id },
                      primary: true,
                      block: true
                    })}
                  </div>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderDiscoverView = (snapshot) => `
    ${renderHero()}

    ${renderSection({
      eyebrow: "OVERVIEW",
      title: "العالم بين يديك",
      subtitle: "كل الأرقام مربوطة مباشرة برحلاتك وجواز سفرك.",
      content: renderStatGrid(snapshot)
    })}

    ${renderSection({
      eyebrow: "PLAN YOUR TRIP",
      title: "اختر الدولة وخطط صح",
      subtitle: "اكتب اسم الدولة وحدد الأيام والشهر والميزانية.",
      content: `
        ${renderPlannerControls()}
        <div style="margin-top:12px">
          ${renderCountrySearch(snapshot)}
        </div>
      `
    })}

    ${renderSection({
      eyebrow: "RECOMMENDED FOR YOU",
      title: "اقتراحات تناسبك",
      subtitle: "مبنية على رحلاتك السابقة وميزانيتك وتفضيلاتك.",
      content: renderRecommendations(snapshot)
    })}

    ${renderSection({
      eyebrow: "WISHLIST",
      title: "قائمة الأمنيات",
      subtitle: "كل دولة تحفظها تظهر هنا ويمكن تحويلها لاحقاً إلى خطة.",
      content: renderWishlist(snapshot)
    })}

    <div data-guide-annual-plans>
      ${renderSection({
        eyebrow: "ANNUAL PLANNER",
        title: "خطتك السنوية",
        subtitle: "خطط فعلية تقدر تتابعها وتحولها إلى رحلة.",
        content: renderAnnualPlans(snapshot)
      })}
    </div>

    ${renderSection({
      eyebrow: "YOUR PROFILE",
      title: "ملف سفرك",
      subtitle: "بدل شرح كيف يفهمك النظام، نعرض البيانات التي يعتمد عليها فعلياً.",
      content: renderTravelDNA(snapshot)
    })}
  `;

  /* =========================================================
     Country view
  ========================================================= */

  const renderCountryTabs = () => `
    <div
      class="tic-filter-row"
      style="position:sticky;top:0;z-index:5;padding:10px 0;background:rgba(248,250,252,.94);backdrop-filter:blur(14px)"
    >
      ${VIEW_SECTIONS.map(
        (section) => `
          <button
            type="button"
            class="tic-filter-chip ${
              state.activeSection === section.id ? "is-active" : ""
            }"
            data-action="guide-set-section"
            data-param-section="${escapeHTML(section.id)}"
          >
            ${escapeHTML(section.icon)}
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
      <section class="tic-hero">
        <div class="tic-feature-row">
          <div>
            <span class="tic-chip">
              ${escapeHTML(country.flag || "🌍")}
              ${escapeHTML(country.nameEn || country.code)}
            </span>

            <h1>${escapeHTML(country.nameAr)}</h1>

            <p>${escapeHTML(country.summary || "دليل عملي لهذه الوجهة.")}</p>
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

        <div class="tic-card" style="margin-top:16px">
          <div class="tic-card-body">
            <div class="tic-feature-row">
              <strong>تطابق الوجهة معك</strong>
              <span class="tic-chip">${escapeHTML(Math.round(number(score)))}%</span>
            </div>

            ${
              safeArray(guide?.aiInsights?.reasons).length
                ? `
                  <ul class="tic-list" style="margin-top:10px">
                    ${safeArray(guide.aiInsights.reasons)
                      .slice(0, 4)
                      .map((reason) => `<li>${escapeHTML(reason)}</li>`)
                      .join("")}
                  </ul>
                `
                : ""
            }
          </div>
        </div>

        <div
          class="tic-action-row"
          style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px"
        >
          ${renderButton({
            label: "إضافة إلى الخطة",
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

        <div style="margin-top:10px">
          ${renderButton({
            label: "العودة للدليل",
            action: "guide-show-discover",
            block: true
          })}
        </div>
      </section>
    `;
  };

  const renderInfoRows = (title, rows) => {
    const visible = rows.filter((row) => text(row.value));

    if (!visible.length) return "";

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <h3 class="tic-card-title">${escapeHTML(title)}</h3>
          <div class="tic-settings-list">
            ${visible
              .map(
                (row) => `
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>${escapeHTML(row.label)}</strong>
                        <small>${escapeHTML(row.value)}</small>
                      </div>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    `;
  };

  const renderSimpleList = (title, items, emptyText = "") => {
    const normalized = safeArray(items);

    if (!normalized.length) {
      return emptyText
        ? `
          <section class="tic-card">
            <div class="tic-card-body">
              <h3 class="tic-card-title">${escapeHTML(title)}</h3>
              <p class="tic-subtitle">${escapeHTML(emptyText)}</p>
            </div>
          </section>
        `
        : "";
    }

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <h3 class="tic-card-title">${escapeHTML(title)}</h3>
          <div class="tic-settings-list">
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
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>${escapeHTML(value)}</strong>
                        ${secondary ? `<small>${escapeHTML(secondary)}</small>` : ""}
                      </div>
                    </div>
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

    return `
      <div class="tic-destination-grid">
        ${renderInfoRows("نظرة سريعة", [
          { label: "العاصمة", value: country.capital },
          { label: "القارة", value: country.continent },
          { label: "العملة", value: country.currency },
          {
            label: "مدة الطيران من أبوظبي",
            value: country.flightDurationFromAbuDhabiHours
              ? `${country.flightDurationFromAbuDhabiHours} ساعات تقريباً`
              : ""
          },
          {
            label: "المدة المثالية",
            value: `${country.recommendedDays.ideal} أيام`
          }
        ])}

        ${renderInfoRows("تكلفة الرحلة التقريبية", [
          { label: "الطيران", value: formatAED(estimate.flightAED) },
          { label: "الفندق", value: formatAED(estimate.hotelAED) },
          { label: "المصروف اليومي", value: formatAED(estimate.dailyExpensesAED) },
          { label: "الإجمالي", value: formatAED(estimate.totalAED) }
        ])}

        ${renderSimpleList("أفضل المدن", country.cities)}
        ${renderSimpleList("أنسب أنماط السفر", country.travelStyles)}
      </div>
    `;
  };

  const renderWeatherSection = (snapshot) => {
    const country = snapshot.selectedCountry;
    const guide = snapshot.countryGuide;

    return `
      <div class="tic-destination-grid">
        ${renderInfoRows("طقس الشهر المختار", [
          { label: "الشهر", value: monthLabel(state.selectedMonth) },
          {
            label: "أقل درجة",
            value: guide?.weather?.min !== null && guide?.weather?.min !== undefined
              ? `${guide.weather.min}°`
              : ""
          },
          {
            label: "أعلى درجة",
            value: guide?.weather?.max !== null && guide?.weather?.max !== undefined
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
          "لا توجد أشهر محددة في قاعدة البيانات حالياً."
        )}
      </div>
    `;
  };

  const renderStaySection = (snapshot) => {
    const country = snapshot.selectedCountry;
    const recommendations =
      snapshot.countryGuide?.aiInsights?.hotelRecommendations ||
      [];

    return `
      <div class="tic-destination-grid">
        ${
          recommendations.length
            ? recommendations
                .map(
                  (item) => `
                    <article class="tic-card">
                      <div class="tic-card-body">
                        <span class="tic-chip">
                          ${escapeHTML(item.hotel.city || country.nameAr)}
                        </span>

                        <h3 class="tic-card-title" style="margin-top:10px">
                          ${escapeHTML(item.hotel.nameAr || item.hotel.name)}
                        </h3>

                        <div class="tic-settings-list" style="margin-top:12px">
                          <div class="tic-settings-item">
                            <div class="tic-settings-item-main">
                              <div class="tic-settings-copy">
                                <strong>التقييم الذكي</strong>
                                <small>${escapeHTML(item.score)}%</small>
                              </div>
                            </div>
                          </div>

                          <div class="tic-settings-item">
                            <div class="tic-settings-item-main">
                              <div class="tic-settings-copy">
                                <strong>الشطاف</strong>
                                <small>${item.hotel.hasShattaf ? "متوفر" : "يحتاج تأكيد"}</small>
                              </div>
                            </div>
                          </div>

                          <div class="tic-settings-item">
                            <div class="tic-settings-item-main">
                              <div class="tic-settings-copy">
                                <strong>السعر التقريبي لليلة</strong>
                                <small>${escapeHTML(formatAED(item.hotel.estimatedNightlyAED))}</small>
                              </div>
                            </div>
                          </div>
                        </div>

                        ${
                          item.reasons.length
                            ? `
                              <ul class="tic-list" style="margin-top:10px">
                                ${item.reasons
                                  .map((reason) => `<li>${escapeHTML(reason)}</li>`)
                                  .join("")}
                              </ul>
                            `
                            : ""
                        }
                      </div>
                    </article>
                  `
                )
                .join("")
            : renderEmpty(
                "لا توجد فنادق مفصلة لهذه الدولة حالياً",
                "المحرك سيعرض بيانات الفنادق فور إضافتها إلى قاعدة البيانات.",
                "⌂"
              )
        }

        ${renderSimpleList(
          "معلومات عامة عن الإقامة",
          [
            `توفر الشطاف: ${country.shattafAvailability || "غير معروف"}`,
            country.familyFriendly ? "مناسبة للعائلات" : "راجع ملاءمتها للعائلة",
            country.halal?.friendly ? "خيارات الحلال متوفرة" : "ابحث مسبقاً عن خيارات الحلال"
          ]
        )}
      </div>
    `;
  };

  const renderExploreSection = (snapshot) => {
    const country = snapshot.selectedCountry;

    return `
      <div class="tic-destination-grid">
        ${renderSimpleList("أفضل المدن", country.cities)}
        ${renderSimpleList(
          "الأماكن السياحية",
          country.attractions,
          "سيتم عرض الأماكن المفصلة عند توفر بيانات الدولة."
        )}
        ${renderSimpleList(
          "الشواطئ",
          country.beaches,
          "لا توجد شواطئ مضافة لهذه الوجهة حالياً."
        )}
        ${renderSimpleList(
          "الأنشطة والتجارب",
          country.experiences,
          "لا توجد تجارب مضافة لهذه الوجهة حالياً."
        )}
        ${renderSimpleList(
          "المطاعم الحلال",
          country.halalRestaurants,
          "راجع المطاعم الحلال في المدينة المختارة قبل السفر."
        )}
      </div>
    `;
  };

  const renderEssentialsSection = (snapshot) => {
    const country = snapshot.selectedCountry;

    return `
      <div class="tic-destination-grid">
        ${renderInfoRows("التأشيرة والدخول", [
          { label: "الحالة", value: country.visa?.status },
          { label: "ملاحظة", value: country.visa?.note }
        ])}

        ${renderSimpleList("متطلبات الدخول", country.entryRequirements)}

        ${renderInfoRows("اللغة والعملة", [
          { label: "اللغات", value: safeArray(country.languages).join("، ") },
          { label: "العملة", value: country.currency },
          { label: "فرق التوقيت", value: country.timezone }
        ])}

        ${renderInfoRows("المواصلات", [
          { label: "المواصلات العامة", value: country.transport?.publicTransport },
          {
            label: "هل السيارة مطلوبة؟",
            value: country.transport?.carRecommended ? "نعم" : "غالباً لا"
          },
          { label: "ملاحظات", value: country.transport?.notes }
        ])}

        ${renderInfoRows("الاتصال والكهرباء", [
          { label: "eSIM", value: country.connectivity?.esim },
          { label: "SIM", value: country.connectivity?.sim },
          {
            label: "المحول الكهربائي",
            value: country.electricity?.adapterRecommended ? "يفضل حمله" : "غالباً غير مطلوب"
          }
        ])}

        ${renderInfoRows("الملاءمة", [
          {
            label: "الحلال",
            value: country.halal?.friendly ? "متوفر" : "يحتاج تخطيط"
          },
          {
            label: "الشطاف",
            value: country.shattafAvailability || "غير معروف"
          },
          {
            label: "العائلة",
            value: country.familyFriendly ? "مناسبة" : "راجع التفاصيل"
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
        "▣"
      );
    }

    return `
      ${renderPlannerControls()}

      <div class="tic-destination-grid" style="margin-top:14px">
        ${itinerary.itinerary
          .map(
            (day) => `
              <article class="tic-card">
                <div class="tic-card-body">
                  <span class="tic-chip">
                    اليوم ${escapeHTML(day.day)}
                    ${day.city ? ` · ${escapeHTML(day.city)}` : ""}
                  </span>

                  <h3 class="tic-card-title" style="margin-top:10px">
                    ${escapeHTML(day.theme)}
                  </h3>

                  <div class="tic-settings-list" style="margin-top:12px">
                    ${safeArray(day.activities)
                      .map(
                        (activity) => `
                          <div class="tic-settings-item">
                            <div class="tic-settings-item-main">
                              <div class="tic-settings-copy">
                                <strong>${escapeHTML(activity.name)}</strong>
                                <small>${escapeHTML(activity.period || activity.type || "")}</small>
                              </div>
                            </div>
                          </div>
                        `
                      )
                      .join("")}
                  </div>

                  ${day.notes ? `<p class="tic-subtitle" style="margin-top:10px">${escapeHTML(day.notes)}</p>` : ""}
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
        subtitle: "غيّر الأيام والشهر والميزانية وسيتم تحديث الدليل مباشرة.",
        content: renderPlannerControls()
      })}

      ${renderCountryTabs()}

      ${renderSection({
        eyebrow: "COUNTRY INTELLIGENCE",
        title: "دليل ${snapshot.selectedCountry.nameAr}",
        subtitle: "معلومات عملية مرتبطة بميزانيتك وتفضيلاتك.",
        content: renderCountrySection(snapshot)
      })}
    `;
  };

  const renderPage = (snapshot) => {
    if (!snapshot.ready) {
      return `
        <div
          class="tic-module"
          data-page="${PAGE_ID}"
          data-page-version="${PAGE_VERSION}"
        >
          ${renderEmpty(
            "الدليل غير جاهز",
            snapshot.error || "تأكد من تحميل ملفات الدليل الجديدة.",
            "⚠️"
          )}
        </div>
      `;
    }

    return `
      <div
        class="tic-module"
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
     Events and refresh
  ========================================================= */

  const applyListeners = () => {
    if (!state.container) return;

    const searchInput =
      state.container.querySelector("[data-guide-search]");

    searchInput?.addEventListener("input", (event) => {
      state.search = event.target.value;
      refresh({ preserveSearchFocus: true });
    });

    const select =
      state.container.querySelector("[data-guide-country-select]");

    select?.addEventListener("change", (event) => {
      const code = text(event.target.value).toUpperCase();

      if (code) openCountry(code);
    });

    const days =
      state.container.querySelector("[data-guide-days]");

    days?.addEventListener("change", (event) => {
      state.selectedDays = clamp(number(event.target.value, 7), 1, 30);
      refresh();
    });

    const travelers =
      state.container.querySelector("[data-guide-travelers]");

    travelers?.addEventListener("change", (event) => {
      state.selectedTravelers = clamp(number(event.target.value, 2), 1, 20);
      refresh();
    });

    const month =
      state.container.querySelector("[data-guide-month]");

    month?.addEventListener("change", (event) => {
      state.selectedMonth = clamp(number(event.target.value, 1), 1, 12);
      refresh();
    });

    const budget =
      state.container.querySelector("[data-guide-budget]");

    budget?.addEventListener("change", (event) => {
      state.selectedBudget = Math.max(0, number(event.target.value, 0));
      refresh();
    });

    if (state.pendingFocusSelector) {
      const target =
        state.container.querySelector(state.pendingFocusSelector);

      target?.focus?.();
      state.pendingFocusSelector = null;
    }
  };

  const refresh = async (options = {}) => {
    if (
      !state.container ||
      !state.mounted ||
      state.rendering
    ) {
      return false;
    }

    state.rendering = true;

    const activeElement = document.activeElement;
    const preserveSearch =
      options.preserveSearchFocus === true &&
      activeElement?.matches?.("[data-guide-search]");

    const cursor =
      preserveSearch &&
      typeof activeElement.selectionStart === "number"
        ? activeElement.selectionStart
        : null;

    try {
      const snapshot = await buildSnapshot();
      state.snapshot = snapshot;
      state.container.innerHTML = renderPage(snapshot);
      applyListeners();

      if (preserveSearch) {
        const input =
          state.container.querySelector("[data-guide-search]");

        input?.focus?.();

        if (input && cursor !== null) {
          input.setSelectionRange(cursor, cursor);
        }
      }

      emit("refreshed", {
        activeView: state.activeView,
        activeSection: state.activeSection,
        selectedCountryCode: state.selectedCountryCode
      });

      return true;
    } finally {
      state.rendering = false;
    }
  };

  const openCountry = async (countryCode) => {
    const guide = getGuideEngine();
    const code = text(countryCode).toUpperCase();

    if (!guide || !code) {
      safeToast("تعذر فتح الدولة.", "error");
      return false;
    }

    const country = guide.selectCountry?.(code);

    if (!country) {
      safeToast("لا توجد بيانات لهذه الدولة.", "info");
      return false;
    }

    state.selectedCountryCode = code;
    state.selectedDays =
      country.recommendedDays?.ideal ||
      state.selectedDays;
    state.activeView = "country";
    state.activeSection = "overview";
    state.search = "";

    getStore()?.setSelectedGuideCountry?.(code);

    await refresh();

    try {
      state.container?.scrollTo?.({
        top: 0,
        behavior: "smooth"
      });
    } catch (_) {
      // Scrolling is optional.
    }

    emit("country-opened", { countryCode: code });

    return true;
  };

  /* =========================================================
     Actions
  ========================================================= */

  const registerActions = () => {
    const ui = getUI();

    if (!ui || typeof ui.registerAction !== "function") {
      return;
    }

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe = ui.registerAction(name, handler);

      if (typeof unsubscribe === "function") {
        state.actionUnsubscribers.push(unsubscribe);
      }
    };

    register("guide-show-discover", async () => {
      state.activeView = "discover";
      state.activeSection = "overview";
      state.selectedCountryCode = "";
      state.search = "";
      getGuideEngine()?.clearSelection?.();
      await refresh();
      return true;
    });

    register("guide-focus-country-search", async () => {
      state.activeView = "discover";
      state.pendingFocusSelector = "[data-guide-search]";
      await refresh();

      window.setTimeout(() => {
        state.container
          ?.querySelector("[data-guide-search-card]")
          ?.scrollIntoView?.({
            behavior: "smooth",
            block: "center"
          });
      }, 50);

      return true;
    });

    register("guide-scroll-annual-plans", async () => {
      state.activeView = "discover";
      await refresh();

      window.setTimeout(() => {
        state.container
          ?.querySelector("[data-guide-annual-plans]")
          ?.scrollIntoView?.({
            behavior: "smooth",
            block: "start"
          });
      }, 50);

      return true;
    });

    register("guide-open-country", ({ params }) =>
      openCountry(
        params.countryCode ||
        params.country ||
        params.code
      )
    );

    register("guide-set-section", async ({ params }) => {
      const section = text(params.section);

      if (!VIEW_SECTIONS.some((item) => item.id === section)) {
        return false;
      }

      state.activeSection = section;
      await refresh();

      return true;
    });

    register("guide-toggle-wishlist", async ({ params }) => {
      const code = text(params.countryCode).toUpperCase();

      if (!code) return false;

      try {
        const result =
          await getGuideEngine()?.toggleWishlist?.(code);

        safeToast(
          result?.wishlisted
            ? "تمت إضافة الدولة إلى الأمنيات."
            : "تمت إزالة الدولة من الأمنيات.",
          "success"
        );

        await refresh();
        return result || true;
      } catch (error) {
        console.error("TIC Guide wishlist error:", error);
        safeToast("تعذر تحديث قائمة الأمنيات.", "error");
        return false;
      }
    });

    register("guide-add-annual-plan", async ({ params }) => {
      const code =
        text(
          params.countryCode ||
          state.selectedCountryCode
        ).toUpperCase();

      if (!code) return false;

      try {
        const plan =
          await getGuideEngine()?.addToAnnualPlan?.(
            code,
            {
              year: new Date().getFullYear(),
              month: state.selectedMonth,
              days: state.selectedDays,
              travelers: state.selectedTravelers,
              budgetAED: state.selectedBudget,
              status: "planned"
            }
          );

        safeToast(
          plan?.duplicate
            ? "هذه الخطة موجودة مسبقاً."
            : "تمت إضافة الدولة إلى خطتك السنوية.",
          "success"
        );

        await refresh();
        return plan || true;
      } catch (error) {
        console.error("TIC Guide annual plan error:", error);
        safeToast("تعذر حفظ الخطة السنوية.", "error");
        return false;
      }
    });

    register("guide-create-trip", async ({ params }) => {
      const code =
        text(
          params.countryCode ||
          state.selectedCountryCode
        ).toUpperCase();

      if (!code) return false;

      try {
        const itinerary =
          getTravelAI()?.generateItinerary?.(
            getGuideEngine()?.getCountry?.(code),
            {
              days: state.selectedDays,
              travelers: state.selectedTravelers,
              month: state.selectedMonth,
              budget: state.selectedBudget
            }
          );

        const trip =
          await getGuideEngine()?.createTripDraft?.(
            code,
            {
              days: state.selectedDays,
              travelers: state.selectedTravelers,
              budget: state.selectedBudget,
              itinerary,
              checklist: {
                itineraryReady: Boolean(itinerary)
              }
            }
          );

        safeToast("تم إنشاء الرحلة داخل رحلاتي.", "success");

        emit("trip-created", {
          countryCode: code,
          tripId: trip?.id
        });

        return trip || true;
      } catch (error) {
        console.error("TIC Guide trip creation error:", error);
        safeToast("تعذر إنشاء الرحلة.", "error");
        return false;
      }
    });

    register("guide-convert-plan-to-trip", async ({ params }) => {
      const planId = text(params.planId);

      if (!planId) return false;

      try {
        const result =
          await getPlannerEngine()?.convertPlanToTrip?.(
            planId
          );

        safeToast(
          result?.duplicate
            ? "هذه الخطة مرتبطة برحلة مسبقاً."
            : "تم تحويل الخطة إلى رحلة.",
          "success"
        );

        await refresh();
        return result || true;
      } catch (error) {
        console.error("TIC Guide plan conversion error:", error);
        safeToast("تعذر تحويل الخطة إلى رحلة.", "error");
        return false;
      }
    });
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

    state.unsubscribeStore = store.subscribe(() => {
      if (state.mounted && !state.rendering) {
        refresh();
      }
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
      if (state.initialized) return this.diagnostics();

      registerActions();
      subscribeToStore();

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

      const routeCode =
        text(
          context.countryCode ||
          context.params?.country ||
          context.query?.country
        ).toUpperCase();

      if (routeCode) {
        state.selectedCountryCode = routeCode;
        state.activeView = "country";
      }

      const snapshot = await buildSnapshot();
      state.snapshot = snapshot;

      return renderPage(snapshot);
    },

    async mount(context = {}) {
      await this.init();

      const container = resolveContainer(context.container);

      if (!container) {
        throw new Error(
          "TIC Guide Error: route container not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const routeCode =
        text(
          context.countryCode ||
          context.params?.country ||
          context.query?.country
        ).toUpperCase();

      if (routeCode) {
        state.selectedCountryCode = routeCode;
        state.activeView = "country";
      }

      const snapshot = await buildSnapshot();
      state.snapshot = snapshot;

      container.innerHTML = renderPage(snapshot);
      applyListeners();

      emit("mounted", {
        totalCountries: snapshot.summary?.totalCountries || 0,
        selectedCountryCode: state.selectedCountryCode
      });

      return container;
    },

    async afterEnter(context = {}) {
      const container = resolveContainer(context.container);

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      applyListeners();
      return true;
    },

    unmount() {
      state.mounted = false;
      state.container = null;
      emit("unmounted");
      return true;
    },

    refresh,
    openCountry,

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Guide subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () => state.subscribers.delete(listener);
    },

    getSnapshot() {
      return clone(state.snapshot);
    },

    destroy() {
      this.unmount();

      if (typeof state.unsubscribeStore === "function") {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (_) {
          // Ignore cleanup errors.
        }
      });

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.snapshot = null;
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
        activeSection: state.activeSection,
        selectedCountryCode: state.selectedCountryCode,
        search: state.search,
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI()),
        guideEngineAvailable: Boolean(getGuideEngine()),
        travelAIAvailable: Boolean(getTravelAI()),
        plannerEngineAvailable: Boolean(getPlannerEngine()),
        actionCount: state.actionUnsubscribers.length,
        subscriberCount: state.subscribers.size
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.guide = GuidePage;
  window.TICGuidePage = GuidePage;

  const router = getRouter();

  if (router && typeof router.register === "function") {
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

    router.registerPage?.("guide", GuidePage);
  }

  GuidePage.init();
})(window, document);
