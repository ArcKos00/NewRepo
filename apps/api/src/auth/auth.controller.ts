import { Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type { CurrentUser } from '@order-tracking/shared';
import { config } from '../config';
import { AuditService } from '../audit/audit.service';
import { actorName, auditContext, currentUser } from '../audit/audit-context';
import { Public } from './auth.guard';
import { OidcService } from './oidc.service';
import type { SessionRequest, SessionUser } from './session';

type TokenResponse = { access_token: string; id_token?: string };

/** Вхід лише через сторінку Keycloak (Code + PKCE S256); форми з паролем (password grant) немає. */
@Controller('auth')
@Public()
export class AuthController {
  constructor(
    private readonly oidc: OidcService,
    private readonly audit: AuditService,
  ) {}

  /** Вхід через сторінку Keycloak (Code + PKCE). Redirect URI: `${PUBLIC_URL}/auth/callback`. */
  @Get('login')
  async login(@Req() req: SessionRequest, @Res() res: Response, @Query('returnTo') returnTo?: string) {
    const back = safePath(returnTo);
    if (!this.oidc.enabled) return res.redirect(back);
    const { url, verifier, state } = await this.oidc.startLogin();
    req.session!.login = { verifier, state, returnTo: back };
    await save(req);
    res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: SessionRequest, @Res() res: Response) {
    const pending = req.session?.login;
    if (!pending) return res.redirect('/login');
    const current = new URL(req.originalUrl, config.publicUrl);
    const { tokens, user } = await this.oidc.finishLogin(current, pending.verifier, pending.state);
    await this.startSession(req, user, tokens, 'code');
    res.redirect(pending.returnTo);
  }

  @Get('me')
  me(@Req() req: SessionRequest): CurrentUser {
    if (!currentUser(req)) throw new UnauthorizedException('Потрібно увійти');
    return this.info(req);
  }

  /** Вихід: сесію знищено, токен відкликано; для входу через сторінку Keycloak — ще й його end-session URL. */
  @Post('logout')
  async logout(@Req() req: SessionRequest, @Res() res: Response) {
    const s = req.session;
    if (!this.oidc.enabled || !s) return res.json({ logoutUrl: null });
    const user = currentUser(req);
    if (user)
      await this.audit.recordSafe(auditContext(req), { action: 'auth.logout', summary: `Вихід: ${actorName(user)}` });
    const { accessToken, idToken, grant } = s;
    await new Promise<void>((resolve, reject) => s.destroy((e) => (e ? reject(e) : resolve())));
    res.clearCookie('sid');
    if (accessToken) await this.oidc.revoke(accessToken);
    res.json({ logoutUrl: grant === 'code' ? await this.oidc.logoutUrl(idToken) : null });
  }

  private async startSession(req: SessionRequest, user: SessionUser, tokens: TokenResponse, grant: 'code') {
    // нова сесія при вході — щоб не можна було підсунути наперед відомий sid (session fixation)
    await new Promise<void>((resolve, reject) => req.session!.regenerate((e) => (e ? reject(e) : resolve())));
    const s = req.session!;
    s.user = user;
    s.accessToken = tokens.access_token;
    s.idToken = tokens.id_token;
    s.grant = grant;
    s.expiresAt = Date.now() + config.sessionMaxHours * 3_600_000;
    await save(req);
    await this.audit.recordSafe(auditContext(req), {
      action: 'auth.login',
      summary: `Вхід: ${actorName(user)} (сторінка Keycloak)`,
    });
  }

  private info(req: SessionRequest): CurrentUser {
    const u = currentUser(req)!;
    return {
      id: u.id, username: u.username, displayName: u.displayName, admin: !!u.admin, expiresAt: req.session?.expiresAt ?? null,
    };
  }
}

function save(req: SessionRequest) {
  return new Promise<void>((resolve, reject) => req.session!.save((e) => (e ? reject(e) : resolve())));
}

function safePath(p: string | undefined) {
  return p?.startsWith('/') && !p.startsWith('//') && !p.startsWith('/login') ? p : '/';
}
