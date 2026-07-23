/* =========================================================
   Travel Intelligence Center
   Passport Engine V1.0.0
   Country Lifecycle System - Completed Journey Archive Engine

   File Path:
   js/extensions/country-lifecycle/passport-engine.js

   Purpose:
   - Powers the completed-country Travel Passport.
   - Preserves one permanent country record after trip completion.
   - Builds read-only archive summaries without duplicating records.
   - Groups completed journeys by year and country.
   - Exposes memories, photos, flights, hotels, itinerary and expenses.
   - Calculates archive statistics and visited-country insights.
   - Supports safe edits to memories, ratings and archive metadata.
   - Integrates with CountryLifecycleEngine and Model.
   ========================================================= */

(function passportEngineBootstrap(global) {
  'use strict';

  if (!global || global.PassportEngine?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';

  const EVENT = Object.freeze({
    READY: 'tic:passport:ready',
    CHANGE: 'tic:passport:change',
    ARCHIVE_UPDATED: 'tic:passport:archive-updated',
    MEMORY_ADDED: 'tic:passport:memory-added',
    RATING_CHANGED: 'tic:passport:rating-changed',
    SNAPSHOT: 'tic:passport:snapshot'
  });

  const runtime = {
    initialized: false,
    destroyed: false,
    listeners: [],
    revision: 0,
    cache: null,
    cacheRevision: -1
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function asString(value, fallback = '') {
    if (value === undefined || value === null) {
      return fallback;
    }

    return String(value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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

  function dispatch(name, detail = {}) {
    try {
      global.dispatchEvent(
        new CustomEvent(name, {
          detail: clone({
            version: VERSION,
            timestamp: nowISO(),
            ...detail
          })
        })
      );
    } catch (_) {
      // Events are supplementary.
    }
  }

  function getEngine() {
    return global.CountryLifecycleEngine || null;
  }

  function getModel() {
    return global.CountryLifecycleModel || null;
  }

  function ensureEngine() {
    const engine = getEngine();

    if (!engine) {
      throw new Error('CountryLifecycleEngine is not available.');
    }

    engine.init?.();
    return engine;
  }

  function parseDate(value) {
    const text = asString(value);

    if (!text) {
      return null;
    }

    const date = new Date(
      text.length <= 10 ? `${text}T12:00:00` : text
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getYear(record) {
    const date =
      parseDate(record?.dates?.endDate) ||
      parseDate(record?.dates?.startDate) ||
      parseDate(record?.completedAt) ||
      parseDate(record?.updatedAt);

    return date ? date.getFullYear() : null;
  }

  function getCountryName(record) {
    return (
      asString(record?.localizedName) ||
      asString(record?.name) ||
      'دولة'
    );
  }

  function getCompletedRecords() {
    const records = asArray(
      ensureEngine().getByStatus?.('completed')
    );

    return records.slice().sort((a, b) => {
      const aDate =
        parseDate(a.dates?.endDate) ||
        parseDate(a.completedAt) ||
        new Date(0);

      const bDate =
        parseDate(b.dates?.endDate) ||
        parseDate(b.completedAt) ||
        new Date(0);

      return bDate.getTime() - aDate.getTime();
    });
  }

  function getPlaces(record) {
    return asArray(record?.itinerary?.days).flatMap(
      (day) => asArray(day.places)
    );
  }

  function getVisitedPlaces(record) {
    return getPlaces(record).filter(
      (place) => place.status === 'visited'
    );
  }

  function getSkippedPlaces(record) {
    return getPlaces(record).filter(
      (place) => place.status === 'skipped'
    );
  }

  function getTransactions(record) {
    return asArray(
      record?.budget?.transactions ||
      record?.expenses
    );
  }

  function calculateSpent(record) {
    const model = getModel();

    if (model?.calculateSpent) {
      return model.calculateSpent(record);
    }

    return getTransactions(record)
      .filter((item) => {
        const type = asString(item.type).toLowerCase();
        return type !== 'deposit' && type !== 'refund';
      })
      .reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0
      );
  }

  function getDuration(record) {
    const model = getModel();

    if (model?.getDuration) {
      return model.getDuration(record);
    }

    const start = parseDate(record?.dates?.startDate);
    const end = parseDate(record?.dates?.endDate);

    if (!start || !end) {
      return 0;
    }

    const startUTC = Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate()
    );

    const endUTC = Date.UTC(
      end.getFullYear(),
      end.getMonth(),
      end.getDate()
    );

    return Math.max(
      1,
      Math.floor((endUTC - startUTC) / 86400000) + 1
    );
  }

  function buildArchiveEntry(record) {
    const visitedPlaces = getVisitedPlaces(record);
    const skippedPlaces = getSkippedPlaces(record);
    const allPlaces = getPlaces(record);
    const year = getYear(record);
    const spent = calculateSpent(record);
    const currency =
      record?.budget?.currency ||
      record?.currency ||
      'AED';

    return {
      id: record.id,
      countryCode: asString(record.countryCode),
      name: getCountryName(record),
      city: asString(record.city),
      year,
      status: record.status,
      cover: clone(record.cover || {}),
      summary: asString(record.summary),
      rating: Number(record.rating) || 0,
      dates: clone(record.dates || {}),
      duration: getDuration(record),
      travelers: Number(record.travelers) || 0,
      itinerary: clone(record.itinerary || { days: [] }),
      places: {
        total: allPlaces.length,
        visited: visitedPlaces.length,
        skipped: skippedPlaces.length,
        visitedItems: clone(visitedPlaces),
        skippedItems: clone(skippedPlaces)
      },
      hotels: clone(asArray(record.hotels)),
      flights: clone(
        asArray(
          record.flights ||
          record.transport?.flights
        )
      ),
      restaurants: clone(asArray(record.restaurants)),
      photos: clone(asArray(record.photos)),
      files: clone(asArray(record.files)),
      links: clone(asArray(record.links)),
      memories: clone(asArray(record.memories)),
      notes: asString(record.notes),
      budget: {
        planned:
          Number(record.budget?.planned) ||
          Number(record.estimatedBudget) ||
          0,
        spent,
        currency,
        transactions: clone(getTransactions(record))
      },
      completedAt:
        asString(record.completedAt) ||
        asString(record.dates?.endDate),
      raw: clone(record)
    };
  }

  function getArchiveEntries() {
    return getCompletedRecords().map(buildArchiveEntry);
  }

  function groupByYear(entries = getArchiveEntries()) {
    const groups = new Map();

    for (const entry of entries) {
      const key = entry.year || 'unknown';

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(entry);
    }

    return Array.from(groups.entries())
      .sort((a, b) => {
        if (a[0] === 'unknown') {
          return 1;
        }

        if (b[0] === 'unknown') {
          return -1;
        }

        return Number(b[0]) - Number(a[0]);
      })
      .map(([year, records]) => ({
        year,
        records,
        count: records.length
      }));
  }

  function groupByCountry(entries = getArchiveEntries()) {
    const groups = new Map();

    for (const entry of entries) {
      const key =
        entry.countryCode ||
        entry.name.toLowerCase();

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          countryCode: entry.countryCode,
          name: entry.name,
          trips: []
        });
      }

      groups.get(key).trips.push(entry);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        tripCount: group.trips.length,
        years: Array.from(
          new Set(
            group.trips
              .map((trip) => trip.year)
              .filter(Boolean)
          )
        ).sort((a, b) => b - a),
        lastTrip: group.trips[0] || null
      }))
      .sort((a, b) => {
        const aYear = a.lastTrip?.year || 0;
        const bYear = b.lastTrip?.year || 0;
        return bYear - aYear;
      });
  }

  function calculateStats(entries = getArchiveEntries()) {
    const uniqueCountries = new Set();
    const uniqueCities = new Set();
    let totalDays = 0;
    let totalSpent = 0;
    let visitedPlaces = 0;
    let skippedPlaces = 0;
    let photos = 0;
    let memories = 0;

    for (const entry of entries) {
      uniqueCountries.add(
        entry.countryCode ||
        entry.name.toLowerCase()
      );

      if (entry.city) {
        uniqueCities.add(entry.city.toLowerCase());
      }

      totalDays += Number(entry.duration) || 0;
      totalSpent += Number(entry.budget?.spent) || 0;
      visitedPlaces += Number(entry.places?.visited) || 0;
      skippedPlaces += Number(entry.places?.skipped) || 0;
      photos += asArray(entry.photos).length;
      memories += asArray(entry.memories).length;
    }

    return {
      trips: entries.length,
      countries: uniqueCountries.size,
      cities: uniqueCities.size,
      totalDays,
      totalSpent,
      visitedPlaces,
      skippedPlaces,
      photos,
      memories,
      averageTripDays: entries.length
        ? Math.round(totalDays / entries.length)
        : 0,
      averageTripSpend: entries.length
        ? Math.round(totalSpent / entries.length)
        : 0
    };
  }

  function buildSnapshot(force = false) {
    if (
      !force &&
      runtime.cache &&
      runtime.cacheRevision === runtime.revision
    ) {
      return clone(runtime.cache);
    }

    const entries = getArchiveEntries();
    const snapshot = {
      version: VERSION,
      generatedAt: nowISO(),
      entries,
      byYear: groupByYear(entries),
      byCountry: groupByCountry(entries),
      stats: calculateStats(entries),
      revision: runtime.revision
    };

    runtime.cache = snapshot;
    runtime.cacheRevision = runtime.revision;

    dispatch(EVENT.SNAPSHOT, {
      snapshot
    });

    return clone(snapshot);
  }

  function getById(id) {
    const record = ensureEngine().getById?.(id);

    if (!record || record.status !== 'completed') {
      return null;
    }

    return buildArchiveEntry(record);
  }

  function updateCompletedRecord(id, patch, reason) {
    const engine = ensureEngine();
    const current = engine.getById(id);

    if (!current || current.status !== 'completed') {
      throw new Error('Completed passport record not found.');
    }

    const updated = engine.update(
      id,
      patch,
      {
        reason: reason || 'passport-update'
      }
    );

    runtime.revision += 1;
    runtime.cache = null;

    dispatch(EVENT.ARCHIVE_UPDATED, {
      recordId: id,
      record: buildArchiveEntry(updated)
    });

    dispatch(EVENT.CHANGE, {
      reason: reason || 'passport-update',
      recordId: id
    });

    return buildArchiveEntry(updated);
  }

  function addMemory(id, memory) {
    const current = ensureEngine().getById(id);

    if (!current || current.status !== 'completed') {
      throw new Error('Completed passport record not found.');
    }

    const item = {
      id:
        asString(memory?.id) ||
        `memory_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      title: asString(memory?.title),
      text:
        asString(memory?.text) ||
        asString(memory?.description),
      date:
        asString(memory?.date) ||
        asString(current.dates?.endDate),
      placeId: asString(memory?.placeId),
      photoIds: clone(asArray(memory?.photoIds)),
      tags: clone(asArray(memory?.tags)),
      createdAt:
        asString(memory?.createdAt) ||
        nowISO(),
      updatedAt: nowISO()
    };

    const memories = [
      ...asArray(current.memories),
      item
    ];

    const updated = updateCompletedRecord(
      id,
      { memories },
      'passport-memory-added'
    );

    dispatch(EVENT.MEMORY_ADDED, {
      recordId: id,
      memory: item
    });

    return updated;
  }

  function updateMemory(id, memoryId, patch) {
    const current = ensureEngine().getById(id);

    if (!current || current.status !== 'completed') {
      throw new Error('Completed passport record not found.');
    }

    const memories = asArray(current.memories).map(
      (memory) =>
        memory.id === memoryId
          ? {
              ...memory,
              ...clone(patch),
              updatedAt: nowISO()
            }
          : memory
    );

    return updateCompletedRecord(
      id,
      { memories },
      'passport-memory-updated'
    );
  }

  function removeMemory(id, memoryId) {
    const current = ensureEngine().getById(id);

    if (!current || current.status !== 'completed') {
      throw new Error('Completed passport record not found.');
    }

    const memories = asArray(current.memories).filter(
      (memory) => memory.id !== memoryId
    );

    return updateCompletedRecord(
      id,
      { memories },
      'passport-memory-removed'
    );
  }

  function setRating(id, rating, review = '') {
    const normalized = Math.min(
      5,
      Math.max(0, Number(rating) || 0)
    );

    const updated = updateCompletedRecord(
      id,
      {
        rating: normalized,
        review: asString(review),
        ratedAt: nowISO()
      },
      'passport-rating-changed'
    );

    dispatch(EVENT.RATING_CHANGED, {
      recordId: id,
      rating: normalized,
      review: asString(review)
    });

    return updated;
  }

  function updateNotes(id, notes) {
    return updateCompletedRecord(
      id,
      {
        notes: asString(notes),
        notesUpdatedAt: nowISO()
      },
      'passport-notes-updated'
    );
  }

  function addPhoto(id, photo) {
    const current = ensureEngine().getById(id);

    if (!current || current.status !== 'completed') {
      throw new Error('Completed passport record not found.');
    }

    const item = {
      id:
        asString(photo?.id) ||
        `photo_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      url: asString(photo?.url),
      thumbnail: asString(photo?.thumbnail),
      caption: asString(photo?.caption),
      dayId: asString(photo?.dayId),
      placeId: asString(photo?.placeId),
      takenAt:
        asString(photo?.takenAt) ||
        asString(current.dates?.endDate),
      createdAt:
        asString(photo?.createdAt) ||
        nowISO()
    };

    return updateCompletedRecord(
      id,
      {
        photos: [
          ...asArray(current.photos),
          item
        ]
      },
      'passport-photo-added'
    );
  }

  function removePhoto(id, photoId) {
    const current = ensureEngine().getById(id);

    if (!current || current.status !== 'completed') {
      throw new Error('Completed passport record not found.');
    }

    return updateCompletedRecord(
      id,
      {
        photos: asArray(current.photos).filter(
          (photo) => photo.id !== photoId
        )
      },
      'passport-photo-removed'
    );
  }

  function search(query, options = {}) {
    const text = asString(query).toLowerCase();
    const year = Number(options.year) || null;

    return getArchiveEntries().filter((entry) => {
      if (year && entry.year !== year) {
        return false;
      }

      if (!text) {
        return true;
      }

      const searchable = [
        entry.name,
        entry.city,
        entry.countryCode,
        entry.summary,
        entry.notes,
        ...entry.places.visitedItems.map(
          (place) => place.name
        ),
        ...entry.hotels.map(
          (hotel) => hotel.name
        ),
        ...entry.memories.flatMap(
          (memory) => [
            memory.title,
            memory.text
          ]
        )
      ];

      return searchable.some((value) =>
        asString(value).toLowerCase().includes(text)
      );
    });
  }

  function exportArchive(options = {}) {
    const snapshot = buildSnapshot(true);

    const payload = {
      schema: 'tic-country-passport',
      version: VERSION,
      exportedAt: nowISO(),
      stats: snapshot.stats,
      entries: options.includeRaw === false
        ? snapshot.entries.map((entry) => {
            const copy = clone(entry);
            delete copy.raw;
            return copy;
          })
        : snapshot.entries
    };

    return JSON.stringify(
      payload,
      null,
      options.pretty === false ? 0 : 2
    );
  }

  function getTimeline() {
    return getArchiveEntries()
      .map((entry) => ({
        id: entry.id,
        date:
          entry.dates?.endDate ||
          entry.completedAt ||
          '',
        year: entry.year,
        name: entry.name,
        city: entry.city,
        countryCode: entry.countryCode,
        cover: entry.cover,
        rating: entry.rating,
        duration: entry.duration
      }))
      .sort((a, b) => {
        const aDate = parseDate(a.date) || new Date(0);
        const bDate = parseDate(b.date) || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });
  }

  function invalidate(reason = 'external-change') {
    runtime.revision += 1;
    runtime.cache = null;

    dispatch(EVENT.CHANGE, {
      reason,
      revision: runtime.revision
    });

    return buildSnapshot(true);
  }

  function bindEngineEvents() {
    const handler = () => {
      if (!runtime.destroyed) {
        invalidate('country-lifecycle-change');
      }
    };

    [
      'tic:country-lifecycle:change',
      'tic:country-lifecycle:transition'
    ].forEach((eventName) => {
      global.addEventListener(eventName, handler, {
        passive: true
      });

      runtime.listeners.push(() => {
        global.removeEventListener(eventName, handler);
      });
    });
  }

  function init() {
    if (runtime.initialized && !runtime.destroyed) {
      return api;
    }

    runtime.initialized = true;
    runtime.destroyed = false;

    ensureEngine();
    bindEngineEvents();
    buildSnapshot(true);

    dispatch(EVENT.READY, {
      snapshot: buildSnapshot()
    });

    return api;
  }

  function destroy() {
    if (runtime.destroyed) {
      return;
    }

    runtime.destroyed = true;
    runtime.initialized = false;

    for (const cleanup of runtime.listeners.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // Continue cleanup.
      }
    }

    runtime.cache = null;
  }

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,

    EVENT,

    init,
    destroy,
    invalidate,

    getCompletedRecords,
    getArchiveEntries,
    getById,
    buildArchiveEntry,
    buildSnapshot,
    groupByYear,
    groupByCountry,
    calculateStats,
    getTimeline,
    search,

    addMemory,
    updateMemory,
    removeMemory,
    setRating,
    updateNotes,
    addPhoto,
    removePhoto,

    exportArchive
  });

  global.PassportEngine = api;

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
