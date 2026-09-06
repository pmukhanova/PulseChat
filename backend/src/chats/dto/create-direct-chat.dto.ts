import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateDirectChatDto {
  @ApiProperty({ format: 'uuid', description: 'Собеседник' })
  @IsUUID()
  userId: string;
}
