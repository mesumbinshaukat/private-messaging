import { Request, Response, NextFunction } from 'express';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { subject } from '@casl/ability';
import { AuditLog } from '../models';

// Define action types
export const Actions = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MANAGE: 'manage', // Special action that represents any action
} as const;

// Define subject types
export const Subjects = {
  USER: 'User',
  DEVICE: 'Device',
  SESSION: 'Session',
  MESSAGE: 'Message',
  CALL: 'Call',
  KEY_BUNDLE: 'KeyBundle',
  AUDIT_LOG: 'AuditLog',
  ALL: 'all', // Special subject that represents any subject
} as const;

export type Action = typeof Actions[keyof typeof Actions];
export type Subject = typeof Subjects[keyof typeof Subjects];

// Define abilities for different roles
export const defineAbilitiesFor = (user: any) => {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

  if (user.role === 'superadmin') {
    // Superadmin can do everything
    can(Actions.MANAGE, Subjects.ALL);
  } else if (user.role === 'user') {
    // Users can manage their own resources
    can(Actions.READ, Subjects.USER, { _id: user.userId });
    can(Actions.UPDATE, Subjects.USER, { _id: user.userId });
    
    // Users can manage their own devices
    can(Actions.MANAGE, Subjects.DEVICE, { userId: user.userId });
    
    // Users can manage their own sessions
    can(Actions.MANAGE, Subjects.SESSION, { userId: user.userId });
    
    // Users can send and receive messages
    can(Actions.CREATE, Subjects.MESSAGE);
    can(Actions.READ, Subjects.MESSAGE, { 
      $or: [
        { senderId: user.userId },
        { recipientId: user.userId }
      ]
    });
    can(Actions.UPDATE, Subjects.MESSAGE, { senderId: user.userId });
    can(Actions.DELETE, Subjects.MESSAGE, { senderId: user.userId });
    
    // Users can initiate and participate in calls
    can(Actions.CREATE, Subjects.CALL);
    can(Actions.READ, Subjects.CALL, {
      $or: [
        { initiatorId: user.userId },
        { participantIds: user.userId }
      ]
    });
    can(Actions.UPDATE, Subjects.CALL, {
      $or: [
        { initiatorId: user.userId },
        { participantIds: user.userId }
      ]
    });
    
    // Users can manage their own key bundles
    can(Actions.MANAGE, Subjects.KEY_BUNDLE, { userId: user.userId });
    
    // Users can read their own audit logs
    can(Actions.READ, Subjects.AUDIT_LOG, { userId: user.userId });
    
    // Users cannot access other users' private data
    cannot(Actions.READ, Subjects.USER, { _id: { $ne: user.userId } });
    cannot(Actions.UPDATE, Subjects.USER, { _id: { $ne: user.userId } });
    cannot(Actions.DELETE, Subjects.USER);
    
    // Users cannot access system-level audit logs
    cannot(Actions.READ, Subjects.AUDIT_LOG, { userId: { $exists: false } });
    cannot(Actions.CREATE, Subjects.AUDIT_LOG);
    cannot(Actions.UPDATE, Subjects.AUDIT_LOG);
    cannot(Actions.DELETE, Subjects.AUDIT_LOG);
  }

  return build();
};

// Middleware to check permissions
export const authorize = (action: Action, subject: Subject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const ability = defineAbilitiesFor(req.user);

    // For resource-specific permissions, we need the actual resource
    let resource = null;
    if (req.params.id) {
      // Try to get the resource from the request or database
      resource = req.body || { _id: req.params.id };
    }

    const allowed = resource 
      ? ability.can(action, subject(subject, resource))
      : ability.can(action, subject);

    if (!allowed) {
      // Log unauthorized access attempt
      await AuditLog.logEvent({
        action: 'rbac.access_denied',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: req.user.userId,
        description: `User attempted unauthorized ${action} on ${subject}`,
        metadata: {
          action,
          subject,
          userRole: req.user.role,
          resourceId: req.params.id,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          action,
          subject,
          resource: req.params.id
        }
      });
    }

    // Store ability in request for later use
    req.ability = ability;
    next();
  };
};
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const ability = defineAbilitiesFor(req.user);

    // For resource-specific permissions, we need the actual resource
    let resource = null;
    if (req.params.id) {
      // Try to get the resource from the request or database
      resource = req.body || { _id: req.params.id };
    }

    const allowed = resource 
      ? ability.can(action, subject(subject, resource))
      : ability.can(action, subject);

    if (!allowed) {
      // Log unauthorized access attempt
      await AuditLog.logEvent({
        action: 'rbac.access_denied',
        category: 'security',
        severity: 'warning',
        status: 'failure',
        userId: req.user.userId,
        description: `User attempted unauthorized ${action} on ${subject}`,
        metadata: {
          action,
          subject,
          userRole: req.user.role,
          resourceId: req.params.id,
        },
        context: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          action,
          subject,
          resource: req.params.id
        }
      });
    }

    // Store ability in request for later use
    req.ability = ability;
    next();
  };
};

// Helper middleware for common operations
export const canReadUser = authorize(Actions.READ, Subjects.USER);
export const canUpdateUser = authorize(Actions.UPDATE, Subjects.USER);
export const canDeleteUser = authorize(Actions.DELETE, Subjects.USER);

export const canCreateMessage = authorize(Actions.CREATE, Subjects.MESSAGE);
export const canReadMessage = authorize(Actions.READ, Subjects.MESSAGE);
export const canUpdateMessage = authorize(Actions.UPDATE, Subjects.MESSAGE);
export const canDeleteMessage = authorize(Actions.DELETE, Subjects.MESSAGE);

export const canCreateCall = authorize(Actions.CREATE, Subjects.CALL);
export const canReadCall = authorize(Actions.READ, Subjects.CALL);
export const canUpdateCall = authorize(Actions.UPDATE, Subjects.CALL);

export const canManageDevice = authorize(Actions.MANAGE, Subjects.DEVICE);
export const canManageSession = authorize(Actions.MANAGE, Subjects.SESSION);
export const canManageKeyBundle = authorize(Actions.MANAGE, Subjects.KEY_BUNDLE);

export const canReadAuditLog = authorize(Actions.READ, Subjects.AUDIT_LOG);

// Middleware to filter results based on user permissions
export const filterByPermissions = (subject: Subject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.ability) {
      return next();
    }

    const ability = req.ability;

    // Add filtering logic to the request
    req.permissionFilter = (query: any) => {
      // This is a simplified version - in practice, you'd need to convert
      // CASL rules to MongoDB queries using @casl/mongoose
      if (req.user!.role === 'superadmin') {
        return query; // No filtering for superadmin
      }

      // Apply user-specific filters based on the subject
      switch (subject) {
        case Subjects.MESSAGE:
          query.$or = [
            { senderId: req.user!.userId },
            { recipientId: req.user!.userId }
          ];
          break;
        case Subjects.CALL:
          query.$or = [
            { initiatorId: req.user!.userId },
            { participantIds: req.user!.userId }
          ];
          break;
        case Subjects.DEVICE:
          query.userId = req.user!.userId;
          break;
        case Subjects.SESSION:
          query.userId = req.user!.userId;
          break;
        case Subjects.KEY_BUNDLE:
          query.userId = req.user!.userId;
          break;
        case Subjects.AUDIT_LOG:
          query.userId = req.user!.userId;
          break;
        case Subjects.USER:
          if (req.user!.role !== 'superadmin') {
            query._id = req.user!.userId;
          }
          break;
      }

      return query;
    };

    next();
  };
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      ability?: any;
      permissionFilter?: (query: any) => any;
    }
  }
}
