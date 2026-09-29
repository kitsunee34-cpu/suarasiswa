const $ = id => document.getElementById(id);
function showPage(name){
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  $(name).classList.remove("hidden");
  window.scrollTo(0,0);
  if(name==="login") checkSetup();
}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3200)}
async function api(url,opts={}){
  const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opts});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Something went wrong");
  return data;
}
async function checkSetup(){
  try{
    const s=await api("/api/setup/status");
    $("setup-box").classList.toggle("hidden",!s.needsSetup);
  }catch(e){}
}
async function setupAdmin(e){
  e.preventDefault();
  try{
    const d=await api("/api/setup/admin",{method:"POST",body:JSON.stringify({
      name:$("setup-name").value,username:$("setup-user").value,password:$("setup-pass").value
    })});
    enterDashboard(d.user);
    toast("Admin account created.");
  }catch(e){toast(e.message)}
}
async function login(e,role){
  e.preventDefault();
  const user=role==="student"?$("student-user").value:$("admin-user").value;
  const pass=role==="student"?$("student-pass").value:$("admin-pass").value;
  try{
    const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({username:user,password:pass,role})});
    enterDashboard(d.user);
  }catch(e){toast(e.message)}
}
function enterDashboard(user){
  if(user.role==="student"){
    $("student-welcome").textContent=`Selamat datang, ${user.name} 👋`;
    showPage("student"); loadMyReports(); loadMyVisits();
  }else{
    showPage("admin"); loadAdmin();
  }
}
const TZ="Asia/Kuala_Lumpur";
function todayStr(){return new Date().toLocaleDateString("en-CA",{timeZone:TZ})}
function nowTimeStr(){return new Date().toLocaleTimeString("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit"})}
function fmtTime(t){return new Date(t).toLocaleTimeString("ms-MY",{timeZone:TZ,hour:"2-digit",minute:"2-digit"})}
function fmtDateTime(t){return new Date(t).toLocaleString("ms-MY",{timeZone:TZ,dateStyle:"medium",timeStyle:"short"})}

async function loadVisits(){
  try{
    if(!$("visit-date").value) $("visit-date").value=todayStr();
    if(!$("manual-time").value) $("manual-time").value=nowTimeStr();
    const d=await api("/api/admin/counseling/visits?date="+$("visit-date").value);
    $("visit-count").textContent=d.visits.length;
    $("visit-unique").textContent=new Set(d.visits.map(v=>v.student_id)).size;
    $("visit-list").innerHTML=d.visits.length?d.visits.map(v=>`
      <article class="report-item admin-report">
        <div><span class="badge Hadir">${fmtTime(v.tapped_at)}</span>${v.device_id==="manual"?' <span class="badge">Manual</span>':""}
        <h4>${escapeHtml(v.name)}</h4>
        <div class="report-meta">${escapeHtml(v.class_name||"")}</div></div>
        <textarea id="vnote-${v.id}" placeholder="Catatan kaunselor (pilihan)">${escapeHtml(v.note||"")}</textarea>
        <div style="display:flex;gap:8px">
          <button class="dark" onclick="saveVisitNote(${v.id})">Simpan catatan</button>
          <button class="outline-btn" onclick="deleteVisit(${v.id})">Padam</button>
        </div>
      </article>`).join(""):"<p class='privacy-note'>Tiada pelajar hadir ke UBK pada tarikh ini.</p>";
  }catch(e){toast(e.message)}
}
async function saveVisitNote(id){
  try{
    await api("/api/admin/counseling/visits/"+id,{method:"PATCH",body:JSON.stringify({note:$("vnote-"+id).value})});
    toast("Catatan disimpan.");
  }catch(e){toast(e.message)}
}
async function deleteVisit(id){
  if(!confirm("Padam rekod lawatan ini?")) return;
  try{
    await api("/api/admin/counseling/visits/"+id,{method:"DELETE"});
    toast("Rekod dipadam.");loadVisits();
  }catch(e){toast(e.message)}
}
async function addVisit(e){
  e.preventDefault();
  try{
    await api("/api/admin/counseling/visits",{method:"POST",body:JSON.stringify({
      studentId:Number($("manual-student").value),
      date:$("visit-date").value||todayStr(),
      time:$("manual-time").value,
      note:$("manual-note").value
    })});
    $("manual-note").value="";
    toast("Lawatan ditambah.");loadVisits();
  }catch(e){toast(e.message)}
}
async function setCard(id){
  const uid=prompt("Masukkan UID kad NFC pelajar (contoh: 04A1B2C3):");
  if(uid===null||!uid.trim()) return;
  try{
    await api("/api/admin/students/"+id+"/nfc",{method:"POST",body:JSON.stringify({uid})});
    toast("Kad dipautkan.");loadAdmin();
  }catch(e){toast(e.message)}
}
async function removeCard(id){
  if(!confirm("Buang kad daripada pelajar ini?")) return;
  try{
    await api("/api/admin/students/"+id+"/nfc",{method:"DELETE"});
    toast("Kad dibuang.");loadAdmin();
  }catch(e){toast(e.message)}
}
async function loadMyVisits(){
  try{
    const d=await api("/api/visits/my");
    $("visit-total").textContent=d.summary.total;
    $("visit-month").textContent=d.summary.thisMonth;
    $("my-visits").innerHTML=d.visits.length?d.visits.map(v=>`
      <article class="report-item"><span class="badge Hadir">Hadir ke UBK</span>
      <div class="report-meta">${fmtDateTime(v.tapped_at)}</div></article>`).join(""):"<p class='privacy-note'>Belum ada rekod lawatan ke UBK.</p>";
  }catch(e){}
}
async function logout(){await api("/api/auth/logout",{method:"POST"});showPage("home")}
async function submitReport(e){
  e.preventDefault();
  try{
    await api("/api/reports",{method:"POST",body:JSON.stringify({
      category:$("report-category").value,title:$("report-title").value,description:$("report-description").value
    })});
    $("report-title").value="";$("report-description").value="";
    toast("Laporan berjaya dihantar.");
    loadMyReports();
  }catch(e){toast(e.message)}
}
async function loadMyReports(){
  try{
    const d=await api("/api/reports/my");
    $("my-reports").innerHTML=d.reports.length?d.reports.map(r=>`
      <article class="report-item"><span class="badge ${r.status.replace(" ","")}">${r.status}</span>
      <div class="report-meta">${escapeHtml(r.category)} · ${new Date(r.created_at).toLocaleString()}</div>
      <h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.description)}</p>
      ${r.admin_response?`<div class="privacy-note"><b>Respons:</b> ${escapeHtml(r.admin_response)}</div>`:""}</article>`).join("")
      :"<p class='privacy-note'>Belum ada laporan.</p>";
  }catch(e){}
}
async function loadAdmin(){
  try{
    const [a,s]=await Promise.all([api("/api/admin/reports"),api("/api/admin/students")]);
    const reports=a.reports;
    $("stat-total").textContent=reports.length;
    $("stat-pending").textContent=reports.filter(r=>r.status==="Pending"||r.status==="In Review").length;
    $("stat-resolved").textContent=reports.filter(r=>r.status==="Resolved"||r.status==="Closed").length;
    $("admin-reports").innerHTML=reports.length?reports.map(r=>`
      <article class="report-item admin-report">
        <div><span class="badge ${r.status.replace(" ","")}">${r.status}</span>
        <div class="report-meta">#${r.id} · ${escapeHtml(r.student_name)} · ${escapeHtml(r.class_name||"")} · ${new Date(r.created_at).toLocaleString()}</div>
        <h4>${escapeHtml(r.category)} — ${escapeHtml(r.title)}</h4><p>${escapeHtml(r.description)}</p></div>
        <select id="status-${r.id}"><option ${r.status==="Pending"?"selected":""}>Pending</option><option ${r.status==="In Review"?"selected":""}>In Review</option><option ${r.status==="Resolved"?"selected":""}>Resolved</option><option ${r.status==="Closed"?"selected":""}>Closed</option></select>
        <textarea id="response-${r.id}" placeholder="Respons kepada pelajar (optional)">${escapeHtml(r.admin_response||"")}</textarea>
        <button class="dark" onclick="updateReport(${r.id})">Simpan</button>
      </article>`).join(""):"<p class='privacy-note'>Tiada laporan.</p>";
    $("students").innerHTML=s.students.length?s.students.map(x=>`
      <div class="student-row"><span><b>${escapeHtml(x.name)}</b><br>${escapeHtml(x.username)} · ${escapeHtml(x.class_name||"")}</span>
      <span style="display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end">
        ${x.nfc_uid?`<button class="outline-btn" title="Buang kad ${escapeHtml(x.nfc_uid)}" onclick="removeCard(${x.id})">💳 ${escapeHtml(x.nfc_uid)} ✕</button>`:`<button class="outline-btn" onclick="setCard(${x.id})">+ Kad NFC</button>`}
        <button class="outline-btn" onclick="toggleStudent(${x.id},${!x.active})">${x.active?"Disable":"Enable"}</button></span></div>`).join("")
      :"<p class='privacy-note'>Belum ada pelajar.</p>";
    $("manual-student").innerHTML=s.students.filter(x=>x.active).map(x=>`<option value="${x.id}">${escapeHtml(x.name)}${x.class_name?" ("+escapeHtml(x.class_name)+")":""}</option>`).join("");
    loadVisits();
  }catch(e){toast(e.message)}
}
async function updateReport(id){
  try{
    await api("/api/admin/reports/"+id,{method:"PATCH",body:JSON.stringify({
      status:$("status-"+id).value,adminResponse:$("response-"+id).value
    })});
    toast("Laporan dikemas kini.");loadAdmin();
  }catch(e){toast(e.message)}
}
async function createStudent(e){
  e.preventDefault();
  try{
    await api("/api/admin/students",{method:"POST",body:JSON.stringify({
      name:$("new-name").value,username:$("new-user").value,className:$("new-class").value,password:$("new-pass").value
    })});
    e.target.reset();toast("Pelajar berjaya didaftarkan.");loadAdmin();
  }catch(e){toast(e.message)}
}
async function toggleStudent(id,active){
  try{await api("/api/admin/students/"+id+"/status",{method:"PATCH",body:JSON.stringify({active})});loadAdmin()}
  catch(e){toast(e.message)}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

(async()=>{
  const d=await api("/api/me").catch(()=>({user:null}));
  if(d.user) enterDashboard(d.user); else showPage("home");
})();