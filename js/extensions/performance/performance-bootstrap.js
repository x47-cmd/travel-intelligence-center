/* =========================================================
Travel Intelligence Center
Performance Bootstrap V1.0.0

File:
js/extensions/performance/performance-bootstrap.js

Purpose:
- Initialize all performance modules.
- Safe startup sequence.
- Gracefully skips missing modules.
========================================================= */

(function(global){
"use strict";

const modules=[
  "TravelPerformance",
  "TravelRoutePerformance",
  "TravelPageCache",
  "TravelRenderOptimizer",
  "TravelVirtualScroll",
  "TravelImageLazyLoader",
  "TravelDataPrefetch",
  "TravelMemoryManager",
  "TravelPerformanceMonitor"
];

function init(){

  const loaded=[];

  modules.forEach(name=>{
    const mod=global[name];

    if(!mod) return;

    try{

      if(typeof mod.initialize==="function"){
        mod.initialize();
      }

      if(name==="TravelMemoryManager" && typeof mod.schedule==="function"){
        mod.schedule(60000);
      }

      loaded.push({
        module:name,
        version:mod.version||"unknown"
      });

    }catch(err){
      console.warn("[PerformanceBootstrap]",name,err);
    }

  });

  console.info(
    "[Travel Performance]",
    loaded.length,
    "modules loaded"
  );

  global.TravelPerformanceStatus={
    loaded,
    total:modules.length,
    initializedAt:new Date().toISOString()
  };

}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",init,{once:true});
}else{
  init();
}

global.TravelPerformanceBootstrap={
  version:"1.0.0",
  initialize:init
};

})(window);
