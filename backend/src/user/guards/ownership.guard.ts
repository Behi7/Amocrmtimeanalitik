import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma/prisma.service';
@Injectable()
export class AccountOwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    if (user.role === 'admin') return true;
    const params = req.params;
    const accountId = params.accountId ? parseInt(params.accountId, 10) : null;
    const pipelineId = params.pipelineId ? parseInt(params.pipelineId, 10) : null;
    const stageId = params.stageId ? parseInt(params.stageId, 10) : null;
    const leadId = params.leadId ? parseInt(params.leadId, 10) : null;
    if (user.accountId == null) return false;
    const userAcc = user.accountId;
    if (accountId != null && accountId !== userAcc) return false;
    if (pipelineId != null) {
      const p = await this.prisma.pipeline.findUnique({ where: { id: pipelineId } });
      if (!p || p.accountId !== userAcc) throw new NotFoundException();
    }
    if (stageId != null) {
      const s = await this.prisma.stage.findUnique({ where: { id: stageId }, include: { pipeline: true } });
      if (!s || s.pipeline.accountId !== userAcc) throw new NotFoundException();
    }
    if (leadId != null) {
      const l = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!l || l.accountId !== userAcc) throw new NotFoundException();
    }
    return true;
  }
}
