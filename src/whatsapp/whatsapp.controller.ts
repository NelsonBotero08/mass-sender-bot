import { Controller, Get, Res, UseGuards, SetMetadata, Post } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/entities/user.entity';
import * as qrImage from 'qr-image';

@UseGuards(JwtAuthGuard, RolesGuard) // Protege todo el controlador
@SetMetadata('roles', [UserRole.ADMIN]) // Solo permite ADMIN
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  async getStatus() {
    const info = this.whatsappService.getStatus();
    
    if (info.status === 'CONNECTED') {
      return { message: 'Sesión activa', connected: true };
    }

    if (info.qr) {
      return { 
        message: 'Necesita escaneo', 
        connected: false, 
        qr: info.qr 
      };
    }

    return { message: 'Iniciando servicio...', connected: false };
  }

  @Get('qr-image')
  async getQrImage(@Res() res) {
    const info = this.whatsappService.getStatus();
    
    if (!info.qr) {
      return res.status(400).json({ message: 'No hay QR disponible o ya está conectado' });
    }

    const code = qrImage.image(info.qr, { type: 'png' });
    res.type('image/png');
    return code.pipe(res);
  }

  @Post('init') 
  async initWhatsApp() {
    return this.whatsappService.initialize();
  }

  @Post('logout')
  async logout() {
    return this.whatsappService.logout();
  }
}