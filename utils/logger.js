import fs from 'fs';
import path from 'path';
import config from '../config/environment.js';

const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const getTimestamp = () => new Date().toISOString();

const log = (level, message, meta = {}) => {
  const logEntry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...meta,
  };
  
  const logString = JSON.stringify(logEntry);
  
  // Console output
  if (config.NODE_ENV !== 'production') {
    console.log(logString);
  }
  
  // File output
  const logFile = path.join(logDir, `${level.toLowerCase()}.log`);
  fs.appendFileSync(logFile, logString + '\n');
};

export const debug = (message, meta) => log('DEBUG', message, meta);
export const info = (message, meta) => log('INFO', message, meta);
export const warn = (message, meta) => log('WARN', message, meta);
export const error = (message, meta) => log('ERROR', message, meta);

export default {
  debug,
  info,
  warn,
  error,
};