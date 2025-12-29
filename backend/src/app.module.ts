import { Module } from '@nestjs/common';
import { SociModule } from './soci/soci.module';

@Module({
  imports: [SociModule],
})
export class AppModule {}
