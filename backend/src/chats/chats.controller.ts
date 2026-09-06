import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AddMemberDto } from './dto/add-member.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateDirectChatDto } from './dto/create-direct-chat.dto';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ChatsService } from './chats.service';

@ApiTags('chats')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Пользователь не участник или не имеет нужной роли' })
@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post('direct')
  @ApiOperation({ summary: 'Создать или вернуть существующий личный чат' })
  @ApiBadRequestResponse({ description: 'Попытка создать чат с собой' })
  createDirect(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectChatDto) {
    return this.chatsService.createDirect(user.id, dto);
  }

  @Post('group')
  @ApiOperation({ summary: 'Создать группу; автор становится OWNER' })
  @ApiNotFoundResponse({ description: 'Один из участников не найден' })
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupChatDto) {
    return this.chatsService.createGroup(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить только свои чаты, новые сверху' })
  list(@CurrentUser() user: AuthUser) {
    return this.chatsService.listChats(user.id);
  }

  @Get(':chatId')
  @ApiOperation({ summary: 'Получить чат участника' })
  get(@Param('chatId', new ParseUUIDPipe()) chatId: string, @CurrentUser() user: AuthUser) {
    return this.chatsService.getChat(chatId, user.id);
  }

  @Patch(':chatId')
  @ApiOperation({ summary: 'Переименовать GROUP-чат как OWNER или ADMIN' })
  rename(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateChatDto,
  ) {
    return this.chatsService.rename(chatId, user.id, dto);
  }

  @Get(':chatId/members')
  @ApiOperation({ summary: 'Получить участников своего чата' })
  members(@Param('chatId', new ParseUUIDPipe()) chatId: string, @CurrentUser() user: AuthUser) {
    return this.chatsService.getMembers(chatId, user.id);
  }

  @Post(':chatId/members')
  @ApiOperation({ summary: 'Добавить MEMBER как OWNER или ADMIN' })
  @ApiConflictResponse({ description: 'Пользователь уже добавлен' })
  addMember(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.chatsService.addMember(chatId, user.id, dto);
  }

  @Delete(':chatId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить разрешённого участника группы' })
  async removeMember(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @Param('userId', new ParseUUIDPipe()) targetId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.chatsService.removeMember(chatId, user.id, targetId);
  }

  @Patch(':chatId/members/:userId/role')
  @ApiOperation({ summary: 'Назначить или снять ADMIN; только OWNER' })
  changeRole(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @Param('userId', new ParseUUIDPipe()) targetId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.chatsService.changeRole(chatId, user.id, targetId, dto);
  }
}
