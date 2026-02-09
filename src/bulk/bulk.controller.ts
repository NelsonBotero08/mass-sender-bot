import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException, UseGuards, SetMetadata, Get } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { parse } from 'csv-parse/sync';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { UserRole } from 'src/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Message } from 'src/whatsapp/entities/message.entity';

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
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @SetMetadata('roles', [UserRole.ADMIN])
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body('template') template: string, // Ejemplo: "Hola {{nombre}}, ¿cómo estás?"
  ) {
    if (!file) throw new BadRequestException('El archivo CSV es obligatorio');
    if (!template) throw new BadRequestException('El texto del mensaje es obligatorio');

    try {
      // Procesar CSV
        const records = parse(file.buffer, {
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
        }) as CsvRecord[];

      // Validar que el CSV tenga las columnas correctas
      if (records.length === 0 || !records[0].telefono) {
        throw new BadRequestException('El CSV debe tener al menos la columna "telefono"');
      }

      // Iniciamos el proceso (sin await para no bloquear la respuesta al cliente)
      this.whatsappService.sendMassMessages(records, template);

      return {
        success: true,
        message: `Proceso iniciado para ${records.length} contactos.`,
      };
    } catch (error) {
      throw new BadRequestException('Error al procesar el CSV: ' + error.message);
    }
  }

  @Get('stats')
  async getStats() {
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
}