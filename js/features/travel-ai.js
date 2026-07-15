/* =========================================================
   Travel Intelligence Center
   Travel AI Engine V4.0.0

   File Path:
   js/features/travel-ai.js

   Purpose:
   - Intelligence layer for the rebuilt Guide platform.
   - Learns from Trips, Passport, Wishlist, Profile and Budget.
   - Produces Travel DNA, country matches, reasons, warnings,
     seasonal advice, hotel suggestions and daily itineraries.
   - Works with GuideEngine and the future PlannerEngine.
   - Never owns duplicate trip or country data.
   - Uses deterministic scoring so results stay explainable.

   Public API:
   - TravelAI.init()
   - TravelAI.refresh()
   - TravelAI.getTravelDNA()
   - TravelAI.getRecommendations()
   - TravelAI.analyzeCountry()
   - TravelAI.rankCountries()
   - TravelAI.getBestMonths()
   - TravelAI.getBudgetFit()
   - TravelAI.getHotelRecommendations()
   - TravelAI.generateItinerary()
   - TravelAI.getDestinationAlternatives()
   - TravelAI.subscribe()
   - TravelAI.destroy()
   ========================================================= */

(function travelAIModule(global) {
  "use strict";

  const VERSION = "4.0.0";
  const MODULE_NAME = "TravelAI";

  const listeners = new Set();

  let initialized = false;
  let storeUnsubscribe = null;
  let lastSnapshot = null;

  const DEFAULT_WEIGHTS = Object.freeze({
    travelStyle: 18,
    climate: 14,
    budget: 18,
    duration: 10,
    family: 8,
    halal: 7,
    shattaf: 7,
    beach: 6,
    city: 4,
    novelty: 5,
    wishlist: 8,
    repeatPreference: 4,
    season: 8,
    flightTime: 5
  });

  const STYLE_DICTIONARY = Object.freeze({
    premium: [
      "premium",
      "luxury",
      "فاخر",
      "فخم",
      "فخامة",
      "منتجع",
      "villa",
      "pool villa"
    ],
    family: [
      "family",
      "عائلي",
      "عائلة",
      "اطفال",
      "أطفال"
    ],
    beach: [
      "beach",
      "sea",
      "coast",
      "شاطئ",
      "بحر",
      "ساحل",
      "جزيرة"
    ],
    nature: [
      "nature",
      "mountain",
      "lake",
      "forest",
      "طبيعة",
      "جبال",
      "بحيرات",
      "غابات"
    ],
    city: [
      "city",
      "urban",
      "shopping",
      "مدينة",
      "مدن",
      "تسوق",
      "مول"
    ],
    culture: [
      "culture",
      "history",
      "museum",
      "heritage",
      "ثقافة",
      "تاريخ",
      "متاحف",
      "تراث"
    ],
    adventure: [
      "adventure",
      "hiking",
      "ski",
      "تزلج",
      "مغامرة",
      "هايكنج"
    ],
    relaxation: [
      "relax",
      "spa",
      "quiet",
      "هدوء",
      "استرخاء",
      "سبا",
      "خصوصية"
    ],
    halal: [
      "halal",
      "muslim",
      "حلال",
      "مسلم"
    ]
  });

  const CLIMATE_DICTIONARY = Object.freeze({
    cold: [
      "cold",
      "cool",
      "snow",
      "winter",
      "بارد",
      "ثلج",
      "شتاء"
    ],
    mild: [
      "mild",
      "spring",
      "autumn",
      "fall",
      "معتدل",
      "ربيع",
      "خريف"
    ],
    warm: [
      "warm",
      "summer",
      "sun",
      "حار",
      "دافئ",
      "صيف",
      "شمس"
    ]
  });

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

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function unique(values) {
    return [...new Set(safeArray(values).filter(Boolean))];
  }

  function nowISO() {
    return new Date().toISOString();
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

  function average(values, fallback = 0) {
    const valid = safeArray(values)
      .map((value) => Number(value))
      .filter(Number.isFinite);

    if (!valid.length) return fallback;

    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function median(values, fallback = 0) {
    const valid = safeArray(values)
      .map((value) => Number(value))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (!valid.length) return fallback;

    const middle = Math.floor(valid.length / 2);

    return valid.length % 2
      ? valid[middle]
      : (valid[middle - 1] + valid[middle]) / 2;
  }

  function countBy(values) {
    return safeArray(values).reduce((map, value) => {
      const key = String(value || "").trim();
      if (!key) return map;
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
  }

  function topEntries(counts, limit = 5) {
    return Object.entries(safeObject(counts))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));
  }

  function includesAny(text, words) {
    const normalized = normalizeText(text);

    return safeArray(words).some((word) =>
      normalized.includes(normalizeText(word))
    );
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
        listener(event, clone(lastSnapshot));
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
      // CustomEvent may not exist in test environments.
    }

    return event;
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

  function getGuideEngine() {
    return global.GuideEngine || null;
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
        // Try next compatible Store API.
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

    const handler = () => refresh({ reason: "store-update" });

    const methods = [
      () => store.subscribe?.(handler),
      () => store.onChange?.(handler),
      () => store.listen?.(handler)
    ];

    for (const subscribe of methods) {
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

  /* =======================================================
     Store extraction
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

  function extractProfile(rootState = readStoreState()) {
    return {
      ...safeObject(rootState.profile),
      ...safeObject(rootState.user?.profile),
      ...safeObject(rootState.settings?.profile)
    };
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

  function extractPassport(rootState = readStoreState()) {
    return (
      rootState.passport ||
      rootState.travelPassport ||
      rootState.profile?.passport ||
      rootState.travel?.passport ||
      {}
    );
  }

  function extractBudget(rootState = readStoreState()) {
    const profile = extractProfile(rootState);

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
      savedAmount: toNumber(
        savings.savedAmount ??
          savings.balance ??
          savings.total,
        0
      ),
      monthlySaving: toNumber(
        savings.monthlySaving ??
          savings.monthly ??
          profile.monthlySaving,
        0
      ),
      currency: budget.currency || profile.currency || "AED"
    };
  }

  function tripIsCompleted(trip) {
    const source = safeObject(trip);
    const status = normalizeText(source.status);

    if (
      [
        "completed",
        "done",
        "finished",
        "مكتمله",
        "مكتملة",
        "منتهيه",
        "منتهية"
      ].includes(status)
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

  function tripCountryCode(trip) {
    const source = safeObject(trip);

    const explicit = normalizeCountryCode(
      source.countryCode ||
        source.destinationCountryCode ||
        source.destination?.countryCode ||
        source.country?.code ||
        source.iso2
    );

    if (explicit) return explicit;

    const guide = getGuideEngine();

    if (guide?.getCountry) {
      const names = [
        source.country,
        source.destinationCountry,
        source.destination?.country,
        source.location?.country
      ];

      for (const name of names) {
        if (!name) continue;

        const country = guide.getCountry(name);

        if (country?.code) return country.code;
      }
    }

    return null;
  }

  function tripDays(trip) {
    const source = safeObject(trip);

    const explicit = toNumber(
      source.days ??
        source.durationDays ??
        source.duration,
      0
    );

    if (explicit > 0) return explicit;

    const start =
      source.startDate ||
      source.departureDate ||
      source.dates?.start;

    const end =
      source.endDate ||
      source.returnDate ||
      source.dates?.end;

    if (!start || !end) return 0;

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return 0;
    }

    return Math.max(
      1,
      Math.round((endTime - startTime) / 86400000) + 1
    );
  }

  function tripBudget(trip) {
    const source = safeObject(trip);

    return toNumber(
      source.actualCost ??
        source.totalCost ??
        source.spent ??
        source.budget ??
        source.estimatedCost,
      0
    );
  }

  function tripMonth(trip) {
    const source = safeObject(trip);

    const date =
      source.startDate ||
      source.departureDate ||
      source.dates?.start ||
      source.dateFrom;

    if (!date) return null;

    const parsed = new Date(date);

    return Number.isFinite(parsed.getTime())
      ? parsed.getMonth() + 1
      : null;
  }

  function tripTags(trip) {
    const source = safeObject(trip);

    return unique([
      ...safeArray(source.tags),
      ...safeArray(source.travelStyles),
      ...safeArray(source.preferences),
      source.travelStyle,
      source.tripType,
      source.category,
      source.hotel?.type,
      source.hotel?.name,
      source.notes
    ]);
  }

  function tripCities(trip) {
    const source = safeObject(trip);

    return unique([
      ...safeArray(source.cities),
      source.city,
      source.destinationCity,
      source.destination?.city,
      ...safeArray(source.itinerary?.cities)
    ]);
  }

  function passportCountryCodes(rootState = readStoreState()) {
    const passport = extractPassport(rootState);

    const lists = [
      passport.countries,
      passport.visitedCountries,
      passport.history,
      passport.stamps,
      passport.entries
    ];

    return unique(
      lists
        .flatMap((list) => safeArray(list))
        .map((item) => {
          if (typeof item === "string") return item;

          const source = safeObject(item);

          return (
            source.countryCode ||
            source.code ||
            source.iso2 ||
            source.country
          );
        })
        .map(normalizeCountryCode)
        .filter(Boolean)
    );
  }

  function wishlistCountryCodes(rootState = readStoreState()) {
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

  /* =======================================================
     Travel DNA
     ======================================================= */

  function classifyStyles(texts) {
    const joined = safeArray(texts).join(" ");

    return Object.entries(STYLE_DICTIONARY).reduce(
      (result, [style, words]) => {
        const matches = words.reduce(
          (count, word) =>
            count +
            (includesAny(joined, [word]) ? 1 : 0),
          0
        );

        if (matches > 0) result[style] = matches;

        return result;
      },
      {}
    );
  }

  function classifyClimate(texts) {
    const joined = safeArray(texts).join(" ");

    return Object.entries(CLIMATE_DICTIONARY).reduce(
      (result, [climate, words]) => {
        const matches = words.reduce(
          (count, word) =>
            count +
            (includesAny(joined, [word]) ? 1 : 0),
          0
        );

        if (matches > 0) result[climate] = matches;

        return result;
      },
      {}
    );
  }

  function inferTravelDNA(rootState = readStoreState()) {
    const trips = extractTrips(rootState);
    const completedTrips = trips.filter(tripIsCompleted);
    const profile = extractProfile(rootState);
    const budget = extractBudget(rootState);
    const passportCodes = passportCountryCodes(rootState);
    const wishlistCodes = wishlistCountryCodes(rootState);

    const days = completedTrips.map(tripDays).filter(Boolean);
    const budgets = completedTrips.map(tripBudget).filter(Boolean);
    const months = completedTrips.map(tripMonth).filter(Boolean);
    const countries = completedTrips
      .map(tripCountryCode)
      .filter(Boolean);

    const allTags = completedTrips.flatMap(tripTags);
    const allCities = completedTrips.flatMap(tripCities);

    const styleCounts = classifyStyles([
      profile.travelStyle,
      ...safeArray(profile.preferences),
      ...allTags
    ]);

    const climateCounts = classifyClimate([
      profile.preferredClimate,
      profile.travelStyle,
      ...safeArray(profile.preferences),
      ...allTags
    ]);

    if (profile.familyTravel === true) {
      styleCounts.family = (styleCounts.family || 0) + 3;
    }

    if (profile.halalPreference !== false) {
      styleCounts.halal = (styleCounts.halal || 0) + 2;
    }

    if (
      profile.shattafRequired === true ||
      profile.requiresShattaf === true
    ) {
      styleCounts.shattaf = 3;
    }

    const topStyles = topEntries(styleCounts, 6);
    const topClimates = topEntries(climateCounts, 3);
    const topMonths = topEntries(countBy(months), 6);
    const topCountries = topEntries(countBy(countries), 8);
    const topCities = topEntries(countBy(allCities), 8);

    const preferredDays = Math.round(
      median(
        days,
        toNumber(profile.preferredTripDays, 7)
      )
    );

    const averageTripBudget = Math.round(
      average(
        budgets,
        budget.availableTravelBudget ||
          budget.annualTravelBudget / 2 ||
          12000
      )
    );

    const travelStyle =
      topStyles[0]?.value ||
      normalizeText(profile.travelStyle) ||
      "balanced";

    const preferredClimate =
      topClimates[0]?.value ||
      normalizeText(profile.preferredClimate) ||
      "mild";

    const beachPreference =
      (styleCounts.beach || 0) +
      (styleCounts.relaxation || 0) >
      0;

    const naturePreference =
      (styleCounts.nature || 0) +
      (styleCounts.adventure || 0) >
      0;

    const cityPreference =
      (styleCounts.city || 0) +
      (styleCounts.culture || 0) >
      0;

    return {
      generatedAt: nowISO(),
      source: {
        totalTrips: trips.length,
        completedTrips: completedTrips.length,
        passportCountries: passportCodes.length,
        wishlistCountries: wishlistCodes.length
      },
      travelStyle,
      preferredStyles: topStyles,
      preferredClimate,
      climatePreferences: topClimates,
      preferredTripDays: preferredDays || 7,
      averageTripBudgetAED: averageTripBudget || 12000,
      preferredMonths: topMonths.map((item) => Number(item.value)),
      mostVisitedCountries: topCountries,
      favoriteCities: topCities,
      familyFriendlyRequired:
        profile.familyTravel !== false,
      halalRequired:
        profile.halalPreference !== false,
      shattafRequired:
        profile.shattafRequired === true ||
        profile.requiresShattaf === true ||
        true,
      beachPreference,
      naturePreference,
      cityPreference,
      premiumPreference:
        travelStyle === "premium" ||
        (styleCounts.premium || 0) > 0,
      quietPreference:
        profile.quietPreference !== false &&
        ((styleCounts.relaxation || 0) > 0 ||
          includesAny(profile.travelStyle, [
            "quiet",
            "هدوء",
            "premium",
            "فاخر"
          ])),
      budget,
      profile: {
        currency: profile.currency || "AED",
        homeAirport:
          profile.homeAirport ||
          profile.departureAirport ||
          "Abu Dhabi",
        travelStyle: profile.travelStyle || "",
        preferredClimate:
          profile.preferredClimate || "",
        preferredTripDays:
          toNumber(profile.preferredTripDays, 0)
      }
    };
  }

  function getTravelDNA(options = {}) {
    const dna = inferTravelDNA(options.storeState || readStoreState());

    lastSnapshot = {
      ...(lastSnapshot || {}),
      dna
    };

    return clone(dna);
  }

  /* =======================================================
     Country scoring
     ======================================================= */

  function getCountryTags(country) {
    return unique([
      ...safeArray(country.tags),
      ...safeArray(country.travelStyles),
      ...safeArray(country.seasons),
      ...safeArray(country.experiences).map((item) =>
        typeof item === "string"
          ? item
          : safeObject(item).name ||
            safeObject(item).title
      ),
      ...safeArray(country.beaches).map((item) =>
        typeof item === "string"
          ? item
          : safeObject(item).name ||
            safeObject(item).title
      )
    ]);
  }

  function countryMatchesStyle(country, style) {
    const tags = getCountryTags(country).join(" ");

    return includesAny(
      tags,
      STYLE_DICTIONARY[style] || [style]
    );
  }

  function countryMatchesClimate(country, climate) {
    const tags = [
      ...safeArray(country.tags),
      ...safeArray(country.seasons)
    ].join(" ");

    return includesAny(
      tags,
      CLIMATE_DICTIONARY[climate] || [climate]
    );
  }

  function getAvailableBudget(dna, options = {}) {
    return Math.max(
      0,
      toNumber(
        options.budget ??
          options.budgetAED ??
          dna.budget.availableTravelBudget ??
          dna.budget.savedAmount ??
          dna.averageTripBudgetAED,
        dna.averageTripBudgetAED
      )
    );
  }

  function estimateCost(country, options = {}) {
    const guide = getGuideEngine();

    if (guide?.estimateCountryTripCost) {
      return guide.estimateCountryTripCost(
        country,
        options.days || country.recommendedDays?.ideal || 7,
        options.travelers || 1,
        options
      );
    }

    const days = Math.max(
      1,
      toNumber(
        options.days,
        country.recommendedDays?.ideal || 7
      )
    );

    const travelers = Math.max(
      1,
      toNumber(options.travelers, 1)
    );

    const flight =
      toNumber(country.budget?.flightAED, 0) * travelers;

    const hotel =
      toNumber(country.budget?.hotelNightAED, 0) *
      Math.max(0, days - 1);

    const daily =
      toNumber(country.budget?.dailyAED, 0) *
      days *
      travelers;

    const subtotal = flight + hotel + daily;

    return {
      currency: "AED",
      days,
      travelers,
      flightAED: Math.round(flight),
      hotelAED: Math.round(hotel),
      dailyExpensesAED: Math.round(daily),
      contingencyAED: Math.round(subtotal * 0.1),
      totalAED: Math.round(subtotal * 1.1)
    };
  }

  function getBudgetFit(country, options = {}) {
    const dna = options.dna || getTravelDNA();
    const availableBudget = getAvailableBudget(dna, options);
    const estimate = estimateCost(country, options);
    const total = estimate.totalAED || 0;

    if (!availableBudget || !total) {
      return {
        status: "unknown",
        score: 50,
        availableBudgetAED: availableBudget,
        estimatedCostAED: total,
        differenceAED: availableBudget - total,
        ratio: null,
        label: "لا توجد بيانات كافية"
      };
    }

    const ratio = total / availableBudget;
    let status;
    let score;
    let label;

    if (ratio <= 0.7) {
      status = "excellent";
      score = 100;
      label = "أقل من ميزانيتك بشكل مريح";
    } else if (ratio <= 0.9) {
      status = "good";
      score = 90;
      label = "مناسبة جداً لميزانيتك";
    } else if (ratio <= 1) {
      status = "tight";
      score = 75;
      label = "تناسب ميزانيتك مع هامش بسيط";
    } else if (ratio <= 1.15) {
      status = "slightly-over";
      score = 55;
      label = "أعلى قليلاً من ميزانيتك";
    } else if (ratio <= 1.35) {
      status = "over";
      score = 35;
      label = "تحتاج ميزانية إضافية";
    } else {
      status = "far-over";
      score = 15;
      label = "أعلى بكثير من ميزانيتك";
    }

    return {
      status,
      score,
      availableBudgetAED: Math.round(availableBudget),
      estimatedCostAED: Math.round(total),
      differenceAED: Math.round(availableBudget - total),
      ratio: Number(ratio.toFixed(2)),
      label,
      estimate
    };
  }

  function getDurationFit(country, dna, options = {}) {
    const desired = Math.max(
      1,
      toNumber(
        options.days,
        dna.preferredTripDays || 7
      )
    );

    const ideal = Math.max(
      1,
      toNumber(
        country.recommendedDays?.ideal,
        desired
      )
    );

    const difference = Math.abs(desired - ideal);

    return {
      desiredDays: desired,
      idealDays: ideal,
      score: clamp(100 - difference * 12, 20, 100)
    };
  }

  function getSeasonFit(country, dna, options = {}) {
    const month = toNumber(options.month, 0);

    if (!month) {
      const preferredMonths = safeArray(dna.preferredMonths);

      if (!preferredMonths.length) {
        return {
          score: 70,
          month: null,
          status: "neutral"
        };
      }

      const matches = preferredMonths.some((preferredMonth) =>
        safeArray(country.bestMonths).includes(preferredMonth)
      );

      return {
        score: matches ? 95 : 65,
        month: null,
        status: matches ? "preferred" : "neutral"
      };
    }

    const bestMonths = safeArray(country.bestMonths);
    const avoidMonths = safeArray(country.monthsToAvoid);

    if (bestMonths.includes(month)) {
      return {
        score: 100,
        month,
        status: "best"
      };
    }

    if (avoidMonths.includes(month)) {
      return {
        score: 20,
        month,
        status: "avoid"
      };
    }

    return {
      score: 65,
      month,
      status: "acceptable"
    };
  }

  function getStyleFit(country, dna) {
    const styles = safeArray(dna.preferredStyles);

    if (!styles.length) {
      return {
        score: 70,
        matches: []
      };
    }

    let weightedMatches = 0;
    let weightedTotal = 0;
    const matches = [];

    styles.forEach((item, index) => {
      const weight = Math.max(1, styles.length - index);
      weightedTotal += weight;

      if (countryMatchesStyle(country, item.value)) {
        weightedMatches += weight;
        matches.push(item.value);
      }
    });

    return {
      score:
        weightedTotal > 0
          ? Math.round(
              45 + (weightedMatches / weightedTotal) * 55
            )
          : 70,
      matches
    };
  }

  function getClimateFit(country, dna) {
    const climate =
      dna.preferredClimate ||
      dna.climatePreferences?.[0]?.value;

    if (!climate) {
      return {
        score: 70,
        climate: null,
        matched: false
      };
    }

    const matched = countryMatchesClimate(country, climate);

    return {
      score: matched ? 95 : 60,
      climate,
      matched
    };
  }

  function getAmenityFit(country, dna) {
    const checks = [];

    if (dna.familyFriendlyRequired) {
      checks.push({
        key: "family",
        passed: country.familyFriendly !== false
      });
    }

    if (dna.halalRequired) {
      checks.push({
        key: "halal",
        passed:
          country.halal?.friendly === true ||
          country.halal?.availability === "high" ||
          country.halalFriendly === true
      });
    }

    if (dna.shattafRequired) {
      checks.push({
        key: "shattaf",
        passed: [
          "high",
          "common",
          "good",
          "widely-available"
        ].includes(
          normalizeText(country.shattafAvailability)
        )
      });
    }

    if (!checks.length) {
      return {
        score: 70,
        checks
      };
    }

    const passed = checks.filter((check) => check.passed).length;

    return {
      score: Math.round(
        40 + (passed / checks.length) * 60
      ),
      checks
    };
  }

  function getNoveltyFit(country, context) {
    const visited = context.visitedCodes.includes(country.code);

    return {
      visited,
      score: visited ? 55 : 100
    };
  }

  function getFlightFit(country, options = {}) {
    const maxPreferredHours = toNumber(
      options.maxFlightHours,
      10
    );

    const hours = toNumber(
      country.flightDurationFromAbuDhabiHours,
      0
    );

    if (!hours) {
      return {
        score: 70,
        hours: null
      };
    }

    const difference = Math.max(0, hours - maxPreferredHours);

    return {
      score: clamp(100 - difference * 8, 30, 100),
      hours
    };
  }

  function buildContext(rootState = readStoreState()) {
    const trips = extractTrips(rootState);

    return {
      rootState,
      trips,
      completedTrips: trips.filter(tripIsCompleted),
      visitedCodes: unique([
        ...passportCountryCodes(rootState),
        ...trips
          .filter(tripIsCompleted)
          .map(tripCountryCode)
          .filter(Boolean)
      ]),
      wishlistCodes: wishlistCountryCodes(rootState),
      profile: extractProfile(rootState),
      budget: extractBudget(rootState)
    };
  }

  function scoreCountry(country, options = {}) {
    const rootState = options.storeState || readStoreState();
    const dna = options.dna || inferTravelDNA(rootState);
    const context = options.context || buildContext(rootState);
    const weights = {
      ...DEFAULT_WEIGHTS,
      ...safeObject(options.weights)
    };

    const styleFit = getStyleFit(country, dna);
    const climateFit = getClimateFit(country, dna);
    const budgetFit = getBudgetFit(country, {
      ...options,
      dna
    });
    const durationFit = getDurationFit(country, dna, options);
    const seasonFit = getSeasonFit(country, dna, options);
    const amenityFit = getAmenityFit(country, dna);
    const noveltyFit = getNoveltyFit(country, context);
    const flightFit = getFlightFit(country, options);

    const wishlistBoost = context.wishlistCodes.includes(country.code)
      ? 100
      : 0;

    const repeatBoost = context.visitedCodes.includes(country.code)
      ? 70
      : 0;

    const beachFit = dna.beachPreference
      ? countryMatchesStyle(country, "beach")
        ? 100
        : 45
      : 70;

    const cityFit = dna.cityPreference
      ? countryMatchesStyle(country, "city") ||
        countryMatchesStyle(country, "culture")
        ? 100
        : 50
      : 70;

    const familyScore = country.familyFriendly !== false ? 100 : 35;

    const halalScore =
      country.halal?.friendly === true ||
      country.halal?.availability === "high"
        ? 100
        : 50;

    const shattafScore = [
      "high",
      "common",
      "good",
      "widely-available"
    ].includes(
      normalizeText(country.shattafAvailability)
    )
      ? 100
      : 45;

    const weightedParts = [
      [styleFit.score, weights.travelStyle],
      [climateFit.score, weights.climate],
      [budgetFit.score, weights.budget],
      [durationFit.score, weights.duration],
      [familyScore, weights.family],
      [halalScore, weights.halal],
      [shattafScore, weights.shattaf],
      [beachFit, weights.beach],
      [cityFit, weights.city],
      [noveltyFit.score, weights.novelty],
      [wishlistBoost, weights.wishlist],
      [repeatBoost, weights.repeatPreference],
      [seasonFit.score, weights.season],
      [flightFit.score, weights.flightTime]
    ];

    const totalWeight = weightedParts.reduce(
      (sum, [, weight]) => sum + weight,
      0
    );

    const rawScore =
      weightedParts.reduce(
        (sum, [score, weight]) => sum + score * weight,
        0
      ) / totalWeight;

    const score = clamp(Math.round(rawScore), 0, 100);

    const reasons = buildReasons(country, {
      dna,
      context,
      styleFit,
      climateFit,
      budgetFit,
      durationFit,
      seasonFit,
      amenityFit,
      noveltyFit,
      flightFit,
      beachFit,
      cityFit,
      familyScore,
      halalScore,
      shattafScore
    });

    const warnings = buildWarnings(country, {
      dna,
      budgetFit,
      seasonFit,
      amenityFit,
      flightFit
    });

    return {
      countryCode: country.code,
      score,
      reasons,
      warnings,
      budgetFit,
      seasonFit,
      durationFit,
      styleFit,
      climateFit,
      amenityFit,
      noveltyFit,
      flightFit,
      estimate: budgetFit.estimate || estimateCost(country, options)
    };
  }

  function buildReasons(country, analysis) {
    const reasons = [];

    if (analysis.styleFit.matches.length) {
      reasons.push("تناسب أسلوب سفرك المفضل");
    }

    if (analysis.climateFit.matched) {
      reasons.push("طقسها قريب من الجو الذي تفضله");
    }

    if (analysis.budgetFit.score >= 75) {
      reasons.push(analysis.budgetFit.label);
    }

    if (analysis.seasonFit.score >= 90) {
      reasons.push("الوقت المختار من أفضل مواسمها");
    }

    if (analysis.durationFit.score >= 85) {
      reasons.push("المدة تناسب طبيعة الوجهة");
    }

    if (analysis.context.wishlistCodes.includes(country.code)) {
      reasons.push("موجودة في قائمة أمنياتك");
    }

    if (!analysis.context.visitedCodes.includes(country.code)) {
      reasons.push("وجهة جديدة عليك");
    }

    if (analysis.dna.familyFriendlyRequired && country.familyFriendly !== false) {
      reasons.push("مناسبة للعائلة");
    }

    if (analysis.halalScore >= 90) {
      reasons.push("خيارات الحلال فيها جيدة");
    }

    if (analysis.shattafScore >= 90) {
      reasons.push("توفر الشطاف جيد");
    }

    if (
      analysis.dna.beachPreference &&
      analysis.beachFit >= 90
    ) {
      reasons.push("تجمع بين البحر والاسترخاء");
    }

    if (
      analysis.dna.naturePreference &&
      countryMatchesStyle(country, "nature")
    ) {
      reasons.push("غنية بالطبيعة والمناظر");
    }

    return unique(reasons).slice(0, 5);
  }

  function buildWarnings(country, analysis) {
    const warnings = [];

    if (analysis.budgetFit.score < 50) {
      warnings.push(analysis.budgetFit.label);
    }

    if (analysis.seasonFit.status === "avoid") {
      warnings.push("الشهر المختار ليس من المواسم المناسبة");
    }

    if (
      analysis.dna.halalRequired &&
      !analysis.amenityFit.checks.find(
        (check) => check.key === "halal" && check.passed
      )
    ) {
      warnings.push("خيارات الحلال قد تحتاج تخطيطاً مسبقاً");
    }

    if (
      analysis.dna.shattafRequired &&
      !analysis.amenityFit.checks.find(
        (check) => check.key === "shattaf" && check.passed
      )
    ) {
      warnings.push("يجب التأكد من توفر الشطاف في الفندق");
    }

    if (analysis.flightFit.score < 55) {
      warnings.push("مدة الطيران أطول من تفضيلك المعتاد");
    }

    if (country.safety?.level === "low") {
      warnings.push("راجع تنبيهات السلامة قبل الحجز");
    }

    return unique(warnings).slice(0, 4);
  }

  function rankCountries(countries, options = {}) {
    const rootState = options.storeState || readStoreState();
    const dna = options.dna || inferTravelDNA(rootState);
    const context = buildContext(rootState);

    const includeVisited = options.includeVisited === true;

    return safeArray(countries)
      .filter((country) => {
        if (!country?.code) return false;

        if (
          !includeVisited &&
          context.visitedCodes.includes(country.code)
        ) {
          return false;
        }

        return true;
      })
      .map((country) => {
        const analysis = scoreCountry(country, {
          ...options,
          rootState,
          dna,
          context
        });

        return {
          country: clone(country),
          ...analysis
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.country.nameAr.localeCompare(
            b.country.nameAr,
            "ar"
          )
      );
  }

  async function getRecommendations(input = {}) {
    const options = safeObject(input.options || input);
    const rootState =
      input.storeState ||
      options.storeState ||
      readStoreState();

    const guide = getGuideEngine();

    let countries = safeArray(input.countries);

    if (!countries.length && guide?.getCountries) {
      countries = guide.getCountries({
        query: "",
        filters: {
          continent: "all",
          season: "all",
          travelStyle: "all",
          budgetLevel: "all",
          visited: "all",
          wishlist: "all"
        },
        sortBy: "name"
      });
    }

    const dna = inferTravelDNA(rootState);

    const ranked = rankCountries(countries, {
      ...options,
      storeState: rootState,
      dna
    });

    const limit = clamp(toNumber(options.limit, 6), 1, 30);
    const result = ranked.slice(0, limit);

    lastSnapshot = {
      generatedAt: nowISO(),
      dna,
      recommendations: clone(result)
    };

    emit("travel-ai-recommendations-ready", {
      count: result.length
    });

    return result;
  }

  /* =======================================================
     Country analysis
     ======================================================= */

  function getBestMonths(country, options = {}) {
    const guide = getGuideEngine();
    const dna = options.dna || getTravelDNA();

    if (guide?.getBestTravelMonths) {
      const months = guide.getBestTravelMonths(country, {
        weather:
          options.weather ||
          dna.preferredClimate
      });

      return safeArray(months).slice(0, 6);
    }

    return safeArray(country.bestMonths).slice(0, 6);
  }

  function analyzeCountry(country, options = {}) {
    const rootState = options.storeState || readStoreState();
    const dna = options.dna || inferTravelDNA(rootState);
    const context = buildContext(rootState);

    const analysis = scoreCountry(country, {
      ...options,
      storeState: rootState,
      dna,
      context
    });

    const bestMonths = getBestMonths(country, {
      ...options,
      dna
    });

    const hotels = getHotelRecommendations(country, {
      ...options,
      dna
    });

    return {
      generatedAt: nowISO(),
      countryCode: country.code,
      matchScore: analysis.score,
      reasons: analysis.reasons,
      warnings: analysis.warnings,
      bestMonths,
      budgetFit: analysis.budgetFit,
      durationFit: analysis.durationFit,
      seasonFit: analysis.seasonFit,
      styleFit: analysis.styleFit,
      climateFit: analysis.climateFit,
      amenityFit: analysis.amenityFit,
      hotelRecommendations: hotels,
      recommendedDays: Math.max(
        1,
        toNumber(
          options.days,
          country.recommendedDays?.ideal ||
            dna.preferredTripDays ||
            7
        )
      ),
      dna
    };
  }

  /* =======================================================
     Hotel intelligence
     ======================================================= */

  function getHotelRecommendations(country, options = {}) {
    const dna = options.dna || getTravelDNA();
    const hotels = safeArray(country.hotels);

    const requireShattaf =
      options.requireShattaf ??
      dna.shattafRequired;

    const requireFamily =
      options.requireFamilyFriendly ??
      dna.familyFriendlyRequired;

    const requireHalal =
      options.requireHalalFriendly ??
      dna.halalRequired;

    const preferBeach =
      options.preferBeach ??
      dna.beachPreference;

    const preferMetro =
      options.preferMetro ??
      dna.cityPreference;

    const maxNightlyAED = toNumber(
      options.maxNightlyAED,
      0
    );

    return hotels
      .map((hotel) => {
        let score = 50;
        const reasons = [];
        const warnings = [];

        if (hotel.rating >= 4.5) {
          score += 12;
          reasons.push("تقييم مرتفع");
        } else if (hotel.rating >= 4) {
          score += 8;
        }

        if (requireShattaf) {
          if (hotel.hasShattaf === true) {
            score += 16;
            reasons.push("الشطاف متوفر");
          } else {
            score -= 15;
            warnings.push("تأكد من توفر الشطاف");
          }
        }

        if (requireFamily) {
          if (hotel.familyFriendly !== false) {
            score += 10;
            reasons.push("مناسب للعائلة");
          } else {
            score -= 12;
          }
        }

        if (requireHalal) {
          if (hotel.halalFriendly !== false) {
            score += 8;
            reasons.push("مناسب للمسافرين المسلمين");
          } else {
            score -= 8;
          }
        }

        if (preferBeach && hotel.beachAccess === true) {
          score += 10;
          reasons.push("وصول مباشر أو قريب من البحر");
        }

        if (preferMetro && hotel.nearMetro === true) {
          score += 7;
          reasons.push("قريب من المواصلات");
        }

        if (
          maxNightlyAED > 0 &&
          hotel.estimatedNightlyAED > 0
        ) {
          if (hotel.estimatedNightlyAED <= maxNightlyAED) {
            score += 8;
            reasons.push("ضمن ميزانية الفندق");
          } else {
            score -= Math.min(
              20,
              Math.round(
                ((hotel.estimatedNightlyAED - maxNightlyAED) /
                  maxNightlyAED) *
                  20
              )
            );
            warnings.push("أعلى من ميزانية الليلة");
          }
        }

        return {
          hotel: clone(hotel),
          score: clamp(Math.round(score), 0, 100),
          reasons: unique(reasons).slice(0, 4),
          warnings: unique(warnings).slice(0, 3)
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.hotel.rating - a.hotel.rating
      )
      .slice(
        0,
        clamp(toNumber(options.limit, 8), 1, 20)
      );
  }

  /* =======================================================
     Itinerary generation
     ======================================================= */

  function normalizePlace(item, fallbackType) {
    if (typeof item === "string") {
      return {
        id: normalizeText(item).replace(/\s+/g, "-"),
        name: item,
        type: fallbackType,
        city: "",
        durationHours: 2,
        tags: []
      };
    }

    const source = safeObject(item);

    return {
      id:
        source.id ||
        normalizeText(
          source.name ||
            source.title ||
            source.nameAr
        ).replace(/\s+/g, "-"),
      name:
        source.nameAr ||
        source.name ||
        source.title ||
        source.nameEn ||
        "مكان",
      type: source.type || fallbackType,
      city: source.city || "",
      durationHours: Math.max(
        1,
        toNumber(
          source.durationHours ??
            source.duration,
          2
        )
      ),
      tags: unique(source.tags),
      familyFriendly: source.familyFriendly !== false,
      halalFriendly: source.halalFriendly !== false,
      indoor: source.indoor === true,
      outdoor: source.outdoor !== false,
      notes: source.notes || ""
    };
  }

  function buildPlacePool(country) {
    return [
      ...safeArray(country.attractions).map((item) =>
        normalizePlace(item, "attraction")
      ),
      ...safeArray(country.experiences).map((item) =>
        normalizePlace(item, "experience")
      ),
      ...safeArray(country.beaches).map((item) =>
        normalizePlace(item, "beach")
      ),
      ...safeArray(country.shopping).map((item) =>
        normalizePlace(item, "shopping")
      ),
      ...safeArray(country.halalRestaurants).map((item) =>
        normalizePlace(item, "restaurant")
      )
    ];
  }

  function getDayTheme(index, totalDays, dna) {
    if (index === 0) {
      return {
        key: "arrival",
        label: "الوصول والاستقرار"
      };
    }

    if (index === totalDays - 1) {
      return {
        key: "departure",
        label: "الختام والمغادرة"
      };
    }

    const themes = [];

    if (dna.cityPreference) {
      themes.push({
        key: "city",
        label: "المدينة والمعالم"
      });
    }

    if (dna.naturePreference) {
      themes.push({
        key: "nature",
        label: "الطبيعة والمناظر"
      });
    }

    if (dna.beachPreference) {
      themes.push({
        key: "beach",
        label: "البحر والاسترخاء"
      });
    }

    themes.push(
      {
        key: "culture",
        label: "الثقافة والتجارب"
      },
      {
        key: "shopping",
        label: "التسوق والمطاعم"
      },
      {
        key: "free",
        label: "يوم مرن"
      }
    );

    return themes[(index - 1) % themes.length];
  }

  function placeMatchesTheme(place, theme) {
    const text = normalizeText(
      [
        place.type,
        place.name,
        ...place.tags
      ].join(" ")
    );

    const rules = {
      city: [
        "city",
        "attraction",
        "landmark",
        "مدينة",
        "معلم"
      ],
      nature: [
        "nature",
        "mountain",
        "lake",
        "park",
        "طبيعة",
        "جبل",
        "بحيرة"
      ],
      beach: [
        "beach",
        "sea",
        "شاطئ",
        "بحر"
      ],
      culture: [
        "culture",
        "museum",
        "history",
        "heritage",
        "ثقافة",
        "متحف",
        "تاريخ"
      ],
      shopping: [
        "shopping",
        "mall",
        "market",
        "restaurant",
        "تسوق",
        "مول",
        "سوق",
        "مطعم"
      ],
      free: []
    };

    const words = rules[theme] || [];

    if (!words.length) return true;

    return words.some((word) =>
      text.includes(normalizeText(word))
    );
  }

  function choosePlacesForDay(pool, usedIds, theme, limit = 3) {
    const available = pool.filter(
      (place) => !usedIds.has(place.id)
    );

    const themed = available.filter((place) =>
      placeMatchesTheme(place, theme)
    );

    const candidates =
      themed.length >= limit ? themed : available;

    const selected = candidates.slice(0, limit);

    selected.forEach((place) => usedIds.add(place.id));

    return selected;
  }

  function generateItinerary(country, options = {}) {
    const dna = options.dna || getTravelDNA();
    const days = clamp(
      toNumber(
        options.days,
        country.recommendedDays?.ideal ||
          dna.preferredTripDays ||
          7
      ),
      1,
      30
    );

    const cities = safeArray(country.cities);
    const pool = buildPlacePool(country);
    const usedIds = new Set();

    const itinerary = [];

    for (let index = 0; index < days; index += 1) {
      const dayNumber = index + 1;
      const theme = getDayTheme(index, days, dna);
      const city =
        cities[index % Math.max(1, cities.length)] ||
        null;

      let activities = [];

      if (theme.key === "arrival") {
        activities = [
          {
            id: `arrival_${dayNumber}`,
            name: "الوصول إلى الوجهة",
            type: "arrival",
            period: "morning",
            durationHours: 2
          },
          {
            id: `checkin_${dayNumber}`,
            name: "التوجه للفندق وتسجيل الدخول",
            type: "hotel",
            period: "afternoon",
            durationHours: 2
          },
          {
            id: `lightwalk_${dayNumber}`,
            name: "جولة خفيفة قريبة من الفندق",
            type: "relaxation",
            period: "evening",
            durationHours: 2
          }
        ];
      } else if (theme.key === "departure") {
        activities = [
          {
            id: `checkout_${dayNumber}`,
            name: "الإفطار وتسجيل الخروج",
            type: "hotel",
            period: "morning",
            durationHours: 2
          },
          {
            id: `laststop_${dayNumber}`,
            name: "وقت حر أو تسوق أخير",
            type: "shopping",
            period: "afternoon",
            durationHours: 2
          },
          {
            id: `airport_${dayNumber}`,
            name: "التوجه إلى المطار قبل الرحلة بوقت كافٍ",
            type: "departure",
            period: "evening",
            durationHours: 3
          }
        ];
      } else {
        const selected = choosePlacesForDay(
          pool,
          usedIds,
          theme.key,
          3
        );

        activities = selected.map((place, activityIndex) => ({
          ...clone(place),
          period:
            activityIndex === 0
              ? "morning"
              : activityIndex === 1
                ? "afternoon"
                : "evening"
        }));

        if (!activities.length) {
          activities = [
            {
              id: `explore_${dayNumber}`,
              name: city
                ? `استكشاف ${city.nameAr || city.name}`
                : "استكشاف المدينة",
              type: "free",
              period: "morning",
              durationHours: 3
            },
            {
              id: `lunch_${dayNumber}`,
              name: "غداء في مطعم مناسب",
              type: "restaurant",
              period: "afternoon",
              durationHours: 2
            },
            {
              id: `evening_${dayNumber}`,
              name: "وقت حر واستراحة",
              type: "relaxation",
              period: "evening",
              durationHours: 2
            }
          ];
        }
      }

      itinerary.push({
        day: dayNumber,
        city: city?.nameAr || city?.name || "",
        theme: theme.label,
        activities,
        notes:
          theme.key === "arrival"
            ? "يفضل أن يكون اليوم الأول خفيفاً."
            : theme.key === "departure"
              ? "راجع وقت تسجيل الخروج وموعد الرحلة."
              : ""
      });
    }

    const cost = estimateCost(country, {
      ...options,
      days
    });

    return {
      generatedAt: nowISO(),
      countryCode: country.code,
      countryName: country.nameAr,
      days,
      travelers: Math.max(
        1,
        toNumber(options.travelers, 1)
      ),
      month: toNumber(options.month, 0) || null,
      estimatedCost: cost,
      itinerary
    };
  }

  /* =======================================================
     Alternatives
     ======================================================= */

  async function getDestinationAlternatives(country, options = {}) {
    const guide = getGuideEngine();

    if (!guide?.getCountries) return [];

    const countries = guide
      .getCountries({
        query: "",
        filters: {
          continent: "all",
          season: "all",
          travelStyle: "all",
          budgetLevel: "all",
          visited: "all",
          wishlist: "all"
        },
        sortBy: "name"
      })
      .filter((item) => item.code !== country.code);

    const originalCost = estimateCost(country, options).totalAED;

    const ranked = rankCountries(countries, options)
      .filter((item) => {
        if (!originalCost) return true;

        return (
          item.estimate.totalAED <=
          originalCost *
            toNumber(options.maxCostRatio, 1)
        );
      })
      .slice(
        0,
        clamp(toNumber(options.limit, 5), 1, 15)
      );

    return ranked.map((item) => ({
      ...item,
      savingsAED: Math.max(
        0,
        Math.round(
          originalCost - item.estimate.totalAED
        )
      )
    }));
  }

  /* =======================================================
     Lifecycle
     ======================================================= */

  async function refresh(options = {}) {
    const dna = inferTravelDNA();

    lastSnapshot = {
      generatedAt: nowISO(),
      reason: options.reason || "manual",
      dna
    };

    emit("travel-ai-refreshed", {
      reason: options.reason || "manual"
    });

    return clone(lastSnapshot);
  }

  async function init(options = {}) {
    if (initialized && options.force !== true) {
      return clone(lastSnapshot);
    }

    subscribeToStore();

    initialized = true;

    await refresh({
      reason: "init"
    });

    emit("travel-ai-ready", {
      hasStore: Boolean(getStore()),
      hasGuideEngine: Boolean(getGuideEngine())
    });

    return clone(lastSnapshot);
  }

  function destroy() {
    if (typeof storeUnsubscribe === "function") {
      storeUnsubscribe();
    }

    storeUnsubscribe = null;
    listeners.clear();
    initialized = false;
    lastSnapshot = null;
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError("TravelAI subscriber must be a function.");
    }

    listeners.add(listener);

    if (options.immediate === true) {
      listener(
        {
          type: "travel-ai-snapshot",
          module: MODULE_NAME,
          version: VERSION,
          timestamp: nowISO(),
          detail: {}
        },
        clone(lastSnapshot)
      );
    }

    return () => listeners.delete(listener);
  }

  function getSnapshot() {
    return clone(lastSnapshot);
  }

  /* =======================================================
     Public API
     ======================================================= */

  const TravelAI = Object.freeze({
    VERSION,

    init,
    refresh,
    destroy,
    subscribe,
    getSnapshot,

    getTravelDNA,
    getRecommendations,
    rankCountries,
    analyzeCountry,
    scoreCountry,

    getBestMonths,
    getBudgetFit,
    getHotelRecommendations,
    generateItinerary,
    getDestinationAlternatives
  });

  global.TravelAI = TravelAI;
  global.TravelIntelligence = TravelAI;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = TravelAI;
  }
})(typeof window !== "undefined" ? window : globalThis);
