/* =========================================================
   Travel Intelligence Center
   Trip Form Feature V1.0.0

   File Path:
   js/features/trip-form.js

   Purpose:
   - Creates and manages the complete new-trip form.
   - Supports trip creation and trip editing.
   - Validates required travel information.
   - Calculates duration and preliminary budget usage.
   - Saves data through the central TIC Store.
   - Integrates with TIC UI and TIC Router.
   - Keeps all trip form logic isolated in one feature file.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js

   Global APIs:
   - window.TIC.Features.TripForm
   - window.TICTripForm
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const FEATURE_VERSION = "1.0.0";
  const FEATURE_ID = "trip-form";

  const state = {
    initialized: false,
    activeMode: "create",
    activeTripId: null,
    activeContainer: null,
    activeForm: null,
    listenersBound: false,
    actionUnsubscribers: [],
    subscribers: new Set()
  };

  const TRIP_TYPES = [
    { value: "family", label: "عائلية" },
    { value: "couple", label: "زوجية" },
    { value: "friends", label: "أصدقاء" },
    { value: "solo", label: "فردية" },
    { value: "business", label: "عمل" },
    { value: "weekend", label: "عطلة قصيرة" }
  ];

  const TRAVEL_STYLES = [
    { value: "premium-family", label: "عائلية راقية" },
    { value: "luxury", label: "فاخرة" },
    { value: "comfortable", label: "مريحة" },
    { value: "balanced", label: "متوازنة" },
    { value: "budget", label: "اقتصادية" },
    { value: "adventure", label: "مغامرات" }
  ];

  const TRIP_STATUSES = [
    { value: "planning", label: "قيد التخطيط" },
    { value: "booked", label: "تم الحجز" },
    { value: "ready", label: "جاهزة للسفر" },
    { value: "ongoing", label: "جارية" },
    { value: "completed", label: "مكتملة" }
  ];

  const PRIORITIES = [
    { value: "normal", label: "عادية" },
    { value: "important", label: "مهمة" },
    { value: "high", label: "أولوية عالية" }
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

  const normalizeDate = (value) => {
    if (!value) {
      return "";
    }

    const date = value instanceof Date
      ? value
      : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      feature: FEATURE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "TIC Trip Form subscriber error:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:trip-form:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const calculateDuration = (
    startDate,
    endDate
  ) => {
    if (!startDate || !endDate) {
      return 0;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return 0;
    }

    const difference =
      end.getTime() - start.getTime();

    return Math.floor(
      difference / 86400000
    ) + 1;
  };

  const splitList = (value) =>
    normalizeText(value)
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const joinList = (value) =>
    Array.isArray(value)
      ? value.join("\n")
      : normalizeText(value);

  const formatCurrency = (value) => {
    const ui = getUI();

    if (ui && typeof ui.currency === "function") {
      return ui.currency(value);
    }

    return `${normalizeNumber(value).toLocaleString()} ${
      Config.currency || "AED"
    }`;
  };

  const getDefaultTrip = () => {
    const store = getStore();
    const profile =
      store?.get?.("profile") ||
      store?.getState?.()?.profile ||
      {};

    return {
      id: createId(),
      title: "",
      destination: "",
      country: "",
      city: "",
      tripType: "family",
      travelStyle:
        profile.travelStyle ||
        Config.profile?.travelStyle ||
        "premium-family",
      status: "planning",
      priority: "normal",
      startDate: "",
      endDate: "",
      durationDays: 0,
      travelers: 1,
      adults: 1,
      children: 0,
      infants: 0,
      budget: 0,
      spent: 0,
      currency:
        profile.currency ||
        Config.currency ||
        "AED",
      departureAirport:
        profile.homeAirport ||
        Config.profile?.homeAirport ||
        "Abu Dhabi",
      arrivalAirport: "",
      airline: "",
      flightNumber: "",
      accommodation: "",
      accommodationAddress: "",
      bookingReference: "",
      transport: "",
      activities: [],
      notes: "",
      emergencyContact: "",
      visaRequired: false,
      insuranceRequired: true,
      featured: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  };

  const findTrip = (tripId) => {
    if (!tripId) {
      return null;
    }

    const store = getStore();

    if (!store) {
      return null;
    }

    if (typeof store.getTripById === "function") {
      return store.getTripById(tripId);
    }

    const trips =
      store.get?.("trips") ||
      store.getState?.()?.trips ||
      [];

    if (!Array.isArray(trips)) {
      return null;
    }

    return trips.find(
      (trip) => String(trip.id) === String(tripId)
    ) || null;
  };

  const mergeTrip = (trip) => ({
    ...getDefaultTrip(),
    ...(isObject(trip) ? clone(trip) : {}),
    activities:
      Array.isArray(trip?.activities)
        ? clone(trip.activities)
        : splitList(trip?.activities || ""),
    startDate: normalizeDate(trip?.startDate),
    endDate: normalizeDate(trip?.endDate)
  });

  const getActiveTrip = () => {
    if (
      state.activeMode === "edit" &&
      state.activeTripId
    ) {
      return mergeTrip(findTrip(state.activeTripId));
    }

    return getDefaultTrip();
  };

  const renderOptions = (
    options,
    selectedValue
  ) =>
    options
      .map(
        (option) => `
          <option
            value="${escapeHTML(option.value)}"
            ${
              String(option.value) ===
              String(selectedValue)
                ? "selected"
                : ""
            }
          >
            ${escapeHTML(option.label)}
          </option>
        `
      )
      .join("");

  const renderFieldError = (name) => `
    <small
      class="tic-field__error"
      data-error-for="${escapeHTML(name)}"
      hidden
    ></small>
  `;

  const renderForm = (trip) => {
    const ui = getUI();
    const isEditing =
      state.activeMode === "edit";

    const duration = calculateDuration(
      trip.startDate,
      trip.endDate
    );

    const budgetUsage =
      trip.budget > 0
        ? Math.min(
            100,
            Math.round(
              (normalizeNumber(trip.spent) /
                normalizeNumber(trip.budget)) *
                100
            )
          )
        : 0;

    const pageTitle = isEditing
      ? "تعديل الرحلة"
      : "إنشاء رحلة جديدة";

    const pageSubtitle = isEditing
      ? "حدّث بيانات الرحلة ثم احفظ التغييرات."
      : "أدخل تفاصيل رحلتك خطوة بخطوة وسيتم تجهيزها داخل مركز السفر.";

    const hero = ui?.hero
      ? ui.hero({
          badge: isEditing
            ? "Trip Update"
            : "New Journey",
          title: pageTitle,
          subtitle: pageSubtitle,
          compact: true,
          actions: [
            {
              label: "إلغاء",
              action: "trip-form-cancel",
              ghost: true
            }
          ]
        })
      : `
        <section class="tic-hero tic-hero--compact">
          <div class="tic-hero__content">
            <span class="tic-hero__badge">
              ${isEditing ? "Trip Update" : "New Journey"}
            </span>
            <h1 class="tic-hero__title">
              ${escapeHTML(pageTitle)}
            </h1>
            <p class="tic-hero__subtitle">
              ${escapeHTML(pageSubtitle)}
            </p>
          </div>
        </section>
      `;

    return `
      <div
        class="trip-form-feature"
        data-trip-form-feature
        data-mode="${escapeHTML(state.activeMode)}"
        data-trip-id="${escapeHTML(trip.id)}"
      >
        ${hero}

        <form
          class="tic-form trip-form"
          data-trip-form
          novalidate
        >
          <input
            type="hidden"
            name="id"
            value="${escapeHTML(trip.id)}"
          >

          <section class="tic-section trip-form__section">
            <header class="tic-section__header">
              <div class="tic-section__heading">
                <p class="tic-section__eyebrow">
                  الخطوة 1
                </p>
                <h2 class="tic-section__title">
                  معلومات الرحلة الأساسية
                </h2>
                <p class="tic-section__subtitle">
                  سمِّ الرحلة وحدد الوجهة ونوع السفر.
                </p>
              </div>
            </header>

            <div class="tic-section__body">
              <div class="trip-form__grid trip-form__grid--2">
                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-title"
                  >
                    اسم الرحلة
                    <span class="tic-field__required">*</span>
                  </label>

                  <input
                    id="trip-title"
                    class="tic-field__control"
                    type="text"
                    name="title"
                    value="${escapeHTML(trip.title)}"
                    placeholder="مثال: رحلة ألماتي العائلية"
                    autocomplete="off"
                    required
                  >

                  ${renderFieldError("title")}
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-destination"
                  >
                    الوجهة الرئيسية
                    <span class="tic-field__required">*</span>
                  </label>

                  <input
                    id="trip-destination"
                    class="tic-field__control"
                    type="text"
                    name="destination"
                    value="${escapeHTML(
                      trip.destination
                    )}"
                    placeholder="مثال: ألماتي، كازاخستان"
                    autocomplete="off"
                    required
                  >

                  ${renderFieldError("destination")}
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-country"
                  >
                    الدولة
                  </label>

                  <input
                    id="trip-country"
                    class="tic-field__control"
                    type="text"
                    name="country"
                    value="${escapeHTML(trip.country)}"
                    placeholder="اسم الدولة"
                    autocomplete="country-name"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-city"
                  >
                    المدينة
                  </label>

                  <input
                    id="trip-city"
                    class="tic-field__control"
                    type="text"
                    name="city"
                    value="${escapeHTML(trip.city)}"
                    placeholder="اسم المدينة"
                    autocomplete="address-level2"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-type"
                  >
                    نوع الرحلة
                  </label>

                  <select
                    id="trip-type"
                    class="tic-field__control"
                    name="tripType"
                  >
                    ${renderOptions(
                      TRIP_TYPES,
                      trip.tripType
                    )}
                  </select>
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-style"
                  >
                    أسلوب السفر
                  </label>

                  <select
                    id="trip-style"
                    class="tic-field__control"
                    name="travelStyle"
                  >
                    ${renderOptions(
                      TRAVEL_STYLES,
                      trip.travelStyle
                    )}
                  </select>
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-status"
                  >
                    حالة الرحلة
                  </label>

                  <select
                    id="trip-status"
                    class="tic-field__control"
                    name="status"
                  >
                    ${renderOptions(
                      TRIP_STATUSES,
                      trip.status
                    )}
                  </select>
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-priority"
                  >
                    الأولوية
                  </label>

                  <select
                    id="trip-priority"
                    class="tic-field__control"
                    name="priority"
                  >
                    ${renderOptions(
                      PRIORITIES,
                      trip.priority
                    )}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section class="tic-section trip-form__section">
            <header class="tic-section__header">
              <div class="tic-section__heading">
                <p class="tic-section__eyebrow">
                  الخطوة 2
                </p>
                <h2 class="tic-section__title">
                  المواعيد والمسافرون
                </h2>
                <p class="tic-section__subtitle">
                  حدد تاريخ الرحلة وعدد المسافرين.
                </p>
              </div>
            </header>

            <div class="tic-section__body">
              <div class="trip-form__grid trip-form__grid--2">
                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-start-date"
                  >
                    تاريخ المغادرة
                    <span class="tic-field__required">*</span>
                  </label>

                  <input
                    id="trip-start-date"
                    class="tic-field__control"
                    type="date"
                    name="startDate"
                    value="${escapeHTML(trip.startDate)}"
                    required
                  >

                  ${renderFieldError("startDate")}
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-end-date"
                  >
                    تاريخ العودة
                    <span class="tic-field__required">*</span>
                  </label>

                  <input
                    id="trip-end-date"
                    class="tic-field__control"
                    type="date"
                    name="endDate"
                    value="${escapeHTML(trip.endDate)}"
                    required
                  >

                  ${renderFieldError("endDate")}
                </div>

                <div class="trip-form__summary-card">
                  <span class="trip-form__summary-label">
                    مدة الرحلة
                  </span>
                  <strong
                    class="trip-form__summary-value"
                    data-trip-duration
                  >
                    ${duration || 0} يوم
                  </strong>
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-travelers"
                  >
                    إجمالي المسافرين
                    <span class="tic-field__required">*</span>
                  </label>

                  <input
                    id="trip-travelers"
                    class="tic-field__control"
                    type="number"
                    name="travelers"
                    min="1"
                    max="99"
                    step="1"
                    value="${escapeHTML(
                      trip.travelers
                    )}"
                    required
                  >

                  ${renderFieldError("travelers")}
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-adults"
                  >
                    البالغون
                  </label>

                  <input
                    id="trip-adults"
                    class="tic-field__control"
                    type="number"
                    name="adults"
                    min="0"
                    max="99"
                    step="1"
                    value="${escapeHTML(trip.adults)}"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-children"
                  >
                    الأطفال
                  </label>

                  <input
                    id="trip-children"
                    class="tic-field__control"
                    type="number"
                    name="children"
                    min="0"
                    max="99"
                    step="1"
                    value="${escapeHTML(trip.children)}"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-infants"
                  >
                    الرضع
                  </label>

                  <input
                    id="trip-infants"
                    class="tic-field__control"
                    type="number"
                    name="infants"
                    min="0"
                    max="99"
                    step="1"
                    value="${escapeHTML(trip.infants)}"
                  >
                </div>
              </div>
            </div>
          </section>

          <section class="tic-section trip-form__section">
            <header class="tic-section__header">
              <div class="tic-section__heading">
                <p class="tic-section__eyebrow">
                  الخطوة 3
                </p>
                <h2 class="tic-section__title">
                  الميزانية
                </h2>
                <p class="tic-section__subtitle">
                  حدد الميزانية المتوقعة والمبلغ المصروف.
                </p>
              </div>
            </header>

            <div class="tic-section__body">
              <div class="trip-form__grid trip-form__grid--2">
                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-budget"
                  >
                    الميزانية الإجمالية
                    <span class="tic-field__required">*</span>
                  </label>

                  <input
                    id="trip-budget"
                    class="tic-field__control"
                    type="number"
                    name="budget"
                    min="0"
                    step="0.01"
                    value="${escapeHTML(trip.budget)}"
                    placeholder="0"
                    required
                  >

                  ${renderFieldError("budget")}
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-spent"
                  >
                    المصروف حتى الآن
                  </label>

                  <input
                    id="trip-spent"
                    class="tic-field__control"
                    type="number"
                    name="spent"
                    min="0"
                    step="0.01"
                    value="${escapeHTML(trip.spent)}"
                    placeholder="0"
                  >
                </div>

                <div class="trip-form__budget-card">
                  <div class="trip-form__budget-header">
                    <span>استخدام الميزانية</span>
                    <strong data-budget-percentage>
                      ${budgetUsage}%
                    </strong>
                  </div>

                  <div class="tic-progress__track">
                    <span
                      class="tic-progress__bar"
                      data-budget-progress
                      style="width:${budgetUsage}%"
                    ></span>
                  </div>

                  <p
                    class="trip-form__budget-caption"
                    data-budget-caption
                  >
                    ${formatCurrency(
                      trip.spent
                    )} من ${formatCurrency(
                      trip.budget
                    )}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section class="tic-section trip-form__section">
            <header class="tic-section__header">
              <div class="tic-section__heading">
                <p class="tic-section__eyebrow">
                  الخطوة 4
                </p>
                <h2 class="tic-section__title">
                  الطيران والإقامة
                </h2>
                <p class="tic-section__subtitle">
                  أضف معلومات الحجز الأساسية إن كانت متوفرة.
                </p>
              </div>
            </header>

            <div class="tic-section__body">
              <div class="trip-form__grid trip-form__grid--2">
                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-departure-airport"
                  >
                    مطار المغادرة
                  </label>

                  <input
                    id="trip-departure-airport"
                    class="tic-field__control"
                    type="text"
                    name="departureAirport"
                    value="${escapeHTML(
                      trip.departureAirport
                    )}"
                    placeholder="مثال: مطار أبوظبي الدولي"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-arrival-airport"
                  >
                    مطار الوصول
                  </label>

                  <input
                    id="trip-arrival-airport"
                    class="tic-field__control"
                    type="text"
                    name="arrivalAirport"
                    value="${escapeHTML(
                      trip.arrivalAirport
                    )}"
                    placeholder="مطار الوصول"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-airline"
                  >
                    شركة الطيران
                  </label>

                  <input
                    id="trip-airline"
                    class="tic-field__control"
                    type="text"
                    name="airline"
                    value="${escapeHTML(trip.airline)}"
                    placeholder="اسم شركة الطيران"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-flight-number"
                  >
                    رقم الرحلة
                  </label>

                  <input
                    id="trip-flight-number"
                    class="tic-field__control"
                    type="text"
                    name="flightNumber"
                    value="${escapeHTML(
                      trip.flightNumber
                    )}"
                    placeholder="مثال: EY123"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-accommodation"
                  >
                    مكان الإقامة
                  </label>

                  <input
                    id="trip-accommodation"
                    class="tic-field__control"
                    type="text"
                    name="accommodation"
                    value="${escapeHTML(
                      trip.accommodation
                    )}"
                    placeholder="اسم الفندق أو الشقة"
                  >
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-booking-reference"
                  >
                    رقم الحجز
                  </label>

                  <input
                    id="trip-booking-reference"
                    class="tic-field__control"
                    type="text"
                    name="bookingReference"
                    value="${escapeHTML(
                      trip.bookingReference
                    )}"
                    placeholder="رقم أو رمز الحجز"
                  >
                </div>

                <div class="tic-field trip-form__field--full">
                  <label
                    class="tic-field__label"
                    for="trip-accommodation-address"
                  >
                    عنوان الإقامة
                  </label>

                  <input
                    id="trip-accommodation-address"
                    class="tic-field__control"
                    type="text"
                    name="accommodationAddress"
                    value="${escapeHTML(
                      trip.accommodationAddress
                    )}"
                    placeholder="العنوان الكامل"
                  >
                </div>

                <div class="tic-field trip-form__field--full">
                  <label
                    class="tic-field__label"
                    for="trip-transport"
                  >
                    التنقل داخل الوجهة
                  </label>

                  <input
                    id="trip-transport"
                    class="tic-field__control"
                    type="text"
                    name="transport"
                    value="${escapeHTML(
                      trip.transport
                    )}"
                    placeholder="سيارة، سائق، قطار، مواصلات عامة..."
                  >
                </div>
              </div>
            </div>
          </section>

          <section class="tic-section trip-form__section">
            <header class="tic-section__header">
              <div class="tic-section__heading">
                <p class="tic-section__eyebrow">
                  الخطوة 5
                </p>
                <h2 class="tic-section__title">
                  الأنشطة والملاحظات
                </h2>
                <p class="tic-section__subtitle">
                  أضف الأنشطة المخطط لها وأي تفاصيل مهمة.
                </p>
              </div>
            </header>

            <div class="tic-section__body">
              <div class="trip-form__grid trip-form__grid--2">
                <div class="tic-field trip-form__field--full">
                  <label
                    class="tic-field__label"
                    for="trip-activities"
                  >
                    الأنشطة
                  </label>

                  <textarea
                    id="trip-activities"
                    class="tic-field__control"
                    name="activities"
                    rows="6"
                    placeholder="اكتب كل نشاط في سطر منفصل"
                  >${escapeHTML(
                    joinList(trip.activities)
                  )}</textarea>
                </div>

                <div class="tic-field trip-form__field--full">
                  <label
                    class="tic-field__label"
                    for="trip-notes"
                  >
                    ملاحظات الرحلة
                  </label>

                  <textarea
                    id="trip-notes"
                    class="tic-field__control"
                    name="notes"
                    rows="5"
                    placeholder="معلومات مهمة، تفضيلات، تنبيهات..."
                  >${escapeHTML(trip.notes)}</textarea>
                </div>

                <div class="tic-field">
                  <label
                    class="tic-field__label"
                    for="trip-emergency-contact"
                  >
                    جهة اتصال للطوارئ
                  </label>

                  <input
                    id="trip-emergency-contact"
                    class="tic-field__control"
                    type="text"
                    name="emergencyContact"
                    value="${escapeHTML(
                      trip.emergencyContact
                    )}"
                    placeholder="الاسم ورقم الهاتف"
                  >
                </div>

                <div class="trip-form__choices">
                  <label class="tic-choice">
                    <input
                      class="tic-choice__input"
                      type="checkbox"
                      name="visaRequired"
                      value="true"
                      ${
                        trip.visaRequired
                          ? "checked"
                          : ""
                      }
                    >
                    <span class="tic-choice__control"></span>
                    <span class="tic-choice__label">
                      تحتاج تأشيرة
                    </span>
                  </label>

                  <label class="tic-choice">
                    <input
                      class="tic-choice__input"
                      type="checkbox"
                      name="insuranceRequired"
                      value="true"
                      ${
                        trip.insuranceRequired
                          ? "checked"
                          : ""
                      }
                    >
                    <span class="tic-choice__control"></span>
                    <span class="tic-choice__label">
                      تحتاج تأمين سفر
                    </span>
                  </label>

                  <label class="tic-choice">
                    <input
                      class="tic-choice__input"
                      type="checkbox"
                      name="featured"
                      value="true"
                      ${
                        trip.featured
                          ? "checked"
                          : ""
                      }
                    >
                    <span class="tic-choice__control"></span>
                    <span class="tic-choice__label">
                      عرضها كرحلة مميزة
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <footer class="trip-form__footer">
            <button
              type="button"
              class="button button--secondary"
              data-action="trip-form-cancel"
            >
              إلغاء
            </button>

            <button
              type="submit"
              class="button button--primary"
              data-trip-form-submit
            >
              ${
                isEditing
                  ? "حفظ التعديلات"
                  : "إنشاء الرحلة"
              }
            </button>
          </footer>
        </form>
      </div>
    `;
  };

  const getFormData = (form) => {
    const formData = new FormData(form);

    const data = {
      id:
        normalizeText(formData.get("id")) ||
        createId(),
      title: normalizeText(formData.get("title")),
      destination: normalizeText(
        formData.get("destination")
      ),
      country: normalizeText(
        formData.get("country")
      ),
      city: normalizeText(formData.get("city")),
      tripType: normalizeText(
        formData.get("tripType")
      ),
      travelStyle: normalizeText(
        formData.get("travelStyle")
      ),
      status:
        normalizeText(formData.get("status")) ||
        "planning",
      priority:
        normalizeText(formData.get("priority")) ||
        "normal",
      startDate: normalizeDate(
        formData.get("startDate")
      ),
      endDate: normalizeDate(
        formData.get("endDate")
      ),
      travelers: Math.max(
        1,
        Math.round(
          normalizeNumber(
            formData.get("travelers"),
            1
          )
        )
      ),
      adults: Math.max(
        0,
        Math.round(
          normalizeNumber(
            formData.get("adults"),
            0
          )
        )
      ),
      children: Math.max(
        0,
        Math.round(
          normalizeNumber(
            formData.get("children"),
            0
          )
        )
      ),
      infants: Math.max(
        0,
        Math.round(
          normalizeNumber(
            formData.get("infants"),
            0
          )
        )
      ),
      budget: Math.max(
        0,
        normalizeNumber(formData.get("budget"))
      ),
      spent: Math.max(
        0,
        normalizeNumber(formData.get("spent"))
      ),
      currency:
        Config.currency ||
        "AED",
      departureAirport: normalizeText(
        formData.get("departureAirport")
      ),
      arrivalAirport: normalizeText(
        formData.get("arrivalAirport")
      ),
      airline: normalizeText(
        formData.get("airline")
      ),
      flightNumber: normalizeText(
        formData.get("flightNumber")
      ),
      accommodation: normalizeText(
        formData.get("accommodation")
      ),
      accommodationAddress: normalizeText(
        formData.get("accommodationAddress")
      ),
      bookingReference: normalizeText(
        formData.get("bookingReference")
      ),
      transport: normalizeText(
        formData.get("transport")
      ),
      activities: splitList(
        formData.get("activities")
      ),
      notes: normalizeText(formData.get("notes")),
      emergencyContact: normalizeText(
        formData.get("emergencyContact")
      ),
      visaRequired:
        formData.get("visaRequired") === "true",
      insuranceRequired:
        formData.get("insuranceRequired") === "true",
      featured:
        formData.get("featured") === "true"
    };

    data.durationDays = calculateDuration(
      data.startDate,
      data.endDate
    );

    return data;
  };

  const validate = (data) => {
    const errors = {};

    if (!data.title) {
      errors.title = "أدخل اسم الرحلة.";
    }

    if (!data.destination) {
      errors.destination = "أدخل الوجهة الرئيسية.";
    }

    if (!data.startDate) {
      errors.startDate = "حدد تاريخ المغادرة.";
    }

    if (!data.endDate) {
      errors.endDate = "حدد تاريخ العودة.";
    }

    if (
      data.startDate &&
      data.endDate &&
      new Date(data.endDate) < new Date(data.startDate)
    ) {
      errors.endDate =
        "تاريخ العودة يجب أن يكون بعد تاريخ المغادرة.";
    }

    if (data.travelers < 1) {
      errors.travelers =
        "يجب أن يكون عدد المسافرين واحداً على الأقل.";
    }

    if (data.budget < 0) {
      errors.budget =
        "الميزانية لا يمكن أن تكون سالبة.";
    }

    if (data.spent < 0) {
      errors.spent =
        "المبلغ المصروف لا يمكن أن يكون سالباً.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  };

  const clearErrors = (form) => {
    form
      .querySelectorAll("[data-error-for]")
      .forEach((element) => {
        element.textContent = "";
        element.hidden = true;
      });

    form
      .querySelectorAll(".tic-field.has-error")
      .forEach((element) => {
        element.classList.remove("has-error");
      });

    form
      .querySelectorAll("[aria-invalid='true']")
      .forEach((element) => {
        element.removeAttribute("aria-invalid");
      });
  };

  const showErrors = (form, errors) => {
    clearErrors(form);

    Object.entries(errors).forEach(
      ([name, message]) => {
        const input = form.elements[name];
        const errorElement = form.querySelector(
          `[data-error-for="${name}"]`
        );

        if (input) {
          input.setAttribute("aria-invalid", "true");

          const field = input.closest(".tic-field");

          if (field) {
            field.classList.add("has-error");
          }
        }

        if (errorElement) {
          errorElement.textContent = message;
          errorElement.hidden = false;
        }
      }
    );

    const firstErrorName =
      Object.keys(errors)[0];

    if (firstErrorName && form.elements[firstErrorName]) {
      form.elements[firstErrorName].focus();
    }
  };

  const getTrips = () => {
    const store = getStore();

    if (!store) {
      return [];
    }

    const trips =
      store.get?.("trips") ||
      store.getState?.()?.trips ||
      [];

    return Array.isArray(trips)
      ? clone(trips)
      : [];
  };

  const saveTripsFallback = (trips) => {
    const store = getStore();

    if (!store) {
      throw new Error(
        "TIC Trip Form Error: store is not available."
      );
    }

    if (typeof store.set === "function") {
      store.set("trips", trips);
      return true;
    }

    if (typeof store.patch === "function") {
      store.patch({
        trips
      });
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
      "TIC Trip Form Error: store does not support trip persistence."
    );
  };

  const saveTrip = async (tripData) => {
    const store = getStore();

    if (!store) {
      throw new Error(
        "TIC Trip Form Error: store is not available."
      );
    }

    const now = new Date().toISOString();

    if (state.activeMode === "edit") {
      const existingTrip =
        findTrip(state.activeTripId) || {};

      const updatedTrip = {
        ...existingTrip,
        ...tripData,
        id: existingTrip.id || tripData.id,
        createdAt:
          existingTrip.createdAt ||
          tripData.createdAt ||
          now,
        updatedAt: now
      };

      if (typeof store.updateTrip === "function") {
        await store.updateTrip(
          updatedTrip.id,
          updatedTrip
        );

        return updatedTrip;
      }

      if (typeof store.upsertTrip === "function") {
        await store.upsertTrip(updatedTrip);
        return updatedTrip;
      }

      const trips = getTrips();
      const index = trips.findIndex(
        (trip) =>
          String(trip.id) ===
          String(updatedTrip.id)
      );

      if (index >= 0) {
        trips[index] = updatedTrip;
      } else {
        trips.unshift(updatedTrip);
      }

      saveTripsFallback(trips);
      return updatedTrip;
    }

    const newTrip = {
      ...tripData,
      id: tripData.id || createId(),
      createdAt: now,
      updatedAt: now
    };

    if (typeof store.addTrip === "function") {
      const result = await store.addTrip(newTrip);
      return result || newTrip;
    }

    if (typeof store.createTrip === "function") {
      const result = await store.createTrip(newTrip);
      return result || newTrip;
    }

    if (typeof store.upsertTrip === "function") {
      await store.upsertTrip(newTrip);
      return newTrip;
    }

    const trips = getTrips();
    trips.unshift(newTrip);
    saveTripsFallback(trips);

    return newTrip;
  };

  const updateLiveSummary = (form) => {
    if (!form) {
      return;
    }

    const startDate =
      form.elements.startDate?.value || "";
    const endDate =
      form.elements.endDate?.value || "";

    const duration = calculateDuration(
      startDate,
      endDate
    );

    const durationElement = form.querySelector(
      "[data-trip-duration]"
    );

    if (durationElement) {
      durationElement.textContent =
        `${duration} يوم`;
    }

    const budget = normalizeNumber(
      form.elements.budget?.value
    );

    const spent = normalizeNumber(
      form.elements.spent?.value
    );

    const percentage =
      budget > 0
        ? Math.min(
            100,
            Math.round((spent / budget) * 100)
          )
        : 0;

    const percentageElement = form.querySelector(
      "[data-budget-percentage]"
    );

    const progressElement = form.querySelector(
      "[data-budget-progress]"
    );

    const captionElement = form.querySelector(
      "[data-budget-caption]"
    );

    if (percentageElement) {
      percentageElement.textContent =
        `${percentage}%`;
    }

    if (progressElement) {
      progressElement.style.width =
        `${percentage}%`;
    }

    if (captionElement) {
      captionElement.textContent =
        `${formatCurrency(spent)} من ${formatCurrency(
          budget
        )}`;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const ui = getUI();
    const submitButton = form.querySelector(
      "[data-trip-form-submit]"
    );

    const data = getFormData(form);
    const validation = validate(data);

    if (!validation.valid) {
      showErrors(form, validation.errors);

      ui?.toast?.(
        "راجع الحقول المطلوبة قبل الحفظ.",
        "warning"
      );

      emit("validation-failed", {
        errors: validation.errors
      });

      return false;
    }

    clearErrors(form);

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute(
        "aria-busy",
        "true"
      );
    }

    try {
      ui?.showLoader?.(
        state.activeMode === "edit"
          ? "جاري حفظ تعديلات الرحلة..."
          : "جاري إنشاء الرحلة..."
      );

      const savedTrip = await saveTrip(data);

      ui?.toast?.(
        state.activeMode === "edit"
          ? "تم حفظ تعديلات الرحلة."
          : "تم إنشاء الرحلة بنجاح.",
        "success"
      );

      emit("saved", {
        mode: state.activeMode,
        trip: savedTrip
      });

      const router = getRouter();

      if (
        router &&
        typeof router.go === "function"
      ) {
        await router.go("trips", {
          params: {
            tripId: savedTrip.id,
            view: "details"
          },
          source: "trip-form-save"
        });
      }

      return savedTrip;
    } catch (error) {
      console.error(
        "TIC Trip Form save error:",
        error
      );

      ui?.toast?.(
        "تعذر حفظ الرحلة. حاول مرة أخرى.",
        "error"
      );

      emit("save-error", {
        error: {
          name: error?.name || "Error",
          message:
            error?.message ||
            String(error)
        }
      });

      return false;
    } finally {
      ui?.hideLoader?.();

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute(
          "aria-busy"
        );
      }
    }
  };

  const handleFormInput = (event) => {
    const form = event.currentTarget;

    updateLiveSummary(form);

    const name = event.target?.name;

    if (name) {
      const errorElement = form.querySelector(
        `[data-error-for="${name}"]`
      );

      if (errorElement) {
        errorElement.textContent = "";
        errorElement.hidden = true;
      }

      event.target.removeAttribute("aria-invalid");

      const field =
        event.target.closest(".tic-field");

      if (field) {
        field.classList.remove("has-error");
      }
    }
  };

  const bindForm = (container) => {
    const form = container?.querySelector(
      "[data-trip-form]"
    );

    if (!form) {
      return false;
    }

    if (state.activeForm) {
      state.activeForm.removeEventListener(
        "submit",
        handleSubmit
      );

      state.activeForm.removeEventListener(
        "input",
        handleFormInput
      );

      state.activeForm.removeEventListener(
        "change",
        handleFormInput
      );
    }

    state.activeForm = form;

    form.addEventListener(
      "submit",
      handleSubmit
    );

    form.addEventListener(
      "input",
      handleFormInput
    );

    form.addEventListener(
      "change",
      handleFormInput
    );

    updateLiveSummary(form);

    return true;
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

  const TripForm = {
    id: FEATURE_ID,
    version: FEATURE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      const ui = getUI();

      if (
        ui &&
        typeof ui.registerAction === "function"
      ) {
        state.actionUnsubscribers.push(
          ui.registerAction(
            "new-trip",
            () => this.openCreate()
          )
        );

        state.actionUnsubscribers.push(
          ui.registerAction(
            "create-trip",
            () => this.openCreate()
          )
        );

        state.actionUnsubscribers.push(
          ui.registerAction(
            "edit-trip",
            ({ params }) =>
              this.openEdit(
                params.tripId ||
                params.id
              )
          )
        );

        state.actionUnsubscribers.push(
          ui.registerAction(
            "trip-form-cancel",
            () => this.cancel()
          )
        );
      }

      state.initialized = true;

      emit("initialized", {
        version: FEATURE_VERSION
      });

      return this.diagnostics();
    },

    mount(context = {}) {
      this.init();

      state.activeMode =
        context.mode === "edit" ||
        context.params?.tripId
          ? "edit"
          : "create";

      state.activeTripId =
        context.tripId ||
        context.params?.tripId ||
        null;

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Trip Form Error: route container was not found."
        );
      }

      state.activeContainer = container;

      const trip = getActiveTrip();
      container.innerHTML = renderForm(trip);

      bindForm(container);

      emit("mounted", {
        mode: state.activeMode,
        tripId: state.activeTripId
      });

      return container;
    },

    render(context = {}) {
      this.init();

      state.activeMode =
        context.mode === "edit" ||
        context.params?.tripId
          ? "edit"
          : "create";

      state.activeTripId =
        context.tripId ||
        context.params?.tripId ||
        null;

      return renderForm(getActiveTrip());
    },

    afterEnter(context = {}) {
      const container = resolveContainer(
        context.container
      );

      if (container) {
        state.activeContainer = container;
        bindForm(container);
      }

      return true;
    },

    unmount() {
      if (state.activeForm) {
        state.activeForm.removeEventListener(
          "submit",
          handleSubmit
        );

        state.activeForm.removeEventListener(
          "input",
          handleFormInput
        );

        state.activeForm.removeEventListener(
          "change",
          handleFormInput
        );
      }

      state.activeForm = null;
      state.activeContainer = null;

      emit("unmounted", {
        mode: state.activeMode,
        tripId: state.activeTripId
      });

      return true;
    },

    openCreate(options = {}) {
      this.init();

      state.activeMode = "create";
      state.activeTripId = null;

      const router = getRouter();

      if (
        router &&
        typeof router.go === "function"
      ) {
        return router.go("trip-form", {
          ...options,
          params: {
            ...(options.params || {}),
            mode: "create"
          },
          source: "trip-form-open-create"
        });
      }

      const container = resolveContainer(
        options.container
      );

      if (container) {
        this.mount({
          container,
          mode: "create"
        });

        return true;
      }

      return false;
    },

    openEdit(tripId, options = {}) {
      this.init();

      const trip = findTrip(tripId);

      if (!trip) {
        getUI()?.toast?.(
          "تعذر العثور على الرحلة المطلوبة.",
          "error"
        );

        return false;
      }

      state.activeMode = "edit";
      state.activeTripId = tripId;

      const router = getRouter();

      if (
        router &&
        typeof router.go === "function"
      ) {
        return router.go("trip-form", {
          ...options,
          params: {
            ...(options.params || {}),
            mode: "edit",
            tripId
          },
          source: "trip-form-open-edit"
        });
      }

      const container = resolveContainer(
        options.container
      );

      if (container) {
        this.mount({
          container,
          mode: "edit",
          tripId
        });

        return true;
      }

      return false;
    },

    async cancel() {
      const ui = getUI();

      if (state.activeForm) {
        const formData = getFormData(
          state.activeForm
        );

        const hasContent = Boolean(
          formData.title ||
          formData.destination ||
          formData.startDate ||
          formData.endDate ||
          formData.notes
        );

        if (hasContent) {
          const confirmed =
            await ui?.confirm?.({
              title: "إلغاء الرحلة",
              message:
                "سيتم تجاهل البيانات غير المحفوظة. هل تريد المتابعة؟",
              confirmLabel: "نعم، إلغاء",
              cancelLabel: "العودة للنموذج",
              danger: true
            });

          if (confirmed === false) {
            return false;
          }
        }
      }

      emit("cancelled", {
        mode: state.activeMode,
        tripId: state.activeTripId
      });

      const router = getRouter();

      if (
        router &&
        typeof router.go === "function"
      ) {
        return router.go("trips", {
          source: "trip-form-cancel"
        });
      }

      return true;
    },

    validate(data) {
      return validate(
        isObject(data)
          ? data
          : {}
      );
    },

    calculateDuration,

    getTrip(tripId) {
      return clone(findTrip(tripId));
    },

    getMode() {
      return state.activeMode;
    },

    getActiveTripId() {
      return state.activeTripId;
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Trip Form subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () => {
        state.subscribers.delete(listener);
      };
    },

    destroy() {
      this.unmount();

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        }
      );

      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.initialized = false;
      state.activeMode = "create";
      state.activeTripId = null;

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        version: this.version,
        initialized: state.initialized,
        activeMode: state.activeMode,
        activeTripId: state.activeTripId,
        hasContainer: Boolean(
          state.activeContainer
        ),
        hasForm: Boolean(state.activeForm),
        registeredActions:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI())
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features =
    window.TIC.Features || {};
  window.TIC.Features.TripForm = TripForm;
  window.TICTripForm = TripForm;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("trip-form")) {
      router.register("trip-form", {
        id: "trip-form",
        title: "رحلة جديدة",
        module: "trip-form",
        visible: false,
        order: 99,
        meta: {
          feature: true,
          navigation: false
        }
      });
    }

    if (
      typeof router.registerPage === "function"
    ) {
      router.registerPage(
        "trip-form",
        TripForm
      );
    }
  }

  TripForm.init();
})(window, document);
