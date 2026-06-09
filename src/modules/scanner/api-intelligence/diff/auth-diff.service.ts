import { Injectable } from '@nestjs/common';

import type { ApiAuthMetadata } from '../types/api-intelligence.types';
import type { AuthDiffResult } from '../versioning/api-versioning.types';

@Injectable()
export class AuthDiffService {
  diff(oldAuth: ApiAuthMetadata, newAuth: ApiAuthMetadata): AuthDiffResult {
    const oldRoles = [...oldAuth.roles].sort();
    const newRoles = [...newAuth.roles].sort();

    return {
      authRequiredChanged: oldAuth.authRequired !== newAuth.authRequired,
      newRoles,
      oldRoles,
      rolesAdded: newRoles.filter((role) => !oldRoles.includes(role)),
      rolesRemoved: oldRoles.filter((role) => !newRoles.includes(role)),
    };
  }
}
