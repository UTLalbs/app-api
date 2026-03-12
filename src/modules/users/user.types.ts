import type { ObjectId } from 'mongodb';

export interface UserDocument {
  _id: ObjectId;
  email: string;
  displayName: string;
  status: UserStatus;
  orgId: ObjectId;
  roles: ObjectId[];
   clientId: ObjectId | null;
  identities: UserIdentities;
  passwordHistory: PasswordHistoryEntry[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  orgId: string;
  roles: string[];
  clientId: string | null;
  identities: UserIdentities;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UserStatus = 'active' | 'disabled' | 'pending';

export interface UserIdentities {
  googleSub?: string;
  microsoftOid?: string;
  localPasswordHash?: string;
}

export interface PasswordHistoryEntry {
  hash: string;
  changedAt: Date;
}

export interface CreateUserDto {
  email: string;
  displayName: string;
  orgId: string;
  roles?: string[];
  identities?: Partial<UserIdentities>;
  clientId?: string | null;
}

export interface UpdateUserDto {
  displayName?: string;
  status?: UserStatus;
  roles?: string[];
  clientId?: string | null;
}