/* =========================================================
   Travel Intelligence Center
   Guide Intelligence Platform Page V3.0.0

   File Path:
   js/pages/guide.js

   Purpose:
   - Production-ready Guide Intelligence Platform page.
   - Preserves the stable page lifecycle, Store subscription,
     Router registration, UI actions and wishlist persistence.
   - Connects the page with the new Guide Intelligence engines.
   - Supports country discovery, professional country selection,
     search, intelligent recommendations, Travel DNA insights,
     complete country guides, AI trip planning and year planning.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/data/countries-catalog.js
   - js/data/travel-knowledge.js
   - js/features/destination-recommendation-engine.js
   - js/features/guide-search-engine.js
   - js/features/guide-ai-planner.js
   - js/features/travel-dna.js
   - js/features/travel-year-planner.js
   - js/features/guide-intelligence.js

   Global APIs:
   - window.TIC.Pages.guide
   - window.TICGuidePage
========================================================= */

(function (window, document) {
  "use strict";

  const PAGE_ID = "guide";
  const PAGE_VERSION = "3.0.0";

  const MONTHS_AR = [
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
  ];

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    search: "",
    selectedCountryCode: "",
    selectedGuide: null,
    activeView: "discover",
    activeSection: "overview",
    recommendationLimit: 8,
    subscribers: new Set(),
    actionUnsubscribers: [],
    unsubscribeStore: null,
    lastSnapshot: null,
    lastDashboard: null,
    lastSearchResult: null,
    pendingFocusSelector: null
  };

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

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const text = (value) =>
    String(value ?? "").trim();

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const array = (value) =>
    Array.isArray(value) ? clone(value) : [];

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

  const getGuideIntelligence = () =>
    window.TIC?.Features?.GuideIntelligence ||
    window.TICGuideIntelligence ||
    null;

  const getYearPlanner = () =>
    window.TIC?.Features?.TravelYearPlanner ||
    window.TICTravelYearPlanner ||
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
        console.error("TIC Guide subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const safeToast = (message, tone = "success") => {
    const ui = getUI();

    if (typeof ui?.toast === "function") {
      try {
        ui.toast(message, tone);
        return true;
      } catch (error) {
        try {
          ui.toast(message, { tone });
          return true;
        } catch (nestedError) {
          console.error("TIC Guide toast error:", nestedError);
        }
      }
    }

    return false;
  };

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    if (typeof store.get === "function") {
      return {
        destinations: store.get("destinations"),
        wishlist: store.get("wishlist"),
        profile: store.get("profile"),
        trips: store.get("trips"),
        guides: store.get("guides"),
        budgets: store.get("budgets"),
        settings: store.get("settings")
      };
    }

    return {};
  };

  const getRouteCountryCode = (context = {}) => {
    const direct =
      context.countryCode ||
      context.params?.country ||
      context.query?.country ||
      context.route?.query?.country ||
      context.route?.params?.country;

    if (direct) {
      return text(direct).toUpperCase();
    }

    try {
      const params = new URLSearchParams(window.location.search);
      return text(params.get("country")).toUpperCase();
    } catch (error) {
      return "";
    }
  };

  const normalizeCountry = (item) => {
    if (!item) return null;

    const code = text(
      item.countryCode ||
      item.iso2 ||
      item.code
    ).toUpperCase();

    if (!code) return null;

    return {
      ...clone(item),
      countryCode: code,
      nameAr: text(
        item.nameAr ||
        item.arabicName ||
        item.countryNameAr ||
        item.name ||
        code
      ),
      nameEn: text(
        item.nameEn ||
        item.englishName ||
        item.countryNameEn
      ),
      flag: text(
        item.flag ||
        item.emoji
      )
    };
  };

  const buildSnapshot = () => {
    const intelligence = getGuideIntelligence();
    const raw = getStoreState();

    let searchResult = {
      items: [],
      total: 0,
      filters: {
        query: state.search
      }
    };

    let dashboard = null;

    if (intelligence) {
      try {
        searchResult =
          intelligence.searchCountries?.({
            query: state.search,
            sortBy: "alphabetical",
            sortDirection: "asc",
            limit: 250
          }) ||
          intelligence.search?.({
            query: state.search,
            limit: 250
          }) ||
          searchResult;
      } catch (error) {
        console.error("TIC Guide search error:", error);
      }

      try {
        dashboard =
          intelligence.getDashboardData?.({
            recommendationsLimit:
              state.recommendationLimit
          }) ||
          null;
      } catch (error) {
        console.error("TIC Guide dashboard error:", error);
      }
    }

    const countries = array(searchResult.items)
      .map(normalizeCountry)
      .filter(Boolean);

    const recommendations = array(
      dashboard?.recommendations?.items
    )
      .map(normalizeCountry)
      .filter(Boolean);

    const recentCountries = array(
      dashboard?.recentCountries
    )
      .map(normalizeCountry)
      .filter(Boolean);

    const wishlist = array(raw.wishlist);

    const wishlistCodes = new Set(
      wishlist
        .map((item) =>
          text(
            typeof item === "string"
              ? item
              : item.countryCode ||
                item.iso2 ||
                item.code
          ).toUpperCase()
        )
        .filter(Boolean)
    );

    const selectedGuide =
      state.selectedCountryCode && intelligence
        ? (
            state.selectedGuide ||
            intelligence.buildCountryGuide?.(
              state.selectedCountryCode,
              {
                includeTravelDNA: true,
                language: "ar"
              }
            ) ||
            null
          )
        : null;

    state.selectedGuide = selectedGuide;
    state.lastSearchResult = searchResult;
    state.lastDashboard = dashboard;

    const snapshot = {
      raw,
      countries,
      recommendations,
      recentCountries,
      wishlist,
      wishlistCodes,
      selectedGuide,
      travelDNA:
        dashboard?.travelDNA ||
        intelligence?.getTravelDNAProfile?.() ||
        null,
      statistics: {
        totalCountries:
          number(
            dashboard?.statistics?.totalCountries,
            countries.length
          ),
        visitedCountries:
          number(
            dashboard?.statistics?.visitedCountries,
            0
          ),
        wishlistCountries:
          number(
            dashboard?.statistics?.wishlistCountries,
            wishlistCodes.size
          ),
        savedPlans:
          number(
            dashboard?.statistics?.savedPlans,
            0
          ),
        yearPlans:
          number(
            dashboard?.statistics?.yearPlans,
            0
          )
      }
    };

    state.lastSnapshot = snapshot;

    return snapshot;
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
        class="tic-button ${
          primary ? "is-primary" : ""
        } ${block ? "is-block" : ""}"
        data-action="${escapeHTML(action)}"
        ${attributes}
      >
        ${icon ? `<span>${escapeHTML(icon)}</span>` : ""}
        ${escapeHTML(label)}
      </button>
    `;
  };

  const renderHero = (snapshot) => {
    const ui = getUI();

    const actions = [
      {
        label: "استكشف الدول",
        action: "guide-show-discover",
        primary: true,
        icon: "🌍"
      },
      {
        label: "خطتي السنوية",
        action: "guide-open-year-planner",
        icon: "🗓️"
      }
    ];

    if (typeof ui?.hero === "function") {
      return ui.hero({
        badge: "Guide Intelligence Platform",
        title: "دليل السفر الذكي",
        subtitle:
          "اختر أي دولة في العالم واحصل على دليل متكامل واقتراحات مبنية على Travel DNA الخاص بك.",
        actions
      });
    }

    return `
      <section class="tic-hero">
        <span class="tic-chip">
          Guide Intelligence Platform
        </span>
        <h1>دليل السفر الذكي</h1>
        <p>
          اختر أي دولة في العالم واحصل على دليل متكامل
          واقتراحات مبنية على Travel DNA الخاص بك.
        </p>
        <div class="tic-action-row">
          ${actions
            .map((action) => renderButton(action))
            .join("")}
        </div>
      </section>
    `;
  };

  const renderStatistics = (snapshot) => {
    const ui = getUI();

    const stats = [
      {
        icon: "🌍",
        value: snapshot.statistics.totalCountries,
        label: "دولة",
        subtitle: "في الدليل العالمي"
      },
      {
        icon: "✓",
        value: snapshot.statistics.visitedCountries,
        label: "زرتها",
        subtitle: "من سجل رحلاتك"
      },
      {
        icon: "☆",
        value: snapshot.statistics.wishlistCountries,
        label: "قائمة الأمنيات",
        subtitle: "وجهات محفوظة"
      },
      {
        icon: "🗓️",
        value: snapshot.statistics.yearPlans,
        label: "خطط سنوية",
        subtitle: "محفوظة في حسابك"
      }
    ];

    if (
      typeof ui?.grid === "function" &&
      typeof ui?.stat === "function"
    ) {
      return ui.grid(
        stats
          .map((item) => ui.stat(item))
          .join(""),
        { columns: 4 }
      );
    }

    return `
      <div class="tic-stats-grid">
        ${stats
          .map(
            (item) => `
              <article class="tic-card">
                <div class="tic-stat-icon">
                  ${escapeHTML(item.icon)}
                </div>
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

  const renderCountryPicker = (snapshot) => {
    const options = snapshot.countries
      .map(
        (country) => `
          <option
            value="${escapeHTML(country.countryCode)}"
            ${
              state.selectedCountryCode ===
              country.countryCode
                ? "selected"
                : ""
            }
          >
            ${escapeHTML(
              `${country.flag ? `${country.flag} ` : ""}${country.nameAr}`
            )}
          </option>
        `
      )
      .join("");

    return `
      <div class="tic-toolbar tic-guide-picker">
        <label class="tic-field">
          <span class="tic-field-label">
            ابحث عن دولة
          </span>

          <input
            type="search"
            class="tic-input"
            data-guide-search
            value="${escapeHTML(state.search)}"
            placeholder="اكتب اسم الدولة بالعربي أو الإنجليزي..."
            aria-label="البحث عن دولة"
            autocomplete="off"
          >
        </label>

        <label class="tic-field">
          <span class="tic-field-label">
            اختر الدولة
          </span>

          <select
            class="tic-input"
            data-guide-country-select
            aria-label="اختيار الدولة"
          >
            <option value="">
              اختر دولة لعرض الدليل الكامل
            </option>
            ${options}
          </select>
        </label>

        <div class="tic-action-row">
          ${renderButton({
            label: "مسح البحث",
            action: "guide-clear-search",
            block: true
          })}
        </div>
      </div>
    `;
  };

  const renderRecommendationCard = (
    item,
    snapshot
  ) => {
    const code = item.countryCode;
    const isWishlisted =
      snapshot.wishlistCodes.has(code);

    const reasons = array(
      item.reasons ||
      item.explanations
    )
      .slice(0, 2)
      .map(
        (reason) =>
          `<li>${escapeHTML(reason)}</li>`
      )
      .join("");

    return `
      <article class="tic-card tic-destination-card">
        <div class="tic-card-body">
          <div class="tic-feature-row">
            <div>
              <span class="tic-chip">
                ${escapeHTML(
                  item.flag || "🌍"
                )}
                ${escapeHTML(
                  item.countryNameAr ||
                  item.nameAr ||
                  code
                )}
              </span>

              <h3 class="tic-card-title">
                تطابق
                ${escapeHTML(
                  Math.round(number(item.score, 0))
                )}%
              </h3>
            </div>

            <button
              type="button"
              class="tic-icon-button"
              data-action="guide-toggle-country-wishlist"
              data-param-country-code="${escapeHTML(code)}"
              aria-label="${
                isWishlisted
                  ? "إزالة من قائمة الأمنيات"
                  : "إضافة إلى قائمة الأمنيات"
              }"
            >
              ${isWishlisted ? "★" : "☆"}
            </button>
          </div>

          ${
            reasons
              ? `<ul class="tic-list">${reasons}</ul>`
              : `
                <p class="tic-subtitle">
                  وجهة مقترحة بناءً على أسلوب سفرك.
                </p>
              `
          }

          <div class="tic-action-row">
            ${renderButton({
              label: "عرض الدليل",
              action: "guide-open-country",
              params: {
                countryCode: code
              },
              primary: true,
              block: true
            })}
          </div>
        </div>
      </article>
    `;
  };

  const renderRecommendations = (snapshot) => {
    const ui = getUI();

    if (!snapshot.recommendations.length) {
      return `
        <div class="tic-empty">
          <span>🧭</span>
          <h3>لا توجد اقتراحات حالياً</h3>
          <p>
            أضف رحلات أو وجهات إلى قائمة الأمنيات
            ليصبح Travel DNA أدق.
          </p>
        </div>
      `;
    }

    const content = `
      <div class="tic-destination-grid">
        ${snapshot.recommendations
          .map((item) =>
            renderRecommendationCard(
              item,
              snapshot
            )
          )
          .join("")}
      </div>
    `;

    if (typeof ui?.section === "function") {
      return ui.section({
        eyebrow: "TRAVEL DNA",
        title: "اقتراحات تناسبك",
        subtitle:
          "دول جديدة مقترحة بناءً على رحلاتك السابقة وميزانيتك وأسلوب سفرك.",
        content
      });
    }

    return `
      <section class="tic-section">
        <h2>اقتراحات تناسبك</h2>
        <p>
          دول جديدة مقترحة بناءً على رحلاتك السابقة
          وميزانيتك وأسلوب سفرك.
        </p>
        ${content}
      </section>
    `;
  };

  const renderRecentCountries = (snapshot) => {
    if (!snapshot.recentCountries.length) {
      return "";
    }

    return `
      <section class="tic-section">
        <div class="tic-section-head">
          <div>
            <span class="tic-eyebrow">
              RECENT
            </span>
            <h2>آخر الدول التي فتحتها</h2>
          </div>
        </div>

        <div class="tic-filter-row">
          ${snapshot.recentCountries
            .map(
              (country) => `
                <button
                  type="button"
                  class="tic-filter-chip"
                  data-action="guide-open-country"
                  data-param-country-code="${escapeHTML(
                    country.countryCode
                  )}"
                >
                  ${escapeHTML(
                    country.flag || "🌍"
                  )}
                  ${escapeHTML(
                    country.nameAr
                  )}
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  };

  const renderTravelDNA = (snapshot) => {
    const dna = snapshot.travelDNA;

    if (!dna) return "";

    const scores =
      dna.scores ||
      dna.profile?.scores ||
      {};

    const items = [
      ["العائلة", scores.family],
      ["الطبيعة", scores.nature],
      ["البحر", scores.beach],
      ["الفخامة", scores.luxury],
      ["التسوق", scores.shopping],
      ["الثقافة", scores.culture]
    ].filter(([, value]) =>
      Number.isFinite(Number(value))
    );

    if (!items.length) return "";

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <span class="tic-chip">
            Travel DNA
          </span>

          <h3 class="tic-card-title">
            بصمتك السياحية
          </h3>

          <div class="tic-settings-list">
            ${items
              .map(
                ([label, value]) => `
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>
                          ${escapeHTML(label)}
                        </strong>
                        <small>
                          ${escapeHTML(
                            Math.round(number(value))
                          )}%
                        </small>
                      </div>
                    </div>

                    <div
                      class="tic-progress"
                      aria-label="${escapeHTML(label)}"
                    >
                      <div
                        class="tic-progress-bar"
                        style="width:${Math.min(
                          100,
                          Math.max(
                            0,
                            number(value)
                          )
                        )}%"
                      ></div>
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

  const renderDiscoverView = (snapshot) => {
    const ui = getUI();

    const pickerSection =
      typeof ui?.section === "function"
        ? ui.section({
            eyebrow: "WORLD GUIDE",
            title: "اختر الدولة",
            subtitle:
              "ابحث بالاسم أو اختر الدولة مباشرة من القائمة المرتبة.",
            content: renderCountryPicker(snapshot)
          })
        : `
          <section class="tic-section">
            <h2>اختر الدولة</h2>
            <p>
              ابحث بالاسم أو اختر الدولة مباشرة
              من القائمة المرتبة.
            </p>
            ${renderCountryPicker(snapshot)}
          </section>
        `;

    return `
      ${renderHero(snapshot)}

      ${
        typeof ui?.section === "function"
          ? ui.section({
              eyebrow: "OVERVIEW",
              title: "العالم بين يديك",
              subtitle:
                "دليل عالمي متكامل ومخصص حسب رحلاتك.",
              content: renderStatistics(snapshot)
            })
          : renderStatistics(snapshot)
      }

      ${pickerSection}

      ${renderRecentCountries(snapshot)}

      ${renderRecommendations(snapshot)}

      ${
        typeof ui?.section === "function"
          ? ui.section({
              eyebrow: "YOUR PROFILE",
              title: "كيف يفهمك النظام؟",
              subtitle:
                "تحليل مختصر لتفضيلاتك السياحية.",
              content: renderTravelDNA(snapshot)
            })
          : renderTravelDNA(snapshot)
      }
    `;
  };

  const renderEntityList = (
    title,
    items,
    emptyMessage = ""
  ) => {
    const normalized = array(items);

    if (!normalized.length) {
      return emptyMessage
        ? `
          <section class="tic-card">
            <div class="tic-card-body">
              <h3>${escapeHTML(title)}</h3>
              <p class="tic-subtitle">
                ${escapeHTML(emptyMessage)}
              </p>
            </div>
          </section>
        `
        : "";
    }

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <h3 class="tic-card-title">
            ${escapeHTML(title)}
          </h3>

          <div class="tic-settings-list">
            ${normalized
              .map((item) => {
                const normalizedItem =
                  typeof item === "string"
                    ? {
                        nameAr: item,
                        description: ""
                      }
                    : item;

                return `
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>
                          ${escapeHTML(
                            normalizedItem.nameAr ||
                            normalizedItem.title ||
                            normalizedItem.name ||
                            "معلومة"
                          )}
                        </strong>

                        ${
                          normalizedItem.description
                            ? `
                              <small>
                                ${escapeHTML(
                                  normalizedItem.description
                                )}
                              </small>
                            `
                            : ""
                        }

                        ${
                          normalizedItem.city
                            ? `
                              <small>
                                ${escapeHTML(
                                  normalizedItem.city
                                )}
                              </small>
                            `
                            : ""
                        }
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

  const renderTextList = (title, items) => {
    const normalized = array(items);

    if (!normalized.length) return "";

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <h3 class="tic-card-title">
            ${escapeHTML(title)}
          </h3>

          <ul class="tic-list">
            ${normalized
              .map(
                (item) => `
                  <li>
                    ${escapeHTML(
                      typeof item === "string"
                        ? item
                        : item.text ||
                          item.title ||
                          item.name ||
                          item.description
                    )}
                  </li>
                `
              )
              .join("")}
          </ul>
        </div>
      </section>
    `;
  };

  const renderInfoCard = (
    title,
    rows
  ) => {
    const normalized = array(rows).filter(
      (row) =>
        row &&
        text(row.value) !== ""
    );

    if (!normalized.length) return "";

    return `
      <section class="tic-card">
        <div class="tic-card-body">
          <h3 class="tic-card-title">
            ${escapeHTML(title)}
          </h3>

          <div class="tic-settings-list">
            ${normalized
              .map(
                (row) => `
                  <div class="tic-settings-item">
                    <div class="tic-settings-item-main">
                      <div class="tic-settings-copy">
                        <strong>
                          ${escapeHTML(row.label)}
                        </strong>
                        <small>
                          ${escapeHTML(row.value)}
                        </small>
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

  const renderMonthList = (
    title,
    months
  ) => {
    const normalized = array(months)
      .map((month) =>
        MONTHS_AR[number(month)] ||
        text(month)
      )
      .filter(Boolean);

    return renderTextList(
      title,
      normalized
    );
  };

  const renderCountryHeader = (
    guide,
    snapshot
  ) => {
    const isWishlisted =
      snapshot.wishlistCodes.has(
        guide.countryCode
      );

    const personalization =
      guide.personalization || {};

    return `
      <section class="tic-hero">
        <div class="tic-feature-row">
          <div>
            <span class="tic-chip">
              ${escapeHTML(
                guide.sections?.overview?.flag ||
                "🌍"
              )}
              ${escapeHTML(
                guide.titleEn ||
                guide.countryCode
              )}
            </span>

            <h1>
              ${escapeHTML(
                guide.titleAr ||
                guide.countryCode
              )}
            </h1>

            <p>
              ${escapeHTML(
                guide.sections?.overview?.summary ||
                "دليل سياحي شامل لهذه الوجهة."
              )}
            </p>
          </div>

          <button
            type="button"
            class="tic-icon-button"
            data-action="guide-toggle-country-wishlist"
            data-param-country-code="${escapeHTML(
              guide.countryCode
            )}"
            aria-label="${
              isWishlisted
                ? "إزالة من قائمة الأمنيات"
                : "إضافة إلى قائمة الأمنيات"
            }"
          >
            ${isWishlisted ? "★" : "☆"}
          </button>
        </div>

        ${
          number(personalization.score) > 0
            ? `
              <div class="tic-card">
                <div class="tic-card-body">
                  <strong>
                    نسبة التطابق مع Travel DNA:
                    ${escapeHTML(
                      Math.round(
                        number(
                          personalization.score
                        )
                      )
                    )}%
                  </strong>

                  ${
                    array(
                      personalization.reasons
                    ).length
                      ? `
                        <ul class="tic-list">
                          ${array(
                            personalization.reasons
                          )
                            .slice(0, 3)
                            .map(
                              (reason) => `
                                <li>
                                  ${escapeHTML(reason)}
                                </li>
                              `
                            )
                            .join("")}
                        </ul>
                      `
                      : ""
                  }
                </div>
              </div>
            `
            : ""
        }

        <div class="tic-action-row">
          ${renderButton({
            label: "رجوع للاستكشاف",
            action: "guide-show-discover"
          })}

          ${renderButton({
            label: "خطة رحلة ذكية",
            action: "guide-create-ai-plan",
            params: {
              countryCode:
                guide.countryCode
            },
            primary: true
          })}

          ${renderButton({
            label: "إضافة للخطة السنوية",
            action: "guide-open-year-planner",
            params: {
              countryCode:
                guide.countryCode
            }
          })}
        </div>
      </section>
    `;
  };

  const renderCountrySections = (
    guide
  ) => {
    const sections =
      guide.sections || {};

    return `
      <div class="tic-destination-grid">
        ${renderEntityList(
          "أفضل المدن",
          sections.cities
        )}

        ${renderEntityList(
          "أفضل الفنادق",
          sections.hotels
        )}

        ${renderEntityList(
          "فنادق توفر شطاف",
          sections.shattafHotels,
          "لا توجد بيانات مؤكدة حالياً. تحقق مباشرة مع الفندق قبل الحجز."
        )}

        ${renderEntityList(
          "أفضل المنتجعات",
          sections.resorts
        )}

        ${renderEntityList(
          "الشواطئ",
          sections.beaches
        )}

        ${renderEntityList(
          "الأماكن السياحية",
          sections.attractions
        )}

        ${renderEntityList(
          "الأنشطة",
          sections.activities
        )}

        ${renderEntityList(
          "المطاعم الحلال",
          sections.halalRestaurants,
          "تحقق من شهادة الحلال أو اسأل المطعم قبل الطلب."
        )}

        ${renderEntityList(
          "المقاهي",
          sections.cafes
        )}

        ${renderInfoCard(
          "المواصلات",
          [
            {
              label: "نظرة عامة",
              value:
                sections.transportation?.overview
            },
            {
              label: "البطاقات",
              value: array(
                sections.transportation?.cards
              ).join("، ")
            },
            {
              label: "التطبيقات",
              value: array(
                sections.transportation?.apps
              ).join("، ")
            }
          ]
        )}

        ${renderEntityList(
          "وسائل المواصلات",
          sections.transportation?.methods
        )}

        ${renderInfoCard(
          "استئجار السيارات",
          [
            {
              label: "متوفر",
              value:
                sections.carRental?.available ===
                false
                  ? "غير موصى به أو غير متاح"
                  : "متاح"
            },
            {
              label: "المتطلبات",
              value: array(
                sections.carRental?.requirements
              ).join("، ")
            }
          ]
        )}

        ${renderTextList(
          "نصائح القيادة",
          sections.carRental?.tips
        )}

        ${renderInfoCard(
          "التأشيرة",
          [
            {
              label: "الحالة",
              value:
                sections.visa?.required === true
                  ? "مطلوبة"
                  : sections.visa?.required === false
                    ? "غير مطلوبة"
                    : "تحقق من المصدر الرسمي"
            },
            {
              label: "النوع",
              value: sections.visa?.type
            },
            {
              label: "المدة",
              value: sections.visa?.duration
            }
          ]
        )}

        ${renderTextList(
          "خطوات التأشيرة",
          sections.visa?.process
        )}

        ${renderTextList(
          "ملاحظات التأشيرة",
          sections.visa?.notes
        )}

        ${renderInfoCard(
          "العملة",
          [
            {
              label: "الاسم",
              value: sections.currency?.name
            },
            {
              label: "الرمز",
              value: sections.currency?.code
            },
            {
              label: "العلامة",
              value: sections.currency?.symbol
            }
          ]
        )}

        ${renderTextList(
          "نصائح الدفع",
          sections.currency?.cashTips
        )}

        ${renderInfoCard(
          "اللغة",
          [
            {
              label: "اللغة الأساسية",
              value: sections.language?.primary
            },
            {
              label: "اللغات الشائعة",
              value: array(
                sections.language?.common
              ).join("، ")
            },
            {
              label: "مستوى الإنجليزية",
              value:
                sections.language?.englishLevel
            }
          ]
        )}

        ${renderInfoCard(
          "الكهرباء",
          [
            {
              label: "الجهد",
              value:
                sections.electricity?.voltage
            },
            {
              label: "التردد",
              value:
                sections.electricity?.frequency
            },
            {
              label: "نوع القابس",
              value: array(
                sections.electricity?.plugTypes
              ).join("، ")
            },
            {
              label: "المحول",
              value:
                sections.electricity?.adapterNeeded ===
                true
                  ? "مطلوب"
                  : sections.electricity?.adapterNeeded ===
                      false
                    ? "غير مطلوب غالباً"
                    : ""
            }
          ]
        )}

        ${renderInfoCard(
          "الإنترنت",
          [
            {
              label: "الجودة",
              value: sections.internet?.quality
            },
            {
              label: "eSIM",
              value:
                sections.internet?.esim === true
                  ? "متوفر"
                  : sections.internet?.esim === false
                    ? "غير متوفر"
                    : ""
            },
            {
              label: "الشركات",
              value: array(
                sections.internet?.providers
              ).join("، ")
            }
          ]
        )}

        ${renderTextList(
          "نصائح الإنترنت",
          sections.internet?.tips
        )}

        ${renderInfoCard(
          "الطقس",
          [
            {
              label: "الوصف",
              value: sections.weather?.overview
            },
            {
              label: "المناخ",
              value: sections.weather?.climate
            }
          ]
        )}

        ${renderMonthList(
          "أفضل أشهر الزيارة",
          sections.bestMonths
        )}

        ${renderMonthList(
          "أسوأ أشهر الزيارة",
          sections.worstMonths
        )}

        ${renderInfoCard(
          "الميزانية المقترحة",
          [
            {
              label: "العملة",
              value: sections.budget?.currency
            },
            {
              label: "اليومية",
              value:
                typeof sections.budget?.dailyBudget ===
                "object"
                  ? Object.entries(
                      sections.budget.dailyBudget
                    )
                      .map(
                        ([key, value]) =>
                          `${key}: ${value}`
                      )
                      .join("، ")
                  : sections.budget?.dailyBudget
            },
            {
              label: "ميزانية الرحلة",
              value:
                typeof sections.budget?.tripBudget ===
                "object"
                  ? Object.entries(
                      sections.budget.tripBudget
                    )
                      .map(
                        ([key, value]) =>
                          `${key}: ${value}`
                      )
                      .join("، ")
                  : sections.budget?.tripBudget
            }
          ]
        )}

        ${renderTextList(
          "نصائح الميزانية",
          sections.budget?.notes
        )}

        ${renderInfoCard(
          "مدة الرحلة المثالية",
          [
            {
              label: "الحد الأدنى",
              value:
                sections.idealDuration?.minimumDays
                  ? `${sections.idealDuration.minimumDays} أيام`
                  : ""
            },
            {
              label: "الموصى بها",
              value:
                sections.idealDuration?.recommendedDays
                  ? `${sections.idealDuration.recommendedDays} أيام`
                  : ""
            },
            {
              label: "الحد الأعلى",
              value:
                sections.idealDuration?.maximumDays
                  ? `${sections.idealDuration.maximumDays} أيام`
                  : ""
            }
          ]
        )}

        ${renderInfoCard(
          "أفضل توقيت لحجز الطيران",
          [
            {
              label: "قبل الرحلة",
              value:
                sections.flightBooking?.bestLeadDays
                  ? `${sections.flightBooking.bestLeadDays} يوماً تقريباً`
                  : ""
            },
            {
              label: "الفترة",
              value:
                sections.flightBooking?.bestWindow
            }
          ]
        )}

        ${renderTextList(
          "نصائح حجز الطيران",
          sections.flightBooking?.tips
        )}

        ${renderInfoCard(
          "أفضل توقيت لحجز الفندق",
          [
            {
              label: "قبل الرحلة",
              value:
                sections.hotelBooking?.bestLeadDays
                  ? `${sections.hotelBooking.bestLeadDays} يوماً تقريباً`
                  : ""
            },
            {
              label: "الفترة",
              value:
                sections.hotelBooking?.bestWindow
            }
          ]
        )}

        ${renderTextList(
          "نصائح حجز الفندق",
          sections.hotelBooking?.tips
        )}

        ${renderTextList(
          "أهم النصائح",
          sections.tips
        )}

        ${renderTextList(
          "التحذيرات",
          sections.warnings
        )}

        ${renderTextList(
          "قائمة التجهيز",
          sections.packing
        )}

        ${renderEntityList(
          "أماكن مناسبة للعوائل",
          sections.family
        )}

        ${renderEntityList(
          "أماكن مناسبة للأزواج",
          sections.couples
        )}

        ${renderEntityList(
          "أماكن مناسبة للأطفال",
          sections.children
        )}

        ${renderEntityList(
          "أماكن مناسبة لمحبي الطبيعة",
          sections.nature
        )}

        ${renderEntityList(
          "أماكن مناسبة لمحبي البحر",
          sections.sea
        )}

        ${renderEntityList(
          "أماكن مناسبة للتسوق",
          sections.shopping
        )}
      </div>
    `;
  };

  const renderCountryView = (
    snapshot
  ) => {
    const guide = snapshot.selectedGuide;
    const ui = getUI();

    if (!guide) {
      return `
        <div class="tic-empty">
          <span>⚠️</span>
          <h2>تعذر تحميل الدليل</h2>
          <p>
            تأكد من أن ملفات بيانات الدول ومحرك
            Guide Intelligence تم تحميلها قبل الصفحة.
          </p>
          ${renderButton({
            label: "العودة للاستكشاف",
            action: "guide-show-discover",
            primary: true
          })}
        </div>
      `;
    }

    const content = renderCountrySections(guide);

    return `
      ${renderCountryHeader(
        guide,
        snapshot
      )}

      ${
        typeof ui?.section === "function"
          ? ui.section({
              eyebrow: "COMPLETE GUIDE",
              title: "الدليل السياحي الكامل",
              subtitle:
                `اكتمال البيانات ${escapeHTML(
                  guide.completeness?.percent ||
                  0
                )}%`,
              content
            })
          : content
      }
    `;
  };

  const renderPage = (
    snapshot
  ) => `
    <div
      class="tic-module"
      data-page="guide"
      data-page-version="${PAGE_VERSION}"
      data-guide-view="${escapeHTML(
        state.activeView
      )}"
    >
      ${
        state.activeView === "country"
          ? renderCountryView(snapshot)
          : renderDiscoverView(snapshot)
      }
    </div>
  `;

  const applyListeners = () => {
    if (!state.container) return;

    const searchInput =
      state.container.querySelector(
        "[data-guide-search]"
      );

    searchInput?.addEventListener(
      "input",
      (event) => {
        state.search = event.target.value;

        refresh({
          preserveFocus: true
        });
      }
    );

    const countrySelect =
      state.container.querySelector(
        "[data-guide-country-select]"
      );

    countrySelect?.addEventListener(
      "change",
      (event) => {
        const countryCode =
          text(event.target.value).toUpperCase();

        if (countryCode) {
          openCountry(countryCode);
        }
      }
    );

    if (state.pendingFocusSelector) {
      const target =
        state.container.querySelector(
          state.pendingFocusSelector
        );

      target?.focus?.();
      state.pendingFocusSelector = null;
    }
  };

  const refresh = (
    options = {}
  ) => {
    if (
      !state.container ||
      !state.mounted
    ) {
      return false;
    }

    const activeElement =
      document.activeElement;

    const preserveSearch =
      options.preserveFocus === true &&
      activeElement?.matches?.(
        "[data-guide-search]"
      );

    const cursor =
      preserveSearch &&
      typeof activeElement.selectionStart ===
        "number"
        ? activeElement.selectionStart
        : null;

    const snapshot =
      buildSnapshot();

    state.container.innerHTML =
      renderPage(snapshot);

    applyListeners();

    if (preserveSearch) {
      const input =
        state.container.querySelector(
          "[data-guide-search]"
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
      countryCode:
        state.selectedCountryCode,
      resultCount:
        snapshot.countries.length
    });

    return true;
  };

  const openCountry = (
    countryCode
  ) => {
    const intelligence =
      getGuideIntelligence();

    const code =
      text(countryCode).toUpperCase();

    if (!code || !intelligence) {
      safeToast(
        "تعذر فتح الدولة حالياً.",
        "error"
      );

      return false;
    }

    try {
      const guide =
        intelligence.buildCountryGuide?.(
          code,
          {
            includeTravelDNA: true,
            language: "ar"
          }
        ) ||
        intelligence.getCountryGuide?.(
          code,
          {
            includeTravelDNA: true,
            language: "ar"
          }
        );

      if (!guide) {
        safeToast(
          "لا توجد بيانات كافية لهذه الدولة حالياً.",
          "info"
        );

        return false;
      }

      state.selectedCountryCode = code;
      state.selectedGuide = guide;
      state.activeView = "country";

      intelligence.saveRecentCountry?.(
        code
      );

      refresh();

      emit("country-opened", {
        countryCode: code
      });

      return true;
    } catch (error) {
      console.error(
        "TIC Guide open country error:",
        error
      );

      safeToast(
        "حدث خطأ أثناء تحميل الدليل.",
        "error"
      );

      return false;
    }
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !== "function"
    ) {
      return;
    }

    const register = (
      name,
      handler
    ) => {
      if (ui.hasAction?.(name)) return;

      const unsubscribe =
        ui.registerAction(
          name,
          handler
        );

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
      () => {
        state.activeView = "discover";
        state.selectedCountryCode = "";
        state.selectedGuide = null;
        refresh();
        return true;
      }
    );

    register(
      "guide-clear-search",
      () => {
        state.search = "";
        state.pendingFocusSelector =
          "[data-guide-search]";
        refresh();
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
      "guide-toggle-country-wishlist",
      ({ params }) => {
        const intelligence =
          getGuideIntelligence();

        const countryCode =
          text(
            params.countryCode
          ).toUpperCase();

        if (
          !countryCode ||
          !intelligence
        ) {
          return false;
        }

        const exists =
          intelligence.isInWishlist?.(
            countryCode
          );

        const result = exists
          ? intelligence.removeFromWishlist?.(
              countryCode
            )
          : intelligence.addToWishlist?.(
              countryCode
            );

        if (result === false) {
          return false;
        }

        safeToast(
          exists
            ? "تمت إزالة الدولة من قائمة الأمنيات."
            : "تمت إضافة الدولة إلى قائمة الأمنيات.",
          "success"
        );

        refresh();

        return true;
      }
    );

    register(
      "guide-create-ai-plan",
      async ({ params }) => {
        const intelligence =
          getGuideIntelligence();

        const countryCode =
          text(
            params.countryCode ||
            state.selectedCountryCode
          ).toUpperCase();

        if (
          !countryCode ||
          !intelligence
        ) {
          return false;
        }

        try {
          const guide =
            state.selectedGuide ||
            intelligence.buildCountryGuide?.(
              countryCode
            );

          const defaultDays =
            number(
              guide?.sections
                ?.idealDuration
                ?.recommendedDays,
              7
            );

          const result =
            intelligence.createAITripPlan?.({
              countryCode,
              days:
                Math.max(
                  1,
                  defaultDays
                ),
              travelers: 2,
              tripType: "family",
              requiresHalal: true,
              wantsNature: true,
              wantsBeach: true,
              persist: true
            });

          safeToast(
            "تم إنشاء خطة الرحلة الذكية وحفظها.",
            "success"
          );

          emit("ai-plan-created", {
            countryCode,
            planId: result?.id
          });

          return result || true;
        } catch (error) {
          console.error(
            "TIC Guide AI plan error:",
            error
          );

          safeToast(
            "تعذر إنشاء الخطة الذكية.",
            "error"
          );

          return false;
        }
      }
    );

    register(
      "guide-open-year-planner",
      async ({ params }) => {
        const intelligence =
          getGuideIntelligence();

        const countryCode =
          text(
            params.countryCode ||
            state.selectedCountryCode
          ).toUpperCase();

        try {
          const lockedSlots =
            countryCode
              ? [
                  {
                    countryCode,
                    month:
                      new Date().getMonth() +
                      2,
                    days: 7,
                    tripType: "family"
                  }
                ]
              : [];

          const plan =
            intelligence?.createYearPlan?.({
              year:
                new Date().getFullYear(),
              tripsCount: 3,
              lockedSlots,
              persist: true
            }) ||
            getYearPlanner()?.generate?.({
              year:
                new Date().getFullYear(),
              tripsCount: 3,
              lockedSlots,
              persist: true
            });

          safeToast(
            "تم إنشاء خطة السفر السنوية وحفظها.",
            "success"
          );

          emit("year-plan-created", {
            planId: plan?.id,
            year: plan?.year
          });

          return plan || true;
        } catch (error) {
          console.error(
            "TIC Guide year planner error:",
            error
          );

          safeToast(
            "تعذر إنشاء الخطة السنوية.",
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
      typeof store.subscribe !==
        "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    state.unsubscribeStore =
      store.subscribe(() => {
        if (state.mounted) {
          state.selectedGuide = null;
          refresh();
        }
      });
  };

  const GuidePage = {
    id: PAGE_ID,
    title: "دليل السفر",
    icon: "⌕",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

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

      const routeCountryCode =
        getRouteCountryCode(context);

      if (routeCountryCode) {
        state.selectedCountryCode =
          routeCountryCode;
        state.activeView = "country";
        state.selectedGuide = null;
      }

      return renderPage(
        buildSnapshot()
      );
    },

    mount(context = {}) {
      this.init();

      const container =
        resolveContainer(
          context.container
        );

      if (!container) {
        throw new Error(
          "TIC Guide Error: route container not found."
        );
      }

      const routeCountryCode =
        getRouteCountryCode(context);

      if (routeCountryCode) {
        state.selectedCountryCode =
          routeCountryCode;
        state.activeView = "country";
        state.selectedGuide = null;
      }

      state.container = container;
      state.mounted = true;

      const snapshot =
        buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      applyListeners();

      emit("mounted", {
        countryCount:
          snapshot.countries.length,
        selectedCountryCode:
          state.selectedCountryCode
      });

      return container;
    },

    afterEnter(context = {}) {
      const container =
        resolveContainer(
          context.container
        );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      const routeCountryCode =
        getRouteCountryCode(context);

      if (
        routeCountryCode &&
        routeCountryCode !==
          state.selectedCountryCode
      ) {
        state.selectedCountryCode =
          routeCountryCode;
        state.activeView = "country";
        state.selectedGuide = null;
        refresh();
      } else {
        applyListeners();
      }

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
      if (
        typeof listener !==
        "function"
      ) {
        throw new TypeError(
          "TIC Guide subscriber must be a function."
        );
      }

      state.subscribers.add(
        listener
      );

      return () =>
        state.subscribers.delete(
          listener
        );
    },

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
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
          } catch (error) {
            console.error(
              "TIC Guide unsubscribe error:",
              error
            );
          }
        }
      );

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.lastDashboard = null;
      state.lastSearchResult = null;
      state.selectedGuide = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      const intelligence =
        getGuideIntelligence();

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized:
          state.initialized,
        mounted:
          state.mounted,
        activeView:
          state.activeView,
        search:
          state.search,
        selectedCountryCode:
          state.selectedCountryCode,
        hasContainer:
          Boolean(state.container),
        storeAvailable:
          Boolean(getStore()),
        routerAvailable:
          Boolean(getRouter()),
        uiAvailable:
          Boolean(getUI()),
        guideIntelligenceAvailable:
          Boolean(intelligence),
        guideIntelligenceDiagnostics:
          intelligence?.diagnostics?.() ||
          null,
        actionCount:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot:
          Boolean(state.lastSnapshot)
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages =
    window.TIC.Pages || {};

  window.TIC.Pages.guide =
    GuidePage;

  window.TICGuidePage =
    GuidePage;

  const router = getRouter();

  if (
    router &&
    typeof router.register ===
      "function"
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

    if (
      typeof router.registerPage ===
      "function"
    ) {
      router.registerPage(
        "guide",
        GuidePage
      );
    }
  }

  GuidePage.init();
})(window, document);
