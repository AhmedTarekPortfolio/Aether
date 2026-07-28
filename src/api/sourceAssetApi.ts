import { db } from '../db/database';
import { SourceAsset } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function addSourceAsset(asset: SourceAsset): Promise<void> {
  try {
    if (!await db.users.get(asset.userId)) {
      throw new Error('Asset user does not exist');
    }
    if (!/^[a-f0-9]{64}$/.test(asset.contentHash)) {
      throw new Error('Invalid contentHash: must be 64-character lowercase hex SHA-256');
    }
    const pathSegments = asset.relativePath.split('/');
    if (
      !asset.relativePath.startsWith('assets/')
      || asset.relativePath.includes('\\')
      || asset.relativePath.includes(':')
      || pathSegments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new Error('Invalid relativePath: must be a traversal-free managed assets path');
    }
    if (!Number.isSafeInteger(asset.byteSize) || asset.byteSize < 0) {
      throw new Error('Invalid byteSize: must be a non-negative safe integer');
    }
    await db.source_assets.add(asset);
  } catch (err) {
    logger.error('Failed to add source asset', err);
    throw new StorageError('addSourceAsset', err);
  }
}

export async function getSourceAssetById(id: string): Promise<SourceAsset | undefined> {
  try {
    return await db.source_assets.get(id);
  } catch (err) {
    logger.error('Failed to fetch source asset by id', err);
    throw new StorageError('getSourceAssetById', err);
  }
}

export async function getSourceAssetByHash(userId: string, contentHash: string): Promise<SourceAsset | undefined> {
  try {
    return await db.source_assets.where('[userId+contentHash]').equals([userId, contentHash]).first();
  } catch (err) {
    logger.error('Failed to fetch source asset by hash', err);
    throw new StorageError('getSourceAssetByHash', err);
  }
}

export async function getSourceAssetsByUser(userId: string): Promise<SourceAsset[]> {
  try {
    return await db.source_assets.where('userId').equals(userId).toArray();
  } catch (err) {
    logger.error('Failed to fetch source assets by user', err);
    throw new StorageError('getSourceAssetsByUser', err);
  }
}

export async function getSourceAssetCountByHash(userId: string, contentHash: string): Promise<number> {
  try {
    const asset = await getSourceAssetByHash(userId, contentHash);
    return asset ? db.source_versions.where('assetId').equals(asset.id).count() : 0;
  } catch (err) {
    logger.error('Failed to count source asset references', err);
    throw new StorageError('getSourceAssetCountByHash', err);
  }
}

export async function deleteSourceAsset(assetId: string): Promise<void> {
  try {
    const asset = await db.source_assets.get(assetId);
    if (!asset) throw new NotFoundError('SourceAsset', assetId);

    // Verify no versions reference this asset
    const referencingVersions = await db.source_versions.where('assetId').equals(assetId).count();
    if (referencingVersions > 0) {
      throw new Error(`Asset cannot be deleted: ${referencingVersions} version(s) still reference it`);
    }

    await db.source_assets.delete(assetId);
  } catch (err) {
    logger.error('Failed to delete source asset', err);
    throw err instanceof NotFoundError ? err : new StorageError('deleteSourceAsset', err);
  }
}
