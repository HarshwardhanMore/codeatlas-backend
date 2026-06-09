import { type ConfigService } from '@nestjs/config';

import { OAuthTokenEncryptionService } from './oauth-token-encryption.service';

function createConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn<string, [string]>((key) => {
      void key;
      return 'test-oauth-encryption-key-with-32-characters';
    }),
  } as unknown as ConfigService;
}

describe(OAuthTokenEncryptionService.name, () => {
  it('encrypts and decrypts OAuth tokens without preserving plaintext', () => {
    const service = new OAuthTokenEncryptionService(createConfigService());
    const token = 'provider-access-token';

    const encryptedToken = service.encrypt(token);

    expect(encryptedToken).not.toBe(token);
    expect(encryptedToken).not.toContain(token);
    expect(service.decrypt(encryptedToken)).toBe(token);
  });
});
