/* =========================================================
Travel Intelligence Center
Data Prefetch Engine V1.0.0

File:
js/extensions/performance/data-prefetch.js

Purpose:
- Prefetch page data during idle time.
- Cache lightweight results.
- Avoid duplicate fetches.
========================================================= */

(function(global){
"use strict";

const cache=new Map();
const pending=new Map();

function prefetch(key,loader){
  if(!key||typeof loader!=="function") return Promise.resolve(null);

  if(cache.has(key)) return Promise.resolve(cache.get(key));
  if(pending.has(key)) return pending.get(key);

  const run=()=>{
    const p=Promise.resolve(loader())
      .then(result=>{
        cache.set(key,{
          value:result,
          time:Date.now()
        });
        pending.delete(key);
        return result;
      })
      .catch(err=>{
        pending.delete(key);
        throw err;
      });

    pending.set(key,p);
    return p;
  };

  if("requestIdleCallback" in window){
    return new Promise(resolve=>{
      requestIdleCallback(()=>{
        resolve(run());
      },{timeout:800});
    });
  }

  return run();
}

function get(key){
  return cache.get(key)?.value ?? null;
}

function has(key){
  return cache.has(key);
}

function invalidate(key){
  cache.delete(key);
}

function clear(){
  cache.clear();
  pending.clear();
}

window.TravelDataPrefetch={
  version:"1.0.0",
  prefetch,
  get,
  has,
  invalidate,
  clear
};

})(window);
