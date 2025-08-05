// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
  },
  USERS: {
    BASE: '/api/users',
    PROFILE: '/api/users/profile',
    SEARCH: '/api/users/search',
    STATUS: '/api/users/status',
  },
  MESSAGES: {
    BASE: '/api/messages',
    CONVERSATION: '/api/messages/conversation',
    SEND: '/api/messages/send',
    READ: '/api/messages/read',
  },
  CONVERSATIONS: {
    BASE: '/api/conversations',
    CREATE: '/api/conversations/create',
    JOIN: '/api/conversations/join',
    LEAVE: '/api/conversations/leave',
  },
  FILES: {
    UPLOAD: '/api/files/upload',
    DOWNLOAD: '/api/files/download',
  },
} as const;

// Socket events
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECONNECT: 'reconnect',
  
  // Authentication
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  AUTHENTICATION_ERROR: 'authentication_error',
  
  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_RECEIVE: 'message:receive',
  MESSAGE_READ: 'message:read',
  MESSAGE_TYPING: 'message:typing',
  
  // Conversations
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  CONVERSATION_TYPING: 'conversation:typing',
  
  // WebRTC
  WEBRTC_OFFER: 'webrtc:offer',
  WEBRTC_ANSWER: 'webrtc:answer',
  WEBRTC_ICE_CANDIDATE: 'webrtc:ice-candidate',
  WEBRTC_CALL_START: 'webrtc:call-start',
  WEBRTC_CALL_END: 'webrtc:call-end',
  
  // User status
  USER_STATUS: 'user:status',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  
  // Errors
  ERROR: 'error',
} as const;

// Error codes
export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  
  // Authorization errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  
  // Server errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  
  // File upload errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  
  // WebRTC errors
  WEBRTC_PEER_CONNECTION_FAILED: 'WEBRTC_PEER_CONNECTION_FAILED',
  WEBRTC_MEDIA_ACCESS_DENIED: 'WEBRTC_MEDIA_ACCESS_DENIED',
} as const;

// Configuration constants
export const CONFIG = {
  // JWT
  JWT_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  
  // File upload limits
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json',
  ],
  
  // Message limits
  MAX_MESSAGE_LENGTH: 4096,
  MAX_USERNAME_LENGTH: 20,
  MIN_USERNAME_LENGTH: 3,
  MIN_PASSWORD_LENGTH: 8,
  
  // WebRTC
  STUN_SERVERS: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // Database
  DB_CONNECTION_TIMEOUT: 10000,
  DB_MAX_POOL_SIZE: 10,
} as const;

// UI Constants
export const UI_CONSTANTS = {
  // Colors
  COLORS: {
    PRIMARY: '#007bff',
    SECONDARY: '#6c757d',
    SUCCESS: '#28a745',
    DANGER: '#dc3545',
    WARNING: '#ffc107',
    INFO: '#17a2b8',
    LIGHT: '#f8f9fa',
    DARK: '#343a40',
  },
  
  // Breakpoints
  BREAKPOINTS: {
    XS: '0px',
    SM: '576px',
    MD: '768px',
    LG: '992px',
    XL: '1200px',
    XXL: '1400px',
  },
  
  // Z-index layers
  Z_INDEX: {
    DROPDOWN: 1000,
    STICKY: 1020,
    FIXED: 1030,
    MODAL_BACKDROP: 1040,
    MODAL: 1050,
    POPOVER: 1060,
    TOOLTIP: 1070,
  },
} as const;

// Environment variables (with defaults)
export const ENV_DEFAULTS = {
  NODE_ENV: 'development',
  PORT: 3001,
  CLIENT_URL: 'http://localhost:3000',
  SERVER_URL: 'http://localhost:3001',
  MONGO_URI: 'mongodb://localhost:27017/private-messaging',
  JWT_SECRET: 'your-jwt-secret-change-in-production',
  REDIS_URL: 'redis://localhost:6379',
  TURN_SERVER_URL: 'turn:localhost:3478',
  TURN_SERVER_USERNAME: 'testuser',
  TURN_SERVER_CREDENTIAL: 'testpass',
} as const;
