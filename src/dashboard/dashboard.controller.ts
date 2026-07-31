import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('corretor')
  @Roles(Role.corretor)
  resumoCorretor(@CurrentUser() requester: AuthenticatedUser) {
    return this.dashboardService.resumoCorretor(requester);
  }
}
