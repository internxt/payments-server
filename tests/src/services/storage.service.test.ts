import axios from 'axios';
import jwt from 'jsonwebtoken';
import config from '../../../src/config';
import { getUser } from '../fixtures';
import { getUserStorage } from '../../../src/services/storage.service';

jest.mock('axios');

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mocked-jwt-token'),
}));

describe('Storage service tests', () => {
  describe('Check if the user can stack storage', () => {
    const mockedAxios = axios as jest.Mocked<typeof axios>;

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
