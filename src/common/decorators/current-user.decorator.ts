import { createParamDecorator, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedUser } from '../types/authenticated-user';
import type { ExecutionContext } from '@nestjs/common';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new UnauthorizedException('Authenticated user was not attached to the request.');
    }

    return request.user;
  },
);
