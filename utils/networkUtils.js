export const getClientIP = (req) => {
  // Try to get IP from various sources (handles proxies)
  const ip = 
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip ||
    'unknown';

  // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
  return ip.replace(/^::ffff:/, '');
};