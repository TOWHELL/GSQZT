const API="/api";
let token=localStorage.getItem("gsqzt_token")||"",user=null,releases=[],reviews=[],filter="all",favoriteIds=new Set(),notifications=[];
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
function listeningLink(r){const url=String(r.listening_url||"").trim();if(!/^https:\/\/[^\s"'<>]+$/i.test(url))return "";return '<a class="listen-link" href="'+url.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" target="_blank" rel="noopener noreferrer" data-listen-link>▶ Слушать</a>';}
function card(r){return `<article class="card" data-id="${r.id}">${cover(r).replace("</div>",`<button class="favorite-toggle ${favoriteIds.has(Number(r.id))?"is-favorite":""}" data-favorite="${r.id}" aria-label="Добавить в избранное" title="Избранное">${favoriteIds.has(Number(r.id))?"♥":"♡"}</button></div>`)}<h3>${r.title}</h3><p>${r.artist} · ${r.type} · ${r.year}</p>${Number(r.rated_by_me)?'<span class="rated-label" title="Вы уже оценили" aria-label="Вы уже оценили">✓</span>':""}${listeningLink(r)}</article>`}
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function commentItem(c){
  const avatar=c.avatar?'<img src="'+escapeHTML(c.avatar)+'" alt="">':escapeHTML((c.username||"?")[0].toUpperCase());
  const date=c.created_at?new Date(c.created_at).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  return '<div class="review-comment" data-comment-id="'+escapeHTML(c.id)+'"><div class="comment-avatar">'+avatar+'</div><div class="comment-content"><b><button type="button" class="profile-link" data-profile="'+escapeHTML(c.username)+'">'+escapeHTML(c.username)+'</button></b><small>'+escapeHTML(date)+'</small><p style="white-space:pre-wrap">'+escapeHTML(c.body)+'</p><button type="button" class="comment-reply" data-reply-comment="'+escapeHTML(c.id)+'">Ответить</button></div>'+(Number(c.can_delete)?'<button type="button" class="comment-delete" data-comment-delete="'+escapeHTML(c.id)+'" aria-label="Удалить комментарий">×</button>':"")+'</div>';
}
function renderCommentTree(comments,parentId=null){
  return comments.filter(c=>(c.parent_comment_id||null)===(parentId||null)).map(c=>'<div class="comment-thread">'+commentItem(c)+(comments.some(x=>x.parent_comment_id===c.id)?'<div class="comment-replies">'+renderCommentTree(comments,c.id)+'</div>':"")+'</div>').join("");
}
function review(r){const liked=!!Number(r.liked_by_me);return `<article class="review" data-review-id="${escapeHTML(r.id)}"><div class="avatar">${r.avatar?`<img src="${r.avatar}" alt="Аватар ${r.username}">`:(r.username||"?")[0].toUpperCase()}</div><div><h3>${r.title||r.release} — ${r.artist} · <button type="button" class="profile-link" data-profile="${r.username}">${r.username}</button></h3><p>${r.body}</p>${r.pros?`<p><b>Плюсы:</b> ${r.pros}</p>`:""}${r.cons?`<p><b>Минусы:</b> ${r.cons}</p>`:""}<details class="review-criteria"><summary>Оценки по критериям</summary><p>Рифмы / образы: ${r.sound}/10 · Структура / ритмика: ${r.composition}/10 · Реализация стиля: ${r.lyrics}/10 · Индивидуальность / харизма: ${r.originality}/10 · Атмосфера / вайб: ${r.atmosphere}/10 (×${(1+Number(r.atmosphere||0)*0.125).toFixed(2)})</p></details><button type="button" class="review-like ${liked?"is-liked":""}" data-review-like="${r.id}" data-liked="${liked?1:0}" aria-label="Нравится рецензия">${liked?"♥":"♡"} <span>${Number(r.likes_count)||0}</span></button>${Number(r.can_edit)?`<button type="button" class="profile-back" data-pin-review="${escapeHTML(r.id)}" data-pinned="${Number(r.is_pinned)?1:0}">${Number(r.is_pinned)?"Открепить рецензию":"Закрепить в профиле"}</button><button type="button" class="profile-back" data-edit-review-rating="${escapeHTML(r.id)}">Изменить оценку</button><button type="button" class="profile-back" data-append-review="${escapeHTML(r.id)}">Дополнить рецензию</button><button type="button" class="danger" data-delete-own-review="${escapeHTML(r.id)}">Удалить рецензию</button>`:""}<div class="review-comments" data-review-comments="${r.id}"><button type="button" class="comments-toggle" data-comments-toggle="${r.id}">Комментарии · ${Number(r.comments_count)||0}</button><div class="comments-panel" data-comments-panel="${r.id}" hidden><div class="comments-list" data-comments-list="${r.id}"><p class="comments-loading">Загружаем комментарии…</p></div><form class="comment-form" data-comment-form="${r.id}"><textarea name="body" maxlength="1000" placeholder="Напиши комментарий…" required></textarea><button type="submit" class="lime">Отправить</button></form></div></div></div><div class="score">${Number(r.score).toFixed(1)}/90</div></article>`}
function draw(){$("#favoritesNav")?.classList.toggle("hidden",!user);$("#notificationsNav")?.classList.toggle("hidden",!user);$("#followingNav")?.classList.toggle("hidden",!user);$("#adminNav")?.classList.toggle("hidden",!(user&&user.username.toLowerCase()==="towhell"));let a=releases.filter(r=>filter==="all"||r.type===filter);$("#featured").innerHTML=releases.slice(0,4).map(card).join("");$("#allReleases").innerHTML=a.map(card).join("");$("#recentReviews").innerHTML=reviews.slice(0,3).map(review).join("")||"<p>Рецензий пока нет.</p>";renderReviewList();renderTop();$("#login").textContent=user?user.username:"Войти";if($("#globalSearch")?.value)renderSearch($("#globalSearch").value)}

let activeReviewSort="new";
function renderReviewList(){
  const box=$("#allReviews");if(!box)return;
  const rows=[...reviews];
  if(activeReviewSort==="popular")rows.sort((a,b)=>(Number(b.likes_count)||0)-(Number(a.likes_count)||0)||Number(b.id)-Number(a.id));
  else rows.sort((a,b)=>Number(b.id)-Number(a.id));
  box.innerHTML=rows.map(review).join("")||"<p>Рецензий пока нет.</p>";
  $$(".review-sort").forEach(b=>b.classList.toggle("active",b.dataset.reviewSort===activeReviewSort));
}
let activeTop="all";
function renderTop(){
  const box=$("#chart"),desc=$("#topDescription");
  if(!box)return;
  let rows=[],html="";
  if(activeTop==="all"||activeTop==="albums"||activeTop==="singles"){
    const label=activeTop==="albums"?"Альбомы":activeTop==="singles"?"Синглы":"Все релизы";
    rows=releases.filter(r=>activeTop==="all"||(activeTop==="albums"?r.type==="Альбом":r.type==="Сингл")).sort((a,b)=>Number(b.score)-Number(a.score));
    desc.textContent=label+" — по средней оценке пользователей (из 90 баллов).";
    html=rows.map((r,i)=>`<div class="chartrow"><b>${String(i+1).padStart(2,"0")}</b>${cover(r)}<div><h3>${r.title}</h3><p>${r.artist} · ${r.type}</p>${listeningLink(r)}</div><span class="score">${Number(r.score).toFixed(1)}/90</span></div>`).join("");
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

function renderNotifications(){
 const box=$("#notificationList");if(!box)return;
 box.innerHTML=notifications.length?notifications.map(n=>{const isLike=n.type==="like",date=n.created_at?new Date(n.created_at).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";return '<button type="button" class="notification-item '+(n.read_at?'':'unread')+'" data-notification-open="'+escapeHTML(n.id)+'" data-notification-review="'+escapeHTML(n.review_id)+'"><span class="notification-icon">'+(isLike?'♥':'💬')+'</span><span class="notification-copy"><b>'+escapeHTML(n.actor_username)+'</b> '+(isLike?'понравилась твоя рецензия':'прокомментировал твою рецензию')+'<strong>'+escapeHTML(n.title||n.release_title||'Рецензия')+' — '+escapeHTML(n.artist||'')+'</strong><small>'+escapeHTML(date)+'</small></span><i>'+(n.read_at?'':'●')+'</i></button>';}).join(""):'<p class="notifications-empty">Пока нет уведомлений. Когда кто-то поставит лайк или прокомментирует твою рецензию, здесь появится сообщение.</p>';
}
async function loadNotifications(){
 if(!token){notifications=[];$("#notificationCount")?.classList.add("hidden");if($("#notificationList"))renderNotifications();return;}
 try{const d=await api("/notifications");notifications=d.notifications||[];const count=Number(d.unread_count)||0,badge=$("#notificationCount");if(badge){badge.textContent=count>99?"99+":String(count);badge.classList.toggle("hidden",count===0);}renderNotifications();}catch(e){toast(e.message);}
}
async function loadFavorites(){if(!token){favoriteIds=new Set();return;}try{const d=await api("/favorites");favoriteIds=new Set(d.favorites.map(Number));}catch(e){favoriteIds=new Set();toast(e.message)}}
async function load(){let [a,b]=await Promise.all([api("/releases"),api("/reviews")]);releases=a.releases;reviews=b.reviews;await loadFavorites();draw()}
async function loadFavoritePage(){if(!token){$("#favoriteReleases").innerHTML="<p>Войди, чтобы сохранять релизы в избранное.</p>";return;}const saved=releases.filter(r=>favoriteIds.has(Number(r.id)));$("#favoriteReleases").innerHTML=saved.map(card).join("")||"<p>Пока ничего не добавлено. Нажми ♡ на карточке релиза.</p>";}
function renderSearch(value){
  const q=String(value||"").trim().toLocaleLowerCase("ru");
  const releaseBox=$("#searchReleaseResults"),reviewBox=$("#searchReviewResults"),userBox=$("#searchUserResults"),empty=$("#searchEmpty");
  if(!q){releaseBox.innerHTML="";reviewBox.innerHTML="";userBox.innerHTML="";empty.textContent="Начни вводить запрос.";empty.classList.remove("hidden");return;}
  const matchesReleases=releases.filter(r=>[r.title,r.artist,r.type,r.year,r.tag,r.genre,r.description].join(" ").toLocaleLowerCase("ru").includes(q));
  const matchesReviews=reviews.filter(r=>[r.title,r.release,r.artist,r.username,r.body,r.pros,r.cons].join(" ").toLocaleLowerCase("ru").includes(q));
  releaseBox.innerHTML=matchesReleases.map(card).join("");
  reviewBox.innerHTML=matchesReviews.map(review).join("");
  userBox.innerHTML="";
  empty.textContent=matchesReleases.length||matchesReviews.length?"":"Ничего не найдено. Попробуй другой запрос.";
  empty.classList.toggle("hidden",!!(matchesReleases.length||matchesReviews.length)||q.length>=2);
  if(q.length>=2){
    api("/users/search?q="+encodeURIComponent(String(value).trim())).then(d=>{
      if($("#globalSearch")?.value.trim().toLocaleLowerCase("ru")!==q)return;
      const people=d.users||[];
      userBox.innerHTML=people.map(p=>`<div class="leader-row"><div class="avatar">${p.avatar?`<img src="${p.avatar}" alt="">`:p.username.slice(0,1).toUpperCase()}</div><div><h3><button type="button" class="profile-link" data-profile="${p.username}">${p.username}</button></h3><p>${p.reviews_count} рецензий</p></div></div>`).join("");
      empty.textContent=matchesReleases.length||matchesReviews.length||people.length?"":"Ничего не найдено. Попробуй другой запрос.";
      empty.classList.toggle("hidden",!!(matchesReleases.length||matchesReviews.length||people.length));
    }).catch(()=>{if($("#globalSearch")?.value.trim().toLocaleLowerCase("ru")===q){empty.textContent=matchesReleases.length||matchesReviews.length?"":"Не удалось выполнить поиск пользователей.";empty.classList.toggle("hidden",!!(matchesReleases.length||matchesReviews.length));}});
  }
}

async function saveAvatar(file){
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)){toast("Выбери PNG, JPG или WEBP");return;}
  if(file.size>5*1024*1024){toast("Файл слишком большой. Максимум 5 МБ");return;}
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Не удалось открыть изображение"))};img.src=url});
    const canvas=document.createElement("canvas"),scale=Math.min(1,512/Math.max(image.width,image.height));
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    const avatar=canvas.toDataURL("image/jpeg",0.82);
    await api("/me/avatar",{method:"PATCH",body:JSON.stringify({avatar})});
    user.avatar=avatar;
    toast("Аватар обновлён");
    await loadProfile(user.username);
  }catch(e){toast(e.message||"Не удалось сохранить аватар")}
}
async function loadProfile(username){
  go("profile");
  $("#profileContent").innerHTML="<p>Загружаем профиль…</p>";
  try{
    const d=await api("/users/"+encodeURIComponent(username));
    const p=d.profile;
    const date=p.created_at?new Date(p.created_at).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}):"—";
    $("#profileContent").innerHTML=`<button class="profile-back" data-back-profile>← Назад к рецензиям</button><div class="profile-head"><div class="profile-avatar">${p.avatar?`<img src="${p.avatar}" alt="Аватар ${p.username}">`:p.username.slice(0,1).toUpperCase()}</div><div><small>УЧАСТНИК GSQZT</small><h1>${p.username}</h1><p>На GSQZT с ${date}</p>${user&&user.username.toLowerCase()===p.username.toLowerCase()?`<label class="avatar-upload">Изменить аватар<input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp"></label><button type="button" class="profile-back" data-logout>Выйти из аккаунта</button>`:""}</div></div><div class="profile-stats"><div><b>${p.reviews_count}</b><span>РЕЦЕНЗИЙ</span></div><div><b>${p.ratings_count}</b><span>ОЦЕНОК</span></div><div><b>${p.average_score===null?"—":Number(p.average_score).toFixed(1)+"/90"}</b><span>СРЕДНЯЯ ОЦЕНКА</span></div></div><div class="profile-stats"><div><b>${p.listened_count||0}</b><span>РЕЛИЗОВ ОЦЕНЕНО</span></div><div><b>${p.followers_count||0}</b><span>ПОДПИСЧИКОВ</span></div><div><b>${p.following_count||0}</b><span>ПОДПИСОК</span></div></div><p class="profile-favorite-genre">Любимый жанр: <b>${escapeHTML(p.favorite_genre||"пока не определён")}</b></p>${user&&user.username.toLowerCase()!==p.username.toLowerCase()?`<button type="button" class="lime profile-follow" data-follow-user="${escapeHTML(p.username)}" data-following="${p.is_following?1:0}">${p.is_following?"Отписаться":"＋ Подписаться"}</button>`:""}<h2>Рецензии пользователя</h2><div id="profileReviews">${p.reviews.map(review).join("")||"<p>Пользователь пока не написал рецензий.</p>"}</div>`;
  }catch(e){$("#profileContent").innerHTML=`<button class="profile-back" data-back-profile>← Назад</button><p>${e.message}</p>`;}
}

async function loadFollowing(){
  go("following");
  const box=$("#followingReviews");if(!box)return;
  if(!token){box.innerHTML="<p>Войди, чтобы смотреть рецензии авторов, на которых подписан.</p>";return;}
  box.innerHTML="<p>Загружаем ленту подписок…</p>";
  try{const d=await api("/following/reviews");box.innerHTML=(d.reviews||[]).map(review).join("")||"<p>Пока нет новых рецензий. Подпишись на интересных авторов в их профилях.</p>";}
  catch(e){box.textContent=e.message;}
}
function go(p){$$(".page").forEach(x=>x.classList.toggle("active",x.id===p));window.scrollTo(0,0)}
function modal(s){$("#modalBody").innerHTML=s;$("#modal").classList.remove("hidden")}function close(){$("#modal").classList.add("hidden")}
function auth(){modal(`<small>GSQZT COMMUNITY</small><h2>Вход / регистрация</h2><div id="authFields"><label class="field"><span>EMAIL ИЛИ НИК</span><input id="identity"></label><label class="field"><span>ПАРОЛЬ</span><input id="password" type="password"></label></div><button class="lime" id="authGo">Войти</button><p><button id="switch">Создать аккаунт</button></p>`);let reg=false;$("#switch").onclick=()=>{reg=!reg;$("#authFields").innerHTML=reg?'<label class="field"><span>НИК</span><input id="username"></label><label class="field"><span>EMAIL</span><input id="email"></label><label class="field"><span>ПАРОЛЬ (МИНИМУМ 8 СИМВОЛОВ)</span><input id="password" type="password"></label>':'<label class="field"><span>EMAIL ИЛИ НИК</span><input id="identity"></label><label class="field"><span>ПАРОЛЬ</span><input id="password" type="password"></label>';$("#authGo").textContent=reg?"Зарегистрироваться":"Войти"};$("#authGo").onclick=async()=>{try{let body=reg?{username:$("#username").value,email:$("#email").value,password:$("#password").value}:{identity:$("#identity").value,password:$("#password").value};let d=await api(reg?"/auth/register":"/auth/login",{method:"POST",body:JSON.stringify(body)});token=d.token;user=d.user;localStorage.setItem("gsqzt_token",token);await loadFavorites();close();draw();await loadNotifications();toast("Добро пожаловать, "+user.username)}catch(e){toast(e.message)}}}

async function loadMySubmissions(){
  if(!token){$("#mySubmissions").innerHTML="<p>Войди, чтобы видеть свои заявки.</p>";return;}
  try{const d=await api("/submissions/mine");$("#mySubmissions").innerHTML=d.submissions.map(x=>`<div class="review"><div><b>${x.title}</b><p>${x.artist} · ${x.type} · ${x.year}</p></div><span>${x.status==="pending"?"На проверке":x.status==="approved"?"Одобрено":"Отклонено"}</span>${x.rejection_reason?`<p>${x.rejection_reason}</p>`:""}</div>`).join("")||"<p>Заявок пока нет.</p>";}catch(e){$("#mySubmissions").textContent=e.message;}
}
async function loadPending(){
  try{const d=await api("/admin/submissions");$("#pendingSubmissions").innerHTML=d.submissions.map(x=>`<article class="review"><div><h3>${x.title} — ${x.artist}</h3><p>${x.type} · ${x.year} · ${x.genre} · от ${x.submitter}</p><p>${x.description||""}</p>${x.listening_url?`<p><a href="${x.listening_url}" target="_blank" rel="noopener">Ссылка на прослушивание</a></p>`:""}</div><div><button class="lime" data-approve="${x.id}">Одобрить</button> <button data-reject="${x.id}">Отклонить</button></div></article>`).join("")||"<p>Новых заявок нет.</p>";}catch(e){$("#pendingSubmissions").textContent=e.message;}
  renderAdminContent();
  await loadAdminUsers();
}
async function loadAdminRatings(){
  const host=$("#adminRatings");
  if(!host)return;
  try{
    const d=await api("/admin/ratings");
    host.innerHTML=(d.ratings||[]).map(r=>`<article class="review admin-item"><div><h3>${escapeHTML(r.username)} · ${escapeHTML(r.release_title)}</h3><p>${escapeHTML(r.artist)} · ${Number(r.score).toFixed(1)}/90</p><p>Рифмы ${r.sound}/10 · Структура ${r.composition}/10 · Стиль ${r.lyrics}/10 · Индивидуальность ${r.originality}/10 · Атмосфера ${r.atmosphere}/10</p></div><button class="danger" data-admin-delete-rating="${encodeURIComponent(r.user_id)}" data-rating-release="${r.release_id}">Удалить оценку</button></article>`).join("")||"<p>Оценок пока нет.</p>";
  }catch(e){host.textContent=e.message;}
}
async function loadAdminUsers(){
  const host=$("#adminUsers");
  if(!host)return;
  try{
    const d=await api("/admin/users");
    host.innerHTML=(d.users||[]).map(u=>`<article class="review admin-item"><div><h3>${escapeHTML(u.username)}</h3><p>Регистрация: ${u.created_at?new Date(u.created_at).toLocaleDateString("ru-RU"):"—"}</p><p>Рецензий: ${Number(u.reviews_count)||0} · Оценок: ${Number(u.ratings_count)||0}</p></div><button class="danger" data-delete-user="${encodeURIComponent(u.id)}">Удалить аккаунт</button></article>`).join("")||"<p>Пользователей пока нет.</p>";
  }catch(e){host.textContent=e.message;}
}
function renderAdminContent(){
  if(!user||user.username.toLowerCase()!=="towhell")return;
  $("#adminReleases").innerHTML=releases.map(r=>`<article class="review admin-item"><div><h3>${escapeHTML(r.title)} — ${escapeHTML(r.artist)}</h3><p>${r.type} · ${r.year} · ${Number(r.score).toFixed(1)}/90 · Жанр: ${escapeHTML(r.genre||"не указан")}</p><label class="field"><span>ЖАНР</span><input type="text" maxlength="60" data-release-genre="${r.id}" value="${escapeHTML(r.genre||"")}" placeholder="Например, хип-хоп"></label><button class="lime" data-save-genre="${r.id}">Сохранить жанр</button><label class="field"><span>НАЗВАНИЕ ТРЕКА / АЛЬБОМА</span><input type="text" maxlength="100" data-release-title="${r.id}" value="${escapeHTML(r.title)}"></label><label class="field"><span>ОПИСАНИЕ</span><textarea maxlength="2000" data-release-description="${r.id}" rows="3">${escapeHTML(r.description||"")}</textarea></label><button class="lime" data-save-details="${r.id}">Сохранить название и описание</button><label class="field"><span>ССЫЛКА НА ОБЛОЖКУ</span><input type="url" data-cover-url="${r.id}" value="${/^https:\/\//i.test(String(r.cover||""))?String(r.cover).replace(/&/g,"&amp;").replace(/"/g,"&quot;"):""}" placeholder="https://..."></label><button class="lime" data-save-cover="${r.id}">Сохранить обложку</button><label class="field"><span>ССЫЛКА НА ПРОСЛУШИВАНИЕ</span><input type="url" data-listening-url="${r.id}" value="${String(r.listening_url||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")}" placeholder="https://..."></label><button class="lime" data-save-listening="${r.id}">Сохранить ссылку</button></div><button class="danger" data-delete-release="${r.id}">Удалить трек</button></article>`).join("")||"<p>Релизов пока нет.</p>";
  $("#adminReviews").innerHTML=reviews.map(r=>`<article class="review admin-item"><div><h3>${r.title||r.release} — ${r.artist}</h3><p>Автор: ${r.username} · ${r.release}</p><p>${String(r.body||"").slice(0,180)}</p></div><button class="danger" data-delete-review="${r.id}">Удалить рецензию</button></article>`).join("")||"<p>Рецензий пока нет.</p>";
  loadAdminRatings();
}
$("#submissionForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!token){auth();return;}const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.year=Number(data.year);try{await api("/submissions",{method:"POST",body:JSON.stringify(data)});e.currentTarget.reset();toast("Заявка отправлена на модерацию");await loadMySubmissions();}catch(err){toast(err.message);}});
$("#pendingSubmissions")?.addEventListener("click",async e=>{const approve=e.target.closest("[data-approve]"),reject=e.target.closest("[data-reject]");const btn=approve||reject;if(!btn)return;try{let reason="";if(reject){reason=prompt("Причина отклонения (необязательно):")||"";}await api("/admin/submissions/"+btn.dataset[approve?"approve":"reject"]+"/"+(approve?"approve":"reject"),{method:"POST",body:JSON.stringify({reason})});toast(approve?"Релиз опубликован":"Заявка отклонена");await loadPending();await load();}catch(err){toast(err.message);}});
$("#adminReleases")?.addEventListener("click",async e=>{const genre=e.target.closest("[data-save-genre]");if(genre){const id=genre.dataset.saveGenre,value=$(`[data-release-genre="${id}"]`).value.trim();if(value.length>60){toast("Жанр не должен превышать 60 символов");return;}try{await api("/admin/releases/"+id+"/genre",{method:"PATCH",body:JSON.stringify({genre:value})});await load();renderAdminContent();toast("Жанр обновлён");}catch(err){toast(err.message);}return;}const details=e.target.closest("[data-save-details]");if(details){const id=details.dataset.saveDetails,title=$(`[data-release-title="${id}"]`).value.trim(),description=$(`[data-release-description="${id}"]`).value.trim();if(!title){toast("Название не может быть пустым");return;}try{await api("/admin/releases/"+id+"/details",{method:"PATCH",body:JSON.stringify({title,description})});await load();renderAdminContent();toast("Название и описание обновлены");}catch(err){toast(err.message);}return;}const listen=e.target.closest("[data-save-listening]");if(listen){const id=listen.dataset.saveListening,input=$(`[data-listening-url="${id}"]`);try{await api("/admin/releases/"+id+"/listening",{method:"PATCH",body:JSON.stringify({listening_url:input.value})});await load();renderAdminContent();toast("Ссылка на прослушивание сохранена");}catch(err){toast(err.message);}return;}const save=e.target.closest("[data-save-cover]");if(save){const id=save.dataset.saveCover;const input=$(`[data-cover-url="${id}"]`);try{await api("/admin/releases/"+id+"/cover",{method:"PATCH",body:JSON.stringify({cover_url:input.value})});await load();renderAdminContent();toast("Обложка обновлена");}catch(err){toast(err.message);}return;}const btn=e.target.closest("[data-delete-release]");if(!btn)return;const r=releases.find(x=>x.id===Number(btn.dataset.deleteRelease));if(!r||!confirm(`Точно удалить трек «${r.title}»? Все его оценки и рецензии тоже будут удалены.`))return;try{await api("/admin/releases/"+r.id,{method:"DELETE"});await load();renderAdminContent();toast("Трек и связанные данные удалены");}catch(err){toast(err.message);}});
$("#adminRatings")?.addEventListener("click",async e=>{
  const btn=e.target.closest("[data-admin-delete-rating]");if(!btn)return;
  if(!confirm("Удалить оценку этого пользователя?"))return;
  try{await api("/admin/ratings/"+encodeURIComponent(decodeURIComponent(btn.dataset.adminDeleteRating))+"/"+btn.dataset.ratingRelease,{method:"DELETE"});await load();await loadAdminRatings();toast("Оценка пользователя удалена");}catch(err){toast(err.message);}
});
$("#adminUsers")?.addEventListener("click",async e=>{
  const btn=e.target.closest("[data-delete-user]");
  if(!btn)return;
  const id=decodeURIComponent(btn.dataset.deleteUser);
  const row=btn.closest(".admin-item");
  const username=row?.querySelector("h3")?.textContent||"пользователя";
  if(!confirm(`Точно удалить аккаунт «${username}»? Его рецензии, оценки, комментарии, лайки и избранное тоже будут удалены. Это действие необратимо.`))return;
  try{
    await api("/admin/users/"+encodeURIComponent(id),{method:"DELETE"});
    await load();
    await loadAdminUsers();
    toast("Аккаунт удалён");
  }catch(err){toast(err.message);}
});
$("#adminReviews")?.addEventListener("click",async e=>{const btn=e.target.closest("[data-delete-review]");if(!btn)return;const r=reviews.find(x=>x.id===btn.dataset.deleteReview);if(!r||!confirm(`Удалить рецензию «${r.title||r.release}» от ${r.username}?`))return;try{await api("/admin/reviews/"+r.id,{method:"DELETE"});await load();renderAdminContent();toast("Рецензия удалена");}catch(err){toast(err.message);}});

function criteriaFields(prefix){return [["sound","Рифмы / образы","Содержание текста, рифмовка, метафоры и запоминающиеся образы."],["composition","Структура / ритмика","Построение трека, развитие, динамика, ритмика и флоу."],["lyrics","Реализация стиля","Насколько убедительно и качественно воплощён выбранный стиль: бит, звук, исполнение и продакшн."],["originality","Индивидуальность / харизма","Самобытность артиста, узнаваемость, подача и эмоциональная убедительность."],["atmosphere","Атмосфера / вайб","Субъективное общее впечатление от релиза; этот балл задаёт множитель."]].map(([key,label,help])=>`<label class="field criterion"><span>${label.toUpperCase()} · 0–10</span><input id="${prefix}${key}" type="number" min="0" max="10" step="1" required><small>${help}</small></label>`).join("")}
function calculateScore(c){return (c.sound+c.composition+c.lyrics+c.originality)*(1+c.atmosphere*0.125)}
function readCriteria(prefix){return Object.fromEntries(["sound","composition","lyrics","originality","atmosphere"].map(k=>[k,Number($("#"+prefix+k).value)]))}
function rateModal(r){

  modal(`<div class="rating-modal">
    <div class="rating-hero">
      <div class="rating-cover">${r.cover&&/^https:\/\//i.test(r.cover)?`<img src="${r.cover}" alt="">`:`<span>${String(r.art||r.artist||"♪").slice(0,1)}</span>`}</div>
      <div class="rating-track"><small>ОЦЕНКА РЕЛИЗА · ${String(r.type||"релиз").toUpperCase()}</small><h2>${escapeHTML(r.title)}</h2><p>${escapeHTML(r.artist)} · ${r.year}</p></div>
    </div>
    <div class="rating-release-info"><div class="rating-release-genre"><span>ЖАНР</span><b>${escapeHTML(r.genre||"Не указан")}</b></div><div class="rating-release-description"><span>ОПИСАНИЕ</span><p>${escapeHTML(r.description||"Описание не добавлено")}</p></div></div>
    <div class="rating-intro"><div><b>Предварительный итог</b><span>Баллы пересчитываются при каждом изменении</span></div><div class="rating-total"><strong id="ratingScorePreview">—</strong><small>/ 90</small></div></div>
    <div class="rating-progress"><span id="ratingScoreBar"></span></div>
    <div class="rating-criteria-heading"><h3>Критерии оценки</h3><small>КАЖДЫЙ ОТ 0 ДО 10</small></div>
    ${criteriaFields("rate_")}
    <div class="rating-formula">Первые четыре критерия формируют базовую оценку. Атмосфера / вайб умножает её от ×1 до ×2,25.</div>
    <button class="lime rating-submit" id="rateGo">${Number(r.rated_by_me)?"Сохранить изменения":"Сохранить оценку"} <span>↗</span></button>
    ${Number(r.rated_by_me)&&!Number(r.reviewed_by_me)?`<button type="button" class="danger delete-rating-button" id="deleteMyRating">Удалить мою оценку</button>`:""}
  </div>`);
  if(Number(r.rated_by_me)){for(const key of ["sound","composition","lyrics","originality","atmosphere"]){const field=$("#rate_"+key);if(field)field.value=r["my_"+key]??"";}}
  const updatePreview=()=>{
    const keys=["sound","composition","lyrics","originality","atmosphere"];
    const values=keys.map(k=>$("#rate_"+k).value.trim());
    const valid=values.every(v=>v===""||(Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=10));
    const score=valid?calculateScore(Object.fromEntries(keys.map((k,i)=>[k,values[i]===""?0:Number(values[i])]))):null;
    $("#ratingScorePreview").textContent=score===null?"—":score.toFixed(1);
    $("#ratingScoreBar").style.width=(score===null?0:score/90*100)+"%";
  };
  $$(".rating-modal .criterion input").forEach(input=>input.addEventListener("input",updatePreview));
  updatePreview();
  $("#rateGo").onclick=async()=>{if(!token)return auth();const criteria=readCriteria("rate_");if(Object.values(criteria).some(v=>!Number.isInteger(v)||v<0||v>10)){toast("Заполни все критерии целыми числами от 0 до 10");return;}try{await api(`/releases/${r.id}/rating`,{method:Number(r.rated_by_me)?"PATCH":"POST",body:JSON.stringify(criteria)});await load();close();toast("Оценка сохранена")}catch(e){toast(e.message)}};
  $("#deleteMyRating")?.addEventListener("click",async()=>{if(!confirm("Удалить свою оценку этого релиза?"))return;try{await api(`/releases/${r.id}/rating`,{method:"DELETE"});await load();close();toast("Оценка удалена")}catch(e){toast(e.message)}});
}
function writeReview(){
  if(!token)return auth();
  if(!releases.length){toast("Сначала добавь релиз на сайт");return;}
  const first=releases[0];
  const hero=r=>`<div class="rating-cover">${r.cover&&/^https:\/\//i.test(r.cover)?`<img src="${r.cover}" alt="">`:`<span>${String(r.art||r.artist||"♪").slice(0,1)}</span>`}</div><div class="rating-track"><small>НОВАЯ РЕЦЕНЗИЯ · ${String(r.type||"релиз").toUpperCase()}</small><h2>${r.title}</h2><p>${r.artist} · ${r.year}</p></div>`;
  modal(`<div class="rating-modal review-compose">
    <div class="rating-hero" id="reviewReleaseHero">${hero(first)}</div>
    <label class="field review-release"><span>ВЫБЕРИ РЕЛИЗ</span><select id="rid">${releases.map(r=>`<option value="${r.id}">${r.title} — ${r.artist}</option>`).join("")}</select></label>
    <label class="field review-title"><span>ЗАГОЛОВОК РЕЦЕНЗИИ</span><input id="rtitle" maxlength="100" placeholder="Коротко о главном"></label>
    <div class="rating-intro"><div><b>Предварительный итог</b><span>Оценка пересчитывается при изменении критериев</span></div><div class="rating-total"><strong id="reviewScorePreview">0.0</strong><small>/ 90</small></div></div>
    <div class="rating-progress"><span id="reviewScoreBar"></span></div>
    <div class="rating-criteria-heading"><h3>Критерии оценки</h3><small>КАЖДЫЙ ОТ 0 ДО 10</small></div>
    ${criteriaFields("review_")}
    <div class="rating-formula">Первые четыре критерия формируют базовую оценку. Атмосфера / вайб умножает её от ×1 до ×2,25.</div>
    <div class="review-writing-heading"><h3>Текст рецензии</h3><p>Расскажи, что понравилось и что можно улучшить</p></div>
    <label class="field"><span>ПЛЮСЫ</span><textarea id="rpros" maxlength="1000" placeholder="Что особенно удалось?"></textarea></label>
    <label class="field"><span>МИНУСЫ</span><textarea id="rcons" maxlength="1000" placeholder="Что можно было сделать лучше?"></textarea></label>
    <label class="field"><span>РЕЦЕНЗИЯ · ОТ 50 ДО 5000 СИМВОЛОВ</span><textarea id="rbody" maxlength="5000" placeholder="Расскажи о звучании, идеях и впечатлениях..."></textarea></label>
    <button class="lime rating-submit" id="publish">Опубликовать рецензию <span>↗</span></button>
  </div>`);
  $("#rid").onchange=()=>{const r=releases.find(x=>Number(x.id)===Number($("#rid").value));if(r)$("#reviewReleaseHero").innerHTML=hero(r);};
  const updateReviewPreview=()=>{
    const keys=["sound","composition","lyrics","originality","atmosphere"];
    const values=keys.map(k=>$("#review_"+k).value.trim());
    const valid=values.every(v=>v===""||(Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=10));
    const score=valid?calculateScore(Object.fromEntries(keys.map((k,i)=>[k,values[i]===""?0:Number(values[i])]))):null;
    $("#reviewScorePreview").textContent=score===null?"—":score.toFixed(1);
    $("#reviewScoreBar").style.width=(score===null?0:score/90*100)+"%";
  };
  $$(".review-compose .criterion input").forEach(input=>input.addEventListener("input",updateReviewPreview));
  updateReviewPreview();
  $("#publish").onclick=async()=>{try{
    const criteria=readCriteria("review_");
    if(Object.values(criteria).some(v=>!Number.isInteger(v)||v<0||v>10)){toast("Заполни все критерии целыми числами от 0 до 10");return;}
    if($("#rbody").value.trim().length<50){toast("Рецензия должна содержать минимум 50 символов");return;}
    await api("/reviews",{method:"POST",body:JSON.stringify({releaseId:Number($("#rid").value),title:$("#rtitle").value,pros:$("#rpros").value,cons:$("#rcons").value,body:$("#rbody").value,...criteria})});
    await load();close();toast("Рецензия опубликована");
  }catch(e){toast(e.message)}};
}
document.addEventListener("submit",async e=>{
 const form=e.target.closest("[data-comment-form], [data-comment-reply-form]");if(!form)return;
 e.preventDefault();if(!token){auth();return;}
 const reviewId=form.dataset.commentForm||form.dataset.reviewId,body=form.querySelector("textarea").value.trim();if(!body)return;
 const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
 try{
  await api("/reviews/"+encodeURIComponent(reviewId)+"/comments",{method:"POST",body:JSON.stringify({body,parentCommentId:form.dataset.parentComment||null})});
  const panel=document.querySelector('[data-comments-panel="'+reviewId+'"]');
  if(panel){panel.hidden=false;panel.dataset.loaded="1";const data=await api("/reviews/"+encodeURIComponent(reviewId)+"/comments");const list=document.querySelector('[data-comments-list="'+reviewId+'"]');if(list)list.innerHTML=renderCommentTree(data.comments||[])||'<p class="comments-empty">Пока нет комментариев. Будь первым!</p>';const mainForm=panel.querySelector("[data-comment-form]");if(mainForm)mainForm.reset();}
  await loadNotifications();toast(form.dataset.parentComment?"Ответ опубликован":"Комментарий опубликован");
 }catch(err){toast(err.message);}finally{submit.disabled=false;}
});

$("#charts")?.addEventListener("click",e=>{const b=e.target.closest("[data-top]");if(!b)return;activeTop=b.dataset.top;renderTop()});
document.addEventListener("click",e=>{const link=e.target.closest("button[data-profile]");if(!link)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();loadProfile(link.dataset.profile);},true);
$$("nav button").forEach(b=>b.onclick=()=>{go(b.dataset.page);if(b.dataset.page==="submit")loadMySubmissions();if(b.dataset.page==="admin")loadPending();if(b.dataset.page==="favorites")loadFavoritePage();if(b.dataset.page==="notifications")loadNotifications();if(b.dataset.page==="following")loadFollowing();});$$("[data-goto]").forEach(b=>b.onclick=()=>go(b.dataset.goto));document.addEventListener("change",e=>{if(e.target.id==="avatarFile"&&e.target.files?.[0])saveAvatar(e.target.files[0]);});
document.addEventListener("click",async e=>{const notification=e.target.closest("[data-notification-open]");if(notification){if(!token){auth();return;}const id=notification.dataset.notificationOpen,reviewId=notification.dataset.notificationReview;try{await api("/notifications/"+encodeURIComponent(id)+"/read",{method:"PATCH"});await loadNotifications();go("reviews");renderReviewList();requestAnimationFrame(()=>{const target=$("[data-review-id]").find(x=>x.dataset.reviewId===reviewId);if(target){target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("notification-target");setTimeout(()=>target.classList.remove("notification-target"),2200);}else toast("Рецензия больше недоступна");});}catch(err){toast(err.message);}return;}const markAll=e.target.closest("[data-notifications-read-all]");if(markAll){try{await api("/notifications/read-all",{method:"PATCH"});await loadNotifications();}catch(err){toast(err.message);}return;}const pin=e.target.closest("[data-pin-review]");if(pin){if(!token){auth();return;}const id=pin.dataset.pinned==="1"?null:pin.dataset.pinReview;try{await api("/me/pinned-review",{method:"PATCH",body:JSON.stringify({reviewId:id})});await load();if($("#profile").classList.contains("active")&&user)await loadProfile(user.username);toast(id?"Рецензия закреплена в профиле":"Рецензия откреплена");}catch(err){toast(err.message);}return;}const follow=e.target.closest("[data-follow-user]");if(follow){if(!token){auth();return;}const following=follow.dataset.following==="1";try{await api("/users/"+encodeURIComponent(follow.dataset.followUser)+"/follow",{method:following?"DELETE":"POST"});await loadProfile(follow.dataset.followUser);toast(following?"Подписка отменена":"Ты подписался на пользователя");}catch(err){toast(err.message);}return;}const reply=e.target.closest("[data-reply-comment]");if(reply){if(!token){auth();return;}const comment=reply.closest(".review-comment"),reviewId=reply.closest("[data-review-comments]").dataset.reviewComments;comment.querySelector("[data-comment-reply-form]")?.remove();comment.insertAdjacentHTML("beforeend",'<form class="comment-reply-form" data-comment-reply-form data-review-id="'+escapeHTML(reviewId)+'" data-parent-comment="'+escapeHTML(reply.dataset.replyComment)+'"><textarea maxlength="1000" placeholder="Твой ответ…" required></textarea><button type="submit" class="lime">Ответить</button></form>');comment.querySelector("[data-comment-reply-form] textarea").focus();return;}const commentsToggle=e.target.closest("[data-comments-toggle]");if(commentsToggle){const id=commentsToggle.dataset.commentsToggle,panel=$(`[data-comments-panel="${id}"]`);if(panel.hidden){panel.hidden=false;if(panel.dataset.loaded!=="1"){try{const d=await api("/reviews/"+encodeURIComponent(id)+"/comments");$('[data-comments-list="'+id+'"]').innerHTML=renderCommentTree(d.comments||[])||'<p class="comments-empty">Пока нет комментариев. Будь первым!</p>';panel.dataset.loaded="1";}catch(err){$('[data-comments-list="'+id+'"]').innerHTML='<p class="comments-empty">'+escapeHTML(err.message)+'</p>';}}}else panel.hidden=true;return;}const deleteComment=e.target.closest("[data-comment-delete]");if(deleteComment){const reviewId=deleteComment.closest("[data-review-comments]").dataset.reviewComments;if(!confirm("Удалить этот комментарий?"))return;try{await api("/reviews/"+encodeURIComponent(reviewId)+"/comments/"+encodeURIComponent(deleteComment.dataset.commentDelete),{method:"DELETE"});await load();toast("Комментарий удалён");}catch(err){toast(err.message);}return;}const sort=e.target.closest("[data-review-sort]");if(sort){activeReviewSort=sort.dataset.reviewSort;renderReviewList();return;}const ownReviewDelete=e.target.closest("[data-delete-own-review]");if(ownReviewDelete){const id=ownReviewDelete.dataset.deleteOwnReview;const item=reviews.find(x=>String(x.id)===String(id));if(!confirm(`Удалить свою рецензию «${item?.title||item?.release||""}»? Связанная оценка этого релиза тоже будет удалена, если других ваших рецензий на него нет.`))return;try{await api("/reviews/"+encodeURIComponent(id),{method:"DELETE"});await load();if($("#profile").classList.contains("active")&&user)await loadProfile(user.username);toast("Рецензия удалена");}catch(err){toast(err.message);}return;}const editReviewRating=e.target.closest("[data-edit-review-rating]");if(editReviewRating){if(!token){auth();return;}const id=editReviewRating.dataset.editReviewRating;const current=reviews.find(x=>String(x.id)===String(id));if(!current)return;modal(`<div class="rating-modal"><small>ИЗМЕНЕНИЕ ОЦЕНКИ В РЕЦЕНЗИИ</small><h2>${escapeHTML(current.title||current.release)}</h2><p>${escapeHTML(current.artist)}</p><div class="rating-intro"><div><b>Предварительный итог</b><span>Баллы пересчитываются автоматически</span></div><div class="rating-total"><strong id="reviewEditScore">—</strong><small>/ 90</small></div></div><div class="rating-progress"><span id="reviewEditBar"></span></div>${criteriaFields("review_edit_")}<div class="rating-formula">Изменение обновит оценку и в рецензии, и в общей оценке релиза.</div><button type="button" class="lime rating-submit" id="saveReviewRating">Сохранить оценку</button></div>`);for(const key of ["sound","composition","lyrics","originality","atmosphere"]){const field=$("#review_edit_"+key);if(field)field.value=current[key]??0;}const preview=()=>{const c=readCriteria("review_edit_");const valid=Object.values(c).every(v=>Number.isInteger(v)&&v>=0&&v<=10);const score=valid?calculateScore(c):null;$("#reviewEditScore").textContent=score===null?"—":score.toFixed(1);$("#reviewEditBar").style.width=(score===null?0:score/90*100)+"%";};$(".rating-modal .criterion input").forEach(input=>input.addEventListener("input",preview));preview();$("#saveReviewRating").onclick=async()=>{const criteria=readCriteria("review_edit_");if(Object.values(criteria).some(v=>!Number.isInteger(v)||v<0||v>10)){toast("Заполни все критерии целыми числами от 0 до 10");return;}try{await api("/reviews/"+encodeURIComponent(id)+"/rating",{method:"PATCH",body:JSON.stringify(criteria)});await load();if($("#profile").classList.contains("active")&&user)await loadProfile(user.username);close();toast("Оценка в рецензии обновлена");}catch(err){toast(err.message);}};return;}const appendReview=e.target.closest("[data-append-review]");if(appendReview){if(!token){auth();return;}const id=appendReview.dataset.appendReview;const current=reviews.find(x=>String(x.id)===String(id));if(!current)return;modal(`<div class="rating-modal"><small>ДОПОЛНЕНИЕ К РЕЦЕНЗИИ</small><h2>${escapeHTML(current.title||current.release)}</h2><p>${escapeHTML(current.artist)}</p><label class="field"><span>НОВЫЙ ТЕКСТ · ДО 5000 СИМВОЛОВ</span><textarea id="reviewAddition" maxlength="5000" placeholder="Продолжи свою рецензию…" required></textarea></label><button class="lime rating-submit" id="saveReviewAddition">Сохранить дополнение</button></div>`);$("#saveReviewAddition").onclick=async()=>{const addition=$("#reviewAddition").value.trim();if(!addition){toast("Напиши текст дополнения");return;}try{await api("/reviews/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({addition})});await load();close();toast("Рецензия дополнена");}catch(err){toast(err.message);}};return;}const like=e.target.closest("[data-review-like]");if(like){e.preventDefault();e.stopPropagation();if(!token){auth();return;}const id=like.dataset.reviewLike,liked=like.dataset.liked==="1";try{await api("/reviews/"+encodeURIComponent(id)+"/like",{method:liked?"DELETE":"POST"});await load();await loadNotifications();toast(liked?"Лайк убран":"Рецензия понравилась");}catch(err){toast(err.message);}return;}if(e.target.closest("[data-logout]")){token="";user=null;localStorage.removeItem("gsqzt_token");favoriteIds=new Set();notifications=[];draw();go("home");toast("Вы вышли из аккаунта");return;}if(e.target.closest("[data-back-profile]")){go("reviews");return;}const fav=e.target.closest("[data-favorite]");if(fav){e.preventDefault();e.stopPropagation();if(!token){auth();return;}const id=Number(fav.dataset.favorite);try{if(favoriteIds.has(id)){await api("/favorites/"+id,{method:"DELETE"});favoriteIds.delete(id);toast("Удалено из избранного");}else{await api("/favorites/"+id,{method:"POST"});favoriteIds.add(id);toast("Добавлено в избранное");}draw();loadFavoritePage();}catch(err){toast(err.message)}return;}if(e.target.closest("[data-listen-link]"))return;let c=e.target.closest(".card");if(c){let r=releases.find(x=>x.id===Number(c.dataset.id));if(r)rateModal(r)}});$("#login").onclick=()=>{if(user){loadProfile(user.username)}else auth()};$("#write").onclick=writeReview;$("#close").onclick=close;$("#modal").onclick=e=>{if(e.target.id==="modal")close()};$$(".filter").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x===b));draw()});$("#search").oninput=()=>{let q=$("#search").value.toLowerCase();$("#allReleases").innerHTML=releases.filter(r=>(r.title+" "+r.artist).toLowerCase().includes(q)).filter(r=>filter==="all"||r.type===filter).map(card).join("")};$("#globalSearch")?.addEventListener("input",e=>renderSearch(e.target.value));
(async()=>{if(token){try{user=(await api("/me")).user}catch{token="";localStorage.removeItem("gsqzt_token")}}try{await load();if(token)await loadNotifications()}catch(e){toast("Нет связи с backend: "+e.message)}})();
