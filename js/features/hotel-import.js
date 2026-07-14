/* =========================================================
   Travel Intelligence Center
   Hotel Import V1.1.0

   File Path:
   js/features/hotel-import.js

   Purpose:
   - Uses TIC Document Reader.
   - Imports hotel booking images/PDF.
   - Extracts common booking details from Arabic and English text.
   - Returns normalized fields compatible with Trip Form V3.
   - Provides parse() as the primary API expected by Trip Form.
   - Keeps import() as a backward-compatible alias.
   - Falls back safely when OCR is unavailable or text is incomplete.

   Extracted Fields:
   - guestName
   - accommodation
   - hotelBookingReference
   - hotelCheckIn
   - hotelCheckOut
   - accommodationAddress
   - city
   - country
   - roomType
   - phone
   - email
   - website

   Dependencies:
   - js/features/document-reader.js

   Global APIs:
   - window.TIC.Features.HotelImport
   - window.TICHotelImport
========================================================= */

(function (window) {
  "use strict";

  const FEATURE_ID = "hotel-import";
  const FEATURE_VERSION = "1.1.0";

  const state = {
    initialized: false,
    subscribers: new Set(),
    lastResult: null
  };

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
          "TIC Hotel Import subscriber error:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:hotel-import:${type}`, {
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

      return `${year}-${String(
        Number(numeric[2])
      ).padStart(2, "0")}-${String(
        Number(numeric[1])
      ).padStart(2, "0")}`;
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

  const extractHotelName = (source) =>
    firstMatch(source, [
      /(?:HOTEL\s*NAME|PROPERTY\s*NAME|ACCOMMODATION|اسم\s*الفندق|مكان\s*الإقامة)\s*[:\-]?\s*([^\n]{3,80})/i,
      /(?:BOOKING\s*AT|RESERVATION\s*AT|STAY\s*AT)\s+([^\n]{3,80})/i
    ]);

  const extractBookingReference = (source) =>
    firstMatch(source, [
      /(?:BOOKING\s*REFERENCE|BOOKING\s*REF|CONFIRMATION\s*NUMBER|RESERVATION\s*NUMBER|RESERVATION\s*ID|رقم\s*الحجز|مرجع\s*الحجز)\s*[:\-]?\s*([A-Z0-9\-]{4,20})/i
    ]).toUpperCase();

  const extractGuestName = (source) =>
    firstMatch(source, [
      /(?:GUEST\s*NAME|LEAD\s*GUEST|BOOKED\s*FOR|اسم\s*النزيل|اسم\s*الضيف)\s*[:\-]?\s*([A-Z\u0600-\u06FF][A-Z\u0600-\u06FF\s\/'-]{3,60})/i
    ])
      .replace(/\s{2,}/g, " ")
      .trim();

  const extractDates = (source) => {
    const checkInRaw = firstMatch(source, [
      /(?:CHECK[\s-]?IN|ARRIVAL\s*DATE|تسجيل\s*الدخول|تاريخ\s*الدخول)\s*[:\-]?\s*([^\n]{4,30})/i
    ]);

    const checkOutRaw = firstMatch(source, [
      /(?:CHECK[\s-]?OUT|DEPARTURE\s*DATE|تسجيل\s*الخروج|تاريخ\s*الخروج)\s*[:\-]?\s*([^\n]{4,30})/i
    ]);

    const allDates = [
      ...source.matchAll(
        /\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/g
      )
    ].map((match) => match[0]);

    return {
      hotelCheckIn:
        normalizeDate(checkInRaw) ||
        normalizeDate(allDates[0]),
      hotelCheckOut:
        normalizeDate(checkOutRaw) ||
        normalizeDate(allDates[1])
    };
  };

  const extractAddress = (source) =>
    firstMatch(source, [
      /(?:ADDRESS|PROPERTY\s*ADDRESS|HOTEL\s*ADDRESS|العنوان|عنوان\s*الفندق)\s*[:\-]?\s*([^\n]{5,120})/i
    ]);

  const extractCity = (source) =>
    firstMatch(source, [
      /(?:CITY|المدينة)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF .'-]{2,50})/i
    ]);

  const extractCountry = (source) =>
    firstMatch(source, [
      /(?:COUNTRY|الدولة)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF .'-]{2,50})/i
    ]);

  const extractRoomType = (source) =>
    firstMatch(source, [
      /(?:ROOM\s*TYPE|ROOM|ACCOMMODATION\s*TYPE|نوع\s*الغرفة|الغرفة)\s*[:\-]?\s*([^\n]{3,80})/i
    ]);

  const extractPhone = (source) =>
    firstMatch(source, [
      /(?:PHONE|TEL|TELEPHONE|هاتف|رقم\s*الهاتف)\s*[:\-]?\s*(\+?[\d\s()\-]{7,25})/i,
      /(\+\d{1,3}[\d\s()\-]{7,20})/
    ]).replace(/\s{2,}/g, " ");

  const extractEmail = (source) =>
    firstMatch(source, [
      /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i
    ]).toLowerCase();

  const extractWebsite = (source) =>
    firstMatch(source, [
      /\b((?:https?:\/\/)?(?:www\.)?[A-Z0-9.-]+\.[A-Z]{2,}(?:\/[^\s]*)?)\b/i
    ]);

  const calculateConfidence = (fields) => {
    const weighted = [
      ["accommodation", 22],
      ["hotelBookingReference", 18],
      ["hotelCheckIn", 14],
      ["hotelCheckOut", 14],
      ["accommodationAddress", 10],
      ["guestName", 7],
      ["city", 5],
      ["country", 4],
      ["roomType", 3],
      ["phone", 1],
      ["email", 1],
      ["website", 1]
    ];

    return weighted.reduce(
      (score, [key, weight]) =>
        score + (text(fields[key]) ? weight : 0),
      0
    );
  };

  const parseText = (rawText) => {
    const source = normalizeText(rawText);
    const dates = extractDates(source);

    const fields = {
      guestName: extractGuestName(source),
      accommodation: extractHotelName(source),
      hotelBookingReference:
        extractBookingReference(source),
      hotelCheckIn: dates.hotelCheckIn,
      hotelCheckOut: dates.hotelCheckOut,
      accommodationAddress:
        extractAddress(source),
      city: extractCity(source),
      country: extractCountry(source),
      roomType: extractRoomType(source),
      phone: extractPhone(source),
      email: extractEmail(source),
      website: extractWebsite(source)
    };

    const confidence =
      calculateConfidence(fields);

    return {
      fields,
      confidence,
      success: confidence >= 24
    };
  };

  const mapToTripFormData = (fields) => ({
    accommodation:
      fields.accommodation || "",
    hotelBookingReference:
      fields.hotelBookingReference || "",
    hotelCheckIn:
      fields.hotelCheckIn || "",
    hotelCheckOut:
      fields.hotelCheckOut || "",
    accommodationAddress:
      fields.accommodationAddress || "",
    city:
      fields.city || "",
    country:
      fields.country || ""
  });

  const HotelImport = {
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
          "TIC Hotel Import Error: Document Reader is unavailable."
        );
      }

      emit("parse-started", {
        fileName: text(file?.name),
        fileType: text(file?.type),
        fileSize: Number(file?.size || 0)
      });

      const readerResult = await reader.read(file, {
        ...context,
        documentType: "hotel-booking"
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
            "لم يتم العثور على نص داخل حجز الفندق."
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
            ? "تم استخراج بيانات الفندق. راجعها قبل الحفظ."
            : "تمت قراءة الحجز، لكن بعض البيانات تحتاج مراجعة يدوية."
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
          "TIC Hotel Import subscriber must be a function."
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

  window.TIC.Features.HotelImport =
    HotelImport;

  window.TICHotelImport =
    HotelImport;

  HotelImport.init();
})(window);
