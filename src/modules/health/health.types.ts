import type { HEALTH_STATUS_OK } from './health.constants';

export interface HealthStatus {
  status: typeof HEALTH_STATUS_OK;
  uptimeSeconds: number;
  checkedAt: string;
}
