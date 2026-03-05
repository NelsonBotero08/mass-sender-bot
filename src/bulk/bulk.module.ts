// src/bulk/bulk.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkController } from './bulk.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { Message } from '../whatsapp/entities/message.entity';
import { Template } from '../whatsapp/entities/template.entity'; 
import { BulkService } from './bulk.service';
import { Contact } from 'src/whatsapp/entities/contact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Template, Contact]), 
    WhatsappModule, 
  ],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}