/* =========================================================
Travel Intelligence Center
Performance Integration Bootstrap V1.0.0

File:
js/extensions/performance-integration/integration-bootstrap.js

Purpose:
- Starts all integration adapters.
- Registers them in a safe order.
- Continues even if one adapter fails.
========================================================= */

(function(global){
"use strict";

const modules=[
  "TravelPerformanceIntegration",
  "TravelAppRouteAdapter",
  "TravelTripsPerformanceAdapter",
  "TravelGuidePerformanceAdapter",
  "TravelCacheInvalidationAdapter"
];

function initialize(){

  const loaded=[];

  modules.forEach(name=>{
    const mod=global[name];
    if(!mod) return;

    try{

      if(typeof mod.initialize==="function"){
        mod.initialize();
      }else if(typeof mod.register==="function"){
        mod.register();
      }

      loaded.push({
        module:name,
        version:mod.version||"unknown"
      });

    }catch(err){
      console.warn("[IntegrationBootstrap]",name,err);
    }
  });

  global.TravelIntegrationStatus={
    version:"1.0.0",
    loaded,
    total:modules.length,
    startedAt:new Date().toISOString()
  };

  console.info(
    "[Travel Integration]",
    loaded.length,
    "integration modules loaded"
  );
}

if(document.readyState==="loading"){
  document.addEventListener(
    "DOMContentLoaded",
    initialize,
    {once:true}
  );
}else{
  initialize();
}

global.TravelIntegrationBootstrap={
  version:"1.0.0",
  initialize
};

})(window);
