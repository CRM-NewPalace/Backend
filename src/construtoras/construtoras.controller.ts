import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateConstrutoraDto } from './dto/create-construtora.dto';
import { UpdateConstrutoraDto } from './dto/update-construtora.dto';
import { ConstrutorasService } from './construtoras.service';

@Controller('construtoras')
@UseGuards(RolesGuard)
export class ConstrutorasController {
  constructor(private readonly construtorasService: ConstrutorasService) {}

  @Get()
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista)
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.construtorasService.list(requester);
  }

  @Get(':id')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.findOne(id, requester);
  }

  @Post()
  @Roles(Role.admin, Role.gerente)
  create(
    @Body() dto: CreateConstrutoraDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.create(dto, requester);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConstrutoraDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.update(id, dto, requester);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.construtorasService.remove(id, requester);
  }
}
