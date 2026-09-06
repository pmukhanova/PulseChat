import { useMemo, useState } from 'react';
import { chatTitle, formatChatTime } from '../lib/format';
import type { Chat, User } from '../types/api';
import { Avatar } from './Avatar';
import { LogoMark, LogOutIcon, PlusIcon, SearchIcon, UserPlusIcon, UsersIcon } from './Icons';
import { Spinner } from './Spinner';

interface ChatSidebarProps {
  chats: Chat[];
  currentUser: User;
  selectedChatId: string | null;
  unreadCounts: Record<string, number>;
  loading: boolean;
  onSelect: (chatId: string) => void;
  onCreateDirect: () => void;
  onCreateGroup: () => void;
  onLogout: () => void;
}

export function ChatSidebar({
  chats,
  currentUser,
  selectedChatId,
  unreadCounts,
  loading,
  onSelect,
  onCreateDirect,
  onCreateGroup,
  onLogout,
}: ChatSidebarProps) {
  const [query, setQuery] = useState('');
  const visibleChats = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return chats;
    return chats.filter((chat) => chatTitle(chat, currentUser.id).toLocaleLowerCase('ru-RU').includes(normalized));
  }, [chats, currentUser.id, query]);

  return (
    <aside className="chat-sidebar">
      <header className="sidebar-brand">
        <div className="brand">
          <LogoMark className="brand__mark" />
          <span>PulseChat</span>
        </div>
        <span className="sidebar-brand__tag">online</span>
      </header>

      <div className="current-user">
        <Avatar username={currentUser.username} />
        <div className="current-user__text">
          <strong>{currentUser.username}</strong>
          <span>Ваш профиль</span>
        </div>
        <button className="icon-button" type="button" onClick={onLogout} aria-label="Выйти" title="Выйти">
          <LogOutIcon />
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="button button--primary" type="button" onClick={onCreateDirect} data-testid="new-direct-chat">
          <UserPlusIcon />
          Личный чат
        </button>
        <button className="button button--soft" type="button" onClick={onCreateGroup} data-testid="new-group-chat">
          <UsersIcon />
          Группа
        </button>
      </div>

      <label className="search-input sidebar-search">
        <SearchIcon />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти чат" aria-label="Найти чат" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск"><span>×</span></button>}
      </label>

      <div className="chat-list-heading">
        <span>Сообщения</span>
        <span>{chats.length}</span>
      </div>

      <nav className="chat-list" aria-label="Список чатов" data-testid="chat-list">
        {loading && (
          <div className="sidebar-loading"><Spinner /><span>Загружаем чаты…</span></div>
        )}
        {!loading && visibleChats.length === 0 && (
          <div className="sidebar-empty">
            <span className="sidebar-empty__icon"><PlusIcon /></span>
            <strong>{query ? 'Чаты не найдены' : 'Пока нет диалогов'}</strong>
            <p>{query ? 'Попробуйте другой запрос.' : 'Создайте личный чат или соберите группу.'}</p>
          </div>
        )}
        {visibleChats.map((chat) => {
          const title = chatTitle(chat, currentUser.id);
          const preview = chat.lastMessage
            ? `${chat.lastMessage.sender.id === currentUser.id ? 'Вы: ' : ''}${chat.lastMessage.content}`
            : chat.type === 'GROUP' ? `${chat.members.length} участников` : 'Начните разговор';
          const unreadCount = unreadCounts[chat.id] ?? 0;
          return (
            <button
              className={`chat-list-item ${selectedChatId === chat.id ? 'chat-list-item--active' : ''}`}
              type="button"
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              data-testid="chat-list-item"
              data-chat-id={chat.id}
              data-chat-title={title}
            >
              <Avatar username={title} group={chat.type === 'GROUP'} />
              <span className="chat-list-item__body">
                <span className="chat-list-item__top">
                  <strong>{title}</strong>
                  <span className="chat-list-item__meta">
                    <time>{formatChatTime(chat.lastMessage?.createdAt ?? chat.lastMessageAt)}</time>
                    {unreadCount > 0 && (
                      <span className="chat-list-item__unread" data-testid="unread-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                </span>
                <span className={`chat-list-item__preview ${unreadCount > 0 ? 'chat-list-item__preview--unread' : ''}`}>{preview}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
