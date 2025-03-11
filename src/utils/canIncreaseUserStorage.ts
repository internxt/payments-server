import config from '../config';
import { HUNDRED_TB } from '../constants';
import { getUserStorage } from '../services/storage.service';

export async function canIncreaseUserStorage(
  userUuid: string,
  email: string,
  newStorageBytes: string,
): Promise<boolean> {
  const userSpace = await getUserStorage(userUuid, email, newStorageBytes, config);

  return userSpace.currentMaxSpaceBytes + Number(newStorageBytes) <= HUNDRED_TB;
}
