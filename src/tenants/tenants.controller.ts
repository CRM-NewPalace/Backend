import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateMetaConnectionDto } from './dto/create-meta-connection.dto';
import { UpdateMetaConnectionDto } from './dto/update-meta-connection.dto';
import { CreateOzapConnectionDto } from './dto/create-ozap-connection.dto';
import { UpdateOzapConnectionDto } from './dto/update-ozap-connection.dto';
import { DuplicateTenantDto } from './dto/duplicate-tenant.dto';
import { UpdateTenantAdminDto } from './dto/update-tenant-admin.dto';
import { PopulateDemoDataDto } from './dto/populate-demo-data.dto';

/**
 * Administração de tenants (imobiliárias) da plataforma.
 * Acesso restrito ao super_admin.
 */
@Controller('tenants')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateTenantDto = {},
  ) {
    return this.tenantsService.duplicate(id, dto ?? {});
  }

  /** Popula o tenant com dados fictícios variados (demonstração). */
  @Post(':id/demo-data')
  populateDemoData(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PopulateDemoDataDto = {},
  ) {
    return this.tenantsService.populateDemoData(id, dto ?? {});
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post(':id/admin')
  createInitialAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTenantAdminDto,
  ) {
    return this.tenantsService.createInitialAdmin(id, dto ?? {});
  }

  @Post(':id/users')
  createUserForTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTenantUserDto,
  ) {
    return this.tenantsService.createUserForTenant(id, dto);
  }

  @Post(':id/admin/reset-password')
  resetAdminPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.resetAdminPassword(id);
  }

  @Patch(':id/admin')
  updateAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantAdminDto,
  ) {
    return this.tenantsService.updateAdmin(id, dto);
  }

  @Patch(':id')
  @Roles(Role.super_admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.super_admin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.remove(id);
  }

  @Get(':id/meta-connections')
  listMetaConnections(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.listMetaConnections(id);
  }

  @Post(':id/meta-connections')
  createMetaConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMetaConnectionDto,
  ) {
    return this.tenantsService.createMetaConnection(id, dto);
  }

  @Patch(':tenantId/meta-connections/:connectionId')
  updateMetaConnection(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: UpdateMetaConnectionDto,
  ) {
    return this.tenantsService.updateMetaConnection(
      tenantId,
      connectionId,
      dto,
    );
  }

  @Delete(':tenantId/meta-connections/:connectionId')
  removeMetaConnection(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.tenantsService.removeMetaConnection(tenantId, connectionId);
  }

  @Get(':id/ozap-connections')
  listOzapConnections(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.listOzapConnections(id);
  }

  @Post(':id/ozap-connections')
  createOzapConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOzapConnectionDto,
  ) {
    return this.tenantsService.createOzapConnection(id, dto);
  }

  @Patch(':tenantId/ozap-connections/:connectionId')
  updateOzapConnection(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: UpdateOzapConnectionDto,
  ) {
    return this.tenantsService.updateOzapConnection(
      tenantId,
      connectionId,
      dto,
    );
  }

  @Delete(':tenantId/ozap-connections/:connectionId')
  removeOzapConnection(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.tenantsService.removeOzapConnection(tenantId, connectionId);
  }
}
