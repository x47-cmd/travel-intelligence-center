/* =========================================================
   Travel Intelligence Center
   Itinerary Parser V1.0.0
   Country Lifecycle System - ChatGPT Itinerary Import Engine

   File Path:
   js/extensions/country-lifecycle/itinerary-parser.js

   Purpose:
   - Parses copied travel plans from ChatGPT or plain text.
   - Detects itinerary days in Arabic and English.
   - Converts lines into days, places and checklist-ready items.
   - Preserves notes, times, durations, links and map hints.
   - Supports simple pasted plans without manual data entry.
   - Integrates safely with CountryLifecycleModel and Engine.
   - Keeps frozen legacy files untouched.
   ========================================================= */

(function itineraryParserBootstrap(global) {
  'use strict';

  if (!global || global.ItineraryParser?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';

  const DAY_WORDS_AR = Object.freeze({
    'الأول': 1,
    'الاول': 1,
    'الثاني': 2,
    'الثالث': 3,
    'الرابع': 4,
    'الخامس': 5,
    'السادس': 6,
    'السابع': 7,
    'الثامن': 8,
    'التاسع': 9,
    'العاشر': 10,
    'الحادي عشر': 11,
    'الثاني عشر': 12,
    'الثالث عشر': 13,
    'الرابع عشر': 14
  });

  const DAY_WORDS_EN = Object.freeze({
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
    thirteenth: 13,
    fourteenth: 14
  });

  const CATEGORY_HINTS = Object.freeze({
    hotel: [
      'hotel', 'resort', 'apartment', 'hostel',
      'فندق', 'المنتجع', 'منتجع', 'الشقة', 'شقة', 'السكن'
    ],
    restaurant: [
      'restaurant', 'dinner', 'lunch', 'breakfast', 'brunch',
      'مطعم', 'عشاء', 'غداء', 'فطور', 'إفطار'
    ],
    cafe: [
      'cafe', 'coffee', 'bakery',
      'كافيه', 'كوفي', 'مقهى', 'مخبز'
    ],
    airport: [
      'airport', 'terminal', 'flight',
      'مطار', 'الرحلة الجوية', 'الطيران'
    ],
    transport: [
      'train', 'metro', 'bus', 'station', 'car rental', 'drive',
      'قطار', 'مترو', 'باص', 'محطة', 'استلام السيارة', 'تسليم السيارة', 'القيادة'
    ],
    shopping: [
      'mall', 'shopping', 'market', 'outlet',
      'مول', 'تسوق', 'سوق', 'أوتلت'
    ],
    activity: [
      'tour', 'cruise', 'experience', 'adventure',
      'جولة', 'رحلة بحرية', 'تجربة', 'مغامرة'
    ],
    place: []
  });

  const IGNORE_LINES = Object.freeze([
    'البرنامج',
    'الخطة',
    'الأماكن',
    'ملاحظات',
    'notes',
    'program',
    'itinerary',
    'schedule'
  ]);

  const BULLET_PATTERN = /^[\s]*[•●▪◦·\-–—*✓✔☐□◻️✅]+[\s]*/u;
  const CHECKBOX_PATTERN = /^[\s]*(?:\[[ xX✓✔]\]|☐|☑|✅|✔|□)[\s]*/u;
  const URL_PATTERN = /(https?:\/\/[^\s]+)/iu;
  const TIME_PATTERN = /(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(ص|م|صباحًا|صباحا|مساءً|مساء|am|pm)?(?:\s|$)/iu;
  const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(دقيقة|دقائق|ساعة|ساعات|minute|minutes|hour|hours|min|hr)/iu;

  function nowISO() {
    return new Date().toISOString();
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asString(value, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }

    return String(value).trim();
  }

  function clone(value) {
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch (_) {
      // Continue.
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function uid(prefix) {
    const random =
      global.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    return `${prefix}_${String(random).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  }

  function normalizeWhitespace(value) {
    return asString(value)
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function stripBullet(value) {
    return normalizeWhitespace(
      asString(value)
        .replace(CHECKBOX_PATTERN, '')
        .replace(BULLET_PATTERN, '')
    );
  }

  function normalizeArabicDigits(value) {
    const map = {
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };

    return asString(value).replace(/[٠-٩]/g, (digit) => map[digit] || digit);
  }

  function normalizeForCompare(value) {
    return normalizeArabicDigits(asString(value))
      .toLowerCase()
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/[إأآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleCaseDay(number, language = 'ar') {
    return language === 'en' ? `Day ${number}` : `اليوم ${number}`;
  }

  function detectLanguage(text) {
    const arabicCount = (asString(text).match(/[\u0600-\u06FF]/g) || []).length;
    const latinCount = (asString(text).match(/[A-Za-z]/g) || []).length;

    return arabicCount >= latinCount ? 'ar' : 'en';
  }

  function parseDayNumber(line) {
    const normalized = normalizeForCompare(line);

    const numericPatterns = [
      /^(?:اليوم|يوم)\s*(\d{1,2})\b/u,
      /^day\s*(\d{1,2})\b/u,
      /^(\d{1,2})\s*(?:اليوم|day)\b/u
    ];

    for (const pattern of numericPatterns) {
      const match = normalized.match(pattern);

      if (match) {
        return Number(match[1]);
      }
    }

    for (const [word, number] of Object.entries(DAY_WORDS_AR)) {
      if (
        normalized === `اليوم ${normalizeForCompare(word)}` ||
        normalized.startsWith(`اليوم ${normalizeForCompare(word)} `) ||
        normalized === normalizeForCompare(word)
      ) {
        return number;
      }
    }

    for (const [word, number] of Object.entries(DAY_WORDS_EN)) {
      if (
        normalized === `${word} day` ||
        normalized === `day ${word}` ||
        normalized.startsWith(`day ${word} `)
      ) {
        return number;
      }
    }

    return null;
  }

  function isDayHeader(line) {
    const clean = stripBullet(line);

    if (!clean) {
      return false;
    }

    if (parseDayNumber(clean)) {
      return true;
    }

    const normalized = normalizeForCompare(clean);

    return /^(اليوم|يوم|day)\b/u.test(normalized);
  }

  function detectCategory(value) {
    const normalized = normalizeForCompare(value);

    for (const [category, hints] of Object.entries(CATEGORY_HINTS)) {
      if (category === 'place') {
        continue;
      }

      if (hints.some((hint) => normalized.includes(normalizeForCompare(hint)))) {
        return category;
      }
    }

    return 'place';
  }

  function parseTime(value) {
    const text = normalizeArabicDigits(value);
    const match = text.match(TIME_PATTERN);

    if (!match) {
      return '';
    }

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const marker = asString(match[3]).toLowerCase();

    if (
      ['م', 'مساء', 'مساءً', 'pm'].includes(marker) &&
      hour < 12
    ) {
      hour += 12;
    }

    if (
      ['ص', 'صباحا', 'صباحًا', 'am'].includes(marker) &&
      hour === 12
    ) {
      hour = 0;
    }

    if (hour > 23 || minute > 59) {
      return '';
    }

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function parseDurationMinutes(value) {
    const text = normalizeArabicDigits(value);
    const match = text.match(DURATION_PATTERN);

    if (!match) {
      return 0;
    }

    const amount = Number(match[1]);
    const unit = normalizeForCompare(match[2]);

    if (
      ['ساعه', 'ساعات', 'hour', 'hours', 'hr'].includes(unit)
    ) {
      return Math.round(amount * 60);
    }

    return Math.round(amount);
  }

  function extractUrl(value) {
    const match = asString(value).match(URL_PATTERN);
    return match ? match[1] : '';
  }

  function removeMetadataFragments(value) {
    return normalizeWhitespace(
      asString(value)
        .replace(URL_PATTERN, '')
        .replace(DURATION_PATTERN, '')
        .replace(TIME_PATTERN, ' ')
        .replace(/\(\s*\)/g, '')
        .replace(/\s*[|—–-]\s*$/u, '')
    );
  }

  function isIgnoredLine(line) {
    const normalized = normalizeForCompare(stripBullet(line));

    if (!normalized) {
      return true;
    }

    return IGNORE_LINES.some(
      (item) => normalized === normalizeForCompare(item)
    );
  }

  function parseInlineNote(value) {
    const text = asString(value);

    const parentheses = text.match(/\(([^)]+)\)/u);

    if (parentheses) {
      return normalizeWhitespace(parentheses[1]);
    }

    const dashParts = text.split(/\s+[—–]\s+/u);

    if (dashParts.length > 1) {
      return normalizeWhitespace(dashParts.slice(1).join(' — '));
    }

    return '';
  }

  function parseItem(line, index = 0) {
    const original = asString(line);
    const clean = stripBullet(original);
    const url = extractUrl(clean);
    const time = parseTime(clean);
    const duration = parseDurationMinutes(clean);
    const notes = parseInlineNote(clean);

    let name = removeMetadataFragments(clean);

    if (notes) {
      name = normalizeWhitespace(
        name.replace(`(${notes})`, '')
      );
    }

    name = name
      .replace(/^ثم\s+/u, '')
      .replace(/^بعدها\s+/u, '')
      .replace(/^التوجه إلى\s+/u, '')
      .replace(/^الذهاب إلى\s+/u, '')
      .replace(/^زيارة\s+/u, '')
      .replace(/^visit\s+/iu, '')
      .trim();

    return {
      id: uid('place'),
      name,
      category: detectCategory(name),
      city: '',
      address: '',
      latitude: null,
      longitude: null,
      openingHours: '',
      visitDurationMinutes: duration,
      plannedTime: time,
      notes,
      website: url,
      mapsUrl: '',
      photos: [],
      status: 'pending',
      order: index,
      arrivedAt: '',
      completedAt: '',
      skippedAt: '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      sourceText: original
    };
  }

  function createDay(number, title, language) {
    return {
      id: uid('day'),
      dayNumber: number,
      title: asString(title) || titleCaseDay(number, language),
      date: '',
      notes: '',
      places: [],
      completed: false,
      completedAt: '',
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
  }

  function splitLines(text) {
    return asString(text)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line, index, array) => {
        if (line) {
          return true;
        }

        return index > 0 &&
          index < array.length - 1 &&
          array[index - 1] &&
          array[index + 1];
      });
  }

  function parse(text, options = {}) {
    const rawText = asString(text);

    if (!rawText) {
      return {
        version: VERSION,
        rawText: '',
        language: 'ar',
        parsedAt: nowISO(),
        days: [],
        warnings: ['EMPTY_ITINERARY'],
        stats: {
          days: 0,
          places: 0
        }
      };
    }

    const language = options.language || detectLanguage(rawText);
    const lines = splitLines(rawText);
    const warnings = [];
    const days = [];

    let currentDay = null;
    let implicitDayNumber = 1;

    for (const line of lines) {
      if (!line) {
        continue;
      }

      if (isDayHeader(line)) {
        const parsedNumber = parseDayNumber(line);
        const dayNumber = parsedNumber || implicitDayNumber;
        const title = stripBullet(line);

        currentDay = createDay(dayNumber, title, language);
        days.push(currentDay);
        implicitDayNumber = Math.max(implicitDayNumber, dayNumber + 1);
        continue;
      }

      if (isIgnoredLine(line)) {
        continue;
      }

      if (!currentDay) {
        currentDay = createDay(implicitDayNumber, '', language);
        days.push(currentDay);
        implicitDayNumber += 1;
        warnings.push('IMPLICIT_FIRST_DAY_CREATED');
      }

      const item = parseItem(line, currentDay.places.length);

      if (!item.name) {
        continue;
      }

      currentDay.places.push(item);
    }

    const normalizedDays = days
      .filter((day) => day.places.length > 0 || options.keepEmptyDays)
      .map((day, index) => ({
        ...day,
        dayNumber: index + 1,
        title:
          options.preserveDayTitles === false
            ? titleCaseDay(index + 1, language)
            : day.title || titleCaseDay(index + 1, language),
        places: day.places.map((place, placeIndex) => ({
          ...place,
          order: placeIndex
        }))
      }));

    if (!normalizedDays.length) {
      warnings.push('NO_DAYS_DETECTED');
    }

    const placeCount = normalizedDays.reduce(
      (sum, day) => sum + day.places.length,
      0
    );

    return {
      version: VERSION,
      rawText,
      language,
      parsedAt: nowISO(),
      days: normalizedDays,
      warnings: [...new Set(warnings)],
      stats: {
        days: normalizedDays.length,
        places: placeCount
      }
    };
  }

  function parseToModel(text, options = {}) {
    const result = parse(text, options);
    const model = global.CountryLifecycleModel;

    if (!model?.createDay) {
      return result;
    }

    return {
      ...result,
      days: result.days.map((day, index) =>
        model.createDay(day, index)
      )
    };
  }

  function attachToCountry(countryId, text, options = {}) {
    const engine = global.CountryLifecycleEngine;

    if (!engine?.setItinerary) {
      throw new Error('CountryLifecycleEngine is not available.');
    }

    const parsed = parseToModel(text, options);

    const record = engine.setItinerary(countryId, {
      rawText: parsed.rawText,
      parserVersion: VERSION,
      days: parsed.days
    }, {
      parserVersion: VERSION
    });

    return {
      record,
      parsed
    };
  }

  function preview(text, options = {}) {
    const parsed = parse(text, options);

    return parsed.days.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.title,
      items: day.places.map((place) => ({
        name: place.name,
        category: place.category,
        time: place.plannedTime,
        durationMinutes: place.visitDurationMinutes
      }))
    }));
  }

  function validate(text) {
    const parsed = parse(text);
    const issues = [];

    if (!asString(text)) {
      issues.push({
        code: 'EMPTY_TEXT',
        severity: 'error',
        message: 'Itinerary text is empty.'
      });
    }

    if (!parsed.days.length) {
      issues.push({
        code: 'NO_DAYS',
        severity: 'error',
        message: 'No itinerary days were detected.'
      });
    }

    parsed.days.forEach((day, dayIndex) => {
      if (!day.places.length) {
        issues.push({
          code: 'EMPTY_DAY',
          severity: 'warning',
          path: `days.${dayIndex}`,
          message: 'This itinerary day has no places.'
        });
      }

      day.places.forEach((place, placeIndex) => {
        if (!place.name) {
          issues.push({
            code: 'PLACE_NAME_REQUIRED',
            severity: 'error',
            path: `days.${dayIndex}.places.${placeIndex}`,
            message: 'Place name is required.'
          });
        }
      });
    });

    return {
      valid: !issues.some((issue) => issue.severity === 'error'),
      parsed,
      issues
    };
  }

  function parseDayOnly(text, dayNumber = 1, options = {}) {
    const parsed = parse(text, {
      ...options,
      keepEmptyDays: true
    });

    const places = parsed.days.flatMap((day) => day.places);

    return {
      ...createDay(dayNumber, titleCaseDay(dayNumber, parsed.language), parsed.language),
      places: places.map((place, index) => ({
        ...place,
        order: index
      }))
    };
  }

  function mergeParsedDays(existingDays, parsedDays, options = {}) {
    const current = clone(asArray(existingDays));
    const incoming = clone(asArray(parsedDays));

    if (options.replace) {
      return incoming.map((day, index) => ({
        ...day,
        dayNumber: index + 1
      }));
    }

    const result = [...current];

    for (const incomingDay of incoming) {
      const targetIndex = result.findIndex(
        (day) => Number(day.dayNumber) === Number(incomingDay.dayNumber)
      );

      if (targetIndex < 0) {
        result.push(incomingDay);
        continue;
      }

      const existingNames = new Set(
        asArray(result[targetIndex].places)
          .map((place) => normalizeForCompare(place.name))
          .filter(Boolean)
      );

      const additions = asArray(incomingDay.places).filter(
        (place) => !existingNames.has(normalizeForCompare(place.name))
      );

      result[targetIndex] = {
        ...result[targetIndex],
        title: incomingDay.title || result[targetIndex].title,
        places: [
          ...asArray(result[targetIndex].places),
          ...additions
        ]
      };
    }

    return result
      .sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber))
      .map((day, index) => ({
        ...day,
        dayNumber: index + 1,
        places: asArray(day.places).map((place, placeIndex) => ({
          ...place,
          order: placeIndex
        }))
      }));
  }

  function enrichWithMapLinks(days) {
    return asArray(days).map((day) => ({
      ...day,
      places: asArray(day.places).map((place) => {
        if (place.mapsUrl || !place.name) {
          return place;
        }

        return {
          ...place,
          mapsUrl:
            `https://www.google.com/maps/search/?api=1&query=` +
            encodeURIComponent(
              [place.name, place.city].filter(Boolean).join(', ')
            )
        };
      })
    }));
  }

  function registerWithEngine() {
    const engine = global.CountryLifecycleEngine;

    if (!engine || engine.parser === api) {
      return false;
    }

    try {
      Object.defineProperty(engine, 'parser', {
        value: api,
        enumerable: true,
        configurable: true
      });

      return true;
    } catch (_) {
      return false;
    }
  }

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,

    parse,
    parseToModel,
    parseDayOnly,
    preview,
    validate,
    attachToCountry,
    mergeParsedDays,
    enrichWithMapLinks,

    detectLanguage,
    parseDayNumber,
    isDayHeader,
    detectCategory,
    parseTime,
    parseDurationMinutes,
    extractUrl,
    normalizeArabicDigits,
    normalizeForCompare,

    registerWithEngine
  });

  global.ItineraryParser = api;

  registerWithEngine();

  global.addEventListener?.(
    'tic:country-lifecycle:ready',
    registerWithEngine,
    { once: true, passive: true }
  );
})(typeof window !== 'undefined' ? window : globalThis);
