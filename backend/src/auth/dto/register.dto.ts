import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'andrey', minLength: 3, maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 32)
  @Matches(/^[\p{L}\p{N}_.-]+$/u, {
    message: 'username может содержать буквы, цифры, точку, дефис и подчёркивание',
  })
  username: string;

  @ApiProperty({ example: 'Demo12345', minLength: 8, maxLength: 72 })
  @IsString()
  @Length(8, 72)
  password: string;
}
