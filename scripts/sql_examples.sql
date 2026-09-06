-- PulseChat: примеры запросов для PostgreSQL.
-- Перед запуском в psql задайте существующие UUID и строку поиска:
-- \set user_id '00000000-0000-0000-0000-000000000000'
-- \set chat_id '00000000-0000-0000-0000-000000000000'
-- \set search_text 'архитектура'

-- 1. Список чатов пользователя через JOIN.
SELECT c.id, c.type, c.title, cm.role, c.created_at
FROM chat_members AS cm
JOIN chats AS c ON c.id = cm.chat_id
WHERE cm.user_id = :'user_id'::uuid
ORDER BY c.created_at DESC;

-- 2. Количество участников каждого группового чата через GROUP BY.
SELECT c.id, c.title, COUNT(cm.user_id) AS member_count
FROM chats AS c
JOIN chat_members AS cm ON cm.chat_id = c.id
WHERE c.type = 'GROUP'
GROUP BY c.id, c.title
ORDER BY member_count DESC, c.title;

-- 3. Количество отправленных сообщений по пользователям.
SELECT u.id, u.username, COUNT(m.id) AS sent_messages
FROM users AS u
LEFT JOIN messages AS m ON m.sender_id = u.id
GROUP BY u.id, u.username
ORDER BY sent_messages DESC, u.username;

-- 4. Последнее сообщение каждого чата (PostgreSQL DISTINCT ON).
SELECT
  c.id AS chat_id,
  latest.message_id,
  latest.content,
  latest.sender,
  latest.created_at
FROM chats AS c
LEFT JOIN (
  SELECT DISTINCT ON (m.chat_id)
    m.chat_id,
    m.id AS message_id,
    m.content,
    u.username AS sender,
    m.created_at
  FROM messages AS m
  JOIN users AS u ON u.id = m.sender_id
  ORDER BY m.chat_id, m.created_at DESC, m.id DESC
) AS latest ON latest.chat_id = c.id
ORDER BY c.created_at DESC, c.id DESC;

-- 5. Участники групп, которые ещё не отправили в свою группу ни одного сообщения.
SELECT c.id AS chat_id, c.title, u.id AS user_id, u.username
FROM chats AS c
JOIN chat_members AS cm ON cm.chat_id = c.id
JOIN users AS u ON u.id = cm.user_id
WHERE c.type = 'GROUP'
  AND NOT EXISTS (
    SELECT 1
    FROM messages AS m
    WHERE m.chat_id = c.id AND m.sender_id = u.id
  )
ORDER BY c.title, u.username;

-- 6. Регистронезависимый поиск сообщений внутри одного чата.
SELECT m.id, m.content, u.username AS sender, m.created_at
FROM messages AS m
JOIN users AS u ON u.id = m.sender_id
WHERE m.chat_id = :'chat_id'::uuid
  AND m.content ILIKE '%' || :'search_text' || '%'
ORDER BY m.created_at DESC, m.id DESC
LIMIT 50;

-- 7. Основные записи журнала аудита.
SELECT a.created_at, a.action, a.entity_type, a.entity_id, u.username, a.metadata
FROM audit_logs AS a
LEFT JOIN users AS u ON u.id = a.user_id
ORDER BY a.created_at DESC
LIMIT 100;
