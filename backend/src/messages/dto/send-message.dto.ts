import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  chatId: string;

  @ApiProperty({ minLength: 1, maxLength: 2000, example: 'Привет!' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  content: string;

  @ApiProperty({ format: 'uuid', description: 'Ключ идемпотентности клиента' })
  @IsUUID()
  clientMessageId: string;
}
