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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

/**
 * Gestão de usuários.
 * - Admin: CRUD completo + reset de senha.
 * - Gerente: lista/consulta membros da própria equipe + reset de senha (e-mail visível).
 */
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.admin)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(Role.admin, Role.gerente)
  findAll(
    @Query() query: QueryUsersDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.usersService.findAll(query, requester);
  }

  @Get(':id')
  @Roles(Role.admin, Role.gerente)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.usersService.findOne(id, requester);
  }

  @Patch(':id')
  @Roles(Role.admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.admin)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.usersService.updateStatus(id, dto.status, requesterId);
  }

  @Patch(':id/reset-password')
  @Roles(Role.admin, Role.gerente)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.usersService.resetPassword(id, dto.password, requester);
  }

  @Patch(':id/unlock')
  @Roles(Role.admin)
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unlock(id);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    await this.usersService.remove(id, requesterId);
  }
}
