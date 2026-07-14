/* =========================================================
   Travel Intelligence Center
   Trips Page Module V1.0.0

   File Path:
   js/pages/trips.js

   Purpose:
   - Provides the complete trip management center.
   - Displays trip statistics, search, filters, sorting,
     trip cards, trip details, status updates, duplication,
     deletion, and direct access to trip editing.
   - Reads and writes through the central TIC Store.
   - Integrates with TIC UI, TIC Router, and Trip Form.
   - Registers itself as the "trips" page module.

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

  const Config = window.TICConfig || window.TIC?.Config || {};
  const PAGE_ID = "trips";
  const PAGE_VERSION = "1.0.0";

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

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const normalizeText = (value) =>
    String(value ?? "").trim();

  const normalizeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const toDate = (value) => {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  };

  const startOfDay = (value) => {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const createId = () =>
    `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
        console.error("TIC Trips Page subscriber error:", error);
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

    if (!store) {
      return {};
    }

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
      (trip) => String(trip.id) === String(tripId)
    ) || null;

  const saveTrips = (trips) => {
    const store = getStore();

    if (!store) {
      throw new Error("TIC Trips Page Error: store is not available.");
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
      "TIC Trips Page Error: store does not support trip persistence."
    );
  };

  const updateTrip = async (tripId, patch) => {
    const store = getStore();
    const existing = findTrip(tripId);

    if (!existing) {
      return null;
    }

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
      (trip) => String(trip.id) === String(tripId)
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

    const trips = getTrips().filter(
      (trip) => String(trip.id) !== String(tripId)
    );

    saveTrips(trips);
    return true;
  };

  const duplicateTripInStore = async (tripId) => {
    const original = findTrip(tripId);

    if (!original) {
      return null;
    }

    const now = new Date().toISOString();

    const duplicate = {
      ...clone(original),
      id: createId(),
      title: `${original.title || original.destination || "رحلة"} - نسخة`,
      status: "planning",
      spent: 0,
      featured: false,
      createdAt: now,
      updatedAt: now
    };

    const store = getStore();

    if (typeof store?.addTrip === "function") {
      const result = await store.addTrip(duplicate);
      return result || duplicate;
    }

    if (typeof store?.createTrip === "function") {
      const result = await store.createTrip(duplicate);
      return result || duplicate;
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

  const calculateDuration = (trip) => {
    if (normalizeNumber(trip.durationDays) > 0) {
      return normalizeNumber(trip.durationDays);
    }

    const start = toDate(trip.startDate);
    const end = toDate(trip.endDate);

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

  const calculateDaysUntil = (trip) => {
    const start = toDate(trip.startDate);

    if (!start) {
      return null;
    }

    return Math.ceil(
      (startOfDay(start).getTime() -
        startOfDay(new Date()).getTime()) /
        86400000
    );
  };

  const getTripStatus = (trip) => {
    const rawStatus = normalizeText(trip.status).toLowerCase();

    if (rawStatus) {
      return rawStatus;
    }

    const now = startOfDay(new Date());
    const start = toDate(trip.startDate);
    const end = toDate(trip.endDate);

    if (start && end && now >= startOfDay(start) && now <= startOfDay(end)) {
      return "ongoing";
    }

    if (end && startOfDay(end) < now) {
      return "completed";
    }

    return "planning";
  };

  const getFilteredTrips = (trips) => {
    const search = normalizeText(state.filters.search).toLowerCase();

    let result = trips.filter((trip) => {
      const status = getTripStatus(trip);
      const type = normalizeText(trip.tripType).toLowerCase();

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

      return matchesSearch && matchesStatus && matchesType;
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
          return normalizeNumber(b.budget) - normalizeNumber(a.budget);

        case "title-asc":
          return normalizeText(a.title).localeCompare(
            normalizeText(b.title),
            "ar"
          );

        case "start-asc":
        default:
          return (
            (toDate(a.startDate)?.getTime() || Number.MAX_SAFE_INTEGER) -
            (toDate(b.startDate)?.getTime() || Number.MAX_SAFE_INTEGER)
          );
      }
    });

    return result;
  };

  const getStatistics = (trips) => {
    const total = trips.length;
    const upcoming = trips.filter((trip) =>
      ["planning", "booked", "ready"].includes(getTripStatus(trip))
    ).length;

    const ongoing = trips.filter(
      (trip) => getTripStatus(trip) === "ongoing"
    ).length;

    const completed = trips.filter(
      (trip) => getTripStatus(trip) === "completed"
    ).length;

    const totalBudget = trips.reduce(
      (totalValue, trip) =>
        totalValue + normalizeNumber(trip.budget),
      0
    );

    const totalSpent = trips.reduce(
      (totalValue, trip) =>
        totalValue + normalizeNumber(trip.spent),
      0
    );

    return {
      total,
      upcoming,
      ongoing,
      completed,
      totalBudget,
      totalSpent
    };
  };

  const getRelatedDocuments = (tripId) => {
    const snapshot = getStoreState();
    const documents = Array.isArray(snapshot.documents)
      ? snapshot.documents
      : [];

    return documents.filter(
      (documentItem) =>
        String(documentItem.tripId || "") === String(tripId)
    );
  };

  const getRelatedPacking = (tripId) => {
    const snapshot = getStoreState();
    const packing = snapshot.packing;

    if (Array.isArray(packing)) {
      return packing.filter(
        (item) => String(item.tripId || "") === String(tripId)
      );
    }

    if (isObject(packing)) {
      if (Array.isArray(packing.items)) {
        return packing.items.filter(
          (item) => String(item.tripId || "") === String(tripId)
        );
      }

      if (Array.isArray(packing[tripId])) {
        return packing[tripId];
      }
    }

    return [];
  };

  const buildSnapshot = () => {
    const trips = getTrips();
    const filteredTrips = getFilteredTrips(trips);
    const activeTrip = state.activeTripId
      ? trips.find(
          (trip) => String(trip.id) === String(state.activeTripId)
        ) || null
      : null;

    const snapshot = {
      trips,
      filteredTrips,
      activeTrip,
      statistics: getStatistics(trips),
      filters: clone(state.filters),
      activeView: state.activeView
    };

    state.lastSnapshot = snapshot;
    return snapshot;
  };

  const renderStatistics = (snapshot) => {
    const ui = getUI();
    const statistics = snapshot.statistics;

    const cards = [
      {
        icon: "✈",
        value: statistics.total,
        label: "إجمالي الرحلات",
        subtitle: "كل الرحلات المسجلة"
      },
      {
        icon: "◷",
        value: statistics.upcoming,
        label: "رحلات قادمة",
        subtitle: "قيد التخطيط أو الحجز"
      },
      {
        icon: "◎",
        value: statistics.ongoing,
        label: "رحلات جارية",
        subtitle: "تحدث الآن"
      },
      {
        icon: "✓",
        value: statistics.completed,
        label: "رحلات مكتملة",
        subtitle: "ضمن سجل السفر"
      }
    ];

    const content = cards
      .map((card) =>
        ui?.stat
          ? ui.stat(card)
          : `
            <article class="tic-stat">
              <strong>${escapeHTML(card.value)}</strong>
              <span>${escapeHTML(card.label)}</span>
            </article>
          `
      )
      .join("");

    return ui?.grid
      ? ui.grid(content, {
          columns: 4,
          className: "trips-statistics"
        })
      : `<div class="tic-grid tic-grid--4">${content}</div>`;
  };

  const renderFilters = () => {
    const selected = (value, current) =>
      value === current ? "selected" : "";

    return `
      <section class="trips-toolbar">
        <div class="trips-toolbar__search">
          <span class="trips-toolbar__search-icon" aria-hidden="true">⌕</span>

          <input
            type="search"
            class="tic-field__control"
            data-trips-search
            value="${escapeHTML(state.filters.search)}"
            placeholder="ابحث باسم الرحلة أو الوجهة..."
            aria-label="البحث في الرحلات"
          >
        </div>

        <div class="trips-toolbar__filters">
          <select
            class="tic-field__control"
            data-trips-filter-status
            aria-label="فلترة حسب الحالة"
          >
            <option value="all" ${selected("all", state.filters.status)}>
              كل الحالات
            </option>
            ${Object.entries(STATUS_LABELS)
              .map(
                ([value, label]) => `
                  <option
                    value="${escapeHTML(value)}"
                    ${selected(value, state.filters.status)}
                  >
                    ${escapeHTML(label)}
                  </option>
                `
              )
              .join("")}
          </select>

          <select
            class="tic-field__control"
            data-trips-filter-type
            aria-label="فلترة حسب النوع"
          >
            <option value="all" ${selected("all", state.filters.type)}>
              كل الأنواع
            </option>
            ${Object.entries(TYPE_LABELS)
              .map(
                ([value, label]) => `
                  <option
                    value="${escapeHTML(value)}"
                    ${selected(value, state.filters.type)}
                  >
                    ${escapeHTML(label)}
                  </option>
                `
              )
              .join("")}
          </select>

          <select
            class="tic-field__control"
            data-trips-sort
            aria-label="ترتيب الرحلات"
          >
            ${SORT_OPTIONS.map(
              (option) => `
                <option
                  value="${escapeHTML(option.value)}"
                  ${selected(option.value, state.filters.sort)}
                >
                  ${escapeHTML(option.label)}
                </option>
              `
            ).join("")}
          </select>

          <button
            type="button"
            class="button button--secondary"
            data-action="trips-clear-filters"
          >
            مسح الفلاتر
          </button>
        </div>
      </section>
    `;
  };

  const renderTripCard = (trip) => {
    const ui = getUI();
    const status = getTripStatus(trip);
    const statusLabel = STATUS_LABELS[status] || status;
    const statusTone = STATUS_TONES[status] || "neutral";
    const daysUntil = calculateDaysUntil(trip);
    const duration = calculateDuration(trip);
    const budget = normalizeNumber(trip.budget);
    const spent = normalizeNumber(trip.spent);
    const usage =
      budget > 0
        ? Math.min(100, Math.round((spent / budget) * 100))
        : 0;

    const countdown =
      daysUntil === null
        ? "الموعد غير محدد"
        : daysUntil === 0
          ? "السفر اليوم"
          : daysUntil === 1
            ? "متبقي يوم"
            : daysUntil > 1
              ? `متبقي ${daysUntil} يوم`
              : status === "completed"
                ? "رحلة مكتملة"
                : "بدأت الرحلة";

    return `
      <article
        class="trip-card"
        data-trip-card="${escapeHTML(trip.id)}"
      >
        <header class="trip-card__header">
          <div class="trip-card__heading">
            <span class="trip-card__eyebrow">
              ${escapeHTML(TYPE_LABELS[trip.tripType] || "رحلة")}
            </span>

            <h3 class="trip-card__title">
              ${escapeHTML(
                trip.title ||
                trip.destination ||
                "رحلة بدون اسم"
              )}
            </h3>

            <p class="trip-card__destination">
              ${escapeHTML(
                trip.destination ||
                [trip.city, trip.country].filter(Boolean).join("، ")
              )}
            </p>
          </div>

          ${
            ui?.status
              ? ui.status(statusLabel, {
                  value: status,
                  tone: statusTone
                })
              : `<span class="tic-badge">${escapeHTML(statusLabel)}</span>`
          }
        </header>

        <div class="trip-card__countdown">
          <strong>${escapeHTML(countdown)}</strong>
          <span>
            ${
              trip.startDate
                ? escapeHTML(ui?.date ? ui.date(trip.startDate) : trip.startDate)
                : "—"
            }
            —
            ${
              trip.endDate
                ? escapeHTML(ui?.date ? ui.date(trip.endDate) : trip.endDate)
                : "—"
            }
          </span>
        </div>

        <div class="trip-card__details">
          <div class="trip-card__detail">
            <span>المدة</span>
            <strong>${duration || 0} يوم</strong>
          </div>

          <div class="trip-card__detail">
            <span>المسافرون</span>
            <strong>${normalizeNumber(trip.travelers, 1)}</strong>
          </div>

          <div class="trip-card__detail">
            <span>الميزانية</span>
            <strong>
              ${escapeHTML(
                ui?.currency ? ui.currency(budget) : budget
              )}
            </strong>
          </div>
        </div>

        ${
          ui?.progress
            ? ui.progress(usage, {
                label: "استخدام الميزانية",
                compact: true,
                hint: `${ui.currency(spent)} مصروف`
              })
            : ""
        }

        <footer class="trip-card__footer">
          ${
            ui?.button
              ? ui.button({
                  label: "عرض التفاصيل",
                  action: "trips-view-details",
                  params: { tripId: trip.id },
                  primary: true,
                  small: true
                })
              : ""
          }

          ${
            ui?.iconButton
              ? ui.iconButton({
                  icon: "✎",
                  action: "trips-edit",
                  params: { tripId: trip.id },
                  ariaLabel: "تعديل الرحلة"
                })
              : ""
          }

          ${
            ui?.iconButton
              ? ui.iconButton({
                  icon: "⧉",
                  action: "trips-duplicate",
                  params: { tripId: trip.id },
                  ariaLabel: "تكرار الرحلة"
                })
              : ""
          }

          ${
            ui?.iconButton
              ? ui.iconButton({
                  icon: "×",
                  action: "trips-delete",
                  params: { tripId: trip.id },
                  tone: "danger",
                  ariaLabel: "حذف الرحلة"
                })
              : ""
          }
        </footer>
      </article>
    `;
  };

  const renderTripsList = (snapshot) => {
    const ui = getUI();

    if (snapshot.filteredTrips.length === 0) {
      return ui?.empty
        ? ui.empty({
            icon: "✈",
            title:
              snapshot.trips.length === 0
                ? "لا توجد رحلات بعد"
                : "لا توجد نتائج مطابقة",
            message:
              snapshot.trips.length === 0
                ? "أنشئ رحلتك الأولى وسيتم عرضها هنا."
                : "غيّر البحث أو الفلاتر لعرض رحلات أخرى.",
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
          })
        : "";
    }

    const cards = snapshot.filteredTrips
      .map(renderTripCard)
      .join("");

    return `
      <div class="trips-list-summary">
        <span>
          عرض ${snapshot.filteredTrips.length} من ${snapshot.trips.length} رحلة
        </span>
      </div>

      ${
        ui?.grid
          ? ui.grid(cards, {
              columns: 2,
              className: "trips-grid"
            })
          : `<div class="tic-grid tic-grid--2 trips-grid">${cards}</div>`
      }
    `;
  };

  const renderTripDetails = (trip) => {
    const ui = getUI();

    if (!trip) {
      return ui?.empty
        ? ui.empty({
            icon: "!",
            title: "تعذر العثور على الرحلة",
            message: "قد تكون الرحلة حُذفت أو لم تعد متوفرة.",
            action: {
              label: "العودة إلى الرحلات",
              action: "trips-back-to-list"
            }
          })
        : "";
    }

    const status = getTripStatus(trip);
    const documents = getRelatedDocuments(trip.id);
    const packing = getRelatedPacking(trip.id);
    const packed = packing.filter(
      (item) =>
        item.completed === true ||
        item.packed === true ||
        item.status === "completed"
    ).length;

    const activities = Array.isArray(trip.activities)
      ? trip.activities
      : [];

    const budget = normalizeNumber(trip.budget);
    const spent = normalizeNumber(trip.spent);
    const budgetUsage =
      budget > 0
        ? Math.min(100, Math.round((spent / budget) * 100))
        : 0;

    return `
      <div class="trip-details" data-trip-details="${escapeHTML(trip.id)}">
        <section class="trip-details__hero">
          <div class="trip-details__hero-main">
            <button
              type="button"
              class="trip-details__back"
              data-action="trips-back-to-list"
            >
              ← العودة إلى الرحلات
            </button>

            <span class="trip-details__eyebrow">
              ${escapeHTML(TYPE_LABELS[trip.tripType] || "رحلة")}
            </span>

            <h1 class="trip-details__title">
              ${escapeHTML(
                trip.title ||
                trip.destination ||
                "تفاصيل الرحلة"
              )}
            </h1>

            <p class="trip-details__destination">
              ${escapeHTML(
                trip.destination ||
                [trip.city, trip.country].filter(Boolean).join("، ")
              )}
            </p>

            <div class="trip-details__hero-actions">
              ${
                ui?.button
                  ? ui.button({
                      label: "تعديل الرحلة",
                      action: "trips-edit",
                      params: { tripId: trip.id },
                      primary: true
                    })
                  : ""
              }

              ${
                ui?.button
                  ? ui.button({
                      label: "تكرار الرحلة",
                      action: "trips-duplicate",
                      params: { tripId: trip.id }
                    })
                  : ""
              }
            </div>
          </div>

          <div class="trip-details__hero-side">
            ${
              ui?.status
                ? ui.status(
                    STATUS_LABELS[status] || status,
                    {
                      value: status,
                      tone: STATUS_TONES[status]
                    }
                  )
                : ""
            }

            <strong>
              ${calculateDuration(trip)} يوم
            </strong>

            <span>
              ${
                trip.startDate
                  ? escapeHTML(ui?.date ? ui.date(trip.startDate) : trip.startDate)
                  : "—"
              }
              —
              ${
                trip.endDate
                  ? escapeHTML(ui?.date ? ui.date(trip.endDate) : trip.endDate)
                  : "—"
              }
            </span>
          </div>
        </section>

        <section class="tic-section">
          <header class="tic-section__header">
            <div class="tic-section__heading">
              <p class="tic-section__eyebrow">Trip Overview</p>
              <h2 class="tic-section__title">ملخص الرحلة</h2>
            </div>
          </header>

          <div class="tic-section__body">
            <div class="tic-grid tic-grid--4 trip-details__stats">
              ${
                ui?.stat
                  ? ui.stat({
                      icon: "◷",
                      value: calculateDuration(trip),
                      label: "عدد الأيام"
                    })
                  : ""
              }

              ${
                ui?.stat
                  ? ui.stat({
                      icon: "◎",
                      value: normalizeNumber(trip.travelers, 1),
                      label: "المسافرون"
                    })
                  : ""
              }

              ${
                ui?.stat
                  ? ui.stat({
                      icon: "◈",
                      value: ui.currency(budget),
                      label: "الميزانية"
                    })
                  : ""
              }

              ${
                ui?.stat
                  ? ui.stat({
                      icon: "✓",
                      value: `${packed}/${packing.length}`,
                      label: "التجهيز"
                    })
                  : ""
              }
            </div>
          </div>
        </section>

        <section class="tic-section">
          <header class="tic-section__header">
            <div class="tic-section__heading">
              <p class="tic-section__eyebrow">Journey Details</p>
              <h2 class="tic-section__title">تفاصيل السفر</h2>
            </div>
          </header>

          <div class="tic-section__body">
            <div class="tic-grid tic-grid--2 trip-details__information">
              ${ui?.info ? ui.info("الدولة", trip.country || "—") : ""}
              ${ui?.info ? ui.info("المدينة", trip.city || "—") : ""}
              ${ui?.info ? ui.info("مطار المغادرة", trip.departureAirport || "—") : ""}
              ${ui?.info ? ui.info("مطار الوصول", trip.arrivalAirport || "—") : ""}
              ${ui?.info ? ui.info("شركة الطيران", trip.airline || "—") : ""}
              ${ui?.info ? ui.info("رقم الرحلة", trip.flightNumber || "—") : ""}
              ${ui?.info ? ui.info("الإقامة", trip.accommodation || "—") : ""}
              ${ui?.info ? ui.info("رقم الحجز", trip.bookingReference || "—") : ""}
              ${ui?.info ? ui.info("التنقل", trip.transport || "—") : ""}
              ${ui?.info ? ui.info("جهة الطوارئ", trip.emergencyContact || "—") : ""}
            </div>
          </div>
        </section>

        <section class="tic-section">
          <header class="tic-section__header">
            <div class="tic-section__heading">
              <p class="tic-section__eyebrow">Budget</p>
              <h2 class="tic-section__title">ميزانية الرحلة</h2>
            </div>
          </header>

          <div class="tic-section__body">
            <article class="trip-details__budget">
              <div class="trip-details__budget-values">
                <div>
                  <span>الميزانية الإجمالية</span>
                  <strong>${escapeHTML(ui?.currency ? ui.currency(budget) : budget)}</strong>
                </div>

                <div>
                  <span>المصروف</span>
                  <strong>${escapeHTML(ui?.currency ? ui.currency(spent) : spent)}</strong>
                </div>

                <div>
                  <span>المتبقي</span>
                  <strong>${escapeHTML(
                    ui?.currency
                      ? ui.currency(Math.max(0, budget - spent))
                      : Math.max(0, budget - spent)
                  )}</strong>
                </div>
              </div>

              ${
                ui?.progress
                  ? ui.progress(budgetUsage, {
                      label: "استخدام الميزانية",
                      hint: `${budgetUsage}% مستخدم`
                    })
                  : ""
              }

              ${
                ui?.button
                  ? ui.button({
                      label: "فتح مركز الميزانية",
                      route: "budget",
                      view: "trip",
                      params: { tripId: trip.id }
                    })
                  : ""
              }
            </article>
          </div>
        </section>

        <section class="tic-section">
          <header class="tic-section__header">
            <div class="tic-section__heading">
              <p class="tic-section__eyebrow">Activities</p>
              <h2 class="tic-section__title">الأنشطة</h2>
            </div>
          </header>

          <div class="tic-section__body">
            ${
              activities.length
                ? `
                  <div class="tic-list tic-list--divided">
                    ${activities
                      .map(
                        (activity, index) => `
                          <div class="tic-list-item">
                            <div class="tic-list-item__icon">
                              <span>${index + 1}</span>
                            </div>

                            <div class="tic-list-item__content">
                              <strong class="tic-list-item__title">
                                ${escapeHTML(
                                  isObject(activity)
                                    ? activity.title || activity.name || ""
                                    : activity
                                )}
                              </strong>

                              ${
                                isObject(activity) && activity.description
                                  ? `
                                    <p class="tic-list-item__subtitle">
                                      ${escapeHTML(activity.description)}
                                    </p>
                                  `
                                  : ""
                              }
                            </div>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                `
                : ui?.empty
                  ? ui.empty({
                      icon: "☆",
                      title: "لا توجد أنشطة",
                      message: "أضف الأنشطة عند تعديل الرحلة."
                    })
                  : ""
            }
          </div>
        </section>

        <section class="tic-section">
          <header class="tic-section__header">
            <div class="tic-section__heading">
              <p class="tic-section__eyebrow">Readiness</p>
              <h2 class="tic-section__title">الوثائق والتجهيز</h2>
            </div>
          </header>

          <div class="tic-section__body">
            <div class="tic-grid tic-grid--2">
              <article class="tic-card">
                <div class="tic-card__content">
                  <h3 class="tic-card__title">الوثائق</h3>
                  <p class="tic-card__description">
                    ${documents.length} وثيقة مرتبطة بالرحلة
                  </p>

                  ${
                    ui?.button
                      ? ui.button({
                          label: "عرض الوثائق",
                          route: "more",
                          view: "documents",
                          params: { tripId: trip.id },
                          block: true
                        })
                      : ""
                  }
                </div>
              </article>

              <article class="tic-card">
                <div class="tic-card__content">
                  <h3 class="tic-card__title">قائمة التجهيز</h3>
                  <p class="tic-card__description">
                    تم تجهيز ${packed} من ${packing.length} عنصر
                  </p>

                  ${
                    ui?.progress
                      ? ui.progress(
                          packing.length
                            ? Math.round((packed / packing.length) * 100)
                            : 0,
                          {
                            label: "اكتمال التجهيز",
                            compact: true
                          }
                        )
                      : ""
                  }

                  ${
                    ui?.button
                      ? ui.button({
                          label: "فتح قائمة التجهيز",
                          route: "more",
                          view: "packing",
                          params: { tripId: trip.id },
                          block: true
                        })
                      : ""
                  }
                </div>
              </article>
            </div>
          </div>
        </section>

        ${
          trip.notes
            ? `
              <section class="tic-section">
                <header class="tic-section__header">
                  <div class="tic-section__heading">
                    <p class="tic-section__eyebrow">Notes</p>
                    <h2 class="tic-section__title">ملاحظات الرحلة</h2>
                  </div>
                </header>

                <div class="tic-section__body">
                  <article class="tic-card">
                    <div class="tic-card__content">
                      <p class="tic-card__description">
                        ${escapeHTML(trip.notes)}
                      </p>
                    </div>
                  </article>
                </div>
              </section>
            `
            : ""
        }

        <section class="trip-details__danger-zone">
          <div>
            <h2>إدارة الرحلة</h2>
            <p>
              يمكنك تغيير الحالة أو حذف الرحلة نهائياً.
            </p>
          </div>

          <div class="trip-details__danger-actions">
            <select
              class="tic-field__control"
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

            ${
              ui?.button
                ? ui.button({
                    label: "حذف الرحلة",
                    action: "trips-delete",
                    params: { tripId: trip.id },
                    danger: true
                  })
                : ""
            }
          </div>
        </section>
      </div>
    `;
  };

  const renderPage = (snapshot) => {
    const ui = getUI();

    if (state.activeView === "details") {
      return `
        <div
          class="trips-page"
          data-page="trips"
          data-view="details"
          data-page-version="${PAGE_VERSION}"
        >
          ${renderTripDetails(snapshot.activeTrip)}
        </div>
      `;
    }

    const hero = ui?.hero
      ? ui.hero({
          badge: "Trips Center",
          eyebrow: "إدارة السفر",
          title: "رحلاتي",
          subtitle:
            "خطط لكل رحلة، تابع ميزانيتها، وجهز تفاصيلها من مكان واحد.",
          actions: [
            {
              label: "رحلة جديدة",
              action: "trips-new",
              primary: true,
              icon: "＋"
            }
          ]
        })
      : "";

    const statisticsSection = ui?.section
      ? ui.section({
          eyebrow: "Overview",
          title: "ملخص الرحلات",
          subtitle: "نظرة سريعة على حالة جميع رحلاتك.",
          content: renderStatistics(snapshot)
        })
      : renderStatistics(snapshot);

    const tripsSection = ui?.section
      ? ui.section({
          eyebrow: "All Journeys",
          title: "جميع الرحلات",
          subtitle:
            "ابحث وفلتر ورتب الرحلات حسب احتياجك.",
          content: `
            ${renderFilters()}
            ${renderTripsList(snapshot)}
          `
        })
      : `
        ${renderFilters()}
        ${renderTripsList(snapshot)}
      `;

    return `
      <div
        class="trips-page"
        data-page="trips"
        data-view="list"
        data-page-version="${PAGE_VERSION}"
      >
        ${hero}

        <div class="trips-page__content">
          ${statisticsSection}
          ${tripsSection}
        </div>
      </div>
    `;
  };

  const applyInputFilters = () => {
    if (!state.container) {
      return;
    }

    const searchInput = state.container.querySelector(
      "[data-trips-search]"
    );

    const statusSelect = state.container.querySelector(
      "[data-trips-filter-status]"
    );

    const typeSelect = state.container.querySelector(
      "[data-trips-filter-type]"
    );

    const sortSelect = state.container.querySelector(
      "[data-trips-sort]"
    );

    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        state.filters.search = event.target.value;
        refresh({ preserveFocus: true });
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener("change", (event) => {
        state.filters.status = event.target.value;
        refresh();
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener("change", (event) => {
        state.filters.type = event.target.value;
        refresh();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", (event) => {
        state.filters.sort = event.target.value;
        refresh();
      });
    }

    const statusUpdate = state.container.querySelector(
      "[data-trip-status-update]"
    );

    if (statusUpdate) {
      statusUpdate.addEventListener("change", async (event) => {
        const tripId = event.target.getAttribute("data-trip-id");
        const status = event.target.value;

        await updateTrip(tripId, { status });

        getUI()?.toast?.(
          "تم تحديث حالة الرحلة.",
          "success"
        );

        emit("status-updated", {
          tripId,
          status
        });

        refresh();
      });
    }
  };

  const refresh = (options = {}) => {
    if (!state.container || !state.mounted) {
      return false;
    }

    const activeElement = document.activeElement;
    const restoreSearchFocus =
      options.preserveFocus === true &&
      activeElement?.matches?.("[data-trips-search]");

    const cursorPosition =
      restoreSearchFocus &&
      typeof activeElement.selectionStart === "number"
        ? activeElement.selectionStart
        : null;

    const snapshot = buildSnapshot();
    state.container.innerHTML = renderPage(snapshot);
    applyInputFilters();

    if (restoreSearchFocus) {
      const nextSearchInput = state.container.querySelector(
        "[data-trips-search]"
      );

      if (nextSearchInput) {
        nextSearchInput.focus();

        if (cursorPosition !== null) {
          nextSearchInput.setSelectionRange(
            cursorPosition,
            cursorPosition
          );
        }
      }
    }

    emit("refreshed", {
      view: state.activeView,
      tripCount: snapshot.filteredTrips.length,
      activeTripId: state.activeTripId
    });

    return true;
  };

  const registerActions = () => {
    const ui = getUI();

    if (!ui || typeof ui.registerAction !== "function") {
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

    register("trips-new", () => {
      const tripForm = getTripForm();

      if (tripForm?.openCreate) {
        return tripForm.openCreate();
      }

      return getRouter()?.go?.("trip-form", {
        params: { mode: "create" },
        source: "trips-new"
      });
    });

    register("trips-view-details", ({ params }) => {
      const tripId = params.tripId || params.id;

      if (!tripId) {
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
    });

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
      const tripId = params.tripId || params.id;

      if (!tripId) {
        return false;
      }

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

    register("trips-duplicate", async ({ params }) => {
      const tripId = params.tripId || params.id;
      const trip = findTrip(tripId);

      if (!trip) {
        getUI()?.toast?.(
          "تعذر العثور على الرحلة المطلوبة.",
          "error"
        );

        return false;
      }

      const confirmed = await getUI()?.confirm?.({
        title: "تكرار الرحلة",
        message:
          `سيتم إنشاء نسخة جديدة من رحلة "${trip.title || trip.destination}".`,
        confirmLabel: "إنشاء نسخة",
        cancelLabel: "إلغاء"
      });

      if (confirmed !== true) {
        return false;
      }

      try {
        getUI()?.showLoader?.("جاري إنشاء نسخة من الرحلة...");

        const duplicate = await duplicateTripInStore(tripId);

        getUI()?.toast?.(
          "تم إنشاء نسخة جديدة من الرحلة.",
          "success"
        );

        emit("duplicated", {
          sourceTripId: tripId,
          duplicateTripId: duplicate?.id || null
        });

        state.activeView = "list";
        state.activeTripId = null;
        refresh();

        return duplicate;
      } catch (error) {
        console.error("TIC Trips duplicate error:", error);

        getUI()?.toast?.(
          "تعذر تكرار الرحلة.",
          "error"
        );

        return false;
      } finally {
        getUI()?.hideLoader?.();
      }
    });

    register("trips-delete", async ({ params }) => {
      const tripId = params.tripId || params.id;
      const trip = findTrip(tripId);

      if (!trip) {
        getUI()?.toast?.(
          "تعذر العثور على الرحلة المطلوبة.",
          "error"
        );

        return false;
      }

      const confirmed = await getUI()?.confirm?.({
        title: "حذف الرحلة",
        message:
          `سيتم حذف رحلة "${trip.title || trip.destination}" نهائياً.`,
        confirmLabel: "حذف الرحلة",
        cancelLabel: "إلغاء",
        danger: true
      });

      if (confirmed !== true) {
        return false;
      }

      try {
        getUI()?.showLoader?.("جاري حذف الرحلة...");

        await deleteTripFromStore(tripId);

        getUI()?.toast?.(
          "تم حذف الرحلة.",
          "success"
        );

        emit("deleted", {
          tripId
        });

        state.activeView = "list";
        state.activeTripId = null;
        refresh();

        return true;
      } catch (error) {
        console.error("TIC Trips delete error:", error);

        getUI()?.toast?.(
          "تعذر حذف الرحلة.",
          "error"
        );

        return false;
      } finally {
        getUI()?.hideLoader?.();
      }
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

      if (params.view === "details" && params.tripId) {
        state.activeView = "details";
      } else if (params.view === "list") {
        state.activeView = "list";
        state.activeTripId = null;
      }

      return renderPage(buildSnapshot());
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(context.container);

      if (!container) {
        throw new Error(
          "TIC Trips Page Error: route container was not found."
        );
      }

      const params = context.params || {};

      if (params.tripId) {
        state.activeTripId = params.tripId;
      }

      state.activeView =
        params.view === "details" && params.tripId
          ? "details"
          : "list";

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();
      container.innerHTML = renderPage(snapshot);
      applyInputFilters();

      emit("mounted", {
        view: state.activeView,
        activeTripId: state.activeTripId,
        tripCount: snapshot.trips.length
      });

      return container;
    },

    afterEnter(context = {}) {
      const container = resolveContainer(context.container);

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
      return clone(state.lastSnapshot || buildSnapshot());
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Trips Page subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () => {
        state.subscribers.delete(listener);
      };
    },

    destroy() {
      this.unmount();

      if (typeof state.unsubscribeStore === "function") {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      });

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
        tripFormAvailable: Boolean(getTripForm()),
        actionCount: state.actionUnsubscribers.length,
        subscriberCount: state.subscribers.size,
        hasSnapshot: Boolean(state.lastSnapshot)
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.trips = TripsPage;
  window.TICTripsPage = TripsPage;

  const router = getRouter();

  if (router && typeof router.register === "function") {
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

    if (typeof router.registerPage === "function") {
      router.registerPage("trips", TripsPage);
    }
  }

  TripsPage.init();
})(window, document);
