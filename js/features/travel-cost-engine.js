/* =========================================================
   Travel Intelligence Center
   Travel Cost Engine V1.0.0

   File Path:
   js/features/travel-cost-engine.js

   Purpose:
   - Calculates complete estimated trip cost.
   - Supports flight, hotel, meals, transport, activities,
     insurance, visa, taxes, reserve and extra costs.
   - Adjusts cost by destination, travelers, duration,
     accommodation level and travel style.
   - Compares the estimate against available budget.
   - Returns normalized output for TravelBudgetIntelligence.
   - Does not render UI.
   - Does not write directly to the Store.

   Global API:
   window.TravelCostEngine

   Version:
   1.0.0
   ========================================================= */

(function (window) {
  "use strict";

  const ENGINE_NAME = "TravelCostEngine";
  const ENGINE_VERSION = "1.0.0";
  const DEFAULT_CURRENCY = "AED";

  const DEFAULTS = Object.freeze({
    travelers: 1,
    durationDays: 5,
    flightPerTraveler: 1800,
    hotelPerNight: 550,
    mealsPerTravelerPerDay: 180,
    transportPerDay: 120,
    activitiesPerTravelerPerDay: 140,
    insurancePerTraveler: 120,
    visaPerTraveler: 0,
    taxesRate: 0.05,
    reserveRate: 0.08
  });

  const DESTINATION_PROFILES = Object.freeze({
    baku: {
      flightPerTraveler: 1200,
      hotelPerNight: 400,
      mealsPerTravelerPerDay: 140,
      transportPerDay: 80,
      activitiesPerTravelerPerDay: 100,
      insurancePerTraveler: 100,
      visaPerTraveler: 0
    },
    budapest: {
      flightPerTraveler: 1800,
      hotelPerNight: 600,
      mealsPerTravelerPerDay: 190,
      transportPerDay: 110,
      activitiesPerTravelerPerDay: 150,
      insurancePerTraveler: 140,
      visaPerTraveler: 0
    },
    switzerland: {
      flightPerTraveler: 2500,
      hotelPerNight: 1100,
      mealsPerTravelerPerDay: 320,
      transportPerDay: 230,
      activitiesPerTravelerPerDay: 240,
      insurancePerTraveler: 180,
      visaPerTraveler: 0
    },
    bosnia: {
      flightPerTraveler: 1500,
      hotelPerNight: 450,
      mealsPerTravelerPerDay: 150,
      transportPerDay: 90,
      activitiesPerTravelerPerDay: 120,
      insurancePerTraveler: 110,
      visaPerTraveler: 0
    },
    georgia: {
      flightPerTraveler: 1100,
      hotelPerNight: 380,
      mealsPerTravelerPerDay: 130,
      transportPerDay: 80,
      activitiesPerTravelerPerDay: 110,
      insurancePerTraveler: 100,
      visaPerTraveler: 0
    },
    albania: {
      flightPerTraveler: 1900,
      hotelPerNight: 500,
      mealsPerTravelerPerDay: 160,
      transportPerDay: 100,
      activitiesPerTravelerPerDay: 130,
      insurancePerTraveler: 120,
      visaPerTraveler: 0
    },
    maldives: {
      flightPerTraveler: 2200,
      hotelPerNight: 1800,
      mealsPerTravelerPerDay: 350,
      transportPerDay: 400,
      activitiesPerTravelerPerDay: 250,
      insurancePerTraveler: 140,
      visaPerTraveler: 0
    },
    phuket: {
      flightPerTraveler: 1700,
      hotelPerNight: 700,
      mealsPerTravelerPerDay: 160,
      transportPerDay: 100,
      activitiesPerTravelerPerDay: 160,
      insurancePerTraveler: 120,
      visaPerTraveler: 0
    },
    salalah: {
      flightPerTraveler: 700,
      hotelPerNight: 350,
      mealsPerTravelerPerDay: 120,
      transportPerDay: 70,
      activitiesPerTravelerPerDay: 80,
      insurancePerTraveler: 70,
      visaPerTraveler: 0
    },
    istanbul: {
      flightPerTraveler: 1300,
      hotelPerNight: 500,
      mealsPerTravelerPerDay: 170,
      transportPerDay: 100,
      activitiesPerTravelerPerDay: 140,
      insurancePerTraveler: 110,
      visaPerTraveler: 0
    }
  });

  const ACCOMMODATION_MULTIPLIERS = Object.freeze({
    economy: 0.72,
    standard: 1,
    comfort: 1.22,
    premium: 1.55,
    luxury: 2.15
  });

  const TRAVEL_STYLE_MULTIPLIERS = Object.freeze({
    budget: 0.8,
    balanced: 1,
    family: 1.12,
    premium: 1.25,
    "premium-family": 1.32,
    luxury: 1.7
  });

  const listeners = new Set();

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function asMoney(value) {
    return Math.max(0, Math.round(asNumber(value, 0)));
  }

  function asText(value, fallback = "") {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, "-");
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function emit(eventName, payload) {
    listeners.forEach((listener) => {
      if (listener.eventName !== eventName && listener.eventName !== "*") {
        return;
      }

      try {
        listener.handler(payload, eventName);
      } catch (error) {
        console.error(`[${ENGINE_NAME}] Listener failed:`, error);
      }
    });

    try {
      window.dispatchEvent(
        new CustomEvent(`travel:${eventName}`, {
          detail: payload
        })
      );
    } catch (_) {}
  }

  function on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return function unsubscribeNoop() {};
    }

    const listener = { eventName, handler };
    listeners.add(listener);

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function getDestinationProfile(input = {}) {
    const destinationKey = normalizeKey(
      input.destinationId ||
      input.destination ||
      input.city ||
      input.country
    );

    return {
      key: destinationKey,
      profile: {
        ...DEFAULTS,
        ...(DESTINATION_PROFILES[destinationKey] || {}),
        ...(isObject(input.costProfile) ? input.costProfile : {})
      }
    };
  }

  function getAccommodationMultiplier(level) {
    const key = normalizeKey(level || "standard");
    return ACCOMMODATION_MULTIPLIERS[key] || 1;
  }

  function getTravelStyleMultiplier(style) {
    const key = normalizeKey(style || "balanced");

    if (TRAVEL_STYLE_MULTIPLIERS[key]) {
      return TRAVEL_STYLE_MULTIPLIERS[key];
    }

    if (key.includes("premium") && key.includes("family")) {
      return TRAVEL_STYLE_MULTIPLIERS["premium-family"];
    }

    if (key.includes("luxury")) {
      return TRAVEL_STYLE_MULTIPLIERS.luxury;
    }

    if (key.includes("premium")) {
      return TRAVEL_STYLE_MULTIPLIERS.premium;
    }

    if (key.includes("family")) {
      return TRAVEL_STYLE_MULTIPLIERS.family;
    }

    if (key.includes("budget")) {
      return TRAVEL_STYLE_MULTIPLIERS.budget;
    }

    return TRAVEL_STYLE_MULTIPLIERS.balanced;
  }

  function calculate(input = {}) {
    const safeInput = isObject(input) ? input : {};
    const destination = getDestinationProfile(safeInput);
    const profile = destination.profile;

    const travelers = Math.max(
      1,
      Math.round(
        asNumber(
          safeInput.travelers,
          DEFAULTS.travelers
        )
      )
    );

    const durationDays = Math.max(
      1,
      Math.round(
        asNumber(
          safeInput.durationDays || safeInput.days,
          DEFAULTS.durationDays
        )
      )
    );

    const hotelNights = Math.max(
      0,
      Math.round(
        asNumber(
          safeInput.hotelNights,
          Math.max(0, durationDays - 1)
        )
      )
    );

    const rooms = Math.max(
      1,
      Math.round(
        asNumber(
          safeInput.rooms,
          Math.ceil(travelers / 2)
        )
      )
    );

    const accommodationLevel = normalizeKey(
      safeInput.accommodationLevel || "standard"
    );

    const travelStyle = normalizeKey(
      safeInput.travelStyle || "balanced"
    );

    const accommodationMultiplier =
      getAccommodationMultiplier(accommodationLevel);

    const travelStyleMultiplier =
      getTravelStyleMultiplier(travelStyle);

    const flight = asMoney(
      safeInput.flightCost ??
      profile.flightPerTraveler * travelers
    );

    const hotel = asMoney(
      safeInput.hotelCost ??
      profile.hotelPerNight *
        hotelNights *
        rooms *
        accommodationMultiplier
    );

    const meals = asMoney(
      safeInput.mealsCost ??
      profile.mealsPerTravelerPerDay *
        travelers *
        durationDays *
        travelStyleMultiplier
    );

    const transport = asMoney(
      safeInput.transportCost ??
      profile.transportPerDay *
        durationDays *
        travelStyleMultiplier
    );

    const activities = asMoney(
      safeInput.activitiesCost ??
      profile.activitiesPerTravelerPerDay *
        travelers *
        durationDays *
        travelStyleMultiplier
    );

    const insurance = asMoney(
      safeInput.insuranceCost ??
      profile.insurancePerTraveler * travelers
    );

    const visa = asMoney(
      safeInput.visaCost ??
      profile.visaPerTraveler * travelers
    );

    const extras = asMoney(
      safeInput.extrasCost ?? 0
    );

    const subtotal =
      flight +
      hotel +
      meals +
      transport +
      activities +
      insurance +
      visa +
      extras;

    const taxesRate = clamp(
      asNumber(
        safeInput.taxesRate,
        profile.taxesRate
      ),
      0,
      0.3
    );

    const reserveRate = clamp(
      asNumber(
        safeInput.reserveRate,
        profile.reserveRate
      ),
      0,
      0.5
    );

    const taxes = asMoney(
      safeInput.taxesCost ??
      subtotal * taxesRate
    );

    const reserve = asMoney(
      safeInput.reserveCost ??
      subtotal * reserveRate
    );

    const totalEstimatedCost =
      subtotal +
      taxes +
      reserve;

    const availableBudget = asMoney(
      safeInput.availableBudget ?? 0
    );

    const difference =
      availableBudget > 0
        ? availableBudget - totalEstimatedCost
        : null;

    const result = Object.freeze({
      id: createId("travel_cost"),
      engine: ENGINE_NAME,
      version: ENGINE_VERSION,
      generatedAt: nowISO(),
      currency: asText(
        safeInput.currency,
        DEFAULT_CURRENCY
      ),
      destination: {
        id: destination.key,
        country: asText(safeInput.country),
        city: asText(safeInput.city),
        name: asText(
          safeInput.destination ||
          safeInput.city ||
          safeInput.country
        )
      },
      trip: {
        travelers,
        durationDays,
        hotelNights,
        rooms,
        accommodationLevel,
        travelStyle
      },
      breakdown: {
        flight,
        hotel,
        meals,
        transport,
        activities,
        insurance,
        visa,
        extras,
        taxes,
        reserve
      },
      subtotal,
      totalEstimatedCost,
      costPerTraveler: asMoney(
        totalEstimatedCost / travelers
      ),
      costPerDay: asMoney(
        totalEstimatedCost / durationDays
      ),
      budget: {
        available: availableBudget,
        difference,
        fitsBudget:
          availableBudget > 0
            ? totalEstimatedCost <= availableBudget
            : null,
        utilization:
          availableBudget > 0
            ? Math.round(
                totalEstimatedCost /
                availableBudget *
                100
              )
            : null
      }
    });

    emit("travel-cost-calculated", result);
    return result;
  }

  function compareWithBudget(input = {}) {
    const result = calculate(input);

    if (
      result.budget.available <= 0
    ) {
      return Object.freeze({
        ...result,
        verdict: "budget-not-provided",
        message:
          "لم يتم تحديد ميزانية للمقارنة."
      });
    }

    if (
      result.budget.fitsBudget
    ) {
      return Object.freeze({
        ...result,
        verdict: "within-budget",
        message:
          `التكلفة ضمن الميزانية والمتبقي ${Math.max(
            0,
            result.budget.difference
          )} ${result.currency}.`
      });
    }

    return Object.freeze({
      ...result,
      verdict: "over-budget",
      message:
        `تحتاج ${Math.abs(
          result.budget.difference
        )} ${result.currency} إضافية.`
    });
  }

  function estimateMany(items = [], sharedInput = {}) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item) =>
      compareWithBudget({
        ...sharedInput,
        ...(isObject(item) ? item : {})
      })
    );
  }

  function getProfiles() {
    return Object.freeze({
      destinations: DESTINATION_PROFILES,
      accommodationLevels: ACCOMMODATION_MULTIPLIERS,
      travelStyles: TRAVEL_STYLE_MULTIPLIERS
    });
  }

  function getCapabilities() {
    return Object.freeze({
      destinationProfiles:
        Object.keys(DESTINATION_PROFILES).length,
      detailedBreakdown: true,
      budgetComparison: true,
      multiEstimate: true,
      storeWrites: false,
      uiRendering: false
    });
  }

  window.TravelCostEngine = Object.freeze({
    name: ENGINE_NAME,
    version: ENGINE_VERSION,
    calculate,
    estimate: calculate,
    compareWithBudget,
    estimateMany,
    getProfiles,
    getCapabilities,
    on
  });

  emit("engine-ready", {
    name: ENGINE_NAME,
    version: ENGINE_VERSION
  });

  console.info(
    `[Travel Intelligence Center] ${ENGINE_NAME} V${ENGINE_VERSION} ready.`
  );
})(window);
