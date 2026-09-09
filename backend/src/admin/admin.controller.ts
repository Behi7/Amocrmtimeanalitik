import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { PatchAccountDto } from './dto/patch-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';
import { SerializeBigInt } from '../common/interceptors/serialize-bigint.decorator';
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@SerializeBigInt()
export class AdminController {
  constructor(private svc: AdminService) {}
  @Get('accounts') list() { return this.svc.listAccounts(); }
  @Post('accounts') create(@Body() dto: CreateAccountDto) { return this.svc.createAccount(dto); }
  @Patch('accounts/:accountId') patch(@Param('accountId', ParseIntPipe) id: number, @Body() dto: PatchAccountDto) { return this.svc.patchAccount(id, dto); }
  @Delete('accounts/:accountId') del(@Param('accountId', ParseIntPipe) id: number) { return this.svc.deleteAccount(id); }
  @Post('accounts/:accountId/retry-backfill') retry(@Param('accountId', ParseIntPipe) id: number) { return this.svc.retryBackfill(id); }
  @Get('notifications') listNotif(@Query('unreadOnly') unread: string) { return this.svc.listNotifications(unread === 'true'); }
  @Post('notifications/:id/read') readNotif(@Param('id', ParseIntPipe) id: number) { return this.svc.markNotificationRead(id); }
}
