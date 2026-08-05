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
import { FinanceiroTituloTipo, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateComissaoDto } from './dto/create-comissao.dto';
import { CreateMovimentoDto } from './dto/create-movimento.dto';
import { CreateParceiroDto } from './dto/create-parceiro.dto';
import { BaixarTituloDto } from './dto/baixar-titulo.dto';
import { CreateTituloDto } from './dto/create-titulo.dto';
import { CreateTitulosParceladoDto } from './dto/create-titulos-parcelado.dto';
import { QueryFluxoCaixaDto } from './dto/query-fluxo-caixa.dto';
import { UpdateMovimentoDto } from './dto/update-movimento.dto';
import { UpdateParceiroDto } from './dto/update-parceiro.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';
import { FinanceiroService } from './financeiro.service';

@Controller('financeiro')
@UseGuards(RolesGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  // ─── Resumos ─────────────────────────────────────────────────

  @Get('visao-geral')
  @Roles(Role.admin, Role.gerente)
  visaoGeral(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.visaoGeral(requester);
  }

  @Get('fluxo-caixa')
  @Roles(Role.admin, Role.gerente)
  fluxoCaixa(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryFluxoCaixaDto,
  ) {
    return this.financeiroService.fluxoCaixa(requester, query);
  }

  @Get('fluxo-caixa/itens')
  @Roles(Role.admin, Role.gerente)
  fluxoCaixaItens(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeiroService.fluxoCaixaItens(requester, from, to);
  }

  @Get('centros-despesa')
  @Roles(Role.admin, Role.gerente)
  centrosDespesa(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.centrosDespesa(requester);
  }

  @Get('demonstrativo')
  @Roles(Role.admin, Role.gerente)
  demonstrativo(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.demonstrativo(requester);
  }

  // ─── Parceiros ───────────────────────────────────────────────

  @Get('parceiros')
  @Roles(Role.admin, Role.gerente)
  listParceiros(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listParceiros(requester);
  }

  @Post('parceiros')
  @Roles(Role.admin, Role.gerente)
  createParceiro(
    @Body() dto: CreateParceiroDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createParceiro(dto, requester);
  }

  @Patch('parceiros/:id')
  @Roles(Role.admin, Role.gerente)
  updateParceiro(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParceiroDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateParceiro(id, dto, requester);
  }

  @Delete('parceiros/:id')
  @Roles(Role.admin, Role.gerente)
  removeParceiro(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeParceiro(id, requester);
  }

  // ─── Movimentos ──────────────────────────────────────────────

  @Get('movimentos')
  @Roles(Role.admin, Role.gerente)
  listMovimentos(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listMovimentos(requester);
  }

  @Post('movimentos')
  @Roles(Role.admin, Role.gerente)
  createMovimento(
    @Body() dto: CreateMovimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createMovimento(dto, requester);
  }

  @Patch('movimentos/:id')
  @Roles(Role.admin, Role.gerente)
  updateMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateMovimento(id, dto, requester);
  }

  @Delete('movimentos/:id')
  @Roles(Role.admin, Role.gerente)
  removeMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeMovimento(id, requester);
  }

  // ─── Títulos ─────────────────────────────────────────────────

  @Get('titulos')
  @Roles(Role.admin, Role.gerente)
  listTitulos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('tipo') tipo?: FinanceiroTituloTipo,
    @Query('grupoParcelasId') grupoParcelasId?: string,
  ) {
    return this.financeiroService.listTitulos(
      requester,
      tipo,
      grupoParcelasId,
    );
  }

  @Post('titulos')
  @Roles(Role.admin, Role.gerente)
  createTitulo(
    @Body() dto: CreateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulo(dto, requester);
  }

  @Post('titulos/parcelado')
  @Roles(Role.admin, Role.gerente)
  createTitulosParcelado(
    @Body() dto: CreateTitulosParceladoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulosParcelado(dto, requester);
  }

  @Patch('titulos/:id')
  @Roles(Role.admin, Role.gerente)
  updateTitulo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateTitulo(id, dto, requester);
  }

  @Post('titulos/:id/baixar')
  @Roles(Role.admin, Role.gerente)
  baixarTitulo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BaixarTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.baixarTitulo(id, dto, requester);
  }

  @Delete('titulos/:id')
  @Roles(Role.admin, Role.gerente)
  removeTitulo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeTitulo(id, requester);
  }

  // ─── Comissões ───────────────────────────────────────────────

  @Get('comissoes')
  @Roles(Role.admin, Role.gerente)
  listComissoes(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listComissoes(requester);
  }

  @Post('comissoes')
  @Roles(Role.admin, Role.gerente)
  createComissao(
    @Body() dto: CreateComissaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createComissao(dto, requester);
  }
}
