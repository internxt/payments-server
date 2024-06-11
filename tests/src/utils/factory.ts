import { CouponsRepository } from '../../../src/core/coupons/CouponsRepository';
import { UsersCouponsRepository } from '../../../src/core/coupons/UsersCouponsRepository';
import { DisplayBillingRepository } from '../../../src/core/users/MongoDBDisplayBillingRepository';
import { UsersRepository } from '../../../src/core/users/UsersRepository';

const getUsersRepositoryForTest = (): UsersRepository => {
  const usersRepositoryMock: UsersRepository = {
    findUserByCustomerId: jest.fn(),
    findUserByUuid: jest.fn(),
    insertUser: jest.fn(),
    updateUser: jest.fn(),
  };

  return usersRepositoryMock;
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
  getUsersCouponsRepositoryForTest,
  getCouponsRepositoryForTest,
  displayBillingRepositoryForTest,
};

export default testFactory;
