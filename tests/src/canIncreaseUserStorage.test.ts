import { HUNDRED_TB } from '../../src/constants';
import { getUserStorage } from '../../src/services/storage.service';
import { canIncreaseUserStorage } from '../../src/utils/canIncreaseUserStorage';
import { getUser } from './fixtures';

jest.mock('../../src/services/storage.service');

describe('Check if user can increase storage', () => {
  it('When the user has available space, then they should be able to increase storage', async () => {
    const mockedUser = { ...getUser(), email: 'example@internxt.com' };
    const newStorageBytes = '102923847523';
    (getUserStorage as jest.Mock).mockResolvedValue({
      canExpand: true,
      currentMaxSpaceBytes: 1024,
      expandableBytes: 102,
    });

    const canIncrease = await canIncreaseUserStorage(mockedUser.uuid, mockedUser.email, newStorageBytes);

    expect(canIncrease).toBe(true);
  });
  it('When the user tries to add more storage than allowed, then they should not be able to do so', async () => {
    const mockedUser = { ...getUser(), email: 'example@internxt.com' };
    const newStorageBytes = '102923847523';
    (getUserStorage as jest.Mock).mockResolvedValue({
      canExpand: true,
      currentMaxSpaceBytes: HUNDRED_TB,
      expandableBytes: 102,
    });

    const canIncrease = await canIncreaseUserStorage(mockedUser.uuid, mockedUser.email, newStorageBytes);

    expect(canIncrease).toBe(false);
  });
});
