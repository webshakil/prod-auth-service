import { query } from '../config/database.js';
import logger from '../utils/logger.js';

// ✅ CHECK USER IN DATABASE
export const checkUserInDatabase = async (email, phone) => {
  try {
    let user = null;

    // If only email provided
    if (email && !phone) {
      const result = await query(
        'SELECT user_id, user_email, user_phone FROM public.users WHERE user_email = $1',
        [email]
      );
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    }
    // If only phone provided
    else if (phone && !email) {
      const result = await query(
        'SELECT user_id, user_email, user_phone FROM public.users WHERE user_phone = $1',
        [phone]
      );
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    }
    // If both email and phone provided
    else if (email && phone) {
      const result = await query(
        'SELECT user_id, user_email, user_phone FROM public.users WHERE (user_email = $1 OR user_phone = $2)',
        [email, phone]
      );
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    }

    return user || null;
  } catch (error) {
    logger.error('Error checking user in database', { error: error.message });
    throw error;
  }
};

// ✅ GET USER ROLES
export const getUserRoles = async (userId) => {
  try {
    const result = await query(
      'SELECT role_name FROM votteryy_user_roles WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    return result.rows.length > 0 ? result.rows.map(row => row.role_name) : ['Voter'];
  } catch (error) {
    logger.error('Error getting user roles', { error: error.message, userId });
    return ['Voter']; // Default role
  }
};

// ✅ GET USER SUBSCRIPTION INFO
export const getUserSubscriptionInfo = async (userId) => {
  try {
    const result = await query(
      `SELECT subscription_type, is_subscribed, election_creation_limit 
       FROM votteryy_user_subscriptions WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Default subscription for new user
    return {
      subscription_type: 'Free',
      is_subscribed: false,
      election_creation_limit: 2,
    };
  } catch (error) {
    logger.error('Error getting user subscription info', { error: error.message, userId });
    // Return default subscription on error
    return {
      subscription_type: 'Free',
      is_subscribed: false,
      election_creation_limit: 2,
    };
  }
};

// ✅ CHECK IF FIRST TIME USER
export const isFirstTimeUser = async (userId) => {
  try {
    const result = await query(
      'SELECT COUNT(*) as count FROM votteryy_user_details WHERE user_id = $1',
      [userId]
    );
    return parseInt(result.rows[0].count) === 0;
  } catch (error) {
    logger.error('Error checking if first time user', { error: error.message, userId });
    return true; // Assume first time on error
  }
};

// ✅ GET USER AUTH DETAILS (Complete User Profile)
export const getUserAuthDetails = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    console.log('Fetching user auth details for userId:', userId);

    // Get user from main Sngine database
    const userResult = await query(
      `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
              user_lastname, user_registered, user_country, user_gender, 
              user_picture, user_verified, user_banned, user_activated 
       FROM public.users 
       WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      logger.warn('User not found', { userId });
      return null;
    }

    const user = userResult.rows[0];
    console.log('User from public.users:', {
      user_id: user.user_id,
      user_email: user.user_email,
      user_phone: user.user_phone,
    });

    // Get roles
    console.log('Fetching user roles...');
    const roles = await getUserRoles(userId);
    console.log('User roles:', roles);

    // Get subscription info
    console.log('Fetching subscription info...');
    const subscription = await getUserSubscriptionInfo(userId);
    console.log('User subscription:', subscription);

    // Get user details (votteryy_user_details)
    let details = {};
    try {
      console.log('Fetching votteryy_user_details...');
      const detailsResult = await query(
        `SELECT first_name, last_name, age, gender, country, city, 
                timezone, language FROM votteryy_user_details WHERE user_id = $1`,
        [userId]
      );
      details = detailsResult.rows[0] || {};
      console.log('User details:', details);
    } catch (err) {
      logger.warn('Error fetching user details', { error: err.message, userId });
      console.warn('Could not fetch user details, continuing with empty object');
    }

    // Get device info
    let device = {};
    try {
      console.log('Fetching device info...');
      const deviceResult = await query(
        `SELECT device_id, device_type, os_name, browser_name, ip_address, 
                is_primary FROM votteryy_user_devices WHERE user_id = $1 
         AND is_primary = true LIMIT 1`,
        [userId]
      );
      device = deviceResult.rows[0] || {};
      console.log('Device info:', device);
    } catch (err) {
      logger.warn('Error fetching device info', { error: err.message, userId });
      console.warn('Could not fetch device info, continuing with empty object');
    }

    // Get biometric info
    let biometric = {};
    try {
      console.log('Fetching biometric info...');
      const biometricResult = await query(
        `SELECT biometric_type, is_verified FROM votteryy_user_biometrics 
         WHERE user_id = $1 AND is_primary = true LIMIT 1`,
        [userId]
      );
      biometric = biometricResult.rows[0] || {};
      console.log('Biometric info:', biometric);
    } catch (err) {
      logger.warn('Error fetching biometric info', { error: err.message, userId });
      console.warn('Could not fetch biometric info, continuing with empty object');
    }

    const userProfile = {
      userId: user.user_id,
      email: user.user_email, // ✅ FROM public.users
      phone: user.user_phone, // ✅ FROM public.users
      username: user.user_name,
      firstName: user.user_firstname || details.first_name,
      lastName: user.user_lastname || details.last_name,
      age: details.age || null,
      gender: details.gender || user.user_gender || null,
      country: details.country || user.user_country || null,
      city: details.city || null,
      timezone: details.timezone || null,
      language: details.language || 'en_us',
      picture: user.user_picture || null,
      roles: roles || ['Voter'],
      primaryRole: (roles && roles[0]) || 'Voter',
      isAdmin: roles && roles.includes('Admin'),
      isModerator: roles && roles.includes('Moderator'),
      isSubscribed: subscription.is_subscribed || false,
      subscriptionType: subscription.subscription_type || 'Free',
      electionCreationLimit: subscription.election_creation_limit || 2,
      isVerified: user.user_verified || false,
      isBanned: user.user_banned || false,
      isActivated: user.user_activated || false,
      registrationDate: user.user_registered || null,
      device: {
        deviceId: device.device_id || null,
        deviceType: device.device_type || null,
        osName: device.os_name || null,
        browserName: device.browser_name || null,
        ipAddress: device.ip_address || null,
      },
      biometric: {
        type: biometric.biometric_type || null,
        isVerified: biometric.is_verified || false,
      },
    };

    console.log('Complete user profile:', userProfile);
    logger.debug('User auth details retrieved', { userId });
    return userProfile;
  } catch (error) {
    logger.error('Error getting user auth details', { error: error.message, userId });
    console.error('Error in getUserAuthDetails:', error.message);
    throw error;
  }
};

// ✅ GET COMPLETE USER PROFILE (Alias for getUserAuthDetails)
export const getCompleteUserProfile = async (userId) => {
  console.log('getCompleteUserProfile called for userId:', userId);
  return getUserAuthDetails(userId);
};

// ✅ UPDATE USER LAST LOGIN
export const updateUserLastLogin = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    await query(
      'UPDATE public.users SET user_lastlogin = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userId]
    );

    logger.info('User last login updated', { userId });
  } catch (error) {
    logger.error('Error updating user last login', { error: error.message, userId });
    // Don't throw, just log
  }
};

// ✅ CHECK USER SUBSCRIPTION
export const checkUserSubscription = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT is_subscribed, subscription_type, election_creation_limit 
       FROM votteryy_user_subscriptions 
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        isSubscribed: false,
        subscriptionType: 'Free',
        electionCreationLimit: 2,
      };
    }

    const sub = result.rows[0];
    return {
      isSubscribed: sub.is_subscribed || false,
      subscriptionType: sub.subscription_type || 'Free',
      electionCreationLimit: sub.election_creation_limit || 2,
    };
  } catch (error) {
    logger.error('Error checking user subscription', { error: error.message, userId });
    return {
      isSubscribed: false,
      subscriptionType: 'Free',
      electionCreationLimit: 2,
    };
  }
};

// ✅ GET USER BY ID
export const getUserById = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT 
        user_id,
        user_email,
        user_phone,
        user_name,
        user_firstname,
        user_lastname,
        user_activated,
        user_approved,
        user_banned,
        user_lastlogin,
        user_verified
       FROM public.users 
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      logger.warn('User not found', { userId });
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error getting user by ID', { error: error.message, userId });
    throw error;
  }
};

// ✅ CHECK IF USER IS ADMIN
export const isUserAdmin = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT COUNT(*) as count 
       FROM votteryy_user_roles 
       WHERE user_id = $1 AND role_name = 'Admin' AND is_active = true`,
      [userId]
    );

    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error('Error checking if user is admin', { error: error.message, userId });
    return false;
  }
};

// ✅ CHECK IF USER IS MODERATOR
export const isUserModerator = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT COUNT(*) as count 
       FROM votteryy_user_roles 
       WHERE user_id = $1 AND role_name = 'Moderator' AND is_active = true`,
      [userId]
    );

    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error('Error checking if user is moderator', { error: error.message, userId });
    return false;
  }
};

// ✅ GET USER DEVICE INFO
export const getUserDeviceInfo = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT device_id, device_type, os_name, browser_name, ip_address, is_primary, is_trusted
       FROM votteryy_user_devices 
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows || [];
  } catch (error) {
    logger.error('Error getting user device info', { error: error.message, userId });
    return [];
  }
};

// ✅ GET USER BIOMETRIC INFO
export const getUserBiometricInfo = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await query(
      `SELECT biometric_type, is_verified, is_primary, verification_count
       FROM votteryy_user_biometrics 
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows || [];
  } catch (error) {
    logger.error('Error getting user biometric info', { error: error.message, userId });
    return [];
  }
};

// ✅ EXPORT ALL FUNCTIONS
export default {
  checkUserInDatabase,
  getUserRoles,
  getUserSubscriptionInfo,
  isFirstTimeUser,
  getUserAuthDetails,
  getCompleteUserProfile,
  updateUserLastLogin,
  checkUserSubscription,
  getUserById,
  isUserAdmin,
  isUserModerator,
  getUserDeviceInfo,
  getUserBiometricInfo,
};
// import { query } from '../config/database.js';
// import logger from '../utils/logger.js';

// // ✅ CHECK USER IN DATABASE
// export const checkUserInDatabase = async (email, phone) => {
//   try {
//     let user = null;

//     // If only email provided
//     if (email && !phone) {
//       const result = await query(
//         'SELECT user_id, user_email, user_phone FROM public.users WHERE user_email = $1',
//         [email]
//       );
//       if (result.rows.length > 0) {
//         user = result.rows[0];
//       }
//     }
//     // If only phone provided
//     else if (phone && !email) {
//       const result = await query(
//         'SELECT user_id, user_email, user_phone FROM public.users WHERE user_phone = $1',
//         [phone]
//       );
//       if (result.rows.length > 0) {
//         user = result.rows[0];
//       }
//     }
//     // If both email and phone provided
//     else if (email && phone) {
//       const result = await query(
//         'SELECT user_id, user_email, user_phone FROM public.users WHERE (user_email = $1 OR user_phone = $2)',
//         [email, phone]
//       );
//       if (result.rows.length > 0) {
//         user = result.rows[0];
//       }
//     }

//     return user || null;
//   } catch (error) {
//     logger.error('Error checking user in database', { error: error.message });
//     throw error;
//   }
// };

// // ✅ GET USER ROLES
// export const getUserRoles = async (userId) => {
//   try {
//     const result = await query(
//       'SELECT role_name FROM votteryy_user_roles WHERE user_id = $1 AND is_active = true',
//       [userId]
//     );
//     return result.rows.length > 0 ? result.rows.map(row => row.role_name) : ['Voter'];
//   } catch (error) {
//     logger.error('Error getting user roles', { error: error.message, userId });
//     return ['Voter']; // Default role
//   }
// };

// // ✅ GET USER SUBSCRIPTION INFO
// export const getUserSubscriptionInfo = async (userId) => {
//   try {
//     const result = await query(
//       `SELECT subscription_type, is_subscribed, election_creation_limit 
//        FROM votteryy_user_subscriptions WHERE user_id = $1`,
//       [userId]
//     );

//     if (result.rows.length > 0) {
//       return result.rows[0];
//     }

//     // Default subscription for new user
//     return {
//       subscription_type: 'Free',
//       is_subscribed: false,
//       election_creation_limit: 2,
//     };
//   } catch (error) {
//     logger.error('Error getting user subscription info', { error: error.message, userId });
//     // Return default subscription on error
//     return {
//       subscription_type: 'Free',
//       is_subscribed: false,
//       election_creation_limit: 2,
//     };
//   }
// };

// // ✅ CHECK IF FIRST TIME USER
// export const isFirstTimeUser = async (userId) => {
//   try {
//     const result = await query(
//       'SELECT COUNT(*) as count FROM votteryy_user_details WHERE user_id = $1',
//       [userId]
//     );
//     return parseInt(result.rows[0].count) === 0;
//   } catch (error) {
//     logger.error('Error checking if first time user', { error: error.message, userId });
//     return true; // Assume first time on error
//   }
// };

// // ✅ GET USER AUTH DETAILS (Complete User Profile)
// export const getUserAuthDetails = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     // Get user from main Sngine database
//     const userResult = await query(
//       `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
//               user_lastname, user_registered, user_country, user_gender, 
//               user_picture, user_verified, user_banned, user_activated 
//        FROM public.users 
//        WHERE user_id = $1`,
//       [userId]
//     );

//     if (userResult.rows.length === 0) {
//       logger.warn('User not found', { userId });
//       return null;
//     }

//     const user = userResult.rows[0];

//     // Get roles
//     const roles = await getUserRoles(userId);

//     // Get subscription info
//     const subscription = await getUserSubscriptionInfo(userId);

//     // Get user details (votteryy_user_details)
//     let details = {};
//     try {
//       const detailsResult = await query(
//         `SELECT first_name, last_name, age, gender, country, city, 
//                 timezone, language FROM votteryy_user_details WHERE user_id = $1`,
//         [userId]
//       );
//       details = detailsResult.rows[0] || {};
//     } catch (err) {
//       logger.warn('Error fetching user details', { error: err.message, userId });
//     }

//     // Get device info
//     let device = {};
//     try {
//       const deviceResult = await query(
//         `SELECT device_id, device_type, os_name, browser_name, ip_address, 
//                 is_primary FROM votteryy_user_devices WHERE user_id = $1 
//          AND is_primary = true LIMIT 1`,
//         [userId]
//       );
//       device = deviceResult.rows[0] || {};
//     } catch (err) {
//       logger.warn('Error fetching device info', { error: err.message, userId });
//     }

//     // Get biometric info
//     let biometric = {};
//     try {
//       const biometricResult = await query(
//         `SELECT biometric_type, is_verified FROM votteryy_user_biometrics 
//          WHERE user_id = $1 AND is_primary = true LIMIT 1`,
//         [userId]
//       );
//       biometric = biometricResult.rows[0] || {};
//     } catch (err) {
//       logger.warn('Error fetching biometric info', { error: err.message, userId });
//     }

//     const userProfile = {
//       userId: user.user_id,
//       email: user.user_email,
//       phone: user.user_phone,
//       username: user.user_name,
//       firstName: user.user_firstname || details.first_name,
//       lastName: user.user_lastname || details.last_name,
//       age: details.age || null,
//       gender: details.gender || user.user_gender || null,
//       country: details.country || user.user_country || null,
//       city: details.city || null,
//       timezone: details.timezone || null,
//       language: details.language || 'en_us',
//       picture: user.user_picture || null,
//       roles: roles || ['Voter'],
//       primaryRole: (roles && roles[0]) || 'Voter',
//       isAdmin: roles && roles.includes('Admin'),
//       isModerator: roles && roles.includes('Moderator'),
//       isSubscribed: subscription.is_subscribed || false,
//       subscriptionType: subscription.subscription_type || 'Free',
//       electionCreationLimit: subscription.election_creation_limit || 2,
//       isVerified: user.user_verified || false,
//       isBanned: user.user_banned || false,
//       isActivated: user.user_activated || false,
//       registrationDate: user.user_registered || null,
//       device: {
//         deviceId: device.device_id || null,
//         deviceType: device.device_type || null,
//         osName: device.os_name || null,
//         browserName: device.browser_name || null,
//         ipAddress: device.ip_address || null,
//       },
//       biometric: {
//         type: biometric.biometric_type || null,
//         isVerified: biometric.is_verified || false,
//       },
//     };

//     logger.debug('User auth details retrieved', { userId });
//     return userProfile;
//   } catch (error) {
//     logger.error('Error getting user auth details', { error: error.message, userId });
//     throw error;
//   }
// };

// // ✅ GET COMPLETE USER PROFILE (Alias for getUserAuthDetails)
// export const getCompleteUserProfile = async (userId) => {
//   return getUserAuthDetails(userId);
// };

// // ✅ UPDATE USER LAST LOGIN
// export const updateUserLastLogin = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     await query(
//       'UPDATE public.users SET user_lastlogin = CURRENT_TIMESTAMP WHERE user_id = $1',
//       [userId]
//     );

//     logger.info('User last login updated', { userId });
//   } catch (error) {
//     logger.error('Error updating user last login', { error: error.message, userId });
//     // Don't throw, just log
//   }
// };

// // ✅ CHECK USER SUBSCRIPTION
// export const checkUserSubscription = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     const result = await query(
//       `SELECT is_subscribed, subscription_type, election_creation_limit 
//        FROM votteryy_user_subscriptions 
//        WHERE user_id = $1`,
//       [userId]
//     );

//     if (result.rows.length === 0) {
//       return {
//         isSubscribed: false,
//         subscriptionType: 'Free',
//         electionCreationLimit: 2,
//       };
//     }

//     const sub = result.rows[0];
//     return {
//       isSubscribed: sub.is_subscribed || false,
//       subscriptionType: sub.subscription_type || 'Free',
//       electionCreationLimit: sub.election_creation_limit || 2,
//     };
//   } catch (error) {
//     logger.error('Error checking user subscription', { error: error.message, userId });
//     return {
//       isSubscribed: false,
//       subscriptionType: 'Free',
//       electionCreationLimit: 2,
//     };
//   }
// };

// // ✅ GET USER BY ID
// export const getUserById = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     const result = await query(
//       `SELECT 
//         user_id,
//         user_email,
//         user_phone,
//         user_name,
//         user_firstname,
//         user_lastname,
//         user_activated,
//         user_approved,
//         user_banned,
//         user_lastlogin,
//         user_verified
//        FROM public.users 
//        WHERE user_id = $1`,
//       [userId]
//     );

//     if (result.rows.length === 0) {
//       logger.warn('User not found', { userId });
//       return null;
//     }

//     return result.rows[0];
//   } catch (error) {
//     logger.error('Error getting user by ID', { error: error.message, userId });
//     throw error;
//   }
// };

// // ✅ CHECK IF USER IS ADMIN
// export const isUserAdmin = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     const result = await query(
//       `SELECT COUNT(*) as count 
//        FROM votteryy_user_roles 
//        WHERE user_id = $1 AND role_name = 'Admin' AND is_active = true`,
//       [userId]
//     );

//     return parseInt(result.rows[0].count) > 0;
//   } catch (error) {
//     logger.error('Error checking if user is admin', { error: error.message, userId });
//     return false;
//   }
// };

// // ✅ CHECK IF USER IS MODERATOR
// export const isUserModerator = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     const result = await query(
//       `SELECT COUNT(*) as count 
//        FROM votteryy_user_roles 
//        WHERE user_id = $1 AND role_name = 'Moderator' AND is_active = true`,
//       [userId]
//     );

//     return parseInt(result.rows[0].count) > 0;
//   } catch (error) {
//     logger.error('Error checking if user is moderator', { error: error.message, userId });
//     return false;
//   }
// };

// // ✅ GET USER DEVICE INFO
// export const getUserDeviceInfo = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     const result = await query(
//       `SELECT device_id, device_type, os_name, browser_name, ip_address, is_primary, is_trusted
//        FROM votteryy_user_devices 
//        WHERE user_id = $1`,
//       [userId]
//     );

//     return result.rows || [];
//   } catch (error) {
//     logger.error('Error getting user device info', { error: error.message, userId });
//     return [];
//   }
// };

// // ✅ GET USER BIOMETRIC INFO
// export const getUserBiometricInfo = async (userId) => {
//   try {
//     if (!userId) {
//       throw new Error('User ID is required');
//     }

//     const result = await query(
//       `SELECT biometric_type, is_verified, is_primary, verification_count
//        FROM votteryy_user_biometrics 
//        WHERE user_id = $1`,
//       [userId]
//     );

//     return result.rows || [];
//   } catch (error) {
//     logger.error('Error getting user biometric info', { error: error.message, userId });
//     return [];
//   }
// };

// // ✅ EXPORT ALL FUNCTIONS
// export default {
//   checkUserInDatabase,
//   getUserRoles,
//   getUserSubscriptionInfo,
//   isFirstTimeUser,
//   getUserAuthDetails,
//   getCompleteUserProfile,
//   updateUserLastLogin,
//   checkUserSubscription,
//   getUserById,
//   isUserAdmin,
//   isUserModerator,
//   getUserDeviceInfo,
//   getUserBiometricInfo,
// };
// import { query } from '../config/database.js';
// import logger from '../utils/logger.js';
// export const checkUserInDatabase = async (email, phone) => {
//   try {
//     let user = null;

//     // If only email provided
//     if (email && !phone) {
//       const result = await query(
//         'SELECT user_id, user_email, user_phone FROM public.users WHERE user_email = $1',
//         [email]
//       );
//       if (result.rows.length > 0) {
//         user = result.rows[0];
//       }
//     }
//     // If only phone provided
//     else if (phone && !email) {
//       const result = await query(
//         'SELECT user_id, user_email, user_phone FROM public.users WHERE user_phone = $1',
//         [phone]
//       );
//       if (result.rows.length > 0) {
//         user = result.rows[0];
//       }
//     }
//     // If both email and phone provided
//     else if (email && phone) {
//       const result = await query(
//         'SELECT user_id, user_email, user_phone FROM public.users WHERE (user_email = $1 OR user_phone = $2)',
//         [email, phone]
//       );
//       if (result.rows.length > 0) {
//         user = result.rows[0];
//       }
//     }

//     return user || null;
//   } catch (error) {
//     logger.error('Error checking user in database', { error });
//     throw error;
//   }
// };


// export const getUserRoles = async (userId) => {
//   try {
//     const result = await query(
//       'SELECT role_name FROM votteryy_user_roles WHERE user_id = $1 AND is_active = true',
//       [userId]
//     );
//     return result.rows.map(row => row.role_name);
//   } catch (error) {
//     logger.error('Error getting user roles', { error, userId });
//     throw error;
//   }
// };

// export const getUserSubscriptionInfo = async (userId) => {
//   try {
//     const result = await query(
//       `SELECT subscription_type, is_subscribed, election_creation_limit 
//        FROM votteryy_user_subscriptions WHERE user_id = $1`,
//       [userId]
//     );
    
//     if (result.rows.length > 0) {
//       return result.rows[0];
//     }
    
//     // Default subscription for new user
//     return {
//       subscription_type: 'Free',
//       is_subscribed: false,
//       election_creation_limit: 2,
//     };
//   } catch (error) {
//     logger.error('Error getting user subscription info', { error, userId });
//     throw error;
//   }
// };

// export const isFirstTimeUser = async (userId) => {
//   try {
//     const result = await query(
//       'SELECT COUNT(*) as count FROM votteryy_user_details WHERE user_id = $1',
//       [userId]
//     );
//     return result.rows[0].count === '0';
//   } catch (error) {
//     logger.error('Error checking if first time user', { error, userId });

//     throw error;
//   }
// };

// export const getUserAuthDetails = async (userId) => {
//   try {
//     // Get user from main Sngine database
//     const userResult = await query(
//       `SELECT user_id, user_email, user_phone, user_name, user_firstname, 
//               user_lastname, user_registered, user_country, user_gender, 
//               user_picture, user_verified, user_banned FROM public.users 
//        WHERE user_id = $1`,
//       [userId]
//     );
    
//     if (userResult.rows.length === 0) {
//       return null;
//     }
    
//     const user = userResult.rows[0];
    
//     // Get roles
//     const roles = await getUserRoles(userId);
    
//     // Get subscription info
//     const subscription = await getUserSubscriptionInfo(userId);
    
//     // Get user details
//     const detailsResult = await query(
//       `SELECT first_name, last_name, age, gender, country, city, 
//               timezone, language FROM votteryy_user_details WHERE user_id = $1`,
//       [userId]
//     );
    
//     const details = detailsResult.rows[0] || {};
    
//     // Get device info
//     const deviceResult = await query(
//       `SELECT device_id, device_type, os_name, browser_name, ip_address, 
//               is_primary FROM votteryy_user_devices WHERE user_id = $1 
//        AND is_primary = true LIMIT 1`,
//       [userId]
//     );
    
//     const device = deviceResult.rows[0] || {};
    
//     // Get biometric info
//     const biometricResult = await query(
//       `SELECT biometric_type, is_verified FROM votteryy_user_biometrics 
//        WHERE user_id = $1 AND is_primary = true LIMIT 1`,
//       [userId]
//     );
    
//     const biometric = biometricResult.rows[0] || {};
    
//     return {
//       userId: user.user_id,
//       email: user.user_email,
//       phone: user.user_phone,
//       username: user.user_name,
//       firstName: user.user_firstname,
//       lastName: user.user_lastname,
//       age: details.age,
//       gender: details.gender || user.user_gender,
//       country: details.country || user.user_country,
//       city: details.city,
//       timezone: details.timezone,
//       language: details.language,
//       picture: user.user_picture,
//       roles,
//       primaryRole: roles[0] || 'Voter',
//       isSubscribed: subscription.is_subscribed,
//       subscriptionType: subscription.subscription_type,
//       electionCreationLimit: subscription.election_creation_limit,
//       isVerified: user.user_verified,
//       isBanned: user.user_banned,
//       registrationDate: user.user_registered,
//       device: {
//         deviceId: device.device_id,
//         deviceType: device.device_type,
//         osName: device.os_name,
//         browserName: device.browser_name,
//         ipAddress: device.ip_address,
//       },
//       biometric: {
//         type: biometric.biometric_type,
//         isVerified: biometric.is_verified,
//       },
//     };
//   } catch (error) {
//     logger.error('Error getting user auth details', { error, userId });
//     throw error;
//   }
// };


// export default {
//   checkUserInDatabase,
//   getUserRoles,
//   getUserSubscriptionInfo,
//   isFirstTimeUser,
//   getUserAuthDetails,
// };