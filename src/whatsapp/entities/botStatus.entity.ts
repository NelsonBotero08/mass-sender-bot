import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('bot_status')
export class BotStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  user_number: string;

  @Column({ default: 1 })
  menu: number;

  @Column({ default: 1 })
  estatus: number; 

  @Column({ default: 0 })
  intentos_opciones: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}