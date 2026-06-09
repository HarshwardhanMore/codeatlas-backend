import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { DashboardService } from '../services/dashboard.service';

import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { DashboardOverviewResponse } from '../services/dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Controller({
  path: 'dashboard',
  version: '1',
})
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOkResponse({ description: 'Authenticated user product dashboard metrics.' })
  getOverview(@CurrentUser() user: AuthenticatedUser): Promise<DashboardOverviewResponse> {
    return this.dashboardService.getOverview(user);
  }
}
