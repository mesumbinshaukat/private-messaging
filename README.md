# Private Messaging Application

A secure, end-to-end encrypted messaging application built with a modern monorepo architecture.

## Features

- 🔐 End-to-end encryption using RSA + AES
- 💬 Real-time messaging with Socket.IO
- 📱 Progressive Web App (PWA) support
- 🎥 WebRTC voice/video calls
- 📁 File sharing with encryption
- 🔒 JWT-based authentication
- 🏗️ Monorepo architecture with Nx
- 🧪 Comprehensive testing (Jest, Cypress, Supertest)
- 🚀 CI/CD with GitHub Actions
- 🐳 Docker development environment

## Architecture

```
packages/
├── client/          # Next.js PWA frontend
├── server/          # Express.js backend
└── shared/          # Shared types, utils, crypto
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd private-messaging
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start development services**
   ```bash
   # Start MongoDB, Redis, TURN server
   docker-compose up -d
   
   # Copy environment file
   cp .env.example .env
   
   # Start all packages in development mode
   pnpm run dev
   ```

4. **Access the application**
   - Client: http://localhost:3000
   - Server: http://localhost:3001
   - MongoDB Express: http://localhost:8081
   - Dev Socket Server: http://localhost:4000

## Development

### Scripts

```bash
# Development
pnpm run dev           # Start all packages in dev mode
pnpm run build         # Build all packages
pnpm run clean         # Clean build artifacts

# Testing
pnpm run test          # Run unit tests
pnpm run test:e2e      # Run Cypress E2E tests

# Code Quality
pnpm run lint          # Lint all packages
pnpm run format        # Format code with Prettier
pnpm run type-check    # TypeScript type checking

# Git
pnpm run commit        # Commit with conventional commits
```

### Monorepo Structure

- **packages/shared**: Common types, utilities, and crypto functions
- **packages/client**: Next.js PWA with React, TailwindCSS
- **packages/server**: Express.js API with Socket.IO, MongoDB

### Testing Strategy

- **Unit Tests**: Jest for business logic
- **Integration Tests**: Supertest for API endpoints
- **E2E Tests**: Cypress for user workflows
- **Type Safety**: TypeScript across all packages

## Deployment

### Docker Production

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables

See `.env.example` for all required environment variables.

## Security

- **Encryption**: End-to-end encryption with RSA + AES
- **Authentication**: JWT with refresh tokens
- **Rate Limiting**: Express rate limiting
- **Security Headers**: Helmet.js
- **Dependency Scanning**: Snyk integration
- **CORS**: Configured for production

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `pnpm run commit`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

### Commit Convention

We use [Conventional Commits](https://conventionalcommits.org/):

```
feat: add new messaging feature
fix: resolve encryption bug
docs: update API documentation
test: add unit tests for crypto utils
```

## Tools & Technologies

### Frontend
- **Next.js 14**: React framework with SSR/SSG
- **PWA**: Service workers, offline support
- **TailwindCSS**: Utility-first CSS framework
- **Socket.IO Client**: Real-time communication
- **React Hook Form**: Form handling
- **Zustand**: State management

### Backend
- **Express.js**: Web framework
- **Socket.IO**: Real-time communication
- **MongoDB**: Document database
- **Mongoose**: MongoDB ODM
- **JWT**: Authentication tokens
- **Bcrypt**: Password hashing

### DevOps
- **Nx**: Monorepo tooling
- **Docker**: Containerization
- **GitHub Actions**: CI/CD
- **Snyk**: Security scanning
- **Prettier**: Code formatting
- **ESLint**: Code linting
- **Husky**: Git hooks

## License

MIT License - see LICENSE file for details.
