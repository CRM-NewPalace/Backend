import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CompleteOruloOAuthDto } from './dto/complete-orulo-oauth.dto';
import { UpsertOruloConnectionDto } from './dto/upsert-orulo-connection.dto';
import { OruloService } from './orulo.service';

@Controller('integrations/orulo')
@UseGuards(RolesGuard)
export class OruloController {
  constructor(private readonly orulo: OruloService) {}

  @Get('status')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.orulo.status(user);
  }

  @Post('connect')
  @Roles(Role.admin)
  connect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertOruloConnectionDto,
  ) {
    return this.orulo.upsert(user, dto);
  }

  @Post('disconnect')
  @Roles(Role.admin)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.orulo.disconnectForTenant(user.tenantId!);
  }

  @Post('sync')
  @Roles(Role.admin, Role.gerente)
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.orulo.syncNow(user);
  }

  @Get('oauth/url')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  oauthUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.orulo.authorizeUrl(user);
  }

  @Post('oauth/complete')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  oauthComplete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteOruloOAuthDto,
  ) {
    return this.orulo.completeEndUser(user, dto.code);
  }

  @Get('empreendimentos/:id/comercial')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee)
  comercial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orulo.comercial(user, id);
  }
}
