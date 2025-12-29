import { Controller, Get } from '@nestjs/common';

@Controller('api/soci')
export class SociController {
  @Get()
  getSoci() {
    return [
      { id: '1', nome: 'Mario Rossi', email: 'mario.rossi@example.com' },
      { id: '2', nome: 'Luca Bianchi', email: 'luca.bianchi@example.com' },
    ];
  }
}
