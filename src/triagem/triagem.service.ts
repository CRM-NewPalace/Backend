import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, Role, TriagemOrigem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AnaliseService } from '../analise/analise.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
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
  ) {}

  /**
   * Lista contatos para a tela de triagem.
   * Corretor: próprios leads + clientes.
   * Admin/gerente: só leads (`tipo=lead`) do `corretorId` obrigatório (dentro da equipe).
   */
  async listLeads(query: QueryTriagemLeadsDto, requester: AuthenticatedUser) {
    if (requester.role === Role.corretor) {
      const contacts = await this.prisma.lead.findMany({
        where: {
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

  /** Só corretor cria relatos; opcionalmente avança a etapa do lead. */
  async create(dto: CreateTriagemDto, requester: AuthenticatedUser) {
    if (requester.role !== Role.corretor) {
      throw new ForbiddenException(
        'Apenas corretores podem registrar relatos na triagem.',
      );
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
      select: {
        id: true,
        corretorId: true,
        perdidoAt: true,
        stage: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }
    if (lead.corretorId !== requester.id) {
      throw new NotFoundException('Lead não encontrado.');
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
      await this.ensureStageIsValid(targetStage);
      if (targetStage !== lead.stage) {
        stageAnterior = lead.stage;
        stageNovo = targetStage;
        shouldUpdateStage = true;
      } else if (origem === TriagemOrigem.funil) {
        // Funil já avançou a etapa; registra só a etapa atual no histórico.
        stageNovo = targetStage;
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

    if (targetStage === 'em-analise') {
      await this.analiseService.ensureForLead(lead.id, requester.id);
    }

    return event;
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
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

  private async ensureStageIsValid(stage: string): Promise<void> {
    const validStages = await this.catalog.getActiveStageSlugs();
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
