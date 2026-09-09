import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
@Injectable()
export class TokenExpiryProcessor {
  constructor(private prisma: PrismaService) {}
  async run() {
    const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const accounts = await this.prisma.account.findMany({
      where: { status: 'connected', tokenStatus: 'active', tokenExpiresAt: { lte: in7, not: null } },
    });
    for (const a of accounts) {
      const existing = await this.prisma.notification.findFirst({ where: { accountId: a.id, type: 'token_expiring_soon', isRead: false } });
      if (!existing) {
        await this.prisma.notification.create({
          data: { accountId: a.id, type: 'token_expiring_soon', message: `Token expires at ${a.tokenExpiresAt?.toISOString()}` },
        });
      }
    }
    const now = new Date();
    const expired = await this.prisma.account.findMany({
      where: { status: 'connected', tokenStatus: 'active', tokenExpiresAt: { lt: now, not: null } },
    });
    for (const a of expired) {
      await this.prisma.account.update({ where: { id: a.id }, data: { tokenStatus: 'expired' } });
      await this.prisma.notification.create({ data: { accountId: a.id, type: 'token_expired', message: 'Token has expired' } });
    }
  }
}
