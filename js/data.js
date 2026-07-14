/* =========================================================
Travel Intelligence Center
Travel Database V1.0.0

File Path:
js/data.js

Purpose:
- Central seed data for the application.
- Demo destinations.
- Countries.
- Currencies.
- Airlines.
- Packing templates.
- Travel document templates.
- Default notifications.
========================================================= */

(function(window){
"use strict";

window.TIC = window.TIC || {};

const Data = {

version:"1.0.0",

countries:[
 {code:"AE",name:"الإمارات",currency:"AED"},
 {code:"KZ",name:"كازاخستان",currency:"KZT"},
 {code:"MV",name:"المالديف",currency:"MVR"},
 {code:"TH",name:"تايلند",currency:"THB"},
 {code:"ES",name:"إسبانيا",currency:"EUR"}
],

destinations:[
 {
   id:"almaty",
   country:"كازاخستان",
   city:"ألماتي",
   bestSeason:"May - September",
   visa:"تحقق من آخر المتطلبات",
   rating:4.8
 },
 {
   id:"maldives",
   country:"المالديف",
   city:"ماليه",
   bestSeason:"November - April",
   visa:"Visa on Arrival",
   rating:5
 },
 {
   id:"phuket",
   country:"تايلند",
   city:"فوكيت",
   bestSeason:"November - March",
   visa:"حسب الجنسية",
   rating:4.7
 },
 {
   id:"madrid",
   country:"إسبانيا",
   city:"مدريد",
   bestSeason:"Spring / Autumn",
   visa:"شنغن",
   rating:4.9
 }
],

airlines:[
 "الاتحاد",
 "طيران الإمارات",
 "فلاي دبي",
 "القطرية",
 "التركية"
],

packingTemplates:{
 family:[
   "جواز السفر",
   "ملابس",
   "شاحن",
   "أدوية",
   "بطاقات بنكية"
 ],
 beach:[
   "ملابس سباحة",
   "واقي شمس",
   "نظارات",
   "شبشب"
 ],
 business:[
   "لابتوب",
   "شاحن",
   "مستندات",
   "بدلة رسمية"
 ]
},

documentTemplates:[
 "Passport",
 "Visa",
 "Flight Ticket",
 "Hotel Booking",
 "Insurance"
],

notifications:[
 {
   id:1,
   title:"مرحباً بك",
   message:"تم تجهيز مركز السفر الذكي."
 }
]

};

window.TIC.Data = Data;
window.TICData = Data;

})(window);
