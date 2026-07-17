/* =========================================================
Travel Intelligence Center
Virtual Scroll Engine V1.0.0

File:
js/extensions/performance/virtual-scroll.js

Purpose:
- Render only visible cards.
- Greatly improve long pages.
- Uses IntersectionObserver when available.
========================================================= */

(function(global){
"use strict";

function observe(container,selector,onVisible){

  if(!container) return;

  const items=[...container.querySelectorAll(selector)];

  if(!("IntersectionObserver" in window)){
    items.forEach(el=>onVisible?.(el));
    return;
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        onVisible?.(entry.target);
        observer.unobserve(entry.target);
      }
    });
  },{
    root:null,
    rootMargin:"250px",
    threshold:0.01
  });

  items.forEach(item=>observer.observe(item));

  return observer;
}

function lazySection(section){

  if(!section) return;

  section.style.contentVisibility="auto";
  section.style.containIntrinsicSize="800px";
}

function prepare(container){

  if(!container) return;

  [...container.children].forEach(child=>{
    child.style.contentVisibility="auto";
    child.style.containIntrinsicSize="400px";
  });
}

window.TravelVirtualScroll={
  version:"1.0.0",
  observe,
  lazySection,
  prepare
};

})(window);
