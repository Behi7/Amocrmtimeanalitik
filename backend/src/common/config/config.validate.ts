import { plainToClass } from 'class-transformer';
import { IsString, IsOptional, MinLength, validateSync, IsIn } from 'class-validator';

class EnvConfig {
  @IsString() DATABASE_URL!: string;
  @IsString() REDIS_URL!: string;
  @IsString() TOKEN_ENCRYPTION_KEY!: string;
  @IsString() ADMIN_EMAIL!: string;
  @IsString() @MinLength(12) ADMIN_PASSWORD!: string;
  @IsString() JWT_ACCESS_SECRET!: string;
  @IsString() CSRF_SECRET!: string;
  @IsOptional() @IsString() PORT?: string;
  @IsOptional() @IsIn(['development','production']) APP_ENV?: string;
}

export function validateConfig(env: Record<string, unknown>) {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (typeof key === 'string' && Buffer.byteLength(key) !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 32 bytes');
  }
  const validated = plainToClass(EnvConfig, env, { enableImplicitConversion: true });
  const errors = validateSync(validated as any, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error('Invalid env: ' + errors.map(e => Object.values(e.constraints || {})).flat().join(', '));
  }
  return validated as any;
}
