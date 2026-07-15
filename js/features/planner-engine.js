/* =========================================================
   Travel Intelligence Center
   Planner Engine V4.0.0

   File Path:
   js/features/planner-engine.js

   Purpose:
   - Planning and persistence layer for the rebuilt Guide.
   - Owns Guide-side workflows only; the central Store remains
     the single source of truth.
   - Manages wishlist items, annual travel plans, trip drafts,
     plan conversion, status transitions and lightweight checks.
   - Bridges GuideEngine, TravelAI, Trips and Budget safely.
   - Prevents duplicates and keeps all records traceable.

   Public API:
   - PlannerEngine.init()
   - PlannerEngine.refresh()
   - PlannerEngine.getState()
   - PlannerEngine.getWishlist()
   - PlannerEngine.addToWishlist()
   - PlannerEngine.removeFromWishlist()
   - PlannerEngine.toggleWishlist()
   - PlannerEngine.getAnnualPlans()
   - PlannerEngine.addToAnnualPlan()
   - PlannerEngine.updateAnnualPlan()
   - PlannerEngine.removeAnnualPlan()
   - PlannerEngine.convertPlanToTrip()
   - PlannerEngine.createTripDraft()
   - PlannerEngine.updateTripPlanningStatus()
   - PlannerEngine.getPlanningSummary()
   - PlannerEngine.subscribe()
   - PlannerEngine.destroy()
   ========================================================= */

(function plannerEngineModule(global) {
  "use strict";

  const VERSION = "4.0.0";
  const MODULE_NAME = "PlannerEngine";

  const listeners = new Set();

  let initialized = false;
  let storeUnsubscribe = null;
  let snapshot = null;

  const PLAN_STATUSES = Object.freeze([
    "idea",
    "considering",
    "shortlisted",
    "planned",
    "ready",
    "converted",
    "cancelled"
  ]);

  const TRIP_PLANNING_STATUSES = Object.freeze([
    "draft",
    "planned",
    "booking",
    "ready",
    "active",
    "completed",
    "cancelled"
  ]);

  /* =======================================================
     Utilities
     ======================================================= */

  function clone(value) {
    if (value === undefined) return undefined;

    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("ar")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/\s+/g, " ");
  }

  function normalizeCountryCode(value) {
    const code = String(value ?? "").trim().toUpperCase();
    return code.length >= 2 && code.length <= 3 ? code : null;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function makeId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
  }

  function unique(values) {
    return [...new Set(safeArray(values).filter(Boolean))];
  }

  function emit(type, detail = {}) {
    const event = {
      type,
      module: MODULE_NAME,
      version: VERSION,
      timestamp: nowISO(),
      detail: clone(detail)
    };

    listeners.forEach((listener) => {
      try {
        listener(event, clone(snapshot));
      } catch (error) {
        console.error(`[${MODULE_NAME}] Subscriber error`, error);
      }
    });

    try {
      global.dispatchEvent(
        new CustomEvent(`tic:${type}`, {
          detail: event
        })
      );
    } catch (_) {
      // Ignore in test environments.
    }

    return event;
  }

  /* =======================================================
     Dependencies
     ======================================================= */

  function getStore() {
    return (
      global.TravelStore ||
      global.Store ||
      global.AppStore ||
      global.TICStore ||
      null
    );
  }

  function getGuideEngine() {
    return global.GuideEngine || null;
  }

  function getTravelAI() {
    return (
      global.TravelAI ||
      global.TravelIntelligence ||
      null
    );
  }

  function readStoreState() {
    const store = getStore();
    if (!store) return {};

    const getters = [
      () => store.getState?.(),
      () => store.get?.(),
      () => store.state,
      () => store.data
    ];

    for (const getter of getters) {
      try {
        const result = getter();

        if (result && typeof result === "object") {
          return result;
        }
      } catch (_) {
        // Try next compatible API.
      }
    }

    return {};
  }

  function subscribeToStore() {
    if (typeof storeUnsubscribe === "function") {
      storeUnsubscribe();
      storeUnsubscribe = null;
    }

    const store = getStore();
    if (!store) return;

    const handler = () => refresh({ reason: "store-update" });

    const attempts = [
      () => store.subscribe?.(handler),
      () => store.onChange?.(handler),
      () => store.listen?.(handler)
    ];

    for (const attempt of attempts) {
      try {
        const unsubscribe = attempt();

        if (typeof unsubscribe === "function") {
          storeUnsubscribe = unsubscribe;
          return;
        }
      } catch (_) {
        // Try next Store subscription method.
      }
    }
  }

  async function dispatchStoreAction(type, payload) {
    const store = getStore();

    if (!store) {
      throw new Error("Central Store is not available.");
    }

    const attempts = [
      () => store.dispatch?.(type, payload),
      () => store.dispatch?.({ type, payload }),
      () => store.commit?.(type, payload),
      () => store.execute?.(type, payload)
    ];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        const result = attempt();

        if (result !== undefined) {
          return await Promise.resolve(result);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;

    throw new Error(`Store action "${type}" is not supported.`);
  }

  async function tryStoreActions(actions, payload) {
    let lastError = null;

    for (const action of safeArray(actions)) {
      try {
        return await dispatchStoreAction(action, payload);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("No supported Store action was found.");
  }

  /* =======================================================
     Extraction helpers
     ======================================================= */

  function extractWishlist(rootState = readStoreState()) {
    const candidates = [
      rootState.wishlist,
      rootState.travelWishlist,
      rootState.guide?.wishlist,
      rootState.travel?.wishlist,
      rootState.destinations?.wishlist
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;

      if (candidate && Array.isArray(candidate.items)) {
        return candidate.items;
      }

      if (candidate && typeof candidate === "object") {
        return Object.values(candidate);
      }
    }

    return [];
  }

  function extractAnnualPlans(rootState = readStoreState()) {
    const candidates = [
      rootState.annualPlans,
      rootState.travelPlans,
      rootState.guide?.annualPlans,
      rootState.travel?.annualPlans,
      rootState.plans
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;

      if (candidate && Array.isArray(candidate.items)) {
        return candidate.items;
      }

      if (candidate && typeof candidate === "object") {
        return Object.values(candidate);
      }
    }

    return [];
  }

  function extractTrips(rootState = readStoreState()) {
    const candidates = [
      rootState.trips,
      rootState.travel?.trips,
      rootState.data?.trips,
      rootState.tripData,
      rootState.completedTrips
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;

      if (candidate && Array.isArray(candidate.items)) {
        return candidate.items;
      }

      if (candidate && typeof candidate === "object") {
        return Object.values(candidate);
      }
    }

    return [];
  }

  function normalizeWishlistItem(item) {
    const source = safeObject(item);

    const countryCode = normalizeCountryCode(
      source.countryCode ||
        source.code ||
        source.iso2 ||
        source.country?.code
    );

    return {
      id: String(source.id || makeId("wishlist")),
      countryCode,
      countryName:
        source.countryName ||
        source.country?.nameAr ||
        source.country ||
        "",
      addedAt:
        source.addedAt ||
        source.createdAt ||
        nowISO(),
      source: source.source || "guide",
      priority: clamp(
        toNumber(source.priority, 3),
        1,
        5
      ),
      notes: source.notes || "",
      preferredMonth: source.preferredMonth
        ? clamp(toNumber(source.preferredMonth, 1), 1, 12)
        : null,
      preferredYear:
        toNumber(source.preferredYear, 0) || null,
      metadata: clone(safeObject(source.metadata))
    };
  }

  function normalizeAnnualPlan(plan) {
    const source = safeObject(plan);

    const status = PLAN_STATUSES.includes(source.status)
      ? source.status
      : "idea";

    return {
      id: String(source.id || makeId("annual_plan")),
      countryCode: normalizeCountryCode(
        source.countryCode ||
          source.code ||
          source.destination?.countryCode
      ),
      countryName:
        source.countryName ||
        source.destination?.countryName ||
        source.country ||
        "",
      year: Math.max(
        new Date().getFullYear(),
        toNumber(source.year, new Date().getFullYear())
      ),
      month: source.month
        ? clamp(toNumber(source.month, 1), 1, 12)
        : null,
      days: Math.max(
        1,
        toNumber(source.days, 7)
      ),
      travelers: Math.max(
        1,
        toNumber(source.travelers, 1)
      ),
      budgetAED: Math.max(
        0,
        toNumber(
          source.budgetAED ??
            source.budget,
          0
        )
      ),
      status,
      source: source.source || "guide",
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        source.updatedAt ||
        nowISO(),
      convertedTripId:
        source.convertedTripId ||
        source.tripId ||
        null,
      notes: source.notes || "",
      tags: unique(source.tags),
      checklist: {
        destinationSelected:
          source.checklist?.destinationSelected !== false,
        budgetReviewed:
          source.checklist?.budgetReviewed === true,
        datesSelected:
          source.checklist?.datesSelected === true,
        flightBooked:
          source.checklist?.flightBooked === true,
        hotelBooked:
          source.checklist?.hotelBooked === true,
        documentsReady:
          source.checklist?.documentsReady === true
      }
    };
  }

  function normalizeTrip(trip) {
    const source = safeObject(trip);

    const planningStatus = TRIP_PLANNING_STATUSES.includes(
      source.planningStatus
    )
      ? source.planningStatus
      : (
          TRIP_PLANNING_STATUSES.includes(source.status)
            ? source.status
            : "draft"
        );

    return {
      ...clone(source),
      id: String(source.id || makeId("trip")),
      title:
        source.title ||
        source.name ||
        "رحلة جديدة",
      countryCode: normalizeCountryCode(
        source.countryCode ||
          source.destinationCountryCode ||
          source.destination?.countryCode
      ),
      planningStatus,
      status: source.status || "planned",
      createdAt:
        source.createdAt ||
        nowISO(),
      updatedAt:
        source.updatedAt ||
        nowISO()
    };
  }

  function getCountry(identifier) {
    const guide = getGuideEngine();

    if (!guide?.getCountry) return null;

    return guide.getCountry(identifier);
  }

  /* =======================================================
     Wishlist
     ======================================================= */

  function getWishlist(options = {}) {
    const items = extractWishlist(
      options.storeState || readStoreState()
    )
      .map(normalizeWishlistItem)
      .filter((item) => item.countryCode);

    if (options.decorate !== false) {
      return items.map((item) => ({
        ...item,
        country: getCountry(item.countryCode)
      }));
    }

    return items;
  }

  function findWishlistItem(identifier) {
    const code = normalizeCountryCode(identifier);

    return getWishlist({ decorate: false }).find(
      (item) =>
        item.id === identifier ||
        item.countryCode === code
    ) || null;
  }

  function isWishlisted(identifier) {
    return Boolean(findWishlistItem(identifier));
  }

  async function addToWishlist(identifier, metadata = {}) {
    const country =
      typeof identifier === "object"
        ? identifier
        : getCountry(identifier);

    const countryCode =
      normalizeCountryCode(
        country?.code ||
          metadata.countryCode ||
          identifier
      );

    if (!countryCode) {
      throw new Error("Valid country code is required.");
    }

    const existing = findWishlistItem(countryCode);

    if (existing) {
      return {
        ...existing,
        country: getCountry(countryCode)
      };
    }

    const payload = normalizeWishlistItem({
      id: metadata.id || makeId("wishlist"),
      countryCode,
      countryName:
        metadata.countryName ||
        country?.nameAr ||
        country?.nameEn ||
        "",
      addedAt: metadata.addedAt || nowISO(),
      source: metadata.source || "guide",
      priority: metadata.priority,
      notes: metadata.notes,
      preferredMonth: metadata.preferredMonth,
      preferredYear: metadata.preferredYear,
      metadata
    });

    await tryStoreActions(
      [
        "wishlist/add",
        "ADD_WISHLIST_ITEM",
        "guide/addWishlist",
        "addWishlist"
      ],
      payload
    );

    await refresh({ reason: "wishlist-add" });

    emit("planner-wishlist-added", {
      item: payload
    });

    return {
      ...payload,
      country: getCountry(countryCode)
    };
  }

  async function removeFromWishlist(identifier) {
    const existing = findWishlistItem(identifier);

    if (!existing) return null;

    const payload = {
      id: existing.id,
      countryCode: existing.countryCode
    };

    await tryStoreActions(
      [
        "wishlist/remove",
        "REMOVE_WISHLIST_ITEM",
        "guide/removeWishlist",
        "removeWishlist"
      ],
      payload
    );

    await refresh({ reason: "wishlist-remove" });

    emit("planner-wishlist-removed", payload);

    return existing;
  }

  async function updateWishlistItem(identifier, patch = {}) {
    const existing = findWishlistItem(identifier);

    if (!existing) {
      throw new Error("Wishlist item was not found.");
    }

    const payload = normalizeWishlistItem({
      ...existing,
      ...safeObject(patch),
      id: existing.id,
      countryCode: existing.countryCode
    });

    await tryStoreActions(
      [
        "wishlist/update",
        "UPDATE_WISHLIST_ITEM",
        "guide/updateWishlist",
        "updateWishlist"
      ],
      payload
    );

    await refresh({ reason: "wishlist-update" });

    emit("planner-wishlist-updated", {
      item: payload
    });

    return payload;
  }

  async function toggleWishlist(identifier, metadata = {}) {
    return isWishlisted(identifier)
      ? removeFromWishlist(identifier)
      : addToWishlist(identifier, metadata);
  }

  /* =======================================================
     Annual plans
     ======================================================= */

  function getAnnualPlans(options = {}) {
    const plans = extractAnnualPlans(
      options.storeState || readStoreState()
    )
      .map(normalizeAnnualPlan)
      .filter((plan) => plan.countryCode);

    let filtered = plans;

    if (options.year) {
      filtered = filtered.filter(
        (plan) => plan.year === Number(options.year)
      );
    }

    if (options.status) {
      filtered = filtered.filter(
        (plan) => plan.status === options.status
      );
    }

    if (options.countryCode) {
      const code = normalizeCountryCode(options.countryCode);

      filtered = filtered.filter(
        (plan) => plan.countryCode === code
      );
    }

    return filtered
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;

        const monthA = a.month || 13;
        const monthB = b.month || 13;

        return monthA - monthB;
      })
      .map((plan) =>
        options.decorate === false
          ? plan
          : {
              ...plan,
              country: getCountry(plan.countryCode),
              readiness: calculatePlanReadiness(plan)
            }
      );
  }

  function findAnnualPlan(identifier) {
    return getAnnualPlans({ decorate: false }).find(
      (plan) => plan.id === identifier
    ) || null;
  }

  function findDuplicateAnnualPlan(plan) {
    return getAnnualPlans({ decorate: false }).find(
      (item) =>
        item.countryCode === plan.countryCode &&
        item.year === plan.year &&
        item.month === plan.month &&
        item.status !== "cancelled"
    ) || null;
  }

  function calculatePlanReadiness(plan) {
    const checklist = safeObject(plan.checklist);

    const steps = [
      checklist.destinationSelected !== false,
      checklist.budgetReviewed === true,
      checklist.datesSelected === true,
      checklist.flightBooked === true,
      checklist.hotelBooked === true,
      checklist.documentsReady === true
    ];

    const completed = steps.filter(Boolean).length;
    const percent = Math.round(
      (completed / steps.length) * 100
    );

    return {
      completed,
      total: steps.length,
      percent,
      readyForTrip:
        checklist.flightBooked === true &&
        checklist.hotelBooked === true
    };
  }

  async function addToAnnualPlan(planInput = {}) {
    const source = safeObject(planInput);

    const country = getCountry(
      source.countryCode ||
        source.country ||
        source.destination
    );

    const payload = normalizeAnnualPlan({
      ...source,
      countryCode:
        source.countryCode ||
        country?.code,
      countryName:
        source.countryName ||
        country?.nameAr ||
        country?.nameEn
    });

    if (!payload.countryCode) {
      throw new Error("Annual plan requires a valid country.");
    }

    const duplicate = findDuplicateAnnualPlan(payload);

    if (duplicate) {
      return {
        ...duplicate,
        duplicate: true,
        country: getCountry(duplicate.countryCode),
        readiness: calculatePlanReadiness(duplicate)
      };
    }

    await tryStoreActions(
      [
        "annualPlans/add",
        "ADD_ANNUAL_PLAN",
        "guide/addAnnualPlan",
        "addAnnualPlan"
      ],
      payload
    );

    await refresh({ reason: "annual-plan-add" });

    emit("planner-annual-plan-added", {
      plan: payload
    });

    return {
      ...payload,
      duplicate: false,
      country: getCountry(payload.countryCode),
      readiness: calculatePlanReadiness(payload)
    };
  }

  async function updateAnnualPlan(identifier, patch = {}) {
    const existing = findAnnualPlan(identifier);

    if (!existing) {
      throw new Error("Annual plan was not found.");
    }

    const nextStatus =
      patch.status && PLAN_STATUSES.includes(patch.status)
        ? patch.status
        : existing.status;

    const payload = normalizeAnnualPlan({
      ...existing,
      ...safeObject(patch),
      id: existing.id,
      status: nextStatus,
      updatedAt: nowISO()
    });

    await tryStoreActions(
      [
        "annualPlans/update",
        "UPDATE_ANNUAL_PLAN",
        "guide/updateAnnualPlan",
        "updateAnnualPlan"
      ],
      payload
    );

    await refresh({ reason: "annual-plan-update" });

    emit("planner-annual-plan-updated", {
      plan: payload
    });

    return {
      ...payload,
      country: getCountry(payload.countryCode),
      readiness: calculatePlanReadiness(payload)
    };
  }

  async function removeAnnualPlan(identifier) {
    const existing = findAnnualPlan(identifier);

    if (!existing) return null;

    const payload = {
      id: existing.id,
      countryCode: existing.countryCode
    };

    await tryStoreActions(
      [
        "annualPlans/remove",
        "REMOVE_ANNUAL_PLAN",
        "guide/removeAnnualPlan",
        "removeAnnualPlan"
      ],
      payload
    );

    await refresh({ reason: "annual-plan-remove" });

    emit("planner-annual-plan-removed", payload);

    return existing;
  }

  async function setPlanStatus(identifier, status) {
    if (!PLAN_STATUSES.includes(status)) {
      throw new Error(`Unsupported plan status: ${status}`);
    }

    return updateAnnualPlan(identifier, { status });
  }

  async function updatePlanChecklist(identifier, patch = {}) {
    const existing = findAnnualPlan(identifier);

    if (!existing) {
      throw new Error("Annual plan was not found.");
    }

    return updateAnnualPlan(identifier, {
      checklist: {
        ...existing.checklist,
        ...safeObject(patch)
      }
    });
  }

  /* =======================================================
     Trip drafts
     ======================================================= */

  function getTrips(options = {}) {
    const trips = extractTrips(
      options.storeState || readStoreState()
    ).map(normalizeTrip);

    let filtered = trips;

    if (options.countryCode) {
      const code = normalizeCountryCode(options.countryCode);

      filtered = filtered.filter(
        (trip) => trip.countryCode === code
      );
    }

    if (options.planningStatus) {
      filtered = filtered.filter(
        (trip) =>
          trip.planningStatus === options.planningStatus
      );
    }

    return filtered;
  }

  function findTrip(identifier) {
    return getTrips().find(
      (trip) => trip.id === identifier
    ) || null;
  }

  function buildTripChecklist(source = {}) {
    const checklist = safeObject(source.checklist);

    return {
      flightBooked:
        checklist.flightBooked === true,
      hotelBooked:
        checklist.hotelBooked === true,
      documentsReady:
        checklist.documentsReady === true,
      insuranceReady:
        checklist.insuranceReady === true,
      transportPlanned:
        checklist.transportPlanned === true,
      itineraryReady:
        checklist.itineraryReady === true
    };
  }

  function calculateTripReadiness(trip) {
    const checklist = buildTripChecklist(trip);

    const steps = Object.values(checklist);
    const completed = steps.filter(Boolean).length;
    const percent = Math.round(
      (completed / steps.length) * 100
    );

    return {
      completed,
      total: steps.length,
      percent,
      readyForTravel:
        checklist.flightBooked === true &&
        checklist.hotelBooked === true,
      checklist
    };
  }

  function buildTripPayload(input = {}) {
    const source = safeObject(input);

    const country = getCountry(
      source.countryCode ||
        source.country ||
        source.destinationCountry
    );

    const countryCode =
      normalizeCountryCode(
        source.countryCode ||
          country?.code
      );

    if (!countryCode) {
      throw new Error("Trip draft requires a valid country.");
    }

    const travelAI = getTravelAI();

    const days = Math.max(
      1,
      toNumber(
        source.days,
        country?.recommendedDays?.ideal || 7
      )
    );

    const travelers = Math.max(
      1,
      toNumber(source.travelers, 1)
    );

    let estimatedCost = null;

    try {
      estimatedCost =
        travelAI?.getBudgetFit?.(country, {
          days,
          travelers,
          budget: source.budget
        })?.estimate || null;
    } catch (_) {
      // Use direct values below.
    }

    const payload = {
      ...clone(source),
      id: source.id || makeId("trip"),
      title:
        source.title ||
        `رحلة ${country?.nameAr || country?.nameEn || ""}`.trim(),
      countryCode,
      country:
        source.country ||
        country?.nameAr ||
        country?.nameEn ||
        "",
      destinationCountry:
        source.destinationCountry ||
        country?.nameAr ||
        country?.nameEn ||
        "",
      city:
        source.city ||
        country?.cities?.[0]?.nameAr ||
        country?.cities?.[0]?.nameEn ||
        "",
      status: source.status || "planned",
      planningStatus:
        TRIP_PLANNING_STATUSES.includes(source.planningStatus)
          ? source.planningStatus
          : "draft",
      startDate: source.startDate || null,
      endDate: source.endDate || null,
      days,
      travelers,
      budget: Math.max(
        0,
        toNumber(
          source.budget ??
            source.budgetAED,
          estimatedCost?.totalAED || 0
        )
      ),
      currency: source.currency || "AED",
      source: source.source || "guide",
      guideCountryCode: countryCode,
      annualPlanId: source.annualPlanId || null,
      itinerary: clone(source.itinerary || null),
      checklist: buildTripChecklist(source),
      createdAt: source.createdAt || nowISO(),
      updatedAt: nowISO(),
      notes: source.notes || ""
    };

    return payload;
  }

  async function createTripDraft(input = {}) {
    const payload = buildTripPayload(input);

    const duplicate = getTrips().find(
      (trip) =>
        trip.countryCode === payload.countryCode &&
        trip.startDate &&
        payload.startDate &&
        trip.startDate === payload.startDate &&
        trip.planningStatus !== "cancelled"
    );

    if (duplicate) {
      return {
        ...duplicate,
        duplicate: true,
        readiness: calculateTripReadiness(duplicate)
      };
    }

    await tryStoreActions(
      [
        "trips/add",
        "ADD_TRIP",
        "trip/add",
        "addTrip"
      ],
      payload
    );

    await refresh({ reason: "trip-draft-create" });

    emit("planner-trip-draft-created", {
      trip: payload
    });

    return {
      ...payload,
      duplicate: false,
      readiness: calculateTripReadiness(payload)
    };
  }

  async function updateTripPlanningStatus(identifier, status) {
    if (!TRIP_PLANNING_STATUSES.includes(status)) {
      throw new Error(
        `Unsupported trip planning status: ${status}`
      );
    }

    const existing = findTrip(identifier);

    if (!existing) {
      throw new Error("Trip was not found.");
    }

    const payload = {
      ...existing,
      planningStatus: status,
      updatedAt: nowISO()
    };

    await tryStoreActions(
      [
        "trips/update",
        "UPDATE_TRIP",
        "trip/update",
        "updateTrip"
      ],
      payload
    );

    await refresh({ reason: "trip-status-update" });

    emit("planner-trip-status-updated", {
      tripId: existing.id,
      status
    });

    return {
      ...payload,
      readiness: calculateTripReadiness(payload)
    };
  }

  async function updateTripChecklist(identifier, patch = {}) {
    const existing = findTrip(identifier);

    if (!existing) {
      throw new Error("Trip was not found.");
    }

    const payload = {
      ...existing,
      checklist: {
        ...buildTripChecklist(existing),
        ...safeObject(patch)
      },
      updatedAt: nowISO()
    };

    const readiness = calculateTripReadiness(payload);

    if (
      readiness.readyForTravel &&
      ["draft", "planned", "booking"].includes(
        payload.planningStatus
      )
    ) {
      payload.planningStatus = "ready";
    }

    await tryStoreActions(
      [
        "trips/update",
        "UPDATE_TRIP",
        "trip/update",
        "updateTrip"
      ],
      payload
    );

    await refresh({ reason: "trip-checklist-update" });

    emit("planner-trip-checklist-updated", {
      tripId: existing.id,
      checklist: payload.checklist,
      readiness
    });

    return {
      ...payload,
      readiness
    };
  }

  /* =======================================================
     Plan conversion
     ======================================================= */

  async function convertPlanToTrip(identifier, options = {}) {
    const plan = findAnnualPlan(identifier);

    if (!plan) {
      throw new Error("Annual plan was not found.");
    }

    if (plan.convertedTripId) {
      const existingTrip = findTrip(plan.convertedTripId);

      if (existingTrip) {
        return {
          trip: existingTrip,
          plan: {
            ...plan,
            readiness: calculatePlanReadiness(plan)
          },
          duplicate: true
        };
      }
    }

    const country = getCountry(plan.countryCode);

    const startDate =
      options.startDate ||
      deriveStartDate(plan.year, plan.month);

    const endDate =
      options.endDate ||
      deriveEndDate(startDate, plan.days);

    let itinerary = options.itinerary || null;

    if (!itinerary) {
      try {
        itinerary = getTravelAI()?.generateItinerary?.(
          country,
          {
            days: plan.days,
            travelers: plan.travelers,
            month: plan.month,
            budget: plan.budgetAED
          }
        ) || null;
      } catch (_) {
        itinerary = null;
      }
    }

    const trip = await createTripDraft({
      title:
        options.title ||
        `رحلة ${plan.countryName || country?.nameAr || ""}`.trim(),
      countryCode: plan.countryCode,
      country:
        plan.countryName ||
        country?.nameAr ||
        "",
      startDate,
      endDate,
      days: plan.days,
      travelers: plan.travelers,
      budget: plan.budgetAED,
      annualPlanId: plan.id,
      planningStatus:
        options.planningStatus || "planned",
      source: "annual-plan",
      itinerary,
      notes: options.notes || plan.notes,
      checklist: {
        ...plan.checklist,
        itineraryReady: Boolean(itinerary)
      }
    });

    const updatedPlan = await updateAnnualPlan(plan.id, {
      status: "converted",
      convertedTripId: trip.id
    });

    emit("planner-plan-converted-to-trip", {
      planId: plan.id,
      tripId: trip.id
    });

    return {
      trip,
      plan: updatedPlan,
      duplicate: false
    };
  }

  function deriveStartDate(year, month) {
    if (!year || !month) return null;

    const date = new Date(
      Number(year),
      Number(month) - 1,
      1
    );

    return Number.isFinite(date.getTime())
      ? date.toISOString().slice(0, 10)
      : null;
  }

  function deriveEndDate(startDate, days) {
    if (!startDate) return null;

    const date = new Date(startDate);

    if (!Number.isFinite(date.getTime())) return null;

    date.setDate(
      date.getDate() +
        Math.max(1, toNumber(days, 1)) -
        1
    );

    return date.toISOString().slice(0, 10);
  }

  /* =======================================================
     Summary
     ======================================================= */

  function getPlanningSummary(options = {}) {
    const rootState =
      options.storeState || readStoreState();

    const wishlist = getWishlist({
      storeState: rootState,
      decorate: false
    });

    const plans = getAnnualPlans({
      storeState: rootState,
      decorate: false
    });

    const trips = getTrips({
      storeState: rootState
    });

    const currentYear = new Date().getFullYear();

    const activePlans = plans.filter(
      (plan) =>
        plan.status !== "cancelled" &&
        plan.status !== "converted"
    );

    const readyPlans = activePlans.filter(
      (plan) => calculatePlanReadiness(plan).readyForTrip
    );

    const draftTrips = trips.filter(
      (trip) =>
        ["draft", "planned", "booking"].includes(
          trip.planningStatus
        )
    );

    const readyTrips = trips.filter(
      (trip) =>
        trip.planningStatus === "ready" ||
        calculateTripReadiness(trip).readyForTravel
    );

    return {
      generatedAt: nowISO(),
      wishlistCount: wishlist.length,
      annualPlanCount: plans.length,
      currentYearPlans: plans.filter(
        (plan) => plan.year === currentYear
      ).length,
      activePlans: activePlans.length,
      readyPlans: readyPlans.length,
      convertedPlans: plans.filter(
        (plan) => plan.status === "converted"
      ).length,
      draftTrips: draftTrips.length,
      readyTrips: readyTrips.length,
      totalTrips: trips.length
    };
  }

  function getState() {
    return {
      version: VERSION,
      initialized,
      wishlist: getWishlist(),
      annualPlans: getAnnualPlans(),
      trips: getTrips().map((trip) => ({
        ...trip,
        readiness: calculateTripReadiness(trip)
      })),
      summary: getPlanningSummary(),
      snapshot: clone(snapshot)
    };
  }

  /* =======================================================
     Lifecycle
     ======================================================= */

  async function refresh(options = {}) {
    snapshot = {
      generatedAt: nowISO(),
      reason: options.reason || "manual",
      summary: getPlanningSummary()
    };

    emit("planner-engine-refreshed", {
      reason: options.reason || "manual"
    });

    return clone(snapshot);
  }

  async function init(options = {}) {
    if (initialized && options.force !== true) {
      return getState();
    }

    subscribeToStore();

    initialized = true;

    await refresh({ reason: "init" });

    emit("planner-engine-ready", {
      hasStore: Boolean(getStore()),
      hasGuideEngine: Boolean(getGuideEngine()),
      hasTravelAI: Boolean(getTravelAI())
    });

    return getState();
  }

  function destroy() {
    if (typeof storeUnsubscribe === "function") {
      storeUnsubscribe();
    }

    storeUnsubscribe = null;
    listeners.clear();
    snapshot = null;
    initialized = false;
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "PlannerEngine subscriber must be a function."
      );
    }

    listeners.add(listener);

    if (options.immediate === true) {
      listener(
        {
          type: "planner-engine-snapshot",
          module: MODULE_NAME,
          version: VERSION,
          timestamp: nowISO(),
          detail: {}
        },
        clone(snapshot)
      );
    }

    return () => listeners.delete(listener);
  }

  /* =======================================================
     Public API
     ======================================================= */

  const PlannerEngine = Object.freeze({
    VERSION,

    init,
    refresh,
    destroy,
    subscribe,
    getState,

    getWishlist,
    isWishlisted,
    addToWishlist,
    removeFromWishlist,
    updateWishlistItem,
    toggleWishlist,

    getAnnualPlans,
    addToAnnualPlan,
    updateAnnualPlan,
    removeAnnualPlan,
    setPlanStatus,
    updatePlanChecklist,
    calculatePlanReadiness,

    getTrips,
    createTripDraft,
    updateTripPlanningStatus,
    updateTripChecklist,
    calculateTripReadiness,

    convertPlanToTrip,
    getPlanningSummary
  });

  global.PlannerEngine = PlannerEngine;
  global.TravelPlannerEngine = PlannerEngine;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = PlannerEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
