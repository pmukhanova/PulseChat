const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'E2E tests require TEST_DATABASE_URL pointing to a dedicated PostgreSQL database.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = 'pulse-chat-e2e-only-secret-at-least-32-characters';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '4';
process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:8080';
process.env.TYPEORM_LOGGING = 'false';
