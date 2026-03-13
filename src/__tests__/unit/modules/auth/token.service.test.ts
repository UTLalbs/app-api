import {
  issueAccessToken,
  verifyAccessToken,
  issueRefreshToken,
} from '../../../../modules/auth/token.service';
import type { User } from '../../../../modules/users/user.types';

// Mock de Redis
jest.mock('../../../../config/redis', () => ({
  getRedisClient: () => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  }),
}));

const mockUser: User = {
  id: '6636b37f15d0e298d923ea54',
  email: 'test@example.com',
  displayName: 'Test User',
  status: 'active',
  orgId: '6636b37f15d0e298d923ea55',
  roles: ['6636b37f15d0e298d923ea56'],
  clientId: null,
  identities: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('token.service', () => {
  describe('issueAccessToken', () => {
    it('genera un JWT válido', () => {
      const token = issueAccessToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // header.payload.signature
    });
  });

  describe('verifyAccessToken', () => {
    it('verifica un token válido y retorna el payload', () => {
      const token = issueAccessToken(mockUser);
      const payload = verifyAccessToken(token);

      expect(payload.sub).toBe(mockUser.id);
      expect(payload.email).toBe(mockUser.email);
      expect(payload.orgId).toBe(mockUser.orgId);
    });

    it('lanza AuthError con token inválido', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow();
    });

    it('lanza AuthError con token manipulado', () => {
      const token = issueAccessToken(mockUser);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyAccessToken(tampered)).toThrow();
    });
  });

  describe('issueRefreshToken', () => {
    it('genera un refresh token y lo guarda en Redis', async () => {
      const token = await issueRefreshToken(mockUser.id);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });
});