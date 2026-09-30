---
documento: Escala de Rendimiento Smarteam — Escalas departamentales
version: 8.0.0
fecha: 2026-09-29
estado: En revisión: cambia con el feedback de su responsable y los comentarios del equipo en Nexus
relacionados: especificacion_calculo_escala.md, manual_operacion_escala.md
---

# Cómo leer este documento

Este documento es la Escala de Rendimiento: define qué significa cada nivel y cada criterio. Lo consumen personas y sistemas: el chequeo y su página de resultados, el cotizador, los agentes de Nexus, y los materiales que se preparan para el equipo y para los clientes.

La escala va con dos documentos más. La **especificación del cálculo** (`especificacion_calculo_escala.md`) convierte sus reglas en pasos exactos para los sistemas: cómo se calculan el nivel y el puntaje, qué se muestra y qué se guarda. El **manual de operación** (`manual_operacion_escala.md`) dice cómo trabaja el equipo con ella: quién la aplica y cuándo, cómo se comprueba que funciona y qué reglas esperan hasta que hagan falta. Los dos precisan lo que dice la escala, pero no lo cambian: si alguno la contradice, manda la escala y se corrige el otro.

Tiene cinco partes. La primera explica qué es la escala y cómo pensarla: es contexto, no regla, y sirve para entender y para enseñar. La segunda dice cómo se aplica: las dos formas de aplicarla, cómo se evalúa, cómo se llega al nivel y al puntaje, qué se trabaja primero y dónde se cuenta cada evidencia. La tercera es la matriz: cada dimensión de cada área con sus cinco niveles y sus criterios. La cuarta es la referencia: nombres, riesgos, glosario e historial. La quinta trae las ediciones por industria: la misma escala, dicha para una industria.

Las partes dos, tres, cuatro y cinco son normativas y se aplican al pie de la letra. Si algo de la primera parte parece contradecirlas, mandan ellas. Cualquier material derivado —una página teórica, una presentación, las preguntas del chequeo— respeta la matriz y las reglas sin reinterpretarlas.

Cada criterio de la matriz termina con una etiqueta entre corchetes: su identificador, cómo se verifica y sus marcas. Es para los sistemas y para quien diagnostica; para entender la escala, se puede saltar.

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

**Servicio.** Tu entrega es consistente y ya no depende del individuo. Sabes qué tipos de cliente atiendes y qué espera cada uno. Hay un pipeline de servicio configurado, el sistema central se usa con vista unificada del cliente, los tickets están categorizados y el onboarding es estructurado. Priorizas por severidad, tienes macros para lo repetitivo y detectas a mano los riesgos evidentes antes de que estallen. Todavía no hay alertas automáticas, pero ya no esperas a que el cliente se queje.

### Eficiente

**Ventas.** Tu proceso dejó de ser etapas y se volvió método con disciplina medida. Mides conversión y velocidad por etapa, la automatización tiene lógica, el stack está integrado y aparece un forecast confiable. Hacia afuera hay lead scoring por reglas, cuentas objetivo, contacto multicanal y análisis estructurado de ganadas y perdidas.

**Marketing.** Los ciclos cortos de prueba y ajuste ya son parte del proceso. Los datos están unificados, enriquecidos y atribuidos; la segmentación y el scoring se automatizan; y la presencia se optimiza tanto para buscadores como para motores generativos. El presupuesto se distribuye entre canales con criterio y tu presencia en la conversación del mercado es medible.

**Servicio.** El servicio empieza a adelantarse al problema. Tienes SLAs, reglas de escalación y autoservicio; mides tiempos de resolución y satisfacción, y la data se unifica con Ventas. Identificas riesgos y oportunidades antes de que el cliente levante la mano, ninguna solicitud se pierde entre áreas, y las cuentas clave tienen un responsable asignado. La retención se vuelve predecible.

### Óptimo

**Ventas.** La IA hace el trabajo pesado y tu equipo valida donde importa. Agentes de IA califican leads y agendan reuniones, las llamadas se analizan solas y sugieren correcciones al playbook, el forecast lo calcula un modelo, y la priorización se alimenta de lo que saben Servicio y Marketing de cada cliente. El rep dedica su tiempo a las conversaciones que deciden el deal, no a la administración.

**Marketing.** La IA produce y ajusta; el equipo dirige. El contenido se genera y optimiza en ciclo continuo, la IA identifica micro-segmentos y adapta el mensaje al comportamiento de cada persona, los modelos reasignan presupuesto entre canales sobre la marcha, y los clientes que Servicio vuelve promotores traen clientes nuevos. El equipo define la estrategia y valida lo que sale.

**Servicio.** Un agente de IA resuelve consultas en producción y tus agentes trabajan con asistentes de IA. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y gestiona excepciones; un modelo de salud de cuenta anticipa el riesgo antes de que el cliente lo manifieste, y cada cliente se atiende sabiendo lo que se le prometió en la venta y recibe detalles pensados para deleitarlo. Atender un cliente más casi no cuesta.

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
| Producción | Marketing | Marca y Presencia → Segmentación → Canales y Alcance → Medición y Aprendizaje | Los buyer personas se definen en Marca y Presencia: sin ellos no hay segmentos, sin segmentos no se sabe a quién llegar, y sin canales no hay qué medir. |
| Producción | Servicio | Consistencia de Atención → Priorización de Clientes → Proactividad → Escalabilidad del Servicio | Los tipos de cliente se definen en Consistencia de Atención: sin ellos no hay niveles de atención, sin niveles no se sabe a quién adelantarse, y solo se escala lo que ya se hace bien. |

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

- Los **artefactos de ejecución de venta** (pitch, plantilla de propuesta, playbook, criterios de etapa, definición de oportunidad calificada, cadencia, metodología) se asignan a **Procesos de Ventas (1.1)**. La dimensión 1.5 (Propuesta y Coherencia) mide el resultado que percibe el cliente de esos artefactos, no los vuelve a contar.
- El **forecast** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1) ni a 1.5.
- En la **frontera Marketing ↔ Ventas**, cada pieza se asigna por quién la ejecuta: la definición de a quién sirve el equipo comercial (ICP) en **1.5 (Ventas)**; la segmentación y personalización del mensaje de marketing en **2.6 (Marketing)**; marcar MQL (lo califica marketing) en **2.6 (Marketing)**; aceptar SQL (criterio del lado de Ventas) en **1.6 (Ventas)**; poblar el campo de etapa del ciclo de vida, como higiene de dato, en **Datos** del área que lo captura (1.3 o 2.3); el diseño técnico del pipeline en **Tecnología** (1.2 o 2.2). El SQL a nivel de contacto (1.6) no se confunde con la definición de oportunidad calificada a nivel de deal, que es un artefacto de venta y se asigna a 1.1.
- En **Servicio**, la definición de los tipos de cliente que atiende el área —qué necesita cada uno y qué espera— se asigna a **Consistencia de Atención (3.5)**, como el ICP a 1.5 y los buyer personas a 2.5; la diferenciación de la atención según esos tipos, a **Priorización de Clientes (3.6)**.
- El **lead scoring por reglas** se asigna a la dimensión de segmentación o priorización de cada área (**1.6 en Ventas, 2.6 en Marketing**), y es nivel Eficiente. No se confunde con la calificación de Funcional: ahí basta aplicar criterios escritos, sea a mano o con una automatización simple sobre una propiedad; el scoring de Eficiente es un modelo de puntaje con varios atributos.
- El **canal conversacional y la bandeja** se asignan a **Tecnología** del área correspondiente (1.2, 2.2 o 3.2): un canal con bandeja básica es Funcional; varios canales en una bandeja unificada es Eficiente. Usar ese mismo canal para **salir** con cadencia —WhatsApp como canal de campaña— se asigna a Canales (2.7), no a Tecnología: una cosa es tenerlo conectado y otra es usarlo para llegar.
- El **análisis automático de conversaciones** se asigna a **1.8 (Ventas)**, no a Tecnología: es aprendizaje, no infraestructura.
- La **integración con ERP** u otros sistemas se asigna a **Tecnología** del área que la implementa; **Datos** solo declara el resultado (registros completos y trazables).
- La **orquestación entre áreas** (SLAs, handoffs, rutinas conjuntas) se asigna a **Equipo y Gobierno** del área cuyo liderazgo sostiene la coordinación, y nunca es Funcional: su piso es Eficiente. El workflow técnico que la habilita se asigna a Tecnología. Las dimensiones 1.7, 2.7 y 3.7 miden el alcance hacia el destinatario final, no la coordinación entre departamentos.
- La **respuesta a un deal que se enfría** se asigna a **Tracción del Deal (1.7)**; la cadencia general de contacto sigue en Procesos (1.1).
- La **próxima compra de un cliente que vuelve sin contrato** —recordarle la recompra, reactivar a quien dejó de comprar— se asigna a **Tracción del Deal (1.7)**; retener a quien está por cancelar un contrato y atender sus quejas sigue en **Proactividad (3.7)**, y las campañas hacia el mercado, en **Canales y Alcance (2.7)**.
- La **venta ganada que se cae antes de la entrega** —una reserva que se desiste, una matrícula que no llega a clases, un pedido que se cancela— se asigna a **Aprendizaje de Ganadas y Perdidas (1.8)**, igual que una pérdida; la salida de un cliente que ya recibía el servicio sigue en **Proactividad (3.7)**.
- La **coherencia de la oferta entre canales** —precios, promociones y condiciones— se asigna a **Propuesta y Coherencia (1.5)**; la coordinación de una campaña entre canales sigue en **Canales y Alcance (2.7)**.
- Donde se vende sin vendedor, **lo que la tienda le muestra a cada comprador** —sugerencias, oferta, trato a sus mejores clientes— se asigna a la **personalización de Ventas (1.6)**; el mensaje de las campañas para cada segmento sigue en **Segmentación (2.6)**.
- La **disponibilidad de lo que se vende** —unidades, cupos o existencias, a la vista de quien vende— se asigna a **Tecnología de Ventas (1.2)**, y que cada venta quede asociada a un **cliente identificado**, a **Datos de Ventas (1.3)**.
- Las **reseñas y calificaciones públicas** —pedirlas y responderlas— se asignan a **Marca y Presencia (2.5)**, porque son parte de cómo el mercado ve a la empresa; la mala calificación de un cliente puntual se atiende en **Proactividad (3.7)**. El **programa de referidos** se asigna a **Canales y Alcance (2.7)**.
- La **detección de riesgos y fechas críticas del cliente** —también las solicitudes que resuelve otra área, como administración o cobros— se asigna a **Proactividad (3.7)**; el seguimiento de cada cliente por su responsable sigue en Procesos (3.1), y los acuerdos entre los líderes de esas áreas, en Equipo y Gobierno.
- Los **detalles para deleitar a los clientes actuales** —regalías, beneficios, promociones de fidelización— se asignan a **Proactividad (3.7)**; las campañas hacia el mercado, a **Canales y Alcance (2.7)**.
- La **respuesta publicada para el cliente** a las consultas frecuentes se asigna a **Escalabilidad del Servicio (3.8)**; las plantillas internas para los agentes siguen en Consistencia de Atención (3.5), y el portal con base de conocimiento en Tecnología (3.2), en Eficiente.
- La **distribución y el ajuste del presupuesto** entre canales se asignan a **Canales y Alcance (2.7)**, porque su pregunta incluye llegar con el costo correcto; Medición y Aprendizaje (2.8) mide cómo se aprende de cada campaña, no dónde se invierte.
- La **personalización del contenido** según el segmento o la persona se asigna a **Segmentación (2.6)**, y el **enriquecimiento de datos** a **Datos (2.3)**; ninguno de los dos se cuenta en Tecnología (2.2).
- Los **playbooks de servicio** —prevención, retención y expansión— se asignan a **Procesos (3.1)**, igual que los artefactos de venta en Ventas; Proactividad (3.7) mide que los riesgos y las oportunidades se atiendan a tiempo.
- El **uso de lo que produce otra área** —las señales de Servicio en la priorización de Ventas, los promotores de Servicio como canal de Marketing, el contexto de la venta en la atención de Servicio— se asigna, en Óptimo, a la dimensión de producción del área que lo recibe. No es orquestación: la coordinación entre líderes sigue en Equipo y Gobierno.
- La **rendición de cuentas contra meta** se asigna a **Equipo y Gobierno**.
- La **reunión recurrente** es una sola: se asigna a **Procesos**, que es donde vive la rutina; **Equipo y Gobierno** solo dice que el líder la sostiene y la usa para rendir cuentas.

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

*Resultado:* Todo el equipo trabaja el mismo proceso en el CRM: los negocios avanzan y se califican con los mismos criterios, se contactan con la cadencia acordada y se revisan en cada pipeline review, así que si rota un vendedor, el siguiente sabe en qué va cada negocio.

- Existe al menos un pipeline de ventas configurado con sus etapas y criterios de avance, y cualquier rep los explica igual. `[1.1.F1 · evaluado]`
- Cada proceso de ventas o prospección tiene su pipeline respectivo configurado con sus criterios de avance y aceptación. `[1.1.F2 · comprobable]`
- Existe una definición escrita de "oportunidad calificada" que el equipo aplica de forma consistente. `[1.1.F3 · evaluado · hábito · venta con equipo]`
- Hay proceso de venta documentado y cadencia de contacto definida (X intentos en Y días) que se cumple la mayoría del tiempo. `[1.1.F4 · comprobable · hábito]`
- La pipeline review corre en cadencia formal, semanal o quincenal. `[1.1.F5 · declarado · hábito]`
- Cualquier rep abre el CRM como herramienta de trabajo, no por obligación. `[1.1.F6 · evaluado · hábito · venta con equipo]`

**Eficiente.** El proceso deja de ser solo etapas y se vuelve método con disciplina medida.

*Resultado:* El líder sabe dónde se desvía el equipo del método y corrige con datos, y el proceso mejora ciclo a ciclo en vez de congelarse.

- Hay metodología comercial formal en uso (SPIN, MEDDIC, BANT o equivalente). `[1.1.E1 · evaluado · hábito · venta con equipo]`
- Existen playbooks de discovery, calificación y manejo de objeciones que el equipo usa. `[1.1.E2 · evaluado · hábito · venta con equipo]`
- El líder monitorea la adherencia con datos del sistema, no de memoria. `[1.1.E3 · evaluado · hábito · venta con equipo]`
- El proceso se refina en cadencia, no se deja congelado. `[1.1.E4 · declarado · hábito]`

**Óptimo.** El sistema vigila la adherencia y señala desviaciones; el equipo decide los ajustes.

*Resultado:* El proceso se corrige casi solo: el sistema señala las desviaciones y el equipo dedica su tiempo a probar mejoras, no a vigilar que se cumpla.

- El sistema detecta desviaciones y las señala al líder y al rep sin intervención. `[1.1.O1 · comprobable]`
- La adherencia es alta sin que nadie la vigile a mano. `[1.1.O2 · comprobable · hábito · venta con equipo]`
- El proceso cambia en ciclos cortos con base en data, con pilotos de técnicas nuevas. `[1.1.O3 · declarado · hábito]`

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
- No hay reps trabajando con hojas ni conversaciones paralelas al CRM: lo que cada uno habla con un prospecto por el canal conversacional, como WhatsApp, queda en el sistema aunque responda desde su teléfono. `[1.2.F4 · evaluado · hábito · venta con equipo]`
- Las ventas sin vendedor —en tienda, en el sitio web o por autoservicio— entran solas al sistema como negocios, con su monto, su canal y su cliente. `[1.2.F6 · comprobable · venta sin vendedor]`
- Si el equipo usa IA, esta tiene como contexto la información básica de los clientes y prospectos. `[1.2.F7 · comprobable]`
- Si lo que se vende es limitado —unidades de un proyecto, cupos de un programa o existencias—, quien vende ve en el sistema qué está disponible antes de ofrecerlo. `[1.2.F8 · comprobable]`

**Eficiente.** La automatización tiene lógica, el stack está integrado y la IA asiste al equipo en su trabajo diario.

*Resultado:* El vendedor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones se generan desde el sistema, no como documentos sueltos. `[1.2.E1 · comprobable · venta con equipo]`
- Hay secuencias de contacto de varios pasos que cambian según cómo responde el prospecto —si leyó, hizo clic o contestó—, y los leads y las conversaciones se asignan por múltiples condiciones o por capacidad, con control de quién ve y responde cada conversación. `[1.2.E2 · comprobable]`
- Hay integración con ERP u otros sistemas operativos cuando aplica. `[1.2.E3 · comprobable]`
- Hay paneles en tiempo real de conversión y de conversaciones: cuánto tarda la primera respuesta y cuántas quedan sin seguimiento. `[1.2.E4 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar, resumir conversaciones o sugerir el siguiente paso—, y la IA trabaja con el contexto de los clientes y prospectos. `[1.2.E5 · evaluado · hábito]`

**Óptimo.** Agentes de IA califican y agendan; el rep trabaja con predicción de cierre y la siguiente mejor acción.

*Resultado:* El vendedor dedica su tiempo a las conversaciones que deciden la venta: los agentes califican y agendan, y la ficha le dice qué hacer después.

- Hay análisis predictivo de cierre, la siguiente mejor acción y sugerencias de respuesta por contexto. `[1.2.O1 · comprobable]`
- Agentes de IA califican leads y agendan reuniones 24/7 en el canal conversacional, y le pasan al vendedor, con el contexto, a quien está listo. `[1.2.O2 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al CRM: el vendedor ve en la ficha, por ejemplo, el potencial de la cuenta, sin salir de su herramienta. `[1.2.O3 · comprobable]`

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
- La documentación sobre el ICP no se deja envejecer. `[1.3.F5 · declarado · riesgo · hábito]`
- La definición de lead calificado no se deja envejecer. `[1.3.F6 · declarado · riesgo · hábito · venta con equipo]`
- La documentación sobre las soluciones ofrecidas no se deja envejecer. `[1.3.F7 · declarado · riesgo · hábito]`
- Se sabe qué parte de las ventas sin vendedor queda asociada a un cliente identificado, y ese número se revisa. `[1.3.F8 · comprobable · venta sin vendedor]`

**Eficiente.** Aparece el forecast con precisión y la integración operativa.

*Resultado:* La empresa puede comprometer un número de ventas con confianza, porque el pronóstico se acerca a lo que de verdad pasa.

- Hay forecast con cadencia fija (semanal o quincenal) y precisión alta. `[1.3.E1 · comprobable · hábito]`
- La deduplicación es automática por reglas o merge del sistema. `[1.3.E2 · comprobable]`
- El CRM está integrado a sistemas operativos (ERP, facturación) cuando aplica; la vista 360° empieza a tomar forma, con el historial de conversaciones incluido. `[1.3.E3 · comprobable]`
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
- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (valor del pipeline, deals creados, tasa de cierre, volumen) y lo consulta al menos semanalmente. `[1.4.F2 · evaluado · hábito]`
- Se sostiene la cadencia de revisión (la misma pipeline review) y en ella se rinde cuentas. `[1.4.F3 · evaluado · hábito]`
- Cada vendedor —o cada canal, donde se compra sin vendedor— tiene una meta clara, y su avance se reporta en cadencia fija. `[1.4.F4 · declarado · hábito]`
- El líder ve en reportes automáticos qué tareas cumplió cada vendedor y cuáles tiene pendientes. `[1.4.F5 · comprobable · venta con equipo]`

**Eficiente.** El liderazgo monitorea con alertas y orquesta con Marketing.

*Resultado:* Un vendedor nuevo produce más rápido, el líder se entera de los riesgos por una alerta y no al cierre, y el traspaso de leads con Marketing tiene reglas que se cumplen.

- Se monitorea la adherencia y los deals en riesgo con alertas automáticas. `[1.4.E1 · comprobable]`
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria. `[1.4.E2 · declarado]`
- El SLA y el handoff con Marketing están definidos y son trazables (tiempo de respuesta, calidad del lead, criterios de rechazo); el líder apoya en deals grandes o críticos. `[1.4.E3 · comprobable · venta con equipo]`
- Hay una cultura de retroalimentación del equipo hacia el sistema, y ajuste continuo respaldado por datos. `[1.4.E4 · evaluado · hábito]`

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

**Eficiente.** El equipo se presenta como una unidad metodológicamente disciplinada.

*Resultado:* El mercado reconoce a la empresa por algo concreto: la propuesta se distingue de la competencia, se sostiene igual en cada contacto y promete lo que después se entrega.

- El equipo se presenta como una unidad cohesiva; el mensaje no cambia según el rep. `[1.5.E1 · evaluado · hábito · venta con equipo]`
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

**Funcional.** Hay segmentación básica de leads y criterios claros para aceptar un SQL.

*Resultado:* El equipo deja de perder tiempo con prospectos que no van a comprar y concentra el esfuerzo en los que encajan con el cliente ideal.

- El equipo segmenta los leads por los atributos del cliente ideal antes de trabajarlos: en empresas, tamaño, industria o geografía; en personas, presupuesto, zona o lo que buscan. `[1.6.F1 · comprobable · venta con equipo]`
- Hay criterios escritos para aceptar un lead como SQL y se aplican de forma consistente. `[1.6.F2 · comprobable · hábito · venta con equipo]`
- El esfuerzo se enfoca en los leads que encajan con el ICP (definido en Propuesta y Coherencia). `[1.6.F3 · evaluado · hábito · venta con equipo]`
- La documentación de ICP se usa en la arquitectura de CRM y en los formularios. `[1.6.F4 · comprobable · venta con equipo]`

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
- Los clientes que ya deberían haber vuelto a comprar se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos. `[1.7.F5 · comprobable · hábito · recompra]`

**Eficiente.** Hay contacto multicanal y los leads llegan nutridos desde Marketing.

*Resultado:* Los negocios avanzan con un esfuerzo coordinado entre Marketing y Ventas, y el vendedor tiene a mano el material que cada etapa necesita.

- El contacto multicanal está definido —correo, llamada, canal conversacional y redes— y orquestado en cadencias. `[1.7.E1 · comprobable]`
- Los leads no maduros llegan nutridos desde Marketing por el handoff acordado. `[1.7.E2 · comprobable · venta con equipo]`
- Los materiales de venta viven en una biblioteca central. `[1.7.E3 · declarado · venta con equipo]`

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
- Si una venta ganada puede caerse antes de la entrega —una reserva que se desiste, una matrícula que no llega a clases, un pedido que se cancela—, cada caída deja registrada su razón, igual que una pérdida. `[1.8.F4 · comprobable]`

**Eficiente.** Hay análisis estructurado de ganadas y perdidas, y capacitación comercial formal.

*Resultado:* Los mismos errores dejan de repetirse: lo que se aprende de cada pérdida vuelve al proceso y a la capacitación del equipo.

- Se revisan periódicamente los deals perdidos para identificar patrones. `[1.8.E1 · declarado · hábito]`
- El proceso o playbook se refina con base en lo aprendido. `[1.8.E2 · declarado · hábito]`
- Hay capacitación comercial recurrente y formal para el equipo. `[1.8.E3 · declarado · hábito · venta con equipo]`

**Óptimo.** Las llamadas se analizan solas y la IA sugiere correcciones al playbook.

*Resultado:* El equipo mejora en cada llamada: el análisis automático señala qué funciona y qué corregir, y la estrategia se ajusta con esa evidencia.

- Las llamadas se analizan automáticamente con coaching basado en patrones. `[1.8.O1 · comprobable · venta con equipo]`
- La IA detecta desviaciones del playbook y sugiere correcciones. `[1.8.O2 · comprobable · venta con equipo]`
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

*Resultado:* Las campañas siguen saliendo aunque cambie una persona, porque el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada una sin tener que preguntar.

- Existe un calendario editorial visible para el equipo con horizonte de al menos un trimestre. `[2.1.F1 · declarado]`
- Existe un proceso de campaña documentado (briefing → ejecución → cierre) que el equipo aplica de forma consistente. `[2.1.F2 · evaluado · hábito]`
- Hay una reunión de performance con cadencia fija (semanal o quincenal) que se sostiene. `[2.1.F3 · declarado · hábito]`
- El líder puede explicar qué campañas corren y en qué etapa sin preguntarle al equipo. `[2.1.F4 · evaluado]`
- El equipo interno gestiona el grueso del trabajo; las agencias son apoyo puntual. `[2.1.F5 · declarado]`

**Eficiente.** Los procesos incorporan ciclos cortos de prueba y ajuste, y control de calidad.

*Resultado:* Cada pieza sale revisada, y el equipo prueba y ajusta como parte de su rutina en vez de publicar y olvidar.

- Hay ciclos regulares de testing y ajuste incorporados a la rutina. `[2.1.E1 · declarado · hábito]`
- Existe un proceso de aprobación de contenido antes de publicar (versionado, QA). `[2.1.E2 · declarado]`
- Hay retroalimentación permanente entre planificación y ejecución. `[2.1.E3 · evaluado · hábito]`

**Óptimo.** La IA ajusta los flujos de trabajo y el equipo queda libre de tareas repetitivas.

*Resultado:* El equipo dedica su tiempo a la estrategia: la IA se encarga de lo repetitivo y los ajustes se hacen sobre la marcha, sin depender de agencias.

- Los flujos de trabajo se ajustan con apoyo de IA, sin tareas manuales repetitivas. `[2.1.O1 · comprobable]`
- El monitoreo es en tiempo real con ajustes automáticos. `[2.1.O2 · comprobable]`
- La dependencia externa es muy baja. `[2.1.O3 · declarado]`

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

**Funcional.** El stack contratado se usa de verdad y hay automatización simple en producción.

*Resultado:* Todo lo que entra por el sitio y por el canal conversacional, como WhatsApp, llega al sistema y recibe respuesta, y el equipo lanza sus propios envíos sin depender de nadie.

- El equipo usa el sistema operativo central como herramienta principal, no como obligación administrativa. `[2.2.F1 · evaluado · hábito]`
- Los módulos contratados están en uso, sin licencias ociosas relevantes. `[2.2.F2 · comprobable]`
- Los puntos de captura del sitio (forms) están conectados al CRM con datos limpios. `[2.2.F3 · comprobable]`
- Hay al menos un canal conversacional conectado (WhatsApp, chat del sitio) con una bandeja básica donde el equipo atiende lo entrante. `[2.2.F4 · comprobable]`
- Después de enviar un formulario, el sistema responde automáticamente y notifica a quien corresponde. `[2.2.F5 · comprobable]`
- El equipo puede mandar un email a un segmento sin pedir ayuda a IT. `[2.2.F8 · evaluado]`

**Eficiente.** El stack está integrado y la automatización tiene lógica.

*Resultado:* Los leads se nutren solos hasta estar listos para Ventas, y la conversación con cada contacto no depende de que alguien se acuerde de escribirle.

- Hay secuencias de nurturing multi-paso con ramificación y tiempos de espera. `[2.2.E1 · comprobable]`
- Las campañas por el canal conversacional, como WhatsApp, están automatizadas, con segmentación y con ramificación según la interacción: si la persona leyó, hizo clic o respondió. `[2.2.E2 · comprobable]`
- El handoff de leads a Ventas está automatizado. `[2.2.E3 · comprobable · venta con equipo]`
- Varios canales conversacionales se consolidan en una bandeja unificada. `[2.2.E4 · comprobable]`
- Las landing pages viven en el CMS central. `[2.2.E5 · comprobable]`

**Óptimo.** La IA orquesta el recorrido completo y conversa con el cliente de forma automatizada.

*Resultado:* Cada contacto vive un recorrido pensado para él: la IA decide el siguiente paso y conversa en el momento, con información que se calcula en toda la empresa.

- La IA predictiva y generativa orquesta el recorrido completo. `[2.2.O1 · comprobable]`
- Agentes de IA atienden el canal conversacional: responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para Ventas. `[2.2.O2 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a las herramientas de marketing: la segmentación usa, por ejemplo, el valor real de cada cliente calculado afuera. `[2.2.O3 · comprobable]`

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

*Resultado:* El líder sabe de dónde vienen los leads y cuáles terminan en venta, con reportes que salen del sistema y no de una planilla armada a mano.

- Todo contacto nuevo —entre por un formulario, una conversación, un portal o una compra— tiene poblados la etapa del ciclo de vida y su origen. `[2.3.F1 · comprobable]`
- Las propiedades que describen al cliente ideal —en empresas, industria, empresa y rol; en personas, lo que define a cada segmento— están en los formularios críticos y se capturan en la mayoría de los registros. `[2.3.F2 · comprobable]`
- Los duplicados están bajo control, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3 · comprobable · riesgo]`
- Cualquier deal ganado tiene rastreable el origen del contacto. `[2.3.F4 · comprobable]`
- Los reportes básicos (volumen, conversión, fuente) salen del sistema sin reconstrucción manual. `[2.3.F5 · comprobable]`
- El contexto que el área documentó —buyer personas, segmentos, voz de marca— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6 · declarado · riesgo · hábito]`
- Cuando se pide un teléfono u otro dato de contacto, se pregunta si la persona acepta que le escriban por ese canal, y su respuesta queda registrada. `[2.3.F7 · comprobable · riesgo]`

**Eficiente.** Los datos están unificados, enriquecidos y atribuidos.

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta, no solo cuál trajo el primer clic.

- Hay enriquecimiento de datos activo con servicios de terceros. `[2.3.E1 · comprobable]`
- La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último, e incluye todos los canales, también el conversacional: se sabe cuánto ingreso deja cada uno. `[2.3.E2 · comprobable]`
- La segmentación usa datos de comportamiento; la deduplicación es automática por reglas. `[2.3.E3 · comprobable]`

**Óptimo.** Los datos entran de forma continua, limpios y trazados de punta a punta.

*Resultado:* La atribución toma en cuenta todo lo que pasa en la empresa, no solo lo que ve Marketing, y los datos se mantienen confiables sin que el equipo tenga que cuidarlos.

- Marketing se apoya en el almacén central de datos de la empresa, donde se junta la información de todas las herramientas, y atribuye resultados con esa vista completa. `[2.3.O1 · comprobable]`
- Los datos están limpios y trazados de punta a punta. `[2.3.O2 · comprobable]`
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

*Resultado:* El equipo sabe qué se espera de cada uno, y las decisiones de presupuesto se defienden con números, no con opiniones.

- Cada persona del equipo tiene rol definido por escrito. `[2.4.F1 · declarado]`
- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (volumen de leads, tasa de MQL, fuente, conversión) y lo consulta al menos semanalmente. `[2.4.F2 · evaluado · hábito]`
- Hay metas mensuales o trimestrales por las que el equipo rinde cuentas en cadencia fija. `[2.4.F3 · evaluado · hábito]`
- Las decisiones de presupuesto o priorización citan datos del sistema, no opiniones. `[2.4.F4 · evaluado]`
- Cualquier persona del equipo opera el sistema sin ayuda externa para tareas estándar. `[2.4.F5 · evaluado]`

**Eficiente.** El equipo tiene autonomía y el líder orquesta con otras áreas.

*Resultado:* Una persona nueva se integra rápido, y Marketing y Ventas trabajan con reglas acordadas en vez de reclamarse los leads.

- La rendición de cuentas es explícita y la cultura se basa en datos. `[2.4.E1 · evaluado · hábito]`
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria. `[2.4.E2 · declarado]`
- El liderazgo orquesta con Ventas (handoff de leads, SLAs, cadencia conjunta) y con Servicio. `[2.4.E3 · declarado · hábito]`
- El equipo da retroalimentación sobre el sistema y pide que evolucione. `[2.4.E4 · evaluado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar los datos, y la gobernanza de datos e IA es parte de las decisiones.

*Resultado:* La dirección sabe cuánto cuesta conseguir cada cliente por canal y decide dónde invertir con esa cuenta, con un equipo capaz de sostener la IA.

- Hay responsables definidos de validar lo que produce la IA y de mantener la calidad de los datos. `[2.4.O1 · declarado]`
- El liderazgo se enfoca en estrategia y en mejorar el sistema. `[2.4.O2 · evaluado · hábito]`
- La gobernanza de datos e IA es parte del marco de decisión. `[2.4.O3 · declarado · hábito]`
- Las decisiones usan analítica avanzada, como el costo de adquisición de cliente por canal. `[2.4.O4 · evaluado · hábito]`

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
- El contenido se produce y optimiza con IA de forma continua. `[2.5.O2 · comprobable]`
- El SEO y el AEO están optimizados para búsqueda conversacional y entornos generativos. `[2.5.O3 · comprobable]`

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
- El equipo puede seleccionar un segmento y enviarle un email distinto del resto. `[2.6.F2 · comprobable]`
- Las campañas recientes muestran piezas distintas por segmento. `[2.6.F3 · comprobable · hábito]`
- Existen criterios documentados de qué es un suscriptor, lead, MQL y SQL, y marketing clasifica hasta MQL según ellos, a mano o con una automatización simple sobre las propiedades de calificación. `[2.6.F4 · comprobable · venta con equipo]`

**Eficiente.** La segmentación y el scoring se automatizan.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y Ventas recibe primero los leads con más probabilidad de comprar.

- Hay secuencias diferenciadas por segmento o etapa del journey. `[2.6.E1 · comprobable]`
- El contenido se adapta por segmento de forma automática. `[2.6.E2 · comprobable]`
- Hay lead scoring por reglas: un modelo que suma puntos por varios atributos y califica al pasar un umbral, cuyo score dispara las secuencias de nurturing. Se distingue de la calificación de Funcional, que responde a un valor de propiedad sin modelo de puntaje detrás. `[2.6.E3 · comprobable]`

**Óptimo.** La IA identifica micro-segmentos y el contenido cambia según el comportamiento de cada persona.

*Resultado:* Cada persona ve el contenido que le corresponde según lo que hizo antes, sin que nadie tenga que armar un segmento para ella.

- La IA identifica micro-segmentos y comportamientos. `[2.6.O1 · comprobable]`
- El contenido cambia en tiempo real según el comportamiento histórico. `[2.6.O2 · comprobable]`
- Hay personalización uno a uno, también en el sitio web. `[2.6.O3 · comprobable]`

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
- El canal conversacional, como WhatsApp, se usa para salir con cadencia definida, no solo para responder lo que entra. `[2.7.F4 · comprobable · hábito]`
- Los cuatro canales siguen el mismo calendario y la misma campaña: una promoción sale coordinada en email, pauta, orgánico y el canal conversacional, no como cuatro esfuerzos sueltos. `[2.7.F5 · declarado · hábito]`
- El líder puede decir cuánto costó cada lead —o cada venta, donde se compra sin vendedor— el último mes, al menos por canal. `[2.7.F6 · comprobable]`

**Eficiente.** Los canales se integran con datos y el presupuesto se mueve con evidencia.

*Resultado:* La inversión se mueve hacia el canal que mejor rinde, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Los canales, incluido el conversacional, comparten datos y se alimentan entre sí: uno continúa lo que empezó otro, hay remarketing activo y las audiencias se construyen desde el CRM. `[2.7.E1 · comprobable]`
- Hay webinars o eventos como canal recurrente. `[2.7.E2 · declarado · hábito]`
- Los presupuestos se optimizan con frecuencia según data. `[2.7.E3 · comprobable · hábito]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar, y cada referido queda registrado con quién lo trajo. `[2.7.E4 · comprobable]`

**Óptimo.** La IA reasigna presupuesto entre canales y se prueban canales emergentes en ciclos cortos.

*Resultado:* La inversión se reparte sola donde más retorna, los clientes satisfechos traen clientes nuevos, y la empresa llega antes que su competencia a los canales nuevos.

- Se exploran canales emergentes (influencers, búsqueda conversacional, asistentes de IA). `[2.7.O1 · declarado · hábito]`
- La IA reasigna presupuestos automáticamente para maximizar ROI. `[2.7.O2 · comprobable]`
- Los canales nuevos se prueban en ciclos cortos. `[2.7.O3 · declarado · hábito]`
- Los clientes que Servicio identifica como promotores se vuelven un canal de referidos y casos de éxito, sin pedirlos a mano. `[2.7.O4 · comprobable]`

#### 2.8 Medición y Aprendizaje

¿Cada campaña enseña algo, o se repite el ciclo desde cero?

*Descripción:* Mide si cada campaña se mide y deja un aprendizaje, para no repetir lo que no funcionó.

*Costo de quedarse:* Repites lo que no funciona porque nadie mide qué funcionó: el presupuesto se reparte por costumbre, no por retorno.

**Deficiente.** Las campañas corren hasta agotar presupuesto, sin aprendizaje ni medición de ROI.

- Las campañas se dejan correr hasta que se acaba el presupuesto, sin revisarlas en el camino. `[2.8.D1 · evaluado]`
- No se mide el retorno de las campañas. `[2.8.D2 · comprobable]`
- Lo que dejó una campaña no se usa para planear la siguiente. `[2.8.D3 · evaluado]`

**Inicial.** Se analiza solo al cerrar la campaña, tarde.

- Las métricas son básicas (clics, likes) sin conexión clara con el CAC. `[2.8.I1 · comprobable]`
- La optimización es lenta y reactiva. `[2.8.I2 · evaluado]`

**Funcional.** Hay reporting descriptivo vivo y revisión post-campaña.

*Resultado:* La dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo, y cada campaña deja una lección escrita para la siguiente.

- Hay un dashboard de marketing con indicadores descriptivos clave que se actualiza solo. `[2.8.F1 · comprobable]`
- El líder envía un reporte mensual a liderazgo con cadencia fija. `[2.8.F2 · declarado · hábito]`
- Cada campaña significativa tiene una revisión de cierre documentada (qué funcionó, qué no). `[2.8.F3 · declarado]`
- El equipo puede señalar qué aprende de una campaña a la siguiente. `[2.8.F4 · evaluado]`

**Eficiente.** Hay testing regular y ajustes basados en data.

*Resultado:* El equipo sabe qué creatividades y audiencias funcionan porque lo probó, no porque lo intuye.

- Hay tests A/B regulares (al menos uno activo por mes). `[2.8.E1 · comprobable · hábito]`
- Hay un proceso formal para validar qué creatividades y audiencias funcionan con métricas históricas. `[2.8.E2 · declarado]`

**Óptimo.** Modelos de predicción ajustan las campañas sobre la marcha, sin esperar al cierre.

*Resultado:* Las campañas mejoran mientras están corriendo, no recién cuando terminan.

- Todas las campañas se monitorean en tiempo real. `[2.8.O1 · comprobable]`
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

**Funcional.** Hay un pipeline de servicio configurado y gestión básica de cartera.

*Resultado:* Cada cliente tiene a alguien que responde por él, y un caso se atiende igual sin importar qué agente lo tome.

- El pipeline de servicio cubre el flujo de atención de recepción a cierre. `[3.1.F1 · comprobable]`
- Cada cliente tiene quién responda por él —una persona o, si la cartera es masiva, un equipo con un seguimiento automático— y un seguimiento mínimo más allá de los tickets que abre. `[3.1.F2 · comprobable]`
- Hay reuniones de equipo de Servicio con cadencia fija (al menos quincenal) que se sostienen. `[3.1.F3 · declarado · hábito]`
- Existe un proceso básico documentado para quejas críticas o escalaciones. `[3.1.F4 · declarado]`
- Cualquier agente explica cómo se atiende un caso típico siguiendo el mismo flujo. `[3.1.F5 · evaluado]`

**Eficiente.** Aparecen SLAs, reglas de escalación y prevención.

*Resultado:* El cliente sabe cuánto va a tardar la respuesta y se cumple, los casos críticos llegan solos a quien los tiene que resolver, y cada momento clave de su relación con la empresa tiene un dueño.

- Hay SLAs definidos por tipo de caso o prioridad. `[3.1.E1 · comprobable]`
- Las reglas de escalación están configuradas como automatización (cuándo y a quién). `[3.1.E2 · comprobable]`
- Hay playbooks de prevención, retención y expansión. `[3.1.E3 · declarado · cliente recurrente]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —el traspaso desde Ventas, el inicio, la entrega o el primer valor y, si la hay, la renovación o la recompra— y un responsable y un estándar para cada uno. `[3.1.E4 · declarado]`

**Óptimo.** Las rutinas corren automáticas y el equipo supervisa, entrena la IA y gestiona excepciones.

*Resultado:* El equipo deja de ejecutar rutinas y pasa a supervisarlas: la IA hace lo repetitivo, y las personas se ocupan de las excepciones y de mejorar el sistema.

- Muchas rutinas son automáticas; el equipo supervisa, entrena la IA y gestiona excepciones. `[3.1.O1 · evaluado · hábito]`
- Las rutinas incluyen refinar la base de conocimiento. `[3.1.O2 · declarado · hábito]`

#### 3.2 Tecnología y Automatización

¿Qué parte de los tickets necesita intervención humana cuando podría resolverse con autoservicio o automatización, y cuánto del stack se está aprovechando?

*Descripción:* Mide cuántos casos se resuelven solos o por autoservicio, y cuánto del sistema de atención se aprovecha.

*Costo de quedarse:* Tu equipo resuelve a mano lo que podría resolverse solo, y los casos se pierden entre correos y chats: el cliente tiene que insistir para que lo atiendan.

**Deficiente.** Herramientas básicas y aisladas (correo, teléfono).

- No hay plataforma central de tickets. `[3.2.D1 · declarado]`
- Los casos se manejan en celulares personales o emails individuales. `[3.2.D2 · evaluado]`

**Inicial.** Plataforma de tickets activa pero con baja adopción.

- Unos agentes la usan, otros siguen con sus canales personales. `[3.2.I1 · evaluado]`
- Hay automatizaciones simples de recepción, sin IA; el stack está fragmentado. `[3.2.I2 · comprobable]`

**Funcional.** El sistema central se usa de verdad y ofrece vista unificada del cliente.

*Resultado:* Ningún caso se pierde entre canales, y el agente atiende sabiendo quién es el cliente y qué tiene contratado.

- El sistema central es la herramienta principal, no algo que se llena después de resolver por otro canal. `[3.2.F1 · evaluado · hábito]`
- Al abrir un cliente, el agente ve su relación completa —lo que compró o tiene contratado, lo que ha pagado y el soporte abierto—, no solo el ticket puntual. `[3.2.F2 · comprobable]`
- Hay pipelines de servicio configurados con etapas y prioridades. `[3.2.F3 · comprobable]`
- Hay al menos un canal conversacional conectado con bandeja básica donde el equipo atiende lo entrante. `[3.2.F4 · comprobable]`
- Al entrar un ticket, el sistema lo asigna automáticamente según una regla simple; las notificaciones de cambio de estado llegan a quien las necesita. `[3.2.F5 · comprobable]`
- Si hay chatbot, resuelve consultas frecuentes con árbol de decisión. `[3.2.F6 · comprobable]`

**Eficiente.** La automatización tiene lógica y aparece el autoservicio.

*Resultado:* Los plazos se vigilan solos, y el cliente puede ver y abrir sus casos y resolver lo simple sin esperar a un agente.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática—, y las conversaciones y los tickets se enrutan por múltiples condiciones, como idioma, tema o habilidad del agente. `[3.2.E1 · comprobable]`
- Hay portal de autoservicio donde el cliente ve y crea tickets, y base de conocimiento interna y pública. `[3.2.E2 · comprobable]`
- Los canales se consolidan en una bandeja unificada; el agente de servicio con IA está en exploración. `[3.2.E3 · comprobable]`

**Óptimo.** Un agente de IA resuelve consultas en producción y los agentes humanos trabajan con asistentes de IA.

*Resultado:* Una parte importante de las consultas se resuelve sin intervención humana, y los agentes trabajan asistidos por IA en las que sí la necesitan.

- Hay un agente de servicio con IA en producción que resuelve consultas en todos los canales sin intervención humana y pasa a una persona, con el contexto completo, cuando hace falta; hay automatización de flujos de trabajo. `[3.2.O1 · comprobable]`
- Hay asistentes de IA que apoyan a los agentes humanos. `[3.2.O2 · comprobable]`
- Hay IA generativa para contenido de ayuda y analytics en tiempo real. `[3.2.O3 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: el agente ve en la ficha, por ejemplo, el riesgo de fuga del cliente. `[3.2.O4 · comprobable]`

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
- La ficha del cliente muestra lo que compró o tiene contratado y su valor económico, no solo sus tickets. `[3.3.F2 · comprobable]`
- Las propiedades clave del cliente —qué compró o qué plan tiene, desde cuándo es cliente y quién responde por él— están pobladas en la mayoría de los registros. `[3.3.F3 · comprobable]`
- Cada ticket tiene tipo, motivo y prioridad con taxonomía definida. `[3.3.F4 · comprobable]`
- El líder saca reportes de volumen por tipo de ticket sin reconstrucción. `[3.3.F5 · comprobable]`
- El contexto que el área documentó —tipos de cliente, niveles de atención, respuestas a consultas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6 · declarado · riesgo · hábito]`

**Eficiente.** Se miden tiempos y satisfacción, y la data se unifica con Ventas.

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende, cuánto tarda un cliente nuevo en ver valor y qué tan sano está cada cliente, con la satisfacción medida y no supuesta.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los SLA, en todos los canales. `[3.3.E1 · comprobable]`
- Se trackean NPS o CSAT con cadencia. `[3.3.E2 · comprobable · hábito]`
- La data del cliente está unificada entre Servicio y Ventas; se usan los históricos para identificar patrones. `[3.3.E3 · comprobable]`
- Se mide cuánto tarda cada cliente nuevo en obtener valor: el tiempo desde que empieza hasta su primer resultado. `[3.3.E4 · comprobable]`
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
- El líder tiene un dashboard descriptivo con 4 a 6 métricas clave (tickets abiertos, volumen, backlog, tickets por tipo) y lo consulta al menos semanalmente. `[3.4.F2 · evaluado · hábito]`
- Hay reuniones de equipo en cadencia formal (las mismas de Procesos y Rutinas), usadas para rendir cuentas. `[3.4.F3 · evaluado · hábito]`

**Eficiente.** El equipo tiene autonomía, cultura preventiva y orquesta con otras áreas.

*Resultado:* Un agente nuevo rinde rápido, el equipo se adelanta en vez de apagar incendios, y Servicio avisa a Ventas cuando hay riesgo u oportunidad.

- Hay rendición de cuentas explícita contra SLA. `[3.4.E1 · evaluado · hábito]`
- Cuando entra alguien nuevo al equipo, hay un plan de onboarding con sus pasos y materiales; no se le entrena de memoria. `[3.4.E2 · declarado]`
- La cultura es preventiva: contactar al cliente antes de que pida ayuda. `[3.4.E3 · evaluado · hábito]`
- El liderazgo orquesta con Ventas —cada cliente nuevo llega con el resultado que persigue, y las alertas de churn vuelven a Ventas— y con Marketing. `[3.4.E4 · declarado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y el servicio se mide por los ingresos que retiene y hace crecer.

*Resultado:* Servicio se mide por los ingresos que retiene y hace crecer, no solo por los casos que cierra.

- Hay responsables definidos de validar lo que responde la IA y de mantener la base de conocimiento al día. `[3.4.O1 · declarado]`
- El liderazgo se enfoca en estrategia. `[3.4.O2 · evaluado · hábito]`
- El equipo de servicio se mide por la retención y el crecimiento de sus clientes, no solo por los casos que cierra. `[3.4.O3 · declarado · hábito · cliente recurrente]`
- Las decisiones usan analítica avanzada, como la retención neta de ingresos. `[3.4.O4 · evaluado · hábito]`

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

**Óptimo.** La IA aplica el tono de marca en las interacciones automatizadas y lo adapta al contexto.

*Resultado:* La experiencia se siente igual de cuidada con una persona o con la IA, y se ajusta a cada cliente.

- La IA aplica tono de marca consistente en interacciones automatizadas. `[3.5.O1 · comprobable]`
- El tono se personaliza según el contexto del cliente. `[3.5.O2 · comprobable]`

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
- La atención se diferencia según los tipos de cliente definidos en Consistencia de Atención: cada tipo tiene claro qué nivel de atención recibe. `[3.6.F2 · declarado]`
- El agente usa la vista unificada del cliente —lo que compró, lo que ha pagado y el soporte abierto— para dar contexto, sin reconstruirlo a mano. `[3.6.F3 · evaluado · hábito]`

**Eficiente.** Hay un responsable por cliente clave y segmentación para acciones diferenciadas.

*Resultado:* Cada cliente clave tiene un dueño que lo conoce, el resto de la cartera no queda sola, y la atención cambia según el momento en que está cada cliente.

- Hay un modelo de atención por segmento: cada cliente clave tiene un CSM o responsable asignado, y el resto de la cartera recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1 · comprobable · cliente recurrente]`
- Los clientes se segmentan para acciones diferenciadas según el momento de su relación: donde el cliente vuelve, sanos, en riesgo o con potencial de crecer; donde compra una vez, por entregar, en garantía o listos para recomendar. `[3.6.E2 · comprobable]`
- El contexto del cliente se usa activamente para personalizar respuestas. `[3.6.E3 · evaluado · hábito]`

**Óptimo.** El cliente recibe el mismo contexto lo atienda un humano o la IA, incluso en autoservicio.

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló con Ventas.

- La personalización se aplica incluso en autoservicio. `[3.6.O1 · comprobable]`
- Hay personalización uno a uno en tiempo real. `[3.6.O2 · comprobable]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le prometió en la venta y el segmento del que viene—, sin volver a preguntarlo. `[3.6.O3 · comprobable]`

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

- Hay alertas tempranas de churn, baja salud u oportunidad de upsell. `[3.7.E1 · comprobable · cliente recurrente]`
- Los clientes en riesgo reciben una acción de retención antes de decidir irse, y los que tienen potencial reciben una propuesta de expansión. `[3.7.E2 · comprobable · hábito · cliente recurrente]`
- Los clientes clave tienen registrado el resultado que persiguen y lo revisan con la empresa en una cadencia fija: qué se logró y qué sigue. `[3.7.E3 · declarado · hábito · relación continua]`
- Ninguna solicitud o molestia del cliente se pierde entre áreas: quedan en el sistema aunque las resuelva otra área —administración, cobros, entregas—, y hay alertas automáticas cuando una se atrasa, cuando un cliente califica mal o cuando se acerca una fecha crítica —una entrega, una garantía, un vencimiento—, que le llegan a quien tiene que actuar. `[3.7.E4 · comprobable]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —una entrega, un trámite, un vencimiento—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5 · comprobable]`

**Óptimo.** Los problemas se resuelven antes de que el cliente los note, con acciones que la IA ajusta, y el cliente recibe detalles que lo deleitan.

*Resultado:* La mayoría de los problemas se resuelven antes de que el cliente los note, y cada cliente siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- La comunicación proactiva se adapta a cada cliente —qué recibe, cuándo y por qué canal— según su historia y sus señales; y donde la relación es continua, las revisiones de resultado llegan a todos: a los clave en persona y al resto de forma automatizada, con los datos que prepara el sistema. `[3.7.O1 · declarado · hábito]`
- Muchos problemas se resuelven antes de que el cliente los note. `[3.7.O2 · comprobable · hábito]`
- La distribución de acciones proactivas se autoajusta por IA según señales del cliente. `[3.7.O3 · comprobable]`
- Los clientes reciben, sin pedirlos, detalles pensados para deleitarlos —regalías, promociones, beneficios o amenidades—, elegidos según su historia y el momento de su relación. `[3.7.O4 · comprobable]`

#### 3.8 Escalabilidad del Servicio

¿La operación escala linealmente o exponencialmente?

*Descripción:* Mide si atender más clientes cuesta menos cada vez, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Cada cliente nuevo cuesta lo mismo de atender que el anterior: para crecer, tienes que contratar al mismo ritmo.

**Deficiente.** El servicio depende 100% de agentes humanos.

- No hay autoservicio ni base de conocimiento pública. `[3.8.D1 · comprobable]`
- El costo crece linealmente con cada cliente nuevo. `[3.8.D2 · declarado]`

**Inicial.** FAQs básicas o portal simple sin actualizar.

- Hay chatbots de menú fijo rígidos. `[3.8.I1 · comprobable]`
- El conocimiento existe pero está disperso; escalar exige mucho esfuerzo manual. `[3.8.I2 · evaluado]`

**Funcional.** Las consultas más frecuentes tienen respuesta publicada y al día.

*Resultado:* Las preguntas de siempre dejan de consumir al equipo: el cliente encuentra la respuesta publicada y el agente no la vuelve a escribir.

- Las consultas que más se repiten tienen una respuesta que el cliente puede consultar por su cuenta, y se mantiene al día. `[3.8.F1 · comprobable]`
- Cuando entra una consulta que ya tiene respuesta publicada, el equipo remite a ella en vez de volver a redactarla. `[3.8.F2 · comprobable · hábito]`

**Eficiente.** Se documenta el aprendizaje y el autoservicio empieza a liberar al equipo.

*Resultado:* La empresa puede sumar clientes sin sumar agentes en la misma proporción, porque buena parte se resuelve sola.

- Se documentan las soluciones a casos nuevos (se alimenta la base de conocimiento). `[3.8.E1 · comprobable · hábito]`
- Se revisan periódicamente los tickets recurrentes y las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2 · declarado · hábito]`
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
| `1.3.F5`, `1.3.F6`, `1.3.F7`, `2.3.F6`, `3.3.F6` | El contexto se revisa y actualiza cada trimestre | Lo que la IA sabe de tu negocio puede estar desactualizado: tu contexto no se revisa hace más de un trimestre. |
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
| Calibración | Práctica en la que un CSE puntúa casos de referencia con respuesta conocida, para comprobar que diagnostica igual que los demás. Por ahora es una regla en espera, en el manual de operación. |
| Canal conversacional | Canal donde el cliente conversa con la empresa en tiempo real o casi: la mensajería —en la región, sobre todo WhatsApp— o el chat del sitio. |
| Chatbot | Programa que responde conversaciones de forma automática, desde menús fijos hasta IA. |
| Chequeo | Versión corta del diagnóstico, para prospectos: una o dos preguntas por dimensión, con las que se estima el nivel sin recorrer los criterios. Todo lo que muestra es estimado. |
| Churn | Pérdida de clientes: los que dejan de comprar o cancelan. |
| CMS | Sistema donde se crean y publican las páginas del sitio web. |
| Costo de adquisición | Lo que cuesta en marketing y ventas conseguir un cliente nuevo. |
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
| Lead scoring | Modelo que suma puntos a cada lead según sus datos y su comportamiento, para saber cuáles están más cerca de comprar. |
| LTV | Valor de vida del cliente: cuánto ingreso deja durante toda la relación. |
| Macros y snippets | Respuestas guardadas que un agente inserta con un clic en vez de redactarlas cada vez. |
| Meta tags | Etiquetas del sitio que les dicen a los buscadores de qué trata cada página. |
| MQL | Lead calificado por Marketing: cumple los criterios que Marketing definió para pasarlo a Ventas. |
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
| Retención neta de ingresos | De lo que pagaban los clientes actuales hace un tiempo, cuánto pagan hoy, sumando ampliaciones y restando cancelaciones. |
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

La matriz de la Parte 3 es la escala general, escrita para cualquier empresa. Una tienda, una inmobiliaria o una universidad se reconocen mejor en una escala que habla de lo suyo: por eso cada edición les pone a las dimensiones de producción el nombre que tienen en esa industria, hace las preguntas y dice los costos con sus palabras, y suma los criterios que solo tienen sentido ahí.

## Qué cambia una edición y qué no

- **Lo que no cambia.** Las áreas, las dimensiones y sus identificadores; los cinco niveles; las marcas de cada criterio; las reglas de la Parte 2 y el cálculo de la especificación. Las dimensiones de base operativa conservan su nombre, que es el mismo en las tres áreas.
- **Decir lo mismo con otras palabras.** Una edición puede reescribir un criterio de la matriz. El criterio conserva su identificador y sus marcas, y tiene que medir lo mismo y aplicar a los mismos, con los mismos umbrales: si cambia lo que se pide, no es una reescritura.
- **Criterios propios.** Lo que solo tiene sentido en la industria entra como un criterio propio de la edición. Lleva un identificador del bloque de su edición —del 101 al 199 en la primera, del 201 al 299 en la segunda—, para que no se cruce con la numeración de la matriz ni con la de otra edición.
- **Criterios que no aplican.** Una edición puede decir que un criterio de la matriz no aplica a su industria. Sale de la cuenta, igual que uno que no corresponde al perfil de negocio. Lo que no puede hacer es sacar una dimensión entera.
- **Todo criterio queda decidido.** Si una edición toca los criterios de una dimensión, dice algo de todos los de la matriz: lo reescribe, lo saca o lo deja como está. Así, cuando la matriz suma un criterio, cada edición tiene que decidir qué hace con él.
- **Lo que una edición no dice, vale como está en la matriz.** Una dimensión de la que la edición solo cambia el nombre, la pregunta o el costo se sigue midiendo con los criterios generales, y la tabla de palabras de la edición dice cómo se llama cada cosa en la industria.

## Cómo se mide con una edición

Una unidad se mide con la escala general o con una sola edición, la de su industria. El perfil de negocio sigue decidiendo qué criterios aplican dentro de la edición. El avance se compara entre mediciones hechas con la misma edición: si una unidad pasa de la escala general a una edición, o de una edición a otra, esa medición es una línea base nueva.

Una edición puede darle criterios a una dimensión que en la escala general no aplica a un perfil. Pasa en la de ecommerce y retail: en la venta transaccional, la dimensión de personalización de Ventas no aplica en la escala general, y en la edición mide la oferta que la tienda le hace a cada comprador.

## Cómo se escribe una edición

Igual que la matriz, y solo lo que cambia. Abre con para quién es, su clave —que no cambia aunque la edición cambie de nombre—, su perfil habitual y desde qué número van sus criterios propios. Siguen la tabla de palabras y, después, cada área y cada dimensión que cambia. Un criterio reescrito lleva en la etiqueta solo su identificador; uno propio lleva la etiqueta completa. Al final de cada dimensión van los criterios de la matriz que no aplican y los que se leen igual.

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
| Renovación | La próxima compra |

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

- El recorrido de un pedido —carrito, pago, preparación y entrega— está configurado con sus etapas, y cualquiera del equipo lo explica igual. `[1.1.F1]`
- Cada canal de venta —tienda en línea, tienda física o marketplace— registra sus pedidos con ese mismo recorrido. `[1.1.F2]`
- La revisión de ventas corre en cadencia formal, semanal o quincenal. `[1.1.F5]`
- La operación de la tienda está documentada: cómo se publica un producto, cómo se cambia un precio y cómo se arma una promoción. `[1.1.F101 · declarado]`
- Hay un calendario comercial —temporadas, promociones y lanzamientos— con al menos un trimestre de horizonte, y se cumple la mayoría del tiempo. `[1.1.F102 · declarado · hábito]`

**Eficiente.** La operación deja de ser una lista de pasos y se vuelve un método que se mide.

*Resultado:* Las promociones se planifican con un objetivo y se revisan al cerrar, y la operación de la tienda mejora ciclo a ciclo en vez de repetirse igual.

- Cada promoción sale con un objetivo escrito y se revisa al cerrar: qué vendió, a quién y qué margen dejó. `[1.1.E101 · declarado · hábito]`
- Hay una lista de revisión antes de publicar un producto o una promoción, y se usa. `[1.1.E102 · evaluado · hábito]`

**Óptimo.** El sistema vigila la operación y señala lo que se sale de lo normal; el equipo decide los ajustes.

- El sistema detecta lo que se sale de lo normal —una caída de la conversión, un producto sin existencias, un precio distinto entre canales— y avisa a quien tiene que actuar. `[1.1.O1]`

*No aplican:* `1.1.D2`, `1.1.I2`, `1.1.F4`.

*Se leen igual:* `1.1.D3`, `1.1.F3`, `1.1.F6`, `1.1.E1`, `1.1.E2`, `1.1.E3`, `1.1.E4`, `1.1.O2`, `1.1.O3`.

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

- Hay secuencias de varios pasos que cambian según lo que hace el comprador —si abrió, hizo clic o compró—, y las conversaciones se asignan por múltiples condiciones, con control de quién ve y responde cada una. `[1.2.E2]`
- La tienda está integrada con el sistema de inventario y de facturación. `[1.2.E3]`

**Óptimo.** Agentes de IA atienden y venden en el canal conversacional, y la tienda se ajusta sola con lo que aprende de cada compra.

*Resultado:* La tienda vende a toda hora sin que el equipo tenga que estar: los agentes responden y cierran las compras simples, y el sistema ajusta lo que muestra con lo que aprende.

- Hay predicción de compra por cliente y sugerencias de la siguiente mejor oferta. `[1.2.O1]`
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
- Se sostiene la cadencia de revisión (la misma revisión de ventas) y en ella se rinde cuentas. `[1.4.F3]`
- Cada canal de venta tiene una meta clara y un responsable, y su avance se reporta en cadencia fija. `[1.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva opera la tienda más rápido, y el líder se entera de los riesgos por una alerta y no al cierre del mes.

- Las ventas de cada canal se monitorean con alertas automáticas: una caída, un producto sin existencias o una meta en riesgo. `[1.4.E1]`

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
- Cada producto publicado tiene su ficha completa —fotos, descripción, precio y disponibilidad— con una misma estructura. `[1.5.F101 · comprobable]`
- Las condiciones de compra —envío, cambios, devoluciones y garantía— están escritas y a la vista antes de pagar. `[1.5.F102 · comprobable]`

**Eficiente.** La tienda se ordena como compra el cliente y promete solo lo que entrega.

*Resultado:* El comprador reconoce la tienda por algo concreto, encuentra rápido lo que busca y recibe lo que la ficha le prometió.

- El catálogo está organizado como busca el cliente —categorías, filtros y buscador—, y se revisa con los datos de qué se busca y no se encuentra. `[1.5.E101 · comprobable · hábito]`
- Lo que promete la ficha es lo que llega: las devoluciones por «no era lo que esperaba» se miden y se corrige la ficha. `[1.5.E102 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La coherencia se mantiene sola con cualquier tamaño de catálogo: se pueden sumar productos y canales sin que la oferta se desordene.

- La IA mantiene fichas, precios y mensajes coherentes en todos los canales en tiempo real, sin trabajo manual. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.F2`, `1.5.F3`, `1.5.F4`, `1.5.F5`, `1.5.E1`, `1.5.E2`, `1.5.E3`.

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

- Los compradores se separan al menos en nuevos y recurrentes, y cada grupo recibe en la tienda una oferta distinta. `[1.6.F101 · comprobable]`
- Al ver un producto o el carrito, el comprador recibe sugerencias de productos relacionados. `[1.6.F102 · comprobable]`

**Eficiente.** Las ofertas salen de la historia de compra, y los mejores clientes tienen un trato propio.

*Resultado:* Cada comprador ve ofertas que salen de lo que él compra, el valor promedio del pedido sube con la venta cruzada, y los mejores clientes lo notan.

- Las sugerencias y las ofertas salen de la historia de compra de cada cliente: qué compró, cuánto y cada cuánto. `[1.6.E101 · comprobable]`
- Los mejores clientes están identificados y tienen un trato distinto: acceso anticipado, beneficios o atención preferente. `[1.6.E102 · comprobable]`
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
- Después de cada compra, el cliente recibe solo un recordatorio o un incentivo para volver a comprar, y el que dejó de comprar se reconoce a tiempo. `[1.7.F5]`

**Eficiente.** El recordatorio llega cuando toca: cada producto tiene medido su momento de recompra.

*Resultado:* La tienda sabe cuándo le toca volver a cada cliente y se lo recuerda en ese momento, y mide cuánto recupera.

- La recuperación y la recompra están orquestadas en cadencias por varios canales —correo, canal conversacional, notificaciones y anuncios—. `[1.7.E1]`
- Cada producto que se acaba o caduca tiene medido cada cuánto se vuelve a comprar, y el recordatorio sale en ese momento. `[1.7.E101 · comprobable · recompra]`
- Se mide cuántos carritos se recuperan y cuántos clientes vuelven a comprar, y con qué mensaje. `[1.7.E102 · comprobable]`

**Óptimo.** El sistema sabe cuándo le toca volver a cada cliente, y con qué oferta.

*Resultado:* Cada cliente recibe su recordatorio en el momento y por el canal en que más le sirve, sin que nadie lo programe.

- El sistema detecta dónde se traba una compra y responde en el momento: una ayuda, una oferta o el aviso a una persona. `[1.7.O1]`
- El canal y el momento de cada recordatorio se autoajustan según el comportamiento del comprador. `[1.7.O2]`
- La IA calcula cuándo le toca volver a comprar a cada cliente según su propio consumo, y ajusta la oferta. `[1.7.O101 · comprobable · recompra]`

*No aplican:* `1.7.D1`, `1.7.I1`, `1.7.I2`.

*Se leen igual:* `1.7.D4`, `1.7.I3`, `1.7.F3`, `1.7.F4`, `1.7.E2`, `1.7.E3`.

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
- Cada pedido cancelado o devuelto deja registrada su razón. `[1.8.F4]`

**Eficiente.** El embudo se revisa con cadencia y la tienda prueba cambios para mejorarlo.

*Resultado:* Los mismos abandonos dejan de repetirse: lo que se aprende de cada caída vuelve a la tienda como un cambio probado.

- Se revisan periódicamente los abandonos, las cancelaciones y las devoluciones para identificar patrones. `[1.8.E1]`
- La tienda —fichas, precios y pasos del pago— se ajusta con base en lo aprendido. `[1.8.E2]`
- Hay pruebas regulares en la tienda, al menos una activa por mes: una ficha, un precio o un paso del pago. `[1.8.E101 · comprobable · hábito]`

**Óptimo.** La IA detecta dónde se cae la compra y propone el cambio.

*Resultado:* La tienda mejora mientras vende: el sistema señala dónde se cae la compra y qué cambio probar, y la estrategia se ajusta con esa evidencia.

- La IA detecta dónde y por qué se abandona la compra, y propone o aplica el cambio. `[1.8.O101 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.I1`, `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`.

### Área 2 — Marketing

#### 2.1 Procesos y Rutinas

Si mañana se va quien arma las campañas, ¿las promociones y los lanzamientos siguen saliendo igual?

*Descripción:* Mide si las campañas de la tienda salen de un calendario y un proceso compartidos, sin depender de nadie.

*Costo de quedarse:* Cada promoción depende de quien la arma: si esa persona falta, la campaña de la temporada sale tarde o no sale.

#### 2.2 Tecnología y Automatización

¿Cuánto del marketing de la tienda sale solo, y cuánto de las herramientas que pagas se está aprovechando?

*Descripción:* Mide cuánto del marketing de la tienda hacen los flujos automáticos y cuánto se aprovechan las herramientas contratadas.

*Costo de quedarse:* Haces a mano los envíos que podrían salir solos y pagas herramientas que no usas, mientras quien te escribe por WhatsApp espera respuesta.

#### 2.3 Datos

¿Sabes qué canal te trae compradores y cuánto compran, o mueves el presupuesto a ojo?

*Descripción:* Mide si los datos dicen qué canal trae compradores, cuánto compran y si aceptaron que les escribas.

*Costo de quedarse:* No sabes qué canal trae ventas y cuál solo gasta: mueves la pauta a ciegas y le escribes a gente que no te dio permiso.

#### 2.4 Equipo y Gobierno

¿Quién decide qué se promociona, cuánto se invierte y en qué canal, con qué datos y con qué cadencia?

*Descripción:* Mide quién decide qué se promociona y dónde se invierte, con qué datos y con qué cadencia de revisión.

*Costo de quedarse:* Las promociones se deciden por costumbre o por quien insiste más, y nadie puede demostrar si la pauta se paga sola.

#### 2.5 Marca y Presencia

¿Quien busca lo que vendes te encuentra, te reconoce y confía en ti?

*Descripción:* Mide si quien busca lo que vendes encuentra la tienda, la reconoce y confía en ella por sus reseñas.

*Costo de quedarse:* Quien busca lo que vendes encuentra primero a otro, o te encuentra y no ve reseñas que le den confianza para comprar.

#### 2.6 Segmentación

¿Cada cliente recibe campañas según lo que compra, o todos reciben la misma promoción?

*Descripción:* Mide si las campañas se arman según lo que compra cada cliente, o si todos reciben lo mismo.

*Costo de quedarse:* Le mandas la misma promoción a todos: el que ya compró ese producto se cansa, y el que compraría otro nunca se entera.

#### 2.7 Canales y Alcance

¿Llegas a compradores nuevos y a los que ya tienes, con un costo por venta que conoces?

*Descripción:* Mide si los canales traen compradores con cadencia, bajo un mismo plan y con un costo por venta conocido.

*Costo de quedarse:* Tu alcance depende de la última promoción: los canales salen sueltos y no sabes cuánto te cuesta cada venta.

#### 2.8 Medición y Aprendizaje

¿Cada campaña te enseña qué vende, o repites la promoción del año pasado?

*Descripción:* Mide si cada campaña se mide por las ventas que dejó y si deja un aprendizaje para la siguiente.

*Costo de quedarse:* Repites las promociones de siempre sin saber cuáles dejaron margen: el presupuesto se reparte por costumbre, no por retorno.

### Área 3 — Servicio

#### 3.1 Procesos y Rutinas

Si mañana falta quien más sabe de cambios y devoluciones, ¿la atención se mantiene?

*Descripción:* Mide si las consultas, los cambios y las devoluciones siguen un proceso definido, sin depender de quién atiende.

*Costo de quedarse:* Un cambio o una devolución se resuelve distinto según quién atienda: el comprador no sabe a qué atenerse y reclama en público.

#### 3.2 Tecnología y Automatización

¿Cuántas consultas sobre pedidos necesitan a una persona cuando podrían resolverse solas?

*Descripción:* Mide cuántas consultas se resuelven solas o por autoservicio, y si quien atiende ve los pedidos del cliente.

*Costo de quedarse:* Tu equipo contesta a mano «¿dónde está mi pedido?» decenas de veces al día, y las consultas se pierden entre el correo, WhatsApp y las redes.

#### 3.3 Datos

¿Quien atiende ve qué compró el cliente y en qué va su pedido, o tiene que preguntárselo?

*Descripción:* Mide si quien atiende ve al instante las compras, los pedidos en curso y los casos anteriores del cliente.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que dar su número de pedido y volver a explicar todo, porque nadie ve su historia.

#### 3.4 Equipo y Gobierno

¿Quién decide qué se atiende primero y cómo se mejora la posventa, y con qué información?

*Descripción:* Mide quién decide qué se atiende primero, con qué información, y cómo se revisa y mejora la posventa.

*Costo de quedarse:* Se atiende primero al que más reclama, y los mismos problemas de entrega y devolución se repiten porque nadie los revisa.

#### 3.5 Consistencia de Atención

¿El comprador recibe la misma respuesta y la misma solución, lo atienda quien lo atienda?

*Descripción:* Mide si cada comprador recibe la misma respuesta y la misma solución ante un cambio, una devolución o una garantía.

*Costo de quedarse:* La misma devolución se acepta o se rechaza según quién atienda: el comprador lo nota y lo cuenta.

#### 3.6 Priorización de Clientes

¿Tus mejores clientes y los casos urgentes se atienden primero, o todos hacen la misma fila?

*Descripción:* Mide si la atención se prioriza por la urgencia del caso y el valor del cliente, no por quién insiste.

*Costo de quedarse:* Tu mejor cliente espera en la misma fila que todos, y un pedido que no llegó se atiende después que una consulta simple.

#### 3.7 Seguimiento del pedido

¿El comprador sabe en qué va su pedido antes de preguntar, y te enteras de un problema antes de que reclame?

*Descripción:* Mide si el comprador sabe cómo va su pedido sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera de un atraso cuando ya reclamó, y tú te enteras de que quedó mal cuando deja una mala reseña.

#### 3.8 Autoservicio

¿El comprador resuelve solo lo simple —dónde está su pedido, cómo cambiarlo—, o cada consulta necesita a una persona?

*Descripción:* Mide si el comprador resuelve solo lo simple: el estado de su pedido, un cambio o una pregunta frecuente.

*Costo de quedarse:* Cada consulta necesita a una persona: en temporada alta las respuestas se atrasan, y para vender más tienes que contratar al mismo ritmo.
