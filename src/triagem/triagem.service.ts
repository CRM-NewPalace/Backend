import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, FunilEtapaPapel, Role, TriagemOrigem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AnaliseService } from '../analise/analise.service';
import { FunisService } from '../funis/funis.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { CreateTriagemDto } from './dto/create-triagem.dto';
import { QueryTriagemLeadsDto } from './dto/query-triagem-leads.dto';

const leadListSelect = {
  id: true,
  tipo: true,
  nome: true,
  telefone: true,
  email: true,
  stage: true,
  prioridade: true,
  interesse: true,
  cidade: true,
  bairro: true,
  corretorId: true,
  corretor: { select: { id: true, name: true } },
  updatedAt: true,
} as const;

const eventSelect = {
  id: true,
  leadId: true,
  texto: true,
  stageAnterior: true,
  stageNovo: true,
  origem: true,
  createdAt: true,
  autor: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TriagemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly teamScope: TeamScopeService,
    private readonly analiseService: AnaliseService,
    private readonly funis: FunisService,
  ) {}

  /**
   * Lista contatos para a tela de triagem.
   * Corretor: próprios leads + clientes.
   * Admin/gerente: só leads (`tipo=lead`) do `corretorId` obrigatório (dentro da equipe).
   */
  async listLeads(query: QueryTriagemLeadsDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    if (requester.role === Role.corretor) {
      const contacts = await this.prisma.lead.findMany({
        where: {
          tenantId,
          corretorId: requester.id,
          perdidoAt: null,
        },
        select: leadListSelect,
        orderBy: { updatedAt: 'desc' },
      });

      return {
        leads: contacts.filter((c) => c.tipo === ContatoTipo.lead),
        clientes: contacts.filter((c) => c.tipo === ContatoTipo.cliente),
      };
    }

    if (!query.corretorId) {
      throw new BadRequestException(
        'Informe o corretor para listar os leads da triagem.',
      );
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      query.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead não encontrado.');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        corretorId: query.corretorId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
      },
      select: leadListSelect,
      orderBy: { updatedAt: 'desc' },
    });

    return { leads, clientes: [] as typeof leads };
  }

  /** Histórico de relatos de um lead (RBAC por dono). */
  async listByLead(leadId: string, requester: AuthenticatedUser) {
    const lead = await this.ensureLeadAccessible(leadId, requester);

    const events = await this.prisma.triagemEvent.findMany({
      where: { leadId },
      select: eventSelect,
      orderBy: { createdAt: 'desc' },
    });

    return {
      lead: {
        id: lead.id,
        tipo: lead.tipo,
        nome: lead.nome,
        stage: lead.stage,
        corretorId: lead.corretorId,
        corretor: lead.corretor,
      },
      events,
    };
  }

  /**
   * Corretor e gerente criam relatos; opcionalmente avançam a etapa do lead.
   * Corretor: só da própria carteira. Gerente: leads da equipe.
   */
  async create(dto: CreateTriagemDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    if (
      requester.role !== Role.corretor &&
      requester.role !== Role.gerente
    ) {
      throw new ForbiddenException(
        'Apenas corretores e gerentes podem registrar relatos na triagem.',
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, tenantId },
      select: {
        id: true,
        tipo: true,
        corretorId: true,
        equipeId: true,
        perdidoAt: true,
        stage: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }

    if (requester.role === Role.corretor) {
      if (lead.corretorId !== requester.id) {
        throw new NotFoundException('Lead não encontrado.');
      }
    } else {
      // Gerente: só leads (não clientes) no escopo da equipe.
      if (lead.tipo === ContatoTipo.cliente) {
        throw new NotFoundException('Lead não encontrado.');
      }
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        lead.corretorId,
        lead.equipeId,
      );
      if (!allowed) {
        throw new NotFoundException('Lead não encontrado.');
      }
    }

    const texto = dto.texto.trim();
    if (!texto) {
      throw new BadRequestException('Informe o relato.');
    }

    let stageAnterior: string | null = null;
    let stageNovo: string | null = null;
    let shouldUpdateStage = false;
    const targetStage = dto.stage?.trim();
    const origem =
      dto.origem === 'funil' ? TriagemOrigem.funil : TriagemOrigem.manual;

    if (targetStage) {
      await this.ensureStageIsValid(tenantId, targetStage);
      if (targetStage !== lead.stage) {
        stageAnterior = lead.stage;
        stageNovo = targetStage;
        shouldUpdateStage = true;
      } else if (origem === TriagemOrigem.funil) {
        // Funil já avançou a etapa; o relato consolida o único acontecimento.
        stageNovo = targetStage;
        const from = dto.stageAnterior?.trim();
        if (from && from !== targetStage) {
          stageAnterior = from;
        }
      }
    }

    const event = await this.prisma.$transaction(async (tx) => {
      if (shouldUpdateStage && targetStage) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { stage: targetStage },
        });
      }

      return tx.triagemEvent.create({
        data: {
          leadId: lead.id,
          autorId: requester.id,
          texto,
          stageAnterior,
          stageNovo,
          origem,
        },
        select: eventSelect,
      });
    });

    if (targetStage) {
      const papel = await this.funis.getPapelBySlug(tenantId, targetStage);
      if (papel === FunilEtapaPapel.analise) {
        await this.analiseService.ensureForLead(
          lead.id,
          requester.id,
          tenantId,
        );
      }
    }

    return event;
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        tipo: true,
        nome: true,
        stage: true,
        corretorId: true,
        perdidoAt: true,
        corretor: { select: { id: true, name: true } },
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }

    // Gerente/admin não consultam clientes na triagem.
    if (
      requester.role !== Role.corretor &&
      lead.tipo === ContatoTipo.cliente
    ) {
      throw new NotFoundException('Lead não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead não encontrado.');
    }

    return lead;
  }

  private async ensureStageIsValid(
    tenantId: string,
    stage: string,
  ): Promise<void> {
    const validStages = await this.catalog.getActiveStageSlugs(tenantId);
    if (validStages.length === 0) {
      throw new BadRequestException(
        'Nenhuma etapa do funil cadastrada. Configure as etapas em Configurações.',
      );
    }
    if (!validStages.includes(stage)) {
      throw new BadRequestException('Etapa do funil inválida.');
    }
  }
}
