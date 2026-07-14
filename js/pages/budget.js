/* =========================================================
Travel Intelligence Center
Budget Page Module V1.0.0

File Path:
js/pages/budget.js

Purpose:
- Travel budget dashboard.
- Track annual budget, trip budgets, savings and expenses.
- Ready for integration with TIC Store.

Registers:
window.TIC.Pages.budget
window.TICBudgetPage
========================================================= */

(function(window){
"use strict";

window.TIC=window.TIC||{};
window.TIC.Pages=window.TIC.Pages||{};

const BudgetPage={
 id:"budget",
 title:"الميزانية",
 version:"1.0.0",

 render(){
  return `
<section class="tic-page">
<div class="tic-hero">
<small>Budget Center</small>
<h2>ميزانية السفر</h2>
<p>تابع ميزانية السفر السنوية والادخار والمصروفات.</p>
</div>

<div class="tic-grid">
 <div class="tic-card">
  <h3>الميزانية السنوية</h3>
  <p id="annualBudget">30,000 AED</p>
 </div>

 <div class="tic-card">
  <h3>إجمالي المصروف</h3>
  <p id="spentBudget">0 AED</p>
 </div>

 <div class="tic-card">
  <h3>المتبقي</h3>
  <p id="remainingBudget">30,000 AED</p>
 </div>

 <div class="tic-card">
  <h3>الادخار الشهري</h3>
  <p id="monthlySaving">1,500 AED</p>
 </div>
</div>

<div class="tic-card">
<h3>رحلات حسب الميزانية</h3>
<div id="budgetTrips">
لا توجد بيانات حالياً.
</div>
</div>

<div class="tic-card">
<h3>تحليل الإنفاق</h3>
<p>سيتم عرض الرسوم البيانية والتحليلات في الإصدارات القادمة.</p>
</div>

</section>`;
 },

 mount(ctx={}){
   const c=ctx.container||document.querySelector("[data-router-view]");
   if(c) c.innerHTML=this.render();
 }
};

window.TIC.Pages.budget=BudgetPage;
window.TICBudgetPage=BudgetPage;

if(window.TIC.Router?.registerPage){
 window.TIC.Router.registerPage("budget",BudgetPage);
}
})(window);
