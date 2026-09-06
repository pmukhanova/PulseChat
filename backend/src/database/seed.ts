import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import { User } from '../users/entities/user.entity';
import { Chat } from '../chats/entities/chat.entity';
import { ChatMember } from '../chats/entities/chat-member.entity';
import { Message } from '../messages/entities/message.entity';
import { ChatType } from '../common/enums/chat-type.enum';
import { ChatRole } from '../common/enums/chat-role.enum';

const DEMO_PASSWORD = 'Demo12345';

async function ensureUser(username: string, passwordHash: string): Promise<User> {
  const repository = dataSource.getRepository(User);
  const existing = await repository.findOneBy({ username });
  if (existing) {
    existing.passwordHash = passwordHash;
    return repository.save(existing);
  }
  return repository.save(repository.create({ username, passwordHash }));
}

async function ensureDirectChat(andrey: User, maria: User): Promise<Chat> {
  const chatRepository = dataSource.getRepository(Chat);
  const existing = await chatRepository
    .createQueryBuilder('chat')
    .innerJoin('chat_members', 'a', 'a.chat_id = chat.id AND a.user_id = :andrey', {
      andrey: andrey.id,
    })
    .innerJoin('chat_members', 'm', 'm.chat_id = chat.id AND m.user_id = :maria', {
      maria: maria.id,
    })
    .where('chat.type = :type', { type: ChatType.DIRECT })
    .getOne();
  if (existing) return existing;

  return dataSource.transaction(async (manager) => {
    const chat = await manager.save(
      Chat,
      manager.create(Chat, {
        type: ChatType.DIRECT,
        title: null,
        createdById: andrey.id,
      }),
    );
    await manager.save(ChatMember, [
      manager.create(ChatMember, {
        chatId: chat.id,
        userId: andrey.id,
        role: ChatRole.MEMBER,
      }),
      manager.create(ChatMember, {
        chatId: chat.id,
        userId: maria.id,
        role: ChatRole.MEMBER,
      }),
    ]);
    return chat;
  });
}

async function ensureGroupChat(andrey: User, maria: User, ivan: User): Promise<Chat> {
  const chats = dataSource.getRepository(Chat);
  let chat = await chats.findOneBy({
    type: ChatType.GROUP,
    title: 'Команда Pulse',
    createdById: andrey.id,
  });
  if (!chat) {
    chat = await chats.save(
      chats.create({
        type: ChatType.GROUP,
        title: 'Команда Pulse',
        createdById: andrey.id,
      }),
    );
  }
  const members = dataSource.getRepository(ChatMember);
  await members.upsert(
    [
      { chatId: chat.id, userId: andrey.id, role: ChatRole.OWNER },
      { chatId: chat.id, userId: maria.id, role: ChatRole.ADMIN },
      { chatId: chat.id, userId: ivan.id, role: ChatRole.MEMBER },
    ],
    ['chatId', 'userId'],
  );
  return chat;
}

function deterministicClientId(sequence: number): string {
  return `10000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

async function ensureMessage(
  chat: Chat,
  sender: User,
  content: string,
  sequence: number,
  createdAt: Date,
): Promise<void> {
  const repository = dataSource.getRepository(Message);
  const clientMessageId = deterministicClientId(sequence);
  const existing = await repository.findOneBy({ senderId: sender.id, clientMessageId });
  if (existing) return;
  await repository.save(
    repository.create({
      chatId: chat.id,
      senderId: sender.id,
      content,
      clientMessageId,
      createdAt,
    }),
  );
}

async function seed(): Promise<void> {
  await dataSource.initialize();
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const [andrey, maria, ivan, olga] = await Promise.all(
    ['andrey', 'maria', 'ivan', 'olga'].map(async (username) =>
      ensureUser(username, await bcrypt.hash(DEMO_PASSWORD, rounds)),
    ),
  );
  if (!andrey || !maria || !ivan || !olga) throw new Error('Failed to create demo users');

  const direct = await ensureDirectChat(andrey, maria);
  const group = await ensureGroupChat(andrey, maria, ivan);
  const baseTime = Date.now() - 60 * 60 * 1000;

  await ensureMessage(
    direct,
    andrey,
    'Привет! Проверяем личный чат PulseChat.',
    1,
    new Date(baseTime),
  );
  await ensureMessage(
    direct,
    maria,
    'Привет! Сообщения приходят в реальном времени.',
    2,
    new Date(baseTime + 60_000),
  );

  const phrases = [
    'Обсуждаем план демонстрации проекта.',
    'Проверяем историю сообщений с пагинацией вверх.',
    'Ключевое слово для поиска: архитектура.',
    'Распределяем задачи перед вводной встречей.',
    'WebSocket сохраняет сообщение до отправки в комнату.',
  ];
  const senders = [andrey, maria, ivan];
  for (let index = 0; index < 45; index += 1) {
    const sender = senders[index % senders.length]!;
    const content = `${index + 1}. ${phrases[index % phrases.length]}`;
    await ensureMessage(
      group,
      sender,
      content,
      100 + index,
      new Date(baseTime + (index + 2) * 60_000),
    );
  }

  console.log('Seed completed. Demo users: andrey, maria, ivan, olga / Demo12345');
  console.log(`Direct chat: ${direct.id}; group chat: ${group.id}; olga is available to add.`);
  await dataSource.destroy();
}

seed().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
