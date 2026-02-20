import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappService } from './whatsapp.service';
import { Message } from './entities/message.entity';
import { Conversation } from './entities/conversation.entity';
import { WhatsappController } from './whatsapp.controller';
import { Template } from './entities/template.entity';
import { ChatbotService } from './chatBot.service';
import { BotStatus } from './entities/botStatus.entity'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Conversation, Template, BotStatus])
  ],
  providers: [WhatsappService, ChatbotService],
  exports: [WhatsappService, ChatbotService], 
  controllers: [WhatsappController], 
})
export class WhatsappModule {}