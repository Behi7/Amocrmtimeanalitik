import { ExceptionFilter, Catch, ArgumentsHost, Logger, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger('ExceptionFilter');
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    let http = 500, code = 'INTERNAL_ERROR', message = 'Internal server error';
    if (exception instanceof AppException) {
      http = exception.getStatus(); code = exception.code; message = (exception.getResponse() as any)?.error?.message || exception.message;
    } else if (exception instanceof HttpException) {
      http = exception.getStatus();
      const r = exception.getResponse() as any;
      if (Array.isArray(r?.message)) message = r.message.join(', ');
      else if (typeof r?.message === 'string') message = r.message;
      else message = exception.message;
      if (http === 400) code = 'VALIDATION_ERROR';
      else if (http === 401) code = 'UNAUTHORIZED';
      else if (http === 403) code = 'FORBIDDEN';
      else if (http === 404) code = 'NOT_FOUND';
      else if (http === 409) code = 'CONFLICT';
      else if (http === 429) code = 'RATE_LIMITED';
    } else if (exception instanceof PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { http = 409; code = 'CONFLICT'; message = 'Duplicate'; }
      else if (exception.code === 'P2025') { http = 404; code = 'NOT_FOUND'; message = 'Not found'; }
    }
    if (http >= 500) this.logger.error(exception);
    else if (http !== 401 && http !== 404 && http !== 429) this.logger.warn(`[${http}] ${code}: ${message}`);
    res.status(http).json({ error: { code, message } });
  }
}
