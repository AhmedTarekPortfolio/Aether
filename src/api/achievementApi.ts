import { db } from '../db/database';
import { AchievementDefinition, UserAchievement } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getAchievementDefinitions(): Promise<AchievementDefinition[]> {
  try {
    return await db.achievement_definitions.toArray();
  } catch (err) {
    logger.error('Failed to fetch achievement definitions', err);
    throw new StorageError('getAchievementDefinitions', err);
  }
}

export async function getUserAchievements(): Promise<UserAchievement[]> {
  try {
    return await db.user_achievements.toArray();
  } catch (err) {
    logger.error('Failed to fetch user achievements', err);
    throw new StorageError('getUserAchievements', err);
  }
}
