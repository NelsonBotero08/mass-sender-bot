import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Template } from '../whatsapp/entities/template.entity';

@Injectable()
export class BulkService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
  ) {}

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