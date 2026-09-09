import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { account: true } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.account?.status === 'disconnected') throw new UnauthorizedException('Account disconnected');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, accountId: user.accountId });
    const refreshToken = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlDays = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + ttlDays * 86400000) },
    });
    return { accessToken, refreshToken, role: user.role };
  }

  async refresh(token: string) {
    if (!token) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash }, include: { user: { include: { account: true } } },
    });
    if (!stored || stored.expiresAt < new Date()) return null;
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    const user = stored.user;
    if (user.account?.status === 'disconnected') return null;
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, accountId: user.accountId });
    const newRefresh = randomBytes(32).toString('base64url');
    const newHash = createHash('sha256').update(newRefresh).digest('hex');
    const ttlDays = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: newHash, expiresAt: new Date(Date.now() + ttlDays * 86400000) },
    });
    return { accessToken, refreshToken: newRefresh, role: user.role, accountId: user.accountId };
  }

  async logout(token: string) {
    if (!token) return;
    const hash = createHash('sha256').update(token).digest('hex');
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
  }
}
