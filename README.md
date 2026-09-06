# PulseChat

PulseChat - учебный полнофункциональный мессенджер. Проект показывает регистрацию и JWT-авторизацию, личные и групповые чаты, роли, историю с курсорной пагинацией, поиск и доставку сообщений в реальном времени.

## Архитектура

Это объяснимый модульный монолит: React-клиент обращается к одному NestJS backend по REST и Socket.IO, а backend хранит состояние в PostgreSQL.

```text
React + Vite ── REST / Socket.IO ── NestJS + TypeORM ── PostgreSQL
```

- `backend/` - NestJS, JWT, TypeORM, Swagger и Socket.IO Gateway;
- `frontend/` - React, Router, Axios и socket.io-client;
- `docs/` - отчёт, модели, диаграммы и материалы защиты;
- `scripts/` - SQL-примеры и служебные скрипты;
  
## Возможности

- регистрация, вход и `GET /api/auth/me`;
- access JWT в Bearer header и Socket.IO handshake;
- bcrypt-хэши паролей;
- уникальный DIRECT-чат для пары пользователей;
- GROUP-чаты с ролями `OWNER`, `ADMIN`, `MEMBER`;
- добавление, удаление участников и назначение `ADMIN` по правилам минимальных привилегий;
- Socket.IO personal rooms, серверный ack, запись до broadcast;
- новый чат, роль и сообщение в неактивном чате синхронизируются без reload;
- локальный unread badge для чужих сообщений в неактивном чате;
- один автоматический retry клиента с тем же `clientMessageId`;
- дедупликация по `(sender_id, client_message_id)`;
- история «вверх» через cursor `before`, без page number;
- поиск `ILIKE` только внутри доступного чата;
- Swagger, миграция, идемпотентный seed и журнал аудита;
- e2e-набор для REST и WebSocket;
- Docker Compose для PostgreSQL, backend и frontend.

## Быстрый запуск через Docker

Требования: Docker Desktop с Docker Compose v2+.

```bash
cp .env.example .env
openssl rand -hex 32
# Вставьте результат после JWT_SECRET= в .env
docker compose up --build
```

После healthy-старта:

- frontend: <http://localhost:8080>;
- backend: <http://localhost:3000/api>;
- Swagger: <http://localhost:3000/api/docs>;
- healthcheck: <http://localhost:3000/api/health>;
- PostgreSQL: `localhost:5432`.

Миграции применяются автоматически перед стартом backend. Демонстрационные данные запускаются отдельно:

```bash
docker compose exec backend node dist/database/seed.js
```

Остановка:

```bash
docker compose down
```

Полная очистка контейнеров и данных PostgreSQL:

```bash
docker compose down -v
```

## Демонстрационные аккаунты

Только для локальной демонстрации, не для production:

| Username | Password | Начальная роль в `Команда Pulse` |
|---|---|---|
| `andrey` | `Demo12345` | OWNER |
| `maria` | `Demo12345` | ADMIN |
| `ivan` | `Demo12345` | MEMBER |
| `olga` | `Demo12345` | не состоит в группе, удобна для добавления |

Seed также создаёт личный чат `andrey` - `maria`, 45 сообщений в группе для пагинации и фразы со словом «архитектура» для поиска. Повторный seed не создаёт дубликаты.

## Локальный запуск без Docker для приложений

Нужны Node.js 20+, npm и доступный PostgreSQL 16+. PostgreSQL можно оставить в Docker:

```bash
export JWT_SECRET=replace-with-at-least-32-random-characters
docker compose up -d postgres
```

Экспортируйте переменные либо создайте `backend/.env`. Для запуска backend с хоста в `DATABASE_URL` должен быть `localhost`, а не имя compose-сервиса `postgres`:

```bash
export DATABASE_URL=postgresql://pulse_chat:pulse_chat_dev@localhost:5432/pulse_chat
export JWT_SECRET=replace-with-at-least-32-random-characters
export FRONTEND_ORIGIN=http://localhost:5173
```

Backend:

```bash
cd backend
npm ci
npm run migration:run
npm run seed
npm run start:dev
```

Frontend во втором терминале:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Vite откроется на <http://localhost:5173> и проксирует `/api` и `/socket.io` на backend.

## Миграции и seed

Из `backend/` с заданным `DATABASE_URL`:

```bash
npm run migration:show
npm run migration:run
npm run migration:revert
npm run seed
```

Финальная конфигурация всегда использует `synchronize: false`. Схема создаётся только миграциями.

## Проверки

Backend:

```bash
cd backend
npm ci
npm run lint
npm run build
TEST_DATABASE_URL=postgresql://pulse_chat:pulse_chat_dev@localhost:5432/pulse_chat_test npm run test:e2e
```

Контейнерный e2e-прогон использует отдельную БД `pulse_chat_test`:

```bash
docker compose --profile test run --rm backend-test
```

Frontend:

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

Playwright и видеозапись требуют запущенный и наполненный seed-данными проект:

```bash
cd frontend
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:realtime-sync
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run test:reconnect
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run demo:record
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run demo:presentation
```

Короткая техническая запись сохранена как `artifacts/demo/pulse-chat-demo.webm`. Каноническая презентационная запись находится в `artifacts/demo/pulse-chat-presentation-demo.webm`; её фактические параметры фиксируются после прогона в `docs/testing.md`. Сценарий записи подробно описан в `docs/video-script.md`.

## REST API

| Method | Endpoint | Назначение |
|---|---|---|
| POST | `/api/auth/register` | регистрация и access JWT |
| POST | `/api/auth/login` | вход и access JWT |
| GET | `/api/auth/me` | текущий пользователь |
| GET | `/api/users?search=` | поиск пользователей |
| POST | `/api/chats/direct` | создать/открыть DIRECT |
| POST | `/api/chats/group` | создать GROUP |
| GET | `/api/chats` | свои чаты |
| GET | `/api/chats/:chatId` | один доступный чат |
| PATCH | `/api/chats/:chatId` | переименовать GROUP |
| GET | `/api/chats/:chatId/members` | участники |
| POST | `/api/chats/:chatId/members` | добавить MEMBER |
| DELETE | `/api/chats/:chatId/members/:userId` | удалить разрешённого участника |
| PATCH | `/api/chats/:chatId/members/:userId/role` | назначить/снять ADMIN |
| GET | `/api/chats/:chatId/messages` | история с `before` |
| GET | `/api/chats/:chatId/messages/search` | поиск внутри чата |

Swagger содержит DTO запросов, параметры, Bearer Auth и описания endpoint. Socket.IO-контракт находится в `docs/websocket-api.md`.

## Socket.IO

Клиент передаёт JWT как `handshake.auth.token`, затем использует:

- `join_chat` - вступить в `chat:<chatId>` после проверки членства;
- `leave_chat` - выйти из комнаты;
- `send_message` - сохранить сообщение и получить ack;
- `message_created` - новое сохранённое сообщение в персональной room каждого участника;
- `chat_list_changed` - инвалидация списка при новом чате или добавлении участника;
- `chat_details_changed` - инвалидация состава, роли или названия GROUP;
- `chat_access_revoked` - участник удалён и принудительно исключён из комнаты.

Сервер сначала пишет сообщение в PostgreSQL, затем делает emit в персональные rooms участников. Повтор с тем же `clientMessageId` возвращает ранее сохранённую запись и не создаёт повторный broadcast.

## Безопасность и ограничения MVP

- пароль и JWT не логируются; пароль и `password_hash` никогда не возвращаются, а access JWT выдаётся только auth endpoint;
- глобальный `ValidationPipe` удаляет/запрещает лишние поля;
- доступ к чату, истории, поиску и комнате проверяется по `chat_members`;
- состав DIRECT-чата неизменяем;
- `OWNER` - старший администратор группы и не может быть удалён;
- JWT хранится в `localStorage` только как понятное учебное упрощение;
- refresh-token, broker, Redis и rate limiting намеренно не добавлены;
- `ILIKE` подходит для малого MVP; при росте нужны PostgreSQL FTS или `pg_trgm`;
- целевая задержка real-time - менее 200 мс в нормальной локальной среде, но это не формальный SLA.

Подробности: `docs/auth-model.md`, `docs/roles-and-permissions.md`, `docs/report.md` и `docs/defense-notes.md`.

## Структура данных

Таблицы: `users`, `chats`, `chat_members`, `messages`, `audit_logs`. Все основные идентификаторы - UUID. Связь пользователей и чатов N:N разрешена через `chat_members`; там же хранится роль внутри конкретной группы.

ER-диаграмма: `docs/erd.svg`. Рабочие SQL-примеры с `JOIN`, `GROUP BY`, `DISTINCT ON`, `NOT EXISTS` и `ILIKE`: `scripts/sql_examples.sql`.

## Материалы защиты

- `docs/report.md` - отчёт;
- `docs/erd.svg` - ER-диаграмма;
- `docs/architecture.svg` - архитектура;
- `docs/send-message-sequence.svg` - sequence-диаграмма;
- `docs/realtime-sync.svg` - схема синхронизации интерфейса без reload;
- `docs/auth-model.md` - модель авторизации;
- `docs/roles-and-permissions.md` - роли;
- `docs/runbook.md` - инструкция запуска;
- `docs/video-script.md` - сценарий записи;
- `artifacts/demo/pulse-chat-demo.webm` - короткая техническая запись успешного Playwright-прогона;
- `artifacts/demo/pulse-chat-presentation-demo.webm` - основное фактическое видео для защиты;
- `docs/presentation-outline.md`, `docs/defense-script.md` и `artifacts/presentation.pptx` - презентация и 

## Автор

Андрей Потрикеев - анализ требований, проектирование БД и API, backend, frontend, WebSocket, тестирование - Муханова Полина 100%.
