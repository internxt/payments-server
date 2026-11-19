import { type AppConfig } from '../config';
import { HUNDRED_TB } from '../constants';
import { getUserStorage } from '../services/storage.service';

export async function fetchUserStorage(
  userUuid: string,
  email: string,
  newStorageBytes: string,
  config: Pick<AppConfig, 'DRIVE_NEW_GATEWAY_SECRET' | 'DRIVE_NEW_GATEWAY_URL' | 'isProduction'>,
): Promise<{ canExpand: boolean; currentMaxSpaceBytes: number }> {
  const userSpace = await getUserStorage(userUuid, email, newStorageBytes, config);

  return {
    canExpand: userSpace.currentMaxSpaceBytes + Number(newStorageBytes) <= HUNDRED_TB,
    currentMaxSpaceBytes: userSpace.currentMaxSpaceBytes,
  };
}
