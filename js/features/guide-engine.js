/* =========================================================
   Travel Intelligence Center
   Guide Intelligence Engine V4.0.0

   File Path:
   js/features/guide-engine.js

   Purpose:
   - Core engine for the rebuilt Guide Intelligence Platform.
   - Provides one reliable API for country discovery, search,
     selection, filtering, country details, visited-state linking,
     wishlist linking, annual-plan linking and guide analytics.
   - Reads data from the central Store without owning duplicate data.
   - Works with the upcoming world-data.js, travel-ai.js and
     planner-engine.js files.
   - Keeps the Guide page independent from direct Store internals.
   - Supports safe fallback behaviour when optional modules are absent.

   Architecture:
   UI (guide.js)
      ↓
   GuideEngine
      ↓
   Store + WorldData + TravelAI + PlannerEngine
      ↓
   localStorage persistence handled by the central Store

   Public API:
   - GuideEngine.init()
   - GuideEngine.refresh()
   - GuideEngine.getState()
   - GuideEngine.getSummary()
   - GuideEngine.getCountries()
   - GuideEngine.searchCountries()
   - GuideEngine.getCountry()
   - GuideEngine.selectCountry()
   - GuideEngine.clearSelection()
   - GuideEngine.getCountryGuide()
   - GuideEngine.toggleWishlist()
   - GuideEngine.isWishlisted()
   - GuideEngine.getWishlist()
   - GuideEngine.getVisitedCountries()
   - GuideEngine.isVisited()
   - GuideEngine.getRecommendations()
   - GuideEngine.addToAnnualPlan()
   - GuideEngine.createTripDraft()
   - GuideEngine.subscribe()
   - GuideEngine.destroy()
   ========================================================= */

(function guideEngineModule(global) {
  "use strict";

  const VERSION = "4.0.0";
  const MODULE_NAME = "GuideEngine";
  const STORAGE_KEY = "tic_guide_engine_state_v4";

  const DEFAULT_STATE = Object.freeze({
    initialized: false,
    selectedCountryCode: null,
    searchQuery: "",
    filters: {
      continent: "all",
      season: "all",
      travelStyle: "all",
      budgetLevel: "all",
      visited: "all",
      wishlist: "all"
    },
    sortBy: "recommended",
    lastUpdatedAt: null
  });

  const VALID_SORTS = new Set([
    "recommended",
    "name",
    "visited",
    "wishlist",
    "budget-low",
    "budget-high"
  ]);

  const SEASON_ALIASES = Object.freeze({
    spring: ["spring", "ربيع", "الربيع"],
    summer: ["summer", "صيف", "الصيف"],
    autumn: ["autumn", "fall", "خريف", "الخريف"],
    winter: ["winter", "شتاء", "الشتاء"],
    snow: ["snow", "ثلج", "ثلوج"],
    coolSummer: ["cool summer", "cold summer", "صيف بارد"]
  });

  const CONTINENT_ORDER = Object.freeze([
    "Asia",
    "Europe",
    "Africa",
    "North America",
    "South America",
    "Oceania",
    "Antarctica",
    "Other"
  ]);

  const listeners = new Set();

  let state = clone(DEFAULT_STATE);
  let countriesCache = [];
  let storeUnsubscribe = null;
  let initializedPromise = null;

  /* =======================================================
     Utilities
     ======================================================= */

  function clone(value) {
    if (value === undefined) return undefined;

    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function unique(values) {
    return [...new Set(safeArray(values).filter(Boolean))];
  }

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("ar")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ");
  }

  function normalizeCountryCode(value) {
    const code = String(value ?? "").trim().toUpperCase();
    return code.length >= 2 && code.length <= 3 ? code : null;
  }

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
  }

  function emit(type, detail = {}) {
    const event = {
      type,
      module: MODULE_NAME,
      version: VERSION,
      timestamp: nowISO(),
      detail: clone(detail)
    };

    listeners.forEach((listener) => {
      try {
        listener(event, getState());
      } catch (error) {
        console.error(`[${MODULE_NAME}] Subscriber error`, error);
      }
    });

    try {
      global.dispatchEvent(
        new CustomEvent(`tic:${type}`, {
          detail: event
        })
      );
    } catch (_) {
      // CustomEvent may not exist in older test environments.
    }

    return event;
  }

  function persistLocalState() {
    try {
      global.localStorage?.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selectedCountryCode: state.selectedCountryCode,
          searchQuery: state.searchQuery,
          filters: state.filters,
          sortBy: state.sortBy,
          lastUpdatedAt: state.lastUpdatedAt
        })
      );
    } catch (error) {
      console.warn(`[${MODULE_NAME}] Could not persist local UI state`, error);
    }
  }

  function restoreLocalState() {
    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw);
      state = {
        ...state,
        selectedCountryCode:
          normalizeCountryCode(saved.selectedCountryCode) || null,
        searchQuery: String(saved.searchQuery || ""),
        filters: {
          ...state.filters,
          ...safeObject(saved.filters)
        },
        sortBy: VALID_SORTS.has(saved.sortBy)
          ? saved.sortBy
          : state.sortBy,
        lastUpdatedAt: saved.lastUpdatedAt || null
      };
    } catch (error) {
      console.warn(`[${MODULE_NAME}] Could not restore local UI state`, error);
    }
  }

  function updateState(patch, eventType = "guide-state-changed") {
    state = {
      ...state,
      ...clone(patch),
      lastUpdatedAt: nowISO()
    };

    persistLocalState();
    emit(eventType, patch);
    return getState();
  }

  /* =======================================================
     Dependency resolution
     ======================================================= */

  function getStore() {
    return (
      global.TravelStore ||
      global.Store ||
      global.AppStore ||
      global.TICStore ||
      null
    );
  }

  function getWorldDataModule() {
    return (
      global.WorldGuideData ||
      global.WorldData ||
      global.TravelWorldData ||
      null
    );
  }

  function getTravelAI() {
    return (
      global.TravelAI ||
      global.TravelIntelligence ||
      global.TravelAIEngine ||
      null
    );
  }

  function getPlannerEngine() {
    return (
      global.PlannerEngine ||
      global.TravelPlannerEngine ||
      global.WishlistPlanner ||
      null
    );
  }

  function readStoreState() {
    const store = getStore();
    if (!store) return {};

    const getters = [
      () => store.getState?.(),
      () => store.get?.(),
      () => store.state,
      () => store.data
    ];

    for (const getter of getters) {
      try {
        const result = getter();
        if (result && typeof result === "object") {
          return result;
        }
      } catch (_) {
        // Try the next compatible Store API.
      }
    }

    return {};
  }

  function subscribeToStore() {
    if (typeof storeUnsubscribe === "function") {
      storeUnsubscribe();
      storeUnsubscribe = null;
    }

    const store = getStore();
    if (!store) return;

    const handler = () => {
      refresh({
        preserveSelection: true,
        silent: false,
        reason: "store-update"
      });
    };

    const subscriptionMethods = [
      () => store.subscribe?.(handler),
      () => store.onChange?.(handler),
      () => store.listen?.(handler)
    ];

    for (const subscribe of subscriptionMethods) {
      try {
        const unsubscribe = subscribe();
        if (typeof unsubscribe === "function") {
          storeUnsubscribe = unsubscribe;
          return;
        }
      } catch (_) {
        // Try next Store subscription API.
      }
    }
  }

  async function dispatchStoreAction(type, payload) {
    const store = getStore();
    if (!store) {
      throw new Error("Central Store is not available.");
    }

    const attempts = [
      () => store.dispatch?.(type, payload),
      () => store.dispatch?.({ type, payload }),
      () => store.commit?.(type, payload),
      () => store.execute?.(type, payload)
    ];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        const result = attempt();
        if (result !== undefined) {
          return await Promise.resolve(result);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    throw new Error(`Store action "${type}" is not supported.`);
  }

  /* =======================================================
     Country normalization
     ======================================================= */

  function getRawCountries() {
    const worldData = getWorldDataModule();

    const candidates = [
      worldData?.getCountries?.(),
      worldData?.countries,
      global.TRAVEL_COUNTRIES,
      global.COUNTRIES_CATALOG,
      global.countriesCatalog
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length) {
        return candidate;
      }
    }

    return [];
  }

  function normalizeMonthTemperatures(value) {
    const source = safeObject(value);
    const result = {};

    for (let month = 1; month <= 12; month += 1) {
      const record =
        source[month] ||
        source[String(month)] ||
        source[String(month).padStart(2, "0")] ||
        null;

      if (record && typeof record === "object") {
        result[month] = {
          min: toNumber(record.min ?? record.low, null),
          max: toNumber(record.max ?? record.high, null),
          rain: toNumber(record.rain ?? record.rainfall, null),
          condition: record.condition || record.label || null
        };
      }
    }

    return result;
  }

  function normalizeHotel(hotel, countryCode) {
    const source = safeObject(hotel);

    return {
      id: String(source.id || makeId("hotel")),
      countryCode,
      city: source.city || source.location || "",
      name: source.name || source.nameAr || "فندق",
      nameAr: source.nameAr || source.name || "فندق",
      nameEn: source.nameEn || source.name || "",
      rating: clamp(toNumber(source.rating, 0), 0, 5),
      priceLevel: clamp(toNumber(source.priceLevel ?? source.level, 3), 1, 5),
      estimatedNightlyAED: Math.max(
        0,
        toNumber(
          source.estimatedNightlyAED ??
            source.nightlyRateAED ??
            source.priceAED,
          0
        )
      ),
      hasShattaf:
        source.hasShattaf === true ||
        source.shattaf === true ||
        normalizeText(source.bathroom).includes("شطاف"),
      familyFriendly: source.familyFriendly !== false,
      beachAccess: source.beachAccess === true,
      nearMetro: source.nearMetro === true,
      halalFriendly: source.halalFriendly !== false,
      tags: unique(source.tags),
      notes: source.notes || ""
    };
  }

  function normalizeCountry(country, index) {
    const source = safeObject(country);

    const code =
      normalizeCountryCode(
        source.code ||
          source.iso2 ||
          source.iso ||
          source.countryCode ||
          source.id
      ) || `C${String(index + 1).padStart(3, "0")}`;

    const nameAr =
      source.nameAr ||
      source.arabicName ||
      source.nameArabic ||
      source.name ||
      code;

    const nameEn =
      source.nameEn ||
      source.englishName ||
      source.nameEnglish ||
      source.name ||
      nameAr;

    const cities = safeArray(
      source.cities ||
        source.bestCities ||
        source.destinations ||
        source.topCities
    ).map((city) => {
      if (typeof city === "string") {
        return {
          id: normalizeText(city).replace(/\s+/g, "-"),
          nameAr: city,
          nameEn: city,
          tags: []
        };
      }

      const item = safeObject(city);
      return {
        id: String(
          item.id ||
            normalizeText(item.nameAr || item.name || item.nameEn)
              .replace(/\s+/g, "-") ||
            makeId("city")
        ),
        nameAr: item.nameAr || item.name || item.nameEn || "مدينة",
        nameEn: item.nameEn || item.name || item.nameAr || "",
        recommendedDays: Math.max(
          1,
          toNumber(item.recommendedDays ?? item.days, 2)
        ),
        tags: unique(item.tags),
        highlights: unique(item.highlights || item.attractions),
        notes: item.notes || ""
      };
    });

    const hotels = safeArray(
      source.hotels || source.bestHotels || source.hotelRecommendations
    ).map((hotel) => normalizeHotel(hotel, code));

    const bestMonths = unique(
      safeArray(
        source.bestMonths ||
          source.recommendedMonths ||
          source.weather?.bestMonths
      ).map((month) => toNumber(month, month))
    );

    const normalized = {
      id: String(source.id || code),
      code,
      iso2: code.length === 2 ? code : source.iso2 || null,
      flag: source.flag || source.emoji || "🌍",
      nameAr,
      nameEn,
      aliases: unique([
        ...safeArray(source.aliases),
        nameAr,
        nameEn,
        code
      ]),
      continent: source.continent || source.region || "Other",
      subregion: source.subregion || "",
      capital: source.capital || "",
      currency: source.currency || source.currencyCode || "",
      languages: unique(source.languages || source.language),
      timezone: source.timezone || source.timeZone || "",
      flightDurationFromAbuDhabiHours: toNumber(
        source.flightDurationFromAbuDhabiHours ||
          source.flightHoursFromAUH ||
          source.flightDuration,
        0
      ),
      visa: safeObject(source.visa),
      entryRequirements: unique(
        source.entryRequirements || source.requirements
      ),
      safety: safeObject(source.safety),
      transport: safeObject(source.transport),
      connectivity: safeObject(source.connectivity),
      electricity: safeObject(source.electricity),
      halal: safeObject(source.halal),
      shattafAvailability:
        source.shattafAvailability ||
        source.bathroom?.shattafAvailability ||
        "unknown",
      familyFriendly: source.familyFriendly !== false,
      recommendedDays: {
        min: Math.max(
          1,
          toNumber(
            source.recommendedDays?.min ??
              source.minDays ??
              source.recommendedMinDays,
            4
          )
        ),
        ideal: Math.max(
          1,
          toNumber(
            source.recommendedDays?.ideal ??
              source.idealDays ??
              source.recommendedDays,
            7
          )
        ),
        max: Math.max(
          1,
          toNumber(
            source.recommendedDays?.max ??
              source.maxDays ??
              source.recommendedMaxDays,
            14
          )
        )
      },
      budget: {
        level: clamp(
          toNumber(
            source.budget?.level ??
              source.budgetLevel ??
              source.costLevel,
            3
          ),
          1,
          5
        ),
        dailyAED: Math.max(
          0,
          toNumber(
            source.budget?.dailyAED ??
              source.dailyBudgetAED ??
              source.averageDailyCostAED,
            0
          )
        ),
        flightAED: Math.max(
          0,
          toNumber(
            source.budget?.flightAED ??
              source.estimatedFlightAED ??
              source.flightCostAED,
            0
          )
        ),
        hotelNightAED: Math.max(
          0,
          toNumber(
            source.budget?.hotelNightAED ??
              source.hotelNightAED ??
              source.averageHotelNightAED,
            0
          )
        )
      },
      seasons: unique(
        source.seasons ||
          source.travelSeasons ||
          source.weather?.seasons
      ),
      bestMonths,
      monthsToAvoid: unique(
        source.monthsToAvoid || source.weather?.monthsToAvoid
      ),
      temperatures: normalizeMonthTemperatures(
        source.temperatures ||
          source.monthlyTemperatures ||
          source.weather?.months
      ),
      cities,
      hotels,
      attractions: safeArray(
        source.attractions ||
          source.topAttractions ||
          source.places
      ),
      beaches: safeArray(source.beaches),
      halalRestaurants: safeArray(
        source.halalRestaurants || source.restaurants
      ),
      shopping: safeArray(source.shopping || source.malls),
      experiences: safeArray(source.experiences || source.activities),
      travelStyles: unique(
        source.travelStyles ||
          source.styles ||
          source.suitableFor
      ),
      tags: unique(source.tags),
      image: source.image || source.coverImage || "",
      gallery: unique(source.gallery || source.images),
      summary: source.summary || source.description || "",
      notes: source.notes || "",
      sourceVersion: source.sourceVersion || null,
      raw: source
    };

    normalized.searchIndex = normalizeText(
      [
        normalized.nameAr,
        normalized.nameEn,
        normalized.code,
        normalized.continent,
        normalized.subregion,
        normalized.capital,
        ...normalized.aliases,
        ...normalized.tags,
        ...normalized.travelStyles,
        ...normalized.cities.flatMap((city) => [
          city.nameAr,
          city.nameEn
        ])
      ].join(" ")
    );

    return normalized;
  }

  function buildCountriesCache() {
    const rawCountries = getRawCountries();

    countriesCache = rawCountries
      .map(normalizeCountry)
      .filter((country) => country.code && country.nameAr)
      .sort((a, b) =>
        a.nameAr.localeCompare(b.nameAr, "ar", {
          sensitivity: "base"
        })
      );

    return countriesCache;
  }

  /* =======================================================
     Store-derived travel data
     ======================================================= */

  function extractTrips(rootState = readStoreState()) {
    const candidates = [
      rootState.trips,
      rootState.travel?.trips,
      rootState.data?.trips,
      rootState.tripData,
      rootState.completedTrips
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && Array.isArray(candidate.items)) {
        return candidate.items;
      }
      if (candidate && typeof candidate === "object") {
        const values = Object.values(candidate);
        if (values.every((item) => item && typeof item === "object")) {
          return values;
        }
      }
    }

    return [];
  }

  function extractPassportCountries(rootState = readStoreState()) {
    const passportCandidates = [
      rootState.passport,
      rootState.travelPassport,
      rootState.profile?.passport,
      rootState.statistics?.passport,
      rootState.travel?.passport
    ];

    const countryCodes = [];

    passportCandidates.forEach((passport) => {
      if (!passport) return;

      const lists = [
        passport.countries,
        passport.visitedCountries,
        passport.history,
        passport.stamps,
        passport.entries
      ];

      lists.forEach((list) => {
        safeArray(list).forEach((item) => {
          if (typeof item === "string") {
            countryCodes.push(item);
            return;
          }

          const source = safeObject(item);
          countryCodes.push(
            source.countryCode ||
              source.code ||
              source.iso2 ||
              source.country ||
              source.destination
          );
        });
      });
    });

    return countryCodes;
  }

  function countryCodeFromTrip(trip) {
    const source = safeObject(trip);

    const explicit = normalizeCountryCode(
      source.countryCode ||
        source.destinationCountryCode ||
        source.destination?.countryCode ||
        source.country?.code ||
        source.iso2
    );

    if (explicit) return explicit;

    const countryName = normalizeText(
      source.country ||
        source.destinationCountry ||
        source.destination?.country ||
        source.location?.country ||
        ""
    );

    if (!countryName) return null;

    const match = countriesCache.find((country) =>
      country.aliases.some(
        (alias) => normalizeText(alias) === countryName
      )
    );

    return match?.code || null;
  }

  function tripIsCompleted(trip) {
    const source = safeObject(trip);
    const status = normalizeText(source.status);

    if (
      ["completed", "done", "finished", "مكتمله", "مكتملة", "منتهيه", "منتهية"].includes(
        status
      )
    ) {
      return true;
    }

    const endDate =
      source.endDate ||
      source.returnDate ||
      source.dates?.end ||
      source.dateTo;

    if (!endDate) return false;

    const timestamp = new Date(endDate).getTime();
    return Number.isFinite(timestamp) && timestamp < Date.now();
  }

  function getVisitedCountryCodes(rootState = readStoreState()) {
    const codes = [
      ...extractPassportCountries(rootState),
      ...extractTrips(rootState)
        .filter(tripIsCompleted)
        .map(countryCodeFromTrip)
    ]
      .map(normalizeCountryCode)
      .filter(Boolean);

    return unique(codes);
  }

  function extractWishlist(rootState = readStoreState()) {
    const candidates = [
      rootState.wishlist,
      rootState.travelWishlist,
      rootState.guide?.wishlist,
      rootState.travel?.wishlist,
      rootState.destinations?.wishlist
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && Array.isArray(candidate.items)) {
        return candidate.items;
      }
      if (candidate && typeof candidate === "object") {
        return Object.values(candidate);
      }
    }

    return [];
  }

  function getWishlistCountryCodes(rootState = readStoreState()) {
    return unique(
      extractWishlist(rootState)
        .map((item) => {
          if (typeof item === "string") return item;

          const source = safeObject(item);
          return (
            source.countryCode ||
            source.code ||
            source.iso2 ||
            source.country?.code
          );
        })
        .map(normalizeCountryCode)
        .filter(Boolean)
    );
  }

  function extractAnnualPlans(rootState = readStoreState()) {
    const candidates = [
      rootState.annualPlans,
      rootState.travelPlans,
      rootState.guide?.annualPlans,
      rootState.travel?.annualPlans,
      rootState.plans
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && Array.isArray(candidate.items)) {
        return candidate.items;
      }
      if (candidate && typeof candidate === "object") {
        return Object.values(candidate);
      }
    }

    return [];
  }

  function extractProfile(rootState = readStoreState()) {
    return {
      ...safeObject(rootState.profile),
      ...safeObject(rootState.user?.profile),
      ...safeObject(rootState.settings?.profile)
    };
  }

  function extractBudgetContext(rootState = readStoreState()) {
    const budget = safeObject(
      rootState.budget ||
        rootState.budgets?.current ||
        rootState.travel?.budget
    );

    const savings = safeObject(
      rootState.savings ||
        rootState.budgets?.savings ||
        rootState.travel?.savings
    );

    const profile = extractProfile(rootState);

    return {
      annualTravelBudget: toNumber(
        budget.annualTravelBudget ??
          budget.annual ??
          profile.annualTravelBudget,
        0
      ),
      availableTravelBudget: toNumber(
        budget.availableTravelBudget ??
          budget.available ??
          budget.remaining,
        0
      ),
      monthlySaving: toNumber(
        savings.monthlySaving ??
          savings.monthly ??
          profile.monthlySaving,
        0
      ),
      savedAmount: toNumber(
        savings.savedAmount ??
          savings.balance ??
          savings.total,
        0
      ),
      currency:
        budget.currency ||
        profile.currency ||
        "AED"
    };
  }

  /* =======================================================
     Search, filtering and sorting
     ======================================================= */

  function matchesSeason(country, seasonFilter) {
    if (!seasonFilter || seasonFilter === "all") return true;

    const aliases =
      SEASON_ALIASES[seasonFilter] || [seasonFilter];

    const countryTerms = [
      ...country.seasons,
      ...country.tags,
      ...country.travelStyles
    ].map(normalizeText);

    return aliases.some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return countryTerms.some((term) =>
        term.includes(normalizedAlias)
      );
    });
  }

  function matchesTravelStyle(country, travelStyle) {
    if (!travelStyle || travelStyle === "all") return true;

    const target = normalizeText(travelStyle);

    return [
      ...country.travelStyles,
      ...country.tags
    ].some((value) => normalizeText(value).includes(target));
  }

  function matchesBudgetLevel(country, budgetLevel) {
    if (!budgetLevel || budgetLevel === "all") return true;

    const numeric = toNumber(budgetLevel, 0);
    if (numeric > 0) return country.budget.level === numeric;

    const aliases = {
      economy: [1, 2],
      moderate: [2, 3],
      premium: [3, 4],
      luxury: [4, 5]
    };

    return (
      aliases[budgetLevel]?.includes(country.budget.level) ||
      false
    );
  }

  function computeBaseRecommendationScore(country, context) {
    let score = 50;

    if (context.visitedCodes.includes(country.code)) score -= 8;
    if (context.wishlistCodes.includes(country.code)) score += 12;

    const profileStyle = normalizeText(
      context.profile.travelStyle || ""
    );

    if (
      profileStyle &&
      matchesTravelStyle(country, profileStyle)
    ) {
      score += 12;
    }

    const availableBudget =
      context.budget.availableTravelBudget ||
      context.budget.savedAmount ||
      0;

    const estimatedCost = estimateCountryTripCost(
      country,
      country.recommendedDays.ideal
    ).totalAED;

    if (availableBudget > 0 && estimatedCost > 0) {
      const ratio = estimatedCost / availableBudget;

      if (ratio <= 0.8) score += 16;
      else if (ratio <= 1) score += 10;
      else if (ratio <= 1.2) score += 2;
      else score -= Math.min(20, Math.round((ratio - 1) * 20));
    }

    if (country.familyFriendly) score += 4;
    if (country.halal?.friendly === true) score += 6;

    return clamp(Math.round(score), 0, 100);
  }

  function sortCountries(countries, sortBy, context) {
    const list = [...countries];

    switch (sortBy) {
      case "name":
        return list.sort((a, b) =>
          a.nameAr.localeCompare(b.nameAr, "ar")
        );

      case "visited":
        return list.sort(
          (a, b) =>
            Number(context.visitedCodes.includes(b.code)) -
            Number(context.visitedCodes.includes(a.code))
        );

      case "wishlist":
        return list.sort(
          (a, b) =>
            Number(context.wishlistCodes.includes(b.code)) -
            Number(context.wishlistCodes.includes(a.code))
        );

      case "budget-low":
        return list.sort(
          (a, b) => a.budget.level - b.budget.level
        );

      case "budget-high":
        return list.sort(
          (a, b) => b.budget.level - a.budget.level
        );

      case "recommended":
      default:
        return list.sort(
          (a, b) =>
            computeBaseRecommendationScore(b, context) -
              computeBaseRecommendationScore(a, context) ||
            a.nameAr.localeCompare(b.nameAr, "ar")
        );
    }
  }

  function buildContext(rootState = readStoreState()) {
    return {
      rootState,
      visitedCodes: getVisitedCountryCodes(rootState),
      wishlistCodes: getWishlistCountryCodes(rootState),
      annualPlans: extractAnnualPlans(rootState),
      profile: extractProfile(rootState),
      budget: extractBudgetContext(rootState),
      trips: extractTrips(rootState)
    };
  }

  function getCountries(options = {}) {
    if (!countriesCache.length) buildCountriesCache();

    const context = buildContext();
    const query = normalizeText(
      options.query ?? state.searchQuery
    );

    const filters = {
      ...state.filters,
      ...safeObject(options.filters)
    };

    let countries = countriesCache.filter((country) => {
      if (query && !country.searchIndex.includes(query)) {
        return false;
      }

      if (
        filters.continent &&
        filters.continent !== "all" &&
        normalizeText(country.continent) !==
          normalizeText(filters.continent)
      ) {
        return false;
      }

      if (!matchesSeason(country, filters.season)) {
        return false;
      }

      if (
        !matchesTravelStyle(country, filters.travelStyle)
      ) {
        return false;
      }

      if (
        !matchesBudgetLevel(country, filters.budgetLevel)
      ) {
        return false;
      }

      const visited = context.visitedCodes.includes(country.code);
      if (filters.visited === "visited" && !visited) return false;
      if (filters.visited === "not-visited" && visited) return false;

      const wishlisted =
        context.wishlistCodes.includes(country.code);
      if (filters.wishlist === "wishlist" && !wishlisted) {
        return false;
      }
      if (
        filters.wishlist === "not-wishlist" &&
        wishlisted
      ) {
        return false;
      }

      return true;
    });

    countries = sortCountries(
      countries,
      options.sortBy || state.sortBy,
      context
    );

    return countries.map((country) =>
      decorateCountry(country, context)
    );
  }

  function searchCountries(query, options = {}) {
    const searchQuery = String(query || "");

    if (options.persist !== false) {
      updateState(
        { searchQuery },
        "guide-search-changed"
      );
    }

    return getCountries({
      ...options,
      query: searchQuery
    });
  }

  function setFilter(name, value) {
    if (!(name in state.filters)) {
      throw new Error(`Unknown guide filter: ${name}`);
    }

    updateState(
      {
        filters: {
          ...state.filters,
          [name]: value || "all"
        }
      },
      "guide-filter-changed"
    );

    return getCountries();
  }

  function setFilters(filters = {}) {
    const next = { ...state.filters };

    Object.entries(safeObject(filters)).forEach(([key, value]) => {
      if (key in next) next[key] = value || "all";
    });

    updateState(
      { filters: next },
      "guide-filters-changed"
    );

    return getCountries();
  }

  function resetFilters() {
    updateState(
      {
        searchQuery: "",
        filters: clone(DEFAULT_STATE.filters),
        sortBy: DEFAULT_STATE.sortBy
      },
      "guide-filters-reset"
    );

    return getCountries();
  }

  function setSort(sortBy) {
    if (!VALID_SORTS.has(sortBy)) {
      throw new Error(`Unsupported guide sort: ${sortBy}`);
    }

    updateState(
      { sortBy },
      "guide-sort-changed"
    );

    return getCountries();
  }

  /* =======================================================
     Country details and calculations
     ======================================================= */

  function findCountry(identifier) {
    if (!countriesCache.length) buildCountriesCache();

    const code = normalizeCountryCode(identifier);

    if (code) {
      const byCode = countriesCache.find(
        (country) =>
          country.code === code ||
          country.iso2 === code ||
          country.id === identifier
      );

      if (byCode) return byCode;
    }

    const target = normalizeText(identifier);

    return (
      countriesCache.find(
        (country) =>
          normalizeText(country.id) === target ||
          country.aliases.some(
            (alias) => normalizeText(alias) === target
          )
      ) || null
    );
  }

  function getCountry(identifier) {
    const country = findCountry(identifier);
    if (!country) return null;

    return decorateCountry(country, buildContext());
  }

  function decorateCountry(country, context = buildContext()) {
    const visited = context.visitedCodes.includes(country.code);
    const wishlisted =
      context.wishlistCodes.includes(country.code);

    const relatedTrips = context.trips.filter(
      (trip) => countryCodeFromTrip(trip) === country.code
    );

    const plans = context.annualPlans.filter((plan) => {
      const source = safeObject(plan);
      return (
        normalizeCountryCode(
          source.countryCode ||
            source.code ||
            source.destination?.countryCode
        ) === country.code
      );
    });

    return {
      ...clone(country),
      visited,
      wishlisted,
      visitCount: relatedTrips.filter(tripIsCompleted).length,
      tripCount: relatedTrips.length,
      annualPlanCount: plans.length,
      recommendationScore: computeBaseRecommendationScore(
        country,
        context
      ),
      estimatedIdealTrip: estimateCountryTripCost(
        country,
        country.recommendedDays.ideal
      )
    };
  }

  function estimateCountryTripCost(
    countryOrIdentifier,
    days,
    travelers = 1,
    options = {}
  ) {
    const country =
      typeof countryOrIdentifier === "object"
        ? countryOrIdentifier
        : findCountry(countryOrIdentifier);

    if (!country) {
      return {
        currency: "AED",
        days: 0,
        travelers: 0,
        flightAED: 0,
        hotelAED: 0,
        dailyExpensesAED: 0,
        contingencyAED: 0,
        totalAED: 0
      };
    }

    const normalizedDays = Math.max(
      1,
      toNumber(days, country.recommendedDays.ideal)
    );

    const normalizedTravelers = Math.max(
      1,
      toNumber(travelers, 1)
    );

    const rooms = Math.max(
      1,
      toNumber(
        options.rooms,
        Math.ceil(normalizedTravelers / 2)
      )
    );

    const flightAED =
      country.budget.flightAED * normalizedTravelers;

    const hotelAED =
      country.budget.hotelNightAED *
      Math.max(0, normalizedDays - 1) *
      rooms;

    const dailyExpensesAED =
      country.budget.dailyAED *
      normalizedDays *
      normalizedTravelers;

    const subtotalAED =
      flightAED + hotelAED + dailyExpensesAED;

    const contingencyRate = clamp(
      toNumber(options.contingencyRate, 0.1),
      0,
      0.5
    );

    const contingencyAED = Math.round(
      subtotalAED * contingencyRate
    );

    return {
      currency: "AED",
      days: normalizedDays,
      nights: Math.max(0, normalizedDays - 1),
      travelers: normalizedTravelers,
      rooms,
      flightAED: Math.round(flightAED),
      hotelAED: Math.round(hotelAED),
      dailyExpensesAED: Math.round(dailyExpensesAED),
      contingencyAED,
      totalAED: Math.round(subtotalAED + contingencyAED)
    };
  }

  function getMonthWeather(countryOrIdentifier, month) {
    const country =
      typeof countryOrIdentifier === "object"
        ? countryOrIdentifier
        : findCountry(countryOrIdentifier);

    if (!country) return null;

    const monthNumber = clamp(toNumber(month, 1), 1, 12);
    const weather = country.temperatures[monthNumber] || null;

    return {
      month: monthNumber,
      ...weather,
      recommended: country.bestMonths.includes(monthNumber),
      avoid: country.monthsToAvoid.includes(monthNumber)
    };
  }

  function getBestTravelMonths(countryOrIdentifier, preference = {}) {
    const country =
      typeof countryOrIdentifier === "object"
        ? countryOrIdentifier
        : findCountry(countryOrIdentifier);

    if (!country) return [];

    const preferredWeather = normalizeText(
      preference.weather || preference.season || ""
    );

    const temperatures = Object.entries(
      country.temperatures
    ).map(([month, weather]) => ({
      month: Number(month),
      ...weather
    }));

    if (!temperatures.length) {
      return country.bestMonths;
    }

    const scored = temperatures.map((weather) => {
      let score = country.bestMonths.includes(weather.month)
        ? 25
        : 0;

      const average =
        weather.min !== null && weather.max !== null
          ? (weather.min + weather.max) / 2
          : null;

      if (average !== null) {
        if (
          preferredWeather.includes("بارد") ||
          preferredWeather.includes("شتاء")
        ) {
          score += clamp(25 - Math.abs(average - 12), 0, 25);
        } else if (
          preferredWeather.includes("معتدل") ||
          preferredWeather.includes("ربيع") ||
          preferredWeather.includes("خريف")
        ) {
          score += clamp(25 - Math.abs(average - 20), 0, 25);
        } else if (
          preferredWeather.includes("حار") ||
          preferredWeather.includes("صيف")
        ) {
          score += clamp(25 - Math.abs(average - 28), 0, 25);
        }
      }

      if (country.monthsToAvoid.includes(weather.month)) {
        score -= 30;
      }

      return {
        ...weather,
        score: Math.round(score)
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .map((item) => item.month);
  }

  function getCountryGuide(identifier, options = {}) {
    const country = getCountry(identifier);
    if (!country) return null;

    const days = Math.max(
      1,
      toNumber(
        options.days,
        country.recommendedDays.ideal
      )
    );

    const travelers = Math.max(
      1,
      toNumber(options.travelers, 1)
    );

    const month = options.month
      ? clamp(toNumber(options.month, 1), 1, 12)
      : null;

    const travelAI = getTravelAI();

    let aiInsights = null;

    try {
      aiInsights =
        travelAI?.analyzeCountry?.(country, {
          days,
          travelers,
          month,
          budget: options.budget,
          storeState: readStoreState()
        }) || null;
    } catch (error) {
      console.warn(
        `[${MODULE_NAME}] Travel AI analysis failed`,
        error
      );
    }

    return {
      country,
      tripParameters: {
        days,
        travelers,
        month,
        budget: toNumber(options.budget, 0)
      },
      cost: estimateCountryTripCost(
        country,
        days,
        travelers,
        options
      ),
      weather: month
        ? getMonthWeather(country, month)
        : null,
      bestMonths: getBestTravelMonths(
        country,
        options.preference
      ),
      cities: country.cities,
      hotels: country.hotels,
      attractions: country.attractions,
      beaches: country.beaches,
      halalRestaurants: country.halalRestaurants,
      shopping: country.shopping,
      experiences: country.experiences,
      aiInsights
    };
  }

  /* =======================================================
     Selection
     ======================================================= */

  function selectCountry(identifier, options = {}) {
    const country = getCountry(identifier);

    if (!country) {
      throw new Error(
        `Country "${identifier}" was not found in World Guide Data.`
      );
    }

    updateState(
      {
        selectedCountryCode: country.code
      },
      "guide-country-selected"
    );

    if (options.returnGuide === true) {
      return getCountryGuide(country.code, options);
    }

    return country;
  }

  function clearSelection() {
    updateState(
      { selectedCountryCode: null },
      "guide-country-selection-cleared"
    );
  }

  function getSelectedCountry() {
    return state.selectedCountryCode
      ? getCountry(state.selectedCountryCode)
      : null;
  }

  /* =======================================================
     Wishlist
     ======================================================= */

  function isWishlisted(identifier) {
    const country = findCountry(identifier);
    if (!country) return false;

    return getWishlistCountryCodes().includes(country.code);
  }

  function getWishlist() {
    const context = buildContext();

    return context.wishlistCodes
      .map((code) => findCountry(code))
      .filter(Boolean)
      .map((country) => decorateCountry(country, context));
  }

  async function addToWishlist(identifier, metadata = {}) {
    const country = getCountry(identifier);
    if (!country) {
      throw new Error("Country was not found.");
    }

    if (country.wishlisted) return country;

    const planner = getPlannerEngine();

    if (typeof planner?.addToWishlist === "function") {
      await planner.addToWishlist(country.code, metadata);
    } else {
      const payload = {
        id: makeId("wishlist"),
        countryCode: country.code,
        countryName: country.nameAr,
        addedAt: nowISO(),
        source: "guide",
        metadata: clone(metadata)
      };

      const actions = [
        "wishlist/add",
        "ADD_WISHLIST_ITEM",
        "guide/addWishlist",
        "addWishlist"
      ];

      let completed = false;
      let lastError = null;

      for (const action of actions) {
        try {
          await dispatchStoreAction(action, payload);
          completed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!completed) {
        throw lastError || new Error("Could not add wishlist item.");
      }
    }

    await refresh({
      preserveSelection: true,
      reason: "wishlist-add"
    });

    emit("guide-wishlist-added", {
      countryCode: country.code
    });

    return getCountry(country.code);
  }

  async function removeFromWishlist(identifier) {
    const country = getCountry(identifier);
    if (!country) {
      throw new Error("Country was not found.");
    }

    if (!country.wishlisted) return country;

    const planner = getPlannerEngine();

    if (typeof planner?.removeFromWishlist === "function") {
      await planner.removeFromWishlist(country.code);
    } else {
      const payload = {
        countryCode: country.code
      };

      const actions = [
        "wishlist/remove",
        "REMOVE_WISHLIST_ITEM",
        "guide/removeWishlist",
        "removeWishlist"
      ];

      let completed = false;
      let lastError = null;

      for (const action of actions) {
        try {
          await dispatchStoreAction(action, payload);
          completed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!completed) {
        throw lastError || new Error("Could not remove wishlist item.");
      }
    }

    await refresh({
      preserveSelection: true,
      reason: "wishlist-remove"
    });

    emit("guide-wishlist-removed", {
      countryCode: country.code
    });

    return getCountry(country.code);
  }

  async function toggleWishlist(identifier, metadata = {}) {
    return isWishlisted(identifier)
      ? removeFromWishlist(identifier)
      : addToWishlist(identifier, metadata);
  }

  /* =======================================================
     Annual planning and trip creation
     ======================================================= */

  async function addToAnnualPlan(identifier, plan = {}) {
    const country = getCountry(identifier);
    if (!country) {
      throw new Error("Country was not found.");
    }

    const payload = {
      id: plan.id || makeId("annual_plan"),
      countryCode: country.code,
      countryName: country.nameAr,
      year:
        toNumber(plan.year, new Date().getFullYear()) ||
        new Date().getFullYear(),
      month: plan.month
        ? clamp(toNumber(plan.month, 1), 1, 12)
        : null,
      days: Math.max(
        1,
        toNumber(plan.days, country.recommendedDays.ideal)
      ),
      travelers: Math.max(
        1,
        toNumber(plan.travelers, 1)
      ),
      budgetAED: Math.max(
        0,
        toNumber(plan.budgetAED || plan.budget, 0)
      ),
      status: plan.status || "idea",
      source: "guide",
      createdAt: plan.createdAt || nowISO(),
      updatedAt: nowISO(),
      notes: plan.notes || ""
    };

    const planner = getPlannerEngine();

    if (typeof planner?.addToAnnualPlan === "function") {
      await planner.addToAnnualPlan(payload);
    } else {
      const actions = [
        "annualPlans/add",
        "ADD_ANNUAL_PLAN",
        "guide/addAnnualPlan",
        "addAnnualPlan"
      ];

      let completed = false;
      let lastError = null;

      for (const action of actions) {
        try {
          await dispatchStoreAction(action, payload);
          completed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!completed) {
        throw lastError || new Error("Could not save annual plan.");
      }
    }

    await refresh({
      preserveSelection: true,
      reason: "annual-plan-add"
    });

    emit("guide-annual-plan-added", {
      countryCode: country.code,
      plan: payload
    });

    return payload;
  }

  async function createTripDraft(identifier, tripOptions = {}) {
    const country = getCountry(identifier);
    if (!country) {
      throw new Error("Country was not found.");
    }

    const days = Math.max(
      1,
      toNumber(
        tripOptions.days,
        country.recommendedDays.ideal
      )
    );

    const travelers = Math.max(
      1,
      toNumber(tripOptions.travelers, 1)
    );

    const cost = estimateCountryTripCost(
      country,
      days,
      travelers,
      tripOptions
    );

    const payload = {
      id: tripOptions.id || makeId("trip"),
      title:
        tripOptions.title ||
        `رحلة ${country.nameAr}`,
      countryCode: country.code,
      country: country.nameAr,
      destinationCountry: country.nameAr,
      city:
        tripOptions.city ||
        country.cities[0]?.nameAr ||
        "",
      status: tripOptions.status || "planned",
      planningStatus:
        tripOptions.planningStatus || "draft",
      startDate: tripOptions.startDate || null,
      endDate: tripOptions.endDate || null,
      days,
      travelers,
      budget: Math.max(
        0,
        toNumber(
          tripOptions.budget ??
            tripOptions.budgetAED,
          cost.totalAED
        )
      ),
      currency: "AED",
      source: "guide",
      guideCountryCode: country.code,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      notes: tripOptions.notes || "",
      checklist: {
        flightBooked:
          tripOptions.checklist?.flightBooked === true,
        hotelBooked:
          tripOptions.checklist?.hotelBooked === true,
        documentsReady:
          tripOptions.checklist?.documentsReady === true
      }
    };

    const planner = getPlannerEngine();

    if (typeof planner?.createTripDraft === "function") {
      await planner.createTripDraft(payload);
    } else {
      const actions = [
        "trips/add",
        "ADD_TRIP",
        "trip/add",
        "addTrip"
      ];

      let completed = false;
      let lastError = null;

      for (const action of actions) {
        try {
          await dispatchStoreAction(action, payload);
          completed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!completed) {
        throw lastError || new Error("Could not create trip draft.");
      }
    }

    emit("guide-trip-draft-created", {
      countryCode: country.code,
      trip: payload
    });

    return payload;
  }

  /* =======================================================
     Recommendations
     ======================================================= */

  function getFallbackRecommendations(options = {}) {
    const context = buildContext();

    const limit = clamp(
      toNumber(options.limit, 6),
      1,
      30
    );

    const includeVisited =
      options.includeVisited === true;

    return countriesCache
      .filter(
        (country) =>
          includeVisited ||
          !context.visitedCodes.includes(country.code)
      )
      .map((country) => ({
        country: decorateCountry(country, context),
        score: computeBaseRecommendationScore(
          country,
          context
        ),
        reasons: buildRecommendationReasons(
          country,
          context
        )
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.country.nameAr.localeCompare(
            b.country.nameAr,
            "ar"
          )
      )
      .slice(0, limit);
  }

  function buildRecommendationReasons(country, context) {
    const reasons = [];

    if (context.wishlistCodes.includes(country.code)) {
      reasons.push("موجودة في قائمة أمنياتك");
    }

    if (country.familyFriendly) {
      reasons.push("مناسبة للعائلات");
    }

    if (country.halal?.friendly === true) {
      reasons.push("خيارات الحلال متوفرة");
    }

    if (
      country.shattafAvailability === "high" ||
      country.shattafAvailability === "common"
    ) {
      reasons.push("توفر الشطاف جيد");
    }

    const style = context.profile.travelStyle;
    if (style && matchesTravelStyle(country, style)) {
      reasons.push("تناسب أسلوب سفرك");
    }

    const availableBudget =
      context.budget.availableTravelBudget ||
      context.budget.savedAmount;

    const estimated = estimateCountryTripCost(
      country,
      country.recommendedDays.ideal
    ).totalAED;

    if (
      availableBudget > 0 &&
      estimated > 0 &&
      estimated <= availableBudget
    ) {
      reasons.push("تناسب ميزانيتك الحالية");
    }

    if (!context.visitedCodes.includes(country.code)) {
      reasons.push("وجهة جديدة عليك");
    }

    return reasons.slice(0, 4);
  }

  async function getRecommendations(options = {}) {
    if (!countriesCache.length) buildCountriesCache();

    const travelAI = getTravelAI();

    if (
      travelAI &&
      typeof travelAI.getRecommendations === "function"
    ) {
      try {
        const result = await Promise.resolve(
          travelAI.getRecommendations({
            countries: countriesCache.map(clone),
            storeState: readStoreState(),
            options: clone(options)
          })
        );

        if (Array.isArray(result) && result.length) {
          return result;
        }
      } catch (error) {
        console.warn(
          `[${MODULE_NAME}] Travel AI recommendations failed`,
          error
        );
      }
    }

    return getFallbackRecommendations(options);
  }

  /* =======================================================
     Summary and analytics
     ======================================================= */

  function getVisitedCountries() {
    const context = buildContext();

    return context.visitedCodes
      .map((code) => findCountry(code))
      .filter(Boolean)
      .map((country) => decorateCountry(country, context));
  }

  function isVisited(identifier) {
    const country = findCountry(identifier);
    if (!country) return false;

    return getVisitedCountryCodes().includes(country.code);
  }

  function getContinentsSummary() {
    const context = buildContext();

    const map = new Map(
      CONTINENT_ORDER.map((continent) => [
        continent,
        {
          continent,
          total: 0,
          visited: 0,
          wishlist: 0
        }
      ])
    );

    countriesCache.forEach((country) => {
      const continent = country.continent || "Other";

      if (!map.has(continent)) {
        map.set(continent, {
          continent,
          total: 0,
          visited: 0,
          wishlist: 0
        });
      }

      const entry = map.get(continent);
      entry.total += 1;

      if (context.visitedCodes.includes(country.code)) {
        entry.visited += 1;
      }

      if (context.wishlistCodes.includes(country.code)) {
        entry.wishlist += 1;
      }
    });

    return [...map.values()].filter(
      (entry) => entry.total > 0
    );
  }

  function getSummary() {
    if (!countriesCache.length) buildCountriesCache();

    const context = buildContext();
    const selectedCountry = getSelectedCountry();

    return {
      version: VERSION,
      totalCountries: countriesCache.length,
      visitedCountries: context.visitedCodes.length,
      wishlistCountries: context.wishlistCodes.length,
      annualPlans: context.annualPlans.length,
      completedTrips: context.trips.filter(tripIsCompleted).length,
      totalTrips: context.trips.length,
      selectedCountry,
      continents: getContinentsSummary(),
      budget: context.budget,
      profile: context.profile,
      filters: clone(state.filters),
      searchQuery: state.searchQuery,
      sortBy: state.sortBy,
      lastUpdatedAt: state.lastUpdatedAt
    };
  }

  function getState() {
    return {
      ...clone(state),
      selectedCountry: getSelectedCountry(),
      summary: getSummary()
    };
  }

  /* =======================================================
     Lifecycle
     ======================================================= */

  async function refresh(options = {}) {
    const previousSelection = state.selectedCountryCode;

    buildCountriesCache();

    if (
      options.preserveSelection !== false &&
      previousSelection &&
      findCountry(previousSelection)
    ) {
      state.selectedCountryCode = previousSelection;
    } else if (
      previousSelection &&
      !findCountry(previousSelection)
    ) {
      state.selectedCountryCode = null;
    }

    state.lastUpdatedAt = nowISO();
    persistLocalState();

    if (options.silent !== true) {
      emit("guide-engine-refreshed", {
        reason: options.reason || "manual",
        totalCountries: countriesCache.length
      });
    }

    return getState();
  }

  async function init(options = {}) {
    if (state.initialized && options.force !== true) {
      return getState();
    }

    if (initializedPromise && options.force !== true) {
      return initializedPromise;
    }

    initializedPromise = (async () => {
      restoreLocalState();
      buildCountriesCache();
      subscribeToStore();

      state = {
        ...state,
        initialized: true,
        lastUpdatedAt: nowISO()
      };

      persistLocalState();

      emit("guide-engine-ready", {
        totalCountries: countriesCache.length,
        hasStore: Boolean(getStore()),
        hasWorldData: Boolean(getWorldDataModule()),
        hasTravelAI: Boolean(getTravelAI()),
        hasPlannerEngine: Boolean(getPlannerEngine())
      });

      return getState();
    })();

    try {
      return await initializedPromise;
    } finally {
      initializedPromise = null;
    }
  }

  function destroy() {
    if (typeof storeUnsubscribe === "function") {
      storeUnsubscribe();
    }

    storeUnsubscribe = null;
    listeners.clear();

    state = {
      ...clone(DEFAULT_STATE),
      initialized: false
    };

    countriesCache = [];
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("GuideEngine subscriber must be a function.");
    }

    listeners.add(listener);

    if (options.immediate === true) {
      listener(
        {
          type: "guide-engine-snapshot",
          module: MODULE_NAME,
          version: VERSION,
          timestamp: nowISO(),
          detail: {}
        },
        getState()
      );
    }

    return () => listeners.delete(listener);
  }

  /* =======================================================
     Public API
     ======================================================= */

  const GuideEngine = Object.freeze({
    VERSION,

    init,
    refresh,
    destroy,
    subscribe,

    getState,
    getSummary,
    getCountries,
    searchCountries,

    setFilter,
    setFilters,
    resetFilters,
    setSort,

    getCountry,
    selectCountry,
    clearSelection,
    getSelectedCountry,
    getCountryGuide,

    estimateCountryTripCost,
    getMonthWeather,
    getBestTravelMonths,

    getVisitedCountries,
    isVisited,

    getWishlist,
    isWishlisted,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,

    addToAnnualPlan,
    createTripDraft,

    getRecommendations,
    getContinentsSummary
  });

  global.GuideEngine = GuideEngine;

  // Optional CommonJS export for automated tests.
  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = GuideEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
