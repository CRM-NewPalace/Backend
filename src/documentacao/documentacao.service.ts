import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateDocumentacaoDto } from './dto/create-documentacao.dto';
import { UpdateDocumentacaoDto } from './dto/update-documentacao.dto';
import { QueryDocumentacaoDto } from './dto/query-documentacao.dto';

const docSelect = {
  id: true,
  leadId: true,
  tipoContato: true,
  stageSituacao: true,
  nome: true,
  telefone: true,
  email: true,
  origem: true,
  interesse: true,
  cidade: true,
  bairro: true,
  prioridade: true,
  renda: true,
  tags: true,
  temFgts: true,
  valorFgts: true,
  temEntrada: true,
  valorEntrada: true,
  temDependente: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      stage: true,
      corretorId: true,
      corretor: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class DocumentacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryDocumentacaoDto, requester: AuthenticatedUser) {
    const leadFilter: Prisma.LeadWhereInput = { perdidoAt: null };

    if (requester.role === Role.corretor) {
      leadFilter.corretorId = requester.id;
    } else if (query.corretorId) {
      leadFilter.corretorId = query.corretorId;
    }

    return this.prisma.documentacao.findMany({
      where: { lead: leadFilter },
      select: docSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const doc = await this.prisma.documentacao.findUnique({
      where: { id },
      select: docSelect,
    });
    if (!doc) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.ensureLeadAccessible(doc.leadId, requester);
    return doc;
  }

  async create(dto: CreateDocumentacaoDto, requester: AuthenticatedUser) {
    this.assertMoneyRules(dto);

    const lead = await this.ensureLeadAccessible(dto.leadId, requester);

    return this.prisma.documentacao.create({
      data: {
        leadId: lead.id,
        autorId: requester.id,
        tipoContato: lead.tipo,
        stageSituacao: lead.stage,
        nome: dto.nome.trim(),
        telefone: dto.telefone.trim(),
        email: dto.email.trim().toLowerCase(),
        origem: dto.origem.trim(),
        interesse: dto.interesse,
        cidade: dto.cidade.trim(),
        bairro: dto.bairro.trim(),
        prioridade: dto.prioridade,
        renda: dto.renda ?? null,
        tags: dto.tags ?? [],
        temFgts: dto.temFgts,
        valorFgts: dto.temFgts ? (dto.valorFgts ?? null) : null,
        temEntrada: dto.temEntrada,
        valorEntrada: dto.temEntrada ? (dto.valorEntrada ?? null) : null,
        temDependente: dto.temDependente,
      },
      select: docSelect,
    });
  }

  async update(
    id: string,
    dto: UpdateDocumentacaoDto,
    requester: AuthenticatedUser,
  ) {
    const existing = await this.prisma.documentacao.findUnique({
      where: { id },
      select: {
        id: true,
        leadId: true,
        temFgts: true,
        valorFgts: true,
        temEntrada: true,
        valorEntrada: true,
        temDependente: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.ensureLeadAccessible(existing.leadId, requester);

    const merged = {
      temFgts: dto.temFgts ?? existing.temFgts,
      valorFgts:
        dto.valorFgts !== undefined ? dto.valorFgts : existing.valorFgts,
      temEntrada: dto.temEntrada ?? existing.temEntrada,
      valorEntrada:
        dto.valorEntrada !== undefined
          ? dto.valorEntrada
          : existing.valorEntrada,
      temDependente: dto.temDependente ?? existing.temDependente,
    };
    this.assertMoneyRules(merged);

    const data: Prisma.DocumentacaoUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.telefone !== undefined) data.telefone = dto.telefone.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.origem !== undefined) data.origem = dto.origem.trim();
    if (dto.interesse !== undefined) data.interesse = dto.interesse;
    if (dto.cidade !== undefined) data.cidade = dto.cidade.trim();
    if (dto.bairro !== undefined) data.bairro = dto.bairro.trim();
    if (dto.prioridade !== undefined) data.prioridade = dto.prioridade;
    if (dto.renda !== undefined) data.renda = dto.renda;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.temFgts !== undefined) data.temFgts = dto.temFgts;
    if (dto.temEntrada !== undefined) data.temEntrada = dto.temEntrada;
    if (dto.temDependente !== undefined) data.temDependente = dto.temDependente;

    const temFgts = merged.temFgts;
    const temEntrada = merged.temEntrada;
    data.valorFgts = temFgts ? (merged.valorFgts ?? null) : null;
    data.valorEntrada = temEntrada ? (merged.valorEntrada ?? null) : null;

    return this.prisma.documentacao.update({
      where: { id },
      data,
      select: docSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const existing = await this.prisma.documentacao.findUnique({
      where: { id },
      select: { id: true, leadId: true, autorId: true },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.ensureLeadAccessible(existing.leadId, requester);

    // Corretor só exclui o que criou; gestor exclui qualquer da equipe.
    if (
      requester.role === Role.corretor &&
      existing.autorId !== requester.id
    ) {
      throw new ForbiddenException(
        'Você só pode excluir documentações que criou.',
      );
    }

    await this.prisma.documentacao.delete({ where: { id } });
    return { ok: true };
  }

  private assertMoneyRules(dto: {
    temFgts: boolean;
    valorFgts?: number | null;
    temEntrada: boolean;
    valorEntrada?: number | null;
  }) {
    if (dto.temFgts && (dto.valorFgts == null || Number.isNaN(dto.valorFgts))) {
      throw new BadRequestException(
        'Informe o valor do FGTS quando a resposta for sim.',
      );
    }
    if (
      dto.temEntrada &&
      (dto.valorEntrada == null || Number.isNaN(dto.valorEntrada))
    ) {
      throw new BadRequestException(
        'Informe o valor da entrada quando a resposta for sim.',
      );
    }
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
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    if (
      requester.role === Role.corretor &&
      lead.corretorId !== requester.id
    ) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    return lead;
  }
}
