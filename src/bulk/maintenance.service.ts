import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  // La URL de tu propio backend en Render

  

  @Cron(CronExpression.EVERY_10_MINUTES)
    async selfPing() {
    try {
        const urlLocal = 'http://localhost:3000/health'
        //await axios.get('https://mass-sender-bot.onrender.com/health');
        await axios.get(`${urlLocal}`)
        this.logger.log('Keep-alive exitoso');
    } catch (e) {
        this.logger.error('Fallo en keep-alive');
    }
    }
}