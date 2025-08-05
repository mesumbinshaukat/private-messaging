# Penetration Test Checklist

## Authentication
- Ensure all authentication endpoints enforce secure protocols (e.g., HTTPS).
- Validate the strength of password policies.
- Implement 2FA/MFA for sensitive account activities.
- Test for vulnerabilities such as brute force attacks and credential stuffing.

## Socket Hijacking
- Verify secure WebSocket connections using WSS.
- Implement token-based authentication for socket connections.
- Monitor abnormal socket activity and terminate suspicious connections.

## Rate Limiting
- Review rate limiting configurations for all APIs and login endpoints.
- Ensure rate limiting is applied across IP addresses and user accounts.
- Log and alert on rate limit violations.

## Encryption Key Leakage
- Confirm encryption keys are stored securely and with restricted access.
- Review code for hardcoded keys or secrets.
- Conduct scans for accidental commits of sensitive information.

## General
- Ensure that all dependencies are up-to-date with no known vulnerabilities.
- Implement regular security reviews and updates.
- Encourage developers to follow secure coding practices.
