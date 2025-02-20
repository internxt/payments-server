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
import { createOrUpdateTierFromUser } from '../../../../src/webhooks/utils/createOrUpdateTierFromUser';
import testFactory from '../../utils/factory';
import config from '../../../../src/config';
import axios from 'axios';
import { getInvoice, getUser, newTier } from '../../fixtures';
import { User } from '../../../../src/core/users/User';

const mockedUser = {
  ...getUser(),
  email: 'test@example.com',
} as User & { email: string };
const mockedTier = newTier();

describe('Create or update user when afetr successful payment', () => {
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
  let defaultProps: any;

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
    tiersService = new TiersService(usersService, paymentService, tiersRepository, usersTiersRepository, config);

    defaultProps = {
      isBusinessPlan: false,
      productId: mockedTier.productId,
      usersService,
      user: mockedUser,
      paymentService,
      customerId: mockedUser.customerId,
      tiersService,
    };
  });

  it('when the product does not exists, then an error indicating so is thrown', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockRejectedValue(tierNotFoundError);

    await expect(createOrUpdateTierFromUser(defaultProps)).rejects.toThrow(tierNotFoundError);
  });

  it('When the user does not have tiers, then it should insert a new tier', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await createOrUpdateTierFromUser(defaultProps);

    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(mockedUser, mockedTier.productId);
    expect(spyUpdate).not.toHaveBeenCalled();
  });

  it('when the user has existing tiers and the second invoice has a product not in the DB list, then it should insert a new tier', async () => {
    const tierNotFoundError = new TierNotFoundError('Tier not found');
    const mockedInvoices = getInvoice(undefined, undefined, mockedTier.productId);
    jest.spyOn(tiersService, 'getTierProductsByProductsId').mockResolvedValue(mockedTier);
    jest.spyOn(tiersService, 'getTiersProductsByUserId').mockRejectedValue(tierNotFoundError);
    jest.spyOn(paymentService, 'getDriveInvoices').mockResolvedValue([
      {
        ...mockedInvoices,
        pdf: '',
        product: mockedTier.productId,
        bytesInPlan: '',
      },
    ]);
    const spyInsert = jest.spyOn(tiersService, 'insertTierToUser');
    const spyUpdate = jest.spyOn(tiersService, 'updateTierToUser');
    const spyApplyTier = jest.spyOn(tiersService, 'applyTier').mockResolvedValue();

    await createOrUpdateTierFromUser(defaultProps);

    expect(spyInsert).toHaveBeenCalledTimes(1);
    expect(spyInsert).toHaveBeenCalledWith(mockedUser.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(mockedUser, mockedTier.productId);
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
    await createOrUpdateTierFromUser(defaultProps);

    expect(spyUpdate).toHaveBeenCalledTimes(1);
    expect(spyUpdate).toHaveBeenCalledWith(mockedUser.id, mockedOldTier.id, mockedTier.id);
    expect(spyApplyTier).toHaveBeenCalledWith(mockedUser, mockedTier.productId);
    expect(spyInsert).not.toHaveBeenCalled();
  });
});
