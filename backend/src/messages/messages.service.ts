import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatsService } from '../chats/chats.service';
import { SendMessageDto } from './dto/send-message.dto';
import { Message } from './entities/message.entity';

export interface MessageView {
  id: string;
  chatId: string;
  content: string;
  clientMessageId: string;
  sender: { id: string; username: string };
  createdAt: Date;
}

export interface CreateMessageResult {
  message: MessageView;
  deduplicated: boolean;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @Inject(forwardRef(() => ChatsService))
    private readonly chatsService: ChatsService,
  ) {}

  async history(
    chatId: string,
    userId: string,
    before: string | undefined,
    limit: number,
  ): Promise<{ items: MessageView[]; hasMore: boolean; nextBefore: string | null }> {
    await this.chatsService.requireMembership(chatId, userId);
    const query = this.messagesRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.chatId = :chatId', { chatId });

    if (before) {
      const cursor = await this.messagesRepository.findOneBy({ id: before, chatId });
      if (!cursor) throw new BadRequestException('Курсор before не найден в этом чате');
      query.andWhere(
        '(message.createdAt < :cursorTime OR (message.createdAt = :cursorTime AND message.id < :cursorId))',
        { cursorTime: cursor.createdAt, cursorId: cursor.id },
      );
    }

    const rows = await query
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(limit + 1)
      .getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    const items = page.map((message) => this.toView(message));
    return {
      items,
      hasMore,
      nextBefore: hasMore && items.length > 0 ? items[0]!.id : null,
    };
  }

  async search(
    chatId: string,
    userId: string,
    text: string,
    limit: number,
  ): Promise<MessageView[]> {
    await this.chatsService.requireMembership(chatId, userId);
    const messages = await this.messagesRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.chatId = :chatId', { chatId })
      .andWhere('message.content ILIKE :query', { query: `%${text}%` })
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(limit)
      .getMany();
    return messages.map((message) => this.toView(message));
  }

  async create(userId: string, dto: SendMessageDto): Promise<CreateMessageResult> {
    await this.chatsService.requireMembership(dto.chatId, userId);
    const existing = await this.findByClientId(userId, dto.clientMessageId);
    if (existing) {
      this.requireSameChat(existing, dto.chatId);
      return { message: this.toView(existing), deduplicated: true };
    }

    try {
      const saved = await this.messagesRepository.save(
        this.messagesRepository.create({
          chatId: dto.chatId,
          senderId: userId,
          content: dto.content,
          clientMessageId: dto.clientMessageId,
        }),
      );
      const complete = await this.messagesRepository.findOneOrFail({
        where: { id: saved.id },
        relations: { sender: true },
      });
      return { message: this.toView(complete), deduplicated: false };
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
      const duplicate = await this.findByClientId(userId, dto.clientMessageId);
      if (!duplicate) throw error;
      this.requireSameChat(duplicate, dto.chatId);
      return { message: this.toView(duplicate), deduplicated: true };
    }
  }

  private findByClientId(senderId: string, clientMessageId: string): Promise<Message | null> {
    return this.messagesRepository.findOne({
      where: { senderId, clientMessageId },
      relations: { sender: true },
    });
  }

  private toView(message: Message): MessageView {
    return {
      id: message.id,
      chatId: message.chatId,
      content: message.content,
      clientMessageId: message.clientMessageId,
      sender: { id: message.sender.id, username: message.sender.username },
      createdAt: message.createdAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private requireSameChat(message: Message, chatId: string): void {
    if (message.chatId !== chatId) {
      throw new ConflictException('clientMessageId уже использован отправителем в другом чате');
    }
  }
}
