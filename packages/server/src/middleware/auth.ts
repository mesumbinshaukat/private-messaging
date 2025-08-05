import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, Session, Device, AuditLog } from '../models';
import { Types } from 'mongoose';

export interface AuthenticatedUser {
  userId: Types.ObjectId;
  email: string;
  role: string;
  sessionId?: Types.ObjectId;
  deviceId?: Types.ObjectId;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      device?: any;
      session?: any;
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN' 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
    
    // Find user and ensure they're still active
    const user = await User.findById(decoded.userId).select('+status');
    if (!user || user.status !== 'active') {
      await AuditLog.logEvent({
        action: 'auth.token_invalid_user',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: decoded.userId,
        description: 'Authentication attempt with invalid or inactive user',
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(401).json({ 
        error: 'Invalid token or user inactive',
        code: 'INVALID_USER' 
      });
    }

    // Update last active
    await user.updateLastActive();

    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role,
    };

    // Log successful authentication
    await AuditLog.logEvent({
      action: 'auth.token_validated',
      category: 'auth',
      severity: 'info',
      status: 'success',
      userId: user._id,
      description: 'Access token successfully validated',
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    next();
  } catch (error: any) {
    // Log failed authentication attempt
    await AuditLog.logEvent({
      action: 'auth.token_validation_failed',
      category: 'security',
      severity: 'warning',
      status: 'failure',
      description: 'Failed to validate access token',
      error: {
        code: error.name,
        message: error.message,
      },
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN' 
      });
    }

    return res.status(500).json({ 
      error: 'Authentication error',
      code: 'AUTH_ERROR' 
    });
  }
};

export const authenticateRefreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'Refresh token required',
        code: 'MISSING_REFRESH_TOKEN' 
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;

    // Find active session with this refresh token
    const session = await Session.findOne({
      refreshToken,
      status: 'active',
      userId: decoded.userId,
    }).populate('userId').populate('deviceId');

    if (!session || session.isExpired()) {
      await AuditLog.logEvent({
        action: 'auth.refresh_token_invalid',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: decoded.userId,
        description: 'Invalid or expired refresh token used',
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(401).json({ 
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN' 
      });
    }

    // Update session activity
    await session.updateActivity(req.ip, req.get('User-Agent') || '');

    req.user = {
      userId: session.userId._id,
      email: session.userId.email,
      role: session.userId.role,
      sessionId: session._id,
      deviceId: session.deviceId._id,
    };

    req.session = session;
    next();
  } catch (error: any) {
    await AuditLog.logEvent({
      action: 'auth.refresh_token_validation_failed',
      category: 'security',
      severity: 'warning',
      status: 'failure',
      description: 'Failed to validate refresh token',
      error: {
        code: error.name,
        message: error.message,
      },
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    return res.status(401).json({ 
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN' 
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
    }

    if (!roles.includes(req.user.role)) {
      AuditLog.logEvent({
        action: 'auth.insufficient_permissions',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: req.user.userId,
        description: `User attempted to access resource requiring roles: ${roles.join(', ')}`,
        metadata: {
          userRole: req.user.role,
          requiredRoles: roles,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS' 
      });
    }

    next();
  };
};

export const requireSuperAdmin = requireRole(['superadmin']);

export const deviceAuthentication = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deviceId = req.headers['x-device-id'] as string;
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string;

    if (!deviceId || !deviceFingerprint) {
      return res.status(400).json({ 
        error: 'Device identification required',
        code: 'DEVICE_IDENTIFICATION_REQUIRED' 
      });
    }

    // Find and validate device
    const device = await Device.findOne({
      deviceId,
      fingerprint: deviceFingerprint,
      status: 'active',
    });

    if (!device) {
      await AuditLog.logEvent({
        action: 'auth.device_not_found',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: req.user?.userId,
        description: 'Authentication attempt with unknown or invalid device',
        metadata: {
          deviceId,
          fingerprint: deviceFingerprint,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(401).json({ 
        error: 'Device not recognized',
        code: 'DEVICE_NOT_RECOGNIZED' 
      });
    }

    // Update device activity
    await device.updateActivity(req.ip, req.get('User-Agent') || '');

    req.device = device;
    if (req.user) {
      req.user.deviceId = device._id;
    }

    next();
  } catch (error: any) {
    await AuditLog.logEvent({
      action: 'auth.device_validation_failed',
      category: 'security',
      severity: 'error',
      status: 'failure',
      userId: req.user?.userId,
      description: 'Failed to validate device authentication',
      error: {
        code: error.name,
        message: error.message,
      },
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    return res.status(500).json({ 
      error: 'Device authentication error',
      code: 'DEVICE_AUTH_ERROR' 
    });
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // No token provided, continue without authentication
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
    const user = await User.findById(decoded.userId);
    
    if (user && user.status === 'active') {
      req.user = {
        userId: user._id,
        email: user.email,
        role: user.role,
      };
    }
  } catch (error) {
    // Invalid token, but continue without authentication
  }

  next();
};

// Rate limiting for authentication endpoints
export const authRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req: Request, res: Response) => {
    await AuditLog.logEvent({
      action: 'auth.rate_limit_exceeded',
      category: 'security',
      severity: 'warning',
      status: 'failure',
      description: 'Authentication rate limit exceeded',
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    res.status(429).json({
      error: 'Too many authentication attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
};
