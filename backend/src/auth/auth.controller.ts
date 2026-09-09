import { Controller, Post, Body, Req, Res, HttpCode } from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password);
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, role: r.role };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token;
    const r = await this.auth.refresh(token);
    if (!r) { res.clearCookie('refresh_token', this.opts()); return {}; }
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.refresh_token);
    res.clearCookie('refresh_token', this.opts());
  }

  private setCookie(res: Response, token: string) { res.cookie('refresh_token', token, this.opts()); }
  private opts(): CookieOptions {
    const sameDomain = (process.env.COOKIE_SAME_DOMAIN || 'true') === 'true';
    return {
      httpOnly: true, secure: process.env.APP_ENV === 'production',
      sameSite: sameDomain ? 'lax' : 'none',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
      maxAge: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10) * 86400000,
    };
  }
}
