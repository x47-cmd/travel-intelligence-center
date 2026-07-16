/* =========================================================
   Travel Intelligence Center
   Planned Trip Engine V1.0.0

   File Path:
   js/features/planned-trip-engine.js

   Purpose:
   - Creates and manages Planned Trips.
   - Keeps Planned Trips separate from Active Trips.
   - Creates and updates the planning checklist.
   - Calculates readiness percentage.
   - Validates conversion requirements.
   - Converts a Planned Trip into an Active Trip.
   - Restores an Active Trip back to Planned when needed.
   - Preserves all trip data during conversion.
   - Prevents duplicate conversions.
   - Does not render UI.
   - Does not write directly to the Store.

   Global API:
   window.PlannedTripEngine

   Required Conversion Items:
   - destinationApproved
   - budgetApproved
   - flightBooked
   - hotelBooked

   Optional Readiness Items:
   - insuranceReady
   - visaReady
   - documentsReady
   - activitiesPlanned
   - packingReady

   Version:
   1.0.0
   ========================================================= */

(function (window) {
  "use strict";

  const ENGINE_NAME = "PlannedTripEngine";
  const ENGINE_VERSION = "1.0.0";
  const DEFAULT_CURRENCY = "AED";
  const DEFAULT_DURATION_DAYS = 5;
  const DEFAULT_TRAVELERS = 1;

  const REQUIRED_ITEMS = Object.freeze([
    "destinationApproved",
    "budgetApproved",
    "flightBooked",
    "hotelBooked"
  ]);

  const OPTIONAL_ITEMS = Object.freeze([
    "insuranceReady",
    "visaReady",
    "documentsReady",
    "activitiesPlanned",
    "packingReady"
  ]);

  const ALL_ITEMS = Object.freeze([
    ...REQUIRED_ITEMS,
    ...OPTIONAL_ITEMS
  ]);

  const CHECKLIST_LABELS = Object.freeze({
    destinationApproved: "اعتماد الوجهة",
    budgetApproved: "اعتماد الميزانية",
    flightBooked: "شراء تذاكر الطيران",
    hotelBooked: "حجز الفندق",
    insuranceReady: "تجهيز التأمين",
    visaReady: "تجهيز التأشيرة",
    documentsReady: "تجهيز المستندات",
    activitiesPlanned: "تخطيط الأنشطة",
    packingReady: "تجهيز الشنطة"
  });

  const listeners = new Set();

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function asMoney(value) {
    return Math.max(0, Math.round(asNumber(value, 0)));
  }

  function asText(value, fallback = "") {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : fallback;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.freeze(value);

    Object.keys(value).forEach((key) => {
      deepFreeze(value[key]);
    });

    return value;
  }

  function emit(eventName, payload) {
    listeners.forEach((listener) => {
      if (listener.eventName !== eventName && listener.eventName !== "*") {
        return;
      }

      try {
        listener.handler(payload, eventName);
      } catch (error) {
        console.error(`[${ENGINE_NAME}] Listener failed:`, error);
      }
    });

    try {
      window.dispatchEvent(
        new CustomEvent(`travel:${eventName}`, {
          detail: payload
        })
      );
    } catch (_) {}
  }

  function on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return function unsubscribeNoop() {};
    }

    const listener = {
      eventName,
      handler
    };

    listeners.add(listener);

    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function createChecklist(input = {}) {
    const checklist = isObject(input.checklist)
      ? input.checklist
      : {};

    return {
      destinationApproved:
        checklist.destinationApproved !== undefined
          ? checklist.destinationApproved === true
          : true,

      budgetApproved:
        checklist.budgetApproved !== undefined
          ? checklist.budgetApproved === true
          : asMoney(input.estimatedBudget) > 0,

      flightBooked:
        checklist.flightBooked === true,

      hotelBooked:
        checklist.hotelBooked === true,

      insuranceReady:
        checklist.insuranceReady === true,

      visaReady:
        checklist.visaReady === true,

      documentsReady:
        checklist.documentsReady === true,

      activitiesPlanned:
        checklist.activitiesPlanned === true,

      packingReady:
        checklist.packingReady === true
    };
  }

  function calculateReadiness(trip = {}) {
    const checklist = isObject(trip.checklist)
      ? trip.checklist
      : createChecklist(trip);

    const requiredCompleted = REQUIRED_ITEMS.filter(
      (item) => checklist[item] === true
    ).length;

    const optionalCompleted = OPTIONAL_ITEMS.filter(
      (item) => checklist[item] === true
    ).length;

    const requiredWeight = 80;
    const optionalWeight = 20;

    const requiredPercentage =
      requiredCompleted / REQUIRED_ITEMS.length * requiredWeight;

    const optionalPercentage =
      optionalCompleted / OPTIONAL_ITEMS.length * optionalWeight;

    const percentage = Math.round(
      requiredPercentage + optionalPercentage
    );

    const readyForConversion =
      REQUIRED_ITEMS.every(
        (item) => checklist[item] === true
      );

    return deepFreeze({
      percentage,
      requiredCompleted,
      requiredTotal: REQUIRED_ITEMS.length,
      optionalCompleted,
      optionalTotal: OPTIONAL_ITEMS.length,
      readyForConversion,
      missingRequiredItems:
        REQUIRED_ITEMS.filter(
          (item) => checklist[item] !== true
        ),
      completedItems:
        ALL_ITEMS.filter(
          (item) => checklist[item] === true
        )
    });
  }

  function normalizeTrip(input = {}) {
    const checklist = createChecklist(input);

    const trip = {
      id:
        asText(input.id) ||
        createId("planned_trip"),

      type: "planned",

      status:
        input.status === "archived"
          ? "archived"
          : "planned",

      title:
        asText(input.title) ||
        [input.city, input.country]
          .filter(Boolean)
          .join("، ") ||
        "رحلة مخطط لها",

      destinationId:
        asText(input.destinationId),

      country:
        asText(input.country),

      countryCode:
        asText(input.countryCode),

      city:
        asText(input.city),

      startDate:
        asText(input.startDate),

      endDate:
        asText(input.endDate),

      suggestedMonth:
        input.suggestedMonth !== undefined &&
        input.suggestedMonth !== null
          ? Number(input.suggestedMonth)
          : null,

      durationDays:
        Math.max(
          1,
          Math.round(
            asNumber(
              input.durationDays,
              DEFAULT_DURATION_DAYS
            )
          )
        ),

      travelers:
        Math.max(
          1,
          Math.round(
            asNumber(
              input.travelers,
              DEFAULT_TRAVELERS
            )
          )
        ),

      estimatedBudget:
        asMoney(input.estimatedBudget),

      currency:
        asText(
          input.currency,
          DEFAULT_CURRENCY
        ),

      sourceRecommendationId:
        asText(input.sourceRecommendationId),

      source:
        isObject(input.source)
          ? { ...input.source }
          : {},

      costBreakdown:
        isObject(input.costBreakdown)
          ? { ...input.costBreakdown }
          : {},

      highlights:
        asArray(input.highlights).slice(),

      checklist,

      readiness: null,

      notes:
        asText(input.notes),

      booking: {
        flightReference:
          asText(
            input.booking &&
            input.booking.flightReference
          ),

        hotelReference:
          asText(
            input.booking &&
            input.booking.hotelReference
          )
      },

      archived:
        input.archived === true,

      createdAt:
        asText(
          input.createdAt,
          nowISO()
        ),

      updatedAt:
        nowISO(),

      convertedAt:
        null,

      restoredAt:
        null
    };

    trip.readiness =
      calculateReadiness(trip);

    return trip;
  }

  function create(input = {}) {
    const trip = deepFreeze(
      normalizeTrip(
        isObject(input)
          ? input
          : {}
      )
    );

    emit("planned-trip-created", trip);
    return trip;
  }

  function update(trip, patch = {}) {
    if (!isObject(trip)) {
      throw new TypeError(
        `[${ENGINE_NAME}] A valid planned trip is required.`
      );
    }

    const safePatch =
      isObject(patch)
        ? patch
        : {};

    const updated = {
      ...trip,
      ...safePatch,

      type:
        trip.type === "active"
          ? "active"
          : "planned",

      checklist: {
        ...(isObject(trip.checklist)
          ? trip.checklist
          : createChecklist(trip)),

        ...(isObject(safePatch.checklist)
          ? safePatch.checklist
          : {})
      },

      booking: {
        ...(isObject(trip.booking)
          ? trip.booking
          : {}),

        ...(isObject(safePatch.booking)
          ? safePatch.booking
          : {})
      },

      costBreakdown: {
        ...(isObject(trip.costBreakdown)
          ? trip.costBreakdown
          : {}),

        ...(isObject(safePatch.costBreakdown)
          ? safePatch.costBreakdown
          : {})
      },

      source: {
        ...(isObject(trip.source)
          ? trip.source
          : {}),

        ...(isObject(safePatch.source)
          ? safePatch.source
          : {})
      },

      highlights:
        safePatch.highlights !== undefined
          ? asArray(safePatch.highlights).slice()
          : asArray(trip.highlights).slice(),

      updatedAt:
        nowISO()
    };

    updated.readiness =
      calculateReadiness(updated);

    const result =
      deepFreeze(updated);

    emit("planned-trip-updated", result);
    return result;
  }

  function completeItem(trip, item, completed = true) {
    if (!ALL_ITEMS.includes(item)) {
      throw new Error(
        `[${ENGINE_NAME}] Unknown checklist item: ${item}`
      );
    }

    const result = update(
      trip,
      {
        checklist: {
          [item]:
            completed === true
        }
      }
    );

    emit("planned-trip-checklist-updated", {
      trip: result,
      item,
      completed:
        completed === true
    });

    return result;
  }

  function completeItems(trip, items = []) {
    if (!Array.isArray(items)) {
      return trip;
    }

    const patch = {};

    items.forEach((item) => {
      if (ALL_ITEMS.includes(item)) {
        patch[item] = true;
      }
    });

    return update(
      trip,
      {
        checklist: patch
      }
    );
  }

  function resetItem(trip, item) {
    return completeItem(
      trip,
      item,
      false
    );
  }

  function validate(trip) {
    if (!isObject(trip)) {
      return deepFreeze({
        valid: false,
        errors: ["INVALID_TRIP"],
        missingRequiredItems:
          REQUIRED_ITEMS.slice(),
        readiness: null
      });
    }

    const errors = [];

    if (!asText(trip.id)) {
      errors.push("MISSING_ID");
    }

    if (!asText(trip.title)) {
      errors.push("MISSING_TITLE");
    }

    if (
      trip.status === "active" ||
      trip.type === "active"
    ) {
      errors.push("ALREADY_ACTIVE");
    }

    if (trip.convertedAt) {
      errors.push("ALREADY_CONVERTED");
    }

    if (trip.archived === true) {
      errors.push("TRIP_ARCHIVED");
    }

    const readiness =
      calculateReadiness(trip);

    return deepFreeze({
      valid:
        errors.length === 0 &&
        readiness.readyForConversion,
      errors,
      missingRequiredItems:
        readiness.missingRequiredItems,
      readiness
    });
  }

  function canConvert(trip) {
    return validate(trip).valid;
  }

  function convert(trip, options = {}) {
    const validation =
      validate(trip);

    if (!validation.valid) {
      const blocked = deepFreeze({
        success: false,
        status: "blocked",
        reason: "REQUIREMENTS_NOT_MET",
        validation,
        activeTrip: null
      });

      emit("planned-trip-conversion-blocked", blocked);
      return blocked;
    }

    const convertedAt =
      nowISO();

    const activeTrip =
      deepFreeze({
        ...trip,

        id:
          asText(options.activeTripId) ||
          trip.id,

        type:
          "active",

        status:
          "active",

        plannedTripId:
          trip.id,

        convertedAt,

        updatedAt:
          convertedAt,

        archived:
          false,

        readiness: {
          ...validation.readiness,
          percentage: 100,
          readyForConversion: true
        },

        booking: {
          ...(isObject(trip.booking)
            ? trip.booking
            : {}),

          flightBooked:
            true,

          hotelBooked:
            true,

          flightReference:
            asText(
              options.flightReference ||
              (
                trip.booking &&
                trip.booking.flightReference
              )
            ),

          hotelReference:
            asText(
              options.hotelReference ||
              (
                trip.booking &&
                trip.booking.hotelReference
              )
            )
        },

        lifecycle: {
          createdAs:
            "planned",

          convertedFromPlanned:
            true,

          convertedAt
        }
      });

    const result =
      deepFreeze({
        success:
          true,

        status:
          "active",

        convertedAt,

        readiness:
          100,

        activeTrip
      });

    emit("planned-trip-converted", result);
    return result;
  }

  function restore(activeTrip) {
    if (!isObject(activeTrip)) {
      throw new TypeError(
        `[${ENGINE_NAME}] A valid active trip is required.`
      );
    }

    const restoredAt =
      nowISO();

    const restored = {
      ...activeTrip,

      type:
        "planned",

      status:
        "planned",

      convertedAt:
        null,

      restoredAt,

      updatedAt:
        restoredAt,

      archived:
        false,

      lifecycle: {
        ...(isObject(activeTrip.lifecycle)
          ? activeTrip.lifecycle
          : {}),

        restoredToPlanned:
          true,

        restoredAt
      }
    };

    restored.readiness =
      calculateReadiness(restored);

    const result =
      deepFreeze(restored);

    emit("active-trip-restored-to-planned", result);
    return result;
  }

  function archive(trip) {
    const result =
      update(
        trip,
        {
          status:
            "archived",

          archived:
            true
        }
      );

    emit("planned-trip-archived", result);
    return result;
  }

  function unarchive(trip) {
    const result =
      update(
        trip,
        {
          status:
            "planned",

          archived:
            false
        }
      );

    emit("planned-trip-unarchived", result);
    return result;
  }

  function duplicate(trip, overrides = {}) {
    if (!isObject(trip)) {
      throw new TypeError(
        `[${ENGINE_NAME}] A valid trip is required.`
      );
    }

    const duplicateTrip =
      create({
        ...trip,

        ...(
          isObject(overrides)
            ? overrides
            : {}
        ),

        id:
          createId("planned_trip"),

        type:
          "planned",

        status:
          "planned",

        convertedAt:
          null,

        restoredAt:
          null,

        archived:
          false,

        createdAt:
          nowISO(),

        checklist: {
          ...createChecklist({
            estimatedBudget:
              trip.estimatedBudget
          }),

          ...(isObject(overrides.checklist)
            ? overrides.checklist
            : {})
        }
      });

    emit("planned-trip-duplicated", duplicateTrip);
    return duplicateTrip;
  }

  function getChecklist(trip) {
    const checklist =
      isObject(trip) &&
      isObject(trip.checklist)
        ? trip.checklist
        : createChecklist(
            isObject(trip)
              ? trip
              : {}
          );

    return deepFreeze({
      ...checklist
    });
  }

  function getChecklistDetails(trip) {
    const checklist =
      getChecklist(trip);

    return deepFreeze(
      ALL_ITEMS.map(
        (item) => ({
          id: item,
          label:
            CHECKLIST_LABELS[item] ||
            item,
          required:
            REQUIRED_ITEMS.includes(item),
          completed:
            checklist[item] === true
        })
      )
    );
  }

  function getMissingRequiredItems(trip) {
    return calculateReadiness(
      isObject(trip)
        ? trip
        : {}
    ).missingRequiredItems;
  }

  function isPlannedTrip(trip) {
    return Boolean(
      isObject(trip) &&
      trip.type === "planned" &&
      trip.status !== "active"
    );
  }

  function isActiveTrip(trip) {
    return Boolean(
      isObject(trip) &&
      (
        trip.type === "active" ||
        trip.status === "active"
      )
    );
  }

  function getCapabilities() {
    return Object.freeze({
      plannedTripCreation:
        true,

      checklistManagement:
        true,

      readinessCalculation:
        true,

      automaticConversion:
        true,

      conversionValidation:
        true,

      restoreToPlanned:
        true,

      archiveSupport:
        true,

      duplicationSupport:
        true,

      directStoreWrites:
        false,

      uiRendering:
        false
    });
  }

  window.PlannedTripEngine =
    Object.freeze({
      name:
        ENGINE_NAME,

      version:
        ENGINE_VERSION,

      requiredItems:
        REQUIRED_ITEMS,

      optionalItems:
        OPTIONAL_ITEMS,

      allItems:
        ALL_ITEMS,

      checklistLabels:
        CHECKLIST_LABELS,

      create,

      update,

      completeItem,

      completeItems,

      resetItem,

      validate,

      canConvert,

      convert,

      restore,

      archive,

      unarchive,

      duplicate,

      calculateReadiness,

      getChecklist,

      getChecklistDetails,

      getMissingRequiredItems,

      isPlannedTrip,

      isActiveTrip,

      getCapabilities,

      on
    });

  emit("engine-ready", {
    name:
      ENGINE_NAME,

    version:
      ENGINE_VERSION
  });

  console.info(
    `[Travel Intelligence Center] ${ENGINE_NAME} V${ENGINE_VERSION} ready.`
  );
})(window);
