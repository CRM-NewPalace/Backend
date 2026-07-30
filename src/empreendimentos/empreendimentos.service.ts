import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateEmpreendimentoDto } from './dto/create-empreendimento.dto';
import { UpdateEmpreendimentoDto } from './dto/update-empreendimento.dto';
import { QueryEmpreendimentosDto } from './dto/query-empreendimentos.dto';
import { fetchSiteEmpreendimentos } from './site-sync';

const empreendimentoSelect = {
  id: true,
  nome: true,
  construtoraId: true,
  cidade: true,
  endereco: true,
  quartos: true,
  banheiros: true,
  areaM2: true,
  externalUrl: true,
  externalKey: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
  construtora: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class EmpreendimentosService {
  private readonly logger = new Logger(EmpreendimentosService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryEmpreendimentosDto) {
    return this.prisma.empreendimento.findMany({
      where: {
        ...(query.construtoraId
          ? { construtoraId: query.construtoraId }
          : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      },
      select: empreendimentoSelect,
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.empreendimento.findUnique({
      where: { id },
      select: empreendimentoSelect,
    });
    if (!item) throw new NotFoundException('Empreendimento não encontrado.');
    return item;
  }

  create(dto: CreateEmpreendimentoDto, requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    const key = this.slugify(dto.nome);
    return this.prisma.empreendimento.create({
      data: {
        nome: dto.nome.trim(),
        construtoraId: dto.construtoraId ?? null,
        cidade: dto.cidade?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        quartos: dto.quartos ?? null,
        banheiros: dto.banheiros ?? null,
        areaM2: dto.areaM2 ?? null,
        externalUrl: dto.externalUrl?.trim() || null,
        externalKey: `manual-${key}-${Date.now()}`,
        ativo: dto.ativo ?? true,
      },
      select: empreendimentoSelect,
    });
  }

  async update(
    id: string,
    dto: UpdateEmpreendimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertAdmin(requester);
    await this.findOne(id);
    return this.prisma.empreendimento.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.construtoraId !== undefined
          ? { construtoraId: dto.construtoraId }
          : {}),
        ...(dto.cidade !== undefined
          ? { cidade: dto.cidade?.trim() || null }
          : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco?.trim() || null }
          : {}),
        ...(dto.quartos !== undefined ? { quartos: dto.quartos } : {}),
        ...(dto.banheiros !== undefined ? { banheiros: dto.banheiros } : {}),
        ...(dto.areaM2 !== undefined ? { areaM2: dto.areaM2 } : {}),
        ...(dto.externalUrl !== undefined
          ? { externalUrl: dto.externalUrl?.trim() || null }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: empreendimentoSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    await this.findOne(id);
    await this.prisma.empreendimento.delete({ where: { id } });
    return { ok: true };
  }

  async syncFromSite(requester: AuthenticatedUser) {
    this.assertAdmin(requester);

    const { items, source, detail } = await fetchSiteEmpreendimentos();
    if (detail) {
      this.logger.warn(detail);
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await this.prisma.empreendimento.findUnique({
        where: { externalKey: item.externalKey },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.empreendimento.update({
          where: { id: existing.id },
          data: {
            nome: item.nome,
            cidade: item.cidade,
            endereco: item.endereco,
            quartos: item.quartos,
            banheiros: item.banheiros,
            areaM2: item.areaM2,
            externalUrl: item.externalUrl,
            ativo: true,
          },
        });
        updated += 1;
      } else {
        await this.prisma.empreendimento.create({
          data: {
            nome: item.nome,
            cidade: item.cidade,
            endereco: item.endereco,
            quartos: item.quartos,
            banheiros: item.banheiros,
            areaM2: item.areaM2,
            externalUrl: item.externalUrl,
            externalKey: item.externalKey,
            ativo: true,
          },
        });
        created += 1;
      }
    }

    return {
      ok: true,
      source,
      detail: detail ?? null,
      total: items.length,
      created,
      updated,
    };
  }

  private assertAdmin(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar empreendimentos.',
      );
    }
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
}
