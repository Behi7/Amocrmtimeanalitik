import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { validateConfig } from './common/config/config.validate';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';
import { CrmConnectorModule } from './crm-connector/crm-connector.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: {
      level: process.env.APP_ENV === 'production' ? 'info' : 'debug',
      redact: ['req.headers.authorization','req.headers.cookie','body.password','body.token','body.refreshToken','body.encrypted_token','*.password','*.token','*.encrypted_token'],
      autoLogging: true,
    }}),
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    BullModule.forRoot({ connection: (() => {
      const u = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
      return { host: u.hostname, port: parseInt(u.port || '6379', 10), password: u.password || undefined, username: u.username || undefined, tls: u.protocol === 'rediss:' ? {} : undefined };
    })() }),
    PrismaModule, CryptoModule,
    AuthModule, AdminModule, UserModule, CrmConnectorModule, JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
