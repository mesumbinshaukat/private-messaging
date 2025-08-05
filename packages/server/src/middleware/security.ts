import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { celebrate, Joi, errors } from 'celebrate';
import { AuditLog } from '../models';

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// MongoDB injection prevention
export const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    AuditLog.logEvent({
      action: 'security.input_sanitized',
      category: 'security',
      severity: 'warning',
      status: 'success',
      userId: req.user?.userId,
      description: 'Potentially malicious input detected and sanitized',
      metadata: {
        sanitizedKey: key,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
      },
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });
  }
});

// Rate limiting configurations
export const createRateLimit = (options: {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: options.message,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    keyGenerator: options.keyGenerator || ((req) => req.ip),
    handler: async (req: Request, res: Response) => {
      await AuditLog.logEvent({
        action: 'security.rate_limit_exceeded',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: req.user?.userId,
        description: `Rate limit exceeded for ${req.path}`,
        metadata: {
          endpoint: req.path,
          method: req.method,
          limit: options.max,
          window: options.windowMs,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(429).json({
        error: options.message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(options.windowMs / 1000)
      });
    }
  });
};

// Different rate limits for different endpoints
export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true
});

export const messageRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each user to 30 messages per minute
  message: 'Too many messages sent, please slow down.',
  keyGenerator: (req) => req.user?.userId?.toString() || req.ip
});

export const callRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each user to 5 call attempts per minute
  message: 'Too many call attempts, please wait before trying again.',
  keyGenerator: (req) => req.user?.userId?.toString() || req.ip
});

export const keyRotationRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each user to 10 key rotations per hour
  message: 'Too many key rotation attempts, please wait before trying again.',
  keyGenerator: (req) => req.user?.userId?.toString() || req.ip
});

// Input validation schemas
export const validationSchemas = {
  // User registration
  register: celebrate({
    body: Joi.object({
      email: Joi.string().email().required().max(255),
      username: Joi.string().alphanum().min(3).max(30).required(),
      password: Joi.string().min(8).max(128).required(),
      displayName: Joi.string().min(1).max(100).required(),
      publicKey: Joi.string().required(),
      identityKey: Joi.string().required(),
      signedPreKey: Joi.string().required(),
      preKeySignature: Joi.string().required(),
      oneTimePreKeys: Joi.array().items(Joi.string()).min(1).max(100).required(),
    })
  }),

  // User login
  login: celebrate({
    body: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
      deviceInfo: Joi.object({
        deviceId: Joi.string().required(),
        deviceName: Joi.string().max(100).required(),
        deviceType: Joi.string().valid('mobile', 'desktop', 'web', 'tablet').required(),
        platform: Joi.string().max(50).required(),
        appVersion: Joi.string().max(20).required(),
        fingerprint: Joi.string().required(),
      }).required()
    })
  }),

  // WebAuthn authentication
  webauthnLogin: celebrate({
    body: Joi.object({
      email: Joi.string().email().required(),
      assertionResponse: Joi.object().required(),
      deviceInfo: Joi.object({
        deviceId: Joi.string().required(),
        deviceName: Joi.string().max(100).required(),
        deviceType: Joi.string().valid('mobile', 'desktop', 'web', 'tablet').required(),
        platform: Joi.string().max(50).required(),
        appVersion: Joi.string().max(20).required(),
        fingerprint: Joi.string().required(),
      }).required()
    })
  }),

  // Message sending
  sendMessage: celebrate({
    body: Joi.object({
      recipientId: Joi.string().required(),
      messageType: Joi.string().valid('text', 'file', 'image', 'video', 'audio', 'document').required(),
      encryptedContent: Joi.string().required(),
      encryptedKey: Joi.string().optional(),
      metadata: Joi.object({
        fileName: Joi.string().max(255),
        fileSize: Joi.number().positive().max(100 * 1024 * 1024), // 100MB max
        mimeType: Joi.string().max(100),
        duration: Joi.number().positive(),
        dimensions: Joi.object({
          width: Joi.number().positive(),
          height: Joi.number().positive()
        }),
        thumbnail: Joi.string()
      }),
      doubleRatchetHeader: Joi.object({
        dhPublicKey: Joi.string().required(),
        previousChainLength: Joi.number().min(0).required(),
        messageNumber: Joi.number().min(0).required()
      }).required(),
      replyToMessageId: Joi.string().optional(),
      expiresAt: Joi.date().optional(),
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal')
    })
  }),

  // Call initiation
  initiateCall: celebrate({
    body: Joi.object({
      participantIds: Joi.array().items(Joi.string()).min(1).max(50).required(),
      callType: Joi.string().valid('audio', 'video', 'screen_share').required(),
      encryption: Joi.object({
        enabled: Joi.boolean().default(true),
        keyExchange: Joi.string().valid('DTLS-SRTP', 'E2E-Custom').default('DTLS-SRTP')
      })
    })
  }),

  // Device registration
  registerDevice: celebrate({
    body: Joi.object({
      deviceId: Joi.string().required(),
      deviceName: Joi.string().max(100).required(),
      deviceType: Joi.string().valid('mobile', 'desktop', 'web', 'tablet').required(),
      platform: Joi.string().max(50).required(),
      appVersion: Joi.string().max(20).required(),
      fingerprint: Joi.string().required(),
      publicKey: Joi.string().required(),
      registrationId: Joi.number().required(),
      signedPreKey: Joi.object({
        keyId: Joi.number().required(),
        publicKey: Joi.string().required(),
        signature: Joi.string().required()
      }).required(),
      oneTimePreKeys: Joi.array().items(Joi.object({
        keyId: Joi.number().required(),
        publicKey: Joi.string().required()
      })).min(1).max(100).required()
    })
  }),

  // Update user profile
  updateProfile: celebrate({
    body: Joi.object({
      displayName: Joi.string().min(1).max(100),
      avatar: Joi.string().uri(),
      settings: Joi.object({
        theme: Joi.string().valid('light', 'dark', 'system'),
        notifications: Joi.object({
          email: Joi.boolean(),
          push: Joi.boolean(),
          sound: Joi.boolean()
        }),
        privacy: Joi.object({
          readReceipts: Joi.boolean(),
          onlineStatus: Joi.boolean(),
          lastSeen: Joi.boolean()
        })
      })
    })
  }),

  // Pagination
  pagination: celebrate({
    query: Joi.object({
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(20),
      sort: Joi.string().valid('createdAt', '-createdAt', 'updatedAt', '-updatedAt'),
      search: Joi.string().max(100)
    })
  })
};

// Error handler for validation errors
export const validationErrorHandler = errors();

// Request logging middleware
export const requestLogger = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Log the request
  const requestLog = {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    userId: req.user?.userId,
    timestamp: new Date()
  };

  // Override res.json to capture response
  const originalJson = res.json;
  res.json = function (body) {
    const duration = Date.now() - startTime;
    
    // Log high-level request info (not sensitive data)
    AuditLog.logEvent({
      action: 'http.request',
      category: 'system',
      severity: res.statusCode >= 400 ? 'warning' : 'info',
      status: res.statusCode < 400 ? 'success' : 'failure',
      userId: req.user?.userId,
      description: `${req.method} ${req.originalUrl}`,
      metadata: {
        statusCode: res.statusCode,
        duration,
        endpoint: req.originalUrl,
        method: req.method,
      },
      context: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    return originalJson.call(this, body);
  };

  next();
};

// IP whitelist middleware (for admin endpoints)
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip;
    
    if (!allowedIPs.includes(clientIP)) {
      AuditLog.logEvent({
        action: 'security.ip_blocked',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: req.user?.userId,
        description: `Access attempt from non-whitelisted IP: ${clientIP}`,
        context: {
          ipAddress: clientIP,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(403).json({
        error: 'Access denied from this IP address',
        code: 'IP_NOT_ALLOWED'
      });
    }

    next();
  };
};

// CORS configuration
export const corsOptions = {
  origin: function (origin: any, callback: any) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Device-ID',
    'X-Device-Fingerprint'
  ]
};
