import config from '../config';
import { HUNDRED_TB } from '../constants';
import { getUserStorage } from '../services/storage.service';

export async function fetchUserStorage(
  userUuid: string,
  email: string,
  newStorageBytes: string,
): Promise<{ canExpand: boolean; currentMaxSpaceBytes: number }> {
  const userSpace = await getUserStorage(userUuid, email, newStorageBytes, config);

  return {
    canExpand: userSpace.currentMaxSpaceBytes + Number(newStorageBytes) <= HUNDRED_TB,
    currentMaxSpaceBytes: userSpace.currentMaxSpaceBytes,
  };
}
