import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException, UseGuards, SetMetadata, Get, Param, Delete, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { parse } from 'csv-parse/sync';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { UserRole } from 'src/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Message } from 'src/whatsapp/entities/message.entity';
import { Template } from 'src/whatsapp/entities/template.entity';
import { BulkService } from './bulk.service';

interface CsvRecord {
  telefono: string;
  nombre?: string;
}

@Controller('bulk')
export class BulkController {
  constructor(
    private readonly whatsappService: WhatsappService,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Template) private templateRepo: Repository<Template>,
    private readonly bulkService: BulkService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
@SetMetadata('roles', [UserRole.ADMIN])
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadCsv(
  @UploadedFile() file: Express.Multer.File,
  @Body('templates') templatesRaw: string | string[], 
) {
  if (!file) throw new BadRequestException('El archivo CSV es obligatorio');
  if (!templatesRaw) throw new BadRequestException('Debes enviar al menos una plantilla');

  try {
    // --- CAMBIO AQUÍ: Normalización de plantillas ---
    let templates: string[] = [];
    
    if (Array.isArray(templatesRaw)) {
      templates = templatesRaw.map(t => String(t).trim());
    } else if (typeof templatesRaw === 'string') {
      // Si llega con formato ["texto"], lo parseamos para extraer el contenido
      if (templatesRaw.startsWith('[') && templatesRaw.endsWith(']')) {
        try {
          const parsed = JSON.parse(templatesRaw);
          templates = Array.isArray(parsed) ? parsed.map(t => String(t).trim()) : [String(parsed).trim()];
        } catch (e) {
          // Si falla el parseo, lo tratamos como string normal y separamos por comas
          templates = templatesRaw.split(',').map(t => t.trim());
        }
      } else {
        // Si es un string simple separado por comas
        templates = templatesRaw.split(',').map(t => t.trim());
      }
    }
    
    // Filtramos posibles entradas vacías
    templates = [...new Set(templates.filter(t => t.length > 0))];
    // ------------------------------------------------

    // 2. Procesar CSV
    const records = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';',
      bom: true,
    }) as any[];

    if (records.length === 0 || !records[0].telefono) {
      throw new BadRequestException('El CSV debe tener la columna "telefono"');
    }

    // 3. Pasamos records y las plantillas limpias
    // El servicio ahora usará templates[i % templates.length]
    this.whatsappService.sendMassMessages(records, templates);

    return {
      success: true,
      message: `Proceso iniciado con ${records.length} contactos y ${templates.length} plantillas rotando.`,
    };
  } catch (error) {
    throw new BadRequestException('Error: ' + error.message);
  }
}

  @Get('stats')
  async getStats() {
    // Llamamos directamente a la lógica del servicio que tiene el formato correcto
    return await this.bulkService.getStats();
  }

  @Get('stats-reports')
  async getStatsReports() {
    // Calculamos estadísticas de las últimas 24 horas o totales
    const total = await this.messageRepo.count();
    const sent = await this.messageRepo.count({ where: { status: 'SENT' } });
    const delivered = await this.messageRepo.count({ where: { ack: MoreThan(1) } }); // 2 o 3
    const read = await this.messageRepo.count({ where: { ack: 3 } });

    return {
      summary: {
        total_records: total,
        sent: sent,
        delivered: delivered,
        read: read,
      },
      performance: {
        delivery_rate: total > 0 ? `${((delivered / total) * 100).toFixed(2)}%` : '0%',
        read_rate: total > 0 ? `${((read / total) * 100).toFixed(2)}%` : '0%',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('report')
  async getMassiveReport(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('phone') phone?: string // Nuevo parámetro de búsqueda
  ) {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    return await this.whatsappService.getDetailedReport(p, l, from, to, phone);
  }


@Post('validate')
async validateTemplates(
  @Body() body: { columns: string[], templateIds: number[] }
) {
  const { columns, templateIds } = body;
  
  // 1. Buscamos las plantillas en la DB
  const templates = await this.templateRepo.find({
    where: { id: In(templateIds) }
  });

  const report = templates.map(template => {
    const requiredVars = this.whatsappService.extractVariables(template.content);
    
    // 2. Verificamos si todas las variables requeridas están en las columnas del CSV
    const missingVars = requiredVars.filter(v => !columns.includes(v));
    
    return {
      id: template.id,
      name: template.name,
      isValid: missingVars.length === 0,
      missingVariables: missingVars,
      requiredVariables: requiredVars
    };
  });

  // 3. Si hay alguna inválida, avisamos al front
  const hasErrors = report.some(r => !r.isValid);

  return {
    canProceed: !hasErrors,
    details: report
  };
}

@Get('last-messages')
async getLastMessages() {
  return await this.messageRepo.find({
    order: { sentAt: 'DESC' } as any, 
    take: 10
  });
}

// Obtener todas las plantillas guardadas
@UseGuards(JwtAuthGuard)
@Get('templates')
async getTemplates() {
  return await this.templateRepo.find({
    order: { createdAt: 'DESC' }
  });
}

// Crear una nueva plantilla
@UseGuards(JwtAuthGuard, RolesGuard)
@SetMetadata('roles', [UserRole.ADMIN])
@Post('templates')
async createTemplate(@Body() body: { name: string; content: string }) {
  if (!body.name || !body.content) {
    throw new BadRequestException('El nombre y el contenido son obligatorios');
  }

  const newTemplate = this.templateRepo.create({
    name: body.name,
    content: body.content,
  });

  return await this.templateRepo.save(newTemplate);
}

// Eliminar una plantilla
@UseGuards(JwtAuthGuard, RolesGuard)
@SetMetadata('roles', [UserRole.ADMIN])
@Delete('templates/:id')
async deleteTemplate(@Param('id') id: number) {
  await this.templateRepo.delete(id);
  return { success: true, message: 'Plantilla eliminada' };
}
}