const API="/api";
let token=localStorage.getItem("gsqzt_token")||"",user=null,releases=[],reviews=[],filter="all",favoriteIds=new Set();
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
async function api(p,o={}){
  const h={"Content-Type":"application/json"};
  if(token)h.Authorization="Bearer "+token;
  const r=await fetch(API+p,{...o,headers:{...h,...o.headers}});
  const raw=await r.text();
  let d={};
  try{d=raw?JSON.parse(raw):{};}catch{throw Error(`Сервер вернул не JSON (HTTP ${r.status}). Проверь API/Cloudflare Functions.`);}
  if(!r.ok)throw Error(d.error||`Ошибка сервера: ${r.status}`);
  return d;
}
function toast(t){let e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),3500)}
function cover(r){const image=String(r.cover||"").match(/^https:\/\/[^\s"'<>]+$/i);const src=image?image[0].replace(/&/g,"&amp;").replace(/"/g,"&quot;"):"";return `<div class="cover ${src?"has-image":""}" style="--cover:${src?"#171719":r.cover}">${src?`<img class="cover-image" src="${src}" alt="Обложка релиза" loading="lazy">`:""}<strong>${r.art}</strong><b>${Number(r.score).toFixed(1)}/90</b></div>`}
function card(r){return `<article class="card" data-id="${r.id}">${cover(r).replace("</div>",`<button class="favorite-toggle ${favoriteIds.has(Number(r.id))?"is-favorite":""}" data-favorite="${r.id}" aria-label="Добавить в избранное" title="Избранное">${favoriteIds.has(Number(r.id))?"♥":"♡"}</button></div>`)}<h3>${r.title}</h3><p>${r.artist} · ${r.type} · ${r.year}</p></article>`}
function review(r){return `<article class="review"><div class="avatar">${(r.username||"?")[0].toUpperCase()}</div><div><h3>${r.title||r.release} — ${r.artist} · <button type="button" class="profile-link" data-profile="${r.username}">${r.username}</button></h3><p>${r.body}</p>${r.pros?`<p><b>Плюсы:</b> ${r.pros}</p>`:""}${r.cons?`<p><b>Минусы:</b> ${r.cons}</p>`:""}<details class="review-criteria"><summary>Оценки по критериям</summary><p>Звучание: ${r.sound}/10 · Композиция: ${r.composition}/10 · Тексты и вокал: ${r.lyrics}/10 · Оригинальность: ${r.originality}/10 · Атмосфера: ${r.atmosphere}/10 (×${(1+Number(r.atmosphere||0)*0.125).toFixed(2)})</p></details></div><div class="score">${Number(r.score).toFixed(1)}/90</div></article>`}
function draw(){$("#favoritesNav")?.classList.toggle("hidden",!user);$("#adminNav")?.classList.toggle("hidden",!(user&&user.username.toLowerCase()==="towhell"));let a=releases.filter(r=>filter==="all"||r.type===filter);$("#featured").innerHTML=releases.slice(0,4).map(card).join("");$("#allReleases").innerHTML=a.map(card).join("");$("#recentReviews").innerHTML=reviews.slice(0,3).map(review).join("")||"<p>Рецензий пока нет.</p>";$("#allReviews").innerHTML=reviews.map(review).join("")||"<p>Рецензий пока нет.</p>";renderTop();$("#login").textContent=user?user.username:"Войти";if($("#globalSearch")?.value)renderSearch($("#globalSearch").value)}

let activeTop="all";
function renderTop(){
  const box=$("#chart"),desc=$("#topDescription");
  if(!box)return;
  let rows=[],html="";
  if(activeTop==="all"||activeTop==="albums"||activeTop==="singles"){
    const label=activeTop==="albums"?"Альбомы":activeTop==="singles"?"Синглы":"Все релизы";
    rows=releases.filter(r=>activeTop==="all"||(activeTop==="albums"?r.type==="Альбом":r.type==="Сингл")).sort((a,b)=>Number(b.score)-Number(a.score));
    desc.textContent=label+" — по средней оценке пользователей (из 90 баллов).";
    html=rows.map((r,i)=>`<div class="chartrow"><b>${String(i+1).padStart(2,"0")}</b>${cover(r)}<div><h3>${r.title}</h3><p>${r.artist} · ${r.type}</p></div><span class="score">${Number(r.score).toFixed(1)}/90</span></div>`).join("");
  }else if(activeTop==="artists"){
    const map=new Map();
    releases.forEach(r=>{const key=r.artist;const x=map.get(key)||{artist:key,total:0,count:0,releases:[]};x.total+=Number(r.score)||0;x.count++;x.releases.push(r.title);map.set(key,x)});
    rows=[...map.values()].map(x=>({...x,score:x.total/x.count})).sort((a,b)=>b.score-a.score);
    desc.textContent="Артисты с самыми высокими средними оценками релизов.";
    html=rows.map((r,i)=>`<div class="leader-row"><b class="leader-place">${String(i+1).padStart(2,"0")}</b><div><h3>${r.artist}</h3><p>${r.count} релиз(а): ${r.releases.join(", ")}</p></div><span class="score">${r.score.toFixed(1)}/90</span></div>`).join("");
  }else{
    const map=new Map();
    reviews.forEach(r=>{const key=r.username||"Аноним";const x=map.get(key)||{username:key,count:0,total:0};x.count++;x.total+=Number(r.score)||0;map.set(key,x)});
    rows=[...map.values()].map(x=>({...x,average:x.total/x.count})).sort((a,b)=>b.count-a.count||b.average-a.average);
    desc.textContent="Самые активные авторы рецензий. При равном количестве выше автор с большей средней оценкой.";
    html=rows.map((r,i)=>`<div class="leader-row"><b class="leader-place">${String(i+1).padStart(2,"0")}</b><div><h3><button type="button" class="profile-link" data-profile="${r.username}">${r.username}</button></h3><p>${r.count} рецензий · средняя оценка ${r.average.toFixed(1)}/90</p></div><span class="score">${r.count} <small>РЕЦ.</small></span></div>`).join("");
  }
  box.innerHTML=html||"<p class='top-empty'>Пока недостаточно данных для этого топа.</p>";
  $$(".top-tab").forEach(b=>b.classList.toggle("active",b.dataset.top===activeTop));
}

async function loadFavorites(){if(!token){favoriteIds=new Set();return;}try{const d=await api("/favorites");favoriteIds=new Set(d.favorites.map(Number));}catch(e){favoriteIds=new Set();toast(e.message)}}
async function load(){let [a,b]=await Promise.all([api("/releases"),api("/reviews")]);releases=a.releases;reviews=b.reviews;await loadFavorites();draw()}
async function loadFavoritePage(){if(!token){$("#favoriteReleases").innerHTML="<p>Войди, чтобы сохранять релизы в избранное.</p>";return;}const saved=releases.filter(r=>favoriteIds.has(Number(r.id)));$("#favoriteReleases").innerHTML=saved.map(card).join("")||"<p>Пока ничего не добавлено. Нажми ♡ на карточке релиза.</p>";}
function renderSearch(value){
  const q=String(value||"").trim().toLocaleLowerCase("ru");
  const releaseBox=$("#searchReleaseResults"),reviewBox=$("#searchReviewResults"),empty=$("#searchEmpty");
  if(!q){releaseBox.innerHTML="";reviewBox.innerHTML="";empty.textContent="Начни вводить запрос.";empty.classList.remove("hidden");return;}
  const matchesReleases=releases.filter(r=>[r.title,r.artist,r.type,r.year,r.tag,r.genre,r.description].join(" ").toLocaleLowerCase("ru").includes(q));
  const matchesReviews=reviews.filter(r=>[r.title,r.release,r.artist,r.username,r.body,r.pros,r.cons].join(" ").toLocaleLowerCase("ru").includes(q));
  releaseBox.innerHTML=matchesReleases.map(card).join("");
  reviewBox.innerHTML=matchesReviews.map(review).join("");
  empty.textContent=matchesReleases.length||matchesReviews.length?"": "Ничего не найдено. Попробуй другой запрос.";
  empty.classList.toggle("hidden",!!(matchesReleases.length||matchesReviews.length));
}

async function loadProfile(username){
  go("profile");
  $("#profileContent").innerHTML="<p>Загружаем профиль…</p>";
  try{
    const d=await api("/users/"+encodeURIComponent(username));
    const p=d.profile;
    const date=p.created_at?new Date(p.created_at).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}):"—";
    $("#profileContent").innerHTML=`<button class="profile-back" data-back-profile>← Назад к рецензиям</button><div class="profile-head"><div class="profile-avatar">${p.username.slice(0,1).toUpperCase()}</div><div><small>УЧАСТНИК GSQZT</small><h1>${p.username}</h1><p>На GSQZT с ${date}</p>${user&&user.username.toLowerCase()===p.username.toLowerCase()?'<button type="button" class="profile-back" data-logout>Выйти из аккаунта</button>':""}</div></div><div class="profile-stats"><div><b>${p.reviews_count}</b><span>РЕЦЕНЗИЙ</span></div><div><b>${p.ratings_count}</b><span>ОЦЕНОК</span></div><div><b>${p.average_score===null?"—":Number(p.average_score).toFixed(1)+"/90"}</b><span>СРЕДНЯЯ ОЦЕНКА</span></div></div><h2>Рецензии пользователя</h2><div id="profileReviews">${p.reviews.map(review).join("")||"<p>Пользователь пока не написал рецензий.</p>"}</div>`;
  }catch(e){$("#profileContent").innerHTML=`<button class="profile-back" data-back-profile>← Назад</button><p>${e.message}</p>`;}
}

function go(p){$$(".page").forEach(x=>x.classList.toggle("active",x.id===p));window.scrollTo(0,0)}
function modal(s){$("#modalBody").innerHTML=s;$("#modal").classList.remove("hidden")}function close(){$("#modal").classList.add("hidden")}
function auth(){modal(`<small>GSQZT COMMUNITY</small><h2>Вход / регистрация</h2><div id="authFields"><label class="field"><span>EMAIL ИЛИ НИК</span><input id="identity"></label><label class="field"><span>ПАРОЛЬ</span><input id="password" type="password"></label></div><button class="lime" id="authGo">Войти</button><p><button id="switch">Создать аккаунт</button></p>`);let reg=false;$("#switch").onclick=()=>{reg=!reg;$("#authFields").innerHTML=reg?'<label class="field"><span>НИК</span><input id="username"></label><label class="field"><span>EMAIL</span><input id="email"></label><label class="field"><span>ПАРОЛЬ (МИНИМУМ 8 СИМВОЛОВ)</span><input id="password" type="password"></label>':'<label class="field"><span>EMAIL ИЛИ НИК</span><input id="identity"></label><label class="field"><span>ПАРОЛЬ</span><input id="password" type="password"></label>';$("#authGo").textContent=reg?"Зарегистрироваться":"Войти"};$("#authGo").onclick=async()=>{try{let body=reg?{username:$("#username").value,email:$("#email").value,password:$("#password").value}:{identity:$("#identity").value,password:$("#password").value};let d=await api(reg?"/auth/register":"/auth/login",{method:"POST",body:JSON.stringify(body)});token=d.token;user=d.user;localStorage.setItem("gsqzt_token",token);await loadFavorites();close();draw();toast("Добро пожаловать, "+user.username)}catch(e){toast(e.message)}}}

async function loadMySubmissions(){
  if(!token){$("#mySubmissions").innerHTML="<p>Войди, чтобы видеть свои заявки.</p>";return;}
  try{const d=await api("/submissions/mine");$("#mySubmissions").innerHTML=d.submissions.map(x=>`<div class="review"><div><b>${x.title}</b><p>${x.artist} · ${x.type} · ${x.year}</p></div><span>${x.status==="pending"?"На проверке":x.status==="approved"?"Одобрено":"Отклонено"}</span>${x.rejection_reason?`<p>${x.rejection_reason}</p>`:""}</div>`).join("")||"<p>Заявок пока нет.</p>";}catch(e){$("#mySubmissions").textContent=e.message;}
}
async function loadPending(){
  try{const d=await api("/admin/submissions");$("#pendingSubmissions").innerHTML=d.submissions.map(x=>`<article class="review"><div><h3>${x.title} — ${x.artist}</h3><p>${x.type} · ${x.year} · ${x.genre} · от ${x.submitter}</p><p>${x.description||""}</p>${x.listening_url?`<p><a href="${x.listening_url}" target="_blank" rel="noopener">Ссылка на прослушивание</a></p>`:""}</div><div><button class="lime" data-approve="${x.id}">Одобрить</button> <button data-reject="${x.id}">Отклонить</button></div></article>`).join("")||"<p>Новых заявок нет.</p>";}catch(e){$("#pendingSubmissions").textContent=e.message;}
  renderAdminContent();
}
function renderAdminContent(){
  if(!user||user.username.toLowerCase()!=="towhell")return;
  $("#adminReleases").innerHTML=releases.map(r=>`<article class="review admin-item"><div><h3>${r.title} — ${r.artist}</h3><p>${r.type} · ${r.year} · ${Number(r.score).toFixed(1)}/90</p><label class="field"><span>ССЫЛКА НА ОБЛОЖКУ</span><input type="url" data-cover-url="${r.id}" value="${/^https:\/\//i.test(String(r.cover||""))?String(r.cover).replace(/&/g,"&amp;").replace(/"/g,"&quot;"):""}" placeholder="https://..."></label><button class="lime" data-save-cover="${r.id}">Сохранить обложку</button></div><button class="danger" data-delete-release="${r.id}">Удалить трек</button></article>`).join("")||"<p>Релизов пока нет.</p>";
  $("#adminReviews").innerHTML=reviews.map(r=>`<article class="review admin-item"><div><h3>${r.title||r.release} — ${r.artist}</h3><p>Автор: ${r.username} · ${r.release}</p><p>${String(r.body||"").slice(0,180)}</p></div><button class="danger" data-delete-review="${r.id}">Удалить рецензию</button></article>`).join("")||"<p>Рецензий пока нет.</p>";
}
$("#submissionForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!token){auth();return;}const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.year=Number(data.year);try{await api("/submissions",{method:"POST",body:JSON.stringify(data)});e.currentTarget.reset();toast("Заявка отправлена на модерацию");await loadMySubmissions();}catch(err){toast(err.message);}});
$("#pendingSubmissions")?.addEventListener("click",async e=>{const approve=e.target.closest("[data-approve]"),reject=e.target.closest("[data-reject]");const btn=approve||reject;if(!btn)return;try{let reason="";if(reject){reason=prompt("Причина отклонения (необязательно):")||"";}await api("/admin/submissions/"+btn.dataset[approve?"approve":"reject"]+"/"+(approve?"approve":"reject"),{method:"POST",body:JSON.stringify({reason})});toast(approve?"Релиз опубликован":"Заявка отклонена");await loadPending();await load();}catch(err){toast(err.message);}});
$("#adminReleases")?.addEventListener("click",async e=>{const save=e.target.closest("[data-save-cover]");if(save){const id=save.dataset.saveCover;const input=$(`[data-cover-url="${id}"]`);try{await api("/admin/releases/"+id+"/cover",{method:"PATCH",body:JSON.stringify({cover_url:input.value})});await load();renderAdminContent();toast("Обложка обновлена");}catch(err){toast(err.message);}return;}const btn=e.target.closest("[data-delete-release]");if(!btn)return;const r=releases.find(x=>x.id===Number(btn.dataset.deleteRelease));if(!r||!confirm(`Точно удалить трек «${r.title}»? Все его оценки и рецензии тоже будут удалены.`))return;try{await api("/admin/releases/"+r.id,{method:"DELETE"});await load();renderAdminContent();toast("Трек и связанные данные удалены");}catch(err){toast(err.message);}});
$("#adminReviews")?.addEventListener("click",async e=>{const btn=e.target.closest("[data-delete-review]");if(!btn)return;const r=reviews.find(x=>x.id===btn.dataset.deleteReview);if(!r||!confirm(`Удалить рецензию «${r.title||r.release}» от ${r.username}?`))return;try{await api("/admin/reviews/"+r.id,{method:"DELETE"});await load();renderAdminContent();toast("Рецензия удалена");}catch(err){toast(err.message);}});

function criteriaFields(prefix){return [["sound","Звучание"],["composition","Композиция"],["lyrics","Тексты и вокал"],["originality","Оригинальность"],["atmosphere","Атмосфера · множитель"]].map(([key,label])=>`<label class="field criterion"><span>${label.toUpperCase()} · 0–10</span><input id="${prefix}${key}" type="number" min="0" max="10" step="1" required placeholder="Например, 8"></label>`).join("")}
function calculateScore(c){return (c.sound+c.composition+c.lyrics+c.originality)*(1+c.atmosphere*0.125)}
function readCriteria(prefix){return Object.fromEntries(["sound","composition","lyrics","originality","atmosphere"].map(k=>[k,Number($("#"+prefix+k).value)]))}
function rateModal(r){modal(`<small>${r.type.toUpperCase()} · ${r.year}</small><h2>${r.title}</h2><p>${r.artist}</p><p>${r.description}</p><p class="form-intro">Первые четыре критерия — по 10 баллов. Атмосфера задаёт множитель от ×1 до ×2,25. Максимум — 90 баллов.</p>${criteriaFields("rate_")}<button class="lime" id="rateGo">Сохранить оценку</button>`);$("#rateGo").onclick=async()=>{if(!token)return auth();const criteria=readCriteria("rate_");if(Object.values(criteria).some(v=>!Number.isInteger(v)||v<0||v>10)){toast("Заполни все критерии целыми числами от 0 до 10");return;}try{await api(`/releases/${r.id}/rating`,{method:"POST",body:JSON.stringify(criteria)});await load();close();toast("Оценка сохранена")}catch(e){toast(e.message)}}}
function writeReview(){if(!token)return auth();modal(`<small>ТВОЁ МНЕНИЕ</small><h2>Новая рецензия</h2><label class="field"><span>РЕЛИЗ</span><select id="rid">${releases.map(r=>`<option value="${r.id}">${r.title} — ${r.artist}</option>`).join("")}</select></label><label class="field"><span>ЗАГОЛОВОК</span><input id="rtitle" maxlength="100" placeholder="Коротко о главном"></label><h3>Оценка по критериям</h3><p class="form-intro">Четыре основных критерия — по 10 баллов. Атмосфера даёт множитель от ×1 до ×2,25. Максимум — 90 баллов.</p>${criteriaFields("review_")}<label class="field"><span>ПЛЮСЫ</span><textarea id="rpros" maxlength="1000" placeholder="Что особенно удалось?"></textarea></label><label class="field"><span>МИНУСЫ</span><textarea id="rcons" maxlength="1000" placeholder="Что можно было сделать лучше?"></textarea></label><label class="field"><span>РЕЦЕНЗИЯ · ОТ 50 ДО 5000 СИМВОЛОВ</span><textarea id="rbody" maxlength="5000" placeholder="Расскажи о звучании, идеях и впечатлениях..."></textarea></label><button class="lime" id="publish">Опубликовать рецензию</button>`);$("#publish").onclick=async()=>{try{const criteria=readCriteria("review_");if(Object.values(criteria).some(v=>!Number.isInteger(v)||v<0||v>10)){toast("Заполни все критерии целыми числами от 0 до 10");return;}await api("/reviews",{method:"POST",body:JSON.stringify({releaseId:Number($("#rid").value),title:$("#rtitle").value,pros:$("#rpros").value,cons:$("#rcons").value,body:$("#rbody").value,...criteria})});await load();close();toast("Рецензия опубликована")}catch(e){toast(e.message)}}}
$("#charts")?.addEventListener("click",e=>{const b=e.target.closest("[data-top]");if(!b)return;activeTop=b.dataset.top;renderTop()});
document.addEventListener("click",e=>{const link=e.target.closest("button[data-profile]");if(!link)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();loadProfile(link.dataset.profile);},true);
$$("nav button").forEach(b=>b.onclick=()=>{go(b.dataset.page);if(b.dataset.page==="submit")loadMySubmissions();if(b.dataset.page==="admin")loadPending();if(b.dataset.page==="favorites")loadFavoritePage();});$$("[data-goto]").forEach(b=>b.onclick=()=>go(b.dataset.goto));document.addEventListener("click",async e=>{if(e.target.closest("[data-logout]")){token="";user=null;localStorage.removeItem("gsqzt_token");favoriteIds=new Set();draw();go("home");toast("Вы вышли из аккаунта");return;}if(e.target.closest("[data-back-profile]")){go("reviews");return;}const fav=e.target.closest("[data-favorite]");if(fav){e.preventDefault();e.stopPropagation();if(!token){auth();return;}const id=Number(fav.dataset.favorite);try{if(favoriteIds.has(id)){await api("/favorites/"+id,{method:"DELETE"});favoriteIds.delete(id);toast("Удалено из избранного");}else{await api("/favorites/"+id,{method:"POST"});favoriteIds.add(id);toast("Добавлено в избранное");}draw();loadFavoritePage();}catch(err){toast(err.message)}return;}let c=e.target.closest(".card");if(c){let r=releases.find(x=>x.id===Number(c.dataset.id));if(r)rateModal(r)}});$("#login").onclick=()=>{if(user){loadProfile(user.username)}else auth()};$("#write").onclick=writeReview;$("#close").onclick=close;$("#modal").onclick=e=>{if(e.target.id==="modal")close()};$$(".filter").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x===b));draw()});$("#search").oninput=()=>{let q=$("#search").value.toLowerCase();$("#allReleases").innerHTML=releases.filter(r=>(r.title+" "+r.artist).toLowerCase().includes(q)).filter(r=>filter==="all"||r.type===filter).map(card).join("")};$("#globalSearch")?.addEventListener("input",e=>renderSearch(e.target.value));
(async()=>{if(token){try{user=(await api("/me")).user}catch{token="";localStorage.removeItem("gsqzt_token")}}try{await load()}catch(e){toast("Нет связи с backend: "+e.message)}})();
