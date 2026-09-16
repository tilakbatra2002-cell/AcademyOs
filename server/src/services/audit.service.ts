import { Request } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | Types.ObjectId;
  status?: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, unknown>;
  organizationId?: Types.ObjectId | null;
  userId?: Types.ObjectId | null;
  userName?: string;
  userRole?: string;
}

/** Fire-and-forget audit write; never breaks the request flow. */
export async function recordAudit(req: Request | null, input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      organizationId: input.organizationId !== undefined ? input.organizationId : req?.auth?.organizationId ?? null,
      userId: input.userId !== undefined ? input.userId : req?.auth?.userId ?? null,
      userName: input.userName ?? req?.auth?.name,
      userRole: input.userRole ?? req?.auth?.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ? String(input.entityId) : undefined,
      status: input.status ?? 'SUCCESS',
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
      metadata: input.metadata,
    });
  } catch (err) {
    logger.warn('Failed to write audit log', (err as Error).message);
  }
}
