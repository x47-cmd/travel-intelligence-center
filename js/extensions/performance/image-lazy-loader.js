/* =========================================================
Travel Intelligence Center
Image Lazy Loader V1.0.0

File:
js/extensions/performance/image-lazy-loader.js

Purpose:
- Lazy-load images.
- Decode images before display.
- Reduce initial page load.
========================================================= */

(function(global){
"use strict";

function loadImage(img){
  if(!img) return;

  const src=img.dataset.src||img.dataset.lazySrc;
  if(!src) return;

  const reveal=()=>{
    img.classList.add("image-loaded");
    img.removeAttribute("data-src");
    img.removeAttribute("data-lazy-src");
  };

  if(img.decode){
    img.src=src;
    img.decode().then(reveal).catch(reveal);
  }else{
    img.onload=reveal;
    img.src=src;
  }
}

function observe(root=document){

  const images=[...root.querySelectorAll("img[data-src],img[data-lazy-src]")];

  if(!("IntersectionObserver" in window)){
    images.forEach(loadImage);
    return;
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        loadImage(entry.target);
        observer.unobserve(entry.target);
      }
    });
  },{
    root:null,
    rootMargin:"300px",
    threshold:0.01
  });

  images.forEach(img=>observer.observe(img));

  return observer;
}

window.TravelImageLazyLoader={
  version:"1.0.0",
  observe,
  loadImage
};

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>observe(),{once:true});
}else{
  observe();
}

})(window);
