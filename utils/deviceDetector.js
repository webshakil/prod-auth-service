import { UAParser } from 'ua-parser-js';


export const parseUserAgent = (userAgentString) => {
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();
  
  return {
    browser: result.browser.name || 'Unknown',
    browserVersion: result.browser.version || 'Unknown',
    os: result.os.name || 'Unknown',
    osVersion: result.os.version || 'Unknown',
    device: result.device.name || 'Desktop',
    deviceType: result.device.type || 'desktop',
    deviceBrand: result.device.vendor || 'Unknown',
    deviceModel: result.device.model || 'Unknown',
  };
};

export const getDeviceFingerprint = (req) => {
  const crypto = require('crypto');
  
  const fingerprint = {
    userAgent: req.headers['user-agent'],
    acceptLanguage: req.headers['accept-language'],
    acceptEncoding: req.headers['accept-encoding'],
    accept: req.headers['accept'],
    timezone: req.headers['x-timezone'] || 'Unknown',
    screenResolution: req.headers['x-screen-resolution'] || 'Unknown',
  };
  
  const fingerprintString = JSON.stringify(fingerprint);
  const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
  
  return { fingerprint, hash };
};

export const extractDeviceInfo = (req) => {
  const userAgentString = req.headers['user-agent'];
  const deviceInfo = parseUserAgent(userAgentString);
  
  return {
    ...deviceInfo,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: userAgentString,
  };
};

export default {
  parseUserAgent,
  getDeviceFingerprint,
  extractDeviceInfo,
};