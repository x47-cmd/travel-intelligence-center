/* =========================================================
   Travel Intelligence Center
   Country Lifecycle Model V1.0.0
   Country Lifecycle System - Schema, Validation & Factories

   File Path:
   js/extensions/country-lifecycle/country-lifecycle-model.js

   Purpose:
   - Defines the official data model for one permanent country record.
   - Provides safe factories for countries, days, places and trip data.
   - Validates lifecycle data before it reaches the UI or persistence.
   - Normalizes legacy and incomplete values without data loss.
   - Keeps Wishlist, Upcoming, Active and Completed on one record.
   - Provides derived selectors for countdown, progress and readiness.
   - Works independently and integrates with CountryLifecycleEngine.
   - Keeps frozen legacy files untouched.
   ========================================================= */

(function countryLifecycleModelBootstrap(global) {
  'use strict';

  if (!global || global.CountryLifecycleModel?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 1;

  const STATUS = Object.freeze({
    WISHLIST: 'wishlist',
    UPCOMING: 'upcoming',
    ACTIVE: 'active',
    COMPLETED: 'completed'
  });

  const PLACE_STATUS = Object.freeze({
    PENDING: 'pending',
    VISITED: 'visited',
    SKIPPED: 'skipped'
  });

  const FILE_CATEGORY = Object.freeze({
    GENERAL: 'general',
    FLIGHT: 'flight',
    HOTEL: 'hotel',
    VISA: 'visa',
    INSURANCE: 'insurance',
    BOOKING: 'booking',
    RECEIPT: 'receipt',
    PHOTO: 'photo'
  });

  const CHECKLIST_CATEGORY = Object.freeze({
    GENERAL: 'general',
    DOCUMENTS: 'documents',
    PACKING: 'packing',
    MONEY: 'money',
    TRANSPORT: 'transport',
    HOTEL: 'hotel',
    HEALTH: 'health'
  });

  const DEFAULT_CURRENCY = 'AED';

  /* =========================================================
     Utilities
     ========================================================= */

  function nowISO() {
    return new Date().toISOString();
  }

  function todayISO() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asString(value, fallback = '') {
    if (value === undefined || value === null) {
      return fallback;
    }

    return String(value).trim();
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asBoolean(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function clone(value) {
    if (value === undefined) {
      return undefined;
    }

    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch (_) {
      // Continue to JSON fallback.
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

  function normalizeDate(value) {
    const raw = asString(value);

    if (!raw) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const date = new Date(`${raw}T12:00:00`);
      return Number.isNaN(date.getTime()) ? '' : raw;
    }

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function normalizeStatus(value, fallback = STATUS.WISHLIST) {
    const status = asString(value).toLowerCase();
    return Object.values(STATUS).includes(status) ? status : fallback;
  }

  function normalizePlaceStatus(value, fallback = PLACE_STATUS.PENDING) {
    const status = asString(value).toLowerCase();
    return Object.values(PLACE_STATUS).includes(status) ? status : fallback;
  }

  function normalizeCountryCode(value) {
    return asString(value)
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3);
  }

  function normalizeCurrency(value) {
    const currency = asString(value, DEFAULT_CURRENCY).toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY;
  }

  function slugify(value) {
    return asString(value)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function unique(values) {
    return [...new Set(asArray(values).map(asString).filter(Boolean))];
  }

  function dateDiff(fromDate, toDate) {
    const from = normalizeDate(fromDate);
    const to = normalizeDate(toDate);

    if (!from || !to) {
      return null;
    }

    const fromTime = new Date(`${from}T12:00:00`).getTime();
    const toTime = new Date(`${to}T12:00:00`).getTime();

    return Math.round((toTime - fromTime) / 86400000);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, asNumber(value, min)));
  }

  /* =========================================================
     Small factories
     ========================================================= */

  function createPhoto(input = {}) {
    if (typeof input === 'string') {
      input = { url: input };
    }

    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('photo'),
      url: asString(source.url || source.src || source.dataUrl),
      caption: asString(source.caption || source.title),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function createLink(input = {}) {
    if (typeof input === 'string') {
      input = { url: input };
    }

    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('link'),
      title: asString(source.title || source.name),
      url: asString(source.url || source.href || source.link),
      type: asString(source.type, 'general'),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function createFile(input = {}) {
    const source = isObject(input) ? input : {};
    const category = asString(source.category, FILE_CATEGORY.GENERAL);

    return {
      id: asString(source.id) || uid('file'),
      name: asString(source.name || source.filename),
      type: asString(source.type || source.mimeType),
      size: Math.max(0, asNumber(source.size, 0)),
      url: asString(source.url || source.path || source.dataUrl),
      category: Object.values(FILE_CATEGORY).includes(category)
        ? category
        : FILE_CATEGORY.GENERAL,
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function createFlight(input = {}) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('flight'),
      airline: asString(source.airline),
      flightNumber: asString(source.flightNumber || source.number),
      bookingReference: asString(source.bookingReference || source.pnr),
      departureAirport: asString(source.departureAirport || source.from),
      arrivalAirport: asString(source.arrivalAirport || source.to),
      departureAt: asString(source.departureAt || source.departure),
      arrivalAt: asString(source.arrivalAt || source.arrival),
      terminal: asString(source.terminal),
      notes: asString(source.notes),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function createHotel(input = {}) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('hotel'),
      name: asString(source.name),
      city: asString(source.city),
      address: asString(source.address),
      checkIn: normalizeDate(source.checkIn || source.checkInDate),
      checkOut: normalizeDate(source.checkOut || source.checkOutDate),
      bookingNumber: asString(source.bookingNumber || source.confirmationNumber),
      website: asString(source.website || source.url),
      mapsUrl: asString(source.mapsUrl || source.mapUrl),
      notes: asString(source.notes),
      photos: asArray(source.photos).map(createPhoto),
      isPrimary: asBoolean(source.isPrimary, false),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function createRestaurant(input = {}) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('restaurant'),
      name: asString(source.name),
      city: asString(source.city),
      cuisine: asString(source.cuisine),
      address: asString(source.address),
      openingHours: asString(source.openingHours || source.hours),
      website: asString(source.website || source.url),
      mapsUrl: asString(source.mapsUrl || source.mapUrl),
      notes: asString(source.notes),
      halalStatus: asString(source.halalStatus || source.halal),
      photos: asArray(source.photos).map(createPhoto),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function createPlace(input = {}, index = 0) {
    if (typeof input === 'string') {
      input = { name: input };
    }

    const source = isObject(input) ? input : {};

    let status = normalizePlaceStatus(source.status);

    if (!source.status && source.visited) {
      status = PLACE_STATUS.VISITED;
    } else if (!source.status && source.skipped) {
      status = PLACE_STATUS.SKIPPED;
    }

    return {
      id: asString(source.id) || uid('place'),
      name: asString(source.name || source.title),
      category: asString(source.category || source.type, 'place'),
      city: asString(source.city),
      address: asString(source.address),
      latitude:
        source.latitude === null || source.latitude === undefined
          ? null
          : asNumber(source.latitude, null),
      longitude:
        source.longitude === null || source.longitude === undefined
          ? null
          : asNumber(source.longitude, null),
      openingHours: asString(source.openingHours || source.hours),
      visitDurationMinutes: Math.max(
        0,
        asNumber(
          source.visitDurationMinutes ||
          source.durationMinutes ||
          source.duration,
          0
        )
      ),
      plannedTime: asString(source.plannedTime || source.time),
      notes: asString(source.notes),
      website: asString(source.website || source.url),
      mapsUrl: asString(source.mapsUrl || source.mapUrl),
      photos: asArray(source.photos).map(createPhoto),
      status,
      order: Math.max(0, asNumber(source.order, index)),
      arrivedAt: asString(source.arrivedAt),
      completedAt: asString(source.completedAt),
      skippedAt: asString(source.skippedAt),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function createDay(input = {}, index = 0) {
    const source = isObject(input) ? input : {};
    const places = asArray(
      source.places ||
      source.items ||
      source.activities
    ).map((place, placeIndex) => createPlace(place, placeIndex));

    const completed =
      places.length > 0 &&
      places.every((place) => place.status !== PLACE_STATUS.PENDING);

    return {
      id: asString(source.id) || uid('day'),
      dayNumber: Math.max(1, asNumber(source.dayNumber || source.number, index + 1)),
      title: asString(source.title) || `اليوم ${index + 1}`,
      date: normalizeDate(source.date),
      notes: asString(source.notes),
      places,
      completed: asBoolean(source.completed, completed),
      completedAt:
        asString(source.completedAt) ||
        (completed ? nowISO() : ''),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function createChecklistItem(input = {}, index = 0) {
    if (typeof input === 'string') {
      input = { title: input };
    }

    const source = isObject(input) ? input : {};
    const category = asString(
      source.category,
      CHECKLIST_CATEGORY.GENERAL
    );

    return {
      id: asString(source.id) || uid('check'),
      title: asString(source.title || source.name),
      category: Object.values(CHECKLIST_CATEGORY).includes(category)
        ? category
        : CHECKLIST_CATEGORY.GENERAL,
      completed: asBoolean(source.completed, false),
      completedAt: asString(source.completedAt),
      dueDate: normalizeDate(source.dueDate),
      order: Math.max(0, asNumber(source.order, index)),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function createTransaction(input = {}) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('expense'),
      type: asString(source.type, 'expense'),
      category: asString(source.category, 'general'),
      title: asString(source.title || source.name),
      amount: Math.max(0, asNumber(source.amount, 0)),
      currency: normalizeCurrency(source.currency),
      date: normalizeDate(source.date) || todayISO(),
      notes: asString(source.notes),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function createMemory(input = {}) {
    if (typeof input === 'string') {
      input = { text: input };
    }

    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('memory'),
      title: asString(source.title),
      text: asString(source.text || source.notes),
      date: normalizeDate(source.date),
      photos: asArray(source.photos).map(createPhoto),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function createHistoryItem(input = {}) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || uid('history'),
      action: asString(source.action, 'updated'),
      fromStatus: source.fromStatus
        ? normalizeStatus(source.fromStatus)
        : '',
      toStatus: source.toStatus
        ? normalizeStatus(source.toStatus)
        : '',
      timestamp: asString(source.timestamp) || nowISO(),
      metadata: isObject(source.metadata) ? clone(source.metadata) : {}
    };
  }

  /* =========================================================
     Main country factory
     ========================================================= */

  function createCountry(input = {}) {
    const source = isObject(input) ? input : {};
    const name = asString(source.name || source.countryName);
    const countryCode = normalizeCountryCode(
      source.countryCode || source.isoCode || source.code
    );

    const startDate = normalizeDate(
      source.dates?.startDate ||
      source.startDate ||
      source.trip?.startDate
    );

    const endDate = normalizeDate(
      source.dates?.endDate ||
      source.endDate ||
      source.trip?.endDate
    );

    const country = {
      id:
        asString(source.id) ||
        `country_${countryCode || slugify(name) || uid('record')}`,

      countryCode,
      name,
      localizedName: asString(source.localizedName || source.nameAr),
      city: asString(source.city),
      status: normalizeStatus(source.status),

      cover: {
        image: asString(source.cover?.image || source.coverImage || source.image),
        position: asString(source.cover?.position, 'center'),
        alt: asString(source.cover?.alt || name)
      },

      summary: asString(source.summary || source.description),
      bestTimeToVisit: asString(source.bestTimeToVisit),
      estimatedBudget: Math.max(
        0,
        asNumber(
          source.estimatedBudget ??
          source.budgetEstimate ??
          source.budget?.estimated,
          0
        )
      ),
      currency: normalizeCurrency(
        source.currency || source.budget?.currency
      ),

      notes: asString(source.notes),
      tags: unique(source.tags),

      dates: {
        startDate,
        endDate
      },

      travelers: Math.max(
        1,
        asNumber(source.travelers || source.trip?.travelers, 1)
      ),

      transport: {
        airline: asString(
          source.transport?.airline ||
          source.airline ||
          source.trip?.airline
        ),
        flightNumber: asString(
          source.transport?.flightNumber ||
          source.flightNumber ||
          source.trip?.flightNumber
        ),
        bookingReference: asString(
          source.transport?.bookingReference ||
          source.bookingReference ||
          source.trip?.bookingReference
        ),
        flights: asArray(
          source.transport?.flights ||
          source.flights ||
          source.trip?.flights
        ).map(createFlight)
      },

      itinerary: {
        rawText: asString(
          source.itinerary?.rawText ||
          source.rawItinerary ||
          source.itineraryText
        ),
        parserVersion: asString(source.itinerary?.parserVersion),
        parsedAt: asString(source.itinerary?.parsedAt),
        days: asArray(
          source.itinerary?.days ||
          source.days ||
          source.trip?.days
        ).map(createDay)
      },

      wishlist: {
        desiredPlaces: asArray(
          source.wishlist?.desiredPlaces ||
          source.desiredPlaces ||
          source.places
        ).map(createPlace),
        hotels: asArray(
          source.wishlist?.hotels ||
          source.savedHotels ||
          source.hotels
        ).map(createHotel),
        restaurants: asArray(
          source.wishlist?.restaurants ||
          source.savedRestaurants ||
          source.restaurants
        ).map(createRestaurant)
      },

      trip: {
        hotels: asArray(
          source.trip?.hotels ||
          source.confirmedHotels
        ).map(createHotel),
        checklist: asArray(
          source.trip?.checklist ||
          source.checklist
        ).map(createChecklistItem),
        documents: asArray(
          source.trip?.documents ||
          source.documents
        ).map(createFile),
        weatherSnapshot: isObject(
          source.trip?.weatherSnapshot ||
          source.weatherSnapshot
        )
          ? clone(source.trip?.weatherSnapshot || source.weatherSnapshot)
          : {},
        currencySnapshot: isObject(
          source.trip?.currencySnapshot ||
          source.currencySnapshot
        )
          ? clone(source.trip?.currencySnapshot || source.currencySnapshot)
          : {},
        readiness: clamp(
          source.trip?.readiness || source.readiness,
          0,
          100
        )
      },

      budget: {
        planned: Math.max(
          0,
          asNumber(
            source.budget?.planned ??
            source.budget ??
            source.estimatedBudget,
            0
          )
        ),
        currency: normalizeCurrency(
          source.budget?.currency || source.currency
        ),
        transactions: asArray(
          source.budget?.transactions ||
          source.expenses
        ).map(createTransaction)
      },

      media: {
        photos: asArray(
          source.media?.photos ||
          source.photos
        ).map(createPhoto),
        files: asArray(
          source.media?.files ||
          source.files
        ).map(createFile),
        links: asArray(
          source.media?.links ||
          source.links
        ).map(createLink)
      },

      passport: {
        rating: clamp(
          source.passport?.rating || source.rating,
          0,
          5
        ),
        memories: asArray(
          source.passport?.memories ||
          source.memories
        ).map(createMemory),
        completedAt: asString(
          source.passport?.completedAt ||
          source.completedAt
        )
      },

      flags: {
        completionReady: asBoolean(
          source.flags?.completionReady ||
          source.completionReady,
          false
        ),
        archived: asBoolean(source.flags?.archived, false)
      },

      history: asArray(source.history).map(createHistoryItem),

      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO(),
      schemaVersion: SCHEMA_VERSION
    };

    return refreshCountry(country);
  }

  /* =========================================================
     Derived calculations
     ========================================================= */

  function calculateChecklistReadiness(checklist) {
    const items = asArray(checklist);

    if (!items.length) {
      return 0;
    }

    const completed = items.filter((item) => item.completed).length;
    return Math.round((completed / items.length) * 100);
  }

  function calculateDayProgress(day) {
    const places = asArray(day?.places).filter((place) => place.name);
    const visited = places.filter(
      (place) => place.status === PLACE_STATUS.VISITED
    ).length;
    const skipped = places.filter(
      (place) => place.status === PLACE_STATUS.SKIPPED
    ).length;
    const handled = visited + skipped;

    return {
      total: places.length,
      visited,
      skipped,
      pending: Math.max(0, places.length - handled),
      handled,
      percentage: places.length
        ? Math.round((handled / places.length) * 100)
        : 0
    };
  }

  function calculateTripProgress(country) {
    const days = asArray(country?.itinerary?.days);
    let total = 0;
    let visited = 0;
    let skipped = 0;

    for (const day of days) {
      const progress = calculateDayProgress(day);
      total += progress.total;
      visited += progress.visited;
      skipped += progress.skipped;
    }

    const handled = visited + skipped;

    return {
      total,
      visited,
      skipped,
      pending: Math.max(0, total - handled),
      handled,
      percentage: total
        ? Math.round((handled / total) * 100)
        : 0
    };
  }

  function calculateSpent(country) {
    return asArray(country?.budget?.transactions)
      .filter((transaction) => transaction.type !== 'income')
      .reduce(
        (sum, transaction) =>
          sum + Math.max(0, asNumber(transaction.amount, 0)),
        0
      );
  }

  function calculateRemainingBudget(country) {
    const planned = Math.max(0, asNumber(country?.budget?.planned, 0));
    return planned - calculateSpent(country);
  }

  function getCountdown(country, referenceDate = todayISO()) {
    const startDate = normalizeDate(country?.dates?.startDate);

    if (!startDate) {
      return null;
    }

    return dateDiff(referenceDate, startDate);
  }

  function getDuration(country) {
    const startDate = normalizeDate(country?.dates?.startDate);
    const endDate = normalizeDate(country?.dates?.endDate);

    if (!startDate || !endDate) {
      return null;
    }

    const difference = dateDiff(startDate, endDate);
    return difference === null ? null : Math.max(1, difference + 1);
  }

  function getCurrentDay(country, referenceDate = todayISO()) {
    const days = asArray(country?.itinerary?.days);

    if (!days.length) {
      return null;
    }

    const startDate = normalizeDate(country?.dates?.startDate);

    if (!startDate) {
      return clone(days[0]);
    }

    const difference = dateDiff(startDate, referenceDate);
    const index = clamp(difference ?? 0, 0, days.length - 1);

    return clone(days[index]);
  }

  function getNextPendingPlace(country, referenceDate = todayISO()) {
    const day = getCurrentDay(country, referenceDate);

    if (!day) {
      return null;
    }

    const place = asArray(day.places).find(
      (item) => item.status === PLACE_STATUS.PENDING
    );

    return place ? clone(place) : null;
  }

  function deriveLifecycleStatus(country, referenceDate = todayISO()) {
    const currentStatus = normalizeStatus(country?.status);
    const startDate = normalizeDate(country?.dates?.startDate);
    const endDate = normalizeDate(country?.dates?.endDate);

    if (currentStatus === STATUS.COMPLETED) {
      return STATUS.COMPLETED;
    }

    if (
      startDate &&
      endDate &&
      referenceDate >= startDate &&
      referenceDate <= endDate
    ) {
      return STATUS.ACTIVE;
    }

    if (
      currentStatus === STATUS.ACTIVE &&
      endDate &&
      referenceDate > endDate
    ) {
      return STATUS.ACTIVE;
    }

    return currentStatus;
  }

  function refreshCountry(input) {
    const country = clone(input);

    country.itinerary.days = asArray(country.itinerary?.days).map(
      (day, dayIndex) => {
        const normalizedDay = createDay(day, dayIndex);

        normalizedDay.dayNumber = dayIndex + 1;
        normalizedDay.title =
          asString(normalizedDay.title) || `اليوم ${dayIndex + 1}`;

        normalizedDay.places = asArray(normalizedDay.places).map(
          (place, placeIndex) => ({
            ...createPlace(place, placeIndex),
            order: placeIndex
          })
        );

        const progress = calculateDayProgress(normalizedDay);
        normalizedDay.completed =
          progress.total > 0 && progress.pending === 0;

        if (normalizedDay.completed && !normalizedDay.completedAt) {
          normalizedDay.completedAt = nowISO();
        }

        if (!normalizedDay.completed) {
          normalizedDay.completedAt = '';
        }

        return normalizedDay;
      }
    );

    country.trip.checklist = asArray(country.trip?.checklist).map(
      createChecklistItem
    );

    country.trip.readiness = calculateChecklistReadiness(
      country.trip.checklist
    );

    country.updatedAt = nowISO();
    country.schemaVersion = SCHEMA_VERSION;

    return country;
  }

  /* =========================================================
     Validation
     ========================================================= */

  function createIssue(path, code, message, severity = 'error') {
    return {
      path,
      code,
      message,
      severity
    };
  }

  function validateCountry(input, options = {}) {
    const country = createCountry(input);
    const issues = [];

    if (!country.name && !country.countryCode) {
      issues.push(
        createIssue(
          'country',
          'COUNTRY_IDENTITY_REQUIRED',
          'Country name or country code is required.'
        )
      );
    }

    if (
      country.countryCode &&
      !/^[A-Z]{2,3}$/.test(country.countryCode)
    ) {
      issues.push(
        createIssue(
          'countryCode',
          'INVALID_COUNTRY_CODE',
          'Country code must contain two or three letters.'
        )
      );
    }

    if (
      [STATUS.UPCOMING, STATUS.ACTIVE, STATUS.COMPLETED]
        .includes(country.status)
    ) {
      if (!country.dates.startDate) {
        issues.push(
          createIssue(
            'dates.startDate',
            'START_DATE_REQUIRED',
            'Start date is required for this lifecycle status.'
          )
        );
      }

      if (!country.dates.endDate) {
        issues.push(
          createIssue(
            'dates.endDate',
            'END_DATE_REQUIRED',
            'End date is required for this lifecycle status.'
          )
        );
      }
    }

    if (
      country.dates.startDate &&
      country.dates.endDate &&
      country.dates.endDate < country.dates.startDate
    ) {
      issues.push(
        createIssue(
          'dates.endDate',
          'END_DATE_BEFORE_START_DATE',
          'End date cannot be earlier than start date.'
        )
      );
    }

    const seenDayIds = new Set();
    const seenPlaceIds = new Set();

    country.itinerary.days.forEach((day, dayIndex) => {
      if (seenDayIds.has(day.id)) {
        issues.push(
          createIssue(
            `itinerary.days.${dayIndex}.id`,
            'DUPLICATE_DAY_ID',
            'Itinerary day IDs must be unique.'
          )
        );
      }

      seenDayIds.add(day.id);

      if (!day.title) {
        issues.push(
          createIssue(
            `itinerary.days.${dayIndex}.title`,
            'DAY_TITLE_REQUIRED',
            'Every itinerary day requires a title.',
            'warning'
          )
        );
      }

      day.places.forEach((place, placeIndex) => {
        if (seenPlaceIds.has(place.id)) {
          issues.push(
            createIssue(
              `itinerary.days.${dayIndex}.places.${placeIndex}.id`,
              'DUPLICATE_PLACE_ID',
              'Place IDs must be unique across the itinerary.'
            )
          );
        }

        seenPlaceIds.add(place.id);

        if (!place.name) {
          issues.push(
            createIssue(
              `itinerary.days.${dayIndex}.places.${placeIndex}.name`,
              'PLACE_NAME_REQUIRED',
              'Every itinerary place requires a name.'
            )
          );
        }
      });
    });

    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');

    const result = {
      valid: errors.length === 0,
      country,
      issues,
      errors,
      warnings
    };

    if (options.throwOnError && !result.valid) {
      const error = new Error(errors.map((issue) => issue.message).join(' '));
      error.validation = result;
      throw error;
    }

    return result;
  }

  function validateTransition(countryInput, nextStatus) {
    const country = createCountry(countryInput);
    const target = normalizeStatus(nextStatus, country.status);
    const issues = [];

    const transitions = {
      [STATUS.WISHLIST]: [STATUS.UPCOMING],
      [STATUS.UPCOMING]: [STATUS.WISHLIST, STATUS.ACTIVE],
      [STATUS.ACTIVE]: [STATUS.UPCOMING, STATUS.COMPLETED],
      [STATUS.COMPLETED]: []
    };

    if (!transitions[country.status].includes(target)) {
      issues.push(
        createIssue(
          'status',
          'INVALID_TRANSITION',
          `Invalid lifecycle transition: ${country.status} -> ${target}`
        )
      );
    }

    if (
      target === STATUS.UPCOMING &&
      (!country.dates.startDate || !country.dates.endDate)
    ) {
      issues.push(
        createIssue(
          'dates',
          'TRIP_DATES_REQUIRED',
          'Start date and end date are required before converting to upcoming.'
        )
      );
    }

    return {
      valid: issues.length === 0,
      fromStatus: country.status,
      toStatus: target,
      issues
    };
  }

  /* =========================================================
     Merge and patch helpers
     ========================================================= */

  function mergeCountry(baseInput, patchInput) {
    const base = createCountry(baseInput);
    const patch = isObject(patchInput) ? clone(patchInput) : {};

    const merged = {
      ...base,
      ...patch,

      id: base.id,
      createdAt: base.createdAt,

      cover: {
        ...base.cover,
        ...(isObject(patch.cover) ? patch.cover : {})
      },

      dates: {
        ...base.dates,
        ...(isObject(patch.dates) ? patch.dates : {})
      },

      transport: {
        ...base.transport,
        ...(isObject(patch.transport) ? patch.transport : {}),
        flights: patch.transport?.flights
          ? asArray(patch.transport.flights).map(createFlight)
          : base.transport.flights
      },

      itinerary: {
        ...base.itinerary,
        ...(isObject(patch.itinerary) ? patch.itinerary : {}),
        days: patch.itinerary?.days
          ? asArray(patch.itinerary.days).map(createDay)
          : base.itinerary.days
      },

      wishlist: {
        ...base.wishlist,
        ...(isObject(patch.wishlist) ? patch.wishlist : {}),
        desiredPlaces: patch.wishlist?.desiredPlaces
          ? asArray(patch.wishlist.desiredPlaces).map(createPlace)
          : base.wishlist.desiredPlaces,
        hotels: patch.wishlist?.hotels
          ? asArray(patch.wishlist.hotels).map(createHotel)
          : base.wishlist.hotels,
        restaurants: patch.wishlist?.restaurants
          ? asArray(patch.wishlist.restaurants).map(createRestaurant)
          : base.wishlist.restaurants
      },

      trip: {
        ...base.trip,
        ...(isObject(patch.trip) ? patch.trip : {}),
        hotels: patch.trip?.hotels
          ? asArray(patch.trip.hotels).map(createHotel)
          : base.trip.hotels,
        checklist: patch.trip?.checklist
          ? asArray(patch.trip.checklist).map(createChecklistItem)
          : base.trip.checklist,
        documents: patch.trip?.documents
          ? asArray(patch.trip.documents).map(createFile)
          : base.trip.documents
      },

      budget: {
        ...base.budget,
        ...(isObject(patch.budget) ? patch.budget : {}),
        transactions: patch.budget?.transactions
          ? asArray(patch.budget.transactions).map(createTransaction)
          : base.budget.transactions
      },

      media: {
        ...base.media,
        ...(isObject(patch.media) ? patch.media : {}),
        photos: patch.media?.photos
          ? asArray(patch.media.photos).map(createPhoto)
          : base.media.photos,
        files: patch.media?.files
          ? asArray(patch.media.files).map(createFile)
          : base.media.files,
        links: patch.media?.links
          ? asArray(patch.media.links).map(createLink)
          : base.media.links
      },

      passport: {
        ...base.passport,
        ...(isObject(patch.passport) ? patch.passport : {}),
        memories: patch.passport?.memories
          ? asArray(patch.passport.memories).map(createMemory)
          : base.passport.memories
      },

      flags: {
        ...base.flags,
        ...(isObject(patch.flags) ? patch.flags : {})
      },

      history: patch.history
        ? asArray(patch.history).map(createHistoryItem)
        : base.history,

      countryCode:
        normalizeCountryCode(patch.countryCode) ||
        base.countryCode,

      status: normalizeStatus(patch.status, base.status),
      updatedAt: nowISO(),
      schemaVersion: SCHEMA_VERSION
    };

    return refreshCountry(createCountry(merged));
  }

  /* =========================================================
     Serialization
     ========================================================= */

  function serialize(country) {
    return JSON.stringify(createCountry(country));
  }

  function deserialize(value) {
    if (isObject(value)) {
      return createCountry(value);
    }

    try {
      return createCountry(JSON.parse(asString(value, '{}')));
    } catch (_) {
      return createCountry({});
    }
  }

  function exportSchema() {
    return clone({
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      status: Object.values(STATUS),
      placeStatus: Object.values(PLACE_STATUS),
      fileCategories: Object.values(FILE_CATEGORY),
      checklistCategories: Object.values(CHECKLIST_CATEGORY)
    });
  }

  /* =========================================================
     Integration
     ========================================================= */

  function registerWithEngine() {
    const engine = global.CountryLifecycleEngine;

    if (!engine || engine.model === api) {
      return false;
    }

    try {
      Object.defineProperty(engine, 'model', {
        value: api,
        enumerable: true,
        configurable: true
      });

      return true;
    } catch (_) {
      return false;
    }
  }

  /* =========================================================
     Public API
     ========================================================= */

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,

    STATUS,
    PLACE_STATUS,
    FILE_CATEGORY,
    CHECKLIST_CATEGORY,

    createCountry,
    createDay,
    createPlace,
    createHotel,
    createRestaurant,
    createFlight,
    createChecklistItem,
    createTransaction,
    createFile,
    createPhoto,
    createLink,
    createMemory,
    createHistoryItem,

    refreshCountry,
    mergeCountry,

    validateCountry,
    validateTransition,

    calculateChecklistReadiness,
    calculateDayProgress,
    calculateTripProgress,
    calculateSpent,
    calculateRemainingBudget,
    getCountdown,
    getDuration,
    getCurrentDay,
    getNextPendingPlace,
    deriveLifecycleStatus,

    normalizeDate,
    normalizeStatus,
    normalizePlaceStatus,
    normalizeCountryCode,
    normalizeCurrency,

    serialize,
    deserialize,
    exportSchema,

    registerWithEngine
  });

  global.CountryLifecycleModel = api;

  registerWithEngine();

  global.addEventListener?.(
    'tic:country-lifecycle:ready',
    registerWithEngine,
    { once: true, passive: true }
  );
})(typeof window !== 'undefined' ? window : globalThis);
