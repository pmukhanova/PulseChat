import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ChatRoomDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  chatId: string;
}
