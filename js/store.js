/* =========================================================
   Travel Intelligence Center
   Central Store V1.1.0

   File Path:
   js/store.js

   Purpose:
   - Single source of truth for all application data.
   - Handles localStorage persistence.
   - Preserves all Trip Form V4 flight, hotel and travel fields.
   - Provides read, write, update, delete, backup,
     restore, reset, import, export, and subscriptions.

   V1.1.0 Fixes:
   - Preserves departure and arrival dates/times after saving.
   - Preserves airport lead time and calculates no default overwrite.
   - Preserves airline, flight, airport, terminal, gate, seat and PNR.
   - Preserves hotel, travelers, activities and optional trip fields.
   - Keeps unknown future trip fields instead of deleting them.
   - Adds Store compatibility aliases used by Trip Form and pages.
========================================================= */

(function (window) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config;

  if (!Config) {
    throw new Error(
      "TIC Store Error: configuration was not found. Load js/config.js before js/store.js."
    );
  }

  const STORAGE_KEY = Config.storage.stateKey;
  const BACKUP_KEY = Config.storage.backupKey;
  const SCHEMA_VERSION = Config.storage.schemaVersion;
  const AUTO_SAVE_DELAY = Number(Config.storage.autoSaveDelay) || 120;
  const MAX_BACKUPS = Number(Config.storage.maxBackups) || 3;

  const listeners = new Set();
  let saveTimer = null;

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

  const nowISO = () => new Date().toISOString();

  const createId = (prefix = "item") => {
    const random =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    return `${prefix}_${random}`;
  };

  const text = (value) =>
    String(value ?? "").trim();

  const toNumber = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const toBoolean = (value, fallback = false) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === 1 || value === "1") {
      return true;
    }

    if (value === "false" || value === 0 || value === "0") {
      return false;
    }

    return fallback;
  };

  const normalizeDate = (value) => {
    if (!value) return "";

    const raw = text(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  };

  const normalizeTime = (value) => {
    if (!value) return "";

    const raw = text(value);

    if (/^\d{1,2}:\d{2}$/.test(raw)) {
      const [hours, minutes] = raw.split(":");

      return `${String(Math.min(23, toNumber(hours))).padStart(2, "0")}:${String(
        Math.min(59, toNumber(minutes))
      ).padStart(2, "0")}`;
    }

    const arabicPeriod = raw.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(ص|م)$/
    );

    if (arabicPeriod) {
      let hours = toNumber(arabicPeriod[1]) % 12;

      if (arabicPeriod[3] === "م") {
        hours += 12;
      }

      return `${String(hours).padStart(2, "0")}:${String(
        Math.min(59, toNumber(arabicPeriod[2]))
      ).padStart(2, "0")}`;
    }

    const englishPeriod = raw.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i
    );

    if (englishPeriod) {
      let hours = toNumber(englishPeriod[1]) % 12;

      if (englishPeriod[3].toUpperCase() === "PM") {
        hours += 12;
      }

      return `${String(hours).padStart(2, "0")}:${String(
        Math.min(59, toNumber(englishPeriod[2]))
      ).padStart(2, "0")}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
  };

  const normalizeArray = (value) =>
    Array.isArray(value) ? clone(value) : [];

  const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => text(item))
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  };

  const deepMerge = (target, source) => {
    const output = isObject(target) ? clone(target) : {};

    if (!isObject(source)) {
      return output;
    }

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (isObject(sourceValue) && isObject(targetValue)) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else {
        output[key] = clone(sourceValue);
      }
    });

    return output;
  };

  const getDefaultState = () => ({
    meta: {
      appId: Config.id,
      appVersion: Config.appVersion,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastBackupAt: null
    },

    profile: {
      id: "profile_main",
      name: Config.defaults.profileName,
      country: Config.defaults.country,
      city: Config.defaults.city,
      language: Config.defaults.language,
      currency: Config.defaults.currency,
      travelStyle: "Premium Family",
      homeAirport: "Abu Dhabi",
      annualTravelBudget: 30000,
      monthlyTravelSaving: 1500,
      avatar: "",
      createdAt: nowISO(),
      updatedAt: nowISO()
    },

    statistics: {
      totalTrips: 0,
      completedTrips: 0,
      upcomingTrips: 0,
      activeTrips: 0,
      visitedCountries: 0,
      visitedCities: 0,
      wishlistCount: 0,
      totalTravelSpend: 0,
      totalTravelBudget: 0,
      savedForTravel: 0
    },

    trips: [],

    destinations: [],

    wishlist: [],

    guides: {
      savedPlaces: [],
      hotels: [],
      restaurants: [],
      activities: [],
      transport: [],
      notes: []
    },

    budgets: {
      annualBudget: 30000,
      monthlySavingTarget: 1500,
      savingsBalance: 0,
      totalSpent: 0,
      categories: {},
      expenses: []
    },

    savings: {
      goals: [],
      contributions: []
    },

    documents: [],

    packing: {
      templates: [],
      lists: []
    },

    reviews: [],

    memories: [],

    notifications: [],

    settings: {
      currency: Config.defaults.currency,
      language: Config.defaults.language,
      theme: Config.defaults.theme,
      dateFormat: Config.defaults.dateFormat,
      enableAnimations: Config.app.enableAnimations,
      enableNotifications: true,
      confirmBeforeDelete: true,
      autoBackup: true
    }
  });

  const isValidTripStatus = (status) => {
    const value = text(status);

    if (!value) {
      return false;
    }

    const allowedFallback = [
      "draft",
      "planning",
      "planned",
      "booked",
      "confirmed",
      "ready",
      "ongoing",
      "active",
      "completed",
      "cancelled",
      "archived"
    ];

    if (Array.isArray(Config.tripStatuses)) {
      return Config.tripStatuses.some((item) => {
        if (typeof item === "string") {
          return item === value;
        }

        return item?.value === value || item?.id === value;
      });
    }

    if (isObject(Config.tripStatuses)) {
      return Object.prototype.hasOwnProperty.call(
        Config.tripStatuses,
        value
      );
    }

    return allowedFallback.includes(value);
  };

  const normalizeTrip = (trip = {}) => {
    const source = isObject(trip) ? clone(trip) : {};
    const defaultStatus =
      Config.defaults.tripStatus ||
      "planning";

    const normalized = {
      /*
       * Keep all existing and future trip fields first.
       * Explicit normalized values below safely override them.
       */
      ...source,

      id: source.id || createId("trip"),

      title: text(source.title),
      destination: text(source.destination),
      country: text(source.country),
      city: text(source.city),

      purpose: text(source.purpose) || "leisure",
      tripType: text(source.tripType) || "family",
      travelStyle:
        text(source.travelStyle) ||
        text(state?.profile?.travelStyle) ||
        "premium-family",

      status: isValidTripStatus(source.status)
        ? text(source.status)
        : defaultStatus,

      priority: text(source.priority) || "normal",

      startDate: normalizeDate(source.startDate),
      endDate: normalizeDate(source.endDate),
      durationDays: Math.max(
        0,
        Math.round(toNumber(source.durationDays, 0))
      ),

      travelers: Math.max(
        1,
        Math.min(
          Config.validation.trip.maxTravelers,
          Math.round(
            toNumber(
              source.travelers,
              Config.defaults.travelers
            )
          )
        )
      ),

      adults: Math.max(
        0,
        Math.round(
          toNumber(
            source.adults,
            source.travelers || Config.defaults.travelers
          )
        )
      ),

      children: Math.max(
        0,
        Math.round(toNumber(source.children, 0))
      ),

      infants: Math.max(
        0,
        Math.round(toNumber(source.infants, 0))
      ),

      budget: Math.max(
        0,
        Math.min(
          Config.validation.trip.maxBudget,
          toNumber(source.budget, Config.defaults.budget)
        )
      ),

      spent: Math.max(
        0,
        toNumber(source.spent, 0)
      ),

      currency:
        text(source.currency) ||
        Config.defaults.currency,

      /*
       * Flight fields used by Trip Form V4 and Home V2.3.
       */
      departureAirport: text(source.departureAirport),
      arrivalAirport: text(source.arrivalAirport),
      airline: text(source.airline),
      flightNumber: text(source.flightNumber),

      departureDate: normalizeDate(
        source.departureDate
      ),

      departureTime: normalizeTime(
        source.departureTime
      ),

      arrivalDate: normalizeDate(
        source.arrivalDate
      ),

      arrivalTime: normalizeTime(
        source.arrivalTime
      ),

      departureDateTime:
        source.departureDateTime || "",

      arrivalDateTime:
        source.arrivalDateTime || "",

      terminal: text(source.terminal),
      gate: text(source.gate),
      seatNumber: text(source.seatNumber),
      bookingReference: text(source.bookingReference),

      airportLeadMinutes: Math.max(
        0,
        toNumber(source.airportLeadMinutes, 120)
      ),

      /*
       * Keep legacy and nested flight structures.
       */
      flight: isObject(source.flight)
        ? clone(source.flight)
        : {},

      outboundFlight: isObject(source.outboundFlight)
        ? clone(source.outboundFlight)
        : {},

      flights: normalizeArray(source.flights),

      /*
       * Hotel and accommodation fields.
       */
      accommodation:
        typeof source.accommodation === "string"
          ? text(source.accommodation)
          : isObject(source.accommodation)
            ? clone(source.accommodation)
            : "",

      accommodationName: text(source.accommodationName),
      accommodationAddress: text(source.accommodationAddress),
      hotelName: text(source.hotelName),
      hotelAddress: text(source.hotelAddress),
      hotelBookingReference: text(
        source.hotelBookingReference ||
        source.hotelConfirmationNumber
      ),

      hotelConfirmationNumber: text(
        source.hotelConfirmationNumber ||
        source.hotelBookingReference
      ),

      hotelCheckIn: normalizeDate(
        source.hotelCheckIn ||
        source.checkIn
      ),

      hotelCheckOut: normalizeDate(
        source.hotelCheckOut ||
        source.checkOut
      ),

      checkIn: normalizeDate(
        source.checkIn ||
        source.hotelCheckIn
      ),

      checkOut: normalizeDate(
        source.checkOut ||
        source.hotelCheckOut
      ),

      hotel: isObject(source.hotel)
        ? clone(source.hotel)
        : {},

      /*
       * Additional trip information.
       */
      transport: text(source.transport),
      activities: normalizeStringArray(source.activities),
      emergencyContact: text(source.emergencyContact),

      visaRequired: toBoolean(
        source.visaRequired,
        false
      ),

      insuranceRequired: toBoolean(
        source.insuranceRequired,
        true
      ),

      featured: toBoolean(
        source.featured,
        false
      ),

      ticketImport: isObject(source.ticketImport)
        ? clone(source.ticketImport)
        : source.ticketImport || null,

      hotelImport: isObject(source.hotelImport)
        ? clone(source.hotelImport)
        : source.hotelImport || null,

      bookings: normalizeArray(source.bookings),
      itinerary: normalizeArray(source.itinerary),
      expenses: normalizeArray(source.expenses),
      documents: normalizeArray(source.documents),
      packing: normalizeArray(source.packing),
      memories: normalizeArray(source.memories),

      notes: String(source.notes || "").slice(
        0,
        Config.validation.trip.notesMaxLength
      ),

      coverImage: text(source.coverImage),
      archivedAt: source.archivedAt || null,
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO()
    };

    /*
     * Calculate duration only when both dates are valid and the supplied
     * duration is absent or zero.
     */
    if (
      normalized.startDate &&
      normalized.endDate &&
      normalized.durationDays <= 0
    ) {
      const start = new Date(
        `${normalized.startDate}T00:00:00`
      );

      const end = new Date(
        `${normalized.endDate}T00:00:00`
      );

      if (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        end >= start
      ) {
        normalized.durationDays =
          Math.floor(
            (end.getTime() - start.getTime()) /
            86400000
          ) + 1;
      }
    }

    return normalized;
  };

  const normalizeExpense = (expense = {}) => ({
    ...clone(expense),

    id: expense.id || createId("expense"),
    tripId: expense.tripId || null,
    category: expense.category || "other",
    title: text(expense.title),
    amount: Math.max(0, toNumber(expense.amount, 0)),
    currency: expense.currency || Config.defaults.currency,
    date: expense.date || new Date().toISOString().slice(0, 10),
    notes: String(expense.notes || ""),
    createdAt: expense.createdAt || nowISO(),
    updatedAt: nowISO()
  });

  const normalizeState = (input) => {
    const defaults = getDefaultState();
    const merged = deepMerge(
      defaults,
      isObject(input) ? input : {}
    );

    merged.meta.appId = Config.id;
    merged.meta.appVersion = Config.appVersion;
    merged.meta.schemaVersion = SCHEMA_VERSION;
    merged.meta.updatedAt = nowISO();

    merged.trips = Array.isArray(merged.trips)
      ? merged.trips.map(normalizeTrip)
      : [];

    merged.budgets.expenses = Array.isArray(
      merged.budgets.expenses
    )
      ? merged.budgets.expenses.map(normalizeExpense)
      : [];

    [
      "destinations",
      "wishlist",
      "documents",
      "reviews",
      "memories",
      "notifications"
    ].forEach((key) => {
      if (!Array.isArray(merged[key])) {
        merged[key] = [];
      }
    });

    return merged;
  };

  const calculateStatistics = (currentState) => {
    const trips = Array.isArray(currentState.trips)
      ? currentState.trips
      : [];

    const expenses = Array.isArray(
      currentState.budgets?.expenses
    )
      ? currentState.budgets.expenses
      : [];

    const wishlist = Array.isArray(
      currentState.wishlist
    )
      ? currentState.wishlist
      : [];

    const visibleTrips = trips.filter(
      (trip) => trip.status !== "archived"
    );

    const completedTrips = visibleTrips.filter(
      (trip) => trip.status === "completed"
    );

    const countries = new Set(
      completedTrips
        .map((trip) => text(trip.country))
        .filter(Boolean)
    );

    const cities = new Set(
      completedTrips
        .map((trip) => text(trip.city))
        .filter(Boolean)
    );

    const totalTravelSpend = expenses.reduce(
      (total, expense) =>
        total + toNumber(expense.amount, 0),
      0
    );

    const totalTravelBudget = visibleTrips.reduce(
      (total, trip) =>
        total + toNumber(trip.budget, 0),
      0
    );

    currentState.statistics = {
      totalTrips: visibleTrips.length,

      completedTrips:
        completedTrips.length,

      upcomingTrips: visibleTrips.filter((trip) =>
        [
          "draft",
          "planning",
          "planned",
          "booked",
          "confirmed",
          "ready"
        ].includes(trip.status)
      ).length,

      activeTrips: visibleTrips.filter((trip) =>
        ["active", "ongoing"].includes(trip.status)
      ).length,

      visitedCountries: countries.size,
      visitedCities: cities.size,
      wishlistCount: wishlist.length,
      totalTravelSpend,
      totalTravelBudget,
      savedForTravel: toNumber(
        currentState.budgets?.savingsBalance,
        0
      )
    };

    currentState.budgets.totalSpent =
      totalTravelSpend;

    return currentState;
  };

  const readStoredState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);
    } catch (error) {
      console.error(
        "TIC Store: failed to read saved state.",
        error
      );

      return null;
    }
  };

  let state = calculateStatistics(
    normalizeState(
      readStoredState() ||
      getDefaultState()
    )
  );

  const notify = (event = {}) => {
    const snapshot = clone(state);

    listeners.forEach((listener) => {
      try {
        listener(snapshot, event);
      } catch (error) {
        console.error(
          "TIC Store subscriber error:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent("tic:store-change", {
        detail: {
          state: snapshot,
          event
        }
      })
    );
  };

  const persistImmediately = (
    event = { type: "persist" }
  ) => {
    try {
      window.clearTimeout(saveTimer);
      saveTimer = null;

      state.meta.updatedAt = nowISO();

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );

      notify(event);

      return true;
    } catch (error) {
      console.error(
        "TIC Store: failed to save state.",
        error
      );

      return false;
    }
  };

  const schedulePersist = (
    event = { type: "update" }
  ) => {
    window.clearTimeout(saveTimer);

    saveTimer = window.setTimeout(() => {
      persistImmediately(event);
    }, AUTO_SAVE_DELAY);
  };

  const replaceState = (
    nextState,
    event = { type: "replace" }
  ) => {
    state = calculateStatistics(
      normalizeState(nextState)
    );

    persistImmediately(event);

    return clone(state);
  };

  const setByPath = (
    target,
    path,
    value
  ) => {
    const parts = Array.isArray(path)
      ? path
      : String(path)
          .split(".")
          .map((part) => part.trim())
          .filter(Boolean);

    if (!parts.length) {
      return false;
    }

    let cursor = target;

    for (
      let index = 0;
      index < parts.length - 1;
      index += 1
    ) {
      const key = parts[index];

      if (
        !isObject(cursor[key]) &&
        !Array.isArray(cursor[key])
      ) {
        cursor[key] = {};
      }

      cursor = cursor[key];
    }

    cursor[parts[parts.length - 1]] =
      clone(value);

    return true;
  };

  const getByPath = (
    target,
    path,
    fallback = null
  ) => {
    const parts = Array.isArray(path)
      ? path
      : String(path)
          .split(".")
          .map((part) => part.trim())
          .filter(Boolean);

    if (!parts.length) {
      return clone(target);
    }

    let cursor = target;

    for (const key of parts) {
      if (
        cursor === null ||
        cursor === undefined ||
        !Object.prototype.hasOwnProperty.call(
          cursor,
          key
        )
      ) {
        return clone(fallback);
      }

      cursor = cursor[key];
    }

    return clone(cursor);
  };

  const findTripIndex = (tripId) =>
    state.trips.findIndex(
      (trip) =>
        String(trip.id) === String(tripId)
    );

  const Store = {
    version: "1.1.0",

    getState() {
      return clone(state);
    },

    get(path, fallback = null) {
      return getByPath(
        state,
        path,
        fallback
      );
    },

    set(path, value, options = {}) {
      if (
        !setByPath(
          state,
          path,
          value
        )
      ) {
        return false;
      }

      state = calculateStatistics(
        normalizeState(state)
      );

      if (options.immediate === true) {
        return persistImmediately({
          type: "set",
          path
        });
      }

      schedulePersist({
        type: "set",
        path
      });

      return true;
    },

    patch(path, partialValue, options = {}) {
      /*
       * Compatibility:
       * Store.patch({ trips: [...] })
       * Store.patch("profile", { ... })
       */
      if (
        isObject(path) &&
        partialValue === undefined
      ) {
        const nextState = deepMerge(
          state,
          path
        );

        state = calculateStatistics(
          normalizeState(nextState)
        );

        if (options.immediate === true) {
          return persistImmediately({
            type: "patch"
          });
        }

        schedulePersist({
          type: "patch"
        });

        return true;
      }

      const current = getByPath(
        state,
        path,
        {}
      );

      if (
        !isObject(current) ||
        !isObject(partialValue)
      ) {
        return this.set(
          path,
          partialValue,
          options
        );
      }

      return this.set(
        path,
        deepMerge(
          current,
          partialValue
        ),
        options
      );
    },

    update(mutator, options = {}) {
      if (
        typeof mutator !== "function"
      ) {
        throw new TypeError(
          "TIC Store update requires a function."
        );
      }

      const draft = clone(state);
      const result = mutator(draft);
      const nextState =
        result === undefined
          ? draft
          : result;

      state = calculateStatistics(
        normalizeState(nextState)
      );

      if (options.immediate === true) {
        persistImmediately({
          type: "update"
        });
      } else {
        schedulePersist({
          type: "update"
        });
      }

      return clone(state);
    },

    subscribe(listener) {
      if (
        typeof listener !== "function"
      ) {
        throw new TypeError(
          "TIC Store subscriber must be a function."
        );
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    save() {
      return persistImmediately({
        type: "manual-save"
      });
    },

    createTrip(tripData) {
      const trip = normalizeTrip(
        tripData
      );

      if (
        trip.title.length <
        Config.validation.trip.titleMinLength
      ) {
        throw new Error(
          "اسم الرحلة قصير جداً."
        );
      }

      if (
        trip.title.length >
        Config.validation.trip.titleMaxLength
      ) {
        throw new Error(
          "اسم الرحلة أطول من الحد المسموح."
        );
      }

      state.trips.unshift(trip);

      state = calculateStatistics(
        normalizeState(state)
      );

      persistImmediately({
        type: "trip-created",
        tripId: trip.id
      });

      return clone(
        state.trips.find(
          (item) => item.id === trip.id
        ) || trip
      );
    },

    addTrip(tripData) {
      return this.createTrip(tripData);
    },

    upsertTrip(tripData) {
      const tripId = tripData?.id;

      if (
        tripId &&
        findTripIndex(tripId) !== -1
      ) {
        return this.updateTrip(
          tripId,
          tripData
        );
      }

      return this.createTrip(
        tripData
      );
    },

    updateTrip(tripId, changes = {}) {
      const index = findTripIndex(
        tripId
      );

      if (index === -1) {
        return null;
      }

      const existing = clone(
        state.trips[index]
      );

      const updatedTrip = normalizeTrip({
        ...existing,
        ...clone(changes),
        id: existing.id,
        createdAt: existing.createdAt
      });

      state.trips[index] =
        updatedTrip;

      state = calculateStatistics(
        normalizeState(state)
      );

      persistImmediately({
        type: "trip-updated",
        tripId
      });

      return clone(
        state.trips.find(
          (item) =>
            String(item.id) ===
            String(tripId)
        ) || updatedTrip
      );
    },

    getTrip(tripId) {
      const trip = state.trips.find(
        (item) =>
          String(item.id) ===
          String(tripId)
      );

      return trip
        ? clone(trip)
        : null;
    },

    getTripById(tripId) {
      return this.getTrip(tripId);
    },

    deleteTrip(tripId) {
      const index = findTripIndex(
        tripId
      );

      if (index === -1) {
        return false;
      }

      state.trips.splice(index, 1);

      state.budgets.expenses =
        state.budgets.expenses.filter(
          (expense) =>
            String(expense.tripId) !==
            String(tripId)
        );

      state = calculateStatistics(
        normalizeState(state)
      );

      persistImmediately({
        type: "trip-deleted",
        tripId
      });

      return true;
    },

    archiveTrip(tripId) {
      return this.updateTrip(
        tripId,
        {
          status: "archived",
          archivedAt: nowISO()
        }
      );
    },

    restoreTrip(tripId) {
      return this.updateTrip(
        tripId,
        {
          status: "planning",
          archivedAt: null
        }
      );
    },

    addExpense(expenseData) {
      const expense = normalizeExpense(
        expenseData
      );

      if (!expense.title) {
        throw new Error(
          "اسم المصروف مطلوب."
        );
      }

      if (expense.amount <= 0) {
        throw new Error(
          "قيمة المصروف يجب أن تكون أكبر من صفر."
        );
      }

      state.budgets.expenses.unshift(
        expense
      );

      if (expense.tripId) {
        const tripIndex = findTripIndex(
          expense.tripId
        );

        if (tripIndex !== -1) {
          state.trips[tripIndex].spent =
            toNumber(
              state.trips[tripIndex].spent,
              0
            ) + expense.amount;

          state.trips[tripIndex].updatedAt =
            nowISO();
        }
      }

      state = calculateStatistics(
        normalizeState(state)
      );

      persistImmediately({
        type: "expense-created",
        expenseId: expense.id
      });

      return clone(expense);
    },

    updateExpense(
      expenseId,
      changes = {}
    ) {
      const index =
        state.budgets.expenses.findIndex(
          (expense) =>
            expense.id === expenseId
        );

      if (index === -1) {
        return null;
      }

      const oldExpense =
        state.budgets.expenses[index];

      const newExpense =
        normalizeExpense({
          ...oldExpense,
          ...clone(changes),
          id: expenseId,
          createdAt:
            oldExpense.createdAt
        });

      state.budgets.expenses[index] =
        newExpense;

      [
        oldExpense.tripId,
        newExpense.tripId
      ]
        .filter(Boolean)
        .forEach((tripId) => {
          const tripIndex =
            findTripIndex(tripId);

          if (tripIndex !== -1) {
            state.trips[tripIndex].spent =
              state.budgets.expenses
                .filter(
                  (expense) =>
                    expense.tripId ===
                    tripId
                )
                .reduce(
                  (total, expense) =>
                    total +
                    toNumber(
                      expense.amount,
                      0
                    ),
                  0
                );

            state.trips[
              tripIndex
            ].updatedAt = nowISO();
          }
        });

      state = calculateStatistics(
        normalizeState(state)
      );

      persistImmediately({
        type: "expense-updated",
        expenseId
      });

      return clone(newExpense);
    },

    deleteExpense(expenseId) {
      const expense =
        state.budgets.expenses.find(
          (item) =>
            item.id === expenseId
        );

      if (!expense) {
        return false;
      }

      state.budgets.expenses =
        state.budgets.expenses.filter(
          (item) =>
            item.id !== expenseId
        );

      if (expense.tripId) {
        const tripIndex =
          findTripIndex(
            expense.tripId
          );

        if (tripIndex !== -1) {
          state.trips[tripIndex].spent =
            state.budgets.expenses
              .filter(
                (item) =>
                  item.tripId ===
                  expense.tripId
              )
              .reduce(
                (total, item) =>
                  total +
                  toNumber(
                    item.amount,
                    0
                  ),
                0
              );

          state.trips[
            tripIndex
          ].updatedAt = nowISO();
        }
      }

      state = calculateStatistics(
        normalizeState(state)
      );

      persistImmediately({
        type: "expense-deleted",
        expenseId
      });

      return true;
    },

    createBackup() {
      const backups =
        this.getBackups();

      const backup = {
        id: createId("backup"),
        createdAt: nowISO(),
        schemaVersion: SCHEMA_VERSION,
        appVersion:
          Config.appVersion,
        state: clone(state)
      };

      backups.unshift(backup);

      const limitedBackups =
        backups.slice(
          0,
          MAX_BACKUPS
        );

      try {
        localStorage.setItem(
          BACKUP_KEY,
          JSON.stringify(
            limitedBackups
          )
        );

        state.meta.lastBackupAt =
          backup.createdAt;

        persistImmediately({
          type: "backup-created",
          backupId: backup.id
        });

        return clone(backup);
      } catch (error) {
        console.error(
          "TIC Store: failed to create backup.",
          error
        );

        return null;
      }
    },

    getBackups() {
      try {
        const raw =
          localStorage.getItem(
            BACKUP_KEY
          );

        const backups = raw
          ? JSON.parse(raw)
          : [];

        return Array.isArray(backups)
          ? backups
          : [];
      } catch (error) {
        console.error(
          "TIC Store: failed to read backups.",
          error
        );

        return [];
      }
    },

    restoreBackup(backupId) {
      const backup =
        this.getBackups().find(
          (item) =>
            item.id === backupId
        );

      if (
        !backup ||
        !backup.state
      ) {
        return false;
      }

      replaceState(
        backup.state,
        {
          type: "backup-restored",
          backupId
        }
      );

      return true;
    },

    exportData() {
      return JSON.stringify(
        {
          exportedAt: nowISO(),
          appId: Config.id,
          appVersion:
            Config.appVersion,
          schemaVersion:
            SCHEMA_VERSION,
          state: clone(state)
        },
        null,
        2
      );
    },

    importData(payload) {
      let parsed = payload;

      if (
        typeof payload === "string"
      ) {
        parsed =
          JSON.parse(payload);
      }

      const importedState =
        parsed && parsed.state
          ? parsed.state
          : parsed;

      if (
        !isObject(importedState)
      ) {
        throw new Error(
          "ملف البيانات غير صالح."
        );
      }

      this.createBackup();

      replaceState(
        importedState,
        {
          type: "data-imported"
        }
      );

      return clone(state);
    },

    reset(options = {}) {
      if (
        options.createBackup !==
        false
      ) {
        this.createBackup();
      }

      state = calculateStatistics(
        normalizeState(
          getDefaultState()
        )
      );

      persistImmediately({
        type: "store-reset"
      });

      return clone(state);
    },

    diagnostics() {
      return {
        version: this.version,
        storageKey: STORAGE_KEY,
        backupKey: BACKUP_KEY,
        schemaVersion:
          SCHEMA_VERSION,
        subscriberCount:
          listeners.size,
        tripCount:
          state.trips.length,
        expenseCount:
          state.budgets.expenses.length,
        lastUpdatedAt:
          state.meta.updatedAt,
        lastBackupAt:
          state.meta.lastBackupAt,

        tripFieldsPreserved: [
          "departureDate",
          "departureTime",
          "arrivalDate",
          "arrivalTime",
          "airportLeadMinutes",
          "departureAirport",
          "arrivalAirport",
          "airline",
          "flightNumber",
          "terminal",
          "gate",
          "seatNumber",
          "bookingReference",
          "accommodation",
          "hotelBookingReference",
          "hotelCheckIn",
          "hotelCheckOut"
        ]
      };
    }
  };

  /*
   * Persist normalized legacy data immediately on startup.
   * This migrates existing trips to the V1.1.0 schema while preserving
   * previously stored fields.
   */
  persistImmediately({
    type: readStoredState()
      ? "store-migrated"
      : "store-initialized",
    version: Store.version
  });

  window.TIC =
    window.TIC || {};

  window.TIC.Store =
    Store;

  window.TICStore =
    Store;
})(window);
