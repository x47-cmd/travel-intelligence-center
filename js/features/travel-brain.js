/* =========================================================
   Travel Intelligence Center
   Travel Brain Intelligence Engine V1.0.0

   File Path:
   js/features/travel-brain.js

   Purpose:
   - Central intelligence layer for the Travel Intelligence Center.
   - Reads the current application state without changing existing pages.
   - Produces normalized travel insights, scores, alerts, priorities,
     recommendations, and assistant-ready context.
   - Works safely with the current Store, Analytics, Events, Router,
     localStorage, and future travel intelligence modules.
   - Keeps the app fully local-first and browser compatible.
   - Does not require external APIs.

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

   Public Global:
   - window.TravelBrain

   Main APIs:
   - TravelBrain.init()
   - TravelBrain.refresh()
   - TravelBrain.getSnapshot()
   - TravelBrain.getContext()
   - TravelBrain.getInsights()
   - TravelBrain.getAlerts()
   - TravelBrain.getRecommendations()
   - TravelBrain.getTripAnalysis(tripOrId)
   - TravelBrain.getDestinationAnalysis(destinationOrCode)
   - TravelBrain.getBudgetAnalysis()
   - TravelBrain.getPassportAnalysis()
   - TravelBrain.getReadinessAnalysis()
   - TravelBrain.ask(question, options)
   - TravelBrain.subscribe(listener)
   - TravelBrain.destroy()

   Notes:
   - This file is defensive by design.
   - Missing Store branches or optional engines will never crash the app.
   - Existing app data remains the single source of truth.
   ========================================================= */

(function travelBrainFactory(global) {
  "use strict";

  if (!global || global.TravelBrain) {
    return;
  }

  var VERSION = "1.0.0";
  var MODULE_NAME = "TravelBrain";
  var STORAGE_KEY = "tic_travel_brain_snapshot_v1";
  var DEFAULT_CURRENCY = "AED";
  var DEFAULT_LANGUAGE = "ar";
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  var runtime = {
    initialized: false,
    destroyed: false,
    refreshTimer: null,
    unsubscribeStore: null,
    eventUnsubscribers: [],
    listeners: new Set(),
    snapshot: null,
    revision: 0,
    lastError: null
  };

  var LEVEL_ORDER = {
    critical: 5,
    danger: 4,
    warning: 3,
    attention: 2,
    info: 1,
    success: 0
  };

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
    nextTrip: [
      "الرحلة القادمة",
      "السفرة القادمة",
      "رحلتي القادمة",
      "next trip",
      "upcoming trip"
    ],
    budget: [
      "الميزانية",
      "ميزانية",
      "المصروف",
      "المصاريف",
      "budget",
      "spending",
      "expense"
    ],
    readiness: [
      "الجاهزية",
      "جاهز",
      "مستعد",
      "readiness",
      "ready"
    ],
    documents: [
      "الجواز",
      "التأشيرة",
      "المستندات",
      "passport",
      "visa",
      "documents"
    ],
    packing: [
      "التجهيز",
      "الشنطة",
      "الأغراض",
      "packing",
      "checklist"
    ],
    savings: [
      "الادخار",
      "التوفير",
      "savings",
      "saving"
    ],
    destination: [
      "وجهة",
      "الدولة",
      "المدينة",
      "destination",
      "country",
      "city"
    ],
    summary: [
      "ملخص",
      "وضعي",
      "حالة سفري",
      "summary",
      "overview",
      "status"
    ]
  });

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
    if (value === null || value === undefined) {
      return fallback || "";
    }

    var text = String(value).trim();
    return text || fallback || "";
  }

  function asNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : (Number.isFinite(fallback) ? fallback : 0);
  }

  function asBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === 1 || value === "1") {
      return true;
    }

    if (value === "false" || value === 0 || value === "0") {
      return false;
    }

    return Boolean(fallback);
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

  function safeJsonClone(value) {
    if (value === undefined) {
      return undefined;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function safeCall(fn, fallback, context, args) {
    if (typeof fn !== "function") {
      return fallback;
    }

    try {
      var result = fn.apply(context || null, asArray(args));
      return result === undefined ? fallback : result;
    } catch (error) {
      runtime.lastError = error;
      return fallback;
    }
  }

  function parseDate(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getTime());
    }

    var date = new Date(value);
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
    var date = parseDate(value);
    return date ? daysBetween(new Date(), date) : null;
  }

  function dateValue(value, fallback) {
    var date = parseDate(value);
    return date ? date.getTime() : (fallback || 0);
  }

  function normalizeText(value) {
    return asString(value)
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
    } catch (error) {
      return round(amount, 0).toLocaleString(selectedLocale) + " " + selectedCurrency;
    }
  }

  function formatDate(value, locale) {
    var date = parseDate(value);

    if (!date) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat(asString(locale, "ar-AE"), {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).format(date);
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function percentage(part, total) {
    var denominator = asNumber(total, 0);
    return denominator > 0 ? clamp((asNumber(part, 0) / denominator) * 100, 0, 999) : 0;
  }

  function average(values) {
    var numbers = asArray(values)
      .map(function mapNumber(value) {
        return asNumber(value, NaN);
      })
      .filter(Number.isFinite);

    if (!numbers.length) {
      return 0;
    }

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

  function getGlobalConfig() {
    return asObject(
      global.TravelConfig ||
      global.CONFIG ||
      global.AppConfig ||
      global.config
    );
  }

  function getStore() {
    return (
      global.Store ||
      global.TravelStore ||
      global.AppStore ||
      null
    );
  }

  function getEvents() {
    return (
      global.Events ||
      global.EventBus ||
      global.TravelEvents ||
      null
    );
  }

  function getAnalytics() {
    return (
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

      if (!state && isObject(store.state)) {
        state = store.state;
      }

      if (!state && isObject(store.data)) {
        state = store.data;
      }
    }

    if (!state) {
      state =
        global.appState ||
        global.travelState ||
        global.__TRAVEL_STATE__ ||
        {};
    }

    return safeJsonClone(asObject(state));
  }

  function readPersistedSnapshot() {
    try {
      if (!global.localStorage) {
        return null;
      }

      var raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function persistSnapshot(snapshot) {
    try {
      if (!global.localStorage) {
        return false;
      }

      var payload = {
        version: VERSION,
        generatedAt: snapshot.generatedAt,
        revision: snapshot.revision,
        summary: snapshot.summary,
        scores: snapshot.scores,
        insights: snapshot.insights.slice(0, 20),
        alerts: snapshot.alerts.slice(0, 20),
        recommendations: snapshot.recommendations.slice(0, 20)
      };

      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  }

  function normalizeProfile(state, config) {
    var profile = asObject(state.profile);
    var settings = asObject(state.settings);
    var defaults = asObject(config.defaults);

    return {
      name: asString(profile.name, asString(defaults.name, "يوسف")),
      currency: asString(
        profile.currency,
        asString(settings.currency, asString(defaults.currency, DEFAULT_CURRENCY))
      ),
      language: asString(
        profile.language,
        asString(settings.language, asString(defaults.language, DEFAULT_LANGUAGE))
      ),
      homeAirport: asString(
        profile.homeAirport,
        asString(defaults.homeAirport, "Abu Dhabi")
      ),
      travelStyle: asString(
        profile.travelStyle,
        asString(defaults.travelStyle, "Premium Family")
      ),
      annualTravelBudget: asNumber(
        profile.annualTravelBudget,
        asNumber(settings.annualTravelBudget, asNumber(defaults.annualTravelBudget, 30000))
      ),
      monthlySaving: asNumber(
        profile.monthlySaving,
        asNumber(settings.monthlySaving, asNumber(defaults.monthlySaving, 1500))
      )
    };
  }

  function normalizeChecklist(value) {
    var items = asArray(value);

    return items.map(function normalizeItem(item, index) {
      if (typeof item === "string") {
        return {
          id: createId("check", [index, item]),
          title: item,
          completed: false,
          category: "general"
        };
      }

      var record = asObject(item);

      return {
        id: asString(record.id, createId("check", [index, record.title || record.name])),
        title: asString(record.title, asString(record.name, "عنصر")),
        completed: asBoolean(
          record.completed,
          asBoolean(record.done, asBoolean(record.checked, false))
        ),
        category: asString(record.category, "general"),
        dueDate: record.dueDate || null,
        required: record.required !== false
      };
    });
  }

  function normalizeExpenses(value) {
    return asArray(value).map(function normalizeExpense(expense, index) {
      var record = asObject(expense);

      return {
        id: asString(record.id, createId("expense", [index, record.title, record.amount])),
        title: asString(record.title, asString(record.name, "مصروف")),
        amount: asNumber(
          record.amount,
          asNumber(record.value, asNumber(record.cost, 0))
        ),
        category: asString(record.category, "other"),
        date: record.date || record.createdAt || null,
        paid: record.paid !== false,
        currency: asString(record.currency, DEFAULT_CURRENCY)
      };
    });
  }

  function normalizeTrip(rawTrip, index, fallbackType) {
    var trip = asObject(rawTrip);
    var destination = asObject(trip.destination);
    var budgetRecord = asObject(trip.budget);
    var dates = asObject(trip.dates);

    var startDate =
      trip.startDate ||
      trip.departureDate ||
      trip.fromDate ||
      dates.start ||
      dates.from ||
      null;

    var endDate =
      trip.endDate ||
      trip.returnDate ||
      trip.toDate ||
      dates.end ||
      dates.to ||
      null;

    var expenses = normalizeExpenses(
      trip.expenses ||
      budgetRecord.expenses ||
      trip.transactions
    );

    var budget = asNumber(
      trip.budgetAmount,
      asNumber(
        budgetRecord.total,
        asNumber(
          budgetRecord.amount,
          asNumber(trip.totalBudget, asNumber(trip.estimatedBudget, 0))
        )
      )
    );

    var spent = asNumber(
      trip.spent,
      asNumber(
        budgetRecord.spent,
        expenses.reduce(function sum(total, expense) {
          return total + expense.amount;
        }, 0)
      )
    );

    var checklist = normalizeChecklist(
      trip.checklist ||
      trip.packing ||
      trip.tasks ||
      []
    );

    var documents = asArray(
      trip.documents ||
      trip.requiredDocuments ||
      []
    );

    var status = asString(
      trip.status,
      asString(trip.tripStatus, asString(fallbackType, "planned"))
    ).toLowerCase();

    var planningStatus = asString(
      trip.planningStatus,
      status === "planned" ? "planned" : ""
    ).toLowerCase();

    var country = asString(
      trip.country,
      asString(
        destination.country,
        asString(trip.destinationName, asString(destination.name, ""))
      )
    );

    var city = asString(
      trip.city,
      asString(destination.city, asString(trip.location, ""))
    );

    return {
      id: asString(
        trip.id,
        createId("trip", [index, trip.title, country, startDate])
      ),
      title: asString(
        trip.title,
        asString(trip.name, country ? "رحلة " + country : "رحلة")
      ),
      status: status,
      planningStatus: planningStatus,
      startDate: startDate,
      endDate: endDate,
      country: country,
      countryCode: asString(
        trip.countryCode,
        asString(destination.countryCode, asString(destination.code, ""))
      ).toUpperCase(),
      city: city,
      destination: country || city,
      travelers: Math.max(1, asNumber(trip.travelers, asNumber(trip.people, 1))),
      budget: budget,
      spent: spent,
      currency: asString(
        trip.currency,
        asString(budgetRecord.currency, DEFAULT_CURRENCY)
      ),
      checklist: checklist,
      documents: documents,
      activities: asArray(trip.activities),
      bookings: asArray(trip.bookings),
      flights: asArray(trip.flights || (trip.flight ? [trip.flight] : [])),
      hotels: asArray(trip.hotels || (trip.hotel ? [trip.hotel] : [])),
      notes: asString(trip.notes, ""),
      source: asString(trip.source, fallbackType || "trips"),
      createdAt: trip.createdAt || null,
      updatedAt: trip.updatedAt || null,
      raw: trip
    };
  }

  function classifyTrip(trip) {
    var today = startOfDay(new Date());
    var start = parseDate(trip.startDate);
    var end = parseDate(trip.endDate);
    var status = normalizeText(trip.status + " " + trip.planningStatus);

    if (
      status.indexOf("cancel") !== -1 ||
      status.indexOf("ملغي") !== -1 ||
      status.indexOf("deleted") !== -1
    ) {
      return "cancelled";
    }

    if (
      status.indexOf("complete") !== -1 ||
      status.indexOf("completed") !== -1 ||
      status.indexOf("past") !== -1 ||
      status.indexOf("منتهي") !== -1 ||
      status.indexOf("مكتمل") !== -1
    ) {
      return "completed";
    }

    if (
      status.indexOf("active") !== -1 ||
      status.indexOf("ongoing") !== -1 ||
      status.indexOf("حالي") !== -1
    ) {
      return "active";
    }

    if (start && end && today >= startOfDay(start) && today <= startOfDay(end)) {
      return "active";
    }

    if (end && startOfDay(end) < today) {
      return "completed";
    }

    if (start && startOfDay(start) > today) {
      return "upcoming";
    }

    if (
      status.indexOf("wishlist") !== -1 ||
      status.indexOf("wish") !== -1 ||
      status.indexOf("امنيه") !== -1
    ) {
      return "wishlist";
    }

    return "planned";
  }

  function collectTrips(state) {
    var collected = [];
    var seen = new Set();

    function addTrips(value, source) {
      asArray(value).forEach(function addTrip(item, index) {
        var trip = normalizeTrip(item, index, source);

        if (seen.has(trip.id)) {
          return;
        }

        seen.add(trip.id);
        trip.lifecycle = classifyTrip(trip);
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

    collected.sort(function sortTrips(a, b) {
      var aDate = dateValue(a.startDate, Number.MAX_SAFE_INTEGER);
      var bDate = dateValue(b.startDate, Number.MAX_SAFE_INTEGER);
      return aDate - bDate;
    });

    return collected;
  }

  function normalizeDestination(item, index) {
    var destination = asObject(item);

    return {
      id: asString(
        destination.id,
        createId("destination", [index, destination.name, destination.countryCode])
      ),
      name: asString(
        destination.name,
        asString(destination.country, asString(destination.title, "وجهة"))
      ),
      country: asString(destination.country, asString(destination.name, "")),
      city: asString(destination.city, ""),
      countryCode: asString(
        destination.countryCode,
        asString(destination.code, "")
      ).toUpperCase(),
      region: asString(destination.region, ""),
      rating: clamp(
        asNumber(destination.rating, asNumber(destination.score, 0)),
        0,
        100
      ),
      visited: asBoolean(destination.visited, false),
      wishlist: asBoolean(destination.wishlist, false),
      raw: destination
    };
  }

  function collectDestinations(state, trips) {
    var values = [];
    var seen = new Set();

    function add(destination) {
      var key = normalizeText(
        destination.countryCode ||
        destination.country ||
        destination.name
      );

      if (!key || seen.has(key)) {
        return;
      }

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
      if (!trip.country && !trip.destination) {
        return;
      }

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

  function collectBudgets(state, trips, profile) {
    var budgets = asArray(state.budgets);
    var savings = asArray(state.savings);
    var currentYear = new Date().getFullYear();

    var completedAndCurrentTrips = trips.filter(function relevantTrip(trip) {
      var tripYear = parseDate(trip.startDate);
      return !tripYear || tripYear.getFullYear() === currentYear;
    });

    var tripBudget = completedAndCurrentTrips.reduce(function sum(total, trip) {
      return total + asNumber(trip.budget, 0);
    }, 0);

    var tripSpent = completedAndCurrentTrips.reduce(function sum(total, trip) {
      return total + asNumber(trip.spent, 0);
    }, 0);

    var explicitBudget = budgets.reduce(function sum(total, budget) {
      var record = asObject(budget);
      return total + asNumber(
        record.amount,
        asNumber(record.total, asNumber(record.budget, 0))
      );
    }, 0);

    var explicitSpent = budgets.reduce(function sum(total, budget) {
      var record = asObject(budget);
      return total + asNumber(
        record.spent,
        asArray(record.expenses).reduce(function expenseSum(subtotal, expense) {
          return subtotal + asNumber(asObject(expense).amount, 0);
        }, 0)
      );
    }, 0);

    var savingsTotal = savings.reduce(function sum(total, saving) {
      var record = asObject(saving);
      return total + asNumber(
        record.currentAmount,
        asNumber(record.amount, asNumber(record.saved, 0))
      );
    }, 0);

    var savingsTarget = savings.reduce(function sum(total, saving) {
      var record = asObject(saving);
      return total + asNumber(
        record.targetAmount,
        asNumber(record.target, 0)
      );
    }, 0);

    var annualBudget = asNumber(
      asObject(state.statistics).annualTravelBudget,
      profile.annualTravelBudget
    );

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
      monthlySaving: profile.monthlySaving,
      budgets: budgets,
      savings: savings
    };
  }

  function collectDocuments(state) {
    var documents = asArray(state.documents);
    var passports = asArray(
      state.passports ||
      asObject(state.passport).items ||
      []
    );

    var all = documents.concat(passports).map(function normalizeDocument(item, index) {
      var document = asObject(item);
      var expiryDate =
        document.expiryDate ||
        document.expiresAt ||
        document.expirationDate ||
        null;

      var daysToExpiry = expiryDate ? daysUntil(expiryDate) : null;
      var status = "valid";

      if (daysToExpiry !== null && daysToExpiry < 0) {
        status = "expired";
      } else if (daysToExpiry !== null && daysToExpiry <= 30) {
        status = "critical";
      } else if (daysToExpiry !== null && daysToExpiry <= 180) {
        status = "expiring";
      } else if (document.valid === false || document.status === "invalid") {
        status = "invalid";
      }

      return {
        id: asString(document.id, createId("document", [index, document.type, document.number])),
        type: asString(document.type, asString(document.title, "document")),
        title: asString(document.title, asString(document.name, "مستند")),
        countryCode: asString(document.countryCode, "").toUpperCase(),
        expiryDate: expiryDate,
        daysToExpiry: daysToExpiry,
        status: status,
        required: document.required !== false,
        raw: document
      };
    });

    return all;
  }

  function collectPacking(state, trips) {
    var globalPacking = normalizeChecklist(
      state.packing ||
      asObject(state.checklists).packing ||
      []
    );

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
    return trips
      .filter(function upcoming(trip) {
        return trip.lifecycle === "upcoming" || trip.lifecycle === "planned";
      })
      .filter(function hasValidDate(trip) {
        return parseDate(trip.startDate) !== null;
      })
      .sort(function nearest(a, b) {
        return dateValue(a.startDate) - dateValue(b.startDate);
      })[0] || null;
  }

  function calculateChecklistScore(items) {
    var checklist = asArray(items);

    if (!checklist.length) {
      return 70;
    }

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

    if (!all.length) {
      return nextTrip ? 45 : 70;
    }

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
    var usage = budget.usagePercent;
    var remaining = budget.remaining;

    if (budget.annualBudget <= 0) {
      return 55;
    }

    if (remaining < 0 || usage > 100) {
      return clamp(100 - (usage - 100) * 2.5, 0, 45);
    }

    if (usage >= 90) {
      return 55;
    }

    if (usage >= 75) {
      return 72;
    }

    if (usage >= 50) {
      return 85;
    }

    return 95;
  }

  function calculatePlanningScore(trip) {
    if (!trip) {
      return 65;
    }

    var signals = [
      Boolean(trip.startDate),
      Boolean(trip.endDate),
      Boolean(trip.country || trip.destination),
      trip.budget > 0,
      trip.travelers > 0,
      trip.activities.length > 0,
      trip.flights.length > 0,
      trip.hotels.length > 0
    ];

    var positive = signals.filter(Boolean).length;
    return round((positive / signals.length) * 100, 0);
  }

  function calculateSavingsScore(budget, nextTrip) {
    if (budget.savingsTarget > 0) {
      return clamp(budget.savingsProgress, 0, 100);
    }

    if (nextTrip && nextTrip.budget > 0) {
      return clamp(percentage(budget.savingsTotal, nextTrip.budget), 0, 100);
    }

    return budget.monthlySaving > 0 ? 75 : 50;
  }

  function calculateExperienceScore(trips, destinations) {
    var completed = trips.filter(function completedTrip(trip) {
      return trip.lifecycle === "completed";
    }).length;

    var visitedCountries = unique(
      destinations
        .filter(function visited(destination) {
          return destination.visited;
        })
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

    var checklistScore = calculateChecklistScore(trip.checklist);
    var documentScore = calculateDocumentScore(documents, trip);
    var budgetScore = trip.budget > 0
      ? clamp(100 - Math.max(0, percentage(trip.spent, trip.budget) - 85) * 2, 0, 100)
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
      checklistScore: checklistScore,
      documentScore: documentScore,
      budgetScore: round(budgetScore, 0),
      planningScore: planningScore,
      daysUntil: daysUntil(trip.startDate)
    };
  }

  function makeInsight(type, title, message, options) {
    var settings = asObject(options);
    var level = asString(settings.level, "info");

    return {
      id: asString(
        settings.id,
        createId("insight", [type, title, message])
      ),
      type: asString(type, "general"),
      level: level,
      priority: asNumber(
        settings.priority,
        LEVEL_ORDER[level] || 1
      ),
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
      id: asString(
        settings.id,
        createId("recommendation", [type, title, message])
      ),
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
          (tripDays !== null ? "، والمتبقي " + Math.max(0, tripDays) + " يوم." : "."),
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

    return insights.sort(function sortInsights(a, b) {
      return b.priority - a.priority;
    });
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
          "يوجد " + incompleteRequired.length +
            " عنصر ضروري غير مكتمل قبل الرحلة.",
          {
            level: "warning",
            priority: 4,
            entityId: nextTrip.id,
            action: { type: "open-packing", tripId: nextTrip.id }
          }
        ));
      }

      if (nextTrip.budget > 0 && nextTrip.spent > nextTrip.budget) {
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

    return alerts.sort(function sortAlerts(a, b) {
      return b.priority - a.priority;
    });
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

      if (nextTrip.budget <= 0) {
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
          reason: "استخدام الميزانية السنوية وصل إلى " +
            round(budget.usagePercent, 0) + "%.",
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

    return recommendations
      .sort(function sortRecommendations(a, b) {
        return b.priority - a.priority;
      })
      .slice(0, 20);
  }

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

    if (!analytics) {
      return fallback;
    }

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
    var trips = collectTrips(state);
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
      return trip.lifecycle === "upcoming" ||
        trip.lifecycle === "planned" ||
        trip.lifecycle === "active";
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
      totalTrips: trips.length,
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
      profile: safeJsonClone(context.profile),
      summary: {
        nextTrip: context.nextTrip ? {
          id: context.nextTrip.id,
          title: context.nextTrip.title,
          destination: context.nextTrip.destination,
          startDate: context.nextTrip.startDate,
          endDate: context.nextTrip.endDate,
          daysUntil: daysUntil(context.nextTrip.startDate),
          readiness: context.readiness.score
        } : null,
        totalTrips: context.statistics.totalTrips,
        completedTrips: context.statistics.completedTrips,
        upcomingTrips: context.statistics.upcomingTrips,
        visitedCountries: context.statistics.visitedCountries,
        wishlistCount: context.statistics.wishlistCount,
        annualBudget: context.budget.annualBudget,
        spent: context.budget.spent,
        remaining: context.budget.remaining,
        budgetUsage: round(context.budget.usagePercent, 0),
        savingsTotal: context.budget.savingsTotal,
        packingProgress: round(context.packing.progress, 0),
        documentIssues: context.documents.filter(function documentIssue(document) {
          return document.status !== "valid";
        }).length
      },
      scores: safeJsonClone(context.scores),
      readiness: safeJsonClone(context.readiness),
      statistics: safeJsonClone(context.statistics),
      insights: insights,
      alerts: alerts,
      recommendations: recommendations,
      context: context
    };
  }

  function notifyListeners(snapshot, reason) {
    runtime.listeners.forEach(function notify(listener) {
      try {
        listener(safeJsonClone(snapshot), {
          reason: asString(reason, "refresh"),
          revision: snapshot.revision,
          generatedAt: snapshot.generatedAt
        });
      } catch (error) {
        runtime.lastError = error;
      }
    });
  }

  function emitEvent(name, payload) {
    var events = getEvents();

    if (!events) {
      return false;
    }

    return Boolean(
      safeCall(events.emit, false, events, [name, payload]) ||
      safeCall(events.publish, false, events, [name, payload]) ||
      safeCall(events.dispatch, false, events, [name, payload])
    );
  }

  function refresh(reason) {
    if (runtime.destroyed) {
      return null;
    }

    var previous = runtime.snapshot;
    var snapshot = buildSnapshot();

    runtime.snapshot = snapshot;
    persistSnapshot(snapshot);
    notifyListeners(snapshot, reason);

    emitEvent("travel-brain:updated", {
      reason: asString(reason, "refresh"),
      revision: snapshot.revision,
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary,
      scores: snapshot.scores,
      previousRevision: previous ? previous.revision : null
    });

    return safeJsonClone(snapshot);
  }

  function scheduleRefresh(reason, delay) {
    if (runtime.destroyed) {
      return;
    }

    if (runtime.refreshTimer) {
      global.clearTimeout(runtime.refreshTimer);
    }

    runtime.refreshTimer = global.setTimeout(function scheduled() {
      runtime.refreshTimer = null;
      refresh(reason || "scheduled");
    }, Math.max(0, asNumber(delay, 60)));
  }

  function subscribeToStore() {
    var store = getStore();

    if (!store || typeof store.subscribe !== "function") {
      return;
    }

    runtime.unsubscribeStore = safeCall(
      store.subscribe,
      null,
      store,
      [function onStoreChange() {
        scheduleRefresh("store-change", 40);
      }]
    );
  }

  function subscribeToEvents() {
    var events = getEvents();

    if (!events) {
      return;
    }

    var eventNames = [
      "store:updated",
      "store:changed",
      "trip:created",
      "trip:updated",
      "trip:deleted",
      "budget:updated",
      "expense:created",
      "savings:updated",
      "documents:updated",
      "packing:updated",
      "wishlist:updated",
      "guide:updated",
      "planned-trip:updated"
    ];

    eventNames.forEach(function bind(eventName) {
      var handler = function onEvent() {
        scheduleRefresh(eventName, 50);
      };

      var unsubscribe =
        safeCall(events.on, null, events, [eventName, handler]) ||
        safeCall(events.subscribe, null, events, [eventName, handler]);

      if (typeof unsubscribe === "function") {
        runtime.eventUnsubscribers.push(unsubscribe);
      }
    });
  }

  function init(options) {
    if (runtime.initialized && !runtime.destroyed) {
      return getSnapshot();
    }

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

    runtime.unsubscribeStore = null;
    runtime.eventUnsubscribers = [];
    runtime.listeners.clear();
    runtime.destroyed = true;
    runtime.initialized = false;

    return true;
  }

  function ensureSnapshot() {
    if (!runtime.snapshot) {
      init();
    }

    return runtime.snapshot;
  }

  function getSnapshot() {
    return safeJsonClone(ensureSnapshot());
  }

  function getContext() {
    var snapshot = ensureSnapshot();
    return safeJsonClone(snapshot.context);
  }

  function getInsights(options) {
    var settings = asObject(options);
    var items = ensureSnapshot().insights.slice();

    if (settings.type) {
      items = items.filter(function byType(item) {
        return item.type === settings.type;
      });
    }

    if (settings.level) {
      items = items.filter(function byLevel(item) {
        return item.level === settings.level;
      });
    }

    if (settings.limit) {
      items = items.slice(0, Math.max(0, asNumber(settings.limit, items.length)));
    }

    return safeJsonClone(items);
  }

  function getAlerts(options) {
    var settings = asObject(options);
    var items = ensureSnapshot().alerts.slice();

    if (settings.level) {
      items = items.filter(function byLevel(item) {
        return item.level === settings.level;
      });
    }

    if (settings.limit) {
      items = items.slice(0, Math.max(0, asNumber(settings.limit, items.length)));
    }

    return safeJsonClone(items);
  }

  function getRecommendations(options) {
    var settings = asObject(options);
    var items = ensureSnapshot().recommendations.slice();

    if (settings.type) {
      items = items.filter(function byType(item) {
        return item.type === settings.type;
      });
    }

    if (settings.minimumPriority !== undefined) {
      items = items.filter(function byPriority(item) {
        return item.priority >= asNumber(settings.minimumPriority, 0);
      });
    }

    if (settings.limit) {
      items = items.slice(0, Math.max(0, asNumber(settings.limit, items.length)));
    }

    return safeJsonClone(items);
  }

  function resolveTrip(tripOrId) {
    var context = ensureSnapshot().context;

    if (isObject(tripOrId)) {
      return normalizeTrip(tripOrId, 0, "external");
    }

    var id = asString(tripOrId, "");

    return context.trips.find(function findTrip(trip) {
      return trip.id === id;
    }) || null;
  }

  function getTripAnalysis(tripOrId) {
    var trip = resolveTrip(tripOrId);
    var snapshot = ensureSnapshot();

    if (!trip) {
      return null;
    }

    var readiness = calculateTripReadiness(trip, snapshot.context.documents);
    var remainingBudget = trip.budget - trip.spent;
    var duration = trip.startDate && trip.endDate
      ? Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1)
      : null;

    var result = {
      trip: safeJsonClone(trip),
      lifecycle: classifyTrip(trip),
      daysUntil: daysUntil(trip.startDate),
      durationDays: duration,
      readiness: readiness,
      budget: {
        total: trip.budget,
        spent: trip.spent,
        remaining: remainingBudget,
        usagePercent: percentage(trip.spent, trip.budget),
        dailyBudget: duration && trip.budget > 0
          ? round(trip.budget / duration, 2)
          : 0,
        dailySpent: duration && trip.spent > 0
          ? round(trip.spent / duration, 2)
          : 0
      },
      checklist: {
        total: trip.checklist.length,
        completed: trip.checklist.filter(function completed(item) {
          return item.completed;
        }).length,
        pending: trip.checklist.filter(function pending(item) {
          return !item.completed;
        }).length,
        progress: calculateChecklistScore(trip.checklist)
      },
      planning: {
        score: calculatePlanningScore(trip),
        hasDates: Boolean(trip.startDate && trip.endDate),
        hasBudget: trip.budget > 0,
        hasFlights: trip.flights.length > 0,
        hasHotels: trip.hotels.length > 0,
        hasActivities: trip.activities.length > 0
      }
    };

    result.risks = [];

    if (result.daysUntil !== null && result.daysUntil <= 14 && readiness.score < 70) {
      result.risks.push({
        type: "readiness",
        level: result.daysUntil <= 7 ? "critical" : "warning",
        message: "موعد الرحلة قريب والجاهزية تحتاج تحسين."
      });
    }

    if (trip.budget > 0 && remainingBudget < 0) {
      result.risks.push({
        type: "budget",
        level: "danger",
        message: "تم تجاوز ميزانية الرحلة."
      });
    }

    if (!trip.flights.length && result.daysUntil !== null && result.daysUntil <= 30) {
      result.risks.push({
        type: "flight",
        level: "attention",
        message: "لا يوجد حجز طيران مسجل."
      });
    }

    if (!trip.hotels.length && result.daysUntil !== null && result.daysUntil <= 30) {
      result.risks.push({
        type: "hotel",
        level: "attention",
        message: "لا يوجد حجز سكن مسجل."
      });
    }

    return safeJsonClone(result);
  }

  function getDestinationAnalysis(destinationOrCode) {
    var snapshot = ensureSnapshot();
    var key = normalizeText(
      isObject(destinationOrCode)
        ? (
          destinationOrCode.countryCode ||
          destinationOrCode.country ||
          destinationOrCode.name
        )
        : destinationOrCode
    );

    var destination = snapshot.context.destinations.find(function findDestination(item) {
      return [
        item.countryCode,
        item.country,
        item.name,
        item.city
      ].some(function match(value) {
        return normalizeText(value) === key;
      });
    });

    if (!destination && isObject(destinationOrCode)) {
      destination = normalizeDestination(destinationOrCode, 0);
    }

    if (!destination) {
      return null;
    }

    var relatedTrips = snapshot.context.trips.filter(function related(trip) {
      var tripKeys = [
        trip.countryCode,
        trip.country,
        trip.destination,
        trip.city
      ].map(normalizeText);

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
      return total + trip.budget;
    }, 0);

    return {
      destination: safeJsonClone(destination),
      trips: safeJsonClone(relatedTrips),
      statistics: {
        totalTrips: relatedTrips.length,
        completedTrips: completed.length,
        upcomingTrips: upcoming.length,
        totalSpent: totalSpent,
        totalBudget: totalBudget,
        averageTripBudget: relatedTrips.length
          ? round(totalBudget / relatedTrips.length, 2)
          : 0
      },
      relationship: completed.length
        ? "visited"
        : upcoming.length
          ? "planned"
          : destination.wishlist
            ? "wishlist"
            : "known"
    };
  }

  function getBudgetAnalysis() {
    var snapshot = ensureSnapshot();
    var budget = snapshot.context.budget;
    var profile = snapshot.context.profile;
    var locale = profile.language === "ar" ? "ar-AE" : "en-US";

    return safeJsonClone({
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
        savingsTotal: formatCurrency(budget.savingsTotal, profile.currency, locale)
      }
    });
  }

  function getPassportAnalysis() {
    var snapshot = ensureSnapshot();
    var completedTrips = snapshot.context.trips.filter(function completed(trip) {
      return trip.lifecycle === "completed";
    });

    var countries = unique(
      completedTrips.map(function country(trip) {
        return trip.countryCode || trip.country || trip.destination;
      })
    );

    var years = {};

    completedTrips.forEach(function countYear(trip) {
      var date = parseDate(trip.startDate || trip.endDate);
      var year = date ? String(date.getFullYear()) : "unknown";
      years[year] = (years[year] || 0) + 1;
    });

    return safeJsonClone({
      completedTrips: completedTrips.length,
      visitedCountries: countries.length,
      countries: countries,
      tripsByYear: years,
      latestTrip: completedTrips
        .slice()
        .sort(function latest(a, b) {
          return dateValue(b.endDate || b.startDate) - dateValue(a.endDate || a.startDate);
        })[0] || null,
      score: snapshot.scores.experience
    });
  }

  function getReadinessAnalysis() {
    var snapshot = ensureSnapshot();

    return safeJsonClone({
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

  function buildAnswer(title, message, data, actions) {
    return {
      id: createId("answer", [title, message, nowIso()]),
      title: asString(title, "مساعد السفر"),
      message: asString(message, ""),
      data: data === undefined ? null : safeJsonClone(data),
      actions: safeJsonClone(asArray(actions)),
      generatedAt: nowIso()
    };
  }

  function ask(question, options) {
    var text = asString(question, "");
    var settings = asObject(options);
    var snapshot = ensureSnapshot();
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
          "، والمتبقي " + budget.formatted.remaining + ".",
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

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError("TravelBrain.subscribe requires a function.");
    }

    runtime.listeners.add(listener);

    var settings = asObject(options);

    if (settings.immediate !== false) {
      listener(getSnapshot(), {
        reason: "subscribe",
        revision: ensureSnapshot().revision,
        generatedAt: ensureSnapshot().generatedAt
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
      revision: runtime.revision,
      hasSnapshot: Boolean(runtime.snapshot),
      integrations: {
        store: Boolean(store),
        storeSubscription: Boolean(store && typeof store.subscribe === "function"),
        events: Boolean(events),
        analytics: Boolean(analytics),
        localStorage: Boolean(global.localStorage)
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

  function clearCache() {
    runtime.snapshot = null;

    try {
      if (global.localStorage) {
        global.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      runtime.lastError = error;
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
      clamp: clamp,
      round: round,
      percentage: percentage,
      weightedScore: weightedScore,
      daysUntil: daysUntil,
      daysBetween: daysBetween,
      formatCurrency: formatCurrency,
      formatDate: formatDate,
      normalizeText: normalizeText,
      createId: createId
    })
  };

  Object.defineProperty(api, "cachedSnapshot", {
    enumerable: true,
    get: function cachedSnapshotGetter() {
      return safeJsonClone(runtime.snapshot || readPersistedSnapshot());
    }
  });

  global.TravelBrain = Object.freeze(api);

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function onReady() {
        if (!runtime.initialized && !runtime.destroyed) {
          init();
        }
      }, { once: true });
    } else {
      global.setTimeout(function autoInit() {
        if (!runtime.initialized && !runtime.destroyed) {
          init();
        }
      }, 0);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
