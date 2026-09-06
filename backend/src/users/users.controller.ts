import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchUsersDto } from './dto/search-users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Найти пользователей для нового чата' })
  @ApiOkResponse({ description: 'Не более 20 пользователей без password_hash' })
  search(@Query() query: SearchUsersDto, @CurrentUser() user: AuthUser) {
    return this.usersService.search(query.search, user.id);
  }
}
