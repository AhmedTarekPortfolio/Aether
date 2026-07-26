import { CANONICAL_ACHIEVEMENT_DEFINITIONS, db } from '../db/database';
import { AchievementDefinition, UserAchievement } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getAchievementDefinitions(): Promise<AchievementDefinition[]> {
  try {
    // Definitions are application-owned authority; user progress remains separate and untouched.
    return CANONICAL_ACHIEVEMENT_DEFINITIONS.map((definition) => ({ ...definition }));
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
