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
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { ReorderCatalogDto } from './dto/reorder-catalog.dto';

/**
 * Catálogos configuráveis (funil, origens, motivos de perda, tags).
 * Leitura: qualquer usuário autenticado. Mutação: admin e gerente.
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  find(@Query() query: QueryCatalogDto) {
    const activeOnly = query.activeOnly ?? true;
    if (query.type) {
      return this.catalogService.findByType(query.type, activeOnly);
    }
    return this.catalogService.findAllGrouped(activeOnly);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  create(@Body() dto: CreateCatalogItemDto) {
    return this.catalogService.create(dto);
  }

  /** Instala/restaura o pacote padrão de etapas do funil no banco. */
  @Post('defaults/funil')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  installDefaultFunnel() {
    return this.catalogService.installDefaultFunnelStages();
  }

  @Patch('reorder')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  reorder(@Body() dto: ReorderCatalogDto) {
    return this.catalogService.reorder(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalogService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.remove(id);
  }
}
