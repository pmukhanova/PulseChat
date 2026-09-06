import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ChatRole } from '../../common/enums/chat-role.enum';
import { User } from '../../users/entities/user.entity';
import { Chat } from './chat.entity';

@Entity({ name: 'chat_members' })
@Index('idx_chat_members_user_chat', ['userId', 'chatId'])
export class ChatMember {
  @PrimaryColumn({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ChatRole, enumName: 'chat_member_role_enum' })
  role: ChatRole;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt: Date;

  @ManyToOne(() => Chat, (chat) => chat.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: Chat;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
