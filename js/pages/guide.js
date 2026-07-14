/* =========================================================
Travel Intelligence Center
Guide Page Module V1.0.0

File Path:
js/pages/guide.js

Purpose:
- Destination guide center.
- Browse countries and cities.
- Search destinations.
- Show weather placeholder, currency, visa notes.
- Favorite destinations.
- Integrates with TIC Store/UI/Router.

This module registers:
window.TIC.Pages.guide
window.TICGuidePage
========================================================= */

(function(window){
"use strict";

window.TIC=window.TIC||{};
window.TIC.Pages=window.TIC.Pages||{};

const GuidePage={
 id:"guide",
 title:"دليل السفر",
 version:"1.0.0",

 render(){
  return `
  <section class="tic-page">
    <div class="tic-hero">
      <small>Travel Guide</small>
      <h2>دليل السفر</h2>
      <p>استكشف الدول والمدن واحفظ وجهاتك المفضلة.</p>
    </div>

    <div class="tic-card">
      <h3>البحث عن وجهة</h3>
      <input class="tic-input" placeholder="ابحث عن دولة أو مدينة">
    </div>

    <div class="tic-grid">
      <div class="tic-card">
        <h3>الدول</h3>
        <p>عرض جميع الدول.</p>
      </div>

      <div class="tic-card">
        <h3>المدن</h3>
        <p>عرض المدن السياحية.</p>
      </div>

      <div class="tic-card">
        <h3>التأشيرات</h3>
        <p>معلومات السفر الأساسية.</p>
      </div>

      <div class="tic-card">
        <h3>العملة</h3>
        <p>العملة وأسعار الصرف.</p>
      </div>

      <div class="tic-card">
        <h3>الطقس</h3>
        <p>ملخص حالة الطقس.</p>
      </div>

      <div class="tic-card">
        <h3>المفضلة</h3>
        <p>وجهاتك المحفوظة.</p>
      </div>
    </div>
  </section>`;
 },

 mount(ctx={}){
   const c=(ctx.container)||document.querySelector("[data-router-view]");
   if(c) c.innerHTML=this.render();
 }
};

window.TIC.Pages.guide=GuidePage;
window.TICGuidePage=GuidePage;

if(window.TIC.Router?.registerPage){
 window.TIC.Router.registerPage("guide",GuidePage);
}
})(window);
