/* =========================================================
   Travel Intelligence Center
   Central Store V2.4.0
   Simple Travel Budget Wallet Ready

   File Path:
   js/store.js

   Purpose:
   - Single source of truth for the entire application.
   - Preserves Trips, Planned Trips, Guide, Passport, Wishlist,
     Annual Planner and legacy Budget data.
   - Adds the new simple Budget Wallet used by:
       js/pages/budget.js V4.0.0
       css/pages/budget.css V4.0.0
   - Supports deposits, withdrawals, travel expenses,
     transaction history and automatic balance calculation.
   - Preserves localStorage, migration, backup, restore,
     import, export, subscriptions and legacy Store aliases.

   Global APIs:
   - window.TIC.Store
   - window.TICStore
   - window.Store
   - window.TravelStore
========================================================= */

(function centralStoreFactory(window) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config;

  if (!Config) {
    throw new Error(
      "TIC Store Error: configuration was not found. Load js/config.js before js/store.js."
    );
  }

  const STORE_VERSION = "2.4.0";
  const STORAGE_KEY = Config.storage.stateKey;
  const BACKUP_KEY = Config.storage.backupKey;
  const SCHEMA_VERSION = Config.storage.schemaVersion;
  const AUTO_SAVE_DELAY = Number(Config.storage.autoSaveDelay) || 120;
  const MAX_BACKUPS = Number(Config.storage.maxBackups) || 3;

  const UPCOMING_STATUSES = [
    "draft",
    "planning",
    "planned",
    "booked",
    "confirmed",
    "ready"
  ];

  const ACTIVE_STATUSES = ["ongoing", "active"];
  const LOCKED_STATUSES = ["cancelled", "archived"];

  const PLAN_STATUSES = [
    "idea",
    "considering",
    "shortlisted",
    "planned",
    "ready",
    "converted",
    "cancelled"
  ];

  const REQUIRED_PLANNED_ITEMS = [
    "destinationApproved",
    "budgetApproved",
    "flightBooked",
    "hotelBooked"
  ];

  const OPTIONAL_PLANNED_ITEMS = [
    "insuranceReady",
    "visaReady",
    "documentsReady",
    "activitiesPlanned",
    "packingReady"
  ];

  const BUDGET_TRANSACTION_TYPES = [
    "deposit",
    "withdrawal",
    "expense"
  ];

  const listeners = new Set();

  let saveTimer = null;
  let transactionDepth = 0;
  let pendingTransactionEvent = null;

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
      } catch (_) {}
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  };

  const nowISO = () => new Date().toISOString();

  const todayISO = () => nowISO().slice(0, 10);

  const createId = (prefix = "item") => {
    const random =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    return `${prefix}_${random}`;
  };

  const toNumber = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const toNonNegative = (value, fallback = 0) =>
    Math.max(0, toNumber(value, fallback));

  const toText = (value, fallback = "") =>
    String(
      value === undefined || value === null
        ? fallback
        : value
    ).trim();

  const toBoolean = (value, fallback = false) => {
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
    Array.isArray(value) ? clone(value) : [];

  const firstDefined = (...values) =>
    values.find(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== ""
    );

  const normalizeCountryCode = (value) => {
    const code = toText(value).toUpperCase();
    return code.length >= 2 && code.length <= 3
      ? code
      : "";
  };

  const normalizeDateValue = (value) => {
    const raw = toText(value);
    if (!raw) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return raw;
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  };

  const normalizeTimeValue = (value) => {
    const raw = toText(value);
    if (!raw) return "";

    const direct = raw.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

    if (!direct) return raw;

    const hours = Math.max(
      0,
      Math.min(23, toNumber(direct[1]))
    );

    const minutes = Math.max(
      0,
      Math.min(59, toNumber(direct[2]))
    );

    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}`;
  };

  const dateToUtcNumber = (value) => {
    const normalized = normalizeDateValue(value);
    const match = normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return null;

    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  };

  const calculateDurationDays = (
    startDate,
    endDate,
    fallback = 0
  ) => {
    const start = dateToUtcNumber(startDate);
    const end = dateToUtcNumber(endDate);

    if (
      start === null ||
      end === null ||
      end < start
    ) {
      return Math.max(0, toNumber(fallback, 0));
    }

    return Math.floor((end - start) / 86400000) + 1;
  };

  const deriveEndDateFromDuration = (
    startDate,
    durationDays
  ) => {
    const start = dateToUtcNumber(startDate);
    const duration = Math.max(
      0,
      Math.floor(toNumber(durationDays, 0))
    );

    if (start === null || duration <= 0) {
      return "";
    }

    const date = new Date(
      start + (duration - 1) * 86400000
    );

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  };

  const deepMerge = (target, source) => {
    const output = isObject(target)
      ? clone(target)
      : {};

    if (!isObject(source)) return output;

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (
        isObject(sourceValue) &&
        isObject(targetValue)
      ) {
        output[key] = deepMerge(
          targetValue,
          sourceValue
        );
      } else {
        output[key] = clone(sourceValue);
      }
    });

    return output;
  };

  const uniqueById = (items) => {
    const map = new Map();

    toArray(items).forEach((item) => {
      if (!item) return;

      const id = String(
        firstDefined(
          item.id,
          item._id,
          createId("item")
        )
      );

      map.set(id, {
        ...clone(item),
        id
      });
    });

    return Array.from(map.values());
  };

  /* =========================================================
     Default state
  ========================================================= */

  const getDefaultState = () => ({
    meta: {
      appId: Config.id,
      appVersion: Config.appVersion,
      storeVersion: STORE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lastBackupAt: null,
      lastMigrationAt: null,
      lastTripLifecycleSyncAt: null,
      lastGuideSyncAt: null,
      lastBudgetTravelSyncAt: null,
      lastBudgetWalletSyncAt: null
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

      /*
       * Legacy planning values are preserved for compatibility.
       * They are not treated as the new available travel balance.
       */
      annualTravelBudget: 30000,
      monthlyTravelSaving: 1500,
      monthlySaving: 1500,

      familyTravel: true,
      halalPreference: true,
      shattafRequired: true,
      quietPreference: true,
      preferredTripDays: 7,
      preferredClimate: "mild",
      avatar: "",
      createdAt: nowISO(),
      updatedAt: nowISO()
    },

    statistics: {
      totalTrips: 0,
      completedTrips: 0,
      upcomingTrips: 0,
      activeTrips: 0,
      plannedTrips: 0,
      readyPlannedTrips: 0,
      convertedPlannedTrips: 0,
      visitedCountries: 0,
      visitedCities: 0,
      wishlistCount: 0,
      annualPlanCount: 0,
      readyAnnualPlans: 0,
      totalTravelSpend: 0,
      totalTravelBudget: 0,
      savedForTravel: 0,
      expenseCount: 0,
      paymentCount: 0,
      overduePayments: 0,
      activeBudgetAlerts: 0,
      unreadBudgetNotifications: 0,
      budgetTravelRecommendationCount: 0,

      budgetWalletBalance: 0,
      budgetWalletDeposits: 0,
      budgetWalletWithdrawals: 0,
      budgetWalletExpenses: 0,
      budgetWalletTransactionCount: 0
    },

    trips: [],
    plannedTrips: [],
    destinations: [],
    wishlist: [],
    annualPlans: [],

    passport: {
      countries: [],
      visitedCountries: [],
      history: [],
      stamps: [],
      updatedAt: nowISO()
    },

    guideIntelligence: {
      selectedCountryCode: null,
      travelDNA: {},
      recommendations: [],
      recentSearches: [],
      countryViews: {},
      lastGeneratedAt: null,
      updatedAt: nowISO()
    },

    /*
     * New simple travel wallet.
     * This starts from zero and is completely separate from
     * the old annualTravelBudget value of 30,000.
     */
    budgetWallet: {
      version: STORE_VERSION,
      currency: Config.defaults.currency,
      openingBalance: 0,
      balance: 0,
      transactions: [],
      createdAt: nowISO(),
      updatedAt: nowISO()
    },

    budgetTravelIntelligence: {
      currentAnalysis: null,
      recommendations: [],
      timeline: [],
      multiTripPlan: null,
      history: [],
      dismissedRecommendationIds: [],
      acceptedRecommendationIds: [],
      lastGeneratedAt: null,
      updatedAt: nowISO()
    },

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
      expenses: [],
      updatedAt: nowISO()
    },

    expenses: [],

    savings: {
      monthlySaving: 1500,
      monthlySavingTarget: 1500,
      balance: 0,
      currentBalance: 0,
      targetAmount: 30000,
      goals: [],
      contributions: [],
      entries: [],
      transactions: [],
      updatedAt: nowISO()
    },

    payments: [],

    budgetAlerts: {
      items: [],
      rules: {},
      updatedAt: nowISO()
    },

    budgetRecommendations: {
      items: [],
      dismissed: [],
      updatedAt: nowISO()
    },

    budgetNotifications: {
      items: [],
      preferences: {},
      updatedAt: nowISO()
    },

    budgetIntelligence: {
      analytics: {},
      forecast: {},
      health: {},
      integration: {},
      lastSyncAt: null,
      updatedAt: nowISO()
    },

    finance: {
      expenses: [],
      savings: {},
      payments: [],
      alerts: {},
      recommendations: {},
      notifications: {},
      updatedAt: nowISO()
    },

    documents: [],

    packing: {
      templates: [],
      lists: []
    },

    reviews: [],
    memories: [],
    analytics: {},
    notifications: [],

    settings: {
      currency: Config.defaults.currency,
      language: Config.defaults.language,
      theme: Config.defaults.theme,
      dateFormat: Config.defaults.dateFormat,
      annualTravelBudget: 30000,
      monthlySaving: 1500,
      enableAnimations: Config.app.enableAnimations,
      enableNotifications: true,
      confirmBeforeDelete: true,
      autoBackup: true
    }
  });

  /* =========================================================
     Normalizers
  ========================================================= */

  const resolveTripStatus = (status) => {
    const raw =
      toText(status) ||
      toText(
        Config.defaults.tripStatus,
        "planning"
      );

    const supported = [
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

    return supported.includes(raw)
      ? raw
      : "planning";
  };

  const resolveLifecycleStatus = ({
    status,
    startDate,
    endDate,
    durationDays
  }) => {
    const currentStatus =
      resolveTripStatus(status);

    if (
      LOCKED_STATUSES.includes(
        currentStatus
      )
    ) {
      return currentStatus;
    }

    const start =
      dateToUtcNumber(startDate);

    const end =
      dateToUtcNumber(
        endDate ||
          deriveEndDateFromDuration(
            startDate,
            durationDays
          )
      );

    const today =
      dateToUtcNumber(
        normalizeDateValue(
          new Date()
        )
      );

    if (
      start === null &&
      end === null
    ) {
      return currentStatus;
    }

    if (
      end !== null &&
      today > end
    ) {
      return "completed";
    }

    if (
      start !== null &&
      today < start
    ) {
      return UPCOMING_STATUSES.includes(
        currentStatus
      )
        ? currentStatus
        : "planning";
    }

    if (
      start !== null &&
      today >= start &&
      (
        end === null ||
        today <= end
      )
    ) {
      return "active";
    }

    return currentStatus;
  };

  const normalizeTripChecklist = (
    checklist = {}
  ) => ({
    destinationApproved:
      toBoolean(
        checklist.destinationApproved,
        true
      ),
    budgetApproved:
      toBoolean(
        checklist.budgetApproved,
        false
      ),
    flightBooked:
      toBoolean(
        checklist.flightBooked,
        false
      ),
    hotelBooked:
      toBoolean(
        checklist.hotelBooked,
        false
      ),
    documentsReady:
      toBoolean(
        checklist.documentsReady,
        false
      ),
    insuranceReady:
      toBoolean(
        checklist.insuranceReady,
        false
      ),
    visaReady:
      toBoolean(
        checklist.visaReady,
        false
      ),
    transportPlanned:
      toBoolean(
        checklist.transportPlanned,
        false
      ),
    itineraryReady:
      toBoolean(
        checklist.itineraryReady,
        false
      ),
    activitiesPlanned:
      toBoolean(
        checklist.activitiesPlanned,
        false
      ),
    packingReady:
      toBoolean(
        checklist.packingReady,
        false
      )
  });

  const normalizeTrip = (trip = {}) => {
    const source = isObject(trip)
      ? clone(trip)
      : {};

    const startDate =
      normalizeDateValue(
        source.startDate
      );

    const sourceDuration =
      Math.max(
        0,
        toNumber(
          firstDefined(
            source.durationDays,
            source.days
          ),
          0
        )
      );

    const endDate =
      normalizeDateValue(
        source.endDate
      ) ||
      deriveEndDateFromDuration(
        startDate,
        sourceDuration
      );

    const durationDays =
      calculateDurationDays(
        startDate,
        endDate,
        sourceDuration
      );

    const status =
      resolveLifecycleStatus({
        status: source.status,
        startDate,
        endDate,
        durationDays
      });

    return {
      ...source,
      id:
        source.id ||
        createId("trip"),
      title:
        toText(source.title),
      destination:
        toText(
          firstDefined(
            source.destination,
            source.destinationCountry
          )
        ),
      country:
        toText(
          firstDefined(
            source.country,
            source.destinationCountry
          )
        ),
      countryCode:
        normalizeCountryCode(
          firstDefined(
            source.countryCode,
            source.destinationCountryCode,
            source.guideCountryCode
          )
        ),
      city:
        toText(
          firstDefined(
            source.city,
            source.destinationCity
          )
        ),
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
      status,
      planningStatus:
        status === "completed"
          ? "completed"
          : status === "active"
            ? "active"
            : status === "ready"
              ? "ready"
              : toText(
                  source.planningStatus,
                  "planned"
                ),
      lifecycleStatus: status,
      completedAt:
        status === "completed"
          ? source.completedAt ||
            nowISO()
          : source.completedAt ||
            null,
      startDate,
      endDate,
      durationDays,
      days: durationDays,
      travelers:
        Math.max(
          1,
          toNumber(
            source.travelers,
            1
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
        toNonNegative(
          firstDefined(
            source.budget,
            source.estimatedBudget,
            0
          )
        ),
      estimatedBudget:
        toNonNegative(
          firstDefined(
            source.estimatedBudget,
            source.budget,
            0
          )
        ),
      spent:
        toNonNegative(
          source.spent,
          0
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
          source.flightTime
        ),
      arrivalDate:
        normalizeDateValue(
          source.arrivalDate
        ),
      arrivalTime:
        normalizeTimeValue(
          source.arrivalTime
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
            source.airportLeadMinutes,
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
      activities:
        toArray(source.activities),
      notes:
        toText(source.notes),
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
      annualPlanId:
        source.annualPlanId ||
        null,
      plannedTripId:
        source.plannedTripId ||
        null,
      sourceRecommendationId:
        source.sourceRecommendationId ||
        null,
      source:
        toText(
          source.source,
          "manual"
        ) || "manual",
      checklist:
        normalizeTripChecklist(
          source.checklist
        ),
      costBreakdown:
        isObject(
          source.costBreakdown
        )
          ? clone(
              source.costBreakdown
            )
          : {},
      flights:
        toArray(source.flights),
      bookings:
        toArray(source.bookings),
      itinerary:
        toArray(source.itinerary),
      expenses:
        toArray(source.expenses),
      documents:
        toArray(source.documents),
      packing:
        toArray(source.packing),
      memories:
        toArray(source.memories),
      coverImage:
        toText(
          source.coverImage
        ),
      archivedAt:
        source.archivedAt ||
        null,
      convertedAt:
        source.convertedAt ||
        null,
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const normalizePlannedChecklist = (
    checklist = {},
    estimatedBudget = 0
  ) => ({
    destinationApproved:
      toBoolean(
        checklist.destinationApproved,
        true
      ),
    budgetApproved:
      toBoolean(
        checklist.budgetApproved,
        toNonNegative(
          estimatedBudget
        ) > 0
      ),
    flightBooked:
      toBoolean(
        checklist.flightBooked,
        false
      ),
    hotelBooked:
      toBoolean(
        checklist.hotelBooked,
        false
      ),
    insuranceReady:
      toBoolean(
        checklist.insuranceReady,
        false
      ),
    visaReady:
      toBoolean(
        checklist.visaReady,
        false
      ),
    documentsReady:
      toBoolean(
        checklist.documentsReady,
        false
      ),
    activitiesPlanned:
      toBoolean(
        checklist.activitiesPlanned,
        false
      ),
    packingReady:
      toBoolean(
        checklist.packingReady,
        false
      )
  });

  const calculatePlannedReadiness = (
    trip = {}
  ) => {
    const checklist =
      normalizePlannedChecklist(
        trip.checklist,
        trip.estimatedBudget
      );

    const requiredCompleted =
      REQUIRED_PLANNED_ITEMS.filter(
        (item) =>
          checklist[item] === true
      ).length;

    const optionalCompleted =
      OPTIONAL_PLANNED_ITEMS.filter(
        (item) =>
          checklist[item] === true
      ).length;

    return {
      percentage:
        Math.round(
          (
            requiredCompleted /
            REQUIRED_PLANNED_ITEMS.length
          ) * 80 +
          (
            optionalCompleted /
            OPTIONAL_PLANNED_ITEMS.length
          ) * 20
        ),
      requiredCompleted,
      requiredTotal:
        REQUIRED_PLANNED_ITEMS.length,
      optionalCompleted,
      optionalTotal:
        OPTIONAL_PLANNED_ITEMS.length,
      readyForConversion:
        REQUIRED_PLANNED_ITEMS.every(
          (item) =>
            checklist[item] === true
        ),
      missingRequiredItems:
        REQUIRED_PLANNED_ITEMS.filter(
          (item) =>
            checklist[item] !== true
        )
    };
  };

  const normalizePlannedTrip = (
    trip = {}
  ) => {
    const source = isObject(trip)
      ? clone(trip)
      : {};

    const estimatedBudget =
      toNonNegative(
        firstDefined(
          source.estimatedBudget,
          source.budget,
          0
        )
      );

    const checklist =
      normalizePlannedChecklist(
        source.checklist,
        estimatedBudget
      );

    const readiness =
      calculatePlannedReadiness({
        ...source,
        estimatedBudget,
        checklist
      });

    let status =
      toText(
        source.status,
        "planned"
      );

    if (
      ![
        "converted",
        "archived",
        "cancelled"
      ].includes(status)
    ) {
      status =
        readiness.readyForConversion
          ? "ready"
          : "planned";
    }

    return {
      ...source,
      id:
        source.id ||
        createId(
          "planned_trip"
        ),
      type: "planned",
      status,
      title:
        toText(
          source.title
        ) ||
        [
          source.city,
          source.country
        ]
          .filter(Boolean)
          .join("، ") ||
        "رحلة مخطط لها",
      destinationId:
        toText(
          source.destinationId
        ),
      country:
        toText(source.country),
      countryCode:
        normalizeCountryCode(
          source.countryCode
        ),
      city:
        toText(source.city),
      startDate:
        normalizeDateValue(
          source.startDate
        ),
      endDate:
        normalizeDateValue(
          source.endDate
        ),
      suggestedMonth:
        source.suggestedMonth !== undefined &&
        source.suggestedMonth !== null &&
        source.suggestedMonth !== ""
          ? Math.max(
              1,
              Math.min(
                12,
                toNumber(
                  source.suggestedMonth,
                  1
                )
              )
            )
          : null,
      durationDays:
        Math.max(
          1,
          toNumber(
            source.durationDays,
            5
          )
        ),
      travelers:
        Math.max(
          1,
          toNumber(
            source.travelers,
            1
          )
        ),
      estimatedBudget,
      currency:
        toText(
          source.currency,
          Config.defaults.currency
        ) ||
        Config.defaults.currency,
      sourceRecommendationId:
        source.sourceRecommendationId ||
        null,
      sourceAnalysisId:
        source.sourceAnalysisId ||
        null,
      source:
        isObject(source.source)
          ? clone(source.source)
          : {
              engine:
                toText(
                  source.source,
                  "manual"
                ) ||
                "manual"
            },
      costBreakdown:
        isObject(
          source.costBreakdown
        )
          ? clone(
              source.costBreakdown
            )
          : {},
      highlights:
        toArray(
          source.highlights
        ),
      checklist,
      readiness,
      notes:
        toText(source.notes),
      booking:
        isObject(
          source.booking
        )
          ? clone(source.booking)
          : {
              flightReference: "",
              hotelReference: ""
            },
      convertedTripId:
        source.convertedTripId ||
        null,
      convertedAt:
        source.convertedAt ||
        null,
      archived:
        status === "archived" ||
        toBoolean(
          source.archived,
          false
        ),
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const normalizeWishlistItem = (
    item = {}
  ) => {
    const source = isObject(item)
      ? clone(item)
      : {
          countryCode: item
        };

    return {
      ...source,
      id:
        source.id ||
        createId("wishlist"),
      countryCode:
        normalizeCountryCode(
          firstDefined(
            source.countryCode,
            source.code,
            source.iso2
          )
        ),
      countryName:
        toText(
          source.countryName
        ),
      source:
        toText(
          source.source,
          "guide"
        ) || "guide",
      priority:
        Math.max(
          1,
          Math.min(
            5,
            toNumber(
              source.priority,
              3
            )
          )
        ),
      preferredMonth:
        source.preferredMonth
          ? Math.max(
              1,
              Math.min(
                12,
                toNumber(
                  source.preferredMonth,
                  1
                )
              )
            )
          : null,
      preferredYear:
        toNumber(
          source.preferredYear,
          0
        ) || null,
      notes:
        toText(source.notes),
      metadata:
        isObject(
          source.metadata
        )
          ? clone(
              source.metadata
            )
          : {},
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const normalizeAnnualPlan = (
    plan = {}
  ) => {
    const source = isObject(plan)
      ? clone(plan)
      : {};

    return {
      ...source,
      id:
        source.id ||
        createId(
          "annual_plan"
        ),
      countryCode:
        normalizeCountryCode(
          source.countryCode
        ),
      countryName:
        toText(
          source.countryName ||
          source.country
        ),
      year:
        Math.max(
          new Date().getFullYear(),
          toNumber(
            source.year,
            new Date().getFullYear()
          )
        ),
      month:
        source.month
          ? Math.max(
              1,
              Math.min(
                12,
                toNumber(
                  source.month,
                  1
                )
              )
            )
          : null,
      days:
        Math.max(
          1,
          toNumber(
            source.days,
            7
          )
        ),
      travelers:
        Math.max(
          1,
          toNumber(
            source.travelers,
            1
          )
        ),
      budgetAED:
        toNonNegative(
          firstDefined(
            source.budgetAED,
            source.budget,
            0
          )
        ),
      status:
        PLAN_STATUSES.includes(
          toText(
            source.status
          )
        )
          ? toText(
              source.status
            )
          : "idea",
      source:
        toText(
          source.source,
          "guide"
        ) || "guide",
      convertedTripId:
        source.convertedTripId ||
        source.tripId ||
        null,
      checklist: {
        destinationSelected:
          source.checklist
            ?.destinationSelected !==
          false,
        budgetReviewed:
          toBoolean(
            source.checklist
              ?.budgetReviewed,
            false
          ),
        datesSelected:
          toBoolean(
            source.checklist
              ?.datesSelected,
            false
          ),
        flightBooked:
          toBoolean(
            source.checklist
              ?.flightBooked,
            false
          ),
        hotelBooked:
          toBoolean(
            source.checklist
              ?.hotelBooked,
            false
          ),
        documentsReady:
          toBoolean(
            source.checklist
              ?.documentsReady,
            false
          )
      },
      tags:
        toArray(source.tags),
      notes:
        toText(source.notes),
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const normalizeExpense = (
    expense = {}
  ) => {
    const source = isObject(expense)
      ? clone(expense)
      : {};

    return {
      ...source,
      id:
        source.id ||
        source._id ||
        createId("expense"),
      tripId:
        source.tripId ||
        null,
      category:
        toText(
          source.category ||
          source.type,
          "other"
        ) || "other",
      type:
        toText(
          source.type ||
          source.category,
          "other"
        ) || "other",
      title:
        toText(
          source.title ||
          source.name ||
          source.description
        ),
      amount:
        toNonNegative(
          firstDefined(
            source.amount,
            source.total,
            source.value,
            0
          )
        ),
      currency:
        toText(
          source.currency,
          Config.defaults.currency
        ) ||
        Config.defaults.currency,
      date:
        normalizeDateValue(
          firstDefined(
            source.date,
            source.paidAt,
            source.expenseDate
          )
        ),
      status:
        toText(
          source.status,
          "paid"
        ) || "paid",
      paymentMethod:
        toText(
          source.paymentMethod ||
          source.method,
          "other"
        ) || "other",
      notes:
        toText(source.notes),
      deletedAt:
        source.deletedAt ||
        null,
      isDeleted:
        toBoolean(
          source.isDeleted,
          false
        ),
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const normalizeSavingEntry = (
    entry = {}
  ) => {
    const source = isObject(entry)
      ? clone(entry)
      : {
          amount: entry
        };

    return {
      ...source,
      id:
        source.id ||
        createId("saving"),
      type:
        toText(
          source.type,
          "deposit"
        ) || "deposit",
      amount:
        toNonNegative(
          source.amount
        ),
      date:
        normalizeDateValue(
          source.date
        ),
      notes:
        toText(source.notes),
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const normalizePayment = (
    payment = {}
  ) => {
    const source = isObject(payment)
      ? clone(payment)
      : {};

    const amount =
      toNonNegative(
        source.amount
      );

    const paidAmount =
      Math.min(
        amount,
        toNonNegative(
          source.paidAmount
        )
      );

    let status =
      toText(
        source.status,
        "pending"
      ) || "pending";

    if (
      paidAmount >= amount &&
      amount > 0
    ) {
      status = "paid";
    } else if (
      paidAmount > 0 &&
      paidAmount < amount
    ) {
      status = "partial";
    }

    return {
      ...source,
      id:
        source.id ||
        createId("payment"),
      tripId:
        source.tripId ||
        null,
      expenseId:
        source.expenseId ||
        null,
      title:
        toText(
          source.title ||
          source.name
        ),
      type:
        toText(
          source.type,
          "other"
        ) || "other",
      amount,
      paidAmount,
      remainingAmount:
        Math.max(
          0,
          amount -
          paidAmount
        ),
      progressPercent:
        amount > 0
          ? Math.round(
              (
                paidAmount /
                amount
              ) * 100
            )
          : 0,
      currency:
        toText(
          source.currency,
          Config.defaults.currency
        ) ||
        Config.defaults.currency,
      status,
      dueDate:
        normalizeDateValue(
          source.dueDate
        ),
      paidAt:
        source.paidAt ||
        null,
      paymentMethod:
        toText(
          source.paymentMethod,
          "other"
        ) || "other",
      notes:
        toText(source.notes),
      deletedAt:
        source.deletedAt ||
        null,
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  /* =========================================================
     Budget Wallet normalizers
  ========================================================= */

  const normalizeBudgetTransaction = (
    transaction = {},
    index = 0
  ) => {
    const source = isObject(transaction)
      ? clone(transaction)
      : {};

    const rawType =
      toText(
        source.type,
        "deposit"
      );

    const type =
      BUDGET_TRANSACTION_TYPES.includes(
        rawType
      )
        ? rawType
        : "deposit";

    return {
      ...source,
      id:
        source.id ||
        createId(
          `budget_tx_${index}`
        ),
      type,
      amount:
        toNonNegative(
          source.amount
        ),
      title:
        toText(
          source.title,
          type === "deposit"
            ? "إضافة رصيد"
            : type === "withdrawal"
              ? "سحب من الرصيد"
              : "مصروف سفر"
        ),
      category:
        toText(
          source.category,
          type === "expense"
            ? "other"
            : ""
        ),
      notes:
        toText(
          source.notes
        ),
      date:
        normalizeDateValue(
          source.date ||
          source.createdAt ||
          todayISO()
        ) ||
        todayISO(),
      source:
        toText(
          source.source,
          "budget-page"
        ) ||
        "budget-page",
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };
  };

  const calculateBudgetWalletTotals = (
    wallet = {}
  ) => {
    const transactions =
      toArray(
        wallet.transactions
      );

    const openingBalance =
      toNonNegative(
        wallet.openingBalance
      );

    let deposits =
      openingBalance;

    let withdrawals = 0;
    let expenses = 0;

    transactions.forEach(
      (transaction) => {
        const amount =
          toNonNegative(
            transaction.amount
          );

        if (
          transaction.type ===
          "deposit"
        ) {
          deposits += amount;
        } else if (
          transaction.type ===
          "withdrawal"
        ) {
          withdrawals += amount;
        } else if (
          transaction.type ===
          "expense"
        ) {
          expenses += amount;
        }
      }
    );

    const balance =
      Math.max(
        0,
        deposits -
        withdrawals -
        expenses
      );

    return {
      deposits,
      withdrawals,
      expenses,
      balance,
      transactionCount:
        transactions.length
    };
  };

  const normalizeBudgetWallet = (
    wallet = {},
    currency = Config.defaults.currency
  ) => {
    const source = isObject(wallet)
      ? clone(wallet)
      : {};

    const transactions =
      uniqueById(
        toArray(
          source.transactions
        )
          .map(
            normalizeBudgetTransaction
          )
          .filter(
            (transaction) =>
              transaction.amount > 0
          )
      ).sort(
        (a, b) =>
          String(
            b.createdAt
          ).localeCompare(
            String(
              a.createdAt
            )
          )
      );

    const normalized = {
      ...source,
      version:
        STORE_VERSION,
      currency:
        toText(
          source.currency,
          currency
        ) || currency,
      openingBalance:
        toNonNegative(
          source.openingBalance
        ),
      transactions,
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        nowISO()
    };

    const totals =
      calculateBudgetWalletTotals(
        normalized
      );

    return {
      ...normalized,
      balance:
        totals.balance,
      totals
    };
  };

  /* =========================================================
     State normalization
  ========================================================= */

  const normalizeState = (input) => {
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

    merged.meta.storeVersion =
      STORE_VERSION;

    merged.meta.schemaVersion =
      SCHEMA_VERSION;

    merged.meta.updatedAt =
      nowISO();

    merged.trips =
      uniqueById(
        toArray(
          merged.trips
        ).map(
          normalizeTrip
        )
      );

    merged.plannedTrips =
      uniqueById(
        toArray(
          merged.plannedTrips
        ).map(
          normalizePlannedTrip
        )
      );

    merged.wishlist =
      uniqueById(
        toArray(
          merged.wishlist
        ).map(
          normalizeWishlistItem
        )
      ).filter(
        (item) =>
          item.countryCode
      );

    merged.annualPlans =
      uniqueById(
        toArray(
          merged.annualPlans
        ).map(
          normalizeAnnualPlan
        )
      );

    merged.expenses =
      uniqueById(
        []
          .concat(
            toArray(
              merged.expenses
            )
          )
          .concat(
            toArray(
              merged.budgets
                ?.expenses
            )
          )
          .map(
            normalizeExpense
          )
      );

    merged.savings =
      isObject(
        merged.savings
      )
        ? merged.savings
        : clone(
            defaults.savings
          );

    merged.savings.entries =
      uniqueById(
        []
          .concat(
            toArray(
              merged.savings
                .entries
            )
          )
          .concat(
            toArray(
              merged.savings
                .contributions
            )
          )
          .concat(
            toArray(
              merged.savings
                .transactions
            )
          )
          .map(
            normalizeSavingEntry
          )
      );

    const savingsBalance =
      merged.savings.entries.reduce(
        (total, item) =>
          item.type ===
          "withdrawal"
            ? total -
              toNonNegative(
                item.amount
              )
            : total +
              toNonNegative(
                item.amount
              ),
        0
      );

    if (
      merged.savings.entries.length
    ) {
      merged.savings.balance =
        savingsBalance;
    }

    merged.savings.currentBalance =
      toNumber(
        merged.savings.balance,
        0
      );

    merged.savings.monthlySaving =
      toNonNegative(
        firstDefined(
          merged.savings
            .monthlySaving,
          merged.profile
            ?.monthlySaving,
          merged.settings
            ?.monthlySaving,
          1500
        )
      );

    merged.savings.monthlySavingTarget =
      merged.savings.monthlySaving;

    merged.payments =
      uniqueById(
        toArray(
          merged.payments
        ).map(
          normalizePayment
        )
      );

    /*
     * New wallet normalization.
     * Old annual budget values are deliberately not migrated into it.
     */
    merged.budgetWallet =
      normalizeBudgetWallet(
        merged.budgetWallet,
        merged.profile
          ?.currency ||
        Config.defaults.currency
      );

    merged.budgetTravelIntelligence =
      deepMerge(
        defaults
          .budgetTravelIntelligence,
        isObject(
          merged
            .budgetTravelIntelligence
        )
          ? merged
              .budgetTravelIntelligence
          : {}
      );

    merged
      .budgetTravelIntelligence
      .recommendations =
      uniqueById(
        toArray(
          merged
            .budgetTravelIntelligence
            .recommendations
        )
      );

    merged
      .budgetTravelIntelligence
      .history =
      uniqueById(
        toArray(
          merged
            .budgetTravelIntelligence
            .history
        )
      ).slice(0, 20);

    merged.budgets.expenses =
      clone(
        merged.expenses
      );

    /*
     * Legacy fields mirror the new wallet balance for compatibility.
     * The 30,000 annual planning value remains separate.
     */
    merged.budgets.savingsBalance =
      merged.budgetWallet.balance;

    merged.budgets.monthlySavingTarget =
      merged.savings.monthlySaving;

    merged.savings.balance =
      merged.budgetWallet.balance;

    merged.savings.currentBalance =
      merged.budgetWallet.balance;

    merged.finance.expenses =
      clone(
        merged.expenses
      );

    merged.finance.savings =
      clone(
        merged.savings
      );

    merged.finance.payments =
      clone(
        merged.payments
      );

    merged.finance.updatedAt =
      nowISO();

    return merged;
  };

  const calculateStatistics = (
    currentState
  ) => {
    const visibleTrips =
      currentState.trips.filter(
        (trip) =>
          trip.status !==
          "archived"
      );

    const visiblePlannedTrips =
      currentState.plannedTrips.filter(
        (trip) =>
          ![
            "archived",
            "cancelled"
          ].includes(
            trip.status
          )
      );

    const completedTrips =
      visibleTrips.filter(
        (trip) =>
          trip.status ===
          "completed"
      );

    const expenses =
      currentState.expenses.filter(
        (expense) =>
          !expense.deletedAt &&
          expense.isDeleted !==
            true &&
          expense.status !==
            "cancelled"
      );

    const countries =
      new Set(
        completedTrips
          .map(
            (trip) =>
              trip.countryCode ||
              toText(
                trip.country
              ).toLowerCase()
          )
          .filter(Boolean)
      );

    const cities =
      new Set(
        completedTrips
          .map(
            (trip) =>
              toText(
                trip.city
              ).toLowerCase()
          )
          .filter(Boolean)
      );

    const totalTravelSpend =
      expenses.reduce(
        (total, expense) =>
          total +
          toNonNegative(
            expense.amount
          ),
        0
      );

    const totalTravelBudget =
      visibleTrips.reduce(
        (total, trip) =>
          total +
          toNonNegative(
            trip.budget
          ),
        0
      );

    const walletTotals =
      calculateBudgetWalletTotals(
        currentState.budgetWallet
      );

    currentState.budgetWallet.balance =
      walletTotals.balance;

    currentState.budgetWallet.totals =
      walletTotals;

    currentState.statistics = {
      totalTrips:
        visibleTrips.length,
      completedTrips:
        completedTrips.length,
      upcomingTrips:
        visibleTrips.filter(
          (trip) =>
            UPCOMING_STATUSES.includes(
              trip.status
            )
        ).length,
      activeTrips:
        visibleTrips.filter(
          (trip) =>
            ACTIVE_STATUSES.includes(
              trip.status
            )
        ).length,
      plannedTrips:
        visiblePlannedTrips.length,
      readyPlannedTrips:
        visiblePlannedTrips.filter(
          (trip) =>
            trip.readiness
              ?.readyForConversion ===
            true
        ).length,
      convertedPlannedTrips:
        currentState.plannedTrips.filter(
          (trip) =>
            trip.status ===
            "converted"
        ).length,
      visitedCountries:
        countries.size,
      visitedCities:
        cities.size,
      wishlistCount:
        currentState.wishlist.length,
      annualPlanCount:
        currentState.annualPlans.length,
      readyAnnualPlans:
        currentState.annualPlans.filter(
          (plan) =>
            plan.checklist
              ?.flightBooked ===
              true &&
            plan.checklist
              ?.hotelBooked ===
              true
        ).length,
      totalTravelSpend,
      totalTravelBudget,

      /*
       * savedForTravel now reflects the real wallet balance.
       */
      savedForTravel:
        walletTotals.balance,

      expenseCount:
        expenses.length,
      paymentCount:
        currentState.payments.length,
      overduePayments:
        currentState.payments.filter(
          (payment) =>
            payment.status ===
            "overdue"
        ).length,
      activeBudgetAlerts:
        toArray(
          currentState
            .budgetAlerts
            ?.items
        ).filter(
          (alert) =>
            ![
              "resolved",
              "dismissed"
            ].includes(
              alert.status
            )
        ).length,
      unreadBudgetNotifications:
        toArray(
          currentState
            .budgetNotifications
            ?.items
        ).filter(
          (notification) =>
            notification.read !==
              true &&
            notification.status ===
              "active"
        ).length,
      budgetTravelRecommendationCount:
        currentState
          .budgetTravelIntelligence
          .recommendations.length,

      budgetWalletBalance:
        walletTotals.balance,
      budgetWalletDeposits:
        walletTotals.deposits,
      budgetWalletWithdrawals:
        walletTotals.withdrawals,
      budgetWalletExpenses:
        walletTotals.expenses,
      budgetWalletTransactionCount:
        walletTotals.transactionCount
    };

    currentState.budgets.totalSpent =
      totalTravelSpend;

    currentState.budgets.savingsBalance =
      walletTotals.balance;

    currentState.savings.balance =
      walletTotals.balance;

    currentState.savings.currentBalance =
      walletTotals.balance;

    currentState.budgets.updatedAt =
      nowISO();

    return currentState;
  };

  const readStoredState = () => {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      return raw
        ? JSON.parse(raw)
        : null;
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

  /* =========================================================
     Persistence
  ========================================================= */

  const notifyListeners = (
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

    const detail = {
      state: snapshot,
      event
    };

    [
      "tic:store-change",
      "store:changed"
    ].forEach((name) => {
      window.dispatchEvent(
        new CustomEvent(
          name,
          { detail }
        )
      );
    });
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

      notifyListeners(event);
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
    if (
      transactionDepth > 0
    ) {
      pendingTransactionEvent =
        pendingTransactionEvent ||
        event;
      return;
    }

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

  const replaceStateInternal = (
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

  const findTripIndex = (
    tripId
  ) =>
    state.trips.findIndex(
      (trip) =>
        String(trip.id) ===
        String(tripId)
    );

  const findPlannedTripIndex = (
    tripId
  ) =>
    state.plannedTrips.findIndex(
      (trip) =>
        String(trip.id) ===
        String(tripId)
    );

  const findBudgetTransactionIndex = (
    transactionId
  ) =>
    state.budgetWallet
      .transactions.findIndex(
        (transaction) =>
          String(
            transaction.id
          ) ===
          String(
            transactionId
          )
      );

  /* =========================================================
     Public API
  ========================================================= */

  const Store = {
    version:
      STORE_VERSION,

    getState() {
      return clone(state);
    },

    get(path, fallback = null) {
      if (!path) {
        return clone(state);
      }

      const parts =
        String(path)
          .split(".")
          .filter(Boolean);

      let cursor = state;

      for (
        const key of parts
      ) {
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
    },

    set(path, value, options = {}) {
      const parts =
        String(path)
          .split(".")
          .filter(Boolean);

      if (!parts.length) {
        return false;
      }

      let cursor = state;

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

      state =
        calculateStatistics(
          normalizeState(state)
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

    update(mutator, options = {}) {
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

      state =
        calculateStatistics(
          normalizeState(
            result === undefined
              ? draft
              : result
          )
        );

      if (
        options.immediate ===
        true
      ) {
        persistImmediately({
          type:
            options.eventType ||
            "update"
        });
      } else {
        schedulePersist({
          type:
            options.eventType ||
            "update"
        });
      }

      return clone(state);
    },

    setState(nextState, options = {}) {
      if (
        typeof nextState ===
        "function"
      ) {
        return this.update(
          nextState,
          options
        );
      }

      return replaceStateInternal(
        nextState,
        {
          type:
            options.eventType ||
            "set-state"
        }
      );
    },

    replaceState(nextState, options = {}) {
      return replaceStateInternal(
        nextState,
        {
          type:
            options.eventType ||
            "replace-state"
        }
      );
    },

    patch(path, value, options = {}) {
      if (
        isObject(path) &&
        value === undefined
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
        this.get(
          path,
          {}
        );

      return this.set(
        path,
        isObject(current) &&
        isObject(value)
          ? deepMerge(
              current,
              value
            )
          : value,
        options
      );
    },

    transaction(mutator, options = {}) {
      transactionDepth += 1;

      try {
        return this.update(
          mutator,
          {
            immediate: false,
            eventType:
              options.eventType ||
              "transaction"
          }
        );
      } finally {
        transactionDepth -= 1;

        if (
          transactionDepth ===
          0
        ) {
          const event =
            pendingTransactionEvent ||
            {
              type:
                options.eventType ||
                "transaction"
            };

          pendingTransactionEvent =
            null;

          persistImmediately(
            event
          );
        }
      }
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

      return () =>
        listeners.delete(
          listener
        );
    },

    save() {
      return persistImmediately({
        type:
          "manual-save"
      });
    },

    dispatch(actionOrObject, payload) {
      const action =
        typeof actionOrObject ===
        "string"
          ? actionOrObject
          : actionOrObject
              ?.type;

      const data =
        typeof actionOrObject ===
        "string"
          ? payload
          : actionOrObject
              ?.payload;

      const handlers = {
        "trips/add": () =>
          this.createTrip(data),
        ADD_TRIP: () =>
          this.createTrip(data),
        "trips/update": () =>
          this.updateTrip(
            data?.id,
            data
          ),

        "plannedTrips/add": () =>
          this.createPlannedTrip(
            data
          ),
        ADD_PLANNED_TRIP: () =>
          this.createPlannedTrip(
            data
          ),
        "plannedTrips/update": () =>
          this.updatePlannedTrip(
            data?.id,
            data
          ),
        "plannedTrips/checklist": () =>
          this.updatePlannedTripChecklist(
            data?.id,
            data?.checklist ||
            data
          ),
        "plannedTrips/convert": () =>
          this.convertPlannedTrip(
            data?.id ||
            data?.plannedTripId,
            data
          ),
        "plannedTrips/remove": () =>
          this.deletePlannedTrip(
            data?.id ||
            data
          ),

        "budgetWallet/set": () =>
          this.setBudgetWallet(
            data
          ),
        "budgetWallet/deposit": () =>
          this.addBudgetDeposit(
            data
          ),
        "budgetWallet/withdraw": () =>
          this.addBudgetWithdrawal(
            data
          ),
        "budgetWallet/expense": () =>
          this.addBudgetExpense(
            data
          ),
        "budgetWallet/removeTransaction": () =>
          this.deleteBudgetTransaction(
            data?.id ||
            data
          ),

        "budgetTravel/setAnalysis": () =>
          this.setBudgetTravelAnalysis(
            data
          ),
        "budgetTravel/dismissRecommendation": () =>
          this.dismissBudgetTravelRecommendation(
            data?.id ||
            data
          ),
        "budgetTravel/acceptRecommendation": () =>
          this.acceptBudgetTravelRecommendation(
            data?.id ||
            data
          )
      };

      if (!handlers[action]) {
        throw new Error(
          `TIC Store: unsupported action "${action}".`
        );
      }

      return handlers[action]();
    },

    commit(actionOrObject, payload) {
      return this.dispatch(
        actionOrObject,
        payload
      );
    },

    execute(actionOrObject, payload) {
      return this.dispatch(
        actionOrObject,
        payload
      );
    },

    /* =======================================================
       Simple Budget Wallet
    ======================================================= */

    getBudgetWallet() {
      return clone(
        state.budgetWallet
      );
    },

    getTravelBalance() {
      return toNonNegative(
        state.budgetWallet
          .balance
      );
    },

    setBudgetWallet(wallet = {}) {
      state.budgetWallet =
        normalizeBudgetWallet(
          wallet,
          state.profile
            ?.currency ||
          Config.defaults.currency
        );

      state.meta.lastBudgetWalletSyncAt =
        nowISO();

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-wallet-set"
      });

      return this.getBudgetWallet();
    },

    saveBudgetWallet(wallet = {}) {
      return this.setBudgetWallet(
        wallet
      );
    },

    getBudgetTransactions(options = {}) {
      let items =
        clone(
          state.budgetWallet
            .transactions
        );

      if (
        options.type
      ) {
        const types =
          Array.isArray(
            options.type
          )
            ? options.type
            : [
                options.type
              ];

        items =
          items.filter(
            (transaction) =>
              types.includes(
                transaction.type
              )
          );
      }

      if (
        options.limit
      ) {
        items =
          items.slice(
            0,
            Math.max(
              0,
              toNumber(
                options.limit,
                0
              )
            )
          );
      }

      return items;
    },

    getBudgetTransaction(transactionId) {
      const index =
        findBudgetTransactionIndex(
          transactionId
        );

      return index === -1
        ? null
        : clone(
            state.budgetWallet
              .transactions[index]
          );
    },

    addBudgetTransaction(transactionData = {}) {
      const transaction =
        normalizeBudgetTransaction({
          ...clone(
            transactionData
          ),
          id:
            transactionData.id ||
            createId(
              "budget_tx"
            ),
          createdAt:
            transactionData.createdAt ||
            nowISO()
        });

      if (
        transaction.amount <= 0
      ) {
        throw new Error(
          "قيمة الحركة يجب أن تكون أكبر من صفر."
        );
      }

      if (
        [
          "withdrawal",
          "expense"
        ].includes(
          transaction.type
        ) &&
        transaction.amount >
          state.budgetWallet.balance
      ) {
        throw new Error(
          "المبلغ أكبر من رصيد السفر الحالي."
        );
      }

      state.budgetWallet
        .transactions.unshift(
          transaction
        );

      state.budgetWallet =
        normalizeBudgetWallet(
          state.budgetWallet,
          state.profile
            ?.currency ||
          Config.defaults.currency
        );

      state.meta.lastBudgetWalletSyncAt =
        nowISO();

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-wallet-transaction-created",
        transactionId:
          transaction.id,
        transactionType:
          transaction.type
      });

      window.dispatchEvent(
        new CustomEvent(
          "tic:budget-wallet-changed",
          {
            detail: {
              wallet:
                this.getBudgetWallet(),
              transaction:
                clone(
                  transaction
                )
            }
          }
        )
      );

      return this.getBudgetTransaction(
        transaction.id
      );
    },

    addBudgetDeposit(data = {}) {
      return this.addBudgetTransaction({
        ...clone(data),
        type: "deposit",
        title:
          data.title ||
          "إضافة رصيد"
      });
    },

    depositBudget(data = {}) {
      return this.addBudgetDeposit(
        data
      );
    },

    addBudgetWithdrawal(data = {}) {
      return this.addBudgetTransaction({
        ...clone(data),
        type:
          "withdrawal",
        title:
          data.title ||
          "سحب من الرصيد"
      });
    },

    withdrawBudget(data = {}) {
      return this.addBudgetWithdrawal(
        data
      );
    },

    addBudgetExpense(data = {}) {
      return this.addBudgetTransaction({
        ...clone(data),
        type: "expense",
        title:
          data.title ||
          "مصروف سفر",
        category:
          data.category ||
          "other"
      });
    },

    spendFromBudget(data = {}) {
      return this.addBudgetExpense(
        data
      );
    },

    updateBudgetTransaction(
      transactionId,
      changes = {}
    ) {
      const index =
        findBudgetTransactionIndex(
          transactionId
        );

      if (index === -1) {
        return null;
      }

      const current =
        state.budgetWallet
          .transactions[index];

      const updated =
        normalizeBudgetTransaction({
          ...current,
          ...clone(changes),
          id: current.id,
          createdAt:
            current.createdAt
        });

      const remainingTransactions =
        state.budgetWallet
          .transactions.filter(
            (_, itemIndex) =>
              itemIndex !== index
          );

      const previewWallet =
        normalizeBudgetWallet({
          ...state.budgetWallet,
          transactions: [
            updated,
            ...remainingTransactions
          ]
        });

      if (
        previewWallet.balance < 0
      ) {
        throw new Error(
          "التعديل يجعل الرصيد أقل من صفر."
        );
      }

      state.budgetWallet =
        previewWallet;

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-wallet-transaction-updated",
        transactionId
      });

      window.dispatchEvent(
        new CustomEvent(
          "tic:budget-wallet-changed",
          {
            detail: {
              wallet:
                this.getBudgetWallet(),
              transaction:
                this.getBudgetTransaction(
                  transactionId
                )
            }
          }
        )
      );

      return this.getBudgetTransaction(
        transactionId
      );
    },

    deleteBudgetTransaction(transactionId) {
      const index =
        findBudgetTransactionIndex(
          transactionId
        );

      if (index === -1) {
        return false;
      }

      state.budgetWallet
        .transactions.splice(
          index,
          1
        );

      state.budgetWallet =
        normalizeBudgetWallet(
          state.budgetWallet,
          state.profile
            ?.currency ||
          Config.defaults.currency
        );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-wallet-transaction-deleted",
        transactionId
      });

      window.dispatchEvent(
        new CustomEvent(
          "tic:budget-wallet-changed",
          {
            detail: {
              wallet:
                this.getBudgetWallet(),
              transactionId
            }
          }
        )
      );

      return true;
    },

    clearBudgetWallet(options = {}) {
      const openingBalance =
        options.keepOpeningBalance ===
        true
          ? state.budgetWallet
              .openingBalance
          : 0;

      state.budgetWallet =
        normalizeBudgetWallet({
          currency:
            state.budgetWallet
              .currency,
          openingBalance,
          transactions: [],
          createdAt:
            state.budgetWallet
              .createdAt,
          updatedAt:
            nowISO()
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-wallet-cleared"
      });

      window.dispatchEvent(
        new CustomEvent(
          "tic:budget-wallet-changed",
          {
            detail: {
              wallet:
                this.getBudgetWallet()
            }
          }
        )
      );

      return this.getBudgetWallet();
    },

    /* =======================================================
       Trips
    ======================================================= */

    getTrips(options = {}) {
      let items =
        state.trips.filter(
          (trip) =>
            options.includeArchived ===
              true ||
            trip.status !==
              "archived"
        );

      if (
        options.status
      ) {
        const statuses =
          Array.isArray(
            options.status
          )
            ? options.status
            : [
                options.status
              ];

        items =
          items.filter(
            (trip) =>
              statuses.includes(
                trip.status
              )
          );
      }

      if (
        options.sort ===
        "soonest"
      ) {
        items.sort(
          (a, b) =>
            (
              dateToUtcNumber(
                a.startDate
              ) ||
              Number.MAX_SAFE_INTEGER
            ) -
            (
              dateToUtcNumber(
                b.startDate
              ) ||
              Number.MAX_SAFE_INTEGER
            )
        );
      }

      return clone(items);
    },

    listTrips(options = {}) {
      return this.getTrips(
        options
      );
    },

    getUpcomingTrips() {
      return this.getTrips({
        status:
          UPCOMING_STATUSES,
        sort: "soonest"
      });
    },

    getActiveTrips() {
      return this.getTrips({
        status:
          ACTIVE_STATUSES
      });
    },

    getCompletedTrips() {
      return this.getTrips({
        status:
          "completed"
      });
    },

    getPassportTrips() {
      return this.getCompletedTrips();
    },

    getTrip(tripId) {
      const trip =
        state.trips.find(
          (item) =>
            String(
              item.id
            ) ===
            String(
              tripId
            )
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

    createTrip(tripData) {
      const trip =
        normalizeTrip(
          tripData
        );

      if (!trip.title) {
        throw new Error(
          "اسم الرحلة مطلوب."
        );
      }

      state.trips.unshift(
        trip
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "trip-created",
        tripId:
          trip.id
      });

      return this.getTrip(
        trip.id
      );
    },

    addTrip(tripData) {
      return this.createTrip(
        tripData
      );
    },

    updateTrip(tripId, changes = {}) {
      const index =
        findTripIndex(
          tripId
        );

      if (index === -1) {
        return null;
      }

      const current =
        state.trips[index];

      state.trips[index] =
        normalizeTrip({
          ...current,
          ...clone(
            changes
          ),
          id:
            current.id,
          createdAt:
            current.createdAt
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "trip-updated",
        tripId
      });

      return this.getTrip(
        tripId
      );
    },

    upsertTrip(tripData) {
      return (
        tripData?.id &&
        findTripIndex(
          tripData.id
        ) !== -1
      )
        ? this.updateTrip(
            tripData.id,
            tripData
          )
        : this.createTrip(
            tripData
          );
    },

    updateTripChecklist(
      tripId,
      changes = {}
    ) {
      const trip =
        this.getTrip(
          tripId
        );

      if (!trip) {
        return null;
      }

      const checklist =
        normalizeTripChecklist({
          ...trip.checklist,
          ...clone(
            changes
          )
        });

      return this.updateTrip(
        tripId,
        {
          checklist,
          planningStatus:
            checklist.flightBooked &&
            checklist.hotelBooked
              ? "ready"
              : trip.planningStatus
        }
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

      state.expenses =
        state.expenses.filter(
          (expense) =>
            String(
              expense.tripId
            ) !==
            String(
              tripId
            )
        );

      state.payments =
        state.payments.filter(
          (payment) =>
            String(
              payment.tripId
            ) !==
            String(
              tripId
            )
        );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "trip-deleted",
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

    /* =======================================================
       Planned Trips
    ======================================================= */

    getPlannedTrips(options = {}) {
      let items =
        clone(
          state.plannedTrips
        );

      if (
        options.includeArchived !==
        true
      ) {
        items =
          items.filter(
            (trip) =>
              ![
                "archived",
                "cancelled"
              ].includes(
                trip.status
              )
          );
      }

      if (
        options.status
      ) {
        const statuses =
          Array.isArray(
            options.status
          )
            ? options.status
            : [
                options.status
              ];

        items =
          items.filter(
            (trip) =>
              statuses.includes(
                trip.status
              )
          );
      }

      if (
        options.ready ===
        true
      ) {
        items =
          items.filter(
            (trip) =>
              trip.readiness
                ?.readyForConversion ===
              true
          );
      }

      return items;
    },

    listPlannedTrips(options = {}) {
      return this.getPlannedTrips(
        options
      );
    },

    getPlannedTrip(tripId) {
      const index =
        findPlannedTripIndex(
          tripId
        );

      return index === -1
        ? null
        : clone(
            state.plannedTrips[
              index
            ]
          );
    },

    createPlannedTrip(tripData = {}) {
      const trip =
        normalizePlannedTrip(
          tripData
        );

      if (
        trip.sourceRecommendationId
      ) {
        const existing =
          state.plannedTrips.find(
            (item) =>
              String(
                item.sourceRecommendationId
              ) ===
                String(
                  trip.sourceRecommendationId
                ) &&
              ![
                "archived",
                "cancelled"
              ].includes(
                item.status
              )
          );

        if (existing) {
          return clone(
            existing
          );
        }
      }

      state.plannedTrips.unshift(
        trip
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      if (
        trip.sourceRecommendationId
      ) {
        this.acceptBudgetTravelRecommendation(
          trip.sourceRecommendationId,
          {
            persist: false
          }
        );
      }

      persistImmediately({
        type:
          "planned-trip-created",
        plannedTripId:
          trip.id
      });

      return this.getPlannedTrip(
        trip.id
      );
    },

    addPlannedTrip(tripData) {
      return this.createPlannedTrip(
        tripData
      );
    },

    updatePlannedTrip(
      tripId,
      changes = {}
    ) {
      const index =
        findPlannedTripIndex(
          tripId
        );

      if (index === -1) {
        return null;
      }

      const current =
        state.plannedTrips[
          index
        ];

      state.plannedTrips[
        index
      ] =
        normalizePlannedTrip({
          ...current,
          ...clone(
            changes
          ),
          checklist: {
            ...current.checklist,
            ...(
              isObject(
                changes.checklist
              )
                ? changes.checklist
                : {}
            )
          },
          id:
            current.id,
          createdAt:
            current.createdAt
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "planned-trip-updated",
        plannedTripId:
          tripId
      });

      return this.getPlannedTrip(
        tripId
      );
    },

    updatePlannedTripChecklist(
      tripId,
      changes = {}
    ) {
      const trip =
        this.getPlannedTrip(
          tripId
        );

      if (!trip) {
        return null;
      }

      return this.updatePlannedTrip(
        tripId,
        {
          checklist: {
            ...trip.checklist,
            ...clone(
              changes
            )
          }
        }
      );
    },

    setPlannedTripChecklistItem(
      tripId,
      item,
      completed = true
    ) {
      if (
        ![
          ...REQUIRED_PLANNED_ITEMS,
          ...OPTIONAL_PLANNED_ITEMS
        ].includes(item)
      ) {
        throw new Error(
          `Unknown planned trip checklist item: ${item}`
        );
      }

      return this.updatePlannedTripChecklist(
        tripId,
        {
          [item]:
            completed ===
            true
        }
      );
    },

    canConvertPlannedTrip(tripId) {
      return Boolean(
        this.getPlannedTrip(
          tripId
        )?.readiness
          ?.readyForConversion
      );
    },

    convertPlannedTrip(
      tripId,
      options = {}
    ) {
      const index =
        findPlannedTripIndex(
          tripId
        );

      if (index === -1) {
        return null;
      }

      const plannedTrip =
        state.plannedTrips[
          index
        ];

      if (
        plannedTrip.status ===
          "converted" &&
        plannedTrip.convertedTripId
      ) {
        return this.getTrip(
          plannedTrip.convertedTripId
        );
      }

      if (
        !plannedTrip.readiness
          ?.readyForConversion
      ) {
        return {
          success: false,
          status: "blocked",
          reason:
            "REQUIREMENTS_NOT_MET",
          missingRequiredItems:
            plannedTrip.readiness
              ?.missingRequiredItems ||
            []
        };
      }

      const convertedAt =
        nowISO();

      const activeTrip =
        normalizeTrip({
          ...plannedTrip,
          id:
            options.tripId ||
            createId("trip"),
          plannedTripId:
            plannedTrip.id,
          budget:
            plannedTrip
              .estimatedBudget,
          status: "ready",
          planningStatus:
            "ready",
          source:
            "planned-trip",
          convertedAt,
          checklist: {
            ...plannedTrip.checklist,
            flightBooked: true,
            hotelBooked: true
          },
          bookingReference:
            options
              .flightReference ||
            plannedTrip.booking
              ?.flightReference ||
            "",
          hotelBookingReference:
            options
              .hotelReference ||
            plannedTrip.booking
              ?.hotelReference ||
            "",
          createdAt:
            nowISO()
        });

      state.trips.unshift(
        activeTrip
      );

      state.plannedTrips[
        index
      ] =
        normalizePlannedTrip({
          ...plannedTrip,
          status:
            "converted",
          convertedTripId:
            activeTrip.id,
          convertedAt
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "planned-trip-converted",
        plannedTripId:
          plannedTrip.id,
        tripId:
          activeTrip.id
      });

      return this.getTrip(
        activeTrip.id
      );
    },

    archivePlannedTrip(tripId) {
      return this.updatePlannedTrip(
        tripId,
        {
          status:
            "archived",
          archived: true
        }
      );
    },

    restorePlannedTrip(tripId) {
      return this.updatePlannedTrip(
        tripId,
        {
          status:
            "planned",
          archived: false,
          convertedTripId:
            null,
          convertedAt:
            null
        }
      );
    },

    deletePlannedTrip(tripId) {
      const index =
        findPlannedTripIndex(
          tripId
        );

      if (index === -1) {
        return false;
      }

      state.plannedTrips.splice(
        index,
        1
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "planned-trip-deleted",
        plannedTripId:
          tripId
      });

      return true;
    },

    /* =======================================================
       Budget Travel Intelligence
    ======================================================= */

    getBudgetTravelIntelligence() {
      return clone(
        state
          .budgetTravelIntelligence
      );
    },

    setBudgetTravelAnalysis(analysis = {}) {
      const normalized =
        isObject(analysis)
          ? clone(analysis)
          : {};

      normalized.id =
        normalized.id ||
        createId(
          "budget_analysis"
        );

      normalized.savedAt =
        nowISO();

      state
        .budgetTravelIntelligence
        .currentAnalysis =
        normalized;

      state
        .budgetTravelIntelligence
        .recommendations =
        uniqueById(
          toArray(
            normalized
              .recommendations
          )
        );

      state
        .budgetTravelIntelligence
        .timeline =
        toArray(
          normalized.timeline
        );

      state
        .budgetTravelIntelligence
        .multiTripPlan =
        normalized.multiTripPlan
          ? clone(
              normalized.multiTripPlan
            )
          : null;

      state
        .budgetTravelIntelligence
        .history =
        uniqueById([
          normalized,
          ...toArray(
            state
              .budgetTravelIntelligence
              .history
          )
        ]).slice(0, 20);

      state
        .budgetTravelIntelligence
        .lastGeneratedAt =
        normalized.generatedAt ||
        nowISO();

      state
        .budgetTravelIntelligence
        .updatedAt =
        nowISO();

      state.meta.lastBudgetTravelSyncAt =
        nowISO();

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-travel-analysis-saved",
        analysisId:
          normalized.id
      });

      return this.getBudgetTravelIntelligence();
    },

    saveBudgetTravelAnalysis(analysis) {
      return this.setBudgetTravelAnalysis(
        analysis
      );
    },

    clearBudgetTravelAnalysis() {
      state
        .budgetTravelIntelligence
        .currentAnalysis =
        null;

      state
        .budgetTravelIntelligence
        .recommendations =
        [];

      state
        .budgetTravelIntelligence
        .timeline =
        [];

      state
        .budgetTravelIntelligence
        .multiTripPlan =
        null;

      state
        .budgetTravelIntelligence
        .updatedAt =
        nowISO();

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-travel-analysis-cleared"
      });

      return this.getBudgetTravelIntelligence();
    },

    getBudgetTravelRecommendations(options = {}) {
      let items =
        clone(
          state
            .budgetTravelIntelligence
            .recommendations
        );

      if (
        options.includeDismissed !==
        true
      ) {
        const dismissed =
          new Set(
            state
              .budgetTravelIntelligence
              .dismissedRecommendationIds
          );

        items =
          items.filter(
            (item) =>
              !dismissed.has(
                item.id
              )
          );
      }

      return items;
    },

    dismissBudgetTravelRecommendation(
      recommendationId,
      options = {}
    ) {
      if (!recommendationId) {
        return false;
      }

      const ids =
        new Set(
          state
            .budgetTravelIntelligence
            .dismissedRecommendationIds
        );

      ids.add(
        String(
          recommendationId
        )
      );

      state
        .budgetTravelIntelligence
        .dismissedRecommendationIds =
        Array.from(ids);

      state
        .budgetTravelIntelligence
        .updatedAt =
        nowISO();

      if (
        options.persist !==
        false
      ) {
        persistImmediately({
          type:
            "budget-travel-recommendation-dismissed",
          recommendationId
        });
      }

      return true;
    },

    acceptBudgetTravelRecommendation(
      recommendationId,
      options = {}
    ) {
      if (!recommendationId) {
        return false;
      }

      const ids =
        new Set(
          state
            .budgetTravelIntelligence
            .acceptedRecommendationIds
        );

      ids.add(
        String(
          recommendationId
        )
      );

      state
        .budgetTravelIntelligence
        .acceptedRecommendationIds =
        Array.from(ids);

      state
        .budgetTravelIntelligence
        .updatedAt =
        nowISO();

      if (
        options.persist !==
        false
      ) {
        persistImmediately({
          type:
            "budget-travel-recommendation-accepted",
          recommendationId
        });
      }

      return true;
    },

    createPlannedTripFromRecommendation(
      recommendation,
      options = {}
    ) {
      if (
        !isObject(
          recommendation
        )
      ) {
        throw new Error(
          "بيانات الاقتراح غير صالحة."
        );
      }

      let draft = {
        title:
          recommendation.title,
        destinationId:
          recommendation
            .destinationId ||
          recommendation.id,
        country:
          recommendation.country,
        countryCode:
          recommendation
            .countryCode,
        city:
          recommendation.city,
        suggestedMonth:
          recommendation
            .suggestedMonth,
        durationDays:
          recommendation
            .durationDays ||
          recommendation.days,
        travelers:
          recommendation
            .travelers,
        estimatedBudget:
          firstDefined(
            recommendation
              .estimatedCost,
            recommendation
              .estimatedBudget,
            recommendation.budget,
            recommendation.cost
          ),
        currency:
          recommendation
            .currency ||
          state.profile
            ?.currency ||
          Config.defaults.currency,
        sourceRecommendationId:
          recommendation
            .recommendationId ||
          recommendation.id,
        sourceAnalysisId:
          state
            .budgetTravelIntelligence
            .currentAnalysis
            ?.id ||
          null,
        source: {
          engine:
            recommendation.source ||
            "SimpleTravelBudgetAdvisor",
          confidence:
            recommendation
              .confidence ||
            0
        },
        costBreakdown:
          recommendation
            .costBreakdown,
        highlights:
          recommendation
            .highlights ||
          recommendation.tags,
        notes:
          options.notes ||
          recommendation.summary ||
          "",
        ...options
      };

      if (
        window.PlannedTripEngine &&
        typeof window
          .PlannedTripEngine
          .create ===
          "function"
      ) {
        try {
          draft =
            window
              .PlannedTripEngine
              .create(draft);
        } catch (_) {}
      }

      return this.createPlannedTrip(
        draft
      );
    },

    /* =======================================================
       Guide compatibility
    ======================================================= */

    getGuideIntelligence() {
      return clone(
        state
          .guideIntelligence
      );
    },

    setGuideIntelligence(payload = {}) {
      state.guideIntelligence =
        deepMerge(
          state.guideIntelligence,
          payload
        );

      state.guideIntelligence.updatedAt =
        nowISO();

      state.meta.lastGuideSyncAt =
        nowISO();

      schedulePersist({
        type:
          "guide-intelligence-updated"
      });

      return this.getGuideIntelligence();
    },

    setTravelDNA(payload = {}) {
      return this.setGuideIntelligence({
        travelDNA:
          clone(payload),
        lastGeneratedAt:
          nowISO()
      });
    },

    setGuideRecommendations(items = []) {
      return this.setGuideIntelligence({
        recommendations:
          toArray(items),
        lastGeneratedAt:
          nowISO()
      });
    },

    setSelectedGuideCountry(countryCode) {
      return this.setGuideIntelligence({
        selectedCountryCode:
          normalizeCountryCode(
            countryCode
          ) || null
      });
    },

    /* =======================================================
       Wishlist
    ======================================================= */

    getWishlist() {
      return clone(
        state.wishlist
      );
    },

    addWishlistItem(itemData) {
      const item =
        normalizeWishlistItem(
          itemData
        );

      if (!item.countryCode) {
        throw new Error(
          "رمز الدولة مطلوب."
        );
      }

      const existing =
        state.wishlist.find(
          (current) =>
            current.countryCode ===
            item.countryCode
        );

      if (existing) {
        return clone(
          existing
        );
      }

      state.wishlist.unshift(
        item
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "wishlist-item-created",
        wishlistId:
          item.id
      });

      return clone(item);
    },

    addWishlist(itemData) {
      return this.addWishlistItem(
        itemData
      );
    },

    isWishlisted(identifier) {
      const code =
        normalizeCountryCode(
          identifier
        );

      return state.wishlist.some(
        (item) =>
          String(
            item.id
          ) ===
            String(
              identifier
            ) ||
          (
            code &&
            item.countryCode ===
            code
          )
      );
    },

    removeWishlistItem(identifier) {
      const code =
        normalizeCountryCode(
          identifier
        );

      const index =
        state.wishlist.findIndex(
          (item) =>
            String(
              item.id
            ) ===
              String(
                identifier
              ) ||
            (
              code &&
              item.countryCode ===
              code
            )
        );

      if (index === -1) {
        return false;
      }

      state.wishlist.splice(
        index,
        1
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "wishlist-item-deleted"
      });

      return true;
    },

    removeWishlist(identifier) {
      return this.removeWishlistItem(
        identifier
      );
    },

    toggleWishlist(itemData) {
      const identifier =
        itemData?.id ||
        itemData?.countryCode ||
        itemData;

      if (
        this.isWishlisted(
          identifier
        )
      ) {
        this.removeWishlistItem(
          identifier
        );
        return null;
      }

      return this.addWishlistItem(
        itemData
      );
    },

    /* =======================================================
       Annual Planner
    ======================================================= */

    getAnnualPlans() {
      return clone(
        state.annualPlans
      );
    },

    getAnnualPlan(planId) {
      return clone(
        state.annualPlans.find(
          (plan) =>
            String(
              plan.id
            ) ===
            String(
              planId
            )
        ) || null
      );
    },

    addAnnualPlan(planData) {
      const plan =
        normalizeAnnualPlan(
          planData
        );

      state.annualPlans.push(
        plan
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "annual-plan-created",
        planId:
          plan.id
      });

      return clone(plan);
    },

    createAnnualPlan(planData) {
      return this.addAnnualPlan(
        planData
      );
    },

    updateAnnualPlan(
      planId,
      changes = {}
    ) {
      const index =
        state.annualPlans.findIndex(
          (plan) =>
            String(
              plan.id
            ) ===
            String(
              planId
            )
        );

      if (index === -1) {
        return null;
      }

      state.annualPlans[
        index
      ] =
        normalizeAnnualPlan({
          ...state.annualPlans[
            index
          ],
          ...clone(
            changes
          ),
          id:
            state.annualPlans[
              index
            ].id,
          createdAt:
            state.annualPlans[
              index
            ].createdAt
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "annual-plan-updated",
        planId
      });

      return this.getAnnualPlan(
        planId
      );
    },

    removeAnnualPlan(planId) {
      const index =
        state.annualPlans.findIndex(
          (plan) =>
            String(
              plan.id
            ) ===
            String(
              planId
            )
        );

      if (index === -1) {
        return false;
      }

      state.annualPlans.splice(
        index,
        1
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "annual-plan-deleted",
        planId
      });

      return true;
    },

    deleteAnnualPlan(planId) {
      return this.removeAnnualPlan(
        planId
      );
    },

    linkAnnualPlanToTrip(
      planId,
      tripId
    ) {
      return this.updateAnnualPlan(
        planId,
        {
          status:
            "converted",
          convertedTripId:
            tripId
        }
      );
    },

    /* =======================================================
       Legacy Expenses and Savings
    ======================================================= */

    getExpenses(options = {}) {
      let items =
        state.expenses.filter(
          (expense) =>
            options.includeDeleted ===
              true ||
            (
              !expense.deletedAt &&
              expense.isDeleted !==
                true
            )
        );

      if (
        options.tripId
      ) {
        items =
          items.filter(
            (expense) =>
              String(
                expense.tripId
              ) ===
              String(
                options.tripId
              )
          );
      }

      return clone(items);
    },

    listExpenses(options = {}) {
      return this.getExpenses(
        options
      );
    },

    getExpense(expenseId) {
      return clone(
        state.expenses.find(
          (expense) =>
            String(
              expense.id
            ) ===
            String(
              expenseId
            )
        ) || null
      );
    },

    addExpense(expenseData) {
      const expense =
        normalizeExpense(
          expenseData
        );

      if (
        !expense.title ||
        expense.amount <= 0
      ) {
        throw new Error(
          "بيانات المصروف غير مكتملة."
        );
      }

      state.expenses.unshift(
        expense
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "expense-created",
        expenseId:
          expense.id
      });

      return this.getExpense(
        expense.id
      );
    },

    createExpense(expenseData) {
      return this.addExpense(
        expenseData
      );
    },

    updateExpense(
      expenseId,
      changes = {}
    ) {
      const index =
        state.expenses.findIndex(
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

      state.expenses[index] =
        normalizeExpense({
          ...state.expenses[
            index
          ],
          ...clone(
            changes
          ),
          id:
            state.expenses[
              index
            ].id,
          createdAt:
            state.expenses[
              index
            ].createdAt
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "expense-updated",
        expenseId
      });

      return this.getExpense(
        expenseId
      );
    },

    deleteExpense(
      expenseId,
      options = {}
    ) {
      const index =
        state.expenses.findIndex(
          (expense) =>
            String(
              expense.id
            ) ===
            String(
              expenseId
            )
        );

      if (index === -1) {
        return false;
      }

      if (
        options.soft ===
        true
      ) {
        state.expenses[index] =
          normalizeExpense({
            ...state.expenses[
              index
            ],
            deletedAt:
              nowISO(),
            isDeleted: true
          });
      } else {
        state.expenses.splice(
          index,
          1
        );
      }

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "expense-deleted",
        expenseId
      });

      return true;
    },

    getSavings() {
      return clone(
        state.savings
      );
    },

    addSavingEntry(entryData) {
      const entry =
        normalizeSavingEntry(
          entryData
        );

      if (
        entry.amount <= 0
      ) {
        throw new Error(
          "قيمة الادخار يجب أن تكون أكبر من صفر."
        );
      }

      state.savings.entries.unshift(
        entry
      );

      /*
       * Preserve old API behavior while keeping the wallet authoritative.
       */
      if (
        entry.type ===
        "withdrawal"
      ) {
        this.addBudgetWithdrawal({
          amount:
            entry.amount,
          title:
            entry.notes ||
            "سحب من الادخار",
          notes:
            entry.notes,
          date:
            entry.date
        });

        return clone(entry);
      }

      this.addBudgetDeposit({
        amount:
          entry.amount,
        title:
          entry.notes ||
          "إضافة ادخار",
        notes:
          entry.notes,
        date:
          entry.date
      });

      return clone(entry);
    },

    addDeposit(entryData) {
      return this.addSavingEntry({
        ...clone(
          entryData
        ),
        type:
          "deposit"
      });
    },

    deposit(entryData) {
      return this.addDeposit(
        entryData
      );
    },

    addWithdrawal(entryData) {
      return this.addSavingEntry({
        ...clone(
          entryData
        ),
        type:
          "withdrawal"
      });
    },

    setMonthlySaving(value) {
      state.savings.monthlySaving =
        toNonNegative(
          isObject(value)
            ? firstDefined(
                value.monthlySaving,
                value.amount,
                0
              )
            : value
        );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "savings-plan-updated"
      });

      return this.getSavings();
    },

    updateSavingsPlan(plan = {}) {
      state.savings = {
        ...state.savings,
        ...clone(plan)
      };

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "savings-plan-updated"
      });

      return this.getSavings();
    },

    setPlan(plan = {}) {
      return this.updateSavingsPlan(
        plan
      );
    },

    savePlan(plan = {}) {
      return this.updateSavingsPlan(
        plan
      );
    },

    /* =======================================================
       Payments
    ======================================================= */

    getPayments() {
      return clone(
        state.payments
      );
    },

    getPayment(paymentId) {
      return clone(
        state.payments.find(
          (payment) =>
            String(
              payment.id
            ) ===
            String(
              paymentId
            )
        ) || null
      );
    },

    createPayment(paymentData) {
      const payment =
        normalizePayment(
          paymentData
        );

      if (
        !payment.title ||
        payment.amount <= 0
      ) {
        throw new Error(
          "بيانات الدفعة غير مكتملة."
        );
      }

      state.payments.unshift(
        payment
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "payment-created",
        paymentId:
          payment.id
      });

      return this.getPayment(
        payment.id
      );
    },

    updatePayment(
      paymentId,
      changes = {}
    ) {
      const index =
        state.payments.findIndex(
          (payment) =>
            String(
              payment.id
            ) ===
            String(
              paymentId
            )
        );

      if (index === -1) {
        return null;
      }

      state.payments[index] =
        normalizePayment({
          ...state.payments[
            index
          ],
          ...clone(
            changes
          ),
          id:
            state.payments[
              index
            ].id,
          createdAt:
            state.payments[
              index
            ].createdAt
        });

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "payment-updated",
        paymentId
      });

      return this.getPayment(
        paymentId
      );
    },

    recordPayment(
      paymentId,
      paymentData = {}
    ) {
      const payment =
        this.getPayment(
          paymentId
        );

      if (!payment) {
        return null;
      }

      return this.updatePayment(
        paymentId,
        {
          paidAmount:
            Math.min(
              payment.amount,
              payment.paidAmount +
              toNonNegative(
                firstDefined(
                  paymentData.amount,
                  payment
                    .remainingAmount,
                  0
                )
              )
            ),
          paidAt:
            paymentData.paidAt ||
            nowISO()
        }
      );
    },

    markPaymentPaid(
      paymentId,
      paymentData = {}
    ) {
      return this.recordPayment(
        paymentId,
        paymentData
      );
    },

    deletePayment(paymentId) {
      const index =
        state.payments.findIndex(
          (payment) =>
            String(
              payment.id
            ) ===
            String(
              paymentId
            )
        );

      if (index === -1) {
        return false;
      }

      state.payments.splice(
        index,
        1
      );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "payment-deleted",
        paymentId
      });

      return true;
    },

    /* =======================================================
       Budget compatibility setters
    ======================================================= */

    setBudgetAlerts(payload = {}) {
      state.budgetAlerts =
        deepMerge(
          state.budgetAlerts,
          payload
        );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-alerts-updated"
      });

      return clone(
        state.budgetAlerts
      );
    },

    setBudgetRecommendations(payload = {}) {
      state.budgetRecommendations =
        deepMerge(
          state.budgetRecommendations,
          payload
        );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-recommendations-updated"
      });

      return clone(
        state.budgetRecommendations
      );
    },

    setBudgetNotifications(payload = {}) {
      state.budgetNotifications =
        deepMerge(
          state.budgetNotifications,
          payload
        );

      state =
        calculateStatistics(
          normalizeState(state)
        );

      persistImmediately({
        type:
          "budget-notifications-updated"
      });

      return clone(
        state.budgetNotifications
      );
    },

    setBudgetIntelligence(payload = {}) {
      state.budgetIntelligence =
        deepMerge(
          state.budgetIntelligence,
          payload
        );

      state.budgetIntelligence.updatedAt =
        nowISO();

      state =
        calculateStatistics(
          normalizeState(state)
        );

      schedulePersist({
        type:
          "budget-intelligence-updated"
      });

      return clone(
        state.budgetIntelligence
      );
    },

    /* =======================================================
       Backup, import and export
    ======================================================= */

    createBackup() {
      const backups =
        this.getBackups();

      const backup = {
        id:
          createId(
            "backup"
          ),
        createdAt:
          nowISO(),
        schemaVersion:
          SCHEMA_VERSION,
        appVersion:
          Config.appVersion,
        storeVersion:
          STORE_VERSION,
        state:
          clone(state)
      };

      backups.unshift(
        backup
      );

      localStorage.setItem(
        BACKUP_KEY,
        JSON.stringify(
          backups.slice(
            0,
            MAX_BACKUPS
          )
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

      return clone(backup);
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
      } catch (_) {
        return [];
      }
    },

    restoreBackup(backupId) {
      const backup =
        this.getBackups().find(
          (item) =>
            item.id ===
            backupId
        );

      if (!backup?.state) {
        return false;
      }

      replaceStateInternal(
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
          storeVersion:
            STORE_VERSION,
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
      const parsed =
        typeof payload ===
        "string"
          ? JSON.parse(
              payload
            )
          : payload;

      const importedState =
        parsed?.state ||
        parsed;

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

      return replaceStateInternal(
        importedState,
        {
          type:
            "data-imported"
        }
      );
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
          STORE_VERSION,
        storageKey:
          STORAGE_KEY,
        schemaVersion:
          SCHEMA_VERSION,
        tripCount:
          state.trips.length,
        plannedTripCount:
          state.plannedTrips.length,
        readyPlannedTripCount:
          state.statistics
            .readyPlannedTrips,
        convertedPlannedTripCount:
          state.statistics
            .convertedPlannedTrips,
        recommendationCount:
          state.statistics
            .budgetTravelRecommendationCount,
        budgetWalletBalance:
          state.budgetWallet
            .balance,
        budgetWalletTransactionCount:
          state.budgetWallet
            .transactions.length,
        lastUpdatedAt:
          state.meta
            .updatedAt,
        lastBudgetTravelSyncAt:
          state.meta
            .lastBudgetTravelSyncAt,
        lastBudgetWalletSyncAt:
          state.meta
            .lastBudgetWalletSyncAt
      };
    }
  };

  /* =========================================================
     Startup migration and global registration
  ========================================================= */

  const storedState =
    readStoredState();

  state.meta.lastMigrationAt =
    storedState
      ? nowISO()
      : null;

  state.meta.lastTripLifecycleSyncAt =
    nowISO();

  state.meta.lastGuideSyncAt =
    nowISO();

  state.meta.lastBudgetTravelSyncAt =
    nowISO();

  state.meta.lastBudgetWalletSyncAt =
    nowISO();

  persistImmediately({
    type:
      storedState
        ? "store-migrated-v2.4.0"
        : "store-initialized-v2.4.0"
  });

  window.TIC =
    window.TIC || {};

  window.TIC.Store =
    Store;

  window.TICStore =
    Store;

  window.Store =
    Store;

  window.TravelStore =
    Store;
})(window);
