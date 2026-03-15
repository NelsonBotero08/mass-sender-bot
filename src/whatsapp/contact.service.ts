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

  // async findPaginated(query: string = '', page: number = 1, limit: number = 20, categoria?: string) {
  //   const skip = (page - 1) * limit;

  //   // Construimos las condiciones de búsqueda
  //   const whereCondition: any = { active: true };
    
  //   if (categoria) {
  //     whereCondition.categoria = categoria;
  //   }

  //   // Si hay un término de búsqueda, buscamos en nombre o teléfono
  //   const [data, total] = await this.contactRepo.findAndCount({
  //     where: query ? [
  //       { ...whereCondition, nombre: Like(`%${query}%`) },
  //       { ...whereCondition, telefono: Like(`%${query}%`) }
  //     ] : whereCondition,
  //     order: { nombre: 'ASC' },
  //     take: limit,
  //     skip: skip,
  //   });

  //   return {
  //     data,
  //     meta: {
  //       total,
  //       page,
  //       lastPage: Math.ceil(total / limit),
  //       hasNextPage: page * limit < total,
  //       hasPreviousPage: page > 1
  //     }
  //   };
  // }

 async findPaginated(
    search?: string, 
    page: number = 1, 
    limit: number = 50, 
    categoria?: string,
    excludeDays: number = 0
  ) {
    const query = this.contactRepo.createQueryBuilder('contact');

    // 1. Obtenemos la última fecha de envío como un campo virtual
    // Usamos comillas dobles en "sentAt" y "phone" para asegurar compatibilidad
    query.addSelect((subQuery) => {
      return subQuery
        .select('MAX("sentAt")', 'lastSent')
        .from('message', 'msg')
        .where('msg.phone = contact.telefono');
    }, 'contact_lastSent');

    // Filtro base
    query.where('contact.active = :active', { active: true });

    // 2. FILTRO DE EXCLUSIÓN (La lógica que necesitabas)
    if (excludeDays > 0) {
      const fechaLimite = new Date();
      fechaLimite.setDate(fechaLimite.getDate() - excludeDays);

      query.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('m.phone')
          .from('message', 'm')
          .where('m."sentAt" > :fechaLimite')
          .getQuery();
        return 'contact.telefono NOT IN ' + subQuery;
      }).setParameter('fechaLimite', fechaLimite);
    }

    // 3. Otros filtros
    if (search) {
      query.andWhere('(contact.nombre ILIKE :search OR contact.telefono LIKE :search)', { 
        search: `%${search}%` 
      });
    }

    if (categoria) {
      query.andWhere('contact.categoria = :categoria', { categoria });
    }

    // 4. Ejecución
    // Importante: Usamos getRawAndEntities para capturar el campo virtual 'lastSent'
    const { entities, raw } = await query
      .orderBy('contact.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    // Mapeamos el campo raw 'contact_lastSent' a la entidad para el frontend
    const data = entities.map((entity, index) => ({
      ...entity,
      lastSent: raw[index].contact_lastSent,
    }));

    const total = await query.getCount();

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
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
      }) as any[];

      let importedCount = 0;

      for (const record of records) {
        // 1. Limpieza total de caracteres no numéricos
        let rawPhone = String(record.telefono || '').replace(/\D/g, '');

        if (!rawPhone) continue;

        // 2. Validación de indicativo Colombia
        if (rawPhone.length === 10 && rawPhone.startsWith('3')) {
          rawPhone = `57${rawPhone}`;
        } else if (rawPhone.length < 10) {
          continue; 
        }

        // 3. Lógica para el nombre
        // Si el campo nombre está vacío, tiene solo espacios o es undefined, asignamos 'Sin nombre'
        const nombreFinal = (record.nombre && record.nombre.trim().length > 0) 
          ? record.nombre.trim() 
          : 'Sin nombre';

        // 4. UPSERT: Esta es la clave para la actualización
        // Si el 'telefono' ya existe, TypeORM actualizará el 'nombre' y 'categoria'
        await this.contactRepo.upsert(
          {
            telefono: rawPhone,
            nombre: nombreFinal,
            categoria: (record.categoria || 'General').trim(),
            active: true,
          },
          ['telefono'], // Columna que actúa como llave única para identificar al contacto
        );
        
        importedCount++;
      }

      return {
        success: true,
        total_en_archivo: records.length,
        contactos_procesados: importedCount,
        message: `Proceso finalizado. Se sincronizaron ${importedCount} contactos.`
      };
    } catch (error) {
      throw new BadRequestException('Error al procesar el CSV: ' + error.message);
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