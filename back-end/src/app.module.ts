import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { SociController } from './soci.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController, SociController],
  providers: [AppService],
})
export class AppModule {}
