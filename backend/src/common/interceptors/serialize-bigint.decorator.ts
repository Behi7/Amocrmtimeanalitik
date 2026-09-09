import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { BigIntInterceptor } from './bigint.interceptor';
export function SerializeBigInt() { return applyDecorators(UseInterceptors(BigIntInterceptor)); }
