import { Types } from 'mongoose';
import { Notification, NotificationType } from '../models/Communication';

export interface NotifyInput {
  organizationId: Types.ObjectId | null;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entity?: string;
  entityId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export async function notify(input: NotifyInput) {
  return Notification.create(input);
}

export async function notifyMany(inputs: NotifyInput[]) {
  if (!inputs.length) return [];
  return Notification.insertMany(inputs);
}

export async function unreadCount(userId: Types.ObjectId): Promise<number> {
  return Notification.countDocuments({ userId, isRead: false });
}
