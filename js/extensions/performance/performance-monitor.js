/* =========================================================
Travel Intelligence Center
Performance Monitor V1.0.0

File:
js/extensions/performance/performance-monitor.js

Purpose:
- Monitor page performance.
- Measure navigation and render times.
- Detect slow operations.
========================================================= */

(function(global){
"use strict";

const metrics=[];

function mark(name){
  performance.mark(name);
}

function measure(name,start,end){
  try{
    performance.measure(name,start,end);
    const entry=performance.getEntriesByName(name).pop();
    if(entry){
      metrics.push({
        name,
        duration:entry.duration,
        time:Date.now()
      });
    }
    return entry;
  }catch(e){
    return null;
  }
}

function slow(threshold=120){
  return metrics.filter(m=>m.duration>threshold);
}

function latest(limit=20){
  return metrics.slice(-limit);
}

function clear(){
  metrics.length=0;
  performance.clearMarks();
  performance.clearMeasures();
}

function stats(){
  if(metrics.length===0){
    return {
      count:0,
      average:0,
      slow:[]
    };
  }

  const avg=metrics.reduce((a,b)=>a+b.duration,0)/metrics.length;

  return{
    count:metrics.length,
    average:Number(avg.toFixed(2)),
    slow:slow()
  };
}

window.TravelPerformanceMonitor={
  version:"1.0.0",
  mark,
  measure,
  latest,
  slow,
  clear,
  stats
};

})(window);
