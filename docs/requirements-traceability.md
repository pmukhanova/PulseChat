# Трассировка требований PulseChat

Документ связывает официальные требования кейса №1 с текущей реализацией и проверками. Источники требований: `Вводная встреча.pdf`, `messenger-1.pdf`, `messenger_2.pdf` и официальная документация использованных технологий.

| ID | Официальное требование | Реализация | Evidence |
|---|---|---|---|
| M-01 | Сервер и клиент мессенджера | `backend/`, `frontend/`, Docker Compose | Docker build и HTTP smoke |
| M-02 | Регистрация, login и авторизация | JWT, `JwtAuthGuard`, Socket.IO handshake | Auth e2e, invalid JWT WS test |
| M-03 | Безопасное хранение пароля | bcrypt, `password_hash`, поле не возвращается API | e2e проверяет hash и JSON |
| M-04 | DIRECT 1-на-1 | `POST /chats/direct`, advisory lock пары | repeated/concurrent DIRECT e2e |
| M-05 | GROUP с названием и участниками | `POST /chats/group`, `chat_members` | GROUP e2e, Playwright |
| M-06 | Быстрые сообщения | Socket.IO, `message_created` через `user:<userId>` | personal room e2e, realtime-sync |
| M-07 | История вверх | cursor `before`, `hasMore`, `nextBefore` | history e2e, demo |
| M-08 | Добавление и удаление участника администратором | OWNER/ADMIN/MEMBER checks, `chat_access_revoked` | role and removal e2e |
| M-09 | Поиск внутри чата | `ILIKE`, membership check | search e2e |
| M-10 | Роли и минимальные привилегии | OWNER, ADMIN, MEMBER | negative e2e, UI checks |
| M-11 | Полная ER-модель, PK/FK, N:N | `docs/erd.svg`, migration и entities | визуальная проверка схемы |
| M-12 | Отчёт, запуск, SQL, вклад, видео, презентация | `docs/`, `scripts/`, `artifacts/` | архивы и визуальная проверка |

## Дополнительные архитектурные темы

`messenger_2.pdf` рассматривает retry, идемпотентность, брокеры, статусы и вложения. В текущем MVP реализована идемпотентность: `clientMessageId` и ограничение `UNIQUE (sender_id, client_message_id)` не позволяют retry создать вторую запись. Брокер, server-side delivery/read receipts и вложения не реализованы.

## Реальное время

- `user:<userId>` объединяет все подключённые сокеты пользователя.
- `message_created` получает каждый текущий участник чата, независимо от открытого диалога.
- `chat_list_changed` инициирует тихий refetch списка при создании чата или добавлении пользователя.
- `chat_details_changed` инициирует refetch конкретного GROUP-чата при смене названия, состава или роли.
- `chat_access_revoked` удаляет чат и локальный unread state у исключённого пользователя.

## Границы версии

- unread хранится локально в `Record<string, number>`; после reload он может сброситься;
- server-side read receipts и delivery statuses отсутствуют;
- отдельный 30-попыточный NFR-замер `<200 ms>` не выполнялся;
- один backend-процесс не требует adapter или broker.
