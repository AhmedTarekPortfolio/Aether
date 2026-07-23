import { db } from '../db/database';
import { NotificationItem } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getNotifications(): Promise<NotificationItem[]> {
  try {
    return await db.notifications.orderBy('createdAt').reverse().toArray();
  } catch (err) {
    logger.error('Failed to fetch notifications', err);
    throw new StorageError('getNotifications', err);
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    await db.notifications.update(id, { read: true });
  } catch (err) {
    logger.error(`Failed to mark notification as read with id ${id}`, err);
    throw new StorageError('markNotificationAsRead', err);
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  try {
    const all = await db.notifications.toArray();
    const unread = all.filter((n) => !n.read);
    await Promise.all(unread.map((n) => db.notifications.update(n.id, { read: true })));
  } catch (err) {
    logger.error('Failed to mark all notifications as read', err);
    throw new StorageError('markAllNotificationsAsRead', err);
  }
}
