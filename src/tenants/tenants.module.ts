import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantCompanyController } from './tenant-company.controller';
import { TenantsService } from './tenants.service';
import { BootstrapTenantConnectionsService } from './bootstrap-tenant-connections.service';
import { TenantLogoColorService } from './tenant-logo-color.service';
import { TenantCloneService } from './tenant-clone.service';
import { TenantDemoDataService } from './tenant-demo-data.service';

@Module({
  controllers: [TenantCompanyController, TenantsController],
  providers: [
    TenantsService,
    TenantCloneService,
    TenantDemoDataService,
    BootstrapTenantConnectionsService,
    TenantLogoColorService,
  ],
  exports: [TenantsService, TenantLogoColorService],
})
export class TenantsModule {}
