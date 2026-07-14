/* =========================================================
Travel Intelligence Center
More Page Module V2.0.0

File Path:
js/pages/more.js

Purpose:
- Premium settings & utilities center.
- Profile
- Documents
- Packing
- Notifications
- Memories
- Preferences
- About
- Connected to TIC Store/UI/Router.

Registers:
window.TIC.Pages.more
window.TICMorePage
========================================================= */

(function(window,document){
"use strict";

window.TIC=window.TIC||{};
window.TIC.Pages=window.TIC.Pages||{};

const UI=()=>window.TIC?.UI||window.TICUI;
const Store=()=>window.TIC?.Store||window.TICStore;

const snapshot=()=>{
 const s=Store();
 const st=s?.getState?.()||{};
 return{
  profile:st.profile||{},
  documents:Array.isArray(st.documents)?st.documents:[],
  packing:Array.isArray(st.packing)?st.packing:(st.packing?.items||[]),
  notifications:Array.isArray(st.notifications)?st.notifications:[],
  memories:Array.isArray(st.memories)?st.memories:[]
 };
};

const render=()=>{
 const ui=UI();
 const data=snapshot();

 return `
<div class="tic-module" data-page="more">

${ui.hero({
 badge:"More Center",
 title:"المزيد",
 subtitle:"كل أدوات السفر والإعدادات الشخصية في مكان واحد."
})}

${ui.section({
eyebrow:"PROFILE",
title:"الملف الشخصي",
subtitle:"إدارة بيانات المستخدم.",
content:ui.card({
icon:"👤",
title:data.profile.name||"يوسف",
description:"العملة: ${data.profile.currency||'AED'}<br>المطار الرئيسي: ${data.profile.homeAirport||'Abu Dhabi'}"
})
})}

${ui.section({
eyebrow:"TRAVEL TOOLS",
title:"أدوات السفر",
subtitle:"الوثائق والتجهيز والإشعارات.",
content:ui.grid(`
${ui.card({icon:"📄",title:"الوثائق",description:`${data.documents.length} مستند`,footer:ui.button({label:"فتح",route:"more",view:"documents",block:true})})}
${ui.card({icon:"🧳",title:"قائمة التجهيز",description:`${data.packing.length} عنصر`,footer:ui.button({label:"فتح",route:"more",view:"packing",block:true})})}
${ui.card({icon:"🔔",title:"الإشعارات",description:`${data.notifications.filter(n=>!n.read).length} غير مقروء`,footer:ui.button({label:"فتح",route:"more",view:"notifications",block:true})})}
${ui.card({icon:"📸",title:"ذكريات السفر",description:`${data.memories.length} ذكرى`,footer:ui.button({label:"فتح",route:"more",view:"memories",block:true})})}
`,{columns:2})
})}

${ui.section({
eyebrow:"PREFERENCES",
title:"الإعدادات",
subtitle:"تخصيص التطبيق.",
content:ui.grid(`
${ui.card({icon:"🌐",title:"اللغة",description:data.profile.language||"العربية"})}
${ui.card({icon:"💱",title:"العملة",description:data.profile.currency||"AED"})}
${ui.card({icon:"✈️",title:"أسلوب السفر",description:data.profile.travelStyle||"Premium"})}
${ui.card({icon:"🏠",title:"المطار الرئيسي",description:data.profile.homeAirport||"Abu Dhabi"})}
`,{columns:2})
})}

${ui.section({
eyebrow:"ABOUT",
title:"حول التطبيق",
subtitle:"Travel Intelligence Center",
content:ui.card({
icon:"ℹ️",
title:"الإصدار V2.0.0",
description:"منصة شخصية ذكية لإدارة الرحلات والميزانيات والوجهات والذكريات."
})
})}

</div>`;
};

const MorePage={
 id:"more",
 title:"المزيد",
 version:"2.0.0",
 render,
 mount(ctx={}){
  const c=ctx.container||document.querySelector("[data-router-view]");
  if(c)c.innerHTML=render();
 }
};

window.TIC.Pages.more=MorePage;
window.TICMorePage=MorePage;

if(window.TIC.Router?.registerPage){
 window.TIC.Router.registerPage("more",MorePage);
}

})(window,document);
