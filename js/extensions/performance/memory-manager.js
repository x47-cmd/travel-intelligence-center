/* =========================================================
Travel Intelligence Center
Memory Manager V1.0.0

File:
js/extensions/performance/memory-manager.js

Purpose:
- Clean expired caches.
- Release unused references.
- Monitor approximate memory usage.
========================================================= */

(function(global){
"use strict";

const cleaners=new Set();

function register(fn){
  if(typeof fn==="function"){
    cleaners.add(fn);
  }
}

function unregister(fn){
  cleaners.delete(fn);
}

function cleanup(){
  cleaners.forEach(fn=>{
    try{
      fn();
    }catch(e){
      console.warn("[MemoryManager]",e);
    }
  });
}

function schedule(interval=60000){
  return setInterval(cleanup,interval);
}

function memoryInfo(){
  const mem=performance.memory;
  if(!mem){
    return {
      supported:false
    };
  }

  return {
    supported:true,
    used:mem.usedJSHeapSize,
    total:mem.totalJSHeapSize,
    limit:mem.jsHeapSizeLimit
  };
}

global.TravelMemoryManager={
  version:"1.0.0",
  register,
  unregister,
  cleanup,
  schedule,
  memoryInfo
};

})(window);
