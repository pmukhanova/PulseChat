# Runbook PulseChat

Инструкция описывает запуск, миграции, наполнение БД и базовую диагностику. Команды ниже следует выполнить в корне проекта `pulse-chat`.

## 1. Быстрый запуск через Docker Compose

Требуется Docker с Compose v2.

```bash
cp .env.example .env
```

Перед запуском замените `JWT_SECRET` в `.env` на случайную строку длиной не менее 32 символов. Демонстрационные пароли БД допустимы только локально.

```bash
docker compose up --build
```

В фоновом режиме:

```bash
docker compose up --build -d
docker compose ps
```

Сервисы по умолчанию:

| Сервис | Адрес |
|---|---|
| Web UI | `http://localhost:8080` |
| REST API | `http://localhost:3000/api` |
| Swagger | `http://localhost:3000/api/docs` |
| Backend health | `http://localhost:3000/api/health` |
| PostgreSQL | `localhost:5432` |

Backend-контейнер ждёт healthcheck PostgreSQL, применяет TypeORM-миграции и только затем запускает NestJS. `synchronize=false`.

## 2. Наполнение демонстрационными данными

После healthy-старта backend выполните:

```bash
docker compose exec backend node dist/database/seed.js
```

Seed повторно запускаемый: он переиспользует пользователей и чаты и не дублирует сообщения с детерминированными `clientMessageId`.

Демонстрационные учётные записи предназначены только для локальной защиты:

| Username | Password | Роль в группе `Команда Pulse` |
|---|---|---|
| `andrey` | `Demo12345` | OWNER |
| `maria` | `Demo12345` | ADMIN |
| `ivan` | `Demo12345` | MEMBER |
| `olga` | `Demo12345` | не добавлена, подходит для демонстрации добавления |

Seed создаёт личный чат `andrey` - `maria`, группу, три роли и 45 групповых сообщений. Фраза `архитектура` подходит для показа поиска, а объём группы - для пагинации вверх.

## 3. Проверка запуска

```bash
docker compose ps
curl -fsS http://localhost:3000/api/health
curl -I http://localhost:8080/health
```

Для просмотра журналов:

```bash
docker compose logs -f postgres backend frontend
```

Для проверки миграций внутри production-образа можно посмотреть startup-лог backend. Локально доступна команда `npm run migration:show` из каталога `backend` при заданном `DATABASE_URL`.

Не записывайте в отчёт «проверено», пока команда действительно не выполнена и результат не внесён в таблицу [testing.md](testing.md).

## 4. Локальный запуск без Docker для Node-приложений

Требуются Node.js 20+, npm и доступная PostgreSQL. Пример переменных для БД на localhost:

```bash
export DATABASE_URL='postgresql://pulse_chat:pulse_chat_dev@localhost:5432/pulse_chat'
export JWT_SECRET='replace-with-a-random-secret-of-at-least-32-characters'
export JWT_EXPIRES_IN='8h'
export BCRYPT_ROUNDS='12'
export BACKEND_PORT='3000'
export FRONTEND_ORIGIN='http://localhost:5173'
```

Backend:

```bash
cd backend
npm ci
npm run migration:run
npm run seed
npm run start:dev
```

Frontend в другом терминале:

```bash
cd frontend
npm ci
npm run dev
```

Vite проксирует `/api` и `/socket.io` на `http://localhost:3000`. Если frontend и backend находятся на разных публичных origin, задайте `VITE_API_URL` и `VITE_SOCKET_URL` перед frontend build.

## 5. Миграции

Локальные команды из `backend`:

```bash
npm run migration:show
npm run migration:run
npm run migration:revert
```

`migration:revert` удаляет последний слой схемы и предназначен только для разработки. В Docker обычный `up` уже выполняет `migration:run`; вручную повторять его для нормального старта не требуется.

## 6. Остановка и очистка

Остановить контейнеры, сохранив БД:

```bash
docker compose down
```

Удалить контейнеры и volume PostgreSQL:

```bash
docker compose down -v
```

Последняя команда необратимо удаляет локальные данные. После неё при следующем запуске нужно снова применить миграцию и seed; Docker Compose делает миграцию автоматически.

## 7. Команды качества

Backend:

```bash
cd backend
npm run lint
TEST_DATABASE_URL=postgresql://pulse_chat:pulse_chat_dev@localhost:5432/pulse_chat_test npm run test
TEST_DATABASE_URL=postgresql://pulse_chat:pulse_chat_dev@localhost:5432/pulse_chat_test npm run test:e2e
npm run build
```

Backend e2e в предусмотренном Compose profile:

```bash
docker compose --profile test run --rm backend-test
```

При первом создании PostgreSQL volume файл `scripts/init-test-db.sql` создаёт отдельную БД `pulse_chat_test`. Init-скрипты PostgreSQL не выполняются повторно для уже существующего volume; в таком случае тестовую БД нужно создать отдельно или использовать чистый локальный volume.

Frontend:

```bash
cd frontend
npm run lint
npm run build
npm run test:e2e
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npm run demo:record
```

Фактические результаты, окружение и ссылки на evidence заполняются в [testing.md](testing.md).

## 8. Частые проблемы

### Backend не стартует

- Проверьте `DATABASE_URL` и готовность PostgreSQL.
- Убедитесь, что `JWT_SECRET` задан и содержит минимум 32 символа.
- Посмотрите `docker compose logs backend postgres`.

### Frontend открывается, но REST недоступен

- В Docker используйте UI на `http://localhost:8080`, чтобы Nginx проксировал `/api`.
- Проверьте health backend и `VITE_API_URL` для отдельной сборки.
- Для CORS добавьте фактический frontend origin в `FRONTEND_ORIGIN` через запятую.

### Socket.IO не подключается

- Перевойдите в аккаунт, если access JWT истёк.
- Проверьте proxy location `/socket.io/` и WebSocket Upgrade в Nginx.
- Проверьте `VITE_SOCKET_URL`; пустое значение означает origin страницы.

### История или поиск возвращает 403

Это ожидаемо, если пользователь не состоит в чате или уже удалён из группы. Не следует обходить проверку на клиенте: доступ выдаётся изменением `chat_members` через разрешённый endpoint.

### Seed не запускается в контейнере

Используйте production-команду `node dist/database/seed.js`, а не `npm run seed`: runtime-образ не обязан содержать исходники и `ts-node`.
