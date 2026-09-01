import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateTenantCompanyDto } from './dto/update-tenant-company.dto';
import { TenantsService } from './tenants.service';

/**
 * Cadastro da imobiliária do tenant logado.
 * Leitura: admin/gerente (contratos). Escrita: só admin.
 */
@Controller('tenant/company')
@UseGuards(RolesGuard)
export class TenantCompanyController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.admin, Role.gerente)
  getCompany(@CurrentUser() requester: AuthenticatedUser) {
    return this.tenantsService.getCompanyProfile(requester);
  }

  @Patch()
  @Roles(Role.admin)
  updateCompany(
    @CurrentUser() requester: AuthenticatedUser,
    @Body() dto: UpdateTenantCompanyDto,
  ) {
    return this.tenantsService.updateCompanyProfile(requester, dto);
  }
}
