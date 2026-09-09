import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountOwnershipGuard } from './guards/ownership.guard';
import { ParseTagIdsPipe } from './dto/parse-tag-ids.pipe';
import { SerializeBigInt } from '../common/interceptors/serialize-bigint.decorator';
@Controller()
@UseGuards(JwtAuthGuard, AccountOwnershipGuard)
@SerializeBigInt()
export class UserController {
  constructor(private svc: UserService) {}
  @Get('accounts/:accountId/pipelines') getPipelines(@Param('accountId', ParseIntPipe) id: number) { return this.svc.getPipelines(id); }
  @Get('accounts/:accountId/tags') getTags(@Param('accountId', ParseIntPipe) id: number) { return this.svc.getTags(id); }
  @Get('pipelines/:pipelineId/stages-stats') getStats(
    @Param('pipelineId', ParseIntPipe) id: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
  ) { return this.svc.getStagesStats(id, tagIds); }
  @Get('stages/:stageId/active-leads') active(
    @Param('stageId', ParseIntPipe) id: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
  ) { return this.svc.getActiveLeads(id, page, perPage, tagIds); }
  @Get('leads/:leadId/history') history(@Param('leadId', ParseIntPipe) id: number) { return this.svc.getLeadHistory(id); }
  @Get('accounts/:accountId/leads/search') search(
    @Param('accountId', ParseIntPipe) id: number,
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
  ) { return this.svc.searchLeads(id, q || '', page, perPage, tagIds); }
  @Get('accounts/:accountId/leads') byStatus(
    @Param('accountId', ParseIntPipe) id: number,
    @Query('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('tagIds', ParseTagIdsPipe) tagIds: number[],
  ) { return this.svc.listLeadsByStatus(id, status || 'open', page, perPage, tagIds); }
}
