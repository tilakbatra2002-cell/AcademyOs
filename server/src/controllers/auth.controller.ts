import { Request, Response } from 'express';
import { asyncHandler, ok } from '../utils/http';
import * as authService from '../services/auth.service';
import { clearAuthCookies, setAuthCookies, REFRESH_COOKIE, verifyToken, signAccessToken } from '../services/token.service';
import { recordAudit } from '../services/audit.service';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { Communication } from '../models/Communication';
import { getMessageProvider } from '../services/messaging';
import { env } from '../config/env';

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, portal, organizationCode } = req.body;
  try {
    const { user, tokens, sessionUser, organization } = await authService.login({ email, password, portal, organizationCode });
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    await recordAudit(req, {
      action: 'LOGIN',
      entity: 'User',
      entityId: user._id,
      organizationId: user.organizationId ?? null,
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      metadata: { portal },
    });
    return ok(res, {
      user: sessionUser,
      organization: organization
        ? { id: String(organization._id), name: organization.name, code: organization.code, branding: organization.branding, settings: organization.settings, status: organization.status }
        : null,
      // Bearer token is returned for API/native clients and automated tests;
      // browsers rely exclusively on the httpOnly cookies set above.
      accessToken: tokens.accessToken,
    });
  } catch (err) {
    await recordAudit(req, {
      action: 'LOGIN_FAILED',
      entity: 'User',
      status: 'FAILURE',
      organizationId: null,
      userId: null,
      metadata: { email, portal },
    });
    throw err;
  }
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  if (req.auth) {
    await recordAudit(req, { action: 'LOGOUT', entity: 'User', entityId: req.auth.userId });
  }
  clearAuthCookies(res);
  return ok(res, { message: 'Signed out successfully' });
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const session = await authService.buildSession(auth.userId);
  return ok(res, session);
});

export const refreshController = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthenticated('No active session');
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthenticated('Session expired. Please sign in again.');
  }
  if (payload.typ !== 'refresh') throw ApiError.unauthenticated('Invalid refresh token');

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || (user.tokenVersion ?? 0) !== payload.tv) {
    throw ApiError.unauthenticated('Session is no longer valid');
  }
  const accessToken = signAccessToken({
    sub: String(user._id),
    org: user.organizationId ? String(user.organizationId) : null,
    role: user.role,
    tv: user.tokenVersion ?? 0,
  });
  setAuthCookies(res, accessToken, token);
  return ok(res, { user: authService.toSessionUser(user) });
});

export const changePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  await authService.changePassword(auth.userId, req.body.currentPassword, req.body.newPassword);
  clearAuthCookies(res);
  await recordAudit(req, { action: 'PASSWORD_CHANGED', entity: 'User', entityId: auth.userId });
  return ok(res, { message: 'Password updated. Please sign in again with your new password.' });
});

export const forgotPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.requestPasswordReset(req.body.email, req.body.organizationCode);
  if (result) {
    const { user, token } = result;
    const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
    const provider = getMessageProvider('EMAIL');
    const sendResult = await provider.send({
      to: user.email,
      subject: 'Reset your AcademyOS password',
      body: `Hello ${user.name},\n\nUse the link below to reset your password (valid for 45 minutes):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    });
    if (user.organizationId) {
      await Communication.create({
        organizationId: user.organizationId,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        subject: 'Password reset',
        body: `Password reset link sent to ${user.email}`,
        recipientType: 'USER',
        recipientId: user._id,
        recipientName: user.name,
        recipientAddress: user.email,
        status: sendResult.status,
        providerName: sendResult.providerName,
        failureReason: sendResult.failureReason,
        sentAt: new Date(),
      });
    }
    await recordAudit(req, {
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'User',
      entityId: user._id,
      organizationId: user.organizationId ?? null,
      userId: user._id,
    });
    // In development/test the token is returned so the flow is usable without SMTP.
    if (env.NODE_ENV !== 'production') {
      return ok(res, {
        message: 'If that account exists, a reset link has been sent.',
        devResetToken: token,
        emailDelivery: sendResult.status,
      });
    }
  }
  return ok(res, { message: 'If that account exists, a reset link has been sent.' });
});

export const resetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.resetPassword(req.body.token, req.body.newPassword);
  await recordAudit(req, {
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: user._id,
    organizationId: user.organizationId ?? null,
    userId: user._id,
  });
  return ok(res, { message: 'Password reset successfully. You can now sign in.' });
});

export const updateProfileController = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const update: Record<string, unknown> = {};
  if (req.body.name !== undefined) update.name = req.body.name;
  if (req.body.phone !== undefined) update.phone = req.body.phone;
  if (req.body.avatarUrl !== undefined) update.avatarUrl = req.body.avatarUrl || undefined;

  const user = await User.findByIdAndUpdate(auth.userId, update, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  await recordAudit(req, { action: 'PROFILE_UPDATED', entity: 'User', entityId: user._id });
  return ok(res, { user: authService.toSessionUser(user) });
});
