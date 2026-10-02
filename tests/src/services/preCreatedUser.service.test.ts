import config from '../../../src/config';
import { PreCreatedUserService } from '../../../src/services/preCreatedUser.service';
import { PreCreatedUser } from '../../../src/infrastructure/domain/entities/preCreatedUser';
import { PreCreatedUserStatus } from '../../../src/infrastructure/domain/entities/preCreatedUser';
import { createHttpClient } from '../../../src/infrastructure/http/httpClient';
import { HttpResponseError } from '../../../src/infrastructure/http/HttpResponseError';
import { HttpErrorCode } from '../../../src/errors/httpErrorCodes';
import { PreCreatedUserNotFoundError } from '../../../src/errors/PreCreatedUsersErrors';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mocked-jwt-token'),
}));

const httpClient = createHttpClient();
let preCreatedUserService: PreCreatedUserService;

const userNotFoundError = new HttpResponseError('User not found', 404, HttpErrorCode.UserNotFound, {
  code: HttpErrorCode.UserNotFound,
});

beforeEach(() => {
  preCreatedUserService = new PreCreatedUserService(httpClient, config);
  jest.restoreAllMocks();
});

describe('Pre Created User Service tests', () => {
  const gatewayUrl = `${config.DRIVE_NEW_GATEWAY_URL}/gateway/users/pre-create`;
  const expectedHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer mocked-jwt-token',
  };
  const gatewayResponse = { data: { uuid: 'pre-created-uuid', status: PreCreatedUserStatus.AwaitingPayment } };

  describe('Creating a pre-created user', () => {
    test('When called, then it requests the creation of the pre-created user with the signed token', async () => {
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValue(gatewayResponse);
      const email = 'n2oK7@example.com';

      await preCreatedUserService.create(email);

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        gatewayUrl,
        { email },
        expect.objectContaining({ headers: expectedHeaders }),
      );
    });

    test('When called, then it resolves with the created pre-created user', async () => {
      jest.spyOn(httpClient, 'post').mockResolvedValue(gatewayResponse);

      const result = await preCreatedUserService.create('n2oK7@example.com');

      expect(result).toStrictEqual(PreCreatedUser.toDomain(gatewayResponse.data));
    });

    test('When the request fails, then the rejection propagates', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(httpClient, 'post').mockRejectedValue(requestError);

      await expect(preCreatedUserService.create('n2oK7@example.com')).rejects.toThrow(requestError);
    });
  });

  describe('Retrieving a pre-created user', () => {
    test('When called, then it fetches the pre-created user by email with the signed token', async () => {
      const getSpy = jest.spyOn(httpClient, 'get').mockResolvedValue(gatewayResponse);
      const email = 'n2oK7@example.com';

      await preCreatedUserService.get(email);

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith(
        gatewayUrl,
        expect.objectContaining({
          headers: expectedHeaders,
          params: { email },
        }),
      );
    });

    test('When called, then it resolves with the pre-created user returned by the gateway', async () => {
      jest.spyOn(httpClient, 'get').mockResolvedValue(gatewayResponse);

      const result = await preCreatedUserService.get('n2oK7@example.com');

      expect(result).toStrictEqual(PreCreatedUser.toDomain(gatewayResponse.data));
    });

    test('When the retrieved user is pending to set up the account, then the resulting user reflects it', async () => {
      jest
        .spyOn(httpClient, 'get')
        .mockResolvedValue({ data: { uuid: 'pre-created-uuid', status: PreCreatedUserStatus.PendingSetup } });

      const result = await preCreatedUserService.get('n2oK7@example.com');

      expect(result.isPendingStatus).toBe(true);
    });

    test('When the gateway reports the user as not found, then a domain error is thrown instead', async () => {
      jest.spyOn(httpClient, 'get').mockRejectedValue(userNotFoundError);

      await expect(preCreatedUserService.get('n2oK7@example.com')).rejects.toThrow(PreCreatedUserNotFoundError);
    });

    test('When the request fails for any other reason, then the rejection propagates untouched', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(httpClient, 'get').mockRejectedValue(requestError);

      await expect(preCreatedUserService.get('n2oK7@example.com')).rejects.toThrow(requestError);
    });
  });

  describe('Getting or creating a pre-created user', () => {
    test('When the user already exists, then it is returned without creating a new one', async () => {
      jest.spyOn(httpClient, 'get').mockResolvedValue(gatewayResponse);
      const postSpy = jest.spyOn(httpClient, 'post');

      const result = await preCreatedUserService.getOrCreate('n2oK7@example.com');

      expect(result).toStrictEqual(PreCreatedUser.toDomain(gatewayResponse.data));
      expect(postSpy).not.toHaveBeenCalled();
    });

    test('When the user does not exist yet, then it is created', async () => {
      jest.spyOn(httpClient, 'get').mockRejectedValue(userNotFoundError);
      const postSpy = jest.spyOn(httpClient, 'post').mockResolvedValue(gatewayResponse);

      const result = await preCreatedUserService.getOrCreate('n2oK7@example.com');

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual(PreCreatedUser.toDomain(gatewayResponse.data));
    });

    test('When the lookup fails for any other reason, then no user is created and the rejection propagates', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(httpClient, 'get').mockRejectedValue(requestError);
      const postSpy = jest.spyOn(httpClient, 'post');

      await expect(preCreatedUserService.getOrCreate('n2oK7@example.com')).rejects.toThrow(requestError);
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  describe('Updating a pre-created user', () => {
    test('When called with every attribute, then all of them are sent with the signed token', async () => {
      const patchSpy = jest.spyOn(httpClient, 'patch').mockResolvedValue(undefined);
      const attributes = {
        uuid: 'pre-created-uuid',
        status: PreCreatedUserStatus.PendingSetup,
        maxSpaceBytes: '1073741824',
        tierId: 'tier-id',
      };

      await preCreatedUserService.update(attributes);

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith(
        gatewayUrl,
        attributes,
        expect.objectContaining({ headers: expectedHeaders }),
      );
    });

    test('When called with only some attributes, then the omitted ones are sent as undefined', async () => {
      const patchSpy = jest.spyOn(httpClient, 'patch').mockResolvedValue(undefined);

      await preCreatedUserService.update({ uuid: 'pre-created-uuid' });

      expect(patchSpy).toHaveBeenCalledTimes(1);
      expect(patchSpy).toHaveBeenCalledWith(
        gatewayUrl,
        { uuid: 'pre-created-uuid', status: undefined, maxSpaceBytes: undefined, tierId: undefined },
        expect.objectContaining({ headers: expectedHeaders }),
      );
    });

    test('When the request fails, then the rejection propagates', async () => {
      const requestError = new Error('Network error');
      jest.spyOn(httpClient, 'patch').mockRejectedValue(requestError);

      await expect(preCreatedUserService.update({ uuid: 'pre-created-uuid' })).rejects.toThrow(requestError);
    });
  });
});
