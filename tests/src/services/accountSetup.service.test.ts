import axios from 'axios';
import config from '../../../src/config';
import { AccountSetupService, PreCreatedUserStatus } from '../../../src/services/accountSetup.service';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mocked-jwt-token'),
}));

let accountSetupService: AccountSetupService;

beforeEach(() => {
  accountSetupService = new AccountSetupService(axios, config);
  jest.restoreAllMocks();
});

describe('Account Setup Service tests', () => {
  const gatewayUrl = `${config.DRIVE_NEW_GATEWAY_SECRET}/gateway/users/pre-create`;
  const expectedHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer mocked-jwt-token',
  };

  describe('Creating a pre-created user', () => {
    test('When called, then it requests the creation of the pre-created user with the signed token', async () => {
      const postSpy = jest.spyOn(axios, 'post').mockResolvedValue(undefined);
      const email = 'n2oK7@example.com';

      await accountSetupService.createPreCreatedUser(email);

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        gatewayUrl,
        { email },
        expect.objectContaining({ headers: expectedHeaders }),
      );
    });

    test('When the request fails, then the rejection propagates', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(axios, 'post').mockRejectedValue(requestError);

      await expect(accountSetupService.createPreCreatedUser('n2oK7@example.com')).rejects.toThrow(requestError);
    });
  });

  describe('Retrieving a pre-created user', () => {
    test('When called, then it fetches the pre-created user by email with the signed token', async () => {
      const mockedResponse = { data: { uuid: 'pre-created-uuid', status: PreCreatedUserStatus.PendingSetup } };
      const getSpy = jest.spyOn(axios, 'get').mockResolvedValue(mockedResponse);
      const email = 'n2oK7@example.com';

      await accountSetupService.getPreCreatedUser(email);

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith(
        gatewayUrl,
        expect.objectContaining({
          headers: expectedHeaders,
          params: { email },
        }),
      );
    });

    test('When called, then it resolves with the response returned by the request', async () => {
      const mockedResponse = { data: { uuid: 'pre-created-uuid', status: PreCreatedUserStatus.PendingSetup } };
      jest.spyOn(axios, 'get').mockResolvedValue(mockedResponse);

      const result = await accountSetupService.getPreCreatedUser('n2oK7@example.com');

      expect(result).toBe(mockedResponse);
    });

    test('When the request fails, then the rejection propagates', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(axios, 'get').mockRejectedValue(requestError);

      await expect(accountSetupService.getPreCreatedUser('n2oK7@example.com')).rejects.toThrow(requestError);
    });
  });

  describe('Updating a pre-created user', () => {
    test('When a tier id is supplied, then it is not sent in the update request', async () => {
      const patchSpy = jest.spyOn(axios, 'patch').mockResolvedValue(undefined);
      const uuid = 'pre-created-uuid';
      const status = PreCreatedUserStatus.PendingSetup;
      const maxSpaceBytes = '1073741824';
      const tierId = 'tier-id';

      await accountSetupService.updatePreCreatedUser(uuid, status, maxSpaceBytes, tierId);

      expect(patchSpy).toHaveBeenCalledTimes(1);
      const sentBody = patchSpy.mock.calls[0][1];
      expect(sentBody).toEqual({ uuid, status, maxSpaceBytes });
      expect(sentBody).not.toHaveProperty('tierId');
    });

    test('When called with the optional parameters omitted, then it still sends the update request with the signed token', async () => {
      const patchSpy = jest.spyOn(axios, 'patch').mockResolvedValue(undefined);

      await accountSetupService.updatePreCreatedUser();

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith(
        gatewayUrl,
        { uuid: undefined, status: undefined, maxSpaceBytes: undefined },
        expect.objectContaining({ headers: expectedHeaders }),
      );
    });

    test('When called, then it resolves with the response returned by the request', async () => {
      const patchSpy = jest.spyOn(axios, 'patch').mockResolvedValue({});

      await accountSetupService.updatePreCreatedUser('pre-created-uuid');

      expect(patchSpy).toHaveBeenCalledWith(
        gatewayUrl,
        { uuid: 'pre-created-uuid', status: undefined, maxSpaceBytes: undefined },
        expect.objectContaining({ headers: expectedHeaders }),
      );
    });

    test('When the request fails, then the rejection propagates', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(axios, 'patch').mockRejectedValue(requestError);

      await expect(accountSetupService.updatePreCreatedUser('pre-created-uuid')).rejects.toThrow(requestError);
    });
  });
});
