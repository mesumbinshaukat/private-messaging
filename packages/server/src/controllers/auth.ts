import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse 
} from '@simplewebauthn/server';
import { User, Device, Session, KeyBundle, AuditLog } from '../models';
import { 
  authenticateToken, 
  authenticateRefreshToken,
  deviceAuthentication 
} from '../middleware/auth';
import { 
  authRateLimit, 
  validationSchemas 
} from '../middleware/security';
import { Types } from 'mongoose';

const router = Router();

// Register new user
router.post('/register', 
  authRateLimit,
  validationSchemas.register,
  async (req: Request, res: Response) => {
    try {
      const {
        email,
        username,
        password,
        displayName,
        publicKey,
        identityKey,
        signedPreKey,
        preKeySignature,
        oneTimePreKeys
      } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        await AuditLog.logEvent({
          action: 'auth.register_failed',
          category: 'auth',
          severity: 'warning',
          status: 'failure',
          description: 'Registration attempt with existing email or username',
          metadata: { email, username },
          context: {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          },
        });

        return res.status(409).json({
          error: 'User already exists',
          code: 'USER_EXISTS'
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

      // Create user
      const user = new User({
        email,
        username,
        passwordHash,
        displayName,
        publicKey,
        identityKey,
        signedPreKey,
        preKeySignature,
        oneTimePreKeys,
        emailVerificationToken,
        role: 'user',
        status: 'active'
      });

      await user.save();

      // Log successful registration
      await AuditLog.logEvent({
        action: 'auth.register_success',
        category: 'auth',
        severity: 'info',
        status: 'success',
        userId: user._id,
        description: 'User registered successfully',
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          emailVerified: user.emailVerified
        }
      });

    } catch (error: any) {
      await AuditLog.logEvent({
        action: 'auth.register_error',
        category: 'auth',
        severity: 'error',
        status: 'failure',
        description: 'Registration error',
        error: {
          code: error.name,
          message: error.message,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(500).json({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }
);

// Login with password
router.post('/login',
  authRateLimit,
  validationSchemas.login,
  async (req: Request, res: Response) => {
    try {
      const { email, password, deviceInfo } = req.body;

      // Find user with password hash
      const user = await User.findOne({ email }).select('+passwordHash');
      if (!user || user.status !== 'active') {
        await AuditLog.logEvent({
          action: 'auth.login_failed',
          category: 'security',
          severity: 'warning',
          status: 'failure',
          description: 'Login attempt with invalid email',
          metadata: { email },
          context: {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          },
        });

        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Verify password
      const validPassword = await user.comparePassword(password);
      if (!validPassword) {
        await AuditLog.logEvent({
          action: 'auth.login_failed',
          category: 'security',
          severity: 'warning',
          status: 'failure',
          userId: user._id,
          description: 'Login attempt with invalid password',
          context: {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          },
        });

        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Create or find device
      let device = await Device.findOne({
        deviceId: deviceInfo.deviceId,
        userId: user._id
      });

      if (!device) {
        device = new Device({
          ...deviceInfo,
          userId: user._id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || '',
          publicKey: '', // Will be set later
          registrationId: Math.floor(Math.random() * 16777216),
          signedPreKey: {
            keyId: 1,
            publicKey: '',
            signature: ''
          },
          oneTimePreKeys: []
        });
        await device.save();
        await user.addDevice(device._id);
      } else {
        await device.updateActivity(req.ip, req.get('User-Agent') || '');
      }

      // Generate tokens
      const { accessToken, refreshToken } = await user.generateAuthTokens();

      // Create session
      const session = new Session({
        userId: user._id,
        deviceId: device._id,
        refreshToken,
        accessToken,
        tokenFamily: crypto.randomUUID(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || '',
        status: 'active'
      });

      await session.save();

      // Update user last active
      await user.updateLastActive();

      // Log successful login
      await AuditLog.logEvent({
        action: 'auth.login_success',
        category: 'auth',
        severity: 'info',
        status: 'success',
        userId: user._id,
        deviceId: device._id,
        sessionId: session._id,
        description: 'User logged in successfully',
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.json({
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          avatar: user.avatar
        },
        device: {
          id: device._id,
          name: device.deviceName,
          type: device.deviceType
        }
      });

    } catch (error: any) {
      await AuditLog.logEvent({
        action: 'auth.login_error',
        category: 'auth',
        severity: 'error',
        status: 'failure',
        description: 'Login error',
        error: {
          code: error.name,
          message: error.message,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(500).json({
        error: 'Login failed',
        code: 'LOGIN_ERROR'
      });
    }
  }
);

// Refresh access token
router.post('/refresh',
  authRateLimit,
  authenticateRefreshToken,
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const session = req.session!;

      // Generate new tokens
      const userDoc = await User.findById(user.userId);
      if (!userDoc) {
        return res.status(401).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const { accessToken, refreshToken } = await userDoc.generateAuthTokens();

      // Update session with new tokens
      await session.rotateTokens(accessToken, refreshToken);

      // Log token refresh
      await AuditLog.logEvent({
        action: 'auth.token_refreshed',
        category: 'auth',
        severity: 'info',
        status: 'success',
        userId: user.userId,
        sessionId: session._id,
        description: 'Access token refreshed',
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.json({
        accessToken,
        refreshToken
      });

    } catch (error: any) {
      await AuditLog.logEvent({
        action: 'auth.refresh_error',
        category: 'auth',
        severity: 'error',
        status: 'failure',
        userId: req.user?.userId,
        description: 'Token refresh error',
        error: {
          code: error.name,
          message: error.message,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR'
      });
    }
  }
);

// Logout
router.post('/logout',
  authenticateToken,
  deviceAuthentication,
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const device = req.device!;

      // Revoke all sessions for this device
      await Session.revokeDeviceSessions(device._id);

      // Log logout
      await AuditLog.logEvent({
        action: 'auth.logout',
        category: 'auth',
        severity: 'info',
        status: 'success',
        userId: user.userId,
        deviceId: device._id,
        description: 'User logged out',
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.json({
        message: 'Logged out successfully'
      });

    } catch (error: any) {
      await AuditLog.logEvent({
        action: 'auth.logout_error',
        category: 'auth',
        severity: 'error',
        status: 'failure',
        userId: req.user?.userId,
        description: 'Logout error',
        error: {
          code: error.name,
          message: error.message,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(500).json({
        error: 'Logout failed',
        code: 'LOGOUT_ERROR'
      });
    }
  }
);

// WebAuthn registration options
router.post('/webauthn/register-options',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const user = await User.findById(req.user!.userId);
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const options = await generateRegistrationOptions({
        rpName: 'Private Messaging App',
        rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
        userID: user._id.toString(),
        userName: user.email,
        userDisplayName: user.displayName,
        attestationType: 'indirect',
        excludeCredentials: user.webAuthnCredentials.map(cred => ({
          id: cred.id,
          type: 'public-key',
          transports: cred.transports as any[]
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred'
        }
      });

      // Store challenge in session/cache (in production, use Redis)
      // For now, we'll store it temporarily in the user document
      user.set('webAuthnChallenge', options.challenge);
      await user.save();

      res.json(options);

    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to generate WebAuthn options',
        code: 'WEBAUTHN_ERROR'
      });
    }
  }
);

// WebAuthn registration verification
router.post('/webauthn/register-verify',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { credential, credentialName } = req.body;
      const user = await User.findById(req.user!.userId);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const expectedChallenge = user.get('webAuthnChallenge');
      if (!expectedChallenge) {
        return res.status(400).json({
          error: 'No challenge found',
          code: 'NO_CHALLENGE'
        });
      }

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
        expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost'
      });

      if (verification.verified && verification.registrationInfo) {
        const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

        user.webAuthnCredentials.push({
          id: credentialID.toString(),
          publicKey: Buffer.from(credentialPublicKey).toString('base64'),
          counter,
          transports: credential.response.transports,
          createdAt: new Date(),
          name: credentialName || 'WebAuthn Key'
        });

        user.set('webAuthnChallenge', undefined);
        await user.save();

        await AuditLog.logEvent({
          action: 'auth.webauthn_registered',
          category: 'auth',
          severity: 'info',
          status: 'success',
          userId: user._id,
          description: 'WebAuthn credential registered',
          context: {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          },
        });

        res.json({
          verified: true,
          message: 'WebAuthn credential registered successfully'
        });
      } else {
        res.status(400).json({
          error: 'WebAuthn verification failed',
          code: 'WEBAUTHN_VERIFICATION_FAILED'
        });
      }

    } catch (error: any) {
      res.status(500).json({
        error: 'WebAuthn registration failed',
        code: 'WEBAUTHN_ERROR'
      });
    }
  }
);

module.exports = router;
