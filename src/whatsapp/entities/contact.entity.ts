import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true }) // No queremos teléfonos duplicados
  telefono: string;

  @Column({ nullable: true })
  nombre: string;

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  categoria: string; // Ejemplo: 'Clientes VIP', 'Prospectos'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}