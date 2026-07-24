import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { leadSelect, LeadEntity } from './lead-select';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';

export interface PaginatedLeads {
  data: LeadEntity[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    // Corretor só cria leads para si; admin/gerente podem atribuir a qualquer um.
    const corretorId = this.isCorretor(requester)
      ? requester.id
      : (dto.corretorId ?? requester.id);

    await this.ensureCorretorExists(corretorId);

    return this.prisma.lead.create({
      data: {
        nome: dto.nome.trim(),
        telefone: dto.telefone.trim(),
        email: dto.email.toLowerCase().trim(),
        origem: dto.origem.trim(),
        interesse: dto.interesse,
        faixa: dto.faixa.trim(),
        cidade: dto.cidade.trim(),
        bairro: dto.bairro.trim(),
        stage: dto.stage ?? 'novo',
        prioridade: dto.prioridade ?? 'Média',
        valor: dto.valor ?? 0,
        tags: dto.tags ?? [],
        corretorId,
      },
      select: leadSelect,
    });
  }

  async findAll(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.LeadWhereInput = {
      ...this.scopeByRole(requester),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.interesse ? { interesse: query.interesse } : {}),
      ...(query.prioridade ? { prioridade: query.prioridade } : {}),
      // O filtro por corretor só vale para admin/gerente; o corretor já está
      // restrito aos próprios leads por scopeByRole.
      ...(query.corretorId && !this.isCorretor(requester)
        ? { corretorId: query.corretorId }
        : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { telefone: { contains: query.search, mode: 'insensitive' } },
              { bairro: { contains: query.search, mode: 'insensitive' } },
              { cidade: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: leadSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }
    this.ensureCanAccess(lead, requester);
    return lead;
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    await this.ensureExistsAndAccessible(id, requester);

    // Corretor não pode reatribuir o lead para outra pessoa.
    let corretorId: string | undefined;
    if (dto.corretorId !== undefined) {
      if (this.isCorretor(requester)) {
        throw new ForbiddenException(
          'Você não pode reatribuir o lead para outro corretor.',
        );
      }
      await this.ensureCorretorExists(dto.corretorId);
      corretorId = dto.corretorId;
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.telefone !== undefined ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email.toLowerCase().trim() }
          : {}),
        ...(dto.origem !== undefined ? { origem: dto.origem.trim() } : {}),
        ...(dto.interesse !== undefined ? { interesse: dto.interesse } : {}),
        ...(dto.faixa !== undefined ? { faixa: dto.faixa.trim() } : {}),
        ...(dto.cidade !== undefined ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.bairro !== undefined ? { bairro: dto.bairro.trim() } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.prioridade !== undefined ? { prioridade: dto.prioridade } : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(corretorId !== undefined ? { corretorId } : {}),
      },
      select: leadSelect,
    });
  }

  async updateStage(
    id: string,
    stage: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    await this.ensureExistsAndAccessible(id, requester);
    return this.prisma.lead.update({
      where: { id },
      data: { stage },
      select: leadSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    await this.ensureExistsAndAccessible(id, requester);
    await this.prisma.lead.delete({ where: { id } });
  }

  // --- Helpers de RBAC ---

  private isCorretor(requester: AuthenticatedUser): boolean {
    return requester.role === Role.corretor;
  }

  /** Restringe a consulta aos leads do próprio corretor. Admin/gerente veem tudo. */
  private scopeByRole(requester: AuthenticatedUser): Prisma.LeadWhereInput {
    return this.isCorretor(requester) ? { corretorId: requester.id } : {};
  }

  private ensureCanAccess(
    lead: LeadEntity,
    requester: AuthenticatedUser,
  ): void {
    if (this.isCorretor(requester) && lead.corretorId !== requester.id) {
      // Mesma resposta de "não existe" para não revelar leads de terceiros.
      throw new NotFoundException('Lead não encontrado.');
    }
  }

  private async ensureExistsAndAccessible(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, corretorId: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }
    if (this.isCorretor(requester) && lead.corretorId !== requester.id) {
      throw new NotFoundException('Lead não encontrado.');
    }
  }

  private async ensureCorretorExists(corretorId: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id: corretorId } });
    if (count === 0) {
      throw new BadRequestException('Corretor informado não existe.');
    }
  }
}
