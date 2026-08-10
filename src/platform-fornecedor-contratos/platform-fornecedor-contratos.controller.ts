import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreatePlatformFornecedorContratoDto } from './dto/create-platform-fornecedor-contrato.dto';
import { PlatformFornecedorContratosService } from './platform-fornecedor-contratos.service';

@Controller('platform-fornecedor-contratos')
@Roles(Role.super_admin)
export class PlatformFornecedorContratosController {
  constructor(private readonly service: PlatformFornecedorContratosService) {}

  @Get()
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.service.list(requester);
  }

  @Post('com-titulos')
  createComTitulos(
    @Body() dto: CreatePlatformFornecedorContratoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.createComTitulos(dto, requester);
  }
}
