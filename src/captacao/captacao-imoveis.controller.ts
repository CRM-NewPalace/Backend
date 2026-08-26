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
  CreateImovelDto,
  QueryImoveisDto,
  UpdateImovelDto,
} from './dto/imovel.dto';

@Controller('captacao/imoveis')
@UseGuards(RolesGuard)
export class CaptacaoImoveisController {
  constructor(private readonly captacao: CaptacaoService) {}

  @Get()
  @Roles(...CAPTACAO_ROLES)
  list(
    @Query() query: QueryImoveisDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.listImoveis(query, user);
  }

  @Get(':id')
  @Roles(...CAPTACAO_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.getImovel(id, user);
  }

  @Post()
  @Roles(...CAPTACAO_ROLES)
  create(@Body() dto: CreateImovelDto, @CurrentUser() user: AuthenticatedUser) {
    return this.captacao.createImovel(dto, user);
  }

  @Patch(':id')
  @Roles(...CAPTACAO_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImovelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.updateImovel(id, dto, user);
  }
}
