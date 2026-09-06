import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ChatRole } from '../../common/enums/chat-role.enum';

export class ChangeRoleDto {
  @ApiProperty({ enum: [ChatRole.ADMIN, ChatRole.MEMBER], example: ChatRole.ADMIN })
  @IsIn([ChatRole.ADMIN, ChatRole.MEMBER])
  role: ChatRole.ADMIN | ChatRole.MEMBER;
}
