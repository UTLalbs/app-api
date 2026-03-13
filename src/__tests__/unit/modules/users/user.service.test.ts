import {
  findUserById,
  findUserByEmail,
  findAllUsers,
  createUser,
} from '../../../../modules/users/user.repository';
import { getUserById, listUsers, registerUser } from '../../../../modules/users/user.service';
import type { User } from '../../../../modules/users/user.types';
import { NotFoundError, ForbiddenError } from '../../../../shared/errors/AppError';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../../../modules/users/user.repository');
jest.mock('../../../../infrastructure/cache/cache.service', () => ({
  getOrSet: jest.fn((_key, fn) => fn()),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  CacheKeys: {
    userOne: (id: string) => `users:one:${id}`,
    userList: (orgId: string) => `users:list:${orgId}`,
  },
  CacheTTL: { SHORT: 60, MEDIUM: 300, LONG: 3600 },
}));
jest.mock('../../../../middleware/authorize', () => ({
  invalidatePermissionsCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../modules/audit/audit.service', () => ({
  createAuditEvent: jest.fn().mockResolvedValue(undefined),
}));


// ── Fixtures ───────────────────────────────────────────────────────────────

const mockUser: User = {
  id: '6636b37f15d0e298d923ea54',
  email: 'test@example.com',
  displayName: 'Test User',
  status: 'active',
  orgId: '6636b37f15d0e298d923ea55',
  roles: [],
  clientId: null,
  identities: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const orgId = '6636b37f15d0e298d923ea55';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('user.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('retorna el usuario si existe', async () => {
      (findUserById as jest.Mock).mockResolvedValue(mockUser);

      const user = await getUserById(mockUser.id, orgId);

      expect(user).toEqual(mockUser);
      expect(findUserById).toHaveBeenCalledWith(mockUser.id, orgId);
    });

    it('lanza NotFoundError si el usuario no existe', async () => {
      (findUserById as jest.Mock).mockResolvedValue(null);

      await expect(getUserById('nonexistent', orgId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('listUsers', () => {
    it('retorna lista de usuarios', async () => {
      (findAllUsers as jest.Mock).mockResolvedValue([mockUser]);

      const users = await listUsers(orgId);

      expect(users).toHaveLength(1);
      expect(users[0]).toEqual(mockUser);
    });

    it('retorna lista vacía si no hay usuarios', async () => {
      (findAllUsers as jest.Mock).mockResolvedValue([]);

      const users = await listUsers(orgId);

      expect(users).toHaveLength(0);
    });
  });

  describe('registerUser', () => {
    it('crea un usuario nuevo correctamente', async () => {
      (findUserByEmail as jest.Mock).mockResolvedValue(null);
      (createUser as jest.Mock).mockResolvedValue(mockUser);

      const user = await registerUser({
        email: mockUser.email,
        displayName: mockUser.displayName,
        orgId,
      });

      expect(user).toEqual(mockUser);
      expect(createUser).toHaveBeenCalledTimes(1);
    });

    it('lanza ForbiddenError si el email ya existe', async () => {
      (findUserByEmail as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        registerUser({
          email: mockUser.email,
          displayName: mockUser.displayName,
          orgId,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(createUser).not.toHaveBeenCalled();
    });
  });
});