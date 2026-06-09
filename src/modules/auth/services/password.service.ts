import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

import { PASSWORD_HASH_ROUNDS } from '../auth.constants';

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return hash(password, PASSWORD_HASH_ROUNDS);
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }
}
