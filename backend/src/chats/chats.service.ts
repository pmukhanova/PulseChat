import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ChatRole } from '../common/enums/chat-role.enum';
import { ChatType } from '../common/enums/chat-type.enum';
import { Message } from '../messages/entities/message.entity';
import { UsersService } from '../users/users.service';
import { RealtimeRegistryService } from '../websocket/realtime-registry.service';
import { AddMemberDto } from './dto/add-member.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateDirectChatDto } from './dto/create-direct-chat.dto';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatMember } from './entities/chat-member.entity';
import { Chat } from './entities/chat.entity';

export interface ChatMemberView {
  user: { id: string; username: string };
  role: ChatRole;
  joinedAt: Date;
}

export interface ChatView {
  id: string;
  type: ChatType;
  title: string;
  members: ChatMemberView[];
  currentUserRole: ChatRole;
  lastMessage: {
    id: string;
    content: string;
    sender: { id: string; username: string };
    createdAt: Date;
  } | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(Chat) private readonly chatsRepository: Repository<Chat>,
    @InjectRepository(ChatMember)
    private readonly membersRepository: Repository<ChatMember>,
    @InjectRepository(Message) private readonly messagesRepository: Repository<Message>,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => RealtimeRegistryService))
    private readonly realtimeRegistry: RealtimeRegistryService,
  ) {}

  async createDirect(userId: string, dto: CreateDirectChatDto): Promise<ChatView> {
    if (userId === dto.userId) {
      throw new BadRequestException('Нельзя создать личный чат с самим собой');
    }
    await this.usersService.requireById(dto.userId);
    const existing = await this.findDirectBetween(userId, dto.userId);
    if (existing) return this.getChat(existing.id, userId);

    const result = await this.chatsRepository.manager.transaction(async (manager) => {
      const pairKey = [userId, dto.userId].sort().join(':');
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [pairKey]);
      const concurrentExisting = await this.findDirectBetween(
        userId,
        dto.userId,
        manager.getRepository(Chat),
      );
      if (concurrentExisting) return { chatId: concurrentExisting.id, created: false };
      const chat = await manager.save(
        Chat,
        manager.create(Chat, { type: ChatType.DIRECT, title: null, createdById: userId }),
      );
      await manager.save(ChatMember, [
        manager.create(ChatMember, { chatId: chat.id, userId, role: ChatRole.MEMBER }),
        manager.create(ChatMember, {
          chatId: chat.id,
          userId: dto.userId,
          role: ChatRole.MEMBER,
        }),
      ]);
      return { chatId: chat.id, created: true };
    });
    if (result.created) {
      this.realtimeRegistry.emitChatListChanged([userId, dto.userId], result.chatId, 'CREATED');
    }
    return this.getChat(result.chatId, userId);
  }

  async createGroup(userId: string, dto: CreateGroupChatDto): Promise<ChatView> {
    const memberIds = [...new Set(dto.memberIds)].filter((id) => id !== userId);
    if (memberIds.length > 0) {
      await Promise.all(memberIds.map((memberId) => this.usersService.requireById(memberId)));
    }

    const chatId = await this.chatsRepository.manager.transaction(async (manager) => {
      const chat = await manager.save(
        Chat,
        manager.create(Chat, {
          type: ChatType.GROUP,
          title: dto.title,
          createdById: userId,
        }),
      );
      await manager.save(ChatMember, [
        manager.create(ChatMember, { chatId: chat.id, userId, role: ChatRole.OWNER }),
        ...memberIds.map((memberId) =>
          manager.create(ChatMember, {
            chatId: chat.id,
            userId: memberId,
            role: ChatRole.MEMBER,
          }),
        ),
      ]);
      return chat.id;
    });
    await this.auditService.record({
      userId,
      action: 'GROUP_CHAT_CREATED',
      entityType: 'CHAT',
      entityId: chatId,
      metadata: { title: dto.title, memberIds },
    });
    this.realtimeRegistry.emitChatListChanged([userId, ...memberIds], chatId, 'CREATED');
    return this.getChat(chatId, userId);
  }

  async listChats(userId: string): Promise<ChatView[]> {
    const memberships = await this.membersRepository.find({
      where: { userId },
      relations: { chat: { members: { user: true } } },
    });
    if (memberships.length === 0) return [];
    const chatIds = memberships.map((membership) => membership.chatId);
    const latestMessages = await this.messagesRepository
      .createQueryBuilder('message')
      .distinctOn(['message.chatId'])
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.chatId IN (:...chatIds)', { chatIds })
      .orderBy('message.chatId', 'ASC')
      .addOrderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .getMany();
    const latestByChat = new Map(latestMessages.map((message) => [message.chatId, message]));
    return memberships
      .map((membership) =>
        this.toView(membership.chat, userId, latestByChat.get(membership.chatId) ?? null),
      )
      .sort((left, right) => {
        const leftTime = left.lastMessageAt?.getTime() ?? left.createdAt.getTime();
        const rightTime = right.lastMessageAt?.getTime() ?? right.createdAt.getTime();
        return rightTime - leftTime || right.createdAt.getTime() - left.createdAt.getTime();
      });
  }

  async getChat(chatId: string, userId: string): Promise<ChatView> {
    const chat = await this.requireChatWithMembers(chatId, userId);
    const lastMessage = await this.messagesRepository.findOne({
      where: { chatId },
      relations: { sender: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return this.toView(chat, userId, lastMessage);
  }

  async rename(chatId: string, userId: string, dto: UpdateChatDto): Promise<ChatView> {
    const chat = await this.requireChatEntity(chatId);
    const actor = await this.requireMembership(chatId, userId);
    this.requireGroup(chat);
    this.requireManager(actor);
    chat.title = dto.title;
    await this.chatsRepository.save(chat);
    this.realtimeRegistry.emitChatDetailsChanged(
      await this.getMemberUserIds(chatId),
      chatId,
      'RENAMED',
    );
    return this.getChat(chatId, userId);
  }

  async getMembers(chatId: string, userId: string): Promise<ChatMemberView[]> {
    const chat = await this.requireChatWithMembers(chatId, userId);
    return chat.members
      .map((member) => this.toMemberView(member))
      .sort((a, b) => this.roleOrder(a.role) - this.roleOrder(b.role));
  }

  async addMember(chatId: string, actorId: string, dto: AddMemberDto): Promise<ChatMemberView> {
    const chat = await this.requireChatEntity(chatId);
    const actor = await this.requireMembership(chatId, actorId);
    this.requireGroup(chat);
    this.requireManager(actor);
    const user = await this.usersService.requireById(dto.userId);
    const existing = await this.membersRepository.findOneBy({ chatId, userId: dto.userId });
    if (existing) throw new ConflictException('Пользователь уже состоит в чате');
    let member: ChatMember;
    try {
      member = await this.membersRepository.save(
        this.membersRepository.create({ chatId, userId: dto.userId, role: ChatRole.MEMBER }),
      );
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Пользователь уже состоит в чате');
      }
      throw error;
    }
    member.user = user;
    await this.auditService.record({
      userId: actorId,
      action: 'CHAT_MEMBER_ADDED',
      entityType: 'CHAT',
      entityId: chatId,
      metadata: { memberId: dto.userId },
    });
    const memberIds = await this.getMemberUserIds(chatId);
    this.realtimeRegistry.emitChatListChanged([dto.userId], chatId, 'MEMBER_ADDED');
    this.realtimeRegistry.emitChatDetailsChanged(memberIds, chatId, 'MEMBER_ADDED');
    return this.toMemberView(member);
  }

  async removeMember(chatId: string, actorId: string, targetId: string): Promise<void> {
    const chat = await this.requireChatEntity(chatId);
    const actor = await this.requireMembership(chatId, actorId);
    const target = await this.requireMembership(chatId, targetId);
    this.requireGroup(chat);
    this.requireManager(actor);
    if (target.role === ChatRole.OWNER) throw new ForbiddenException('Владельца удалить нельзя');
    if (actor.role === ChatRole.ADMIN && target.role !== ChatRole.MEMBER) {
      throw new ForbiddenException('ADMIN может удалить только MEMBER');
    }
    await this.membersRepository.remove(target);
    await this.realtimeRegistry.evictUserFromChat(targetId, chatId);
    this.realtimeRegistry.emitChatDetailsChanged(
      await this.getMemberUserIds(chatId),
      chatId,
      'MEMBER_REMOVED',
    );
    await this.auditService.record({
      userId: actorId,
      action: 'CHAT_MEMBER_REMOVED',
      entityType: 'CHAT',
      entityId: chatId,
      metadata: { memberId: targetId },
    });
  }

  async changeRole(
    chatId: string,
    actorId: string,
    targetId: string,
    dto: ChangeRoleDto,
  ): Promise<ChatMemberView> {
    const chat = await this.requireChatEntity(chatId);
    const actor = await this.requireMembership(chatId, actorId);
    const target = await this.requireMembership(chatId, targetId);
    this.requireGroup(chat);
    if (actor.role !== ChatRole.OWNER) {
      throw new ForbiddenException('Только OWNER управляет ролями');
    }
    if (target.role === ChatRole.OWNER) throw new ForbiddenException('Роль OWNER изменить нельзя');
    target.role = dto.role;
    const saved = await this.membersRepository.save(target);
    saved.user = await this.usersService.requireById(targetId);
    await this.auditService.record({
      userId: actorId,
      action: 'CHAT_MEMBER_ROLE_CHANGED',
      entityType: 'CHAT',
      entityId: chatId,
      metadata: { memberId: targetId, role: dto.role },
    });
    this.realtimeRegistry.emitChatDetailsChanged(
      await this.getMemberUserIds(chatId),
      chatId,
      'ROLE_CHANGED',
    );
    return this.toMemberView(saved);
  }

  async getMemberUserIds(chatId: string): Promise<string[]> {
    const members = await this.membersRepository.find({
      where: { chatId },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  async requireMembership(chatId: string, userId: string): Promise<ChatMember> {
    const member = await this.membersRepository.findOne({
      where: { chatId, userId },
      relations: { user: true },
    });
    if (!member) throw new ForbiddenException('Нет доступа к этому чату');
    return member;
  }

  private async requireChatEntity(chatId: string): Promise<Chat> {
    const chat = await this.chatsRepository.findOneBy({ id: chatId });
    if (!chat) throw new NotFoundException('Чат не найден');
    return chat;
  }

  private async requireChatWithMembers(chatId: string, userId: string): Promise<Chat> {
    await this.requireChatEntity(chatId);
    await this.requireMembership(chatId, userId);
    const chat = await this.chatsRepository.findOne({
      where: { id: chatId },
      relations: { members: { user: true } },
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    return chat;
  }

  private requireGroup(chat: Chat): void {
    if (chat.type !== ChatType.GROUP) {
      throw new BadRequestException('Состав и название DIRECT-чата изменять нельзя');
    }
  }

  private requireManager(member: ChatMember): void {
    if (![ChatRole.OWNER, ChatRole.ADMIN].includes(member.role)) {
      throw new ForbiddenException('Недостаточно прав для управления группой');
    }
  }

  private async findDirectBetween(
    firstUserId: string,
    secondUserId: string,
    repository: Repository<Chat> = this.chatsRepository,
  ): Promise<Chat | null> {
    return repository
      .createQueryBuilder('chat')
      .innerJoin('chat_members', 'first', 'first.chat_id = chat.id AND first.user_id = :first', {
        first: firstUserId,
      })
      .innerJoin(
        'chat_members',
        'second',
        'second.chat_id = chat.id AND second.user_id = :second',
        {
          second: secondUserId,
        },
      )
      .leftJoin('chat_members', 'all_members', 'all_members.chat_id = chat.id')
      .where('chat.type = :type', { type: ChatType.DIRECT })
      .groupBy('chat.id')
      .having('COUNT(all_members.user_id) = 2')
      .getOne();
  }

  private toView(chat: Chat, userId: string, lastMessage: Message | null): ChatView {
    const currentMember = chat.members.find((member) => member.userId === userId);
    if (!currentMember) throw new ForbiddenException('Нет доступа к этому чату');
    const peer = chat.members.find((member) => member.userId !== userId);
    const title =
      chat.type === ChatType.DIRECT ? (peer?.user.username ?? 'Личный чат') : chat.title!;
    return {
      id: chat.id,
      type: chat.type,
      title,
      members: chat.members.map((member) => this.toMemberView(member)),
      currentUserRole: currentMember.role,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            sender: { id: lastMessage.sender.id, username: lastMessage.sender.username },
            createdAt: lastMessage.createdAt,
          }
        : null,
      lastMessageAt: lastMessage?.createdAt ?? null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  private toMemberView(member: ChatMember): ChatMemberView {
    return {
      user: { id: member.user.id, username: member.user.username },
      role: member.role,
      joinedAt: member.joinedAt,
    };
  }

  private roleOrder(role: ChatRole): number {
    return { [ChatRole.OWNER]: 0, [ChatRole.ADMIN]: 1, [ChatRole.MEMBER]: 2 }[role];
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
