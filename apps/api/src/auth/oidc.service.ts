import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type * as Oidc from 'openid-client';
import { config } from '../config';
import type { SessionUser } from './session';

// openid-client v6 — лише ESM; API зібрано як CommonJS, тож вантажимо його ліниво (require(esm), Node ≥ 22.12).
// Без Keycloak (AUTH_DISABLED, тести) модуль не вантажиться зовсім.
let lib: Promise<typeof Oidc> | null = null;
const oidcLib = () => (lib ??= import('openid-client'));

const SCOPE = 'openid profile email';

/**
 * Обгортка над openid-client: discovery, вхід лише через сторінку Keycloak (Code + PKCE S256), revoke і
 * end-session при виході. Власної форми з паролем (password grant / «Direct Access Grants») більше немає:
 * у realm k2 ROPC лишається тільки в K2 Auth, клієнт gov_purchase його не має.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private readonly log = new Logger(OidcService.name);
  private cfg: Oidc.Configuration | null = null;

  get enabled() {
    return !config.authDisabled;
  }

  get redirectUri() {
    return `${config.publicUrl}/auth/callback`;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.log.warn('AUTH_DISABLED=true — Keycloak не використовується, усі запити від dev-користувача');
      return;
    }
    // Keycloak може ще підніматися — discovery повториться при першому вході.
    await this.discover().catch((e) =>
      this.log.warn(`OIDC discovery не вдався, повторимо при вході: ${(e as Error).message}`),
    );
  }

  private async discover(): Promise<Oidc.Configuration> {
    if (this.cfg) return this.cfg;
    const oidc = await oidcLib();
    const issuer = new URL(config.keycloakIssuer);
    const opts = issuer.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : undefined;
    this.cfg = await oidc.discovery(issuer, config.keycloakClientId, config.keycloakClientSecret, undefined, opts);
    this.log.log(`Keycloak: ${issuer.href}`);
    return this.cfg;
  }

  /** Вхід через сторінку Keycloak (Code + PKCE). `forceCredentials` — prompt=login. */
  async startLogin(forceCredentials = false) {
    const [cfg, oidc] = [await this.discover(), await oidcLib()];
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: this.redirectUri,
      scope: SCOPE,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      ...(forceCredentials ? { prompt: 'login' } : {}),
    });
    return { url: url.href, verifier, state };
  }

  async finishLogin(currentUrl: URL, verifier: string, state: string) {
    const [cfg, oidc] = [await this.discover(), await oidcLib()];
    const res = await oidc.authorizationCodeGrant(cfg, currentUrl, { pkceCodeVerifier: verifier, expectedState: state });
    return { tokens: res, user: userFrom(res) };
  }

  /** Найкраще, що можемо: сказати Keycloak, що токен більше не потрібен. */
  async revoke(accessToken: string) {
    try {
      const [cfg, oidc] = [await this.discover(), await oidcLib()];
      await oidc.tokenRevocation(cfg, accessToken, { token_type_hint: 'access_token' });
    } catch (e) {
      this.log.warn(`Revoke не вдався: ${(e as Error).message}`);
    }
  }

  /** URL виходу з SSO Keycloak (лише для входу через його сторінку). */
  async logoutUrl(idToken: string | undefined): Promise<string | null> {
    const [cfg, oidc] = [await this.discover(), await oidcLib()];
    if (!cfg.serverMetadata().end_session_endpoint) return null;
    return oidc.buildEndSessionUrl(cfg, {
      post_logout_redirect_uri: `${config.publicUrl}/`,
      ...(idToken ? { id_token_hint: idToken } : {}),
    }).href;
  }
}

function userFrom(res: Oidc.TokenEndpointResponse & Oidc.TokenEndpointResponseHelpers): SessionUser {
  const access = decodeJwtPayload(res.access_token);
  const claims = { ...access, ...(res.claims() ?? {}) } as Record<string, unknown>;
  const str = (k: string) => (typeof claims[k] === 'string' && claims[k] ? (claims[k] as string) : null);
  const displayName =
    str('name') ?? ([str('family_name'), str('given_name')].filter(Boolean).join(' ') || null);
  const username = str('preferred_username') ?? str('email') ?? str('sub') ?? 'unknown';
  return { id: str('sub') ?? `username:${username}`, username, displayName, admin: realmRoles(access).some((r) => config.adminRoles.includes(r)) };
}

/** Ролі користувача в realm з access token (realm_access.roles). */
export function realmRoles(token: Record<string, unknown>): string[] {
  const roles = (token.realm_access as { roles?: unknown } | undefined)?.roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}
