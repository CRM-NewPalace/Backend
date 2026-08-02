import { Module, forwardRef } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { FunisModule } from '../funis/funis.module';

@Module({
  imports: [forwardRef(() => FunisModule)],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
