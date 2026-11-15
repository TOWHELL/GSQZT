# GSQZT — Cloudflare Pages + D1 patch

Этот пакет добавляет API сайта GSQZT через Cloudflare Pages Functions и Cloudflare D1.

## Файлы в архиве

- `functions/api/[[path]].js` — API: регистрация, вход, профиль, релизы, оценки, рецензии.
- `schema.sql` — таблицы и стартовые релизы для D1.
- `app.js` — обновлённый frontend-клиент с более понятной обработкой не-JSON ответов.

## Установка в GitHub

1. Распакуй архив.
2. Загрузи папку `functions` в корень репозитория `TOWHELL/GSQZT`.
3. Замени корневой `app.js` файлом из архива.
4. Загрузи `schema.sql` в корень репозитория.
5. Commit changes.

Cloudflare Pages проект должен собираться из корня репозитория:
- Framework preset: `None`
- Build command: пусто
- Build output directory: `.`
- Root directory: пусто

## Создать D1

В Cloudflare Dashboard:
1. Workers & Pages → D1 SQL Database → Create database.
2. Имя базы, например `gsqzt-db`.
3. Открой базу → Console → выполни всё содержимое `schema.sql`.
4. Открой Pages → проект `gsqzt` → Settings → Functions → D1 database bindings.
5. Добавь binding:
   - Variable name: `GSQZT_DB`
   - D1 database: `gsqzt-db`
6. В Settings → Variables and Secrets добавь secret:
   - Name: `JWT_SECRET`
   - Value: случайная строка не короче 32 символов.
   Не публикуй и никому не отправляй это значение.

После изменения binding/secret запусти новый deployment (Deployments → Retry deployment или сделай новый commit).

## Проверка

Открой `https://gsqzt.pages.dev/api/health`.
Ожидаемый ответ: `{"ok":true}`.
Затем проверь главную страницу и регистрацию. Используй тестовый email и уникальный пароль; не отправляй пароль в чат.

## Важно

Это прототип. Перед широкой публичной эксплуатацией добавь rate limiting, проверку email, модерацию отзывов и резервное копирование базы. D1 и Pages имеют бесплатные лимиты; при превышении лимитов возможны ограничения или платное использование.
