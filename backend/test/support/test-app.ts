import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import migrationDataSource from '../../src/database/data-source';

export interface E2eContext {
  app: INestApplication;
  baseUrl: string;
  database: DataSource;
}

export async function createE2eContext(): Promise<E2eContext> {
  if (!migrationDataSource.isInitialized) {
    await migrationDataSource.initialize();
  }
  await migrationDataSource.runMigrations({ transaction: 'all' });

  let app: INestApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.enableCors({ origin: ['http://127.0.0.1:8080'], credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.listen(0, '127.0.0.1');

    return {
      app,
      baseUrl: await app.getUrl(),
      database: migrationDataSource,
    };
  } catch (error: unknown) {
    if (app) {
      await app.close();
    }
    if (migrationDataSource.isInitialized) {
      await migrationDataSource.destroy();
    }
    throw error;
  }
}

export async function cleanDatabase(database: DataSource): Promise<void> {
  await database.query(
    'TRUNCATE TABLE audit_logs, messages, chat_members, chats, users RESTART IDENTITY CASCADE',
  );
}

export async function closeE2eContext(context: E2eContext): Promise<void> {
  try {
    await context.app.close();
  } finally {
    if (context.database.isInitialized) {
      await context.database.destroy();
    }
  }
}
