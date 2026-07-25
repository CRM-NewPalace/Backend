import { Module } from '@nestjs/common';
import { EquipesController } from './equipes.controller';
import { EquipesService } from './equipes.service';
import { TeamScopeService } from './team-scope.service';

@Module({
  controllers: [EquipesController],
  providers: [EquipesService, TeamScopeService],
  exports: [TeamScopeService],
})
export class EquipesModule {}
