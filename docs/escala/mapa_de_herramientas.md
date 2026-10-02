---
documento: Escala de Rendimiento Smarteam — Mapa de herramientas
version: 1.0.0
escala: 8.7.0
fecha: 2026-10-01
estado: Borrador: lo revisa su responsable antes de usarlo con clientes
---

# Mapa de herramientas

Dónde ayuda cada herramienta en la Escala de Rendimiento, criterio por criterio. La escala no nombra herramientas; este mapa sí, y es interno: nunca va en un documento que ve el cliente.

**Lo habilita, no lo cumple.** Que una herramienta aparezca en un criterio quiere decir que trae lo que hace falta para cumplirlo. El criterio se cumple cuando el equipo lo usa: el nivel lo sigue dando la evidencia.

**Cómo se lee.** Cada herramienta trae una ficha corta y los criterios donde ayuda, con lo que aporta en cada uno. Un criterio puede estar en varias. Solo hay criterios de Funcional, Eficiente y Óptimo, porque Deficiente e Inicial describen lo que falta. Los de 101 en adelante son propios de una edición por industria.

**Cómo cambia.** Las herramientas cambian más rápido que la escala. El mapa tiene su propia versión y se publica junto con la escala, sin cambiarla.

## Insider One

*Clave:* insider
*Color:* fucsia
*Qué es:* Una plataforma que junta en una sola ficha lo que hace cada cliente, predice qué va a hacer y decide qué mostrarle o enviarle, en el sitio, la app y los mensajes.
*Cuándo conviene:* Cuando la venta la cierra el sitio o la app, hay decenas de miles de personas activas al mes y el cliente vuelve a comprar.
*Revisado:* 2026-10-01
*Responsable:* por definir

### Ventas

- `1.2.F101` Avisos automáticos de cada estado del pedido, incluso por push en la app.
- `1.2.F202` Avisos de cada cambio de la solicitud por push en la app o WhatsApp.
- `1.2.E2` Recorridos con ramas según si cada persona abre, hace clic o compra.
- `1.2.O1` Audiencias predictivas: probabilidad de comprar de cada persona en la venta al consumidor.
- `1.2.O2` Agent One: agentes que conversan con el cliente y lo ayudan a comprar.
- `1.3.E4` CDP: une cada compra a una sola persona aunque cambie de canal o dispositivo.
- `1.3.E101` Segmentación RFM: cuánto compra, cada cuánto y cuándo fue la última vez.
- `1.3.O1` CDP en tiempo real: cada visita y cada compra llegan a la ficha al instante.
- `1.3.O3` CDP: una ficha única por persona entre sitio, app, tienda y mensajes.
- `1.4.O3` Agent One: la marca fija en la plataforma las metas y los límites de la IA.
- `1.5.E101` Buscador del sitio que ordena según la persona y reporta búsquedas sin resultado.
- `1.6.F101` Personalización del sitio: oferta distinta para compradores nuevos y recurrentes.
- `1.6.F102` Recomendaciones de productos relacionados en la ficha y en el carrito.
- `1.6.E101` Recomendaciones y ofertas calculadas con la historia de compra de cada persona.
- `1.6.E102` Audiencias por valor del cliente con ofertas y accesos anticipados propios.
- `1.6.E103` Analítica de recomendaciones: cuánta venta sale de cada sugerencia.
- `1.6.E202` Segmentación por comportamiento y envío de la oferta preaprobada por push o WhatsApp.
- `1.6.O101` Personalización en la sesión: el sitio decide por visitante qué mostrar y en qué orden.
- `1.6.O102` CDP: la ficha que decide la oferta suma reclamos, devoluciones y campañas recibidas.
- `1.6.O201` Agent One: decide qué producto ofrecer a cada cliente y en qué momento.
- `1.7.F1` Recorridos de carrito y de compra a medias que salen solos y a tiempo.
- `1.7.F2` Recuperación de la compra por varios canales desde una sola plataforma, push incluido.
- `1.7.F5` Audiencias predictivas de próxima compra que disparan el recordatorio a tiempo.
- `1.7.F101` Recorridos después de la compra con recomendaciones e incentivos para volver.
- `1.7.F201` Recorridos de solicitud abandonada en la web o la app, por push o WhatsApp.
- `1.7.E1` Orquestación multicanal: un mismo recorrido combina correo, mensajería y push.
- `1.7.E101` Recordatorios de reposición por producto, programados según su ciclo de recompra.
- `1.7.E102` Analítica de recorridos: carritos recuperados y recompras por cada mensaje.
- `1.7.E201` Analítica de recorridos: solicitudes recuperadas por mensaje y por canal.
- `1.7.O1` Personalización en la sesión: ayuda u oferta cuando la compra se traba.
- `1.7.O2` Mejor canal y mejor hora por persona, que se ajustan solos con cada respuesta.
- `1.7.O101` Predicción de próxima compra por persona, con la oferta que decide Agent One.
- `1.8.E101` Pruebas A/B y multivariadas en la tienda, con grupo de control.
- `1.8.O4` Grupo de control para medir cuánto agregan los envíos que decide la IA.

### Marketing

- `2.1.O1` Agent One arma solo las campañas, dentro de los límites de la marca.
- `2.2.E1` Recorridos de varios pasos con ramas y esperas según lo que hace cada persona.
- `2.2.E2` WhatsApp a escala en recorridos que se ramifican si la persona leyó o respondió.
- `2.2.O1` Agent One autónomo: decide cada envío por persona, con su mejor canal y hora.
- `2.2.O2` Agentes de Agent One conversan con quien responde, para comprar o resolver dudas.
- `2.2.O3` Integración nativa con BigQuery: lo calculado en el almacén entra a la ficha.
- `2.3.F7` La ficha guarda el permiso de cada persona por canal, también el de push.
- `2.3.E3` La ficha única une sola los registros de la misma persona entre dispositivos.
- `2.3.E4` Lo que hizo como anónimo en sitio y app se une al identificarse.
- `2.3.O3` Atributos calculados por IA en la ficha, como la afinidad a categorías o descuentos.
- `2.3.O5` Ficha única en tiempo real que reconoce a la persona en todos sus canales.
- `2.4.O1` Agent One guarda en la plataforma los límites que la IA respeta.
- `2.6.F201` Excluye a quien ya tiene el producto, si ese dato llega a la ficha.
- `2.6.E1` Un recorrido distinto por segmento o etapa, con su propia lógica de envío.
- `2.6.E2` Contenido y recomendaciones de producto que cambian solos según el segmento, en cada canal.
- `2.6.E4` Segmentos por comportamiento que se actualizan solos con cada visita y compra.
- `2.6.O1` Audiencias predictivas: probabilidad de comprar y de irse por persona.
- `2.6.O3` Sitio, app y mensajes personalizados por visitante en la misma sesión.
- `2.7.F4` WhatsApp a escala para salir con campañas, sin tope mensual de plantillas.
- `2.7.F201` Cada envío respeta el permiso por canal y la baja que pidió la persona.
- `2.7.F202` Push y mensajes dentro de la app del banco, con el mismo calendario.
- `2.7.E1` Recorridos en que un canal sigue lo que empezó otro con la misma persona.
- `2.7.E5` Push y mensajes dentro de la app como pasos de cada recorrido.
- `2.8.E1` Pruebas A/B y multivariadas en cada canal, con grupo de control.
- `2.8.O2` Agent One ajusta contenido y momento con lo que funciona, sin esperar al cierre.
- `2.8.O3` Grupo de control en cada recorrido para medir cuánto agrega la IA.

### Servicio

- `3.1.F2` Orquestación de recorridos: seguimiento automático a la cartera masiva por sus canales.
- `3.2.F6` Flujos de WhatsApp: bots con menú que resuelven las consultas frecuentes a escala.
- `3.2.O1` Agent One: agentes de soporte que resuelven y pasan el caso con su contexto.
- `3.3.O1` Audiencias predictivas: probabilidad de irse de cada cliente, calculada con su comportamiento.
- `3.5.O1` Agent One: bots de IA que hablan con la voz de la marca.
- `3.6.E1` Orquestación de recorridos: acompaña de forma automática al resto de la cartera.
- `3.6.E2` Audiencias predictivas: segmentos en riesgo o con potencial que se actualizan solos.
- `3.6.O1` Personalización del sitio y la app: el autoservicio cambia según cada visitante.
- `3.6.O2` Personalización en la sesión: cada visitante ve lo suyo según su ficha en vivo.
- `3.7.F101` Canales: el aviso del atraso sale solo en cuanto cambia la fecha del pedido.
- `3.7.F201` Orquestación de recorridos: quien no activa su producto recibe ayuda en la app.
- `3.7.F202` Personalización en la sesión: una oferta para quedarse al iniciar la cancelación en línea.
- `3.7.F203` Canales: aviso de cada cobro a escala, en el canal que cada cliente usa.
- `3.7.E2` Audiencias predictivas: quien puede irse recibe retención y quien puede comprar, una oferta.
- `3.7.E5` Canales: avisos automáticos antes de cada fecha clave, en el canal de cada persona.
- `3.7.E101` Orquestación de recorridos: disculpa o compensación automática cuando el pedido falla.
- `3.7.E102` Audiencias predictivas: el suscriptor que puede cancelar recibe una oferta para quedarse.
- `3.7.E201` Audiencias predictivas: probabilidad de irse por cliente y recorridos de retención automáticos.
- `3.7.O3` Agent One: decide cada aviso y lo envía en el mejor canal y momento.
- `3.7.O4` Audiencias predictivas: afinidad a descuentos para elegir el beneficio de cada cliente.
- `3.8.O2` Agent One: agentes de soporte que absorben los picos sin sumar personas.
- `3.8.O4` Pruebas con grupo de control: miden cuánto agregan los avisos que decide la IA.

## HubSpot

*Clave:* hubspot
*Color:* naranja
*Qué es:* El CRM donde trabajan Ventas, Marketing y Servicio: la ficha de cada cliente, los procesos, la automatización, los reportes y los agentes de IA.
*Cuándo conviene:* Cuando la venta la cierra una persona, y como sistema de registro aunque la cierre el sitio.
*Revisado:* 2026-10-01
*Responsable:* por definir

### Ventas

- `1.1.F2` Sales Hub Pro: un pipeline por proceso con propiedades obligatorias por etapa.
- `1.1.F4` Sales Hub Pro: secuencias que ejecutan la cadencia de intentos y plazos acordada.
- `1.1.F201` Sales Hub Pro: tiempo en cada etapa medido solo y aviso al vencer el plazo.
- `1.1.F401` CRM: cada visita como reunión con su resultado y la tarea del siguiente paso.
- `1.1.E2` Sales Hub Pro: playbooks de discovery y objeciones abiertos dentro del registro.
- `1.1.E3` Sales Hub Pro: informes de actividad y de negocios que se salen del proceso.
- `1.1.O1` Sales Hub Pro: flujos que avisan al rep y al líder cuando un negocio se desvía.
- `1.1.O2` Sales Hub Pro: reglas de pipeline que impiden saltar etapas o avanzar sin datos.
- `1.2.F2` Sales Hub Pro: rotación de leads por turnos, territorio o fuente con flujos.
- `1.2.F3` Sales Hub: tareas automáticas al cambiar de etapa, con recordatorio al responsable.
- `1.2.F4` Sales Hub Pro: WhatsApp en la bandeja compartida, respondido desde la app móvil.
- `1.2.F6` Data Hub: sincronización con la tienda que crea cada pedido con su cliente.
- `1.2.F7` Breeze: asistente que redacta y resume con los datos de cada ficha del CRM.
- `1.2.F8` Sales Hub Enterprise: objeto personalizado de unidades, cupos o existencias con su estado.
- `1.2.F202` Marketing Hub Pro: flujos que avisan por correo o WhatsApp en cada cambio de etapa.
- `1.2.F301` Marketing Hub Pro: flujos que avisan al aspirante en cada paso de su solicitud.
- `1.2.F401` Sales Hub Enterprise: objeto de unidades cuyo estado cambia solo cuando el negocio se reserva.
- `1.2.E1` CRM: cotizaciones con plantilla y productos, generadas desde cada negocio.
- `1.2.E2` Sales Hub Pro: secuencias y flujos con ramas, más asignación por condiciones o capacidad.
- `1.2.E3` Data Hub: sincronización en dos sentidos con el ERP y otras apps.
- `1.2.E4` Sales Hub Pro: tableros de conversión por etapa y de tiempo de primera respuesta.
- `1.2.E5` Breeze: asistente dentro del CRM para redactar, resumir y preparar reuniones.
- `1.2.E401` Sales Hub Pro: firma electrónica de la cotización de reserva dentro del negocio.
- `1.2.O1` Sales Hub Enterprise: probabilidad de cerrar por negocio y respuestas sugeridas con IA.
- `1.2.O3` Data Hub Enterprise: trae por horario los cálculos del almacén de datos a la ficha.
- `1.3.F1` CRM: monto, fecha de cierre y responsable obligatorios al crear el negocio.
- `1.3.F2` CRM: evita duplicados por correo y dominio, y permite fusionar registros.
- `1.3.F3` CRM: fuente original guardada sola en cada contacto, empresa y negocio.
- `1.3.F4` CRM: informes y tableros de pipeline que leen el estado actual.
- `1.3.F201` Sales Hub Pro: autorización con fecha obligatoria para avanzar la solicitud.
- `1.3.F301` CRM: formulario con el permiso del responsable, que queda en la ficha.
- `1.3.E1` Sales Hub Pro: forecast por vendedor y equipo, con su envío en cada período.
- `1.3.E2` Data Hub Pro: calidad de datos y fusión de duplicados con reglas automáticas.
- `1.3.E3` Data Hub: facturas y pedidos del ERP en la ficha, junto a las conversaciones.
- `1.3.E101` Data Hub Pro: propiedades calculadas de monto, frecuencia y última compra por cliente.
- `1.3.E401` Sales Hub Pro: informes de tiempo en cada etapa por tipo de unidad.
- `1.3.O1` CRM: asociaciones automáticas entre contacto, empresa y negocio.
- `1.3.O2` Sales Hub Enterprise: probabilidad de cerrar por negocio que alimenta el pronóstico.
- `1.3.O3` CRM: ventas, servicio y marketing en la misma ficha y la misma base.
- `1.3.O4` Data Hub Enterprise: conexión por horario con Snowflake, BigQuery o S3.
- `1.3.O5` Data Hub Pro: correcciones automáticas de formato y agente de datos que completa campos.
- `1.4.F2` CRM: tablero con las métricas clave del pipeline, listo para la revisión semanal.
- `1.4.F4` Sales Hub Pro: metas por vendedor y equipo con su avance en tableros.
- `1.4.F5` Sales Hub Pro: informes de tareas cumplidas y vencidas por vendedor.
- `1.4.E3` Sales Hub Pro: informes del traspaso con tiempo de respuesta y motivos de rechazo.
- `1.4.E201` Sales Hub Pro: informes de cuánto tarda el área de crédito en cada etapa.
- `1.4.E301` Service Hub Pro: SLA con aviso y escalación para cada trámite académico o financiero.
- `1.4.E401` Service Hub Pro: SLA por área con aviso y escalación cuando se pasa el plazo.
- `1.4.O1` Data Hub Pro: conjuntos de datos para LTV, rentabilidad por canal y aporte por vendedor.
- `1.5.F3` Sales Hub: plantillas y fragmentos compartidos con el mensaje de valor común.
- `1.5.F4` CRM: plantillas de cotización con la misma estructura para todo el equipo.
- `1.5.F201` Content Hub: fichas de producto publicadas en el sitio desde un solo lugar.
- `1.5.F301` Content Hub: fichas de programa en el sitio, editadas en un solo lugar.
- `1.5.F401` CRM: cotizaciones que toman el precio vigente de la biblioteca de productos.
- `1.5.E3` Sales Hub Enterprise: aprobación de cotizaciones antes de enviarlas al cliente.
- `1.5.E201` Sales Hub Pro: informe que compara lo ofrecido con lo aprobado en cada solicitud.
- `1.5.E301` Service Hub Pro: encuesta automática a los estudiantes nuevos sobre lo prometido.
- `1.5.O1` Content Hub Pro: marca de voz que la IA aplica en todo lo que redacta.
- `1.6.F1` CRM: propiedades del cliente ideal y vistas filtradas para trabajar cada segmento.
- `1.6.F2` Sales Hub Pro: estados del lead con criterios de aceptación y motivo de descarte.
- `1.6.F4` CRM: formularios y propiedades que preguntan los atributos del cliente ideal.
- `1.6.E1` Marketing Hub Pro: lead scoring por reglas que suma atributos y comportamiento.
- `1.6.E2` Sales Hub Pro: cuentas objetivo marcadas, con su propio espacio de trabajo.
- `1.6.E3` Sales Hub Pro: secuencias por segmento con personalización de cada mensaje.
- `1.6.E102` Marketing Hub Pro: listas de mejores clientes con acceso anticipado y beneficios.
- `1.6.E201` Sales Hub Pro: flujo que precalifica con los datos del formulario de solicitud.
- `1.6.E202` Marketing Hub: listas activas de preaprobados por producto que reciben la oferta.
- `1.6.E401` Sales Hub Pro: no deja pasar a reserva sin el comprobante de capacidad de pago.
- `1.6.O2` Service Hub Pro: puntaje de salud por reglas que señala riesgo y expansión.
- `1.6.O3` Marketing Hub Pro: contenido inteligente por reglas según el rol de cada persona.
- `1.6.O4` Marketing Hub Pro: el puntaje puede sumar señales de servicio y de marketing.
- `1.6.O102` Service Hub: reclamos y devoluciones en la misma ficha que usa Marketing.
- `1.7.F1` Sales Hub Pro: flujo que detecta negocios sin actividad y crea la tarea de reactivación.
- `1.7.F2` Sales Hub Pro: secuencias que alternan correo y llamada en la reactivación.
- `1.7.F5` Marketing Hub Pro: flujo por días desde la última compra que manda el recordatorio.
- `1.7.F101` Marketing Hub Pro: flujo después de cada pedido que invita a volver a comprar.
- `1.7.F201` Sales Hub Pro: flujo que manda el recordatorio o crea la llamada dentro del plazo.
- `1.7.F301` Sales Hub Pro: secuencia que sigue al admitido hasta que se matricula o declina.
- `1.7.F302` Marketing Hub Pro: flujo que recuerda la solicitud a medias dentro del plazo.
- `1.7.F401` Sales Hub Pro: tarea de seguimiento creada sola después de cada visita.
- `1.7.F402` Sales Hub Pro: fecha de vencimiento obligatoria y tarea de contacto antes de que venza.
- `1.7.E1` Sales Hub Pro: secuencias multicanal con correo, llamada y tareas de LinkedIn.
- `1.7.E2` Marketing Hub Pro: nutrición automática y regreso a Ventas cuando sube el puntaje.
- `1.7.E3` Sales Hub: biblioteca de documentos compartida, con seguimiento de aperturas.
- `1.7.E4` Sales Hub Pro: flujo que avisa al líder cuando un negocio pasa su tiempo en etapa.
- `1.7.E201` Sales Hub Pro: informe de solicitudes retomadas por canal y por mensaje.
- `1.7.E301` Sales Hub Pro: informe por programa de admitidos sin matrícula y aspirantes recuperados.
- `1.7.E401` Sales Hub Pro: informe de oportunidades estancadas y reservas en riesgo recuperadas.
- `1.7.E402` Service Hub Pro: portal del cliente con el avance de su trámite.
- `1.7.O1` Sales Hub Enterprise: flujos que alertan cuando baja la probabilidad de cerrar.
- `1.8.F1` Sales Hub Pro: razón de pérdida obligatoria al cerrar un negocio como perdido.
- `1.8.F2` CRM: razón de pérdida como lista desplegable, no como texto libre.
- `1.8.F3` CRM: informe de negocios perdidos por razón y por trimestre.
- `1.8.F101` Service Hub: tickets de cancelación y devolución con su motivo en una lista.
- `1.8.F201` CRM: dos campos de razón, uno de la entidad y otro del cliente.
- `1.8.F301` Sales Hub Pro: institución elegida obligatoria al cerrar al aspirante como perdido.
- `1.8.F302` Sales Hub Pro: etapa de matrícula sin inicio con su razón obligatoria.
- `1.8.F401` Sales Hub Pro: razón obligatoria al marcar una reserva como desistida o vencida.
- `1.8.E301` Sales Hub Pro: motivo de la decisión obligatorio al cerrar la matrícula como ganada.
- `1.8.E401` Sales Hub Pro: proyecto competidor y motivo obligatorios al perder la oportunidad.
- `1.8.O1` Sales Hub Pro: grabación, transcripción e inteligencia de conversaciones con coaching.

### Marketing

- `2.1.F6` Marketing Hub: campañas y contactos viven en el mismo sistema que el CRM.
- `2.1.F201` Marketing Hub Enterprise: la aprobación de cada pieza queda registrada antes de publicarla.
- `2.1.E2` Marketing Hub Enterprise: aprobación obligatoria antes de publicar correos y páginas.
- `2.1.O1` Marketing Hub Pro: agentes de campaña y de contenido de Breeze entregan borradores (beta).
- `2.1.O4` Marketing Hub Pro: flujos que avisan al líder cuando algo se sale del plan.
- `2.2.F3` CRM: formularios propios o externos que crean el contacto al enviarse.
- `2.2.F4` CRM: bandeja de conversaciones con el chat del sitio; WhatsApp desde Pro.
- `2.2.F5` Marketing Hub: correo de respuesta y aviso interno al llegar cada formulario.
- `2.2.F9` Content Hub: marca de voz que la IA de HubSpot usa al redactar.
- `2.2.F102` Marketing Hub Pro: devuelve a Google y Meta las conversiones registradas en el CRM.
- `2.2.F301` CRM: formulario con código QR que crea al aspirante en el momento.
- `2.2.E1` Marketing Hub Pro: flujos con ramas y esperas para nutrir a cada contacto.
- `2.2.E2` Marketing Hub Pro: WhatsApp en flujos con ramas; tope de 1.000 plantillas al mes.
- `2.2.E3` Marketing Hub Pro: flujos que asignan el lead calificado al vendedor y le avisan.
- `2.2.E4` CRM: todos los canales de conversación llegan a una sola bandeja del equipo.
- `2.2.E5` Marketing Hub Starter: landing pages creadas en el mismo sistema que el CRM.
- `2.2.E6` CRM: asistente Breeze que redacta y resume con la voz de marca cargada.
- `2.2.E7` Service Hub Pro: informes de la bandeja con primera respuesta y conversaciones sin respuesta.
- `2.2.O2` Service Hub Pro: Breeze Customer Agent (beta) responde solo en chat, correo y WhatsApp.
- `2.2.O3` Data Hub Enterprise: trae del almacén, por horario, el valor calculado de cada cliente.
- `2.3.F1` CRM: fuente original automática y etapa del ciclo de vida en cada contacto.
- `2.3.F2` Marketing Hub Pro: formularios progresivos que piden un dato nuevo en cada visita.
- `2.3.F3` CRM: deduplica por correo al crear; desde Pro, herramienta para fusionar duplicados.
- `2.3.F5` Marketing Hub: informes de fuentes y de conversión por etapa listos para usar.
- `2.3.F7` CRM: tipos de suscripción por canal y casilla de permiso en los formularios.
- `2.3.E1` CRM: enriquecimiento nativo de empresas y contactos, pensado para venta a empresas.
- `2.3.E2` Marketing Hub Enterprise: atribución multitoque que reparte el ingreso entre los puntos de contacto.
- `2.3.E3` Data Hub Pro: duplicados que se detectan y se fusionan por reglas.
- `2.3.E4` Marketing Hub: las visitas previas se unen a la ficha al identificarse la persona.
- `2.3.O1` Data Hub Enterprise: los datos del CRM llegan al almacén por horario.
- `2.3.O3` Data Hub Pro: agente de datos de Breeze que completa propiedades con IA (beta).
- `2.3.O4` Data Hub Pro: reglas que corrigen formatos solas y señalan las excepciones.
- `2.4.F2` Marketing Hub: tablero con las métricas clave que llega solo cada semana.
- `2.5.F4` Content Hub Pro: recomendaciones de SEO técnico por página y por sitio.
- `2.5.F401` Content Hub: plantilla de página por proyecto que el equipo llena sin programar.
- `2.5.E2` Content Hub Pro: herramienta de temas que enlaza la página central con sus apoyos.
- `2.5.E5` Service Hub Pro: encuesta que pide la reseña solo a quien quedó satisfecho.
- `2.5.O2` Content Hub Pro: agentes de contenido de Breeze generan piezas que el equipo valida.
- `2.6.F3` Marketing Hub: envíos por lista, con una pieza propia para cada segmento.
- `2.6.F4` Marketing Hub Pro: flujos que cambian la etapa a MQL según las propiedades.
- `2.6.F201` CRM: listas que excluyen a quien ya tiene el producto en su ficha.
- `2.6.F301` CRM: el familiar como contacto asociado al aspirante, con sus propias listas.
- `2.6.E1` Marketing Hub Pro: flujos que se separan por segmento o por etapa.
- `2.6.E2` Marketing Hub Pro: contenido inteligente que cambia la pieza según la lista.
- `2.6.E3` Marketing Hub Pro: lead scoring por reglas que dispara los flujos de nurturing.
- `2.6.E4` Marketing Hub: listas por correos abiertos y páginas visitadas; compras si se integran.
- `2.7.F1` Marketing Hub: correo masivo programado con su historial de envíos a la vista.
- `2.7.F2` Marketing Hub Pro: publicaciones en redes programadas desde un mismo calendario.
- `2.7.F4` Marketing Hub Pro: WhatsApp para salir con campañas; tope de 1.000 plantillas al mes.
- `2.7.F5` Marketing Hub Pro: una campaña agrupa las piezas de todos los canales.
- `2.7.F6` Marketing Hub Pro: informe de anuncios con costo por contacto en cada red.
- `2.7.F201` CRM: cada envío respeta la suscripción por canal y la baja se aplica sola.
- `2.7.E1` Marketing Hub: audiencias de anuncios armadas desde listas del CRM, también para remarketing.
- `2.7.E3` Marketing Hub Pro: retorno de cada anuncio con los negocios que trajo.
- `2.7.E4` CRM: formulario de referidos y propiedad que guarda quién trajo a cada uno.
- `2.7.E201` Marketing Hub Pro: informes que cruzan el gasto por canal con los productos colocados.
- `2.7.E301` Marketing Hub Pro: informes que cruzan el gasto por canal con las matrículas.
- `2.7.E401` Marketing Hub Pro: informes que cruzan el gasto de pauta con visitas y reservas.
- `2.7.O4` Service Hub Pro: NPS que, al marcar promotor, dispara solo el pedido de referido.
- `2.8.F5` Marketing Hub Pro: cada campaña muestra los contactos, negocios e ingresos que trajo.
- `2.8.E1` Marketing Hub Pro: pruebas A/B en correos y páginas, con su ganador.
- `2.8.O2` Marketing Hub Pro: pruebas adaptativas que llevan el tráfico a la mejor variante.

### Servicio

- `3.1.F1` Service Hub: pipeline de tickets con etapas propias, de la entrada al cierre.
- `3.1.F2` CRM: propietario asignado en cada empresa y tareas de seguimiento en su ficha.
- `3.1.F6` CRM: bandeja de conversaciones donde se responde cada canal sin salir del sistema.
- `3.1.E1` Service Hub Pro: plazos de primera respuesta y de cierre por prioridad del ticket.
- `3.1.E3` Service Hub Pro: playbooks en la ficha que guían cada acción con el cliente.
- `3.1.E5` Service Hub Pro: informes de tickets por etapa y del tiempo en cada paso.
- `3.1.E401` Service Hub Pro: playbooks para cada momento difícil, a la vista en la ficha.
- `3.1.O1` Service Hub Pro: flujos para las rutinas y Customer Agent que el equipo entrena.
- `3.1.O3` Service Hub Pro: flujos que avisan al líder y al agente de cada desvío.
- `3.1.O4` Service Hub Pro: reglas del pipeline y propiedades por etapa que impiden saltarse pasos.
- `3.2.F4` CRM: bandeja de conversaciones con el chat y el correo conectados.
- `3.2.F5` Service Hub: asignación automática por regla y avisos en cada cambio de estado.
- `3.2.F6` CRM: flujos de chat con árbol de decisión para las consultas frecuentes.
- `3.2.F8` CRM: el asistente Breeze trabaja con los datos de la ficha del cliente.
- `3.2.E1` Service Hub Pro: avisos de SLA y flujos que escalan y enrutan por condiciones.
- `3.2.E2` Service Hub Pro: portal del cliente y base de conocimiento interna y pública.
- `3.2.E3` CRM: bandeja de conversaciones que reúne los canales; WhatsApp desde Pro.
- `3.2.E4` Service Hub Pro: Breeze resume casos y redacta respuestas con la base de conocimiento.
- `3.2.E5` Service Hub Pro: vistas en vivo de tickets abiertos por agente y sin asignar.
- `3.2.O1` Service Hub Pro: Customer Agent resuelve en los canales conectados y deriva con contexto.
- `3.2.O4` Data Hub Enterprise: trae del almacén de datos el riesgo calculado a la ficha.
- `3.3.F1` CRM: los tickets de cada cliente aparecen asociados en su ficha.
- `3.3.F2` Data Hub: sincroniza las compras y los pagos del ERP con la ficha.
- `3.3.F3` CRM: la fecha en que se volvió cliente se guarda sola en la ficha.
- `3.3.F4` CRM: propiedades de tipo y motivo con opciones fijas en cada ticket.
- `3.3.F5` Service Hub: informes de volumen de tickets por tipo sin exportar nada.
- `3.3.F101` Data Hub: sincroniza cada pedido con su estado y lo asocia al caso.
- `3.3.F201` Service Hub Pro: fecha límite por tipo de reclamo e informe de los vencidos.
- `3.3.E1` Service Hub Pro: informes de tiempos de respuesta y de cumplimiento de SLA.
- `3.3.E2` Service Hub Pro: encuestas NPS y CSAT que salen solas al cerrar cada caso.
- `3.3.E3` CRM: Ventas y Servicio trabajan sobre la misma ficha del cliente.
- `3.3.E4` Service Hub Pro: propiedad calculada del tiempo entre el inicio y el primer resultado.
- `3.3.E5` Service Hub Pro: puntaje de salud por reglas en el espacio de éxito.
- `3.3.O2` Data Hub Enterprise: conecta los datos de servicio con el almacén por horario.
- `3.3.O4` Data Hub Pro: calidad de datos que corrige formatos y propone fusionar duplicados.
- `3.4.F2` Service Hub: tablero de tickets que se actualiza solo para la revisión semanal.
- `3.4.E201` Service Hub Pro: informes por equipo de tiempos de resolución y motivos de devolución.
- `3.4.E301` Service Hub Pro: informes de cuánto tarda cada área en resolver lo que recibe.
- `3.5.F1` CRM: fragmentos y plantillas de respuesta a un clic del agente.
- `3.5.E1` Service Hub Pro: macros que responden y actualizan el ticket en un clic.
- `3.5.O1` Service Hub Pro: Customer Agent con la personalidad y la voz de marca configuradas.
- `3.6.F1` CRM: prioridad nativa en cada ticket y vistas ordenadas por urgencia.
- `3.6.F3` CRM: la ficha del cliente y sus negocios, a la vista en cada ticket.
- `3.6.E1` Service Hub Pro: espacio de éxito para el CSM y flujos para el resto.
- `3.6.E2` CRM: listas activas que agrupan a los clientes según su momento.
- `3.6.O1` Service Hub Pro: artículos y portal que se abren según la lista del cliente.
- `3.6.O3` CRM: el negocio ganado y lo prometido quedan asociados a cada caso.
- `3.7.F1` Service Hub Pro: mala calificación o reclamo repetido crean la tarea de contacto.
- `3.7.F2` Service Hub Pro: flujos que crean la tarea de contacto antes de cada renovación.
- `3.7.F3` Service Hub: pipeline de bajas que pide el motivo antes de cerrar.
- `3.7.F101` Marketing Hub Pro: flujo que avisa al comprador cuando cambia la fecha prometida.
- `3.7.F201` Marketing Hub Pro: flujo que contacta a quien no activa su producto a tiempo.
- `3.7.F202` Service Hub Pro: pipeline de cancelación con un paso de retención obligatorio.
- `3.7.F203` Marketing Hub Pro: flujo por fecha de cobro que envía el aviso por correo.
- `3.7.F301` Service Hub Pro: listas de estudiantes en riesgo que crean la tarea del consejero.
- `3.7.F401` Marketing Hub: correo a los compradores del proyecto con la fecha nueva.
- `3.7.E1` Service Hub Pro: avisos al responsable cuando baja o sube el puntaje de salud.
- `3.7.E2` Service Hub Pro: flujos que disparan la acción de retención o de expansión.
- `3.7.E4` Service Hub Pro: tickets asignados a otras áreas, con avisos de atraso y fechas.
- `3.7.E5` Marketing Hub Pro: flujos por fecha clave que avisan por correo o WhatsApp.
- `3.7.E101` Marketing Hub Pro: flujo que envía disculpa y compensación cuando falla el pedido.
- `3.7.E102` Marketing Hub Pro: una pausa o un salto de entrega dispara una oferta.
- `3.7.E201` Marketing Hub Pro: flujos que reaccionan a las señales de fuga con una acción.
- `3.7.E401` Marketing Hub: boletín periódico a los compradores de cada proyecto.
- `3.7.O1` Marketing Hub Pro: cada cliente recibe sus resultados por correo, tomados de su ficha.
- `3.7.O4` Marketing Hub Pro: flujos que eligen el beneficio según la historia del cliente.
- `3.8.F1` Service Hub Pro: base de conocimiento pública con buscador.
- `3.8.F2` Service Hub Pro: el agente inserta el artículo en su respuesta con un clic.
- `3.8.E3` Service Hub Pro: bot de la base de conocimiento que responde antes del ticket.
- `3.8.O1` Service Hub Pro: el agente de base de conocimiento redacta artículos desde los tickets.
- `3.8.O2` Service Hub Pro: Customer Agent absorbe los picos y cobra por conversación resuelta.

## Smarteam

*Clave:* smarteam
*Color:* celeste
*Qué es:* El trabajo del equipo de Smarteam: diseñar e implementar, integrar, ordenar los datos, capacitar y acompañar la adopción, y medir en vueltas mensuales con SmartLoop.
*Cuándo conviene:* Donde el criterio pide algo que hay que crear o lograr que el equipo use, no solo una licencia.
*Revisado:* 2026-10-01
*Responsable:* por definir

### Ventas

- `1.1.F1` Implementación de CRM: etapas y criterios de avance escritos, montados y enseñados al equipo.
- `1.1.F2` Implementación de CRM: un pipeline por proceso, configurado sobre cómo se vende de verdad.
- `1.1.F4` Implementación de CRM: el proceso se documenta y la cadencia se monta en secuencias.
- `1.1.F5` Implementación de CRM: vista de pipeline para la reunión y acompañamiento de las primeras.
- `1.1.F6` Rescate de CRM: el CRM se reordena para que el equipo quiera trabajar en él.
- `1.1.F201` Implementación de CRM: plazos por etapa montados con su aviso al vencer.
- `1.1.F401` Implementación de CRM: la visita se registra con resultado y siguiente paso obligatorios.
- `1.1.F402` Implementación de CRM: la reserva se escribe y se monta como etapa con sus reglas.
- `1.1.E2` Implementación de CRM: playbooks escritos con el equipo y cargados en el CRM.
- `1.1.E3` Implementación de CRM: tablero de adherencia al proceso que el líder revisa.
- `1.1.O1` Implementación de CRM: alertas de desviación configuradas para el rep y el líder.
- `1.1.O2` SmartLoop: mide la adherencia cada mes y sostiene la adopción en el tiempo.
- `1.1.O3` SmartLoop: cada vuelta prueba una técnica nueva con su métrica antes de sumarla.
- `1.2.F2` Implementación de CRM: bandeja y reglas de asignación configuradas sobre el proceso real.
- `1.2.F4` Implementación de CRM: WhatsApp conectado a la bandeja y equipo entrenado en usarla.
- `1.2.F6` Integraciones y automatización: la tienda, la caja y el CRM conectados en producción.
- `1.2.F8` Integraciones y automatización: el inventario del ERP visible en el CRM antes de ofrecer.
- `1.2.F101` Integraciones y automatización: cada estado del pedido dispara su aviso al comprador.
- `1.2.F102` Integraciones y automatización: catálogo, precios y existencias sincronizados a cada canal.
- `1.2.F201` Integraciones y automatización: la solicitud a medias de la web o la app entra al CRM.
- `1.2.F202` Integraciones y automatización: cada cambio de estado del core dispara el aviso al cliente.
- `1.2.F301` Implementación de CRM: avisos automáticos para cada paso de la admisión.
- `1.2.F302` Desarrollo de sitio web: solicitud en línea por pasos que guarda el avance en el CRM.
- `1.2.F401` Implementación de CRM: inventario de unidades con bloqueo al reservar.
- `1.2.E1` Implementación de CRM: cotizaciones desde el negocio con productos y precios cargados.
- `1.2.E2` Implementación de CRM: secuencias con ramas y reglas de asignación diseñadas y montadas.
- `1.2.E3` Integraciones y automatización: CRM y ERP sincronizados y funcionando en producción.
- `1.2.E4` Implementación de CRM: tableros de conversión y de conversaciones armados para el líder.
- `1.2.E5` SmartLoop: los usos de la IA en el día a día se adoptan y se miden.
- `1.2.E201` Integraciones y automatización: carga de documentos y firma digital conectadas al CRM.
- `1.2.E301` Integraciones y automatización: documentos y firma de la matrícula conectados al CRM.
- `1.2.E401` Integraciones y automatización: firma digital conectada y documentos guardados en el negocio.
- `1.2.O2` CDP y activación: el agente conversa en WhatsApp con el contexto de cada cliente.
- `1.2.O3` Integraciones y automatización: lo calculado en el almacén vuelve a la ficha del CRM.
- `1.3.F1` Implementación de CRM: campos obligatorios definidos y negocios abiertos completados.
- `1.3.F2` Rescate de CRM: se fusionan los duplicados que hoy distorsionan los reportes.
- `1.3.F3` Implementación de CRM: fuentes mapeadas y seguimiento del sitio en cada formulario.
- `1.3.F4` Implementación de CRM: informe de pipeline armado sobre las etapas reales.
- `1.3.F5` SmartLoop: el cliente ideal se revisa en cada remedición trimestral.
- `1.3.F6` SmartLoop: la definición de lead calificado se revisa con datos cada trimestre.
- `1.3.F7` SmartLoop: la documentación de las soluciones se repasa en cada remedición.
- `1.3.F8` Integraciones y automatización: cada venta llega con su cliente y se mide cuántas no.
- `1.3.F201` Implementación de CRM: la autorización se pide en el formulario y queda con su fecha.
- `1.3.F301` Implementación de CRM: el permiso del responsable se pide en el formulario y queda registrado.
- `1.3.F401` Integraciones y automatización: estado de las unidades sincronizado con lo firmado.
- `1.3.E1` Implementación de CRM: forecast configurado y rutina de envío en cada período.
- `1.3.E2` Integraciones y automatización: reglas de deduplicación que corren solas en cada sincronización.
- `1.3.E3` Integraciones y automatización: facturación y pedidos visibles en la ficha del CRM.
- `1.3.E4` CDP y activación: una identidad única por cliente entre tienda, sitio y app.
- `1.3.E101` CDP y activación: cuánto, cada cuánto y última compra calculados por cliente.
- `1.3.E401` Implementación de CRM: informe de ritmo de venta por tipo de unidad y etapa.
- `1.3.O1` Integraciones y automatización: sincronizaciones en tiempo real, no por lotes nocturnos.
- `1.3.O3` Integraciones y automatización: todos los sistemas del cliente alimentan la misma ficha.
- `1.3.O4` Integraciones y automatización: CRM, facturación y servicio llegan al almacén de datos.
- `1.3.O5` Integraciones y automatización: los datos entran solos desde cada sistema, sin digitar.
- `1.4.F1` RevOps y alineación: roles y responsabilidades escritos para cada etapa del proceso.
- `1.4.F2` Implementación de CRM: el tablero del líder armado y su revisión semanal enseñada.
- `1.4.F4` Implementación de CRM: metas cargadas y reporte de avance programado.
- `1.4.F401` RevOps y alineación: regla de propiedad del cliente escrita y aplicada en el CRM.
- `1.4.E2` Implementación de CRM: módulos de capacitación que sirven de inducción para cada ingreso.
- `1.4.E3` RevOps y alineación: SLA y traspaso con Marketing escritos y medidos en el CRM.
- `1.4.E4` SmartLoop: lo que el equipo señala entra a cada vuelta y recibe respuesta.
- `1.4.E101` Integraciones y automatización: alertas automáticas de caídas de venta por canal.
- `1.4.E201` RevOps y alineación: acuerdo con crédito escrito y medido en el CRM.
- `1.4.E301` RevOps y alineación: acuerdo con las áreas académica y financiera, medido en el CRM.
- `1.4.E401` RevOps y alineación: acuerdo con legal, cobros y crédito, medido en el CRM.
- `1.4.O1` RevOps y alineación: LTV y rentabilidad definidos igual y medidos en las tres áreas.
- `1.4.O2` SmartLoop: la vuelta mensual funciona como mesa de innovación comercial.
- `1.4.O3` RevOps y alineación: queda escrito qué decide la IA sola y quién la valida.
- `1.5.F1` RevOps y alineación: el cliente ideal se escribe como definición compartida.
- `1.5.F3` Implementación de CRM: el mensaje común cargado en plantillas y enseñado al equipo.
- `1.5.F4` Implementación de CRM: plantilla de propuesta común por línea de servicio.
- `1.5.F5` Integraciones y automatización: precios y condiciones sincronizados desde una sola fuente.
- `1.5.F201` Desarrollo de sitio web: ficha de cada producto publicada desde una sola fuente.
- `1.5.F301` Desarrollo de sitio web: ficha de cada programa con la misma estructura en el sitio.
- `1.5.F401` Implementación de CRM: lista de precios por proyecto cargada como productos.
- `1.5.E3` Implementación de CRM: paso de validación del alcance antes de enviar la propuesta.
- `1.5.E101` Desarrollo de sitio web: categorías, filtros y buscador armados con datos de búsqueda.
- `1.5.E201` Integraciones y automatización: lo aprobado vuelve del core para compararlo con lo ofrecido.
- `1.5.E301` SmartLoop: lo que no coincide se corrige en la ficha y en el guion cada mes.
- `1.5.E401` Integraciones y automatización: precios y avance de obra sincronizados a CRM, sitio y portales.
- `1.6.F1` Implementación de CRM: atributos del cliente ideal como propiedades y vistas por segmento.
- `1.6.F2` RevOps y alineación: definición de lead calificado escrita y compartida con Marketing.
- `1.6.F4` Implementación de CRM: formularios que preguntan lo que define al cliente ideal.
- `1.6.F101` CDP y activación: oferta distinta para nuevos y recurrentes activada en el sitio.
- `1.6.F102` CDP y activación: recomendaciones activadas en la ficha y en el carrito.
- `1.6.F201` Integraciones y automatización: productos y comportamiento de pago del core en la ficha.
- `1.6.E1` RevOps y alineación: modelo de puntaje acordado entre Marketing y Ventas, con su umbral.
- `1.6.E2` RevOps y alineación: segmentos y cuentas prioritarias definidos y marcados en el CRM.
- `1.6.E101` CDP y activación: recomendaciones y ofertas que salen de la historia de compra.
- `1.6.E102` CDP y activación: audiencia de mejores clientes con su trato propio en cada canal.
- `1.6.E201` Implementación de CRM: reglas de precalificación montadas en el formulario y en el flujo.
- `1.6.E202` Integraciones y automatización: preaprobados del core al CRM, listos para la oferta.
- `1.6.E401` Implementación de CRM: comprobación de capacidad de pago exigida antes de reservar.
- `1.6.O2` RevOps y alineación: señales de riesgo y expansión acordadas entre Ventas y Servicio.
- `1.6.O4` RevOps y alineación: señales de las tres áreas en un mismo modelo de prioridad.
- `1.6.O101` CDP y activación: personalización por visitante encendida, con sus metas y límites.
- `1.6.O102` Integraciones y automatización: reclamos y devoluciones llegan a la ficha que decide la oferta.
- `1.6.O201` CDP y activación: el modelo de producto por cliente activado en cada canal.
- `1.7.F1` Implementación de CRM: regla de estancamiento y paso de reactivación montados.
- `1.7.F3` Implementación de CRM: vista de negocios estancados para que el líder actúe a tiempo.
- `1.7.F5` Implementación de CRM: regla de recompra y su recordatorio montados en el CRM.
- `1.7.F101` CDP y activación: recorrido después de la compra activado con recomendaciones.
- `1.7.F201` Integraciones y automatización: el abandono en la web o la app dispara el recordatorio.
- `1.7.F301` Implementación de CRM: etapa de admitido con su seguimiento hasta la matrícula.
- `1.7.F302` Integraciones y automatización: la solicitud a medias dispara el recordatorio o la llamada.
- `1.7.F401` Implementación de CRM: seguimiento después de cada visita automatizado con su plazo.
- `1.7.F402` Implementación de CRM: vencimiento y responsable de cada reserva con aviso previo.
- `1.7.E1` Implementación de CRM: cadencias multicanal diseñadas y cargadas en secuencias.
- `1.7.E2` RevOps y alineación: reglas para devolver leads a nutrición y recibirlos de vuelta.
- `1.7.E101` CDP y activación: ciclo de recompra por producto medido y usado para el recordatorio.
- `1.7.E402` Implementación de CRM: avisos de trámite y obra entre la reserva y la firma.
- `1.7.O2` CDP y activación: mejor canal y mejor hora encendidos en cada recorrido.
- `1.7.O101` CDP y activación: predicción de próxima compra conectada a la oferta de cada cliente.
- `1.8.F1` Implementación de CRM: la razón de pérdida se vuelve obligatoria al cerrar.
- `1.8.F2` Implementación de CRM: lista de razones acordada con el equipo y cargada en el CRM.
- `1.8.F101` Integraciones y automatización: el motivo de cancelación o devolución llega desde la tienda.
- `1.8.F201` Implementación de CRM: razones en dos ramas, rechazo de la entidad o abandono del cliente.
- `1.8.F301` Implementación de CRM: la institución elegida se pide al cerrar como perdido.
- `1.8.F302` Integraciones y automatización: el sistema académico avisa quién se matriculó y no empezó.
- `1.8.F401` Implementación de CRM: razón obligatoria al desistir o vencer una reserva.
- `1.8.E1` SmartLoop: revisión mensual de ganadas y perdidas que deja una hipótesis.
- `1.8.E2` SmartLoop: cada vuelta lleva lo aprendido al proceso y al playbook.
- `1.8.E101` SmartLoop: una prueba por mes en la tienda, con su hipótesis y su métrica.
- `1.8.E201` RevOps y alineación: revisión de rechazos con crédito sobre un mismo informe.
- `1.8.O1` Integraciones y automatización: telefonía conectada para grabar y analizar llamadas.
- `1.8.O3` SmartLoop: las decisiones de cada vuelta se toman con la métrica medida.
- `1.8.O4` SmartLoop: cada cambio que decide la IA se mide contra su grupo de control.

### Marketing

- `2.1.F2` Implementación de CRM: el proceso de campaña se escribe y se monta en HubSpot.
- `2.1.F3` SmartLoop: se instala la reunión de performance con su tablero y su cadencia.
- `2.1.F4` Implementación de CRM: tablero con el estado de cada campaña para el líder.
- `2.1.F6` Implementación de CRM: capacitación y acompañamiento hasta que el equipo trabaja en HubSpot.
- `2.1.F201` Implementación de CRM: el paso de cumplimiento se monta como aprobación registrada.
- `2.1.O4` Implementación de CRM: flujos que avisan al líder cuando una campaña se desvía.
- `2.2.F2` Rescate de CRM: se ponen a producir los módulos pagados que nadie usa.
- `2.2.F3` Desarrollo de sitio web: cada formulario del sitio nace conectado al CRM.
- `2.2.F4` Implementación de CRM: WhatsApp y el chat del sitio conectados a la bandeja.
- `2.2.F9` Implementación de CRM: voz de marca y buyer personas cargados en la IA.
- `2.2.F101` Integraciones y automatización: el catálogo de la tienda alimenta los anuncios sin cargas manuales.
- `2.2.F102` Integraciones y automatización: las compras de la tienda vuelven solas a Google y Meta.
- `2.2.F301` Implementación de CRM: formulario de feria con código QR y su origen ya marcado.
- `2.2.E1` Implementación de CRM: los recorridos de nurturing se diseñan con sus ramas y esperas.
- `2.2.E2` CDP y activación: campañas de WhatsApp segmentadas y con ramas, funcionando en producción.
- `2.2.E3` RevOps y alineación: traspaso a Ventas definido con su SLA y automatizado.
- `2.2.E5` Desarrollo de sitio web: landing pages construidas en el CMS integrado al CRM.
- `2.2.E6` Implementación de CRM: capacitación para usar la IA en el trabajo diario con contexto.
- `2.2.O1` CDP y activación: Agent One configurado con las metas y límites de la marca.
- `2.2.O3` Integraciones y automatización: lo calculado en el almacén vuelve al CRM o a Insider.
- `2.3.F1` Implementación de CRM: reglas que llenan etapa y origen en cada vía de entrada.
- `2.3.F2` Implementación de CRM: propiedades del cliente ideal definidas y puestas en los formularios.
- `2.3.F3` Rescate de CRM: la base se limpia y se fusionan los duplicados.
- `2.3.F5` Implementación de CRM: los reportes básicos quedan armados y el equipo sabe leerlos.
- `2.3.F6` SmartLoop: la revisión trimestral con la escala incluye poner al día el contexto.
- `2.3.F7` Implementación de CRM: permiso por canal en cada formulario, guardado en la ficha.
- `2.3.E1` Integraciones y automatización: el servicio de enriquecimiento se conecta y corre solo.
- `2.3.E2` RevOps y alineación: el modelo de atribución se acuerda entre áreas y se monta.
- `2.3.E4` Desarrollo de sitio web: código de seguimiento instalado en todas las páginas del sitio.
- `2.3.O1` Integraciones y automatización: el CRM, Insider y las ventas conectados al almacén de datos.
- `2.3.O4` Integraciones y automatización: sincronizaciones que mantienen los datos al día sin cargas manuales.
- `2.3.O5` CDP y activación: la ficha única se arma con todas las fuentes del cliente.
- `2.4.F2` Implementación de CRM: se arma el tablero del líder y se enseña a leerlo.
- `2.4.F5` Implementación de CRM: capacitación por módulos hasta que el equipo opera sin ayuda.
- `2.4.E3` RevOps y alineación: los acuerdos con Ventas y Servicio quedan escritos y medidos.
- `2.4.O1` CDP y activación: se dejan por escrito los límites de la IA autónoma.
- `2.4.O4` RevOps y alineación: tablero del valor de vida por canal frente a su costo.
- `2.5.F4` Desarrollo de sitio web: sitio rápido con meta tags y SEO técnico resueltos.
- `2.5.F401` Desarrollo de sitio web: una página por proyecto con renders, planos y ubicación.
- `2.5.E2` Desarrollo de sitio web: arquitectura del sitio por temas, con su página central.
- `2.5.E3` Desarrollo de sitio web: contenido estructurado para asistentes de IA, con su medición.
- `2.5.E4` RevOps y alineación: el recorrido del cliente se mapea con sus puntos de contacto.
- `2.5.E5` Implementación de CRM: flujo que pide la reseña al cliente satisfecho.
- `2.6.F1` Implementación de CRM: los segmentos se escriben y se montan como listas activas.
- `2.6.F4` RevOps y alineación: la definición de MQL se acuerda con Ventas y se monta.
- `2.6.F201` Integraciones y automatización: los productos de cada cliente llegan del sistema central al CRM.
- `2.6.F301` Implementación de CRM: la familia se modela como contacto asociado al aspirante.
- `2.6.E3` RevOps y alineación: el modelo de puntaje se diseña con Ventas y se calibra.
- `2.6.O1` CDP y activación: las audiencias predictivas se activan en cada canal de la marca.
- `2.6.O3` CDP y activación: sitio y app personalizados con los datos de la ficha.
- `2.7.F6` Implementación de CRM: reporte de costo por lead que junta gasto y origen.
- `2.7.F202` CDP y activación: la app y la banca en línea entran a cada campaña.
- `2.7.F401` Integraciones y automatización: la unidad reservada sale sola del sitio y de los portales.
- `2.7.E1` CDP y activación: las audiencias del CDP se usan en pauta y en mensajes.
- `2.7.E3` SmartLoop: cada vuelta revisa el gasto por canal y mueve el presupuesto con datos.
- `2.7.E4` Implementación de CRM: programa de referidos montado con su formulario y su registro.
- `2.7.E5` CDP y activación: notificaciones de la app activadas en las campañas, con permiso.
- `2.7.E101` Integraciones y automatización: las ventas de cada código de creador llegan al CRM.
- `2.7.E201` Integraciones y automatización: lo colocado en sucursal llega al CRM con su origen.
- `2.7.E301` Integraciones y automatización: las matrículas del sistema académico llegan al CRM.
- `2.7.E401` Implementación de CRM: visitas y reservas con su origen, listas para medir su costo.
- `2.7.O1` SmartLoop: cada canal nuevo se prueba como hipótesis con su métrica.
- `2.7.O4` RevOps y alineación: el paso de promotores de Servicio a Marketing queda automatizado.
- `2.8.F3` SmartLoop: se instala la revisión de cierre con su plantilla y se sostiene.
- `2.8.F5` Implementación de CRM: reporte por campaña con los leads y ventas que trajo.
- `2.8.E1` SmartLoop: cada vuelta deja una prueba con su hipótesis y su métrica.
- `2.8.E2` SmartLoop: se instala la revisión de qué creatividades y audiencias funcionan.
- `2.8.E3` SmartLoop: lo aprendido en cada vuelta cambia cómo se arma la siguiente campaña.
- `2.8.O3` CDP y activación: grupo de control montado en cada recorrido que decide la IA.

### Servicio

- `3.1.F1` Implementación de CRM: el flujo de atención se escribe y se monta como pipeline.
- `3.1.F2` Implementación de CRM: cada cliente queda con su responsable y su seguimiento armado.
- `3.1.F3` SmartLoop: deja instalada la reunión del equipo y acompaña hasta que se sostiene.
- `3.1.F4` Implementación de CRM: el proceso de escalación se escribe y se monta en HubSpot.
- `3.1.F5` Implementación de CRM: capacitación por módulos para que todos atiendan con el mismo flujo.
- `3.1.F6` Rescate de CRM: se reordena el sistema y el equipo vuelve a atender dentro.
- `3.1.F201` Implementación de CRM: cada tipo de reclamo lleva su plazo regulatorio dentro del proceso.
- `3.1.F202` Implementación de CRM: la verificación de identidad queda como paso obligatorio del caso.
- `3.1.F401` Implementación de CRM: el proceso de garantía se escribe y se monta como pipeline.
- `3.1.E1` Implementación de CRM: se definen los plazos por tipo de caso y se cargan.
- `3.1.E3` Implementación de CRM: se escriben los playbooks y se cargan en la ficha.
- `3.1.E4` RevOps y alineación: se mapea el recorrido completo y el traspaso entre áreas.
- `3.1.E5` Implementación de CRM: se arma el tablero de cumplimiento que revisa el líder.
- `3.1.E401` Implementación de CRM: se escriben las guías y se cargan como playbooks.
- `3.1.O1` Integraciones y automatización: las rutinas que cruzan sistemas corren solas en producción.
- `3.1.O3` Implementación de CRM: se configuran las alertas de desvío del proceso.
- `3.1.O4` Implementación de CRM: el proceso se automatiza para que cada paso ocurra solo.
- `3.2.F4` Implementación de CRM: se conecta el canal y se enseña a usar la bandeja.
- `3.2.F5` Implementación de CRM: se configuran la regla de asignación y los avisos de estado.
- `3.2.F6` Implementación de CRM: se diseña el árbol del chatbot con las consultas frecuentes.
- `3.2.E1` Implementación de CRM: se configuran las reglas de escalación y de enrutamiento.
- `3.2.E2` Implementación de CRM: se monta el portal y se cargan los primeros artículos.
- `3.2.E3` Integraciones y automatización: se conectan a la bandeja los canales que HubSpot no trae.
- `3.2.E4` Implementación de CRM: se carga el contexto del área y se capacita en IA.
- `3.2.E5` Implementación de CRM: se arma el panel en vivo de la atención.
- `3.2.E301` Integraciones y automatización: el trámite pedido en línea llega solo al sistema académico.
- `3.2.O1` Implementación de CRM: se entrena el agente de IA y se pone en producción.
- `3.2.O4` Integraciones y automatización: el almacén y el CRM quedan sincronizados por horario.
- `3.3.F1` Migraciones de datos: el histórico de tickets llega al CRM sin perder nada.
- `3.3.F2` Integraciones y automatización: lo comprado y lo pagado llegan del ERP a la ficha.
- `3.3.F3` Rescate de CRM: se limpian las fichas y se completan los datos clave.
- `3.3.F4` Implementación de CRM: se diseña la taxonomía de tipos y motivos y se carga.
- `3.3.F5` Implementación de CRM: se arman los reportes de volumen por tipo de ticket.
- `3.3.F6` SmartLoop: la revisión trimestral con la escala pone al día el contexto del área.
- `3.3.F101` Integraciones y automatización: el estado de cada pedido llega solo al caso.
- `3.3.F201` Implementación de CRM: se cargan los plazos del regulador y su informe de vencidos.
- `3.3.E1` Implementación de CRM: se arman los informes de tiempos y de cumplimiento de SLA.
- `3.3.E2` Implementación de CRM: se configuran las encuestas y su envío automático.
- `3.3.E3` RevOps y alineación: Ventas y Servicio trabajan con los mismos datos y definiciones.
- `3.3.E4` Implementación de CRM: se define el primer resultado y se mide en el CRM.
- `3.3.E5` Implementación de CRM: se diseñan las reglas del puntaje y se calcula solo.
- `3.3.O1` CDP y activación: los datos de servicio alimentan la predicción de cada cliente.
- `3.3.O2` Integraciones y automatización: los datos de servicio llegan al almacén en producción.
- `3.3.O4` Integraciones y automatización: los datos llegan solos de cada sistema, sin captura manual.
- `3.4.F2` Implementación de CRM: se arma el tablero del líder con sus métricas clave.
- `3.4.E1` SmartLoop: instala la revisión del SLA de cada agente y la sostiene.
- `3.4.E2` Implementación de CRM: los módulos de capacitación quedan como material para quien entra.
- `3.4.E4` RevOps y alineación: se acuerdan los traspasos y las alertas de churn con Ventas.
- `3.4.E201` Implementación de CRM: cada traspaso a otra área queda medido en el ticket.
- `3.4.E301` Implementación de CRM: lo que pasa a lo académico o lo financiero queda medido.
- `3.4.O1` Implementación de CRM: queda escrito qué resuelve la IA y cuándo deriva.
- `3.4.O3` RevOps y alineación: Servicio comparte con Ventas las métricas de retención e ingresos.
- `3.4.O4` SmartLoop: el reporte ejecutivo cruza el costo de atender cada segmento con su ingreso.
- `3.4.O401` Implementación de CRM: tablero de la posventa con entregas sin pendientes y NPS.
- `3.5.F1` Implementación de CRM: se cargan los primeros fragmentos con las respuestas frecuentes.
- `3.5.F2` Implementación de CRM: el onboarding se escribe con su resultado y se monta.
- `3.5.F3` Implementación de CRM: el módulo de macros queda en la inducción de cada agente.
- `3.5.F4` RevOps y alineación: se escriben los tipos de cliente como definición compartida entre áreas.
- `3.5.F101` Implementación de CRM: la política de cambios se monta con su paso de aprobación.
- `3.5.E1` Implementación de CRM: las respuestas frecuentes se escriben y se cargan como macros.
- `3.5.O1` Implementación de CRM: el agente de IA se configura con la guía de estilo.
- `3.6.F1` Implementación de CRM: los criterios de prioridad se escriben y se cargan.
- `3.6.F2` Implementación de CRM: el nivel de cada tipo de cliente queda en reglas.
- `3.6.F3` Implementación de CRM: se ordena la ficha y se capacita al agente para usarla.
- `3.6.E1` Implementación de CRM: cada cuenta clave con su CSM y el resto con flujos.
- `3.6.E2` Implementación de CRM: se definen los segmentos por momento y se arman como listas.
- `3.6.O1` CDP y activación: el autoservicio muestra a cada cliente lo suyo.
- `3.6.O2` CDP y activación: la ficha unificada se activa en cada interacción en tiempo real.
- `3.6.O3` RevOps y alineación: lo prometido en la venta pasa a Servicio en la ficha.
- `3.7.F1` Implementación de CRM: se arman las vistas de riesgo que el equipo revisa.
- `3.7.F2` Implementación de CRM: se cargan las fechas de renovación con su aviso previo.
- `3.7.F3` Implementación de CRM: se define la lista de motivos de salida y se exige.
- `3.7.F101` Integraciones y automatización: los datos de despacho detectan el atraso y disparan el aviso.
- `3.7.F201` CDP y activación: la falta de uso del producto dispara la ayuda para empezar.
- `3.7.F202` Implementación de CRM: la cancelación pasa por un paso de retención con su oferta.
- `3.7.F203` Integraciones y automatización: las fechas y los montos del sistema central disparan el aviso.
- `3.7.F301` Integraciones y automatización: las señales académicas y de pago llegan solas al CRM.
- `3.7.F401` Implementación de CRM: cada cambio en la fecha de entrega dispara el aviso.
- `3.7.E1` Implementación de CRM: se configuran las alertas de riesgo y de oportunidad.
- `3.7.E2` Implementación de CRM: se automatizan las acciones de retención y de expansión.
- `3.7.E3` Implementación de CRM: el resultado de cada cliente clave queda en su ficha.
- `3.7.E4` Integraciones y automatización: el caso viaja al sistema de otra área y vuelve actualizado.
- `3.7.E5` Integraciones y automatización: las fechas clave llegan solas y disparan el aviso.
- `3.7.E101` CDP y activación: la recuperación sale sola por el canal de cada comprador.
- `3.7.E102` CDP y activación: las señales de la suscripción activan la retención en cada canal.
- `3.7.E201` CDP y activación: el uso de la tarjeta y el saldo alimentan la retención.
- `3.7.E401` Implementación de CRM: se arma el envío periódico por proyecto con su plantilla.
- `3.7.O1` Integraciones y automatización: los resultados de cada cliente llegan solos al CRM.
- `3.7.O2` Integraciones y automatización: las señales de otros sistemas abren el caso antes del reclamo.
- `3.7.O3` CDP y activación: se fijan las metas y los límites de la IA.
- `3.7.O4` CDP y activación: el detalle de cada cliente se elige según su ficha.
- `3.8.F1` Desarrollo de sitio web: centro de ayuda con las respuestas más consultadas.
- `3.8.F2` Implementación de CRM: se capacita al equipo a responder con el enlace al artículo.
- `3.8.E1` SmartLoop: cada vuelta revisa que los casos nuevos alimenten la base.
- `3.8.E2` SmartLoop: cada vuelta busca patrones en tickets recurrentes y bajas para fijar una mejora.
- `3.8.E3` SmartLoop: se mide cuánto resuelve el autoservicio y se mejora cada mes.
- `3.8.E301` SmartLoop: la vuelta previa a cada pico usa los casos del período anterior.
- `3.8.E401` SmartLoop: el análisis de reclamos de garantía llega a quien diseña el próximo proyecto.
- `3.8.O1` Implementación de CRM: se configura el agente que redacta y quién valida sus artículos.
- `3.8.O4` SmartLoop: cada vuelta mide el aporte de los avisos contra un grupo de control.

## Historial de versiones

**1.0.0 (2026-10-01).** Primera versión, con la escala 8.7.0: Insider One, HubSpot y Smarteam, en las tres áreas y en lo propio de las cuatro ediciones. Es un borrador para revisar.
