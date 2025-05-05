import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { TiersRepository } from '../../../src/core/users/MongoDBTiersRepository';
import { UsersTiersRepository } from '../../../src/core/users/MongoDBUsersTiersRepository';
import { ProductsRepository } from '../../../src/core/users/ProductsRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';

const getUsersRepositoryForTest = (): UsersRepository => {
  const usersRepositoryMock: UsersRepository = {
    findUserByCustomerId: jest.fn(),
    findUserByUuid: jest.fn(),
    insertUser: jest.fn(),
    updateUser: jest.fn().mockResolvedValue(true),
    upsertUser: jest.fn(),
  };

  return usersRepositoryMock;
};

const getTiersRepository = (): TiersRepository => {
  return { findByProductId: jest.fn(), findByTierId: jest.fn() } as TiersRepository;
};

const getUsersTiersRepository = (): UsersTiersRepository => {
  return {
    deleteAllUserTiers: jest.fn(),
    deleteTierFromUser: jest.fn(),
    findTierIdByUserId: jest.fn(),
    insertTierToUser: jest.fn(),
    updateUserTier: jest.fn(),
  } as UsersTiersRepository;
};

const getProductsRepositoryForTest = (): ProductsRepository => {
  const productsRepository: ProductsRepository = {
    findByType: jest.fn(),
  };

  return productsRepository;
};

const getUsersCouponsRepositoryForTest = (): UsersCouponsRepository => {
  const usersCouponsRepositoryMock: UsersCouponsRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByUserAndCoupon: jest.fn(),
  };

  return usersCouponsRepositoryMock;
};

const getCouponsRepositoryForTest = (): CouponsRepository => {
  const couponsRepositoryMock: CouponsRepository = {
    findByCode: jest.fn(),
    findById: jest.fn(),
  };

  return couponsRepositoryMock;
};

const displayBillingRepositoryForTest = (): DisplayBillingRepository => {
  const displayBillingRepositoryMock: DisplayBillingRepository = {
    find: jest.fn(),
  };

  return displayBillingRepositoryMock;
};

const testFactory = {
  getUsersRepositoryForTest,
  getProductsRepositoryForTest,
  getUsersCouponsRepositoryForTest,
  getCouponsRepositoryForTest,
  displayBillingRepositoryForTest,
  getTiersRepository,
  getUsersTiersRepository,
};

export default testFactory;
