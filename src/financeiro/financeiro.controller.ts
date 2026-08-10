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
} from "@nestjs/common";
import {
  FinanceiroDespesaNatureza,
  FinanceiroMovimentoTipo,
  FinanceiroTituloTipo,
  Role,
} from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateCategoriaDto } from "./dto/create-categoria.dto";
import { CreateComissaoDto } from "./dto/create-comissao.dto";
import { CreateDespesaDto } from "./dto/create-despesa.dto";
import { CreateDespesaTipoDto } from "./dto/create-despesa-tipo.dto";
import { CreateMovimentoDto } from "./dto/create-movimento.dto";
import { CreateParceiroDto } from "./dto/create-parceiro.dto";
import { CreateRecebimentoDto } from "./dto/create-recebimento.dto";
import { CreateRecebimentoTipoDto } from "./dto/create-recebimento-tipo.dto";
import { BaixarTituloDto } from "./dto/baixar-titulo.dto";
import { CreateTituloDto } from "./dto/create-titulo.dto";
import { CreateTitulosParceladoDto } from "./dto/create-titulos-parcelado.dto";
import { QueryFluxoCaixaDto } from "./dto/query-fluxo-caixa.dto";
import { UpdateCategoriaDto } from "./dto/update-categoria.dto";
import { UpdateDespesaDto } from "./dto/update-despesa.dto";
import { UpdateDespesaTipoDto } from "./dto/update-despesa-tipo.dto";
import { UpdateMovimentoDto } from "./dto/update-movimento.dto";
import { UpdateParceiroDto } from "./dto/update-parceiro.dto";
import { UpdateRecebimentoDto } from "./dto/update-recebimento.dto";
import { UpdateRecebimentoTipoDto } from "./dto/update-recebimento-tipo.dto";
import { UpdateTituloDto } from "./dto/update-titulo.dto";
import { UpdateTitulosGrupoDto } from "./dto/update-titulos-grupo.dto";
import { UpdateComissaoDto } from "./dto/update-comissao.dto";
import { RenovarDespesasDto } from "./dto/renovar-despesas.dto";
import { RenovarRecebimentosDto } from "./dto/renovar-recebimentos.dto";
import { FinanceiroService } from "./financeiro.service";

@Controller("financeiro")
@UseGuards(RolesGuard)
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  // ─── Resumos ─────────────────────────────────────────────────

  @Get("visao-geral")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  visaoGeral(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.visaoGeral(requester);
  }

  @Get("fluxo-caixa")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  fluxoCaixa(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryFluxoCaixaDto,
  ) {
    return this.financeiroService.fluxoCaixa(requester, query);
  }

  @Get("fluxo-caixa/itens")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  fluxoCaixaItens(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.financeiroService.fluxoCaixaItens(requester, from, to);
  }

  @Get("centros-despesa")
  @Roles(Role.admin, Role.gerente)
  centrosDespesa(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.centrosDespesa(requester);
  }

  // ─── Parceiros ───────────────────────────────────────────────

  @Get("parceiros")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listParceiros(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listParceiros(requester);
  }

  @Post("parceiros")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createParceiro(
    @Body() dto: CreateParceiroDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createParceiro(dto, requester);
  }

  @Patch("parceiros/:id")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateParceiro(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateParceiroDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateParceiro(id, dto, requester);
  }

  @Delete("parceiros/:id")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeParceiro(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeParceiro(id, requester);
  }

  // ─── Categorias ──────────────────────────────────────────────

  @Get("categorias/resumo")
  @Roles(Role.admin, Role.gerente)
  resumoCategorias(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("periodo") periodo?: "mes" | "trimestre" | "ano" | "tudo",
    @Query("tipo") tipo?: FinanceiroMovimentoTipo,
  ) {
    return this.financeiroService.resumoCategorias(requester, {
      periodo,
      tipo,
    });
  }

  @Get("categorias")
  @Roles(Role.admin, Role.gerente)
  listCategorias(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("tipo") tipo?: FinanceiroMovimentoTipo,
  ) {
    return this.financeiroService.listCategorias(requester, tipo);
  }

  @Post("categorias")
  @Roles(Role.admin, Role.gerente)
  createCategoria(
    @Body() dto: CreateCategoriaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createCategoria(dto, requester);
  }

  @Patch("categorias/:id")
  @Roles(Role.admin, Role.gerente)
  updateCategoria(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoriaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateCategoria(id, dto, requester);
  }

  @Delete("categorias/:id")
  @Roles(Role.admin, Role.gerente)
  removeCategoria(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeCategoria(id, requester);
  }

  // ─── Movimentos ──────────────────────────────────────────────

  @Get("movimentos")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listMovimentos(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listMovimentos(requester);
  }

  @Post("movimentos")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createMovimento(
    @Body() dto: CreateMovimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createMovimento(dto, requester);
  }

  @Patch("movimentos/:id")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateMovimento(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateMovimento(id, dto, requester);
  }

  @Delete("movimentos/:id")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeMovimento(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeMovimento(id, requester);
  }

  // ─── Títulos ─────────────────────────────────────────────────

  @Get("titulos")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  listTitulos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("tipo") tipo?: FinanceiroTituloTipo,
    @Query("grupoParcelasId") grupoParcelasId?: string,
    @Query("origem") origem?: "normal" | "contrato",
  ) {
    return this.financeiroService.listTitulos(
      requester,
      tipo,
      grupoParcelasId,
      origem,
    );
  }

  @Post("titulos")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createTitulo(
    @Body() dto: CreateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulo(dto, requester);
  }

  @Post("titulos/parcelado")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createTitulosParcelado(
    @Body() dto: CreateTitulosParceladoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createTitulosParcelado(dto, requester);
  }

  @Patch("titulos/grupo/:grupoParcelasId")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateTitulosGrupo(
    @Param("grupoParcelasId", ParseUUIDPipe) grupoParcelasId: string,
    @Body() dto: UpdateTitulosGrupoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateTitulosGrupo(
      grupoParcelasId,
      dto,
      requester,
    );
  }

  @Patch("titulos/:id")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateTitulo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateTitulo(id, dto, requester);
  }

  @Post("titulos/:id/baixar")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  baixarTitulo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BaixarTituloDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.baixarTitulo(id, dto, requester);
  }

  @Delete("titulos/grupo/:grupoParcelasId")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeTitulosGrupo(
    @Param("grupoParcelasId", ParseUUIDPipe) grupoParcelasId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeTitulosGrupo(
      grupoParcelasId,
      requester,
    );
  }

  @Delete("titulos/:id")
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeTitulo(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeTitulo(id, requester);
  }

  // ─── Comissões ───────────────────────────────────────────────

  @Get("comissoes/vendas-elegiveis")
  @Roles(Role.admin, Role.super_admin)
  listVendasElegiveis(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listVendasElegiveis(requester);
  }

  @Get("comissoes")
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.super_admin)
  listComissoes(@CurrentUser() requester: AuthenticatedUser) {
    return this.financeiroService.listComissoes(requester);
  }

  @Post("comissoes")
  @Roles(Role.admin, Role.super_admin)
  createComissao(
    @Body() dto: CreateComissaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createComissao(dto, requester);
  }

  @Patch("comissoes/:id")
  @Roles(Role.admin, Role.super_admin)
  updateComissao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateComissaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateComissao(id, dto, requester);
  }

  @Delete("comissoes/:id")
  @Roles(Role.admin, Role.super_admin)
  removeComissao(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeComissao(id, requester);
  }

  // ─── Centro de despesas (somente imobiliária) ────────────────

  @Get("despesa-tipos")
  @Roles(Role.admin, Role.gerente)
  listDespesaTipos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("natureza") natureza?: FinanceiroDespesaNatureza,
  ) {
    return this.financeiroService.listDespesaTipos(requester, natureza);
  }

  @Post("despesa-tipos")
  @Roles(Role.admin, Role.gerente)
  createDespesaTipo(
    @Body() dto: CreateDespesaTipoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createDespesaTipo(dto, requester);
  }

  @Patch("despesa-tipos/:id")
  @Roles(Role.admin, Role.gerente)
  updateDespesaTipo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDespesaTipoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateDespesaTipo(id, dto, requester);
  }

  @Delete("despesa-tipos/:id")
  @Roles(Role.admin, Role.gerente)
  removeDespesaTipo(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeDespesaTipo(id, requester);
  }

  @Get("despesas")
  @Roles(Role.admin, Role.gerente)
  listDespesas(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("natureza") natureza?: FinanceiroDespesaNatureza,
  ) {
    return this.financeiroService.listDespesas(requester, natureza);
  }

  @Post("despesas")
  @Roles(Role.admin, Role.gerente)
  createDespesa(
    @Body() dto: CreateDespesaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createDespesa(dto, requester);
  }

  @Post("despesas/renovar-mes")
  @Roles(Role.admin, Role.gerente)
  renovarDespesasMes(
    @Body() dto: RenovarDespesasDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.renovarDespesasMes(dto, requester);
  }

  @Patch("despesas/:id")
  @Roles(Role.admin, Role.gerente)
  updateDespesa(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDespesaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateDespesa(id, dto, requester);
  }

  @Delete("despesas/:id")
  @Roles(Role.admin, Role.gerente)
  removeDespesa(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeDespesa(id, requester);
  }

  // ─── Centro de recebimentos (somente imobiliária) ────────────

  @Get("recebimento-tipos")
  @Roles(Role.admin, Role.gerente)
  listRecebimentoTipos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("natureza") natureza?: FinanceiroDespesaNatureza,
  ) {
    return this.financeiroService.listRecebimentoTipos(requester, natureza);
  }

  @Post("recebimento-tipos")
  @Roles(Role.admin, Role.gerente)
  createRecebimentoTipo(
    @Body() dto: CreateRecebimentoTipoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createRecebimentoTipo(dto, requester);
  }

  @Patch("recebimento-tipos/:id")
  @Roles(Role.admin, Role.gerente)
  updateRecebimentoTipo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecebimentoTipoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateRecebimentoTipo(id, dto, requester);
  }

  @Delete("recebimento-tipos/:id")
  @Roles(Role.admin, Role.gerente)
  removeRecebimentoTipo(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeRecebimentoTipo(id, requester);
  }

  @Get("recebimentos")
  @Roles(Role.admin, Role.gerente)
  listRecebimentos(
    @CurrentUser() requester: AuthenticatedUser,
    @Query("natureza") natureza?: FinanceiroDespesaNatureza,
  ) {
    return this.financeiroService.listRecebimentos(requester, natureza);
  }

  @Post("recebimentos")
  @Roles(Role.admin, Role.gerente)
  createRecebimento(
    @Body() dto: CreateRecebimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.createRecebimento(dto, requester);
  }

  @Post("recebimentos/renovar-mes")
  @Roles(Role.admin, Role.gerente)
  renovarRecebimentosMes(
    @Body() dto: RenovarRecebimentosDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.renovarRecebimentosMes(dto, requester);
  }

  @Patch("recebimentos/:id")
  @Roles(Role.admin, Role.gerente)
  updateRecebimento(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecebimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.updateRecebimento(id, dto, requester);
  }

  @Delete("recebimentos/:id")
  @Roles(Role.admin, Role.gerente)
  removeRecebimento(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.financeiroService.removeRecebimento(id, requester);
  }
}
