/* =========================================================
   Travel Intelligence Center
   Trips Page Module V2.0.0

   File Path:
   js/pages/trips.js

   Purpose:
   - Premium iPhone-first trip management center.
   - Clean executive overview, filters, cards and details.
   - Full create, edit, duplicate, delete and status flow.
   - Uses TIC Store, TIC Router, TIC UI and Trip Form.

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
  const PAGE_VERSION = "2.0.0";

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    activeView: "list",
    activeTripId: null,
    filters: {
      search: "",
      status: "all",
      type: "all",
      sort: "start-asc"
    },
    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null
  };

  const STATUS_LABELS = {
    planning: "قيد التخطيط",
    booked: "تم الحجز",
    ready: "جاهزة للسفر",
    ongoing: "جارية",
    completed: "مكتملة",
    cancelled: "ملغاة"
  };

  const STATUS_TONES = {
    planning: "neutral",
    booked: "info",
    ready: "success",
    ongoing: "warning",
    completed: "success",
    cancelled: "danger"
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
    { value: "start-desc", label: "الأبعد أولاً" },
    { value: "created-desc", label: "الأحدث إضافة" },
    { value: "budget-desc", label: "الأعلى ميزانية" },
    { value: "title-asc", label: "الاسم أبجدياً" }
  ];

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

  const createId = () =>
    `trip_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

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
      throw new Error(
        "TIC Trips Error: store is unavailable."
      );
    }

    if (typeof store.set === "function") {
      store.set("trips", trips);
      return true;
    }

    if (typeof store.patch === "function") {
      store.patch({ trips });
      return true;
    }

    if (typeof store.update === "function") {
      store.update((currentState) => ({
        ...currentState,
        trips
      }));
      return true;
    }

    throw new Error(
      "TIC Trips Error: persistence is unavailable."
    );
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
      spent: 0,
      featured: false,
      createdAt: now,
      updatedAt: now
    };

    const store = getStore();

    if (typeof store?.addTrip === "function") {
      return (
        (await store.addTrip(duplicate)) ||
        duplicate
      );
    }

    if (typeof store?.createTrip === "function") {
      return (
        (await store.createTrip(duplicate)) ||
        duplicate
      );
    }

    if (typeof store?.upsertTrip === "function") {
      await store.upsertTrip(duplicate);
      return duplicate;
    }

    const trips = getTrips();
    trips.unshift(duplicate);
    saveTrips(trips);

    return duplicate;
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

    if (raw) return raw;

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

    return "planning";
  };

  const filteredTripsFrom = (trips) => {
    const search =
      text(state.filters.search).toLowerCase();

    const result = trips.filter((trip) => {
      const status = tripStatus(trip);
      const type =
        text(trip.tripType).toLowerCase();

      const matchesSearch =
        !search ||
        [
          trip.title,
          trip.destination,
          trip.country,
          trip.city,
          trip.accommodation,
          trip.airline
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

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
          return text(a.title).localeCompare(
            text(b.title),
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

  const statisticsFrom = (trips) => ({
    total: trips.length,
    upcoming: trips.filter((trip) =>
      ["planning", "booked", "ready"].includes(
        tripStatus(trip)
      )
    ).length,
    ongoing: trips.filter(
      (trip) =>
        tripStatus(trip) === "ongoing"
    ).length,
    completed: trips.filter(
      (trip) =>
        tripStatus(trip) === "completed"
    ).length,
    totalBudget: trips.reduce(
      (total, trip) =>
        total + number(trip.budget),
      0
    ),
    totalSpent: trips.reduce(
      (total, trip) =>
        total + number(trip.spent),
      0
    )
  });

  const relatedDocuments = (tripId) => {
    const snapshot = getStoreState();

    return (
      Array.isArray(snapshot.documents)
        ? snapshot.documents
        : []
    ).filter(
      (item) =>
        String(item.tripId || "") ===
        String(tripId)
    );
  };

  const relatedPacking = (tripId) => {
    const source = getStoreState().packing;

    if (Array.isArray(source)) {
      return source.filter(
        (item) =>
          String(item.tripId || "") ===
          String(tripId)
      );
    }

    if (isObject(source)) {
      if (Array.isArray(source.items)) {
        return source.items.filter(
          (item) =>
            String(item.tripId || "") ===
            String(tripId)
        );
      }

      if (Array.isArray(source[tripId])) {
        return source[tripId];
      }
    }

    return [];
  };

  const buildSnapshot = () => {
    const trips = getTrips();

    const snapshot = {
      trips,
      filteredTrips: filteredTripsFrom(trips),
      activeTrip: state.activeTripId
        ? trips.find(
            (trip) =>
              String(trip.id) ===
              String(state.activeTripId)
          ) || null
        : null,
      statistics: statisticsFrom(trips),
      filters: clone(state.filters),
      activeView: state.activeView
    };

    state.lastSnapshot = snapshot;

    return snapshot;
  };

  const renderStatistics = (snapshot) => {
    const ui = getUI();

    return ui.grid(
      [
        {
          icon: "✈",
          value: snapshot.statistics.total,
          label: "إجمالي الرحلات",
          subtitle: "كل الرحلات"
        },
        {
          icon: "◷",
          value: snapshot.statistics.upcoming,
          label: "رحلات قادمة",
          subtitle: "مخططة أو محجوزة"
        },
        {
          icon: "◎",
          value: snapshot.statistics.ongoing,
          label: "رحلات جارية",
          subtitle: "تحدث الآن"
        },
        {
          icon: "✓",
          value: snapshot.statistics.completed,
          label: "رحلات مكتملة",
          subtitle: "ضمن السجل"
        }
      ]
        .map((item) => ui.stat(item))
        .join(""),
      {
        columns: 4
      }
    );
  };

  const renderFilters = () => {
    const selected = (value, current) =>
      value === current ? "selected" : "";

    return `
      <div class="tic-toolbar">
        <input
          type="search"
          class="tic-input"
          data-trips-search
          value="${escapeHTML(
            state.filters.search
          )}"
          placeholder="ابحث باسم الرحلة أو الوجهة..."
          aria-label="البحث في الرحلات"
        >

        <div class="tic-form-grid">
          <div class="tic-field">
            <label>الحالة</label>

            <select
              class="tic-select"
              data-trips-filter-status
            >
              <option
                value="all"
                ${selected(
                  "all",
                  state.filters.status
                )}
              >
                كل الحالات
              </option>

              ${Object.entries(STATUS_LABELS)
                .map(
                  ([value, label]) => `
                    <option
                      value="${escapeHTML(value)}"
                      ${selected(
                        value,
                        state.filters.status
                      )}
                    >
                      ${escapeHTML(label)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </div>

          <div class="tic-field">
            <label>النوع</label>

            <select
              class="tic-select"
              data-trips-filter-type
            >
              <option
                value="all"
                ${selected(
                  "all",
                  state.filters.type
                )}
              >
                كل الأنواع
              </option>

              ${Object.entries(TYPE_LABELS)
                .map(
                  ([value, label]) => `
                    <option
                      value="${escapeHTML(value)}"
                      ${selected(
                        value,
                        state.filters.type
                      )}
                    >
                      ${escapeHTML(label)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </div>

          <div class="tic-field">
            <label>الترتيب</label>

            <select
              class="tic-select"
              data-trips-sort
            >
              ${SORT_OPTIONS.map(
                (option) => `
                  <option
                    value="${escapeHTML(
                      option.value
                    )}"
                    ${selected(
                      option.value,
                      state.filters.sort
                    )}
                  >
                    ${escapeHTML(option.label)}
                  </option>
                `
              ).join("")}
            </select>
          </div>

          <div class="tic-field">
            <label>&nbsp;</label>

            ${getUI().button({
              label: "مسح الفلاتر",
              action: "trips-clear-filters",
              block: true
            })}
          </div>
        </div>
      </div>
    `;
  };

  const renderTripCard = (trip) => {
    const ui = getUI();
    const status = tripStatus(trip);
    const remaining = daysUntil(trip);
    const budget = number(trip.budget);
    const spent = number(trip.spent);
    const usage =
      budget > 0
        ? Math.min(
            100,
            Math.round((spent / budget) * 100)
          )
        : 0;

    const countdown =
      remaining === null
        ? "الموعد غير محدد"
        : remaining === 0
          ? "السفر اليوم"
          : remaining === 1
            ? "متبقي يوم"
            : remaining > 1
              ? `متبقي ${remaining} يوم`
              : status === "completed"
                ? "رحلة مكتملة"
                : "بدأت الرحلة";

    return `
      <article
        class="tic-card tic-trip-card"
        data-trip-card="${escapeHTML(trip.id)}"
      >
        <div class="tic-trip-cover">
          <span class="tic-trip-cover-emoji">
            ${escapeHTML(
              trip.emoji ||
              trip.icon ||
              "✈"
            )}
          </span>
        </div>

        <div class="tic-trip-card-body">
          <div class="tic-feature-row">
            <div>
              <span class="tic-chip">
                ${escapeHTML(
                  TYPE_LABELS[trip.tripType] ||
                  "رحلة"
                )}
              </span>

              <h3
                class="tic-card-title"
                style="margin-top:12px"
              >
                ${escapeHTML(
                  trip.title ||
                  trip.destination ||
                  "رحلة بدون اسم"
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

            ${ui.status(
              STATUS_LABELS[status] || status,
              {
                value: status,
                tone:
                  STATUS_TONES[status]
              }
            )}
          </div>

          <div style="margin-top:14px">
            ${ui.badge(
              countdown,
              remaining !== null &&
              remaining <= 7 &&
              remaining >= 0
                ? "warning"
                : "info"
            )}
          </div>

          <div class="tic-trip-meta">
            ${ui.info(
              "التاريخ",
              trip.startDate
                ? ui.date(trip.startDate)
                : "—"
            )}

            ${ui.info(
              "المدة",
              `${durationDays(trip)} يوم`
            )}

            ${ui.info(
              "الميزانية",
              ui.currency(budget)
            )}
          </div>

          <div style="margin-top:15px">
            ${ui.progress(usage, {
              label: "استخدام الميزانية",
              hint:
                `${ui.currency(spent)} مصروف`
            })}
          </div>

          <div
            class="tic-grid tic-grid-4"
            style="margin-top:16px"
          >
            ${ui.button({
              label: "التفاصيل",
              action: "trips-view-details",
              params: {
                tripId: trip.id
              },
              primary: true,
              block: true
            })}

            ${ui.iconButton({
              icon: "✎",
              action: "trips-edit",
              params: {
                tripId: trip.id
              },
              ariaLabel: "تعديل الرحلة"
            })}

            ${ui.iconButton({
              icon: "⧉",
              action: "trips-duplicate",
              params: {
                tripId: trip.id
              },
              ariaLabel: "تكرار الرحلة"
            })}

            ${ui.iconButton({
              icon: "×",
              action: "trips-delete",
              params: {
                tripId: trip.id
              },
              ariaLabel: "حذف الرحلة"
            })}
          </div>
        </div>
      </article>
    `;
  };

  const renderTripsList = (snapshot) => {
    const ui = getUI();

    if (!snapshot.filteredTrips.length) {
      return ui.empty({
        icon: "✈",
        title:
          snapshot.trips.length === 0
            ? "لا توجد رحلات بعد"
            : "لا توجد نتائج مطابقة",
        message:
          snapshot.trips.length === 0
            ? "أنشئ رحلتك الأولى وسيتم عرضها هنا."
            : "غيّر البحث أو الفلاتر لعرض نتائج أخرى.",
        action:
          snapshot.trips.length === 0
            ? {
                label: "إنشاء رحلة جديدة",
                action: "trips-new",
                primary: true
              }
            : {
                label: "مسح الفلاتر",
                action: "trips-clear-filters"
              }
      });
    }

    return `
      <p class="tic-subtitle" style="margin-bottom:12px">
        عرض ${snapshot.filteredTrips.length}
        من ${snapshot.trips.length} رحلة
      </p>

      <div class="tic-trips-list">
        ${snapshot.filteredTrips
          .map(renderTripCard)
          .join("")}
      </div>
    `;
  };

  const renderTripDetails = (trip) => {
    const ui = getUI();

    if (!trip) {
      return ui.empty({
        icon: "!",
        title: "تعذر العثور على الرحلة",
        message:
          "قد تكون الرحلة حُذفت أو لم تعد متوفرة.",
        action: {
          label: "العودة إلى الرحلات",
          action: "trips-back-to-list"
        }
      });
    }

    const status = tripStatus(trip);
    const documents = relatedDocuments(trip.id);
    const packing = relatedPacking(trip.id);
    const packed = packing.filter(
      (item) =>
        item.completed === true ||
        item.packed === true ||
        item.status === "completed"
    ).length;

    const activities =
      Array.isArray(trip.activities)
        ? trip.activities
        : [];

    const budget = number(trip.budget);
    const spent = number(trip.spent);
    const usage =
      budget > 0
        ? Math.min(
            100,
            Math.round((spent / budget) * 100)
          )
        : 0;

    const summary = ui.grid(
      [
        {
          icon: "◷",
          value: durationDays(trip),
          label: "عدد الأيام"
        },
        {
          icon: "◎",
          value: number(trip.travelers, 1),
          label: "المسافرون"
        },
        {
          icon: "◈",
          value: ui.currency(budget),
          label: "الميزانية"
        },
        {
          icon: "✓",
          value: `${packed}/${packing.length}`,
          label: "التجهيز"
        }
      ]
        .map((item) => ui.stat(item))
        .join(""),
      {
        columns: 4
      }
    );

    const information = ui.grid(
      [
        ["الدولة", trip.country || "—"],
        ["المدينة", trip.city || "—"],
        ["مطار المغادرة", trip.departureAirport || "—"],
        ["مطار الوصول", trip.arrivalAirport || "—"],
        ["شركة الطيران", trip.airline || "—"],
        ["رقم الرحلة", trip.flightNumber || "—"],
        ["الإقامة", trip.accommodation || "—"],
        ["رقم الحجز", trip.bookingReference || "—"],
        ["التنقل", trip.transport || "—"],
        ["جهة الطوارئ", trip.emergencyContact || "—"]
      ]
        .map(([label, value]) =>
          ui.info(label, value)
        )
        .join(""),
      {
        columns: 2
      }
    );

    return `
      <div data-trip-details="${escapeHTML(trip.id)}">
        ${ui.hero({
          badge:
            TYPE_LABELS[trip.tripType] ||
            "Trip Details",
          title:
            trip.title ||
            trip.destination ||
            "تفاصيل الرحلة",
          subtitle:
            trip.destination ||
            [trip.city, trip.country]
              .filter(Boolean)
              .join("، "),
          meta: [
            `${durationDays(trip)} يوم`,
            trip.startDate
              ? ui.date(trip.startDate)
              : "—",
            STATUS_LABELS[status] || status
          ],
          actions: [
            {
              label: "العودة",
              action: "trips-back-to-list"
            },
            {
              label: "تعديل الرحلة",
              action: "trips-edit",
              params: {
                tripId: trip.id
              },
              primary: true
            }
          ]
        })}

        ${ui.section({
          eyebrow: "TRIP OVERVIEW",
          title: "ملخص الرحلة",
          content: summary
        })}

        ${ui.section({
          eyebrow: "JOURNEY DETAILS",
          title: "تفاصيل السفر",
          content: information
        })}

        ${ui.section({
          eyebrow: "BUDGET",
          title: "ميزانية الرحلة",
          content: `
            <article class="tic-budget-overview">
              <small>إجمالي الميزانية</small>

              <strong>
                ${escapeHTML(ui.currency(budget))}
              </strong>

              <div class="tic-budget-breakdown">
                <div class="tic-budget-breakdown-item">
                  <small>المصروف</small>
                  <strong>
                    ${escapeHTML(ui.currency(spent))}
                  </strong>
                </div>

                <div class="tic-budget-breakdown-item">
                  <small>المتبقي</small>
                  <strong>
                    ${escapeHTML(
                      ui.currency(
                        Math.max(0, budget - spent)
                      )
                    )}
                  </strong>
                </div>

                <div class="tic-budget-breakdown-item">
                  <small>الاستخدام</small>
                  <strong>${usage}%</strong>
                </div>
              </div>

              <div style="margin-top:16px">
                ${ui.progress(usage, {
                  label: "استخدام الميزانية"
                })}
              </div>
            </article>
          `
        })}

        ${ui.section({
          eyebrow: "ACTIVITIES",
          title: "الأنشطة",
          content:
            activities.length
              ? ui.list(
                  activities.map(
                    (activity, index) => ({
                      icon: index + 1,
                      title: isObject(activity)
                        ? activity.title ||
                          activity.name ||
                          ""
                        : activity,
                      subtitle:
                        isObject(activity)
                          ? activity.description || ""
                          : ""
                    })
                  )
                )
              : ui.empty({
                  icon: "☆",
                  title: "لا توجد أنشطة",
                  message:
                    "أضف الأنشطة عند تعديل الرحلة."
                })
        })}

        ${ui.section({
          eyebrow: "READINESS",
          title: "الوثائق والتجهيز",
          content: ui.grid(
            `
              ${ui.card({
                icon: "▣",
                title: "الوثائق",
                description:
                  `${documents.length} وثيقة مرتبطة بالرحلة`,
                footer: ui.button({
                  label: "عرض الوثائق",
                  route: "more",
                  view: "documents",
                  params: {
                    tripId: trip.id
                  },
                  block: true
                })
              })}

              ${ui.card({
                icon: "✓",
                title: "قائمة التجهيز",
                description:
                  `تم تجهيز ${packed} من ${packing.length} عنصر`,
                body: ui.progress(
                  packing.length
                    ? Math.round(
                        (packed / packing.length) * 100
                      )
                    : 0,
                  {
                    label: "اكتمال التجهيز"
                  }
                ),
                footer: ui.button({
                  label: "فتح قائمة التجهيز",
                  route: "more",
                  view: "packing",
                  params: {
                    tripId: trip.id
                  },
                  block: true
                })
              })}
            `,
            {
              columns: 2
            }
          )
        })}

        ${
          trip.notes
            ? ui.section({
                eyebrow: "NOTES",
                title: "ملاحظات الرحلة",
                content: ui.card({
                  body: `
                    <p class="tic-card-text">
                      ${escapeHTML(trip.notes)}
                    </p>
                  `
                })
              })
            : ""
        }

        ${ui.section({
          eyebrow: "MANAGEMENT",
          title: "إدارة الرحلة",
          subtitle:
            "غيّر الحالة أو نفذ إجراءات الرحلة.",
          content: `
            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field">
                  <label>حالة الرحلة</label>

                  <select
                    class="tic-select"
                    data-trip-status-update
                    data-trip-id="${escapeHTML(trip.id)}"
                  >
                    ${Object.entries(STATUS_LABELS)
                      .map(
                        ([value, label]) => `
                          <option
                            value="${escapeHTML(value)}"
                            ${value === status ? "selected" : ""}
                          >
                            ${escapeHTML(label)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </div>

                <div class="tic-field">
                  <label>&nbsp;</label>

                  ${ui.button({
                    label: "حذف الرحلة",
                    action: "trips-delete",
                    params: {
                      tripId: trip.id
                    },
                    danger: true,
                    block: true
                  })}
                </div>
              </div>
            </div>
          `
        })}
      </div>
    `;
  };

  const renderPage = (snapshot) => {
    const ui = getUI();

    if (state.activeView === "details") {
      return `
        <div
          class="tic-module"
          data-page="trips"
          data-view="details"
          data-page-version="${PAGE_VERSION}"
        >
          ${renderTripDetails(snapshot.activeTrip)}
        </div>
      `;
    }

    return `
      <div
        class="tic-module"
        data-page="trips"
        data-view="list"
        data-page-version="${PAGE_VERSION}"
      >
        ${ui.hero({
          badge: "Trips Center",
          title: "رحلاتي",
          subtitle:
            "خطط لكل رحلة، تابع ميزانيتها، وجهّز تفاصيلها من مكان واحد.",
          actions: [
            {
              label: "رحلة جديدة",
              action: "trips-new",
              primary: true,
              icon: "＋"
            }
          ]
        })}

        ${ui.section({
          eyebrow: "OVERVIEW",
          title: "ملخص الرحلات",
          subtitle:
            "نظرة سريعة على حالة جميع رحلاتك.",
          content: renderStatistics(snapshot)
        })}

        ${ui.section({
          eyebrow: "ALL JOURNEYS",
          title: "جميع الرحلات",
          subtitle:
            "ابحث وفلتر ورتب الرحلات بسهولة.",
          content: `
            ${renderFilters()}
            <div style="margin-top:16px">
              ${renderTripsList(snapshot)}
            </div>
          `
        })}
      </div>
    `;
  };

  const applyInputFilters = () => {
    if (!state.container) return;

    const searchInput =
      state.container.querySelector(
        "[data-trips-search]"
      );

    const statusSelect =
      state.container.querySelector(
        "[data-trips-filter-status]"
      );

    const typeSelect =
      state.container.querySelector(
        "[data-trips-filter-type]"
      );

    const sortSelect =
      state.container.querySelector(
        "[data-trips-sort]"
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

    statusSelect?.addEventListener(
      "change",
      (event) => {
        state.filters.status =
          event.target.value;

        refresh();
      }
    );

    typeSelect?.addEventListener(
      "change",
      (event) => {
        state.filters.type =
          event.target.value;

        refresh();
      }
    );

    sortSelect?.addEventListener(
      "change",
      (event) => {
        state.filters.sort =
          event.target.value;

        refresh();
      }
    );

    const statusUpdate =
      state.container.querySelector(
        "[data-trip-status-update]"
      );

    statusUpdate?.addEventListener(
      "change",
      async (event) => {
        const tripId =
          event.target.getAttribute(
            "data-trip-id"
          );

        const status =
          event.target.value;

        await updateTrip(tripId, {
          status
        });

        getUI()?.toast?.(
          "تم تحديث حالة الرحلة.",
          "success"
        );

        emit("status-updated", {
          tripId,
          status
        });

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

    applyInputFilters();

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

      state.actionUnsubscribers.push(
        ui.registerAction(name, handler)
      );
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

    register(
      "trips-view-details",
      ({ params }) => {
        const tripId =
          params.tripId || params.id;

        if (!tripId) return false;

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

    register("trips-back-to-list", () => {
      state.activeView = "list";
      state.activeTripId = null;

      refresh();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      return true;
    });

    register("trips-edit", ({ params }) => {
      const tripId =
        params.tripId || params.id;

      if (!tripId) return false;

      const tripForm = getTripForm();

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
      "trips-duplicate",
      async ({ params }) => {
        const tripId =
          params.tripId || params.id;

        const trip = findTrip(tripId);

        if (!trip) {
          ui.toast(
            "تعذر العثور على الرحلة.",
            "error"
          );

          return false;
        }

        const confirmed =
          await ui.confirm({
            title: "تكرار الرحلة",
            message:
              `سيتم إنشاء نسخة جديدة من رحلة "${
                trip.title ||
                trip.destination
              }".`,
            confirmLabel: "إنشاء نسخة",
            cancelLabel: "إلغاء"
          });

        if (confirmed !== true) {
          return false;
        }

        try {
          ui.showLoader(
            "جاري إنشاء نسخة من الرحلة..."
          );

          const duplicate =
            await duplicateTripInStore(
              tripId
            );

          ui.toast(
            "تم إنشاء نسخة جديدة.",
            "success"
          );

          state.activeView = "list";
          state.activeTripId = null;

          refresh();

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

          ui.toast(
            "تعذر تكرار الرحلة.",
            "error"
          );

          return false;
        } finally {
          ui.hideLoader();
        }
      }
    );

    register(
      "trips-delete",
      async ({ params }) => {
        const tripId =
          params.tripId || params.id;

        const trip = findTrip(tripId);

        if (!trip) {
          ui.toast(
            "تعذر العثور على الرحلة.",
            "error"
          );

          return false;
        }

        const confirmed =
          await ui.confirm({
            title: "حذف الرحلة",
            message:
              `سيتم حذف رحلة "${
                trip.title ||
                trip.destination
              }" نهائياً.`,
            confirmLabel: "حذف الرحلة",
            cancelLabel: "إلغاء",
            danger: true
          });

        if (confirmed !== true) {
          return false;
        }

        try {
          ui.showLoader(
            "جاري حذف الرحلة..."
          );

          await deleteTripFromStore(tripId);

          ui.toast(
            "تم حذف الرحلة.",
            "success"
          );

          state.activeView = "list";
          state.activeTripId = null;

          refresh();

          emit("deleted", {
            tripId
          });

          return true;
        } catch (error) {
          console.error(
            "TIC Trips delete error:",
            error
          );

          ui.toast(
            "تعذر حذف الرحلة.",
            "error"
          );

          return false;
        } finally {
          ui.hideLoader();
        }
      }
    );

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

      const params = context.params || {};

      if (params.tripId) {
        state.activeTripId = params.tripId;
      }

      if (
        params.view === "details" &&
        params.tripId
      ) {
        state.activeView = "details";
      } else if (params.view === "list") {
        state.activeView = "list";
        state.activeTripId = null;
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

      const params = context.params || {};

      if (params.tripId) {
        state.activeTripId = params.tripId;
      }

      state.activeView =
        params.view === "details" &&
        params.tripId
          ? "details"
          : "list";

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();

      container.innerHTML =
        renderPage(snapshot);

      applyInputFilters();

      emit("mounted", {
        view: state.activeView,
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

      applyInputFilters();

      return true;
    },

    unmount() {
      state.mounted = false;
      state.container = null;

      emit("unmounted", {
        view: state.activeView,
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

    openList() {
      state.activeTripId = null;
      state.activeView = "list";

      return refresh();
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

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.activeView = "list";
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
        activeTripId: state.activeTripId,
        filters: clone(state.filters),
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
