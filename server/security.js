import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const token = (size = 32) => randomBytes(size).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = token(16);
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = await derive(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
export function passwordError(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128 || !/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    return '密码需为 10–128 位，并包含字母和数字';
  }
  return null;
}
export function recoveryCode() {
  return token(12).toUpperCase().match(/.{1,6}/g).join('-');
}
