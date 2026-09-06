import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChatsModule } from './chats/chats.module';
import { HealthController } from './health.controller';
import { MessagesModule } from './messages/messages.module';
import { UsersModule } from './users/users.module';
import { WebsocketModule } from './websocket/websocket.module';

function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (typeof config[key] !== 'string' || config[key] === '') {
      throw new Error(`${key} is required`);
    }
  }
  if ((config.JWT_SECRET as string).length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  const bcryptRounds = Number(config.BCRYPT_ROUNDS ?? 12);
  if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be an integer from 4 to 15');
  }
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        uuidExtension: 'pgcrypto' as const,
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get('TYPEORM_LOGGING') === 'true',
      }),
    }),
    AuditModule,
    UsersModule,
    AuthModule,
    ChatsModule,
    MessagesModule,
    WebsocketModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
