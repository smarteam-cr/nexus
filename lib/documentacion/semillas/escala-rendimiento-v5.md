---
documento: Escala de Rendimiento Smarteam — Escalas departamentales
version: 5.2.0
fecha: 2026-09-10
---

# Introducción

La Escala de Rendimiento es el instrumento con el que Smarteam diagnostica cómo está operando un departamento de un prospecto o cliente. Ubica a cada departamento —Ventas, Marketing y Servicio— en uno de cinco niveles de madurez, a partir de la evidencia que arroja una exploración. No describe productos ni servicios: describe estados de madurez.

Hay tres piezas, en orden. Este documento es el **reglamento**: define qué significa cada nivel en cada dimensión y con qué señales observables se reconoce. El **diagnóstico** es la actividad: alguien explora el departamento, junta evidencia y ubica cada dimensión en su nivel usando este reglamento. La **página de resultados** es lo que ve el cliente: el estado actual del departamento y qué le toca mejorar.

Los cinco niveles, de menor a mayor madurez, son **Deficiente, Inicial, Funcional, Eficiente y Óptimo**. Funcional es la base: arquitectura montada, procesos que se siguen, roles definidos, datos confiables, dashboards descriptivos y automatización simple. Todo lo que pide lógica condicional, instrumentación fina, coordinación entre áreas o inteligencia artificial pertenece a Eficiente u Óptimo. Deficiente e Inicial describen a un departamento que todavía no llega a esa base.

Cada departamento se mira a través de ocho dimensiones, agrupadas en dos capas. La **base operativa** —cómo está montado el departamento por dentro— reúne Procesos y Rutinas, Tecnología y Automatización, Datos, y Equipo y Gobierno. La **producción** —qué entrega el departamento hacia afuera— reúne cómo se presenta, a quién prioriza, con qué alcance llega y cómo aprende. El resultado de un departamento se lee por capa: en qué nivel está su base operativa y en qué nivel está su producción.

---

# Cómo se usa la escala

## Cómo se evalúa cada dimensión

Se diagnostica un departamento a la vez, recorriendo sus ocho dimensiones una por una. Para cada dimensión se contrasta la evidencia recogida en la exploración contra las señales de cada nivel, de Deficiente a Óptimo, hasta encontrar el que calza. El nivel del departamento no se juzga de un vistazo: se construye a partir de esas ocho lecturas.

## El nivel: de la dimensión al departamento

Cada dimensión se ubica en un nivel del 1 al 5: Deficiente 1, Inicial 2, Funcional 3, Eficiente 4, Óptimo 5. Ese número no es una nota inventada aparte: es el nivel mismo, expresado como cifra para poder graficarlo.

El nivel de una capa es el de su dimensión más débil. Si en la base operativa Procesos, Tecnología y Equipo están en Funcional pero Datos está en Inicial, la base operativa es Inicial. Se toma el piso, no el promedio, a propósito: promediar dejaría que una dimensión rota se esconda detrás de las fuertes, y es justo esa dimensión rota la que el cliente tiene que arreglar. El nivel de la capa nunca reemplaza al detalle: las cuatro dimensiones se reportan siempre, porque ahí está lo accionable.

El nivel del departamento, si se quiere un solo número, es el resumen de sus dos capas. Pero la lectura útil son las dos capas, no la cifra suelta: "tu base operativa está en Funcional, tu producción en Inicial" dice algo accionable que "Ventas: Inicial" esconde.

## Cercanía al siguiente nivel

Además del nivel, conviene registrar qué tan cerca está una dimensión de cruzar al siguiente. Una dimensión puede estar en Funcional con varias señales de Eficiente ya presentes pero insuficientes para cruzar —por ejemplo, playbooks que empiezan a usarse sin metodología formal todavía—. Eso se anota una vez sobre la dimensión ("Funcional, cerca de Eficiente"), no señal por señal.

## Volver a medir

El diagnóstico no se hace una sola vez. Un departamento cambia, y la escala sirve para ver ese cambio: dónde estaba, dónde está y qué se movió.

La primera remedición va entre 60 y 90 días después de entregar una implementación. Ese plazo no es arbitrario — varios criterios de Funcional describen comportamiento sostenido, no algo instalado: que la cadencia de contacto se cumpla, que el equipo use el CRM por convicción, que la reunión se sostenga, que el blog publique con regularidad. Nada de eso se puede verificar el día de la entrega, solo después de que el equipo haya operado un tiempo.

Después de esa primera remedición, conviene repetirla de forma periódica —trimestral es una cadencia razonable— para que el avance sea visible y no una impresión.

Al volver a medir se usan las mismas ocho dimensiones y los mismos criterios. Lo que se compara es el nivel de cada dimensión contra la medición anterior, no una sensación general de mejora.

## Rol de la IA en el diagnóstico

El diagnóstico puede asistirse con IA: dado el material de la exploración, la IA ubica cada dimensión en su nivel, cita la evidencia que lo sustenta y señala qué tan cerca está del siguiente. Pero la IA propone y un humano confirma. El nivel vale lo que valga la exploración que lo alimenta, y algunas señales son de juicio —"usan el CRM por convicción"— que no se verifican solas desde una entrevista. Cada nivel asignado se acompaña de su evidencia, nunca como caja negra: "Datos en Inicial porque falta X y falta Y".

## Las ocho dimensiones

**Base operativa — cómo está montado el departamento por dentro.** La forman cuatro dimensiones, iguales en las tres áreas:

- **Procesos y Rutinas** — si el área se ejecuta por sistema o por personas.
- **Tecnología y Automatización** — cuánto del stack se aprovecha y cuánto se automatiza.
- **Datos** — si la información es base confiable para decidir.
- **Equipo y Gobierno** — si el equipo tiene claridad de rol y autoridad, y con qué cadencia decide el líder.

**Producción — qué entrega el departamento hacia afuera.** También son cuatro, y cada una responde siempre la misma pregunta:

- **Presentación** — qué presenta el área hacia afuera y qué tan consistente es lo que percibe quien recibe.
- **Personalización** — a quién prioriza y con qué criterio le habla distinto.
- **Alcance** — hasta dónde llega su alcance y qué tan proactiva es.
- **Aprendizaje** — cómo aprende de cada ciclo y cómo escala sin que el costo crezca igual.

Cada área responde esas cuatro preguntas de forma distinta, así que dentro de cada departamento la dimensión lleva un nombre propio —la tabla completa está en el anexo— y abre con la pregunta concreta que responde ahí.

### Cómo se relacionan las dos capas

La base operativa habilita; la producción es lo que sale. No son dos mitades independientes que se suman: sin datos confiables, roles definidos, cadencia de decisión y automatización con lógica, no hay dónde apoyar la proactividad sistemática ni el aprendizaje continuo, por mucha voluntad que le ponga el equipo.

Por eso la producción está definida de forma escueta en Funcional, y tres dimensiones ni siquiera tienen ese nivel: no es falta de criterio, es que esa capacidad todavía no puede existir. Un departamento Funcional es liviano en producción de forma honesta.

La brecha entre las dos capas es, por sí sola, un hallazgo:

- **Base más alta que producción** — hay capacidad instalada que no se está exprimiendo. La conversación es de adopción y casos de uso, no de construir más.
- **Producción más alta que base** — el departamento produce a pulso, sostenido por personas y no por sistema. Es frágil: la conversación es de cimentar antes de seguir empujando.
- **Las dos al mismo nivel** — el departamento está parejo, y lo que entrega corresponde a cómo está montado. La conversación es de subir el conjunto al siguiente nivel, no de corregir un desbalance.

---

# Reglas para asignar el nivel

## Regla de automatización

El gradiente **manual → con lógica → autónomo** es el desempate principal entre niveles cuando se trata de automatización:

- **Funcional — automatización simple.** Un disparador, una acción, sin lógica condicional ni coordinación entre áreas. Rotación de leads por regla simple, un email automático tras un form, ticket asignado al recibirse, notificaciones internas, chatbot de árbol de decisión.
- **Eficiente — automatización con lógica o amplitud.** Secuencias multi-paso con ramificación y timing (nurturing real), routing por múltiples condiciones o por capacidad, escalación automática de SLA, workflows que conectan áreas, enrichment, smart content.
- **Óptimo — flujos IA-first con validación humana.** La IA ejecuta el trabajo —agentes que califican, agendan, resuelven o generan contenido— y las personas validan en los puntos que importan: excepciones, casos de alto valor y entrenamiento del propio sistema. El equipo pasa de ejecutar a supervisar.

La IA no define Óptimo por sí sola. Ya aparece en Eficiente como asistente que apoya a una persona —redacción de contenido, enriquecimiento de datos, sugerencias—. La línea entre Eficiente y Óptimo es quién ejecuta: en Eficiente la IA asiste y la persona hace el trabajo; en Óptimo la IA lo hace y la persona valida. Un caso no es Óptimo solo porque mencione IA, ni deja de serlo porque haya humanos involucrados: la pregunta es dónde están puestos.

## Regla de asignación

Cada evidencia observada se asigna a una sola dimensión —la que responde su pregunta—, nunca a dos. Los casos que no son obvios:

- Los **artefactos de ejecución de venta** (pitch, plantilla de propuesta, playbook, criterios de etapa, definición de oportunidad calificada, cadencia, metodología) se asignan a **Procesos de Ventas (1.1)**. La dimensión 1.5 (Propuesta y Coherencia) mide el resultado que percibe el cliente de esos artefactos, no los vuelve a contar.
- El **forecast** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1) ni a 1.5.
- En la **frontera Marketing ↔ Ventas**, cada pieza se asigna por quién la ejecuta: la definición de a quién sirve el equipo comercial (ICP) en **1.5 (Ventas)**; la segmentación y personalización del mensaje de marketing en **2.6 (Marketing)**; marcar MQL (lo califica marketing) en **2.6 (Marketing)**; aceptar SQL (criterio del lado de Ventas) en **1.6 (Ventas)**; poblar el campo de etapa del ciclo de vida, como higiene de dato, en **Datos** del área que lo captura (1.3 o 2.3); el diseño técnico del pipeline en **Tecnología** (1.2 o 2.2). El SQL a nivel de contacto (1.6) no se confunde con la definición de oportunidad calificada a nivel de deal, que es un artefacto de venta y se asigna a 1.1.
- El **lead scoring por reglas** se asigna a la dimensión de segmentación o priorización de cada área (**1.6 en Ventas, 2.6 en Marketing**), y es nivel Eficiente. No se confunde con la calificación de Funcional: ahí basta aplicar criterios escritos, sea a mano o con una automatización simple sobre una propiedad; el scoring de Eficiente es un modelo de puntaje con varios atributos.
- El **canal conversacional y la bandeja** se asignan a **Tecnología** del área correspondiente (1.2, 2.2 o 3.2): un canal con bandeja básica es Funcional; varios canales en una bandeja unificada es Eficiente. Usar ese mismo canal para **salir** con cadencia —WhatsApp como canal de campaña— se asigna a Canales (2.7), no a Tecnología: una cosa es tenerlo conectado y otra es usarlo para llegar.
- La **conversation intelligence** se asigna a **1.8 (Ventas)**, no a Tecnología: es aprendizaje, no infraestructura.
- La **integración con ERP** u otros sistemas se asigna a **Tecnología** del área que la implementa; **Datos** solo declara el resultado (registros completos y trazables).
- La **orquestación entre áreas** (SLAs, handoffs, rutinas conjuntas) se asigna a **Equipo y Gobierno** del área cuyo liderazgo sostiene la coordinación, y nunca es Funcional: su piso es Eficiente. El workflow técnico que la habilita se asigna a Tecnología. Las dimensiones 1.7, 2.7 y 3.7 miden el alcance hacia el destinatario final, no la coordinación entre departamentos.
- La **rendición de cuentas contra meta** se asigna a **Equipo y Gobierno**.
- La **reunión recurrente** es una sola: se asigna a **Procesos**, que es donde vive la rutina; **Equipo y Gobierno** solo dice que el líder la sostiene y la usa para rendir cuentas.

## Dimensiones sin nivel Funcional

Algunas dimensiones no tienen nivel Funcional, porque la capacidad que miden exige primero una base operativa madura. Su piso es Eficiente: **1.7 Tracción del Deal (Ventas)**, **3.7 Proactividad (Servicio)** y **3.8 Escalabilidad del Servicio (Servicio)**. En cambio **1.8 Aprendizaje de Ganadas y Perdidas (Ventas) sí admite Funcional**, porque registrar la razón de pérdida con taxonomía definida es base, aunque analizar los patrones sea Eficiente.

---

# Las tres áreas

Cada área se presenta igual: la panorámica consolidada de los cinco niveles y, después, el detalle de sus ocho dimensiones. La panorámica está escrita en el lenguaje con el que se le devuelve el resultado al cliente y sirve para ubicarse rápido; la superficie donde de verdad se diagnostica son las dimensiones.

## Los cinco niveles de un vistazo

Cada descripción resume cómo se ve el departamento en ese nivel: cómo está montado por dentro y qué produce hacia afuera. En Óptimo aparece además el bucle entre áreas, donde el resultado de un departamento alimenta a otro.

### Deficiente

**Ventas.** Tu proceso comercial es un caos reactivo. Cada asesor vende a su manera, la información clave vive en cabezas y libretas personales, y el CRM no existe o casi no se usa. El resultado son cierres impredecibles y un pipeline que nadie puede ver.

**Marketing.** Tu marca no la defines tú, la define el mercado. La voz y los mensajes son inconsistentes, las herramientas están sueltas y sin conectar, y las campañas corren hasta agotar presupuesto sin que nadie mida qué dejaron. La demanda que llega es accidental.

**Servicio.** El servicio se improvisa cliente por cliente. No hay metodología ni estandarización —cada agente responde con su propio criterio—, los datos están dispersos y todo depende de que la persona correcta esté disponible. El churn te toma por sorpresa.

### Inicial

**Ventas.** Tienes algo de estructura, pero la ejecución falla. Hay un CRM en funciones básicas que el equipo percibe como carga administrativa y llena a mano, la calificación sigue en la cabeza del vendedor y los deals se sostienen sobre relaciones personales. La visibilidad del pipeline sigue siendo deficiente.

**Marketing.** Tienes branding básico instalado, pero sin estrategia detrás. Las herramientas existen subutilizadas y en silos, el contenido sale de forma reactiva y esporádica, y el análisis llega tarde: solo cuando la campaña ya cerró. Los leads son inconsistentes y no sabes de dónde vienen.

**Servicio.** El conocimiento y la coordinación viven en una sola persona, y eso te deja con un punto único de fallo. Hay plataforma de tickets, pero con baja adopción; existen plantillas para los casos más frecuentes y procesos que nadie formalizó. La entrega es frágil.

### Funcional

**Ventas.** Tu equipo comercial opera como una maquinaria base. Existe una única fuente de verdad —el CRM en uso real—, los prospectos se gestionan siguiendo un pipeline documentado, los roles están por escrito y hay rendición de cuentas en cadencia. Hacia afuera ya tienes un ICP definido y coherencia básica en mensaje y propuesta. Sin pronóstico ni sofisticación todavía, pero con previsibilidad operativa.

**Marketing.** El área dejó de depender de héroes. Tienes marca, buyer personas y presencia digital documentadas, el stack contratado se usa de verdad, y tus canales —email, pauta, orgánico y WhatsApp— salen coordinados bajo un mismo calendario, con visibilidad de costo por canal. La información describe la operación con confianza, sin reconstruirla a mano. La demanda es calificada y predecible, aunque la optimización fina todavía no existe.

**Servicio.** Tu entrega es consistente y ya no depende del individuo. Hay un pipeline de servicio configurado, el sistema central se usa con vista unificada del cliente, los tickets están categorizados y el onboarding es estructurado. Priorizas por severidad y tienes macros para lo repetitivo. Es un servicio todavía reactivo, pero bien ordenado.

### Eficiente

**Ventas.** Tu proceso dejó de ser etapas y se volvió método con disciplina medida. Mides conversión y velocidad por etapa, la automatización tiene lógica, el stack está integrado y aparece un forecast confiable. Hacia afuera hay lead scoring por reglas, target accounts, outreach multicanal y análisis estructurado de ganadas y perdidas.

**Marketing.** Los ciclos cortos de prueba y ajuste ya son parte del proceso. Los datos están unificados, enriquecidos y atribuidos; la segmentación y el scoring se automatizan; y la presencia se optimiza tanto para buscadores como para motores generativos. El presupuesto se distribuye entre canales con criterio y tu share of voice es medible.

**Servicio.** El servicio empieza a adelantarse al problema. Tienes SLAs, reglas de escalación y autoservicio; mides tiempos de resolución y satisfacción, y la data se unifica con Ventas. Identificas riesgos y oportunidades antes de que el cliente levante la mano, y las cuentas clave tienen owner asignado. La retención se vuelve predecible.

### Óptimo

**Ventas.** La IA hace el trabajo pesado y tu equipo valida donde importa. Agentes de IA califican leads y agendan reuniones, las llamadas se analizan solas y sugieren correcciones al playbook, y el forecast lo calcula un modelo. El rep dedica su tiempo a las conversaciones que deciden el deal, no a la administración.

**Marketing.** La IA produce y ajusta; el equipo dirige. El contenido se genera y optimiza en ciclo continuo, la IA identifica micro-segmentos y adapta el mensaje al comportamiento de cada persona, y los modelos reasignan presupuesto entre canales sobre la marcha. El equipo define la estrategia y valida lo que sale.

**Servicio.** Un agente de IA resuelve consultas en producción y tus agentes trabajan con copilots. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y gestiona excepciones; un modelo de salud de cuenta anticipa el riesgo antes de que el cliente lo manifieste. Atender un cliente más casi no cuesta.

## Área 1 — Ventas

Mide el rendimiento del área de Ventas: cómo opera internamente y qué produce en pipeline y cierre.

### Base operativa

#### 1.1 Procesos y Rutinas

Si mañana rotan dos personas clave, ¿la operación comercial sigue corriendo igual?

**Deficiente.** Sin proceso. Cada asesor vende a su manera y la información clave vive en cabezas o libretas.

- No existe ningún documento del proceso ni de las etapas; cada rep usa su criterio.
- Los leads se reparten a ojo o por orden de llegada, sin regla.
- Las reuniones, si ocurren, no dejan acuerdos ni cadencia.
- Si rotan dos personas clave, nadie reconstruye el estado del pipeline.

**Inicial.** Hay intención de estructura, pero la ejecución es despareja.

- Existen etapas de palabra o en un borrador, pero cada rep las interpreta distinto.
- Hay un intento de pitch común que la mayoría no usa.
- Las pipeline reviews ocurren a cadencia irregular y sin estructura fija.
- Que un deal quede bien registrado depende de la voluntad del rep, no de una regla.

**Funcional.** Maquinaria base: una fuente de verdad, pipeline estructurado y previsibilidad operativa.

- Existe al menos un pipeline de ventas configurado con sus etapas y criterios de avance, y cualquier rep los explica igual.
- Si el negocio tiene más de un proceso de venta, cada pipeline cumple lo mismo. Lo mismo aplica a los procesos de atención o prospección de leads: la cantidad refleja el negocio, no el nivel de madurez.
- Existe una definición escrita de "oportunidad calificada" que el equipo aplica de forma consistente.
- Hay proceso de venta documentado y cadencia de contacto definida (X intentos en Y días) que se cumple la mayoría del tiempo.
- La pipeline review corre en cadencia formal, semanal o quincenal.

**Eficiente.** El proceso deja de ser solo etapas y se vuelve método con disciplina medida.

- Hay metodología comercial formal en uso (SPIN, MEDDIC, BANT o equivalente).
- Existen playbooks de discovery, calificación y manejo de objeciones que el equipo usa.
- El líder monitorea la adherencia con datos del sistema, no de memoria.
- El proceso se refina en cadencia, no se deja congelado.

**Óptimo.** El sistema vigila la adherencia y señala desviaciones; el equipo decide los ajustes.

- El sistema detecta desviaciones y las señala al líder y al rep sin intervención.
- La adherencia es alta sin que nadie la vigile a mano.
- El proceso cambia en ciclos cortos con base en data, con pilotos de técnicas nuevas.

#### 1.2 Tecnología y Automatización

¿Qué parte del tiempo del vendedor se va en tareas que el sistema podría hacer, y cuánto del stack que paga el cliente se está aprovechando?

**Deficiente.** Sin CRM o uso mínimo.

- Los leads viven en listas o agendas personales.
- No hay automatizaciones ni integraciones; hay rechazo a la IA.

**Inicial.** CRM en funciones básicas con carga manual.

- Los reportes son mensuales y básicos.
- La adopción es desigual: unos lo usan, otros siguen con sus hojas.

**Funcional.** El CRM se usa por convicción y hay automatización simple en producción.

- Cualquier rep abre el CRM como herramienta de trabajo, no por obligación.
- Los leads entrantes llegan a una bandeja o cola y se asignan por una regla simple (round-robin, territorio o fuente).
- Cuando un deal requiere acción, el sistema le notifica al rep sin que el líder se lo recuerde.
- No hay reps trabajando con hojas personales paralelas al CRM.
- Las automatizaciones son simples: un disparador, una acción.

**Eficiente.** La automatización tiene lógica y el stack está integrado.

- Las cotizaciones se generan desde el sistema, no como documentos sueltos.
- Hay secuencias de outreach multi-paso y routing por múltiples condiciones o por capacidad.
- Hay integración con ERP u otros sistemas operativos cuando aplica.
- Hay paneles de conversión en tiempo real.

**Óptimo.** Agentes de IA califican y agendan; el rep trabaja con predicción de cierre y next-best-action.

- Hay análisis predictivo de cierre, next-best-action y sugerencias de respuesta por contexto.
- Agentes de IA califican leads y agendan reuniones 24/7.

#### 1.3 Datos

¿Confías en tu forecast, en tu conversión y en tu visibilidad de pipeline, o los validas antes de usarlos?

**Deficiente.** Data muy desordenada.

- Hay contactos duplicados o incompletos.
- No hay trazabilidad por canal o vendedor; sacar un reporte confiable es imposible.

**Inicial.** Data parcialmente limpia.

- Empieza la depuración pero persisten vacíos (emails, teléfonos).
- Hay un traceo básico de qué canal trae cada lead, sin detalle.

**Funcional.** El reporte de pipeline describe el estado actual con confianza, sin reconstrucción.

- Todo deal tiene close date, amount y owner poblados.
- Existe una política de duplicados que el equipo conoce y aplica a mano.
- Todo deal tiene rastreable la fuente del contacto original.
- El reporte de pipeline se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico.

**Eficiente.** Aparece el forecast con precisión y la integración operativa.

- Hay forecast con cadencia fija (semanal o quincenal) y precisión alta.
- La deduplicación es automática por reglas o merge del sistema.
- El CRM está integrado a sistemas operativos (ERP, facturación) cuando aplica; la vista 360° empieza a tomar forma.

**Óptimo.** El forecast lo calcula un modelo y la vista 360° del cliente está operativa.

- Cada lead, contacto y deal está enlazado en tiempo real.
- El forecast es predictivo por modelos de ML.
- La vista 360° del cliente está operativa.

#### 1.4 Equipo y Gobierno

¿El liderazgo decide con datos o con intuición, y con qué cadencia interviene?

**Deficiente.** Equipo sin estructura formal.

- Cada asesor opera ad-hoc sin dueño fijo.
- El liderazgo apaga incendios; no hay métricas ni rendición de cuentas.

**Inicial.** Estructura básica con asignación por proyecto o segmento.

- El liderazgo revisa números básicos en hojas manuales.
- Los informes son rudimentarios.

**Funcional.** Roles claros y rendición de cuentas en cadencia, con dashboard descriptivo.

- Cada persona del equipo tiene rol definido por escrito.
- El líder tiene un dashboard descriptivo (valor de pipeline, deals creados, win rate de cerrados, volumen) y lo consulta al menos semanalmente.
- Se sostiene la cadencia de revisión (la misma pipeline review) y en ella se rinde cuentas.
- Cada rep tiene una meta clara y reporta avance en cadencia fija.

**Eficiente.** El liderazgo monitorea con alertas y orquesta con Marketing.

- Se monitorea adherencia y deals at risk con alertas automáticas.
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria.
- El SLA y el handoff con Marketing están definidos y son trazables (tiempo de respuesta, calidad del lead, criterios de rechazo); el líder apoya en deals grandes o críticos.
- Hay cultura de feedback del equipo hacia el sistema y ajuste continuo respaldado por data.

**Óptimo.** El liderazgo decide con analítica avanzada y sostiene mesas de innovación comercial.

- Las decisiones usan analítica avanzada (LTV, rentabilidad por canal, contribución por vendedor).
- Hay mesas regulares de innovación comercial.

### Producción

#### 1.5 Propuesta y Coherencia

¿El equipo opera desde una definición compartida de a quién sirve, y el cliente percibe una propuesta coherente, o todo depende del rep que le toque?

**Deficiente.** El cliente recibe mensajes y propuestas distintos según el vendedor; la calidad depende de cada uno.

**Inicial.** Hay coherencia incipiente pero no confiable; el mensaje y la propuesta todavía varían notablemente entre reps.

**Funcional.** Hay un ICP escrito y coherencia básica en mensaje y propuesta.

- Existe un documento con la definición del ICP / a quién sirve el equipo, consultable por cualquier rep.
- El líder puede explicar quién es el cliente ideal sin pensarlo.
- Un cliente que habla con dos reps recibe el mismo mensaje de valor base.
- Las propuestas tienen una estructura común reconocible, no armada desde cero cada vez.

**Eficiente.** El equipo se presenta como una unidad metodológicamente disciplinada.

- El equipo se presenta como una unidad cohesiva; el mensaje no cambia según el rep.
- La propuesta de valor está diferenciada y es consistente en cada touchpoint.

**Óptimo.** La IA mantiene coherente el mensaje en cada touchpoint, sin trabajo manual.

- La IA mantiene coherencia de mensaje en tiempo real sin fricción manual.

#### 1.6 Priorización de Leads

¿El equipo trabaja los leads correctos, o todos por igual?

**Deficiente.** Se atienden leads por orden de llegada o preferencia.

- No hay criterios para distinguir oportunidades buenas de malas; se pierde tiempo en prospectos sin potencial.

**Inicial.** Se prioriza por intuición o por listas estáticas.

- La segmentación es rudimentaria y no hay datos que guíen el foco.

**Funcional.** Hay segmentación básica de leads y criterios claros para aceptar un SQL.

- El equipo segmenta los leads al menos por tamaño, industria o geografía antes de trabajarlos.
- Hay criterios escritos para aceptar un lead como SQL y se aplican de forma consistente, a mano o con una automatización simple sobre las propiedades de calificación. Con poco volumen puede ser manual; con volumen alto conviene automatizarlo.
- El esfuerzo se enfoca en los leads que encajan con el ICP (definido en 1.5 Propuesta y Coherencia).

**Eficiente.** Aparece el lead scoring por reglas y las target accounts.

- Hay lead scoring por reglas activo: un modelo que suma puntos por varios atributos, no una regla sobre una propiedad.
- Las target accounts están identificadas formalmente.
- El outreach usa copy personalizado por segmento; la priorización empieza a ser proactiva por data.

**Óptimo.** Agentes de IA priorizan sobre contexto completo y proponen la siguiente acción.

- Agentes de IA analizan el contexto completo y dictan la siguiente mejor acción.
- El sistema detecta riesgo y potencial de expansión.
- La personalización se adapta en tiempo real a cada stakeholder del deal.

#### 1.7 Tracción del Deal

¿Qué pasa cuando un deal se enfría?

**Deficiente.** El vendedor está solo y el outreach es de un solo canal.

- No hay apoyo de Marketing ni de liderazgo.
- Los deals se enfrían y mueren sin acción correctiva.

**Inicial.** Apoyo ad-hoc cuando el vendedor lo pide.

- Marketing envía materiales genéricos.
- El liderazgo interviene solo al final del trimestre, a menudo tarde.

**Funcional.** *Sin nivel Funcional; su piso es Eficiente.* La cadencia de contacto que evita la improvisación se asigna a Procesos (1.1).

**Eficiente.** Hay outreach multicanal y los leads llegan nutridos desde Marketing.

- El outreach multicanal está definido (email, llamada, social) y orquestado en cadencias.
- Los leads no maduros llegan nutridos desde Marketing por el handoff acordado.
- Los materiales de venta viven en una biblioteca central.

**Óptimo.** El sistema detecta fricción y dispara contenido, alertas o swarming sobre las mejores oportunidades.

- El sistema detecta fricción y dispara contenido de alto valor, alerta a directivos o swarming sobre las mejores oportunidades.
- Hay colaboración en tiempo real.
- La distribución multicanal se autoajusta según el comportamiento del deal.

#### 1.8 Aprendizaje de Ganadas y Perdidas

¿El equipo mejora con cada deal, o repite los mismos errores?

**Deficiente.** No hay análisis después de la venta ni de la no-venta.

- Los errores se repiten porque no se detectan.
- Las objeciones del cliente se pierden.

**Inicial.** Comentarios ocasionales en reuniones sobre deals perdidos.

- No hay estructura ni documentación; el aprendizaje vive en cabezas.

**Funcional.** La arquitectura para registrar el aprendizaje existe y se usa.

- Todo deal cerrado-perdido tiene razón de pérdida poblada.
- Las razones de pérdida usan una taxonomía definida, no texto libre.
- El líder puede sacar un reporte de razones de pérdida del trimestre sin reconstruir.

**Eficiente.** Hay win-loss analysis estructurado y enablement formal.

- Se revisan periódicamente los deals perdidos para identificar patrones.
- El proceso o playbook se refina con base en lo aprendido.
- Hay capacitación recurrente del equipo (sales enablement formal).

**Óptimo.** Las llamadas se analizan solas y la IA sugiere correcciones al playbook.

- Las llamadas se analizan automáticamente con coaching basado en patrones.
- La IA detecta desviaciones del playbook y sugiere correcciones.
- La estrategia comercial se ajusta con base en data de qué funciona.

---

## Área 2 — Marketing

Mide el rendimiento del área de Marketing: cómo opera internamente y qué produce hacia el mercado.

### Base operativa

#### 2.1 Procesos y Rutinas

Si mañana rota el coordinador o el principal generador de contenido, ¿las campañas siguen saliendo en tiempo y forma?

**Deficiente.** Cada quien opera a su criterio; no hay calendario ni ceremonias.

- No existe calendario editorial; las campañas se improvisan.
- No hay reuniones regulares de marketing.
- El área depende de agencias externas sin coordinación interna.

**Inicial.** Hay intentos de planificación, pero la adherencia es baja.

- Existen briefs informales y un calendario editorial irregular.
- Las reuniones son esporádicas y sin estructura.
- Se sigue dependiendo mucho de agencias; los pocos procesos que hay se cumplen a medias.

**Funcional.** El área tiene estructura y previsibilidad; deja de depender de héroes.

- Existe un calendario editorial visible para el equipo con horizonte de al menos un trimestre.
- Existe un proceso de campaña documentado (briefing → ejecución → cierre) que el equipo aplica de forma consistente.
- Hay una reunión de performance con cadencia fija (semanal o quincenal) que se sostiene.
- El líder puede explicar qué campañas corren y en qué etapa sin preguntarle al equipo.
- El equipo interno gestiona el grueso del trabajo; las agencias son apoyo puntual.

**Eficiente.** Los procesos incorporan ciclos cortos de prueba y ajuste, y control de calidad.

- Hay ciclos regulares de testing y ajuste incorporados a la rutina.
- Existe un proceso de aprobación de contenido antes de publicar (versionado, QA).
- Hay retroalimentación permanente entre planificación y ejecución.

**Óptimo.** La IA ajusta los flujos de trabajo y el equipo queda libre de tareas repetitivas.

- Los flujos de trabajo se ajustan con apoyo de IA, sin tareas manuales repetitivas.
- El monitoreo es en tiempo real con ajustes automáticos.
- La dependencia externa es muy baja.

#### 2.2 Tecnología y Automatización

¿Qué parte del esfuerzo se va en tareas que un workflow o una IA podrían hacer, y cuánto del stack instalado se está aprovechando?

**Deficiente.** Herramientas mínimas y desconectadas; nada automatizado.

- Los leads se manejan en hojas de cálculo.
- No hay un sistema operativo central.
- No hay automatización ni IA.

**Inicial.** Hay herramientas, pero subutilizadas y en silos.

- El cliente paga licencias cuyo valor no extrae.
- El stack está fragmentado, sin integración.
- Las automatizaciones son elementales (un email de bienvenida); la IA es exploratoria.

**Funcional.** El stack contratado se usa de verdad y hay automatización simple en producción.

- El equipo usa el sistema operativo central como herramienta principal, no como obligación administrativa.
- Los módulos contratados están en uso, sin licencias ociosas relevantes.
- Los puntos de captura del sitio (forms) están conectados al CRM con datos limpios.
- Hay al menos un canal conversacional conectado (WhatsApp, chat del sitio) con una bandeja básica donde el equipo atiende lo entrante.
- Después de enviar un formulario, el sistema responde automáticamente y notifica a quien corresponde.
- Los flujos de WhatsApp, si existen, son simples: un disparador y una respuesta, sin ramificación.
- Las automatizaciones son simples: un disparador, una acción.
- El equipo puede mandar un email a un segmento sin pedir ayuda a IT.

**Eficiente.** El stack está integrado y la automatización tiene lógica.

- Hay secuencias de nurturing multi-paso con ramificación y timing.
- Las campañas de WhatsApp están automatizadas, con segmentación y disparadores por comportamiento.
- El handoff de leads a Ventas está automatizado.
- Varios canales conversacionales se consolidan en una bandeja unificada.
- Las landing pages viven en el CMS central; hay data enrichment y smart content por segmento.

**Óptimo.** La IA orquesta el recorrido completo, con personalización 1:1 y conversación automatizada.

- Hay personalización avanzada (web personalization, contenido dinámico 1:1).
- La IA predictiva y generativa orquesta el recorrido completo.
- La IA conversacional es avanzada.

#### 2.3 Datos

¿Confías en tus reportes de canal, conversión y atribución para mover presupuesto, o los validas a mano antes de usarlos?

**Deficiente.** Datos aislados y sin integridad.

- No hay seguimiento del origen de los leads.
- Sacar un reporte confiable exige reconstruirlo a mano.

**Inicial.** Datos básicos en el CRM, con limpieza incipiente.

- Hay primeras integraciones (sitio web hacia CRM).
- Los reportes son manuales y cuestan mucho esfuerzo; la trazabilidad es incompleta.

**Funcional.** La información describe la operación con confianza, sin reconstrucción.

- Todo contacto nuevo creado por un form tiene etapa de ciclo de vida y origen del lead poblados.
- Las propiedades básicas (industria, empresa, rol) están en los forms críticos y se capturan en la mayoría de los registros.
- Existe una política de manejo de duplicados, acordada y aplicada a mano.
- Cualquier deal ganado tiene rastreable el origen del contacto.
- Los reportes básicos (volumen, conversión, fuente) salen del sistema sin reconstrucción manual.

**Eficiente.** Los datos están unificados, enriquecidos y atribuidos.

- Hay data enrichment activo con servicios de terceros.
- La atribución multi-touch está configurada.
- La segmentación usa datos de comportamiento; la deduplicación es automática por reglas.

**Óptimo.** Los datos entran de forma continua, limpios y trazados de punta a punta.

- Hay pipeline ETL continuo con data lakes y ML integrado.
- Los datos están limpios y trazados de punta a punta.
- El enrichment es automático con IA.

#### 2.4 Equipo y Gobierno

¿Quién decide qué se publica, qué se invierte y dónde se enfoca, con qué información y en qué cadencia?

**Deficiente.** Roles confusos y sin rendición de cuentas.

- Marketing está externalizado o concentrado en una persona con muchos sombreros.
- Las decisiones se toman por improvisación.
- No hay cadencia de revisión.

**Inicial.** Roles básicos, pero sin autonomía.

- Las decisiones operativas escalan al CEO o head of marketing.
- Hay reuniones mensuales sin acciones consistentes.

**Funcional.** Roles claros, decisiones con datos descriptivos y rendición de cuentas en cadencia.

- Cada persona del equipo tiene rol definido por escrito.
- El líder tiene un dashboard descriptivo con 4-6 métricas core (volumen de leads, MQL rate, fuente, conversión) y lo consulta al menos semanalmente.
- Hay metas mensuales o trimestrales por las que el equipo rinde cuentas en cadencia fija.
- Las decisiones de presupuesto o priorización citan datos del sistema, no opiniones.
- Cualquier persona del equipo opera el sistema sin ayuda externa para tareas estándar.

**Eficiente.** El equipo tiene autonomía y el líder orquesta con otras áreas.

- La rendición de cuentas es explícita y la cultura es data-driven.
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria.
- El liderazgo orquesta con Ventas (handoff de leads, SLAs, cadencia conjunta) y con Servicio.
- El equipo da feedback sobre el sistema y pide que evolucione.

**Óptimo.** Hay perfiles de IA y data science en el equipo, y gobernanza de datos e IA en las decisiones.

- Los roles incluyen perfiles de IA y data science.
- El liderazgo se enfoca en estrategia y en mejorar el sistema.
- La gobernanza de datos e IA es parte del marco de decisión.

### Producción

#### 2.5 Marca y Presencia

¿El mercado entiende quién eres, qué ofreces y por qué importas?

**Deficiente.** Voz de marca indefinida y mensajes inconsistentes.

- No hay guía de estilo ni narrativa central.
- Los buyer personas no están identificados.
- El SEO es inexistente o azaroso.

**Inicial.** Branding básico instalado, sin estrategia.

- Hay logo, colores y plantillas, pero el buyer persona es muy general.
- El sitio tiene meta tags simples y contenido funcional.
- Los esfuerzos son experimentos sueltos.

**Funcional.** Marca, personas y presencia digital documentadas y consistentes.

- Existe un brand kit (logo, colores, tipografía) que cualquiera del equipo puede consultar.
- Existe una guía corta de brand voice escrita y aplicada a piezas recientes.
- Hay 2-3 buyer personas escritos con journey básico por etapa.
- El sitio tiene meta tags configurados y SEO técnico básico verificable.
- El blog publica al menos un post por mes con cadencia previsible.

**Eficiente.** La presencia se refina por segmento y se optimiza para buscadores y motores generativos.

- Los buyer personas están detallados a nivel de segmento de alto valor.
- Hay topic clusters maduros (pillar pages + contenido de soporte).
- El AEO está implementado con resultados medibles.
- El journey está mapeado con touchpoints definidos.

**Óptimo.** La IA produce y optimiza el contenido en ciclo continuo, incluido para búsqueda conversacional.

- Los buyer personas están hiper-segmentados, próximos a cuentas individuales.
- El contenido se produce y optimiza con IA de forma continua.
- El SEO y el AEO están optimizados para búsqueda conversacional y entornos generativos.

#### 2.6 Segmentación

¿Cada prospecto recibe lo que le corresponde, o todos reciben lo mismo?

**Deficiente.** Sin segmentación; todos reciben el mismo mensaje. La personalización no existe o se limita al nombre en el saludo.

**Inicial.** Segmentación rudimentaria y personalización mínima.

- Se segmenta apenas por geografía o demografía.
- Las campañas se diseñan para la masa.

**Funcional.** Hay segmentos definidos y contenido adaptado a mano, con criterios de calificación escritos.

- Existen al menos 2 segmentos definidos con criterios escritos.
- El equipo puede seleccionar un segmento y enviarle un email distinto del resto.
- Las campañas recientes muestran piezas distintas por segmento.
- Existen criterios documentados de qué es un suscriptor, lead, MQL y SQL, y marketing clasifica hasta MQL según ellos, a mano o con una automatización simple sobre las propiedades de calificación.

**Eficiente.** La segmentación y el scoring se automatizan.

- Hay secuencias diferenciadas por segmento o etapa del journey.
- El contenido se adapta por segmento de forma automática (smart content).
- Hay lead scoring por reglas: un modelo que suma puntos por varios atributos y califica al pasar un umbral, cuyo score dispara las secuencias de nurturing. Se distingue de la calificación de Funcional, que responde a un valor de propiedad sin modelo de puntaje detrás.

**Óptimo.** La IA identifica micro-segmentos y el contenido cambia según el comportamiento de cada persona.

- La IA identifica micro-segmentos y comportamientos.
- El contenido cambia en tiempo real según el comportamiento histórico.
- Hay personalización uno a uno y web personalization.

#### 2.7 Canales y Alcance

¿Llegas a quien necesitas, de la forma adecuada y con el costo correcto?

**Deficiente.** Alcance muy limitado y reactivo.

- Hay pocos canales activos.
- No hay estrategia de distribución.

**Inicial.** Canales sueltos con cadencia irregular.

- Hay redes en uno o dos canales sin ritmo fijo.
- El PPC es inicial, sin marco de optimización; el email es esporádico.
- Cada canal va por su cuenta: no hay calendario común ni campaña que los atraviese.

**Funcional.** Los canales principales operan con cadencia y bajo un mismo plan.

- El email marketing tiene cadencia regular (al menos mensual) y se cumple.
- Hay al menos un canal social orgánico gestionado y calendarizado con publicaciones recurrentes.
- Hay al menos una campaña de paid ads corriendo con presupuesto definido (Google, Meta o el canal que corresponda al negocio).
- WhatsApp se usa para salir con cadencia definida, no solo para responder lo que entra.
- Los cuatro canales siguen el mismo calendario y la misma campaña: una promoción sale coordinada en email, pauta, orgánico y WhatsApp, no como cuatro esfuerzos sueltos.
- El líder puede decir cuánto costó cada lead el último mes, al menos por canal.

**Eficiente.** Los canales se integran con datos y el presupuesto se mueve con evidencia.

- Los canales comparten datos y se alimentan entre sí: remarketing activo y audiencias construidas desde el CRM.
- Hay webinars o eventos como canal recurrente.
- Los presupuestos se optimizan con frecuencia según data.

**Óptimo.** La IA reasigna presupuesto entre canales y se prueban canales emergentes en ciclos cortos.

- Se exploran canales emergentes (influencers, búsqueda conversacional, asistentes de IA).
- La IA reasigna presupuestos automáticamente para maximizar ROI.
- Los canales nuevos se prueban en ciclos cortos.

#### 2.8 Medición y Aprendizaje

¿Cada campaña enseña algo, o se repite el ciclo desde cero?

**Deficiente.** Las campañas corren hasta agotar presupuesto, sin aprendizaje ni medición de ROI.

**Inicial.** Se analiza solo al cerrar la campaña, tarde.

- Las métricas son básicas (clics, likes) sin conexión clara con el CAC.
- La optimización es lenta y reactiva.

**Funcional.** Hay reporting descriptivo vivo y revisión post-campaña.

- Hay un dashboard de marketing con KPIs descriptivos core que se actualiza solo.
- El líder envía un reporte mensual a liderazgo con cadencia fija.
- Cada campaña significativa tiene una revisión de cierre documentada (qué funcionó, qué no).
- El equipo puede señalar qué aprende de una campaña a la siguiente.

**Eficiente.** Hay testing regular y ajustes basados en data.

- Hay tests A/B regulares (al menos uno activo por mes).
- Los presupuestos se ajustan según performance, semanal o quincenalmente.
- Hay un proceso formal para validar qué creatividades y audiencias funcionan con métricas históricas.

**Óptimo.** Modelos de predicción ajustan las campañas sobre la marcha, sin esperar al cierre.

- Todas las campañas se monitorean en tiempo real.
- Modelos de predicción ajustan presupuestos sobre la marcha.
- La IA aplica aprendizajes en tiempo real.

---

## Área 3 — Servicio

Mide el rendimiento del área de Servicio: cómo opera internamente y qué produce hacia el cliente.

### Base operativa

#### 3.1 Procesos y Rutinas

Si mañana rotan dos agentes con mucho conocimiento de cuentas, ¿la calidad de atención se mantiene?

**Deficiente.** Procesos inexistentes o informales.

- Cada agente maneja las solicitudes a su manera.
- No hay rutinas regulares ni handoffs; la operación es 100% reactiva.

**Inicial.** Procesos básicos, no formalizados.

- Hay algún SLA conocido pero no medido.
- Los roles están definidos a grandes rasgos; todavía se depende de héroes.

**Funcional.** Hay un pipeline de servicio configurado y gestión básica de cartera.

- El pipeline de servicio cubre el flujo de atención de recepción a cierre.
- Cada cliente tiene un responsable y un seguimiento mínimo más allá de los tickets que abre.
- Hay reuniones de equipo de Servicio con cadencia fija (al menos quincenal) que se sostienen.
- Existe un proceso básico documentado para quejas críticas o escalaciones.
- Cualquier agente explica cómo se atiende un caso típico siguiendo el mismo flujo.

**Eficiente.** Aparecen SLAs, reglas de escalación y prevención.

- Hay SLAs definidos por tipo de caso o prioridad.
- Las reglas de escalación están configuradas como automatización (cuándo y a quién).
- Hay playbooks de prevención y bucles de retroalimentación con otras áreas.

**Óptimo.** Las rutinas corren automáticas y el equipo supervisa, entrena la IA y gestiona excepciones.

- Muchas rutinas son automáticas; el equipo supervisa, entrena la IA y gestiona excepciones.
- Las rutinas incluyen refinar la base de conocimiento.
- Hay comunicaciones proactivas al cliente y QBRs estructurados con clientes clave.

#### 3.2 Tecnología y Automatización

¿Qué parte de los tickets necesita intervención humana cuando podría resolverse con autoservicio o automatización, y cuánto del stack se está aprovechando?

**Deficiente.** Herramientas básicas y aisladas (correo, teléfono).

- No hay plataforma central de tickets.
- Los casos se manejan en celulares personales o emails individuales.

**Inicial.** Plataforma de tickets activa pero con baja adopción.

- Unos agentes la usan, otros siguen con sus canales personales.
- Hay automatizaciones simples de recepción, sin IA; el stack está fragmentado.

**Funcional.** El sistema central se usa de verdad y ofrece vista unificada del cliente.

- El sistema central es la herramienta principal, no algo que se llena después de resolver por otro canal.
- Al abrir un cliente, el agente ve su cartera completa (proyectos, ingresos, soporte abierto), no solo el ticket puntual.
- Hay pipelines de servicio configurados con etapas y prioridades.
- Hay al menos un canal conversacional conectado con bandeja básica donde el equipo atiende lo entrante.
- Al entrar un ticket, el sistema lo asigna automáticamente según una regla simple; las notificaciones de cambio de estado llegan a quien las necesita.
- Si hay chatbot, resuelve consultas frecuentes con árbol de decisión.
- Las automatizaciones son simples: un disparador, una acción.

**Eficiente.** La automatización tiene lógica y aparece el autoservicio.

- Hay automatización de SLA (alertas pre-vencimiento, escalación automática) y routing por múltiples condiciones.
- Hay portal de autoservicio donde el cliente ve y crea tickets, y base de conocimiento interna y pública.
- Los canales se consolidan en una bandeja unificada; el agente de servicio con IA está en exploración.

**Óptimo.** Un agente de IA resuelve consultas en producción y los agentes humanos trabajan con copilots.

- Hay agente de servicio con IA en producción con deflection efectivo y automatización de workflows.
- Hay copilots para los agentes humanos.
- Hay IA generativa para contenido de ayuda y analytics en tiempo real.

#### 3.3 Datos

¿El agente que toma el ticket tiene contexto completo del cliente al instante, o lo arma a mano?

**Deficiente.** Datos dispersos sin estructura.

- No hay medición fiable de tiempos ni satisfacción.
- Es imposible reconstruir el viaje del cliente.

**Inicial.** Datos básicos centralizados pero incompletos; el análisis sigue siendo manual.

**Funcional.** El histórico y el contexto del cliente están accesibles, con tickets categorizados.

- Cualquier agente ve el histórico de tickets de un cliente en menos de 10 segundos.
- La ficha del cliente muestra sus proyectos activos y el valor económico, no solo sus tickets.
- Las propiedades clave del cliente (tipo de plan, antigüedad, owner) están pobladas en la mayoría de los registros.
- Cada ticket tiene tipo, motivo y prioridad con taxonomía definida.
- El líder saca reportes de volumen por tipo de ticket sin reconstrucción.

**Eficiente.** Se miden tiempos y satisfacción, y la data se unifica con Ventas.

- Se mide tiempo de resolución y SLA attainment.
- Se trackean NPS o CSAT con cadencia.
- La data del cliente está unificada entre Servicio y Ventas; se usan los históricos para identificar patrones.

**Óptimo.** Un modelo de salud de cuenta anticipa el riesgo antes de que el cliente lo manifieste.

- Hay un Health Score (modelo de salud de cuenta) activo, predictivo y en uso.
- Los datos están unificados en data lakes con gobernanza.
- Hay modelos predictivos y prescriptivos alimentando cuadros de mando.

#### 3.4 Equipo y Gobierno

¿Quién decide qué se atiende primero, con qué información, y cómo se mejora la operación?

**Deficiente.** Equipos en silos sin coordinación.

- No hay coordinación entre onboarding, soporte y CS.
- El liderazgo apaga incendios; no hay métricas ni rendición de cuentas.

**Inicial.** Roles a grandes rasgos y handoffs informales.

- Hay algunas métricas operacionales en seguimiento.
- El liderazgo revisa números básicos.

**Funcional.** Roles claros, dashboard descriptivo y rendición de cuentas en cadencia.

- Cada persona del equipo tiene rol definido por escrito.
- El líder tiene un dashboard descriptivo (tickets abiertos, volumen, backlog) y lo consulta al menos semanalmente.
- Hay reuniones de equipo en cadencia formal (las de 3.1), usadas para rendir cuentas.

**Eficiente.** El equipo tiene autonomía, cultura preventiva y orquesta con otras áreas.

- Hay rendición de cuentas explícita contra SLA.
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria.
- La cultura es preventiva: contactar al cliente antes de que pida ayuda.
- El liderazgo orquesta con Ventas (handoff de cliente nuevo, alertas de churn) y con Marketing.

**Óptimo.** Hay perfiles de gobernanza de IA y de conocimiento, y el servicio se reconoce como motor de revenue.

- Los roles incluyen perfiles de gobernanza de IA y administración de conocimiento.
- El liderazgo se enfoca en estrategia.
- El servicio se reconoce como motor de revenue.

### Producción

#### 3.5 Consistencia de Atención

¿Cada cliente recibe el mismo nivel de servicio, o depende del agente que le toque?

**Deficiente.** Sin estandarización; cada agente responde a su criterio.

- La calidad varía drásticamente entre interacciones.

**Inicial.** Algunas plantillas para casos muy frecuentes.

- No hay guía de tono; los agentes usan las plantillas a discreción.

**Funcional.** Hay macros básicos y onboarding del cliente estructurado.

- Hay al menos algunos macros o snippets básicos disponibles para los agentes.
- Existe un proceso documentado de onboarding del cliente nuevo.
- Cualquier agente nuevo recibe el conjunto de macros en su capacitación inicial.

**Eficiente.** Las respuestas frecuentes están documentadas y aplican tono de marca.

- Hay plantillas de respuesta a casos frecuentes cargadas como macros, en uso.
- El tono y la voz de marca se aplican a las respuestas, no cada agente con su estilo.
- Existe una guía de estilo de servicio documentada.

**Óptimo.** La IA aplica el tono de marca en las interacciones automatizadas y lo adapta al contexto.

- La IA aplica tono de marca consistente en interacciones automatizadas.
- El tono se personaliza según el contexto del cliente.

#### 3.6 Priorización de Clientes

¿Cada cliente recibe lo que le corresponde según su valor y su contexto?

**Deficiente.** Sin priorización.

- Los tickets se atienden por orden de llegada o preferencia del agente, sin contexto del cliente.

**Inicial.** Intentos de priorización por urgencia percibida.

- No hay criterios formales; la información del cliente existe pero no está expuesta en el momento.

**Funcional.** Hay priorización por severidad y atención diferenciada básica con contexto.

- Cada ticket tiene una prioridad asignada (urgent / high / normal / low) y los agentes la respetan.
- Hay alguna diferenciación de atención por tier o tamaño de cliente.
- El agente usa la vista unificada del cliente (proyectos, ingresos, soporte abierto) para dar contexto, sin reconstruirlo a mano.

**Eficiente.** Hay owner por cliente clave y segmentación para acciones diferenciadas.

- Hay CSM u owner asignado por cliente clave.
- Los clientes se segmentan para acciones diferenciadas (healthy, at-risk, expansion).
- El contexto del cliente se usa activamente para personalizar respuestas.

**Óptimo.** El cliente recibe el mismo contexto lo atienda un humano o la IA, incluso en autoservicio.

- La personalización se aplica incluso en autoservicio.
- El conocimiento del cliente es un activo transversal y dinámico.
- Hay personalización uno a uno en tiempo real.

#### 3.7 Proactividad

¿El área de servicio previene o reacciona?

**Deficiente.** Sin mecanismos predictivos; enfoque 100% reactivo.

- Los problemas se gestionan cuando estallan.
- Hay un solo canal, esperando que el cliente contacte.

**Inicial.** Reactivo aunque ordenado.

- No hay identificación previa de problemas ni de oportunidades.

**Funcional.** *Sin nivel Funcional; su piso es Eficiente.* En Funcional el equipo opera con foco reactivo bien ordenado.

**Eficiente.** Se identifican riesgos y oportunidades antes del contacto del cliente.

- Hay alertas tempranas de churn, baja salud u oportunidad de upsell.
- Hay playbooks de retención y de expansión (upsell o cross-sell desde Servicio).
- Hay rutinas conjuntas con Ventas y Marketing para reaccionar coordinadamente.

**Óptimo.** Muchos problemas se resuelven antes de que el cliente los note, con acciones que la IA ajusta.

- Hay comunicaciones proactivas al cliente y QBRs con clientes clave.
- Muchos problemas se resuelven antes de que el cliente los note.
- La distribución de acciones proactivas se autoajusta por IA según señales del cliente.

#### 3.8 Escalabilidad del Servicio

¿La operación escala linealmente o exponencialmente?

**Deficiente.** El servicio depende 100% de agentes humanos.

- No hay autoservicio ni base de conocimiento pública.
- El costo crece linealmente con cada cliente nuevo.

**Inicial.** FAQs básicas o portal simple sin actualizar.

- Hay chatbots de menú fijo rígidos.
- El conocimiento existe pero está disperso; escalar exige mucho esfuerzo manual.

**Funcional.** *Sin nivel Funcional; su piso es Eficiente.*

**Eficiente.** Se documenta el aprendizaje y el autoservicio empieza a liberar al equipo.

- Se documentan las soluciones a casos nuevos (se alimenta la base de conocimiento).
- Se revisan periódicamente los tickets recurrentes para encontrar patrones y mejorar.
- El autoservicio es efectivo: el cliente resuelve sin abrir ticket, y se escala sin contratar linealmente.

**Óptimo.** La IA detecta consultas nuevas y genera el contenido; atender un cliente más casi no cuesta.

- La IA detecta nuevas consultas y genera artículos o respuestas automáticamente.
- La capacidad se ajusta a la demanda en tiempo real; el costo marginal de un cliente nuevo es cercano a cero.
- Los aprendizajes retroalimentan automáticamente la consistencia de atención (3.5), la priorización de clientes (3.6) y la proactividad (3.7).

---

# Anexo — Nomenclatura y formato de salida

Esta es la referencia que consultan tanto una persona como un sistema que lea los resultados. El identificador estable de cada dimensión es su número, no su nombre: los nombres se pueden afinar, los IDs no cambian.

## Áreas

| ID | Área |
|:--|:--|
| 1 | Ventas |
| 2 | Marketing |
| 3 | Servicio |

El número del área es el prefijo del ID de cada dimensión: 1.3 es Datos de Ventas, 2.3 es Datos de Marketing. Donde aparece una **x**, se sustituye por el número del área.

## Niveles

| Valor | Nivel |
|:--|:--|
| 1 | Deficiente |
| 2 | Inicial |
| 3 | Funcional |
| 4 | Eficiente |
| 5 | Óptimo |

Esa grafía es exacta: es la que se emite y la que se compara entre diagnósticos.

## Dimensiones de base operativa (x.1 a x.4)

Mismo nombre en las tres áreas.

| ID | Dimensión |
|:--|:--|
| x.1 | Procesos y Rutinas |
| x.2 | Tecnología y Automatización |
| x.3 | Datos |
| x.4 | Equipo y Gobierno |

## Dimensiones de producción (x.5 a x.8)

Cada una responde la misma pregunta en las tres áreas, pero lleva nombre propio en cada departamento.

| ID | Pregunta | 1 Ventas | 2 Marketing | 3 Servicio |
|:--|:--|:--|:--|:--|
| x.5 | Presentación | Propuesta y Coherencia | Marca y Presencia | Consistencia de Atención |
| x.6 | Personalización | Priorización de Leads | Segmentación | Priorización de Clientes |
| x.7 | Alcance | Tracción del Deal | Canales y Alcance | Proactividad |
| x.8 | Aprendizaje | Aprendizaje de Ganadas y Perdidas | Medición y Aprendizaje | Escalabilidad del Servicio |

Tres de estas dimensiones no tienen nivel Funcional y su piso es Eficiente: 1.7, 3.7 y 3.8. El motivo está en Dimensiones sin nivel Funcional.

## Formato de salida

Cada dimensión diagnosticada se emite como: área, ID y nombre de dimensión, nivel y la evidencia que lo sustenta.

> Ventas — 1.6 Priorización de Leads — Eficiente — "lead scoring por reglas activo, target accounts identificadas"

Una dimensión que toque dos áreas se emite una vez por área.
