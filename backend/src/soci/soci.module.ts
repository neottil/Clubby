import { Module } from '@nestjs/common';
import { SociController } from './soci.controller';

@Module({
  controllers: [SociController],
})
export class SociModule {}
