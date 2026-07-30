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
import { CreateEmpreendimentoDto } from './dto/create-empreendimento.dto';
import { UpdateEmpreendimentoDto } from './dto/update-empreendimento.dto';
import { QueryEmpreendimentosDto } from './dto/query-empreendimentos.dto';
import { EmpreendimentosService } from './empreendimentos.service';

@Controller('empreendimentos')
@UseGuards(RolesGuard)
export class EmpreendimentosController {
  constructor(
    private readonly empreendimentosService: EmpreendimentosService,
  ) {}

  @Get()
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista)
  list(@Query() query: QueryEmpreendimentosDto) {
    return this.empreendimentosService.list(query);
  }

  @Post('sync')
  @Roles(Role.admin)
  sync(@CurrentUser() requester: AuthenticatedUser) {
    return this.empreendimentosService.syncFromSite(requester);
  }

  @Get(':id')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.empreendimentosService.findOne(id);
  }

  @Post()
  @Roles(Role.admin, Role.gerente)
  create(
    @Body() dto: CreateEmpreendimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.create(dto, requester);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmpreendimentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.update(id, dto, requester);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.empreendimentosService.remove(id, requester);
  }
}
