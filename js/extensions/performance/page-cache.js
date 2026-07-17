/* =========================================================
Travel Intelligence Center
Page Cache Engine V1.0.0

File:
js/extensions/performance/page-cache.js

Purpose:
- Cache rendered pages in memory.
- Restore cached DOM instantly.
- LRU cache to avoid memory growth.
- Safe invalidation and refresh support.
- Designed as an extension without modifying legacy pages.
========================================================= */

(function(global){
"use strict";

const CACHE=new Map();
const MAX_PAGES=6;

function touch(key){
  if(!CACHE.has(key)) return;
  const value=CACHE.get(key);
  CACHE.delete(key);
  CACHE.set(key,value);
}

function save(route,html){
  if(!route||!html) return;
  if(CACHE.has(route)) CACHE.delete(route);
  CACHE.set(route,{
    html,
    savedAt:Date.now()
  });
  while(CACHE.size>MAX_PAGES){
    const first=CACHE.keys().next().value;
    CACHE.delete(first);
  }
}

function restore(route){
  if(!CACHE.has(route)) return null;
  touch(route);
  return CACHE.get(route).html;
}

function invalidate(route){
  CACHE.delete(route);
}

function clear(){
  CACHE.clear();
}

function stats(){
  return {
    pages:CACHE.size,
    maxPages:MAX_PAGES,
    routes:[...CACHE.keys()]
  };
}

global.TravelPageCache={
  version:"1.0.0",
  save,
  restore,
  invalidate,
  clear,
  stats
};

})(window);
