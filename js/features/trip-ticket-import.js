/* =========================================================
   Travel Intelligence Center
   Trip Ticket Import V1.1.0

   File Path:
   js/features/trip-ticket-import.js

   Purpose:
   - Uses TIC Document Reader.
   - Imports airline ticket images/PDF.
   - Extracts common flight details from Arabic and English text.
   - Returns normalized fields compatible with Trip Form V3.
   - Provides parse() as the primary API expected by Trip Form.
   - Keeps import() as a backward-compatible alias.
   - Falls back safely when OCR is unavailable or text is incomplete.

   Extracted Fields:
   - passengerName
   - airline
   - flightNumber
   - departureAirport
   - arrivalAirport
   - departureDate
   - departureTime
   - arrivalDate
   - arrivalTime
   - bookingReference
   - terminal
   - gate
   - seatNumber

   Dependencies:
   - js/features/document-reader.js

   Global APIs:
   - window.TIC.Features.TripTicketImport
   - window.TICTripTicketImport
========================================================= */

(function (window) {
  "use strict";

  const FEATURE_ID = "trip-ticket-import";
  const FEATURE_VERSION = "1.1.0";

  const state = {
    initialized: false,
    subscribers: new Set(),
    lastResult: null
  };

  const AIRLINES = [
    ["Etihad Airways", /\b(?:ETIHAD|EY)\b/i],
    ["Emirates", /\b(?:EMIRATES|EK)\b/i],
    ["Air Arabia", /\b(?:AIR\s*ARABIA|G9)\b/i],
    ["flydubai", /\b(?:FLYDUBAI|FZ)\b/i],
    ["Wizz Air", /\b(?:WIZZ\s*AIR|W6)\b/i],
    ["Qatar Airways", /\b(?:QATAR\s*AIRWAYS|QR)\b/i],
    ["Saudia", /\b(?:SAUDIA|SAUDI\s*ARABIAN|SV)\b/i],
    ["Turkish Airlines", /\b(?:TURKISH\s*AIRLINES|TK)\b/i],
    ["Lufthansa", /\b(?:LUFTHANSA|LH)\b/i],
    ["British Airways", /\b(?:BRITISH\s*AIRWAYS|BA)\b/i],
    ["Air Astana", /\b(?:AIR\s*ASTANA|KC)\b/i],
    ["Pegasus", /\b(?:PEGASUS|PC)\b/i],
    ["Oman Air", /\b(?:OMAN\s*AIR|WY)\b/i],
    ["Gulf Air", /\b(?:GULF\s*AIR|GF)\b/i],
    ["Kuwait Airways", /\b(?:KUWAIT\s*AIRWAYS|KU)\b/i],
    ["Royal Jordanian", /\b(?:ROYAL\s*JORDANIAN|RJ)\b/i],
    ["EgyptAir", /\b(?:EGYPTAIR|MS)\b/i]
  ];

  const MONTHS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };

  const clone = (value) => {
    if (value === undefined) return undefined;

    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (error) {
        // Continue to fallback.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  };

  const text = (value) =>
    String(value ?? "").trim();

  const normalizeText = (value) =>
    text(value)
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      feature: FEATURE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "TIC Trip Ticket Import subscriber error:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:trip-ticket-import:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const getReader = () =>
    window.TIC?.Features?.DocumentReader ||
    window.TICDocumentReader ||
    null;

  const firstMatch = (source, patterns) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);

      if (match) {
        for (let index = 1; index < match.length; index += 1) {
          if (text(match[index])) {
            return text(match[index]);
          }
        }
      }
    }

    return "";
  };

  const normalizeDate = (value) => {
    const raw = text(value);

    if (!raw) return "";

    const numeric = raw.match(
      /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/
    );

    if (numeric) {
      let year = Number(numeric[3]);

      if (year < 100) {
        year += 2000;
      }

      const month = String(Number(numeric[2])).padStart(2, "0");
      const day = String(Number(numeric[1])).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }

    const reverseNumeric = raw.match(
      /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/
    );

    if (reverseNumeric) {
      return `${reverseNumeric[1]}-${String(
        Number(reverseNumeric[2])
      ).padStart(2, "0")}-${String(
        Number(reverseNumeric[3])
      ).padStart(2, "0")}`;
    }

    const named = raw.match(
      /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/i
    );

    if (named) {
      const month = MONTHS[named[2].toLowerCase()];

      if (month) {
        let year = Number(named[3]);

        if (year < 100) {
          year += 2000;
        }

        return `${year}-${String(month).padStart(2, "0")}-${String(
          Number(named[1])
        ).padStart(2, "0")}`;
      }
    }

    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(
        parsed.getMonth() + 1
      ).padStart(2, "0")}-${String(
        parsed.getDate()
      ).padStart(2, "0")}`;
    }

    return "";
  };

  const normalizeTime = (value) => {
    const raw = text(value);

    if (!raw) return "";

    const match = raw.match(
      /\b(\d{1,2})[:.](\d{2})\s*(AM|PM|ص|م)?\b/i
    );

    if (!match) return "";

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const suffix = text(match[3]).toLowerCase();

    if (["pm", "م"].includes(suffix) && hours < 12) {
      hours += 12;
    }

    if (["am", "ص"].includes(suffix) && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}`;
  };

  const extractAirline = (source) => {
    for (const [name, pattern] of AIRLINES) {
      if (pattern.test(source)) {
        return name;
      }
    }

    return firstMatch(source, [
      /(?:AIRLINE|CARRIER|شركة\s*الطيران)\s*[:\-]?\s*([A-Za-z][A-Za-z &.'-]{2,40})/i
    ]);
  };

  const extractFlightNumber = (source) =>
    firstMatch(source, [
      /(?:FLIGHT(?:\s*NO\.?|\s*NUMBER)?|رقم\s*الرحلة)\s*[:\-]?\s*([A-Z]{2,3}\s?\d{2,4}[A-Z]?)/i,
      /\b([A-Z]{2}\s?\d{2,4}[A-Z]?)\b/
    ]).replace(/\s+/g, "");

  const extractBookingReference = (source) =>
    firstMatch(source, [
      /(?:BOOKING\s*REFERENCE|BOOKING\s*REF|RESERVATION\s*CODE|PNR|CONFIRMATION\s*NUMBER|رقم\s*الحجز|مرجع\s*الحجز)\s*[:\-]?\s*([A-Z0-9]{5,10})/i
    ]).toUpperCase();

  const extractPassengerName = (source) =>
    firstMatch(source, [
      /(?:PASSENGER|PASSENGER\s*NAME|TRAVELLER|TRAVELER|اسم\s*المسافر)\s*[:\-]?\s*([A-Z][A-Z\s\/'-]{3,50})/i,
      /(?:MR|MRS|MS|MISS|MASTER)\s+([A-Z][A-Z\s\/'-]{3,50})/i
    ])
      .replace(/\s{2,}/g, " ")
      .trim();

  const extractSeat = (source) =>
    firstMatch(source, [
      /(?:SEAT|SEAT\s*NO\.?|المقعد|رقم\s*المقعد)\s*[:\-]?\s*([0-9]{1,3}[A-Z]?)/i
    ]).toUpperCase();

  const extractGate = (source) =>
    firstMatch(source, [
      /(?:GATE|بوابة|البوابة)\s*[:\-]?\s*([A-Z0-9]{1,6})/i
    ]).toUpperCase();

  const extractTerminal = (source) =>
    firstMatch(source, [
      /(?:TERMINAL|TERM\.?|المبنى|الصالة)\s*[:\-]?\s*([A-Z0-9]{1,8})/i
    ]).toUpperCase();

  const extractAirports = (source) => {
    const codes = Array.from(
      source.matchAll(/\b([A-Z]{3})\b/g)
    )
      .map((match) => match[1])
      .filter((code) =>
        ![
          "THE",
          "AND",
          "FOR",
          "AIR",
          "UTC",
          "AED",
          "PNR"
        ].includes(code)
      );

    const labelledDeparture = firstMatch(source, [
      /(?:FROM|DEPARTURE\s*AIRPORT|ORIGIN|مطار\s*المغادرة|من)\s*[:\-]?\s*(?:[A-Za-z\u0600-\u06FF .'-]+\s+)?\(?([A-Z]{3})\)?/i
    ]);

    const labelledArrival = firstMatch(source, [
      /(?:TO|ARRIVAL\s*AIRPORT|DESTINATION|مطار\s*الوصول|إلى)\s*[:\-]?\s*(?:[A-Za-z\u0600-\u06FF .'-]+\s+)?\(?([A-Z]{3})\)?/i
    ]);

    return {
      departureAirport:
        labelledDeparture ||
        codes[0] ||
        "",
      arrivalAirport:
        labelledArrival ||
        codes[1] ||
        ""
    };
  };

  const extractDates = (source) => {
    const departureRaw = firstMatch(source, [
      /(?:DEPARTURE\s*DATE|DATE\s*OF\s*DEPARTURE|OUTBOUND\s*DATE|تاريخ\s*الإقلاع|تاريخ\s*المغادرة)\s*[:\-]?\s*([^\n]{4,24})/i
    ]);

    const arrivalRaw = firstMatch(source, [
      /(?:ARRIVAL\s*DATE|DATE\s*OF\s*ARRIVAL|تاريخ\s*الوصول)\s*[:\-]?\s*([^\n]{4,24})/i
    ]);

    const allDates = [
      ...source.matchAll(
        /\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/g
      )
    ].map((match) => match[0]);

    return {
      departureDate:
        normalizeDate(departureRaw) ||
        normalizeDate(allDates[0]),
      arrivalDate:
        normalizeDate(arrivalRaw) ||
        normalizeDate(allDates[1])
    };
  };

  const extractTimes = (source) => {
    const departureRaw = firstMatch(source, [
      /(?:DEPARTURE\s*TIME|TIME\s*OF\s*DEPARTURE|BOARDING\s*TIME|وقت\s*الإقلاع|وقت\s*المغادرة)\s*[:\-]?\s*([0-9]{1,2}[:.][0-9]{2}\s*(?:AM|PM|ص|م)?)/i
    ]);

    const arrivalRaw = firstMatch(source, [
      /(?:ARRIVAL\s*TIME|TIME\s*OF\s*ARRIVAL|وقت\s*الوصول)\s*[:\-]?\s*([0-9]{1,2}[:.][0-9]{2}\s*(?:AM|PM|ص|م)?)/i
    ]);

    const allTimes = [
      ...source.matchAll(
        /\b\d{1,2}[:.]\d{2}\s*(?:AM|PM|ص|م)?\b/gi
      )
    ].map((match) => match[0]);

    return {
      departureTime:
        normalizeTime(departureRaw) ||
        normalizeTime(allTimes[0]),
      arrivalTime:
        normalizeTime(arrivalRaw) ||
        normalizeTime(allTimes[1])
    };
  };

  const calculateConfidence = (fields) => {
    const weighted = [
      ["flightNumber", 18],
      ["departureAirport", 14],
      ["arrivalAirport", 14],
      ["departureDate", 12],
      ["departureTime", 10],
      ["airline", 8],
      ["bookingReference", 8],
      ["arrivalDate", 5],
      ["arrivalTime", 5],
      ["terminal", 2],
      ["gate", 2],
      ["seatNumber", 2]
    ];

    return weighted.reduce(
      (score, [key, weight]) =>
        score + (text(fields[key]) ? weight : 0),
      0
    );
  };

  const parseText = (rawText) => {
    const source = normalizeText(rawText);
    const airports = extractAirports(source);
    const dates = extractDates(source);
    const times = extractTimes(source);

    const fields = {
      passengerName:
        extractPassengerName(source),
      airline:
        extractAirline(source),
      flightNumber:
        extractFlightNumber(source),
      departureAirport:
        airports.departureAirport,
      arrivalAirport:
        airports.arrivalAirport,
      departureDate:
        dates.departureDate,
      departureTime:
        times.departureTime,
      arrivalDate:
        dates.arrivalDate,
      arrivalTime:
        times.arrivalTime,
      bookingReference:
        extractBookingReference(source),
      terminal:
        extractTerminal(source),
      gate:
        extractGate(source),
      seatNumber:
        extractSeat(source)
    };

    const confidence =
      calculateConfidence(fields);

    return {
      fields,
      confidence,
      success:
        confidence >= 20
    };
  };

  const mapToTripFormData = (fields) => ({
    airline: fields.airline || "",
    flightNumber: fields.flightNumber || "",
    departureAirport:
      fields.departureAirport || "",
    arrivalAirport:
      fields.arrivalAirport || "",
    departureDate:
      fields.departureDate || "",
    departureTime:
      fields.departureTime || "",
    arrivalDate:
      fields.arrivalDate || "",
    arrivalTime:
      fields.arrivalTime || "",
    bookingReference:
      fields.bookingReference || "",
    terminal:
      fields.terminal || "",
    gate:
      fields.gate || "",
    seatNumber:
      fields.seatNumber || ""
  });

  const Importer = {
    id: FEATURE_ID,
    version: FEATURE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      state.initialized = true;

      emit("initialized", {
        version: FEATURE_VERSION
      });

      return this.diagnostics();
    },

    async parse(file, context = {}) {
      this.init();

      const reader = getReader();

      if (!reader) {
        throw new Error(
          "TIC Trip Ticket Import Error: Document Reader is unavailable."
        );
      }

      emit("parse-started", {
        fileName: text(file?.name),
        fileType: text(file?.type),
        fileSize: Number(file?.size || 0)
      });

      const readerResult = await reader.read(file, {
        ...context,
        documentType: "flight-ticket"
      });

      const rawText =
        normalizeText(readerResult?.text || "");

      if (!rawText) {
        const emptyResult = {
          success: false,
          data: {},
          fields: {},
          rawText: "",
          provider:
            readerResult?.provider || null,
          confidence:
            readerResult?.confidence ?? 0,
          reason:
            readerResult?.reason ||
            "empty-text",
          message:
            readerResult?.message ||
            "لم يتم العثور على نص داخل التذكرة."
        };

        state.lastResult =
          emptyResult;

        emit("parse-empty", {
          provider:
            emptyResult.provider,
          reason:
            emptyResult.reason
        });

        return clone(emptyResult);
      }

      const parsed = parseText(rawText);

      const result = {
        success: parsed.success,
        data:
          mapToTripFormData(
            parsed.fields
          ),
        fields:
          clone(parsed.fields),
        rawText,
        provider:
          readerResult?.provider || null,
        confidence:
          Math.max(
            Number(readerResult?.confidence || 0),
            parsed.confidence
          ),
        readerConfidence:
          readerResult?.confidence ?? null,
        parserConfidence:
          parsed.confidence,
        metadata:
          clone(readerResult?.metadata || {}),
        message:
          parsed.success
            ? "تم استخراج بيانات التذكرة. راجعها قبل الحفظ."
            : "تمت قراءة التذكرة، لكن بعض البيانات تحتاج مراجعة يدوية."
      };

      state.lastResult = result;

      emit("parse-completed", {
        success: result.success,
        provider: result.provider,
        confidence: result.confidence,
        extractedFields:
          Object.keys(result.data).filter(
            (key) => text(result.data[key])
          )
      });

      return clone(result);
    },

    async import(file, context = {}) {
      return this.parse(file, context);
    },

    parseText(rawText) {
      const parsed = parseText(rawText);

      return {
        success: parsed.success,
        data:
          mapToTripFormData(
            parsed.fields
          ),
        fields:
          clone(parsed.fields),
        rawText:
          normalizeText(rawText),
        confidence:
          parsed.confidence
      };
    },

    getLastResult() {
      return clone(
        state.lastResult
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Trip Ticket Import subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    destroy() {
      state.subscribers.clear();
      state.lastResult = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      return {
        id: this.id,
        version: this.version,
        initialized:
          state.initialized,
        documentReaderAvailable:
          Boolean(getReader()),
        hasLastResult:
          Boolean(state.lastResult),
        subscriberCount:
          state.subscribers.size
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Features =
    window.TIC.Features || {};

  window.TIC.Features.TripTicketImport =
    Importer;

  window.TICTripTicketImport =
    Importer;

  Importer.init();
})(window);
