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
    return await db.prepare("SELECT id, username, email FROM users WHERE id = ?").bind(data.id).first();
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
  return { id: user.id, username: user.username, email: user.email };
}

async function ensureRatingColumns(db) {
  const ratingCols = await db.prepare("PRAGMA table_info(ratings)").all();
  const existingRatings = new Set((ratingCols.results || []).map(c => c.name));
  for (const name of ["sound","composition","lyrics","originality","atmosphere"]) {
    if (!existingRatings.has(name)) await db.prepare(`ALTER TABLE ratings ADD COLUMN ${name} INTEGER`).run();
  }
  const reviewCols = await db.prepare("PRAGMA table_info(reviews)").all();
  const existingReviews = new Set((reviewCols.results || []).map(c => c.name));
  for (const [name, definition] of [["title","TEXT NOT NULL DEFAULT ''"],["pros","TEXT NOT NULL DEFAULT ''"],["cons","TEXT NOT NULL DEFAULT ''"],["sound","INTEGER"],["composition","INTEGER"],["lyrics","INTEGER"],["originality","INTEGER"],["atmosphere","INTEGER"]]) {
    if (!existingReviews.has(name)) await db.prepare(`ALTER TABLE reviews ADD COLUMN ${name} ${definition}`).run();
  }
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
    await ensureSeeds(db);
    await ensureSubmissionTables(db);
    await ensureRatingColumns(db);
    await ensureScoreScale(db);
    await ensureAtmosphereMultiplier(db);
    if (method === "OPTIONS") return new Response(null, { status: 204 });
    const body = method === "POST" ? await readBody(request) : {};
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

    if (path === "/api/releases" && method === "GET") {
      const releases = await db.prepare(`
        SELECT r.*,
          COALESCE(ROUND(AVG(rt.score),1), r.score) AS score
        FROM releases r LEFT JOIN ratings rt ON rt.release_id = r.id
        GROUP BY r.id ORDER BY r.id
      `).all();
      return json({ releases: releases.results || [] });
    }

    await db.prepare("CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id), release_id INTEGER NOT NULL REFERENCES releases(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,release_id))").run();\n\n    if (path === "/api/favorites" && method === "GET") {\n      if (!user) return json({ error: "Войдите, чтобы видеть избранное" }, 401);\n      const rows = await db.prepare("SELECT release_id FROM favorites WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();\n      return json({ favorites: (rows.results || []).map(x => x.release_id) });\n    }\n    const favoriteMatch = path.match(/^\\/api\\/favorites\\/(\\d+)$/);\n    if (favoriteMatch && method === "POST") {\n      if (!user) return json({ error: "Войдите, чтобы добавлять в избранное" }, 401);\n      const releaseId = Number(favoriteMatch[1]);\n      const exists = await db.prepare("SELECT id FROM releases WHERE id=?").bind(releaseId).first();\n      if (!exists) return json({ error: "Релиз не найден" }, 404);\n      await db.prepare("INSERT OR IGNORE INTO favorites (user_id,release_id,created_at) VALUES (?,?,?)").bind(user.id,releaseId,new Date().toISOString()).run();\n      return json({ ok: true });\n    }\n    if (favoriteMatch && method === "DELETE") {\n      if (!user) return json({ error: "Войдите в аккаунт" }, 401);\n      await db.prepare("DELETE FROM favorites WHERE user_id=? AND release_id=?").bind(user.id,Number(favoriteMatch[1])).run();\n      return json({ ok: true });\n    }\n\n    if (path === "/api/reviews" && method === "GET") {
      const reviews = await db.prepare(`
        SELECT rv.id, rv.username, rv.release_title AS release, rv.artist, rv.score, rv.title, rv.pros, rv.cons, rv.body, rv.created_at, rv.sound, rv.composition, rv.lyrics, rv.originality, rv.atmosphere
        FROM reviews rv ORDER BY rv.created_at DESC
      `).all();
      return json({ reviews: reviews.results || [] });
    }


    if (path === "/api/submissions" && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы предложить релиз" }, 401);
      const title = String(body.title || "").trim(), artist = String(body.artist || "").trim();
      const type = String(body.type || "").trim(), year = Number(body.year);
      const genre = String(body.genre || "").trim(), coverUrl = String(body.cover_url || "").trim();
      const description = String(body.description || "").trim(), listeningUrl = String(body.listening_url || "").trim();
      if (!title || title.length > 100 || !artist || artist.length > 100 ||
          !["Альбом","Сингл"].includes(type) || !Number.isInteger(year) || year < 1900 || year > 2100 ||
          genre.length > 50 || description.length > 2000 ||
          (coverUrl && !/^https:\/\//i.test(coverUrl)) || (listeningUrl && !/^https:\/\//i.test(listeningUrl)))
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
        db.prepare("INSERT INTO releases (id,title,artist,type,year,tag,art,cover,description,score) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(next.id,submission.title,submission.artist,submission.type,submission.year,submission.genre || "COMMUNITY",art,
            "linear-gradient(135deg,#d4fa45,#53652a)",submission.description + (submission.listening_url ? "\\n\\nСлушать: " + submission.listening_url : ""),0),
        db.prepare("UPDATE release_submissions SET status='approved',reviewed_at=?,reviewed_by=? WHERE id=?")
          .bind(new Date().toISOString(),user.id,submissionId)
      ]);
      return json({ ok: true, release_id: next.id });
    }

    const deleteReleaseMatch = path.match(/^\/api\/admin\/releases\/(\d+)$/);
    if (deleteReleaseMatch && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const releaseId = Number(deleteReleaseMatch[1]);
      const release = await db.prepare("SELECT title,artist FROM releases WHERE id=?").bind(releaseId).first();
      if (!release) return json({ error: "Релиз не найден" }, 404);
      await db.batch([
        db.prepare("DELETE FROM ratings WHERE release_id=?").bind(releaseId),
        db.prepare("DELETE FROM reviews WHERE release_title=? AND artist=?").bind(release.title,release.artist),
        db.prepare("DELETE FROM releases WHERE id=?").bind(releaseId)
      ]);
      return json({ ok: true });
    }
    const deleteReviewMatch = path.match(/^\/api\/admin\/reviews\/([a-f0-9-]+)$/i);
    if (deleteReviewMatch && method === "DELETE") {
      if (!isAdmin(user)) return json({ error: "Доступ только для администратора TOWHELL" }, 403);
      const result = await db.prepare("DELETE FROM reviews WHERE id=?").bind(deleteReviewMatch[1]).run();
      if (!result.meta || result.meta.changes === 0) return json({ error: "Рецензия не найдена" }, 404);
      return json({ ok: true });
    }

    const ratingMatch = path.match(/^\/api\/releases\/(\d+)\/rating$/);
    if (ratingMatch && method === "POST") {
      if (!user) return json({ error: "Войдите, чтобы оценивать" }, 401);
      const releaseId = Number(ratingMatch[1]);
      const criteria = ["sound","composition","lyrics","originality","atmosphere"].map(k => Number(body[k]));
      if (criteria.some(v => !Number.isInteger(v) || v < 0 || v > 10)) return json({ error: "Каждый критерий должен быть от 0 до 10" }, 400);
      const score = (criteria[0]+criteria[1]+criteria[2]+criteria[3])*(1+criteria[4]*0.125);
      const release = await db.prepare("SELECT id FROM releases WHERE id = ?").bind(releaseId).first();
      if (!release) return json({ error: "Релиз не найден" }, 404);
      await db.prepare(`
        INSERT INTO ratings (user_id,release_id,score,sound,composition,lyrics,originality,atmosphere) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id,release_id) DO UPDATE SET score=excluded.score,sound=excluded.sound,composition=excluded.composition,lyrics=excluded.lyrics,originality=excluded.originality,atmosphere=excluded.atmosphere
      `).bind(user.id, releaseId, score, ...criteria).run();
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
      await db.prepare("INSERT INTO reviews (id,user_id,username,release_title,artist,score,body,created_at,title,pros,cons,sound,composition,lyrics,originality,atmosphere) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, user.id, user.username, release.title, release.artist, score, text, new Date().toISOString(), title, pros, cons, ...criteria).run();
      return json({ ok: true }, 201);
    }

    return json({ error: "API endpoint not found" }, 404);
  } catch (error) {
    return json({ error: "Ошибка API: " + (error && error.message ? error.message : "неизвестная ошибка") }, 500);
  }
}
