import type { UserStatus } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  status: UserStatus;
  roles: string[];
  permissions: string[];
}
