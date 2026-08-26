import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CaptacaoService } from './captacao.service';
import { CAPTACAO_ROLES } from './captacao.roles';
import {
  CreateProprietarioDto,
  QueryProprietariosDto,
  UpdateProprietarioDto,
} from './dto/proprietario.dto';

@Controller('captacao/proprietarios')
@UseGuards(RolesGuard)
export class ProprietariosController {
  constructor(private readonly captacao: CaptacaoService) {}

  @Get()
  @Roles(...CAPTACAO_ROLES)
  list(
    @Query() query: QueryProprietariosDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.listProprietarios(query, user);
  }

  @Get(':id')
  @Roles(...CAPTACAO_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.getProprietario(id, user);
  }

  @Post()
  @Roles(...CAPTACAO_ROLES)
  create(
    @Body() dto: CreateProprietarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.createProprietario(dto, user);
  }

  @Patch(':id')
  @Roles(...CAPTACAO_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProprietarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.updateProprietario(id, dto, user);
  }
}
