import { IsEmail, IsString, MinLength, IsIn, IsOptional, IsDateString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
export class CreateAccountDto {
  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/i)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  subdomain!: string;
  @IsString() @MinLength(1) token!: string;
  @IsOptional() @IsDateString() tokenExpiresAt?: string;
  @IsIn(['amocrm.ru','kommo.com']) baseDomain!: 'amocrm.ru' | 'kommo.com';
}
