const encoder = new TextEncoder();

const SEEDS = [
  { id: 1, title: "Ночной город", artist: "MIRA", type: "Альбом", year: 2026, tag: "NEW", art: "M", cover: "linear-gradient(135deg,#f15d52,#662d75)", description: "Синтезаторы, ночные маршруты и честные тексты.", score: 8.7 },
  { id: 2, title: "Пыль на виниле", artist: "KOSMO", type: "Альбом", year: 2026, tag: "TOP", art: "K", cover: "linear-gradient(145deg,#e5a34b,#9a432c)", description: "Тёплый звук и меланхоличная электроника.", score: 9.1 },
  { id: 3, title: "Без адреса", artist: "СЕВЕР", type: "Сингл", year: 2026, tag: "SINGLE", art: "С", cover: "linear-gradient(135deg,#8cacc5,#243c59)", description: "Минималистичная история о поиске себя.", score: 8.2 },
  { id: 4, title: "Параллели", artist: "LILAC", type: "Альбом", year: 2025, tag: "EDITOR'S", art: "L", cover: "linear-gradient(135deg,#b9c4a1,#607c66)", description: "Мягкая психоделия и воздушный вокал.", score: 9.4 }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function b64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(value) {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base + "=".repeat((4 - base.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
function unhex(value) {
  return new Uint8Array((value.match(/.{1,2}/g) || []).map(x => parseInt(x, 16)));
}
function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}
async function passwordHash(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unhex(saltHex), iterations: 100000, hash: "SHA-256" },
    key, 256
  );
  return hex(new Uint8Array(bits));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(user, secret) {
  const payload = b64url(encoder.encode(JSON.stringify({ id: user.id, exp: Date.now() + 7 * 864e5 })));
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return payload + "." + b64url(signature);
}
async function getUser(request, db, secret) {
  try {
    const raw = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = raw.split(".");
    if (!payload || !signature) return null;
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify("HMAC", key, fromB64url(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data.exp || data.exp <= Date.now()) return null;
    return await db.prepare("SELECT id, username, email, avatar FROM users WHERE id = ?").bind(data.id).first();
  } catch {
    return null;
  }
}
async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}
async function ensureSeeds(db) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM releases").first();
  if (row && row.n > 0) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO releases (id,title,artist,type,year,tag,art,cover,description,score) VALUES (?,?,?,?,?,?,?,?,?,?)"
  );
  for (const r of SEEDS) {
    await stmt.bind(r.id,r.title,r.artist,r.type,r.year,r.tag,r.art,r.cover,r.description,r.score).run();
  }
}
function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, avatar: user.avatar || null };
}

async function ensureReleaseListeningColumn(db) {
 const cols=await db.prepare("PRAGMA table_info(releases)").all();
 if(!(cols.results||[]).some(c=>c.name==="listening_url")) await db.prepare("ALTER TABLE releases ADD COLUMN listening_url TEXT NOT NULL DEFAULT ''").run();
}

async function ensureReleaseGenreColumn(db) {
  const cols = await db.prepare("PRAGMA table_info(releases)").all();
  if (!(cols.results || []).some(c => c.name === "genre")) await db.prepare("ALTER TABLE releases ADD COLUMN genre TEXT NOT NULL DEFAULT ''").run();
}
async function ensureAvatarColumn(db) {
  const cols = await db.prepare("PRAGMA table_info(users)").all();
  if (!(cols.results || []).some(c => c.name === "avatar")) await db.prepare("ALTER TABLE users ADD COLUMN avatar TEXT").run();
}

async function ensureRatingColumns(db) {
  const ratingCols = await db.prepare("PRAGMA table_info(ratings)").all();
  const existingRatings = new Set((ratingCols.results || []).map(c => c.name));
  for (const name of ["sound","composition","lyrics","originality","atmosphere"]) {
    if (!existingRatings.has(name)) await db.prepare(`ALTER TABLE ratings ADD COLUMN ${name} INTEGER`).run();
  }
  const reviewCols = await db.prepare("PRAGMA table_info(reviews)").all();
  const existingReviews = new Set((reviewCols.results || []).map(c => c.name));
  for (const [name, definition] of [["title","TEXT NOT NULL DEFAULT ''"],["pros","TEXT NOT NULL DEFAULT ''"],["cons","TEXT NOT NULL DEFAULT ''"],["sound","INTEGER"],["composition","INTEGER"],["lyrics","INTEGER"],["originality","INTEGER"],["atmosphere","INTEGER"],["release_id","INTEGER"]]) {
    if (!existingReviews.has(name)) await db.prepare(`ALTER TABLE reviews ADD COLUMN ${name} ${definition}`).run();
  }
  await db.prepare("UPDATE reviews SET release_id=(SELECT r.id FROM releases r WHERE lower(r.title)=lower(reviews.release_title) AND lower(r.artist)=lower(reviews.artist) LIMIT 1) WHERE release_id IS NULL").run();
}
async function ensureScoreScale(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS gsqzt_migrations (id TEXT PRIMARY KEY)").run();
  const done = await db.prepare("SELECT id FROM gsqzt_migrations WHERE id = ?").bind("score-scale-90-v1").first();
  if (done) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS ratings_v2 (user_id TEXT NOT NULL REFERENCES users(id), release_id INTEGER NOT NULL REFERENCES releases(id), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 90), sound INTEGER, composition INTEGER, lyrics INTEGER, originality INTEGER, atmosphere INTEGER, PRIMARY KEY(user_id,release_id))").run();
  await db.prepare("INSERT OR IGNORE INTO ratings_v2 SELECT user_id,release_id,MIN(90,MAX(0,ROUND(score*9))),CASE WHEN sound IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(sound*1.8))) END,CASE WHEN composition IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(composition*1.8))) END,CASE WHEN lyrics IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(lyrics*1.8))) END,CASE WHEN originality IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(originality*1.8))) END,CASE WHEN atmosphere IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(atmosphere*1.8))) END FROM ratings").run();
  await db.prepare("DROP TABLE ratings").run();
  await db.prepare("ALTER TABLE ratings_v2 RENAME TO ratings").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS reviews_v2 (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), username TEXT NOT NULL, release_title TEXT NOT NULL, artist TEXT NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 90), body TEXT NOT NULL, created_at TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', pros TEXT NOT NULL DEFAULT '', cons TEXT NOT NULL DEFAULT '', sound INTEGER, composition INTEGER, lyrics INTEGER, originality INTEGER, atmosphere INTEGER)").run();
  await db.prepare("INSERT OR IGNORE INTO reviews_v2 SELECT id,user_id,username,release_title,artist,MIN(90,MAX(0,ROUND(score*9))),body,created_at,title,pros,cons,CASE WHEN sound IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(sound*1.8))) END,CASE WHEN composition IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(composition*1.8))) END,CASE WHEN lyrics IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(lyrics*1.8))) END,CASE WHEN originality IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(originality*1.8))) END,CASE WHEN atmosphere IS NULL THEN NULL ELSE MIN(18,MAX(0,ROUND(atmosphere*1.8))) END FROM reviews").run();
  await db.prepare("DROP TABLE reviews").run();
  await db.prepare("ALTER TABLE reviews_v2 RENAME TO reviews").run();
  await db.prepare("UPDATE releases SET score=MIN(90,MAX(0,ROUND(score*9,1))) WHERE score > 0 AND score <= 10").run();
  await db.prepare("INSERT INTO gsqzt_migrations (id) VALUES (?)").bind("score-scale-90-v1").run();
}
async function ensureAtmosphereMultiplier(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS gsqzt_migrations (id TEXT PRIMARY KEY)").run();
  const migrationId = "atmosphere-multiplier-v2";
  const done = await db.prepare("SELECT id FROM gsqzt_migrations WHERE id = ?").bind(migrationId).first();
  if (done) return;
  for (const table of ["ratings", "reviews"]) {
    await db.prepare(`UPDATE ${table} SET
      sound=CASE WHEN sound IS NULL THEN NULL ELSE MIN(10,MAX(0,ROUND(sound*10.0/18))) END,
      composition=CASE WHEN composition IS NULL THEN NULL ELSE MIN(10,MAX(0,ROUND(composition*10.0/18))) END,
      lyrics=CASE WHEN lyrics IS NULL THEN NULL ELSE MIN(10,MAX(0,ROUND(lyrics*10.0/18))) END,
      originality=CASE WHEN originality IS NULL THEN NULL ELSE MIN(10,MAX(0,ROUND(originality*10.0/18))) END,
      atmosphere=CASE WHEN atmosphere IS NULL THEN NULL ELSE MIN(10,MAX(0,ROUND(atmosphere*10.0/18))) END`).run();
    await db.prepare(`UPDATE ${table} SET score=ROUND(
      (COALESCE(sound,0)+COALESCE(composition,0)+COALESCE(lyrics,0)+COALESCE(originality,0)) *
      (1+COALESCE(atmosphere,0)*0.125),1)`).run();
  }
  await db.prepare("INSERT INTO gsqzt_migrations (id) VALUES (?)").bind(migrationId).run();
}
async function ensureCommunityFeatures(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS user_follows (follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, followed_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(follower_user_id,followed_user_id))").run();
  const userCols = await db.prepare("PRAGMA table_info(users)").all();
  if (!(userCols.results || []).some(c => c.name === "pinned_review_id")) await db.prepare("ALTER TABLE users ADD COLUMN pinned_review_id TEXT").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS review_comments (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), username TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  const commentCols = await db.prepare("PRAGMA table_info(review_comments)").all();
  if (!(commentCols.results || []).some(c => c.name === "parent_comment_id")) await db.prepare("ALTER TABLE review_comments ADD COLUMN parent_comment_id TEXT").run();
}
async function ensureDirectMessages(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS direct_messages (id TEXT PRIMARY KEY, sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, edited_at TEXT)").run();
  const messageCols=await db.prepare("PRAGMA table_info(direct_messages)").all();
  if(!(messageCols.results||[]).some(c=>c.name==="edited_at"))await db.prepare("ALTER TABLE direct_messages ADD COLUMN edited_at TEXT").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_created ON direct_messages(sender_user_id,created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_created ON direct_messages(recipient_user_id,created_at)").run();
}
async function ensureReportsTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS content_reports (id TEXT PRIMARY KEY, reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT, UNIQUE(reporter_user_id,target_type,target_id))").run();
}
async function ensureNotificationsTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_user_id TEXT, actor_username TEXT NOT NULL, type TEXT NOT NULL, review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE, created_at TEXT NOT NULL, read_at TEXT)").run();
  const cols = await db.prepare("PRAGMA table_info(notifications)").all();
  const reviewColumn = (cols.results || []).find(c => c.name === "review_id");
  if (reviewColumn && Number(reviewColumn.notnull) === 1) {
    await db.prepare("CREATE TABLE notifications_v2 (id TEXT PRIMARY KEY, recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_user_id TEXT, actor_username TEXT NOT NULL, type TEXT NOT NULL, review_id TEXT REFERENCES reviews(id) ON DELETE CASCADE, created_at TEXT NOT NULL, read_at TEXT)").run();
    await db.prepare("INSERT INTO notifications_v2 (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at,read_at) SELECT id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at,read_at FROM notifications").run();
    await db.prepare("DROP TABLE notifications").run();
    await db.prepare("ALTER TABLE notifications_v2 RENAME TO notifications").run();
  }
}
async function ensureSubmissionTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS release_submissions (
      id TEXT PRIMARY KEY, submitter_user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, artist TEXT NOT NULL, type TEXT NOT NULL, year INTEGER NOT NULL,
      genre TEXT NOT NULL, cover_url TEXT NOT NULL, description TEXT NOT NULL, listening_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT,
      reviewed_by TEXT, rejection_reason TEXT
    )
  `).run();
}
function isAdmin(user) { return !!user && user.username.toLowerCase() === "towhell"; }

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.GSQZT_DB) return json({ error: "База данных GSQZT не подключена. Проверь D1 binding с именем GSQZT_DB." }, 503);
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) return json({ error: "Не задан JWT_SECRET (минимум 32 символа) в настройках Pages." }, 503);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const db = env.GSQZT_DB;

  try {
    if (method === "OPTIONS") return new Response(null, { status: 204 });
    await ensureSeeds(db);
    await ensureAvatarColumn(db);
    await ensureReleaseListeningColumn(db);
    await ensureReleaseGenreColumn(db);
    await ensureSubmissionTables(db);
    await ensureCommunityFeatures(db);
    await ensureNotificationsTable(db);
    await ensureReportsTable(db);
    await ensureDirectMessages(db);
    await ensureRatingColumns(db);
    await ensureScoreScale(db);
    await ensureAtmosphereMultiplier(db);
    const body = ["POST","PATCH"].includes(method) ? await readBody(request) : {};
    const user = await getUser(request, db, env.JWT_SECRET);

    if (path === "/api/health" && method === "GET") return json({ ok: true });

    if (path === "/api/auth/register" && method === "POST") {
      const username = String(body.username || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (username.length < 3 || username.length > 24 || !/^[\p{L}\p{N}_.-]+$/u.test(username))
        return json({ error: "Ник: 3–24 символа; разрешены буквы, цифры, _, . и -" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72)
        return json({ error: "Проверь email и пароль (8–72 символа)" }, 400);
      const existing = await db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE")
        .bind(email, username).first();
      if (existing) return json({ error: "Ник или email уже занят" }, 409);
      const id = crypto.randomUUID();
      const salt = randomHex(16);
      const passHash = await passwordHash(password, salt);
      await db.prepare("INSERT INTO users (id,username,email,salt,password_hash,created_at) VALUES (?,?,?,?,?,?)")
        .bind(id, username, email, salt, passHash, new Date().toISOString()).run();
      const newUser = { id, username, email };
      return json({ token: await makeToken(newUser, env.JWT_SECRET), user: publicUser(newUser) }, 201);
    }

    if (path === "/api/auth/login" && method === "POST") {
      const identity = String(body.identity || "").trim().toLowerCase();
      const record = await db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE")
        .bind(identity, identity).first();
      if (!record) return json({ error: "Неверный логин или пароль" }, 401);
      const candidate = await passwordHash(String(body.password || ""), record.salt);
      if (candidate !== record.password_hash) return json({ error: "Неверный логин или пароль" }, 401);
      const safe = publicUser(record);
      return json({ token: await makeToken(safe, env.JWT_SECRET), user: safe });
    }

    if (path === "/api/me" && method === "GET")
      return user ? json({ user: publicUser(user) }) : json({ error: "Войдите в аккаунт" }, 401);

    if (path === "/api/me/avatar" && method === "PATCH") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      const avatar = String(body.avatar || "");
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(avatar) || avatar.length > 700000)
        return json({ error: "Изображение слишком большое или имеет неподдерживаемый формат" }, 400);
      await db.prepare("UPDATE users SET avatar=? WHERE id=?").bind(avatar,user.id).run();
      return json({ ok: true, avatar });
    }

    if (path === "/api/releases" && method === "GET") {
      const releases = await db.prepare(`
        SELECT r.*,
          COALESCE(ROUND(AVG(rt.score),1), r.score) AS score,
          CASE WHEN EXISTS(SELECT 1 FROM ratings mine WHERE mine.release_id=r.id AND mine.user_id=?)
          OR EXISTS(SELECT 1 FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=?) THEN 1 ELSE 0 END AS rated_by_me,
          CASE WHEN EXISTS(SELECT 1 FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=?) THEN 1 ELSE 0 END AS reviewed_by_me,
        COALESCE((SELECT mine.sound FROM ratings mine WHERE mine.release_id=r.id AND mine.user_id=? LIMIT 1),(SELECT mineReview.sound FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=? ORDER BY mineReview.created_at DESC LIMIT 1)) AS my_sound,
        COALESCE((SELECT mine.composition FROM ratings mine WHERE mine.release_id=r.id AND mine.user_id=? LIMIT 1),(SELECT mineReview.composition FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=? ORDER BY mineReview.created_at DESC LIMIT 1)) AS my_composition,
        COALESCE((SELECT mine.lyrics FROM ratings mine WHERE mine.release_id=r.id AND mine.user_id=? LIMIT 1),(SELECT mineReview.lyrics FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=? ORDER BY mineReview.created_at DESC LIMIT 1)) AS my_lyrics,
        COALESCE((SELECT mine.originality FROM ratings mine WHERE mine.release_id=r.id AND mine.user_id=? LIMIT 1),(SELECT mineReview.originality FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=? ORDER BY mineReview.created_at DESC LIMIT 1)) AS my_originality,
        COALESCE((SELECT mine.atmosphere FROM ratings mine WHERE mine.release_id=r.id AND mine.user_id=? LIMIT 1),(SELECT mineReview.atmosphere FROM reviews mineReview WHERE mineReview.release_id=r.id AND mineReview.user_id=? ORDER BY mineReview.created_at DESC LIMIT 1)) AS my_atmosphere
        FROM releases r LEFT JOIN ratings rt ON rt.release_id = r.id
        GROUP BY r.id ORDER BY r.id
      `).bind(user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null,user?.id || null).all();
      return json({ releases: releases.results || [] });
    }

    await db.prepare("CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id), release_id INTEGER NOT NULL REFERENCES releases(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,release_id))").run();

    if (path === "/api/favorites" && method === "GET") {
      if (!user) return json({ error: "Войдите, чтобы видеть избранное" }, 401);
      const rows = await db.prepare("SELECT release_id FROM favorites WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
      return json({ favorites: (rows.results || []).map(x => x.release_id) });
    }
    const favoriteMatch = path.match(/^\/api\/favorites\/(\d+)$/);
    if (favoriteMatch && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы добавлять в избранное" }, 401);
      const releaseId = Number(favoriteMatch[1]);
      const exists = await db.prepare("SELECT id FROM releases WHERE id=?").bind(releaseId).first();
      if (!exists) return json({ error: "Релиз не найден" }, 404);
      await db.prepare("INSERT OR IGNORE INTO favorites (user_id,release_id,created_at) VALUES (?,?,?)").bind(user.id,releaseId,new Date().toISOString()).run();
      return json({ ok: true });
    }
    if (favoriteMatch && method === "DELETE") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      await db.prepare("DELETE FROM favorites WHERE user_id=? AND release_id=?").bind(user.id,Number(favoriteMatch[1])).run();
      return json({ ok: true });
    }

    await db.prepare("CREATE TABLE IF NOT EXISTS review_likes (user_id TEXT NOT NULL REFERENCES users(id), review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(user_id,review_id))").run();
    await db.prepare("CREATE TABLE IF NOT EXISTS review_comments (id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), username TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)").run();
    if (path === "/api/messages" && method === "GET") {
      if (!user) return json({ error: "Войдите, чтобы смотреть сообщения" }, 401);
      const rows = await db.prepare("SELECT dm.sender_user_id,dm.recipient_user_id,dm.body,dm.created_at,dm.read_at,s.username AS sender_username,s.avatar AS sender_avatar,r.username AS recipient_username,r.avatar AS recipient_avatar FROM direct_messages dm JOIN users s ON s.id=dm.sender_user_id JOIN users r ON r.id=dm.recipient_user_id WHERE dm.sender_user_id=? OR dm.recipient_user_id=? ORDER BY dm.created_at DESC LIMIT 1000").bind(user.id,user.id).all();
      const conversations=new Map();
      for(const m of rows.results||[]){const mine=m.sender_user_id===user.id,other=mine?m.recipient_user_id:m.sender_user_id;if(!conversations.has(other))conversations.set(other,{username:mine?m.recipient_username:m.sender_username,avatar:mine?m.recipient_avatar:m.sender_avatar,last_message:m.body,created_at:m.created_at,unread_count:0});if(!mine&&!m.read_at)conversations.get(other).unread_count++;}
      return json({conversations:[...conversations.values()]});
    }
    const messagePrefix="/api/messages/with/";
    if(path.startsWith(messagePrefix)&&(method==="GET"||method==="POST")){
      if(!user)return json({error:"Войдите, чтобы отправлять сообщения"},401);
      const username=decodeURIComponent(path.slice(messagePrefix.length));
      const recipient=await db.prepare("SELECT id,username,avatar FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
      if(!recipient)return json({error:"Пользователь не найден"},404);
      if(recipient.id===user.id)return json({error:"Нельзя отправить сообщение самому себе"},400);
      if(method==="POST"){const message=String(body.body||"").trim();if(!message||message.length>2000)return json({error:"Сообщение должно содержать от 1 до 2000 символов"},400);const id=crypto.randomUUID(),createdAt=new Date().toISOString();await db.prepare("INSERT INTO direct_messages (id,sender_user_id,recipient_user_id,body,created_at) VALUES (?,?,?,?,?)").bind(id,user.id,recipient.id,message,createdAt).run();await db.prepare("INSERT INTO notifications (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),recipient.id,user.id,user.username,"message",null,createdAt).run();return json({ok:true,id,created_at:createdAt},201);}
      await db.prepare("UPDATE direct_messages SET read_at=COALESCE(read_at,?) WHERE sender_user_id=? AND recipient_user_id=? AND read_at IS NULL").bind(new Date().toISOString(),recipient.id,user.id).run();
      const rows=await db.prepare("SELECT id,sender_user_id,recipient_user_id,body,created_at,read_at,edited_at FROM direct_messages WHERE (sender_user_id=? AND recipient_user_id=?) OR (sender_user_id=? AND recipient_user_id=?) ORDER BY created_at ASC LIMIT 500").bind(user.id,recipient.id,recipient.id,user.id).all();
      return json({user:{username:recipient.username,avatar:recipient.avatar},messages:(rows.results||[]).map(m=>({...m,mine:m.sender_user_id===user.id}))});
    }

    const messageIdPrefix="/api/messages/";
    if(path.startsWith(messageIdPrefix)&&!path.startsWith(messagePrefix)&&(method==="PATCH"||method==="DELETE")){
      if(!user)return json({error:"Войдите в аккаунт"},401);
      const messageId=path.slice(messageIdPrefix.length);
      if(messageId.includes("/"))return json({error:"Неверный ID сообщения"},400);
      const message=await db.prepare("SELECT id,sender_user_id FROM direct_messages WHERE id=?").bind(messageId).first();
      if(!message)return json({error:"Сообщение не найдено"},404);
      if(message.sender_user_id!==user.id)return json({error:"Можно изменять или удалять только свои сообщения"},403);
      if(method==="PATCH"){const updated=String(body.body||"").trim();if(!updated||updated.length>2000)return json({error:"Сообщение должно содержать от 1 до 2000 символов"},400);await db.prepare("UPDATE direct_messages SET body=?,edited_at=? WHERE id=? AND sender_user_id=?").bind(updated,new Date().toISOString(),messageId,user.id).run();return json({ok:true});}
      await db.prepare("DELETE FROM direct_messages WHERE id=? AND sender_user_id=?").bind(messageId,user.id).run();return json({ok:true});
    }

    if (path === "/api/notifications" && method === "GET") {
      if (!user) return json({ error: "Войдите, чтобы смотреть уведомления" }, 401);
      const rows = await db.prepare("SELECT n.id,n.type,n.actor_username,n.review_id,n.created_at,n.read_at,rv.title,rv.release_title,rv.artist FROM notifications n LEFT JOIN reviews rv ON rv.id=n.review_id WHERE n.recipient_user_id=? ORDER BY n.created_at DESC LIMIT 100").bind(user.id).all();
      const unread = await db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id=? AND read_at IS NULL").bind(user.id).first();
      return json({ notifications: rows.results || [], unread_count: unread?.count || 0 });
    }
    const notificationReadMatch = path.match(/^\/api\/notifications\/([a-f0-9-]+)\/read$/i);
    if (notificationReadMatch && method === "PATCH") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      await db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_user_id=?").bind(new Date().toISOString(),notificationReadMatch[1],user.id).run();
      return json({ ok: true });
    }
    if (path === "/api/notifications/read-all" && method === "PATCH") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      await db.prepare("UPDATE notifications SET read_at=? WHERE recipient_user_id=? AND read_at IS NULL").bind(new Date().toISOString(),user.id).run();
      return json({ ok: true });
    }
    const reviewLikeMatch = path.match(/^\/api\/reviews\/([a-f0-9-]+)\/like$/i);
    if (reviewLikeMatch && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы лайкать рецензии" }, 401);
      const exists = await db.prepare("SELECT id FROM reviews WHERE id=?").bind(reviewLikeMatch[1]).first();
      if (!exists) return json({ error: "Рецензия не найдена" }, 404);
      const reviewOwner = await db.prepare("SELECT user_id FROM reviews WHERE id=?").bind(reviewLikeMatch[1]).first();
      const liked = await db.prepare("INSERT OR IGNORE INTO review_likes (user_id,review_id,created_at) VALUES (?,?,?)").bind(user.id,reviewLikeMatch[1],new Date().toISOString()).run();
      if (liked.meta?.changes && reviewOwner?.user_id !== user.id) await db.prepare("INSERT INTO notifications (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),reviewOwner.user_id,user.id,user.username,"like",reviewLikeMatch[1],new Date().toISOString()).run();
      return json({ ok: true });
    }
    if (reviewLikeMatch && method === "DELETE") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      await db.prepare("DELETE FROM review_likes WHERE user_id=? AND review_id=?").bind(user.id,reviewLikeMatch[1]).run();
      return json({ ok: true });
    }

    if (path === "/api/reports" && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы отправить жалобу" }, 401);
      const targetType = String(body.targetType || "");
      const targetId = String(body.targetId || "");
      const reason = String(body.reason || "").trim();
      if (!["review","comment"].includes(targetType) || !targetId || !reason || reason.length > 1000) return json({ error: "Укажи причину жалобы (до 1000 символов)" }, 400);
      const target = targetType === "review" ? await db.prepare("SELECT user_id FROM reviews WHERE id=?").bind(targetId).first() : await db.prepare("SELECT user_id FROM review_comments WHERE id=?").bind(targetId).first();
      if (!target) return json({ error: "Материал не найден" }, 404);
      if (target.user_id === user.id) return json({ error: "Нельзя пожаловаться на собственный материал" }, 400);
      try {
        const id = crypto.randomUUID();
        await db.prepare("INSERT INTO content_reports (id,reporter_user_id,target_type,target_id,reason,status,created_at) VALUES (?,?,?,?,?,'pending',?)").bind(id,user.id,targetType,targetId,reason,new Date().toISOString()).run();
        return json({ ok: true, id }, 201);
      } catch (error) {
        if (String(error?.message || error).toLowerCase().includes("unique")) return json({ error: "Ты уже отправлял жалобу на этот материал" }, 409);
        throw error;
      }
    }
    if (path === "/api/admin/reports" && method === "GET") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const rows = await db.prepare("SELECT cr.id,cr.target_type,cr.target_id,cr.reason,cr.status,cr.created_at,u.username AS reporter,CASE WHEN cr.target_type='review' THEN rv.username ELSE cm.username END AS target_author,CASE WHEN cr.target_type='review' THEN rv.release_title || ' — ' || rv.artist ELSE 'Комментарий к рецензии' END AS target_label,CASE WHEN cr.target_type='review' THEN rv.body ELSE cm.body END AS target_body FROM content_reports cr JOIN users u ON u.id=cr.reporter_user_id LEFT JOIN reviews rv ON cr.target_type='review' AND rv.id=cr.target_id LEFT JOIN review_comments cm ON cr.target_type='comment' AND cm.id=cr.target_id WHERE cr.status='pending' ORDER BY cr.created_at DESC").all();
      return json({ reports: rows.results || [] });
    }
    const reportStatusMatch = path.match(/^\/api\/admin\/reports\/([a-f0-9-]+)$/i);
    if (reportStatusMatch && method === "PATCH") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const status = String(body.status || "");
      if (!["resolved","dismissed","pending"].includes(status)) return json({ error: "Некорректный статус жалобы" }, 400);
      const result = await db.prepare("UPDATE content_reports SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?").bind(status,status === "pending" ? null : new Date().toISOString(),status === "pending" ? null : user.id,reportStatusMatch[1]).run();
      if (!result.meta || result.meta.changes === 0) return json({ error: "Жалоба не найдена" }, 404);
      return json({ ok: true });
    }

    const reviewCommentsMatch = path.match(/^\/api\/reviews\/([a-f0-9-]+)\/comments$/i);
    if (reviewCommentsMatch && method === "GET") {
      const reviewExists = await db.prepare("SELECT id FROM reviews WHERE id=?").bind(reviewCommentsMatch[1]).first();
      if (!reviewExists) return json({ error: "Рецензия не найдена" }, 404);
      const rows = await db.prepare("SELECT c.id,c.parent_comment_id,c.username,c.body,c.created_at,u.avatar,CASE WHEN (? IS NOT NULL AND c.user_id=?) OR ?=1 THEN 1 ELSE 0 END AS can_delete,CASE WHEN ?=1 THEN 1 ELSE 0 END AS can_admin_delete FROM review_comments c JOIN users u ON u.id=c.user_id WHERE c.review_id=? ORDER BY c.created_at ASC")
        .bind(user?.id || null,user?.id || null,isAdmin(user)?1:0,isAdmin(user)?1:0,reviewCommentsMatch[1]).all();
      return json({ comments: rows.results || [] });
    }
    if (reviewCommentsMatch && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы комментировать" }, 401);
      const bodyText = String(body.body || "").trim();
      const reviewExists = await db.prepare("SELECT id FROM reviews WHERE id=?").bind(reviewCommentsMatch[1]).first();
      if (!reviewExists) return json({ error: "Рецензия не найдена" }, 404);
      if (!bodyText || bodyText.length > 1000) return json({ error: "Комментарий должен содержать от 1 до 1000 символов" }, 400);
      const parentId = body.parentCommentId ? String(body.parentCommentId) : null;
      let parentComment = null;
      if (parentId) {
        parentComment = await db.prepare("SELECT id,user_id FROM review_comments WHERE id=? AND review_id=?").bind(parentId,reviewCommentsMatch[1]).first();
        if (!parentComment) return json({ error: "Комментарий для ответа не найден" }, 404);
      }
      const id = crypto.randomUUID();
      const reviewOwner = await db.prepare("SELECT user_id FROM reviews WHERE id=?").bind(reviewCommentsMatch[1]).first();
      await db.prepare("INSERT INTO review_comments (id,review_id,user_id,username,body,created_at,parent_comment_id) VALUES (?,?,?,?,?,?,?)")
        .bind(id,reviewCommentsMatch[1],user.id,user.username,bodyText,new Date().toISOString(),parentId).run();
      if (parentId) {
        if (parentComment?.user_id && parentComment.user_id !== user.id) await db.prepare("INSERT INTO notifications (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),parentComment.user_id,user.id,user.username,"reply",reviewCommentsMatch[1],new Date().toISOString()).run();
      } else if (reviewOwner?.user_id !== user.id) {
        await db.prepare("INSERT INTO notifications (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),reviewOwner.user_id,user.id,user.username,"comment",reviewCommentsMatch[1],new Date().toISOString()).run();
      }
      return json({ ok: true, id }, 201);
    }
    const commentDeleteMatch = path.match(/^\/api\/reviews\/([a-f0-9-]+)\/comments\/([a-f0-9-]+)$/i);
    if (commentDeleteMatch && method === "DELETE") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      const result = await db.prepare("DELETE FROM review_comments WHERE id=? AND review_id=? AND (user_id=? OR ?=1)")
        .bind(commentDeleteMatch[2],commentDeleteMatch[1],user.id,isAdmin(user)?1:0).run();
      if (!result.meta || result.meta.changes === 0) return json({ error: "Комментарий не найден или у вас нет прав на удаление" }, 404);
      return json({ ok: true });
    }

    if (path === "/api/reviews" && method === "GET") {
      const reviews = await db.prepare(`
        SELECT rv.id, rv.release_id, rv.username, u.avatar, rv.release_title AS release, rv.artist, rv.score, rv.title, rv.pros, rv.cons, rv.body, rv.created_at, rv.sound, rv.composition, rv.lyrics, rv.originality, rv.atmosphere,
          (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id=rv.id) AS likes_count,
          (SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id=rv.id) AS comments_count,
          CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM review_likes rl WHERE rl.review_id=rv.id AND rl.user_id=?) THEN 1 ELSE 0 END AS liked_by_me,
          CASE WHEN ? IS NOT NULL AND rv.user_id=? THEN 1 ELSE 0 END AS can_edit, CASE WHEN rv.id=(SELECT pinned_review_id FROM users WHERE id=rv.user_id) THEN 1 ELSE 0 END AS is_pinned
        FROM reviews rv JOIN users u ON u.id=rv.user_id ORDER BY rv.created_at DESC
      `).bind(user?.id || null,user?.id || null,user?.id || null,user?.id || null).all();
      return json({ reviews: reviews.results || [] });
    }

    if (path === "/api/users/search" && method === "GET") {
      const query = String(url.searchParams.get("q") || "").trim().slice(0,24);
      if (query.length < 2) return json({ users: [] });
      const rows = await db.prepare("SELECT u.username,u.avatar,(SELECT COUNT(*) FROM reviews rv WHERE rv.user_id=u.id) AS reviews_count FROM users u WHERE u.username LIKE ? COLLATE NOCASE ORDER BY u.username LIMIT 15")
        .bind("%" + query + "%").all();
      return json({ users: rows.results || [] });
    }

    if (path === "/api/me/pinned-review" && method === "PATCH") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      const reviewId = body.reviewId ? String(body.reviewId) : null;
      if (reviewId) {
        const owned = await db.prepare("SELECT id FROM reviews WHERE id=? AND user_id=?").bind(reviewId,user.id).first();
        if (!owned) return json({ error: "Можно закрепить только свою рецензию" }, 403);
      }
      await db.prepare("UPDATE users SET pinned_review_id=? WHERE id=?").bind(reviewId,user.id).run();
      return json({ ok: true, pinned_review_id: reviewId });
    }
    const followMatch = path.match(/^\/api\/users\/([^/]+)\/follow$/);
    if (followMatch && (method === "POST" || method === "DELETE")) {
      if (!user) return json({ error: "Войдите, чтобы подписываться" }, 401);
      const target = await db.prepare("SELECT id,username FROM users WHERE username=? COLLATE NOCASE").bind(decodeURIComponent(followMatch[1])).first();
      if (!target) return json({ error: "Пользователь не найден" }, 404);
      if (target.id === user.id) return json({ error: "Нельзя подписаться на самого себя" }, 400);
      if (method === "POST") {
        const followed = await db.prepare("INSERT OR IGNORE INTO user_follows (follower_user_id,followed_user_id,created_at) VALUES (?,?,?)").bind(user.id,target.id,new Date().toISOString()).run();
        if (followed.meta?.changes) {
          await db.prepare("INSERT INTO notifications (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at) VALUES (?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(),target.id,user.id,user.username,"follow",null,new Date().toISOString()).run();
        }
      } else await db.prepare("DELETE FROM user_follows WHERE follower_user_id=? AND followed_user_id=?").bind(user.id,target.id).run();
      return json({ ok: true, following: method === "POST" });
    }
    if(path==="/api/following/activity"&&method==="GET"){
      if(!user)return json({error:"Войди, чтобы смотреть ленту активности"},401);
      const rows=await db.prepare(`
        SELECT * FROM (
          SELECT 'review' AS type,rv.id AS event_id,rv.user_id AS actor_id,rv.username AS actor_username,u.avatar AS avatar,rv.created_at,rv.id AS review_id,rv.title AS title,rv.release_title AS release_title,rv.artist AS artist,substr(rv.body,1,180) AS excerpt
          FROM reviews rv JOIN users u ON u.id=rv.user_id JOIN user_follows uf ON uf.followed_user_id=rv.user_id
          WHERE uf.follower_user_id=?
          UNION ALL
          SELECT 'comment' AS type,rc.id AS event_id,rc.user_id AS actor_id,rc.username AS actor_username,u.avatar AS avatar,rc.created_at,rv.id AS review_id,rv.title AS title,rv.release_title AS release_title,rv.artist AS artist,substr(rc.body,1,180) AS excerpt
          FROM review_comments rc JOIN users u ON u.id=rc.user_id JOIN reviews rv ON rv.id=rc.review_id JOIN user_follows uf ON uf.followed_user_id=rc.user_id
          WHERE uf.follower_user_id=?
          UNION ALL
          SELECT 'like' AS type,CAST(rl.rowid AS TEXT) AS event_id,rl.user_id AS actor_id,u.username AS actor_username,u.avatar AS avatar,rl.created_at,rv.id AS review_id,rv.title AS title,rv.release_title AS release_title,rv.artist AS artist,'' AS excerpt
          FROM review_likes rl JOIN users u ON u.id=rl.user_id JOIN reviews rv ON rv.id=rl.review_id JOIN user_follows uf ON uf.followed_user_id=rl.user_id
          WHERE uf.follower_user_id=?
        ) ORDER BY created_at DESC LIMIT 100
      `).bind(user.id,user.id,user.id).all();
      return json({activities:rows.results||[]});
    }
    if (path === "/api/following/reviews" && method === "GET") {
      if (!user) return json({ error: "Войдите, чтобы смотреть подписки" }, 401);
      const rows = await db.prepare("SELECT rv.id,rv.release_id,rv.username,u.avatar,rv.release_title AS release,rv.artist,rv.score,rv.title,rv.pros,rv.cons,rv.body,rv.created_at,rv.sound,rv.composition,rv.lyrics,rv.originality,rv.atmosphere,(SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id=rv.id) AS likes_count,(SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id=rv.id) AS comments_count,CASE WHEN EXISTS(SELECT 1 FROM review_likes rl WHERE rl.review_id=rv.id AND rl.user_id=?) THEN 1 ELSE 0 END AS liked_by_me,0 AS can_edit FROM reviews rv JOIN users u ON u.id=rv.user_id JOIN user_follows uf ON uf.followed_user_id=rv.user_id WHERE uf.follower_user_id=? ORDER BY rv.created_at DESC LIMIT 100").bind(user.id,user.id).all();
      return json({ reviews: rows.results || [] });
    }
    const profileMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (profileMatch && method === "GET") {
      const username = decodeURIComponent(profileMatch[1]);
      const profile = await db.prepare("SELECT id,username,created_at,avatar,pinned_review_id FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
      if (!profile) return json({ error: "Пользователь не найден" }, 404);
      const stats = await db.prepare("SELECT (SELECT COUNT(*) FROM reviews WHERE user_id=?) AS reviews_count,(SELECT COUNT(*) FROM ratings WHERE user_id=?) AS ratings_count,(SELECT ROUND(AVG(score),1) FROM ratings WHERE user_id=?) AS average_score").bind(profile.id,profile.id,profile.id).first();
      const items = await db.prepare("SELECT id,release_id,username,release_title AS release,artist,score,title,pros,cons,body,created_at,sound,composition,lyrics,originality,atmosphere,(SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id=reviews.id) AS likes_count,(SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id=reviews.id) AS comments_count, CASE WHEN ? IS NOT NULL AND reviews.user_id=? THEN 1 ELSE 0 END AS can_edit, CASE WHEN id=? THEN 1 ELSE 0 END AS is_pinned FROM reviews WHERE user_id=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,created_at DESC").bind(user?.id || null,user?.id || null,profile.pinned_review_id || "",profile.id,profile.pinned_review_id || "").all();
      const social = await db.prepare("SELECT (SELECT COUNT(*) FROM user_follows WHERE followed_user_id=?) AS followers_count,(SELECT COUNT(*) FROM user_follows WHERE follower_user_id=?) AS following_count,CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM user_follows WHERE follower_user_id=? AND followed_user_id=?) THEN 1 ELSE 0 END AS is_following").bind(profile.id,profile.id,user?.id || null,user?.id || null,profile.id).first();
      const favoriteGenre = await db.prepare("SELECT r.genre,COUNT(*) AS amount FROM ratings rt JOIN releases r ON r.id=rt.release_id WHERE rt.user_id=? AND COALESCE(r.genre,'')<>'' GROUP BY r.genre ORDER BY amount DESC,r.genre LIMIT 1").bind(profile.id).first();
      const listened = await db.prepare("SELECT COUNT(DISTINCT release_id) AS count FROM ratings WHERE user_id=?").bind(profile.id).first();
      const activity = await db.prepare("SELECT (SELECT COUNT(*) FROM review_comments WHERE user_id=?) AS comments_count,(SELECT COUNT(*) FROM review_likes rl JOIN reviews rv ON rv.id=rl.review_id WHERE rv.user_id=?) AS likes_received").bind(profile.id,profile.id).first();
      const xp = (Number(stats.ratings_count)||0)*10 + (Number(stats.reviews_count)||0)*25 + (Number(activity?.comments_count)||0)*2 + (Number(activity?.likes_received)||0)*5;
      const level = Math.floor(xp/100)+1;
      const achievements = [
        {id:"first_rating",title:"Первый вердикт",description:"Поставить первую оценку",icon:"★",earned:Number(stats.ratings_count)>=1},
        {id:"first_review",title:"Голос критика",description:"Опубликовать первую рецензию",icon:"✎",earned:Number(stats.reviews_count)>=1},
        {id:"critic_5",title:"Постоянный критик",description:"Написать 5 рецензий",icon:"✦",earned:Number(stats.reviews_count)>=5},
        {id:"collector_10",title:"Меломан",description:"Оценить 10 релизов",icon:"♫",earned:Number(stats.ratings_count)>=10},
        {id:"commenter_10",title:"В центре беседы",description:"Оставить 10 комментариев",icon:"☷",earned:Number(activity?.comments_count)>=10},
        {id:"popular_10",title:"Признание",description:"Получить 10 лайков на рецензии",icon:"♥",earned:Number(activity?.likes_received)>=10},
        {id:"social_5",title:"Свои люди",description:"Собрать 5 подписчиков",icon:"＋",earned:Number(social?.followers_count)>=5}
      ];
      return json({ profile: { username: profile.username, created_at: profile.created_at, avatar: profile.avatar || null, pinned_review_id: profile.pinned_review_id || null, reviews_count: stats.reviews_count || 0, ratings_count: stats.ratings_count || 0, average_score: stats.average_score, favorite_genre: favoriteGenre?.genre || null, listened_count: listened?.count || 0, followers_count: social?.followers_count || 0, following_count: social?.following_count || 0, is_following: !!social?.is_following, xp, level, xp_to_next_level: level*100-xp, achievements, reviews: items.results || [] } });
    }


    if (path === "/api/submissions" && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы предложить релиз" }, 401);
      const title = String(body.title || "").trim(), artist = String(body.artist || "").trim();
      const type = String(body.type || "").trim(), year = Number(body.year);
      const genre = String(body.genre || "").trim(), coverUrl = String(body.cover_url || "").trim();
      const description = String(body.description || "").trim(), listeningUrl = String(body.listening_url || "").trim();
      if (!title || title.length > 100 || !artist || artist.length > 250 ||
          !["Альбом","Сингл"].includes(type) || !Number.isInteger(year) || year < 1900 || year > 2100 ||
          genre.length > 50 || description.length > 2000 ||
          (coverUrl && !/^https:\/\/[^\s"'<>]+$/i.test(coverUrl)) || (listeningUrl && !/^https:\/\//i.test(listeningUrl)))
        return json({ error: "Проверь поля. Ссылки должны начинаться с https://" }, 400);
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO release_submissions
        (id,submitter_user_id,title,artist,type,year,genre,cover_url,description,listening_url,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?)`)
        .bind(id,user.id,title,artist,type,year,genre,coverUrl,description,listeningUrl,new Date().toISOString()).run();
      return json({ ok: true, id }, 201);
    }
    if (path === "/api/submissions/mine" && method === "GET") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      const rows = await db.prepare("SELECT id,title,artist,type,year,genre,status,created_at,rejection_reason FROM release_submissions WHERE submitter_user_id = ? ORDER BY created_at DESC").bind(user.id).all();
      return json({ submissions: rows.results || [] });
    }
    if (path === "/api/admin/ratings" && method === "GET") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const rows = await db.prepare("SELECT rt.user_id,rt.release_id,rt.score,rt.sound,rt.composition,rt.lyrics,rt.originality,rt.atmosphere,u.username,r.title AS release_title,r.artist FROM ratings rt JOIN users u ON u.id=rt.user_id JOIN releases r ON r.id=rt.release_id ORDER BY rt.rowid DESC").all();
      return json({ ratings: rows.results || [] });
    }
    const adminRatingDeleteMatch = path.match(/^\/api\/admin\/ratings\/([^/]+)\/(\d+)$/);
    if (adminRatingDeleteMatch && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const result = await db.prepare("DELETE FROM ratings WHERE user_id=? AND release_id=?").bind(decodeURIComponent(adminRatingDeleteMatch[1]),Number(adminRatingDeleteMatch[2])).run();
      if (!result.meta || result.meta.changes === 0) return json({ error: "Оценка не найдена" }, 404);
      return json({ ok: true });
    }

    if (path === "/api/admin/users" && method === "GET") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const rows = await db.prepare(`
        SELECT u.id,u.username,u.created_at,
          (SELECT COUNT(*) FROM reviews rv WHERE rv.user_id=u.id) AS reviews_count,
          (SELECT COUNT(*) FROM ratings rt WHERE rt.user_id=u.id) AS ratings_count
        FROM users u ORDER BY u.created_at DESC
      `).all();
      return json({ users: rows.results || [] });
    }

    const deleteUserMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (deleteUserMatch && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const targetId = decodeURIComponent(deleteUserMatch[1]);
      const target = await db.prepare("SELECT id,username FROM users WHERE id=?").bind(targetId).first();
      if (!target) return json({ error: "Пользователь не найден" }, 404);
      if (target.username.toLowerCase() === "towhell" || target.id === user.id)
        return json({ error: "Нельзя удалить аккаунт администратора" }, 403);
      await db.batch([
        db.prepare("DELETE FROM review_comments WHERE review_id IN (SELECT id FROM reviews WHERE user_id=?)").bind(targetId),
        db.prepare("DELETE FROM review_comments WHERE user_id=?").bind(targetId),
        db.prepare("DELETE FROM review_likes WHERE review_id IN (SELECT id FROM reviews WHERE user_id=?)").bind(targetId),
        db.prepare("DELETE FROM review_likes WHERE user_id=?").bind(targetId),
        db.prepare("DELETE FROM reviews WHERE user_id=?").bind(targetId),
        db.prepare("DELETE FROM ratings WHERE user_id=?").bind(targetId),
        db.prepare("DELETE FROM favorites WHERE user_id=?").bind(targetId),
        db.prepare("DELETE FROM release_submissions WHERE submitter_user_id=?").bind(targetId),
        db.prepare("DELETE FROM users WHERE id=?").bind(targetId)
      ]);
      return json({ ok: true, username: target.username });
    }

    if (path === "/api/admin/submissions" && method === "GET") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const rows = await db.prepare("SELECT s.*, u.username AS submitter FROM release_submissions s JOIN users u ON u.id=s.submitter_user_id WHERE s.status='pending' ORDER BY s.created_at ASC").all();
      return json({ submissions: rows.results || [] });
    }
    const reviewSubmissionMatch = path.match(/^\/api\/admin\/submissions\/([a-f0-9-]+)\/(approve|reject)$/i);
    if (reviewSubmissionMatch && method === "POST") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const submissionId = reviewSubmissionMatch[1], action = reviewSubmissionMatch[2].toLowerCase();
      const submission = await db.prepare("SELECT * FROM release_submissions WHERE id=? AND status='pending'").bind(submissionId).first();
      if (!submission) return json({ error: "Заявка не найдена или уже рассмотрена" }, 404);
      if (action === "reject") {
        await db.prepare("UPDATE release_submissions SET status='rejected',reviewed_at=?,reviewed_by=?,rejection_reason=? WHERE id=?")
          .bind(new Date().toISOString(),user.id,String(body.reason || "").trim().slice(0,500),submissionId).run();
        return json({ ok: true });
      }
      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS id FROM releases").first();
      const art = (submission.artist || submission.title).slice(0,1).toUpperCase();
      await db.batch([
        db.prepare("INSERT INTO releases (id,title,artist,type,year,tag,genre,art,cover,description,score,listening_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(next.id,submission.title,submission.artist,submission.type,submission.year,submission.genre || "COMMUNITY",submission.genre || "COMMUNITY",art,
            submission.cover_url || "linear-gradient(135deg,#d4fa45,#53652a)",submission.description,0,submission.listening_url || ""),
        db.prepare("UPDATE release_submissions SET status='approved',reviewed_at=?,reviewed_by=? WHERE id=?")
          .bind(new Date().toISOString(),user.id,submissionId)
      ]);
      return json({ ok: true, release_id: next.id });
    }

    const updateReleaseGenreMatch = path.match(/^\/api\/admin\/releases\/(\d+)\/genre$/);
    if (updateReleaseGenreMatch && method === "PATCH") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const releaseId = Number(updateReleaseGenreMatch[1]);
      const genre = String(body.genre || "").trim();
      if (genre.length > 60) return json({ error: "Жанр не должен превышать 60 символов" }, 400);
      const result = await db.prepare("UPDATE releases SET genre=? WHERE id=?").bind(genre,releaseId).run();
      if (!result.meta?.changes) return json({ error: "Релиз не найден" }, 404);
      return json({ ok: true });
    }

    const updateReleaseDetailsMatch = path.match(/^\/api\/admin\/releases\/(\d+)\/details$/);
    if (updateReleaseDetailsMatch && method === "PATCH") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const releaseId = Number(updateReleaseDetailsMatch[1]);
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim();
      if (!title || title.length > 100 || description.length > 2000)
        return json({ error: "Название должно содержать 1–100 символов, описание — не более 2000" }, 400);
      const release = await db.prepare("SELECT id FROM releases WHERE id=?").bind(releaseId).first();
      if (!release) return json({ error: "Релиз не найден" }, 404);
      await db.batch([
        db.prepare("UPDATE releases SET title=?,description=? WHERE id=?").bind(title,description,releaseId),
        db.prepare("UPDATE reviews SET release_title=? WHERE release_id=?").bind(title,releaseId)
      ]);
      return json({ ok: true });
    }

    const updateListeningMatch = path.match(/^\/api\/admin\/releases\/(\d+)\/listening$/);
    if (updateListeningMatch && method === "PATCH") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const listeningUrl = String(body.listening_url || "").trim();
      if (listeningUrl && (!/^https:\/\/[^\s"'<>]+$/i.test(listeningUrl) || listeningUrl.length > 2000)) return json({ error: "Вставь корректную HTTPS-ссылку на прослушивание" }, 400);
      const result = await db.prepare("UPDATE releases SET listening_url=? WHERE id=?").bind(listeningUrl, Number(updateListeningMatch[1])).run();
      if (!result.meta || result.meta.changes === 0) return json({ error: "Релиз не найден" }, 404);
      return json({ ok: true });
    }

    const updateCoverMatch = path.match(/^\/api\/admin\/releases\/(\d+)\/cover$/);
    if (updateCoverMatch && method === "PATCH") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const coverUrl = String(body.cover_url || "").trim();
      if (!/^https:\/\/[^\s"'<>]+$/i.test(coverUrl) || coverUrl.length > 2000)
        return json({ error: "Вставь прямую HTTPS-ссылку на изображение" }, 400);
      const result = await db.prepare("UPDATE releases SET cover=? WHERE id=?").bind(coverUrl, Number(updateCoverMatch[1])).run();
      if (!result.meta || result.meta.changes === 0) return json({ error: "Релиз не найден" }, 404);
      return json({ ok: true });
    }

    const deleteReleaseMatch = path.match(/^\/api\/admin\/releases\/(\d+)$/);
    if (deleteReleaseMatch && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const releaseId = Number(deleteReleaseMatch[1]);
      const release = await db.prepare("SELECT title,artist FROM releases WHERE id=?").bind(releaseId).first();
      if (!release) return json({ error: "Релиз не найден" }, 404);
      await db.batch([
        db.prepare("DELETE FROM ratings WHERE release_id=?").bind(releaseId),
        db.prepare("DELETE FROM favorites WHERE release_id=?").bind(releaseId),
        db.prepare("DELETE FROM review_comments WHERE review_id IN (SELECT id FROM reviews WHERE release_title=? AND artist=?)").bind(release.title,release.artist),
        db.prepare("DELETE FROM reviews WHERE release_title=? AND artist=?").bind(release.title,release.artist),
        db.prepare("DELETE FROM releases WHERE id=?").bind(releaseId)
      ]);
      return json({ ok: true });
    }
    const deleteReviewMatch = path.match(/^\/api\/admin\/reviews\/([a-f0-9-]+)$/i);
    if (deleteReviewMatch && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      await db.batch([
        db.prepare("DELETE FROM review_comments WHERE review_id=?").bind(deleteReviewMatch[1]),
        db.prepare("DELETE FROM review_likes WHERE review_id=?").bind(deleteReviewMatch[1])
      ]);
      const reviewToDelete = await db.prepare("SELECT user_id,release_id FROM reviews WHERE id=?").bind(deleteReviewMatch[1]).first();
      if (!reviewToDelete) return json({ error: "Рецензия не найдена" }, 404);
      await db.prepare("DELETE FROM reviews WHERE id=?").bind(deleteReviewMatch[1]).run();
      if (reviewToDelete.release_id !== null && reviewToDelete.release_id !== undefined) {
        const other = await db.prepare("SELECT 1 AS found FROM reviews WHERE user_id=? AND release_id=? LIMIT 1").bind(reviewToDelete.user_id,reviewToDelete.release_id).first();
        if (!other) await db.prepare("DELETE FROM ratings WHERE user_id=? AND release_id=?").bind(reviewToDelete.user_id,reviewToDelete.release_id).run();
      }
      return json({ ok: true });
    }

    const ratingMatch = path.match(/^\/api\/releases\/(\d+)\/rating$/);
    if (ratingMatch && (method === "POST" || method === "PATCH" || method === "DELETE")) {
      if (!user) return json({ error: "Войдите, чтобы оценивать" }, 401);
      const releaseId = Number(ratingMatch[1]);
      if (method === "DELETE") {
        const linkedReview = await db.prepare("SELECT id FROM reviews WHERE user_id=? AND release_id=? LIMIT 1").bind(user.id,releaseId).first();
        if (linkedReview) return json({ error: "Сначала удали свою рецензию: её оценка связана с этим релизом." }, 409);
        const removed = await db.prepare("DELETE FROM ratings WHERE user_id=? AND release_id=?").bind(user.id,releaseId).run();
        if (!removed.meta || removed.meta.changes === 0) return json({ error: "Оценка не найдена" }, 404);
        return json({ ok: true });
      }
      const criteria = ["sound","composition","lyrics","originality","atmosphere"].map(k => Number(body[k]));
      if (criteria.some(v => !Number.isInteger(v) || v < 0 || v > 10)) return json({ error: "Каждый критерий должен быть от 0 до 10" }, 400);
      const score = (criteria[0]+criteria[1]+criteria[2]+criteria[3])*(1+criteria[4]*0.125);
      const release = await db.prepare("SELECT id FROM releases WHERE id = ?").bind(releaseId).first();
      if (!release) return json({ error: "Релиз не найден" }, 404);
      const existingRating = await db.prepare("SELECT 1 AS found FROM ratings WHERE user_id=? AND release_id=?").bind(user.id,releaseId).first();
      const existingReview = await db.prepare("SELECT 1 AS found FROM reviews WHERE user_id=? AND release_id=? LIMIT 1").bind(user.id,releaseId).first();
      if (method === "POST") {
        if (existingRating || existingReview) return json({ error: "Ты уже оценил этот релиз в оценке или рецензии. Измени существующую оценку." }, 409);
        await db.prepare("INSERT INTO ratings (user_id,release_id,score,sound,composition,lyrics,originality,atmosphere) VALUES (?,?,?,?,?,?,?,?)")
          .bind(user.id, releaseId, score, ...criteria).run();
      } else {
        if (!existingRating) return json({ error: "Сначала поставь оценку этому релизу." }, 404);
        await db.prepare("UPDATE ratings SET score=?,sound=?,composition=?,lyrics=?,originality=?,atmosphere=? WHERE user_id=? AND release_id=?")
          .bind(score,...criteria,user.id,releaseId).run();
      }
      return json({ ok: true });
    }

    const editReviewRatingMatch = path.match(/^\/api\/reviews\/([a-f0-9-]+)\/rating$/i);
    if (editReviewRatingMatch && method === "PATCH") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      const reviewId = editReviewRatingMatch[1];
      const reviewRow = await db.prepare("SELECT release_id FROM reviews WHERE id=? AND user_id=?").bind(reviewId,user.id).first();
      if (!reviewRow) return json({ error: "Рецензия не найдена или принадлежит другому пользователю" }, 404);
      if (reviewRow.release_id === null || reviewRow.release_id === undefined) return json({ error: "У этой рецензии нет связанного релиза" }, 400);
      const criteria = ["sound","composition","lyrics","originality","atmosphere"].map(k => Number(body[k]));
      if (criteria.some(v => !Number.isInteger(v) || v < 0 || v > 10)) return json({ error: "Каждый критерий должен быть от 0 до 10" }, 400);
      const score = (criteria[0]+criteria[1]+criteria[2]+criteria[3])*(1+criteria[4]*0.125);
      await db.batch([
        db.prepare("UPDATE reviews SET score=?,sound=?,composition=?,lyrics=?,originality=?,atmosphere=? WHERE id=? AND user_id=?").bind(score,...criteria,reviewId,user.id),
        db.prepare("UPDATE ratings SET score=?,sound=?,composition=?,lyrics=?,originality=?,atmosphere=? WHERE user_id=? AND release_id=?").bind(score,...criteria,user.id,reviewRow.release_id)
      ]);
      return json({ ok: true, score });
    }

    const editReviewMatch = path.match(/^\/api\/reviews\/([a-f0-9-]+)$/i);
    if (editReviewMatch && method === "DELETE") {
      if (!user) return json({ error: "Войдите в аккаунт" }, 401);
      const existing = await db.prepare("SELECT release_id FROM reviews WHERE id=? AND user_id=?").bind(editReviewMatch[1],user.id).first();
      if (!existing) return json({ error: "Рецензия не найдена или принадлежит другому пользователю" }, 404);
      await db.batch([
        db.prepare("DELETE FROM review_comments WHERE review_id=?").bind(editReviewMatch[1]),
        db.prepare("DELETE FROM review_likes WHERE review_id=?").bind(editReviewMatch[1]),
        db.prepare("DELETE FROM reviews WHERE id=? AND user_id=?").bind(editReviewMatch[1],user.id)
      ]);
      if (existing.release_id !== null && existing.release_id !== undefined) {
        const other = await db.prepare("SELECT 1 AS found FROM reviews WHERE user_id=? AND release_id=? LIMIT 1").bind(user.id,existing.release_id).first();
        if (!other) await db.prepare("DELETE FROM ratings WHERE user_id=? AND release_id=?").bind(user.id,existing.release_id).run();
      }
      return json({ ok: true });
    }
    if (editReviewMatch && method === "PATCH") {
      if (!user) return json({ error: "Войдите, чтобы дополнять рецензии" }, 401);
      const addition = String(body.addition || "").trim();
      if (!addition || addition.length > 5000) return json({ error: "Дополнение должно содержать от 1 до 5000 символов" }, 400);
      const existing = await db.prepare("SELECT body FROM reviews WHERE id=? AND user_id=?").bind(editReviewMatch[1],user.id).first();
      if (!existing) return json({ error: "Рецензия не найдена или принадлежит другому пользователю" }, 404);
      const combined = String(existing.body || "") + "\n\nДополнение:\n" + addition;
      if (combined.length > 10000) return json({ error: "Общий текст рецензии не должен превышать 10000 символов" }, 400);
      await db.prepare("UPDATE reviews SET body=? WHERE id=? AND user_id=?").bind(combined,editReviewMatch[1],user.id).run();
      return json({ ok: true });
    }

    if (path === "/api/reviews" && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы писать рецензии" }, 401);
      const releaseId = Number(body.releaseId);
      const criteria = ["sound","composition","lyrics","originality","atmosphere"].map(k => Number(body[k]));
      const score = (criteria[0]+criteria[1]+criteria[2]+criteria[3])*(1+criteria[4]*0.125);
      const title = String(body.title || "").trim().slice(0,100);
      const pros = String(body.pros || "").trim().slice(0,1000);
      const cons = String(body.cons || "").trim().slice(0,1000);
      const text = String(body.body || "").trim();
      const release = await db.prepare("SELECT title,artist FROM releases WHERE id = ?").bind(releaseId).first();
      if (!release || criteria.some(v => !Number.isInteger(v) || v < 0 || v > 10) || !title || text.length < 50 || text.length > 5000)
        return json({ error: "Проверь релиз, заголовок, пять оценок от 0 до 10 и длину текста (50–5000)" }, 400);
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const existingRating = await db.prepare("SELECT 1 AS found FROM ratings WHERE user_id=? AND release_id=?").bind(user.id,releaseId).first();
      await db.prepare("INSERT INTO reviews (id,user_id,release_id,username,release_title,artist,score,body,created_at,title,pros,cons,sound,composition,lyrics,originality,atmosphere) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, user.id, releaseId, user.username, release.title, release.artist, score, text, createdAt, title, pros, cons, ...criteria).run();
      if (existingRating) {
        await db.prepare("UPDATE ratings SET score=?,sound=?,composition=?,lyrics=?,originality=?,atmosphere=? WHERE user_id=? AND release_id=?")
          .bind(score,...criteria,user.id,releaseId).run();
      } else {
        await db.prepare("INSERT INTO ratings (user_id,release_id,score,sound,composition,lyrics,originality,atmosphere) VALUES (?,?,?,?,?,?,?,?)")
          .bind(user.id,releaseId,score,...criteria).run();
      }
      const followers = await db.prepare("SELECT follower_user_id FROM user_follows WHERE followed_user_id=?").bind(user.id).all();
      for (const follower of (followers.results || [])) {
        await db.prepare("INSERT INTO notifications (id,recipient_user_id,actor_user_id,actor_username,type,review_id,created_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(),follower.follower_user_id,user.id,user.username,"new_review",id,createdAt).run();
      }
      return json({ ok: true }, 201);
    }

    return json({ error: "API endpoint not found" }, 404);
  } catch (error) {
    return json({ error: "Ошибка API: " + (error && error.message ? error.message : "неизвестная ошибка") }, 500);
  }
}
