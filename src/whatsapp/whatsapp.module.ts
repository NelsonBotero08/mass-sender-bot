import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappService } from './whatsapp.service';
import { Message } from './entities/message.entity';
import { Conversation } from './entities/conversation.entity';
import { BulkModule } from 'src/bulk/bulk.module';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Conversation])],
  providers: [WhatsappService],
  exports: [WhatsappService],
  controllers: [WhatsappController], 
})
export class WhatsappModule {}