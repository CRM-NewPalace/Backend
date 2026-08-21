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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateEquipeDto } from './dto/create-equipe.dto';
import { UpdateEquipeDto } from './dto/update-equipe.dto';
import { EquipesService } from './equipes.service';

/**
 * Equipes.
 * - Admin: CRUD completo.
 * - Gerente: visualiza todas (para distribuir leads); só edita a que lidera.
 */
@Controller('equipes')
@UseGuards(RolesGuard)
export class EquipesController {
  constructor(private readonly equipesService: EquipesService) {}

  @Get()
  @Roles(Role.admin, Role.gerente)
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.equipesService.list(requester);
  }

  @Get('opcoes/gerentes')
  @Roles(Role.admin)
  listGerentes(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('equipeId') equipeId?: string,
  ) {
    return this.equipesService.listAvailableGerentes(requester, equipeId);
  }

  @Get('opcoes/corretores')
  @Roles(Role.admin)
  listCorretores(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('equipeId') equipeId?: string,
  ) {
    return this.equipesService.listAvailableCorretores(requester, equipeId);
  }

  @Get(':id')
  @Roles(Role.admin, Role.gerente)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.equipesService.findOne(id, requester);
  }

  @Post()
  @Roles(Role.admin)
  create(
    @Body() dto: CreateEquipeDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.equipesService.create(dto, requester);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEquipeDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.equipesService.update(id, dto, requester);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.equipesService.remove(id, requester);
  }
}
