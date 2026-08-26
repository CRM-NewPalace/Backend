import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { DuplicateTenantDto } from './dto/duplicate-tenant.dto';

type Tx = Prisma.TransactionClient;

const CHUNK = 250;
const TX_TIMEOUT_MS = 120_000;

function assignIds(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of ids) map.set(id, randomUUID());
  return map;
}

function mapped(map: Map<string, string>, id: string): string {
  const next = map.get(id);
  if (!next) {
    throw new BadRequestException(
      `Falha ao duplicar: registro ${id} sem correspondente no clone.`,
    );
  }
  return next;
}

function mappedOpt(
  map: Map<string, string>,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return map.get(id) ?? null;
}

function remapOpaque(old: string | null | undefined, store: Map<string, string>) {
  if (!old) return null;
  const existing = store.get(old);
  if (existing) return existing;
  const next = randomUUID();
  store.set(old, next);
  return next;
}

function jsonValue(
  value: Prisma.JsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

async function insertMany(
  model: { createMany: (args: { data: never[] }) => Promise<unknown> },
  data: unknown[],
): Promise<void> {
  if (data.length === 0) return;
  for (let i = 0; i < data.length; i += CHUNK) {
    await model.createMany({
      data: data.slice(i, i + CHUNK) as never[],
    });
  }
}

export type DuplicateTenantCopied = {
  users: number;
  equipes: number;
  catalogItems: number;
  funis: number;
  localidades: number;
  construtoras: number;
  empreendimentos: number;
  leads: number;
  documentacoes: number;
  propostas: number;
  analises: number;
  agendamentos: number;
  metas: number;
  financeiro: number;
};

@Injectable()
export class TenantCloneService {
  constructor(private readonly prisma: PrismaService) {}

  async duplicate(sourceId: string, dto: DuplicateTenantDto = {}) {
    if (sourceId === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não pode ser duplicado.',
      );
    }

    const source = await this.prisma.tenant.findUnique({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    const name = (dto.name?.trim() || `${source.name} (cópia)`).slice(0, 120);
    const slug = await this.allocateSlug(
      dto.slug?.trim() || this.slugWithCopia(source.slug),
    );

    const snapshot = await this.loadSnapshot(sourceId);
    const newTenantId = randomUUID();

    await this.prisma.$transaction(
      async (tx) => {
        await tx.tenant.create({
          data: {
            id: newTenantId,
            name,
            slug,
            status: source.status,
            documento: source.documento,
            creci: source.creci,
            email: source.email,
            telefone: source.telefone,
            endereco: source.endereco,
            cidade: source.cidade,
            logoUrl: source.logoUrl,
            primaryColor: source.primaryColor,
            sidebarStyle: source.sidebarStyle,
            density: source.density,
            homePath: source.homePath,
            modules: jsonValue(source.modules) ?? Prisma.DbNull,
            plano: source.plano,
            maxUsuarios: source.maxUsuarios,
            usuariosExtras: source.usuariosExtras,
            iaBotEnabled: source.iaBotEnabled,
          },
        });

        await this.writeSnapshot(tx, newTenantId, snapshot);
      },
      { timeout: TX_TIMEOUT_MS, maxWait: 15_000 },
    );

    const copied: DuplicateTenantCopied = {
      users: snapshot.users.length,
      equipes: snapshot.equipes.length,
      catalogItems: snapshot.catalogItems.length,
      funis: snapshot.funis.length,
      localidades: snapshot.localidades.length,
      construtoras: snapshot.construtoras.length,
      empreendimentos: snapshot.empreendimentos.length,
      leads: snapshot.leads.length,
      documentacoes: snapshot.documentacoes.length,
      propostas: snapshot.propostas.length,
      analises: snapshot.analises.length,
      agendamentos: snapshot.agendamentos.length,
      metas: snapshot.metas.length,
      financeiro:
        snapshot.parceiros.length +
        snapshot.titulos.filter(
          (t) => !t.platformContratoId && !t.platformFornecedorContratoId,
        ).length +
        snapshot.comissoes.length,
    };

    return { id: newTenantId, name, slug, copied };
  }

  private slugWithCopia(slug: string): string {
    const suffix = slug.endsWith('-copia') ? '' : '-copia';
    return `${slug}${suffix}`.slice(0, 80);
  }

  private async allocateSlug(base: string): Promise<string> {
    const normalized = base.toLowerCase().trim().slice(0, 80);
    const taken = async (slug: string) =>
      Boolean(await this.prisma.tenant.findUnique({ where: { slug } }));

    if (!(await taken(normalized))) return normalized;

    for (let n = 2; n < 100; n++) {
      const extra = `-${n}`;
      const candidate = `${normalized.slice(0, 80 - extra.length)}${extra}`;
      if (!(await taken(candidate))) return candidate;
    }

    throw new ConflictException(
      'Não foi possível gerar um slug único para a cópia.',
    );
  }

  private async loadSnapshot(tenantId: string) {
    const [
      users,
      equipes,
      catalogItems,
      funis,
      localidades,
      construtoras,
      empreendimentos,
      leads,
      prazoAdiamentos,
      documentacoes,
      propostas,
      analises,
      agendamentos,
      notificacoes,
      metas,
      categorias,
      despesaTipos,
      recebimentoTipos,
      parceiros,
      despesas,
      recebimentos,
      comissoes,
      titulos,
      movimentos,
      treinamentoSecoes,
      treinamentoLinks,
    ] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId } }),
      this.prisma.equipe.findMany({ where: { tenantId } }),
      this.prisma.catalogItem.findMany({ where: { tenantId } }),
      this.prisma.funil.findMany({ where: { tenantId } }),
      this.prisma.localidade.findMany({ where: { tenantId } }),
      this.prisma.construtora.findMany({
        where: { tenantId },
        include: { localidades: { select: { id: true } } },
      }),
      this.prisma.empreendimento.findMany({ where: { tenantId } }),
      this.prisma.lead.findMany({ where: { tenantId } }),
      this.prisma.leadPrazoAdiamento.findMany({ where: { tenantId } }),
      this.prisma.documentacao.findMany({ where: { tenantId } }),
      this.prisma.proposta.findMany({ where: { tenantId } }),
      this.prisma.analise.findMany({ where: { tenantId } }),
      this.prisma.agendamento.findMany({ where: { tenantId } }),
      this.prisma.notificacao.findMany({ where: { tenantId } }),
      this.prisma.meta.findMany({ where: { tenantId } }),
      this.prisma.financeiroCategoria.findMany({ where: { tenantId } }),
      this.prisma.financeiroDespesaTipo.findMany({ where: { tenantId } }),
      this.prisma.financeiroRecebimentoTipo.findMany({ where: { tenantId } }),
      this.prisma.financeiroParceiro.findMany({ where: { tenantId } }),
      this.prisma.financeiroDespesa.findMany({ where: { tenantId } }),
      this.prisma.financeiroRecebimento.findMany({ where: { tenantId } }),
      this.prisma.financeiroComissao.findMany({ where: { tenantId } }),
      this.prisma.financeiroTitulo.findMany({ where: { tenantId } }),
      this.prisma.financeiroMovimento.findMany({ where: { tenantId } }),
      this.prisma.treinamentoSecao.findMany({ where: { tenantId } }),
      this.prisma.treinamentoLink.findMany({ where: { tenantId } }),
    ]);

    const funilIds = funis.map((row) => row.id);
    const leadIds = leads.map((row) => row.id);

    const [funilEtapas, triagemEvents] = await Promise.all([
      funilIds.length
        ? this.prisma.funilEtapa.findMany({
            where: { funilId: { in: funilIds } },
          })
        : Promise.resolve([]),
      leadIds.length
        ? this.prisma.triagemEvent.findMany({
            where: { leadId: { in: leadIds } },
          })
        : Promise.resolve([]),
    ]);

    return {
      users,
      equipes,
      catalogItems,
      funis,
      funilEtapas,
      localidades,
      construtoras,
      empreendimentos,
      leads,
      prazoAdiamentos,
      triagemEvents,
      documentacoes,
      propostas,
      analises,
      agendamentos,
      notificacoes,
      metas,
      categorias,
      despesaTipos,
      recebimentoTipos,
      parceiros,
      despesas,
      recebimentos,
      comissoes,
      titulos,
      movimentos,
      treinamentoSecoes,
      treinamentoLinks,
    };
  }

  private async writeSnapshot(
    tx: Tx,
    tenantId: string,
    snap: Awaited<ReturnType<TenantCloneService['loadSnapshot']>>,
  ) {
    const users = assignIds(snap.users.map((r) => r.id));
    const equipes = assignIds(snap.equipes.map((r) => r.id));
    const catalog = assignIds(snap.catalogItems.map((r) => r.id));
    const funis = assignIds(snap.funis.map((r) => r.id));
    const etapas = assignIds(snap.funilEtapas.map((r) => r.id));
    const localidades = assignIds(snap.localidades.map((r) => r.id));
    const construtoras = assignIds(snap.construtoras.map((r) => r.id));
    const empreendimentos = assignIds(snap.empreendimentos.map((r) => r.id));
    const leads = assignIds(snap.leads.map((r) => r.id));
    const prazos = assignIds(snap.prazoAdiamentos.map((r) => r.id));
    const triagens = assignIds(snap.triagemEvents.map((r) => r.id));
    const docs = assignIds(snap.documentacoes.map((r) => r.id));
    const propostas = assignIds(snap.propostas.map((r) => r.id));
    const analises = assignIds(snap.analises.map((r) => r.id));
    const agenda = assignIds(snap.agendamentos.map((r) => r.id));
    const notifs = assignIds(snap.notificacoes.map((r) => r.id));
    const metas = assignIds(snap.metas.map((r) => r.id));
    const categorias = assignIds(snap.categorias.map((r) => r.id));
    const despesaTipos = assignIds(snap.despesaTipos.map((r) => r.id));
    const recebimentoTipos = assignIds(snap.recebimentoTipos.map((r) => r.id));
    const parceiros = assignIds(snap.parceiros.map((r) => r.id));
    const despesas = assignIds(snap.despesas.map((r) => r.id));
    const recebimentos = assignIds(snap.recebimentos.map((r) => r.id));
    const comissoes = assignIds(snap.comissoes.map((r) => r.id));
    const titulosKeep = snap.titulos.filter(
      (t) => !t.platformContratoId && !t.platformFornecedorContratoId,
    );
    const titulos = assignIds(titulosKeep.map((r) => r.id));
    const movimentosKeep = snap.movimentos.filter((m) => {
      if (!m.tituloId) return true;
      return titulos.has(m.tituloId);
    });
    const movimentos = assignIds(movimentosKeep.map((r) => r.id));
    const secoes = assignIds(snap.treinamentoSecoes.map((r) => r.id));
    const links = assignIds(snap.treinamentoLinks.map((r) => r.id));
    const seriesIds = new Map<string, string>();
    const gruposParcelas = new Map<string, string>();

    // IDs novos: usuários da cópia não compartilham linha com o tenant de origem.
    await insertMany(tx.user, snap.users.map((u) => ({
      id: mapped(users, u.id),
      tenantId,
      name: u.name,
      email: u.email,
      password: u.password,
      phone: u.phone,
      whatsapp: u.whatsapp,
      dataNascimento: u.dataNascimento,
      cargo: u.cargo,
      creci: u.creci,
      creciStatus: u.creciStatus,
      cor: u.cor,
      corAside: u.corAside,
      corPrincipal: u.corPrincipal,
      corModulo: u.corModulo,
      role: u.role,
      status: u.status,
      avatar: u.avatar,
      lastLoginAt: u.lastLoginAt,
      hashedRefreshToken: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      equipeId: null,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })));

    await insertMany(tx.equipe, snap.equipes.map((e) => ({
      id: mapped(equipes, e.id),
      tenantId,
      name: e.name,
      status: e.status,
      gerenteId: mapped(users, e.gerenteId),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    })));

    for (const u of snap.users) {
      const equipeId = mappedOpt(equipes, u.equipeId);
      if (!equipeId) continue;
      await tx.user.update({
        where: { id: mapped(users, u.id) },
        data: { equipeId },
      });
    }

    await insertMany(
      tx.catalogItem,
      snap.catalogItems.map((c) => ({
        id: mapped(catalog, c.id),
        tenantId,
        type: c.type,
        label: c.label,
        slug: c.slug,
        color: c.color,
        sortOrder: c.sortOrder,
        active: c.active,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    );

    await insertMany(tx.funil, snap.funis.map((f) => ({
      id: mapped(funis, f.id),
      tenantId,
      name: f.name,
      tipo: f.tipo,
      ativo: f.ativo,
      inatividadeValor: f.inatividadeValor,
      inatividadeUnidade: f.inatividadeUnidade,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })));

    await insertMany(
      tx.funilEtapa,
      snap.funilEtapas.map((e) => ({
        id: mapped(etapas, e.id),
        funilId: mapped(funis, e.funilId),
        label: e.label,
        slug: e.slug,
        color: e.color,
        sortOrder: e.sortOrder,
        active: e.active,
        papel: e.papel,
        prazoValor: e.prazoValor,
        prazoUnidade: e.prazoUnidade,
        alertaAntecedenciaPercent: e.alertaAntecedenciaPercent,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    );

    await insertMany(
      tx.localidade,
      snap.localidades.map((l) => ({
        id: mapped(localidades, l.id),
        tenantId,
        nome: l.nome,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    );

    await insertMany(
      tx.construtora,
      snap.construtoras.map((c) => ({
        id: mapped(construtoras, c.id),
        tenantId,
        nome: c.nome,
        cor: c.cor,
        contato: c.contato,
        endereco: c.endereco,
        viabilizadorNome: c.viabilizadorNome,
        viabilizadorContato: c.viabilizadorContato,
        cca: c.cca,
        driveFolderUrl: c.driveFolderUrl,
        logoUrl: c.logoUrl,
        logoPublicId: c.logoPublicId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    );

    for (const c of snap.construtoras) {
      const locIds = c.localidades
        .map((l) => mappedOpt(localidades, l.id))
        .filter((id): id is string => Boolean(id));
      if (locIds.length === 0) continue;
      await tx.construtora.update({
        where: { id: mapped(construtoras, c.id) },
        data: { localidades: { connect: locIds.map((id) => ({ id })) } },
      });
    }

    await insertMany(
      tx.empreendimento,
      snap.empreendimentos.map((e) => ({
        id: mapped(empreendimentos, e.id),
        tenantId,
        nome: e.nome,
        cor: e.cor,
        construtoraId: mappedOpt(construtoras, e.construtoraId),
        localidadeId: mappedOpt(localidades, e.localidadeId),
        cidade: e.cidade,
        endereco: e.endereco,
        tipo: e.tipo,
        status: e.status,
        previsaoEntrega: e.previsaoEntrega,
        tags: e.tags,
        observacao: e.observacao,
        quartos: e.quartos,
        banheiros: e.banheiros,
        areaM2: e.areaM2,
        externalUrl: e.externalUrl,
        imagemUrl: e.imagemUrl,
        imagens: jsonValue(e.imagens) ?? [],
        externalKey: e.externalKey,
        ativo: e.ativo,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    );

    await insertMany(tx.lead, snap.leads.map((l) => ({
      id: mapped(leads, l.id),
      tenantId,
      tipo: l.tipo,
      nome: l.nome,
      telefone: l.telefone,
      email: l.email,
      origem: l.origem,
      interesse: l.interesse,
      cidade: l.cidade,
      bairro: l.bairro,
      stage: l.stage,
      prioridade: l.prioridade,
      renda: l.renda,
      tipoRenda: l.tipoRenda,
      estadoCivil: l.estadoCivil,
      tags: l.tags,
      corretorId: mappedOpt(users, l.corretorId),
      equipeId: mappedOpt(equipes, l.equipeId),
      construtoraId: mappedOpt(construtoras, l.construtoraId),
      empreendimentoId: mappedOpt(empreendimentos, l.empreendimentoId),
      perdidoAt: l.perdidoAt,
      motivoPerda: l.motivoPerda,
      perdidoPorId: mappedOpt(users, l.perdidoPorId),
      stageEnteredAt: l.stageEnteredAt,
      lastMovementAt: l.lastMovementAt,
      lastStageChangeAt: l.lastStageChangeAt,
      lastTriagemAt: l.lastTriagemAt,
      lastTarefaAt: l.lastTarefaAt,
      lastAtividadeAt: l.lastAtividadeAt,
      prazoDueAt: l.prazoDueAt,
      alertaProximoAt: l.alertaProximoAt,
      prazoAdiado: l.prazoAdiado,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })));

    await insertMany(
      tx.leadPrazoAdiamento,
      snap.prazoAdiamentos.map((p) => ({
        id: mapped(prazos, p.id),
        tenantId,
        leadId: mapped(leads, p.leadId),
        autorId: mapped(users, p.autorId),
        prazoAnteriorAt: p.prazoAnteriorAt,
        prazoNovoAt: p.prazoNovoAt,
        prazoAnteriorValor: p.prazoAnteriorValor,
        prazoAnteriorUnidade: p.prazoAnteriorUnidade,
        prazoNovoValor: p.prazoNovoValor,
        prazoNovoUnidade: p.prazoNovoUnidade,
        motivo: p.motivo,
        createdAt: p.createdAt,
      })),
    );

    await insertMany(
      tx.triagemEvent,
      snap.triagemEvents.map((t) => ({
        id: mapped(triagens, t.id),
        leadId: mapped(leads, t.leadId),
        autorId: mapped(users, t.autorId),
        texto: t.texto,
        textoAnterior: t.textoAnterior,
        stageAnterior: t.stageAnterior,
        stageNovo: t.stageNovo,
        origem: t.origem,
        createdAt: t.createdAt,
        editedAt: t.editedAt,
      })),
    );

    await insertMany(
      tx.documentacao,
      snap.documentacoes.map((d) => ({
        id: mapped(docs, d.id),
        tenantId,
        leadId: mapped(leads, d.leadId),
        autorId: mapped(users, d.autorId),
        tipoContato: d.tipoContato,
        stageSituacao: d.stageSituacao,
        nome: d.nome,
        construtoraId: mappedOpt(construtoras, d.construtoraId),
        empreendimentoId: mappedOpt(empreendimentos, d.empreendimentoId),
        fonte: d.fonte,
        status1: d.status1,
        status2: d.status2,
        corretorId: mappedOpt(users, d.corretorId),
        gerenteId: mappedOpt(users, d.gerenteId),
        dataAnalise: d.dataAnalise,
        dataVenda: d.dataVenda,
        vgv: d.vgv,
        obs: d.obs,
        temEntrada: d.temEntrada,
        valorEntrada: d.valorEntrada,
        temFgts: d.temFgts,
        valorFgts: d.valorFgts,
        temDependente: d.temDependente,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    );

    await insertMany(
      tx.proposta,
      snap.propostas.map((p) => ({
        id: mapped(propostas, p.id),
        tenantId,
        codigo: p.codigo,
        leadId: mappedOpt(leads, p.leadId),
        clienteNome: p.clienteNome,
        clienteTelefone: p.clienteTelefone,
        clienteCpf: p.clienteCpf,
        clienteRg: p.clienteRg,
        clienteRgOrgaoEmissor: p.clienteRgOrgaoEmissor,
        clienteDataNascimento: p.clienteDataNascimento,
        clienteNacionalidade: p.clienteNacionalidade,
        clienteEstadoCivil: p.clienteEstadoCivil,
        clienteRegimeBens: p.clienteRegimeBens,
        clienteDataCasamento: p.clienteDataCasamento,
        clienteNomePai: p.clienteNomePai,
        clienteNomeMae: p.clienteNomeMae,
        clienteRenda: p.clienteRenda,
        clienteTelefoneFixo: p.clienteTelefoneFixo,
        clienteEmail: p.clienteEmail,
        clienteEnderecoResidencial: p.clienteEnderecoResidencial,
        clienteBairroResidencial: p.clienteBairroResidencial,
        clienteCidadeResidencial: p.clienteCidadeResidencial,
        clienteUfResidencial: p.clienteUfResidencial,
        clienteCepResidencial: p.clienteCepResidencial,
        clienteCobrancaResidencial: p.clienteCobrancaResidencial,
        clienteEmpregador: p.clienteEmpregador,
        clienteProfissao: p.clienteProfissao,
        clienteEnderecoComercial: p.clienteEnderecoComercial,
        clienteBairroComercial: p.clienteBairroComercial,
        clienteCidadeComercial: p.clienteCidadeComercial,
        clienteUfComercial: p.clienteUfComercial,
        clienteCepComercial: p.clienteCepComercial,
        clienteCobrancaComercial: p.clienteCobrancaComercial,
        clienteSite: p.clienteSite,
        clienteTelefoneComercial1: p.clienteTelefoneComercial1,
        clienteTelefoneComercial2: p.clienteTelefoneComercial2,
        construtoraId: mappedOpt(construtoras, p.construtoraId),
        empreendimentoId: mappedOpt(empreendimentos, p.empreendimentoId),
        unidade: p.unidade,
        corretorId: mappedOpt(users, p.corretorId),
        autorId: mapped(users, p.autorId),
        valor: p.valor,
        entrada: p.entrada,
        apartado: p.apartado,
        preChaves: p.preChaves,
        posChaves: p.posChaves,
        intercaladas: p.intercaladas,
        fgts: p.fgts,
        moraBem: p.moraBem,
        mcmv: p.mcmv,
        parcelaCaixa: p.parcelaCaixa,
        financiamento: p.financiamento,
        desconto: p.desconto,
        status: p.status,
        validade: p.validade,
        enviadaEm: p.enviadaEm,
        observacao: p.observacao,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    );

    await insertMany(
      tx.analise,
      snap.analises.map((a) => ({
        id: mapped(analises, a.id),
        tenantId,
        leadId: mapped(leads, a.leadId),
        autorId: mapped(users, a.autorId),
        analistaId: mappedOpt(users, a.analistaId),
        tipoContato: a.tipoContato,
        stageSituacao: a.stageSituacao,
        nome: a.nome,
        telefone: a.telefone,
        email: a.email,
        origem: a.origem,
        interesse: a.interesse,
        cidade: a.cidade,
        bairro: a.bairro,
        prioridade: a.prioridade,
        renda: a.renda,
        tags: a.tags,
        temFgts: a.temFgts,
        valorFgts: a.valorFgts,
        temEntrada: a.temEntrada,
        valorEntrada: a.valorEntrada,
        temDependente: a.temDependente,
        status: a.status,
        parecer: a.parecer,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    );

    await insertMany(
      tx.agendamento,
      snap.agendamentos.map((a) => ({
        id: mapped(agenda, a.id),
        tenantId,
        leadId: mappedOpt(leads, a.leadId),
        autorId: mapped(users, a.autorId),
        atribuidoParaId: mappedOpt(users, a.atribuidoParaId),
        titulo: a.titulo,
        tipo: a.tipo,
        status: a.status,
        escopo: a.escopo,
        solicitacaoStatus: a.solicitacaoStatus,
        alvoTipo: a.alvoTipo,
        alvoEquipeId: mappedOpt(equipes, a.alvoEquipeId),
        alvoGerenteId: mappedOpt(users, a.alvoGerenteId),
        seriesId: remapOpaque(a.seriesId, seriesIds),
        recurrenceFreq: a.recurrenceFreq,
        recurrenceDays: a.recurrenceDays,
        recurrenceUntil: a.recurrenceUntil,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        local: a.local,
        observacoes: a.observacoes,
        funilStage: a.funilStage,
        aprovadoPorId: mappedOpt(users, a.aprovadoPorId),
        aprovadoAt: a.aprovadoAt,
        motivoRecusa: a.motivoRecusa,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    );

    await insertMany(
      tx.notificacao,
      snap.notificacoes.map((n) => ({
        id: mapped(notifs, n.id),
        tenantId,
        userId: mapped(users, n.userId),
        tipo: n.tipo,
        titulo: n.titulo,
        corpo: n.corpo,
        lida: n.lida,
        leadId: mappedOpt(leads, n.leadId),
        analiseId: mappedOpt(analises, n.analiseId),
        agendamentoId: mappedOpt(agenda, n.agendamentoId),
        eventoChave: n.eventoChave,
        createdAt: n.createdAt,
      })),
    );

    await insertMany(tx.meta, snap.metas.map((m) => ({
      id: mapped(metas, m.id),
      tenantId,
      escopo: m.escopo,
      corretorId: mappedOpt(users, m.corretorId),
      gerenteId: mappedOpt(users, m.gerenteId),
      criadorId: mapped(users, m.criadorId),
      origem: m.origem,
      tipo: m.tipo,
      periodo: m.periodo,
      valor: m.valor,
      inicio: m.inicio,
      fim: m.fim,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })));

    await insertMany(
      tx.financeiroCategoria,
      snap.categorias.map((c) => ({
        id: mapped(categorias, c.id),
        tenantId,
        nome: c.nome,
        tipo: c.tipo,
        ativo: c.ativo,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    );

    await insertMany(
      tx.financeiroDespesaTipo,
      snap.despesaTipos.map((t) => ({
        id: mapped(despesaTipos, t.id),
        tenantId,
        nome: t.nome,
        natureza: t.natureza,
        orcadoMensal: t.orcadoMensal,
        ativo: t.ativo,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    );

    await insertMany(
      tx.financeiroRecebimentoTipo,
      snap.recebimentoTipos.map((t) => ({
        id: mapped(recebimentoTipos, t.id),
        tenantId,
        nome: t.nome,
        natureza: t.natureza,
        orcadoMensal: t.orcadoMensal,
        ativo: t.ativo,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    );

    await insertMany(
      tx.financeiroParceiro,
      snap.parceiros.map((p) => ({
        id: mapped(parceiros, p.id),
        tenantId,
        nome: p.nome,
        documento: p.documento,
        tipo: p.tipo,
        email: p.email,
        telefone: p.telefone,
        cidade: p.cidade,
        imobiliaria: p.imobiliaria,
        saldoAberto: p.saldoAberto,
        ativo: p.ativo,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    );

    await insertMany(
      tx.financeiroDespesa,
      snap.despesas.map((d) => ({
        id: mapped(despesas, d.id),
        tenantId,
        tipoId: mapped(despesaTipos, d.tipoId),
        descricao: d.descricao,
        valor: d.valor,
        data: d.data,
        competencia: d.competencia,
        recorrente: d.recorrente,
        origemId: null,
        observacao: d.observacao,
        ativo: d.ativo,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    );
    for (const d of snap.despesas) {
      const origemId = mappedOpt(despesas, d.origemId);
      if (!origemId) continue;
      await tx.financeiroDespesa.update({
        where: { id: mapped(despesas, d.id) },
        data: { origemId },
      });
    }

    await insertMany(
      tx.financeiroRecebimento,
      snap.recebimentos.map((r) => ({
        id: mapped(recebimentos, r.id),
        tenantId,
        tipoId: mapped(recebimentoTipos, r.tipoId),
        descricao: r.descricao,
        valor: r.valor,
        data: r.data,
        competencia: r.competencia,
        recorrente: r.recorrente,
        origemId: null,
        observacao: r.observacao,
        ativo: r.ativo,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
    for (const r of snap.recebimentos) {
      const origemId = mappedOpt(recebimentos, r.origemId);
      if (!origemId) continue;
      await tx.financeiroRecebimento.update({
        where: { id: mapped(recebimentos, r.id) },
        data: { origemId },
      });
    }

    await insertMany(
      tx.financeiroComissao,
      snap.comissoes.map((c) => ({
        id: mapped(comissoes, c.id),
        tenantId,
        documentacaoId: mapped(docs, c.documentacaoId),
        corretorId: mapped(users, c.corretorId),
        gerenteId: mappedOpt(users, c.gerenteId),
        equipeId: mappedOpt(equipes, c.equipeId),
        corretor: c.corretor,
        gerente: c.gerente,
        equipe: c.equipe,
        empreendimento: c.empreendimento,
        cliente: c.cliente,
        dataVenda: c.dataVenda,
        dataPrevistaRecebimento: c.dataPrevistaRecebimento,
        vgv: c.vgv,
        percentualImobiliaria: c.percentualImobiliaria,
        comissaoBruta: c.comissaoBruta,
        percentualTributos: c.percentualTributos,
        valorTributos: c.valorTributos,
        comissaoLiquida: c.comissaoLiquida,
        percentualCorretor: c.percentualCorretor,
        valorCorretor: c.valorCorretor,
        percentualGerente: c.percentualGerente,
        valorGerente: c.valorGerente,
        percentualCaixa: c.percentualCaixa,
        valorCaixa: c.valorCaixa,
        percentualSocios: c.percentualSocios,
        valorSocios: c.valorSocios,
        valorPremiacao: c.valorPremiacao,
        percentualPremiacaoCorretor: c.percentualPremiacaoCorretor,
        valorPremiacaoCorretor: c.valorPremiacaoCorretor,
        percentualPremiacaoImposto: c.percentualPremiacaoImposto,
        valorPremiacaoImposto: c.valorPremiacaoImposto,
        percentualPremiacaoImobiliaria: c.percentualPremiacaoImobiliaria,
        valorPremiacaoImobiliaria: c.valorPremiacaoImobiliaria,
        percentualPremiacaoGerente: c.percentualPremiacaoGerente,
        valorPremiacaoGerente: c.valorPremiacaoGerente,
        valorPremiacaoRestante: c.valorPremiacaoRestante,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    );

    await insertMany(
      tx.financeiroTitulo,
      titulosKeep.map((t) => ({
        id: mapped(titulos, t.id),
        tenantId,
        tipo: t.tipo,
        descricao: t.descricao,
        parceiroId: mappedOpt(parceiros, t.parceiroId),
        parceiroNome: t.parceiroNome,
        categoria: t.categoria,
        centro: t.centro,
        vencimento: t.vencimento,
        dataPagamento: t.dataPagamento,
        valor: t.valor,
        status: t.status,
        parcela: t.parcela,
        grupoParcelasId: remapOpaque(t.grupoParcelasId, gruposParcelas),
        recorrenciaIndeterminada: t.recorrenciaIndeterminada,
        platformContratoId: null,
        platformFornecedorContratoId: null,
        comissaoId: mappedOpt(comissoes, t.comissaoId),
        comissaoPapel: t.comissaoPapel,
        natureza: t.natureza,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    );

    await insertMany(
      tx.financeiroMovimento,
      movimentosKeep.map((m) => ({
        id: mapped(movimentos, m.id),
        tenantId,
        data: m.data,
        descricao: m.descricao,
        parceiroId: mappedOpt(parceiros, m.parceiroId),
        parceiroNome: m.parceiroNome,
        categoria: m.categoria,
        centro: m.centro,
        tipo: m.tipo,
        valor: m.valor,
        status: m.status,
        formaPagamento: m.formaPagamento,
        tituloId: mappedOpt(titulos, m.tituloId),
        natureza: m.natureza,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    );

    await insertMany(
      tx.treinamentoSecao,
      snap.treinamentoSecoes.map((s) => ({
        id: mapped(secoes, s.id),
        tenantId,
        parentId: null,
        titulo: s.titulo,
        sortOrder: s.sortOrder,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    );
    for (const s of snap.treinamentoSecoes) {
      const parentId = mappedOpt(secoes, s.parentId);
      if (!parentId) continue;
      await tx.treinamentoSecao.update({
        where: { id: mapped(secoes, s.id) },
        data: { parentId },
      });
    }

    await insertMany(
      tx.treinamentoLink,
      snap.treinamentoLinks.map((l) => ({
        id: mapped(links, l.id),
        tenantId,
        secaoId: mapped(secoes, l.secaoId),
        titulo: l.titulo,
        url: l.url,
        sortOrder: l.sortOrder,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    );
  }
}
