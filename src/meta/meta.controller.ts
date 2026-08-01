import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MetaWebhookDto } from './dto/meta-webhook.dto';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { MetaService } from './meta.service';

@Controller('webhooks/meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  /**
   * Verificação do callback URL no painel Meta Developers
   * (hub.mode / hub.verify_token / hub.challenge).
   */
  @Get()
  @Public()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verified = this.metaService.verifyChallenge(mode, token, challenge);
    if (verified === null) {
      throw new ForbiddenException('Verificação do webhook Meta recusada.');
    }
    return res.status(200).send(verified);
  }

  @Post()
  @Public()
  @HttpCode(200)
  @UseGuards(MetaWebhookSignatureGuard)
  // Meta pode enviar campos extras; não rejeitar o payload por whitelist estrita.
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  receive(@Body() payload: MetaWebhookDto) {
    return this.metaService.handleWebhook(payload);
  }
}
