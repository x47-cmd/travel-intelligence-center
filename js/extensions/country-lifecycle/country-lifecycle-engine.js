/* =========================================================
   Travel Intelligence Center
   Country Lifecycle Engine V1.0.0
   Country Lifecycle System - Core State & Data Engine

   File Path:
   js/extensions/country-lifecycle/country-lifecycle-engine.js

   Purpose:
   - Provides one permanent country record across its full lifecycle.
   - Supports Wishlist -> Upcoming -> Active -> Completed.
   - Changes status without duplicating or moving country data.
   - Preserves itinerary, places, hotels, restaurants, notes, files,
     links, budget, documents, expenses, photos and memories.
   - Integrates safely with the existing Store without hard dependency.
   - Keeps frozen legacy files untouched.
   - Supports automatic activation and completion readiness by date.
   - Emits scoped lifecycle events for future UI modules.
   - Prevents duplicate records, duplicate listeners and refresh loops.
   - Designed for RTL, iPhone and progressive modular integration.

   Lifecycle:
   wishlist -> upcoming -> active -> completed

   Public API:
   window.CountryLifecycleEngine
   ========================================================= */

(function countryLifecycleEngineBootstrap(global) {
  'use strict';

  if (!global || global.CountryLifecycleEngine?.__initialized) {
    return;
  }

  /* =========================================================
     Constants
     ========================================================= */

  const VERSION = '1.0.0';

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

  const EVENT = Object.freeze({
    READY: 'tic:country-lifecycle:ready',
    CHANGE: 'tic:country-lifecycle:change',
    CREATED: 'tic:country-lifecycle:created',
    UPDATED: 'tic:country-lifecycle:updated',
    REMOVED: 'tic:country-lifecycle:removed',
    TRANSITION: 'tic:country-lifecycle:transition',
    DAY_PROGRESS: 'tic:country-lifecycle:day-progress',
    PLACE_STATUS: 'tic:country-lifecycle:place-status',
    SYNC: 'tic:country-lifecycle:sync',
    ERROR: 'tic:country-lifecycle:error'
  });

  const STORAGE_KEY = 'tic.countryLifecycle.v1';

  const ROOT_KEYS = Object.freeze([
    'countryLifecycle',
    'countryLifecycleRecords',
    'countries'
  ]);

  const ALLOWED_TRANSITIONS = Object.freeze({
    [STATUS.WISHLIST]: Object.freeze([STATUS.UPCOMING]),
    [STATUS.UPCOMING]: Object.freeze([
      STATUS.WISHLIST,
      STATUS.ACTIVE
    ]),
    [STATUS.ACTIVE]: Object.freeze([
      STATUS.UPCOMING,
      STATUS.COMPLETED
    ]),
    [STATUS.COMPLETED]: Object.freeze([])
  });

  const DEFAULT_SETTINGS = Object.freeze({
    autoActivate: true,
    autoCompletionReady: true,
    useLocalFallback: true,
    persistDebounceMs: 120,
    dateCheckIntervalMs: 15 * 60 * 1000
  });

  /* =========================================================
     Runtime state
     ========================================================= */

  const runtime = {
    initialized: false,
    destroyed: false,
    syncing: false,
    persisting: false,
    records: [],
    listeners: [],
    timers: new Set(),
    persistTimer: 0,
    storeUnsubscribe: null,
    settings: { ...DEFAULT_SETTINGS },
    lastSerialized: '',
    source: 'memory'
  };

  /* =========================================================
     Generic helpers
     ========================================================= */

  function nowISO() {
    return new Date().toISOString();
  }

  function todayISO() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function generateId(prefix = 'country') {
    const random =
      global.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    return `${prefix}_${String(random).replace(/[^a-zA-Z0-9_-]/g, '')}`;
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

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asBoolean(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function uniqueStrings(values) {
    return [...new Set(
      asArray(values)
        .map((value) => asString(value))
        .filter(Boolean)
    )];
  }

  function safeClone(value) {
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

  function safeJSONParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function safeJSONStringify(value, fallback = '') {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return fallback;
    }
  }

  function normalizeISODate(value) {
    const raw = asString(value);

    if (!raw) {
      return '';
    }

    const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (directMatch) {
      const parsed = new Date(`${raw}T12:00:00`);
      return Number.isNaN(parsed.getTime()) ? '' : raw;
    }

    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function compareDates(left, right) {
    const a = normalizeISODate(left);
    const b = normalizeISODate(right);

    if (!a || !b) {
      return 0;
    }

    return a.localeCompare(b);
  }

  function dateDiffInDays(fromDate, toDate) {
    const from = normalizeISODate(fromDate);
    const to = normalizeISODate(toDate);

    if (!from || !to) {
      return null;
    }

    const fromTime = new Date(`${from}T12:00:00`).getTime();
    const toTime = new Date(`${to}T12:00:00`).getTime();

    return Math.round((toTime - fromTime) / 86400000);
  }

  function normalizeStatus(value, fallback = STATUS.WISHLIST) {
    const status = asString(value).toLowerCase();
    return Object.values(STATUS).includes(status) ? status : fallback;
  }

  function normalizeCountryCode(value) {
    return asString(value).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
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

  function dispatch(name, detail = {}) {
    try {
      global.dispatchEvent(
        new CustomEvent(name, {
          detail: safeClone({
            version: VERSION,
            timestamp: nowISO(),
            ...detail
          })
        })
      );
    } catch (_) {
      // Events are supplementary and must never break the engine.
    }
  }

  function reportError(error, context = {}) {
    const normalizedError =
      error instanceof Error ? error : new Error(asString(error, 'Unknown error'));

    console.error('[CountryLifecycleEngine]', normalizedError, context);

    dispatch(EVENT.ERROR, {
      message: normalizedError.message,
      context
    });

    return normalizedError;
  }

  /* =========================================================
     Data normalization
     ========================================================= */

  function normalizeLink(input) {
    if (typeof input === 'string') {
      return {
        id: generateId('link'),
        title: '',
        url: asString(input),
        type: 'general',
        createdAt: nowISO()
      };
    }

    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('link'),
      title: asString(source.title || source.name),
      url: asString(source.url || source.href || source.link),
      type: asString(source.type, 'general'),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function normalizeFile(input) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('file'),
      name: asString(source.name || source.filename),
      type: asString(source.type || source.mimeType),
      size: Math.max(0, asNumber(source.size, 0)),
      url: asString(source.url || source.dataUrl || source.path),
      category: asString(source.category, 'general'),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function normalizePhoto(input) {
    if (typeof input === 'string') {
      return {
        id: generateId('photo'),
        url: asString(input),
        caption: '',
        createdAt: nowISO()
      };
    }

    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('photo'),
      url: asString(source.url || source.src || source.dataUrl),
      caption: asString(source.caption || source.title),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function normalizeHotel(input) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('hotel'),
      name: asString(source.name),
      city: asString(source.city),
      address: asString(source.address),
      checkIn: normalizeISODate(source.checkIn || source.checkInDate),
      checkOut: normalizeISODate(source.checkOut || source.checkOutDate),
      bookingNumber: asString(source.bookingNumber || source.confirmationNumber),
      website: asString(source.website || source.url),
      mapsUrl: asString(source.mapsUrl || source.mapUrl),
      notes: asString(source.notes),
      photos: asArray(source.photos).map(normalizePhoto),
      isPrimary: asBoolean(source.isPrimary, false),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function normalizeRestaurant(input) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('restaurant'),
      name: asString(source.name),
      city: asString(source.city),
      cuisine: asString(source.cuisine),
      address: asString(source.address),
      openingHours: asString(source.openingHours || source.hours),
      website: asString(source.website || source.url),
      mapsUrl: asString(source.mapsUrl || source.mapUrl),
      notes: asString(source.notes),
      halalStatus: asString(source.halalStatus || source.halal),
      photos: asArray(source.photos).map(normalizePhoto),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function normalizePlace(input, index = 0) {
    if (typeof input === 'string') {
      input = { name: input };
    }

    const source = isObject(input) ? input : {};
    const status = Object.values(PLACE_STATUS).includes(source.status)
      ? source.status
      : source.visited
        ? PLACE_STATUS.VISITED
        : source.skipped
          ? PLACE_STATUS.SKIPPED
          : PLACE_STATUS.PENDING;

    return {
      id: asString(source.id) || generateId('place'),
      name: asString(source.name || source.title),
      category: asString(source.category || source.type, 'place'),
      city: asString(source.city),
      address: asString(source.address),
      latitude: source.latitude === null || source.latitude === undefined
        ? null
        : asNumber(source.latitude, null),
      longitude: source.longitude === null || source.longitude === undefined
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
      photos: asArray(source.photos).map(normalizePhoto),
      status,
      order: Math.max(0, asNumber(source.order, index)),
      arrivedAt: asString(source.arrivedAt),
      completedAt: asString(source.completedAt),
      skippedAt: asString(source.skippedAt),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function normalizeDay(input, index = 0) {
    const source = isObject(input) ? input : {};
    const places = asArray(
      source.places ||
      source.items ||
      source.activities
    ).map((place, placeIndex) => normalizePlace(place, placeIndex));

    return {
      id: asString(source.id) || generateId('day'),
      dayNumber: Math.max(1, asNumber(source.dayNumber || source.number, index + 1)),
      title: asString(source.title) || `اليوم ${index + 1}`,
      date: normalizeISODate(source.date),
      notes: asString(source.notes),
      places,
      completed: asBoolean(
        source.completed,
        places.length > 0 &&
          places.every((place) => place.status !== PLACE_STATUS.PENDING)
      ),
      completedAt: asString(source.completedAt),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function normalizeFlight(input) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('flight'),
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

  function normalizeChecklistItem(input, index = 0) {
    if (typeof input === 'string') {
      input = { title: input };
    }

    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('check'),
      title: asString(source.title || source.name),
      category: asString(source.category, 'general'),
      completed: asBoolean(source.completed, false),
      completedAt: asString(source.completedAt),
      dueDate: normalizeISODate(source.dueDate),
      order: Math.max(0, asNumber(source.order, index)),
      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO()
    };
  }

  function normalizeTransaction(input) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('expense'),
      type: asString(source.type, 'expense'),
      category: asString(source.category, 'general'),
      title: asString(source.title || source.name),
      amount: Math.max(0, asNumber(source.amount, 0)),
      currency: asString(source.currency, 'AED').toUpperCase(),
      date: normalizeISODate(source.date) || todayISO(),
      notes: asString(source.notes),
      createdAt: asString(source.createdAt) || nowISO()
    };
  }

  function normalizeHistoryItem(input) {
    const source = isObject(input) ? input : {};

    return {
      id: asString(source.id) || generateId('history'),
      action: asString(source.action, 'updated'),
      fromStatus: source.fromStatus
        ? normalizeStatus(source.fromStatus)
        : '',
      toStatus: source.toStatus
        ? normalizeStatus(source.toStatus)
        : '',
      timestamp: asString(source.timestamp) || nowISO(),
      metadata: isObject(source.metadata) ? safeClone(source.metadata) : {}
    };
  }

  function createDefaultRecord(input = {}) {
    const source = isObject(input) ? input : {};
    const name = asString(source.name || source.countryName);
    const countryCode = normalizeCountryCode(
      source.countryCode || source.isoCode || source.code
    );
    const status = normalizeStatus(source.status);

    const record = {
      id:
        asString(source.id) ||
        `country_${countryCode || slugify(name) || generateId('record')}`,

      countryCode,
      name,
      localizedName: asString(source.localizedName || source.nameAr),
      city: asString(source.city),
      status,

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
      currency: asString(source.currency || source.budget?.currency, 'AED')
        .toUpperCase(),

      notes: asString(source.notes),
      tags: uniqueStrings(source.tags),

      dates: {
        startDate: normalizeISODate(
          source.dates?.startDate ||
          source.startDate ||
          source.trip?.startDate
        ),
        endDate: normalizeISODate(
          source.dates?.endDate ||
          source.endDate ||
          source.trip?.endDate
        )
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
        ).map(normalizeFlight)
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
        ).map(normalizeDay)
      },

      wishlist: {
        desiredPlaces: asArray(
          source.wishlist?.desiredPlaces ||
          source.desiredPlaces ||
          source.places
        ).map(normalizePlace),
        hotels: asArray(
          source.wishlist?.hotels ||
          source.savedHotels ||
          source.hotels
        ).map(normalizeHotel),
        restaurants: asArray(
          source.wishlist?.restaurants ||
          source.savedRestaurants ||
          source.restaurants
        ).map(normalizeRestaurant)
      },

      trip: {
        hotels: asArray(
          source.trip?.hotels ||
          source.confirmedHotels
        ).map(normalizeHotel),
        checklist: asArray(
          source.trip?.checklist ||
          source.checklist
        ).map(normalizeChecklistItem),
        documents: asArray(
          source.trip?.documents ||
          source.documents
        ).map(normalizeFile),
        weatherSnapshot: isObject(
          source.trip?.weatherSnapshot ||
          source.weatherSnapshot
        )
          ? safeClone(source.trip?.weatherSnapshot || source.weatherSnapshot)
          : {},
        currencySnapshot: isObject(
          source.trip?.currencySnapshot ||
          source.currencySnapshot
        )
          ? safeClone(source.trip?.currencySnapshot || source.currencySnapshot)
          : {},
        readiness: Math.min(
          100,
          Math.max(
            0,
            asNumber(source.trip?.readiness || source.readiness, 0)
          )
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
        currency: asString(
          source.budget?.currency ||
          source.currency,
          'AED'
        ).toUpperCase(),
        transactions: asArray(
          source.budget?.transactions ||
          source.expenses
        ).map(normalizeTransaction)
      },

      media: {
        photos: asArray(
          source.media?.photos ||
          source.photos
        ).map(normalizePhoto),
        files: asArray(
          source.media?.files ||
          source.files
        ).map(normalizeFile),
        links: asArray(
          source.media?.links ||
          source.links
        ).map(normalizeLink)
      },

      passport: {
        rating: Math.min(
          5,
          Math.max(0, asNumber(source.passport?.rating || source.rating, 0))
        ),
        memories: asArray(
          source.passport?.memories ||
          source.memories
        ).map((memory) => ({
          id: asString(memory?.id) || generateId('memory'),
          title: asString(memory?.title),
          text: asString(memory?.text || memory?.notes || memory),
          date: normalizeISODate(memory?.date),
          photos: asArray(memory?.photos).map(normalizePhoto),
          createdAt: asString(memory?.createdAt) || nowISO()
        })),
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

      history: asArray(source.history).map(normalizeHistoryItem),

      createdAt: asString(source.createdAt) || nowISO(),
      updatedAt: asString(source.updatedAt) || nowISO(),
      schemaVersion: 1
    };

    return refreshDerivedFields(record);
  }

  function refreshDerivedFields(record) {
    const clone = safeClone(record);
    const days = asArray(clone.itinerary?.days);

    days.forEach((day, dayIndex) => {
      day.dayNumber = dayIndex + 1;
      day.title = asString(day.title) || `اليوم ${dayIndex + 1}`;

      day.places = asArray(day.places)
        .map((place, placeIndex) => ({
          ...place,
          order: placeIndex
        }));

      const actionablePlaces = day.places.filter((place) => place.name);

      day.completed =
        actionablePlaces.length > 0 &&
        actionablePlaces.every(
          (place) => place.status !== PLACE_STATUS.PENDING
        );

      if (day.completed && !day.completedAt) {
        day.completedAt = nowISO();
      }

      if (!day.completed) {
        day.completedAt = '';
      }
    });

    clone.itinerary.days = days;

    const checklist = asArray(clone.trip?.checklist);
    const completedChecklist = checklist.filter((item) => item.completed).length;

    clone.trip.readiness = checklist.length
      ? Math.round((completedChecklist / checklist.length) * 100)
      : Math.min(100, Math.max(0, asNumber(clone.trip?.readiness, 0)));

    clone.updatedAt = nowISO();

    return clone;
  }

  function normalizeRecord(input) {
    return createDefaultRecord(input);
  }

  function normalizeRecords(input) {
    const records = asArray(input)
      .map(normalizeRecord)
      .filter((record) => record.id && (record.name || record.countryCode));

    return deduplicateRecords(records);
  }

  function deduplicateRecords(records) {
    const map = new Map();

    for (const record of records) {
      const key =
        record.countryCode ||
        slugify(record.name) ||
        record.id;

      if (!map.has(key)) {
        map.set(key, record);
        continue;
      }

      map.set(key, mergeRecords(map.get(key), record));
    }

    return [...map.values()];
  }

  function mergeRecords(baseInput, patchInput) {
    const base = normalizeRecord(baseInput);
    const patch = isObject(patchInput) ? patchInput : {};

    const merged = {
      ...base,
      ...safeClone(patch),

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
          ? asArray(patch.transport.flights).map(normalizeFlight)
          : base.transport.flights
      },

      itinerary: {
        ...base.itinerary,
        ...(isObject(patch.itinerary) ? patch.itinerary : {}),
        days: patch.itinerary?.days
          ? asArray(patch.itinerary.days).map(normalizeDay)
          : base.itinerary.days
      },

      wishlist: {
        ...base.wishlist,
        ...(isObject(patch.wishlist) ? patch.wishlist : {}),
        desiredPlaces: patch.wishlist?.desiredPlaces
          ? asArray(patch.wishlist.desiredPlaces).map(normalizePlace)
          : base.wishlist.desiredPlaces,
        hotels: patch.wishlist?.hotels
          ? asArray(patch.wishlist.hotels).map(normalizeHotel)
          : base.wishlist.hotels,
        restaurants: patch.wishlist?.restaurants
          ? asArray(patch.wishlist.restaurants).map(normalizeRestaurant)
          : base.wishlist.restaurants
      },

      trip: {
        ...base.trip,
        ...(isObject(patch.trip) ? patch.trip : {}),
        hotels: patch.trip?.hotels
          ? asArray(patch.trip.hotels).map(normalizeHotel)
          : base.trip.hotels,
        checklist: patch.trip?.checklist
          ? asArray(patch.trip.checklist).map(normalizeChecklistItem)
          : base.trip.checklist,
        documents: patch.trip?.documents
          ? asArray(patch.trip.documents).map(normalizeFile)
          : base.trip.documents
      },

      budget: {
        ...base.budget,
        ...(isObject(patch.budget) ? patch.budget : {}),
        transactions: patch.budget?.transactions
          ? asArray(patch.budget.transactions).map(normalizeTransaction)
          : base.budget.transactions
      },

      media: {
        ...base.media,
        ...(isObject(patch.media) ? patch.media : {}),
        photos: patch.media?.photos
          ? asArray(patch.media.photos).map(normalizePhoto)
          : base.media.photos,
        files: patch.media?.files
          ? asArray(patch.media.files).map(normalizeFile)
          : base.media.files,
        links: patch.media?.links
          ? asArray(patch.media.links).map(normalizeLink)
          : base.media.links
      },

      passport: {
        ...base.passport,
        ...(isObject(patch.passport) ? patch.passport : {})
      },

      flags: {
        ...base.flags,
        ...(isObject(patch.flags) ? patch.flags : {})
      },

      history: patch.history
        ? asArray(patch.history).map(normalizeHistoryItem)
        : base.history,

      id: base.id,
      countryCode:
        normalizeCountryCode(patch.countryCode) ||
        base.countryCode,
      status: normalizeStatus(patch.status, base.status),
      createdAt: base.createdAt,
      updatedAt: nowISO(),
      schemaVersion: 1
    };

    return refreshDerivedFields(normalizeRecord(merged));
  }

  /* =========================================================
     Store integration
     ========================================================= */

  function resolveStore() {
    return (
      global.Store ||
      global.AppStore ||
      global.TravelStore ||
      global.store ||
      null
    );
  }

  function readStoreState(store) {
    if (!store) {
      return null;
    }

    const readers = [
      () => store.getState?.(),
      () => store.get?.(),
      () => store.state,
      () => store.data
    ];

    for (const reader of readers) {
      try {
        const value = reader();

        if (isObject(value)) {
          return value;
        }
      } catch (_) {
        // Continue trying supported adapters.
      }
    }

    return null;
  }

  function extractRecordsFromState(state) {
    if (!isObject(state)) {
      return null;
    }

    for (const key of ROOT_KEYS) {
      const candidate = state[key];

      if (Array.isArray(candidate)) {
        return candidate;
      }

      if (isObject(candidate) && Array.isArray(candidate.records)) {
        return candidate.records;
      }

      if (isObject(candidate) && Array.isArray(candidate.countries)) {
        return candidate.countries;
      }
    }

    return null;
  }

  function writeStateThroughStore(store, records) {
    if (!store) {
      return false;
    }

    const payload = {
      records: safeClone(records),
      version: VERSION,
      updatedAt: nowISO()
    };

    const attempts = [
      () => {
        if (typeof store.update === 'function') {
          store.update('countryLifecycle', payload);
          return true;
        }
        return false;
      },
      () => {
        if (typeof store.set === 'function') {
          store.set('countryLifecycle', payload);
          return true;
        }
        return false;
      },
      () => {
        if (typeof store.patch === 'function') {
          store.patch({ countryLifecycle: payload });
          return true;
        }
        return false;
      },
      () => {
        if (typeof store.setState === 'function') {
          store.setState((state = {}) => ({
            ...state,
            countryLifecycle: payload
          }));
          return true;
        }
        return false;
      },
      () => {
        if (typeof store.save === 'function') {
          const state = readStoreState(store) || {};
          store.save({
            ...state,
            countryLifecycle: payload
          });
          return true;
        }
        return false;
      }
    ];

    for (const attempt of attempts) {
      try {
        if (attempt()) {
          return true;
        }
      } catch (_) {
        // Continue to the next adapter.
      }
    }

    return false;
  }

  function readLocalFallback() {
    if (!runtime.settings.useLocalFallback) {
      return [];
    }

    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      const parsed = safeJSONParse(raw, null);

      if (Array.isArray(parsed)) {
        return normalizeRecords(parsed);
      }

      if (isObject(parsed) && Array.isArray(parsed.records)) {
        return normalizeRecords(parsed.records);
      }
    } catch (_) {
      // Local storage may be unavailable in private mode.
    }

    return [];
  }

  function writeLocalFallback(records) {
    if (!runtime.settings.useLocalFallback) {
      return false;
    }

    try {
      global.localStorage?.setItem(
        STORAGE_KEY,
        safeJSONStringify({
          version: VERSION,
          updatedAt: nowISO(),
          records
        })
      );

      return true;
    } catch (_) {
      return false;
    }
  }

  function loadRecords() {
    const store = resolveStore();
    const state = readStoreState(store);
    const storeRecords = extractRecordsFromState(state);

    if (Array.isArray(storeRecords)) {
      runtime.source = 'store';
      return normalizeRecords(storeRecords);
    }

    runtime.source = 'localStorage';
    return readLocalFallback();
  }

  function persistNow(reason = 'update') {
    if (runtime.destroyed || runtime.persisting) {
      return false;
    }

    const serialized = safeJSONStringify(runtime.records);

    if (serialized === runtime.lastSerialized) {
      return true;
    }

    runtime.persisting = true;

    try {
      const store = resolveStore();
      const storeSaved = writeStateThroughStore(store, runtime.records);
      const localSaved = writeLocalFallback(runtime.records);

      runtime.lastSerialized = serialized;
      runtime.source = storeSaved ? 'store' : localSaved ? 'localStorage' : 'memory';

      dispatch(EVENT.SYNC, {
        reason,
        source: runtime.source,
        count: runtime.records.length
      });

      return storeSaved || localSaved;
    } catch (error) {
      reportError(error, {
        operation: 'persistNow',
        reason
      });

      return false;
    } finally {
      runtime.persisting = false;
    }
  }

  function schedulePersist(reason = 'update') {
    if (runtime.persistTimer) {
      global.clearTimeout(runtime.persistTimer);
    }

    runtime.persistTimer = global.setTimeout(() => {
      runtime.persistTimer = 0;
      persistNow(reason);
    }, runtime.settings.persistDebounceMs);
  }

  function subscribeToStore() {
    const store = resolveStore();

    if (!store || typeof store.subscribe !== 'function') {
      return;
    }

    try {
      const unsubscribe = store.subscribe((state) => {
        if (runtime.persisting || runtime.syncing) {
          return;
        }

        const incoming = extractRecordsFromState(
          isObject(state) ? state : readStoreState(store)
        );

        if (!Array.isArray(incoming)) {
          return;
        }

        const normalized = normalizeRecords(incoming);
        const serialized = safeJSONStringify(normalized);

        if (serialized === safeJSONStringify(runtime.records)) {
          return;
        }

        runtime.syncing = true;

        try {
          runtime.records = normalized;
          runtime.lastSerialized = serialized;

          dispatch(EVENT.CHANGE, {
            reason: 'external-store-sync',
            records: getAll()
          });
        } finally {
          runtime.syncing = false;
        }
      });

      if (typeof unsubscribe === 'function') {
        runtime.storeUnsubscribe = unsubscribe;
      }
    } catch (error) {
      reportError(error, {
        operation: 'subscribeToStore'
      });
    }
  }

  /* =========================================================
     Queries
     ========================================================= */

  function getAll(options = {}) {
    const source = runtime.records.filter((record) => {
      if (!options.includeArchived && record.flags?.archived) {
        return false;
      }

      if (options.status && record.status !== normalizeStatus(options.status)) {
        return false;
      }

      return true;
    });

    const sorted = [...source].sort((a, b) => {
      const aDate = a.dates?.startDate || '9999-12-31';
      const bDate = b.dates?.startDate || '9999-12-31';

      if (a.status === STATUS.UPCOMING || a.status === STATUS.ACTIVE) {
        const dateComparison = aDate.localeCompare(bDate);

        if (dateComparison !== 0) {
          return dateComparison;
        }
      }

      return asString(a.name).localeCompare(asString(b.name), 'ar');
    });

    return safeClone(sorted);
  }

  function getById(id) {
    const normalizedId = asString(id);
    const record = runtime.records.find((item) => item.id === normalizedId);
    return record ? safeClone(record) : null;
  }

  function findByCountry(countryCodeOrName) {
    const query = asString(countryCodeOrName);
    const code = normalizeCountryCode(query);
    const slug = slugify(query);

    const record = runtime.records.find((item) => {
      if (code && item.countryCode === code) {
        return true;
      }

      return slugify(item.name) === slug ||
        slugify(item.localizedName) === slug;
    });

    return record ? safeClone(record) : null;
  }

  function getByStatus(status) {
    return getAll({ status });
  }

  function getCurrentActive() {
    const active = runtime.records
      .filter((record) => record.status === STATUS.ACTIVE)
      .sort((a, b) =>
        (a.dates?.startDate || '').localeCompare(b.dates?.startDate || '')
      );

    return active[0] ? safeClone(active[0]) : null;
  }

  function getUpcoming(limit = 0) {
    const records = getByStatus(STATUS.UPCOMING);
    return limit > 0 ? records.slice(0, limit) : records;
  }

  function getCountdown(id) {
    const record = getById(id);

    if (!record?.dates?.startDate) {
      return null;
    }

    return dateDiffInDays(todayISO(), record.dates.startDate);
  }

  function getCurrentDay(id, referenceDate = todayISO()) {
    const record = getById(id);

    if (!record) {
      return null;
    }

    const startDate = record.dates?.startDate;
    const days = asArray(record.itinerary?.days);

    if (!days.length) {
      return null;
    }

    if (!startDate) {
      return safeClone(days[0]);
    }

    const dayIndex = Math.max(
      0,
      Math.min(
        days.length - 1,
        dateDiffInDays(startDate, referenceDate) || 0
      )
    );

    return safeClone(days[dayIndex]);
  }

  function getDayProgress(id, dayIdOrNumber) {
    const record = getById(id);

    if (!record) {
      return null;
    }

    const days = asArray(record.itinerary?.days);
    const day = days.find((item) =>
      item.id === dayIdOrNumber ||
      item.dayNumber === Number(dayIdOrNumber)
    );

    if (!day) {
      return null;
    }

    const places = asArray(day.places).filter((place) => place.name);
    const completed = places.filter(
      (place) => place.status === PLACE_STATUS.VISITED
    ).length;
    const skipped = places.filter(
      (place) => place.status === PLACE_STATUS.SKIPPED
    ).length;
    const handled = completed + skipped;

    return {
      total: places.length,
      completed,
      skipped,
      pending: Math.max(0, places.length - handled),
      handled,
      percentage: places.length
        ? Math.round((handled / places.length) * 100)
        : 0
    };
  }

  /* =========================================================
     Mutations
     ========================================================= */

  function commit(nextRecords, metadata = {}) {
    runtime.records = normalizeRecords(nextRecords);
    schedulePersist(metadata.reason || 'update');

    dispatch(EVENT.CHANGE, {
      ...metadata,
      records: getAll()
    });

    return true;
  }

  function create(input, options = {}) {
    try {
      const incoming = normalizeRecord(input);

      if (!incoming.name && !incoming.countryCode) {
        throw new Error('Country name or country code is required.');
      }

      const existing = findByCountry(
        incoming.countryCode || incoming.name
      );

      if (existing) {
        if (options.mergeExisting === false) {
          throw new Error('Country record already exists.');
        }

        return update(existing.id, input, {
          reason: 'merge-existing'
        });
      }

      incoming.history.push(
        normalizeHistoryItem({
          action: 'created',
          toStatus: incoming.status,
          metadata: {
            source: asString(options.source, 'manual')
          }
        })
      );

      commit([...runtime.records, incoming], {
        reason: 'create',
        recordId: incoming.id
      });

      dispatch(EVENT.CREATED, {
        record: incoming
      });

      return safeClone(incoming);
    } catch (error) {
      throw reportError(error, {
        operation: 'create'
      });
    }
  }

  function update(id, patch, options = {}) {
    const index = runtime.records.findIndex((record) => record.id === id);

    if (index < 0) {
      throw reportError(new Error('Country record not found.'), {
        operation: 'update',
        id
      });
    }

    const current = runtime.records[index];
    const next = mergeRecords(current, patch);

    if (patch?.status && normalizeStatus(patch.status) !== current.status) {
      return transition(id, patch.status, {
        ...options,
        patch
      });
    }

    next.history.push(
      normalizeHistoryItem({
        action: 'updated',
        fromStatus: current.status,
        toStatus: current.status,
        metadata: {
          reason: asString(options.reason, 'manual-update')
        }
      })
    );

    const records = [...runtime.records];
    records[index] = next;

    commit(records, {
      reason: options.reason || 'update',
      recordId: id
    });

    dispatch(EVENT.UPDATED, {
      record: next,
      previous: current
    });

    return safeClone(next);
  }

  function remove(id, options = {}) {
    const index = runtime.records.findIndex((record) => record.id === id);

    if (index < 0) {
      return false;
    }

    const record = runtime.records[index];

    if (options.archive !== false) {
      return update(id, {
        flags: {
          ...record.flags,
          archived: true
        }
      }, {
        reason: 'archive'
      });
    }

    const nextRecords = runtime.records.filter((item) => item.id !== id);

    commit(nextRecords, {
      reason: 'remove',
      recordId: id
    });

    dispatch(EVENT.REMOVED, {
      record
    });

    return true;
  }

  function canTransition(fromStatus, toStatus) {
    const from = normalizeStatus(fromStatus);
    const to = normalizeStatus(toStatus);

    return asArray(ALLOWED_TRANSITIONS[from]).includes(to);
  }

  function transition(id, nextStatus, options = {}) {
    const index = runtime.records.findIndex((record) => record.id === id);

    if (index < 0) {
      throw reportError(new Error('Country record not found.'), {
        operation: 'transition',
        id
      });
    }

    const current = runtime.records[index];
    const targetStatus = normalizeStatus(nextStatus, current.status);

    if (targetStatus === current.status) {
      return safeClone(current);
    }

    if (!options.force && !canTransition(current.status, targetStatus)) {
      throw reportError(
        new Error(
          `Invalid lifecycle transition: ${current.status} -> ${targetStatus}`
        ),
        {
          operation: 'transition',
          id,
          fromStatus: current.status,
          toStatus: targetStatus
        }
      );
    }

    let next = mergeRecords(current, options.patch || {});
    next.status = targetStatus;

    if (targetStatus === STATUS.UPCOMING) {
      if (!next.dates.startDate || !next.dates.endDate) {
        throw reportError(
          new Error('Start date and end date are required for an upcoming trip.'),
          {
            operation: 'transition',
            id,
            toStatus: targetStatus
          }
        );
      }

      next.flags.completionReady = false;
    }

    if (targetStatus === STATUS.ACTIVE) {
      next.flags.completionReady = false;
    }

    if (targetStatus === STATUS.COMPLETED) {
      next.flags.completionReady = false;
      next.passport.completedAt =
        next.passport.completedAt || nowISO();
    }

    next.history.push(
      normalizeHistoryItem({
        action: 'transition',
        fromStatus: current.status,
        toStatus: targetStatus,
        metadata: {
          reason: asString(options.reason, 'manual')
        }
      })
    );

    next = refreshDerivedFields(next);

    const records = [...runtime.records];
    records[index] = next;

    commit(records, {
      reason: 'transition',
      recordId: id,
      fromStatus: current.status,
      toStatus: targetStatus
    });

    dispatch(EVENT.TRANSITION, {
      record: next,
      previous: current,
      fromStatus: current.status,
      toStatus: targetStatus
    });

    return safeClone(next);
  }

  function convertWishlistToUpcoming(id, tripDetails = {}) {
    return transition(id, STATUS.UPCOMING, {
      reason: 'wishlist-to-upcoming',
      patch: {
        dates: {
          startDate:
            tripDetails.startDate ||
            tripDetails.dates?.startDate,
          endDate:
            tripDetails.endDate ||
            tripDetails.dates?.endDate
        },
        travelers:
          tripDetails.travelers,
        transport: {
          airline:
            tripDetails.airline ||
            tripDetails.transport?.airline,
          flightNumber:
            tripDetails.flightNumber ||
            tripDetails.transport?.flightNumber,
          bookingReference:
            tripDetails.bookingReference ||
            tripDetails.transport?.bookingReference,
          flights:
            tripDetails.flights ||
            tripDetails.transport?.flights
        },
        trip: {
          hotels:
            tripDetails.hotels ||
            (tripDetails.hotel ? [tripDetails.hotel] : undefined),
          checklist: tripDetails.checklist,
          documents: tripDetails.documents
        }
      }
    });
  }

  function activate(id, options = {}) {
    return transition(id, STATUS.ACTIVE, {
      reason: options.reason || 'activate',
      force: Boolean(options.force)
    });
  }

  function complete(id, completionData = {}) {
    return transition(id, STATUS.COMPLETED, {
      reason: 'complete-trip',
      patch: {
        passport: {
          rating: completionData.rating,
          memories: completionData.memories,
          completedAt: nowISO()
        },
        media: completionData.media,
        notes: completionData.notes
      }
    });
  }

  function reopenCompleted() {
    throw reportError(
      new Error(
        'Completed records are permanent in V1 and cannot be reopened automatically.'
      ),
      {
        operation: 'reopenCompleted'
      }
    );
  }

  function setItinerary(id, itineraryInput, options = {}) {
    const rawText =
      typeof itineraryInput === 'string'
        ? itineraryInput
        : asString(itineraryInput?.rawText);

    const days =
      typeof itineraryInput === 'string'
        ? []
        : asArray(itineraryInput?.days).map(normalizeDay);

    return update(id, {
      itinerary: {
        rawText,
        parserVersion: asString(
          itineraryInput?.parserVersion ||
          options.parserVersion
        ),
        parsedAt: days.length ? nowISO() : '',
        days
      }
    }, {
      reason: 'set-itinerary'
    });
  }

  function replaceDays(id, days, options = {}) {
    return update(id, {
      itinerary: {
        days: asArray(days).map(normalizeDay),
        parserVersion: asString(options.parserVersion),
        parsedAt: nowISO()
      }
    }, {
      reason: 'replace-days'
    });
  }

  function setPlaceStatus(
    recordId,
    dayIdOrNumber,
    placeId,
    nextStatus,
    metadata = {}
  ) {
    const recordIndex = runtime.records.findIndex(
      (record) => record.id === recordId
    );

    if (recordIndex < 0) {
      throw reportError(new Error('Country record not found.'), {
        operation: 'setPlaceStatus',
        recordId
      });
    }

    const record = safeClone(runtime.records[recordIndex]);
    const day = record.itinerary.days.find((item) =>
      item.id === dayIdOrNumber ||
      item.dayNumber === Number(dayIdOrNumber)
    );

    if (!day) {
      throw reportError(new Error('Itinerary day not found.'), {
        operation: 'setPlaceStatus',
        recordId,
        dayIdOrNumber
      });
    }

    const place = day.places.find((item) => item.id === placeId);

    if (!place) {
      throw reportError(new Error('Place not found.'), {
        operation: 'setPlaceStatus',
        recordId,
        dayIdOrNumber,
        placeId
      });
    }

    const status = Object.values(PLACE_STATUS).includes(nextStatus)
      ? nextStatus
      : PLACE_STATUS.PENDING;

    place.status = status;
    place.updatedAt = nowISO();

    if (status === PLACE_STATUS.VISITED) {
      place.completedAt = nowISO();
      place.skippedAt = '';
      place.arrivedAt = asString(metadata.arrivedAt, place.arrivedAt);
    } else if (status === PLACE_STATUS.SKIPPED) {
      place.skippedAt = nowISO();
      place.completedAt = '';
    } else {
      place.completedAt = '';
      place.skippedAt = '';
    }

    record.history.push(
      normalizeHistoryItem({
        action: 'place-status',
        fromStatus: record.status,
        toStatus: record.status,
        metadata: {
          dayId: day.id,
          placeId,
          placeStatus: status
        }
      })
    );

    const refreshed = refreshDerivedFields(record);
    const records = [...runtime.records];
    records[recordIndex] = refreshed;

    commit(records, {
      reason: 'place-status',
      recordId,
      dayId: day.id,
      placeId
    });

    const progress = getDayProgress(recordId, day.id);

    dispatch(EVENT.PLACE_STATUS, {
      recordId,
      dayId: day.id,
      placeId,
      status,
      progress
    });

    dispatch(EVENT.DAY_PROGRESS, {
      recordId,
      dayId: day.id,
      progress
    });

    return {
      record: getById(recordId),
      day: safeClone(
        refreshed.itinerary.days.find((item) => item.id === day.id)
      ),
      place: safeClone(place),
      progress
    };
  }

  function markPlaceVisited(recordId, dayIdOrNumber, placeId, metadata = {}) {
    return setPlaceStatus(
      recordId,
      dayIdOrNumber,
      placeId,
      PLACE_STATUS.VISITED,
      metadata
    );
  }

  function skipPlace(recordId, dayIdOrNumber, placeId, metadata = {}) {
    return setPlaceStatus(
      recordId,
      dayIdOrNumber,
      placeId,
      PLACE_STATUS.SKIPPED,
      metadata
    );
  }

  function resetPlace(recordId, dayIdOrNumber, placeId) {
    return setPlaceStatus(
      recordId,
      dayIdOrNumber,
      placeId,
      PLACE_STATUS.PENDING
    );
  }

  function toggleChecklistItem(recordId, itemId, completed) {
    const record = getById(recordId);

    if (!record) {
      throw reportError(new Error('Country record not found.'), {
        operation: 'toggleChecklistItem',
        recordId
      });
    }

    const checklist = record.trip.checklist.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      const nextCompleted =
        typeof completed === 'boolean'
          ? completed
          : !item.completed;

      return {
        ...item,
        completed: nextCompleted,
        completedAt: nextCompleted ? nowISO() : '',
        updatedAt: nowISO()
      };
    });

    return update(recordId, {
      trip: {
        checklist
      }
    }, {
      reason: 'toggle-checklist'
    });
  }

  function addExpense(recordId, expense) {
    const record = getById(recordId);

    if (!record) {
      throw reportError(new Error('Country record not found.'), {
        operation: 'addExpense',
        recordId
      });
    }

    return update(recordId, {
      budget: {
        ...record.budget,
        transactions: [
          ...record.budget.transactions,
          normalizeTransaction(expense)
        ]
      }
    }, {
      reason: 'add-expense'
    });
  }

  /* =========================================================
     Automatic lifecycle synchronization
     ========================================================= */

  function synchronizeStatuses(referenceDate = todayISO()) {
    if (runtime.syncing || runtime.destroyed) {
      return {
        activated: [],
        completionReady: []
      };
    }

    runtime.syncing = true;

    const activated = [];
    const completionReady = [];
    let changed = false;

    try {
      const records = runtime.records.map((record) => {
        let next = safeClone(record);
        const startDate = next.dates?.startDate;
        const endDate = next.dates?.endDate;

        if (
          runtime.settings.autoActivate &&
          next.status === STATUS.UPCOMING &&
          startDate &&
          compareDates(startDate, referenceDate) <= 0 &&
          (!endDate || compareDates(referenceDate, endDate) <= 0)
        ) {
          next.status = STATUS.ACTIVE;
          next.flags.completionReady = false;
          next.history.push(
            normalizeHistoryItem({
              action: 'transition',
              fromStatus: STATUS.UPCOMING,
              toStatus: STATUS.ACTIVE,
              metadata: {
                reason: 'automatic-date-activation'
              }
            })
          );

          activated.push(next.id);
          changed = true;
        }

        if (
          runtime.settings.autoCompletionReady &&
          next.status === STATUS.ACTIVE &&
          endDate &&
          compareDates(referenceDate, endDate) > 0 &&
          !next.flags.completionReady
        ) {
          next.flags.completionReady = true;
          next.history.push(
            normalizeHistoryItem({
              action: 'completion-ready',
              fromStatus: STATUS.ACTIVE,
              toStatus: STATUS.ACTIVE,
              metadata: {
                reason: 'end-date-passed'
              }
            })
          );

          completionReady.push(next.id);
          changed = true;
        }

        return changed ? refreshDerivedFields(next) : next;
      });

      if (changed) {
        commit(records, {
          reason: 'automatic-status-sync',
          activated,
          completionReady
        });
      }

      for (const id of activated) {
        const record = getById(id);

        dispatch(EVENT.TRANSITION, {
          record,
          fromStatus: STATUS.UPCOMING,
          toStatus: STATUS.ACTIVE,
          automatic: true
        });
      }

      return {
        activated,
        completionReady
      };
    } finally {
      runtime.syncing = false;
    }
  }

  function startDateWatcher() {
    if (!runtime.settings.dateCheckIntervalMs) {
      return;
    }

    const timer = global.setInterval(() => {
      if (global.document?.visibilityState === 'hidden') {
        return;
      }

      synchronizeStatuses();
    }, runtime.settings.dateCheckIntervalMs);

    runtime.timers.add(timer);
  }

  function bindVisibilityListener() {
    if (!global.document) {
      return;
    }

    const handler = () => {
      if (global.document.visibilityState === 'visible') {
        synchronizeStatuses();
      }
    };

    global.document.addEventListener('visibilitychange', handler, {
      passive: true
    });

    runtime.listeners.push(() => {
      global.document.removeEventListener('visibilitychange', handler);
    });
  }

  function bindLifecycleRefreshEvents() {
    const names = [
      'tic:store:changed',
      'tic:travel-sync:completed',
      'tic:app:resume'
    ];

    const handler = () => {
      if (runtime.persisting || runtime.syncing) {
        return;
      }

      const incoming = loadRecords();
      const serialized = safeJSONStringify(incoming);

      if (serialized === safeJSONStringify(runtime.records)) {
        synchronizeStatuses();
        return;
      }

      runtime.records = incoming;
      runtime.lastSerialized = serialized;

      synchronizeStatuses();

      dispatch(EVENT.CHANGE, {
        reason: 'integration-refresh',
        records: getAll()
      });
    };

    names.forEach((name) => {
      global.addEventListener(name, handler, {
        passive: true
      });

      runtime.listeners.push(() => {
        global.removeEventListener(name, handler);
      });
    });
  }

  /* =========================================================
     Import and migration
     ========================================================= */

  function importRecords(records, options = {}) {
    const incoming = normalizeRecords(records);

    if (!incoming.length) {
      return {
        imported: 0,
        total: runtime.records.length
      };
    }

    const nextRecords = options.replace
      ? incoming
      : deduplicateRecords([
          ...runtime.records,
          ...incoming
        ]);

    commit(nextRecords, {
      reason: options.reason || 'import'
    });

    return {
      imported: incoming.length,
      total: nextRecords.length
    };
  }

  function exportRecords() {
    return {
      version: VERSION,
      schemaVersion: 1,
      exportedAt: nowISO(),
      records: getAll({ includeArchived: true })
    };
  }

  function migrateLegacyCountry(input, defaultStatus = STATUS.WISHLIST) {
    const source = isObject(input) ? input : {};

    return normalizeRecord({
      ...source,
      status: normalizeStatus(
        source.status ||
        source.tripStatus ||
        (source.completed ? STATUS.COMPLETED : defaultStatus)
      ),
      name:
        source.name ||
        source.country ||
        source.destination ||
        source.title,
      countryCode:
        source.countryCode ||
        source.isoCode ||
        source.code,
      dates: {
        startDate:
          source.startDate ||
          source.dateFrom ||
          source.trip?.startDate,
        endDate:
          source.endDate ||
          source.dateTo ||
          source.trip?.endDate
      },
      itinerary: {
        rawText:
          source.rawItinerary ||
          source.itineraryText,
        days:
          source.days ||
          source.itinerary?.days
      }
    });
  }

  function migrateLegacyCollections(collections = {}) {
    const migrated = [];

    const mapping = [
      ['wishlist', STATUS.WISHLIST],
      ['wishlists', STATUS.WISHLIST],
      ['plannedTrips', STATUS.UPCOMING],
      ['upcomingTrips', STATUS.UPCOMING],
      ['activeTrips', STATUS.ACTIVE],
      ['completedTrips', STATUS.COMPLETED],
      ['passport', STATUS.COMPLETED],
      ['trips', STATUS.UPCOMING]
    ];

    for (const [key, defaultStatus] of mapping) {
      for (const item of asArray(collections[key])) {
        migrated.push(
          migrateLegacyCountry(item, defaultStatus)
        );
      }
    }

    return importRecords(migrated, {
      reason: 'legacy-migration'
    });
  }

  /* =========================================================
     Lifecycle
     ========================================================= */

  function configure(options = {}) {
    runtime.settings = {
      ...runtime.settings,
      ...(isObject(options) ? options : {})
    };

    return safeClone(runtime.settings);
  }

  function init(options = {}) {
    if (runtime.initialized && !runtime.destroyed) {
      return api;
    }

    runtime.destroyed = false;
    runtime.initialized = true;

    configure(options);

    runtime.records = loadRecords();
    runtime.lastSerialized = safeJSONStringify(runtime.records);

    subscribeToStore();
    bindVisibilityListener();
    bindLifecycleRefreshEvents();
    startDateWatcher();

    synchronizeStatuses();
    persistNow('init');

    dispatch(EVENT.READY, {
      count: runtime.records.length,
      source: runtime.source,
      statuses: getStats().statuses
    });

    return api;
  }

  function destroy() {
    if (runtime.destroyed) {
      return;
    }

    runtime.destroyed = true;
    runtime.initialized = false;

    if (runtime.persistTimer) {
      global.clearTimeout(runtime.persistTimer);
      runtime.persistTimer = 0;
    }

    for (const timer of runtime.timers) {
      global.clearInterval(timer);
      global.clearTimeout(timer);
    }

    runtime.timers.clear();

    for (const cleanup of runtime.listeners.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // Cleanup must continue.
      }
    }

    if (typeof runtime.storeUnsubscribe === 'function') {
      try {
        runtime.storeUnsubscribe();
      } catch (_) {
        // Ignore unsubscribe errors.
      }
    }

    runtime.storeUnsubscribe = null;
  }

  function getStats() {
    const statuses = {
      [STATUS.WISHLIST]: 0,
      [STATUS.UPCOMING]: 0,
      [STATUS.ACTIVE]: 0,
      [STATUS.COMPLETED]: 0
    };

    let totalPlaces = 0;
    let visitedPlaces = 0;
    let skippedPlaces = 0;
    let totalExpenses = 0;

    for (const record of runtime.records) {
      statuses[record.status] += 1;

      for (const day of asArray(record.itinerary?.days)) {
        for (const place of asArray(day.places)) {
          totalPlaces += 1;

          if (place.status === PLACE_STATUS.VISITED) {
            visitedPlaces += 1;
          }

          if (place.status === PLACE_STATUS.SKIPPED) {
            skippedPlaces += 1;
          }
        }
      }

      totalExpenses += asArray(record.budget?.transactions).reduce(
        (sum, transaction) => sum + asNumber(transaction.amount, 0),
        0
      );
    }

    return {
      version: VERSION,
      source: runtime.source,
      total: runtime.records.length,
      statuses,
      places: {
        total: totalPlaces,
        visited: visitedPlaces,
        skipped: skippedPlaces,
        pending: Math.max(
          0,
          totalPlaces - visitedPlaces - skippedPlaces
        )
      },
      expenses: totalExpenses
    };
  }

  /* =========================================================
     Public API
     ========================================================= */

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,

    STATUS,
    PLACE_STATUS,
    EVENT,
    ALLOWED_TRANSITIONS,

    init,
    destroy,
    configure,

    create,
    update,
    remove,
    transition,
    canTransition,

    convertWishlistToUpcoming,
    activate,
    complete,
    reopenCompleted,

    setItinerary,
    replaceDays,

    setPlaceStatus,
    markPlaceVisited,
    skipPlace,
    resetPlace,

    toggleChecklistItem,
    addExpense,

    getAll,
    getById,
    findByCountry,
    getByStatus,
    getCurrentActive,
    getUpcoming,
    getCountdown,
    getCurrentDay,
    getDayProgress,
    getStats,

    synchronizeStatuses,

    importRecords,
    exportRecords,
    migrateLegacyCountry,
    migrateLegacyCollections,

    normalizeRecord,
    normalizeRecords,

    persist() {
      return persistNow('manual');
    },

    isReady() {
      return runtime.initialized && !runtime.destroyed;
    }
  });

  global.CountryLifecycleEngine = api;

  if (global.document?.readyState === 'loading') {
    global.document.addEventListener(
      'DOMContentLoaded',
      () => api.init(),
      { once: true }
    );
  } else {
    api.init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
