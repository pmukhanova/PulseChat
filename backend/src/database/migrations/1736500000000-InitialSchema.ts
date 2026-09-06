import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1736500000000 implements MigrationInterface {
  name = 'InitialSchema1736500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query("CREATE TYPE chat_type_enum AS ENUM ('DIRECT', 'GROUP')");
    await queryRunner.query(
      "CREATE TYPE chat_member_role_enum AS ENUM ('OWNER', 'ADMIN', 'MEMBER')",
    );
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(32) NOT NULL,
        password_hash varchar(100) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_username UNIQUE (username),
        CONSTRAINT chk_users_username_length CHECK (char_length(btrim(username)) BETWEEN 3 AND 32)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE chats (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type chat_type_enum NOT NULL,
        title varchar(100),
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_chats_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT chk_chats_title CHECK (
          (type = 'DIRECT' AND title IS NULL) OR
          (type = 'GROUP' AND title IS NOT NULL AND char_length(btrim(title)) BETWEEN 1 AND 100)
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE chat_members (
        chat_id uuid NOT NULL,
        user_id uuid NOT NULL,
        role chat_member_role_enum NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_chat_members PRIMARY KEY (chat_id, user_id),
        CONSTRAINT fk_chat_members_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_chat_members_user_chat ON chat_members (user_id, chat_id)',
    );
    await queryRunner.query(`
      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id uuid NOT NULL,
        sender_id uuid NOT NULL,
        content text NOT NULL,
        client_message_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_messages_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT uq_messages_sender_client_id UNIQUE (sender_id, client_message_id),
        CONSTRAINT chk_messages_content CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_messages_chat_created_id ON messages (chat_id, created_at DESC, id DESC)',
    );
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        action varchar(80) NOT NULL,
        entity_type varchar(50) NOT NULL,
        entity_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_logs_created_at');
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query('DROP INDEX IF EXISTS idx_messages_chat_created_id');
    await queryRunner.query('DROP TABLE IF EXISTS messages');
    await queryRunner.query('DROP INDEX IF EXISTS idx_chat_members_user_chat');
    await queryRunner.query('DROP TABLE IF EXISTS chat_members');
    await queryRunner.query('DROP TABLE IF EXISTS chats');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP TYPE IF EXISTS chat_member_role_enum');
    await queryRunner.query('DROP TYPE IF EXISTS chat_type_enum');
  }
}
