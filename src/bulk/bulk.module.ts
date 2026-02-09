// src/bulk/bulk.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkController } from './bulk.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { Message } from '../whatsapp/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message]),
    WhatsappModule, 
  ],
  controllers: [BulkController],
})
export class BulkModule {}