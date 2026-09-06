import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { cleanDatabase, closeE2eContext, createE2eContext, E2eContext } from './support/test-app';

const PASSWORD = 'StrongPass123';
const ACK_TIMEOUT_MS = 4_000;

interface PublicUser {
  id: string;
  username: string;
}

interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

type ChatRole = 'OWNER' | 'ADMIN' | 'MEMBER';

interface ChatMemberResponse {
  user: PublicUser;
  role: ChatRole;
  joinedAt: string;
}

interface ChatResponse {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string;
  members: ChatMemberResponse[];
  currentUserRole: ChatRole;
  lastMessage: LastMessageResponse | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MessageResponse {
  id: string;
  chatId: string;
  content: string;
  clientMessageId: string;
  sender: PublicUser;
  createdAt: string;
}

interface LastMessageResponse {
  id: string;
  content: string;
  sender: PublicUser;
  createdAt: string;
}

interface HistoryResponse {
  items: MessageResponse[];
  hasMore: boolean;
  nextBefore: string | null;
}

interface ChatAck {
  ok: boolean;
  chatId?: string;
  error?: string;
}

interface SendMessageAck {
  ok: boolean;
  message?: MessageResponse;
  deduplicated?: boolean;
  error?: string;
}

interface ChatRoomPayload {
  chatId: string;
}

interface SendMessagePayload extends ChatRoomPayload {
  content: string;
  clientMessageId: string;
}

interface ChatListChangedEvent {
  chatId: string;
  reason: 'CREATED' | 'MEMBER_ADDED';
}

interface ChatDetailsChangedEvent {
  chatId: string;
  reason: 'RENAMED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'ROLE_CHANGED';
}

interface ChatAccessRevokedEvent {
  chatId: string;
}

interface ServerToClientEvents {
  message_created: (message: MessageResponse) => void;
  chat_list_changed: (event: ChatListChangedEvent) => void;
  chat_details_changed: (event: ChatDetailsChangedEvent) => void;
  chat_access_revoked: (event: ChatAccessRevokedEvent) => void;
}

interface ClientToServerEvents {
  join_chat: (payload: ChatRoomPayload, ack: (response: ChatAck) => void) => void;
  send_message: (payload: SendMessagePayload, ack: (response: SendMessageAck) => void) => void;
}

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface CountRow {
  count: string;
}

interface PasswordRow {
  password_hash: string;
}

interface MessageLocationRow {
  chat_id: string;
}

describe('PulseChat backend (e2e)', () => {
  let context: E2eContext;
  let app: INestApplication;
  let database: DataSource;
  let baseUrl: string;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    context = await createE2eContext();
    app = context.app;
    database = context.database;
    baseUrl = context.baseUrl;
  });

  beforeEach(async () => {
    disconnectAllSockets(sockets);
    await cleanDatabase(database);
  });

  afterAll(async () => {
    disconnectAllSockets(sockets);
    if (context) {
      await closeE2eContext(context);
    }
  });

  async function register(username: string, password = PASSWORD): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password })
      .expect(201);
    return response.body as AuthResponse;
  }

  async function createDirect(actor: AuthResponse, peerId: string): Promise<ChatResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/chats/direct')
      .set('Authorization', bearer(actor))
      .send({ userId: peerId })
      .expect(201);
    return response.body as ChatResponse;
  }

  async function createGroup(
    actor: AuthResponse,
    title: string,
    memberIds: string[],
  ): Promise<ChatResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/chats/group')
      .set('Authorization', bearer(actor))
      .send({ title, memberIds })
      .expect(201);
    return response.body as ChatResponse;
  }

  describe('authentication and validation', () => {
    it('registers a user, hashes the password and never returns the hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: 'alice', password: PASSWORD })
        .expect(201);
      const session = response.body as AuthResponse;

      expect(session.accessToken).toEqual(expect.any(String));
      expect(session.user).toEqual({ id: expect.any(String), username: 'alice' });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password_hash');

      const rows = await database.query<PasswordRow[]>(
        'SELECT password_hash FROM users WHERE id = $1',
        [session.user.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.password_hash).not.toBe(PASSWORD);
      expect(rows[0]?.password_hash).toMatch(/^\$2[aby]\$/);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', bearer(session))
        .expect(200)
        .expect(session.user);
    });

    it('returns 409 when username is registered twice', async () => {
      await register('duplicate');

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: 'duplicate', password: 'AnotherPass123' })
        .expect(409);
    });

    it('accepts a correct password and rejects an incorrect password', async () => {
      const registered = await register('login_user');

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'login_user', password: PASSWORD })
        .expect(200);
      const loggedIn = loginResponse.body as AuthResponse;
      expect(loggedIn.user).toEqual(registered.user);
      expect(loggedIn.accessToken).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'login_user', password: 'WrongPass123' })
        .expect(401);
    });

    it('rejects protected REST access without JWT and unknown request fields', async () => {
      await request(app.getHttpServer()).get('/api/chats').expect(401);
      await request(app.getHttpServer()).get('/api/users').expect(401);

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username: 'validation_user', password: PASSWORD, isAdmin: true })
        .expect(400);
    });
  });

  describe('chat access and roles', () => {
    it('creates one DIRECT chat for a pair and returns it for repeated requests', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const outsider = await register('outsider');

      const created = await createDirect(alice, bob.user.id);
      const repeated = await createDirect(alice, bob.user.id);
      const reverseDirection = await createDirect(bob, alice.user.id);

      expect(created.type).toBe('DIRECT');
      expect(created.title).toBe('bob');
      expect(created.currentUserRole).toBe('MEMBER');
      expect(created.members.map((member) => member.user.id).sort()).toEqual(
        [alice.user.id, bob.user.id].sort(),
      );
      expect(repeated.id).toBe(created.id);
      expect(reverseDirection.id).toBe(created.id);

      const rows = await database.query<CountRow[]>(
        `SELECT COUNT(*)::text AS count
         FROM chats
         WHERE type = 'DIRECT'`,
      );
      expect(rows[0]?.count).toBe('1');

      await request(app.getHttpServer())
        .get(`/api/chats/${created.id}`)
        .set('Authorization', bearer(outsider))
        .expect(403);

      const outsiderListResponse = await request(app.getHttpServer())
        .get('/api/chats')
        .set('Authorization', bearer(outsider))
        .expect(200);
      expect(outsiderListResponse.body).toEqual([]);

      await request(app.getHttpServer())
        .post('/api/chats/direct')
        .set('Authorization', bearer(alice))
        .send({ userId: alice.user.id })
        .expect(400);
    });

    it('serializes concurrent DIRECT creation for the same unordered user pair', async () => {
      const alice = await register('alice');
      const bob = await register('bob');

      const [aliceResponse, bobResponse] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/chats/direct')
          .set('Authorization', bearer(alice))
          .send({ userId: bob.user.id }),
        request(app.getHttpServer())
          .post('/api/chats/direct')
          .set('Authorization', bearer(bob))
          .send({ userId: alice.user.id }),
      ]);
      const aliceChat = aliceResponse.body as ChatResponse;
      const bobChat = bobResponse.body as ChatResponse;

      expect([aliceResponse.status, bobResponse.status]).toEqual([201, 201]);
      expect(aliceChat.id).toBe(bobChat.id);
      expect(aliceChat.title).toBe('bob');
      expect(bobChat.title).toBe('alice');

      const chatRows = await database.query<CountRow[]>(
        `SELECT COUNT(*)::text AS count
         FROM chats
         WHERE type = 'DIRECT'`,
      );
      const memberRows = await database.query<CountRow[]>(
        `SELECT COUNT(*)::text AS count
         FROM chat_members
         WHERE chat_id = $1`,
        [aliceChat.id],
      );
      expect(chatRows[0]?.count).toBe('1');
      expect(memberRows[0]?.count).toBe('2');
    });

    it('enforces GROUP roles for promotion, member addition and owner removal', async () => {
      const owner = await register('owner');
      const member = await register('member');
      const candidate = await register('candidate');
      const secondCandidate = await register('second_candidate');
      const outsider = await register('outsider');

      const createResponse = await request(app.getHttpServer())
        .post('/api/chats/group')
        .set('Authorization', bearer(owner))
        .send({
          title: 'Core team',
          memberIds: [member.user.id, member.user.id, owner.user.id],
        })
        .expect(201);
      const group = createResponse.body as ChatResponse;

      expect(group.type).toBe('GROUP');
      expect(group.currentUserRole).toBe('OWNER');
      expect(group.members).toHaveLength(2);
      expect(group.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ user: owner.user, role: 'OWNER' }),
          expect.objectContaining({ user: member.user, role: 'MEMBER' }),
        ]),
      );

      await request(app.getHttpServer())
        .post(`/api/chats/${group.id}/members`)
        .set('Authorization', bearer(member))
        .send({ userId: candidate.user.id })
        .expect(403);

      const roleResponse = await request(app.getHttpServer())
        .patch(`/api/chats/${group.id}/members/${member.user.id}/role`)
        .set('Authorization', bearer(owner))
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(roleResponse.body).toEqual(
        expect.objectContaining({ user: member.user, role: 'ADMIN' }),
      );

      const addedResponse = await request(app.getHttpServer())
        .post(`/api/chats/${group.id}/members`)
        .set('Authorization', bearer(member))
        .send({ userId: candidate.user.id })
        .expect(201);
      expect(addedResponse.body).toEqual(
        expect.objectContaining({ user: candidate.user, role: 'MEMBER' }),
      );

      await request(app.getHttpServer())
        .delete(`/api/chats/${group.id}/members/${owner.user.id}`)
        .set('Authorization', bearer(member))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/chats/${group.id}/members`)
        .set('Authorization', bearer(outsider))
        .send({ userId: secondCandidate.user.id })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/chats/${group.id}`)
        .set('Authorization', bearer(outsider))
        .expect(403);

      const outsiderChats = await request(app.getHttpServer())
        .get('/api/chats')
        .set('Authorization', bearer(outsider))
        .expect(200);
      expect(outsiderChats.body).toEqual([]);
    });

    it('maps concurrent member insertion to one 201 and one 409 response', async () => {
      const owner = await register('owner');
      const candidate = await register('candidate');
      const createResponse = await request(app.getHttpServer())
        .post('/api/chats/group')
        .set('Authorization', bearer(owner))
        .send({ title: 'Concurrent additions', memberIds: [] })
        .expect(201);
      const group = createResponse.body as ChatResponse;

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/chats/${group.id}/members`)
          .set('Authorization', bearer(owner))
          .send({ userId: candidate.user.id }),
        request(app.getHttpServer())
          .post(`/api/chats/${group.id}/members`)
          .set('Authorization', bearer(owner))
          .send({ userId: candidate.user.id }),
      ]);

      expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const conflict = responses.find((response) => response.status === 409);
      expect(conflict?.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          message: 'Пользователь уже состоит в чате',
        }),
      );

      const memberRows = await database.query<CountRow[]>(
        `SELECT COUNT(*)::text AS count
         FROM chat_members
         WHERE chat_id = $1 AND user_id = $2`,
        [group.id, candidate.user.id],
      );
      const auditRows = await database.query<CountRow[]>(
        `SELECT COUNT(*)::text AS count
         FROM audit_logs
         WHERE action = 'CHAT_MEMBER_ADDED'
           AND entity_id = $1
           AND metadata ->> 'memberId' = $2`,
        [group.id, candidate.user.id],
      );
      expect(memberRows[0]?.count).toBe('1');
      expect(auditRows[0]?.count).toBe('1');
    });
  });

  describe('message history and search', () => {
    it('returns cursor pages in chronological display order to chat members only', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const outsider = await register('outsider');
      const chat = await createDirect(alice, bob.user.id);
      const firstId = randomUUID();
      const secondId = randomUUID();
      const thirdId = randomUUID();

      await insertMessage(database, {
        id: firstId,
        chatId: chat.id,
        senderId: alice.user.id,
        content: 'First page anchor',
        createdAt: '2026-01-01T10:00:00.000Z',
      });
      await insertMessage(database, {
        id: secondId,
        chatId: chat.id,
        senderId: bob.user.id,
        content: 'Second message',
        createdAt: '2026-01-01T10:01:00.000Z',
      });
      await insertMessage(database, {
        id: thirdId,
        chatId: chat.id,
        senderId: alice.user.id,
        content: 'Third message',
        createdAt: '2026-01-01T10:02:00.000Z',
      });

      const firstPageResponse = await request(app.getHttpServer())
        .get(`/api/chats/${chat.id}/messages`)
        .set('Authorization', bearer(alice))
        .query({ limit: 2 })
        .expect(200);
      const firstPage = firstPageResponse.body as HistoryResponse;
      expect(firstPage.items.map((message) => message.id)).toEqual([secondId, thirdId]);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextBefore).toBe(secondId);

      const olderPageResponse = await request(app.getHttpServer())
        .get(`/api/chats/${chat.id}/messages`)
        .set('Authorization', bearer(alice))
        .query({ before: firstPage.nextBefore, limit: 2 })
        .expect(200);
      const olderPage = olderPageResponse.body as HistoryResponse;
      expect(olderPage.items.map((message) => message.id)).toEqual([firstId]);
      expect(olderPage.hasMore).toBe(false);
      expect(olderPage.nextBefore).toBeNull();

      await request(app.getHttpServer())
        .get(`/api/chats/${chat.id}/messages`)
        .set('Authorization', bearer(outsider))
        .expect(403);
    });

    it('searches case-insensitively inside one chat and denies outsiders', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const outsider = await register('outsider');
      const chat = await createDirect(alice, bob.user.id);
      const olderMatchId = randomUUID();
      const nonMatchId = randomUUID();
      const newerMatchId = randomUUID();

      await insertMessage(database, {
        id: olderMatchId,
        chatId: chat.id,
        senderId: alice.user.id,
        content: 'ПЛАН запуска продукта',
        createdAt: '2026-01-01T10:00:00.000Z',
      });
      await insertMessage(database, {
        id: nonMatchId,
        chatId: chat.id,
        senderId: bob.user.id,
        content: 'Обычное сообщение',
        createdAt: '2026-01-01T10:01:00.000Z',
      });
      await insertMessage(database, {
        id: newerMatchId,
        chatId: chat.id,
        senderId: bob.user.id,
        content: 'Обновлённый План встречи',
        createdAt: '2026-01-01T10:02:00.000Z',
      });

      const searchResponse = await request(app.getHttpServer())
        .get(`/api/chats/${chat.id}/messages/search`)
        .set('Authorization', bearer(alice))
        .query({ q: 'пЛаН', limit: 10 })
        .expect(200);
      const matches = searchResponse.body as MessageResponse[];
      expect(matches.map((message) => message.id)).toEqual([newerMatchId, olderMatchId]);
      expect(matches[0]?.sender).toEqual(bob.user);
      expect(matches.some((message) => message.id === nonMatchId)).toBe(false);

      await request(app.getHttpServer())
        .get(`/api/chats/${chat.id}/messages/search`)
        .set('Authorization', bearer(outsider))
        .query({ q: 'план' })
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/chats/${chat.id}/messages/search`)
        .set('Authorization', bearer(alice))
        .query({ q: '   ' })
        .expect(400);
    });
  });

  describe('Socket.IO realtime delivery', () => {
    it('rejects a WebSocket handshake with an invalid JWT', async () => {
      const socket = io(baseUrl, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        autoConnect: false,
        auth: { token: 'not-a-jwt' },
      }) as TestSocket;
      sockets.push(socket);

      const error = await waitForConnectionError(socket);
      expect(error.message).toBe('Unauthorized WebSocket connection');
      expect(socket.connected).toBe(false);
    });

    it('returns an error ack for an invalid WebSocket DTO instead of timing out', async () => {
      const alice = await register('alice');
      const socket = await connectSocket(baseUrl, alice.accessToken);
      sockets.push(socket);

      const ack = await joinChat(socket, 'not-a-uuid');

      expect(ack.ok).toBe(false);
      expect(ack.chatId).toBeUndefined();
      expect(ack.error).toContain('chatId must be a UUID');
    });

    it('delivers a message through a personal room without join_chat', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const chat = await createDirect(alice, bob.user.id);
      const aliceSocket = await connectSocket(baseUrl, alice.accessToken);
      const bobSocket = await connectSocket(baseUrl, bob.accessToken);
      sockets.push(aliceSocket, bobSocket);

      const receivedPromise = waitForMessage(bobSocket);
      const ack = await sendMessage(aliceSocket, {
        chatId: chat.id,
        content: 'Personal room delivery',
        clientMessageId: randomUUID(),
      });

      await expect(receivedPromise).resolves.toEqual(ack.message);
    });

    it('notifies the second online user when a new DIRECT chat is created', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const bobSocket = await connectSocket(baseUrl, bob.accessToken);
      sockets.push(bobSocket);

      const changedPromise = waitForChatListChanged(bobSocket);
      const chat = await createDirect(alice, bob.user.id);

      await expect(changedPromise).resolves.toEqual({ chatId: chat.id, reason: 'CREATED' });
    });

    it('notifies added online users when a GROUP chat is created', async () => {
      const owner = await register('owner');
      const member = await register('member');
      const memberSocket = await connectSocket(baseUrl, member.accessToken);
      sockets.push(memberSocket);

      const changedPromise = waitForChatListChanged(memberSocket);
      const chat = await createGroup(owner, 'Realtime group', [member.user.id]);

      await expect(changedPromise).resolves.toEqual({ chatId: chat.id, reason: 'CREATED' });
    });

    it('notifies the target online user about a ROLE_CHANGED detail invalidation', async () => {
      const owner = await register('owner');
      const member = await register('member');
      const group = await createGroup(owner, 'Roles group', [member.user.id]);
      const memberSocket = await connectSocket(baseUrl, member.accessToken);
      sockets.push(memberSocket);

      const changedPromise = waitForChatDetailsChanged(memberSocket);
      await request(app.getHttpServer())
        .patch(`/api/chats/${group.id}/members/${member.user.id}/role`)
        .set('Authorization', bearer(owner))
        .send({ role: 'ADMIN' })
        .expect(200);

      await expect(changedPromise).resolves.toEqual({ chatId: group.id, reason: 'ROLE_CHANGED' });
    });

    it('notifies the added user and existing members after addMember', async () => {
      const owner = await register('owner');
      const existing = await register('existing');
      const added = await register('added');
      const group = await createGroup(owner, 'Membership group', [existing.user.id]);
      const existingSocket = await connectSocket(baseUrl, existing.accessToken);
      const addedSocket = await connectSocket(baseUrl, added.accessToken);
      sockets.push(existingSocket, addedSocket);

      const listChangedPromise = waitForChatListChanged(addedSocket);
      const detailsChangedPromise = waitForChatDetailsChanged(existingSocket);
      await request(app.getHttpServer())
        .post(`/api/chats/${group.id}/members`)
        .set('Authorization', bearer(owner))
        .send({ userId: added.user.id })
        .expect(201);

      await expect(listChangedPromise).resolves.toEqual({
        chatId: group.id,
        reason: 'MEMBER_ADDED',
      });
      await expect(detailsChangedPromise).resolves.toEqual({
        chatId: group.id,
        reason: 'MEMBER_ADDED',
      });
    });

    it('notifies online members after a group rename', async () => {
      const owner = await register('owner');
      const member = await register('member');
      const group = await createGroup(owner, 'Before rename', [member.user.id]);
      const memberSocket = await connectSocket(baseUrl, member.accessToken);
      sockets.push(memberSocket);

      const changedPromise = waitForChatDetailsChanged(memberSocket);
      await request(app.getHttpServer())
        .patch(`/api/chats/${group.id}`)
        .set('Authorization', bearer(owner))
        .send({ title: 'After rename' })
        .expect(200);

      await expect(changedPromise).resolves.toEqual({ chatId: group.id, reason: 'RENAMED' });
    });

    it('notifies the removed user and remaining members after removeMember', async () => {
      const owner = await register('owner');
      const member = await register('member');
      const group = await createGroup(owner, 'Removal group', [member.user.id]);
      const ownerSocket = await connectSocket(baseUrl, owner.accessToken);
      const memberSocket = await connectSocket(baseUrl, member.accessToken);
      sockets.push(ownerSocket, memberSocket);

      const revokedPromise = waitForChatAccessRevoked(memberSocket);
      const detailsChangedPromise = waitForChatDetailsChanged(ownerSocket);
      await request(app.getHttpServer())
        .delete(`/api/chats/${group.id}/members/${member.user.id}`)
        .set('Authorization', bearer(owner))
        .expect(204);

      await expect(revokedPromise).resolves.toEqual({ chatId: group.id });
      await expect(detailsChangedPromise).resolves.toEqual({
        chatId: group.id,
        reason: 'MEMBER_REMOVED',
      });
    });

    it('returns a conflict ack when one clientMessageId is reused in another chat', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const carol = await register('carol');
      const firstChat = await createDirect(alice, bob.user.id);
      const secondChat = await createDirect(alice, carol.user.id);
      const socket = await connectSocket(baseUrl, alice.accessToken);
      sockets.push(socket);
      await expect(joinChat(socket, firstChat.id)).resolves.toEqual({
        ok: true,
        chatId: firstChat.id,
      });
      await expect(joinChat(socket, secondChat.id)).resolves.toEqual({
        ok: true,
        chatId: secondChat.id,
      });

      const clientMessageId = randomUUID();
      const firstAck = await sendMessage(socket, {
        chatId: firstChat.id,
        content: 'Message in the first chat',
        clientMessageId,
      });
      expect(firstAck).toEqual(
        expect.objectContaining({
          ok: true,
          deduplicated: false,
          message: expect.objectContaining({ chatId: firstChat.id, clientMessageId }),
        }),
      );

      const conflictAck = await sendMessage(socket, {
        chatId: secondChat.id,
        content: 'Must not leak into the second chat',
        clientMessageId,
      });

      expect(conflictAck).toEqual({
        ok: false,
        error: 'clientMessageId уже использован отправителем в другом чате',
      });
      const rows = await database.query<MessageLocationRow[]>(
        `SELECT chat_id
         FROM messages
         WHERE sender_id = $1 AND client_message_id = $2`,
        [alice.user.id, clientMessageId],
      );
      expect(rows).toEqual([{ chat_id: firstChat.id }]);
    });

    it('delivers a persisted message to a second client, acks the sender and deduplicates retries', async () => {
      const alice = await register('alice');
      const bob = await register('bob');
      const chat = await createDirect(alice, bob.user.id);
      const aliceSocket = await connectSocket(baseUrl, alice.accessToken);
      sockets.push(aliceSocket);
      const bobSocket = await connectSocket(baseUrl, bob.accessToken);
      sockets.push(bobSocket);

      await expect(joinChat(aliceSocket, chat.id)).resolves.toEqual({
        ok: true,
        chatId: chat.id,
      });
      await expect(joinChat(bobSocket, chat.id)).resolves.toEqual({
        ok: true,
        chatId: chat.id,
      });

      const clientMessageId = randomUUID();
      const receivedMessages: MessageResponse[] = [];
      bobSocket.on('message_created', (message) => receivedMessages.push(message));
      const receivedPromise = waitForMessage(bobSocket);

      const firstAck = await sendMessage(aliceSocket, {
        chatId: chat.id,
        content: 'Persist before broadcasting',
        clientMessageId,
      });
      const received = await receivedPromise;

      expect(firstAck.ok).toBe(true);
      expect(firstAck.deduplicated).toBe(false);
      expect(firstAck.message).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          chatId: chat.id,
          content: 'Persist before broadcasting',
          clientMessageId,
          sender: alice.user,
          createdAt: expect.any(String),
        }),
      );
      expect(received).toEqual(firstAck.message);

      const persistedBeforeRetry = await database.query<CountRow[]>(
        `SELECT COUNT(*)::text AS count
         FROM messages
         WHERE sender_id = $1 AND client_message_id = $2`,
        [alice.user.id, clientMessageId],
      );
      expect(persistedBeforeRetry[0]?.count).toBe('1');

      const duplicateAck = await sendMessage(aliceSocket, {
        chatId: chat.id,
        content: 'This retry must not overwrite the original',
        clientMessageId,
      });
      await delay(100);

      expect(duplicateAck.ok).toBe(true);
      expect(duplicateAck.deduplicated).toBe(true);
      expect(duplicateAck.message).toEqual(firstAck.message);
      expect(receivedMessages).toEqual([received]);

      const persistedAfterRetry = await database.query<Array<CountRow & { content: string }>>(
        `SELECT COUNT(*)::text AS count, MIN(content) AS content
         FROM messages
         WHERE sender_id = $1 AND client_message_id = $2`,
        [alice.user.id, clientMessageId],
      );
      expect(persistedAfterRetry[0]).toEqual({
        count: '1',
        content: 'Persist before broadcasting',
      });
    });
  });
});

function bearer(session: AuthResponse): string {
  return `Bearer ${session.accessToken}`;
}

async function insertMessage(
  database: DataSource,
  input: {
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    createdAt: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO messages (id, chat_id, sender_id, content, client_message_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.id, input.chatId, input.senderId, input.content, randomUUID(), input.createdAt],
  );
}

async function connectSocket(baseUrl: string, token: string): Promise<TestSocket> {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
    auth: { token },
  }) as TestSocket;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      socket.disconnect();
      reject(new Error('Timed out while connecting Socket.IO test client'));
    }, ACK_TIMEOUT_MS);
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      socket.disconnect();
      reject(error);
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });

  return socket;
}

async function waitForConnectionError(socket: TestSocket): Promise<Error> {
  return new Promise<Error>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      socket.disconnect();
      reject(new Error('Expected Socket.IO connection to be rejected'));
    }, ACK_TIMEOUT_MS);
    const onConnect = (): void => {
      cleanup();
      socket.disconnect();
      reject(new Error('Socket.IO connection unexpectedly succeeded'));
    };
    const onError = (error: Error): void => {
      cleanup();
      resolve(error);
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });
}

async function joinChat(socket: TestSocket, chatId: string): Promise<ChatAck> {
  return new Promise<ChatAck>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('join_chat ack timed out')), ACK_TIMEOUT_MS);
    socket.emit('join_chat', { chatId }, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function sendMessage(
  socket: TestSocket,
  payload: SendMessagePayload,
): Promise<SendMessageAck> {
  return new Promise<SendMessageAck>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('send_message ack timed out')), ACK_TIMEOUT_MS);
    socket.emit('send_message', payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function waitForMessage(socket: TestSocket): Promise<MessageResponse> {
  return new Promise<MessageResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message_created', onMessage);
      reject(new Error('message_created event timed out'));
    }, ACK_TIMEOUT_MS);
    const onMessage = (message: MessageResponse): void => {
      clearTimeout(timer);
      socket.off('message_created', onMessage);
      resolve(message);
    };
    socket.on('message_created', onMessage);
  });
}

function waitForChatListChanged(socket: TestSocket): Promise<ChatListChangedEvent> {
  return waitForSocketEvent<ChatListChangedEvent>(socket, 'chat_list_changed');
}

function waitForChatDetailsChanged(socket: TestSocket): Promise<ChatDetailsChangedEvent> {
  return waitForSocketEvent<ChatDetailsChangedEvent>(socket, 'chat_details_changed');
}

function waitForChatAccessRevoked(socket: TestSocket): Promise<ChatAccessRevokedEvent> {
  return waitForSocketEvent<ChatAccessRevokedEvent>(socket, 'chat_access_revoked');
}

function waitForSocketEvent<T>(socket: TestSocket, event: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const untypedSocket = socket as Socket;
    const onEvent = (payload: T): void => {
      clearTimeout(timer);
      untypedSocket.off(event, onEvent);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      untypedSocket.off(event, onEvent);
      reject(new Error(`${event} event timed out`));
    }, ACK_TIMEOUT_MS);
    untypedSocket.on(event, onEvent);
  });
}

function disconnectAllSockets(sockets: TestSocket[]): void {
  for (const socket of sockets.splice(0)) {
    socket.removeAllListeners();
    socket.disconnect();
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
