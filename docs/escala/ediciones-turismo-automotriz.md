# Ediciones Turismo y Automotriz — para revisar (borrador de la 8.9.0)

Dos ediciones nuevas, con sus tres áreas, en la Parte 5 de `escala_rendimiento_smarteam.md`. La escala
pasa a la 8.9.0 (una edición nueva es una versión menor). No cambia ningún criterio de la matriz ni el
cálculo. Pasan las nueve pruebas de Nexus y las de `pruebas_escala.py`, y `publicar-escala.ts` en seco no
frena. **No está publicada**: se publica cuando la apruebes.

Qué cambia en una dimensión: su nombre (solo en producción), la pregunta, la descripción, el costo de
quedarse, algunos criterios dichos con las palabras de la industria (miden lo mismo) y criterios propios
(lo que solo existe ahí). Lo demás «se lee igual». Ninguna edición saca criterios de la matriz.

## Turismo (`turismo`, propios desde el 501)

Para hoteles, operadores, agencias de viaje y empresas de experiencias, con reserva directa y por
intermediarios (OTAs, agencias, mayoristas) y con temporadas. *Perfil habitual:* mixta · recompra: el
viajero reserva solo y un equipo trabaja grupos, eventos, empresas y agencias. Quedan fuera las
aerolíneas, el transporte y el restaurante sin hospedaje ni experiencias. 90 criterios dichos con otras
palabras y 26 propios.

**Ventas.** Lo que más pesa: vender por varios canales a la vez sin perder el control.

| Dimensión | Qué cambia y por qué |
|:--|:--|
| 1.1 Procesos | Etapas de la reserva (consulta → llegada); propio: proceso escrito para cotizar grupos (cuándo vale la oferta, el depósito, qué se libera). |
| 1.2 Tecnología | Las reservas de las OTAs entran solas; propio: una reserva descuenta el cupo en todos los canales a la vez (sin sobreventa). El CRM se conecta al PMS. |
| 1.3 Datos | Reservas con su canal; proyección de ocupación (±10 %); propio: cuánto llega directo y cuánto se paga de comisión por canal. |
| 1.4 Equipo | Tablero de ocupación y cancelaciones; propio: quién atiende cada tipo de venta. |
| 1.5 Oferta y tarifas | Mismas tarifas y condiciones en el sitio, las OTAs y las agencias; propios: una sola tarifa vigente, condiciones visibles antes de reservar, tarifas por temporada con reglas. |
| 1.6 Priorización de consultas | Consulta calificada (fechas, personas, presupuesto, cupo); propios: llevar al motor de reservas lo que el viajero resuelve solo, comparar si un grupo conviene en temporada alta, ofrecer lo que se suma antes de llegar. |
| 1.7 Seguimiento de cotizaciones y reservas | Propios: vencimiento de cada cotización, fechas de corte de cada bloqueo de grupo, reservas sin pago; la recompra es «la misma temporada del año siguiente». |
| 1.8 Reservas ganadas, perdidas y canceladas | Propios: razón de cada cancelación y marca de no presentado; medir cancelaciones por canal y temporada. |

**Marketing.** Lo que más pesa: la reputación en sitios que no son tuyos y la temporada.

| Dimensión | Qué cambia y por qué |
|:--|:--|
| 2.1 Procesos | Calendario por temporadas; propio: cada temporada y cada fecha que mueve viajeros tiene su campaña planeada con la anticipación con que se reserva. |
| 2.2 a 2.4 | Solo palabras: consultas, reservas directas, perfiles de viajero. |
| 2.5 Marca y reputación | Reseñas en Google, sitios de reseñas y OTAs; propio: esos perfiles dicen lo mismo que el sitio y se revisan antes de cada temporada. |
| 2.6 Segmentación | Segmentos por tipo de viaje (familia, pareja, trabajo, grupo). |
| 2.7 Canales | Metabuscadores, ferias y viajes de familiarización; propio: lo que cuesta una reserva directa frente a la comisión de un intermediario. |
| 2.8 Medición | Solo palabras: cada temporada deja su aprendizaje. |

**Servicio.** Lo que más pesa: la estancia ocurre en horas, con turnos, y la queja hay que resolverla
antes de que el viajero se vaya.

| Dimensión | Qué cambia y por qué |
|:--|:--|
| 3.1 Procesos | Propios: el cambio de turno deja registrado lo abierto; guías para sobreventa, traslados y cancelaciones por clima. |
| 3.2 Tecnología | Asignar por área (limpieza, mantenimiento, operador); propio: el viajero se registra antes, cambia su hora o pide un traslado solo. |
| 3.3 Datos | Ficha con la reserva; propio: preferencias de estancias anteriores. |
| 3.4 Equipo | Propio: acuerdo medido con recepción, limpieza, mantenimiento, guías y traslados. |
| 3.5 Consistencia de la experiencia | La llegada es el «arranque del cliente nuevo». |
| 3.6 Priorización de viajeros | Lo urgente: sin habitación o varado en un traslado. |
| 3.7 Acompañamiento del viajero | Propios: la queja se resuelve antes de la salida; el aviso por clima o por un cierre llega antes de viajar. |
| 3.8 Autoservicio del viajero | Las preguntas de siempre: hora de registro, cómo llegar, qué incluye, cómo cancelar. |

## Automotriz (`automotriz`, propios desde el 601)

Para el concesionario o distribuidor que vende vehículos nuevos y usados y atiende su posventa en el
taller. *Perfil habitual:* con equipo · recompra. Quedan fuera la venta de repuestos en mostrador, la
importadora que no le vende al cliente final y la empresa que solo alquila. 69 criterios dichos con otras
palabras y 29 propios.

**Una frontera nueva, dicha en el encabezado:** recordarle al dueño su mantenimiento es de **Servicio**;
ofrecerle cambiar de vehículo, de **Ventas** (Tracción). El taller es posventa, no una venta más.

**Ventas.**

| Dimensión | Qué cambia y por qué |
|:--|:--|
| 1.1 Procesos | Etapas con prueba de manejo y financiamiento; propios: cada prueba de manejo deja su siguiente paso, proceso escrito para recibir el usado. |
| 1.2 Tecnología | Inventario (en stock, en tránsito, por pedir); propios: apartar un vehículo lo marca en el inventario, la solicitud de financiamiento viaja sola a las financieras. CRM conectado al DMS. |
| 1.3 Datos | Origen incluye la marca; propios: estado de cada vehículo al día, cuánto tarda en venderse cada modelo y cada usado. |
| 1.4 Equipo | Meta por asesor y por modelo; propio: acuerdo medido con financiamiento, avalúo y entrega. |
| 1.5 Modelos y cotización | Cotización con versión, bonos, usado y financiamiento; propios: una sola lista de precios y bonos, cambios el mismo día a todos. |
| 1.6 Priorización de interesados | Calificado = modelo, forma de pago y plazo; propio: capacidad de pago antes de apartar o de pedir a la marca. |
| 1.7 Seguimiento de pruebas y cotizaciones | La recompra es el cambio de vehículo (fin del financiamiento, edad, kilometraje); propios: seguimiento de cada prueba y cotización, avance del vehículo entre el cierre y la entrega. |
| 1.8 Ventas ganadas y perdidas | Propios: razón de la venta que se cae antes de la entrega, a qué marca o concesionario se fue el cliente. |

**Marketing.**

| Dimensión | Qué cambia y por qué |
|:--|:--|
| 2.1 Procesos | Propio: el calendario sigue lanzamientos, ferias, cierres de mes y campañas de la marca y del taller. La marca cuenta como agencia (el equipo es dueño del calendario). |
| 2.2 a 2.4 | Solo palabras: cotización y prueba de manejo como conversión. |
| 2.5 Marca y Presencia | Propio: cada modelo tiene su página (versiones, precio desde, ficha, cómo pedir la prueba). |
| 2.6 Segmentación | Contado frente a financiado, persona frente a flota; comportamiento incluye cuándo fue al taller. |
| 2.7 Canales | Propios: anunciar solo los usados disponibles, costo por prueba de manejo y por venta. |
| 2.8 Medición | Solo palabras. |

**Servicio (el taller).**

| Dimensión | Qué cambia y por qué |
|:--|:--|
| 3.1 Procesos | Propios: orden de trabajo escrita (recibo con firma, presupuesto aprobado antes de reparar, control de calidad), guías para la falla que vuelve o la garantía rechazada. |
| 3.2 Tecnología | Propios: la cita y cada cambio de estado le llegan solos al cliente (Funcional, por la regla de automatización simple); agendar y aprobar en línea (Eficiente). |
| 3.3 Datos | Ficha con placa, serie y kilometraje; propio: vehículos que vuelven por la misma falla. |
| 3.4 Equipo | Propio: acuerdo medido con repuestos, la marca y los talleres externos. |
| 3.5 Consistencia del taller | La entrega del vehículo nuevo es el arranque; propio: el mismo trabajo cuesta lo mismo con cualquier asesor de servicio. |
| 3.6 Priorización de clientes del taller | Lo urgente: varado o con una falla de seguridad. |
| 3.7 Seguimiento del vehículo | Propios: recordatorio del mantenimiento por fecha o kilometraje (Funcional), aviso de cada llamado a revisión (Eficiente). |
| 3.8 Escalabilidad del taller | Propio: las fallas que se repiten en un modelo se comparten con la marca. |

## Para decidir antes de publicar

1. **Perfiles habituales.** Turismo en *mixta · recompra* y Automotriz en *con equipo · recompra*. Un
   contrato de mantenimiento de flota podría leerse como relación continua.
2. **Tres criterios propios suben la vara de Funcional** donde la industria lo exige: en Turismo, que una
   reserva descuente el cupo en todos los canales; en Automotriz, que la cita y el estado del vehículo le
   lleguen solos al cliente y el recordatorio del mantenimiento. Si te parece mucho para Funcional, pasan a
   Eficiente.
3. **Quién queda fuera** (se mide con la escala general): en Turismo, aerolíneas, transporte y restaurantes
   sin hospedaje ni experiencias; en Automotriz, repuestos en mostrador, importadoras y empresas de alquiler.
4. **Pendiente fuera de la escala:** `lib/exploraciones/industria.ts` sugiere la edición por la industria
   de HubSpot y no conoce `turismo` ni `automotriz`. Sin eso, la preventa igual puede elegirlas leyendo
   «para quién es». Es una línea por edición, cuando se publique.
