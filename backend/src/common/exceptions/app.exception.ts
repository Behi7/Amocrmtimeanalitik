import { HttpException } from '@nestjs/common';
export class AppException extends HttpException {
  constructor(public code: string, http: number, message: string) {
    super({ error: { code, message } }, http);
  }
}
