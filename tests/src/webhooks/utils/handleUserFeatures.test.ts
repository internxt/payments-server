import Stripe from 'stripe';
import { CouponsRepository } from '../../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../../src/core/users/UsersRepository';
import { Bit2MeService } from '../../../../src/services/bit2me.service';
import { PaymentService } from '../../../../src/services/payment.service';
import { TierNotFoundError, TiersService } from '../../../../src/services/tiers.service';
import { UsersService } from '../../../../src/services/users.service';
import {
  handleUserFeatures,
  HandleUserFeaturesProps,
  InvoiceNotFoundError,
} from '../../../../src/webhooks/utils/handleUserFeatures';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import axios from 'axios';
import { getCustomer, getInvoice, getLogger, getUser, newTier } from '../../fixtures';
import { User } from '../../../../src/core/users/User';
import { StorageService } from '../../../../src/services/storage.service';

const mockedUser = {
  ...getUser(),
  email: 'test@example.com',
} as User & { email: string };
const mockedTier = newTier();
const mockedCustomer = getCustomer();
const mockedPurchasedItem = getInvoice().lines.data[0];

describe('Create or update user when after successful payment', () => {
  let tiersService: TiersService;
  let tiersRepository: TiersRepository;
  let paymentService: PaymentService;
  let usersService: UsersService;
  let usersRepository: UsersRepository;
  let displayBillingRepository: DisplayBillingRepository;
  let couponsRepository: CouponsRepository;
  let usersCouponsRepository: UsersCouponsRepository;
  let usersTiersRepository: UsersTiersRepository;
  let productsRepository: ProductsRepository;
  let bit2MeService: Bit2MeService;
  let defaultProps: HandleUserFeaturesProps;
  let storageService: StorageService;

  beforeEach(() => {
    tiersRepository = testFactory.getTiersRepository();
    usersRepository = testFactory.getUsersRepositoryForTest();
    usersRepository = testFactory.getUsersRepositoryForTest();
    displayBillingRepository = {} as DisplayBillingRepository;
    couponsRepository = testFactory.getCouponsRepositoryForTest();
    usersCouponsRepository = testFactory.getUsersCouponsRepositoryForTest();
    usersTiersRepository = testFactory.getUsersTiersRepository();
    productsRepository = testFactory.getProductsRepositoryForTest();
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

    storageService = new StorageService(config, axios);

    tiersService = new TiersService(
      usersService,
      paymentService,
      tiersRepository,
      usersTiersRepository,
      storageService,
      config,
    );

    defaultProps = {
      user: mockedUser,
      purchasedItem: mockedPurchasedItem,
      paymentService,
      customer: mockedCustomer,
      tiersService,
      logger: getLogger(),
    };
  });

  it('when the product does not exists, then an error indicating so is thrown', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);

    await expect(handleUserFeatures(defaultProps)).rejects.toThrow(tierNotFoundError);
  });

  it('When the user does not have tiers, then it should insert a new tier', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await handleUserFeatures(defaultProps);

    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem,
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
    );
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  it('when the user has existing tiers and the second invoice has a product that is not mapped, then an error indicating so is thrown', async () => {
    const randomMockedTier = newTier();
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedTier]);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: randomMockedTier.productId,
        bytesInPlan: '',
      },
      {
        ...mockedInvoices,
        pdf: '',
        product: randomMockedTier.productId,
        bytesInPlan: '',
      },
    ]);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await expect(handleUserFeatures(defaultProps)).rejects.toThrow(InvoiceNotFoundError);

    expect(spyInsert).toHaveBeenCalledTimes(0);
    expect(spyApplyTier).not.toHaveBeenCalled();
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  it('when the user has existing tiers, then it should update from that old tier to the new tier', async () => {
    const mockedOldTier = newTier();
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockResolvedValue([mockedOldTier]);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedOldTier.productId,
        bytesInPlan: '',
      },
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedOldTier.productId,
        bytesInPlan: '',
      },
    ]);
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser').mockResolvedValue();
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    await handleUserFeatures(defaultProps);

    expect(spyUpdate).toHaveBeenCalledTimes(1);
    expect(spyUpdate).toHaveBeenCalledWith(mockedUser.id, mockedOldTier.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(
      mockedUser,
      mockedCustomer,
      mockedPurchasedItem,
      (mockedPurchasedItem.price?.product as Stripe.Product).id,
    );
    expect(spyInsert).not.toHaveBeenCalled();
  });
});
