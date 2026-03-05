import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Index(['phone', 'sentAt'])
@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  phone: string;

  @Column({ nullable: true })
  contactName: string;

  @Column('text')
  content: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ default: 1 }) // 1 = Pendiente/Enviado por el servidor
  ack: number;

  @Column({ default: 'OUTGOING' }) // ← campo nuevo
  type: string;

  @Column({ nullable: true })
  whatsappId: string;

  @CreateDateColumn()
  sentAt: Date;
}