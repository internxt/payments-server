import { randomUUID } from 'crypto';
import validateUUID from '../../../src/utils/validateUUID';

describe('Validating UUID', () => {
  test('When the UUID is valid, then it should return true', () => {
    const uuid = randomUUID();

    expect(validateUUID(uuid)).toBeTruthy();
  });

  test('When the UUID is not valid, then it should return false', () => {
    expect(validateUUID('invalid-uuid')).toBeFalsy();
  });
});
