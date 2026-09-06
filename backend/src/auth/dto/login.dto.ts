import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'andrey' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 32)
  username: string;

  @ApiProperty({ example: 'Demo12345' })
  @IsString()
  @Length(8, 72)
  password: string;
}
