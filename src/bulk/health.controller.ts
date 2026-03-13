import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private dataSource: DataSource
  ) {}

  @Get()
  async check() {
    // Verificamos que la conexión a Neon esté activa
    const isDbConnected = this.dataSource.isInitialized;
    
    return {
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}