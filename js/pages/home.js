/* =========================================================
   Travel Intelligence Center
   Home Page Module V2.0.0

   File Path:
   js/pages/home.js

   Purpose:
   - Premium iPhone-first executive travel dashboard.
   - Clean hierarchy inspired by the AI Work dashboard.
   - Next trip, travel snapshot, readiness, budget,
     quick actions, recommendations and alerts.

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
  const PAGE_VERSION = "2.0.0";

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

  const list = (value) =>
    Array.isArray(value) ? value : [];

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

  const sum = (items, selector) =>
    items.reduce(
      (total, item) =>
        total + number(selector(item)),
      0
    );

  const budgetSummaryFrom = (snapshot) => {
    const trips = tripsFrom(snapshot);

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

    const profile = isObject(snapshot.profile)
      ? snapshot.profile
      : {};

    return {
      totalBudget,
      totalSpent,
      available,
      usage,
      annualTravelBudget: number(
        profile.annualTravelBudget,
        number(
          Config.profile?.annualTravelBudget,
          30000
        )
      ),
      monthlySaving: number(
        profile.monthlySaving,
        number(
          Config.profile?.monthlySaving,
          1500
        )
      )
    };
  };

  const packingSummaryFrom = (snapshot, tripId) => {
    const source = snapshot.packing;
    let items = [];

    if (Array.isArray(source)) {
      items = source.filter(
        (item) =>
          !tripId ||
          !item.tripId ||
          String(item.tripId) === String(tripId)
      );
    } else if (isObject(source)) {
      if (Array.isArray(source.items)) {
        items = source.items.filter(
          (item) =>
            !tripId ||
            !item.tripId ||
            String(item.tripId) === String(tripId)
        );
      } else if (
        tripId &&
        Array.isArray(source[tripId])
      ) {
        items = source[tripId];
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

  const documentSummaryFrom = (snapshot, tripId) => {
    const documents = list(snapshot.documents).filter(
      (item) =>
        !tripId ||
        !item.tripId ||
        String(item.tripId) === String(tripId)
    );

    const valid = documents.filter((item) => {
      const status = text(item.status).toLowerCase();

      if (
        ["valid", "ready", "completed"].includes(status)
      ) {
        return true;
      }

      const expiryDate = toDate(item.expiryDate);

      return expiryDate && expiryDate > new Date();
    }).length;

    const expiring = documents.filter((item) => {
      const remaining = daysUntil(item.expiryDate);

      return (
        remaining !== null &&
        remaining >= 0 &&
        remaining <= 90
      );
    }).length;

    return {
      total: documents.length,
      valid,
      expiring,
      percentage:
        documents.length > 0
          ? Math.round(
              (valid / documents.length) * 100
            )
          : 0
    };
  };

  const notificationSummaryFrom = (snapshot) => {
    const notifications = list(
      snapshot.notifications
    );

    const unread = notifications.filter(
      (item) =>
        item.read !== true &&
        item.isRead !== true
    );

    return {
      total: notifications.length,
      unread: unread.length,
      important: unread.filter(
        (item) =>
          item.priority === "high" ||
          item.type === "warning" ||
          item.type === "error"
      ).length,
      items: unread.slice(0, 4)
    };
  };

  const readinessFrom = (
    trip,
    packing,
    documents
  ) => {
    if (!trip) {
      return {
        score: 0,
        label: "ابدأ التخطيط",
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
        complete: number(trip.budget) > 0
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
          documents.total > 0 &&
          documents.percentage >= 80
      },
      {
        label: "التجهيز",
        complete:
          packing.total > 0 &&
          packing.percentage >= 80
      }
    ];

    const completed = items.filter(
      (item) => item.complete
    ).length;

    const score = Math.round(
      (completed / items.length) * 100
    );

    return {
      score,
      label:
        score >= 80
          ? "جاهزية ممتازة"
          : score >= 50
            ? "جاهزية جيدة"
            : "تحتاج تجهيز",
      tone:
        score >= 80
          ? "success"
          : score >= 50
            ? "info"
            : "warning",
      items
    };
  };

  const recommendationsFrom = (
    snapshot,
    nextTrip,
    readiness,
    budget
  ) => {
    const items = [];

    if (!nextTrip) {
      return [
        {
          icon: "✈",
          title: "ابدأ رحلتك القادمة",
          description:
            "أنشئ رحلة وحدد الوجهة والمواعيد والميزانية.",
          action: "home-new-trip",
          label: "إنشاء رحلة"
        },
        {
          icon: "☆",
          title: "اكتشف وجهتك القادمة",
          description:
            "استعرض الدول والمدن واحفظ ما يعجبك.",
          route: "guide",
          label: "فتح الدليل"
        }
      ];
    }

    const remainingDays =
      daysUntil(nextTrip.startDate);

    if (
      remainingDays !== null &&
      remainingDays <= 30 &&
      readiness.score < 80
    ) {
      items.push({
        icon: "✓",
        title: "أكمل جاهزية الرحلة",
        description:
          "موعد السفر قريب وبعض التجهيزات غير مكتملة.",
        route: "more",
        view: "readiness",
        label: "مراجعة الجاهزية"
      });
    }

    if (
      number(nextTrip.spent) >
      number(nextTrip.budget)
    ) {
      items.push({
        icon: "!",
        title: "راجع مصروفات الرحلة",
        description:
          "المصروف الحالي تجاوز الميزانية المحددة.",
        route: "budget",
        label: "فتح الميزانية"
      });
    } else if (budget.monthlySaving <= 0) {
      items.push({
        icon: "◈",
        title: "فعّل ادخار السفر",
        description:
          "حدد مبلغاً شهرياً لرحلاتك القادمة.",
        route: "budget",
        view: "savings",
        label: "إدارة الادخار"
      });
    }

    if (
      !nextTrip.accommodation &&
      !nextTrip.bookingReference
    ) {
      items.push({
        icon: "⌂",
        title: "أضف معلومات الإقامة",
        description:
          "أكمل بيانات الفندق أو رقم الحجز.",
        action: "home-edit-next-trip",
        label: "تعديل الرحلة"
      });
    }

    if (!items.length) {
      items.push({
        icon: "✓",
        title: "رحلتك مرتبة",
        description:
          "لا توجد تنبيهات مهمة حالياً.",
        route: "trips",
        label: "عرض الرحلة"
      });
    }

    return items.slice(0, 3);
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
    const budget = budgetSummaryFrom(raw);
    const packing = packingSummaryFrom(
      raw,
      nextTrip?.id
    );
    const documents = documentSummaryFrom(
      raw,
      nextTrip?.id
    );
    const notifications =
      notificationSummaryFrom(raw);
    const readiness = readinessFrom(
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
        countries: countriesCountFrom(raw),
        wishlist: list(raw.wishlist).length,
        memories: list(raw.memories).length
      }
    };

    snapshot.recommendations =
      recommendationsFrom(
        raw,
        nextTrip,
        readiness,
        budget
      );

    return snapshot;
  };

  const renderHero = (snapshot) => {
    const ui = getUI();

    const name =
      snapshot.profile.name ||
      Config.profile?.name ||
      "يوسف";

    const nextTrip = snapshot.nextTrip;
    const remainingDays = nextTrip
      ? daysUntil(nextTrip.startDate)
      : null;

    const aside = nextTrip
      ? `
        <div class="tic-card tic-card-body">
          <span class="tic-chip">
            الرحلة القادمة
          </span>

          <h3 class="tic-card-title" style="margin-top:12px">
            ${escapeHTML(
              nextTrip.destination ||
              nextTrip.title ||
              "رحلة قادمة"
            )}
          </h3>

          <p class="tic-card-text">
            ${
              remainingDays === 0
                ? "موعد السفر اليوم"
                : remainingDays === 1
                  ? "متبقي يوم واحد"
                  : `متبقي ${Math.max(
                      0,
                      remainingDays || 0
                    )} يوم`
            }
          </p>
        </div>
      `
      : `
        <div class="tic-card tic-card-body">
          <span class="tic-chip">
            خطتك القادمة
          </span>

          <h3 class="tic-card-title" style="margin-top:12px">
            جاهز لرحلة جديدة؟
          </h3>

          <p class="tic-card-text">
            ابدأ التخطيط من مكان واحد.
          </p>
        </div>
      `;

    return ui.hero({
      badge: "Travel Intelligence Center",
      title: `هلا ${name}`,
      subtitle:
        "كل رحلاتك وميزانيتك وجاهزيتك في مركز واحد.",
      greeting: true,
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
          soft: true
        }
      ],
      aside
    });
  };

  const renderNextTrip = (snapshot) => {
    const ui = getUI();
    const trip = snapshot.nextTrip;

    if (!trip) {
      return ui.empty({
        icon: "✈",
        title: "لا توجد رحلة قادمة",
        message:
          "أنشئ رحلة جديدة لتظهر هنا تفاصيل الموعد والميزانية والجاهزية.",
        action: {
          label: "إنشاء رحلة جديدة",
          action: "home-new-trip",
          primary: true
        }
      });
    }

    const remainingDays = daysUntil(trip.startDate);

    const duration = number(
      trip.durationDays,
      durationDays(
        trip.startDate,
        trip.endDate
      )
    );

    const statusLabel = {
      planning: "قيد التخطيط",
      booked: "تم الحجز",
      ready: "جاهزة",
      ongoing: "جارية",
      completed: "مكتملة"
    }[text(trip.status).toLowerCase()] ||
    "قيد التخطيط";

    const countdown =
      remainingDays === 0
        ? "السفر اليوم"
        : remainingDays === 1
          ? "متبقي يوم واحد"
          : remainingDays > 1
            ? `متبقي ${remainingDays} يوم`
            : "بدأت الرحلة";

    const body = `
      <div class="tic-feature-row">
        <div>
          <span class="tic-chip tic-chip-info">
            ${escapeHTML(countdown)}
          </span>

          <h3 class="tic-card-title" style="margin-top:14px">
            ${escapeHTML(
              trip.title ||
              trip.destination ||
              "رحلة قادمة"
            )}
          </h3>

          <p class="tic-card-text">
            ${escapeHTML(
              trip.destination ||
              [trip.city, trip.country]
                .filter(Boolean)
                .join("، ")
            )}
          </p>
        </div>

        ${ui.status(statusLabel, {
          value: trip.status
        })}
      </div>

      <div class="tic-trip-meta">
        ${ui.info(
          "التاريخ",
          `${ui.date(trip.startDate)} — ${ui.date(
            trip.endDate
          )}`
        )}

        ${ui.info(
          "المدة",
          `${duration} يوم`
        )}

        ${ui.info(
          "الميزانية",
          ui.currency(trip.budget)
        )}
      </div>

      <div style="margin-top:16px">
        ${ui.progress(
          snapshot.readiness.score,
          {
            label: "جاهزية الرحلة",
            hint: snapshot.readiness.label
          }
        )}
      </div>

      <div class="tic-grid tic-grid-2" style="margin-top:16px">
        ${ui.button({
          label: "عرض التفاصيل",
          route: "trips",
          view: "details",
          params: {
            tripId: trip.id
          },
          primary: true,
          block: true
        })}

        ${ui.button({
          label: "تعديل الرحلة",
          action: "home-edit-next-trip",
          block: true
        })}
      </div>
    `;

    return ui.card({
      className: "tic-feature-card",
      body
    });
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
          `${snapshot.statistics.completedTrips} مكتملة`
      },
      {
        icon: "☆",
        value: snapshot.statistics.wishlist,
        label: "الأمنيات",
        subtitle: "وجهات محفوظة"
      },
      {
        icon: "◈",
        value: snapshot.statistics.memories,
        label: "الذكريات",
        subtitle: "لحظات موثقة"
      }
    ];

    return ui.grid(
      stats.map((item) => ui.stat(item)).join(""),
      {
        columns: 4
      }
    );
  };

  const renderReadiness = (snapshot) => {
    const ui = getUI();
    const readiness = snapshot.readiness;

    const items = readiness.items.length
      ? readiness.items
          .map(
            (item) => `
              <div class="tic-settings-item">
                <div class="tic-settings-item-main">
                  <div class="tic-settings-icon">
                    ${item.complete ? "✓" : "•"}
                  </div>

                  <div class="tic-settings-copy">
                    <strong>
                      ${escapeHTML(item.label)}
                    </strong>

                    <small>
                      ${
                        item.complete
                          ? "مكتمل"
                          : "يحتاج متابعة"
                      }
                    </small>
                  </div>
                </div>

                ${ui.badge(
                  item.complete
                    ? "جاهز"
                    : "ناقص",
                  item.complete
                    ? "success"
                    : "warning"
                )}
              </div>
            `
          )
          .join("")
      : ui.empty({
          icon: "✓",
          title: "لا توجد رحلة قادمة",
          message:
            "تظهر جاهزية السفر بعد إنشاء رحلة."
        });

    return ui.card({
      title: "جاهزية السفر",
      description:
        "ملخص سريع لما تم إنجازه قبل موعد السفر.",
      body: `
        <div class="tic-feature-row" style="margin-top:16px">
          <div>
            <strong class="tic-stat-value">
              ${readiness.score}%
            </strong>

            <span class="tic-stat-label">
              ${escapeHTML(readiness.label)}
            </span>
          </div>

          ${ui.status(readiness.label, {
            tone: readiness.tone
          })}
        </div>

        <div style="margin-top:16px">
          ${ui.progress(
            readiness.score,
            {
              showValue: false
            }
          )}
        </div>

        <div class="tic-settings-list" style="margin-top:16px">
          ${items}
        </div>
      `,
      footer: ui.button({
        label: "مراجعة الجاهزية",
        route: "more",
        view: "readiness",
        block: true
      })
    });
  };

  const renderBudget = (snapshot) => {
    const ui = getUI();
    const budget = snapshot.budget;

    return `
      <article class="tic-budget-overview">
        <small>إجمالي المصروف</small>

        <strong>
          ${escapeHTML(
            ui.currency(budget.totalSpent)
          )}
        </strong>

        <p style="margin-top:10px;color:rgba(255,255,255,.72)">
          ${budget.usage}% من ميزانية الرحلات
        </p>

        <div style="margin-top:18px">
          ${ui.progress(
            budget.usage,
            {
              label: "استخدام الميزانية",
              hint:
                `${ui.currency(
                  budget.available
                )} متبقي`
            }
          )}
        </div>

        <div class="tic-budget-breakdown">
          <div class="tic-budget-breakdown-item">
            <small>إجمالي الميزانية</small>
            <strong>
              ${escapeHTML(
                ui.currency(
                  budget.totalBudget
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>الادخار الشهري</small>
            <strong>
              ${escapeHTML(
                ui.currency(
                  budget.monthlySaving
                )
              )}
            </strong>
          </div>

          <div class="tic-budget-breakdown-item">
            <small>الميزانية السنوية</small>
            <strong>
              ${escapeHTML(
                ui.currency(
                  budget.annualTravelBudget
                )
              )}
            </strong>
          </div>
        </div>

        <div style="margin-top:16px">
          ${ui.button({
            label: "فتح مركز الميزانية",
            route: "budget",
            block: true,
            soft: true
          })}
        </div>
      </article>
    `;
  };

  const renderQuickActions = () => {
    const ui = getUI();

    return ui.quickActions([
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
          "عرض وإدارة السفرات.",
        route: "trips"
      },
      {
        icon: "⌕",
        title: "دليل السفر",
        description:
          "استكشف الوجهات.",
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
          "راجع الوثائق والأمتعة.",
        route: "more",
        view: "readiness"
      },
      {
        icon: "☆",
        title: "الذكريات",
        description:
          "راجع لحظات السفر.",
        route: "more",
        view: "memories"
      }
    ]);
  };

  const renderRecommendations = (snapshot) => {
    const ui = getUI();

    return ui.grid(
      snapshot.recommendations
        .map((item) =>
          ui.card({
            icon: item.icon,
            title: item.title,
            description: item.description,
            footer: ui.button({
              label: item.label,
              action: item.action,
              route: item.route,
              view: item.view,
              block: true
            })
          })
        )
        .join(""),
      {
        columns: 3
      }
    );
  };

  const renderAlerts = (snapshot) => {
    const ui = getUI();
    const notifications = snapshot.notifications;

    if (notifications.unread === 0) {
      return ui.empty({
        icon: "✓",
        title: "لا توجد تنبيهات",
        message:
          "كل شيء منظم ولا توجد إشعارات تحتاج انتباهك."
      });
    }

    return ui.list(
      notifications.items.map((item) => ({
        icon:
          item.type === "error" ||
          item.type === "warning"
            ? "!"
            : "i",
        title:
          item.title ||
          "تنبيه سفر",
        subtitle:
          item.message ||
          item.description ||
          "",
        badge:
          item.priority === "high"
            ? "مهم"
            : "",
        badgeTone:
          item.priority === "high"
            ? "warning"
            : "neutral"
      }))
    );
  };

  const renderPage = (snapshot) => {
    const ui = getUI();

    const overviewGrid = ui.grid(
      `${renderReadiness(snapshot)}${renderBudget(
        snapshot
      )}`,
      {
        columns: 2
      }
    );

    return `
      <div
        class="tic-module"
        data-page="home"
        data-page-version="${PAGE_VERSION}"
      >
        ${renderHero(snapshot)}

        ${ui.section({
          eyebrow: "NEXT JOURNEY",
          title: "الرحلة القادمة",
          subtitle:
            "أهم معلومات رحلتك القادمة في مكان واحد.",
          content: renderNextTrip(snapshot)
        })}

        ${ui.section({
          eyebrow: "TRAVEL SNAPSHOT",
          title: "سفراتك",
          subtitle:
            "نظرة تنفيذية سريعة على سجل سفرك.",
          content: renderStatistics(snapshot)
        })}

        ${ui.section({
          eyebrow: "TRAVEL CONTROL",
          title: "الجاهزية والميزانية",
          subtitle:
            "تابع استعدادك التنظيمي والمالي.",
          content: overviewGrid
        })}

        ${ui.section({
          eyebrow: "QUICK ACCESS",
          title: "اختصارات السفر",
          subtitle:
            "وصول سريع لأهم أدوات التطبيق.",
          content: renderQuickActions()
        })}

        ${ui.section({
          eyebrow: "TRAVEL INTELLIGENCE",
          title: "توصيات ذكية",
          subtitle:
            "اقتراحات مبنية على حالة رحلاتك.",
          content:
            renderRecommendations(snapshot)
        })}

        ${ui.section({
          eyebrow: "UPDATES",
          title: "التنبيهات",
          subtitle:
            snapshot.notifications.unread > 0
              ? `لديك ${snapshot.notifications.unread} تنبيه غير مقروء.`
              : "لا توجد تنبيهات جديدة.",
          content: renderAlerts(snapshot)
        })}
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
      if (state.mounted) refresh();
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
