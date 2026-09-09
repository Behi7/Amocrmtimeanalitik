import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map(data => this.serialize(data)));
  }
  private serialize(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(x => this.serialize(x));
    if (typeof obj === 'object') {
      const out: any = {};
      for (const k of Object.keys(obj)) out[k] = this.serialize(obj[k]);
      return out;
    }
    return obj;
  }
}
