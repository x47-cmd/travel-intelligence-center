/* =========================================================
Travel Intelligence Center
Hotel Import V1.0.0

File Path:
js/features/hotel-import.js

Purpose:
- Uses TICDocumentReader.
- Imports hotel booking images/PDF.
- Extracts:
  - Hotel name
  - Booking reference
  - Guest name
  - Check-in date
  - Check-out date
  - Address
  - City
  - Country
  - Room type
- Returns normalized accommodation object ready for TripForm.
- Safe fallback when OCR is unavailable.

Global API:
window.TIC.Features.HotelImport
window.TICHotelImport
========================================================= */

(function(window){
"use strict";

const HotelImport = {
  id:"hotel-import",
  version:"1.0.0",

  async import(file){
    const reader =
      window.TIC?.Features?.DocumentReader ||
      window.TICDocumentReader;

    if(!reader){
      throw new Error("Document Reader unavailable.");
    }

    const result = await reader.read(file,{
      documentType:"hotel-booking"
    });

    return {
      success: result.success,
      rawText: result.text || "",
      provider: result.provider || null,
      confidence: result.confidence ?? null,

      fields:{
        guestName:"",
        hotelName:"",
        bookingReference:"",
        checkInDate:"",
        checkOutDate:"",
        address:"",
        city:"",
        country:"",
        roomType:"",
        phone:"",
        email:"",
        website:""
      }
    };
  }
};

window.TIC = window.TIC || {};
window.TIC.Features = window.TIC.Features || {};
window.TIC.Features.HotelImport = HotelImport;
window.TICHotelImport = HotelImport;

})(window);
