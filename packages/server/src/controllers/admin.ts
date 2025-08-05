import { Router, Request, Response } from 'express';
import { authorize, Actions, Subjects } from '../middleware/rbac';
import { AuditLog, User, Device, Session } from '../models';
import { PendingApproval } from '../models/PendingApproval';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all admin routes
router.use(authenticateToken);

// Admin Stats
router.get('/stats', authorize(Actions.READ, Subjects.ALL), async (req: Request, res: Response) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ status: 'active' });
        const totalDevices = await Device.countDocuments();
        const activeDevices = await Device.countDocuments({ status: 'active' });
        const totalSessions = await Session.countDocuments();
        const activeSessions = await Session.countDocuments({ status: 'active' });
        
        // Get security events count
        const securityEvents = await AuditLog.countDocuments({ category: 'security', severity: { $in: ['warning', 'error', 'critical'] } });
        
        const stats = {
            totalUsers,
            activeUsers,
            totalDevices,
            activeDevices,
            totalSessions,
            activeSessions,
            totalMessages: 0, // Placeholder - would need Message model
            messagesLastDay: 0, // Placeholder
            totalCalls: 0, // Placeholder - would need Call model
            callMinutesLastDay: 0, // Placeholder
            securityEvents,
            pendingApprovals: 0 // Placeholder - would need PendingApproval model
        };
        
        res.status(200).json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve admin stats' });
    }
});
                totalSessions: [{ $count: 'total' }],
                activeSessions: [{ $match: { status: 'active' } }, { $count: 'count' }],
                totalMessages: [{ $count: 'total' }],
                messagesLastDay: [{ $match: { createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 1)) } } }, { $count: 'count' }],
                totalCalls: [{ $count: 'total' }],
                callMinutesLastDay: [{ $match: { createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 1)) } } }, { $group: { _id: null, totalMinutes: { $sum: '$duration' } } }],
                securityEvents: [{ $count: 'total' }],
                pendingApprovals: [{ $count: 'total' }]
            }}
        ]);
        const result = {
          totalUsers: stats[0].totalUsers[0]?.total || 0,
          activeUsers: stats[0].activeUsers[0]?.count || 0,
          totalDevices: stats[0].totalDevices[0]?.total || 0,
          activeDevices: stats[0].activeDevices[0]?.count || 0,
          totalSessions: stats[0].totalSessions[0]?.total || 0,
          activeSessions: stats[0].activeSessions[0]?.count || 0,
          totalMessages: stats[0].totalMessages[0]?.total || 0,
          messagesLastDay: stats[0].messagesLastDay[0]?.count || 0,
          totalCalls: stats[0].totalCalls[0]?.total || 0,
          callMinutesLastDay: stats[0].callMinutesLastDay[0]?.totalMinutes || 0,
          securityEvents: stats[0].securityEvents[0]?.total || 0,
          pendingApprovals: stats[0].pendingApprovals[0]?.total || 0
        };
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve admin stats' });
    }
});

// Analytics
router.get('/analytics', authorize(Actions.READ, Subjects.ALL), async (req: Request, res: Response) => {
    try {
const { timeframe = 'week' } = req.query;
        const endDate = new Date();
        const startDate = new Date();
        if (timeframe === 'day') startDate.setDate(endDate.getDate() - 1);
        else if (timeframe === 'month') startDate.setMonth(endDate.getMonth() - 1);
        else startDate.setDate(endDate.getDate() - 7);

        try {
            const { page = 1, limit = 20 } = req.query;
            const analyticsPipeline = [
                { $match: { createdAt: { $gte: startDate, $lte: endDate } }},
                {
                    $facet: {
                        data: [
                            { $sort: { createdAt: -1 } },
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                            {
                                $group: {
                                    _id: {
                                        category: '$category',
                                        action: '$action'
                                    },
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        totalCount: [
                            { $count: 'total' }
                        ]
                    }
                }
            ];

            const [{ data, totalCount }] = await AuditLog.aggregate(analyticsPipeline);

            res.status(200).json({ analytics: data, total: totalCount[0]?.total || 0 });
        } catch (error) {
            res.status(500).json({ error: 'Analytics retrieval failed' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve analytics data' });
    }
});

// Users Management
router.get('/users', authorize(Actions.READ, Subjects.USER), async (req: Request, res: Response) => {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    try {
const filter: any = {};
        if (search) filter.$or = [
            { username: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ];
        if (status) filter.status = status;

        const users = await User.find(filter)
            .skip((page - 1) * limit)
            .limit(limit);
        const total = await User.countDocuments(filter);

        res.status(200).json({ users, total });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve users' });
    }
});

router.get('/users/:id', authorize(Actions.READ, Subjects.USER), async (req: Request, res: Response) => {
    const userId = req.params.id;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve user' });
    }
});

router.patch('/users/:id/status', authorize(Actions.UPDATE, Subjects.USER), async (req: Request, res: Response) => {
    const userId = req.params.id;
    const { status, reason } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.status = status;
        user.updatedAt = new Date();
        await user.save();

        await AuditLog.logEvent({
            action: 'admin.update_user_status',
            category: 'admin',
            status: 'success',
            userId: req.user._id,
            resourceType: 'user',
            resourceId: userId,
            description: `User status updated to ${status}`,
            context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
        });

        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

router.patch('/users/:id/role', authorize(Actions.UPDATE, Subjects.USER), async (req: Request, res: Response) => {
    const userId = req.params.id;
    const { newRole, reason } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.role = newRole;
        user.updatedAt = new Date();
        await user.save();

        await AuditLog.logEvent({
            action: 'admin.update_user_role',
            category: 'admin',
            status: 'success',
            userId: req.user._id,
            resourceType: 'user',
            resourceId: userId,
            description: `User role updated to ${newRole}`,
            context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
        });

        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

router.delete('/users/:id', authorize(Actions.DELETE, Subjects.USER), async (req: Request, res: Response) => {
    const userId = req.params.id;
    const { reason } = req.body;
    try {
        const user = await User.findByIdAndDelete(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await AuditLog.logEvent({
            action: 'admin.delete_user',
            category: 'admin',
            status: 'success',
            userId: req.user._id,
            resourceType: 'user',
            resourceId: userId,
            description: 'User deleted',
            context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
        });

        res.status(200).json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Devices Management
router.get('/devices', authorize(Actions.READ, Subjects.DEVICE), async (req: Request, res: Response) => {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    try {
const filter: any = {};
        if (search) filter.$or = [
            { deviceName: { $regex: search, $options: 'i' } },
            { deviceId: { $regex: search, $options: 'i' } }
        ];
        if (status) filter.status = status;

        const devices = await Device.find(filter)
            .skip((page - 1) * limit)
            .limit(limit);
        const total = await Device.countDocuments(filter);

        res.status(200).json({ devices, total });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve devices' });
    }
});

router.patch('/devices/:id/revoke', authorize(Actions.UPDATE, Subjects.DEVICE), async (req: Request, res: Response) => {
    const deviceId = req.params.id;
    const { reason } = req.body;
    try {
try {
            const device = await Device.findById(deviceId);
            if (!device) return res.status(404).json({ error: 'Device not found' });

            device.status = 'revoked';
            device.updatedAt = new Date();
            await device.save();

            await AuditLog.logEvent({
                action: 'admin.revoke_device',
                category: 'admin',
                status: 'success',
                userId: req.user._id,
                resourceType: 'device',
                resourceId: deviceId,
                description: 'Device revoked',
                context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
            });

            res.status(200).json(device);
        } catch (error) {
            res.status(500).json({ error: 'Failed to revoke device' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to revoke device' });
    }
});

router.patch('/devices/:id/trust', authorize(Actions.UPDATE, Subjects.DEVICE), async (req: Request, res: Response) => {
    const deviceId = req.params.id;
    try {
try {
            const device = await Device.findById(deviceId);
            if (!device) return res.status(404).json({ error: 'Device not found' });

            device.trustedDevice = true;
            device.updatedAt = new Date();
            await device.save();

            await AuditLog.logEvent({
                action: 'admin.trust_device',
                category: 'admin',
                status: 'success',
                userId: req.user._id,
                resourceType: 'device',
                resourceId: deviceId,
                description: 'Device trusted',
                context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
            });

            res.status(200).json(device);
        } catch (error) {
            res.status(500).json({ error: 'Failed to trust device' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to trust device' });
    }
});

// Sessions Management
router.get('/sessions', authorize(Actions.READ, Subjects.SESSION), async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;
    try {
try {
            const sessions = await Session.find({}) // Add necessary filters
                .skip((page - 1) * limit)
                .limit(limit);
            const total = await Session.countDocuments({});

            res.status(200).json({ sessions, total });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve sessions' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});

router.delete('/sessions/:id', authorize(Actions.DELETE, Subjects.SESSION), async (req: Request, res: Response) => {
    const sessionId = req.params.id;
    const { reason } = req.body;
    try {
try {
            const session = await Session.findByIdAndDelete(sessionId);
            if (!session) return res.status(404).json({ error: 'Session not found' });

            await AuditLog.logEvent({
                action: 'admin.delete_session',
                category: 'admin',
                status: 'success',
                userId: req.user._id,
                resourceType: 'session',
                resourceId: sessionId,
                description: 'Session deleted',
                context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
            });

            res.status(200).json({ message: 'Session deleted' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete session' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// Audit Logs
router.get('/audit-logs', authorize(Actions.READ, Subjects.AUDIT_LOG), async (req: Request, res: Response) => {
    const { page = 1, limit = 50, ...filters } = req.query;
    try {
try {
            const logs = await AuditLog.find(filters)
                .skip((page - 1) * limit)
                .limit(limit);
            const total = await AuditLog.countDocuments(filters);

            res.status(200).json({ logs, total });
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve audit logs' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
});

// Security Events
router.get('/security-events', authorize(Actions.READ, Subjects.AUDIT_LOG), async (req: Request, res: Response) => {
    const { limit = 50 } = req.query;
    try {
try {
            const events = await AuditLog.getSecurityEvents({ limit });

            res.status(200).json(events);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve security events' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve security events' });
    }
});

// Pending Approvals
router.get('/approvals/pending', authorize(Actions.READ, Subjects.ALL), async (req: Request, res: Response) => {
    try {
try {
            const approvals = await PendingApproval.find();

            res.status(200).json(approvals);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve pending approvals' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve pending approvals' });
    }
});

router.post('/approvals/:id', authorize(Actions.UPDATE, Subjects.ALL), async (req: Request, res: Response) => {
    const approvalId = req.params.id;
    const { approved, reason } = req.body;
    try {
try {
            const approval = await PendingApproval.findById(approvalId);
            if (!approval) return res.status(404).json({ error: 'Approval not found' });

            // Assuming there's a logic to handle approval
            approval.status = approved ? 'approved' : 'rejected';
            await approval.save();

            await AuditLog.logEvent({
                action: 'admin.approve_request',
                category: 'admin',
                status: 'success',
                userId: req.user._id,
                resourceType: 'approval',
                resourceId: approvalId,
                description: `Request ${approval.status}`,
                context: { ipAddress: req.ip, userAgent: req.get('User-Agent') },
            });

            res.status(200).json(approval);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update approval' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update approval' });
    }
});

// System Health
router.get('/system/health', authorize(Actions.READ, Subjects.ALL), async (req: Request, res: Response) => {
    try {
try {
            // Custom logic to fetch system health metrics
            const health = {
                status: 'healthy',
                uptime: process.uptime(),
                memory: {
                    used: process.memoryUsage().heapUsed,
                    total: process.memoryUsage().heapTotal
                },
                cpu: {
                    usage: Math.random() * 100 // Placeholder for actual CPU usage logic
                },
                database: {
                    status: 'connected',
                    latency: Math.random() * 100 // Placeholder for actual latency
                },
                redis: {
                    status: 'connected',
                    latency: Math.random() * 100 // Placeholder for actual latency
                }
            };

            res.status(200).json(health);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve system health data' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve system health' });
    }
});

export default router;
