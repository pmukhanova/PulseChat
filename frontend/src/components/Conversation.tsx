import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type UIEvent } from 'react';
import { chatTitle, formatMessageTime, isSameSender } from '../lib/format';
import type { Chat, Message, User, VisibleMessage } from '../types/api';
import { Avatar } from './Avatar';
import { ChevronUpIcon, CloseIcon, MessageIcon, SearchIcon, SendIcon, UsersIcon } from './Icons';
import { Spinner } from './Spinner';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

interface ConversationProps {
  chat: Chat;
  currentUser: User;
  messages: VisibleMessage[];
  historyLoading: boolean;
  olderLoading: boolean;
  hasMore: boolean;
  socketStatus: SocketStatus;
  searchResults: Message[] | null;
  searchLoading: boolean;
  membersPanelOpen: boolean;
  onLoadOlder: () => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onSearch: (query: string) => Promise<void>;
  onClearSearch: () => void;
  onToggleMembers: () => void;
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}

function isPending(message: VisibleMessage): message is VisibleMessage & { deliveryStatus: 'sending' | 'failed' } {
  return 'deliveryStatus' in message;
}

function SearchResults({ items, query }: { items: Message[]; query: string }) {
  return (
    <div className="search-results-view" data-testid="message-search-results">
      <div className="search-results-view__heading">
        <div>
          <p className="eyebrow">Результаты поиска</p>
          <h3>{items.length ? `Найдено: ${items.length}` : 'Совпадений нет'}</h3>
        </div>
        <span>«{query}»</span>
      </div>
      {items.length === 0 ? (
        <div className="conversation-empty conversation-empty--compact">
          <SearchIcon />
          <strong>Ничего не найдено</strong>
          <p>Попробуйте изменить формулировку запроса.</p>
        </div>
      ) : (
        <div className="search-result-list">
          {items.map((message) => (
            <article className="search-result-card" key={message.id}>
              <Avatar username={message.sender.username} size="small" />
              <div>
                <header><strong>{message.sender.username}</strong><time>{new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time></header>
                <p>{message.content}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function Conversation({
  chat,
  currentUser,
  messages,
  historyLoading,
  olderLoading,
  hasMore,
  socketStatus,
  searchResults,
  searchLoading,
  membersPanelOpen,
  onLoadOlder,
  onSend,
  onSearch,
  onClearSearch,
  onToggleMembers,
}: ConversationProps) {
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const previousChatId = useRef('');
  const preserveScroll = useRef<{ height: number; top: number } | null>(null);
  const stickToBottom = useRef(true);
  const title = chatTitle(chat, currentUser.id);

  useEffect(() => {
    setDraft('');
    setSearchQuery('');
    setSending(false);
  }, [chat.id]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || searchResults) return;

    if (previousChatId.current !== chat.id) {
      previousChatId.current = chat.id;
      list.scrollTop = list.scrollHeight;
      stickToBottom.current = true;
      return;
    }

    if (preserveScroll.current) {
      const anchor = preserveScroll.current;
      list.scrollTop = anchor.top + (list.scrollHeight - anchor.height);
      preserveScroll.current = null;
      return;
    }

    if (stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [chat.id, messages, searchResults]);

  async function loadOlder() {
    const list = listRef.current;
    if (!list || olderLoading || !hasMore) return;
    preserveScroll.current = { height: list.scrollHeight, top: list.scrollTop };
    await onLoadOlder();
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || content.length > 2000 || sending || socketStatus !== 'connected') return;

    setDraft('');
    setSending(true);
    stickToBottom.current = true;
    try {
      await onSend(content);
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) await onSearch(query);
  }

  function clearSearch() {
    setSearchQuery('');
    onClearSearch();
  }

  let previousDay = '';

  return (
    <section className="conversation" aria-label={`Чат ${title}`}>
      <header className="conversation-header">
        <Avatar username={title} group={chat.type === 'GROUP'} />
        <div className="conversation-header__identity">
          <h1>{title}</h1>
          <span>{chat.type === 'GROUP' ? `${chat.members.length} участников` : 'Личный диалог'}</span>
        </div>

        <div className={`connection-state connection-state--${socketStatus}`} data-testid="socket-status">
          <span />
          {socketStatus === 'connected' && 'В сети'}
          {socketStatus === 'connecting' && 'Подключение'}
          {socketStatus === 'reconnecting' && 'Переподключение'}
          {socketStatus === 'error' && 'Нет связи'}
        </div>

        {chat.type === 'GROUP' && (
          <button className={`icon-button ${membersPanelOpen ? 'icon-button--active' : ''}`} type="button" onClick={onToggleMembers} aria-label="Показать участников" data-testid="toggle-members-panel">
            <UsersIcon />
          </button>
        )}
      </header>

      <div className="conversation-search">
        <form className="search-input" onSubmit={(event) => void submitSearch(event)}>
          <SearchIcon />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по сообщениям в этом чате"
            maxLength={100}
            aria-label="Поиск по сообщениям"
            data-testid="message-search-input"
          />
          {searchLoading && <Spinner label="Поиск сообщений" />}
          {searchResults && <button type="button" onClick={clearSearch} aria-label="Очистить поиск"><CloseIcon /></button>}
        </form>
        <button className="button button--soft button--small" type="button" onClick={() => void onSearch(searchQuery.trim())} disabled={!searchQuery.trim() || searchLoading} data-testid="message-search-submit">
          Найти
        </button>
      </div>

      {searchResults ? (
        <SearchResults items={searchResults} query={searchQuery.trim()} />
      ) : (
        <div className="message-list" ref={listRef} onScroll={handleScroll} data-testid="message-list">
          {historyLoading ? (
            <div className="conversation-loading"><Spinner /><span>Загружаем переписку…</span></div>
          ) : (
            <>
              {hasMore && (
                <button className="load-older" type="button" onClick={() => void loadOlder()} disabled={olderLoading} data-testid="load-older-messages">
                  {olderLoading ? <Spinner label="Загрузка предыдущих сообщений" /> : <ChevronUpIcon />}
                  {olderLoading ? 'Загружаем…' : 'Показать предыдущие сообщения'}
                </button>
              )}
              {!hasMore && messages.length > 0 && <div className="history-start">Начало переписки</div>}
              {messages.length === 0 && (
                <div className="conversation-empty">
                  <span className="conversation-empty__icon"><MessageIcon /></span>
                  <strong>Здесь пока тихо</strong>
                  <p>Отправьте первое сообщение — оно появится у участников мгновенно.</p>
                </div>
              )}

              {messages.map((message) => {
                const day = dayLabel(message.createdAt);
                const showDay = day !== previousDay;
                previousDay = day;
                const own = isSameSender(message, currentUser);
                const deliveryStatus = isPending(message) ? message.deliveryStatus : null;
                return (
                  <Fragment key={message.id}>
                    {showDay && <div className="day-divider"><span>{day}</span></div>}
                    <article className={`message-row ${own ? 'message-row--own' : ''}`} data-message-id={message.id}>
                      {!own && <Avatar username={message.sender.username} size="small" />}
                      <div className={`message-bubble ${deliveryStatus ? `message-bubble--${deliveryStatus}` : ''}`}>
                        {!own && <strong>{message.sender.username}</strong>}
                        <p>{message.content}</p>
                        <footer>
                          <time>{formatMessageTime(message.createdAt)}</time>
                          {deliveryStatus === 'sending' && <span>отправка…</span>}
                          {deliveryStatus === 'failed' && <span className="message-failed">не отправлено</span>}
                        </footer>
                      </div>
                    </article>
                  </Fragment>
                );
              })}
            </>
          )}
        </div>
      )}

      <form className="composer" onSubmit={(event) => void submitMessage(event)}>
        <div className="composer__input">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={socketStatus === 'connected' ? 'Напишите сообщение…' : 'Ждём подключения к серверу…'}
            disabled={socketStatus !== 'connected'}
            aria-label="Текст сообщения"
            data-testid="message-composer"
          />
          {draft.length > 1600 && <span className="composer__counter">{draft.length}/2000</span>}
        </div>
        <button className="send-button" type="submit" disabled={!draft.trim() || draft.trim().length > 2000 || sending || socketStatus !== 'connected'} aria-label="Отправить сообщение" data-testid="send-message">
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
