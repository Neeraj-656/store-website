// Admin Authorization Middleware
export const requireAdmin = (req, res, next) => {
  // ⚠️ In production: verify JWT and extract role securely
  const role = req.get('x-user-role');

  if (role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin privileges required'
      }
    });
  }

  next();
};

// Internal Service Authorization Middleware
export const requireServiceAuth = (req, res, next) => {
  const serviceToken = req.get('x-internal-service-token');

  if (!serviceToken || serviceToken !== process.env.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing service token'
      }
    });
  }

  next();
};