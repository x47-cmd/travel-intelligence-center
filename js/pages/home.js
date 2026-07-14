/* =========================================================
   Travel Intelligence Center
   Home Page Module V2.1.0

   File Path:
   js/pages/home.js

   Purpose:
   - Calm, premium and compact iPhone-first home page.
   - Keeps the home page focused on positive travel inspiration.
   - Preserves Store, Router, Trip Form and cross-page integration.
   - Shows only:
     1. Compact welcome card.
     2. Compact next-trip card.
     3. Compact travel snapshot.
     4. One positive travel inspiration card.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/features/trip-form.js

   Global APIs:
   - window.TIC.Pages.home
   - window.TICHomePage
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const PAGE_ID = "home";
  const PAGE_VERSION = "2.1.0";

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null
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
        // Continue to fallback.
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
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const list = (value) =>
    Array.isArray(value) ? value : [];

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
        console.error("TIC Home subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

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

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    if (typeof store.get === "function") {
      return {
        profile: store.get("profile"),
        statistics: store.get("statistics"),
        trips: store.get("trips"),
        destinations: store.get("destinations"),
        wishlist: store.get("wishlist"),
        budgets: store.get("budgets"),
        savings: store.get("savings"),
        documents: store.get("documents"),
        packing: store.get("packing"),
        memories: store.get("memories"),
        notifications: store.get("notifications")
      };
    }

    return {};
  };

  const toDate = (value) => {
    if (!value) return null;

    const result =
      value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(result.getTime())
      ? null
      : result;
  };

  const startOfDay = (value) => {
    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const daysUntil = (value) => {
    const date = toDate(value);
    if (!date) return null;

    return Math.ceil(
      (
        startOfDay(date).getTime() -
        startOfDay(new Date()).getTime()
      ) / 86400000
    );
  };

  const durationDays = (startDate, endDate) => {
    const start = toDate(startDate);
    const end = toDate(endDate);

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

  const tripsFrom = (snapshot) =>
    list(snapshot.trips);

  const upcomingTripsFrom = (snapshot) => {
    const today = startOfDay(new Date());

    return tripsFrom(snapshot)
      .filter((trip) => {
        const startDate = toDate(trip.startDate);
        const status = text(trip.status).toLowerCase();

        return (
          startDate &&
          startOfDay(startDate) >= today &&
          !["completed", "cancelled"].includes(status)
        );
      })
      .sort(
        (a, b) =>
          toDate(a.startDate) - toDate(b.startDate)
      );
  };

  const completedTripsFrom = (snapshot) =>
    tripsFrom(snapshot).filter((trip) => {
      const status = text(trip.status).toLowerCase();
      const endDate = toDate(trip.endDate);

      return (
        status === "completed" ||
        (
          endDate &&
          endDate < startOfDay(new Date())
        )
      );
    });

  const countriesCountFrom = (snapshot) => {
    const countries = new Set();

    tripsFrom(snapshot).forEach((trip) => {
      const country =
        text(trip.country) ||
        text(trip.destination)
          .split(",")
          .pop()
          ?.trim();

      if (country) {
        countries.add(country.toLowerCase());
      }
    });

    list(snapshot.destinations).forEach((destination) => {
      const country = text(destination.country);

      if (country) {
        countries.add(country.toLowerCase());
      }
    });

    return countries.size;
  };

  const buildSnapshot = () => {
    const raw = getStoreState();

    const profile = isObject(raw.profile)
      ? raw.profile
      : {};

    const trips = tripsFrom(raw);
    const upcomingTrips = upcomingTripsFrom(raw);
    const completedTrips = completedTripsFrom(raw);
    const nextTrip = upcomingTrips[0] || null;

    return {
      raw,
      profile,
      trips,
      upcomingTrips,
      completedTrips,
      nextTrip,
      statistics: {
        totalTrips: trips.length,
        upcomingTrips: upcomingTrips.length,
        completedTrips: completedTrips.length,
        countries: countriesCountFrom(raw),
        wishlist: list(raw.wishlist).length,
        memories: list(raw.memories).length
      }
    };
  };

  const formatCountdown = (trip) => {
    if (!trip) return "";

    const remainingDays = daysUntil(trip.startDate);

    if (remainingDays === null) {
      return "موعد الرحلة غير محدد";
    }

    if (remainingDays === 0) {
      return "موعد السفر اليوم";
    }

    if (remainingDays === 1) {
      return "متبقي يوم واحد";
    }

    if (remainingDays > 1) {
      return `متبقي ${remainingDays} يوم`;
    }

    return "بدأت الرحلة";
  };

  const getTripDestination = (trip) =>
    text(trip?.destination) ||
    [trip?.city, trip?.country]
      .filter(Boolean)
      .join("، ") ||
    text(trip?.title) ||
    "رحلة قادمة";

  const renderWelcome = (snapshot) => {
    const name =
      snapshot.profile.name ||
      Config.profile?.name ||
      "يوسف";

    return `
      <section class="tic-home-welcome" aria-labelledby="tic-home-welcome-title">
        <div class="tic-home-welcome-copy">
          <span class="tic-home-welcome-label">
            TRAVEL INTELLIGENCE CENTER
          </span>

          <h1 id="tic-home-welcome-title">
            هلا ${escapeHTML(name)}
          </h1>

          <p>
            خلّ رحلتك القادمة أجمل وأسهل.
          </p>
        </div>

        <div class="tic-home-welcome-icon" aria-hidden="true">
          ✈
        </div>
      </section>
    `;
  };

  const renderNextTrip = (snapshot) => {
    const ui = getUI();
    const trip = snapshot.nextTrip;

    if (!trip) {
      return `
        <article class="tic-home-next-card tic-home-next-card-empty">
          <div class="tic-home-next-top">
            <div>
              <span class="tic-home-kicker">
                خطوتك القادمة
              </span>

              <h3>
                وين بتكون سفرتك الياية؟
              </h3>
            </div>

            <div class="tic-home-next-icon" aria-hidden="true">
              ✈
            </div>
          </div>

          <p class="tic-home-next-message">
            أنشئ رحلة جديدة وخلك جاهز لأجمل تجربة.
          </p>

          <div class="tic-home-next-actions">
            ${ui.button({
              label: "إنشاء رحلة",
              action: "home-new-trip",
              primary: true
            })}
          </div>
        </article>
      `;
    }

    const duration = number(
      trip.durationDays,
      durationDays(
        trip.startDate,
        trip.endDate
      )
    );

    return `
      <article class="tic-home-next-card">
        <div class="tic-home-next-top">
          <div>
            <span class="tic-home-kicker">
              ${escapeHTML(formatCountdown(trip))}
            </span>

            <h3>
              ${escapeHTML(
                trip.title ||
                getTripDestination(trip)
              )}
            </h3>

            <p>
              ${escapeHTML(getTripDestination(trip))}
            </p>
          </div>

          <div class="tic-home-next-icon" aria-hidden="true">
            ✈
          </div>
        </div>

        <div class="tic-home-trip-meta">
          <div>
            <span>التاريخ</span>
            <strong>
              ${escapeHTML(ui.date(trip.startDate))}
            </strong>
          </div>

          <div>
            <span>المدة</span>
            <strong>
              ${duration > 0 ? `${duration} يوم` : "غير محددة"}
            </strong>
          </div>

          <div>
            <span>الميزانية</span>
            <strong>
              ${escapeHTML(ui.currency(trip.budget))}
            </strong>
          </div>
        </div>

        <div class="tic-home-next-actions">
          ${ui.button({
            label: "عرض الرحلة",
            route: "trips",
            view: "details",
            params: {
              tripId: trip.id
            },
            primary: true
          })}

          ${ui.button({
            label: "تعديل",
            action: "home-edit-next-trip"
          })}
        </div>
      </article>
    `;
  };

  const renderStatistics = (snapshot) => {
    const stats = [
      {
        icon: "✈",
        value: snapshot.statistics.totalTrips,
        label: "الرحلات"
      },
      {
        icon: "◎",
        value: snapshot.statistics.countries,
        label: "الدول"
      },
      {
        icon: "☆",
        value: snapshot.statistics.wishlist,
        label: "الأمنيات"
      },
      {
        icon: "◈",
        value: snapshot.statistics.memories,
        label: "الذكريات"
      }
    ];

    return `
      <div class="tic-home-stats">
        ${stats
          .map(
            (item) => `
              <article class="tic-home-stat">
                <span class="tic-home-stat-icon" aria-hidden="true">
                  ${item.icon}
                </span>

                <strong>
                  ${number(item.value)}
                </strong>

                <small>
                  ${escapeHTML(item.label)}
                </small>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderInspiration = (snapshot) => {
    const trip = snapshot.nextTrip;
    const remainingDays = trip
      ? daysUntil(trip.startDate)
      : null;

    let title = "رحلتك تبدأ بفكرة جميلة";
    let message =
      "اختر وجهة تحبها، وخطط لها على راحتك، وخلك مستمتع من أول خطوة.";

    if (trip && remainingDays !== null) {
      if (remainingDays <= 7 && remainingDays >= 0) {
        title = "قرب موعد المغامرة";
        message =
          "خفف جدولك، رتب أغراضك بهدوء، واستمتع بحماس الأيام الأخيرة قبل السفر.";
      } else if (remainingDays <= 30 && remainingDays > 7) {
        title = "كل يوم يقربك من رحلتك";
        message =
          "استمتع بالتخطيط وخلك مرن؛ أجمل الرحلات تبدأ قبل الوصول.";
      } else if (remainingDays > 30) {
        title = "عندك وقت تخلي الرحلة أجمل";
        message =
          "اكتشف تفاصيل أكثر عن وجهتك واختَر التجارب اللي تناسبك.";
      }
    }

    return `
      <article class="tic-home-inspiration">
        <div class="tic-home-inspiration-icon" aria-hidden="true">
          ✦
        </div>

        <div class="tic-home-inspiration-copy">
          <span>
            إلهام السفر
          </span>

          <h3>
            ${escapeHTML(title)}
          </h3>

          <p>
            ${escapeHTML(message)}
          </p>
        </div>
      </article>
    `;
  };

  const renderSectionHeader = ({
    eyebrow,
    title,
    subtitle = ""
  }) => `
    <header class="tic-home-section-header">
      <span>
        ${escapeHTML(eyebrow)}
      </span>

      <h2>
        ${escapeHTML(title)}
      </h2>

      ${
        subtitle
          ? `<p>${escapeHTML(subtitle)}</p>`
          : ""
      }
    </header>
  `;

  const renderPage = (snapshot) => `
    <div
      class="tic-module tic-home-page"
      data-page="home"
      data-page-version="${PAGE_VERSION}"
    >
      ${renderWelcome(snapshot)}

      <section class="tic-home-section tic-home-next-section">
        ${renderSectionHeader({
          eyebrow: "NEXT JOURNEY",
          title: "الرحلة القادمة",
          subtitle: "تفاصيل سفرتك الأقرب بشكل بسيط."
        })}

        ${renderNextTrip(snapshot)}
      </section>

      <section class="tic-home-section tic-home-snapshot-section">
        ${renderSectionHeader({
          eyebrow: "YOUR TRAVEL",
          title: "سفراتك",
          subtitle: "أرقام خفيفة من سجل سفرك."
        })}

        ${renderStatistics(snapshot)}
      </section>

      <section class="tic-home-section tic-home-inspiration-section">
        ${renderInspiration(snapshot)}
      </section>
    </div>
  `;

  const refresh = () => {
    if (!state.container || !state.mounted) {
      return false;
    }

    const snapshot = buildSnapshot();
    state.lastSnapshot = snapshot;

    state.container.innerHTML =
      renderPage(snapshot);

    emit("refreshed", {
      statistics: snapshot.statistics,
      nextTripId:
        snapshot.nextTrip?.id || null
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

      state.actionUnsubscribers.push(
        ui.registerAction(name, handler)
      );
    };

    register("home-new-trip", () => {
      const tripForm = getTripForm();

      if (
        tripForm &&
        typeof tripForm.openCreate === "function"
      ) {
        return tripForm.openCreate();
      }

      return getRouter()?.go?.("trip-form", {
        params: {
          mode: "create"
        },
        source: "home-new-trip"
      });
    });

    register("home-edit-next-trip", () => {
      const tripId =
        state.lastSnapshot?.nextTrip?.id;

      if (!tripId) {
        getUI()?.toast?.(
          "لا توجد رحلة قادمة للتعديل.",
          "warning"
        );

        return false;
      }

      const tripForm = getTripForm();

      if (
        tripForm &&
        typeof tripForm.openEdit === "function"
      ) {
        return tripForm.openEdit(tripId);
      }

      return getRouter()?.go?.("trip-form", {
        params: {
          mode: "edit",
          tripId
        },
        source: "home-edit-next-trip"
      });
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
      if (state.mounted) {
        refresh();
      }
    });
  };

  const HomePage = {
    id: PAGE_ID,
    title: "الرئيسية",
    icon: "⌂",
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

    render() {
      this.init();

      const snapshot = buildSnapshot();
      state.lastSnapshot = snapshot;

      return renderPage(snapshot);
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Home Page Error: route container was not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();
      state.lastSnapshot = snapshot;

      container.innerHTML =
        renderPage(snapshot);

      emit("mounted", {
        nextTripId:
          snapshot.nextTrip?.id || null,
        statistics: snapshot.statistics
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

      refresh();

      return true;
    },

    unmount() {
      state.mounted = false;
      state.container = null;

      emit("unmounted");

      return true;
    },

    refresh,

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Home subscriber must be a function."
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
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        }
      );

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
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
  window.TIC.Pages.home = HomePage;
  window.TICHomePage = HomePage;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("home")) {
      router.register("home", {
        id: "home",
        title: "الرئيسية",
        module: "home",
        icon: "⌂",
        visible: true,
        order: 1
      });
    }

    if (
      typeof router.registerPage === "function"
    ) {
      router.registerPage(
        "home",
        HomePage
      );
    }
  }

  HomePage.init();
})(window, document);
