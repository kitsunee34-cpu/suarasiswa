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
    showPage("student"); loadMyReports(); loadMyAttendance();
  }else{
    showPage("admin"); loadAdmin();
  }
}
function todayStr(){return new Date().toISOString().slice(0,10)}
async function loadAttendance(){
  try{
    if(!$("attendance-date").value) $("attendance-date").value=todayStr();
    const date=$("attendance-date").value;
    const d=await api("/api/admin/attendance/"+date);
    $("attendance-list").innerHTML=d.students.length?d.students.map(s=>`
      <div class="student-row">
        <span><b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.username)} · ${escapeHtml(s.class_name||"")}</span>
        <select id="att-${s.id}">
          <option value="Hadir" ${s.status==="Hadir"?"selected":""}>Hadir</option>
          <option value="Tidak Hadir" ${s.status==="Tidak Hadir"?"selected":""}>Tidak Hadir</option>
          <option value="Lewat" ${s.status==="Lewat"?"selected":""}>Lewat</option>
          <option value="Cuti" ${s.status==="Cuti"?"selected":""}>Cuti</option>
        </select>
      </div>`).join(""):"<p class='privacy-note'>Tiada pelajar aktif.</p>";
  }catch(e){toast(e.message)}
}
async function saveAttendance(){
  try{
    const date=$("attendance-date").value||todayStr();
    const selects=[...document.querySelectorAll("select[id^='att-']")];
    const records=selects.map(el=>({studentId:Number(el.id.replace("att-","")),status:el.value}));
    if(!records.length){toast("Tiada pelajar untuk disimpan.");return}
    await api("/api/admin/attendance",{method:"POST",body:JSON.stringify({date,records})});
    toast("Kehadiran disimpan.");
  }catch(e){toast(e.message)}
}
async function loadMyAttendance(){
  try{
    const d=await api("/api/attendance/my");
    $("att-percent").textContent=d.summary.percent+"%";
    $("att-hadir").textContent=d.summary.hadir;
    $("att-tak-hadir").textContent=d.summary.takHadir;
    $("my-attendance").innerHTML=d.records.length?d.records.map(r=>`
      <article class="report-item"><span class="badge ${r.status.replace(" ","")}">${r.status}</span>
      <div class="report-meta">${r.date}</div></article>`).join(""):"<p class='privacy-note'>Tiada rekod kehadiran.</p>";
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
      <button class="outline-btn" onclick="toggleStudent(${x.id},${!x.active})">${x.active?"Disable":"Enable"}</button></div>`).join("")
      :"<p class='privacy-note'>Belum ada pelajar.</p>";
    loadAttendance();
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