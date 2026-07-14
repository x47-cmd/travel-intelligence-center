
/* =========================================================
 Travel Intelligence Center
 Guide Search Engine V1.0.0
 File: js/features/guide-search-engine.js
 Purpose:
 - Country picker with search.
 - Arabic/English search.
 - Alphabet grouping.
 - Designed to power Guide page only.
=========================================================*/
(function(window){
"use strict";

const Countries=window.TIC?.Data?.Countries;
const Knowledge=window.TIC?.Data?.TravelKnowledge;

function countries(){
 return Countries?Countries.getAll():[];
}

function search(query=""){
 return Countries?.search?.(query,{limit:300})||[];
}

function group(list){
 const groups={};
 list.forEach(c=>{
   const k=(c.nameAr||"#").charAt(0);
   (groups[k]=groups[k]||[]).push(c);
 });
 return Object.keys(groups).sort((a,b)=>a.localeCompare(b,"ar")).map(letter=>({
   letter,
   countries:groups[letter].sort((a,b)=>a.nameAr.localeCompare(b.nameAr,"ar"))
 }));
}

function openCountry(code,options={}){
 const guide=Knowledge?.buildGuideContext?.(code,options);
 return guide||null;
}

const Engine={
 id:"guide-search-engine",
 version:"1.0.0",
 all:countries,
 search,
 grouped(){return group(countries());},
 groupedSearch(q){return group(search(q));},
 openCountry,
 diagnostics(){
   return{
     countries:countries().length,
     searchable:search("").length
   };
 }
};

window.TIC=window.TIC||{};
window.TIC.Features=window.TIC.Features||{};
window.TIC.Features.GuideSearch=Engine;
window.TICGuideSearch=Engine;

})(window);
