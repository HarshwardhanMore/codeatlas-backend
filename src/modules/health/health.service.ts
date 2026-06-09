import { Injectable } from '@nestjs/common';

import { HEALTH_STATUS_OK } from './health.constants';

import type { HealthStatus } from './health.types';

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    return {
      status: HEALTH_STATUS_OK,
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }
}
