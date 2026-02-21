import { Injectable, OnModuleInit, Logger, forwardRef, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion,
  delay,
  WASocket,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Message } from './entities/message.entity';
import { Conversation } from './entities/conversation.entity';
import * as fs from 'fs';
import * as path from 'path';
import { Template } from './entities/template.entity';
import { BotStatus } from './entities/botStatus.entity';
import { ChatbotService } from './chatBot.service';
import * as qrcodeTerminal from 'qrcode-terminal';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private lastQr: string | null = null;
  private connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'IDLE' = 'IDLE';
  private reconnectAttempts = 0;
  private readonly authPath = path.join(process.cwd(), 'auth_info_baileys');
  public socket: WASocket | null = null;

  private botEnabled = true;


  constructor(
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    @InjectRepository(BotStatus) private statusRepo: Repository<BotStatus>,

    @Inject(forwardRef(() => ChatbotService)) // 2. Inyecta con forwardRef
    private readonly chatbotService: ChatbotService,
  ) {}

  // AUTO-ARRANQUE: Si hay sesión, conecta solo al prender el servidor
 async onModuleInit() {
    const credsPath = path.join(this.authPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
      this.logger.log('📦 Sesión previa detectada. Conectando automáticamente...');
      this.connectToWhatsApp();
    }
  }

  async initialize() {
    if (this.connectionStatus === 'CONNECTED' || this.connectionStatus === 'CONNECTING') {
      return { message: 'La conexión ya está activa o en curso' };
    }
    await this.connectToWhatsApp();
    return { message: 'Iniciando conexión...' };
  }

  async connectToWhatsApp() {
    await this.destroySocket();
    this.connectionStatus = 'CONNECTING';

    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      printQRInTerminal: false, // Lo manejaremos manualmente para controlarlo mejor
      auth: state,
      logger: require('pino')({ level: 'silent' }),
      browser: ['Chrome', 'MacOS', '10.15.7'],
      // CONFIGURACIÓN ANTI-DETECCIÓN
      syncFullHistory: false,
      markOnlineOnConnect: false,
      shouldIgnoreJid: (jid) => jid.includes('@broadcast'),
      
      // En lugar de getNextRetryingIn, usamos configuraciones estándar de conexión
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.lastQr = qr;
        this.logger.log('📲 Nuevo QR generado. Escanéalo en la terminal o el dashboard:');
        // Imprime el QR en la terminal del servidor
        qrcodeTerminal.generate(qr, { small: true });
      }

      if (connection === 'open') {
        this.connectionStatus = 'CONNECTED';
        this.lastQr = null;
        this.logger.log('✅ WhatsApp conectado exitosamente.');
      }

      if (connection === 'close') {
        this.connectionStatus = 'DISCONNECTED';
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          await this.resetAuth();
        } else {
          this.reconnectAttempts++;
          setTimeout(() => this.connectToWhatsApp(), 5000);
        }
      }
    });

    this.listenToMessages();
  }

  private listenToMessages() {
    if (!this.socket) return;

    this.socket.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || !msg.key.remoteJid) return;

      

      const remoteJid = msg.key.remoteJid;
      const cleanId = this.getCleanId(remoteJid); // ID "limpio" (puede ser el número o el LID)
      const messageId = msg.key.id || '';

      // 1. DETECTAR SI EL MENSAJE PROVIENE DE "MI" (fromMe)
      if (msg.key.fromMe) {
        const messageId = msg.key.id || '';
        // Detectamos si es un mensaje de sistema
        const isSentByMyCode = messageId.startsWith('BAE5') || messageId.startsWith('3EB0') || messageId.startsWith('3A');

        if (isSentByMyCode) {
          // 🚀 IMPORTANTE: Si es masivo o respuesta del bot, salimos SIN guardar nada en statusRepo
          this.logger.debug(`🤖 Mensaje de sistema ignorado para DB de estados: ${messageId}`);
          return; 
        }

        // Si llegamos aquí, es porque tú escribiste manualmente desde el celular
        this.logger.log(`🕵️‍♂️ Intervención manual detectada. Desactivando bot para ${cleanId}`);
        await this.statusRepo.upsert(
          { user_number: cleanId, estatus: 0, updated_at: new Date() },
          ['user_number']
        );
        return; 
      }

      // 2. FILTROS DE SEGURIDAD (Grupos y estados)
      if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;

      // 3. VALIDAR SI EL BOT ESTÁ SILENCIADO EN DB
      const botStatus = await this.statusRepo.findOne({ where: { user_number: cleanId } });
      if (botStatus && botStatus.estatus === 0) {
        this.logger.log(`🚫 Bot silenciado para ${cleanId}.`);
        return;
      }

      // 4. PROCESAR MENSAJE DEL CLIENTE
      const body = (msg.message.conversation || 
                    msg.message.extendedTextMessage?.text || 
                    "").trim();

      if (!body) return;

      this.logger.log(`📩 Cliente ${cleanId} dice: ${body}`);
      await this.chatbotService.handleBotLogic(remoteJid, body);
    });
  }

  async sendMessage(phone: string, text: string) {
    if (!this.socket) return;
    try {
      const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
      
      // Simulación humana
      await delay(1500);
      await this.socket.sendPresenceUpdate('composing', jid);
      
      const typingTime = Math.min(text.length * 50, 5000);
      await delay(typingTime);

      const sentMsg = await this.socket.sendMessage(jid, { text });
      await this.socket.sendPresenceUpdate('paused', jid);
      return sentMsg;
    } catch (error) {
      this.logger.error(`Error enviando mensaje: ${error.message}`);
    }
  }

  async sendMassMessages(contacts: any[], customTemplates: string[]) {
    if (!this.socket) return;

    this.logger.log(`🚀 Iniciando envío masivo a ${contacts.length} contactos con rotación secuencial.`);

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const jid = `${contact.telefono}@s.whatsapp.net`;

        // 🔄 LOGICA DE ROTACIÓN SECUENCIAL:
        // El operador % (módulo) asegura que si i=0 usa la plantilla 0, i=1 la 1, etc.
        // Cuando i llega al total de plantillas, vuelve a empezar desde 0.
        const templateIndex = i % customTemplates.length;
        const rawContent = customTemplates[templateIndex];
        
        const messageText = this.parseTemplate(rawContent, contact);

        this.logger.log(`📝 Contacto ${i + 1}/${contacts.length} - Usando plantilla #${templateIndex + 1}`);

        try {
            const sentMsg = await this.sendMessage(jid, messageText);

            if (sentMsg) {
                await this.messageRepo.save({
                    phone: contact.telefono,
                    content: messageText,
                    status: 'SENT',
                    timestamp: new Date(),
                    type: 'OUTGOING'
                });
            }

            // Intervalo anti-bloqueo
            if (i < contacts.length - 1) {
                const waitTime = Math.floor(Math.random() * (95000 - 45000 + 1)) + 45000;
                this.logger.log(`⏳ Esperando ${waitTime / 1000}s...`);
                await delay(waitTime);
            }
        } catch (e) {
            this.logger.error(`❌ Error en ${contact.telefono}: ${e.message}`);
        }
    }
  }

// Función auxiliar para procesar múltiples variables
private parseTemplate(content: string, variables: any): string {
  // Esta regex busca cualquier texto dentro de {{ }}
  return content.replace(/{{(\w+)}}/g, (match, key) => {
    // Si la variable existe en el contacto (ej. variables['nombre']), la pone. 
    // Si no, deja el marcador o un espacio en blanco.
    return variables[key] !== undefined ? variables[key] : match;
  });
}

  async resetAuth() {
    await this.destroySocket();
    if (fs.existsSync(this.authPath)) {
      fs.rmSync(this.authPath, { recursive: true, force: true });
    }
    this.connectionStatus = 'IDLE';
    this.lastQr = null;
    this.logger.warn('Sesión reseteada completamente.');
  }

  async logout() {
    if (this.socket) {
      try { await this.socket.logout(); } catch (e) {}
    }
    await this.resetAuth();
    return { success: true };
  }

  private async destroySocket() {
    if (this.socket) {
      this.socket.ev.removeAllListeners('connection.update');
      this.socket.ev.removeAllListeners('creds.update');
      this.socket.ev.removeAllListeners('messages.upsert');
      this.socket.ev.removeAllListeners('messages.update');
      this.socket.end(undefined);
      this.socket = null;
    }
  }

  getStatus() {
    return { status: this.connectionStatus, qr: this.lastQr };
  }

  extractVariables(content: string): string[] {
    const matches = content.match(/{{(\w+)}}/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }

@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyReset() {
    this.logger.log('🧹 Ejecutando limpieza total de BotStatus (Truncate)...');
    
    try {
      // .clear() es el equivalente a un TRUNCATE en SQL
      await this.statusRepo.clear();
      
      this.logger.log('✅ Tabla BotStatus vaciada exitosamente.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`❌ Falló la limpieza de la tabla: ${msg}`);
    }
  }

  private getCleanId(remoteJid: string): string {
    // 1. Quitamos el dominio (@s.whatsapp.net, @lid, etc)
    let id = remoteJid.split('@')[0];
    
    // 2. Si viene con el sufijo de dispositivo (ej: 57300123:1), quitamos lo que sigue al ':'
    if (id.includes(':')) {
      id = id.split(':')[0];
    }
    
    return id;
  }
}