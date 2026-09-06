import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ChatMember } from '../chats/entities/chat-member.entity';
import { Chat } from '../chats/entities/chat.entity';
import { Message } from '../messages/entities/message.entity';
import { User } from '../users/entities/user.entity';
import { InitialSchema1736500000000 } from './migrations/1736500000000-InitialSchema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl,
  uuidExtension: 'pgcrypto',
  entities: [User, Chat, ChatMember, Message, AuditLog],
  migrations: [InitialSchema1736500000000],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

export default new DataSource(dataSourceOptions);
