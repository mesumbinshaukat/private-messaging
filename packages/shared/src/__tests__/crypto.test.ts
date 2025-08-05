import {
  generateSymmetricKey,
  encryptSymmetric,
  decryptSymmetric,
  encryptMessage,
  decryptMessage,
  hashPassword,
  generateToken,
} from '../crypto';

describe('Crypto utilities', () => {
  describe('Symmetric encryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const data = 'Hello, World!';
      const key = generateSymmetricKey();
      
      const { encrypted, iv } = encryptSymmetric(data, key);
      const decrypted = decryptSymmetric(encrypted, key, iv);
      
      expect(decrypted).toBe(data);
    });
  });

  describe('Message encryption', () => {
    it('should encrypt and decrypt messages end-to-end', async () => {
      const message = 'Secret message';
      const publicKey = 'test-public-key';
      const privateKey = 'test-private-key';
      
      const encryptedData = encryptMessage(message, publicKey);
      const decryptedMessage = decryptMessage(encryptedData, privateKey);
      
      expect(typeof encryptedData.encryptedContent).toBe('string');
      expect(typeof encryptedData.encryptedKey).toBe('string');
      expect(typeof encryptedData.iv).toBe('string');
      expect(decryptedMessage).toBe(message);
    });
  });

  describe('Password hashing', () => {
    it('should hash passwords consistently', () => {
      const password = 'mypassword123';
      const salt = 'salt123';
      
      const hash1 = hashPassword(password, salt);
      const hash2 = hashPassword(password, salt);
      
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(password);
    });
  });

  describe('Token generation', () => {
    it('should generate random tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      
      expect(token1).not.toBe(token2);
      expect(typeof token1).toBe('string');
      expect(token1.length).toBeGreaterThan(0);
    });

    it('should generate tokens of specified length', () => {
      const token = generateToken(16);
      expect(token.length).toBe(32); // hex encoded, so 2x the byte length
    });
  });
});
