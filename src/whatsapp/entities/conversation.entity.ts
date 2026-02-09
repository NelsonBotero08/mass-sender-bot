import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Conversation {
  @PrimaryColumn()
  phone: string; // El número es la llave primaria

  @Column({ default: true })
  botActive: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}