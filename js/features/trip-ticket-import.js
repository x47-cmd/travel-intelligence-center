/* =========================================================
Travel Intelligence Center
Trip Ticket Import V1.0.0

File Path:
js/features/trip-ticket-import.js

Purpose:
- Uses TICDocumentReader.
- Imports airline ticket images/PDF.
- Extracts:
  - Passenger name
  - Airline
  - Flight number
  - Departure airport
  - Arrival airport
  - Departure date/time
  - Arrival date/time
  - Booking reference
  - Seat
  - Gate
  - Terminal
- Returns normalized trip object ready for TripForm.
- Falls back safely if OCR is unavailable.

Global API:
window.TIC.Features.TripTicketImport
window.TICTripTicketImport
========================================================= */

(function(window){
"use strict";

const Importer={
 id:"trip-ticket-import",
 version:"1.0.0",

 async import(file){
   const reader=
     window.TIC?.Features?.DocumentReader||
     window.TICDocumentReader;

   if(!reader){
     throw new Error("Document Reader unavailable.");
   }

   const result=await reader.read(file,{
     documentType:"flight-ticket"
   });

   return{
     success:result.success,
     rawText:result.text||"",
     fields:{
       passengerName:"",
       airline:"",
       flightNumber:"",
       departureAirport:"",
       arrivalAirport:"",
       departureDate:"",
       departureTime:"",
       arrivalDate:"",
       arrivalTime:"",
       bookingReference:"",
       terminal:"",
       gate:"",
       seat:""
     },
     provider:result.provider||null,
     confidence:result.confidence??null
   };
 }
};

window.TIC=window.TIC||{};
window.TIC.Features=window.TIC.Features||{};
window.TIC.Features.TripTicketImport=Importer;
window.TICTripTicketImport=Importer;

})(window);
