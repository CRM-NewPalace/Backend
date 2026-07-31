import { Module } from '@nestjs/common';
import { OzapController } from './ozap.controller';
import { OzapWebhookGuard } from './guards/ozap-webhook.guard';
import { OzapService } from './ozap.service';

@Module({
  controllers: [OzapController],
  providers: [OzapService, OzapWebhookGuard],
})
export class OzapModule {}
