import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { StorageProvider } from './StorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import { CloudinaryStorageProvider } from './CloudinaryStorageProvider';

let instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (instance) return instance;
  switch (env.STORAGE_DRIVER) {
    case 's3':
      if (env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
        instance = new S3StorageProvider();
        break;
      }
      logger.warn('STORAGE_DRIVER=s3 but S3 credentials are incomplete — falling back to local storage');
      instance = new LocalStorageProvider();
      break;
    case 'cloudinary':
      if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
        instance = new CloudinaryStorageProvider();
        break;
      }
      logger.warn('STORAGE_DRIVER=cloudinary but credentials are incomplete — falling back to local storage');
      instance = new LocalStorageProvider();
      break;
    default:
      instance = new LocalStorageProvider();
  }
  logger.info(`Storage provider: ${instance.name}`);
  return instance;
}

export * from './StorageProvider';
export { verifySignedKey, signKey } from './LocalStorageProvider';
