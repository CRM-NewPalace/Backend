import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantCompanyController } from './tenant-company.controller';
import { TenantsService } from './tenants.service';
import { BootstrapTenantConnectionsService } from './bootstrap-tenant-connections.service';
import { TenantLogoColorService } from './tenant-logo-color.service';

@Module({
  controllers: [TenantCompanyController, TenantsController],
  providers: [
    TenantsService,
    BootstrapTenantConnectionsService,
    TenantLogoColorService,
  ],
  exports: [TenantsService, TenantLogoColorService],
})
export class TenantsModule {}
