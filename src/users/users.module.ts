import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [EquipesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
