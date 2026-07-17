/* =========================================================
Travel Intelligence Center
Render Optimizer V1.0.0

File:
js/extensions/performance/render-optimizer.js

Purpose:
- Batch DOM updates.
- Schedule rendering with requestAnimationFrame.
- Prevent duplicate renders.
- Reduce layout thrashing.
========================================================= */

(function(global){
"use strict";

const queue=new Map();
let scheduled=false;

function flush(){
  scheduled=false;
  const jobs=[...queue.values()];
  queue.clear();

  for(const job of jobs){
    try{
      job();
    }catch(e){
      console.error("[RenderOptimizer]",e);
    }
  }
}

function schedule(){
  if(scheduled) return;
  scheduled=true;
  requestAnimationFrame(flush);
}

function render(key,callback){
  if(typeof callback!=="function") return;
  queue.set(key||Symbol(),callback);
  schedule();
}

function batch(callback){
  render("batch:"+Date.now(),callback);
}

function measure(fn){
  const t0=performance.now();
  const result=fn?.();
  return {
    result,
    duration:performance.now()-t0
  };
}

function mutate(callback){
  requestAnimationFrame(()=>{
    callback?.();
  });
}

global.TravelRenderOptimizer={
  version:"1.0.0",
  render,
  batch,
  mutate,
  measure
};

})(window);
