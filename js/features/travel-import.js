/* =========================================================
   Travel Intelligence Center
   Travel Import Engine V1.1.0

   File Path:
   js/features/travel-import.js

   Purpose:
   - Safe import layer for Travel Intelligence Center data.
   - Imports JSON, TXT, CSV, backup objects, and shared travel packages.
   - Detects structure, validates records, normalizes supported branches,
     prevents duplicate records, and generates a detailed import report.
   - Supports preview mode before committing data.
   - Integrates defensively with Store V2.5.0, Events, UI,
     TravelBrain V1.1.0, localStorage, and future sync modules.
   - Never overwrites the full application state unless explicitly requested.
   - Uses branch-level Store APIs whenever available.
   - Works fully offline and requires no external libraries.

   Recommended Load Order:
   1) js/config.js
   2) js/storage.js
   3) js/store.js
   4) js/events.js
   5) js/analytics.js
   6) js/features/travel-brain.js
   7) js/features/travel-assistant.js
   8) js/features/travel-import.js

   Public Globals:
   - window.TravelImport
   - window.TIC.TravelImport

   Main APIs:
   - TravelImport.init()
   - TravelImport.parse(input, options)
   - TravelImport.preview(input, options)
   - TravelImport.importData(input, options)
   - TravelImport.importFile(file, options)
   - TravelImport.validate(payload, options)
   - TravelImport.normalize(payload, options)
   - TravelImport.getLastReport()
   - TravelImport.clearLastReport()
   - TravelImport.getState()
   - TravelImport.getHealth()
   - TravelImport.subscribe(listener, options)
   - TravelImport.destroy()
   ========================================================= */

(function travelImportFactory(global) {
  "use strict";

  if (!global) return;

  global.TIC = global.TIC || {};

  if (global.TravelImport || global.TIC.TravelImport) {
    return;
  }

  var VERSION = "1.1.0";
  var MODULE_NAME = "TravelImport";
  var STORAGE_KEY = "tic_travel_import_report_v1";
  var MAX_FILE_SIZE = 20 * 1024 * 1024;
  var MAX_RECORDS = 10000;
  var DEFAULT_DUPLICATE_MODE = "skip";
  var DEFAULT_OBJECT_MODE = "merge";

  var SUPPORTED_BRANCHES = Object.freeze([
    "profile",
    "statistics",
    "trips",
    "plannedTrips",
    "destinations",
    "wishlist",
    "guides",
    "budgets",
    "savings",
    "documents",
    "packing",
    "reviews",
    "memories",
    "annualPlans",
    "guideIntelligence",
    "notifications",
    "settings"
  ]);

  var ARRAY_BRANCHES = Object.freeze([
    "trips",
    "plannedTrips",
    "destinations",
    "wishlist",
    "guides",
    "budgets",
    "savings",
    "documents",
    "packing",
    "reviews",
    "memories",
    "annualPlans",
    "notifications"
  ]);

  var OBJECT_BRANCHES = Object.freeze([
    "profile",
    "statistics",
    "guideIntelligence",
    "settings"
  ]);

  var runtime = {
    initialized: false,
    destroyed: false,
    busy: false,
    listeners: new Set(),
    eventUnsubscribers: [],
    domUnsubscribers: [],
    lastReport: null,
    sequence: 0,
    lastError: null,
    activeImportId: null
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    return Boolean(fallback);
  }

  function safeClone(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function safeCall(fn, fallback, context, args) {
    if (typeof fn !== "function") return fallback;

    try {
      var result = fn.apply(context || null, asArray(args));
      return result === undefined ? fallback : result;
    } catch (error) {
      runtime.lastError = error;
      return fallback;
    }
  }

  function createId(prefix) {
    runtime.sequence += 1;
    return [
      prefix || "import",
      Date.now().toString(36),
      runtime.sequence.toString(36)
    ].join("_");
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

  function parseDate(value) {
    if (!value) return null;
    var date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateToIso(value) {
    var date = parseDate(value);
    return date ? date.toISOString() : null;
  }

  function getStore() {
    return (
      (global.TIC && global.TIC.Store) ||
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
      (global.TIC && global.TIC.Events) ||
      null
    );
  }

  function getUI() {
    return (
      global.UI ||
      global.TravelUI ||
      global.AppUI ||
      (global.TIC && global.TIC.UI) ||
      null
    );
  }

  function getBrain() {
    return (
      global.TravelBrain ||
      (global.TIC && global.TIC.TravelBrain) ||
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

    return safeClone(asObject(state));
  }

  function emit(name, payload) {
    var bus = getEvents();
    var emitted = false;

    if (bus) {
      emitted = Boolean(
        safeCall(bus.emit, false, bus, [name, payload]) ||
        safeCall(bus.publish, false, bus, [name, payload]) ||
        safeCall(bus.dispatch, false, bus, [name, payload])
      );
    }

    if (global.document && typeof global.CustomEvent === "function") {
      try {
        global.document.dispatchEvent(new global.CustomEvent(name, {
          detail: safeClone(payload)
        }));
        emitted = true;
      } catch (error) {
        runtime.lastError = error;
      }
    }

    return emitted;
  }

  function notify(reason, payload) {
    var state = getState();

    runtime.listeners.forEach(function notifyListener(listener) {
      try {
        listener(state, {
          reason: asString(reason, "update"),
          payload: safeClone(payload),
          generatedAt: nowIso()
        });
      } catch (error) {
        runtime.lastError = error;
      }
    });

    emit("travel-import:updated", {
      reason: asString(reason, "update"),
      payload: safeClone(payload),
      generatedAt: nowIso()
    });
  }

  function persistReport(report) {
    try {
      if (!global.localStorage) return false;

      global.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: VERSION,
          savedAt: nowIso(),
          report: report
        })
      );

      return true;
    } catch (error) {
      runtime.lastError = error;
      return false;
    }
  }

  function restoreReport() {
    try {
      if (!global.localStorage) return null;

      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      var parsed = JSON.parse(raw);
      return parsed && parsed.report ? parsed.report : null;
    } catch (error) {
      runtime.lastError = error;
      return null;
    }
  }

  function stripBom(value) {
    return asString(value).replace(/^\uFEFF/, "");
  }

  function parseJson(text) {
    var source = stripBom(text);

    try {
      return {
        success: true,
        format: "json",
        data: JSON.parse(source),
        error: null
      };
    } catch (error) {
      return {
        success: false,
        format: "json",
        data: null,
        error: error
      };
    }
  }

  function splitCsvRecords(text) {
    var source = stripBom(text);
    var records = [];
    var current = "";
    var quoted = false;

    for (var index = 0; index < source.length; index += 1) {
      var character = source[index];
      var next = source[index + 1];

      if (character === '"' && quoted && next === '"') {
        current += '""';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
        current += character;
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        if (current.trim()) records.push(current);
        current = "";
      } else {
        current += character;
      }
    }

    if (current.trim()) records.push(current);
    return records;
  }

  function splitCsvLine(line, delimiter) {
    var cells = [];
    var current = "";
    var quoted = false;

    for (var index = 0; index < line.length; index += 1) {
      var character = line[index];
      var next = line[index + 1];

      if (character === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }

    cells.push(current.trim());
    return cells;
  }

  function detectDelimiter(text) {
    var firstRecord = splitCsvRecords(text)[0] || "";
    var choices = [",", ";", "\t", "|"];
    var best = ",";
    var highest = -1;

    choices.forEach(function score(delimiter) {
      var count = splitCsvLine(firstRecord, delimiter).length - 1;

      if (count > highest) {
        highest = count;
        best = delimiter;
      }
    });

    return best;
  }

  function parseCsv(text, options) {
    var settings = asObject(options);
    var source = stripBom(text);
    var delimiter = asString(settings.delimiter, detectDelimiter(source));
    var records = splitCsvRecords(source);

    if (!records.length) {
      return {
        success: true,
        format: "csv",
        data: [],
        error: null
      };
    }

    var headers = splitCsvLine(records[0], delimiter).map(function normalizeHeader(header, index) {
      var normalized = normalizeText(header).replace(/\s+/g, "_");
      return normalized || "column_" + index;
    });

    var rows = records.slice(1).map(function mapRow(recordLine) {
      var cells = splitCsvLine(recordLine, delimiter);
      var record = {};

      headers.forEach(function assign(header, index) {
        record[header] = cells[index] === undefined ? "" : cells[index];
      });

      return record;
    });

    return {
      success: true,
      format: "csv",
      data: rows,
      error: null,
      metadata: {
        delimiter: delimiter,
        headers: headers
      }
    };
  }

  function parsePlainText(text) {
    var source = stripBom(text);
    var lines = source
      .split(/\r?\n/)
      .map(function trim(line) { return line.trim(); })
      .filter(Boolean);

    var keyValue = {};
    var validPairs = 0;

    lines.forEach(function parseLine(line) {
      var colon = line.indexOf(":");
      var arabicColon = line.indexOf("：");
      var separator = colon >= 0 ? colon : arabicColon;

      if (separator <= 0) return;

      var key = normalizeText(line.slice(0, separator)).replace(/\s+/g, "_");
      var value = line.slice(separator + 1).trim();

      if (key) {
        keyValue[key] = value;
        validPairs += 1;
      }
    });

    return {
      success: true,
      format: "text",
      data: validPairs >= 2
        ? keyValue
        : {
          notes: source,
          lines: lines
        },
      error: null
    };
  }

  function detectFormat(input, options) {
    var settings = asObject(options);
    var explicit = asString(settings.format).toLowerCase();

    if (explicit) return explicit;
    if (isObject(input) || Array.isArray(input)) return "object";

    var text = stripBom(input);
    if (!text) return "text";

    if (
      (text[0] === "{" && text[text.length - 1] === "}") ||
      (text[0] === "[" && text[text.length - 1] === "]")
    ) {
      return "json";
    }

    var firstLine = splitCsvRecords(text)[0] || "";

    if (
      firstLine.indexOf(",") !== -1 ||
      firstLine.indexOf(";") !== -1 ||
      firstLine.indexOf("\t") !== -1 ||
      firstLine.indexOf("|") !== -1
    ) {
      return "csv";
    }

    return "text";
  }

  function parse(input, options) {
    var format = detectFormat(input, options);

    if (format === "object") {
      return {
        success: true,
        format: "object",
        data: safeClone(input),
        error: null
      };
    }

    if (format === "json") return parseJson(input);
    if (format === "csv") return parseCsv(input, options);
    return parsePlainText(input);
  }

  function normalizeChecklist(value) {
    return asArray(value).map(function normalizeItem(item, index) {
      if (typeof item === "string") {
        return {
          id: createId("packing"),
          title: item,
          completed: false,
          category: "general",
          required: true,
          order: index,
          dueDate: null,
          notes: ""
        };
      }

      var record = asObject(item);

      return {
        id: asString(record.id, createId("packing")),
        title: asString(record.title, asString(record.name, "عنصر تجهيز")),
        completed: asBoolean(
          record.completed,
          asBoolean(record.done, asBoolean(record.checked, false))
        ),
        category: asString(record.category, "general"),
        required: record.required !== false,
        order: asNumber(record.order, index),
        dueDate: dateToIso(record.dueDate) || record.dueDate || null,
        notes: asString(record.notes)
      };
    });
  }

  function normalizeExpense(item, index) {
    var record = asObject(item);

    return {
      id: asString(record.id, createId("expense")),
      title: asString(record.title, asString(record.name, "مصروف")),
      amount: asNumber(record.amount, asNumber(record.value, asNumber(record.cost, 0))),
      category: asString(record.category, "other"),
      date: dateToIso(record.date || record.createdAt) || null,
      paid: record.paid !== false,
      currency: asString(record.currency, "AED"),
      notes: asString(record.notes),
      order: index
    };
  }

  function stableTripId(record, index, startDate, country, city) {
    if (record.id) return asString(record.id);

    var slug = normalizeText(
      record.title ||
      record.name ||
      country ||
      city ||
      "trip_" + index
    ).replace(/\s+/g, "_");

    var datePart = asString(dateToIso(startDate) || startDate).slice(0, 10);

    return ["trip", slug || index, datePart || index]
      .join("_")
      .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, "_");
  }

  function normalizeTrip(item, index, source) {
    var record = asObject(item);
    var destination = asObject(record.destination);
    var budget = asObject(record.budget);
    var dates = asObject(record.dates);

    var startDate =
      record.startDate ||
      record.departureDate ||
      record.fromDate ||
      dates.start ||
      dates.from ||
      null;

    var endDate =
      record.endDate ||
      record.returnDate ||
      record.toDate ||
      dates.end ||
      dates.to ||
      null;

    var country = asString(
      record.country,
      asString(
        destination.country,
        asString(record.destinationName, asString(destination.name))
      )
    );

    var city = asString(
      record.city,
      asString(destination.city, asString(record.location))
    );

    var expenses = asArray(
      record.expenses ||
      budget.expenses ||
      record.transactions
    ).map(normalizeExpense);

    var totalBudget = asNumber(
      record.budgetAmount,
      asNumber(
        budget.total,
        asNumber(
          budget.amount,
          asNumber(record.totalBudget, asNumber(record.estimatedBudget, 0))
        )
      )
    );

    var spent = asNumber(
      record.spent,
      asNumber(
        budget.spent,
        expenses.reduce(function sum(total, expense) {
          return total + expense.amount;
        }, 0)
      )
    );

    var normalizedSource = asString(record.source, "import");
    var defaultStatus = source === "plannedTrips" ? "planned" : "upcoming";

    return {
      id: stableTripId(record, index, startDate, country, city),
      title: asString(
        record.title,
        asString(record.name, country ? "رحلة " + country : "رحلة")
      ),
      status: asString(record.status, defaultStatus),
      lifecycle: asString(record.lifecycle),
      planningStatus: asString(record.planningStatus),
      startDate: dateToIso(startDate) || startDate || null,
      endDate: dateToIso(endDate) || endDate || null,
      country: country,
      countryCode: asString(
        record.countryCode,
        asString(destination.countryCode, asString(destination.code))
      ).toUpperCase(),
      city: city,
      destinationName: asString(record.destinationName, country || city),
      travelers: Math.max(1, asNumber(record.travelers, asNumber(record.people, 1))),
      budget: totalBudget,
      spent: spent,
      currency: asString(record.currency, asString(budget.currency, "AED")),
      expenses: expenses,
      checklist: normalizeChecklist(
        record.checklist ||
        record.packing ||
        record.tasks ||
        []
      ),
      activities: asArray(record.activities),
      flights: asArray(record.flights || (record.flight ? [record.flight] : [])),
      hotels: asArray(record.hotels || (record.hotel ? [record.hotel] : [])),
      documents: asArray(record.documents),
      notes: asString(record.notes),
      source: normalizedSource,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeDestination(item, index) {
    var record = asObject(item);

    return {
      id: asString(record.id, createId("destination")),
      name: asString(record.name, asString(record.country, asString(record.title, "وجهة"))),
      country: asString(record.country, asString(record.name)),
      city: asString(record.city),
      countryCode: asString(record.countryCode, asString(record.code)).toUpperCase(),
      region: asString(record.region),
      wishlist: asBoolean(record.wishlist, false),
      visited: asBoolean(record.visited, false),
      rating: asNumber(record.rating, asNumber(record.score, 0)),
      notes: asString(record.notes),
      order: index,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeBudget(item, index) {
    var record = asObject(item);

    return {
      id: asString(record.id, createId("budget")),
      title: asString(record.title, asString(record.name, "ميزانية سفر")),
      tripId: asString(record.tripId),
      amount: asNumber(record.amount, asNumber(record.total, asNumber(record.budget, 0))),
      spent: asNumber(record.spent, 0),
      currency: asString(record.currency, "AED"),
      expenses: asArray(record.expenses).map(normalizeExpense),
      startDate: dateToIso(record.startDate) || record.startDate || null,
      endDate: dateToIso(record.endDate) || record.endDate || null,
      notes: asString(record.notes),
      order: index,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeSaving(item, index) {
    var record = asObject(item);

    return {
      id: asString(record.id, createId("saving")),
      title: asString(record.title, asString(record.name, "ادخار سفر")),
      currentAmount: asNumber(record.currentAmount, asNumber(record.amount, asNumber(record.saved, 0))),
      targetAmount: asNumber(record.targetAmount, asNumber(record.target, 0)),
      monthlyAmount: asNumber(record.monthlyAmount, asNumber(record.monthlySaving, 0)),
      currency: asString(record.currency, "AED"),
      targetDate: dateToIso(record.targetDate) || record.targetDate || null,
      notes: asString(record.notes),
      order: index,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeDocument(item, index) {
    var record = asObject(item);
    var expiry =
      record.expiryDate ||
      record.expiresAt ||
      record.expirationDate ||
      null;

    return {
      id: asString(record.id, createId("document")),
      title: asString(record.title, asString(record.name, "مستند سفر")),
      type: asString(record.type, "document"),
      number: asString(record.number),
      countryCode: asString(record.countryCode).toUpperCase(),
      issueDate: dateToIso(record.issueDate) || record.issueDate || null,
      expiryDate: dateToIso(expiry) || expiry || null,
      required: record.required !== false,
      notes: asString(record.notes),
      order: index,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeMemory(item, index) {
    var record = asObject(item);

    return {
      id: asString(record.id, createId("memory")),
      title: asString(record.title, asString(record.name, "ذكرى سفر")),
      tripId: asString(record.tripId),
      date: dateToIso(record.date || record.createdAt) || nowIso(),
      country: asString(record.country),
      city: asString(record.city),
      notes: asString(record.notes, asString(record.description)),
      photos: asArray(record.photos),
      rating: asNumber(record.rating, 0),
      order: index,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeReview(item, index) {
    var record = asObject(item);

    return {
      id: asString(record.id, createId("review")),
      title: asString(record.title, asString(record.name, "تقييم سفر")),
      tripId: asString(record.tripId),
      destinationId: asString(record.destinationId),
      rating: Math.max(0, Math.min(5, asNumber(record.rating, 0))),
      notes: asString(record.notes, asString(record.review)),
      date: dateToIso(record.date || record.createdAt) || nowIso(),
      order: index,
      importedAt: nowIso(),
      createdAt: dateToIso(record.createdAt) || nowIso(),
      updatedAt: nowIso()
    };
  }

  function inferArrayBranch(records) {
    var sample = asObject(asArray(records)[0]);
    var keys = Object.keys(sample).map(normalizeText);

    function hasAny(values) {
      return values.some(function exists(value) {
        return keys.indexOf(normalizeText(value)) !== -1;
      });
    }

    if (hasAny(["startDate", "endDate", "departureDate", "travelers", "hotel"])) {
      return "trips";
    }

    if (hasAny(["expiryDate", "expirationDate", "passport", "documentType"])) {
      return "documents";
    }

    if (hasAny(["targetAmount", "currentAmount", "monthlySaving"])) {
      return "savings";
    }

    if (hasAny(["budget", "spent", "expenses", "amount"])) {
      return "budgets";
    }

    if (hasAny(["countryCode", "country", "city", "region"])) {
      return "destinations";
    }

    if (hasAny(["rating", "review", "destinationId"])) {
      return "reviews";
    }

    return "trips";
  }

  function unwrapPayload(value) {
    var source = safeClone(value);

    for (var depth = 0; depth < 4; depth += 1) {
      if (!isObject(source)) break;

      if (isObject(source.data) && (
        source.type ||
        source.version ||
        source.exportedAt ||
        source.generatedAt ||
        source.app
      )) {
        source = source.data;
        continue;
      }

      if (isObject(source.payload) && Object.keys(source).length <= 6) {
        source = source.payload;
        continue;
      }

      if (isObject(source.backup)) {
        source = source.backup;
        continue;
      }

      if (isObject(source.state)) {
        source = source.state;
        continue;
      }

      break;
    }

    return source;
  }

  function normalizePayload(value, options) {
    var settings = asObject(options);
    var source = unwrapPayload(value);
    var result = {};

    if (Array.isArray(source)) {
      var inferred = asString(settings.branch, inferArrayBranch(source));
      result[inferred] = source;
    } else if (isObject(source)) {
      var recognized = SUPPORTED_BRANCHES.some(function hasBranch(branch) {
        return Object.prototype.hasOwnProperty.call(source, branch);
      });

      if (recognized) {
        SUPPORTED_BRANCHES.forEach(function copyBranch(branch) {
          if (Object.prototype.hasOwnProperty.call(source, branch)) {
            result[branch] = source[branch];
          }
        });
      } else {
        var target = asString(settings.branch);

        if (!target) {
          if (
            source.startDate ||
            source.endDate ||
            source.departureDate ||
            source.travelers
          ) {
            target = "trips";
          } else if (
            source.expiryDate ||
            source.expirationDate ||
            source.type === "passport"
          ) {
            target = "documents";
          } else if (
            source.country ||
            source.countryCode ||
            source.city
          ) {
            target = "destinations";
          } else {
            target = "profile";
          }
        }

        result[target] = target === "profile" ? source : [source];
      }
    }

    var normalized = {};

    Object.keys(result).forEach(function normalizeBranch(branch) {
      var branchValue = result[branch];

      if (branch === "trips" || branch === "plannedTrips") {
        normalized[branch] = asArray(branchValue).map(function mapTrip(item, index) {
          return normalizeTrip(item, index, branch);
        });
      } else if (branch === "destinations" || branch === "wishlist") {
        normalized[branch] = asArray(branchValue).map(function mapDestination(item, index) {
          var destination = normalizeDestination(item, index);
          if (branch === "wishlist") destination.wishlist = true;
          return destination;
        });
      } else if (branch === "budgets") {
        normalized[branch] = asArray(branchValue).map(normalizeBudget);
      } else if (branch === "savings") {
        normalized[branch] = asArray(branchValue).map(normalizeSaving);
      } else if (branch === "documents") {
        normalized[branch] = asArray(branchValue).map(normalizeDocument);
      } else if (branch === "packing") {
        normalized[branch] = normalizeChecklist(branchValue);
      } else if (branch === "memories") {
        normalized[branch] = asArray(branchValue).map(normalizeMemory);
      } else if (branch === "reviews") {
        normalized[branch] = asArray(branchValue).map(normalizeReview);
      } else if (OBJECT_BRANCHES.indexOf(branch) !== -1) {
        normalized[branch] = asObject(branchValue);
      } else {
        normalized[branch] = safeClone(branchValue);
      }
    });

    return normalized;
  }

  function canonicalTripBranch(branch) {
    return branch === "plannedTrips" ? "trips" : branch;
  }

  function fingerprint(branch, item) {
    var record = asObject(item);
    var canonical = canonicalTripBranch(branch);

    if (record.id) {
      return canonical + "|id|" + normalizeText(record.id);
    }

    if (canonical === "trips") {
      return [
        canonical,
        normalizeText(record.title),
        normalizeText(record.country || record.destinationName),
        asString(record.startDate).slice(0, 10)
      ].join("|");
    }

    if (branch === "documents") {
      return [
        branch,
        normalizeText(record.type),
        normalizeText(record.number),
        asString(record.expiryDate).slice(0, 10)
      ].join("|");
    }

    if (branch === "destinations" || branch === "wishlist") {
      return [
        "destinations",
        normalizeText(record.countryCode || record.country || record.name),
        normalizeText(record.city)
      ].join("|");
    }

    return [
      branch,
      normalizeText(record.title || record.name),
      normalizeText(record.date || record.createdAt)
    ].join("|");
  }

  function buildGlobalFingerprintIndex(state) {
    var index = new Map();

    ["trips", "plannedTrips", "destinations", "wishlist"].forEach(function indexBranch(branch) {
      asArray(asObject(state)[branch]).forEach(function indexItem(item) {
        index.set(fingerprint(branch, item), {
          branch: branch,
          item: item
        });
      });
    });

    return index;
  }

  function mergeArrays(branch, existing, incoming, mode, globalIndex) {
    var current = asArray(existing).map(safeClone);
    var additions = asArray(incoming).map(safeClone);
    var indexByFingerprint = new Map();

    current.forEach(function indexExisting(item, index) {
      indexByFingerprint.set(fingerprint(branch, item), index);
    });

    var stats = {
      added: 0,
      skipped: 0,
      replaced: 0,
      merged: 0,
      crossBranchSkipped: 0
    };

    additions.forEach(function mergeIncoming(item) {
      var key = fingerprint(branch, item);
      var existingIndex = indexByFingerprint.get(key);
      var globalMatch = globalIndex ? globalIndex.get(key) : null;

      if (
        existingIndex === undefined &&
        globalMatch &&
        globalMatch.branch !== branch &&
        (branch === "trips" || branch === "plannedTrips" ||
         branch === "destinations" || branch === "wishlist")
      ) {
        stats.skipped += 1;
        stats.crossBranchSkipped += 1;
        return;
      }

      if (existingIndex === undefined) {
        current.push(item);
        indexByFingerprint.set(key, current.length - 1);
        if (globalIndex) globalIndex.set(key, { branch: branch, item: item });
        stats.added += 1;
        return;
      }

      if (mode === "replace") {
        current[existingIndex] = item;
        stats.replaced += 1;
      } else if (mode === "merge") {
        current[existingIndex] = Object.assign(
          {},
          asObject(current[existingIndex]),
          asObject(item),
          {
            id: asString(asObject(current[existingIndex]).id, asObject(item).id),
            updatedAt: nowIso()
          }
        );
        stats.merged += 1;
      } else {
        stats.skipped += 1;
      }
    });

    return {
      value: current,
      stats: stats
    };
  }

  function validate(payload, options) {
    var settings = asObject(options);
    var source = asObject(payload);
    var errors = [];
    var warnings = [];
    var branchSummary = {};
    var totalRecords = 0;

    if (!Object.keys(source).length) {
      errors.push({
        code: "EMPTY_PAYLOAD",
        message: "لا توجد بيانات قابلة للاستيراد."
      });
    }

    Object.keys(source).forEach(function validateBranch(branch) {
      if (SUPPORTED_BRANCHES.indexOf(branch) === -1) {
        warnings.push({
          code: "UNSUPPORTED_BRANCH",
          branch: branch,
          message: "الفرع غير مدعوم وسيتم تجاهله."
        });
        return;
      }

      var value = source[branch];
      var expectedArray = ARRAY_BRANCHES.indexOf(branch) !== -1;
      var expectedObject = OBJECT_BRANCHES.indexOf(branch) !== -1;
      var count = Array.isArray(value) ? value.length : isObject(value) ? 1 : 0;
      var validType =
        (expectedArray && Array.isArray(value)) ||
        (expectedObject && isObject(value));

      branchSummary[branch] = {
        count: count,
        valid: validType,
        expectedType: expectedArray ? "array" : "object"
      };

      totalRecords += count;

      if (!validType) {
        errors.push({
          code: "INVALID_BRANCH_TYPE",
          branch: branch,
          message: "نوع بيانات الفرع غير صالح."
        });
      }

      if (Array.isArray(value)) {
        value.forEach(function validateRecord(record, index) {
          if (!isObject(record)) {
            errors.push({
              code: "INVALID_RECORD",
              branch: branch,
              index: index,
              message: "السجل ليس كائناً صالحاً."
            });
          }
        });
      }
    });

    var maximumRecords = Math.max(
      1,
      asNumber(settings.maximumRecords, MAX_RECORDS)
    );

    if (totalRecords > maximumRecords) {
      errors.push({
        code: "RECORD_LIMIT_EXCEEDED",
        message: "عدد السجلات تجاوز الحد المسموح.",
        totalRecords: totalRecords,
        maximumRecords: maximumRecords
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      branches: branchSummary,
      totalRecords: totalRecords,
      checkedAt: nowIso()
    };
  }

  function createReport(options) {
    var settings = asObject(options);

    return {
      id: createId("report"),
      importId: asString(settings.importId),
      version: VERSION,
      status: "pending",
      preview: settings.preview === true,
      format: asString(settings.format, "unknown"),
      duplicateMode: asString(settings.duplicateMode, DEFAULT_DUPLICATE_MODE),
      objectMode: asString(settings.objectMode, DEFAULT_OBJECT_MODE),
      fullReplaceRequested: settings.fullReplace === true,
      startedAt: nowIso(),
      completedAt: null,
      durationMs: 0,
      branches: {},
      totals: {
        detected: 0,
        added: 0,
        skipped: 0,
        crossBranchSkipped: 0,
        replaced: 0,
        merged: 0,
        errors: 0,
        warnings: 0
      },
      validation: null,
      commit: null,
      errors: [],
      warnings: [],
      source: safeClone(asObject(settings.source))
    };
  }

  function buildImportPlan(normalized, options, report) {
    var settings = asObject(options);
    var existingState = readStoreState();
    var nextState = safeClone(existingState);
    var duplicateMode = asString(settings.duplicateMode, DEFAULT_DUPLICATE_MODE);
    var objectMode = asString(settings.objectMode, DEFAULT_OBJECT_MODE);
    var globalIndex = buildGlobalFingerprintIndex(existingState);
    var branchChanges = {};

    Object.keys(normalized).forEach(function processBranch(branch) {
      var incoming = normalized[branch];

      if (SUPPORTED_BRANCHES.indexOf(branch) === -1) return;

      if (Array.isArray(incoming)) {
        var merged = mergeArrays(
          branch,
          nextState[branch],
          incoming,
          duplicateMode,
          globalIndex
        );

        nextState[branch] = merged.value;
        branchChanges[branch] = safeClone(merged.value);

        report.branches[branch] = {
          detected: incoming.length,
          added: merged.stats.added,
          skipped: merged.stats.skipped,
          crossBranchSkipped: merged.stats.crossBranchSkipped,
          replaced: merged.stats.replaced,
          merged: merged.stats.merged
        };

        report.totals.detected += incoming.length;
        report.totals.added += merged.stats.added;
        report.totals.skipped += merged.stats.skipped;
        report.totals.crossBranchSkipped += merged.stats.crossBranchSkipped;
        report.totals.replaced += merged.stats.replaced;
        report.totals.merged += merged.stats.merged;
      } else if (isObject(incoming)) {
        var oldObject = asObject(nextState[branch]);
        var nextObject = objectMode === "replace"
          ? safeClone(incoming)
          : Object.assign({}, oldObject, incoming);

        nextState[branch] = nextObject;
        branchChanges[branch] = safeClone(nextObject);

        report.branches[branch] = {
          detected: 1,
          added: Object.keys(oldObject).length ? 0 : 1,
          skipped: 0,
          crossBranchSkipped: 0,
          replaced: objectMode === "replace" ? 1 : 0,
          merged: objectMode === "replace" ? 0 : 1
        };

        report.totals.detected += 1;
        report.totals.added += Object.keys(oldObject).length ? 0 : 1;
        report.totals.replaced += objectMode === "replace" ? 1 : 0;
        report.totals.merged += objectMode === "replace" ? 0 : 1;
      }
    });

    return {
      existingState: existingState,
      nextState: nextState,
      branchChanges: branchChanges
    };
  }

  function writeBranch(store, branch, value) {
    var methodName =
      "set" + branch.charAt(0).toUpperCase() + branch.slice(1);

    if (typeof store[methodName] === "function") {
      return {
        success: Boolean(safeCall(store[methodName], false, store, [
          safeClone(value),
          { source: "travel-import" }
        ])),
        method: methodName
      };
    }

    if (typeof store.updateBranch === "function") {
      return {
        success: Boolean(safeCall(store.updateBranch, false, store, [
          branch,
          safeClone(value),
          { source: "travel-import" }
        ])),
        method: "updateBranch"
      };
    }

    if (typeof store.setBranch === "function") {
      return {
        success: Boolean(safeCall(store.setBranch, false, store, [
          branch,
          safeClone(value),
          { source: "travel-import" }
        ])),
        method: "setBranch"
      };
    }

    if (typeof store.dispatch === "function") {
      var dispatchResult = safeCall(store.dispatch, undefined, store, [{
        type: "IMPORT_BRANCH",
        payload: {
          branch: branch,
          value: safeClone(value)
        },
        meta: {
          source: "travel-import",
          replace: true
        }
      }]);

      return {
        success: dispatchResult !== false && dispatchResult !== undefined,
        method: "dispatch:IMPORT_BRANCH"
      };
    }

    return {
      success: false,
      method: null
    };
  }

  function commitPlan(plan, options) {
    var settings = asObject(options);
    var store = getStore();

    if (!store) {
      return {
        success: false,
        method: "none",
        branches: {},
        error: new Error("Store integration is not available.")
      };
    }

    var branchResults = {};
    var branchNames = Object.keys(plan.branchChanges);
    var allBranchWritesSucceeded = branchNames.length > 0;

    branchNames.forEach(function commitBranch(branch) {
      var result = writeBranch(store, branch, plan.branchChanges[branch]);
      branchResults[branch] = result;
      if (!result.success) allBranchWritesSucceeded = false;
    });

    if (allBranchWritesSucceeded) {
      return {
        success: true,
        method: "branch-write",
        branches: branchResults,
        error: null
      };
    }

    if (settings.fullReplace !== true) {
      return {
        success: false,
        method: "branch-write",
        branches: branchResults,
        error: new Error(
          "No compatible branch-level Store method accepted every branch. Full state replacement was not authorized."
        )
      };
    }

    var success = false;
    var method = "none";

    if (typeof store.replaceState === "function") {
      success = Boolean(safeCall(store.replaceState, false, store, [
        safeClone(plan.nextState),
        { source: "travel-import", explicitFullReplace: true }
      ]));
      method = "replaceState";
    }

    if (!success && typeof store.setState === "function") {
      success = Boolean(safeCall(store.setState, false, store, [
        safeClone(plan.nextState),
        { source: "travel-import", explicitFullReplace: true }
      ]));
      method = "setState";
    }

    if (!success && typeof store.restore === "function") {
      success = Boolean(safeCall(store.restore, false, store, [
        safeClone(plan.nextState),
        { source: "travel-import", explicitFullReplace: true }
      ]));
      method = "restore";
    }

    if (!success && typeof store.importData === "function") {
      success = Boolean(safeCall(store.importData, false, store, [
        safeClone(plan.nextState),
        { source: "travel-import", explicitFullReplace: true }
      ]));
      method = "importData";
    }

    if (!success && typeof store.dispatch === "function") {
      var dispatchResult = safeCall(store.dispatch, undefined, store, [{
        type: "IMPORT_DATA",
        payload: safeClone(plan.nextState),
        meta: {
          source: "travel-import",
          replace: true,
          explicitFullReplace: true
        }
      }]);

      success = dispatchResult !== false && dispatchResult !== undefined;
      method = "dispatch:IMPORT_DATA";
    }

    if (!success && settings.allowDirectState === true) {
      if (isObject(store.state)) {
        Object.keys(store.state).forEach(function remove(key) {
          delete store.state[key];
        });
        Object.assign(store.state, safeClone(plan.nextState));
        success = true;
        method = "direct-state";
      } else if (isObject(store.data)) {
        Object.keys(store.data).forEach(function remove(key) {
          delete store.data[key];
        });
        Object.assign(store.data, safeClone(plan.nextState));
        success = true;
        method = "direct-data";
      }
    }

    return {
      success: success,
      method: method,
      branches: branchResults,
      error: success
        ? null
        : new Error("No compatible Store write method accepted the explicit full import.")
    };
  }

  function refreshIntegrations(branches) {
    var brain = getBrain();

    if (brain && typeof brain.refresh === "function") {
      safeCall(brain.refresh, null, brain, [{
        reason: "travel-import",
        branches: asArray(branches)
      }]);
    }

    emit("store:updated", {
      source: "travel-import",
      branches: asArray(branches),
      generatedAt: nowIso()
    });
  }

  function preview(input, options) {
    return importData(input, Object.assign({}, asObject(options), {
      preview: true
    }));
  }

  function importData(input, options) {
    var settings = asObject(options);

    if (runtime.busy) {
      return Promise.resolve({
        success: false,
        status: "busy",
        message: "يوجد استيراد آخر قيد التنفيذ."
      });
    }

    runtime.busy = true;
    runtime.activeImportId = createId("import");

    var importId = runtime.activeImportId;
    var started = Date.now();
    var parsed = parse(input, settings);
    var report = createReport({
      importId: importId,
      preview: settings.preview === true,
      format: parsed.format,
      duplicateMode: settings.duplicateMode,
      objectMode: settings.objectMode,
      fullReplace: settings.fullReplace === true,
      source: settings.source
    });

    notify("import-started", {
      importId: importId,
      preview: settings.preview === true,
      format: parsed.format
    });

    return Promise.resolve()
      .then(function processImport() {
        if (!parsed.success) {
          throw parsed.error || new Error("Unable to parse import data.");
        }

        var normalized = normalizePayload(parsed.data, settings);
        var validation = validate(normalized, settings);

        report.validation = validation;
        report.errors = validation.errors.slice();
        report.warnings = validation.warnings.slice();
        report.totals.errors = validation.errors.length;
        report.totals.warnings = validation.warnings.length;

        if (!validation.valid) {
          report.status = "invalid";

          return {
            success: false,
            preview: settings.preview === true,
            normalized: normalized,
            report: report
          };
        }

        var plan = buildImportPlan(normalized, settings, report);

        if (settings.preview === true) {
          report.status = "preview";

          return {
            success: true,
            preview: true,
            normalized: normalized,
            nextState: settings.includeNextState === false
              ? undefined
              : plan.nextState,
            branchChanges: safeClone(plan.branchChanges),
            report: report
          };
        }

        var commit = commitPlan(plan, settings);
        report.commit = {
          success: commit.success,
          method: commit.method,
          branches: safeClone(commit.branches)
        };

        if (!commit.success) throw commit.error;

        report.status = "completed";

        var importedBranches = Object.keys(normalized);
        refreshIntegrations(importedBranches);

        emit("travel-import:completed", {
          importId: importId,
          report: safeClone(report),
          branches: importedBranches,
          generatedAt: nowIso()
        });

        var interfaceApi = getUI();
        if (interfaceApi) {
          safeCall(interfaceApi.toast, null, interfaceApi, [
            "تم استيراد بيانات السفر بنجاح.",
            "success"
          ]);
        }

        return {
          success: true,
          preview: false,
          normalized: normalized,
          report: report
        };
      })
      .catch(function handleError(error) {
        runtime.lastError = error;
        report.status = "failed";
        report.errors.push({
          code: "IMPORT_FAILED",
          message: error && error.message ? error.message : String(error)
        });
        report.totals.errors = report.errors.length;

        emit("travel-import:failed", {
          importId: importId,
          report: safeClone(report),
          error: report.errors[report.errors.length - 1]
        });

        var interfaceApi = getUI();
        if (interfaceApi) {
          safeCall(interfaceApi.toast, null, interfaceApi, [
            "تعذر استيراد بيانات السفر.",
            "error"
          ]);
        }

        return {
          success: false,
          preview: settings.preview === true,
          report: report,
          error: {
            name: error && error.name ? error.name : "ImportError",
            message: error && error.message ? error.message : String(error)
          }
        };
      })
      .then(function finalize(result) {
        report.completedAt = nowIso();
        report.durationMs = Date.now() - started;

        runtime.lastReport = safeClone(report);
        persistReport(runtime.lastReport);
        notify("import-finished", runtime.lastReport);

        result.report = safeClone(report);
        return result;
      })
      .finally(function release() {
        if (runtime.activeImportId === importId) {
          runtime.activeImportId = null;
          runtime.busy = false;
        }
      });
  }

  function readFileAsText(file) {
    return new Promise(function executor(resolve, reject) {
      if (!file) {
        reject(new Error("No file was provided."));
        return;
      }

      if (typeof file.size === "number" && file.size > MAX_FILE_SIZE) {
        reject(new Error("File size exceeds the 20 MB import limit."));
        return;
      }

      if (typeof file.text === "function") {
        file.text().then(resolve).catch(reject);
        return;
      }

      if (!global.FileReader) {
        reject(new Error("FileReader is not available."));
        return;
      }

      var reader = new global.FileReader();

      reader.onload = function onLoad() {
        resolve(reader.result);
      };

      reader.onerror = function onError() {
        reject(reader.error || new Error("Unable to read file."));
      };

      reader.readAsText(file);
    });
  }

  function fileFormat(file) {
    var name = asString(file && file.name).toLowerCase();
    var type = asString(file && file.type).toLowerCase();

    if (name.endsWith(".json") || type.indexOf("json") !== -1) return "json";
    if (name.endsWith(".csv") || type.indexOf("csv") !== -1) return "csv";
    return "text";
  }

  function importFile(file, options) {
    var baseOptions = asObject(options);

    var settings = Object.assign({}, baseOptions, {
      format: asString(baseOptions.format, fileFormat(file)),
      source: Object.assign(
        {},
        asObject(baseOptions.source),
        {
          type: "file",
          name: file && file.name ? file.name : "",
          size: file && typeof file.size === "number" ? file.size : null,
          mimeType: file && file.type ? file.type : ""
        }
      )
    });

    return readFileAsText(file)
      .then(function onRead(text) {
        return importData(text, settings);
      })
      .catch(function onError(error) {
        runtime.lastError = error;

        var report = createReport({
          importId: createId("import"),
          preview: settings.preview === true,
          format: settings.format,
          source: settings.source
        });

        report.status = "failed";
        report.completedAt = nowIso();
        report.errors.push({
          code: "FILE_READ_FAILED",
          message: error.message
        });
        report.totals.errors = 1;

        runtime.lastReport = report;
        persistReport(report);
        notify("file-read-failed", report);

        return {
          success: false,
          report: safeClone(report),
          error: {
            name: error.name,
            message: error.message
          }
        };
      });
  }

  function getLastReport() {
    return safeClone(runtime.lastReport || restoreReport());
  }

  function clearLastReport() {
    runtime.lastReport = null;

    try {
      if (global.localStorage) {
        global.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      runtime.lastError = error;
    }

    notify("report-cleared", null);
    return true;
  }

  function subscribe(listener, options) {
    if (typeof listener !== "function") {
      throw new TypeError("TravelImport.subscribe requires a function.");
    }

    runtime.listeners.add(listener);

    if (asObject(options).immediate !== false) {
      listener(getState(), {
        reason: "subscribe",
        generatedAt: nowIso()
      });
    }

    return function unsubscribe() {
      runtime.listeners.delete(listener);
    };
  }

  function getState() {
    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: runtime.initialized,
      destroyed: runtime.destroyed,
      busy: runtime.busy,
      activeImportId: runtime.activeImportId,
      lastReport: getLastReport(),
      supportedBranches: SUPPORTED_BRANCHES.slice(),
      supportedFormats: ["object", "json", "csv", "text"],
      limits: {
        maxFileSize: MAX_FILE_SIZE,
        maxRecords: MAX_RECORDS
      },
      generatedAt: nowIso()
    };
  }

  function getHealth() {
    var store = getStore();

    return {
      module: MODULE_NAME,
      version: VERSION,
      initialized: runtime.initialized,
      destroyed: runtime.destroyed,
      busy: runtime.busy,
      activeImportId: runtime.activeImportId,
      integrations: {
        store: Boolean(store),
        storeVersion: store ? asString(store.version) : null,
        branchWrite: Boolean(store && (
          typeof store.updateBranch === "function" ||
          typeof store.setBranch === "function" ||
          typeof store.dispatch === "function" ||
          SUPPORTED_BRANCHES.some(function hasSetter(branch) {
            var method =
              "set" + branch.charAt(0).toUpperCase() + branch.slice(1);
            return typeof store[method] === "function";
          })
        )),
        fullStateWrite: Boolean(store && (
          typeof store.replaceState === "function" ||
          typeof store.setState === "function" ||
          typeof store.restore === "function" ||
          typeof store.importData === "function"
        )),
        events: Boolean(getEvents()),
        domEvents: Boolean(global.document),
        ui: Boolean(getUI()),
        brain: Boolean(getBrain()),
        localStorage: Boolean(global.localStorage),
        fileReader: Boolean(global.FileReader)
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

  function bindDomRequest() {
    if (!global.document || typeof global.document.addEventListener !== "function") {
      return;
    }

    var handler = function onImportRequest(event) {
      var request = asObject(event && event.detail);

      if (request.file) {
        importFile(request.file, request.options);
      } else if (request.data !== undefined) {
        importData(request.data, request.options);
      }
    };

    global.document.addEventListener("travel-import:request", handler);

    runtime.domUnsubscribers.push(function removeDomRequest() {
      global.document.removeEventListener("travel-import:request", handler);
    });
  }

  function bindEvents() {
    var events = getEvents();

    if (events) {
      var handler = function importRequest(payload) {
        var request = asObject(payload);

        if (request.file) {
          importFile(request.file, request.options);
        } else if (request.data !== undefined) {
          importData(request.data, request.options);
        }
      };

      var unsubscribe =
        safeCall(events.on, null, events, [
          "travel-import:request",
          handler
        ]) ||
        safeCall(events.subscribe, null, events, [
          "travel-import:request",
          handler
        ]);

      if (typeof unsubscribe === "function") {
        runtime.eventUnsubscribers.push(unsubscribe);
      }
    }

    bindDomRequest();
  }

  function init(options) {
    if (runtime.initialized && !runtime.destroyed) {
      return getState();
    }

    runtime.destroyed = false;
    runtime.initialized = true;

    if (asObject(options).restoreReport !== false) {
      runtime.lastReport = restoreReport();
    }

    bindEvents();

    emit("travel-import:ready", {
      version: VERSION,
      supportedBranches: SUPPORTED_BRANCHES.slice(),
      generatedAt: nowIso()
    });

    notify("init", null);
    return getState();
  }

  function destroy() {
    runtime.eventUnsubscribers.forEach(function unsubscribe(fn) {
      safeCall(fn, null);
    });

    runtime.domUnsubscribers.forEach(function unsubscribeDom(fn) {
      safeCall(fn, null);
    });

    runtime.eventUnsubscribers = [];
    runtime.domUnsubscribers = [];
    runtime.listeners.clear();
    runtime.busy = false;
    runtime.activeImportId = null;
    runtime.initialized = false;
    runtime.destroyed = true;

    return true;
  }

  var api = {
    version: VERSION,
    name: MODULE_NAME,
    supportedBranches: SUPPORTED_BRANCHES,

    init: init,
    destroy: destroy,

    parse: parse,
    validate: validate,
    normalize: normalizePayload,

    preview: preview,
    importData: importData,
    importFile: importFile,

    getLastReport: getLastReport,
    clearLastReport: clearLastReport,
    getState: getState,
    getHealth: getHealth,
    subscribe: subscribe,

    utils: Object.freeze({
      normalizeText: normalizeText,
      detectFormat: detectFormat,
      fingerprint: fingerprint,
      dateToIso: dateToIso
    })
  };

  var frozenApi = Object.freeze(api);

  global.TravelImport = frozenApi;
  global.TIC.TravelImport = frozenApi;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener(
        "DOMContentLoaded",
        function autoInitOnReady() {
          if (!runtime.initialized && !runtime.destroyed) init();
        },
        { once: true }
      );
    } else {
      global.setTimeout(function autoInit() {
        if (!runtime.initialized && !runtime.destroyed) init();
      }, 0);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
