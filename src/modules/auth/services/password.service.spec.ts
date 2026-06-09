import { PasswordService } from './password.service';

describe(PasswordService.name, () => {
  it('hashes and verifies a password without storing plaintext', async () => {
    const service = new PasswordService();
    const password = 'enterprise-secret-password';

    const passwordHash = await service.hashPassword(password);

    expect(passwordHash).not.toBe(password);
    await expect(service.verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(service.verifyPassword('wrong-password', passwordHash)).resolves.toBe(false);
  });
});
