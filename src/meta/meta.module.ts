import { Module } from '@nestjs/common';
import { MetaWebhookSignatureGuard } from './guards/meta-webhook-signature.guard';
import { MetaGraphApiService } from './meta-graph-api.service';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  controllers: [MetaController],
  providers: [MetaService, MetaGraphApiService, MetaWebhookSignatureGuard],
})
export class MetaModule {}
