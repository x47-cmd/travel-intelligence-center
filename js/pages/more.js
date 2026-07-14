/* =========================================================
Travel Intelligence Center
More Page Module V1.0.0

File Path:
js/pages/more.js

Purpose:
- Settings and utilities center.
- Profile.
- Documents.
- Packing.
- Notifications.
- Memories.
- Preferences.
- About application.

Registers:
window.TIC.Pages.more
window.TICMorePage
========================================================= */

(function(window){
"use strict";

window.TIC=window.TIC||{};
window.TIC.Pages=window.TIC.Pages||{};

const MorePage={
 id:"more",
 title:"المزيد",
 version:"1.0.0",

 render(){
 return `
<section class="tic-page">

<div class="tic-hero">
<small>More Center</small>
<h2>المزيد</h2>
<p>الإعدادات والأدوات الإضافية الخاصة بمركز السفر الذكي.</p>
</div>

<div class="tic-grid">

<div class="tic-card">
<h3>الملف الشخصي</h3>
<p>إدارة بيانات المستخدم.</p>
</div>

<div class="tic-card">
<h3>الوثائق</h3>
<p>جواز السفر والتأشيرات والمستندات.</p>
</div>

<div class="tic-card">
<h3>قائمة التجهيز</h3>
<p>إدارة Packing List.</p>
</div>

<div class="tic-card">
<h3>الإشعارات</h3>
<p>عرض جميع التنبيهات.</p>
</div>

<div class="tic-card">
<h3>ذكريات السفر</h3>
<p>الصور والملاحظات والرحلات السابقة.</p>
</div>

<div class="tic-card">
<h3>الإعدادات</h3>
<p>اللغة، العملة، التفضيلات.</p>
</div>

<div class="tic-card">
<h3>حول التطبيق</h3>
<p>Travel Intelligence Center V1.0.0</p>
</div>

</div>

</section>`;
 },

 mount(ctx={}){
   const c=ctx.container||document.querySelector("[data-router-view]");
   if(c) c.innerHTML=this.render();
 }
};

window.TIC.Pages.more=MorePage;
window.TICMorePage=MorePage;

if(window.TIC.Router?.registerPage){
 window.TIC.Router.registerPage("more",MorePage);
}
})(window);
