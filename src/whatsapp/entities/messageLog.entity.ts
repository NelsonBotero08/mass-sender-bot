// entities/messageLog.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('message_logs')
export class MessageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_number: string;

  @Column({ type: 'text' })
  message: string;

  @Column()
  direction: 'IN' | 'OUT'; // IN: Usuario -> Bot, OUT: Bot -> Usuario

  @Column({ default: false })
  is_automated: boolean; // True si lo respondió Lucía

  @CreateDateColumn()
  created_at: Date;
}