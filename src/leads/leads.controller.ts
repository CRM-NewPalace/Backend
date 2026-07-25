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
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { MarkLeadLostDto } from './dto/mark-lead-lost.dto';

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

  /**
   * Corretores ativos para atribuição de lead (admin/gerente veem a equipe;
   * corretor vê só a si). Precisa ficar antes de GET :id.
   */
  @Get('assignees')
  listAssignees(@CurrentUser() requester: AuthenticatedUser) {
    return this.leadsService.listAssignees(requester);
  }

  /** Leads perdidos — só admin. Antes de GET :id. */
  @Get('perdidos')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  findLost(
    @Query() query: QueryLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findLost(query, requester);
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

  /** Soft-delete operacional: lead vai para Leads Perdidos. */
  @Post(':id/perder')
  markLost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkLeadLostDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.markLost(id, dto.motivo, requester);
  }

  /** Exclusão definitiva — só admin, e só de leads já perdidos. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    await this.leadsService.remove(id, requester);
  }
}
