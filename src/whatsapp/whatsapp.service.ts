import { Injectable, OnModuleInit, Logger, forwardRef, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
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
      printQRInTerminal: false, 
      auth: state,
      logger: require('pino')({ level: 'silent' }),
      browser: ['Chrome', 'MacOS', '10.15.7'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      shouldIgnoreJid: (jid) => jid.includes('@broadcast'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
    });

    this.socket.ev.on('creds.update', saveCreds);
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.lastQr = qr;
        this.logger.log('📲 Nuevo QR generado.');
        qrcodeTerminal.generate(qr, { small: true });
      }
      if (connection === 'open') {
        this.connectionStatus = 'CONNECTED';
        this.lastQr = null;
        this.reconnectAttempts = 0; 
        this.logger.log('✅ WhatsApp conectado exitosamente.');
      }
      if (connection === 'close') {
        this.connectionStatus = 'DISCONNECTED';
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        this.logger.warn(`🔌 Conexión cerrada. Código: ${statusCode}`);
        if (statusCode === DisconnectReason.loggedOut) {
          this.logger.warn('🚪 Logout real. Reseteando auth...');
          await this.resetAuth();
        } else if (statusCode === 515 || statusCode === 401) {
          this.logger.warn(`⚠️ Error ${statusCode} - Reconectando sin borrar sesión...`);
          this.reconnectAttempts++;
          const waitTime = Math.min(5000 * this.reconnectAttempts, 30000);
          setTimeout(() => this.connectToWhatsApp(), waitTime);
        } else {
          this.reconnectAttempts++;
          if (this.reconnectAttempts > 10) {
            this.logger.error('🔴 Demasiados intentos de reconexión. Deteniendo.');
            this.connectionStatus = 'DISCONNECTED';
            return;
          }
          const waitTime = Math.min(5000 * this.reconnectAttempts, 30000);
          setTimeout(() => this.connectToWhatsApp(), waitTime);
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
      const cleanId = this.getCleanId(remoteJid);
      const messageId = msg.key.id || '';
      if (msg.key.fromMe) {

        const messageId = msg.key.id || '';
        const isSentByMyCode = messageId.startsWith('BAE5') || messageId.startsWith('3EB0') || messageId.startsWith('3A');
        if (isSentByMyCode) {
          this.logger.debug(`🤖 Mensaje de sistema ignorado para DB de estados: ${messageId}`);
          return;
        }

        this.logger.log(`🕵️‍♂️ Intervención manual detectada. Desactivando bot para ${cleanId}`);
        await this.statusRepo.upsert(
          { user_number: cleanId, estatus: 0, updated_at: new Date() },
          ['user_number']
        );
        return;
      }

      if (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') return;
      
      const botStatus = await this.statusRepo.findOne({ where: { user_number: cleanId } });
      
      if (botStatus && botStatus.estatus === 0) {
        this.logger.log(`🚫 Bot silenciado para ${cleanId}.`);
        return;
      }
      const body = (msg.message.conversation || msg.message.extendedTextMessage?.text ||"").trim();
      if (!body) return;
      this.logger.log(`📩 Cliente ${cleanId} dice: ${body}`);
      await this.chatbotService.handleBotLogic(remoteJid, body);
    });
  }


  async sendMessage(phone: string, text: string, imagePath?: string, isAuto = false) {
    if (!this.socket) {
      this.logger.error("❌ No hay socket de WhatsApp activo");
      return null;
    }

    try {
      // 1. LIMPIEZA CRÍTICA DE JID: Extraemos solo los números
      // Esto elimina @lid, @s.whatsapp.net o cualquier otro sufijo
      const cleanNumber = phone.split('@')[0];
      const jid = `${cleanNumber}@s.whatsapp.net`;

      this.logger.log(`📤 Enviando mensaje a: ${jid} (Modo Auto: ${isAuto})`);

      // 2. Simulación de presencia: "escribiendo..."
      await this.socket.sendPresenceUpdate('composing', jid);
      
      // Delay inicial de seguridad (humano)
      await delay(1500);

      let sentMsg;

      if (imagePath) {
        // Si hay imagen, simulamos tiempo de carga
        await delay(2000); 

        sentMsg = await this.socket.sendMessage(jid, {
          image: { url: imagePath }, 
          caption: text || '' 
        });
      } else {
        // Si es texto, calculamos tiempo de escritura basado en la longitud
        const typingTime = Math.min((text?.length || 10) * 50, 4000);
        await delay(typingTime);

        sentMsg = await this.socket.sendMessage(jid, { text: text || '' });
      }

      // 3. Finalizar estado de escritura
      await this.socket.sendPresenceUpdate('paused', jid);

      return sentMsg;

    } catch (error: any) {
      this.logger.error(`❌ Error enviando a ${phone}: ${error.message}`);
      return null;
    }
  }

  async sendMassMessages(contacts: any[], customTemplates: string[] = [], imagePaths: string[] = []) {
  try {
    if (!this.socket) return;
    this.logger.log(`🚀 Iniciando envío masivo a ${contacts.length} contactos.`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const jid = `${contact.telefono}@s.whatsapp.net`;

      // 🛡️ LÓGICA ANTIDUPLICADO
      const alreadySent = await this.messageRepo.findOne({
        where: {
          phone: contact.telefono,
          type: 'OUTGOING',
          status: 'SENT',
          sentAt: MoreThanOrEqual(today)
        }
      });

      if (alreadySent) {
        this.logger.log(`⏭️ Saltando ${contact.telefono}, ya enviado hoy.`);
        continue;
      }

      // --- 🛠️ PROTECCIÓN DE ROTACIÓN (Aquí estaba el Error 500) ---
      
      // Solo calculamos texto si hay plantillas
      let messageText = '';
      if (customTemplates && customTemplates.length > 0) {
        const templateIndex = i % customTemplates.length;
        messageText = this.parseTemplate(customTemplates[templateIndex], contact);
      }

      // Solo calculamos imagen si hay imágenes
      let finalImagePath: string | undefined = undefined;
      if (imagePaths && imagePaths.length > 0) {
        const rawImagePath = imagePaths[i % imagePaths.length];
        finalImagePath = path.isAbsolute(rawImagePath) ? rawImagePath : path.resolve(rawImagePath);
      }

      this.logger.log(`📝 Procesando ${i + 1}/${contacts.length} para ${contact.telefono}...`);

      try {
        const sentMsg = await this.sendMessage(jid, messageText, finalImagePath);

        if (sentMsg) {
          await this.messageRepo.save({
            phone: contact.telefono,
            content: (messageText || 'Sin texto') + (finalImagePath ? ' [IMAGEN]' : ''),
            status: 'SENT',
            sentAt: new Date(),
            type: 'OUTGOING'
          });
          this.logger.log(`✅ Enviado a ${contact.telefono}`);
        }

        // Intervalo aleatorio anti-bloqueo
        if (i < contacts.length - 1) {
          const waitTime = Math.floor(Math.random() * (95000 - 45000 + 1)) + 45000;
          this.logger.log(`⏳ Esperando ${waitTime / 1000}s...`);
          await delay(waitTime);
        }

      } catch (e: any) {
        this.logger.error(`❌ Fallo en ${contact.telefono}: ${e.message}`);
        await this.messageRepo.save({
          phone: contact.telefono,
          content: messageText || 'Fallo en envío',
          status: 'FAILED',
          sentAt: new Date(),
          type: 'OUTGOING'
        }).catch(() => {});
      }
    }
    this.logger.log('🏁 Proceso masivo finalizado.');
  } catch (error: any) {
    this.logger.error(`❌ Error crítico en envío masivo: ${error.message}`);
  }
}

  // Función auxiliar para procesar múltiples variables
  private parseTemplate(content: string, variables: any): string {
    return content.replace(/{{(\w+)}}/g, (match, key) => {
      const value = variables[key];
      
      return (value !== null && value !== undefined) ? String(value) : ''; 
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
      await this.statusRepo.clear();
      this.logger.log('✅ Tabla BotStatus vaciada exitosamente.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`❌ Falló la limpieza de la tabla: ${msg}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleClearUploads() {
    this.logger.log('🧹 Iniciando limpieza diaria de carpeta de imágenes...');
    const directory = path.resolve(process.cwd(), 'uploads');

    try {
      if (fs.existsSync(directory)) {
        const files = fs.readdirSync(directory);
        for (const file of files) {
          // Evitamos borrar archivos ocultos como .gitignore si existieran
          if (file !== '.gitignore') {
            fs.unlinkSync(path.join(directory, file));
          }
        }
        this.logger.log(`✅ Carpeta de imágenes limpia: ${files.length} archivos eliminados.`);
      }
    } catch (error:any) {
      this.logger.error(`❌ Error limpiando carpeta uploads: ${error.message}`);
    }
  }


  private getCleanId(remoteJid: string): string {
    let id = remoteJid.split('@')[0];

    if (id.includes(':')) {
      id = id.split(':')[0];
    }
    return id;
  }


  async clearAuthFolder(): Promise<{ success: boolean; message: string }> {
    try {
      await this.destroySocket();
      
      if (fs.existsSync(this.authPath)) {
        fs.rmSync(this.authPath, { recursive: true, force: true });
        this.logger.warn('🗑️ Carpeta auth eliminada manualmente desde el front.');
      }
      
      this.connectionStatus = 'IDLE';
      this.lastQr = null;
      this.reconnectAttempts = 0;
      
      return { success: true, message: 'Sesión eliminada. Ya puedes escanear un QR nuevo.' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`❌ Error al limpiar auth: ${msg}`);
      return { success: false, message: msg };
    }
  }

  async getDetailedReport(page: number, limit: number, fromDate?: string, toDate?: string, phone?: string) {
    const query = this.messageRepo.createQueryBuilder('msg')
      .where('msg.type = :type', { type: 'OUTGOING' });

    // 1. Filtro por Teléfono (si se proporciona)
    if (phone) {
      // Usamos LIKE por si el número viene con prefijo o quieres búsqueda parcial
      query.andWhere('msg.phone LIKE :phone', { phone: `%${phone}%` });
    }

    // 2. Filtro por Fechas
    if (fromDate && toDate) {
      // 1. Forzamos el inicio a las 00:00:00.000
      const start = new Date(fromDate);
      start.setUTCHours(0, 0, 0, 0); 

      // 2. Forzamos el fin a las 23:59:59.999
      const end = new Date(toDate);
      end.setUTCHours(23, 59, 59, 999);

      query.andWhere('msg.sentAt BETWEEN :start AND :end', { start, end });
    }

    // 3. Obtener Resumen General con los filtros aplicados
    const stats = await query
      .clone()
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE status = :sent)', 'sentCount')
      .addSelect('COUNT(*) FILTER (WHERE status = :failed)', 'failedCount')
      .setParameters({ sent: 'SENT', failed: 'FAILED' })
      .getRawOne();

    const totalCount = parseInt(stats.total) || 0;

    // 4. Obtener Lista Detallada con Paginación
    const details = await query
      .select(['msg.sentAt', 'msg.phone', 'msg.content', 'msg.status'])
      .orderBy('msg.sentAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      filtros_aplicados: {
        busqueda_telefono: phone || 'Ninguna',
        rango_fechas: fromDate ? `${fromDate} a ${toDate}` : 'Todo el historial'
      },
      resumen: {
        total_encontrados: totalCount,
        exitosos: parseInt(stats.sentCount) || 0,
        fallidos: parseInt(stats.failedCount) || 0,
      },
      paginacion: {
        total_items: totalCount,
        total_paginas: Math.ceil(totalCount / limit),
        pagina_actual: page,
        items_por_pagina: limit
      },
      detalle: details.map(m => ({
        fecha: m.sentAt.toLocaleString(), 
        telefono: m.phone,
        mensaje: m.content,
        estado: m.status === 'SENT' ? '✅ Enviado' : '❌ Fallido'
      }))
    };
  }
}