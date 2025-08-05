import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupSocketIO } from './socket';
import { 
  securityHeaders, 
  sanitizeInput, 
  generalRateLimit, 
  validationErrorHandler,
  requestLogger,
  corsOptions 
} from './middleware/security';
import { AuditLog } from './models';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Global middleware
app.use(cors(corsOptions));
app.use(securityHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(generalRateLimit);
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.SERVER_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', require('./controllers/auth'));
app.use('/api/users', require('./controllers/users'));
app.use('/api/messages', require('./controllers/messages'));
app.use('/api/calls', require('./controllers/calls'));
app.use('/api/devices', require('./controllers/devices'));
app.use('/api/keys', require('./controllers/keys'));
import adminController from './controllers/admin';
app.use('/api/admin', adminController);

// GraphQL endpoint (if using Apollo Server)
// app.use('/graphql', require('./graphql'));

// Error handling middleware
app.use(validationErrorHandler);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log error
  AuditLog.logEvent({
    action: 'server.error',
    category: 'system',
    severity: 'error',
    status: 'failure',
    userId: req.user?.userId,
    description: 'Server error occurred',
    error: {
      code: err.name || 'SERVER_ERROR',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    context: {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    },
  });

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    code: err.code || 'SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND'
  });
});

// Database connection
async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/private-messaging';
    
    await mongoose.connect(mongoUri, {
      // Connection options
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB');

    // Log database connection
    await AuditLog.logEvent({
      action: 'database.connected',
      category: 'system',
      severity: 'info',
      status: 'success',
      description: 'Successfully connected to MongoDB',
      context: {
        ipAddress: '127.0.0.1',
        serverVersion: process.env.SERVER_VERSION || '1.0.0',
      },
    });

  } catch (error: any) {
    console.error('❌ MongoDB connection error:', error);
    
    // Try to log the error (may fail if DB is completely down)
    try {
      await AuditLog.logEvent({
        action: 'database.connection_failed',
        category: 'system',
        severity: 'critical',
        status: 'failure',
        description: 'Failed to connect to MongoDB',
        error: {
          code: error.name,
          message: error.message,
        },
        context: {
          ipAddress: '127.0.0.1',
          serverVersion: process.env.SERVER_VERSION || '1.0.0',
        },
      });
    } catch (logError) {
      console.error('Failed to log database connection error:', logError);
    }

    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  
  await AuditLog.logEvent({
    action: 'server.shutdown',
    category: 'system',
    severity: 'info',
    status: 'success',
    description: 'Server shutting down gracefully',
    context: {
      ipAddress: '127.0.0.1',
      serverVersion: process.env.SERVER_VERSION || '1.0.0',
    },
  });

  server.close(() => {
    console.log('🔌 HTTP server closed');
    mongoose.connection.close(() => {
      console.log('🔌 MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  
  await AuditLog.logEvent({
    action: 'server.shutdown',
    category: 'system',
    severity: 'info',
    status: 'success',
    description: 'Server shutting down gracefully (SIGINT)',
    context: {
      ipAddress: '127.0.0.1',
      serverVersion: process.env.SERVER_VERSION || '1.0.0',
    },
  });

  server.close(() => {
    console.log('🔌 HTTP server closed');
    mongoose.connection.close(() => {
      console.log('🔌 MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Unhandled promise rejections
process.on('unhandledRejection', async (reason: any, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  await AuditLog.logEvent({
    action: 'server.unhandled_rejection',
    category: 'system',
    severity: 'critical',
    status: 'failure',
    description: 'Unhandled promise rejection',
    error: {
      code: reason?.name || 'UNHANDLED_REJECTION',
      message: reason?.message || String(reason),
      stack: reason?.stack,
    },
    context: {
      ipAddress: '127.0.0.1',
      serverVersion: process.env.SERVER_VERSION || '1.0.0',
    },
  });

  // Exit gracefully
  process.exit(1);
});

// Uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  
  try {
    await AuditLog.logEvent({
      action: 'server.uncaught_exception',
      category: 'system',
      severity: 'critical',
      status: 'failure',
      description: 'Uncaught exception',
      error: {
        code: error.name,
        message: error.message,
        stack: error.stack,
      },
      context: {
        ipAddress: '127.0.0.1',
        serverVersion: process.env.SERVER_VERSION || '1.0.0',
      },
    });
  } catch (logError) {
    console.error('Failed to log uncaught exception:', logError);
  }

  process.exit(1);
});

// Start server
async function startServer() {
  try {
    // Connect to database first
    await connectToDatabase();

    // Setup Socket.IO
    setupSocketIO(server);

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Server URL: http://localhost:${PORT}`);
      console.log(`⚡ Socket.IO messaging namespace: /messaging`);

      // Log server startup
      AuditLog.logEvent({
        action: 'server.started',
        category: 'system',
        severity: 'info',
        status: 'success',
        description: `Server started on port ${PORT}`,
        metadata: {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          version: process.env.SERVER_VERSION || '1.0.0',
        },
        context: {
          ipAddress: '127.0.0.1',
          serverVersion: process.env.SERVER_VERSION || '1.0.0',
        },
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Initialize server
startServer().catch((error) => {
  console.error('❌ Server initialization failed:', error);
  process.exit(1);
});

export default app;
