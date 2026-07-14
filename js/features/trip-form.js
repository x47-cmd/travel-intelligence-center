/* =========================================================
   Travel Intelligence Center
   Trip Form Feature V2.0.0

   File Path:
   js/features/trip-form.js

   Purpose:
   - Premium iPhone-first trip creation and editing flow.
   - Clear five-step layout with live summaries.
   - Validates required travel information.
   - Saves through the central TIC Store.
   - Integrates with TIC UI and TIC Router.

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
  const FEATURE_VERSION = "2.0.0";

  const state = {
    initialized: false,
    activeMode: "create",
    activeTripId: null,
    activeContainer: null,
    activeForm: null,
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
    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      date.getDate()
    ).padStart(2, "0");

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

  const calculateDuration = (
    startDate,
    endDate
  ) => {
    if (!startDate || !endDate) {
      return 0;
    }

    const start =
      new Date(`${startDate}T00:00:00`);

    const end =
      new Date(`${endDate}T00:00:00`);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return 0;
    }

    return (
      Math.floor(
        (
          end.getTime() -
          start.getTime()
        ) / 86400000
      ) + 1
    );
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

    if (
      ui &&
      typeof ui.currency === "function"
    ) {
      return ui.currency(value);
    }

    return `${number(value).toLocaleString()} ${
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
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    };
  };

  const findTrip = (tripId) => {
    if (!tripId) return null;

    const store = getStore();
    if (!store) return null;

    if (
      typeof store.getTripById === "function"
    ) {
      return store.getTripById(tripId);
    }

    const trips =
      store.get?.("trips") ||
      store.getState?.()?.trips ||
      [];

    return Array.isArray(trips)
      ? trips.find(
          (trip) =>
            String(trip.id) ===
            String(tripId)
        ) || null
      : null;
  };

  const mergeTrip = (trip) => ({
    ...getDefaultTrip(),
    ...(isObject(trip)
      ? clone(trip)
      : {}),
    activities:
      Array.isArray(trip?.activities)
        ? clone(trip.activities)
        : splitList(
            trip?.activities || ""
          ),
    startDate:
      normalizeDate(trip?.startDate),
    endDate:
      normalizeDate(trip?.endDate)
  });

  const getActiveTrip = () => {
    if (
      state.activeMode === "edit" &&
      state.activeTripId
    ) {
      return mergeTrip(
        findTrip(state.activeTripId)
      );
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

  const renderError = (name) => `
    <small
      class="tic-form-message"
      data-type="error"
      data-error-for="${escapeHTML(name)}"
      hidden
    ></small>
  `;

  const renderStepHeader = (
    step,
    title,
    subtitle
  ) => `
    <header class="tic-section-heading">
      <div class="tic-section-heading-copy">
        <p class="tic-eyebrow">
          الخطوة ${step}
        </p>

        <h2 class="tic-title">
          ${escapeHTML(title)}
        </h2>

        <p class="tic-subtitle">
          ${escapeHTML(subtitle)}
        </p>
      </div>
    </header>
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
      number(trip.budget) > 0
        ? Math.min(
            100,
            Math.round(
              (
                number(trip.spent) /
                number(trip.budget)
              ) * 100
            )
          )
        : 0;

    const pageTitle = isEditing
      ? "تعديل الرحلة"
      : "رحلة جديدة";

    const pageSubtitle = isEditing
      ? "حدّث المعلومات ثم احفظ التغييرات."
      : "أدخل التفاصيل خطوة بخطوة بطريقة مرتبة وواضحة.";

    return `
      <div
        class="tic-module"
        data-trip-form-feature
        data-mode="${escapeHTML(
          state.activeMode
        )}"
        data-trip-id="${escapeHTML(
          trip.id
        )}"
      >
        ${ui.hero({
          badge:
            isEditing
              ? "Trip Update"
              : "New Journey",
          title: pageTitle,
          subtitle: pageSubtitle,
          actions: [
            {
              label: "إلغاء",
              action:
                "trip-form-cancel"
            }
          ]
        })}

        <form
          class="tic-form"
          data-trip-form
          novalidate
        >
          <input
            type="hidden"
            name="id"
            value="${escapeHTML(trip.id)}"
          >

          <section class="tic-page-section">
            ${renderStepHeader(
              1,
              "معلومات الرحلة",
              "اسم الرحلة والوجهة ونوع السفر."
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
                    value="${escapeHTML(
                      trip.title
                    )}"
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
                    value="${escapeHTML(
                      trip.destination
                    )}"
                    placeholder="مثال: ألماتي، كازاخستان"
                    required
                  >

                  ${renderError("destination")}
                </div>

                <div class="tic-field">
                  <label for="trip-country">
                    الدولة
                  </label>

                  <input
                    id="trip-country"
                    class="tic-input"
                    type="text"
                    name="country"
                    value="${escapeHTML(
                      trip.country
                    )}"
                    placeholder="اسم الدولة"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-city">
                    المدينة
                  </label>

                  <input
                    id="trip-city"
                    class="tic-input"
                    type="text"
                    name="city"
                    value="${escapeHTML(
                      trip.city
                    )}"
                    placeholder="اسم المدينة"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-type">
                    نوع الرحلة
                  </label>

                  <select
                    id="trip-type"
                    class="tic-select"
                    name="tripType"
                  >
                    ${renderOptions(
                      TRIP_TYPES,
                      trip.tripType
                    )}
                  </select>
                </div>

                <div class="tic-field">
                  <label for="trip-style">
                    أسلوب السفر
                  </label>

                  <select
                    id="trip-style"
                    class="tic-select"
                    name="travelStyle"
                  >
                    ${renderOptions(
                      TRAVEL_STYLES,
                      trip.travelStyle
                    )}
                  </select>
                </div>

                <div class="tic-field">
                  <label for="trip-status">
                    الحالة
                  </label>

                  <select
                    id="trip-status"
                    class="tic-select"
                    name="status"
                  >
                    ${renderOptions(
                      TRIP_STATUSES,
                      trip.status
                    )}
                  </select>
                </div>

                <div class="tic-field">
                  <label for="trip-priority">
                    الأولوية
                  </label>

                  <select
                    id="trip-priority"
                    class="tic-select"
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

          <section class="tic-page-section">
            ${renderStepHeader(
              2,
              "المواعيد والمسافرون",
              "حدد موعد السفر وعدد المسافرين."
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
                    value="${escapeHTML(
                      trip.startDate
                    )}"
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
                    value="${escapeHTML(
                      trip.endDate
                    )}"
                    required
                  >

                  ${renderError("endDate")}
                </div>

                <div class="tic-stat-card">
                  <div class="tic-stat-icon">
                    ◷
                  </div>

                  <strong
                    class="tic-stat-value"
                    data-trip-duration
                  >
                    ${duration} يوم
                  </strong>

                  <span class="tic-stat-label">
                    مدة الرحلة
                  </span>
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
                    value="${escapeHTML(
                      trip.travelers
                    )}"
                    required
                  >

                  ${renderError("travelers")}
                </div>

                <div class="tic-field">
                  <label for="trip-adults">
                    البالغون
                  </label>

                  <input
                    id="trip-adults"
                    class="tic-input"
                    type="number"
                    name="adults"
                    min="0"
                    max="99"
                    value="${escapeHTML(
                      trip.adults
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-children">
                    الأطفال
                  </label>

                  <input
                    id="trip-children"
                    class="tic-input"
                    type="number"
                    name="children"
                    min="0"
                    max="99"
                    value="${escapeHTML(
                      trip.children
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-infants">
                    الرضع
                  </label>

                  <input
                    id="trip-infants"
                    class="tic-input"
                    type="number"
                    name="infants"
                    min="0"
                    max="99"
                    value="${escapeHTML(
                      trip.infants
                    )}"
                  >
                </div>
              </div>
            </div>
          </section>

          <section class="tic-page-section">
            ${renderStepHeader(
              3,
              "الميزانية",
              "حدد الميزانية والمبلغ المصروف."
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
                    value="${escapeHTML(
                      trip.budget
                    )}"
                    required
                  >

                  ${renderError("budget")}
                </div>

                <div class="tic-field">
                  <label for="trip-spent">
                    المصروف حتى الآن
                  </label>

                  <input
                    id="trip-spent"
                    class="tic-input"
                    type="number"
                    name="spent"
                    min="0"
                    step="0.01"
                    value="${escapeHTML(
                      trip.spent
                    )}"
                  >
                </div>

                <div class="tic-field is-full">
                  <div class="tic-budget-overview">
                    <small>
                      استخدام الميزانية
                    </small>

                    <strong data-budget-percentage>
                      ${budgetUsage}%
                    </strong>

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
                      ${formatCurrency(
                        trip.spent
                      )}
                      من
                      ${formatCurrency(
                        trip.budget
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="tic-page-section">
            ${renderStepHeader(
              4,
              "الطيران والإقامة",
              "أضف معلومات الحجز الأساسية."
            )}

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field">
                  <label for="trip-departure-airport">
                    مطار المغادرة
                  </label>

                  <input
                    id="trip-departure-airport"
                    class="tic-input"
                    type="text"
                    name="departureAirport"
                    value="${escapeHTML(
                      trip.departureAirport
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-arrival-airport">
                    مطار الوصول
                  </label>

                  <input
                    id="trip-arrival-airport"
                    class="tic-input"
                    type="text"
                    name="arrivalAirport"
                    value="${escapeHTML(
                      trip.arrivalAirport
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-airline">
                    شركة الطيران
                  </label>

                  <input
                    id="trip-airline"
                    class="tic-input"
                    type="text"
                    name="airline"
                    value="${escapeHTML(
                      trip.airline
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-flight-number">
                    رقم الرحلة
                  </label>

                  <input
                    id="trip-flight-number"
                    class="tic-input"
                    type="text"
                    name="flightNumber"
                    value="${escapeHTML(
                      trip.flightNumber
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-accommodation">
                    مكان الإقامة
                  </label>

                  <input
                    id="trip-accommodation"
                    class="tic-input"
                    type="text"
                    name="accommodation"
                    value="${escapeHTML(
                      trip.accommodation
                    )}"
                  >
                </div>

                <div class="tic-field">
                  <label for="trip-booking-reference">
                    رقم الحجز
                  </label>

                  <input
                    id="trip-booking-reference"
                    class="tic-input"
                    type="text"
                    name="bookingReference"
                    value="${escapeHTML(
                      trip.bookingReference
                    )}"
                  >
                </div>

                <div class="tic-field is-full">
                  <label for="trip-accommodation-address">
                    عنوان الإقامة
                  </label>

                  <input
                    id="trip-accommodation-address"
                    class="tic-input"
                    type="text"
                    name="accommodationAddress"
                    value="${escapeHTML(
                      trip.accommodationAddress
                    )}"
                  >
                </div>

                <div class="tic-field is-full">
                  <label for="trip-transport">
                    التنقل داخل الوجهة
                  </label>

                  <input
                    id="trip-transport"
                    class="tic-input"
                    type="text"
                    name="transport"
                    value="${escapeHTML(
                      trip.transport
                    )}"
                  >
                </div>
              </div>
            </div>
          </section>

          <section class="tic-page-section">
            ${renderStepHeader(
              5,
              "الأنشطة والملاحظات",
              "أضف الأنشطة والتفاصيل المهمة."
            )}

            <div class="tic-card tic-card-body">
              <div class="tic-form-grid">
                <div class="tic-field is-full">
                  <label for="trip-activities">
                    الأنشطة
                  </label>

                  <textarea
                    id="trip-activities"
                    class="tic-textarea"
                    name="activities"
                    rows="6"
                    placeholder="اكتب كل نشاط في سطر منفصل"
                  >${escapeHTML(
                    joinList(
                      trip.activities
                    )
                  )}</textarea>
                </div>

                <div class="tic-field is-full">
                  <label for="trip-notes">
                    ملاحظات الرحلة
                  </label>

                  <textarea
                    id="trip-notes"
                    class="tic-textarea"
                    name="notes"
                    rows="5"
                    placeholder="معلومات مهمة أو تفضيلات خاصة"
                  >${escapeHTML(
                    trip.notes
                  )}</textarea>
                </div>

                <div class="tic-field is-full">
                  <label for="trip-emergency-contact">
                    جهة اتصال للطوارئ
                  </label>

                  <input
                    id="trip-emergency-contact"
                    class="tic-input"
                    type="text"
                    name="emergencyContact"
                    value="${escapeHTML(
                      trip.emergencyContact
                    )}"
                  >
                </div>

                <div class="tic-field is-full">
                  <div class="tic-settings-list">
                    <label class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-icon">
                          ▣
                        </div>

                        <div class="tic-settings-copy">
                          <strong>
                            تحتاج تأشيرة
                          </strong>

                          <small>
                            أضفها إلى متطلبات الرحلة.
                          </small>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        name="visaRequired"
                        value="true"
                        ${
                          trip.visaRequired
                            ? "checked"
                            : ""
                        }
                      >
                    </label>

                    <label class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-icon">
                          ✓
                        </div>

                        <div class="tic-settings-copy">
                          <strong>
                            تحتاج تأمين سفر
                          </strong>

                          <small>
                            تذكير بالتأمين قبل السفر.
                          </small>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        name="insuranceRequired"
                        value="true"
                        ${
                          trip.insuranceRequired
                            ? "checked"
                            : ""
                        }
                      >
                    </label>

                    <label class="tic-settings-item">
                      <div class="tic-settings-item-main">
                        <div class="tic-settings-icon">
                          ★
                        </div>

                        <div class="tic-settings-copy">
                          <strong>
                            رحلة مميزة
                          </strong>

                          <small>
                            تظهر بشكل بارز في الرئيسية.
                          </small>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        name="featured"
                        value="true"
                        ${
                          trip.featured
                            ? "checked"
                            : ""
                        }
                      >
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div
            class="tic-card tic-card-body"
            style="margin-top:24px"
          >
            <div class="tic-grid tic-grid-2">
              ${ui.button({
                label: "إلغاء",
                action: "trip-form-cancel",
                block: true
              })}

              ${ui.button({
                label:
                  isEditing
                    ? "حفظ التعديلات"
                    : "إنشاء الرحلة",
                type: "submit",
                primary: true,
                block: true,
                attributes: {
                  "data-trip-form-submit": ""
                }
              })}
            </div>
          </div>
        </form>
      </div>
    `;
  };

  const getFormData = (form) => {
    const formData =
      new FormData(form);

    const data = {
      id:
        text(formData.get("id")) ||
        createId(),
      title:
        text(formData.get("title")),
      destination:
        text(
          formData.get(
            "destination"
          )
        ),
      country:
        text(formData.get("country")),
      city:
        text(formData.get("city")),
      tripType:
        text(formData.get("tripType")),
      travelStyle:
        text(
          formData.get(
            "travelStyle"
          )
        ),
      status:
        text(formData.get("status")) ||
        "planning",
      priority:
        text(formData.get("priority")) ||
        "normal",
      startDate:
        normalizeDate(
          formData.get("startDate")
        ),
      endDate:
        normalizeDate(
          formData.get("endDate")
        ),
      travelers: Math.max(
        1,
        Math.round(
          number(
            formData.get("travelers"),
            1
          )
        )
      ),
      adults: Math.max(
        0,
        Math.round(
          number(
            formData.get("adults")
          )
        )
      ),
      children: Math.max(
        0,
        Math.round(
          number(
            formData.get("children")
          )
        )
      ),
      infants: Math.max(
        0,
        Math.round(
          number(
            formData.get("infants")
          )
        )
      ),
      budget: Math.max(
        0,
        number(formData.get("budget"))
      ),
      spent: Math.max(
        0,
        number(formData.get("spent"))
      ),
      currency:
        Config.currency || "AED",
      departureAirport:
        text(
          formData.get(
            "departureAirport"
          )
        ),
      arrivalAirport:
        text(
          formData.get(
            "arrivalAirport"
          )
        ),
      airline:
        text(formData.get("airline")),
      flightNumber:
        text(
          formData.get(
            "flightNumber"
          )
        ),
      accommodation:
        text(
          formData.get(
            "accommodation"
          )
        ),
      accommodationAddress:
        text(
          formData.get(
            "accommodationAddress"
          )
        ),
      bookingReference:
        text(
          formData.get(
            "bookingReference"
          )
        ),
      transport:
        text(formData.get("transport")),
      activities:
        splitList(
          formData.get("activities")
        ),
      notes:
        text(formData.get("notes")),
      emergencyContact:
        text(
          formData.get(
            "emergencyContact"
          )
        ),
      visaRequired:
        formData.get(
          "visaRequired"
        ) === "true",
      insuranceRequired:
        formData.get(
          "insuranceRequired"
        ) === "true",
      featured:
        formData.get(
          "featured"
        ) === "true"
    };

    data.durationDays =
      calculateDuration(
        data.startDate,
        data.endDate
      );

    return data;
  };

  const validate = (data) => {
    const errors = {};

    if (!data.title) {
      errors.title =
        "أدخل اسم الرحلة.";
    }

    if (!data.destination) {
      errors.destination =
        "أدخل الوجهة الرئيسية.";
    }

    if (!data.startDate) {
      errors.startDate =
        "حدد تاريخ المغادرة.";
    }

    if (!data.endDate) {
      errors.endDate =
        "حدد تاريخ العودة.";
    }

    if (
      data.startDate &&
      data.endDate &&
      new Date(data.endDate) <
        new Date(data.startDate)
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
      valid:
        Object.keys(errors).length === 0,
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
        element.classList.remove(
          "has-error"
        );
      });

    form
      .querySelectorAll(
        "[aria-invalid='true']"
      )
      .forEach((element) => {
        element.removeAttribute(
          "aria-invalid"
        );
      });
  };

  const showErrors = (form, errors) => {
    clearErrors(form);

    Object.entries(errors).forEach(
      ([name, message]) => {
        const input =
          form.elements[name];

        const errorElement =
          form.querySelector(
            `[data-error-for="${name}"]`
          );

        if (input) {
          input.setAttribute(
            "aria-invalid",
            "true"
          );

          input
            .closest(".tic-field")
            ?.classList.add(
              "has-error"
            );
        }

        if (errorElement) {
          errorElement.textContent =
            message;

          errorElement.hidden = false;
        }
      }
    );

    const first =
      Object.keys(errors)[0];

    form.elements[first]?.focus();
  };

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

    const now =
      new Date().toISOString();

    if (state.activeMode === "edit") {
      const existing =
        findTrip(
          state.activeTripId
        ) || {};

      const updated = {
        ...existing,
        ...tripData,
        id:
          existing.id ||
          tripData.id,
        createdAt:
          existing.createdAt ||
          tripData.createdAt ||
          now,
        updatedAt: now
      };

      if (
        typeof store.updateTrip ===
        "function"
      ) {
        await store.updateTrip(
          updated.id,
          updated
        );

        return updated;
      }

      if (
        typeof store.upsertTrip ===
        "function"
      ) {
        await store.upsertTrip(updated);
        return updated;
      }

      const trips = getTrips();

      const index = trips.findIndex(
        (trip) =>
          String(trip.id) ===
          String(updated.id)
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
      id:
        tripData.id ||
        createId(),
      createdAt: now,
      updatedAt: now
    };

    if (
      typeof store.addTrip === "function"
    ) {
      return (
        (await store.addTrip(created)) ||
        created
      );
    }

    if (
      typeof store.createTrip === "function"
    ) {
      return (
        (await store.createTrip(created)) ||
        created
      );
    }

    if (
      typeof store.upsertTrip === "function"
    ) {
      await store.upsertTrip(created);
      return created;
    }

    const trips = getTrips();
    trips.unshift(created);
    saveTripsFallback(trips);

    return created;
  };

  const updateLiveSummary = (form) => {
    if (!form) return;

    const duration =
      calculateDuration(
        form.elements.startDate?.value,
        form.elements.endDate?.value
      );

    const durationElement =
      form.querySelector(
        "[data-trip-duration]"
      );

    if (durationElement) {
      durationElement.textContent =
        `${duration} يوم`;
    }

    const budget =
      number(
        form.elements.budget?.value
      );

    const spent =
      number(
        form.elements.spent?.value
      );

    const percentage =
      budget > 0
        ? Math.min(
            100,
            Math.round(
              (spent / budget) * 100
            )
          )
        : 0;

    const percentageElement =
      form.querySelector(
        "[data-budget-percentage]"
      );

    const progressElement =
      form.querySelector(
        "[data-budget-progress]"
      );

    const captionElement =
      form.querySelector(
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

    const submitButton =
      form.querySelector(
        "[data-trip-form-submit]"
      );

    const data = getFormData(form);
    const validation = validate(data);

    if (!validation.valid) {
      showErrors(
        form,
        validation.errors
      );

      ui?.toast?.(
        "راجع الحقول المطلوبة قبل الحفظ.",
        "warning"
      );

      emit("validation-failed", {
        errors:
          validation.errors
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
          ? "جاري حفظ التعديلات..."
          : "جاري إنشاء الرحلة..."
      );

      const savedTrip =
        await saveTrip(data);

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
          source:
            "trip-form-save"
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
        submitButton.removeAttribute(
          "aria-busy"
        );
      }
    }
  };

  const handleFormInput = (event) => {
    const form = event.currentTarget;

    updateLiveSummary(form);

    const name =
      event.target?.name;

    if (!name) return;

    const errorElement =
      form.querySelector(
        `[data-error-for="${name}"]`
      );

    if (errorElement) {
      errorElement.textContent = "";
      errorElement.hidden = true;
    }

    event.target.removeAttribute(
      "aria-invalid"
    );

    event.target
      .closest(".tic-field")
      ?.classList.remove(
        "has-error"
      );
  };

  const bindForm = (container) => {
    const form =
      container?.querySelector(
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
        const register = (
          name,
          handler
        ) => {
          if (ui.hasAction?.(name)) {
            return;
          }

          state.actionUnsubscribers.push(
            ui.registerAction(
              name,
              handler
            )
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

      const container =
        resolveContainer(
          context.container
        );

      if (!container) {
        throw new Error(
          "TIC Trip Form Error: route container not found."
        );
      }

      state.activeContainer =
        container;

      container.innerHTML =
        renderForm(
          getActiveTrip()
        );

      bindForm(container);

      emit("mounted", {
        mode: state.activeMode,
        tripId:
          state.activeTripId
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

      return renderForm(
        getActiveTrip()
      );
    },

    afterEnter(context = {}) {
      const container =
        resolveContainer(
          context.container
        );

      if (container) {
        state.activeContainer =
          container;

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
        tripId:
          state.activeTripId
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
        return router.go(
          "trip-form",
          {
            ...options,
            params: {
              ...(options.params || {}),
              mode: "create"
            },
            source:
              "trip-form-open-create"
          }
        );
      }

      const container =
        resolveContainer(
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
              tripId
            },
            source:
              "trip-form-open-edit"
          }
        );
      }

      const container =
        resolveContainer(
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
        const data =
          getFormData(
            state.activeForm
          );

        const hasContent = Boolean(
          data.title ||
          data.destination ||
          data.startDate ||
          data.endDate ||
          data.notes
        );

        if (hasContent) {
          const confirmed =
            await ui?.confirm?.({
              title: "إلغاء الرحلة",
              message:
                "سيتم تجاهل البيانات غير المحفوظة.",
              confirmLabel:
                "نعم، إلغاء",
              cancelLabel:
                "العودة للنموذج",
              danger: true
            });

          if (confirmed !== true) {
            return false;
          }
        }
      }

      emit("cancelled", {
        mode: state.activeMode,
        tripId:
          state.activeTripId
      });

      return getRouter()?.go?.(
        "trips",
        {
          source:
            "trip-form-cancel"
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
          if (
            typeof unsubscribe === "function"
          ) {
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
        initialized:
          state.initialized,
        activeMode:
          state.activeMode,
        activeTripId:
          state.activeTripId,
        hasContainer:
          Boolean(
            state.activeContainer
          ),
        hasForm:
          Boolean(state.activeForm),
        registeredActions:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        storeAvailable:
          Boolean(getStore()),
        routerAvailable:
          Boolean(getRouter()),
        uiAvailable:
          Boolean(getUI())
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
