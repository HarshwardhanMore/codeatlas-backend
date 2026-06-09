import { Injectable } from '@nestjs/common';

import { UserRepository } from './users.repository';

export interface UserDto {
  id: string;
}

export type UserId = string;

class BaseService {}

@Injectable()
export class UserService extends BaseService {
  constructor(private readonly repository: UserRepository) {}

  findUser(id: UserId): UserDto {
    return this.repository.find(id);
  }
}

export function normalizeUserId(id: string): UserId {
  return id.trim();
}
