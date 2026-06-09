import { HealthService } from './health.service';

describe(HealthService.name, () => {
  it('returns a typed health status', () => {
    const service = new HealthService();

    const result = service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.uptimeSeconds).toEqual(expect.any(Number));
    expect(result.checkedAt).toEqual(expect.any(String));
  });
});
