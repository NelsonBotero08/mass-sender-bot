// src/bulk/bulk.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkController } from './bulk.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { Message } from '../whatsapp/entities/message.entity';
import { Template } from '../whatsapp/entities/template.entity'; 
import { BulkService } from './bulk.service';
import { Contact } from '../whatsapp/entities/contact.entity';
import { HealthController } from './health.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Template, Contact]), 
    WhatsappModule, 
  ],
  controllers: [BulkController, HealthController],
  providers: [BulkService, MaintenanceService],
  exports: [BulkService],
})
export class BulkModule {}