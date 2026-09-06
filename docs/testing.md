# Проверка PulseChat

Дата финальной фиксации: 2026-07-16. `PASS` означает exit code 0 и сохранённый результат; `NOT RUN` — проверка не выполнялась. Команды npm запускались в чистом локальном контейнере Node 20, потому что в host-среде доступен `node`, но нет исполняемого `npm`.

## Фактические результаты

| Проверка | Выполненная команда | Результат |
|---|---|---|
| Backend dependencies | `npm ci` | PASS; 804 пакета установлены по обновлённому lock-файлу |
| Backend lint | `npm run lint` | PASS |
| Backend build | `npm run build` | PASS |
| Frontend dependencies | `npm ci` | PASS; 215 пакетов установлены по `package-lock.json` |
| Frontend lint | `npm run lint` | PASS |
| Frontend strict typecheck | `npm run typecheck` | PASS |
| Frontend build | `npm run build` | PASS; Vite обработал 137 модулей |
| Compose config | `docker compose config --quiet` с временным JWT | PASS |
| Чистый volume | `docker compose down -v`, затем cached `up -d` | PASS; миграция применена на пустой БД |
| Compose rebuild | `docker compose up --build -d` с временным JWT | PASS; backend и frontend пересобраны |
| Runtime health | `docker compose ps` | PASS; PostgreSQL, backend и frontend healthy |
| HTTP smoke | `curl` для `:8080/`, `:3000/api/health`, `:3000/api/docs` | PASS; 200 / 200 / 200 |
| Seed, первый запуск | `node dist/database/seed.js` | PASS; users/chats/members/messages = `4/2/5/47` |
| Seed, второй запуск | та же команда и SQL-проверки | PASS; снова `4/2/5/47`, дубликаты users/members/messages = `0/0/0` |
| Backend e2e + WebSocket | `docker compose --profile test run --rm backend-test` | PASS; 1 suite, 21/21, 3.146 s |
| Playwright realtime sync | `tests/realtime-sync.spec.ts`, 1 worker | PASS; 1/1, 5.2 s |
| Playwright technical demo | `tests/demo.spec.ts`, 1 worker | PASS; 1/1, 8.8 s |
| Playwright reconnect | `tests/reconnect.spec.ts`, 1 worker | PASS; 1/1, 4.1 s, без `page.reload()` |
| Playwright presentation demo | `tests/presentation-demo.spec.ts`, 1 worker | PASS; 1/1, 2.1 min |
| Основное видео | Chromium metadata + codec marker | PASS; 125.08 s, VP8 WebM, 1440×900, без аудио |
| Presentation PPTX | render всех 15 слайдов, contact sheet, визуальный просмотр, `slides_test.py` | PASS; overflow не обнаружен |
| PDF report | `pdfinfo`, Poppler render всех страниц, визуальный просмотр и извлечение текста | PASS; 15 страниц A4, отдельное содержание, таблицы и четыре диаграммы |
| Source ZIP | `./scripts/create_submission_archive.sh`, `unzip -tqq`, forbidden-path scan | PASS |
| Submission ZIP | `./scripts/create_full_submission_archive.sh`, `unzip -tqq`, manifest scan | PASS; 16 файлов, ZIP не содержит сам себя |
| NFR latency | 30 измерений emit → ack/event | NOT RUN; `<200 мс` остаётся ориентиром, не SLA |

## `npm audit --omit=dev`

- Frontend: PASS, `0` production vulnerabilities.
- Backend до совместимых обновлений: `10 high`, `11 moderate`, `0 critical`.
- Обновлены без смены архитектуры: NestJS `10.4.15 → 10.4.22`, bcrypt `5.1.1 → 6.0.0`, TypeORM `0.3.20 → 0.3.31`.
- Backend после обновлений: `3 high`, `13 moderate`, `0 critical`.
- Оставшиеся high: direct `@nestjs/platform-express` через transitive `multer`, transitive `multer`, transitive `lodash` через `@nestjs/config` и `@nestjs/swagger`. Для этой цепочки npm предлагает major-переход Nest 11, а для текущего lodash patched-версия отсутствует; `npm audit fix --force` не применялся.
- Оставшиеся moderate: `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-socket.io`, `@nestjs/swagger`, `@nestjs/typeorm`, `@nestjs/websockets`, `body-parser`, `express`, `file-type`, `js-yaml`, `qs`, `uuid`.

## Backend e2e/WebSocket: 21 сценарий

1. Регистрация создаёт bcrypt-хэш и не возвращает его клиенту.
2. Повторный username даёт 409.
3. Вход принимает верный и отвергает неверный пароль.
4. Защищённый REST без JWT и лишние поля DTO отклоняются.
5. Повтор DIRECT возвращает тот же чат.
6. Параллельное создание DIRECT сериализуется.
7. GROUP-роли запрещают недопустимые повышения, добавление и удаление OWNER.
8. Параллельное добавление участника даёт 201 и 409, а не 500.
9. Cursor history возвращается в хронологическом порядке и закрыта постороннему.
10. `ILIKE` ищет внутри чата и закрыт постороннему.
11. Invalid JWT WebSocket handshake отклоняется.
12. Невалидный WebSocket DTO возвращает error ack без timeout.
13. Сообщение приходит через personal room без `join_chat`.
14. Новый DIRECT уведомляет второго online пользователя.
15. Новая GROUP уведомляет добавленного online пользователя.
16. Смена роли отправляет `chat_details_changed`.
17. Добавление участника уведомляет добавленного и действующих членов.
18. Переименование GROUP уведомляет online участников.
19. Удаление участника уведомляет удалённого и оставшихся членов.
20. Повтор `clientMessageId` в другом чате возвращает conflict ack.
21. Сообщение сохраняется, приходит второму клиенту и дедуплицируется при retry.

## Reconnect regression

Пользователь B остаётся в выбранном доступном чате, его Socket.IO/сеть временно отключается, пользователь A отправляет сообщение, затем соединение B восстанавливается. Обработчик `connect` выполняет тихий `refreshChats(true)`, сохраняет текущий чат, обновляет порядок и preview sidebar и не показывает большой loading spinner. Восстановление локального unread за офлайн-период намеренно не проверяется.

## Границы подтверждения

- p50/p95 real-time задержки не измерялись.
- Набор не содержит отдельного assertion для pagination limit по умолчанию 30 и максимума 100.
- Оставшиеся production advisories backend не скрыты: их устранение требует несовместимого обновления NestJS/цепочки зависимостей либо появления patched lodash.
