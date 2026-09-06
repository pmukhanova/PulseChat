import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '../auth/useAuth';
import { ChatSidebar } from '../components/ChatSidebar';
import { Conversation, type SocketStatus } from '../components/Conversation';
import { DirectChatModal } from '../components/DirectChatModal';
import { GroupChatModal } from '../components/GroupChatModal';
import { LogoMark, MessageIcon } from '../components/Icons';
import { MembersPanel } from '../components/MembersPanel';
import { StatusNotice } from '../components/StatusNotice';
import { chatsApi, getErrorMessage, messagesApi } from '../lib/api';
import { mergeMessages } from '../lib/format';
import { createMessengerSocket, joinChat, leaveChat, sendMessageWithRetry } from '../lib/socket';
import type {
  Chat,
  ChatAccessRevokedEvent,
  ChatDetailsChangedEvent,
  Message,
  PendingMessage,
  User,
  VisibleMessage,
} from '../types/api';

interface MessengerWorkspaceProps {
  user: User;
  token: string;
  logout: () => void;
}

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((left, right) => {
    const leftTime = left.lastMessage?.createdAt ?? left.lastMessageAt ?? left.createdAt;
    const rightTime = right.lastMessage?.createdAt ?? right.lastMessageAt ?? right.createdAt;
    return new Date(rightTime).getTime() - new Date(leftTime).getTime();
  });
}

function MessengerWorkspace({ user, token, logout }: MessengerWorkspaceProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [dialog, setDialog] = useState<'direct' | 'group' | null>(null);
  const [membersPanelOpen, setMembersPanelOpen] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  const activeChatRef = useRef<string | null>(null);
  const joinedChatRef = useRef<string | null>(null);
  const historyRequestRef = useRef(0);
  const seenMessageIdsRef = useRef(new Set<string>());
  const selectedChat = useMemo(() => chats.find((chat) => chat.id === selectedChatId) ?? null, [chats, selectedChatId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const upsertChat = useCallback((chat: Chat) => {
    setChats((current) => sortChats(current.some((item) => item.id === chat.id)
      ? current.map((item) => item.id === chat.id ? chat : item)
      : [chat, ...current]));
  }, []);

  const updateLastMessage = useCallback((message: Message) => {
    setChats((current) => sortChats(current.map((chat) => chat.id === message.chatId
      ? { ...chat, lastMessage: message, lastMessageAt: message.createdAt }
      : chat)));
  }, []);

  const refreshChats = useCallback(async (silent = false) => {
    if (!silent) setChatsLoading(true);
    try {
      const loadedChats = await chatsApi.list();
      setChats(sortChats(loadedChats));
      setSelectedChatId((current) => current && loadedChats.some((chat) => chat.id === current)
        ? current
        : loadedChats[0]?.id ?? null);
    } catch (requestError) {
      setNotice(getErrorMessage(requestError, 'Не удалось загрузить список чатов'));
    } finally {
      if (!silent) setChatsLoading(false);
    }
  }, []);

  const refreshChatDetails = useCallback(async (chatId: string) => {
    try {
      upsertChat(await chatsApi.get(chatId));
    } catch {
      // Access might have been revoked just before this invalidation reached the client.
    }
  }, [upsertChat]);

  const ensureChatForMessage = useCallback(async (message: Message) => {
    try {
      const loadedChat = await chatsApi.get(message.chatId);
      const loadedLastMessageTime = loadedChat.lastMessage?.createdAt ?? loadedChat.lastMessageAt;
      const useIncomingMessage = !loadedLastMessageTime
        || new Date(message.createdAt).getTime() >= new Date(loadedLastMessageTime).getTime();
      upsertChat(useIncomingMessage
        ? { ...loadedChat, lastMessage: message, lastMessageAt: message.createdAt }
        : loadedChat);
    } catch {
      // chat_list_changed or chat_access_revoked can legitimately win this race.
    }
  }, [upsertChat]);

  const refreshLatestMessages = useCallback(async (chatId: string) => {
    try {
      const page = await messagesApi.history(chatId);
      if (activeChatRef.current !== chatId) return;
      setMessages((current) => mergeMessages(current, page.items));
    } catch (requestError) {
      if (activeChatRef.current === chatId) {
        setNotice(getErrorMessage(requestError, 'Не удалось обновить историю после подключения'));
      }
    }
  }, []);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  useEffect(() => {
    const socket = createMessengerSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketStatus('connected');
      void refreshChats(true);
      const chatId = activeChatRef.current;
      if (chatId) {
        joinedChatRef.current = chatId;
        void joinChat(socket, chatId)
          .then(() => refreshLatestMessages(chatId))
          .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Не удалось войти в чат'));
      }
    });

    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') setSocketStatus('reconnecting');
    });

    socket.on('connect_error', (error) => {
      setSocketStatus(socket.active ? 'reconnecting' : 'error');
      if (/unauthor|jwt|token/i.test(error.message)) logout();
    });

    socket.on('chat_list_changed', () => {
      void refreshChats(true);
    });

    socket.on('chat_details_changed', (event: ChatDetailsChangedEvent) => {
      void refreshChatDetails(event.chatId);
    });

    socket.on('message_created', (message: Message) => {
      if (seenMessageIdsRef.current.has(message.id)) return;
      seenMessageIdsRef.current.add(message.id);
      updateLastMessage(message);
      if (!chatsRef.current.some((chat) => chat.id === message.chatId)) void ensureChatForMessage(message);
      if (activeChatRef.current === message.chatId) {
        setMessages((current) => {
          const withoutOptimisticCopy = message.clientMessageId
            ? current.filter((item) => item.clientMessageId !== message.clientMessageId)
            : current;
          return mergeMessages(withoutOptimisticCopy, [message]);
        });
      } else if (message.sender.id !== user.id) {
        setUnreadCounts((current) => ({ ...current, [message.chatId]: (current[message.chatId] ?? 0) + 1 }));
      }
    });

    socket.on('chat_access_revoked', ({ chatId }: ChatAccessRevokedEvent) => {
      if (activeChatRef.current === chatId) {
        activeChatRef.current = null;
        setSelectedChatId(null);
        setMessages([]);
        setSearchResults(null);
      }
      setChats((current) => current.filter((chat) => chat.id !== chatId));
      setUnreadCounts((current) => {
        const remaining = { ...current };
        delete remaining[chatId];
        return remaining;
      });
      setNotice('Администратор удалил вас из группового чата. Доступ закрыт.');
      void refreshChats();
    });

    setSocketStatus('connecting');
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [ensureChatForMessage, logout, refreshChatDetails, refreshChats, refreshLatestMessages, token, updateLastMessage, user.id]);

  useEffect(() => {
    activeChatRef.current = selectedChatId;
    setSearchResults(null);
    setMessages([]);
    setHasMore(false);
    setNextBefore(null);

    const socket = socketRef.current;
    const previousChatId = joinedChatRef.current;
    if (socket?.connected && previousChatId && previousChatId !== selectedChatId) {
      void leaveChat(socket, previousChatId).catch(() => undefined);
    }
    joinedChatRef.current = selectedChatId;

    if (!selectedChatId) {
      setHistoryLoading(false);
      return;
    }

    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    void (async () => {
      try {
        // Join first, then read the snapshot: a message is therefore covered either
        // by PostgreSQL history or by the already active Socket.IO room subscription.
        if (socket?.connected) await joinChat(socket, selectedChatId);
        const page = await messagesApi.history(selectedChatId);
        if (historyRequestRef.current !== requestId || activeChatRef.current !== selectedChatId) return;
        setMessages((current) => mergeMessages(current, page.items));
        setHasMore(page.hasMore);
        setNextBefore(page.nextBefore);
      } catch (requestError: unknown) {
        if (historyRequestRef.current === requestId) {
          setNotice(getErrorMessage(requestError, 'Не удалось открыть чат'));
        }
      } finally {
        if (historyRequestRef.current === requestId) setHistoryLoading(false);
      }
    })();

    void chatsApi.get(selectedChatId).then((chat) => {
      if (activeChatRef.current === selectedChatId) upsertChat(chat);
    }).catch(() => undefined);
  }, [selectedChatId, upsertChat]);

  useEffect(() => {
    if (!selectedChatId) return;
    setUnreadCounts((current) => {
      if (!current[selectedChatId]) return current;
      const remaining = { ...current };
      delete remaining[selectedChatId];
      return remaining;
    });
  }, [selectedChatId]);

  useEffect(() => {
    setMembersPanelOpen(selectedChat?.type === 'GROUP');
  }, [selectedChat?.id, selectedChat?.type]);

  async function loadOlderMessages() {
    const chatId = activeChatRef.current;
    if (!chatId || !nextBefore || olderLoading) return;
    setOlderLoading(true);
    try {
      const page = await messagesApi.history(chatId, nextBefore);
      if (activeChatRef.current !== chatId) return;
      setMessages((current) => mergeMessages(page.items, current));
      setHasMore(page.hasMore);
      setNextBefore(page.nextBefore);
    } catch (requestError) {
      setNotice(getErrorMessage(requestError, 'Не удалось загрузить предыдущие сообщения'));
    } finally {
      setOlderLoading(false);
    }
  }

  async function sendMessage(content: string) {
    const chatId = activeChatRef.current;
    const socket = socketRef.current;
    if (!chatId || !socket?.connected) {
      setNotice('Нет соединения с сервером. Дождитесь переподключения.');
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const pending: PendingMessage = {
      id: `pending:${clientMessageId}`,
      chatId,
      content,
      sender: user,
      createdAt: new Date().toISOString(),
      clientMessageId,
      deliveryStatus: 'sending',
    };
    setMessages((current) => mergeMessages(current, [pending]));

    try {
      const saved = await sendMessageWithRetry(socket, { chatId, content, clientMessageId });
      if (activeChatRef.current === chatId) {
        setMessages((current) => mergeMessages(
          current.filter((message) => message.clientMessageId !== clientMessageId && message.id !== pending.id),
          [saved],
        ));
      }
      updateLastMessage(saved);
    } catch (requestError) {
      setMessages((current) => current.map((message) => message.id === pending.id
        ? { ...pending, deliveryStatus: 'failed' }
        : message));
      setNotice(requestError instanceof Error ? requestError.message : 'Не удалось отправить сообщение');
    }
  }

  async function searchMessages(query: string) {
    const chatId = activeChatRef.current;
    if (!chatId || !query) return;
    setSearchLoading(true);
    try {
      const results = await messagesApi.search(chatId, query);
      if (activeChatRef.current === chatId) setSearchResults(results);
    } catch (requestError) {
      setNotice(getErrorMessage(requestError, 'Не удалось выполнить поиск'));
    } finally {
      setSearchLoading(false);
    }
  }

  function handleChatCreated(chat: Chat) {
    setDialog(null);
    upsertChat(chat);
    setSelectedChatId(chat.id);
    void refreshChats();
  }

  return (
    <main className={`messenger-shell ${membersPanelOpen && selectedChat?.type === 'GROUP' ? 'messenger-shell--with-members' : ''}`}>
      <ChatSidebar
        chats={chats}
        currentUser={user}
        selectedChatId={selectedChatId}
        unreadCounts={unreadCounts}
        loading={chatsLoading}
        onSelect={setSelectedChatId}
        onCreateDirect={() => setDialog('direct')}
        onCreateGroup={() => setDialog('group')}
        onLogout={logout}
      />

      <div className="messenger-main">
        {notice && (
          <button className="global-notice" type="button" onClick={() => setNotice('')} aria-label="Закрыть уведомление">
            <StatusNotice>{notice}</StatusNotice>
          </button>
        )}

        {selectedChat ? (
          <Conversation
            key={selectedChat.id}
            chat={selectedChat}
            currentUser={user}
            messages={messages.filter((message) => message.chatId === selectedChat.id)}
            historyLoading={historyLoading}
            olderLoading={olderLoading}
            hasMore={hasMore}
            socketStatus={socketStatus}
            searchResults={searchResults?.every((message) => message.chatId === selectedChat.id)
              ? searchResults
              : null}
            searchLoading={searchLoading}
            membersPanelOpen={membersPanelOpen}
            onLoadOlder={loadOlderMessages}
            onSend={sendMessage}
            onSearch={searchMessages}
            onClearSearch={() => setSearchResults(null)}
            onToggleMembers={() => setMembersPanelOpen((value) => !value)}
          />
        ) : (
          <section className="no-chat-selected">
            <div className="no-chat-selected__art">
              <LogoMark />
              <MessageIcon />
            </div>
            <h1>Выберите чат</h1>
            <p>Откройте диалог слева или начните новый разговор.</p>
            <div className="no-chat-selected__actions">
              <button className="button button--primary" type="button" onClick={() => setDialog('direct')}>Личный чат</button>
              <button className="button button--soft" type="button" onClick={() => setDialog('group')}>Создать группу</button>
            </div>
          </section>
        )}
      </div>

      {selectedChat?.type === 'GROUP' && (
        <MembersPanel
          chat={selectedChat}
          currentUser={user}
          open={membersPanelOpen}
          onClose={() => setMembersPanelOpen(false)}
          onChatUpdated={upsertChat}
        />
      )}

      {dialog === 'direct' && (
        <DirectChatModal currentUserId={user.id} onClose={() => setDialog(null)} onCreated={handleChatCreated} />
      )}
      {dialog === 'group' && (
        <GroupChatModal currentUserId={user.id} onClose={() => setDialog(null)} onCreated={handleChatCreated} />
      )}
    </main>
  );
}

export function MessengerPage() {
  const { user, token, logout } = useAuth();
  if (!user || !token) return null;
  return <MessengerWorkspace user={user} token={token} logout={logout} />;
}
