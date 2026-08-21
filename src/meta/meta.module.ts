import { Module } from '@nestjs/common';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { MetaGraphApiService } from './meta-graph-api.service';
import { MetaLeadPollService } from './meta-lead-poll.service';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  controllers: [MetaController],
  providers: [
    MetaService,
    MetaGraphApiService,
    MetaWebhookSignatureGuard,
    MetaLeadPollService,
  ],
})
export class MetaModule {}
