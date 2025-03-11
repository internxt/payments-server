import axios from 'axios';
import Stripe from 'stripe';
import config from '../../../../src/config';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { PaymentService } from '../../../../src/services/payment.service';
import { createOrUpdateUser, StorageService, updateUserTier } from '../../../../src/services/storage.service';
import { TiersService } from '../../../../src/services/tiers.service';
import { UsersService } from '../../../../src/services/users.service';
import testFactory from '../../utils/factory';
import { getLogger, newTier as getTier, getUser } from '../../fixtures';
import {
  ExpandStorageNotAvailableError,
  handleStackLifetimeStorage,
} from '../../../../src/webhooks/utils/handleStackLifetimeStorage';
import { fetchUserStorage } from '../../../../src/utils/fetchUserStorage';

jest.mock('../../../../src/utils/fetchUserStorage');

jest.mock('../../../../src/services/storage.service', () => {
  const actualModule = jest.requireActual('../../../../src/services/storage.service');

  return {
    ...actualModule,
    createOrUpdateUser: jest.fn(),
    updateUserTier: jest.fn(),
    canUserStackStorage: jest.fn(),
  };
});

let usersRepository: UsersRepository;
let displayBillingRepository: DisplayBillingRepository;
let couponsRepository: CouponsRepository;
let usersCouponsRepository: UsersCouponsRepository;
let productsRepository: ProductsRepository;
let tiersRepository: TiersRepository;
let usersTiersRepository: UsersTiersRepository;
let bit2MeService: Bit2MeService;
let usersService: UsersService;
let paymentService: PaymentService;
let storageService: StorageService;
let tiersService: TiersService;

describe('Stack lifetime storage', () => {
  let mockedUser = { ...getUser(), email: 'example@inxt.com' };
  let mockedLogger = getLogger();
  let mockedOldTier = getTier();
  let mockedNewTier = getTier();
  beforeEach(() => {
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    storageService = new StorageService(config, axios);
    productsRepository = testFactory.getProductsRepositoryForTest();
    tiersRepository = testFactory.getTiersRepository();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    bit2MeService = new Bit2MeService(config, axios);
    paymentService = new PaymentService(
      new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }),
      productsRepository,
      bit2MeService,
    );

    usersService = new UsersService(
      usersRepository,
      paymentService,
      displayBillingRepository,
      couponsRepository,
      usersCouponsRepository,
      config,
      axios,
    );

    tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    mockedUser = { ...getUser(), email: 'example@inxt.com' };
    mockedLogger = getLogger();
    mockedOldTier = getTier();
    mockedNewTier = getTier();
  });

  afterEach(() => jest.restoreAllMocks());

  it("When the user storage can't be expanded, then an error indicating so is thrown", async () => {
    (fetchUserStorage as jest.Mock).mockResolvedValue({
      canExpand: false,
    });

    await expect(
      handleStackLifetimeStorage({
        logger: mockedLogger,
        newTier: mockedNewTier,
        oldTier: mockedOldTier,

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
    (createOrUpdateUser as jest.Mock).mockImplementation();
    (updateUserTier as jest.Mock).mockImplementation();

    await handleStackLifetimeStorage({
      logger: mockedLogger,
      newTier: mockedNewTier,
      oldTier: mockedOldTier,

      user: mockedUser,
    });

    expect(createOrUpdateUser).toHaveBeenCalledWith(totalSpaceBytes.toString(), mockedUser.email, config);
    expect(updateUserTier).toHaveBeenCalledWith(mockedUser.uuid, mockedOldTier.productId, config);
  });
});
