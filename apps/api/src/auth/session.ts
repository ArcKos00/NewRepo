import type { Request } from 'express';
import 'express-session';

export interface SessionUser {
  /** `sub` з Keycloak */
  id: string;
  username: string;
  displayName: string | null;
}

declare module 'express-session' {
  interface SessionData {
    /** Незавершений вхід через сторінку Keycloak (PKCE) — прибирається після callback. */
    login?: { verifier: string; state: string; returnTo: string };
    user?: SessionUser;
    /** Токени — лише для виходу (revoke / end-session); застосунок ними нікуди не ходить. */
    accessToken?: string;
    idToken?: string;
    /** password — форма застосунку; code — сторінка Keycloak (тоді при виході закриваємо і SSO Keycloak). */
    grant?: 'password' | 'code';
    /** epoch ms: після цього вхід не діє (SESSION_MAX_HOURS від логіну, не подовжується) */
    expiresAt?: number;
  }
}

export type SessionRequest = Request & {
  session?: import('express-session').Session & Partial<import('express-session').SessionData>;
};

export const DEV_USER: SessionUser = { id: 'dev', username: 'dev', displayName: 'Розробник (AUTH_DISABLED)' };
