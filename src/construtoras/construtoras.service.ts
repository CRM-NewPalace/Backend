import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateConstrutoraDto } from './dto/create-construtora.dto';
import { UpdateConstrutoraDto } from './dto/update-construtora.dto';

const construtoraSelect = {
  id: true,
  nome: true,
  contato: true,
  endereco: true,
  viabilizadorNome: true,
  viabilizadorContato: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { empreendimentos: true, documentacoes: true } },
} as const;

@Injectable()
export class ConstrutorasService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.construtora.findMany({
      select: construtoraSelect,
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.construtora.findUnique({
      where: { id },
      select: construtoraSelect,
    });
    if (!item) throw new NotFoundException('Construtora não encontrada.');
    return item;
  }

  create(dto: CreateConstrutoraDto, requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    return this.prisma.construtora.create({
      data: {
        nome: dto.nome.trim(),
        contato: dto.contato?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        viabilizadorNome: dto.viabilizadorNome?.trim() || null,
        viabilizadorContato: dto.viabilizadorContato?.trim() || null,
      },
      select: construtoraSelect,
    });
  }

  async update(
    id: string,
    dto: UpdateConstrutoraDto,
    requester: AuthenticatedUser,
  ) {
    this.assertAdmin(requester);
    await this.findOne(id);
    return this.prisma.construtora.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.contato !== undefined
          ? { contato: dto.contato?.trim() || null }
          : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco?.trim() || null }
          : {}),
        ...(dto.viabilizadorNome !== undefined
          ? { viabilizadorNome: dto.viabilizadorNome?.trim() || null }
          : {}),
        ...(dto.viabilizadorContato !== undefined
          ? { viabilizadorContato: dto.viabilizadorContato?.trim() || null }
          : {}),
      },
      select: construtoraSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    await this.findOne(id);
    await this.prisma.construtora.delete({ where: { id } });
    return { ok: true };
  }

  private assertAdmin(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem cadastrar ou editar construtoras.',
      );
    }
  }
}
