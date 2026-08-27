import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { IMOVEIS_USADOS_ROLES } from './imoveis-usados.roles';
import {
  CreateVendaUsadoDto,
  QueryVendasUsadoDto,
  UpdateVendaUsadoDto,
  UpdateVinculoDto,
  VincularInteressadoDto,
} from './dto/imoveis-usados.dto';

@Controller('imoveis-usados')
@UseGuards(RolesGuard)
export class ImoveisUsadosController {
  constructor(private readonly service: ImoveisUsadosService) {}

  @Get('resumo')
  @Roles(...IMOVEIS_USADOS_ROLES)
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.resumo(user);
  }

  @Get('responsaveis')
  @Roles(...IMOVEIS_USADOS_ROLES)
  responsaveis(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listResponsaveis(user);
  }

  @Get('imoveis-captados')
  @Roles(...IMOVEIS_USADOS_ROLES)
  captados(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listImoveisCaptados(user);
  }

  @Get()
  @Roles(...IMOVEIS_USADOS_ROLES)
  list(
    @Query() query: QueryVendasUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(query, user);
  }

  @Get(':id/matching')
  @Roles(...IMOVEIS_USADOS_ROLES)
  matching(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.matching(id, user);
  }

  @Get(':id/interessados')
  @Roles(...IMOVEIS_USADOS_ROLES)
  interessados(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listVinculos(id, user);
  }

  @Get(':id')
  @Roles(...IMOVEIS_USADOS_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.get(id, user);
  }

  @Post()
  @Roles(...IMOVEIS_USADOS_ROLES)
  create(
    @Body() dto: CreateVendaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Roles(...IMOVEIS_USADOS_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/interessados')
  @Roles(...IMOVEIS_USADOS_ROLES)
  vincular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularInteressadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vincular(id, dto, user);
  }

  @Patch(':id/interessados/:vinculoId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  atualizarVinculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vinculoId', ParseUUIDPipe) vinculoId: string,
    @Body() dto: UpdateVinculoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizarVinculo(id, vinculoId, dto, user);
  }

  @Delete(':id/interessados/:vinculoId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  removerVinculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vinculoId', ParseUUIDPipe) vinculoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removerVinculo(id, vinculoId, user);
  }
}
