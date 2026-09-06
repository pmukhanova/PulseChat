import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { HistoryQueryDto } from './dto/history-query.dto';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Нет доступа к чату' })
@UseGuards(JwtAuthGuard)
@Controller('chats/:chatId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'История с курсорной пагинацией вверх' })
  history(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.messagesService.history(chatId, user.id, query.before, query.limit);
  }

  @Get('search')
  @ApiOperation({ summary: 'Регистронезависимый ILIKE-поиск внутри своего чата' })
  @ApiQuery({ name: 'q', example: 'демо' })
  search(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: SearchMessagesDto,
  ) {
    return this.messagesService.search(chatId, user.id, query.q, query.limit);
  }
}
