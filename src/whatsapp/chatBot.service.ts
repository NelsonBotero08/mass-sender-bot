import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotStatus } from './entities/botStatus.entity'; 
import { WhatsappService } from './whatsapp.service';
import { MessageLog } from './entities/messageLog.entity';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectRepository(BotStatus)
    private readonly statusRepo: Repository<BotStatus>,
    @InjectRepository(MessageLog)
    private readonly logRepo: Repository<MessageLog>,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  // 2. Método centralizador para enviar y registrar logs de SALIDA
  private async sendAndLog(jid: string, message: string, isAutomated = true) {
    // Guardar en BD
    await this.logRepo.save({
      user_number: jid,
      message: message,
      direction: 'OUT',
      is_automated: isAutomated,
    });

    // Enviar por WhatsApp
    return await this.whatsappService.sendMessage(jid, message);
  }

  async handleBotLogic(from: string, body: string) {

    await this.logRepo.save({
      user_number: from,
      message: body,
      direction: 'IN',
      is_automated: false,
    });

    const text = body.toLowerCase();

    // 1. Comando de escape para el usuario
    if (text.includes('asesor')) {
      await this.statusRepo.update({ user_number: from }, { estatus: 0 });
      return;
    }

    let status = await this.statusRepo.findOne({ where: { user_number: from } });

    // 2. BIENVENIDA: Si el usuario es nuevo, enviamos el Menú de Lucía
    if (!status) {
      status = await this.statusRepo.save({
        user_number: from,
        menu: 1,
        estatus: 1,
        bot: 'principal'
      });
      return this.sendMenu1(from);
    }

    if (Number(status.estatus) !== 1) return;

    const option = body.trim().replace(/[^\w\s]/gi, ''); 
    
    this.logger.log(`🤖 Lucía procesando [${option}] para ${from} en Menú ${status.menu}`);

    // 3. SWITCH DE NAVEGACIÓN
    switch (status.menu) {
      case 1:
        await this.handleMenu1(from, option);
        break;

      case 2:
        await this.handleMarquillas(from, option);
        break;

      case 4:
        await this.handleEtiquetasCarton(from, option); 
        break;  

       case 6:
        await this.handleGarras(from, option); 
        break;  
    }
  }

  // --- CONTROLADORES DE MENÚ ---

  private async sendMenu1(jid: string) {
    const message = `¡Hola! Bienvenid@ a *Marca-Tex*. 🧵 
    
  Soy *Lucía*, tu asesora experta en insumos de identificación de marca. Es un placer saludarte. 

  Por favor, escribe el *NÚMERO* del producto en el que estás interesado para darte los requisitos de fabricación:

  1️⃣ Marquillas Tejidas o Satín (Alta definición)
  2️⃣ Cartón o Etiquetas para ropa
  3️⃣ Garras Sintéticas (Cuero/Sintético)
  4️⃣ Placas en Zamak (Lujo metálico)
  5️⃣ Apliques (Brillos, PVC, Bordados e Importados)`;

    await this.sendAndLog(jid, message);
  }

  private async handleMenu1(jid: string, option: string) {
    // Evaluamos las 4 nuevas opciones
    switch (option) {
      case '1':
      await this.statusRepo.update({ user_number: jid }, { menu: 2 }); 
      const msgMarquillas = `1️⃣ *Marquillas Tejidas o Satín*
      
Te informamos que, para mantener nuestros estándares de calidad y acabados de alta costura, fabricamos pedidos a partir de *300 metros por diseño*.

Si tu pedido iguala o supera esta cantidad, selecciona una opción:
1. Sí, requiero 300m o más.
2. Busco una cantidad menor.

responde con las opciones numericas segun corresponda.`;
      await this.sendAndLog(jid, msgMarquillas);
      break;
        
      case '2':
          await this.statusRepo.update({ user_number: jid }, { menu: 4 }); 
          const msgCarton = `🏷️ *Etiquetas de Cartón / Tags*

Para mantener nuestros estándares de calidad industrial y ofrecerte el mejor precio por unidad, manejamos una producción mínima de *3.000 etiquetas por diseño*.

¿Tu pedido iguala o supera esta cantidad?
1. Sí, requiero 3.000 o más.
2. Busco una cantidad menor.

responde con las opciones numericas segun corresponda.`;
      await this.sendAndLog(jid, msgCarton);
      break;

      case '3':
          await this.statusRepo.update({ user_number: jid }, { menu: 6 });
          const msgGarras = `3️⃣ *Garras en cuero sintético*

¡Excelente elección! Nuestras garras sintéticas son ideales para darle ese toque de resistencia y exclusividad a tus jeans, chaquetas o accesorios. 🧥👞

Para garantizar la máxima precisión en el grabado o relieve de tu diseño, nuestra línea de producción especializada requiere un mínimo de *3.000 unidades por referencia*.

¿Tu proyecto requiere esta cantidad o una superior?

1. Sí, requiero 3.000 o más.
2. Busco una cantidad menor.

responde con las opciones numericas segun corresponda.`;

  await this.sendAndLog(jid, msgGarras);
  break;

      case '4':
      await this.statusRepo.update({ user_number: jid }, { menu: 8 });
      const msgZamak = `4️⃣ *Placas en Zamak (Lujo metálico)*

¡Excelente elección! Las placas en Zamak son el sello de lujo definitivo para tus prendas y accesorios. ✨

Debido al proceso de fundición y creación de moldes personalizados de alta precisión, nuestra producción mínima es de *3.000 unidades por diseño*. 🛠️

¿Tu proyecto requiere esta cantidad o una superior para iniciar la cotización?

1. Sí, requiero 3.000 o más.
2. Busco una cantidad menor.

responde con las opciones numericas segun corresponda.`;
      await this.sendAndLog(jid, msgZamak);
      break;

      case '5':
        await this.statusRepo.update({ user_number: jid }, { menu: 10 });
        const msgApliques = `5️⃣ *Apliques infantiles y camisetas*

  ¡Qué genial! Los apliques son la forma más rápida de darle identidad y valor a tus prendas. 👕✨

  Trabajamos con diferentes tecnologías. ¿Qué estilo buscas para tu colección?
  A) Brillos / Pedrería.
  B) PVC / Goma (Relieve).
  C) Bordados Personalizados.
  D) Apliques Importados (Tendencia).
  
  responde con las opciones en letra segun corresponda.
  
  puedo pasarte con un asesor para enviarte precios y tiempos de producción.`;
  
        await this.sendAndLog(jid, msgApliques);

        await this.statusRepo.update({ user_number: jid }, { estatus: 0 });
        break;

      default:
        await this.sendAndLog(jid, "⚠️ Por favor, selecciona una opción válida (1 al 5).");
        break;
    }
  }

  private async handleMarquillas(jid: string, option: string) {
    const opt = option.toUpperCase();

    if (opt === '1') {
      const msgDatos = `✅ *¡Excelente!* Para darte el presupuesto exacto de tus marquillas o manillas, por favor envíanos los siguientes datos en un solo mensaje:

  1. Medidas (Ancho x Largo).
  2. Cantidad (Mínimo sugerido).
  3. Imagen de tu logo o diseño. 📍
  
  Ancho de Marquilla,Unidades por Metro (aprox.)
      1.2 cm,80 - 83 unidades
      1.5 cm,63 - 66 unidades
      2.2 cm,43 - 45 unidades
      2.5 cm,38 - 40 unidades
      2.8 cm,34 - 35 unidades
      3.2 cm,30 - 31 unidades
      4.0 cm,24 - 25 unidades
      5.0 cm,19 - 20 unidades
      6.8 cm,14 - 15 unidades

  Realizamos envíos confiables a toda Colombia. ¡Quedamos atentos para procesar tu solicitud!

  
  👌 Con esta información puedo pasarte con un asesor para enviarte precios y tiempos de producción.`;
      
      await this.sendAndLog(jid, msgDatos);
      
      await this.statusRepo.update({ user_number: jid }, { estatus: 0, menu: 3 });

    } else if (opt === '2') {
      const msgDespedida = `¡Gracias por tu interés! 🙌
      
  En este momento nuestro proceso de producción está optimizado para pedidos desde 300 metros en adelante.

  Si en el futuro tu marca requiere esa cantidad, estaremos felices de ayudarte 💛`;
      
      await this.sendAndLog(jid, msgDespedida);
      
      await this.statusRepo.delete({ user_number: jid });

    } else {
      await this.sendAndLog(jid, "⚠️ Por favor, selecciona *1* o *2*.");
    }
  }


  private async handleEtiquetasCarton(jid: string, option: string) {
    const opt = option.toUpperCase();

    if (opt === '1') {
      // CASO SÍ: Pedir detalles técnicos
      const msgDatos = `Perfecto 🙌 ¡Podemos trabajar juntos!

  Para enviarte una cotización personalizada, cuéntame por favor en un solo mensaje:

  1️⃣ ¿Qué tamaño aproximado tendrá la etiqueta?
  2️⃣ ¿Qué tipo de acabado buscas? (Mate, brillante, laminado, relieve, foil dorado/plata, perforación, etc.)
  3️⃣ ¿Ya tienes el diseño listo en formato editable (PDF, AI, JPG)?
  4️⃣ ¿La desea con cordón?

  Con esta información te envío precios y tiempos de producción 😊`;
      
      await this.sendAndLog(jid, msgDatos);
      
      // Deshabilitamos el bot para que el asesor reciba la data
      await this.statusRepo.update({ user_number: jid }, { estatus: 0 });

    } else if (opt === '2') {
      // CASO NO: Despedida y reseteo
      const msgDespedida = `Gracias por tu interés 🙌

  Actualmente nuestra producción está enfocada en marcas que requieren 3.000 unidades en adelante, lo que nos permite garantizar calidad y precios competitivos.

  Si en el futuro tu marca requiere esa cantidad, estaremos felices de apoyarte 💛`;
      
      await this.sendAndLog(jid, msgDespedida);
      
      // Eliminamos el registro para que pueda reingresar como usuario nuevo
      await this.statusRepo.delete({ user_number: jid });

    } else {
      await this.sendAndLog(jid, "⚠️ Por favor, selecciona *1* o *2*.");
    }
  }


  private async handleGarras(jid: string, option: string) {
    const opt = option.toUpperCase();

    if (opt === '1') {
      // CASO SÍ: Recolección de detalles
      const msgDatos = `¡Perfecto! Vamos a proyectar tu marca. 🚀 Por favor, ayúdame con estos detalles en un solo mensaje para tu cotización:

  1️⃣ *Color del material:* (¿Café, negro, miel o un color especial?)
  2️⃣ *Tipo de grabado:* (¿Repujado/Relieve, grabado láser o estampado?)
  3️⃣ *Forma y medida:* (Ejemplo: Cuadrada de 4x4cm o rectangular de 6x2cm).

  *Envíanos tu logo o una referencia visual* y un asesor humano validará la viabilidad técnica de inmediato. 😊`;
      
      await this.sendAndLog(jid, msgDatos);
      
      // Deshabilitamos el bot para la intervención del asesor
      await this.statusRepo.update({ user_number: jid }, { estatus: 0 });

    } else if (opt === '2') {
      // CASO NO: Respuesta cuidando la marca y reseteo
      const msgDespedida = `"Entiendo. Por el alto costo de montaje de moldes y maquinaria para sintéticos, nuestra producción mínima es de 3.000 piezas.

  Si en el futuro tu volumen de producción aumenta, ¡en *Marca-Tex* estaremos listos para fabricar las mejores garras para tu marca! 🚀"`;
      
      await this.sendAndLog(jid, msgDespedida);
      
      // Eliminamos de la tabla de status para que pueda volver a cotizar otro producto luego
      await this.statusRepo.delete({ user_number: jid });

    } else {
      await this.sendAndLog(jid, "⚠️ Por favor, selecciona *1* o *2*.");
    }
  }
}