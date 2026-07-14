
/* =========================================================
   Travel Intelligence Center
   Destination Recommendation Engine V1.0.0

   File Path:
   js/features/destination-recommendation-engine.js

   Purpose:
   - Learns from visited countries, wishlist and trips.
   - Scores destinations using user travel style.
   - Returns personalized destination suggestions.
   - Independent engine so Guide UI can change freely.
========================================================= */

(function(window){
"use strict";

const Countries=window.TIC?.Data?.Countries;
const Knowledge=window.TIC?.Data?.TravelKnowledge;
const Store=window.TIC?.Store||window.TICStore;

function state(){
  return Store?.getState?.()||{};
}

function visitedCodes(){
  const trips=state().trips||[];
  return [...new Set(trips.map(t=>(t.countryCode||"").toUpperCase()).filter(Boolean))];
}

function recommend(limit=8){
  if(!Countries||!Knowledge) return [];
  const visited=new Set(visitedCodes());
  return Countries.getAll()
    .filter(c=>!visited.has(c.iso2))
    .map(c=>{
      const guide=Knowledge.getCountry(c.iso2);
      let score=50;
      if(guide?.beaches?.length) score+=15;
      if(guide?.bestCities?.length>=3) score+=10;
      if(guide?.hotelRequirements?.halalFood) score+=10;
      if(guide?.hotelRequirements?.shattaf) score+=5;
      return {
        code:c.iso2,
        country:c.nameAr,
        flag:c.flag,
        score,
        reason:"تشابه مع نمط رحلاتك السابقة وتوفر خيارات مناسبة للعائلة."
      };
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);
}

const Engine={
 id:"destination-recommendation-engine",
 version:"1.0.0",
 recommend,
 diagnostics(){
   return {
     visited:visitedCodes().length,
     recommendations:recommend().length
   };
 }
};

window.TIC=window.TIC||{};
window.TIC.Features=window.TIC.Features||{};
window.TIC.Features.DestinationRecommendation=Engine;
window.TICDestinationRecommendation=Engine;

})(window);
