import { Controller, Get, Res, UseGuards, SetMetadata, Post, UseInterceptors, UploadedFiles, Body, BadRequestException, UploadedFile, Delete, Param, Query, Patch } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/entities/user.entity';
import * as QRCode from 'qrcode';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { In, Repository } from 'typeorm';
import { ContactService } from './contact.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Template } from './entities/template.entity';
import * as fs from 'fs';

const uploadPath = './uploads'; 

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

@UseGuards(JwtAuthGuard, RolesGuard) // Protege todo el controlador
@SetMetadata('roles', [UserRole.ADMIN]) // Solo permite ADMIN
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly contactService: ContactService, 
    @InjectRepository(Template) 
    private readonly templateRepo: Repository<Template>,
  ) {}

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
    return { success: true, message: 'Sesión de usuario cerrada' };
}

  @Post('reset-auth')
  async resetAuth() {
    return this.whatsappService.clearAuthFolder();
  }

  @Post('start-mobile-campaign')
    @UseInterceptors(FilesInterceptor('images', 5, { 
     storage: diskStorage({
      destination: (req, file, cb) => {
        try {
          // Forzamos la creación por si acaso
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        } catch (err:any) {
          console.error('❌ Error en Multer Destination:', err);
          cb(err, uploadPath);
        }
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    }))
    async startMobileCampaign(
      @UploadedFiles() files: Array<Express.Multer.File>,
      @Body() body: { contactIds: string; templateIds: string } 
    ) {
      console.log('--- NUEVA CAMPAÑA ---');
      console.log('Archivos detectados:', files?.length || 0);
      
      // 1. Convertimos los strings del body (vienen como "1,2,3") a arreglos
      const cIds = body.contactIds.split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id)); // Elimina cualquier cosa que no sea un número

      const tIds = body.templateIds.split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));

      // 2. Buscamos los contactos y plantillas reales en la DB
      const contacts = await this.contactService.findByIds(cIds);
      const templates = await this.templateRepo.findBy({ id: In(tIds) });
      
      if (contacts.length === 0) throw new BadRequestException('No hay contactos seleccionados');

      const imagePaths = files.map(f => resolve(f.path));
      const templateTexts = templates.map(t => t.content);

      // 3. Ejecutar con simulación humana
      await this.whatsappService.sendMassMessages(contacts, templateTexts, imagePaths);

      return { 
        success: true, 
        message: `Campaña iniciada para ${contacts.length} contactos desde el móvil.` 
      };
    }


  @Post('contacts/manual')
  async addManualContact(
    @Body() body: { telefono: string; nombre: string; categoria?: string }
  ) {
    if (!body.telefono || !body.nombre) {
      throw new BadRequestException('Teléfono y nombre son obligatorios');
    }
    return await this.contactService.createOne(body);
  }

  // 2. Listar todos los contactos (Para que el asesor los seleccione en el móvil)
  @Get('contacts')
  async getContacts(
    @Query('search') search?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('categoria') categoria?: string,
    @Query('excludeDays') excludeDays?: string, // Lo recibimos como string del Query
  ) {
    // Lo convertimos a número y lo pasamos al service
    const days = excludeDays ? parseInt(excludeDays) : 0;
    
    return await this.contactService.findPaginated(
      search, 
      Number(page), 
      Number(limit), 
      categoria,
      days // <-- No olvides pasarlo aquí
    );
  }

  // 3. Importar contactos masivamente (CSV)
  @Post('contacts/import')
  @UseInterceptors(FileInterceptor('file')) // Necesitas importar FileInterceptor de @nestjs/platform-express
  async importContacts(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('El archivo CSV es obligatorio');
    return await this.contactService.importFromCsv(file.buffer);
  }

  @Patch('contacts/:id')
  async updateContact(
    @Param('id') id: number,
    @Body() body: { telefono?: string; nombre?: string; categoria?: string; active?: boolean }
  ) {
    return await this.contactService.update(id, body);
  }

  // Eliminar contacto (completado)
  @Delete('contacts/:id')
  async deleteContact(@Param('id') id: number) {
    await this.contactService.remove(id);
    return { 
      success: true, 
      message: `Contacto ${id} desactivado correctamente` 
    };
  }


  @Get('report') // Esto resuelve el error 404
  async getReport(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('phone') phone?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Llamamos a la función exacta que ya tienes en tu service
    return this.whatsappService.getDetailedReport(
      Number(page), 
      Number(limit), 
      from, 
      to, 
      phone
    );
  }
}