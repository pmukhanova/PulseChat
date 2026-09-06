import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, IsUUID, Length } from 'class-validator';

export class CreateGroupChatDto {
  @ApiProperty({ example: 'Команда проекта', minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  title: string;

  @ApiProperty({ type: [String], format: 'uuid', maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  memberIds: string[];
}
