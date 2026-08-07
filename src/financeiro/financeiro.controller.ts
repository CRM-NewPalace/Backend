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
import {
  FinanceiroDespesaNatureza,
  FinanceiroTituloTipo,
  Role,
} from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateComissaoDto } from './dto/create-comissao.dto';
import { CreateDespesaDto } from './dto/create-despesa.dto';
import { CreateDespesaTipoDto } from './dto/create-despesa-tipo.dto';
import { CreateMovimentoDto } from './dto/create-movimento.dto';
import { CreateParceiroDto } from './dto/create-parceiro.dto';
import { BaixarTituloDto } from './dto/baixar-titulo.dto';
import { CreateTituloDto } from './dto/create-titulo.dto';
import { CreateTitulosParceladoDto } from './dto/create-titulos-parcelado.dto';
import { QueryFluxoCaixaDto } from './dto/query-fluxo-caixa.dto';
import { UpdateDespesaDto } from './dto/update-despesa.dto';
import { UpdateDespesaTipoDto } from './dto/update-despesa-tipo.dto';
import { UpdateMovimentoDto } from './dto/update-movimento.dto';
import { UpdateParceiroDto } from './dto/update-parceiro.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';
import { UpdateComissaoDto } from './dto/update-comissao.dto';
import { FinanceiroService } from './financeiro.service';

@Controller('financeiro')
@UseGuards(RolesGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  // ─── Resumos ─────────────────────────────────────────────────

  @Get('visao-geral')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  visaoGeral(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.visaoGeral(requester);
  }

  @Get('fluxo-caixa')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  fluxoCaixa(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryFluxoCaixaDto,
  ) {
    return this.financeiroService.fluxoCaixa(requester, query);
  }

  @Get('fluxo-caixa/itens')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  fluxoCaixaItens(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeiroService.fluxoCaixaItens(requester, from, to);
  }

  @Get('centros-despesa')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  centrosDespesa(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.centrosDespesa(requester);
  }

  // ─── Parceiros ───────────────────────────────────────────────

  @Get('parceiros')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listParceiros(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listParceiros(requester);
  }

  @Post('parceiros')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createParceiro(
    @Body() dto: CreateParceiroDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createParceiro(dto, requester);
  }

  @Patch('parceiros/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateParceiro(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParceiroDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateParceiro(id, dto, requester);
  }

  @Delete('parceiros/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeParceiro(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeParceiro(id, requester);
  }

  // ─── Movimentos ──────────────────────────────────────────────

  @Get('movimentos')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listMovimentos(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listMovimentos(requester);
  }

  @Post('movimentos')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createMovimento(
    @Body() dto: CreateMovimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createMovimento(dto, requester);
  }

  @Patch('movimentos/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateMovimento(id, dto, requester);
  }

  @Delete('movimentos/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeMovimento(id, requester);
  }

  // ─── Títulos ─────────────────────────────────────────────────

  @Get('titulos')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listTitulos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('tipo') tipo?: FinanceiroTituloTipo,
    @Query('grupoParcelasId') grupoParcelasId?: string,
  ) {
    return this.financeiroService.listTitulos(requester, tipo, grupoParcelasId);
  }

  @Post('titulos')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createTitulo(
    @Body() dto: CreateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulo(dto, requester);
  }

  @Post('titulos/parcelado')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createTitulosParcelado(
    @Body() dto: CreateTitulosParceladoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulosParcelado(dto, requester);
  }

  @Patch('titulos/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateTitulo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateTitulo(id, dto, requester);
  }

  @Post('titulos/:id/baixar')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  baixarTitulo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BaixarTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.baixarTitulo(id, dto, requester);
  }

  @Delete('titulos/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeTitulo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeTitulo(id, requester);
  }

  // ─── Comissões ───────────────────────────────────────────────

  @Get('comissoes/vendas-elegiveis')
  @Roles(Role.admin, Role.super_admin)
  listVendasElegiveis(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listVendasElegiveis(requester);
  }

  @Get('comissoes')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.super_admin)
  listComissoes(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listComissoes(requester);
  }

  @Post('comissoes')
  @Roles(Role.admin, Role.super_admin)
  createComissao(
    @Body() dto: CreateComissaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createComissao(dto, requester);
  }

  @Patch('comissoes/:id')
  @Roles(Role.admin, Role.super_admin)
  updateComissao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComissaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateComissao(id, dto, requester);
  }

  @Delete('comissoes/:id')
  @Roles(Role.admin, Role.super_admin)
  removeComissao(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeComissao(id, requester);
  }

  // ─── Centro de despesas ──────────────────────────────────────

  @Get('despesa-tipos')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listDespesaTipos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('natureza') natureza?: FinanceiroDespesaNatureza,
  ) {
    return this.financeiroService.listDespesaTipos(requester, natureza);
  }

  @Post('despesa-tipos')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createDespesaTipo(
    @Body() dto: CreateDespesaTipoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createDespesaTipo(dto, requester);
  }

  @Patch('despesa-tipos/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateDespesaTipo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDespesaTipoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateDespesaTipo(id, dto, requester);
  }

  @Delete('despesa-tipos/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeDespesaTipo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeDespesaTipo(id, requester);
  }

  @Get('despesas')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listDespesas(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('natureza') natureza?: FinanceiroDespesaNatureza,
  ) {
    return this.financeiroService.listDespesas(requester, natureza);
  }

  @Post('despesas')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createDespesa(
    @Body() dto: CreateDespesaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createDespesa(dto, requester);
  }

  @Patch('despesas/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateDespesa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDespesaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateDespesa(id, dto, requester);
  }

  @Delete('despesas/:id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeDespesa(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeDespesa(id, requester);
  }
}
