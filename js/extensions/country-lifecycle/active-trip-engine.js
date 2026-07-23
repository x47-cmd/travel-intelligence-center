/* =========================================================
   Travel Intelligence Center
   Active Trip Engine V1.0.0
   Country Lifecycle System - Live Trip Execution Engine

   File Path:
   js/extensions/country-lifecycle/active-trip-engine.js

   Purpose:
   - Powers active-trip execution without modifying frozen files.
   - Detects the current trip day automatically.
   - Shows only today’s itinerary during active travel.
   - Tracks visited, skipped and pending places.
   - Calculates day and trip progress.
   - Suggests the next pending place.
   - Stores arrival, completion and skip timestamps.
   - Saves daily achievements and completion summaries.
   - Supports safe auto-activation and completion readiness.
   - Integrates with CountryLifecycleEngine and Controller.
   ========================================================= */

(function activeTripEngineBootstrap(global) {
  'use strict';

  if (!global || global.ActiveTripEngine?.__initialized) {
    return;
  }

  const VERSION = '1.0.0';

  const EVENT = Object.freeze({
    READY: 'tic:active-trip:ready',
    CHANGE: 'tic:active-trip:change',
    DAY_CHANGE: 'tic:active-trip:day-change',
    PLACE_CHANGE: 'tic:active-trip:place-change',
    ACHIEVEMENT: 'tic:active-trip:achievement',
    AUTO_ACTIVATE: 'tic:active-trip:auto-activate',
    COMPLETION_READY: 'tic:active-trip:completion-ready'
  });

  const PLACE_STATUS = Object.freeze({
    PENDING: 'pending',
    VISITED: 'visited',
    SKIPPED: 'skipped'
  });

  const runtime = {
    initialized: false,
    destroyed: false,
    timer: 0,
    listeners: [],
    currentTripId: '',
    currentDayId: '',
    lastDateKey: '',
    revision: 0
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function asString(value, fallback = '') {
    if (value === null || value === undefined) {
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

  function dateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function parseDateOnly(value) {
    const text = asString(value);

    if (!text) {
      return null;
    }

    const date = new Date(`${text}T12:00:00`);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function differenceInCalendarDays(from, to) {
    const start = parseDateOnly(from);
    const end = parseDateOnly(to);

    if (!start || !end) {
      return null;
    }

    const utcStart = Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate()
    );

    const utcEnd = Date.UTC(
      end.getFullYear(),
      end.getMonth(),
      end.getDate()
    );

    return Math.floor((utcEnd - utcStart) / 86400000);
  }

  function getCurrentActiveTrip() {
    const engine = ensureEngine();

    return (
      engine.getCurrentActive?.() ||
      engine.getByStatus?.('active')?.[0] ||
      null
    );
  }

  function getDays(record) {
    return asArray(
      record?.itinerary?.days ||
      record?.days
    );
  }

  function getCurrentDayIndex(record, today = new Date()) {
    const model = getModel();

    if (model?.getCurrentDay) {
      const currentDay = model.getCurrentDay(record, today);

      if (currentDay) {
        const index = getDays(record).findIndex(
          (day) => day.id === currentDay.id
        );

        if (index >= 0) {
          return index;
        }
      }
    }

    const startDate =
      record?.dates?.startDate ||
      record?.trip?.startDate;

    if (!startDate) {
      return 0;
    }

    const offset = differenceInCalendarDays(
      startDate,
      dateKey(today)
    );

    if (offset === null) {
      return 0;
    }

    const days = getDays(record);

    if (!days.length) {
      return 0;
    }

    return Math.min(
      Math.max(offset, 0),
      days.length - 1
    );
  }

  function getCurrentDay(record, today = new Date()) {
    const days = getDays(record);

    if (!days.length) {
      return null;
    }

    return days[getCurrentDayIndex(record, today)] || null;
  }

  function getDayProgress(day) {
    const places = asArray(day?.places);
    const visited = places.filter(
      (place) => place.status === PLACE_STATUS.VISITED
    ).length;
    const skipped = places.filter(
      (place) => place.status === PLACE_STATUS.SKIPPED
    ).length;
    const pending = places.filter(
      (place) =>
        !place.status ||
        place.status === PLACE_STATUS.PENDING
    ).length;
    const handled = visited + skipped;
    const total = places.length;
    const percentage = total
      ? Math.round((handled / total) * 100)
      : 0;

    return {
      total,
      visited,
      skipped,
      pending,
      handled,
      percentage,
      complete: total > 0 && pending === 0
    };
  }

  function getTripProgress(record) {
    const model = getModel();

    if (model?.calculateTripProgress) {
      return model.calculateTripProgress(record);
    }

    const places = getDays(record).flatMap(
      (day) => asArray(day.places)
    );

    const visited = places.filter(
      (place) => place.status === PLACE_STATUS.VISITED
    ).length;
    const skipped = places.filter(
      (place) => place.status === PLACE_STATUS.SKIPPED
    ).length;
    const pending = places.filter(
      (place) =>
        !place.status ||
        place.status === PLACE_STATUS.PENDING
    ).length;
    const handled = visited + skipped;
    const total = places.length;

    return {
      total,
      visited,
      skipped,
      pending,
      handled,
      percentage: total
        ? Math.round((handled / total) * 100)
        : 0,
      complete: total > 0 && pending === 0
    };
  }

  function getNextPendingPlace(record, day = null) {
    const targetDay = day || getCurrentDay(record);

    if (!targetDay) {
      return null;
    }

    return (
      asArray(targetDay.places).find(
        (place) =>
          !place.status ||
          place.status === PLACE_STATUS.PENDING
      ) || null
    );
  }

  function getPreviousVisitedPlace(record, day = null) {
    const targetDay = day || getCurrentDay(record);

    if (!targetDay) {
      return null;
    }

    return (
      [...asArray(targetDay.places)]
        .reverse()
        .find(
          (place) =>
            place.status === PLACE_STATUS.VISITED
        ) || null
    );
  }

  function calculateDistanceHint(place) {
    const distance =
      Number(place?.distanceKm) ||
      Number(place?.distanceFromPreviousKm) ||
      0;

    const minutes =
      Number(place?.travelTimeMinutes) ||
      Number(place?.durationToReachMinutes) ||
      0;

    return {
      distanceKm: distance,
      travelTimeMinutes: minutes,
      label:
        distance || minutes
          ? [
              distance ? `${distance} كم` : '',
              minutes ? `${minutes} دقيقة` : ''
            ].filter(Boolean).join(' • ')
          : ''
    };
  }

  function getLiveSnapshot(record = getCurrentActiveTrip()) {
    if (!record) {
      return null;
    }

    const dayIndex = getCurrentDayIndex(record);
    const day = getCurrentDay(record);
    const nextPlace = getNextPendingPlace(record, day);

    return clone({
      recordId: record.id,
      country: {
        id: record.id,
        name: record.localizedName || record.name,
        countryCode: record.countryCode,
        status: record.status,
        cover: record.cover
      },
      dayIndex,
      dayNumber: dayIndex + 1,
      day,
      dayProgress: getDayProgress(day),
      tripProgress: getTripProgress(record),
      nextPlace,
      nextPlaceTravel: calculateDistanceHint(nextPlace),
      previousPlace: getPreviousVisitedPlace(record, day),
      dates: clone(record.dates),
      generatedAt: nowISO()
    });
  }

  function updateRecord(recordId, updater, reason) {
    const engine = ensureEngine();
    const current = engine.getById(recordId);

    if (!current) {
      throw new Error('Active trip record not found.');
    }

    const draft = clone(current);
    const updated = updater(draft) || draft;

    return engine.update(recordId, updated, {
      reason: reason || 'active-trip-update',
      replace: true
    });
  }

  function findDayAndPlace(record, dayId, placeId) {
    const days = getDays(record);
    const dayIndex = days.findIndex(
      (day) => day.id === dayId
    );

    if (dayIndex < 0) {
      throw new Error('Trip day not found.');
    }

    const placeIndex = asArray(days[dayIndex].places)
      .findIndex((place) => place.id === placeId);

    if (placeIndex < 0) {
      throw new Error('Trip place not found.');
    }

    return {
      days,
      dayIndex,
      placeIndex,
      day: days[dayIndex],
      place: days[dayIndex].places[placeIndex]
    };
  }

  function writeAchievement(record, achievement) {
    record.trip = record.trip || {};
    record.trip.achievements = asArray(
      record.trip.achievements
    );

    record.trip.achievements.push({
      id:
        achievement.id ||
        `achievement_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      type: achievement.type || 'progress',
      title: achievement.title || '',
      description: achievement.description || '',
      dayId: achievement.dayId || '',
      placeId: achievement.placeId || '',
      createdAt: achievement.createdAt || nowISO(),
      metadata: clone(achievement.metadata || {})
    });

    dispatch(EVENT.ACHIEVEMENT, {
      recordId: record.id,
      achievement:
        record.trip.achievements[
          record.trip.achievements.length - 1
        ]
    });
  }

  function markVisited(recordId, dayId, placeId, metadata = {}) {
    const engine = ensureEngine();

    if (engine.markPlaceVisited) {
      const result = engine.markPlaceVisited(
        recordId,
        dayId,
        placeId,
        metadata
      );

      dispatch(EVENT.PLACE_CHANGE, {
        recordId,
        dayId,
        placeId,
        status: PLACE_STATUS.VISITED
      });

      evaluateDayCompletion(recordId, dayId);
      return result;
    }

    return updateRecord(
      recordId,
      (record) => {
        const match = findDayAndPlace(
          record,
          dayId,
          placeId
        );

        const place =
          record.itinerary.days[match.dayIndex]
            .places[match.placeIndex];

        place.status = PLACE_STATUS.VISITED;
        place.arrivedAt =
          metadata.arrivedAt ||
          place.arrivedAt ||
          nowISO();
        place.completedAt =
          metadata.completedAt ||
          nowISO();
        place.skippedAt = '';
        place.updatedAt = nowISO();
        place.notes = metadata.notes || place.notes || '';

        writeAchievement(record, {
          type: 'place-visited',
          title: `تمت زيارة ${place.name}`,
          dayId,
          placeId,
          metadata
        });

        return record;
      },
      'active-trip-place-visited'
    );
  }

  function markSkipped(recordId, dayId, placeId, metadata = {}) {
    const engine = ensureEngine();

    if (engine.skipPlace) {
      const result = engine.skipPlace(
        recordId,
        dayId,
        placeId,
        metadata
      );

      dispatch(EVENT.PLACE_CHANGE, {
        recordId,
        dayId,
        placeId,
        status: PLACE_STATUS.SKIPPED
      });

      evaluateDayCompletion(recordId, dayId);
      return result;
    }

    return updateRecord(
      recordId,
      (record) => {
        const match = findDayAndPlace(
          record,
          dayId,
          placeId
        );

        const place =
          record.itinerary.days[match.dayIndex]
            .places[match.placeIndex];

        place.status = PLACE_STATUS.SKIPPED;
        place.skippedAt =
          metadata.skippedAt ||
          nowISO();
        place.completedAt = '';
        place.updatedAt = nowISO();
        place.skipReason =
          metadata.reason ||
          metadata.skipReason ||
          '';

        writeAchievement(record, {
          type: 'place-skipped',
          title: `تم تخطي ${place.name}`,
          dayId,
          placeId,
          metadata
        });

        return record;
      },
      'active-trip-place-skipped'
    );
  }

  function resetPlace(recordId, dayId, placeId) {
    const engine = ensureEngine();

    if (engine.resetPlace) {
      const result = engine.resetPlace(
        recordId,
        dayId,
        placeId
      );

      dispatch(EVENT.PLACE_CHANGE, {
        recordId,
        dayId,
        placeId,
        status: PLACE_STATUS.PENDING
      });

      return result;
    }

    return updateRecord(
      recordId,
      (record) => {
        const match = findDayAndPlace(
          record,
          dayId,
          placeId
        );

        const place =
          record.itinerary.days[match.dayIndex]
            .places[match.placeIndex];

        place.status = PLACE_STATUS.PENDING;
        place.arrivedAt = '';
        place.completedAt = '';
        place.skippedAt = '';
        place.skipReason = '';
        place.updatedAt = nowISO();

        return record;
      },
      'active-trip-place-reset'
    );
  }

  function markArrived(recordId, dayId, placeId, metadata = {}) {
    return updateRecord(
      recordId,
      (record) => {
        const match = findDayAndPlace(
          record,
          dayId,
          placeId
        );

        const place =
          record.itinerary.days[match.dayIndex]
            .places[match.placeIndex];

        place.arrivedAt =
          metadata.arrivedAt ||
          nowISO();
        place.arrivalLocation =
          clone(metadata.location || null);
        place.updatedAt = nowISO();

        writeAchievement(record, {
          type: 'place-arrival',
          title: `تم الوصول إلى ${place.name}`,
          dayId,
          placeId,
          metadata
        });

        return record;
      },
      'active-trip-place-arrival'
    );
  }

  function evaluateDayCompletion(recordId, dayId) {
    const engine = ensureEngine();
    const record = engine.getById(recordId);

    if (!record) {
      return null;
    }

    const day = getDays(record).find(
      (item) => item.id === dayId
    );

    if (!day) {
      return null;
    }

    const progress = getDayProgress(day);

    if (!progress.complete || day.completed) {
      return progress;
    }

    const updated = updateRecord(
      recordId,
      (draft) => {
        const target = getDays(draft).find(
          (item) => item.id === dayId
        );

        if (!target) {
          return draft;
        }

        target.completed = true;
        target.completedAt = nowISO();
        target.summary = {
          visited: progress.visited,
          skipped: progress.skipped,
          total: progress.total
        };

        writeAchievement(draft, {
          type: 'day-completed',
          title: `اكتمل ${target.title || 'اليوم'}`,
          dayId,
          metadata: clone(progress)
        });

        return draft;
      },
      'active-trip-day-completed'
    );

    dispatch(EVENT.DAY_CHANGE, {
      recordId,
      dayId,
      progress,
      completed: true
    });

    evaluateTripCompletion(recordId);
    return updated;
  }

  function evaluateTripCompletion(recordId) {
    const record = ensureEngine().getById(recordId);

    if (!record) {
      return null;
    }

    const progress = getTripProgress(record);
    const endDate =
      record.dates?.endDate ||
      record.trip?.endDate;

    const dateEnded =
      endDate &&
      differenceInCalendarDays(
        endDate,
        dateKey()
      ) >= 0;

    const ready =
      progress.complete ||
      Boolean(dateEnded);

    if (ready) {
      dispatch(EVENT.COMPLETION_READY, {
        recordId,
        progress,
        dateEnded: Boolean(dateEnded)
      });
    }

    return {
      ready,
      progress,
      dateEnded: Boolean(dateEnded)
    };
  }

  function autoActivateTrips() {
    const engine = ensureEngine();
    const today = dateKey();

    const upcoming = asArray(
      engine.getByStatus?.('upcoming')
    );

    const activated = [];

    for (const record of upcoming) {
      const startDate =
        record.dates?.startDate ||
        record.trip?.startDate;

      if (!startDate) {
        continue;
      }

      const offset = differenceInCalendarDays(
        startDate,
        today
      );

      if (offset !== null && offset >= 0) {
        try {
          const updated = engine.activate(record.id, {
            automatic: true,
            activatedAt: nowISO()
          });

          activated.push(updated);

          dispatch(EVENT.AUTO_ACTIVATE, {
            recordId: record.id,
            automatic: true
          });
        } catch (_) {
          // Skip invalid transitions safely.
        }
      }
    }

    return activated;
  }

  function synchronize() {
    autoActivateTrips();

    const active = getCurrentActiveTrip();

    if (!active) {
      runtime.currentTripId = '';
      runtime.currentDayId = '';
      return null;
    }

    const currentDay = getCurrentDay(active);
    const currentDateKey = dateKey();

    const tripChanged =
      runtime.currentTripId !== active.id;

    const dayChanged =
      runtime.currentDayId !== (currentDay?.id || '');

    runtime.currentTripId = active.id;
    runtime.currentDayId = currentDay?.id || '';
    runtime.lastDateKey = currentDateKey;
    runtime.revision += 1;

    if (tripChanged || dayChanged) {
      dispatch(EVENT.DAY_CHANGE, {
        recordId: active.id,
        dayId: currentDay?.id || '',
        snapshot: getLiveSnapshot(active)
      });
    }

    evaluateTripCompletion(active.id);

    dispatch(EVENT.CHANGE, {
      reason: 'synchronize',
      snapshot: getLiveSnapshot(active),
      revision: runtime.revision
    });

    return active;
  }

  function startTimer() {
    stopTimer();

    runtime.timer = global.setInterval(() => {
      if (runtime.destroyed) {
        return;
      }

      const currentDateKey = dateKey();

      if (runtime.lastDateKey !== currentDateKey) {
        synchronize();
      }
    }, 60000);
  }

  function stopTimer() {
    if (runtime.timer) {
      global.clearInterval(runtime.timer);
      runtime.timer = 0;
    }
  }

  function bindEngineEvents() {
    const handler = () => {
      if (!runtime.destroyed) {
        synchronize();
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
    synchronize();
    startTimer();

    dispatch(EVENT.READY, {
      snapshot: getLiveSnapshot()
    });

    return api;
  }

  function destroy() {
    if (runtime.destroyed) {
      return;
    }

    runtime.destroyed = true;
    runtime.initialized = false;

    stopTimer();

    for (const cleanup of runtime.listeners.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // Continue cleanup.
      }
    }
  }

  const api = Object.freeze({
    __initialized: true,
    version: VERSION,

    EVENT,
    PLACE_STATUS,

    init,
    destroy,
    synchronize,

    getCurrentActiveTrip,
    getCurrentDayIndex,
    getCurrentDay,
    getDayProgress,
    getTripProgress,
    getNextPendingPlace,
    getPreviousVisitedPlace,
    getLiveSnapshot,
    calculateDistanceHint,

    markArrived,
    markVisited,
    markSkipped,
    resetPlace,
    evaluateDayCompletion,
    evaluateTripCompletion,
    autoActivateTrips
  });

  global.ActiveTripEngine = api;

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
