import { getUser } from './fixtures';

describe('User fixture', () => {
  describe('Generating a user', () => {
    it('When generating a user, then the UUID should be unique', () => {
      const user1 = getUser();
      const user2 = getUser();

      expect(user1.uuid).toBeDefined();
      expect(user1.uuid).not.toBe(user2.uuid);
    });

    it('When generating a user, then the customerId should be unique', () => {
      const user1 = getUser();
      const user2 = getUser();

      expect(user1.customerId).toBeDefined();
      expect(user1.customerId).not.toBe(user2.customerId);
    });

    it('When generating a user without specifying lifetime, then lifetime should be false', () => {
      const user = getUser();
      expect(user.lifetime).toBe(false);
    });

    it('When generating a user with lifetime set to true, then lifetime should be true', () => {
      const user = getUser({ lifetime: true });
      expect(user.lifetime).toBe(true);
    });

    it('When generating a user with custom parameters, then it should use the provided values', () => {
      const customUser = {
        id: 'customer-id',
        uuid: 'customer-uuid',
        customerId: 'cus_custom123',
        lifetime: true,
      };

      const user = getUser(customUser);

      expect(user.id).toBe(customUser.id);
      expect(user.uuid).toBe(customUser.uuid);
      expect(user.customerId).toBe(customUser.customerId);
      expect(user.lifetime).toBe(customUser.lifetime);
    });
  });

  describe('Ensuring uniqueness', () => {
    it('When generating multiple users, then they should all have different UUIDs and customer IDs', () => {
      const users = Array.from({ length: 5 }, () => getUser());

      const uuids = users.map((user) => user.uuid);
      const customerIds = users.map((user) => user.customerId);

      expect(new Set(uuids).size).toBe(users.length);
      expect(new Set(customerIds).size).toBe(users.length);
    });
  });
});
