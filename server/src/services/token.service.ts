import jwt, { SignOptions } from 'jsonwebtoken';
import { Response } from 'express';
import { env, isProd } from '../config/env';
import { Role } from '../config/rbac';

export const ACCESS_COOKIE = 'aos_at';
export const REFRESH_COOKIE = 'aos_rt';

export interface AccessTokenPayload {
  sub: string;
  org: string | null;
  role: Role;
  tv: number;
  typ: 'access' | 'refresh';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(payload: Omit<AccessTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

export function verifyToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

const baseCookie = {
  httpOnly: true,
  secure: env.COOKIE_SECURE || isProd,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN,
  path: '/',
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: 1000 * 60 * 60 * 12 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...baseCookie, maxAge: 1000 * 60 * 60 * 24 * 7, path: '/' });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie });
}
