import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { parse } from 'csv-parse/sync';

interface CsvContact {
  telefono: string;
  nombre?: string;
  categoria?: string;
}

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
  ) {}

  async findPaginated(query: string = '', page: number = 1, limit: number = 20, categoria?: string) {
    const skip = (page - 1) * limit;

    // Construimos las condiciones de búsqueda
    const whereCondition: any = { active: true };
    
    if (categoria) {
      whereCondition.categoria = categoria;
    }

    // Si hay un término de búsqueda, buscamos en nombre o teléfono
    const [data, total] = await this.contactRepo.findAndCount({
      where: query ? [
        { ...whereCondition, nombre: Like(`%${query}%`) },
        { ...whereCondition, telefono: Like(`%${query}%`) }
      ] : whereCondition,
      order: { nombre: 'ASC' },
      take: limit,
      skip: skip,
    });

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1
      }
    };
  }

  // Crear o actualizar (para no duplicar)
  async createOrUpdate(data: { telefono: string; nombre?: string; categoria?: string }) {
    return await this.contactRepo.upsert(data, ['telefono']);
  }

  // Buscar todos o por categoría
  async findAll(categoria?: string) {
    if (categoria) {
      return await this.contactRepo.find({ where: { categoria, active: true } });
    }
    return await this.contactRepo.find({ where: { active: true } });
  }

  // Buscar varios por ID (lo usaremos para la campaña)
  async findByIds(ids: number[]) {
    return await this.contactRepo.findBy({ id: In(ids) });
  }

  async createOne(data: { telefono: string; nombre: string; categoria?: string }) {
    const cleanPhone = data.telefono.replace(/\D/g, ''); 

    if (cleanPhone.length < 10) {
        throw new BadRequestException('El número debe incluir el prefijo internacional (ej: 57 para Colombia)');
    }

    const newContact = this.contactRepo.create({
        telefono: cleanPhone, 
        nombre: data.nombre,
        categoria: data.categoria || 'General',
        active: true,
    });

    return await this.contactRepo.save(newContact);
    }

    async importFromCsv(fileBuffer: Buffer) {
    try {
        const records = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
        trim: true,
        bom: true,
        }) as CsvContact[];

        let importedCount = 0;

        for (const record of records) {
        let rawPhone = String(record.telefono || '').replace(/\D/g, '');

        if (!rawPhone) continue;

        // Auto-corrección para Colombia si vienen 10 dígitos
        if (rawPhone.length === 10) {
            rawPhone = `57${rawPhone}`;
        }

        // Validación de longitud mínima después de limpiar
        if (rawPhone.length < 10) continue;

        await this.contactRepo.upsert(
            {
            telefono: rawPhone,
            nombre: record.nombre || 'Sin nombre',
            categoria: record.categoria || 'General',
            active: true,
            },
            ['telefono'], // Esto evita duplicados usando el índice único de la DB
        );
        
        importedCount++;
        }

        return {
        success: true,
        total_en_archivo: records.length,
        contactos_procesados: importedCount,
        message: `Se sincronizaron ${importedCount} contactos exitosamente.`
        };
    } catch (error) {
        throw new BadRequestException('Error al procesar el archivo CSV: ' + error.message);
    }
    }

    async update(id: number, data: { telefono?: string; nombre?: string; categoria?: string; active?: boolean }) {
  // 1. Buscamos si el contacto existe
  const contact = await this.contactRepo.findOne({ where: { id } });
  if (!contact) {
    throw new BadRequestException(`El contacto con ID ${id} no existe`);
  }

  // 2. Si viene el teléfono, lo limpiamos
  if (data.telefono) {
    data.telefono = data.telefono.replace(/\D/g, '');
    if (data.telefono.length < 10) {
      throw new BadRequestException('El número debe incluir el prefijo internacional (mínimo 10 dígitos)');
    }
  }

  // 3. Fusionamos los cambios y guardamos
  const updatedContact = this.contactRepo.merge(contact, data);
  return await this.contactRepo.save(updatedContact);
}

async remove(id: number) {
  const contact = await this.contactRepo.findOne({ where: { id } });
  if (!contact) {
    throw new BadRequestException(`El contacto con ID ${id} no existe`);
  }
  
  // Opción A: Borrado físico
  // return await this.contactRepo.remove(contact);

  // Opción B: Borrado lógico (recomendado para no romper reportes antiguos)
  contact.active = false;
  return await this.contactRepo.save(contact);
}
}