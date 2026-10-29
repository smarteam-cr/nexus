# Artefactos sugeridos: lo que piden las reuniones con las cuentas

> Análisis del 2026-10-28, en solo lectura contra producción. No cambia código ni datos.
> Lo usa el plan de artefactos (`plan-artefactos`): tipos, plantillas y secciones que le sirven al CSE para entregar el
> servicio, sacados de lo que pasa en las reuniones reales y no de lo que ya tiene el motor.

## Cómo se hizo

- **Muestra:** 30 fichas de cartera (`kind = CLIENTE`) con reuniones con texto en los últimos 90 días, elegidas para
  repartir industrias (inmobiliaria, automotriz, telecomunicaciones, educación, retail, industria, servicios legales y
  financieros, turismo, logística), CSE (Juan Armijos, Heiver Gómez, Caroline Bersot, Liliana Moreno, Valentina
  Sandoval, Felipe Sepulveda, Alexander Vanegas, Lorena Osorio y los de desarrollo) y tipos de proyecto
  (implementación, desarrollo, SmartLoop, web).
  - **Faco y Honda Costa Rica son la misma empresa en dos fichas** (el concesionario Honda con Usados y Lip Motors).
    Por eso los conteos dicen **29 cuentas**.
- **Lectura:** las reuniones de cada cliente salieron por el chokepoint (`getClientSessions`, de
  `lib/sessions/project-sources.ts`) y el texto se leyó por id con el mismo filtro de dueño.
  - Se tomaron 4 reuniones por cuenta, repartidas en los 90 días: **120 reuniones**.
  - De cada reunión se leyó el resumen y las líneas del texto con palabras de entrega («definir», «propuesta»,
    «capacitación», «panel», «les mando»…), con la línea de antes y la de después.
  - Además, los títulos de las **421 reuniones con texto** de esas cuentas.
- **Notas por cliente:** cada cliente tuvo su archivo de notas y ningún texto pasó de un cliente a otro. Este catálogo
  solo cuenta en cuántas cuentas aparece cada necesidad. Las citas son de la cuenta que se nombra al lado.

## Lo que se ve, en corto

1. **Lo que más hace el CSE es capacitar, registrar acuerdos y ponerse de acuerdo en un proceso.** Capacitación
   aparece en 22 de 29 cuentas, el registro de decisiones en 20 y el consenso de proceso en 21. Hoy ninguno de los
   tres es un documento de Nexus: viven en minutas sueltas, en Excel o en la cabeza del CSE.
2. **El marketing del SmartLoop no tiene artefacto.** En 12 cuentas se arman campañas, segmentos y piezas, y en Nexus
   no hay dónde: ni una ficha de campaña ni un calendario.
3. **WhatsApp y los agentes son un frente propio** en 9 cuentas: guion, identidad, base de conocimiento, quién se
   queda la conversación y créditos. Es la «planificación de WhatsApp» que Elías puso de ejemplo.
4. **En SmartLoop falta el «qué sigue»:** una hoja de ruta o backlog de la cuenta y un informe de avance y de valor.
   Las cuentas sin casos de uso claros se traban justo ahí, y la renovación se defiende sin papel.
5. **Varios ya existen y solo les faltan plantillas:** requerimiento técnico (Integraciones), diagnóstico,
   exploración, propuesta, entrega y planificación. Lo que piden las reuniones son variantes por área, por canal o por
   tamaño, no tipos nuevos.

## El catálogo, por cuántas cuentas lo necesitan

| # | Artefacto | Tipo | Cuentas | ¿Existe hoy? |
|---|---|---|---|---|
| 1 | Plan de capacitación | Capacitación (nuevo) | 22 | No; hay piezas sueltas en Kickoff y Planificación |
| 2 | Consenso de proceso | Planificación | 21 | En parte: secciones de Planificación y Diagnóstico |
| 3 | Registro de decisiones de la cuenta | Seguimiento (nuevo) | 20 | No como documento; hay minutas y tareas por reunión |
| 4 | Catálogo de paneles e indicadores | Planificación / Reporte | 17 | Una sección (`planificacion›informes`) |
| 5 | Propuesta de siguiente paso | Propuesta | 15 | Propuesta comercial (la de Ventas) y Recurrente |
| 6 | Requerimiento técnico de integración | Integraciones | 15 | Sí (`desarrollo`) |
| 7 | Diccionario de datos | Planificación | 12 | Secciones en tres tipos |
| 8 | Ficha de campaña | Marketing (nuevo) | 12 | No |
| 9 | Diagnóstico por área o de uso | Diagnóstico | 12 | Sí (esencial y completo) |
| 10 | Plan de adopción | Adopción | 11 | Pieza de SmartLoop (`cycle-adoption`) + `rutinas_adopcion` |
| 11 | Plan de migración y limpieza de datos | Planificación / Integraciones | 10 | No |
| 12 | Diseño de WhatsApp y agente | Planificación | 9 | No |
| 13 | Exploración por área o por caso | Exploración | 9 | Sí |
| 14 | Usuarios, licencias y permisos | Planificación | 9 | Una sección (`planificacion›usuarios_permisos`) |
| 15 | Informe de avance y valor | Seguimiento (nuevo) | 8 | No; la Entrega es solo de cierre |
| 16 | Hoja de ruta de la cuenta (backlog) | SmartLoop | 8 | Una sección (`planificacion›roadmap`) |
| 17 | Guion de pruebas y aceptación | Integraciones / Entrega | 7 | No |
| 18 | Pase de cuenta entre CSE | Interno (nuevo) | 6 | No |
| 19 | Especificación de cotizaciones | Planificación | 5 | Una sección (`planificacion›cotizaciones`) |
| 20 | Encuesta y salud del cliente | Planificación / Reporte | 4 | No |

Las piezas que ya existen y aparecieron como se esperaba (handoff, kickoff, cronograma, entrega) no se repiten abajo.
Se mencionan en «Señales sueltas».

Cómo leer cada ficha: **✓** sección que ya existe (`tipo›key` de `components/landing/configs/*.defs.ts`), **✗** sección
que falta.

---

### 1. Plan de capacitación — 22 cuentas

**Para qué:** el programa de sesiones con el que el cliente aprende a usar lo construido. Es la actividad con más
reuniones de toda la muestra: en Spectrum, 14 de 19 títulos son capacitaciones; en Areyá, 10 de 22.

**Lo que dice el CSE:** «ocupo el plan de capacitación de ventas y marketing, cinco semanas», «armame las sesiones de
garantía», «necesito capacitar a los de calle en el celular».

**Plantillas:**
- **Por rol y semana** (la de una implementación): ventas, marketing y gerencia por separado, una sesión por semana.
  ALMOTEC, Areyá, Metzger, Spectrum, REMPRO, Sfera, Secure Title.
- **Capacitación vendida como servicio** (SmartLoop de capacitación: el cliente configura en vivo con el CSE): Alliance
  RH, Total Finco, Ecoquintas. Cada sesión deja algo construido y una tarea.
- **Por grupos de nivel** (usuarios clave primero, después el resto): Grupo Printer (K8/K4/K1), kölbi (zona 1 primero),
  FACO (una sesión de capacitación por marca).
- **Ruta de una persona** (alguien nuevo, Academy y tutoriales): SmartAgro.
- **Traspaso a los administradores del cliente** (TI o Sistemas): BLUESAT. Se cruza con el manual de administración.

**Secciones:**
- ✓ `kickoff›ruta_academy`, `kickoff›horarios`, `kickoff›tu_rol`, `kickoff›cadencia_del_servicio`,
  `planificacion›usuarios_permisos`, `planificacion›rutinas_adopcion`.
- ✗ Temario por sesión: objetivo, demo, ejercicio en vivo y tarea para la siguiente.
- ✗ Requisitos previos por sesión: correo y WhatsApp conectados, accesos, licencias.
- ✗ Asistencia y avance por persona: quién asistió, quién falta inducir, quién cumplió el ejercicio.
- ✗ Grabación, material y minuta enlazados por sesión.
- ✗ Sesiones reagendadas y su motivo.
- ✗ Preguntas frecuentes que salieron en la práctica.
- ✗ Grupos por nivel con la lista de personas.

**Se llena de:** lo vendido (handoff), los usuarios y equipos de HubSpot, los títulos «Capacitación … semana N» de las
reuniones y la minuta de cada una (asistentes, tareas). Nexus ya tiene casi todo eso: lo que falta es la vista que lo
junta por sesión.

**Citas:**
- «Enviar la minuta de la reunión, el enlace de la grabación y el enlace con el material didáctico» (Discover Puerto
  Rico, 2026-09-29)
- «a lo mejor vamos a necesitar incrementar dos sesiones más» (Alliance RH, 2026-09-02)

**Cuentas:** ALMOTEC, Alliance RH, Areyá, BLUESAT, Club de Amantes del Vino (por títulos), Discover Puerto Rico,
Ecoquintas, FACO, Grupo Printer, Metzger, Multiquimica, PRIMO, REMPRO, RC Inmobiliaria, Secure Title, Sfera Legal,
SmartAgro, Spectrum, TEC, Total Finco, Visual Branding y kölbi.

### 2. Consenso de proceso — 21 cuentas

**Para qué:** dejar por escrito, aprobado por el cliente, cómo funciona un proceso: etapas, qué se hace en cada una,
qué hace falta para avanzar y qué se automatiza. Es lo que el CSE presenta para que el cliente diga «sí, así». Hoy se
arma en documentos sueltos o se «cuenta en historias» (Metzger).

**Lo que dice el CSE:** «ocupo un consenso del proceso comercial», «hay que definir las etapas de tickets de
contabilidad», «necesito dejar escrita la política de leads».

**Plantillas:**
- **Proceso comercial, de lead a negocio** (12 cuentas): Alliance RH, FACO (uno por marca), Fundauna (admisión y
  matrícula), Metzger (gobierno y privado), Multiquimica, PRIMO, RC Inmobiliaria, REMPRO, SmartAgro (una sola
  vendedora), TEC (matrícula), Total Finco (colocación de créditos) y Sfera Legal (una ficha por división).
- **Proceso de servicio con tickets y SLA** (7 cuentas): ALMOTEC (un pipeline por departamento de posventa), BLUESAT
  («ticket madre»), Secure Title (fideicomisos y contabilidad), Spectrum, Grupo Inve (tiempos de respuesta),
  Fundauna (mesa de ayuda) y Cicadex (servicio al cliente).
- **Política de leads** (asignación, primer contacto, intentos, descalificación): FACO, RC Inmobiliaria, REMPRO,
  Metzger y Cicadex (de quién es la conversación de WhatsApp).
- **Otros procesos operativos:** cobranza de morosos (Ecoquintas), operación de tienda (Cemaco) y envío de email
  marketing (Discover).

**Secciones:**
- ✓ `planificacion›definicion_procesos`, `planificacion›pipelines`, `planificacion›ciclo_vida_crm`,
  `planificacion›automatizaciones`, `diagnostico›estado_actual` (hoy y después), compartida `process_mapping`.
- ✗ Condiciones para avanzar de etapa: qué es obligatorio y qué no.
- ✗ Variantes del mismo proceso por línea de negocio, marca o división.
- ✗ Motivos de pérdida o descalificación, y cuáles son recuperables.
- ✗ Tiempos por etapa (SLA) con quién responde.
- ✗ Reglas de asignación y rotación.
- ✗ Qué queda fuera del proceso, por ejemplo la posventa fuera del pipeline comercial.
- ✗ Aprobación del cliente: quién aprobó y cuándo.

**Se llena de:** las reuniones de levantamiento, los pipelines y propiedades que ya existen en HubSpot, y el diagnóstico.

**Citas:**
- «Se estableció que los procesos post-venta deben excluirse del pipeline comercial actual» (Metzger, resumen,
  2026-08-04)
- «Los estándares garantizan contacto con prospectos en menos de 24 horas» (FACO, resumen, 2026-09-16)

### 3. Registro de decisiones de la cuenta — 20 cuentas

**Para qué:** un solo lugar, que crece con cada reunión, con lo que se decidió (acordado, a debatir o en desacuerdo),
lo que queda pendiente de cada lado y los cambios de alcance. Hoy Nexus tiene la minuta de cada reunión y las tareas,
pero no el registro acumulado de la cuenta. Es lo que el cliente pide para su control interno (Cemaco) y lo que se
reclama cuando falta (Visual Branding, Discover).

**Lo que dice el CSE:** «ocupo el acta de lo que hemos acordado con Plastimex», «necesito ver qué decidimos de las
cotizaciones desde agosto», «mandale al cliente el estado de pendientes».

**Plantillas:**
- **Acta de un proyecto** (decisiones y pendientes por dueño): la mayoría.
- **Bitácora técnica** (incidencias, cambios de configuración, capacidad): kölbi y TEC.
- **Bitácora de riesgos y alcance** (interna: lo que se pidió fuera de lo pactado y lo que el cliente debe): Spectrum,
  Grupo Inve y Visual Branding (backlog de fase 2).
- **Norma operativa decidida** (por ejemplo, «ticket único, no proyectos»): ALMOTEC.

**Secciones:**
- ✓ `diagnostico›proximos_pasos` y `entrega›pendientes` (texto libre).
- ✗ Decisiones con estado (acordada, a debatir, en desacuerdo), fecha y reunión de origen.
- ✗ Pendientes del cliente y pendientes de Smarteam, con dueño y fecha.
- ✗ Cambios de alcance: qué se pidió, si entra o no, quién lo decidió.
- ✗ Dudas abiertas con HubSpot o con terceros.
- ✗ Enlaces a las grabaciones y minutas.

**Se llena de:** las minutas, decisiones y tareas que la lectura de cada reunión ya produce; los pedidos fuera de
alcance (`PedidoFueraDeAlcance`). Es casi todo vista, con poca escritura nueva.

**Citas:**
- «Compartir minutas: Enviar las actas de las sesiones realizadas al equipo para mantener un registro de los acuerdos.»
  (Cemaco, resumen, 2026-10-05)
- «Centralizar el contexto del proyecto y compartir las minutas y la documentación relevante tras las sesiones.» (Club
  de Amantes del Vino, resumen, 2026-10-08)

**Cuentas:** ALMOTEC, Alliance RH, BLUESAT, Club de Amantes del Vino, Cemaco, Discover, Fundauna, Grupo Inve, Grupo
Printer, FACO, JUDESUR, Plastimex, RC Inmobiliaria, Secure Title, SmartAgro, Spectrum, TEC, Visual Branding, kölbi y
Sfera Legal.

### 4. Catálogo de paneles e indicadores — 17 cuentas

**Para qué:** antes de construir reportes, ponerse de acuerdo en qué pregunta responde cada uno, de qué propiedad sale,
quién lo mira y qué decide con él. Lo piden sobre todo las gerencias al final de la capacitación. Varias cuentas dicen
que la propiedad que habilita el informe todavía no existe.

**Lo que dice el CSE:** «ocupo la propuesta de paneles para gerencia», «armame el catálogo de indicadores de servicio»,
«necesito los reportes de leads por pipeline».

**Plantillas:**
- **Panel de gerencia comercial** (embudo, conversión, productividad por vendedor, forecast, metas): Areyá, Metzger,
  Total Finco, PRIMO, RC Inmobiliaria, FACO, Sfera Legal.
- **Indicadores de servicio** (tiempos, carga por persona, reincidencia): Cicadex, Secure Title, BLUESAT, Spectrum.
- **Atribución de marketing** (origen del lead y costo por canal): Ecoquintas, RC Inmobiliaria.
- **Rutina gerencial** (qué mira la gerencia cada mañana y qué hace con eso): ALMOTEC.
- **Salud del cliente** (health score): Grupo Inve; ver también el n.º 20.

**Secciones:**
- ✓ `planificacion›informes`, `planificacion›metricas_exito`, `kickoff›metricas_exito`, `diagnostico›preguntas`.
- ✗ Por informe: la pregunta de negocio, el objeto de origen, la propiedad que lo habilita, los filtros, quién lo ve,
  la meta y la decisión que dispara.
- ✗ Diferencia entre informe y panel, y qué panel ve cada rol (con sus permisos).
- ✗ Datos que faltan para poder medirlo.

**Se llena de:** el diagnóstico (las preguntas que el cliente quiere responder), las propiedades y pipelines de HubSpot
y las reuniones de «Reporting y paneles».

**Citas:**
- «quiere ver el funel completo y en dónde se nos está perdiendo» (Areyá, 2026-09-02)
- «tiene que haber una propiedad que lo diferencie dentro del mismo negocio para poder que cuando yo saco el informe»
  (BLUESAT, 2026-09-25)

**Cuentas:** ALMOTEC, Alliance RH, Areyá, BLUESAT, Cicadex, Ecoquintas, Grupo Inve, FACO, Metzger, Multiquimica,
PRIMO, RC Inmobiliaria, Secure Title, Sfera Legal, Spectrum, TEC (por títulos) y Total Finco.

### 5. Propuesta de siguiente paso — 15 cuentas

**Para qué:** la propuesta que nace dentro de una cuenta que ya es cliente: una fase nueva, una ampliación, más
licencias o créditos, o pasar a un acuerdo recurrente. No es la propuesta de Ventas de un prospecto: la arma el CSE, a
veces con el comercial, desde lo que ya sabe de la cuenta.

**Lo que dice el CSE:** «ocupo una propuesta por fases que la gerencia pueda priorizar», «armame las alternativas A, B
y C con horas», «necesito cotizar los créditos del agente».

**Plantillas:**
- **Por fases, con piezas que se prenden o apagan:** Ecoquintas (ordenar, automatizar, medir), Cemaco, Plastimex (con
  el socio de SAP) y Club de Amantes del Vino.
- **Con alternativas escalables** (A, B, C, con horas y costo): JUDESUR y Metzger.
- **Licencias y créditos** (una calculadora editable en vivo): Fundauna, FACO (agente de prospección y upgrade) y
  Grupo Printer (créditos de WhatsApp).
- **Continuidad o acuerdo recurrente** (por horizontes, o bolsa de horas por trimestre): PRIMO, Total Finco, kölbi,
  Cayalá y Grupo Inve.
- **Proyecto corto separado de la continuidad:** Cayalá. El cliente pidió dos propuestas por separado.
- **Comparativo contra la competencia:** FACO, contra una oferta de Bitrix. Es un caso suelto.

**Secciones:**
- ✓ `business-case›dolores`, `business-case›antes_despues`, `business-case›solucion`, `business-case›roi`,
  `business-case›inversion`, `recurrente›acuerdo`, `recurrente›nivel_servicio`, `shared›forma_de_pago`,
  `shared›casos_de_uso`, `entrega›continuidad`.
- ✗ Piezas seleccionables con su precio (la gerencia marca cuáles).
- ✗ Alternativas comparadas lado a lado.
- ✗ Calculadora de licencias y créditos.
- ✗ Responsabilidades entre proveedores (cuando hay un tercero, como el socio de SAP).
- ✗ Lo que ya se logró en la cuenta, como punto de partida.

**Se llena de:** la entrega o el estado actual de la cuenta, los pedidos fuera de alcance, el diagnóstico de uso y el
catálogo de casos de uso con su precio.

**Citas:**
- «Fase 1: ordenar, Fase 2: automatizar y Fase 3: medir y aprender» (Ecoquintas, resumen, 2026-10-19)
- «Tal vez lo único que te pediría serían las propuestas separadas.» (Cayalá, 2026-10-02)

### 6. Requerimiento técnico de integración — 15 cuentas (ya existe)

**Para qué:** el tipo `desarrollo` (pieza «Integraciones») ya cubre la arquitectura, los campos y la estimación. Las
reuniones piden variantes y tres secciones que hoy no tiene.

**Lo que dice el CSE:** «ocupo el alcance de la integración con SAP para que lo firmen antes de empezar», «armame la
matriz de homologación con InfoClic».

**Plantillas:**
- **ERP en los dos sentidos:** Areyá (EnKontrol), Cemaco, FACO (Intelisis), Visual Branding (Odoo) y Grupo Printer
  (SAP).
- **ERP en un solo sentido, ERP → HubSpot:** Plastimex.
- **Firma de documentos:** Grupo Inve y RC Inmobiliaria (DocuSign).
- **Canal o notificaciones:** Club de Amantes del Vino (OneSignal).
- **Sistema de operación:** Spectrum (Smart Building), TEC (Fundatec) y kölbi (InfoClic).
- **Aplicación o portal a medida:** JUDESUR (consulta de saldos, control de asistencia).
- **Inventario de sistemas antes de decidir:** Cicadex (viabilidad y costo de cada integración).

**Secciones:**
- ✓ Todo `desarrollo` (`requerimiento`, `arquitectura`, `relacion_objetos`, `propiedades`, `comunicacion`,
  `estimacion`, `criterios_exito`).
- ✗ El identificador único y la tabla de equivalencias entre sistemas (cédula, NIT, vendedor de SAP ↔ usuario de
  HubSpot): Cemaco, Grupo Printer, kölbi.
- ✗ Alcance firmado: qué entra, qué no y qué cambió desde la firma (en Grupo Printer pasaron de 10 a 25 propiedades).
- ✗ Lo que debe entregar el cliente o un tercero (API, credenciales, contrato) y su estado: JUDESUR, Areyá, Spectrum.

**Citas:**
- «Se estableció utilizar la cédula de ciudadanía como llave e identificador único dentro del sistema» (Cemaco,
  resumen)
- «Si una reserva, por ejemplo, no se paga en 48 horas, el vehículo vuelve a estar disponible.» (FACO, 2026-10-28)

**Cuentas:** Areyá, Club de Amantes del Vino, Cemaco, Cicadex, FACO, Grupo Inve, Grupo Printer, Plastimex, Spectrum,
TEC, Visual Branding, kölbi, Multiquimica, JUDESUR y RC Inmobiliaria.

### 7. Diccionario de datos — 12 cuentas

**Para qué:** qué propiedades existen por objeto, para qué sirve cada una, si se crea, se usa la nativa o se borra,
qué valores admite y quién es su dueño. Sale en reimplementaciones (limpiar lo que dejó otro) y en integraciones.

**Lo que dice el CSE:** «ocupo la matriz de propiedades por objeto», «armame el diccionario con las listas de valores
por sucursal».

**Plantillas:**
- **Diccionario por objeto, con decisión** (crear, usar la nativa o eliminar): Metzger, Total Finco, REMPRO, Spectrum.
- **Modelo de datos 360 con segmentos iniciales:** Cemaco.
- **Listas de valores controladas** (sucursales, intereses, idioma): Plastimex y Discover.
- **Arquitectura de varias empresas** (qué propiedad es común y cuál es de cada empresa del grupo): Multiquimica.

**Secciones:**
- ✓ `planificacion›propiedades`, `implementacion›arquitectura_propiedades`, `desarrollo›propiedades`.
- ✗ Decisión por propiedad: crear, usar la nativa o eliminar, y por qué.
- ✗ Dueño de cada campo y de quién puede crearlos.
- ✗ Obligatoria o no, y por qué.
- ✗ Sistema de origen.
- ✗ Salud: cuánto se llena hoy.

**Se llena de:** las propiedades reales del portal de HubSpot (nombre, tipo, valores, % de llenado) y las reuniones de
arquitectura.

**Citas:**
- «hay discrepancias entre las propiedades de empresa, de negocio y de contacto» (Plastimex, 2026-10-15)
- «Se acordó eliminar propiedades redundantes en la plataforma y mantener solo variables esenciales» (Metzger,
  resumen, 2026-08-04)

**Cuentas:** BLUESAT, Club de Amantes del Vino, Cemaco, Discover, Metzger, Multiquimica, Plastimex, REMPRO, Spectrum,
Total Finco, Visual Branding y kölbi.

### 8. Ficha de campaña — 12 cuentas (no existe)

**Para qué:** el artefacto del día a día del SmartLoop de marketing. Cada campaña tiene objetivo, segmento, exclusiones,
piezas, canal, presupuesto, fechas y resultado. Hoy no hay dónde ponerla. En kölbi hay al menos 10 títulos de
campañas en 90 días.

**Lo que dice el CSE:** «ocupo la ficha de la campaña del día de la madre», «armame el brief de la landing del
evento», «necesito el mapa de segmentos y exclusiones».

**Plantillas:**
- **Campaña de WhatsApp o correo** (una copia por campaña): kölbi, FACO (test drive y leads que no contestan).
- **Lanzamiento con plan B:** SmartAgro.
- **Brief de evento o landing:** REMPRO, Discover y Spectrum (ferias).
- **Mapa de segmentos y exclusiones:** Ecoquintas, Alliance RH (mensaje por perfil), Cemaco y Cicadex (marcas por
  canal).
- **Inventario de recorridos a migrar:** Club de Amantes del Vino (20 segmentos, 9 journeys, 11 workflows).
- **Flujo de producción de piezas y kit de marca:** TEC.

**Secciones:**
- ✓ `planificacion›formularios`, `planificacion›canales_entrada`, `planificacion›automatizaciones`,
  `implementacion›procesos_marketing`.
- ✗ Objetivo y meta de la campaña.
- ✗ Segmento, criterio y exclusiones.
- ✗ Piezas y canal, con su estado.
- ✗ Presupuesto y fechas.
- ✗ Nutrición o seguimiento automático.
- ✗ Resultado contra la meta, al cerrar.

**Se llena de:** las listas, correos, campañas y formularios de HubSpot, y las reuniones de «campaña» o «sprint».

**Citas:**
- «La campaña del día de la madre cuenta con 5272000 colones asignados para el periodo de agosto.» (kölbi, resumen,
  2026-07-31)
- «son 20 segmentos dinámicos, nueve journeys, 11 workflows» (Club de Amantes del Vino, 2026-08-06)

**Cuentas:** kölbi, FACO, SmartAgro, REMPRO, Discover, Spectrum, Ecoquintas, Alliance RH, TEC, Club de Amantes del Vino,
Cicadex y Cemaco.

### 9. Diagnóstico por área o de uso — 12 cuentas (ya existe)

**Para qué:** el diagnóstico ya tiene las plantillas esencial y completa. Las reuniones piden tres variantes más.

**Lo que dice el CSE:** «tengo de frente una presentación de diagnóstico», «ocupo el diagnóstico de marketing con el
cuestionario», «necesito un diagnóstico ligero para proponerle el SmartLoop».

**Plantillas:**
- **Por área** (marketing, servicio o varias áreas, con salvedades de lo que no se pudo ver): Ecoquintas, Sfera Legal y
  Cemaco (marketing), Spectrum (servicio), Cicadex (varias áreas).
- **De uso** (licencias y módulos contratados contra los usados, y quién usa qué): Plastimex, FACO y Alliance RH.
- **Ligero, para definir el SmartLoop** (retos y casos de uso priorizados por carril): Grupo Inve.
- La presentación de la situación actual ya la cubre el tipo: Cemaco, kölbi, Metzger, SmartAgro y Fundauna.

**Secciones:**
- ✓ Todas las del tipo (`situacion_actual`, `causa_raiz`, `gap_analysis`, `escala`, `equipos_licencias`,
  `recomendaciones`…).
- ✗ Salvedades: qué área o persona no se pudo entrevistar.
- ✗ Uso por módulo y por persona contra lo contratado.
- ✗ Cuestionario de madurez por afirmaciones (afirmación, respuesta, contexto).

**Citas:**
- «aparecen con 42 puntos de 100 en el uso de plataforma» (FACO, 2026-08-18)
- «incluir una salvedad explícita sobre la imposibilidad de realizar la reunión con la gerencia de ventas» (Cicadex,
  resumen)

### 10. Plan de adopción — 11 cuentas

**Para qué:** que lo entregado se use: qué comportamiento se espera de cada rol, qué es obligatorio registrar, cómo se
mide y qué ve la gerencia. Es distinto de la capacitación, que enseña: esto fija hábitos y los mide. Las tres variantes
que dio Elías aparecen tal cual.

**Lo que dice el CSE:** «ocupo un plan de adopción para los vendedores», «armame el estándar de uso del CRM», «necesito
presentarle el proyecto al contact center».

**Plantillas:**
- **Equipo comercial que va a usar HubSpot** (registro obligatorio, calidad del dato, rutina de la gerencia): FACO,
  Plastimex, Sfera Legal, Total Finco, Multiquimica, PRIMO y ALMOTEC.
- **Organización con niveles** (dirección, líderes y representantes; zonas u olas): kölbi (zona 1 primero, 50
  personas), Cayalá (presentar el proyecto al contact center para que no se sienta excluido) y TEC (qué herramienta usa
  cada quien).
- **Componente técnico** (los administradores del cliente quedan a cargo): BLUESAT. Ver también el n.º 1.
- La cuenta sin adopción, que la pide desde el diagnóstico: Alliance RH.

**Secciones:**
- ✓ La pieza «Adopción» de SmartLoop (`cycle-adoption`), `planificacion›rutinas_adopcion`,
  `planificacion›plan_despliegue` (por olas), `kickoff›tu_rol`.
- ✗ Comportamientos esperados por rol.
- ✗ Reglas que no se pueden romper (campos obligatorios, motivo de pérdida, registro de interacciones).
- ✗ Cómo se mide la adopción y con qué umbral.
- ✗ Protocolo de altas y bajas de usuarios.
- ✗ Plan de comunicación al equipo que opera.

**Se llena de:** los usuarios y su actividad en HubSpot, el puntaje de uso de la plataforma, el proceso acordado
(n.º 2) y las capacitaciones dadas (n.º 1).

**Citas:**
- «La adopción se demuestra cuando el equipo utiliza la plataforma de manera constante» (ALMOTEC, 2026-09-04)
- «iniciando con 50 en capacitación, zona uno, e incorporando progresivamente a los demás» (kölbi, 2026-10-13)

### 11. Plan de migración y limpieza de datos — 10 cuentas (no existe)

**Para qué:** traer datos de otro sistema o limpiar los que hay: qué se trae, cómo se mapea, qué se deduplica, qué no
se trae, la prueba con una muestra y la carga final.

**Lo que dice el CSE:** «ocupo el plan de migración desde Zoho», «necesito el plan de depuración de la base».

**Plantillas:**
- **Migración desde otro CRM o herramienta:** PRIMO (Zoho), Club de Amantes del Vino (Salesforce Marketing Cloud),
  Discover (SendGrid) y Areyá.
- **Limpieza y deduplicación:** Cemaco (81.000 duplicados en 500.000), RC Inmobiliaria, TEC, Plastimex (proyecto
  propio) y Cicadex.
- **Cierre de una migración atrasada:** Sfera Legal.

**Secciones:**
- ✓ `desarrollo›propiedades` (mapeo de campos).
- ✗ Inventario de origen.
- ✗ Mapeo campo → propiedad con su regla y quién decide.
- ✗ Reglas de limpieza y deduplicación.
- ✗ Lo que no se migra.
- ✗ Contactos de marketing y exclusión de bajas.
- ✗ Prueba con muestra, carga final y validación.

**Citas:**
- «de esos 500,000 estamos hablando de unos 81,000 que se duplicaron» (Cemaco, 2026-10-27)
- «Borrar Datos Prueba: Eliminar todos los registros de prueba existentes en el sistema antes de realizar la carga
  oficial.» (Areyá, resumen, 2026-10-28)

### 12. Diseño de WhatsApp y agente — 9 cuentas (no existe)

**Para qué:** WhatsApp aparece en casi todas las conversaciones de 2026 y tiene decisiones propias: canal nativo o
tercero, plantillas aprobadas, quién se queda la conversación, agente de IA (guion, identidad, conocimiento,
derivación a humano) y créditos. Es la «planificación de WhatsApp» que Elías puso de ejemplo.

**Lo que dice el CSE:** «ocupo el diseño del agente de WhatsApp», «armame el caso de uso del agente, fase 1 y fase 2»,
«necesito las reglas de quién se queda la conversación».

**Plantillas:**
- **Agente de atención** (menú, derivaciones, horarios, base de conocimiento, NPS): Areyá, Cayalá y RC Inmobiliaria
  (el agente «Camila»).
- **Agente de prospección o calificación** (con cálculo de créditos): FACO, REMPRO y Fundauna.
- **Asignación de conversaciones entre vendedores:** Cicadex («nuestros vendedores son competitivos») y kölbi (reglas
  de uso para vendedores).
- **Exploración del caso con el flujograma del cliente:** Grupo Printer.

**Secciones:**
- ✓ `planificacion›conversaciones`, `planificacion›canales_entrada`, `planificacion›automatizaciones`,
  `implementacion›prompts_breeze`.
- ✗ Objetivo del agente e intenciones que atiende.
- ✗ Identidad y tono.
- ✗ Base de conocimiento, por línea de negocio.
- ✗ Derivación a humano y horarios.
- ✗ Reglas de asignación y de quién es la conversación.
- ✗ Plantillas de mensajes aprobadas.
- ✗ Fase 1 y fase 2.
- ✗ Créditos y volumen esperado.

**Citas:**
- «son como 20 hojas, pero como me comentaba Juan Carlos que hay que poner el texto casi tal cual» (Areyá,
  2026-09-02)
- «Se determinó la necesidad de cotizar un paquete adicional de 55000 créditos» (Grupo Printer, resumen, 2026-10-28)

### 13. Exploración por área o por caso — 9 cuentas (ya existe)

**Para qué:** el tipo ya existe (lo que sabemos, lo que suponemos, el plan de sesiones, a quién involucrar). Las
reuniones piden tres plantillas.

**Lo que dice el CSE:** «necesito explorar mejor marketing», «ocupo la guía para levantar cada área».

**Plantillas:**
- **Por área, con guía de entrevista** (objetivos del departamento, cómo mide hoy, proceso soñado, herramientas):
  Cicadex («ya tenemos una guía preparada»), Cemaco y Sfera Legal (marketing) y RC Inmobiliaria (ventas, después del
  pase de cuenta).
- **Con el equipo que opera, antes de implementar:** Cayalá (contact center).
- **Proyecto nuevo dentro de una cuenta existente:** Fundauna (maestrías nuevas) y Secure Title (equipo comercial).
- **Caso puntual:** Grupo Printer (WhatsApp) y Discover (landing).

**Secciones:**
- ✓ Todas las de `exploracion`.
- ✗ Guía de preguntas por área.
- ✗ Agenda de entrevistas con su estado (hecha, por reagendar).

**Citas:**
- «nosotros ya tenemos una guía preparada para para hacer toda la exploración del proceso» (Cicadex, 2026-10-21)
- «Entonces, una buena etapa de exploración en conjunto, todos ya podemos definir el proyecto como tal» (Cayalá,
  2026-09-28)

### 14. Usuarios, licencias y permisos — 9 cuentas

**Para qué:** quién tiene qué licencia, qué ve cada equipo, qué es confidencial entre proyectos, y qué hacer cuando
alguien entra o sale. Va mejor como sección de la planificación y como plantilla corta de «gobierno del portal» que
como tipo propio.

**Lo que dice el CSE:** «ocupo la matriz de permisos por división», «armame el checklist de baja de un usuario».

**Secciones:**
- ✓ `planificacion›usuarios_permisos`, `diagnostico›equipos_licencias`.
- ✗ Equipos y visibilidad entre proyectos o programas (Fundauna).
- ✗ Bandejas por división (Sfera Legal).
- ✗ Licencias sobrantes o por reasignar (BLUESAT).
- ✗ Checklist de altas y bajas, con a quién se le reasignan los registros (PRIMO, Plastimex, ALMOTEC).

**Citas:**
- «cada vez que ustedes vayan a eliminar a un usuario… hay que asignarle contactos, negocios y ta[reas]» (Plastimex)
- «Se acordó crear equipos en HubSpot segmentados por programas de posgrado» (Fundauna, resumen, 2026-09-17)

**Cuentas:** Alliance RH, BLUESAT, Club de Amantes del Vino, Fundauna, Plastimex, Sfera Legal, Total Finco, PRIMO y
ALMOTEC.

### 15. Informe de avance y valor — 8 cuentas (no existe)

**Para qué:** el informe periódico al cliente (quincenal o mensual) con lo avanzado, el valor logrado y lo que viene.
La Entrega solo existe al cerrar. En SmartLoop es lo que defiende la renovación, y en los proyectos con problemas es
el plan de recuperación.

**Lo que dice el CSE:** «ocupo el informe quincenal de kölbi», «necesito el estado para finanzas antes de la
renovación», «armame el estatus de las tres empresas de Grupo Inve».

**Plantillas:**
- **Informe periódico** (por campaña y zona): kölbi.
- **Valor del servicio para la renovación:** FACO (con un competidor barato en la mesa).
- **Estado de una cuenta con varios proyectos:** Grupo Inve.
- **Estado y plan de recuperación:** BLUESAT, Discover y Grupo Printer (revisiones quincenales con la gerencia).
- **Avance con bloqueos de terceros y la bolsa de horas:** JUDESUR. Ver también el n.º 16.

**Secciones:**
- ✓ `entrega›logros`, `entrega›impacto`, `entrega›escala`, `entrega›pendientes`, `cronograma›cronograma`.
- ✗ Período del informe.
- ✗ Avance por frente o proyecto.
- ✗ Uso de la plataforma y su evolución.
- ✗ Riesgos y lo que el cliente debe.
- ✗ Horas consumidas.

**Citas:**
- «yo envío informes a este cliente cada 15 días prácticamente, o sea, mitad de mes y a final de mes» (kölbi,
  2026-07-31)
- «pasamos de un proceso manual a un proceso ya pues muy automático» (FACO, 2026-08-18)

### 16. Hoja de ruta de la cuenta (backlog del SmartLoop) — 8 cuentas

**Para qué:** en un servicio recurrente, la lista priorizada de lo que se va a hacer en los próximos meses, con los
carriles activos, lo que entra a cada ciclo, lo que queda fuera y por qué, y cuántas horas quedan. Es la pieza que
destraba la venta del acuerdo macro y la conversación de «¿qué hacemos este trimestre?».

**Lo que dice el CSE:** «ocupo el plan de acción de ventas para kölbi», «armame el backlog de Cayalá con las 45 horas
del trimestre», «necesito los casos de uso de Grupo Inve para los próximos tres meses».

**Plantillas:**
- **Plan anual con plan de choque** (frentes, gobierno, primeras 8 semanas): FACO.
- **Backlog priorizado con bolsa de horas:** Cayalá, JUDESUR y Grupo Inve (las solicitudes de soporte contra el
  alcance del contrato).
- **Plan de acción del frente difícil:** kölbi (ventas).
- **Lo que se dejó para la fase 2:** Visual Branding.
- **Potenciar el uso, por demanda:** Plastimex y TEC (el CSE descubre los casos sesión a sesión).

**Secciones:**
- ✓ `planificacion›roadmap`, `kickoff›como_trabajamos`, `kickoff›primer_ciclo`, `recurrente›operacion`,
  `shared›casos_de_uso`.
- ✗ Backlog priorizado (valor, esfuerzo, quién lo pidió, reunión de origen).
- ✗ Carriles activos (uno a tres).
- ✗ Lo diferido y por qué.
- ✗ Saldo de horas y consumo por solicitud.

**Citas:**
- «prácticamente tendrías 45 horas por trimestre, ¿cierto?, para gastarlas en lo que necesite» (Cayalá)
- «Se acordó implementar un enfoque de uno o tres carriles activos para gestionar los casos de uso» (Grupo Inve,
  resumen)

### 17. Guion de pruebas y aceptación — 7 cuentas (no existe)

**Para qué:** antes de entregar, recorrer cada flujo con datos de prueba y el resultado esperado, y después del go-live
anotar los errores hasta cerrarlos. Lo pide el cliente cuando la entrega anterior falló.

**Lo que dice el CSE:** «ocupo el guion de la demo por flujo», «necesito la bitácora de errores del go-live».

**Secciones:**
- ✓ `desarrollo›criterios_exito`.
- ✗ Flujos a probar, con datos de prueba, resultado esperado y quién valida.
- ✗ Estado de cada flujo.
- ✗ Bitácora de errores, con formulario para que el cliente los reporte.

**Citas:**
- «quiero ver paso a paso que esto fluya» (BLUESAT, 2026-09-11)
- «Se acordó crear un formulario para que los clientes reporten errores adjuntando el enlace correspondiente»
  (Grupo Printer, resumen)

**Cuentas:** BLUESAT, Grupo Printer, kölbi, TEC, Areyá (demos), Metzger (validación) y Visual Branding (ejemplo
práctico).

### 18. Pase de cuenta entre CSE — 6 cuentas (interno)

**Para qué:** cuando una cuenta cambia de CSE: quién es el cliente, qué compró, el objetivo, lo acordado, los riesgos,
dónde está la documentación y qué quedó a medias. Es interno y no se publica. En la muestra pasó en 6 de 29 cuentas en
90 días, y en Discover el cliente escaló porque el pase se perdió.

**Lo que dice el CSE:** «ocupo el pase de cuenta de Metzger», «recibo RC: dame lo que hay que saber».

**Secciones:**
- ✓ El handoff de Ventas a CS cubre parte (lo vendido y el contexto).
- ✗ Acuerdos vigentes y pendientes de cada lado (sale del n.º 3).
- ✗ Riesgos y el humor del cliente.
- ✗ Dónde vive la documentación técnica.

**Citas:**
- «Se centralizará la documentación de las sesiones anteriores en una carpeta compartida» (Metzger, resumen,
  2026-08-26)
- «Solicitar manual tecnico: Contactar a Juan y Alejo para solicitar el video y el manual» (RC Inmobiliaria, resumen,
  2026-10-28)

**Cuentas:** Metzger, RC Inmobiliaria, Discover, kölbi, Areyá y Grupo Inve.

### 19. Especificación de cotizaciones — 5 cuentas

Las cotizaciones de varios países, con reglas de cálculo, catálogo y monedas, o conectadas al ERP. Va como plantilla
de la planificación, que ya tiene `planificacion›cotizaciones`. Faltan:
- ✗ Variables y orden de cálculo.
- ✗ Formato por país.
- ✗ Quién la edita.

Cuentas: Grupo Inve (Analisa, 5 países), Visual Branding, REMPRO, Multiquimica y Plastimex.

### 20. Encuesta y salud del cliente — 4 cuentas

Encuestas de satisfacción (anual, trimestral, después de una capacitación), su panel de resultados y el «health score»
de los clientes del cliente. Faltan:
- ✗ Objetivo, preguntas, escala y lógica condicional.
- ✗ Reglas del histórico.
- ✗ Panel de resultados.
- ✗ Umbrales de salud.

Cuentas: Multiquimica, ALMOTEC, Grupo Inve y Cayalá (NPS en el agente).

---

## Para las cuentas sin casos de uso ni actividades claras

En la muestra, **10 de 29 cuentas** tienen el trabajo difuso: Alliance RH, Cicadex, Grupo Inve (a nivel de la cuenta),
TEC, Plastimex, kölbi (ventas), Spectrum (servicio e integración), Sfera Legal (marketing), Cemaco (fase 2) y
Ecoquintas (marketing). Las demás tienen actividades concretas en lo que se habla, pero **casi ninguna las tiene
escritas**: varias notas dicen «falta tenerlos escritos en un solo lugar». Además, en producción no hay ningún caso de
uso aplicado a un cliente (0 filas, `docs/expansion-y-adopcion-plan.md`).

Para esas cuentas sirven artefactos que **no necesitan un caso de uso para arrancar** y que, al llenarse, los producen.
En este orden:

1. **Diagnóstico de uso** (n.º 9): qué tienen, qué usan y quién. Sale casi entero de HubSpot (licencias, usuarios
   activos, propiedades llenas, workflows prendidos) y del puntaje de uso de la plataforma. Es la conversación de FACO
   («42 puntos de 100») y de Alliance RH («disponible, pero sin adopción real»).
2. **Hoja de ruta de la cuenta** (n.º 16): convierte retos y pedidos sueltos en una lista priorizada con carriles.
   Grupo Inve lo dice tal cual: sin claridad en los casos de uso de los próximos meses no se vende el acuerdo macro.
3. **Registro de decisiones y pedidos** (n.º 3): junta lo que el cliente pide reunión a reunión. Cada pedido es un
   candidato a caso de uso. Se une al flujo de pedidos fuera de alcance del plan E.
4. **Exploración por área con guía** (n.º 13): cuando no se sabe qué hacer, se pregunta con orden (Cicadex).
5. **Plan de adopción y estándar de uso** (n.º 10): siempre vale, aunque no haya nada nuevo que construir. Es lo que
   piden Plastimex, Sfera Legal y Multiquimica.
6. **Informe de avance y valor** (n.º 15): muestra valor aunque el trabajo sea por demanda, y llega a la renovación
   con algo en la mano.

## Señales sueltas

- **Handoff, kickoff, cronograma y entrega aparecen y se usan** (Cayalá, Areyá, Cemaco, PRIMO, Visual Branding, Grupo
  Printer). No piden un tipo nuevo. Lo que sí piden es el **handoff de un proyecto corto** (Cayalá: 8 semanas,
  2.500 USD).
- **Manual de operación del portal:** BLUESAT (traspaso a Sistemas), FACO (el flujo con Atom que dejó otro
  implementador) y Spectrum (catálogo de automatizaciones). La «Guía de construcción» (`implementacion`) es interna. El
  cliente pide la versión para quien administra.
- **Proceso de cobranza:** Ecoquintas. Es un caso solo, pero completo: tickets, prioridades, promesas de pago y 8
  automatizaciones.
- **Lienzo editable en vivo durante la llamada:** Fundauna armó la propuesta de licencias como una tabla editada en la
  reunión. Es lo más cercano a «suplir Miro» que se vio.

## Lo que no se pudo ver

- **La mitad de las reuniones no tiene texto.** Estas 30 fichas tuvieron 847 reuniones en 90 días y solo 421 con más
  de 3.000 caracteres de texto. El resto se leyó por título o no se leyó.
- **No se leyó cada reunión entera:** 4 por cuenta (120 de 421), el resumen (cortado a 3.500 caracteres) y las líneas
  con palabras de entrega. Lo que se dice sin esas palabras pudo quedar fuera. Los conteos de reuniones por artefacto
  son de esa muestra, no del total.
- **Los documentos que se nombran no se abrieron:** los Excel de homologación, los flujogramas del cliente, las
  propuestas en Slides y las minutas en Drive. Se sabe que existen porque se nombran, no qué contienen ni qué tan
  completos están.
- **Reuniones que no son de la cuenta:** en SmartAgro, 2 de las 4 leídas son internas de Smarteam (una capacitación de
  Nexus y una bienvenida al equipo). En JUDESUR, 1 de 4 es una charla interna. En FACO, un tramo de la reunión del
  2026-10-08 habla de licencias de otra cuenta, porque esa llamada cubrió dos clientes. Se descartaron.
- **Faco y Honda Costa Rica parecen la misma empresa en dos fichas.** Antes de fusionarlas
  (`scripts/merge-duplicate-clients.ts`), hay que verificar que no sean dos entidades del mismo grupo.
- **Fuera de la muestra:** 20 cuentas de cartera con reuniones con texto en 90 días, y todas las que tuvieron reuniones
  sin ningún texto. Sitios web y desarrollo puro quedaron flacos (solo JUDESUR y las webs de RC Inmobiliaria). Cicadex
  muestra la preventa del director comercial, no al CSE.
- **No se vio qué entrega hoy el CSE fuera de Nexus** (Slides, Docs, Excel), así que no se sabe cuántos de estos
  artefactos ya existen en Drive con otro formato.
