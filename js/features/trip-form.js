/* =========================================================
   Travel Intelligence Center
   Trip Form Feature V3.0.0

   File Path:
   js/features/trip-form.js

   Purpose:
   - Premium iPhone-first trip creation and editing wizard.
   - Clear step-by-step flow instead of one long form.
   - Supports manual entry plus smart ticket/hotel import hooks.
   - Stores richer flight and hotel data for the Home Page.
   - Preserves Store, Router and UI integration.
   - Works even before OCR/import modules are added.

   Smart Import Integration:
   - window.TIC.Features.DocumentReader
   - window.TIC.Features.TripTicketImport
   - window.TIC.Features.HotelImport

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
  const FEATURE_ID = "trip-form";
  const FEATURE_VERSION = "3.0.0";
  const TOTAL_STEPS = 6;

  const state = {
    initialized: false,
    activeMode: "create",
    activeTripId: null,
    activeContainer: null,
    activeForm: null,
    activeStep: 1,
    importedTicketFile: null,
    importedHotelFile: null,
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

  const normalizeDate = (value) => {
    if (!value) return "";

    const date =
      value instanceof Date
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

  const normalizeTime = (value) => {
    if (!value) return "";

    if (/^\d{2}:\d{2}$/.test(String(value))) {
      return String(value);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
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

  const getTicketImporter = () =>
    window.TIC?.Features?.TripTicketImport ||
    window.TICTripTicketImport ||
    null;

  const getHotelImporter = () =>
    window.TIC?.Features?.HotelImport ||
    window.TICHotelImport ||
    null;

  const getDocumentReader = () =>
    window.TIC?.Features?.DocumentReader ||
    window.TICDocumentReader ||
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
        console.error("TIC Trip Form subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:trip-form:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const calculateDuration = (startDate, endDate) => {
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

    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  };

  const splitList = (value) =>
    text(value)
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const joinList = (value) =>
    Array.isArray(value)
      ? value.join("\n")
      : text(value);

  const formatCurrency = (value) => {
    const ui = getUI();

    if (ui && typeof ui.currency === "function") {
      return ui.currency(value);
    }

    return `${number(value).toLocaleString()} ${Config.currency || "AED"}`;
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
      departureDate: "",
      departureTime: "",
      arrivalDate: "",
      arrivalTime: "",
      terminal: "",
      gate: "",
      seatNumber: "",
      bookingReference: "",
      airportLeadMinutes: 120,

      accommodation: "",
      accommodationAddress: "",
      hotelBookingReference: "",
      hotelCheckIn: "",
      hotelCheckOut: "",

      transport: "",
      activities: [],
      notes: "",
      emergencyContact: "",

      visaRequired: false,
      insuranceRequired: true,
      featured: false,

      ticketImport: null,
      hotelImport: null,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  };

  const findTrip = (tripId) => {
    if (!tripId) return null;

    const store = getStore();
    if (!store) return null;

    if (typeof store.getTripById === "function") {
      return store.getTripById(tripId);
    }

    const trips =
      store.get?.("trips") ||
      store.getState?.()?.trips ||
      [];

    return Array.isArray(trips)
      ? trips.find((trip) => String(trip.id) === String(tripId)) || null
      : null;
  };

  const mergeTrip = (trip) => ({
    ...getDefaultTrip(),
    ...(isObject(trip) ? clone(trip) : {}),
    activities:
      Array.isArray(trip?.activities)
        ? clone(trip.activities)
        : splitList(trip?.activities || ""),
    startDate: normalizeDate(trip?.startDate),
    endDate: normalizeDate(trip?.endDate),
    departureDate: normalizeDate(
      trip?.departureDate ||
      trip?.startDate
    ),
    departureTime: normalizeTime(
      trip?.departureTime ||
      trip?.flightTime
    ),
    arrivalDate: normalizeDate(
      trip?.arrivalDate
    ),
    arrivalTime: normalizeTime(
      trip?.arrivalTime
    ),
    hotelCheckIn: normalizeDate(
      trip?.hotelCheckIn ||
      trip?.checkIn
    ),
    hotelCheckOut: normalizeDate(
      trip?.hotelCheckOut ||
      trip?.checkOut
    ),
    hotelBookingReference:
      text(
        trip?.hotelBookingReference ||
        trip?.hotelConfirmationNumber
      )
  });

  const getActiveTrip = () => {
    if (state.activeMode === "edit" && state.activeTripId) {
      return mergeTrip(findTrip(state.activeTripId));
    }

    return getDefaultTrip();
  };

  const renderOptions = (options, selectedValue) =>
    options
      .map(
        (option) => `
          <option
            value="${escapeHTML(option.value)}"
            ${
              String(option.value) === String(selectedValue)
                ? "selected"
                : ""
            }
          >
            ${escapeHTML(option.label)}
          </option>
        `
      )
      .join("");

  const renderError = (name) => `
    <small
      class="tic-form-message"
      data-type="error"
      data-error-for="${escapeHTML(name)}"
      hidden
    ></small>
  `;

  const renderStepper = () => {
    const labels = [
      "الأساسيات",
      "المواعيد",
      "الطيران",
      "الإقامة",
      "الميزانية",
      "المراجعة"
    ];

    return `
      <nav class="tic-trip-stepper" aria-label="خطوات إنشاء الرحلة">
        ${labels
          .map(
            (label, index) => `
              <button
                type="button"
                class="tic-trip-step${
                  index + 1 === state.activeStep
                    ? " is-active"
                    : ""
                }${
                  index + 1 < state.activeStep
                    ? " is-complete"
                    : ""
                }"
                data-trip-step-target="${index + 1}"
                aria-current="${
                  index + 1 === state.activeStep
                    ? "step"
                    : "false"
                }"
              >
                <span>${index + 1}</span>
                <small>${escapeHTML(label)}</small>
              </button>
            `
          )
          .join("")}
      </nav>
    `;
  };

  const renderImportCard = ({
    type,
    title,
    description,
    action,
    inputName,
    accept
  }) => `
    <article class="tic-trip-import-card" data-import-type="${escapeHTML(type)}">
      <div class="tic-trip-import-icon" aria-hidden="true">
        ${type === "ticket" ? "✈" : "⌂"}
      </div>

      <div class="tic-trip-import-copy">
        <strong>${escapeHTML(title)}</strong>
        <p>${escapeHTML(description)}</p>
      </div>

      <input
        type="file"
        name="${escapeHTML(inputName)}"
        accept="${escapeHTML(accept)}"
        data-trip-import-input="${escapeHTML(type)}"
        hidden
      >

      <button
        type="button"
        class="tic-btn tic-btn-soft"
        data-tic-action="${escapeHTML(action)}"
      >
        اختيار ملف
      </button>

      <small
        class="tic-trip-import-status"
        data-trip-import-status="${escapeHTML(type)}"
      >
        صورة أو PDF
      </small>
    </article>
  `;

  const renderStepHeader = (step, title, subtitle) => `
    <header class="tic-trip-form-step-header">
      <div>
        <span>الخطوة ${step} من ${TOTAL_STEPS}</span>
        <h2>${escapeHTML(title)}</h2>
        <p>${escapeHTML(subtitle)}</p>
      </div>
    </header>
  `;

  const renderForm = (trip) => {
    const ui = getUI();
    const isEditing = state.activeMode === "edit";

    const duration = calculateDuration(
      trip.startDate,
      trip.endDate
    );

    const budgetUsage =
      number(trip.budget) > 0
        ? Math.min(
            100,
            Math.round(
              (number(trip.spent) / number(trip.budget)) * 100
            )
          )
        : 0;

    const pageTitle = isEditing
      ? "تعديل الرحلة"
      : "رحلة جديدة";

    const pageSubtitle = isEditing
      ? "حدّث بيانات الرحلة بخطوات واضحة."
      : "أدخل التفاصيل يدوياً أو استوردها من التذكرة وحجز الفندق.";

    return `
      <div
        class="tic-module tic-trip-form-page"
        data-trip-form-feature
        data-mode="${escapeHTML(state.activeMode)}"
        data-trip-id="${escapeHTML(trip.id)}"
      >
        <section class="tic-trip-form-intro">
          <div>
            <span>${isEditing ? "TRIP UPDATE" : "NEW JOURNEY"}</span>
            <h1>${escapeHTML(pageTitle)}</h1>
            <p>${escapeHTML(pageSubtitle)}</p>
          </div>

          <button
            type="button"
            class="tic-icon-btn"
            data-tic-action="trip-form-cancel"
            aria-label="إغلاق"
          >
            ×
          </button>
        </section>

        ${renderStepper()}

        <form
          class="tic-form tic-trip-wizard"
          data-trip-form
          novalidate
        >
          <input
            type="hidden"
            name="id"
            value="${escapeHTML(trip.id)}"
          >

          <section
            class="tic-trip-form-step"
            data-trip-step="1"
            ${state.activeStep === 1 ? "" : "hidden"}
          >
            ${renderStepHeader(
              1,
              "معلومات الرحلة",
              "ابدأ باسم الرحلة والوجهة وطبيعة السفر."
            )}

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field is-full">
                  <label for="trip-title">
                    اسم الرحلة
                    <span>*</span>
                  </label>

                  <input
                    id="trip-title"
                    class="tic-input"
                    type="text"
                    name="title"
                    value="${escapeHTML(trip.title)}"
                    placeholder="مثال: رحلة ألماتي العائلية"
                    required
                  >

                  ${renderError("title")}
                </div>

                <div class="tic-field is-full">
                  <label for="trip-destination">
                    الوجهة الرئيسية
                    <span>*</span>
                  </label>

                  <input
                    id="trip-destination"
                    class="tic-input"
                    type="text"
                    name="destination"
                    value="${escapeHTML(trip.destination)}"
                    placeholder="مثال: ألماتي، كازاخستان"
                    required
                  >

                  ${renderError("destination")}
                </div>

                <div class="tic-field">
                  <label for="trip-country">الدولة</label>

                  <input
                    id="trip-country"
                    class="tic-input"
                    type="text"
                    name="country"
                    value="${escapeHTML(trip.country)}"
                    placeholder="اسم الدولة"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-city">المدينة</label>

                  <input
                    id="trip-city"
                    class="tic-input"
                    type="text"
                    name="city"
                    value="${escapeHTML(trip.city)}"
                    placeholder="اسم المدينة"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-type">نوع الرحلة</label>

                  <select
                    id="trip-type"
                    class="tic-select"
                    name="tripType"
                  >
                    ${renderOptions(TRIP_TYPES, trip.tripType)}
                  </select>
                </div>

                <div class="tic-field">
                  <label for="trip-style">أسلوب السفر</label>

                  <select
                    id="trip-style"
                    class="tic-select"
                    name="travelStyle"
                  >
                    ${renderOptions(TRAVEL_STYLES, trip.travelStyle)}
                  </select>
                </div>

                <div class="tic-field">
                  <label for="trip-status">الحالة</label>

                  <select
                    id="trip-status"
                    class="tic-select"
                    name="status"
                  >
                    ${renderOptions(TRIP_STATUSES, trip.status)}
                  </select>
                </div>

                <div class="tic-field">
                  <label for="trip-priority">الأولوية</label>

                  <select
                    id="trip-priority"
                    class="tic-select"
                    name="priority"
                  >
                    ${renderOptions(PRIORITIES, trip.priority)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section
            class="tic-trip-form-step"
            data-trip-step="2"
            ${state.activeStep === 2 ? "" : "hidden"}
          >
            ${renderStepHeader(
              2,
              "المواعيد والمسافرون",
              "حدد تواريخ الرحلة وعدد المسافرين."
            )}

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field">
                  <label for="trip-start-date">
                    تاريخ المغادرة
                    <span>*</span>
                  </label>

                  <input
                    id="trip-start-date"
                    class="tic-input"
                    type="date"
                    name="startDate"
                    value="${escapeHTML(trip.startDate)}"
                    required
                  >

                  ${renderError("startDate")}
                </div>

                <div class="tic-field">
                  <label for="trip-end-date">
                    تاريخ العودة
                    <span>*</span>
                  </label>

                  <input
                    id="trip-end-date"
                    class="tic-input"
                    type="date"
                    name="endDate"
                    value="${escapeHTML(trip.endDate)}"
                    required
                  >

                  ${renderError("endDate")}
                </div>

                <div class="tic-field is-full">
                  <article class="tic-trip-duration-card">
                    <span>مدة الرحلة</span>
                    <strong data-trip-duration>${duration} يوم</strong>
                  </article>
                </div>

                <div class="tic-field">
                  <label for="trip-travelers">
                    إجمالي المسافرين
                    <span>*</span>
                  </label>

                  <input
                    id="trip-travelers"
                    class="tic-input"
                    type="number"
                    name="travelers"
                    min="1"
                    max="99"
                    step="1"
                    value="${escapeHTML(trip.travelers)}"
                    required
                  >

                  ${renderError("travelers")}
                </div>

                <div class="tic-field">
                  <label for="trip-adults">البالغون</label>

                  <input
                    id="trip-adults"
                    class="tic-input"
                    type="number"
                    name="adults"
                    min="0"
                    max="99"
                    value="${escapeHTML(trip.adults)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-children">الأطفال</label>

                  <input
                    id="trip-children"
                    class="tic-input"
                    type="number"
                    name="children"
                    min="0"
                    max="99"
                    value="${escapeHTML(trip.children)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-infants">الرضع</label>

                  <input
                    id="trip-infants"
                    class="tic-input"
                    type="number"
                    name="infants"
                    min="0"
                    max="99"
                    value="${escapeHTML(trip.infants)}"
                  >
                </div>
              </div>
            </div>
          </section>

          <section
            class="tic-trip-form-step"
            data-trip-step="3"
            ${state.activeStep === 3 ? "" : "hidden"}
          >
            ${renderStepHeader(
              3,
              "الطيران والتذكرة",
              "ارفع التذكرة للتعبئة الذكية أو أدخل البيانات يدوياً."
            )}

            <div class="tic-trip-import-grid">
              ${renderImportCard({
                type: "ticket",
                title: "استيراد تذكرة الطيران",
                description:
                  "ارفع صورة أو PDF، وسيتم تجهيز البيانات للتعبئة التلقائية.",
                action: "trip-form-select-ticket",
                inputName: "ticketFile",
                accept: "image/*,.pdf,application/pdf"
              })}
            </div>

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field">
                  <label for="trip-departure-airport">مطار المغادرة</label>

                  <input
                    id="trip-departure-airport"
                    class="tic-input"
                    type="text"
                    name="departureAirport"
                    value="${escapeHTML(trip.departureAirport)}"
                    placeholder="مثال: AUH"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-arrival-airport">مطار الوصول</label>

                  <input
                    id="trip-arrival-airport"
                    class="tic-input"
                    type="text"
                    name="arrivalAirport"
                    value="${escapeHTML(trip.arrivalAirport)}"
                    placeholder="مثال: ALA"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-airline">شركة الطيران</label>

                  <input
                    id="trip-airline"
                    class="tic-input"
                    type="text"
                    name="airline"
                    value="${escapeHTML(trip.airline)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-flight-number">رقم الرحلة</label>

                  <input
                    id="trip-flight-number"
                    class="tic-input"
                    type="text"
                    name="flightNumber"
                    value="${escapeHTML(trip.flightNumber)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-departure-date">تاريخ الإقلاع</label>

                  <input
                    id="trip-departure-date"
                    class="tic-input"
                    type="date"
                    name="departureDate"
                    value="${escapeHTML(trip.departureDate)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-departure-time">وقت الإقلاع</label>

                  <input
                    id="trip-departure-time"
                    class="tic-input"
                    type="time"
                    name="departureTime"
                    value="${escapeHTML(trip.departureTime)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-arrival-date">تاريخ الوصول</label>

                  <input
                    id="trip-arrival-date"
                    class="tic-input"
                    type="date"
                    name="arrivalDate"
                    value="${escapeHTML(trip.arrivalDate)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-arrival-time">وقت الوصول</label>

                  <input
                    id="trip-arrival-time"
                    class="tic-input"
                    type="time"
                    name="arrivalTime"
                    value="${escapeHTML(trip.arrivalTime)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-terminal">المبنى / Terminal</label>

                  <input
                    id="trip-terminal"
                    class="tic-input"
                    type="text"
                    name="terminal"
                    value="${escapeHTML(trip.terminal)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-gate">البوابة / Gate</label>

                  <input
                    id="trip-gate"
                    class="tic-input"
                    type="text"
                    name="gate"
                    value="${escapeHTML(trip.gate)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-seat-number">رقم المقعد</label>

                  <input
                    id="trip-seat-number"
                    class="tic-input"
                    type="text"
                    name="seatNumber"
                    value="${escapeHTML(trip.seatNumber)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-booking-reference">رقم الحجز / PNR</label>

                  <input
                    id="trip-booking-reference"
                    class="tic-input"
                    type="text"
                    name="bookingReference"
                    value="${escapeHTML(trip.bookingReference)}"
                  >
                </div>

                <div class="tic-field is-full">
                  <label for="trip-airport-lead">
                    التواجد في المطار قبل الإقلاع
                  </label>

                  <select
                    id="trip-airport-lead"
                    class="tic-select"
                    name="airportLeadMinutes"
                  >
                    <option value="90" ${number(trip.airportLeadMinutes) === 90 ? "selected" : ""}>
                      قبل ساعة ونصف
                    </option>
                    <option value="120" ${number(trip.airportLeadMinutes) === 120 ? "selected" : ""}>
                      قبل ساعتين
                    </option>
                    <option value="180" ${number(trip.airportLeadMinutes) === 180 ? "selected" : ""}>
                      قبل ثلاث ساعات
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section
            class="tic-trip-form-step"
            data-trip-step="4"
            ${state.activeStep === 4 ? "" : "hidden"}
          >
            ${renderStepHeader(
              4,
              "الفندق والإقامة",
              "ارفع حجز الفندق للتعبئة الذكية أو أكمل البيانات يدوياً."
            )}

            <div class="tic-trip-import-grid">
              ${renderImportCard({
                type: "hotel",
                title: "استيراد حجز الفندق",
                description:
                  "ارفع صورة أو PDF للحجز وسيتم تجهيز تفاصيل الإقامة.",
                action: "trip-form-select-hotel",
                inputName: "hotelFile",
                accept: "image/*,.pdf,application/pdf"
              })}
            </div>

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field is-full">
                  <label for="trip-accommodation">مكان الإقامة</label>

                  <input
                    id="trip-accommodation"
                    class="tic-input"
                    type="text"
                    name="accommodation"
                    value="${escapeHTML(trip.accommodation)}"
                    placeholder="اسم الفندق أو الشقة"
                  >
                </div>

                <div class="tic-field is-full">
                  <label for="trip-accommodation-address">عنوان الإقامة</label>

                  <input
                    id="trip-accommodation-address"
                    class="tic-input"
                    type="text"
                    name="accommodationAddress"
                    value="${escapeHTML(trip.accommodationAddress)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-hotel-booking-reference">رقم حجز الفندق</label>

                  <input
                    id="trip-hotel-booking-reference"
                    class="tic-input"
                    type="text"
                    name="hotelBookingReference"
                    value="${escapeHTML(trip.hotelBookingReference)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-hotel-check-in">تسجيل الدخول</label>

                  <input
                    id="trip-hotel-check-in"
                    class="tic-input"
                    type="date"
                    name="hotelCheckIn"
                    value="${escapeHTML(trip.hotelCheckIn)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-hotel-check-out">تسجيل الخروج</label>

                  <input
                    id="trip-hotel-check-out"
                    class="tic-input"
                    type="date"
                    name="hotelCheckOut"
                    value="${escapeHTML(trip.hotelCheckOut)}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-transport">التنقل داخل الوجهة</label>

                  <input
                    id="trip-transport"
                    class="tic-input"
                    type="text"
                    name="transport"
                    value="${escapeHTML(trip.transport)}"
                  >
                </div>
              </div>
            </div>
          </section>

          <section
            class="tic-trip-form-step"
            data-trip-step="5"
            ${state.activeStep === 5 ? "" : "hidden"}
          >
            ${renderStepHeader(
              5,
              "الميزانية والتفاصيل",
              "حدد ميزانيتك وأضف الأنشطة والملاحظات المهمة."
            )}

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field">
                  <label for="trip-budget">
                    الميزانية الإجمالية
                    <span>*</span>
                  </label>

                  <input
                    id="trip-budget"
                    class="tic-input"
                    type="number"
                    name="budget"
                    min="0"
                    step="0.01"
                    value="${escapeHTML(trip.budget)}"
                    required
                  >

                  ${renderError("budget")}
                </div>

                <div class="tic-field">
                  <label for="trip-spent">المصروف حتى الآن</label>

                  <input
                    id="trip-spent"
                    class="tic-input"
                    type="number"
                    name="spent"
                    min="0"
                    step="0.01"
                    value="${escapeHTML(trip.spent)}"
                  >
                </div>

                <div class="tic-field is-full">
                  <div class="tic-budget-overview tic-trip-budget-preview">
                    <small>استخدام الميزانية</small>

                    <strong data-budget-percentage>${budgetUsage}%</strong>

                    <div style="margin-top:16px">
                      <div class="tic-progress">
                        <span
                          class="tic-progress-bar"
                          data-budget-progress
                          style="width:${budgetUsage}%"
                        ></span>
                      </div>
                    </div>

                    <p
                      data-budget-caption
                      style="margin-top:12px;color:rgba(255,255,255,.72)"
                    >
                      ${formatCurrency(trip.spent)}
                      من
                      ${formatCurrency(trip.budget)}
                    </p>
                  </div>
                </div>

                <div class="tic-field is-full">
                  <label for="trip-activities">الأنشطة</label>

                  <textarea
                    id="trip-activities"
                    class="tic-textarea"
                    name="activities"
                    rows="5"
                    placeholder="اكتب كل نشاط في سطر منفصل"
                  >${escapeHTML(joinList(trip.activities))}</textarea>
                </div>

                <div class="tic-field is-full">
                  <label for="trip-notes">ملاحظات الرحلة</label>

                  <textarea
                    id="trip-notes"
                    class="tic-textarea"
                    name="notes"
                    rows="4"
                    placeholder="معلومات مهمة أو تفضيلات خاصة"
                  >${escapeHTML(trip.notes)}</textarea>
                </div>

                <div class="tic-field is-full">
                  <label for="trip-emergency-contact">جهة اتصال للطوارئ</label>

                  <input
                    id="trip-emergency-contact"
                    class="tic-input"
                    type="text"
                    name="emergencyContact"
                    value="${escapeHTML(trip.emergencyContact)}"
                  >
                </div>

                <div class="tic-field is-full">
                  <div class="tic-settings-list">
                    <label class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-icon">▣</div>

                        <div class="tic-settings-copy">
                          <strong>تحتاج تأشيرة</strong>
                          <small>أضفها إلى متطلبات الرحلة.</small>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        name="visaRequired"
                        value="true"
                        ${trip.visaRequired ? "checked" : ""}
                      >
                    </label>

                    <label class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-icon">✓</div>

                        <div class="tic-settings-copy">
                          <strong>تحتاج تأمين سفر</strong>
                          <small>تذكير بالتأمين قبل السفر.</small>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        name="insuranceRequired"
                        value="true"
                        ${trip.insuranceRequired ? "checked" : ""}
                      >
                    </label>

                    <label class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-icon">★</div>

                        <div class="tic-settings-copy">
                          <strong>رحلة مميزة</strong>
                          <small>تظهر بشكل بارز في التطبيق.</small>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        name="featured"
                        value="true"
                        ${trip.featured ? "checked" : ""}
                      >
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            class="tic-trip-form-step"
            data-trip-step="6"
            ${state.activeStep === 6 ? "" : "hidden"}
          >
            ${renderStepHeader(
              6,
              "مراجعة الرحلة",
              "راجع أهم البيانات قبل الحفظ."
            )}

            <div class="tic-trip-review-grid" data-trip-review>
              <article class="tic-trip-review-card">
                <span>الرحلة</span>
                <strong data-review-title>${escapeHTML(trip.title || "لم يحدد")}</strong>
                <small data-review-destination>${escapeHTML(trip.destination || "لم تحدد الوجهة")}</small>
              </article>

              <article class="tic-trip-review-card">
                <span>المواعيد</span>
                <strong data-review-dates>
                  ${escapeHTML(
                    trip.startDate && trip.endDate
                      ? `${trip.startDate} — ${trip.endDate}`
                      : "لم تحدد"
                  )}
                </strong>
                <small data-review-duration>${duration} يوم</small>
              </article>

              <article class="tic-trip-review-card">
                <span>الطيران</span>
                <strong data-review-flight>
                  ${escapeHTML(
                    [trip.airline, trip.flightNumber]
                      .filter(Boolean)
                      .join(" • ") || "لم يضف"
                  )}
                </strong>
                <small data-review-departure>
                  ${escapeHTML(
                    [trip.departureDate, trip.departureTime]
                      .filter(Boolean)
                      .join(" • ") || "لا يوجد موعد إقلاع"
                  )}
                </small>
              </article>

              <article class="tic-trip-review-card">
                <span>الإقامة</span>
                <strong data-review-hotel>${escapeHTML(trip.accommodation || "لم تضف")}</strong>
                <small data-review-hotel-ref>${escapeHTML(trip.hotelBookingReference || "لا يوجد رقم حجز")}</small>
              </article>

              <article class="tic-trip-review-card">
                <span>المسافرون</span>
                <strong data-review-travelers>${escapeHTML(trip.travelers)}</strong>
                <small>إجمالي المسافرين</small>
              </article>

              <article class="tic-trip-review-card">
                <span>الميزانية</span>
                <strong data-review-budget>${escapeHTML(formatCurrency(trip.budget))}</strong>
                <small>الميزانية الإجمالية</small>
              </article>
            </div>
          </section>

          <footer class="tic-trip-form-actions">
            <button
              type="button"
              class="tic-btn tic-btn-secondary"
              data-trip-step-previous
              ${state.activeStep === 1 ? "disabled" : ""}
            >
              السابق
            </button>

            <button
              type="button"
              class="tic-btn tic-btn-primary"
              data-trip-step-next
              ${state.activeStep === TOTAL_STEPS ? "hidden" : ""}
            >
              التالي
            </button>

            <button
              type="submit"
              class="tic-btn tic-btn-primary"
              data-trip-form-submit
              ${state.activeStep === TOTAL_STEPS ? "" : "hidden"}
            >
              ${isEditing ? "حفظ التعديلات" : "إنشاء الرحلة"}
            </button>
          </footer>
        </form>
      </div>
    `;
  };

  const getFormData = (form) => {
    const formData = new FormData(form);

    const data = {
      id: text(formData.get("id")) || createId(),
      title: text(formData.get("title")),
      destination: text(formData.get("destination")),
      country: text(formData.get("country")),
      city: text(formData.get("city")),
      tripType: text(formData.get("tripType")),
      travelStyle: text(formData.get("travelStyle")),
      status: text(formData.get("status")) || "planning",
      priority: text(formData.get("priority")) || "normal",

      startDate: normalizeDate(formData.get("startDate")),
      endDate: normalizeDate(formData.get("endDate")),

      travelers: Math.max(
        1,
        Math.round(number(formData.get("travelers"), 1))
      ),
      adults: Math.max(
        0,
        Math.round(number(formData.get("adults")))
      ),
      children: Math.max(
        0,
        Math.round(number(formData.get("children")))
      ),
      infants: Math.max(
        0,
        Math.round(number(formData.get("infants")))
      ),

      budget: Math.max(0, number(formData.get("budget"))),
      spent: Math.max(0, number(formData.get("spent"))),
      currency: Config.currency || "AED",

      departureAirport: text(formData.get("departureAirport")),
      arrivalAirport: text(formData.get("arrivalAirport")),
      airline: text(formData.get("airline")),
      flightNumber: text(formData.get("flightNumber")),
      departureDate: normalizeDate(formData.get("departureDate")),
      departureTime: normalizeTime(formData.get("departureTime")),
      arrivalDate: normalizeDate(formData.get("arrivalDate")),
      arrivalTime: normalizeTime(formData.get("arrivalTime")),
      terminal: text(formData.get("terminal")),
      gate: text(formData.get("gate")),
      seatNumber: text(formData.get("seatNumber")),
      bookingReference: text(formData.get("bookingReference")),
      airportLeadMinutes: Math.max(
        0,
        number(formData.get("airportLeadMinutes"), 120)
      ),

      accommodation: text(formData.get("accommodation")),
      accommodationAddress: text(formData.get("accommodationAddress")),
      hotelBookingReference: text(formData.get("hotelBookingReference")),
      hotelCheckIn: normalizeDate(formData.get("hotelCheckIn")),
      hotelCheckOut: normalizeDate(formData.get("hotelCheckOut")),

      transport: text(formData.get("transport")),
      activities: splitList(formData.get("activities")),
      notes: text(formData.get("notes")),
      emergencyContact: text(formData.get("emergencyContact")),

      visaRequired: formData.get("visaRequired") === "true",
      insuranceRequired:
        formData.get("insuranceRequired") === "true",
      featured: formData.get("featured") === "true"
    };

    data.durationDays = calculateDuration(
      data.startDate,
      data.endDate
    );

    if (state.importedTicketFile) {
      data.ticketImport = {
        name: state.importedTicketFile.name,
        type: state.importedTicketFile.type,
        size: state.importedTicketFile.size,
        importedAt: new Date().toISOString()
      };
    }

    if (state.importedHotelFile) {
      data.hotelImport = {
        name: state.importedHotelFile.name,
        type: state.importedHotelFile.type,
        size: state.importedHotelFile.size,
        importedAt: new Date().toISOString()
      };
    }

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
        "عدد المسافرين يجب أن يكون واحداً على الأقل.";
    }

    if (data.budget < 0) {
      errors.budget =
        "الميزانية لا يمكن أن تكون سالبة.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  };

  const validateStep = (step, form) => {
    const data = getFormData(form);
    const validation = validate(data);
    const fieldsByStep = {
      1: ["title", "destination"],
      2: ["startDate", "endDate", "travelers"],
      3: [],
      4: [],
      5: ["budget"],
      6: []
    };

    const allowed = new Set(fieldsByStep[step] || []);

    const errors = Object.fromEntries(
      Object.entries(validation.errors).filter(
        ([name]) => allowed.has(name)
      )
    );

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

    Object.entries(errors).forEach(([name, message]) => {
      const input = form.elements[name];

      const errorElement = form.querySelector(
        `[data-error-for="${name}"]`
      );

      if (input) {
        input.setAttribute("aria-invalid", "true");

        input
          .closest(".tic-field")
          ?.classList.add("has-error");
      }

      if (errorElement) {
        errorElement.textContent = message;
        errorElement.hidden = false;
      }
    });

    const first = Object.keys(errors)[0];

    form.elements[first]?.focus();
  };

  const applyDataToForm = (form, data = {}) => {
    if (!form || !isObject(data)) return false;

    Object.entries(data).forEach(([name, value]) => {
      const field = form.elements[name];

      if (!field || value === undefined || value === null) {
        return;
      }

      if (field.type === "checkbox") {
        field.checked = Boolean(value);
        return;
      }

      if (Array.isArray(value)) {
        field.value = value.join("\n");
        return;
      }

      field.value = value;
    });

    updateLiveSummary(form);
    updateReview(form);

    return true;
  };

  const setImportStatus = (type, message, tone = "neutral") => {
    const element = state.activeContainer?.querySelector(
      `[data-trip-import-status="${type}"]`
    );

    if (!element) return;

    element.textContent = message;
    element.dataset.tone = tone;
  };

  const processImport = async (type, file) => {
    const ui = getUI();

    if (!file) return false;

    const importer =
      type === "ticket"
        ? getTicketImporter()
        : getHotelImporter();

    const reader = getDocumentReader();

    setImportStatus(
      type,
      `تم اختيار: ${file.name}`,
      "info"
    );

    emit("import-selected", {
      type,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    if (
      importer &&
      typeof importer.parse === "function"
    ) {
      try {
        ui?.showLoader?.(
          type === "ticket"
            ? "جاري قراءة التذكرة..."
            : "جاري قراءة حجز الفندق..."
        );

        const result = await importer.parse(file, {
          reader,
          mode: state.activeMode,
          tripId: state.activeTripId
        });

        if (isObject(result)) {
          applyDataToForm(
            state.activeForm,
            result.data || result
          );

          setImportStatus(
            type,
            "تمت قراءة البيانات وتعبئة الحقول.",
            "success"
          );

          ui?.toast?.(
            "تمت تعبئة البيانات المستخرجة. راجعها قبل الحفظ.",
            "success"
          );

          emit("import-completed", {
            type,
            result
          });

          return result;
        }
      } catch (error) {
        console.error(
          `TIC ${type} import error:`,
          error
        );

        setImportStatus(
          type,
          "تعذر استخراج البيانات. يمكنك إدخالها يدوياً.",
          "warning"
        );

        ui?.toast?.(
          "تعذر استخراج البيانات من الملف.",
          "warning"
        );

        return false;
      } finally {
        ui?.hideLoader?.();
      }
    }

    setImportStatus(
      type,
      "تم حفظ الملف. قارئ المستندات سيُضاف في الملف التالي.",
      "warning"
    );

    ui?.toast?.(
      "تم اختيار الملف. التعبئة الذكية تحتاج قارئ المستندات القادم.",
      "info"
    );

    return {
      pending: true,
      type,
      fileName: file.name
    };
  };

  const selectImportFile = (type) => {
    const input = state.activeContainer?.querySelector(
      `[data-trip-import-input="${type}"]`
    );

    if (!input) return false;

    input.click();
    return true;
  };

  const handleImportChange = async (event) => {
    const input = event.target;

    if (!input.matches("[data-trip-import-input]")) {
      return;
    }

    const type = input.dataset.tripImportInput;
    const file = input.files?.[0] || null;

    if (!file) return;

    if (type === "ticket") {
      state.importedTicketFile = file;
    } else if (type === "hotel") {
      state.importedHotelFile = file;
    }

    await processImport(type, file);
  };

  const updateLiveSummary = (form) => {
    if (!form) return;

    const duration = calculateDuration(
      form.elements.startDate?.value,
      form.elements.endDate?.value
    );

    const durationElement = form.querySelector(
      "[data-trip-duration]"
    );

    if (durationElement) {
      durationElement.textContent = `${duration} يوم`;
    }

    const budget = number(
      form.elements.budget?.value
    );

    const spent = number(
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
      percentageElement.textContent = `${percentage}%`;
    }

    if (progressElement) {
      progressElement.style.width = `${percentage}%`;
    }

    if (captionElement) {
      captionElement.textContent =
        `${formatCurrency(spent)} من ${formatCurrency(budget)}`;
    }
  };

  const updateReview = (form) => {
    if (!form) return;

    const data = getFormData(form);

    const set = (selector, value) => {
      const element = form.querySelector(selector);
      if (element) {
        element.textContent = value;
      }
    };

    set("[data-review-title]", data.title || "لم يحدد");
    set(
      "[data-review-destination]",
      data.destination || "لم تحدد الوجهة"
    );
    set(
      "[data-review-dates]",
      data.startDate && data.endDate
        ? `${data.startDate} — ${data.endDate}`
        : "لم تحدد"
    );
    set(
      "[data-review-duration]",
      `${data.durationDays} يوم`
    );
    set(
      "[data-review-flight]",
      [data.airline, data.flightNumber]
        .filter(Boolean)
        .join(" • ") || "لم يضف"
    );
    set(
      "[data-review-departure]",
      [data.departureDate, data.departureTime]
        .filter(Boolean)
        .join(" • ") || "لا يوجد موعد إقلاع"
    );
    set(
      "[data-review-hotel]",
      data.accommodation || "لم تضف"
    );
    set(
      "[data-review-hotel-ref]",
      data.hotelBookingReference || "لا يوجد رقم حجز"
    );
    set(
      "[data-review-travelers]",
      String(data.travelers)
    );
    set(
      "[data-review-budget]",
      formatCurrency(data.budget)
    );
  };

  const showStep = (step) => {
    const form = state.activeForm;
    const container = state.activeContainer;

    if (!form || !container) return false;

    const nextStep = Math.max(
      1,
      Math.min(TOTAL_STEPS, number(step, 1))
    );

    state.activeStep = nextStep;

    container
      .querySelectorAll("[data-trip-step]")
      .forEach((section) => {
        section.hidden =
          number(section.dataset.tripStep) !== nextStep;
      });

    container
      .querySelectorAll("[data-trip-step-target]")
      .forEach((button) => {
        const buttonStep = number(
          button.dataset.tripStepTarget
        );

        button.classList.toggle(
          "is-active",
          buttonStep === nextStep
        );

        button.classList.toggle(
          "is-complete",
          buttonStep < nextStep
        );

        button.setAttribute(
          "aria-current",
          buttonStep === nextStep
            ? "step"
            : "false"
        );
      });

    const previous = form.querySelector(
      "[data-trip-step-previous]"
    );

    const next = form.querySelector(
      "[data-trip-step-next]"
    );

    const submit = form.querySelector(
      "[data-trip-form-submit]"
    );

    if (previous) {
      previous.disabled = nextStep === 1;
    }

    if (next) {
      next.hidden = nextStep === TOTAL_STEPS;
    }

    if (submit) {
      submit.hidden = nextStep !== TOTAL_STEPS;
    }

    if (nextStep === TOTAL_STEPS) {
      updateReview(form);
    }

    container
      .querySelector("[data-trip-form-feature]")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    emit("step-changed", {
      step: nextStep,
      totalSteps: TOTAL_STEPS
    });

    return true;
  };

  const goToNextStep = () => {
    const form = state.activeForm;

    if (!form) return false;

    const result = validateStep(
      state.activeStep,
      form
    );

    if (!result.valid) {
      showErrors(form, result.errors);

      getUI()?.toast?.(
        "أكمل الحقول المطلوبة قبل الانتقال.",
        "warning"
      );

      return false;
    }

    clearErrors(form);

    return showStep(
      Math.min(TOTAL_STEPS, state.activeStep + 1)
    );
  };

  const goToPreviousStep = () =>
    showStep(
      Math.max(1, state.activeStep - 1)
    );

  const getTrips = () => {
    const store = getStore();

    const trips =
      store?.get?.("trips") ||
      store?.getState?.()?.trips ||
      [];

    return Array.isArray(trips)
      ? clone(trips)
      : [];
  };

  const saveTripsFallback = (trips) => {
    const store = getStore();

    if (!store) {
      throw new Error(
        "TIC Trip Form Error: store is unavailable."
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
      "TIC Trip Form Error: persistence is unavailable."
    );
  };

  const saveTrip = async (tripData) => {
    const store = getStore();

    if (!store) {
      throw new Error(
        "TIC Trip Form Error: store is unavailable."
      );
    }

    const now = new Date().toISOString();

    if (state.activeMode === "edit") {
      const existing =
        findTrip(state.activeTripId) || {};

      const updated = {
        ...existing,
        ...tripData,
        id: existing.id || tripData.id,
        createdAt:
          existing.createdAt ||
          tripData.createdAt ||
          now,
        updatedAt: now
      };

      if (typeof store.updateTrip === "function") {
        await store.updateTrip(
          updated.id,
          updated
        );

        return updated;
      }

      if (typeof store.upsertTrip === "function") {
        await store.upsertTrip(updated);
        return updated;
      }

      const trips = getTrips();

      const index = trips.findIndex(
        (trip) =>
          String(trip.id) === String(updated.id)
      );

      if (index >= 0) {
        trips[index] = updated;
      } else {
        trips.unshift(updated);
      }

      saveTripsFallback(trips);

      return updated;
    }

    const created = {
      ...tripData,
      id: tripData.id || createId(),
      createdAt: now,
      updatedAt: now
    };

    if (typeof store.addTrip === "function") {
      return (await store.addTrip(created)) || created;
    }

    if (typeof store.createTrip === "function") {
      return (await store.createTrip(created)) || created;
    }

    if (typeof store.upsertTrip === "function") {
      await store.upsertTrip(created);
      return created;
    }

    const trips = getTrips();
    trips.unshift(created);
    saveTripsFallback(trips);

    return created;
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

      const firstError = Object.keys(
        validation.errors
      )[0];

      const stepMap = {
        title: 1,
        destination: 1,
        startDate: 2,
        endDate: 2,
        travelers: 2,
        budget: 5
      };

      showStep(stepMap[firstError] || 1);

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
      submitButton.setAttribute("aria-busy", "true");
    }

    try {
      ui?.showLoader?.(
        state.activeMode === "edit"
          ? "جاري حفظ التعديلات..."
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

      await getRouter()?.go?.(
        "trips",
        {
          params: {
            tripId: savedTrip.id,
            view: "details"
          },
          source: "trip-form-save"
        }
      );

      return savedTrip;
    } catch (error) {
      console.error(
        "TIC Trip Form save error:",
        error
      );

      ui?.toast?.(
        "تعذر حفظ الرحلة.",
        "error"
      );

      return false;
    } finally {
      ui?.hideLoader?.();

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    }
  };

  const handleFormInput = (event) => {
    const form = event.currentTarget;

    updateLiveSummary(form);
    updateReview(form);

    const name = event.target?.name;

    if (!name) return;

    const errorElement = form.querySelector(
      `[data-error-for="${name}"]`
    );

    if (errorElement) {
      errorElement.textContent = "";
      errorElement.hidden = true;
    }

    event.target.removeAttribute("aria-invalid");

    event.target
      .closest(".tic-field")
      ?.classList.remove("has-error");
  };

  const handleWizardClick = (event) => {
    const targetButton = event.target.closest(
      "[data-trip-step-target]"
    );

    if (targetButton) {
      const targetStep = number(
        targetButton.dataset.tripStepTarget
      );

      if (targetStep <= state.activeStep) {
        showStep(targetStep);
      }

      return;
    }

    if (
      event.target.closest("[data-trip-step-next]")
    ) {
      goToNextStep();
      return;
    }

    if (
      event.target.closest("[data-trip-step-previous]")
    ) {
      goToPreviousStep();
    }
  };

  const bindForm = (container) => {
    const form = container?.querySelector(
      "[data-trip-form]"
    );

    if (!form) return false;

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

      state.activeForm.removeEventListener(
        "click",
        handleWizardClick
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

    form.addEventListener(
      "change",
      handleImportChange
    );

    form.addEventListener(
      "click",
      handleWizardClick
    );

    updateLiveSummary(form);
    updateReview(form);
    showStep(state.activeStep);

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
        const register = (name, handler) => {
          if (ui.hasAction?.(name)) {
            return;
          }

          state.actionUnsubscribers.push(
            ui.registerAction(name, handler)
          );
        };

        register(
          "new-trip",
          () => this.openCreate()
        );

        register(
          "create-trip",
          () => this.openCreate()
        );

        register(
          "edit-trip",
          ({ params }) =>
            this.openEdit(
              params.tripId ||
              params.id
            )
        );

        register(
          "trip-form-cancel",
          () => this.cancel()
        );

        register(
          "trip-form-select-ticket",
          () => selectImportFile("ticket")
        );

        register(
          "trip-form-select-hotel",
          () => selectImportFile("hotel")
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
        context.params?.mode === "edit" ||
        context.params?.tripId
          ? "edit"
          : "create";

      state.activeTripId =
        context.tripId ||
        context.params?.tripId ||
        null;

      state.activeStep = 1;
      state.importedTicketFile = null;
      state.importedHotelFile = null;

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Trip Form Error: route container not found."
        );
      }

      state.activeContainer = container;

      container.innerHTML = renderForm(
        getActiveTrip()
      );

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
        context.params?.mode === "edit" ||
        context.params?.tripId
          ? "edit"
          : "create";

      state.activeTripId =
        context.tripId ||
        context.params?.tripId ||
        null;

      state.activeStep = 1;

      return renderForm(
        getActiveTrip()
      );
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

        state.activeForm.removeEventListener(
          "change",
          handleImportChange
        );

        state.activeForm.removeEventListener(
          "click",
          handleWizardClick
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
      state.activeStep = 1;

      const router = getRouter();

      if (
        router &&
        typeof router.go === "function"
      ) {
        return router.go(
          "trip-form",
          {
            ...options,
            params: {
              ...(options.params || {}),
              mode: "create",
              smartImport:
                options.smartImport !== false
            },
            source: "trip-form-open-create"
          }
        );
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
          "تعذر العثور على الرحلة.",
          "error"
        );

        return false;
      }

      state.activeMode = "edit";
      state.activeTripId = tripId;
      state.activeStep = 1;

      const router = getRouter();

      if (
        router &&
        typeof router.go === "function"
      ) {
        return router.go(
          "trip-form",
          {
            ...options,
            params: {
              ...(options.params || {}),
              mode: "edit",
              tripId,
              smartImport:
                options.smartImport !== false
            },
            source: "trip-form-open-edit"
          }
        );
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
        const data = getFormData(
          state.activeForm
        );

        const hasContent = Boolean(
          data.title ||
          data.destination ||
          data.startDate ||
          data.endDate ||
          data.notes ||
          state.importedTicketFile ||
          state.importedHotelFile
        );

        if (hasContent) {
          const confirmed = await ui?.confirm?.({
            title: "إلغاء الرحلة",
            message:
              "سيتم تجاهل البيانات غير المحفوظة.",
            confirmLabel: "نعم، إلغاء",
            cancelLabel: "العودة للنموذج",
            danger: true
          });

          if (confirmed !== true) {
            return false;
          }
        }
      }

      emit("cancelled", {
        mode: state.activeMode,
        tripId: state.activeTripId
      });

      return getRouter()?.go?.(
        "trips",
        {
          source: "trip-form-cancel"
        }
      );
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
      return clone(
        findTrip(tripId)
      );
    },

    getMode() {
      return state.activeMode;
    },

    getActiveTripId() {
      return state.activeTripId;
    },

    getActiveStep() {
      return state.activeStep;
    },

    goToStep(step) {
      return showStep(step);
    },

    applyImportedData(data) {
      return applyDataToForm(
        state.activeForm,
        data
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Trip Form subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
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
      state.activeStep = 1;
      state.importedTicketFile = null;
      state.importedHotelFile = null;

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        version: this.version,
        initialized: state.initialized,
        activeMode: state.activeMode,
        activeTripId: state.activeTripId,
        activeStep: state.activeStep,
        totalSteps: TOTAL_STEPS,
        hasContainer: Boolean(state.activeContainer),
        hasForm: Boolean(state.activeForm),
        hasTicketFile: Boolean(
          state.importedTicketFile
        ),
        hasHotelFile: Boolean(
          state.importedHotelFile
        ),
        ticketImporterAvailable: Boolean(
          getTicketImporter()
        ),
        hotelImporterAvailable: Boolean(
          getHotelImporter()
        ),
        documentReaderAvailable: Boolean(
          getDocumentReader()
        ),
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

  window.TIC.Features.TripForm =
    TripForm;

  window.TICTripForm = TripForm;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("trip-form")) {
      router.register(
        "trip-form",
        {
          id: "trip-form",
          title: "رحلة جديدة",
          module: "trip-form",
          visible: false,
          order: 99,
          meta: {
            feature: true,
            navigation: false
          }
        }
      );
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
