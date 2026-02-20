import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotStatus } from './entities/botStatus.entity'; 
import { WhatsappService } from './whatsapp.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectRepository(BotStatus)
    private readonly statusRepo: Repository<BotStatus>,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  async handleBotLogic(from: string, body: string) {
  // 1. BUSCAR al usuario tal cual viene (sea @lid o @s.whatsapp.net)
  let status = await this.statusRepo.findOne({ where: { user_number: from } });

  // 2. Si no existe, crearlo con el ID exacto que recibimos
  if (!status) {
    status = await this.statusRepo.save({
      user_number: from,
      menu: 1,
      estatus: 1,
      bot: 'principal'
    });
    return this.sendMenu1(from);
  }

  // 3. Si el bot está apagado (estatus 0), no responder
  if (Number(status.estatus) !== 1) return;

  // 4. LIMPIEZA DE LA OPCIÓN
  // Quitamos espacios, emojis y dejamos solo números/letras
  const option = body.trim().toUpperCase().replace(/[^\w\s]/gi, '');
  
  this.logger.log(`🤖 Procesando [${option}] para el usuario ${from} en Menú ${status.menu}`);

  switch (status.menu) {
    case 1:
      // Usamos el 'from' original para responder al ID correcto (@lid o @s.whatsapp.net)
      if (option === '1') {
        await this.statusRepo.update({ user_number: from }, { menu: 2 });
        await this.sendMenu2(from);
      } else if (option === '2') {
        await this.whatsappService.sendMessage(from, "Entendido. Estaremos listos cuando decidas escalar tu producción. ¡Feliz día! 😊");
        await this.statusRepo.update({ user_number: from }, { estatus: 0 });
      } else {
        await this.whatsappService.sendMessage(from, "⚠️ Por favor, selecciona una opción válida (1 o 2).");
      }
      break;

    case 2:
      await this.handleMenu2(from, option);
      break;

    case 3:
      await this.handleMenu3(from, body);
      break;
  }
}

  // --- CONTROLADORES DE MENÚ ---

  private async sendMenu1(jid: string) {
    const message = `¡Hola! Gracias por escribir 👋 En *Marca-tex* le ponemos el sello final a tus creaciones con la mejor calidad en marquillas 🧵.

⚠️ *IMPORTANTE:* Nuestra fabricación mínima es de *300 metros lineales*.

¿Deseas continuar con tu cotización?
1️⃣ Sí, acepto las condiciones.
2️⃣ No por el momento.`;
    await this.whatsappService.sendMessage(jid, message);
  }

  private async handleMenu1(jid: string, option: string) {
    if (option === '1') {
      await this.statusRepo.update({ user_number: jid }, { menu: 2 });
      await this.sendMenu2(jid);
    } else if (option === '2') {
      await this.whatsappService.sendMessage(jid, "Entendido. Estaremos listos cuando decidas escalar tu producción. ¡Feliz día! 😊");
      await this.statusRepo.update({ user_number: jid }, { estatus: 0 }); 
    } else {
      await this.whatsappService.sendMessage(jid, "⚠️ Por favor, selecciona una opción válida escribiendo el número *1* o *2*.");
    }
  }

  private async sendMenu2(jid: string) {
    const message = `¡Excelente elección! 🚀 Aquí tienes el rendimiento aproximado por cada metro según el ancho.

*Selecciona el ancho para tu pedido de 300m:*

A) *1.2 cm:* ~24,900 unidades.
B) *1.5 cm:* ~19,800 unidades.
C) *2.2 cm:* ~13,500 unidades.
D) *2.5 cm:* ~12,000 unidades.
E) *3.2 cm:* ~9,300 unidades.
F) *5.0 cm:* ~6,000 unidades.
G) Otra medida / No estoy seguro.

*Escribe la letra de tu opción:*`;
    await this.whatsappService.sendMessage(jid, message);
  }

  private async handleMenu2(jid: string, option: string) {
    const validOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    
    if (validOptions.includes(option)) {
      await this.statusRepo.update({ user_number: jid }, { menu: 3 });
      const nextMsg = `¡Perfecto! Ahora hablemos del diseño y acabado. 🎨

Por favor, envíanos en un solo mensaje:
1️⃣ ¿Cómo prefieres la entrega? (Rollo, Cortadas o Doblez).
2️⃣ ¿Qué tipo de suavidad buscas? (Premium o Estándar).
3️⃣ ¿Cuántos colores tiene tu logo?

*Y lo más importante: ¡Adjunta la imagen de tu logo aquí abajo!* 👇`;
      await this.whatsappService.sendMessage(jid, nextMsg);
    } else {
      await this.whatsappService.sendMessage(jid, "⚠️ Por favor, selecciona una letra válida (A, B, C, D, E, F o G).");
    }
  }

  private async handleMenu3(jid: string, body: string) {
    // Aquí se apaga el bot para que el asesor entre a revisar los detalles
    await this.whatsappService.sendMessage(jid, `¡Información recibida! 📩 Un asesor de *Marca-tex* revisará tu logo y los detalles técnicos.

En breve te contactaremos para finalizar tu presupuesto. 🧵✨`);

    await this.statusRepo.update({ user_number: jid }, { estatus: 0, menu: 4 });
  }
}