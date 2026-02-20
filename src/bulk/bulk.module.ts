// src/bulk/bulk.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkController } from './bulk.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { Message } from '../whatsapp/entities/message.entity';
import { Template } from '../whatsapp/entities/template.entity'; 
import { BulkService } from './bulk.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Template]), 
    WhatsappModule, 
  ],
  controllers: [BulkController],
  providers: [BulkService],
})
export class BulkModule {}