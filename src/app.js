import { sb } from "./supabase.js";

/* Issues: every data/issues/*.json is bundled at build time, oldest first (by date). Adding a file adds an issue. */
const ISSUES=Object.values(import.meta.glob("../data/issues/*.json",{eager:true,import:"default"}))
  .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));
const STATIC=["באר הפוטנציאל","מקורות"];
const KIND={beer:"באר הפוטנציאל",trad:"מקורות",comm:"מפרש"};
const ISSUE_BY_ID=Object.fromEntries(ISSUES.map(i=>[i.id,i]));
const ISSUE_ORDER=Object.fromEntries(ISSUES.map((i,k)=>[i.id,k]));
const SEGS={}, SEGPARA={}, SEGNUM={}, SEGISSUE={};
ISSUES.forEach(is=>{ let n=0; is.essay.forEach((p,pi)=>p.segs.forEach(([id,t])=>{ SEGS[id]=t; SEGPARA[id]=pi; SEGNUM[id]=++n; SEGISSUE[id]=is.id; })); });
const C=ISSUES.flatMap(i=>i.notes);
let ESSAY=ISSUES[ISSUES.length-1].essay;
const curIssue=()=>ISSUE_BY_ID[state.issue];
const inPara=(c,pi)=>c.s.some(x=>SEGISSUE[x]===state.issue&&SEGPARA[x]===pi);
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));

let state={issue:ISSUES[ISSUES.length-1].id,mode:"para",para:null,person:"באר הפוטנציאל",draft:{seg:"",dh:"",text:""}};
let assets=null,me={id:null,isOwner:false},writable=false,readOnlyReason="loading"; /* assets: file attachments arrive in stage 4 */
let authReady=false;
let comms={}, likeDocs={}, names={}, pens={}; let editingPen=false; /* comms: comment id -> item; likeDocs: user id -> {target id: true} */
let openIds=new Set();

/* ---------- derived data ---------- */
function rowToComment(r){
  const s=(Array.isArray(r.seg_ids)?r.seg_ids:[]).filter(x=>x in SEGS);
  return {id:r.id,uid:r.user_id,kind:"comm",who:r.user_id,s,whole:!!r.whole,dh:String(r.title||""),t:String(r.body||""),at:String(r.created_at||""),link:safeUrl(String(r.link||"")),att:null};
}
function community(){ return Object.values(comms).filter(c=>c.s.length); }
function safeUrl(u){ try{ const x=new URL(u); return (x.protocol==="https:"||x.protocol==="http:")?x.href:""; }catch(e){ return ""; } }
const ALL=()=>C.concat(community());
const likes=c=>{let n=0;for(const k in likeDocs) if(likeDocs[k]&&likeDocs[k][c.id]) n++;return n;};
const iLiked=id=>!!(me.id&&likeDocs[me.id]&&likeDocs[me.id][id]);
const whoName=w=>STATIC.includes(w)?w:(pens[w]||names[w]||"משתתף/ת");
const myPen=()=>me.id?(pens[me.id]||""):"";
const firstSeg=(c,pi)=>c.s.filter(x=>pi==null||(SEGISSUE[x]===state.issue&&SEGPARA[x]===pi)).sort((a,b)=>ISSUE_ORDER[SEGISSUE[a]]-ISSUE_ORDER[SEGISSUE[b]]||SEGNUM[a]-SEGNUM[b])[0];

/* ---------- rendering ---------- */
function likeBtn(c){
  const dis=writable?"":" disabled";
  return `<button class="like" data-id="${esc(c.id)}" aria-pressed="${iLiked(c.id)}" aria-label="לייק"${dis}>👍 ${likes(c)}</button>`;
}
function head(c){
  if(c.kind==="beer") return `<span class="mark">${c.mark||"✦"}</span><span class="ttl">${esc(c.dh)}</span>`;
  if(c.kind==="trad") return `<span class="mark">${c.mark}</span><span class="ref">${esc(c.t)}</span>`;
  return `<span class="mark">💬</span><span class="ttl">${esc(whoName(c.who))}</span><span class="dhs">${c.att||c.link?(c.att&&c.att.type.startsWith("image/")?"🖼 ":c.att?"📄 ":"🔗 "):""}${esc(c.dh||(c.t?c.t.slice(0,48)+(c.t.length>48?"…":""):(c.att?c.att.name:"קישור")))}</span><span class="lc">👍 ${likes(c)}</span>`;
}
function body(c){
  if(c.kind==="beer") return `<div class="body">${c.body.map(p=>`<p>${p}</p>`).join("")}${c.intext?`<div class="intext"><b>ובטקסט:</b> ${esc(c.intext)}</div>`:""}</div><div class="foot"><span></span>${likeBtn(c)}</div>`;
  if(c.kind==="trad") return c.full&&c.full.length? c.full.map(([r,t,u])=>`<div class="ft"><a class="fr" href="${u}" target="_blank" rel="noopener">${esc(r)} <span class="ext">בספריא ↗</span></a><a class="fx" href="${u}" target="_blank" rel="noopener">${esc(t)}</a></div>`).join("") : `<p class="empty">הטקסט המלא של מקור זה עדיין לא זמין כאן.</p>`;
  const when=c.at?new Date(c.at).toLocaleDateString("he-IL",{day:"numeric",month:"short"}):"";
  const canDel=writable&&(c.uid===me.id||me.isOwner);
  let extra="";
  if(c.att){ const src="/_blob/"+c.att.id;
    extra+= c.att.type.startsWith("image/")
      ? `<a class="attimg" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${esc(c.att.name)}" loading="lazy"></a>`
      : `<a class="attfile" href="${src}" target="_blank" rel="noopener">📄 ${esc(c.att.name)}</a>`; }
  if(c.link){ let host=""; try{host=new URL(c.link).hostname.replace(/^www\./,"");}catch(e){} extra+=`<a class="attlink" href="${esc(c.link)}" target="_blank" rel="noopener">🔗 ${esc(host||c.link)}</a>`; }
  return `${c.dh?`<div class="dh">${esc(c.dh)}</div>`:""}${c.t?`<div class="body ctext">${esc(c.t)}</div>`:""}${extra}<div class="foot"><span class="mini">${esc(whoName(c.who))}${when?" · "+when:""}${canDel?` · <button class="del" data-id="${esc(c.id)}">מחיקה</button>`:""}</span>${likeBtn(c)}</div>`;
}
function item(c,pi){
  const sid=firstSeg(c,pi);
  const is=ISSUE_BY_ID[SEGISSUE[sid]]; const tag=(pi==null&&ISSUES.length>1)?`<span class="itag">${esc(is.parsha)}</span> `:"";
  const plead=is.essay[SEGPARA[sid]].lead||is.essay[SEGPARA[sid]].segs[0][1].slice(0,60)+"…";
  const ctx=c.whole?`<button class="ctx" data-s="${sid}">${tag}<span class="mini">על כל הפסקה</span> ${esc(plead)}</button>`:`<button class="ctx" data-s="${sid}">${tag}<span class="mini">על המשפט</span> ${esc(SEGS[sid])}</button>`;
  const open=openIds.has(c.id)?" open":"";
  return `<details class="it ${c.kind}" data-id="${esc(c.id)}"${open}><summary>${head(c)}<span class="chev" aria-hidden="true"></span></summary><div class="in">${ctx}${body(c)}</div></details>`;
}
function addForm(pi){
  if(!writable) return `<div class="add ro"><p class="mini">${readOnlyText()}</p></div>`;
  const d=state.draft;
  const opts=ESSAY[pi].segs.map(([id,t])=>`<option value="${id}"${d.seg===id?" selected":""}>משפט ${SEGNUM[id]}: ${esc(t.slice(0,60))}${t.length>60?"…":""}</option>`).join("");
  return `<form class="add" id="add-form" autocomplete="off" novalidate>
    <div class="group">הוספת פירוש</div>
    ${myPen()?"":`<label class="fl" for="add-pen">שם המפרש שלך (יוצג ליד כל הפירושים שלך)</label><input id="add-pen" maxlength="30" value="${esc(d.pen||"")}" placeholder="למשל: בעל הלבנים">`}
    <label class="fl" for="add-seg">על מה הפירוש?</label>
    <select id="add-seg"><option value="">על כל הפסקה</option>${opts}</select>
    <label class="fl" for="add-dh">כותרת קצרה (לא חובה)</label>
    <input id="add-dh" maxlength="80" value="${esc(d.dh)}" placeholder="למשל: אחדות מול אחידות">
    <label class="fl" for="add-text">הפירוש שלך</label>
    <textarea id="add-text" rows="4" maxlength="4000" placeholder="מה הפסקה מעוררת אצלך? הערה, קושיה, מקור נוסף או תיקון.">${esc(d.text)}</textarea>
    <label class="fl" for="add-link">מקור נוסף: קישור (לא חובה)</label>
    <input id="add-link" type="url" inputmode="url" dir="ltr" value="${esc(d.link||"")}" placeholder="https://www.sefaria.org/…">
    ${assets?`<label class="fl" for="add-file">מקור נוסף: תמונה או PDF (לא חובה, עד 20MB)</label>
    <input id="add-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf">`:""}
    <div class="addrow"><span class="mini" id="add-msg" aria-live="polite"></span><button type="submit" class="pub" id="add-btn">פרסום</button></div>
  </form>`;
}
function readOnlyText(){
  if(readOnlyReason==="loading") return "מתחבר…";
  return `כדי לכתוב פירוש צריך להיכנס · <button class="lnk login">כניסה עם גוגל</button>`;
}
function renderEssay(){
  const all=ALL();
  $("essay").innerHTML=ESSAY.map((p,pi)=>{
    const inp=all.filter(c=>inPara(c,pi));
    const nb=inp.filter(c=>c.kind==="beer").length, nt=inp.filter(c=>c.kind==="trad").length, nc=inp.filter(c=>c.kind==="comm").length;
    const txt=p.segs.map(([id,t],i)=>{
      let h=esc(t); if(i===0&&t.startsWith(p.lead)) h=`<strong>${esc(p.lead)}</strong>`+esc(t.slice(p.lead.length));
      const marks=C.filter(c=>c.s.includes(id)&&c.mark);
      return h+(marks.length?`<sup class="m">${marks.map(c=>`<span class="mk ${c.kind}">${c.mark}</span>`).join(" ")}</sup>`:"");
    }).join(" ");
    const cur=state.mode==="para"&&state.para===pi;
    return `<section data-p="${pi}"><div class="para" role="button" tabindex="0" data-p="${pi}" aria-expanded="${cur}" aria-current="${cur}">${txt}<span class="pcount">${nb?`<span class="pc beer"><i></i>${nb} באר הפוטנציאל</span>`:""}${nt?`<span class="pc trad"><i></i>${nt} מקורות</span>`:""}<span class="pc comm"><i></i>${nc?nc+" מהקהילה":"הוסיפו פירוש"}</span></span></div></section>`;
  }).join("");
}
function renderPanel(){
  const p=$("panel"); const all=ALL();
  p.hidden=state.mode==="para"&&state.para==null;
  if(state.mode==="para"){
    if(state.para==null){$("essay").after(p);return;}
    const pi=state.para;
    const list=all.filter(c=>inPara(c,pi));
    const pos=c=>SEGNUM[firstSeg(c,pi)];
    const groups=[["beer","באר הפוטנציאל",(a,b)=>pos(a)-pos(b)],["trad","מקורות",(a,b)=>pos(a)-pos(b)],["comm","מפרשי הקהילה",(a,b)=>likes(b)-likes(a)||(a.at<b.at?-1:1)]];
    p.innerHTML=`<div class="phead"><h2>${esc((ESSAY[pi].lead||ESSAY[pi].segs[0][1].slice(0,40)+"…").replace(/[.?:,]$/,""))}</h2><button class="close" aria-label="סגירה">✕</button></div><p class="mini hintline">לחצו על פירוש או מקור כדי לפתוח אותו במלואו.</p>`+
      groups.map(([k,label,sort])=>{const g=list.filter(c=>c.kind===k).sort(sort);
        if(k==="comm") return `<section class="grp g-comm"><div class="group">${label}${g.length?` <span class="gc">${g.length}</span>`:""}</div>${g.length?g.map(c=>item(c,pi)).join(""):`<p class="empty">עדיין אין פירושים מהקהילה על הפסקה הזו. אפשר להיות הראשונים.</p>`}${addForm(pi)}</section>`;
        return g.length?`<section class="grp g-${k}"><div class="group">${label} <span class="gc">${g.length}</span></div>`+g.map(c=>item(c,pi)).join("")+`</section>`:""}).join("");
    document.querySelector(`section[data-p="${pi}"]`).appendChild(p); p.classList.add("inline");
  }else{
    const key=c=>{const s=firstSeg(c); return ISSUE_ORDER[SEGISSUE[s]]*10000+SEGNUM[s];};
    const list=all.filter(c=>c.who===state.person).sort((a,b)=>key(a)-key(b));
    const total=list.reduce((s,c)=>s+likes(c),0);
    p.innerHTML=`<div class="phead"><h2>${esc(whoName(state.person))}</h2></div><p class="mini hintline">${list.length} פירושים${state.person==="מקורות"?"":` · ${total} 👍`} · לחצו על פירוש כדי לפתוח אותו.</p>`+(list.length?list.map(c=>item(c,null)).join(""):`<p class="empty">אין כאן פירושים כרגע.</p>`);
    $("essay").after(p); p.classList.remove("inline");
  }
}
function score(w,all){return all.filter(c=>c.who===w).reduce((s,c)=>s+likes(c),0)}
function renderChips(){
  const all=ALL();
  const people=[...new Set(all.map(c=>c.who))].sort((a,b)=>(a==="מקורות")-(b==="מקורות")||score(b,all)-score(a,all));
  if(!people.includes(state.person)) state.person=people[0];
  $("chips").innerHTML=people.map(w=>`<button class="chip" data-p="${esc(w)}" aria-pressed="${w===state.person}">${esc(whoName(w))}${w==="מקורות"?"":` · ${score(w,all)} 👍`}</button>`).join("");
}
function renderStatus(){
  const st=$("status");
  if(!authReady){ st.hidden=true; return; }
  if(!me.id){ st.hidden=false; st.className="status ro"; st.innerHTML=`כדי לכתוב פירושים ולסמן 👍 צריך להיכנס · <button class="lnk login">כניסה עם גוגל</button>`; return; }
  st.hidden=false; st.className="status ok";
  if(editingPen){ st.innerHTML=`<form id="pen-form" class="penf" novalidate><label for="pen-in">שם המפרש שלך</label><input id="pen-in" maxlength="30" value="${esc(myPen())}" placeholder="למשל: בעל הלבנים"><button type="submit" class="pub sm">שמירה</button><button type="button" class="lnk" id="pen-cancel">ביטול</button><span class="mini" id="pen-msg" aria-live="polite"></span><span class="mini penhint">השינוי יחול גם על כל הפירושים שכבר כתבת.</span></form>`; }
  else { const p=myPen(); st.innerHTML= p?`כותב/ת בשם <b>${esc(p)}</b> · <button class="lnk" id="pen-edit">שינוי שם</button>`:`מחובר/ת. לפני הפירוש הראשון כדאי לבחור שם מפרש · <button class="lnk" id="pen-edit">בחירת שם</button>`;
    st.innerHTML+=` · <button class="lnk" id="logout">יציאה</button>`; }
}
function render(){
  $("chips").hidden=state.mode!=="person";
  $("hint").textContent=state.mode==="para"
    ?"זה העלון עצמו. לחצו על פסקה כדי לראות את כל המפרשים והמקורות שלה ולהוסיף פירוש משלכם."
    :"בחרו מפרש כדי לקרוא את כל מה שכתב, ברצף. המפרשים ממוינים לפי סך ה-👍.";
  $("m-seg").setAttribute("aria-pressed",state.mode==="para");
  $("m-person").setAttribute("aria-pressed",state.mode==="person");
  $("essay").after($("panel"));
  $("essay").hidden=state.mode==="person";
  const is=curIssue(); $("ititle").textContent=is.title; $("iref").textContent=is.ref; $("ifoot").textContent=is.foot||"";
  $("issues").innerHTML=`<span class="ilab">עלון:</span>`+ISSUES.slice().reverse().map(i=>`<button class="ibtn" data-i="${i.id}" aria-pressed="${i.id===state.issue}">${esc(i.parsha)} <span class="ititle">· ${esc(i.title)}</span></button>`).join("");
  renderStatus(); renderEssay(); if(state.mode==="person")renderChips(); renderPanel();
}
/* re-render from live data without clobbering a half-typed comment */
let pending=false;
function liveRender(){ const a=document.activeElement; if(a&&a.closest&&(a.closest("#add-form")||a.closest("#pen-form"))){pending=true;return;} pending=false; render(); }
document.addEventListener("focusout",e=>{ if(pending&&e.target.closest&&e.target.closest("#add-form")) setTimeout(()=>{ if(!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest("#add-form"))) liveRender(); },0); });

/* ---------- pen names ---------- */
function penProblem(n){
  if(n.length<2) return "השם צריך להכיל לפחות שני תווים.";
  if(STATIC.includes(n)) return "השם הזה שמור.";
  const taken=Object.entries(pens).some(([u,v])=>u!==me.id&&String(v).trim()===n);
  if(taken) return "מפרש אחר כבר בחר בשם הזה.";
  return "";
}
async function savePen(n){
  await serial("p:"+me.id, async()=>{
    const {error}=await sb.from("profiles").update({pen_name:n}).eq("user_id",me.id);
    if(error) throw error;
    pens[me.id]=n;
  });
}
/* Postgres error codes from the profiles table: 23505 unique name, 23514 check constraint */
function penSaveError(err){
  const code=err&&err.code;
  if(code==="23505") return "מפרש אחר כבר בחר בשם הזה.";
  if(code==="23514") return "השם צריך להכיל 2 עד 30 תווים, ולא להיות שם שמור.";
  return "השמירה לא הצליחה. נסו שוב בעוד רגע.";
}
async function loadPens(){
  const {data,error}=await sb.from("profiles").select("user_id,pen_name,is_admin");
  if(error) return;
  pens={}; for(const r of data){ if(r.pen_name) pens[r.user_id]=r.pen_name; if(r.user_id===me.id) me.isOwner=!!r.is_admin; }
}
/* ---------- comments and likes (Supabase) ---------- */
/* Supabase returns at most 1000 rows per request, so read in pages */
async function selectAll(table,cols){
  const out=[];
  for(let from=0;;from+=1000){
    const {data,error}=await sb.from(table).select(cols).range(from,from+999);
    if(error) throw error;
    out.push(...data); if(data.length<1000) return out;
  }
}
const COMMENT_COLS="id,user_id,issue_id,seg_ids,whole,title,body,link,hidden,created_at";
function putComment(r){ if(r.hidden&&!me.isOwner) delete comms[r.id]; else comms[r.id]=rowToComment(r); }
function setLike(uid,target,on){ const m=likeDocs[uid]||(likeDocs[uid]={}); if(on) m[target]=true; else delete m[target]; }
async function loadAll(){
  try{
    const [cs,ls]=await Promise.all([selectAll("comments",COMMENT_COLS),selectAll("likes","user_id,target_id")]);
    comms={}; cs.forEach(putComment);
    likeDocs={}; ls.forEach(r=>setLike(r.user_id,r.target_id,true));
  }catch(e){ return; }
  liveRender();
}
sb.channel("live")
  .on("postgres_changes",{event:"*",schema:"public",table:"comments"},p=>{
    if(p.eventType==="DELETE"){ delete comms[p.old.id]; openIds.delete(p.old.id); } else putComment(p.new);
    liveRender(); })
  .on("postgres_changes",{event:"*",schema:"public",table:"likes"},p=>{
    if(p.eventType==="DELETE") setLike(p.old.user_id,p.old.target_id,false); else setLike(p.new.user_id,p.new.target_id,true);
    liveRender(); })
  .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},p=>{
    const r=p.new; if(!r||!r.user_id) return;
    if(r.pen_name) pens[r.user_id]=r.pen_name; else delete pens[r.user_id];
    liveRender(); })
  .subscribe();

/* ---------- writes (one at a time per key) ---------- */
const chains={};
function serial(key,fn){ const p=(chains[key]||Promise.resolve()).then(fn,fn); chains[key]=p.catch(()=>{}); return p; }
/* 42501: blocked by Row Level Security */
function handleWriteError(err,msgEl){
  if(msgEl) msgEl.textContent = err&&err.code==="42501"?"אין הרשאה לפעולה הזו. נסו לצאת ולהיכנס שוב.":"השמירה לא הצליחה. נסו שוב בעוד רגע.";
}
async function addComment(){
  const form=$("add-form"); if(!form) return;
  const msg=$("add-msg"), btn=$("add-btn");
  const text=$("add-text").value.trim(), dh=$("add-dh").value.trim(), seg=$("add-seg").value;
  const rawLink=$("add-link").value.trim(), link=rawLink?safeUrl(rawLink):"";
  if(rawLink&&!link){ msg.textContent="הקישור צריך להתחיל ב-https://"; $("add-link").focus(); return; }
  if(!text&&!link){ msg.textContent="כתבו פירוש, או צרפו קישור."; $("add-text").focus(); return; }
  const penIn=$("add-pen");
  if(penIn){ const n=penIn.value.trim(); const pr=penProblem(n); if(pr){ msg.textContent=pr; penIn.focus(); return; }
    try{ await savePen(n); }catch(err){ msg.textContent=penSaveError(err); return; } }
  const pi=state.para; const sid=seg||ESSAY[pi].segs[0][0];
  btn.disabled=true; msg.textContent="שומר…";
  try{
    const {data,error}=await sb.from("comments")
      .insert({issue_id:state.issue,seg_ids:[sid],whole:!seg,title:dh||null,body:text||null,link:link||null})
      .select(COMMENT_COLS).single();
    if(error) throw error;
    putComment(data); openIds.add(data.id);
    state.draft={seg:"",dh:"",text:"",link:"",pen:""}; document.activeElement&&document.activeElement.blur&&document.activeElement.blur(); pending=false; render();
    const m=$("add-msg"); if(m) m.textContent="הפירוש פורסם.";
  }catch(err){ btn.disabled=false; handleWriteError(err,msg); }
}
async function deleteComment(id){
  try{
    const {error}=await sb.from("comments").delete().eq("id",id);
    if(error) throw error;
    delete comms[id]; openIds.delete(id); render();
  }catch(err){ handleWriteError(err,null); }
}
async function toggleLike(id,btn){
  if(!writable) return;
  try{
    await serial("l:"+id, async()=>{
      if(iLiked(id)){
        const {error}=await sb.from("likes").delete().eq("user_id",me.id).eq("target_id",id);
        if(error) throw error; setLike(me.id,id,false);
      }else{
        const {error}=await sb.from("likes").insert({target_id:id});
        if(error&&error.code!=="23505") throw error; setLike(me.id,id,true); /* 23505: already liked */
      }
    });
    const c=ALL().find(x=>x.id===id); if(btn&&c){ btn.setAttribute("aria-pressed",iLiked(id)); btn.textContent="👍 "+likes(c); }
  }catch(err){ handleWriteError(err,null); }
}

/* ---------- events ---------- */
function openPara(pi){ state.mode="para"; state.para=(state.para===pi)?null:pi; openIds.clear(); render(); }
document.addEventListener("toggle",e=>{const d=e.target; if(d.matches&&d.matches("details.it")){ d.open?openIds.add(d.dataset.id):openIds.delete(d.dataset.id);} },true);
document.addEventListener("input",e=>{ const id=e.target.id; if(id==="add-text")state.draft.text=e.target.value; if(id==="add-dh")state.draft.dh=e.target.value; if(id==="add-seg")state.draft.seg=e.target.value; if(id==="add-link")state.draft.link=e.target.value; if(id==="add-pen")state.draft.pen=e.target.value; });
document.addEventListener("change",e=>{ if(e.target.id==="add-seg") state.draft.seg=e.target.value; });
document.addEventListener("submit",async e=>{
  if(e.target.id==="add-form"){ e.preventDefault(); addComment(); }
  if(e.target.id==="pen-form"){ e.preventDefault(); const n=$("pen-in").value.trim(), m=$("pen-msg"); const pr=penProblem(n); if(pr){m.textContent=pr;return;}
    m.textContent="שומר…"; try{ await savePen(n); editingPen=false; render(); }catch(err){ m.textContent=penSaveError(err); } }
});
document.addEventListener("click",e=>{
  const l=e.target.closest(".like"); if(l){e.preventDefault();toggleLike(l.dataset.id,l);return;}
  const dl=e.target.closest(".del"); if(dl){e.preventDefault(); if(dl.dataset.armed){deleteComment(dl.dataset.id);} else {dl.dataset.armed="1"; dl.textContent="למחוק? לחצו שוב";} return;}
  const cx=e.target.closest(".ctx"); if(cx){const pi=SEGPARA[cx.dataset.s];setIssue(SEGISSUE[cx.dataset.s],false);state.mode="para";state.para=pi;openIds.clear();render();document.querySelector(`section[data-p="${pi}"]`)?.scrollIntoView({block:"start"});return;}
  if(e.target.closest(".close")){state.para=null;render();return;}
  if(e.target.id==="pen-edit"){ editingPen=true; renderStatus(); $("pen-in")&&$("pen-in").focus(); return; }
  if(e.target.id==="pen-cancel"){ editingPen=false; renderStatus(); return; }
  if(e.target.closest(".login")){ signIn(); return; }
  if(e.target.id==="logout"){ sb.auth.signOut(); return; }
  if(e.target.closest("#add-form")||e.target.closest("#pen-form")) return;
  const pa=e.target.closest(".para"); if(pa){openPara(+pa.dataset.p);return;}
  const ib=e.target.closest(".ibtn"); if(ib){ setIssue(ib.dataset.i,true); render(); window.scrollTo({top:0}); return; }
  const ch=e.target.closest(".chip"); if(ch){state.person=ch.dataset.p;openIds.clear();render();return;}
  if(e.target.id==="m-seg"){state.mode="para";state.para=null;render();}
  if(e.target.id==="m-person"){state.mode="person";openIds.clear();render();window.scrollTo({top:0});}
});
document.addEventListener("keydown",e=>{const pa=e.target.closest&&e.target.closest(".para"); if(pa&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openPara(+pa.dataset.p);}});

/* ---------- issues ---------- */
function setIssue(id,resetPara){ if(!ISSUE_BY_ID[id]) return; state.issue=id; ESSAY=ISSUE_BY_ID[id].essay; if(resetPara){state.para=null; openIds.clear();} state.draft={seg:"",dh:"",text:"",link:"",pen:state.draft.pen||""}; try{ history.replaceState(null,"","#"+id); }catch(e){} }
try{ const h=(location.hash||"").slice(1)||sessionStorage.getItem("tb-return"); sessionStorage.removeItem("tb-return"); if(ISSUE_BY_ID[h]) setIssue(h,true); }catch(e){}
/* ---------- guided tour ---------- */
const TOUR=[
 {t:"ברוכים הבאים לתורה שבענן",b:"זה דף גמרא דיגיטלי סביב העלון ״פרשת השבוע למהנדסים״. העלון במרכז, וסביבו שלושה רבדים: באר הפוטנציאל (המדע), המקורות, ומפרשי הקהילה, כלומר אתם. ההדרכה לוקחת דקה."},
 {sel:"#issues",t:"בחירת עלון",b:"כאן עוברים בין העלונים. הדף נפתח תמיד על העלון האחרון, וכל עלון שומר את הפירושים שלו."},
 {sel:".modes",t:"שתי דרכים לקרוא",b:"״לפי פסקה״: העלון עצמו, וכל פסקה נפתחת עם מה שנכתב עליה. ״לפי מפרש״: כל מה שמפרש אחד כתב, ברצף, מכל העלונים, עם ניקוד ה-👍 שלו."},
 {sel:"#status",t:"השם שלכם כמפרשים",b:"כאן מופיע השם שבו אתם כותבים. בוחרים אותו לפני הפירוש הראשון, ואפשר לשנות אותו בכל רגע. השינוי חל גם על כל מה שכבר כתבתם. כדי לכתוב, נכנסים כאן עם חשבון גוגל.",when:()=>!$("status").hidden},
 {sel:'.para[data-p="0"]',t:"לחצו על פסקה",b:"האותיות והמספרים הקטנים הם סימני ההערות, כמו בעלון המודפס: אות היא מקור, ומספר הוא הערה של באר הפוטנציאל. מתחת לכל פסקה כתוב כמה פירושים יש עליה.",pre:()=>{ if(state.mode!=="para"){state.mode="para";} state.para=null; render(); }},
 {sel:"#panel",t:"כל מה שנכתב על הפסקה",b:"הפירושים מסודרים בשלוש קבוצות. לחיצה על שורה פותחת אותה במלואה: ההסבר המדעי, הטקסט המלא של המקור עם קישור לספריא, או פירוש של משתתף. לחיצה נוספת על הפסקה סוגרת.",pre:()=>{ state.mode="para"; const bn=C.find(c=>c.kind==="beer"&&c.s.some(x=>SEGISSUE[x]===state.issue)); const pi=bn?SEGPARA[bn.s.find(x=>SEGISSUE[x]===state.issue)]:0; state.para=pi; openIds.clear(); if(bn) openIds.add(bn.id); render(); }},
 {sel:"#panel .add",t:"הוסיפו פירוש משלכם",b:"בוחרים אם הפירוש על כל הפסקה או על משפט מסוים, מוסיפים כותרת קצרה, כותבים, ואפשר לצרף קישור, תמונה או PDF. הפירוש מופיע מיד אצל כולם.",pre:()=>{ if(state.para==null){state.mode="para";state.para=0;render();} }},
 {sel:"#panel details[open] .like",t:"👍 על פירוש טוב",b:"כל אחד יכול לסמן 👍 פעם אחת על כל פירוש. הפירושים האהובים עולים לראש הרשימה, ובהמשך ייכנסו לעלון המודפס ולספר.",when:()=>!!document.querySelector("#panel details[open] .like")},
 {sel:"#theme-btn",t:"מצב יום ולילה",b:"כפתור זה מחליף בין רקע בהיר לכהה."},
 {sel:"#tour-btn",t:"זהו, אפשר להתחיל",b:"אפשר לחזור להדרכה בכל רגע מהכפתור הזה. לימוד נעים!",last:true},
];
let tourI=-1, tourSteps=[];
function tourOpen(){ tourSteps=TOUR; tourI=-1; $("tour").hidden=false; document.body.classList.add("touring"); tourGo(1); }
function tourClose(){ $("tour").hidden=true; document.body.classList.remove("touring"); tourI=-1; try{localStorage.setItem("tb-tour","done");}catch(e){} }
function tourGo(dir){
  let i=tourI+dir;
  while(i>=0&&i<tourSteps.length){ const s=tourSteps[i]; if(s.pre) s.pre(); if((!s.when||s.when())&&(!s.sel||document.querySelector(s.sel))) break; i+=dir; }
  if(i<0||i>=tourSteps.length){ tourClose(); return; }
  tourI=i; const s=tourSteps[i];
  $("tour-n").textContent=`${i+1} מתוך ${tourSteps.length}`; $("tour-t").textContent=s.t; $("tour-b").textContent=s.b;
  $("tour-prev").hidden=i===0; $("tour-next").textContent=(i===tourSteps.length-1)?"סיום":"הבא";
  const el=s.sel?document.querySelector(s.sel):null;
  if(el){ el.scrollIntoView({block:"center",behavior:"auto"}); }
  requestAnimationFrame(()=>tourPlace(el));
  $("tour-next").focus();
}
function tourPlace(el){
  const spot=$("tour-spot"), card=$("tour-card");
  card.style.top=""; card.style.bottom="";
  if(!el){ spot.style.cssText="display:none"; card.classList.add("center"); return; }
  card.classList.remove("center");
  const r=el.getBoundingClientRect(), pad=6, vh=window.innerHeight;
  const top=Math.max(4,r.top-pad), h=Math.min(r.height+pad*2, vh-8-top);
  spot.style.cssText=`display:block;top:${top}px;left:${Math.max(4,r.left-pad)}px;width:${Math.min(r.width+pad*2,window.innerWidth-8)}px;height:${Math.max(24,h)}px`;
  const below=vh-(top+h), above=top;
  if(below>=above){ card.style.top=Math.min(top+h+10, vh-card.offsetHeight-8)+"px"; } else { card.style.top=Math.max(8, top-card.offsetHeight-10)+"px"; }
}
$("tour-btn").addEventListener("click",tourOpen);
$("tour-next").addEventListener("click",()=>tourGo(1));
$("tour-prev").addEventListener("click",()=>tourGo(-1));
$("tour-skip").addEventListener("click",tourClose);
document.addEventListener("keydown",e=>{ if($("tour").hidden) return; if(e.key==="Escape") tourClose(); if(e.key==="ArrowLeft") tourGo(1); if(e.key==="ArrowRight") tourGo(-1); });
window.addEventListener("resize",()=>{ if(!$("tour").hidden&&tourI>=0){ const s=tourSteps[tourI]; tourPlace(s.sel?document.querySelector(s.sel):null);} });
/* ---------- accessibility ---------- */
const FS=[1,1.15,1.3,1.5,1.75];
let A11Y={fs:0,spacing:false,contrast:false,font:false,links:false,motion:false};
try{ const s=JSON.parse(localStorage.getItem("tb-a11y")||"null"); if(s&&typeof s==="object") A11Y=Object.assign(A11Y,s); }catch(e){}
function applyA11y(){
  A11Y.fs=Math.max(0,Math.min(FS.length-1,A11Y.fs|0));
  const w=document.querySelector(".wrap"); w.style.zoom=FS[A11Y.fs]===1?"":String(FS[A11Y.fs]);
  const r=document.documentElement.classList;
  r.toggle("a-spacing",!!A11Y.spacing); r.toggle("a-contrast",!!A11Y.contrast); r.toggle("a-font",!!A11Y.font); r.toggle("a-links",!!A11Y.links); r.toggle("a-motion",!!A11Y.motion);
  $("fs-val").textContent=Math.round(FS[A11Y.fs]*100)+"%"; $("fs-dn").disabled=A11Y.fs===0; $("fs-up").disabled=A11Y.fs===FS.length-1;
  ["spacing","contrast","font","links","motion"].forEach(k=>$("a-"+k).checked=!!A11Y[k]);
  const on=A11Y.fs>0||A11Y.spacing||A11Y.contrast||A11Y.font||A11Y.links||A11Y.motion; $("a11y-btn").classList.toggle("on",on);
  try{ localStorage.setItem("tb-a11y",JSON.stringify(A11Y)); }catch(e){}
}
function a11yToggle(show){ const p=$("a11y"); const open=show==null?p.hidden:show; p.hidden=!open; $("a11y-btn").setAttribute("aria-expanded",open); if(open) $("fs-up").focus(); }
$("a11y-btn").addEventListener("click",()=>a11yToggle());
$("a11y-close").addEventListener("click",()=>{a11yToggle(false);$("a11y-btn").focus();});
$("fs-up").addEventListener("click",()=>{A11Y.fs++;applyA11y();});
$("fs-dn").addEventListener("click",()=>{A11Y.fs--;applyA11y();});
["spacing","contrast","font","links","motion"].forEach(k=>$("a-"+k).addEventListener("change",e=>{A11Y[k]=e.target.checked;applyA11y();}));
$("a11y-reset").addEventListener("click",()=>{A11Y={fs:0,spacing:false,contrast:false,font:false,links:false,motion:false};applyA11y();});
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!$("a11y").hidden){a11yToggle(false);$("a11y-btn").focus();} });
document.addEventListener("click",e=>{ if(!$("a11y").hidden&&!e.target.closest("#a11y")&&!e.target.closest("#a11y-btn")) a11yToggle(false); });
applyA11y();
/* ---------- day / night ---------- */
function sysDark(){ return matchMedia("(prefers-color-scheme: dark)").matches; }
function curTheme(){ const a=document.documentElement.getAttribute("data-theme"); return a||(sysDark()?"dark":"light"); }
function paintThemeBtn(){ const dark=curTheme()==="dark"; const b=$("theme-btn"); b.textContent=dark?"☀️":"🌙"; b.setAttribute("aria-label",dark?"מעבר למצב יום":"מעבר למצב לילה"); }
try{ const saved=localStorage.getItem("tb-theme"); if(saved==="dark"||saved==="light") document.documentElement.setAttribute("data-theme",saved); }catch(e){}
paintThemeBtn();
$("theme-btn").addEventListener("click",()=>{ const next=curTheme()==="dark"?"light":"dark"; document.documentElement.setAttribute("data-theme",next); try{localStorage.setItem("tb-theme",next);}catch(e){} paintThemeBtn(); });
try{ matchMedia("(prefers-color-scheme: dark)").addEventListener("change",paintThemeBtn); }catch(e){}

render();
try{ if(localStorage.getItem("tb-tour")!=="done") setTimeout(()=>{ if($("tour").hidden) tourOpen(); },900); }catch(e){}

/* ---------- sign-in (Supabase Auth, Google) ---------- */
async function signIn(){
  /* the return URL carries no hash, so remember the open issue across the Google round trip */
  try{ sessionStorage.setItem("tb-return",state.issue); }catch(e){}
  const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});
  if(error){ const st=$("status"); st.className="status ro"; st.textContent="הכניסה לא הצליחה. נסו שוב בעוד רגע."; }
}
async function applySession(session){
  const id=session&&session.user?session.user.id:null;
  /* the first call always loads; admins also see hidden comments, so reload when the user changes */
  if(!authReady||id!==me.id){ me={id,isOwner:false}; editingPen=false; await loadPens(); await loadAll(); }
  writable=!!id; readOnlyReason=id?"":"signin";
  authReady=true; liveRender();
}
sb.auth.onAuthStateChange((_event,session)=>{ setTimeout(()=>applySession(session),0); });
sb.auth.getSession().then(({data})=>{
  applySession(data.session);
  /* drop ?code= left by the sign-in redirect */
  if(location.search.includes("code=")) history.replaceState(null,"",location.pathname+location.hash);
});
