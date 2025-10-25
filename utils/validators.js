export const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const validatePhoneNumber = (phone) => {
  const regex = /^\+?[1-9]\d{1,14}$/;
  return regex.test(phone.replace(/\D/g, ''));
};

export const validatePassword = (password) => {
  return password && password.length >= 8;
};

export const validateOTP = (otp) => {
  return /^\d{6}$/.test(otp);
};

export const validateAge = (age) => {
  const ageNum = parseInt(age);
  return ageNum >= 13 && ageNum <= 150;
};

export const validateCountry = (country) => {
  return country && country.length > 0 && country.length <= 100;
};

export const validateDeviceType = (deviceType) => {
  return ['desktop', 'mobile', 'tablet'].includes(deviceType);
};

export const validateBiometricType = (type) => {
  return ['fingerprint', 'face_id', 'iris', 'voice', 'palm'].includes(type);
};

export default {
  validateEmail,
  validatePhoneNumber,
  validatePassword,
  validateOTP,
  validateAge,
  validateCountry,
  validateDeviceType,
  validateBiometricType,
};