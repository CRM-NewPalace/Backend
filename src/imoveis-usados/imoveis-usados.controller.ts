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
import { VendaUsadoFluxoService } from './venda-usado-fluxo.service';
import { IMOVEIS_USADOS_ROLES } from './imoveis-usados.roles';
import {
  CreateVendaUsadoDto,
  QueryVendasUsadoDto,
  UpdateVendaUsadoDto,
  UpdateVinculoDto,
  VincularInteressadoDto,
} from './dto/imoveis-usados.dto';
import {
  CreateNegociacaoMovimentoDto,
  CreatePropostaUsadoDto,
  CreateVisitaUsadoDto,
  FeedbackVisitaUsadoDto,
  UpdatePropostaUsadoDto,
  UpdateVisitaUsadoDto,
} from './dto/venda-usado-fluxo.dto';

@Controller('imoveis-usados')
@UseGuards(RolesGuard)
export class ImoveisUsadosController {
  constructor(
    private readonly service: ImoveisUsadosService,
    private readonly fluxo: VendaUsadoFluxoService,
  ) {}

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

  @Get(':id/visitas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listVisitas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.listVisitas(id, user);
  }

  @Post(':id/visitas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createVisita(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVisitaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.createVisita(id, dto, user);
  }

  @Patch(':id/visitas/:visitaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateVisita(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitaId', ParseUUIDPipe) visitaId: string,
    @Body() dto: UpdateVisitaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.updateVisita(id, visitaId, dto, user);
  }

  @Post(':id/visitas/:visitaId/feedback')
  @Roles(...IMOVEIS_USADOS_ROLES)
  feedbackVisita(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitaId', ParseUUIDPipe) visitaId: string,
    @Body() dto: FeedbackVisitaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.feedbackVisita(id, visitaId, dto, user);
  }

  @Get(':id/propostas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listPropostas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.listPropostas(id, user);
  }

  @Post(':id/propostas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createProposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePropostaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.createProposta(id, dto, user);
  }

  @Get(':id/propostas/:propostaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getProposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.getProposta(id, propostaId, user);
  }

  @Patch(':id/propostas/:propostaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateProposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @Body() dto: UpdatePropostaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.updateProposta(id, propostaId, dto, user);
  }

  @Get(':id/propostas/:propostaId/negociacao')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getNegociacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.getProposta(id, propostaId, user).then((p) => p.negociacao);
  }

  @Post(':id/propostas/:propostaId/negociacao')
  @Roles(...IMOVEIS_USADOS_ROLES)
  addMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @Body() dto: CreateNegociacaoMovimentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.addMovimento(id, propostaId, dto, user);
  }
}
