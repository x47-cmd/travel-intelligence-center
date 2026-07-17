/* =========================================================
   Travel Intelligence Center
   Home Page Module V2.5.0
   Unified Travel Intelligence Home Runtime

   File Path:
   js/pages/home.js

   Purpose:
   - Premium, compact and iPhone-first Home Page.
   - Preserves the approved Home visual structure and CSS hooks.
   - Uses the newest saved manual flight date/time first.
   - Supports Trip Form V4.1.0 synchronized flight aliases.
   - Connects Store V2.5.0 with Travel Brain V1.1.0.
   - Connects Travel Assistant V1.1.0 recommendations and alerts.
   - Connects Travel Import V1.1.0 smart trip creation/editing.
   - Connects Travel Sync V1.1.0 cross-tab and session refresh events.
   - Prevents stale legacy departureDateTime values from overriding edits.
   - Calculates airport arrival time with a safe positive lead time.
   - Displays full travel date, flight timeline and hotel details.
   - Prevents duplicate actions, subscriptions and refresh loops.
   - Preserves Store, Router, UI and Trip Form compatibility.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/features/trip-form.js
   - js/features/travel-brain.js
   - js/features/travel-assistant.js
   - js/features/travel-import.js
   - js/features/travel-sync.js

   Global APIs:
   - window.TIC.Pages.home
   - window.TICHomePage
========================================================= */

(function homePageFactory(window, document) {
  "use strict";

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};

  const Config =
    window.TICConfig ||
    window.TIC?.Config ||
    {};

  const PAGE_ID = "home";
  const PAGE_VERSION = "2.5.0";
  const DEFAULT_AIRPORT_LEAD_MINUTES = 120;
  const REFRESH_DEBOUNCE_MS = 50;

  const state = {
    initialized: false,
    mounted: false,
    destroyed: false,
    refreshing: false,
    refreshQueued: false,
    refreshTimer: null,
    container: null,
    unsubscribeStore: null,
    actionUnsubscribers: [],
    runtimeBindings: [],
    subscribers: new Set(),
    lastSnapshot: null,
    lastRenderSignature: "",
    lastRefreshAt: null,
    lastRefreshSource: null,
    intelligenceRefreshRunning: false
  };

  /* =========================================================
     Utilities
  ========================================================= */

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        // Continue to JSON fallback.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
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
    return Number.isFinite(result)
      ? result
      : fallback;
  };

  const positiveNumber = (value, fallback) => {
    const result = number(value, fallback);
    return result > 0 ? result : fallback;
  };

  const list = (value) =>
    Array.isArray(value) ? value : [];

  const firstText = (...values) => {
    for (const value of values) {
      const result = text(value);
      if (result) return result;
    }

    return "";
  };

  const firstValue = (...values) => {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return null;
  };

  const nowISO = () =>
    new Date().toISOString();

  const stableStringify = (value) => {
    const seen = new WeakSet();

    const normalize = (input) => {
      if (
        input === null ||
        typeof input !== "object"
      ) {
        return input;
      }

      if (seen.has(input)) {
        return "[Circular]";
      }

      seen.add(input);

      if (Array.isArray(input)) {
        return input.map(normalize);
      }

      return Object.keys(input)
        .sort()
        .reduce((output, key) => {
          output[key] = normalize(input[key]);
          return output;
        }, {});
    };

    try {
      return JSON.stringify(normalize(value));
    } catch (_) {
      return String(Date.now());
    }
  };

  const dispatchWindowEvent = (
    name,
    detail = {}
  ) => {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: clone(detail)
        })
      );
    } catch (_) {
      // Ignore test environments without CustomEvent.
    }
  };

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    window.Store ||
    window.TravelStore ||
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
    window.TIC?.Features?.tripForm ||
    window.TICTripForm ||
    null;

  const getTravelBrain = () =>
    window.TIC?.TravelBrain ||
    window.TIC?.Features?.TravelBrain ||
    window.TravelBrain ||
    null;

  const getTravelAssistant = () =>
    window.TIC?.TravelAssistant ||
    window.TIC?.Features?.TravelAssistant ||
    window.TravelAssistant ||
    null;

  const getTravelImport = () =>
    window.TIC?.TravelImport ||
    window.TIC?.Features?.TravelImport ||
    window.TravelImport ||
    null;

  const getTravelSync = () =>
    window.TIC?.TravelSync ||
    window.TIC?.Features?.TravelSync ||
    window.TravelSync ||
    null;

  const getApp = () =>
    window.TIC?.App ||
    window.TICApp ||
    null;

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      timestamp: nowISO(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "TIC Home subscriber error:",
          error
        );
      }
    });

    dispatchWindowEvent(
      `tic:page:${PAGE_ID}:${type}`,
      payload
    );

    return payload;
  };

  const resolveContainer = (container) => {
    if (
      window.Element &&
      container instanceof window.Element
    ) {
      return container;
    }

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content") ||
      document.querySelector("#app")
    );
  };

  /* =========================================================
     Store and intelligence resolution
  ========================================================= */

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    try {
      if (typeof store.getState === "function") {
        return clone(store.getState()) || {};
      }

      if (typeof store.snapshot === "function") {
        return clone(store.snapshot()) || {};
      }

      if (typeof store.get === "function") {
        return {
          profile: store.get("profile"),
          statistics: store.get("statistics"),
          trips: store.get("trips"),
          plannedTrips: store.get("plannedTrips"),
          destinations: store.get("destinations"),
          wishlist: store.get("wishlist"),
          guides: store.get("guides"),
          annualPlans: store.get("annualPlans"),
          budgets: store.get("budgets"),
          savings: store.get("savings"),
          wallet: store.get("wallet"),
          documents: store.get("documents"),
          packing: store.get("packing"),
          memories: store.get("memories"),
          notifications: store.get("notifications"),
          settings: store.get("settings")
        };
      }
    } catch (error) {
      console.warn(
        "TIC Home could not read Store state:",
        error
      );
    }

    return {};
  };

  const readBrainSnapshot = () => {
    const brain = getTravelBrain();

    if (!brain) return null;

    const methods = [
      "getSnapshot",
      "snapshot",
      "getState",
      "analyze",
      "getContext"
    ];

    for (const method of methods) {
      if (typeof brain[method] !== "function") {
        continue;
      }

      try {
        const result = brain[method]({
          source: "home-page",
          silent: true
        });

        if (
          result &&
          typeof result.then !== "function"
        ) {
          return clone(result);
        }
      } catch (_) {
        // Continue to the next compatible API.
      }
    }

    return null;
  };

  const readAssistantSnapshot = (
    brainSnapshot = null
  ) => {
    const assistant = getTravelAssistant();

    if (!assistant) return null;

    const methods = [
      "getSnapshot",
      "snapshot",
      "getState",
      "getRecommendations",
      "getInsights"
    ];

    for (const method of methods) {
      if (typeof assistant[method] !== "function") {
        continue;
      }

      try {
        const result = assistant[method]({
          source: "home-page",
          context: brainSnapshot,
          silent: true
        });

        if (
          result &&
          typeof result.then !== "function"
        ) {
          return clone(result);
        }
      } catch (_) {
        // Continue to the next compatible API.
      }
    }

    return null;
  };

  const normalizeAssistantMessage = (
    assistantSnapshot
  ) => {
    if (!assistantSnapshot) return null;

    const candidates = [
      assistantSnapshot.home,
      assistantSnapshot.primary,
      assistantSnapshot.highlight,
      assistantSnapshot.recommendation,
      assistantSnapshot.recommendations?.[0],
      assistantSnapshot.insight,
      assistantSnapshot.insights?.[0],
      assistantSnapshot.message,
      assistantSnapshot
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const message = text(candidate);

        if (message) {
          return {
            title: "اقتراح ذكي",
            message
          };
        }
      }

      if (isObject(candidate)) {
        const title = firstText(
          candidate.title,
          candidate.heading,
          candidate.label,
          candidate.name
        );

        const message = firstText(
          candidate.message,
          candidate.text,
          candidate.description,
          candidate.body,
          candidate.content,
          candidate.advice
        );

        if (title || message) {
          return {
            title: title || "اقتراح ذكي",
            message:
              message ||
              "راجع تفاصيل رحلتك القادمة."
          };
        }
      }
    }

    return null;
  };

  /* =========================================================
     Date and time helpers
  ========================================================= */

  const parseDateOnly = (value) => {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : new Date(value);
    }

    const raw = text(value);

    const direct = raw.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );

    if (direct) {
      const date = new Date(
        number(direct[1]),
        number(direct[2]) - 1,
        number(direct[3]),
        12,
        0,
        0,
        0
      );

      return Number.isNaN(date.getTime())
        ? null
        : date;
    }

    const parsed = new Date(raw);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  };

  const parseTimeParts = (value) => {
    if (!value && value !== 0) return null;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return {
        hours: value.getHours(),
        minutes: value.getMinutes()
      };
    }

    const raw = text(value)
      .replace(/[٠-٩]/g, (digit) =>
        "٠١٢٣٤٥٦٧٨٩".indexOf(digit)
      )
      .replace(/\s+/g, " ");

    if (!raw) return null;

    let match = raw.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

    if (match) {
      const hours = number(match[1], -1);
      const minutes = number(match[2], -1);

      if (
        hours >= 0 &&
        hours <= 23 &&
        minutes >= 0 &&
        minutes <= 59
      ) {
        return { hours, minutes };
      }
    }

    match = raw.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(ص|م)$/
    );

    if (match) {
      let hours = number(match[1], 0) % 12;
      const minutes = Math.min(
        59,
        Math.max(0, number(match[2], 0))
      );

      if (match[3] === "م") {
        hours += 12;
      }

      return { hours, minutes };
    }

    match = raw.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i
    );

    if (match) {
      let hours = number(match[1], 0) % 12;
      const minutes = Math.min(
        59,
        Math.max(0, number(match[2], 0))
      );

      if (
        match[3].toUpperCase() === "PM"
      ) {
        hours += 12;
      }

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

  const combineDateAndTime = (
    dateValue,
    timeValue
  ) => {
    const date = parseDateOnly(dateValue);

    if (!date) return null;

    const time = parseTimeParts(timeValue);

    if (!time) {
      date.setHours(12, 0, 0, 0);
      return date;
    }

    date.setHours(
      time.hours,
      time.minutes,
      0,
      0
    );

    return date;
  };

  const parseDateTime = (value) => {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : new Date(value);
    }

    const raw = text(value);

    const localMatch = raw.match(
      /^(\d{4}-\d{1,2}-\d{1,2})[T\s](\d{1,2}:\d{2})(?::\d{2})?/
    );

    if (localMatch) {
      return combineDateAndTime(
        localMatch[1],
        localMatch[2]
      );
    }

    const parsed = new Date(raw);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  };

  const startOfDay = (value) => {
    const date = parseDateOnly(value);

    if (!date) return null;

    date.setHours(0, 0, 0, 0);
    return date;
  };

  const daysUntil = (value) => {
    const date = parseDateOnly(value);
    const today = startOfDay(new Date());

    if (!date || !today) return null;

    date.setHours(0, 0, 0, 0);

    return Math.ceil(
      (
        date.getTime() -
        today.getTime()
      ) / 86400000
    );
  };

  const minutesUntil = (value) => {
    const date =
      value instanceof Date
        ? value
        : parseDateTime(value);

    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return null;
    }

    return Math.round(
      (
        date.getTime() -
        Date.now()
      ) / 60000
    );
  };

  const durationDays = (
    startDate,
    endDate
  ) => {
    const start = startOfDay(startDate);
    const end = startOfDay(endDate);

    if (
      !start ||
      !end ||
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

  const subtractMinutes = (
    dateValue,
    minutes
  ) => {
    const date =
      dateValue instanceof Date
        ? dateValue
        : parseDateTime(dateValue);

    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return null;
    }

    return new Date(
      date.getTime() -
      positiveNumber(
        minutes,
        DEFAULT_AIRPORT_LEAD_MINUTES
      ) *
        60000
    );
  };

  const formatTime = (value) => {
    let date =
      value instanceof Date
        ? value
        : parseDateTime(value);

    if (!date) {
      const parts = parseTimeParts(value);

      if (!parts) return text(value);

      date = new Date();
      date.setHours(
        parts.hours,
        parts.minutes,
        0,
        0
      );
    }

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat(
        "ar-AE",
        {
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        }
      ).format(date);
    } catch (_) {
      return date.toLocaleTimeString(
        "ar-AE",
        {
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        }
      );
    }
  };

  const formatFullDate = (value) => {
    const date = parseDateOnly(value);

    if (!date) return "";

    try {
      return new Intl.DateTimeFormat(
        "ar-AE-u-nu-latn",
        {
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      ).format(date);
    } catch (_) {
      return date.toLocaleDateString(
        "ar-AE",
        {
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      );
    }
  };

  const formatCompactDate = (value) => {
    const date = parseDateOnly(value);

    if (!date) return "";

    try {
      return new Intl.DateTimeFormat(
        "ar-AE-u-nu-latn",
        {
          day: "numeric",
          month: "short"
        }
      ).format(date);
    } catch (_) {
      return date.toLocaleDateString(
        "ar-AE",
        {
          day: "numeric",
          month: "short"
        }
      );
    }
  };

  /* =========================================================
     Trip normalization
  ========================================================= */

  const tripsFrom = (snapshot) =>
    list(snapshot.trips);

  const getFlightSources = (trip) => ({
    flight: isObject(trip?.flight)
      ? trip.flight
      : {},
    outbound: isObject(
      trip?.outboundFlight
    )
      ? trip.outboundFlight
      : {}
  });

  const getTripDepartureDateTime = (trip) => {
    const {
      flight,
      outbound
    } = getFlightSources(trip);

    const dateValue = firstValue(
      trip?.departureDate,
      trip?.flightDate,
      outbound.departureDate,
      flight.departureDate,
      trip?.startDate
    );

    const timeValue = firstValue(
      trip?.departureTime,
      trip?.flightTime,
      trip?.flightDepartureTime,
      outbound.departureTime,
      flight.departureTime
    );

    if (dateValue && timeValue) {
      const combined = combineDateAndTime(
        dateValue,
        timeValue
      );

      if (combined) return combined;
    }

    const directValue = firstValue(
      trip?.departureDateTime,
      trip?.flightDateTime,
      trip?.flightDepartureDateTime,
      outbound.departureDateTime,
      flight.departureDateTime
    );

    const direct = parseDateTime(
      directValue
    );

    if (direct) return direct;

    return combineDateAndTime(
      dateValue || trip?.startDate,
      timeValue
    );
  };

  const getTripArrivalDateTime = (trip) => {
    const {
      flight,
      outbound
    } = getFlightSources(trip);

    const dateValue = firstValue(
      trip?.arrivalDate,
      outbound.arrivalDate,
      flight.arrivalDate,
      trip?.startDate
    );

    const timeValue = firstValue(
      trip?.arrivalTime,
      trip?.flightArrivalTime,
      outbound.arrivalTime,
      flight.arrivalTime
    );

    if (dateValue && timeValue) {
      const combined = combineDateAndTime(
        dateValue,
        timeValue
      );

      if (combined) return combined;
    }

    const directValue = firstValue(
      trip?.arrivalDateTime,
      trip?.flightArrivalDateTime,
      outbound.arrivalDateTime,
      flight.arrivalDateTime
    );

    const direct = parseDateTime(
      directValue
    );

    if (direct) return direct;

    return combineDateAndTime(
      dateValue || trip?.startDate,
      timeValue
    );
  };

  const getFlightDetails = (trip) => {
    const {
      flight,
      outbound
    } = getFlightSources(trip);

    const departureDateTime =
      getTripDepartureDateTime(trip);

    const arrivalDateTime =
      getTripArrivalDateTime(trip);

    const airportLeadMinutes =
      positiveNumber(
        firstValue(
          trip?.airportLeadMinutes,
          trip?.arriveAirportBeforeMinutes,
          flight.airportLeadMinutes,
          outbound.airportLeadMinutes
        ),
        DEFAULT_AIRPORT_LEAD_MINUTES
      );

    return {
      airline: firstText(
        trip?.airline,
        trip?.airlineName,
        outbound.airline,
        outbound.airlineName,
        flight.airline,
        flight.airlineName
      ),

      flightNumber: firstText(
        trip?.flightNumber,
        trip?.flightNo,
        outbound.flightNumber,
        outbound.flightNo,
        flight.flightNumber,
        flight.flightNo
      ),

      departureAirport: firstText(
        trip?.departureAirport,
        trip?.originAirport,
        outbound.departureAirport,
        outbound.originAirport,
        flight.departureAirport,
        flight.originAirport
      ),

      arrivalAirport: firstText(
        trip?.arrivalAirport,
        trip?.destinationAirport,
        outbound.arrivalAirport,
        outbound.destinationAirport,
        flight.arrivalAirport,
        flight.destinationAirport
      ),

      terminal: firstText(
        trip?.terminal,
        trip?.departureTerminal,
        outbound.terminal,
        outbound.departureTerminal,
        flight.terminal,
        flight.departureTerminal
      ),

      gate: firstText(
        trip?.gate,
        trip?.departureGate,
        outbound.gate,
        outbound.departureGate,
        flight.gate,
        flight.departureGate
      ),

      seat: firstText(
        trip?.seatNumber,
        trip?.seat,
        outbound.seatNumber,
        outbound.seat,
        flight.seatNumber,
        flight.seat
      ),

      bookingReference: firstText(
        trip?.bookingReference,
        trip?.pnr,
        trip?.confirmationNumber,
        outbound.bookingReference,
        flight.bookingReference
      ),

      departureDateTime,
      arrivalDateTime,
      airportLeadMinutes,

      airportArrivalDateTime:
        subtractMinutes(
          departureDateTime,
          airportLeadMinutes
        )
    };
  };

  const getHotelDetails = (trip) => {
    const accommodation = isObject(
      trip?.accommodation
    )
      ? trip.accommodation
      : {};

    const hotel = isObject(trip?.hotel)
      ? trip.hotel
      : {};

    return {
      name: firstText(
        trip?.hotelName,
        trip?.accommodationName,
        accommodation.name,
        accommodation.hotelName,
        hotel.name,
        hotel.hotelName,
        typeof trip?.accommodation ===
        "string"
          ? trip.accommodation
          : ""
      ),

      address: firstText(
        trip?.hotelAddress,
        trip?.accommodationAddress,
        accommodation.address,
        hotel.address
      ),

      confirmationNumber: firstText(
        trip?.hotelConfirmationNumber,
        trip?.hotelBookingReference,
        accommodation.confirmationNumber,
        accommodation.bookingReference,
        hotel.confirmationNumber,
        hotel.bookingReference
      ),

      checkIn: firstValue(
        trip?.hotelCheckIn,
        trip?.checkIn,
        accommodation.checkIn,
        hotel.checkIn
      ),

      checkOut: firstValue(
        trip?.hotelCheckOut,
        trip?.checkOut,
        accommodation.checkOut,
        hotel.checkOut
      )
    };
  };

  const upcomingTripsFrom = (snapshot) => {
    const today = startOfDay(new Date());

    return tripsFrom(snapshot)
      .filter((trip) => {
        const departure =
          getTripDepartureDateTime(trip);

        const startDate =
          departure ||
          parseDateOnly(trip.startDate);

        const endDate =
          parseDateOnly(trip.endDate);

        const status = text(
          trip.status
        ).toLowerCase();

        return (
          startDate &&
          today &&
          (
            startDate >= today ||
            (endDate && endDate >= today)
          ) &&
          ![
            "completed",
            "cancelled",
            "canceled",
            "archived"
          ].includes(status)
        );
      })
      .sort((a, b) => {
        const aDate =
          getTripDepartureDateTime(a) ||
          parseDateOnly(a.startDate);

        const bDate =
          getTripDepartureDateTime(b) ||
          parseDateOnly(b.startDate);

        return (
          (aDate?.getTime() || 0) -
          (bDate?.getTime() || 0)
        );
      });
  };

  const completedTripsFrom = (snapshot) =>
    tripsFrom(snapshot).filter((trip) => {
      const status = text(
        trip.status
      ).toLowerCase();

      const endDate =
        parseDateOnly(trip.endDate);

      const today =
        startOfDay(new Date());

      return (
        status === "completed" ||
        (
          endDate &&
          today &&
          endDate < today
        )
      );
    });

  const countriesCountFrom = (snapshot) => {
    const countries = new Set();

    tripsFrom(snapshot).forEach((trip) => {
      const country =
        text(trip.country) ||
        text(trip.destination)
          .split(/,|،/)
          .pop()
          ?.trim();

      if (country) {
        countries.add(
          country.toLowerCase()
        );
      }
    });

    list(snapshot.destinations).forEach(
      (destination) => {
        const country = text(
          destination.country
        );

        if (country) {
          countries.add(
            country.toLowerCase()
          );
        }
      }
    );

    return countries.size;
  };

  const buildSnapshot = () => {
    const raw = getStoreState();

    const profile = isObject(raw.profile)
      ? raw.profile
      : {};

    const trips = tripsFrom(raw);
    const upcomingTrips =
      upcomingTripsFrom(raw);
    const completedTrips =
      completedTripsFrom(raw);
    const nextTrip =
      upcomingTrips[0] || null;

    const brain =
      readBrainSnapshot();

    const assistant =
      readAssistantSnapshot(brain);

    return {
      raw,
      profile,
      trips,
      upcomingTrips,
      completedTrips,
      nextTrip,

      nextFlight: nextTrip
        ? getFlightDetails(nextTrip)
        : null,

      nextHotel: nextTrip
        ? getHotelDetails(nextTrip)
        : null,

      intelligence: {
        brain,
        assistant,
        message:
          normalizeAssistantMessage(
            assistant
          )
      },

      statistics: {
        totalTrips: trips.length,
        upcomingTrips:
          upcomingTrips.length,
        completedTrips:
          completedTrips.length,
        countries:
          countriesCountFrom(raw),
        wishlist:
          list(raw.wishlist).length,
        memories:
          list(raw.memories).length
      }
    };
  };

  /* =========================================================
     Smart messages
  ========================================================= */

  const formatCountdown = (trip) => {
    if (!trip) return "";

    const target =
      getTripDepartureDateTime(trip) ||
      parseDateOnly(trip.startDate);

    if (!target) {
      return "موعد الرحلة غير محدد";
    }

    const remainingMinutes =
      minutesUntil(target);

    if (
      remainingMinutes !== null &&
      remainingMinutes >= 0 &&
      remainingMinutes < 1440
    ) {
      const hours = Math.floor(
        remainingMinutes / 60
      );

      const minutes =
        remainingMinutes % 60;

      if (hours === 0) {
        return `متبقي ${minutes} دقيقة`;
      }

      if (minutes === 0) {
        return `متبقي ${hours} ساعة`;
      }

      return `متبقي ${hours} ساعة و${minutes} دقيقة`;
    }

    const remainingDays =
      daysUntil(target);

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
    [
      trip?.city,
      trip?.country
    ]
      .filter(Boolean)
      .join("، ") ||
    text(trip?.title) ||
    "رحلة قادمة";

  const getTripStage = (trip) => {
    if (!trip) return "empty";

    const departure =
      getTripDepartureDateTime(trip) ||
      parseDateOnly(trip.startDate);

    const remainingMinutes =
      minutesUntil(departure);

    const remainingDays =
      daysUntil(departure);

    if (
      remainingMinutes !== null &&
      remainingMinutes <= 0 &&
      remainingMinutes >= -1440
    ) {
      return "travel-day";
    }

    if (
      remainingMinutes !== null &&
      remainingMinutes > 0 &&
      remainingMinutes <= 1440
    ) {
      return "within-day";
    }

    if (
      remainingDays !== null &&
      remainingDays >= 0 &&
      remainingDays <= 7
    ) {
      return "within-week";
    }

    if (
      remainingDays !== null &&
      remainingDays > 7 &&
      remainingDays <= 30
    ) {
      return "within-month";
    }

    return "planning";
  };

  const getSmartTripMessage = (
    trip,
    flight,
    hotel,
    assistantMessage = null
  ) => {
    if (
      assistantMessage?.title &&
      assistantMessage?.message
    ) {
      return assistantMessage;
    }

    const stage = getTripStage(trip);

    if (stage === "travel-day") {
      return {
        title: "رحلتك بدأت",
        message:
          "تأكد من مستنداتك واتجه إلى بوابة الصعود في الوقت المناسب."
      };
    }

    if (stage === "within-day") {
      if (flight?.airportArrivalDateTime) {
        return {
          title: "اليوم موعد السفر",
          message:
            `يفضل تكون في المطار الساعة ${formatTime(
              flight.airportArrivalDateTime
            )}.`
        };
      }

      return {
        title: "اليوم موعد السفر",
        message:
          "جهز مستنداتك وتأكد من وقت التوجه إلى المطار."
      };
    }

    if (stage === "within-week") {
      return {
        title: "قرب موعد الرحلة",
        message: hotel?.name
          ? "راجع التذكرة والحجز وخلك جاهز لأيام جميلة."
          : "راجع التذكرة وأضف بيانات الفندق إذا ما اكتملت."
      };
    }

    if (stage === "within-month") {
      return {
        title: "كل يوم يقربك من الرحلة",
        message:
          "راجع حجوزاتك وخطط لأهم التجارب اللي تباها."
      };
    }

    return {
      title: "رحلتك القادمة مرتبة",
      message:
        "خذ وقتك في التخطيط واستمتع بحماس الرحلة من الحين."
    };
  };

  /* =========================================================
     Rendering
  ========================================================= */

  const renderWelcome = (snapshot) => {
    const name =
      snapshot.profile.name ||
      Config.profile?.name ||
      "يوسف";

    return `
      <section
        class="tic-home-welcome"
        aria-labelledby="tic-home-welcome-title"
      >
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

        <div
          class="tic-home-welcome-icon"
          aria-hidden="true"
        >
          ✈
        </div>
      </section>
    `;
  };

  const renderEmptyNextTrip = () => {
    const ui = getUI();

    return `
      <article
        class="tic-home-next-card tic-home-next-card-empty"
      >
        <div class="tic-home-next-top">
          <div>
            <span class="tic-home-kicker">
              خطوتك القادمة
            </span>

            <h3>
              وين بتكون سفرتك الياية؟
            </h3>
          </div>

          <div
            class="tic-home-next-icon"
            aria-hidden="true"
          >
            ✈
          </div>
        </div>

        <p class="tic-home-next-message">
          أنشئ رحلة جديدة وخلك جاهز لأجمل تجربة.
        </p>

        <div class="tic-home-next-actions">
          ${
            ui?.button?.({
              label: "إنشاء رحلة",
              action: "home-new-trip",
              primary: true
            }) ||
            `
              <button
                type="button"
                class="tic-btn tic-btn-primary"
                data-tic-action="home-new-trip"
              >
                إنشاء رحلة
              </button>
            `
          }
        </div>
      </article>
    `;
  };

  const renderTripFact = (
    label,
    value,
    options = {}
  ) => {
    if (!text(value)) return "";

    return `
      <div class="tic-home-trip-fact${
        options.emphasis
          ? " is-emphasis"
          : ""
      }${
        options.full
          ? " is-full"
          : ""
      }">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
      </div>
    `;
  };

  const renderFlightTimeline = (flight) => {
    const rows = [];

    if (
      flight.departureDateTime ||
      flight.departureAirport
    ) {
      rows.push({
        type: "departure",
        label: "الإقلاع",
        time: flight.departureDateTime
          ? formatTime(
              flight.departureDateTime
            )
          : "",
        place: flight.departureAirport,
        meta: [
          flight.terminal
            ? `المبنى ${flight.terminal}`
            : "",
          flight.gate
            ? `البوابة ${flight.gate}`
            : ""
        ]
          .filter(Boolean)
          .join(" • ")
      });
    }

    if (
      flight.arrivalDateTime ||
      flight.arrivalAirport
    ) {
      rows.push({
        type: "arrival",
        label: "الوصول",
        time: flight.arrivalDateTime
          ? formatTime(
              flight.arrivalDateTime
            )
          : "",
        place: flight.arrivalAirport,
        meta: ""
      });
    }

    if (!rows.length) return "";

    return `
      <div class="tic-home-flight-timeline">
        ${rows
          .map(
            (row) => `
              <div
                class="tic-home-flight-stop"
                data-flight-stop="${escapeHTML(
                  row.type
                )}"
              >
                <span
                  class="tic-home-flight-dot"
                  aria-hidden="true"
                ></span>

                <div class="tic-home-flight-stop-copy">
                  <small>${escapeHTML(row.label)}</small>

                  <strong>
                    ${escapeHTML(
                      row.time ||
                      "الوقت غير محدد"
                    )}
                  </strong>

                  ${
                    row.place
                      ? `<p>${escapeHTML(row.place)}</p>`
                      : ""
                  }

                  ${
                    row.meta
                      ? `<em>${escapeHTML(row.meta)}</em>`
                      : ""
                  }
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderFlightDetails = (flight) => {
    const airlineFlight = [
      flight.airline,
      flight.flightNumber
    ]
      .filter(Boolean)
      .join(" • ");

    const secondaryFacts = [
      airlineFlight
        ? renderTripFact(
            "شركة ورقم الرحلة",
            airlineFlight
          )
        : "",

      flight.bookingReference
        ? renderTripFact(
            "رقم الحجز",
            flight.bookingReference
          )
        : "",

      flight.seat
        ? renderTripFact(
            "المقعد",
            flight.seat
          )
        : ""
    ]
      .filter(Boolean)
      .join("");

    const leadHours =
      flight.airportLeadMinutes / 60;

    const leadLabel =
      Number.isInteger(leadHours)
        ? `${leadHours} ساعة`
        : `${leadHours.toLocaleString(
            "ar-AE"
          )} ساعة`;

    return `
      <section
        class="tic-home-detail-block tic-home-flight-block"
      >
        <header>
          <span>تفاصيل الطيران</span>
          <strong>رحلتك الجوية</strong>
        </header>

        ${renderFlightTimeline(flight)}

        ${
          flight.airportArrivalDateTime
            ? `
              <div class="tic-home-airport-time">
                <div>
                  <small>كن في المطار</small>

                  <strong>
                    ${escapeHTML(
                      formatTime(
                        flight.airportArrivalDateTime
                      )
                    )}
                  </strong>
                </div>

                <span>
                  قبل الإقلاع بـ
                  ${escapeHTML(leadLabel)}
                </span>
              </div>
            `
            : ""
        }

        ${
          secondaryFacts
            ? `
              <div
                class="tic-home-detail-grid tic-home-flight-facts"
              >
                ${secondaryFacts}
              </div>
            `
            : ""
        }
      </section>
    `;
  };

  const renderHotelDetails = (hotel) => {
    if (!hotel?.name) return "";

    const facts = [
      hotel.checkIn
        ? renderTripFact(
            "تسجيل الدخول",
            formatCompactDate(
              hotel.checkIn
            )
          )
        : "",

      hotel.checkOut
        ? renderTripFact(
            "تسجيل الخروج",
            formatCompactDate(
              hotel.checkOut
            )
          )
        : "",

      hotel.confirmationNumber
        ? renderTripFact(
            "رقم الحجز",
            hotel.confirmationNumber
          )
        : ""
    ]
      .filter(Boolean)
      .join("");

    return `
      <section
        class="tic-home-detail-block tic-home-hotel-block"
      >
        <header>
          <span>الإقامة</span>

          <strong>
            ${escapeHTML(hotel.name)}
          </strong>

          ${
            hotel.address
              ? `<p>${escapeHTML(hotel.address)}</p>`
              : ""
          }
        </header>

        ${
          facts
            ? `
              <div class="tic-home-detail-grid">
                ${facts}
              </div>
            `
            : ""
        }
      </section>
    `;
  };

  const renderSmartNextTrip = (snapshot) => {
    const ui = getUI();
    const trip = snapshot.nextTrip;
    const flight = snapshot.nextFlight;
    const hotel = snapshot.nextHotel;

    const duration = number(
      trip.durationDays,
      durationDays(
        trip.startDate,
        trip.endDate
      )
    );

    const smartMessage =
      getSmartTripMessage(
        trip,
        flight,
        hotel,
        snapshot.intelligence.message
      );

    const travelDate = formatFullDate(
      flight?.departureDateTime ||
      trip.startDate
    );

    const hasFlightDetails = Boolean(
      flight &&
      (
        flight.airline ||
        flight.flightNumber ||
        flight.departureDateTime ||
        flight.arrivalDateTime ||
        flight.departureAirport ||
        flight.arrivalAirport ||
        flight.terminal ||
        flight.gate
      )
    );

    return `
      <article
        class="tic-home-next-card tic-home-next-card-smart"
        data-trip-stage="${escapeHTML(
          getTripStage(trip)
        )}"
      >
        <div class="tic-home-next-top">
          <div>
            <span class="tic-home-kicker">
              ${escapeHTML(
                formatCountdown(trip)
              )}
            </span>

            <h3>
              ${escapeHTML(
                trip.title ||
                getTripDestination(trip)
              )}
            </h3>

            <p>
              ${escapeHTML(
                getTripDestination(trip)
              )}
            </p>
          </div>

          <div
            class="tic-home-next-icon"
            aria-hidden="true"
          >
            ✈
          </div>
        </div>

        <div class="tic-home-trip-highlight">
          <strong>
            ${escapeHTML(smartMessage.title)}
          </strong>

          <p>
            ${escapeHTML(smartMessage.message)}
          </p>
        </div>

        <div class="tic-home-trip-meta">
          ${renderTripFact(
            "موعد السفر",
            travelDate,
            { full: true }
          )}

          ${renderTripFact(
            "المدة",
            duration > 0
              ? `${duration} يوم`
              : "غير محددة"
          )}

          ${renderTripFact(
            "الميزانية",
            ui?.currency?.(trip.budget) ||
            `${number(
              trip.budget
            ).toLocaleString()} AED`
          )}
        </div>

        ${
          hasFlightDetails
            ? renderFlightDetails(flight)
            : `
              <button
                type="button"
                class="tic-home-add-details"
                data-tic-action="home-edit-next-trip"
              >
                <span aria-hidden="true">＋</span>
                أضف بيانات التذكرة والطيران
              </button>
            `
        }

        ${renderHotelDetails(hotel)}

        <div class="tic-home-next-actions">
          ${
            ui?.button?.({
              label: "عرض الرحلة",
              route: "trips",
              view: "details",
              params: {
                tripId: trip.id
              },
              primary: true
            }) ||
            `
              <button
                type="button"
                class="tic-btn tic-btn-primary"
                data-tic-route="trips"
                data-trip-id="${escapeHTML(
                  trip.id
                )}"
              >
                عرض الرحلة
              </button>
            `
          }

          ${
            ui?.button?.({
              label: "تعديل البيانات",
              action:
                "home-edit-next-trip"
            }) ||
            `
              <button
                type="button"
                class="tic-btn"
                data-tic-action="home-edit-next-trip"
              >
                تعديل البيانات
              </button>
            `
          }
        </div>
      </article>
    `;
  };

  const renderNextTrip = (snapshot) =>
    snapshot.nextTrip
      ? renderSmartNextTrip(snapshot)
      : renderEmptyNextTrip();

  const renderStatistics = (snapshot) => {
    const stats = [
      {
        icon: "✈",
        value:
          snapshot.statistics.totalTrips,
        label: "الرحلات"
      },
      {
        icon: "◎",
        value:
          snapshot.statistics.countries,
        label: "الدول"
      },
      {
        icon: "☆",
        value:
          snapshot.statistics.wishlist,
        label: "الأمنيات"
      },
      {
        icon: "◈",
        value:
          snapshot.statistics.memories,
        label: "الذكريات"
      }
    ];

    return `
      <div class="tic-home-stats">
        ${stats
          .map(
            (item) => `
              <article class="tic-home-stat">
                <span
                  class="tic-home-stat-icon"
                  aria-hidden="true"
                >
                  ${item.icon}
                </span>

                <strong>${number(
                  item.value
                )}</strong>

                <small>${escapeHTML(
                  item.label
                )}</small>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderInspiration = (snapshot) => {
    const assistantMessage =
      snapshot.intelligence.message;

    if (
      assistantMessage?.title &&
      assistantMessage?.message
    ) {
      return `
        <article class="tic-home-inspiration">
          <div
            class="tic-home-inspiration-icon"
            aria-hidden="true"
          >
            ✦
          </div>

          <div class="tic-home-inspiration-copy">
            <span>إلهام السفر</span>
            <h3>${escapeHTML(
              assistantMessage.title
            )}</h3>
            <p>${escapeHTML(
              assistantMessage.message
            )}</p>
          </div>
        </article>
      `;
    }

    const trip = snapshot.nextTrip;

    const remainingDays = trip
      ? daysUntil(
          getTripDepartureDateTime(trip) ||
          trip.startDate
        )
      : null;

    let title =
      "رحلتك تبدأ بفكرة جميلة";

    let message =
      "اختر وجهة تحبها، وخطط لها على راحتك، وخلك مستمتع من أول خطوة.";

    if (
      trip &&
      remainingDays !== null
    ) {
      if (
        remainingDays <= 7 &&
        remainingDays >= 0
      ) {
        title = "قرب موعد المغامرة";
        message =
          "رتب أمورك بهدوء واستمتع بحماس الأيام الأخيرة قبل السفر.";
      } else if (
        remainingDays <= 30 &&
        remainingDays > 7
      ) {
        title =
          "كل يوم يقربك من رحلتك";

        message =
          "استمتع بالتخطيط؛ أجمل الرحلات تبدأ قبل الوصول.";
      } else if (
        remainingDays > 30
      ) {
        title =
          "عندك وقت تخلي الرحلة أجمل";

        message =
          "اكتشف تفاصيل أكثر عن وجهتك واختر التجارب اللي تناسبك.";
      }
    }

    return `
      <article class="tic-home-inspiration">
        <div
          class="tic-home-inspiration-icon"
          aria-hidden="true"
        >
          ✦
        </div>

        <div class="tic-home-inspiration-copy">
          <span>إلهام السفر</span>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(message)}</p>
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
      <span>${escapeHTML(eyebrow)}</span>
      <h2>${escapeHTML(title)}</h2>

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
      data-has-next-trip="${
        snapshot.nextTrip
          ? "true"
          : "false"
      }"
      data-travel-brain="${
        snapshot.intelligence.brain
          ? "connected"
          : "fallback"
      }"
      data-travel-assistant="${
        snapshot.intelligence.assistant
          ? "connected"
          : "fallback"
      }"
    >
      ${renderWelcome(snapshot)}

      <section
        class="tic-home-section tic-home-next-section"
      >
        ${renderSectionHeader({
          eyebrow: "NEXT JOURNEY",
          title: "الرحلة القادمة",
          subtitle: snapshot.nextTrip
            ? "أهم تفاصيل سفرتك الأقرب في مكان واحد."
            : "تفاصيل سفرتك الأقرب بشكل بسيط."
        })}

        ${renderNextTrip(snapshot)}
      </section>

      <section
        class="tic-home-section tic-home-snapshot-section"
      >
        ${renderSectionHeader({
          eyebrow: "YOUR TRAVEL",
          title: "سفراتك",
          subtitle:
            "أرقام خفيفة من سجل سفرك."
        })}

        ${renderStatistics(snapshot)}
      </section>

      <section
        class="tic-home-section tic-home-inspiration-section"
      >
        ${renderInspiration(snapshot)}
      </section>
    </div>
  `;

  /* =========================================================
     Refresh and intelligence coordination
  ========================================================= */

  const refreshIntelligence = async (
    source = "home-refresh"
  ) => {
    if (state.intelligenceRefreshRunning) {
      return false;
    }

    state.intelligenceRefreshRunning = true;

    try {
      const app = getApp();

      if (
        typeof app?.refreshIntelligence ===
        "function"
      ) {
        await app.refreshIntelligence({
          source,
          silent: true
        });

        return true;
      }

      const brain = getTravelBrain();
      const assistant =
        getTravelAssistant();

      if (
        typeof brain?.refresh === "function"
      ) {
        await brain.refresh({
          source,
          silent: true
        });
      }

      if (
        typeof assistant?.refresh ===
        "function"
      ) {
        await assistant.refresh({
          source,
          silent: true
        });
      }

      return true;
    } catch (error) {
      console.warn(
        "TIC Home intelligence refresh warning:",
        error
      );

      return false;
    } finally {
      state.intelligenceRefreshRunning =
        false;
    }
  };

  const refresh = (
    options = {}
  ) => {
    if (
      !state.container ||
      !state.mounted ||
      state.destroyed
    ) {
      return false;
    }

    if (state.refreshing) {
      state.refreshQueued = true;
      return false;
    }

    state.refreshing = true;

    try {
      const snapshot = buildSnapshot();
      const signature = stableStringify({
        profile: snapshot.profile,
        nextTrip: snapshot.nextTrip,
        nextFlight: snapshot.nextFlight,
        nextHotel: snapshot.nextHotel,
        statistics: snapshot.statistics,
        intelligenceMessage:
          snapshot.intelligence.message
      });

      state.lastSnapshot = snapshot;
      state.lastRefreshAt = nowISO();
      state.lastRefreshSource =
        options.source ||
        "manual";

      if (
        options.force === true ||
        signature !== state.lastRenderSignature
      ) {
        state.container.innerHTML =
          renderPage(snapshot);

        state.lastRenderSignature =
          signature;
      }

      emit("refreshed", {
        source:
          state.lastRefreshSource,
        statistics:
          snapshot.statistics,
        nextTripId:
          snapshot.nextTrip?.id ||
          null,
        travelBrainConnected:
          Boolean(
            snapshot.intelligence.brain
          ),
        travelAssistantConnected:
          Boolean(
            snapshot.intelligence.assistant
          )
      });

      return true;
    } finally {
      state.refreshing = false;

      if (state.refreshQueued) {
        state.refreshQueued = false;

        window.setTimeout(
          () =>
            refresh({
              source:
                "queued-refresh"
            }),
          0
        );
      }
    }
  };

  const scheduleRefresh = (
    source = "runtime-event",
    options = {}
  ) => {
    if (
      !state.mounted ||
      state.destroyed
    ) {
      return false;
    }

    if (state.refreshTimer) {
      window.clearTimeout(
        state.refreshTimer
      );
    }

    state.refreshTimer =
      window.setTimeout(
        async () => {
          state.refreshTimer = null;

          if (
            options.refreshIntelligence ===
            true
          ) {
            await refreshIntelligence(
              source
            );
          }

          refresh({
            source,
            force:
              options.force === true
          });
        },
        number(
          options.delay,
          REFRESH_DEBOUNCE_MS
        )
      );

    return true;
  };

  /* =========================================================
     Actions
  ========================================================= */

  const openCreateTrip = () => {
    const travelImport =
      getTravelImport();

    const tripForm =
      getTripForm();

    if (
      tripForm &&
      typeof tripForm.openCreate ===
        "function"
    ) {
      return tripForm.openCreate({
        source: "home",
        mode: "create",
        smartImport:
          Boolean(travelImport)
      });
    }

    return getRouter()?.go?.(
      "trip-form",
      {
        params: {
          mode: "create",
          smartImport:
            Boolean(travelImport)
        },
        source:
          "home-new-trip"
      }
    );
  };

  const openEditTrip = (tripId) => {
    const travelImport =
      getTravelImport();

    const tripForm =
      getTripForm();

    if (
      tripForm &&
      typeof tripForm.openEdit ===
        "function"
    ) {
      return tripForm.openEdit(
        tripId,
        {
          source: "home",
          smartImport:
            Boolean(travelImport)
        }
      );
    }

    return getRouter()?.go?.(
      "trip-form",
      {
        params: {
          mode: "edit",
          tripId,
          smartImport:
            Boolean(travelImport)
        },
        source:
          "home-edit-next-trip"
      }
    );
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !==
        "function"
    ) {
      return;
    }

    const register = (
      name,
      handler
    ) => {
      if (ui.hasAction?.(name)) {
        return;
      }

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
      "home-new-trip",
      openCreateTrip
    );

    register(
      "home-edit-next-trip",
      () => {
        const tripId =
          state.lastSnapshot
            ?.nextTrip?.id;

        if (!tripId) {
          getUI()?.toast?.(
            "لا توجد رحلة قادمة للتعديل.",
            "warning"
          );

          return false;
        }

        return openEditTrip(tripId);
      }
    );

    register(
      "home-refresh-intelligence",
      async () => {
        await refreshIntelligence(
          "home-manual-action"
        );

        return refresh({
          source:
            "home-manual-action",
          force: true
        });
      }
    );
  };

  /* =========================================================
     Store and runtime event bindings
  ========================================================= */

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !==
        "function" ||
      state.unsubscribeStore
    ) {
      return false;
    }

    try {
      state.unsubscribeStore =
        store.subscribe(
          (
            snapshot,
            event
          ) => {
            scheduleRefresh(
              event?.type ||
              event?.action ||
              "store-update",
              {
                refreshIntelligence:
                  true
              }
            );
          }
        );

      return true;
    } catch (error) {
      console.warn(
        "TIC Home Store subscription warning:",
        error
      );

      return false;
    }
  };

  const bindRuntimeEvents = () => {
    if (state.runtimeBindings.length) {
      return;
    }

    const bind = (
      name,
      handler,
      target = window
    ) => {
      target.addEventListener(
        name,
        handler
      );

      state.runtimeBindings.push({
        name,
        handler,
        target
      });
    };

    const refreshHandler = (event) => {
      scheduleRefresh(
        event?.type ||
        "intelligence-event",
        {
          refreshIntelligence:
            false,
          force: true
        }
      );
    };

    const intelligenceHandler = (
      event
    ) => {
      scheduleRefresh(
        event?.type ||
        "intelligence-update",
        {
          refreshIntelligence:
            true,
          force: true
        }
      );
    };

    [
      "tic:travel-brain:updated",
      "tic:travel-brain:refreshed",
      "tic:travel-assistant:updated",
      "tic:travel-assistant:response",
      "tic:travel-assistant:refreshed",
      "tic:travel-import:completed",
      "tic:travel-import:imported",
      "tic:travel-import:data-imported",
      "tic:travel-sync:applied",
      "tic:travel-sync:pull-completed",
      "tic:travel-sync:remote-state-applied",
      "tic:app:intelligence-refreshed"
    ].forEach((name) => {
      bind(name, refreshHandler);
    });

    [
      "tic:trip-created",
      "tic:trip-updated",
      "tic:trip-deleted",
      "tic:planned-trip-created",
      "tic:planned-trip-updated",
      "tic:planned-trip-promoted",
      "tic:planned-trip-deleted",
      "tic:page:trips:passport-trip-created",
      "tic:page:trips:passport-trip-updated",
      "tic:guide:refresh-requested"
    ].forEach((name) => {
      bind(name, intelligenceHandler);
    });

    bind(
      "visibilitychange",
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          scheduleRefresh(
            "visibilitychange",
            {
              refreshIntelligence:
                true,
              force: true,
              delay: 0
            }
          );
        }
      },
      document
    );
  };

  const unbindRuntimeEvents = () => {
    state.runtimeBindings.forEach(
      ({
        name,
        handler,
        target
      }) => {
        target.removeEventListener(
          name,
          handler
        );
      }
    );

    state.runtimeBindings = [];
  };

  /* =========================================================
     Public page API
  ========================================================= */

  const HomePage = {
    id: PAGE_ID,
    title: "الرئيسية",
    icon: "⌂",
    version: PAGE_VERSION,

    init(context = {}) {
      if (
        state.initialized &&
        !state.destroyed
      ) {
        return this.diagnostics();
      }

      state.destroyed = false;

      registerActions();
      subscribeToStore();
      bindRuntimeEvents();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION,
        travelBrainAvailable:
          Boolean(getTravelBrain()),
        travelAssistantAvailable:
          Boolean(
            getTravelAssistant()
          ),
        travelImportAvailable:
          Boolean(getTravelImport()),
        travelSyncAvailable:
          Boolean(getTravelSync()),
        source:
          context.source ||
          "page-init"
      });

      return this.diagnostics();
    },

    render() {
      this.init({
        source: "render"
      });

      const snapshot =
        buildSnapshot();

      state.lastSnapshot = snapshot;
      state.lastRenderSignature =
        stableStringify({
          profile: snapshot.profile,
          nextTrip: snapshot.nextTrip,
          nextFlight:
            snapshot.nextFlight,
          nextHotel:
            snapshot.nextHotel,
          statistics:
            snapshot.statistics,
          intelligenceMessage:
            snapshot.intelligence.message
        });

      return renderPage(snapshot);
    },

    mount(context = {}) {
      this.init({
        source: "mount"
      });

      const container =
        resolveContainer(
          context.container
        );

      if (!container) {
        throw new Error(
          "TIC Home Page Error: route container was not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const snapshot =
        buildSnapshot();

      state.lastSnapshot = snapshot;
      state.lastRenderSignature =
        stableStringify({
          profile: snapshot.profile,
          nextTrip: snapshot.nextTrip,
          nextFlight:
            snapshot.nextFlight,
          nextHotel:
            snapshot.nextHotel,
          statistics:
            snapshot.statistics,
          intelligenceMessage:
            snapshot.intelligence.message
        });

      container.innerHTML =
        renderPage(snapshot);

      emit("mounted", {
        nextTripId:
          snapshot.nextTrip?.id ||
          null,
        statistics:
          snapshot.statistics,
        travelBrainConnected:
          Boolean(
            snapshot.intelligence.brain
          ),
        travelAssistantConnected:
          Boolean(
            snapshot.intelligence.assistant
          )
      });

      refreshIntelligence(
        "home-mounted"
      ).then(() => {
        scheduleRefresh(
          "home-mounted-intelligence",
          {
            force: true,
            delay: 0
          }
        );
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

      scheduleRefresh(
        "after-enter",
        {
          refreshIntelligence:
            true,
          force: true,
          delay: 0
        }
      );

      return true;
    },

    unmount() {
      if (state.refreshTimer) {
        window.clearTimeout(
          state.refreshTimer
        );

        state.refreshTimer = null;
      }

      state.mounted = false;
      state.container = null;

      emit("unmounted");

      return true;
    },

    refresh,

    async refreshIntelligence(
      options = {}
    ) {
      const result =
        await refreshIntelligence(
          options.source ||
          "home-public-api"
        );

      refresh({
        source:
          options.source ||
          "home-public-api",
        force: true
      });

      return result;
    },

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    getIntelligenceSnapshot() {
      const snapshot =
        state.lastSnapshot ||
        buildSnapshot();

      return clone(
        snapshot.intelligence
      );
    },

    subscribe(listener) {
      if (
        typeof listener !==
        "function"
      ) {
        throw new TypeError(
          "TIC Home subscriber must be a function."
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
          if (
            typeof unsubscribe ===
            "function"
          ) {
            unsubscribe();
          }
        }
      );

      unbindRuntimeEvents();

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.lastRenderSignature = "";
      state.lastRefreshAt = null;
      state.lastRefreshSource = null;
      state.refreshQueued = false;
      state.refreshing = false;
      state.intelligenceRefreshRunning =
        false;
      state.initialized = false;
      state.destroyed = true;

      return true;
    },

    diagnostics() {
      const snapshot =
        state.lastSnapshot ||
        buildSnapshot();

      const travelBrain =
        getTravelBrain();

      const travelAssistant =
        getTravelAssistant();

      const travelImport =
        getTravelImport();

      const travelSync =
        getTravelSync();

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized:
          state.initialized,
        mounted:
          state.mounted,
        destroyed:
          state.destroyed,
        refreshing:
          state.refreshing,
        refreshQueued:
          state.refreshQueued,
        hasContainer:
          Boolean(state.container),
        storeAvailable:
          Boolean(getStore()),
        routerAvailable:
          Boolean(getRouter()),
        uiAvailable:
          Boolean(getUI()),
        tripFormAvailable:
          Boolean(getTripForm()),
        travelBrainAvailable:
          Boolean(travelBrain),
        travelBrainVersion:
          travelBrain?.version ||
          travelBrain?.VERSION ||
          null,
        travelAssistantAvailable:
          Boolean(travelAssistant),
        travelAssistantVersion:
          travelAssistant?.version ||
          travelAssistant?.VERSION ||
          null,
        travelImportAvailable:
          Boolean(travelImport),
        travelImportVersion:
          travelImport?.version ||
          travelImport?.VERSION ||
          null,
        travelSyncAvailable:
          Boolean(travelSync),
        travelSyncVersion:
          travelSync?.version ||
          travelSync?.VERSION ||
          null,
        actionCount:
          state.actionUnsubscribers.length,
        runtimeBindingCount:
          state.runtimeBindings.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot:
          Boolean(state.lastSnapshot),
        hasNextTrip:
          Boolean(snapshot.nextTrip),
        nextTripId:
          snapshot.nextTrip?.id ||
          null,
        intelligenceMessageAvailable:
          Boolean(
            snapshot.intelligence
              ?.message
          ),
        lastRefreshAt:
          state.lastRefreshAt,
        lastRefreshSource:
          state.lastRefreshSource,
        defaultAirportLeadMinutes:
          DEFAULT_AIRPORT_LEAD_MINUTES,
        manualFlightTimePriority:
          true
      };
    }
  };

  window.TIC.Pages.home =
    HomePage;

  window.TICHomePage =
    HomePage;

  const router = getRouter();

  if (
    router &&
    typeof router.register ===
      "function"
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
      typeof router.registerPage ===
      "function"
    ) {
      router.registerPage(
        "home",
        HomePage
      );
    }
  }

  HomePage.init({
    source: "automatic"
  });
})(window, document);
