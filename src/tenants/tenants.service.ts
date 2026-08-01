import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateMetaConnectionDto } from './dto/create-meta-connection.dto';
import { UpdateMetaConnectionDto } from './dto/update-meta-connection.dto';
import { CreateOzapConnectionDto } from './dto/create-ozap-connection.dto';
import { UpdateOzapConnectionDto } from './dto/update-ozap-connection.dto';
import { tenantAdminSelect } from '../common/utils/tenant-branding';

const tenantSelect = tenantAdminSelect;

const metaConnectionSelect = {
  id: true,
  tenantId: true,
  pageId: true,
  pageAccessToken: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantMetaConnectionSelect;

const ozapConnectionSelect = {
  id: true,
  tenantId: true,
  instanceId: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantOzapConnectionSelect;

type MetaConnection = Prisma.TenantMetaConnectionGetPayload<{
  select: typeof metaConnectionSelect;
}>;

/** Mascara um segredo mostrando apenas os 4 últimos caracteres (ex.: token de acesso). */
function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '•'.repeat(value.length);
  }
  return `${'•'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function maskMetaConnection(connection: MetaConnection) {
  return { ...connection, pageAccessToken: maskSecret(connection.pageAccessToken) };
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tenant.findMany({
      select: tenantSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateTenantDto) {
    const slug = dto.slug.toLowerCase().trim();
    await this.ensureSlugAvailable(slug);

    try {
      return await this.prisma.tenant.create({
        data: {
          name: dto.name.trim(),
          slug,
          status: dto.status ?? UserStatus.ativo,
        },
        select: tenantSelect,
      });
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Já existe um tenant com este slug.',
      );
    }
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        ...tenantSelect,
        metaConnections: {
          select: metaConnectionSelect,
          orderBy: { createdAt: 'desc' },
        },
        ozapConnections: {
          select: ozapConnectionSelect,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    return {
      ...tenant,
      metaConnections: tenant.metaConnections.map(maskMetaConnection),
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.ensureExists(id);

    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.logoUrl !== undefined
          ? { logoUrl: dto.logoUrl?.trim() || null }
          : {}),
        ...(dto.primaryColor !== undefined
          ? {
              primaryColor: dto.primaryColor?.trim().toUpperCase() || null,
            }
          : {}),
        ...(dto.sidebarStyle !== undefined
          ? { sidebarStyle: dto.sidebarStyle }
          : {}),
        ...(dto.density !== undefined ? { density: dto.density } : {}),
        ...(dto.homePath !== undefined ? { homePath: dto.homePath } : {}),
        ...(dto.modules !== undefined
          ? {
              modules:
                dto.modules === null
                  ? Prisma.DbNull
                  : (dto.modules as Prisma.InputJsonValue),
            }
          : {}),
      },
      select: tenantSelect,
    });
  }

  // ---------------------------------------------------------------------
  // Conexões Meta (Lead Ads)
  // ---------------------------------------------------------------------

  async listMetaConnections(tenantId: string) {
    await this.ensureExists(tenantId);

    const connections = await this.prisma.tenantMetaConnection.findMany({
      where: { tenantId },
      select: metaConnectionSelect,
      orderBy: { createdAt: 'desc' },
    });

    return connections.map(maskMetaConnection);
  }

  async createMetaConnection(tenantId: string, dto: CreateMetaConnectionDto) {
    await this.ensureExists(tenantId);
    const pageId = dto.pageId.trim();
    await this.ensurePageIdAvailable(pageId);

    try {
      const connection = await this.prisma.tenantMetaConnection.create({
        data: {
          tenantId,
          pageId,
          pageAccessToken: dto.pageAccessToken,
          ativo: dto.ativo ?? true,
        },
        select: metaConnectionSelect,
      });
      return maskMetaConnection(connection);
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Já existe uma conexão Meta com este pageId.',
      );
    }
  }

  async updateMetaConnection(
    tenantId: string,
    connectionId: string,
    dto: UpdateMetaConnectionDto,
  ) {
    await this.ensureMetaConnectionExists(tenantId, connectionId);

    const connection = await this.prisma.tenantMetaConnection.update({
      where: { id: connectionId },
      data: {
        ...(dto.pageAccessToken !== undefined
          ? { pageAccessToken: dto.pageAccessToken }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: metaConnectionSelect,
    });

    return maskMetaConnection(connection);
  }

  async removeMetaConnection(tenantId: string, connectionId: string) {
    await this.ensureMetaConnectionExists(tenantId, connectionId);
    await this.prisma.tenantMetaConnection.delete({
      where: { id: connectionId },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Conexões OZap (WhatsApp)
  // ---------------------------------------------------------------------

  async listOzapConnections(tenantId: string) {
    await this.ensureExists(tenantId);

    return this.prisma.tenantOzapConnection.findMany({
      where: { tenantId },
      select: ozapConnectionSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOzapConnection(tenantId: string, dto: CreateOzapConnectionDto) {
    await this.ensureExists(tenantId);
    await this.ensureInstanceIdAvailable(dto.instanceId);

    try {
      return await this.prisma.tenantOzapConnection.create({
        data: {
          tenantId,
          instanceId: dto.instanceId,
          ativo: dto.ativo ?? true,
        },
        select: ozapConnectionSelect,
      });
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Já existe uma conexão OZap com este instanceId.',
      );
    }
  }

  async updateOzapConnection(
    tenantId: string,
    connectionId: string,
    dto: UpdateOzapConnectionDto,
  ) {
    await this.ensureOzapConnectionExists(tenantId, connectionId);

    return this.prisma.tenantOzapConnection.update({
      where: { id: connectionId },
      data: {
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: ozapConnectionSelect,
    });
  }

  async removeOzapConnection(tenantId: string, connectionId: string) {
    await this.ensureOzapConnectionExists(tenantId, connectionId);
    await this.prisma.tenantOzapConnection.delete({
      where: { id: connectionId },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.tenant.count({ where: { id } });
    if (count === 0) {
      throw new NotFoundException('Tenant não encontrado.');
    }
  }

  private async ensureMetaConnectionExists(
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    await this.ensureExists(tenantId);
    const count = await this.prisma.tenantMetaConnection.count({
      where: { id: connectionId, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException('Conexão Meta não encontrada.');
    }
  }

  private async ensureOzapConnectionExists(
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    await this.ensureExists(tenantId);
    const count = await this.prisma.tenantOzapConnection.count({
      where: { id: connectionId, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException('Conexão OZap não encontrada.');
    }
  }

  private async ensureSlugAvailable(
    slug: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe um tenant com este slug.');
    }
  }

  private async ensurePageIdAvailable(pageId: string): Promise<void> {
    const existing = await this.prisma.tenantMetaConnection.findUnique({
      where: { pageId },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe uma conexão Meta com este pageId.',
      );
    }
  }

  private async ensureInstanceIdAvailable(instanceId: number): Promise<void> {
    const existing = await this.prisma.tenantOzapConnection.findUnique({
      where: { instanceId },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe uma conexão OZap com este instanceId.',
      );
    }
  }

  /** Converte violação de unicidade do Prisma (P2002) numa 409 amigável. */
  private translateUniqueConstraint(error: unknown, message: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(message);
    }
    return error;
  }
}
