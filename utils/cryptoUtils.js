import crypto from 'crypto';
import bcrypt from 'bcrypt';
import config from '../config/environment.js';

const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
  'salt',
  32
);

const IV_LENGTH = 16;

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateSessionId = () => {
  return crypto.randomBytes(32).toString('hex');
};

export const generateDeviceId = () => {
  return crypto.randomBytes(16).toString('hex');
};

export const hashPassword = async (password) => {
  return bcrypt.hash(password, config.SECURITY.BCRYPT_ROUNDS);
};

export const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

export const hashData = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

export const encryptData = (data) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(
    typeof data === 'string' ? data : JSON.stringify(data),
    'utf8',
    'hex'
  );
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
};

export const decryptData = (encryptedData) => {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

export const generateJWT = (payload, secret, expiresIn) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64');
  
  return `${header}.${body}.${signature}`;
};

export const verifyJWT = (token, secret) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const header = parts[0];
    const body = parts[1];
    const signature = parts[2];
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64');
    
    if (signature !== expectedSignature) return null;
    
    const decoded = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    
    if (decoded.exp && decoded.exp < Date.now() / 1000) return null;
    
    return decoded;
  } catch (error) {
    return null;
  }
};

export const generateTokens = (userId, sessionId, secret) => {
  const now = Math.floor(Date.now() / 1000);
  
  const accessToken = generateJWT(
    {
      userId,
      sessionId,
      type: 'access',
      iat: now,
      exp: now + 3600, // 1 hour
    },
    secret,
    '1h'
  );
  
  const refreshToken = generateJWT(
    {
      userId,
      sessionId,
      type: 'refresh',
      iat: now,
      exp: now + 7 * 24 * 3600, // 7 days
    },
    secret,
    '7d'
  );
  
  return { accessToken, refreshToken };
};

export default {
  generateOTP,
  generateSessionId,
  generateDeviceId,
  hashPassword,
  verifyPassword,
  hashData,
  encryptData,
  decryptData,
  generateJWT,
  verifyJWT,
  generateTokens,
};