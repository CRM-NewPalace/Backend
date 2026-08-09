import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantCompanyController } from './tenant-company.controller';
import { TenantsService } from './tenants.service';
import { BootstrapTenantConnectionsService } from './bootstrap-tenant-connections.service';

@Module({
  controllers: [TenantCompanyController, TenantsController],
  providers: [TenantsService, BootstrapTenantConnectionsService],
  exports: [TenantsService],
})
export class TenantsModule {}
