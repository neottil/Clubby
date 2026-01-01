import { Module } from '@nestjs/common';
import { SociModule } from './soci/soci.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    SociModule
  ],
  controllers: [AppController],
})
export class AppModule {}
