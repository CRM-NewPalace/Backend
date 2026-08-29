import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentPortal } from './decorators/current-portal.decorator';
import { PortalProprietarioAuthGuard } from './guards/portal-proprietario-auth.guard';
import { PortalProprietarioAuthService } from './portal-proprietario-auth.service';
import { PortalProprietarioImoveisService } from './portal-proprietario-imoveis.service';
import type { PortalProprietarioSession } from './portal-proprietario.types';

@Public()
@UseGuards(PortalProprietarioAuthGuard)
@Controller('portal-proprietario')
export class PortalProprietarioController {
  constructor(
    private readonly auth: PortalProprietarioAuthService,
    private readonly imoveis: PortalProprietarioImoveisService,
  ) {}

  @Get('me')
  me(@CurrentPortal() session: PortalProprietarioSession) {
    return this.auth.me(session);
  }

  @Get('imoveis')
  list(@CurrentPortal() session: PortalProprietarioSession) {
    return this.imoveis.dashboard(session);
  }

  @Get('imoveis/:id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getImovel(id, session);
  }

  @Get('imoveis/:id/historico')
  historico(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getHistorico(id, session);
  }

  @Get('imoveis/:id/visitas')
  visitas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getVisitas(id, session);
  }

  @Get('imoveis/:id/propostas')
  propostas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getPropostas(id, session);
  }

  @Get('imoveis/:id/fechamento')
  fechamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getFechamento(id, session);
  }

  @Get('imoveis/:id/documentacao')
  documentacao(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getDocumentacao(id, session);
  }

  @Get('imoveis/:id/contrato')
  contrato(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getContrato(id, session);
  }

  @Get('imoveis/:id/chaves')
  chaves(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getChaves(id, session);
  }

  @Get('imoveis/:id/pos-venda')
  posVenda(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getPosVenda(id, session);
  }
}
