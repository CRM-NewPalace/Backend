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
import { CreateTituloDto } from './dto/create-titulo.dto';
import { UpdateMovimentoDto } from './dto/update-movimento.dto';
import { UpdateParceiroDto } from './dto/update-parceiro.dto';
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
  fluxoCaixa(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.fluxoCaixa(requester);
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
  ) {
    return this.financeiroService.listTitulos(requester, tipo);
  }

  @Post('titulos')
  @Roles(Role.admin, Role.gerente)
  createTitulo(
    @Body() dto: CreateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulo(dto, requester);
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
