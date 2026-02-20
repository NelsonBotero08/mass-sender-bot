import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { BulkModule } from './bulk/bulk.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user_admin',
      password: 'my_password123',
      database: 'mass_sender_db',
      autoLoadEntities: true, 
      synchronize: true, 
    }),
    WhatsappModule,
    BulkModule,
    AuthModule
  ],
})
export class AppModule {}