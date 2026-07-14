/* =========================================================
Travel Intelligence Center
Application Bootstrap V1.0.0

File Path:
js/app.js

Purpose:
- Bootstraps the application.
- Initializes Config, Store, Router and UI.
- Registers page modules.
- Starts the default route.
========================================================= */

(function(window,document){
"use strict";

window.TIC=window.TIC||{};
const TIC=window.TIC;

const App={
 version:"1.0.0",
 initialized:false,

 init(){
  if(this.initialized) return;

  TIC.Config=TIC.Config||window.TICConfig||{};
  TIC.Store=TIC.Store||window.TICStore||{};
  TIC.Router=TIC.Router||window.TICRouter||{};
  TIC.UI=TIC.UI||window.TICUI||{};
  TIC.Pages=TIC.Pages||{};

  if(typeof TIC.Store.init==="function"){
    TIC.Store.init();
  }

  if(typeof TIC.Router.init==="function"){
    TIC.Router.init({
      container:
        document.querySelector("[data-router-view]")||
        document.querySelector("#app-view")||
        document.querySelector("#app")
    });
  }

  if(typeof TIC.Router.registerPage==="function"){
    Object.keys(TIC.Pages).forEach((key)=>{
      TIC.Router.registerPage(key,TIC.Pages[key]);
    });
  }

  const start=()=>{
    if(typeof TIC.Router.go==="function"){
      TIC.Router.go("home");
    }else if(TIC.Pages.home?.mount){
      TIC.Pages.home.mount({
        container:
          document.querySelector("[data-router-view]")||
          document.querySelector("#app-view")||
          document.querySelector("#app")
      });
    }
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",start,{once:true});
  }else{
    start();
  }

  this.initialized=true;
  console.log("Travel Intelligence Center started.");
 }
};

TIC.App=App;
window.TICApp=App;

App.init();

})(window,document);
