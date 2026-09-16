import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ACCESS_COOKIE, verifyToken } from '../services/token.service';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { Subscription } from '../models/Subscription';
import { ApiError } from '../utils/ApiError';
import { Permission, Role, permissionsForRole } from '../config/rbac';
import { asyncHandler } from '../utils/http';
import { AuthContext } from '../types/express';

/**
 * Authenticates the request from the httpOnly access cookie (or Bearer token for API clients/tests)
 * and rebuilds the auth context FROM THE DATABASE so revoked/deactivated users are rejected
 * immediately and tenant scope can never be spoofed by the client.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  let token: string | undefined = req.cookies?.[ACCESS_COOKIE];
  const header = req.headers.authorization;
  if (!token && header?.startsWith('Bearer ')) token = header.slice(7);

  if (!token) throw ApiError.unauthenticated('You must be signed in to access this resource');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthenticated('Session expired or invalid. Please sign in again.');
  }
  if (payload.typ !== 'access') throw ApiError.unauthenticated('Invalid session token');

  const user = await User.findById(payload.sub).lean();
  if (!user) throw ApiError.unauthenticated('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated. Contact your administrator.');
  if ((user.tokenVersion ?? 0) !== payload.tv) {
    throw ApiError.unauthenticated('Session has been revoked. Please sign in again.');
  }

  const auth: AuthContext = {
    userId: user._id,
    organizationId: user.organizationId ?? null,
    role: user.role as Role,
    name: user.name,
    email: user.email,
    permissions: effectivePermissions(user.role as Role, user.extraPermissions as Permission[], user.deniedPermissions as Permission[]),
    studentId: user.studentId ?? undefined,
    parentId: user.parentId ?? undefined,
    teacherId: user.teacherId ?? undefined,
    tokenVersion: user.tokenVersion ?? 0,
  };

  req.auth = auth;
  req.orgId = auth.organizationId ?? undefined;
  next();
});

export function effectivePermissions(role: Role, extra: Permission[] = [], denied: Permission[] = []): Permission[] {
  const base = new Set<Permission>(permissionsForRole(role));
  extra.forEach((p) => base.add(p));
  denied.forEach((p) => base.delete(p));
  return Array.from(base);
}

/** Requires the authenticated user to hold ALL listed permissions. */
export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthenticated());
    const missing = required.filter((p) => !req.auth!.permissions.includes(p));
    if (missing.length) {
      return next(ApiError.forbidden(`Missing required permission: ${missing.join(', ')}`));
    }
    next();
  };
}

/** Requires the authenticated user to hold AT LEAST ONE of the listed permissions. */
export function requireAnyPermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthenticated());
    if (!required.some((p) => req.auth!.permissions.includes(p))) {
      return next(ApiError.forbidden(`Requires one of: ${required.join(', ')}`));
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(ApiError.unauthenticated());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden('Your role cannot access this resource'));
    }
    next();
  };
}

/** SAAS_OWNER-only gate for the platform portal. */
export const requireOwner = requireRole('SAAS_OWNER');

/**
 * Establishes the tenant scope for organization-level routes.
 * Rejects SAAS_OWNER (they must use /api/owner) and any user without an organization.
 * Also blocks suspended organizations and enforces trial-expiry restrictions on writes.
 */
export const tenantScope = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) throw ApiError.unauthenticated();
  if (req.auth.role === 'SAAS_OWNER' || !req.auth.organizationId) {
    throw ApiError.forbidden('This endpoint is only available to academy users');
  }

  const org = await Organization.findById(req.auth.organizationId).lean();
  if (!org) throw ApiError.forbidden('Your academy no longer exists');
  if (org.status === 'SUSPENDED' || org.status === 'CANCELLED') {
    throw ApiError.forbidden(`Your academy account is ${org.status.toLowerCase()}. Contact AcademyOS support.`);
  }

  // Trial / subscription expiry restricts write operations but never deletes data.
  const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
  if (isWrite && org.settings?.restrictOnTrialExpiry !== false) {
    const sub = await Subscription.findOne({ organizationId: org._id }).lean();
    if (sub) {
      const now = new Date();
      const expired =
        (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt < now) ||
        sub.status === 'EXPIRED' ||
        sub.status === 'CANCELLED';
      if (expired) {
        throw new ApiError(
          'SUBSCRIPTION_INACTIVE',
          'Your trial or subscription has expired. Your data is safe — upgrade your plan to continue making changes.',
        );
      }
    }
  }

  req.orgId = new Types.ObjectId(req.auth.organizationId);
  next();
});

/** Guarantees `req.orgId` exists at the service boundary. */
export function requireOrg(req: Request): Types.ObjectId {
  if (!req.orgId) throw ApiError.forbidden('Tenant context missing');
  return req.orgId;
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw ApiError.unauthenticated();
  return req.auth;
}
