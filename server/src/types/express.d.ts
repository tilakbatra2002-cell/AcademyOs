import { Types } from 'mongoose';
import { Role, Permission } from '../config/rbac';

export interface AuthContext {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId | null;
  role: Role;
  name: string;
  email: string;
  permissions: Permission[];
  studentId?: Types.ObjectId;
  parentId?: Types.ObjectId;
  teacherId?: Types.ObjectId;
  tokenVersion: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** Tenant scope derived from the session only — never from the client. */
      orgId?: Types.ObjectId;
    }
  }
}

export {};
