/**
 * Password hashing — thin re-export of Better Auth's own hash/verify.
 *
 * Scripts (init, change-password) MUST use these instead of rolling their own
 * scrypt calls, so the algorithm and parameters always match the running app.
 */
export { hashPassword, verifyPassword } from 'better-auth/crypto';
