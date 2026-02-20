import { Controller, Get, Res, UseGuards, SetMetadata, Post } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/entities/user.entity';
import * as QRCode from 'qrcode';

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
      try {
        // ESTA ES LA CLAVE: Convertimos el string de Baileys a Base64 real
        const qrBase64 = await QRCode.toDataURL(info.qr);
        return { 
          message: 'Necesita escaneo', 
          connected: false, 
          qr: qrBase64 
        };
      } catch (err) {
        return { message: 'Error generando QR', connected: false };
      }
    }

    return { message: 'Iniciando servicio...', connected: false };
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