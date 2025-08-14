import config from '../../../../src/config';
import { updateUserTier } from '../../../../src/services/storage.service';
import { getLogger, newTier as getTier, getUser, voidPromise } from '../../fixtures';
import {
  ExpandStorageNotAvailableError,
  handleStackLifetimeStorage,
} from '../../../../src/webhooks/utils/handleStackLifetimeStorage';
import { fetchUserStorage } from '../../../../src/utils/fetchUserStorage';
import { createTestServices } from '../../helpers/services-factory';

jest.mock('../../../../src/utils/fetchUserStorage');

jest.mock('../../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../../src/services/storage.service');

  return {
    ...actualModule,
    updateUserTier: jest.fn(),
    canUserStackStorage: jest.fn(),
  };
});

let mockedUser = { ...getUser(), email: 'example@inxt.com' };
let mockedLogger = getLogger();
let mockedOldTier = getTier();
let mockedNewTier = getTier();

const { storageService } = createTestServices();

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('Stack lifetime storage', () => {
  it("When the user storage can't be expanded, then an error indicating so is thrown", async () => {
    (fetchUserStorage as jest.Mock).mockResolvedValue({
      canExpand: false,
    });

    await expect(
      handleStackLifetimeStorage({
        logger: mockedLogger,
        newTier: mockedNewTier,
        oldTier: mockedOldTier,
        storageService,
        user: mockedUser,
      }),
    ).rejects.toThrow(ExpandStorageNotAvailableError);
  });

  it('When the user purchases a lifetime product, then the storage should be stacked', async () => {
    mockedOldTier.featuresPerService['drive'].maxSpaceBytes = 2000;
    mockedNewTier.featuresPerService['drive'].maxSpaceBytes = 1000;

    const totalSpaceBytes =
      mockedOldTier.featuresPerService['drive'].maxSpaceBytes + mockedNewTier.featuresPerService['drive'].maxSpaceBytes;

    (fetchUserStorage as jest.Mock).mockResolvedValue({
      canExpand: true,
      currentMaxSpaceBytes: mockedOldTier.featuresPerService['drive'].maxSpaceBytes,
    });
    const changeStorageSpy = jest.spyOn(storageService, 'changeStorage').mockImplementation(voidPromise);
    (updateUserTier as jest.Mock).mockImplementation();

    await handleStackLifetimeStorage({
      logger: mockedLogger,
      newTier: mockedNewTier,
      oldTier: mockedOldTier,
      storageService,
      user: mockedUser,
    });

    expect(changeStorageSpy).toHaveBeenCalledWith(mockedUser.uuid, totalSpaceBytes);
    expect(updateUserTier).toHaveBeenCalledWith(mockedUser.uuid, mockedOldTier.productId, config);
  });
});
