/* =========================================================
   Travel Intelligence Center
   Home Page Module V2.2.0

   File Path:
   js/pages/home.js

   Purpose:
   - Calm, premium and compact iPhone-first home page.
   - Keeps the current empty-state appearance when no trip exists.
   - Shows a smarter next-trip summary when an upcoming trip exists.
   - Supports flexible flight, airport, hotel and booking field names.
   - Preserves Store, Router, Trip Form and cross-page integration.
   - Keeps ticket/hotel scan entry points ready for Trip Form integration.

   Important:
   - Image/ticket/hotel reading is handled by Trip Form or a future
     document-reading service, not by the Home Page itself.
   - This page automatically displays extracted data once saved
     inside the trip record.

   Dependencies:
   - js/config.js
   - js/store.js
   - js/router.js
   - js/ui.js
   - js/features/trip-form.js

   Global APIs:
   - window.TIC.Pages.home
   - window.TICHomePage
========================================================= */

(function (window, document) {
  "use strict";

  const Config = window.TICConfig || window.TIC?.Config || {};
  const PAGE_ID = "home";
  const PAGE_VERSION = "2.2.0";
  const DEFAULT_AIRPORT_LEAD_MINUTES = 120;

  const state = {
    initialized: false,
    mounted: false,
    container: null,
    unsubscribeStore: null,
    actionUnsubscribers: [],
    subscribers: new Set(),
    lastSnapshot: null
  };

  const isObject = (value) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

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

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const text = (value) =>
    String(value ?? "").trim();

  const number = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const list = (value) =>
    Array.isArray(value) ? value : [];

  const firstText = (...values) => {
    for (const value of values) {
      const result = text(value);
      if (result) return result;
    }

    return "";
  };

  const firstValue = (...values) => {
    for (const value of values) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }

    return null;
  };

  const getStore = () =>
    window.TIC?.Store ||
    window.TICStore ||
    null;

  const getRouter = () =>
    window.TIC?.Router ||
    window.TICRouter ||
    null;

  const getUI = () =>
    window.TIC?.UI ||
    window.TICUI ||
    null;

  const getTripForm = () =>
    window.TIC?.Features?.TripForm ||
    window.TICTripForm ||
    null;

  const emit = (type, detail = {}) => {
    const payload = {
      type,
      page: PAGE_ID,
      timestamp: new Date().toISOString(),
      ...clone(detail)
    };

    state.subscribers.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("TIC Home subscriber error:", error);
      }
    });

    window.dispatchEvent(
      new CustomEvent(`tic:page:${PAGE_ID}:${type}`, {
        detail: payload
      })
    );

    return payload;
  };

  const resolveContainer = (container) => {
    if (container instanceof window.Element) {
      return container;
    }

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return (
      document.querySelector("[data-router-view]") ||
      document.querySelector("#app-view") ||
      document.querySelector("#tic-page") ||
      document.querySelector("#app-content")
    );
  };

  const getStoreState = () => {
    const store = getStore();

    if (!store) return {};

    if (typeof store.getState === "function") {
      return clone(store.getState()) || {};
    }

    if (typeof store.get === "function") {
      return {
        profile: store.get("profile"),
        statistics: store.get("statistics"),
        trips: store.get("trips"),
        destinations: store.get("destinations"),
        wishlist: store.get("wishlist"),
        budgets: store.get("budgets"),
        savings: store.get("savings"),
        documents: store.get("documents"),
        packing: store.get("packing"),
        memories: store.get("memories"),
        notifications: store.get("notifications")
      };
    }

    return {};
  };

  const toDate = (value) => {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : new Date(value);
    }

    if (typeof value === "number") {
      const numericDate = new Date(value);

      return Number.isNaN(numericDate.getTime())
        ? null
        : numericDate;
    }

    const raw = text(value);

    if (!raw) return null;

    const direct = new Date(raw);

    if (!Number.isNaN(direct.getTime())) {
      return direct;
    }

    return null;
  };

  const startOfDay = (value) => {
    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const daysUntil = (value) => {
    const date = toDate(value);
    if (!date) return null;

    return Math.ceil(
      (
        startOfDay(date).getTime() -
        startOfDay(new Date()).getTime()
      ) / 86400000
    );
  };

  const minutesUntil = (value) => {
    const date = toDate(value);
    if (!date) return null;

    return Math.round(
      (date.getTime() - Date.now()) / 60000
    );
  };

  const durationDays = (startDate, endDate) => {
    const start = toDate(startDate);
    const end = toDate(endDate);

    if (!start || !end || end < start) {
      return 0;
    }

    return (
      Math.floor(
        (
          startOfDay(end).getTime() -
          startOfDay(start).getTime()
        ) / 86400000
      ) + 1
    );
  };

  const combineDateAndTime = (dateValue, timeValue) => {
    if (!dateValue && !timeValue) return null;

    const date = toDate(dateValue);

    if (!date) {
      return toDate(timeValue);
    }

    const time = text(timeValue);

    if (!time) {
      return date;
    }

    const match = time.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );

    if (!match) {
      const combined = toDate(
        `${date.toISOString().slice(0, 10)}T${time}`
      );

      return combined || date;
    }

    const result = new Date(date);
    result.setHours(
      number(match[1]),
      number(match[2]),
      number(match[3]),
      0
    );

    return result;
  };

  const subtractMinutes = (dateValue, minutes) => {
    const date = toDate(dateValue);

    if (!date) return null;

    return new Date(
      date.getTime() - number(minutes) * 60000
    );
  };

  const formatTime = (value) => {
    const date = toDate(value);

    if (!date) {
      const raw = text(value);
      return raw || "";
    }

    try {
      return new Intl.DateTimeFormat("ar-AE", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }).format(date);
    } catch (error) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    }
  };

  const formatShortDate = (value) => {
    const date = toDate(value);

    if (!date) return "";

    try {
      return new Intl.DateTimeFormat("ar-AE", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(date);
    } catch (error) {
      return date.toLocaleDateString();
    }
  };

  const formatDateTime = (value) => {
    const date = toDate(value);

    if (!date) return "";

    return `${formatShortDate(date)} • ${formatTime(date)}`;
  };

  const tripsFrom = (snapshot) =>
    list(snapshot.trips);

  const getTripDepartureDateTime = (trip) => {
    const flight = isObject(trip?.flight)
      ? trip.flight
      : {};

    const outbound = isObject(trip?.outboundFlight)
      ? trip.outboundFlight
      : {};

    const directDateTime = firstValue(
      trip?.departureDateTime,
      trip?.flightDateTime,
      trip?.flightDepartureDateTime,
      outbound.departureDateTime,
      flight.departureDateTime
    );

    if (directDateTime) {
      return toDate(directDateTime);
    }

    const dateValue = firstValue(
      trip?.departureDate,
      trip?.flightDate,
      outbound.departureDate,
      flight.departureDate,
      trip?.startDate
    );

    const timeValue = firstValue(
      trip?.departureTime,
      trip?.flightTime,
      trip?.flightDepartureTime,
      outbound.departureTime,
      flight.departureTime
    );

    return combineDateAndTime(
      dateValue,
      timeValue
    );
  };

  const getTripArrivalDateTime = (trip) => {
    const flight = isObject(trip?.flight)
      ? trip.flight
      : {};

    const outbound = isObject(trip?.outboundFlight)
      ? trip.outboundFlight
      : {};

    const directDateTime = firstValue(
      trip?.arrivalDateTime,
      trip?.flightArrivalDateTime,
      outbound.arrivalDateTime,
      flight.arrivalDateTime
    );

    if (directDateTime) {
      return toDate(directDateTime);
    }

    return combineDateAndTime(
      firstValue(
        trip?.arrivalDate,
        outbound.arrivalDate,
        flight.arrivalDate,
        trip?.startDate
      ),
      firstValue(
        trip?.arrivalTime,
        trip?.flightArrivalTime,
        outbound.arrivalTime,
        flight.arrivalTime
      )
    );
  };

  const getFlightDetails = (trip) => {
    const flight = isObject(trip?.flight)
      ? trip.flight
      : {};

    const outbound = isObject(trip?.outboundFlight)
      ? trip.outboundFlight
      : {};

    const departureDateTime =
      getTripDepartureDateTime(trip);

    const arrivalDateTime =
      getTripArrivalDateTime(trip);

    const airportLeadMinutes = Math.max(
      0,
      number(
        firstValue(
          trip?.airportLeadMinutes,
          trip?.arriveAirportBeforeMinutes,
          flight.airportLeadMinutes,
          outbound.airportLeadMinutes
        ),
        DEFAULT_AIRPORT_LEAD_MINUTES
      )
    );

    return {
      airline: firstText(
        trip?.airline,
        trip?.airlineName,
        outbound.airline,
        outbound.airlineName,
        flight.airline,
        flight.airlineName
      ),
      flightNumber: firstText(
        trip?.flightNumber,
        trip?.flightNo,
        outbound.flightNumber,
        outbound.flightNo,
        flight.flightNumber,
        flight.flightNo
      ),
      departureAirport: firstText(
        trip?.departureAirport,
        trip?.originAirport,
        outbound.departureAirport,
        outbound.originAirport,
        flight.departureAirport,
        flight.originAirport
      ),
      arrivalAirport: firstText(
        trip?.arrivalAirport,
        trip?.destinationAirport,
        outbound.arrivalAirport,
        outbound.destinationAirport,
        flight.arrivalAirport,
        flight.destinationAirport
      ),
      terminal: firstText(
        trip?.terminal,
        trip?.departureTerminal,
        outbound.terminal,
        outbound.departureTerminal,
        flight.terminal,
        flight.departureTerminal
      ),
      gate: firstText(
        trip?.gate,
        trip?.departureGate,
        outbound.gate,
        outbound.departureGate,
        flight.gate,
        flight.departureGate
      ),
      bookingReference: firstText(
        trip?.bookingReference,
        trip?.pnr,
        trip?.confirmationNumber,
        outbound.bookingReference,
        flight.bookingReference
      ),
      departureDateTime,
      arrivalDateTime,
      airportLeadMinutes,
      airportArrivalDateTime:
        subtractMinutes(
          departureDateTime,
          airportLeadMinutes
        )
    };
  };

  const getHotelDetails = (trip) => {
    const accommodation = isObject(
      trip?.accommodation
    )
      ? trip.accommodation
      : {};

    const hotel = isObject(trip?.hotel)
      ? trip.hotel
      : {};

    return {
      name: firstText(
        trip?.hotelName,
        trip?.accommodationName,
        accommodation.name,
        accommodation.hotelName,
        hotel.name,
        hotel.hotelName,
        typeof trip?.accommodation === "string"
          ? trip.accommodation
          : ""
      ),
      address: firstText(
        trip?.hotelAddress,
        accommodation.address,
        hotel.address
      ),
      confirmationNumber: firstText(
        trip?.hotelConfirmationNumber,
        trip?.hotelBookingReference,
        accommodation.confirmationNumber,
        accommodation.bookingReference,
        hotel.confirmationNumber,
        hotel.bookingReference
      ),
      checkIn: firstValue(
        trip?.hotelCheckIn,
        trip?.checkIn,
        accommodation.checkIn,
        hotel.checkIn
      ),
      checkOut: firstValue(
        trip?.hotelCheckOut,
        trip?.checkOut,
        accommodation.checkOut,
        hotel.checkOut
      )
    };
  };

  const upcomingTripsFrom = (snapshot) => {
    const now = new Date();
    const today = startOfDay(now);

    return tripsFrom(snapshot)
      .filter((trip) => {
        const departureDateTime =
          getTripDepartureDateTime(trip);

        const startDate =
          departureDateTime ||
          toDate(trip.startDate);

        const status = text(
          trip.status
        ).toLowerCase();

        return (
          startDate &&
          (
            startOfDay(startDate) >= today ||
            (
              toDate(trip.endDate) &&
              toDate(trip.endDate) >= now
            )
          ) &&
          !["completed", "cancelled"].includes(status)
        );
      })
      .sort((a, b) => {
        const aDate =
          getTripDepartureDateTime(a) ||
          toDate(a.startDate);

        const bDate =
          getTripDepartureDateTime(b) ||
          toDate(b.startDate);

        return aDate - bDate;
      });
  };

  const completedTripsFrom = (snapshot) =>
    tripsFrom(snapshot).filter((trip) => {
      const status = text(trip.status).toLowerCase();
      const endDate = toDate(trip.endDate);

      return (
        status === "completed" ||
        (
          endDate &&
          endDate < startOfDay(new Date())
        )
      );
    });

  const countriesCountFrom = (snapshot) => {
    const countries = new Set();

    tripsFrom(snapshot).forEach((trip) => {
      const country =
        text(trip.country) ||
        text(trip.destination)
          .split(",")
          .pop()
          ?.trim();

      if (country) {
        countries.add(country.toLowerCase());
      }
    });

    list(snapshot.destinations).forEach((destination) => {
      const country = text(destination.country);

      if (country) {
        countries.add(country.toLowerCase());
      }
    });

    return countries.size;
  };

  const buildSnapshot = () => {
    const raw = getStoreState();

    const profile = isObject(raw.profile)
      ? raw.profile
      : {};

    const trips = tripsFrom(raw);
    const upcomingTrips = upcomingTripsFrom(raw);
    const completedTrips = completedTripsFrom(raw);
    const nextTrip = upcomingTrips[0] || null;

    return {
      raw,
      profile,
      trips,
      upcomingTrips,
      completedTrips,
      nextTrip,
      nextFlight: nextTrip
        ? getFlightDetails(nextTrip)
        : null,
      nextHotel: nextTrip
        ? getHotelDetails(nextTrip)
        : null,
      statistics: {
        totalTrips: trips.length,
        upcomingTrips: upcomingTrips.length,
        completedTrips: completedTrips.length,
        countries: countriesCountFrom(raw),
        wishlist: list(raw.wishlist).length,
        memories: list(raw.memories).length
      }
    };
  };

  const formatCountdown = (trip) => {
    if (!trip) return "";

    const departureDateTime =
      getTripDepartureDateTime(trip);

    const target =
      departureDateTime ||
      toDate(trip.startDate);

    if (!target) {
      return "موعد الرحلة غير محدد";
    }

    const remainingMinutes =
      minutesUntil(target);

    if (
      remainingMinutes !== null &&
      remainingMinutes >= 0 &&
      remainingMinutes < 1440
    ) {
      const hours = Math.floor(
        remainingMinutes / 60
      );

      const minutes =
        remainingMinutes % 60;

      if (hours === 0) {
        return `متبقي ${minutes} دقيقة`;
      }

      if (minutes === 0) {
        return `متبقي ${hours} ساعة`;
      }

      return `متبقي ${hours} ساعة و${minutes} دقيقة`;
    }

    const remainingDays = daysUntil(target);

    if (remainingDays === null) {
      return "موعد الرحلة غير محدد";
    }

    if (remainingDays === 0) {
      return "موعد السفر اليوم";
    }

    if (remainingDays === 1) {
      return "متبقي يوم واحد";
    }

    if (remainingDays > 1) {
      return `متبقي ${remainingDays} يوم`;
    }

    return "بدأت الرحلة";
  };

  const getTripDestination = (trip) =>
    text(trip?.destination) ||
    [trip?.city, trip?.country]
      .filter(Boolean)
      .join("، ") ||
    text(trip?.title) ||
    "رحلة قادمة";

  const getTripStage = (trip) => {
    if (!trip) return "empty";

    const departure =
      getTripDepartureDateTime(trip) ||
      toDate(trip.startDate);

    const remainingMinutes =
      minutesUntil(departure);

    const remainingDays =
      daysUntil(departure);

    if (
      remainingMinutes !== null &&
      remainingMinutes <= 0 &&
      remainingMinutes >= -1440
    ) {
      return "travel-day";
    }

    if (
      remainingMinutes !== null &&
      remainingMinutes > 0 &&
      remainingMinutes <= 1440
    ) {
      return "within-day";
    }

    if (
      remainingDays !== null &&
      remainingDays <= 7
    ) {
      return "within-week";
    }

    if (
      remainingDays !== null &&
      remainingDays <= 30
    ) {
      return "within-month";
    }

    return "planning";
  };

  const getSmartTripMessage = (
    trip,
    flight,
    hotel
  ) => {
    const stage = getTripStage(trip);

    if (stage === "travel-day") {
      return {
        title: "رحلتك بدأت",
        message:
          "تأكد من مستنداتك واتجه إلى بوابة الصعود في الوقت المناسب."
      };
    }

    if (stage === "within-day") {
      if (flight?.airportArrivalDateTime) {
        return {
          title: "اليوم موعد السفر",
          message:
            `يفضل تكون في المطار الساعة ${formatTime(
              flight.airportArrivalDateTime
            )}.`
        };
      }

      return {
        title: "اليوم موعد السفر",
        message:
          "جهز مستنداتك وتأكد من وقت التوجه إلى المطار."
      };
    }

    if (stage === "within-week") {
      return {
        title: "قرب موعد الرحلة",
        message:
          hotel?.name
            ? "راجع التذكرة والحجز وخلك جاهز لأيام جميلة."
            : "راجع التذكرة وأضف بيانات الفندق إذا ما اكتملت."
      };
    }

    if (stage === "within-month") {
      return {
        title: "كل يوم يقربك من الرحلة",
        message:
          "راجع حجوزاتك وخطط لأهم التجارب اللي تباها."
      };
    }

    return {
      title: "رحلتك القادمة مرتبة",
      message:
        "خذ وقتك في التخطيط واستمتع بحماس الرحلة من الحين."
    };
  };

  const renderWelcome = (snapshot) => {
    const name =
      snapshot.profile.name ||
      Config.profile?.name ||
      "يوسف";

    return `
      <section class="tic-home-welcome" aria-labelledby="tic-home-welcome-title">
        <div class="tic-home-welcome-copy">
          <span class="tic-home-welcome-label">
            TRAVEL INTELLIGENCE CENTER
          </span>

          <h1 id="tic-home-welcome-title">
            هلا ${escapeHTML(name)}
          </h1>

          <p>
            خلّ رحلتك القادمة أجمل وأسهل.
          </p>
        </div>

        <div class="tic-home-welcome-icon" aria-hidden="true">
          ✈
        </div>
      </section>
    `;
  };

  const renderEmptyNextTrip = () => {
    const ui = getUI();

    return `
      <article class="tic-home-next-card tic-home-next-card-empty">
        <div class="tic-home-next-top">
          <div>
            <span class="tic-home-kicker">
              خطوتك القادمة
            </span>

            <h3>
              وين بتكون سفرتك الياية؟
            </h3>
          </div>

          <div class="tic-home-next-icon" aria-hidden="true">
            ✈
          </div>
        </div>

        <p class="tic-home-next-message">
          أنشئ رحلة جديدة وخلك جاهز لأجمل تجربة.
        </p>

        <div class="tic-home-next-actions">
          ${ui.button({
            label: "إنشاء رحلة",
            action: "home-new-trip",
            primary: true
          })}
        </div>
      </article>
    `;
  };

  const renderTripFact = (
    label,
    value,
    options = {}
  ) => {
    if (!text(value)) return "";

    return `
      <div class="tic-home-trip-fact${
        options.emphasis
          ? " is-emphasis"
          : ""
      }">
        <span>
          ${escapeHTML(label)}
        </span>

        <strong>
          ${escapeHTML(value)}
        </strong>
      </div>
    `;
  };

  const renderFlightRoute = (flight) => {
    if (
      !flight?.departureAirport &&
      !flight?.arrivalAirport
    ) {
      return "";
    }

    return `
      <div class="tic-home-flight-route">
        <div>
          <small>من</small>
          <strong>
            ${escapeHTML(
              flight.departureAirport ||
              "غير محدد"
            )}
          </strong>
        </div>

        <span aria-hidden="true">✈</span>

        <div>
          <small>إلى</small>
          <strong>
            ${escapeHTML(
              flight.arrivalAirport ||
              "غير محدد"
            )}
          </strong>
        </div>
      </div>
    `;
  };

  const renderSmartNextTrip = (snapshot) => {
    const ui = getUI();
    const trip = snapshot.nextTrip;
    const flight = snapshot.nextFlight;
    const hotel = snapshot.nextHotel;

    const duration = number(
      trip.durationDays,
      durationDays(
        trip.startDate,
        trip.endDate
      )
    );

    const smartMessage =
      getSmartTripMessage(
        trip,
        flight,
        hotel
      );

    const airlineFlight = [
      flight.airline,
      flight.flightNumber
    ]
      .filter(Boolean)
      .join(" • ");

    const terminalGate = [
      flight.terminal
        ? `مبنى ${flight.terminal}`
        : "",
      flight.gate
        ? `بوابة ${flight.gate}`
        : ""
    ]
      .filter(Boolean)
      .join(" • ");

    const tripDate = flight.departureDateTime
      ? formatDateTime(
          flight.departureDateTime
        )
      : formatShortDate(trip.startDate);

    const hasFlightDetails = Boolean(
      airlineFlight ||
      flight.departureDateTime ||
      terminalGate ||
      flight.departureAirport ||
      flight.arrivalAirport
    );

    const hasHotelDetails = Boolean(
      hotel.name ||
      hotel.confirmationNumber ||
      hotel.checkIn
    );

    return `
      <article
        class="tic-home-next-card tic-home-next-card-smart"
        data-trip-stage="${escapeHTML(
          getTripStage(trip)
        )}"
      >
        <div class="tic-home-next-top">
          <div>
            <span class="tic-home-kicker">
              ${escapeHTML(formatCountdown(trip))}
            </span>

            <h3>
              ${escapeHTML(
                trip.title ||
                getTripDestination(trip)
              )}
            </h3>

            <p>
              ${escapeHTML(getTripDestination(trip))}
            </p>
          </div>

          <div class="tic-home-next-icon" aria-hidden="true">
            ✈
          </div>
        </div>

        <div class="tic-home-trip-highlight">
          <strong>
            ${escapeHTML(smartMessage.title)}
          </strong>

          <p>
            ${escapeHTML(smartMessage.message)}
          </p>
        </div>

        <div class="tic-home-trip-meta">
          ${renderTripFact(
            "موعد السفر",
            tripDate
          )}

          ${renderTripFact(
            "المدة",
            duration > 0
              ? `${duration} يوم`
              : "غير محددة"
          )}

          ${renderTripFact(
            "الميزانية",
            ui.currency(trip.budget)
          )}
        </div>

        ${
          hasFlightDetails
            ? `
              <section class="tic-home-detail-block">
                <header>
                  <span>تفاصيل الطيران</span>
                  <strong>رحلتك الجوية</strong>
                </header>

                ${renderFlightRoute(flight)}

                <div class="tic-home-detail-grid">
                  ${renderTripFact(
                    "شركة ورقم الرحلة",
                    airlineFlight
                  )}

                  ${renderTripFact(
                    "الإقلاع",
                    flight.departureDateTime
                      ? formatTime(
                          flight.departureDateTime
                        )
                      : ""
                  )}

                  ${renderTripFact(
                    "الوصول",
                    flight.arrivalDateTime
                      ? formatTime(
                          flight.arrivalDateTime
                        )
                      : ""
                  )}

                  ${renderTripFact(
                    "المبنى والبوابة",
                    terminalGate
                  )}

                  ${renderTripFact(
                    "كن في المطار",
                    flight.airportArrivalDateTime
                      ? formatTime(
                          flight.airportArrivalDateTime
                        )
                      : "",
                    {
                      emphasis: true
                    }
                  )}
                </div>
              </section>
            `
            : `
              <button
                type="button"
                class="tic-home-add-details"
                data-tic-action="home-edit-next-trip"
              >
                <span aria-hidden="true">＋</span>
                أضف بيانات التذكرة والطيران
              </button>
            `
        }

        ${
          hasHotelDetails
            ? `
              <section class="tic-home-detail-block tic-home-hotel-block">
                <header>
                  <span>الإقامة</span>
                  <strong>
                    ${escapeHTML(
                      hotel.name ||
                      "حجز الفندق"
                    )}
                  </strong>
                </header>

                <div class="tic-home-detail-grid">
                  ${renderTripFact(
                    "تسجيل الدخول",
                    hotel.checkIn
                      ? formatDateTime(hotel.checkIn)
                      : ""
                  )}

                  ${renderTripFact(
                    "رقم الحجز",
                    hotel.confirmationNumber
                  )}
                </div>
              </section>
            `
            : ""
        }

        <div class="tic-home-next-actions">
          ${ui.button({
            label: "عرض الرحلة",
            route: "trips",
            view: "details",
            params: {
              tripId: trip.id
            },
            primary: true
          })}

          ${ui.button({
            label: "تعديل البيانات",
            action: "home-edit-next-trip"
          })}
        </div>
      </article>
    `;
  };

  const renderNextTrip = (snapshot) =>
    snapshot.nextTrip
      ? renderSmartNextTrip(snapshot)
      : renderEmptyNextTrip();

  const renderStatistics = (snapshot) => {
    const stats = [
      {
        icon: "✈",
        value: snapshot.statistics.totalTrips,
        label: "الرحلات"
      },
      {
        icon: "◎",
        value: snapshot.statistics.countries,
        label: "الدول"
      },
      {
        icon: "☆",
        value: snapshot.statistics.wishlist,
        label: "الأمنيات"
      },
      {
        icon: "◈",
        value: snapshot.statistics.memories,
        label: "الذكريات"
      }
    ];

    return `
      <div class="tic-home-stats">
        ${stats
          .map(
            (item) => `
              <article class="tic-home-stat">
                <span class="tic-home-stat-icon" aria-hidden="true">
                  ${item.icon}
                </span>

                <strong>
                  ${number(item.value)}
                </strong>

                <small>
                  ${escapeHTML(item.label)}
                </small>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  };

  const renderInspiration = (snapshot) => {
    const trip = snapshot.nextTrip;
    const remainingDays = trip
      ? daysUntil(
          getTripDepartureDateTime(trip) ||
          trip.startDate
        )
      : null;

    let title = "رحلتك تبدأ بفكرة جميلة";
    let message =
      "اختر وجهة تحبها، وخطط لها على راحتك، وخلك مستمتع من أول خطوة.";

    if (trip && remainingDays !== null) {
      if (
        remainingDays <= 7 &&
        remainingDays >= 0
      ) {
        title = "قرب موعد المغامرة";
        message =
          "رتب أمورك بهدوء واستمتع بحماس الأيام الأخيرة قبل السفر.";
      } else if (
        remainingDays <= 30 &&
        remainingDays > 7
      ) {
        title = "كل يوم يقربك من رحلتك";
        message =
          "استمتع بالتخطيط؛ أجمل الرحلات تبدأ قبل الوصول.";
      } else if (remainingDays > 30) {
        title = "عندك وقت تخلي الرحلة أجمل";
        message =
          "اكتشف تفاصيل أكثر عن وجهتك واختر التجارب اللي تناسبك.";
      }
    }

    return `
      <article class="tic-home-inspiration">
        <div class="tic-home-inspiration-icon" aria-hidden="true">
          ✦
        </div>

        <div class="tic-home-inspiration-copy">
          <span>
            إلهام السفر
          </span>

          <h3>
            ${escapeHTML(title)}
          </h3>

          <p>
            ${escapeHTML(message)}
          </p>
        </div>
      </article>
    `;
  };

  const renderSectionHeader = ({
    eyebrow,
    title,
    subtitle = ""
  }) => `
    <header class="tic-home-section-header">
      <span>
        ${escapeHTML(eyebrow)}
      </span>

      <h2>
        ${escapeHTML(title)}
      </h2>

      ${
        subtitle
          ? `<p>${escapeHTML(subtitle)}</p>`
          : ""
      }
    </header>
  `;

  const renderPage = (snapshot) => `
    <div
      class="tic-module tic-home-page"
      data-page="home"
      data-page-version="${PAGE_VERSION}"
      data-has-next-trip="${
        snapshot.nextTrip ? "true" : "false"
      }"
    >
      ${renderWelcome(snapshot)}

      <section class="tic-home-section tic-home-next-section">
        ${renderSectionHeader({
          eyebrow: "NEXT JOURNEY",
          title: "الرحلة القادمة",
          subtitle: snapshot.nextTrip
            ? "أهم تفاصيل سفرتك الأقرب في مكان واحد."
            : "تفاصيل سفرتك الأقرب بشكل بسيط."
        })}

        ${renderNextTrip(snapshot)}
      </section>

      <section class="tic-home-section tic-home-snapshot-section">
        ${renderSectionHeader({
          eyebrow: "YOUR TRAVEL",
          title: "سفراتك",
          subtitle: "أرقام خفيفة من سجل سفرك."
        })}

        ${renderStatistics(snapshot)}
      </section>

      <section class="tic-home-section tic-home-inspiration-section">
        ${renderInspiration(snapshot)}
      </section>
    </div>
  `;

  const refresh = () => {
    if (!state.container || !state.mounted) {
      return false;
    }

    const snapshot = buildSnapshot();
    state.lastSnapshot = snapshot;

    state.container.innerHTML =
      renderPage(snapshot);

    emit("refreshed", {
      statistics: snapshot.statistics,
      nextTripId:
        snapshot.nextTrip?.id || null
    });

    return true;
  };

  const openCreateTrip = () => {
    const tripForm = getTripForm();

    if (
      tripForm &&
      typeof tripForm.openCreate === "function"
    ) {
      return tripForm.openCreate({
        source: "home",
        mode: "create",
        smartImport: true
      });
    }

    return getRouter()?.go?.("trip-form", {
      params: {
        mode: "create",
        smartImport: true
      },
      source: "home-new-trip"
    });
  };

  const openEditTrip = (tripId) => {
    const tripForm = getTripForm();

    if (
      tripForm &&
      typeof tripForm.openEdit === "function"
    ) {
      return tripForm.openEdit(tripId, {
        source: "home",
        smartImport: true
      });
    }

    return getRouter()?.go?.("trip-form", {
      params: {
        mode: "edit",
        tripId,
        smartImport: true
      },
      source: "home-edit-next-trip"
    });
  };

  const registerActions = () => {
    const ui = getUI();

    if (
      !ui ||
      typeof ui.registerAction !== "function"
    ) {
      return;
    }

    const register = (name, handler) => {
      if (ui.hasAction?.(name)) return;

      state.actionUnsubscribers.push(
        ui.registerAction(name, handler)
      );
    };

    register(
      "home-new-trip",
      openCreateTrip
    );

    register("home-edit-next-trip", () => {
      const tripId =
        state.lastSnapshot?.nextTrip?.id;

      if (!tripId) {
        getUI()?.toast?.(
          "لا توجد رحلة قادمة للتعديل.",
          "warning"
        );

        return false;
      }

      return openEditTrip(tripId);
    });
  };

  const subscribeToStore = () => {
    const store = getStore();

    if (
      !store ||
      typeof store.subscribe !== "function" ||
      state.unsubscribeStore
    ) {
      return;
    }

    state.unsubscribeStore = store.subscribe(() => {
      if (state.mounted) {
        refresh();
      }
    });
  };

  const HomePage = {
    id: PAGE_ID,
    title: "الرئيسية",
    icon: "⌂",
    version: PAGE_VERSION,

    init() {
      if (state.initialized) {
        return this.diagnostics();
      }

      registerActions();
      subscribeToStore();

      state.initialized = true;

      emit("initialized", {
        version: PAGE_VERSION
      });

      return this.diagnostics();
    },

    render() {
      this.init();

      const snapshot = buildSnapshot();
      state.lastSnapshot = snapshot;

      return renderPage(snapshot);
    },

    mount(context = {}) {
      this.init();

      const container = resolveContainer(
        context.container
      );

      if (!container) {
        throw new Error(
          "TIC Home Page Error: route container was not found."
        );
      }

      state.container = container;
      state.mounted = true;

      const snapshot = buildSnapshot();
      state.lastSnapshot = snapshot;

      container.innerHTML =
        renderPage(snapshot);

      emit("mounted", {
        nextTripId:
          snapshot.nextTrip?.id || null,
        statistics: snapshot.statistics
      });

      return container;
    },

    afterEnter(context = {}) {
      const container = resolveContainer(
        context.container
      );

      if (container) {
        state.container = container;
        state.mounted = true;
      }

      refresh();

      return true;
    },

    unmount() {
      state.mounted = false;
      state.container = null;

      emit("unmounted");

      return true;
    },

    refresh,

    getSnapshot() {
      return clone(
        state.lastSnapshot ||
        buildSnapshot()
      );
    },

    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError(
          "TIC Home subscriber must be a function."
        );
      }

      state.subscribers.add(listener);

      return () =>
        state.subscribers.delete(listener);
    },

    destroy() {
      this.unmount();

      if (
        typeof state.unsubscribeStore === "function"
      ) {
        state.unsubscribeStore();
      }

      state.actionUnsubscribers.forEach(
        (unsubscribe) => {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        }
      );

      state.unsubscribeStore = null;
      state.actionUnsubscribers = [];
      state.subscribers.clear();
      state.lastSnapshot = null;
      state.initialized = false;

      return true;
    },

    diagnostics() {
      const snapshot =
        state.lastSnapshot ||
        buildSnapshot();

      return {
        id: this.id,
        title: this.title,
        version: this.version,
        initialized: state.initialized,
        mounted: state.mounted,
        hasContainer: Boolean(state.container),
        storeAvailable: Boolean(getStore()),
        routerAvailable: Boolean(getRouter()),
        uiAvailable: Boolean(getUI()),
        tripFormAvailable: Boolean(
          getTripForm()
        ),
        actionCount:
          state.actionUnsubscribers.length,
        subscriberCount:
          state.subscribers.size,
        hasSnapshot: Boolean(
          state.lastSnapshot
        ),
        hasNextTrip: Boolean(
          snapshot.nextTrip
        ),
        nextTripId:
          snapshot.nextTrip?.id || null,
        smartImportRequested: true
      };
    }
  };

  window.TIC = window.TIC || {};
  window.TIC.Pages = window.TIC.Pages || {};
  window.TIC.Pages.home = HomePage;
  window.TICHomePage = HomePage;

  const router = getRouter();

  if (
    router &&
    typeof router.register === "function"
  ) {
    if (!router.has?.("home")) {
      router.register("home", {
        id: "home",
        title: "الرئيسية",
        module: "home",
        icon: "⌂",
        visible: true,
        order: 1
      });
    }

    if (
      typeof router.registerPage === "function"
    ) {
      router.registerPage(
        "home",
        HomePage
      );
    }
  }

  HomePage.init();
})(window, document);
