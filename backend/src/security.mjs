import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HASH_ALGO = 'scrypt';
const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${HASH_ALGO}$${salt}$${digest}`;
}

export function verifyPassword(password, encodedHash) {
  if (!encodedHash || typeof encodedHash !== 'string') {
    return false;
  }

  const parts = encodedHash.split('$');
  if (parts.length !== 3 || parts[0] !== HASH_ALGO) {
    return false;
  }

  const [, salt, expectedDigestHex] = parts;
  const actualDigest = scryptSync(password, salt, KEY_LENGTH);
  const expectedDigest = Buffer.from(expectedDigestHex, 'hex');

  if (actualDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(actualDigest, expectedDigest);
}
