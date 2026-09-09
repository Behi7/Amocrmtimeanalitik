import { IsEmail, IsString, MinLength, IsOptional, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
export class PatchAccountDto {
  @IsOptional() @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;
  @IsOptional() @IsString() @MinLength(12) password?: string;
  @IsOptional() @IsString() @MinLength(1) token?: string;
  @IsOptional() @IsDateString() tokenExpiresAt?: string;
}
