import { Controller, Get } from '@nestjs/common';
import * as packageJson from '../package.json';

@Controller('health')
export class AppController {
  @Get()
  healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: packageJson.version
    };
  }
}