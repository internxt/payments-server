import axios from 'axios';
import Stripe from 'stripe';
import config from '../../../../src/config';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { StorageService } from '../../../../src/services/storage.service';
import { TiersService } from '../../../../src/services/tiers.service';
import { UsersService } from '../../../../src/services/users.service';
import testFactory from '../../utils/factory';
import { PaymentService } from '../../../../src/services/payment.service';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { getCustomer, getLogger, getUser, newTier, voidPromise } from '../../fixtures';
import { handleCancelPlan } from '../../../../src/webhooks/utils/handleCancelPlan';

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
});

describe('Handling canceled plans and refunded lifetimes', () => {
  it('When the user cancels a subscription, then the tier is removed and the free space is applied', async () => {
    const mockedCustomer = getCustomer();
    const log = getLogger();
    const mockedUser = getUser({ customerId: mockedCustomer.id, lifetime: false });
    const mockedTier = newTier();

    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation(voidPromise);
    const removeTierSpy = jest.spyOn(tiersService, 'removeTier').mockImplementation(voidPromise);
    const deleteTierFromUserSpy = jest.spyOn(tiersService, 'deleteTierFromUser').mockImplementation(voidPromise);

    await handleCancelPlan({
      customerEmail: mockedCustomer.email as string,
      customerId: mockedCustomer.id,
      productId: mockedTier.productId,
      tiersService,
      usersService,
      log,
    });

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedTier.productId,
      log,
    );
    expect(deleteTierFromUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });

  it('When the user cancels a lifetime (refund), then the lifetime field is set to false, the tier is removed and the free space is applied', async () => {
    const mockedCustomer = getCustomer();
    const log = getLogger();
    const mockedUser = getUser({ customerId: mockedCustomer.id, lifetime: true });
    const mockedTier = newTier();

    jest.spyOn(usersService, 'findUserByCustomerID').mockResolvedValue(mockedUser);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    const updateUserSpy = jest.spyOn(usersService, 'updateUser').mockImplementation(async (customerId, updateData) => {
      if (customerId === mockedCustomer.id) {
        Object.assign(mockedUser, updateData);
      }
      return Promise.resolve();
    });
    const removeTierSpy = jest.spyOn(tiersService, 'removeTier').mockImplementation(voidPromise);
    const deleteTierFromUserSpy = jest.spyOn(tiersService, 'deleteTierFromUser').mockImplementation(voidPromise);

    await handleCancelPlan({
      customerEmail: mockedCustomer.email as string,
      customerId: mockedCustomer.id,
      productId: mockedTier.productId,
      tiersService,
      usersService,
      log,
    });

    expect(updateUserSpy).toHaveBeenCalledWith(mockedCustomer.id, { lifetime: false });
    expect(mockedUser.lifetime).toBe(false);
    expect(removeTierSpy).toHaveBeenCalledWith(
      { ...mockedUser, email: mockedCustomer.email as string },
      mockedTier.productId,
      log,
    );
    expect(deleteTierFromUserSpy).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
  });
});
