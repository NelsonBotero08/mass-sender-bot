// src/whatsapp/entities/template.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; 

  @Column('text')
  content: string; 

  @Column({ default: true })
  isActive: boolean; 

  @CreateDateColumn()
  createdAt: Date;
}