/* =========================================================
   Travel Intelligence Center
   Travel Brain Intelligence Engine V1.1.0
   Stable Store V2.5 Integration

   File Path:
   js/features/travel-brain.js

   Purpose:
   - Central read-only intelligence layer for the Travel Intelligence Center.
   - Reads the current Store without changing page layouts or application data.
   - Produces normalized context, scores, alerts, insights, recommendations,
     trip analysis, destination analysis and assistant-ready answers.
   - Supports Store V2.5.0, legacy Store shapes, Events, Analytics,
     browser CustomEvents, localStorage and future intelligence modules.
   - Remains local-first and requires no external API.

   Recommended Load Order:
   1) js/config.js
   2) js/storage.js
   3) js/store.js
   4) js/events.js
   5) js/analytics.js
   6) js/features/travel-brain.js
   7) js/features/travel-assistant.js
   8) js/features/travel-import.js
   9) js/features/travel-sync.js
   10) js/app.js

   Public Globals:
   - window.TravelBrain
   - window.TIC.TravelBrain

   Backward-Compatible Main APIs:
   - TravelBrain.init()
   - TravelBrain.refresh()
   - TravelBrain.scheduleRefresh()
   - TravelBrain.getSnapshot()
   - TravelBrain.getContext()
   - TravelBrain.getInsights()
   - TravelBrain.getAlerts()
   - TravelBrain.getRecommendations()
   - TravelBrain.getTripAnalysis()
   - TravelBrain.getDestinationAnalysis()
   - TravelBrain.getBudgetAnalysis()
   - TravelBrain.getPassportAnalysis()
   - TravelBrain.getReadinessAnalysis()
   - TravelBrain.ask()
   - TravelBrain.subscribe()
   - TravelBrain.getHealth()
   - TravelBrain.clearCache()
   - TravelBrain.destroy()
========================================================= */

(function travelBrainFactory(global) {
  "use strict";

  if (!global) return;

  global.TIC = global.TIC || {};

  if (global.TravelBrain || global.TIC.TravelBrain) {
    return;
  }

  var VERSION = "1.1.0";
  var MODULE_NAME = "TravelBrain";
  var STORAGE_KEY = "tic_travel_brain_snapshot_v1";
  var DEFAULT_CURRENCY = "AED";
  var DEFAULT_LANGUAGE = "ar";
  var MS_PER_DAY = 86400000;
  var MAX_PERSISTED_ITEMS = 20;
  var DEFAULT_REFRESH_DELAY = 70;

  var UPCOMING_STATUSES = [
    "draft", "planning", "planned", "booked", "confirmed", "ready", "upcoming"
  ];

  var ACTIVE_STATUSES = ["active", "ongoing"];
  var COMPLETED_STATUSES = ["completed", "past", "done"];
  var HIDDEN_STATUSES = ["cancelled", "canceled", "archived", "deleted"];

  var runtime = {
    initialized: false,
    destroyed: false,
    refreshing: false,
    refreshTimer: null,
    unsubscribeStore: null,
    eventUnsubscribers: [],
    domListeners: [],
    listeners: new Set(),
    snapshot: null,
    revision: 0,
    lastError: null,
    lastRefreshReason: null,
    lastRefreshAt: null
  };

  var LEVEL_ORDER = Object.freeze({
    critical: 5,
    danger: 4,
    warning: 3,
    attention: 2,
    info: 1,
    success: 0
  });

  var DEFAULT_WEIGHTS = Object.freeze({
    readiness: 0.26,
    budget: 0.20,
    documents: 0.16,
    packing: 0.12,
    planning: 0.12,
    savings: 0.08,
    experience: 0.06
  });

  var QUESTION_PATTERNS = Object.freeze({
    nextTrip: ["الرحلة القادمة", "السفرة القادمة", "رحلتي القادمة", "next trip", "upcoming trip"],
    budget: ["الميزانية", "ميزانية", "الرصيد", "المصروف", "المصاريف", "budget", "balance", "spending", "expense"],
    readiness: ["الجاهزية", "جاهز", "مستعد", "readiness", "ready"],
    documents: ["الجواز", "التأشيرة", "المستندات", "passport", "visa", "documents"],
    packing: ["التجهيز", "الشنطة", "الأغراض", "packing", "checklist"],
    savings: ["الادخار", "التوفير", "savings", "saving"],
    destination: ["وجهة", "الدولة", "المدينة", "destination", "country", "city"],
    passport: ["جواز سفري", "الدول التي زرتها", "سجل السفر", "passport history", "visited countries"],
    alerts: ["التنبيهات", "تنبيه", "مشكلة", "خطر", "alerts", "warning", "risk"],
    recommendations: ["التوصيات", "تنصحني", "شو اسوي", "recommendation", "advice"],
    summary: ["ملخص", "وضعي", "حالة سفري", "summary", "overview", "status"]
  });

  /* =========================================================
     Generic utilities
  ========================================================= */

  function nowIso() {
    return new Date().toISOString();
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return isObject(value) ? value : {};
  }

  function asString(value, fallback) {
    if (value === null || value === undefined) return fallback || "";
    var text = String(value).trim();
    return text || fallback || "";
  }

  function asNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number)
      ? number
      : (Number.isFinite(fallback) ? fallback : 0);
  }

  function asBoolean(value, fallback) {
    if (value === true || value === "true" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === 0 || value === "0") return false;
    return Boolean(fallback);
  }

  function firstDefined() {
    for (var index = 0; index < arguments.length; index += 1) {
      var value = arguments[index];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, asNumber(value, min)));
  }

  function round(value, decimals) {
    var places = Number.isInteger(decimals) ? decimals : 0;
    var factor = Math.pow(10, places);
    return Math.round((asNumber(value, 0) + Number.EPSILON) * factor) / factor;
  }

  function unique(values) {
    return Array.from(new Set(asArray(values).filter(function keep(value) {
      return value !== null && value !== undefined && value !== "";
    })));
  }

  function safeClone(value) {
    if (value === undefined) return undefined;

    if (typeof global.structuredClone === "function") {
      try {
        return global.structuredClone(value);
      } catch (_) {}
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function rememberError(error) {
    if (error) runtime.lastError = error;
  }

  function safeCall(fn, fallback, context, args) {
    if (typeof fn !== "function") return fallback;

    try {
      var result = fn.apply(context || null, asArray(args));
      return result === undefined ? fallback : result;
    } catch (error) {
      rememberError(error);
      return fallback;
    }
  }

  function normalizeDateString(value) {
    if (!value) return "";

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, "0"),
        String(value.getDate()).padStart(2, "0")
      ].join("-");
    }

    var raw = asString(value, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    var parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, "0"),
      String(parsed.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDate(value) {
    var normalized = normalizeDateString(value);
    if (!normalized) return null;

    var direct = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (direct) {
      var local = new Date(Number(direct[1]), Number(direct[2]) - 1, Number(direct[3]));
      return Number.isNaN(local.getTime()) ? null : local;
    }

    var date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfDay(value) {
    var date = parseDate(value) || new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysBetween(from, to) {
    var start = startOfDay(from);
    var end = startOfDay(to);
    return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  }

  function daysUntil(value) {
    return parseDate(value) ? daysBetween(new Date(), value) : null;
  }

  function dateValue(value, fallback) {
    var date = parseDate(value);
    return date ? date.getTime() : (fallback || 0);
  }

  function calculateDurationDays(startDate, endDate, fallback) {
    var start = parseDate(startDate);
    var end = parseDate(endDate);

    if (start && end && end >= start) {
      return daysBetween(start, end) + 1;
    }

    return Math.max(0, Math.floor(asNumber(fallback, 0)));
  }

  function normalizeText(value) {
    return asString(value, "")
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0600-\u06FFa-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function containsAny(text, terms) {
    var normalized = normalizeText(text);
    return asArray(terms).some(function match(term) {
      return normalized.indexOf(normalizeText(term)) !== -1;
    });
  }

  function createId(prefix, parts) {
    var raw = [prefix].concat(asArray(parts)).join("|");
    var hash = 2166136261;

    for (var index = 0; index < raw.length; index += 1) {
      hash ^= raw.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return prefix + "_" + (hash >>> 0).toString(36);
  }

  function formatCurrency(value, currency, locale) {
    var amount = asNumber(value, 0);
    var selectedCurrency = asString(currency, DEFAULT_CURRENCY);
    var selectedLocale = asString(locale, "ar-AE");

    try {
      return new Intl.NumberFormat(selectedLocale, {
        style: "currency",
        currency: selectedCurrency,
        maximumFractionDigits: 0
      }).format(amount);
    } catch (_) {
      return round(amount, 0).toLocaleString(selectedLocale) + " " + selectedCurrency;
    }
  }

  function formatDate(value, locale) {
    var date = parseDate(value);
    if (!date) return "";

    try {
      return new Intl.DateTimeFormat(asString(locale, "ar-AE"), {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).format(date);
    } catch (_) {
      return normalizeDateString(value);
    }
  }

  function percentage(part, total) {
    var denominator = asNumber(total, 0);
    return denominator > 0
      ? clamp((asNumber(part, 0) / denominator) * 100, 0, 999)
      : 0;
  }

  function average(values) {
    var numbers = asArray(values)
      .map(function mapNumber(value) { return asNumber(value, NaN); })
      .filter(Number.isFinite);

    if (!numbers.length) return 0;

    return numbers.reduce(function sum(total, value) {
      return total + value;
    }, 0) / numbers.length;
  }

  function weightedScore(items) {
    var totalWeight = 0;
    var totalScore = 0;

    asArray(items).forEach(function scoreItem(item) {
      var score = clamp(asNumber(item && item.score, 0), 0, 100);
      var weight = Math.max(0, asNumber(item && item.weight, 0));
      totalScore += score * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? round(totalScore / totalWeight, 0) : 0;
  }

  function sortByPriority(items) {
    return asArray(items).sort(function sort(a, b) {
      return asNumber(b.priority, 0) - asNumber(a.priority, 0);
    });
  }

  /* =========================================================
     Integration discovery and persistence
  ========================================================= */

  function getGlobalConfig() {
    return asObject(
      global.TICConfig ||
      global.TIC && global.TIC.Config ||
      global.TravelConfig ||
      global.CONFIG ||
      global.AppConfig ||
      global.config
    );
  }

  function getStore() {
    return (
      global.TIC && global.TIC.Store ||
      global.TICStore ||
      global.Store ||
      global.TravelStore ||
      global.AppStore ||
      null
    );
  }

  function getEvents() {
    return (
      global.TIC && global.TIC.Events ||
      global.Events ||
      global.EventBus ||
      global.TravelEvents ||
      null
    );
  }

  function getAnalytics() {
    return (
      global.TIC && global.TIC.Analytics ||
      global.Analytics ||
      global.TravelAnalytics ||
      null
    );
  }

  function readStoreState() {
    var store = getStore();
    var state = null;

    if (store) {
      state =
        safeCall(store.getState, null, store) ||
        safeCall(store.getSnapshot, null, store) ||
        safeCall(store.getData, null, store) ||
        safeCall(store.read, null, store);

      if (!state && isObject(store.state)) state = store.state;
      if (!state && isObject(store.data)) state = store.data;
    }

    if (!state) {
      state = global.appState || global.travelState || global.__TRAVEL_STATE__ || {};
    }

    return safeClone(asObject(state));
  }

  function readPersistedSnapshot() {
    try {
      if (!global.localStorage) return null;
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return isObject(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function persistSnapshot(snapshot) {
    try {
      if (!global.localStorage || !snapshot) return false;

      var payload = {
        module: MODULE_NAME,
        version: VERSION,
        generatedAt: snapshot.generatedAt,
        revision: snapshot.revision,
        summary: snapshot.summary,
        scores: snapshot.scores,
        readiness: snapshot.readiness,
        statistics: snapshot.statistics,
        insights: snapshot.insights.slice(0, MAX_PERSISTED_ITEMS),
        alerts: snapshot.alerts.slice(0, MAX_PERSISTED_ITEMS),
        recommendations: snapshot.recommendations.slice(0, MAX_PERSISTED_ITEMS)
      };

      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      rememberError(error);
      return false;
    }
  }

  /* =========================================================
     State normalization
  ========================================================= */

  function normalizeProfile(state, config) {
    var profile = asObject(state.profile);
    var settings = asObject(state.settings);
    var defaults = asObject(config.defaults);

    return {
      name: asString(profile.name, asString(defaults.profileName, asString(defaults.name, "يوسف"))),
      currency: asString(profile.currency, asString(settings.currency, asString(defaults.currency, DEFAULT_CURRENCY))),
      language: asString(profile.language, asString(settings.language, asString(defaults.language, DEFAULT_LANGUAGE))),
      homeAirport: asString(profile.homeAirport, asString(defaults.homeAirport, "Abu Dhabi")),
      travelStyle: asString(profile.travelStyle, asString(defaults.travelStyle, "Premium Family")),
      annualTravelBudget: asNumber(
        firstDefined(
          profile.annualTravelBudget,
          settings.annualTravelBudget,
          asObject(state.budgets).annualBudget,
          defaults.annualTravelBudget
        ),
        30000
      ),
      monthlySaving: asNumber(
        firstDefined(
          profile.monthlyTravelSaving,
          profile.monthlySaving,
          settings.monthlySaving,
          asObject(state.savings).monthlySaving,
          defaults.monthlySaving
        ),
        1500
      )
    };
  }

  function normalizeChecklist(value) {
    var items = [];

    if (Array.isArray(value)) {
      items = value;
    } else if (isObject(value)) {
      Object.keys(value).forEach(function objectChecklist(key) {
        if (key === "templates" || key === "lists") return;

        var itemValue = value[key];

        if (typeof itemValue === "boolean") {
          items.push({
            id: key,
            title: key,
            completed: itemValue,
            category: "general",
            required: true
          });
        } else if (isObject(itemValue)) {
          items.push(Object.assign({ id: key }, itemValue));
        }
      });
    }

    return items.map(function normalizeItem(item, index) {
      if (typeof item === "string") {
        return {
          id: createId("check", [index, item]),
          title: item,
          completed: false,
          category: "general",
          required: true,
          dueDate: null
        };
      }

      var record = asObject(item);

      return {
        id: asString(record.id, createId("check", [index, record.title || record.name])),
        title: asString(record.title, asString(record.name, asString(record.label, "عنصر"))),
        completed: asBoolean(record.completed, asBoolean(record.done, asBoolean(record.checked, false))),
        category: asString(record.category, "general"),
        dueDate: record.dueDate || null,
        required: record.required !== false
      };
    });
  }

  function normalizeExpenses(value, defaultCurrency) {
    return asArray(value).map(function normalizeExpense(expense, index) {
      var record = asObject(expense);

      return {
        id: asString(record.id, createId("expense", [index, record.title, record.amount])),
        tripId: record.tripId || null,
        title: asString(record.title, asString(record.name, asString(record.description, "مصروف"))),
        amount: Math.max(0, asNumber(firstDefined(record.amount, record.value, record.cost, record.total), 0)),
        category: asString(firstDefined(record.category, record.type), "other"),
        date: record.date || record.createdAt || record.paidAt || null,
        paid: record.paid !== false && record.status !== "cancelled",
        deleted: Boolean(record.deletedAt || record.isDeleted === true),
        currency: asString(record.currency, defaultCurrency || DEFAULT_CURRENCY)
      };
    });
  }

  function normalizeTrip(rawTrip, index, fallbackType, defaultCurrency) {
    var trip = asObject(rawTrip);
    var destination = isObject(trip.destination) ? trip.destination : {};
    var budgetObject = isObject(trip.budget) ? trip.budget : {};
    var dates = asObject(trip.dates);

    var startDate = normalizeDateString(firstDefined(
      trip.startDate,
      trip.departureDate,
      trip.fromDate,
      dates.start,
      dates.from
    ));

    var endDate = normalizeDateString(firstDefined(
      trip.endDate,
      trip.returnDate,
      trip.toDate,
      dates.end,
      dates.to
    ));

    var durationDays = Math.max(0, asNumber(firstDefined(trip.durationDays, trip.days), 0));

    if (!endDate && startDate && durationDays > 0) {
      var start = parseDate(startDate);
      var derived = new Date(start.getTime() + Math.max(0, durationDays - 1) * MS_PER_DAY);
      endDate = normalizeDateString(derived);
    }

    var expenses = normalizeExpenses(
      firstDefined(trip.expenses, budgetObject.expenses, trip.transactions),
      defaultCurrency
    );

    var rawBudget = isObject(trip.budget) ? undefined : trip.budget;
    var budget = Math.max(0, asNumber(firstDefined(
      trip.budgetAmount,
      rawBudget,
      budgetObject.total,
      budgetObject.amount,
      trip.totalBudget,
      trip.estimatedBudget
    ), 0));

    var spent = Math.max(0, asNumber(firstDefined(
      trip.spent,
      budgetObject.spent,
      expenses.reduce(function sum(total, expense) {
        return total + (expense.deleted ? 0 : expense.amount);
      }, 0)
    ), 0));

    var checklist = normalizeChecklist(firstDefined(
      trip.checklist,
      trip.packing,
      trip.tasks,
      []
    ));

    var status = asString(firstDefined(trip.status, trip.tripStatus, fallbackType), "planning").toLowerCase();
    var planningStatus = asString(trip.planningStatus, "").toLowerCase();

    var country = asString(firstDefined(
      trip.country,
      trip.destinationCountry,
      destination.country,
      trip.destinationName,
      destination.name,
      typeof trip.destination === "string" ? trip.destination : ""
    ), "");

    var city = asString(firstDefined(
      trip.city,
      trip.destinationCity,
      destination.city,
      trip.location
    ), "");

    var countryCode = asString(firstDefined(
      trip.countryCode,
      trip.destinationCountryCode,
      trip.guideCountryCode,
      destination.countryCode,
      destination.code
    ), "").toUpperCase();

    return {
      id: asString(trip.id, createId("trip", [index, trip.title, country, startDate])),
      title: asString(trip.title, asString(trip.name, country ? "رحلة " + country : "رحلة")),
      status: status,
      planningStatus: planningStatus,
      lifecycleStatus: asString(trip.lifecycleStatus, ""),
      startDate: startDate || null,
      endDate: endDate || null,
      durationDays: calculateDurationDays(startDate, endDate, durationDays),
      country: country,
      countryCode: countryCode,
      city: city,
      destination: country || city,
      travelers: Math.max(1, asNumber(firstDefined(trip.travelers, trip.people), 1)),
      budget: budget,
      estimatedBudget: Math.max(0, asNumber(firstDefined(trip.estimatedBudget, budget), budget)),
      spent: spent,
      currency: asString(firstDefined(trip.currency, budgetObject.currency), defaultCurrency || DEFAULT_CURRENCY),
      checklist: checklist,
      readiness: isObject(trip.readiness) ? safeClone(trip.readiness) : null,
      documents: asArray(firstDefined(trip.documents, trip.requiredDocuments)),
      activities: asArray(trip.activities),
      bookings: asArray(trip.bookings),
      flights: asArray(trip.flights || (trip.flight ? [trip.flight] : [])),
      hotels: asArray(trip.hotels || (trip.hotel ? [trip.hotel] : [])),
      hotelName: asString(firstDefined(trip.hotelName, trip.accommodationName), ""),
      accommodation: trip.accommodation || "",
      notes: asString(trip.notes, ""),
      source: typeof trip.source === "string"
        ? trip.source
        : asString(asObject(trip.source).engine, fallbackType || "trips"),
      sourceType: fallbackType || "trips",
      createdAt: trip.createdAt || null,
      updatedAt: trip.updatedAt || null,
      raw: trip
    };
  }

  function classifyTrip(trip) {
    var explicit = normalizeText(
      [
        trip.lifecycleStatus,
        trip.status,
        trip.planningStatus
      ].join(" ")
    );

    if (HIDDEN_STATUSES.some(function hidden(status) {
      return explicit.indexOf(status) !== -1;
    }) || explicit.indexOf("ملغي") !== -1) {
      return "cancelled";
    }

    if (COMPLETED_STATUSES.some(function complete(status) {
      return explicit.indexOf(status) !== -1;
    }) || explicit.indexOf("مكتمل") !== -1 || explicit.indexOf("منتهي") !== -1) {
      return "completed";
    }

    if (ACTIVE_STATUSES.some(function active(status) {
      return explicit.indexOf(status) !== -1;
    }) || explicit.indexOf("حالي") !== -1) {
      return "active";
    }

    var today = startOfDay(new Date());
    var start = parseDate(trip.startDate);
    var end = parseDate(trip.endDate);

    if (start && end && today >= startOfDay(start) && today <= startOfDay(end)) return "active";
    if (end && startOfDay(end) < today) return "completed";
    if (start && startOfDay(start) > today) return "upcoming";

    if (explicit.indexOf("wishlist") !== -1 || explicit.indexOf("wish") !== -1 || explicit.indexOf("امنيه") !== -1) {
      return "wishlist";
    }

    if (UPCOMING_STATUSES.some(function planned(status) {
      return explicit.indexOf(status) !== -1;
    })) {
      return trip.sourceType === "plannedTrips" ? "planned" : "upcoming";
    }

    return trip.sourceType === "plannedTrips" ? "planned" : "planned";
  }

  function collectTrips(state, profile) {
    var collected = [];
    var identityMap = new Map();

    function getIdentity(trip) {
      if (trip.id) return "id:" + trip.id;

      return [
        normalizeText(trip.title),
        normalizeText(trip.countryCode || trip.country),
        normalizeDateString(trip.startDate)
      ].join("|");
    }

    function addTrips(value, source) {
      asArray(value).forEach(function addTrip(item, index) {
        var trip = normalizeTrip(item, index, source, profile.currency);
        trip.lifecycle = classifyTrip(trip);

        var identity = getIdentity(trip);
        var existingIndex = identityMap.get(identity);

        if (existingIndex !== undefined) {
          var existing = collected[existingIndex];

          if (existing.sourceType === "plannedTrips" && source === "trips") {
            collected[existingIndex] = trip;
          }
          return;
        }

        identityMap.set(identity, collected.length);
        collected.push(trip);
      });
    }

    addTrips(state.trips, "trips");
    addTrips(state.plannedTrips, "plannedTrips");
    addTrips(state.upcomingTrips, "upcomingTrips");
    addTrips(state.completedTrips, "completedTrips");
    addTrips(state.pastTrips, "pastTrips");

    var travel = asObject(state.travel);
    addTrips(travel.trips, "travel.trips");
    addTrips(travel.plannedTrips, "travel.plannedTrips");

    return collected.sort(function sortTrips(a, b) {
      var aDate = dateValue(a.startDate, Number.MAX_SAFE_INTEGER);
      var bDate = dateValue(b.startDate, Number.MAX_SAFE_INTEGER);
      return aDate - bDate;
    });
  }

  function normalizeDestination(item, index) {
    var destination = isObject(item) ? item : { countryCode: item };

    return {
      id: asString(destination.id, createId("destination", [index, destination.name, destination.countryCode])),
      name: asString(firstDefined(destination.name, destination.countryName, destination.country, destination.title), "وجهة"),
      country: asString(firstDefined(destination.country, destination.countryName, destination.name), ""),
      city: asString(destination.city, ""),
      countryCode: asString(firstDefined(destination.countryCode, destination.code, destination.iso2), "").toUpperCase(),
      region: asString(destination.region, ""),
      rating: clamp(asNumber(firstDefined(destination.rating, destination.score), 0), 0, 100),
      visited: asBoolean(destination.visited, false),
      wishlist: asBoolean(destination.wishlist, false),
      raw: destination
    };
  }

  function collectDestinations(state, trips) {
    var values = [];
    var seen = new Set();

    function add(destination) {
      var key = normalizeText(destination.countryCode || destination.country || destination.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      values.push(destination);
    }

    asArray(state.destinations).forEach(function fromState(item, index) {
      add(normalizeDestination(item, index));
    });

    asArray(state.wishlist).forEach(function fromWishlist(item, index) {
      var normalized = normalizeDestination(item, index);
      normalized.wishlist = true;
      add(normalized);
    });

    asArray(trips).forEach(function fromTrip(trip, index) {
      if (!trip.country && !trip.destination) return;

      add({
        id: createId("destination", [index, trip.country, trip.countryCode]),
        name: trip.country || trip.destination,
        country: trip.country || trip.destination,
        city: trip.city,
        countryCode: trip.countryCode,
        region: "",
        rating: 0,
        visited: trip.lifecycle === "completed",
        wishlist: trip.lifecycle === "wishlist",
        raw: trip.raw
      });
    });

    return values;
  }

  function collectWallet(state, profile) {
    var wallet = asObject(state.budgetWallet);
    var transactions = asArray(wallet.transactions);
    var openingBalance = Math.max(0, asNumber(wallet.openingBalance, 0));

    var deposits = openingBalance;
    var withdrawals = 0;
    var expenses = 0;

    transactions.forEach(function totalTransaction(transaction) {
      var item = asObject(transaction);
      var amount = Math.max(0, asNumber(item.amount, 0));

      if (item.type === "deposit") deposits += amount;
      if (item.type === "withdrawal") withdrawals += amount;
      if (item.type === "expense") expenses += amount;
    });

    var calculatedBalance = Math.max(0, deposits - withdrawals - expenses);

    return {
      currency: asString(wallet.currency, profile.currency),
      openingBalance: openingBalance,
      balance: Math.max(0, asNumber(wallet.balance, calculatedBalance)),
      deposits: deposits,
      withdrawals: withdrawals,
      expenses: expenses,
      transactionCount: transactions.length,
      transactions: safeClone(transactions)
    };
  }

  function collectBudgetRecords(state) {
    if (Array.isArray(state.budgets)) return state.budgets;

    var budgets = asObject(state.budgets);
    return asArray(budgets.items || budgets.records || budgets.plans);
  }

  function collectSavingsEntries(state) {
    if (Array.isArray(state.savings)) return state.savings;

    var savings = asObject(state.savings);
    return asArray(
      firstDefined(
        savings.entries,
        savings.contributions,
        savings.transactions,
        savings.goals
      )
    );
  }

  function collectBudgets(state, trips, profile) {
    var budgetRoot = asObject(state.budgets);
    var savingsRoot = asObject(state.savings);
    var statistics = asObject(state.statistics);
    var wallet = collectWallet(state, profile);
    var budgetRecords = collectBudgetRecords(state);
    var savingsEntries = collectSavingsEntries(state);
    var currentYear = new Date().getFullYear();

    var relevantTrips = trips.filter(function relevantTrip(trip) {
      if (trip.lifecycle === "cancelled") return false;
      var date = parseDate(trip.startDate || trip.endDate);
      return !date || date.getFullYear() === currentYear;
    });

    var tripBudget = relevantTrips.reduce(function sum(total, trip) {
      return total + asNumber(trip.budget || trip.estimatedBudget, 0);
    }, 0);

    var tripSpent = relevantTrips.reduce(function sum(total, trip) {
      return total + asNumber(trip.spent, 0);
    }, 0);

    var explicitBudget = budgetRecords.reduce(function sum(total, budget) {
      var record = asObject(budget);
      return total + asNumber(firstDefined(record.amount, record.total, record.budget), 0);
    }, 0);

    var rootExpenses = normalizeExpenses(
      firstDefined(state.expenses, budgetRoot.expenses),
      profile.currency
    ).filter(function activeExpense(expense) {
      return !expense.deleted && expense.paid;
    });

    var explicitSpent = Math.max(
      asNumber(firstDefined(budgetRoot.totalSpent, statistics.totalTravelSpend), 0),
      rootExpenses.reduce(function sum(total, expense) {
        return total + expense.amount;
      }, 0)
    );

    var savingsEntriesTotal = savingsEntries.reduce(function sum(total, saving) {
      var record = asObject(saving);
      var amount = asNumber(firstDefined(record.currentAmount, record.amount, record.saved), 0);
      return record.type === "withdrawal" ? total - amount : total + amount;
    }, 0);

    var legacySavingsBalance = asNumber(firstDefined(
      savingsRoot.currentBalance,
      savingsRoot.balance,
      budgetRoot.savingsBalance
    ), 0);

    var savingsTotal = wallet.balance > 0
      ? wallet.balance
      : Math.max(0, legacySavingsBalance, savingsEntriesTotal);

    var savingsTarget = Math.max(0, asNumber(firstDefined(
      savingsRoot.targetAmount,
      budgetRoot.savingsTarget,
      profile.annualTravelBudget
    ), 0));

    var annualBudget = Math.max(0, asNumber(firstDefined(
      budgetRoot.annualBudget,
      statistics.annualTravelBudget,
      profile.annualTravelBudget
    ), 30000));

    var plannedBudget = Math.max(explicitBudget, tripBudget);
    var spent = Math.max(explicitSpent, tripSpent);

    return {
      annualBudget: annualBudget,
      plannedBudget: plannedBudget,
      spent: spent,
      remaining: annualBudget - spent,
      usagePercent: percentage(spent, annualBudget),
      committedPercent: percentage(plannedBudget, annualBudget),
      savingsTotal: savingsTotal,
      savingsTarget: savingsTarget,
      savingsProgress: percentage(savingsTotal, savingsTarget),
      monthlySaving: Math.max(0, asNumber(firstDefined(
        savingsRoot.monthlySaving,
        savingsRoot.monthlySavingTarget,
        profile.monthlySaving
      ), 0)),
      wallet: wallet,
      expenses: rootExpenses,
      budgetRecords: safeClone(budgetRecords),
      savingsEntries: safeClone(savingsEntries)
    };
  }

  function collectDocuments(state) {
    var documents = asArray(state.documents);
    var passportRoot = asObject(state.passport);
    var passportItems = asArray(firstDefined(
      state.passports,
      passportRoot.items,
      passportRoot.documents
    ));

    return documents.concat(passportItems).map(function normalizeDocument(item, index) {
      var document = asObject(item);
      var expiryDate = firstDefined(
        document.expiryDate,
        document.expiresAt,
        document.expirationDate,
        document.validUntil
      );

      var daysToExpiry = expiryDate ? daysUntil(expiryDate) : null;
      var status = asString(document.status, "valid").toLowerCase();

      if (daysToExpiry !== null && daysToExpiry < 0) {
        status = "expired";
      } else if (daysToExpiry !== null && daysToExpiry <= 30) {
        status = "critical";
      } else if (daysToExpiry !== null && daysToExpiry <= 180) {
        status = "expiring";
      } else if (document.valid === false || status === "invalid") {
        status = "invalid";
      } else {
        status = "valid";
      }

      return {
        id: asString(document.id, createId("document", [index, document.type, document.number])),
        type: asString(document.type, asString(document.title, "document")),
        title: asString(document.title, asString(document.name, "مستند")),
        countryCode: asString(document.countryCode, "").toUpperCase(),
        expiryDate: normalizeDateString(expiryDate) || null,
        daysToExpiry: daysToExpiry,
        status: status,
        required: document.required !== false,
        raw: document
      };
    });
  }

  function collectPacking(state, trips) {
    var packingRoot = state.packing;
    var globalPacking = [];

    if (Array.isArray(packingRoot)) {
      globalPacking = normalizeChecklist(packingRoot);
    } else if (isObject(packingRoot)) {
      globalPacking = normalizeChecklist(
        firstDefined(
          packingRoot.items,
          packingRoot.current,
          packingRoot.checklist
        )
      );

      asArray(packingRoot.lists).forEach(function fromList(list) {
        globalPacking = globalPacking.concat(normalizeChecklist(
          firstDefined(asObject(list).items, asObject(list).checklist)
        ));
      });
    }

    var tripPacking = [];

    trips.forEach(function collectTripPacking(trip) {
      trip.checklist.forEach(function append(item) {
        tripPacking.push(Object.assign({}, item, {
          tripId: trip.id,
          tripTitle: trip.title
        }));
      });
    });

    var all = globalPacking.concat(tripPacking);
    var completed = all.filter(function completedItem(item) {
      return item.completed;
    }).length;

    return {
      items: all,
      total: all.length,
      completed: completed,
      pending: Math.max(0, all.length - completed),
      progress: all.length ? percentage(completed, all.length) : 100
    };
  }

  function selectNextTrip(trips) {
    var future = trips
      .filter(function eligible(trip) {
        return ["upcoming", "planned", "active"].indexOf(trip.lifecycle) !== -1;
      })
      .filter(function hasValidDate(trip) {
        return parseDate(trip.startDate) !== null;
      })
      .sort(function nearest(a, b) {
        var aDays = daysUntil(a.startDate);
        var bDays = daysUntil(b.startDate);

        if (a.lifecycle === "active" && b.lifecycle !== "active") return -1;
        if (b.lifecycle === "active" && a.lifecycle !== "active") return 1;

        return asNumber(aDays, Number.MAX_SAFE_INTEGER) -
          asNumber(bDays, Number.MAX_SAFE_INTEGER);
      });

    return future[0] || null;
  }

  /* =========================================================
     Scores and analysis
  ========================================================= */

  function calculateChecklistScore(items) {
    var checklist = asArray(items);
    if (!checklist.length) return 70;

    var required = checklist.filter(function requiredItem(item) {
      return item.required !== false;
    });

    var relevant = required.length ? required : checklist;
    var completed = relevant.filter(function completedItem(item) {
      return item.completed;
    }).length;

    return round(percentage(completed, relevant.length), 0);
  }

  function calculateDocumentScore(documents, nextTrip) {
    var all = asArray(documents);
    if (!all.length) return nextTrip ? 45 : 70;

    var score = 100;

    all.forEach(function documentPenalty(document) {
      if (document.status === "expired" || document.status === "invalid") {
        score -= document.required ? 35 : 20;
      } else if (document.status === "critical") {
        score -= document.required ? 25 : 15;
      } else if (document.status === "expiring") {
        score -= document.required ? 12 : 8;
      }
    });

    return clamp(score, 0, 100);
  }

  function calculateBudgetScore(budget) {
    if (budget.annualBudget <= 0) return 55;
    if (budget.remaining < 0 || budget.usagePercent > 100) {
      return clamp(100 - (budget.usagePercent - 100) * 2.5, 0, 45);
    }
    if (budget.usagePercent >= 90) return 55;
    if (budget.usagePercent >= 75) return 72;
    if (budget.usagePercent >= 50) return 85;
    return 95;
  }

  function calculatePlanningScore(trip) {
    if (!trip) return 65;

    var hasHotel = trip.hotels.length > 0 || Boolean(trip.hotelName || trip.accommodation);

    var signals = [
      Boolean(trip.startDate),
      Boolean(trip.endDate || trip.durationDays),
      Boolean(trip.country || trip.destination),
      trip.budget > 0 || trip.estimatedBudget > 0,
      trip.travelers > 0,
      trip.activities.length > 0,
      trip.flights.length > 0,
      hasHotel
    ];

    return round((signals.filter(Boolean).length / signals.length) * 100, 0);
  }

  function calculateSavingsScore(budget, nextTrip) {
    if (budget.savingsTarget > 0) {
      return clamp(budget.savingsProgress, 0, 100);
    }

    if (nextTrip && (nextTrip.budget > 0 || nextTrip.estimatedBudget > 0)) {
      return clamp(
        percentage(budget.savingsTotal, nextTrip.budget || nextTrip.estimatedBudget),
        0,
        100
      );
    }

    return budget.monthlySaving > 0 ? 75 : 50;
  }

  function calculateExperienceScore(trips, destinations) {
    var completed = trips.filter(function completedTrip(trip) {
      return trip.lifecycle === "completed";
    }).length;

    var visitedCountries = unique(
      destinations
        .filter(function visited(destination) { return destination.visited; })
        .map(function countryKey(destination) {
          return destination.countryCode || normalizeText(destination.country);
        })
    ).length;

    return clamp(35 + completed * 6 + visitedCountries * 4, 35, 100);
  }

  function calculateTripReadiness(trip, documents) {
    if (!trip) {
      return {
        score: 0,
        status: "none",
        checklistScore: 0,
        documentScore: 0,
        budgetScore: 0,
        planningScore: 0,
        daysUntil: null
      };
    }

    var checklistScore = trip.readiness && Number.isFinite(Number(trip.readiness.percentage))
      ? clamp(trip.readiness.percentage, 0, 100)
      : calculateChecklistScore(trip.checklist);

    var documentScore = calculateDocumentScore(documents, trip);
    var tripBudget = trip.budget || trip.estimatedBudget;

    var budgetScore = tripBudget > 0
      ? clamp(100 - Math.max(0, percentage(trip.spent, tripBudget) - 85) * 2, 0, 100)
      : 60;

    var planningScore = calculatePlanningScore(trip);

    var score = weightedScore([
      { score: checklistScore, weight: 0.30 },
      { score: documentScore, weight: 0.30 },
      { score: budgetScore, weight: 0.18 },
      { score: planningScore, weight: 0.22 }
    ]);

    var status = score >= 85
      ? "excellent"
      : score >= 70
        ? "good"
        : score >= 50
          ? "attention"
          : "critical";

    return {
      score: score,
      status: status,
      checklistScore: round(checklistScore, 0),
      documentScore: round(documentScore, 0),
      budgetScore: round(budgetScore, 0),
      planningScore: planningScore,
      daysUntil: daysUntil(trip.startDate)
    };
  }

  /* =========================================================
     Insights, alerts and recommendations
  ========================================================= */

  function makeInsight(type, title, message, options) {
    var settings = asObject(options);
    var level = asString(settings.level, "info");

    return {
      id: asString(settings.id, createId("insight", [type, title, message])),
      type: asString(type, "general"),
      level: level,
      priority: asNumber(settings.priority, LEVEL_ORDER[level] || 1),
      title: asString(title, "معلومة"),
      message: asString(message, ""),
      value: settings.value === undefined ? null : settings.value,
      metric: asString(settings.metric, ""),
      action: settings.action || null,
      entityId: settings.entityId || null,
      generatedAt: nowIso()
    };
  }

  function makeRecommendation(type, title, message, options) {
    var settings = asObject(options);

    return {
      id: asString(settings.id, createId("recommendation", [type, title, message])),
      type: asString(type, "general"),
      priority: clamp(asNumber(settings.priority, 50), 0, 100),
      title: asString(title, "توصية"),
      message: asString(message, ""),
      reason: asString(settings.reason, ""),
      action: settings.action || null,
      entityId: settings.entityId || null,
      expiresAt: settings.expiresAt || null,
      generatedAt: nowIso()
    };
  }

  function buildInsights(context) {
    var insights = [];
    var profile = context.profile;
    var budget = context.budget;
    var nextTrip = context.nextTrip;
    var readiness = context.readiness;
    var locale = profile.language === "ar" ? "ar-AE" : "en-US";

    if (nextTrip) {
      var tripDays = daysUntil(nextTrip.startDate);
      var tripDateText = formatDate(nextTrip.startDate, locale);

      insights.push(makeInsight(
        "next-trip",
        "رحلتك القادمة",
        nextTrip.title + " بتاريخ " + tripDateText +
          (tripDays !== null
            ? "، والمتبقي " + Math.max(0, tripDays) + " يوم."
            : "."),
        {
          level: tripDays !== null && tripDays <= 14 ? "attention" : "info",
          priority: tripDays !== null && tripDays <= 7 ? 4 : 2,
          value: tripDays,
          metric: "daysUntilTrip",
          entityId: nextTrip.id,
          action: { type: "open-trip", tripId: nextTrip.id }
        }
      ));

      insights.push(makeInsight(
        "readiness",
        "جاهزية الرحلة",
        "جاهزية " + nextTrip.title + " حالياً " + readiness.score + "%.",
        {
          level: readiness.score >= 80
            ? "success"
            : readiness.score >= 60
              ? "attention"
              : "warning",
          value: readiness.score,
          metric: "tripReadiness",
          entityId: nextTrip.id,
          action: { type: "open-trip", tripId: nextTrip.id }
        }
      ));
    } else {
      insights.push(makeInsight(
        "planning",
        "لا توجد رحلة قادمة مؤكدة",
        "يمكنك إضافة رحلة مخططة أو تحويل إحدى وجهات قائمة الأمنيات إلى خطة سفر.",
        {
          level: "info",
          priority: 1,
          action: { type: "new-trip" }
        }
      ));
    }

    insights.push(makeInsight(
      "budget",
      "استخدام ميزانية السفر",
      "تم صرف " + formatCurrency(budget.spent, profile.currency, locale) +
        " من ميزانية سنوية قدرها " +
        formatCurrency(budget.annualBudget, profile.currency, locale) + ".",
      {
        level: budget.usagePercent > 100
          ? "critical"
          : budget.usagePercent >= 85
            ? "warning"
            : "info",
        priority: budget.usagePercent > 100 ? 5 : budget.usagePercent >= 85 ? 4 : 2,
        value: round(budget.usagePercent, 0),
        metric: "annualBudgetUsage",
        action: { type: "open-budget" }
      }
    ));

    insights.push(makeInsight(
      "wallet",
      "رصيد السفر الحالي",
      "رصيد محفظة السفر الحالي " +
        formatCurrency(budget.wallet.balance, budget.wallet.currency, locale) + ".",
      {
        level: budget.wallet.balance > 0 ? "success" : "info",
        priority: 2,
        value: budget.wallet.balance,
        metric: "travelWalletBalance",
        action: { type: "open-budget" }
      }
    ));

    if (budget.savingsTarget > 0 || budget.savingsTotal > 0) {
      insights.push(makeInsight(
        "savings",
        "تقدم ادخار السفر",
        "وصل ادخار السفر إلى " +
          formatCurrency(budget.savingsTotal, profile.currency, locale) +
          (budget.savingsTarget > 0
            ? " من هدف " + formatCurrency(budget.savingsTarget, profile.currency, locale) + "."
            : "."),
        {
          level: budget.savingsProgress >= 75 ? "success" : "info",
          value: round(budget.savingsProgress, 0),
          metric: "savingsProgress",
          action: { type: "open-budget" }
        }
      ));
    }

    var expiringDocuments = context.documents.filter(function expiring(document) {
      return ["expired", "critical", "expiring", "invalid"].indexOf(document.status) !== -1;
    });

    if (expiringDocuments.length) {
      insights.push(makeInsight(
        "documents",
        "مستندات تحتاج متابعة",
        "يوجد " + expiringDocuments.length + " مستند سفر يحتاج مراجعة أو تجديد.",
        {
          level: expiringDocuments.some(function critical(document) {
            return ["expired", "critical", "invalid"].indexOf(document.status) !== -1;
          }) ? "critical" : "warning",
          priority: 5,
          value: expiringDocuments.length,
          metric: "documentsAttention",
          action: { type: "open-documents" }
        }
      ));
    }

    if (context.packing.total > 0) {
      insights.push(makeInsight(
        "packing",
        "تقدم التجهيز",
        "تم إنجاز " + context.packing.completed + " من " +
          context.packing.total + " عناصر تجهيز.",
        {
          level: context.packing.progress >= 80 ? "success" : "info",
          value: round(context.packing.progress, 0),
          metric: "packingProgress",
          action: { type: "open-packing" }
        }
      ));
    }

    insights.push(makeInsight(
      "passport",
      "سجل السفر",
      "لديك " + context.statistics.completedTrips + " رحلة مكتملة و" +
        context.statistics.visitedCountries + " دولة مسجلة.",
      {
        level: "info",
        value: context.statistics.visitedCountries,
        metric: "visitedCountries",
        action: { type: "open-passport" }
      }
    ));

    return sortByPriority(insights);
  }

  function buildAlerts(context) {
    var alerts = [];
    var nextTrip = context.nextTrip;
    var readiness = context.readiness;
    var budget = context.budget;

    context.documents.forEach(function documentAlert(document) {
      if (document.status === "expired" || document.status === "invalid") {
        alerts.push(makeInsight(
          "document-expired",
          "مستند غير صالح",
          document.title + " منتهي أو غير صالح ويحتاج إجراء فوري.",
          {
            level: "critical",
            priority: 5,
            entityId: document.id,
            action: { type: "open-documents" }
          }
        ));
      } else if (document.status === "critical") {
        alerts.push(makeInsight(
          "document-expiry",
          "مستند قريب الانتهاء",
          document.title + " ينتهي خلال " + Math.max(0, document.daysToExpiry) + " يوم.",
          {
            level: "danger",
            priority: 4,
            entityId: document.id,
            action: { type: "open-documents" }
          }
        ));
      } else if (document.status === "expiring") {
        alerts.push(makeInsight(
          "document-expiry",
          "تذكير بتجديد مستند",
          document.title + " سينتهي خلال " + document.daysToExpiry + " يوم.",
          {
            level: "warning",
            priority: 3,
            entityId: document.id,
            action: { type: "open-documents" }
          }
        ));
      }
    });

    if (budget.remaining < 0) {
      alerts.push(makeInsight(
        "budget-overrun",
        "تجاوز ميزانية السفر السنوية",
        "تجاوز الصرف الميزانية بمبلغ " +
          formatCurrency(Math.abs(budget.remaining), context.profile.currency, "ar-AE") + ".",
        {
          level: "critical",
          priority: 5,
          value: Math.abs(budget.remaining),
          metric: "budgetOverrun",
          action: { type: "open-budget" }
        }
      ));
    } else if (budget.usagePercent >= 90) {
      alerts.push(makeInsight(
        "budget-near-limit",
        "ميزانية السفر قريبة من الحد",
        "تم استخدام " + round(budget.usagePercent, 0) + "% من الميزانية السنوية.",
        {
          level: "warning",
          priority: 4,
          value: round(budget.usagePercent, 0),
          metric: "annualBudgetUsage",
          action: { type: "open-budget" }
        }
      ));
    }

    if (nextTrip) {
      var remainingDays = daysUntil(nextTrip.startDate);

      if (remainingDays !== null && remainingDays <= 14 && readiness.score < 70) {
        alerts.push(makeInsight(
          "trip-readiness",
          "الرحلة قريبة والجاهزية منخفضة",
          "متبقي " + Math.max(0, remainingDays) +
            " يوم على " + nextTrip.title +
            " والجاهزية الحالية " + readiness.score + "%.",
          {
            level: remainingDays <= 7 ? "critical" : "warning",
            priority: remainingDays <= 7 ? 5 : 4,
            entityId: nextTrip.id,
            action: { type: "open-trip", tripId: nextTrip.id }
          }
        ));
      }

      var incompleteRequired = nextTrip.checklist.filter(function incomplete(item) {
        return item.required !== false && !item.completed;
      });

      if (remainingDays !== null && remainingDays <= 7 && incompleteRequired.length) {
        alerts.push(makeInsight(
          "packing-pending",
          "عناصر تجهيز قبل السفر",
          "يوجد " + incompleteRequired.length + " عنصر ضروري غير مكتمل قبل الرحلة.",
          {
            level: "warning",
            priority: 4,
            entityId: nextTrip.id,
            action: { type: "open-packing", tripId: nextTrip.id }
          }
        ));
      }

      var tripBudget = nextTrip.budget || nextTrip.estimatedBudget;

      if (tripBudget > 0 && nextTrip.spent > tripBudget) {
        alerts.push(makeInsight(
          "trip-budget-overrun",
          "تجاوز ميزانية الرحلة",
          nextTrip.title + " تجاوزت ميزانيتها المحددة.",
          {
            level: "danger",
            priority: 4,
            entityId: nextTrip.id,
            action: { type: "open-budget", tripId: nextTrip.id }
          }
        ));
      }
    }

    return sortByPriority(alerts);
  }

  function buildRecommendations(context) {
    var recommendations = [];
    var nextTrip = context.nextTrip;
    var readiness = context.readiness;
    var budget = context.budget;

    if (!nextTrip) {
      recommendations.push(makeRecommendation(
        "create-trip",
        "خطط لرحلتك القادمة",
        "أضف رحلة جديدة وحدد التواريخ والميزانية والمسافرين لتبدأ المتابعة الذكية.",
        {
          priority: 90,
          reason: "لا توجد رحلة قادمة مؤكدة.",
          action: { type: "new-trip" }
        }
      ));
    } else {
      if (readiness.planningScore < 80) {
        recommendations.push(makeRecommendation(
          "complete-plan",
          "أكمل تفاصيل الرحلة",
          "أضف الحجوزات والأنشطة والميزانية لتحسين خطة " + nextTrip.title + ".",
          {
            priority: 88,
            reason: "درجة اكتمال الخطة " + readiness.planningScore + "%.",
            entityId: nextTrip.id,
            action: { type: "open-trip", tripId: nextTrip.id }
          }
        ));
      }

      if (readiness.checklistScore < 75) {
        recommendations.push(makeRecommendation(
          "packing",
          "أكمل قائمة التجهيز",
          "رتب العناصر المتبقية حسب الضرورة قبل موعد السفر.",
          {
            priority: 84,
            reason: "تقدم قائمة التجهيز " + readiness.checklistScore + "%.",
            entityId: nextTrip.id,
            action: { type: "open-packing", tripId: nextTrip.id }
          }
        ));
      }

      if (readiness.documentScore < 80) {
        recommendations.push(makeRecommendation(
          "documents",
          "راجع صلاحية مستندات السفر",
          "تأكد من صلاحية الجواز والتأشيرة وبقية المستندات قبل الرحلة.",
          {
            priority: 95,
            reason: "درجة جاهزية المستندات " + readiness.documentScore + "%.",
            entityId: nextTrip.id,
            action: { type: "open-documents" }
          }
        ));
      }

      if ((nextTrip.budget || nextTrip.estimatedBudget) <= 0) {
        recommendations.push(makeRecommendation(
          "trip-budget",
          "حدد ميزانية الرحلة",
          "ضع سقفاً واضحاً للرحلة حتى يتمكن النظام من متابعة الصرف والتوقعات.",
          {
            priority: 82,
            reason: "لا توجد ميزانية محددة للرحلة.",
            entityId: nextTrip.id,
            action: { type: "open-budget", tripId: nextTrip.id }
          }
        ));
      }
    }

    if (budget.usagePercent >= 80) {
      recommendations.push(makeRecommendation(
        "budget-control",
        "راجع المصروفات القادمة",
        "قلل الالتزامات غير الضرورية أو ارفع الادخار قبل إضافة حجوزات جديدة.",
        {
          priority: 92,
          reason: "استخدام الميزانية السنوية وصل إلى " + round(budget.usagePercent, 0) + "%.",
          action: { type: "open-budget" }
        }
      ));
    }

    if (budget.monthlySaving <= 0) {
      recommendations.push(makeRecommendation(
        "start-saving",
        "فعّل ادخار السفر الشهري",
        "حدد مبلغاً شهرياً ثابتاً لدعم الرحلات القادمة وتقليل الضغط على الميزانية.",
        {
          priority: 70,
          reason: "لا يوجد مبلغ ادخار شهري مسجل.",
          action: { type: "open-budget" }
        }
      ));
    }

    if (context.statistics.wishlistCount > 0 && !nextTrip) {
      recommendations.push(makeRecommendation(
        "wishlist-conversion",
        "حوّل أمنية إلى رحلة مخططة",
        "اختر إحدى وجهات قائمة الأمنيات وابدأ بناء خطة قابلة للتنفيذ.",
        {
          priority: 76,
          reason: "لديك وجهات محفوظة بدون رحلة قادمة.",
          action: { type: "open-wishlist" }
        }
      ));
    }

    return sortByPriority(recommendations).slice(0, MAX_PERSISTED_ITEMS);
  }

  /* =========================================================
     Context and snapshot
  ========================================================= */

  function getAnalyticsSummary(state, context) {
    var analytics = getAnalytics();
    var fallback = {
      totalTrips: context.trips.length,
      completedTrips: context.statistics.completedTrips,
      upcomingTrips: context.statistics.upcomingTrips,
      visitedCountries: context.statistics.visitedCountries,
      totalSpent: context.budget.spent,
      annualBudgetUsage: context.budget.usagePercent
    };

    if (!analytics) return fallback;

    return Object.assign(
      {},
      fallback,
      asObject(
        safeCall(analytics.getSummary, {}, analytics, [state]) ||
        safeCall(analytics.summary, {}, analytics, [state]) ||
        safeCall(analytics.calculate, {}, analytics, [state])
      )
    );
  }

  function buildContext(state) {
    var config = getGlobalConfig();
    var profile = normalizeProfile(state, config);
    var trips = collectTrips(state, profile);
    var destinations = collectDestinations(state, trips);
    var documents = collectDocuments(state);
    var packing = collectPacking(state, trips);
    var budget = collectBudgets(state, trips, profile);
    var nextTrip = selectNextTrip(trips);
    var readiness = calculateTripReadiness(nextTrip, documents);

    var completedTrips = trips.filter(function completed(trip) {
      return trip.lifecycle === "completed";
    });

    var upcomingTrips = trips.filter(function upcoming(trip) {
      return ["upcoming", "planned", "active"].indexOf(trip.lifecycle) !== -1;
    });

    var visitedCountries = unique(
      completedTrips.map(function countryKey(trip) {
        return trip.countryCode || normalizeText(trip.country || trip.destination);
      })
    ).filter(Boolean).length;

    var wishlistCount = asArray(state.wishlist).length +
      trips.filter(function wishlist(trip) {
        return trip.lifecycle === "wishlist";
      }).length;

    var statistics = {
      totalTrips: trips.filter(function visible(trip) {
        return trip.lifecycle !== "cancelled";
      }).length,
      completedTrips: completedTrips.length,
      upcomingTrips: upcomingTrips.length,
      activeTrips: trips.filter(function active(trip) {
        return trip.lifecycle === "active";
      }).length,
      plannedTrips: trips.filter(function planned(trip) {
        return trip.lifecycle === "planned";
      }).length,
      visitedCountries: visitedCountries,
      wishlistCount: wishlistCount,
      totalDestinations: destinations.length
    };

    var scores = {
      readiness: readiness.score,
      budget: calculateBudgetScore(budget),
      documents: calculateDocumentScore(documents, nextTrip),
      packing: packing.progress,
      planning: calculatePlanningScore(nextTrip),
      savings: calculateSavingsScore(budget, nextTrip),
      experience: calculateExperienceScore(trips, destinations)
    };

    scores.overall = weightedScore([
      { score: scores.readiness, weight: DEFAULT_WEIGHTS.readiness },
      { score: scores.budget, weight: DEFAULT_WEIGHTS.budget },
      { score: scores.documents, weight: DEFAULT_WEIGHTS.documents },
      { score: scores.packing, weight: DEFAULT_WEIGHTS.packing },
      { score: scores.planning, weight: DEFAULT_WEIGHTS.planning },
      { score: scores.savings, weight: DEFAULT_WEIGHTS.savings },
      { score: scores.experience, weight: DEFAULT_WEIGHTS.experience }
    ]);

    var context = {
      state: state,
      config: config,
      profile: profile,
      trips: trips,
      destinations: destinations,
      documents: documents,
      packing: packing,
      budget: budget,
      nextTrip: nextTrip,
      readiness: readiness,
      statistics: statistics,
      scores: scores
    };

    context.analytics = getAnalyticsSummary(state, context);
    return context;
  }

  function buildSnapshot() {
    var state = readStoreState();
    var context = buildContext(state);
    var insights = buildInsights(context);
    var alerts = buildAlerts(context);
    var recommendations = buildRecommendations(context);

    runtime.revision += 1;

    return {
      module: MODULE_NAME,
      version: VERSION,
      revision: runtime.revision,
      generatedAt: nowIso(),
      profile: safeClone(context.profile),
      summary: {
        nextTrip: context.nextTrip ? {
          id: context.nextTrip.id,
          title: context.nextTrip.title,
          destination: context.nextTrip.destination,
          countryCode: context.nextTrip.countryCode,
          startDate: context.nextTrip.startDate,
          endDate: context.nextTrip.endDate,
          daysUntil: daysUntil(context.nextTrip.startDate),
          readiness: context.readiness.score
        } : null,
        totalTrips: context.statistics.totalTrips,
        completedTrips: context.statistics.completedTrips,
        upcomingTrips: context.statistics.upcomingTrips,
        activeTrips: context.statistics.activeTrips,
        plannedTrips: context.statistics.plannedTrips,
        visitedCountries: context.statistics.visitedCountries,
        wishlistCount: context.statistics.wishlistCount,
        annualBudget: context.budget.annualBudget,
        spent: context.budget.spent,
        remaining: context.budget.remaining,
        budgetUsage: round(context.budget.usagePercent, 0),
        travelBalance: context.budget.wallet.balance,
        savingsTotal: context.budget.savingsTotal,
        packingProgress: round(context.packing.progress, 0),
        documentIssues: context.documents.filter(function documentIssue(document) {
          return document.status !== "valid";
        }).length
      },
      scores: safeClone(context.scores),
      readiness: safeClone(context.readiness),
      statistics: safeClone(context.statistics),
      insights: insights,
      alerts: alerts,
      recommendations: recommendations,
      context: context
    };
  }

  /* =========================================================
     Refresh, subscriptions and events
  ========================================================= */

  function notifyListeners(snapshot, reason) {
    runtime.listeners.forEach(function notify(listener) {
      try {
        listener(safeClone(snapshot), {
          reason: asString(reason, "refresh"),
          revision: snapshot.revision,
          generatedAt: snapshot.generatedAt
        });
      } catch (error) {
        rememberError(error);
      }
    });
  }

  function emitEvent(name, payload) {
    var emitted = false;
    var events = getEvents();

    if (events) {
      emitted = Boolean(
        safeCall(events.emit, false, events, [name, payload]) ||
        safeCall(events.publish, false, events, [name, payload]) ||
        safeCall(events.dispatch, false, events, [name, payload])
      );
    }

    if (typeof global.dispatchEvent === "function" && typeof global.CustomEvent === "function") {
      try {
        global.dispatchEvent(new global.CustomEvent(name, { detail: safeClone(payload) }));
        emitted = true;
      } catch (error) {
        rememberError(error);
      }
    }

    return emitted;
  }

  function refresh(reason) {
    if (runtime.destroyed) return null;
    if (runtime.refreshing) return safeClone(runtime.snapshot);

    runtime.refreshing = true;

    try {
      var previous = runtime.snapshot;
      var snapshot = buildSnapshot();

      runtime.snapshot = snapshot;
      runtime.lastRefreshReason = asString(reason, "refresh");
      runtime.lastRefreshAt = snapshot.generatedAt;

      persistSnapshot(snapshot);
      notifyListeners(snapshot, runtime.lastRefreshReason);

      emitEvent("travel-brain:updated", {
        reason: runtime.lastRefreshReason,
        revision: snapshot.revision,
        generatedAt: snapshot.generatedAt,
        summary: snapshot.summary,
        scores: snapshot.scores,
        previousRevision: previous ? previous.revision : null
      });

      return safeClone(snapshot);
    } catch (error) {
      rememberError(error);
      return runtime.snapshot ? safeClone(runtime.snapshot) : null;
    } finally {
      runtime.refreshing = false;
    }
  }

  function scheduleRefresh(reason, delay) {
    if (runtime.destroyed) return false;

    if (runtime.refreshTimer) {
      global.clearTimeout(runtime.refreshTimer);
    }

    runtime.refreshTimer = global.setTimeout(function scheduled() {
      runtime.refreshTimer = null;
      refresh(reason || "scheduled");
    }, Math.max(0, asNumber(delay, DEFAULT_REFRESH_DELAY)));

    return true;
  }

  function subscribeToStore() {
    var store = getStore();

    if (!store || typeof store.subscribe !== "function") return;

    runtime.unsubscribeStore = safeCall(
      store.subscribe,
      null,
      store,
      [function onStoreChange() {
        scheduleRefresh("store-change", 45);
      }]
    );
  }

  function subscribeToEvents() {
    var events = getEvents();

    var eventNames = [
      "store:updated",
      "store:changed",
      "tic:store-change",
      "trip:created",
      "trip:updated",
      "trip:deleted",
      "planned-trip:updated",
      "budget:updated",
      "tic:budget-wallet-changed",
      "expense:created",
      "savings:updated",
      "documents:updated",
      "packing:updated",
      "wishlist:updated",
      "guide:updated"
    ];

    if (events) {
      eventNames.forEach(function bind(eventName) {
        var handler = function onEvent() {
          scheduleRefresh(eventName, 55);
        };

        var unsubscribe =
          safeCall(events.on, null, events, [eventName, handler]) ||
          safeCall(events.subscribe, null, events, [eventName, handler]);

        if (typeof unsubscribe === "function") {
          runtime.eventUnsubscribers.push(unsubscribe);
        }
      });
    }

    if (typeof global.addEventListener === "function") {
      eventNames.forEach(function bindDom(eventName) {
        var handler = function onDomEvent() {
          scheduleRefresh(eventName, 55);
        };

        global.addEventListener(eventName, handler);
        runtime.domListeners.push({ name: eventName, handler: handler });
      });
    }
  }

  function init(options) {
    if (runtime.initialized && !runtime.destroyed) return getSnapshot();

    runtime.destroyed = false;
    runtime.initialized = true;

    subscribeToStore();
    subscribeToEvents();

    var settings = asObject(options);
    var snapshot = refresh("init");

    if (settings.emitReady !== false) {
      emitEvent("travel-brain:ready", {
        version: VERSION,
        generatedAt: snapshot ? snapshot.generatedAt : nowIso()
      });
    }

    return snapshot;
  }

  function destroy() {
    if (runtime.refreshTimer) {
      global.clearTimeout(runtime.refreshTimer);
      runtime.refreshTimer = null;
    }

    if (typeof runtime.unsubscribeStore === "function") {
      safeCall(runtime.unsubscribeStore, null);
    }

    runtime.eventUnsubscribers.forEach(function unsubscribe(fn) {
      safeCall(fn, null);
    });

    runtime.domListeners.forEach(function removeDomListener(item) {
      if (typeof global.removeEventListener === "function") {
        global.removeEventListener(item.name, item.handler);
      }
    });

    runtime.unsubscribeStore = null;
    runtime.eventUnsubscribers = [];
    runtime.domListeners = [];
    runtime.listeners.clear();
    runtime.destroyed = true;
    runtime.initialized = false;

    return true;
  }

  function ensureSnapshot() {
    if (!runtime.snapshot) init();
    return runtime.snapshot;
  }

  /* =========================================================
     Public getters and analyses
  ========================================================= */

  function getSnapshot() {
    return safeClone(ensureSnapshot());
  }

  function getContext() {
    var snapshot = ensureSnapshot();
    return snapshot ? safeClone(snapshot.context) : null;
  }

  function getInsights(options) {
    var settings = asObject(options);
    var items = ensureSnapshot().insights.slice();

    if (settings.type) {
      items = items.filter(function byType(item) { return item.type === settings.type; });
    }

    if (settings.level) {
      items = items.filter(function byLevel(item) { return item.level === settings.level; });
    }

    if (settings.minimumPriority !== undefined) {
      items = items.filter(function byPriority(item) {
        return item.priority >= asNumber(settings.minimumPriority, 0);
      });
    }

    if (settings.limit !== undefined) {
      items = items.slice(0, Math.max(0, asNumber(settings.limit, items.length)));
    }

    return safeClone(items);
  }

  function getAlerts(options) {
    var settings = asObject(options);
    var items = ensureSnapshot().alerts.slice();

    if (settings.type) {
      items = items.filter(function byType(item) { return item.type === settings.type; });
    }

    if (settings.level) {
      items = items.filter(function byLevel(item) { return item.level === settings.level; });
    }

    if (settings.minimumPriority !== undefined) {
      items = items.filter(function byPriority(item) {
        return item.priority >= asNumber(settings.minimumPriority, 0);
      });
    }

    if (settings.limit !== undefined) {
      items = items.slice(0, Math.max(0, asNumber(settings.limit, items.length)));
    }

    return safeClone(items);
  }

  function getRecommendations(options) {
    var settings = asObject(options);
    var items = ensureSnapshot().recommendations.slice();

    if (settings.type) {
      items = items.filter(function byType(item) { return item.type === settings.type; });
    }

    if (settings.minimumPriority !== undefined) {
      items = items.filter(function byPriority(item) {
        return item.priority >= asNumber(settings.minimumPriority, 0);
      });
    }

    if (settings.limit !== undefined) {
      items = items.slice(0, Math.max(0, asNumber(settings.limit, items.length)));
    }

    return safeClone(items);
  }

  function resolveTrip(tripOrId) {
    var snapshot = ensureSnapshot();
    if (!snapshot) return null;

    if (isObject(tripOrId)) {
      var external = normalizeTrip(
        tripOrId,
        0,
        "external",
        snapshot.context.profile.currency
      );
      external.lifecycle = classifyTrip(external);
      return external;
    }

    var id = asString(tripOrId, "");

    return snapshot.context.trips.find(function findTrip(trip) {
      return String(trip.id) === String(id);
    }) || null;
  }

  function getTripAnalysis(tripOrId) {
    var trip = resolveTrip(tripOrId);
    var snapshot = ensureSnapshot();

    if (!trip || !snapshot) return null;

    var readiness = calculateTripReadiness(trip, snapshot.context.documents);
    var totalBudget = trip.budget || trip.estimatedBudget;
    var remainingBudget = totalBudget - trip.spent;
    var duration = calculateDurationDays(trip.startDate, trip.endDate, trip.durationDays);

    var result = {
      trip: safeClone(trip),
      lifecycle: classifyTrip(trip),
      daysUntil: daysUntil(trip.startDate),
      durationDays: duration || null,
      readiness: readiness,
      budget: {
        total: totalBudget,
        spent: trip.spent,
        remaining: remainingBudget,
        usagePercent: percentage(trip.spent, totalBudget),
        dailyBudget: duration && totalBudget > 0 ? round(totalBudget / duration, 2) : 0,
        dailySpent: duration && trip.spent > 0 ? round(trip.spent / duration, 2) : 0
      },
      checklist: {
        total: trip.checklist.length,
        completed: trip.checklist.filter(function completed(item) { return item.completed; }).length,
        pending: trip.checklist.filter(function pending(item) { return !item.completed; }).length,
        progress: calculateChecklistScore(trip.checklist)
      },
      planning: {
        score: calculatePlanningScore(trip),
        hasDates: Boolean(trip.startDate && (trip.endDate || trip.durationDays)),
        hasBudget: totalBudget > 0,
        hasFlights: trip.flights.length > 0,
        hasHotels: trip.hotels.length > 0 || Boolean(trip.hotelName || trip.accommodation),
        hasActivities: trip.activities.length > 0
      },
      risks: []
    };

    if (result.daysUntil !== null && result.daysUntil <= 14 && readiness.score < 70) {
      result.risks.push({
        type: "readiness",
        level: result.daysUntil <= 7 ? "critical" : "warning",
        message: "موعد الرحلة قريب والجاهزية تحتاج تحسين."
      });
    }

    if (totalBudget > 0 && remainingBudget < 0) {
      result.risks.push({
        type: "budget",
        level: "danger",
        message: "تم تجاوز ميزانية الرحلة."
      });
    }

    if (!result.planning.hasFlights && result.daysUntil !== null && result.daysUntil <= 30) {
      result.risks.push({
        type: "flight",
        level: "attention",
        message: "لا يوجد حجز طيران مسجل."
      });
    }

    if (!result.planning.hasHotels && result.daysUntil !== null && result.daysUntil <= 30) {
      result.risks.push({
        type: "hotel",
        level: "attention",
        message: "لا يوجد حجز سكن مسجل."
      });
    }

    return safeClone(result);
  }

  function getDestinationAnalysis(destinationOrCode) {
    var snapshot = ensureSnapshot();
    if (!snapshot) return null;

    var key = normalizeText(
      isObject(destinationOrCode)
        ? firstDefined(
            destinationOrCode.countryCode,
            destinationOrCode.country,
            destinationOrCode.name
          )
        : destinationOrCode
    );

    var destination = snapshot.context.destinations.find(function findDestination(item) {
      return [item.countryCode, item.country, item.name, item.city].some(function match(value) {
        return normalizeText(value) === key;
      });
    });

    if (!destination && isObject(destinationOrCode)) {
      destination = normalizeDestination(destinationOrCode, 0);
    }

    if (!destination) return null;

    var relatedTrips = snapshot.context.trips.filter(function related(trip) {
      var tripKeys = [trip.countryCode, trip.country, trip.destination, trip.city].map(normalizeText);
      var destinationKeys = [
        destination.countryCode,
        destination.country,
        destination.name,
        destination.city
      ].map(normalizeText);

      return tripKeys.some(function overlap(value) {
        return value && destinationKeys.indexOf(value) !== -1;
      });
    });

    var completed = relatedTrips.filter(function completedTrip(trip) {
      return trip.lifecycle === "completed";
    });

    var upcoming = relatedTrips.filter(function upcomingTrip(trip) {
      return ["upcoming", "planned", "active"].indexOf(trip.lifecycle) !== -1;
    });

    var totalSpent = relatedTrips.reduce(function sum(total, trip) {
      return total + trip.spent;
    }, 0);

    var totalBudget = relatedTrips.reduce(function sum(total, trip) {
      return total + (trip.budget || trip.estimatedBudget);
    }, 0);

    return safeClone({
      destination: destination,
      trips: relatedTrips,
      statistics: {
        totalTrips: relatedTrips.length,
        completedTrips: completed.length,
        upcomingTrips: upcoming.length,
        totalSpent: totalSpent,
        totalBudget: totalBudget,
        averageTripBudget: relatedTrips.length ? round(totalBudget / relatedTrips.length, 2) : 0
      },
      relationship: completed.length
        ? "visited"
        : upcoming.length
          ? "planned"
          : destination.wishlist
            ? "wishlist"
            : "known"
    });
  }

  function getBudgetAnalysis() {
    var snapshot = ensureSnapshot();
    if (!snapshot) return null;

    var budget = snapshot.context.budget;
    var profile = snapshot.context.profile;
    var locale = profile.language === "ar" ? "ar-AE" : "en-US";

    return safeClone({
      annualBudget: budget.annualBudget,
      plannedBudget: budget.plannedBudget,
      spent: budget.spent,
      remaining: budget.remaining,
      usagePercent: round(budget.usagePercent, 1),
      committedPercent: round(budget.committedPercent, 1),
      savingsTotal: budget.savingsTotal,
      savingsTarget: budget.savingsTarget,
      savingsProgress: round(budget.savingsProgress, 1),
      monthlySaving: budget.monthlySaving,
      wallet: budget.wallet,
      score: snapshot.scores.budget,
      status: budget.remaining < 0
        ? "over-budget"
        : budget.usagePercent >= 90
          ? "near-limit"
          : budget.usagePercent >= 70
            ? "watch"
            : "healthy",
      formatted: {
        annualBudget: formatCurrency(budget.annualBudget, profile.currency, locale),
        spent: formatCurrency(budget.spent, profile.currency, locale),
        remaining: formatCurrency(budget.remaining, profile.currency, locale),
        savingsTotal: formatCurrency(budget.savingsTotal, profile.currency, locale),
        travelBalance: formatCurrency(budget.wallet.balance, budget.wallet.currency, locale)
      }
    });
  }

  function getPassportAnalysis() {
    var snapshot = ensureSnapshot();
    if (!snapshot) return null;

    var completedTrips = snapshot.context.trips.filter(function completed(trip) {
      return trip.lifecycle === "completed";
    });

    var passportRoot = asObject(snapshot.context.state.passport);

    var countries = unique(
      completedTrips.map(function country(trip) {
        return trip.countryCode || trip.country || trip.destination;
      }).concat(
        asArray(firstDefined(passportRoot.countries, passportRoot.visitedCountries))
          .map(function normalizeCountry(item) {
            return isObject(item)
              ? firstDefined(item.countryCode, item.code, item.country, item.name)
              : item;
          })
      )
    ).filter(Boolean);

    var years = {};

    completedTrips.forEach(function countYear(trip) {
      var date = parseDate(trip.startDate || trip.endDate);
      var year = date ? String(date.getFullYear()) : "unknown";
      years[year] = (years[year] || 0) + 1;
    });

    return safeClone({
      completedTrips: completedTrips.length,
      visitedCountries: countries.length,
      countries: countries,
      tripsByYear: years,
      latestTrip: completedTrips
        .slice()
        .sort(function latest(a, b) {
          return dateValue(b.endDate || b.startDate) - dateValue(a.endDate || a.startDate);
        })[0] || null,
      passport: passportRoot,
      score: snapshot.scores.experience
    });
  }

  function getReadinessAnalysis() {
    var snapshot = ensureSnapshot();
    if (!snapshot) return null;

    return safeClone({
      overallScore: snapshot.scores.overall,
      nextTrip: snapshot.summary.nextTrip,
      tripReadiness: snapshot.readiness,
      components: {
        budget: snapshot.scores.budget,
        documents: snapshot.scores.documents,
        packing: snapshot.scores.packing,
        planning: snapshot.scores.planning,
        savings: snapshot.scores.savings,
        experience: snapshot.scores.experience
      },
      alerts: snapshot.alerts,
      recommendations: snapshot.recommendations
    });
  }

  /* =========================================================
     Local assistant
  ========================================================= */

  function buildAnswer(title, message, data, actions) {
    return {
      id: createId("answer", [title, message, nowIso()]),
      title: asString(title, "مساعد السفر"),
      message: asString(message, ""),
      data: data === undefined ? null : safeClone(data),
      actions: safeClone(asArray(actions)),
      generatedAt: nowIso()
    };
  }

  function ask(question, options) {
    var text = asString(question, "");
    var settings = asObject(options);
    var snapshot = ensureSnapshot();

    if (!snapshot) {
      return buildAnswer("مساعد السفر", "تعذر قراءة بيانات السفر حالياً.", null, []);
    }

    if (settings.refresh === true) {
      snapshot = refresh("assistant-question") || snapshot;
    }

    var profile = snapshot.context.profile;
    var locale = profile.language === "ar" ? "ar-AE" : "en-US";

    if (!text) {
      return buildAnswer(
        "مساعد السفر",
        "اكتب سؤالك عن الرحلة القادمة أو الميزانية أو الجاهزية أو المستندات.",
        null,
        []
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.nextTrip)) {
      var nextTrip = snapshot.context.nextTrip;

      if (!nextTrip) {
        return buildAnswer(
          "الرحلة القادمة",
          "لا توجد رحلة قادمة مؤكدة حالياً.",
          null,
          [{ type: "new-trip", label: "إضافة رحلة" }]
        );
      }

      var tripAnalysis = getTripAnalysis(nextTrip.id);

      return buildAnswer(
        "الرحلة القادمة",
        nextTrip.title + " بتاريخ " + formatDate(nextTrip.startDate, locale) +
          ". الجاهزية الحالية " + tripAnalysis.readiness.score + "%.",
        tripAnalysis,
        [{ type: "open-trip", tripId: nextTrip.id, label: "فتح الرحلة" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.budget)) {
      var budget = getBudgetAnalysis();

      return buildAnswer(
        "ملخص الميزانية",
        "صرفت " + budget.formatted.spent +
          " من أصل " + budget.formatted.annualBudget +
          "، والمتبقي " + budget.formatted.remaining +
          "، ورصيد السفر الحالي " + budget.formatted.travelBalance + ".",
        budget,
        [{ type: "open-budget", label: "فتح الميزانية" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.readiness)) {
      var readiness = getReadinessAnalysis();

      return buildAnswer(
        "جاهزية السفر",
        "درجة الجاهزية العامة " + readiness.overallScore + "%" +
          (readiness.nextTrip
            ? "، وجاهزية الرحلة القادمة " + readiness.tripReadiness.score + "%."
            : "."),
        readiness,
        readiness.nextTrip
          ? [{ type: "open-trip", tripId: readiness.nextTrip.id, label: "تحسين الجاهزية" }]
          : []
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.documents)) {
      var documentIssues = snapshot.context.documents.filter(function issue(document) {
        return document.status !== "valid";
      });

      return buildAnswer(
        "مستندات السفر",
        documentIssues.length
          ? "يوجد " + documentIssues.length + " مستند يحتاج مراجعة."
          : "لا توجد مشاكل مسجلة في مستندات السفر.",
        documentIssues,
        [{ type: "open-documents", label: "فتح المستندات" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.packing)) {
      var packing = snapshot.context.packing;

      return buildAnswer(
        "التجهيز",
        packing.total
          ? "تم إنجاز " + packing.completed + " من " + packing.total +
            " عناصر، بنسبة " + round(packing.progress, 0) + "%."
          : "لا توجد قائمة تجهيز مسجلة حالياً.",
        packing,
        [{ type: "open-packing", label: "فتح التجهيز" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.savings)) {
      var savingsBudget = getBudgetAnalysis();

      return buildAnswer(
        "ادخار السفر",
        "إجمالي الادخار الحالي " + savingsBudget.formatted.savingsTotal +
          "، والتقدم " + round(savingsBudget.savingsProgress, 0) + "%.",
        savingsBudget,
        [{ type: "open-budget", label: "فتح الادخار" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.passport)) {
      var passport = getPassportAnalysis();

      return buildAnswer(
        "جواز سفري",
        "لديك " + passport.completedTrips + " رحلة مكتملة و" +
          passport.visitedCountries + " دولة مسجلة.",
        passport,
        [{ type: "open-passport", label: "فتح جواز سفري" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.alerts)) {
      return buildAnswer(
        "تنبيهات السفر",
        snapshot.alerts.length
          ? "يوجد " + snapshot.alerts.length + " تنبيه يحتاج مراجعة."
          : "لا توجد تنبيهات عاجلة حالياً.",
        snapshot.alerts,
        snapshot.alerts[0] && snapshot.alerts[0].action
          ? [snapshot.alerts[0].action]
          : []
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.recommendations)) {
      return buildAnswer(
        "توصيات السفر",
        snapshot.recommendations.length
          ? snapshot.recommendations[0].message
          : "لا توجد توصية عاجلة حالياً.",
        snapshot.recommendations,
        snapshot.recommendations[0] && snapshot.recommendations[0].action
          ? [snapshot.recommendations[0].action]
          : []
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.destination)) {
      var destinationNames = snapshot.context.destinations
        .map(function name(destination) {
          return destination.country || destination.name;
        })
        .filter(Boolean)
        .slice(0, 5);

      return buildAnswer(
        "الوجهات",
        destinationNames.length
          ? "أبرز الوجهات المسجلة: " + destinationNames.join("، ") + "."
          : "لا توجد وجهات مسجلة حالياً.",
        snapshot.context.destinations.slice(0, 10),
        [{ type: "open-guide", label: "فتح الدليل" }]
      );
    }

    if (containsAny(text, QUESTION_PATTERNS.summary)) {
      return buildAnswer(
        "ملخص مركز السفر",
        "لديك " + snapshot.summary.upcomingTrips + " رحلة قادمة، و" +
          snapshot.summary.completedTrips + " رحلة مكتملة، ودرجة الجاهزية العامة " +
          snapshot.scores.overall + "%.",
        {
          summary: snapshot.summary,
          scores: snapshot.scores,
          alerts: snapshot.alerts.slice(0, 5),
          recommendations: snapshot.recommendations.slice(0, 5)
        },
        []
      );
    }

    var bestRecommendation = snapshot.recommendations[0];
    var bestInsight = snapshot.insights[0];

    return buildAnswer(
      "مساعد السفر",
      bestRecommendation
        ? bestRecommendation.message
        : bestInsight
          ? bestInsight.message
          : "بيانات السفر الحالية مستقرة ولا توجد ملاحظة عاجلة.",
      {
        insight: bestInsight || null,
        recommendation: bestRecommendation || null,
        scores: snapshot.scores
      },
      bestRecommendation && bestRecommendation.action
        ? [bestRecommendation.action]
        : []
    );
  }

  /* =========================================================
     Subscription, health and cache
  ========================================================= */

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError("TravelBrain.subscribe requires a function.");
    }

    runtime.listeners.add(listener);
    var settings = asObject(options);

    if (settings.immediate !== false) {
      var snapshot = getSnapshot();

      listener(snapshot, {
        reason: "subscribe",
        revision: snapshot ? snapshot.revision : 0,
        generatedAt: snapshot ? snapshot.generatedAt : nowIso()
      });
    }

    return function unsubscribe() {
      runtime.listeners.delete(listener);
    };
  }

  function getHealth() {
    var store = getStore();
    var events = getEvents();
    var analytics = getAnalytics();

    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: runtime.initialized,
      destroyed: runtime.destroyed,
      refreshing: runtime.refreshing,
      revision: runtime.revision,
      hasSnapshot: Boolean(runtime.snapshot),
      lastRefreshReason: runtime.lastRefreshReason,
      lastRefreshAt: runtime.lastRefreshAt,
      integrations: {
        store: Boolean(store),
        storeVersion: store && store.version ? store.version : null,
        storeSubscription: Boolean(store && typeof store.subscribe === "function"),
        events: Boolean(events),
        analytics: Boolean(analytics),
        localStorage: Boolean(global.localStorage),
        customEvents: typeof global.CustomEvent === "function"
      },
      lastError: runtime.lastError
        ? {
            name: runtime.lastError.name,
            message: runtime.lastError.message
          }
        : null,
      generatedAt: nowIso()
    };
  }

  function clearCache(options) {
    runtime.snapshot = null;

    if (asObject(options).resetRevision === true) {
      runtime.revision = 0;
    }

    try {
      if (global.localStorage) {
        global.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      rememberError(error);
    }

    return true;
  }

  var api = {
    version: VERSION,
    name: MODULE_NAME,

    init: init,
    refresh: refresh,
    scheduleRefresh: scheduleRefresh,
    destroy: destroy,
    subscribe: subscribe,

    getSnapshot: getSnapshot,
    getContext: getContext,
    getInsights: getInsights,
    getAlerts: getAlerts,
    getRecommendations: getRecommendations,
    getTripAnalysis: getTripAnalysis,
    getDestinationAnalysis: getDestinationAnalysis,
    getBudgetAnalysis: getBudgetAnalysis,
    getPassportAnalysis: getPassportAnalysis,
    getReadinessAnalysis: getReadinessAnalysis,
    getHealth: getHealth,

    ask: ask,
    clearCache: clearCache,

    utils: Object.freeze({
      asArray: asArray,
      asObject: asObject,
      asNumber: asNumber,
      asString: asString,
      asBoolean: asBoolean,
      firstDefined: firstDefined,
      clamp: clamp,
      round: round,
      average: average,
      percentage: percentage,
      weightedScore: weightedScore,
      daysUntil: daysUntil,
      daysBetween: daysBetween,
      calculateDurationDays: calculateDurationDays,
      formatCurrency: formatCurrency,
      formatDate: formatDate,
      normalizeDateString: normalizeDateString,
      normalizeText: normalizeText,
      createId: createId
    })
  };

  Object.defineProperty(api, "cachedSnapshot", {
    enumerable: true,
    get: function cachedSnapshotGetter() {
      return safeClone(runtime.snapshot || readPersistedSnapshot());
    }
  });

  var frozenApi = Object.freeze(api);

  global.TravelBrain = frozenApi;
  global.TIC.TravelBrain = frozenApi;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function onReady() {
        if (!runtime.initialized && !runtime.destroyed) init();
      }, { once: true });
    } else {
      global.setTimeout(function autoInit() {
        if (!runtime.initialized && !runtime.destroyed) init();
      }, 0);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
