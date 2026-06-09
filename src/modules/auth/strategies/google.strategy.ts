import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

import type { GoogleOAuthProfile } from '../auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      callbackURL: configService.getOrThrow<string>('oauth.google.callbackUrl'),
      clientID: configService.getOrThrow<string>('oauth.google.clientId'),
      clientSecret: configService.getOrThrow<string>('oauth.google.clientSecret'),
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleOAuthProfile {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException('Google account did not provide an email address.');
    }

    return {
      avatar: profile.photos?.[0]?.value ?? null,
      email,
      name: profile.displayName || email,
      providerId: profile.id,
    };
  }
}
