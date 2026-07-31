import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { OzapWebhookDto } from './dto/ozap-webhook.dto';
import { OzapWebhookGuard } from './guards/ozap-webhook.guard';
import { OzapService } from './ozap.service';

@Controller('webhooks/ozap')
export class OzapController {
  constructor(private readonly ozapService: OzapService) {}

  @Post()
  @Public()
  @UseGuards(OzapWebhookGuard)
  receive(@Body() payload: OzapWebhookDto) {
    return this.ozapService.handleWebhook(payload);
  }
}
