import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';

/**
 * Leads / clientes. Acessível a qualquer usuário autenticado; a visibilidade é
 * filtrada por perfil no service (corretor vê só os próprios; gerente/admin, todos).
 */
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.create(dto, requester);
  }

  @Get()
  findAll(
    @Query() query: QueryLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findAll(query, requester);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findOne(id, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.update(id, dto, requester);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStageDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.updateStage(id, dto.stage, requester);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    await this.leadsService.remove(id, requester);
  }
}
