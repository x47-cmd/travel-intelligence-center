/* =========================================================
   Travel Intelligence Center
   Trip Form Feature V4.1.0

   File Path:
   js/features/trip-form.js

   Fixes:
   - Synchronizes departureDate + departureTime with departureDateTime.
   - Synchronizes arrivalDate + arrivalTime with arrivalDateTime.
   - Replaces stale legacy flight times instead of preserving them.
   - Supports 24-hour, Arabic AM/PM and English AM/PM values.
   - Prevents airportLeadMinutes from being saved as zero.
   - Keeps create/edit, smart import, Store, Router and UI integration.
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const FEATURE_ID = "trip-form";
  const FEATURE_VERSION = "4.1.0";
  const DEFAULT_AIRPORT_LEAD_MINUTES = 120;

  const state = {
    initialized: false,
    activeMode: "create",
    activeTripId: null,
    activeContainer: null,
    activeForm: null,
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

  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

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

  const text = (value) => String(value ?? "").trim();

  const number = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const positiveNumber = (value, fallback) => {
    const result = number(value, fallback);
    return result > 0 ? result : fallback;
  };

  const pad2 = (value) => String(value).padStart(2, "0");

  const normalizeDate = (value) => {
    if (!value) return "";

    const raw = text(value);

    const direct = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (direct) {
      return `${direct[1]}-${pad2(direct[2])}-${pad2(direct[3])}`;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate())
    ].join("-");
  };

  const parseTimeParts = (value) => {
    if (!value && value !== 0) return null;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return {
        hours: value.getHours(),
        minutes: value.getMinutes()
      };
    }

    const raw = text(value)
      .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
      .replace(/\s+/g, " ");

    if (!raw) return null;

    let match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
      const hours = number(match[1], -1);
      const minutes = number(match[2], -1);

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return { hours, minutes };
      }
    }

    match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(ص|م)$/);
    if (match) {
      let hours = number(match[1], 0) % 12;
      const minutes = Math.min(59, Math.max(0, number(match[2], 0)));

      if (match[3] === "م") hours += 12;

      return { hours, minutes };
    }

    match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (match) {
      let hours = number(match[1], 0) % 12;
      const minutes = Math.min(59, Math.max(0, number(match[2], 0)));

      if (match[3].toUpperCase() === "PM") hours += 12;

      return { hours, minutes };
    }

    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
      return {
        hours: parsed.getHours(),
        minutes: parsed.getMinutes()
      };
    }

    return null;
  };

  const normalizeTime = (value) => {
    const parts = parseTimeParts(value);
    return parts ? `${pad2(parts.hours)}:${pad2(parts.minutes)}` : "";
  };

  const splitDateTime = (value) => {
    if (!value) {
      return {
        date: "",
        time: ""
      };
    }

    const raw = text(value);
    const match = raw.match(
      /^(\d{4}-\d{1,2}-\d{1,2})[T\s](\d{1,2}:\d{2})(?::\d{2})?/
    );

    if (match) {
      return {
        date: normalizeDate(match[1]),
        time: normalizeTime(match[2])
      };
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return {
        date: "",
        time: ""
      };
    }

    return {
      date: normalizeDate(date),
      time: normalizeTime(date)
    };
  };

  const buildLocalDateTime = (dateValue, timeValue) => {
    const date = normalizeDate(dateValue);
    const time = normalizeTime(timeValue);

    if (!date) return "";
    if (!time) return `${date}T12:00:00`;

    return `${date}T${time}:00`;
  };

  const calculateDuration = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;

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
    Array.isArray(value) ? value.join("\n") : text(value);

  const createId = () =>
    `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const getStore = () => window.TIC?.Store || window.TICStore || null;
  const getRouter = () => window.TIC?.Router || window.TICRouter || null;
  const getUI = () => window.TIC?.UI || window.TICUI || null;

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
      currency: profile.currency || Config.currency || "AED",

      departureAirport:
        profile.homeAirport ||
        Config.profile?.homeAirport ||
        "Abu Dhabi",
      arrivalAirport: "",
      airline: "",
      flightNumber: "",
      departureDate: "",
      departureTime: "",
      departureDateTime: "",
      arrivalDate: "",
      arrivalTime: "",
      arrivalDateTime: "",
      terminal: "",
      gate: "",
      seatNumber: "",
      bookingReference: "",
      airportLeadMinutes: DEFAULT_AIRPORT_LEAD_MINUTES,

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

  const getLegacyFlight = (trip) => {
    const flight = isObject(trip?.flight) ? trip.flight : {};
    const outbound = isObject(trip?.outboundFlight)
      ? trip.outboundFlight
      : {};

    return {
      departureDateTime:
        trip?.departureDateTime ||
        trip?.flightDateTime ||
        trip?.flightDepartureDateTime ||
        outbound.departureDateTime ||
        flight.departureDateTime ||
        "",
      arrivalDateTime:
        trip?.arrivalDateTime ||
        trip?.flightArrivalDateTime ||
        outbound.arrivalDateTime ||
        flight.arrivalDateTime ||
        "",
      departureDate:
        trip?.departureDate ||
        trip?.flightDate ||
        outbound.departureDate ||
        flight.departureDate ||
        "",
      departureTime:
        trip?.departureTime ||
        trip?.flightTime ||
        trip?.flightDepartureTime ||
        outbound.departureTime ||
        flight.departureTime ||
        "",
      arrivalDate:
        trip?.arrivalDate ||
        outbound.arrivalDate ||
        flight.arrivalDate ||
        "",
      arrivalTime:
        trip?.arrivalTime ||
        trip?.flightArrivalTime ||
        outbound.arrivalTime ||
        flight.arrivalTime ||
        ""
    };
  };

  const mergeTrip = (trip) => {
    const source = isObject(trip) ? clone(trip) : {};
    const legacy = getLegacyFlight(source);

    const departureParts = splitDateTime(legacy.departureDateTime);
    const arrivalParts = splitDateTime(legacy.arrivalDateTime);

    const departureDate = normalizeDate(
      legacy.departureDate ||
      departureParts.date ||
      source.startDate
    );

    const departureTime = normalizeTime(
      legacy.departureTime ||
      departureParts.time
    );

    const arrivalDate = normalizeDate(
      legacy.arrivalDate ||
      arrivalParts.date ||
      source.startDate
    );

    const arrivalTime = normalizeTime(
      legacy.arrivalTime ||
      arrivalParts.time
    );

    return {
      ...getDefaultTrip(),
      ...source,

      activities: Array.isArray(source.activities)
        ? clone(source.activities)
        : splitList(source.activities || ""),

      startDate: normalizeDate(source.startDate),
      endDate: normalizeDate(source.endDate),

      departureDate,
      departureTime,
      departureDateTime: buildLocalDateTime(departureDate, departureTime),

      arrivalDate,
      arrivalTime,
      arrivalDateTime: buildLocalDateTime(arrivalDate, arrivalTime),

      airportLeadMinutes: positiveNumber(
        source.airportLeadMinutes ??
        source.arriveAirportBeforeMinutes ??
        source.flight?.airportLeadMinutes ??
        source.outboundFlight?.airportLeadMinutes,
        DEFAULT_AIRPORT_LEAD_MINUTES
      ),

      hotelCheckIn: normalizeDate(source.hotelCheckIn || source.checkIn),
      hotelCheckOut: normalizeDate(source.hotelCheckOut || source.checkOut),

      hotelBookingReference: text(
        source.hotelBookingReference ||
        source.hotelConfirmationNumber
      )
    };
  };

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

  const renderImportCard = ({
    type,
    title,
    description,
    action,
    inputName
  }) => `
    <article
      class="tic-trip-import-card"
      data-import-type="${escapeHTML(type)}"
    >
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
        accept="image/*,.pdf,application/pdf"
        data-trip-import-input="${escapeHTML(type)}"
        hidden
      >

      <button
        type="button"
        class="tic-btn tic-btn-soft"
        data-tic-action="${escapeHTML(action)}"
      >
        رفع ملف
      </button>

      <small
        class="tic-trip-import-status"
        data-trip-import-status="${escapeHTML(type)}"
      >
        صورة أو PDF
      </small>
    </article>
  `;

  const renderAdvancedDetails = (trip) => `
    <details class="tic-trip-advanced" data-trip-advanced>
      <summary class="tic-trip-advanced-summary">
        <div>
          <strong>تفاصيل إضافية</strong>
          <small>الطيران، الفندق، الأنشطة والملاحظات.</small>
        </div>

        <span aria-hidden="true">＋</span>
      </summary>

      <div class="tic-trip-advanced-content">
        <section class="tic-trip-advanced-section">
          <header>
            <span>FLIGHT</span>
            <h3>تفاصيل الطيران</h3>
          </header>

          <div class="tic-form-grid">
            <div class="tic-field">
              <label for="trip-departure-airport">مطار المغادرة</label>
              <input id="trip-departure-airport" class="tic-input" type="text"
                name="departureAirport"
                value="${escapeHTML(trip.departureAirport)}"
                placeholder="مثال: AUH">
            </div>

            <div class="tic-field">
              <label for="trip-arrival-airport">مطار الوصول</label>
              <input id="trip-arrival-airport" class="tic-input" type="text"
                name="arrivalAirport"
                value="${escapeHTML(trip.arrivalAirport)}"
                placeholder="مثال: CPH">
            </div>

            <div class="tic-field">
              <label for="trip-airline">شركة الطيران</label>
              <input id="trip-airline" class="tic-input" type="text"
                name="airline" value="${escapeHTML(trip.airline)}">
            </div>

            <div class="tic-field">
              <label for="trip-flight-number">رقم الرحلة</label>
              <input id="trip-flight-number" class="tic-input" type="text"
                name="flightNumber" value="${escapeHTML(trip.flightNumber)}">
            </div>

            <div class="tic-field">
              <label for="trip-departure-date">تاريخ الإقلاع</label>
              <input id="trip-departure-date" class="tic-input" type="date"
                name="departureDate" value="${escapeHTML(trip.departureDate)}">
            </div>

            <div class="tic-field">
              <label for="trip-departure-time">وقت الإقلاع</label>
              <input id="trip-departure-time" class="tic-input" type="time"
                name="departureTime" value="${escapeHTML(trip.departureTime)}">
            </div>

            <div class="tic-field">
              <label for="trip-arrival-date">تاريخ الوصول</label>
              <input id="trip-arrival-date" class="tic-input" type="date"
                name="arrivalDate" value="${escapeHTML(trip.arrivalDate)}">
            </div>

            <div class="tic-field">
              <label for="trip-arrival-time">وقت الوصول</label>
              <input id="trip-arrival-time" class="tic-input" type="time"
                name="arrivalTime" value="${escapeHTML(trip.arrivalTime)}">
            </div>

            <div class="tic-field">
              <label for="trip-terminal">المبنى / Terminal</label>
              <input id="trip-terminal" class="tic-input" type="text"
                name="terminal" value="${escapeHTML(trip.terminal)}">
            </div>

            <div class="tic-field">
              <label for="trip-gate">البوابة / Gate</label>
              <input id="trip-gate" class="tic-input" type="text"
                name="gate" value="${escapeHTML(trip.gate)}">
            </div>

            <div class="tic-field">
              <label for="trip-seat-number">رقم المقعد</label>
              <input id="trip-seat-number" class="tic-input" type="text"
                name="seatNumber" value="${escapeHTML(trip.seatNumber)}">
            </div>

            <div class="tic-field">
              <label for="trip-booking-reference">رقم الحجز / PNR</label>
              <input id="trip-booking-reference" class="tic-input" type="text"
                name="bookingReference"
                value="${escapeHTML(trip.bookingReference)}">
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
                <option value="90"
                  ${positiveNumber(trip.airportLeadMinutes, 120) === 90 ? "selected" : ""}>
                  قبل ساعة ونصف
                </option>

                <option value="120"
                  ${positiveNumber(trip.airportLeadMinutes, 120) === 120 ? "selected" : ""}>
                  قبل ساعتين
                </option>

                <option value="180"
                  ${positiveNumber(trip.airportLeadMinutes, 120) === 180 ? "selected" : ""}>
                  قبل ثلاث ساعات
                </option>
              </select>
            </div>
          </div>
        </section>

        <section class="tic-trip-advanced-section">
          <header>
            <span>STAY</span>
            <h3>الإقامة</h3>
          </header>

          <div class="tic-form-grid">
            <div class="tic-field is-full">
              <label for="trip-accommodation">اسم الفندق أو السكن</label>
              <input id="trip-accommodation" class="tic-input" type="text"
                name="accommodation" value="${escapeHTML(trip.accommodation)}">
            </div>

            <div class="tic-field is-full">
              <label for="trip-accommodation-address">عنوان الإقامة</label>
              <input id="trip-accommodation-address" class="tic-input"
                type="text" name="accommodationAddress"
                value="${escapeHTML(trip.accommodationAddress)}">
            </div>

            <div class="tic-field">
              <label for="trip-hotel-booking-reference">رقم حجز الفندق</label>
              <input id="trip-hotel-booking-reference" class="tic-input"
                type="text" name="hotelBookingReference"
                value="${escapeHTML(trip.hotelBookingReference)}">
            </div>

            <div class="tic-field">
              <label for="trip-hotel-check-in">تسجيل الدخول</label>
              <input id="trip-hotel-check-in" class="tic-input" type="date"
                name="hotelCheckIn" value="${escapeHTML(trip.hotelCheckIn)}">
            </div>

            <div class="tic-field">
              <label for="trip-hotel-check-out">تسجيل الخروج</label>
              <input id="trip-hotel-check-out" class="tic-input" type="date"
                name="hotelCheckOut" value="${escapeHTML(trip.hotelCheckOut)}">
            </div>

            <div class="tic-field">
              <label for="trip-transport">التنقل داخل الوجهة</label>
              <input id="trip-transport" class="tic-input" type="text"
                name="transport" value="${escapeHTML(trip.transport)}">
            </div>
          </div>
        </section>

        <section class="tic-trip-advanced-section">
          <header>
            <span>EXTRAS</span>
            <h3>معلومات إضافية</h3>
          </header>

          <div class="tic-form-grid">
            <div class="tic-field">
              <label for="trip-country">الدولة</label>
              <input id="trip-country" class="tic-input" type="text"
                name="country" value="${escapeHTML(trip.country)}">
            </div>

            <div class="tic-field">
              <label for="trip-city">المدينة</label>
              <input id="trip-city" class="tic-input" type="text"
                name="city" value="${escapeHTML(trip.city)}">
            </div>

            <div class="tic-field">
              <label for="trip-type">نوع الرحلة</label>
              <select id="trip-type" class="tic-select" name="tripType">
                ${renderOptions(TRIP_TYPES, trip.tripType)}
              </select>
            </div>

            <div class="tic-field">
              <label for="trip-style">أسلوب السفر</label>
              <select id="trip-style" class="tic-select" name="travelStyle">
                ${renderOptions(TRAVEL_STYLES, trip.travelStyle)}
              </select>
            </div>

            <div class="tic-field">
              <label for="trip-status">حالة الرحلة</label>
              <select id="trip-status" class="tic-select" name="status">
                ${renderOptions(TRIP_STATUSES, trip.status)}
              </select>
            </div>

            <div class="tic-field">
              <label for="trip-spent">المصروف حتى الآن</label>
              <input id="trip-spent" class="tic-input" type="number"
                name="spent" min="0" step="0.01"
                value="${escapeHTML(trip.spent)}">
            </div>

            <div class="tic-field is-full">
              <label for="trip-activities">الأنشطة</label>
              <textarea id="trip-activities" class="tic-textarea"
                name="activities" rows="4"
                placeholder="اكتب كل نشاط في سطر منفصل">${escapeHTML(
                  joinList(trip.activities)
                )}</textarea>
            </div>

            <div class="tic-field is-full">
              <label for="trip-notes">ملاحظات الرحلة</label>
              <textarea id="trip-notes" class="tic-textarea"
                name="notes" rows="4"
                placeholder="أي معلومات إضافية">${escapeHTML(trip.notes)}</textarea>
            </div>

            <div class="tic-field is-full">
              <label for="trip-emergency-contact">جهة اتصال للطوارئ</label>
              <input id="trip-emergency-contact" class="tic-input" type="text"
                name="emergencyContact"
                value="${escapeHTML(trip.emergencyContact)}">
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

                  <input type="checkbox" name="visaRequired" value="true"
                    ${trip.visaRequired ? "checked" : ""}>
                </label>

                <label class="tic-settings-item">
                  <div class="tic-settings-item-main">
                    <div class="tic-settings-icon">✓</div>
                    <div class="tic-settings-copy">
                      <strong>تحتاج تأمين سفر</strong>
                      <small>تذكير بالتأمين قبل السفر.</small>
                    </div>
                  </div>

                  <input type="checkbox" name="insuranceRequired" value="true"
                    ${trip.insuranceRequired ? "checked" : ""}>
                </label>

                <label class="tic-settings-item">
                  <div class="tic-settings-item-main">
                    <div class="tic-settings-icon">★</div>
                    <div class="tic-settings-copy">
                      <strong>رحلة مميزة</strong>
                      <small>تظهر بشكل بارز في التطبيق.</small>
                    </div>
                  </div>

                  <input type="checkbox" name="featured" value="true"
                    ${trip.featured ? "checked" : ""}>
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </details>
  `;

  const renderForm = (trip) => {
    const isEditing = state.activeMode === "edit";
    const duration = calculateDuration(trip.startDate, trip.endDate);

    return `
      <div
        class="tic-module tic-trip-form-page tic-trip-form-simple"
        data-trip-form-feature
        data-mode="${escapeHTML(state.activeMode)}"
        data-trip-id="${escapeHTML(trip.id)}"
      >
        <section class="tic-trip-form-intro">
          <div>
            <span>${isEditing ? "TRIP UPDATE" : "NEW JOURNEY"}</span>
            <h1>${isEditing ? "تعديل الرحلة" : "رحلة جديدة"}</h1>
            <p>
              ${
                isEditing
                  ? "عدّل المعلومات المهمة واحفظ التغييرات."
                  : "أدخل أهم المعلومات فقط، والباقي تقدر تضيفه لاحقاً."
              }
            </p>
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

        <form class="tic-form tic-trip-form-compact" data-trip-form novalidate>
          <input type="hidden" name="id" value="${escapeHTML(trip.id)}">

          <section class="tic-card tic-card-body tic-trip-main-card">
            <header class="tic-trip-form-simple-header">
              <span>ESSENTIALS</span>
              <h2>معلومات الرحلة</h2>
              <p>خمس معلومات أساسية وخلاص.</p>
            </header>

            <div class="tic-form-grid">
              <div class="tic-field is-full">
                <label for="trip-title">اسم الرحلة <span>*</span></label>
                <input id="trip-title" class="tic-input" type="text"
                  name="title" value="${escapeHTML(trip.title)}"
                  placeholder="مثال: رحلة الدنمارك" required>
                ${renderError("title")}
              </div>

              <div class="tic-field is-full">
                <label for="trip-destination">الوجهة <span>*</span></label>
                <input id="trip-destination" class="tic-input" type="text"
                  name="destination" value="${escapeHTML(trip.destination)}"
                  placeholder="مثال: كوبنهاغن، الدنمارك" required>
                ${renderError("destination")}
              </div>

              <div class="tic-field">
                <label for="trip-start-date">تاريخ المغادرة <span>*</span></label>
                <input id="trip-start-date" class="tic-input" type="date"
                  name="startDate" value="${escapeHTML(trip.startDate)}" required>
                ${renderError("startDate")}
              </div>

              <div class="tic-field">
                <label for="trip-end-date">تاريخ العودة <span>*</span></label>
                <input id="trip-end-date" class="tic-input" type="date"
                  name="endDate" value="${escapeHTML(trip.endDate)}" required>
                ${renderError("endDate")}
              </div>

              <div class="tic-field is-full">
                <article class="tic-trip-duration-card">
                  <span>مدة الرحلة</span>
                  <strong data-trip-duration>${duration} يوم</strong>
                </article>
              </div>

              <div class="tic-field">
                <label for="trip-travelers">عدد المسافرين <span>*</span></label>
                <input id="trip-travelers" class="tic-input" type="number"
                  name="travelers" min="1" max="99" step="1"
                  value="${escapeHTML(trip.travelers)}" required>
                ${renderError("travelers")}
              </div>

              <div class="tic-field">
                <label for="trip-budget">الميزانية <small>اختياري</small></label>
                <input id="trip-budget" class="tic-input" type="number"
                  name="budget" min="0" step="0.01"
                  value="${escapeHTML(trip.budget)}" placeholder="0">
              </div>
            </div>
          </section>

          <section class="tic-trip-smart-import">
            <header class="tic-trip-form-simple-header">
              <span>SMART IMPORT</span>
              <h2>استيراد سريع</h2>
              <p>ارفع التذكرة أو الفندق، والنظام يعبي المتوفر.</p>
            </header>

            <div class="tic-trip-import-grid">
              ${renderImportCard({
                type: "ticket",
                title: "تذكرة الطيران",
                description: "استورد بيانات الرحلة من صورة أو PDF.",
                action: "trip-form-select-ticket",
                inputName: "ticketFile"
              })}

              ${renderImportCard({
                type: "hotel",
                title: "حجز الفندق",
                description: "استورد بيانات الإقامة من صورة أو PDF.",
                action: "trip-form-select-hotel",
                inputName: "hotelFile"
              })}
            </div>
          </section>

          ${renderAdvancedDetails(trip)}

          <footer class="tic-trip-form-actions tic-trip-form-actions-simple">
            <button
              type="button"
              class="tic-btn tic-btn-secondary"
              data-tic-action="trip-form-cancel"
            >
              إلغاء
            </button>

            <button
              type="submit"
              class="tic-btn tic-btn-primary"
              data-trip-form-submit
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

    const departureDate = normalizeDate(formData.get("departureDate"));
    const departureTime = normalizeTime(formData.get("departureTime"));
    const arrivalDate = normalizeDate(formData.get("arrivalDate"));
    const arrivalTime = normalizeTime(formData.get("arrivalTime"));

    const airportLeadMinutes = positiveNumber(
      formData.get("airportLeadMinutes"),
      DEFAULT_AIRPORT_LEAD_MINUTES
    );

    const data = {
      id: text(formData.get("id")) || createId(),
      title: text(formData.get("title")),
      destination: text(formData.get("destination")),
      country: text(formData.get("country")),
      city: text(formData.get("city")),
      tripType: text(formData.get("tripType")) || "family",
      travelStyle:
        text(formData.get("travelStyle")) ||
        "premium-family",
      status: text(formData.get("status")) || "planning",
      priority: "normal",

      startDate: normalizeDate(formData.get("startDate")),
      endDate: normalizeDate(formData.get("endDate")),

      travelers: Math.max(
        1,
        Math.round(number(formData.get("travelers"), 1))
      ),
      adults: Math.max(
        1,
        Math.round(
          number(
            formData.get("adults"),
            formData.get("travelers") || 1
          )
        )
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

      departureDate,
      departureTime,
      departureDateTime: buildLocalDateTime(
        departureDate,
        departureTime
      ),

      arrivalDate,
      arrivalTime,
      arrivalDateTime: buildLocalDateTime(
        arrivalDate,
        arrivalTime
      ),

      terminal: text(formData.get("terminal")),
      gate: text(formData.get("gate")),
      seatNumber: text(formData.get("seatNumber")),
      bookingReference: text(formData.get("bookingReference")),
      airportLeadMinutes,

      accommodation: text(formData.get("accommodation")),
      accommodationAddress: text(
        formData.get("accommodationAddress")
      ),
      hotelBookingReference: text(
        formData.get("hotelBookingReference")
      ),
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

  const synchronizeFlightAliases = (trip) => {
    const departureDateTime = trip.departureDateTime || "";
    const arrivalDateTime = trip.arrivalDateTime || "";
    const airportLeadMinutes = positiveNumber(
      trip.airportLeadMinutes,
      DEFAULT_AIRPORT_LEAD_MINUTES
    );

    const flight = {
      ...(isObject(trip.flight) ? trip.flight : {}),
      airline: trip.airline || "",
      airlineName: trip.airline || "",
      flightNumber: trip.flightNumber || "",
      flightNo: trip.flightNumber || "",
      departureAirport: trip.departureAirport || "",
      originAirport: trip.departureAirport || "",
      arrivalAirport: trip.arrivalAirport || "",
      destinationAirport: trip.arrivalAirport || "",
      departureDate: trip.departureDate || "",
      departureTime: trip.departureTime || "",
      departureDateTime,
      arrivalDate: trip.arrivalDate || "",
      arrivalTime: trip.arrivalTime || "",
      arrivalDateTime,
      terminal: trip.terminal || "",
      departureTerminal: trip.terminal || "",
      gate: trip.gate || "",
      departureGate: trip.gate || "",
      seat: trip.seatNumber || "",
      seatNumber: trip.seatNumber || "",
      bookingReference: trip.bookingReference || "",
      airportLeadMinutes
    };

    return {
      ...trip,

      airportLeadMinutes,
      arriveAirportBeforeMinutes: airportLeadMinutes,

      flightDate: trip.departureDate || "",
      flightTime: trip.departureTime || "",
      flightDepartureTime: trip.departureTime || "",
      flightDateTime: departureDateTime,
      flightDepartureDateTime: departureDateTime,
      flightArrivalTime: trip.arrivalTime || "",
      flightArrivalDateTime: arrivalDateTime,

      flight,
      outboundFlight: {
        ...(isObject(trip.outboundFlight) ? trip.outboundFlight : {}),
        ...flight
      }
    };
  };

  const validate = (data) => {
    const errors = {};

    if (!data.title) errors.title = "أدخل اسم الرحلة.";
    if (!data.destination) errors.destination = "أدخل الوجهة.";
    if (!data.startDate) errors.startDate = "حدد تاريخ المغادرة.";
    if (!data.endDate) errors.endDate = "حدد تاريخ العودة.";

    if (
      data.startDate &&
      data.endDate &&
      new Date(`${data.endDate}T00:00:00`) <
        new Date(`${data.startDate}T00:00:00`)
    ) {
      errors.endDate =
        "تاريخ العودة يجب أن يكون بعد تاريخ المغادرة.";
    }

    if (data.travelers < 1) {
      errors.travelers =
        "عدد المسافرين يجب أن يكون واحداً على الأقل.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  };

  const clearErrors = (form) => {
    form.querySelectorAll("[data-error-for]").forEach((element) => {
      element.textContent = "";
      element.hidden = true;
    });

    form.querySelectorAll(".tic-field.has-error").forEach((element) => {
      element.classList.remove("has-error");
    });

    form.querySelectorAll("[aria-invalid='true']").forEach((element) => {
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
        input.closest(".tic-field")?.classList.add("has-error");
      }

      if (errorElement) {
        errorElement.textContent = message;
        errorElement.hidden = false;
      }
    });

    const first = Object.keys(errors)[0];
    const field = form.elements[first];

    if (field) {
      field.focus();
      field.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  };

  const applyDataToForm = (form, data = {}) => {
    if (!form || !isObject(data)) return false;

    const normalizedData = {
      ...data
    };

    if (
      !normalizedData.departureDate ||
      !normalizedData.departureTime
    ) {
      const parts = splitDateTime(
        normalizedData.departureDateTime ||
        normalizedData.flightDateTime ||
        normalizedData.flightDepartureDateTime
      );

      normalizedData.departureDate =
        normalizedData.departureDate || parts.date;

      normalizedData.departureTime =
        normalizedData.departureTime || parts.time;
    }

    if (!normalizedData.arrivalDate || !normalizedData.arrivalTime) {
      const parts = splitDateTime(
        normalizedData.arrivalDateTime ||
        normalizedData.flightArrivalDateTime
      );

      normalizedData.arrivalDate =
        normalizedData.arrivalDate || parts.date;

      normalizedData.arrivalTime =
        normalizedData.arrivalTime || parts.time;
    }

    Object.entries(normalizedData).forEach(([name, value]) => {
      const field = form.elements[name];

      if (!field || value === undefined || value === null) return;

      if (field.type === "checkbox") {
        field.checked = Boolean(value);
        return;
      }

      if (Array.isArray(value)) {
        field.value = value.join("\n");
        return;
      }

      if (field.type === "date") {
        field.value = normalizeDate(value);
        return;
      }

      if (field.type === "time") {
        field.value = normalizeTime(value);
        return;
      }

      field.value = value;
    });

    const leadField = form.elements.airportLeadMinutes;

    if (leadField) {
      leadField.value = String(
        positiveNumber(
          normalizedData.airportLeadMinutes,
          DEFAULT_AIRPORT_LEAD_MINUTES
        )
      );
    }

    updateLiveSummary(form);

    const advanced = form.querySelector("[data-trip-advanced]");
    const advancedFields = [
      "departureAirport",
      "arrivalAirport",
      "airline",
      "flightNumber",
      "departureDate",
      "departureTime",
      "arrivalDate",
      "arrivalTime",
      "terminal",
      "gate",
      "seatNumber",
      "bookingReference",
      "accommodation",
      "hotelBookingReference",
      "hotelCheckIn",
      "hotelCheckOut"
    ];

    if (
      advanced &&
      advancedFields.some((name) => text(normalizedData[name]))
    ) {
      advanced.open = true;
    }

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

    setImportStatus(type, `تم اختيار: ${file.name}`, "info");

    emit("import-selected", {
      type,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    if (importer && typeof importer.parse === "function") {
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

        const importedData =
          result?.data ||
          result?.fields ||
          {};

        if (isObject(importedData)) {
          applyDataToForm(state.activeForm, importedData);

          setImportStatus(
            type,
            result?.success === false
              ? "تمت قراءة بعض البيانات. راجع التفاصيل."
              : "تمت قراءة البيانات وتعبئة الحقول.",
            result?.success === false ? "warning" : "success"
          );

          ui?.toast?.(
            result?.success === false
              ? "تم استخراج بعض البيانات. راجعها قبل الحفظ."
              : "تمت تعبئة البيانات المستخرجة.",
            result?.success === false ? "warning" : "success"
          );

          emit("import-completed", {
            type,
            result
          });

          return result;
        }
      } catch (error) {
        console.error(`TIC ${type} import error:`, error);

        setImportStatus(
          type,
          "تعذر استخراج البيانات. يمكنك المتابعة يدوياً.",
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
      "تم حفظ الملف، لكن القراءة الذكية غير متاحة حالياً.",
      "warning"
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

    if (!input.matches("[data-trip-import-input]")) return;

    const type = input.dataset.tripImportInput;
    const file = input.files?.[0] || null;

    if (!file) return;

    if (type === "ticket") state.importedTicketFile = file;
    if (type === "hotel") state.importedHotelFile = file;

    await processImport(type, file);
  };

  const updateLiveSummary = (form) => {
    if (!form) return;

    const duration = calculateDuration(
      form.elements.startDate?.value,
      form.elements.endDate?.value
    );

    const durationElement = form.querySelector("[data-trip-duration]");

    if (durationElement) {
      durationElement.textContent = `${duration} يوم`;
    }
  };

  const getTrips = () => {
    const store = getStore();

    const trips =
      store?.get?.("trips") ||
      store?.getState?.()?.trips ||
      [];

    return Array.isArray(trips) ? clone(trips) : [];
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
      const existing = findTrip(state.activeTripId) || {};

      const updated = synchronizeFlightAliases({
        ...existing,
        ...tripData,
        id: existing.id || tripData.id,
        createdAt:
          existing.createdAt ||
          tripData.createdAt ||
          now,
        updatedAt: now
      });

      if (typeof store.updateTrip === "function") {
        await store.updateTrip(updated.id, updated);
        return updated;
      }

      if (typeof store.upsertTrip === "function") {
        await store.upsertTrip(updated);
        return updated;
      }

      const trips = getTrips();
      const index = trips.findIndex(
        (trip) => String(trip.id) === String(updated.id)
      );

      if (index >= 0) {
        trips[index] = updated;
      } else {
        trips.unshift(updated);
      }

      saveTripsFallback(trips);
      return updated;
    }

    const created = synchronizeFlightAliases({
      ...tripData,
      id: tripData.id || createId(),
      createdAt: now,
      updatedAt: now
    });

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

      ui?.toast?.(
        "راجع الحقول المطلوبة.",
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

      await getRouter()?.go?.("trips", {
        params: {
          tripId: savedTrip.id,
          view: "details"
        },
        source: "trip-form-save"
      });

      return savedTrip;
    } catch (error) {
      console.error("TIC Trip Form save error:", error);

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
    event.target.closest(".tic-field")?.classList.remove("has-error");
  };

  const unbindForm = () => {
    if (!state.activeForm) return;

    state.activeForm.removeEventListener("submit", handleSubmit);
    state.activeForm.removeEventListener("input", handleFormInput);
    state.activeForm.removeEventListener("change", handleFormInput);
    state.activeForm.removeEventListener("change", handleImportChange);
  };

  const bindForm = (container) => {
    const form = container?.querySelector("[data-trip-form]");

    if (!form) return false;

    unbindForm();
    state.activeForm = form;

    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", handleFormInput);
    form.addEventListener("change", handleFormInput);
    form.addEventListener("change", handleImportChange);

    updateLiveSummary(form);

    return true;
  };

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

  const TripForm = {
    id: FEATURE_ID,
    version: FEATURE_VERSION,

    init() {
      if (state.initialized) return this.diagnostics();

      const ui = getUI();

      if (ui && typeof ui.registerAction === "function") {
        const register = (name, handler) => {
          if (ui.hasAction?.(name)) return;

          state.actionUnsubscribers.push(
            ui.registerAction(name, handler)
          );
        };

        register("new-trip", () => this.openCreate());
        register("create-trip", () => this.openCreate());

        register("edit-trip", ({ params }) =>
          this.openEdit(params?.tripId || params?.id)
        );

        register("trip-form-cancel", () => this.cancel());

        register("trip-form-select-ticket", () =>
          selectImportFile("ticket")
        );

        register("trip-form-select-hotel", () =>
          selectImportFile("hotel")
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

      state.importedTicketFile = null;
      state.importedHotelFile = null;

      const container = resolveContainer(context.container);

      if (!container) {
        throw new Error(
          "TIC Trip Form Error: route container not found."
        );
      }

      state.activeContainer = container;
      container.innerHTML = renderForm(getActiveTrip());

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

      return renderForm(getActiveTrip());
    },

    afterEnter(context = {}) {
      const container = resolveContainer(context.container);

      if (container) {
        state.activeContainer = container;
        bindForm(container);
      }

      return true;
    },

    unmount() {
      unbindForm();

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

      if (router && typeof router.go === "function") {
        return router.go("trip-form", {
          ...options,
          params: {
            ...(options.params || {}),
            mode: "create"
          },
          source: "trip-form-open-create"
        });
      }

      const container = resolveContainer(options.container);

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

      if (router && typeof router.go === "function") {
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

      const container = resolveContainer(options.container);

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
        const data = getFormData(state.activeForm);

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
            message: "سيتم تجاهل البيانات غير المحفوظة.",
            confirmLabel: "نعم، إلغاء",
            cancelLabel: "العودة",
            danger: true
          });

          if (confirmed !== true) return false;
        }
      }

      emit("cancelled", {
        mode: state.activeMode,
        tripId: state.activeTripId
      });

      return getRouter()?.go?.("trips", {
        source: "trip-form-cancel"
      });
    },

    validate(data) {
      return validate(isObject(data) ? data : {});
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

    applyImportedData(data) {
      return applyDataToForm(state.activeForm, data);
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Trip Form subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () => state.subscribers.delete(listener);
    },

    destroy() {
      this.unmount();

      state.actionUnsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe();
      });

      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.initialized = false;
      state.activeMode = "create";
      state.activeTripId = null;
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
        hasContainer: Boolean(state.activeContainer),
        hasForm: Boolean(state.activeForm),
        hasTicketFile: Boolean(state.importedTicketFile),
        hasHotelFile: Boolean(state.importedHotelFile),
        ticketImporterAvailable: Boolean(getTicketImporter()),
        hotelImporterAvailable: Boolean(getHotelImporter()),
        documentReaderAvailable: Boolean(getDocumentReader()),
        registeredActions: state.actionUnsubscribers.length,
        subscriberCount: state.subscribers.size,
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI()),
        defaultAirportLeadMinutes: DEFAULT_AIRPORT_LEAD_MINUTES
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features = window.TIC.Features || {};
  window.TIC.Features.TripForm = TripForm;
  window.TICTripForm = TripForm;

  const router = getRouter();

  if (router && typeof router.register === "function") {
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

    if (typeof router.registerPage === "function") {
      router.registerPage("trip-form", TripForm);
    }
  }

  TripForm.init();
})(window, document);
