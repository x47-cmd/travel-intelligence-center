/* =========================================================
   Travel Intelligence Center
   Home Page Module V1.0.0

   File Path:
   js/pages/home.js

   Purpose:
   - Renders the main executive travel dashboard.
   - Displays welcome summary, next trip, travel statistics,
     budget status, readiness, alerts, recommendations,
     and quick actions.
   - Reads live data from the central TIC Store.
   - Uses shared TIC UI components and TIC Router actions.
   - Registers itself as the "home" page module.

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
  const PAGE_VERSION = "1.0.0";

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    unsubscribeStore: null,
    unsubscribeRouter: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null
  };

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) {
      return undefined;
    }

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

  const normalizeText = (value) =>
    String(value ?? "").trim();

  const normalizeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

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
        console.error(
          "TIC Home Page subscriber error:",
          error
        );
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

    if (!store) {
      return {};
    }

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
        reviews: store.get("reviews"),
        memories: store.get("memories"),
        analytics: store.get("analytics"),
        notifications: store.get("notifications"),
        settings: store.get("settings")
      };
    }

    return {};
  };

  const toDate = (value) => {
    if (!value) {
      return null;
    }

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  };

  const startOfDay = (date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const calculateDaysUntil = (value) => {
    const date = toDate(value);

    if (!date) {
      return null;
    }

    const today = startOfDay(new Date());
    const target = startOfDay(date);

    return Math.ceil(
      (target.getTime() - today.getTime()) /
        86400000
    );
  };

  const calculateDuration = (
    startDate,
    endDate
  ) => {
    const start = toDate(startDate);
    const end = toDate(endDate);

    if (!start || !end || end < start) {
      return 0;
    }

    return (
      Math.floor(
        (startOfDay(end).getTime() -
          startOfDay(start).getTime()) /
          86400000
      ) + 1
    );
  };

  const getTrips = (snapshot) =>
    Array.isArray(snapshot.trips)
      ? snapshot.trips
      : [];

  const getUpcomingTrips = (snapshot) => {
    const today = startOfDay(new Date());

    return getTrips(snapshot)
      .filter((trip) => {
        const start = toDate(trip.startDate);

        if (!start) {
          return false;
        }

        const status =
          normalizeText(trip.status).toLowerCase();

        return (
          startOfDay(start) >= today &&
          !["completed", "cancelled"].includes(status)
        );
      })
      .sort(
        (a, b) =>
          toDate(a.startDate) -
          toDate(b.startDate)
      );
  };

  const getCompletedTrips = (snapshot) =>
    getTrips(snapshot).filter((trip) => {
      const status =
        normalizeText(trip.status).toLowerCase();

      const end = toDate(trip.endDate);

      return (
        status === "completed" ||
        (end && end < startOfDay(new Date()))
      );
    });

  const getNextTrip = (snapshot) =>
    getUpcomingTrips(snapshot)[0] || null;

  const getCountriesCount = (snapshot) => {
    const countries = new Set();

    getTrips(snapshot).forEach((trip) => {
      const country =
        normalizeText(trip.country) ||
        normalizeText(trip.destination)
          .split(",")
          .pop()
          ?.trim();

      if (country) {
        countries.add(country.toLowerCase());
      }
    });

    if (Array.isArray(snapshot.destinations)) {
      snapshot.destinations.forEach((destination) => {
        const country =
          normalizeText(destination.country);

        if (country) {
          countries.add(country.toLowerCase());
        }
      });
    }

    return countries.size;
  };

  const sum = (items, selector) =>
    items.reduce(
      (total, item) =>
        total +
        normalizeNumber(selector(item)),
      0
    );

  const getBudgetSummary = (snapshot) => {
    const trips = getTrips(snapshot);
    const totalBudget = sum(
      trips,
      (trip) => trip.budget
    );

    const totalSpent = sum(
      trips,
      (trip) => trip.spent
    );

    const available = Math.max(
      0,
      totalBudget - totalSpent
    );

    const usage =
      totalBudget > 0
        ? Math.min(
            100,
            Math.round(
              (totalSpent / totalBudget) * 100
            )
          )
        : 0;

    const profile =
      isObject(snapshot.profile)
        ? snapshot.profile
        : {};

    const annualTravelBudget =
      normalizeNumber(
        profile.annualTravelBudget,
        normalizeNumber(
          Config.profile?.annualTravelBudget,
          30000
        )
      );

    const monthlySaving =
      normalizeNumber(
        profile.monthlySaving,
        normalizeNumber(
          Config.profile?.monthlySaving,
          1500
        )
      );

    return {
      totalBudget,
      totalSpent,
      available,
      usage,
      annualTravelBudget,
      monthlySaving
    };
  };

  const normalizeCollection = (value) =>
    Array.isArray(value) ? value : [];

  const getPackingSummary = (snapshot, tripId) => {
    const packing = snapshot.packing;

    let items = [];

    if (Array.isArray(packing)) {
      items = packing.filter(
        (item) =>
          !tripId ||
          !item.tripId ||
          String(item.tripId) === String(tripId)
      );
    } else if (isObject(packing)) {
      if (Array.isArray(packing.items)) {
        items = packing.items.filter(
          (item) =>
            !tripId ||
            !item.tripId ||
            String(item.tripId) === String(tripId)
        );
      } else if (
        tripId &&
        Array.isArray(packing[tripId])
      ) {
        items = packing[tripId];
      }
    }

    const total = items.length;
    const completed = items.filter(
      (item) =>
        item.completed === true ||
        item.packed === true ||
        item.status === "completed"
    ).length;

    return {
      total,
      completed,
      percentage:
        total > 0
          ? Math.round((completed / total) * 100)
          : 0
    };
  };

  const getDocumentSummary = (snapshot, tripId) => {
    const documents = normalizeCollection(
      snapshot.documents
    ).filter(
      (documentItem) =>
        !tripId ||
        !documentItem.tripId ||
        String(documentItem.tripId) === String(tripId)
    );

    const total = documents.length;
    const valid = documents.filter(
      (documentItem) => {
        const status =
          normalizeText(
            documentItem.status
          ).toLowerCase();

        if (
          ["valid", "ready", "completed"].includes(
            status
          )
        ) {
          return true;
        }

        const expiryDate = toDate(
          documentItem.expiryDate
        );

        return (
          expiryDate &&
          expiryDate > new Date()
        );
      }
    ).length;

    const expiring = documents.filter(
      (documentItem) => {
        const expiryDate = toDate(
          documentItem.expiryDate
        );

        if (!expiryDate) {
          return false;
        }

        const days =
          calculateDaysUntil(expiryDate);

        return days !== null && days >= 0 && days <= 90;
      }
    ).length;

    return {
      total,
      valid,
      expiring,
      percentage:
        total > 0
          ? Math.round((valid / total) * 100)
          : 0
    };
  };

  const getNotificationSummary = (snapshot) => {
    const notifications = normalizeCollection(
      snapshot.notifications
    );

    const unread = notifications.filter(
      (notification) =>
        notification.read !== true &&
        notification.isRead !== true
    );

    const important = unread.filter(
      (notification) =>
        notification.priority === "high" ||
        notification.type === "warning" ||
        notification.type === "error"
    );

    return {
      total: notifications.length,
      unread: unread.length,
      important: important.length,
      items: unread.slice(0, 4)
    };
  };

  const calculateReadiness = (
    trip,
    packing,
    documents
  ) => {
    if (!trip) {
      return {
        score: 0,
        label: "لا توجد رحلة قادمة",
        tone: "neutral",
        items: []
      };
    }

    const items = [
      {
        label: "بيانات الرحلة",
        complete: Boolean(
          trip.title &&
          trip.destination &&
          trip.startDate &&
          trip.endDate
        )
      },
      {
        label: "الميزانية",
        complete:
          normalizeNumber(trip.budget) > 0
      },
      {
        label: "الحجز والإقامة",
        complete: Boolean(
          trip.accommodation ||
          trip.bookingReference ||
          trip.airline
        )
      },
      {
        label: "الوثائق",
        complete:
          documents.total === 0
            ? false
            : documents.percentage >= 80
      },
      {
        label: "قائمة التجهيز",
        complete:
          packing.total === 0
            ? false
            : packing.percentage >= 80
      }
    ];

    const completed = items.filter(
      (item) => item.complete
    ).length;

    const score = Math.round(
      (completed / items.length) * 100
    );

    let label = "تحتاج تجهيز";
    let tone = "warning";

    if (score >= 80) {
      label = "جاهزية ممتازة";
      tone = "success";
    } else if (score >= 50) {
      label = "جاهزية جيدة";
      tone = "info";
    }

    return {
      score,
      label,
      tone,
      items
    };
  };

  const getRecommendations = (
    snapshot,
    nextTrip,
    readiness,
    budgetSummary
  ) => {
    const recommendations = [];

    if (!nextTrip) {
      recommendations.push({
        icon: "✈",
        title: "ابدأ رحلتك القادمة",
        description:
          "أنشئ رحلة جديدة وحدد الوجهة والمواعيد والميزانية.",
        action: "home-new-trip",
        label: "إنشاء رحلة"
      });

      recommendations.push({
        icon: "☆",
        title: "أضف وجهة إلى قائمة الأمنيات",
        description:
          "احفظ الوجهات التي ترغب في زيارتها مستقبلاً.",
        route: "guide",
        label: "استكشف الوجهات"
      });

      return recommendations;
    }

    const daysUntil =
      calculateDaysUntil(nextTrip.startDate);

    if (
      daysUntil !== null &&
      daysUntil <= 30 &&
      readiness.score < 80
    ) {
      recommendations.push({
        icon: "✓",
        title: "أكمل جاهزية الرحلة",
        description:
          "موعد السفر قريب وبعض عناصر التجهيز ما زالت غير مكتملة.",
        route: "more",
        view: "readiness",
        label: "مراجعة الجاهزية"
      });
    }

    if (
      normalizeNumber(nextTrip.budget) > 0 &&
      normalizeNumber(nextTrip.spent) >
        normalizeNumber(nextTrip.budget)
    ) {
      recommendations.push({
        icon: "!",
        title: "راجع مصروفات الرحلة",
        description:
          "المصروف الحالي تجاوز الميزانية المحددة للرحلة.",
        route: "budget",
        label: "فتح الميزانية"
      });
    } else if (budgetSummary.monthlySaving <= 0) {
      recommendations.push({
        icon: "◈",
        title: "فعّل ادخار السفر",
        description:
          "حدد مبلغاً شهرياً ثابتاً لتجهيز الرحلات القادمة.",
        route: "budget",
        view: "savings",
        label: "إدارة الادخار"
      });
    }

    if (
      !nextTrip.accommodation &&
      !nextTrip.bookingReference
    ) {
      recommendations.push({
        icon: "⌂",
        title: "أضف معلومات الإقامة",
        description:
          "لم تتم إضافة الفندق أو رقم الحجز للرحلة القادمة.",
        action: "home-edit-next-trip",
        label: "تعديل الرحلة"
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        icon: "✓",
        title: "كل شيء يسير بشكل جيد",
        description:
          "الرحلة القادمة مرتبة ولا توجد تنبيهات عاجلة حالياً.",
        route: "trips",
        label: "عرض الرحلة"
      });
    }

    return recommendations.slice(0, 3);
  };

  const buildSnapshot = () => {
    const raw = getStoreState();
    const profile =
      isObject(raw.profile)
        ? raw.profile
        : {};

    const trips = getTrips(raw);
    const upcomingTrips = getUpcomingTrips(raw);
    const completedTrips = getCompletedTrips(raw);
    const nextTrip = upcomingTrips[0] || null;
    const budget = getBudgetSummary(raw);
    const packing = getPackingSummary(
      raw,
      nextTrip?.id
    );
    const documents = getDocumentSummary(
      raw,
      nextTrip?.id
    );
    const notifications =
      getNotificationSummary(raw);
    const readiness = calculateReadiness(
      nextTrip,
      packing,
      documents
    );

    const snapshot = {
      raw,
      profile,
      trips,
      upcomingTrips,
      completedTrips,
      nextTrip,
      budget,
      packing,
      documents,
      notifications,
      readiness,
      statistics: {
        totalTrips: trips.length,
        upcomingTrips: upcomingTrips.length,
        completedTrips: completedTrips.length,
        countries: getCountriesCount(raw),
        wishlist: normalizeCollection(
          raw.wishlist
        ).length,
        memories: normalizeCollection(
          raw.memories
        ).length
      }
    };

    snapshot.recommendations =
      getRecommendations(
        raw,
        nextTrip,
        readiness,
        budget
      );

    return snapshot;
  };

  const renderNextTrip = (snapshot) => {
    const ui = getUI();
    const trip = snapshot.nextTrip;

    if (!trip) {
      return ui?.empty
        ? ui.empty({
            icon: "✈",
            title: "لا توجد رحلة قادمة",
            message:
              "أنشئ رحلتك القادمة لتظهر هنا مع تفاصيل الجاهزية والميزانية.",
            action: {
              label: "إنشاء رحلة جديدة",
              action: "home-new-trip",
              primary: true
            }
          })
        : `
          <section class="tic-empty">
            <div class="tic-empty__icon">✈</div>
            <h3 class="tic-empty__title">
              لا توجد رحلة قادمة
            </h3>
          </section>
        `;
    }

    const daysUntil =
      calculateDaysUntil(trip.startDate);

    const duration =
      normalizeNumber(
        trip.durationDays,
        calculateDuration(
          trip.startDate,
          trip.endDate
        )
      );

    const statusLabel = {
      planning: "قيد التخطيط",
      booked: "تم الحجز",
      ready: "جاهزة للسفر",
      ongoing: "جارية",
      completed: "مكتملة"
    }[normalizeText(trip.status)] || "قيد التخطيط";

    const daysLabel =
      daysUntil === 0
        ? "السفر اليوم"
        : daysUntil === 1
          ? "متبقي يوم واحد"
          : daysUntil > 1
            ? `متبقي ${daysUntil} يوم`
            : "بدأت الرحلة";

    return `
      <article class="home-next-trip">
        <div class="home-next-trip__header">
          <div>
            <span class="home-next-trip__eyebrow">
              رحلتك القادمة
            </span>

            <h2 class="home-next-trip__title">
              ${escapeHTML(
                trip.title ||
                trip.destination ||
                "رحلة قادمة"
              )}
            </h2>

            <p class="home-next-trip__destination">
              ${escapeHTML(
                trip.destination ||
                [trip.city, trip.country]
                  .filter(Boolean)
                  .join("، ")
              )}
            </p>
          </div>

          ${
            ui?.status
              ? ui.status(statusLabel, {
                  value: trip.status
                })
              : `
                <span class="tic-badge">
                  ${escapeHTML(statusLabel)}
                </span>
              `
          }
        </div>

        <div class="home-next-trip__countdown">
          <strong>${escapeHTML(daysLabel)}</strong>
          <span>
            ${escapeHTML(
              ui?.date
                ? ui.date(trip.startDate)
                : trip.startDate
            )}
            —
            ${escapeHTML(
              ui?.date
                ? ui.date(trip.endDate)
                : trip.endDate
            )}
          </span>
        </div>

        <div class="home-next-trip__details">
          <div class="home-next-trip__detail">
            <span>المدة</span>
            <strong>${duration} يوم</strong>
          </div>

          <div class="home-next-trip__detail">
            <span>المسافرون</span>
            <strong>
              ${normalizeNumber(
                trip.travelers,
                1
              )}
            </strong>
          </div>

          <div class="home-next-trip__detail">
            <span>الميزانية</span>
            <strong>
              ${escapeHTML(
                ui?.currency
                  ? ui.currency(trip.budget)
                  : trip.budget
              )}
            </strong>
          </div>
        </div>

        ${
          ui?.progress
            ? ui.progress(
                snapshot.readiness.score,
                {
                  label:
                    "جاهزية الرحلة",
                  hint:
                    snapshot.readiness.label
                }
              )
            : ""
        }

        <div class="home-next-trip__actions">
          ${
            ui?.button
              ? ui.button({
                  label: "عرض التفاصيل",
                  route: "trips",
                  view: "details",
                  params: {
                    tripId: trip.id
                  },
                  primary: true
                })
              : ""
          }

          ${
            ui?.button
              ? ui.button({
                  label: "تعديل الرحلة",
                  action:
                    "home-edit-next-trip",
                  ghost: true
                })
              : ""
          }
        </div>
      </article>
    `;
  };

  const renderStatistics = (snapshot) => {
    const ui = getUI();

    const stats = [
      {
        icon: "✈",
        value: snapshot.statistics.totalTrips,
        label: "إجمالي الرحلات",
        subtitle:
          `${snapshot.statistics.upcomingTrips} قادمة`
      },
      {
        icon: "◎",
        value: snapshot.statistics.countries,
        label: "الدول",
        subtitle:
          `${snapshot.statistics.completedTrips} رحلة مكتملة`
      },
      {
        icon: "☆",
        value: snapshot.statistics.wishlist,
        label: "قائمة الأمنيات",
        subtitle: "وجهات محفوظة"
      },
      {
        icon: "◈",
        value: snapshot.statistics.memories,
        label: "الذكريات",
        subtitle: "لحظات موثقة"
      }
    ];

    const content = stats
      .map((stat) =>
        ui?.stat
          ? ui.stat(stat)
          : `
            <article class="tic-stat">
              <strong>${stat.value}</strong>
              <span>${escapeHTML(stat.label)}</span>
            </article>
          `
      )
      .join("");

    return ui?.grid
      ? ui.grid(content, {
          columns: 4,
          className: "home-statistics"
        })
      : `
        <div class="tic-grid tic-grid--4">
          ${content}
        </div>
      `;
  };

  const renderReadiness = (snapshot) => {
    const ui = getUI();
    const readiness = snapshot.readiness;

    return `
      <article class="home-readiness">
        <div class="home-readiness__score">
          <div
            class="home-readiness__ring"
            style="--readiness:${readiness.score}"
          >
            <strong>${readiness.score}%</strong>
          </div>

          <div>
            <span class="home-readiness__label">
              جاهزية السفر
            </span>

            <h3 class="home-readiness__title">
              ${escapeHTML(readiness.label)}
            </h3>
          </div>
        </div>

        <div class="home-readiness__items">
          ${readiness.items
            .map(
              (item) => `
                <div
                  class="home-readiness__item ${
                    item.complete
                      ? "is-complete"
                      : ""
                  }"
                >
                  <span
                    class="home-readiness__check"
                    aria-hidden="true"
                  >
                    ${item.complete ? "✓" : "•"}
                  </span>

                  <span>
                    ${escapeHTML(item.label)}
                  </span>
                </div>
              `
            )
            .join("")}
        </div>

        ${
          ui?.button
            ? ui.button({
                label: "مراجعة الجاهزية",
                route: "more",
                view: "readiness",
                block: true
              })
            : ""
        }
      </article>
    `;
  };

  const renderBudget = (snapshot) => {
    const ui = getUI();
    const budget = snapshot.budget;

    return `
      <article class="home-budget">
        <div class="home-budget__header">
          <div>
            <span class="home-budget__eyebrow">
              ملخص الميزانية
            </span>

            <h3 class="home-budget__title">
              ${escapeHTML(
                ui?.currency
                  ? ui.currency(
                      budget.totalSpent
                    )
                  : budget.totalSpent
              )}
            </h3>

            <p class="home-budget__subtitle">
              إجمالي المصروف على الرحلات
            </p>
          </div>

          <div class="home-budget__usage">
            <strong>${budget.usage}%</strong>
            <span>استخدام</span>
          </div>
        </div>

        ${
          ui?.progress
            ? ui.progress(budget.usage, {
                label: "استخدام الميزانية",
                hint:
                  `${ui.currency(
                    budget.available
                  )} متبقي`
              })
            : ""
        }

        <div class="home-budget__details">
          <div>
            <span>ميزانية الرحلات</span>
            <strong>
              ${escapeHTML(
                ui?.currency
                  ? ui.currency(
                      budget.totalBudget
                    )
                  : budget.totalBudget
              )}
            </strong>
          </div>

          <div>
            <span>الادخار الشهري</span>
            <strong>
              ${escapeHTML(
                ui?.currency
                  ? ui.currency(
                      budget.monthlySaving
                    )
                  : budget.monthlySaving
              )}
            </strong>
          </div>
        </div>

        ${
          ui?.button
            ? ui.button({
                label: "فتح مركز الميزانية",
                route: "budget",
                block: true
              })
            : ""
        }
      </article>
    `;
  };

  const renderQuickActions = () => {
    const ui = getUI();

    const actions = [
      {
        icon: "＋",
        title: "رحلة جديدة",
        description:
          "أنشئ خطة سفر جديدة.",
        action: "home-new-trip"
      },
      {
        icon: "✈",
        title: "رحلاتي",
        description:
          "عرض وإدارة جميع الرحلات.",
        route: "trips"
      },
      {
        icon: "⌕",
        title: "دليل السفر",
        description:
          "استكشف الوجهات والمعلومات.",
        route: "guide"
      },
      {
        icon: "◈",
        title: "الميزانية",
        description:
          "تابع المصروف والادخار.",
        route: "budget"
      },
      {
        icon: "✓",
        title: "التجهيز",
        description:
          "راجع الوثائق وقائمة الأمتعة.",
        route: "more",
        view: "readiness"
      },
      {
        icon: "☆",
        title: "الذكريات",
        description:
          "راجع صور ولحظات السفر.",
        route: "more",
        view: "memories"
      }
    ];

    return ui?.quickActions
      ? ui.quickActions(actions, {
          columns: 3
        })
      : actions
          .map(
            (action) => `
              <button
                class="tic-card"
                data-route="${escapeHTML(
                  action.route || ""
                )}"
                data-action="${escapeHTML(
                  action.action || ""
                )}"
              >
                <strong>
                  ${escapeHTML(action.title)}
                </strong>
              </button>
            `
          )
          .join("");
  };

  const renderRecommendations = (snapshot) => {
    const ui = getUI();

    return snapshot.recommendations
      .map((item) => {
        const actionButton = ui?.button
          ? ui.button({
              label: item.label,
              action: item.action,
              route: item.route,
              view: item.view,
              small: true
            })
          : "";

        return ui?.card
          ? ui.card({
              icon: item.icon,
              title: item.title,
              description: item.description,
              footer: actionButton,
              compact: true
            })
          : `
            <article class="tic-card">
              <h3>${escapeHTML(item.title)}</h3>
              <p>${escapeHTML(
                item.description
              )}</p>
            </article>
          `;
      })
      .join("");
  };

  const renderAlerts = (snapshot) => {
    const ui = getUI();
    const notifications =
      snapshot.notifications;

    if (notifications.unread === 0) {
      return ui?.empty
        ? ui.empty({
            icon: "✓",
            title: "لا توجد تنبيهات",
            message:
              "كل شيء منظم ولا توجد إشعارات تحتاج انتباهك."
          })
        : "";
    }

    const items = notifications.items.map(
      (notification) => ({
        icon:
          notification.type === "warning"
            ? "!"
            : notification.type === "error"
              ? "!"
              : "i",
        title:
          notification.title ||
          "تنبيه سفر",
        subtitle:
          notification.message ||
          notification.description ||
          "",
        meta:
          notification.createdAt
            ? ui?.relativeTime?.(
                notification.createdAt
              )
            : "",
        badge:
          notification.priority === "high"
            ? "مهم"
            : "",
        badgeTone:
          notification.priority === "high"
            ? "warning"
            : "neutral"
      })
    );

    return ui?.list
      ? ui.list(items, {
          divided: true
        })
      : "";
  };

  const renderPage = (snapshot) => {
    const ui = getUI();
    const profile = snapshot.profile;
    const name =
      profile.name ||
      Config.profile?.name ||
      "يوسف";

    const greeting = `
      هلا ${escapeHTML(name)}
    `;

    const hero = ui?.hero
      ? ui.hero({
          badge: "Travel Intelligence Center",
          eyebrow: "مركز سفرك الشخصي",
          title: greeting,
          subtitle:
            "تابع رحلاتك وميزانيتك وجاهزيتك من مكان واحد.",
          actions: [
            {
              label: "رحلة جديدة",
              action: "home-new-trip",
              primary: true,
              icon: "＋"
            },
            {
              label: "عرض الرحلات",
              route: "trips",
              ghost: true
            }
          ],
          aside: snapshot.nextTrip
            ? `
              <div class="home-hero-summary">
                <span>الرحلة القادمة</span>
                <strong>
                  ${escapeHTML(
                    snapshot.nextTrip.destination ||
                    snapshot.nextTrip.title
                  )}
                </strong>
                <small>
                  ${
                    calculateDaysUntil(
                      snapshot.nextTrip.startDate
                    ) || 0
                  } يوم متبقي
                </small>
              </div>
            `
            : `
              <div class="home-hero-summary">
                <span>جاهز لرحلة جديدة؟</span>
                <strong>ابدأ التخطيط الآن</strong>
              </div>
            `
        })
      : `
        <section class="tic-hero">
          <h1>${greeting}</h1>
        </section>
      `;

    const nextTripSection = ui?.section
      ? ui.section({
          eyebrow: "Next Journey",
          title: "الرحلة القادمة",
          subtitle:
            "كل المعلومات المهمة لرحلتك القادمة.",
          content: renderNextTrip(snapshot)
        })
      : renderNextTrip(snapshot);

    const statisticsSection = ui?.section
      ? ui.section({
          eyebrow: "Your Travel",
          title: "سفراتك",
          subtitle:
            "نظرة سريعة على سجل السفر والوجهات.",
          content:
            renderStatistics(snapshot)
        })
      : renderStatistics(snapshot);

    const readinessBudgetContent = ui?.grid
      ? ui.grid(
          `${renderReadiness(
            snapshot
          )}${renderBudget(snapshot)}`,
          {
            columns: 2,
            className:
              "home-readiness-budget-grid"
          }
        )
      : "";

    const readinessSection = ui?.section
      ? ui.section({
          eyebrow: "Travel Control",
          title: "جاهزية السفر والميزانية",
          subtitle:
            "تابع استعدادك المالي والتنظيمي قبل موعد الرحلة.",
          content: readinessBudgetContent
        })
      : readinessBudgetContent;

    const quickActionsSection = ui?.section
      ? ui.section({
          eyebrow: "Quick Access",
          title: "ماذا تريد أن تفعل؟",
          subtitle:
            "اختصارات سريعة لأهم أدوات مركز السفر.",
          content: renderQuickActions()
        })
      : renderQuickActions();

    const recommendationsContent = ui?.grid
      ? ui.grid(
          renderRecommendations(snapshot),
          {
            columns: 3,
            className:
              "home-recommendations-grid"
          }
        )
      : renderRecommendations(snapshot);

    const recommendationsSection = ui?.section
      ? ui.section({
          eyebrow: "Travel Intelligence",
          title: "توصيات ذكية",
          subtitle:
            "اقتراحات مبنية على وضع رحلاتك الحالي.",
          content: recommendationsContent
        })
      : recommendationsContent;

    const alertsSection = ui?.section
      ? ui.section({
          eyebrow: "Updates",
          title: "التنبيهات",
          subtitle:
            snapshot.notifications.unread > 0
              ? `لديك ${snapshot.notifications.unread} تنبيه غير مقروء.`
              : "لا توجد تنبيهات جديدة.",
          actions:
            snapshot.notifications.unread > 0
              ? [
                  {
                    label: "عرض الكل",
                    route: "more",
                    view: "notifications",
                    small: true
                  }
                ]
              : [],
          content: renderAlerts(snapshot)
        })
      : renderAlerts(snapshot);

    return `
      <div
        class="home-page"
        data-page="home"
        data-page-version="${PAGE_VERSION}"
      >
        ${hero}

        <div class="home-page__content">
          ${nextTripSection}
          ${statisticsSection}
          ${readinessSection}
          ${quickActionsSection}
          ${recommendationsSection}
          ${alertsSection}
        </div>
      </div>
    `;
  };

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
      if (ui.hasAction?.(name)) {
        return;
      }

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
          "TIC Home Page subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () => {
        state.subscribers.delete(listener);
      };
    },

    destroy() {
      this.unmount();

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
      }

      if (
        typeof state.unsubscribeRouter === "function"
      ) {
        state.unsubscribeRouter();
      }

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        }
      );

      state.unsubscribeStore = null;
      state.unsubscribeRouter = null;
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
      router.registerPage("home", HomePage);
    }
  }

  HomePage.init();
})(window, document);
