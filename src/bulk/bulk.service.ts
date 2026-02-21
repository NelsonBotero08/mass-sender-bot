import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual, MoreThan } from 'typeorm';
import { Template } from '../whatsapp/entities/template.entity';
import { Message } from 'src/whatsapp/entities/message.entity';

@Injectable()
export class BulkService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
  ) {}

  // 2. Crea este método para el Dashboard
  // En bulk.service.ts

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Mensajes de hoy (usando sentAt que es el nombre real en tu DB)
    const sentToday = await this.messageRepo.count({
      where: { 
        sentAt: MoreThanOrEqual(today) 
      }
    });

    // 2. Conteo de plantillas
    const templateCount = await this.templateRepo.count();

    // 3. Gráfico de los últimos 7 días
    const rawChartData = await this.messageRepo
      .createQueryBuilder('message')
      .select("TO_CHAR(message.sentAt, 'DD/MM')", 'day') 
      .addSelect('COUNT(*)', 'envios')
      .where('message.sentAt >= CURRENT_DATE - INTERVAL \'7 days\'')
      .groupBy("TO_CHAR(message.sentAt, 'DD/MM')")
      .orderBy('day', 'ASC')
      .getRawMany();

    // 4. Tasa de entrega real basada en tu columna 'ack'
    const total = await this.messageRepo.count();
    // Según tu lógica: ack > 1 es entregado (2 o 3)
    const delivered = await this.messageRepo.count({ 
      where: { ack: MoreThan(1) } 
    });
    
    const deliveryRate = total > 0 
      ? ((delivered / total) * 100).toFixed(2) + '%' 
      : '0%';

    // 5. Contactos únicos (Basado en la columna 'phone')
    const activeContactsRaw = await this.messageRepo
      .createQueryBuilder('message')
      .select('COUNT(DISTINCT message.phone)', 'count')
      .getRawOne();

    return {
      sentToday,
      activeContacts: parseInt(activeContactsRaw.count) || 0,
      deliveryRate,
      templateCount,
      chartData: rawChartData.map(item => ({
        day: item.day,
        envios: parseInt(item.envios)
      }))
    };
  }

  // Crear plantilla
  async createTemplate(name: string, content: string) {
    const template = this.templateRepo.create({ name, content });
    return await this.templateRepo.save(template);
  }

  // Listar plantillas
  async findAllTemplates() {
    return await this.templateRepo.find({ order: { createdAt: 'DESC' } });
  }

  // Eliminar plantilla
  async deleteTemplate(id: number) {
    return await this.templateRepo.delete(id);
  }

  // Extraer variables de un texto (ej: {{nombre}} -> nombre)
  extractVariables(content: string): string[] {
    const matches = content.match(/{{(\w+)}}/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }

  // Validar si el CSV tiene las columnas necesarias para las plantillas seleccionadas
  async validateTemplatesWithColumns(columns: string[], templateIds: number[]) {
    const templates = await this.templateRepo.find({
      where: { id: In(templateIds) }
    });

    const details = templates.map(template => {
      const requiredVars = this.extractVariables(template.content);
      const missingVars = requiredVars.filter(v => !columns.includes(v));
      
      return {
        id: template.id,
        name: template.name,
        isValid: missingVars.length === 0,
        missingVariables: missingVars,
      };
    });

    return {
      canProceed: !details.some(d => !d.isValid),
      details
    };
  }
}