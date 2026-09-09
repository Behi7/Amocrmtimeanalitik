import { Module, Global } from '@nestjs/common';
import { CrmConnectorService } from './crm-connector.service';
import { CrmRateLimiter } from './http/rate-limiter';
import { CryptoModule } from '../common/crypto/crypto.module';
@Global()
@Module({
  imports: [CryptoModule],
  providers: [CrmConnectorService, CrmRateLimiter],
  exports: [CrmConnectorService],
})
export class CrmConnectorModule {}
