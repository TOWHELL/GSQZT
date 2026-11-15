CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  type TEXT NOT NULL,
  year INTEGER NOT NULL,
  tag TEXT NOT NULL,
  art TEXT NOT NULL,
  cover TEXT NOT NULL,
  description TEXT NOT NULL,
  score REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT NOT NULL REFERENCES users(id),
  release_id INTEGER NOT NULL REFERENCES releases(id),
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, release_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  release_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO releases
(id,title,artist,type,year,tag,art,cover,description,score)
VALUES
(1,'Ночной город','MIRA','Альбом',2026,'NEW','M','linear-gradient(135deg,#f15d52,#662d75)','Синтезаторы, ночные маршруты и честные тексты.',8.7),
(2,'Пыль на виниле','KOSMO','Альбом',2026,'TOP','K','linear-gradient(145deg,#e5a34b,#9a432c)','Тёплый звук и меланхоличная электроника.',9.1),
(3,'Без адреса','СЕВЕР','Сингл',2026,'SINGLE','С','linear-gradient(135deg,#8cacc5,#243c59)','Минималистичная история о поиске себя.',8.2),
(4,'Параллели','LILAC','Альбом',2025,'EDITOR''S','L','linear-gradient(135deg,#b9c4a1,#607c66)','Мягкая психоделия и воздушный вокал.',9.4);
