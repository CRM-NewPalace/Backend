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
import { CreateEquipeDto } from './dto/create-equipe.dto';
import { UpdateEquipeDto } from './dto/update-equipe.dto';
import { EquipesService } from './equipes.service';

@Controller('equipes')
@UseGuards(RolesGuard)
@Roles(Role.admin)
export class EquipesController {
  constructor(private readonly equipesService: EquipesService) {}

  @Get()
  list() {
    return this.equipesService.list();
  }

  @Get('opcoes/gerentes')
  listGerentes(@Query('equipeId') equipeId?: string) {
    return this.equipesService.listAvailableGerentes(equipeId);
  }

  @Get('opcoes/corretores')
  listCorretores(@Query('equipeId') equipeId?: string) {
    return this.equipesService.listAvailableCorretores(equipeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.equipesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEquipeDto) {
    return this.equipesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEquipeDto,
  ) {
    return this.equipesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.equipesService.remove(id);
  }
}
