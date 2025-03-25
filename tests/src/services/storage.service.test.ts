import axios from 'axios';
import jwt from 'jsonwebtoken';
import config from '../../../src/config';
import { getUser, voidPromise } from '../fixtures';
import { getUserStorage, StorageService } from '../../../src/services/storage.service';

jest.mock('axios');

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mocked-jwt-token'),
}));

let storageService: StorageService;

beforeEach(() => {
  storageService = new StorageService(config, axios);
  jest.restoreAllMocks();
});

describe('Storage service tests', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  describe('The user updates the storage', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('When the user updates the storage, then it should be called with the necessary data ', async () => {
      const mockedUserUuid = getUser().uuid;
      const newStorageBytes = 100000;

      mockedAxios.patch.mockImplementation(voidPromise);

      await storageService.changeStorage(mockedUserUuid, newStorageBytes);

      expect(jwt.sign).toHaveBeenCalledTimes(1);
      expect(jwt.sign).toHaveBeenCalledWith({}, expect.any(String), expect.any(Object));
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        `${config.DRIVE_NEW_GATEWAY_URL}/gateway/users/${mockedUserUuid}`,
        { maxSpaceBytes: newStorageBytes },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer '),
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('When the API request to update the user storage fails, then an error indicating so is thrown', async () => {
      const mockedUserUuid = getUser().uuid;
      const newStorageBytes = 100000;
      const randomError = new Error('API request failed');
      mockedAxios.patch.mockRejectedValue(randomError);

      await expect(storageService.changeStorage(mockedUserUuid, newStorageBytes)).rejects.toThrow(randomError);
      expect(mockedAxios.patch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Check if the user can stack storage', () => {
    const mockUserUuid = getUser().uuid;
    const mockEmail = 'user@example.com';
    const mockNewStorage = '12121212';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('When the user can stack storage, then an object indicating the storage expansion is returned', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          canExpand: true,
          currentMaxSpaceBytes: 5000000,
          expandableBytes: 1000000,
        },
      });

      const result = await getUserStorage(mockUserUuid, mockEmail, mockNewStorage, config);

      expect(jwt.sign).toHaveBeenCalledTimes(1);
      expect(jwt.sign).toHaveBeenCalledWith({}, expect.any(String), expect.any(Object));
      expect(result).toEqual({
        canExpand: true,
        currentMaxSpaceBytes: 5000000,
        expandableBytes: 1000000,
      });
    });

    it('When the API request to check if user can stack storage fails, then an error indicating so is thrown', async () => {
      const randomError = new Error('API request failed');
      mockedAxios.get.mockRejectedValue(randomError);

      await expect(getUserStorage(mockUserUuid, mockEmail, mockNewStorage, config)).rejects.toThrow(randomError);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
