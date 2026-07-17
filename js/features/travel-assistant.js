/* =========================================================
   Travel Intelligence Center
   Travel Assistant Engine V1.1.0

   File Path:
   js/features/travel-assistant.js

   Purpose:
   - Offline Arabic/English travel assistant.
   - Uses window.TravelBrain / window.TIC.TravelBrain as its primary source.
   - Supports conversation history, intent detection, actions,
     smart suggestions, subscriptions, events, and persistence.
   - Compatible with Travel Brain V1.1.0 and Store V2.5.0.
   - Does not modify the stable Store or page modules.
   - Local-first and browser compatible without external APIs.

   Required Load Order:
   1) js/config.js
   2) js/storage.js
   3) js/store.js
   4) js/events.js
   5) js/analytics.js
   6) js/features/travel-brain.js
   7) js/features/travel-assistant.js

   Public Globals:
   - window.TravelAssistant
   - window.TIC.TravelAssistant

   Main APIs:
   - TravelAssistant.init()
   - TravelAssistant.send(message, options)
   - TravelAssistant.ask(message, options)
   - TravelAssistant.detectIntent(message)
   - TravelAssistant.executeAction(action)
   - TravelAssistant.getConversation(options)
   - TravelAssistant.getLastMessage(role)
   - TravelAssistant.getSuggestions(language)
   - TravelAssistant.getState()
   - TravelAssistant.getHealth()
   - TravelAssistant.clearConversation(options)
   - TravelAssistant.subscribe(listener, options)
   - TravelAssistant.destroy()
   ========================================================= */

(function travelAssistantFactory(global) {
  "use strict";

  if (!global) return;

  global.TIC = global.TIC || {};

  if (global.TravelAssistant || global.TIC.TravelAssistant) {
    return;
  }

  var VERSION = "1.1.0";
  var MODULE_NAME = "TravelAssistant";
  var STORAGE_KEY = "tic_travel_assistant_v1";
  var MAX_MESSAGES = 100;
  var MAX_SUGGESTIONS = 8;

  var state = {
    initialized: false,
    destroyed: false,
    busy: false,
    messages: [],
    listeners: new Set(),
    unsubscribers: [],
    domUnsubscribers: [],
    sequence: 0,
    lastError: null,
    brainRevision: null,
    activeRequestId: null
  };

  var INTENTS = Object.freeze({
    GREETING: "greeting",
    HELP: "help",
    SUMMARY: "summary",
    NEXT_TRIP: "next-trip",
    TRIPS: "trips",
    READINESS: "readiness",
    BUDGET: "budget",
    SAVINGS: "savings",
    EXPENSES: "expenses",
    WALLET: "wallet",
    DOCUMENTS: "documents",
    PACKING: "packing",
    PASSPORT: "passport",
    DESTINATION: "destination",
    WISHLIST: "wishlist",
    RECOMMENDATIONS: "recommendations",
    ALERTS: "alerts",
    CLEAR: "clear",
    UNKNOWN: "unknown"
  });

  var PATTERNS = Object.freeze({
    greeting: ["هلا", "مرحبا", "السلام عليكم", "صباح الخير", "مساء الخير", "hello", "hi", "hey"],
    help: ["مساعدة", "ساعدني", "شو تقدر تسوي", "ماذا تستطيع", "help", "what can you do"],
    summary: ["ملخص", "وضعي", "حالة سفري", "نظرة عامة", "summary", "overview", "status"],
    nextTrip: ["الرحلة القادمة", "السفرة القادمة", "رحلتي القادمة", "متى بسافر", "وين بسافر", "next trip", "upcoming trip"],
    trips: ["رحلاتي", "السفرات", "الرحلات", "كم رحلة", "my trips", "travel history"],
    readiness: ["الجاهزية", "جاهز", "مستعد", "استعداد", "readiness", "am i ready"],
    budget: ["الميزانية", "ميزانية السفر", "المتبقي", "budget", "remaining budget"],
    savings: ["الادخار", "التوفير", "كم وفرت", "savings", "saving"],
    expenses: ["المصاريف", "المصروفات", "كم صرفت", "expenses", "spending", "spent"],
    wallet: ["المحفظة", "محفظة السفر", "رصيد السفر", "travel wallet", "wallet balance"],
    documents: ["الجواز", "التأشيرة", "الفيزا", "المستندات", "passport", "visa", "documents"],
    packing: ["التجهيز", "الشنطة", "الأغراض", "قائمة التجهيز", "packing", "checklist"],
    passport: ["جواز سفري", "الدول اللي زرتها", "كم دولة", "visited countries", "travel passport"],
    destination: ["وجهة", "دولة", "مدينة", "وين اروح", "destination", "country", "city"],
    wishlist: ["قائمة الأمنيات", "امنياتي", "الوجهات المحفوظة", "wishlist"],
    recommendations: ["توصيات", "نصيحتك", "شو تنصح", "اقترح", "recommendations", "advice"],
    alerts: ["التنبيهات", "تحذيرات", "شي عاجل", "مشاكل", "alerts", "warnings"],
    clear: ["امسح المحادثة", "حذف المحادثة", "ابدأ من جديد", "clear conversation", "reset chat"]
  });

  function now() {
    return new Date().toISOString();
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function str(value, fallback) {
    if (value === null || value === undefined) return fallback || "";
    var text = String(value).trim();
    return text || fallback || "";
  }

  function num(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (Number.isFinite(fallback) ? fallback : 0);
  }

  function bool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return Boolean(fallback);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function call(fn, fallback, context, args) {
    if (typeof fn !== "function") return fallback;
    try {
      var result = fn.apply(context || null, arr(args));
      return result === undefined ? fallback : result;
    } catch (error) {
      state.lastError = error;
      return fallback;
    }
  }

  function normalize(value) {
    return str(value)
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0600-\u06FFa-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function contains(text, terms) {
    var source = normalize(text);
    return arr(terms).some(function match(term) {
      return source.indexOf(normalize(term)) !== -1;
    });
  }

  function arabic(value) {
    return /[\u0600-\u06FF]/.test(str(value));
  }

  function id(prefix) {
    state.sequence += 1;
    return [prefix, Date.now().toString(36), state.sequence.toString(36)].join("_");
  }

  function brain() {
    return global.TravelBrain ||
      (global.TIC && global.TIC.TravelBrain) ||
      null;
  }

  function events() {
    return global.Events ||
      global.EventBus ||
      global.TravelEvents ||
      (global.TIC && global.TIC.Events) ||
      null;
  }

  function router() {
    return global.Router ||
      global.TravelRouter ||
      global.AppRouter ||
      (global.TIC && global.TIC.Router) ||
      null;
  }

  function ui() {
    return global.UI ||
      global.TravelUI ||
      global.AppUI ||
      (global.TIC && global.TIC.UI) ||
      null;
  }

  function snapshot() {
    var service = brain();
    return service ? call(service.getSnapshot, null, service) : null;
  }

  function language(message) {
    if (arabic(message)) return "ar";
    var data = snapshot();
    var profileLanguage = data && data.profile ? str(data.profile.language) : "";
    return profileLanguage.toLowerCase().indexOf("en") === 0 ? "en" : "ar";
  }

  function currency(value, code, lang) {
    try {
      return new Intl.NumberFormat(lang === "en" ? "en-AE" : "ar-AE", {
        style: "currency",
        currency: str(code, "AED"),
        maximumFractionDigits: 0
      }).format(num(value, 0));
    } catch (error) {
      return Math.round(num(value, 0)).toLocaleString() + " " + str(code, "AED");
    }
  }

  function date(value, lang) {
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return str(value);
    try {
      return new Intl.DateTimeFormat(lang === "en" ? "en-AE" : "ar-AE", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(parsed);
    } catch (error) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  function baseSuggestions(lang) {
    return lang === "en"
      ? [
        "What is my next trip?",
        "Am I ready to travel?",
        "Show my travel budget",
        "Show my travel wallet",
        "Check my documents",
        "What is left in packing?",
        "Give me recommendations"
      ]
      : [
        "شو رحلتي القادمة؟",
        "كم نسبة جاهزيتي؟",
        "شو وضع ميزانية السفر؟",
        "كم رصيد محفظة السفر؟",
        "راجع مستندات السفر",
        "شو باقي في التجهيز؟",
        "عطني أهم التوصيات"
      ];
  }

  function contextualSuggestions(lang) {
    var data = snapshot();
    var suggestions = baseSuggestions(lang).slice();

    if (!data) return suggestions.slice(0, MAX_SUGGESTIONS);

    var summary = obj(data.summary);
    var alerts = arr(data.alerts);
    var recommendations = arr(data.recommendations);

    if (summary.nextTrip) {
      suggestions.unshift(lang === "en"
        ? "Open my next trip"
        : "افتح رحلتي القادمة");
    } else {
      suggestions.unshift(lang === "en"
        ? "Add a new trip"
        : "أضف رحلة جديدة");
    }

    if (alerts.length) {
      suggestions.unshift(lang === "en"
        ? "Show urgent alerts"
        : "عرض التنبيهات العاجلة");
    }

    if (recommendations.length) {
      suggestions.unshift(lang === "en"
        ? "What should I do first?"
        : "شو أهم شي أسويه الحين؟");
    }

    return Array.from(new Set(suggestions)).slice(0, MAX_SUGGESTIONS);
  }

  function makeMessage(role, content, options) {
    var settings = obj(options);
    return {
      id: str(settings.id, id(role)),
      role: role === "user" ? "user" : "assistant",
      content: str(content),
      language: str(settings.language, language(content)),
      intent: str(settings.intent),
      data: settings.data === undefined ? null : clone(settings.data),
      actions: clone(arr(settings.actions)),
      suggestions: clone(arr(settings.suggestions)).slice(0, MAX_SUGGESTIONS),
      status: str(settings.status, "complete"),
      createdAt: str(settings.createdAt, now()),
      metadata: clone(obj(settings.metadata))
    };
  }

  function persist() {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        updatedAt: now(),
        messages: state.messages.slice(-MAX_MESSAGES),
        sequence: state.sequence
      }));
      return true;
    } catch (error) {
      state.lastError = error;
      return false;
    }
  }

  function restore() {
    try {
      if (!global.localStorage) return false;
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      var saved = JSON.parse(raw);
      if (!Array.isArray(saved.messages)) return false;

      state.messages = saved.messages.slice(-MAX_MESSAGES).map(function restoreMessage(message) {
        return makeMessage(message.role, message.content, message);
      });
      state.sequence = Math.max(state.sequence, num(saved.sequence, state.messages.length));
      return true;
    } catch (error) {
      state.lastError = error;
      return false;
    }
  }

  function emit(name, payload) {
    var bus = events();
    var emitted = false;

    if (bus) {
      emitted = Boolean(
        call(bus.emit, false, bus, [name, payload]) ||
        call(bus.publish, false, bus, [name, payload]) ||
        call(bus.dispatch, false, bus, [name, payload])
      );
    }

    if (global.document && typeof global.CustomEvent === "function") {
      try {
        global.document.dispatchEvent(new global.CustomEvent(name, {
          detail: clone(payload)
        }));
        emitted = true;
      } catch (error) {
        state.lastError = error;
      }
    }

    return emitted;
  }

  function currentState() {
    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: state.initialized,
      destroyed: state.destroyed,
      processing: state.busy,
      messageCount: state.messages.length,
      messages: clone(state.messages),
      suggestions: getSuggestions(),
      lastMessage: getLastMessage(),
      brainRevision: state.brainRevision,
      activeRequestId: state.activeRequestId,
      updatedAt: now()
    };
  }

  function notify(reason, payload) {
    var value = currentState();

    state.listeners.forEach(function notifyListener(listener) {
      try {
        listener(value, {
          reason: str(reason, "update"),
          payload: clone(payload),
          generatedAt: now()
        });
      } catch (error) {
        state.lastError = error;
      }
    });

    emit("travel-assistant:updated", {
      reason: str(reason, "update"),
      payload: clone(payload),
      messageCount: state.messages.length,
      brainRevision: state.brainRevision
    });
  }

  function add(message, reason) {
    state.messages.push(message);

    if (state.messages.length > MAX_MESSAGES) {
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }

    persist();
    notify(reason || "message", message);
    return clone(message);
  }

  function detectIntent(message) {
    var text = normalize(message);

    if (!text) return INTENTS.UNKNOWN;
    if (contains(text, PATTERNS.clear)) return INTENTS.CLEAR;
    if (contains(text, PATTERNS.greeting)) return INTENTS.GREETING;
    if (contains(text, PATTERNS.help)) return INTENTS.HELP;
    if (contains(text, PATTERNS.nextTrip)) return INTENTS.NEXT_TRIP;
    if (contains(text, PATTERNS.readiness)) return INTENTS.READINESS;
    if (contains(text, PATTERNS.wallet)) return INTENTS.WALLET;
    if (contains(text, PATTERNS.expenses)) return INTENTS.EXPENSES;
    if (contains(text, PATTERNS.budget)) return INTENTS.BUDGET;
    if (contains(text, PATTERNS.savings)) return INTENTS.SAVINGS;
    if (contains(text, PATTERNS.documents)) return INTENTS.DOCUMENTS;
    if (contains(text, PATTERNS.packing)) return INTENTS.PACKING;
    if (contains(text, PATTERNS.passport)) return INTENTS.PASSPORT;
    if (contains(text, PATTERNS.wishlist)) return INTENTS.WISHLIST;
    if (contains(text, PATTERNS.destination)) return INTENTS.DESTINATION;
    if (contains(text, PATTERNS.recommendations)) return INTENTS.RECOMMENDATIONS;
    if (contains(text, PATTERNS.alerts)) return INTENTS.ALERTS;
    if (contains(text, PATTERNS.trips)) return INTENTS.TRIPS;
    if (contains(text, PATTERNS.summary)) return INTENTS.SUMMARY;

    return INTENTS.UNKNOWN;
  }

  function action(type, label, extra) {
    return Object.assign({
      type: type,
      label: label
    }, obj(extra));
  }

  function noData(lang) {
    return {
      content: lang === "en"
        ? "There is not enough travel data to complete this analysis."
        : "لا توجد بيانات سفر كافية حالياً لإكمال هذا التحليل.",
      data: null,
      actions: [],
      suggestions: contextualSuggestions(lang)
    };
  }

  function answer(intent, message, lang) {
    var data = snapshot();
    var service = brain();
    var summary;
    var scores;
    var context;
    var result;
    var list;
    var item;

    if (intent === INTENTS.CLEAR) {
      clearConversation({ keepGreeting: true, language: lang });
      return {
        content: lang === "en"
          ? "The conversation has been cleared."
          : "تم مسح المحادثة وبدينا من جديد.",
        actions: [],
        suggestions: contextualSuggestions(lang),
        data: null
      };
    }

    if (intent === INTENTS.GREETING) {
      return {
        content: lang === "en"
          ? "Hello, I am your smart travel assistant. I can review your next trip, readiness, budget, wallet, documents, packing, and destinations."
          : "هلا، أنا مساعد سفرك الذكي. أقدر أراجع رحلتك القادمة، الجاهزية، الميزانية، المحفظة، المستندات، التجهيز والوجهات.",
        actions: [],
        suggestions: contextualSuggestions(lang),
        data: null
      };
    }

    if (intent === INTENTS.HELP) {
      return {
        content: lang === "en"
          ? "I can analyze trips, readiness, budget, wallet, savings, expenses, documents, packing, passport, destinations, alerts, and recommendations."
          : "أقدر أحلل الرحلات، الجاهزية، الميزانية، محفظة السفر، الادخار، المصروفات، المستندات، التجهيز، جواز السفر، الوجهات، التنبيهات والتوصيات.",
        actions: [],
        suggestions: contextualSuggestions(lang),
        data: { supportedIntents: Object.keys(INTENTS) }
      };
    }

    if (!data) return noData(lang);

    summary = obj(data.summary);
    scores = obj(data.scores);
    context = obj(data.context);

    if (intent === INTENTS.SUMMARY) {
      return {
        content: lang === "en"
          ? "You have " + num(summary.upcomingTrips) + " upcoming trips and " +
            num(summary.completedTrips) + " completed trips. Your overall travel score is " +
            num(scores.overall) + "%."
          : "عندك " + num(summary.upcomingTrips) + " رحلة قادمة و" +
            num(summary.completedTrips) + " رحلة مكتملة. درجة السفر العامة " +
            num(scores.overall) + "%.",
        data: { summary: summary, scores: scores },
        actions: [action("open-home", lang === "en" ? "Open dashboard" : "فتح الرئيسية")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.NEXT_TRIP) {
      item = summary.nextTrip;

      if (!item) {
        return {
          content: lang === "en"
            ? "There is no confirmed upcoming trip."
            : "لا توجد رحلة قادمة مؤكدة حالياً.",
          data: null,
          actions: [action("new-trip", lang === "en" ? "Add trip" : "إضافة رحلة")],
          suggestions: contextualSuggestions(lang)
        };
      }

      return {
        content: lang === "en"
          ? "Your next trip is " + str(item.title, "your trip") + " on " +
            date(item.startDate, lang) + ". There are " + Math.max(0, num(item.daysUntil)) +
            " days remaining, and readiness is " + num(item.readiness) + "%."
          : "رحلتك القادمة هي " + str(item.title, "الرحلة القادمة") + " بتاريخ " +
            date(item.startDate, lang) + ". متبقي " + Math.max(0, num(item.daysUntil)) +
            " يوم، والجاهزية الحالية " + num(item.readiness) + "%.",
        data: item,
        actions: [
          action("open-trip", lang === "en" ? "Open trip" : "فتح الرحلة", { tripId: item.id }),
          action("open-packing", lang === "en" ? "Open packing" : "فتح التجهيز", { tripId: item.id })
        ],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.READINESS) {
      result = service ? call(service.getReadinessAnalysis, null, service) : null;
      if (!result) return noData(lang);

      return {
        content: lang === "en"
          ? "Your overall travel score is " + num(result.overallScore) +
            "%. Next trip readiness is " + num(obj(result.tripReadiness).score) + "%."
          : "درجة السفر العامة عندك " + num(result.overallScore) +
            "%، وجاهزية الرحلة القادمة " + num(obj(result.tripReadiness).score) + "%.",
        data: result,
        actions: [action("open-trips", lang === "en" ? "Improve readiness" : "تحسين الجاهزية")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (
      intent === INTENTS.BUDGET ||
      intent === INTENTS.SAVINGS ||
      intent === INTENTS.EXPENSES ||
      intent === INTENTS.WALLET
    ) {
      result = service ? call(service.getBudgetAnalysis, null, service) : null;
      if (!result) return noData(lang);

      if (intent === INTENTS.WALLET) {
        var wallet = obj(result.wallet);
        var walletBalance = num(
          wallet.balance,
          num(result.walletBalance, num(wallet.availableBalance, 0))
        );

        return {
          content: lang === "en"
            ? "Your available travel wallet balance is " +
              currency(walletBalance, str(result.currency, "AED"), lang) + "."
            : "رصيد محفظة السفر المتاح هو " +
              currency(walletBalance, str(result.currency, "AED"), lang) + ".",
          data: result,
          actions: [action("open-budget", lang === "en" ? "Open wallet" : "فتح محفظة السفر")],
          suggestions: contextualSuggestions(lang)
        };
      }

      if (intent === INTENTS.SAVINGS) {
        return {
          content: lang === "en"
            ? "Your travel savings total is " + str(obj(result.formatted).savingsTotal,
              currency(result.savingsTotal, result.currency, lang)) +
              ". Progress is " + Math.round(num(result.savingsProgress)) + "%."
            : "إجمالي ادخار السفر " + str(obj(result.formatted).savingsTotal,
              currency(result.savingsTotal, result.currency, lang)) +
              ". التقدم نحو الهدف " + Math.round(num(result.savingsProgress)) + "%.",
          data: result,
          actions: [action("open-budget", lang === "en" ? "Open savings" : "فتح الادخار")],
          suggestions: contextualSuggestions(lang)
        };
      }

      if (intent === INTENTS.EXPENSES) {
        return {
          content: lang === "en"
            ? "Recorded travel spending is " + str(obj(result.formatted).spent,
              currency(result.spent, result.currency, lang)) +
              ", with " + str(obj(result.formatted).remaining,
              currency(result.remaining, result.currency, lang)) + " remaining."
            : "إجمالي مصروفات السفر " + str(obj(result.formatted).spent,
              currency(result.spent, result.currency, lang)) +
              "، والمتبقي " + str(obj(result.formatted).remaining,
              currency(result.remaining, result.currency, lang)) + ".",
          data: result,
          actions: [action("open-budget", lang === "en" ? "View expenses" : "عرض المصروفات")],
          suggestions: contextualSuggestions(lang)
        };
      }

      return {
        content: lang === "en"
          ? "Your annual travel budget is " + str(obj(result.formatted).annualBudget,
            currency(result.annualBudget, result.currency, lang)) +
            ". You spent " + str(obj(result.formatted).spent,
            currency(result.spent, result.currency, lang)) +
            ", with " + str(obj(result.formatted).remaining,
            currency(result.remaining, result.currency, lang)) + " remaining."
          : "ميزانية السفر السنوية " + str(obj(result.formatted).annualBudget,
            currency(result.annualBudget, result.currency, lang)) +
            ". صرفت " + str(obj(result.formatted).spent,
            currency(result.spent, result.currency, lang)) +
            " والمتبقي " + str(obj(result.formatted).remaining,
            currency(result.remaining, result.currency, lang)) + ".",
        data: result,
        actions: [action("open-budget", lang === "en" ? "Open budget" : "فتح الميزانية")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.DOCUMENTS) {
      list = arr(context.documents);
      result = list.filter(function documentIssue(document) {
        return document.status !== "valid";
      });

      return {
        content: result.length
          ? (lang === "en"
            ? "You have " + result.length + " documents that need review."
            : "عندك " + result.length + " مستند سفر يحتاج مراجعة أو تجديد.")
          : (lang === "en"
            ? "No document issues are currently recorded."
            : "ما في مشاكل مسجلة حالياً في مستندات السفر."),
        data: { total: list.length, issues: result },
        actions: [action("open-documents", lang === "en" ? "Open documents" : "فتح المستندات")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.PACKING) {
      result = obj(context.packing);

      return {
        content: num(result.total)
          ? (lang === "en"
            ? "You completed " + num(result.completed) + " of " + num(result.total) +
              " packing items. Progress is " + Math.round(num(result.progress)) + "%."
            : "أنجزت " + num(result.completed) + " من أصل " + num(result.total) +
              " عناصر تجهيز. نسبة الإنجاز " + Math.round(num(result.progress)) + "%.")
          : (lang === "en"
            ? "There is no packing checklist yet."
            : "ما عندك قائمة تجهيز مسجلة حالياً."),
        data: result,
        actions: [action("open-packing", lang === "en" ? "Open packing" : "فتح التجهيز")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.PASSPORT) {
      result = service ? call(service.getPassportAnalysis, null, service) : null;
      if (!result) return noData(lang);

      return {
        content: lang === "en"
          ? "Your travel passport includes " + num(result.completedTrips) +
            " completed trips across " + num(result.visitedCountries) + " countries."
          : "جواز سفرك يحتوي على " + num(result.completedTrips) +
            " رحلة مكتملة في " + num(result.visitedCountries) + " دولة.",
        data: result,
        actions: [action("open-passport", lang === "en" ? "Open passport" : "فتح جواز سفري")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.TRIPS) {
      list = arr(context.trips);

      var upcoming = list.filter(function upcomingTrip(trip) {
        return ["upcoming", "planned", "active"].indexOf(trip.lifecycle) !== -1;
      });

      var completed = list.filter(function completedTrip(trip) {
        return trip.lifecycle === "completed";
      });

      return {
        content: lang === "en"
          ? "You have " + list.length + " trips: " + upcoming.length +
            " upcoming or planned, and " + completed.length + " completed."
          : "عندك " + list.length + " رحلة: " + upcoming.length +
            " قادمة أو مخططة، و" + completed.length + " مكتملة.",
        data: { total: list.length, upcoming: upcoming, completed: completed },
        actions: [
          action("open-trips", lang === "en" ? "Open trips" : "فتح رحلاتي"),
          action("new-trip", lang === "en" ? "Add trip" : "إضافة رحلة")
        ],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.WISHLIST) {
      list = arr(context.destinations).filter(function wishlistDestination(destination) {
        return destination.wishlist === true;
      });

      return {
        content: list.length
          ? (lang === "en"
            ? "You have " + list.length + " saved destinations."
            : "عندك " + list.length + " وجهة محفوظة في قائمة الأمنيات.")
          : (lang === "en"
            ? "Your wishlist is currently empty."
            : "قائمة الأمنيات فارغة حالياً."),
        data: list,
        actions: [action("open-wishlist", lang === "en" ? "Open wishlist" : "فتح قائمة الأمنيات")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.DESTINATION) {
      list = arr(context.destinations).slice(0, 10);

      var names = list.map(function destinationName(destination) {
        return destination.country || destination.name;
      }).filter(Boolean).slice(0, 5);

      return {
        content: names.length
          ? (lang === "en"
            ? "Recorded destinations include: " + names.join(", ") + "."
            : "من الوجهات المسجلة عندك: " + names.join("، ") + ".")
          : (lang === "en"
            ? "There are no recorded destinations yet."
            : "ما عندك وجهات مسجلة حالياً."),
        data: list,
        actions: [action("open-guide", lang === "en" ? "Open guide" : "فتح الدليل")],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.RECOMMENDATIONS) {
      list = service ? call(service.getRecommendations, [], service, [{ limit: 5 }]) : [];

      if (!list.length) {
        return {
          content: lang === "en"
            ? "There are no urgent recommendations right now."
            : "ما في توصيات عاجلة حالياً.",
          data: [],
          actions: [],
          suggestions: contextualSuggestions(lang)
        };
      }

      item = list[0];

      return {
        content: lang === "en"
          ? "Your top recommendation is: " + str(item.title) + ". " + str(item.message)
          : "أهم توصية لك: " + str(item.title) + ". " + str(item.message),
        data: list,
        actions: item.action ? [item.action] : [],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (intent === INTENTS.ALERTS) {
      list = service ? call(service.getAlerts, [], service, [{ limit: 10 }]) : [];

      if (!list.length) {
        return {
          content: lang === "en"
            ? "There are no active travel alerts."
            : "ما عندك تنبيهات سفر نشطة حالياً.",
          data: [],
          actions: [],
          suggestions: contextualSuggestions(lang)
        };
      }

      item = list[0];

      return {
        content: lang === "en"
          ? "You have " + list.length + " alerts. Most important: " +
            str(item.title) + ". " + str(item.message)
          : "عندك " + list.length + " تنبيه. أهم تنبيه: " +
            str(item.title) + ". " + str(item.message),
        data: list,
        actions: item.action ? [item.action] : [],
        suggestions: contextualSuggestions(lang)
      };
    }

    if (service && typeof service.ask === "function") {
      result = call(service.ask, null, service, [message, { language: lang }]);

      if (result && result.message) {
        return {
          content: result.message,
          data: result.data || null,
          actions: arr(result.actions),
          suggestions: contextualSuggestions(lang).slice(0, 4)
        };
      }
    }

    return {
      content: lang === "en"
        ? "I can help with your next trip, readiness, budget, wallet, documents, packing, passport, or destinations."
        : "أقدر أساعدك في الرحلة القادمة، الجاهزية، الميزانية، المحفظة، المستندات، التجهيز، الجواز أو الوجهات.",
      data: null,
      actions: [],
      suggestions: contextualSuggestions(lang)
    };
  }

  function send(message, options) {
    var text = str(message);
    var settings = obj(options);
    var lang = str(settings.language, language(text));

    if (!text) {
      return Promise.resolve(add(makeMessage(
        "assistant",
        lang === "en"
          ? "Ask a travel question or choose a suggestion."
          : "اكتب سؤالك عن السفر أو اختر أحد الاقتراحات.",
        {
          language: lang,
          suggestions: contextualSuggestions(lang)
        }
      ), "empty"));
    }

    if (state.busy) {
      return Promise.resolve(makeMessage(
        "assistant",
        lang === "en"
          ? "I am already analyzing a travel request."
          : "أنا حالياً أحلل طلب سفر آخر.",
        {
          language: lang,
          status: "busy",
          suggestions: contextualSuggestions(lang)
        }
      ));
    }

    state.busy = true;
    state.activeRequestId = id("request");

    var requestId = state.activeRequestId;

    var userMessage = makeMessage("user", text, {
      language: lang,
      metadata: {
        source: str(settings.source, "user"),
        context: clone(obj(settings.context)),
        requestId: requestId
      }
    });

    add(userMessage, "user-message");

    return Promise.resolve()
      .then(function processRequest() {
        var intent = detectIntent(text);
        var result = answer(intent, text, lang);
        var currentBrainSnapshot = snapshot();

        var assistantMessage = makeMessage("assistant", result.content, {
          language: lang,
          intent: intent,
          data: result.data,
          actions: result.actions,
          suggestions: arr(result.suggestions).slice(0, MAX_SUGGESTIONS),
          metadata: {
            brainRevision: currentBrainSnapshot ? currentBrainSnapshot.revision : null,
            requestId: requestId
          }
        });

        add(assistantMessage, "assistant-message");

        emit("travel-assistant:response", {
          requestId: requestId,
          userMessage: clone(userMessage),
          assistantMessage: clone(assistantMessage),
          intent: intent
        });

        return clone(assistantMessage);
      })
      .catch(function handleError(error) {
        state.lastError = error;

        return add(makeMessage(
          "assistant",
          lang === "en"
            ? "I could not complete the request. Please try again."
            : "تعذر إكمال الطلب. حاول مرة ثانية.",
          {
            language: lang,
            status: "error",
            suggestions: contextualSuggestions(lang),
            metadata: {
              requestId: requestId,
              error: error && error.message ? error.message : String(error)
            }
          }
        ), "error");
      })
      .finally(function finishRequest() {
        if (state.activeRequestId === requestId) {
          state.activeRequestId = null;
          state.busy = false;
          notify("processing-complete", { requestId: requestId });
        }
      });
  }

  function routeFor(type) {
    return {
      "open-home": "home",
      "open-trips": "trips",
      "open-trip": "trips",
      "new-trip": "trips",
      "open-guide": "guide",
      "open-wishlist": "guide",
      "open-budget": "budget",
      "open-wallet": "budget",
      "open-documents": "more",
      "open-packing": "more",
      "open-passport": "trips",
      "open-alerts": "home"
    }[type] || null;
  }

  function executeAction(actionRecord) {
    var selected = obj(actionRecord);
    var type = str(selected.type);
    var page = routeFor(type);
    var navigation = router();
    var success = false;

    if (page && navigation) {
      success = Boolean(
        call(navigation.go, false, navigation, [page, selected]) ||
        call(navigation.navigate, false, navigation, [page, selected]) ||
        call(navigation.open, false, navigation, [page, selected])
      );
    }

    if (!success) {
      success = emit("travel-assistant:action", clone(selected));
    }

    var interfaceApi = ui();

    if (interfaceApi) {
      var lang = language("");
      call(interfaceApi.toast, null, interfaceApi, [
        success
          ? (lang === "en" ? "Action completed." : "تم تنفيذ الإجراء.")
          : (lang === "en" ? "Could not complete the action." : "تعذر تنفيذ الإجراء المطلوب."),
        success ? "success" : "warning"
      ]);
    }

    notify("action", {
      action: selected,
      success: success,
      page: page
    });

    return Promise.resolve({
      success: success,
      action: clone(selected),
      page: page
    });
  }

  function getConversation(options) {
    var settings = obj(options);
    var messages = state.messages.slice();

    if (settings.role) {
      messages = messages.filter(function byRole(message) {
        return message.role === settings.role;
      });
    }

    if (settings.intent) {
      messages = messages.filter(function byIntent(message) {
        return message.intent === settings.intent;
      });
    }

    if (settings.limit) {
      messages = messages.slice(-Math.max(0, num(settings.limit, messages.length)));
    }

    return clone(messages);
  }

  function getLastMessage(role) {
    var messages = role
      ? state.messages.filter(function byRole(message) {
        return message.role === role;
      })
      : state.messages;

    return messages.length ? clone(messages[messages.length - 1]) : null;
  }

  function getSuggestions(lang) {
    var selectedLanguage = str(lang, language(""));
    var last = getLastMessage("assistant");

    return last && last.suggestions && last.suggestions.length
      ? clone(last.suggestions)
      : contextualSuggestions(selectedLanguage);
  }

  function clearConversation(options) {
    var settings = obj(options);
    var lang = str(settings.language, "ar");

    state.messages = [];

    if (settings.keepGreeting) {
      state.messages.push(makeMessage(
        "assistant",
        lang === "en"
          ? "Hello, I am your smart travel assistant."
          : "هلا، أنا مساعد سفرك الذكي.",
        {
          language: lang,
          intent: INTENTS.GREETING,
          suggestions: contextualSuggestions(lang)
        }
      ));
    }

    persist();
    notify("clear", null);
    return true;
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError("TravelAssistant.subscribe requires a function.");
    }

    state.listeners.add(listener);

    if (obj(options).immediate !== false) {
      listener(currentState(), {
        reason: "subscribe",
        generatedAt: now()
      });
    }

    return function unsubscribe() {
      state.listeners.delete(listener);
    };
  }

  function bindDomEvent(name) {
    if (!global.document || typeof global.document.addEventListener !== "function") {
      return;
    }

    var handler = function onDomEvent(event) {
      notify("external-dom-event", {
        name: name,
        payload: clone(event && event.detail)
      });
    };

    global.document.addEventListener(name, handler);

    state.domUnsubscribers.push(function removeDomEvent() {
      global.document.removeEventListener(name, handler);
    });
  }

  function bindIntegrations() {
    var service = brain();
    var bus = events();

    if (service && typeof service.subscribe === "function") {
      var unsubscribeBrain = call(service.subscribe, null, service, [
        function onBrainUpdate(brainSnapshot) {
          state.brainRevision = brainSnapshot ? brainSnapshot.revision : null;
          notify("brain-update", { revision: state.brainRevision });
        },
        { immediate: true }
      ]);

      if (typeof unsubscribeBrain === "function") {
        state.unsubscribers.push(unsubscribeBrain);
      }
    }

    var eventNames = [
      "store:updated",
      "store:changed",
      "trip:created",
      "trip:updated",
      "trip:deleted",
      "planned-trip:updated",
      "budget:updated",
      "budget-wallet:updated",
      "documents:updated",
      "packing:updated",
      "travel-brain:updated"
    ];

    if (bus) {
      eventNames.forEach(function bindBusEvent(name) {
        var handler = function onExternalEvent(payload) {
          notify("external-event", {
            name: name,
            payload: clone(payload)
          });
        };

        var unsubscribe =
          call(bus.on, null, bus, [name, handler]) ||
          call(bus.subscribe, null, bus, [name, handler]);

        if (typeof unsubscribe === "function") {
          state.unsubscribers.push(unsubscribe);
        }
      });
    }

    eventNames.forEach(bindDomEvent);
  }

  function init(options) {
    if (state.initialized && !state.destroyed) {
      return currentState();
    }

    state.destroyed = false;
    state.initialized = true;

    var settings = obj(options);

    if (settings.restore !== false) {
      restore();
    }

    bindIntegrations();

    if (!state.messages.length && settings.greeting !== false) {
      var lang = str(settings.language, "ar");

      state.messages.push(makeMessage(
        "assistant",
        lang === "en"
          ? "Hello, I am your smart travel assistant. I can review your next trip, readiness, budget, wallet, documents, packing, and destinations."
          : "هلا، أنا مساعد سفرك الذكي. أقدر أراجع رحلتك القادمة، الجاهزية، الميزانية، المحفظة، المستندات، التجهيز والوجهات.",
        {
          language: lang,
          intent: INTENTS.GREETING,
          suggestions: contextualSuggestions(lang)
        }
      ));

      persist();
    }

    emit("travel-assistant:ready", {
      version: VERSION,
      messageCount: state.messages.length,
      brainRevision: state.brainRevision,
      generatedAt: now()
    });

    notify("init", null);
    return currentState();
  }

  function destroy() {
    state.unsubscribers.forEach(function unsubscribeIntegration(unsubscribe) {
      call(unsubscribe, null);
    });

    state.domUnsubscribers.forEach(function unsubscribeDom(unsubscribe) {
      call(unsubscribe, null);
    });

    state.unsubscribers = [];
    state.domUnsubscribers = [];
    state.listeners.clear();
    state.busy = false;
    state.activeRequestId = null;
    state.initialized = false;
    state.destroyed = true;

    return true;
  }

  function getHealth() {
    var service = brain();

    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: state.initialized,
      destroyed: state.destroyed,
      processing: state.busy,
      activeRequestId: state.activeRequestId,
      messageCount: state.messages.length,
      integrations: {
        brain: Boolean(service),
        brainVersion: service ? str(service.version) : null,
        brainAsk: Boolean(service && typeof service.ask === "function"),
        brainSubscription: Boolean(service && typeof service.subscribe === "function"),
        router: Boolean(router()),
        events: Boolean(events()),
        domEvents: Boolean(global.document),
        localStorage: Boolean(global.localStorage)
      },
      lastBrainRevision: state.brainRevision,
      lastError: state.lastError
        ? {
          name: state.lastError.name,
          message: state.lastError.message
        }
        : null,
      generatedAt: now()
    };
  }

  var api = {
    version: VERSION,
    name: MODULE_NAME,
    intents: INTENTS,

    init: init,
    destroy: destroy,

    send: send,
    ask: send,
    detectIntent: detectIntent,
    executeAction: executeAction,

    getConversation: getConversation,
    getLastMessage: getLastMessage,
    getSuggestions: getSuggestions,
    getState: currentState,
    getHealth: getHealth,

    clearConversation: clearConversation,
    subscribe: subscribe,

    utils: Object.freeze({
      normalize: normalize,
      contains: contains,
      language: language,
      currency: currency,
      date: date
    })
  };

  var frozenApi = Object.freeze(api);

  global.TravelAssistant = frozenApi;
  global.TIC.TravelAssistant = frozenApi;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function onReady() {
        if (!state.initialized && !state.destroyed) {
          init();
        }
      }, { once: true });
    } else {
      global.setTimeout(function autoInit() {
        if (!state.initialized && !state.destroyed) {
          init();
        }
      }, 0);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
