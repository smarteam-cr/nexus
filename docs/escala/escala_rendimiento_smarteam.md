---
documento: Escala de Rendimiento Smarteam — Escalas departamentales
version: 8.6.0
fecha: 2026-09-30
estado: En revisión: cambia con el feedback de su responsable y los comentarios del equipo en Nexus
relacionados: especificacion_calculo_escala.md, manual_operacion_escala.md
---

# Cómo leer este documento

Este documento es la Escala de Rendimiento: define qué significa cada nivel y cada criterio. Lo consumen personas y sistemas: el chequeo y su página de resultados, el cotizador, los agentes de Nexus, y los materiales que se preparan para el equipo y para los clientes.

La escala va con dos documentos más. La **especificación del cálculo** (`especificacion_calculo_escala.md`) convierte sus reglas en pasos exactos para los sistemas: cómo se calculan el nivel y el puntaje, qué se muestra y qué se guarda. El **manual de operación** (`manual_operacion_escala.md`) dice cómo trabaja el equipo con ella: quién la aplica y cuándo, cómo se comprueba que funciona y qué reglas esperan hasta que hagan falta. Los dos precisan lo que dice la escala, pero no lo cambian: si alguno la contradice, manda la escala y se corrige el otro.

Tiene cinco partes. La primera explica qué es la escala y cómo pensarla: es contexto, no regla, y sirve para entender y para enseñar. La segunda dice cómo se aplica: las dos formas de aplicarla, cómo se evalúa, cómo se llega al nivel y al puntaje, qué se trabaja primero y dónde se cuenta cada evidencia. La tercera es la matriz: cada dimensión de cada área con sus cinco niveles y sus criterios. La cuarta es la referencia: nombres, riesgos, glosario e historial. La quinta trae las ediciones por industria: la misma escala, dicha para una industria.

Las partes dos, tres, cuatro y cinco son normativas y se aplican al pie de la letra. Si algo de la primera parte parece contradecirlas, mandan ellas. Cualquier material derivado —una página teórica, una presentación, las preguntas del chequeo— respeta la matriz y las reglas sin reinterpretarlas.

Cada criterio de la matriz termina con una etiqueta entre corchetes: su identificador, cómo se verifica, sus marcas y, si no se puede cumplir sin otro criterio, cuál requiere. Es para los sistemas y para quien diagnostica; para entender la escala, se puede saltar.

**Cómo cambia.** La escala cambia con el feedback de su responsable y con los comentarios del equipo en Nexus. Cada cambio sale como una versión nueva y queda en el historial; cómo se decide está en el manual de operación.

---

# Parte 1 — Qué es la escala y cómo pensarla

## Qué es la escala

La Escala de Rendimiento es el instrumento con el que Smarteam diagnostica cómo está operando un departamento de un prospecto o cliente. Ubica a cada departamento —Ventas, Marketing y Servicio— en uno de cinco niveles de madurez, a partir de la evidencia que arroja una exploración. No describe productos ni servicios: describe estados de madurez.

Una forma corta de decir qué es: la escala es el mapa y la brújula de un departamento. El mapa muestra dónde está; la brújula, hacia dónde conviene ir. Y como se vuelve a medir, el mapa también muestra cuánto se avanzó.

Hay tres piezas, en orden. Este documento es el **reglamento**: define qué significa cada nivel en cada dimensión y con qué señales observables se reconoce. El **diagnóstico** es la actividad: alguien explora el departamento, junta evidencia y ubica cada dimensión en su nivel usando este reglamento; antes de la venta, su versión corta es el **chequeo**, que lo estima con pocas preguntas. La **página de resultados** es lo que ve el cliente: el estado actual del departamento y qué le toca mejorar.

Los cinco niveles, de menor a mayor madurez, son **Deficiente, Inicial, Funcional, Eficiente y Óptimo**. Funcional es la base: arquitectura montada, procesos que se siguen, roles definidos, datos confiables, dashboards descriptivos y automatización simple. Todo lo que pide lógica condicional, instrumentación fina, coordinación entre áreas o inteligencia artificial pertenece a Eficiente u Óptimo. Deficiente e Inicial describen a un departamento que todavía no llega a esa base.

Cada departamento se mira a través de ocho dimensiones, agrupadas en dos capas. La **base operativa** —cómo está montado el departamento por dentro— reúne Procesos y Rutinas, Tecnología y Automatización, Datos, y Equipo y Gobierno. La **producción** —qué entrega el departamento hacia afuera— reúne cómo se presenta, a quién prioriza, con qué alcance llega y cómo aprende. El resultado de un departamento se lee por capa: en qué nivel está su base operativa y en qué nivel está su producción.

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

El hilo que las une: te presentas, afinas a quién priorizas, llegas con tracción y aprendes para la próxima. Ese hilo también es un orden: cuando dos de estas dimensiones están igual de débiles, se trabaja primero la que va antes.

Cada área responde esas cuatro preguntas de forma distinta, así que dentro de cada departamento la dimensión lleva un nombre propio —la tabla completa está en la Parte 4— y abre con la pregunta concreta que responde ahí.

### Cómo se relacionan las dos capas

La base operativa habilita; la producción es lo que sale. No son dos mitades independientes que se suman: sin datos confiables, roles definidos, cadencia de decisión y automatización con lógica, no hay dónde apoyar la proactividad sistemática ni el aprendizaje continuo, por mucha voluntad que le ponga el equipo.

Por eso la producción está definida de forma escueta en Funcional: lo que se pide ahí es la versión básica de cada capacidad, no su forma sistemática, que exige una base operativa madura. Un departamento Funcional es liviano en producción de forma honesta.

La brecha entre las dos capas es, por sí sola, un hallazgo:

- **Base más alta que producción** — hay capacidad instalada que no se está exprimiendo. La conversación es de adopción y casos de uso, no de construir más.
- **Producción más alta que base** — el departamento produce a pulso, sostenido por personas y no por sistema. Es frágil: la conversación es de cimentar antes de seguir empujando.
- **Las dos al mismo nivel** — el departamento está parejo, y lo que entrega corresponde a cómo está montado. La conversación es de subir el conjunto al siguiente nivel, no de corregir un desbalance.

## La escala explicada como una obra

Si la escala es el mapa y la brújula, lo que mide se parece a una casa en construcción. La analogía sirve para explicarle a cualquiera por qué la escala pide lo que pide.

La base operativa son los cimientos y la estructura; la producción, lo que se levanta encima y se usa. Funcional es la casa habitable: no la terminada ni la de lujo, sino la que ya se puede vivir. Y habitable quiere decir que alguien vive ahí: paredes levantadas sin nadie adentro es configuración sin adopción.

Una casa es tan firme como su parte más débil, y no se levanta un segundo piso sobre un cimiento rajado. Eso es la dimensión más débil mandando, y la base antes que la producción. Producir sobre una base débil es construir sin cimiento: se sostiene un tiempo, a pulso, hasta que cede. Y una etapa de la obra no se da por terminada hasta que pasa todos los puntos de la revisión, que es la regla con la que se alcanza cada nivel.

Los casos de uso son las obras por etapa. Y una obra así no se termina: la casa crece con la familia, se amplía, se renueva y se adapta.

## Los cinco niveles de un vistazo

Esta sección está escrita en el lenguaje con el que se le devuelve el resultado al cliente, y sirve para ubicarse rápido. La superficie donde de verdad se diagnostica es la matriz, en la Parte 3.

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

**Ventas.** Tu equipo comercial opera como una maquinaria base. Existe una única fuente de verdad —el CRM en uso real—, los prospectos se gestionan siguiendo un pipeline documentado, los roles están por escrito y hay rendición de cuentas en cadencia. Hacia afuera ya tienes un ICP definido, coherencia básica en mensaje y propuesta, y ningún deal se enfría sin que alguien reaccione. Sin pronóstico ni sofisticación todavía, pero con previsibilidad operativa.

**Marketing.** El área dejó de depender de héroes. Tienes marca, buyer personas y presencia digital documentadas, el stack contratado se usa de verdad, y tus canales —email, pauta, orgánico y el conversacional, como WhatsApp— salen coordinados bajo un mismo calendario, con visibilidad de costo por canal. La información describe la operación con confianza, sin reconstruirla a mano. La demanda es calificada y predecible, aunque la optimización fina todavía no existe.

**Servicio.** Tu entrega es consistente y ya no depende del individuo. Sabes qué tipos de cliente atiendes y qué espera cada uno. Hay un pipeline de servicio configurado, el equipo atiende en el sistema central con la ficha del cliente a la vista, los tickets están categorizados y el onboarding es estructurado. Priorizas por severidad, tienes macros para lo repetitivo y detectas a mano los riesgos evidentes antes de que estallen. Todavía no hay alertas automáticas, pero ya no esperas a que el cliente se queje.

### Eficiente

**Ventas.** Tu proceso dejó de ser etapas y se volvió método con disciplina medida. Mides conversión y velocidad por etapa, la automatización tiene lógica, el stack está integrado, la IA asiste al equipo en su trabajo diario y aparece un forecast confiable. Hacia afuera hay lead scoring por reglas, cuentas objetivo, contacto multicanal y análisis estructurado de ganadas y perdidas.

**Marketing.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la siguiente campaña. Los datos están unificados, enriquecidos y atribuidos; la segmentación y el scoring se automatizan; la IA asiste al equipo en su trabajo diario; y la presencia se optimiza tanto para buscadores como para motores generativos. El presupuesto se distribuye entre canales con criterio.

**Servicio.** El servicio empieza a adelantarse al problema. Tienes SLAs, escalación automática y autoservicio, y la IA asiste a tus agentes en su trabajo diario; mides tiempos de resolución y satisfacción, y la data se unifica con Ventas. Identificas riesgos y oportunidades antes de que el cliente levante la mano, ninguna solicitud se pierde entre áreas, y las cuentas clave tienen un responsable dedicado. La retención se vuelve predecible.

### Óptimo

**Ventas.** La IA hace el trabajo pesado y tu equipo valida donde importa. Agentes de IA califican leads y agendan reuniones, las llamadas se analizan solas y sugieren correcciones al playbook, el forecast lo calcula un modelo, y la priorización se alimenta de lo que saben Servicio y Marketing de cada cliente. El rep dedica su tiempo a las conversaciones que deciden el deal, no a la administración.

**Marketing.** La IA produce y ajusta; el equipo dirige. El contenido se genera y optimiza en ciclo continuo, la IA identifica micro-segmentos y adapta el mensaje al comportamiento de cada persona, los modelos reasignan presupuesto entre canales sobre la marcha, y los clientes que Servicio vuelve promotores traen clientes nuevos. El equipo define la estrategia y valida lo que sale.

**Servicio.** Un agente de IA resuelve consultas en producción y le pasa a una persona, con todo el contexto, las que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y gestiona excepciones; un modelo de salud de cuenta anticipa el riesgo antes de que el cliente lo manifieste, y cada cliente se atiende sabiendo lo que se le prometió en la venta y recibe detalles pensados para deleitarlo. Atender un cliente más casi no cuesta.

## Cómo avanza un departamento: de la disciplina al sistema

Entre Funcional y Óptimo cambia quién sostiene la operación.

En Funcional la sostienen las personas. Los datos están bien porque alguien pobla los campos, y la cadencia se cumple porque el equipo la respeta. Por eso Funcional incluye criterios de comportamiento y no solo de configuración: un sistema bien montado que nadie usa no es Funcional. Instalar esas rutinas en el equipo del cliente es gestión del cambio, no configuración de una herramienta, y es donde se juega la adopción.

Para pasar a Eficiente hace falta algo más: tener bajo control lo que la automatización y la IA van a necesitar: los duplicados, un contexto al día y, en Marketing, el permiso de cada persona para recibir mensajes. En Funcional eso no bloquea el nivel —se reporta como riesgo—, pero es requisito para dar el salto. En Eficiente, además, la automatización con lógica empieza a cargar parte del peso: las secuencias avanzan solas, las alertas avisan, los datos se depuran sin intervención.

En Óptimo lo sostiene el sistema. Los datos se capturan y se corrigen solos, la IA ejecuta el trabajo repetitivo, y las personas validan en los puntos que importan: las excepciones, los casos de alto valor y el entrenamiento del propio sistema.

Por eso no hay contradicción entre exigir disciplina en Funcional y pedir en Óptimo que el sistema no dependa de ella. Es el camino completo: primero el equipo aprende a operar con orden, y después ese orden se traslada al sistema.

## Del nivel al resultado del cliente

La escala mide en qué nivel está un departamento. El cliente, en cambio, no compra niveles: compra resultados. Que la dirección vea en qué etapa se caen los negocios, que Marketing sepa cuánto le cuesta cada lead, que Servicio retenga clientes que antes se iban sin aviso.

El puente entre las dos cosas son las líneas de resultado de la matriz. Cada nivel, desde Funcional, dice lo que el cliente puede hacer, ver o decidir que antes no podía. Cuando se conoce el resultado que persigue un cliente, se busca en esas líneas qué dimensión y qué nivel lo entregan. Ese cruce dice qué hay que trabajar, y de ahí nace el caso de uso.

La escala es el instrumento de diagnóstico, no la prueba. Muestra dónde está el cliente y hacia dónde puede ir; la prueba de que se logró el resultado es el criterio de aceptación del caso de uso que lo entrega. Por eso subir de nivel no se presenta como si fuera el resultado: es la condición para que el resultado ocurra.

## Land and expand: aterrizar y crecer con la escala

Land and expand es la forma en que Smarteam crece con cada cliente: primero aterrizar con un servicio de entrada, después expandir con casos de uso. La escala es lo que ordena los dos tiempos.

**Aterrizar.** El primer servicio lleva un departamento a Funcional: cimentar lo que hace falta para que todo lo demás se sostenga. Se diagnostica, se implementa lo que falta y se entrena al equipo para operarlo. Al entregar, el departamento queda en Funcional por confirmar: lo instalado, lo escrito y lo aprendido ya están, y los hábitos ya empezaron; se confirman en la remedición, cuando el equipo ya operó un tiempo. Lo que se promete es una base operativa sólida, no todo lo que la tecnología permite hacer. Conviene dejarlo claro desde el primer día, porque un departamento Funcional es liviano en producción a propósito.

**Expandir.** Una vez en Funcional, cada capacidad de Eficiente u Óptimo se puede convertir en un caso de uso: una implementación acotada más su entrenamiento, que mueve una dimensión de un nivel al siguiente. Los casos de uso se ofrecen a partir del resultado que persigue el cliente, no de lo que resulte más fácil de cotizar.

Algunos criterios de Eficiente y Óptimo describen la cultura del cliente: que decida con datos o que se adelante a los problemas. No se venden como un caso de uso técnico: se trabajan con acompañamiento y gestión del cambio, sobre lo que ya instalaron otros casos de uso.

Qué se ofrece después lo decide la regla de la Parte 2, en Qué se trabaja primero: se mueve la capa más baja, empezando por su dimensión más débil, y solo hasta el nivel objetivo que se acordó con el cliente según el resultado que persigue. Si ese resultado pide empezar por otra dimensión de esa capa, el CSE cambia el orden y escribe por qué. Y la brecha entre las dos capas, explicada en Cómo se relacionan las dos capas, dice qué conversación toca tener con el cliente.

El momento natural de expandir es la remedición. Entre 60 y 90 días después de entregar se vuelve a medir: se confirma que el cliente sostiene Funcional y se abre la conversación de qué sigue, con la escala en la mano.

**La apertura a la asesoría.** El aterrizaje también sirve para calificar al cliente. No todos quieren acompañamiento metodológico o estratégico; algunos solo necesitan una buena implementación. Esa apertura no es un nivel de la escala ni cambia el diagnóstico: es la señal de si el cliente es para expandir. Si la tiene, se construye una relación de crecimiento por casos de uso. Si no la tiene, se le entrega una muy buena implementación, y es un cliente que puede recomendar a otros. Esta señal se registra en el handoff, no en la escala.

**Cada área aterriza distinto.** Llevar Ventas o Servicio a Funcional es sobre todo montar la arquitectura y enseñar a usarla: el pipeline, las etapas, la asignación, los reportes. Llevar Marketing a Funcional es sobre todo habilitación: enseñarle al equipo a operar cada canal, a sostener un calendario y a coordinar una campaña entre email, pauta, orgánico y el canal conversacional. Por eso aterrizar Marketing suele pedir más acompañamiento, y conviene explicarlo así cuando el cliente compara precios.

---

# Parte 2 — Cómo se aplica

## Dos formas de aplicar la escala

La escala se aplica de dos formas. Las dos miran las mismas ocho dimensiones con los mismos cinco niveles; cambian quién la aplica, cuánto se pregunta y qué tan exacto es el resultado.

**El chequeo.** Es el test para prospectos, y sirve para abrir la conversación. Pregunta primero por el equipo, la industria y el perfil de negocio, y después hace una o dos preguntas por cada dimensión de los departamentos que el prospecto elige. Con esas respuestas se estima el nivel de cada dimensión por mejor ajuste —el nivel cuya descripción en la matriz calza mejor con lo que contó el prospecto—, sin recorrer los criterios uno por uno. Por eso todo lo que muestra va marcado como estimado. Entrega el nivel de cada departamento y de sus dos capas; el costo de quedarse en las dimensiones que están debajo de Funcional; lo que ganaría al subir, que son las líneas de resultado del nivel siguiente —debajo de Funcional, las de Funcional—; y una sola recomendación para empezar, con su razón. Lo que pide Funcional se muestra solo como detalle plegado, y si una respuesta deja ver un riesgo, se muestra con su mensaje.

**El diagnóstico.** Lo hace el CSE con los agentes de Nexus, cuando el prospecto ya es cliente. Recorre los criterios uno por uno con la regla estricta de Cómo se evalúa cada dimensión: un agente con acceso al sistema verifica lo comprobable, lo declarado se confirma pidiendo la evidencia, y el CSE evalúa lo que solo se ve explorando. Si de un criterio no hay información, el CSE la busca antes de cerrar el diagnóstico; si no la consigue, cuenta como no cumplido y el informe dice cuántos quedaron así. La IA propone el nivel con su evidencia, y el CSE lo confirma o lo ajusta con la razón escrita. Entrega la estructura completa: las ocho dimensiones de cada departamento, con los criterios que cumple y los que le faltan. Es el que fija la línea base, y se repite en cada remedición.

El chequeo y el diagnóstico no se comparan como si fueran la misma medición. Quien se autoevalúa suele ubicarse un nivel arriba, y esa diferencia es una buena conversación: se registra, pero el avance se mide siempre de diagnóstico a diagnóstico. Lo que el prospecto contó en la venta le llega al CSE y le sirve para saber dónde mirar, pero no cuenta como evidencia del diagnóstico.

No todo cliente se diagnostica con la misma amplitud. Depende del resultado que persigue y de su apertura a la asesoría: una implementación corta o un servicio puntual puede diagnosticar un solo departamento, mientras que una relación de consultoría diagnostica todos los que se atienden.

Lo que no cambia es esta regla: se pueden diagnosticar menos departamentos, pero no menos dimensiones. Dentro de un departamento se evalúan siempre las ocho —o las que apliquen a su perfil—, en el chequeo, en el diagnóstico y en el que se hace antes de empezar un caso de uso, porque el nivel de cada capa es el de su dimensión más débil. Si se salta una, no se sabe cuál es la más débil, y el nivel de la capa deja de ser válido.

## Cómo se evalúa cada dimensión

Se diagnostica un departamento a la vez, recorriendo sus ocho dimensiones una por una. El nivel del departamento no se juzga de un vistazo: se construye a partir de esas ocho lecturas.

Para cada dimensión se contrasta la evidencia contra los criterios de cada nivel, y la regla cambia según el nivel. Deficiente e Inicial describen lo que falta, así que entre esos dos se asigna el que mejor calza con la evidencia. De Funcional para arriba los criterios describen lo que ya está en su lugar, y la regla es estricta: una dimensión está en un nivel cuando cumple todos los criterios que deciden ese nivel y los de los anteriores desde Funcional. Si le falta uno, queda en el nivel anterior; si no cumple todos los de Funcional, se asigna Deficiente o Inicial según lo que mejor calce. Los criterios que la escala condiciona —los que abren con una condición, como «si hay» o «si lo que se vende es limitado»— solo cuentan cuando aplican, igual que los que dependen del perfil de negocio.

Un criterio se cumple por lo que busca, no por su letra. Si la dimensión lo resuelve de una forma más avanzada —por ejemplo, con un criterio de un nivel superior que hace lo mismo mejor—, cuenta como cumplido.

La regla estricta es a propósito: permite saber con exactitud cuándo una dimensión llegó a un nivel y qué le falta, y eso hace que el avance se pueda calcular y mostrar.

Esta regla es la del diagnóstico. El chequeo no recorre los criterios: estima cada dimensión por mejor ajuste, como dice Dos formas de aplicar la escala. En los dos, cada evidencia cuenta en una sola dimensión, la que responde su pregunta; los casos dudosos —dónde va el forecast, el lead scoring o el canal conversacional— los resuelve la Regla de asignación, al final de esta parte.

**Criterios de riesgo.** No todos los criterios deciden el nivel. Algunos, marcados como riesgo, protegen algo que el departamento todavía no necesita para operar, pero que se vuelve indispensable al dar el siguiente paso, sobre todo al empezar a usar IA. La prueba para distinguirlos: si sin ese criterio el departamento deja de cumplir lo que pregunta su dimensión sin depender de héroes, decide el nivel; si funciona igual pero queda expuesto, es riesgo. En la práctica, tener algo suele decidir el nivel, y mantenerlo vigente suele ser riesgo.

Un criterio de riesgo no impide llegar a Funcional, pero sí pasar a Eficiente, que es donde la IA empieza a trabajar como asistente. Mientras esté pendiente, se reporta junto al nivel como un riesgo activo.

**Niveles por confirmar.** Algunos criterios describen un hábito: algo que el equipo repite, no algo que se instala, se escribe o se sabe. Lo instalado, lo escrito y lo sabido se verifican el día que se entrega; un hábito solo se confirma después de que el equipo operó un tiempo. Esos criterios llevan la marca hábito.

Un hábito puede estar en tres estados. Cumplido, cuando ya se comprobó en el tiempo: en una rutina con cadencia, al menos 4 de las últimas 5 veces que correspondía. Iniciado, cuando la rutina ya existe —está agendada, configurada o el equipo ya está entrenado— pero todavía no tiene esa historia. Y no cumplido, cuando no se hace.

Cuando a una dimensión solo le faltan hábitos iniciados para alcanzar un nivel, ese nivel queda por confirmar. Cuenta como alcanzado, también en el puntaje, y en la siguiente remedición se confirma o baja. Un hábito que no se hace cuenta como no cumplido, así que un nivel hecho solo de hábitos no se regala: se alcanza cuando la rutina existe. Confirmarlo es revisar cómo funcionó en el tiempo: la mayoría de los hábitos se ven en la historia del sistema —las reuniones que se hicieron, los correos que salieron, la actividad sobre los negocios—, y algunos solo se confirman observando cómo opera el equipo. Es el trabajo de la etapa de adopción.

## Cómo se verifica cada criterio

Cada criterio de la matriz lleva al final su identificador y la forma en que se verifica. Hay tres formas.

**Comprobable.** La evidencia está en los datos o la configuración del sistema: registros, propiedades, flujos, reportes. Quien tiene acceso lo confirma mirando, sin preguntarle a nadie. Por ejemplo, que todo deal tenga fecha de cierre, monto y responsable.

**Declarado.** Existe o pasa fuera del sistema: un documento, una guía, un calendario de reuniones, un acuerdo escrito. El cliente lo declara, y al explorar se confirma pidiendo la evidencia. Por ejemplo, que haya un documento con la definición del cliente ideal.

**Evaluado.** Describe cómo opera el equipo, y ni el sistema ni la palabra del cliente alcanzan para confirmarlo. Requiere que alguien con criterio observe. Por ejemplo, que el equipo use el CRM como herramienta de trabajo y no por obligación.

Cuando un criterio combina dos cosas, se clasifica por la parte que decide si se cumple.

Esto ordena quién verifica qué. El chequeo solo tiene lo declarado, porque se construye con lo que el prospecto cuenta y no ve su sistema. En el diagnóstico, un agente con acceso al sistema puede verificar lo comprobable, y el CSE, al explorar, evalúa lo que solo se ve observando y confirma lo demás; por eso la línea base la fija él.

Que un criterio sea comprobable no significa que se confirme el día de la entrega. Si describe algo que se sostiene en el tiempo, como una cadencia que se cumple, la evidencia aparece en los datos recién después de que el equipo opera un tiempo.

## Cómo se leen los criterios

Para que dos personas decidan igual, algunas palabras de los criterios tienen un valor fijo. «La mayoría» quiere decir al menos 80%. «Se sostiene» y «de forma consistente» quieren decir en al menos 4 de las últimas 5 veces que correspondía. «A tiempo» quiere decir dentro del plazo que define el propio proceso del cliente. «No se deja envejecer» quiere decir que se revisa y se actualiza al menos una vez por trimestre. Y «sin pensarlo», sin consultar el documento.

**Departamentos de una o dos personas.** Varios criterios suponen un equipo o un líder aparte: roles por escrito, reuniones, que cualquiera explique igual el proceso. En un departamento de una o dos personas se leen como lo que haría falta para que otra persona pudiera tomar el puesto mañana: los roles por escrito son la función escrita; las reuniones del equipo, la revisión periódica con quien supervisa; y que cualquiera explique igual el proceso, que esté documentado de forma que alguien nuevo lo explique igual. Así se conserva lo que Funcional pide —no depender de una persona— aunque el equipo sea de una sola persona.

**Equipos grandes.** Cómo se evalúa lo que hace «cualquier persona» de un equipo grande es una regla en espera del manual de operación: se activa con el primer diagnóstico de un equipo de más de 20 personas. Mientras tanto, el CSE decide a quién observar y lo escribe en la evidencia.

## Criterios requeridos

Algunos criterios no se pueden cumplir sin otro. Enfocar el esfuerzo en los leads que encajan con el cliente ideal necesita que el cliente ideal esté escrito; rendir cuentas en la pipeline review necesita que la reunión ocurra. Cuando ese otro criterio está en otra dimensión, o en un nivel anterior de la misma, el criterio lo dice en su etiqueta: lo requiere.

Es la forma de no pedir lo mismo dos veces. Cada cosa se pide en una sola dimensión, la que responde su pregunta, y quien depende de ella la requiere en vez de repetirla.

Un requerido no cambia el cálculo. El nivel y el puntaje de cada dimensión salen solo de sus propios criterios, como dice Cómo se evalúa cada dimensión. Si un requerido bajara el nivel de quien lo necesita, una sola cosa que falte le costaría a dos dimensiones, y eso es justo lo que se evita.

**Para leer la escala.** Se ve de dónde se sostiene cada criterio y cuáles son cimiento: los que más criterios requieren son los que conviene tener primero.

**Para ordenar el trabajo.** Lo que un criterio requiere se hace antes que él. Qué dimensión se trabaja primero lo sigue decidiendo la regla de Qué se trabaja primero; dentro de lo que falta, lo requerido va antes.

**Para revisar un diagnóstico.** Un criterio que se dio por cumplido sin que lo esté lo que requiere es una señal para volver a mirar: o lo requerido se resuelve de otra forma, o el criterio no está tan cumplido como parece.

Solo requieren, y solo se requieren, criterios de Funcional para arriba: Deficiente e Inicial describen lo que falta y se asignan por mejor ajuste. Lo requerido es siempre de un nivel igual o anterior —un criterio de Funcional no depende de uno de Eficiente—, y si es de la misma dimensión, de un nivel anterior. Con un perfil de negocio o con una edición, un requerido que no aplica se deja de lado: no se exige lo que no cuenta.

## El perfil de negocio

No todas las empresas venden igual, y la escala no cambia de estructura por eso: cambia qué criterios aplican. Cada unidad que se diagnostica tiene un perfil de negocio, que responde dos preguntas.

**Cómo se cierra la venta.** Con equipo, cuando una persona trabaja cada oportunidad; transaccional, cuando la venta se cierra sin que nadie la trabaje —en caja, en el sitio web o por autoservicio—; o mixta, cuando conviven las dos.

**Qué pasa después de la venta.** Relación única, cuando el cliente compra una vez; recompra, cuando vuelve a comprar sin contrato; o relación continua, cuando hay suscripción, contrato o servicio.

Los criterios que dependen del perfil llevan una marca: venta con equipo; venta sin vendedor, que vale para la venta transaccional y la mixta; cliente recurrente, que vale para recompra y relación continua; recompra; o relación continua. Si la marca no corresponde al perfil de la unidad, el criterio no aplica y sale de la cuenta. En la venta mixta aplican todos los que dependen de cómo se cierra la venta: los de venta con equipo se evalúan sobre el canal que vende con personas, y los de venta sin vendedor, sobre el que vende solo.

En la venta transaccional también hay pipeline y negocios: se crean solos, desde la tienda o el sitio web, y dan la reportería. Por eso los demás criterios de Ventas se leen sobre esa venta automática: el negocio es el pedido o el carrito, el vendedor es el canal, y la razón de pérdida es el punto donde se abandona la compra. Lo que un criterio dice de lo que hace un vendedor, y no tiene equivalente, no aplica. Si una dimensión se queda sin criterios que apliquen en Funcional —como Priorización de Leads en una venta transaccional—, la dimensión no aplica a ese perfil: se reporta así y no entra en el nivel ni en el puntaje de su capa.

**La próxima compra.** Donde el cliente vuelve a comprar sin contrato, la próxima compra se trata como un negocio más, se venda con equipo o sin vendedor: si no llega cuando se esperaba, es un negocio que se enfrió, y reactivarlo es trabajo de Ventas. La renovación de un contrato, en cambio, es de Servicio.

El perfil decide qué criterios aplican; la industria decide con qué edición se lee la escala. Una universidad y una inmobiliaria venden las dos con equipo, pero una habla de matrícula y la otra de reserva, y a cada una le importan cosas que a la otra no. Eso vive en las ediciones por industria, en la Parte 5: cada edición dice la escala con las palabras de su industria y le suma los criterios que solo tienen sentido ahí. La matriz de la Parte 3 es la escala general: con ella se mide a quien todavía no tiene una edición.

**Qué unidad se diagnostica.** La unidad es el equipo que se atiende. En empresas grandes no se atiende a toda la empresa, sino a subequipos —la venta a empresas de una telco, una unidad de un grupo, una facultad—, y cada uno se diagnostica por separado, con su propio perfil. Lo mismo vale cuando dos ventas distintas las atienden equipos distintos: la tienda de una cadena y su venta a empresas o a proveedores son dos unidades; si las atiende el mismo equipo, es una sola, de venta mixta. Cuando se atiende a varios, se puede armar una vista que los junte.

## El nivel: de la dimensión al departamento

El nivel de una capa es el de su dimensión más débil. Si en la base operativa Procesos, Tecnología y Equipo están en Funcional pero Datos está en Inicial, la base operativa es Inicial. Se toma el piso, no el promedio, a propósito: promediar dejaría que una dimensión rota se esconda detrás de las fuertes, y es justo esa dimensión rota la que el cliente tiene que arreglar. El nivel de la capa nunca reemplaza al detalle: las cuatro dimensiones se reportan siempre, porque ahí está lo accionable.

El nivel del departamento es el de su capa más baja, por la misma razón: una capa fuerte no compensa una débil. No hay promedios ni ponderaciones entre capas. Aun así, la lectura útil son las dos capas, no la cifra suelta: "tu base operativa está en Funcional, tu producción en Inicial" dice algo accionable que "Ventas: Inicial" esconde.

## El puntaje de 0 a 100

Además del nivel, cada dimensión, cada capa y cada departamento llevan un puntaje de 0 a 100. Cada nivel ocupa un tramo de 20 puntos: Deficiente de 0 a 20, Inicial de 20 a 40, Funcional de 40 a 60 y Eficiente de 60 a 80; Óptimo, que es el techo, vale 100. El tramo lo pone el nivel, y la posición dentro del tramo, cuánto se avanzó hacia el nivel siguiente.

En una dimensión, ese avance es su cercanía al siguiente nivel: cuántos criterios del nivel siguiente ya cumple. «Funcional, cumple 2 de 4 para Eficiente» está a mitad de su tramo, y saca 50. En una capa o en el departamento, el avance es el promedio del de sus dimensiones: las que ya llegaron al nivel siguiente cuentan completas, y las demás, con lo que llevan. Así el número nunca contradice el nivel —no puede pasar al tramo siguiente hasta que llegue la dimensión más débil— y, a la vez, sube cada vez que algo avanza, aunque el nivel todavía no cambie.

El chequeo no recorre los criterios, así que ubica cada dimensión a mitad de su tramo —Inicial, 30; Funcional, 50— y calcula la capa y el departamento igual, con ese supuesto. El cálculo exacto, con todos sus casos y ejemplos, está en la especificación del cálculo.

## El nivel objetivo

No todo departamento tiene que llegar a Óptimo. Subir cuesta, y solo vale la pena donde el resultado que persigue el cliente lo necesita; empujar todo al máximo gasta esfuerzo donde lo suficiente ya basta. Por eso cada departamento diagnosticado tiene un nivel objetivo, que el CSE acuerda con el cliente a partir del resultado que persigue.

Por defecto, el objetivo es Funcional, porque es donde la operación deja de depender de una persona. Va más arriba solo si el resultado lo pide. Y si el resultado depende de una dimensión en particular —por ejemplo, que la IA califique los leads—, esa dimensión puede tener un objetivo propio, más alto que el del departamento, con su justificación.

Un departamento que llegó a su objetivo deja de empujarse: se sostiene y se vuelve a medir. El objetivo se revisa cuando cambia el resultado que persigue el cliente. En los prospectos, que todavía no dicen qué persiguen, el objetivo es Funcional. Si el chequeo muestra que un departamento ya llegó a Funcional, su recomendación apunta al nivel siguiente —en Óptimo, a sostenerlo—, porque sirve para abrir la conversación de qué resultado persigue.

## Qué se trabaja primero

Solo se trabaja lo que está debajo de su nivel objetivo. Si se midió más de un departamento, se empieza por el de nivel más bajo. Dentro de él, el orden sale de dos pasos:

1. **La capa más baja.** Si las dos están parejas por debajo de Funcional, va primero la base, porque mejorar lo que se entrega sin proceso ni datos no se sostiene; si están parejas de Funcional para arriba, va la producción.
2. **Dentro de esa capa, la dimensión de nivel más bajo.** Entre las del mismo nivel, la que va antes en el orden de dependencias.

El resultado que persigue el cliente entra por dos lados. Por el nivel objetivo, que dice hasta dónde subir cada departamento y, si hace falta, cada dimensión. Y por el criterio del CSE: si ese resultado pide trabajar antes otra dimensión de esa misma capa, el CSE cambia el orden y escribe la razón. Para eso sirven las líneas de resultado: muestran qué dimensión y qué nivel entregan lo que el cliente persigue. El puntaje no decide qué se trabaja: muestra el avance. Y el informe dice siempre por qué va primero.

**Orden de dependencias.** Dentro de cada capa, las dimensiones tienen un orden: la que va antes, si no se resuelve, frena a las que vienen después. En producción, el orden es el hilo de la escala: te presentas, afinas a quién priorizas, llegas y aprendes. En la base, depende de cómo se vende. Si una dimensión no aplica al perfil de negocio, se salta.

| Capa | Cuándo | Orden | Por qué |
|:--|:--|:--|:--|
| Base operativa | Marketing, Servicio, y Ventas con equipo | Procesos y Rutinas → Tecnología y Automatización → Datos → Equipo y Gobierno | El proceso dice qué hacer, la tecnología lo ejecuta, los datos salen de usarla y el equipo gobierna con ellos. |
| Base operativa | Ventas transaccional | Tecnología y Automatización → Datos → Procesos y Rutinas → Equipo y Gobierno | La venta ocurre en el sistema: si no entra sola, no hay datos para nada más. |
| Base operativa | Ventas mixta | Tecnología y Automatización → Procesos y Rutinas → Datos → Equipo y Gobierno | El sistema es lo único que sirve a los dos canales; después va el proceso del canal con personas, que es el que genera los datos. |
| Producción | Ventas | Propuesta y Coherencia → Priorización de Leads → Tracción del Deal → Aprendizaje de Ganadas y Perdidas | Sin cliente ideal y mensaje común no se puede priorizar; sin prioridad, el seguimiento se dispersa; sin seguimiento, no hay de qué aprender. |
| Producción | Marketing | Marca y Presencia → Segmentación → Canales y Alcance → Medición y Aprendizaje | Los buyer personas se definen primero, junto con la marca: sin ellos no hay segmentos, sin segmentos no se sabe a quién llegar, y sin canales no hay qué medir. |
| Producción | Servicio | Consistencia de Atención → Priorización de Clientes → Proactividad → Escalabilidad del Servicio | Los tipos de cliente se definen primero: sin ellos no hay niveles de atención, sin niveles no se sabe a quién adelantarse, y solo se escala lo que ya se hace bien. |

La producción gana el empate porque es lo que el cliente ve y lo que mueve su resultado. Pero con esta regla nunca queda más de un nivel adelante de la base, porque producir sobre una base más débil es producir a pulso, sostenido por personas y no por sistema. Una base tan rota que impide producir no necesita una excepción: ya es la capa más baja.

## Volver a medir

El diagnóstico no se hace una sola vez. Un departamento cambia, y la escala sirve para ver ese cambio: dónde estaba, dónde está y qué se movió.

La medición que cuenta como punto de partida es el diagnóstico que fija el CSE cuando explora, no el chequeo de la venta. El chequeo puede ser bueno, pero es una estimación que descansa en lo que el prospecto declara de sí mismo; el CSE suma lo que se comprueba en el sistema y lo que evalúa explorando, y con eso confirma el nivel o lo corrige, incluso hacia abajo. Las remediciones se comparan contra esa línea base. Compararlas contra el chequeo haría que el avance se esconda o se infle solo por haber medido de forma distinta.

En la entrega se repite el diagnóstico y ya se ve avance, sobre todo en lo que se instaló y se puede comprobar en el sistema. La confirmación llega después: la primera remedición va entre 60 y 90 días después de entregar. Ese plazo no es arbitrario — varios criterios de Funcional describen comportamiento sostenido, no algo instalado: que la cadencia de contacto se cumpla, que el equipo use el CRM por convicción, que la reunión se sostenga, que el blog publique con regularidad. Nada de eso se puede verificar el día de la entrega, solo después de que el equipo haya operado un tiempo.

Después de esa primera remedición, conviene repetirla de forma periódica —trimestral es una cadencia razonable— para que el avance sea visible y no una impresión.

Al volver a medir se usan las mismas ocho dimensiones y los mismos criterios, y se revisan todos otra vez: nada se da por cumplido porque lo estaba en la medición anterior. Lo que se compara es el nivel de cada dimensión contra la línea base y contra la medición anterior, no una sensación general de mejora.

El avance se lee en dos alturas. El nivel del departamento sube por saltos: como lo define su capa más baja, y cada capa su dimensión más débil, puede quedarse igual varios trimestres aunque el departamento esté avanzando. Por eso va como titular, y debajo van las dimensiones que se movieron desde la medición anterior. Por ejemplo: «Ventas sigue en Inicial, pero ya tiene cinco de sus ocho dimensiones en Funcional». El puntaje ayuda a que se vea, porque sube cada vez que una dimensión avanza aunque el nivel del departamento siga igual. Las dos alturas se presentan siempre juntas, para que el avance real no quede escondido detrás de un nivel que todavía no cambia. Y junto a ellas van los riesgos activos, porque son lo que falta para dar el siguiente paso, y el nivel objetivo, para que se vea cuánto queda.

La remedición muestra que el nivel se movió; no prueba que el cliente logró el resultado que perseguía. Eso lo prueba el criterio de aceptación del caso de uso. Una dimensión puede subir de nivel sin que el resultado aparezca todavía, y conviene no presentarlo como si fuera lo mismo.

## Regla de automatización

El gradiente **manual → con lógica → autónomo** es el desempate principal entre niveles cuando se trata de automatización:

- **Funcional — automatización simple.** Un disparador, una acción, sin lógica condicional ni coordinación entre áreas. Rotación de leads por regla simple, un email automático tras un form, ticket asignado al recibirse, notificaciones internas, chatbot de árbol de decisión.
- **Eficiente — automatización con lógica o amplitud.** Secuencias multi-paso con ramificación y tiempos de espera (nurturing real), routing por múltiples condiciones o por capacidad, escalación automática de SLA, workflows que conectan áreas, enriquecimiento de datos, contenido que se adapta por segmento.
- **Óptimo — flujos IA-first con validación humana.** La IA ejecuta el trabajo —agentes que califican, agendan, resuelven o generan contenido— y las personas validan en los puntos que importan: excepciones, casos de alto valor y entrenamiento del propio sistema. El equipo pasa de ejecutar a supervisar.

La IA no define Óptimo por sí sola. Ya aparece en Eficiente como asistente que apoya a una persona —redacción de contenido, enriquecimiento de datos, sugerencias—. La línea entre Eficiente y Óptimo es quién ejecuta: en Eficiente la IA asiste y la persona hace el trabajo; en Óptimo la IA lo hace y la persona valida. Un caso no es Óptimo solo porque mencione IA, ni deja de serlo porque haya humanos involucrados: la pregunta es dónde están puestos.

## Regla de asignación

Cada evidencia observada se asigna a una sola dimensión —la que responde su pregunta—, nunca a dos. Los casos que no son obvios:

- Los **artefactos de ejecución de venta** (playbook, criterios de etapa, cadencia, metodología) se asignan a **Procesos de Ventas (1.1)**. Lo que recibe el cliente —el mensaje y la propuesta, con su estructura— se mide en **Propuesta y Coherencia (1.5)**, y la definición de lead calificado, en **Priorización de Leads (1.6)**. Cada uno se cuenta una sola vez.
- Que el equipo **trabaje en el sistema central** y no por fuera —el CRM en Ventas, el sistema de marketing, el de atención en Servicio— es una rutina, y se asigna a **Procesos** de cada área (**1.1, 2.1 o 3.1**), igual que vigilar que el proceso se cumpla; que las **conversaciones con los prospectos** queden en el sistema se asigna a **Tecnología (1.2)**.
- **Mejorar el proceso con lo aprendido** se asigna a la dimensión de aprendizaje de cada área —**Aprendizaje de Ganadas y Perdidas (1.8)**, **Medición y Aprendizaje (2.8)** o **Escalabilidad del Servicio (3.8)**—: Procesos mide que el proceso exista y se siga, no cómo cambia. Lo único que Procesos de Ventas conserva, en Óptimo, es la disciplina de probar una técnica nueva en un piloto antes de sumarla al proceso. Los **tests** de Marketing —de creatividades y de audiencias— también son aprendizaje, y van en **2.8**; probar un canal nuevo es alcance, y sigue en **Canales y Alcance (2.7)**.
- La **IA como asistente del equipo** —redactar, resumir, preparar— se asigna a **Tecnología** de cada área (**1.2, 2.2 o 3.2**) y es Eficiente. En Funcional no es requisito: solo se pide que, si el equipo usa IA, esta trabaje con un contexto básico. Los **paneles en tiempo real** también son de **Tecnología**, en Eficiente: ver lo que pasa mientras pasa es una capacidad del sistema, no un nivel de autonomía.
- El **forecast** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1) ni a 1.5.
- En la **frontera Marketing ↔ Ventas**, cada pieza se asigna por quién la ejecuta: la definición de a quién sirve el equipo comercial (ICP) en **1.5 (Ventas)**; la segmentación y personalización del mensaje de marketing en **2.6 (Marketing)**; marcar MQL (lo califica marketing) en **2.6 (Marketing)**; aceptar SQL (criterio del lado de Ventas) en **1.6 (Ventas)**; poblar el campo de etapa del ciclo de vida, como higiene de dato, en **Datos** del área que lo captura (1.3 o 2.3); el pipeline de ventas, con sus etapas y sus criterios de avance, en **Procesos (1.1)**. La definición de lead calificado es una sola y vive en 1.6; los criterios de avance de cada etapa del pipeline son otra cosa, y siguen en 1.1.
- En **Servicio**, la definición de los tipos de cliente que atiende el área —qué necesita cada uno y qué espera— se asigna a **Consistencia de Atención (3.5)**, como el ICP a 1.5 y los buyer personas a 2.5; la diferenciación de la atención según esos tipos, a **Priorización de Clientes (3.6)**.
- También en **Servicio**, el **pipeline de servicio**, con sus etapas, se asigna a **Procesos (3.1)**, igual que **quién responde por cada cliente**. La **ficha del cliente** —lo que compró, lo que ha pagado y su valor— se asigna a **Datos (3.3)**, y que el agente la use al atender, a **Priorización de Clientes (3.6)**. La **prioridad de cada ticket** es de **Priorización de Clientes (3.6)**; Datos pide su tipo y su motivo. La **escalación automática** es de **Tecnología (3.2)**. **Alimentar la base de conocimiento** y **buscar patrones** en el historial son de **Escalabilidad del Servicio (3.8)**, y **adelantarse al cliente**, de **Proactividad (3.7)**.
- Los **plazos de atención** se reparten así: definirlos es de **Procesos (3.1)**; avisar y escalar cuando están por vencer, de **Tecnología (3.2)** —si la solicitud la resuelve otra área, de **Proactividad (3.7)**—; medir cuánto se tarda y cuánto se cumplen, de **Datos (3.3)**; y rendir cuentas por ellos, de **Equipo y Gobierno (3.4)**. Lo que Procesos vigila en Eficiente y en Óptimo es que cada caso siga las etapas y los pasos del proceso: un plazo que vence no cuenta ahí.
- El **lead scoring por reglas** se asigna a la dimensión de segmentación o priorización de cada área (**1.6 en Ventas, 2.6 en Marketing**), y es nivel Eficiente. No se confunde con la calificación de Funcional: ahí basta aplicar criterios escritos, sea a mano o con una automatización simple sobre una propiedad; el scoring de Eficiente es un modelo de puntaje con varios atributos.
- El **canal conversacional y la bandeja** se asignan a **Tecnología** del área correspondiente (1.2, 2.2 o 3.2): un canal con bandeja básica es Funcional; varios canales en una bandeja unificada es Eficiente. Usar ese mismo canal para **salir** con cadencia —WhatsApp como canal de campaña— se asigna a Canales (2.7), no a Tecnología: una cosa es tenerlo conectado y otra es usarlo para llegar.
- El **análisis automático de conversaciones** se asigna a **1.8 (Ventas)**, no a Tecnología: es aprendizaje, no infraestructura. Lo que sale de ese análisis para mejorar el playbook es de 1.8; señalar a quien se sale del proceso es adherencia, y sigue en Procesos (1.1).
- La **siguiente mejor acción** que propone la IA se asigna a **Priorización de Leads (1.6)**; Tecnología (1.2) cuenta los agentes, la predicción de cierre y las respuestas sugeridas, no esa recomendación.
- La **integración con ERP** u otros sistemas se asigna a **Tecnología** del área que la implementa; **Datos** solo declara el resultado (registros completos y trazables).
- La **orquestación entre áreas** (SLAs, handoffs, rutinas conjuntas) se asigna a **Equipo y Gobierno** del área cuyo liderazgo sostiene la coordinación, y nunca es Funcional: su piso es Eficiente. El workflow técnico que la habilita se asigna a Tecnología. Las dimensiones 1.7, 2.7 y 3.7 miden el alcance hacia el destinatario final, no la coordinación entre departamentos.
- La **respuesta a un deal que se enfría** —reconocerlo a tiempo, reactivarlo, y que el líder se entere e intervenga— se asigna a **Tracción del Deal (1.7)**, y Equipo y Gobierno no la vuelve a contar. La cadencia general de contacto sigue en Procesos (1.1), y la notificación que el sistema le manda al vendedor, en Tecnología (1.2).
- El **lead que todavía no está listo para comprar** —que vuelva a nutrición y regrese cuando muestra interés— se asigna a **Tracción del Deal (1.7)**; el acuerdo con Marketing que lo hace posible es orquestación, y sigue en Equipo y Gobierno (1.4).
- La **próxima compra de un cliente que vuelve sin contrato** —recordarle la recompra, reactivar a quien dejó de comprar— se asigna a **Tracción del Deal (1.7)**; retener a quien está por cancelar un contrato y atender sus quejas sigue en **Proactividad (3.7)**, y las campañas hacia el mercado, en **Canales y Alcance (2.7)**.
- La **venta ganada que se cae antes de la entrega** —un pedido que se cancela o se devuelve, una reserva que se desiste, una matrícula que no llega a clases— no se mide en la escala general: es de las ediciones que la traen como criterio propio, y ahí se asigna a **Aprendizaje de Ganadas y Perdidas (1.8)**, igual que una pérdida. La salida de un cliente que ya recibía el servicio sigue en **Proactividad (3.7)**.
- La **coherencia de la oferta entre canales** —precios, promociones y condiciones— se asigna a **Propuesta y Coherencia (1.5)**; la coordinación de una campaña entre canales sigue en **Canales y Alcance (2.7)**.
- Donde se vende sin vendedor, **lo que la tienda le muestra a cada comprador** —sugerencias, oferta, trato a sus mejores clientes— se asigna a la **personalización de Ventas (1.6)**; el mensaje de las campañas para cada segmento sigue en **Segmentación (2.6)**.
- La **disponibilidad de lo que se vende** —unidades, cupos o existencias, a la vista de quien vende— se asigna a **Tecnología de Ventas (1.2)**, y que cada venta quede asociada a un **cliente identificado**, a **Datos de Ventas (1.3)**.
- Las **reseñas y calificaciones públicas** —pedirlas y responderlas— se asignan a **Marca y Presencia (2.5)**, porque son parte de cómo el mercado ve a la empresa; la mala calificación de un cliente puntual se atiende en **Proactividad (3.7)**. El **programa de referidos** se asigna a **Canales y Alcance (2.7)**.
- La **detección de riesgos y fechas críticas del cliente** —también las solicitudes que resuelve otra área, como administración o cobros— se asigna a **Proactividad (3.7)**; el seguimiento de cada cliente por su responsable sigue en Procesos (3.1), y los acuerdos entre los líderes de esas áreas, en Equipo y Gobierno.
- Los **detalles para deleitar a los clientes actuales** —regalías, beneficios, promociones de fidelización— se asignan a **Proactividad (3.7)**; las campañas hacia el mercado, a **Canales y Alcance (2.7)**.
- La **respuesta publicada para el cliente** a las consultas frecuentes se asigna a **Escalabilidad del Servicio (3.8)**; las plantillas internas para los agentes siguen en Consistencia de Atención (3.5), y el portal con base de conocimiento en Tecnología (3.2), en Eficiente. Mantener vigentes esas respuestas no decide el nivel: es el riesgo de contexto, en **Datos (3.3)**.
- La **distribución y el ajuste del presupuesto** entre canales se asignan a **Canales y Alcance (2.7)**, porque su pregunta incluye llegar con el costo correcto; Medición y Aprendizaje (2.8) mide cómo se aprende de cada campaña, no dónde se invierte.
- La **personalización del contenido** según el segmento o la persona se asigna a **Segmentación (2.6)**, y el **enriquecimiento de datos** a **Datos (2.3)**; ninguno de los dos se cuenta en Tecnología (2.2). **Segmentar por comportamiento** —qué abrió, qué visitó, qué compró— también es de **Segmentación (2.6)**: Datos (2.3) mide que el dato esté limpio y trazado, no cómo se usa.
- La **presencia en buscadores y en asistentes de IA** se asigna a **Marca y Presencia (2.5)**; Canales y Alcance (2.7) no la cuenta como un canal nuevo.
- Los **playbooks de servicio** —prevención, retención y expansión— se asignan a **Procesos (3.1)**, igual que los artefactos de venta en Ventas; Proactividad (3.7) mide que los riesgos y las oportunidades se atiendan a tiempo.
- El **uso de lo que produce otra área** —las señales de Servicio en la priorización de Ventas, los promotores de Servicio como canal de Marketing, el contexto de la venta en la atención de Servicio— se asigna, en Óptimo, a la dimensión de producción del área que lo recibe. No es orquestación: la coordinación entre líderes sigue en Equipo y Gobierno.
- La **rendición de cuentas contra meta** se asigna a **Equipo y Gobierno**, y con ella el tablero que consulta el líder y el reporte periódico a la dirección. Los **resultados de cada campaña** a la vista, en cambio, son de **Medición y Aprendizaje (2.8)**.
- La **reunión recurrente** es una sola: se asigna a **Procesos**, que es donde vive la rutina; **Equipo y Gobierno** solo dice que en ella se rinde cuentas.

---

# Parte 3 — La matriz

Cada área se presenta igual: sus ocho dimensiones, agrupadas en base operativa y producción, cada una con la pregunta que responde y sus cinco niveles. Esta es la superficie donde de verdad se diagnostica.

Desde Funcional, cada nivel lleva además una línea de resultado: lo que el cliente puede hacer, ver o decidir en ese nivel que antes no podía. No es un criterio y no se usa para ubicar el nivel; sirve para cruzar el resultado que persigue un cliente con el nivel que lo entrega: de ahí salen los casos de uso, el nivel objetivo y la razón del CSE cuando cambia el orden de lo que se trabaja primero.

Cada dimensión lleva además, debajo de su pregunta, una línea de costo de quedarse: lo que le cuesta al cliente estar debajo de Funcional. Se muestra cuando la dimensión está en Deficiente o Inicial, para que se vea lo que se pierde hoy y no solo lo que se ganaría al subir.

## Área 1 — Ventas

Mide el rendimiento del área de Ventas: cómo opera internamente y qué produce en pipeline y cierre.

### Base operativa

#### 1.1 Procesos y Rutinas

Si mañana rotan dos personas clave, ¿la operación comercial sigue corriendo igual?

*Descripción:* Mide si la venta sigue un proceso escrito y repetible, con etapas, cadencias y reuniones que no dependen de nadie.

*Costo de quedarse:* Si se va tu mejor vendedor, se lleva el proceso con él: cada quien vende a su manera y no hay forma de repetir lo que funciona.

**Deficiente.** Sin proceso. Cada asesor vende a su manera y la información clave vive en cabezas o libretas.

- No existe ningún documento del proceso ni de las etapas; cada rep usa su criterio. `[1.1.D1 · declarado]`
- Los leads se reparten sin ninguna regla (a ojo o por orden de llegada). `[1.1.D2 · comprobable]`
- Las reuniones internas, si ocurren, no dejan acuerdos ni cadencia. `[1.1.D3 · declarado]`
- Si se van dos personas clave, nadie sabe en qué quedó cada negocio. `[1.1.D4 · evaluado]`

**Inicial.** Hay intención de estructura, pero la ejecución es despareja.

- Existen etapas de palabra o en un borrador, pero cada rep las interpreta distinto. `[1.1.I1 · evaluado]`
- Hay un intento de pitch común que la mayoría no usa. `[1.1.I2 · evaluado]`
- Las pipeline reviews ocurren a cadencia irregular y sin estructura fija. `[1.1.I3 · declarado]`
- Que un deal quede bien registrado depende de la voluntad del rep, no de un proceso o rutina. `[1.1.I4 · comprobable]`

**Funcional.** Maquinaria base: una fuente de verdad, pipeline estructurado y previsibilidad operativa.

*Resultado:* Todo el equipo trabaja el mismo proceso en el CRM: los negocios avanzan con los mismos criterios, se contactan con la cadencia acordada y se revisan en cada pipeline review, así que si rota un vendedor, el siguiente sabe en qué va cada negocio.

- Cualquier rep explica igual las etapas del pipeline y sus criterios de avance. `[1.1.F1 · evaluado]`
- Cada proceso de ventas o prospección tiene su pipeline respectivo configurado con sus criterios de avance y aceptación. `[1.1.F2 · comprobable]`
- Hay proceso de venta documentado y cadencia de contacto definida (X intentos en Y días) que se cumple la mayoría del tiempo. `[1.1.F4 · comprobable · hábito]`
- La pipeline review corre en cadencia formal, semanal o quincenal. `[1.1.F5 · declarado · hábito]`
- Cualquier rep trabaja en el CRM, no en hojas ni notas aparte: lo abre como herramienta de trabajo, no por obligación. `[1.1.F6 · evaluado · hábito · venta con equipo]`

**Eficiente.** El proceso deja de ser solo etapas y se vuelve método con disciplina medida.

*Resultado:* El equipo vende con un mismo método, y el líder sabe dónde se desvía y corrige con datos, no de memoria.

- Hay metodología comercial formal en uso (SPIN, MEDDIC, BANT o equivalente). `[1.1.E1 · evaluado · hábito · venta con equipo]`
- Existen playbooks de discovery, calificación y manejo de objeciones que el equipo usa. `[1.1.E2 · evaluado · hábito · venta con equipo]`
- El líder monitorea la adherencia con datos del sistema, no de memoria. `[1.1.E3 · evaluado · hábito]`

**Óptimo.** El sistema vigila la adherencia y señala desviaciones; el equipo decide los ajustes.

*Resultado:* El proceso se corrige casi solo: el sistema señala las desviaciones y el equipo dedica su tiempo a probar mejoras, no a vigilar que se cumpla.

- El sistema detecta desviaciones y las señala al líder y al rep sin intervención. `[1.1.O1 · comprobable]`
- La adherencia es alta sin que nadie la vigile a mano. `[1.1.O2 · comprobable · hábito · venta con equipo]`
- Las técnicas nuevas se prueban en pilotos de ciclo corto antes de sumarlas al proceso. `[1.1.O3 · declarado · hábito]`

#### 1.2 Tecnología y Automatización

¿Qué parte del tiempo del vendedor se va en tareas que el sistema podría hacer, y cuánto del stack que paga el cliente se está aprovechando?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema y cuánto aprovecha el equipo el CRM, la automatización y la IA.

*Costo de quedarse:* Tus vendedores pierden horas en tareas que el sistema podría hacer, pagas herramientas que no usan, y los leads se enfrían mientras alguien decide a quién le tocan.

**Deficiente.** Sin CRM o uso mínimo.

- Los leads viven en listas o agendas personales. `[1.2.D1 · evaluado]`
- No hay automatizaciones ni aplicación de inteligencia artificial. `[1.2.D2 · comprobable]`

**Inicial.** CRM en funciones básicas con carga manual.

- Los reportes son manuales y muy básicos. `[1.2.I1 · comprobable]`
- La aplicación de la IA es básica y depende de las personas. `[1.2.I2 · evaluado]`

**Funcional.** Hay automatización simple en producción y, si se usa IA, trabaja con el contexto de los clientes.

*Resultado:* Ningún lead se pierde por no saber a quién le toca, lo que el vendedor habla con cada prospecto queda en el sistema, y deja de depender de su memoria para dar seguimiento.

- Los leads entrantes llegan a una bandeja o cola y se asignan por una regla simple (round-robin, territorio o fuente). `[1.2.F2 · comprobable · venta con equipo]`
- Cuando un deal requiere acción, el sistema le notifica al rep sin que el líder se lo recuerde. `[1.2.F3 · comprobable · venta con equipo]`
- Lo que cada vendedor habla con un prospecto por el canal conversacional, como WhatsApp, queda en el sistema aunque responda desde su teléfono. `[1.2.F4 · evaluado · hábito · venta con equipo]`
- Las ventas sin vendedor —en tienda, en el sitio web o por autoservicio— entran solas al sistema como negocios, con su monto, su canal y su cliente. `[1.2.F6 · comprobable · venta sin vendedor]`
- Si el equipo usa IA, esta tiene como contexto la información básica de los clientes y prospectos. `[1.2.F7 · comprobable]`
- Si lo que se vende es limitado —unidades de un proyecto, cupos de un programa o existencias—, quien vende ve en el sistema qué está disponible antes de ofrecerlo. `[1.2.F8 · comprobable]`

**Eficiente.** La automatización tiene lógica, el stack está integrado y la IA asiste al equipo en su trabajo diario.

*Resultado:* El vendedor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones se generan desde el sistema, no como documentos sueltos. `[1.2.E1 · comprobable · venta con equipo]`
- Hay secuencias de contacto de varios pasos que cambian según cómo responde el prospecto —si leyó, hizo clic o contestó—, y los leads y las conversaciones se asignan por múltiples condiciones o por capacidad, con control de quién ve y responde cada conversación. `[1.2.E2 · comprobable]`
- Hay integración con ERP u otros sistemas operativos cuando aplica. `[1.2.E3 · comprobable]`
- Hay paneles en tiempo real de conversión y de conversaciones: cuánto tarda la primera respuesta y cuántas quedan sin seguimiento. `[1.2.E4 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar, resumir conversaciones o preparar una reunión—, y la IA trabaja con el contexto de los clientes y prospectos. `[1.2.E5 · evaluado · hábito · requiere 1.3.F5, 1.3.F6, 1.3.F7]`

**Óptimo.** Agentes de IA califican y agendan; el rep trabaja con predicción de cierre y respuestas sugeridas.

*Resultado:* El vendedor dedica su tiempo a las conversaciones que deciden la venta: los agentes califican y agendan, y él trabaja con la predicción de cierre y con respuestas sugeridas para cada conversación.

- Hay análisis predictivo de cierre y sugerencias de respuesta según el contexto de cada conversación. `[1.2.O1 · comprobable]`
- Agentes de IA califican leads y agendan reuniones 24/7 en el canal conversacional, y le pasan al vendedor, con el contexto, a quien está listo. `[1.2.O2 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al CRM: el vendedor ve en la ficha, por ejemplo, el potencial de la cuenta, sin salir de su herramienta. `[1.2.O3 · comprobable · requiere 1.3.O4]`

#### 1.3 Datos

¿Confías en tu forecast, en tu conversión y en tu visibilidad de pipeline, o los validas antes de usarlos?

*Descripción:* Mide si los datos de ventas son confiables para decidir: registros completos, origen de cada negocio y reportes sin reconstruir.

*Costo de quedarse:* Decides con números que no cuadran: el pronóstico se arma a mano, cambia en cada reunión y nadie sabe cuál es el real.

**Deficiente.** Data muy desordenada.

- Hay contactos duplicados o incompletos. `[1.3.D1 · comprobable]`
- No hay trazabilidad por canal o vendedor; sacar un reporte confiable es imposible. `[1.3.D2 · comprobable]`
- La información de los compradores está en hojas de cálculo. `[1.3.D3 · evaluado]`
- No hay registro de las compras de los clientes. `[1.3.D4 · comprobable]`

**Inicial.** Data parcialmente limpia.

- Los registros se intentan depurar, pero persisten los vacíos de información. `[1.3.I1 · comprobable]`
- Hay dificultades para determinar desde qué canal viene cada lead. `[1.3.I2 · comprobable]`
- No se está guardando toda la información necesaria de los compradores. `[1.3.I3 · comprobable]`

**Funcional.** El reporte de pipeline describe el estado actual con confianza, sin reconstrucción.

*Resultado:* El líder ve el estado real del pipeline cuando lo necesita, sin armar el reporte a mano, y sabe de dónde vino cada negocio.

- Todo deal tiene fecha de cierre, monto y responsable poblados. `[1.3.F1 · comprobable]`
- Los duplicados están bajo control, a mano o de forma automática, y no distorsionan los reportes. `[1.3.F2 · comprobable · riesgo]`
- Todo deal tiene rastreable la fuente del contacto original. `[1.3.F3 · comprobable]`
- El reporte de pipeline se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4 · comprobable]`
- La documentación sobre el ICP no se deja envejecer. `[1.3.F5 · declarado · riesgo · hábito · requiere 1.5.F1]`
- La definición de lead calificado no se deja envejecer. `[1.3.F6 · declarado · riesgo · hábito · venta con equipo · requiere 1.6.F2]`
- La documentación sobre las soluciones ofrecidas no se deja envejecer. `[1.3.F7 · declarado · riesgo · hábito]`
- Se sabe qué parte de las ventas sin vendedor queda asociada a un cliente identificado, y ese número se revisa. `[1.3.F8 · comprobable · venta sin vendedor]`

**Eficiente.** Aparece el forecast con precisión, y la ficha del cliente empieza a reunir lo que viene de otros sistemas.

*Resultado:* La empresa puede comprometer un número de ventas con confianza, porque el pronóstico se acerca a lo que de verdad pasa.

- Hay forecast con cadencia fija (semanal o quincenal) y precisión alta. `[1.3.E1 · comprobable · hábito]`
- La deduplicación es automática por reglas o merge del sistema. `[1.3.E2 · comprobable]`
- La ficha de cada cliente reúne lo comercial con lo que viene de otros sistemas —facturación, pedidos— cuando aplica, y con su historial de conversaciones: la vista 360° empieza a tomar forma. `[1.3.E3 · comprobable · requiere 1.2.E3]`
- La mayoría de las ventas sin vendedor quedan asociadas a un cliente identificado, no a un cliente genérico. `[1.3.E4 · comprobable · venta sin vendedor]`

**Óptimo.** El forecast lo calcula un modelo y la vista 360° del cliente está operativa.

*Resultado:* El pronóstico se anticipa a lo que va a pasar, cruzando lo comercial con la facturación y el servicio, y los datos están al día sin que nadie tenga que cuidarlos.

- Cada lead, contacto y deal está enlazado en tiempo real. `[1.3.O1 · comprobable]`
- El pronóstico es predictivo: lo calcula un modelo de aprendizaje automático. `[1.3.O2 · comprobable]`
- La vista 360° del cliente está operativa. `[1.3.O3 · comprobable]`
- Ventas se apoya en el almacén central de datos de la empresa para su pronóstico, cruzando lo comercial con la facturación y el servicio. `[1.3.O4 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: se capturan y se corrigen solos, y las personas solo validan las excepciones. `[1.3.O5 · comprobable]`

#### 1.4 Equipo y Gobierno

¿El liderazgo decide con datos o con intuición, y con qué cadencia interviene?

*Descripción:* Mide si el liderazgo gestiona con roles claros, metas y datos, y si revisa al equipo con una cadencia fija.

*Costo de quedarse:* El líder se entera tarde de lo que pasa y decide por intuición: los problemas aparecen cuando ya no hay tiempo de corregirlos.

**Deficiente.** Equipo sin estructura formal.

- Cada asesor opera sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1 · evaluado]`
- El liderazgo apaga incendios; no hay métricas ni rendición de cuentas. `[1.4.D2 · evaluado]`

**Inicial.** Estructura básica con asignación por proyecto o segmento.

- El liderazgo revisa números básicos en hojas de cálculo. `[1.4.I1 · declarado]`
- Los informes de cómo opera el equipo se generan de forma manual. `[1.4.I2 · comprobable]`

**Funcional.** Roles claros y rendición de cuentas en cadencia, con dashboard descriptivo.

*Resultado:* Cada vendedor sabe qué se espera de él, y el líder sabe cada semana quién va bien y quién necesita ayuda, antes de que termine el mes.

- Cada persona del equipo tiene rol definido por escrito. `[1.4.F1 · declarado]`
- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (valor del pipeline, deals creados, tasa de cierre, volumen) y lo consulta al menos semanalmente. `[1.4.F2 · evaluado · hábito · requiere 1.3.F4]`
- En la pipeline review se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3 · evaluado · hábito · requiere 1.1.F5]`
- Cada vendedor —o cada canal, donde se compra sin vendedor— tiene una meta clara, y su avance se reporta en cadencia fija. `[1.4.F4 · declarado · hábito]`
- El líder ve en reportes automáticos qué tareas cumplió cada vendedor y cuáles tiene pendientes. `[1.4.F5 · comprobable · venta con equipo · requiere 1.1.F6]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con Marketing y escucha al equipo.

*Resultado:* Un vendedor nuevo produce más rápido, el traspaso de leads con Marketing tiene reglas que se cumplen, y lo que el equipo ve que no funciona llega a quien puede cambiarlo.

- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria. `[1.4.E2 · declarado]`
- El SLA y el handoff con Marketing están definidos y son trazables: tiempo de respuesta, calidad del lead y criterios de rechazo. `[1.4.E3 · comprobable · venta con equipo · requiere 1.6.F2]`
- Hay una cultura de retroalimentación del equipo hacia el sistema: lo que el equipo señala que no funciona se revisa y se le responde. `[1.4.E4 · evaluado · hábito]`

**Óptimo.** El liderazgo decide con analítica avanzada y sostiene mesas de innovación comercial.

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal deja más margen, qué vendedor aporta más y cuánto vale cada cliente en el tiempo.

- Las decisiones usan analítica avanzada (LTV, rentabilidad por canal, contribución por vendedor). `[1.4.O1 · evaluado · hábito]`
- Hay mesas regulares de innovación comercial. `[1.4.O2 · declarado · hábito]`

### Producción

#### 1.5 Propuesta y Coherencia

¿El equipo opera desde una definición compartida de a quién sirve, y el cliente percibe una propuesta coherente, o todo depende del rep que le toque?

*Descripción:* Mide si el equipo comparte cliente ideal y mensaje, y si la propuesta llega igual con cualquier vendedor.

*Costo de quedarse:* Cada vendedor cuenta una historia distinta y persigue clientes distintos: el comprador no ve qué te hace diferente y termina comparando por precio.

**Deficiente.** El cliente recibe mensajes y propuestas distintos según el vendedor; la calidad depende de cada uno.

- El mensaje que recibe el cliente cambia según quién lo atienda. `[1.5.D1 · evaluado]`
- La calidad de la propuesta que recibe el cliente depende del vendedor que le toque. `[1.5.D2 · evaluado · venta con equipo]`

**Inicial.** Hay coherencia incipiente pero no confiable; el mensaje y la propuesta todavía varían notablemente entre reps.

- Empieza a haber un mensaje común, pero todavía no llega igual a cada punto de contacto. `[1.5.I1 · evaluado]`
- Las propuestas todavía no están estandarizadas: cada vendedor las presenta a su manera. `[1.5.I2 · evaluado · venta con equipo]`

**Funcional.** Hay un ICP escrito y coherencia básica en mensaje y propuesta.

*Resultado:* Dos prospectos parecidos reciben el mismo mensaje y una propuesta igual de sólida, sin importar qué vendedor les toque ni por qué canal lleguen.

- Existe un documento con la definición del ICP / a quién sirve el equipo, consultable por cualquier rep. `[1.5.F1 · declarado]`
- El líder puede explicar quién es el cliente ideal sin consultar su documentación. `[1.5.F2 · evaluado]`
- Un cliente que habla con dos reps recibe el mismo mensaje de valor base. `[1.5.F3 · evaluado · hábito · venta con equipo]`
- Las propuestas están estandarizadas: tienen una estructura común reconocible, no armada desde cero cada vez. `[1.5.F4 · declarado · venta con equipo]`
- Si se vende por más de un canal, los precios, las promociones y las condiciones son los mismos en todos, o la diferencia es a propósito y está escrita. `[1.5.F5 · comprobable · venta sin vendedor]`

**Eficiente.** La propuesta de valor se distingue de la competencia y solo promete lo que se puede entregar.

*Resultado:* El mercado reconoce a la empresa por algo concreto: la propuesta se distingue de la competencia, se sostiene igual en cada contacto y promete lo que después se entrega.

- La propuesta de valor está diferenciada y es consistente en cada punto de contacto. `[1.5.E2 · evaluado · hábito]`
- Las propuestas solo prometen lo que el equipo puede entregar: el alcance se valida antes de enviarlas. `[1.5.E3 · evaluado · hábito · venta con equipo]`

**Óptimo.** La IA mantiene coherente el mensaje en cada punto de contacto, sin trabajo manual.

*Resultado:* La coherencia se mantiene sola a cualquier escala: el equipo puede crecer o cambiar sin que el mensaje se diluya.

- La IA mantiene coherencia de mensaje en tiempo real sin fricción manual. `[1.5.O1 · comprobable]`

#### 1.6 Priorización de Leads

¿El equipo trabaja los leads correctos, o todos por igual?

*Descripción:* Mide si el equipo decide a qué leads dedicar su tiempo con criterios escritos, basados en el cliente ideal.

*Costo de quedarse:* Tu equipo le dedica el mismo esfuerzo a quien nunca va a comprar que a quien está listo, y los mejores leads esperan su turno.

**Deficiente.** Se atienden leads por orden de llegada o preferencia.

- No hay criterios para distinguir oportunidades buenas de malas; se pierde tiempo en prospectos sin potencial. `[1.6.D1 · declarado]`

**Inicial.** Se prioriza por intuición o por listas estáticas.

- La segmentación es rudimentaria y no hay datos para decidir en qué leads concentrarse. `[1.6.I1 · comprobable]`
- El líder puede nombrar al ICP, pero no hay arquitectura de CRM para segmentarlo. `[1.6.I2 · comprobable]`

**Funcional.** Hay segmentación básica de leads y una definición escrita de lead calificado.

*Resultado:* El equipo deja de perder tiempo con prospectos que no van a comprar y concentra el esfuerzo en los que encajan con el cliente ideal.

- El equipo segmenta los leads por los atributos del cliente ideal antes de trabajarlos: en empresas, tamaño, industria o geografía; en personas, presupuesto, zona o lo que buscan. `[1.6.F1 · comprobable · venta con equipo · requiere 1.5.F1]`
- Hay una definición escrita de lead calificado —los criterios para aceptar un lead como SQL— y se aplica de forma consistente. `[1.6.F2 · comprobable · hábito · venta con equipo]`
- El esfuerzo se enfoca en los leads que encajan con el ICP. `[1.6.F3 · evaluado · hábito · venta con equipo · requiere 1.5.F1]`
- La documentación de ICP se usa en la arquitectura de CRM y en los formularios. `[1.6.F4 · comprobable · venta con equipo · requiere 1.5.F1]`

**Eficiente.** Aparece el lead scoring por reglas y las cuentas objetivo.

*Resultado:* Cada vendedor sabe cada mañana a quién llamar primero, y las cuentas que más importan se trabajan de forma deliberada.

- Hay lead scoring por reglas activo: un modelo que suma puntos por varios atributos, no una regla sobre una propiedad. `[1.6.E1 · comprobable · venta con equipo]`
- Las cuentas o los segmentos prioritarios están identificados formalmente. `[1.6.E2 · comprobable · venta con equipo]`
- El contacto con prospectos usa mensajes personalizados por segmento; la priorización empieza a ser proactiva por data. `[1.6.E3 · comprobable · venta con equipo]`

**Óptimo.** Agentes de IA priorizan sobre contexto completo y proponen la siguiente acción.

*Resultado:* El sistema dice qué oportunidad atender, qué hacer con ella y cuándo, con lo que saben Servicio y Marketing de cada cliente, incluido dónde hay riesgo o espacio para vender más.

- Agentes de IA analizan el contexto completo y dictan la siguiente mejor acción. `[1.6.O1 · comprobable · venta con equipo]`
- El sistema detecta riesgo y potencial de expansión. `[1.6.O2 · comprobable · venta con equipo]`
- La personalización se adapta en tiempo real a cada persona que participa en la decisión de compra. `[1.6.O3 · comprobable · venta con equipo]`
- La priorización usa señales de Servicio y de Marketing —qué clientes expanden, refieren o se van— para decidir qué perfiles perseguir. `[1.6.O4 · comprobable · venta con equipo]`

#### 1.7 Tracción del Deal

¿Qué pasa cuando un deal se enfría?

*Descripción:* Mide si alguien detecta cuando un deal deja de avanzar y si hay una respuesta acordada para reactivarlo a tiempo.

*Costo de quedarse:* Los negocios se enfrían en silencio: nadie ve cuándo dejaron de avanzar, y los pierdes sin saber por qué.

**Deficiente.** El vendedor está solo y contacta por un solo canal.

- No hay apoyo del liderazgo. `[1.7.D1 · evaluado]`
- Nadie se da cuenta de que los deals no avanzan. `[1.7.D2 · comprobable]`
- No hay un registro adecuado de los deals. `[1.7.D3 · comprobable]`
- No hay assets para presentar a los prospectos y apoyar visualmente la venta. `[1.7.D4 · declarado · venta con equipo]`

**Inicial.** Apoyo esporádico cuando el vendedor lo pide.

- Marketing envía materiales genéricos. `[1.7.I1 · evaluado]`
- El liderazgo ayuda a destrabar deals, pero no se anticipa: interviene cuando ya están en problemas. `[1.7.I2 · evaluado]`
- Cada vendedor tiene sus propios assets para ayudarse en la venta. `[1.7.I3 · declarado · venta con equipo]`
- Todos los intentos de hacer avanzar un deal se hacen por el mismo canal. `[1.7.I4 · comprobable]`

**Funcional.** Ningún deal se enfría en silencio: hay una respuesta acordada.

*Resultado:* Los negocios que se traban se detectan a tiempo y se reactivan por más de un canal, con assets estandarizados y con el líder actuando mientras todavía hay margen. Donde el cliente vuelve a comprar, la próxima compra tampoco se deja al azar.

- Los deals estancados se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada vendedor. `[1.7.F1 · evaluado · hábito]`
- La reactivación usa al menos dos canales, por ejemplo correo y llamada. `[1.7.F2 · comprobable · hábito]`
- El liderazgo interviene sobre los deals estancados durante el período, no al cierre del trimestre cuando ya se perdieron. `[1.7.F3 · evaluado · hábito · venta con equipo]`
- Hay assets estandarizados que ayudan a cerrar las ventas. `[1.7.F4 · declarado · venta con equipo]`
- Los clientes que ya deberían haber vuelto a comprar se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos. `[1.7.F5 · comprobable · hábito · recompra · requiere 1.2.F6]`

**Eficiente.** El contacto es multicanal, el sistema le avisa al líder de lo que se traba y el lead que no está listo sigue en nutrición.

*Resultado:* Ningún negocio espera a la reunión para recibir ayuda: el líder se entera cuando se traba, el lead que todavía no está listo sigue recibiendo contenido hasta que lo esté, y el vendedor tiene a mano el material que cada etapa necesita.

- El contacto multicanal está definido —correo, llamada, canal conversacional y redes— y orquestado en cadencias. `[1.7.E1 · comprobable · requiere 1.2.E2]`
- Los leads que todavía no están listos para comprar no se abandonan: vuelven a nutrición y regresan a Ventas cuando muestran interés. `[1.7.E2 · comprobable · venta con equipo · requiere 1.4.E3]`
- Los materiales de venta viven en una biblioteca central. `[1.7.E3 · declarado · venta con equipo]`
- Cuando un negocio lleva más tiempo del acordado sin avanzar, el líder recibe un aviso del sistema, sin esperar a la pipeline review. `[1.7.E4 · comprobable · venta con equipo]`

**Óptimo.** El sistema detecta fricción y dispara contenido, alertas o moviliza al equipo sobre las mejores oportunidades.

*Resultado:* Las mejores oportunidades reciben ayuda justo cuando la necesitan: el sistema detecta cuándo un negocio se traba y moviliza a quien corresponde.

- El sistema detecta fricción y dispara contenido de alto valor, alerta a directivos o moviliza al equipo sobre las mejores oportunidades. `[1.7.O1 · comprobable]`
- La distribución multicanal se autoajusta según el comportamiento del deal. `[1.7.O2 · comprobable]`

#### 1.8 Aprendizaje de Ganadas y Perdidas

¿El equipo mejora con cada deal, o repite los mismos errores?

*Descripción:* Mide si el equipo registra por qué gana y por qué pierde cada negocio, y si usa eso para mejorar.

*Costo de quedarse:* Pierdes negocios por las mismas razones una y otra vez, porque nadie registra por qué se ganan ni por qué se pierden.

**Deficiente.** No hay análisis después de la venta ni de la no-venta.

- Los errores se repiten porque no se detectan. `[1.8.D1 · evaluado]`
- Las objeciones del cliente se pierden. `[1.8.D2 · evaluado]`

**Inicial.** Comentarios ocasionales en reuniones sobre deals perdidos.

- No hay estructura ni documentación; el aprendizaje vive en cabezas. `[1.8.I1 · declarado]`

**Funcional.** La arquitectura para registrar el aprendizaje existe y se usa.

*Resultado:* El líder sabe por qué se pierden los negocios, con datos del trimestre y no con impresiones.

- Todo deal cerrado-perdido tiene razón de pérdida poblada. `[1.8.F1 · comprobable]`
- Las razones de pérdida usan una taxonomía definida, no texto libre. `[1.8.F2 · comprobable]`
- El líder puede sacar un reporte de razones de pérdida del trimestre sin reconstruir. `[1.8.F3 · comprobable]`

**Eficiente.** Hay análisis estructurado de ganadas y perdidas, y capacitación comercial formal.

*Resultado:* Los mismos errores dejan de repetirse y lo que funciona se repite: lo que se aprende de cada negocio ganado y de cada pérdida vuelve al proceso y a la capacitación del equipo.

- Se revisan periódicamente los deals ganados y perdidos para identificar patrones. `[1.8.E1 · declarado · hábito]`
- El proceso o playbook se refina con base en lo aprendido. `[1.8.E2 · declarado · hábito · requiere 1.1.F4]`
- Hay capacitación comercial recurrente y formal para el equipo. `[1.8.E3 · declarado · hábito · venta con equipo]`

**Óptimo.** Las llamadas se analizan solas y la IA sugiere correcciones al playbook.

*Resultado:* El equipo mejora en cada llamada: el análisis automático señala qué funciona y qué corregir, y la estrategia se ajusta con esa evidencia.

- Las llamadas se analizan automáticamente con coaching basado en patrones. `[1.8.O1 · comprobable · venta con equipo]`
- La IA propone correcciones al playbook a partir de lo que encuentra en las llamadas. `[1.8.O2 · comprobable · venta con equipo · requiere 1.1.E2]`
- La estrategia comercial se ajusta con base en data de qué funciona. `[1.8.O3 · evaluado · hábito]`

---

## Área 2 — Marketing

Mide el rendimiento del área de Marketing: cómo opera internamente y qué produce hacia el mercado.

### Base operativa

#### 2.1 Procesos y Rutinas

Si mañana rota el coordinador o el principal generador de contenido, ¿las campañas siguen saliendo en tiempo y forma?

*Descripción:* Mide si las campañas salen con un proceso y un calendario compartidos, sin depender de quién las arma.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona se va, el marketing se detiene y hay que empezar de cero.

**Deficiente.** Cada quien opera a su criterio; no hay calendario ni ceremonias.

- No existe calendario editorial; las campañas se improvisan. `[2.1.D1 · declarado]`
- No hay reuniones regulares de marketing. `[2.1.D2 · declarado]`
- El área depende de agencias externas sin coordinación interna. `[2.1.D3 · evaluado]`

**Inicial.** Hay intentos de planificación, pero la adherencia es baja.

- Existen briefs informales y un calendario editorial irregular. `[2.1.I1 · declarado]`
- Las reuniones son esporádicas y sin estructura. `[2.1.I2 · declarado]`
- Se sigue dependiendo mucho de agencias; los pocos procesos que hay se cumplen a medias. `[2.1.I3 · evaluado]`

**Funcional.** El área tiene estructura y previsibilidad; deja de depender de héroes.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y las campañas siguen saliendo aunque cambie una persona: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada una sin tener que preguntar.

- Existe un calendario editorial visible para el equipo con horizonte de al menos un trimestre. `[2.1.F1 · declarado]`
- Existe un proceso de campaña documentado (briefing → ejecución → cierre) que el equipo aplica de forma consistente. `[2.1.F2 · evaluado · hábito]`
- Hay una reunión de performance con cadencia fija (semanal o quincenal) que se sostiene. `[2.1.F3 · declarado · hábito]`
- El líder puede explicar qué campañas corren y en qué etapa sin preguntarle al equipo. `[2.1.F4 · evaluado]`
- El equipo interno gestiona el grueso del trabajo; las agencias son apoyo puntual. `[2.1.F5 · declarado]`
- Cualquier persona del equipo trabaja las campañas y los contactos en el sistema central, no en hojas ni en herramientas paralelas: lo abre como herramienta de trabajo, no por obligación. `[2.1.F6 · evaluado · hábito]`

**Eficiente.** Cada pieza pasa por control de calidad y el líder vigila con datos que el proceso se cumpla.

*Resultado:* Cada pieza sale revisada antes de publicarse, y el líder sabe dónde se desvía el proceso y corrige con datos, no de memoria.

- Existe un proceso de aprobación de contenido antes de publicar (versionado, QA). `[2.1.E2 · declarado]`
- El líder monitorea con datos del sistema, no de memoria, que el proceso de campaña se cumpla. `[2.1.E4 · evaluado · hábito]`

**Óptimo.** El sistema vigila que el proceso se cumpla y la IA se encarga de lo repetitivo; el equipo decide los ajustes.

*Resultado:* El equipo dedica su tiempo a la estrategia: la IA se encarga de lo repetitivo, y el sistema señala lo que se sale del proceso sin que nadie lo vigile.

- La IA se encarga de las tareas repetitivas del proceso de campaña, y al equipo no le queda trabajo manual repetitivo. `[2.1.O1 · comprobable]`
- El sistema detecta las desviaciones del proceso de campaña y se las señala al líder y a quien corresponde, sin intervención. `[2.1.O4 · comprobable]`
- El proceso de campaña se cumple sin que nadie lo vigile a mano. `[2.1.O5 · comprobable · hábito]`

#### 2.2 Tecnología y Automatización

¿Qué parte del esfuerzo se va en tareas que un workflow o una IA podrían hacer, y cuánto del stack instalado se está aprovechando?

*Descripción:* Mide cuánto del stack de marketing se aprovecha y cuánto trabajo repetitivo hacen los workflows y la IA.

*Costo de quedarse:* Pagas herramientas que no usas y haces a mano lo que podría salir solo, mientras lo que entra por tus canales espera respuesta.

**Deficiente.** Herramientas mínimas y desconectadas; nada automatizado.

- Los leads se manejan en hojas de cálculo. `[2.2.D1 · evaluado]`
- No hay un sistema operativo central. `[2.2.D2 · declarado]`
- No hay automatización ni IA. `[2.2.D3 · comprobable]`

**Inicial.** Hay herramientas, pero subutilizadas y en silos.

- El cliente paga licencias cuyo valor no extrae. `[2.2.I1 · comprobable]`
- El stack está fragmentado, sin integración. `[2.2.I2 · comprobable]`
- Las automatizaciones son elementales (un email de bienvenida); la IA es exploratoria. `[2.2.I3 · comprobable]`

**Funcional.** El stack contratado se usa de verdad, hay automatización simple en producción y, si se usa IA, trabaja con el contexto del área.

*Resultado:* Todo lo que entra por el sitio y por el canal conversacional, como WhatsApp, llega al sistema y recibe respuesta.

- Los módulos contratados están en uso, sin licencias ociosas relevantes. `[2.2.F2 · comprobable]`
- Los puntos de captura del sitio (forms) están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3 · comprobable]`
- Hay al menos un canal conversacional conectado (WhatsApp, chat del sitio) con una bandeja básica donde el equipo atiende lo entrante. `[2.2.F4 · comprobable]`
- Después de enviar un formulario, el sistema responde automáticamente y notifica a quien corresponde. `[2.2.F5 · comprobable]`
- Si el equipo usa IA, esta tiene como contexto la voz de marca y los buyer personas. `[2.2.F9 · comprobable · requiere 2.5.F2, 2.5.F3]`

**Eficiente.** El stack está integrado, la automatización tiene lógica y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los leads se nutren solos hasta estar listos para Ventas, la conversación con cada contacto no depende de que alguien se acuerde de escribirle, y el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nurturing multi-paso con ramificación y tiempos de espera. `[2.2.E1 · comprobable]`
- Las campañas por el canal conversacional, como WhatsApp, están automatizadas, con segmentación y con ramificación según la interacción: si la persona leyó, hizo clic o respondió. `[2.2.E2 · comprobable · requiere 2.6.F1]`
- El handoff de leads a Ventas está automatizado. `[2.2.E3 · comprobable · venta con equipo]`
- Varios canales conversacionales se consolidan en una bandeja unificada. `[2.2.E4 · comprobable]`
- Las landing pages viven en el CMS central. `[2.2.E5 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar piezas, resumir resultados o preparar una campaña—, y la IA trabaja con el contexto del área: los buyer personas, los segmentos y la voz de marca. `[2.2.E6 · evaluado · hábito · requiere 2.3.F6]`
- Hay paneles en tiempo real de las conversaciones que generan las campañas: cuánto tarda la primera respuesta y cuántas quedan sin respuesta. `[2.2.E7 · comprobable]`

**Óptimo.** La IA orquesta el recorrido completo y conversa con el cliente de forma automatizada.

*Resultado:* Cada contacto vive un recorrido pensado para él: la IA decide el siguiente paso y conversa en el momento, con información que se calcula en toda la empresa.

- La IA predictiva y generativa orquesta el recorrido completo. `[2.2.O1 · comprobable]`
- Agentes de IA atienden el canal conversacional: responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para Ventas. `[2.2.O2 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a las herramientas de marketing: la segmentación usa, por ejemplo, el valor real de cada cliente calculado afuera. `[2.2.O3 · comprobable · requiere 2.3.O1]`

#### 2.3 Datos

¿Confías en tus reportes de canal, conversión y atribución para mover presupuesto, o los validas a mano antes de usarlos?

*Descripción:* Mide si los datos de marketing permiten saber qué canal trae clientes y mover el presupuesto con confianza.

*Costo de quedarse:* No sabes qué canal trae clientes y cuál solo gasta: mueves presupuesto a ciegas, porque cada reporte hay que validarlo antes de creerle.

**Deficiente.** Datos aislados y sin integridad.

- No hay seguimiento del origen de los leads. `[2.3.D1 · comprobable]`
- Sacar un reporte confiable exige reconstruirlo a mano. `[2.3.D2 · comprobable]`

**Inicial.** Datos básicos en el CRM, con limpieza incipiente.

- Hay primeras integraciones (sitio web hacia CRM). `[2.3.I1 · comprobable]`
- Los reportes son manuales y cuestan mucho esfuerzo; la trazabilidad es incompleta. `[2.3.I2 · comprobable]`

**Funcional.** La información describe la operación con confianza, sin reconstrucción.

*Resultado:* El líder sabe de dónde viene cada lead, con reportes que salen del sistema y no de una planilla armada a mano.

- Todo contacto nuevo —entre por un formulario, una conversación, un portal o una compra— tiene poblados la etapa del ciclo de vida y su origen. `[2.3.F1 · comprobable]`
- Las propiedades que describen al cliente ideal —en empresas, industria, empresa y rol; en personas, lo que define a cada segmento— están en los formularios críticos y se capturan en la mayoría de los registros. `[2.3.F2 · comprobable · requiere 2.2.F3]`
- Los duplicados están bajo control, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3 · comprobable · riesgo]`
- Los reportes básicos (volumen, conversión, fuente) salen del sistema sin reconstrucción manual. `[2.3.F5 · comprobable]`
- El contexto que el área documentó —buyer personas, segmentos, voz de marca— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6 · declarado · riesgo · hábito · requiere 2.5.F2, 2.5.F3, 2.6.F1]`
- Cuando se pide un teléfono u otro dato de contacto, se pregunta si la persona acepta que le escriban por ese canal, y su respuesta queda registrada. `[2.3.F7 · comprobable · riesgo]`

**Eficiente.** Los datos están unificados, enriquecidos y atribuidos.

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta, no solo cuál trajo el primer clic.

- Hay enriquecimiento de datos activo con servicios de terceros. `[2.3.E1 · comprobable]`
- La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último, e incluye todos los canales, también el conversacional: se sabe cuánto ingreso deja cada uno. `[2.3.E2 · comprobable · requiere 2.2.F4]`
- La deduplicación es automática por reglas o merge del sistema. `[2.3.E3 · comprobable]`

**Óptimo.** Los datos entran de forma continua, limpios y trazados de punta a punta.

*Resultado:* La atribución toma en cuenta todo lo que pasa en la empresa, no solo lo que ve Marketing, y los datos se mantienen confiables sin que el equipo tenga que cuidarlos.

- Marketing se apoya en el almacén central de datos de la empresa, donde se junta la información de todas las herramientas, y atribuye resultados con esa vista completa. `[2.3.O1 · comprobable]`
- El enriquecimiento de datos es automático, con IA. `[2.3.O3 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: se capturan y se corrigen solos, y las personas solo validan las excepciones. `[2.3.O4 · comprobable]`

#### 2.4 Equipo y Gobierno

¿Quién decide qué se publica, qué se invierte y dónde se enfoca, con qué información y en qué cadencia?

*Descripción:* Mide quién decide qué se publica y dónde se invierte, con qué datos y con qué cadencia de revisión.

*Costo de quedarse:* Las decisiones de marketing se toman por costumbre o por quien insiste más, y nadie puede demostrar con datos si la inversión funciona.

**Deficiente.** Roles confusos y sin rendición de cuentas.

- Marketing está externalizado o concentrado en una persona con muchos sombreros. `[2.4.D1 · declarado]`
- Las decisiones se toman por improvisación. `[2.4.D2 · evaluado]`
- No hay cadencia de revisión. `[2.4.D3 · declarado]`

**Inicial.** Roles básicos, pero sin autonomía.

- Las decisiones operativas escalan al CEO o head of marketing. `[2.4.I1 · evaluado]`
- Hay reuniones mensuales sin acciones consistentes. `[2.4.I2 · evaluado]`

**Funcional.** Roles claros, decisiones con datos descriptivos y rendición de cuentas en cadencia.

*Resultado:* El equipo sabe qué se espera de cada uno, las decisiones de presupuesto se defienden con números y no con opiniones, y la dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo.

- Cada persona del equipo tiene rol definido por escrito. `[2.4.F1 · declarado]`
- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (volumen de leads, tasa de MQL, fuente, conversión) y lo consulta al menos semanalmente. `[2.4.F2 · evaluado · hábito · requiere 2.3.F5]`
- El equipo tiene metas mensuales o trimestrales, y en la reunión de performance rinde cuentas por ellas. `[2.4.F3 · evaluado · hábito · requiere 2.1.F3]`
- Las decisiones de presupuesto o priorización citan datos del sistema, no opiniones. `[2.4.F4 · evaluado]`
- Cualquier persona del equipo opera el sistema sin ayuda externa para tareas estándar. `[2.4.F5 · evaluado]`
- El líder le envía a la dirección, cada mes, un reporte de cómo le fue a Marketing. `[2.4.F6 · declarado · hábito]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con Ventas y escucha al equipo.

*Resultado:* Una persona nueva se integra rápido, y Marketing y Ventas trabajan con reglas acordadas en vez de reclamarse los leads.

- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria. `[2.4.E2 · declarado]`
- El liderazgo orquesta con Ventas (handoff de leads, SLAs, cadencia conjunta) y con Servicio. `[2.4.E3 · declarado · hábito · requiere 2.6.F4]`
- El equipo da retroalimentación sobre el sistema y pide que evolucione. `[2.4.E4 · evaluado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar los datos, y la gobernanza de datos e IA es parte de las decisiones.

*Resultado:* La dirección sabe cuánto deja cada canal frente a lo que cuesta y decide dónde invertir con esa cuenta, con un equipo capaz de sostener la IA.

- Hay responsables definidos de validar lo que produce la IA y de mantener la calidad de los datos, y esa gobernanza es parte de cómo se decide. `[2.4.O1 · declarado]`
- El liderazgo se enfoca en estrategia y en mejorar el sistema. `[2.4.O2 · evaluado · hábito]`
- Las decisiones usan analítica avanzada, como lo que deja cada canal —el valor de vida de los clientes que trae— frente a lo que cuesta. `[2.4.O4 · evaluado · hábito]`

### Producción

#### 2.5 Marca y Presencia

¿El mercado entiende quién eres, qué ofreces y por qué importas?

*Descripción:* Mide si el mercado entiende quién es la empresa y qué ofrece, con una marca y presencia digital consistentes.

*Costo de quedarse:* El mercado no entiende quién eres ni por qué elegirte, y cada pieza se ve distinta a la anterior.

**Deficiente.** Voz de marca indefinida y mensajes inconsistentes.

- No hay guía de estilo ni narrativa central. `[2.5.D1 · declarado]`
- Los buyer personas no están identificados. `[2.5.D2 · declarado]`
- El SEO es inexistente o azaroso. `[2.5.D3 · comprobable]`

**Inicial.** Branding básico instalado, sin estrategia.

- Hay logo, colores y plantillas, pero el buyer persona es muy general. `[2.5.I1 · declarado]`
- El sitio tiene meta tags simples y contenido funcional. `[2.5.I2 · comprobable]`
- Los esfuerzos son experimentos sueltos. `[2.5.I3 · evaluado]`

**Funcional.** Marca, personas y presencia digital documentadas y consistentes.

*Resultado:* La marca se ve y suena igual en todo lo que sale, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Existe un kit de marca (logo, colores, tipografía) que cualquiera del equipo puede consultar. `[2.5.F1 · declarado]`
- Existe una guía corta de voz de marca escrita y aplicada a piezas recientes. `[2.5.F2 · declarado]`
- Hay 2-3 buyer personas escritos con journey básico por etapa. `[2.5.F3 · declarado]`
- El sitio tiene meta tags configurados y SEO técnico básico verificable. `[2.5.F4 · comprobable]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: en el blog o en el formato que use el negocio, como video, fichas o guías. `[2.5.F5 · comprobable · hábito]`

**Eficiente.** La presencia se refina por segmento y se optimiza para buscadores y motores generativos.

*Resultado:* La empresa aparece cuando sus clientes buscan lo que ofrece, tanto en buscadores como en asistentes de IA, con contenido pensado para cada segmento que importa, y lo que dicen de ella sus clientes juega a su favor.

- Los buyer personas están detallados a nivel de segmento de alto valor. `[2.5.E1 · declarado]`
- El contenido está organizado por temas: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2 · comprobable]`
- El AEO está implementado con resultados medibles. `[2.5.E3 · comprobable]`
- El journey está mapeado con puntos de contacto definidos. `[2.5.E4 · declarado]`
- Las reseñas y calificaciones públicas se piden a los clientes satisfechos y se responden con una cadencia fija. `[2.5.E5 · comprobable · hábito]`

**Óptimo.** La IA produce y optimiza el contenido en ciclo continuo, incluido para búsqueda conversacional.

*Resultado:* La presencia se mantiene vigente sola: el contenido se produce y se ajusta de forma continua para cada tipo de cliente y cada forma de buscar.

- Los buyer personas están hiper-segmentados, próximos a cuentas individuales. `[2.5.O1 · declarado]`
- La IA produce y optimiza el contenido de forma continua —también para la búsqueda conversacional y los asistentes de IA—, y el equipo valida lo que se publica. `[2.5.O2 · comprobable]`

#### 2.6 Segmentación

¿Cada prospecto recibe lo que le corresponde, o todos reciben lo mismo?

*Descripción:* Mide si cada prospecto recibe un mensaje pensado para su segmento, o si todos reciben lo mismo.

*Costo de quedarse:* Le hablas igual a todos, así que no le hablas bien a nadie: el mensaje genérico no convence a ningún segmento.

**Deficiente.** Sin segmentación; todos reciben el mismo mensaje. La personalización no existe o se limita al nombre en el saludo.

- No hay segmentos: las campañas salen a toda la base con el mismo mensaje. `[2.6.D1 · comprobable]`
- Los correos no usan más datos del contacto que su nombre. `[2.6.D2 · comprobable]`

**Inicial.** Segmentación rudimentaria y personalización mínima.

- Se segmenta apenas por geografía o demografía. `[2.6.I1 · comprobable]`
- Las campañas se diseñan para la masa. `[2.6.I2 · comprobable]`

**Funcional.** Hay segmentos definidos y contenido adaptado a mano, con criterios de calificación escritos.

*Resultado:* Cada segmento recibe un mensaje pensado para él, y Ventas recibe leads que Marketing ya clasificó con criterios claros.

- Existen al menos 2 segmentos definidos con criterios escritos. `[2.6.F1 · declarado]`
- Las campañas recientes muestran piezas distintas por segmento. `[2.6.F3 · comprobable · hábito]`
- Existen criterios documentados de qué es un suscriptor, un lead y un MQL, y marketing clasifica según ellos, a mano o con una automatización simple sobre las propiedades de calificación. `[2.6.F4 · comprobable · venta con equipo]`

**Eficiente.** La segmentación y el scoring se automatizan.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y Ventas recibe primero los leads con más probabilidad de comprar.

- Hay secuencias diferenciadas por segmento o etapa del journey. `[2.6.E1 · comprobable · requiere 2.2.E1]`
- El contenido se adapta por segmento de forma automática. `[2.6.E2 · comprobable]`
- Hay lead scoring por reglas: un modelo que suma puntos por varios atributos y califica al pasar un umbral, cuyo score dispara las secuencias de nurturing. Se distingue de la calificación de Funcional, que responde a un valor de propiedad sin modelo de puntaje detrás. `[2.6.E3 · comprobable · requiere 2.2.E1]`
- La segmentación usa datos de comportamiento —qué abrió, qué visitó, qué compró—, no solo lo que la persona declaró. `[2.6.E4 · comprobable]`

**Óptimo.** La IA identifica micro-segmentos y el contenido cambia según el comportamiento de cada persona.

*Resultado:* Cada persona ve el contenido que le corresponde según lo que hizo antes, sin que nadie tenga que armar un segmento para ella.

- La IA identifica micro-segmentos y comportamientos. `[2.6.O1 · comprobable]`
- Hay personalización uno a uno: lo que ve cada persona —en los mensajes y en el sitio web— cambia en tiempo real según lo que hizo antes. `[2.6.O3 · comprobable]`

#### 2.7 Canales y Alcance

¿Llegas a quien necesitas, de la forma adecuada y con el costo correcto?

*Descripción:* Mide si los canales llegan a quien corresponde, con cadencia, bajo un mismo plan y con un costo conocido.

*Costo de quedarse:* Llegas a poca gente, de forma irregular y sin saber cuánto te cuesta: los canales salen cuando alguien se acuerda, no como una campaña.

**Deficiente.** Alcance muy limitado y reactivo.

- Hay pocos canales activos. `[2.7.D1 · comprobable]`
- No hay estrategia de distribución. `[2.7.D2 · declarado]`

**Inicial.** Canales sueltos con cadencia irregular.

- Hay redes en uno o dos canales sin ritmo fijo. `[2.7.I1 · comprobable]`
- La pauta pagada es inicial, sin un marco de optimización; el email es esporádico. `[2.7.I2 · comprobable]`
- Cada canal va por su cuenta: no hay calendario común ni campaña que los atraviese. `[2.7.I3 · declarado]`

**Funcional.** Los canales principales operan con cadencia y bajo un mismo plan.

*Resultado:* Una campaña sale coordinada por los cuatro canales en vez de cuatro esfuerzos sueltos, y el líder sabe cuánto le cuesta cada lead según de dónde venga.

- El email marketing tiene cadencia regular (al menos mensual) y se cumple. `[2.7.F1 · comprobable · hábito]`
- Hay al menos un canal social orgánico gestionado y calendarizado con publicaciones recurrentes. `[2.7.F2 · comprobable]`
- Hay al menos una campaña de pauta pagada corriendo con presupuesto definido (Google, Meta o el canal que corresponda al negocio). `[2.7.F3 · comprobable]`
- El canal conversacional, como WhatsApp, se usa para salir con cadencia definida, no solo para responder lo que entra. `[2.7.F4 · comprobable · hábito · requiere 2.2.F4]`
- Los cuatro canales siguen el mismo calendario y la misma campaña: una promoción sale coordinada en email, pauta, orgánico y el canal conversacional, no como cuatro esfuerzos sueltos. `[2.7.F5 · declarado · hábito · requiere 2.1.F1]`
- El líder puede decir cuánto costó cada lead —o cada venta, donde se compra sin vendedor— el último mes, al menos por canal. `[2.7.F6 · comprobable · requiere 2.3.F1]`

**Eficiente.** Los canales se integran con datos y el presupuesto se mueve con evidencia.

*Resultado:* La inversión se mueve hacia el canal que mejor rinde, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Los canales, incluido el conversacional, comparten datos y se alimentan entre sí: uno continúa lo que empezó otro, hay remarketing activo y las audiencias se construyen desde el CRM. `[2.7.E1 · comprobable]`
- Hay webinars o eventos como canal recurrente. `[2.7.E2 · declarado · hábito]`
- Los presupuestos se optimizan con frecuencia según data. `[2.7.E3 · comprobable · hábito]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar, y cada referido queda registrado con quién lo trajo. `[2.7.E4 · comprobable]`

**Óptimo.** La IA reasigna presupuesto entre canales y se prueban canales emergentes en ciclos cortos.

*Resultado:* La inversión se reparte sola donde más retorna, los clientes satisfechos traen clientes nuevos, y la empresa llega antes que su competencia a los canales nuevos.

- Los canales emergentes —influencers, comunidades, formatos nuevos— se prueban en ciclos cortos. `[2.7.O1 · declarado · hábito]`
- La IA reasigna presupuestos automáticamente para maximizar ROI. `[2.7.O2 · comprobable · requiere 2.3.E2]`
- Los clientes que Servicio identifica como promotores se vuelven un canal de referidos y casos de éxito, sin pedirlos a mano. `[2.7.O4 · comprobable]`

#### 2.8 Medición y Aprendizaje

¿Cada campaña enseña algo, o se repite el ciclo desde cero?

*Descripción:* Mide si cada campaña deja sus resultados a la vista y un aprendizaje, para no repetir lo que no funcionó.

*Costo de quedarse:* Repites lo que no funciona porque nadie mide qué funcionó: el presupuesto se reparte por costumbre, no por retorno.

**Deficiente.** Las campañas corren hasta agotar presupuesto, sin aprendizaje ni medición de ROI.

- Las campañas se dejan correr hasta que se acaba el presupuesto, sin revisarlas en el camino. `[2.8.D1 · evaluado]`
- No se mide el retorno de las campañas. `[2.8.D2 · comprobable]`
- Lo que dejó una campaña no se usa para planear la siguiente. `[2.8.D3 · evaluado]`

**Inicial.** Se analiza solo al cerrar la campaña, tarde.

- Las métricas son básicas (clics, likes) sin conexión clara con el CAC. `[2.8.I1 · comprobable]`
- La optimización es lenta y reactiva. `[2.8.I2 · evaluado]`

**Funcional.** Los resultados de cada campaña están a la vista, y cada una deja una revisión de cierre.

*Resultado:* El equipo ve cómo le fue a cada campaña sin armar el número a mano, y cada una deja una lección escrita para la siguiente.

- Cada campaña significativa tiene una revisión de cierre documentada (qué funcionó, qué no). `[2.8.F3 · declarado]`
- Los resultados de cada campaña —los leads o las ventas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5 · comprobable · requiere 2.3.F1]`

**Eficiente.** Hay testing regular y ajustes basados en data.

*Resultado:* El equipo sabe qué creatividades y audiencias funcionan porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma la siguiente campaña.

- Hay tests A/B regulares (al menos uno activo por mes). `[2.8.E1 · comprobable · hábito]`
- Hay un proceso formal para validar qué creatividades y audiencias funcionan con métricas históricas. `[2.8.E2 · declarado]`
- El proceso de campaña y la planificación de las campañas siguientes se refinan con base en lo aprendido. `[2.8.E3 · declarado · hábito · requiere 2.1.F2]`

**Óptimo.** Modelos de predicción ajustan las campañas sobre la marcha, sin esperar al cierre.

*Resultado:* Las campañas mejoran mientras están corriendo, no recién cuando terminan.

- La IA aplica aprendizajes en tiempo real. `[2.8.O2 · comprobable]`

---

## Área 3 — Servicio

Mide el rendimiento del área de Servicio, que cubre todo lo que pasa después de la venta: desde la atención de casos hasta que el cliente logre el resultado por el que compró. Mira cómo opera internamente y qué produce hacia el cliente.

### Base operativa

#### 3.1 Procesos y Rutinas

Si mañana rotan dos agentes con mucho conocimiento de cuentas, ¿la calidad de atención se mantiene?

*Descripción:* Mide si la atención sigue un proceso y rutinas definidas, para que la calidad no dependa de quién sabe.

*Costo de quedarse:* El servicio depende de quién sabe: si esa persona falta, la calidad se cae y los clientes lo notan de inmediato.

**Deficiente.** Procesos inexistentes o informales.

- Cada agente maneja las solicitudes a su manera. `[3.1.D1 · evaluado]`
- No hay rutinas regulares ni handoffs; la operación es 100% reactiva. `[3.1.D2 · declarado]`

**Inicial.** Procesos básicos, no formalizados.

- Hay algún SLA conocido pero no medido. `[3.1.I1 · declarado]`
- Los roles están definidos a grandes rasgos; todavía se depende de héroes. `[3.1.I2 · evaluado]`
- Unos agentes atienden en el sistema; otros siguen con sus canales personales. `[3.1.I3 · evaluado]`

**Funcional.** El equipo atiende en un mismo sistema, con un pipeline de servicio configurado y gestión básica de cartera.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada cliente tiene a alguien que responde por él, y un caso se atiende igual sin importar qué agente lo tome.

- El pipeline de servicio está configurado con sus etapas y cubre el flujo de atención, de la recepción al cierre. `[3.1.F1 · comprobable]`
- Cada cliente tiene quién responda por él —una persona o, si la cartera es masiva, un equipo con un seguimiento automático— y un seguimiento mínimo más allá de los tickets que abre. `[3.1.F2 · comprobable]`
- Hay reuniones de equipo de Servicio con cadencia fija (al menos quincenal) que se sostienen. `[3.1.F3 · declarado · hábito]`
- Existe un proceso básico documentado para quejas críticas o escalaciones. `[3.1.F4 · declarado]`
- Cualquier agente explica cómo se atiende un caso típico siguiendo el mismo flujo. `[3.1.F5 · evaluado]`
- Cualquier agente atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por otro canal. `[3.1.F6 · evaluado · hábito]`

**Eficiente.** Aparecen los SLA, los playbooks y el recorrido del cliente, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El cliente sabe cuánto va a tardar la respuesta, cada momento clave de su relación con la empresa tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLAs definidos por tipo de caso o prioridad. `[3.1.E1 · comprobable]`
- Hay playbooks de prevención, retención y expansión. `[3.1.E3 · declarado · cliente recurrente]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —el inicio, la entrega o el primer valor y, si la hay, la renovación o la recompra— y un responsable y un estándar para cada uno. `[3.1.E4 · declarado · requiere 3.5.F2]`
- El líder monitorea con datos del sistema, no de memoria, que el proceso de atención se cumpla. `[3.1.E5 · evaluado · hábito]`

**Óptimo.** Las rutinas corren automáticas y el sistema vigila que el proceso se cumpla; el equipo supervisa, entrena la IA y gestiona excepciones.

*Resultado:* El equipo deja de ejecutar rutinas y pasa a supervisarlas: la IA hace lo repetitivo, el sistema señala lo que se sale del proceso, y las personas se ocupan de las excepciones y de mejorar el sistema.

- Muchas rutinas son automáticas; el equipo supervisa, entrena la IA y gestiona excepciones. `[3.1.O1 · evaluado · hábito]`
- El sistema detecta las desviaciones del proceso de atención y se las señala al líder y al agente, sin intervención. `[3.1.O3 · comprobable]`
- El proceso de atención se cumple sin que nadie lo vigile a mano. `[3.1.O4 · comprobable · hábito]`

#### 3.2 Tecnología y Automatización

¿Qué parte de los tickets necesita intervención humana cuando podría resolverse con autoservicio o automatización, y cuánto del stack se está aprovechando?

*Descripción:* Mide cuántos casos se resuelven solos o por autoservicio, y cuánto del sistema de atención se aprovecha.

*Costo de quedarse:* Tu equipo resuelve a mano lo que podría resolverse solo, y los casos se pierden entre correos y chats: el cliente tiene que insistir para que lo atiendan.

**Deficiente.** Herramientas básicas y aisladas (correo, teléfono).

- No hay plataforma central de tickets. `[3.2.D1 · declarado]`
- Los casos se manejan en celulares personales o emails individuales. `[3.2.D2 · evaluado]`

**Inicial.** Plataforma de tickets activa, con automatización mínima y el stack fragmentado.

- Hay automatizaciones simples de recepción, sin IA; el stack está fragmentado. `[3.2.I2 · comprobable]`

**Funcional.** Hay al menos un canal conversacional conectado, automatización simple en producción y, si se usa IA, trabaja con el contexto de los clientes.

*Resultado:* Lo que entra por los canales conectados llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Hay al menos un canal conversacional conectado con bandeja básica donde el equipo atiende lo entrante. `[3.2.F4 · comprobable]`
- Al entrar un ticket, el sistema lo asigna automáticamente según una regla simple; las notificaciones de cambio de estado llegan a quien las necesita. `[3.2.F5 · comprobable]`
- Si hay chatbot, resuelve consultas frecuentes con árbol de decisión. `[3.2.F6 · comprobable]`
- Si el equipo usa IA, esta tiene como contexto la información básica de los clientes. `[3.2.F8 · comprobable]`

**Eficiente.** La automatización tiene lógica, aparece el autoservicio y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos críticos llegan solos a quien los tiene que resolver; el cliente puede ver y abrir sus casos y resolver lo simple sin esperar a un agente, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién—, y las conversaciones y los tickets se enrutan por múltiples condiciones, como idioma, tema o habilidad del agente. `[3.2.E1 · comprobable · requiere 3.1.E1]`
- Hay portal de autoservicio donde el cliente ve y crea tickets, y base de conocimiento interna y pública. `[3.2.E2 · comprobable]`
- Los canales se consolidan en una bandeja unificada. `[3.2.E3 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir casos o buscar en la base de conocimiento—, y la IA trabaja con el contexto del área: los tipos de cliente, los niveles de atención y las respuestas a las consultas frecuentes. `[3.2.E4 · evaluado · hábito · requiere 3.3.F6]`
- Hay paneles en tiempo real de la atención: los casos abiertos, quién los tiene y cuántas conversaciones quedan sin atender. `[3.2.E5 · comprobable]`

**Óptimo.** Un agente de IA resuelve consultas en producción, y lo que se calcula en toda la empresa llega a la ficha del cliente.

*Resultado:* Una parte importante de las consultas se resuelve sin intervención humana, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la empresa sabe de ese cliente a la vista.

- Hay un agente de servicio con IA en producción que resuelve consultas en todos los canales sin intervención humana y pasa a una persona, con el contexto completo, cuando hace falta; hay automatización de flujos de trabajo. `[3.2.O1 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: el agente ve en la ficha, por ejemplo, el riesgo de fuga del cliente. `[3.2.O4 · comprobable · requiere 3.3.O2]`

#### 3.3 Datos

¿El agente que toma el ticket tiene contexto completo del cliente al instante, o lo arma a mano?

*Descripción:* Mide si quien atiende ve la historia completa del cliente al instante, sin pedirle que vuelva a explicar.

*Costo de quedarse:* Cada vez que el cliente escribe, tiene que volver a explicar quién es y qué pasó, porque nadie ve su historia completa.

**Deficiente.** Datos dispersos sin estructura.

- No hay medición fiable de tiempos ni satisfacción. `[3.3.D1 · comprobable]`
- Es imposible reconstruir el viaje del cliente. `[3.3.D2 · comprobable]`

**Inicial.** Datos básicos centralizados pero incompletos; el análisis sigue siendo manual.

- Los datos básicos del cliente y de sus tickets están en un solo sistema, pero incompletos. `[3.3.I1 · comprobable]`
- Los reportes de servicio se arman a mano, fuera del sistema. `[3.3.I2 · comprobable]`

**Funcional.** El histórico y el contexto del cliente están accesibles, con tickets categorizados.

*Resultado:* El líder sabe qué tipo de problemas llegan y cuántos, y cualquier agente tiene la historia del cliente en segundos.

- Cualquier agente ve el histórico de tickets de un cliente en menos de 10 segundos. `[3.3.F1 · comprobable]`
- La ficha del cliente muestra lo que compró o tiene contratado, lo que ha pagado y su valor económico, no solo sus tickets. `[3.3.F2 · comprobable]`
- Las propiedades clave del cliente —qué compró o qué plan tiene y desde cuándo es cliente— están pobladas en la mayoría de los registros. `[3.3.F3 · comprobable]`
- Cada ticket tiene tipo y motivo, con una taxonomía definida. `[3.3.F4 · comprobable]`
- El líder saca reportes de volumen por tipo de ticket sin reconstrucción. `[3.3.F5 · comprobable]`
- El contexto que el área documentó —tipos de cliente, niveles de atención, respuestas a consultas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6 · declarado · riesgo · hábito · requiere 3.5.F4, 3.6.F2, 3.8.F1]`

**Eficiente.** Se miden tiempos y satisfacción, y la data se unifica con Ventas.

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende, cuánto tarda un cliente nuevo en ver valor y qué tan sano está cada cliente, con la satisfacción medida y no supuesta.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los SLA, en todos los canales. `[3.3.E1 · comprobable · requiere 3.1.E1]`
- Se mide el NPS o el CSAT con cadencia. `[3.3.E2 · comprobable · hábito]`
- La data del cliente está unificada entre Servicio y Ventas. `[3.3.E3 · comprobable]`
- Se mide cuánto tarda cada cliente nuevo en obtener valor: el tiempo desde que empieza hasta su primer resultado. `[3.3.E4 · comprobable · requiere 3.5.F2]`
- Hay un indicador de salud por reglas para cada cliente, que combina su uso, sus casos abiertos y su satisfacción. `[3.3.E5 · comprobable · cliente recurrente]`

**Óptimo.** Un modelo de salud de cuenta anticipa el riesgo antes de que el cliente lo manifieste.

*Resultado:* La empresa sabe qué clientes están en riesgo y cuáles están logrando lo que buscaban, antes de que ellos mismos lo digan, con datos que se mantienen al día solos.

- Hay un Health Score (modelo de salud de cuenta) activo, predictivo y en uso, que mide tanto la experiencia del cliente como si está logrando el resultado que persigue. `[3.3.O1 · comprobable · cliente recurrente]`
- Servicio se apoya en el almacén central de datos de la empresa, con reglas claras de quién accede y cómo se mantiene, para anticipar el riesgo de cada cliente. `[3.3.O2 · comprobable]`
- Hay modelos predictivos y prescriptivos alimentando cuadros de mando. `[3.3.O3 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: se capturan y se corrigen solos, y las personas solo validan las excepciones. `[3.3.O4 · comprobable]`

#### 3.4 Equipo y Gobierno

¿Quién decide qué se atiende primero, con qué información, y cómo se mejora la operación?

*Descripción:* Mide quién decide qué se atiende primero, con qué información, y cómo se revisa y mejora el servicio.

*Costo de quedarse:* Se atiende primero al que más insiste, no al que más importa, y los problemas del servicio se repiten porque nadie los revisa.

**Deficiente.** Equipos en silos sin coordinación.

- No hay coordinación entre onboarding, soporte y CS. `[3.4.D1 · evaluado]`
- El liderazgo apaga incendios; no hay métricas ni rendición de cuentas. `[3.4.D2 · evaluado]`

**Inicial.** Roles a grandes rasgos y handoffs informales.

- Hay algunas métricas operacionales en seguimiento. `[3.4.I1 · comprobable]`
- El liderazgo revisa números básicos. `[3.4.I2 · declarado]`

**Funcional.** Roles claros, dashboard descriptivo y rendición de cuentas en cadencia.

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día o se está atrasando.

- Cada persona del equipo tiene rol definido por escrito. `[3.4.F1 · declarado]`
- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (tickets abiertos, volumen, backlog, tickets por tipo) y lo consulta al menos semanalmente. `[3.4.F2 · evaluado · hábito · requiere 3.3.F5]`
- En las reuniones del equipo se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[3.4.F3 · evaluado · hábito · requiere 3.1.F3]`

**Eficiente.** El equipo rinde cuentas contra los SLA, y el liderazgo prepara a quien entra y orquesta con otras áreas.

*Resultado:* El equipo responde por sus tiempos de atención, un agente nuevo rinde rápido, y Servicio le avisa a Ventas cuando un cliente se puede ir.

- Hay rendición de cuentas explícita contra SLA. `[3.4.E1 · evaluado · hábito · requiere 3.3.E1]`
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria. `[3.4.E2 · declarado]`
- El liderazgo orquesta con Ventas —cada cliente nuevo llega con el resultado que persigue, y las alertas de churn vuelven a Ventas— y con Marketing. `[3.4.E4 · declarado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y el servicio se mide por los ingresos que retiene y hace crecer.

*Resultado:* Servicio se mide por los ingresos que retiene y hace crecer, no solo por los casos que cierra.

- Hay responsables definidos de validar lo que responde la IA y de mantener la base de conocimiento al día. `[3.4.O1 · declarado]`
- El liderazgo se enfoca en estrategia. `[3.4.O2 · evaluado · hábito]`
- El equipo de servicio se mide por la retención y el crecimiento de sus clientes, no solo por los casos que cierra. `[3.4.O3 · declarado · hábito · cliente recurrente]`
- Las decisiones usan analítica avanzada, como cuánto cuesta atender a cada tipo de cliente frente a lo que deja. `[3.4.O4 · evaluado · hábito]`

### Producción

#### 3.5 Consistencia de Atención

¿Cada cliente recibe el mismo nivel de servicio, o depende del agente que le toque?

*Descripción:* Mide si cada cliente recibe el mismo nivel de servicio y las mismas respuestas, lo atienda quien lo atienda.

*Costo de quedarse:* La calidad depende de quién atienda: el mismo cliente recibe respuestas distintas a la misma pregunta.

**Deficiente.** Sin estandarización; cada agente responde a su criterio.

- La calidad varía drásticamente entre interacciones. `[3.5.D1 · evaluado]`

**Inicial.** Algunas plantillas para casos muy frecuentes.

- No hay guía de tono; los agentes usan las plantillas a discreción. `[3.5.I1 · declarado]`

**Funcional.** Hay tipos de cliente definidos, macros básicos y onboarding del cliente estructurado.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, un cliente nuevo arranca con un proceso claro y un resultado definido, y las respuestas a lo frecuente salen iguales sin importar quién atienda.

- Hay al menos algunos macros o snippets básicos disponibles para los agentes. `[3.5.F1 · comprobable]`
- Existe un proceso documentado de onboarding del cliente nuevo, con un resultado definido que el cliente debe alcanzar al terminarlo. `[3.5.F2 · declarado]`
- Cualquier agente nuevo recibe el conjunto de macros en su capacitación inicial. `[3.5.F3 · declarado]`
- Existe un documento simple con los tipos de cliente que atiende el área —qué necesita cada uno y qué espera del servicio—, consultable por cualquier agente. `[3.5.F4 · declarado]`

**Eficiente.** Las respuestas frecuentes están documentadas y aplican tono de marca.

*Resultado:* El cliente reconoce la misma voz en cada respuesta, sea cual sea el agente.

- Hay plantillas de respuesta a casos frecuentes cargadas como macros, en uso. `[3.5.E1 · comprobable]`
- El tono y la voz de marca se aplican a las respuestas, no cada agente con su estilo. `[3.5.E2 · evaluado · hábito]`
- Existe una guía de estilo de servicio documentada. `[3.5.E3 · declarado]`

**Óptimo.** La IA aplica el tono de marca en las interacciones automatizadas.

*Resultado:* La experiencia se siente igual de cuidada con una persona o con la IA.

- La IA aplica tono de marca consistente en interacciones automatizadas. `[3.5.O1 · comprobable]`

#### 3.6 Priorización de Clientes

¿Cada cliente recibe lo que le corresponde según su valor y su contexto?

*Descripción:* Mide si la atención se prioriza según el valor y el contexto de cada cliente, y no por quién insiste.

*Costo de quedarse:* Tu mejor cliente espera en la misma fila que todos, y nadie nota cuando uno importante está en riesgo.

**Deficiente.** Sin priorización.

- Los tickets se atienden por orden de llegada o preferencia del agente, sin contexto del cliente. `[3.6.D1 · comprobable]`

**Inicial.** Intentos de priorización por urgencia percibida.

- No hay criterios formales; la información del cliente existe pero no está expuesta en el momento. `[3.6.I1 · declarado]`

**Funcional.** Hay priorización por severidad y atención diferenciada básica con contexto.

*Resultado:* Lo urgente se atiende primero y los clientes más importantes reciben una atención acorde, sin que el agente tenga que reconstruir su historia.

- Cada ticket tiene una prioridad asignada (urgent / high / normal / low) y los agentes la respetan. `[3.6.F1 · comprobable · hábito]`
- La atención se diferencia según los tipos de cliente: cada tipo tiene claro qué nivel de atención recibe. `[3.6.F2 · declarado · requiere 3.5.F4]`
- El agente usa la ficha del cliente —lo que compró, lo que ha pagado y el soporte abierto— para dar contexto, sin reconstruirlo a mano. `[3.6.F3 · evaluado · hábito · requiere 3.3.F2]`

**Eficiente.** Hay un responsable dedicado por cliente clave y segmentación para acciones diferenciadas.

*Resultado:* Cada cliente clave tiene un dueño que lo conoce, el resto de la cartera no queda sola, y la atención cambia según el momento en que está cada cliente.

- Hay un modelo de atención por segmento: cada cliente clave tiene un responsable dedicado —un CSM— que lo conoce, y el resto de la cartera recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1 · comprobable · cliente recurrente · requiere 3.1.F2]`
- Los clientes se segmentan para acciones diferenciadas según el momento de su relación: donde el cliente vuelve, sanos, en riesgo o con potencial de crecer; donde compra una vez, por entregar, en garantía o listos para recomendar. `[3.6.E2 · comprobable]`

**Óptimo.** El cliente recibe el mismo contexto lo atienda un humano o la IA, incluso en autoservicio.

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló con Ventas.

- La personalización se aplica incluso en autoservicio. `[3.6.O1 · comprobable · requiere 3.2.E2]`
- Hay personalización uno a uno en tiempo real. `[3.6.O2 · comprobable]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le prometió en la venta y el segmento del que viene—, sin volver a preguntarlo. `[3.6.O3 · comprobable · requiere 3.3.E3]`

#### 3.7 Proactividad

¿El área de servicio previene o reacciona?

*Descripción:* Mide si el servicio se adelanta a los riesgos y necesidades del cliente, o solo reacciona cuando algo falla.

*Costo de quedarse:* Te enteras de que un cliente está mal cuando ya decidió irse, y las renovaciones te toman por sorpresa.

**Deficiente.** Sin mecanismos predictivos; enfoque 100% reactivo.

- Los problemas se gestionan cuando estallan. `[3.7.D1 · evaluado]`
- Hay un solo canal, esperando que el cliente contacte. `[3.7.D2 · comprobable]`

**Inicial.** Reactivo aunque ordenado.

- No hay identificación previa de problemas ni de oportunidades. `[3.7.I1 · evaluado]`

**Funcional.** Los riesgos evidentes se detectan a mano antes de que estallen.

*Resultado:* Los problemas evidentes, las malas calificaciones y las fechas críticas ya no toman al equipo por sorpresa: se actúa antes de que el cliente se vaya, y cuando alguno se va, se sabe por qué.

- Un cliente con tickets repetidos del mismo problema, una queja sin resolver o una mala calificación se identifica, y alguien lo contacta antes de que escale. `[3.7.F1 · comprobable · hábito]`
- Los clientes clave reciben contacto antes de una renovación o un vencimiento importante, no después. `[3.7.F2 · comprobable · hábito]`
- Cada cliente que se va deja registrada la razón de su salida. `[3.7.F3 · comprobable · relación continua]`

**Eficiente.** Los riesgos y las solicitudes pendientes se ven venir, las atienda el área que sea, y el cliente recibe lo que necesita saber antes de pedirlo.

*Resultado:* Las solicitudes del cliente no se pierden entre áreas, sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que escalen; la empresa retiene clientes que antes se perdían sin aviso, encuentra oportunidades en su propia cartera y, donde la relación es continua, sus clientes clave ven qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de riesgo de churn o de oportunidad de upsell. `[3.7.E1 · comprobable · cliente recurrente · requiere 3.3.E5]`
- Los clientes en riesgo reciben una acción de retención antes de decidir irse, y los que tienen potencial reciben una propuesta de expansión. `[3.7.E2 · comprobable · hábito · relación continua]`
- Los clientes clave tienen registrado el resultado que persiguen y lo revisan con la empresa en una cadencia fija: qué se logró y qué sigue. `[3.7.E3 · declarado · hábito · relación continua]`
- Ninguna solicitud o molestia del cliente se pierde entre áreas: quedan en el sistema aunque las resuelva otra área —administración, cobros, entregas—, y hay alertas automáticas cuando una se atrasa, cuando un cliente califica mal o cuando se acerca una fecha crítica —una entrega, una garantía, un vencimiento—, que le llegan a quien tiene que actuar. `[3.7.E4 · comprobable]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —una entrega, un trámite, un vencimiento—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5 · comprobable]`

**Óptimo.** Los problemas se resuelven antes de que el cliente los note, con acciones que la IA ajusta, y el cliente recibe detalles que lo deleitan.

*Resultado:* La mayoría de los problemas se resuelven antes de que el cliente los note, y cada cliente siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- Las revisiones de resultado llegan a todos los clientes: a los clave en persona y al resto de forma automatizada, con los datos que prepara el sistema. `[3.7.O1 · declarado · hábito · relación continua]`
- Muchos problemas se resuelven antes de que el cliente los note. `[3.7.O2 · comprobable · hábito]`
- Las acciones proactivas —qué recibe cada cliente, cuándo y por qué canal— se autoajustan con IA según su historia y sus señales. `[3.7.O3 · comprobable]`
- Los clientes reciben, sin pedirlos, detalles pensados para deleitarlos —regalías, promociones, beneficios o amenidades—, elegidos según su historia y el momento de su relación. `[3.7.O4 · comprobable]`

#### 3.8 Escalabilidad del Servicio

¿La operación escala linealmente o exponencialmente?

*Descripción:* Mide si atender más clientes cuesta menos cada vez, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Cada cliente nuevo cuesta lo mismo de atender que el anterior: para crecer, tienes que contratar al mismo ritmo.

**Deficiente.** El servicio depende 100% de agentes humanos.

- No hay autoservicio ni base de conocimiento pública. `[3.8.D1 · comprobable]`
- El costo crece linealmente con cada cliente nuevo. `[3.8.D2 · declarado]`

**Inicial.** Hay FAQs sueltas o un portal simple, pero lo que más se consulta todavía no tiene respuesta publicada.

- Hay chatbots de menú fijo rígidos. `[3.8.I1 · comprobable]`
- El conocimiento existe pero está disperso; escalar exige mucho esfuerzo manual. `[3.8.I2 · evaluado]`

**Funcional.** Las consultas más frecuentes tienen respuesta publicada.

*Resultado:* Las preguntas de siempre dejan de consumir al equipo: el cliente encuentra la respuesta publicada y el agente no la vuelve a escribir.

- Las consultas que más se repiten tienen una respuesta que el cliente puede consultar por su cuenta. `[3.8.F1 · comprobable]`
- Cuando entra una consulta que ya tiene respuesta publicada, el equipo remite a ella en vez de volver a redactarla. `[3.8.F2 · comprobable · hábito]`

**Eficiente.** Se documenta el aprendizaje y el autoservicio empieza a liberar al equipo.

*Resultado:* La empresa puede sumar clientes sin sumar agentes en la misma proporción, porque buena parte se resuelve sola.

- Se documentan las soluciones a casos nuevos (se alimenta la base de conocimiento). `[3.8.E1 · comprobable · hábito]`
- Se revisan periódicamente los tickets recurrentes y, donde la relación es continua, las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2 · declarado · hábito · requiere 3.7.F3]`
- El autoservicio es efectivo: el cliente resuelve sin abrir ticket, y se escala sin contratar linealmente. `[3.8.E3 · comprobable · hábito]`

**Óptimo.** La IA detecta consultas nuevas y genera el contenido; atender un cliente más casi no cuesta.

*Resultado:* Atender un cliente más casi no cuesta: el conocimiento se genera solo a medida que aparecen consultas nuevas.

- La IA detecta nuevas consultas y genera artículos o respuestas automáticamente. `[3.8.O1 · comprobable]`
- La capacidad se ajusta a la demanda en tiempo real; el costo marginal de un cliente nuevo es cercano a cero. `[3.8.O2 · comprobable]`
- Los aprendizajes retroalimentan automáticamente la consistencia de atención, la priorización de clientes y la proactividad. `[3.8.O3 · comprobable]`

---

# Parte 4 — Referencia

Esta es la referencia que consultan tanto una persona como un sistema que lea los resultados. El identificador estable de cada dimensión es su número, no su nombre: los nombres se pueden afinar, los IDs no cambian.

## Áreas

| ID | Área |
|:--|:--|
| 1 | Ventas |
| 2 | Marketing |
| 3 | Servicio |

El número del área es el prefijo del ID de cada dimensión: 1.3 es Datos de Ventas, 2.3 es Datos de Marketing. Donde aparece una **x**, se sustituye por el número del área.

## Niveles

| Código | Nivel |
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

Todas las dimensiones, de base operativa y de producción, tienen los cinco niveles. No hay excepciones.

## Riesgos

Cuando un criterio de riesgo no se cumple, se le muestra al cliente con estos mensajes. Se escriben por su consecuencia de negocio: dicen qué le pasa al cliente si el riesgo sigue activo.

| Identificador | Criterio | Mensaje cuando no se cumple |
|:--|:--|:--|
| `1.3.F2`, `2.3.F3` | Los duplicados están bajo control | Tus reportes pueden estar inflados: hay contactos repetidos sin control. |
| `1.3.F5`, `1.3.F6`, `1.3.F7`, `2.3.F6` | El contexto se revisa y actualiza cada trimestre | Lo que la IA sabe de tu negocio puede estar desactualizado: tu contexto no se revisa hace más de un trimestre. |
| `3.3.F6` | El contexto y las respuestas publicadas se revisan y actualizan cada trimestre | Tus clientes pueden estar leyendo respuestas viejas, y la IA, trabajando con un contexto desactualizado: no se revisa hace más de un trimestre. |
| `2.3.F7` | Las personas aceptaron que les escriban | Puedes estar escribiéndole a personas que no te dieron permiso: el número de WhatsApp se puede bloquear y tus correos terminan en spam. |

## Glosario

Términos que aparecen en la escala, la especificación o el manual, y que pueden no ser evidentes. Los más técnicos ya están traducidos en el texto; estos se conservan porque son de uso común en la industria o en las herramientas.

| Término | Qué significa |
|:--|:--|
| AEO | Optimización para motores de respuesta: que el contenido aparezca como respuesta en asistentes de IA y en buscadores que contestan preguntas. |
| Almacén central de datos | Base donde la empresa junta la información de todas sus herramientas para analizarla en conjunto. En inglés, data warehouse. |
| Arquitectura de CRM | Cómo está armado el CRM por dentro: sus propiedades, pipelines, listas y formularios. |
| Asset | Material de apoyo para vender: una presentación, un caso de éxito, una demo o un video. |
| Backlog | Trabajo pendiente acumulado, como los tickets sin resolver. |
| BANT, MEDDIC, SPIN | Metodologías de venta con pasos definidos para calificar y conducir una oportunidad. |
| Buyer persona | Retrato escrito de un tipo de comprador: quién es, qué le preocupa y cómo decide. |
| CAC | Costo de adquisición de cliente: lo que cuesta en marketing y ventas conseguir un cliente nuevo. |
| Calibración | Práctica en la que un CSE puntúa casos de referencia con respuesta conocida, para comprobar que diagnostica igual que los demás. Por ahora es una regla en espera, en el manual de operación. |
| Canal conversacional | Canal donde el cliente conversa con la empresa en tiempo real o casi: la mensajería —en la región, sobre todo WhatsApp— o el chat del sitio. |
| Chatbot | Programa que responde conversaciones de forma automática, desde menús fijos hasta IA. |
| Chequeo | Versión corta del diagnóstico, para prospectos: una o dos preguntas por dimensión, con las que se estima el nivel sin recorrer los criterios. Todo lo que muestra es estimado. |
| Churn | Pérdida de clientes: los que dejan de comprar o cancelan. |
| CMS | Sistema donde se crean y publican las páginas del sitio web. |
| CRM | Sistema central donde el equipo registra contactos, empresas, negocios y actividades. |
| CSAT | Encuesta de satisfacción que se le hace al cliente después de una atención. |
| CSM | Responsable del éxito de un cliente: la persona que lo acompaña para que logre resultados. |
| Dashboard | Tablero con los indicadores clave de un área, que se actualiza desde el sistema. |
| Deal | Negocio u oportunidad de venta en curso. |
| Diagnóstico | Medición que hace el CSE con los agentes de Nexus, criterio por criterio con la regla estricta. Fija la línea base y se repite en cada remedición. |
| Forecast | Pronóstico de cuánto se va a vender en un período. |
| Handoff | Traspaso de un contacto o cliente de un área a otra, por ejemplo de Marketing a Ventas. |
| Health Score | Puntaje de salud de un cliente que anticipa si está en riesgo o tiene potencial de crecer. |
| Hábito | Criterio que describe algo que el equipo repite. Puede estar cumplido, iniciado —la rutina existe pero todavía no tiene historia— o no cumplido. |
| ICP | Perfil de cliente ideal: el tipo de empresa o de persona al que mejor le sirve lo que se vende. |
| Journey | Recorrido que hace un cliente desde que conoce la empresa hasta que compra, y después. |
| Landing page | Página creada para una campaña, con un objetivo concreto como captar datos. |
| Lead | Persona o empresa que mostró interés y todavía no es cliente. |
| Lead calificado | Lead que cumple los criterios escritos para que Ventas lo trabaje. Es lo mismo que un SQL. |
| Lead scoring | Modelo que suma puntos a cada lead según sus datos y su comportamiento, para saber cuáles están más cerca de comprar. |
| LTV | Valor de vida del cliente: cuánto ingreso deja durante toda la relación. |
| Macros y snippets | Respuestas guardadas que un agente inserta con un clic en vez de redactarlas cada vez. |
| Meta tags | Etiquetas del sitio que les dicen a los buscadores de qué trata cada página. |
| MQL | Lead que Marketing considera listo para pasar a Ventas, según los criterios que Marketing definió. Todavía no es un lead calificado: eso lo decide Ventas. |
| Nivel objetivo | El nivel hasta el que conviene llevar un departamento, acordado con el cliente según el resultado que persigue. Por defecto, Funcional. |
| NPS | Encuesta que mide qué tan dispuesto está un cliente a recomendar a la empresa. |
| Nurturing | Secuencia de mensajes que acompaña a un lead hasta que está listo para hablar con Ventas. |
| Onboarding | Proceso de arranque: el de un cliente nuevo, o el de una persona nueva en el equipo. |
| Perfil de negocio | Cómo se cierra la venta de una unidad —con equipo, transaccional o mixta— y qué pasa después —relación única, recompra o relación continua—. Decide qué criterios aplican. |
| Pipeline | Las etapas por las que pasa un negocio, desde el primer contacto hasta el cierre. |
| Pipeline review | Reunión periódica donde el equipo revisa el estado de los negocios en curso. |
| Playbook | Guía práctica que dice cómo actuar en una situación concreta, paso a paso. |
| Por confirmar | Nivel del diagnóstico al que solo le faltan hábitos iniciados: cuenta como alcanzado, y en la siguiente remedición se confirma o baja. |
| QBR | Revisión trimestral con un cliente clave sobre sus resultados y los próximos pasos. |
| Recompra | Que un cliente vuelva a comprar sin tener un contrato que lo obligue. |
| Referido | Cliente nuevo que llega por la recomendación de otro cliente. |
| Remarketing | Volver a mostrarle anuncios a quien ya tuvo contacto con la empresa. |
| Rep | Vendedor. |
| Round-robin | Asignación por turnos: uno a cada persona, en orden. |
| Routing | Regla que decide a quién se asigna automáticamente un lead o un caso. |
| SEO | Optimización para buscadores: que el sitio aparezca cuando alguien busca lo que la empresa ofrece. |
| SLA | Compromiso de tiempo de respuesta o de resolución, por tipo de caso o de cliente. |
| SQL | Lead aceptado por Ventas como oportunidad real que vale la pena trabajar. |
| Stack | El conjunto de herramientas tecnológicas que usa el área. |
| Test A/B | Probar dos versiones de algo con públicos parecidos, para ver cuál funciona mejor. |
| Upsell | Venderle más, o una versión superior, a un cliente que ya compró. |
| Vista 360° | Ver en un solo lugar toda la relación con un cliente: ventas, servicio, facturación e historial. |
| Workflow | Flujo automático que se dispara con un evento y ejecuta acciones en el sistema. |

## Historial de versiones

**8.6.0 (2026-09-30).** Las cuatro ediciones suman Marketing y Servicio, escritos con el mismo cuidado que Ventas: cada área con su vistazo por nivel, y cada dimensión con su pregunta, su descripción, su costo, sus niveles, sus resultados y sus criterios dichos con las palabras de la industria. Entran 54 criterios propios en esas dos áreas y 467 criterios de la matriz se dicen con otras palabras. Ecommerce y retail completa lo que ya traía y suma, entre otros, el catálogo que alimenta los anuncios de producto, las ventas que vuelven a las plataformas de anuncios, los locales en los mapas, los creadores con su código, cada caso ligado a su pedido, las mismas condiciones de cambio y devolución para todos, el pedido atrasado avisado antes del reclamo y la retención de los suscriptores. Banca y servicios financieros suma la revisión de cumplimiento normativo antes de publicar, el costo total a la vista en cada anuncio, las campañas que no le ofrecen a un cliente lo que ya tiene y que respetan su permiso, los plazos del regulador para cada reclamo, la verificación de identidad antes de atender una gestión, el bloqueo inmediato de la tarjeta y, en Eficiente, las gestiones más comunes en la app. Educación suma la campaña de cada período desde las fechas de admisión, la familia como audiencia, la reputación a la vista, el costo por matrícula, el calendario de atención de cada período y la permanencia del estudiante. Inmobiliaria suma el plan de marketing por etapa del proyecto, la página de cada proyecto, anunciar solo lo disponible, el costo por visita y por reserva, la garantía escrita, el aviso de un cambio en la fecha de entrega, el avance de obra hasta la entrega y, donde hay condominio, el traspaso a su administración. Dentro de cada edición, cada cosa se pide una vez: en Banca, Ventas pide la autorización para consultar el historial y Marketing el permiso para las ofertas; en Educación, Admisiones pide el permiso del responsable de un menor, su recordatorio habla del curso siguiente —la rematrícula es de Servicio— y suma la matrícula que no llega a clases; en Ecommerce, las secuencias de Ventas son las del carrito y las de después de la compra, y las de Marketing, las de quien todavía no compra. Cinco criterios de la matriz no aplican en su edición: el responsable dedicado, la retención con propuesta de expansión y las revisiones de resultado en una tienda, y la retención con expansión en Banca, donde ofrecer un producto más es del área comercial. En la escala general, la retención y la propuesta de expansión de Proactividad pasan a aplicar solo donde la relación es continua: donde el cliente vuelve sin contrato, reactivarlo es de Tracción del Deal. También cambian textos sin cambiar lo que se mide: el orden de dependencias ya no nombra una dimensión que las ediciones renombran, el vistazo de Marketing en Eficiente deja de prometer una presencia medible que ningún criterio pide, el resultado de Eficiente en Equipo y Gobierno de Servicio deja de prometer que se avisan las oportunidades, y se retocan la descripción de Medición y Aprendizaje y un criterio de Datos de Servicio. Cambia lo que piden Marketing y Servicio en las cuatro ediciones, y Eficiente de Proactividad para el perfil de recompra.

**8.5.0 (2026-09-30).** Marketing y Servicio dejan de pedir lo mismo en dos dimensiones, con el criterio con que se limpió Ventas en la 8.2.0, y quedan iguales a Ventas en cuatro cosas que ya estaban decididas para ella. En Marketing, cada cosa queda en un solo lugar: probar y ajustar las campañas, y que lo aprendido corrija la planificación, en Medición y Aprendizaje; la reunión del equipo, en Procesos, y Equipo y Gobierno pide que en ella se rinda cuentas por las metas; el tablero del líder y el reporte mensual a la dirección, en Equipo y Gobierno, y Medición pide los resultados de cada campaña a la vista; que las campañas salgan distintas por segmento y segmentar por comportamiento, en Segmentación; la definición de lead calificado para Ventas, en Ventas, y Marketing define hasta el MQL; la presencia en los asistentes de IA, en Marca y Presencia; y la limpieza de los datos, en Datos. En Servicio: el pipeline de servicio y quién responde por cada cliente, en Procesos; la ficha del cliente, en Datos, y Priorización de Clientes pide que el agente la use; la prioridad de cada ticket, en Priorización de Clientes; la escalación automática, en Tecnología; adelantarse al cliente, en Proactividad; alimentar la base de conocimiento y buscar patrones, en Escalabilidad del Servicio; el traspaso desde Ventas, en Equipo y Gobierno; y mantener vigentes las respuestas publicadas queda como riesgo, con su propio mensaje, y deja de decidir el nivel. Las cuatro cosas que se igualan a Ventas: trabajar en el sistema central es una rutina y pasa a Procesos, y con ella la señal de Inicial de los agentes que siguen con sus canales personales; la IA como asistente del equipo es de Eficiente, y en Funcional solo se pide que, si se usa, trabaje con un contexto básico; Procesos mide en Eficiente y en Óptimo que el proceso se cumpla, y en Servicio eso es que cada caso siga las etapas y los pasos del proceso, no que se cumplan los plazos; y los paneles en tiempo real son de Eficiente, en Tecnología. En «Los cinco niveles de un vistazo», Eficiente dice en las tres áreas que la IA asiste al equipo. Salen 29 criterios —18 de Marketing y 11 de Servicio—, entran 19 y 29 se dicen de nuevo; el que cambia de dimensión, de nivel o de lo que mide lleva identificador nuevo, y el anterior queda retirado. Las revisiones de resultado de Óptimo en Proactividad pasan a aplicar solo donde la relación es continua: lo que ese criterio pedía para todos queda en el de las acciones proactivas que se ajustan con IA. Dicen lo que requieren 35 criterios de Marketing y de Servicio. En Ventas, el análisis de Eficiente en Aprendizaje de Ganadas y Perdidas revisa los negocios ganados además de los perdidos, y las cuatro ediciones lo dicen con sus palabras. La regla de asignación lleva a las tres áreas dos casos que solo hablaban de Ventas, suma cuatro y precisa otros tres. El glosario cambia «Costo de adquisición» por «CAC», que es como aparece en la matriz, dice que un MQL todavía no es un lead calificado y retira «Retención neta de ingresos». En la edición Ecommerce y retail, la descripción de Tecnología de Servicio deja de decir si quien atiende ve los pedidos, que es de Datos. Cambia lo que piden Funcional, Eficiente y Óptimo en varias dimensiones de Marketing y de Servicio, y Eficiente en Aprendizaje de Ganadas y Perdidas.

**8.4.2 (2026-09-30).** Revisión de las cuatro ediciones antes de publicarlas, con el mismo criterio con que se limpió Ventas: cada cosa se pide una vez. En Banca, la oferta se valida contra la política de crédito vigente y ya no contra las condiciones del cliente, que es la precalificación; el documento del cliente objetivo dice a quién va dirigido cada producto y qué busca. En Inmobiliaria, la disponibilidad queda en Tecnología: el estado de cada unidad la requiere, y los cambios que llegan el mismo día son los de precio y de avance de obra. En Ecommerce y retail, la invitación a volver después de cada compra pasa a ser un criterio propio, y el de los clientes que ya deberían haber vuelto se lee como en la escala general; las devoluciones por «no era lo que esperaba» se miden, y corregir la ficha queda en Embudo de compra; la ficha del producto deja de pedir la disponibilidad, y la meta por canal, un responsable. En Educación, los criterios y los textos que todavía hablaban de venta o de lo comercial se dicen con las palabras de admisiones. Salen dos requeridos que no eran estrictos —uno de Banca y uno de Inmobiliaria— y entran tres que sí lo son. En la escala general, el ejemplo de la IA en el trabajo diario deja de ser sugerir el siguiente paso, que es de Priorización de Leads, y la regla de asignación dice que probar una técnica nueva en un piloto sigue en Procesos. No cambia ningún identificador de la matriz ni su cálculo.

**8.4.1 (2026-09-30).** Las tres ediciones nuevas dicen con sus palabras lo que todavía se leía con el texto general donde más se notaba: los resultados de Procesos y de Tecnología, la definición que no se deja envejecer —prospecto precalificado en Banca, aspirante calificado en Educación, interesado calificado en Inmobiliaria— y, en Educación, los niveles y los criterios que hablaban de vender. No cambia ningún criterio de la matriz ni su cálculo.

**8.4.0 (2026-09-30).** Tres ediciones nuevas, las tres con Ventas escrita entera y, por ahora, solo Ventas: en ellas Marketing y Servicio se siguen midiendo con la escala general. Banca y servicios financieros, para quien coloca créditos, tarjetas y cuentas a personas y pymes con ejecutivos y canales digitales: Oferta y condiciones, Precalificación y priorización, Avance de la solicitud, y Aprobadas, rechazadas y desistidas; pide el permiso del cliente registrado, precalificar antes de armar el expediente y no perder la solicitud que queda a medias en un canal digital. Educación, para el área de admisiones, que en esta edición se llama así: Oferta académica, Priorización de aspirantes, Avance de la admisión, y Matrículas ganadas y perdidas; pide un calendario por período, acompañar al admitido hasta que se matricula y registrar por qué no se matriculó cada aspirante. E Inmobiliaria, para quien vende las unidades de un proyecto: Proyecto y propuesta, Priorización de interesados, Seguimiento de visitas y reservas, y Ventas, pérdidas y desistimientos; pide una sola lista de precios vigente, que reservar bloquee la unidad, y que cada reserva que se cae deje su razón. Varios criterios propios dicen lo que requieren. No cambia ningún criterio de la matriz ni su cálculo.

**8.3.0 (2026-09-30).** Un criterio puede decir cuáles otros requiere: los que necesita para poder cumplirse y que están en otra dimensión, o en un nivel anterior de la suya. Lo dice en su etiqueta, y la Parte 2 suma «Criterios requeridos», que explica para qué sirve: leer de dónde se sostiene cada criterio, ordenar el trabajo y revisar un diagnóstico. No cambia el nivel ni el puntaje. En Ventas, 17 criterios dicen lo que requieren: el documento del cliente ideal sostiene cuatro criterios de Priorización de Leads y de Datos; la definición de lead calificado, dos; y la pipeline review, la rendición de cuentas. El criterio que enfoca el esfuerzo en los leads que encajan con el cliente ideal deja de nombrar entre paréntesis dónde se define: lo dice su requerido. En la edición Ecommerce y retail, cuatro criterios propios dicen lo que requieren. Ningún criterio ni identificador cambia.

**8.2.0 (2026-09-30).** Ventas deja de pedir lo mismo en dos dimensiones, después de revisar con su responsable los criterios que se repetían. Cada cosa queda en un solo lugar: la integración con otros sistemas, en Tecnología, y Datos pide su resultado; la pipeline review, en Procesos, y Equipo y Gobierno pide que en ella se rinda cuentas; que el equipo trabaje en el CRM, en Procesos, y Tecnología pide que las conversaciones queden en el sistema; la definición de lead calificado, en Priorización de Leads; mejorar el proceso con lo aprendido, en Aprendizaje; vigilar que el proceso se cumpla, en Procesos; y el líder sobre los negocios en riesgo, en Tracción del Deal, que suma en Eficiente el aviso automático al líder. El traspaso con Marketing queda en Equipo y Gobierno, y Tracción pide lo que le toca a Ventas: que el lead que no está listo vuelva a nutrición. En Óptimo, la siguiente mejor acción queda en Priorización, detectar desviaciones en Procesos y ajustar con data en Aprendizaje. Salen cuatro criterios —la definición de oportunidad calificada y el refinamiento del proceso en Procesos, las alertas en Equipo y Gobierno, y el equipo como unidad cohesiva en Propuesta y Coherencia—, entra uno y una docena se dicen de nuevo. Vigilar la adherencia pasa a aplicar a todos los perfiles, para que Eficiente de Procesos no quede vacío donde se vende sin vendedor. La regla de asignación corrige dos casos que decían otra cosa que la matriz y suma cinco, y el glosario, «Lead calificado». En la edición Ecommerce y retail, las alertas de ventas por canal pasan a ser un criterio propio. Cambia lo que piden Funcional, Eficiente y Óptimo en varias dimensiones de Ventas.

**8.1.0 (2026-09-30).** Revisión de Aprendizaje de Ganadas y Perdidas de Ventas con su responsable, con un solo cambio: sale de Funcional el criterio de las ventas ganadas que se caen antes de la entrega, que había entrado en la 7.7.0. Su identificador queda retirado, y la regla de asignación dice que eso se mide solo en las ediciones que lo traen como criterio propio. En la edición Ecommerce y retail, que cada pedido cancelado o devuelto deje su razón pasa a ser un criterio propio. Cambia lo que pide Funcional en Aprendizaje de Ganadas y Perdidas.

**8.0.0 (2026-09-29).** La escala suma ediciones por industria, en una parte nueva al final del documento. Una edición es la misma escala dicha para una industria: comparte áreas, dimensiones, niveles, reglas, cálculo e identificadores, y cambia los nombres de las dimensiones de producción, las preguntas, los costos y los criterios, que puede decir con sus palabras, sumar como propios o sacar cuando no aplican. La matriz pasa a ser la escala general, con la que se mide a quien no tiene edición. La primera edición es Ecommerce y retail: trae Ventas escrita entera para una tienda —Catálogo y oferta, Oferta por cliente, Carrito y recompra y Embudo de compra en producción— y, en Marketing y Servicio, nombre, pregunta y costo propios, con criterios que todavía se leen con el texto general. En esa edición, la personalización de Ventas aplica también a la venta transaccional, y en Eficiente se pide que cada producto que se acaba o caduca tenga medido cada cuánto se vuelve a comprar. La regla de asignación suma un caso. No cambia ningún criterio de la matriz ni su cálculo.

**7.7.0 (2026-09-29).** La escala general se prepara para servir a cualquier perfil de negocio, antes de sumar ediciones por industria. Hay dos marcas de perfil nuevas: venta sin vendedor, que reemplaza la regla que leía la frase del criterio, y recompra. La próxima compra de un cliente que vuelve sin contrato se trata como un negocio más, y reactivarla entra en Tracción del Deal. Se suman criterios para la venta sin vendedor —qué parte de las ventas queda con un cliente identificado y la misma oferta en todos los canales—, uno para cuando lo que se vende es limitado, uno para las ventas ganadas que se caen antes de la entrega y, en Eficiente de Marketing, las reseñas públicas y el programa de referidos. La definición de lead calificado deja de pedirse donde se vende sin vendedor, el responsable de cada cliente admite un seguimiento automático en carteras masivas, y la segmentación de clientes de Eficiente vale también para la relación única. Una docena de criterios se dicen de forma que sirva tanto para quien le vende a empresas como para quien le vende a personas. La regla de asignación suma cinco casos y el glosario, «Recompra» y «Referido». Se suman ocho criterios; ningún identificador existente cambia. Cambia lo que piden Funcional y Eficiente en varias dimensiones.

**7.6.1 (2026-09-29).** Cada dimensión trae, entre su pregunta y su costo de quedarse, una descripción de 15 a 20 palabras que dice qué mide. Reemplaza el «qué mide» de la 7.6.0, que tenían solo dos dimensiones y era más largo; cómo se leen en la venta transaccional queda donde ya estaba, en «El perfil de negocio». No cambia el cálculo.

**7.6.0 (2026-09-29).** Revisión de Tracción del Deal de Ventas con su responsable. Deficiente e Inicial se dicen más simple y suman señales sobre el registro de los deals, los assets de venta y el canal único; en Funcional se suma que hay assets estandarizados que ayudan a cerrar, y el resultado pasa a ser lo que se logra al cumplir todos sus criterios. Una dimensión puede traer, entre su pregunta y su costo, qué mide; la escriben Priorización de Leads y Tracción del Deal, con cómo se leen en la venta transaccional. El glosario suma «Asset». Cambia lo que pide Funcional en Tracción del Deal.

**7.5.0 (2026-09-29).** Revisión de Priorización de Leads de Ventas con su responsable. Inicial se dice más simple y suma que el líder puede nombrar el ICP pero el CRM no tiene cómo segmentarlo. En Funcional, el criterio del SQL se queda con lo esencial —criterios escritos que se aplican de forma consistente— y se suma que la documentación del ICP se usa en la arquitectura de CRM y en los formularios. El glosario suma «Arquitectura de CRM». Cambia lo que pide Funcional en Priorización de Leads, que sigue sin aplicar a la venta transaccional.

**7.4.1 (2026-09-29).** Revisión de Propuesta y Coherencia de Ventas con su responsable: Inicial se dice más simple —el mensaje común apenas empieza, las propuestas todavía no están estandarizadas—, y en Funcional el líder explica el cliente ideal sin consultar su documentación y las propuestas están estandarizadas. En Datos de Ventas, lo que no se deja envejecer es la documentación sobre el ICP. No cambia el cálculo.

**7.4.0 (2026-09-29).** La IA en Tecnología de Ventas. En Funcional no es requisito: si el equipo la usa, tiene que tener como contexto la información básica de clientes y prospectos. En Eficiente sí lo es: el equipo la usa en su trabajo diario, con ese contexto, como asistente —redactar, resumir conversaciones, sugerir el siguiente paso—, que es lo que dice la regla de automatización. Cambia lo que piden Funcional y Eficiente en Tecnología de Ventas.

**7.3.1 (2026-09-29).** En Datos de Ventas, el criterio de riesgo que no deja envejecer una definición habla de la de lead calificado, no de la de oportunidad calificada. La descripción de Funcional en Tecnología de Ventas deja de decir que el CRM se usa por convicción —ese criterio pasó a Procesos y Rutinas— y dice que hay automatización simple en producción y que la IA trabaja con el contexto de los clientes. No cambia el cálculo.

**7.3.0 (2026-09-29).** Revisión de Equipo y Gobierno de Ventas con su responsable. Deficiente e Inicial se dicen más simple, y Funcional suma que el líder ve en reportes automáticos qué tareas cumplió cada vendedor y cuáles tiene pendientes. Cambia lo que pide Funcional en Equipo y Gobierno de Ventas.

**7.2.0 (2026-09-29).** Revisión de Datos de Ventas con su responsable. Deficiente suma que la información de los compradores está en hojas de cálculo y que no hay registro de sus compras; Inicial se dice más simple y suma que no se guarda toda la información necesaria de los compradores. En Funcional, el criterio de riesgo del contexto documentado se parte en tres —el ICP, la definición de oportunidad calificada y la documentación de las soluciones ofrecidas—, cada uno de riesgo y con el mismo mensaje. «No se deja envejecer» pasa a ser una palabra con valor fijo: se revisa y se actualiza al menos una vez por trimestre. Cambia lo que pide Eficiente en Datos de Ventas: dos criterios de riesgo más.

**7.1.0 (2026-09-29).** Primera revisión de Ventas con su responsable, en Procesos y Rutinas y en Tecnología y Automatización. Que cualquier vendedor abra el CRM como herramienta de trabajo pasa de Tecnología a Procesos y Rutinas, con identificador nuevo; el de Tecnología queda retirado. Tecnología pide además en Funcional que la IA utilizada tenga como contexto la información básica de clientes y prospectos, y en Deficiente e Inicial pasa a describir cómo se aplica la IA. El resultado de Funcional en Procesos y Rutinas se reescribe para que sea lo que se logra al cumplir todos sus criterios, y varios criterios se dicen más simple. Cambia lo que pide Funcional en las dos dimensiones.

**7.0.1 (2026-09-29).** Ninguna celda de la matriz queda sin criterios: los cinco niveles que solo tenían su descripción —Deficiente e Inicial de Propuesta y Coherencia, Deficiente de Segmentación y de Medición y Aprendizaje, e Inicial de Datos en Servicio— suman como criterios las señales que su descripción ya traía. No cambia el cálculo: Deficiente e Inicial se siguen asignando por la descripción que mejor calza. La escala deja de estar congelada: cambia con el feedback de su responsable y con los comentarios del equipo en Nexus, como dice el manual de operación.

**7.0.0 (2026-09-26).** La escala se separa en tres documentos, sin perder contenido: la escala, para personas; la especificación del cálculo, para los sistemas; y el manual de operación, para el equipo. Queda congelada hasta usarla con cinco a diez clientes reales: solo se corrige lo que impida usarla, y lo demás se anota como cambio pendiente. El test de prospectos pasa a ser el chequeo, que estima el nivel de cada dimensión con una o dos preguntas y lo muestra como estimado; el cálculo criterio por criterio queda para el diagnóstico del CSE, que deja de tener una versión simple y otra profunda. Un criterio sin información ya no deja el nivel por confirmar: el CSE lo busca, y si no lo consigue, cuenta como no cumplido. Qué se trabaja primero se reduce a dos pasos —la capa más baja y, dentro de ella, la dimensión más baja según el orden de dependencias—; el resultado del cliente entra por el nivel objetivo y por el criterio del CSE, que puede cambiar el orden dentro de la capa con la razón escrita. Pasan a reglas en espera, en el manual, la calibración de los CSE, la revisión anual por alguien que no lleva la cuenta, la muestra en equipos grandes, las comparaciones entre empresas y el arrastre de lo evaluado. Ningún criterio ni identificador cambia.

**6.13.0 (2026-09-26).** Proactividad en Servicio se reordena: en Eficiente, ninguna solicitud del cliente se pierde entre áreas —las alertas cubren también lo que resuelve otra área, como administración— y el cliente recibe lo que necesita saber antes de los momentos clave; deleitarlo con regalías, beneficios o promociones pasa a Óptimo. La regla de asignación aclara de qué área son las solicitudes y separa deleitar a los clientes actuales de las campañas hacia el mercado. Se suma un criterio; ningún identificador existente cambia.

**6.12.0 (2026-09-26).** Correcciones que salieron al implementar el cálculo. Un hábito tiene tres estados —cumplido, iniciado o no cumplido— y un nivel solo queda por confirmar si le faltan hábitos iniciados: antes, los niveles hechos solo de hábitos se alcanzaban sin cumplir nada. Proactividad en Servicio suma dos criterios de Eficiente para todos los perfiles —alertas y comunicación que deleita—, porque ese nivel no tenía criterios para la relación única; y un nivel sin criterios para un perfil no se alcanza. Servicio define sus tipos de cliente desde Funcional, como Ventas su cliente ideal y Marketing sus buyer personas. Se agrega el orden de dependencias por área y tipo de venta, que decide antes que el puntaje, y las pruebas que toda versión tiene que pasar. Se suman tres criterios; ningún identificador existente cambia.

**6.11.0 (2026-09-25).** Si dos dimensiones empatan en nivel y puntaje, ya no decide el orden de la escala: gana la que más frena a las otras en ese tipo de cliente, y el informe dice por qué. Toda recomendación va con su razón. Ningún criterio cambia.

**6.10.0 (2026-09-25).** Ajustes que salieron de revisar la página de resultados. Ningún texto que ve el cliente cita un identificador, y se corrigen tres criterios que lo hacían. Cuando las dos capas están parejas por debajo de Funcional, va primero la base; y si dos dimensiones empatan en nivel y puntaje, va la que más frena a las otras en ese tipo de cliente, con su razón. En el diagnóstico simple, un criterio sin información cuenta como no cumplido, el nivel queda por confirmar y el informe dice cuántos quedaron así; lo que falta para Funcional se muestra plegado. Ningún identificador cambia.

**6.9.0 (2026-09-25).** La escala sirve para distintos modelos de negocio sin cambiar de estructura. Cada unidad tiene un perfil —cómo se cierra la venta y qué pasa después— y 43 criterios llevan una marca que dice a qué perfiles aplican. En la venta transaccional, Ventas se lee sobre la venta automática, y un criterio nuevo pide que esas ventas entren solas al sistema como negocios. La unidad que se diagnostica es el equipo que se atiende, y en equipos grandes se evalúa una muestra. El perfil decide qué aplica y la industria, las palabras. Se suma un criterio; ningún identificador existente cambia.

**6.8.0 (2026-09-25).** Revisión de Servicio desde el éxito del cliente. El área declara que cubre todo lo posterior a la venta, hasta que el cliente logre el resultado por el que compró. La salud del cliente sube en dos pasos: por reglas en Eficiente y, en Óptimo, midiendo experiencia y resultado. Donde la relación es recurrente, los clientes clave revisan su resultado en una cadencia fija. Una mala calificación se atiende desde Funcional. Se registra por qué se va cada cliente, se define el recorrido del cliente con sus momentos clave, el traspaso desde Ventas llega con el resultado que persigue el cliente, la atención se organiza por segmento y el equipo se mide por lo que retiene. Se suman cuatro criterios; ningún identificador existente cambia.

**6.7.0 (2026-09-25).** Revisión desde la consultoría. Cada departamento tiene un nivel objetivo acordado con el cliente según el resultado que persigue, y solo se trabaja lo que está debajo de él. Dentro de la capa, primero va la dimensión cuya línea de resultado más se parece a lo que el cliente persigue. Cada dimensión tiene una línea de costo de quedarse, y el informe cierra con una sola recomendación. El test de prospectos se muestra completo por confirmar. Se define qué datos guarda cada diagnóstico para comparar entre empresas, siempre en anónimo y entre diagnósticos del mismo tipo. Solo un CSE calibrado hace diagnósticos profundos, y el diagnóstico nunca se usa para evaluar al CSE. Ningún criterio cambia.

**6.6.0 (2026-09-25).** Se sube el listón del canal conversacional sin agregarle filas propias: el criterio habla del canal conversacional y WhatsApp aparece como ejemplo principal. En Ventas, las conversaciones con prospectos quedan en el sistema desde Funcional, y en Eficiente y Óptimo suben las secuencias que reaccionan a la interacción, el control de quién ve cada conversación, su medición y los agentes de IA en el canal. En Marketing entra un criterio de riesgo: pedir permiso para escribir cuando se pide un dato de contacto; y suben la automatización por interacción, la orquestación, la atribución del canal y los agentes. En Servicio suben el enrutamiento por idioma, tema o habilidad, la primera respuesta en todos los canales y el escalamiento de la IA a una persona. Se suma un criterio; ningún identificador existente cambia.

**6.5.0 (2026-09-24).** Comparación contra las versiones 3.0.0 y 5.2.0: ningún criterio se había perdido por accidente. El código del 1 al 5 de cada nivel deja de presentarse como lo que se grafica, porque se grafica el puntaje. Se recuperan como criterios tres ideas que solo vivían en la panorámica original: cuánto tarda un cliente nuevo en obtener valor, el resultado definido del onboarding y las propuestas que solo prometen lo que se puede entregar. Vuelve la frase que une las cuatro dimensiones de producción. Ningún identificador existente cambia.

**6.4.0 (2026-09-24).** Revisión crítica de la escala como instrumento. Se agrega el estado por confirmar: un nivel al que solo le faltan hábitos cuenta como alcanzado y se confirma en la remedición, y se marcan como hábito los criterios que solo se confirman con el tiempo. Se fijan los valores de las palabras de umbral y una regla para departamentos de una o dos personas. Se agrega cómo se valida la escala contra los resultados de los clientes. El cálculo de nivel y puntaje queda en un paso a paso normativo. Salen cuatro criterios que solo describían un techo de automatización, y los de roles pasan de contratar perfiles a tener responsables de validar la IA. Lo cultural se trabaja con acompañamiento y gestión del cambio.

**6.3.0 (2026-09-24).** Se agrega el bucle entre áreas en Óptimo, con un criterio en cada área donde se recibe la señal del otro departamento, y la panorámica lo refleja. Se define el puntaje de 0 a 100: tramos de 20 puntos por nivel y, dentro del tramo, el avance hacia el nivel siguiente, con la misma regla para dimensión, capa y departamento. Los tableros de Funcional de Ventas y Servicio piden de 4 a 6 métricas clave, igual que el de Marketing. Se suman tres criterios; ninguno existente cambia de identificador.

**6.2.0 (2026-09-24).** Se agregan los criterios de riesgo: no deciden el nivel en que están, pero son requisito para pasar a Eficiente, y se reportan como riesgos activos con un mensaje para el cliente. Pasan a riesgo los dos criterios de duplicados, reescritos por resultado, y los tres de revisión del contexto. Un criterio se cumple por lo que busca, también si se resuelve de una forma más avanzada. El CSE puede ajustar el nivel calculado o marcar un criterio como que no aplica, con justificación, y se guardan los dos niveles. Se suman las analogías del mapa y la brújula y de la obra. No cambia ningún identificador.

**6.1.0 (2026-09-24).** El nivel del departamento pasa a ser el de su capa más baja, sin ponderaciones. De Funcional para arriba, una dimensión alcanza un nivel cuando cumple todos sus criterios que aplican; Deficiente e Inicial se asignan por mejor ajuste. Se definen el diagnóstico simple y el profundo, con arrastre de lo evaluado para que sean comparables. Se agrega la regla de qué se trabaja primero y la lectura del avance en dos alturas. Se evalúan siempre las ocho dimensiones, también antes de un caso de uso. El archivo pasa a tener nombre fijo. No cambia ningún criterio ni ningún identificador.

**6.0.0 (2026-09-24).** Reorganización en cuatro partes. Todas las dimensiones tienen los cinco niveles. Identificadores estables y tipo de verificación en cada criterio. Líneas de resultado desde Funcional. Glosario.

---

# Parte 5 — Ediciones por industria

Una edición es la misma escala dicha para una industria: comparte las áreas, las ocho preguntas de fondo de cada área, los cinco niveles, las reglas y el cálculo, y cambia lo que ve quien la lee.

La matriz de la Parte 3 es la escala general, escrita para cualquier empresa. Una tienda, un banco, una universidad o una inmobiliaria se reconocen mejor en una escala que habla de lo suyo: por eso cada edición les pone a las dimensiones de producción el nombre que tienen en esa industria, hace las preguntas y dice los costos con sus palabras, y suma los criterios que solo tienen sentido ahí.

## Qué cambia una edición y qué no

- **Lo que no cambia.** Las áreas, las dimensiones y sus identificadores; los cinco niveles; las marcas de cada criterio y lo que requiere; las reglas de la Parte 2 y el cálculo de la especificación. Las dimensiones de base operativa conservan su nombre, que es el mismo en las tres áreas.
- **Decir lo mismo con otras palabras.** Una edición puede reescribir un criterio de la matriz. El criterio conserva su identificador y sus marcas, y tiene que medir lo mismo y aplicar a los mismos, con los mismos umbrales: si cambia lo que se pide, no es una reescritura.
- **Criterios propios.** Lo que solo tiene sentido en la industria entra como un criterio propio de la edición. Lleva un identificador del bloque de su edición —del 101 al 199 en la primera, del 201 al 299 en la segunda, y así con cada una—, para que no se cruce con la numeración de la matriz ni con la de otra edición.
- **Criterios que no aplican.** Una edición puede decir que un criterio de la matriz no aplica a su industria. Sale de la cuenta, igual que uno que no corresponde al perfil de negocio, y si otro criterio lo requería, ese requerido se deja de lado en la edición. Lo que no puede hacer es sacar una dimensión entera.
- **Todo criterio queda decidido.** Si una edición toca los criterios de una dimensión, dice algo de todos los de la matriz: lo reescribe, lo saca o lo deja como está. Así, cuando la matriz suma un criterio, cada edición tiene que decidir qué hace con él.
- **Lo que una edición no dice, vale como está en la matriz.** Una dimensión de la que la edición solo cambia el nombre, la pregunta o el costo se sigue midiendo con los criterios generales, y la tabla de palabras de la edición dice cómo se llama cada cosa en la industria.

## Cómo se mide con una edición

Una unidad se mide con la escala general o con una sola edición, la de su industria. El perfil de negocio sigue decidiendo qué criterios aplican dentro de la edición. El avance se compara entre mediciones hechas con la misma edición: si una unidad pasa de la escala general a una edición, o de una edición a otra, esa medición es una línea base nueva.

Una edición puede darle criterios a una dimensión que en la escala general no aplica a un perfil. Pasa en la de ecommerce y retail: en la venta transaccional, la dimensión de personalización de Ventas no aplica en la escala general, y en la edición mide la oferta que la tienda le hace a cada comprador. Y pasa en la de banca, donde esa dimensión mide también a quién se le ofrece cada producto cuando el cliente lo contrata solo.

Una edición se escribe por áreas, y un área que la edición no escribe se mide con la escala general. Las cuatro ediciones de hoy —Ecommerce y retail, Banca y servicios financieros, Educación e Inmobiliaria— traen las tres áreas enteras.

## Cómo se escribe una edición

Igual que la matriz, y solo lo que cambia. Abre con para quién es, su clave —que no cambia aunque la edición cambie de nombre—, su perfil habitual y desde qué número van sus criterios propios. Siguen la tabla de palabras y, después, cada área y cada dimensión que cambia. Un criterio reescrito lleva en la etiqueta solo su identificador, y conserva lo que requiere en la matriz; uno propio lleva la etiqueta completa, con lo que requiere si no se puede cumplir sin otro. Al final de cada dimensión van los criterios de la matriz que no aplican y los que se leen igual.

## Edición — Ecommerce y retail

Para quien vende productos al consumidor final en una tienda en línea, en tiendas físicas o en las dos: el cliente compra solo, sin que un vendedor trabaje cada venta, y lo que se busca es que vuelva.

*Clave:* ecommerce-retail

*Perfil habitual:* transaccional · recompra.

*Criterios propios:* desde el 101.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Deal | Pedido o carrito |
| Lead | Visitante o comprador que todavía no compra |
| Pipeline | El recorrido de la compra: carrito, pago y entrega |
| Pipeline review | Revisión de ventas |
| Propuesta | La ficha del producto y su oferta |
| Razón de pérdida | El paso donde se abandonó la compra |
| Ticket | Caso de posventa: una consulta, un cambio o una devolución |

### Área 1 — Ventas

Mide el rendimiento de la venta de la tienda: cómo está montada por dentro y qué produce en pedidos, valor por pedido y recompra.

**Deficiente.** Tu tienda vende, pero nadie sabe bien cómo. Los pedidos viven en la plataforma o en la caja y no llegan a un sistema común, los precios cambian según el canal y los carritos abandonados se pierden sin que nadie los vea.

**Inicial.** Tienes la tienda armada, pero cada canal va por su cuenta. Los pedidos entran a medias al sistema, los reportes se arman a mano y los recordatorios, si salen, son los mismos para todos.

**Funcional.** Tu tienda opera como una maquinaria base. Cada venta entra sola al sistema con su cliente, su monto y su canal; la oferta es la misma en todos los canales; ningún carrito se abandona sin un recordatorio, y quien compró recibe una invitación a volver.

**Eficiente.** La tienda deja de tratar igual a todos. Mides la conversión paso a paso, sabes cada cuánto se recompra cada producto y el recordatorio sale en ese momento, tus mejores clientes tienen un trato distinto y las pruebas son parte de la rutina.

**Óptimo.** La IA hace el trabajo fino y tu equipo decide dónde crecer. Cada comprador ve una tienda pensada para él, el sistema calcula cuándo le toca volver y con qué oferta, y detecta dónde se cae la compra antes de que alguien lo note.

#### 1.1 Procesos y Rutinas

Si mañana se va quien administra la tienda, ¿las ventas siguen saliendo igual?

*Descripción:* Mide si la tienda opera con un proceso escrito y un calendario comercial, no con la memoria de una persona.

*Costo de quedarse:* Si se va quien administra la tienda, se lleva cómo se publica, cómo se cambia un precio y cuándo toca cada promoción: todo se vuelve a improvisar.

**Deficiente.** Sin proceso. La tienda se maneja de memoria: nadie escribió cómo se publica, cómo se cambia un precio ni cuándo toca cada promoción.

- No existe ningún documento de cómo se opera la tienda; cada quien resuelve a su criterio. `[1.1.D1]`
- Si se va quien administra la tienda, nadie sabe cómo seguir operándola. `[1.1.D4]`
- Las promociones se deciden sobre la marcha, sin calendario. `[1.1.D101 · declarado]`

**Inicial.**

- Hay pasos acordados de palabra para publicar y para armar una promoción, pero cada quien los hace distinto. `[1.1.I1]`
- Las ventas se revisan a cadencia irregular y sin una estructura fija. `[1.1.I3]`
- Que un pedido quede bien registrado depende de quién lo cargue, no de un proceso o rutina. `[1.1.I4]`

**Funcional.** Maquinaria base: la operación de la tienda está escrita, el recorrido del pedido es uno solo y las ventas se revisan con cadencia.

*Resultado:* Todo el equipo opera la tienda igual: los pedidos siguen el mismo recorrido en todos los canales, las promociones salen de un calendario y las ventas se revisan cada semana, así que si se va una persona, la tienda sigue vendiendo.

- Cualquiera del equipo explica igual el recorrido de un pedido —carrito, pago, preparación y entrega— y sus etapas. `[1.1.F1]`
- El recorrido del pedido está configurado con sus etapas, y cada canal de venta —tienda en línea, tienda física o marketplace— registra sus pedidos con ese mismo recorrido. `[1.1.F2]`
- La revisión de ventas corre en cadencia formal, semanal o quincenal. `[1.1.F5]`
- La operación de la tienda está documentada: cómo se publica un producto, cómo se cambia un precio y cómo se arma una promoción. `[1.1.F101 · declarado]`
- Hay un calendario comercial —temporadas, promociones y lanzamientos— con al menos un trimestre de horizonte, y se cumple la mayoría del tiempo. `[1.1.F102 · declarado · hábito]`

**Eficiente.** La operación deja de ser una lista de pasos y se vuelve un método que se mide.

*Resultado:* Las promociones se planifican con un objetivo y se revisan al cerrar, y el líder sabe con datos si la tienda se opera como está escrito.

- El líder comprueba con datos del sistema, no de memoria, que la tienda se opera como está escrito. `[1.1.E3]`
- Cada promoción sale con un objetivo escrito y se revisa al cerrar: qué vendió, a quién y qué margen dejó. `[1.1.E101 · declarado · hábito]`
- Hay una lista de revisión antes de publicar un producto o una promoción, y se usa. `[1.1.E102 · evaluado · hábito]`

**Óptimo.** El sistema vigila la operación y señala lo que se sale de lo normal; el equipo decide los ajustes.

- El sistema detecta solo lo que se sale de lo normal en la operación —un producto sin existencias, un precio distinto entre canales, un paso del pago que falla— y avisa a quien tiene que actuar. `[1.1.O1]`

*No aplican:* `1.1.D2`, `1.1.I2`, `1.1.F4`.

*Se leen igual:* `1.1.D3`, `1.1.F6`, `1.1.E1`, `1.1.E2`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Cuánto del trabajo de la tienda hace el sistema, y cuánto de las plataformas que pagas se está aprovechando?

*Descripción:* Mide si la tienda, la caja y el CRM trabajan como un solo sistema, y cuánto trabajo repetitivo se automatiza.

*Costo de quedarse:* Pasas datos a mano entre la tienda, la caja y el CRM, pagas funciones que no usas y el comprador espera respuestas que podrían salir solas.

**Deficiente.** La tienda y la caja venden, pero sus datos no llegan a ningún sistema común.

- Los datos de los compradores viven en la plataforma de la tienda, en la caja o en hojas sueltas. `[1.2.D1]`

**Inicial.** La tienda está conectada a medias: parte de los datos se pasa a mano.

- Los pedidos de algún canal se cargan a mano en el sistema, o no se cargan. `[1.2.I101 · comprobable]`

**Funcional.** La tienda, la caja y el CRM están conectados, y lo básico que espera el comprador sale solo.

*Resultado:* Cada venta llega sola al sistema sin que nadie la pase a mano, y el comprador recibe la confirmación de su pedido y los avisos de su estado sin que alguien tenga que escribirle.

- Cada venta de la tienda en línea y de la caja entra sola al sistema como un pedido, con su monto, su canal y su cliente. `[1.2.F6]`
- El comprador y el equipo ven las existencias reales de cada producto antes de la compra. `[1.2.F8]`
- El comprador recibe sola la confirmación de su pedido y los avisos de cada cambio de estado. `[1.2.F101 · comprobable]`
- El catálogo —productos, precios y existencias— se administra en un solo lugar, y de ahí sale a todos los canales. `[1.2.F102 · comprobable]`

**Eficiente.**

*Resultado:* El equipo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué paso se cae la compra.

- Hay secuencias de varios pasos para el carrito y para después de la compra, que cambian según lo que hace el comprador —si abrió, hizo clic o compró—, y las conversaciones se asignan por múltiples condiciones, con control de quién ve y responde cada una. `[1.2.E2]`
- La tienda está integrada con el sistema de inventario y de facturación. `[1.2.E3]`

**Óptimo.** Agentes de IA atienden y venden en el canal conversacional, y la tienda se ajusta sola con lo que aprende de cada compra.

*Resultado:* La tienda vende a toda hora sin que el equipo tenga que estar: los agentes responden y cierran las compras simples, y el sistema ajusta lo que muestra con lo que aprende.

- Hay predicción de compra por cliente y respuestas sugeridas según el contexto de cada conversación. `[1.2.O1]`
- Agentes de IA atienden 24/7 en el canal conversacional: responden dudas de producto, ayudan a terminar la compra y le pasan a una persona, con el contexto, lo que no pueden resolver. `[1.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a la tienda y al CRM: por ejemplo, el valor esperado de cada cliente decide qué oferta ve. `[1.2.O3]`

*Se leen igual:* `1.2.D2`, `1.2.I1`, `1.2.I2`, `1.2.F2`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.E1`, `1.2.E4`, `1.2.E5`.

#### 1.3 Datos

¿Confías en tus números de ventas, conversión y clientes, o los validas antes de usarlos?

*Descripción:* Mide si los datos de la tienda son confiables para decidir: pedidos completos, clientes identificados y reportes sin reconstruir.

*Costo de quedarse:* Decides con números que no cuadran: la plataforma dice una cosa, la caja otra, y no sabes cuántos de tus compradores son los mismos.

**Deficiente.**

- No se sabe cuánto vende cada canal; sacar un reporte confiable es imposible. `[1.3.D2]`

**Inicial.**

- Hay dificultades para determinar de dónde llegó cada comprador. `[1.3.I2]`

**Funcional.** El reporte de ventas describe el estado actual con confianza, sin reconstrucción.

*Resultado:* El líder ve cuánto vendió cada canal cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada pedido y qué parte de sus compradores puede volver a contactar.

- Todo pedido tiene fecha, monto y canal poblados. `[1.3.F1]`
- Todo pedido tiene rastreable de dónde llegó el comprador. `[1.3.F3]`
- El reporte de ventas se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4]`
- La información del catálogo —fichas, precios y condiciones— no se deja envejecer. `[1.3.F7]`
- Se sabe qué parte de las ventas, en línea y en caja, queda asociada a un cliente identificado, y ese número se revisa. `[1.3.F8]`

**Eficiente.** Aparece el pronóstico de ventas, y los compradores dejan de ser anónimos.

*Resultado:* La empresa puede comprometer un número de ventas y planear sus existencias con confianza, y sabe quiénes son sus compradores.

- Hay un pronóstico de ventas con cadencia fija (semanal o quincenal) y precisión alta. `[1.3.E1]`
- La mayoría de las ventas quedan asociadas a un cliente identificado, no a un cliente genérico. `[1.3.E4]`
- Cada cliente tiene calculado cuánto compra, cada cuánto y cuándo fue su última compra. `[1.3.E101 · comprobable]`

**Óptimo.**

- Cada visita, cliente y pedido está enlazado en tiempo real. `[1.3.O1]`

*Se leen igual:* `1.3.D1`, `1.3.D3`, `1.3.D4`, `1.3.I1`, `1.3.I3`, `1.3.F2`, `1.3.F5`, `1.3.F6`, `1.3.E2`, `1.3.E3`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿Quién decide precios, promociones y prioridades de la tienda, con qué datos y con qué cadencia?

*Descripción:* Mide si alguien responde por la venta de la tienda, con metas por canal, datos y una revisión fija.

*Costo de quedarse:* Nadie responde por el número de la tienda: los precios y las promociones se deciden por costumbre, y los problemas aparecen cuando el mes ya cerró.

**Deficiente.**

- Quienes llevan la tienda operan sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1]`

**Funcional.**

*Resultado:* Cada persona sabe qué parte de la tienda le toca, y el líder sabe cada semana qué canal va bien y cuál necesita ayuda, antes de que termine el mes.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (ventas, pedidos, valor promedio del pedido, conversión, carritos abandonados) y lo consulta al menos semanalmente. `[1.4.F2]`
- En la revisión de ventas se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3]`
- Cada canal de venta tiene una meta clara, y su avance se reporta en cadencia fija. `[1.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva opera la tienda más rápido, y el líder se entera de los riesgos por una alerta y no al cierre del mes.

- El líder recibe alertas automáticas de las ventas de cada canal: una caída o una meta en riesgo. `[1.4.E101 · comprobable]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal y qué producto dejan más margen, y cuánto vale cada cliente en el tiempo.

- Las decisiones usan analítica avanzada (LTV, rentabilidad por canal y por producto). `[1.4.O1]`

*Se leen igual:* `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F5`, `1.4.E2`, `1.4.E3`, `1.4.E4`, `1.4.O2`.

#### 1.5 Catálogo y oferta

¿El comprador encuentra lo que busca y ve la misma oferta, igual de clara, en cada canal donde vendes?

*Descripción:* Mide si el catálogo está completo y ordenado, y si precios, promociones y condiciones coinciden en todos los canales.

*Costo de quedarse:* El comprador no encuentra lo que busca o ve un precio en la web y otro en la tienda: duda, compara y se va con quien se lo muestra más claro.

**Deficiente.** El comprador ve una tienda distinta según por dónde entre; las fichas están incompletas y cada una se armó a su manera.

- Lo que el comprador ve de un producto cambia según el canal por donde entre. `[1.5.D1]`
- Hay productos publicados sin foto, sin descripción o sin precio. `[1.5.D101 · comprobable]`

**Inicial.** Hay un intento de orden, pero las fichas y los precios todavía varían entre productos y entre canales.

- Las fichas de los productos más vendidos están completas; las del resto, a medias. `[1.5.I101 · comprobable]`

**Funcional.** El catálogo está completo, la oferta es la misma en todos los canales y el equipo sabe a quién le vende.

*Resultado:* El comprador encuentra cada producto con la misma ficha, el mismo precio y las mismas condiciones, entre por donde entre.

- Existe un documento con la definición del cliente ideal de la tienda —a quién le vende y qué busca—, consultable por cualquiera del equipo. `[1.5.F1]`
- Cada producto publicado tiene su ficha completa —fotos, descripción y precio— con una misma estructura. `[1.5.F101 · comprobable]`
- Las condiciones de compra —envío, cambios, devoluciones y garantía— están escritas y a la vista antes de pagar. `[1.5.F102 · comprobable]`

**Eficiente.** La tienda se ordena como compra el cliente y promete solo lo que entrega.

*Resultado:* El comprador reconoce la tienda por algo concreto, encuentra rápido lo que busca y recibe lo que la ficha le prometió.

- El catálogo está organizado como busca el cliente —categorías, filtros y buscador—, y se revisa con los datos de qué se busca y no se encuentra. `[1.5.E101 · comprobable · hábito]`
- Lo que promete la ficha es lo que llega: se mide cuántas devoluciones son por «no era lo que esperaba». `[1.5.E102 · comprobable · hábito · requiere 1.8.F101]`

**Óptimo.**

*Resultado:* La coherencia se mantiene sola con cualquier tamaño de catálogo: se pueden sumar productos y canales sin que la oferta se desordene.

- La IA mantiene fichas, precios y mensajes coherentes en todos los canales en tiempo real, sin trabajo manual. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.F2`, `1.5.F3`, `1.5.F4`, `1.5.F5`, `1.5.E2`, `1.5.E3`.

#### 1.6 Oferta por cliente

¿Cada comprador ve lo que le conviene a él, o todos ven la misma tienda?

*Descripción:* Mide si la tienda distingue a sus compradores y le ofrece a cada uno lo que le conviene.

*Costo de quedarse:* Le muestras lo mismo a quien compra cada mes que a quien entra por primera vez: el valor de cada pedido no sube y tus mejores clientes no se sienten distintos.

**Deficiente.** Todos los compradores ven la misma tienda y la misma oferta.

- La tienda no distingue a quien compra por primera vez de quien compra seguido. `[1.6.D101 · comprobable]`

**Inicial.** Se sabe quiénes son los mejores clientes, pero la tienda no hace nada distinto con ellos.

- La segmentación de compradores es rudimentaria y no hay datos para decidir a quién ofrecerle qué. `[1.6.I1]`
- El líder puede nombrar a sus mejores clientes, pero el sistema no tiene cómo separarlos. `[1.6.I2]`

**Funcional.** La tienda distingue a sus compradores y le sugiere a cada uno algo más que lo que vino a buscar.

*Resultado:* Quien compra por primera vez y quien compra seguido reciben ofertas distintas, y cada compra trae una sugerencia que tiene sentido.

- Los compradores se separan al menos en nuevos y recurrentes, y cada grupo recibe en la tienda una oferta distinta. `[1.6.F101 · comprobable · requiere 1.2.F6]`
- Al ver un producto o el carrito, el comprador recibe sugerencias de productos relacionados. `[1.6.F102 · comprobable]`

**Eficiente.** Las ofertas salen de la historia de compra, y los mejores clientes tienen un trato propio.

*Resultado:* Cada comprador ve ofertas que salen de lo que él compra, el valor promedio del pedido sube con la venta cruzada, y los mejores clientes lo notan.

- Las sugerencias y las ofertas salen de la historia de compra de cada cliente: qué compró, cuánto y cada cuánto. `[1.6.E101 · comprobable · requiere 1.3.E101]`
- Los mejores clientes están identificados y tienen un trato distinto: acceso anticipado, beneficios o atención preferente. `[1.6.E102 · comprobable · requiere 1.3.E101]`
- Se mide el valor promedio del pedido y cuánto de la venta viene de sugerencias, paquetes y venta cruzada. `[1.6.E103 · comprobable]`

**Óptimo.** La IA arma la tienda para cada comprador en tiempo real.

*Resultado:* Cada comprador ve una tienda pensada para él —qué productos, en qué orden y con qué oferta—, sin que nadie arme un segmento a mano.

- La IA decide qué mostrarle a cada comprador —productos, orden y oferta— en tiempo real, según su comportamiento. `[1.6.O101 · comprobable]`
- Las ofertas usan lo que saben Servicio y Marketing de cada cliente: sus reclamos, sus devoluciones y las campañas que ya recibió. `[1.6.O102 · comprobable]`

*No aplican:* `1.6.D1`.

*Se leen igual:* `1.6.F1`, `1.6.F2`, `1.6.F3`, `1.6.F4`, `1.6.E1`, `1.6.E2`, `1.6.E3`, `1.6.O1`, `1.6.O2`, `1.6.O3`, `1.6.O4`.

#### 1.7 Carrito y recompra

¿Qué pasa con quien no terminó de comprar, o con quien ya debería haber vuelto?

*Descripción:* Mide si la tienda recupera las compras que quedaron a medias y si le recuerda a cada cliente cuándo volver.

*Costo de quedarse:* Los carritos se abandonan en silencio y quien compró una vez no vuelve a saber de ti: pagas por traer compradores nuevos y pierdes los que ya tenías.

**Deficiente.** Nadie ve los carritos que se abandonan ni a los clientes que dejaron de comprar.

- Nadie se da cuenta de los carritos que se abandonan. `[1.7.D2]`
- Los carritos abandonados no quedan registrados. `[1.7.D3]`
- Quien compró no vuelve a recibir nada de la tienda, salvo promociones generales. `[1.7.D101 · comprobable]`

**Inicial.** Hay recordatorios, pero son los mismos para todos y salen por un solo canal.

- Todos los intentos de recuperar una compra se hacen por el mismo canal. `[1.7.I4]`
- Los recordatorios son genéricos: el mismo mensaje para cualquier carrito y cualquier cliente. `[1.7.I101 · evaluado]`

**Funcional.** Ningún carrito se abandona en silencio, y quien compró recibe una invitación a volver.

*Resultado:* Las compras que quedaron a medias se recuperan por más de un canal, y cada cliente recibe un recordatorio para volver a comprar, sin depender de que alguien se acuerde.

- Los carritos y los pedidos que quedaron a medias se reconocen a tiempo y reciben un recordatorio acordado, no uno improvisado. `[1.7.F1]`
- La recuperación usa al menos dos canales, por ejemplo correo y el canal conversacional, como WhatsApp. `[1.7.F2]`
- Después de cada compra, el cliente recibe de forma automática una invitación a volver: un recordatorio, una recomendación o un incentivo. `[1.7.F101 · comprobable · recompra · requiere 1.2.F6]`

**Eficiente.** El recordatorio llega cuando toca: cada producto tiene medido su momento de recompra.

*Resultado:* La tienda sabe cuándo le toca volver a cada cliente y se lo recuerda en ese momento, y mide cuánto recupera.

- La recuperación y la recompra están orquestadas en cadencias por varios canales —correo, canal conversacional, notificaciones y anuncios—. `[1.7.E1]`
- Cada producto que se acaba o caduca tiene medido cada cuánto se vuelve a comprar, y el recordatorio sale en ese momento. `[1.7.E101 · comprobable · recompra · requiere 1.3.E4]`
- Se mide cuántos carritos se recuperan y cuántos clientes vuelven a comprar, y con qué mensaje. `[1.7.E102 · comprobable]`

**Óptimo.** El sistema sabe cuándo le toca volver a cada cliente, y con qué oferta.

*Resultado:* Cada cliente recibe su recordatorio en el momento y por el canal en que más le sirve, sin que nadie lo programe.

- El sistema detecta dónde se traba una compra y responde en el momento: una ayuda, una oferta o el aviso a una persona. `[1.7.O1]`
- El canal y el momento de cada recordatorio se autoajustan según el comportamiento del comprador. `[1.7.O2]`
- La IA calcula cuándo le toca volver a comprar a cada cliente según su propio consumo, y ajusta la oferta. `[1.7.O101 · comprobable · recompra]`

*No aplican:* `1.7.D1`, `1.7.I1`, `1.7.I2`.

*Se leen igual:* `1.7.D4`, `1.7.I3`, `1.7.F3`, `1.7.F4`, `1.7.F5`, `1.7.E2`, `1.7.E3`, `1.7.E4`.

#### 1.8 Embudo de compra

¿Sabes en qué paso se cae la compra, y lo corriges?

*Descripción:* Mide si la tienda sabe en qué paso se abandona la compra y si usa eso para probar y mejorar.

*Costo de quedarse:* Pierdes compras en el mismo paso una y otra vez, porque nadie mira dónde se abandona ni por qué se devuelve.

**Deficiente.** Nadie mira dónde se cae la compra ni por qué se devuelve.

- Las razones por las que el comprador no termina o devuelve se pierden. `[1.8.D2]`

**Inicial.** Se comenta de vez en cuando por qué no se vende, sin números.

**Funcional.**

*Resultado:* El líder sabe en qué paso se abandona la compra y por qué se cancelan o se devuelven los pedidos, con datos del trimestre y no con impresiones.

- Toda compra abandonada queda con el paso donde se abandonó. `[1.8.F1]`
- Los pasos de la compra y los motivos de cancelación y devolución usan una lista definida, no texto libre. `[1.8.F2]`
- El líder puede sacar un reporte del trimestre de dónde se abandona la compra, sin reconstruir. `[1.8.F3]`
- Cada pedido cancelado o devuelto deja registrada su razón. `[1.8.F101 · comprobable]`

**Eficiente.** El embudo se revisa con cadencia y la tienda prueba cambios para mejorarlo.

*Resultado:* Los mismos abandonos dejan de repetirse: lo que se aprende de cada compra que se cae, y de las que sí se concretan, vuelve a la tienda como un cambio probado.

- Se revisan periódicamente las compras que se concretan y las que no —abandonos, cancelaciones y devoluciones— para identificar patrones. `[1.8.E1]`
- La tienda —fichas, precios y pasos del pago— se ajusta con base en lo aprendido. `[1.8.E2]`
- Hay pruebas regulares en la tienda, al menos una activa por mes: una ficha, un precio o un paso del pago. `[1.8.E101 · comprobable · hábito]`

**Óptimo.** La IA detecta dónde se cae la compra y propone el cambio.

*Resultado:* La tienda mejora mientras vende: el sistema señala dónde se cae la compra y qué cambio probar, y la estrategia se ajusta con esa evidencia.

- La IA detecta dónde y por qué se abandona la compra, y propone o aplica el cambio. `[1.8.O101 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.I1`, `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`.

### Área 2 — Marketing

Mide el rendimiento del marketing de la tienda: cómo está montado por dentro y qué produce en visitas, compradores nuevos y ventas de cada campaña.

**Deficiente.** Lo que la gente piensa de tu tienda no lo decides tú. Cada pieza sale con otro tono y otra imagen, las herramientas no se hablan entre sí, y la pauta corre hasta que se acaba el presupuesto sin que nadie mida cuánto vendió. Los compradores que llegan, llegan por casualidad.

**Inicial.** Tienes logo, colores y redes, pero ningún plan detrás. Pagas herramientas que se usan a medias y cada una por su lado, las promociones se anuncian cuando alguien se acuerda, y sabes cómo le fue a una campaña solo cuando ya terminó. Las ventas que trae el marketing suben y bajan, y no sabes de dónde viene cada comprador.

**Funcional.** Tu marketing ya no depende de una persona. Tienes por escrito tu marca y tus perfiles de comprador, las herramientas que pagas se usan de verdad, y cada promoción del calendario sale coordinada por correo, pauta, redes y WhatsApp, sabiendo cuánto te cuesta cada venta en cada canal. Los reportes salen del sistema, sin armarlos a mano. Las ventas que trae el marketing son previsibles, aunque todavía no se afinan con pruebas.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la próxima temporada. Sabes cuánto vendió cada canal y cada campaña, no solo cuál trajo el primer clic; las campañas se adaptan solas a cada segmento; la IA asiste a tu equipo en su trabajo diario, y la tienda aparece cuando alguien busca lo que vendes, también en los asistentes de IA. La pauta se mueve hacia donde más vende, y tus reseñas juegan a tu favor.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido se genera y se afina en ciclo continuo, cada comprador recibe el mensaje que corresponde a lo que hizo antes, la pauta se reparte sola entre canales mientras la campaña corre, y los compradores contentos traen compradores nuevos. El equipo decide la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

Si mañana se va quien arma las campañas, ¿las promociones y los lanzamientos siguen saliendo igual?

*Descripción:* Mide si las campañas de la tienda salen de un calendario y un proceso compartidos, sin depender de nadie.

*Costo de quedarse:* Cada promoción depende de quien la arma: si esa persona falta, la campaña de la temporada sale tarde o no sale.

**Deficiente.** Cada quien arma las campañas a su criterio; no hay calendario ni reuniones.

- No hay calendario de campañas: las piezas de cada promoción se improvisan a última hora. `[2.1.D1]`

**Inicial.**

- Las indicaciones de cada pieza se dan de palabra, y el calendario de campañas se llena a medias. `[2.1.I1]`

**Funcional.**

*Resultado:* Las promociones y los lanzamientos siguen saliendo aunque cambie una persona: el calendario de campañas y el proceso no viven en la cabeza de nadie, todo el equipo trabaja en el mismo sistema y el líder sabe en qué va cada campaña sin tener que preguntar.

- Existe un calendario de campañas visible para el equipo —qué pieza sale, por qué canal y en qué fecha—, con horizonte de al menos un trimestre. `[2.1.F1]`
- Existe un proceso documentado para armar cada campaña —qué se pide, quién la produce, cómo se publica y cómo se cierra— que el equipo aplica de forma consistente. `[2.1.F2]`
- Hay una reunión de resultados de las campañas con cadencia fija (semanal o quincenal) que se sostiene. `[2.1.F3]`

**Eficiente.**

- Existe un proceso de aprobación antes de publicar cada pieza —un correo, un anuncio, una publicación—: alguien la revisa y la aprueba, y queda guardada su versión. `[2.1.E2]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I2`, `2.1.I3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Cuánto del marketing de la tienda sale solo, y cuánto de las herramientas que pagas se está aprovechando?

*Descripción:* Mide cuánto del marketing de la tienda hacen los flujos automáticos y cuánto se aprovechan las herramientas contratadas.

*Costo de quedarse:* Haces a mano los envíos que podrían salir solos y pagas herramientas que no usas, mientras quien te escribe por WhatsApp espera respuesta.

**Deficiente.**

- Las listas para las campañas —suscriptores, compradores— se arman en hojas de cálculo. `[2.2.D1]`
- No hay un sistema central de marketing: cada canal se maneja en su propia herramienta. `[2.2.D2]`

**Inicial.**

- La tienda paga herramientas de marketing —de correo, de mensajería o de anuncios— cuyas funciones casi no usa. `[2.2.I1]`
- Las herramientas de marketing no están conectadas con la tienda ni entre sí. `[2.2.I2]`
- Las automatizaciones son elementales, como un correo de bienvenida; la IA se usa a prueba, de vez en cuando. `[2.2.I3]`

**Funcional.**

*Resultado:* Todo lo que entra por la tienda en línea y por WhatsApp llega al sistema y recibe respuesta, y los anuncios de producto salen del catálogo de la tienda y se miden por lo que venden.

- Los puntos de captura de la tienda en línea —la suscripción al boletín, la ventana con un descuento de bienvenida, el aviso de disponibilidad— están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Hay al menos un canal conversacional conectado —WhatsApp, el chat de la tienda o los mensajes de Instagram— con una bandeja básica donde el equipo atiende lo que entra. `[2.2.F4]`
- Quien se suscribe o deja sus datos en la tienda recibe una respuesta automática —la bienvenida o el cupón prometido—, y el sistema avisa a quien corresponde. `[2.2.F5]`
- Si el equipo usa IA, esta tiene como contexto la voz de la tienda y sus perfiles de comprador. `[2.2.F9]`
- Si la tienda hace anuncios de producto —en Google Shopping o con el catálogo de Meta—, se alimentan solos del catálogo de la tienda, sin cargas a mano. `[2.2.F101 · comprobable]`
- Si la tienda vende en línea y hace pauta, sus compras vuelven solas a las plataformas de anuncios, para que la pauta se mida y se optimice por ventas y no por clics. `[2.2.F102 · comprobable]`

**Eficiente.**

*Resultado:* Quien se suscribe recibe una bienvenida que avanza sola hasta que compra, las conversaciones que abre cada promoción no dependen de que alguien se acuerde de contestar, y el líder ve en tiempo real cuáles esperan respuesta.

- Hay secuencias de varios pasos, con ramificación y tiempos de espera, para quien se suscribió y todavía no compra: la bienvenida cambia según lo que abre y en qué hace clic. `[2.2.E1]`
- Las campañas por el canal conversacional —una promoción o un lanzamiento por WhatsApp— están automatizadas, con segmentación y con ramificación según la interacción: si la persona leyó, hizo clic o respondió. `[2.2.E2]`
- El traspaso de leads a los vendedores está automatizado. `[2.2.E3]`
- Varios canales conversacionales —por ejemplo WhatsApp, el chat de la tienda y los mensajes de Instagram— llegan a una sola bandeja. `[2.2.E4]`
- Las páginas de cada campaña —la de una promoción o la de una temporada— se publican desde la misma plataforma de la tienda, no desde herramientas sueltas. `[2.2.E5]`
- El equipo usa la IA en su trabajo diario —para redactar correos y anuncios, adaptar una pieza a cada canal o resumir cómo le fue a una promoción—, y la IA trabaja con el contexto del área: los perfiles de comprador, los segmentos y la voz de la tienda. `[2.2.E6]`

**Óptimo.**

*Resultado:* Cada persona vive un recorrido pensado para ella: la IA decide el siguiente mensaje y conversa en el momento, con lo que la tienda sabe de cada cliente.

- Agentes de IA atienden el canal conversacional: responden a quien contesta una campaña y mantienen la conversación con quien todavía no está listo para comprar. `[2.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a las herramientas de marketing: las audiencias de los correos y de la pauta usan, por ejemplo, cuánto vale cada cliente en el tiempo, calculado afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D3`, `2.2.F2`, `2.2.E7`, `2.2.O1`.

#### 2.3 Datos

¿Sabes qué canal te trae compradores y cuánto compran, o mueves el presupuesto a ojo?

*Descripción:* Mide si los datos dicen qué canal trae compradores, cuánto compran y si aceptaron que les escribas.

*Costo de quedarse:* No sabes qué canal trae ventas y cuál solo gasta: mueves la pauta a ciegas y le escribes a gente que no te dio permiso.

**Deficiente.**

- No se registra de dónde llega cada suscriptor o comprador: si de la pauta, de las redes o de un correo. `[2.3.D1]`

**Inicial.**

- Hay primeras conexiones: la tienda en línea le pasa al CRM sus suscriptores o sus compradores. `[2.3.I1]`

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada suscriptor y cada comprador, con reportes que salen del sistema y no de una planilla armada a mano.

- Todo contacto nuevo —entre por una suscripción, un formulario, una conversación o una compra— tiene poblados la etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los datos que describen al cliente ideal de la tienda —lo que define a cada segmento, como su zona o las categorías que le interesan— están en los formularios críticos y se capturan en la mayoría de los registros. `[2.3.F2]`
- Los duplicados —el mismo comprador registrado dos veces, con otro correo o como invitado— están bajo control, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —visitas, conversión a compra y de dónde llega cada comprador— salen del sistema sin reconstrucción manual. `[2.3.F5]`
- El contexto que el área documentó —los perfiles de comprador, los segmentos y la voz de la tienda— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6]`
- Cuando la tienda pide un correo o un teléfono —al suscribirse o al comprar—, pregunta si la persona acepta que la tienda le escriba por ese canal —correo, SMS o WhatsApp—, y su respuesta queda registrada. `[2.3.F7]`

**Eficiente.** Los datos están unificados y atribuidos: se sabe cuánto vende cada canal.

*Resultado:* Marketing puede demostrar cuánto vendió cada canal y cada campaña, no solo cuál trajo el primer clic.

- La atribución reparte el mérito de cada venta entre todos los puntos de contacto, no solo el primero o el último, y en todos los canales, también el conversacional: se sabe cuánto vende cada uno —la pauta, el correo, las redes, WhatsApp—. `[2.3.E2]`
- La deduplicación es automática: el sistema fusiona por reglas los registros del mismo comprador. `[2.3.E3]`

**Óptimo.**

*Resultado:* La atribución cruza todos los canales de venta que tenga la tienda, no solo lo que ve Marketing, y los datos se mantienen confiables sin que el equipo tenga que cuidarlos.

- Marketing se apoya en el almacén central de datos de la empresa —donde se juntan los canales de venta que tenga la tienda y las herramientas de marketing— y atribuye las ventas con esa vista completa. `[2.3.O1]`
- Los datos de cada comprador se completan solos, con IA: por ejemplo, las categorías que le interesan o su talla. `[2.3.O3]`

*Se leen igual:* `2.3.D2`, `2.3.I2`, `2.3.E1`, `2.3.O4`.

#### 2.4 Equipo y Gobierno

¿Quién decide qué campañas salen, cuánto se invierte en pauta y en qué canal, con qué datos y con qué cadencia?

*Descripción:* Mide quién decide qué campañas salen y dónde va la pauta, con qué datos y con qué cadencia.

*Costo de quedarse:* Las campañas se deciden por costumbre o por quien insiste más, y nadie puede demostrar si la pauta se paga sola.

**Deficiente.**

- El marketing de la tienda lo hace una agencia, o una sola persona que además atiende los pedidos, la tienda y las redes. `[2.4.D1]`

**Inicial.**

- Las decisiones del día a día —subir un anuncio, cambiar una pieza— esperan al dueño o a la gerencia. `[2.4.I1]`

**Funcional.**

*Resultado:* El equipo sabe qué se espera de cada uno, las decisiones de pauta se defienden con números y no con opiniones, y la dirección recibe cada mes cómo le fue al marketing de la tienda sin tener que pedirlo.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (suscriptores nuevos, visitas por canal, conversión a compra, costo por venta) y lo consulta al menos semanalmente. `[2.4.F2]`
- El equipo tiene metas mensuales o trimestrales, y en la reunión de resultados de las campañas rinde cuentas por ellas. `[2.4.F3]`
- Las decisiones de pauta y de qué promoción empujar citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva se integra rápido, y Marketing, Ventas y Servicio preparan juntos cada promoción en vez de enterarse cuando ya salió.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo orquesta con Ventas —el calendario de promociones, una cadencia conjunta y, donde hay vendedores, el traspaso de leads y sus tiempos— y con Servicio, por ejemplo para que sepa qué promoción viene. `[2.4.E3]`

**Óptimo.**

*Resultado:* La dirección sabe cuánto dejan en el tiempo los compradores que trae cada canal frente a lo que cuesta traerlos, y decide dónde invertir con esa cuenta, con un equipo capaz de sostener la IA.

- Las decisiones usan analítica avanzada, como lo que deja cada canal de adquisición —cuánto compran en el tiempo los clientes que trae, no solo su primera compra— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

#### 2.5 Marca y Presencia

¿Quien busca lo que vendes te encuentra, te reconoce y confía en ti?

*Descripción:* Mide si quien busca lo que vendes encuentra la tienda, la reconoce y confía en ella por sus reseñas.

*Costo de quedarse:* Quien busca lo que vendes encuentra primero a otro, o te encuentra y no te distingue de las demás tiendas.

**Deficiente.**

- No hay una guía de cómo se ve y cómo habla la tienda, ni una historia que la explique: cada pieza sale con su propio estilo. `[2.5.D1]`
- No están identificados los perfiles de comprador: quién compra en la tienda y por qué. `[2.5.D2]`
- La tienda no aparece en los buscadores cuando alguien busca lo que vende, o aparece por casualidad. `[2.5.D3]`

**Inicial.**

- Hay logo, colores y plantillas, pero el perfil de comprador es muy general: «gente que compra en línea». `[2.5.I1]`
- La tienda en línea tiene meta tags simples y un contenido que apenas cumple. `[2.5.I2]`

**Funcional.**

*Resultado:* La tienda se ve y suena igual en todo lo que publica, y quien la busca la encuentra en los buscadores y, si tiene locales, en los mapas, con lo básico bien resuelto.

- Existe una guía corta de la voz de la tienda —cómo habla en sus correos, sus anuncios y sus publicaciones—, escrita y aplicada a piezas recientes. `[2.5.F2]`
- Hay 2 o 3 perfiles de comprador escritos, cada uno con su recorrido básico por etapa: cómo descubre la tienda, cómo compara y qué lo hace comprar. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: guías de compra, ideas de uso o de regalo, videos o el formato que use la tienda. `[2.5.F5]`
- Si la tienda tiene locales, cada uno aparece en los mapas y en los buscadores con su información completa: dirección, horario, teléfono y fotos. `[2.5.F101 · comprobable]`

**Eficiente.**

*Resultado:* La tienda aparece cuando alguien busca lo que vende, en los buscadores y en los asistentes de IA, con contenido pensado para cada tipo de comprador que importa, y sus reseñas juegan a su favor.

- Los perfiles de comprador están detallados para los segmentos de más valor para la tienda. `[2.5.E1]`
- El contenido está organizado por temas: una página central por tema —por ejemplo, una guía para elegir un producto— y contenido de apoyo que la refuerza. `[2.5.E2]`
- El AEO está implementado para que la tienda y sus productos aparezcan en las respuestas de los asistentes de IA, con resultados medibles. `[2.5.E3]`
- El recorrido del comprador está mapeado con sus puntos de contacto definidos: dónde conoce la tienda, dónde compara, dónde compra y qué recibe después. `[2.5.E4]`
- Las reseñas y calificaciones públicas —de los productos, en Google y en los marketplaces— se piden a los clientes satisfechos y se responden con una cadencia fija. `[2.5.E5]`

**Óptimo.**

- Los perfiles de comprador están tan segmentados que se acercan a cada cliente individual. `[2.5.O1]`
- La IA produce y optimiza el contenido de la tienda de forma continua —guías, publicaciones y textos para los buscadores y los asistentes de IA—, y el equipo valida lo que se publica. `[2.5.O2]`

*Se leen igual:* `2.5.I3`, `2.5.F1`, `2.5.F4`.

#### 2.6 Segmentación

¿Cada grupo de compradores recibe campañas pensadas para él, o todos reciben la misma promoción?

*Descripción:* Mide si cada grupo de compradores recibe campañas pensadas para él, o si todos reciben la misma promoción.

*Costo de quedarse:* Le mandas la misma promoción a todos: el mensaje no le habla a ningún grupo, y cada envío cansa a quien no le interesa.

**Deficiente.**

- No hay segmentos: cada promoción sale a toda la base con el mismo mensaje. `[2.6.D1]`

**Inicial.**

- Se segmenta apenas por zona, edad o género. `[2.6.I1]`

**Funcional.** Hay segmentos de compradores definidos y piezas adaptadas a mano para cada uno.

*Resultado:* Cada grupo de compradores recibe promociones y mensajes pensados para él, en vez de la misma pieza para toda la base.

- Existen al menos 2 segmentos de compradores definidos con criterios escritos, por ejemplo por categoría de interés o por zona. `[2.6.F1]`
- Las campañas recientes salieron con piezas distintas para cada segmento: otro producto, otra imagen u otro mensaje. `[2.6.F3]`

**Eficiente.** La segmentación y el puntaje de cada suscriptor se automatizan.

*Resultado:* El mensaje se adapta solo a quién lo recibe y a lo que hizo antes, y quien está más cerca de comprar recibe primero el empujón que le falta.

- Las secuencias de bienvenida y de nutrición cambian según el segmento o la etapa del recorrido de cada persona. `[2.6.E1]`
- El contenido de las campañas se adapta solo a cada segmento: por ejemplo, el mismo correo muestra otros productos según quién lo recibe. `[2.6.E2]`
- Hay un puntaje por reglas de qué tan cerca de comprar está cada suscriptor: suma puntos por varios atributos —lo que abre, lo que mira, cuántas veces vuelve a la tienda— y, al pasar un umbral, dispara la secuencia de nutrición que le corresponde. No basta con una regla sobre un solo dato. `[2.6.E3]`
- La segmentación usa lo que hace cada persona —qué correos abrió, qué miró en la tienda, qué compró y hace cuánto—, no solo lo que declaró. `[2.6.E4]`

**Óptimo.**

*Resultado:* Cada comprador recibe los mensajes y ve el contenido que le corresponde según lo que hizo antes, sin que nadie arme un segmento para él.

- La IA identifica micro-segmentos y comportamientos de compra: por ejemplo, quien solo compra con descuento o quien compra para regalar. `[2.6.O1]`
- Hay personalización uno a uno: lo que ve cada persona en los mensajes y en las páginas de campaña de la tienda en línea cambia en tiempo real según lo que hizo antes. `[2.6.O3]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F4`.

#### 2.7 Canales y Alcance

¿Llegas a compradores nuevos y a los que ya tienes, con un costo por venta que conoces?

*Descripción:* Mide si los canales traen compradores con cadencia, bajo un mismo plan y con un costo por venta conocido.

*Costo de quedarse:* Tu alcance depende de la última promoción: los canales salen sueltos y no sabes cuánto te cuesta cada venta.

**Deficiente.**

- No hay un plan de canales: cada promoción sale por donde se pueda. `[2.7.D2]`

**Inicial.**

- La pauta son publicaciones impulsadas o campañas sueltas, sin optimizarlas; los correos salen de vez en cuando. `[2.7.I2]`

**Funcional.**

*Resultado:* Cada promoción sale coordinada por correo, pauta, redes y WhatsApp en vez de cuatro esfuerzos sueltos, y el líder sabe cuánto le cuesta cada venta según el canal que la trajo.

- Los correos a la base de suscriptores y clientes salen con cadencia regular (al menos mensual), y se cumple. `[2.7.F1]`
- Hay al menos una red social —Instagram, TikTok o Facebook— gestionada y calendarizada, con publicaciones recurrentes. `[2.7.F2]`
- Hay al menos una campaña de pauta corriendo con presupuesto definido: en Google, en Meta, en el marketplace donde vende la tienda o en el canal que le corresponda. `[2.7.F3]`
- WhatsApp u otro canal conversacional se usa para salir con cadencia definida —lanzamientos, promociones, novedades—, no solo para responder lo que entra. `[2.7.F4]`
- Los cuatro canales siguen el mismo calendario y la misma campaña: una promoción —el Black Friday, el Día de la Madre— sale coordinada en correo, pauta, redes y WhatsApp, no como cuatro esfuerzos sueltos. `[2.7.F5]`
- El líder puede decir cuánto costó cada venta el último mes —o cada lead, donde vende un equipo—, al menos por canal. `[2.7.F6]`

**Eficiente.**

*Resultado:* La pauta se mueve hacia el canal que más vende, los canales se refuerzan entre sí en vez de competir por el mismo comprador, y los clientes y los creadores traen compradores que se pueden contar.

- Los canales, incluido el conversacional, comparten datos y se alimentan entre sí: una campaña que empieza en la pauta sigue en el correo, hay remarketing activo y las audiencias de la pauta se arman desde el CRM, por ejemplo para no mostrarle un anuncio de captación a quien ya compró. `[2.7.E1]`
- Hay eventos como canal recurrente: lanzamientos en la tienda, ventas en vivo por las redes o talleres. `[2.7.E2]`
- La pauta se reparte y se ajusta con frecuencia según las ventas que deja cada canal y cada campaña. `[2.7.E3]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar la tienda —con su enlace o su código—, y cada comprador nuevo que llega referido queda registrado con quién lo trajo. `[2.7.E4]`
- Hay un programa de creadores o influencers activo, con colaboraciones recurrentes: cada uno tiene su código o su enlace, y cada venta que trae queda registrada con quién la trajo. `[2.7.E101 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La pauta se reparte sola donde más vende, los compradores contentos traen compradores nuevos, y la tienda llega antes que su competencia a los canales nuevos.

- Los canales nuevos —una red que empieza a vender, un marketplace nuevo, comunidades o formatos nuevos— se prueban en ciclos cortos. `[2.7.O1]`
- La IA reasigna sola la pauta entre canales mientras las campañas corren, para sacarle el mayor retorno a lo invertido. `[2.7.O2]`
- Los compradores que Servicio identifica como promotores se vuelven un canal de referidos y de contenido —sus fotos y videos con el producto—, sin pedírselo a mano. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`.

#### 2.8 Medición y Aprendizaje

¿Cada campaña te enseña qué vende, o repites la promoción del año pasado?

*Descripción:* Mide si cada campaña se evalúa por las ventas que dejó y si deja un aprendizaje para la siguiente.

*Costo de quedarse:* Repites la campaña del año pasado sin saber qué parte funcionó: los mismos errores vuelven en cada temporada.

**Deficiente.** Las campañas corren hasta agotar el presupuesto, sin medir cuánto vendieron ni aprender de ellas.

- La pauta de una promoción se deja correr hasta que se acaba el presupuesto, sin revisarla en el camino. `[2.8.D1]`
- No se mide cuánto vendió cada campaña frente a lo que costó. `[2.8.D2]`
- Cada temporada se arma desde cero, sin mirar lo que dejó la anterior. `[2.8.D3]`

**Inicial.**

- Se miran los clics y los «me gusta», pero no cuánto cuesta conseguir cada comprador. `[2.8.I1]`

**Funcional.**

*Resultado:* El equipo ve cuánto vendió cada campaña sin armar el número a mano, y cada temporada deja una lección escrita para la siguiente.

- Cada campaña significativa —una temporada alta, un lanzamiento— tiene una revisión de cierre documentada: qué canales, piezas y audiencias funcionaron y cuáles no. `[2.8.F3]`
- Los resultados de cada campaña —las ventas que trajo o los leads que pasó a un vendedor, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.** Se prueba con regularidad y se ajusta con los datos.

*Resultado:* El equipo sabe qué piezas y audiencias venden porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma la próxima temporada.

- Hay pruebas A/B regulares en las campañas —un asunto de correo, una imagen, una audiencia—, al menos una activa por mes. `[2.8.E1]`
- Hay un proceso formal para decidir, con los resultados de campañas y temporadas anteriores, qué piezas y audiencias funcionan. `[2.8.E2]`
- El proceso de campaña y el plan de las próximas campañas y temporadas se ajustan con lo aprendido. `[2.8.E3]`

**Óptimo.**

*Resultado:* Las campañas mejoran mientras están corriendo, no cuando la temporada ya pasó.

- La IA aplica lo aprendido mientras la campaña corre: cambia las piezas, las audiencias o el mensaje según lo que vende. `[2.8.O2]`

*Se leen igual:* `2.8.I2`.

### Área 3 — Servicio

Mide el rendimiento de la posventa de la tienda, que cubre todo lo que pasa después del pago: desde el seguimiento del pedido y cada consulta, cambio o devolución, hasta que el comprador queda conforme con lo que compró. Mira cómo está montada por dentro y qué produce hacia el comprador.

**Deficiente.** Tu posventa se improvisa pedido por pedido. Cada quien resuelve un cambio o una devolución a su manera, las consultas llegan por correo, WhatsApp y redes sin un lugar común, y todo depende de que la persona que sabe esté disponible. Te enteras de que un comprador quedó mal cuando ya lo contó en público.

**Inicial.** Una sola persona sabe cómo se resuelve cada caso, y si falta, la posventa se traba. Hay un sistema para los casos, pero parte del equipo sigue atendiendo desde su teléfono; hay respuestas guardadas para lo más frecuente y una forma de resolver los cambios que nadie escribió. La posventa es frágil.

**Funcional.** Tu posventa es consistente y ya no depende de una persona. Sabes qué tipos de cliente atiendes y qué espera cada uno. Cada consulta, cambio o devolución sigue el mismo recorrido en un solo sistema, ligada a su pedido y con su tipo y su motivo, y se resuelve igual lo atienda quien lo atienda. Lo urgente va primero, tienes respuestas guardadas para lo repetitivo y detectas a mano los atrasos antes de que el comprador reclame. Todavía no hay alertas automáticas, pero ya no esperas a que el comprador se queje.

**Eficiente.** Tu posventa empieza a adelantarse al problema. Los plazos de atención se vigilan solos, el comprador puede iniciar un cambio sin escribirle a nadie y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción, y la posventa y la venta ven los mismos datos de cada comprador. Ninguna molestia se pierde entre la posventa, la bodega y el despacho, y quien tuvo un problema recibe algo para recuperarlo. Dejas de perder compradores por un mal momento que nadie vio.

**Óptimo.** Un agente de IA resuelve las consultas de los compradores —dónde está un pedido, cómo hacer un cambio— y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas de la posventa corren solas mientras el equipo supervisa y gestiona las excepciones; muchos problemas con un pedido se resuelven antes de que el comprador los note, y cada comprador se atiende sabiendo qué le prometió la tienda y recibe detalles pensados para deleitarlo. Atender un pedido más casi no cuesta.

#### 3.1 Procesos y Rutinas

Si mañana falta quien más sabe de cambios y devoluciones, ¿la atención se mantiene?

*Descripción:* Mide si las consultas, los cambios y las devoluciones siguen un proceso definido, sin depender de quién atiende.

*Costo de quedarse:* Un cambio o una devolución se resuelve distinto según quién atienda: el comprador no sabe a qué atenerse y reclama en público.

**Deficiente.**

- Cada quien resuelve los cambios, las devoluciones y los reclamos a su manera. `[3.1.D1]`
- No hay rutinas ni traspasos definidos —con la bodega, con quien despacha—; la posventa es 100% reactiva. `[3.1.D2]`

**Inicial.**

- Hay un plazo de respuesta conocido —«te contestamos en un día hábil»—, pero nadie lo mide. `[3.1.I1]`
- Unos atienden en el sistema; otros responden desde el WhatsApp de su teléfono o desde la cuenta de la tienda en las redes, por fuera. `[3.1.I3]`

**Funcional.** El equipo atiende en un mismo sistema, con el recorrido de los casos configurado y alguien que responde por cada comprador.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada comprador tiene a alguien que responde por él, y un cambio o una devolución sigue los mismos pasos sin importar quién lo tome.

- El recorrido de los casos de posventa está configurado con sus etapas —por ejemplo, recibido, en revisión, esperando el producto devuelto y resuelto— y cubre la atención de la recepción al cierre. `[3.1.F1]`
- Cada comprador tiene quién responda por él —una persona o, si son muchos, un equipo con un seguimiento automático— y un seguimiento mínimo más allá de los casos que abre, como confirmar que su pedido llegó bien. `[3.1.F2]`
- Existe un proceso básico documentado para los reclamos críticos —un pedido que no llegó, un producto dañado, un reclamo público— y para escalarlos. `[3.1.F4]`
- Cualquiera del equipo explica igual cómo se atiende un cambio o una devolución, paso a paso. `[3.1.F5]`
- Cualquiera del equipo atiende en el sistema central, no desde su teléfono ni desde la aplicación de cada red: es su herramienta de trabajo, no algo que se llena después de resolver por otro lado. `[3.1.F6]`

**Eficiente.** Aparecen los plazos de atención, las guías de acción y el recorrido del comprador, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El comprador sabe cuánto va a tardar la respuesta a su caso, cada momento después de su compra tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay plazos de respuesta y de resolución definidos por tipo de caso —una consulta, un cambio, una devolución, un reclamo— o por prioridad. `[3.1.E1]`
- Hay guías de acción para prevenir problemas —un atraso, un producto que se agotó después de pagado—, para recuperar a un comprador que quedó mal y para ofrecerle algo más a quien quedó contento. `[3.1.E3]`
- El recorrido del comprador después de pagar está definido de punta a punta —la confirmación, la espera, la entrega, el uso y, si la hay, la próxima compra—, con un responsable y un estándar para cada momento. `[3.1.E4]`

**Óptimo.**

- Muchas rutinas de la posventa corren solas —generar la guía de devolución, avisarle a la bodega, emitir el reembolso—; el equipo supervisa, entrena la IA y gestiona las excepciones. `[3.1.O1]`

*Se leen igual:* `3.1.I2`, `3.1.F3`, `3.1.E5`, `3.1.O3`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cuánto del trabajo de la posventa hace el sistema —repartir los casos, avisar, escalar—, y cuánto de lo que pagas se aprovecha?

*Descripción:* Mide si los canales de atención llegan al sistema y cuánto del trabajo repetitivo de la posventa sale solo.

*Costo de quedarse:* Los casos se pierden entre el correo, WhatsApp y las redes, y alguien tiene que repartirlos y perseguirlos a mano: el comprador insiste para que lo atiendan.

**Deficiente.**

- Los casos se atienden desde el celular o el correo personal de cada quien. `[3.2.D2]`

**Inicial.** Hay un sistema para los casos, con automatización mínima y herramientas sin conectar.

- Hay respuestas automáticas de recepción, sin IA; la tienda, el correo y WhatsApp no están conectados entre sí. `[3.2.I2]`

**Funcional.**

*Resultado:* Lo que entra por los canales conectados —WhatsApp, el chat o el correo— llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio del caso.

- Hay al menos un canal conversacional —WhatsApp, el chat de la tienda o los mensajes de las redes— conectado a una bandeja básica donde el equipo atiende lo que entra. `[3.2.F4]`
- Al entrar un caso, el sistema lo asigna solo según una regla simple —por ejemplo, por tipo: consulta, cambio o devolución—, y los avisos de cada cambio de estado del caso llegan a quien los necesita. `[3.2.F5]`
- Si hay un chatbot, resuelve las consultas frecuentes —horarios, costos de envío, cómo pedir un cambio— con un árbol de decisión. `[3.2.F6]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos urgentes llegan solos a quien los tiene que resolver; el comprador puede ver sus casos e iniciar un cambio o una devolución sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de los plazos —alertas antes de que venzan y escalación automática, con reglas de cuándo se escala y a quién—, y los casos y las conversaciones se reparten por varias condiciones, como el tipo de caso, el canal o el marketplace de donde vienen. `[3.2.E1]`
- Hay un portal de autoservicio donde el comprador ve sus casos y abre uno nuevo —por ejemplo, inicia un cambio o una devolución sin escribirle a nadie—, y hay base de conocimiento interna y pública. `[3.2.E2]`
- Los canales de atención —correo, WhatsApp, chat, redes y los mensajes de los marketplaces— llegan a una sola bandeja. `[3.2.E3]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir un caso o buscar en la política de cambios—, y la IA trabaja con el contexto del área: los tipos de cliente, los niveles de atención y las respuestas a las consultas frecuentes. `[3.2.E4]`

**Óptimo.**

*Resultado:* Buena parte de las consultas se resuelve sin una persona, y cuando un caso pasa a alguien del equipo, llega con el pedido, la conversación y lo que la tienda sabe de ese comprador a la vista.

- Hay un agente de IA en producción que resuelve consultas en todos los canales sin intervención humana —dónde está un pedido, cómo hacer un cambio— y le pasa a una persona, con el contexto completo, lo que no puede resolver; hay automatización de flujos de trabajo. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de atención: quien atiende ve en la ficha del comprador, por ejemplo, cuánto vale en el tiempo o si está por dejar de comprar. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.F8`, `3.2.E5`.

#### 3.3 Datos

¿Quien atiende ve qué compró el cliente y en qué va su pedido, o tiene que preguntárselo?

*Descripción:* Mide si quien atiende ve al instante las compras, los pedidos en curso y los casos anteriores del cliente.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que dar su número de pedido y volver a explicar todo, porque nadie ve su historia.

**Deficiente.**

- Es imposible reconstruir qué pasó con un comprador: qué pidió, qué le llegó y qué reclamó. `[3.3.D2]`

**Funcional.** La historia del comprador y el pedido de cada caso están a la vista, con los casos clasificados.

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cualquiera del equipo ve en segundos la historia del comprador y en qué va el pedido del que habla.

- Cualquiera del equipo ve el historial de casos de un comprador en menos de 10 segundos. `[3.3.F1]`
- La ficha del comprador muestra sus pedidos, lo que ha pagado y su valor para la tienda, no solo sus casos. `[3.3.F2]`
- Los datos clave del comprador —qué compró y desde cuándo compra en la tienda— están poblados en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene su tipo y su motivo, de una lista definida: por ejemplo, una consulta por el estado del pedido, un cambio de talla o un reclamo por un atraso. `[3.3.F4]`
- El líder saca reportes de cuántos casos hay de cada tipo sin reconstrucción. `[3.3.F5]`
- Cada caso queda ligado al pedido del que habla, y quien atiende ve en qué va ese pedido —preparado, enviado, entregado— sin salir del sistema. `[3.3.F101 · comprobable · requiere 1.1.F2]`

**Eficiente.** Se miden los tiempos y la satisfacción, y la posventa ve los mismos datos que la venta.

*Resultado:* La tienda sabe qué tan rápido y qué tan bien atiende, cuánto tarda un comprador nuevo en tener lo que compró y, donde se vuelve a comprar, qué tan sano está cada cliente, con la satisfacción medida y no supuesta.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los plazos acordados, en todos los canales, también en las redes y en los marketplaces. `[3.3.E1]`
- Se mide la satisfacción con cadencia, con el NPS o el CSAT: por ejemplo, una encuesta después de la entrega o al cerrar cada caso. `[3.3.E2]`
- Los datos de cada comprador están unificados entre la posventa y la venta: los mismos pedidos, casos y datos de contacto en los dos lados. `[3.3.E3]`
- Se mide cuánto tarda cada comprador nuevo en alcanzar el resultado de su primera compra: desde que paga hasta que lo recibe y lo usa sin problemas, sin abrir un caso ni devolverlo. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente, que combina cómo viene comprando, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Un modelo de salud de cada cliente anticipa el riesgo antes de que el cliente lo manifieste.

*Resultado:* La tienda sabe qué clientes pueden dejar de comprar por una mala experiencia antes de que lo digan, y cuántos casos va a traer cada temporada, con datos que se mantienen al día solos.

- Hay un modelo de salud de cada cliente, activo, predictivo y en uso, que mide tanto su experiencia con la tienda —entregas, casos y devoluciones— como si lo que compra le está sirviendo: lo sigue comprando y no lo devuelve. `[3.3.O1]`
- Hay modelos predictivos y prescriptivos alimentando cuadros de mando: por ejemplo, cuántos casos traerá la próxima promoción y cuánta gente hará falta para atenderlos. `[3.3.O3]`

*Se leen igual:* `3.3.D1`, `3.3.I1`, `3.3.I2`, `3.3.F6`, `3.3.O2`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Quién responde por la posventa, con qué números decide y con qué cadencia la revisa?

*Descripción:* Mide si alguien responde por la posventa: roles claros, un tablero con sus números y una revisión con cadencia.

*Costo de quedarse:* Nadie responde por la posventa: sus números no se miran, y los atrasos y los reclamos se descubren cuando ya estallaron.

**Deficiente.**

- No hay coordinación entre quienes atienden las consultas, los cambios y los reclamos. `[3.4.D1]`

**Inicial.** Roles a grandes rasgos y traspasos informales.

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si la posventa va al día o se está atrasando.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (casos abiertos, casos por tipo, pedidos atrasados, cambios y devoluciones en curso) y lo consulta al menos semanalmente. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por los plazos de atención, y el liderazgo prepara a quien entra y orquesta con otras áreas.

*Resultado:* El equipo responde por sus plazos de atención, una persona nueva atiende bien desde el principio, y la tienda sabe por la posventa quién puede dejar de comprar y qué producto falla.

- El equipo rinde cuentas explícitamente por los plazos de atención acordados. `[3.4.E1]`
- Cuando entra alguien nuevo a la posventa, hay un plan de inducción con sus pasos y materiales —la política de cambios, los casos frecuentes, el sistema—; no se le entrena de memoria. `[3.4.E2]`
- El liderazgo orquesta con Ventas y con Marketing: la posventa le devuelve a la tienda los compradores que pueden dejar de comprar y lo que se repite en los casos, como un producto que falla. `[3.4.E4]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y la posventa se mide también por los compradores que vuelven.

*Resultado:* La posventa se mide por los compradores que vuelven, no solo por los casos que cierra, y decide con lo que cuesta atender a cada tipo de cliente.

- El equipo de posventa se mide por cuántos de los compradores que atendió vuelven a comprar y cuánto compran, no solo por los casos que cierra. `[3.4.O3]`
- Las decisiones usan analítica avanzada, como cuánto cuesta atender a cada tipo de cliente —sus consultas, sus cambios, sus devoluciones— frente a lo que deja. `[3.4.O4]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.O1`, `3.4.O2`.

#### 3.5 Consistencia de Atención

¿El comprador recibe la misma respuesta y la misma solución, lo atienda quien lo atienda?

*Descripción:* Mide si cada comprador recibe la misma respuesta y la misma solución ante un cambio, una devolución o una garantía.

*Costo de quedarse:* La misma devolución se acepta o se rechaza según quién atienda: el comprador lo nota y lo cuenta.

**Deficiente.**

- La misma devolución se acepta con una persona y se rechaza con otra. `[3.5.D1]`

**Inicial.**

- No hay guía de tono; cada quien usa las respuestas guardadas cuando quiere. `[3.5.I1]`

**Funcional.** Hay tipos de cliente definidos, respuestas guardadas para lo frecuente, los mismos criterios para cambios y devoluciones, y un acompañamiento definido para el comprador nuevo.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, un comprador nuevo sabe cómo usar lo que compró, y un cambio o una devolución se resuelve igual lo atienda quien lo atienda.

- Hay al menos algunas respuestas guardadas —el estado de un pedido, cómo pedir un cambio, cuánto tarda un reembolso— disponibles para el equipo. `[3.5.F1]`
- Existe un proceso documentado para el comprador nuevo después de su primera compra —lo que recibe para usar bien lo que compró: instrucciones, cuidados o armado—, con un resultado definido: que lo reciba y lo use sin problemas. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende la posventa —por ejemplo, quien compra en línea, en la tienda física o en un marketplace— y qué necesita y espera cada uno, consultable por cualquiera del equipo. `[3.5.F4]`
- Los cambios, las devoluciones y las garantías se resuelven aplicando las condiciones de la tienda igual para todos, lo atienda quien lo atienda y entre por el canal que entre; las excepciones las aprueba una persona definida. `[3.5.F101 · evaluado · hábito]`

**Eficiente.**

*Resultado:* El comprador reconoce la voz de la tienda en cada respuesta, lo atienda quien lo atienda.

- Las respuestas suenan a la tienda —su tono y su voz—, no al estilo de cada persona. `[3.5.E2]`

*Se leen igual:* `3.5.F3`, `3.5.E1`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de Clientes

¿Lo urgente se atiende primero y cada comprador recibe la atención que le corresponde, o todos hacen la misma fila?

*Descripción:* Mide si la atención se prioriza por la urgencia del caso y el contexto del comprador, no por quién insiste.

*Costo de quedarse:* Un pedido que no llegó espera detrás de una consulta simple, y quien atiende responde sin saber qué compró esa persona ni qué le pasó antes.

**Deficiente.**

- Los casos se atienden por orden de llegada o como le parezca a quien atiende, sin mirar qué pedido está en juego. `[3.6.D1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero —un pedido que no llegó antes que una consulta de talla—, cada tipo de cliente recibe la atención que le corresponde, y quien atiende no tiene que reconstruir la historia del comprador.

- Cada caso tiene una prioridad asignada —por ejemplo, un pedido que no llegó va antes que una consulta de talla— y el equipo la respeta. `[3.6.F1]`
- La atención se diferencia según los tipos de cliente: cada tipo tiene claro qué atención recibe —por qué canal y quién lo atiende—. `[3.6.F2]`
- Quien atiende usa la ficha del comprador —sus pedidos, lo que ha pagado y sus casos abiertos— para responder con contexto, sin pedirle sus datos otra vez ni reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** Los compradores se segmentan según su momento, para actuar distinto con cada grupo.

*Resultado:* La atención cambia según el momento de cada comprador: con un pedido en camino, dentro de su plazo de cambio o con un problema abierto.

- Los compradores se segmentan para acciones de posventa según su momento: con un pedido en camino, dentro de su plazo de cambio o de garantía, con un problema abierto o listos para recomendar; y, donde vuelven a comprar, sanos o en riesgo. `[3.6.E2]`

**Óptimo.**

*Resultado:* Cada comprador recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar qué compró ni qué le prometieron.

- La atención se personaliza también en el autoservicio: el portal y el chat le muestran a cada comprador lo que corresponde a sus pedidos y a su tipo de cliente. `[3.6.O1]`
- La atención se personaliza uno a uno en tiempo real: la respuesta, el canal y la solución se ajustan a cada comprador y a lo que está pasando con su pedido. `[3.6.O2]`
- Cada comprador se atiende con el contexto de su compra —lo que le prometieron la ficha del producto y la promoción con la que compró, y la campaña de la que viene—, sin volver a preguntarlo. `[3.6.O3]`

*No aplican:* `3.6.E1`.

*Se leen igual:* `3.6.I1`.

#### 3.7 Seguimiento del pedido

¿El comprador sabe en qué va su pedido antes de preguntar, y te enteras de un problema antes de que reclame?

*Descripción:* Mide si el comprador sabe cómo va su pedido sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera de un atraso cuando ya reclamó, y tú te enteras de que quedó mal cuando deja una mala reseña.

**Deficiente.** La posventa espera el reclamo: nadie mira los pedidos hasta que el comprador escribe.

- Los problemas con un pedido se atienden cuando el comprador ya reclamó. `[3.7.D1]`
- La posventa espera a que el comprador escriba, por un solo canal. `[3.7.D2]`

**Inicial.** La posventa responde ordenada, pero siempre después del reclamo.

**Funcional.** Los atrasos y los problemas evidentes se detectan a mano antes de que el comprador reclame.

*Resultado:* Los atrasos, los reclamos y las malas calificaciones ya no toman al equipo por sorpresa: el comprador se entera de un atraso antes de tener que reclamar, alguien actúa antes de que un problema escale y, donde hay suscripción, se sabe por qué cancela cada cliente.

- Un comprador con casos repetidos del mismo problema, un reclamo sin resolver —también uno público, en las redes— o una mala calificación se identifica, y alguien lo contacta antes de que escale. `[3.7.F1]`
- Los mejores clientes reciben contacto antes de un vencimiento importante —el fin de su garantía o, donde hay suscripción, su renovación—, no después. `[3.7.F2]`
- Cada cliente que cancela su suscripción deja registrada la razón. `[3.7.F3]`
- Los pedidos que se van a atrasar se detectan antes de la fecha prometida, y el comprador recibe un aviso con la nueva fecha antes de tener que reclamar. `[3.7.F101 · comprobable · hábito]`

**Eficiente.** Los atrasos y las solicitudes pendientes se ven venir, las resuelva quien las resuelva, y el comprador recibe lo que necesita saber antes de pedirlo.

*Resultado:* Ninguna molestia del comprador se pierde entre la posventa, la bodega y el despacho, el comprador sabe lo que necesita antes de preguntarlo, quien tuvo un problema recibe algo para recuperarlo antes de irse con una mala impresión y, donde hay suscripción, quien está por cancelar recibe una razón para quedarse.

- Hay alertas tempranas, a partir del indicador de salud, de un cliente que puede dejar de comprar o que está listo para comprar más. `[3.7.E1]`
- Ninguna solicitud o molestia del comprador se pierde entre áreas: quedan en el sistema aunque las resuelva otra área —la bodega, el despacho o administración—, y hay alertas automáticas cuando una se atrasa, cuando un comprador califica mal o cuando se acerca una fecha crítica —una entrega, el fin de un plazo de cambio, una garantía—, que le llegan a quien tiene que actuar. `[3.7.E4]`
- Cada comprador recibe, sin tener que pedirla, la información que necesita antes de los momentos clave —lo que necesita para retirar o recibir su pedido, el fin de su plazo de cambio, el vencimiento de una garantía—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`
- Cada comprador con un pedido atrasado o que llegó mal recibe, sin tener que pedirla, una acción para recuperarlo: una disculpa, una compensación o una atención especial. `[3.7.E101 · comprobable · hábito]`
- Los suscriptores que dan señales de cancelar —pausan, se saltan entregas, reclaman— reciben una acción para quedarse antes de decidir irse. `[3.7.E102 · comprobable · hábito · relación continua]`

**Óptimo.**

*Resultado:* Muchos problemas con un pedido se resuelven antes de que el comprador los note, y cada comprador siente que la tienda se adelanta a lo que necesita y lo sorprende para bien.

- Muchos problemas se resuelven antes de que el comprador los note: por ejemplo, un pedido que se iba a atrasar sale desde otra bodega o con otro transportista. `[3.7.O2]`
- Los avisos y las acciones de la posventa —qué recibe cada comprador, cuándo y por qué canal— se ajustan solos con IA según su historia y sus señales. `[3.7.O3]`
- Los compradores reciben, sin pedirlos, detalles pensados para deleitarlos —una nota escrita a mano, una muestra en el paquete, un regalo en su cumpleaños—, elegidos según su historia y el momento de su relación. `[3.7.O4]`

*No aplican:* `3.7.E2`, `3.7.E3`, `3.7.O1`.

*Se leen igual:* `3.7.I1`.

#### 3.8 Autoservicio

¿El comprador resuelve solo lo simple —dónde está su pedido, cómo cambiarlo—, o cada consulta necesita a una persona?

*Descripción:* Mide si el comprador resuelve solo lo simple: el estado de su pedido, un cambio o una pregunta frecuente.

*Costo de quedarse:* Cada consulta necesita a una persona: en temporada alta las respuestas se atrasan, y para vender más tienes que contratar al mismo ritmo.

**Deficiente.** Toda la posventa pasa por una persona.

- El comprador no puede ver solo en qué va su pedido ni encontrar respuestas publicadas. `[3.8.D1]`
- Cada temporada alta obliga a sumar gente para atender, en la misma proporción en que suben los pedidos. `[3.8.D2]`

**Inicial.** Hay preguntas frecuentes sueltas, pero lo que más se consulta —dónde está mi pedido— todavía necesita a una persona.

**Funcional.** El comprador ve solo en qué va su pedido, y las consultas más frecuentes tienen respuesta publicada.

*Resultado:* Las preguntas de siempre dejan de consumir al equipo: el comprador ve solo dónde está su pedido o encuentra la respuesta publicada, y nadie la vuelve a escribir.

- Las consultas que más se repiten —dónde está mi pedido, cuánto cuesta el envío, cómo pido un cambio— tienen una respuesta que el comprador puede consultar por su cuenta: el seguimiento de su pedido y las preguntas frecuentes publicadas. `[3.8.F1]`
- Cuando entra una consulta que ya tiene respuesta publicada, el equipo envía el enlace —al seguimiento del pedido o a la pregunta frecuente— en vez de volver a redactarla. `[3.8.F2]`

**Eficiente.**

*Resultado:* La tienda puede vender más, también en temporada alta, sin sumar gente en la misma proporción, porque buena parte de la posventa se resuelve sola.

- Cada caso nuevo que se resuelve deja su solución escrita en la base de conocimiento: un producto que falla de una forma nueva, una duda de envío que no estaba. `[3.8.E1]`
- Se revisan periódicamente los casos que se repiten —por ejemplo, un producto que genera muchas consultas— y, donde hay suscripción, las razones por las que se cancela, para encontrar patrones y mejorar. `[3.8.E2]`
- El autoservicio es efectivo: el comprador resuelve sin abrir un caso —ve dónde está su pedido o encuentra cómo hacer un cambio— y la tienda crece sin sumar gente al mismo ritmo que los pedidos. `[3.8.E3]`

**Óptimo.**

*Resultado:* Atender un pedido más casi no cuesta: las respuestas se generan solas a medida que aparecen consultas nuevas.

- La IA detecta las consultas nuevas —un producto recién lanzado, un cambio en los envíos— y genera sola la respuesta publicada. `[3.8.O1]`
- La capacidad de atención se ajusta sola a la demanda en tiempo real, también en temporada alta, y atender a un comprador más casi no cuesta. `[3.8.O2]`
- Lo que se aprende de cada caso vuelve solo a las respuestas del equipo, a cómo se prioriza cada caso y a los avisos al comprador. `[3.8.O3]`

*Se leen igual:* `3.8.I1`, `3.8.I2`.

## Edición — Banca y servicios financieros

Para el área comercial de un banco, una cooperativa de ahorro y crédito o una financiera que coloca créditos, tarjetas y cuentas a personas y pymes: parte de la venta la trabaja un ejecutivo y parte se cierra sola en los canales digitales, y después de la venta la relación sigue.

*Clave:* banca

*Perfil habitual:* mixta · relación continua.

*Criterios propios:* desde el 201.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Deal | Solicitud de un crédito, una tarjeta o una cuenta |
| Negocio | Solicitud |
| Lead | Prospecto: quien pidió información o empezó una solicitud, sea o no cliente de la entidad |
| Pipeline | El recorrido de la solicitud: ingreso, análisis, aprobación y desembolso |
| Pipeline review | Reunión de seguimiento de solicitudes |
| Rep | Ejecutivo de negocios |
| Vendedor | Ejecutivo de negocios |
| Propuesta | La oferta del producto: monto, tasa, plazo y condiciones |
| Cotización | Simulación o preaprobación |
| Razón de pérdida | Por qué no se concretó la solicitud: rechazo, desistimiento o abandono |
| ICP | El cliente objetivo de cada producto |
| Forecast | Proyección de colocación |
| Ticket | Caso: un reclamo, una consulta o una gestión sobre un producto |

### Área 1 — Ventas

Mide el rendimiento del área comercial de la entidad: cómo está montada por dentro y qué produce en solicitudes, aprobaciones y productos colocados.

**Deficiente.** Tu área comercial coloca, pero nadie puede decir cómo. Cada ejecutivo lleva a sus prospectos en su propia lista, las solicitudes viven entre el sistema de crédito y los correos, y las que se abandonan en los canales digitales no las ve nadie.

**Inicial.** Tienes un CRM y un proceso a medias. Las solicitudes se registran cuando el ejecutivo se acuerda, cada sucursal explica las condiciones a su manera y el seguimiento depende de quién lleve el caso.

**Funcional.** Tu área comercial opera como una maquinaria base. Cada solicitud —de sucursal, de ejecutivo o digital— entra al mismo recorrido, las condiciones de cada producto se dicen igual en todos los canales, la autorización del cliente para consultar su historial queda registrada y ninguna solicitud se enfría sin que alguien reaccione.

**Eficiente.** La colocación deja de depender del empuje de cada ejecutivo. Mides en qué etapa se cae cada solicitud, la precalificación sale sola, les ofreces a los clientes que ya califican sin esperar a que pregunten y proyectas la colocación con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo decide donde importa. Agentes atienden y precalifican a toda hora, los modelos dicen a quién ofrecerle qué y cuándo, y el sistema detecta la solicitud que se traba antes de que el cliente termine el trámite en otra entidad.

#### 1.1 Procesos y Rutinas

Si mañana rotan dos ejecutivos clave, ¿las solicitudes en curso siguen avanzando igual?

*Descripción:* Mide si la colocación sigue un proceso escrito, con etapas, requisitos y cadencias que no dependen de cada ejecutivo.

*Costo de quedarse:* Si se va un ejecutivo, se lleva a sus prospectos y el estado de cada solicitud: el cliente tiene que empezar de nuevo, y muchos prefieren empezar en otra entidad.

**Funcional.** Maquinaria base: un solo recorrido de la solicitud, con plazos de respuesta y seguimiento con cadencia.

*Resultado:* Todo el equipo trabaja las solicitudes igual: avanzan con los mismos criterios, cada etapa tiene su plazo de respuesta y se les da seguimiento con la cadencia acordada, así que si rota un ejecutivo, el siguiente sabe en qué va cada solicitud.

- Cualquier ejecutivo explica igual las etapas de una solicitud —ingreso, análisis, aprobación y desembolso— y qué tiene que cumplir para avanzar. `[1.1.F1]`
- Cada producto —crédito, tarjeta, cuenta— tiene su recorrido configurado, con lo que la solicitud tiene que cumplir para avanzar y para aceptarse. `[1.1.F2]`
- Cada etapa de la solicitud tiene un plazo de respuesta acordado, y se cumple la mayoría del tiempo. `[1.1.F201 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El equipo asesora con un mismo método, y el líder sabe dónde se desvía y corrige con datos, no de memoria.

- Hay una metodología de asesoría formal en uso: el ejecutivo indaga la necesidad del cliente antes de ofrecerle un producto. `[1.1.E1]`
- Existen guías de indagación, precalificación y manejo de objeciones —tasa, requisitos, plazo— que el equipo usa. `[1.1.E2]`

*Se leen igual:* `1.1.D1`, `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I1`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.E3`, `1.1.O1`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Cuánto del tiempo del ejecutivo se va en tareas que el sistema podría hacer, y cuánto de lo que ya tienes —CRM, core bancario, canales digitales— trabaja junto?

*Descripción:* Mide cuánto trabajo repetitivo hace el sistema y si el CRM, el core bancario y los canales digitales están conectados.

*Costo de quedarse:* Tus ejecutivos digitan lo mismo en tres sistemas, las solicitudes que empiezan en la web se enfrían esperando que alguien las llame, y pagas herramientas que nadie usa.

**Inicial.**

- El cliente tiene que llamar para saber en qué va su solicitud. `[1.2.I201 · evaluado]`

**Funcional.** Hay automatización simple en producción, y lo que pasa en los canales digitales entra solo al sistema.

*Resultado:* Ninguna solicitud se pierde por no saber a quién le toca: la que empieza en un canal digital entra sola, aunque quede a medias; el ejecutivo recibe el aviso, lo que conversa con el cliente queda registrado y el cliente sabe en qué va su solicitud sin tener que llamar.

- Las solicitudes y las consultas que entran llegan a una bandeja o cola y se asignan por una regla simple (por turnos, por sucursal o por producto). `[1.2.F2]`
- Lo que el cliente contrata solo —por la web, la app o el autoservicio— entra solo al sistema como una solicitud, con su producto, su monto, su canal y su cliente. `[1.2.F6]`
- La solicitud que el cliente deja a medias en un canal digital queda guardada en el sistema, con sus datos de contacto. `[1.2.F201 · comprobable · venta sin vendedor]`
- En cada cambio de estado de su solicitud —recibida, en análisis, aprobada o qué le falta—, al cliente le llega un aviso automático. `[1.2.F202 · comprobable]`

**Eficiente.**

*Resultado:* El ejecutivo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen las solicitudes.

- Las simulaciones y las ofertas se generan desde el sistema, con la tasa y las condiciones vigentes, no en hojas sueltas. `[1.2.E1]`
- El CRM está integrado con el core bancario y con el sistema donde se analiza el crédito. `[1.2.E3]`
- El cliente entrega sus documentos y firma de forma digital, sin tener que ir a la sucursal. `[1.2.E201 · comprobable]`

**Óptimo.** Agentes de IA atienden y precalifican a toda hora; el ejecutivo trabaja con la predicción de qué solicitudes se van a concretar.

*Resultado:* El ejecutivo dedica su tiempo a las conversaciones que deciden la colocación: los agentes precalifican y agendan, y él trabaja con la predicción de qué solicitudes se van a concretar y con respuestas sugeridas para cada conversación.

- Hay predicción de qué solicitudes se van a concretar y respuestas sugeridas según el contexto de cada conversación. `[1.2.O1]`
- Agentes de IA precalifican y agendan citas a toda hora en el canal conversacional, y le pasan al ejecutivo, con el contexto, a quien está listo. `[1.2.O2]`

*No aplican:* `1.2.F8`.

*Se leen igual:* `1.2.D1`, `1.2.D2`, `1.2.I1`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.O3`.

#### 1.3 Datos

¿Confías en tus números de solicitudes, de aprobación y de colocación, o los validas antes de usarlos?

*Descripción:* Mide si los datos comerciales son confiables: solicitudes completas, su origen, la autorización del cliente y reportes sin reconstruir.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de colocación se arma a mano cruzando el CRM con el sistema de crédito, y nadie sabe cuántas solicitudes hay de verdad en curso.

**Deficiente.**

- La información de los prospectos está en hojas de cálculo o en la libreta de cada ejecutivo. `[1.3.D3]`
- No hay registro de qué productos pidió cada cliente ni de cuáles se le ofrecieron. `[1.3.D4]`

**Funcional.** El reporte de solicitudes describe el estado actual con confianza, y la autorización de cada cliente para consultar su historial está registrada.

*Resultado:* El líder ve cuántas solicitudes hay en cada etapa cuando lo necesita, sin armar el reporte a mano, sabe por qué canal llegó cada una y puede demostrar que cada cliente autorizó que lo consultaran y lo contactaran.

- Toda solicitud tiene producto, monto, fecha esperada de desembolso o de apertura y ejecutivo responsable. `[1.3.F1]`
- Toda solicitud tiene rastreable por qué canal llegó: sucursal, ejecutivo, campaña, web, app o referido. `[1.3.F3]`
- El reporte de solicitudes en curso se genera del sistema sin reconstruir números, y refleja el estado actual, no una proyección. `[1.3.F4]`
- La documentación sobre el cliente objetivo de cada producto no se deja envejecer. `[1.3.F5]`
- La definición de prospecto precalificado no se deja envejecer. `[1.3.F6]`
- La documentación sobre los productos —tasas, costos, requisitos y condiciones— no se deja envejecer. `[1.3.F7]`
- Todo prospecto con el que se trabaja tiene registrada su autorización para consultar su historial crediticio, con su fecha. `[1.3.F201 · comprobable]`

**Eficiente.** Aparece la proyección de colocación, y la ficha del cliente reúne sus productos, sus solicitudes y sus conversaciones.

*Resultado:* La entidad puede comprometer una meta de colocación con confianza, y el ejecutivo ve en un solo lugar qué tiene cada cliente y qué pidió.

- Hay una proyección de colocación con cadencia fija (semanal o quincenal) y precisión alta. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con lo que viene del core bancario —sus productos, sus saldos y cómo ha pagado— y con su historial de conversaciones: la vista 360° empieza a tomar forma. `[1.3.E3]`

*No aplican:* `1.3.F8`, `1.3.E4`.

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.I1`, `1.3.I2`, `1.3.I3`, `1.3.F2`, `1.3.E2`, `1.3.O1`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿El liderazgo comercial decide con datos o con intuición, y con qué cadencia revisa a sus ejecutivos y a sus sucursales?

*Descripción:* Mide si el liderazgo gestiona con roles claros, metas por ejecutivo y sucursal, datos y una revisión de cadencia fija.

*Costo de quedarse:* El gerente se entera al cierre del mes de que la meta no se cumplió: no vio antes qué sucursal o qué ejecutivo se quedó atrás, ni por qué.

**Funcional.**

*Resultado:* Cada ejecutivo sabe qué se espera de él, y el líder sabe cada semana qué sucursal y qué ejecutivo van bien y quién necesita ayuda, antes de que cierre el mes.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (solicitudes ingresadas, solicitudes aprobadas, monto colocado, tasa de aprobación, tiempo de respuesta) y lo consulta al menos semanalmente. `[1.4.F2]`
- Cada ejecutivo, cada sucursal y cada canal digital tiene una meta clara, y su avance se reporta en cadencia fija. `[1.4.F4]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con Marketing y con el área de crédito, y escucha al equipo.

*Resultado:* Un ejecutivo nuevo produce más rápido, el traspaso de prospectos con Marketing y el de expedientes con el área de crédito tienen reglas que se cumplen, y lo que el equipo ve que no funciona llega a quien puede cambiarlo.

- Cuando entra un ejecutivo nuevo, hay un plan de inducción con sus pasos y materiales —productos, política de crédito y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con el área de crédito está escrito y se mide: qué expediente se recibe, en cuánto tiempo se resuelve y por qué se devuelve. `[1.4.E201 · comprobable]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué producto y qué canal dejan más margen, qué ejecutivo aporta más y cuánto vale cada cliente en el tiempo.

- Las decisiones usan analítica avanzada (rentabilidad por producto y por canal, valor del cliente en el tiempo, aporte de cada ejecutivo). `[1.4.O1]`

*Se leen igual:* `1.4.D1`, `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F3`, `1.4.F5`, `1.4.E3`, `1.4.E4`, `1.4.O2`.

#### 1.5 Oferta y condiciones

¿El cliente recibe la misma oferta, con las mismas condiciones y los mismos requisitos, lo atienda quien lo atienda y por el canal que sea?

*Descripción:* Mide si el equipo sabe a quién ofrecerle cada producto y si las condiciones se dicen igual en cada canal.

*Costo de quedarse:* El cliente escucha una tasa en la sucursal y otra por teléfono, o le piden un requisito que nadie le había dicho: desconfía, compara y se va con la entidad que le habló claro.

**Deficiente.** El cliente recibe una oferta distinta según quién lo atienda; las condiciones se explican de memoria.

- Las condiciones que escucha el cliente cambian según quién lo atienda o por dónde pregunte. `[1.5.D1]`

**Inicial.** Hay fichas de producto, pero no todos las usan: las condiciones todavía varían entre ejecutivos y entre canales.

**Funcional.** El cliente objetivo de cada producto está escrito, y la oferta se dice igual en todos los canales.

*Resultado:* Dos clientes parecidos reciben la misma oferta —tasa, plazo, costos y requisitos— sin importar qué ejecutivo los atienda ni por qué canal lleguen, y saben cuánto les va a costar antes de firmar.

- Existe un documento con el cliente objetivo de cada producto —a quién va dirigido y qué busca—, consultable por cualquier ejecutivo. `[1.5.F1]`
- El líder puede explicar quién es el cliente objetivo de cada producto sin consultar su documentación. `[1.5.F2]`
- Las ofertas están estandarizadas: toda simulación o preaprobación muestra lo mismo —monto, tasa, plazo, cuota y costos—, no armada desde cero cada vez. `[1.5.F4]`
- Las tasas, los costos y los requisitos de cada producto son los mismos en sucursal, por teléfono y en los canales digitales, o la diferencia es a propósito y está escrita. `[1.5.F5]`
- Cada producto tiene una ficha vigente para el cliente —qué es, para quién, tasa, costos y requisitos— publicada en los canales donde se ofrece. `[1.5.F201 · comprobable]`
- Antes de firmar, el cliente recibe por escrito el costo total de lo que contrata: tasa, comisiones, seguros y cuota. `[1.5.F202 · comprobable · hábito]`

**Eficiente.** La oferta se distingue de la de otras entidades y solo promete lo que se puede aprobar.

*Resultado:* El mercado reconoce a la entidad por algo concreto, la oferta se sostiene igual en cada contacto, y lo que se le ofrece al cliente es lo que después se le aprueba.

- Las ofertas solo prometen lo que se puede aprobar: el monto, la tasa y el plazo que se ofrecen se validan contra la política de crédito vigente antes de decírselos al cliente. `[1.5.E3]`
- Se mide cuántas ofertas terminan aprobadas con condiciones distintas de las ofrecidas, y se corrige el origen. `[1.5.E201 · comprobable · hábito]`

**Óptimo.** La IA mantiene coherentes las condiciones y el mensaje en cada punto de contacto, sin trabajo manual.

- La IA mantiene coherentes las condiciones y el mensaje en todos los canales en tiempo real, sin trabajo manual. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.F3`, `1.5.E2`.

#### 1.6 Precalificación y priorización

¿El equipo le dedica el tiempo a quien sí puede obtener el producto, o atiende a todos por igual y descubre después que no calificaban?

*Descripción:* Mide si el equipo decide a quién dedicarle tiempo con criterios escritos, según el cliente objetivo de cada producto.

*Costo de quedarse:* Tus ejecutivos arman expedientes completos de clientes que no iban a calificar, mientras los que sí califican esperan su turno y se van a otra entidad.

**Deficiente.** Se atiende a los prospectos por orden de llegada, y se arma el expediente antes de saber si califican.

- Se arma el expediente completo antes de saber si el cliente califica. `[1.6.D201 · evaluado]`

**Funcional.** Hay segmentación básica de prospectos y una definición escrita de quién precalifica para cada producto.

*Resultado:* El equipo deja de armar expedientes que no se van a aprobar y concentra el esfuerzo en quien encaja con el producto y puede obtenerlo.

- El equipo segmenta a los prospectos por los atributos del cliente objetivo antes de trabajarlos: en personas, ingreso, tipo de empleo o zona; en pymes, actividad, antigüedad o ventas. `[1.6.F1]`
- Hay una definición escrita de prospecto precalificado —las condiciones básicas de cada producto: ingreso, antigüedad, nivel de endeudamiento— y se aplica de forma consistente antes de armar el expediente. `[1.6.F2]`
- El esfuerzo se enfoca en los prospectos que encajan con el cliente objetivo del producto. `[1.6.F3]`
- La documentación del cliente objetivo se usa en la arquitectura de CRM y en los formularios de solicitud. `[1.6.F4]`
- Antes de ofrecerle un producto a quien ya es cliente, se revisa qué tiene con la entidad y cómo ha pagado. `[1.6.F201 · evaluado · hábito]`

**Eficiente.** La precalificación es automática, y hay clientes preaprobados a quienes ofrecerles sin esperar a que pregunten.

*Resultado:* Cada ejecutivo sabe cada mañana a quién llamar primero, quien no califica lo sabe enseguida, y los clientes que ya califican reciben la oferta sin tener que pedirla.

- Hay un puntaje comercial por reglas activo: un modelo que suma puntos por varios atributos —producto de interés, perfil, comportamiento— para decidir a quién llamar primero; no reemplaza la evaluación de crédito. `[1.6.E1]`
- La precalificación es automática: con los datos de la solicitud, el sistema dice si el cliente cumple las condiciones básicas del producto antes de que alguien le dedique tiempo. `[1.6.E201 · comprobable · requiere 1.6.F2]`
- Hay listas de clientes preaprobados por producto, armadas con su comportamiento, y se les ofrece sin esperar a que pregunten. `[1.6.E202 · comprobable · requiere 1.3.E3]`

**Óptimo.** Los modelos dicen a quién ofrecerle qué, y cuándo.

*Resultado:* El sistema dice qué cliente atender, con qué producto y cuándo, con lo que saben Servicio y Marketing de cada uno, incluido dónde hay riesgo o espacio para ofrecer más.

- Un modelo calcula para cada cliente qué producto le conviene y cuándo ofrecérselo, con su comportamiento y con lo que saben Servicio y Marketing de él. `[1.6.O201 · comprobable]`

*Se leen igual:* `1.6.D1`, `1.6.I1`, `1.6.I2`, `1.6.E2`, `1.6.E3`, `1.6.O1`, `1.6.O2`, `1.6.O3`, `1.6.O4`.

#### 1.7 Avance de la solicitud

¿Qué pasa con una solicitud que se queda esperando un documento, una aprobación o una respuesta del cliente?

*Descripción:* Mide si alguien detecta cuando una solicitud deja de avanzar y si hay una respuesta acordada para retomarla.

*Costo de quedarse:* Las solicitudes se enfrían esperando un documento o una firma: nadie ve cuáles dejaron de avanzar, y el cliente termina el trámite en otra entidad.

**Deficiente.** El ejecutivo está solo con sus solicitudes, y las que se abandonan en los canales digitales no las ve nadie.

- Las solicitudes que el cliente deja a medias en la web o en la app no las retoma nadie. `[1.7.D201 · comprobable · venta sin vendedor]`

**Funcional.** Ninguna solicitud se enfría en silencio: hay una respuesta acordada.

*Resultado:* Las solicitudes que se traban —falta un documento, una firma o una respuesta— se detectan a tiempo y se retoman por más de un canal, con el líder actuando mientras todavía hay margen; y la que el cliente dejó a medias en un canal digital no se pierde.

- Las solicitudes detenidas —por un documento, una firma o una respuesta pendiente— se reconocen a tiempo y tienen un paso acordado para retomarlas, no la improvisación de cada ejecutivo. `[1.7.F1]`
- El seguimiento usa al menos dos canales, por ejemplo llamada y el canal conversacional, como WhatsApp. `[1.7.F2]`
- Las solicitudes que el cliente deja a medias en un canal digital reciben un recordatorio o una llamada dentro del plazo acordado. `[1.7.F201 · comprobable · hábito · venta sin vendedor · requiere 1.2.F201]`

**Eficiente.** El seguimiento es multicanal, el sistema le avisa al líder de lo que se traba y quien hoy no califica sigue en nutrición.

*Resultado:* Ninguna solicitud espera a la reunión para recibir ayuda, el cliente al que hoy no se le pudo aprobar vuelve a recibir una oferta cuando cambia su situación, y se sabe cuánto de lo que se traba se recupera.

- El seguimiento multicanal está definido —llamada, correo, canal conversacional y notificaciones de la app— y orquestado en cadencias. `[1.7.E1]`
- Los prospectos que todavía no están listos o que hoy no califican no se abandonan: vuelven a nutrición y regresan a Ventas cuando muestran interés o cambia su situación. `[1.7.E2]`
- Cuando una solicitud lleva más tiempo del acordado sin avanzar, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántas solicitudes detenidas o abandonadas se recuperan, con qué mensaje y por qué canal. `[1.7.E201 · comprobable]`

**Óptimo.** El sistema detecta la solicitud que se va a caer y actúa antes de que el cliente se vaya.

*Resultado:* Las solicitudes con más posibilidades reciben ayuda justo cuando la necesitan: el sistema detecta dónde se traba cada una y moviliza a quien corresponde.

- El sistema detecta dónde se traba una solicitud y responde en el momento: un recordatorio al cliente, una alerta a la gerencia o el aviso al ejecutivo sobre las que más importan. `[1.7.O1]`
- El canal y el momento de cada seguimiento se autoajustan según el comportamiento del cliente. `[1.7.O2]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.D4`, `1.7.I1`, `1.7.I2`, `1.7.I3`, `1.7.I4`, `1.7.F3`, `1.7.F4`, `1.7.F5`, `1.7.E3`.

#### 1.8 Aprobadas, rechazadas y desistidas

¿El equipo sabe por qué una solicitud no termina en un producto colocado, y lo usa para mejorar?

*Descripción:* Mide si se registra por qué cada solicitud se rechaza, se desiste o se abandona, y si eso se usa.

*Costo de quedarse:* Pierdes solicitudes por las mismas razones una y otra vez —una tasa, un requisito, una demora— porque nadie registra por qué se rechazan ni por qué el cliente desiste.

**Deficiente.** Nadie mira por qué una solicitud no se concreta.

**Inicial.** Se comenta de vez en cuando por qué se cayó una solicitud, sin registro.

**Funcional.** Queda registrado por qué no se concretó cada solicitud, y si la rechazó la entidad o la dejó el cliente.

*Resultado:* El líder sabe por qué no se concretan las solicitudes —cuántas rechazó la entidad, cuántas dejó el cliente y por qué—, con datos del trimestre y no con impresiones.

- Toda solicitud que no se concretó tiene registrada su razón. `[1.8.F1]`
- Las razones por las que no se concreta una solicitud usan una lista definida, no texto libre. `[1.8.F2]`
- El líder puede sacar un reporte del trimestre de por qué no se concretaron las solicitudes, sin reconstruir. `[1.8.F3]`
- Las razones separan lo que rechazó la entidad —política, capacidad de pago, historial— de lo que dejó el cliente —tasa, demora, requisitos, otra entidad—. `[1.8.F201 · comprobable]`

**Eficiente.** Se revisa con cadencia por qué se concretan y por qué no se concretan las solicitudes, y lo aprendido vuelve al proceso y a la precalificación.

*Resultado:* Los mismos motivos dejan de repetirse: lo que se aprende de cada rechazo y de cada desistimiento, y de las solicitudes que sí se concretaron, vuelve al proceso, a la precalificación y a la capacitación del equipo.

- Se revisan periódicamente las solicitudes que se concretaron y las que no —rechazadas, desistidas y abandonadas— para identificar patrones. `[1.8.E1]`
- Las razones de rechazo se revisan con el área de crédito, para ajustar a quién se le ofrece cada producto. `[1.8.E201 · declarado · hábito]`

**Óptimo.**

- La IA detecta en qué etapa y por qué se caen las solicitudes, y propone el cambio. `[1.8.O201 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.D2`, `1.8.I1`, `1.8.E2`, `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`.

### Área 2 — Marketing

Mide el rendimiento del marketing de la entidad: cómo está montado por dentro y qué produce en prospectos, solicitudes y confianza en la marca.

**Deficiente.** Tu marca no la defines tú, la define el mercado. Cada producto se anuncia con su propia voz, las piezas salen sin pasar por cumplimiento normativo, las herramientas están sueltas y las campañas corren hasta agotar el presupuesto sin que nadie sepa cuántas solicitudes dejaron. Los prospectos llegan por casualidad.

**Inicial.** Tienes marca y campañas por producto, pero sin estrategia detrás. Las herramientas se usan a medias y cada una por su lado, el contenido sale cuando se puede, cumplimiento normativo revisa a última hora y la campaña se atrasa, y el análisis llega tarde: cuando la campaña ya cerró. No sabes de dónde vienen tus prospectos.

**Funcional.** El área dejó de depender de héroes. Tienes marca, buyer personas y presencia digital documentadas, y las herramientas que pagas se usan de verdad. Cada pieza pasa por cumplimiento normativo y dice cuánto cuesta el producto, y tus clientes saben por dónde les escribes y qué nunca les vas a pedir. Tus campañas salen por segmento y coordinadas —correo, pauta, redes, WhatsApp y tus propios canales, como la app o la sucursal—, solo a quien aceptó recibirlas y con el costo por prospecto a la vista. Todavía no optimizas fino, pero la demanda ya es predecible.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la siguiente campaña. Los datos están unificados y atribuidos, sabes cuánto te cuesta cada producto colocado sumando la sucursal y lo digital, la segmentación y el puntaje de prospectos se automatizan, y la IA asiste al equipo en su trabajo diario. Cumplimiento normativo responde en un plazo que se mide, te encuentran también en los asistentes de IA, y el presupuesto se mueve hacia el canal que más coloca.

**Óptimo.** La IA produce y ajusta; el equipo dirige. El contenido se genera y se optimiza en ciclo continuo, la IA encuentra micro-segmentos y adapta el mensaje a lo que hace cada persona, los modelos mueven el presupuesto entre canales sobre la marcha, y los clientes que Servicio vuelve promotores traen clientes nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

Si mañana se va quien arma las campañas, ¿las de cada producto siguen saliendo a tiempo y con la revisión de cumplimiento normativo hecha?

*Descripción:* Mide si las campañas salen de un calendario y un proceso compartidos, con la revisión de cumplimiento normativo incluida.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona falta, la del producto se atrasa o sale sin la revisión de cumplimiento normativo, y una pieza sin revisar puede costarte una sanción.

**Inicial.**

- Cumplimiento normativo revisa las piezas sin un paso ni un plazo acordados: la campaña se atrasa esperando su visto bueno, o sale sin él. `[2.1.I201 · declarado]`

**Funcional.** El área tiene estructura y previsibilidad, y cada pieza pasa por cumplimiento normativo antes de salir; deja de depender de héroes.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y las campañas de cada producto siguen saliendo aunque cambie una persona, con la revisión de cumplimiento normativo hecha: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada una sin tener que preguntar.

- Toda pieza que habla de un producto pasa por la revisión de cumplimiento normativo antes de publicarse, y su aprobación queda registrada. `[2.1.F201 · declarado · hábito]`

**Eficiente.**

*Resultado:* Cada pieza sale revisada en su calidad, no solo aprobada por cumplimiento normativo, y el líder sabe dónde se desvía el proceso y corrige con datos, no de memoria.

- Existe un proceso de aprobación de contenido antes de publicar, con control de versiones y de calidad, aparte de la revisión de cumplimiento normativo. `[2.1.E2]`

*Se leen igual:* `2.1.D1`, `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.I3`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Cuánto del trabajo de las campañas hace el sistema, y cuánto se aprovecha lo que ya pagas: la herramienta de marketing, el CRM y WhatsApp?

*Descripción:* Mide cuánto del marketing hacen los flujos automáticos y la IA, y cuánto se aprovechan las herramientas contratadas.

*Costo de quedarse:* Haces a mano lo que podría salir solo y pagas herramientas que no usas, mientras quien pidió información de un crédito espera respuesta por WhatsApp.

**Inicial.**

- La entidad paga licencias cuyo valor no aprovecha. `[2.2.I1]`

**Funcional.**

*Resultado:* Quien pide información de un producto en el sitio o escribe por WhatsApp entra al sistema y recibe respuesta.

- Los formularios del sitio —pedir información de un producto, pedir que llame un ejecutivo— están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`

**Eficiente.**

*Resultado:* Los prospectos se nutren solos hasta estar listos para hablar con un ejecutivo, la conversación con cada contacto no depende de que alguien se acuerde de escribirle, y el líder ve en tiempo real qué conversaciones esperan respuesta.

- El traspaso de prospectos al ejecutivo o a la sucursal que les corresponde está automatizado. `[2.2.E3]`

**Óptimo.**

*Resultado:* Cada contacto vive un recorrido pensado para él: la IA decide el siguiente paso y conversa en el momento, con información que se calcula en toda la entidad.

- Agentes de IA atienden el canal conversacional: responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para hablar con un ejecutivo. `[2.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a las herramientas de marketing: la segmentación usa, por ejemplo, la rentabilidad real de cada cliente, calculada afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D1`, `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.E1`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.O1`.

#### 2.3 Datos

¿Sabes qué canal y qué campaña te traen prospectos y solicitudes, y quién aceptó recibir tus ofertas, o lo validas a mano?

*Descripción:* Mide si los datos dicen qué canal trae prospectos y solicitudes, y si cada persona aceptó recibir ofertas.

*Costo de quedarse:* No sabes qué campaña trae solicitudes y cuál solo gasta, y le escribes ofertas a quien no te dio permiso: mueves el presupuesto a ciegas y te expones a una sanción.

**Funcional.**

*Resultado:* El líder sabe de dónde viene cada prospecto, con reportes que salen del sistema y no de una hoja armada a mano.

- Todo contacto nuevo —entre por un formulario, una conversación, la app o la contratación de un producto— tiene poblados la etapa del ciclo de vida y su origen. `[2.3.F1]`
- Las propiedades que describen al cliente objetivo de cada producto —en personas, ingreso, tipo de empleo o zona; en pymes, actividad, antigüedad o ventas— están en los formularios críticos y se capturan en la mayoría de los registros. `[2.3.F2]`
- Los duplicados —la misma persona como cliente y como prospecto, o con dos correos— están bajo control, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —prospectos, conversión a solicitud y origen— salen del sistema sin reconstrucción manual. `[2.3.F5]`
- Cuando se pide un teléfono u otro dato de contacto, se pregunta si la persona acepta que le escriban por ese canal para ofrecerle productos, y su respuesta queda registrada. `[2.3.F7]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada producto colocado, no solo cuál trajo el primer clic.

**Óptimo.**

*Resultado:* La atribución toma en cuenta todo lo que pasa en la entidad, no solo lo que ve Marketing, y los datos se mantienen confiables sin que el equipo tenga que cuidarlos.

- Marketing se apoya en el almacén central de datos de la entidad, donde se junta la información de todas las herramientas, y atribuye resultados con esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.D1`, `2.3.D2`, `2.3.I1`, `2.3.I2`, `2.3.F6`, `2.3.E1`, `2.3.E2`, `2.3.E3`, `2.3.O3`, `2.3.O4`.

#### 2.4 Equipo y Gobierno

¿Quién decide qué producto se promueve, cuánto se invierte y en qué canal, con qué datos y con qué cadencia?

*Descripción:* Mide quién decide qué producto se promueve y dónde se invierte, con qué datos y con qué cadencia de revisión.

*Costo de quedarse:* Se promueve el producto del área que más presiona, no el que más conviene, las campañas esperan días a cumplimiento normativo y nadie puede demostrar qué dejó la inversión.

**Inicial.**

- Las decisiones operativas escalan a la gerencia general o a la jefatura de mercadeo. `[2.4.I1]`

**Funcional.**

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (prospectos, prospectos listos para un ejecutivo, origen y conversión a solicitud) y lo consulta al menos semanalmente. `[2.4.F2]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con el área comercial y con cumplimiento normativo, y escucha al equipo.

*Resultado:* Una persona nueva se integra rápido, Marketing y el área comercial trabajan con reglas acordadas en vez de reclamarse los prospectos, y ninguna campaña se queda esperando a cumplimiento normativo sin que se sepa por qué.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —productos, marca y lo que la regulación exige en una pieza—; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo orquesta con el área comercial —el traspaso de prospectos a los ejecutivos y a las sucursales, sus plazos y una cadencia conjunta— y con Servicio. `[2.4.E3]`
- El acuerdo con cumplimiento normativo está escrito y se mide: qué piezas revisa, en cuánto tiempo responde y por qué devuelve una. `[2.4.E201 · comprobable]`

**Óptimo.**

*Resultado:* La dirección sabe cuánto deja cada canal frente a lo que cuesta y decide dónde invertir con ese número, con un equipo capaz de sostener la IA.

- Las decisiones usan analítica avanzada, como lo que deja cada canal —la rentabilidad en el tiempo de los clientes que trae— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F3`, `2.4.F4`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

#### 2.5 Marca y confianza

¿El mercado te encuentra, entiende qué ofreces y confía en tu marca lo suficiente para darte sus datos y su dinero?

*Descripción:* Mide si el mercado encuentra a la entidad, entiende qué ofrece y confía en su marca.

*Costo de quedarse:* El mercado no distingue tu marca de la de otra entidad —ni de un fraude que la imita—, y un anuncio que esconde el costo te trae reclamos y una sanción.

**Funcional.** Marca, personas y presencia digital documentadas y consistentes, con el costo a la vista y el cliente advertido contra el fraude.

*Resultado:* La marca se ve y suena igual en todo lo que sale, cada anuncio dice cuánto cuesta el producto, el cliente sabe reconocer cuándo le escribe la entidad y cuándo es un fraude, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Hay 2-3 buyer personas escritos —por ejemplo, el asalariado que busca su primera tarjeta o el dueño de una pyme que necesita capital de trabajo—, con su recorrido básico por etapa. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible —por ejemplo, de educación financiera, de seguridad o de historias de clientes—, en el blog, en la app o en el formato que use la entidad. `[2.5.F5]`
- La entidad le dice al cliente, en su sitio y en los demás canales que tenga, desde qué números, perfiles y correos le escribe, y qué nunca le va a pedir, como su clave o un código de verificación. `[2.5.F201 · comprobable]`
- Toda pieza que anuncia una tasa, una cuota o un beneficio muestra también el costo total, los requisitos y las condiciones que exige la regulación, o enlaza a donde están. `[2.5.F202 · comprobable]`

**Eficiente.**

*Resultado:* La entidad aparece cuando la gente busca cómo ahorrar, usar bien el crédito o financiar su pyme, tanto en buscadores como en asistentes de IA, con contenido pensado para cada segmento que importa, y lo que dicen de ella sus clientes juega a su favor.

- Los buyer personas están detallados a nivel de segmento de alto valor, como la banca preferente o las pymes. `[2.5.E1]`
- El contenido está organizado por temas —por ejemplo, ahorrar, usar bien el crédito o financiar una pyme—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- Las reseñas y calificaciones públicas —por ejemplo, las de la app en las tiendas o las de las sucursales— se piden a los clientes satisfechos y se responden con una cadencia fija. `[2.5.E5]`

**Óptimo.**

- Los buyer personas están hiper-segmentados, casi al nivel de cada cliente. `[2.5.O1]`

*Se leen igual:* `2.5.D1`, `2.5.D2`, `2.5.D3`, `2.5.I1`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F4`, `2.5.E3`, `2.5.E4`, `2.5.O2`.

#### 2.6 Segmentación

¿Cada segmento —personas, pymes, clientes de planilla o nómina— recibe la campaña del producto que le sirve, o todos reciben la misma oferta?

*Descripción:* Mide si cada segmento recibe campañas del producto que le sirve, o si todos reciben la misma oferta.

*Costo de quedarse:* Le ofreces la tarjeta a quien ya la tiene y el crédito de pyme a un asalariado: gastas en campañas que nadie aprovecha y cansas a tus clientes.

**Inicial.**

- Las campañas le ofrecen un producto a quien ya lo tiene. `[2.6.I201 · comprobable]`

**Funcional.**

*Resultado:* Cada segmento recibe la campaña del producto que le sirve, nadie recibe la oferta de lo que ya tiene, y los ejecutivos reciben prospectos que Marketing ya clasificó con criterios claros.

- Existen al menos 2 segmentos definidos con criterios escritos —por ejemplo, personas, pymes y clientes de planilla o nómina—. `[2.6.F1]`
- Existen criterios documentados de qué es un suscriptor, un prospecto y un prospecto listo para pasar a un ejecutivo, y marketing clasifica según ellos, a mano o con una automatización simple sobre las propiedades de calificación. `[2.6.F4]`
- Las campañas de un producto no le llegan a quien ya lo tiene, salvo que sean para él —un aumento de límite, un segundo crédito—: la lista se cruza con los productos de cada cliente antes de enviar. `[2.6.F201 · comprobable]`

**Eficiente.** La segmentación y el puntaje de prospectos se automatizan.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los ejecutivos reciben primero a los prospectos con más probabilidad de hacer una solicitud.

- Hay un puntaje de prospectos por reglas —distinto del puntaje de crédito—: un modelo que suma puntos por varios atributos y califica al pasar un umbral, cuyo puntaje dispara las secuencias de nutrición. Se distingue de la calificación de Funcional, que responde a un valor de propiedad sin modelo de puntaje detrás. `[2.6.E3]`
- La segmentación usa datos de comportamiento —qué abrió, qué visitó, cómo usa sus productos—, no solo lo que la persona declaró. `[2.6.E4]`

*Se leen igual:* `2.6.D1`, `2.6.D2`, `2.6.I1`, `2.6.I2`, `2.6.F3`, `2.6.E1`, `2.6.E2`, `2.6.O1`, `2.6.O3`.

#### 2.7 Canales y Alcance

¿Llegas a quien necesitas por los canales que usa —también la app y la sucursal—, con su permiso y con un costo que conoces?

*Descripción:* Mide si los canales llegan a quien corresponde, con su permiso, bajo un mismo plan y con un costo conocido.

*Costo de quedarse:* Tus campañas salen sueltas y a veces a quien no dio permiso: no sabes cuánto te cuesta cada prospecto, y te expones a una sanción.

**Inicial.**

- Cada canal va por su lado: no hay calendario común ni campaña que los atraviese. `[2.7.I3]`

**Funcional.** Los canales principales —también los propios de la entidad— operan con cadencia, bajo un mismo plan y con el permiso de cada persona.

*Resultado:* La campaña de un producto sale coordinada por todos los canales —también los propios, como la app o la sucursal—, solo a quien aceptó recibirla, y el líder sabe cuánto le cuesta cada prospecto según de dónde venga.

- Hay al menos una campaña de pauta pagada corriendo con presupuesto definido (Google, Meta o el canal que corresponda a la entidad). `[2.7.F3]`
- Los cuatro canales siguen el mismo calendario y la misma campaña: la de un producto sale coordinada en correo, pauta, orgánico y el canal conversacional, no como cuatro esfuerzos sueltos. `[2.7.F5]`
- El líder puede decir cuánto costó cada prospecto —o cada producto colocado, donde el cliente lo contrata solo en los canales digitales— el último mes, al menos por canal. `[2.7.F6]`
- Las campañas solo le llegan a quien aceptó recibir ofertas por ese canal, y quien pide no recibir más deja de recibirlas. `[2.7.F201 · comprobable · requiere 2.3.F7]`
- Las campañas dirigidas a clientes salen también por los canales propios que tenga la entidad —la app, la banca en línea, las sucursales—, con el mismo mensaje y en las mismas fechas. `[2.7.F202 · declarado · hábito]`

**Eficiente.**

*Resultado:* La inversión se mueve hacia el canal que mejor rinde —medido por los productos que coloca, no solo por los prospectos que trae—, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Hay charlas en línea o eventos como canal recurrente, por ejemplo de educación financiera para pymes o para los empleados de una empresa que paga su planilla con la entidad. `[2.7.E2]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar un producto —una tarjeta, una cuenta—, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- Se sabe, por canal, cuánto costó cada producto colocado, contando también lo que se colocó en la sucursal o con un ejecutivo, no solo en los canales digitales. `[2.7.E201 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más retorna, los clientes satisfechos traen clientes nuevos, y la entidad llega antes que otras a los canales nuevos.

*Se leen igual:* `2.7.D1`, `2.7.D2`, `2.7.I1`, `2.7.I2`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.E1`, `2.7.E3`, `2.7.O1`, `2.7.O2`, `2.7.O4`.

#### 2.8 Medición y Aprendizaje

¿Cada campaña te enseña qué coloca y con qué mensaje, o repites la del año pasado?

*Descripción:* Mide si cada campaña se evalúa por las solicitudes y los productos colocados que dejó, y si deja un aprendizaje.

*Costo de quedarse:* Repites las campañas de siempre sin saber cuáles colocaron productos: el presupuesto se reparte por costumbre, no por retorno.

**Funcional.**

- Los resultados de cada campaña —los prospectos, las solicitudes o los productos colocados que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.D3`, `2.8.I1`, `2.8.I2`, `2.8.F3`, `2.8.E1`, `2.8.E2`, `2.8.E3`, `2.8.O2`.

### Área 3 — Servicio

Mide el rendimiento del servicio de la entidad, que cubre todo lo que pasa después de que el cliente contrata un producto: cómo está montado por dentro y qué produce en reclamos resueltos, productos en uso y clientes que se quedan.

**Deficiente.** El servicio se improvisa cliente por cliente. Cada sucursal y cada persona que atiende resuelve los reclamos a su manera, nadie sabe si se respondieron en el plazo que fija el regulador, y todo depende de que la persona correcta esté disponible. Te enteras de que un cliente se fue cuando ya cerró su cuenta.

**Inicial.** El conocimiento vive en una o dos personas que saben cómo se resuelve cada gestión, y eso te deja con un punto único de fallo. Hay un sistema de casos, pero parte del equipo sigue atendiendo por fuera, en su correo o su teléfono; hay respuestas guardadas para lo más frecuente y procesos que nadie escribió. La atención es frágil: para bloquear una tarjeta, el cliente tiene que esperar a que lo atiendan.

**Funcional.** Tu atención es consistente y ya no depende de quién atienda. Sabes qué tipos de cliente atiendes —personas, pymes, banca preferente— y qué espera cada uno. Cada caso sigue un mismo recorrido en el sistema, con la ficha del cliente a la vista; cada reclamo lleva el plazo que fija el regulador y sabes cuántos se respondieron dentro de ese plazo, y nadie atiende una gestión sin verificar quién es el cliente. Un fraude va primero, el cliente bloquea su tarjeta al instante, y recibe aviso antes de cada cobro y ayuda para activar lo que contrató. Todavía no hay alertas automáticas de quién se puede ir, pero quien pide cancelar ya recibe una razón para quedarse.

**Eficiente.** El servicio empieza a adelantarse al problema. Cada tipo de caso tiene su plazo, con alertas y escalación automática; el cliente sigue sus casos y hace sus gestiones más comunes en la app, y la IA asiste a tu equipo en su trabajo diario. Mides tiempos y satisfacción, y la información del cliente se une con la del área comercial. Ves venir a quien se quiere ir antes de que lo pida, ninguna gestión se pierde entre tarjetas, operaciones y Servicio, y tus clientes de banca preferente y tus pymes más importantes tienen un responsable dedicado. La retención se vuelve predecible.

**Óptimo.** Un agente de IA resuelve consultas en producción y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y gestiona las excepciones; un modelo anticipa qué cliente se puede ir antes de que lo diga, y cada cliente se atiende sabiendo lo que se le ofreció al contratar y recibe detalles pensados para él. Atender un cliente más casi no cuesta.

#### 3.1 Procesos y Rutinas

Si mañana rotan las dos personas que más saben de reclamos y gestiones, ¿la atención sigue igual y dentro de los plazos?

*Descripción:* Mide si los reclamos y las gestiones siguen un proceso definido, sin depender de quién los atienda.

*Costo de quedarse:* Un reclamo se resuelve distinto según quién lo tome: el cliente no sabe a qué atenerse, y un plazo del regulador que se vence termina en una sanción.

**Deficiente.**

- Cada agente maneja los reclamos, las consultas y las gestiones a su manera. `[3.1.D1]`

**Inicial.**

- Se conocen los plazos que fija el regulador para los reclamos, pero nadie mide si se cumplen. `[3.1.I1]`

**Funcional.** El equipo atiende en un mismo sistema, con el recorrido de atención configurado, los plazos del regulador escritos y la identidad del cliente verificada.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada cliente tiene a alguien que responde por él, cada reclamo lleva escrito el plazo que fija el regulador, y nadie atiende una gestión sin verificar antes quién es el cliente.

- El recorrido de atención está configurado con sus etapas y cubre cada caso —reclamo, consulta o gestión—, de la recepción al cierre. `[3.1.F1]`
- Cada cliente tiene quién responda por él —una persona o, en la banca masiva, un equipo con un seguimiento automático— y un seguimiento mínimo más allá de los casos que abre. `[3.1.F2]`
- Existe un proceso básico documentado para los reclamos críticos —un fraude, un cargo no reconocido— o para escalar un caso. `[3.1.F4]`
- Cada tipo de reclamo tiene escrito en el proceso el plazo de respuesta que fija el regulador. `[3.1.F201 · declarado]`
- Antes de atender una gestión sobre un producto, se verifica la identidad del cliente con los pasos que define el proceso, en cualquier canal, y queda registrado en el caso. `[3.1.F202 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El cliente sabe cuánto va a tardar la respuesta, cada momento clave de su relación con la entidad tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLAs definidos por tipo de caso o prioridad, también para lo que el regulador no fija: las consultas y las gestiones. `[3.1.E1]`
- Hay playbooks de prevención, retención y expansión: qué hacer cuando un cliente deja de usar su tarjeta, cuando pide cancelar un producto o cuando está listo para uno más y hay que pasárselo al área comercial. `[3.1.E3]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —la activación, el primer uso y, si los hay, la renovación o el vencimiento— y un responsable y un estándar para cada uno. `[3.1.E4]`

*Se leen igual:* `3.1.D2`, `3.1.I2`, `3.1.I3`, `3.1.F3`, `3.1.F5`, `3.1.F6`, `3.1.E5`, `3.1.O1`, `3.1.O3`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Qué parte del trabajo con los casos hace el sistema —repartirlos, avisar, escalar— y cuánto de lo que ya pagas se aprovecha?

*Descripción:* Mide cuánto del trabajo con los casos hace el sistema —repartir, avisar, escalar— y cuánto se aprovecha lo contratado.

*Costo de quedarse:* Tu equipo reparte y sigue los casos a mano, y se pierden entre la sucursal, el teléfono y WhatsApp: el cliente tiene que insistir para que lo atiendan.

**Funcional.**

- Al entrar un caso, el sistema lo asigna solo según una regla simple —por tipo, por producto o por sucursal—; los avisos de cambio de estado llegan a quien los necesita. `[3.2.F5]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos críticos llegan solos a quien los tiene que resolver; el cliente ve y abre sus casos y hace sus gestiones más comunes en la app, sin esperar a que lo atienda una persona, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién—, y las conversaciones y los casos se enrutan por múltiples condiciones, como el tipo de caso, el producto o el segmento del cliente. `[3.2.E1]`
- En la app o la banca en línea, el cliente ve sus casos y abre uno nuevo —un reclamo, una consulta—, y hay base de conocimiento interna y pública. `[3.2.E2]`
- El cliente hace solo, en la app o la banca en línea, las gestiones más comunes —descargar su estado de cuenta, pedir una constancia—, sin ir a la sucursal ni llamar. `[3.2.E201 · comprobable]`

**Óptimo.** Un agente de IA resuelve consultas en producción, y lo que se calcula en toda la entidad llega a la ficha del cliente.

*Resultado:* Una parte importante de las consultas se resuelve sin intervención humana, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la entidad sabe de ese cliente a la vista.

- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: el agente ve en la ficha, por ejemplo, qué tan probable es que el cliente se vaya. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.D2`, `3.2.I2`, `3.2.F4`, `3.2.F6`, `3.2.F8`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.O1`.

#### 3.3 Datos

¿Quien atiende ve al instante los productos del cliente y sus casos anteriores, o se los tiene que preguntar?

*Descripción:* Mide si quien atiende ve al instante los productos y los casos del cliente, sin pedirle que repita su historia.

*Costo de quedarse:* Cada vez que el cliente llama tiene que volver a explicar qué producto tiene y qué pasó, y no puedes demostrarle al regulador cuántos reclamos respondiste dentro del plazo.

**Funcional.**

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cuántos reclamos se respondieron dentro del plazo que fija el regulador; quien atiende tiene la historia del cliente en segundos.

- La ficha del cliente muestra los productos que tiene contratados, lo que ha pagado y su valor para la entidad, no solo sus casos. `[3.3.F2]`
- Las propiedades clave del cliente —qué productos tiene y desde cuándo es cliente— están pobladas en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene tipo y motivo —reclamo, consulta o gestión, y por qué—, con una taxonomía definida. `[3.3.F4]`
- Se sabe, con un reporte que sale del sistema, cuántos reclamos se respondieron dentro del plazo que fija el regulador y cuáles se vencieron. `[3.3.F201 · comprobable · requiere 3.1.F201]`

**Eficiente.** Se miden tiempos y satisfacción, y la información del cliente se une con la del área comercial.

*Resultado:* La entidad sabe qué tan rápido y qué tan bien atiende, cuánto tarda un cliente nuevo en usar lo que contrató y qué tan sano está cada cliente, con la satisfacción medida y no supuesta.

- La información del cliente está unificada entre Servicio y el área comercial. `[3.3.E3]`
- Se mide cuánto tarda cada cliente nuevo en usar lo que contrató: el tiempo desde la apertura hasta su primer uso, como la primera compra con su tarjeta o el primer depósito en su cuenta. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente —distinto de su riesgo de crédito—, que combina cómo usa sus productos, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Un modelo de salud de los clientes anticipa quién se puede ir antes de que lo manifieste.

*Resultado:* La entidad sabe qué clientes se pueden ir y cuáles están logrando lo que buscaban, antes de que ellos mismos lo digan, con datos que se mantienen al día solos.

- Hay un modelo de salud de los clientes, activo, predictivo y en uso —distinto de su riesgo de crédito—, que mide tanto su experiencia como si están logrando lo que buscaban con sus productos. `[3.3.O1]`
- Servicio se apoya en el almacén central de datos de la entidad, con reglas claras de quién accede y cómo se mantiene, para anticipar qué clientes se pueden ir. `[3.3.O2]`

*Se leen igual:* `3.3.D1`, `3.3.D2`, `3.3.I1`, `3.3.I2`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.E1`, `3.3.E2`, `3.3.O3`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Quién decide qué se atiende primero, con qué información, y quién responde por los reclamos y sus plazos?

*Descripción:* Mide quién decide qué se atiende primero, con qué información, y cómo se revisan el servicio y sus reclamos.

*Costo de quedarse:* Se atiende primero al que más insiste, los mismos reclamos se repiten porque nadie los revisa, y el regulador se entera antes que la gerencia.

**Deficiente.**

- No hay coordinación entre quien da la bienvenida a los clientes nuevos, quien atiende los casos y quienes acompañan a los clientes clave. `[3.4.D1]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día o si hay reclamos cerca de vencer su plazo.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (casos abiertos, reclamos cerca del plazo que fija el regulador, volumen, casos por tipo) y lo consulta al menos semanalmente. `[3.4.F2]`

**Eficiente.**

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, Servicio le avisa al área comercial cuando un cliente se puede ir, y las áreas que resuelven parte de los casos cumplen lo acordado.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —productos, procedimientos de seguridad y reclamos—; no se le entrena de memoria. `[3.4.E2]`
- El liderazgo orquesta con el área comercial —cada cliente nuevo llega con lo que busca con su producto, y las alertas de que un cliente se puede ir vuelven al área comercial— y con Marketing. `[3.4.E4]`
- El acuerdo con las áreas que resuelven parte de los casos —tarjetas, fraude, operaciones— está escrito y se mide: qué reciben, en cuánto tiempo lo resuelven y por qué devuelven un caso. `[3.4.E201 · comprobable]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.E1`, `3.4.O1`, `3.4.O2`, `3.4.O3`, `3.4.O4`.

#### 3.5 Consistencia de Atención

¿El cliente recibe la misma respuesta y la misma solución en la sucursal, por teléfono o en la app, lo atienda quien lo atienda?

*Descripción:* Mide si el cliente recibe la misma respuesta en cualquier sucursal o canal, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo reclamo se acepta en una sucursal y se rechaza en otra: el cliente lo nota, desconfía y lo cuenta.

**Funcional.** Hay tipos de cliente definidos, respuestas guardadas, una bienvenida estructurada para el cliente nuevo y criterios escritos para resolver cada reclamo.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, el cliente nuevo arranca con una bienvenida clara hasta activar y usar su producto, y un reclamo se resuelve igual en cualquier sucursal o canal.

- Existe un proceso documentado de bienvenida del cliente nuevo, con un resultado definido que debe alcanzar al terminarlo: por ejemplo, que active su tarjeta y la use por primera vez. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende el área —por ejemplo, personas, pymes y banca preferente—, qué necesita cada uno y qué espera del servicio, consultable por cualquier agente. `[3.5.F4]`
- Cada tipo de reclamo tiene escritos sus criterios de resolución —cuándo se devuelve un cobro, cuándo procede un cargo no reconocido—, consultables por quien atiende, en la sucursal o en el centro de contacto. `[3.5.F201 · declarado]`

*Se leen igual:* `3.5.D1`, `3.5.I1`, `3.5.F1`, `3.5.F3`, `3.5.E1`, `3.5.E2`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de Clientes

¿Un fraude, un cliente preferente y una consulta simple se atienden en el orden que corresponde, o todos hacen la misma fila?

*Descripción:* Mide si un fraude se atiende antes que una consulta, y si cada cliente recibe la atención que le corresponde.

*Costo de quedarse:* Tu cliente preferente espera en la misma fila que todos, y un cargo no reconocido se atiende después de una consulta simple.

**Funcional.**

*Resultado:* Un fraude o un cargo no reconocido se atiende primero, los clientes más importantes reciben una atención acorde, y quien atiende no tiene que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja; un fraude o un cargo no reconocido, por ejemplo, es urgente— y los agentes la respetan. `[3.6.F1]`
- La atención se diferencia según los tipos de cliente —por ejemplo, banca preferente, pymes y personas—: cada tipo tiene claro qué nivel de atención recibe. `[3.6.F2]`
- El agente usa la ficha del cliente —sus productos, lo que ha pagado y sus casos abiertos— para dar contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.**

*Resultado:* Cada cliente de banca preferente y cada pyme importante tiene un responsable que lo conoce, el resto de la cartera no queda sola, y la atención cambia según el momento en que está cada cliente.

- Hay un modelo de atención por segmento: cada cliente clave —por ejemplo, de banca preferente o una pyme importante— tiene un responsable dedicado que lo conoce, y el resto de la cartera recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1]`
- Los clientes se segmentan para acciones diferenciadas según el momento de su relación: los que siguen con la entidad, sanos, en riesgo de irse o con potencial para un producto más; los de una sola operación, recién desembolsados, en su primer pago o listos para recomendar. `[3.6.E2]`

**Óptimo.**

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló al contratar.

- La atención se personaliza incluso en el autoservicio de la app o la banca en línea. `[3.6.O1]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le ofreció al contratar y el segmento del que viene—, sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.D1`, `3.6.I1`, `3.6.O2`.

#### 3.7 Proactividad

¿Te adelantas a lo que necesita el cliente —un aviso antes de un cobro, ayuda para activar su tarjeta— y te enteras de que se quiere ir antes de que cancele?

*Descripción:* Mide si el servicio avisa antes de cada cobro o vencimiento y actúa antes de que el cliente se vaya.

*Costo de quedarse:* Te enteras de que un cliente se quiere ir cuando ya pidió cancelar o se llevó su dinero a otra entidad, y un cobro sin aviso te trae un reclamo.

**Funcional.** Lo evidente se atiende antes de que estalle: problemas repetidos, cobros por venir, productos sin activar y pedidos de cancelación.

*Resultado:* Los problemas evidentes y las fechas críticas ya no toman al equipo por sorpresa: el cliente sabe antes cuánto y cuándo se le va a cobrar, quien no activó su producto recibe ayuda, quien pide cancelar recibe una razón para quedarse, y cuando alguno se va, se sabe por qué.

- Un cliente con casos repetidos del mismo problema, un reclamo sin resolver o una mala calificación se identifica, y alguien lo contacta antes de que escale. `[3.7.F1]`
- Los clientes clave reciben contacto antes de una renovación o un vencimiento importante —un certificado a plazo, una línea de crédito, su tarjeta—, no después. `[3.7.F2]`
- Cada cliente que se va de la entidad —cierra sus cuentas o cancela sus productos— deja registrada la razón de su salida. `[3.7.F3]`
- Quien contrató una tarjeta o una cuenta y no llega al resultado que define la bienvenida —activarla y usarla por primera vez— recibe un contacto para ayudarlo a empezar. `[3.7.F201 · comprobable · hábito · relación continua · requiere 3.5.F2]`
- Quien pide cancelar una tarjeta o una cuenta recibe, antes de que se la cierren, una razón para quedarse —una mejor condición, un beneficio—, no solo el trámite del cierre. `[3.7.F202 · comprobable · hábito · relación continua]`
- Antes de cada cobro programado o fecha de pago —la cuota de un crédito, el pago de la tarjeta, una comisión anual—, el cliente recibe un aviso automático con el monto y la fecha. `[3.7.F203 · comprobable · relación continua]`

**Eficiente.** Los clientes que se pueden ir y las gestiones pendientes se ven venir, las atienda el área que sea, y el cliente recibe lo que necesita saber antes de pedirlo.

*Resultado:* Las gestiones del cliente no se pierden entre áreas, sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que escalen; la entidad retiene clientes que antes se iban sin aviso, ve quién está listo para un producto más y sus clientes clave ven qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de que un cliente se puede ir o de que está listo para un producto más. `[3.7.E1]`
- Los clientes clave tienen registrado lo que buscan con sus productos y lo revisan con la entidad en una cadencia fija: qué se logró y qué sigue. `[3.7.E3]`
- Ninguna gestión o molestia del cliente se pierde entre áreas: queda en el sistema aunque la resuelva otra área —tarjetas, operaciones, cobranza—, y hay alertas automáticas cuando una se atrasa, cuando un cliente califica mal o cuando se acerca una fecha crítica —un vencimiento, un cobro, la renovación de una tarjeta—, que le llegan a quien tiene que actuar. `[3.7.E4]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —un cobro, el vencimiento de un certificado, la renovación de su tarjeta, un cambio en las condiciones de su producto—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`
- Los clientes que dan señales de irse —dejan de usar su tarjeta, bajan su saldo, reclaman más— reciben una acción de retención antes de decidir irse. `[3.7.E201 · comprobable · hábito · relación continua]`

**Óptimo.**

*Resultado:* La mayoría de los problemas se resuelven antes de que el cliente los note, y cada cliente siente que la entidad se adelanta a lo que necesita y lo sorprende para bien.

- Los clientes reciben, sin pedirlos, detalles pensados para deleitarlos —la exoneración de una comisión, un beneficio en su aniversario como cliente—, elegidos según su historia y el momento de su relación. `[3.7.O4]`

*No aplican:* `3.7.E2`.

*Se leen igual:* `3.7.D1`, `3.7.D2`, `3.7.I1`, `3.7.O1`, `3.7.O2`, `3.7.O3`.

#### 3.8 Autoservicio

¿El cliente resuelve solo lo simple —un estado de cuenta, una constancia, bloquear o reponer su tarjeta—, o cada gestión necesita a una persona?

*Descripción:* Mide si el cliente resuelve solo lo simple —un estado de cuenta, una constancia, bloquear su tarjeta— sin llamar.

*Costo de quedarse:* Las mismas preguntas pasan siempre por una persona y quien perdió su tarjeta espera en la línea para bloquearla: para crecer tienes que contratar al mismo ritmo.

**Inicial.**

- Para bloquear una tarjeta, el cliente tiene que llamar y esperar a que lo atienda una persona. `[3.8.I201 · comprobable]`

**Funcional.** Las consultas más frecuentes tienen respuesta publicada y, si la entidad emite tarjetas, el cliente bloquea la suya sin esperar a nadie.

*Resultado:* Las preguntas de siempre dejan de consumir al equipo: el cliente encuentra la respuesta publicada y, si tiene tarjeta, la bloquea al instante, a cualquier hora.

- Las consultas que más se repiten —cómo activar una tarjeta, cuánto cuesta una gestión, qué hacer si pierde su tarjeta— tienen una respuesta publicada que el cliente puede leer solo. `[3.8.F1]`
- Si la entidad emite tarjetas, el cliente puede bloquear la suya al instante y a cualquier hora —en la app o por teléfono—, sin esperar a que lo atienda una persona. `[3.8.F202 · comprobable]`

**Eficiente.**

*Resultado:* La entidad puede sumar clientes sin sumar personas en la misma proporción, porque buena parte se resuelve sola.

- Se revisan periódicamente los casos y los reclamos recurrentes y, donde la relación es continua, las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2]`

*Se leen igual:* `3.8.D1`, `3.8.D2`, `3.8.I1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E3`, `3.8.O1`, `3.8.O2`, `3.8.O3`.

## Edición — Educación

Para el área de admisiones de una universidad, un instituto o un centro de formación: parte de los aspirantes se matricula con el acompañamiento de un asesor y parte lo hace sola en línea, y después de la matrícula la relación sigue período tras período.

*Clave:* educacion

*Perfil habitual:* mixta · relación continua.

*Criterios propios:* desde el 301.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Deal | El proceso de admisión de un aspirante |
| Negocio | El proceso de admisión de un aspirante |
| Lead | Aspirante o interesado en un programa |
| Pipeline | El recorrido de la admisión: interés, solicitud, admisión y matrícula |
| Pipeline review | Reunión de seguimiento de admisiones |
| Rep | Asesor de admisiones |
| Vendedor | Asesor de admisiones |
| Propuesta | La oferta de admisión: programa, costo, beca y financiamiento |
| Razón de pérdida | Por qué el aspirante no se matriculó |
| ICP | El perfil de estudiante al que va dirigido cada programa |
| Forecast | Proyección de matrícula |
| MQL | Interesado que Marketing considera listo para pasar a Admisiones, según los criterios que Marketing definió; todavía no es un aspirante calificado: eso lo decide Admisiones |
| Buyer persona | Retrato escrito de un tipo de aspirante, o de la familia que decide o paga con él: quién es, qué le preocupa y cómo decide |
| Ticket | Caso de un estudiante: una consulta, un trámite o un reclamo |

### Área 1 — Admisiones

Mide el rendimiento del área de admisiones: cómo está montada por dentro y qué produce en solicitudes, admitidos y matrículas.

**Deficiente.** Tu matrícula depende de la temporada y de quién atienda. Cada asesor lleva a sus aspirantes en su propia lista, la información de los programas se explica de memoria y nadie sabe cuántos interesados se quedaron sin respuesta.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados se registran, pero el seguimiento depende de cada asesor, los costos y las becas se explican distinto según quién atienda y los números de cada período se arman a mano.

**Funcional.** Tu área de admisiones opera como una maquinaria base. Cada interesado entra al mismo recorrido, la información de cada programa —plan de estudios, costos, becas y fechas— se dice igual en todos los canales, y ningún aspirante se queda esperando sin que alguien reaccione.

**Eficiente.** La matrícula deja de depender del empuje de la última semana. Mides en qué paso se cae cada aspirante y cuántos admitidos no se matriculan, un puntaje te dice a qué aspirante llamar primero y proyectas la matrícula del período con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo decide donde importa. Agentes responden y orientan a toda hora, los modelos dicen qué aspirante necesita qué, y el sistema detecta a quien está por abandonar el proceso antes de que cierre la matrícula.

#### 1.1 Procesos y Rutinas

Si mañana rotan dos asesores clave en plena temporada, ¿el proceso de admisión sigue corriendo igual?

*Descripción:* Mide si la admisión sigue un proceso escrito, con etapas, fechas y cadencias que no dependen de cada asesor.

*Costo de quedarse:* Si se va un asesor en plena temporada, se lleva a sus aspirantes con él: nadie sabe a quién le faltaba un documento, quién ya estaba admitido ni quién esperaba una llamada.

**Deficiente.** Sin proceso. Cada asesor atiende a su manera y la información clave vive en cabezas o libretas.

**Funcional.** Maquinaria base: un solo recorrido de la admisión, atado al calendario de cada período, y seguimiento con cadencia.

*Resultado:* Todo el equipo trabaja la admisión igual: los aspirantes avanzan con los mismos criterios, se les da seguimiento con la cadencia acordada y cada período arranca con sus fechas definidas, así que si rota un asesor, el siguiente sabe en qué va cada aspirante.

- Cualquier asesor explica igual las etapas de la admisión —interés, solicitud, admisión y matrícula— y qué tiene que cumplir un aspirante para avanzar. `[1.1.F1]`
- Cada tipo de programa —pregrado, posgrado, educación continua— tiene su recorrido configurado, con lo que el aspirante tiene que cumplir para avanzar y para ser admitido. `[1.1.F2]`
- Hay proceso de admisión documentado y cadencia de contacto definida (X intentos en Y días) que se cumple la mayoría del tiempo. `[1.1.F4]`
- Cada período de matrícula tiene su calendario escrito antes de empezar —apertura, fechas límite y cierre—, y el equipo trabaja con él. `[1.1.F301 · declarado · hábito]`

**Eficiente.**

*Resultado:* El equipo asesora con un mismo método, y el líder sabe dónde se desvía y corrige con datos, no de memoria.

- Hay una metodología de asesoría formal en uso: el asesor indaga qué busca el aspirante y qué lo frena antes de recomendarle un programa. `[1.1.E1]`
- Existen guías de indagación, orientación y manejo de objeciones —costo, tiempo, modalidad— que el equipo usa. `[1.1.E2]`

*Se leen igual:* `1.1.D1`, `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I1`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F5`, `1.1.F6`, `1.1.E3`, `1.1.O1`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Cuánto del tiempo del asesor se va en tareas que el sistema podría hacer, y cuánto de lo que ya tienes —CRM, sistema académico, solicitud en línea— trabaja junto?

*Descripción:* Mide cuánto trabajo repetitivo hace el sistema y si el CRM y el sistema académico trabajan conectados.

*Costo de quedarse:* Tus asesores pasan datos a mano entre el CRM y el sistema académico, los interesados que escriben de noche esperan hasta el lunes, y pagas herramientas que nadie usa.

**Funcional.** Hay automatización simple en producción, y lo que el aspirante hace en línea entra solo al sistema.

*Resultado:* Ningún interesado se pierde por no saber a quién le toca: la solicitud y la matrícula en línea entran solas, aunque queden a medias; el asesor recibe el aviso, lo que conversa con cada aspirante queda registrado y el aspirante sabe en qué va su proceso sin tener que preguntar.

- Los interesados que entran llegan a una bandeja o cola y se asignan por una regla simple (por turnos, por programa o por sede). `[1.2.F2]`
- Las matrículas que el estudiante hace solo —en línea o por autoservicio— entran solas al sistema como admisiones, con su programa, su monto, su canal y su estudiante. `[1.2.F6]`
- Si los cupos de un programa son limitados, el asesor ve en el sistema cuántos quedan antes de ofrecerlo. `[1.2.F8]`
- Al aspirante le llegan de forma automática la confirmación de su solicitud y un aviso en cada paso: qué documento le falta, si fue admitido y cómo matricularse. `[1.2.F301 · comprobable]`
- La solicitud que el aspirante deja a medias en línea queda guardada en el sistema, con sus datos de contacto. `[1.2.F302 · comprobable · venta sin vendedor]`

**Eficiente.**

*Resultado:* El asesor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los aspirantes.

- El detalle de costos, beca y financiamiento de cada aspirante se genera desde el sistema, no en hojas sueltas. `[1.2.E1]`
- El CRM está integrado con el sistema académico y con el de pagos. `[1.2.E3]`
- El aspirante entrega sus documentos y firma su matrícula de forma digital, sin tener que ir a la sede. `[1.2.E301 · comprobable]`

**Óptimo.** Agentes de IA orientan y precalifican a toda hora; el asesor trabaja con la predicción de quién se va a matricular.

*Resultado:* El asesor dedica su tiempo a las conversaciones que deciden la matrícula: los agentes orientan y agendan, y él trabaja con la predicción de quién se va a matricular y con respuestas sugeridas para cada conversación.

- Hay predicción de qué aspirantes se van a matricular y respuestas sugeridas según el contexto de cada conversación. `[1.2.O1]`
- Agentes de IA orientan, precalifican y agendan citas a toda hora en el canal conversacional, y le pasan al asesor, con el contexto, a quien está listo. `[1.2.O2]`

*Se leen igual:* `1.2.D1`, `1.2.D2`, `1.2.I1`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.O3`.

#### 1.3 Datos

¿Confías en tus números de interesados, de admitidos y de matrícula proyectada, o los validas antes de usarlos?

*Descripción:* Mide si los datos de admisiones son confiables: aspirantes completos, de dónde llegó cada uno y reportes sin reconstruir.

*Costo de quedarse:* Decides con números que no cuadran: la proyección de matrícula se arma a mano, cambia en cada reunión y nadie sabe cuántos aspirantes hay de verdad en proceso.

**Deficiente.**

- La información de los aspirantes está en hojas de cálculo. `[1.3.D3]`
- No hay registro de qué programa pidió cada aspirante ni de en qué quedó. `[1.3.D4]`

**Inicial.**

- No se está guardando toda la información necesaria de los aspirantes. `[1.3.I3]`

**Funcional.** El reporte de admisiones describe el estado actual con confianza, sin reconstrucción.

*Resultado:* El líder ve cuántos aspirantes hay en cada etapa y en cada programa cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada uno.

- Todo aspirante en proceso tiene programa, período de ingreso, monto estimado y asesor responsable. `[1.3.F1]`
- Todo aspirante tiene rastreable por qué canal llegó: feria, colegio, campaña, web o referido. `[1.3.F3]`
- El reporte de admisiones en curso se genera del sistema sin reconstruir números, y refleja el estado actual, no una proyección. `[1.3.F4]`
- La documentación sobre el perfil de estudiante de cada programa no se deja envejecer. `[1.3.F5]`
- La definición de aspirante calificado no se deja envejecer. `[1.3.F6]`
- La documentación sobre los programas —plan de estudios, costos, becas y requisitos— no se deja envejecer. `[1.3.F7]`
- Si el aspirante es menor de edad, queda registrado el permiso de su responsable para que lo contacten. `[1.3.F301 · comprobable]`

**Eficiente.** Aparece la proyección de matrícula por programa, y la ficha del aspirante reúne lo académico y lo financiero.

*Resultado:* La institución puede comprometer una matrícula por programa con confianza, y planear cupos, docentes y aulas con ese número.

- Hay una proyección de matrícula por programa con cadencia fija (semanal o quincenal) y precisión alta. `[1.3.E1]`
- La ficha de cada aspirante reúne lo de admisiones con lo que viene de otros sistemas —lo académico, los pagos, la beca— y con su historial de conversaciones: la vista 360° empieza a tomar forma. `[1.3.E3]`

**Óptimo.**

*Resultado:* La proyección de matrícula se anticipa a lo que va a pasar, cruzando lo de admisiones con lo académico y lo financiero, y los datos están al día sin que nadie tenga que cuidarlos.

- Admisiones se apoya en el almacén central de datos de la institución para su proyección, cruzando lo de admisiones con lo académico y lo financiero. `[1.3.O4]`

*No aplican:* `1.3.F8`, `1.3.E4`.

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.I1`, `1.3.I2`, `1.3.F2`, `1.3.E2`, `1.3.O1`, `1.3.O2`, `1.3.O3`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿El liderazgo de admisiones decide con datos o con intuición, y con qué cadencia revisa el avance del período?

*Descripción:* Mide si el liderazgo gestiona con roles claros, metas por programa y asesor, datos y una revisión de cadencia fija.

*Costo de quedarse:* La dirección se entera de que un programa no abre cuando ya cerró la matrícula: no vio antes qué programa iba atrasado, ni por qué.

**Funcional.**

*Resultado:* Cada asesor sabe qué se espera de él, y el líder sabe cada semana qué programa va bien y cuál necesita ayuda, antes de que cierre la matrícula.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (interesados, solicitudes, admitidos, matriculados, avance contra la meta de cada programa) y lo consulta al menos semanalmente. `[1.4.F2]`
- Cada programa, cada asesor y el canal en línea tienen una meta de matrícula clara, y su avance se reporta en cadencia fija. `[1.4.F4]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con Marketing y con las áreas académica y financiera, y escucha al equipo.

*Resultado:* Un asesor nuevo produce más rápido, el traspaso de interesados con Marketing tiene reglas que se cumplen, las respuestas de lo académico y de lo financiero llegan en el plazo acordado, y lo que el equipo ve que no funciona llega a quien puede cambiarlo.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —programas, costos, becas y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con las áreas académica y financiera está escrito y se mide: en cuánto tiempo se resuelve una admisión, una convalidación o una beca. `[1.4.E301 · comprobable]`

**Óptimo.** El liderazgo decide con analítica avanzada y sostiene mesas de innovación en admisiones.

*Resultado:* La dirección decide dónde invertir con números de fondo: qué programa y qué canal dejan más margen, qué cohorte permanece más y qué asesor aporta más.

- Las decisiones usan analítica avanzada (rentabilidad por programa y por canal, permanencia de cada cohorte, aporte de cada asesor). `[1.4.O1]`
- Hay mesas regulares de innovación en admisiones. `[1.4.O2]`

*Se leen igual:* `1.4.D1`, `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F3`, `1.4.F5`, `1.4.E3`, `1.4.E4`.

#### 1.5 Oferta académica

¿El aspirante recibe la misma información del programa —plan de estudios, costos, becas y fechas—, lo atienda quien lo atienda y por el canal que sea?

*Descripción:* Mide si el equipo sabe para quién es cada programa y si su información se dice igual en cada canal.

*Costo de quedarse:* Cada asesor explica el programa a su manera y el costo cambia según quién atienda: el aspirante no ve qué te hace distinto y termina eligiendo por precio o por cercanía.

**Deficiente.** El aspirante recibe información distinta según quién lo atienda; los costos y las becas se explican de memoria.

- La información que recibe el aspirante cambia según quién lo atienda o por dónde pregunte. `[1.5.D1]`

**Inicial.** Hay fichas de algunos programas, pero no todos las usan: la información todavía varía entre asesores y entre canales.

**Funcional.** El perfil de estudiante de cada programa está escrito, y su información se dice igual en todos los canales.

*Resultado:* Dos aspirantes parecidos reciben la misma información del programa —plan de estudios, costos, becas, fechas y requisitos— sin importar qué asesor los atienda ni por qué canal lleguen.

- Existe un documento con el perfil de estudiante de cada programa —a quién va dirigido y qué busca—, consultable por cualquier asesor. `[1.5.F1]`
- El líder puede explicar a quién va dirigido cada programa sin consultar su documentación. `[1.5.F2]`
- Un aspirante que habla con dos asesores recibe el mismo mensaje de valor base. `[1.5.F3]`
- Las ofertas de admisión están estandarizadas: todo aspirante recibe su detalle de costos, beca y financiamiento con la misma estructura, no armado desde cero cada vez. `[1.5.F4]`
- Los costos, las becas y los requisitos de cada programa son los mismos en la sede, por teléfono y en línea, o la diferencia es a propósito y está escrita. `[1.5.F5]`
- Cada programa tiene una ficha vigente para el aspirante —plan de estudios, duración, modalidad, costos, becas, requisitos y fechas— publicada en los canales donde se ofrece. `[1.5.F301 · comprobable]`

**Eficiente.** La oferta se distingue de la de otras instituciones y solo promete lo que el programa entrega.

*Resultado:* El mercado reconoce a la institución por algo concreto, la oferta se sostiene igual en cada contacto, y lo que se le prometió al aspirante es lo que encuentra cuando empieza a estudiar.

- Las ofertas solo prometen lo que el programa entrega: lo que se dice de convalidaciones, horarios, modalidad y salida laboral se valida antes de decirlo. `[1.5.E3]`
- Se les pregunta a los estudiantes nuevos si lo que encontraron es lo que se les ofreció, y lo que no coincide se corrige en la ficha o en lo que dice el asesor. `[1.5.E301 · comprobable · hábito]`

**Óptimo.** La IA mantiene coherente la información de cada programa en cada punto de contacto, sin trabajo manual.

- La IA mantiene coherente la información de cada programa en todos los canales en tiempo real, sin trabajo manual. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.E2`.

#### 1.6 Priorización de aspirantes

¿El equipo le dedica el tiempo a quien encaja con el programa y puede matricularse, o atiende a todos por igual?

*Descripción:* Mide si el equipo decide a qué aspirantes dedicar su tiempo con criterios escritos, según el perfil de cada programa.

*Costo de quedarse:* Tus asesores le dedican el mismo esfuerzo a quien solo pidió un folleto que a quien ya entregó sus documentos, y los aspirantes listos para matricularse esperan su turno.

**Deficiente.** Se atiende a los interesados por orden de llegada, sin distinguir quién quiere ingresar este período.

- Se atiende igual a quien pidió información hace un año que a quien quiere ingresar este período. `[1.6.D301 · evaluado]`

**Funcional.** Hay segmentación básica de aspirantes y una definición escrita de aspirante calificado.

*Resultado:* El equipo deja de perseguir a quien no va a ingresar y concentra el esfuerzo en los aspirantes que encajan con el programa y pueden matricularse este período.

- El equipo segmenta a los aspirantes por los atributos del perfil de estudiante antes de trabajarlos: programa de interés, nivel de estudios, zona, edad o situación laboral. `[1.6.F1]`
- Hay una definición escrita de aspirante calificado —los criterios para que un asesor lo trabaje: cumple los requisitos del programa y quiere ingresar en el período— y se aplica de forma consistente. `[1.6.F2]`
- El esfuerzo se enfoca en los aspirantes que encajan con el perfil de estudiante del programa. `[1.6.F3]`
- La documentación del perfil de estudiante se usa en la arquitectura de CRM y en los formularios de interés y de solicitud. `[1.6.F4]`

**Eficiente.** Aparece el puntaje de aspirantes por reglas, y los colegios y los segmentos que más importan.

*Resultado:* Cada asesor sabe cada mañana a quién llamar primero, y los colegios, las empresas y los segmentos que más matrícula traen se trabajan de forma deliberada.

- Hay un puntaje de aspirantes por reglas activo: un modelo que suma puntos por varios atributos —programa, requisitos cumplidos, interacción, cercanía del período—, no una regla sobre una propiedad. `[1.6.E1]`
- Los colegios, las empresas o los segmentos prioritarios están identificados formalmente. `[1.6.E2]`
- El contacto con los aspirantes usa mensajes personalizados por programa y por segmento; la priorización empieza a ser proactiva por data. `[1.6.E3]`

**Óptimo.** Agentes de IA priorizan sobre el contexto completo de cada aspirante y proponen la siguiente acción.

*Resultado:* El sistema dice a qué aspirante atender, qué hacer con él y cuándo, con lo que saben Servicio y Marketing de cada uno.

- La personalización se adapta en tiempo real a cada persona que participa en la decisión: el aspirante y, cuando corresponde, su familia o su empresa. `[1.6.O3]`

*Se leen igual:* `1.6.D1`, `1.6.I1`, `1.6.I2`, `1.6.O1`, `1.6.O2`, `1.6.O4`.

#### 1.7 Avance de la admisión

¿Qué pasa con el aspirante que dejó de contestar, o con el admitido que todavía no se matricula?

*Descripción:* Mide si alguien detecta cuando un aspirante deja de avanzar y si hay una respuesta acordada para retomarlo.

*Costo de quedarse:* Los aspirantes se enfrían en silencio: nadie ve quién dejó de contestar ni qué admitido no se matriculó, y el período cierra con cupos vacíos.

**Deficiente.** El asesor está solo con sus aspirantes, y contacta por un solo canal.

- No hay materiales para presentarle al aspirante y apoyar su decisión. `[1.7.D4]`
- Las solicitudes que el aspirante deja a medias en línea no las retoma nadie. `[1.7.D301 · comprobable · venta sin vendedor]`

**Inicial.** Hay seguimiento, pero depende de que cada asesor se acuerde.

- Cada asesor tiene sus propios materiales para ayudarse con los aspirantes. `[1.7.I3]`

**Funcional.** Ningún aspirante se enfría en silencio, y ningún admitido se queda sin matricular sin que alguien reaccione.

*Resultado:* Los aspirantes que dejan de avanzar se detectan a tiempo y se retoman por más de un canal, con material estandarizado y con el líder actuando mientras todavía hay cupo y fecha; y quien ya fue admitido recibe acompañamiento hasta que se matricula.

- Los aspirantes detenidos —sin respuesta, sin documentos o sin pago— se reconocen a tiempo y tienen un paso acordado para retomarlos, no la improvisación de cada asesor. `[1.7.F1]`
- El seguimiento usa al menos dos canales, por ejemplo llamada y el canal conversacional, como WhatsApp. `[1.7.F2]`
- Hay materiales estandarizados que ayudan a decidir la matrícula: plan de estudios, testimonios y simulador de costos. `[1.7.F4]`
- Los estudiantes que ya deberían haberse inscrito en un curso siguiente se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos. `[1.7.F5]`
- Todo aspirante admitido que no se ha matriculado recibe seguimiento hasta que se matricula o dice que no. `[1.7.F301 · comprobable · hábito]`
- Las solicitudes que el aspirante deja a medias en línea reciben un recordatorio o una llamada dentro del plazo acordado. `[1.7.F302 · comprobable · hábito · venta sin vendedor · requiere 1.2.F302]`

**Eficiente.** El seguimiento es multicanal, el sistema le avisa al líder de lo que se traba y quien no ingresó este período sigue en nutrición para el siguiente.

*Resultado:* Ningún aspirante espera a la reunión para recibir ayuda, quien no ingresó este período vuelve a recibir la invitación para el siguiente, y se sabe cuántos de los que se enfrían se recuperan.

- Los aspirantes que no ingresan este período no se abandonan: vuelven a nutrición y regresan a Admisiones cuando se acerca el siguiente o muestran interés. `[1.7.E2]`
- Los materiales de admisión viven en una biblioteca central. `[1.7.E3]`
- Cuando un aspirante lleva más tiempo del acordado sin avanzar, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántos admitidos no se matriculan y cuántos aspirantes detenidos se recuperan, por programa. `[1.7.E301 · comprobable]`

**Óptimo.** El sistema detecta al aspirante que está por abandonar y actúa antes de que cierre la matrícula.

*Resultado:* Los aspirantes con más posibilidades reciben ayuda justo cuando la necesitan: el sistema detecta cuándo alguien deja de avanzar y moviliza a quien corresponde.

- El sistema detecta qué aspirante está por abandonar el proceso y responde en el momento: un mensaje, una alerta a la dirección o el aviso al asesor sobre los que más importan. `[1.7.O1]`
- El canal y el momento de cada seguimiento se autoajustan según el comportamiento del aspirante. `[1.7.O2]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.I1`, `1.7.I2`, `1.7.I4`, `1.7.F3`, `1.7.E1`.

#### 1.8 Matrículas ganadas y perdidas

¿El equipo sabe por qué un aspirante no se matricula, y lo usa para mejorar el siguiente período?

*Descripción:* Mide si se registra por qué cada aspirante no se matricula y si eso se usa para el siguiente período.

*Costo de quedarse:* Pierdes aspirantes por las mismas razones cada período —el costo, el horario, una respuesta que tardó— porque nadie registra por qué no se matriculan.

**Deficiente.** Nadie mira por qué un aspirante no se matricula.

**Inicial.** Se comenta de vez en cuando por qué alguien no se matriculó, sin registro.

**Funcional.**

*Resultado:* El líder sabe por qué no se matriculan los aspirantes —y cuántos eligieron otra institución— y por qué no empiezan clases algunos de los que se matricularon, con datos del período y no con impresiones.

- Todo aspirante que no se matriculó tiene registrada su razón. `[1.8.F1]`
- Las razones por las que un aspirante no se matricula usan una lista definida, no texto libre. `[1.8.F2]`
- El líder puede sacar un reporte del período de por qué no se matricularon los aspirantes, sin reconstruir. `[1.8.F3]`
- Cuando el aspirante eligió otra institución, queda registrado cuál. `[1.8.F301 · comprobable]`
- Cada matrícula que no llega a clases —quien se matriculó y no empezó— deja registrada su razón. `[1.8.F302 · comprobable]`

**Eficiente.** Se revisa con cadencia por qué se ganan y por qué se pierden las matrículas, y lo aprendido vuelve al proceso y a la capacitación.

*Resultado:* Los mismos motivos dejan de repetirse: lo que se aprende de cada aspirante que no ingresó, y de por qué sí ingresaron los demás, vuelve al proceso y a la capacitación del equipo.

- Se revisan periódicamente los aspirantes que se matricularon y los que no para identificar patrones. `[1.8.E1]`
- Hay capacitación recurrente y formal para el equipo de admisiones. `[1.8.E3]`
- También se registra por qué se matricularon los que sí: qué pesó en su decisión. `[1.8.E301 · comprobable]`

**Óptimo.**

- La estrategia de admisiones se ajusta con base en data de qué funciona. `[1.8.O3]`
- La IA detecta en qué paso y por qué se caen los aspirantes, y propone el cambio. `[1.8.O301 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.D2`, `1.8.I1`, `1.8.E2`, `1.8.O1`, `1.8.O2`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing de la institución: cómo está montada por dentro y qué produce en interesados y aspirantes para cada período de admisión.

**Deficiente.** Tu institución no controla su marca: la define lo que se comenta de ella. Cada facultad y cada programa se comunican a su manera, las herramientas están sueltas y sin conectar, y las campañas de admisión corren hasta agotar el presupuesto sin que nadie mida qué dejaron. Los interesados llegan por casualidad.

**Inicial.** Tienes logo, colores y plantillas, pero sin estrategia detrás. Las herramientas existen, subutilizadas y en silos; el contenido sale de forma reactiva, cuando se acerca la matrícula, y el análisis llega tarde: cuando el período ya cerró. Los interesados llegan de forma irregular y no sabes de dónde vienen.

**Funcional.** El área dejó de depender de héroes. Tienes documentados la marca, los perfiles de tus aspirantes y tu presencia digital; las herramientas que pagas se usan de verdad, y la campaña de cada período arranca antes de que abran las solicitudes y sale coordinada por correo, pauta, redes y el canal conversacional, como WhatsApp, bajo un mismo calendario y sabiendo cuánto cuesta cada interesado en cada canal. Los números salen del sistema sin armarlos a mano. Los interesados llegan calificados y en cantidades que puedes prever, aunque la optimización fina todavía no existe.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la campaña del siguiente período. Los datos están unificados, enriquecidos y atribuidos hasta la matrícula; la segmentación y el puntaje de los interesados se automatizan; la IA asiste al equipo en su trabajo diario; y cuando alguien busca qué estudiar, tu institución aparece tanto en buscadores como en asistentes de IA. El presupuesto se reparte entre canales sabiendo cuánto cuesta cada matrícula.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada programa se genera y se optimiza en ciclo continuo, la IA identifica micro-segmentos y adapta el mensaje a lo que hace cada interesado, los modelos mueven el presupuesto entre canales sobre la marcha, y los estudiantes y egresados que Servicio vuelve promotores traen aspirantes nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

Si mañana se va quien arma las campañas, ¿la campaña de admisión del próximo período sale a tiempo?

*Descripción:* Mide si las campañas de cada período salen de un calendario y un proceso compartidos, sin depender de nadie.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona se va antes de la temporada, la campaña del período sale tarde y los interesados llegan cuando la matrícula ya cerró.

**Deficiente.** Cada quien arma las campañas a su criterio; no hay calendario ni reuniones.

- No existe un calendario de campañas: las de cada período se improvisan cuando se acerca la matrícula. `[2.1.D1]`

**Inicial.**

- Existen briefs informales y un calendario de campañas irregular. `[2.1.I1]`

**Funcional.**

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la campaña de cada período sale aunque cambie una persona: arranca antes de que abran las solicitudes, el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- Existe un calendario de campañas y contenidos visible para el equipo, con horizonte de al menos un trimestre. `[2.1.F1]`
- La campaña de cada período se planea desde las fechas de admisión: arranca antes de que abran las solicitudes y sigue hasta que cierra la matrícula. `[2.1.F301 · declarado · hábito]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I2`, `2.1.I3`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E2`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Cuánto del trabajo de las campañas hacen los flujos automáticos y la IA, y cuánto de las herramientas que pagas se aprovecha?

*Descripción:* Mide cuánto del marketing de la institución hacen los flujos automáticos y la IA, y cuánto se aprovechan las herramientas.

*Costo de quedarse:* Pagas herramientas que no usas y haces a mano los envíos de cada campaña, mientras los interesados que llegan de una feria o de la web esperan días por una respuesta.

**Inicial.**

- La institución paga licencias cuyo valor no extrae. `[2.2.I1]`

**Funcional.**

*Resultado:* Todo interesado que llega por el sitio, por una feria o una charla, o por el canal conversacional, como WhatsApp, entra al sistema y recibe respuesta.

- Los formularios del sitio —los de cada programa y los de las páginas de campaña— están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Si la institución capta en ferias, charlas en colegios o visitas al campus, quien se registra ahí entra solo al sistema —por un formulario o un código QR—, no en listas que alguien digita después. `[2.2.F301 · comprobable]`

**Eficiente.**

*Resultado:* Los interesados reciben solos lo que necesitan hasta estar listos para hablar con un asesor de admisiones, la conversación con cada uno no depende de que alguien se acuerde de escribirle, y el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nutrición de varios pasos, con ramificación y tiempos de espera. `[2.2.E1]`
- El traspaso de los interesados a Admisiones está automatizado. `[2.2.E3]`

**Óptimo.** La IA orquesta el recorrido completo y conversa con cada interesado de forma automatizada.

*Resultado:* Cada interesado vive un recorrido pensado para él: la IA decide el siguiente paso y conversa en el momento, con información que se calcula en toda la institución.

- Agentes de IA atienden el canal conversacional: responden lo que generan las campañas y siguen la conversación con quien todavía no está listo para hablar con un asesor de admisiones. `[2.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a las herramientas de marketing: la segmentación usa, por ejemplo, cuánto permanece cada perfil de estudiante, calculado con lo académico y lo financiero. `[2.2.O3]`

*Se leen igual:* `2.2.D1`, `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.O1`.

#### 2.3 Datos

¿Sabes qué canal te trae aspirantes que se matriculan, o mueves el presupuesto con reportes que hay que validar a mano?

*Descripción:* Mide si los datos de marketing dicen qué canal trae aspirantes que se matriculan, para mover el presupuesto con confianza.

*Costo de quedarse:* No sabes qué canal trae matrículas y cuál solo trae interesados que nunca se inscriben: mueves el presupuesto a ciegas, porque cada reporte hay que validarlo antes de creerle.

**Funcional.**

*Resultado:* El líder sabe de dónde viene cada interesado —la feria, el colegio, la campaña o la web—, con reportes que salen del sistema y no de una planilla armada a mano.

- Todo contacto nuevo —entre por un formulario, una conversación, una feria, una charla en un colegio o una solicitud en línea— tiene poblados la etapa del ciclo de vida y su origen. `[2.3.F1]`
- Las propiedades que describen el perfil de estudiante de cada programa —programa de interés, nivel de estudios, colegio o empresa de donde viene y modalidad que busca— están en los formularios críticos y se capturan en la mayoría de los registros. `[2.3.F2]`
- Los duplicados —el mismo interesado que se registra en varias ferias o formularios— están bajo control, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada matrícula, no solo cuál trajo el primer clic.

- La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último, e incluye todos los canales —también el conversacional, las ferias y las visitas—: se sabe cuánto ingreso deja cada uno en matrículas. `[2.3.E2]`

**Óptimo.**

*Resultado:* La atribución toma en cuenta todo lo que pasa en la institución —admisiones, lo académico y los pagos—, no solo lo que ve Marketing, y los datos se mantienen confiables sin que el equipo tenga que cuidarlos.

- Marketing se apoya en el almacén central de datos de la institución, donde se junta la información de todos sus sistemas —admisiones, lo académico y los pagos—, y atribuye resultados con esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.D1`, `2.3.D2`, `2.3.I1`, `2.3.I2`, `2.3.F5`, `2.3.F6`, `2.3.F7`, `2.3.E1`, `2.3.E3`, `2.3.O3`, `2.3.O4`.

#### 2.4 Equipo y Gobierno

¿Quién decide qué programas se promocionan, cuánto se invierte y en qué canal, con qué datos y con qué cadencia?

*Descripción:* Mide quién decide qué programas se promocionan y dónde se invierte, con qué datos y con qué cadencia de revisión.

*Costo de quedarse:* Qué programa se empuja y cuánto se invierte se decide por costumbre o por quien insiste más, y nadie puede demostrar qué inversión trajo matrículas.

**Inicial.**

- Las decisiones operativas escalan a la rectoría, a la dirección general o a quien dirige marketing. `[2.4.I1]`

**Funcional.**

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (interesados por programa, origen, tasa de MQL, conversión a solicitud) y lo consulta al menos semanalmente. `[2.4.F2]`
- El equipo tiene metas mensuales o trimestrales —interesados y solicitudes por programa—, y en la reunión de performance rinde cuentas por ellas. `[2.4.F3]`
- Las decisiones de presupuesto y de qué programas empujar citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con Admisiones y escucha al equipo.

*Resultado:* Una persona nueva se integra rápido, y Marketing y Admisiones trabajan con reglas acordadas en vez de reclamarse los aspirantes.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —la marca, los programas y las herramientas—; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo orquesta con Admisiones —el traspaso de interesados, los SLA y una cadencia conjunta en cada período— y con Servicio. `[2.4.E3]`

**Óptimo.**

- Las decisiones usan analítica avanzada, como lo que deja cada canal —lo que pagan en toda su carrera los estudiantes que trae— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

#### 2.5 Marca y reputación

¿Los aspirantes y sus familias te encuentran cuando buscan qué estudiar, entienden qué te hace distinto y confían en ti?

*Descripción:* Mide si aspirantes y familias encuentran la institución, entienden qué la distingue y confían en ella por su reputación.

*Costo de quedarse:* Quien busca qué estudiar encuentra primero a otra institución, o te encuentra y no entiende qué la hace distinta, ni él ni su familia.

**Deficiente.** Cada facultad y cada programa se comunican a su manera: no hay una voz de la institución y los mensajes cambian de una pieza a otra.

- Cada facultad o programa se comunica con su propia marca y su propio estilo. `[2.5.D301 · evaluado]`

**Inicial.**

- Hay logo, colores y plantillas, pero el buyer persona es muy general, como «jóvenes que salen del colegio». `[2.5.I1]`

**Funcional.**

*Resultado:* La institución se ve y suena igual en todo lo que sale, venga de la facultad que venga, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Existe una guía corta de la voz de la institución, escrita y aplicada a piezas recientes, también a las de las facultades y los programas. `[2.5.F2]`
- Hay 2-3 buyer personas escritos —por ejemplo, el joven que sale del colegio, el adulto que estudia mientras trabaja y la familia que decide o paga— con journey básico por etapa. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: en el blog o en el formato que use la institución, como videos de sus programas, historias de estudiantes o guías para elegir carrera. `[2.5.F5]`

**Eficiente.**

*Resultado:* La institución aparece cuando los aspirantes y sus familias buscan qué y dónde estudiar, tanto en buscadores como en asistentes de IA, con contenido pensado para cada programa y cada perfil que importan, y lo que dicen de ella sus estudiantes y egresados juega a su favor.

- Los buyer personas están detallados para cada segmento de alto valor: por ejemplo, un posgrado o una carrera que la institución quiere hacer crecer. `[2.5.E1]`
- El contenido está organizado por temas —por ejemplo, un área de estudio o una carrera—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido del aspirante —de la primera búsqueda a la matrícula, con sus ferias, visitas y conversaciones— está mapeado con puntos de contacto definidos. `[2.5.E4]`
- Las reseñas y calificaciones públicas se piden a estudiantes y egresados satisfechos y se responden con una cadencia fija. `[2.5.E5]`
- Las pruebas de la reputación de la institución —las acreditaciones y los rankings que tenga, y lo que logran sus egresados— están a la vista en el sitio y en las campañas, y se actualizan cada período. `[2.5.E301 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La presencia se mantiene vigente sola: el contenido se produce y se ajusta de forma continua para cada perfil de aspirante y cada forma de buscar.

- Los buyer personas están hiper-segmentados, casi al nivel de cada aspirante. `[2.5.O1]`

*Se leen igual:* `2.5.D1`, `2.5.D2`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F4`, `2.5.E3`, `2.5.O2`.

#### 2.6 Segmentación

¿Cada interesado recibe lo que corresponde a su programa, su nivel y su momento, o todos reciben la misma campaña?

*Descripción:* Mide si cada interesado y su familia reciben mensajes pensados para su programa, su nivel y su modalidad.

*Costo de quedarse:* Le mandas la misma campaña a quien busca un técnico que a quien busca un posgrado: el mensaje no le habla a nadie, y la familia que paga nunca recibe lo que necesita saber.

**Inicial.**

- Las campañas se diseñan para la masa: la misma pieza sirve para todos los programas. `[2.6.I2]`

**Funcional.**

*Resultado:* Cada programa y cada perfil reciben un mensaje pensado para ellos, la familia recibe lo que necesita saber para decidir, y Admisiones recibe interesados que Marketing ya clasificó con criterios claros.

- Existen al menos 2 segmentos definidos con criterios escritos, por ejemplo por nivel, programa o modalidad. `[2.6.F1]`
- Existen criterios documentados de qué es un suscriptor, un interesado y un MQL, y Marketing clasifica según ellos, a mano o con una automatización simple sobre las propiedades de calificación. `[2.6.F4]`
- Si la familia participa en la decisión —porque decide, acompaña o paga—, las campañas también le hablan a ella, con piezas propias y distintas de las del aspirante. `[2.6.F301 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y Admisiones recibe primero a los interesados con más probabilidad de matricularse.

- Hay un puntaje de interesados por reglas: un modelo que suma puntos por varios atributos —programa de interés, interacción, asistencia a eventos— y califica al pasar un umbral, cuyo puntaje dispara las secuencias de nutrición. Se distingue de la clasificación de Funcional, que responde a un valor de propiedad sin modelo de puntaje detrás. `[2.6.E3]`
- La segmentación usa datos de comportamiento —qué abrió, qué páginas de programas visitó, a qué evento fue—, no solo lo que la persona declaró. `[2.6.E4]`

*Se leen igual:* `2.6.D1`, `2.6.D2`, `2.6.I1`, `2.6.F3`, `2.6.E1`, `2.6.E2`, `2.6.O1`, `2.6.O3`.

#### 2.7 Canales y captación

¿Llegas a los aspirantes que cada programa necesita, por los canales correctos y con un costo que conoces?

*Descripción:* Mide si los canales —digitales, ferias y colegios— traen aspirantes con cadencia, bajo un mismo plan y con costo conocido.

*Costo de quedarse:* Tu captación depende de la feria de siempre y de la pauta que alguien se acuerda de activar: los canales salen sueltos y no sabes cuánto te cuesta cada aspirante.

**Inicial.**

- Cada canal va por su cuenta —las ferias por un lado, la pauta por otro—: no hay calendario común ni campaña que los atraviese. `[2.7.I3]`

**Funcional.**

*Resultado:* La campaña de cada período sale coordinada por los cuatro canales en vez de cuatro esfuerzos sueltos, y el líder sabe cuánto le cuesta cada interesado según de dónde venga.

- Hay al menos una campaña de pauta pagada corriendo con presupuesto definido (Google, Meta o el canal que usen sus aspirantes). `[2.7.F3]`
- Los cuatro canales siguen el mismo calendario y la misma campaña: la de admisión de cada período sale coordinada en email, pauta, orgánico y el canal conversacional, no como cuatro esfuerzos sueltos. `[2.7.F5]`
- El líder puede decir cuánto costó cada interesado —o cada matrícula, donde el estudiante se matricula solo en línea— el último mes, al menos por canal. `[2.7.F6]`

**Eficiente.**

*Resultado:* La inversión se mueve hacia el canal que trae matrículas al menor costo, los canales se refuerzan entre sí en vez de competir por el mismo interesado, y los estudiantes y egresados recomiendan la institución.

- Los canales, incluido el conversacional, comparten datos y se alimentan entre sí: uno continúa lo que empezó otro —quien fue a una feria ve después la pauta de su programa—, hay remarketing activo y las audiencias se construyen desde el CRM. `[2.7.E1]`
- Hay ferias, charlas en colegios, visitas al campus, días de puertas abiertas o webinars como canal recurrente. `[2.7.E2]`
- Hay un programa de embajadores activo: estudiantes y egresados saben cómo recomendar la institución, y cada aspirante referido queda registrado con quién lo trajo. `[2.7.E4]`
- El líder sabe cuánto costó cada matrícula del último período en cada canal —pauta, ferias, colegios, referidos—, no solo cada interesado. `[2.7.E301 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más matrículas deja, los estudiantes y egresados satisfechos traen aspirantes nuevos, y la institución llega antes que las demás a los canales nuevos.

- Los estudiantes y egresados que Servicio identifica como promotores se vuelven embajadores y testimonios de la institución, sin pedirlos a mano. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.D2`, `2.7.I1`, `2.7.I2`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.E3`, `2.7.O1`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Cada período de admisión te enseña qué campaña trajo matrículas, o repites la del año pasado?

*Descripción:* Mide si cada campaña se evalúa por las matrículas que dejó y si deja un aprendizaje para el siguiente período.

*Costo de quedarse:* Repites cada período la campaña de siempre sin saber cuál trajo matrículas: el presupuesto se reparte por costumbre, no por retorno.

**Deficiente.**

- Lo que dejó la campaña de un período no se usa para planear la del siguiente. `[2.8.D3]`

**Inicial.** Se analiza solo cuando cierra la matrícula, cuando ya no hay nada que corregir.

- Las métricas son básicas (clics, likes) sin conexión clara con lo que cuesta cada matrícula. `[2.8.I1]`

**Funcional.**

*Resultado:* El equipo ve cuántos aspirantes y matrículas dejó cada campaña sin armar el número a mano, y cada período deja una lección escrita para el siguiente.

- Cada campaña significativa —como la de admisión de cada período— tiene una revisión de cierre documentada (qué funcionó, qué no). `[2.8.F3]`
- Los resultados de cada campaña —los aspirantes o las matrículas que trajo, no solo los clics o los asistentes— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

- El proceso de campaña y la planificación del siguiente período se refinan con base en lo aprendido. `[2.8.E3]`

**Óptimo.**

*Resultado:* Las campañas mejoran mientras están corriendo, no recién cuando cierra la matrícula.

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.I2`, `2.8.E1`, `2.8.E2`, `2.8.O2`.

### Área 3 — Servicio

Mide el rendimiento del área de servicio al estudiante, que cubre todo lo que pasa después de la matrícula: desde los trámites y las consultas de cada período hasta que el estudiante termina lo que vino a estudiar. Mira cómo está montada por dentro y qué produce en atención, permanencia y rematrícula.

**Deficiente.** La atención se improvisa estudiante por estudiante. No hay un proceso ni respuestas comunes —cada persona responde con su propio criterio—, los datos del estudiante están repartidos entre oficinas y todo depende de que la persona correcta esté disponible. La deserción te toma por sorpresa.

**Inicial.** El conocimiento y la coordinación viven en una sola persona, y eso te deja con un punto único de fallo. Hay un sistema para los casos de los estudiantes, pero pocos lo usan; hay plantillas para los trámites más frecuentes y procesos que nadie formalizó. La atención es frágil.

**Funcional.** Tu atención al estudiante es consistente y ya no depende de una persona. Sabes qué tipos de estudiante atiendes y qué espera cada uno. Cada caso sigue un recorrido configurado, cada período arranca con su calendario de trámites, el equipo atiende en el sistema central con la ficha del estudiante a la vista, los casos están clasificados y la inducción del estudiante nuevo es estructurada. Priorizas por urgencia, tienes respuestas guardadas para lo repetitivo y detectas a mano al estudiante en riesgo de dejar antes de que se vaya. Todavía no hay alertas automáticas, pero ya no esperas a que el estudiante deje de venir.

**Eficiente.** La atención empieza a adelantarse al problema. Tienes plazos de respuesta, escalación automática y trámites en línea, y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción, y los datos del estudiante se unifican con los de Admisiones. Ves venir el riesgo de deserción antes de que el estudiante lo diga, ningún trámite se pierde entre oficinas, y los estudiantes de los grupos clave tienen un consejero que los conoce. La permanencia se vuelve predecible.

**Óptimo.** Un agente de IA resuelve las consultas de los estudiantes y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y atiende las excepciones; un modelo anticipa qué estudiante puede dejar antes de que lo manifieste, y cada estudiante se atiende sabiendo lo que se le prometió en su admisión y recibe detalles pensados para deleitarlo. Atender a un estudiante más casi no cuesta.

#### 3.1 Procesos y Rutinas

Si mañana se van las dos personas que más saben de trámites, ¿la atención al estudiante sigue igual?

*Descripción:* Mide si la atención al estudiante sigue un proceso y rutinas definidas, para que no dependa de quién sabe.

*Costo de quedarse:* La atención depende de quién sabe: si esa persona falta en plena rematrícula, las filas crecen y cada ventanilla da una respuesta distinta.

**Deficiente.**

- Cada persona que atiende maneja los trámites y las consultas a su manera. `[3.1.D1]`
- No hay rutinas regulares ni traspasos entre oficinas; la atención es 100% reactiva. `[3.1.D2]`

**Inicial.**

- Hay algún plazo de respuesta conocido —por ejemplo, para entregar una constancia— pero no medido. `[3.1.I1]`
- Unas personas u oficinas atienden en el sistema; otras siguen con su correo, su teléfono o su propia planilla. `[3.1.I3]`

**Funcional.** El equipo atiende en un mismo sistema, cada caso sigue un recorrido configurado y cada estudiante tiene quién responda por él.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada estudiante tiene a alguien que responde por él, cada período arranca con sus picos de trabajo previstos, y un caso se atiende igual sin importar quién lo tome.

- Los casos de los estudiantes siguen un recorrido configurado en el sistema, con sus etapas, de la recepción al cierre. `[3.1.F1]`
- Cada estudiante tiene quién responda por él —una persona o, si son muchos, un equipo con un seguimiento automático— y un seguimiento mínimo más allá de los casos que abre. `[3.1.F2]`
- Existe un proceso básico documentado para quejas críticas o escalaciones, como un cobro que el estudiante no reconoce o una nota en disputa. `[3.1.F4]`
- Cualquier persona del equipo explica cómo se atiende un trámite típico —una constancia, un cambio de horario— siguiendo el mismo flujo. `[3.1.F5]`
- Cualquier persona del equipo atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por correo o en ventanilla. `[3.1.F6]`
- Cada período tiene su calendario de atención escrito antes de empezar: en qué semanas llegan la rematrícula, los pagos, el inicio de clases y los exámenes, y qué tiene que preparar el equipo para cada una. `[3.1.F301 · declarado · hábito]`

**Eficiente.** Aparecen los plazos de respuesta, los playbooks y el recorrido del estudiante, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El estudiante sabe cuánto va a tardar la respuesta a su trámite, cada momento clave de su paso por la institución tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de trámite o prioridad: cuánto puede tardar una constancia, una revisión de nota o un cambio de carrera. `[3.1.E1]`
- Hay playbooks de prevención, retención y expansión: qué hacer ante un estudiante en riesgo de dejar y cómo ofrecerle un siguiente programa al que está por terminar. `[3.1.E3]`
- El recorrido del estudiante está definido de punta a punta, con sus momentos clave —la inducción, el primer período, cada rematrícula y la graduación— y un responsable y un estándar para cada uno. `[3.1.E4]`

**Óptimo.**

- El sistema detecta las desviaciones del proceso de atención y se las señala al líder y a quien atiende el caso, sin intervención. `[3.1.O3]`

*Se leen igual:* `3.1.I2`, `3.1.F3`, `3.1.E5`, `3.1.O1`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cuántos trámites necesitan a una persona cuando podrían resolverse solos, y cuánto del sistema de atención se aprovecha?

*Descripción:* Mide cuántos trámites y consultas se resuelven solos o por autoservicio, y cuánto del sistema de atención se aprovecha.

*Costo de quedarse:* Tu equipo contesta a mano las mismas preguntas en cada rematrícula, y los casos se pierden entre correos, ventanillas y chats: el estudiante tiene que insistir para que lo atiendan.

**Funcional.** Hay al menos un canal conversacional conectado, automatización simple en producción y, si se usa IA, trabaja con el contexto de los estudiantes.

*Resultado:* Lo que el estudiante escribe por los canales conectados llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Si el equipo usa IA, esta tiene como contexto la información básica de los estudiantes. `[3.2.F8]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos críticos llegan solos a quien los tiene que resolver; el estudiante puede ver y abrir sus casos y hacer en línea sus trámites de siempre sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién—, y las conversaciones y los casos se enrutan por múltiples condiciones, como el tema, la sede o el programa del estudiante. `[3.2.E1]`
- Hay un portal de autoservicio donde el estudiante ve y abre sus casos, y base de conocimiento interna y pública. `[3.2.E2]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir casos o buscar en la base de conocimiento—, y la IA trabaja con el contexto del área: los tipos de estudiante, los niveles de atención y las respuestas a las consultas frecuentes. `[3.2.E4]`
- Los trámites más frecuentes —constancias, rematrícula, pagos y cambios de horario— se hacen en línea de principio a fin, sin ir a una ventanilla. `[3.2.E301 · comprobable]`

**Óptimo.** Un agente de IA resuelve consultas en producción, y lo que se calcula en toda la institución llega a la ficha del estudiante.

*Resultado:* Una parte importante de las consultas se resuelve sin intervención humana, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la institución sabe de ese estudiante a la vista.

- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, el riesgo de deserción del estudiante. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.D2`, `3.2.I2`, `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.E3`, `3.2.E5`, `3.2.O1`.

#### 3.3 Datos

¿Quien atiende al estudiante ve su historia completa al instante, o se la tiene que preguntar?

*Descripción:* Mide si quien atiende ve al instante la historia completa del estudiante, sin pedirle que la repita en cada oficina.

*Costo de quedarse:* Cada vez que el estudiante pregunta, tiene que volver a explicar quién es, en qué va su trámite y qué le dijeron en la otra oficina.

**Deficiente.**

- Es imposible reconstruir el paso del estudiante por la institución. `[3.3.D2]`

**Inicial.**

- Los datos básicos del estudiante y de sus casos están en un solo sistema, pero incompletos. `[3.3.I1]`

**Funcional.** El histórico y el contexto del estudiante están accesibles, con los casos clasificados.

*Resultado:* El líder sabe qué trámites y qué problemas llegan y cuántos, y cualquiera que atiende tiene la historia del estudiante en segundos.

- Cualquier persona que atiende ve el histórico de casos de un estudiante en menos de 10 segundos. `[3.3.F1]`
- La ficha del estudiante muestra su programa y en qué período va, lo que ha pagado, cuánto paga por período y su beca, no solo sus casos. `[3.3.F2]`
- Las propiedades clave del estudiante —su programa, su modalidad y desde qué período estudia— están pobladas en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene tipo y motivo, con una lista definida: constancias, pagos, notas, cambios de carrera, reclamos. `[3.3.F4]`
- El contexto que el área documentó —tipos de estudiante, niveles de atención, respuestas a consultas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6]`

**Eficiente.** Se miden tiempos y satisfacción, y los datos del estudiante se unifican con los de Admisiones.

*Resultado:* La institución sabe qué tan rápido y qué tan bien atiende, cuánto tarda un estudiante nuevo en completar su inducción y cómo va cada estudiante, con la satisfacción medida y no supuesta.

- Se miden el NPS o el CSAT de los estudiantes con cadencia. `[3.3.E2]`
- Los datos del estudiante están unificados entre Servicio y Admisiones. `[3.3.E3]`
- Se mide cuánto tarda cada estudiante nuevo en alcanzar el resultado de su inducción: el tiempo desde que se matricula hasta que lo logra. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada estudiante, que combina su asistencia y su avance académico, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Un modelo anticipa el riesgo de que cada estudiante deje sus estudios antes de que lo manifieste.

*Resultado:* La institución sabe qué estudiantes están en riesgo de dejar y cuáles van logrando lo que vinieron a buscar, antes de que ellos mismos lo digan, con datos que se mantienen al día solos.

- Hay un modelo predictivo de la salud de cada estudiante, activo y en uso, que mide tanto su experiencia como si va logrando lo que vino a estudiar. `[3.3.O1]`
- Servicio se apoya en el almacén central de datos de la institución —donde se juntan lo académico, los pagos y la atención—, con reglas claras de quién accede y cómo se mantiene, para anticipar el riesgo de cada estudiante. `[3.3.O2]`

*Se leen igual:* `3.3.D1`, `3.3.I2`, `3.3.F5`, `3.3.E1`, `3.3.O3`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Quién decide qué se atiende primero en cada período, con qué información, y cómo se mejora la atención al estudiante?

*Descripción:* Mide quién decide qué se atiende primero, con qué información, y cómo se revisa y mejora la atención al estudiante.

*Costo de quedarse:* Se atiende primero al que más insiste, no al que más lo necesita, y los mismos problemas se repiten cada período porque nadie los revisa.

**Deficiente.**

- No hay coordinación entre quien recibe a los estudiantes nuevos, quien atiende los trámites y quien los acompaña. `[3.4.D1]`

**Inicial.** Roles a grandes rasgos y traspasos informales entre oficinas.

**Funcional.**

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (casos abiertos, volumen, casos atrasados, casos por tipo de trámite) y lo consulta al menos semanalmente. `[3.4.F2]`

**Eficiente.**

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, las áreas académica y financiera resuelven en el plazo acordado, y Servicio le avisa a Admisiones de los estudiantes en riesgo de dejar.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —trámites, reglamentos y sistemas—; no se le entrena de memoria. `[3.4.E2]`
- El liderazgo orquesta con Admisiones —cada estudiante nuevo llega con lo que busca en su programa, y las alertas de deserción vuelven a Admisiones— y con Marketing. `[3.4.E4]`
- El acuerdo con las áreas académica y financiera está escrito y es trazable: en cuánto tiempo resuelven lo que les pasa Servicio, como una revisión de nota, un cambio de carrera o un arreglo de pago. `[3.4.E301 · comprobable]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y el servicio se mide por los estudiantes que permanecen y siguen estudiando con la institución.

*Resultado:* Servicio se mide por los estudiantes que permanecen, se rematriculan y siguen estudiando con la institución, no solo por los casos que cierra.

- El equipo de servicio se mide por la permanencia de sus estudiantes y por cuántos siguen estudiando con la institución, no solo por los casos que cierra. `[3.4.O3]`
- Las decisiones usan analítica avanzada, como cuánto cuesta atender a cada tipo de estudiante frente a lo que deja. `[3.4.O4]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.E1`, `3.4.O1`, `3.4.O2`.

#### 3.5 Consistencia de Atención

¿El estudiante recibe la misma respuesta a su trámite, lo atienda quien lo atienda y por el canal que sea?

*Descripción:* Mide si cada estudiante recibe la misma atención y las mismas respuestas, lo atienda quien lo atienda.

*Costo de quedarse:* La misma pregunta sobre un trámite tiene una respuesta en ventanilla y otra por WhatsApp: el estudiante no sabe a quién creerle y termina haciendo fila para preguntar en persona.

**Deficiente.** Sin estandarización; cada persona responde a su criterio.

**Inicial.**

- No hay guía de tono; cada quien usa las plantillas a discreción. `[3.5.I1]`

**Funcional.** Hay tipos de estudiante definidos, respuestas guardadas básicas y una inducción estructurada para el estudiante nuevo.

*Resultado:* El equipo sabe qué tipos de estudiante atiende y qué espera cada uno, un estudiante nuevo arranca con una inducción clara y un resultado definido, y las respuestas a lo frecuente salen iguales sin importar quién atienda.

- Hay al menos algunas respuestas guardadas básicas —macros— disponibles para quien atiende. `[3.5.F1]`
- Existe un proceso documentado de inducción del estudiante nuevo, con un resultado definido que debe alcanzar al terminarla: por ejemplo, tener sus accesos y su horario, y saber a quién acudir. `[3.5.F2]`
- Cualquier persona nueva del equipo recibe el conjunto de respuestas guardadas en su capacitación inicial. `[3.5.F3]`
- Existe un documento simple con los tipos de estudiante que atiende el área —por ejemplo, de primer ingreso, regular, becado, de posgrado o a distancia—, con qué necesita cada uno y qué espera del servicio, consultable por cualquiera del equipo. `[3.5.F4]`

**Eficiente.**

*Resultado:* El estudiante reconoce la misma voz de la institución en cada respuesta, lo atienda quien lo atienda.

- El tono y la voz de la institución se aplican a las respuestas, no cada persona con su estilo. `[3.5.E2]`

*Se leen igual:* `3.5.D1`, `3.5.E1`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de estudiantes

¿Cada estudiante recibe la atención que corresponde a su situación, o todos hacen la misma fila?

*Descripción:* Mide si la atención se prioriza por la urgencia del caso y la situación del estudiante, no por quién insiste.

*Costo de quedarse:* El estudiante que está por dejar hace la misma fila que el que pide una constancia, y nadie nota que su caso era urgente.

**Deficiente.**

- Los casos se atienden por orden de llegada o por preferencia de quien atiende, sin contexto del estudiante. `[3.6.D1]`

**Inicial.**

- No hay criterios formales; la información del estudiante existe, pero no está a la vista en el momento de atenderlo. `[3.6.I1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero y cada tipo de estudiante recibe la atención que le corresponde, sin que quien atiende tenga que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta. `[3.6.F1]`
- La atención se diferencia según los tipos de estudiante: cada tipo tiene claro qué nivel de atención recibe. `[3.6.F2]`
- Quien atiende usa la ficha del estudiante —su programa, sus pagos y sus casos abiertos— para dar contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** Los estudiantes de los grupos clave tienen un consejero dedicado, y hay segmentación para acciones diferenciadas.

*Resultado:* Cada estudiante de los grupos clave tiene un consejero que lo conoce, el resto no queda solo, y la atención cambia según el momento en que está cada estudiante.

- Hay un modelo de atención por segmento: cada estudiante de los grupos que la institución define como clave —por ejemplo, los de primer ingreso o los becados— tiene un consejero dedicado que lo conoce, y el resto recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1]`
- Los estudiantes se segmentan para acciones diferenciadas según el momento de su paso por la institución: donde siguen un programa período tras período, de primer ingreso, al día, en riesgo o con opción de seguir otro programa; donde toman un solo curso, por empezar, cursando o listos para recomendar. `[3.6.E2]`

**Óptimo.** El estudiante recibe el mismo contexto lo atienda una persona o la IA, incluso cuando hace sus trámites solo.

*Resultado:* Cada estudiante recibe una atención a su medida en cualquier canal, incluso cuando hace sus trámites solo, y nunca tiene que volver a explicar lo que ya habló con Admisiones.

- Cada estudiante se atiende con el contexto de cómo llegó —lo que se le prometió en su admisión y el perfil con que entró—, sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.O1`, `3.6.O2`.

#### 3.7 Permanencia

¿Te enteras de que un estudiante está por dejar cuando todavía puedes ayudarlo, o cuando ya no se rematriculó?

*Descripción:* Mide si el servicio se adelanta a la deserción y a lo que necesita cada estudiante, o solo reacciona tarde.

*Costo de quedarse:* Te enteras de que un estudiante dejó cuando no se rematricula, y cada período pierdes estudiantes que con una llamada a tiempo se habrían quedado.

**Deficiente.**

- Hay un solo canal, esperando que el estudiante se acerque. `[3.7.D2]`

**Inicial.**

- Cuántos estudiantes dejaron se sabe recién cuando cierra la rematrícula, no antes. `[3.7.I301 · comprobable · relación continua]`

**Funcional.** Los riesgos evidentes —también el de dejar los estudios— se detectan a mano antes de que estallen.

*Resultado:* Los estudiantes con señales de riesgo, las quejas y las fechas críticas —como la rematrícula— ya no toman al equipo por sorpresa: se actúa antes de que el estudiante deje, y cuando alguno deja, se sabe por qué.

- Un estudiante con casos repetidos del mismo problema, una queja sin resolver o una mala calificación de la atención se identifica, y alguien lo contacta antes de que escale. `[3.7.F1]`
- Los estudiantes de los grupos clave reciben contacto antes de su rematrícula en el programa o de un vencimiento importante —un pago, la renovación de su beca—, no después. `[3.7.F2]`
- Cada estudiante que deja sus estudios —porque abandona o porque no se rematricula— deja registrada la razón de su salida. `[3.7.F3]`
- Los estudiantes con señales de que pueden dejar —notas bajas, ausencias o atraso en el pago— se identifican durante el período, y alguien los contacta para acompañarlos. `[3.7.F301 · comprobable · hábito]`

**Eficiente.** El riesgo de deserción y los trámites pendientes se ven venir, los resuelva la oficina que sea, y el estudiante recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los trámites del estudiante no se pierden entre oficinas, sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que escalen; la institución retiene estudiantes que antes dejaban sin aviso, sabe quiénes pueden seguir estudiando con ella y, donde la relación es continua, sus estudiantes clave revisan qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de riesgo de deserción o de la oportunidad de que el estudiante siga con otro programa. `[3.7.E1]`
- Los estudiantes en riesgo reciben una acción de permanencia —una tutoría, un arreglo de pago, un cambio de horario— antes de decidir dejar, y los que pueden seguir estudiando reciben la propuesta de un siguiente programa. `[3.7.E2]`
- Los estudiantes de los grupos clave tienen registrada la meta que persiguen —por ejemplo, terminar en el plazo de su programa o mantener su beca— y la revisan con la institución en una cadencia fija: qué se logró y qué sigue. `[3.7.E3]`
- Ningún trámite o molestia del estudiante se pierde entre oficinas: quedan en el sistema aunque los resuelva otra área —registro, cobros, la dirección de su carrera—, y hay alertas automáticas cuando uno se atrasa, cuando un estudiante califica mal la atención o cuando se acerca una fecha crítica —la rematrícula, un pago, un examen—, que le llegan a quien tiene que actuar. `[3.7.E4]`
- Cada estudiante recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su período —la rematrícula, los pagos, los exámenes, la graduación—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`

**Óptimo.** Los problemas se resuelven antes de que el estudiante los note, con acciones que la IA ajusta, y el estudiante recibe detalles que lo hacen sentirse parte de la institución.

*Resultado:* La mayoría de los problemas se resuelven antes de que el estudiante los note, y cada estudiante siente que la institución se adelanta a lo que necesita y lo sorprende para bien.

- Las revisiones de avance llegan a todos los estudiantes: a los de los grupos clave en persona y al resto de forma automatizada, con los datos que prepara el sistema. `[3.7.O1]`
- Muchos problemas se resuelven antes de que el estudiante los note. `[3.7.O2]`
- Las acciones proactivas —qué recibe cada estudiante, cuándo y por qué canal— se autoajustan con IA según su historia y sus señales. `[3.7.O3]`
- Los estudiantes reciben, sin pedirlos, detalles pensados para deleitarlos —un reconocimiento por su avance, beneficios o experiencias en el campus—, elegidos según su historia y el momento de su paso por la institución. `[3.7.O4]`

*Se leen igual:* `3.7.D1`, `3.7.I1`.

#### 3.8 Autoservicio y aprendizaje

¿Atender a más estudiantes cuesta cada vez menos, o cada rematrícula necesita más gente en las ventanillas?

*Descripción:* Mide si atender a más estudiantes cuesta menos cada vez, gracias al autoservicio y a lo que se aprende.

*Costo de quedarse:* Cada período necesitas más gente en las ventanillas para contestar lo mismo: para crecer en matrícula, tienes que contratar al mismo ritmo.

**Deficiente.** La atención depende 100% de personas: todo trámite pasa por una ventanilla, un correo o una llamada.

- El costo crece linealmente con cada estudiante nuevo. `[3.8.D2]`

**Funcional.**

*Resultado:* Las preguntas de cada período dejan de consumir al equipo: el estudiante encuentra la respuesta publicada y nadie la vuelve a escribir.

- Las consultas que más se repiten —cómo rematricularse, cómo pedir una constancia, cómo pagar— tienen una respuesta que el estudiante puede consultar por su cuenta. `[3.8.F1]`

**Eficiente.**

*Resultado:* La institución puede sumar estudiantes sin sumar personal de atención en la misma proporción, porque buena parte se resuelve sola, y cada período se prepara con lo que dejó el anterior.

- Se revisan periódicamente los casos recurrentes y, donde la relación es continua, las razones por las que los estudiantes dejan sus estudios, para encontrar patrones y mejorar. `[3.8.E2]`
- El autoservicio es efectivo: el estudiante resuelve sin abrir un caso, y la institución crece sin contratar linealmente. `[3.8.E3]`
- Cada período se prepara con lo que dejó el anterior: cuántos casos llegaron, de qué tipo y en qué semanas; con eso se ajustan el equipo y las respuestas publicadas antes del pico. `[3.8.E301 · declarado · hábito · requiere 3.3.F4]`

**Óptimo.** La IA detecta consultas nuevas y genera el contenido; atender a un estudiante más casi no cuesta.

*Resultado:* Atender a un estudiante más casi no cuesta: el conocimiento se genera solo a medida que aparecen consultas nuevas.

- La capacidad se ajusta a la demanda en tiempo real, también en los picos de cada período; el costo marginal de un estudiante nuevo es cercano a cero. `[3.8.O2]`
- Los aprendizajes retroalimentan automáticamente la consistencia de la atención, la priorización de estudiantes y la permanencia. `[3.8.O3]`

*Se leen igual:* `3.8.D1`, `3.8.I1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.O1`.

## Edición — Inmobiliaria

Para el equipo comercial de una desarrolladora o una inmobiliaria que vende las unidades de un proyecto —casas, apartamentos o lotes—: un asesor trabaja cada oportunidad, de la primera consulta a la visita, la reserva y la firma, y la mayoría de los clientes compra una sola vez.

*Clave:* inmobiliaria

*Perfil habitual:* con equipo · relación única.

*Criterios propios:* desde el 401.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Deal | Oportunidad de venta de una unidad |
| Negocio | Oportunidad de venta de una unidad |
| Lead | Interesado en una unidad o en un proyecto |
| Pipeline | El recorrido de la venta: consulta, visita, reserva, promesa y firma |
| Pipeline review | Reunión de seguimiento de ventas |
| Rep | Asesor inmobiliario |
| Vendedor | Asesor inmobiliario |
| Propuesta | La propuesta de una unidad: precio, forma de pago y condiciones |
| Razón de pérdida | Por qué el interesado no compró, o por qué desistió de su reserva |
| ICP | El comprador objetivo de cada proyecto |
| Forecast | Proyección de ventas del proyecto |
| Ticket | Caso de posventa: una consulta, un trámite o un reclamo de obra |
| Buyer persona | Perfil de comprador: quién es, qué busca y cómo decide, como la familia que compra su primera vivienda o el inversionista |
| Handoff | Traspaso: el de un interesado de Marketing a un asesor, o el de un comprador de Ventas a la posventa |

### Área 1 — Ventas

Mide el rendimiento del área de ventas de la inmobiliaria: cómo está montada por dentro y qué produce en visitas, reservas y unidades vendidas.

**Deficiente.** Tus ventas dependen de quién atienda. Cada asesor lleva a sus interesados en su teléfono, los precios y la disponibilidad viven en una hoja que no siempre está al día, y nadie sabe cuántas consultas se quedaron sin respuesta.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados se registran cuando el asesor se acuerda, cada quien cotiza a su manera y las reservas se llevan aparte.

**Funcional.** Tu equipo comercial opera como una maquinaria base. Cada interesado entra al mismo recorrido, todos venden con la misma lista de precios y la misma disponibilidad, y ninguna oportunidad se enfría después de la visita sin que alguien reaccione.

**Eficiente.** La venta deja de depender del empuje de cada asesor. Mides cuántas consultas llegan a visita y cuántas visitas a reserva, compruebas la capacidad de pago antes de reservar, acompañas cada reserva hasta la firma y proyectas las ventas del proyecto con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo decide donde importa. Agentes responden, precalifican y agendan visitas a toda hora, los modelos dicen qué interesado está listo y qué unidad ofrecerle, y el sistema detecta la reserva que se va a caer antes de que pase.

#### 1.1 Procesos y Rutinas

Si mañana rotan dos asesores clave, ¿las oportunidades en curso siguen avanzando igual?

*Descripción:* Mide si la venta sigue un proceso escrito, de la consulta a la firma, que no depende de cada asesor.

*Costo de quedarse:* Si se va un asesor, se lleva a sus interesados en el teléfono: nadie sabe quién ya visitó, a quién se le cotizó ni qué reserva estaba por firmarse.

**Funcional.** Maquinaria base: un solo recorrido de la venta, de la consulta a la firma, y seguimiento con cadencia.

*Resultado:* Todo el equipo trabaja la venta igual: las oportunidades avanzan con los mismos criterios, cada visita deja su siguiente paso, la reserva se hace siempre de la misma forma y se les da seguimiento con la cadencia acordada, así que si rota un asesor, el siguiente sabe en qué va cada cliente.

- Cualquier asesor explica igual las etapas de la venta —consulta, visita, reserva, promesa y firma— y qué tiene que cumplirse para avanzar. `[1.1.F1]`
- Cada proyecto o tipo de venta tiene su recorrido configurado, con lo que la oportunidad tiene que cumplir para avanzar y para darse por reservada. `[1.1.F2]`
- Toda visita queda registrada con su resultado y su siguiente paso acordado. `[1.1.F401 · comprobable · hábito]`
- El proceso de reserva está escrito: qué se firma, qué se paga, cuánto dura y qué pasa si se vence. `[1.1.F402 · declarado]`

**Eficiente.**

- Hay una metodología de asesoría formal en uso: el asesor indaga qué busca el cliente, cómo va a pagar y quién decide antes de mostrarle una unidad. `[1.1.E1]`
- Existen guías de indagación, precalificación, visita y manejo de objeciones —precio, ubicación, plazo de entrega— que el equipo usa. `[1.1.E2]`

*Se leen igual:* `1.1.D1`, `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I1`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.E3`, `1.1.O1`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Cuánto del tiempo del asesor se va en tareas que el sistema podría hacer, y cuánto de lo que ya tienes —CRM, portales, inventario de unidades— trabaja junto?

*Descripción:* Mide cuánto trabajo repetitivo hace el sistema y si el CRM, los portales y el inventario de unidades trabajan conectados.

*Costo de quedarse:* Tus asesores copian a mano las consultas de los portales, cotizan en hojas sueltas y descubren que la unidad ya estaba reservada cuando el cliente ya se había ilusionado.

**Funcional.** Hay automatización simple en producción, y las consultas de todos los canales entran solas al sistema.

*Resultado:* Ninguna consulta se pierde por no saber a quién le toca: la que llega por un portal, por la web o por WhatsApp entra sola, el asesor recibe el aviso, ve qué unidades están disponibles antes de ofrecerlas, y una unidad reservada no se le ofrece a nadie más.

- Las consultas que entran —de los portales, la web, las redes y la sala de ventas— llegan a una bandeja o cola y se asignan por una regla simple (por turnos, por proyecto o por fuente). `[1.2.F2]`
- El asesor ve en el sistema qué unidades están disponibles, reservadas o vendidas antes de ofrecer una. `[1.2.F8]`
- Reservar una unidad la bloquea en el sistema en el momento: no se puede ofrecer ni reservar dos veces. `[1.2.F401 · comprobable]`

**Eficiente.**

*Resultado:* El asesor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen las oportunidades.

- Las cotizaciones se generan desde el sistema, con el precio, la forma de pago y la disponibilidad vigentes, no como documentos sueltos. `[1.2.E1]`
- El CRM está integrado con el inventario de unidades y con el sistema de cobros o el ERP. `[1.2.E3]`
- La reserva y la promesa se firman de forma digital, y los documentos del cliente quedan en el sistema. `[1.2.E401 · comprobable]`

**Óptimo.** Agentes de IA responden, precalifican y agendan visitas; el asesor trabaja con la predicción de qué oportunidades van a cerrar.

*Resultado:* El asesor dedica su tiempo a las conversaciones que deciden la venta: los agentes responden, precalifican y agendan visitas, y él trabaja con la predicción de qué oportunidades van a cerrar y con respuestas sugeridas para cada conversación.

- Hay predicción de qué oportunidades van a cerrar y respuestas sugeridas según el contexto de cada conversación. `[1.2.O1]`
- Agentes de IA responden, precalifican y agendan visitas a toda hora en el canal conversacional, y le pasan al asesor, con el contexto, a quien está listo. `[1.2.O2]`

*Se leen igual:* `1.2.D1`, `1.2.D2`, `1.2.I1`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F6`, `1.2.F7`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.O3`.

#### 1.3 Datos

¿Confías en tus números de consultas, visitas, reservas y ventas, o los validas antes de usarlos?

*Descripción:* Mide si los datos de ventas son confiables: oportunidades completas, su origen, inventario al día y reportes sin reconstruir.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de ventas se arma a mano cruzando el CRM con la hoja de inventario, y no sabes qué portal te trae compradores y cuál solo consultas.

**Funcional.** El reporte de ventas y el inventario describen el estado actual con confianza, sin reconstrucción.

*Resultado:* El líder ve el estado real de las oportunidades y de cada unidad cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada interesado.

- Toda oportunidad tiene proyecto, unidad o tipo de unidad de interés, monto, fecha esperada de cierre y asesor responsable. `[1.3.F1]`
- Toda oportunidad tiene rastreable por dónde llegó el interesado: portal, web, redes, valla, referido o sala de ventas. `[1.3.F3]`
- El reporte de oportunidades y de reservas se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4]`
- La documentación sobre el comprador objetivo de cada proyecto no se deja envejecer. `[1.3.F5]`
- La definición de interesado calificado no se deja envejecer. `[1.3.F6]`
- La documentación de cada proyecto —precios, acabados, avance de obra y fechas de entrega— no se deja envejecer. `[1.3.F7]`
- El estado de cada unidad —disponible, reservada o vendida— está al día en el sistema y coincide con lo que se firmó. `[1.3.F401 · comprobable · requiere 1.2.F8]`

**Eficiente.** Aparece la proyección de ventas del proyecto, y la ficha del cliente reúne su reserva, sus pagos y sus conversaciones.

*Resultado:* La empresa puede comprometer un ritmo de ventas por proyecto con confianza, y planear la obra, el flujo de caja y el financiamiento con ese número.

- Hay una proyección de ventas por proyecto con cadencia fija (semanal o quincenal) y precisión alta. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con lo que viene de otros sistemas —su reserva, sus pagos, su trámite de crédito— y con su historial de conversaciones: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se mide cuánto tarda en venderse cada tipo de unidad y cada etapa del proyecto, y ese ritmo se revisa. `[1.3.E401 · comprobable]`

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.D3`, `1.3.D4`, `1.3.I1`, `1.3.I2`, `1.3.I3`, `1.3.F2`, `1.3.F8`, `1.3.E2`, `1.3.E4`, `1.3.O1`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿El liderazgo comercial decide con datos o con intuición, y con qué cadencia revisa a sus asesores y a sus proyectos?

*Descripción:* Mide si el liderazgo gestiona con roles claros, metas por asesor y proyecto, datos y una revisión de cadencia fija.

*Costo de quedarse:* El gerente se entera al cierre del mes de que el proyecto no vendió lo esperado: no vio antes qué asesor se quedó atrás ni en qué etapa se cayeron las oportunidades.

**Funcional.**

*Resultado:* Cada asesor sabe qué se espera de él y a quién le corresponde cada cliente, y el líder sabe cada semana qué asesor y qué proyecto van bien y quién necesita ayuda, antes de que termine el mes.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (consultas, visitas, reservas, ventas firmadas, desistimientos, unidades disponibles) y lo consulta al menos semanalmente. `[1.4.F2]`
- Cada asesor y cada proyecto tiene una meta clara, y su avance se reporta en cadencia fija. `[1.4.F4]`
- Está escrito a quién le corresponde un cliente cuando lo atienden dos asesores, y cómo se reparte la comisión. `[1.4.F401 · declarado · venta con equipo]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con Marketing y con las áreas que cierran la venta, y escucha al equipo.

*Resultado:* Un asesor nuevo produce más rápido, el traspaso de interesados con Marketing tiene reglas que se cumplen, el trámite de crédito y la firma no se traban entre áreas, y lo que el equipo ve que no funciona llega a quien puede cambiarlo.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —proyectos, precios, financiamiento y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con las áreas que cierran la venta —legal, cobros y trámite de crédito— está escrito y se mide: qué recibe cada una y en cuánto tiempo responde. `[1.4.E401 · comprobable]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué proyecto y qué canal dejan más margen, qué tipo de unidad se vende más rápido y qué asesor aporta más.

- Las decisiones usan analítica avanzada (rentabilidad por proyecto y por canal, velocidad de venta por tipo de unidad, aporte de cada asesor). `[1.4.O1]`

*Se leen igual:* `1.4.D1`, `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F3`, `1.4.F5`, `1.4.E3`, `1.4.E4`, `1.4.O2`.

#### 1.5 Proyecto y propuesta

¿El cliente recibe la misma información del proyecto y una propuesta igual de clara, lo atienda quien lo atienda?

*Descripción:* Mide si el equipo sabe para quién es cada proyecto y si precios y condiciones son iguales con cualquier asesor.

*Costo de quedarse:* Cada asesor cuenta el proyecto a su manera y cotiza con su propia hoja: el cliente recibe dos precios para la misma unidad, desconfía y se va a ver otro proyecto.

**Deficiente.** El cliente recibe información y precios distintos según el asesor; cada quien cotiza a su manera.

- Hay más de una lista de precios circulando, y no se sabe cuál es la vigente. `[1.5.D401 · comprobable]`

**Inicial.** Hay una lista de precios y un brochure, pero cada asesor arma la cotización por su cuenta.

**Funcional.** El comprador objetivo de cada proyecto está escrito, y todos venden con la misma lista de precios y la misma propuesta.

*Resultado:* Dos clientes parecidos reciben la misma información del proyecto y una cotización igual de clara —precio, forma de pago, entrega y qué incluye—, sin importar qué asesor los atienda.

- Existe un documento con el comprador objetivo de cada proyecto —a quién va dirigido, qué busca y cómo paga—, consultable por cualquier asesor. `[1.5.F1]`
- El líder puede explicar quién es el comprador objetivo de cada proyecto sin consultar su documentación. `[1.5.F2]`
- Las cotizaciones están estandarizadas: toda propuesta de una unidad muestra lo mismo —precio, forma de pago, fecha de entrega y qué incluye—, no armada desde cero cada vez. `[1.5.F4]`
- Hay una sola lista de precios y condiciones vigente por proyecto, y todas las cotizaciones salen de ella. `[1.5.F401 · comprobable]`

**Eficiente.** La propuesta se distingue de la de otros proyectos y solo promete lo que se va a entregar.

*Resultado:* El mercado reconoce el proyecto por algo concreto, la propuesta se sostiene igual en cada contacto, y lo que se le prometió al cliente —acabados, amenidades y fechas— es lo que recibe.

- Las propuestas solo prometen lo que se va a entregar: lo que se dice de acabados, amenidades y fechas de entrega se valida antes de decirlo. `[1.5.E3]`
- Los cambios de precio y de avance de obra les llegan el mismo día a todos los asesores y a todos los canales. `[1.5.E401 · comprobable · hábito]`

**Óptimo.** La IA mantiene coherentes la información del proyecto, los precios y el mensaje en cada punto de contacto, sin trabajo manual.

- La IA mantiene coherentes la información del proyecto, los precios y el mensaje en todos los canales en tiempo real, sin trabajo manual. `[1.5.O1]`

*Se leen igual:* `1.5.D1`, `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.F3`, `1.5.F5`, `1.5.E2`.

#### 1.6 Priorización de interesados

¿El equipo le dedica el tiempo a quien puede y quiere comprar, o atiende a todos por igual?

*Descripción:* Mide si el equipo decide a qué interesados dedicar su tiempo con criterios escritos, según el comprador objetivo del proyecto.

*Costo de quedarse:* Tus asesores le dan visita a todo el que pregunta: pasan el fin de semana mostrando unidades a quien no puede pagarlas, y los compradores listos esperan su turno.

**Deficiente.** Se atiende a los interesados por orden de llegada, y se le da visita a todo el que pregunta.

- Se le da visita a todo el que pregunta, sin saber antes si puede comprar. `[1.6.D401 · evaluado]`

**Funcional.** Hay segmentación básica de interesados y una definición escrita de interesado calificado.

*Resultado:* El equipo deja de mostrarle unidades a quien no va a comprar y concentra las visitas en quien encaja con el proyecto y tiene cómo pagarlo.

- El equipo segmenta a los interesados por los atributos del comprador objetivo antes de trabajarlos: presupuesto, forma de pago, zona, tipo de unidad o si compra para vivir o para invertir. `[1.6.F1]`
- Hay una definición escrita de interesado calificado —los criterios para dedicarle una visita: presupuesto, forma de pago y plazo de compra— y se aplica de forma consistente. `[1.6.F2]`
- El esfuerzo se enfoca en los interesados que encajan con el comprador objetivo del proyecto. `[1.6.F3]`
- La documentación del comprador objetivo se usa en la arquitectura de CRM y en los formularios de consulta. `[1.6.F4]`

**Eficiente.** Aparece el puntaje de interesados por reglas, y la capacidad de pago se comprueba antes de reservar.

*Resultado:* Cada asesor sabe cada mañana a quién llamar primero, y las reservas que se firman son de quien sí puede terminar la compra.

- Hay un puntaje de interesados por reglas activo: un modelo que suma puntos por varios atributos —presupuesto, forma de pago, interacción, plazo de compra—, no una regla sobre una propiedad. `[1.6.E1]`
- Los segmentos prioritarios de cada proyecto —inversionistas, primera vivienda, compradores del exterior— están identificados formalmente. `[1.6.E2]`
- La capacidad de pago del interesado se comprueba antes de reservar: carta de preaprobación, comprobante de fondos o plan de pagos aceptado. `[1.6.E401 · comprobable · venta con equipo]`

**Óptimo.**

- La personalización se adapta en tiempo real a cada persona que participa en la decisión de compra: la pareja, la familia o el inversionista. `[1.6.O3]`

*Se leen igual:* `1.6.D1`, `1.6.I1`, `1.6.I2`, `1.6.E3`, `1.6.O1`, `1.6.O2`, `1.6.O4`.

#### 1.7 Seguimiento de visitas y reservas

¿Qué pasa con quien visitó y no volvió a contestar, o con la reserva que no avanza hacia la firma?

*Descripción:* Mide si alguien detecta cuando una oportunidad o una reserva deja de avanzar y si hay un paso acordado.

*Costo de quedarse:* Los clientes se enfrían después de la visita y las reservas se vencen sin que nadie llame: la unidad queda bloqueada semanas y la venta se cae cuando ya la dabas por hecha.

**Deficiente.** El asesor está solo con sus clientes, y después de la visita nadie da seguimiento.

- Las reservas se vencen sin que nadie se dé cuenta. `[1.7.D401 · comprobable]`

**Funcional.** Ninguna oportunidad se enfría después de la visita, y ninguna reserva se vence en silencio.

*Resultado:* Las oportunidades que se traban se detectan a tiempo y se retoman por más de un canal, con material estandarizado y con el líder actuando mientras todavía hay margen; y cada reserva tiene fecha, responsable y siguiente paso hasta la firma.

- Las oportunidades estancadas —después de una visita o de una cotización— se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada asesor. `[1.7.F1]`
- Hay materiales estandarizados que ayudan a cerrar la venta: brochure, planos, recorrido virtual y avance de obra. `[1.7.F4]`
- Toda visita recibe seguimiento dentro del plazo acordado. `[1.7.F401 · comprobable · hábito · requiere 1.1.F401]`
- Toda reserva tiene fecha de vencimiento y un responsable, y antes de que venza se contacta al cliente. `[1.7.F402 · comprobable · hábito · requiere 1.1.F402]`

**Eficiente.** El seguimiento es multicanal, el sistema le avisa al líder de lo que se traba y quien todavía no está listo sigue en nutrición.

*Resultado:* Ninguna oportunidad espera a la reunión para recibir ayuda, quien no compró en este proyecto recibe la invitación al siguiente, el cliente que ya reservó sabe cómo va su trámite, y se sabe cuánto de lo que se traba se recupera.

- Los interesados que todavía no están listos para comprar no se abandonan: vuelven a nutrición y regresan a Ventas cuando muestran interés o sale un proyecto que les calza. `[1.7.E2]`
- Cuando una oportunidad o una reserva lleva más tiempo del acordado sin avanzar, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántas oportunidades estancadas y cuántas reservas en riesgo se recuperan. `[1.7.E401 · comprobable]`
- Entre la reserva y la firma, el cliente recibe avances de su trámite y de la obra sin tener que pedirlos. `[1.7.E402 · comprobable · hábito]`

**Óptimo.** El sistema detecta la oportunidad o la reserva que se va a caer y actúa antes de que pase.

*Resultado:* Las mejores oportunidades reciben ayuda justo cuando la necesitan: el sistema detecta cuándo una venta o una reserva se traba y moviliza a quien corresponde.

- El sistema detecta qué oportunidad o qué reserva se va a caer y responde en el momento: contenido de valor, una alerta a la gerencia o el aviso al asesor sobre las que más importan. `[1.7.O1]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.D4`, `1.7.I1`, `1.7.I2`, `1.7.I3`, `1.7.I4`, `1.7.F2`, `1.7.F3`, `1.7.F5`, `1.7.E1`, `1.7.E3`, `1.7.O2`.

#### 1.8 Ventas, pérdidas y desistimientos

¿El equipo sabe por qué un interesado no compra y por qué una reserva se cae, y lo usa para mejorar?

*Descripción:* Mide si se registra por qué no compra un interesado o se cae una reserva, y si eso se usa.

*Costo de quedarse:* Pierdes ventas por las mismas razones una y otra vez —el precio, el crédito que no salió, la fecha de entrega— porque nadie registra por qué no compran ni por qué desisten.

**Funcional.** Queda registrado por qué no se compró y por qué se cayó cada reserva.

*Resultado:* El líder sabe por qué no compran los interesados y por qué se caen las reservas, con datos del trimestre y no con impresiones.

- Toda oportunidad perdida tiene registrada su razón. `[1.8.F1]`
- Cada reserva que se desiste o se vence deja registrada su razón: el crédito no salió, cambió de opinión o encontró otro proyecto. `[1.8.F401 · comprobable]`

**Eficiente.** Las ventas cerradas, las perdidas y las reservas caídas se revisan con cadencia, y lo aprendido vuelve al proceso y a la capacitación.

*Resultado:* Los mismos errores dejan de repetirse: lo que se aprende de cada venta cerrada, de cada venta perdida y de cada reserva caída vuelve al proceso y a la capacitación del equipo, y se sabe contra qué proyectos se pierde.

- Se revisan periódicamente las ventas cerradas, las oportunidades perdidas y las reservas caídas para identificar patrones. `[1.8.E1]`
- Cuando el cliente compró en otro proyecto, queda registrado en cuál y por qué. `[1.8.E401 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.D2`, `1.8.I1`, `1.8.F2`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing de la inmobiliaria: cómo está montada por dentro y qué produce en presencia, interesados y visitas para cada proyecto.

**Deficiente.** Tus proyectos no los presentas tú: los presenta el mercado. Cada anuncio dice algo distinto, las herramientas están sueltas y sin conectar, y la pauta corre hasta agotar el presupuesto sin que nadie mida qué dejó. Los interesados llegan por accidente.

**Inicial.** Cada proyecto tiene su logo y su brochure, pero no hay una estrategia detrás. Pagas portales y herramientas que usas a medias, publicas cuando hay algo que mostrar y revisas los resultados cuando el lanzamiento ya pasó. Llegan consultas, pero no sabes de dónde vienen.

**Funcional.** El marketing de tus proyectos dejó de depender de una persona. Cada proyecto tiene su plan y su página, la marca y los perfiles de comprador están escritos, y tus canales —portales, pauta, redes, correo y WhatsApp— salen coordinados bajo un mismo calendario y anuncian solo lo que está disponible, y sabes cuánto te cuesta cada interesado. Los datos describen la operación sin reconstruirlos a mano. Los interesados llegan de forma predecible, aunque la optimización fina todavía no existe.

**Eficiente.** Probar y ajustar ya es rutina, y lo que aprendes de un lanzamiento cambia cómo armas el siguiente. Sabes cuánto te cuesta cada visita y cada reserva en cada canal y en cada proyecto, el mensaje se adapta solo a cada tipo de comprador, la IA asiste a tu equipo en su trabajo diario y tus proyectos aparecen cuando alguien busca vivienda, en buscadores y en asistentes de IA. La pauta se mueve con evidencia, y quienes ya compraron recomiendan con un programa de referidos.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada proyecto se genera y se optimiza en ciclo continuo, la IA adapta el mensaje a lo que hizo cada interesado, los modelos mueven la pauta entre canales sobre la marcha, y los compradores satisfechos que identifica Servicio traen compradores nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

Si mañana se va quien arma las campañas, ¿los lanzamientos y la promoción de cada proyecto siguen saliendo en tiempo y forma?

*Descripción:* Mide si la promoción de cada proyecto sale de un plan y un calendario compartidos, sin depender de nadie.

*Costo de quedarse:* Cada lanzamiento depende de quien lo arma: si esa persona se va, la preventa del próximo proyecto sale tarde o sin plan.

**Deficiente.**

- No hay calendario de campañas: cada lanzamiento y cada promoción se improvisan. `[2.1.D1]`

**Funcional.** El marketing de cada proyecto sigue un plan y un calendario compartidos; deja de depender de héroes.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la promoción de cada proyecto sigue saliendo aunque cambie una persona: el plan de cada lanzamiento y el calendario no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- El líder puede explicar qué campañas corren para cada proyecto y en qué etapa van, sin preguntarle al equipo. `[2.1.F4]`
- El equipo interno gestiona el grueso del trabajo; la agencia y quienes producen los renders o los videos son apoyo puntual. `[2.1.F5]`
- Cada proyecto tiene su plan de marketing escrito para cada etapa de la venta —preventa, lanzamiento, venta durante la obra y últimas unidades—, con sus campañas y sus fechas. `[2.1.F401 · declarado]`

**Eficiente.**

- Existe un proceso de aprobación antes de publicar cada pieza —un anuncio, un render o un video—, con sus versiones y su revisión de calidad. `[2.1.E2]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.I3`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F6`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Cuánto del marketing de tus proyectos hacen los flujos automáticos, y cuánto de lo que pagas —CRM, portales y herramientas— se aprovecha?

*Descripción:* Mide cuánto trabajo repetitivo del marketing inmobiliario hacen los flujos y la IA, y cuánto se aprovechan las herramientas contratadas.

*Costo de quedarse:* Haces a mano los envíos que podrían salir solos y pagas herramientas que no usas, mientras quien pregunta por un proyecto espera respuesta en WhatsApp.

**Inicial.**

- La inmobiliaria paga licencias cuyo valor no extrae. `[2.2.I1]`

**Funcional.**

*Resultado:* Todo lo que entra por el sitio, por la página de cada proyecto y por WhatsApp llega al sistema y recibe respuesta.

- Los formularios del sitio y de la página de cada proyecto están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Después de enviar un formulario, el sistema le responde automáticamente al interesado —por ejemplo, con el brochure del proyecto— y notifica a quien corresponde. `[2.2.F5]`
- Si el equipo usa IA, esta tiene como contexto la voz de marca y los perfiles de comprador. `[2.2.F9]`

**Eficiente.**

*Resultado:* Los interesados se nutren solos hasta estar listos para un asesor, la conversación con cada uno no depende de que alguien se acuerde de escribirle, y el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nurturing de varios pasos, con ramificación y tiempos de espera, que acompañan al interesado mientras decide. `[2.2.E1]`
- El traspaso de interesados de Marketing a los asesores está automatizado. `[2.2.E3]`

**Óptimo.**

- Agentes de IA atienden el canal conversacional, como WhatsApp: responden lo que generan las campañas de cada proyecto y mantienen la conversación con quien todavía no está listo para un asesor. `[2.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a las herramientas de marketing: la segmentación usa, por ejemplo, qué tan cerca de comprar está cada interesado, calculado afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D1`, `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.O1`.

#### 2.3 Datos

¿Confías en tus datos de origen, conversión y atribución para mover la pauta entre portales, redes y buscadores, o los validas a mano antes de usarlos?

*Descripción:* Mide si los datos de marketing dicen de dónde llega cada interesado y permiten mover la pauta con confianza.

*Costo de quedarse:* No sabes qué portal o qué anuncio te trae compradores y cuál solo consultas: mueves la pauta a ciegas, porque cada reporte hay que validarlo antes de creerle.

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada interesado —un portal, la pauta, las redes, una feria o un referido—, con reportes que salen del sistema y no de una planilla armada a mano.

- Todo interesado nuevo —entre por un formulario, WhatsApp, un portal, una feria o la sala de ventas— tiene poblados la etapa del ciclo de vida y su origen. `[2.3.F1]`
- Las propiedades que describen a cada tipo de comprador —como si compra para vivir o para invertir, o la zona que busca— están en los formularios críticos y se capturan en la mayoría de los registros. `[2.3.F2]`
- Los reportes básicos —interesados por proyecto, conversión y origen— salen del sistema sin reconstrucción manual. `[2.3.F5]`
- Cuando se pide un teléfono u otro dato de contacto —en un formulario o en una feria—, se pregunta si la persona acepta que le escriban por ese canal, y su respuesta queda registrada. `[2.3.F7]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta de una unidad, no solo cuál trajo el primer clic.

- La atribución reparte el mérito de cada venta entre todos los puntos de contacto —portales, pauta, redes y ferias—, no solo el primero o el último, e incluye todos los canales, también el conversacional, como WhatsApp: se sabe cuánto ingreso deja cada uno. `[2.3.E2]`

*Se leen igual:* `2.3.D1`, `2.3.D2`, `2.3.I1`, `2.3.I2`, `2.3.F3`, `2.3.F6`, `2.3.E1`, `2.3.E3`, `2.3.O1`, `2.3.O3`, `2.3.O4`.

#### 2.4 Equipo y Gobierno

¿Quién decide qué proyecto se promociona, cuánto se invierte y en qué canal, con qué datos y con qué cadencia?

*Descripción:* Mide quién decide qué se promociona y dónde se invierte en cada proyecto, con qué datos y cadencia.

*Costo de quedarse:* La pauta se reparte entre proyectos por costumbre o por quien insiste más, y nadie puede demostrar con datos si la inversión trae compradores.

**Inicial.**

- Las decisiones operativas escalan al gerente general o a la gerencia de marketing. `[2.4.I1]`

**Funcional.**

*Resultado:* El equipo sabe qué se espera de cada uno, el presupuesto de cada proyecto se defiende con números y no con opiniones, y la dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (interesados nuevos por proyecto, cuántos pasan a un asesor, de dónde llegan, cuántos llegan a visita) y lo consulta al menos semanalmente. `[2.4.F2]`
- Las decisiones de presupuesto —cuánto va a cada proyecto y a cada canal— citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva se integra rápido, y Marketing y Ventas trabajan con reglas acordadas en vez de reclamarse los interesados.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —los proyectos, la marca y las herramientas—; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo orquesta con Ventas —traspaso de interesados, tiempos de respuesta y una reunión conjunta con cadencia fija— y con Servicio. `[2.4.E3]`

**Óptimo.**

*Resultado:* La dirección sabe cuánto deja cada canal frente a lo que cuesta —en unidades vendidas y en margen— y decide dónde invertir con esa cuenta, con un equipo capaz de sostener la IA.

- Las decisiones usan analítica avanzada, como lo que deja cada canal —el margen de las unidades que vende— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F3`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

#### 2.5 Marca y Presencia

¿Quien busca vivienda en tu zona encuentra tus proyectos, entiende qué ofrece cada uno y confía en tu marca?

*Descripción:* Mide si quien busca vivienda encuentra los proyectos, entiende qué ofrece cada uno y confía en la marca.

*Costo de quedarse:* Quien busca vivienda encuentra primero los proyectos de otro, o encuentra el tuyo y no entiende qué lo hace distinto.

**Funcional.** La marca, los perfiles de comprador y la presencia de cada proyecto están documentados y son consistentes.

*Resultado:* La marca y cada proyecto se ven y suenan igual en todo lo que sale, cada proyecto tiene dónde mostrarse completo, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Hay 2-3 perfiles de comprador escritos —por ejemplo, la familia que busca su primera vivienda o el inversionista—, cada uno con su recorrido básico por etapa. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: videos del avance de obra, recorridos virtuales, guías para comprar o artículos del blog. `[2.5.F5]`
- Cada proyecto en venta tiene su propia página en el sitio, con renders, planos, ubicación, amenidades y fecha de entrega. `[2.5.F401 · comprobable]`

**Eficiente.**

*Resultado:* Los proyectos aparecen cuando alguien busca vivienda en su zona, tanto en buscadores como en asistentes de IA, con contenido pensado para cada tipo de comprador que importa, y lo que dicen quienes ya compraron juega a su favor.

- Los perfiles de comprador están detallados para los segmentos de más valor, como el inversionista o quien compra desde el exterior. `[2.5.E1]`
- El contenido está organizado por temas —cada proyecto, cada zona, cómo comprar con crédito—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido del comprador está mapeado con sus puntos de contacto definidos: portales, redes, sala de ventas, visita y reserva. `[2.5.E4]`
- Las reseñas y calificaciones públicas —en buscadores, en los portales y en redes— se piden a los compradores satisfechos y se responden con una cadencia fija. `[2.5.E5]`

**Óptimo.**

*Resultado:* La presencia de cada proyecto se mantiene vigente sola: el contenido se produce y se ajusta de forma continua para cada tipo de comprador y cada forma de buscar.

- Los perfiles de comprador están hiper-segmentados, casi al nivel de cada comprador. `[2.5.O1]`

*Se leen igual:* `2.5.D1`, `2.5.D2`, `2.5.D3`, `2.5.I1`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F4`, `2.5.E3`, `2.5.O2`.

#### 2.6 Segmentación

¿Cada interesado recibe lo que corresponde a su proyecto y a su tipo de comprador, o todos reciben la misma promoción?

*Descripción:* Mide si cada interesado recibe un mensaje pensado para su tipo de comprador y el proyecto que busca.

*Costo de quedarse:* Le mandas la misma promoción a todos: el inversionista recibe el mensaje pensado para la familia que busca su primera casa, y ninguno de los dos se siente hablado.

**Funcional.** Hay tipos de comprador definidos, piezas adaptadas a mano y criterios escritos para pasarle un interesado a un asesor.

*Resultado:* Cada tipo de comprador recibe un mensaje pensado para él, y los asesores reciben interesados que Marketing ya clasificó con criterios claros.

- Existen al menos 2 segmentos definidos con criterios escritos: por ejemplo, quien compra para vivir y quien compra para invertir, o quien paga con crédito y quien paga de contado. `[2.6.F1]`
- Las campañas recientes muestran piezas distintas por segmento: no le hablan igual a la familia que busca su primera vivienda que al inversionista. `[2.6.F3]`
- Existen criterios escritos de qué es un suscriptor, un interesado y uno listo para pasar a un asesor —por ejemplo, porque pidió precios o una visita—, y Marketing los clasifica según ellos, a mano o con una automatización simple sobre las propiedades de calificación. `[2.6.F4]`

**Eficiente.**

*Resultado:* El mensaje se adapta solo a quién lo recibe y a la etapa de su búsqueda, y los asesores reciben primero a los interesados con más probabilidad de comprar.

- Hay secuencias diferenciadas por segmento o por etapa del recorrido: no recibe lo mismo quien recién mira proyectos que quien ya visitó uno. `[2.6.E1]`
- La segmentación usa datos de comportamiento —qué proyecto miró, qué recorrido virtual vio, qué correo abrió—, no solo lo que la persona declaró. `[2.6.E4]`

**Óptimo.**

*Resultado:* Cada interesado ve los proyectos y las unidades que le corresponden según lo que hizo antes, sin que nadie tenga que armar un segmento para él.

- Hay personalización uno a uno: lo que ve cada persona —en los mensajes y en el sitio— cambia en tiempo real según lo que hizo antes, como los proyectos y las unidades que miró. `[2.6.O3]`

*Se leen igual:* `2.6.D1`, `2.6.D2`, `2.6.I1`, `2.6.I2`, `2.6.E2`, `2.6.E3`, `2.6.O1`.

#### 2.7 Canales y Alcance

¿Llegas a quien puede comprar en cada proyecto, por los canales correctos y con un costo por interesado que conoces?

*Descripción:* Mide si los canales llevan cada proyecto a quien puede comprarlo, con cadencia, bajo un plan y con costo conocido.

*Costo de quedarse:* Tu alcance depende del último anuncio: los portales, la pauta y las redes salen sueltos, anuncias unidades que ya se vendieron y no sabes cuánto te cuesta cada interesado.

**Funcional.**

*Resultado:* Una campaña sale coordinada por todos los canales en vez de esfuerzos sueltos, lo que se anuncia está disponible, y el líder sabe cuánto le cuesta cada interesado según de dónde venga.

- Hay al menos una campaña de pauta pagada corriendo con presupuesto definido: en buscadores, en redes o en los portales inmobiliarios. `[2.7.F3]`
- El canal conversacional, como WhatsApp, se usa para salir con cadencia definida —el lanzamiento de un proyecto, una feria, una promoción—, no solo para responder lo que entra. `[2.7.F4]`
- Los cuatro canales siguen el mismo calendario y la misma campaña: el lanzamiento de un proyecto sale coordinado en correo, pauta, redes y el canal conversacional, no como cuatro esfuerzos sueltos. `[2.7.F5]`
- El líder puede decir cuánto costó cada interesado —o cada venta, donde se compra sin vendedor— el último mes, al menos por canal: cada portal, la pauta y las redes. `[2.7.F6]`
- Los portales, la pauta y el sitio anuncian solo unidades disponibles: la que se reserva o se vende deja de promocionarse dentro del plazo acordado. `[2.7.F401 · comprobable · hábito]`

**Eficiente.**

*Resultado:* La inversión se mueve hacia el canal y el proyecto que traen visitas y reservas, los canales se refuerzan entre sí en vez de competir por el mismo interesado, y quienes ya compraron traen compradores nuevos.

- Los canales, incluido el conversacional, comparten datos y se alimentan entre sí: uno continúa lo que empezó otro, hay remarketing activo a quien miró un proyecto y las audiencias se construyen desde el CRM. `[2.7.E1]`
- Hay ferias inmobiliarias, eventos de lanzamiento, jornadas de puertas abiertas en el proyecto o webinars —por ejemplo, para inversionistas— como canal recurrente. `[2.7.E2]`
- El presupuesto de pauta de cada proyecto se reparte y se ajusta con frecuencia entre canales según los datos. `[2.7.E3]`
- Hay un programa de referidos activo: quienes ya compraron saben cómo recomendar el proyecto a un conocido, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- Se sabe cuánto cuesta cada visita y cada reserva en cada canal y en cada proyecto, no solo cada interesado. `[2.7.E401 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más reservas trae, los compradores satisfechos traen compradores nuevos, y la empresa llega antes que su competencia a los canales nuevos.

- Los compradores que Servicio identifica como promotores se vuelven un canal de referidos y de testimonios, sin pedirlos a mano. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.D2`, `2.7.I1`, `2.7.I2`, `2.7.I3`, `2.7.F1`, `2.7.F2`, `2.7.O1`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Cada lanzamiento y cada campaña te enseñan qué trae compradores, o el próximo proyecto se promociona igual que el anterior?

*Descripción:* Mide si cada campaña se evalúa por los interesados y las reservas que trajo, y deja un aprendizaje.

*Costo de quedarse:* Repites en cada proyecto la pauta y los mensajes de siempre sin saber cuáles trajeron compradores: el presupuesto se reparte por costumbre, no por retorno.

**Funcional.**

*Resultado:* El equipo ve cómo le fue a cada campaña —los interesados o las reservas que trajo— sin armar el número a mano, y cada una deja una lección escrita para la siguiente.

- Cada campaña significativa —un lanzamiento, una preventa o una feria— tiene una revisión de cierre documentada: qué funcionó y qué no. `[2.8.F3]`
- Los resultados de cada campaña —los interesados o las reservas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

*Resultado:* El equipo sabe qué renders, mensajes y audiencias funcionan porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma el lanzamiento siguiente.

- Hay tests A/B regulares (al menos uno activo por mes): por ejemplo, dos renders o dos mensajes para el mismo proyecto. `[2.8.E1]`
- El proceso de campaña y la planificación de las campañas siguientes —también el lanzamiento del próximo proyecto— se refinan con base en lo aprendido. `[2.8.E3]`

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.D3`, `2.8.I1`, `2.8.I2`, `2.8.E2`, `2.8.O2`.

### Área 3 — Servicio

Mide el rendimiento de la posventa de la inmobiliaria, que acompaña al comprador de la firma a la entrega de su unidad y durante la garantía: cómo está montada por dentro y qué produce en entregas sin pendientes, reclamos resueltos y compradores que recomiendan.

**Deficiente.** La posventa se improvisa comprador por comprador. No hay un proceso —cada quien responde a su criterio—, los reclamos llegan al teléfono de quien vendió y todo depende de que la persona correcta esté disponible. Los reclamos en redes te toman por sorpresa.

**Inicial.** Lo que pasa con cada comprador lo sabe una sola persona, y eso te deja con un punto único de falla. Hay un sistema para registrar los casos, pero pocos lo usan; hay algunas respuestas guardadas para lo más frecuente y una forma de entregar que nadie escribió. La entrega es frágil.

**Funcional.** Tu posventa es consistente y ya no depende de una persona. Sabes qué tipos de comprador atiendes y qué espera cada uno. Cada caso —una consulta, un trámite o un reclamo de obra— entra al mismo sistema y sigue las mismas etapas, el equipo atiende con la ficha del comprador a la vista, los casos están categorizados y la entrega sigue un proceso escrito. Atiendes primero lo urgente, tienes respuestas guardadas para lo repetitivo, avisas a tiempo cuando cambia la fecha de entrega y detectas a mano los problemas evidentes antes de que estallen. Todavía no hay alertas automáticas, pero ya no esperas a que el comprador reclame.

**Eficiente.** La posventa empieza a adelantarse al problema. Tienes plazos por tipo de caso que se vigilan solos, un portal donde el comprador ve y abre sus casos, y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción, y la información del comprador se une con la de Ventas. Cada comprador sabe cómo va su obra sin tener que preguntar, ninguna solicitud se pierde entre la obra, legal y cobros, y, donde hay condominio, el paso a su administración está acordado. La entrega deja de ser una sorpresa.

**Óptimo.** Un agente de IA responde las consultas de los compradores a toda hora y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y atiende las excepciones; muchos problemas de la entrega y de la garantía se resuelven antes de que el comprador los note, y cada comprador se atiende sabiendo lo que se le prometió en la venta y recibe detalles pensados para él. Atender a un comprador más casi no cuesta.

#### 3.1 Procesos y Rutinas

Si mañana se va quien lleva la posventa, ¿cada comprador sigue sabiendo cómo va su unidad, su entrega y sus reclamos?

*Descripción:* Mide si la posventa sigue un proceso y rutinas definidas, para que atender al comprador no dependa de quién sabe.

*Costo de quedarse:* La posventa depende de quien conoce cada caso: si esa persona falta, los reclamos de obra se quedan sin respuesta y los compradores lo notan de inmediato.

**Deficiente.**

- Cada persona de la posventa atiende las consultas y los reclamos a su manera. `[3.1.D1]`

**Inicial.**

- Unos atienden en el sistema; otros siguen con su WhatsApp personal. `[3.1.I3]`

**Funcional.** El equipo atiende en un mismo sistema, cada caso sigue las mismas etapas y cada comprador tiene quien responda por él.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada comprador tiene a alguien que responde por él, y un reclamo se atiende igual sin importar quién lo tome.

- El pipeline de servicio está configurado con sus etapas y cubre la atención de cada caso —una consulta, un trámite o un reclamo de obra—, de la recepción al cierre. `[3.1.F1]`
- Cada comprador tiene quién responda por él —una persona o, si son muchos, un equipo con un seguimiento automático— y un seguimiento mínimo más allá de los casos que abre. `[3.1.F2]`
- Hay reuniones del equipo de posventa con cadencia fija (al menos quincenal) que se sostienen. `[3.1.F3]`
- Existe un proceso básico documentado para quejas críticas o escalaciones: por ejemplo, una filtración o un defecto que impide habitar la unidad. `[3.1.F4]`
- Cualquier persona de la posventa explica cómo se atiende un caso típico —un reclamo de obra, una consulta sobre la escritura— siguiendo el mismo flujo. `[3.1.F5]`
- Cualquier persona de la posventa atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por WhatsApp o por teléfono. `[3.1.F6]`
- El proceso de garantía está escrito: qué cubre cada garantía, cuánto dura y cómo se reporta y se atiende un reclamo de obra. `[3.1.F401 · declarado]`

**Eficiente.**

*Resultado:* El comprador sabe cuánto va a tardar la respuesta, cada momento clave —la escritura, la entrega, la garantía— tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLAs definidos por tipo de caso o prioridad: no se atiende en el mismo plazo una consulta que un reclamo que impide habitar la unidad. `[3.1.E1]`
- El recorrido del comprador está definido de punta a punta, con sus momentos clave —la firma, el avance de la obra, la escritura, la entrega, la garantía y, si la hay, una renovación o una recompra— y un responsable y un estándar para cada uno. `[3.1.E4]`
- Hay guías escritas para los momentos difíciles de la posventa: un atraso en la entrega, un reclamo de obra que se repite o una escritura que se traba. `[3.1.E401 · declarado]`

**Óptimo.**

- El sistema detecta las desviaciones del proceso de atención y se las señala al líder y a quien atiende el caso, sin intervención. `[3.1.O3]`

*Se leen igual:* `3.1.D2`, `3.1.I1`, `3.1.I2`, `3.1.E3`, `3.1.E5`, `3.1.O1`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cuántas consultas de los compradores —cómo va la obra, cuándo se firma la escritura, cómo reportar un pendiente— necesitan a una persona cuando podrían resolverse solas?

*Descripción:* Mide cuántas consultas de los compradores se resuelven solas o por autoservicio, y cuánto se aprovecha el sistema de posventa.

*Costo de quedarse:* Tu equipo contesta a mano las mismas preguntas sobre la obra y la entrega, y los reclamos se pierden entre el WhatsApp de quien vendió, el correo y las llamadas.

**Deficiente.**

- Los reclamos y las consultas llegan al celular de quien vendió o al correo de cada persona. `[3.2.D2]`

**Funcional.**

*Resultado:* Cada consulta o reclamo que llega por los canales conectados entra al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Al entrar un caso, el sistema lo asigna automáticamente según una regla simple —por proyecto o por tipo de caso—; las notificaciones de cambio de estado llegan a quien las necesita. `[3.2.F5]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los reclamos críticos llegan solos a quien los tiene que resolver; el comprador puede ver y abrir sus casos y resolver lo simple sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién—, y las conversaciones y los casos se enrutan por múltiples condiciones, como el proyecto, el tipo de reclamo o el idioma. `[3.2.E1]`
- Hay un portal donde el comprador ve y abre sus casos —un reclamo de obra, un trámite—, y una base de conocimiento interna y pública. `[3.2.E2]`

**Óptimo.**

- Hay un agente de IA en producción que resuelve las consultas de los compradores en todos los canales sin intervención humana y pasa a una persona, con el contexto completo, cuando hace falta; hay automatización de flujos de trabajo. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de posventa: quien atiende ve en la ficha, por ejemplo, el riesgo de que un comprador desista antes de la escritura. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.I2`, `3.2.F4`, `3.2.F6`, `3.2.F8`, `3.2.E3`, `3.2.E4`, `3.2.E5`.

#### 3.3 Datos

¿Quien atiende ve al instante qué unidad compró cada comprador, qué ha pagado y qué reclamos tiene abiertos, o se lo pregunta?

*Descripción:* Mide si quien atiende ve al instante la unidad, los pagos y los casos anteriores de cada comprador.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que decir qué unidad compró y volver a explicar su reclamo, porque nadie ve su historia completa.

**Funcional.**

*Resultado:* El líder sabe qué tipo de reclamos y consultas llegan y cuántos, y quien atiende tiene la historia de cada comprador en segundos.

- Cualquier persona de la posventa ve el histórico de casos de un comprador en menos de 10 segundos. `[3.3.F1]`
- La ficha del comprador muestra la unidad que compró, lo que ha pagado y su valor, no solo sus casos. `[3.3.F2]`
- Las propiedades clave del comprador —qué unidad compró y cuándo firmó— están pobladas en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene tipo y motivo, con una taxonomía definida: por ejemplo, un reclamo de obra por humedad, por acabados o por instalaciones. `[3.3.F4]`

**Eficiente.**

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende a sus compradores, cuánto tarda cada uno en tener su unidad sin pendientes y qué tan satisfechos quedan, con la satisfacción medida y no supuesta.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los SLA, en todos los canales, también en los reclamos de garantía. `[3.3.E1]`
- Se mide la satisfacción del comprador con NPS o CSAT con cadencia: por ejemplo, después de la entrega y al cerrar cada reclamo. `[3.3.E2]`
- Se mide cuánto tarda cada comprador en tener su unidad sin pendientes: el tiempo desde que empieza su entrega hasta que se cierra su último pendiente. `[3.3.E4]`

**Óptimo.** Los modelos anticipan los problemas de cada comprador antes de que los manifieste, con datos que se mantienen al día solos.

*Resultado:* La empresa sabe qué compradores están en riesgo de quedar mal con su entrega antes de que lo digan y, donde el cliente vuelve, cuáles están logrando lo que buscaban, con datos que se mantienen al día solos.

*Se leen igual:* `3.3.D1`, `3.3.D2`, `3.3.I1`, `3.3.I2`, `3.3.F5`, `3.3.F6`, `3.3.E3`, `3.3.E5`, `3.3.O1`, `3.3.O2`, `3.3.O3`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Quién decide qué se atiende primero en la posventa, con qué información, y cómo se mejora?

*Descripción:* Mide quién decide qué se atiende primero en la posventa, con qué información, y cómo se revisa y mejora.

*Costo de quedarse:* Se atiende primero al comprador que más insiste, no al que tiene el problema más grave, y los mismos reclamos se repiten en cada proyecto porque nadie los revisa.

**Deficiente.**

- No hay coordinación entre quien acompaña la escritura, quien hace la entrega y quien atiende los reclamos. `[3.4.D1]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si la posventa va al día o se está atrasando.

- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (casos abiertos, reclamos por proyecto, pendientes de entrega, casos por tipo) y lo consulta al menos semanalmente. `[3.4.F2]`

**Eficiente.**

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, cada comprador llega de Ventas con lo que se le prometió y, donde hay condominio, el paso a su administración no deja al propietario sin saber a quién acudir.

- Cuando entra alguien nuevo a la posventa, hay un plan de inducción con sus pasos y materiales —los proyectos, las garantías y los sistemas—; no se le entrena de memoria. `[3.4.E2]`
- El liderazgo orquesta con Ventas —cada comprador llega a la posventa con lo que busca y lo que se le prometió al vender, y lo que pone en riesgo una venta vuelve a Ventas— y con Marketing. `[3.4.E4]`
- Si el proyecto queda en condominio, el traspaso a su administración está acordado por escrito: qué se entrega, cuándo y a quién acude el propietario desde ese día para cada cosa. `[3.4.E401 · declarado]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y la posventa se mide por cómo reciben su unidad los compradores.

*Resultado:* La posventa se mide por cómo reciben su unidad los compradores y por su disposición a recomendar —y, donde el cliente vuelve, por lo que retiene—, no solo por los casos que cierra.

- Las decisiones usan analítica avanzada, como cuánto cuestan la posventa y las garantías de cada proyecto frente a lo que deja. `[3.4.O4]`
- El equipo de posventa se mide por cómo reciben su unidad los compradores —entregas sin pendientes y su satisfacción— y por su disposición a recomendar, no solo por los casos que cierra. `[3.4.O401 · declarado · hábito · requiere 3.3.E2]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.E1`, `3.4.O1`, `3.4.O2`, `3.4.O3`.

#### 3.5 Consistencia de la posventa

¿Cada comprador recibe la misma respuesta y la misma entrega, lo atienda quien lo atienda?

*Descripción:* Mide si cada comprador recibe la misma atención, las mismas respuestas y la misma entrega, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo reclamo se acepta o se rechaza según quién atienda, y cada entrega se hace a su manera: el comprador lo nota y se lo cuenta a sus vecinos.

**Deficiente.** Sin estandarización; cada persona responde y entrega a su criterio.

**Inicial.**

- No hay guía de tono; cada quien usa las plantillas a su discreción. `[3.5.I1]`

**Funcional.** Hay tipos de comprador definidos, respuestas guardadas y una entrega estructurada.

*Resultado:* El equipo sabe qué tipos de comprador atiende y qué espera cada uno, cada unidad se entrega con el mismo proceso y un resultado definido, y las respuestas a lo frecuente salen iguales sin importar quién atienda.

- Hay al menos algunas respuestas guardadas disponibles para quien atiende la posventa. `[3.5.F1]`
- Existe un proceso documentado de entrega de la unidad —inspección previa, acta de entrega y lista de pendientes—, con un resultado definido que el comprador debe alcanzar al terminarlo: recibir su unidad sin pendientes abiertos. `[3.5.F2]`
- Cualquier persona nueva de la posventa recibe las respuestas guardadas en su capacitación inicial. `[3.5.F3]`
- Existe un documento simple con los tipos de comprador que atiende la posventa —por ejemplo, quien va a vivir la unidad y quien la compró para alquilarla—, qué necesita cada uno y qué espera del servicio, consultable por cualquiera del equipo. `[3.5.F4]`

**Eficiente.**

*Resultado:* El comprador reconoce la misma voz en cada respuesta, sea quien sea quien lo atienda.

- Hay plantillas de respuesta a los casos frecuentes —cómo reportar un pendiente, qué cubre la garantía— cargadas como respuestas guardadas, en uso. `[3.5.E1]`
- El tono y la voz de marca se aplican a las respuestas, no cada persona con su estilo. `[3.5.E2]`

*Se leen igual:* `3.5.D1`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de compradores

¿Un reclamo que impide habitar la unidad se atiende antes que una consulta, y cada comprador recibe la atención que le corresponde?

*Descripción:* Mide si la atención se prioriza por la gravedad del caso y el momento del comprador, no por quién insiste.

*Costo de quedarse:* Una filtración espera en la misma fila que una consulta sobre la escritura, y nadie nota que el comprador que recibe su unidad la próxima semana sigue con pendientes.

**Deficiente.**

- Los casos se atienden por orden de llegada o según quién los toma, sin contexto del comprador. `[3.6.D1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero y cada tipo de comprador recibe una atención acorde, sin que quien atiende tenga que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta: una filtración va antes que una consulta. `[3.6.F1]`
- La atención se diferencia según los tipos de comprador: cada tipo tiene claro qué nivel de atención recibe. `[3.6.F2]`
- Quien atiende usa la ficha del comprador —la unidad que compró, lo que ha pagado y sus casos abiertos— para dar contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** La atención cambia según el momento de cada comprador y, donde el cliente vuelve, cada cliente clave tiene un responsable dedicado.

*Resultado:* La atención cambia según el momento en que está cada comprador —por escriturar, por recibir su unidad, en garantía o listo para recomendar— y, donde el cliente vuelve, cada cliente clave tiene un dueño que lo conoce.

- Los compradores se segmentan para acciones diferenciadas según el momento de su relación: por escriturar, por recibir su unidad, en garantía o listos para recomendar; donde el cliente vuelve, sanos, en riesgo o con potencial de crecer. `[3.6.E2]`

**Óptimo.**

*Resultado:* Cada comprador recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que se le prometió al vender.

- Cada comprador se atiende con el contexto de cómo llegó —lo que se le prometió en la venta: acabados, amenidades y fecha de entrega—, sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.I1`, `3.6.E1`, `3.6.O1`, `3.6.O2`.

#### 3.7 Acompañamiento del comprador

¿El comprador sabe cómo va su unidad y cuándo se la entregan sin tener que preguntar, y te enteras de un problema antes de que reclame?

*Descripción:* Mide si el comprador sabe cómo va su unidad sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera del atraso de su entrega por un vecino o por la prensa, y tú te enteras de que quedó mal cuando lo publica en redes.

**Funcional.**

*Resultado:* Los reclamos que se repiten, las malas calificaciones, los cambios en la fecha de entrega y los vencimientos importantes ya no toman al equipo por sorpresa: se actúa antes de que el comprador reclame en público.

- Un comprador con reclamos repetidos del mismo problema, una queja sin resolver o una mala calificación se identifica, y alguien lo contacta antes de que escale. `[3.7.F1]`
- Los compradores clave —por ejemplo, quien compró varias unidades— reciben contacto antes de un vencimiento importante —la escritura, el fin de una garantía o, si la hay, una renovación—, no después. `[3.7.F2]`
- Cuando cambia la fecha de entrega, cada comprador afectado recibe el aviso de la empresa —con la fecha nueva y la razón— antes de que se cumpla la fecha anterior. `[3.7.F401 · comprobable · hábito]`

**Eficiente.** Los problemas y las solicitudes pendientes se ven venir, las atienda el área que sea, y el comprador recibe lo que necesita saber antes de pedirlo.

*Resultado:* Las solicitudes del comprador no se pierden entre la posventa, la obra, legal y cobros, cada comprador sabe cómo va su unidad antes de preguntarlo y los problemas se atienden antes de que escalen; donde el cliente vuelve, la empresa retiene clientes que antes se perdían sin aviso.

- Ninguna solicitud o molestia del comprador se pierde entre áreas: quedan en el sistema aunque las resuelva otra área —la obra, legal, cobros—, y hay alertas automáticas cuando una se atrasa, cuando un comprador califica mal o cuando se acerca una fecha crítica —una entrega, el fin de una garantía, una escritura—, que le llegan a quien tiene que actuar. `[3.7.E4]`
- Cada comprador recibe, sin tener que pedirla, la información que necesita antes de los momentos clave —la escritura, la inspección previa, la entrega—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`
- Si la unidad se vende antes de terminarse, de la firma a la entrega cada comprador recibe en una cadencia fija cómo va la obra de su proyecto y la fecha de entrega vigente, sin tener que pedirlo. `[3.7.E401 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La mayoría de los problemas de la entrega y de la garantía se resuelven antes de que el comprador los note, y cada comprador siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- Muchos problemas —de la entrega, de la garantía o de un trámite— se resuelven antes de que el comprador los note. `[3.7.O2]`
- Los compradores reciben, sin pedirlos, detalles pensados para deleitarlos —un regalo al recibir la unidad, un beneficio en el aniversario de la entrega—, elegidos según su historia y el momento de su relación. `[3.7.O4]`

*Se leen igual:* `3.7.D1`, `3.7.D2`, `3.7.I1`, `3.7.F3`, `3.7.E1`, `3.7.E2`, `3.7.E3`, `3.7.O1`, `3.7.O3`.

#### 3.8 Escalabilidad de la posventa

¿Cada proyecto que entregas multiplica las mismas preguntas y los mismos reclamos, o atender a un comprador más cuesta cada vez menos?

*Descripción:* Mide si atender a más compradores cuesta menos cada vez, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Las mismas preguntas y los mismos reclamos vuelven con cada proyecto: para entregar más unidades, tienes que contratar al mismo ritmo.

**Deficiente.** La posventa depende por completo de personas.

**Funcional.**

*Resultado:* Las preguntas de siempre dejan de consumir al equipo: el comprador encuentra la respuesta publicada y nadie la vuelve a escribir.

- Las consultas que más se repiten —cómo usar la garantía, cómo reportar un pendiente, qué documentos pide la escritura— tienen una respuesta que el comprador puede consultar por su cuenta, como el manual del propietario o las preguntas frecuentes. `[3.8.F1]`

**Eficiente.**

*Resultado:* La empresa puede entregar más unidades sin sumar personas en la misma proporción, porque buena parte se resuelve sola, y lo que enseñan los reclamos llega a quien construye el próximo proyecto.

- Se revisan periódicamente los reclamos que se repiten —por ejemplo, la misma falla en varias unidades de un proyecto— y, donde la relación es continua, las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2]`
- Los patrones de los reclamos de garantía se comparten con quien diseña y construye, para que el próximo proyecto no repita las mismas fallas. `[3.8.E401 · declarado · hábito]`

**Óptimo.**

- Los aprendizajes retroalimentan automáticamente la consistencia de la posventa, la priorización de los compradores y el acompañamiento de cada uno. `[3.8.O3]`

*Se leen igual:* `3.8.D1`, `3.8.D2`, `3.8.I1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E3`, `3.8.O1`, `3.8.O2`.
