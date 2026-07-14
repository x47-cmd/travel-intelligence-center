/* =========================================================
   Travel Intelligence Center
   Central Store V1.1.0

   File Path:
   js/store.js

   Purpose:
   - Single source of truth for all application data.
   - Handles localStorage persistence.
   - Preserves all rich trip fields, including flight times,
     hotel details, import metadata and advanced form data.
   - Provides read, write, update, delete, backup,
     restore, reset, import, export and subscriptions.

   Fixes in V1.1.0:
   - Prevents normalizeTrip from deleting advanced trip fields.
   - Preserves departure/arrival dates and times after saving.
   - Preserves airport, airline, terminal, gate, seat and PNR.
   - Preserves hotel details and smart-import metadata.
   - Adds getTripById, addTrip and upsertTrip compatibility APIs.
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
  const AUTO_SAVE_DELAY =
    Number(Config.storage.autoSaveDelay) || 120;
  const MAX_BACKUPS =
    Number(Config.storage.maxBackups) || 3;

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

  const nowISO = () =>
    new Date().toISOString();

  const createId = (prefix = "item") => {
    const random =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;

    return `${prefix}_${random}`;
  };

  const toNumber = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result)
      ? result
      : fallback;
  };

  const toText = (value, fallback = "") =>
    String(
      value === undefined ||
      value === null
        ? fallback
        : value
    ).trim();

  const toBoolean = (
    value,
    fallback = false
  ) => {
    if (
      value === true ||
      value === "true" ||
      value === 1 ||
      value === "1"
    ) {
      return true;
    }

    if (
      value === false ||
      value === "false" ||
      value === 0 ||
      value === "0"
    ) {
      return false;
    }

    return fallback;
  };

  const toArray = (value) =>
    Array.isArray(value)
      ? clone(value)
      : [];

  const normalizeDateValue = (value) => {
    const raw = toText(value);

    if (!raw) {
      return "";
    }

    const exactDate = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (exactDate) {
      return raw;
    }

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    return [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, "0"),
      String(
        date.getDate()
      ).padStart(2, "0")
    ].join("-");
  };

  const normalizeTimeValue = (value) => {
    const raw = toText(value);

    if (!raw) {
      return "";
    }

    const direct = raw.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

    if (direct) {
      const hours = Math.max(
        0,
        Math.min(
          23,
          toNumber(direct[1])
        )
      );

      const minutes = Math.max(
        0,
        Math.min(
          59,
          toNumber(direct[2])
        )
      );

      return `${String(hours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(
        2,
        "0"
      )}`;
    }

    const arabicPeriod = raw.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(ص|م)$/
    );

    if (arabicPeriod) {
      let hours =
        toNumber(arabicPeriod[1]) % 12;

      if (arabicPeriod[3] === "م") {
        hours += 12;
      }

      const minutes = Math.max(
        0,
        Math.min(
          59,
          toNumber(
            arabicPeriod[2],
            0
          )
        )
      );

      return `${String(hours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(
        2,
        "0"
      )}`;
    }

    const englishPeriod = raw.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i
    );

    if (englishPeriod) {
      let hours =
        toNumber(englishPeriod[1]) % 12;

      if (
        englishPeriod[3].toUpperCase() ===
        "PM"
      ) {
        hours += 12;
      }

      const minutes = Math.max(
        0,
        Math.min(
          59,
          toNumber(
            englishPeriod[2],
            0
          )
        )
      );

      return `${String(hours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(
        2,
        "0"
      )}`;
    }

    return raw;
  };

  const deepMerge = (
    target,
    source
  ) => {
    const output = isObject(target)
      ? clone(target)
      : {};

    if (!isObject(source)) {
      return output;
    }

    Object.keys(source).forEach(
      (key) => {
        const sourceValue =
          source[key];

        const targetValue =
          output[key];

        if (
          isObject(sourceValue) &&
          isObject(targetValue)
        ) {
          output[key] = deepMerge(
            targetValue,
            sourceValue
          );
        } else {
          output[key] =
            clone(sourceValue);
        }
      }
    );

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
      name:
        Config.defaults.profileName,
      country:
        Config.defaults.country,
      city:
        Config.defaults.city,
      language:
        Config.defaults.language,
      currency:
        Config.defaults.currency,
      travelStyle:
        "Premium Family",
      homeAirport:
        "Abu Dhabi",
      annualTravelBudget:
        30000,
      monthlyTravelSaving:
        1500,
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
      currency:
        Config.defaults.currency,
      language:
        Config.defaults.language,
      theme:
        Config.defaults.theme,
      dateFormat:
        Config.defaults.dateFormat,
      enableAnimations:
        Config.app.enableAnimations,
      enableNotifications:
        true,
      confirmBeforeDelete:
        true,
      autoBackup:
        true
    }
  });

  const resolveTripStatus = (
    status
  ) => {
    const raw =
      toText(status) ||
      toText(
        Config.defaults.tripStatus,
        "planning"
      );

    if (
      isObject(Config.tripStatuses) &&
      Object.prototype.hasOwnProperty.call(
        Config.tripStatuses,
        raw
      )
    ) {
      return raw;
    }

    const supportedStatuses = [
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

    if (
      supportedStatuses.includes(raw)
    ) {
      return raw;
    }

    return toText(
      Config.defaults.tripStatus,
      "planning"
    );
  };

  const normalizeTrip = (
    trip = {}
  ) => {
    const source = isObject(trip)
      ? clone(trip)
      : {};

    const maxTravelers =
      toNumber(
        Config.validation?.trip
          ?.maxTravelers,
        99
      );

    const maxBudget =
      toNumber(
        Config.validation?.trip
          ?.maxBudget,
        Number.MAX_SAFE_INTEGER
      );

    const notesMaxLength =
      toNumber(
        Config.validation?.trip
          ?.notesMaxLength,
        10000
      );

    const normalized = {
      ...source,

      id:
        source.id ||
        createId("trip"),

      title:
        toText(source.title),

      destination:
        toText(source.destination),

      country:
        toText(source.country),

      city:
        toText(source.city),

      purpose:
        toText(
          source.purpose,
          "leisure"
        ) || "leisure",

      tripType:
        toText(
          source.tripType,
          "family"
        ) || "family",

      travelStyle:
        toText(
          source.travelStyle,
          "premium-family"
        ) || "premium-family",

      priority:
        toText(
          source.priority,
          "normal"
        ) || "normal",

      status:
        resolveTripStatus(
          source.status
        ),

      startDate:
        normalizeDateValue(
          source.startDate
        ),

      endDate:
        normalizeDateValue(
          source.endDate
        ),

      durationDays:
        Math.max(
          0,
          toNumber(
            source.durationDays,
            0
          )
        ),

      travelers:
        Math.max(
          1,
          Math.min(
            maxTravelers,
            toNumber(
              source.travelers,
              Config.defaults
                .travelers || 1
            )
          )
        ),

      adults:
        Math.max(
          0,
          toNumber(
            source.adults,
            source.travelers || 1
          )
        ),

      children:
        Math.max(
          0,
          toNumber(
            source.children,
            0
          )
        ),

      infants:
        Math.max(
          0,
          toNumber(
            source.infants,
            0
          )
        ),

      budget:
        Math.max(
          0,
          Math.min(
            maxBudget,
            toNumber(
              source.budget,
              Config.defaults
                .budget || 0
            )
          )
        ),

      spent:
        Math.max(
          0,
          toNumber(
            source.spent,
            0
          )
        ),

      currency:
        toText(
          source.currency,
          Config.defaults.currency
        ) ||
        Config.defaults.currency,

      departureAirport:
        toText(
          source.departureAirport ||
          source.originAirport
        ),

      arrivalAirport:
        toText(
          source.arrivalAirport ||
          source.destinationAirport
        ),

      airline:
        toText(
          source.airline ||
          source.airlineName
        ),

      flightNumber:
        toText(
          source.flightNumber ||
          source.flightNo
        ),

      departureDate:
        normalizeDateValue(
          source.departureDate ||
          source.flightDate
        ),

      departureTime:
        normalizeTimeValue(
          source.departureTime ||
          source.flightTime ||
          source.flightDepartureTime
        ),

      arrivalDate:
        normalizeDateValue(
          source.arrivalDate
        ),

      arrivalTime:
        normalizeTimeValue(
          source.arrivalTime ||
          source.flightArrivalTime
        ),

      departureDateTime:
        toText(
          source.departureDateTime
        ),

      arrivalDateTime:
        toText(
          source.arrivalDateTime
        ),

      terminal:
        toText(
          source.terminal ||
          source.departureTerminal
        ),

      gate:
        toText(
          source.gate ||
          source.departureGate
        ),

      seatNumber:
        toText(
          source.seatNumber ||
          source.seat
        ),

      bookingReference:
        toText(
          source.bookingReference ||
          source.pnr ||
          source.confirmationNumber
        ),

      airportLeadMinutes:
        Math.max(
          0,
          toNumber(
            source.airportLeadMinutes ??
            source.arriveAirportBeforeMinutes,
            120
          )
        ),

      accommodation:
        typeof source.accommodation ===
        "string"
          ? source.accommodation.trim()
          : source.accommodation
            ? clone(
                source.accommodation
              )
            : "",

      accommodationAddress:
        toText(
          source.accommodationAddress ||
          source.hotelAddress
        ),

      hotelName:
        toText(
          source.hotelName ||
          source.accommodationName
        ),

      hotelBookingReference:
        toText(
          source.hotelBookingReference ||
          source.hotelConfirmationNumber
        ),

      hotelCheckIn:
        normalizeDateValue(
          source.hotelCheckIn ||
          source.checkIn
        ),

      hotelCheckOut:
        normalizeDateValue(
          source.hotelCheckOut ||
          source.checkOut
        ),

      transport:
        toText(
          source.transport
        ),

      activities:
        toArray(
          source.activities
        ),

      notes:
        toText(
          source.notes
        ).slice(
          0,
          notesMaxLength
        ),

      emergencyContact:
        toText(
          source.emergencyContact
        ),

      visaRequired:
        toBoolean(
          source.visaRequired,
          false
        ),

      insuranceRequired:
        toBoolean(
          source.insuranceRequired,
          true
        ),

      featured:
        toBoolean(
          source.featured,
          false
        ),

      ticketImport:
        source.ticketImport
          ? clone(
              source.ticketImport
            )
          : null,

      hotelImport:
        source.hotelImport
          ? clone(
              source.hotelImport
            )
          : null,

      flight:
        isObject(source.flight)
          ? clone(source.flight)
          : source.flight || null,

      outboundFlight:
        isObject(
          source.outboundFlight
        )
          ? clone(
              source.outboundFlight
            )
          : source.outboundFlight ||
            null,

      hotel:
        isObject(source.hotel)
          ? clone(source.hotel)
          : source.hotel || null,

      flights:
        toArray(
          source.flights
        ),

      bookings:
        toArray(
          source.bookings
        ),

      itinerary:
        toArray(
          source.itinerary
        ),

      expenses:
        toArray(
          source.expenses
        ),

      documents:
        toArray(
          source.documents
        ),

      packing:
        toArray(
          source.packing
        ),

      memories:
        toArray(
          source.memories
        ),

      coverImage:
        toText(
          source.coverImage
        ),

      archivedAt:
        source.archivedAt ||
        null,

      createdAt:
        source.createdAt ||
        nowISO(),

      updatedAt:
        nowISO()
    };

    return normalized;
  };

  const normalizeExpense = (
    expense = {}
  ) => ({
    ...clone(expense),

    id:
      expense.id ||
      createId("expense"),

    tripId:
      expense.tripId ||
      null,

    category:
      expense.category ||
      "other",

    title:
      toText(expense.title),

    amount:
      Math.max(
        0,
        toNumber(
          expense.amount,
          0
        )
      ),

    currency:
      expense.currency ||
      Config.defaults.currency,

    date:
      expense.date ||
      new Date()
        .toISOString()
        .slice(0, 10),

    notes:
      toText(expense.notes),

    createdAt:
      expense.createdAt ||
      nowISO(),

    updatedAt:
      nowISO()
  });

  const normalizeState = (
    input
  ) => {
    const defaults =
      getDefaultState();

    const merged =
      deepMerge(
        defaults,
        isObject(input)
          ? input
          : {}
      );

    merged.meta.appId =
      Config.id;

    merged.meta.appVersion =
      Config.appVersion;

    merged.meta.schemaVersion =
      SCHEMA_VERSION;

    merged.meta.updatedAt =
      nowISO();

    merged.trips =
      Array.isArray(
        merged.trips
      )
        ? merged.trips.map(
            normalizeTrip
          )
        : [];

    merged.budgets =
      isObject(merged.budgets)
        ? merged.budgets
        : clone(
            defaults.budgets
          );

    merged.budgets.expenses =
      Array.isArray(
        merged.budgets.expenses
      )
        ? merged.budgets.expenses.map(
            normalizeExpense
          )
        : [];

    [
      "destinations",
      "wishlist",
      "documents",
      "reviews",
      "memories",
      "notifications"
    ].forEach((key) => {
      if (
        !Array.isArray(
          merged[key]
        )
      ) {
        merged[key] = [];
      }
    });

    return merged;
  };

  const calculateStatistics = (
    currentState
  ) => {
    const trips =
      Array.isArray(
        currentState.trips
      )
        ? currentState.trips
        : [];

    const expenses =
      Array.isArray(
        currentState.budgets
          ?.expenses
      )
        ? currentState.budgets
            .expenses
        : [];

    const wishlist =
      Array.isArray(
        currentState.wishlist
      )
        ? currentState.wishlist
        : [];

    const visibleTrips =
      trips.filter(
        (trip) =>
          trip.status !==
          "archived"
      );

    const completedTrips =
      visibleTrips.filter(
        (trip) =>
          trip.status ===
          "completed"
      );

    const upcomingStatuses = [
      "draft",
      "planning",
      "planned",
      "booked",
      "confirmed",
      "ready"
    ];

    const activeStatuses = [
      "ongoing",
      "active"
    ];

    const countries =
      new Set(
        completedTrips
          .map((trip) =>
            toText(
              trip.country
            )
          )
          .filter(Boolean)
      );

    const cities =
      new Set(
        completedTrips
          .map((trip) =>
            toText(
              trip.city
            )
          )
          .filter(Boolean)
      );

    const totalTravelSpend =
      expenses.reduce(
        (total, expense) =>
          total +
          toNumber(
            expense.amount,
            0
          ),
        0
      );

    const totalTravelBudget =
      visibleTrips.reduce(
        (total, trip) =>
          total +
          toNumber(
            trip.budget,
            0
          ),
        0
      );

    currentState.statistics = {
      totalTrips:
        visibleTrips.length,

      completedTrips:
        completedTrips.length,

      upcomingTrips:
        visibleTrips.filter(
          (trip) =>
            upcomingStatuses.includes(
              trip.status
            )
        ).length,

      activeTrips:
        visibleTrips.filter(
          (trip) =>
            activeStatuses.includes(
              trip.status
            )
        ).length,

      visitedCountries:
        countries.size,

      visitedCities:
        cities.size,

      wishlistCount:
        wishlist.length,

      totalTravelSpend,

      totalTravelBudget,

      savedForTravel:
        toNumber(
          currentState.budgets
            ?.savingsBalance,
          0
        )
    };

    currentState.budgets.totalSpent =
      totalTravelSpend;

    return currentState;
  };

  const readStoredState = () => {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

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

  let state =
    calculateStatistics(
      normalizeState(
        readStoredState() ||
        getDefaultState()
      )
    );

  const notify = (
    event = {}
  ) => {
    const snapshot =
      clone(state);

    listeners.forEach(
      (listener) => {
        try {
          listener(
            snapshot,
            event
          );
        } catch (error) {
          console.error(
            "TIC Store subscriber error:",
            error
          );
        }
      }
    );

    window.dispatchEvent(
      new CustomEvent(
        "tic:store-change",
        {
          detail: {
            state:
              snapshot,
            event
          }
        }
      )
    );
  };

  const persistImmediately = (
    event = {
      type: "persist"
    }
  ) => {
    try {
      window.clearTimeout(
        saveTimer
      );

      saveTimer = null;

      state.meta.updatedAt =
        nowISO();

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
    event = {
      type: "update"
    }
  ) => {
    window.clearTimeout(
      saveTimer
    );

    saveTimer =
      window.setTimeout(
        () => {
          persistImmediately(
            event
          );
        },
        AUTO_SAVE_DELAY
      );
  };

  const replaceState = (
    nextState,
    event = {
      type: "replace"
    }
  ) => {
    state =
      calculateStatistics(
        normalizeState(
          nextState
        )
      );

    persistImmediately(
      event
    );

    return clone(state);
  };

  const setByPath = (
    target,
    path,
    value
  ) => {
    const parts =
      Array.isArray(path)
        ? path
        : String(path)
            .split(".")
            .map((part) =>
              part.trim()
            )
            .filter(Boolean);

    if (!parts.length) {
      return false;
    }

    let cursor = target;

    for (
      let index = 0;
      index <
      parts.length - 1;
      index += 1
    ) {
      const key =
        parts[index];

      if (
        !isObject(
          cursor[key]
        ) &&
        !Array.isArray(
          cursor[key]
        )
      ) {
        cursor[key] = {};
      }

      cursor =
        cursor[key];
    }

    cursor[
      parts[
        parts.length - 1
      ]
    ] = clone(value);

    return true;
  };

  const getByPath = (
    target,
    path,
    fallback = null
  ) => {
    const parts =
      Array.isArray(path)
        ? path
        : String(path)
            .split(".")
            .map((part) =>
              part.trim()
            )
            .filter(Boolean);

    if (!parts.length) {
      return clone(target);
    }

    let cursor = target;

    for (const key of parts) {
      if (
        cursor === null ||
        cursor === undefined ||
        !Object.prototype
          .hasOwnProperty.call(
            cursor,
            key
          )
      ) {
        return clone(
          fallback
        );
      }

      cursor =
        cursor[key];
    }

    return clone(cursor);
  };

  const findTripIndex = (
    tripId
  ) =>
    state.trips.findIndex(
      (trip) =>
        String(trip.id) ===
        String(tripId)
    );

  const Store = {
    version:
      "1.1.0",

    getState() {
      return clone(state);
    },

    get(
      path,
      fallback = null
    ) {
      return getByPath(
        state,
        path,
        fallback
      );
    },

    set(
      path,
      value,
      options = {}
    ) {
      if (
        !setByPath(
          state,
          path,
          value
        )
      ) {
        return false;
      }

      state =
        calculateStatistics(
          normalizeState(
            state
          )
        );

      if (
        options.immediate ===
        true
      ) {
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

    patch(
      path,
      partialValue,
      options = {}
    ) {
      if (
        isObject(path) &&
        partialValue ===
          undefined
      ) {
        return this.update(
          (draft) =>
            deepMerge(
              draft,
              path
            ),
          options
        );
      }

      const current =
        getByPath(
          state,
          path,
          {}
        );

      if (
        !isObject(current) ||
        !isObject(
          partialValue
        )
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

    update(
      mutator,
      options = {}
    ) {
      if (
        typeof mutator !==
        "function"
      ) {
        throw new TypeError(
          "TIC Store update requires a function."
        );
      }

      const draft =
        clone(state);

      const result =
        mutator(draft);

      const nextState =
        result === undefined
          ? draft
          : result;

      state =
        calculateStatistics(
          normalizeState(
            nextState
          )
        );

      if (
        options.immediate ===
        true
      ) {
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
        typeof listener !==
        "function"
      ) {
        throw new TypeError(
          "TIC Store subscriber must be a function."
        );
      }

      listeners.add(
        listener
      );

      return () => {
        listeners.delete(
          listener
        );
      };
    },

    save() {
      return persistImmediately({
        type: "manual-save"
      });
    },

    createTrip(tripData) {
      const trip =
        normalizeTrip(
          tripData
        );

      const titleMinLength =
        toNumber(
          Config.validation?.trip
            ?.titleMinLength,
          1
        );

      const titleMaxLength =
        toNumber(
          Config.validation?.trip
            ?.titleMaxLength,
          200
        );

      if (
        trip.title.length <
        titleMinLength
      ) {
        throw new Error(
          "اسم الرحلة قصير جداً."
        );
      }

      if (
        trip.title.length >
        titleMaxLength
      ) {
        throw new Error(
          "اسم الرحلة أطول من الحد المسموح."
        );
      }

      state.trips.unshift(
        trip
      );

      state =
        calculateStatistics(
          normalizeState(
            state
          )
        );

      const savedTrip =
        state.trips.find(
          (item) =>
            item.id ===
            trip.id
        ) || trip;

      persistImmediately({
        type: "trip-created",
        tripId:
          savedTrip.id
      });

      return clone(
        savedTrip
      );
    },

    addTrip(tripData) {
      return this.createTrip(
        tripData
      );
    },

    updateTrip(
      tripId,
      changes = {}
    ) {
      const index =
        findTripIndex(
          tripId
        );

      if (index === -1) {
        return null;
      }

      const current =
        state.trips[index];

      const updatedTrip =
        normalizeTrip({
          ...current,
          ...clone(changes),
          id:
            current.id,
          createdAt:
            current.createdAt
        });

      state.trips[index] =
        updatedTrip;

      state =
        calculateStatistics(
          normalizeState(
            state
          )
        );

      const savedTrip =
        state.trips.find(
          (item) =>
            String(item.id) ===
            String(tripId)
        ) ||
        updatedTrip;

      persistImmediately({
        type: "trip-updated",
        tripId
      });

      return clone(
        savedTrip
      );
    },

    upsertTrip(tripData) {
      const tripId =
        tripData?.id;

      if (
        tripId &&
        findTripIndex(
          tripId
        ) !== -1
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

    getTrip(tripId) {
      const trip =
        state.trips.find(
          (item) =>
            String(item.id) ===
            String(tripId)
        );

      return trip
        ? clone(trip)
        : null;
    },

    getTripById(tripId) {
      return this.getTrip(
        tripId
      );
    },

    deleteTrip(tripId) {
      const index =
        findTripIndex(
          tripId
        );

      if (index === -1) {
        return false;
      }

      state.trips.splice(
        index,
        1
      );

      state.budgets.expenses =
        state.budgets.expenses.filter(
          (expense) =>
            String(
              expense.tripId
            ) !==
            String(tripId)
        );

      state =
        calculateStatistics(
          normalizeState(
            state
          )
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
          status:
            "archived",
          archivedAt:
            nowISO()
        }
      );
    },

    restoreTrip(tripId) {
      return this.updateTrip(
        tripId,
        {
          status:
            "planning",
          archivedAt:
            null
        }
      );
    },

    addExpense(
      expenseData
    ) {
      const expense =
        normalizeExpense(
          expenseData
        );

      if (!expense.title) {
        throw new Error(
          "اسم المصروف مطلوب."
        );
      }

      if (
        expense.amount <= 0
      ) {
        throw new Error(
          "قيمة المصروف يجب أن تكون أكبر من صفر."
        );
      }

      state.budgets.expenses.unshift(
        expense
      );

      if (
        expense.tripId
      ) {
        const tripIndex =
          findTripIndex(
            expense.tripId
          );

        if (
          tripIndex !== -1
        ) {
          state.trips[
            tripIndex
          ].spent =
            toNumber(
              state.trips[
                tripIndex
              ].spent,
              0
            ) +
            expense.amount;

          state.trips[
            tripIndex
          ].updatedAt =
            nowISO();
        }
      }

      state =
        calculateStatistics(
          normalizeState(
            state
          )
        );

      persistImmediately({
        type:
          "expense-created",
        expenseId:
          expense.id
      });

      return clone(
        expense
      );
    },

    updateExpense(
      expenseId,
      changes = {}
    ) {
      const index =
        state.budgets.expenses.findIndex(
          (expense) =>
            String(
              expense.id
            ) ===
            String(
              expenseId
            )
        );

      if (index === -1) {
        return null;
      }

      const oldExpense =
        state.budgets.expenses[
          index
        ];

      const newExpense =
        normalizeExpense({
          ...oldExpense,
          ...clone(changes),
          id:
            expenseId,
          createdAt:
            oldExpense.createdAt
        });

      state.budgets.expenses[
        index
      ] = newExpense;

      [
        oldExpense.tripId,
        newExpense.tripId
      ]
        .filter(Boolean)
        .forEach(
          (tripId) => {
            const tripIndex =
              findTripIndex(
                tripId
              );

            if (
              tripIndex !== -1
            ) {
              state.trips[
                tripIndex
              ].spent =
                state.budgets.expenses
                  .filter(
                    (expense) =>
                      String(
                        expense.tripId
                      ) ===
                      String(
                        tripId
                      )
                  )
                  .reduce(
                    (
                      total,
                      expense
                    ) =>
                      total +
                      toNumber(
                        expense.amount,
                        0
                      ),
                    0
                  );

              state.trips[
                tripIndex
              ].updatedAt =
                nowISO();
            }
          }
        );

      state =
        calculateStatistics(
          normalizeState(
            state
          )
        );

      persistImmediately({
        type:
          "expense-updated",
        expenseId
      });

      return clone(
        newExpense
      );
    },

    deleteExpense(
      expenseId
    ) {
      const expense =
        state.budgets.expenses.find(
          (item) =>
            String(item.id) ===
            String(expenseId)
        );

      if (!expense) {
        return false;
      }

      state.budgets.expenses =
        state.budgets.expenses.filter(
          (item) =>
            String(item.id) !==
            String(expenseId)
        );

      if (
        expense.tripId
      ) {
        const tripIndex =
          findTripIndex(
            expense.tripId
          );

        if (
          tripIndex !== -1
        ) {
          state.trips[
            tripIndex
          ].spent =
            state.budgets.expenses
              .filter(
                (item) =>
                  String(
                    item.tripId
                  ) ===
                  String(
                    expense.tripId
                  )
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  toNumber(
                    item.amount,
                    0
                  ),
                0
              );

          state.trips[
            tripIndex
          ].updatedAt =
            nowISO();
        }
      }

      state =
        calculateStatistics(
          normalizeState(
            state
          )
        );

      persistImmediately({
        type:
          "expense-deleted",
        expenseId
      });

      return true;
    },

    createBackup() {
      const backups =
        this.getBackups();

      const backup = {
        id:
          createId("backup"),
        createdAt:
          nowISO(),
        schemaVersion:
          SCHEMA_VERSION,
        appVersion:
          Config.appVersion,
        state:
          clone(state)
      };

      backups.unshift(
        backup
      );

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
          type:
            "backup-created",
          backupId:
            backup.id
        });

        return clone(
          backup
        );
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

        const backups =
          raw
            ? JSON.parse(raw)
            : [];

        return Array.isArray(
          backups
        )
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

    restoreBackup(
      backupId
    ) {
      const backup =
        this.getBackups().find(
          (item) =>
            item.id ===
            backupId
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
          type:
            "backup-restored",
          backupId
        }
      );

      return true;
    },

    exportData() {
      return JSON.stringify(
        {
          exportedAt:
            nowISO(),
          appId:
            Config.id,
          appVersion:
            Config.appVersion,
          schemaVersion:
            SCHEMA_VERSION,
          state:
            clone(state)
        },
        null,
        2
      );
    },

    importData(payload) {
      let parsed =
        payload;

      if (
        typeof payload ===
        "string"
      ) {
        parsed =
          JSON.parse(
            payload
          );
      }

      const importedState =
        parsed &&
        parsed.state
          ? parsed.state
          : parsed;

      if (
        !isObject(
          importedState
        )
      ) {
        throw new Error(
          "ملف البيانات غير صالح."
        );
      }

      this.createBackup();

      replaceState(
        importedState,
        {
          type:
            "data-imported"
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

      state =
        calculateStatistics(
          normalizeState(
            getDefaultState()
          )
        );

      persistImmediately({
        type:
          "store-reset"
      });

      return clone(state);
    },

    diagnostics() {
      return {
        version:
          this.version,
        storageKey:
          STORAGE_KEY,
        backupKey:
          BACKUP_KEY,
        schemaVersion:
          SCHEMA_VERSION,
        subscriberCount:
          listeners.size,
        tripCount:
          state.trips.length,
        expenseCount:
          state.budgets
            .expenses.length,
        lastUpdatedAt:
          state.meta.updatedAt,
        lastBackupAt:
          state.meta
            .lastBackupAt
      };
    }
  };

  if (
    !readStoredState()
  ) {
    persistImmediately({
      type:
        "store-initialized"
    });
  } else {
    persistImmediately({
      type:
        "store-migrated-v1.1.0"
    });
  }

  window.TIC =
    window.TIC || {};

  window.TIC.Store =
    Store;

  window.TICStore =
    Store;
})(window);
