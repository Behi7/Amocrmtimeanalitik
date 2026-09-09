import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';

(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`Listening on ${port}`);
}
bootstrap();
