import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Message } from './entities/message.entity';
import { Conversation } from './entities/conversation.entity';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs'; // Necesario para borrar la carpeta
import * as path from 'path';

@Injectable()
export class WhatsappService { // Quitamos OnModuleInit
  private readonly logger = new Logger(WhatsappService.name);
  private lastQr: string | null = null;
  private connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' = 'DISCONNECTED';
  public socket: any;

  constructor(
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
  ) {}

  // Este método ahora es el que tú disparas manualmente
  async initialize() {
    if (this.connectionStatus === 'CONNECTED' || this.connectionStatus === 'CONNECTING') {
      return { message: 'La conexión ya está en curso o activa' };
    }

    this.connectionStatus = 'CONNECTING';
    await this.connectToWhatsApp();
    return { message: 'Iniciando conexión...' };
  }

  async connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      printQRInTerminal: true,
      auth: state,
      logger: require('pino')({ level: 'silent' }),
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            this.lastQr = qr;
            // Opcional: Si quieres que salga en consola PERO SOLO cuando lo pides
            this.logger.log('Nuevo QR generado para escanear.');
        }
        if (connection === 'open') {
            this.connectionStatus = 'CONNECTED';
            this.lastQr = null;
        }
    });;

    this.socket.ev.on('messages.update', async (updates) => {
        for (const { key, update } of updates) {
            if (update.status) {
            // Baileys status: 2 = Entregado (Doble check gris), 3 = Leído (Doble check azul)
            await this.messageRepo.update(
                { whatsappId: key.id }, // Buscamos por el ID que guardamos al enviar
                { ack: update.status }
            );
            this.logger.debug(`Estado de mensaje ${key.id} actualizado a: ${update.status}`);
            }
        }
});

    this.listenToMessages();
  }

  private listenToMessages() {
    this.socket.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || !msg.key.remoteJid) return;

      const remoteJid = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;

      // 1. SI YO ESCRIBO (Intervención humana)
      if (isFromMe) {
        await this.convRepo.save({ 
          phone: remoteJid, 
          botActive: false 
        });
        this.logger.log(`Bot desactivado para ${remoteJid} por intervención humana.`);
        return;
      }

      // 2. BUSCAR ESTADO DE LA CONVERSACIÓN
      let conversation = await this.convRepo.findOne({ where: { phone: remoteJid } });

      if (!conversation) {
        conversation = await this.convRepo.save({ phone: remoteJid, botActive: true });
      }

      // 3. SI EL BOT ESTÁ APAGADO, NO HACER NADA
      if (!conversation.botActive) return;

      // 4. RESPUESTA AUTOMÁTICA
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      
      // Si pide asesor manualmente
      if (text.toLowerCase().includes('asesor')) {
        await this.convRepo.save({ phone: remoteJid, botActive: false });
        await this.socket.sendMessage(remoteJid, { text: 'Entendido. En breve un asesor humano te contactará.' });
        return;
      }

      await this.sendBotResponse(remoteJid, msg.pushName || 'cliente');
    });
  }

  private async sendBotResponse(remoteJid: string, name: string) {
    try {
      await this.socket.sendPresenceUpdate('composing', remoteJid);
      
      // Delay humano aleatorio
      const typingDelay = Math.floor(Math.random() * (8000 - 4000 + 1) + 4000);
      await delay(typingDelay);

      await this.socket.sendMessage(remoteJid, { 
        text: `Hola ${name}, gracias por tu mensaje. Soy un bot. Escribe "ASESOR" si necesitas hablar con alguien.` 
      });

      await this.socket.sendPresenceUpdate('paused', remoteJid);
    } catch (error) {
      this.logger.error('Error en respuesta del bot', error);
    }
  }

  async sendMassMessages(contacts: any[], template: string) {
    this.logger.log(`Iniciando envío masivo a ${contacts.length} contactos...`);

    for (let i = 0; i < contacts.length; i++) {
        // Límite de seguridad
        if (i >= 50) {
        this.logger.warn('Se alcanzó el límite de 50 mensajes diarios.');
        break;
        }

        const { telefono, nombre } = contacts[i];
        const jid = `${telefono}@s.whatsapp.net`;
        
        // Personalizar el mensaje
        const messageText = template.replace('{{nombre}}', nombre || 'cliente');

        try {
        // Enviar mensaje
        const sentMsg = await this.socket.sendMessage(jid, { text: messageText });

        // Guardar registro en DB
        await this.messageRepo.save({
            phone: telefono,
            contactName: nombre,
            content: messageText,
            status: 'SENT',
            whatsappId: sentMsg.key.id
        });

        this.logger.log(`Mensaje ${i + 1} enviado a ${telefono}`);

        // Delay humano aleatorio entre 60 y 90 segundos
        if (i < contacts.length - 1) {
            const delayMs = Math.floor(Math.random() * (90000 - 60000 + 1) + 60000);
            this.logger.log(`Esperando ${delayMs / 1000} segundos...`);
            await delay(delayMs);
        }
        } catch (error) {
        this.logger.error(`Error enviando a ${telefono}:`, error);
        }
     }
    }

    getStatus() {
        return {
        status: this.connectionStatus,
        qr: this.lastQr
        };
    
    }

    async logout() {
    try {
      // 1. Cerramos la conexión si existe
      if (this.socket) {
        this.socket.logout(); // Esto avisa a WhatsApp que nos desconectamos
        this.socket.end();
      }

      // 2. Reseteamos estados locales
      this.connectionStatus = 'DISCONNECTED';
      this.lastQr = null;

      // 3. Borramos la carpeta de sesión de forma recursiva
      const sessionPath = path.join(process.cwd(), 'auth_info_baileys');
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        this.logger.log('Sesión de WhatsApp eliminada correctamente.');
      }

      return { success: true, message: 'Sesión cerrada y credenciales eliminadas.' };
    } catch (error) {
      this.logger.error('Error durante el logout', error);
      return { success: false, message: 'Error al intentar cerrar sesión.' };
    }
  }
}   