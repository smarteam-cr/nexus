---
documento: Escala de Rendimiento Smarteam — Escalas departamentales
version: 9.2.0
fecha: 2026-10-28
estado: En revisión: cambia con el criterio de su responsable y con el feedback que el equipo manda desde Nexus; cada feedback lo decide un super admin
relacionados: especificacion_calculo_escala.md, manual_operacion_escala.md
---

# Cómo leer este documento

Este documento es la Escala de Rendimiento: define qué significa cada nivel y cada criterio. Lo consumen personas y sistemas: el chequeo y su página de resultados, el cotizador, los agentes de Nexus, y los materiales que se preparan para el equipo y para los clientes.

La escala va con dos documentos más. La **especificación del cálculo** (`especificacion_calculo_escala.md`) convierte sus reglas en pasos exactos para los sistemas: cómo se calculan el nivel y el puntaje, qué se muestra y qué se guarda. El **manual de operación** (`manual_operacion_escala.md`) dice cómo trabaja el equipo con ella: quién la aplica y cuándo, cómo se comprueba que funciona y qué reglas esperan hasta que hagan falta. Los dos precisan lo que dice la escala, pero no lo cambian: si alguno la contradice, manda la escala y se corrige el otro.

Tiene cinco partes. La primera explica qué es la escala y cómo pensarla: es contexto, no regla, y sirve para entender y para enseñar. La segunda dice cómo se aplica: las dos formas de aplicarla, cómo se evalúa, cómo se llega al nivel y al puntaje, qué se trabaja primero y dónde se cuenta cada evidencia. La tercera es la matriz: cada dimensión de cada área con sus cinco niveles y sus criterios. La cuarta es la referencia: nombres, riesgos, glosario e historial. La quinta trae las ediciones por industria: la misma escala, dicha para una industria.

Las partes dos, tres, cuatro y cinco son normativas y se aplican al pie de la letra. Si algo de la primera parte parece contradecirlas, mandan ellas. Cualquier material derivado —una página teórica, una presentación, las preguntas del chequeo— respeta la matriz y las reglas sin reinterpretarlas.

Cada criterio de la matriz termina con una etiqueta entre corchetes: su identificador, cómo se verifica, sus marcas y, si no se puede cumplir sin otro criterio, cuál requiere. Es para los sistemas y para quien diagnostica; para entender la escala, se puede saltar.

**Cómo cambia.** La escala cambia con el criterio de su responsable y con el feedback del equipo. Quien quiera decir algo de la escala lo manda como feedback desde Nexus, en el criterio, el nivel o la dimensión que está leyendo. El feedback es privado —lo ven quien lo mandó y quien lo revisa— y lo decide un super admin: lo responde, lo descarta o lo lleva a la hoja de ruta. Cada cambio sale como una versión nueva y queda en el historial; cómo se decide está en el manual de operación.

---

# Parte 1 — Qué es la escala y cómo pensarla

## Qué es la escala

La Escala de Rendimiento es el instrumento con el que Smarteam diagnostica cómo está operando un departamento de un prospecto o cliente. Ubica a cada departamento —Ventas, Marketing y Servicio— en uno de cinco niveles de madurez, a partir de la evidencia que arroja una exploración. No describe productos ni servicios: describe estados de madurez.

Una forma corta de decir qué es: la escala es el mapa y la brújula de un departamento. El mapa muestra dónde está; la brújula, hacia dónde conviene ir. Y como se vuelve a medir, el mapa también muestra cuánto se avanzó.

Sirve para que un consultor ubique a una empresa y que la empresa se reconozca en ese lugar: «sí, así estamos». Desde ahí le da al cliente tres cosas: previsibilidad, porque ve todo lo que se le puede hacer para mejorar su rendimiento; un primer paso concreto —un servicio de entrada o un caso de uso— que mejora una o varias de sus dimensiones; y un camino para seguir, caso de uso tras caso de uso, en el orden que sugiere la escala, hasta llevar a cada departamento al nivel que necesita.

Hay tres piezas, en orden. Este documento es el **reglamento**: define qué significa cada nivel en cada dimensión y con qué señales observables se reconoce. El **diagnóstico** es la actividad: alguien explora el departamento, junta evidencia y ubica cada dimensión en su nivel usando este reglamento; antes de la venta, su versión corta es el **chequeo**, que lo estima con pocas preguntas. La **página de resultados** es lo que ve el cliente: el estado actual del departamento y qué le toca mejorar.

Los cinco niveles, de menor a mayor madurez, son **Deficiente, Inicial, Funcional, Eficiente y Óptimo**. Funcional es la base: arquitectura montada, procesos que se siguen, roles definidos, datos confiables, tableros descriptivos y automatización simple. Todo lo que pide lógica condicional, instrumentación fina, coordinación entre áreas o inteligencia artificial pertenece a Eficiente u Óptimo. Deficiente e Inicial describen a un departamento que todavía no llega a esa base.

Cada departamento se mira a través de ocho dimensiones, agrupadas en dos capas. La **base operativa** —cómo está montado el departamento por dentro— reúne Procesos y Rutinas, Tecnología y Automatización, Datos, y Equipo y Gobierno. La **producción** —qué entrega el departamento hacia afuera— reúne cómo se presenta, a quién prioriza, con qué alcance llega y cómo aprende. El resultado de un departamento se lee por capa: en qué nivel está su base operativa y en qué nivel está su producción.

## Las ocho dimensiones

**Base operativa — cómo está montado el departamento por dentro.** La forman cuatro dimensiones, iguales en las tres áreas:

- **Procesos y Rutinas** — si el área se ejecuta por sistema o por personas.
- **Tecnología y Automatización** — si lo que entra llega solo al sistema y a quien le toca, y cuánto del trabajo repetitivo hace el sistema.
- **Datos** — si la información es base confiable para decidir.
- **Equipo y Gobierno** — si cada persona tiene claro su rol y si el líder sigue los resultados con datos y pide cuentas por ellos.

**Producción — qué entrega el departamento hacia afuera.** También son cuatro, y cada una responde siempre la misma pregunta:

- **Presentación** — qué presenta el área hacia afuera y qué tan consistente es lo que percibe quien recibe.
- **Priorización** — a quién le da prioridad y cómo trata distinto a cada uno: en Ventas y en Servicio se mide como priorización, y en Marketing, como segmentación.
- **Alcance** — cómo llega a cada destinatario —el prospecto, el mercado, el cliente— y si se adelanta en vez de esperar a que lo busquen.
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

**Ventas.** Tu proceso comercial es un caos reactivo. Cada vendedor trabaja a su manera, la información clave vive en cabezas y libretas personales, y el CRM no existe o casi no se usa. El resultado son cierres impredecibles y un pipeline que nadie puede ver.

**Marketing.** Tu marca no la defines tú, la define el mercado. La voz y los mensajes son inconsistentes, las herramientas están sueltas y sin conectar, y las campañas corren hasta agotar presupuesto sin que nadie mida qué dejaron. La demanda que llega es accidental.

**Servicio.** El servicio se improvisa cliente por cliente. No hay un proceso de atención ni un sistema donde queden los casos —cada agente responde con su propio criterio, desde su correo o su teléfono— y los datos están dispersos. La fuga de clientes te toma por sorpresa.

### Inicial

**Ventas.** Tienes algo de estructura, pero la ejecución falla. Hay un CRM en funciones básicas que el equipo percibe como carga administrativa y llena a mano, la calificación sigue en la cabeza del vendedor y los negocios se sostienen sobre relaciones personales. El pipeline todavía no se ve con claridad.

**Marketing.** Tienes logo y colores, pero sin estrategia detrás. Las herramientas se usan a medias y parte de lo que entra se pasa a mano, el contenido sale de forma reactiva y esporádica, y los resultados se miden tarde y a mano, sin que lo aprendido quede escrito. Los leads llegan de forma irregular y no siempre sabes de dónde vienen.

**Servicio.** El conocimiento y la coordinación viven en una sola persona, y eso te deja con un punto único de fallo. Hay un sistema de casos, pero pocos lo usan; cada agente tiene sus propias respuestas guardadas y hay procesos que nadie formalizó. La entrega es frágil.

### Funcional

**Ventas.** Tu equipo comercial opera como una maquinaria base. Todo el equipo trabaja en el CRM, no en hojas aparte; los prospectos se gestionan siguiendo un pipeline documentado, los roles están por escrito y cada quien rinde cuentas en la revisión del pipeline. Hacia afuera ya tienes un cliente ideal definido, coherencia básica en mensaje y propuesta, y ningún negocio se enfría sin que alguien reaccione. Sin pronóstico ni sofisticación todavía, pero con previsibilidad operativa.

**Marketing.** El área dejó de depender de héroes. Tienes marca, buyer personas y presencia digital documentadas, las herramientas que pagas se usan de verdad, y los canales que elegiste en tu plan salen con regularidad, coordinados bajo un mismo calendario. La información describe la operación con confianza, sin reconstruirla a mano: sabes de dónde viene cada lead y cuánto te cuesta en cada canal. La demanda ya se mide, aunque la optimización fina todavía no existe.

**Servicio.** Tu entrega es consistente y ya no depende del individuo. Sabes qué tipos de cliente atiendes y qué espera cada uno. Hay un pipeline de servicio configurado, el equipo atiende en el sistema central con la ficha del cliente a la vista, los casos están categorizados y cada cliente nuevo arranca con un proceso definido. Cada caso tiene una prioridad que el equipo respeta, tienes respuestas guardadas para lo repetitivo y detectas a mano los riesgos evidentes antes de que estallen. Todavía no hay alertas automáticas, pero ya no esperas a que el cliente se queje.

### Eficiente

**Ventas.** Tu proceso dejó de ser etapas y se volvió método con disciplina medida. Mides conversión y velocidad por etapa, las secuencias se adaptan a cómo responde cada prospecto, el CRM se conecta con los otros sistemas que use la empresa, la IA asiste al equipo en su trabajo diario y aparece un pronóstico confiable. Hacia afuera hay puntaje de leads por reglas, cuentas objetivo, seguimiento por varios canales y una revisión trimestral de los negocios ganados y perdidos que cambia el proceso.

**Marketing.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la siguiente campaña. Los datos se completan solos y se sabe qué aportó cada canal a cada venta; los segmentos y el puntaje de leads se arman solos; la IA asiste al equipo en su trabajo diario; y la presencia se prepara tanto para buscadores como para asistentes de IA. El presupuesto se mueve entre canales según lo que cuesta cada lead o cada venta.

**Servicio.** El servicio empieza a adelantarse al problema. Tienes SLA, escalación automática y autoservicio, y la IA asiste a tu equipo en su trabajo diario; mides tiempos de resolución y satisfacción, y los datos se unifican con Ventas. Identificas riesgos y oportunidades antes de que el cliente levante la mano, y ningún caso se pierde entre áreas. Donde el cliente vuelve, cada cliente tiene un indicador de salud y cada cliente clave, un responsable dedicado; donde la relación es continua, los que están en riesgo reciben una acción de retención antes de decidir irse.

### Óptimo

**Ventas.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA califican ahí los leads y agendan reuniones; la IA analiza las llamadas con los prospectos y propone correcciones al playbook, el pronóstico lo calcula un modelo, y la priorización se alimenta de lo que saben Servicio y Marketing de cada cliente. El vendedor dedica su tiempo a las conversaciones que deciden el negocio, no a la administración.

**Marketing.** La IA produce y ajusta; el equipo dirige. El contenido se genera y se ajusta de forma continua; la IA predice qué va a hacer cada persona, adapta el mensaje a su comportamiento y mueve el presupuesto entre canales dentro de los límites que fija el equipo; y los clientes que Servicio vuelve promotores traen clientes nuevos. El equipo define la estrategia y valida lo que sale.

**Servicio.** Un agente de IA resuelve casos en todos los canales donde atiende el equipo y le pasa a una persona, con todo el contexto, los que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y gestiona excepciones; cada cliente se atiende sabiendo lo que se le prometió en la venta y recibe detalles pensados para deleitarlo y, donde el cliente vuelve, un modelo de salud anticipa el riesgo antes de que el cliente lo diga. La cartera crece sin que crezca el equipo.

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

**Expandir.** Una vez en Funcional, cada capacidad de Eficiente u Óptimo se puede convertir en un caso de uso: una implementación acotada más su entrenamiento, que mueve una o varias dimensiones de un nivel al siguiente. Los casos de uso se ofrecen a partir del resultado que persigue el cliente, no de lo que resulte más fácil de cotizar. Se pueden vender por separado o dentro de un servicio recurrente, que aplica un caso de uso tras otro, en el orden que sugiere la escala, hasta llevar al departamento a su nivel objetivo.

Algunos criterios de Eficiente y Óptimo describen la cultura del cliente: que decida con datos o que se adelante a los problemas. No se venden como un caso de uso técnico: se trabajan con acompañamiento y gestión del cambio, sobre lo que ya instalaron otros casos de uso.

Qué se ofrece después lo decide la regla de la Parte 2, en Qué se trabaja primero: se mueve la capa más baja, empezando por su dimensión más débil, y solo hasta el nivel objetivo que se acordó con el cliente según el resultado que persigue. Si ese resultado pide empezar por otra dimensión de esa capa, el CSE cambia el orden y escribe por qué. Y la brecha entre las dos capas, explicada en Cómo se relacionan las dos capas, dice qué conversación toca tener con el cliente.

El momento natural de expandir es la remedición. Entre 60 y 90 días después de entregar se vuelve a medir: se confirma que el cliente sostiene Funcional y se abre la conversación de qué sigue, con la escala en la mano.

**La apertura a la asesoría.** El aterrizaje también sirve para calificar al cliente. No todos quieren acompañamiento metodológico o estratégico; algunos solo necesitan una buena implementación. Esa apertura no es un nivel de la escala ni cambia el diagnóstico: es la señal de si el cliente es para expandir. Si la tiene, se construye una relación de crecimiento por casos de uso. Si no la tiene, se le entrega una muy buena implementación, y es un cliente que puede recomendar a otros. Esta señal se registra en el handoff, no en la escala.

**Cada área aterriza distinto.** Llevar Ventas o Servicio a Funcional es sobre todo montar la arquitectura y enseñar a usarla: el pipeline, las etapas, la asignación, los reportes. Llevar Marketing a Funcional es sobre todo habilitación: enseñarle al equipo a operar los canales que eligió en su plan, a sostener un calendario y a coordinar una campaña entre esos canales. Por eso aterrizar Marketing suele pedir más acompañamiento, y conviene explicarlo así cuando el cliente compara precios.

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

Para cada dimensión se contrasta la evidencia contra los criterios de cada nivel, y la regla cambia según el nivel. Deficiente e Inicial describen lo que falta, así que entre esos dos se asigna el que mejor calza con la evidencia: Deficiente, cuando lo que pide Funcional no existe; Inicial, cuando existe a medias: sin regularidad, sin escribir, fuera del sistema o dependiendo de una persona. De Funcional para arriba los criterios describen lo que ya está en su lugar, y la regla es estricta: una dimensión está en un nivel cuando cumple todos los criterios que deciden ese nivel y los de los anteriores desde Funcional. Si le falta uno, queda en el nivel anterior; si no cumple todos los de Funcional, se asigna Deficiente o Inicial según lo que mejor calce. Los criterios que la escala condiciona —los que abren con una condición, como «si hay» o «si lo que se vende es limitado»— solo cuentan cuando aplican, igual que los que dependen del perfil de negocio.

Un criterio se cumple por lo que busca, no por su letra. Si la dimensión lo resuelve de una forma más avanzada —por ejemplo, con un criterio de un nivel superior que hace lo mismo mejor—, cuenta como cumplido.

La regla estricta es a propósito: permite saber con exactitud cuándo una dimensión llegó a un nivel y qué le falta, y eso hace que el avance se pueda calcular y mostrar.

Esta regla es la del diagnóstico. El chequeo no recorre los criterios: estima cada dimensión por mejor ajuste, como dice Dos formas de aplicar la escala. En los dos, cada evidencia cuenta en una sola dimensión, la que responde su pregunta; los casos dudosos —dónde va el pronóstico, el puntaje de leads o el canal conversacional— los resuelve la Regla de asignación, al final de esta parte.

**Criterios de riesgo.** No todos los criterios deciden el nivel. Algunos, marcados como riesgo, protegen algo que el departamento todavía no necesita para operar, pero que se vuelve indispensable al dar el siguiente paso, sobre todo al empezar a usar IA. La prueba para distinguirlos: si sin ese criterio el departamento deja de cumplir lo que pregunta su dimensión sin depender de héroes, decide el nivel; si funciona igual pero queda expuesto, es riesgo. En la práctica, tener algo suele decidir el nivel, y mantenerlo vigente suele ser riesgo.

Un criterio de riesgo no impide llegar a Funcional, pero sí pasar a Eficiente, que es donde la IA empieza a trabajar como asistente. Mientras esté pendiente, se reporta junto al nivel como un riesgo activo.

**Niveles por confirmar.** Algunos criterios describen un hábito: algo que el equipo repite, no algo que se instala, se escribe o se sabe. Lo instalado, lo escrito y lo sabido se verifican el día que se entrega; un hábito solo se confirma después de que el equipo operó un tiempo. Esos criterios llevan la marca hábito.

Un hábito puede estar en tres estados. Cumplido, cuando ya se comprobó en el tiempo: en una rutina con cadencia, al menos 4 de las últimas 5 veces que correspondía. Iniciado, cuando la rutina ya existe —está agendada, configurada o el equipo ya está entrenado— pero todavía no tiene esa historia. Y no cumplido, cuando no se hace.

Cuando a una dimensión solo le faltan hábitos iniciados para alcanzar un nivel, ese nivel queda por confirmar. Cuenta como alcanzado, también en el puntaje, y en la siguiente remedición se confirma o baja. Un hábito que no se hace cuenta como no cumplido, así que un nivel hecho solo de hábitos no se regala: se alcanza cuando la rutina existe. Confirmarlo es revisar cómo funcionó en el tiempo: muchos hábitos se ven en la historia del sistema —las reuniones que se hicieron, los correos que salieron, la actividad sobre los negocios—, y otros solo se confirman observando cómo opera el equipo. Es el trabajo de la etapa de adopción.

## Cómo se verifica cada criterio

Cada criterio de la matriz lleva al final su identificador y la forma en que se verifica. Hay tres formas.

**Comprobable.** La evidencia está en los datos o la configuración del sistema: registros, propiedades, flujos, reportes. Quien tiene acceso lo confirma mirando, sin preguntarle a nadie. Por ejemplo, que todo negocio tenga fecha de cierre, monto y responsable.

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

Algunos criterios no se pueden cumplir sin otro. Enfocar el esfuerzo en los leads que encajan con el cliente ideal necesita que el cliente ideal esté escrito; rendir cuentas en la revisión del pipeline necesita que la reunión ocurra. Cuando ese otro criterio está en otra dimensión, o en un nivel anterior de la misma, el criterio lo dice en su etiqueta: lo requiere.

Es la forma de no pedir lo mismo dos veces. Cada cosa se pide en una sola dimensión, la que responde su pregunta, y quien depende de ella la requiere en vez de repetirla.

Un requerido no cambia el cálculo. El nivel y el puntaje de cada dimensión salen solo de sus propios criterios, como dice Cómo se evalúa cada dimensión. Si un requerido bajara el nivel de quien lo necesita, una sola cosa que falte le costaría a dos dimensiones, y eso es justo lo que se evita.

**Para leer la escala.** Se ve de dónde se sostiene cada criterio y cuáles son cimiento: los que más criterios requieren son los que conviene tener primero.

**Para ordenar el trabajo.** Lo que un criterio requiere se hace antes que él. Qué dimensión se trabaja primero lo sigue decidiendo la regla de Qué se trabaja primero; dentro de lo que falta, lo requerido va antes.

**Para revisar un diagnóstico.** Un criterio que se dio por cumplido sin que lo esté lo que requiere es una señal para volver a mirar: o lo requerido se resuelve de otra forma, o el criterio no está tan cumplido como parece.

Solo requieren, y solo se requieren, criterios de Funcional para arriba: Deficiente e Inicial describen lo que falta y se asignan por mejor ajuste. Lo requerido es siempre de un nivel igual o anterior —un criterio de Funcional no depende de uno de Eficiente—, y si es de la misma dimensión, de un nivel anterior. Con un perfil de negocio o con una edición, un requerido que no aplica se deja de lado: no se exige lo que no cuenta.

## El perfil de negocio

No todas las empresas venden igual, y la escala no cambia de estructura por eso: cambia qué criterios aplican. Cada unidad que se diagnostica tiene un perfil de negocio, que responde tres preguntas.

**Cómo se cierra la venta.** Con equipo, cuando una persona trabaja cada negocio; transaccional, cuando la venta se cierra sin que nadie la trabaje —en caja, en el sitio web o por autoservicio—; o mixta, cuando conviven las dos.

**Qué pasa después de la venta.** Relación única, cuando el cliente compra una vez; recompra, cuando vuelve a comprar sin contrato; o relación continua, cuando hay suscripción, contrato o servicio.

**El tráfico del sitio o la app.** Suficiente, cuando el sitio o la app recibe 50.000 visitas al mes o más —umbral provisional, hasta tener la calificación con que las plataformas de personalización aceptan a un cliente—; o insuficiente, cuando recibe menos.

Los criterios que dependen del perfil llevan una marca: venta con equipo; venta sin vendedor, que vale para la venta transaccional y la mixta; cliente recurrente, que vale para recompra y relación continua; recompra; relación continua; o tráfico suficiente, que vale cuando el sitio o la app tiene el tráfico de la tercera pregunta, porque personalizar a quien todavía no dejó sus datos y medir contra un grupo de control solo funcionan con volumen. Si la marca no corresponde al perfil de la unidad, el criterio no aplica y sale de la cuenta. Un criterio lleva una sola marca. En la venta mixta aplican todos los que dependen de cómo se cierra la venta: los de venta con equipo se evalúan sobre el canal que vende con personas, y los de venta sin vendedor, sobre el que vende solo.

En la venta transaccional también hay pipeline y negocios: se crean solos, desde la tienda o el sitio web, y dan la reportería. Por eso los demás criterios de Ventas se leen sobre esa venta automática: el negocio es el pedido o el carrito, el vendedor es el canal, y la razón de pérdida es el punto donde se abandona la compra. Lo que un criterio dice de lo que hace un vendedor, y no tiene equivalente, no aplica. Si una dimensión se queda sin criterios que apliquen en Funcional —como Priorización de Leads en una venta transaccional—, la dimensión no aplica a ese perfil: se reporta así y no entra en el nivel ni en el puntaje de su capa.

**La próxima compra.** Donde el cliente vuelve a comprar sin contrato, la próxima compra se trata como un negocio más, se venda con equipo o sin vendedor: si no llega cuando se esperaba, es un negocio que se enfrió, y reactivarlo es trabajo de Ventas. La renovación de un contrato, en cambio, es de Servicio. Ofrecerle el siguiente producto a un cliente actual también es de Ventas: Servicio ve el potencial y le pasa la señal, y Ventas lo trabaja como un negocio.

El perfil decide qué criterios aplican; la industria decide con qué edición se lee la escala. Una universidad y una inmobiliaria venden las dos con equipo, pero una habla de matrícula y la otra de reserva, y a cada una le importan cosas que a la otra no. Eso vive en las ediciones por industria, en la Parte 5: cada edición dice la escala con las palabras de su industria y le suma los criterios que solo tienen sentido ahí. La matriz de la Parte 3 es la escala general: con ella se mide a quien todavía no tiene una edición y a quien la edición de su industria no cubre, como una tienda solo física o una aseguradora.

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
| Producción | Ventas | Propuesta y Coherencia → Priorización de Leads → Tracción del Negocio → Aprendizaje de Ganadas y Perdidas | Sin cliente ideal y mensaje común no se puede priorizar; sin prioridad, el seguimiento se dispersa; sin seguimiento, no hay de qué aprender. |
| Producción | Marketing | Marca y Presencia → Segmentación → Canales y Alcance → Medición y Aprendizaje | Los buyer personas se definen primero, junto con la marca: sin ellos no hay segmentos, sin segmentos no se sabe a quién llegar, y sin canales no hay qué medir. |
| Producción | Servicio | Consistencia de Atención → Priorización de Clientes → Proactividad → Escalabilidad del Servicio | Los tipos de cliente se definen primero: sin ellos no se sabe qué atención le toca a cada uno, sin eso no se sabe a quién adelantarse, y solo se escala lo que ya se hace bien. |

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

- **Funcional — automatización simple.** Un disparador, una acción, sin lógica condicional ni coordinación entre áreas. Rotación de leads por regla simple, un email automático tras un formulario, un caso asignado al recibirse, notificaciones internas, chatbot de árbol de decisión.
- **Eficiente — automatización con lógica o amplitud.** Secuencias de varios pasos con ramificación y tiempos de espera (nutrición real), asignación por varias condiciones o por capacidad, escalación automática de SLA, flujos automáticos que conectan áreas, enriquecimiento de datos, contenido que se adapta por segmento.
- **Óptimo — flujos IA-first con validación humana.** La IA ejecuta el trabajo —agentes que califican, agendan, resuelven o generan contenido— y las personas validan en los puntos que importan: excepciones, casos de alto valor y entrenamiento del propio sistema. El equipo pasa de ejecutar a supervisar. Cuando la IA decide sola cada envío, nadie aprueba uno por uno: el equipo fija las metas y los límites, y revisa los resultados.

La IA no define Óptimo por sí sola. Ya aparece en Eficiente como asistente que apoya a una persona —redacción de contenido, enriquecimiento de datos, sugerencias—. La línea entre Eficiente y Óptimo es quién ejecuta: en Eficiente la IA asiste y la persona hace el trabajo; en Óptimo la IA lo hace y la persona valida. Un caso no es Óptimo solo porque mencione IA, ni deja de serlo porque haya humanos involucrados: la pregunta es dónde están puestos.

## Regla de asignación

Cada evidencia observada se asigna a una sola dimensión —la que responde su pregunta—, nunca a dos. Los casos que no son obvios:

- Los **artefactos de ejecución de venta** (playbook, criterios de etapa, cadencia, metodología) se asignan a **Procesos de Ventas (1.1)**. Lo que recibe el cliente —el mensaje y la propuesta, con su estructura— se mide en **Propuesta y Coherencia (1.5)**, y la definición de lead calificado, en **Priorización de Leads (1.6)**. Cada uno se cuenta una sola vez.
- La **plantilla de la propuesta** se mide en **Propuesta y Coherencia (1.5)**; el **material de apoyo para mover un negocio** —presentaciones, casos de éxito, demos— en **Tracción del Negocio (1.7)**.
- Que el equipo **trabaje en el sistema central** y no por fuera —el CRM en Ventas, el sistema de marketing, el de atención en Servicio— es una rutina, y se asigna a **Procesos** de cada área (**1.1, 2.1 o 3.1**), igual que vigilar que el proceso se cumpla; que las **conversaciones con los prospectos** queden en el sistema se asigna a **Tecnología (1.2)**.
- **Mejorar el proceso con lo aprendido** se asigna a la dimensión de aprendizaje de cada área —**Aprendizaje de Ganadas y Perdidas (1.8)**, **Medición y Aprendizaje (2.8)** o **Escalabilidad del Servicio (3.8)**—: Procesos mide que el proceso exista y se siga, no cómo cambia. Lo único que Procesos de Ventas conserva, en Óptimo, es la disciplina de probar una técnica nueva en un piloto antes de sumarla al proceso. Las **pruebas** de Marketing —de creatividades y de audiencias— también son aprendizaje, y van en **2.8**; probar un canal nuevo es alcance, y sigue en **Canales y Alcance (2.7)**.
- La **IA como asistente del equipo** —redactar, resumir, preparar— se asigna a **Tecnología** de cada área (**1.2, 2.2 o 3.2**) y es Eficiente. En Funcional no es requisito: solo se pide que, si el equipo usa IA, esta trabaje con un contexto básico. Los **tableros en tiempo real** también son de **Tecnología**, en Eficiente: ver lo que pasa mientras pasa es una capacidad del sistema, no un nivel de autonomía.
- El **pronóstico** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1) ni a 1.5.
- En la **frontera Marketing ↔ Ventas**, cada pieza se asigna por quién la ejecuta: la definición de a quién sirve el equipo comercial (el cliente ideal) en **1.5 (Ventas)**; la segmentación y personalización del mensaje de marketing en **2.6 (Marketing)**; marcar MQL (lo clasifica Marketing) en **2.6 (Marketing)**; aceptar SQL (criterio del lado de Ventas) en **1.6 (Ventas)**; poblar el campo de etapa del ciclo de vida, como higiene de dato, en **Datos** del área que lo captura (1.3 o 2.3); el pipeline de ventas, con sus etapas y sus criterios de avance, en **Procesos (1.1)**. La definición de lead calificado es una sola y vive en 1.6; los criterios de avance de cada etapa del pipeline son otra cosa, y siguen en 1.1.
- En **Servicio**, la definición de los tipos de cliente que atiende el área —qué necesita cada uno y qué espera— se asigna a **Consistencia de Atención (3.5)**, como el cliente ideal a 1.5 y los buyer personas a 2.5; la diferenciación de la atención según esos tipos, a **Priorización de Clientes (3.6)**.
- También en **Servicio**, el **pipeline de servicio**, con sus etapas, se asigna a **Procesos (3.1)**, igual que **quién responde por cada cliente**. La **ficha del cliente** —lo que compró o tiene contratado y su valor— se asigna a **Datos (3.3)**, y que el agente la use al atender, a **Priorización de Clientes (3.6)**. La **prioridad de cada caso** es de **Priorización de Clientes (3.6)**; Datos pide su tipo y su motivo. La **escalación automática** es de **Tecnología (3.2)**. **Alimentar la base de conocimiento** y **buscar patrones** en el historial son de **Escalabilidad del Servicio (3.8)**, y **adelantarse al cliente**, de **Proactividad (3.7)**.
- Los **plazos de atención** se reparten así: definirlos es de **Procesos (3.1)**; avisar y escalar cuando están por vencer, de **Tecnología (3.2)** —si el caso lo resuelve otra área, de **Proactividad (3.7)**—; medir cuánto se tarda y cuánto se cumplen, de **Datos (3.3)**; y rendir cuentas por ellos, de **Equipo y Gobierno (3.4)**. Lo que Procesos vigila en Eficiente y en Óptimo es que cada caso siga las etapas y los pasos del proceso: un plazo que vence no cuenta ahí.
- El **puntaje de leads por reglas** se asigna a **Segmentación (2.6)**, y es nivel Eficiente; Ventas lo usa para priorizar, en **Priorización de Leads (1.6)**, también en Eficiente. No se confunde con lo que pide Funcional —calificar los leads en Ventas, clasificarlos en Marketing—: ahí basta aplicar criterios escritos, sea a mano o con una automatización simple sobre una propiedad; el puntaje de Eficiente es un modelo con varios atributos.
- El **canal conversacional y la bandeja** se asignan a **Tecnología** del área correspondiente (1.2, 2.2 o 3.2), y solo cuentan si el equipo atiende por ese canal: se puede ser Funcional atendiendo por correo y teléfono. Si se usa, un canal con bandeja básica es Funcional; varios canales en una bandeja unificada es Eficiente. Usar ese mismo canal para **salir** con cadencia —WhatsApp como canal de campaña— se asigna a Canales (2.7), no a Tecnología: una cosa es tenerlo conectado y otra es usarlo para llegar.
- El **análisis automático de conversaciones** se asigna a **1.8 (Ventas)**, no a Tecnología: es aprendizaje, no infraestructura. Lo que sale de ese análisis para mejorar el playbook es de 1.8; señalar a quien se sale del proceso es adherencia, y sigue en Procesos (1.1).
- La **siguiente mejor acción** que propone la IA se asigna a **Priorización de Leads (1.6)**; Tecnología (1.2) cuenta los agentes, la predicción de cierre y las respuestas sugeridas, no esa recomendación.
- Lo que la **IA decide enviar a cada persona** —qué, por qué canal y cuándo— se asigna a **Tecnología de Marketing (2.2)** en las campañas, a **Tracción del Negocio (1.7)** en los seguimientos de Ventas y a **Proactividad (3.7)** en los avisos a los clientes. Lo que la IA puede decidir sola se escribe en **Equipo y Gobierno** de cada área, y medirlo contra un grupo de control va en su dimensión de aprendizaje (**1.8, 2.8 o 3.8**).
- La **predicción por persona** va donde se usa: en **Segmentación (2.6)** cuando es de marketing, en **Tecnología de Ventas (1.2)** cuando es la probabilidad de cerrar un negocio y en **Datos de Servicio (3.3)** cuando es el riesgo de que un cliente se vaya.
- La **integración con ERP** u otros sistemas se asigna a **Tecnología** del área que la implementa; **Datos** solo declara el resultado (registros completos y trazables). Lo mismo vale para dónde vive la información: si no hay un sistema donde llevarla, o el que la tiene no se conecta con los demás, es de Tecnología; si el sistema existe y el equipo la lleva en hojas aparte, es de **Procesos**. Lo que eso provoca —que no haya un registro completo de los clientes, o que haya que armarlo a mano— sí lo describen las señales de Deficiente e Inicial de **Datos**; lo que lo arregla se cuenta en Tecnología o en Procesos.
- La **calidad de los datos** —campos vacíos, duplicados y cómo se corrigen— se asigna a **Datos** de cada área (**1.3, 2.3 o 3.3**), no a Equipo y Gobierno: lo único que Equipo y Gobierno de Marketing pide de ella, en Óptimo, es que haya responsables de cuidarla (**2.4**).
- La **orquestación entre áreas** (SLA, traspasos, rutinas conjuntas) se asigna a **Equipo y Gobierno** del área cuyo liderazgo sostiene la coordinación, y nunca es Funcional: su piso es Eficiente. El flujo automático que la habilita se asigna a Tecnología. Las dimensiones 1.7, 2.7 y 3.7 miden el alcance hacia el destinatario final, no la coordinación entre departamentos.
- Cada **acuerdo entre dos áreas** se cuenta una sola vez, en **Equipo y Gobierno** de una de las dos: el traspaso de los leads de Marketing a Ventas, en **1.4**; el de cada cliente nuevo de Ventas a Servicio y la señal de Servicio a Ventas de los clientes listos para el siguiente producto, en **3.4**; y qué clientes se vuelven casos de éxito o referidos, que el líder de marketing acuerda con Servicio, en **2.4**. La automatización del traspaso sigue en Tecnología.
- La **respuesta a un negocio que se enfría** —reconocerlo a tiempo, reactivarlo, y que el líder se entere e intervenga— se asigna a **Tracción del Negocio (1.7)**, y Equipo y Gobierno no la vuelve a contar. La cadencia general de contacto sigue en Procesos (1.1), y la notificación que el sistema le manda al vendedor, en Tecnología (1.2).
- El **lead que todavía no está listo para comprar** —que vuelva a nutrición y regrese cuando muestra interés— se asigna a **Tracción del Negocio (1.7)**; el acuerdo con Marketing que lo hace posible es orquestación, y sigue en Equipo y Gobierno (1.4).
- La **próxima compra de un cliente que vuelve sin contrato** —recordarle la recompra, reactivar a quien dejó de comprar— se asigna a **Tracción del Negocio (1.7)**; retener a quien está por cancelar un contrato y atender sus quejas sigue en **Proactividad (3.7)**, y las campañas hacia el mercado, en **Canales y Alcance (2.7)**.
- La **renovación y el siguiente producto** de un cliente actual se reparten así: retenerlo, renovar su contrato y ver dónde tiene potencial de crecer es de **Proactividad (3.7)**; el acuerdo de cómo le llega esa señal a Ventas, de **Equipo y Gobierno (3.4)**; y ofrecerle el siguiente producto, con esa señal, de **Tracción del Negocio (1.7)**, en Eficiente.
- La **venta ganada que se cae antes de la entrega** —un pedido que se cancela o se devuelve, una reserva que se desiste, una matrícula que no llega a clases— no se mide en la escala general: es de las ediciones que la traen como criterio propio, y ahí se asigna a **Aprendizaje de Ganadas y Perdidas (1.8)**, igual que una pérdida. La salida de un cliente que ya recibía el servicio sigue en **Proactividad (3.7)**.
- La **coherencia de la oferta entre canales** —precios, promociones y condiciones— se asigna a **Propuesta y Coherencia (1.5)**; la coordinación de una campaña entre canales sigue en **Canales y Alcance (2.7)**.
- **Lo que cambia en la tienda o en el sitio de venta para cada comprador** —sugerencias, oferta, orden de los productos, trato a sus mejores clientes— se asigna a **Priorización de Leads (1.6)**, también donde se vende sin vendedor; el mensaje y el contenido de marketing para cada segmento o cada persona siguen en **Segmentación (2.6)**.
- La **disponibilidad de lo que se vende** —unidades, cupos o existencias, a la vista de quien vende— se asigna a **Tecnología de Ventas (1.2)**, y que cada venta quede asociada a un **cliente identificado**, a **Datos de Ventas (1.3)**.
- Las **reseñas y calificaciones públicas** —pedirlas y responderlas— se asignan a **Marca y Presencia (2.5)**, porque son parte de cómo el mercado ve a la empresa; la mala calificación de un cliente puntual se atiende en **Proactividad (3.7)**. El **programa de referidos** se asigna a **Canales y Alcance (2.7)**.
- La **protección contra la suplantación** —que el cliente sepa desde qué canales le escribe la empresa y qué nunca le va a pedir— se asigna a **Marca y Presencia (2.5)**, en las ediciones que la piden; **verificar la identidad del cliente** antes de atender una gestión es un paso del proceso, en **Procesos (3.1)**, y la herramienta que la verifica en línea es de **Tecnología** del área que la usa. **Propuesta y Coherencia (1.5)** mide la oferta, no la confianza en quien la hace.
- La **detección de riesgos y fechas críticas del cliente** —también los casos que resuelve otra área, como administración o cobros— se asigna a **Proactividad (3.7)**; el seguimiento de cada cliente por su responsable sigue en Procesos (3.1), y los acuerdos entre los líderes de esas áreas, en Equipo y Gobierno.
- Los **detalles para deleitar a los clientes actuales** —obsequios o beneficios que se dan sin pedirle una compra— se asignan a **Proactividad (3.7)**; las campañas hacia el mercado, a **Canales y Alcance (2.7)**.
- Lo que el cliente **gana comprando** —puntos, niveles o beneficios por lo que compra— se asigna a **Tracción del Negocio (1.7)**, porque mueve la próxima compra; lo que se le da sin pedirle una compra, a **Proactividad (3.7)**; y premiar al que trae a otro cliente, al **programa de referidos**, en **Canales y Alcance (2.7)**.
- La **respuesta publicada para el cliente** a las preguntas frecuentes se asigna a **Escalabilidad del Servicio (3.8)**; las respuestas guardadas para los agentes siguen en Consistencia de Atención (3.5), y el portal con base de conocimiento en Tecnología (3.2), en Eficiente. Mantener vigentes las respuestas publicadas no decide el nivel: es el riesgo de contexto, en **Datos (3.3)**.
- Los **avisos automáticos al cliente** se asignan por lo que hacen: confirmarle que algo llegó o avisarle que cambió el estado de lo suyo es automatización simple, en **Tecnología** del área que lleva ese proceso (**1.2 o 3.2**); adelantarse a un momento clave de su relación —contarle antes lo que necesita saber de una entrega, un trámite o un vencimiento— es de **Proactividad (3.7)**.
- La **distribución y el ajuste del presupuesto** entre canales se asignan a **Canales y Alcance (2.7)**, porque su pregunta incluye llegar con el costo correcto; Medición y Aprendizaje (2.8) mide cómo se aprende de cada campaña, no dónde se invierte.
- La **personalización del contenido** según el segmento o la persona se asigna a **Segmentación (2.6)**, y el **enriquecimiento de datos** a **Datos (2.3)**; ninguno de los dos se cuenta en Tecnología (2.2). **Segmentar por comportamiento** —qué abrió, qué visitó, qué compró— también es de **Segmentación (2.6)**: Datos (2.3) mide que el dato esté limpio y trazado, no cómo se usa.
- La **presencia en buscadores y en asistentes de IA** se asigna a **Marca y Presencia (2.5)**; Canales y Alcance (2.7) no la cuenta como un canal nuevo.
- Los **playbooks de servicio** —prevención, retención y expansión— se asignan a **Procesos (3.1)**, igual que los artefactos de venta en Ventas; Proactividad (3.7) mide que los riesgos y las oportunidades se atiendan a tiempo.
- El **uso de lo que produce otra área** —las señales de Servicio en la priorización de Ventas, los promotores de Servicio como canal de Marketing, el contexto de la venta en la atención de Servicio— se asigna, en Óptimo, a la dimensión de producción del área que lo recibe. Hay dos que se usan en Eficiente, porque sin ellos el área no ordena su trabajo: el puntaje de leads de Marketing, para priorizar en Ventas, y la señal de Servicio de los clientes listos para el siguiente producto. No es orquestación: la coordinación entre líderes sigue en Equipo y Gobierno.
- La **rendición de cuentas contra meta** se asigna a **Equipo y Gobierno**, y con ella el tablero que consulta el líder y el reporte periódico a la dirección. Los **resultados de cada campaña** a la vista, en cambio, son de **Medición y Aprendizaje (2.8)**.
- La **reunión recurrente** es una sola: se asigna a **Procesos**, que es donde vive la rutina; **Equipo y Gobierno** solo dice que en ella se rinde cuentas.

---

## Preparación para engagement avanzado

Es una lectura aparte, para las empresas que le venden a personas (o a personas y a empresas) con una relación digital recurrente. No cambia el nivel: dice si la empresa está lista para personalizar a cada persona en todos sus canales y medir cuánto agrega eso contra un grupo de control.

- **Lista.** Le vende a personas, o a personas y a empresas; el cliente vuelve (recompra o relación continua); tiene tráfico suficiente (la tercera pregunta del perfil); su base tiene al menos 5.000 contactos con permiso para recibir mensajes (umbral por validar); cumple los cimientos; y Marketing está en Funcional o más.
- **Casi lista.** Cumple lo demás, pero le faltan cimientos: la lectura dice cuáles. Es lo que se trabaja antes de una plataforma de personalización.
- **Todavía no.** No cumple el perfil, el tráfico, la base o el nivel de Marketing. Su camino es ordenar primero sus datos, sus canales y sus procesos.

Los cimientos son tres: el permiso de cada contacto registrado por canal y respetado en cada envío (`2.3.F9`); lo que la persona hace en el sitio o la app unido a su ficha, también lo de antes de dejar sus datos (`2.3.E7`); y, donde la edición lo pide, el catálogo al día en un solo lugar (`1.2.F102` en Ecommerce y retail, `1.2.F501` en Turismo).

Cuando falta un dato —el perfil, el tráfico, la base, el nivel de Marketing o si se cumple un cimiento—, la lectura no adivina: dice qué falta saber. El tráfico y la base se cuentan por rangos, así que un rango que contiene el umbral queda por confirmar.

# Parte 3 — La matriz

Cada área se presenta igual: sus ocho dimensiones, agrupadas en base operativa y producción, cada una con la pregunta que responde y sus cinco niveles. Esta es la superficie donde de verdad se diagnostica.

Desde Funcional, cada nivel lleva además una línea de resultado: lo que el cliente puede hacer, ver o decidir en ese nivel que antes no podía. No es un criterio y no se usa para ubicar el nivel; sirve para cruzar el resultado que persigue un cliente con el nivel que lo entrega: de ahí salen los casos de uso, el nivel objetivo y la razón del CSE cuando cambia el orden de lo que se trabaja primero.

Cada dimensión lleva además, debajo de su pregunta, una línea de costo de quedarse: lo que le cuesta al cliente estar debajo de Funcional. Se muestra cuando la dimensión está en Deficiente o Inicial, para que se vea lo que se pierde hoy y no solo lo que se ganaría al subir.

## Área 1 — Ventas

Mide el rendimiento del área de Ventas: cómo opera internamente y qué produce en pipeline y cierre. Vale igual si la venta la trabaja un equipo o una sola persona, o si se cierra sin vendedor, en la tienda, en el sitio web o por autoservicio.

### Base operativa

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus vendedores cada negocio, desde el primer contacto hasta el cierre?

*Descripción:* Mide si la venta sigue un proceso escrito y repetible, con etapas, cadencias y reuniones que no dependen de nadie.

*Costo de quedarse:* Si se va tu mejor vendedor, se lleva el proceso con él: cada quien vende a su manera y no hay forma de repetir lo que funciona.

**Deficiente.** Sin proceso: cada vendedor vende a su manera y lo que sabe de cada negocio vive en su cabeza o en su libreta.

- No hay nada escrito sobre el proceso ni sus etapas: cada vendedor usa su criterio. `[1.1.D1 · declarado]`
- Los leads se reparten a ojo, o se los queda quien los ve primero: no hay una regla que diga a quién le toca cada uno. `[1.1.D2 · comprobable · venta con equipo]`
- No hay una reunión para revisar los negocios en curso: se habla de ellos solo cuando algo se complica. `[1.1.D3 · declarado]`
- Si se van dos personas clave, nadie sabe en qué quedó cada negocio. `[1.1.D4 · evaluado]`

**Inicial.** Hay etapas y algo de estructura, pero cada vendedor las aplica a su manera y la revisión de los negocios no tiene fecha fija.

- Hay etapas de palabra o en un borrador, pero cada vendedor las interpreta distinto. `[1.1.I1 · evaluado]`
- Hay una cadencia de contacto sugerida, pero cada vendedor la cumple cuando puede o cuando se acuerda. `[1.1.I2 · evaluado]`
- La revisión del pipeline se hace cuando hay tiempo, sin una fecha fija ni un orden para repasar los negocios. `[1.1.I3 · declarado]`
- Que un negocio quede bien registrado depende de la voluntad de cada vendedor, no de una rutina del equipo. `[1.1.I4 · comprobable]`

**Funcional.** Todo el equipo sigue el mismo proceso escrito en el CRM, con etapas, una cadencia de contacto y una revisión fija de los negocios.

*Resultado:* Si rota un vendedor, el siguiente sabe en qué va cada negocio, porque todo el equipo trabaja el mismo proceso en el CRM: los negocios avanzan con los mismos criterios, cada prospecto se contacta con la cadencia acordada y los negocios se repasan en cada revisión del pipeline.

- Cualquier vendedor explica igual las etapas del pipeline y sus criterios de avance. `[1.1.F1 · evaluado]`
- Cada proceso de venta o de prospección tiene su propio pipeline en el CRM, con los criterios para pasar de cada etapa a la siguiente. `[1.1.F2 · comprobable]`
- Hay un proceso de venta escrito, con sus etapas y lo que se hace en cada una. `[1.1.F4 · declarado]`
- La revisión del pipeline se hace en una fecha fija, cada semana o cada quince días. `[1.1.F5 · declarado · hábito]`
- Cualquier vendedor trabaja en el CRM, no en hojas ni notas aparte: lo abre para ver qué le toca hacer, no solo para cargar lo que ya hizo. `[1.1.F6 · evaluado · hábito · venta con equipo]`
- Hay una cadencia de contacto definida —cuántos intentos y en cuántos días— y se cumple con la mayoría de los leads nuevos. `[1.1.F7 · comprobable · hábito]`
- El líder ve en reportes automáticos qué tareas cumplió cada vendedor y cuáles tiene pendientes. `[1.1.F8 · comprobable · venta con equipo]`

**Eficiente.** El líder comprueba con datos que el proceso se cumple y, donde se vende con equipo, el equipo sigue una metodología y guías escritas.

*Resultado:* El líder sabe dónde se desvía el proceso y lo corrige con datos, no de memoria; donde se vende con equipo, además, todos venden con un mismo método.

- Hay metodología comercial formal en uso (SPIN, MEDDIC, BANT o equivalente). `[1.1.E1 · evaluado · hábito · venta con equipo]`
- Hay playbooks escritos de descubrimiento, calificación y manejo de objeciones. `[1.1.E2 · declarado · venta con equipo]`
- El líder comprueba con datos del sistema, no de memoria, que el proceso se cumple como está escrito. `[1.1.E3 · evaluado · hábito]`
- El equipo usa esos playbooks en sus conversaciones. `[1.1.E5 · evaluado · hábito · venta con equipo]`
- El sistema marca en el CRM los negocios que se salen del proceso y se los señala al líder. `[1.1.E6 · comprobable]`

**Óptimo.** La IA vigila que el proceso se cumpla y avisa cuando alguien se sale; el líder decide qué se corrige.

*Resultado:* Nadie tiene que vigilar a mano que el proceso se cumpla: la IA señala los negocios que se desvían, el líder decide qué se corrige y el equipo dedica su tiempo a probar mejoras en pilotos cortos.

- La mayoría de los negocios siguen el proceso como está escrito sin que nadie lo revise a mano, y el CRM lo muestra. `[1.1.O2 · comprobable · hábito · venta con equipo]`
- Las técnicas nuevas se prueban en pilotos de ciclo corto antes de sumarlas al proceso. `[1.1.O3 · declarado · hábito]`
- La IA corrige sola lo que se sale del proceso —crea la tarea que falta, completa el dato, reasigna el negocio— y el líder revisa en el CRM lo que no pudo resolver. `[1.1.O4 · comprobable]`

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra un lead o se cierra una venta?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir los leads, avisar qué toca, registrar las ventas y las conversaciones— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tu equipo pierde horas en tareas que el sistema podría hacer: los leads se enfrían mientras alguien decide a quién le tocan y, donde se vende sin vendedor, cada venta hay que pasarla a mano.

**Deficiente.** No hay un CRM: los leads y las ventas se anotan donde cada quien puede.

- Los leads viven en listas o agendas personales. `[1.2.D1 · evaluado]`
- No hay un CRM donde montar una automatización: los leads y las ventas se pasan por correo, por chat o de palabra, y nadie recibe avisos del sistema. `[1.2.D2 · comprobable]`

**Inicial.** Hay un CRM, pero todo se carga y se reparte a mano.

- Hay un CRM, pero nada pasa solo: los leads se reparten a mano y cada vendedor tiene que acordarse de sus seguimientos. `[1.2.I1 · comprobable · venta con equipo]`
- Las ventas que se cierran sin vendedor —en la tienda, en el sitio o por autoservicio— se pasan a mano al sistema, cuando alguien tiene tiempo. `[1.2.I2 · comprobable · venta sin vendedor]`

**Funcional.** Lo básico pasa solo —los leads se reparten por una regla, el sistema avisa qué toca y las ventas sin vendedor entran solas— y, si se usa IA, trabaja con los datos de cada cliente.

*Resultado:* Ningún lead se pierde por no saber a quién le toca y el vendedor deja de depender de su memoria para dar seguimiento; donde se vende sin vendedor, cada venta queda registrada sin que nadie la pase a mano.

- Los leads entrantes llegan a una bandeja o cola y se asignan por una regla simple: por turnos, por zona o según la fuente de donde llegan. `[1.2.F2 · comprobable · venta con equipo]`
- Cuando hay algo que hacer —por ejemplo, un lead nuevo asignado, una tarea que vence o un prospecto que respondió—, el sistema le avisa al vendedor sin que el líder se lo recuerde. `[1.2.F3 · comprobable · venta con equipo]`
- Si el equipo atiende a los prospectos por WhatsApp u otro canal conversacional, lo que cada vendedor habla por ahí queda en el sistema, aunque responda desde su teléfono. `[1.2.F4 · evaluado · hábito · venta con equipo]`
- Las ventas sin vendedor —en tienda, en el sitio web o por autoservicio— entran solas al sistema como negocios, con su monto, su canal y su fecha, y con su cliente cuando el comprador se identifica. `[1.2.F6 · comprobable · venta sin vendedor]`
- Si el equipo usa IA, esta tiene como contexto lo básico de cada cliente y prospecto: quién es, qué le interesa y en qué etapa está. `[1.2.F7 · declarado]`
- Si lo que se vende es limitado —unidades de un proyecto, cupos de un programa o existencias—, quien vende puede ver qué está disponible antes de ofrecerlo, en el CRM o en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8 · comprobable]`
- Las herramientas y los módulos que se pagan están en uso: ninguna licencia lleva más de un mes sin usarse. `[1.2.F9 · comprobable]`

**Eficiente.** Las secuencias se adaptan a cómo responde cada prospecto, los leads se asignan por varias condiciones, el CRM se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario.

*Resultado:* El vendedor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones se generan desde el sistema, no como documentos sueltos. `[1.2.E1 · comprobable · venta con equipo]`
- Hay secuencias de contacto de varios pasos que cambian según cómo responde el prospecto. `[1.2.E2 · comprobable]`
- Si la empresa usa un ERP u otro sistema donde vive su operación —facturación, pedidos, inventario—, el CRM está conectado con él. `[1.2.E3 · comprobable]`
- Hay un tablero en tiempo real de la conversión por etapa y por vendedor —o por canal, donde se compra sin vendedor—. `[1.2.E4 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar, resumir conversaciones o preparar una reunión—, y la IA trabaja con el contexto de los clientes y prospectos. `[1.2.E5 · evaluado · hábito · requiere 1.3.F9]`
- Los leads se asignan por varias condiciones o por capacidad y, si el equipo atiende por un canal conversacional, también las conversaciones, con control de quién ve y responde cada una. `[1.2.E6 · comprobable]`
- Si el equipo atiende por un canal conversacional, hay un tablero de las conversaciones: cuánto tarda la primera respuesta y cuántas quedan sin seguimiento. `[1.2.E7 · comprobable]`
- La IA propone respuestas según el contexto de cada conversación y el vendedor decide si las usa. `[1.2.E8 · comprobable]`

**Óptimo.** La IA califica, agenda y calcula qué negocios van a cerrar; el vendedor valida y se queda con las conversaciones que deciden la venta.

*Resultado:* El vendedor dedica su tiempo a las conversaciones que deciden la venta: la IA califica y agenda, y él trabaja con la probabilidad de cierre de cada negocio y con las respuestas que la IA le propone.

- La IA calcula la probabilidad de cierre de cada negocio; se ve en el CRM y el líder la revisa antes de usarla. `[1.2.O1 · comprobable]`
- Si el equipo atiende por un canal conversacional, agentes de IA califican ahí los leads con la definición de lead calificado y agendan reuniones a cualquier hora; le pasan al vendedor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que calificaron. `[1.2.O2 · comprobable · venta con equipo · requiere 1.6.F2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al CRM: el vendedor ve en la ficha, por ejemplo, el potencial de la cuenta, sin salir de su herramienta. `[1.2.O3 · comprobable · requiere 1.3.O4]`
- Si el equipo atiende por un canal conversacional, la IA responde sola ahí las conversaciones de rutina y el vendedor valida las de más valor; en el CRM queda cada conversación que atendió la IA. `[1.2.O4 · comprobable]`
- Si la empresa atiende por un canal conversacional, agentes de IA atienden ahí a los compradores y los llevan hasta el pago; una persona revisa lo que no pudieron resolver, y en el CRM queda cada conversación que atendió la IA. `[1.2.O5 · comprobable · venta sin vendedor]`

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tu pipeline antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: registros completos, el origen de cada negocio y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte del pipeline se arma a mano, cambia según quién lo arma y nadie sabe de dónde vino cada negocio.

**Deficiente.** Los datos están dispersos y nadie los cuida: no hay de dónde sacar un número confiable.

- No hay una regla de qué datos se registran ni de quién los corrige: cada vendedor llena lo que le parece y nadie revisa lo que falta. `[1.3.D1 · comprobable]`
- No se registra de qué canal vino cada negocio ni quién lo lleva: sacar un reporte confiable es imposible. `[1.3.D2 · comprobable]`
- No hay un registro de quiénes son los clientes: cada vez que se necesita la lista, hay que armarla a mano con hojas de cálculo y lo que guarda cada sistema. `[1.3.D3 · evaluado]`
- Los negocios ganados no quedan registrados con su monto y su fecha: no se sabe cuánto se vendió ni cuándo. `[1.3.D4 · comprobable]`

**Inicial.** Hay datos en el sistema, pero incompletos: el reporte del pipeline hay que corregirlo a mano antes de usarlo.

- Los datos se completan a mano de vez en cuando, o cuando alguien se acuerda, y los vacíos vuelven a aparecer. `[1.3.I1 · comprobable]`
- En los negocios que se crean hoy, el canal de donde vino cada uno se anota a mano, cuando alguien se acuerda, y en parte de ellos queda vacío. `[1.3.I2 · comprobable]`
- Los negocios que se crean hoy se registran, pero a algunos les falta la fecha de cierre, el monto o el responsable. `[1.3.I3 · comprobable]`

**Funcional.** El reporte del pipeline sale del sistema, sin armarlo a mano, y se le puede creer.

*Resultado:* El líder ve el estado real del pipeline cuando lo necesita, sin armar el reporte a mano, y sabe de dónde vino cada negocio.

- Todo negocio creado desde la puesta en marcha del pipeline actual tiene fecha de cierre, monto y responsable. `[1.3.F1 · comprobable]`
- Los duplicados están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[1.3.F2 · comprobable · riesgo · hábito]`
- Todo negocio creado desde la puesta en marcha del pipeline actual dice de qué fuente vino su contacto original. `[1.3.F3 · comprobable]`
- El reporte de pipeline se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4 · comprobable]`
- Se sabe qué parte de las ventas sin vendedor queda asociada a un cliente identificado, y ese número se revisa al menos una vez al mes. `[1.3.F8 · comprobable · hábito · venta sin vendedor]`
- El contexto que el área documentó —el cliente ideal, lo que se ofrece y, donde se vende con equipo, la definición de lead calificado— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[1.3.F9 · declarado · riesgo · hábito · requiere 1.5.F1, 1.6.F2, 1.5.F6]`
- Las personas a las que el equipo les escribe por WhatsApp o por correo aceptaron que les escriban. `[1.3.F10 · comprobable · riesgo]`

**Eficiente.** Aparece un pronóstico confiable y la ficha del cliente empieza a reunir lo que viene de otros sistemas.

*Resultado:* La empresa puede comprometer un número de ventas con confianza, porque el pronóstico se acerca a lo que de verdad pasa.

- Hay un pronóstico de ventas que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% del pronóstico. `[1.3.E1 · comprobable · hábito]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si la empresa usa otros sistemas —facturación, pedidos—, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3 · comprobable · requiere 1.2.E3]`
- La mayoría de las ventas sin vendedor quedan asociadas a un cliente identificado, no a un cliente genérico. `[1.3.E4 · comprobable · venta sin vendedor]`
- Los duplicados se detectan y se unen solos con reglas que definió el equipo, también los de la misma persona con otro correo o sin correo. `[1.3.E5 · comprobable]`

**Óptimo.** Un modelo de IA calcula el pronóstico y la vista 360° de cada cliente se mantiene al día sin trabajo manual.

*Resultado:* El pronóstico se anticipa a lo que va a pasar, cruzando lo comercial con la facturación y el servicio, y los datos están al día sin que nadie tenga que acordarse de actualizarlos.

- Cada lead, contacto y negocio se asocia solo, al entrar, con lo que ya había de esa persona o empresa; la IA resuelve los dudosos y una persona valida solo las excepciones que el CRM le marca. `[1.3.O1 · comprobable]`
- Un modelo de IA calcula el pronóstico con la historia de los negocios; se ve en el sistema y el líder lo revisa antes de comprometerlo. `[1.3.O2 · comprobable]`
- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, la facturación, los casos de servicio y las conversaciones. `[1.3.O3 · comprobable]`
- Ventas se apoya en el almacén central de datos de la empresa para su pronóstico, cruzando lo comercial con la facturación y el servicio. `[1.3.O4 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: la IA toma los datos de cada conversación, los completa y los corrige sola, las personas solo validan las excepciones que el CRM les marca, y queda qué se corrigió. `[1.3.O6 · comprobable]`

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, quién va bien y quién necesita ayuda?

*Descripción:* Mide si cada vendedor tiene un rol y una meta por escrito, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* El líder se entera tarde de lo que pasa y decide por intuición: los problemas aparecen cuando ya no hay tiempo de corregirlos.

**Deficiente.** Nadie tiene un rol claro y el líder apaga incendios: no hay metas, métricas ni rendición de cuentas.

- Cada vendedor trabaja sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1 · evaluado]`
- El líder apaga incendios: no hay métricas ni rendición de cuentas. `[1.4.D2 · evaluado]`

**Inicial.** Hay roles y algunos números, pero los números se arman a mano y el líder los revisa cuando puede.

- El líder revisa algunos números en hojas de cálculo, cuando tiene tiempo. `[1.4.I1 · declarado]`
- Los reportes de cómo opera el equipo se arman a mano. `[1.4.I2 · comprobable]`

**Funcional.** Cada vendedor tiene un rol y una meta por escrito, el líder sigue un tablero cada semana y en la revisión del pipeline cada quien rinde cuentas.

*Resultado:* Cada vendedor sabe qué se espera de él, y el líder sabe cada semana quién va bien y quién necesita ayuda, antes de que termine el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —valor del pipeline, negocios creados, tasa de cierre, volumen— y lo consulta al menos una vez por semana. `[1.4.F2 · evaluado · hábito · requiere 1.3.F4]`
- En la revisión del pipeline se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3 · evaluado · hábito · requiere 1.1.F5]`
- Cada vendedor —o cada canal, donde se compra sin vendedor— tiene una meta escrita, con un monto o una cantidad y un plazo. `[1.4.F4 · declarado]`
- Cada persona del equipo tiene su rol por escrito: de qué se encarga, qué decide sola y qué aprueba el líder. `[1.4.F6 · declarado]`
- El avance de cada vendedor —o de cada canal, donde se compra sin vendedor— contra su meta se reporta en una fecha fija, al menos una vez al mes. `[1.4.F7 · declarado · hábito]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y, si recibe leads de Marketing, acuerda con esa área las reglas del traspaso.

*Resultado:* Un vendedor nuevo produce más rápido, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa leads, el traspaso tiene reglas que se cumplen.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[1.4.E2 · declarado]`
- Si Marketing le pasa leads a Ventas, el SLA de traspaso está escrito y se sigue en el sistema: en cuánto tiempo se responde, qué calidad se espera del lead y por qué se puede rechazar. `[1.4.E3 · comprobable · venta con equipo · requiere 1.6.F2]`
- Lo que el equipo señala que no funciona —del proceso, del CRM o del material de venta— se anota, se revisa y se le responde a quien lo dijo. `[1.4.E4 · evaluado · hábito]`
- Si quien lidera el área no es la dirección general, le presenta cada mes los resultados contra la meta, con datos del sistema. `[1.4.E5 · declarado · hábito]`
- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo, cuánto margen deja cada canal y cuánto aporta cada vendedor. `[1.4.E6 · evaluado · hábito]`

**Óptimo.** La dirección decide con números de fondo, el líder y el equipo eligen cada trimestre qué probar en la venta, y está por escrito quién valida lo que hace la IA y qué puede decidir sola.

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal deja más margen, qué vendedor aporta más y cuánto vale cada cliente en el tiempo.

- Al menos una vez por trimestre, el líder y el equipo se reúnen a decidir qué probar en la venta y revisan cómo les fue con lo que probaron antes. `[1.4.O2 · declarado · hábito]`
- Hay responsables de validar lo que hace la IA en ventas, y lo que puede decidir sola está por escrito. `[1.4.O3 · declarado]`
- Hay responsables de cuidar la calidad de los datos de ventas: está por escrito quién corrige cada dato y cada cuánto se revisa. `[1.4.O4 · declarado]`

### Producción

#### 1.5 Propuesta y Coherencia

¿Cómo sabe alguien que entra a tu equipo a quién le venden y con qué mensaje?

*Descripción:* Mide si el equipo comparte cliente ideal y mensaje, si la propuesta llega igual con cualquier vendedor y, si se vende por más de un canal, si los precios y las condiciones son coherentes en todos.

*Costo de quedarse:* Cada vendedor cuenta una historia distinta y persigue clientes distintos: el mensaje y la propuesta que recibe el comprador dependen del vendedor que le toque.

**Deficiente.** Nadie puede decir quién es el cliente ideal, y cada vendedor arma su mensaje y su propuesta a su manera.

- Nadie puede decir con claridad quién es el cliente ideal, y lo que se le dice a cada prospecto cambia según quién lo atienda. `[1.5.D1 · evaluado]`
- No hay un formato de propuesta: cada vendedor arma la suya desde cero, y su calidad depende de quién le toque al cliente. `[1.5.D2 · evaluado · venta con equipo]`

**Inicial.** El cliente ideal y el mensaje están en la cabeza del líder o en un borrador, y cada vendedor los aplica a su manera.

- El líder sabe quién es el cliente ideal y hay un mensaje común, pero solo de palabra o en un borrador: cada vendedor los repite a su manera. `[1.5.I1 · evaluado]`
- Hay una plantilla de propuesta, pero cada vendedor la cambia o la usa a su manera. `[1.5.I2 · evaluado · venta con equipo]`
- Los precios, las promociones o las condiciones cambian según el canal sin que sea a propósito: el comprador encuentra en el sitio algo distinto de lo que ve en la tienda. `[1.5.I3 · comprobable · venta sin vendedor]`

**Funcional.** El cliente ideal está escrito, y el mensaje y la propuesta son los mismos con cualquier vendedor.

*Resultado:* Dos prospectos parecidos reciben el mismo mensaje y una propuesta igual de sólida, sin importar qué vendedor les toque ni por qué canal lleguen.

- Hay un documento con la definición del cliente ideal —a quién le sirve lo que vende el equipo— que cualquier vendedor puede consultar. `[1.5.F1 · declarado]`
- El líder puede explicar quién es el cliente ideal sin consultar su documentación. `[1.5.F2 · evaluado]`
- Un cliente que habla con dos vendedores recibe el mismo mensaje de valor base. `[1.5.F3 · evaluado · hábito · venta con equipo]`
- Las propuestas están estandarizadas: tienen una estructura común reconocible, no armada desde cero cada vez. `[1.5.F4 · declarado · venta con equipo]`
- Si se vende por más de un canal, los precios, las promociones y las condiciones son los mismos en todos, o la diferencia es a propósito y está escrita. `[1.5.F5 · comprobable]`
- Hay un documento con lo que se ofrece —qué resuelve cada solución y para quién— y el mensaje de valor con que se presenta. `[1.5.F6 · declarado]`

**Eficiente.** La propuesta de valor se distingue de la competencia y solo promete lo que se puede entregar.

*Resultado:* Los prospectos ven qué distingue a la empresa: la propuesta se diferencia de la competencia, dice lo mismo en el sitio, en las presentaciones y en boca del equipo, y promete lo que después se entrega.

- La propuesta de valor dice por escrito en qué se distingue de la competencia. `[1.5.E2 · declarado]`
- Las propuestas solo prometen lo que el equipo puede entregar: el alcance se valida antes de enviarlas. `[1.5.E3 · evaluado · hábito · venta con equipo]`
- Ese mensaje es el mismo en el sitio, en las presentaciones y en lo que dice el equipo. `[1.5.E4 · evaluado · hábito]`

**Óptimo.** La IA revisa contra la propuesta de valor todo lo que se le dice a cada prospecto, y el equipo valida lo que se sale.

*Resultado:* El mensaje no se diluye aunque el equipo crezca o cambie: la IA revisa cada mensaje contra la propuesta de valor vigente, marca lo que se sale y el equipo solo valida eso.

- La IA revisa en tiempo real, contra la propuesta de valor vigente, lo que se les dice a los prospectos, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1 · comprobable]`

#### 1.6 Priorización de Leads

¿Cómo decide tu equipo a qué leads dedicarles tiempo primero?

*Descripción:* Mide si el equipo decide a qué leads dedicar su tiempo con criterios escritos, basados en el cliente ideal.

*Costo de quedarse:* Tu equipo le dedica el mismo esfuerzo a quien nunca va a comprar que a quien está listo, y los mejores leads esperan su turno.

**Deficiente.** Los leads se atienden por orden de llegada: no hay ningún criterio para saber cuáles valen la pena.

- No hay criterios para distinguir un lead bueno de uno malo: se pierde tiempo en prospectos que nunca van a comprar. `[1.6.D1 · declarado]`

**Inicial.** Cada vendedor elige a ojo a qué leads dedicarse, según su experiencia o una lista que nadie actualiza.

- Los leads se separan en alguna lista o con una etiqueta, pero cada vendedor lo hace con su propio criterio. `[1.6.I1 · comprobable]`
- El líder sabe quién es el cliente ideal, pero el CRM no tiene los campos para separar los leads que encajan. `[1.6.I2 · comprobable]`

**Funcional.** Los leads se separan por los rasgos del cliente ideal y hay una definición escrita de lead calificado que el equipo aplica.

*Resultado:* El equipo deja de perder tiempo con prospectos que no encajan con el cliente ideal y concentra el esfuerzo en los que sí encajan y cumplen la definición de lead calificado.

- El equipo segmenta los leads por los atributos del cliente ideal antes de trabajarlos: en empresas, tamaño, industria o geografía; en personas, presupuesto, zona o lo que buscan. `[1.6.F1 · comprobable · hábito · venta con equipo · requiere 1.5.F1, 2.3.F2]`
- Hay una definición escrita de lead calificado: los criterios para aceptar un lead como SQL. `[1.6.F2 · declarado · venta con equipo]`
- Los vendedores dedican su esfuerzo a los leads que cumplen esa definición y encajan con el cliente ideal. `[1.6.F3 · evaluado · hábito · venta con equipo · requiere 1.5.F1]`
- Los rasgos del cliente ideal son campos del CRM y de los formularios. `[1.6.F4 · comprobable · venta con equipo · requiere 1.5.F1]`

**Eficiente.** Los leads se ordenan con un puntaje que suma varios rasgos, las cuentas objetivo están en una lista escrita y cada segmento recibe su propio mensaje.

*Resultado:* Cada vendedor sabe cada mañana a quién contactar primero, y las cuentas que más importan se trabajan de forma deliberada.

- Los vendedores usan mensajes y plantillas distintos para cada segmento. `[1.6.E3 · comprobable · hábito · venta con equipo]`
- Los vendedores trabajan primero los leads con más puntaje. `[1.6.E4 · comprobable · hábito · venta con equipo · requiere 2.6.E3]`
- Agentes de IA analizan todo lo que se sabe de cada lead —también sus señales de comportamiento digital y una probabilidad de compra calculada por un modelo— y proponen la siguiente mejor acción, que el vendedor ve en el CRM y decide si ejecuta. `[1.6.E5 · comprobable · venta con equipo]`
- Hay una lista escrita de cuentas objetivo, cada una con su responsable y su plan de contacto. `[1.6.E6 · comprobable · venta con equipo]`
- Los segmentos prioritarios están escritos y cada uno tiene su plan de contacto. `[1.6.E7 · comprobable · venta con equipo]`

**Óptimo.** La IA decide qué lead atender y qué hacer con él, con todo lo que se sabe de cada uno, y el vendedor valida.

*Resultado:* El vendedor sabe a quién atender, qué hacer y cuándo, con lo que saben Servicio y Marketing de cada cliente, incluido dónde hay riesgo o espacio para vender más.

- Si en la decisión de compra participan varias personas, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el vendedor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3 · comprobable · venta con equipo]`
- La priorización usa señales de Servicio y de Marketing —qué clientes expanden, refieren o se van— para decidir qué perfiles perseguir. `[1.6.O4 · evaluado · venta con equipo]`
- La IA ejecuta sola las acciones de rutina —recordatorios, reagendar, enviar material— y el vendedor valida las de los negocios de más valor; en el CRM queda qué hizo la IA en cada negocio. `[1.6.O5 · comprobable · venta con equipo]`

#### 1.7 Tracción del Negocio

¿Qué pasa en tu equipo cuando un negocio deja de avanzar?

*Descripción:* Mide si alguien detecta cuando un negocio deja de avanzar y si hay una respuesta acordada para reactivarlo a tiempo; donde el cliente vuelve a comprar, también si se le busca cuando su próxima compra se atrasa.

*Costo de quedarse:* Los negocios se enfrían en silencio: nadie ve cuándo dejaron de avanzar, y cuando alguien reacciona ya es tarde para recuperarlos.

**Deficiente.** Los negocios se enfrían sin que nadie lo note, y el vendedor no tiene apoyo del líder ni material para moverlos.

- El líder no se involucra en los negocios que se traban: cada vendedor se las arregla solo. `[1.7.D1 · evaluado]`
- Nadie se da cuenta de que un negocio dejó de avanzar hasta que ya se perdió. `[1.7.D2 · comprobable]`
- Los negocios no quedan registrados con su etapa y su última actividad, así que no hay cómo ver cuáles se detuvieron. `[1.7.D3 · comprobable]`
- No hay material de venta —presentaciones, casos de éxito, demos— para mostrarles a los prospectos. `[1.7.D4 · declarado · venta con equipo]`

**Inicial.** El líder ayuda solo cuando el vendedor lo pide, y cada vendedor reactiva sus negocios a su manera.

- Cuando un negocio se detiene, cada vendedor decide si insiste y cómo: no hay un paso acordado. `[1.7.I1 · evaluado]`
- El líder solo interviene cuando el vendedor le pide ayuda o cuando el negocio ya está casi perdido. `[1.7.I2 · evaluado]`
- Cada vendedor tiene su propio material de venta y lo arma a su manera. `[1.7.I3 · declarado · venta con equipo]`
- Todos los intentos de hacer avanzar un negocio se hacen por el mismo canal. `[1.7.I4 · comprobable]`

**Funcional.** Ningún negocio se enfría en silencio: se detecta a tiempo y hay un paso acordado para reactivarlo.

*Resultado:* Los negocios que se traban se detectan a tiempo y se reactivan por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Donde el cliente vuelve a comprar sin contrato, la próxima compra tampoco se deja al azar.

- Para cada etapa está definido cuánto tiempo sin avance vuelve estancado un negocio, y los estancados se reconocen a tiempo. `[1.7.F1 · comprobable · hábito]`
- La reactivación usa al menos dos canales, por ejemplo correo y llamada. `[1.7.F2 · comprobable · hábito]`
- El líder repasa los negocios estancados en cada revisión del pipeline y acuerda qué hacer con cada uno, sin esperar al cierre del trimestre. `[1.7.F3 · evaluado · hábito · venta con equipo · requiere 1.1.F5]`
- Hay material de venta estandarizado —presentaciones, casos de éxito, demos— que ayuda a cerrar las ventas. `[1.7.F4 · declarado · venta con equipo]`
- Los negocios estancados tienen un paso de reactivación acordado, no la improvisación de cada vendedor. `[1.7.F6 · evaluado · hábito]`
- Los clientes identificados que ya deberían haber vuelto a comprar, según el plazo de recompra que está escrito para cada tipo de cliente, se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos. `[1.7.F7 · comprobable · hábito · recompra · requiere 1.2.F6]`

**Eficiente.** El seguimiento combina varios canales, el sistema le avisa al líder de lo que se traba y el lead que no está listo sigue en nutrición.

*Resultado:* Ningún negocio espera a la reunión para recibir ayuda: el líder se entera cuando se traba, el lead que todavía no está listo sigue recibiendo contenido hasta que lo esté, y el vendedor encuentra el material de venta en un solo lugar.

- El seguimiento de los negocios que se enfrían combina al menos tres canales —por ejemplo, correo, llamada y el canal conversacional— en una secuencia definida. `[1.7.E1 · comprobable · requiere 1.2.E2]`
- Los leads que todavía no están listos para comprar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven al vendedor cuando muestran interés. `[1.7.E2 · comprobable · venta con equipo · requiere 1.4.E3]`
- El material de venta está en una biblioteca central, no en la computadora de cada vendedor. `[1.7.E3 · declarado · venta con equipo]`
- Cuando un negocio lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la revisión del pipeline. `[1.7.E4 · comprobable · venta con equipo · requiere 1.7.F1]`
- Los clientes con potencial de crecer que señala Servicio se trabajan como negocios, con responsable y siguiente paso. `[1.7.E5 · comprobable · relación continua · requiere 3.7.E1]`
- La IA detecta qué negocios de más valor se están trabando antes de que venza su plazo y propone a quién movilizar o qué contenido enviar; el líder decide, y todo queda en el CRM. `[1.7.E6 · comprobable]`
- Los recordatorios de recompra salen solos según el ciclo de cada cliente y se mide cuántos vuelven a comprar. `[1.7.E7 · comprobable · recompra]`

**Óptimo.** La IA detecta qué negocios de más valor se traban y decide el canal y el momento de cada seguimiento; el equipo valida.

*Resultado:* Los negocios de más valor reciben ayuda justo cuando la necesitan: la IA detecta cuándo se traban y propone a quién movilizar.

- La IA decide el canal y el momento de cada seguimiento, persona por persona y según cómo responde, dentro de los límites que fijó el equipo; el equipo revisa los resultados, y lo que decide la IA queda registrado en el CRM. `[1.7.O2 · comprobable · requiere 1.7.E1]`
- Con las reglas que fijó el líder, la IA actúa sola en los negocios de más valor que se traban —envía el contenido o avisa a quien corresponde— y el líder revisa en el CRM lo que hizo. `[1.7.O3 · comprobable]`

#### 1.8 Aprendizaje de Ganadas y Perdidas

¿Qué queda registrado cuando tu equipo pierde un negocio?

*Descripción:* Mide si queda registrado por qué se pierde cada negocio y si el equipo revisa lo que gana y lo que pierde para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes negocios: cada quien tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Deficiente.** Cuando se pierde un negocio, no se anota la razón: cada vendedor da su propia versión, de memoria.

- Cuando se pierde un negocio, no hay una razón en la que el equipo coincida: cada vendedor da su versión, de memoria. `[1.8.D1 · evaluado]`
- Los negocios perdidos se cierran sin anotar la razón. `[1.8.D2 · evaluado]`

**Inicial.** De los negocios perdidos se habla de vez en cuando, y la razón se anota a veces, a criterio de cada vendedor.

- La razón de pérdida se anota a veces y en texto libre, a criterio de cada vendedor, así que no se puede sumar. `[1.8.I1 · comprobable]`

**Funcional.** Cada negocio perdido queda con su razón, elegida de una lista fija, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué se pierden los negocios, con datos del trimestre y no con impresiones.

- Todo negocio creado desde la puesta en marcha del pipeline actual que se cerró como perdido tiene su razón de pérdida. `[1.8.F1 · comprobable]`
- Las razones de pérdida se eligen de una lista definida, no se escriben en texto libre. `[1.8.F2 · comprobable]`
- El líder puede sacar del sistema el reporte de las razones de pérdida del trimestre, sin armarlo a mano. `[1.8.F3 · comprobable]`

**Eficiente.** Cada trimestre se revisa por qué se gana y por qué se pierde, lo aprendido cambia el proceso y el equipo se capacita con un calendario fijo.

*Resultado:* Los errores que más se repiten se corrigen y lo que hace ganar se vuelve parte del proceso: lo que muestra la revisión de cada trimestre cambia el proceso y la capacitación del equipo.

- Al menos una vez por trimestre se revisan los negocios ganados y perdidos para encontrar lo que se repite. `[1.8.E1 · declarado · hábito]`
- El proceso o playbook se refina con base en lo aprendido. `[1.8.E2 · declarado · hábito · requiere 1.1.F4]`
- Hay capacitación comercial para el equipo con un calendario fijo, no solo cuando entra alguien nuevo. `[1.8.E3 · declarado · hábito · venta con equipo]`
- La IA propone correcciones al playbook a partir de lo que encuentra en las llamadas, y el líder decide cuáles se aplican; en el sistema queda cada propuesta y lo que se decidió con ella. `[1.8.E4 · comprobable · venta con equipo · requiere 1.1.E2]`

**Óptimo.** La IA analiza las llamadas con los prospectos y propone correcciones al playbook; el líder decide cuáles se aplican.

*Resultado:* Cada vendedor recibe recomendaciones sobre sus propias llamadas, el líder corrige el playbook con lo que encuentra la IA y la dirección ajusta la estrategia con esa evidencia.

- La IA analiza las llamadas con los prospectos —también las de video— y le deja a cada vendedor recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1 · comprobable · venta con equipo]`
- Los seguimientos que decide la IA se miden contra un grupo de control, y en el CRM se ve cuánto agregan; con eso el equipo revisa los límites que le fijó a la IA. `[1.8.O4 · comprobable · requiere 1.7.O2]`

---

## Área 2 — Marketing

Mide el rendimiento del área de Marketing: cómo opera internamente y qué produce hacia el mercado. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que la empresa dirige.

### Base operativa

#### 2.1 Procesos y Rutinas

¿Cómo se arma una campaña en tu equipo, desde que se decide hasta que se publica?

*Descripción:* Mide si las campañas salen con un proceso y un calendario compartidos, sin depender de quién las arma.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona se va, el marketing se detiene y hay que empezar de cero.

**Deficiente.** Cada quien arma las campañas a su manera: no hay calendario ni reuniones del equipo.

- No existe calendario editorial; las campañas se improvisan. `[2.1.D1 · declarado]`
- El equipo de marketing no se reúne: cada quien se entera de lo que hacen los demás cuando ya salió publicado. `[2.1.D2 · declarado]`
- Una agencia arma y publica las campañas, y nadie en la empresa decide qué sale ni lo revisa. `[2.1.D3 · evaluado]`

**Inicial.** Hay un calendario y algunas reuniones, pero se cumplen cuando se puede y las campañas dependen de quien las arma.

- Hay un calendario, pero se llena cuando se puede y se cumple a medias. `[2.1.I1 · declarado]`
- El equipo se reúne cuando surge algo, sin fecha fija ni temas definidos. `[2.1.I2 · declarado]`
- Las campañas dependen de quien las arma —una persona del equipo o la agencia—: el calendario, los accesos y los pasos a seguir están en sus manos. `[2.1.I3 · evaluado]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y las campañas siguen saliendo aunque cambie una persona: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada una sin tener que preguntar.

- Existe un calendario editorial visible para el equipo con horizonte de al menos un trimestre. `[2.1.F1 · declarado]`
- Existe un proceso de campaña escrito —del brief a la ejecución y la publicación— que el equipo aplica de forma consistente. `[2.1.F2 · evaluado · hábito]`
- Hay una reunión de resultados cada semana o cada quince días, y se sostiene. `[2.1.F3 · declarado · hábito]`
- El líder puede explicar qué campañas corren y en qué etapa sin preguntarle al equipo. `[2.1.F4 · evaluado]`
- Si una agencia ejecuta todo o parte del trabajo, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia la agencia. `[2.1.F5 · declarado]`
- Cualquier persona del equipo trabaja las campañas y los contactos en el sistema central, no en hojas sueltas: las herramientas de cada canal, como las de pauta, se usan para lo suyo, no como un registro aparte, y el equipo abre el sistema como herramienta de trabajo, no por obligación. `[2.1.F6 · evaluado · hábito]`

**Eficiente.** Cada pieza pasa por control de calidad y el líder vigila con datos que el proceso se cumpla.

*Resultado:* Cada pieza sale revisada antes de publicarse, y el líder sabe dónde se desvía el proceso y corrige con datos, no de memoria.

- El líder revisa con datos del sistema, no de memoria, que el proceso de campaña se cumpla. `[2.1.E4 · evaluado · hábito · requiere 2.1.F2]`
- Cada pieza pasa por una revisión con lista escrita y una aprobación registrada. `[2.1.E5 · comprobable · hábito]`

**Óptimo.** El sistema vigila que el proceso se cumpla y la IA se encarga de lo repetitivo; el equipo decide los ajustes.

*Resultado:* El equipo dedica su tiempo a la estrategia: la IA se encarga de lo repetitivo, y el sistema señala lo que se sale del proceso sin que nadie lo vigile.

- El sistema detecta por sí mismo cuando una campaña se sale del proceso —un paso que se saltó, una fecha que venció— y se lo avisa al líder y al responsable; el líder decide el ajuste, y cada aviso queda en el sistema. `[2.1.O4 · comprobable · requiere 2.1.F2]`
- El proceso de campaña se cumple sin que nadie lo vigile a mano: en el sistema se ve que cada campaña siguió sus pasos. `[2.1.O5 · comprobable · hábito · requiere 2.1.F2]`

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o te escribe por WhatsApp o el chat?

*Descripción:* Mide si las herramientas que se pagan se usan, si lo que entra llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Lo que entra por tu sitio o por mensajes espera a que alguien lo cargue y lo conteste, o se pierde, y si pagas herramientas, parte de lo que pagas no se usa.

**Deficiente.** No hay un sistema para marketing: los contactos viven en hojas y correos, y todo se hace a mano.

- No hay un sistema donde registrar los leads: se llevan en hojas de cálculo o en el correo. `[2.2.D1 · evaluado]`
- Lo que llega por el sitio o por mensajes cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2 · declarado]`
- Lo que entra por formularios o mensajes no recibe ninguna respuesta ni aviso automático: todo se hace a mano. `[2.2.D3 · comprobable]`

**Inicial.** Hay herramientas, pero se usan a medias: se pagan licencias o módulos que nadie usa y parte de lo que entra se pasa a mano.

- Se pagan licencias o módulos que el equipo no usa. `[2.2.I1 · comprobable]`
- Algunos formularios del sitio no están conectados al sistema, o ninguno de los canales conversacionales por los que se atiende lo está: lo que entra por ahí se pasa a mano o se pierde. `[2.2.I2 · comprobable]`
- Hay alguna automatización, pero quedó a medias: algunos formularios responden solos y otros no le avisan a nadie. `[2.2.I3 · comprobable]`

**Funcional.** Las herramientas que se pagan se usan, lo que entra llega solo al sistema y recibe respuesta, y si el equipo usa IA, esta conoce la voz de marca y los buyer personas.

*Resultado:* Todo lo que entra por el sitio y, si se usa, por WhatsApp o el chat, llega al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Las herramientas y los módulos que se pagan están en uso: ninguna licencia lleva más de un mes sin usarse. `[2.2.F2 · comprobable]`
- Si el sitio tiene formularios para dejar datos, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3 · comprobable]`
- Si la empresa atiende por un canal conversacional —WhatsApp o el chat del sitio—, al menos uno está conectado al sistema con una bandeja básica donde se atiende lo que entra, lo atienda Marketing o Ventas. `[2.2.F4 · comprobable]`
- Si el sitio tiene formularios, cuando alguien envía uno el sistema le responde automáticamente. `[2.2.F5 · comprobable]`
- Si el equipo usa IA, esta tiene como contexto la voz de marca y los buyer personas. `[2.2.F9 · comprobable · requiere 2.5.F2, 2.5.F3]`
- Si el sitio tiene formularios, cuando alguien envía uno el sistema le avisa a quien corresponde, sin que nadie se lo pase. `[2.2.F10 · comprobable]`
- Todo contacto que llega, venga por donde venga, queda registrado en el sistema el mismo día. `[2.2.F11 · comprobable]`

**Eficiente.** Las herramientas están integradas, las automatizaciones siguen reglas de varios pasos y la IA ayuda al equipo en su trabajo diario.

*Resultado:* Los leads reciben su nutrición sin que nadie la mande a mano, hasta que están listos para comprar —o para hablar con un vendedor, donde los hay—; la conversación con cada contacto no depende de que alguien se acuerde de escribirle, y, si se atiende por WhatsApp o chat, el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nutrición de varios pasos, con tiempos de espera y caminos distintos según quién es o lo que hace cada persona. `[2.2.E1 · comprobable]`
- Si el canal conversacional, como WhatsApp, es parte del plan de canales, sus campañas están automatizadas, con segmentación y con caminos distintos según lo que hizo la persona: si leyó, hizo clic o respondió. `[2.2.E2 · comprobable · requiere 2.6.F5]`
- El traspaso de leads a Ventas es automático: cuando un lead cumple los criterios de MQL, le llega con su historial al vendedor que corresponde, sin que nadie lo pase a mano. `[2.2.E3 · comprobable · venta con equipo · requiere 2.6.F4]`
- Si la empresa atiende por más de un canal conversacional, todos llegan a una sola bandeja. `[2.2.E4 · comprobable]`
- Si la empresa usa landing pages en sus campañas, se crean en el CMS conectado al sistema central, no en herramientas sueltas. `[2.2.E5 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar piezas, resumir resultados o preparar una campaña—, y la IA trabaja con el contexto del área: los buyer personas, los segmentos y la voz de marca. `[2.2.E6 · evaluado · hábito · requiere 2.3.F6]`
- Si la empresa atiende por un canal conversacional, hay un tablero en tiempo real de las conversaciones que generan las campañas: cuánto tarda la primera respuesta y cuántas quedan sin respuesta. `[2.2.E7 · comprobable · requiere 2.2.F4]`
- Si los contactos nacen o viven en otro sistema —una plataforma de la industria, la tienda, un ERP—, ese sistema está integrado con el de marketing y los datos pasan solos, sin cargarlos a mano. `[2.2.E8 · comprobable]`

**Óptimo.** La IA decide el recorrido de cada contacto y, si se atiende por WhatsApp o chat, conversa con él; el equipo fija los límites y revisa los resultados.

*Resultado:* Cada contacto vive un recorrido pensado para él: la IA decide el siguiente mensaje con lo que la empresa sabe de él en todos sus sistemas y, si se atiende por WhatsApp o chat, conversa con él en el momento.

- La IA decide qué mensaje recibe cada persona, por qué canal y en qué momento, dentro de las metas y los límites que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué decidió la IA para cada persona. `[2.2.O1 · comprobable · requiere 2.6.E7]`
- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada contacto: la segmentación usa, por ejemplo, el valor real de cada cliente calculado afuera. `[2.2.O3 · comprobable · requiere 2.3.O1]`
- La IA hace las tareas repetitivas de cada campaña —preparar el brief, adaptar las piezas, cargarla en el calendario—, el responsable valida lo que hizo, y en el sistema se ve qué tareas hizo la IA. `[2.2.O4 · comprobable]`
- Si la empresa atiende por un canal conversacional, agentes de IA responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para comprar —o para hablar con un vendedor, donde los hay—, y lo que la persona responde alimenta su ficha; lo que no pueden resolver pasa a una persona con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O5 · comprobable · requiere 2.2.F4]`
- El equipo crea segmentos y recorridos describiéndolos en palabras y consulta los resultados en lenguaje natural; una persona aprueba antes de publicar. `[2.2.O6 · comprobable]`

#### 2.3 Datos

¿Cómo sabes cuántos leads entran, de dónde vienen y cuántos se convierten?

*Descripción:* Mide si los datos de marketing son confiables: de dónde viene cada lead, en qué etapa está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de dónde viene cada lead ni cuántos se convierten: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle.

**Deficiente.** No se sabe de dónde viene cada lead, y cada número hay que armarlo desde cero.

- No se registra de dónde llegó cada lead: nadie sabe si vino por el sitio, una feria o una recomendación. `[2.3.D1 · comprobable]`
- No hay reportes de marketing: cuando alguien pide un número, hay que buscarlo en correos y hojas sueltas. `[2.3.D2 · comprobable]`

**Inicial.** Los datos están en el sistema, pero los reportes se arman a mano y la limpieza se hace cuando alguien se acuerda.

- No hay una regla de cuándo se limpian los datos: se corrigen a mano cuando alguien nota un problema, y a muchos contactos les faltan los datos que describen al cliente ideal. `[2.3.I1 · comprobable]`
- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los leads le falta el origen. `[2.3.I2 · comprobable]`

**Funcional.** Cada lead tiene su origen y su etapa, y los reportes salen del sistema sin armarlos a mano.

*Resultado:* El líder sabe de dónde viene cada lead, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, una conversación, un portal o una compra— tiene su etapa del ciclo de vida y su origen. `[2.3.F1 · comprobable]`
- Las propiedades que describen al cliente ideal —en empresas, la industria, el nombre de la empresa y el rol de la persona; en personas, lo que define a cada segmento— se piden donde entran los leads —en los formularios o, si no hay formularios, donde se capturan sus datos—. `[2.3.F2 · comprobable · requiere 2.2.F3]`
- Los duplicados están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3 · comprobable · riesgo · hábito]`
- Los reportes básicos —cuántos leads entran, de dónde vienen y cuántos se convierten— salen del sistema sin armarlos a mano. `[2.3.F5 · comprobable]`
- El contexto que el área documentó —buyer personas, segmentos, voz de marca— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6 · declarado · riesgo · hábito · requiere 2.5.F2, 2.5.F3, 2.6.F5]`
- Esas propiedades están completas en la mayoría de los registros. `[2.3.F8 · comprobable]`
- El permiso de cada contacto está registrado por canal —correo, SMS, WhatsApp, notificaciones— y se respeta en cada envío. `[2.3.F9 · comprobable · riesgo]`

**Eficiente.** Los datos se completan solos, los duplicados se unen solos y se sabe qué aportó cada canal a cada venta.

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta, no solo cuál trajo el primer clic.

- Los datos de cada contacto se completan solos con servicios de terceros, más allá de lo que la persona escribió. `[2.3.E1 · comprobable]`
- La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último. `[2.3.E2 · comprobable]`
- Se sabe cuánto ingreso deja cada canal, también el conversacional si se usa. `[2.3.E5 · comprobable · requiere 2.2.F4]`
- Los duplicados se detectan y se unen solos con reglas que definió el equipo, también los de la misma persona con otro correo o sin correo. `[2.3.E6 · comprobable]`
- Lo que la persona hace en el sitio o la app —qué visita, busca, abandona, compra o reserva— queda en su ficha, también lo que hizo antes de dejar sus datos, que se une al identificarse. `[2.3.E7 · comprobable]`

**Óptimo.** Los datos se capturan y se corrigen solos, cada persona tiene una sola ficha con todo lo que hace, y el equipo solo valida las excepciones.

*Resultado:* La atribución toma en cuenta todo lo que pasa en la empresa, no solo lo que ve Marketing, y los datos se mantienen confiables sin corregirlos a mano: el equipo solo valida las excepciones.

- Marketing se apoya en el almacén central de datos de la empresa, donde se junta la información de todas las herramientas, y sus reportes de atribución salen de esa vista completa. `[2.3.O1 · comprobable]`
- Cada persona tiene una sola ficha que junta al momento lo que hace en todos los canales. `[2.3.O5 · comprobable · requiere 2.3.E6, 2.3.E7]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: la IA toma los datos de cada contacto, los completa y los corrige sola, las personas solo validan las excepciones, y en el sistema queda qué se corrigió y de dónde salió. `[2.3.O6 · comprobable]`

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por sus resultados?

*Descripción:* Mide si cada persona sabe qué le toca, si el equipo tiene metas y si decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Las decisiones de marketing se toman por costumbre o por quien insiste más, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Deficiente.** Nadie responde por el marketing: no hay roles, metas ni revisión de resultados.

- Nadie tiene el marketing como responsabilidad propia: se hace en los ratos libres de quien pueda. `[2.4.D1 · declarado]`
- Qué hacer se decide sobre la marcha, sin metas ni números. `[2.4.D2 · evaluado]`
- Nadie revisa los resultados de marketing: ni el equipo ni la dirección. `[2.4.D3 · declarado]`

**Inicial.** Hay roles, pero no están escritos: lo del día a día espera a la dirección, y los resultados se revisan de vez en cuando, sin metas.

- Los roles no están escritos, así que hasta lo del día a día —qué publicar, qué pieza aprobar— espera a que lo resuelva la dirección general. `[2.4.I1 · evaluado]`
- Los resultados se revisan de vez en cuando, pero no hay metas contra las cuales compararlos ni acuerdos que se sigan. `[2.4.I2 · evaluado]`

**Funcional.** Cada uno sabe qué le toca, hay metas, y las decisiones y la rendición de cuentas se hacen con números del sistema.

*Resultado:* El equipo sabe qué se espera de cada uno, las decisiones se defienden con números y no con opiniones, y la dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo.

- El líder tiene un tablero con 4 a 6 métricas clave —cuántos leads entran, de dónde vienen, cuántos se convierten y, donde hay vendedores, cuántos llegan a MQL— y lo consulta al menos una vez por semana. `[2.4.F2 · evaluado · hábito · requiere 2.3.F5]`
- El equipo tiene metas mensuales o trimestrales, y en la reunión de resultados rinde cuentas por ellas. `[2.4.F3 · evaluado · hábito · requiere 2.1.F3]`
- Las decisiones sobre qué hacer y en qué enfocarse citan datos del sistema, no opiniones. `[2.4.F4 · evaluado · hábito]`
- Cualquier persona del equipo sabe hacer sin ayuda externa las tareas de todos los días en el sistema, como armar una lista, enviar un correo o sacar un reporte, también cuando una agencia ejecuta todo o parte del trabajo. `[2.4.F5 · evaluado]`
- Cada persona del equipo tiene su rol por escrito: de qué se encarga, qué decide sola y qué aprueba el líder. `[2.4.F7 · declarado]`

**Eficiente.** El liderazgo prepara a quien entra, escucha al equipo y, donde hay vendedores, acuerda reglas con Ventas y con Servicio.

*Resultado:* Una persona nueva se integra rápido y, donde hay vendedores, Marketing trabaja con reglas acordadas con Ventas y con Servicio en vez de discutir cada vez quién se hace cargo de un lead o de un cliente.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[2.4.E2 · declarado]`
- Si quien lidera el área no es la dirección general, le presenta cada mes los resultados contra la meta, con datos del sistema. `[2.4.E5 · declarado · hábito]`
- El equipo señala lo que el sistema debería hacer distinto, y el líder revisa y responde cada pedido. `[2.4.E6 · evaluado · hábito]`
- El líder de marketing acuerda con Servicio qué clientes se vuelven casos de éxito o referidos y cómo se los invita. `[2.4.E7 · declarado · hábito]`
- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —el valor de vida de los clientes que trae— frente a lo que cuesta. `[2.4.E8 · evaluado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar los datos, y lo que la IA puede decidir sola está por escrito.

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide según lo que dejan con el tiempo los clientes que trae cada canal, frente a lo que cuesta traerlos.

- Hay responsables de validar lo que produce la IA en marketing. `[2.4.O1 · declarado]`
- El líder dedica su tiempo a la estrategia y a mejorar el sistema, no a ejecutar campañas. `[2.4.O2 · evaluado · hábito]`
- Hay responsables de cuidar la calidad de los datos de marketing: está por escrito quién corrige cada dato y cada cuánto se revisa. `[2.4.O5 · declarado]`
- Lo que la IA puede decidir sola en marketing está por escrito. `[2.4.O6 · declarado]`

### Producción

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza para publicar?

*Descripción:* Mide si la marca se ve y suena igual en todo lo que sale, si está escrito a quién le habla y si el sitio aparece en buscadores.

*Costo de quedarse:* Cada pieza se ve y suena distinta a la anterior, tu mensaje no le habla a nadie en particular y los buscadores muestran mal tu sitio, o no lo muestran.

**Deficiente.** No hay nada escrito sobre la marca: cada pieza sale como la arma quien la hace.

- No hay una guía de marca: ni logo, colores y tipografía definidos, ni una forma de escribir acordada. `[2.5.D1 · declarado]`
- No está escrito a quién le habla la empresa: no hay buyer personas. `[2.5.D2 · declarado]`
- El sitio no está preparado para buscadores: sus páginas no tienen título ni descripción, o no hay sitio. `[2.5.D3 · comprobable]`

**Inicial.** Hay logo y colores, pero la voz, los buyer personas y el sitio quedaron a medias, y el contenido propio sale cuando alguien tiene tiempo.

- Hay logo, colores y plantillas, pero el buyer persona es uno solo y tan general que sirve para cualquiera. `[2.5.I1 · declarado]`
- Solo algunas páginas del sitio tienen título y descripción, o el sitio carga mal en el celular o tiene enlaces rotos. `[2.5.I2 · comprobable]`
- Se publica contenido propio —artículos, videos o guías— de vez en cuando, cuando alguien tiene tiempo, sin una frecuencia fija. `[2.5.I3 · comprobable]`

**Funcional.** La marca, la voz y los buyer personas están escritos y se usan, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes.

*Resultado:* La marca se ve y suena igual en todo lo que sale, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Existe un kit de marca (logo, colores, tipografía) que cualquiera del equipo puede consultar. `[2.5.F1 · declarado]`
- Existe una guía corta de voz de marca, escrita. `[2.5.F2 · declarado]`
- Hay 2 o 3 buyer personas escritos. `[2.5.F3 · declarado]`
- El sitio cumple lo básico para buscadores: cada página tiene título y descripción, se puede indexar, carga bien en el celular y no tiene enlaces rotos. `[2.5.F4 · comprobable]`
- Se publica al menos una vez por mes contenido propio que queda disponible —en el sitio, en un canal de video o en guías—, no solo publicaciones en redes. `[2.5.F5 · comprobable · hábito]`
- Las piezas del último trimestre aplican la guía de voz de marca. `[2.5.F6 · evaluado · hábito]`
- Cada buyer persona tiene escrito su recorrido de compra básico, etapa por etapa. `[2.5.F7 · declarado]`

**Eficiente.** La presencia se afina por segmento y se prepara para buscadores y para asistentes de IA.

*Resultado:* La empresa aparece cuando sus clientes buscan lo que ofrece, tanto en buscadores como en asistentes de IA, con contenido pensado para cada segmento que importa, y cada reseña de sus clientes, buena o mala, recibe respuesta.

- Si el contenido propio se publica en el sitio, está organizado por temas: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2 · comprobable]`
- El contenido está preparado para aparecer como respuesta en los asistentes de IA y en los buscadores que contestan preguntas, y se mide cuántas veces aparece. `[2.5.E3 · comprobable]`
- El recorrido de compra está dibujado de punta a punta, con los puntos de contacto de cada etapa. `[2.5.E4 · declarado]`
- Se le pide una reseña pública a cada cliente después de la compra o la entrega, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo. `[2.5.E6 · comprobable · hábito]`

**Óptimo.** La IA produce y ajusta el contenido de forma continua, también para los asistentes de IA, y el equipo valida cada pieza antes de publicarla.

*Resultado:* La presencia se mantiene vigente sin que el equipo escriba cada pieza: la IA produce y ajusta el contenido para cada tipo de cliente y cada forma de buscar, y el equipo lo aprueba.

- La IA produce y ajusta el contenido de forma continua —también para la búsqueda conversacional y los asistentes de IA—; el equipo valida cada pieza antes de publicarla, y en el sistema se ve qué produjo o cambió la IA y quién lo aprobó. `[2.5.O2 · comprobable]`

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un prospecto según el tipo de cliente que es?

*Descripción:* Mide si cada prospecto recibe un mensaje pensado para su segmento, o si todos reciben lo mismo.

*Costo de quedarse:* Le hablas igual a todos, así que no le hablas bien a nadie: el mensaje genérico no convence a ningún segmento.

**Deficiente.** No hay segmentos: todos reciben el mismo mensaje, y a lo sumo cambia el nombre en el saludo.

- No hay segmentos: las campañas salen a toda la base con el mismo mensaje. `[2.6.D1 · comprobable]`
- Los correos son iguales para todos: a lo sumo cambia el nombre en el saludo. `[2.6.D2 · comprobable]`

**Inicial.** La base se separa por datos sueltos, como el país, y el mensaje casi no cambia de un grupo a otro.

- La base se separa solo por datos generales —país, ciudad o edad—, no por lo que cada grupo necesita. `[2.6.I1 · comprobable]`
- Hay listas separadas, pero casi todas las campañas salen con la misma pieza para todas. `[2.6.I2 · comprobable]`

**Funcional.** Hay segmentos escritos, piezas pensadas para cada uno y, donde hay vendedores, criterios escritos para clasificar los leads.

*Resultado:* Cada segmento recibe un mensaje pensado para él y, donde hay vendedores, Ventas recibe leads que Marketing ya clasificó con criterios escritos.

- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento. `[2.6.F3 · comprobable · hábito]`
- Existen criterios escritos de qué es un suscriptor, un lead y un MQL, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios. `[2.6.F4 · comprobable · hábito · venta con equipo]`
- Existen al menos 2 segmentos con criterios escritos que salen de los buyer personas —qué necesita o cómo decide cada grupo—, no solo de dónde está. `[2.6.F5 · declarado · requiere 2.5.F3]`

**Eficiente.** Los segmentos y el puntaje de leads se arman solos, y el mensaje se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los leads con más probabilidad de comprar se distinguen del resto: donde hay vendedores, Ventas los recibe primero.

- Hay secuencias distintas por segmento o por etapa del recorrido de compra. `[2.6.E1 · comprobable · requiere 2.2.E1]`
- El contenido se adapta por segmento de forma automática. `[2.6.E2 · comprobable]`
- Hay un puntaje de leads por reglas: un modelo que suma puntos por varios datos de cada persona, como su perfil o lo que hizo, y la clasifica al pasar un umbral —como MQL, donde hay vendedores—. No es la clasificación de Funcional, que responde al valor de una propiedad, sin modelo de puntaje detrás. `[2.6.E3 · comprobable]`
- El puntaje de leads dispara las secuencias de nutrición: al pasar el umbral, la persona entra a la secuencia que le corresponde. `[2.6.E5 · comprobable · requiere 2.2.E1]`
- Cada segmento prioritario tiene su buyer persona escrito. `[2.6.E6 · declarado]`
- La segmentación usa datos de comportamiento —qué abrió, qué visitó, qué compró—, no solo lo que la persona declaró, y los segmentos se actualizan solos. `[2.6.E7 · comprobable]`

**Óptimo.** La IA predice qué va a hacer cada persona y el contenido cambia según su comportamiento.

*Resultado:* Cada persona ve el contenido que le corresponde según lo que hizo antes, sin que nadie tenga que armar un segmento para ella.

- La IA predice quién va a comprar y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1 · comprobable]`
- Hay personalización uno a uno: la IA cambia en tiempo real los mensajes y el contenido de marketing que ve cada persona según lo que hizo antes, dentro de las reglas que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué versión vio cada persona. `[2.6.O3 · comprobable · requiere 2.3.E7]`
- Hay buyer personas para grupos muy chicos de clientes —o, cuando se vende a empresas, para cada cuenta importante—, no solo para los segmentos grandes. `[2.6.O4 · declarado]`

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por los canales que usas?

*Descripción:* Mide si los canales que la empresa eligió salen con regularidad, bajo un mismo plan y con un costo conocido.

*Costo de quedarse:* Llegas al mercado a ratos, o no llegas, sin un plan que coordine tus canales, y no sabes cuánto te cuesta cada lead que traen.

**Deficiente.** No hay canales activos ni un plan que diga por cuáles salir: la empresa no sale al mercado por ningún canal.

- No hay canales activos: la empresa no sale al mercado por ningún canal —ni redes, ni correo, ni pauta, ni mensajes, ni eventos—. `[2.7.D1 · comprobable]`
- No hay un plan que diga por qué canales sale la empresa. `[2.7.D2 · declarado]`

**Inicial.** Hay canales activos, pero cada uno sale por su cuenta y cuando alguien tiene tiempo.

- Los canales por donde más sale la empresa publican sin ritmo fijo: cuando alguien se acuerda o le queda un rato. `[2.7.I1 · comprobable]`
- La pauta y los correos salen cuando hay algo que promocionar, sin presupuesto ni fechas fijados de antemano. `[2.7.I2 · comprobable]`
- Cada canal va por su cuenta: no hay calendario común ni campaña que los atraviese. `[2.7.I3 · declarado]`

**Funcional.** Los canales que la empresa eligió salen con regularidad y bajo un mismo plan.

*Resultado:* Una campaña sale coordinada por todos los canales del plan en vez de esfuerzos sueltos, y el líder ve cuánto le cuesta cada lead según el canal del que venga.

- Si el correo es parte del plan de canales, sale con cadencia regular —al menos una vez por mes— y se sostiene. `[2.7.F1 · comprobable · hábito]`
- Si las redes sociales son parte del plan de canales, al menos una se maneja con calendario y publica con la frecuencia que ese calendario fija. `[2.7.F2 · comprobable · hábito]`
- Si el canal conversacional, como WhatsApp, es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario, no solo para responder lo que entra. `[2.7.F4 · comprobable · hábito · requiere 2.2.F4, 2.3.F9]`
- Los canales que la empresa eligió en su plan siguen el mismo calendario y la misma campaña: una promoción sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5 · declarado · hábito · requiere 2.1.F1]`
- En el sistema se ve cuánto costó cada lead —o cada venta, donde se compra sin vendedor— el último mes, al menos por canal. `[2.7.F6 · comprobable · requiere 2.3.F1]`
- Existe un plan escrito que dice por qué canales sale la empresa y con qué frecuencia sale cada uno. `[2.7.F7 · declarado]`
- Si la pauta pagada es parte del plan de canales, en el último trimestre corrió al menos una campaña con presupuesto definido. `[2.7.F8 · comprobable]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, y el presupuesto se mueve según lo que cuesta cada lead o cada venta en cada canal.

*Resultado:* La inversión se mueve hacia el canal que mejor rinde, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Si los webinars o los eventos son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2 · declarado · hábito]`
- El presupuesto entre canales se revisa al menos una vez por mes y se mueve según lo que cuesta cada lead o cada venta en cada canal. `[2.7.E3 · comprobable · hábito · requiere 2.7.F6]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar, y cada referido queda registrado con quién lo trajo. `[2.7.E4 · comprobable]`
- Si hay app, sus notificaciones son parte de las campañas, con el permiso de cada persona. `[2.7.E5 · comprobable]`
- Al menos tres canales —también el conversacional, si se usa— se coordinan en un mismo recorrido: uno continúa lo que empezó otro, con un límite de frecuencia y respetando el permiso de cada canal. `[2.7.E6 · comprobable]`
- Hay remarketing activo: quien visitó el sitio o mostró interés vuelve a ver la oferta en otros canales. `[2.7.E7 · comprobable]`
- Las audiencias de las campañas se arman desde el CRM, no a mano en cada herramienta. `[2.7.E8 · comprobable]`
- Se prueban canales nuevos —creadores de contenido, comunidades, formatos nuevos— en ciclos de dos meses o menos. `[2.7.E9 · declarado · hábito]`

**Óptimo.** La IA mueve el presupuesto entre canales dentro de los límites que fija el equipo, y se prueban canales nuevos de forma continua.

*Resultado:* La inversión se reparte sola donde más retorna, dentro de los límites que fija el equipo; los clientes satisfechos traen clientes nuevos, y la empresa prueba canales nuevos sin esperar a ver qué hace la competencia.

- La IA mueve el presupuesto entre canales sola, hacia donde más retorna y dentro de los límites que fijó el equipo; el líder revisa los resultados, y en el sistema queda cada cambio con su razón. `[2.7.O2 · comprobable · requiere 2.3.E2]`
- Los clientes que Servicio identifica como promotores se vuelven un canal de referidos y casos de éxito sin pedirlos a mano: el sistema los invita solo, el equipo elige qué casos se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4 · comprobable]`

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada campaña cuando termina?

*Descripción:* Mide si cada campaña deja sus resultados a la vista y un aprendizaje, para no repetir lo que no funcionó.

*Costo de quedarse:* Repites lo que no funciona porque nadie anota qué funcionó y qué no: cada campaña empieza de cero, sin saber qué dejó la anterior.

**Deficiente.** Las campañas terminan y nadie sabe qué dejaron: no se mide ni se anota nada.

- Nadie vuelve a mirar una campaña después de lanzarla: sale y ahí queda. `[2.8.D1 · evaluado]`
- No se mide qué trajo cada campaña: solo se sabe lo que se gastó, o ni eso. `[2.8.D2 · comprobable]`
- No queda registro de cómo le fue a cada campaña. `[2.8.D3 · evaluado]`

**Inicial.** Se mide tarde y a mano, y lo aprendido no queda escrito.

- Se miran clics, alcance y me gusta, no los leads ni las ventas que trajo cada campaña. `[2.8.I1 · comprobable]`
- Para saber cómo le fue a una campaña, alguien junta los números a mano en una hoja, semanas después de que terminó. `[2.8.I2 · evaluado]`

**Funcional.** Los resultados de cada campaña están a la vista, y cada una deja una revisión de cierre.

*Resultado:* El equipo ve cómo le fue a cada campaña sin armar el número a mano, y cada una deja una lección escrita para la siguiente.

- Cada campaña del calendario —no cada publicación suelta— cierra con una revisión escrita de qué funcionó y qué no. `[2.8.F3 · declarado · hábito]`
- Los resultados de cada campaña —los leads o las ventas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5 · comprobable · requiere 2.3.F1]`

**Eficiente.** Probar es rutina: hay pruebas cada mes, y lo que muestran cambia cómo se arma la siguiente campaña.

*Resultado:* El equipo sabe qué creatividades y audiencias funcionan porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma la siguiente campaña.

- El proceso de campaña se refina con base en lo aprendido. `[2.8.E3 · declarado · hábito · requiere 2.1.F2]`
- La planificación de las campañas siguientes se ajusta con lo aprendido: las nuevas se arman con lo que mostraron las pruebas y las revisiones de cierre. `[2.8.E4 · declarado · hábito · requiere 2.8.F3]`
- Hay pruebas A/B regulares —al menos una activa por mes—, cada una con su hipótesis escrita y su resultado registrado. `[2.8.E5 · comprobable · hábito]`

**Óptimo.** La IA ajusta las campañas mientras corren, dentro de los límites que fija el equipo, sin esperar al cierre.

*Resultado:* Las campañas mejoran mientras están corriendo, no recién cuando terminan.

- La IA ajusta las campañas mientras corren —deja de mostrar la versión que no funciona y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2 · comprobable]`
- Los mensajes que decide la IA se miden contra un grupo de control, y en el sistema se ve cuánto agregan; con eso el equipo revisa los límites que le fijó a la IA. `[2.8.O3 · comprobable · requiere 2.2.O1]`

---

## Área 3 — Servicio

Mide el rendimiento del área de Servicio, que cubre todo lo que pasa después de la venta: desde la atención de casos hasta que el cliente logre el resultado por el que compró. Mira cómo opera internamente y qué produce hacia el cliente.

### Base operativa

#### 3.1 Procesos y Rutinas

¿Cómo se atiende un caso en tu equipo, desde que entra hasta que se cierra?

*Descripción:* Mide si la atención sigue un proceso y rutinas definidas, para que la calidad no dependa de quién sabe.

*Costo de quedarse:* El servicio depende de quién sabe: si esa persona falta, la calidad se cae y los clientes lo notan de inmediato.

**Deficiente.** No hay un proceso de atención: cada agente resuelve los casos a su manera.

- Cada agente atiende los casos a su manera. `[3.1.D1 · evaluado]`
- El equipo no tiene reuniones ni rutinas de trabajo: cada agente se organiza por su cuenta. `[3.1.D2 · declarado]`

**Inicial.** Hay un flujo de atención, pero se sigue de palabra y depende de quién atienda.

- Hay un flujo que el equipo sigue de palabra, sin configurar ni escribir. `[3.1.I1 · declarado]`
- Todavía se depende de héroes: cuando falta la persona que sabe, los casos se traban. `[3.1.I2 · evaluado]`
- Unos agentes atienden en el sistema; otros siguen con sus canales personales. `[3.1.I3 · evaluado]`
- El equipo se reúne cuando puede, sin una fecha fija, y las reuniones se cancelan cuando hay mucho trabajo. `[3.1.I4 · declarado]`

**Funcional.** El equipo atiende en un mismo sistema, con etapas de la recepción al cierre, y cada cliente tiene quién responda por él.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada cliente tiene a alguien que responde por él, y un caso se atiende igual sin importar qué agente lo tome.

- El pipeline de servicio está configurado con sus etapas y cubre el flujo de atención, de la recepción al cierre. `[3.1.F1 · comprobable]`
- Cada cliente tiene registrado quién responde por él —una persona o, si la cartera es tan grande que no se asigna por persona, un equipo—. `[3.1.F2 · comprobable]`
- Hay reuniones de equipo de Servicio con cadencia fija (al menos quincenal) que se sostienen. `[3.1.F3 · declarado · hábito]`
- Existe un proceso escrito para escalar las quejas graves y los casos que el agente no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4 · declarado]`
- Cualquier agente explica cómo se atiende un caso típico siguiendo el mismo flujo. `[3.1.F5 · evaluado]`
- Cualquier agente atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por otro canal. `[3.1.F6 · evaluado · hábito]`
- Cada cliente recibe a tiempo un contacto de seguimiento —en los momentos que fija el proceso de atención—, aunque no haya abierto casos; si responde un equipo, ese contacto puede ser un mensaje automático. `[3.1.F7 · comprobable · hábito]`
- Si el área atiende cambios en cuentas, pagos, envíos o datos personales, verifica la identidad del cliente con los pasos que define el proceso antes de atenderlos, y queda registrado en el caso. `[3.1.F8 · comprobable · riesgo · hábito]`

**Eficiente.** Aparecen los SLA, los playbooks y el recorrido del cliente, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso, cada momento clave de la relación con el cliente tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de caso o prioridad. `[3.1.E1 · comprobable]`
- Hay playbooks de retención y expansión. `[3.1.E3 · declarado · relación continua]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —el inicio, la entrega o el primer valor y, si la hay, la renovación o la recompra— y un responsable y un estándar para cada uno. `[3.1.E4 · declarado · requiere 3.5.F2]`
- El líder revisa con datos del sistema, no de memoria, que cada caso siga las etapas y los pasos del proceso de atención. `[3.1.E5 · evaluado · hábito]`
- Hay un playbook de prevención: qué hacer ante las señales de un problema antes de que el cliente reclame. `[3.1.E6 · declarado]`

**Óptimo.** La IA ejecuta las rutinas repetitivas y el sistema vigila que cada caso siga el proceso; el equipo supervisa, corrige a la IA y resuelve las excepciones.

*Resultado:* El equipo deja de ejecutar rutinas y pasa a supervisarlas: la IA hace lo repetitivo, el sistema señala lo que se sale del proceso, y las personas se ocupan de las excepciones y de mejorar el sistema.

- El sistema detecta, sin que nadie lo revise a mano, cuando un caso se sale de las etapas o los pasos del proceso, y se lo señala al agente y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3 · comprobable]`
- Cada caso sigue las etapas y los pasos del proceso de atención sin que nadie lo vigile a mano. `[3.1.O4 · comprobable · hábito]`

#### 3.2 Tecnología y Automatización

¿Cómo llega un caso nuevo al sistema y a la persona que lo tiene que atender?

*Descripción:* Mide si cada caso llega solo al sistema y a quien lo atiende, y cuánto de la atención se automatiza.

*Costo de quedarse:* Los casos se pierden entre correos, chats y teléfonos, y alguien tiene que repartirlos a mano: el cliente tiene que insistir para que lo atiendan.

**Deficiente.** No hay un sistema de atención: los casos viven en el correo y el teléfono de cada persona.

- No hay un sistema central donde queden los casos. `[3.2.D1 · declarado]`
- Los casos se manejan en celulares personales o correos individuales. `[3.2.D2 · evaluado]`

**Inicial.** Hay un sistema de casos, pero alguien tiene que repartir a mano lo que entra o, si se atiende por WhatsApp o chat, nada de eso llega a él.

- Hay un sistema de casos, pero lo que entra se reparte a mano, o el equipo atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2 · comprobable]`

**Funcional.** Los casos entran al sistema y se asignan solos con una regla simple; si el equipo atiende por WhatsApp o chat, ese canal está conectado, y si usa IA, trabaja con los datos de los clientes.

*Resultado:* Lo que entra por los canales conectados llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Si el equipo atiende por WhatsApp o chat, al menos uno de esos canales está conectado al sistema, con una bandeja básica donde el equipo atiende lo que entra. `[3.2.F4 · comprobable]`
- Al entrar un caso, el sistema lo asigna solo según una regla simple. `[3.2.F5 · comprobable]`
- Si hay chatbot, resuelve preguntas frecuentes con un árbol de decisión. `[3.2.F6 · comprobable]`
- Si el equipo usa IA, esta trabaja con lo que el sistema sabe de cada cliente —quién es, qué compró y sus casos—, no a ciegas. `[3.2.F8 · comprobable]`
- Las herramientas y los módulos que se pagan están en uso: ninguna licencia lleva más de un mes sin usarse. `[3.2.F9 · comprobable]`
- Quien tiene que enterarse de un cambio de estado recibe el aviso sin que nadie se lo mande. `[3.2.F10 · comprobable]`
- Si el equipo contacta clientes por WhatsApp o teléfono, lo hace desde canales verificados de la empresa y nunca pide claves ni códigos. `[3.2.F11 · comprobable · riesgo]`

**Eficiente.** Los plazos se vigilan solos, aparece el autoservicio y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el cliente puede ver y abrir sus casos y resolver lo simple sin esperar a un agente, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay alertas antes del vencimiento de los SLA y escalación automática, con reglas de cuándo se escala y a quién. `[3.2.E1 · comprobable · requiere 3.1.E1]`
- Hay un portal donde el cliente ve y abre sus casos. `[3.2.E2 · comprobable]`
- Si el equipo atiende por más de un canal escrito —correo, WhatsApp, chat—, todos llegan a una sola bandeja. `[3.2.E3 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir casos o buscar en la base de conocimiento—, y la IA trabaja con el contexto del área: los tipos de cliente, la atención que recibe cada uno y las respuestas a las preguntas frecuentes. `[3.2.E4 · evaluado · hábito · requiere 3.3.F6]`
- Hay tableros en tiempo real de la atención: los casos abiertos, quién los tiene y cuántas conversaciones quedan sin atender. `[3.2.E5 · comprobable]`
- Si lo que el cliente compró o paga vive en otro sistema, una integración lo trae a su ficha sin cargarlo a mano. `[3.2.E6 · comprobable]`
- Si el equipo tiene más de un agente, los casos se enrutan por varias condiciones: idioma, tema o habilidad del agente. `[3.2.E7 · comprobable]`
- Hay una base de conocimiento interna y pública. `[3.2.E8 · comprobable]`

**Óptimo.** Un agente de IA resuelve casos y le pasa a una persona lo que no puede, y lo que la empresa calcula de cada cliente —como su riesgo de fuga— aparece en su ficha.

*Resultado:* Buena parte de los casos se resuelve sin que intervenga una persona, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la empresa sabe de ese cliente a la vista.

- Un agente de IA resuelve casos en todos los canales donde atiende el equipo, sin que intervenga una persona, y le pasa a una persona, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, el riesgo de fuga del cliente. `[3.2.O4 · comprobable · requiere 3.3.O2]`
- La IA ejecuta las rutinas repetitivas de la atención, como dar seguimiento a los casos y cerrarlos; el equipo supervisa y resuelve las excepciones, y en el sistema se ve qué hizo la IA y qué revisó una persona. `[3.2.O5 · evaluado · hábito]`

#### 3.3 Datos

¿De dónde sacas qué tipo de casos te llegan, cuántos y de qué clientes?

*Descripción:* Mide si los datos de cada cliente y sus casos están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el cliente escribe, tiene que volver a explicar quién es y qué pasó, porque nadie ve su historia completa.

**Deficiente.** Los datos de los clientes y sus casos están dispersos, sin un lugar común.

- La información de los clientes y sus casos está repartida entre correos, chats, hojas o sistemas que no se conectan, y no hay un lugar donde se vea junta. `[3.3.D1 · comprobable]`
- No se puede reconstruir qué le pasó a un cliente: su historia no queda registrada en ningún lado. `[3.3.D2 · comprobable]`

**Inicial.** Los casos están en un sistema, pero la ficha del cliente está incompleta y los números de casos se arman a mano.

- Los casos están en un solo sistema, pero la ficha del cliente sale incompleta: lo que compró o tiene contratado hay que buscarlo en otro sistema. `[3.3.I1 · comprobable]`
- Los números de casos —cuántos llegan y de qué tipo— se arman a mano, fuera del sistema. `[3.3.I2 · comprobable]`
- No hay una regla de cuándo se revisan las fichas: los clientes repetidos se unen a mano cuando alguien los nota, y la historia de un mismo cliente queda repartida en varias fichas. `[3.3.I3 · comprobable]`

**Funcional.** La historia y la ficha de cada cliente están a la vista, y cada caso tiene su tipo y su motivo.

*Resultado:* El líder sabe qué tipo de problemas llegan y cuántos, y cualquier agente tiene la historia del cliente en segundos.

- Cualquier agente ve el historial de casos de un cliente en menos de 10 segundos. `[3.3.F1 · comprobable]`
- La ficha del cliente muestra lo que compró o tiene contratado y su valor económico, no solo sus casos. `[3.3.F2 · comprobable]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida. `[3.3.F4 · comprobable]`
- El líder saca del sistema, sin armarlo a mano, cuántos casos llegan de cada tipo. `[3.3.F5 · comprobable]`
- El contexto que el área documentó —tipos de cliente, la atención que recibe cada uno, respuestas a las preguntas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6 · declarado · riesgo · hábito · requiere 3.5.F4, 3.6.F2, 3.8.F1]`
- Cada cliente tiene registrado su tipo, según el documento de tipos de cliente. `[3.3.F7 · comprobable · requiere 3.5.F4]`
- Los duplicados —el mismo cliente en dos o más fichas— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y la historia de cada cliente queda en una sola ficha. `[3.3.F8 · comprobable · riesgo · hábito]`
- Cada cliente tiene registrado su permiso para recibir mensajes por cada canal, y los avisos lo respetan. `[3.3.F9 · comprobable · riesgo]`

**Eficiente.** Se miden tiempos y satisfacción, y los datos se unifican con Ventas.

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende y cuánto tarda un cliente nuevo en ver valor, con la satisfacción medida y no supuesta; donde el cliente vuelve, sabe además qué tan sano está cada uno.

- Se mide el tiempo de primera respuesta y de resolución en todos los canales. `[3.3.E1 · comprobable]`
- Se mide la satisfacción del cliente —con el NPS o el CSAT— con una cadencia definida, por ejemplo al cerrar cada caso o cada trimestre. `[3.3.E2 · comprobable · hábito]`
- Se mide cuánto tarda cada cliente nuevo en obtener valor: el tiempo desde que empieza hasta su primer resultado. `[3.3.E4 · comprobable · requiere 3.5.F2]`
- Hay un indicador de salud por reglas para cada cliente, que combina sus casos abiertos, su satisfacción y, si lo que compró se usa de forma continua, su uso. `[3.3.E5 · comprobable · cliente recurrente]`
- La ficha del cliente muestra lo que ha pagado. `[3.3.E6 · comprobable · requiere 3.2.E6]`
- La ficha de la mayoría de los clientes tiene lo que se le prometió en la venta, registrado al pasar de Ventas a Servicio. `[3.3.E7 · comprobable]`
- Se mide qué parte de los casos cumple su SLA. `[3.3.E8 · comprobable · requiere 3.1.E1]`

**Óptimo.** Los datos se mantienen al día solos y, donde el cliente vuelve, un modelo de salud anticipa el riesgo antes de que el cliente lo diga.

*Resultado:* La empresa anticipa lo que va a pasar con sus clientes, con datos que se mantienen al día solos, y, donde el cliente vuelve, sabe quién está en riesgo y quién está logrando lo que buscaba antes de que ellos mismos lo digan.

- Un modelo predictivo de salud calcula para cada cliente su riesgo y si está logrando el resultado que persigue, a partir de su experiencia y de sus resultados; el puntaje se ve en su ficha y el responsable de cada cliente revisa a los que el modelo marca. `[3.3.O1 · comprobable · hábito · cliente recurrente]`
- Servicio se apoya en el almacén central de datos de la empresa, con reglas claras de quién accede y cómo se mantiene, para anticipar el riesgo de cada cliente. `[3.3.O2 · comprobable]`
- Modelos con IA predicen lo que viene —por ejemplo, cuántos casos van a entrar y de qué tipo— y proponen qué hacer; lo que predicen se ve en los tableros del área y el líder decide con eso. `[3.3.O3 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: la IA toma los datos de cada conversación, los completa y los corrige sola, las personas solo validan las excepciones, y en el sistema queda qué se corrigió. `[3.3.O5 · comprobable]`

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el equipo va al día con sus casos?

*Descripción:* Mide si cada persona sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien qué le toca a quién, y el líder se entera de los atrasos cuando el cliente ya se quejó.

**Deficiente.** Nadie tiene claro qué le toca y el líder no mira números: se apagan incendios.

- Nadie tiene claro qué le toca: entre el arranque de clientes, el soporte y el seguimiento, las tareas se pisan o quedan sin dueño. `[3.4.D1 · evaluado]`
- El líder vive apagando incendios: no sigue ningún número ni pide cuentas. `[3.4.D2 · evaluado]`

**Inicial.** Hay roles de palabra y el líder mira algunos números, pero sin una cadencia fija.

- Se siguen algunos números de la operación, pero sin un tablero ni una cadencia fija. `[3.4.I1 · comprobable]`
- El líder mira los números de vez en cuando, sobre todo cuando algo sale mal. `[3.4.I2 · declarado]`
- Los roles se reparten de palabra: cada uno sabe más o menos qué le toca, pero no está escrito. `[3.4.I3 · evaluado]`

**Funcional.** Cada persona tiene su rol por escrito, el líder sigue un tablero cada semana y el equipo rinde cuentas en sus reuniones.

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día o se está atrasando.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, volumen, casos pendientes acumulados, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2 · evaluado · hábito · requiere 3.3.F5]`
- En las reuniones del equipo se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[3.4.F3 · evaluado · hábito · requiere 3.1.F3]`
- El equipo tiene metas escritas —tiempos de respuesta, casos resueltos, satisfacción— y el líder las revisa cada mes. `[3.4.F4 · declarado · hábito]`
- Cada persona del equipo tiene su rol por escrito: de qué se encarga, qué decide sola y qué aprueba el líder. `[3.4.F5 · declarado]`

**Eficiente.** El equipo rinde cuentas por los SLA, el líder prepara a quien entra y acuerda con Ventas qué recibe y qué devuelve Servicio.

*Resultado:* El equipo responde por sus tiempos de atención, un agente nuevo rinde rápido, cada cliente nuevo llega de Ventas con el resultado que persigue y, donde el cliente vuelve a comprar sin contrato, Ventas se entera cuando uno se puede estar yendo.

- En las reuniones del equipo se revisa el cumplimiento de los SLA de cada persona y se acuerda qué corregir. `[3.4.E1 · evaluado · hábito · requiere 3.1.F3, 3.3.E8]`
- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[3.4.E2 · declarado]`
- Cada cliente nuevo llega de Ventas con el resultado que persigue y lo que se le prometió. `[3.4.E4 · declarado · hábito]`
- Si quien lidera el área no es la dirección general, le presenta cada mes los resultados contra la meta, con datos del sistema. `[3.4.E5 · declarado · hábito]`
- El equipo señala lo que el sistema debería hacer distinto, y el líder revisa y responde cada pedido. `[3.4.E6 · evaluado · hábito]`
- El líder de Servicio acuerda con Ventas cómo le pasa la señal de los clientes listos para el siguiente producto y, en la recompra, el aviso de los que se están yendo. `[3.4.E7 · declarado · hábito]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8 · evaluado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento y, donde la relación es continua, el servicio se mide por los ingresos que retiene y hace crecer.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella; donde la relación es continua, Servicio se mide por los ingresos que retiene y hace crecer, no solo por los casos que cierra.

- Hay responsables de validar lo que responde la IA, y lo que la IA puede resolver sola está por escrito. `[3.4.O1 · declarado]`
- El líder ya no reparte casos ni apaga incendios: dedica su tiempo a decidir qué se automatiza, qué se mide y qué se mejora. `[3.4.O2 · evaluado · hábito]`
- El equipo de servicio se mide por la retención de sus clientes y por los clientes con potencial que le pasa a Ventas, no solo por los casos que cierra. `[3.4.O5 · declarado · hábito · relación continua]`
- Hay responsables de cuidar la calidad de los datos de los clientes: está por escrito quién corrige cada dato y cada cuánto se revisa. `[3.4.O6 · declarado]`

### Producción

#### 3.5 Consistencia de Atención

¿En qué se apoya tu equipo para que la atención no cambie según quién atienda?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y si cada cliente recibe las mismas respuestas, lo atienda quien lo atienda.

*Costo de quedarse:* La calidad depende de quién atienda: el mismo cliente recibe respuestas distintas a la misma pregunta.

**Deficiente.** No hay respuestas guardadas ni criterios comunes: cada agente responde a su manera.

- No hay respuestas guardadas: cada agente escribe cada respuesta desde cero, a su manera. `[3.5.D1 · evaluado]`

**Inicial.** Hay algunas respuestas guardadas, pero cada agente tiene las suyas.

- Hay algunas respuestas guardadas, pero cada agente tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1 · declarado]`

**Funcional.** Los tipos de cliente están escritos, cada cliente nuevo arranca con un proceso definido y el equipo tiene respuestas guardadas para lo frecuente.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, un cliente nuevo arranca con un proceso claro y un resultado definido, y todo el equipo tiene a mano las mismas respuestas para lo frecuente.

- Hay respuestas guardadas (macros) para preguntas frecuentes, al alcance de todo el equipo. `[3.5.F1 · comprobable]`
- Existe un proceso escrito de arranque del cliente nuevo —su bienvenida, su implementación o la entrega de lo que compró—, con un resultado definido que el cliente debe alcanzar al terminarlo. `[3.5.F2 · declarado]`
- Si entró alguien nuevo al equipo, recibió el conjunto de respuestas guardadas en su capacitación inicial. `[3.5.F3 · declarado]`
- Existe un documento simple con los tipos de cliente que atiende el área —qué necesita cada uno, qué espera del servicio y cuáles se consideran clientes clave—, consultable por cualquier agente. `[3.5.F4 · declarado]`
- Los agentes usan las respuestas guardadas para los casos frecuentes. `[3.5.F5 · comprobable · hábito]`

**Eficiente.** Las respuestas guardadas se usan en el día a día y todas siguen el mismo tono de marca.

*Resultado:* El cliente reconoce la misma voz en cada respuesta, sea cual sea el agente.

- El tono y la voz de marca se aplican a las respuestas, no cada agente con su estilo. `[3.5.E2 · evaluado · hábito]`
- Existe una guía de estilo de servicio documentada. `[3.5.E3 · declarado]`

**Óptimo.** La IA aplica el tono de marca en las interacciones automatizadas.

*Resultado:* La experiencia se siente igual de cuidada con una persona o con la IA.

- Lo que la IA responde o escribe sola sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1 · evaluado · requiere 3.2.O1, 3.5.E3]`

#### 3.6 Priorización de Clientes

¿Cómo se decide qué caso se atiende primero?

*Descripción:* Mide si los casos se atienden según su gravedad y el tipo de cliente, y no según quién insiste más.

*Costo de quedarse:* Lo urgente espera en la misma fila que lo simple, y tu mejor cliente recibe la misma atención que todos.

**Deficiente.** Nada decide el orden: los casos se atienden como llegan.

- Los casos se atienden por orden de llegada o como prefiere cada agente, sin mirar su gravedad ni quién es el cliente. `[3.6.D1 · comprobable]`

**Inicial.** Se prioriza a ojo: lo que parece urgente o el cliente que más insiste.

- Se intenta atender primero lo urgente, pero los casos no tienen una prioridad asignada: cada agente decide a ojo, o se adelanta el cliente que más insiste. `[3.6.I1 · declarado]`

**Funcional.** Cada caso tiene una prioridad que el equipo respeta, y cada tipo de cliente recibe la atención que le corresponde.

*Resultado:* Lo urgente se atiende primero y cada tipo de cliente recibe la atención que le corresponde, sin que el agente tenga que reconstruir su historia.

- Cada caso tiene una prioridad asignada (urgente, alta, normal o baja) y los agentes la respetan. `[3.6.F1 · comprobable · hábito]`
- Está escrito qué atención recibe cada tipo de cliente. `[3.6.F2 · declarado · requiere 3.5.F4]`
- El agente usa la ficha del cliente —lo que compró o tiene contratado y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3 · evaluado · hábito · requiere 3.3.F2]`
- El equipo atiende a cada cliente según lo que está escrito para su tipo. `[3.6.F4 · evaluado · hábito]`
- Está escrito qué hace que un caso sea urgente, alto, normal o bajo, y el equipo lo aplica al asignar la prioridad. `[3.6.F5 · declarado]`

**Eficiente.** La atención cambia según el momento de cada cliente y, donde el cliente vuelve, cada cliente clave tiene un responsable dedicado.

*Resultado:* La atención cambia según el momento en que está cada cliente y, donde el cliente vuelve, cada cliente clave tiene un dueño que lo conoce y el resto de la cartera no queda sola.

- Cada cliente clave tiene un responsable dedicado que lo conoce. `[3.6.E1 · comprobable · cliente recurrente · requiere 3.1.F2, 3.5.F4]`
- El resto de la cartera recibe acompañamiento automatizado, de uno a muchos. `[3.6.E4 · comprobable · cliente recurrente]`
- Los clientes se segmentan para acciones diferenciadas según el momento de su relación —donde el cliente vuelve, sanos, en riesgo, con potencial de crecer o listos para recomendar; donde compra una vez, por entregar, en garantía o listos para recomendar— y según su valor o su nivel en el programa de lealtad, que cambian la atención y las ofertas. `[3.6.E5 · comprobable · requiere 3.3.E5]`

**Óptimo.** Cada cliente se atiende con todo su contexto, lo atienda una persona o la IA, incluso en el autoservicio.

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló con Ventas.

- En el autoservicio, cada cliente ve lo que corresponde a su tipo, a lo que compró y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1 · comprobable · requiere 3.2.E2]`
- La IA ajusta cada respuesta a la persona mientras la atiende —según su historia, su caso y lo que acaba de hacer—, dentro de los límites que fijó el equipo; el equipo revisa una muestra de las respuestas, y en el sistema queda qué se le respondió. `[3.6.O2 · comprobable]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le prometió en la venta y el segmento del que viene—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3 · comprobable · requiere 3.3.E7]`

#### 3.7 Proactividad

¿Cómo te enteras de que un cliente tiene un problema?

*Descripción:* Mide si el servicio se adelanta a los riesgos y necesidades del cliente, o solo reacciona cuando algo falla.

*Costo de quedarse:* Te enteras de que un cliente está mal cuando el problema ya creció o cuando ya se fue, y las fechas críticas de tus clientes clave —el fin de una garantía, un vencimiento, una renovación— te toman por sorpresa.

**Deficiente.** Nadie se adelanta: los problemas se atienden cuando el cliente reclama.

- Aunque un cliente acumule casos repetidos o una queja sin resolver, nadie lo contacta: los problemas se atienden cuando estallan. `[3.7.D1 · evaluado]`
- El área nunca contacta al cliente por iniciativa propia. `[3.7.D2 · comprobable]`

**Inicial.** A veces alguien se adelanta a un problema, pero depende de quién lo note.

- Cuando un cliente tiene problemas repetidos, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1 · evaluado]`

**Funcional.** Los problemas que se repiten y las quejas se detectan, aunque sea a mano, y los clientes clave reciben contacto antes de sus fechas críticas.

*Resultado:* Los problemas que se repiten, las quejas y las fechas críticas de los clientes clave ya no toman al equipo por sorpresa: se actúa antes de que el problema crezca y, donde la relación es continua, cuando un cliente se va se sabe por qué.

- Un cliente con casos repetidos por el mismo problema, una queja sin resolver o, si se piden calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1 · comprobable · hábito]`
- Los clientes clave reciben contacto antes de sus fechas críticas —el fin de una garantía, un vencimiento o, si la hay, una renovación—, no después. `[3.7.F2 · comprobable · hábito · requiere 3.5.F4]`
- Cada cliente que se va deja registrada la razón de su salida. `[3.7.F3 · comprobable · relación continua]`
- Si la empresa entrega por etapas o de forma periódica, los clientes clave reciben contacto antes de cada entrega, no después. `[3.7.F4 · comprobable · hábito · requiere 3.5.F4]`

**Eficiente.** Los riesgos se ven venir, ningún caso se pierde aunque lo resuelva otra área, y el cliente recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los casos del cliente no se pierden entre áreas, el cliente sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la empresa retiene clientes que antes se perdían sin aviso, encuentra oportunidades en su propia cartera y sus clientes clave ven qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de riesgo de fuga o de oportunidad de crecer. `[3.7.E1 · comprobable · relación continua · requiere 3.3.E5]`
- Los clientes clave revisan con la empresa, al menos cada trimestre, el resultado que persiguen: qué se logró y qué sigue. `[3.7.E3 · declarado · hábito · relación continua · requiere 3.4.E4, 3.5.F4]`
- Si otras áreas resuelven casos del cliente, quedan en el mismo sistema y no se pierden. `[3.7.E4 · comprobable]`
- Hay alertas automáticas, para quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica o, si se piden calificaciones, cuando un cliente califica mal. `[3.7.E6 · comprobable]`
- Los clientes en riesgo reciben una acción de retención antes de decidir irse, y los que tienen potencial se le señalan a Ventas con su contexto. `[3.7.E7 · comprobable · hábito · relación continua]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —una entrega, un trámite, un vencimiento—; sale sola, disparada por el evento y en el canal que el cliente prefiere, no cuando alguien se acuerda. `[3.7.E8 · comprobable · requiere 3.1.E4]`

**Óptimo.** Los problemas se resuelven antes de que el cliente los note, con acciones que la IA ajusta, y el cliente recibe detalles que lo deleitan.

*Resultado:* La mayoría de los problemas que detecta el sistema se resuelven antes de que el cliente los note, y cada cliente siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- La mayoría de los problemas que detecta el sistema se resuelven antes de que el cliente los note: el equipo valida la solución y en el sistema se ve que el cliente no tuvo que abrir un caso. `[3.7.O2 · comprobable · hábito]`
- La IA decide qué acción proactiva recibe cada cliente —qué, cuándo y por qué canal— según su historia y sus señales, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada cliente. `[3.7.O3 · comprobable]`
- Las revisiones de resultado llegan a todos los clientes: a los clave en persona y al resto con un informe que la IA arma con sus datos y envía sola, dentro de los límites que fijó el equipo; el equipo revisa una muestra, y cada revisión queda registrada en la ficha del cliente. `[3.7.O5 · comprobable · hábito · relación continua · requiere 3.5.F4]`
- Los clientes reciben, sin pedirlos y sin tener que comprar a cambio, detalles pensados para deleitarlos —obsequios, beneficios o experiencias— que la IA elige según la historia y el momento de cada cliente, dentro del presupuesto y los límites que fijó el equipo; el equipo revisa una muestra, y en el sistema queda qué recibió cada uno. `[3.7.O6 · comprobable]`

#### 3.8 Escalabilidad del Servicio

¿Qué pasa con las preguntas que tus clientes hacen una y otra vez?

*Descripción:* Mide si el equipo puede atender a más clientes sin crecer al mismo ritmo, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas una y otra vez, y cada cliente nuevo suma más de esas preguntas a la fila.

**Deficiente.** Las preguntas de siempre se responden a mano, una por una: no hay nada publicado.

- No hay ninguna respuesta publicada que el cliente pueda consultar por su cuenta. `[3.8.D1 · comprobable]`
- Hasta las preguntas que más se repiten se responden a mano, una por una, cada vez que llegan. `[3.8.D2 · declarado]`

**Inicial.** Hay algunas respuestas publicadas o un chatbot de menú, pero lo que más preguntan los clientes todavía no tiene respuesta publicada.

- Hay un chatbot de menú fijo, pero no responde las preguntas que más se repiten. `[3.8.I1 · comprobable]`
- Hay algunas respuestas publicadas, pero sueltas: no cubren lo que más preguntan los clientes, que se sigue respondiendo a mano. `[3.8.I2 · evaluado]`

**Funcional.** Las preguntas más frecuentes de los clientes tienen respuesta publicada.

*Resultado:* El cliente puede consultar por su cuenta la respuesta a las preguntas de siempre, y el agente remite a ella en vez de volver a escribirla.

- Las diez preguntas que más se repitieron en el último trimestre —o todas, si son menos— tienen una respuesta publicada que el cliente puede consultar por su cuenta. `[3.8.F1 · comprobable]`
- Cuando entra un caso que ya tiene respuesta publicada, el equipo remite a ella en vez de volver a redactarla. `[3.8.F2 · comprobable · hábito]`

**Eficiente.** Se documenta el aprendizaje y el autoservicio empieza a liberar al equipo.

*Resultado:* La empresa puede sumar clientes sin sumar agentes en la misma proporción, porque buena parte de lo que preguntan se resuelve sin abrir un caso.

- Se documentan las soluciones a casos nuevos (se alimenta la base de conocimiento). `[3.8.E1 · comprobable · hábito]`
- Al menos una vez por trimestre se revisan los casos que se repiten y, donde la relación es continua, las razones de salida. `[3.8.E2 · declarado · hábito · requiere 3.7.F3]`
- Se mide cuántos clientes resuelven en el autoservicio sin abrir un caso, y ese número alcanza la meta que fijó el área. `[3.8.E4 · comprobable · hábito · requiere 3.4.F4]`
- Lo que sale de esa revisión cambia el proceso, las respuestas publicadas o los playbooks, y queda escrito qué cambió. `[3.8.E5 · declarado · hábito]`

**Óptimo.** La IA detecta las preguntas nuevas y genera el contenido; la cartera crece sin que crezca el equipo.

*Resultado:* La cartera puede crecer sin que crezca el equipo: el conocimiento se genera a medida que aparecen preguntas nuevas, y la IA y el autoservicio absorben los picos.

- La IA detecta las preguntas nuevas que llegan y redacta el artículo o la respuesta; el equipo lo revisa antes de publicarlo, y en la base de conocimiento se ve qué escribió la IA y quién lo aprobó. `[3.8.O1 · comprobable]`
- Los picos de demanda los absorben la IA y el autoservicio: el equipo no crece cuando crece la cartera, y el líder ve en los tableros del área qué parte de la demanda resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2 · evaluado]`
- La IA aplica lo que aprende de los casos a las respuestas guardadas, a la atención de cada tipo de cliente y a los avisos proactivos, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3 · comprobable]`
- Los avisos que decide la IA se miden contra un grupo de control, y en el sistema se ve cuánto agregan; con eso el equipo revisa los límites que le fijó a la IA. `[3.8.O4 · comprobable · requiere 3.7.O3]`

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

Cada una responde la misma pregunta de fondo en las tres áreas —la que dice «Las ocho dimensiones», en la Parte 1—, con un nombre general que comparten y un nombre propio en cada departamento.

| ID | Nombre general | 1 Ventas | 2 Marketing | 3 Servicio |
|:--|:--|:--|:--|:--|
| x.5 | Presentación | Propuesta y Coherencia | Marca y Presencia | Consistencia de Atención |
| x.6 | Priorización | Priorización de Leads | Segmentación | Priorización de Clientes |
| x.7 | Alcance | Tracción del Negocio | Canales y Alcance | Proactividad |
| x.8 | Aprendizaje | Aprendizaje de Ganadas y Perdidas | Medición y Aprendizaje | Escalabilidad del Servicio |

Todas las dimensiones, de base operativa y de producción, tienen los cinco niveles. No hay excepciones.

## Riesgos

Cuando un criterio de riesgo no se cumple, se le muestra al cliente con estos mensajes. Se escriben por su consecuencia de negocio: dicen qué le pasa al cliente si el riesgo sigue activo.

| Identificador | Criterio | Mensaje cuando no se cumple |
|:--|:--|:--|
| `1.3.F2`, `2.3.F3`, `3.3.F8` | Los duplicados se revisan y se unen cada trimestre | Tus reportes pueden estar inflados y una misma persona puede recibir varias veces el mismo mensaje: hay contactos repetidos —la misma persona con varios correos— que nadie revisa hace más de un trimestre. |
| `1.3.F9`, `2.3.F6` | El contexto se revisa y actualiza cada trimestre | Tu equipo —y la IA, si la usas— puede estar trabajando con una idea vieja de a quién le vendes y qué le ofreces: lo que documentaste no se revisa hace más de un trimestre. |
| `3.3.F6` | El contexto y las respuestas publicadas se revisan y actualizan cada trimestre | Tus clientes pueden estar leyendo respuestas viejas, y tu equipo —y la IA, si la usas— atendiendo con información desactualizada: lo que documentaste no se revisa hace más de un trimestre. |
| `2.3.F9`, `1.3.F10`, `3.3.F9` | Las personas aceptaron que les escriban | Puedes estar escribiéndole a personas que no te dieron permiso: tus correos pueden terminar en spam y, si usas WhatsApp, tu número se puede bloquear. |
| `3.2.F11` | El equipo escribe desde canales verificados y nunca pide claves | Si tu equipo les escribe a tus clientes desde números personales o les pide claves, una estafa que te imita se ve igual que tú: ellos pierden su dinero y tú, su confianza. |
| `3.1.F8` | Se verifica la identidad antes de atender un cambio | Cualquiera que diga ser tu cliente puede pedir un cambio en su cuenta: un fraude le cuesta su dinero al cliente y a ti, su confianza. |

## Glosario

Términos que aparecen en la escala, la especificación o el manual, o que el equipo usa a diario aunque la escala ya los diga en español, y que pueden no ser evidentes: los propios de la escala, los que en ella tienen un sentido preciso y los de uso común en la industria o en las herramientas. Cuando la escala dice en español algo que en las herramientas se dice en inglés, la entrada lo aclara.

| Término | Qué significa |
|:--|:--|
| AEO | Optimización para motores de respuesta: que el contenido aparezca como respuesta en asistentes de IA y en buscadores que contestan preguntas. |
| Agente | En Servicio, la persona del equipo que atiende los casos. Un agente de IA es un programa que hace un trabajo solo —calificar un lead, responder un caso— y le pasa a una persona lo que no puede resolver. Los agentes de Nexus son los que ayudan al CSE a diagnosticar. |
| Almacén central de datos | Base donde la empresa junta la información de todas sus herramientas para analizarla en conjunto. En inglés, data warehouse. |
| Arquitectura de CRM | Cómo está armado el CRM por dentro: sus propiedades, pipelines, listas y formularios. |
| Atribución | Repartir el mérito de un lead o de una venta entre los canales y los contenidos que tocaron a esa persona, para saber cuánto deja cada uno. |
| Autoservicio | Lo que el cliente resuelve solo, sin hablar con nadie: una respuesta publicada, un portal o una gestión en línea. |
| Backlog | Trabajo pendiente acumulado, como los casos sin resolver. |
| Bandeja | Lugar del sistema donde llegan las conversaciones de un canal —WhatsApp, chat, correo— para que el equipo las atienda. Una bandeja unificada junta varios canales en uno. |
| BANT, MEDDIC, SPIN | Metodologías de venta con pasos definidos para calificar y conducir un negocio. |
| Buyer persona | Retrato escrito de un tipo de comprador: quién es, qué le preocupa y cómo decide. |
| CAC | Costo de adquisición de cliente: lo que cuesta en marketing y ventas conseguir un cliente nuevo. |
| Calibración | Práctica en la que un CSE puntúa casos de referencia con respuesta conocida, para comprobar que diagnostica igual que los demás. Por ahora es una regla en espera, en el manual de operación. |
| Canal conversacional | Canal donde el cliente conversa con la empresa en tiempo real o casi: la mensajería —en la región, sobre todo WhatsApp— o el chat del sitio. |
| Caso | Cada pedido de ayuda de un cliente —una consulta, un problema, un reclamo o una solicitud— desde que entra hasta que se cierra. En inglés, ticket. |
| Caso de éxito | Historia de un cliente que logró un resultado con lo que vende la empresa, contada para mostrársela a otros. |
| Chatbot | Programa que responde conversaciones de forma automática, desde menús fijos hasta IA. |
| Chequeo | Versión corta del diagnóstico, para prospectos: una o dos preguntas por dimensión, con las que se estima el nivel sin recorrer los criterios. Todo lo que muestra es estimado. |
| Cliente clave | Cliente que la empresa decide cuidar de forma especial. Cada empresa define por escrito cuáles son, en su documento de tipos de cliente; la escala pide que esa definición exista y que se use. |
| Cliente ideal | El tipo de empresa o de persona al que mejor le sirve lo que se vende. Se define por escrito y guía a quién se le dedica el esfuerzo. En inglés, ICP. |
| CMS | Sistema donde se crean y publican las páginas del sitio web. |
| CRM | Sistema central donde el equipo registra contactos, empresas, negocios y actividades. |
| CSAT | Encuesta de satisfacción que se le hace al cliente después de una atención. |
| CSE | Quien, en el equipo de éxito del cliente de Smarteam, diagnostica a cada cliente con la escala, acuerda con él su nivel objetivo y lo acompaña en los casos de uso. |
| CSM | Responsable del éxito de un cliente: la persona que lo acompaña para que logre resultados. |
| Diagnóstico | Medición que hace el CSE con los agentes de Nexus, criterio por criterio con la regla estricta. Fija la línea base y se repite en cada remedición. |
| Escalar un caso | Pasarlo a alguien con más autoridad o conocimiento, porque quien lo atiende no puede resolverlo o porque está por vencer su plazo. No es lo mismo que la escalabilidad del servicio, que mide si se pueden atender más clientes sin que el equipo crezca al mismo ritmo. |
| Etapa del ciclo de vida | Dónde está cada contacto en su relación con la empresa —suscriptor, lead, MQL, SQL, cliente—, guardado en un campo del sistema para que cada área sepa qué le toca. |
| Ficha del cliente | El registro de cada cliente en el sistema, con lo que se sabe de él: quién es, qué compró o tiene contratado, sus casos y sus conversaciones. Es lo que mira quien lo atiende. |
| Fuga de clientes | Pérdida de clientes: los que dejan de comprar o cancelan. En inglés, churn. |
| Grupo de control | Personas parecidas a las que no se les envía el mensaje, para medir cuánto agrega lo que sí se envió. |
| Hábito | Criterio que describe algo que el equipo repite. Puede estar cumplido, iniciado —la rutina existe pero todavía no tiene historia— o no cumplido. |
| IA | Inteligencia artificial. En la escala importa quién hace el trabajo: en Eficiente, la IA asiste y una persona lo hace; en Óptimo, la IA lo hace y una persona valida. |
| Indicador de salud | Puntaje de un cliente que anticipa si está en riesgo o tiene potencial de crecer. En inglés, health score. |
| Landing page | Página creada para una campaña, con un objetivo concreto como captar datos. |
| Lead | Persona o empresa que mostró interés y todavía no es cliente. |
| Lead calificado | Lead que cumple los criterios escritos para que Ventas lo trabaje. Es lo mismo que un SQL. |
| LTV | Valor de vida del cliente: cuánto ingreso deja durante toda la relación. |
| Material de venta | Material de apoyo para vender: una presentación, un caso de éxito, una demo o un video. En inglés, asset. |
| Meta tags | Etiquetas del sitio que les dicen a los buscadores de qué trata cada página. |
| MQL | Lead que Marketing considera listo para pasar a Ventas, según los criterios que Marketing definió. Todavía no es un lead calificado: eso lo decide Ventas. |
| Negocio | Cada venta posible en curso, desde que se abre hasta que se gana o se pierde; vive en el pipeline. También se le dice oportunidad; en inglés, deal. |
| Nivel objetivo | El nivel hasta el que conviene llevar un departamento, acordado con el cliente según el resultado que persigue. Por defecto, Funcional. |
| NPS | Encuesta que mide qué tan dispuesto está un cliente a recomendar a la empresa. |
| Nutrición | Secuencia de mensajes que acompaña a un lead hasta que está listo para comprar o, donde hay vendedores, para hablar con Ventas. En inglés, nurturing. |
| Onboarding | Proceso de arranque: el de un cliente nuevo, o el de una persona nueva en el equipo. |
| Perfil de negocio | Cómo se cierra la venta de una unidad —con equipo, transaccional o mixta— y qué pasa después —relación única, recompra o relación continua—. Decide qué criterios aplican. |
| Pipeline | Las etapas por las que pasa un negocio, desde el primer contacto hasta el cierre. |
| Playbook | Guía práctica que dice cómo actuar en una situación concreta, paso a paso. |
| Por confirmar | Nivel del diagnóstico al que solo le faltan hábitos iniciados: cuenta como alcanzado, y en la siguiente remedición se confirma o baja. |
| Pronóstico | Cálculo de cuánto se va a vender en un período. En inglés, forecast. |
| Prueba A/B | Probar dos versiones de algo con públicos parecidos, para ver cuál funciona mejor. En inglés, test A/B. |
| Puntaje de leads | Modelo que suma puntos a cada lead según sus datos y su comportamiento, para saber cuáles están más cerca de comprar. En inglés, lead scoring. |
| QBR | Revisión trimestral con un cliente clave sobre sus resultados y los próximos pasos. |
| Recompra | Que un cliente vuelva a comprar sin tener un contrato que lo obligue. |
| Recorrido del cliente | Camino que hace un cliente desde que conoce la empresa hasta que compra, y después; antes de la compra se le dice recorrido de compra. En inglés, journey. |
| Referido | Cliente nuevo que llega por la recomendación de otro cliente. |
| Remarketing | Volver a mostrarle anuncios a quien ya tuvo contacto con la empresa. |
| Remedición | Volver a diagnosticar un departamento para ver cuánto avanzó: la primera, entre 60 y 90 días después de entregar, y después de forma periódica. Se compara contra la línea base. |
| Respuestas guardadas | Respuestas que un agente inserta con un clic en vez de redactarlas cada vez. En las herramientas, macros o snippets. |
| Revisión del pipeline | Reunión periódica donde el equipo revisa el estado de los negocios en curso. En inglés, pipeline review. |
| Round-robin | Asignación por turnos: uno a cada persona, en orden. |
| Routing | Regla que decide a quién se asigna automáticamente un lead o un caso. |
| Segmento | Grupo de contactos o de clientes que comparten algo que importa para hablarles distinto —qué necesitan, cómo deciden, qué compraron—, definido con criterios escritos. |
| SEO | Optimización para buscadores: que el sitio aparezca cuando alguien busca lo que la empresa ofrece. |
| SLA | Compromiso de tiempo de respuesta o de resolución, por tipo de caso o de cliente. |
| SQL | Lead aceptado por Ventas como un negocio real que vale la pena trabajar. |
| Stack | El conjunto de herramientas tecnológicas que usa el área. |
| Tablero | Pantalla con los indicadores clave de un área, que se actualiza desde el sistema. En inglés, dashboard. |
| Traspaso | Paso de un contacto o de un cliente de un área a otra, por ejemplo de Marketing a Ventas. En inglés, handoff. |
| Upsell | Venderle más, o una versión superior, a un cliente que ya compró. |
| Vista 360° | Ver en un solo lugar toda la relación con un cliente: ventas, servicio, facturación e historial. |
| Workflow | Flujo automático que se dispara con un evento y ejecuta acciones en el sistema. |

## Historial de versiones

**9.2.0 (2026-10-28).** Una edición nueva, con sus tres áreas enteras: Telecomunicaciones. Es para el operador que le vende a personas, hogares y empresas sus servicios móviles —prepago y pospago, con o sin equipo—, de internet y televisión para el hogar y de conectividad para empresas, parte con un ejecutivo y parte en la web, la app o la recarga, y que atiende después la activación o la instalación, las averías, la facturación, la renovación y la retención; en Ventas sus dimensiones de producción son Planes y ofertas, Calificación y priorización, Seguimiento de la contratación, y Ventas ganadas y perdidas; y en Servicio, Consistencia de Atención, Priorización de Clientes, Proactividad y retención, y Autoservicio. Pide, entre otras cosas, un proceso escrito para la portabilidad, que la venta se dé por concretada solo con la línea activa o el servicio instalado, la cobertura antes de vender un servicio del hogar y el crédito antes del pospago o del equipo en cuotas, que el cliente reciba por escrito el plazo de permanencia y lo que cuesta salir antes, que las campañas no le ofrezcan a un cliente lo que ya tiene y solo le lleguen por los canales que aceptó, el plazo del regulador para cada reclamo, verificar la identidad antes de cambiar la SIM o el titular, una razón para quedarse antes de la baja, el aviso antes del fin del plazo de permanencia y de una suspensión por falta de pago, y que el cliente recargue, vea su consumo, pague su factura y reporte una avería sin esperar a una persona. Avisarle al cliente que su plazo de permanencia termina es de Servicio; ofrecerle renovar con un equipo nuevo o sumar una línea, de Ventas. No cambia ningún criterio de la matriz ni su cálculo.

**9.1.1 (2026-10-28).** En la edición de Maquinaria y equipo pesado, ocho criterios reescritos vuelven a pedir lo mismo que la matriz: lo que sumaban —la máquina de interés en cada negocio, las horas de uso en la ficha del cliente, la proyección por modelo, los datos fijos de la cotización y de la entrega técnica, entre otros— queda como ejemplo. No cambia ningún criterio de la matriz ni su cálculo.

**9.1.0 (2026-10-28).** Una edición nueva, con sus tres áreas enteras: Maquinaria y equipo pesado. Es para el distribuidor de maquinaria —de construcción, agrícola, de minería o industrial— y de camiones que vende máquinas nuevas y usadas con un asesor y atiende su posventa en el taller y en el lugar de trabajo del cliente; en Ventas sus dimensiones de producción son Líneas de máquinas y cotización, Priorización de interesados, Seguimiento de demostraciones y cotizaciones, y Ventas ganadas y perdidas; y en Servicio, Consistencia de la posventa, Priorización de la posventa, Seguimiento de la máquina y Escalabilidad de la posventa. Pide, entre otras cosas, que cada demostración deje su siguiente paso, un proceso escrito para recibir la máquina usada, que apartar una máquina la marque en el inventario, una sola lista de precios, que en las ventas de más valor la cotización compare el costo de operación, la entrega técnica con la capacitación al operador, ver si hay repuesto antes de prometer una fecha, el recordatorio del mantenimiento por horas de uso, el aviso de cada boletín de servicio de la marca y, donde la máquina trae telemetría, que sus alertas abran el aviso solas. Recordarle al cliente el mantenimiento de su máquina es de Servicio, y ofrecerle renovarla o sumar otra a su flota, de Ventas. No cambia ningún criterio de la matriz ni su cálculo.

**9.0.0 (2026-10-27).** La revisión de la 8.9 y el engagement avanzado. Cada cosa se mide en un solo lugar: lo que compartían Ventas y Marketing, o Ventas y Servicio, queda en el área que lo ejecuta, y la regla de asignación suma los acuerdos entre dos áreas, la renovación y el siguiente producto, la lealtad, la plantilla de la propuesta y lo que cambia en la tienda para cada comprador. Los criterios que pedían dos cosas se parten; los Óptimos que se cumplían con una persona y datos bajan a Eficiente, con la misma vara en las tres áreas; entran criterios para lo que ningún criterio pedía —el plan de canales, el contacto antes de cada entrega, los duplicados de Servicio, la identidad del cliente y el permiso de contacto—, y las señales de Deficiente e Inicial se completan. El perfil de negocio suma una tercera pregunta, el tráfico del sitio o la app, con su marca, «tráfico suficiente», y la Parte 2 suma la lectura de preparación para engagement avanzado, que no cambia el nivel. La dimensión 6 se llama «Priorización» como nombre general. Entran 112 criterios en la matriz y salen 54; los que cambian de nivel o de lo que mide dejan su identificador y entran con otro, y la especificación 1.4.0 los anota como retirados. Las ediciones leen como la general lo que su texto propio todavía no dice. Cambia lo que piden todos los niveles. Se publica con decisiones provisionales que su responsable revisa: están en el manual de operación.

**8.9.1 (2026-10-18).** Las seis ediciones dicen cada nivel de cada dimensión con las palabras de su industria: en cada uno, al menos un criterio de la matriz va reescrito. Hasta esta versión, 244 niveles se leían enteros con el texto general —71 en Automotriz, 64 en Turismo, 47 en Banca, 44 en Inmobiliaria, 10 en Educación y 8 en Ecommerce y retail—, como Inicial de Seguimiento de cotizaciones y reservas en Turismo. Se reescriben 322 criterios: ninguno cambia lo que mide, sus marcas ni lo que requiere, y no entra ningún criterio propio. Cómo se escribe una edición lo dice. No cambia ningún criterio de la matriz ni su cálculo.

**8.9.0 (2026-10-18).** Dos ediciones nuevas, con sus tres áreas enteras: Turismo y Automotriz. Turismo es para hoteles, operadores, agencias de viaje y empresas de experiencias que venden por reserva directa y por intermediarios, con temporadas; en Ventas sus dimensiones de producción son Oferta y tarifas, Priorización de consultas, Seguimiento de cotizaciones y reservas, y Reservas ganadas, perdidas y canceladas; en Marketing, Marca y reputación; y en Servicio, Consistencia de la experiencia, Priorización de viajeros, Acompañamiento del viajero y Autoservicio del viajero. Pide, entre otras cosas, que una reserva descuente el cupo en todos los canales a la vez, las mismas tarifas y condiciones en el sitio y en las OTAs, las fechas de corte de cada bloqueo de grupo, la razón de cada cancelación, los perfiles en los sitios de reseñas al día, lo que cuesta una reserva directa frente a la comisión, el cambio de turno registrado y la queja atendida antes de que el viajero se vaya. Automotriz es para el concesionario que vende vehículos nuevos y usados y atiende su posventa en el taller; en Ventas sus dimensiones de producción son Modelos y cotización, Priorización de interesados, Seguimiento de pruebas y cotizaciones, y Ventas ganadas y perdidas; y en Servicio, Consistencia del taller, Priorización de clientes del taller, Seguimiento del vehículo y Escalabilidad del taller. Pide, entre otras cosas, que cada prueba de manejo deje su siguiente paso, un proceso escrito para recibir el usado, que apartar un vehículo lo marque en el inventario, una sola lista de precios y bonos, la orden de trabajo con el presupuesto aprobado antes de reparar, el estado del vehículo avisado sin que el cliente llame, el recordatorio del mantenimiento y el aviso de cada llamado a revisión. En Automotriz, recordarle al dueño su mantenimiento es de Servicio, y ofrecerle cambiar de vehículo, de Ventas. No cambia ningún criterio de la matriz ni su cálculo.

**8.8.0 (2026-10-09).** Limpieza de la revisión de la 8.7, para que el consultor ubique a cada empresa en un nivel que la empresa reconozca: no entra ni sale ningún criterio y ningún identificador cambia. Las 24 preguntas se reescriben para que pregunten lo que decide Funcional en su dimensión, con las palabras del cliente y para contestarse describiendo, no con sí o no. Las frases de Deficiente e Inicial y sus señales siguen una sola regla, que ahora también dice Cómo se evalúa cada dimensión: Deficiente es que lo que pide Funcional no existe; Inicial, que existe a medias: sin regularidad, sin escribir, fuera del sistema o dependiendo de una persona. Ya no castigan que no se use IA ni niegan lo que recién pide Eficiente, y Deficiente e Inicial dicen cosas distintas; como esos dos niveles se asignan por el que mejor calza, leyendo la frase y sus señales en conjunto y no por cumplir cada señal, las señales conservan su identificador aunque cambie su redacción. Lo que no todas las empresas tienen abre con una condición: los canales que la empresa eligió en su plan, y no los cuatro; el canal conversacional, si se atiende por él; la agencia, que ya no cuenta en contra si el equipo es dueño del calendario, del brief, de la aprobación y de los accesos; y lo que no siempre existe —un ERP, un comité de compra, formularios en el sitio, más de un canal escrito, más de un agente, que se pidan calificaciones, un producto que se usa de forma continua, que Marketing le pase leads a Ventas o que entre alguien nuevo al equipo— cuenta solo donde existe. Las palabras que deciden tienen valor: el pronóstico confiable cae dentro de ±10 % en la mayoría de los meses, un negocio estancado es el que pasó el plazo que el proceso define para su etapa, «todo negocio» es desde la puesta en marcha y los duplicados se revisan cada trimestre. Óptimo dice qué hace la IA, quién valida y qué se ve en el sistema. Los resultados y los costos de quedarse prometen solo lo que entrega su nivel, y los mensajes de riesgo se reescriben para decir qué le pasa al cliente: reportes inflados, mensajes repetidos o un equipo que trabaja con información vieja. La escala dice vendedor, negocio, caso, cliente ideal, tablero, nutrición, fuga, pronóstico, puntaje de leads, indicador de salud, respuestas guardadas, material de venta, traspaso y revisión del pipeline, y Tracción del Deal pasa a llamarse Tracción del Negocio. Servicio deja de pedir en Funcional lo que ha pagado el cliente, que Ventas pide en Eficiente; los clientes clave los define cada empresa en su documento de tipos de cliente, y los criterios que los nombran lo requieren. Cambia a qué perfiles aplican seis criterios: las alertas tempranas de fuga o de oportunidad de crecer (3.7.E1) y medir al equipo de Servicio por la retención (3.4.O3) pasan de cliente recurrente a relación continua; el acuerdo de Marketing con Ventas (2.4.E3) y dos señales de Ventas pasan a venta con equipo, y una señal de Tecnología de Ventas, a venta sin vendedor. Catorce criterios pasan a ser hábito —se confirman en la remedición—, nueve cambian cómo se verifican y unos veinte suman lo que requieren. La regla de asignación suma la calidad de los datos, dónde vive la información, la protección contra la suplantación y los avisos automáticos al cliente. El glosario suma, entre otras, cliente clave, caso, caso de éxito, ficha del cliente, autoservicio y CSE; las entradas en inglés de lo que la escala ya dice en español —deal, ICP, churn, dashboard, nurturing, forecast, lead scoring, health score, macros, asset, journey, handoff, pipeline review y test A/B— pasan a la palabra en español, y la de rep sale. Entra el feedback del equipo: los datos que viven en otro sistema sin conectar, la regla de quién mantiene los datos y la confianza del cliente en Banca. Lo que el equipo dice de la escala se manda como feedback desde Nexus y lo decide un super admin, como dice Cómo leer este documento. En las ediciones, la tienda solo física y las aseguradoras se miden con la escala general, e Inmobiliaria cubre también corredoras y alquileres, con lo de proyecto propio bajo condición; cada edición dice con sus palabras lo que cambió en la general. Cambia cómo se lee cada dimensión, y lo que piden los niveles solo se precisa o se acota.

**8.7.0 (2026-10-01).** Óptimo dice qué se ve cuando la IA decide sola, sin nombrar herramientas. En Marketing, la IA decide qué mensaje recibe cada persona, por qué canal y en qué momento, y predice quién va a comprar y quién se va a ir; la personalización uno a uno llega también a la app. En Ventas, el canal y el momento de cada seguimiento se ajustan solos según cómo responde cada persona. En las tres áreas, lo que la IA puede decidir sola queda por escrito, y lo que decide se mide contra un grupo de control. Entran siete criterios: en Ventas, quién valida lo que hace la IA (1.4.O3) y medir sus seguimientos contra un grupo de control (1.8.O4); en Marketing, que lo que alguien hizo antes de dejar sus datos quede en su ficha (2.3.E4), una sola ficha por persona que se arma al momento (2.3.O5), las notificaciones de la app como parte de las campañas, si hay app (2.7.E5), y el grupo de control de los mensajes (2.8.O3); y en Servicio, el de los avisos (3.8.O4). La regla de automatización dice que, cuando la IA decide sola, el equipo fija las metas y los límites en vez de aprobar cada envío; la de asignación dice dónde va lo que la IA decide enviar y la predicción por persona, y el glosario suma «Grupo de control». Las ediciones deciden los criterios nuevos: casi todos se leen igual; Educación dice el de gobierno con «admisiones», Ecommerce y retail mide sus recordatorios, y en Banca no aplica el de la app, que ya pide como canal en Funcional. Cambia lo que piden Eficiente y Óptimo.

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

La matriz de la Parte 3 es la escala general, escrita para cualquier empresa. Una tienda, un banco, una universidad, una inmobiliaria, un hotel, un concesionario, un distribuidor de maquinaria o un operador de telecomunicaciones se reconocen mejor en una escala que habla de lo suyo: por eso cada edición les pone a las dimensiones de producción el nombre que tienen en esa industria, hace las preguntas y dice los costos con sus palabras, y suma los criterios que solo tienen sentido ahí.

## Qué cambia una edición y qué no

- **Lo que no cambia.** Las áreas, las dimensiones y sus identificadores; los cinco niveles; las marcas de cada criterio y lo que requiere; las reglas de la Parte 2 y el cálculo de la especificación. Las dimensiones de base operativa conservan su nombre, que es el mismo en las tres áreas.
- **Decir lo mismo con otras palabras.** Una edición puede reescribir un criterio de la matriz. El criterio conserva su identificador y sus marcas, y tiene que medir lo mismo y aplicar a los mismos, con los mismos umbrales: si cambia lo que se pide, no es una reescritura.
- **Criterios propios.** Lo que solo tiene sentido en la industria entra como un criterio propio de la edición. Lleva un identificador del bloque de su edición —del 101 al 199 en la primera, del 201 al 299 en la segunda, y así con cada una—, para que no se cruce con la numeración de la matriz ni con la de otra edición.
- **Criterios que no aplican.** Una edición puede decir que un criterio de la matriz no aplica a su industria. Sale de la cuenta, igual que uno que no corresponde al perfil de negocio, y si otro criterio lo requería, ese requerido se deja de lado en la edición. Lo que no puede hacer es sacar una dimensión entera.
- **Todo criterio queda decidido.** Si una edición toca los criterios de una dimensión, dice algo de todos los de la matriz: lo reescribe, lo saca o lo deja como está. Así, cuando la matriz suma un criterio, cada edición tiene que decidir qué hace con él.
- **Lo que una edición no dice, vale como está en la matriz.** Una dimensión de la que la edición solo cambia el nombre, la pregunta o el costo se sigue midiendo con los criterios generales, y la tabla de palabras de la edición dice cómo se llama cada cosa en la industria.

## Cómo se mide con una edición

Una unidad se mide con la escala general o con una sola edición, la de su industria, si esa edición la cubre: cada una dice en su encabezado para quién es, y quien queda fuera —una tienda solo física, una aseguradora— se mide con la escala general. El perfil de negocio sigue decidiendo qué criterios aplican dentro de la edición. El avance se compara entre mediciones hechas con la misma edición: si una unidad pasa de la escala general a una edición, o de una edición a otra, esa medición es una línea base nueva.

Una edición puede darle criterios a una dimensión que en la escala general no aplica a un perfil. Pasa en la de ecommerce y retail: en la venta transaccional, la dimensión de personalización de Ventas no aplica en la escala general, y en la edición mide la oferta que la tienda le hace a cada comprador. Y pasa en la de banca, donde esa dimensión mide también a quién se le ofrece cada producto cuando el cliente lo contrata solo.

Una edición se escribe por áreas, y un área que la edición no escribe se mide con la escala general. Las ocho ediciones de hoy —Ecommerce y retail, Banca y servicios financieros, Educación, Inmobiliaria, Turismo, Automotriz, Maquinaria y equipo pesado y Telecomunicaciones— traen las tres áreas enteras.

## Cómo se escribe una edición

Igual que la matriz, y solo lo que cambia. Abre con para quién es, su clave —que no cambia aunque la edición cambie de nombre—, su perfil habitual y desde qué número van sus criterios propios. Siguen la tabla de palabras y, después, cada área y cada dimensión que cambia. Un criterio reescrito lleva en la etiqueta solo su identificador, y conserva lo que requiere en la matriz; uno propio lleva la etiqueta completa, con lo que requiere si no se puede cumplir sin otro. Al final de cada dimensión van los criterios de la matriz que no aplican y los que se leen igual. Cada nivel de cada dimensión dice al menos un criterio con las palabras de la industria, reescrito o propio: si un nivel se lee entero con el texto general, la empresa de esa industria no se reconoce en él.

## Edición — Ecommerce y retail

Para quien vende productos al consumidor final en una tienda en línea, sola o junto con tiendas físicas: el cliente compra solo, sin que un vendedor trabaje cada venta, y lo que se busca es que vuelva. La tienda solo física se mide con la escala general.

*Clave:* ecommerce-retail

*Perfil habitual:* transaccional · recompra.

*Criterios propios:* desde el 101.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Negocio | Pedido o carrito |
| Lead | Visitante o interesado que todavía no compra; donde vende un equipo, se sigue diciendo lead |
| Pipeline | El recorrido de la compra: carrito, pago y entrega |
| Revisión del pipeline | Revisión de ventas |
| Propuesta | La ficha del producto y su oferta |
| Razón de pérdida | El paso donde se abandonó la compra |
| Caso | Caso de posventa: una consulta, un cambio o una devolución |
| Buyer persona | Perfil de comprador: quién compra en la tienda, qué busca y qué lo hace comprar |

### Área 1 — Ventas

Mide el rendimiento de la venta de la tienda: cómo está montada por dentro y qué produce en pedidos, valor por pedido y recompra. Vale igual si la venta la lleva un equipo o una sola persona, y si se cierra en la tienda en línea, en la caja de la tienda física, en un marketplace o con un vendedor.

**Deficiente.** Tu tienda vende, pero nadie sabe bien cómo. Los pedidos viven en la plataforma o en la caja y no llegan a un sistema común, los precios cambian según el canal y los carritos abandonados se pierden sin que nadie los vea.

**Inicial.** Tienes la tienda armada, pero cada canal va por su cuenta. Los pedidos entran a medias al sistema, los reportes se arman a mano y los recordatorios, si salen, salen a mano.

**Funcional.** Tu tienda opera como una maquinaria base. Cada venta entra sola al sistema con su monto, su canal y su fecha, y con su cliente cuando el comprador se identifica; la oferta es la misma en todos los canales; ningún carrito se abandona sin un recordatorio, y cada cliente identificado recibe, después de comprar, una invitación a volver.

**Eficiente.** La tienda deja de tratar igual a todos. Mides la conversión paso a paso; donde los productos se acaban, sabes cada cuánto se recompra cada uno y el recordatorio sale en ese momento; tus mejores clientes tienen un trato distinto y las pruebas son parte de la rutina.

**Óptimo.** La IA hace el trabajo fino y tu equipo valida y decide dónde crecer. Cada comprador ve una tienda pensada para él, la IA calcula cuándo le toca volver y con qué oferta, y detecta dónde se cae la compra antes de que alguien lo note.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido operan la tienda las personas de tu equipo, desde que se publica un producto hasta que se entrega el pedido?

*Descripción:* Mide si la tienda opera con un proceso escrito y un calendario comercial, no con la memoria de una persona.

*Costo de quedarse:* Si se va quien administra la tienda, se lleva cómo se publica, cómo se cambia un precio y cuándo toca cada promoción: todo se vuelve a improvisar.

**Deficiente.** Sin proceso. La tienda se maneja de memoria: nadie escribió cómo se publica, cómo se cambia un precio ni cuándo toca cada promoción.

- No existe ningún documento de cómo se opera la tienda; cada quien resuelve a su criterio. `[1.1.D1]`
- No hay una reunión para revisar las ventas de la tienda: se habla de ellas solo cuando algo se complica. `[1.1.D3]`
- Si se va quien administra la tienda, nadie sabe cómo seguir operándola. `[1.1.D4]`
- Las promociones se deciden sobre la marcha, sin calendario. `[1.1.D101 · declarado]`

**Inicial.** Hay pasos acordados de palabra, pero cada quien los hace a su manera y las ventas se revisan cuando hay tiempo.

- Hay pasos acordados de palabra para publicar y para armar una promoción, pero cada quien los hace distinto. `[1.1.I1]`
- La revisión de ventas se hace cuando hay tiempo, sin una fecha fija ni un orden para repasar los canales y los pedidos. `[1.1.I3]`
- Que un pedido quede bien registrado depende de quién lo cargue, no de un proceso o rutina. `[1.1.I4]`

**Funcional.** Todo el equipo opera la tienda con los mismos pasos escritos: un solo recorrido del pedido en todos los canales, un calendario de promociones y una revisión de ventas en fecha fija.

*Resultado:* Todo el equipo opera la tienda igual: los pedidos siguen el mismo recorrido en todos los canales, las promociones salen de un calendario y las ventas se revisan en una fecha fija, así que si se va una persona, la tienda sigue vendiendo.

- Cualquiera del equipo explica igual el recorrido de un pedido —carrito, pago, preparación y entrega— y sus etapas. `[1.1.F1]`
- El recorrido del pedido está configurado con sus etapas, y cada canal de venta —tienda en línea, tienda física o marketplace— registra sus pedidos con ese mismo recorrido. `[1.1.F2]`
- La revisión de ventas se hace en una fecha fija, cada semana o cada quince días. `[1.1.F5]`
- La operación de la tienda está documentada: cómo se publica un producto, cómo se cambia un precio y cómo se arma una promoción. `[1.1.F101 · declarado]`
- Hay un calendario comercial —temporadas, promociones y lanzamientos— con al menos un trimestre de horizonte, y la mayoría de lo que marca sale en la fecha prevista. `[1.1.F102 · declarado · hábito]`

**Eficiente.** El líder comprueba con datos que la tienda se opera como está escrito, cada promoción sale con un objetivo y se revisa al cerrar, y lo que se publica pasa antes por una lista de revisión.

*Resultado:* El líder sabe con datos dónde la tienda se sale de lo escrito y lo corrige, no de memoria, y cada promoción se planifica con un objetivo y se revisa al cerrar; donde vende un equipo, además, todos venden con un mismo método.

- El líder comprueba con datos del sistema, no de memoria, que la tienda se opera como está escrito. `[1.1.E3]`
- Cada promoción sale con un objetivo escrito y se revisa al cerrar: qué vendió, a quién y qué margen dejó. `[1.1.E101 · declarado · hábito]`
- Hay una lista de revisión antes de publicar un producto o una promoción, y se usa. `[1.1.E102 · evaluado · hábito]`

**Óptimo.** La IA vigila la operación de la tienda y avisa cuando algo se sale de lo normal; el líder decide qué se corrige.

*Resultado:* Nadie tiene que vigilar a mano la operación de la tienda: la IA señala lo que se sale de lo normal, el líder decide qué se corrige y el equipo dedica su tiempo a probar mejoras en pilotos cortos.

*No aplican:* `1.1.D2`, `1.1.I2`, `1.1.F4`.

*Se leen igual:* `1.1.F6`, `1.1.F7`, `1.1.F8`, `1.1.E1`, `1.1.E2`, `1.1.E5`, `1.1.E6`, `1.1.O2`, `1.1.O3`, `1.1.O4`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien compra en la tienda en línea o en la caja?

*Descripción:* Mide si la tienda, la caja y el CRM trabajan como un solo sistema, y cuánto trabajo repetitivo se automatiza.

*Costo de quedarse:* Pasas datos a mano entre la tienda, la caja y el CRM, y el comprador espera la confirmación y el estado de su pedido, que podrían llegarle solos.

**Deficiente.** La tienda y la caja venden, pero sus datos no llegan a ningún sistema común.

- Los datos de los compradores viven en la plataforma de la tienda, en la caja, en un sistema aparte o en hojas sueltas, y no llegan a un sistema común. `[1.2.D1]`
- No hay un CRM donde montar una automatización: los pedidos y los datos de los compradores se pasan por correo, por chat o de palabra, y nadie recibe avisos del sistema. `[1.2.D2]`

**Inicial.** La tienda está conectada a medias: parte de los datos se pasa a mano.

**Funcional.** Lo básico pasa solo: cada venta entra al sistema, el catálogo sale de un solo lugar a todos los canales y el comprador recibe la confirmación y el estado de su pedido.

*Resultado:* Cada venta llega sola al sistema sin que nadie la pase a mano, y el comprador recibe la confirmación de su pedido y los avisos de su estado sin que alguien tenga que escribirle.

- Cada venta de la tienda en línea y de la caja entra sola al sistema como un pedido, con su monto, su canal y su fecha, y con su cliente cuando el comprador se identifica. `[1.2.F6]`
- Si lo que se vende tiene existencias limitadas, el comprador ve en la tienda qué hay disponible antes de comprar, y el equipo lo ve en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8]`
- El comprador recibe sola la confirmación de su pedido y los avisos de cada cambio de estado. `[1.2.F101 · comprobable]`
- El catálogo —productos, precios y existencias— se administra en un solo lugar, y de ahí sale a todos los canales. `[1.2.F102 · comprobable]`

**Eficiente.** Las secuencias del carrito y de después de la compra se adaptan a lo que hace cada comprador, la tienda se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario.

*Resultado:* El equipo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué paso se cae la compra.

- Si el inventario o la facturación se llevan en un sistema aparte —un ERP u otro—, la tienda está conectada con él. `[1.2.E3]`

**Óptimo.** La IA calcula qué clientes están por comprar y la tienda se ajusta con lo que aprende de cada compra; si la tienda atiende por un canal conversacional, agentes de IA atienden y venden ahí, y el equipo revisa lo que hacen y se queda con lo que no resuelven.

*Resultado:* La tienda ajusta lo que muestra con lo que aprende de cada compra y, si atiende por un canal conversacional, los agentes de IA responden y cierran las compras simples a cualquier hora, sin que el equipo tenga que estar.

- Si la tienda atiende por un canal conversacional, agentes de IA atienden ahí a cualquier hora: responden dudas de producto, ayudan a terminar la compra y le pasan a una persona, con el contexto, lo que no pueden resolver; el equipo revisa en el CRM lo que respondieron. `[1.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a la tienda y al CRM: por ejemplo, el valor esperado de cada cliente decide qué oferta ve. `[1.2.O3]`

*Se leen igual:* `1.2.I1`, `1.2.I2`, `1.2.F2`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.F9`, `1.2.E1`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de ventas de tu tienda antes de usarlo para decidir?

*Descripción:* Mide si los datos de la tienda son confiables para decidir: pedidos completos, de dónde llegó cada comprador, clientes identificados y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: la plataforma dice una cosa, la caja otra, y no sabes cuántos de tus compradores son los mismos.

**Deficiente.** Los números de la tienda no cuadran: cada sistema dice una cosa y nadie sabe bien cuánto vende cada canal.

- No hay una regla de qué datos del comprador se registran ni de quién los corrige: cada quien llena lo que le parece y nadie revisa lo que falta. `[1.3.D1]`
- No se sabe cuánto vende cada canal; sacar un reporte confiable es imposible. `[1.3.D2]`
- Las ventas que se cierran fuera de la plataforma —por chat, por teléfono o en una caja sin sistema— no quedan registradas con su monto y su fecha: no se sabe cuánto vendió la tienda en total ni cuándo. `[1.3.D4]`

**Inicial.** Hay datos en el sistema, pero incompletos: el reporte de ventas hay que corregirlo a mano antes de usarlo.

- En los pedidos que entran hoy, de dónde llegó el comprador queda registrado solo en una parte: en los demás se anota a mano, cuando alguien se acuerda, o queda vacío. `[1.3.I2]`
- Los pedidos que entran hoy se registran, pero a algunos les falta la fecha, el monto o el canal. `[1.3.I3]`

**Funcional.** El reporte de ventas sale del sistema, sin armarlo a mano, y se le puede creer.

*Resultado:* El líder ve cuánto vendió cada canal cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada pedido y qué parte de sus compradores puede volver a contactar.

- Todo pedido registrado desde la puesta en marcha del recorrido actual de la compra tiene fecha, monto y canal. `[1.3.F1]`
- Todo pedido registrado desde la puesta en marcha del recorrido actual de la compra dice de dónde llegó el comprador. `[1.3.F3]`
- El reporte de ventas se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4]`
- Se sabe qué parte de las ventas, en línea y en caja, queda asociada a un cliente identificado, y ese número se revisa al menos una vez al mes. `[1.3.F8]`

**Eficiente.** Aparece un pronóstico de ventas confiable, y los compradores dejan de ser anónimos.

*Resultado:* La empresa puede comprometer un número de ventas y planear sus existencias con confianza, y sabe quiénes son sus compradores.

- Hay un pronóstico de las ventas de la tienda que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% del pronóstico. `[1.3.E1]`
- La mayoría de las ventas, en línea y en caja, quedan asociadas a un cliente identificado, no a un cliente genérico. `[1.3.E4]`
- Cada cliente tiene calculado cuánto compra, cada cuánto y cuándo fue su última compra. `[1.3.E101 · comprobable]`

**Óptimo.**

- Cada visita, cliente y pedido se asocia solo, al entrar, con lo que ya había de esa persona; la IA resuelve los dudosos y una persona valida solo las excepciones que el sistema le marca. `[1.3.O1]`

*Se leen igual:* `1.3.D3`, `1.3.I1`, `1.3.F2`, `1.3.F9`, `1.3.F10`, `1.3.E3`, `1.3.E5`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué canal de la tienda va bien y cuál necesita ayuda?

*Descripción:* Mide si cada persona tiene su rol por escrito y cada canal una meta, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* Nadie responde por el número de la tienda: los precios y las promociones se deciden por costumbre, y los problemas aparecen cuando el mes ya cerró.

**Deficiente.** Nadie responde por las ventas de la tienda: cada quien trabaja sobre la marcha y los problemas se atienden cuando ya estallaron.

- Quienes llevan la tienda operan sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1]`

**Inicial.**

- El líder revisa algunos números de la tienda —las ventas, los pedidos— en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`
- Los reportes de cómo opera el equipo de la tienda —ventas y pedidos de cada canal— se arman a mano. `[1.4.I2]`

**Funcional.** Cada persona tiene su rol por escrito y cada canal su meta, el líder sigue un tablero cada semana y en la revisión de ventas cada quien rinde cuentas.

*Resultado:* Cada persona sabe qué parte de la tienda le toca, y el líder sabe cada semana qué canal va bien y cuál necesita ayuda, antes de que termine el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —ventas, pedidos, valor promedio del pedido, conversión, carritos abandonados— y lo consulta al menos una vez por semana. `[1.4.F2]`
- En la revisión de ventas se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y se entera por una alerta cuando un canal cae o una meta está en riesgo.

*Resultado:* Una persona nueva opera la tienda más rápido, y el líder se entera de los riesgos por una alerta y no al cierre del mes.

- El líder recibe alertas automáticas de las ventas de cada canal: una caída o una meta en riesgo. `[1.4.E101 · comprobable]`
- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo y cuánto margen deja cada canal y cada producto. `[1.4.E6]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal y qué producto dejan más margen, y cuánto vale cada cliente en el tiempo.

*Se leen igual:* `1.4.D2`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E2`, `1.4.E3`, `1.4.E4`, `1.4.E5`, `1.4.O2`, `1.4.O3`, `1.4.O4`.

#### 1.5 Catálogo y oferta

¿Cómo ve el comprador cada producto —ficha, precio y condiciones— en los canales donde vendes?

*Descripción:* Mide si el cliente ideal de la tienda está escrito, si el catálogo está completo y ordenado, y si precios, promociones y condiciones coinciden en todos los canales.

*Costo de quedarse:* El comprador ve un precio en la web y otro en la tienda, o una ficha sin foto ni descripción: duda, compara y se va con quien se lo muestra más claro.

**Deficiente.** Nadie sabe decir quién es el cliente ideal de la tienda, y el comprador ve una tienda distinta según por dónde entre, con fichas incompletas y armadas cada una a su manera.

- Nadie puede decir con claridad quién es el cliente ideal de la tienda, y lo que el comprador ve de un producto cambia según el canal por donde entre. `[1.5.D1]`
- Hay productos publicados sin foto, sin descripción o sin precio. `[1.5.D101 · comprobable]`

**Inicial.** El cliente ideal de la tienda está en la cabeza del líder, y las fichas y los precios todavía varían entre productos y entre canales.

- El líder sabe quién es el cliente ideal de la tienda y hay un mensaje común, pero solo de palabra o en un borrador: cada quien los repite a su manera. `[1.5.I1]`
- Las fichas de los productos más vendidos están completas; las del resto, a medias. `[1.5.I101 · comprobable]`

**Funcional.** El cliente ideal de la tienda está escrito, el catálogo está completo y la oferta es la misma en todos los canales.

*Resultado:* El comprador encuentra cada producto con la misma ficha, el mismo precio y las mismas condiciones, entre por donde entre.

- Existe un documento con la definición del cliente ideal de la tienda —a quién le vende y qué busca—, consultable por cualquiera del equipo. `[1.5.F1]`
- Cada producto publicado tiene su ficha completa —fotos, descripción y precio— con una misma estructura. `[1.5.F101 · comprobable]`
- Las condiciones de compra —envío, cambios, devoluciones y garantía— están escritas y a la vista antes de pagar. `[1.5.F102 · comprobable]`

**Eficiente.** La tienda se ordena como compra el cliente y promete solo lo que entrega.

*Resultado:* El comprador ve qué distingue a la tienda, encuentra rápido lo que busca y recibe lo que la ficha le prometió.

- El catálogo está organizado como busca el cliente —categorías, filtros y buscador—, y se revisa con los datos de qué se busca y no se encuentra. `[1.5.E101 · comprobable · hábito]`
- Lo que promete la ficha es lo que llega: se mide cuántas devoluciones son por «no era lo que esperaba». `[1.5.E102 · comprobable · hábito · requiere 1.8.F101]`

**Óptimo.** La IA mantiene fichas, precios y mensajes iguales a la oferta vigente en todos los canales, y el equipo valida lo que se sale.

*Resultado:* Se pueden sumar productos y canales sin que la oferta se desordene: la IA mantiene fichas, precios y mensajes iguales a la oferta vigente, marca lo que se sale y el equipo solo valida eso.

- La IA revisa en tiempo real fichas, precios y mensajes en todos los canales y los mantiene iguales a la oferta vigente; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I2`, `1.5.I3`, `1.5.F2`, `1.5.F3`, `1.5.F4`, `1.5.F5`, `1.5.F6`, `1.5.E2`, `1.5.E3`, `1.5.E4`.

#### 1.6 Oferta por cliente

¿Qué hace distinto tu tienda con quien compra por primera vez y con quien compra seguido?

*Descripción:* Mide si la tienda distingue a sus compradores y le ofrece a cada uno lo que le conviene.

*Costo de quedarse:* Le muestras lo mismo a quien compra cada mes que a quien entra por primera vez: el valor de cada pedido no sube y tus mejores clientes no se sienten distintos.

**Deficiente.** Todos los compradores ven la misma tienda y la misma oferta.

- La tienda no distingue a quien compra por primera vez de quien compra seguido. `[1.6.D101 · comprobable]`

**Inicial.** Se sabe quiénes compran seguido, pero separarlos depende de cada quien y la tienda todavía no les ofrece nada distinto.

- Los compradores se separan en alguna lista o con una etiqueta, pero cada quien lo hace con su propio criterio. `[1.6.I1]`
- El líder sabe quiénes compran seguido, pero el sistema no tiene cómo separarlos de quienes compran por primera vez. `[1.6.I2]`

**Funcional.** La tienda distingue al menos a quien compra por primera vez de quien vuelve, y le sugiere a cada uno algo más que lo que vino a buscar.

*Resultado:* Quien compra por primera vez y quien compra seguido reciben ofertas distintas, y cada compra trae una sugerencia que tiene sentido.

- Los compradores se separan al menos en nuevos y recurrentes, y cada grupo recibe en la tienda una oferta distinta. `[1.6.F101 · comprobable · requiere 1.2.F6]`
- Al ver un producto o el carrito, el comprador recibe sugerencias de productos relacionados. `[1.6.F102 · comprobable]`

**Eficiente.** Las ofertas salen de la historia de compra, y los mejores clientes tienen un trato propio.

*Resultado:* Cada comprador ve ofertas que salen de lo que él compra, el valor promedio del pedido sube con la venta cruzada, y los mejores clientes lo notan.

- Las sugerencias y las ofertas salen de la historia de compra de cada cliente: qué compró, cuánto y cada cuánto. `[1.6.E101 · comprobable · requiere 1.3.E101]`
- Los mejores clientes están identificados y tienen un trato distinto: acceso anticipado, beneficios o atención preferente. `[1.6.E102 · comprobable · requiere 1.3.E101]`
- Se mide el valor promedio del pedido y cuánto de la venta viene de sugerencias, paquetes y venta cruzada. `[1.6.E103 · comprobable]`

**Óptimo.** La IA arma la tienda para cada comprador en tiempo real, dentro de las reglas que fija el equipo, y el equipo revisa lo que muestra.

*Resultado:* Cada comprador ve una tienda pensada para él —qué productos, en qué orden y con qué oferta—, sin que nadie arme un segmento a mano.

- Las ofertas usan lo que saben Servicio y Marketing de cada cliente: sus reclamos, sus devoluciones y las campañas que ya recibió. `[1.6.O102 · comprobable]`
- La IA decide qué mostrarle a cada comprador —productos, orden y oferta— en tiempo real, según su comportamiento y también a quien todavía no dejó sus datos, dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa. `[1.6.O103 · comprobable · tráfico suficiente]`

*No aplican:* `1.6.D1`.

*Se leen igual:* `1.6.F1`, `1.6.F2`, `1.6.F3`, `1.6.F4`, `1.6.E3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O3`, `1.6.O4`, `1.6.O5`.

#### 1.7 Carrito y recompra

¿Qué pasa con quien no terminó de comprar, o con quien ya debería haber vuelto?

*Descripción:* Mide si la tienda recupera las compras que quedaron a medias y si le recuerda a cada cliente cuándo volver.

*Costo de quedarse:* Los carritos se abandonan en silencio y quien compró una vez no vuelve a saber de ti: pagas por traer compradores nuevos y pierdes los que ya tenías.

**Deficiente.** Nadie ve los carritos que se abandonan ni a los clientes que dejaron de comprar.

- Nadie se da cuenta de los carritos que se abandonan. `[1.7.D2]`
- Los carritos abandonados no quedan registrados. `[1.7.D3]`
- Quien compró no vuelve a recibir nada de la tienda, salvo promociones generales. `[1.7.D101 · comprobable]`

**Inicial.** Hay recordatorios, pero salen a mano y por un solo canal.

- Todos los intentos de recuperar una compra se hacen por el mismo canal. `[1.7.I4]`
- Los recordatorios de carrito salen a mano o cuando alguien se acuerda, no cada vez que se abandona uno. `[1.7.I102 · comprobable]`

**Funcional.** Ningún carrito se abandona en silencio, y cada cliente identificado recibe una invitación a volver.

*Resultado:* Las compras que quedaron a medias se recuperan por más de un canal, y cada cliente identificado recibe una invitación a volver a comprar, sin depender de que alguien se acuerde.

- La recuperación usa al menos dos canales, por ejemplo correo y el canal conversacional, como WhatsApp. `[1.7.F2]`
- Después de cada compra, el cliente identificado recibe de forma automática una invitación a volver: un recordatorio, una recomendación o un incentivo. `[1.7.F101 · comprobable · recompra · requiere 1.2.F6]`

**Eficiente.** La recuperación y la recompra combinan varios canales, se mide cuánto recuperan y, donde los productos se acaban, el recordatorio llega cuando toca.

*Resultado:* La tienda recupera compras y clientes por varios canales y sabe cuánto recupera con cada mensaje; donde los productos se acaban, cada cliente recibe el recordatorio justo cuando le toca volver.

- La recuperación de carritos y la recompra combinan al menos tres canales —por ejemplo, correo, el canal conversacional y notificaciones— en una secuencia definida. `[1.7.E1]`
- Si la tienda vende productos que se acaban o caducan, cada uno tiene medido cada cuánto se vuelve a comprar, y el recordatorio sale en ese momento. `[1.7.E101 · comprobable · recompra · requiere 1.3.E4]`
- Se mide cuántos carritos se recuperan y cuántos clientes vuelven a comprar, y con qué mensaje. `[1.7.E102 · comprobable]`
- Quien mostró interés en un producto agotado o caro recibe solo el aviso cuando vuelve a haber o cuando baja de precio. `[1.7.E103 · comprobable]`

**Óptimo.** La IA calcula cuándo le toca volver a cada cliente y con qué oferta, y decide el canal y el momento de cada recordatorio; el equipo valida.

*Resultado:* Cada cliente recibe su recordatorio en el momento y por el canal en que más le sirve, sin que nadie lo programe.

- La IA decide el canal y el momento de cada recordatorio, comprador por comprador y según cómo responde, dentro de los límites que fijó el equipo; el equipo revisa los resultados, y lo que decide la IA queda registrado en el sistema. `[1.7.O2]`
- La IA calcula cuándo le toca volver a comprar a cada cliente según su propio consumo y ajusta la oferta, dentro de los límites que fijó el equipo; el cálculo y la oferta se ven en la ficha del cliente y el equipo los revisa. `[1.7.O101 · comprobable · recompra]`

*No aplican:* `1.7.D1`, `1.7.I1`, `1.7.I2`.

*Se leen igual:* `1.7.D4`, `1.7.I3`, `1.7.F1`, `1.7.F3`, `1.7.F4`, `1.7.F6`, `1.7.F7`, `1.7.E2`, `1.7.E3`, `1.7.E4`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O3`.

#### 1.8 Embudo de compra

¿Qué queda registrado cuando un comprador abandona la compra, cancela o devuelve un pedido?

*Descripción:* Mide si queda registrado en qué paso se abandona cada compra y por qué se cancela o se devuelve cada pedido, y si la tienda revisa las compras que se concretan y las que se caen para probar y mejorar.

*Costo de quedarse:* No sabes en qué paso se cae la compra ni por qué te devuelven pedidos: cada quien tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Deficiente.** Nadie mira dónde se cae la compra ni por qué se devuelve.

- Cuando una compra se abandona o un pedido se cancela o se devuelve, no hay una razón en la que el equipo coincida: cada quien da su versión, de memoria. `[1.8.D1]`
- Las razones por las que el comprador no termina o devuelve se pierden. `[1.8.D2]`

**Inicial.** Se comenta de vez en cuando por qué no se vende, sin números.

- El motivo de una cancelación o de una devolución se anota a veces y en texto libre, a criterio de cada quien, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada compra abandonada queda con el paso donde se cayó, cada cancelación o devolución con su razón, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe en qué paso se abandona la compra y por qué se cancelan o se devuelven los pedidos, con datos del trimestre y no con impresiones.

- Toda compra abandonada desde la puesta en marcha del recorrido actual de la compra queda con el paso donde se abandonó. `[1.8.F1]`
- Los pasos de la compra y los motivos de cancelación y devolución usan una lista definida, no texto libre. `[1.8.F2]`
- El líder puede sacar del sistema el reporte del trimestre de dónde se abandona la compra, sin armarlo a mano. `[1.8.F3]`
- Cada pedido cancelado o devuelto deja registrada su razón. `[1.8.F101 · comprobable]`

**Eficiente.** Cada trimestre se revisa por qué se concretan o se caen las compras, lo aprendido cambia la tienda y cada mes hay al menos una prueba activa.

*Resultado:* Lo que más se repite en las compras que se caen se corrige y lo que hace que una compra se concrete pasa a ser parte de la tienda: lo que muestra la revisión de cada trimestre cambia las fichas, los precios o los pasos del pago.

- Al menos una vez por trimestre se revisan las compras que se concretan y las que no —abandonos, cancelaciones y devoluciones— para encontrar lo que se repite. `[1.8.E1]`
- La tienda —fichas, precios y pasos del pago— se ajusta con base en lo aprendido. `[1.8.E2]`
- Hay pruebas regulares en la tienda, al menos una activa por mes: una ficha, un precio o un paso del pago. `[1.8.E101 · comprobable · hábito]`

**Óptimo.** La IA detecta dónde y por qué se cae la compra y propone el cambio; el líder decide cuál se aplica.

*Resultado:* La tienda mejora mientras vende: la IA señala dónde se cae la compra y qué cambio probar, el líder decide cuál se aplica y la dirección ajusta la estrategia con esa evidencia; donde vende un equipo, cada vendedor recibe además recomendaciones sobre sus propias llamadas.

- Los recordatorios que decide la IA se miden contra un grupo de control, y en el sistema se ve cuánto agregan; con eso el equipo revisa los límites que le fijó a la IA. `[1.8.O4]`
- La IA detecta dónde y por qué se abandona la compra y propone el cambio o lo lanza como prueba; lo que propone queda en el sistema y el líder valida cada cambio. `[1.8.O101 · comprobable]`

*Se leen igual:* `1.8.E3`, `1.8.E4`, `1.8.O1`.

### Área 2 — Marketing

Mide el rendimiento del marketing de la tienda: cómo está montado por dentro y qué produce en visitas, compradores nuevos y ventas de cada campaña. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que la tienda dirige.

**Deficiente.** Lo que la gente piensa de tu tienda no lo decides tú. Cada pieza sale con otro tono y otra imagen, las herramientas no se hablan entre sí, y la pauta corre hasta que se acaba el presupuesto sin que nadie mida cuánto vendió. Los compradores que llegan, llegan por casualidad.

**Inicial.** Tienes logo, colores y redes, pero ningún plan detrás. Pagas herramientas que se usan a medias y parte de lo que entra se pasa a mano, las promociones se anuncian cuando alguien se acuerda, y cuánto vendió cada campaña se sabe tarde y armando los números a mano, sin que lo aprendido quede escrito. Las ventas que trae el marketing suben y bajan, y no siempre sabes de dónde viene cada comprador.

**Funcional.** Tu marketing ya no vive en la cabeza de una persona. Tienes por escrito tu marca y tus perfiles de comprador, las herramientas que pagas se usan de verdad, y los canales que elegiste en tu plan —correo, pauta, redes o WhatsApp— salen con regularidad, con cada promoción coordinada bajo un mismo calendario. Los reportes salen del sistema, sin armarlos a mano: sabes de dónde viene cada comprador y cuánto te cuesta cada venta en cada canal. Las ventas que trae el marketing ya se miden, aunque todavía no se afinan con pruebas.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la próxima temporada. Los datos de cada comprador se completan solos y sabes cuánto vendió cada canal y cada campaña, no solo cuál trajo el primer clic; los segmentos y el puntaje de cada suscriptor se arman solos, y las campañas se adaptan solas a cada segmento; la IA asiste a tu equipo en su trabajo diario, y la tienda aparece cuando alguien busca lo que vendes, también en los asistentes de IA. La pauta se mueve entre canales según lo que cuesta cada venta, y cada reseña, buena o mala, recibe respuesta.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido se genera y se ajusta de forma continua; cada comprador recibe el mensaje que corresponde a lo que hizo antes; la pauta se reparte sola entre canales mientras la campaña corre, dentro de los límites que fija el equipo; y los compradores contentos traen compradores nuevos. El equipo decide la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma una campaña en tu tienda —una promoción o un lanzamiento—, desde que se decide hasta que se publica?

*Descripción:* Mide si las campañas de la tienda salen de un calendario y un proceso compartidos, sin depender de nadie.

*Costo de quedarse:* Cada promoción depende de quien la arma: si esa persona falta, la campaña de la temporada sale tarde o no sale.

**Deficiente.** Cada quien arma las campañas a su criterio; no hay calendario ni reuniones.

- No hay calendario de campañas: las piezas de cada promoción se improvisan a última hora. `[2.1.D1]`

**Inicial.**

- Hay un calendario de campañas, pero se llena cuando se puede y las promociones salen a medias. `[2.1.I1]`

**Funcional.**

*Resultado:* Las promociones y los lanzamientos siguen saliendo aunque cambie una persona: el calendario de campañas y el proceso no viven en la cabeza de nadie, todo el equipo trabaja en el mismo sistema y el líder sabe en qué va cada campaña sin tener que preguntar.

- Existe un calendario de campañas visible para el equipo —qué pieza sale, por qué canal y en qué fecha—, con horizonte de al menos un trimestre. `[2.1.F1]`
- Existe un proceso escrito para armar cada campaña —qué se pide, quién la produce y cómo se publica— que el equipo aplica de forma consistente. `[2.1.F2]`
- Hay una reunión de resultados de las campañas con cadencia fija (semanal o quincenal) que se sostiene. `[2.1.F3]`

**Eficiente.**

**Óptimo.**

- El sistema detecta por sí mismo cuando una promoción se sale del proceso —un paso que se saltó, una fecha que venció, como la de una temporada— y se lo avisa al líder y al responsable; el líder decide el ajuste, y cada aviso queda en el sistema. `[2.1.O4]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I2`, `2.1.I3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E4`, `2.1.E5`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien se suscribe en tu tienda en línea o te escribe por WhatsApp o el chat?

*Descripción:* Mide si las herramientas de marketing que paga la tienda se usan, si lo que entra llega solo al sistema, si el catálogo y las compras alimentan solos los anuncios, y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Lo que entra por tu tienda en línea o por mensajes —una suscripción, una pregunta por WhatsApp— espera a que alguien lo cargue y lo conteste, o se pierde, y si pagas herramientas de marketing, parte de lo que pagas no se usa.

**Deficiente.**

- No hay un sistema donde registrar a los suscriptores y a quienes dejan sus datos: se llevan en hojas de cálculo o en el correo, y las listas de cada campaña se arman a mano. `[2.2.D1]`
- Lo que llega por la tienda en línea o por mensajes —una pregunta por WhatsApp, un mensaje en Instagram— cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`

**Inicial.**

- La tienda paga licencias o módulos de sus herramientas de marketing —de correo, de mensajería o de anuncios— que el equipo no usa. `[2.2.I1]`
- Algunos puntos de la tienda donde se dejan datos —la suscripción al boletín o la ventana de bienvenida— no están conectados al sistema, o ninguno de los canales conversacionales por los que atiende la tienda lo está: lo que entra por ahí se pasa a mano o se pierde. `[2.2.I2]`
- Hay alguna automatización, pero quedó a medias: unos puntos de captura de la tienda mandan la bienvenida o el cupón prometido, y otros no responden ni le avisan a nadie. `[2.2.I3]`

**Funcional.** Las herramientas que paga la tienda se usan, lo que entra llega solo al sistema y recibe respuesta, y si hay anuncios de producto, el catálogo y las compras de la tienda los alimentan solos.

*Resultado:* Todo lo que entra por la tienda en línea y, si se usa, por WhatsApp o el chat llega al sistema y recibe respuesta, no se paga por herramientas que nadie usa, y si la tienda pauta, sus anuncios de producto salen solos del catálogo y su pauta se mide por lo que vende.

- Si la tienda en línea tiene puntos donde dejar datos —la suscripción al boletín, la ventana con un descuento de bienvenida, el aviso de disponibilidad—, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Si la tienda atiende por un canal conversacional —WhatsApp, el chat de la tienda o los mensajes de Instagram—, al menos uno está conectado al sistema con una bandeja básica donde se atiende lo que entra, lo atienda Marketing o Ventas. `[2.2.F4]`
- Si el equipo usa IA, esta tiene como contexto la voz de la tienda y sus perfiles de comprador. `[2.2.F9]`
- Si la tienda hace anuncios de producto —en Google Shopping o con el catálogo de Meta—, se alimentan solos del catálogo de la tienda, sin cargas a mano. `[2.2.F101 · comprobable]`
- Si la tienda vende en línea y hace pauta, sus compras vuelven solas a las plataformas de anuncios, para que la pauta se mida y se optimice por ventas y no por clics. `[2.2.F102 · comprobable]`

**Eficiente.**

*Resultado:* Quien se suscribe recibe una bienvenida que avanza sola hasta que compra —o hasta que pasa a un vendedor, donde los hay— sin que nadie tenga que acordarse de escribirle; si la tienda atiende por WhatsApp o chat, las conversaciones que abre cada promoción no dependen de que alguien se acuerde de contestar y el líder ve en tiempo real cuáles esperan respuesta.

- Hay secuencias de nutrición de varios pasos para quien se suscribió y todavía no compra, con tiempos de espera y caminos distintos según quién es o lo que hace cada persona: por ejemplo, la bienvenida cambia según las categorías que le interesan o según lo que abre y en qué hace clic. `[2.2.E1]`
- Si el canal conversacional, como WhatsApp, es parte del plan de canales, sus campañas —una promoción o un lanzamiento— están automatizadas, con segmentación y con caminos distintos según lo que hizo la persona: si leyó, hizo clic o respondió. `[2.2.E2]`
- El traspaso de leads a los vendedores es automático: cuando un lead cumple los criterios de MQL, le llega con su historial al vendedor que corresponde, sin que nadie lo pase a mano. `[2.2.E3]`
- Si la tienda atiende por más de un canal conversacional —por ejemplo WhatsApp, el chat de la tienda y los mensajes de Instagram—, todos llegan a una sola bandeja. `[2.2.E4]`
- Si la tienda usa páginas de campaña —la de una promoción o la de una temporada—, se publican desde la misma plataforma de la tienda, conectada al sistema central, no desde herramientas sueltas. `[2.2.E5]`
- El equipo usa la IA en su trabajo diario —para redactar correos y anuncios, adaptar una pieza a cada canal o resumir cómo le fue a una promoción—, y la IA trabaja con el contexto del área: los perfiles de comprador, los segmentos y la voz de la tienda. `[2.2.E6]`

**Óptimo.**

*Resultado:* Cada persona vive un recorrido pensado para ella: la IA decide el siguiente mensaje con lo que la tienda sabe de ella en todos sus sistemas y, si la tienda atiende por WhatsApp o chat, conversa con ella en el momento.

- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada comprador: las audiencias de los correos y de la pauta usan, por ejemplo, cuánto vale cada cliente en el tiempo, calculado afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D3`, `2.2.F2`, `2.2.F5`, `2.2.F10`, `2.2.F11`, `2.2.E7`, `2.2.E8`, `2.2.O1`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántas visitas y suscriptores llegan, de qué canal viene cada uno y cuántos terminan comprando?

*Descripción:* Mide si los datos de marketing de la tienda son confiables: de dónde llega cada suscriptor y cada comprador, en qué etapa está, si aceptó que le escribas y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de dónde llega cada comprador ni cuántos suscriptores terminan comprando: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle, y puedes estar escribiéndole a gente que no te dio permiso.

**Deficiente.**

- No se registra de dónde llega cada suscriptor o comprador: si de la pauta, de las redes o de un correo. `[2.3.D1]`

**Inicial.**

- No hay una regla de cuándo se limpian los datos: se corrigen a mano cuando alguien nota un problema, y a muchos compradores les faltan los datos que describen al cliente ideal de la tienda, como su zona o las categorías que les interesan. `[2.3.I1]`

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada suscriptor y cada comprador, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por una suscripción, un formulario, una conversación o una compra— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los duplicados —el mismo comprador registrado dos veces, con otro correo o como invitado— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —visitas, conversión a compra y de dónde llega cada comprador— salen del sistema sin armarlos a mano. `[2.3.F5]`
- El contexto que el área documentó —los perfiles de comprador, los segmentos y la voz de la tienda— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6]`

**Eficiente.** Los datos de cada comprador se completan solos, sus registros repetidos se unen solos y se sabe cuánto aportó cada canal a cada venta.

*Resultado:* Marketing puede demostrar cuánto vendió cada canal y cada campaña, no solo cuál trajo el primer clic.

**Óptimo.**

*Resultado:* La atribución cruza todos los canales de venta que tenga la tienda, no solo lo que ve Marketing, y los datos de cada comprador se mantienen confiables sin corregirlos a mano: el equipo solo revisa los que la IA marca como dudosos.

- Marketing se apoya en el almacén central de datos de la empresa —donde se juntan los canales de venta que tenga la tienda y las herramientas de marketing—, y sus reportes de atribución de las ventas salen de esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.D2`, `2.3.I2`, `2.3.F2`, `2.3.F8`, `2.3.F9`, `2.3.E1`, `2.3.E2`, `2.3.E5`, `2.3.E6`, `2.3.E7`, `2.3.O5`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas por sus resultados quien hace el marketing de tu tienda?

*Descripción:* Mide si cada quien sabe qué le toca en el marketing de la tienda, si hay metas y si se decide y se rinde cuentas con números del sistema.

*Costo de quedarse:* Las campañas se deciden por costumbre o por quien insiste más, y nadie responde por una meta: quien hace el marketing de la tienda no sabe qué se espera de él.

**Deficiente.**

- Nadie tiene el marketing de la tienda como responsabilidad propia: se hace en los ratos libres que dejan los pedidos y la atención. `[2.4.D1]`

**Inicial.**

- Los roles del marketing de la tienda no están escritos, así que hasta lo del día a día —subir un anuncio, cambiar una pieza— espera al dueño o a la gerencia. `[2.4.I1]`

**Funcional.**

*Resultado:* El equipo sabe qué se espera de cada uno, las decisiones sobre qué promoción empujar se defienden con números y no con opiniones, y la dirección recibe cada mes cómo le fue al marketing de la tienda sin tener que pedirlo.

- El líder tiene un tablero con 4 a 6 métricas clave —suscriptores nuevos, visitas por canal, conversión a compra y costo por venta— y lo consulta al menos una vez por semana. `[2.4.F2]`
- El equipo tiene metas mensuales o trimestrales, y en la reunión de resultados de las campañas rinde cuentas por ellas. `[2.4.F3]`
- Las decisiones sobre qué promoción empujar, qué productos destacar y en qué enfocarse citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva se integra rápido y, donde hay vendedores, Marketing, Ventas y Servicio preparan juntos cada promoción en vez de enterarse cuando ya salió.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —el catálogo, la marca y las herramientas de la tienda—; no se le entrena de memoria. `[2.4.E2]`
- Las decisiones se toman con lo que deja cada canal de adquisición a lo largo del tiempo —cuánto compran los clientes que trae, no solo su primera compra— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide con lo que dejan en el tiempo los compradores que trae cada canal frente a lo que cuesta traerlos.

*Se leen igual:* `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F5`, `2.4.F7`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`, `2.4.O6`.

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza de la tienda —un correo, un anuncio, una publicación— para publicarla?

*Descripción:* Mide si la tienda se ve y suena igual en todo lo que publica, si está escrito a quién le habla y si la encuentran en los buscadores y, si tiene locales, en los mapas.

*Costo de quedarse:* Cada pieza de la tienda se ve y suena distinta a la anterior, tu mensaje no le habla a ningún comprador en particular, y los buscadores —y, si tienes locales, los mapas— muestran mal tu tienda, o no la muestran.

**Deficiente.**

- No hay una guía de cómo se ve y cómo habla la tienda: ni logo, colores y tipografía definidos, ni una forma de escribir acordada, y cada pieza sale con su propio estilo. `[2.5.D1]`
- No está escrito a quién le habla la tienda: no hay perfiles de comprador que digan quién compra en ella y por qué. `[2.5.D2]`
- La tienda no está preparada para buscadores: las páginas y las fichas de producto de su tienda en línea no tienen título ni descripción, o no tiene sitio propio. `[2.5.D3]`

**Inicial.**

- Hay logo, colores y plantillas, pero el perfil de comprador es uno solo y tan general que sirve para cualquiera: «gente que compra en línea». `[2.5.I1]`
- Solo algunas páginas y fichas de producto de la tienda en línea tienen título y descripción, o la tienda carga mal en el celular o tiene enlaces rotos. `[2.5.I2]`

**Funcional.** La marca, la voz y los perfiles de comprador están escritos y se usan, se publica contenido propio cada mes, y la tienda aparece en los buscadores y, si tiene locales, en los mapas.

*Resultado:* La tienda se ve y suena igual en todo lo que publica, y quien la busca la encuentra en los buscadores y, si tiene locales, en los mapas, con lo básico bien resuelto.

- Si la tienda tiene locales, cada uno aparece en los mapas y en los buscadores con su información completa: dirección, horario, teléfono y fotos. `[2.5.F101 · comprobable]`

**Eficiente.**

*Resultado:* La tienda aparece cuando alguien busca lo que vende, en los buscadores y en los asistentes de IA, con contenido pensado para cada tipo de comprador que importa, y cada reseña de sus compradores, buena o mala, recibe respuesta.

- Si la tienda publica su contenido propio en su sitio, está organizado por temas: una página central por tema —por ejemplo, una guía para elegir un producto— y contenido de apoyo que la refuerza. `[2.5.E2]`
- El contenido de la tienda está preparado para que ella y sus productos aparezcan como respuesta en los asistentes de IA y en los buscadores que contestan preguntas, y se mide cuántas veces aparecen. `[2.5.E3]`
- El recorrido del comprador está mapeado con sus puntos de contacto definidos: dónde conoce la tienda, dónde compara, dónde compra y qué recibe después. `[2.5.E4]`

**Óptimo.**

- La IA produce y ajusta el contenido de la tienda de forma continua —guías, publicaciones y textos para los buscadores y los asistentes de IA—; el equipo valida cada pieza antes de publicarla, y en el sistema se ve qué produjo o cambió la IA y quién lo aprobó. `[2.5.O2]`

*Se leen igual:* `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E6`.

#### 2.6 Segmentación

¿Qué cambia en las campañas que reciben tus compradores según el grupo al que pertenecen?

*Descripción:* Mide si cada grupo de compradores recibe campañas pensadas para él, o si todos reciben la misma promoción.

*Costo de quedarse:* Le mandas la misma promoción a todos: el mensaje no le habla a ningún grupo, y cada envío cansa a quien no le interesa.

**Deficiente.**

- No hay segmentos: cada promoción sale a toda la base con el mismo mensaje. `[2.6.D1]`

**Inicial.**

- La base se separa solo por datos generales —zona, edad o género—, no por lo que le interesa a cada grupo de compradores. `[2.6.I1]`

**Funcional.** Hay segmentos de compradores definidos y piezas adaptadas a mano para cada uno.

*Resultado:* Cada grupo de compradores recibe promociones y mensajes pensados para él, en vez de la misma pieza para toda la base.

- La mayoría de las campañas del último trimestre salieron con piezas distintas para cada segmento: otro producto, otra imagen u otro mensaje. `[2.6.F3]`

**Eficiente.** Los segmentos y el puntaje de cada suscriptor se arman solos, y el mensaje de cada campaña se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y a lo que hizo antes, y quien está más cerca de comprar recibe primero el empujón que le falta.

- Las secuencias de bienvenida y de nutrición cambian según el segmento o la etapa del recorrido de cada persona. `[2.6.E1]`
- El contenido de las campañas se adapta solo a cada segmento: por ejemplo, el mismo correo muestra otros productos según quién lo recibe. `[2.6.E2]`

**Óptimo.**

*Resultado:* Cada comprador recibe los mensajes y ve el contenido que le corresponde según lo que hizo antes, sin que nadie arme un segmento para él.

- La IA predice quién va a comprar —por primera vez o de nuevo— y quién va a perder interés en los mensajes de la tienda, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F4`, `2.6.F5`, `2.6.E3`, `2.6.E5`, `2.6.E6`, `2.6.E7`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen tus promociones por los canales que usa la tienda?

*Descripción:* Mide si los canales que la tienda eligió salen con regularidad, bajo un mismo plan y con un costo por venta conocido.

*Costo de quedarse:* Tus promociones llegan a tus compradores a ratos, o no llegan, sin un plan que coordine tus canales, y no sabes cuánto te cuesta cada venta que traen.

**Deficiente.**

- No hay un plan de canales: cada promoción sale por donde se pueda. `[2.7.D2]`

**Inicial.**

- La pauta y los correos salen cuando hay algo que promocionar —una publicación impulsada, una campaña suelta—, sin presupuesto ni fechas fijados de antemano. `[2.7.I2]`

**Funcional.**

*Resultado:* Cada promoción sale coordinada por todos los canales que la tienda eligió en su plan en vez de esfuerzos sueltos, y el líder ve cuánto le cuesta cada venta según el canal que la trajo.

- Si el correo es parte del plan de canales, los envíos a la base de suscriptores y clientes salen al menos una vez por mes, y esa cadencia se sostiene. `[2.7.F1]`
- Si las redes sociales son parte del plan de canales, al menos una —Instagram, TikTok o Facebook— se maneja con calendario y publica con la frecuencia que ese calendario fija. `[2.7.F2]`
- Si WhatsApp u otro canal conversacional es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario —lanzamientos, promociones, novedades—, no solo para responder lo que entra. `[2.7.F4]`
- Los canales que la tienda eligió en su plan siguen el mismo calendario y la misma campaña: una promoción —el Black Friday, el Día de la Madre— sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada venta el último mes —o cada lead, donde vende un equipo—, al menos por canal. `[2.7.F6]`

**Eficiente.** Los canales comparten datos, la pauta se mueve cada mes según lo que cuesta cada venta en cada canal, y cada comprador que traen los clientes —o los creadores, si la tienda trabaja con ellos— queda registrado.

*Resultado:* La pauta se mueve hacia el canal que mejor rinde, los canales se refuerzan entre sí en vez de competir por el mismo comprador, y los clientes —y los creadores, si la tienda trabaja con ellos— traen compradores que se pueden contar.

- Si los eventos son parte del plan de canales —lanzamientos en la tienda, ventas en vivo por las redes o talleres—, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- El presupuesto entre canales se revisa al menos una vez por mes y se mueve según lo que cuesta cada venta en cada canal —o cada lead, donde vende un equipo—. `[2.7.E3]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar la tienda —con su enlace o su código—, y cada comprador nuevo que llega referido queda registrado con quién lo trajo. `[2.7.E4]`
- Si la tienda trabaja con creadores de contenido, tiene con ellos un programa activo de colaboraciones recurrentes, con fechas en el calendario: cada creador tiene su código o su enlace, y cada venta que trae queda registrada con quién la trajo. `[2.7.E101 · comprobable · hábito]`
- Se prueban canales nuevos —una red que empieza a vender, un marketplace nuevo, comunidades o formatos nuevos— en ciclos de dos meses o menos. `[2.7.E9]`

**Óptimo.**

*Resultado:* La pauta se reparte sola donde más vende, dentro de los límites que fija el equipo; los compradores contentos traen compradores nuevos, y la tienda prueba canales nuevos sin esperar a ver qué hace su competencia.

- La IA mueve sola la pauta entre canales mientras las campañas corren, hacia donde más retorno deja lo invertido y dentro de los límites que fijó el equipo; el líder revisa los resultados, y en el sistema queda cada cambio con su razón. `[2.7.O2]`
- Los compradores que Servicio identifica como promotores se vuelven un canal de referidos y de contenido —sus fotos y videos con el producto— sin pedírselo a mano: el sistema los invita solo, el equipo elige qué contenido se publica, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`, `2.7.F7`, `2.7.F8`, `2.7.E5`, `2.7.E6`, `2.7.E7`, `2.7.E8`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada promoción o temporada cuando termina?

*Descripción:* Mide si cada campaña se evalúa por las ventas que dejó y si deja un aprendizaje para la siguiente.

*Costo de quedarse:* Repites la campaña del año pasado sin saber qué parte funcionó: los mismos errores vuelven en cada temporada.

**Deficiente.** Las campañas corren hasta agotar el presupuesto, sin medir cuánto vendieron ni aprender de ellas.

- Nadie vuelve a mirar una promoción después de lanzarla: su pauta corre hasta que se acaba el presupuesto y ahí queda. `[2.8.D1]`
- No se mide cuánto vendió cada campaña: solo se sabe lo que se gastó, o ni eso. `[2.8.D2]`
- No queda registro de cómo le fue a cada promoción ni a cada temporada. `[2.8.D3]`

**Inicial.**

- Se miran los clics, el alcance y los «me gusta», no las ventas ni los compradores nuevos que trajo cada campaña. `[2.8.I1]`

**Funcional.**

*Resultado:* El equipo ve cuánto vendió cada campaña sin armar el número a mano, y cada temporada deja una lección escrita para la siguiente.

- Cada campaña del calendario —una temporada alta, un lanzamiento, no cada publicación suelta— cierra con una revisión escrita: qué canales, piezas y audiencias funcionaron y cuáles no. `[2.8.F3]`
- Los resultados de cada campaña —las ventas que trajo o los leads que pasó a un vendedor, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.** Probar es rutina: hay pruebas cada mes, y lo que muestran cambia cómo se arma la próxima promoción o temporada.

*Resultado:* El equipo sabe qué piezas y audiencias venden porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma la próxima temporada.

**Óptimo.**

*Resultado:* Las campañas mejoran mientras están corriendo, no cuando la temporada ya pasó.

- La IA ajusta las campañas mientras corren —deja de mostrar la pieza o la audiencia que no vende y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.I2`, `2.8.E3`, `2.8.E4`, `2.8.E5`, `2.8.O3`.

### Área 3 — Servicio

Mide el rendimiento de la posventa de la tienda, que cubre todo lo que pasa después del pago: desde el seguimiento del pedido y cada consulta, cambio o devolución, hasta que el comprador queda conforme con lo que compró. Mira cómo está montada por dentro y qué produce hacia el comprador.

**Deficiente.** Tu posventa se improvisa pedido por pedido. Cada quien resuelve un cambio o una devolución a su manera, y las consultas llegan por correo, WhatsApp y redes sin un lugar común donde queden. Te enteras de que un comprador quedó mal cuando ya lo contó en público.

**Inicial.** Una sola persona sabe cómo se resuelve cada caso, y si falta, la posventa se traba. Hay un sistema para los casos, pero parte del equipo sigue atendiendo desde su teléfono; cada quien tiene sus propias respuestas guardadas y hay una forma de resolver los cambios que nadie escribió. La posventa es frágil.

**Funcional.** Tu posventa es consistente y ya no depende de una persona. Sabes qué tipos de cliente atiendes y qué espera cada uno. Cada consulta, cambio o devolución sigue el mismo recorrido en un solo sistema, ligada a su pedido, con su tipo y su motivo y con la ficha del comprador a la vista, y se resuelve igual lo atienda quien lo atienda; cada comprador nuevo recibe un acompañamiento definido después de su primera compra. Cada caso tiene una prioridad que el equipo respeta —un pedido que no llegó va antes que una consulta de talla—, tienes respuestas guardadas para lo repetitivo y detectas a mano los atrasos antes de que el comprador reclame. Todavía no hay alertas automáticas, pero ya no esperas a que el comprador se queje.

**Eficiente.** Tu posventa empieza a adelantarse al problema. Los plazos de atención se vigilan solos, el comprador puede iniciar un cambio sin escribirle a nadie y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción, y la posventa y la venta ven los mismos datos de cada comprador. Ningún caso se pierde entre la posventa, la bodega y el despacho, y quien tuvo un problema recibe algo para recuperarlo. Dejas de perder compradores por un mal momento que nadie vio.

**Óptimo.** Un agente de IA resuelve casos de los compradores —dónde está un pedido, cómo hacer un cambio— y le pasa a una persona, con todo el contexto, los que no puede resolver. Las rutinas de la posventa corren solas mientras el equipo supervisa y gestiona las excepciones; la mayoría de los problemas con un pedido que detecta el sistema se resuelven antes de que el comprador los note, y cada comprador se atiende sabiendo qué le prometió la tienda y recibe detalles pensados para deleitarlo. Atender un pedido más casi no cuesta.

#### 3.1 Procesos y Rutinas

¿Cómo se atiende un cambio o una devolución en tu tienda, desde que el comprador lo pide hasta que se resuelve?

*Descripción:* Mide si las consultas, los cambios y las devoluciones siguen un proceso definido, sin depender de quién atiende.

*Costo de quedarse:* Un cambio o una devolución se resuelve distinto según quién atienda: el comprador no sabe a qué atenerse y reclama en público.

**Deficiente.**

- Cada quien resuelve los cambios, las devoluciones y los reclamos a su manera. `[3.1.D1]`
- El equipo de posventa no tiene reuniones ni rutinas de trabajo: cada quien se organiza por su cuenta. `[3.1.D2]`

**Inicial.**

- Hay una forma de atender los cambios y las devoluciones que el equipo sigue de palabra, sin configurar ni escribir. `[3.1.I1]`
- Unos atienden en el sistema; otros responden desde el WhatsApp de su teléfono o desde la cuenta de la tienda en las redes, por fuera. `[3.1.I3]`

**Funcional.** El equipo atiende en un mismo sistema, con el recorrido de los casos configurado y alguien que responde por cada comprador.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada comprador tiene a alguien que responde por él, y un cambio o una devolución sigue los mismos pasos sin importar quién lo tome.

- El recorrido de los casos de posventa está configurado con sus etapas —por ejemplo, recibido, en revisión, esperando el producto devuelto y resuelto— y cubre la atención de la recepción al cierre. `[3.1.F1]`
- Existe un proceso escrito para escalar los reclamos graves —un pedido que no llegó, un producto dañado, un reclamo público— y los casos que quien atiende no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cualquiera del equipo explica igual cómo se atiende un cambio o una devolución, paso a paso. `[3.1.F5]`
- Cualquiera del equipo atiende en el sistema central, no desde su teléfono ni desde la aplicación de cada red: es su herramienta de trabajo, no algo que se llena después de resolver por otro lado. `[3.1.F6]`

**Eficiente.** Aparecen los plazos de atención, las guías de acción y el recorrido del comprador, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso —una consulta, un cambio, una devolución—, cada momento después de la compra tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay plazos de respuesta y de resolución definidos por tipo de caso —una consulta, un cambio, una devolución, un reclamo— o por prioridad. `[3.1.E1]`
- El recorrido del comprador después de pagar está definido de punta a punta —la confirmación, la espera, la entrega, el uso y, si la hay, la próxima compra—, con un responsable y un estándar para cada momento. `[3.1.E4]`

**Óptimo.**

*Se leen igual:* `3.1.I2`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F7`, `3.1.F8`, `3.1.E3`, `3.1.E5`, `3.1.E6`, `3.1.O3`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega un caso nuevo —una consulta, un cambio, una devolución— al sistema y a quien lo tiene que atender?

*Descripción:* Mide si cada caso llega solo al sistema y a quien lo atiende, y cuánto de la posventa se automatiza.

*Costo de quedarse:* Los casos se pierden entre el correo, WhatsApp y las redes, y alguien tiene que repartirlos y perseguirlos a mano: el comprador insiste para que lo atiendan.

**Deficiente.**

- Los casos se atienden desde el celular o el correo personal de cada quien. `[3.2.D2]`

**Inicial.** Hay un sistema para los casos, pero alguien tiene que repartir a mano lo que entra o, si la tienda atiende por WhatsApp, chat o redes, nada de eso llega a él.

- Hay un sistema para los casos, pero cada consulta, cambio o devolución que entra se reparte a mano, o la tienda atiende por WhatsApp, por el chat de la tienda o por los mensajes de las redes y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.**

*Resultado:* Lo que entra por los canales conectados —WhatsApp, el chat o el correo— llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio del caso.

- Si la tienda atiende por WhatsApp, por el chat de la tienda o por los mensajes de las redes, al menos uno de esos canales está conectado al sistema, con una bandeja básica donde el equipo atiende lo que entra. `[3.2.F4]`
- Si hay un chatbot, resuelve preguntas frecuentes —horarios, costos de envío, cómo pedir un cambio— con un árbol de decisión. `[3.2.F6]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el comprador puede ver sus casos e iniciar un cambio o una devolución sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Si la tienda atiende por más de un canal escrito —correo, WhatsApp, chat, redes o los mensajes de los marketplaces—, todos llegan a una sola bandeja. `[3.2.E3]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir un caso o buscar en la política de cambios—, y la IA trabaja con el contexto del área: los tipos de cliente, la atención que recibe cada uno y las respuestas a las preguntas frecuentes. `[3.2.E4]`

**Óptimo.**

*Resultado:* Buena parte de los casos se resuelve sin que intervenga una persona, y cuando un caso pasa a alguien del equipo, llega con el pedido, la conversación y lo que la tienda sabe de ese comprador a la vista.

- Un agente de IA resuelve casos —dónde está un pedido, cómo hacer un cambio— en todos los canales donde atiende la tienda, sin que intervenga una persona, y le pasa a alguien del equipo, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de atención: quien atiende ve en la ficha del comprador, por ejemplo, cuánto vale en el tiempo o si está por dejar de comprar. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.F5`, `3.2.F8`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas cuántos casos te llegan de cada tipo —consultas, cambios, devoluciones— y de qué compradores?

*Descripción:* Mide si los datos de cada comprador, sus pedidos y sus casos están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que dar su número de pedido y volver a explicar todo, porque nadie ve su historia.

**Deficiente.**

- Es imposible reconstruir qué pasó con un comprador: qué pidió, qué le llegó y qué reclamó. `[3.3.D2]`

**Inicial.**

- Los casos de posventa están en un solo sistema, pero la ficha del comprador sale incompleta: sus pedidos y lo que compró hay que buscarlos en la plataforma de la tienda. `[3.3.I1]`
- Los números de casos —cuántos llegan y de qué tipo: consultas, cambios, devoluciones— se arman a mano, fuera del sistema. `[3.3.I2]`

**Funcional.** La ficha y la historia de cada comprador están a la vista, y cada caso queda ligado a su pedido, con su tipo y su motivo.

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cualquiera del equipo ve en segundos la historia del comprador y en qué va el pedido del que habla.

- Cualquiera del equipo ve el historial de casos de un comprador en menos de 10 segundos. `[3.3.F1]`
- La ficha del comprador muestra sus pedidos y su valor para la tienda, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo y su motivo, de una lista definida: por ejemplo, una consulta por el estado del pedido, un cambio de talla o un reclamo por un atraso. `[3.3.F4]`
- El líder saca del sistema, sin armarlo a mano, cuántos casos llegan de cada tipo: consultas, cambios, devoluciones y reclamos. `[3.3.F5]`
- Cada caso queda ligado al pedido del que habla, y quien atiende ve en qué va ese pedido —preparado, enviado, entregado— sin salir del sistema. `[3.3.F101 · comprobable · requiere 1.1.F2]`

**Eficiente.** Se miden los tiempos y la satisfacción, y la posventa ve los mismos datos que la venta.

*Resultado:* La tienda sabe qué tan rápido y qué tan bien atiende, cuánto tarda un comprador nuevo en tener lo que compró y, donde se vuelve a comprar, qué tan sano está cada cliente, con la satisfacción medida y no supuesta.

- Se mide la satisfacción del comprador —con el NPS o el CSAT— con una cadencia definida: por ejemplo, una encuesta después de cada entrega o al cerrar cada caso. `[3.3.E2]`
- Se mide cuánto tarda cada comprador nuevo en alcanzar el resultado de su primera compra: desde que paga hasta que lo recibe y lo usa sin problemas, sin abrir un caso ni devolverlo. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente, que combina cómo viene comprando, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Los datos se mantienen al día solos y, donde se vuelve a comprar, un modelo de salud anticipa quién puede dejar de comprar antes de que lo diga.

*Resultado:* La tienda sabe cuántos casos va a traer cada temporada, con datos que se mantienen al día solos, y, donde se vuelve a comprar, qué clientes pueden dejar de comprar por una mala experiencia antes de que lo digan.

- Un modelo predictivo de salud calcula para cada cliente si puede dejar de comprar y si lo que compra le está sirviendo, a partir de su experiencia con la tienda —entregas, casos y devoluciones— y de cómo viene comprando; el puntaje se ve en su ficha y quien responde por cada cliente revisa a los que el modelo marca. `[3.3.O1]`
- Modelos con IA predicen lo que viene —por ejemplo, cuántos casos traerá la próxima promoción y cuánta gente hará falta para atenderlos— y proponen qué hacer; lo que predicen se ve en los tableros de la posventa y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.D1`, `3.3.I3`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O2`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si la posventa va al día con las consultas, los cambios y las devoluciones?

*Descripción:* Mide si alguien responde por la posventa: roles claros, un tablero con sus números y una revisión con cadencia.

*Costo de quedarse:* Nadie responde por la posventa: sus números no se miran, y los atrasos y los reclamos se descubren cuando ya estallaron.

**Deficiente.**

- Nadie tiene claro qué le toca: entre las consultas, los cambios, las devoluciones y los reclamos, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.** Cada quien sabe a grandes rasgos qué le toca y el líder mira algunos números de la posventa, pero sin una cadencia fija.

- Se siguen algunos números de la posventa —casos abiertos, cambios, devoluciones—, pero sin un tablero ni una cadencia fija. `[3.4.I1]`
- El líder mira los números de la posventa de vez en cuando, sobre todo cuando algo sale mal, como un pedido que no llegó o un comprador que reclama. `[3.4.I2]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si la posventa va al día o se está atrasando.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, casos por tipo, pedidos atrasados, cambios y devoluciones en curso— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por los plazos de atención, el líder prepara a quien entra y acuerda con Ventas qué recibe y qué le devuelve la posventa.

*Resultado:* El equipo responde por sus plazos de atención, una persona nueva atiende bien desde el principio, la posventa sabe qué espera cada comprador nuevo de su compra y, donde se vuelve a comprar sin suscripción, Ventas se entera de quién puede estar dejando de comprar.

- En las reuniones del equipo se revisa el cumplimiento de los plazos de atención de cada persona y se acuerda qué corregir. `[3.4.E1]`
- Cuando entra alguien nuevo a la posventa, hay un plan de inducción con sus pasos y materiales —la política de cambios, los casos frecuentes, el sistema—; no se le entrena de memoria. `[3.4.E2]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente —sus consultas, sus cambios, sus devoluciones— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`
- La posventa le pasa al equipo que publica los productos, al menos una vez por mes, lo que se repite en los casos —un producto que falla, una talla que no calza, una foto que confunde—, y queda registrado qué se corrigió en la ficha o en el producto. `[3.4.E101 · declarado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento y, donde hay suscripción, la posventa se mide por los suscriptores que retiene y por cuánto crecen sus compras.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella, la posventa decide con lo que cuesta atender a cada tipo de cliente y, donde hay suscripción, se mide por los suscriptores que retiene y por cuánto crecen sus compras, no solo por los casos que cierra.

*Se leen igual:* `3.4.D2`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O2`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia de Atención

¿En qué se apoya tu equipo para que un cambio o una devolución se resuelva igual, lo atienda quien lo atienda?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y resuelve igual un cambio, una devolución o una garantía, lo atienda quien lo atienda.

*Costo de quedarse:* La misma devolución se acepta o se rechaza según quién atienda: el comprador lo nota y lo cuenta.

**Deficiente.**

- No hay respuestas guardadas: cada quien le escribe al comprador desde cero, a su manera, aunque sea la pregunta de siempre. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas, pero cada quien tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Hay tipos de cliente definidos, respuestas guardadas para lo frecuente, los mismos criterios para cambios y devoluciones, y un acompañamiento definido para el comprador nuevo.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, un comprador nuevo sabe cómo usar lo que compró, y un cambio o una devolución se resuelve igual lo atienda quien lo atienda.

- Hay respuestas guardadas para preguntas frecuentes —el estado de un pedido, cómo pedir un cambio, cuánto tarda un reembolso—, al alcance de todo el equipo. `[3.5.F1]`
- Existe un proceso escrito para el comprador nuevo después de su primera compra —la entrega de lo que compró y, si el producto lo necesita, las instrucciones, los cuidados o el armado—, con un resultado definido: que lo reciba y lo use sin problemas. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende la posventa —por ejemplo, quien compra en línea, en la tienda física o en un marketplace—, qué necesita y espera cada uno y cuáles se consideran clientes clave, consultable por cualquiera del equipo. `[3.5.F4]`
- Los cambios, las devoluciones y las garantías se resuelven aplicando las condiciones de la tienda igual para todos, lo atienda quien lo atienda y entre por el canal que entre; las excepciones las aprueba una persona definida. `[3.5.F101 · evaluado · hábito]`

**Eficiente.**

*Resultado:* El comprador reconoce la voz de la tienda en cada respuesta, lo atienda quien lo atienda.

- Las respuestas suenan a la tienda —su tono y su voz—, no al estilo de cada persona. `[3.5.E2]`

**Óptimo.**

- Lo que la IA responde o escribe sola a los compradores —el estado de un pedido, un cambio, un reembolso— sigue la guía de tono y estilo de la tienda; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F3`, `3.5.F5`, `3.5.E3`.

#### 3.6 Priorización de Clientes

¿Cómo decide tu equipo qué caso se atiende primero: un pedido que no llegó, un cambio o una consulta de talla?

*Descripción:* Mide si los casos se atienden según su urgencia —qué pedido está en juego— y el tipo de cliente, no según quién insiste más.

*Costo de quedarse:* Un pedido que no llegó espera detrás de una consulta simple, y quien atiende responde sin saber qué compró esa persona ni qué le pasó antes.

**Deficiente.**

- Los casos se atienden por orden de llegada o como le parezca a quien atiende, sin mirar qué pedido está en juego ni quién es el comprador. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente, pero los casos no tienen una prioridad asignada: cada agente decide a ojo si va antes un pedido que no llegó o una consulta de talla, o se adelanta el comprador que más insiste. `[3.6.I1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero —un pedido que no llegó antes que una consulta de talla—, cada tipo de cliente recibe la atención que le corresponde, y quien atiende no tiene que reconstruir la historia del comprador.

- Cada caso tiene una prioridad asignada —por ejemplo, un pedido que no llegó va antes que una consulta de talla— y el equipo la respeta. `[3.6.F1]`
- Quien atiende usa la ficha del comprador —sus pedidos y sus casos abiertos— para responder con contexto, sin pedirle sus datos otra vez ni reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** Los compradores se segmentan según su momento, para actuar distinto con cada grupo.

*Resultado:* La atención cambia según el momento de cada comprador: con un pedido en camino, dentro de su plazo de cambio o con un problema abierto.

**Óptimo.**

*Resultado:* Cada comprador recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar qué compró ni qué le prometieron.

- En el autoservicio, el portal y el chat le muestran a cada comprador lo que corresponde a su tipo de cliente, a sus pedidos y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- La IA ajusta cada respuesta al comprador mientras lo atiende —según su historia, su caso y lo que está pasando con su pedido—, dentro de los límites que fijó el equipo; el equipo revisa una muestra de las respuestas, y en el sistema queda qué se le respondió. `[3.6.O2]`
- Cada comprador se atiende con el contexto de su compra —lo que le prometieron la ficha del producto y la promoción con la que compró, y la campaña de la que viene—, que quien lo atiende, persona o IA, ve en la ficha del comprador sin volver a preguntarlo. `[3.6.O3]`

*No aplican:* `3.6.E1`.

*Se leen igual:* `3.6.F2`, `3.6.F4`, `3.6.F5`, `3.6.E4`, `3.6.E5`.

#### 3.7 Seguimiento del pedido

¿Cómo te enteras de que un pedido viene con problemas: un atraso, un producto dañado, un comprador molesto?

*Descripción:* Mide si el comprador sabe cómo va su pedido sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera de un atraso cuando ya reclamó, y tú te enteras de que quedó mal cuando deja una mala reseña.

**Deficiente.** La posventa espera el reclamo: nadie mira los pedidos hasta que el comprador escribe.

- Aunque un comprador acumule casos repetidos o tenga un reclamo sin resolver, nadie lo contacta: los problemas con sus pedidos se atienden cuando ya estallaron. `[3.7.D1]`
- La posventa nunca le escribe al comprador por iniciativa propia: siempre espera a que él escriba. `[3.7.D2]`

**Inicial.** A veces alguien avisa de un atraso o llama a un comprador molesto, pero depende de quién lo note.

- Cuando un comprador tiene problemas repetidos con sus pedidos, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Los atrasos, los problemas que se repiten y los reclamos se detectan, aunque sea a mano, y los clientes clave reciben contacto antes de sus fechas críticas.

*Resultado:* Los atrasos, los problemas que se repiten, los reclamos y las fechas críticas de los clientes clave ya no toman al equipo por sorpresa: el comprador se entera de un atraso antes de tener que reclamar, alguien actúa antes de que un problema crezca y, donde hay suscripción, se sabe por qué cancela cada cliente.

- Un comprador con casos repetidos por el mismo problema, un reclamo sin resolver —también uno público, en las redes— o, si la tienda pide calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los clientes clave reciben contacto antes de sus fechas críticas —el fin de su garantía o, si tienen suscripción, su renovación—, no después. `[3.7.F2]`
- Cada cliente que cancela su suscripción deja registrada la razón. `[3.7.F3]`
- Los pedidos que se van a atrasar se detectan antes de la fecha prometida, y el comprador recibe un aviso con la nueva fecha antes de tener que reclamar. `[3.7.F101 · comprobable · hábito]`

**Eficiente.** Los atrasos se ven venir, ningún caso del comprador se pierde aunque lo resuelva otra área —la bodega, el despacho o administración—, y el comprador recibe lo que necesita saber antes de pedirlo.

*Resultado:* Ningún caso del comprador se pierde entre la posventa, la bodega y el despacho, el comprador sabe lo que necesita antes de preguntarlo, quien tuvo un problema recibe algo para recuperarlo antes de irse con una mala impresión y, donde hay suscripción, quien está por cancelar recibe una razón para quedarse.

- Hay alertas tempranas, a partir del indicador de salud, de un suscriptor que puede cancelar o que está listo para comprar más. `[3.7.E1]`
- Cada comprador con un pedido atrasado o que llegó mal recibe, sin tener que pedirla, una acción para recuperarlo: una disculpa, una compensación o una atención especial. `[3.7.E101 · comprobable · hábito]`
- Los suscriptores que dan señales de cancelar —pausan, se saltan entregas, reclaman— reciben una acción para quedarse antes de decidir irse. `[3.7.E102 · comprobable · hábito · relación continua]`

**Óptimo.** Los problemas con un pedido se resuelven antes de que el comprador los note, con avisos que la IA ajusta, y cada comprador recibe detalles que lo deleitan.

*Resultado:* La mayoría de los problemas con un pedido que detecta el sistema se resuelven antes de que el comprador los note, y cada comprador siente que la tienda se adelanta a lo que necesita y lo sorprende para bien.

- La mayoría de los problemas que detecta el sistema se resuelven antes de que el comprador los note —por ejemplo, un pedido que se iba a atrasar sale desde otra bodega o con otro transportista—: el equipo valida la solución y en el sistema se ve que el comprador no tuvo que abrir un caso. `[3.7.O2]`
- La IA decide qué aviso o qué acción de la posventa recibe cada comprador —qué, cuándo y por qué canal— según su historia y sus señales, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada comprador. `[3.7.O3]`

*No aplican:* `3.7.E3`.

*Se leen igual:* `3.7.F4`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.E8`, `3.7.O5`, `3.7.O6`.

#### 3.8 Autoservicio

¿Qué pasa con las preguntas que tus compradores hacen una y otra vez, como dónde está su pedido o cuánto cuesta el envío?

*Descripción:* Mide si las preguntas de siempre tienen respuesta publicada y si lo aprendido se documenta, para atender más pedidos sin sumar gente al mismo ritmo.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas una y otra vez —dónde está mi pedido, cuánto cuesta el envío—, y en temporada alta esas preguntas atrasan todo lo demás.

**Deficiente.** Las preguntas de siempre se responden a mano, una por una: el comprador no tiene dónde ver su pedido ni respuestas publicadas.

- El comprador no puede ver solo en qué va su pedido ni encontrar respuestas publicadas. `[3.8.D1]`
- Hasta las preguntas que más se repiten —dónde está mi pedido, cuánto cuesta el envío, cómo pido un cambio— se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.** Hay preguntas frecuentes sueltas o un chatbot de menú, pero lo que más se consulta —dónde está mi pedido— todavía necesita a una persona.

- Hay un chatbot de menú fijo, pero no responde las preguntas que más se repiten, como dónde está mi pedido o cuánto cuesta el envío. `[3.8.I1]`
- Hay algunas preguntas frecuentes publicadas, pero sueltas: no cubren lo que más preguntan los compradores, que se sigue respondiendo a mano. `[3.8.I2]`

**Funcional.** El comprador ve solo en qué va su pedido, y las preguntas más frecuentes tienen respuesta publicada.

*Resultado:* El comprador puede ver por su cuenta dónde está su pedido o la respuesta a las preguntas de siempre, y el equipo le envía el enlace en vez de volver a escribirla.

- Las diez preguntas que más se repitieron en el último trimestre —o todas, si son menos—, como dónde está mi pedido, cuánto cuesta el envío o cómo pido un cambio, tienen una respuesta que el comprador puede consultar por su cuenta: el seguimiento de su pedido o una pregunta frecuente publicada. `[3.8.F1]`
- Cuando entra un caso que ya tiene respuesta publicada, el equipo envía el enlace —al seguimiento del pedido o a la pregunta frecuente— en vez de volver a redactarla. `[3.8.F2]`

**Eficiente.**

*Resultado:* La tienda puede vender más, también en temporada alta, sin sumar gente en la misma proporción, porque buena parte de lo que preguntan los compradores se resuelve sin abrir un caso.

- Cada caso nuevo que se resuelve deja su solución escrita en la base de conocimiento: un producto que falla de una forma nueva, una duda de envío que no estaba. `[3.8.E1]`

**Óptimo.**

*Resultado:* Los pedidos pueden crecer sin que crezca el equipo: las respuestas se generan a medida que aparecen preguntas nuevas, y la IA y el autoservicio absorben la temporada alta.

- La IA detecta las preguntas nuevas que llegan —por un producto recién lanzado o un cambio en los envíos— y redacta la respuesta; el equipo la revisa antes de publicarla, y en la base de conocimiento se ve qué escribió la IA y quién lo aprobó. `[3.8.O1]`
- Los picos de demanda —la temporada alta, una promoción grande— los absorben la IA y el autoservicio: el equipo no crece cuando crecen los pedidos, y el líder ve en los tableros del área qué parte de los casos resolvieron la IA y el autoservicio y qué pasó a alguien del equipo. `[3.8.O2]`
- La IA aplica lo que aprende de los casos a las respuestas guardadas, a la atención de cada tipo de cliente y a los avisos al comprador, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3]`

*Se leen igual:* `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O4`.

## Edición — Banca y servicios financieros

Para el área comercial de un banco, una cooperativa de ahorro y crédito o una financiera que coloca créditos, tarjetas y cuentas a personas y pymes: parte de la venta la trabaja un ejecutivo y parte se cierra sola en los canales digitales, y después de la venta la relación sigue. Las aseguradoras se miden con la escala general: esta edición está escrita para quien coloca crédito.

*Clave:* banca

*Perfil habitual:* mixta · relación continua.

*Criterios propios:* desde el 201.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Negocio | Solicitud de un crédito, una tarjeta o una cuenta |
| Negocio ganado | Solicitud concretada: el crédito desembolsado, la tarjeta entregada o la cuenta abierta |
| Lead | Prospecto: quien pidió información o empezó una solicitud, sea o no cliente de la entidad |
| Pipeline | El recorrido de la solicitud: ingreso, análisis, aprobación y desembolso |
| Revisión del pipeline | Reunión de seguimiento de solicitudes |
| Lead calificado | Prospecto precalificado: cumple las condiciones básicas del producto |
| Vendedor | Ejecutivo de negocios |
| Propuesta | La oferta del producto: monto, tasa, plazo y condiciones |
| Cotización | Simulación o preaprobación |
| Razón de pérdida | Por qué no se concretó la solicitud: rechazo, desistimiento o abandono |
| Cliente ideal | El cliente objetivo de cada producto |
| Pronóstico | Proyección de colocación |
| Caso | Un reclamo, una consulta o una gestión sobre un producto |

### Área 1 — Ventas

Mide el rendimiento del área comercial de la entidad: cómo está montada por dentro y qué produce en solicitudes, aprobaciones y productos colocados. Vale igual si la colocación la trabaja un equipo de ejecutivos o una sola persona, o si el cliente contrata solo, por la web, la app o el autoservicio.

**Deficiente.** Tu área comercial coloca, pero nadie puede decir cómo. Cada ejecutivo lleva a sus prospectos en su propia lista, las solicitudes viven entre el sistema de crédito y los correos, y las que se abandonan en los canales digitales no las ve nadie.

**Inicial.** Tienes un CRM y un proceso a medias. Las solicitudes se registran cuando el ejecutivo se acuerda, cada sucursal explica las condiciones a su manera y el seguimiento depende de quién lleve cada solicitud.

**Funcional.** Tu área comercial opera como una maquinaria base. Cada solicitud —de sucursal, de ejecutivo o digital— entra al mismo recorrido, las condiciones de cada producto se dicen igual en todos los canales, la autorización del cliente para consultar su historial queda registrada y ninguna solicitud se enfría sin que alguien reaccione.

**Eficiente.** La colocación deja de depender del empuje de cada ejecutivo. Mides en qué etapa se cae cada solicitud, la precalificación sale sola, les ofreces a los clientes que ya califican sin esperar a que pregunten y proyectas la colocación con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA precalifican ahí a los prospectos y agendan citas a toda hora; la IA calcula a quién ofrecerle qué producto y cuándo, y detecta la solicitud que se traba antes de que el cliente termine el trámite en otra entidad.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus ejecutivos cada solicitud, desde que entra hasta el desembolso o la apertura?

*Descripción:* Mide si la colocación sigue un proceso escrito, con etapas, requisitos y cadencias que no dependen de cada ejecutivo.

*Costo de quedarse:* Si se va un ejecutivo, se lleva a sus prospectos y el estado de cada solicitud: el cliente tiene que empezar de nuevo, y muchos prefieren empezar en otra entidad.

**Deficiente.**

- No hay nada escrito sobre el recorrido de la solicitud ni sus etapas: cada ejecutivo usa su criterio. `[1.1.D1]`
- Los prospectos se reparten a ojo, o se los queda el ejecutivo que los ve primero: no hay una regla que diga a quién le toca cada uno. `[1.1.D2]`
- No hay una reunión de seguimiento de solicitudes: se habla de ellas solo cuando una se complica. `[1.1.D3]`
- Si se van dos ejecutivos clave, nadie sabe en qué quedó cada solicitud. `[1.1.D4]`

**Inicial.**

- Hay etapas de la solicitud de palabra o en un borrador, pero cada ejecutivo las interpreta distinto. `[1.1.I1]`
- Hay una cadencia de contacto sugerida con los prospectos, pero cada ejecutivo la cumple cuando puede o cuando se acuerda. `[1.1.I2]`
- La reunión de seguimiento de solicitudes se hace cuando hay tiempo, sin una fecha fija ni un orden para repasarlas. `[1.1.I3]`
- Que una solicitud quede bien registrada depende de la voluntad de cada ejecutivo, no de una rutina del equipo. `[1.1.I4]`

**Funcional.** Todo el equipo sigue el mismo recorrido escrito de la solicitud en el CRM, con un plazo de respuesta en cada etapa comercial, una cadencia de seguimiento y una revisión fija de las solicitudes.

*Resultado:* Si rota un ejecutivo, el siguiente sabe en qué va cada solicitud, porque todo el equipo las trabaja igual: avanzan con los mismos criterios, cada etapa en manos del equipo comercial tiene su plazo de respuesta y se les da seguimiento con la cadencia acordada.

- Cualquier ejecutivo explica igual las etapas de una solicitud —ingreso, análisis, aprobación y desembolso— y qué tiene que cumplir para avanzar. `[1.1.F1]`
- Cada producto —crédito, tarjeta, cuenta— tiene su propio recorrido en el CRM, con lo que la solicitud tiene que cumplir para pasar de cada etapa a la siguiente. `[1.1.F2]`
- Cada etapa de la solicitud que está en manos del área comercial —recibirla, armar el expediente, comunicarle la respuesta al cliente y coordinar la firma— tiene un plazo de respuesta acordado, y se cumple en la mayoría de las solicitudes; el análisis de crédito queda fuera, porque su plazo se acuerda con esa área. `[1.1.F201 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El líder sabe dónde se desvía el proceso y lo corrige con datos, no de memoria; donde la venta pasa por un ejecutivo, además, todo el equipo asesora con un mismo método.

- Hay una metodología comercial formal en uso —SPIN, BANT o una de asesoría equivalente— que el ejecutivo sigue para conocer la necesidad del cliente antes de ofrecerle un producto. `[1.1.E1]`

**Óptimo.**

- La mayoría de las solicitudes siguen el recorrido como está escrito sin que nadie lo revise a mano, y el CRM lo muestra. `[1.1.O2]`
- Las técnicas comerciales nuevas se prueban en pilotos de ciclo corto —por ejemplo, en una sucursal o con un producto— antes de sumarlas al proceso. `[1.1.O3]`

*Se leen igual:* `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.F7`, `1.1.F8`, `1.1.E2`, `1.1.E3`, `1.1.E5`, `1.1.E6`, `1.1.O4`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una solicitud o cambia de estado?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las solicitudes, registrar lo que entra por los canales digitales, avisarle al cliente en qué va su solicitud—, si el CRM está conectado con el core bancario y cómo usa el equipo la IA.

*Costo de quedarse:* Tus ejecutivos pierden horas en tareas que el sistema podría hacer: las solicitudes esperan a que alguien decida a quién le tocan, las que empiezan en la web se enfrían sin que nadie llame al cliente y el cliente tiene que llamar para saber en qué va la suya.

**Deficiente.**

- Los prospectos viven en listas o agendas personales de cada ejecutivo. `[1.2.D1]`
- No hay un CRM donde montar una automatización: los prospectos y las solicitudes se pasan por correo, por chat o de palabra, y nadie recibe avisos del sistema. `[1.2.D2]`

**Inicial.** Hay un CRM, pero las solicitudes se cargan y se reparten a mano, y el cliente tiene que llamar para saber en qué va la suya.

- Lo que el cliente contrata solo —por la web, la app o el autoservicio— se pasa a mano al sistema, cuando alguien tiene tiempo. `[1.2.I2]`
- El cliente tiene que llamar para saber en qué va su solicitud. `[1.2.I201 · evaluado]`

**Funcional.** Lo básico pasa solo: las solicitudes se reparten por una regla, lo que el cliente hace en los canales digitales entra al sistema aunque lo deje a medias, y el cliente recibe un aviso en cada cambio de estado.

*Resultado:* Ninguna solicitud se pierde por no saber a quién le toca: la que empieza en un canal digital entra sola, aunque quede a medias; el ejecutivo recibe el aviso de lo que le toca y el cliente sabe en qué va su solicitud sin tener que llamar.

- Las solicitudes y los pedidos de información que entran llegan a una bandeja o cola y se asignan por una regla simple: por turnos, por sucursal o por producto. `[1.2.F2]`
- Lo que el cliente contrata solo —por la web, la app o el autoservicio— entra solo al sistema como una solicitud, con su producto, su monto, su canal, su fecha y su cliente, que siempre se identifica al contratar. `[1.2.F6]`
- La solicitud que el cliente deja a medias en un canal digital queda guardada en el sistema, con sus datos de contacto. `[1.2.F201 · comprobable · venta sin vendedor]`
- En cada cambio de estado de su solicitud —recibida, en análisis, aprobada o qué le falta—, al cliente le llega un aviso automático. `[1.2.F202 · comprobable]`
- Los ejecutivos le escriben al cliente solo desde los números, perfiles y correos que la entidad publica como oficiales, no desde su teléfono personal. `[1.2.F203 · evaluado · hábito · venta con equipo]`

**Eficiente.** El CRM se conecta con el core bancario, las simulaciones salen del sistema, el cliente firma sin ir a la sucursal y el equipo usa la IA en su trabajo diario.

*Resultado:* El ejecutivo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen las solicitudes.

- Las simulaciones y las ofertas se generan desde el sistema, con la tasa y las condiciones vigentes, no en hojas sueltas. `[1.2.E1]`
- El CRM está integrado con el core bancario y con el sistema donde se analiza el crédito. `[1.2.E3]`
- El cliente verifica su identidad —por ejemplo, con un código que le llega al teléfono o con la foto de su identificación—, entrega sus documentos y firma de forma digital, sin tener que ir a la sucursal. `[1.2.E201 · comprobable]`

**Óptimo.** La IA precalifica, agenda citas y calcula qué solicitudes se van a concretar; el ejecutivo valida y se queda con las conversaciones que deciden la colocación.

*Resultado:* El ejecutivo dedica su tiempo a las conversaciones que deciden la colocación: los agentes de IA precalifican y agendan, y él trabaja con la probabilidad de que se concrete cada solicitud y con las respuestas que la IA le propone.

- Si el equipo atiende por un canal conversacional, agentes de IA precalifican ahí a los prospectos con la definición de prospecto precalificado y agendan citas a cualquier hora; le pasan al ejecutivo, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que precalificaron. `[1.2.O2]`

*No aplican:* `1.2.F8`.

*Se leen igual:* `1.2.I1`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O3`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus solicitudes en curso antes de usarlo para decidir?

*Descripción:* Mide si los datos comerciales son confiables para decidir: solicitudes completas, su origen, la autorización del cliente y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de solicitudes en curso se arma a mano, cambia según quién lo arma y nadie sabe cuántas hay de verdad ni por qué canal llegó cada una.

**Deficiente.**

- No hay un registro de los prospectos: cada vez que se necesita la lista de quiénes pidieron un producto, hay que armarla a mano con hojas de cálculo, la libreta de cada ejecutivo y lo que guarda cada sistema. `[1.3.D3]`
- Las solicitudes que se concretan no quedan registradas en el área comercial con su producto, su monto y su fecha: lo que colocó cada ejecutivo, cada sucursal o cada canal se arma a mano con los reportes del core bancario. `[1.3.D4]`

**Inicial.**

- Los datos de los prospectos y las solicitudes se completan a mano de vez en cuando, o cuando alguien se acuerda, y los vacíos vuelven a aparecer. `[1.3.I1]`
- En las solicitudes que se crean hoy, el canal por donde llegó cada una —sucursal, web, app o referido— se anota a mano, cuando alguien se acuerda, y en parte de ellas queda vacío. `[1.3.I2]`
- Las solicitudes que se crean hoy se registran, pero a algunas les falta la fecha esperada de desembolso o de apertura, el monto o el ejecutivo responsable. `[1.3.I3]`

**Funcional.** El reporte de solicitudes en curso sale del sistema, sin armarlo a mano, y la autorización de cada cliente para consultar su historial está registrada.

*Resultado:* El líder ve cuántas solicitudes hay en cada etapa cuando lo necesita, sin armar el reporte a mano, sabe por qué canal llegó cada una y puede demostrar que cada cliente autorizó que se consultara su historial.

- Toda solicitud creada desde la puesta en marcha del recorrido actual tiene producto, monto, fecha esperada de desembolso o de apertura y ejecutivo responsable. `[1.3.F1]`
- Toda solicitud creada desde la puesta en marcha del recorrido actual dice por qué canal llegó: sucursal, ejecutivo, campaña, web, app o referido. `[1.3.F3]`
- El reporte de solicitudes en curso se genera del sistema sin reconstruir números, y refleja el estado actual, no una proyección. `[1.3.F4]`
- Todo prospecto con el que se trabaja tiene registrada su autorización para consultar su historial crediticio, con su fecha. `[1.3.F201 · comprobable]`

**Eficiente.** Aparece una proyección de colocación confiable, y la ficha del cliente reúne sus productos, sus solicitudes y sus conversaciones.

*Resultado:* La entidad puede comprometer una meta de colocación con confianza, y el ejecutivo ve en un solo lugar qué tiene cada cliente y qué pidió.

- Hay una proyección de colocación que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo colocado quedó dentro de ±10% de la proyección. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con lo que viene del core bancario —sus productos, sus saldos y cómo ha pagado— y con su historial de conversaciones: la vista 360° empieza a tomar forma. `[1.3.E3]`

**Óptimo.**

- Cada prospecto, cliente y solicitud se asocia solo, al entrar, con lo que ya había de esa persona o pyme; la IA resuelve los dudosos y una persona valida solo las excepciones que el CRM le marca. `[1.3.O1]`
- Un modelo de IA calcula la proyección de colocación con la historia de las solicitudes; se ve en el sistema y el líder la revisa antes de comprometerla. `[1.3.O2]`
- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, sus productos y saldos del core bancario, sus casos de servicio y sus conversaciones. `[1.3.O3]`
- El área comercial se apoya en el almacén central de datos de la entidad para su proyección de colocación, cruzando lo comercial con el core bancario y el servicio. `[1.3.O4]`

*No aplican:* `1.3.F8`, `1.3.E4`.

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.F2`, `1.3.F9`, `1.3.F10`, `1.3.E5`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué sucursal y qué ejecutivo van bien y quién necesita ayuda?

*Descripción:* Mide si cada ejecutivo tiene un rol y una meta por escrito, si cada sucursal y cada canal digital tienen la suya, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes de que la meta no se cumplió: no vio antes qué sucursal o qué ejecutivo se quedó atrás, ni por qué.

**Deficiente.**

- Cada ejecutivo trabaja sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1]`
- El líder apaga incendios —una solicitud trabada, una sucursal que no llega a la meta—: no hay métricas ni rendición de cuentas. `[1.4.D2]`

**Inicial.**

- El líder revisa algunos números de colocación en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`
- Los reportes de cómo operan los ejecutivos y las sucursales se arman a mano. `[1.4.I2]`

**Funcional.**

*Resultado:* Cada ejecutivo sabe qué se espera de él, y el líder sabe cada semana qué sucursal y qué ejecutivo van bien y quién necesita ayuda, antes de que cierre el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —solicitudes ingresadas, solicitudes aprobadas, monto colocado, tasa de aprobación, tiempo de respuesta— y lo consulta al menos una vez por semana. `[1.4.F2]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con el área de crédito y, si Marketing pasa prospectos, también con Marketing.

*Resultado:* Un ejecutivo nuevo produce más rápido, el traspaso de expedientes con el área de crédito tiene reglas que se cumplen, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa prospectos, ese traspaso también tiene reglas que se cumplen.

- Cuando entra un ejecutivo nuevo, hay un plan de inducción con sus pasos y materiales —productos, política de crédito y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con el área de crédito está escrito y se mide: qué expediente se recibe, en cuánto tiempo se resuelve y por qué se devuelve. `[1.4.E201 · comprobable]`
- Las decisiones de la dirección usan números de fondo: cuánto margen deja cada producto y cada canal, cuánto deja cada cliente en el tiempo y cuánto aporta cada ejecutivo. `[1.4.E6]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué producto y qué canal dejan más margen, qué ejecutivo aporta más y cuánto vale cada cliente en el tiempo.

*Se leen igual:* `1.4.F3`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E3`, `1.4.E4`, `1.4.E5`, `1.4.O2`, `1.4.O3`, `1.4.O4`.

#### 1.5 Oferta y condiciones

¿Cómo sabe un ejecutivo que entra a tu equipo a quién va dirigido cada producto y con qué condiciones ofrecerlo?

*Descripción:* Mide si el equipo sabe a quién ofrecerle cada producto y si las condiciones se dicen igual en cada canal.

*Costo de quedarse:* El cliente escucha una tasa en la sucursal y otra por teléfono, o le piden un requisito que nadie le había dicho: desconfía, compara y se va con la entidad que le habló claro.

**Deficiente.** Nadie puede decir a quién va dirigido cada producto, y cada ejecutivo explica las condiciones de memoria y a su manera.

- Nadie puede decir con claridad a quién va dirigido cada producto, y las condiciones que escucha el cliente cambian según quién lo atienda o por dónde pregunte. `[1.5.D1]`

**Inicial.** Hay fichas de producto, pero no todos las usan: las condiciones todavía varían entre ejecutivos y entre canales.

- El líder sabe quién es el cliente objetivo de cada producto y hay un mensaje común, pero solo de palabra o en un borrador: cada ejecutivo los repite a su manera. `[1.5.I1]`
- Hay un formato de oferta del producto, pero cada ejecutivo lo cambia o lo usa a su manera. `[1.5.I2]`

**Funcional.** El cliente objetivo de cada producto está escrito, y la oferta se dice igual en todos los canales.

*Resultado:* Dos clientes parecidos reciben la misma oferta —tasa, plazo, costos y requisitos— sin importar qué ejecutivo los atienda ni por qué canal lleguen, y saben cuánto les va a costar antes de firmar.

- Existe un documento con el cliente objetivo de cada producto —a quién va dirigido y qué busca—, consultable por cualquier ejecutivo. `[1.5.F1]`
- El líder puede explicar quién es el cliente objetivo de cada producto sin consultar su documentación. `[1.5.F2]`
- Las ofertas están estandarizadas: toda simulación o preaprobación muestra lo mismo —monto, tasa, plazo, cuota y costos—, no armada desde cero cada vez. `[1.5.F4]`
- Las tasas, los costos y los requisitos de cada producto son los mismos en sucursal, por teléfono y en los canales digitales, o la diferencia es a propósito y está escrita. `[1.5.F5]`
- Cada producto tiene una ficha vigente para el cliente —qué es, para quién, tasa, costos y requisitos— publicada en los canales donde se ofrece. `[1.5.F201 · comprobable]`
- Antes de firmar, el cliente recibe por escrito el costo total de lo que contrata: tasa, comisiones, seguros y cuota. `[1.5.F202 · comprobable · hábito]`

**Eficiente.** La oferta se distingue de la de otras entidades y solo promete lo que se puede aprobar.

*Resultado:* Los prospectos ven qué distingue a la entidad: la oferta se diferencia de la de otras entidades, dice lo mismo en el sitio, en la app, en la sucursal y en boca de cada ejecutivo, y lo que se le ofrece al cliente es lo que después se le aprueba.

- Las ofertas solo prometen lo que se puede aprobar: el monto, la tasa y el plazo que se ofrecen se validan contra la política de crédito vigente antes de decírselos al cliente. `[1.5.E3]`
- Se mide cuántas ofertas terminan aprobadas con condiciones distintas de las ofrecidas, y se corrige el origen. `[1.5.E201 · comprobable · hábito]`

**Óptimo.** La IA revisa contra la oferta vigente de cada producto todo lo que se le dice a cada prospecto, y el equipo valida lo que se sale.

- La IA revisa en tiempo real, contra la oferta vigente de cada producto —su mensaje, su tasa, su plazo, sus costos y sus requisitos—, lo que se les dice a los prospectos, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I3`, `1.5.F3`, `1.5.F6`, `1.5.E2`, `1.5.E4`.

#### 1.6 Precalificación y priorización

¿Cómo decide tu equipo a qué prospectos dedicarles tiempo antes de armar un expediente?

*Descripción:* Mide si el equipo decide a quién dedicarle tiempo con criterios escritos, según el cliente objetivo de cada producto.

*Costo de quedarse:* Tus ejecutivos arman expedientes completos de clientes que no iban a calificar, mientras los que sí califican esperan su turno y se van a otra entidad.

**Deficiente.** Se atiende a los prospectos por orden de llegada, y se arma el expediente antes de saber si califican.

- Se arma el expediente completo antes de saber si el cliente califica. `[1.6.D201 · evaluado]`

**Inicial.**

- Los prospectos se separan en alguna lista o con una etiqueta, pero cada ejecutivo lo hace con su propio criterio. `[1.6.I1]`
- El líder sabe quién es el cliente objetivo de cada producto, pero el CRM no tiene los campos para separar los prospectos que encajan. `[1.6.I2]`

**Funcional.** Los prospectos se separan por los rasgos del cliente objetivo de cada producto y hay una definición escrita de quién precalifica que el equipo aplica antes de armar el expediente.

*Resultado:* El equipo deja de armar expedientes de quien no encaja con el cliente objetivo del producto y concentra el esfuerzo en los prospectos que sí encajan y cumplen la definición de prospecto precalificado.

- El equipo segmenta a los prospectos por los atributos del cliente objetivo antes de trabajarlos: en personas, ingreso, tipo de empleo o zona; en pymes, actividad, antigüedad o ventas. `[1.6.F1]`
- Los rasgos del cliente objetivo de cada producto son campos del CRM y de los formularios de solicitud. `[1.6.F4]`
- Antes de ofrecerle un producto a quien ya es cliente, se revisa qué tiene con la entidad y cómo ha pagado. `[1.6.F201 · evaluado · hábito]`
- Las condiciones básicas de cada producto están escritas y el canal digital las aplica antes de pedirle documentos al cliente. `[1.6.F202 · comprobable · venta sin vendedor]`

**Eficiente.** La precalificación es automática, y hay clientes preaprobados a quienes ofrecerles sin esperar a que pregunten.

*Resultado:* Cada ejecutivo sabe cada mañana a quién contactar primero, quien no califica lo sabe enseguida, y los clientes que ya califican reciben la oferta sin tener que pedirla.

- La precalificación es automática: con los datos de la solicitud, el sistema dice si el cliente cumple las condiciones básicas del producto antes de que alguien le dedique tiempo. `[1.6.E201 · comprobable · requiere 1.6.F2, 1.6.F202]`
- Hay listas de clientes preaprobados por producto, armadas con su comportamiento, y se les ofrece sin esperar a que pregunten. `[1.6.E202 · comprobable · requiere 1.3.E3]`
- Un modelo de IA calcula para cada cliente qué producto le conviene y cuándo ofrecérselo, con su comportamiento y con lo que saben Servicio y Marketing de él; la sugerencia se ve en el CRM y el ejecutivo la valida antes de ofrecerla. `[1.6.E203 · comprobable]`

**Óptimo.** La IA calcula a quién ofrecerle qué producto y cuándo, con todo lo que se sabe de cada cliente; el ejecutivo valida antes de ofrecerlo y, en los canales digitales, se ofrece dentro de los límites que fijó la entidad.

*Resultado:* La entidad sabe qué cliente atender, con qué producto y cuándo, con lo que saben Servicio y Marketing de cada uno, incluido dónde hay riesgo o espacio para ofrecer más.

- En los canales digitales, la IA le ofrece sola a cada cliente el producto que le conviene, dentro de los límites que fijó la entidad, y el ejecutivo revisa en el CRM lo que se ofreció. `[1.6.O202 · comprobable]`

*Se leen igual:* `1.6.D1`, `1.6.F2`, `1.6.F3`, `1.6.E3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O3`, `1.6.O4`, `1.6.O5`.

#### 1.7 Avance de la solicitud

¿Qué pasa con una solicitud que se queda esperando un documento, una aprobación o una respuesta del cliente?

*Descripción:* Mide si alguien detecta cuando una solicitud deja de avanzar y si hay una respuesta acordada para retomarla a tiempo; donde el cliente vuelve a contratar sin tener un producto vigente, también si se le busca cuando su próxima contratación se atrasa.

*Costo de quedarse:* Las solicitudes se enfrían esperando un documento o una firma: nadie ve cuáles dejaron de avanzar, y el cliente termina el trámite en otra entidad.

**Deficiente.** El ejecutivo está solo con sus solicitudes, y las que se abandonan en los canales digitales no las ve nadie.

- Las solicitudes que el cliente deja a medias en la web o en la app no las retoma nadie. `[1.7.D201 · comprobable · venta sin vendedor]`

**Inicial.**

- Cuando una solicitud se detiene —esperando un documento, una firma o una respuesta—, cada ejecutivo decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`
- El líder solo interviene cuando el ejecutivo le pide ayuda o cuando la solicitud ya está casi perdida. `[1.7.I2]`
- Cada ejecutivo tiene su propio material para explicar los productos y lo arma a su manera. `[1.7.I3]`
- Todos los intentos de hacer avanzar una solicitud se hacen por el mismo canal, por ejemplo solo por llamada. `[1.7.I4]`

**Funcional.** Ninguna solicitud se enfría en silencio: se detecta a tiempo y hay un paso acordado para retomarla.

*Resultado:* Las solicitudes que se traban —falta un documento, una firma o una respuesta— se detectan a tiempo y se retoman por más de un canal; donde la venta pasa por un ejecutivo, con material de venta común y con el líder actuando mientras todavía hay margen. La solicitud que el cliente dejó a medias en un canal digital no se pierde y, donde el cliente vuelve a contratar sin tener un producto vigente, su próxima contratación tampoco se deja al azar.

- El seguimiento usa al menos dos canales, por ejemplo llamada y el canal conversacional, como WhatsApp. `[1.7.F2]`
- Las solicitudes que el cliente deja a medias en un canal digital reciben un recordatorio o una llamada dentro del plazo acordado. `[1.7.F201 · comprobable · hábito · venta sin vendedor · requiere 1.2.F201]`

**Eficiente.** El seguimiento de las solicitudes detenidas combina varios canales, el sistema le avisa al líder de lo que se traba y quien hoy no califica sigue en nutrición.

*Resultado:* Ninguna solicitud espera a la reunión para recibir ayuda, el cliente al que hoy no se le pudo aprobar vuelve a recibir una oferta cuando cambia su situación, y se sabe cuánto de lo que se traba se recupera.

- El seguimiento de las solicitudes detenidas o abandonadas combina al menos tres canales —por ejemplo, llamada, correo y notificaciones de la app— en una secuencia definida. `[1.7.E1]`
- Los prospectos que todavía no están listos o que hoy no califican no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven al ejecutivo cuando muestran interés o cambia su situación. `[1.7.E2]`
- Cuando una solicitud lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántas solicitudes detenidas o abandonadas se recuperan, con qué mensaje y por qué canal. `[1.7.E201 · comprobable]`

**Óptimo.** La IA detecta qué solicitudes se van a caer y decide el canal y el momento de cada seguimiento; el equipo valida.

*Resultado:* Las solicitudes con más posibilidades reciben ayuda justo cuando la necesitan: la IA detecta dónde se traba cada una y propone a quién movilizar.

- La IA decide el canal y el momento de cada seguimiento, cliente por cliente y según cómo responde, dentro de los límites que fijó la entidad; el equipo revisa los resultados, y lo que decide la IA queda registrado en el CRM. `[1.7.O2]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.D4`, `1.7.F1`, `1.7.F3`, `1.7.F4`, `1.7.F6`, `1.7.F7`, `1.7.E3`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O3`.

#### 1.8 Aprobadas, rechazadas y desistidas

¿Qué queda registrado cuando una solicitud no termina en un producto colocado?

*Descripción:* Mide si queda registrado por qué cada solicitud se rechaza, se desiste o se abandona, y si el equipo revisa las que se concretan y las que no para mejorar su proceso.

*Costo de quedarse:* No sabes por qué se caen las solicitudes: cada quien tiene su explicación —una tasa, un requisito, una demora— y sin un registro no hay cómo ver cuántas rechazó la entidad y cuántas dejó el cliente.

**Deficiente.** Nadie mira por qué una solicitud no se concreta.

- Cuando una solicitud no se concreta, no hay una razón en la que el equipo coincida: cada ejecutivo da su versión, de memoria. `[1.8.D1]`
- Las solicitudes que no se concretan —rechazadas, desistidas o abandonadas— se cierran sin anotar la razón. `[1.8.D2]`

**Inicial.** De las solicitudes que no se concretan se habla de vez en cuando, y la razón se anota a veces, a criterio de cada ejecutivo.

- Por qué no se concretó una solicitud se anota a veces y en texto libre, a criterio de cada ejecutivo, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada solicitud que no se concreta queda con su razón, elegida de una lista fija que separa lo que rechazó la entidad de lo que dejó el cliente, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no se concretan las solicitudes —cuántas rechazó la entidad, cuántas dejó el cliente y por qué—, con datos del trimestre y no con impresiones.

- Toda solicitud creada desde la puesta en marcha del recorrido actual que no se concretó tiene registrada su razón. `[1.8.F1]`
- Las razones por las que no se concreta una solicitud usan una lista definida, no texto libre. `[1.8.F2]`
- El líder puede sacar del sistema el reporte del trimestre de por qué no se concretaron las solicitudes, sin armarlo a mano. `[1.8.F3]`
- Las razones separan lo que rechazó la entidad —política, capacidad de pago, historial— de lo que dejó el cliente —tasa, demora, requisitos, otra entidad—. `[1.8.F201 · comprobable]`

**Eficiente.** Cada trimestre se revisa por qué se concretan y por qué no se concretan las solicitudes, lo aprendido vuelve al proceso y a la precalificación, y el equipo se capacita con un calendario fijo.

*Resultado:* Lo que más se repite en los rechazos y los desistimientos se corrige, y lo que hace que una solicitud se concrete se vuelve parte del proceso: lo que muestra la revisión de cada trimestre cambia el proceso, la precalificación y la capacitación del equipo.

- Al menos una vez por trimestre se revisan las solicitudes que se concretaron y las que no —rechazadas, desistidas y abandonadas— para encontrar lo que se repite. `[1.8.E1]`
- Las razones de rechazo se revisan con el área de crédito, para ajustar a quién se le ofrece cada producto. `[1.8.E201 · declarado · hábito]`
- La IA detecta en qué etapa y por qué se caen las solicitudes y propone el cambio, que se ve en el CRM; el líder decide si se aplica. `[1.8.E202 · comprobable]`

**Óptimo.** La IA analiza las llamadas con los prospectos, encuentra en qué etapa y por qué se caen las solicitudes y propone correcciones; el líder decide cuáles se aplican.

*Se leen igual:* `1.8.E2`, `1.8.E3`, `1.8.E4`, `1.8.O1`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del marketing de la entidad: cómo está montado por dentro y qué produce en prospectos, solicitudes y confianza en la marca. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que la entidad dirige.

**Deficiente.** Tu marca no la defines tú, la define el mercado. Cada producto se anuncia con su propia voz, las piezas salen sin pasar por cumplimiento normativo y tus clientes no tienen cómo distinguir un mensaje tuyo de un fraude que te imita. Las herramientas están sueltas y las campañas corren hasta agotar el presupuesto sin que nadie sepa cuántas solicitudes dejaron. Los prospectos llegan por casualidad.

**Inicial.** Tienes marca y campañas por producto, pero sin estrategia detrás. Las herramientas se usan a medias y parte de lo que entra se pasa a mano, el contenido sale cuando se puede, cumplimiento normativo revisa a última hora y la campaña se atrasa, y los resultados se miden tarde y a mano, sin que lo aprendido quede escrito. No siempre sabes de dónde vienen tus prospectos.

**Funcional.** El área dejó de depender de héroes. Tienes marca, buyer personas y presencia digital documentadas, y las herramientas que pagas se usan de verdad. Cada pieza pasa por cumplimiento normativo y dice cuánto cuesta el producto, y tus clientes saben por dónde les escribes y qué nunca les vas a pedir. Tus campañas salen por segmento y con regularidad, coordinadas bajo un mismo calendario por los canales que elegiste en tu plan —también los propios, como la app o la sucursal— y solo a quien aceptó recibirlas. Sabes de dónde viene cada prospecto y cuánto te cuesta en cada canal. Todavía no optimizas fino, pero la demanda ya se mide.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la siguiente campaña. Los datos se completan solos y sabes qué aportó cada canal a cada producto colocado, y cuánto te cuesta colocar cada uno sumando la sucursal y lo digital; los segmentos y el puntaje de prospectos se arman solos, y la IA asiste al equipo en su trabajo diario. Cumplimiento normativo responde en un plazo que se mide, te encuentran también en los asistentes de IA, y el presupuesto se mueve entre canales según lo que cuesta cada prospecto o cada producto colocado.

**Óptimo.** La IA produce y ajusta; el equipo dirige. El contenido se genera y se ajusta de forma continua; la IA predice qué va a hacer cada persona, adapta el mensaje a lo que hace y mueve el presupuesto entre canales dentro de los límites que fija el equipo; y los clientes que Servicio vuelve promotores traen clientes nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma en tu equipo la campaña de un producto, desde que se decide hasta que cumplimiento normativo la aprueba y se publica?

*Descripción:* Mide si las campañas salen de un calendario y un proceso compartidos, con la revisión de cumplimiento normativo incluida.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona falta, la del producto se atrasa o sale sin la revisión de cumplimiento normativo, y una pieza sin revisar puede costarte una sanción.

**Deficiente.**

- No existe calendario editorial; las campañas de los productos se improvisan. `[2.1.D1]`
- El equipo de marketing no se reúne: cada quien se entera de lo que hacen los demás —la campaña de un producto, una publicación— cuando ya salió. `[2.1.D2]`
- Una agencia arma y publica las campañas de los productos, y nadie en la entidad decide qué sale ni lo revisa. `[2.1.D3]`

**Inicial.** Hay un calendario y algunas reuniones, pero se cumplen cuando se puede, las campañas dependen de quien las arma y cumplimiento normativo revisa a última hora.

- Cumplimiento normativo revisa las piezas sin un paso acordado en el proceso: le llegan a última hora, y la campaña se atrasa esperando su visto bueno o sale sin él. `[2.1.I201 · declarado]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y cada pieza pasa por cumplimiento normativo antes de salir.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y las campañas de cada producto siguen saliendo aunque cambie una persona, con la revisión de cumplimiento normativo hecha: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada una sin tener que preguntar.

- Toda pieza que habla de un producto pasa por la revisión de cumplimiento normativo antes de publicarse, y su aprobación queda registrada. `[2.1.F201 · declarado · hábito]`

**Eficiente.**

*Resultado:* Cada pieza sale revisada en su calidad, no solo aprobada por cumplimiento normativo, y el líder sabe dónde se desvía el proceso y corrige con datos, no de memoria.

**Óptimo.**

- El sistema detecta por sí mismo cuando la campaña de un producto se sale del proceso —un paso que se saltó, una fecha que venció— y se lo avisa al líder y al responsable; el líder decide el ajuste, y cada aviso queda en el sistema. `[2.1.O4]`
- El proceso de campaña se cumple sin que nadie lo vigile a mano: en el sistema se ve que la campaña de cada producto siguió sus pasos. `[2.1.O5]`

*Se leen igual:* `2.1.I1`, `2.1.I2`, `2.1.I3`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E4`, `2.1.E5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide información de un producto en tu sitio o te escribe por WhatsApp o por el chat?

*Descripción:* Mide si las herramientas que paga la entidad se usan, si quien pide información de un producto llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien pide información de un crédito en tu sitio o por mensaje espera a que alguien lo pase al sistema y le conteste, o se pierde, y parte de las herramientas que pagas no se usa.

**Deficiente.**

- No hay un sistema donde registrar a los prospectos: se llevan en hojas de cálculo o en el correo. `[2.2.D1]`
- Lo que llega por el sitio o por mensajes —un pedido de información de un producto, una consulta— cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`
- Lo que entra por formularios —también los de cada producto— o por mensajes no recibe ninguna respuesta ni aviso automático: todo se hace a mano. `[2.2.D3]`

**Inicial.**

- Se pagan licencias o módulos que el equipo no usa: por ejemplo, un módulo de la herramienta de marketing o del CRM que se contrató y nunca se puso en marcha. `[2.2.I1]`

**Funcional.**

*Resultado:* Quien pide información de un producto en el sitio o, si la entidad los usa, por WhatsApp o por el chat, entra al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Si el sitio tiene formularios para dejar datos —pedir información de un producto, pedir que llame un ejecutivo—, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`

**Eficiente.**

*Resultado:* Los prospectos reciben su nutrición sin que nadie la mande a mano, hasta que están listos para contratar el producto —o para hablar con un ejecutivo, donde la venta pasa por uno—; la conversación con cada contacto no depende de que alguien se acuerde de escribirle y, si se atiende por WhatsApp o por el chat, el líder ve en tiempo real qué conversaciones esperan respuesta.

- El traspaso de prospectos es automático: cuando un prospecto cumple los criterios para pasar a un ejecutivo, le llega con su historial al ejecutivo o a la sucursal que le corresponde, sin que nadie lo pase a mano. `[2.2.E3]`

**Óptimo.**

*Resultado:* Cada contacto vive un recorrido pensado para él: la IA decide el siguiente mensaje con lo que la entidad sabe de él en todos sus sistemas y, si se atiende por WhatsApp o por el chat, conversa con él en el momento.

- Lo que se calcula en el almacén central de datos de la entidad vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada contacto: la segmentación usa, por ejemplo, la rentabilidad real de cada cliente, calculada afuera. `[2.2.O3]`

*Se leen igual:* `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.F10`, `2.2.F11`, `2.2.E1`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.E8`, `2.2.O1`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántos prospectos entran, de dónde vienen y cuántos llegan a una solicitud?

*Descripción:* Mide si los datos de marketing son confiables: de dónde viene cada prospecto, en qué etapa está, si los reportes salen del sistema sin rehacerlos y si queda registrado quién aceptó recibir ofertas.

*Costo de quedarse:* No sabes de dónde viene cada prospecto ni cuántos llegan a una solicitud, cada reporte hay que rehacerlo a mano antes de creerle, y no tienes registrado quién te dio permiso para escribirle ofertas: te expones a una sanción.

**Deficiente.**

- No se registra de dónde llegó cada prospecto: nadie sabe si vino por el sitio, una feria, la sucursal o un referido. `[2.3.D1]`
- No hay reportes de marketing: cuando la gerencia pide un número, hay que buscarlo en correos y hojas sueltas. `[2.3.D2]`

**Inicial.**

- No hay una regla de cuándo se limpian los datos: se corrigen a mano cuando alguien nota un problema, y a muchos contactos les faltan los datos que describen al cliente objetivo de cada producto. `[2.3.I1]`
- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los prospectos le falta el origen. `[2.3.I2]`

**Funcional.**

*Resultado:* El líder sabe de dónde viene cada prospecto, con reportes que salen del sistema y no de una hoja armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, una conversación, la app o la contratación de un producto— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los duplicados —la misma persona como cliente y como prospecto, o con dos correos— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —cuántos prospectos entran, de dónde vienen y cuántos llegan a una solicitud— salen del sistema sin armarlos a mano. `[2.3.F5]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada producto colocado, no solo cuál trajo el primer clic.

- Los datos de cada contacto se completan solos con servicios de terceros —por ejemplo, la actividad y el tamaño de una pyme—, más allá de lo que la persona escribió. `[2.3.E1]`

**Óptimo.**

*Resultado:* La atribución toma en cuenta todo lo que pasa en la entidad, no solo lo que ve Marketing, y los datos se mantienen confiables sin corregirlos a mano: el equipo solo valida las excepciones.

- Marketing se apoya en el almacén central de datos de la entidad, donde se junta la información de todas las herramientas, y sus reportes de atribución salen de esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.F2`, `2.3.F6`, `2.3.F8`, `2.3.F9`, `2.3.E2`, `2.3.E5`, `2.3.E6`, `2.3.E7`, `2.3.O5`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing ante la gerencia por sus resultados?

*Descripción:* Mide si cada persona sabe qué le toca, si el equipo tiene metas y si las decisiones —como qué producto promover— y la rendición de cuentas se apoyan en números del sistema.

*Costo de quedarse:* Se promueve el producto del área que más presiona, no el que más conviene, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Deficiente.**

- Nadie tiene el marketing de los productos como responsabilidad propia: se hace en los ratos libres de quien pueda. `[2.4.D1]`
- Qué producto promover y cómo hacerlo se decide sobre la marcha, sin metas ni números. `[2.4.D2]`
- Nadie revisa los resultados de marketing: ni el equipo ni la gerencia. `[2.4.D3]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué publicar, qué pieza aprobar— espera a que lo resuelva la gerencia general. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —cuántos prospectos entran, de dónde vienen, cuántos llegan a una solicitud y cuántos quedan listos para pasar a un ejecutivo, donde la venta pasa por uno— y lo consulta al menos una vez por semana. `[2.4.F2]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con el área comercial y con cumplimiento normativo, y escucha al equipo.

*Resultado:* Una persona nueva se integra rápido, Marketing trabaja con reglas acordadas con el área comercial y con Servicio en vez de discutir cada vez quién se hace cargo de un prospecto o de un cliente, y ninguna campaña se queda esperando a cumplimiento normativo sin que se sepa por qué.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —productos, marca y lo que la regulación exige en una pieza—; no se le entrena de memoria. `[2.4.E2]`
- El acuerdo con cumplimiento normativo está escrito y se mide: qué piezas revisa, en cuánto tiempo responde y por qué devuelve una. `[2.4.E201 · comprobable]`
- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —la rentabilidad de los clientes que trae— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la gerencia decide con lo que deja cada canal en el tiempo —la rentabilidad de los clientes que trae— frente a lo que cuesta.

*Se leen igual:* `2.4.I2`, `2.4.F3`, `2.4.F4`, `2.4.F5`, `2.4.F7`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`, `2.4.O6`.

#### 2.5 Marca y confianza

¿Qué guía a tu equipo cuando arma una pieza que anuncia un producto?

*Descripción:* Mide si la marca se ve y suena igual en todo lo que sale, si está escrito a quién le habla, si el sitio aparece en buscadores y si el cliente puede confiar: ve el costo de cada producto y sabe reconocer un fraude que imita a la entidad.

*Costo de quedarse:* Cada pieza se ve y suena distinta a la anterior, tus clientes no distinguen un mensaje tuyo de un fraude que te imita, y un anuncio que esconde el costo te trae reclamos y una sanción.

**Deficiente.**

- No hay una guía de marca: ni logo, colores y tipografía definidos, ni una forma de escribir acordada, así que cada producto se anuncia a su manera. `[2.5.D1]`
- No está escrito a quién le habla la entidad: no hay buyer personas. `[2.5.D2]`
- El sitio no está preparado para buscadores: sus páginas —también las de cada producto— no tienen título ni descripción, o no hay sitio. `[2.5.D3]`
- El cliente no tiene cómo saber si un mensaje que dice ser de la entidad es de verdad: la entidad no publica por qué canales escribe ni qué nunca le va a pedir. `[2.5.D201 · comprobable]`

**Inicial.**

- Hay logo, colores y plantillas, pero el buyer persona es uno solo y tan general que sirve igual para el asalariado que para la pyme. `[2.5.I1]`
- Solo algunas páginas del sitio —por ejemplo, las de algunos productos— tienen título y descripción, o el sitio carga mal en el celular o tiene enlaces rotos. `[2.5.I2]`
- Se publica contenido propio —de educación financiera, de seguridad o guías de los productos— de vez en cuando, cuando alguien tiene tiempo, sin una frecuencia fija. `[2.5.I3]`
- Los canales oficiales y lo que la entidad nunca pide están publicados solo en un rincón del sitio: no se repiten donde el cliente recibe los mensajes. `[2.5.I201 · comprobable]`

**Funcional.** La marca, la voz y los buyer personas están escritos y se usan, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes; cada anuncio muestra el costo y el cliente sabe reconocer un fraude que imita a la entidad.

*Resultado:* La marca se ve y suena igual en todo lo que sale, cada anuncio dice cuánto cuesta el producto, el cliente sabe reconocer cuándo le escribe la entidad y cuándo es un fraude, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- La entidad le dice al cliente, en su sitio y en los demás canales que tenga, desde qué números, perfiles y correos le escribe, y qué nunca le va a pedir, como su clave o un código de verificación. `[2.5.F201 · comprobable]`
- Toda pieza que anuncia una tasa, una cuota o un beneficio muestra también el costo total, los requisitos y las condiciones que exige la regulación, o enlaza a donde están. `[2.5.F202 · comprobable]`

**Eficiente.**

*Resultado:* La entidad aparece cuando la gente busca cómo ahorrar, usar bien el crédito o financiar su pyme, tanto en buscadores como en asistentes de IA, con contenido pensado para cada segmento que importa, y cada reseña de sus clientes, buena o mala, recibe respuesta.

- Si el contenido propio se publica en el sitio, está organizado por temas —por ejemplo, ahorrar, usar bien el crédito o financiar una pyme—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`

**Óptimo.**

*Se leen igual:* `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E3`, `2.5.E4`, `2.5.E6`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en la campaña que recibe un prospecto según su segmento: persona, pyme o cliente de planilla o nómina?

*Descripción:* Mide si cada segmento recibe campañas del producto que le sirve, o si todos reciben la misma oferta.

*Costo de quedarse:* Le ofreces la tarjeta a quien ya la tiene y el crédito de pyme a un asalariado: gastas en campañas que nadie aprovecha y cansas a tus clientes.

**Deficiente.**

- No hay segmentos: las campañas de cada producto salen a toda la base con el mismo mensaje. `[2.6.D1]`
- Los correos son iguales para todos, sea una persona, una pyme o un cliente de planilla: a lo sumo cambia el nombre en el saludo. `[2.6.D2]`

**Inicial.** La base se separa por datos sueltos, como la zona, el mensaje casi no cambia de un grupo a otro y las campañas le ofrecen un producto a quien ya lo tiene.

- Las campañas le ofrecen un producto a quien ya lo tiene. `[2.6.I201 · comprobable]`

**Funcional.** Hay segmentos escritos, piezas pensadas para cada uno, nadie recibe la oferta de un producto que ya tiene y, donde la venta pasa por un ejecutivo, criterios escritos para clasificar los prospectos.

*Resultado:* Cada segmento recibe la campaña del producto que le sirve, nadie recibe la oferta de lo que ya tiene y, donde la venta pasa por un ejecutivo, este recibe prospectos que Marketing ya clasificó con criterios escritos.

- Existen criterios escritos de qué es un suscriptor, un prospecto y un prospecto listo para pasar a un ejecutivo, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios. `[2.6.F4]`
- Las campañas de un producto no le llegan a quien ya lo tiene, salvo que sean para él —un aumento de límite, un segundo crédito—: la lista se cruza con los productos de cada cliente antes de enviar. `[2.6.F201 · comprobable]`

**Eficiente.** Los segmentos y el puntaje de prospectos se arman solos, y el mensaje se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los prospectos con más probabilidad de hacer una solicitud se distinguen del resto: donde la venta pasa por un ejecutivo, él los recibe primero.

**Óptimo.**

- La IA predice quién va a contratar un producto y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.I1`, `2.6.I2`, `2.6.F3`, `2.6.F5`, `2.6.E1`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.E6`, `2.6.E7`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen las campañas de tus productos por los canales que usas, también la app y la sucursal?

*Descripción:* Mide si los canales que la entidad eligió, también los propios, salen con regularidad, bajo un mismo plan, solo a quien dio su permiso y con un costo conocido.

*Costo de quedarse:* Tus campañas salen sueltas y a veces a quien no dio permiso: no sabes cuánto te cuesta cada prospecto, y te expones a una sanción.

**Deficiente.**

- No hay canales activos: la entidad no promueve sus productos por ningún canal —ni redes, ni correo, ni pauta, ni mensajes, ni eventos—. `[2.7.D1]`
- No hay un plan que diga por qué canales sale la entidad a promover sus productos. `[2.7.D2]`

**Inicial.**

- Cada canal va por su lado: no hay calendario común ni campaña que los atraviese. `[2.7.I3]`

**Funcional.** Los canales que la entidad eligió —también los propios, como la app o la sucursal— salen con regularidad, bajo un mismo plan y solo a quien dio su permiso.

*Resultado:* La campaña de un producto sale coordinada por todos los canales del plan —también los propios, como la app o la sucursal— en vez de esfuerzos sueltos, solo a quien aceptó recibirla, y el líder ve cuánto le cuesta cada prospecto según el canal del que venga.

- Los canales que la entidad eligió en su plan siguen el mismo calendario y la misma campaña: la de un producto sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada prospecto —o cada producto colocado, donde el cliente lo contrata solo en los canales digitales— el último mes, al menos por canal. `[2.7.F6]`
- Las campañas solo le llegan a quien aceptó recibir ofertas por ese canal, y quien pide no recibir más deja de recibirlas. `[2.7.F201 · comprobable · requiere 2.3.F9]`
- Las campañas dirigidas a clientes salen también por los canales propios que tenga la entidad —la app, la banca en línea, las sucursales—, con el mismo mensaje y en las mismas fechas. `[2.7.F202 · declarado · hábito]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, y el presupuesto se mueve según lo que cuesta cada prospecto o cada producto colocado en cada canal, también el que se coloca en la sucursal o con un ejecutivo.

*Resultado:* La inversión se mueve hacia el canal que mejor rinde —medido por los productos que coloca, no solo por los prospectos que trae—, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Si las charlas en línea o los eventos son parte del plan de canales —por ejemplo, de educación financiera para pymes o para los empleados de una empresa que paga su planilla con la entidad—, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar un producto —una tarjeta, una cuenta—, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- Se sabe, por canal, cuánto costó cada producto colocado, contando también lo que se colocó en la sucursal o con un ejecutivo, no solo en los canales digitales. `[2.7.E201 · comprobable · requiere 1.3.F3]`
- Se prueban canales nuevos —creadores de contenido de finanzas personales, comunidades de emprendedores, formatos nuevos— en ciclos de dos meses o menos. `[2.7.E9]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más retorna, dentro de los límites que fija el equipo; los clientes satisfechos traen clientes nuevos, y la entidad prueba canales nuevos sin esperar a ver qué hacen otras entidades.

- Los clientes que Servicio identifica como promotores se vuelven un canal de referidos —por ejemplo, para una tarjeta o una cuenta— y de casos de éxito sin pedirlos a mano: el sistema los invita solo, el equipo elige qué casos se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*No aplican:* `2.7.E5`.

*Se leen igual:* `2.7.I1`, `2.7.I2`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.F7`, `2.7.F8`, `2.7.E3`, `2.7.E6`, `2.7.E7`, `2.7.E8`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de la campaña de un producto cuando termina?

*Descripción:* Mide si cada campaña se evalúa por las solicitudes y los productos colocados que dejó, y si deja un aprendizaje.

*Costo de quedarse:* Repites las campañas de siempre porque nadie anota cuáles colocaron productos: cada una empieza de cero, sin saber qué dejó la anterior.

**Deficiente.**

- Nadie vuelve a mirar la campaña de un producto después de lanzarla: sale y ahí queda. `[2.8.D1]`
- No se mide qué solicitudes trajo cada campaña: solo se sabe lo que se gastó, o ni eso. `[2.8.D2]`
- No queda registro de cómo le fue a la campaña de cada producto. `[2.8.D3]`

**Inicial.**

- Se miran clics, alcance y me gusta, no los prospectos ni los productos colocados que trajo cada campaña. `[2.8.I1]`
- Para saber cómo le fue a la campaña de un producto, alguien junta los números a mano en una hoja, semanas después de que terminó. `[2.8.I2]`

**Funcional.**

- Los resultados de cada campaña —los prospectos, las solicitudes o los productos colocados que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

**Óptimo.**

- La IA ajusta las campañas de los productos mientras corren —deja de mostrar la versión que no funciona y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.F3`, `2.8.E3`, `2.8.E4`, `2.8.E5`, `2.8.O3`.

### Área 3 — Servicio

Mide el rendimiento del servicio de la entidad, que cubre todo lo que pasa después de que el cliente contrata un producto: cómo está montado por dentro y qué produce en reclamos resueltos, productos en uso y clientes que se quedan.

**Deficiente.** El servicio se improvisa cliente por cliente. Cada sucursal y cada persona que atiende resuelve los reclamos a su manera, no hay un sistema donde queden los casos y nadie sabe si se respondieron en el plazo que fija el regulador. Te enteras de que un cliente se fue cuando ya cerró su cuenta.

**Inicial.** El conocimiento vive en una o dos personas que saben cómo se resuelve cada gestión, y eso te deja con un punto único de fallo. Hay un sistema de casos, pero parte del equipo sigue atendiendo por fuera, en su correo o su teléfono; cada agente tiene sus propias respuestas guardadas, hay procesos que nadie escribió y cada quien verifica a su manera quién es el cliente. La atención es frágil: para bloquear una tarjeta, el cliente tiene que esperar a que lo atiendan.

**Funcional.** Tu atención es consistente y ya no depende de quién atienda. Sabes qué tipos de cliente atiendes —personas, pymes, banca preferente— y qué espera cada uno. Cada caso sigue un mismo recorrido en el sistema, con la ficha del cliente a la vista; cada reclamo lleva el plazo que fija el regulador y sabes cuántos se respondieron dentro de ese plazo, y nadie atiende una gestión sin verificar quién es el cliente. Un fraude va primero y, si emites tarjetas, el cliente bloquea la suya al instante. Todavía no hay alertas automáticas de quién se puede ir, pero donde la relación es continua el cliente ya recibe aviso antes de cada cobro y ayuda para activar lo que contrató, y quien pide cancelar recibe una razón para quedarse.

**Eficiente.** El servicio empieza a adelantarse al problema. Cada tipo de caso tiene su plazo, con alertas y escalación automática; el cliente sigue sus casos y hace sus gestiones más comunes en la app, y la IA asiste a tu equipo en su trabajo diario. Mides tiempos y satisfacción, y la información del cliente se une con la del área comercial. Ves venir los problemas antes de que el cliente levante la mano, y ningún caso se pierde entre tarjetas, operaciones y Servicio. Donde el cliente sigue con la entidad, cada cliente tiene un indicador de salud y tus clientes de banca preferente y tus pymes más importantes, un responsable dedicado; donde la relación es continua, quien da señales de irse recibe una acción de retención antes de decidirlo.

**Óptimo.** Un agente de IA resuelve casos en todos los canales donde atiende tu equipo y le pasa a una persona, con todo el contexto, los que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y gestiona las excepciones; cada cliente se atiende sabiendo lo que se le ofreció al contratar y recibe detalles pensados para él y, donde el cliente sigue con la entidad, un modelo anticipa qué cliente se puede ir antes de que lo diga. La entidad suma clientes sin que crezca el equipo.

#### 3.1 Procesos y Rutinas

¿Cómo se atiende un caso en tu entidad —un reclamo, una consulta o una gestión—, desde que entra hasta que se cierra?

*Descripción:* Mide si los reclamos y las gestiones siguen un proceso definido, sin depender de quién los atienda.

*Costo de quedarse:* Un reclamo se resuelve distinto según quién lo tome: el cliente no sabe a qué atenerse, y un plazo del regulador que se vence termina en una sanción.

**Deficiente.**

- Cada agente maneja los reclamos, las consultas y las gestiones a su manera. `[3.1.D1]`

**Inicial.**

- Hay un recorrido para atender los reclamos, las consultas y las gestiones que el equipo sigue de palabra, sin configurar ni escribir. `[3.1.I1]`

**Funcional.** El equipo atiende en un mismo sistema, con el recorrido de atención configurado, los plazos del regulador escritos y la identidad del cliente verificada.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada cliente tiene a alguien que responde por él, cada reclamo lleva escrito el plazo que fija el regulador, y nadie atiende una gestión sin verificar antes quién es el cliente.

- El recorrido de atención está configurado con sus etapas y cubre cada caso —reclamo, consulta o gestión—, de la recepción al cierre. `[3.1.F1]`
- Existe un proceso escrito para escalar los reclamos graves —un fraude, un cargo no reconocido— y los casos que quien atiende no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cada tipo de reclamo tiene escrito en el proceso el plazo de respuesta que fija el regulador. `[3.1.F201 · declarado]`
- Antes de atender una gestión sobre un producto, se verifica la identidad del cliente con los pasos que define el proceso, en cualquier canal, y queda registrado en el caso. `[3.1.F202 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso, también los que no tienen un plazo del regulador; cada momento clave de la relación del cliente con la entidad tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de caso o prioridad, también para lo que el regulador no fija: las consultas y las gestiones. `[3.1.E1]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —la activación, el primer uso y, si los hay, la renovación o el vencimiento— y un responsable y un estándar para cada uno. `[3.1.E4]`

**Óptimo.**

- El sistema detecta, sin que nadie lo revise a mano, cuando un reclamo, una consulta o una gestión se sale de las etapas o los pasos del proceso, y se lo señala al agente y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3]`
- Cada reclamo, consulta o gestión sigue las etapas y los pasos del proceso de atención sin que nadie lo vigile a mano. `[3.1.O4]`

*Se leen igual:* `3.1.D2`, `3.1.I2`, `3.1.I3`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F5`, `3.1.F6`, `3.1.F7`, `3.1.F8`, `3.1.E3`, `3.1.E5`, `3.1.E6`.

#### 3.2 Tecnología y Automatización

¿Cómo llega un caso nuevo —un reclamo, una gestión— al sistema y a la persona que lo tiene que atender, entre por la sucursal, el teléfono o la app?

*Descripción:* Mide si cada caso, venga de la sucursal, el teléfono o la app, queda en el sistema y llega solo a quien lo atiende, y cuánto de la atención se automatiza.

*Costo de quedarse:* Tu equipo reparte y sigue los casos a mano, y se pierden entre la sucursal, el teléfono y WhatsApp: el cliente tiene que insistir para que lo atiendan.

**Deficiente.**

- No hay un sistema central donde queden los reclamos, las consultas y las gestiones. `[3.2.D1]`
- Los casos se manejan en celulares personales, correos individuales o la libreta de cada sucursal. `[3.2.D2]`

**Inicial.**

- Hay un sistema de casos, pero lo que entra por la sucursal, el teléfono o la app se reparte a mano, o el equipo atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.**

**Eficiente.** Los plazos se vigilan solos y los casos que están por vencer suben solos, el cliente sigue sus casos y hace sus gestiones más comunes en la app, y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer —un reclamo cerca del plazo del regulador, por ejemplo— suben solos a quien los tiene que resolver; el cliente ve y abre sus casos y hace sus gestiones más comunes en la app, sin esperar a que lo atienda una persona, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- El cliente hace solo, en la app o la banca en línea, las gestiones más comunes —descargar su estado de cuenta, pedir una constancia—, sin ir a la sucursal ni llamar. `[3.2.E201 · comprobable]`

**Óptimo.** Un agente de IA resuelve casos y le pasa a una persona lo que no puede, y lo que la entidad calcula de cada cliente —como qué tan probable es que se vaya— aparece en su ficha.

*Resultado:* Buena parte de los casos se resuelve sin que intervenga una persona, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la entidad sabe de ese cliente a la vista.

- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, qué tan probable es que el cliente se vaya. `[3.2.O4]`

*Se leen igual:* `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.F8`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O1`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué reclamos, consultas y gestiones te llegan, cuántos y de qué clientes?

*Descripción:* Mide si los datos de cada cliente —sus productos y sus casos— están completos y ordenados para atender, decidir y responderle al regulador sin reconstruirlos.

*Costo de quedarse:* Cada vez que el cliente llama tiene que volver a explicar qué producto tiene y qué pasó, y no puedes demostrarle al regulador cuántos reclamos respondiste dentro del plazo.

**Deficiente.**

- La información de los clientes y sus casos está repartida entre correos, chats, hojas, el core bancario y otros sistemas que no se conectan, y no hay un lugar donde se vea junta. `[3.3.D1]`
- No se puede reconstruir qué le pasó a un cliente con su tarjeta, su cuenta o su crédito: su historia no queda registrada en ningún lado. `[3.3.D2]`

**Inicial.**

- Los casos están en un solo sistema, pero la ficha del cliente sale incompleta: los productos que tiene contratados hay que buscarlos en el core bancario. `[3.3.I1]`
- Los números de reclamos, consultas y gestiones —cuántos llegan y de qué tipo— se arman a mano, fuera del sistema. `[3.3.I2]`

**Funcional.** La historia y los productos de cada cliente están a la vista, cada caso tiene su tipo y su motivo, y se sabe cuántos reclamos se respondieron dentro del plazo del regulador.

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cuántos reclamos se respondieron dentro del plazo que fija el regulador; quien atiende tiene la historia del cliente en segundos.

- La ficha del cliente muestra los productos que tiene contratados y su valor para la entidad, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo —reclamo, consulta o gestión— y su motivo, elegidos de una lista definida. `[3.3.F4]`
- Se sabe, con un reporte que sale del sistema, cuántos reclamos se respondieron dentro del plazo que fija el regulador y cuáles se vencieron. `[3.3.F201 · comprobable · requiere 3.1.F201]`

**Eficiente.** Se miden tiempos y satisfacción, y la información del cliente se une con la del área comercial.

*Resultado:* La entidad sabe qué tan rápido y qué tan bien atiende y cuánto tarda un cliente nuevo en usar lo que contrató, con la satisfacción medida y no supuesta; donde el cliente sigue con la entidad, sabe además qué tan sano está cada uno.

- Se mide cuánto tarda cada cliente nuevo en usar lo que contrató: el tiempo desde la apertura hasta su primer uso, como la primera compra con su tarjeta o el primer depósito en su cuenta. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente —distinto de su riesgo de crédito—, que combina sus casos abiertos, su satisfacción y, si tiene productos de uso continuo como una tarjeta o una cuenta, cómo los usa. `[3.3.E5]`

**Óptimo.** Los datos se mantienen al día solos y, donde el cliente sigue con la entidad, un modelo de salud anticipa quién se puede ir antes de que lo diga.

*Resultado:* La entidad anticipa lo que va a pasar con sus clientes, con datos que se mantienen al día solos, y, donde el cliente sigue con la entidad, sabe quién se puede ir y quién está logrando lo que buscaba con sus productos antes de que ellos mismos lo digan.

- Un modelo predictivo de salud, distinto del riesgo de crédito, calcula para cada cliente qué tan probable es que se vaya y si está logrando lo que buscaba con sus productos, a partir de su experiencia y de sus resultados; el puntaje se ve en su ficha y el responsable de cada cliente revisa a los que el modelo marca. `[3.3.O1]`
- Servicio se apoya en el almacén central de datos de la entidad, con reglas claras de quién accede y cómo se mantiene, para anticipar qué clientes se pueden ir. `[3.3.O2]`

*Se leen igual:* `3.3.I3`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E2`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O3`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el equipo va al día con sus casos y dentro de los plazos del regulador?

*Descripción:* Mide si cada persona sabe qué le toca, y si el líder sigue con datos el avance y los plazos de los reclamos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien qué le toca a quién, y la gerencia se entera de un reclamo vencido cuando el cliente ya fue al regulador.

**Deficiente.**

- Nadie tiene claro qué le toca: entre la bienvenida de los clientes nuevos, la atención de los casos y el acompañamiento de los clientes clave, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.**

- Se siguen algunos números de la operación —casos abiertos, reclamos vencidos—, pero sin un tablero ni una cadencia fija. `[3.4.I1]`
- El líder mira los números de vez en cuando, sobre todo cuando algo sale mal, como un reclamo que llega al regulador. `[3.4.I2]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día o si hay reclamos cerca de vencer su plazo.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, reclamos cerca del plazo que fija el regulador, volumen, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por sus plazos, el líder prepara a quien entra y acuerda con el área comercial y con las áreas que resuelven parte de los casos qué recibe y qué devuelve cada una.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, cada cliente nuevo llega del área comercial con lo que busca con su producto, las áreas que resuelven parte de los casos cumplen lo acordado y, donde el cliente vuelve a contratar sin tener un producto vigente, el área comercial se entera cuando uno se puede estar yendo.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —productos, procedimientos de seguridad y reclamos—; no se le entrena de memoria. `[3.4.E2]`
- El acuerdo con las áreas que resuelven parte de los casos —tarjetas, fraude, operaciones— está escrito y se mide: qué reciben, en cuánto tiempo lo resuelven y por qué devuelven un caso. `[3.4.E201 · comprobable]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente —personas, pymes, banca preferente— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`

**Óptimo.**

- El líder ya no reparte reclamos ni apaga incendios: dedica su tiempo a decidir qué se automatiza, qué se mide y qué se mejora. `[3.4.O2]`

*Se leen igual:* `3.4.D2`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E1`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia de Atención

¿En qué se apoya tu equipo para que un reclamo se resuelva igual en cualquier sucursal o canal, lo atienda quien lo atienda?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y da la misma respuesta en cualquier sucursal o canal, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo reclamo se acepta en una sucursal y se rechaza en otra: el cliente lo nota, desconfía y lo cuenta.

**Deficiente.**

- No hay respuestas guardadas: cada agente, en la sucursal o en el centro de contacto, escribe cada respuesta desde cero, a su manera. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas, pero cada agente o cada sucursal tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de cliente están escritos, cada cliente nuevo arranca con una bienvenida definida, el equipo tiene respuestas guardadas para lo frecuente y cada tipo de reclamo tiene escritos sus criterios de resolución.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, el cliente nuevo arranca con una bienvenida clara hasta activar y usar su producto, y en cualquier sucursal o canal quien atiende tiene a mano las mismas respuestas y los mismos criterios para resolver un reclamo.

- Existe un proceso documentado de bienvenida del cliente nuevo, con un resultado definido que debe alcanzar al terminarlo: por ejemplo, que active su tarjeta y la use por primera vez. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende el área —por ejemplo, personas, pymes y banca preferente—, qué necesita cada uno, qué espera del servicio y cuáles se consideran clientes clave, consultable por cualquier agente. `[3.5.F4]`
- Cada tipo de reclamo tiene escritos sus criterios de resolución —cuándo se devuelve un cobro, cuándo procede un cargo no reconocido—, consultables por quien atiende, en la sucursal o en el centro de contacto. `[3.5.F201 · declarado]`

**Eficiente.**

- El tono y la voz de marca se aplican a las respuestas, en la sucursal y en cada canal, no cada agente con su estilo. `[3.5.E2]`
- Existe una guía de estilo de servicio documentada para quienes atienden, en la sucursal o en el centro de contacto. `[3.5.E3]`

**Óptimo.**

- Lo que la IA responde o escribe sola —en la app, el chat o WhatsApp— sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F1`, `3.5.F3`, `3.5.F5`.

#### 3.6 Priorización de Clientes

¿Cómo se decide qué se atiende primero: un fraude, el caso de un cliente preferente o una consulta simple?

*Descripción:* Mide si un fraude se atiende antes que una consulta, y si cada cliente recibe la atención que le corresponde.

*Costo de quedarse:* Tu cliente preferente espera en la misma fila que todos, y un cargo no reconocido se atiende después de una consulta simple.

**Deficiente.**

- Los casos se atienden por orden de llegada o como prefiere cada agente, sin mirar su gravedad —un fraude, un cargo no reconocido— ni quién es el cliente. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente, como un fraude, pero los casos no tienen una prioridad asignada: cada agente decide a ojo, o se adelanta el cliente que más insiste. `[3.6.I1]`

**Funcional.**

*Resultado:* Un fraude o un cargo no reconocido se atiende primero, cada tipo de cliente recibe la atención que le corresponde, y quien atiende no tiene que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja; un fraude o un cargo no reconocido, por ejemplo, es urgente— y los agentes la respetan. `[3.6.F1]`
- El agente usa la ficha del cliente —sus productos y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.**

*Resultado:* La atención cambia según el momento en que está cada cliente y, donde el cliente sigue con la entidad, cada cliente de banca preferente y cada pyme importante tiene un responsable que lo conoce, y el resto de la cartera no queda sola.

**Óptimo.**

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló al contratar.

- En la app o la banca en línea, cada cliente ve lo que corresponde a su tipo, a sus productos y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le ofreció al contratar y el segmento del que viene—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F4`, `3.6.F5`, `3.6.E1`, `3.6.E4`, `3.6.E5`, `3.6.O2`.

#### 3.7 Proactividad

¿Cómo te enteras de que un cliente tiene un problema con su tarjeta, su cuenta o su crédito?

*Descripción:* Mide si el servicio avisa antes de cada cobro o vencimiento y actúa antes de que el cliente se vaya.

*Costo de quedarse:* Te enteras de que un cliente está mal cuando el problema ya creció o cuando ya se llevó su dinero a otra entidad, y un cobro sin aviso te trae un reclamo.

**Deficiente.**

- Aunque un cliente acumule casos repetidos —un cargo que vuelve a aparecer— o un reclamo sin resolver, nadie lo contacta: los problemas se atienden cuando estallan. `[3.7.D1]`
- El área nunca contacta al cliente por iniciativa propia: solo responde cuando él llama o va a la sucursal. `[3.7.D2]`

**Inicial.**

- Cuando un cliente tiene problemas repetidos —con su tarjeta, su cuenta o su crédito—, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Los problemas repetidos y los reclamos se detectan, aunque sea a mano, y los clientes clave reciben contacto antes de sus vencimientos; donde la relación es continua, el cliente recibe aviso antes de cada cobro, ayuda si no activó su producto y una razón para quedarse si pide cancelar.

*Resultado:* Los problemas que se repiten, los reclamos y los vencimientos de los clientes clave ya no toman al equipo por sorpresa: se actúa antes de que el problema crezca y, donde la relación es continua, el cliente sabe antes cuánto y cuándo se le va a cobrar, quien no activó su producto recibe ayuda, quien pide cancelar recibe una razón para quedarse y, cuando alguno se va, se sabe por qué.

- Un cliente con casos repetidos por el mismo problema —un cargo que vuelve a aparecer, una tarjeta que no pasa—, un reclamo sin resolver o, si se piden calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los clientes clave reciben contacto antes de sus fechas críticas —el vencimiento de un certificado a plazo, el de una línea de crédito o, si tienen tarjeta, su renovación—, no después. `[3.7.F2]`
- Cada cliente que se va de la entidad —cierra sus cuentas o cancela sus productos— deja registrada la razón de su salida. `[3.7.F3]`
- Quien contrató una tarjeta o una cuenta y no llega al resultado que define la bienvenida —activarla y usarla por primera vez— recibe un contacto para ayudarlo a empezar. `[3.7.F201 · comprobable · hábito · relación continua · requiere 3.5.F2]`
- Quien pide cancelar una tarjeta o una cuenta recibe, antes de que se la cierren, una razón para quedarse —una mejor condición, un beneficio—, no solo el trámite del cierre. `[3.7.F202 · comprobable · hábito · relación continua]`
- Antes de cada cobro programado o fecha de pago —la cuota de un crédito, el pago de la tarjeta, una comisión anual—, el cliente recibe un aviso automático con el monto y la fecha. `[3.7.F203 · comprobable · relación continua]`

**Eficiente.** Ningún caso se pierde aunque lo resuelva otra área, y el cliente recibe lo que necesita saber antes de pedirlo; donde la relación es continua, también se ve venir al cliente que se puede ir.

*Resultado:* Los casos del cliente no se pierden entre áreas, el cliente sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la entidad retiene clientes que antes se iban sin aviso, ve quién está listo para un producto más y sus clientes clave ven qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de que un cliente se puede ir o de que está listo para un producto más. `[3.7.E1]`
- Los clientes clave revisan con la entidad, al menos cada trimestre, lo que buscan con sus productos: qué se logró y qué sigue. `[3.7.E3]`
- Los clientes que dan señales de irse —dejan de usar su tarjeta, bajan su saldo, reclaman más— reciben una acción de retención antes de decidir irse. `[3.7.E201 · comprobable · hábito · relación continua]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los demás momentos clave de su relación —el vencimiento de un certificado, la renovación de su tarjeta, un cambio en las condiciones de su producto—; sale sola, disparada por el evento y en el canal que el cliente prefiere, no cuando alguien se acuerda. `[3.7.E8]`

**Óptimo.**

*Resultado:* La mayoría de los problemas que detecta el sistema se resuelven antes de que el cliente los note, y cada cliente siente que la entidad se adelanta a lo que necesita y lo sorprende para bien.

*Se leen igual:* `3.7.F4`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.O2`, `3.7.O3`, `3.7.O5`, `3.7.O6`.

#### 3.8 Autoservicio

¿Qué pasa con las preguntas que tus clientes hacen una y otra vez, como cuánto cuesta una gestión o qué hacer si pierden su tarjeta?

*Descripción:* Mide si el equipo puede atender a más clientes sin crecer al mismo ritmo, gracias a las respuestas publicadas, al bloqueo de la tarjeta sin esperar y a lo que se aprende de los casos.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas una y otra vez, y quien perdió su tarjeta tiene que esperar en la línea para bloquearla.

**Deficiente.**

- No hay ninguna respuesta publicada —en el sitio o en la app— que el cliente pueda consultar por su cuenta. `[3.8.D1]`
- Hasta las preguntas que más se repiten, como qué hacer si se pierde la tarjeta, se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.** Hay algunas respuestas publicadas o un chatbot de menú, pero lo que más preguntan los clientes todavía no tiene respuesta publicada, y para bloquear una tarjeta hay que esperar a una persona.

- Para bloquear una tarjeta, el cliente tiene que llamar y esperar a que lo atienda una persona. `[3.8.I201 · comprobable]`

**Funcional.** Las preguntas más frecuentes de los clientes tienen respuesta publicada y, si la entidad emite tarjetas, el cliente bloquea la suya sin esperar a nadie.

*Resultado:* El cliente puede consultar por su cuenta la respuesta a las preguntas de siempre y, si tiene tarjeta, bloquearla al instante, a cualquier hora; quien atiende remite a la respuesta publicada en vez de volver a escribirla.

- Las diez preguntas que más se repitieron en el último trimestre —o todas, si son menos— tienen una respuesta publicada que el cliente puede leer por su cuenta: por ejemplo, cómo activar una tarjeta, cuánto cuesta una gestión o qué hacer si la pierde. `[3.8.F1]`
- Si la entidad emite tarjetas, el cliente puede bloquear la suya al instante y a cualquier hora —en la app o por teléfono—, sin esperar a que lo atienda una persona. `[3.8.F202 · comprobable]`

**Eficiente.**

*Resultado:* La entidad puede sumar clientes sin sumar personas en la misma proporción, porque buena parte de lo que preguntan se resuelve sin abrir un caso.

**Óptimo.**

- La IA detecta las preguntas nuevas que llegan —por ejemplo, sobre un producto o una comisión nueva— y redacta el artículo o la respuesta; el equipo lo revisa antes de publicarlo, y en la base de conocimiento se ve qué escribió la IA y quién lo aprobó. `[3.8.O1]`
- Los picos de demanda —un cierre de mes, una caída de la app— los absorben la IA y el autoservicio: el equipo no crece cuando crece la cartera, y el líder ve en los tableros del área qué parte de la demanda resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`

*Se leen igual:* `3.8.I1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O3`, `3.8.O4`.

## Edición — Educación

Para el área de admisiones de una universidad, un instituto o un centro de formación: parte de los aspirantes se matricula con el acompañamiento de un asesor y parte lo hace sola en línea, y después de la matrícula la relación sigue período tras período.

*Clave:* educacion

*Perfil habitual:* mixta · relación continua.

*Criterios propios:* desde el 301.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Material de venta | Material de admisión: plan de estudios, testimonios y simulador de costos |
| Negocio | El proceso de admisión de un aspirante |
| Lead | Aspirante o interesado en un programa |
| Prospecto | Aspirante o interesado en un programa |
| Pipeline | El recorrido de la admisión: interés, solicitud, admisión y matrícula |
| Revisión del pipeline | Reunión de seguimiento de admisiones |
| Venta sin vendedor | Matrícula que el aspirante hace solo, en línea o por autoservicio |
| Vendedor | Asesor de admisiones |
| Propuesta | La oferta de admisión: programa, costo, beca y financiamiento |
| Razón de pérdida | Por qué el aspirante no se matriculó |
| Cliente ideal | El perfil de estudiante al que va dirigido cada programa |
| Pronóstico | Proyección de matrícula |
| MQL | Interesado que Marketing considera listo para pasar a Admisiones, según los criterios que Marketing definió; todavía no es un aspirante calificado: eso lo decide Admisiones |
| Buyer persona | Retrato escrito de un tipo de aspirante, o de la familia que decide o paga con él: quién es, qué le preocupa y cómo decide |
| Caso | Caso de un estudiante: una consulta, un trámite o un reclamo |

### Área 1 — Admisiones

Mide el rendimiento del área de admisiones: cómo está montada por dentro y qué produce en solicitudes, admitidos y matrículas. Vale igual si la admisión la trabaja un equipo de asesores o una sola persona, o si el aspirante se matricula solo, en línea o por autoservicio.

**Deficiente.** Tu matrícula depende de la temporada y de quién atienda. Cada asesor lleva a sus aspirantes en su propia lista, la información de los programas se explica de memoria y nadie sabe cuántos interesados se quedaron sin respuesta.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados se registran, pero el seguimiento depende de cada asesor, los costos y las becas se explican distinto según quién atienda y los números de cada período se arman a mano.

**Funcional.** Tu área de admisiones opera como una maquinaria base. Cada interesado entra al mismo recorrido, la información de cada programa —plan de estudios, costos, becas y fechas— se dice igual en todos los canales, y ningún aspirante se queda esperando sin que alguien reaccione.

**Eficiente.** La matrícula deja de depender del empuje de la última semana. Mides en qué paso se cae cada aspirante y cuántos admitidos no se matriculan, un puntaje te dice a qué aspirante contactar primero y proyectas la matrícula del período con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA responden y orientan ahí a toda hora; la IA dice qué aspirante necesita qué y detecta a quien está por abandonar el proceso antes de que cierre la matrícula. El asesor dedica su tiempo a las conversaciones que deciden la matrícula, no a la administración.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus asesores a cada aspirante, desde el primer contacto hasta la matrícula?

*Descripción:* Mide si la admisión sigue un proceso escrito, con etapas, fechas y cadencias que no dependen de cada asesor.

*Costo de quedarse:* Si se va un asesor en plena temporada, se lleva a sus aspirantes con él: nadie sabe a quién le faltaba un documento, quién ya estaba admitido ni quién esperaba una llamada.

**Deficiente.** Sin proceso: cada asesor atiende a su manera y lo que sabe de cada aspirante vive en su cabeza o en su libreta.

- No hay nada escrito sobre el proceso de admisión ni sus etapas: cada asesor usa su criterio. `[1.1.D1]`
- Los interesados se reparten a ojo, o se los queda quien los ve primero: no hay una regla que diga a quién le toca cada uno. `[1.1.D2]`
- No hay una reunión para revisar a los aspirantes en proceso: se habla de ellos solo cuando algo se complica. `[1.1.D3]`
- Si se van dos personas clave, nadie sabe en qué quedó cada aspirante. `[1.1.D4]`

**Inicial.** Hay etapas y algo de estructura, pero cada asesor las aplica a su manera y la revisión de los aspirantes no tiene fecha fija.

- Hay etapas de palabra o en un borrador, pero cada asesor las interpreta distinto. `[1.1.I1]`
- Hay una cadencia de contacto sugerida, pero cada asesor la cumple cuando puede o cuando se acuerda. `[1.1.I2]`
- La reunión de seguimiento de admisiones se hace cuando hay tiempo, sin una fecha fija ni un orden para repasar a los aspirantes. `[1.1.I3]`
- Que un aspirante quede bien registrado depende de la voluntad de cada asesor, no de una rutina del equipo. `[1.1.I4]`

**Funcional.** Todo el equipo sigue el mismo proceso de admisión escrito en el CRM, con etapas, una cadencia de contacto, una revisión fija de los aspirantes y el calendario de cada período.

*Resultado:* Si rota un asesor, el siguiente sabe en qué va cada aspirante, porque todo el equipo trabaja la admisión igual en el CRM: los aspirantes avanzan con los mismos criterios, cada interesado recibe seguimiento con la cadencia acordada, los aspirantes se revisan en cada reunión de seguimiento de admisiones y cada período arranca con sus fechas definidas.

- Cualquier asesor explica igual las etapas de la admisión —interés, solicitud, admisión y matrícula— y qué tiene que cumplir un aspirante para avanzar. `[1.1.F1]`
- Cada proceso de admisión —por ejemplo, el de pregrado, el de posgrado o el de educación continua— tiene su propio recorrido en el CRM, con lo que el aspirante tiene que cumplir para pasar de cada etapa a la siguiente, la admisión incluida. `[1.1.F2]`
- La reunión de seguimiento de admisiones se hace en una fecha fija, cada semana o cada quince días. `[1.1.F5]`
- Cualquier asesor trabaja en el CRM, no en hojas ni notas aparte: lo abre para ver qué le toca hacer, no solo para cargar lo que ya hizo. `[1.1.F6]`
- Cada período de matrícula tiene su calendario escrito antes de empezar —apertura, fechas límite y cierre—, y el equipo trabaja con él. `[1.1.F301 · declarado · hábito]`

**Eficiente.** El líder comprueba con datos que el proceso de admisión se cumple y, donde hay asesores de admisiones, todos siguen un método de asesoría y guías escritas.

*Resultado:* El líder sabe dónde se desvía el proceso de admisión y lo corrige con datos, no de memoria; donde hay asesores de admisiones, además, todos asesoran con un mismo método.

- Hay una metodología de asesoría formal en uso —una conocida, como SPIN o BANT, o una equivalente escrita por la institución— con la que el asesor indaga qué busca el aspirante y qué lo frena antes de recomendarle un programa. `[1.1.E1]`

**Óptimo.**

*Resultado:* Nadie tiene que vigilar a mano que el proceso se cumpla: la IA señala a los aspirantes cuya admisión se desvía, el líder decide qué se corrige y el equipo dedica su tiempo a probar mejoras en pilotos cortos.

- La mayoría de las admisiones siguen el proceso como está escrito sin que nadie lo revise a mano, y el CRM lo muestra. `[1.1.O2]`

*Se leen igual:* `1.1.F4`, `1.1.F7`, `1.1.F8`, `1.1.E2`, `1.1.E3`, `1.1.E5`, `1.1.E6`, `1.1.O3`, `1.1.O4`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando llega un interesado o un aspirante hace su solicitud o su matrícula en línea?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir a los interesados, avisar qué toca, registrar las solicitudes, las matrículas en línea y las conversaciones— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tu equipo pierde horas en tareas que el sistema podría hacer: los interesados se enfrían mientras alguien decide a quién le tocan y, donde el aspirante hace su solicitud o su matrícula en línea, cada una hay que pasarla a mano.

**Deficiente.** No hay un CRM: los interesados y las matrículas se anotan donde cada quien puede.

- Los interesados viven en listas o agendas personales. `[1.2.D1]`
- No hay un CRM donde montar una automatización: los interesados y las matrículas se pasan por correo, por chat o de palabra, y nadie recibe avisos del sistema. `[1.2.D2]`

**Inicial.**

- Hay un CRM, pero nada pasa solo: los interesados se reparten a mano y cada asesor tiene que acordarse de sus seguimientos. `[1.2.I1]`
- Las matrículas que el aspirante hace solo —en línea o por autoservicio— se pasan a mano al sistema, cuando alguien tiene tiempo. `[1.2.I2]`

**Funcional.** Lo básico pasa solo —los interesados se reparten por una regla, el sistema avisa qué toca y lo que el aspirante hace en línea entra solo— y, si se usa IA, trabaja con los datos de cada aspirante.

*Resultado:* Ningún interesado se pierde por no saber a quién le toca, el asesor deja de depender de su memoria para dar seguimiento y el aspirante sabe en qué va su proceso sin tener que preguntar; donde el aspirante se matricula solo en línea, cada matrícula entra sola al sistema y la solicitud que deja a medias se guarda con sus datos de contacto.

- Los interesados que entran llegan a una bandeja o cola y se asignan por una regla simple (por turnos, por programa o por sede). `[1.2.F2]`
- Cuando hay algo que hacer —por ejemplo, un interesado nuevo asignado, una tarea que vence o un aspirante que respondió—, el sistema le avisa al asesor sin que el líder se lo recuerde. `[1.2.F3]`
- Si el equipo atiende a los aspirantes por WhatsApp u otro canal conversacional, lo que cada asesor habla por ahí queda en el sistema, aunque responda desde su teléfono. `[1.2.F4]`
- Las matrículas que el estudiante hace solo —en línea o por autoservicio— entran solas al sistema como admisiones, con su programa, su monto, su canal, su fecha y su estudiante. `[1.2.F6]`
- Si el equipo usa IA, esta tiene como contexto lo básico de cada aspirante y estudiante: quién es, qué programa le interesa y en qué etapa está. `[1.2.F7]`
- Si los cupos de un programa son limitados, el asesor puede ver cuántos quedan antes de ofrecerlo, en el CRM o en el sistema donde se llevan los cupos, sin preguntarle a otra persona. `[1.2.F8]`
- Al aspirante le llegan de forma automática la confirmación de su solicitud y un aviso en cada paso: qué documento le falta, si fue admitido y cómo matricularse. `[1.2.F301 · comprobable]`
- La solicitud que el aspirante deja a medias en línea queda guardada en el sistema, con sus datos de contacto. `[1.2.F302 · comprobable · venta sin vendedor]`

**Eficiente.** Las secuencias se adaptan a cómo responde cada aspirante, el CRM trabaja conectado con los sistemas académico y de pagos que use la institución, el aspirante hace sus trámites en línea sin ir a la sede y el equipo usa la IA en su trabajo diario.

*Resultado:* El asesor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los aspirantes.

- El detalle de costos, beca y financiamiento de cada aspirante se genera desde el sistema, no en hojas sueltas. `[1.2.E1]`
- Si la institución lleva lo académico o los pagos en sistemas aparte del CRM, el CRM está conectado con ellos. `[1.2.E3]`
- El equipo usa la IA en su trabajo diario —para redactar, resumir conversaciones o preparar una reunión—, y la IA trabaja con el contexto de los aspirantes y los estudiantes. `[1.2.E5]`
- El aspirante entrega sus documentos y firma su matrícula de forma digital, sin tener que ir a la sede. `[1.2.E301 · comprobable]`

**Óptimo.** La IA orienta, precalifica, agenda y calcula quién se va a matricular; el asesor valida y se queda con las conversaciones que deciden la matrícula.

*Resultado:* El asesor dedica su tiempo a las conversaciones que deciden la matrícula: los agentes de IA orientan y agendan, y él trabaja con la predicción de quién se va a matricular y con respuestas sugeridas para cada conversación.

- Si el equipo atiende por un canal conversacional, agentes de IA orientan ahí a los interesados, los precalifican con la definición de aspirante calificado y agendan citas a cualquier hora; le pasan al asesor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que precalificaron. `[1.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al CRM: el asesor ve en la ficha, por ejemplo, cuánto suelen permanecer los estudiantes con el perfil de ese aspirante, sin salir de su herramienta. `[1.2.O3]`

*Se leen igual:* `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus admisiones antes de usarlo para decidir?

*Descripción:* Mide si los datos de admisiones son confiables para decidir: registros de aspirantes completos, de dónde llegó cada uno y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de admisiones se arma a mano, cambia según quién lo arma y nadie sabe cuántos aspirantes hay de verdad en proceso ni de dónde llegó cada uno.

**Deficiente.**

- No hay una regla de qué datos se registran ni de quién los corrige: cada asesor llena lo que le parece y nadie revisa lo que falta. `[1.3.D1]`
- No se registra por qué canal llegó cada aspirante ni quién lo lleva: sacar un reporte confiable es imposible. `[1.3.D2]`
- No hay un registro de quiénes son los aspirantes: cada vez que se necesita la lista, hay que armarla a mano con hojas de cálculo y lo que guarda cada sistema. `[1.3.D3]`
- Las matrículas no quedan registradas con su programa, su monto y su fecha: no se sabe cuántos se matricularon en cada programa ni cuándo. `[1.3.D4]`

**Inicial.** Hay datos en el sistema, pero incompletos: el reporte de admisiones hay que corregirlo a mano antes de usarlo.

- En los aspirantes que entran hoy, el canal por el que llegó cada uno se anota a mano, cuando alguien se acuerda, y en parte de ellos queda vacío. `[1.3.I2]`
- Los aspirantes que entran hoy se registran, pero a algunos les falta el programa, el período de ingreso, el monto estimado o la persona del equipo a cargo. `[1.3.I3]`

**Funcional.** El reporte de admisiones sale del sistema, sin armarlo a mano, y se le puede creer.

*Resultado:* El líder ve cuántos aspirantes hay en cada etapa y en cada programa cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada uno.

- Todo aspirante registrado desde la puesta en marcha del recorrido de admisión actual tiene programa, período de ingreso, monto estimado y una persona del equipo a cargo. `[1.3.F1]`
- Todo aspirante registrado desde la puesta en marcha del recorrido de admisión actual dice por qué canal llegó: feria, colegio, campaña, web o referido. `[1.3.F3]`
- El reporte de admisiones en curso se genera del sistema sin reconstruir números, y refleja el estado actual, no una proyección. `[1.3.F4]`
- Si el aspirante es menor de edad, queda registrado el permiso de su responsable para que lo contacten. `[1.3.F301 · comprobable]`

**Eficiente.** Aparece una proyección confiable de la matrícula de cada programa, y la ficha del aspirante empieza a reunir lo que viene de los sistemas académico y de pagos que use la institución.

*Resultado:* La institución puede comprometer una matrícula por programa con confianza, y planear cupos, docentes y aulas con ese número.

- Hay una proyección de matrícula por programa que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses la matrícula real quedó dentro de ±10% de lo proyectado. `[1.3.E1]`
- La ficha de cada aspirante reúne lo de admisiones con su historial de conversaciones y, si la institución usa otros sistemas —lo académico, los pagos, la beca—, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3]`

**Óptimo.** Un modelo de IA calcula la proyección de matrícula y la vista 360° de cada aspirante se mantiene al día sin trabajo manual.

*Resultado:* La proyección de matrícula se anticipa a lo que va a pasar, cruzando lo de admisiones con lo académico y lo financiero, y los datos están al día sin que nadie tenga que acordarse de actualizarlos.

- Cada interesado, contacto y proceso de admisión se asocia solo, al entrar, con lo que ya había de esa persona o empresa; la IA resuelve los dudosos y una persona valida solo las excepciones que el CRM le marca. `[1.3.O1]`
- Un modelo de IA calcula la proyección de matrícula con la historia de las admisiones; se ve en el sistema y el líder la revisa antes de comprometerla. `[1.3.O2]`
- La vista 360° está operativa: la ficha de cada aspirante reúne lo de admisiones, los pagos, los casos de servicio y las conversaciones. `[1.3.O3]`
- Admisiones se apoya en el almacén central de datos de la institución para su proyección, cruzando lo de admisiones con lo académico y lo financiero. `[1.3.O4]`

*No aplican:* `1.3.F8`, `1.3.E4`.

*Se leen igual:* `1.3.I1`, `1.3.F2`, `1.3.F9`, `1.3.F10`, `1.3.E5`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder de admisiones, cada semana, qué programa y qué asesor van bien y cuáles necesitan ayuda?

*Descripción:* Mide si cada asesor tiene un rol por escrito, si cada programa y cada asesor tienen una meta escrita, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* La dirección se entera de que un programa no abre cuando ya cerró la matrícula: no vio antes qué programa iba atrasado, ni por qué.

**Deficiente.**

- Cada asesor trabaja sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1]`

**Inicial.**

- El líder de admisiones revisa algunos números —interesados, solicitudes, matriculados— en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`
- Los reportes de cómo opera el equipo de admisiones —qué asesor y qué programa van al día— se arman a mano. `[1.4.I2]`

**Funcional.** Cada asesor tiene un rol por escrito, cada programa y cada asesor tienen una meta escrita, el líder sigue un tablero cada semana y en la reunión de seguimiento de admisiones cada quien rinde cuentas.

*Resultado:* Cada asesor sabe qué se espera de él, y el líder sabe cada semana qué programa va bien y cuál necesita ayuda, antes de que cierre la matrícula.

- El líder tiene un tablero con 4 a 6 métricas clave —interesados, solicitudes, admitidos, matriculados, avance contra la meta de cada programa— y lo consulta al menos una vez por semana. `[1.4.F2]`
- En la reunión de seguimiento de admisiones se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda plazos con las áreas académica y financiera y, si Marketing pasa interesados, las reglas del traspaso.

*Resultado:* Un asesor nuevo produce más rápido, las respuestas de lo académico y de lo financiero llegan en el plazo acordado, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —programas, costos, becas y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- Si Marketing le pasa interesados a Admisiones, el SLA de traspaso está escrito y se sigue en el sistema: en cuánto tiempo se responde, qué calidad se espera del interesado y por qué se puede rechazar. `[1.4.E3]`
- Lo que el equipo señala que no funciona —del proceso, del CRM o del material de admisión— se anota, se revisa y se le responde a quien lo dijo. `[1.4.E4]`
- El acuerdo con las áreas académica y financiera está escrito y se mide: en cuánto tiempo se resuelve una admisión, una convalidación o una beca. `[1.4.E301 · comprobable]`
- Las decisiones de la dirección usan números de fondo: cuánto margen deja cada programa y cada canal, cuánto permanece cada cohorte y cuánto aporta cada asesor. `[1.4.E6]`

**Óptimo.** La dirección decide con números de fondo, el líder y el equipo eligen cada trimestre qué probar en admisiones, y está por escrito quién valida lo que hace la IA y qué puede decidir sola.

*Resultado:* La dirección decide dónde invertir con números de fondo: qué programa y qué canal dejan más margen, qué cohorte permanece más y qué asesor aporta más.

- Al menos una vez por trimestre, el líder y el equipo se reúnen a decidir qué probar en admisiones y revisan cómo les fue con lo que probaron antes. `[1.4.O2]`
- Hay responsables de validar lo que hace la IA en admisiones, y lo que puede decidir sola está por escrito. `[1.4.O3]`

*Se leen igual:* `1.4.D2`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E5`, `1.4.O4`.

#### 1.5 Oferta académica

¿Cómo sabe alguien que entra a tu equipo para quién es cada programa y qué información darle a cada aspirante?

*Descripción:* Mide si el equipo sabe para quién es cada programa, si su información llega igual con cualquier asesor y, si la institución ofrece sus programas por más de un canal, si los costos, las becas y los requisitos son coherentes en todos.

*Costo de quedarse:* Cada asesor explica el programa a su manera y persigue aspirantes distintos: el plan de estudios, el costo y la beca que le explican al aspirante dependen del asesor que le toque.

**Deficiente.** Nadie puede decir para quién es cada programa, y cada asesor explica los costos y las becas de memoria, a su manera.

- Nadie puede decir con claridad para quién es cada programa, y la información que recibe el aspirante cambia según quién lo atienda o por dónde pregunte. `[1.5.D1]`
- No hay un formato para la oferta de admisión: cada asesor arma la suya desde cero, y su calidad depende de quién le toque al aspirante. `[1.5.D2]`

**Inicial.** El perfil de estudiante de cada programa vive en la cabeza del líder, y hay fichas de algunos programas que no todos usan: la información todavía varía entre asesores y entre canales.

- El líder sabe para quién es cada programa y hay un mensaje común, pero solo de palabra o en un borrador: cada asesor los repite a su manera. `[1.5.I1]`
- Hay una plantilla para la oferta de admisión, pero cada asesor la cambia o la usa a su manera. `[1.5.I2]`

**Funcional.** El perfil de estudiante de cada programa está escrito, y la información y la oferta de admisión son las mismas con cualquier asesor y en cualquier canal.

*Resultado:* Dos aspirantes parecidos reciben la misma información del programa —plan de estudios, costos, becas, fechas y requisitos— sin importar qué asesor los atienda ni por qué canal lleguen.

- Existe un documento con el perfil de estudiante de cada programa —a quién va dirigido y qué busca—, consultable por cualquier asesor. `[1.5.F1]`
- El líder puede explicar a quién va dirigido cada programa sin consultar su documentación. `[1.5.F2]`
- Un aspirante que habla con dos asesores recibe el mismo mensaje de valor base. `[1.5.F3]`
- Las ofertas de admisión están estandarizadas: todo aspirante recibe su detalle de costos, beca y financiamiento con la misma estructura, no armado desde cero cada vez. `[1.5.F4]`
- Si la institución ofrece sus programas por más de un canal, los costos, las becas y los requisitos de cada programa son los mismos en todos —en la sede, por teléfono y en línea—, o la diferencia es a propósito y está escrita. `[1.5.F5]`
- Cada programa tiene una ficha vigente para el aspirante —plan de estudios, duración, modalidad, costos, becas, requisitos y fechas— publicada en los canales donde se ofrece. `[1.5.F301 · comprobable]`

**Eficiente.** La oferta se distingue de la de otras instituciones y solo promete lo que el programa entrega.

*Resultado:* Los aspirantes ven qué distingue a la institución: la oferta se diferencia de la de otras instituciones, dice lo mismo en el sitio, en las presentaciones y en boca de cada asesor, y lo que se le prometió al aspirante es lo que encuentra cuando empieza a estudiar.

- Las ofertas solo prometen lo que el programa entrega: lo que se dice de convalidaciones, horarios, modalidad y salida laboral se valida antes de decirlo. `[1.5.E3]`
- Se les pregunta a los estudiantes nuevos si lo que encontraron es lo que se les ofreció, y lo que no coincide se corrige en la ficha o en lo que dice el asesor. `[1.5.E301 · comprobable · hábito]`

**Óptimo.** La IA revisa contra la información vigente de cada programa todo lo que se le dice a cada aspirante, y el equipo valida lo que se sale.

- La IA revisa en tiempo real, contra la propuesta de valor y la información vigente de cada programa, lo que se les dice a los aspirantes, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.I3`, `1.5.F6`, `1.5.E2`, `1.5.E4`.

#### 1.6 Priorización de aspirantes

¿Cómo decide tu equipo a qué aspirantes dedicarles tiempo primero?

*Descripción:* Mide si el equipo decide a qué aspirantes dedicar su tiempo con criterios escritos, según el perfil de cada programa.

*Costo de quedarse:* Tus asesores le dedican el mismo esfuerzo a quien solo pidió un folleto que a quien ya entregó sus documentos, y los aspirantes listos para matricularse esperan su turno.

**Deficiente.** Se atiende a los interesados por orden de llegada, sin distinguir quién quiere ingresar este período.

- No hay criterios para distinguir a un aspirante con posibilidades de uno sin ellas: se pierde tiempo en interesados que nunca se van a matricular. `[1.6.D1]`
- Se atiende igual a quien pidió información hace un año que a quien quiere ingresar este período. `[1.6.D301 · evaluado]`

**Inicial.** Cada asesor elige a ojo a qué aspirantes dedicarse, según su experiencia o una lista que nadie actualiza.

- Los aspirantes se separan en alguna lista o con una etiqueta, pero cada asesor lo hace con su propio criterio. `[1.6.I1]`
- El líder sabe para quién es cada programa, pero el CRM no tiene los campos para separar a los aspirantes que encajan. `[1.6.I2]`

**Funcional.** Los aspirantes se separan por los rasgos del perfil de estudiante de cada programa y hay una definición escrita de aspirante calificado que el equipo aplica.

*Resultado:* El equipo deja de perseguir a quien no encaja con el perfil de estudiante del programa que le interesa y concentra el esfuerzo en los aspirantes que sí encajan y cumplen la definición de aspirante calificado: cumplen los requisitos y quieren ingresar este período.

- El equipo segmenta a los aspirantes por los atributos del perfil de estudiante antes de trabajarlos: programa de interés, nivel de estudios, zona, edad o situación laboral. `[1.6.F1]`
- Los rasgos del perfil de estudiante de cada programa son campos del CRM y de los formularios de interés y de solicitud. `[1.6.F4]`

**Eficiente.** Los aspirantes se ordenan con un puntaje que suma varios rasgos; los colegios, las empresas o los segmentos prioritarios están en una lista escrita, y cada segmento recibe su propio mensaje.

*Resultado:* Cada asesor sabe cada mañana a quién contactar primero, y los colegios, las empresas y los segmentos que más matrícula traen se trabajan de forma deliberada.

- Los asesores usan mensajes y plantillas distintos para cada segmento de aspirantes, por ejemplo según el programa que les interesa. `[1.6.E3]`

**Óptimo.** La IA decide a qué aspirante atender y qué hacer con él, con todo lo que se sabe de cada uno, y el asesor valida.

*Resultado:* El asesor sabe a qué aspirante atender, qué hacer y cuándo, con lo que saben Servicio y Marketing de cada uno.

- Si en la decisión participan varias personas —el aspirante y su familia o su empresa—, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el asesor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3]`
- La priorización usa señales de Servicio y de Marketing —qué estudiantes siguen con otro programa, recomiendan la institución o dejan sus estudios— para decidir qué perfiles perseguir. `[1.6.O4]`

*Se leen igual:* `1.6.F2`, `1.6.F3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O5`.

#### 1.7 Avance de la admisión

¿Qué pasa en tu equipo cuando un aspirante deja de avanzar, antes o después de ser admitido?

*Descripción:* Mide si alguien detecta cuando un aspirante deja de avanzar y si hay una respuesta acordada para retomarlo a tiempo; donde el estudiante vuelve a matricularse curso por curso, también si se le busca cuando se atrasa su inscripción al siguiente.

*Costo de quedarse:* Los aspirantes se enfrían en silencio: nadie ve quién dejó de contestar ni qué admitido no se matriculó, y el período cierra con cupos vacíos.

**Deficiente.** Los aspirantes se enfrían sin que nadie lo note, y el asesor no tiene apoyo del líder ni material para ayudarlos a decidir.

- El líder no se involucra con los aspirantes que se traban: cada asesor se las arregla solo. `[1.7.D1]`
- Nadie se da cuenta de que un aspirante dejó de avanzar hasta que ya se perdió. `[1.7.D2]`
- Los aspirantes no quedan registrados con su etapa y su última actividad, así que no hay cómo ver cuáles se detuvieron. `[1.7.D3]`
- No hay material de admisión —plan de estudios, testimonios, simulador de costos— para mostrarle al aspirante y apoyar su decisión. `[1.7.D4]`
- Las solicitudes que el aspirante deja a medias en línea no las retoma nadie. `[1.7.D301 · comprobable · venta sin vendedor]`

**Inicial.** Hay seguimiento, pero depende de que cada asesor se acuerde.

- Cuando un aspirante se detiene, cada asesor decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`
- El líder solo interviene cuando el asesor le pide ayuda o cuando el aspirante ya está casi perdido. `[1.7.I2]`
- Cada asesor tiene su propio material de admisión y lo arma a su manera. `[1.7.I3]`
- Todos los intentos de hacer avanzar a un aspirante se hacen por el mismo canal. `[1.7.I4]`

**Funcional.** Ningún aspirante se enfría en silencio: se detecta a tiempo, hay un paso acordado para retomarlo y ningún admitido se queda sin matricular sin que alguien reaccione.

*Resultado:* Los aspirantes que dejan de avanzar se detectan a tiempo y se retoman por más de un canal; donde hay asesores de admisiones, con material de admisión común y con el líder actuando mientras todavía hay cupo y fecha. Quien ya fue admitido recibe acompañamiento hasta que se matricula y, donde el estudiante vuelve a matricularse curso por curso, sin seguir un programa, la inscripción al siguiente curso tampoco se deja al azar.

- Para retomar a los aspirantes detenidos se usan al menos dos canales, por ejemplo correo y llamada. `[1.7.F2]`
- El líder repasa a los aspirantes detenidos en cada reunión de seguimiento de admisiones y acuerda qué hacer con cada uno, sin esperar al cierre de la matrícula. `[1.7.F3]`
- Hay material de admisión estandarizado —plan de estudios, testimonios, simulador de costos— que ayuda al aspirante a decidir su matrícula. `[1.7.F4]`
- Las solicitudes que el aspirante deja a medias en línea reciben un recordatorio o una llamada dentro del plazo acordado. `[1.7.F302 · comprobable · hábito · venta sin vendedor · requiere 1.2.F302]`
- Para cada etapa de la admisión está definido cuánto tiempo sin avance vuelve detenido a un aspirante —sin respuesta, sin documentos, sin pago, admitido sin matricular o con la solicitud a medias en línea—, y los detenidos se reconocen a tiempo. `[1.7.F1]`
- Los aspirantes detenidos tienen un paso acordado para retomarlos, no la improvisación de cada asesor. `[1.7.F6]`

**Eficiente.** El seguimiento combina varios canales, el sistema le avisa al líder de lo que se traba y quien no ingresó este período sigue en nutrición para el siguiente.

*Resultado:* Ningún aspirante espera a la reunión para recibir ayuda, quien no ingresó este período vuelve a recibir la invitación para el siguiente, y se sabe cuántos de los que se enfrían se recuperan.

- El seguimiento de los aspirantes que se enfrían combina al menos tres canales —por ejemplo, correo, llamada y el canal conversacional— en una secuencia definida. `[1.7.E1]`
- Los aspirantes que no ingresan este período no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven al asesor cuando se acerca el siguiente o muestran interés. `[1.7.E2]`
- El material de admisión está en una biblioteca central, no en la computadora de cada asesor. `[1.7.E3]`
- Cuando un aspirante lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántos admitidos no se matriculan y cuántos aspirantes detenidos se recuperan, por programa. `[1.7.E301 · comprobable]`

**Óptimo.** La IA detecta qué aspirantes están por abandonar y decide el canal y el momento de cada seguimiento antes de que cierre la matrícula; el equipo valida.

*Resultado:* Los aspirantes con más posibilidades reciben ayuda justo cuando la necesitan: la IA detecta cuándo alguien deja de avanzar y propone a quién movilizar.

- La IA decide el canal y el momento de cada seguimiento, aspirante por aspirante y según cómo responde, dentro de los límites que fijó el equipo; el equipo revisa los resultados, y lo que decide la IA queda registrado en el CRM. `[1.7.O2]`

*Se leen igual:* `1.7.F7`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O3`.

#### 1.8 Matrículas ganadas y perdidas

¿Qué queda registrado cuando un aspirante no se matricula?

*Descripción:* Mide si queda registrado por qué cada aspirante no se matricula y si el equipo revisa quiénes se matricularon y quiénes no para mejorar el proceso del siguiente período.

*Costo de quedarse:* No sabes por qué pierdes aspirantes: cada asesor tiene su explicación —el costo, el horario, una respuesta que tardó—, y sin un registro no hay cómo ver qué se repite.

**Deficiente.** Cuando un aspirante no se matricula, no se anota la razón: cada asesor da su propia versión, de memoria.

- Cuando un aspirante no se matricula, no hay una razón en la que el equipo coincida: cada asesor da su versión, de memoria. `[1.8.D1]`
- Los procesos de admisión que terminan sin matrícula se cierran sin anotar la razón. `[1.8.D2]`

**Inicial.** De vez en cuando se comenta por qué alguien no se matriculó, y la razón se anota a veces, a criterio de cada asesor.

- La razón por la que un aspirante no se matriculó se anota a veces y en texto libre, a criterio de cada asesor, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada aspirante que no se matricula queda con su razón, elegida de una lista fija, y con la institución que eligió si se fue a otra; también queda por qué no empezó clases quien se matriculó, y el líder saca del sistema el reporte del período.

*Resultado:* El líder sabe por qué no se matriculan los aspirantes —y cuántos eligieron otra institución— y por qué no empiezan clases algunos de los que se matricularon, con datos del período y no con impresiones.

- Todo aspirante registrado desde la puesta en marcha del recorrido de admisión actual cuyo proceso se cerró sin matrícula tiene registrada su razón. `[1.8.F1]`
- Las razones por las que un aspirante no se matricula usan una lista definida, no texto libre. `[1.8.F2]`
- El líder puede sacar del sistema el reporte del período de por qué no se matricularon los aspirantes, sin armarlo a mano. `[1.8.F3]`
- Cuando el aspirante eligió otra institución, queda registrado cuál. `[1.8.F301 · comprobable]`
- Cada matrícula que no llega a clases —quien se matriculó y no empezó— deja registrada su razón. `[1.8.F302 · comprobable]`

**Eficiente.** Cada trimestre se revisa por qué unos aspirantes se matriculan y otros no, lo aprendido cambia el proceso y el equipo se capacita con un calendario fijo.

*Resultado:* Lo que más se repite entre quienes no se matriculan se corrige, y lo que pesó en la decisión de quienes sí se matriculan se vuelve parte del proceso: lo que muestra la revisión de cada trimestre cambia el proceso de admisión y la capacitación del equipo.

- Al menos una vez por trimestre se revisan los aspirantes que se matricularon y los que no, para encontrar lo que se repite. `[1.8.E1]`
- Hay capacitación para el equipo de admisiones con un calendario fijo, no solo cuando entra alguien nuevo. `[1.8.E3]`
- También se registra por qué se matricularon los que sí: qué pesó en su decisión. `[1.8.E301 · comprobable]`

**Óptimo.** La IA analiza las llamadas con los aspirantes, encuentra en qué paso se caen y propone cambios al proceso; el líder decide cuáles se aplican.

*Resultado:* Cada asesor recibe recomendaciones sobre sus propias llamadas, el líder corrige las guías de asesoría con lo que encuentra la IA y la dirección ajusta la estrategia con esa evidencia.

- La IA analiza las llamadas con los aspirantes —también las de video— y le deja a cada asesor recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1]`
- La IA detecta en qué paso y por qué se caen los aspirantes y propone qué cambiar; lo que propone se ve en el CRM y el líder decide qué se aplica. `[1.8.O301 · comprobable]`

*Se leen igual:* `1.8.E2`, `1.8.E4`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing de la institución: cómo está montada por dentro y qué produce en interesados y aspirantes para cada período de admisión. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que la institución dirige.

**Deficiente.** Tu institución no controla su marca: la define lo que se comenta de ella. Cada facultad y cada programa se comunican a su manera, las herramientas están sueltas y sin conectar, y las campañas de admisión corren hasta agotar el presupuesto sin que nadie mida qué dejaron. Los interesados llegan por casualidad.

**Inicial.** Tienes logo, colores y plantillas, pero sin estrategia detrás. Las herramientas se usan a medias y parte de lo que entra se pasa a mano; el contenido sale de forma reactiva, cuando se acerca la matrícula, y los resultados se miden tarde y a mano, sin que lo aprendido quede escrito para el período siguiente. Los interesados llegan de forma irregular y no siempre sabes de dónde vienen.

**Funcional.** El área dejó de depender de héroes. Tienes documentados la marca, los buyer personas y tu presencia digital; las herramientas que pagas se usan de verdad, y la campaña de cada período arranca antes de que abran las solicitudes y sale con regularidad por los canales que elegiste en tu plan, coordinada bajo un mismo calendario. Los números salen del sistema sin armarlos a mano: sabes de dónde viene cada interesado y cuánto te cuesta en cada canal. Ya mides cuántos interesados trae cada campaña, aunque la optimización fina todavía no existe.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la campaña del siguiente período. Los datos de cada interesado se completan solos y se sabe qué aportó cada canal a cada matrícula; los segmentos y el puntaje de los interesados se arman solos; la IA asiste al equipo en su trabajo diario; y cuando alguien busca qué estudiar, tu institución aparece tanto en buscadores como en asistentes de IA. El presupuesto se mueve entre canales según lo que cuesta cada interesado y cada matrícula.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada programa se genera y se ajusta de forma continua; la IA predice qué va a hacer cada interesado, adapta el mensaje a lo que hace y mueve el presupuesto entre canales dentro de los límites que fija el equipo; y los estudiantes y egresados que Servicio vuelve promotores traen aspirantes nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma la campaña de admisión de cada período, desde que se decide hasta que se publica?

*Descripción:* Mide si las campañas de cada período salen de un calendario y un proceso compartidos, sin depender de nadie.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona se va antes de la temporada, la campaña del período sale tarde y los interesados llegan cuando la matrícula ya cerró.

**Deficiente.** Cada quien arma las campañas a su criterio; no hay calendario ni reuniones.

- No existe un calendario de campañas: las de cada período se improvisan cuando se acerca la matrícula. `[2.1.D1]`
- Una agencia arma y publica las campañas, y nadie en la institución decide qué sale ni lo revisa. `[2.1.D3]`

**Inicial.**

- Hay un calendario de campañas, pero se llena cuando se puede y se cumple a medias. `[2.1.I1]`

**Funcional.** La campaña de cada período sale de un calendario y un proceso que el equipo sigue, arranca antes de que abran las solicitudes y no depende de una persona.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la campaña de cada período sale aunque cambie una persona: arranca antes de que abran las solicitudes, el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- Existe un calendario de campañas y contenidos visible para el equipo, con horizonte de al menos un trimestre. `[2.1.F1]`
- La campaña de cada período se planea desde las fechas de admisión: arranca antes de que abran las solicitudes y sigue hasta que cierra la matrícula. `[2.1.F301 · declarado · hábito]`

**Eficiente.**

- El líder revisa con datos del sistema, no de memoria, que el proceso de la campaña de admisión se cumpla. `[2.1.E4]`

**Óptimo.**

- El sistema detecta por sí mismo cuando una campaña de admisión se sale del proceso —un paso que se saltó, una fecha del calendario de admisión que venció— y se lo avisa al líder y al responsable; el líder decide el ajuste, y cada aviso queda en el sistema. `[2.1.O4]`

*Se leen igual:* `2.1.D2`, `2.1.I2`, `2.1.I3`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E5`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando un interesado deja sus datos en tu sitio o en una feria, o te escribe por WhatsApp o el chat?

*Descripción:* Mide si las herramientas que paga la institución se usan, si cada interesado —del sitio, de una feria o de una conversación— llega solo al sistema y cuánto trabajo repetitivo de las campañas hacen las automatizaciones y la IA.

*Costo de quedarse:* Los interesados que dejan sus datos en tu sitio, en una feria o por mensajes esperan días a que alguien los cargue y les conteste, o se pierden, y si pagas herramientas, parte de lo que pagas no se usa.

**Deficiente.**

- No hay un sistema donde registrar a los interesados: se llevan en hojas de cálculo o en el correo. `[2.2.D1]`

**Inicial.**

- Se pagan licencias o módulos que el equipo no usa: por ejemplo, el de eventos, que se compró para las ferias y nunca se configuró. `[2.2.I1]`

**Funcional.** Las herramientas que se pagan se usan, todo interesado —llegue por el sitio, por una feria o, si se usa, por WhatsApp o el chat— entra solo al sistema y recibe respuesta, y si el equipo usa IA, esta conoce la voz de la institución y los buyer personas.

*Resultado:* Todo interesado que llega por el sitio, por una feria o una charla y, si se usa, por WhatsApp o el chat, entra al sistema y recibe respuesta, y la institución no paga por herramientas que nadie usa.

- Si el sitio tiene formularios para dejar datos —los de cada programa o los de las páginas de campaña—, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Si la institución atiende por un canal conversacional —WhatsApp o el chat del sitio—, al menos uno está conectado al sistema con una bandeja básica donde se atiende lo que entra, lo atienda Marketing o Admisiones. `[2.2.F4]`
- Si la institución capta en ferias, charlas en colegios o visitas al campus, quien se registra ahí entra solo al sistema —por un formulario o un código QR—, no en listas que alguien digita después. `[2.2.F301 · comprobable]`

**Eficiente.**

*Resultado:* Los interesados reciben su nutrición sin que nadie la envíe a mano, hasta que están listos para matricularse —o para hablar con un asesor de admisiones, donde los hay—; la conversación con cada uno no depende de que alguien se acuerde de escribirle y, si la institución atiende por WhatsApp o chat, el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nutrición de varios pasos, con tiempos de espera y caminos distintos según quién es o lo que hace cada interesado: por ejemplo, según el programa que le interesa o si se inscribió a una visita. `[2.2.E1]`
- El traspaso de interesados a Admisiones es automático: cuando un interesado cumple los criterios de MQL, le llega con su historial al asesor de admisiones que corresponde, sin que nadie lo pase a mano. `[2.2.E3]`
- Si la institución atiende por más de un canal conversacional, todos llegan a una sola bandeja. `[2.2.E4]`
- Si la institución usa landing pages en sus campañas, se crean en el CMS conectado al sistema central, no en herramientas sueltas. `[2.2.E5]`
- Si la institución atiende por un canal conversacional, hay un tablero en tiempo real de las conversaciones que generan las campañas: cuánto tarda la primera respuesta y cuántas quedan sin respuesta. `[2.2.E7]`

**Óptimo.** La IA decide el recorrido de cada interesado y, si la institución atiende por WhatsApp o chat, conversa con él; el equipo fija los límites y revisa los resultados.

*Resultado:* Cada interesado vive un recorrido pensado para él: la IA decide el siguiente mensaje con lo que la institución sabe de él en todos sus sistemas y, si se atiende por WhatsApp o chat, conversa con él en el momento.

- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada interesado: la segmentación usa, por ejemplo, cuánto permanece cada perfil de estudiante, calculado con lo académico y lo financiero. `[2.2.O3]`

*Se leen igual:* `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F5`, `2.2.F9`, `2.2.F10`, `2.2.F11`, `2.2.E2`, `2.2.E6`, `2.2.E8`, `2.2.O1`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántos interesados entran en cada período, de dónde vienen y cuántos llegan a la solicitud o a la matrícula?

*Descripción:* Mide si los datos de marketing son confiables: de dónde viene cada interesado —la feria, el colegio, la campaña o la web—, en qué etapa de la admisión está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de dónde viene cada interesado ni cuántos terminan matriculándose: cada reporte del período hay que rehacerlo o revisarlo a mano antes de creerle.

**Deficiente.** No se sabe de dónde viene cada interesado, y cada número hay que armarlo desde cero.

- No se registra de dónde llegó cada interesado: nadie sabe si vino por el sitio, una feria o una recomendación. `[2.3.D1]`

**Inicial.**

- No hay una regla de cuándo se limpian los datos: se corrigen a mano cuando alguien nota un problema, y a muchos contactos les faltan los datos que describen el perfil de estudiante de cada programa. `[2.3.I1]`
- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los interesados le falta el origen. `[2.3.I2]`

**Funcional.** Cada interesado tiene su origen y su etapa, y los reportes salen del sistema sin armarlos a mano.

*Resultado:* El líder sabe de dónde viene cada interesado —la feria, el colegio, la campaña o la web—, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, una conversación, una feria, una charla en un colegio o una solicitud en línea— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los duplicados —el mismo interesado que se registra en varias ferias o formularios— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —cuántos interesados entran, de dónde vienen y cuántos llegan a la solicitud o a la matrícula— salen del sistema sin armarlos a mano. `[2.3.F5]`
- Si el interesado es menor de edad, queda registrado el permiso de su responsable para que Marketing lo contacte, también cuando se registró en una feria o en una charla en su colegio. `[2.3.F301 · comprobable]`

**Eficiente.** Los datos se completan solos, los duplicados se unen solos y se sabe qué aportó cada canal a cada matrícula.

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada matrícula, no solo cuál trajo el primer clic.

**Óptimo.**

*Resultado:* La atribución toma en cuenta todo lo que pasa en la institución —admisiones, lo académico y los pagos—, no solo lo que ve Marketing, y los datos se mantienen confiables sin corregirlos a mano: el equipo solo valida las excepciones.

- Marketing se apoya en el almacén central de datos de la institución, donde se junta la información de todos sus sistemas —admisiones, lo académico y los pagos—, y sus reportes de atribución salen de esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.D2`, `2.3.F2`, `2.3.F6`, `2.3.F8`, `2.3.F9`, `2.3.E1`, `2.3.E2`, `2.3.E5`, `2.3.E6`, `2.3.E7`, `2.3.O5`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los interesados y las solicitudes de cada período?

*Descripción:* Mide si cada persona del equipo sabe qué le toca, si hay metas de interesados y solicitudes, y si el equipo decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué programa se empuja se decide por costumbre o por quien insiste más, y nadie responde por una meta: el equipo no sabe cuántos interesados y solicitudes se esperan de él en cada período.

**Deficiente.**

- Nadie tiene el marketing de la institución como responsabilidad propia: se hace, campañas de admisión incluidas, en los ratos libres de quien pueda. `[2.4.D1]`
- Qué programa promover y cuándo se decide sobre la marcha, sin metas ni números. `[2.4.D2]`
- Nadie revisa los resultados de marketing —cuántos interesados y solicitudes trajo cada período—: ni el equipo ni la dirección. `[2.4.D3]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué publicar, qué pieza aprobar— espera a que lo resuelva la rectoría o la dirección general. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —cuántos interesados entran por programa, de dónde vienen, cuántos llegan a la solicitud y, donde hay asesores de admisiones, cuántos llegan a MQL— y lo consulta al menos una vez por semana. `[2.4.F2]`
- El equipo tiene metas mensuales o trimestrales —interesados y solicitudes por programa—, y en la reunión de resultados rinde cuentas por ellas. `[2.4.F3]`
- Las decisiones sobre qué programas empujar y en qué enfocar cada campaña citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.** El liderazgo prepara a quien entra, escucha al equipo y, donde hay asesores de admisiones, acuerda reglas con Admisiones y con Servicio.

*Resultado:* Una persona nueva se integra rápido y, donde hay asesores de admisiones, Marketing trabaja con reglas acordadas con Admisiones y con Servicio en vez de discutir cada vez quién se hace cargo de un aspirante o de un estudiante.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —la marca, los programas y las herramientas—; no se le entrena de memoria. `[2.4.E2]`
- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —lo que pagan en toda su carrera los estudiantes que trae— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide según lo que dejan con el tiempo los estudiantes que trae cada canal, frente a lo que cuesta traerlos.

*Se leen igual:* `2.4.I2`, `2.4.F5`, `2.4.F7`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`, `2.4.O6`.

#### 2.5 Marca y reputación

¿Qué guía a tu equipo, y a cada facultad, cuando arma una pieza para publicar?

*Descripción:* Mide si la institución se ve y suena igual en todo lo que sale, venga de la facultad que venga, si está escrito a qué aspirantes y familias les habla, si el sitio aparece en buscadores y si su reputación está a la vista.

*Costo de quedarse:* Cada facultad y cada programa publican con su propio estilo, tu mensaje no le habla a ningún tipo de aspirante o de familia en particular y, cuando alguien busca qué estudiar, los buscadores muestran mal tu sitio, o no lo muestran.

**Deficiente.** Cada facultad y cada programa se comunican a su manera: no hay una voz de la institución y los mensajes cambian de una pieza a otra.

- No está escrito a quién le habla la institución: no hay buyer personas. `[2.5.D2]`
- Cada facultad o programa se comunica con su propia marca y su propio estilo. `[2.5.D301 · evaluado]`

**Inicial.**

- Hay logo, colores y plantillas, pero el buyer persona es uno solo y tan general que sirve para cualquier programa, como «jóvenes que salen del colegio». `[2.5.I1]`

**Funcional.**

*Resultado:* La institución se ve y suena igual en todo lo que sale, venga de la facultad que venga, y el sitio es encontrable en buscadores con lo básico bien resuelto.

**Eficiente.** La presencia se afina por programa y por tipo de aspirante, se prepara para buscadores y asistentes de IA, y las pruebas de la reputación de la institución están a la vista.

*Resultado:* La institución aparece cuando los aspirantes y sus familias buscan qué y dónde estudiar, tanto en buscadores como en asistentes de IA, con contenido pensado para cada programa y cada tipo de aspirante que importan; cada reseña de sus estudiantes, buena o mala, recibe respuesta, y las pruebas de su reputación —acreditaciones, rankings y lo que logran sus egresados— están a la vista.

- Si el contenido propio se publica en el sitio, está organizado por temas —por ejemplo, un área de estudio o una carrera—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido del aspirante —de la primera búsqueda a la matrícula, con sus ferias, visitas y conversaciones— está mapeado con puntos de contacto definidos. `[2.5.E4]`
- Las pruebas de la reputación de la institución —las acreditaciones y los rankings que tenga, y lo que logran sus egresados— están a la vista en el sitio y en las campañas, y se actualizan cada período. `[2.5.E301 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La presencia se mantiene vigente sin que el equipo escriba cada pieza: la IA produce y ajusta el contenido para cada programa, cada tipo de aspirante y cada forma de buscar, y el equipo lo aprueba.

*Se leen igual:* `2.5.D1`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E3`, `2.5.E6`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un interesado según el programa, el nivel o la modalidad que busca?

*Descripción:* Mide si cada interesado y su familia reciben mensajes pensados para su programa, su nivel y su modalidad.

*Costo de quedarse:* Le mandas la misma campaña a quien busca un técnico que a quien busca un posgrado: el mensaje no le habla a nadie, y la familia que paga nunca recibe lo que necesita saber.

**Deficiente.**

- No hay segmentos: las campañas salen a toda la base con el mismo mensaje, busque el interesado un técnico, una carrera o un posgrado. `[2.6.D1]`
- Los correos son iguales para todos los interesados, sin importar el programa que buscan: a lo sumo cambia el nombre en el saludo. `[2.6.D2]`

**Inicial.**

- Hay listas separadas por programa o por nivel, pero casi todas las campañas salen con la misma pieza para todas. `[2.6.I2]`

**Funcional.** Hay segmentos escritos, piezas pensadas para cada uno —también para la familia, si participa en la decisión— y, donde hay asesores de admisiones, criterios escritos para clasificar a los interesados.

*Resultado:* Cada programa y cada perfil reciben un mensaje pensado para ellos, la familia que participa en la decisión recibe lo que necesita saber y, donde hay asesores de admisiones, Admisiones recibe interesados que Marketing ya clasificó con criterios escritos.

- Existen criterios escritos de qué es un suscriptor, un interesado y un MQL, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios, como el programa de interés o el nivel de estudios. `[2.6.F4]`
- Si la familia participa en la decisión —porque decide, acompaña o paga—, las campañas también le hablan a ella, con piezas propias y distintas de las del aspirante. `[2.6.F301 · comprobable · hábito]`

**Eficiente.** Los segmentos y el puntaje de interesados se arman solos, y el mensaje se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los interesados con más probabilidad de matricularse se distinguen del resto: donde hay asesores de admisiones, Admisiones los recibe primero.

- Hay secuencias distintas por segmento o por etapa del recorrido del aspirante. `[2.6.E1]`

**Óptimo.**

- La IA predice quién se va a matricular y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.I1`, `2.6.F3`, `2.6.F5`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.E6`, `2.6.E7`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y captación

¿Cómo salen tus campañas por los canales que usas, sean digitales, ferias o colegios?

*Descripción:* Mide si los canales que la institución eligió —digitales, ferias o colegios— salen con regularidad, bajo un mismo plan y con un costo conocido por interesado.

*Costo de quedarse:* Llegas a los aspirantes a ratos, o no llegas, sin un plan que coordine tus canales —la pauta, las ferias o los colegios—, y no sabes cuánto te cuesta cada interesado que traen.

**Deficiente.** No hay canales activos ni un plan que diga por cuáles salir: la institución no sale a buscar aspirantes por ningún canal.

- No hay canales activos: la institución no sale a buscar aspirantes por ningún canal —ni redes, ni correo, ni pauta, ni mensajes, ni eventos—. `[2.7.D1]`
- No hay un plan que diga por qué canales sale la institución. `[2.7.D2]`

**Inicial.**

- Los canales por donde más sale la institución publican sin ritmo fijo: cuando alguien se acuerda o le queda un rato. `[2.7.I1]`
- Cada canal va por su cuenta —las ferias por un lado, la pauta por otro—: no hay calendario común ni campaña que los atraviese. `[2.7.I3]`

**Funcional.** Los canales que la institución eligió salen con regularidad y bajo un mismo plan.

*Resultado:* La campaña de cada período sale coordinada por todos los canales del plan en vez de esfuerzos sueltos, y el líder ve cuánto le cuesta cada interesado según el canal del que venga.

- Los canales que la institución eligió en su plan siguen el mismo calendario y la misma campaña: la de admisión de cada período sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada interesado —o cada matrícula, donde el estudiante se matricula solo en línea— el último mes, al menos por canal. `[2.7.F6]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, en el sistema se ve cuánto cuesta cada matrícula en cada canal, y el presupuesto se mueve según lo que cuesta cada interesado o cada matrícula.

*Resultado:* La inversión se mueve hacia el canal que trae matrículas al menor costo, los canales se refuerzan entre sí en vez de competir por el mismo interesado, y los estudiantes y egresados recomiendan la institución.

- Si las ferias, las charlas en colegios, las visitas al campus, los días de puertas abiertas o los webinars son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- El presupuesto entre canales se revisa al menos una vez por mes y se mueve según lo que cuesta cada interesado o cada matrícula en cada canal. `[2.7.E3]`
- Hay un programa de embajadores activo: estudiantes y egresados saben cómo recomendar la institución, y cada aspirante referido queda registrado con quién lo trajo. `[2.7.E4]`
- En el sistema se ve cuánto costó cada matrícula del último período en cada canal —pauta, ferias, colegios, referidos—, no solo cada interesado. `[2.7.E301 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más matrículas deja, dentro de los límites que fija el equipo; los estudiantes y egresados satisfechos traen aspirantes nuevos, y la institución prueba canales nuevos sin esperar a ver qué hacen las demás.

- Los estudiantes y egresados que Servicio identifica como promotores se vuelven embajadores y testimonios de la institución sin pedirlos a mano: el sistema los invita solo, el equipo elige qué testimonios se publican, y en el sistema se ve qué aspirantes trajo cada uno. `[2.7.O4]`

*Se leen igual:* `2.7.I2`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.F7`, `2.7.F8`, `2.7.E5`, `2.7.E6`, `2.7.E7`, `2.7.E8`, `2.7.E9`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de la campaña de admisión de cada período cuando termina?

*Descripción:* Mide si cada campaña deja a la vista los aspirantes o las matrículas que trajo, y una lección escrita para el siguiente período.

*Costo de quedarse:* Repites cada período la campaña de siempre porque nadie anota qué funcionó y qué no: cada campaña de admisión empieza de cero, sin saber qué dejó la del período anterior.

**Deficiente.**

- No queda registro de cómo le fue a la campaña de cada período. `[2.8.D3]`

**Inicial.** Los resultados de cada período se juntan tarde y a mano, y lo aprendido no queda escrito para el siguiente.

- Se miran clics, alcance y me gusta, no los interesados ni las matrículas que trajo cada campaña. `[2.8.I1]`

**Funcional.**

*Resultado:* El equipo ve cuántos aspirantes y matrículas dejó cada campaña sin armar el número a mano, y cada período deja una lección escrita para el siguiente.

- Cada campaña del calendario —como la de admisión de cada período, no cada publicación suelta— cierra con una revisión escrita de qué funcionó y qué no. `[2.8.F3]`
- Los resultados de cada campaña —los aspirantes o las matrículas que trajo, no solo los clics o los asistentes— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

**Óptimo.**

*Resultado:* Las campañas mejoran mientras están corriendo, no recién cuando cierra la matrícula.

- La IA ajusta las campañas de admisión mientras corren —deja de mostrar la versión del anuncio que no trae interesados y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`
- Los mensajes que la IA decide para cada interesado se miden contra un grupo de control, y en el sistema se ve cuánto agregan; con eso el equipo revisa los límites que le fijó a la IA. `[2.8.O3]`

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.I2`, `2.8.E3`, `2.8.E4`, `2.8.E5`.

### Área 3 — Servicio

Mide el rendimiento del área de servicio al estudiante, que cubre todo lo que pasa después de la matrícula: desde los trámites y las consultas de cada período hasta que el estudiante termina lo que vino a estudiar. Mira cómo está montada por dentro y qué produce en atención, permanencia y rematrícula.

**Deficiente.** La atención se improvisa estudiante por estudiante. No hay un proceso, ni respuestas comunes, ni un sistema donde queden los casos —cada persona responde con su propio criterio— y los datos del estudiante están repartidos entre oficinas. La deserción te toma por sorpresa.

**Inicial.** El conocimiento y la coordinación viven en una sola persona, y eso te deja con un punto único de fallo. Hay un sistema para los casos de los estudiantes, pero pocos lo usan; cada persona u oficina tiene sus propias respuestas guardadas para los trámites más frecuentes y hay procesos que nadie formalizó. La atención es frágil.

**Funcional.** Tu atención al estudiante es consistente y ya no depende de una persona. Sabes qué tipos de estudiante atiendes y qué espera cada uno. Cada caso sigue un recorrido configurado, cada período arranca con su calendario de trámites, el equipo atiende en el sistema central con la ficha del estudiante a la vista, los casos están clasificados y cada estudiante nuevo arranca con una inducción definida. Cada caso tiene una prioridad que el equipo respeta, tienes respuestas guardadas para lo repetitivo y detectas a mano al estudiante en riesgo de dejar antes de que se vaya. Todavía no hay alertas automáticas, pero ya no esperas a que el estudiante deje de venir.

**Eficiente.** La atención empieza a adelantarse al problema. Tienes plazos de respuesta, escalación automática y trámites en línea, y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción, y los datos del estudiante se unifican con los de Admisiones. Ves venir los riesgos antes de que el estudiante levante la mano, y ningún caso se pierde entre oficinas. Donde el estudiante vuelve, cada uno tiene un indicador de cómo va y los de los grupos clave, un consejero que los conoce; donde el estudiante sigue un programa período tras período, los que están en riesgo de dejar reciben una acción de permanencia antes de decidir irse.

**Óptimo.** Un agente de IA resuelve los casos de los estudiantes y le pasa a una persona, con todo el contexto, los que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y atiende las excepciones; cada estudiante se atiende sabiendo lo que se le prometió en su admisión y recibe detalles pensados para deleitarlo y, donde el estudiante vuelve, un modelo anticipa quién puede dejar sus estudios antes de que lo diga. La matrícula crece sin que crezca el equipo de atención.

#### 3.1 Procesos y Rutinas

¿Cómo atiende tu equipo el trámite de un estudiante, desde que llega hasta que se cierra?

*Descripción:* Mide si la atención al estudiante sigue un proceso y rutinas definidas, para que no dependa de quién sabe.

*Costo de quedarse:* La atención depende de quién sabe: si esa persona falta en plena rematrícula, las filas crecen y cada ventanilla da una respuesta distinta.

**Deficiente.** No hay un proceso de atención: cada persona que atiende resuelve los casos a su manera.

- Cada persona que atiende maneja los trámites y las consultas a su manera. `[3.1.D1]`
- El equipo de atención no tiene reuniones ni rutinas de trabajo: cada persona y cada oficina se organiza por su cuenta. `[3.1.D2]`

**Inicial.**

- Hay un recorrido para atender los trámites —por ejemplo, para entregar una constancia— que el equipo sigue de palabra, sin configurarlo ni escribirlo. `[3.1.I1]`
- Unas personas u oficinas atienden en el sistema; otras siguen con su correo, su teléfono o su propia hoja de cálculo. `[3.1.I3]`

**Funcional.** El equipo atiende en un mismo sistema, cada caso sigue un recorrido configurado y cada estudiante tiene quién responda por él.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada estudiante tiene a alguien que responde por él, cada período arranca con sus picos de trabajo previstos, y un caso se atiende igual sin importar quién lo tome.

- Los casos de los estudiantes siguen un recorrido configurado en el sistema, con sus etapas, de la recepción al cierre. `[3.1.F1]`
- Existe un proceso escrito para escalar las quejas graves —como un cobro que el estudiante no reconoce o una nota en disputa— y los casos que quien atiende no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cualquier persona del equipo explica cómo se atiende un trámite típico —una constancia, un cambio de horario— siguiendo el mismo flujo. `[3.1.F5]`
- Cualquier persona del equipo atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por correo o en ventanilla. `[3.1.F6]`
- Cada período tiene su calendario de atención escrito antes de empezar: en qué semanas llegan la rematrícula, los pagos, el inicio de clases y los exámenes, y qué tiene que preparar el equipo para cada una. `[3.1.F301 · declarado · hábito]`

**Eficiente.** Aparecen los plazos de respuesta, los playbooks y el recorrido del estudiante, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de trámite, cada momento clave del paso del estudiante por la institución tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de trámite o prioridad: cuánto puede tardar una constancia, una revisión de nota o un cambio de carrera. `[3.1.E1]`
- El recorrido del estudiante está definido de punta a punta, con sus momentos clave —la inducción, el primer período, la graduación y, si el estudiante sigue un programa o vuelve por otro curso, cada vez que se vuelve a matricular— y un responsable y un estándar para cada uno. `[3.1.E4]`

**Óptimo.**

- El sistema detecta, sin que nadie lo revise a mano, cuando el caso de un estudiante se sale de las etapas o los pasos del proceso de atención, y se lo señala a quien lo atiende y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3]`

*Se leen igual:* `3.1.I2`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F7`, `3.1.F8`, `3.1.E3`, `3.1.E5`, `3.1.E6`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega el trámite de un estudiante —por ventanilla, correo o WhatsApp— al sistema y a la persona que lo tiene que atender?

*Descripción:* Mide si cada caso del estudiante —un trámite, una consulta, un reclamo— llega solo al sistema y a quien lo atiende, y cuánto de la atención se automatiza.

*Costo de quedarse:* Los casos se pierden entre correos, ventanillas y chats, y alguien tiene que repartirlos a mano en cada rematrícula: el estudiante tiene que insistir para que lo atiendan.

**Deficiente.**

- No hay un sistema central donde queden los casos de los estudiantes. `[3.2.D1]`
- Los trámites y las consultas de los estudiantes se manejan en celulares personales o en correos individuales de cada oficina. `[3.2.D2]`

**Inicial.**

- Hay un sistema para los casos de los estudiantes, pero lo que entra —trámites, consultas— se reparte a mano, o el equipo atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.** Los casos de los estudiantes entran al sistema y se asignan solos con una regla simple; si el equipo atiende por WhatsApp o chat, ese canal está conectado, y si usa IA, trabaja con los datos de cada estudiante.

*Resultado:* Lo que el estudiante escribe por los canales conectados llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Si el equipo usa IA, esta trabaja con lo que el sistema sabe de cada estudiante —quién es, en qué programa está y sus casos—, no a ciegas. `[3.2.F8]`

**Eficiente.** Los plazos se vigilan solos y los casos que están por vencer suben solos, el estudiante hace en línea sus trámites de siempre y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el estudiante puede ver y abrir sus casos y hacer en línea sus trámites de siempre sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir casos o buscar en la base de conocimiento—, y la IA trabaja con el contexto del área: los tipos de estudiante, la atención que recibe cada uno y las respuestas a las preguntas frecuentes. `[3.2.E4]`
- Los trámites más frecuentes —constancias, rematrícula, pagos y cambios de horario— se hacen en línea de principio a fin, sin ir a una ventanilla. `[3.2.E301 · comprobable]`

**Óptimo.** Un agente de IA resuelve los casos de los estudiantes y le pasa a una persona lo que no puede, y lo que la institución calcula de cada estudiante —como su riesgo de dejar sus estudios— aparece en su ficha.

*Resultado:* Buena parte de los casos de los estudiantes se resuelve sin que intervenga una persona, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la institución sabe de ese estudiante a la vista.

- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, el riesgo de deserción del estudiante. `[3.2.O4]`

*Se leen igual:* `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E3`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O1`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué trámites y qué problemas te llegan, cuántos y de qué estudiantes?

*Descripción:* Mide si los datos de cada estudiante y sus casos están completos y ordenados para atender y decidir sin reconstruirlos oficina por oficina.

*Costo de quedarse:* Cada vez que el estudiante pregunta, tiene que volver a explicar quién es, en qué va su trámite y qué le dijeron en la otra oficina.

**Deficiente.** Los datos de los estudiantes y sus casos están dispersos, sin un lugar común.

- La información de los estudiantes y sus casos está repartida entre correos, chats, hojas o sistemas que no se conectan, y no hay un lugar donde se vea junta. `[3.3.D1]`
- No se puede reconstruir qué le pasó a un estudiante con sus trámites: lo que pidió y lo que se le respondió no queda registrado en ningún lado. `[3.3.D2]`

**Inicial.** Los casos están en un sistema, pero la ficha del estudiante está incompleta y los números de casos se arman a mano.

- Los casos están en un solo sistema, pero la ficha del estudiante sale incompleta: su programa y en qué período va hay que buscarlos en el sistema académico. `[3.3.I1]`

**Funcional.** La historia y la ficha de cada estudiante —su programa y sus casos— están a la vista, y cada caso tiene su tipo y su motivo.

*Resultado:* El líder sabe qué trámites y qué problemas llegan y cuántos, y cualquiera que atiende tiene la historia del estudiante en segundos.

- Cualquier persona que atiende ve el histórico de casos de un estudiante en menos de 10 segundos. `[3.3.F1]`
- La ficha del estudiante muestra su programa y en qué período va, cuánto paga por período y su beca, no solo sus casos. `[3.3.F2]`
- Cada caso tiene tipo y motivo, con una lista definida: constancias, pagos, notas, cambios de carrera, reclamos. `[3.3.F4]`
- El contexto que el área documentó —tipos de estudiante, la atención que recibe cada uno, respuestas a las preguntas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6]`

**Eficiente.** Se miden tiempos y satisfacción, y los datos del estudiante se unifican con los de Admisiones.

*Resultado:* La institución sabe qué tan rápido y qué tan bien atiende y cuánto tarda un estudiante nuevo en completar su inducción, con la satisfacción medida y no supuesta; donde el estudiante vuelve, sabe además cómo va cada uno.

- Se mide la satisfacción de los estudiantes —con el NPS o el CSAT— con una cadencia definida, por ejemplo al cerrar cada caso o al terminar cada período. `[3.3.E2]`
- Se mide cuánto tarda cada estudiante nuevo en alcanzar el resultado de su inducción: el tiempo desde que se matricula hasta que lo logra. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada estudiante, que combina su asistencia y su avance académico, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Los datos del estudiante se mantienen al día solos y, donde el estudiante vuelve, un modelo anticipa el riesgo de que deje sus estudios antes de que lo diga.

*Resultado:* La institución anticipa lo que va a pasar con sus estudiantes, con datos que se mantienen al día solos, y, donde el estudiante vuelve, sabe quién está en riesgo de dejar y quién va logrando lo que vino a buscar antes de que ellos mismos lo digan.

- Un modelo predictivo de salud calcula para cada estudiante su riesgo de dejar y si va logrando lo que vino a estudiar, a partir de su experiencia y de su avance; el puntaje se ve en su ficha y quien responde por cada estudiante revisa a los que el modelo marca. `[3.3.O1]`
- Servicio se apoya en el almacén central de datos de la institución —donde se juntan lo académico, los pagos y la atención—, con reglas claras de quién accede y cómo se mantiene, para anticipar el riesgo de cada estudiante. `[3.3.O2]`

*Se leen igual:* `3.3.I2`, `3.3.I3`, `3.3.F5`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O3`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el equipo va al día con los trámites de los estudiantes?

*Descripción:* Mide si cada persona y cada oficina sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien qué le toca a cada oficina, y el líder se entera de los atrasos cuando el estudiante ya se quejó.

**Deficiente.**

- Nadie tiene claro qué le toca: entre quien recibe a los estudiantes nuevos, quien atiende los trámites y quien los acompaña, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.** Hay roles de palabra entre las oficinas y el líder mira algunos números de vez en cuando, sobre todo cuando algo sale mal, pero sin una cadencia fija.

- Se siguen algunos números de la atención al estudiante —trámites abiertos, consultas de la rematrícula—, pero sin un tablero ni una cadencia fija. `[3.4.I1]`
- El líder mira los números de vez en cuando, sobre todo cuando algo sale mal, como un trámite que se traba o un estudiante que se queja. `[3.4.I2]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, volumen, casos pendientes acumulados, casos por tipo de trámite— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por sus plazos de respuesta, el líder prepara a quien entra y acuerda con Admisiones y con las áreas académica y financiera qué recibe y qué devuelve Servicio.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, las áreas académica y financiera resuelven en el plazo acordado, cada estudiante nuevo llega de Admisiones con lo que vino a buscar y, donde el estudiante vuelve a matricularse curso por curso, sin seguir un programa, Admisiones se entera cuando uno se puede estar yendo.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —trámites, reglamentos y sistemas—; no se le entrena de memoria. `[3.4.E2]`
- El acuerdo con las áreas académica y financiera está escrito y se mide: en cuánto tiempo resuelven lo que les pasa Servicio, como una revisión de nota, un cambio de carrera o un arreglo de pago. `[3.4.E301 · comprobable]`
- El sistema calcula cuánto cuesta atender a cada tipo de estudiante frente a lo que deja a la institución, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento y, donde la relación es continua, el servicio se mide por los estudiantes que permanecen y siguen estudiando con la institución.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella; donde la relación es continua, Servicio se mide por los estudiantes que permanecen, se rematriculan y siguen estudiando con la institución, no solo por los casos que cierra.

*Se leen igual:* `3.4.D2`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E1`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O2`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia de Atención

¿En qué se apoya tu equipo para que la respuesta a un trámite no cambie según quién atienda?

*Descripción:* Mide si el equipo conoce a sus tipos de estudiante y si cada estudiante recibe las mismas respuestas, lo atienda quien lo atienda.

*Costo de quedarse:* La misma pregunta sobre un trámite tiene una respuesta en ventanilla y otra por WhatsApp: el estudiante no sabe a quién creerle y termina haciendo fila para preguntar en persona.

**Deficiente.** No hay respuestas guardadas ni criterios comunes: cada persona que atiende responde a su manera.

- No hay respuestas guardadas: cada persona que atiende escribe cada respuesta desde cero, a su manera. `[3.5.D1]`

**Inicial.** Hay algunas respuestas guardadas, pero cada persona u oficina tiene las suyas.

- Hay algunas respuestas guardadas para los trámites frecuentes, pero cada persona u oficina tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de estudiante están escritos, cada estudiante nuevo arranca con una inducción definida y el equipo tiene respuestas guardadas para los trámites frecuentes.

*Resultado:* El equipo sabe qué tipos de estudiante atiende y qué espera cada uno, un estudiante nuevo arranca con una inducción clara y un resultado definido, y todo el equipo tiene a mano las mismas respuestas para los trámites frecuentes.

- Hay respuestas guardadas —macros— para las preguntas frecuentes de los estudiantes, al alcance de todo el equipo. `[3.5.F1]`
- Existe un proceso documentado de inducción del estudiante nuevo, con un resultado definido que debe alcanzar al terminarla: por ejemplo, tener sus accesos y su horario, y saber a quién acudir. `[3.5.F2]`
- Si entró alguien nuevo a atender estudiantes, recibió el conjunto de respuestas guardadas en su capacitación inicial. `[3.5.F3]`
- Existe un documento simple con los tipos de estudiante que atiende el área —por ejemplo, de primer ingreso, regular, becado, de posgrado o a distancia—, con qué necesita cada uno, qué espera del servicio y cuáles forman los grupos clave, consultable por cualquiera del equipo. `[3.5.F4]`

**Eficiente.**

*Resultado:* El estudiante reconoce la misma voz de la institución en cada respuesta, lo atienda quien lo atienda.

- El tono y la voz de la institución se aplican a las respuestas, no cada persona con su estilo. `[3.5.E2]`

**Óptimo.**

- Lo que la IA responde o escribe sola a los estudiantes —sobre un trámite, un pago o la rematrícula— sigue la guía de tono y estilo de la institución; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F5`, `3.5.E3`.

#### 3.6 Priorización de estudiantes

¿Cómo decide tu equipo qué caso de un estudiante se atiende primero?

*Descripción:* Mide si los casos se atienden según su urgencia y el tipo de estudiante, y no según quién insiste más.

*Costo de quedarse:* Un cobro mal hecho espera en la misma fila que una constancia, y el estudiante que más acompañamiento necesita recibe la misma atención que todos.

**Deficiente.**

- Los casos se atienden por orden de llegada o como prefiere quien atiende, sin mirar su urgencia ni quién es el estudiante. `[3.6.D1]`

**Inicial.** Se prioriza a ojo: lo que parece urgente o el estudiante que más insiste.

- Se intenta atender primero lo urgente, pero los casos no tienen una prioridad asignada: cada persona decide a ojo, o se adelanta el estudiante que más insiste. `[3.6.I1]`

**Funcional.** Cada caso tiene una prioridad que el equipo respeta, y cada tipo de estudiante recibe la atención que le corresponde.

*Resultado:* Lo urgente se atiende primero y cada tipo de estudiante recibe la atención que le corresponde, sin que quien atiende tenga que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta. `[3.6.F1]`
- Quien atiende usa la ficha del estudiante —su programa, en qué período va y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** La atención cambia según el momento de cada estudiante y, donde el estudiante vuelve, los de los grupos clave tienen un consejero dedicado.

*Resultado:* La atención cambia según el momento en que está cada estudiante y, donde el estudiante vuelve, cada uno de los grupos clave tiene un consejero que lo conoce y el resto no queda solo.

**Óptimo.** Cada estudiante se atiende con todo su contexto, lo atienda una persona o la IA, incluso cuando hace sus trámites solo.

*Resultado:* Cada estudiante recibe una atención a su medida en cualquier canal, incluso cuando hace sus trámites solo, y nunca tiene que volver a explicar lo que ya habló con Admisiones.

- En el autoservicio, cada estudiante ve lo que corresponde a su tipo, a su programa y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- Cada estudiante se atiende con el contexto de cómo llegó —lo que se le prometió en su admisión y el perfil con que entró—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F4`, `3.6.F5`, `3.6.E1`, `3.6.E4`, `3.6.E5`, `3.6.O2`.

#### 3.7 Permanencia

¿Cómo te enteras de que un estudiante tiene un problema que lo puede llevar a dejar?

*Descripción:* Mide si el servicio se adelanta a la deserción y a lo que necesita cada estudiante, o solo reacciona tarde.

*Costo de quedarse:* Te enteras de que un estudiante está mal cuando el problema ya creció o cuando ya dejó de venir, y sus fechas importantes —un pago, la renovación de su beca, la rematrícula— te toman por sorpresa.

**Deficiente.** Nadie se adelanta: los problemas se atienden cuando el estudiante reclama.

- Aunque un estudiante acumule casos repetidos o una queja sin resolver, nadie lo contacta: los problemas se atienden cuando estallan. `[3.7.D1]`
- Nadie contacta al estudiante por iniciativa propia: se espera a que él se acerque a una ventanilla o escriba. `[3.7.D2]`

**Inicial.** A veces alguien llama a un estudiante con problemas, pero depende de quién lo note, y donde los estudiantes siguen un programa, cuántos dejaron se sabe recién al cerrar la rematrícula.

- Cuando un estudiante tiene problemas repetidos, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`
- Cuántos estudiantes dejaron se sabe recién cuando cierra la rematrícula, no antes. `[3.7.I301 · comprobable · relación continua]`

**Funcional.** Los problemas que se repiten, las quejas y las señales de que un estudiante puede dejar se detectan, aunque sea a mano, y los estudiantes de los grupos clave reciben contacto antes de sus fechas críticas.

*Resultado:* Los estudiantes con señales de riesgo, las quejas y las fechas críticas de los grupos clave —como la rematrícula— ya no toman al equipo por sorpresa: se actúa antes de que el problema crezca o el estudiante deje y, donde la relación es continua, cuando alguno deja se sabe por qué.

- Un estudiante con casos repetidos por el mismo problema, una queja sin resolver o, si se piden calificaciones de la atención, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los estudiantes de los grupos clave reciben contacto antes de sus fechas críticas —un pago, la renovación de su beca o, si siguen un programa, su rematrícula—, no después. `[3.7.F2]`
- Cada estudiante que deja sus estudios —porque abandona o porque no se rematricula— deja registrada la razón de su salida. `[3.7.F3]`
- Los estudiantes con señales de que pueden dejar —notas bajas, ausencias o atraso en el pago— se identifican durante el período, y alguien los contacta para acompañarlos. `[3.7.F301 · comprobable · hábito]`
- Si la institución atiende a menores de edad, el contacto que el equipo inicia con el estudiante o su familia cuenta con el permiso que exige la ley, registrado en su ficha. `[3.7.F302 · comprobable]`

**Eficiente.** El riesgo de deserción se ve venir, ningún caso se pierde aunque lo resuelva otra oficina, y el estudiante recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los casos del estudiante no se pierden entre oficinas, el estudiante sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la institución retiene estudiantes que antes dejaban sin aviso, sabe quiénes pueden seguir estudiando con ella y sus estudiantes de los grupos clave revisan qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de riesgo de deserción o de la oportunidad de que el estudiante siga con otro programa. `[3.7.E1]`
- Los estudiantes de los grupos clave revisan con la institución, al menos cada trimestre, la meta que persiguen —por ejemplo, terminar en el plazo de su programa o mantener su beca—: qué se logró y qué sigue. `[3.7.E3]`

**Óptimo.** Los problemas se resuelven antes de que el estudiante los note, con acciones que la IA ajusta, y el estudiante recibe detalles que lo hacen sentirse parte de la institución.

*Resultado:* La mayoría de los problemas que detecta el sistema se resuelven antes de que el estudiante los note, y cada estudiante siente que la institución se adelanta a lo que necesita y lo sorprende para bien.

- La mayoría de los problemas que detecta el sistema —un pago rechazado, un acceso que no funciona, un choque de horario— se resuelven antes de que el estudiante los note: el equipo valida la solución y en el sistema se ve que el estudiante no tuvo que abrir un caso. `[3.7.O2]`
- La IA decide qué acción proactiva recibe cada estudiante —qué, cuándo y por qué canal— según su historia y sus señales, como sus notas o su asistencia, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada estudiante. `[3.7.O3]`

*Se leen igual:* `3.7.F4`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.E8`, `3.7.O5`, `3.7.O6`.

#### 3.8 Autoservicio y aprendizaje

¿Qué pasa con las preguntas que tus estudiantes hacen una y otra vez, en cada rematrícula?

*Descripción:* Mide si el equipo puede atender a más estudiantes sin crecer al mismo ritmo que la matrícula, gracias al autoservicio y a lo que se aprende de cada período.

*Costo de quedarse:* Tu equipo contesta a mano las mismas preguntas en cada rematrícula, y cada estudiante nuevo suma más de esas preguntas a la fila.

**Deficiente.** Las preguntas de siempre —cómo rematricularse, cómo pedir una constancia— se responden a mano, una por una: no hay nada publicado.

- No hay ninguna respuesta publicada que el estudiante pueda consultar por su cuenta. `[3.8.D1]`
- Hasta las preguntas que más se repiten en cada rematrícula se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.** Hay algunas respuestas publicadas o un chatbot de menú, pero lo que más preguntan los estudiantes todavía no tiene respuesta publicada.

- Hay algunas respuestas publicadas, pero sueltas: no cubren lo que más preguntan los estudiantes, que se sigue respondiendo a mano. `[3.8.I2]`

**Funcional.** Las preguntas más frecuentes de los estudiantes tienen respuesta publicada.

*Resultado:* El estudiante puede consultar por su cuenta la respuesta a las preguntas de cada período, y quien atiende lo remite a ella en vez de volver a escribirla.

- Las diez preguntas que más hicieron los estudiantes en el último trimestre —o todas, si son menos—, por ejemplo cómo rematricularse, cómo pedir una constancia o cómo pagar, tienen una respuesta publicada que el estudiante puede consultar por su cuenta. `[3.8.F1]`

**Eficiente.** Se documenta lo que se aprende, el autoservicio empieza a liberar al equipo y cada período se prepara con lo que dejó el anterior.

*Resultado:* La institución puede sumar estudiantes sin sumar personal de atención en la misma proporción, porque buena parte de lo que preguntan se resuelve sin abrir un caso, y cada período se prepara con lo que dejó el anterior.

- Cada período se prepara con lo que dejó el anterior: cuántos casos llegaron, de qué tipo y en qué semanas; con eso se ajustan el equipo y las respuestas publicadas antes del pico. `[3.8.E301 · declarado · hábito · requiere 3.3.F4]`

**Óptimo.** La IA detecta las preguntas nuevas de los estudiantes y genera el contenido; la matrícula crece sin que crezca el equipo de atención.

*Resultado:* La matrícula puede crecer sin que crezca el equipo de atención: el conocimiento se genera a medida que aparecen preguntas nuevas, y la IA y el autoservicio absorben los picos de cada período.

- Los picos de cada período —la rematrícula, el inicio de clases, los exámenes— los absorben la IA y el autoservicio: el equipo de atención no crece cuando crece la matrícula, y el líder ve en los tableros del área qué parte de los casos resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`
- La IA aplica lo que aprende de los casos a las respuestas guardadas, a la atención de cada tipo de estudiante y a los avisos que se adelantan a lo que necesita cada uno, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3]`

*Se leen igual:* `3.8.I1`, `3.8.F2`, `3.8.E1`, `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O1`, `3.8.O4`.

## Edición — Inmobiliaria

Para el equipo comercial de una desarrolladora que vende las unidades de sus proyectos —casas, apartamentos o lotes—, de una corredora que vende inmuebles de terceros o de una administradora de alquileres: un asesor trabaja cada negocio, de la primera consulta a la visita, la reserva y la firma. Lo que solo existe en un proyecto propio —la obra, la preventa, la lista de precios de cada proyecto— cuenta solo si la empresa vende proyectos propios. Donde la empresa vende o alquila inmuebles de terceros, «proyecto» se lee como el inmueble o el tipo de inmueble que comercializa, pero «cada proyecto» se lee siempre como cada tipo de inmueble, y «por proyecto», como por tipo de inmueble. Donde la empresa alquila, «comprador» se lee como inquilino, «comprar» y «vender» como alquilar, y «promesa y firma» como la firma del contrato; lo que toca a la escritura no aplica.

*Clave:* inmobiliaria

*Perfil habitual:* con equipo · relación única.

*Criterios propios:* desde el 401.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Prospecto | Interesado en una unidad o en un proyecto |
| Negocio | Negocio: la venta o el alquiler de una unidad, de la primera consulta a la firma |
| Lead | Interesado en una unidad o en un proyecto |
| Pipeline | El recorrido de la venta: consulta, visita, reserva, promesa y firma |
| Revisión del pipeline | Reunión de seguimiento de ventas |
| Material de venta | Brochure, planos, fotos y recorrido virtual de la unidad o del proyecto |
| Vendedor | Asesor inmobiliario |
| Propuesta | La propuesta de una unidad: precio, forma de pago y condiciones |
| Razón de pérdida | Por qué el interesado no compró, o por qué desistió de su reserva |
| Cliente ideal | El comprador objetivo de cada proyecto o de cada tipo de inmueble |
| Pronóstico | Proyección de ventas |
| Caso | Caso de posventa: una consulta, un trámite o un reclamo de obra |
| Buyer persona | Perfil de comprador: quién es, qué busca y cómo decide, como la familia que compra su primera vivienda o el inversionista |
| Traspaso | El de un interesado de Marketing a un asesor, o el de un comprador de Ventas a la posventa |

### Área 1 — Ventas

Mide el rendimiento del área de ventas de la inmobiliaria: cómo está montada por dentro y qué produce en visitas, reservas y unidades vendidas. Vale igual si la venta la trabaja un equipo de asesores o un solo asesor.

**Deficiente.** Tus ventas dependen de quién atienda. Cada asesor lleva a sus interesados en su teléfono, los precios y la disponibilidad viven en una hoja que no siempre está al día, y nadie sabe cuántas consultas se quedaron sin respuesta.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados se registran cuando el asesor se acuerda, cada quien cotiza a su manera y las reservas se llevan aparte.

**Funcional.** Tu equipo comercial opera como una maquinaria base. Cada interesado entra al mismo recorrido, todos venden con la misma lista de precios y la misma disponibilidad, y ningún negocio se enfría después de la visita sin que alguien reaccione.

**Eficiente.** La venta deja de depender del empuje de cada asesor. Mides cuántas consultas llegan a visita y cuántas visitas a reserva, compruebas la capacidad de pago antes de reservar, acompañas cada reserva hasta la firma y proyectas las ventas con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA responden ahí, precalifican y agendan visitas a toda hora; los modelos dicen qué interesado está listo y qué unidad ofrecerle, y el sistema detecta la reserva que se va a caer antes de que pase.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus asesores cada negocio, desde la primera consulta hasta la firma?

*Descripción:* Mide si la venta sigue un proceso escrito, de la consulta a la firma, que no depende de cada asesor.

*Costo de quedarse:* Si se va un asesor, se lleva a sus interesados en el teléfono: nadie sabe quién ya visitó, a quién se le cotizó ni qué reserva estaba por firmarse.

**Deficiente.**

- Las consultas de los portales, la web y la sala de ventas se reparten a ojo, o se las queda el asesor que las ve primero: no hay una regla que diga a quién le toca cada una. `[1.1.D2]`

**Inicial.**

- Hay una cadencia de contacto sugerida para después de la consulta y de la visita, pero cada asesor la cumple cuando puede o cuando se acuerda. `[1.1.I2]`

**Funcional.** Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la firma, con una cadencia de contacto, un proceso de reserva escrito y una revisión fija de los negocios.

*Resultado:* Si rota un asesor, el siguiente sabe en qué va cada cliente, porque todo el equipo trabaja la venta igual en el CRM: los negocios avanzan con los mismos criterios, cada visita deja su siguiente paso, la reserva se hace siempre de la misma forma, cada interesado se contacta con la cadencia acordada y los negocios se revisan en cada reunión de seguimiento.

- Cualquier asesor explica igual las etapas de la venta —consulta, visita, reserva, promesa y firma— y qué tiene que cumplirse para avanzar. `[1.1.F1]`
- Cada proyecto o tipo de venta tiene su propio recorrido en el CRM, con lo que el negocio tiene que cumplir para pasar de cada etapa a la siguiente, hasta la reserva y la firma. `[1.1.F2]`
- Toda visita queda registrada con su resultado y su siguiente paso acordado. `[1.1.F401 · comprobable · hábito]`
- El proceso de reserva está escrito: qué se firma, qué se paga, cuánto dura y qué pasa si se vence. `[1.1.F402 · declarado]`
- Hay una cadencia de contacto definida —cuántos intentos y en cuántos días, y el seguimiento después de cada visita— y se cumple con la mayoría de los interesados nuevos. `[1.1.F7]`
- Antes de mostrar una unidad, el asesor indaga qué busca el cliente, cómo va a pagar y quién decide, y lo deja registrado en el CRM. `[1.1.F403 · comprobable]`

**Eficiente.**

- Hay una metodología de asesoría formal en uso —SPIN, BANT o una equivalente, con pasos definidos— con la que el asesor indaga, por ejemplo, qué busca el cliente, cómo va a pagar y quién decide. `[1.1.E1]`

**Óptimo.**

*Se leen igual:* `1.1.D1`, `1.1.D3`, `1.1.D4`, `1.1.I1`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.F8`, `1.1.E2`, `1.1.E3`, `1.1.E5`, `1.1.E6`, `1.1.O2`, `1.1.O3`, `1.1.O4`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se reserva una unidad?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las consultas, avisar qué toca, bloquear la unidad que se reserva y registrar las conversaciones— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tus asesores copian a mano las consultas de los portales, dependen de su memoria para dar seguimiento y descubren que la unidad ya estaba reservada cuando el cliente ya se había ilusionado.

**Deficiente.**

- Los interesados viven en listas, en el teléfono o en la agenda personal de cada asesor. `[1.2.D1]`

**Inicial.**

- Hay un CRM, pero nada pasa solo: los interesados se reparten a mano y cada asesor tiene que acordarse de sus seguimientos, como el de después de cada visita. `[1.2.I1]`

**Funcional.** Lo básico pasa solo —las consultas de todos los canales entran al sistema y se reparten por una regla, el sistema avisa qué toca y la unidad que se reserva queda bloqueada— y, si se usa IA, trabaja con los datos de cada cliente.

*Resultado:* Ninguna consulta se pierde por no saber a quién le toca: la que llega por un portal o por la web entra sola, el asesor recibe el aviso y deja de depender de su memoria para dar seguimiento, ve qué unidades están disponibles antes de ofrecerlas, y una unidad reservada no se le ofrece a nadie más.

- Las consultas que entran —de los portales, la web, las redes y la sala de ventas— llegan a una bandeja o cola y se asignan por una regla simple (por turnos, por proyecto o por fuente). `[1.2.F2]`
- El asesor puede ver qué unidades están disponibles, reservadas o vendidas antes de ofrecer una, en el CRM o en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8]`
- Reservar una unidad la bloquea en el sistema en el momento: no se puede ofrecer ni reservar dos veces. `[1.2.F401 · comprobable]`

**Eficiente.** Las cotizaciones salen del sistema, la reserva y la promesa —o el contrato, en un alquiler— se firman de forma digital, el CRM se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario.

*Resultado:* El asesor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones se generan desde el sistema, con el precio, la forma de pago y la disponibilidad vigentes, no como documentos sueltos. `[1.2.E1]`
- Si la empresa lleva el inventario de unidades, los cobros o el resto de su operación en otro sistema —un ERP o uno propio—, el CRM está conectado con él. `[1.2.E3]`
- La reserva y la promesa —o el contrato, en un alquiler— se firman de forma digital, y los documentos del cliente quedan en el sistema. `[1.2.E401 · comprobable]`

**Óptimo.** La IA responde, precalifica, agenda visitas y calcula qué negocios van a cerrar; el asesor valida y se queda con las conversaciones que deciden la venta.

*Resultado:* El asesor dedica su tiempo a las conversaciones que deciden la venta: los agentes de IA responden, precalifican y agendan visitas, y él trabaja con la predicción de qué negocios van a cerrar y con respuestas sugeridas para cada conversación.

- Si el equipo atiende por un canal conversacional, agentes de IA responden ahí, precalifican a los interesados con la definición de interesado calificado y agendan visitas a cualquier hora; le pasan al asesor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que precalificaron. `[1.2.O2]`

*Se leen igual:* `1.2.D2`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F6`, `1.2.F7`, `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O3`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus negocios y reservas antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: negocios completos, el origen de cada uno, el inventario al día y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de ventas se arma a mano cruzando el CRM con la hoja de inventario, y no sabes qué portal te trae compradores y cuál solo consultas.

**Deficiente.**

- No se registra por dónde llegó cada negocio —un portal, la web, una valla, un referido o la sala de ventas— ni qué asesor lo lleva: sacar un reporte confiable es imposible. `[1.3.D2]`

**Inicial.**

- Los negocios que se crean hoy se registran, pero a algunos les falta la fecha esperada de cierre, el monto o el asesor responsable. `[1.3.I3]`

**Funcional.** El reporte de negocios y reservas sale del sistema, sin armarlo a mano, y el estado de cada unidad está al día: a los dos se les puede creer.

*Resultado:* El líder ve el estado real de los negocios y de cada unidad cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada interesado.

- Todo negocio creado desde la puesta en marcha del recorrido actual tiene la unidad o el tipo de unidad de interés, el monto, la fecha esperada de cierre y el asesor responsable. `[1.3.F1]`
- Todo negocio creado desde la puesta en marcha del recorrido actual dice por dónde llegó el interesado: portal, web, redes, valla, referido o sala de ventas. `[1.3.F3]`
- El reporte de negocios y de reservas se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4]`
- El estado de cada unidad —disponible, reservada o vendida— está al día en el sistema y coincide con lo que se firmó. `[1.3.F401 · comprobable · requiere 1.2.F8]`

**Eficiente.** Aparece una proyección de ventas confiable, se mide qué tan rápido se vende o se alquila cada tipo de unidad y la ficha del cliente reúne su reserva, sus pagos y sus conversaciones.

*Resultado:* La empresa puede comprometer un ritmo de ventas con confianza y planear con ese número su flujo de caja y, si vende proyectos propios, la obra y su financiamiento.

- Hay una proyección de ventas —por proyecto, si la empresa vende proyectos propios— que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses el total vendido quedó dentro de ±10% del total proyectado. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si la empresa lleva en otros sistemas la reserva, los pagos o el trámite de crédito, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se mide cuánto tarda en venderse o en alquilarse cada tipo de unidad —y, si la empresa vende proyectos propios, cada etapa del proyecto—, y ese ritmo se revisa. `[1.3.E401 · comprobable]`

**Óptimo.**

- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, su reserva y sus pagos, sus casos de posventa y sus conversaciones. `[1.3.O3]`

*Se leen igual:* `1.3.D1`, `1.3.D3`, `1.3.D4`, `1.3.I1`, `1.3.I2`, `1.3.F2`, `1.3.F8`, `1.3.F9`, `1.3.F10`, `1.3.E4`, `1.3.E5`, `1.3.O1`, `1.3.O2`, `1.3.O4`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué asesores van bien y cuáles necesitan ayuda?

*Descripción:* Mide si cada asesor tiene un rol y una meta por escrito, y si el líder sigue los números de la venta y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes de que el proyecto no vendió lo esperado: no vio antes qué asesor se quedó atrás ni en qué etapa se cayeron los negocios.

**Deficiente.**

- Cada asesor trabaja sobre la marcha —atiende la sala de ventas, responde los portales y da visitas como le van llegando—, sin un rol ni responsabilidades claras. `[1.4.D1]`

**Inicial.**

- El líder revisa algunos números —consultas, visitas y reservas— en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`

**Funcional.** Cada asesor tiene un rol y una meta por escrito, está claro a quién le corresponde cada cliente, el líder sigue un tablero cada semana y en la reunión de seguimiento cada quien rinde cuentas.

*Resultado:* Cada asesor sabe qué se espera de él y a quién le corresponde cada cliente, y el líder sabe cada semana qué asesor y qué proyecto van bien y quién necesita ayuda, antes de que termine el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —consultas, visitas, reservas, ventas firmadas, desistimientos, unidades disponibles— y lo consulta al menos una vez por semana. `[1.4.F2]`
- Está escrito a quién le corresponde un cliente cuando lo atienden dos asesores, y cómo se reparte la comisión. `[1.4.F401 · declarado · venta con equipo]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con las áreas que cierran la venta y, si Marketing pasa interesados, también las del traspaso.

*Resultado:* Un asesor nuevo produce más rápido, el trámite de crédito y la firma no se traban entre áreas, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —proyectos, precios, financiamiento y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con las áreas que cierran la venta —legal, cobros y trámite de crédito— está escrito y se mide: qué recibe cada una y en cuánto tiempo responde. `[1.4.E401 · comprobable]`
- Las decisiones de la dirección usan números de fondo: cuánto margen deja cada canal —y cada proyecto, si la empresa vende proyectos propios—, qué tan rápido se vende o se alquila cada tipo de unidad y cuánto aporta cada asesor. `[1.4.E6]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué proyecto y qué canal dejan más margen, qué tipo de unidad se vende más rápido y qué asesor aporta más.

*Se leen igual:* `1.4.D2`, `1.4.I2`, `1.4.F3`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E3`, `1.4.E4`, `1.4.E5`, `1.4.O2`, `1.4.O3`, `1.4.O4`.

#### 1.5 Proyecto y propuesta

¿Cómo sabe un asesor que entra a tu equipo a quién le vende y con qué precios y condiciones?

*Descripción:* Mide si el equipo sabe para quién es cada proyecto, si el mensaje y la propuesta llegan igual con cualquier asesor y, si se vende por más de un canal, si los precios y las condiciones son coherentes en todos.

*Costo de quedarse:* Cada asesor cuenta el proyecto a su manera y cotiza con su propia hoja: el cliente recibe dos precios para la misma unidad, desconfía y se va a ver otro proyecto.

**Deficiente.** Nadie puede decir con claridad para quién es el proyecto, no hay una lista de precios que todos usen y cada asesor lo cuenta a su manera: el cliente recibe precios distintos según quién lo atienda.

- Hay más de una lista de precios circulando, y no se sabe cuál es la vigente. `[1.5.D401 · comprobable]`

**Inicial.** Hay una lista de precios y un brochure, pero cada asesor arma la cotización por su cuenta.

- El líder sabe quién es el comprador objetivo de cada proyecto y hay un mensaje común, pero solo de palabra o en un borrador: cada asesor los repite a su manera. `[1.5.I1]`

**Funcional.** El comprador objetivo de cada proyecto está escrito, y todos venden con los mismos precios, las mismas condiciones y la misma propuesta.

*Resultado:* Dos clientes parecidos reciben la misma información del proyecto y una cotización igual de clara —precio, forma de pago, entrega y qué incluye—, sin importar qué asesor los atienda.

- Existe un documento con el comprador objetivo de cada proyecto —a quién va dirigido, qué busca y cómo paga—, consultable por cualquier asesor. `[1.5.F1]`
- El líder puede explicar quién es el comprador objetivo de cada proyecto sin consultar su documentación. `[1.5.F2]`
- Las cotizaciones están estandarizadas: toda propuesta de una unidad muestra lo mismo —precio, forma de pago, fecha de entrega y qué incluye—, no armada desde cero cada vez. `[1.5.F4]`
- Si la empresa vende proyectos propios, hay una sola lista de precios y condiciones vigente por proyecto, y todas las cotizaciones salen de ella. `[1.5.F401 · comprobable]`

**Eficiente.** La propuesta se distingue de la de otros proyectos y solo promete lo que se va a entregar.

*Resultado:* Los interesados ven qué distingue al proyecto de los demás: la propuesta dice lo mismo en el sitio, en las presentaciones y en boca de cada asesor, y lo que se le prometió al cliente —acabados, áreas comunes y fechas— es lo que recibe.

- Las propuestas solo prometen lo que se va a entregar: lo que se dice de acabados, áreas comunes y fechas de entrega se valida antes de decirlo. `[1.5.E3]`
- Los cambios de precio —y, si la empresa vende proyectos propios, los de avance de obra— les llegan el mismo día a todos los asesores y a todos los canales. `[1.5.E401 · comprobable · hábito]`

**Óptimo.** La IA revisa contra la información, los precios y la propuesta vigentes todo lo que se le dice a cada interesado, y el equipo valida lo que se sale.

- La IA revisa en tiempo real, contra la información, los precios y la propuesta vigentes, lo que se les dice a los interesados, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D1`, `1.5.D2`, `1.5.I2`, `1.5.I3`, `1.5.F3`, `1.5.F5`, `1.5.F6`, `1.5.E2`, `1.5.E4`.

#### 1.6 Priorización de interesados

¿Cómo decide tu equipo a qué interesados dedicarles tiempo y visitas primero?

*Descripción:* Mide si el equipo decide a qué interesados dedicar su tiempo con criterios escritos, según el comprador objetivo del proyecto.

*Costo de quedarse:* Tus asesores le dan visita a todo el que pregunta: pasan el fin de semana mostrando unidades a quien no puede pagarlas, y los compradores listos esperan su turno.

**Deficiente.** Se atiende a los interesados por orden de llegada, y se le da visita a todo el que pregunta.

- Se le da visita a todo el que pregunta, sin saber antes si puede comprar. `[1.6.D401 · evaluado]`

**Inicial.**

- El líder sabe quién es el comprador objetivo de cada proyecto, pero el CRM no tiene los campos —presupuesto, forma de pago, tipo de unidad— para separar a los interesados que encajan. `[1.6.I2]`

**Funcional.** Los interesados se separan por los rasgos del comprador objetivo —presupuesto, forma de pago, tipo de unidad— y hay una definición escrita de interesado calificado que el equipo aplica.

*Resultado:* El equipo deja de mostrarle unidades a quien no encaja con el comprador objetivo del proyecto y concentra las visitas en quien sí encaja y cumple la definición de interesado calificado, con su presupuesto, su forma de pago y su plazo de compra.

- El equipo segmenta a los interesados por los atributos del comprador objetivo antes de trabajarlos: presupuesto, forma de pago, zona, tipo de unidad o si compra para vivir o para invertir. `[1.6.F1]`
- Los rasgos del comprador objetivo —presupuesto, forma de pago, zona, tipo de unidad— son campos del CRM y de los formularios de consulta. `[1.6.F4]`

**Eficiente.** Los interesados se ordenan con un puntaje que suma varios rasgos, los segmentos de compradores prioritarios están en una lista escrita, cada segmento recibe su propio mensaje y la capacidad de pago se comprueba antes de reservar.

*Resultado:* Cada asesor sabe cada mañana a quién contactar primero, y las reservas que se firman son de quien sí puede terminar la compra.

- La capacidad de pago del interesado se comprueba antes de reservar: carta de preaprobación, comprobante de fondos o plan de pagos aceptado. `[1.6.E401 · comprobable · venta con equipo]`

**Óptimo.**

- Si en la decisión de compra participan varias personas —la pareja, la familia o los socios de una inversión—, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el asesor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3]`

*Se leen igual:* `1.6.D1`, `1.6.I1`, `1.6.F2`, `1.6.F3`, `1.6.E3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O4`, `1.6.O5`.

#### 1.7 Seguimiento de visitas y reservas

¿Qué pasa con quien visitó y no volvió a contestar, o con la reserva que no avanza hacia la firma?

*Descripción:* Mide si alguien detecta cuando un negocio o una reserva deja de avanzar y si hay un paso acordado para retomarlos a tiempo; donde el comprador vuelve a comprar, como el inversionista que suma unidades, también si se le busca cuando su próxima compra se atrasa.

*Costo de quedarse:* Los clientes se enfrían después de la visita y las reservas se vencen sin que nadie llame: la unidad queda bloqueada semanas y la venta se cae cuando ya la dabas por hecha.

**Deficiente.** El asesor está solo con sus clientes, y después de la visita nadie da seguimiento.

- No hay material de venta —brochure, planos, fotos o recorrido virtual— para mostrarles a los interesados. `[1.7.D4]`
- Las reservas se vencen sin que nadie se dé cuenta. `[1.7.D401 · comprobable]`

**Inicial.**

- Cuando un negocio se detiene —el cliente no vuelve a contestar después de la visita o de la cotización—, cada asesor decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`
- Todos los intentos de hacer avanzar un negocio se hacen por el mismo canal: el asesor solo llama, o solo escribe por WhatsApp. `[1.7.I4]`

**Funcional.** Ningún negocio se enfría en silencio después de la visita y ninguna reserva se vence sin aviso: se detectan a tiempo y hay un paso acordado para retomarlos.

*Resultado:* Los negocios que se traban se detectan a tiempo y se retoman por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Cada reserva tiene fecha, responsable y siguiente paso hasta la firma, y donde el comprador vuelve a comprar sin contrato, como el inversionista que suma unidades, la próxima compra tampoco se deja al azar.

- Hay material de venta estandarizado —brochure, planos, recorrido virtual y, si la empresa vende proyectos propios, avance de obra— que ayuda a cerrar la venta. `[1.7.F4]`
- Toda reserva tiene fecha de vencimiento y un responsable, y antes de que venza se contacta al cliente. `[1.7.F402 · comprobable · hábito · requiere 1.1.F402]`

**Eficiente.** El seguimiento es multicanal, el sistema le avisa al líder de lo que se traba y quien todavía no está listo sigue en nutrición.

*Resultado:* Ningún negocio espera a la reunión para recibir ayuda, quien todavía no está listo para comprar sigue en nutrición hasta que muestra interés o aparece una unidad para él, el cliente que ya reservó sabe cómo va su trámite, y se sabe cuánto de lo que se traba se recupera.

- Los interesados que todavía no están listos para comprar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven a un asesor cuando muestran interés o aparece una unidad que encaja con lo que buscan. `[1.7.E2]`
- Cuando un negocio o una reserva lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántos negocios estancados y cuántas reservas en riesgo se recuperan. `[1.7.E401 · comprobable]`
- Entre la reserva y la firma, el cliente recibe avances de su trámite —y, si la empresa vende proyectos propios, de la obra— sin tener que pedirlos. `[1.7.E402 · comprobable · hábito]`

**Óptimo.** La IA detecta el negocio o la reserva que se va a caer y decide el canal y el momento de cada seguimiento; el equipo valida.

*Resultado:* Los negocios y las reservas que más importan reciben ayuda justo cuando la necesitan: la IA detecta cuándo se traban y propone a quién movilizar.

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.I2`, `1.7.I3`, `1.7.F1`, `1.7.F2`, `1.7.F3`, `1.7.F6`, `1.7.F7`, `1.7.E1`, `1.7.E3`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O2`, `1.7.O3`.

#### 1.8 Ventas, pérdidas y desistimientos

¿Qué queda registrado cuando un interesado no compra o una reserva se cae?

*Descripción:* Mide si queda registrado por qué no compra un interesado o por qué se cae una reserva, y si el equipo revisa las ventas que cierra, las que pierde y las reservas caídas para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes ventas ni por qué se caen las reservas —el precio, el crédito que no salió, la fecha de entrega—: cada asesor tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Deficiente.**

- Cuando un interesado no compra o una reserva se cae, no hay una razón en la que el equipo coincida: cada asesor da su versión, de memoria. `[1.8.D1]`

**Inicial.**

- La razón por la que el interesado no compró se anota a veces y en texto libre, a criterio de cada asesor, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada negocio perdido y cada reserva caída quedan con su razón, elegida de una lista fija, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no compran los interesados y por qué se caen las reservas, con datos del trimestre y no con impresiones.

- Todo negocio creado desde la puesta en marcha del recorrido actual que se dio por perdido tiene registrada su razón. `[1.8.F1]`
- Cada reserva que se cae, porque el cliente desiste o porque se vence, deja registrada su razón: el crédito no salió, cambió de opinión o encontró otro proyecto. `[1.8.F401 · comprobable]`

**Eficiente.** Cada trimestre se revisan las ventas cerradas, las perdidas y las reservas caídas, lo aprendido cambia el proceso y el equipo se capacita con un calendario fijo.

*Resultado:* Los errores que más se repiten se corrigen y lo que hace vender se vuelve parte del proceso: lo que muestra la revisión de cada trimestre de las ventas cerradas, las perdidas y las reservas caídas cambia el proceso y la capacitación del equipo, y se sabe contra qué proyectos se pierde.

- Al menos una vez por trimestre se revisan las ventas cerradas, los negocios perdidos y las reservas caídas para encontrar lo que se repite. `[1.8.E1]`
- Cuando el cliente compró en otro proyecto, queda registrado en cuál y por qué. `[1.8.E401 · comprobable]`

**Óptimo.**

- La IA analiza las llamadas con los interesados —también las de video, como un recorrido virtual guiado— y le deja a cada asesor recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1]`

*Se leen igual:* `1.8.D2`, `1.8.F2`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.E4`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing de la inmobiliaria: cómo está montada por dentro y qué produce en presencia, interesados y visitas para cada proyecto. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que la inmobiliaria dirige.

**Deficiente.** Tus proyectos no los presentas tú: los presenta el mercado. Cada anuncio dice algo distinto, las herramientas están sueltas y sin conectar, y la pauta corre hasta agotar el presupuesto sin que nadie mida qué dejó. Los interesados llegan por accidente.

**Inicial.** Cada proyecto tiene su logo y su brochure, pero no hay una estrategia detrás. Pagas portales y herramientas que usas a medias, publicas cuando hay algo que mostrar, y los resultados de cada lanzamiento se miden tarde y a mano, sin que lo aprendido quede escrito. Llegan consultas, pero no siempre sabes de dónde vienen.

**Funcional.** Tu marketing dejó de depender de una persona. La marca y los perfiles de comprador están escritos, cada proyecto propio tiene su plan y su página, y los canales que elegiste en tu plan —portales, pauta, redes, correo o WhatsApp— salen con regularidad, coordinados bajo un mismo calendario, y anuncian solo lo que está disponible. Los datos describen la operación sin reconstruirlos a mano: sabes de dónde llega cada interesado y cuánto te cuesta en cada canal. La demanda de cada proyecto ya se mide, aunque la optimización fina todavía no existe.

**Eficiente.** Probar y ajustar ya es rutina, y lo que aprendes de un lanzamiento cambia cómo armas el siguiente. Sabes qué aportó cada canal a cada venta y cuánto te cuesta cada visita y cada reserva en cada canal y en cada proyecto, el mensaje se adapta solo a cada tipo de comprador, la IA asiste a tu equipo en su trabajo diario y tus proyectos aparecen cuando alguien busca vivienda, en buscadores y en asistentes de IA. La pauta se mueve entre canales según lo que cuesta cada interesado o cada venta, y quienes ya compraron recomiendan con un programa de referidos.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada proyecto se genera y se ajusta de forma continua; la IA adapta el mensaje a lo que hizo cada interesado y mueve la pauta entre canales dentro de los límites que fija el equipo; y los compradores satisfechos que identifica Servicio traen compradores nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma una campaña en tu equipo, desde que se decide hasta que sale en los portales y en las redes?

*Descripción:* Mide si la promoción de cada proyecto sale de un plan y un calendario compartidos, sin depender de nadie.

*Costo de quedarse:* Cada lanzamiento depende de quien lo arma: si esa persona se va, la próxima campaña —la preventa de un proyecto propio o la promoción de los inmuebles que comercializas— sale tarde o sin plan.

**Deficiente.**

- No hay calendario de campañas: cada lanzamiento y cada promoción se improvisan. `[2.1.D1]`

**Inicial.**

- Las campañas dependen de quien las arma —una persona del equipo, la agencia o quien produce los renders—: el calendario, los accesos y los pasos a seguir están en sus manos. `[2.1.I3]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y cada proyecto propio tiene su plan por etapa de venta.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la promoción de cada proyecto sigue saliendo aunque cambie una persona: el plan de cada lanzamiento y el calendario no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- El líder puede explicar qué campañas corren para cada proyecto y en qué etapa van, sin preguntarle al equipo. `[2.1.F4]`
- Si una agencia —o quien produce los renders y los videos— ejecuta todo o parte del trabajo, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia ese proveedor. `[2.1.F5]`
- Si la empresa vende proyectos propios, cada proyecto tiene su plan de marketing escrito para cada etapa de la venta —preventa, lanzamiento, venta durante la obra y últimas unidades—, con sus campañas y sus fechas. `[2.1.F401 · declarado]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F6`, `2.1.E4`, `2.1.E5`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o en la página de un proyecto, o te escribe por WhatsApp o el chat para preguntar por una unidad?

*Descripción:* Mide si las herramientas que se pagan se usan, si cada interesado que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo del marketing inmobiliario hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien deja sus datos en tu sitio o te escribe por WhatsApp para preguntar por un proyecto espera a que alguien lo cargue y le conteste, o se pierde, y si pagas herramientas, como la de recorridos virtuales, parte de lo que pagas no se usa.

**Deficiente.**

- Lo que llega por el sitio, por la página de un proyecto o por mensajes, como WhatsApp, cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`

**Inicial.**

- Se pagan licencias o módulos que el equipo no usa, como la herramienta de recorridos virtuales o un módulo del CRM que quedó sin estrenar. `[2.2.I1]`

**Funcional.**

*Resultado:* Todo lo que entra por el sitio, por la página de cada proyecto y, si se usa, por WhatsApp o el chat llega al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Si el sitio o la página de cada proyecto tienen formularios para dejar datos, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Si el equipo usa IA, esta tiene como contexto la voz de marca y los perfiles de comprador. `[2.2.F9]`

**Eficiente.**

*Resultado:* Los interesados reciben su nutrición sin que nadie la mande a mano, hasta que están listos para hablar con un asesor; la conversación con cada uno no depende de que alguien se acuerde de escribirle y, si se atiende por WhatsApp o chat, el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nutrición de varios pasos, con tiempos de espera y caminos distintos según quién es o lo que hace cada interesado, que lo acompañan mientras decide. `[2.2.E1]`
- El traspaso de interesados a los asesores es automático: cuando un interesado cumple los criterios para pasar a un asesor, le llega con su historial al asesor que corresponde, sin que nadie lo pase a mano. `[2.2.E3]`

**Óptimo.**

- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada interesado: la segmentación usa, por ejemplo, qué tan cerca de comprar está cada uno, calculado afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D1`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F10`, `2.2.F11`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.E8`, `2.2.O1`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántos interesados entran, de dónde vienen —un portal, la pauta, las redes o una feria— y cuántos llegan a una visita?

*Descripción:* Mide si los datos de marketing son confiables: de dónde llega cada interesado, en qué etapa está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de qué portal o de qué anuncio llega cada interesado ni cuántos terminan en una visita: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle.

**Deficiente.**

- No se registra de dónde llegó cada interesado: nadie sabe si vino por un portal, la pauta, una feria o un referido. `[2.3.D1]`

**Inicial.**

- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los interesados le falta el origen, como el portal o el anuncio por el que llegaron. `[2.3.I2]`

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada interesado —un portal, la pauta, las redes, una feria o un referido—, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada interesado registrado desde la puesta en marcha del sistema —entre por un formulario, WhatsApp, un portal, una feria o la sala de ventas— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los reportes básicos —cuántos interesados entran por proyecto, de dónde vienen y cuántos llegan a una visita— salen del sistema sin armarlos a mano. `[2.3.F5]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta de una unidad, no solo cuál trajo el primer clic.

**Óptimo.**

*Se leen igual:* `2.3.D2`, `2.3.I1`, `2.3.F2`, `2.3.F3`, `2.3.F6`, `2.3.F8`, `2.3.F9`, `2.3.E1`, `2.3.E2`, `2.3.E5`, `2.3.E6`, `2.3.E7`, `2.3.O1`, `2.3.O5`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los resultados de la promoción de cada proyecto?

*Descripción:* Mide si cada persona sabe qué le toca en la promoción de los proyectos, si el equipo tiene metas y si decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué se promociona en cada proyecto se decide por costumbre o por quien insiste más, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Deficiente.**

- Nadie tiene la promoción de los proyectos como responsabilidad propia: se hace en los ratos libres de quien pueda, a veces un asesor entre visita y visita. `[2.4.D1]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué anuncio publicar, qué render aprobar— espera a que lo resuelva el gerente general. `[2.4.I1]`

**Funcional.**

*Resultado:* El equipo sabe qué se espera de cada uno, lo que se decide para cada proyecto se defiende con números y no con opiniones, y la dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo.

- El líder tiene un tablero con 4 a 6 métricas clave —interesados nuevos por proyecto, de dónde llegan, cuántos pasan a un asesor y cuántos llegan a visita— y lo consulta al menos una vez por semana. `[2.4.F2]`
- Las decisiones sobre qué promocionar y en qué enfocarse —qué proyecto, qué unidades, qué tipo de comprador— citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva se integra rápido y, donde hay asesores, Marketing trabaja con reglas acordadas con Ventas y con Servicio en vez de discutir cada vez quién se hace cargo de un interesado o de un comprador.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —los proyectos, la marca y las herramientas—; no se le entrena de memoria. `[2.4.E2]`
- Las decisiones se toman con lo que deja cada canal —el margen de las unidades que vende— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide con lo que deja cada canal frente a lo que cuesta, en unidades vendidas y en margen.

*Se leen igual:* `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F3`, `2.4.F5`, `2.4.F7`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`, `2.4.O6`.

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza para publicar, como un anuncio, un render o un video?

*Descripción:* Mide si la marca y cada proyecto se ven y suenan igual en todo lo que sale, si está escrito a qué comprador le hablan y si el sitio aparece en buscadores.

*Costo de quedarse:* Cada anuncio se ve y suena distinto al anterior, tu mensaje no le habla a ningún tipo de comprador en particular y, cuando alguien busca tu marca o uno de tus proyectos, los buscadores muestran mal tu sitio, o no lo muestran.

**Deficiente.**

- No está escrito a quién le habla la inmobiliaria: no hay perfiles de comprador, como la familia que busca su primera vivienda o el inversionista. `[2.5.D2]`

**Inicial.**

- Cada proyecto tiene su logo, sus colores y su brochure, pero el perfil de comprador es uno solo y tan general que sirve para cualquiera. `[2.5.I1]`

**Funcional.** La marca, la voz y los perfiles de comprador están escritos y se usan, cada proyecto propio tiene su página, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes.

*Resultado:* La marca y cada proyecto se ven y suenan igual en todo lo que sale, cada proyecto propio tiene dónde mostrarse completo, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Si la empresa vende proyectos propios, cada proyecto en venta tiene su propia página en el sitio, con renders, planos, ubicación, áreas comunes y fecha de entrega. `[2.5.F401 · comprobable]`
- Si la empresa vende o alquila inmuebles de terceros, cada inmueble publicado tiene su ficha completa en el sitio o en los portales —fotos, plano o medidas, ubicación, precio y condiciones—. `[2.5.F402 · comprobable]`

**Eficiente.**

*Resultado:* Los proyectos aparecen cuando alguien busca vivienda en su zona, tanto en buscadores como en asistentes de IA, con contenido pensado para cada tipo de comprador que importa, y cada reseña de quienes ya compraron, buena o mala, recibe respuesta.

- Si el contenido propio se publica en el sitio, está organizado por temas —cada proyecto, cada zona, cómo comprar con crédito—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido de compra está dibujado de punta a punta, con los puntos de contacto de cada etapa: portales, redes, sala de ventas, visita y reserva. `[2.5.E4]`

**Óptimo.**

*Resultado:* La presencia de cada proyecto se mantiene vigente sin que el equipo escriba cada pieza: la IA produce y ajusta el contenido para cada tipo de comprador y cada forma de buscar, y el equipo lo aprueba.

*Se leen igual:* `2.5.D1`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E3`, `2.5.E6`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un interesado según su tipo de comprador y el proyecto que busca?

*Descripción:* Mide si cada interesado recibe un mensaje pensado para su tipo de comprador y el proyecto que busca.

*Costo de quedarse:* Le mandas la misma promoción a todos: el inversionista recibe el mensaje pensado para la familia que busca su primera casa, y ninguno de los dos se siente hablado.

**Deficiente.**

- No hay segmentos: la promoción de cada proyecto sale a toda la base con el mismo mensaje. `[2.6.D1]`

**Inicial.**

- La base se separa solo por datos generales —país, ciudad o edad—, no por lo que necesita cada tipo de comprador, como el tipo de unidad o la forma de pago. `[2.6.I1]`

**Funcional.** Los tipos de comprador están escritos, cada uno recibe piezas pensadas para él y hay criterios escritos para pasarle un interesado a un asesor.

*Resultado:* Cada tipo de comprador recibe un mensaje pensado para él, y los asesores reciben interesados que Marketing ya clasificó con criterios escritos.

- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento: no le hablan igual a la familia que busca su primera vivienda que al inversionista. `[2.6.F3]`
- Existen criterios escritos de qué es un suscriptor, un interesado y uno listo para pasar a un asesor —por ejemplo, porque pidió precios o una visita—, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre los campos que usan esos criterios. `[2.6.F4]`

**Eficiente.**

*Resultado:* El mensaje se adapta solo a quién lo recibe y a la etapa de su búsqueda, y los asesores reciben primero a los interesados con más probabilidad de comprar.

- Hay secuencias distintas por segmento o por etapa del recorrido de compra: no recibe lo mismo quien recién mira proyectos que quien ya visitó uno. `[2.6.E1]`

**Óptimo.**

*Resultado:* Cada interesado ve los proyectos y las unidades que le corresponden según lo que hizo antes, sin que nadie tenga que armar un segmento para él.

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F5`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.E6`, `2.6.E7`, `2.6.O1`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por los canales que usas, como los portales, la pauta, las redes, el correo o WhatsApp?

*Descripción:* Mide si los canales que la inmobiliaria eligió salen con regularidad y bajo un mismo plan, si anuncian solo lo que está disponible y si se conoce lo que cuesta cada interesado.

*Costo de quedarse:* Tus proyectos llegan al mercado a ratos, o no llegan, sin un plan que coordine tus canales; cuando anuncias, ofreces unidades que ya se vendieron o se alquilaron, y no sabes cuánto te cuesta cada interesado.

**Deficiente.**

- No hay un plan que diga por qué canales sale la inmobiliaria: portales, pauta, redes, vallas o ferias. `[2.7.D2]`

**Inicial.**

- La pauta en los portales y en redes, y los correos, salen cuando hay algo que promocionar —un lanzamiento, unidades nuevas—, sin presupuesto ni fechas fijados de antemano. `[2.7.I2]`

**Funcional.** Los canales que la inmobiliaria eligió salen con regularidad y bajo un mismo plan, y anuncian solo las unidades disponibles.

*Resultado:* Una campaña sale coordinada por todos los canales del plan en vez de esfuerzos sueltos, lo que se anuncia está disponible, y el líder ve cuánto le cuesta cada interesado según el canal del que venga.

- Si el canal conversacional, como WhatsApp, es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario —el lanzamiento de un proyecto, una feria, una promoción—, no solo para responder lo que entra. `[2.7.F4]`
- Los canales que la inmobiliaria eligió en su plan —portales, pauta, redes, correo o WhatsApp— siguen el mismo calendario y la misma campaña: cada lanzamiento o promoción sale coordinado en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada interesado —o cada venta, donde se compra sin asesor— el último mes, al menos por canal, como cada portal, la pauta o las redes. `[2.7.F6]`
- Los portales, la pauta y el sitio anuncian solo unidades disponibles: la que se reserva, se vende o se alquila deja de promocionarse dentro del plazo acordado. `[2.7.F401 · comprobable · hábito]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, la pauta se mueve entre canales según lo que cuesta cada interesado o cada venta, y se sabe cuánto cuesta cada visita y cada reserva.

*Resultado:* La inversión se mueve hacia el canal y el proyecto que traen visitas y reservas, los canales se refuerzan entre sí en vez de competir por el mismo interesado, y quienes ya compraron traen compradores nuevos.

- Si las ferias inmobiliarias, los eventos de lanzamiento, las jornadas de puertas abiertas o los webinars —por ejemplo, para inversionistas— son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- El presupuesto de pauta de cada proyecto se revisa al menos una vez por mes y se mueve entre canales según lo que cuesta cada interesado o cada venta en cada canal. `[2.7.E3]`
- Hay un programa de referidos activo: quienes ya compraron saben cómo recomendar el proyecto a un conocido, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- En el sistema se ve cuánto cuesta cada visita y cada reserva en cada canal y en cada proyecto, no solo cada interesado. `[2.7.E401 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más reservas trae, dentro de los límites que fija el equipo; los compradores satisfechos traen compradores nuevos, y la empresa prueba canales nuevos sin esperar a ver qué hace la competencia.

- Los compradores que Servicio identifica como promotores se vuelven un canal de referidos y de testimonios sin pedirlos a mano: el sistema los invita solo, el equipo elige qué testimonios se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`, `2.7.F1`, `2.7.F2`, `2.7.F7`, `2.7.F8`, `2.7.E5`, `2.7.E6`, `2.7.E7`, `2.7.E8`, `2.7.E9`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada lanzamiento o de cada campaña cuando termina?

*Descripción:* Mide si cada campaña se evalúa por los interesados y las reservas que trajo, y deja un aprendizaje.

*Costo de quedarse:* Repites en cada proyecto la pauta y los mensajes de siempre porque nadie anota cuáles trajeron interesados y reservas y cuáles no: cada lanzamiento empieza de cero, sin saber qué dejó el anterior.

**Deficiente.**

- No se mide qué trajo cada campaña o cada lanzamiento: solo se sabe lo que se gastó en pauta y en portales, o ni eso. `[2.8.D2]`

**Inicial.**

- Se miran clics, alcance y me gusta, no los interesados ni las ventas que trajo cada campaña de un proyecto. `[2.8.I1]`

**Funcional.**

*Resultado:* El equipo ve cómo le fue a cada campaña —los interesados o las reservas que trajo— sin armar el número a mano, y cada una deja una lección escrita para la siguiente.

- Cada campaña del calendario —un lanzamiento, una preventa o una feria, no cada publicación suelta— cierra con una revisión escrita de qué funcionó y qué no. `[2.8.F3]`
- Los resultados de cada campaña —los interesados o las reservas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

*Resultado:* El equipo sabe qué renders, mensajes y audiencias funcionan porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma el lanzamiento siguiente.

**Óptimo.**

- La IA ajusta las campañas de cada proyecto mientras corren —deja de mostrar el render o el mensaje que no funciona y le da más espacio al que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.D1`, `2.8.D3`, `2.8.I2`, `2.8.E3`, `2.8.E4`, `2.8.E5`, `2.8.O3`.

### Área 3 — Servicio

Mide el rendimiento de la posventa de la inmobiliaria, que acompaña al comprador de la firma a la entrega de su unidad y, si la empresa vende proyectos propios, durante la garantía: cómo está montada por dentro y qué produce en entregas sin pendientes, reclamos resueltos y compradores que recomiendan.

**Deficiente.** La posventa se improvisa comprador por comprador. No hay un proceso ni un sistema donde queden los casos —cada quien responde a su criterio— y los reclamos llegan al teléfono de quien vendió. Los reclamos en redes te toman por sorpresa.

**Inicial.** Lo que pasa con cada comprador lo sabe una sola persona, y eso te deja con un punto único de fallo. Hay un sistema para registrar los casos, pero pocos lo usan; cada persona de la posventa tiene sus propias respuestas guardadas y hay una forma de entregar que nadie escribió. La entrega es frágil.

**Funcional.** Tu posventa es consistente y ya no depende de una persona. Sabes qué tipos de comprador atiendes y qué espera cada uno. Cada caso —una consulta, un trámite o un reclamo de obra— entra al mismo sistema y sigue las mismas etapas, el equipo atiende con la ficha del comprador a la vista, los casos están categorizados y la entrega sigue un proceso escrito. Atiendes primero lo urgente, tienes respuestas guardadas para lo repetitivo, detectas a mano los problemas evidentes antes de que estallen y, si vendes proyectos propios, avisas cada cambio en la fecha de entrega antes de que se cumpla la anterior. Todavía no hay alertas automáticas, pero ya no esperas a que el comprador reclame.

**Eficiente.** La posventa empieza a adelantarse al problema. Tienes plazos por tipo de caso que se vigilan solos, un portal donde el comprador ve y abre sus casos, y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción, y la información del comprador se une con la de Ventas. Cada comprador sabe cómo va su compra sin tener que preguntar, ningún caso se pierde entre la obra, legal y cobros, y, donde un proyecto propio queda en condominio, el paso a su administración está acordado. La entrega deja de ser una sorpresa.

**Óptimo.** Un agente de IA resuelve los casos de los compradores a toda hora, en todos los canales donde atiende la posventa, y le pasa a una persona, con todo el contexto, los que no puede resolver. Las rutinas corren solas mientras el equipo supervisa, entrena la IA y atiende las excepciones; la mayoría de los problemas que detecta el sistema —de la entrega, de la garantía o de un trámite— se resuelven antes de que el comprador los note, y cada comprador se atiende sabiendo lo que se le prometió en la venta y recibe detalles pensados para él. Atiendes a más compradores sin que crezca el equipo de posventa.

#### 3.1 Procesos y Rutinas

¿Cómo atiende tu equipo el caso de un comprador, desde que entra hasta que se cierra?

*Descripción:* Mide si la posventa sigue un proceso y rutinas definidas, para que atender al comprador no dependa de quién sabe.

*Costo de quedarse:* La posventa depende de quien conoce cada caso: si esa persona falta, los reclamos de obra se quedan sin respuesta y los compradores lo notan de inmediato.

**Deficiente.**

- Cada persona de la posventa atiende las consultas y los reclamos a su manera. `[3.1.D1]`

**Inicial.**

- Unos atienden en el sistema; otros siguen con su WhatsApp personal. `[3.1.I3]`

**Funcional.** El equipo atiende en un mismo sistema, cada caso sigue las mismas etapas y cada comprador tiene quien responda por él.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada comprador tiene a alguien que responde por él, y un reclamo se atiende igual sin importar quién lo tome.

- El recorrido de los casos de posventa está configurado en el sistema con sus etapas y cubre la atención de cada caso —una consulta, un trámite o un reclamo de obra—, de la recepción al cierre. `[3.1.F1]`
- Hay reuniones del equipo de posventa con cadencia fija (al menos quincenal) que se sostienen. `[3.1.F3]`
- Existe un proceso escrito para escalar los reclamos graves y los casos que quien atiende no puede resolver —por ejemplo, una filtración o un defecto que impide habitar la unidad—: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cualquier persona de la posventa explica cómo se atiende un caso típico —un reclamo de obra, una consulta sobre la escritura— siguiendo el mismo flujo. `[3.1.F5]`
- Cualquier persona de la posventa atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por WhatsApp o por teléfono. `[3.1.F6]`
- Si la empresa vende proyectos propios, el proceso de garantía está escrito: qué cubre cada garantía, cuánto dura y cómo se reporta y se atiende un reclamo de obra. `[3.1.F401 · declarado]`

**Eficiente.** Aparecen los plazos por tipo de caso, el recorrido del comprador con un dueño en cada momento clave y las guías para los momentos difíciles, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso, cada momento clave de la compra —la escritura, la entrega y, si la hay, la garantía— tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de caso o prioridad: no se atiende en el mismo plazo una consulta que un reclamo que impide habitar la unidad. `[3.1.E1]`
- El recorrido del comprador está definido de punta a punta, con sus momentos clave —la firma, la escritura, la entrega y, si los hay, el avance de la obra, la garantía, una renovación o una recompra— y un responsable y un estándar para cada uno. `[3.1.E4]`
- Hay guías escritas para los momentos difíciles de la posventa: un atraso en la entrega, un reclamo de obra que se repite o una escritura que se traba. `[3.1.E401 · declarado]`

**Óptimo.**

- El sistema detecta, sin que nadie lo revise a mano, cuando el caso de un comprador se sale de las etapas o los pasos del proceso, y se lo señala a quien lo atiende y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3]`

*Se leen igual:* `3.1.D2`, `3.1.I1`, `3.1.I2`, `3.1.I4`, `3.1.F2`, `3.1.F7`, `3.1.F8`, `3.1.E3`, `3.1.E5`, `3.1.E6`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

Cuando un comprador escribe o llama, ¿cómo llega su caso al sistema y a quien lo tiene que atender?

*Descripción:* Mide si cada caso de un comprador llega solo al sistema y a quien lo atiende, y cuánto de la posventa se automatiza.

*Costo de quedarse:* Los reclamos se pierden entre el WhatsApp de quien vendió, el correo y las llamadas, y alguien tiene que repartirlos a mano: el comprador tiene que insistir para que lo atiendan.

**Deficiente.**

- Los reclamos y las consultas llegan al celular de quien vendió o al correo de cada persona. `[3.2.D2]`

**Inicial.**

- Hay un sistema de casos, pero los casos que entran se reparten a mano, o la posventa atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.**

*Resultado:* Cada consulta o reclamo que llega por los canales conectados entra al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el comprador puede ver y abrir sus casos y resolver lo simple sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

**Óptimo.**

- Un agente de IA resuelve los casos de los compradores en todos los canales donde atiende la posventa, sin que intervenga una persona, y le pasa a una persona, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de posventa: quien atiende ve en la ficha, por ejemplo, el riesgo de que un comprador desista antes de la escritura. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.F8`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué casos te llegan —reclamos, trámites, consultas—, cuántos y de qué compradores?

*Descripción:* Mide si los datos de cada comprador —su unidad y sus casos— están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que decir qué unidad compró y volver a explicar su reclamo, porque nadie ve su historia completa.

**Deficiente.**

- La información de los compradores y sus casos —la unidad que compraron, sus reclamos de obra, sus trámites— está repartida entre correos, chats, hojas o sistemas que no se conectan, y no hay un lugar donde se vea junta. `[3.3.D1]`

**Inicial.**

- Los casos están en un solo sistema, pero la ficha del comprador sale incompleta: la unidad que compró o su contrato de alquiler hay que buscarlos en otro sistema. `[3.3.I1]`

**Funcional.**

*Resultado:* El líder sabe qué tipo de reclamos y consultas llegan y cuántos, y quien atiende tiene la historia de cada comprador en segundos.

- Cualquier persona de la posventa ve el historial de casos de un comprador en menos de 10 segundos. `[3.3.F1]`
- La ficha del comprador muestra la unidad que compró y su valor, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida: por ejemplo, un reclamo de obra por humedad, por acabados o por instalaciones. `[3.3.F4]`

**Eficiente.**

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende a sus compradores, cuánto tarda cada uno en tener su unidad sin pendientes y qué tan satisfechos quedan, con la satisfacción medida y no supuesta.

- Se mide la satisfacción del comprador —con el NPS o el CSAT— con una cadencia definida, por ejemplo después de la entrega y al cerrar cada caso. `[3.3.E2]`
- Se mide cuánto tarda cada comprador en tener su unidad sin pendientes: el tiempo desde que empieza su entrega hasta que se cierra su último pendiente. `[3.3.E4]`
- La ficha del comprador muestra su plan de pagos y lo que le falta pagar para escriturar. `[3.3.E6]`

**Óptimo.** Los modelos anticipan los problemas de cada comprador antes de que los manifieste, con datos que se mantienen al día solos.

*Resultado:* La empresa sabe qué compradores están en riesgo de quedar mal con su entrega antes de que lo digan y, donde el cliente vuelve, cuáles están logrando lo que buscaban, con datos que se mantienen al día solos.

- Modelos con IA predicen lo que viene —por ejemplo, cuántos reclamos de obra van a entrar después de cada entrega y de qué tipo— y proponen qué hacer; lo que predicen se ve en los tableros de la posventa y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.D2`, `3.3.I2`, `3.3.I3`, `3.3.F5`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E5`, `3.3.E7`, `3.3.E8`, `3.3.O1`, `3.3.O2`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si la posventa va al día con los casos de los compradores?

*Descripción:* Mide si cada persona de la posventa sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien a quién le toca acompañar la escritura, hacer la entrega o atender un reclamo, y el líder se entera de los atrasos cuando el comprador ya se quejó.

**Deficiente.**

- Nadie tiene claro qué le toca: entre acompañar la escritura, hacer la entrega y atender los reclamos, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.**

- Se siguen algunos números de la posventa —casos abiertos, pendientes de entrega—, pero sin un tablero ni una cadencia fija. `[3.4.I1]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si la posventa va al día o se está atrasando.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, reclamos por proyecto, pendientes de entrega, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por los plazos de atención, el líder prepara a quien entra, acuerda con Ventas qué trae cada comprador y, si un proyecto propio queda en condominio, el traspaso a su administración está acordado por escrito.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, cada comprador llega de Ventas con lo que se le prometió y, donde un proyecto propio queda en condominio, el paso a su administración no deja al propietario sin saber a quién acudir.

- Cuando entra alguien nuevo a la posventa, hay un plan de inducción con sus pasos y materiales —los proyectos, las garantías y los sistemas—; no se le entrena de memoria. `[3.4.E2]`
- Si la empresa vende proyectos propios y el proyecto queda en condominio, el traspaso a su administración está acordado por escrito: qué se entrega, cuándo y a quién acude el propietario desde ese día para cada cosa. `[3.4.E401 · declarado]`
- El sistema calcula cuánto cuesta atender a cada tipo de comprador —la posventa y, si las hay, las garantías— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y la posventa se mide por cómo reciben su unidad los compradores.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella, y la posventa se mide por cómo reciben su unidad los compradores y por su disposición a recomendar —y, donde la relación es continua, por lo que retiene—, no solo por los casos que cierra.

- El equipo de posventa se mide por cómo reciben su unidad los compradores —entregas sin pendientes y su satisfacción— y por su disposición a recomendar, no solo por los casos que cierra. `[3.4.O401 · declarado · hábito · requiere 3.3.E2]`

*Se leen igual:* `3.4.D2`, `3.4.I2`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E1`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O2`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia de la posventa

¿En qué se apoya tu equipo para que la respuesta y la entrega no cambien según quién atienda al comprador?

*Descripción:* Mide si el equipo conoce a sus tipos de comprador y si cada comprador recibe las mismas respuestas y la misma entrega, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo reclamo se acepta o se rechaza según quién atienda, y cada entrega se hace a su manera: el comprador lo nota y se lo cuenta a sus vecinos.

**Deficiente.** No hay respuestas guardadas ni una forma común de entregar: cada persona responde y entrega a su manera.

- No hay respuestas guardadas: cada persona de la posventa escribe desde cero, a su manera, cada respuesta a un comprador. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas, pero cada persona de la posventa tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de comprador están escritos, cada unidad se entrega con un proceso definido y el equipo tiene respuestas guardadas para lo frecuente.

*Resultado:* El equipo sabe qué tipos de comprador atiende y qué espera cada uno, cada unidad se entrega con el mismo proceso y un resultado definido, y todo el equipo tiene a mano las mismas respuestas para lo frecuente.

- Hay respuestas guardadas para las preguntas frecuentes de los compradores, al alcance de todo el equipo de posventa. `[3.5.F1]`
- Existe un proceso documentado de entrega de la unidad —inspección previa, acta de entrega y lista de pendientes—, con un resultado definido que el comprador debe alcanzar al terminarlo: recibir su unidad sin pendientes abiertos. `[3.5.F2]`
- Si entró alguien nuevo a la posventa, recibió las respuestas guardadas en su capacitación inicial. `[3.5.F3]`
- Existe un documento simple con los tipos de comprador que atiende la posventa —por ejemplo, quien va a vivir la unidad y quien la compró para alquilarla—, qué necesita cada uno, qué espera del servicio y cuáles se consideran compradores clave, consultable por cualquiera del equipo. `[3.5.F4]`

**Eficiente.**

*Resultado:* El comprador reconoce la misma voz en cada respuesta, sea quien sea quien lo atienda.

- El tono y la voz de marca se aplican a las respuestas, no cada persona con su estilo. `[3.5.E2]`

**Óptimo.**

- Lo que la IA responde o escribe sola a los compradores —por ejemplo, sobre la escritura, la entrega o la garantía— sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F5`, `3.5.E3`.

#### 3.6 Priorización de compradores

¿Cómo decide tu equipo qué caso de un comprador se atiende primero?

*Descripción:* Mide si los casos se atienden según su gravedad y el tipo de comprador, y no según quién insiste más.

*Costo de quedarse:* Una filtración espera en la misma fila que una consulta sobre la escritura, y quien compró varias unidades recibe la misma atención que todos.

**Deficiente.**

- Los casos se atienden por orden de llegada o según quién los toma, sin mirar su gravedad ni quién es el comprador. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente, como una filtración, pero los casos no tienen una prioridad asignada: cada persona de la posventa decide a ojo, o se adelanta el comprador que más insiste. `[3.6.I1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero y cada tipo de comprador recibe una atención acorde, sin que quien atiende tenga que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta: una filtración va antes que una consulta. `[3.6.F1]`
- Quien atiende usa la ficha del comprador —la unidad que compró y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** La atención cambia según el momento de cada comprador y, donde el cliente vuelve, cada cliente clave tiene un responsable dedicado.

*Resultado:* La atención cambia según el momento en que está cada comprador —por escriturar, por recibir su unidad, en garantía o listo para recomendar— y, donde el cliente vuelve, cada cliente clave tiene un dueño que lo conoce.

**Óptimo.**

*Resultado:* Cada comprador recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que se le prometió al vender.

- Cada comprador se atiende con el contexto de cómo llegó —el segmento del que viene y lo que se le prometió en la venta, como los acabados, las áreas comunes y la fecha de entrega—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F4`, `3.6.F5`, `3.6.E1`, `3.6.E4`, `3.6.E5`, `3.6.O1`, `3.6.O2`.

#### 3.7 Acompañamiento del comprador

¿Cómo te enteras de que un comprador tiene un problema con su unidad o con su entrega?

*Descripción:* Mide si el comprador sabe cómo va su unidad sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera del atraso de su entrega por un vecino o por la prensa, y tú te enteras de que quedó mal cuando lo publica en redes.

**Deficiente.**

- Aunque un comprador acumule reclamos repetidos —por ejemplo, por la misma falla de su unidad— o una queja sin resolver, nadie lo contacta: los problemas se atienden cuando estallan. `[3.7.D1]`

**Inicial.**

- Cuando un comprador tiene problemas repetidos, como reclamos con su unidad, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Los reclamos que se repiten y las quejas se detectan, aunque sea a mano, los compradores clave reciben contacto antes de sus fechas críticas y, si la empresa vende proyectos propios, cada cambio en la fecha de entrega se avisa antes de que se cumpla la anterior.

*Resultado:* Los reclamos que se repiten, las quejas, las fechas críticas de los compradores clave y, si la empresa vende proyectos propios, los cambios en la fecha de entrega ya no toman al equipo por sorpresa: se actúa antes de que el problema crezca.

- Un comprador con reclamos repetidos por el mismo problema, una queja sin resolver o, si se piden calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los compradores clave —por ejemplo, quien compró varias unidades— reciben contacto antes de sus fechas críticas —la escritura, el fin de una garantía o, si la hay, una renovación—, no después. `[3.7.F2]`
- Si la empresa vende proyectos propios, cada comprador afectado por un cambio en la fecha de entrega recibe el aviso de la empresa —con la fecha nueva y la razón— antes de que se cumpla la fecha anterior. `[3.7.F401 · comprobable · hábito]`

**Eficiente.** Los problemas se ven venir, ningún caso del comprador se pierde aunque lo resuelva otra área —la obra, legal o cobros—, y el comprador recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los casos del comprador no se pierden entre la posventa, la obra, legal y cobros, cada comprador sabe cómo va su unidad antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la empresa retiene clientes que antes se perdían sin aviso.

- Si la empresa vende proyectos propios y la unidad se vende antes de terminarse, de la firma a la entrega cada comprador recibe en una cadencia fija cómo va la obra de su proyecto y la fecha de entrega vigente, sin tener que pedirlo. `[3.7.E401 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La mayoría de los problemas que detecta el sistema —de la entrega, de la garantía o de un trámite— se resuelven antes de que el comprador los note, y cada comprador siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- La mayoría de los problemas que detecta el sistema —de la entrega, de la garantía o de un trámite— se resuelven antes de que el comprador los note: el equipo valida la solución y en el sistema se ve que el comprador no tuvo que abrir un caso. `[3.7.O2]`

*Se leen igual:* `3.7.D2`, `3.7.F3`, `3.7.F4`, `3.7.E1`, `3.7.E3`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.E8`, `3.7.O3`, `3.7.O5`, `3.7.O6`.

#### 3.8 Escalabilidad de la posventa

¿Qué pasa con las preguntas que tus compradores hacen una y otra vez sobre la escritura, la entrega o la garantía?

*Descripción:* Mide si la posventa puede atender a más compradores sin crecer al mismo ritmo, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas en cada proyecto, y cada unidad que entregas suma más de esas preguntas a la fila.

**Deficiente.** Las preguntas de siempre de los compradores se responden a mano, una por una: no hay nada publicado.

- No hay ninguna respuesta publicada —ni un manual del propietario ni preguntas frecuentes— que el comprador pueda consultar por su cuenta. `[3.8.D1]`

**Inicial.**

- Hay algunas respuestas publicadas, pero sueltas: no cubren lo que más preguntan los compradores —como la escritura, la entrega o la garantía—, que se sigue respondiendo a mano. `[3.8.I2]`

**Funcional.**

*Resultado:* El comprador puede consultar por su cuenta la respuesta a las preguntas de siempre —sobre la escritura, la entrega o la garantía—, y quien atiende la posventa remite a ella en vez de volver a escribirla.

- Las diez preguntas que más repitieron los compradores en el último trimestre —o todas, si son menos—, por ejemplo cómo usar la garantía, cómo reportar un pendiente o qué documentos pide la escritura, tienen una respuesta publicada que el comprador puede consultar por su cuenta, como el manual del propietario o las preguntas frecuentes. `[3.8.F1]`

**Eficiente.** Se documenta lo que enseñan los casos, el autoservicio empieza a liberar al equipo y, si la empresa vende proyectos propios, las fallas que se repiten llegan a quien diseña y construye.

*Resultado:* La empresa puede entregar más unidades sin sumar personas en la misma proporción, porque buena parte de lo que preguntan los compradores se resuelve sin abrir un caso, y, si vende proyectos propios, lo que enseñan los reclamos llega a quien construye el próximo proyecto.

- Si la empresa vende proyectos propios, los patrones de los reclamos de garantía se comparten con quien diseña y construye, para que el próximo proyecto no repita las mismas fallas. `[3.8.E401 · declarado · hábito]`

**Óptimo.**

- La IA aplica lo que aprende de los casos de los compradores a las respuestas guardadas, a la atención de cada tipo de comprador y a los avisos que reciben sin pedirlos, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3]`

*Se leen igual:* `3.8.D2`, `3.8.I1`, `3.8.F2`, `3.8.E1`, `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O1`, `3.8.O2`, `3.8.O4`.

## Edición — Turismo

Para quien vende estancias, paquetes y experiencias al viajero: hoteles y resorts, operadores turísticos, agencias de viaje y empresas de tours y experiencias. Vende por dos vías a la vez —la reserva directa, en su sitio, por teléfono, por WhatsApp o en su mostrador, y la que llega por intermediarios, como las agencias de viaje en línea (OTAs), las agencias y los mayoristas— y con temporadas, alta y baja, que mueven sus tarifas y su ocupación. La reserva que el viajero hace solo se lee como venta sin vendedor; lo que trabaja un equipo —grupos, eventos, bodas, empresas y agencias—, como venta con equipo. Donde la empresa no tiene hospedaje, «habitación» se lee como el cupo de la experiencia o del paquete, y «estancia», como el viaje o la experiencia. Una aerolínea, una empresa de transporte o un restaurante sin hospedaje ni experiencias se miden con la escala general.

*Clave:* turismo

*Perfil habitual:* mixta · recompra.

*Criterios propios:* desde el 501.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Negocio | Reserva o cotización: la estancia, el paquete o la experiencia, de la primera consulta a la llegada del viajero |
| Prospecto | Viajero, agencia o empresa que consulta por fechas, un paquete o un grupo |
| Lead | Viajero, agencia o empresa que consulta por fechas, un paquete o un grupo |
| Pipeline | El recorrido de la reserva: consulta, cotización, reserva, pago y llegada |
| Revisión del pipeline | Reunión de reservas y ocupación |
| Vendedor | Ejecutivo de reservas o de ventas: de grupos, eventos, empresas o agencias |
| Propuesta | La cotización: tarifas, fechas, qué incluye y condiciones de pago y de cancelación |
| Material de venta | Fotos, videos, fichas de habitaciones y de experiencias, y propuestas para grupos y eventos |
| Razón de pérdida | Por qué el viajero no reservó, o por qué canceló su reserva |
| Cliente ideal | El viajero, la agencia o la empresa objetivo de cada temporada y de cada producto |
| Pronóstico | Proyección de ocupación y de ingresos por temporada |
| Cliente | El viajero o huésped, y la agencia o la empresa que reserva por él |
| Caso | Caso de servicio: una consulta, un cambio de reserva, una solicitud durante la estancia o una queja |
| Buyer persona | Perfil de viajero: quién viaja, con quién, qué busca y cómo reserva, como la familia de vacaciones o quien viaja por trabajo |
| Traspaso | El de una consulta de Marketing a reservas, o el de una reserva confirmada al equipo que recibe al viajero |

### Área 1 — Ventas

Mide el rendimiento de la venta de la empresa turística: cómo está montada por dentro y qué produce en reservas, ocupación y viajeros que vuelven. Vale igual si la reserva la hace el viajero solo, en el sitio o en una OTA, o si la trabaja un equipo de reservas o de ventas de grupos.

**Deficiente.** Tus reservas dependen de quién conteste. Las consultas llegan al teléfono o al WhatsApp de cada persona, cada canal tiene su tarifa y su disponibilidad, y te enteras de que vendiste dos veces la misma habitación cuando el viajero ya llegó.

**Inicial.** Tienes un sistema de reservas y estás en las OTAs, pero cada canal va por su cuenta. Las cotizaciones de grupos se arman a mano, las tarifas se cambian canal por canal y nadie sabe cuántas consultas se quedaron sin respuesta.

**Funcional.** Tu venta opera como una maquinaria base. Cada reserva, directa o de un intermediario, entra al sistema con su canal y su monto; la disponibilidad y las condiciones son las mismas en todos los canales y ningún cupo se vende dos veces; cada cotización de grupo tiene su responsable y su fecha, y quien ya viajó contigo recibe una invitación a volver.

**Eficiente.** La venta deja de depender del empuje de cada persona. Sabes cuánto te deja cada canal después de su comisión, las tarifas cambian por temporada con reglas escritas, compruebas que un grupo te conviene antes de bloquearle el cupo y proyectas la ocupación con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA responden, cotizan y reservan a toda hora; los modelos dicen qué consulta va a reservar y qué ofrecerle a cada viajero, y el sistema detecta la reserva de grupo que se va a caer antes de que pase.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabaja tu equipo cada cotización y cada reserva, desde la primera consulta hasta la llegada del viajero?

*Descripción:* Mide si la venta sigue un proceso escrito, de la consulta a la llegada, que no depende de quien conteste.

*Costo de quedarse:* Si se va quien lleva los grupos, se lleva las cotizaciones en su correo: nadie sabe a quién se le cotizó, qué bloqueo estaba por confirmarse ni qué condiciones se le prometieron a cada agencia.

**Deficiente.**

- Las consultas se reparten a ojo, o se las queda quien las ve primero —por ejemplo, en el teléfono o en el WhatsApp—: no hay una regla que diga a quién le toca cada una. `[1.1.D2]`
- Si se van dos personas clave —por ejemplo, quien lleva los grupos y quien atiende a las agencias—, nadie sabe en qué quedó cada cotización ni cada reserva. `[1.1.D4]`

**Inicial.**

- La reunión de reservas y ocupación se hace cuando hay tiempo, sin una fecha fija ni un orden para repasar las cotizaciones y las reservas. `[1.1.I3]`

**Funcional.** Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la llegada, con una cadencia de contacto, un proceso escrito para cotizar grupos y una revisión fija de las reservas.

*Resultado:* Si rota una persona del equipo, la siguiente sabe en qué va cada cotización, porque todos trabajan la venta igual en el CRM: las reservas avanzan con los mismos criterios, cada grupo se cotiza de la misma forma, cada consulta se contacta con la cadencia acordada y las reservas se repasan en cada reunión de reservas y ocupación.

- Cualquier persona del equipo explica igual las etapas de la reserva —consulta, cotización, reserva, pago y llegada— y qué tiene que cumplirse para avanzar. `[1.1.F1]`
- Cada tipo de venta —la reserva individual, los grupos, los eventos y las agencias o empresas— tiene su propio recorrido en el CRM, con lo que tiene que cumplir para pasar de cada etapa a la siguiente. `[1.1.F2]`
- El proceso para cotizar grupos y eventos está escrito: qué se cotiza, quién aprueba la tarifa, cuántos días vale la oferta, cuándo se pide el depósito y cuándo se libera lo que no se confirma. `[1.1.F501 · declarado · venta con equipo]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `1.1.D1`, `1.1.D3`, `1.1.I1`, `1.1.I2`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.F7`, `1.1.F8`, `1.1.E1`, `1.1.E2`, `1.1.E3`, `1.1.E5`, `1.1.E6`, `1.1.O2`, `1.1.O3`, `1.1.O4`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se hace una reserva en cualquier canal?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las consultas, registrar las reservas de todos los canales, descontar el cupo en todos a la vez y avisar qué toca— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tu equipo copia a mano las reservas de cada OTA, cambia la tarifa canal por canal y descubre que la habitación ya estaba vendida cuando el viajero ya pagó.

**Deficiente.**

- Las consultas de los viajeros viven en listas, en el WhatsApp o en la agenda de cada persona. `[1.2.D1]`

**Inicial.**

- Las reservas que llegan sin vendedor —en el motor de reservas del sitio o en una OTA— se pasan a mano al sistema, cuando alguien tiene tiempo. `[1.2.I2]`

**Funcional.** Lo básico pasa solo —las reservas de todos los canales entran al sistema, una reserva descuenta el cupo en todos a la vez, las consultas se reparten por una regla y el sistema avisa qué toca— y, si se usa IA, trabaja con los datos de cada viajero.

*Resultado:* Ninguna reserva hay que pasarla a mano y ningún cupo se vende dos veces: la reserva que llega por el sitio o por una OTA entra sola al sistema, la consulta de un grupo le llega a quien le toca, y quien vende ve qué está disponible antes de ofrecerlo.

- Las consultas que entran —del sitio, el teléfono, WhatsApp, el correo y las agencias— llegan a una bandeja o cola y se asignan por una regla simple: por turnos, por tipo de venta o según la fuente de donde llegan. `[1.2.F2]`
- Las reservas sin vendedor —en el motor de reservas del sitio, en una OTA o con un mayorista— entran solas al sistema como negocios, con su monto, su canal y sus fechas, y con su viajero cuando se identifica. `[1.2.F6]`
- Quien vende puede ver qué habitaciones o cupos están disponibles en cada fecha antes de ofrecerlos, en el CRM o en el sistema de reservas, sin preguntarle a otra persona. `[1.2.F8]`
- La disponibilidad y las tarifas de todos los canales salen de un mismo sistema, y una reserva hecha en cualquiera de ellos descuenta el cupo en todos en el momento: no se vende dos veces la misma habitación o el mismo cupo. `[1.2.F501 · comprobable]`

**Eficiente.** Las cotizaciones salen del sistema, el CRM se conecta con el sistema de reservas y el equipo usa la IA en su trabajo diario.

*Resultado:* El equipo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen las reservas y qué canal vende.

- Las cotizaciones de grupos y eventos se generan desde el sistema, con las tarifas y la disponibilidad vigentes, no como documentos sueltos. `[1.2.E1]`
- Si la empresa lleva sus reservas, su ocupación o su facturación en otro sistema —el sistema de gestión del hotel (PMS), el de su operación o un ERP—, el CRM está conectado con él. `[1.2.E3]`

**Óptimo.** La IA responde, cotiza, reserva y calcula qué consultas van a reservar; el equipo valida y se queda con los grupos y las conversaciones que deciden la venta.

- Si el equipo atiende por un canal conversacional, agentes de IA responden ahí, califican las consultas con la definición de consulta calificada y cotizan o reservan a cualquier hora; le pasan a una persona, con el contexto, a quien pide un grupo o algo que no pueden resolver, y el equipo revisa en el CRM lo que atendieron. `[1.2.O2]`

*Se leen igual:* `1.2.D2`, `1.2.I1`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O3`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus reservas antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: reservas completas, el canal de cada una y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de reservas se arma a mano cruzando el sistema de reservas con lo que manda cada OTA, y no sabes qué canal te trae viajeros ni cuánto te cuesta cada uno.

**Deficiente.**

- No se registra por qué canal llegó cada reserva —el sitio, una OTA, una agencia o un mayorista— ni quién la lleva: sacar un reporte confiable es imposible. `[1.3.D2]`

**Inicial.**

- Las reservas y las cotizaciones que se crean hoy se registran, pero a algunas les falta la fecha esperada de confirmación, el monto o el responsable. `[1.3.I3]`

**Funcional.** El reporte de reservas y cotizaciones sale del sistema, sin armarlo a mano, y dice por qué canal llegó cada una: se le puede creer.

*Resultado:* El líder ve el estado real de las reservas y de las cotizaciones cuando lo necesita, sin armar el reporte a mano, y sabe por qué canal llegó cada viajero.

- Toda reserva y toda cotización creada desde la puesta en marcha del recorrido actual tiene las fechas del viaje, la fecha esperada de confirmación, el monto y el responsable. `[1.3.F1]`
- Toda reserva creada desde la puesta en marcha del recorrido actual dice por dónde llegó el viajero: el sitio, el teléfono, WhatsApp, una OTA, una agencia, un mayorista o un referido. `[1.3.F3]`
- El reporte de reservas y cotizaciones se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4]`

**Eficiente.** Aparece una proyección de ocupación confiable, se sabe cuánto deja cada canal después de su comisión y la ficha del viajero reúne sus estancias y sus conversaciones.

*Resultado:* La empresa puede comprometer una ocupación y unos ingresos por temporada con confianza, y planear con ese número sus tarifas, su personal y sus compras.

- Hay una proyección de ocupación e ingresos que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo reservado quedó dentro de ±10% de lo proyectado. `[1.3.E1]`
- La ficha de cada viajero reúne lo comercial con su historial de conversaciones y, si la empresa lleva sus estancias o sus pagos en otro sistema, con lo que viene de él: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se sabe qué parte de las reservas llega directa y qué parte por intermediarios, y cuánto se paga de comisión en cada canal, y ese número se revisa cada mes. `[1.3.E501 · comprobable · hábito]`

**Óptimo.**

- Un modelo de IA calcula la proyección de ocupación e ingresos con la historia de las reservas; se ve en el sistema y el líder la revisa antes de comprometerla. `[1.3.O2]`

*Se leen igual:* `1.3.D1`, `1.3.D3`, `1.3.D4`, `1.3.I1`, `1.3.I2`, `1.3.F2`, `1.3.F8`, `1.3.F9`, `1.3.F10`, `1.3.E4`, `1.3.E5`, `1.3.O1`, `1.3.O3`, `1.3.O4`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, cómo va la temporada y quién del equipo necesita ayuda?

*Descripción:* Mide si cada persona del equipo tiene un rol y una meta por escrito, y si el líder sigue los números de reservas y ocupación y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al final de la temporada de que no se llenó: no vio antes qué canal se cayó ni qué cotizaciones de grupo no se cerraron.

**Deficiente.**

- El líder apaga incendios —el grupo que llega sin habitaciones, la OTA que vendió de más—: no hay métricas ni rendición de cuentas. `[1.4.D2]`

**Inicial.**

- Los reportes de cómo opera el equipo —consultas atendidas, cotizaciones, reservas y ocupación— se arman a mano. `[1.4.I2]`

**Funcional.** Cada persona tiene un rol y una meta por escrito, está claro quién atiende cada tipo de venta, el líder sigue un tablero cada semana y en la reunión de reservas cada quien rinde cuentas.

*Resultado:* Cada persona sabe qué se espera de ella y quién atiende cada grupo o cada agencia, y el líder sabe cada semana cómo va la ocupación de la temporada y quién necesita ayuda, antes de que termine el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —consultas, cotizaciones, reservas, ocupación, cancelaciones e ingreso por canal— y lo consulta al menos una vez por semana. `[1.4.F2]`
- Está escrito quién atiende cada tipo de venta —la reserva individual, los grupos, los eventos, las agencias y las empresas— y a quién le corresponde un cliente que llega por dos vías. `[1.4.F501 · declarado · venta con equipo]`

**Eficiente.**

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —los productos, las tarifas, las condiciones de cada canal y los sistemas—; no se le entrena de memoria. `[1.4.E2]`
- Las decisiones de la dirección usan números de fondo: cuánto deja cada viajero en el tiempo, cuánto margen deja cada canal después de su comisión y cuánto aporta cada persona del equipo. `[1.4.E6]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal y qué temporada dejan más margen, qué tipo de viajero vuelve más y qué persona del equipo aporta más.

*Se leen igual:* `1.4.D1`, `1.4.I1`, `1.4.F3`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E3`, `1.4.E4`, `1.4.E5`, `1.4.O2`, `1.4.O3`, `1.4.O4`.

#### 1.5 Oferta y tarifas

¿Cómo sabe una persona que entra a tu equipo qué vende, a quién y con qué tarifas y condiciones?

*Descripción:* Mide si el equipo sabe para quién es cada producto, si la cotización llega igual con cualquier persona y si las tarifas y las condiciones son coherentes en todos los canales: el sitio, el teléfono, las OTAs y las agencias.

*Costo de quedarse:* El viajero ve una tarifa en tu sitio, otra en una OTA y una tercera por WhatsApp, desconfía y reserva donde tu empresa paga comisión, o en otro lado.

**Deficiente.** Nadie puede decir con claridad para quién es cada producto, las tarifas cambian según quién conteste o en qué canal se mire, y las condiciones de cancelación se explican de memoria.

- Hay más de una tarifa circulando para la misma fecha y el mismo producto, y no se sabe cuál es la vigente. `[1.5.D501 · comprobable]`

**Inicial.**

- Hay una plantilla de cotización —por ejemplo, la de grupos y eventos—, pero cada ejecutivo de reservas o de ventas la cambia o la usa a su manera. `[1.5.I2]`

**Funcional.** El viajero objetivo de cada producto está escrito, y todos venden con las mismas tarifas, las mismas condiciones y la misma cotización, en todos los canales.

*Resultado:* Dos viajeros parecidos reciben la misma tarifa y las mismas condiciones, pregunten por el canal que pregunten, y una cotización de grupo igual de clara —fechas, qué incluye, cómo se paga y qué pasa si se cancela—, sin importar quién la arme.

- Existe un documento con el viajero objetivo de cada producto —a quién va dirigido, qué busca y en qué temporada viaja—, consultable por cualquier persona del equipo. `[1.5.F1]`
- Las cotizaciones de grupos y eventos están estandarizadas: toda cotización muestra lo mismo —fechas, tarifas, qué incluye, cómo se paga y la política de cancelación—, no armada desde cero cada vez. `[1.5.F4]`
- Si se vende por más de un canal —el sitio, el teléfono, las OTAs y las agencias—, las tarifas, las promociones y las condiciones son las mismas en todos, o la diferencia es a propósito y está escrita, como la tarifa neta de un mayorista. `[1.5.F5]`
- Las condiciones de cada tarifa —qué incluye, la política de cancelación y de cambios, el depósito y los cargos que se suman— están escritas y el viajero las ve antes de reservar, en cualquier canal. `[1.5.F501 · comprobable]`

**Eficiente.** La oferta se distingue de la de otros destinos y otros lugares, las tarifas siguen la temporada con reglas escritas y solo se promete lo que se va a entregar.

*Resultado:* Los viajeros ven qué distingue a la empresa, lo que se les prometió —la habitación, la experiencia, lo que incluye— es lo que reciben, y las tarifas siguen la demanda de cada temporada en todos los canales a la vez.

- Las cotizaciones solo prometen lo que la operación puede entregar: lo que se dice de la habitación, los servicios, los horarios y lo que incluye un paquete se valida antes de enviarlas. `[1.5.E3]`
- Las tarifas cambian por temporada y por demanda con reglas escritas —cuándo suben, cuándo bajan, cuándo se abre o se cierra una oferta—, y cada cambio llega el mismo día a todos los canales. `[1.5.E501 · comprobable · hábito]`

**Óptimo.**

- La IA revisa en tiempo real, contra las tarifas, las condiciones y la oferta vigentes, lo que se les dice a los viajeros, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D1`, `1.5.D2`, `1.5.I1`, `1.5.I3`, `1.5.F2`, `1.5.F3`, `1.5.F6`, `1.5.E2`, `1.5.E4`.

#### 1.6 Priorización de consultas

¿Cómo decide tu equipo a qué consultas dedicarles tiempo primero, entre la reserva de un viajero, un grupo, un evento o una agencia?

*Descripción:* Mide si el equipo decide a qué consultas dedicar su tiempo con criterios escritos, según el viajero objetivo y lo que deja cada venta en cada temporada.

*Costo de quedarse:* Tu equipo le dedica la misma tarde a quien pregunta por una noche que a la empresa que busca un evento, y le da el cupo de temporada alta a un grupo con tarifa de temporada baja.

**Deficiente.**

- No hay criterios para distinguir una consulta buena de una mala: se pierde tiempo cotizando a quien nunca va a reservar. `[1.6.D1]`

**Inicial.**

- El líder sabe cuál es el viajero objetivo de cada temporada, pero el CRM no tiene los campos —fechas, cantidad de personas, motivo del viaje— para separar las consultas que encajan. `[1.6.I2]`

**Funcional.** Las consultas se separan por los rasgos del viajero objetivo y hay una definición escrita de consulta calificada que el equipo aplica.

*Resultado:* El equipo deja de perder tiempo cotizando a quien no encaja y concentra el esfuerzo en los grupos, los eventos y los viajeros que sí encajan y cumplen la definición de consulta calificada.

- El equipo segmenta las consultas por los atributos del viajero objetivo antes de trabajarlas: las fechas, la cantidad de personas, el presupuesto, el motivo del viaje o si es una empresa o una agencia. `[1.6.F1]`
- Los rasgos del viajero objetivo —fechas, cantidad de personas, motivo del viaje y presupuesto— son campos del CRM y de los formularios de consulta. `[1.6.F4]`
- Las consultas que el viajero puede resolver solo —una reserva individual con fechas y cupo— se llevan al motor de reservas, y el equipo dedica su tiempo a los grupos, los eventos, las agencias y las empresas. `[1.6.F501 · evaluado · venta con equipo]`

**Eficiente.**

- Antes de confirmar un grupo o un evento en fechas de alta demanda, se compara lo que deja con lo que dejarían esos mismos cupos vendidos por separado, y queda registrado en la cotización. `[1.6.E501 · comprobable · venta con equipo]`
- A quien ya reservó se le ofrece, antes de llegar, lo que puede sumar —un traslado, una experiencia, una mejor habitación— según lo que reservó, y se mide cuánto se suma. `[1.6.E502 · comprobable]`

**Óptimo.**

- La IA decide qué mostrarle a cada viajero en el sitio y el motor de reservas, aunque no haya dejado sus datos —destinos, fechas y tarifas, según lo que buscó—, dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa. `[1.6.O501 · comprobable · tráfico suficiente]`

*Se leen igual:* `1.6.I1`, `1.6.F2`, `1.6.F3`, `1.6.E3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O3`, `1.6.O4`, `1.6.O5`.

#### 1.7 Seguimiento de cotizaciones y reservas

¿Qué pasa con la cotización que nadie contesta, la reserva que no se paga o el grupo que no confirma su lista?

*Descripción:* Mide si alguien detecta cuando una cotización o una reserva deja de avanzar —la cotización sin respuesta, la reserva sin pago, el bloqueo de un grupo que no se confirma— y si hay un paso acordado para retomarlas antes de que se pierdan; donde el viajero vuelve, también si se le busca cuando ya le toca volver.

*Costo de quedarse:* Las cotizaciones se enfrían sin que nadie llame y los bloqueos de grupo ocupan cupo hasta el último día: cuando se liberan, ya no hay tiempo de venderlos.

**Deficiente.** Las cotizaciones se envían y nadie vuelve a llamar, y las reservas sin pago y los bloqueos de grupo se vencen sin que nadie lo note.

- No hay material de venta —fotos, videos, fichas de habitaciones y de experiencias, propuestas para grupos— para mostrarles a los interesados. `[1.7.D4]`
- Las reservas sin pago y los bloqueos de grupo se vencen sin que nadie se dé cuenta, o siguen ocupando cupo después de su fecha. `[1.7.D501 · comprobable]`

**Inicial.**

- Cuando una cotización no se contesta o una reserva no se paga, cada persona del equipo decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`

**Funcional.** Ninguna cotización se enfría en silencio y ningún bloqueo se vence sin aviso: se detectan antes de que se pierdan y hay un paso acordado para retomarlos.

*Resultado:* Las cotizaciones que se traban se detectan y se retoman por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Cada bloqueo de grupo tiene sus fechas y su responsable hasta que se confirma o se libera, y quien ya viajó con la empresa recibe la invitación a volver cuando le toca.

- Hay material de venta estandarizado —fotos, videos, fichas de habitaciones y de experiencias, propuestas para grupos y eventos— que ayuda a cerrar la venta. `[1.7.F4]`
- Toda cotización enviada tiene una fecha de vencimiento y un responsable, y antes de que venza se contacta al cliente. `[1.7.F501 · comprobable · hábito · venta con equipo]`
- Cada bloqueo de cupos para un grupo tiene escritas sus fechas de corte —cuándo se confirma la lista, cuándo se paga y cuándo se libera lo que no se usa—, y antes de cada una se contacta al cliente. `[1.7.F502 · comprobable · hábito · venta con equipo · requiere 1.1.F501]`
- Las búsquedas y las reservas que el viajero deja a medias en el sitio o el motor de reservas reciben un recordatorio automático, por al menos dos canales, dentro del plazo acordado. `[1.7.F503 · comprobable · hábito · venta sin vendedor]`

**Eficiente.**

- Los viajeros y las empresas que todavía no están listos para reservar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven a una persona del equipo cuando muestran interés o se abre una fecha que les sirve. `[1.7.E2]`
- Se mide cuántas cotizaciones vencidas, cuántas reservas sin pago y cuántos bloqueos en riesgo se recuperan. `[1.7.E501 · comprobable]`

**Óptimo.**

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.I2`, `1.7.I3`, `1.7.I4`, `1.7.F1`, `1.7.F2`, `1.7.F3`, `1.7.F6`, `1.7.F7`, `1.7.E1`, `1.7.E3`, `1.7.E4`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O2`, `1.7.O3`.

#### 1.8 Reservas ganadas, perdidas y canceladas

¿Qué queda registrado cuando un viajero no reserva o cancela su reserva?

*Descripción:* Mide si queda registrado por qué no reserva un viajero o por qué se cancela una reserva, y si el equipo revisa lo que gana, lo que pierde y lo que se cancela para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes reservas ni por qué se cancelan —la tarifa, las fechas, una OTA más barata, la política de cancelación—: cada quien tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Deficiente.**

- Las cotizaciones que no terminan en reserva se cierran sin anotar por qué el viajero no reservó. `[1.8.D2]`

**Inicial.**

- Por qué no reservó el viajero se anota a veces y en texto libre —«estaba caro», «eligió otras fechas»—, a criterio de cada persona, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada cotización perdida y cada reserva cancelada quedan con su razón, elegida de una lista fija, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no reservan los viajeros y por qué se cancelan las reservas, con datos del trimestre y no con impresiones.

- Toda cotización o reserva creada desde la puesta en marcha del recorrido actual que se dio por perdida tiene registrada su razón. `[1.8.F1]`
- Cada reserva que se cancela —por el viajero, por la agencia o por falta de pago— deja registrada su razón, y la que no se presenta queda marcada como tal. `[1.8.F501 · comprobable]`

**Eficiente.**

- Al menos una vez por trimestre se revisan las reservas ganadas, las cotizaciones perdidas y las reservas canceladas para encontrar lo que se repite. `[1.8.E1]`
- Se mide cuántas reservas se cancelan y cuántas no se presentan, por canal y por temporada, y la política de cancelación y de depósitos se revisa con ese dato. `[1.8.E501 · comprobable · hábito]`

**Óptimo.**

- La IA analiza las llamadas con los viajeros, las agencias y las empresas —también las de video— y le deja a cada ejecutivo de reservas o de ventas recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1]`

*Se leen igual:* `1.8.D1`, `1.8.F2`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.E4`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing de la empresa turística: cómo está montada por dentro y qué produce en presencia, consultas y reservas directas en cada temporada. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que la empresa dirige.

**Deficiente.** A tu empresa la presentan otros. Las OTAs y los sitios de reseñas la cuentan a su manera, cada anuncio dice algo distinto y la pauta sale cuando hay habitaciones vacías, sin que nadie mida qué dejó. Las reservas directas llegan por accidente.

**Inicial.** Tienes logo, fotos y redes, pero no hay una estrategia detrás. Publicas cuando se acerca una temporada, respondes las reseñas cuando alguien se acuerda y los resultados de cada campaña se miden tarde y a mano. Llegan consultas, pero no siempre sabes de dónde vienen.

**Funcional.** Tu marketing dejó de depender de una persona. La marca y los perfiles de viajero están escritos, cada temporada tiene su campaña planeada, tus perfiles en Google, en los sitios de reseñas y en las OTAs dicen lo mismo que tu sitio, y los canales que elegiste en tu plan salen con regularidad, coordinados bajo un mismo calendario. Sabes de dónde llega cada consulta y cuánto te cuesta en cada canal.

**Eficiente.** Probar y ajustar ya es rutina, y lo que aprendes de una temporada cambia cómo armas la siguiente. Sabes qué aportó cada canal a cada reserva y cuánto te cuesta una reserva directa frente a la comisión de una OTA, el mensaje se adapta solo a cada tipo de viajero, la IA asiste a tu equipo en su trabajo diario y tu empresa aparece cuando alguien busca dónde quedarse o qué hacer, en buscadores y en asistentes de IA. Cada reseña recibe respuesta y quienes ya viajaron recomiendan con un programa de referidos.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada temporada se genera y se ajusta de forma continua; la IA adapta el mensaje a lo que hizo cada viajero y mueve la pauta entre canales dentro de los límites que fija el equipo; y los viajeros satisfechos que identifica Servicio traen viajeros nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma una campaña en tu equipo, desde que se decide hasta que sale en tus canales y en las OTAs?

*Descripción:* Mide si la promoción de cada temporada sale de un plan y un calendario compartidos, sin depender de nadie.

*Costo de quedarse:* Cada temporada depende de quien la arma: si esa persona se va, la campaña de temporada alta sale tarde, cuando los viajeros ya reservaron en otro lado.

**Deficiente.**

- No hay calendario de campañas: cada temporada y cada promoción se improvisan cuando ya se ven las habitaciones vacías. `[2.1.D1]`

**Inicial.**

- Las campañas dependen de quien las arma —una persona del equipo o la agencia—: el calendario, los accesos, como los de las redes y los perfiles en las OTAs, y los pasos a seguir están en sus manos. `[2.1.I3]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y cada temporada tiene su campaña planeada con anticipación.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la promoción de cada temporada sigue saliendo aunque cambie una persona: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- Existe un calendario de campañas visible para el equipo con horizonte de al menos un trimestre, que sigue las temporadas del negocio. `[2.1.F1]`
- Si una agencia —o quien produce las fotos y los videos— ejecuta todo o parte del trabajo, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia ese proveedor. `[2.1.F5]`
- Cada temporada alta y baja, y cada fecha que mueve viajeros —feriados, vacaciones escolares, eventos de la zona—, tiene su campaña planeada con al menos la anticipación con que reservan sus viajeros. `[2.1.F501 · declarado]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F6`, `2.1.E4`, `2.1.E5`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o te escribe por WhatsApp o el chat para preguntar por fechas?

*Descripción:* Mide si las herramientas que se pagan se usan, si cada viajero que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien te escribe por WhatsApp para preguntar por fechas espera a que alguien le conteste, o reserva en una OTA mientras tanto, y si pagas herramientas, parte de lo que pagas no se usa.

**Deficiente.**

- Lo que llega por el sitio, el WhatsApp o el chat —la consulta por fechas, la pregunta por una tarifa— cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`

**Inicial.**

- Algunos formularios del sitio —el de consultas, el de grupos o el de eventos— no están conectados al sistema, o ninguno de los canales conversacionales por los que se atiende, como WhatsApp, lo está: lo que entra por ahí se pasa a mano o se pierde. `[2.2.I2]`

**Funcional.**

*Resultado:* Todo lo que entra por el sitio y, si se usa, por WhatsApp o el chat llega al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Si el equipo usa IA, esta tiene como contexto la voz de marca y los perfiles de viajero. `[2.2.F9]`

**Eficiente.**

- Hay secuencias de nutrición de varios pasos, con tiempos de espera y caminos distintos según quién es o lo que hace cada viajero, que lo acompañan desde que mira fechas hasta que reserva. `[2.2.E1]`

**Óptimo.**

*Se leen igual:* `2.2.D1`, `2.2.D3`, `2.2.I1`, `2.2.I3`, `2.2.F2`, `2.2.F3`, `2.2.F4`, `2.2.F5`, `2.2.F10`, `2.2.F11`, `2.2.E2`, `2.2.E3`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.E8`, `2.2.O1`, `2.2.O3`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántas consultas entran, de dónde vienen y cuántas terminan en una reserva directa?

*Descripción:* Mide si los datos de marketing son confiables: de dónde llega cada viajero, en qué etapa está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes qué campaña te trajo cada reserva directa ni cuántas consultas terminan reservando en una OTA: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle.

**Deficiente.**

- No se registra de dónde llegó cada viajero: nadie sabe si vino por el sitio, una feria de turismo, una OTA o una recomendación. `[2.3.D1]`

**Inicial.**

- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de las consultas le falta el origen. `[2.3.I2]`

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada viajero —la pauta, las redes, un buscador, una feria o un referido— y cuántas consultas terminan en una reserva, con reportes que salen del sistema.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, una conversación, el motor de reservas, una OTA o una feria— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los reportes básicos —cuántas consultas entran, de dónde vienen y cuántas terminan en una reserva— salen del sistema sin armarlos a mano. `[2.3.F5]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `2.3.D2`, `2.3.I1`, `2.3.F2`, `2.3.F3`, `2.3.F6`, `2.3.F8`, `2.3.F9`, `2.3.E1`, `2.3.E2`, `2.3.E5`, `2.3.E6`, `2.3.E7`, `2.3.O1`, `2.3.O5`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por las consultas y las reservas directas de cada temporada?

*Descripción:* Mide si cada persona sabe qué le toca en la promoción de cada temporada, si el equipo tiene metas y si decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué se promociona en cada temporada se decide por costumbre o por quien insiste más, y nadie responde por una meta de reservas directas: el equipo no sabe qué se espera de él.

**Deficiente.**

- Qué hacer —como qué promocionar en cada temporada— se decide sobre la marcha, sin metas ni números. `[2.4.D2]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué publicar, qué foto subir a una OTA, qué pieza aprobar— espera a que lo resuelva la dirección general. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —consultas nuevas, de dónde llegan, cuántas terminan en una reserva directa y cuánto cuesta cada una— y lo consulta al menos una vez por semana. `[2.4.F2]`
- Las decisiones sobre qué promocionar y en qué enfocarse —qué temporada, qué producto, qué tipo de viajero— citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —el valor de los viajeros que trae y cuántos vuelven— frente a lo que cuesta, también frente a la comisión de las OTAs. `[2.4.E8]`

**Óptimo.**

*Se leen igual:* `2.4.D1`, `2.4.D3`, `2.4.I2`, `2.4.F3`, `2.4.F5`, `2.4.F7`, `2.4.E2`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`, `2.4.O6`.

#### 2.5 Marca y reputación

¿Qué guía a tu equipo cuando arma una pieza para publicar, y qué encuentra un viajero cuando busca tu empresa en Google, en los sitios de reseñas o en una OTA?

*Descripción:* Mide si la marca se ve y suena igual en todo lo que sale, si está escrito a qué viajero le habla, si el sitio aparece en buscadores y si los perfiles en los sitios de reseñas y en las OTAs dicen lo mismo que el sitio propio.

*Costo de quedarse:* El viajero encuentra fotos viejas en una OTA, otra descripción en Google y reseñas sin respuesta, y elige el lugar de al lado.

**Deficiente.**

- No está escrito a quién le habla la empresa: no hay perfiles de viajero. `[2.5.D2]`

**Inicial.**

- Hay logo, colores y plantillas, pero el perfil de viajero es uno solo y tan general que sirve para cualquiera: «el turista». `[2.5.I1]`

**Funcional.** La marca, la voz y los perfiles de viajero están escritos y se usan, el sitio cumple lo básico para buscadores, los perfiles en los sitios de reseñas y en las OTAs están al día, y se publica contenido propio cada mes.

*Resultado:* La marca se ve y suena igual en todo lo que sale, el viajero encuentra la misma información en tu sitio, en Google y en las OTAs, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Los perfiles de la empresa en los sitios donde los viajeros eligen —Google, los sitios de reseñas y las OTAs donde vende— tienen las mismas fotos, la misma descripción y las mismas condiciones que el sitio propio, y se revisan antes de cada temporada. `[2.5.F501 · comprobable · hábito]`

**Eficiente.**

*Resultado:* La empresa aparece cuando alguien busca dónde quedarse o qué hacer en su destino, tanto en buscadores como en asistentes de IA, con contenido pensado para cada tipo de viajero que importa, y cada reseña de quienes ya viajaron, buena o mala, recibe respuesta.

- El recorrido de compra está dibujado de punta a punta, con los puntos de contacto de cada etapa: la búsqueda del destino, las OTAs, el sitio, las reseñas, la reserva y la llegada. `[2.5.E4]`

**Óptimo.**

*Se leen igual:* `2.5.D1`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E2`, `2.5.E3`, `2.5.E6`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un viajero según su tipo de viaje y la temporada en que viaja?

*Descripción:* Mide si cada viajero recibe un mensaje pensado para su tipo de viaje, y no la misma promoción que todos.

*Costo de quedarse:* Le mandas la misma promoción a todos: la familia recibe la oferta pensada para el evento de una empresa, y ninguno de los dos se siente hablado.

**Deficiente.**

- No hay segmentos: las campañas, como la promoción de cada temporada, salen a toda la base con el mismo mensaje. `[2.6.D1]`

**Inicial.**

- La base se separa solo por datos generales —país, ciudad o edad—, no por cómo viaja cada grupo ni qué busca. `[2.6.I1]`

**Funcional.**

- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento: no le hablan igual a la familia de vacaciones que a quien viaja por trabajo. `[2.6.F3]`

**Eficiente.**

**Óptimo.**

- La IA predice qué viajero va a reservar y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada viajero se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F4`, `2.6.F5`, `2.6.E1`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.E6`, `2.6.E7`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por los canales que usas, y cómo conviven con lo que vendes por las OTAs?

*Descripción:* Mide si los canales que la empresa eligió salen con regularidad y bajo un mismo plan, y si se conoce lo que cuesta cada reserva directa frente a lo que se paga de comisión.

*Costo de quedarse:* Llegas al mercado solo cuando ves habitaciones vacías, sin un plan que coordine tus canales, y no sabes si una reserva directa te cuesta más o menos que la comisión de una OTA.

**Deficiente.**

- No hay un plan que diga por qué canales sale la empresa a buscar viajeros. `[2.7.D2]`

**Inicial.**

- La pauta y los correos salen cuando hay algo que promocionar —por ejemplo, habitaciones vacías que llenar—, sin presupuesto ni fechas fijados de antemano. `[2.7.I2]`

**Funcional.**

- Los canales que la empresa eligió en su plan siguen el mismo calendario y la misma campaña: cada temporada o promoción sale coordinada en todos ellos, también en lo que se publica en las OTAs, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada consulta —o cada reserva, donde se reserva sin vendedor— el último mes, al menos por canal. `[2.7.F6]`

**Eficiente.**

- Si las ferias de turismo, los viajes de familiarización con agencias o los eventos son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- Hay un programa de referidos activo: quienes ya viajaron saben cómo recomendar a un conocido, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- En el sistema se ve cuánto cuesta cada reserva directa frente a lo que se paga de comisión por una reserva de intermediario, y el presupuesto de pauta se revisa con ese dato. `[2.7.E501 · comprobable · requiere 2.7.F6]`

**Óptimo.**

- Los viajeros que Servicio identifica como promotores se vuelven un canal de referidos y de historias de viaje sin pedirlas a mano: el sistema los invita solo, el equipo elige qué historias se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.F7`, `2.7.F8`, `2.7.E3`, `2.7.E5`, `2.7.E6`, `2.7.E7`, `2.7.E8`, `2.7.E9`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada temporada y de cada campaña cuando termina?

*Descripción:* Mide si cada campaña se evalúa por las consultas y las reservas que trajo, y deja un aprendizaje para la temporada siguiente.

*Costo de quedarse:* Repites cada temporada la pauta y los mensajes de siempre porque nadie anota cuáles trajeron reservas: cada temporada empieza de cero.

**Deficiente.**

- No se mide qué trajo cada campaña, como la de cada temporada: solo se sabe lo que se gastó, o ni eso. `[2.8.D2]`

**Inicial.**

- Se miran clics, alcance y me gusta, no las consultas ni las reservas que trajo cada campaña. `[2.8.I1]`

**Funcional.**

- Cada campaña del calendario —una temporada, una promoción o una feria, no cada publicación suelta— cierra con una revisión escrita de qué funcionó y qué no. `[2.8.F3]`
- Los resultados de cada campaña —las consultas o las reservas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

**Óptimo.**

- La IA ajusta las campañas mientras corren —deja de mostrar la versión del anuncio que no funciona, con otra foto, otro destino u otra oferta, y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.D1`, `2.8.D3`, `2.8.I2`, `2.8.E3`, `2.8.E4`, `2.8.E5`, `2.8.O3`.

### Área 3 — Servicio

Mide el rendimiento del servicio de la empresa turística, que acompaña al viajero desde que reserva hasta después de su viaje: lo que necesita antes de llegar, sus solicitudes durante la estancia o la experiencia, sus quejas y lo que lo hace volver. Mira cómo está montado por dentro y qué produce en viajeros bien atendidos, quejas resueltas antes de que se vayan y viajeros que recomiendan.

**Deficiente.** El servicio se improvisa viajero por viajero. Las solicitudes llegan a la recepción, al WhatsApp de alguien o al guía de turno y no quedan en ningún lado, y de las quejas te enteras cuando ya están publicadas en una reseña.

**Inicial.** Lo que pasa con cada viajero lo sabe la persona que lo atendió. Hay un sistema para registrar los casos, pero pocos lo usan; cada turno tiene sus propias respuestas y una forma de recibir al viajero que nadie escribió.

**Funcional.** Tu servicio es consistente y ya no depende de quién esté de turno. Sabes qué tipos de viajero atiendes y qué espera cada uno. Cada caso —una consulta, un cambio de reserva, una solicitud o una queja— entra al mismo sistema y sigue las mismas etapas; la llegada sigue un proceso escrito, atiendes primero lo urgente, tienes respuestas guardadas para lo repetitivo y atiendes cada queja antes de que el viajero se vaya.

**Eficiente.** El servicio empieza a adelantarse al viajero. Tienes plazos por tipo de caso que se vigilan solos, el viajero resuelve solo lo más común antes y durante su viaje, y la IA asiste a tu equipo en su trabajo diario; mides tiempos de respuesta y satisfacción. Ningún caso se pierde entre la recepción, limpieza, mantenimiento o el operador de una experiencia, y el viajero recibe lo que necesita saber antes de pedirlo.

**Óptimo.** Un agente de IA resuelve las consultas de los viajeros a toda hora, en todos los canales donde atiendes, y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa y atiende las excepciones; casi todos los problemas que detecta el sistema se resuelven antes de que el viajero los note, y cada viajero se atiende sabiendo lo que reservó y lo que prefiere, y recibe detalles pensados para él.

#### 3.1 Procesos y Rutinas

¿Cómo se atiende en tu equipo una solicitud o una queja de un viajero, desde que entra hasta que se cierra?

*Descripción:* Mide si la atención al viajero sigue un proceso y rutinas definidas, para que no dependa de quién esté de turno.

*Costo de quedarse:* El servicio depende de quién esté de turno: si esa persona no está, la solicitud se pierde entre turnos y el viajero tiene que pedirla dos veces.

**Deficiente.**

- Cada persona de la recepción o de reservas atiende las solicitudes de los viajeros a su manera. `[3.1.D1]`

**Inicial.**

- Unos atienden en el sistema; otros —el guía de turno, la recepción de noche— siguen con su WhatsApp o su teléfono personal. `[3.1.I3]`

**Funcional.**

- El recorrido de los casos de servicio está configurado en el sistema con sus etapas y cubre la atención de cada caso —una consulta, un cambio de reserva, una solicitud durante la estancia o una queja—, de la recepción al cierre. `[3.1.F1]`
- Existe un proceso escrito para escalar las quejas graves y los casos que quien atiende no puede resolver —por ejemplo, un viajero que se queda sin habitación al llegar o un traslado que no llega—: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cualquier persona que atiende al viajero —en la recepción, en reservas o en la operación de una experiencia— trabaja en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por WhatsApp o de palabra. `[3.1.F6]`
- Cada cambio de turno deja registrado qué casos siguen abiertos y qué se le prometió a cada viajero, y el turno siguiente los toma desde el sistema. `[3.1.F501 · comprobable · hábito]`

**Eficiente.**

- El recorrido del viajero está definido de punta a punta, con sus momentos clave —la confirmación, la llegada, la estancia o la experiencia, la salida y, si vuelve, su próxima reserva— y un responsable y un estándar para cada uno. `[3.1.E4]`
- Hay guías escritas para lo que más se complica en la operación —una reserva que no tiene cupo al llegar, un traslado que no llega o una experiencia que se cancela por el clima—: qué se le ofrece al viajero y quién lo decide. `[3.1.E501 · declarado]`

**Óptimo.**

*Se leen igual:* `3.1.D2`, `3.1.I1`, `3.1.I2`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F5`, `3.1.F7`, `3.1.F8`, `3.1.E1`, `3.1.E3`, `3.1.E5`, `3.1.E6`, `3.1.O3`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega una solicitud del viajero al sistema y a quien la tiene que resolver, sea antes de llegar o durante su estancia?

*Descripción:* Mide si cada caso del viajero llega solo al sistema y a quien lo atiende, y cuánto del servicio se automatiza.

*Costo de quedarse:* Las solicitudes se pierden entre el teléfono de la recepción, el WhatsApp del guía y el correo de reservas, y el viajero tiene que insistir para que lo atiendan.

**Deficiente.**

- Las solicitudes de los viajeros se manejan en el celular del guía, el WhatsApp personal de quien está de turno o el correo de cada persona. `[3.2.D2]`

**Inicial.**

- Hay un sistema de casos, pero lo que entra se reparte a mano entre la recepción, limpieza y mantenimiento, o el equipo atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.**

**Eficiente.**

- El viajero puede hacer solo lo más común antes y durante su viaje —registrarse antes de llegar, cambiar su hora de llegada, pedir un traslado o reservar una experiencia— sin esperar a una persona. `[3.2.E501 · comprobable]`

**Óptimo.**

- Un agente de IA resuelve las solicitudes de los viajeros —la hora de registro, un traslado, cómo llegar— en todos los canales donde atiende el equipo, sin que intervenga una persona, y le pasa a una persona, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`

*Se leen igual:* `3.2.D1`, `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.F8`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O4`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué solicitudes y quejas te llegan, cuántas y de qué viajeros?

*Descripción:* Mide si los datos de cada viajero —sus reservas, sus estancias y sus casos— están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el viajero escribe tiene que repetir su número de reserva y volver a explicar lo que pidió, porque nadie ve su historia completa.

**Deficiente.**

- La información de los viajeros y sus solicitudes está repartida entre el sistema de reservas, los correos, los chats y las hojas de la recepción, que no se conectan, y no hay un lugar donde se vea junta. `[3.3.D1]`

**Inicial.**

- Los casos están en un solo sistema, pero la ficha del viajero sale incompleta: lo que reservó —sus fechas, su habitación o su experiencia— hay que buscarlo en el sistema de reservas. `[3.3.I1]`

**Funcional.**

- La ficha del viajero muestra lo que reservó —sus fechas, su habitación o su experiencia— y su valor, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida: por ejemplo, una queja por limpieza, por ruido o por una experiencia que no cumplió lo prometido. `[3.3.F4]`

**Eficiente.**

- Se mide la satisfacción del viajero —con el NPS o el CSAT— con una cadencia definida, por ejemplo al salir o al terminar su experiencia. `[3.3.E2]`
- La ficha del viajero guarda sus preferencias y lo que pidió en estancias anteriores —el tipo de habitación, una alergia, una celebración—, y quien lo atiende las ve. `[3.3.E501 · comprobable]`

**Óptimo.**

- Modelos con IA predicen lo que viene —por ejemplo, cuántas solicitudes van a entrar en temporada alta y de qué tipo— y proponen qué hacer; lo que predicen se ve en los tableros del área y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.D2`, `3.3.I2`, `3.3.I3`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E4`, `3.3.E5`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O1`, `3.3.O2`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el servicio va al día con las solicitudes y las quejas de los viajeros?

*Descripción:* Mide si cada persona sabe qué le toca en cada turno, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien a quién le toca una solicitud que pasa de un turno a otro, y el líder se entera de los atrasos cuando el viajero ya dejó una mala reseña.

**Deficiente.**

- Nadie tiene claro qué le toca: entre la recepción, reservas y la operación de las experiencias, las solicitudes de los viajeros se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.**

- Se siguen algunos números de la operación —las quejas, las solicitudes pendientes—, pero sin un tablero ni una cadencia fija. `[3.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, solicitudes pendientes, quejas por tipo y calificación de los viajeros— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.**

- El acuerdo con las áreas que operan la estancia o la experiencia —recepción, limpieza, mantenimiento, alimentos, guías y proveedores de traslados— está escrito y se mide: en cuánto tiempo resuelve cada una lo que le pasa Servicio. `[3.4.E501 · comprobable]`
- El sistema calcula cuánto cuesta atender a cada tipo de viajero —la familia, el grupo de un evento, el cliente de una agencia— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`

**Óptimo.**

*Se leen igual:* `3.4.D2`, `3.4.I2`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E1`, `3.4.E2`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O2`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia de la experiencia

¿En qué se apoya tu equipo para que la llegada y la atención no cambien según quién esté de turno?

*Descripción:* Mide si el equipo conoce a sus tipos de viajero y si cada viajero recibe la misma información y la misma llegada, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo viajero recibe un horario distinto según a quién le pregunte, y cada turno recibe a los viajeros a su manera: el viajero lo nota y lo cuenta en su reseña.

**Deficiente.**

- No hay respuestas guardadas: cada persona que atiende escribe cada respuesta desde cero, a su manera, hasta la de la hora de registro o la de cómo llegar. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas, pero cada turno o cada persona tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de viajero están escritos, cada viajero llega con un proceso definido y el equipo tiene respuestas guardadas para lo frecuente.

*Resultado:* El equipo sabe qué tipos de viajero atiende y qué espera cada uno, cada llegada sigue el mismo proceso y todo el equipo tiene a mano las mismas respuestas para lo frecuente.

- Existe un proceso escrito de llegada del viajero —la bienvenida, el registro, lo que se le explica y lo que se le entrega, o el inicio de su experiencia—, con un resultado definido que el viajero debe alcanzar al terminarlo: saber todo lo que necesita para su estancia. `[3.5.F2]`
- Existe un documento simple con los tipos de viajero que atiende el área —por ejemplo, la familia, quien viaja por trabajo o el grupo de un evento—, qué necesita cada uno, qué espera del servicio y cuáles se consideran viajeros clave, consultable por cualquiera del equipo. `[3.5.F4]`

**Eficiente.**

**Óptimo.**

- Lo que la IA les responde o les escribe sola a los viajeros —antes de su llegada, durante su estancia o después— sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F1`, `3.5.F3`, `3.5.F5`, `3.5.E2`, `3.5.E3`.

#### 3.6 Priorización de viajeros

¿Cómo decide tu equipo qué solicitud de un viajero se atiende primero?

*Descripción:* Mide si los casos se atienden según su gravedad y el tipo de viajero, y no según quién insiste más.

*Costo de quedarse:* El viajero que se quedó sin agua caliente espera en la misma fila que quien pregunta por el horario del desayuno, y la empresa que te trae un grupo cada año recibe la misma atención que todos.

**Deficiente.**

- Las solicitudes se atienden por orden de llegada o como prefiere quien está de turno, sin mirar su gravedad ni quién es el viajero. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente, pero las solicitudes no tienen una prioridad asignada: cada persona decide a ojo, o se adelanta el viajero que más insiste. `[3.6.I1]`

**Funcional.**

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta: un viajero sin habitación o varado en un traslado va antes que una consulta. `[3.6.F1]`

**Eficiente.**

**Óptimo.**

- Cada viajero se atiende con el contexto de cómo llegó —lo que se le prometió al reservar y el tipo de viajero que es—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F3`, `3.6.F4`, `3.6.F5`, `3.6.E1`, `3.6.E4`, `3.6.E5`, `3.6.O1`, `3.6.O2`.

#### 3.7 Acompañamiento del viajero

¿Cómo te enteras de que un viajero tiene un problema, antes, durante o después de su viaje?

*Descripción:* Mide si el viajero sabe lo que necesita antes de pedirlo, y si los problemas y las quejas se atienden mientras todavía está.

*Costo de quedarse:* Te enteras de que un viajero quedó mal cuando lo publica en una reseña, días después de que se fue, cuando ya no hay nada que arreglar.

**Deficiente.**

- Aunque un viajero acumule solicitudes repetidas o una queja sin resolver, nadie lo contacta: los problemas se atienden cuando estallan, muchas veces en una reseña. `[3.7.D1]`

**Inicial.**

- Cuando un viajero tiene problemas repetidos —por ejemplo, la misma falla en la habitación, un traslado que se atrasa—, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Las quejas y los problemas que se repiten se detectan, aunque sea a mano, cada queja se atiende antes de que el viajero se vaya y los viajeros clave reciben contacto antes de sus fechas.

*Resultado:* Las quejas, los problemas que se repiten y las fechas de los viajeros clave ya no toman al equipo por sorpresa: se actúa mientras el viajero todavía está y antes de que el problema llegue a una reseña.

- Un viajero con solicitudes repetidas por el mismo problema, una queja sin resolver o, si se piden calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los viajeros clave —por ejemplo, la empresa que trae un grupo cada año o la agencia que más vende— reciben contacto antes de sus fechas críticas —la llegada de un grupo, el fin de un convenio de tarifas o, si la hay, una renovación—, no después. `[3.7.F2]`
- Una queja durante la estancia o la experiencia se atiende antes de que el viajero se vaya: queda registrada, se le responde mientras está y se le pregunta al salir si quedó resuelta. `[3.7.F501 · comprobable · hábito]`

**Eficiente.**

- Si el clima, un cierre de carretera, un cambio de un proveedor o un cambio de vuelo o de horario afecta un viaje ya reservado, el viajero recibe el aviso y sus opciones antes de salir hacia el destino, no al llegar. `[3.7.E502 · comprobable · hábito]`

**Óptimo.**

*Se leen igual:* `3.7.D2`, `3.7.F3`, `3.7.F4`, `3.7.E1`, `3.7.E3`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.E8`, `3.7.O2`, `3.7.O3`, `3.7.O5`, `3.7.O6`.

#### 3.8 Autoservicio del viajero

¿Qué pasa con las preguntas que tus viajeros hacen una y otra vez, como la hora de registro, cómo llegar o qué incluye su tarifa?

*Descripción:* Mide si el servicio puede atender a más viajeros sin crecer al mismo ritmo, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas en cada temporada, y cada temporada alta suma más de esas preguntas a la fila.

**Deficiente.**

- Hasta las preguntas que más se repiten —la hora de registro, cómo llegar, qué incluye la tarifa— se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.**

- Hay un chatbot de menú fijo en el sitio o en WhatsApp, pero no responde las preguntas que más se repiten, como la hora de registro o cómo llegar. `[3.8.I1]`

**Funcional.**

- Las diez preguntas que más repitieron los viajeros en el último trimestre —o todas, si son menos—, por ejemplo la hora de registro y de salida, cómo llegar, qué incluye la tarifa o cómo cancelar, tienen una respuesta publicada que el viajero puede consultar por su cuenta. `[3.8.F1]`

**Eficiente.**

**Óptimo.**

- Los picos de la temporada alta los absorben la IA y el autoservicio: el equipo no crece cuando crece la ocupación, y el líder ve en los tableros del área qué parte de la demanda resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`

*Se leen igual:* `3.8.D1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O1`, `3.8.O3`, `3.8.O4`.

## Edición — Automotriz

Para el concesionario o el distribuidor que vende vehículos nuevos y usados a personas y empresas, y que atiende su posventa en el taller: un asesor trabaja cada venta, de la primera consulta a la prueba de manejo, la cotización, el financiamiento, el recibo del usado como parte de pago y la entrega, y el taller recibe al cliente después para el mantenimiento, las reparaciones, la garantía y los repuestos que instala. La venta del vehículo se mide en Ventas; el taller y la garantía, en Servicio. Recordarle al dueño su mantenimiento es de Servicio; ofrecerle cambiar de vehículo, de Ventas. Donde el concesionario vende solo usados, lo que toca a la marca —sus campañas, sus llamados a revisión, sus garantías— no aplica. La venta de repuestos al público en mostrador o en línea, la importadora que no le vende al cliente final y la empresa que solo alquila vehículos se miden con la escala general.

*Clave:* automotriz

*Perfil habitual:* con equipo · recompra.

*Criterios propios:* desde el 601.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Prospecto | Interesado en un vehículo |
| Negocio | Negocio: la venta de un vehículo, de la primera consulta a la entrega |
| Lead | Interesado en un vehículo |
| Pipeline | El recorrido de la venta: consulta, visita o prueba de manejo, cotización, financiamiento, cierre y entrega |
| Revisión del pipeline | Reunión de seguimiento de ventas |
| Vendedor | Asesor de ventas |
| Propuesta | La cotización del vehículo: versión, precio, accesorios, bonos, valor del usado que se recibe, financiamiento y fecha de entrega |
| Material de venta | Fichas técnicas, comparativos de versiones, fotos y videos de cada modelo |
| Razón de pérdida | Por qué el interesado no compró: el precio, el financiamiento que no salió, el valor de su usado o porque compró otra marca |
| Cliente ideal | El comprador objetivo de cada modelo o línea de vehículos |
| Pronóstico | Proyección de ventas por modelo |
| Cliente | El dueño del vehículo: una persona o una empresa con su flota |
| Caso | Caso de posventa: una cita de taller, una reparación, un reclamo de garantía o una consulta |
| Agente | Asesor de servicio del taller |
| Buyer persona | Perfil de comprador: quién es, qué busca y cómo decide, como la familia que cambia de vehículo o la empresa que renueva su flota |
| Traspaso | El de un interesado de Marketing a un asesor, o el de un comprador de Ventas al taller |

### Área 1 — Ventas

Mide el rendimiento de la venta de vehículos del concesionario: cómo está montada por dentro y qué produce en pruebas de manejo, ventas y entregas, y en dueños que vuelven a cambiar de vehículo. Vale igual si la venta la trabaja un equipo de asesores o uno solo.

**Deficiente.** Tus ventas dependen de quién atienda. Cada asesor lleva a sus interesados en su teléfono, los precios y los bonos viven en una hoja que no siempre está al día, y nadie sabe cuántas consultas y cuántas pruebas de manejo se quedaron sin seguimiento.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados se registran cuando el asesor se acuerda, cada quien cotiza a su manera y el financiamiento y el usado se negocian por fuera del sistema.

**Funcional.** Tu equipo comercial opera como una maquinaria base. Cada interesado entra al mismo recorrido, todos venden con la misma lista de precios y bonos y el mismo inventario, cada prueba de manejo deja su siguiente paso y ninguna cotización se enfría sin que alguien reaccione.

**Eficiente.** La venta deja de depender del empuje de cada asesor. Mides cuántas consultas llegan a prueba de manejo y cuántas pruebas a una venta, conoces la capacidad de pago antes de apartar un vehículo, acompañas cada venta hasta la entrega y proyectas las ventas de cada modelo con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA responden, califican y agendan pruebas de manejo a toda hora; los modelos dicen qué interesado está listo, qué vehículo ofrecerle y qué dueño ya está por cambiar el suyo.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus asesores cada venta, desde la primera consulta hasta la entrega del vehículo?

*Descripción:* Mide si la venta sigue un proceso escrito, de la consulta a la entrega, que no depende de cada asesor.

*Costo de quedarse:* Si se va un asesor, se lleva a sus interesados en el teléfono: nadie sabe quién ya hizo la prueba de manejo, a quién se le cotizó ni qué usado se le avaluó.

**Deficiente.**

- No hay nada escrito sobre el recorrido de la venta ni sus etapas —consulta, prueba de manejo, cotización, financiamiento, cierre y entrega—: cada asesor usa su criterio. `[1.1.D1]`

**Inicial.**

- Las etapas de la venta —consulta, prueba de manejo, cotización, cierre y entrega— existen de palabra o en un borrador, pero cada asesor las interpreta distinto. `[1.1.I1]`

**Funcional.** Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la entrega, con una cadencia de contacto, un proceso escrito para recibir el usado y una revisión fija de los negocios.

*Resultado:* Si rota un asesor, el siguiente sabe en qué va cada cliente, porque todo el equipo trabaja la venta igual en el CRM: los negocios avanzan con los mismos criterios, cada prueba de manejo deja su siguiente paso, el usado se recibe siempre de la misma forma, cada interesado se contacta con la cadencia acordada y los negocios se repasan en cada reunión de seguimiento.

- Cualquier asesor explica igual las etapas de la venta —consulta, prueba de manejo, cotización, financiamiento, cierre y entrega— y qué tiene que cumplirse para avanzar. `[1.1.F1]`
- Cada tipo de venta —vehículos nuevos, usados y flotas para empresas— tiene su propio recorrido en el CRM, con lo que el negocio tiene que cumplir para pasar de cada etapa a la siguiente. `[1.1.F2]`
- Toda prueba de manejo queda registrada con el vehículo que se probó, su resultado y el siguiente paso acordado. `[1.1.F601 · comprobable · hábito · venta con equipo]`
- El proceso para recibir un usado como parte de pago está escrito: quién lo avalúa, con qué criterios, cuánto tiempo vale la oferta y cómo se le explica al cliente. `[1.1.F602 · declarado]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.F7`, `1.1.F8`, `1.1.E1`, `1.1.E2`, `1.1.E3`, `1.1.E5`, `1.1.E6`, `1.1.O2`, `1.1.O3`, `1.1.O4`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se aparta un vehículo?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las consultas, avisar qué toca, mostrar el inventario, apartar el vehículo que se vende y registrar las conversaciones— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tus asesores copian a mano las consultas de los portales y de la marca, dependen de su memoria para dar seguimiento y descubren que el vehículo ya estaba apartado cuando el cliente ya se había decidido.

**Deficiente.**

- No hay un CRM donde montar una automatización: las consultas y las ventas de vehículos se pasan por correo, por chat o WhatsApp o de palabra, y ningún asesor recibe avisos del sistema. `[1.2.D2]`

**Inicial.**

- Hay un CRM, pero nada pasa solo: las consultas de los portales, la web y la sala se reparten a mano y cada asesor tiene que acordarse de sus seguimientos, como el de cada prueba de manejo y cada cotización. `[1.2.I1]`

**Funcional.** Lo básico pasa solo —las consultas de todos los canales entran al sistema y se reparten por una regla, el sistema avisa qué toca y el vehículo que se aparta queda marcado— y, si se usa IA, trabaja con los datos de cada cliente.

*Resultado:* Ninguna consulta se pierde por no saber a quién le toca: la que llega por un portal, por la marca o por la web entra sola, el asesor recibe el aviso y deja de depender de su memoria, ve qué vehículos están disponibles antes de ofrecerlos, y uno que ya se apartó no se le ofrece a nadie más.

- Las consultas que entran —de los portales, la web, la marca, las redes y la sala de exhibición— llegan a una bandeja o cola y se asignan por una regla simple: por turnos, por marca o según la fuente de donde llegan. `[1.2.F2]`
- El asesor puede ver qué vehículos están en inventario, en tránsito o por pedir, con su versión y su color, antes de ofrecer uno, en el CRM o en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8]`
- Apartar o vender un vehículo lo marca en el inventario en el momento: no se le ofrece a otro cliente ni se aparta dos veces. `[1.2.F601 · comprobable]`

**Eficiente.** Las cotizaciones salen del sistema, la solicitud de financiamiento viaja sola a las financieras, el CRM se conecta con el sistema del concesionario y el equipo usa la IA en su trabajo diario.

*Resultado:* El asesor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones se generan desde el sistema, con la versión, el precio, los bonos y el inventario vigentes, no como documentos sueltos. `[1.2.E1]`
- Si el concesionario lleva su inventario, sus pedidos a la marca, su facturación o su taller en otro sistema —el sistema de gestión del concesionario (DMS) o un ERP—, el CRM está conectado con él. `[1.2.E3]`
- La solicitud de financiamiento sale del sistema hacia las financieras con los datos del cliente, y su respuesta vuelve al negocio, sin pasarla a mano. `[1.2.E601 · comprobable · venta con equipo]`

**Óptimo.** La IA responde, califica, agenda pruebas de manejo y calcula qué negocios van a cerrar; el asesor valida y se queda con las conversaciones que deciden la venta.

- Si el equipo atiende por un canal conversacional, agentes de IA califican ahí a los interesados con la definición de interesado calificado y agendan pruebas de manejo a cualquier hora; le pasan al asesor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que calificaron. `[1.2.O2]`

*Se leen igual:* `1.2.D1`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F6`, `1.2.F7`, `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O3`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus negocios y de tu inventario antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: negocios completos, el origen de cada uno, el inventario al día y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de ventas se arma a mano cruzando el CRM con el inventario, y no sabes qué portal o qué campaña te trae compradores y cuál solo consultas.

**Deficiente.**

- Las ventas de vehículos no quedan registradas con su monto y su fecha: no se sabe cuántos vehículos se vendieron, por cuánto ni cuándo. `[1.3.D4]`

**Inicial.**

- Los negocios que se crean hoy se registran, pero a algunos les falta la fecha esperada de cierre, el monto o el asesor responsable. `[1.3.I3]`

**Funcional.** El reporte de negocios sale del sistema, sin armarlo a mano, y el estado de cada vehículo está al día: a los dos se les puede creer.

*Resultado:* El líder ve el estado real de los negocios y del inventario cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada interesado.

- Todo negocio creado desde la puesta en marcha del recorrido actual tiene el modelo o el vehículo de interés, el monto, la fecha esperada de cierre y el asesor responsable. `[1.3.F1]`
- Todo negocio creado desde la puesta en marcha del recorrido actual dice por dónde llegó el interesado: la sala de exhibición, la web, un portal, la marca, las redes, una feria o un referido. `[1.3.F3]`
- El estado de cada vehículo del inventario —disponible, apartado, vendido o entregado— está al día en el sistema y coincide con lo que se facturó. `[1.3.F601 · comprobable · requiere 1.2.F8]`

**Eficiente.** Aparece una proyección de ventas confiable por modelo, se mide cuánto tarda en venderse cada vehículo y la ficha del cliente reúne su compra, su financiamiento y sus visitas al taller.

*Resultado:* El concesionario puede comprometer un número de ventas por modelo con confianza y planear con ese número sus pedidos a la marca y su inventario de usados.

- Hay una proyección de ventas por modelo que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% de lo proyectado. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si el concesionario lleva en otros sistemas la facturación, el financiamiento o el taller, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se mide cuánto tarda en venderse cada modelo nuevo y cada vehículo usado en inventario, y ese número se revisa cada mes. `[1.3.E601 · comprobable · hábito]`

**Óptimo.**

- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, la facturación, sus visitas y reclamos en el taller y las conversaciones. `[1.3.O3]`

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.D3`, `1.3.I1`, `1.3.I2`, `1.3.F2`, `1.3.F4`, `1.3.F8`, `1.3.F9`, `1.3.F10`, `1.3.E4`, `1.3.E5`, `1.3.O1`, `1.3.O2`, `1.3.O4`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué asesores van bien y cuáles necesitan ayuda?

*Descripción:* Mide si cada asesor tiene un rol y una meta por escrito, y si el líder sigue los números de la venta y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes de que no llegó a la meta de la marca: no vio antes qué asesor se quedó atrás ni en qué etapa se cayeron los negocios.

**Deficiente.**

- El líder apaga incendios: no hay métricas —ni de consultas, ni de pruebas de manejo, ni de ventas— ni rendición de cuentas. `[1.4.D2]`

**Inicial.**

- El líder revisa algunos números —las ventas del mes, los vehículos en inventario— en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —consultas, pruebas de manejo, cotizaciones, ventas, entregas y vehículos en inventario— y lo consulta al menos una vez por semana. `[1.4.F2]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con las áreas que cierran la venta y, si Marketing pasa interesados, también las del traspaso.

*Resultado:* Un asesor nuevo produce más rápido, el financiamiento, el avalúo del usado y la entrega no se traban entre áreas, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —los modelos, los precios, el financiamiento y los sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con las áreas que cierran la venta —financiamiento y seguros, el avalúo de usados y la preparación y entrega del vehículo— está escrito y se mide: qué recibe cada una y en cuánto tiempo responde. `[1.4.E601 · comprobable]`
- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo —su compra, su financiamiento y su taller—, cuánto margen deja cada canal y cada modelo y cuánto aporta cada asesor. `[1.4.E6]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué modelo y qué canal dejan más margen, qué vehículo se vende más rápido y cuánto deja cada cliente entre su compra y el taller.

*Se leen igual:* `1.4.D1`, `1.4.I2`, `1.4.F3`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E3`, `1.4.E4`, `1.4.E5`, `1.4.O2`, `1.4.O3`, `1.4.O4`.

#### 1.5 Modelos y cotización

¿Cómo sabe un asesor que entra a tu equipo a quién le vende cada modelo y con qué precios, bonos y condiciones?

*Descripción:* Mide si el equipo sabe para quién es cada modelo, si la cotización llega igual con cualquier asesor y, si se vende por más de un canal, si los precios y las condiciones son coherentes en todos.

*Costo de quedarse:* Cada asesor cotiza con su propia hoja y su propio bono: el cliente recibe dos precios para el mismo vehículo, desconfía y se va a cotizar a otro concesionario.

**Deficiente.** Nadie puede decir con claridad para quién es cada modelo, no hay una lista de precios y bonos que todos usen y cada asesor cotiza a su manera: el cliente recibe precios distintos según quién lo atienda.

- Hay más de una lista de precios o de bonos circulando, y no se sabe cuál es la vigente. `[1.5.D601 · comprobable]`

**Inicial.** Hay una lista de precios y fichas de cada modelo, pero cada asesor arma la cotización por su cuenta.

- Hay una plantilla de cotización, pero cada asesor la cambia o la usa a su manera. `[1.5.I2]`

**Funcional.** El comprador objetivo de cada modelo está escrito, y todos venden con los mismos precios, los mismos bonos y la misma cotización.

*Resultado:* Dos clientes parecidos reciben la misma información del modelo y una cotización igual de clara —versión, precio, bonos, financiamiento, valor del usado y fecha de entrega—, sin importar qué asesor los atienda.

- Existe un documento con el comprador objetivo de cada modelo —a quién va dirigido, qué busca y cómo paga—, consultable por cualquier asesor. `[1.5.F1]`
- El líder puede explicar quién es el comprador objetivo de cada modelo sin consultar su documentación. `[1.5.F2]`
- Las cotizaciones están estandarizadas: toda cotización muestra lo mismo —versión, precio, accesorios, bonos, financiamiento, valor del usado y fecha de entrega—, no armada desde cero cada vez. `[1.5.F4]`
- Hay una sola lista vigente de precios, bonos y promociones por modelo y versión, y todas las cotizaciones salen de ella. `[1.5.F601 · comprobable]`

**Eficiente.** La propuesta se distingue de la de otros concesionarios y otras marcas, y solo promete lo que se va a entregar.

*Resultado:* Los interesados ven qué distingue al concesionario: la propuesta dice lo mismo en el sitio, en la sala y en boca de cada asesor, y lo que se le prometió al cliente —la fecha de entrega, los accesorios, las condiciones del financiamiento— es lo que recibe.

- Las cotizaciones solo prometen lo que se va a entregar: la fecha de entrega, los accesorios y las condiciones del financiamiento se validan antes de enviarlas. `[1.5.E3]`
- Los cambios de precio, de bonos y de promociones les llegan el mismo día a todos los asesores y a todos los canales. `[1.5.E601 · comprobable · hábito]`

**Óptimo.**

- La IA revisa en tiempo real, contra la propuesta de valor vigente del concesionario, lo que se les dice a los interesados —en la sala, por WhatsApp o en la cotización—, lo escriba ella o el asesor; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D1`, `1.5.D2`, `1.5.I1`, `1.5.I3`, `1.5.F3`, `1.5.F5`, `1.5.F6`, `1.5.E2`, `1.5.E4`.

#### 1.6 Priorización de interesados

¿Cómo decide tu equipo a qué interesados dedicarles tiempo y pruebas de manejo primero?

*Descripción:* Mide si el equipo decide a qué interesados dedicar su tiempo con criterios escritos, según el comprador objetivo de cada modelo.

*Costo de quedarse:* Tus asesores le dan prueba de manejo a todo el que pasa por la sala: pasan la tarde con quien no puede financiar el vehículo, y los compradores listos esperan su turno.

**Deficiente.**

- No hay criterios para distinguir a un interesado que va a comprar de uno que solo pasa a mirar: se pierden tiempo y pruebas de manejo con interesados que nunca van a comprar. `[1.6.D1]`

**Inicial.**

- El líder sabe quién es el comprador objetivo de cada modelo, pero el CRM no tiene los campos —modelo de interés, presupuesto, forma de pago— para separar a los interesados que encajan. `[1.6.I2]`

**Funcional.** Los interesados se separan por los rasgos del comprador objetivo —modelo, presupuesto, forma de pago, si trae un usado— y hay una definición escrita de interesado calificado que el equipo aplica.

*Resultado:* El equipo deja de dedicarle pruebas de manejo a quien no encaja con el comprador objetivo y concentra el esfuerzo en quien sí encaja y cumple la definición de interesado calificado, con su presupuesto, su forma de pago y su plazo de compra.

- El equipo segmenta a los interesados por los atributos del comprador objetivo antes de trabajarlos: el modelo que busca, el presupuesto, la forma de pago, si trae un usado o si compra para una flota. `[1.6.F1]`
- Los rasgos del comprador objetivo —modelo de interés, presupuesto, forma de pago y si trae un usado— son campos del CRM y de los formularios de consulta. `[1.6.F4]`

**Eficiente.**

- La capacidad de pago del interesado o la precalificación de su financiamiento se conoce antes de apartar un vehículo o de pedirlo a la marca. `[1.6.E601 · comprobable · venta con equipo]`

**Óptimo.**

*Se leen igual:* `1.6.I1`, `1.6.F2`, `1.6.F3`, `1.6.E3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O3`, `1.6.O4`, `1.6.O5`.

#### 1.7 Seguimiento de pruebas y cotizaciones

¿Qué pasa con quien hizo la prueba de manejo y no volvió a contestar, o con la venta que no avanza hacia la entrega?

*Descripción:* Mide si alguien detecta cuando un negocio deja de avanzar —después de la prueba de manejo, de la cotización o mientras se espera el financiamiento— y si hay un paso acordado para retomarlo; y, donde el dueño vuelve a comprar, si se le busca cuando ya le toca cambiar de vehículo.

*Costo de quedarse:* Los interesados se enfrían después de la prueba de manejo y las cotizaciones quedan sin respuesta sin que nadie llame: el cliente termina comprando en el concesionario de otra marca que sí lo llamó.

**Deficiente.** El asesor está solo con sus clientes: después de la prueba de manejo o de la cotización, nadie da seguimiento.

- No hay material de venta —fichas técnicas, comparativos de versiones, fotos o videos— para mostrarles a los interesados. `[1.7.D4]`

**Inicial.**

- Cuando un negocio se detiene —por ejemplo, después de la prueba de manejo o de la cotización—, cada asesor decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`
- Todos los intentos de hacer avanzar un negocio se hacen por el mismo canal: por ejemplo, el asesor solo llama, o solo escribe por WhatsApp. `[1.7.I4]`

**Funcional.** Ningún negocio se enfría en silencio después de la prueba de manejo o de la cotización: se detecta y hay un paso acordado para retomarlo.

*Resultado:* Los negocios que se traban se detectan y se retoman por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Cada prueba de manejo y cada cotización reciben su seguimiento, y el dueño que ya debería cambiar de vehículo no se deja al azar.

- Hay material de venta estandarizado —fichas técnicas, comparativos de versiones, fotos y videos de cada modelo— que ayuda a cerrar la venta. `[1.7.F4]`
- Toda prueba de manejo y toda cotización reciben seguimiento dentro del plazo acordado. `[1.7.F601 · comprobable · hábito · venta con equipo · requiere 1.1.F601]`

**Eficiente.**

- Los interesados que todavía no están listos para comprar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven a un asesor cuando muestran interés o llega el modelo que buscaban. `[1.7.E2]`
- Entre el cierre y la entrega, el comprador recibe cómo va su vehículo —el pedido a la marca, la aprobación del financiamiento, la inscripción y la preparación— sin tener que pedirlo. `[1.7.E601 · comprobable · hábito]`

**Óptimo.**

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.I2`, `1.7.I3`, `1.7.F1`, `1.7.F2`, `1.7.F3`, `1.7.F6`, `1.7.F7`, `1.7.E1`, `1.7.E3`, `1.7.E4`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O2`, `1.7.O3`.

#### 1.8 Ventas ganadas y perdidas

¿Qué queda registrado cuando un interesado no compra o una venta se cae antes de la entrega?

*Descripción:* Mide si queda registrado por qué no compra un interesado o por qué se cae una venta antes de la entrega, y si el equipo revisa lo que gana y lo que pierde para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes ventas —el precio, el financiamiento que no salió, el valor del usado, la otra marca—: cada asesor tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Deficiente.**

- Los negocios perdidos se cierran sin anotar por qué el interesado no compró: ni el precio, ni el financiamiento, ni el valor de su usado, ni la otra marca. `[1.8.D2]`

**Inicial.**

- Por qué el interesado no compró se anota a veces y en texto libre, a criterio de cada asesor, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada negocio perdido y cada venta que se cae quedan con su razón, elegida de una lista fija, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no compran los interesados y por qué se caen las ventas antes de la entrega, con datos del trimestre y no con impresiones.

- Todo negocio creado desde la puesta en marcha del recorrido actual que se dio por perdido tiene registrada su razón. `[1.8.F1]`
- Cada venta que se cae después del cierre —porque no salió el financiamiento, el cliente desistió o el vehículo no llegó— deja registrada su razón. `[1.8.F601 · comprobable]`

**Eficiente.**

- Al menos una vez por trimestre se revisan las ventas ganadas, los negocios perdidos y las ventas que se cayeron para encontrar lo que se repite. `[1.8.E1]`
- Cuando el cliente compró otra marca o en otro concesionario, queda registrado cuál y por qué. `[1.8.E601 · comprobable]`

**Óptimo.**

*Se leen igual:* `1.8.D1`, `1.8.F2`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.E4`, `1.8.O1`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing del concesionario: cómo está montada por dentro y qué produce en presencia, interesados y pruebas de manejo para cada modelo, y en clientes que vuelven al taller. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que el concesionario dirige, también cuando parte de las campañas las pone la marca.

**Deficiente.** Tus modelos no los presentas tú: los presenta la marca o el portal. Cada anuncio dice algo distinto, las herramientas están sueltas y la pauta corre hasta agotar el presupuesto sin que nadie mida qué dejó. Los interesados llegan por accidente.

**Inicial.** Tienes logo, fotos de los modelos y redes, pero no hay una estrategia detrás. Publicas cuando llega un modelo o una promoción de la marca, y los resultados de cada campaña se miden tarde y a mano. Llegan consultas, pero no siempre sabes de dónde vienen.

**Funcional.** Tu marketing dejó de depender de una persona. La marca y los perfiles de comprador están escritos, cada modelo tiene su página, el calendario sigue los lanzamientos y las campañas de la marca, y los canales que elegiste en tu plan salen con regularidad y anuncian solo lo que está disponible. Sabes de dónde llega cada interesado y cuánto te cuesta en cada canal.

**Eficiente.** Probar y ajustar ya es rutina. Sabes qué aportó cada canal a cada venta y cuánto te cuesta cada prueba de manejo y cada venta en cada canal y en cada modelo, el mensaje se adapta solo a cada tipo de comprador, la IA asiste a tu equipo en su trabajo diario y tu concesionario aparece cuando alguien busca un vehículo en su zona, en buscadores y en asistentes de IA.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada modelo se genera y se ajusta de forma continua; la IA adapta el mensaje a lo que hizo cada interesado y mueve la pauta entre canales dentro de los límites que fija el equipo; y los clientes satisfechos que identifica Servicio traen compradores nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma una campaña en tu equipo, desde que se decide hasta que sale en los portales, en la pauta y en las redes?

*Descripción:* Mide si la promoción de cada modelo y del taller sale de un plan y un calendario compartidos, sin depender de nadie.

*Costo de quedarse:* Cada lanzamiento depende de quien lo arma: si esa persona se va, la campaña del modelo nuevo o del cierre de mes sale tarde o sin plan.

**Deficiente.**

- No hay calendario de campañas: cada lanzamiento y cada promoción se improvisan. `[2.1.D1]`

**Inicial.**

- Las campañas dependen de quien las arma —una persona del equipo, la agencia o la marca—: el calendario, los accesos a los portales, a la pauta y a las redes y los pasos a seguir están en sus manos. `[2.1.I3]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y el calendario sigue el año del concesionario.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la promoción de cada modelo sigue saliendo aunque cambie una persona: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- Si una agencia —o la marca, con sus campañas— ejecuta todo o parte del trabajo, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia la agencia. `[2.1.F5]`
- El calendario de campañas sigue el año del concesionario: el lanzamiento de cada modelo, las ferias y exhibiciones, los cierres de mes y las campañas de la marca y del taller. `[2.1.F601 · declarado]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F6`, `2.1.E4`, `2.1.E5`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide una cotización o una prueba de manejo en tu sitio, o te escribe por WhatsApp?

*Descripción:* Mide si las herramientas que se pagan se usan, si cada interesado que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien pide una cotización en tu sitio o te escribe por WhatsApp espera a que alguien lo cargue y le conteste, o se va a otro concesionario, y si pagas herramientas, parte de lo que pagas no se usa.

**Deficiente.**

- Lo que llega por el sitio, los portales o WhatsApp —una solicitud de cotización, una pregunta por un usado— cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`

**Inicial.**

- Hay alguna automatización, pero quedó a medias: por ejemplo, el formulario de prueba de manejo responde solo y el de cotización no le avisa a nadie. `[2.2.I3]`

**Funcional.**

*Resultado:* Todo lo que entra por el sitio, por la marca y, si se usa, por WhatsApp o el chat llega al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Si el sitio tiene formularios para pedir una cotización o una prueba de manejo, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`

**Eficiente.**

- El traspaso de interesados a los asesores es automático: cuando un interesado cumple los criterios para pasar a un asesor, le llega con su historial al asesor que corresponde, sin que nadie lo pase a mano. `[2.2.E3]`

**Óptimo.**

*Se leen igual:* `2.2.D1`, `2.2.D3`, `2.2.I1`, `2.2.I2`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.F10`, `2.2.F11`, `2.2.E1`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.E8`, `2.2.O1`, `2.2.O3`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántos interesados entran, de dónde vienen y cuántos llegan a una prueba de manejo?

*Descripción:* Mide si los datos de marketing son confiables: de dónde llega cada interesado, en qué etapa está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de qué portal o de qué anuncio llega cada interesado ni cuántos terminan en una prueba de manejo: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle.

**Deficiente.**

- No se registra de dónde llegó cada interesado: nadie sabe si vino por el sitio, un portal, una feria o una recomendación. `[2.3.D1]`

**Inicial.**

- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los interesados le falta el origen, como el portal, la pauta o la marca de donde llegaron. `[2.3.I2]`

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada interesado —un portal, la pauta, las redes, la marca, una feria o un referido—, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, WhatsApp, un portal, la marca o la sala de exhibición— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los reportes básicos —cuántos interesados entran por modelo, de dónde vienen y cuántos llegan a una prueba de manejo— salen del sistema sin armarlos a mano. `[2.3.F5]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `2.3.D2`, `2.3.I1`, `2.3.F2`, `2.3.F3`, `2.3.F6`, `2.3.F8`, `2.3.F9`, `2.3.E1`, `2.3.E2`, `2.3.E5`, `2.3.E6`, `2.3.E7`, `2.3.O1`, `2.3.O5`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los interesados y las pruebas de manejo de cada modelo?

*Descripción:* Mide si cada persona sabe qué le toca en la promoción de los modelos y del taller, si el equipo tiene metas y si decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué modelo se promociona se decide por costumbre, por lo que pide la marca o por quien insiste más, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Deficiente.**

- Nadie revisa los resultados de marketing —lo que dejan las campañas de los modelos y del taller—: ni el equipo ni la dirección. `[2.4.D3]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué usado publicar, qué anuncio de un modelo aprobar— espera a que lo resuelva la gerencia general del concesionario. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —interesados nuevos por modelo, de dónde llegan, cuántos pasan a un asesor y cuántos llegan a una prueba de manejo— y lo consulta al menos una vez por semana. `[2.4.F2]`
- Las decisiones sobre qué promocionar y en qué enfocarse —qué modelo, qué usados, qué servicio del taller— citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —el valor de vida de los clientes que trae, entre la compra de su vehículo y sus visitas al taller— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.I2`, `2.4.F3`, `2.4.F5`, `2.4.F7`, `2.4.E2`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`, `2.4.O6`.

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza para publicar, y qué encuentra un interesado cuando busca un modelo en tu sitio?

*Descripción:* Mide si la marca del concesionario se ve y suena igual en todo lo que sale, si está escrito a qué comprador le habla, si cada modelo tiene dónde mostrarse completo y si el sitio aparece en buscadores.

*Costo de quedarse:* Cada anuncio se ve distinto al anterior y, cuando alguien busca un modelo en tu zona, encuentra el sitio de otro concesionario, o encuentra el tuyo sin precio ni forma de agendar una prueba.

**Deficiente.**

- No está escrito a quién le habla el concesionario: no hay perfiles de comprador. `[2.5.D2]`

**Inicial.**

- Hay logo, colores y plantillas, pero el perfil de comprador es uno solo y tan general que sirve para cualquiera: no distingue a la familia que cambia de vehículo de la empresa que renueva su flota. `[2.5.I1]`

**Funcional.** La marca, la voz y los perfiles de comprador están escritos y se usan, cada modelo tiene su página, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes.

*Resultado:* La marca se ve y suena igual en todo lo que sale, cada modelo tiene dónde mostrarse completo, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Cada modelo en venta tiene su página en el sitio, con sus versiones, el precio desde, la ficha técnica, fotos y cómo pedir una prueba de manejo. `[2.5.F601 · comprobable]`

**Eficiente.**

**Óptimo.**

*Se leen igual:* `2.5.D1`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E2`, `2.5.E3`, `2.5.E4`, `2.5.E6`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un interesado según el tipo de comprador que es y el modelo que busca?

*Descripción:* Mide si cada interesado recibe un mensaje pensado para su tipo de comprador y el modelo que busca, y si cada dueño recibe lo que corresponde a su vehículo.

*Costo de quedarse:* Le mandas la misma promoción a todos: la empresa que busca una flota recibe la oferta pensada para la familia, y quien acaba de comprar recibe la publicidad del modelo que ya tiene.

**Deficiente.**

- No hay segmentos: las campañas salen a toda la base con el mismo mensaje, a quien busca su primer vehículo igual que al dueño que acaba de comprar. `[2.6.D1]`

**Inicial.**

- La base se separa solo por datos generales —país, ciudad o edad—, no por lo que cada grupo necesita, como el modelo que busca o el vehículo que ya tiene. `[2.6.I1]`

**Funcional.**

- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento: no le hablan igual a la familia que cambia de vehículo que a la empresa que renueva su flota. `[2.6.F3]`

**Eficiente.**

**Óptimo.**

- La IA predice quién va a comprar un vehículo —o cambiar el que tiene— y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F4`, `2.6.F5`, `2.6.E1`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.E6`, `2.6.E7`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por los canales que usas, como los portales, la pauta, las redes, el correo o WhatsApp?

*Descripción:* Mide si los canales que el concesionario eligió salen con regularidad y bajo un mismo plan, si anuncian solo lo que está disponible y si se conoce lo que cuesta cada interesado.

*Costo de quedarse:* Tus modelos llegan al mercado a ratos, o no llegan, sin un plan que coordine tus canales; cuando anuncias, ofreces usados que ya se vendieron, y no sabes cuánto te cuesta cada interesado.

**Deficiente.**

- No hay un plan que diga por qué canales sale el concesionario: los portales, la pauta, las redes o las ferias. `[2.7.D2]`

**Inicial.**

- La pauta y los correos salen cuando hay algo que promocionar —un modelo que llega, una promoción de la marca—, sin presupuesto ni fechas fijados de antemano. `[2.7.I2]`

**Funcional.** Los canales que el concesionario eligió salen con regularidad y bajo un mismo plan, y anuncian solo lo que está disponible.

*Resultado:* Una campaña sale coordinada por todos los canales del plan en vez de esfuerzos sueltos, lo que se anuncia está disponible, y el líder ve cuánto le cuesta cada interesado según el canal del que venga.

- Los portales, la pauta y el sitio anuncian solo los vehículos disponibles y las promociones vigentes: el usado que se aparta o se vende deja de promocionarse dentro del plazo acordado. `[2.7.F601 · comprobable · hábito]`

**Eficiente.**

- Si las ferias, las exhibiciones o los eventos de lanzamiento son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- En el sistema se ve cuánto cuesta cada prueba de manejo y cada venta en cada canal y en cada modelo, no solo cada interesado. `[2.7.E601 · comprobable · requiere 1.3.F3]`

**Óptimo.**

- Los dueños que Servicio identifica como promotores —por ejemplo, después de una buena entrega o una buena visita al taller— se vuelven un canal de referidos y casos de éxito sin pedirlos a mano: el sistema los invita solo, el equipo elige qué casos se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.F5`, `2.7.F6`, `2.7.F7`, `2.7.F8`, `2.7.E3`, `2.7.E4`, `2.7.E5`, `2.7.E6`, `2.7.E7`, `2.7.E8`, `2.7.E9`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada lanzamiento o de cada campaña cuando termina?

*Descripción:* Mide si cada campaña se evalúa por los interesados, las pruebas de manejo y las ventas que trajo, y deja un aprendizaje.

*Costo de quedarse:* Repites la pauta y los mensajes de siempre porque nadie anota cuáles trajeron pruebas de manejo y ventas: cada lanzamiento empieza de cero.

**Deficiente.**

- No se mide qué trajo cada campaña —consultas, pruebas de manejo o ventas—: solo se sabe lo que se gastó, o ni eso. `[2.8.D2]`

**Inicial.**

- Se miran clics, alcance y me gusta, no los interesados ni las ventas de vehículos que trajo cada campaña. `[2.8.I1]`

**Funcional.**

- Los resultados de cada campaña —los interesados, las pruebas de manejo o las ventas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

**Óptimo.**

- La IA ajusta las campañas mientras corren —deja de mostrar la versión del anuncio que no funciona y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.D1`, `2.8.D3`, `2.8.I2`, `2.8.F3`, `2.8.E3`, `2.8.E4`, `2.8.E5`, `2.8.O3`.

### Área 3 — Servicio

Mide el rendimiento de la posventa del concesionario, que recibe al dueño desde la entrega de su vehículo y lo atiende en el taller: el mantenimiento, las reparaciones, la garantía y los repuestos que se instalan. Mira cómo está montada por dentro y qué produce en vehículos entregados en el plazo prometido, reclamos resueltos y dueños que vuelven al taller y recomiendan.

**Deficiente.** El taller se improvisa vehículo por vehículo. Las citas se dan por teléfono y quedan en un cuaderno, cada asesor de servicio presupuesta a su manera y el cliente se entera de que su vehículo no estará listo cuando llega a recogerlo.

**Inicial.** Lo que pasa con cada vehículo lo sabe el asesor que lo recibió. Hay un sistema de órdenes de trabajo, pero el cliente tiene que llamar para saber cómo va, y nadie le recuerda su próximo mantenimiento.

**Funcional.** Tu taller es consistente y ya no depende de una persona. Sabes qué tipos de cliente atiendes y qué espera cada uno. Cada vehículo entra con su orden y sigue las mismas etapas, del recibo a la entrega; el cliente aprueba el presupuesto antes de que se repare, recibe cada cambio de estado sin llamar y recibe el recordatorio de su próximo mantenimiento. Atiendes primero lo urgente y tienes respuestas guardadas para lo repetitivo.

**Eficiente.** El taller empieza a adelantarse al cliente. Tienes plazos por tipo de servicio que se vigilan solos, el cliente agenda y aprueba en línea, y la IA asiste a tu equipo en su trabajo diario; mides tiempos, satisfacción y los vehículos que vuelven por la misma falla. Ningún caso se pierde entre el taller, repuestos y la marca, y cada dueño recibe el aviso de un llamado a revisión sin buscarlo.

**Óptimo.** Un agente de IA atiende a los dueños a toda hora —agenda, responde y da el estado de su vehículo— y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa y atiende las excepciones; casi todos los problemas que detecta el sistema se resuelven antes de que el dueño los note, y cada cliente se atiende sabiendo lo que compró y lo que se le prometió.

#### 3.1 Procesos y Rutinas

¿Cómo se atiende un vehículo en tu taller, desde que entra hasta que se entrega?

*Descripción:* Mide si el taller sigue un proceso y rutinas definidas, para que la atención del vehículo no dependa de quién lo recibe.

*Costo de quedarse:* El taller depende del asesor de servicio que conoce cada caso: si esa persona falta, nadie sabe qué se le prometió al cliente ni cuándo estará listo su vehículo.

**Deficiente.**

- Cada asesor de servicio recibe y atiende cada vehículo y cada reclamo a su manera. `[3.1.D1]`

**Inicial.**

- Todavía se depende de héroes: cuando falta el asesor de servicio o el jefe de taller que sabe, los vehículos y los reclamos se traban. `[3.1.I2]`

**Funcional.**

- El recorrido de las órdenes del taller está configurado en el sistema con sus etapas y cubre la atención de cada vehículo —una cita, una reparación o un reclamo de garantía—, del recibo a la entrega. `[3.1.F1]`
- Existe un proceso escrito para escalar los reclamos graves y los casos que el asesor de servicio no puede resolver —por ejemplo, un vehículo que vuelve por la misma falla o una garantía que la marca rechaza—: dice cuáles se escalan y a quién. `[3.1.F4]`
- Toda orden de trabajo sigue un proceso escrito: el recibo del vehículo con su inspección y la firma del cliente, el diagnóstico, la aprobación del presupuesto antes de reparar, el control de calidad y la entrega. `[3.1.F601 · declarado]`

**Eficiente.**

- Hay guías escritas para los momentos difíciles del taller: un vehículo que vuelve por la misma falla, un repuesto que no llega o un reclamo de garantía que la marca rechaza. `[3.1.E601 · declarado]`

**Óptimo.**

*Se leen igual:* `3.1.D2`, `3.1.I1`, `3.1.I3`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F5`, `3.1.F6`, `3.1.F7`, `3.1.F8`, `3.1.E1`, `3.1.E3`, `3.1.E4`, `3.1.E5`, `3.1.E6`, `3.1.O3`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega una cita o un reclamo al sistema y al asesor de servicio que lo tiene que atender?

*Descripción:* Mide si cada cita y cada caso llegan solos al sistema y a quien los atiende, y cuánto del taller se automatiza.

*Costo de quedarse:* Las citas se pierden entre el teléfono del taller y el WhatsApp de cada asesor, y el cliente tiene que llamar varias veces para saber si su vehículo ya está listo.

**Deficiente.**

- Las citas y los reclamos se manejan en los celulares personales o el WhatsApp de cada asesor de servicio, o en correos individuales. `[3.2.D2]`

**Inicial.**

- Hay un sistema de casos del taller, pero lo que entra se reparte a mano, o el taller atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.**

- Las citas del taller se agendan en el sistema con el vehículo, el servicio y la hora, y el cliente recibe, sin que nadie lo escriba a mano, la confirmación de su cita y cada cambio en el estado de su vehículo: en diagnóstico, con presupuesto por aprobar o listo para recoger. `[3.2.F601 · comprobable]`

**Eficiente.**

- El cliente puede agendar su cita, aprobar el presupuesto y ver el estado de su vehículo en línea, sin llamar al taller. `[3.2.E601 · comprobable]`

**Óptimo.**

- Un agente de IA resuelve casos de posventa —agenda citas, da el estado del vehículo, responde sobre la garantía— en todos los canales donde atiende el taller, sin que intervenga una persona, y le pasa a un asesor de servicio, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`

*Se leen igual:* `3.2.D1`, `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.F8`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O4`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué trabajos y reclamos te llegan, cuántos y de qué vehículos?

*Descripción:* Mide si los datos de cada cliente —sus vehículos, sus servicios y sus casos— están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el cliente llega al taller tiene que decir qué le hicieron la última vez, porque nadie ve la historia de su vehículo.

**Deficiente.**

- No se puede reconstruir qué le pasó a un cliente ni qué se le hizo a su vehículo: su historia no queda registrada en ningún lado. `[3.3.D2]`

**Inicial.**

- Las órdenes y los casos están en un solo sistema, pero la ficha del cliente sale incompleta: el vehículo que compró, su garantía o su contrato de mantenimiento hay que buscarlos en otro sistema. `[3.3.I1]`

**Funcional.**

- La ficha del cliente muestra sus vehículos —con la placa, el número de serie y el kilometraje— y su valor, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida: por ejemplo, un mantenimiento, una reparación por una falla o un reclamo de garantía. `[3.3.F4]`

**Eficiente.**

- Se mide la satisfacción del cliente —con el NPS o el CSAT— con una cadencia definida, por ejemplo después de cada visita al taller y después de la entrega de un vehículo. `[3.3.E2]`
- Se mide cuántos vehículos vuelven al taller por la misma falla dentro del plazo que fija el proceso, y ese número se revisa cada mes. `[3.3.E601 · comprobable · hábito]`

**Óptimo.**

- Modelos con IA predicen lo que viene —por ejemplo, cuántos vehículos van a entrar al taller y para qué servicio— y proponen qué hacer; lo que predicen se ve en los tableros del área y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.D1`, `3.3.I2`, `3.3.I3`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E4`, `3.3.E5`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O1`, `3.3.O2`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el taller va al día con sus vehículos y sus clientes?

*Descripción:* Mide si cada persona del taller sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien a quién le toca avisarle al cliente o pedir el repuesto, y el líder se entera de los atrasos cuando el cliente ya llegó a recoger un vehículo que no está listo.

**Deficiente.**

- Nadie tiene claro qué le toca: entre la entrega del vehículo, la recepción en el taller y el seguimiento al dueño, las tareas se pisan o quedan sin responsable. `[3.4.D1]`

**Inicial.**

- El líder mira los números del taller de vez en cuando, sobre todo cuando algo sale mal, como un vehículo que no está listo cuando el dueño llega a recogerlo. `[3.4.I2]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —vehículos en el taller, órdenes abiertas, trabajos atrasados, reclamos de garantía y casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.**

- El acuerdo con repuestos, con la marca —por las garantías— y con los talleres externos que se subcontratan está escrito y se mide: qué recibe cada uno y en cuánto tiempo responde. `[3.4.E601 · comprobable]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente —el dueño particular, la empresa con flota— frente a lo que deja en el taller, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`

**Óptimo.**

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E1`, `3.4.E2`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O2`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia del taller

¿En qué se apoya tu equipo para que el presupuesto, la explicación y la entrega no cambien según quién atienda al cliente?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y si cada cliente recibe las mismas respuestas, el mismo precio y la misma entrega, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo trabajo cuesta distinto según el asesor de servicio que te toque, y el cliente lo nota y se va al taller de la esquina.

**Deficiente.**

- No hay respuestas guardadas: cada asesor de servicio escribe desde cero, a su manera, cada respuesta, como la de la garantía, el presupuesto o el estado del vehículo. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas —sobre la garantía o el mantenimiento—, pero cada asesor de servicio tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de cliente están escritos, cada vehículo nuevo se entrega con un proceso definido, el mismo trabajo cuesta lo mismo y el equipo tiene respuestas guardadas para lo frecuente.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, cada vehículo se entrega con el mismo proceso, el mismo trabajo cuesta lo mismo con cualquier asesor de servicio y todo el equipo tiene a mano las mismas respuestas para lo frecuente.

- Existe un proceso escrito de entrega del vehículo nuevo —su revisión previa, la explicación de la garantía y del plan de mantenimiento y la primera cita en el taller—, con un resultado definido que el dueño debe alcanzar al terminarlo: saber cómo cuidar su vehículo y a quién acudir. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende el taller —por ejemplo, el dueño particular y la empresa con flota—, qué necesita cada uno, qué espera del servicio y cuáles se consideran clientes clave, consultable por cualquier asesor de servicio. `[3.5.F4]`
- Los presupuestos del taller salen de una lista vigente de precios de mano de obra y repuestos: el mismo trabajo cuesta lo mismo con cualquier asesor de servicio. `[3.5.F601 · comprobable]`

**Eficiente.**

**Óptimo.**

- Lo que la IA responde o escribe sola a los dueños —la confirmación de una cita, el estado de su vehículo— sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F1`, `3.5.F3`, `3.5.F5`, `3.5.E2`, `3.5.E3`.

#### 3.6 Priorización de clientes del taller

¿Cómo decide tu taller qué vehículo o qué caso se atiende primero?

*Descripción:* Mide si los casos se atienden según su gravedad y el tipo de cliente, y no según quién insiste más.

*Costo de quedarse:* El vehículo varado en la carretera espera en la misma fila que un cambio de aceite, y la empresa que te trae su flota recibe la misma atención que todos.

**Deficiente.**

- Los vehículos y los casos se atienden por orden de llegada o como prefiere cada asesor de servicio, sin mirar su gravedad ni quién es el cliente. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente —un vehículo varado, una falla de seguridad—, pero los casos no tienen una prioridad asignada: cada asesor de servicio decide a ojo, o se adelanta el dueño que más insiste. `[3.6.I1]`

**Funcional.**

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta: un vehículo varado o con una falla de seguridad va antes que un mantenimiento. `[3.6.F1]`

**Eficiente.**

**Óptimo.**

- Cada cliente se atiende con el contexto de cómo llegó —lo que se le prometió en la venta del vehículo, como un mantenimiento incluido, y el segmento del que viene—, que quien lo atiende, asesor de servicio o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F3`, `3.6.F4`, `3.6.F5`, `3.6.E1`, `3.6.E4`, `3.6.E5`, `3.6.O1`, `3.6.O2`.

#### 3.7 Seguimiento del vehículo

¿Cómo te enteras de que un cliente tiene un problema con su vehículo, o de que le toca volver al taller?

*Descripción:* Mide si el taller se adelanta a lo que necesita cada vehículo —el mantenimiento, la garantía, un llamado a revisión— o solo reacciona cuando el cliente llama.

*Costo de quedarse:* El cliente se acuerda de su mantenimiento cuando ya pasó el kilometraje, lo hace en otro taller y pierde la garantía, y te enteras de que quedó mal cuando lo publica en redes.

**Deficiente.**

- El taller nunca contacta al dueño por iniciativa propia: ni para su mantenimiento ni para avisarle de un llamado a revisión. `[3.7.D2]`

**Inicial.**

- Cuando un dueño tiene problemas repetidos con su vehículo —por ejemplo, vuelve una y otra vez al taller por la misma falla—, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Los reclamos que se repiten y las quejas se detectan, aunque sea a mano, los clientes clave reciben contacto antes de sus fechas críticas y cada dueño recibe el recordatorio de su próximo mantenimiento.

*Resultado:* Los reclamos que se repiten, las quejas y las fechas críticas de cada vehículo ya no toman al taller por sorpresa: el dueño vuelve a su mantenimiento cuando le toca y los problemas se atienden antes de que crezcan.

- Los clientes clave —por ejemplo, la empresa con flota— reciben contacto antes de sus fechas críticas —el fin de la garantía, el vencimiento de un contrato de mantenimiento o, si la hay, una renovación—, no después. `[3.7.F2]`
- Cada dueño recibe el recordatorio de su próximo mantenimiento según la fecha o el kilometraje que fija el plan de su vehículo, sin tener que acordarse él. `[3.7.F601 · comprobable · hábito]`

**Eficiente.**

- Cuando la marca anuncia un llamado a revisión que afecta a un vehículo vendido o atendido, su dueño recibe el aviso y una cita propuesta sin tener que buscarla. `[3.7.E601 · comprobable · hábito]`

**Óptimo.**

*Se leen igual:* `3.7.D1`, `3.7.F1`, `3.7.F3`, `3.7.F4`, `3.7.E1`, `3.7.E3`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.E8`, `3.7.O2`, `3.7.O3`, `3.7.O5`, `3.7.O6`.

#### 3.8 Escalabilidad del taller

¿Qué pasa con las preguntas que tus clientes hacen una y otra vez sobre la garantía, el mantenimiento o lo que cuesta un servicio?

*Descripción:* Mide si el taller puede atender a más vehículos sin crecer al mismo ritmo, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas cada día, y cada vehículo que vendes suma más de esas preguntas a la fila del taller.

**Deficiente.**

- Hasta las preguntas que más se repiten —qué cubre la garantía, cuánto cuesta un mantenimiento— se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.**

- Hay algunas respuestas publicadas, pero sueltas: no cubren lo que más preguntan los dueños —la garantía, el plan de mantenimiento, el costo de un servicio—, que se sigue respondiendo a mano. `[3.8.I2]`

**Funcional.**

- Las diez preguntas que más repitieron los clientes en el último trimestre —o todas, si son menos—, por ejemplo qué cubre la garantía, cada cuánto se hace el mantenimiento o cuánto cuesta un servicio, tienen una respuesta publicada que el cliente puede consultar por su cuenta. `[3.8.F1]`

**Eficiente.**

- Los patrones de las fallas que se repiten en un modelo se comparten con la marca y con el equipo del taller, para atenderlas antes y documentar su solución. `[3.8.E601 · declarado · hábito]`

**Óptimo.**

- Los picos de demanda —como la temporada de mantenimientos o un llamado a revisión— los absorben la IA y el autoservicio: el equipo no crece cuando crece la cartera de vehículos que atiende, y el líder ve en los tableros del área qué parte de la demanda resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`

*Se leen igual:* `3.8.D1`, `3.8.I1`, `3.8.F2`, `3.8.E1`, `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O1`, `3.8.O3`, `3.8.O4`.

## Edición — Maquinaria y equipo pesado

Para el distribuidor de maquinaria —de construcción, agrícola, de minería o industrial— y de camiones que vende máquinas nuevas y usadas a empresas, contratistas, productores e instituciones, y que atiende su posventa en el taller y en el lugar de trabajo del cliente: un asesor trabaja cada venta, de la primera consulta a la visita a la obra o a la finca, la demostración, la cotización, el financiamiento, el recibo de la máquina usada como parte de pago y la entrega técnica, y la posventa atiende después el mantenimiento, las reparaciones en el taller y en campo, la garantía y los repuestos que instala. La venta de la máquina, también la de una flota o la de una licitación, se mide en Ventas; el taller, el servicio en campo y la garantía, en Servicio. Recordarle al cliente el mantenimiento de su máquina es de Servicio; ofrecerle renovarla o sumar otra a su flota, de Ventas. Donde el distribuidor vende solo usados, lo que toca a la marca —sus campañas, sus boletines de servicio, sus garantías— no aplica. La venta de repuestos al público en mostrador o en línea, el fabricante que no le vende al cliente final y la empresa que solo alquila maquinaria se miden con la escala general.

*Clave:* maquinaria

*Perfil habitual:* con equipo · recompra.

*Criterios propios:* desde el 701.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Prospecto | Interesado en una máquina |
| Negocio | Negocio: la venta de una máquina o de un lote de máquinas, de la primera consulta a la entrega técnica |
| Lead | Interesado en una máquina |
| Pipeline | El recorrido de la venta: consulta, visita a la obra o a la finca, demostración, cotización, financiamiento, cierre y entrega técnica |
| Revisión del pipeline | Reunión de seguimiento de ventas |
| Vendedor | Asesor de ventas |
| Propuesta | La cotización de la máquina: modelo y configuración, implementos, precio, valor de la usada que se recibe, financiamiento, garantía, plan de mantenimiento y fecha de entrega |
| Material de venta | Fichas técnicas, comparativos de modelos, cálculos de rendimiento y de costo de operación, fotos y videos de la máquina trabajando |
| Razón de pérdida | Por qué el interesado no compró: el precio, el financiamiento que no salió, el valor de su usada, el plazo de entrega, el respaldo de posventa o porque compró otra marca |
| Cliente ideal | El comprador objetivo de cada línea de máquinas |
| Pronóstico | Proyección de ventas por línea y por modelo |
| Cliente | El dueño de la máquina: una constructora, un contratista, un productor, una institución o una empresa con su flota |
| Caso | Caso de posventa: una cita de taller, una visita de servicio en campo, una reparación, un reclamo de garantía, un pedido de repuestos o una consulta |
| Agente | Asesor de servicio |
| Buyer persona | Perfil de comprador: quién es, qué trabajo hace la máquina y cómo decide, como el contratista que compra su primera retroexcavadora o la empresa que renueva su flota |
| Traspaso | El de un interesado de Marketing a un asesor, o el de un comprador de Ventas a la posventa |

### Área 1 — Ventas

Mide el rendimiento de la venta de maquinaria del distribuidor: cómo está montada por dentro y qué produce en demostraciones, ventas y entregas técnicas, y en clientes que vuelven a renovar o a sumar máquinas a su flota. Vale igual si la venta la trabaja un equipo de asesores o uno solo.

**Deficiente.** Tus ventas dependen de quién atienda. Cada asesor lleva a sus clientes en su teléfono, los precios y las condiciones viven en una hoja que no siempre está al día, y nadie sabe cuántas consultas y cuántas demostraciones se quedaron sin seguimiento.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados se registran cuando el asesor se acuerda, cada quien cotiza a su manera y el financiamiento y la máquina usada se negocian por fuera del sistema.

**Funcional.** Tu equipo comercial opera como una maquinaria base. Cada interesado entra al mismo recorrido, todos venden con la misma lista de precios y el mismo inventario, cada demostración deja su siguiente paso y ninguna cotización se enfría sin que alguien reaccione.

**Eficiente.** La venta deja de depender del empuje de cada asesor. Mides cuántas consultas llegan a una demostración y cuántas demostraciones a una venta, conoces la capacidad de pago antes de apartar una máquina o pedirla a la marca, acompañas cada venta hasta la entrega técnica y proyectas las ventas de cada línea con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA responden, califican y agendan visitas y demostraciones a toda hora; los modelos dicen qué interesado está listo, qué máquina ofrecerle y qué cliente ya está por renovar o ampliar su flota.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus asesores cada venta, desde la primera consulta hasta la entrega técnica de la máquina?

*Descripción:* Mide si la venta sigue un proceso escrito, de la consulta a la entrega técnica, que no depende de cada asesor.

*Costo de quedarse:* Si se va un asesor, se lleva a sus clientes en el teléfono: nadie sabe a quién se le hizo una demostración, a quién se le cotizó ni qué máquina usada se le avaluó.

**Deficiente.**

- No hay nada escrito sobre el recorrido de la venta ni sus etapas —consulta, visita, demostración, cotización, financiamiento, cierre y entrega técnica—: cada asesor usa su criterio. `[1.1.D1]`

**Inicial.**

- Las etapas de la venta —consulta, visita, demostración, cotización, cierre y entrega técnica— existen de palabra o en un borrador, pero cada asesor las interpreta distinto. `[1.1.I1]`

**Funcional.** Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la entrega técnica, con una cadencia de contacto, un proceso escrito para recibir la máquina usada y una revisión fija de los negocios.

*Resultado:* Si rota un asesor, el siguiente sabe en qué va cada cliente, porque todo el equipo trabaja la venta igual en el CRM: los negocios avanzan con los mismos criterios, cada demostración deja su siguiente paso, la máquina usada se recibe siempre de la misma forma, cada interesado se contacta con la cadencia acordada y los negocios se repasan en cada reunión de seguimiento.

- Cualquier asesor explica igual las etapas de la venta —consulta, visita, demostración, cotización, financiamiento, cierre y entrega técnica— y qué tiene que cumplirse para avanzar. `[1.1.F1]`
- Cada tipo de venta —máquinas nuevas, usadas, flotas para empresas y licitaciones públicas— tiene su propio recorrido en el CRM, con lo que el negocio tiene que cumplir para pasar de cada etapa a la siguiente. `[1.1.F2]`
- Toda demostración —en la obra, en la finca o en el patio del distribuidor— queda registrada con la máquina que se mostró, su resultado y el siguiente paso acordado. `[1.1.F701 · comprobable · hábito · venta con equipo]`
- El proceso para recibir una máquina usada como parte de pago está escrito: quién la inspecciona, con qué criterios —las horas de uso, el estado y el historial de mantenimiento—, cuánto tiempo vale la oferta y cómo se le explica al cliente. `[1.1.F702 · declarado]`

**Eficiente.**

- Hay playbooks escritos de descubrimiento, calificación y manejo de objeciones, por ejemplo para saber qué trabajo va a hacer la máquina, cómo la va a pagar el cliente y qué respaldo de posventa espera. `[1.1.E2]`

**Óptimo.**

- La IA corrige sola lo que se sale del proceso —crea el seguimiento de una demostración que falta, completa la máquina de interés, reasigna el negocio— y el líder revisa en el CRM lo que no pudo resolver. `[1.1.O4]`

*Se leen igual:* `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.F7`, `1.1.F8`, `1.1.E1`, `1.1.E3`, `1.1.E5`, `1.1.E6`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se aparta una máquina?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las consultas, avisar qué toca, mostrar el inventario, apartar la máquina que se vende y registrar las conversaciones— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tus asesores copian a mano las consultas de la web, de la marca y de las ferias, dependen de su memoria para dar seguimiento y descubren que la máquina ya estaba apartada cuando el cliente ya se había decidido.

**Deficiente.**

- No hay un CRM donde montar una automatización: las consultas y las ventas de máquinas se pasan por correo, por chat o WhatsApp o de palabra, y ningún asesor recibe avisos del sistema. `[1.2.D2]`

**Inicial.**

- Hay un CRM, pero nada pasa solo: las consultas de la web, la marca y las ferias se reparten a mano y cada asesor tiene que acordarse de sus seguimientos, como el de cada demostración y cada cotización. `[1.2.I1]`

**Funcional.** Lo básico pasa solo —las consultas de todos los canales entran al sistema y se reparten por una regla, el sistema avisa qué toca y la máquina que se aparta queda marcada— y, si se usa IA, trabaja con los datos de cada cliente.

*Resultado:* Ninguna consulta se pierde por no saber a quién le toca: la que llega por la web, por la marca o por una feria entra sola, el asesor recibe el aviso y deja de depender de su memoria, ve qué máquinas están disponibles antes de ofrecerlas, y una que ya se apartó no se le ofrece a nadie más.

- Las consultas que entran —de la web, la marca, las redes, las ferias y la sucursal— llegan a una bandeja o cola y se asignan por una regla simple: por turnos, por zona, por línea de máquinas o según la fuente de donde llegan. `[1.2.F2]`
- El asesor puede ver qué máquinas están en inventario, en tránsito o por pedir a la marca, con su modelo y su configuración, antes de ofrecer una, en el CRM o en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8]`
- Apartar o vender una máquina la marca en el inventario en el momento: no se le ofrece a otro cliente ni se aparta dos veces. `[1.2.F701 · comprobable]`

**Eficiente.** Las cotizaciones salen del sistema, la solicitud de financiamiento viaja sola a los bancos y las arrendadoras, el CRM se conecta con el sistema del distribuidor y el equipo usa la IA en su trabajo diario.

*Resultado:* El asesor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones de las máquinas se generan desde el sistema —por ejemplo, con el modelo, la configuración y el precio vigentes—, no como documentos sueltos. `[1.2.E1]`
- Si el distribuidor lleva su inventario, sus pedidos a la marca, su facturación, sus repuestos o su taller en otro sistema —un ERP o el sistema de gestión del distribuidor—, el CRM está conectado con él. `[1.2.E3]`
- La solicitud de financiamiento sale del sistema hacia los bancos, las financieras o las arrendadoras con los datos del cliente, y su respuesta vuelve al negocio, sin pasarla a mano. `[1.2.E701 · comprobable · venta con equipo]`

**Óptimo.** La IA responde, califica, agenda visitas y demostraciones y calcula qué negocios van a cerrar; el asesor valida y se queda con las conversaciones que deciden la venta.

- Si el equipo atiende por un canal conversacional, agentes de IA califican ahí a los interesados con la definición de interesado calificado y agendan visitas y demostraciones a cualquier hora; le pasan al asesor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que calificaron. `[1.2.O2]`

*Se leen igual:* `1.2.D1`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F6`, `1.2.F7`, `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O3`, `1.2.O4`, `1.2.O5`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus negocios y de tu inventario de máquinas antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: negocios completos, el origen de cada uno, el inventario al día y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de ventas se arma a mano cruzando el CRM con el inventario, y no sabes qué feria o qué campaña te trae compradores y cuál solo consultas.

**Deficiente.**

- Las ventas de máquinas no quedan registradas con su monto y su fecha: no se sabe cuántas máquinas se vendieron, por cuánto ni cuándo. `[1.3.D4]`

**Inicial.**

- Los negocios que se crean hoy se registran, pero a algunos les falta la fecha esperada de cierre, el monto o el asesor responsable. `[1.3.I3]`

**Funcional.** El reporte de negocios sale del sistema, sin armarlo a mano, y el estado de cada máquina está al día: a los dos se les puede creer.

*Resultado:* El líder ve el estado real de los negocios y del inventario cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada interesado.

- Todo negocio creado desde la puesta en marcha del recorrido actual —la venta de una máquina, de una flota o una licitación— tiene la fecha esperada de cierre, el monto y el asesor responsable. `[1.3.F1]`
- Todo negocio creado desde la puesta en marcha del recorrido actual dice por dónde llegó el interesado: la sucursal, la web, la marca, las redes, una feria, una licitación o un referido. `[1.3.F3]`
- El estado de cada máquina del inventario —disponible, apartada, vendida o entregada— está al día en el sistema y coincide con lo que se facturó. `[1.3.F701 · comprobable · requiere 1.2.F8]`

**Eficiente.** Aparece una proyección de ventas confiable, se mide cuánto tarda en venderse cada máquina y la ficha del cliente reúne sus compras, su financiamiento, su flota y su posventa.

*Resultado:* El distribuidor puede comprometer un número de ventas con confianza y planear con ese número sus pedidos a la marca y su inventario de usadas.

- Hay una proyección de las ventas de máquinas que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% de lo proyectado. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si el distribuidor lleva en otros sistemas la facturación, el financiamiento, los repuestos o el taller, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se mide cuánto tarda en venderse cada modelo nuevo y cada máquina usada en inventario, y ese número se revisa cada mes. `[1.3.E701 · comprobable · hábito]`

**Óptimo.**

- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, la facturación, su flota, sus visitas al taller, sus servicios en campo, sus reclamos y las conversaciones. `[1.3.O3]`

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.D3`, `1.3.I1`, `1.3.I2`, `1.3.F2`, `1.3.F4`, `1.3.F8`, `1.3.F9`, `1.3.F10`, `1.3.E4`, `1.3.E5`, `1.3.O1`, `1.3.O2`, `1.3.O4`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué asesores van bien y cuáles necesitan ayuda?

*Descripción:* Mide si cada asesor tiene un rol, una zona y una meta por escrito, y si el líder sigue los números de la venta y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes o del trimestre de que no llegó a la meta de la marca: no vio antes qué asesor se quedó atrás ni en qué etapa se cayeron los negocios.

**Deficiente.**

- El líder apaga incendios: no hay métricas —ni de consultas, ni de demostraciones, ni de ventas— ni rendición de cuentas. `[1.4.D2]`

**Inicial.**

- El líder revisa algunos números —las ventas del mes, las máquinas en inventario— en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —consultas, demostraciones, cotizaciones, ventas, entregas y máquinas en inventario— y lo consulta al menos una vez por semana. `[1.4.F2]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con las áreas que cierran la venta y, si Marketing pasa interesados, también las del traspaso.

*Resultado:* Un asesor nuevo produce más rápido, el financiamiento, el avalúo de la usada y la entrega técnica no se traban entre áreas, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —las líneas de máquinas, los precios, el financiamiento y los sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con las áreas que cierran la venta —financiamiento, el avalúo de usadas, la importación y la preparación de la máquina y la entrega técnica— está escrito y se mide: qué recibe cada una y en cuánto tiempo responde. `[1.4.E701 · comprobable]`
- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo —por ejemplo, entre sus máquinas, su financiamiento, sus repuestos y su taller—, cuánto margen deja cada canal y cuánto aporta cada asesor. `[1.4.E6]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué línea y qué canal dejan más margen, qué máquina se vende más rápido y cuánto deja cada cliente entre sus compras y su posventa.

- Hay responsables de validar lo que hace la IA en la venta de máquinas, y lo que puede decidir sola —por ejemplo, agendar una demostración o mandar una ficha técnica— está por escrito. `[1.4.O3]`

*Se leen igual:* `1.4.D1`, `1.4.I2`, `1.4.F3`, `1.4.F4`, `1.4.F6`, `1.4.F7`, `1.4.E3`, `1.4.E4`, `1.4.E5`, `1.4.O2`, `1.4.O4`.

#### 1.5 Líneas de máquinas y cotización

¿Cómo sabe un asesor que entra a tu equipo a quién le vende cada línea de máquinas y con qué precios y condiciones?

*Descripción:* Mide si el equipo sabe para quién es cada línea de máquinas, si la cotización llega igual con cualquier asesor y, si se vende por más de un canal, si los precios y las condiciones son coherentes en todos.

*Costo de quedarse:* Cada asesor cotiza con su propia hoja y sus propias condiciones: el cliente recibe dos precios para la misma máquina, desconfía y se va a cotizar con el distribuidor de otra marca.

**Deficiente.** Nadie puede decir con claridad para quién es cada línea de máquinas, no hay una lista de precios y condiciones que todos usen y cada asesor cotiza a su manera: el cliente recibe precios distintos según quién lo atienda.

- Hay más de una lista de precios o de condiciones circulando, y no se sabe cuál es la vigente. `[1.5.D701 · comprobable]`

**Inicial.** Hay una lista de precios y fichas de cada modelo, pero cada asesor arma la cotización por su cuenta.

- Hay una plantilla de cotización, pero cada asesor la cambia o la usa a su manera. `[1.5.I2]`

**Funcional.** El comprador objetivo de cada línea está escrito, y todos venden con los mismos precios, las mismas condiciones y la misma cotización.

*Resultado:* Dos clientes parecidos reciben la misma información de la máquina y una cotización igual de clara —modelo, configuración, implementos, precio, financiamiento, valor de la usada, garantía y fecha de entrega—, sin importar qué asesor los atienda.

- Existe un documento con el comprador objetivo de cada línea de máquinas —a quién va dirigida, qué trabajo hace y cómo paga—, consultable por cualquier asesor. `[1.5.F1]`
- El líder puede explicar quién es el comprador objetivo de cada línea de máquinas sin consultar su documentación. `[1.5.F2]`
- Las cotizaciones están estandarizadas: tienen una estructura común reconocible —por ejemplo, modelo y configuración, implementos, precio, financiamiento, valor de la usada, garantía y fecha de entrega—, no armada desde cero cada vez. `[1.5.F4]`
- Hay una sola lista vigente de precios, implementos y promociones por modelo y configuración, y todas las cotizaciones salen de ella. `[1.5.F701 · comprobable]`

**Eficiente.** La propuesta se distingue de la de otros distribuidores y otras marcas, y solo promete lo que se va a entregar.

*Resultado:* Los interesados ven qué distingue al distribuidor —la máquina, el financiamiento y el respaldo de posventa—: la propuesta dice lo mismo en el sitio, en la sucursal y en boca de cada asesor, y lo que se le prometió al cliente —la fecha de entrega, los implementos, las condiciones del financiamiento— es lo que recibe.

- Las cotizaciones solo prometen lo que se va a entregar: la fecha de entrega, los implementos y las condiciones del financiamiento se validan antes de enviarlas. `[1.5.E3]`
- Los cambios de precio, de condiciones y de promociones les llegan el mismo día a todos los asesores y a todos los canales. `[1.5.E701 · comprobable · hábito]`
- En las ventas de más valor y en las de flota, la cotización compara el costo de operación de la máquina en el trabajo del cliente —su rendimiento, su consumo y su mantenimiento—, no solo su precio. `[1.5.E702 · comprobable · venta con equipo]`

**Óptimo.**

- La IA revisa en tiempo real, contra la propuesta de valor vigente del distribuidor, lo que se les dice a los interesados —en la sucursal, por WhatsApp o en la cotización—, lo escriba ella o el asesor; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D1`, `1.5.D2`, `1.5.I1`, `1.5.I3`, `1.5.F3`, `1.5.F5`, `1.5.F6`, `1.5.E2`, `1.5.E4`.

#### 1.6 Priorización de interesados

¿Cómo decide tu equipo a qué interesados dedicarles tiempo, visitas y demostraciones primero?

*Descripción:* Mide si el equipo decide a qué interesados dedicar su tiempo con criterios escritos, según el comprador objetivo de cada línea de máquinas.

*Costo de quedarse:* Tus asesores le hacen una demostración a todo el que la pide: mueven una máquina a la obra de quien no puede financiarla, y los compradores listos esperan su turno.

**Deficiente.**

- No hay criterios para distinguir a un interesado que va a comprar de uno que solo pregunta precios: se pierden tiempo, visitas y demostraciones con interesados que nunca van a comprar. `[1.6.D1]`

**Inicial.**

- El líder sabe quién es el comprador objetivo de cada línea de máquinas, pero el CRM no tiene los campos —máquina de interés, trabajo que va a hacer, presupuesto, forma de pago— para separar a los interesados que encajan. `[1.6.I2]`

**Funcional.** Los interesados se separan por los rasgos del comprador objetivo —máquina, trabajo que va a hacer, presupuesto, forma de pago, si entrega una usada— y hay una definición escrita de interesado calificado que el equipo aplica.

*Resultado:* El equipo deja de dedicarle visitas y demostraciones a quien no encaja con el comprador objetivo y concentra el esfuerzo en quien sí encaja y cumple la definición de interesado calificado, con su presupuesto, su forma de pago y su plazo de compra.

- El equipo segmenta a los interesados por los atributos del comprador objetivo antes de trabajarlos: la máquina que busca, el trabajo que va a hacer, el presupuesto, la forma de pago, si entrega una usada o si compra para una flota. `[1.6.F1]`
- Los rasgos del comprador objetivo —máquina de interés, trabajo que va a hacer, presupuesto, forma de pago y si entrega una usada— son campos del CRM y de los formularios de consulta. `[1.6.F4]`

**Eficiente.**

- La capacidad de pago del interesado o la precalificación de su financiamiento se conoce antes de apartar una máquina o de pedirla a la marca. `[1.6.E701 · comprobable · venta con equipo]`

**Óptimo.**

- Si en la decisión de compra participan varias personas —el dueño, el jefe de operaciones o de mantenimiento, el de compras o el de finanzas—, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el asesor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3]`

*Se leen igual:* `1.6.I1`, `1.6.F2`, `1.6.F3`, `1.6.E3`, `1.6.E4`, `1.6.E5`, `1.6.E6`, `1.6.E7`, `1.6.O4`, `1.6.O5`.

#### 1.7 Seguimiento de demostraciones y cotizaciones

¿Qué pasa con quien vio la demostración y no volvió a contestar, o con la venta que no avanza hacia la entrega?

*Descripción:* Mide si alguien detecta cuando un negocio deja de avanzar —después de la demostración, de la cotización o mientras se espera el financiamiento— y si hay un paso acordado para retomarlo; y, donde el cliente vuelve a comprar, si se le busca cuando ya le toca renovar o ampliar su flota.

*Costo de quedarse:* Los interesados se enfrían después de la demostración y las cotizaciones quedan sin respuesta sin que nadie llame: el cliente termina comprando con el distribuidor de otra marca que sí le dio seguimiento.

**Deficiente.** El asesor está solo con sus clientes: después de la demostración o de la cotización, nadie da seguimiento.

- No hay material de venta —fichas técnicas, comparativos de modelos, cálculos de rendimiento, fotos o videos— para mostrarles a los interesados. `[1.7.D4]`

**Inicial.**

- Cuando un negocio se detiene —por ejemplo, después de la demostración o de la cotización—, cada asesor decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`
- Todos los intentos de hacer avanzar un negocio se hacen por el mismo canal: por ejemplo, el asesor solo llama, o solo escribe por WhatsApp. `[1.7.I4]`

**Funcional.** Ningún negocio se enfría en silencio después de la demostración o de la cotización: se detecta y hay un paso acordado para retomarlo.

*Resultado:* Los negocios que se traban se detectan y se retoman por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Cada demostración y cada cotización reciben su seguimiento, y el cliente que ya debería renovar su máquina no se deja al azar.

- Hay material de venta estandarizado —fichas técnicas, comparativos de modelos, cálculos de rendimiento y de costo de operación, fotos y videos de la máquina trabajando— que ayuda a cerrar la venta. `[1.7.F4]`
- Toda demostración y toda cotización reciben seguimiento dentro del plazo acordado. `[1.7.F701 · comprobable · hábito · venta con equipo · requiere 1.1.F701]`

**Eficiente.**

- Los interesados que todavía no están listos para comprar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven a un asesor cuando muestran interés, llega la máquina que buscaban o se acerca su temporada de compra. `[1.7.E2]`
- Entre el cierre y la entrega, el comprador recibe cómo va su máquina —el pedido a la marca, la importación, la aprobación del financiamiento y la preparación para la entrega técnica— sin tener que pedirlo. `[1.7.E701 · comprobable · hábito]`

**Óptimo.**

- Con las reglas que fijó el líder, la IA actúa sola en los negocios de más valor que se traban —por ejemplo, la renovación de una flota que no avanza después de la demostración: envía el contenido o avisa a quien corresponde— y el líder revisa en el CRM lo que hizo. `[1.7.O3]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.I2`, `1.7.I3`, `1.7.F1`, `1.7.F2`, `1.7.F3`, `1.7.F6`, `1.7.F7`, `1.7.E1`, `1.7.E3`, `1.7.E4`, `1.7.E5`, `1.7.E6`, `1.7.E7`, `1.7.O2`.

#### 1.8 Ventas ganadas y perdidas

¿Qué queda registrado cuando un interesado no compra o una venta se cae antes de la entrega?

*Descripción:* Mide si queda registrado por qué no compra un interesado o por qué se cae una venta antes de la entrega, y si el equipo revisa lo que gana y lo que pierde para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes ventas —el precio, el financiamiento que no salió, el valor de la usada, el plazo de entrega, la otra marca—: cada asesor tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Deficiente.**

- Los negocios perdidos se cierran sin anotar por qué el interesado no compró: ni el precio, ni el financiamiento, ni el valor de su usada, ni el plazo de entrega, ni la otra marca. `[1.8.D2]`

**Inicial.**

- Por qué el interesado no compró se anota a veces y en texto libre, a criterio de cada asesor, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada negocio perdido y cada venta que se cae quedan con su razón, elegida de una lista fija, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no compran los interesados y por qué se caen las ventas antes de la entrega, con datos del trimestre y no con impresiones.

- Todo negocio creado desde la puesta en marcha del recorrido actual que se dio por perdido tiene registrada su razón. `[1.8.F1]`
- Cada venta que se cae después del cierre —porque no salió el financiamiento, el cliente desistió, se cayó la licitación o la máquina no llegó— deja registrada su razón. `[1.8.F701 · comprobable]`

**Eficiente.**

- Al menos una vez por trimestre se revisan las ventas ganadas, los negocios perdidos y las ventas que se cayeron para encontrar lo que se repite. `[1.8.E1]`
- Cuando el cliente compró otra marca o con otro distribuidor, queda registrado cuál y por qué. `[1.8.E701 · comprobable]`

**Óptimo.**

- La IA analiza las llamadas con los interesados —también las de video— y le deja a cada asesor recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1]`

*Se leen igual:* `1.8.D1`, `1.8.F2`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.E4`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del área de marketing del distribuidor: cómo está montada por dentro y qué produce en presencia, interesados y demostraciones para cada línea de máquinas, y en clientes que vuelven por repuestos y servicio. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que el distribuidor dirige, también cuando parte de las campañas las pone la marca.

**Deficiente.** Tus máquinas no las presentas tú: las presenta la marca o la feria. Cada anuncio dice algo distinto, las herramientas están sueltas y la pauta corre hasta agotar el presupuesto sin que nadie mida qué dejó. Los interesados llegan por accidente.

**Inicial.** Tienes logo, fotos de las máquinas y redes, pero no hay una estrategia detrás. Publicas cuando llega un modelo o una promoción de la marca, y los resultados de cada campaña se miden tarde y a mano. Llegan consultas, pero no siempre sabes de dónde vienen.

**Funcional.** Tu marketing dejó de depender de una persona. La marca y los perfiles de comprador están escritos, cada modelo tiene su página, el calendario sigue los lanzamientos, las ferias y las temporadas de tus clientes, y los canales que elegiste en tu plan salen con regularidad y anuncian solo lo que está disponible. Sabes de dónde llega cada interesado y cuánto te cuesta en cada canal.

**Eficiente.** Probar y ajustar ya es rutina. Sabes qué aportó cada canal a cada venta y cuánto te cuesta cada demostración y cada venta en cada canal y en cada línea, el mensaje se adapta solo a cada tipo de comprador, la IA asiste a tu equipo en su trabajo diario y tu distribuidora aparece cuando alguien busca una máquina en tu país, en buscadores y en asistentes de IA.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. El contenido de cada línea se genera y se ajusta de forma continua; la IA adapta el mensaje a lo que hizo cada interesado y mueve la pauta entre canales dentro de los límites que fija el equipo; y los clientes satisfechos que identifica Servicio traen compradores nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma una campaña en tu equipo, desde que se decide hasta que sale en la pauta, en las redes o en una feria?

*Descripción:* Mide si la promoción de cada línea de máquinas y de la posventa sale de un plan y un calendario compartidos, sin depender de nadie.

*Costo de quedarse:* Cada lanzamiento depende de quien lo arma: si esa persona se va, la campaña del modelo nuevo o de la próxima feria sale tarde o sin plan.

**Deficiente.**

- No hay calendario de campañas: cada lanzamiento, cada feria y cada promoción se improvisan. `[2.1.D1]`

**Inicial.**

- Las campañas dependen de quien las arma —una persona del equipo, la agencia o la marca—: el calendario, los accesos a la pauta y a las redes y los pasos a seguir están en sus manos. `[2.1.I3]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y el calendario sigue el año del distribuidor y de sus clientes.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la promoción de cada línea sigue saliendo aunque cambie una persona: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- Si una agencia —o la marca, con sus campañas— ejecuta todo o parte del trabajo, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia la agencia. `[2.1.F5]`
- El calendario de campañas sigue el año del distribuidor y de sus clientes: el lanzamiento de cada modelo, las ferias de construcción y agropecuarias, las temporadas de siembra y de cosecha, los presupuestos de obra pública y las campañas de la marca y de posventa. `[2.1.F701 · declarado]`

**Eficiente.**

- Cada pieza —el anuncio de una máquina, la invitación a una demostración o a una feria— pasa por una revisión con lista escrita y una aprobación registrada. `[2.1.E5]`

**Óptimo.**

- El sistema detecta por sí mismo cuando una campaña se sale del proceso —un paso que se saltó, una fecha que venció antes de una feria o de una temporada— y se lo avisa al líder y al responsable; el líder decide el ajuste, y cada aviso queda en el sistema. `[2.1.O4]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F6`, `2.1.E4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide una cotización o una demostración en tu sitio, o te escribe por WhatsApp?

*Descripción:* Mide si las herramientas que se pagan se usan, si cada interesado que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien pide una cotización en tu sitio o te escribe por WhatsApp espera a que alguien lo cargue y le conteste, o se va con otro distribuidor, y si pagas herramientas, parte de lo que pagas no se usa.

**Deficiente.**

- Lo que llega por el sitio, las redes o WhatsApp —una solicitud de cotización, una pregunta por una máquina usada— cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`

**Inicial.**

- Hay alguna automatización, pero quedó a medias: por ejemplo, el formulario de demostración responde solo y el de cotización no le avisa a nadie. `[2.2.I3]`

**Funcional.**

*Resultado:* Todo lo que entra por el sitio, por la marca, por las ferias y, si se usa, por WhatsApp o el chat llega al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Si el sitio tiene formularios para pedir una cotización o una demostración, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`

**Eficiente.**

- El traspaso de interesados a los asesores es automático: cuando un interesado cumple los criterios para pasar a un asesor, le llega con su historial al asesor que corresponde, sin que nadie lo pase a mano. `[2.2.E3]`

**Óptimo.**

- Si el distribuidor atiende por un canal conversacional, agentes de IA responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para hablar con un asesor —por ejemplo, el productor que piensa comprar después de la cosecha—, y lo que la persona responde alimenta su ficha; lo que no pueden resolver pasa a una persona con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O5]`

*Se leen igual:* `2.2.D1`, `2.2.D3`, `2.2.I1`, `2.2.I2`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.F10`, `2.2.F11`, `2.2.E1`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.E8`, `2.2.O1`, `2.2.O3`, `2.2.O4`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántos interesados entran, de dónde vienen y cuántos llegan a una demostración?

*Descripción:* Mide si los datos de marketing son confiables: de dónde llega cada interesado, en qué etapa está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de qué feria o de qué anuncio llega cada interesado ni cuántos terminan en una demostración: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle.

**Deficiente.**

- No se registra de dónde llegó cada interesado: nadie sabe si vino por el sitio, una feria, la marca o una recomendación. `[2.3.D1]`

**Inicial.**

- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los interesados le falta el origen, como la feria, la pauta o la marca de donde llegaron. `[2.3.I2]`

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada interesado —la pauta, las redes, la marca, una feria o un referido—, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, WhatsApp, la marca, una feria o la sucursal— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los reportes básicos —cuántos interesados entran por línea de máquinas, de dónde vienen y cuántos llegan a una demostración— salen del sistema sin armarlos a mano. `[2.3.F5]`

**Eficiente.**

- Se sabe cuánto ingreso deja cada canal —la pauta, las ferias, la marca o los referidos—, también el conversacional si se usa. `[2.3.E5]`

**Óptimo.**

- Cada persona tiene una sola ficha que junta al momento lo que hace en todos los canales —por ejemplo, el sitio, WhatsApp, el correo y lo que se registra en las ferias—. `[2.3.O5]`

*Se leen igual:* `2.3.D2`, `2.3.I1`, `2.3.F2`, `2.3.F3`, `2.3.F6`, `2.3.F8`, `2.3.F9`, `2.3.E1`, `2.3.E2`, `2.3.E6`, `2.3.E7`, `2.3.O1`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los interesados y las demostraciones de cada línea de máquinas?

*Descripción:* Mide si cada persona sabe qué le toca en la promoción de las máquinas y de la posventa, si el equipo tiene metas y si decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué línea se promociona se decide por costumbre, por lo que pide la marca o por quien insiste más, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Deficiente.**

- Nadie revisa los resultados de marketing —lo que dejan las campañas de las máquinas y de la posventa—: ni el equipo ni la dirección. `[2.4.D3]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué máquina usada publicar, qué anuncio de un modelo aprobar— espera a que lo resuelva la gerencia general del distribuidor. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —interesados nuevos por línea, de dónde llegan, cuántos pasan a un asesor y cuántos llegan a una demostración— y lo consulta al menos una vez por semana. `[2.4.F2]`
- Las decisiones sobre qué promocionar y en qué enfocarse —qué línea, qué usadas, qué servicio de posventa— citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —el valor de vida de los clientes que trae, entre las máquinas que compran y sus repuestos y servicio— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

- Lo que la IA puede decidir sola en marketing —por ejemplo, mover la pauta entre las líneas de máquinas o responder una consulta de una campaña— está por escrito. `[2.4.O6]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.I2`, `2.4.F3`, `2.4.F5`, `2.4.F7`, `2.4.E2`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`.

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza para publicar, y qué encuentra un interesado cuando busca una máquina en tu sitio?

*Descripción:* Mide si la marca del distribuidor se ve y suena igual en todo lo que sale, si está escrito a qué comprador le habla, si cada modelo tiene dónde mostrarse completo y si el sitio aparece en buscadores.

*Costo de quedarse:* Cada anuncio se ve distinto al anterior y, cuando alguien busca una máquina en tu país, encuentra el sitio de otro distribuidor, o encuentra el tuyo sin ficha técnica ni forma de pedir una cotización.

**Deficiente.**

- No está escrito a quién le habla el distribuidor: no hay perfiles de comprador. `[2.5.D2]`

**Inicial.**

- Hay logo, colores y plantillas, pero el perfil de comprador es uno solo y tan general que sirve para cualquiera: no distingue al contratista que compra su primera máquina de la empresa que renueva su flota. `[2.5.I1]`

**Funcional.** La marca, la voz y los perfiles de comprador están escritos y se usan, cada modelo tiene su página, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes.

*Resultado:* La marca se ve y suena igual en todo lo que sale, cada modelo tiene dónde mostrarse completo, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Cada modelo en venta tiene su página en el sitio, con su configuración, sus implementos, la ficha técnica, fotos o videos trabajando y cómo pedir una cotización o una demostración. `[2.5.F701 · comprobable]`

**Eficiente.**

- El recorrido de compra está dibujado de punta a punta —de la primera búsqueda a la demostración, la cotización, la entrega técnica y la primera visita de servicio—, con los puntos de contacto de cada etapa. `[2.5.E4]`

**Óptimo.**

- La IA produce y ajusta el contenido de cada línea de máquinas de forma continua —también para la búsqueda conversacional y los asistentes de IA—; el equipo valida cada pieza antes de publicarla, y en el sistema se ve qué produjo o cambió la IA y quién lo aprobó. `[2.5.O2]`

*Se leen igual:* `2.5.D1`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F5`, `2.5.F6`, `2.5.F7`, `2.5.E2`, `2.5.E3`, `2.5.E6`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un interesado según el tipo de comprador que es y la máquina que busca?

*Descripción:* Mide si cada interesado recibe un mensaje pensado para su tipo de comprador y la máquina que busca, y si cada cliente recibe lo que corresponde a las máquinas que ya tiene.

*Costo de quedarse:* Le mandas la misma promoción a todos: el productor agrícola recibe la oferta pensada para la constructora, y quien acaba de comprar recibe la publicidad de la máquina que ya tiene.

**Deficiente.**

- No hay segmentos: las campañas salen a toda la base con el mismo mensaje, a quien busca su primera máquina igual que al cliente que acaba de comprar. `[2.6.D1]`

**Inicial.**

- La base se separa solo por datos generales —país, zona o tamaño de la empresa—, no por lo que cada grupo necesita, como el trabajo que hace o las máquinas que ya tiene. `[2.6.I1]`

**Funcional.**

- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento: no le hablan igual a la constructora que al productor agrícola o a la empresa de transporte. `[2.6.F3]`

**Eficiente.**

- Hay secuencias distintas por segmento o por etapa del recorrido de compra: no recibe lo mismo el contratista que cotiza su primera máquina que la empresa que renueva su flota. `[2.6.E1]`
- Cada segmento prioritario —por ejemplo, las constructoras, los contratistas, los productores agrícolas y las flotas de transporte— tiene su buyer persona escrito. `[2.6.E6]`

**Óptimo.**

- La IA predice quién va a comprar una máquina —o renovar las que tiene— y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F4`, `2.6.F5`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.E7`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por los canales que usas, como la pauta, las redes, las ferias, el correo o WhatsApp?

*Descripción:* Mide si los canales que el distribuidor eligió salen con regularidad y bajo un mismo plan, si anuncian solo lo que está disponible y si se conoce lo que cuesta cada interesado.

*Costo de quedarse:* Tus máquinas llegan al mercado a ratos, o no llegan, sin un plan que coordine tus canales; cuando anuncias, ofreces usadas que ya se vendieron, y no sabes cuánto te cuesta cada interesado.

**Deficiente.**

- No hay un plan que diga por qué canales sale el distribuidor: la pauta, las redes, las ferias o las demostraciones en campo. `[2.7.D2]`

**Inicial.**

- La pauta y los correos salen cuando hay algo que promocionar —un modelo que llega, una promoción de la marca—, sin presupuesto ni fechas fijados de antemano. `[2.7.I2]`

**Funcional.** Los canales que el distribuidor eligió salen con regularidad y bajo un mismo plan, y anuncian solo lo que está disponible.

*Resultado:* Una campaña sale coordinada por todos los canales del plan en vez de esfuerzos sueltos, lo que se anuncia está disponible, y el líder ve cuánto le cuesta cada interesado según el canal del que venga.

- La pauta, las redes y el sitio anuncian solo las máquinas disponibles y las promociones vigentes: la usada que se aparta o se vende deja de promocionarse dentro del plazo acordado. `[2.7.F701 · comprobable · hábito]`

**Eficiente.**

- Si las ferias, las exhibiciones o los días de demostración en campo son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- En el sistema se ve cuánto cuesta cada demostración y cada venta en cada canal y en cada línea de máquinas, no solo cada interesado. `[2.7.E701 · comprobable · requiere 1.3.F3]`

**Óptimo.**

- Los clientes que Servicio identifica como promotores —por ejemplo, después de una buena entrega técnica o de una reparación resuelta en el plazo prometido— se vuelven un canal de referidos y casos de éxito sin pedirlos a mano: el sistema los invita solo, el equipo elige qué casos se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.F5`, `2.7.F6`, `2.7.F7`, `2.7.F8`, `2.7.E3`, `2.7.E4`, `2.7.E5`, `2.7.E6`, `2.7.E7`, `2.7.E8`, `2.7.E9`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada lanzamiento, de cada feria o de cada campaña cuando termina?

*Descripción:* Mide si cada campaña se evalúa por los interesados, las demostraciones y las ventas que trajo, y deja un aprendizaje.

*Costo de quedarse:* Repites la pauta, las ferias y los mensajes de siempre porque nadie anota cuáles trajeron demostraciones y ventas: cada lanzamiento empieza de cero.

**Deficiente.**

- No se mide qué trajo cada campaña —consultas, demostraciones o ventas—: solo se sabe lo que se gastó, o ni eso. `[2.8.D2]`

**Inicial.**

- Se miran clics, alcance y me gusta, no los interesados ni las ventas de máquinas que trajo cada campaña. `[2.8.I1]`

**Funcional.**

- Los resultados de cada campaña —los interesados, las demostraciones o las ventas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

- La planificación de las campañas siguientes se ajusta con lo aprendido: la del próximo lanzamiento, la próxima feria o la próxima temporada se arma con lo que mostraron las pruebas y las revisiones de cierre. `[2.8.E4]`

**Óptimo.**

- La IA ajusta las campañas mientras corren —deja de mostrar la versión del anuncio que no funciona y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.D1`, `2.8.D3`, `2.8.I2`, `2.8.F3`, `2.8.E3`, `2.8.E5`, `2.8.O3`.

### Área 3 — Servicio

Mide el rendimiento de la posventa del distribuidor, que recibe al cliente desde la entrega técnica de su máquina y la atiende en el taller y en el lugar de trabajo: el mantenimiento, las reparaciones, la garantía y los repuestos que se instalan. Mira cómo está montada por dentro y qué produce en máquinas reparadas en el plazo prometido, reclamos resueltos y clientes que vuelven y recomiendan.

**Deficiente.** La posventa se improvisa máquina por máquina. Las citas y las visitas en campo se piden por teléfono y quedan en un cuaderno, cada asesor de servicio presupuesta a su manera y el cliente se entera de que su máquina no estará lista cuando ya la necesita en la obra.

**Inicial.** Lo que pasa con cada máquina lo sabe el asesor que la recibió o el técnico que fue a verla. Hay un sistema de órdenes de trabajo, pero el cliente tiene que llamar para saber cómo va, y nadie le recuerda su próximo mantenimiento.

**Funcional.** Tu posventa es consistente y ya no depende de una persona. Sabes qué tipos de cliente atiendes y qué espera cada uno. Cada máquina entra con su orden y sigue las mismas etapas, del recibo a la entrega; el cliente aprueba el presupuesto antes de que se repare, recibe cada cambio de estado sin llamar y recibe el recordatorio de su próximo mantenimiento. Atiendes primero la máquina parada y tienes respuestas guardadas para lo repetitivo.

**Eficiente.** La posventa empieza a adelantarse al cliente. Tienes plazos por tipo de servicio que se vigilan solos, el cliente agenda y aprueba en línea, y la IA asiste a tu equipo en su trabajo diario; mides tiempos, satisfacción y las máquinas que vuelven por la misma falla. Ningún caso se pierde entre el taller, repuestos y la marca, y cada cliente recibe el aviso de un boletín de servicio sin buscarlo.

**Óptimo.** Un agente de IA atiende a los clientes a toda hora —agenda, responde y da el estado de su máquina— y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa y atiende las excepciones; casi todas las fallas que detecta el sistema, también por la telemetría de la máquina, se resuelven antes de que el cliente las note, y cada cliente se atiende sabiendo lo que compró y lo que se le prometió.

#### 3.1 Procesos y Rutinas

¿Cómo se atiende una máquina en tu posventa, desde que entra al taller o se pide la visita hasta que vuelve a trabajar?

*Descripción:* Mide si el taller y el servicio en campo siguen un proceso y rutinas definidas, para que la atención de la máquina no dependa de quién la recibe.

*Costo de quedarse:* La posventa depende del asesor de servicio o del técnico que conoce cada caso: si esa persona falta, nadie sabe qué se le prometió al cliente ni cuándo vuelve a trabajar su máquina.

**Deficiente.**

- Cada asesor de servicio recibe y atiende cada máquina y cada reclamo a su manera. `[3.1.D1]`

**Inicial.**

- Todavía se depende de héroes: cuando falta el asesor de servicio o el técnico que sabe, las máquinas y los reclamos se traban. `[3.1.I2]`

**Funcional.**

- El recorrido de las órdenes de posventa está configurado en el sistema con sus etapas y cubre la atención de cada máquina —una cita de taller, una visita en campo, una reparación o un reclamo de garantía—, del recibo a la entrega. `[3.1.F1]`
- Existe un proceso escrito para escalar los reclamos graves y los casos que el asesor de servicio no puede resolver —por ejemplo, una máquina que vuelve por la misma falla o una garantía que la marca rechaza—: dice cuáles se escalan y a quién. `[3.1.F4]`
- Toda orden de trabajo sigue un proceso escrito: el recibo de la máquina con su inspección, sus horas de uso y la firma del cliente, el diagnóstico, la aprobación del presupuesto antes de reparar, el control de calidad y la entrega. `[3.1.F701 · declarado]`

**Eficiente.**

- Hay guías escritas para los momentos difíciles de la posventa: una máquina parada en la obra o en plena cosecha, un repuesto que hay que importar o un reclamo de garantía que la marca rechaza. `[3.1.E701 · declarado]`

**Óptimo.**

- El sistema detecta, sin que nadie lo revise a mano, cuando una orden de taller o una visita en campo se sale de las etapas o los pasos del proceso, y se lo señala al asesor de servicio y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3]`

*Se leen igual:* `3.1.D2`, `3.1.I1`, `3.1.I3`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F5`, `3.1.F6`, `3.1.F7`, `3.1.F8`, `3.1.E1`, `3.1.E3`, `3.1.E4`, `3.1.E5`, `3.1.E6`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega una cita, un pedido de servicio en campo o un reclamo al sistema y al asesor de servicio que lo tiene que atender?

*Descripción:* Mide si cada cita y cada caso llegan solos al sistema y a quien los atiende, y cuánto de la posventa se automatiza.

*Costo de quedarse:* Las citas y los pedidos de visita se pierden entre el teléfono del taller y el WhatsApp de cada técnico, y el cliente tiene que llamar varias veces para saber cuándo vuelve a trabajar su máquina.

**Deficiente.**

- Las citas, los pedidos de visita y los reclamos se manejan en los celulares personales o el WhatsApp de cada asesor de servicio o de cada técnico, o en correos individuales. `[3.2.D2]`

**Inicial.**

- Hay un sistema de casos de posventa, pero lo que entra se reparte a mano, o la posventa atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.**

- Las citas del taller y las visitas en campo se agendan en el sistema con la máquina, el servicio, el lugar y la hora, y el cliente recibe, sin que nadie lo escriba a mano, la confirmación de su cita y cada cambio en el estado de su máquina: en diagnóstico, con presupuesto por aprobar, esperando un repuesto o lista. `[3.2.F701 · comprobable]`
- Antes de prometerle una fecha al cliente, el asesor de servicio ve en el sistema si los repuestos de la reparación están en bodega, en tránsito o por pedir a la marca. `[3.2.F702 · comprobable]`

**Eficiente.**

- El cliente puede agendar su cita o su visita, aprobar el presupuesto y ver el estado de su máquina en línea, sin llamar al taller. `[3.2.E701 · comprobable]`

**Óptimo.**

- Un agente de IA resuelve casos de posventa —agenda citas y visitas, da el estado de la máquina, responde sobre la garantía y los repuestos— en todos los canales donde atiende la posventa, sin que intervenga una persona, y le pasa a un asesor de servicio, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`

*Se leen igual:* `3.2.D1`, `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.F8`, `3.2.F9`, `3.2.F10`, `3.2.F11`, `3.2.E1`, `3.2.E2`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.E6`, `3.2.E7`, `3.2.E8`, `3.2.O4`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué trabajos y reclamos te llegan, cuántos y de qué máquinas?

*Descripción:* Mide si los datos de cada cliente —sus máquinas, sus servicios y sus casos— están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el cliente pide un servicio tiene que decir qué se le hizo a su máquina la última vez, porque nadie ve su historia.

**Deficiente.**

- No se puede reconstruir qué le pasó a un cliente ni qué se le hizo a su máquina: su historia no queda registrada en ningún lado. `[3.3.D2]`

**Inicial.**

- Las órdenes y los casos están en un solo sistema, pero la ficha del cliente sale incompleta: la máquina que compró, su garantía o su contrato de mantenimiento hay que buscarlos en otro sistema. `[3.3.I1]`

**Funcional.**

- La ficha del cliente muestra las máquinas que compró —por ejemplo, con su modelo y su número de serie— o lo que tiene contratado, como un plan de mantenimiento, y su valor económico, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida: por ejemplo, un mantenimiento, una reparación por una falla, un reclamo de garantía o un pedido de repuestos. `[3.3.F4]`

**Eficiente.**

- Se mide la satisfacción del cliente —con el NPS o el CSAT— con una cadencia definida, por ejemplo después de cada servicio y después de la entrega técnica de una máquina. `[3.3.E2]`
- Se mide cuántas máquinas vuelven por la misma falla dentro del plazo que fija el proceso, y ese número se revisa cada mes. `[3.3.E701 · comprobable · hábito]`

**Óptimo.**

- Modelos con IA predicen lo que viene —por ejemplo, cuántas máquinas van a necesitar servicio y qué repuestos van a hacer falta— y proponen qué hacer; lo que predicen se ve en los tableros del área y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.D1`, `3.3.I2`, `3.3.I3`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E4`, `3.3.E5`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O1`, `3.3.O2`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si la posventa va al día con sus máquinas y sus clientes?

*Descripción:* Mide si cada persona de la posventa sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien a quién le toca avisarle al cliente o pedir el repuesto, y el líder se entera de los atrasos cuando el cliente ya tiene la obra parada esperando su máquina.

**Deficiente.**

- Nadie tiene claro qué le toca: entre la entrega técnica, la recepción en el taller, las visitas en campo y el seguimiento al cliente, las tareas se pisan o quedan sin responsable. `[3.4.D1]`

**Inicial.**

- El líder mira los números de la posventa de vez en cuando, sobre todo cuando algo sale mal, como una máquina que no está lista cuando el cliente la necesita. `[3.4.I2]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —máquinas en el taller, visitas en campo pendientes, órdenes abiertas, trabajos atrasados, reclamos de garantía y casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.**

- El acuerdo con repuestos, con la marca —por las garantías— y con los talleres externos que se subcontratan está escrito y se mide: qué recibe cada uno y en cuánto tiempo responde. `[3.4.E701 · comprobable]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente —el contratista con una máquina, la empresa con flota, la institución— frente a lo que deja en la posventa, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`

**Óptimo.**

- El líder ya no reparte órdenes ni visitas ni apaga incendios: dedica su tiempo a decidir qué se automatiza, qué se mide y qué se mejora. `[3.4.O2]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I3`, `3.4.F3`, `3.4.F4`, `3.4.F5`, `3.4.E1`, `3.4.E2`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O5`, `3.4.O6`.

#### 3.5 Consistencia de la posventa

¿En qué se apoya tu equipo para que el presupuesto, la explicación y la entrega no cambien según quién atienda al cliente?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y si cada cliente recibe las mismas respuestas, el mismo precio y la misma entrega, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo trabajo cuesta distinto según el asesor de servicio que te toque, y el cliente lo nota y se va con un taller independiente.

**Deficiente.**

- No hay respuestas guardadas: cada asesor de servicio escribe desde cero, a su manera, cada respuesta, como la de la garantía, el presupuesto o el estado de la máquina. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas —sobre la garantía o el mantenimiento—, pero cada asesor de servicio tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de cliente están escritos, cada máquina nueva se entrega con una entrega técnica definida, el mismo trabajo cuesta lo mismo y el equipo tiene respuestas guardadas para lo frecuente.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, cada máquina se entrega con la misma entrega técnica, el mismo trabajo cuesta lo mismo con cualquier asesor de servicio y todo el equipo tiene a mano las mismas respuestas para lo frecuente.

- Existe un proceso escrito de entrega técnica de la máquina nueva —por ejemplo, su revisión previa, la puesta en marcha, la capacitación al operador y la explicación de la garantía y del plan de mantenimiento—, con un resultado definido que el cliente debe alcanzar al terminarlo, como saber operar y cuidar su máquina y a quién acudir. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende la posventa —por ejemplo, el contratista con una máquina, la empresa con flota y el productor agrícola en temporada—, qué necesita cada uno, qué espera del servicio y cuáles se consideran clientes clave, consultable por cualquier asesor de servicio. `[3.5.F4]`
- Los presupuestos de la posventa salen de una lista vigente de precios de mano de obra, de traslado al lugar de trabajo y de repuestos: el mismo trabajo cuesta lo mismo con cualquier asesor de servicio. `[3.5.F701 · comprobable]`

**Eficiente.**

- Existe una guía de estilo de servicio documentada: cómo se le habla al cliente cuando su máquina está parada, cuando un repuesto se atrasa o cuando la garantía no cubre una falla. `[3.5.E3]`

**Óptimo.**

- Lo que la IA responde o escribe sola a los clientes —la confirmación de una cita o de una visita, el estado de su máquina— sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F1`, `3.5.F3`, `3.5.F5`, `3.5.E2`.

#### 3.6 Priorización de la posventa

¿Cómo decide tu posventa qué máquina o qué caso se atiende primero?

*Descripción:* Mide si los casos se atienden según su gravedad y el tipo de cliente, y no según quién insiste más.

*Costo de quedarse:* La máquina parada en la obra o en plena cosecha espera en la misma fila que un mantenimiento de rutina, y la empresa que te confía su flota recibe la misma atención que todos.

**Deficiente.**

- Las máquinas y los casos se atienden por orden de llegada o como prefiere cada asesor de servicio, sin mirar su gravedad ni quién es el cliente. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente —una máquina parada, una falla de seguridad—, pero los casos no tienen una prioridad asignada: cada asesor de servicio decide a ojo, o se adelanta el cliente que más insiste. `[3.6.I1]`

**Funcional.**

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta: una máquina parada o con una falla de seguridad va antes que un mantenimiento. `[3.6.F1]`

**Eficiente.**

- Cada cliente clave —por ejemplo, la constructora o la empresa con una flota grande— tiene un responsable dedicado que lo conoce. `[3.6.E1]`

**Óptimo.**

- Cada cliente se atiende con el contexto de cómo llegó —lo que se le prometió en la venta de la máquina, como un plan de mantenimiento o una garantía extendida, y el segmento del que viene—, que quien lo atiende, asesor de servicio o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F3`, `3.6.F4`, `3.6.F5`, `3.6.E4`, `3.6.E5`, `3.6.O1`, `3.6.O2`.

#### 3.7 Seguimiento de la máquina

¿Cómo te enteras de que un cliente tiene un problema con su máquina, o de que le toca su mantenimiento?

*Descripción:* Mide si la posventa se adelanta a lo que necesita cada máquina —el mantenimiento, la garantía, un boletín de servicio de la marca— o solo reacciona cuando el cliente llama.

*Costo de quedarse:* El cliente se acuerda del mantenimiento cuando la máquina ya pasó sus horas, lo hace en otro taller y pierde la garantía, y te enteras de que quedó mal cuando la máquina se para en la obra.

**Deficiente.**

- La posventa nunca contacta al cliente por iniciativa propia: ni para el mantenimiento de su máquina ni para avisarle de un boletín de servicio. `[3.7.D2]`

**Inicial.**

- Cuando un cliente tiene problemas repetidos con su máquina —por ejemplo, vuelve una y otra vez por la misma falla—, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Los reclamos que se repiten y las quejas se detectan, aunque sea a mano, los clientes clave reciben contacto antes de sus fechas críticas y cada cliente recibe el recordatorio del próximo mantenimiento de su máquina.

*Resultado:* Los reclamos que se repiten, las quejas y las fechas críticas de cada máquina ya no toman a la posventa por sorpresa: el cliente hace el mantenimiento cuando le toca y los problemas se atienden antes de que la máquina se pare.

- Los clientes clave —por ejemplo, la empresa con flota— reciben contacto antes de sus fechas críticas —el fin de la garantía, el vencimiento de un contrato de mantenimiento o, si la hay, una renovación—, no después. `[3.7.F2]`
- Cada cliente recibe el recordatorio del próximo mantenimiento de su máquina según las horas de uso o la fecha que fija su plan, sin tener que acordarse él. `[3.7.F701 · comprobable · hábito]`

**Eficiente.**

- Cuando la marca publica un boletín de servicio o una campaña de revisión que afecta a una máquina vendida o atendida, su dueño recibe el aviso y una cita o una visita propuesta sin tener que buscarla. `[3.7.E701 · comprobable · hábito]`
- Si las máquinas traen telemetría y el cliente autorizó compartirla, sus alertas —una falla, las horas para el mantenimiento— llegan al sistema y abren el aviso o la visita sin que nadie las revise a mano. `[3.7.E702 · comprobable]`

**Óptimo.**

- La mayoría de los problemas que detecta el sistema —por ejemplo, por una alerta de la telemetría de la máquina— se resuelven antes de que el cliente los note: el equipo valida la solución y en el sistema se ve que el cliente no tuvo que abrir un caso. `[3.7.O2]`

*Se leen igual:* `3.7.D1`, `3.7.F1`, `3.7.F3`, `3.7.F4`, `3.7.E1`, `3.7.E3`, `3.7.E4`, `3.7.E6`, `3.7.E7`, `3.7.E8`, `3.7.O3`, `3.7.O5`, `3.7.O6`.

#### 3.8 Escalabilidad de la posventa

¿Qué pasa con las preguntas que tus clientes hacen una y otra vez sobre la garantía, el mantenimiento, los repuestos o lo que cuesta un servicio?

*Descripción:* Mide si la posventa puede atender a más máquinas sin crecer al mismo ritmo, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas cada día, y cada máquina que vendes suma más de esas preguntas a la fila de la posventa.

**Deficiente.**

- Hasta las preguntas que más se repiten —qué cubre la garantía, cuánto cuesta un mantenimiento, si hay un repuesto— se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.**

- Hay algunas respuestas publicadas, pero sueltas: no cubren lo que más preguntan los clientes —la garantía, el plan de mantenimiento, los repuestos, el costo de un servicio—, que se sigue respondiendo a mano. `[3.8.I2]`

**Funcional.**

- Las diez preguntas que más repitieron los clientes en el último trimestre —o todas, si son menos—, por ejemplo qué cubre la garantía, cada cuántas horas se hace el mantenimiento o cuánto cuesta un servicio en campo, tienen una respuesta publicada que el cliente puede consultar por su cuenta. `[3.8.F1]`

**Eficiente.**

- Los patrones de las fallas que se repiten en un modelo se comparten con la marca y con los técnicos, para atenderlas antes y documentar su solución. `[3.8.E701 · declarado · hábito]`

**Óptimo.**

- Los picos de demanda —como la temporada de cosecha, el arranque de las obras o un boletín de servicio de la marca— los absorben la IA y el autoservicio: el equipo no crece cuando crece el parque de máquinas que atiende, y el líder ve en los tableros del área qué parte de la demanda resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`

*Se leen igual:* `3.8.D1`, `3.8.I1`, `3.8.F2`, `3.8.E1`, `3.8.E2`, `3.8.E4`, `3.8.E5`, `3.8.O1`, `3.8.O3`, `3.8.O4`.

## Edición — Telecomunicaciones

Para el operador de telecomunicaciones que le vende a personas, hogares y empresas sus servicios móviles —prepago y pospago, con o sin equipo—, de internet y televisión para el hogar y de conectividad y telefonía para empresas, y que atiende después la relación: parte de la venta la trabaja un ejecutivo —en una tienda, por teléfono o en la visita a una empresa— y parte se cierra sola en la web, la app o la recarga; después vienen la activación o la instalación, la facturación, las averías, el cambio de plan, la renovación y la retención. La venta de una línea, un equipo, un servicio del hogar o una portabilidad se mide en Ventas; la atención de las averías, los reclamos y las gestiones del cliente, en Servicio. Avisarle al cliente que su plazo de permanencia termina es de Servicio; ofrecerle renovar con un equipo nuevo o sumar una línea, de Ventas. El fabricante de equipos o de infraestructura que le vende a los operadores, el mayorista de capacidad o de torres, la empresa de software de comunicaciones, el integrador que vende proyectos de redes y el proveedor que solo le vende conectividad a empresas se miden con la escala general; el distribuidor o la tienda que solo revende recargas y teléfonos, con Ecommerce y retail o con la escala general.

*Clave:* telecom

*Perfil habitual:* mixta · relación continua.

*Criterios propios:* desde el 801.

### Palabras de esta edición

| En la escala general | En esta edición |
|:--|:--|
| Prospecto | Interesado en un plan, un equipo o un servicio |
| Negocio | La venta de una línea, un plan, un equipo o un servicio del hogar, de la consulta a la activación o la instalación |
| Negocio ganado | Venta concretada: la línea activa, el número portado o el servicio instalado |
| Lead | Interesado: quien pidió información de un plan, un equipo o un servicio del hogar, o respondió a una campaña, sea o no cliente del operador |
| Pipeline | El recorrido de la venta: consulta, contacto, calificación, oferta, contrato, entrega del equipo o de la SIM, y activación o instalación |
| Revisión del pipeline | Reunión de seguimiento de ventas |
| Lead calificado | Interesado calificado: quiere el servicio, hay cobertura donde lo necesita y, si pide pospago o un equipo en cuotas, cumple las condiciones de crédito |
| Vendedor | Ejecutivo de ventas |
| Propuesta | La oferta: el plan, el equipo y sus cuotas, el plazo de permanencia, las promociones y la fecha de activación o de instalación |
| Material de venta | Fichas de los planes y de los equipos, comparativos, mapas de cobertura y respuestas a las preguntas frecuentes |
| Razón de pérdida | Por qué no se concretó la venta: el precio, el equipo, la cobertura, el crédito, que el cliente se quedó con su operador o se fue con otro |
| Cliente ideal | El cliente objetivo de cada plan y de cada servicio |
| Pronóstico | Proyección de ventas por línea de negocio: móvil, hogar y empresas |
| Cliente | Quien tiene una línea o un servicio contratado: una persona, un hogar o una empresa |
| Caso | Un reclamo, una avería, una consulta o una gestión sobre un servicio: un cobro, un cambio de plan, la SIM, la instalación |
| Agente | Ejecutivo de atención |
| Buyer persona | Perfil de cliente: quién es, cómo usa el servicio y cómo decide, como quien pasa de prepago a pospago o la familia que contrata internet para la casa |
| Traspaso | El de un interesado de Marketing a un ejecutivo de ventas, o el de un cliente de Ventas a la atención después de la activación |

### Área 1 — Ventas

Mide el rendimiento de la venta del operador: cómo está montada por dentro y qué produce en interesados atendidos, ventas concretadas y líneas activas o servicios instalados, en la tienda, por teléfono, en la visita a una empresa y en la web o la app. Vale igual si la venta la trabaja un equipo de ejecutivos de ventas o una sola persona, o si el cliente contrata solo.

**Deficiente.** Tus ventas dependen de quién atienda. Cada ejecutivo lleva a sus interesados en su teléfono y su WhatsApp personal, lo que se vende en las tiendas no llega al CRM y nadie sabe cuántos interesados de una campaña se quedaron sin una llamada.

**Inicial.** Tienes un CRM y un proceso a medias. Los interesados de cada campaña se reparten a mano, el primer contacto llega días después, cada ejecutivo explica la oferta a su manera y la portabilidad y la instalación se siguen por fuera del sistema.

**Funcional.** Tu equipo comercial opera como una maquinaria base. Cada interesado —de una campaña, de la línea de atención, de la tienda o de la web— entra al mismo recorrido, la oferta se dice igual en todos los canales, el cliente sabe por escrito lo que contrata antes de firmar y ninguna venta se da por concretada hasta que la línea está activa o el servicio instalado.

**Eficiente.** La venta deja de depender del empuje de cada ejecutivo. Mides en qué etapa se cae cada venta —también entre la firma y la activación—, sabes a qué clientes ofrecerles pasar a pospago, subir de plan o sumar una línea, el cliente puede contratar en línea de punta a punta y proyectas las ventas con confianza.

**Óptimo.** La IA hace el trabajo pesado y tu equipo valida donde importa. Si atiendes por WhatsApp o chat, agentes de IA responden, califican y llevan al interesado hasta la contratación a toda hora; los modelos dicen a qué cliente ofrecerle qué plan o qué equipo y cuándo, y detectan la portabilidad o la instalación que se traba antes de que el cliente se quede con su operador.

#### 1.1 Procesos y Rutinas

¿Qué tan parecido trabajan tus ejecutivos cada venta, desde que llega el interesado hasta que la línea queda activa o el servicio instalado?

*Descripción:* Mide si la venta sigue un proceso escrito y repetible —también el de la portabilidad—, con etapas, cadencias y reuniones que no dependen de cada ejecutivo ni de cada tienda.

*Costo de quedarse:* Si se va un ejecutivo, se lleva a sus interesados en el teléfono: nadie sabe a quién se le ofreció qué plan, qué portabilidad quedó a medias ni qué instalación se le prometió a quién.

**Deficiente.** Sin proceso: cada ejecutivo y cada tienda venden a su manera, y lo que se sabe de cada venta vive en su cabeza o en su WhatsApp.

- No hay nada escrito sobre el recorrido de la venta ni sus etapas —consulta, contacto, oferta, contrato, entrega de la SIM o del equipo y activación o instalación—: cada ejecutivo usa su criterio. `[1.1.D1]`
- Los interesados de las campañas y de la línea de atención se reparten a ojo, o se los queda el ejecutivo que los ve primero: no hay una regla que diga a quién le toca cada uno. `[1.1.D2]`
- No hay una reunión de seguimiento de ventas: se habla de las ventas en curso solo cuando una se complica. `[1.1.D3]`
- Si se van dos ejecutivos clave, nadie sabe en qué quedó cada venta, cada portabilidad ni cada instalación. `[1.1.D4]`

**Inicial.** Hay etapas y algo de estructura, pero cada ejecutivo y cada tienda las aplican a su manera, y la reunión de seguimiento de ventas no tiene fecha fija.

- Hay etapas de la venta de palabra o en un borrador, pero cada ejecutivo —y cada tienda— las interpreta distinto. `[1.1.I1]`
- Hay una cadencia de contacto sugerida para los interesados de cada campaña, pero cada ejecutivo la cumple cuando puede o cuando se acuerda. `[1.1.I2]`
- La reunión de seguimiento de ventas se hace cuando hay tiempo, sin una fecha fija ni un orden para repasar las ventas en curso. `[1.1.I3]`
- Que una venta quede bien registrada —por ejemplo, la que se cierra en la tienda— depende de la voluntad de cada ejecutivo, no de una rutina del equipo. `[1.1.I4]`

**Funcional.** Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la activación o la instalación, con una cadencia de contacto, el proceso de la portabilidad por escrito y una revisión fija de las ventas.

*Resultado:* Si rota un ejecutivo, el siguiente sabe en qué va cada venta, porque todo el equipo trabaja el mismo recorrido en el CRM: las ventas avanzan con los mismos criterios, cada portabilidad sigue los mismos pasos, cada interesado se contacta con la cadencia acordada y las ventas en curso se repasan en cada reunión de seguimiento.

- Cualquier ejecutivo explica igual las etapas de la venta —consulta, contacto, calificación, oferta, contrato, entrega del equipo o de la SIM, y activación o instalación— y qué tiene que cumplirse para pasar de una a la siguiente. `[1.1.F1]`
- Cada tipo de venta —por ejemplo, una línea nueva, una portabilidad, una renovación, un servicio del hogar o la venta a empresas— tiene su propio recorrido en el CRM, con lo que la venta tiene que cumplir para pasar de cada etapa a la siguiente. `[1.1.F2]`
- El proceso de la portabilidad está escrito: qué datos y qué documentos se le piden al cliente, cómo recibe la SIM —en la tienda o por envío, también quien vive lejos de una tienda—, qué plazos y qué causas de rechazo fija el regulador y qué se le dice al cliente en cada paso. `[1.1.F801 · declarado]`
- La reunión de seguimiento de ventas se hace en una fecha fija, cada semana o cada quince días. `[1.1.F5]`
- Cualquier ejecutivo, en la tienda, por teléfono o en la visita a una empresa, trabaja en el CRM y no en hojas ni notas aparte: lo abre para ver qué le toca hacer —a qué interesado llamar, qué portabilidad retomar—, no solo para cargar lo que ya vendió. `[1.1.F6]`
- Hay una cadencia de contacto definida —cuántos intentos y en cuántos días, por ejemplo con una primera llamada en los 30 minutos siguientes a que el interesado deja sus datos en la página de una campaña— y se cumple con la mayoría de los interesados nuevos. `[1.1.F7]`

**Eficiente.**

- Hay playbooks escritos de descubrimiento, calificación y manejo de objeciones, por ejemplo para saber cómo usa el servicio el cliente, cuánto paga hoy con su operador y qué le hace dudar de cambiarse. `[1.1.E2]`
- El sistema marca en el CRM las ventas que se salen del proceso —por ejemplo, una portabilidad sin la SIM entregada o un servicio del hogar sin fecha de instalación— y se las señala al líder. `[1.1.E6]`

**Óptimo.**

- La mayoría de las ventas siguen el recorrido como está escrito sin que nadie lo revise a mano, y el CRM lo muestra. `[1.1.O2]`
- Las técnicas nuevas se prueban en pilotos de ciclo corto —por ejemplo, en una región, en una tienda o con una campaña— antes de sumarlas al proceso. `[1.1.O3]`
- La IA corrige sola lo que se sale del proceso —crea la llamada al interesado que nadie contactó, completa el plan de interés, reasigna la venta a otra región— y el líder revisa en el CRM lo que no pudo resolver. `[1.1.O4]`

*Se leen igual:* `1.1.F4`, `1.1.F8`, `1.1.E1`, `1.1.E3`, `1.1.E5`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando llega un interesado o una venta avanza hacia la activación?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir los interesados, avisar qué toca, registrar lo que se contrata en la web, la app o la tienda y avisarle al cliente en qué va su activación o su instalación— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tus ejecutivos pierden horas en tareas que el sistema podría hacer: los interesados de una campaña esperan días a que alguien los reparta, la contratación que el cliente deja a medias en la web no la retoma nadie y el cliente tiene que llamar para saber cuándo le activan la línea o le instalan el servicio.

**Deficiente.** No hay un CRM: los interesados y las ventas se anotan en hojas de cálculo o en el WhatsApp de cada ejecutivo.

- Los interesados viven en hojas de cálculo, en listas o en el teléfono de cada ejecutivo. `[1.2.D1]`
- No hay un CRM donde montar una automatización: los interesados y las ventas se pasan por correo, por WhatsApp o de palabra, y ningún ejecutivo recibe avisos del sistema. `[1.2.D2]`

**Inicial.** Hay un CRM, pero los interesados se reparten a mano, lo que se contrata en la web o en la app se pasa al sistema cuando alguien tiene tiempo y el cliente tiene que llamar para saber en qué va su venta.

- Hay un CRM, pero nada pasa solo: los interesados que llegan de cada campaña o de la línea de atención se reparten a mano y cada ejecutivo tiene que acordarse de sus seguimientos. `[1.2.I1]`
- Lo que el cliente contrata solo —una línea, un plan o un equipo, en la web, en la app o por otro canal de autoservicio— se pasa a mano al sistema, cuando alguien tiene tiempo. `[1.2.I2]`

**Funcional.** Lo básico pasa solo —los interesados se reparten por una regla, el sistema avisa qué toca, lo que se contrata en la web o en la app entra solo aunque quede a medias y el cliente recibe un aviso en cada paso hasta la activación o la instalación— y, si se usa IA, trabaja con los datos de cada cliente.

*Resultado:* Ningún interesado se pierde por no saber a quién le toca y el ejecutivo deja de depender de su memoria para dar seguimiento; lo que se contrata en la web o en la app entra solo, aunque quede a medias, y el cliente sabe cuándo le activan la línea o le instalan el servicio sin tener que llamar.

- Los interesados que llegan —de una campaña, de la línea de atención, de la web o de la tienda— entran a una bandeja o cola y se asignan por una regla simple: por turnos, por región, por tipo de servicio o según la fuente de donde llegan. `[1.2.F2]`
- Cuando hay algo que hacer —por ejemplo, un interesado nuevo asignado, una portabilidad que espera la SIM o un interesado que respondió a la campaña—, el sistema le avisa al ejecutivo sin que el líder se lo recuerde. `[1.2.F3]`
- Si el equipo atiende a los interesados por WhatsApp u otro canal conversacional, lo que cada ejecutivo habla por ahí queda en el sistema, aunque responda desde su teléfono. `[1.2.F4]`
- Lo que el cliente contrata solo —una línea prepago, un plan, un equipo o un servicio del hogar, en la web, en la app o por otro canal de autoservicio— entra solo al sistema como una venta, con su monto, su canal y su fecha, y con su cliente cuando se identifica. `[1.2.F6]`
- Si lo que se vende es limitado —los equipos en inventario de cada tienda, o los que llegan con un preregistro cuando sale un modelo—, quien vende puede ver qué está disponible antes de ofrecerlo, en el CRM o en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8]`
- La contratación que el cliente deja a medias en la web o en la app —un plan, un equipo o una portabilidad— queda guardada en el sistema, con sus datos de contacto y lo que eligió. `[1.2.F801 · comprobable · venta sin vendedor]`
- En cada cambio de estado de su venta —contrato firmado, equipo o SIM en camino, portabilidad aprobada o rechazada, instalación agendada y servicio activo—, al cliente le llega un aviso automático. `[1.2.F802 · comprobable]`
- Los ejecutivos le escriben al cliente solo desde los números, perfiles y correos que el operador publica como oficiales, no desde su teléfono personal. `[1.2.F803 · evaluado · hábito · venta con equipo]`

**Eficiente.** Las ofertas salen del sistema, el CRM se conecta con los sistemas del operador, el cliente puede contratar en línea de punta a punta y el equipo usa la IA en su trabajo diario.

*Resultado:* El ejecutivo recupera el tiempo que se le iba en tareas repetitivas, el líder ve en tiempo real en qué etapa se caen las ventas y el cliente que prefiere contratar solo lo hace sin pasar por una tienda.

- Las ofertas se generan desde el sistema —por ejemplo, con el plan, el equipo, sus cuotas y el plazo de permanencia vigentes—, no como documentos sueltos. `[1.2.E1]`
- Si el operador lleva su operación en otro sistema —la facturación, las activaciones, el inventario de equipos o las instalaciones—, el CRM está conectado con él. `[1.2.E3]`
- El cliente contrata en línea de punta a punta —elige el plan o el equipo, verifica su identidad, firma de forma digital y recibe la SIM o agenda la instalación—, también cuando trae su número de otro operador, sin tener que ir a una tienda. `[1.2.E801 · comprobable · venta sin vendedor]`

**Óptimo.** La IA califica, lleva al interesado hasta la contratación y calcula qué ventas se van a concretar; el ejecutivo valida y se queda con las conversaciones que deciden la venta.

- Si el equipo atiende por un canal conversacional, agentes de IA califican ahí a los interesados con la definición de interesado calificado y agendan una llamada o una visita a cualquier hora; le pasan al ejecutivo, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que calificaron. `[1.2.O2]`
- Si el operador atiende por un canal conversacional, agentes de IA atienden ahí a quienes quieren contratar —una línea prepago, un plan, un equipo— y los llevan hasta el pago; una persona revisa lo que no pudieron resolver, y en el CRM queda cada conversación que atendió la IA. `[1.2.O5]`

*Se leen igual:* `1.2.F7`, `1.2.F9`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.E6`, `1.2.E7`, `1.2.E8`, `1.2.O1`, `1.2.O3`, `1.2.O4`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus ventas en curso antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: ventas completas, el origen de cada una, los servicios que ya tiene cada cliente y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: lo que se vende en las tiendas no llega al CRM, el reporte se arma a mano cruzando hojas con el sistema de facturación y no sabes qué campaña te trae ventas y cuál solo llamadas.

**Deficiente.** Los datos de ventas están repartidos entre el CRM, las hojas de cada tienda y los sistemas del operador, y nadie los cuida.

- No se registra de qué campaña o canal vino cada venta ni qué ejecutivo la lleva: sacar un reporte confiable es imposible. `[1.3.D2]`
- No hay un registro de quiénes son los clientes: cada vez que se necesita la lista —por ejemplo, para una campaña—, hay que armarla a mano con hojas de cálculo y lo que guardan la facturación, las recargas y cada tienda. `[1.3.D3]`
- Las ventas concretadas no quedan registradas con su monto y su fecha —por ejemplo, las de la tienda quedan solo en el sistema donde se activan—: no se sabe cuánto se vendió ni cuándo. `[1.3.D4]`

**Inicial.**

- En las ventas que se crean hoy, la campaña o el canal de donde vino cada una —la página de una campaña, la línea de atención, la tienda o un referido— se anota a mano, cuando alguien se acuerda, y en parte de ellas queda vacío. `[1.3.I2]`
- Las ventas que se crean hoy se registran, pero a algunas les falta la fecha esperada de activación o de instalación, el monto o el ejecutivo responsable. `[1.3.I3]`

**Funcional.** El reporte de ventas en curso sale del sistema, sin armarlo a mano, y la ficha de cada cliente dice qué servicios tiene y cuándo termina su plazo de permanencia.

*Resultado:* El líder ve el estado real de las ventas cuando lo necesita, sin armar el reporte a mano, y sabe de qué campaña o canal vino cada una; el ejecutivo sabe qué tiene contratado cada cliente antes de ofrecerle algo.

- Toda venta creada desde la puesta en marcha del recorrido actual tiene fecha esperada de activación o de instalación, monto y ejecutivo responsable. `[1.3.F1]`
- Toda venta creada desde la puesta en marcha del recorrido actual dice de qué fuente vino su contacto original: una campaña por WhatsApp, SMS o correo, la línea de atención, la tienda, la web, la app o un referido. `[1.3.F3]`
- Las personas a las que el equipo les escribe por WhatsApp o por correo —también las que vienen en las bases de una campaña— aceptaron que les escriban. `[1.3.F10]`
- La ficha de cada cliente dice qué servicios tiene activos —líneas, planes, equipos en cuotas y servicios del hogar— y cuándo termina su plazo de permanencia. `[1.3.F801 · comprobable · relación continua]`

**Eficiente.** Aparece una proyección de ventas confiable, la ficha del cliente reúne lo que viene de los sistemas del operador y se sabe cuánto vale cada cliente según su plan y su canal.

*Resultado:* El operador puede comprometer un número de ventas con confianza, y sabe cuánto deja cada cliente según el plan que contrató y el canal por donde llegó.

- Hay una proyección de ventas que se actualiza cada semana o cada quince días —por ejemplo, de las líneas móviles, los equipos, los servicios del hogar y las empresas—, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% de lo proyectado. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si el operador lleva en otros sistemas la facturación, las activaciones o las recargas, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se sabe cuánto deja cada cliente en el tiempo según el plan que contrató y el canal por donde llegó —la tienda, el ejecutivo, la web o la app—, y ese número se revisa al menos una vez por trimestre. `[1.3.E801 · comprobable · hábito]`

**Óptimo.**

- Cada interesado, cliente y venta se asocia solo, al entrar, con lo que ya había de esa persona, ese hogar o esa empresa —por ejemplo, por su número de línea o su identificación—; la IA resuelve los dudosos y una persona valida solo las excepciones que el CRM le marca. `[1.3.O1]`
- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, sus servicios, su facturación, sus casos —averías, reclamos, consultas y gestiones— y sus conversaciones. `[1.3.O3]`
- Ventas se apoya en el almacén central de datos del operador para su pronóstico, cruzando lo comercial con la facturación y el servicio. `[1.3.O4]`

*Se leen igual:* `1.3.D1`, `1.3.I1`, `1.3.F2`, `1.3.F4`, `1.3.F8`, `1.3.F9`, `1.3.E4`, `1.3.E5`, `1.3.O2`, `1.3.O6`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué región, qué tienda y qué ejecutivo van bien y quién necesita ayuda?

*Descripción:* Mide si cada ejecutivo tiene un rol y una meta por escrito, si cada tienda, cada región y cada canal tienen la suya, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes de que la meta de ingreso no se cumplió: no vio antes qué región, qué tienda o qué ejecutivo se quedó atrás, ni en qué etapa se cayeron las ventas.

**Deficiente.**

- El líder apaga incendios —una campaña que no vende, una portabilidad trabada, una región que no llega a la meta—: no hay métricas ni rendición de cuentas. `[1.4.D2]`

**Inicial.**

- El líder revisa algunos números —las activaciones del mes, el ingreso de cada ejecutivo— en hojas de cálculo, cuando tiene tiempo. `[1.4.I1]`
- Los reportes de cómo operan los ejecutivos, las tiendas y las regiones se arman a mano. `[1.4.I2]`

**Funcional.** Cada ejecutivo tiene un rol y una meta por escrito, el líder sigue un tablero cada semana y en la reunión de seguimiento de ventas cada quien rinde cuentas.

*Resultado:* Cada ejecutivo sabe qué se espera de él, y el líder sabe cada semana qué región, qué tienda y qué ejecutivo van bien y quién necesita ayuda, antes de que cierre el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —por ejemplo, interesados atendidos, tiempo hasta el primer contacto, ventas concretadas, líneas activadas o servicios instalados e ingreso— y lo consulta al menos una vez por semana. `[1.4.F2]`
- Cada ejecutivo —o cada canal, donde se contrata sin ejecutivo, como la web o la app— tiene una meta escrita, con un monto o una cantidad y un plazo, por ejemplo el ingreso mensual de las ventas que activa. `[1.4.F4]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con las áreas que completan la venta y, si Marketing pasa interesados, también las del traspaso.

*Resultado:* Un ejecutivo nuevo produce más rápido, el crédito, la entrega de equipos y SIM, la instalación y la portabilidad no se traban entre áreas, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un ejecutivo nuevo, hay un plan de inducción con sus pasos y materiales —los planes y los equipos vigentes, la portabilidad, las condiciones de crédito y los sistemas—; no se le entrena de memoria. `[1.4.E2]`
- Si Marketing le pasa interesados a Ventas —por ejemplo, los de cada campaña—, el acuerdo de traspaso está escrito y se sigue en el sistema: en cuánto tiempo se responde, qué calidad se espera del interesado y por qué se puede rechazar. `[1.4.E3]`
- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo, cuánto margen deja cada canal —la tienda, el ejecutivo, la web o la app— y cuánto aporta cada ejecutivo. `[1.4.E6]`
- El acuerdo con las áreas que completan la venta —el análisis de crédito, la logística de equipos y SIM, las instalaciones y la portabilidad— está escrito y se mide: qué recibe cada una, en cuánto tiempo responde y por qué devuelve una venta. `[1.4.E801 · comprobable]`

**Óptimo.**

- Al menos una vez por trimestre, el líder y el equipo se reúnen a decidir qué probar en la venta —una oferta, un guion de llamada, una campaña en una región— y revisan cómo les fue con lo que probaron antes. `[1.4.O2]`
- Hay responsables de validar lo que hace la IA en ventas, y lo que puede decidir sola —por ejemplo, ofrecer un plan, agendar una instalación o aplicar una promoción— está por escrito. `[1.4.O3]`

*Se leen igual:* `1.4.D1`, `1.4.F3`, `1.4.F6`, `1.4.F7`, `1.4.E4`, `1.4.E5`, `1.4.O4`.

#### 1.5 Planes y ofertas

¿Cómo sabe un ejecutivo que entra a tu equipo a quién va dirigido cada plan y con qué condiciones ofrecerlo?

*Descripción:* Mide si el equipo sabe para quién es cada plan y cada servicio, si la oferta llega igual con cualquier ejecutivo y en cualquier canal, y si el cliente sabe por escrito lo que contrata antes de firmar.

*Costo de quedarse:* El cliente escucha un precio en la tienda y otro en la web, o descubre en la primera factura un cargo o un plazo de permanencia que nadie le dijo: reclama, desconfía y se lleva su número a otro operador en cuanto puede.

**Deficiente.** Nadie puede decir a quién va dirigido cada plan, y cada ejecutivo explica las condiciones de memoria y a su manera.

- Nadie puede decir con claridad a quién va dirigido cada plan o cada servicio, y lo que se le dice a cada interesado —el precio, lo que incluye, la permanencia— cambia según quién lo atienda. `[1.5.D1]`
- No hay un formato de oferta: cada ejecutivo arma la suya desde cero, de palabra o en un mensaje de WhatsApp, y su calidad depende de quién le toque al cliente. `[1.5.D2]`

**Inicial.** Hay fichas de los planes y de los equipos, pero cada ejecutivo arma la oferta a su manera y las condiciones todavía varían entre la tienda, el teléfono y la web.

- Hay un formato de oferta, pero cada ejecutivo lo cambia o lo usa a su manera. `[1.5.I2]`
- Los precios, las promociones o las condiciones cambian según el canal sin que sea a propósito: el interesado encuentra en la web un precio o una promoción distinta de la que le dicen en la tienda. `[1.5.I3]`

**Funcional.** El cliente objetivo de cada plan está escrito, la oferta se dice igual en todos los canales y el cliente recibe por escrito lo que contrata antes de firmar.

*Resultado:* Dos interesados parecidos reciben la misma oferta —el plan, el equipo y sus cuotas, el plazo de permanencia y las promociones— sin importar qué ejecutivo los atienda ni por qué canal lleguen, y saben antes de firmar cuánto van a pagar y cuánto les cuesta irse antes.

- Existe un documento con el cliente objetivo de cada plan y de cada servicio —a quién va dirigido, cómo usa el servicio y qué busca—, consultable por cualquier ejecutivo. `[1.5.F1]`
- Las ofertas están estandarizadas: tienen una estructura común reconocible —por ejemplo, el plan, el equipo y sus cuotas, el plazo de permanencia, las promociones y la fecha de activación o de instalación—, no armada desde cero cada vez. `[1.5.F4]`
- Si se vende por más de un canal, los precios, las promociones y las condiciones de cada plan y de cada equipo son los mismos en la tienda, por teléfono, en la web y en la app, o la diferencia es a propósito y está escrita, como un descuento solo en línea. `[1.5.F5]`
- Antes de firmar, el cliente recibe por escrito lo que contrata: el plan y lo que incluye, el precio mensual, las cuotas del equipo, el plazo de permanencia si lo tiene y cuánto le cuesta terminar el contrato antes. `[1.5.F801 · comprobable · hábito]`

**Eficiente.** La oferta se distingue de la de otros operadores y solo promete lo que se va a entregar.

*Resultado:* Los interesados ven qué distingue al operador: la oferta dice lo mismo en la web, en la app, en la tienda y en boca de cada ejecutivo, y lo que se le ofreció al cliente es lo que después ve en su factura.

- La propuesta de valor dice por escrito en qué se distingue de la de otros operadores, por ejemplo en la cobertura, la velocidad, los equipos o la atención. `[1.5.E2]`
- Las ofertas solo prometen lo que el operador puede entregar: lo que se ofrece —por ejemplo, la cobertura, la velocidad, el equipo y la fecha de activación o de instalación— se valida antes de ofrecerlo. `[1.5.E3]`
- Se mide cuántas ventas se facturan con un precio, unas cuotas o un plazo de permanencia distintos de los ofrecidos, y se corrige el origen. `[1.5.E801 · comprobable · hábito]`

**Óptimo.** La IA revisa contra la propuesta de valor vigente del operador todo lo que se le dice a cada interesado, y el equipo valida lo que se sale.

- La IA revisa en tiempo real, contra la propuesta de valor vigente del operador, lo que se les dice a los interesados —por WhatsApp, por teléfono o en la oferta—, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.I1`, `1.5.F2`, `1.5.F3`, `1.5.F6`, `1.5.E4`.

#### 1.6 Calificación y priorización

¿Cómo decide tu equipo a qué interesados llamar primero, y cómo sabe que puede venderles lo que piden?

*Descripción:* Mide si el equipo decide a qué interesados dedicar su tiempo con criterios escritos, según el cliente objetivo de cada plan, y si confirma la cobertura y el crédito antes de ofrecer lo que los necesita.

*Costo de quedarse:* Tus ejecutivos llaman en orden una base de miles de números —muchos ya no existen o ya tienen el plan que se les ofrece—, le venden internet a quien no tiene cobertura y un equipo en cuotas a quien no pasa el crédito, mientras los interesados listos esperan días su primera llamada.

**Deficiente.** Los interesados se atienden por orden de llegada, desde bases sin depurar, y la cobertura o el crédito se descubren al final.

- No hay criterios para distinguir a un interesado que va a contratar de uno que solo pregunta precios: se pierde tiempo con interesados que nunca van a contratar. `[1.6.D1]`
- Las bases de cada campaña llegan al ejecutivo sin depurar: traen números que ya no existen, clientes que ya tienen lo que se les ofrece y clientes tratados como interesados nuevos. `[1.6.D801 · comprobable]`

**Inicial.**

- Los interesados se separan en alguna lista o con una etiqueta —por ejemplo, por campaña o por lo que pidieron—, pero cada ejecutivo lo hace con su propio criterio. `[1.6.I1]`
- El líder sabe quién es el cliente objetivo de cada plan, pero el CRM no tiene los campos —el servicio que busca, la zona, si ya es cliente, si viene de otro operador— para separar a los interesados que encajan. `[1.6.I2]`

**Funcional.** Los interesados se separan por los rasgos del cliente objetivo de cada plan, hay una definición escrita de interesado calificado que el equipo aplica, y la cobertura y el crédito se confirman antes de ofrecer lo que los necesita.

*Resultado:* El equipo deja de dedicarle tiempo a quien no encaja con el cliente objetivo y concentra el esfuerzo en quien sí encaja y cumple la definición de interesado calificado; a nadie se le vende un servicio del hogar sin cobertura, ni un pospago o un equipo en cuotas que no va a pasar el crédito.

- El equipo segmenta a los interesados por los atributos del cliente objetivo antes de trabajarlos: en personas, el servicio que buscan, la zona, si ya son clientes o si vienen de otro operador; en empresas, el tamaño, la actividad o cuántas líneas necesitan. `[1.6.F1]`
- Hay una definición escrita de interesado calificado: los criterios para aceptarlo como tal, por ejemplo que quiera el servicio, que haya cobertura donde lo necesita y, si pide pospago o un equipo en cuotas, que cumpla las condiciones de crédito. `[1.6.F2]`
- Los rasgos del cliente objetivo —el servicio que busca, la zona, si ya es cliente, si trae su número de otro operador— son campos del CRM y de los formularios de las campañas. `[1.6.F4]`
- Antes de ofrecer un pospago o un equipo en cuotas, se revisa si el interesado tiene deuda con el operador y si cumple las condiciones de crédito; el prepago no pasa por ahí. `[1.6.F801 · comprobable · hábito]`
- Si el operador vende servicios del hogar, antes de vender uno se confirma que hay cobertura en la dirección del cliente, y queda registrado en la venta. `[1.6.F802 · comprobable · hábito]`

**Eficiente.** Los interesados se ordenan con un puntaje, la cobertura y el crédito se revisan solos, y hay listas de clientes a quienes ofrecerles pasar a pospago, subir de plan o sumar una línea sin esperar a que pregunten.

*Resultado:* Cada ejecutivo sabe cada mañana a quién llamar primero, quien no tiene cobertura o no cumple el crédito lo sabe enseguida, y los clientes que ya están listos para pasar a pospago, subir de plan o sumar una línea reciben la oferta sin tener que pedirla.

- Los ejecutivos trabajan primero a los interesados con más puntaje. `[1.6.E4]`
- Los segmentos prioritarios —por ejemplo, quien viene de otro operador, la familia que contrata el hogar o la pyme con varias líneas— están escritos y cada uno tiene su plan de contacto. `[1.6.E7]`
- Hay listas de clientes a quienes ofrecerles pasar de prepago a pospago, subir de plan, renovar con un equipo nuevo o sumar una línea, armadas con su consumo, sus recargas y cómo pagan, y se les ofrece sin esperar a que pregunten. `[1.6.E801 · comprobable · cliente recurrente · requiere 1.3.E3]`
- El crédito y, si el operador vende servicios del hogar, la cobertura se revisan solos: con la identificación del interesado y, cuando hace falta, su dirección, el sistema dice si cumple las condiciones de crédito y si hay cobertura antes de que alguien le dedique tiempo o de pedirle documentos. `[1.6.E802 · comprobable · requiere 1.6.F801, 1.6.F802]`

**Óptimo.** La IA decide a qué interesado atender, qué plan o qué equipo ofrecerle y cuándo, con todo lo que se sabe de cada uno; el ejecutivo valida y, en la web y la app, se ofrece dentro de los límites que fijó el operador.

- Si en la decisión de contratar participan varias personas —en una empresa, el gerente, el de compras y el de tecnología—, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el ejecutivo revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3]`
- La priorización usa señales de Servicio y de Marketing —qué clientes suben de plan, suman líneas, refieren o se llevan su número a otro operador— para decidir qué perfiles perseguir. `[1.6.O4]`
- La IA ejecuta sola las acciones de rutina —recordatorios, reagendar una instalación, enviar la ficha de un plan o el mapa de cobertura— y el ejecutivo valida las de las ventas de más valor; en el CRM queda qué hizo la IA en cada venta. `[1.6.O5]`
- En la web y en la app, la IA le ofrece sola a cada cliente el plan, el equipo o el servicio que le conviene, dentro de los límites que fijó el operador, y el ejecutivo revisa en el CRM lo que se ofreció. `[1.6.O801 · comprobable]`

*Se leen igual:* `1.6.F3`, `1.6.E3`, `1.6.E5`, `1.6.E6`.

#### 1.7 Seguimiento de la contratación

¿Qué pasa con el interesado que no volvió a contestar, o con la venta que se firmó y todavía no tiene la línea activa o el servicio instalado?

*Descripción:* Mide si alguien detecta cuando una venta deja de avanzar —antes de firmar o mientras se espera la SIM, la portabilidad o la instalación— y si hay un paso acordado para retomarla a tiempo; y si la venta se da por concretada solo cuando el servicio está activo.

*Costo de quedarse:* Las ventas se caen en silencio: el interesado en una portabilidad espera días una llamada, la SIM no llega, la instalación se reprograma y nadie lo nota hasta que el cliente se queda con su operador o se va con otro.

**Deficiente.** El ejecutivo está solo con sus ventas, y lo que pasa entre la firma y la activación no lo sigue nadie.

- Nadie se da cuenta de que una venta dejó de avanzar —un interesado que no contesta, una portabilidad sin la SIM, una instalación sin fecha— hasta que ya se perdió. `[1.7.D2]`
- No hay material de venta —fichas de los planes y de los equipos, comparativos, mapas de cobertura— para mostrarles a los interesados. `[1.7.D4]`
- Los interesados en una portabilidad que llegan de una campaña o de la web se quedan sin que nadie los contacte, o los contactan días después. `[1.7.D801 · comprobable]`

**Inicial.**

- Cuando una venta se detiene —el interesado no contesta, falta un documento o la portabilidad se rechazó—, cada ejecutivo decide si insiste y cómo: no hay un paso acordado. `[1.7.I1]`
- Cada ejecutivo tiene su propio material —capturas de los planes, fotos de los equipos— y lo arma a su manera. `[1.7.I3]`
- Todos los intentos de hacer avanzar una venta se hacen por el mismo canal: por ejemplo, el ejecutivo solo escribe por WhatsApp desde su teléfono. `[1.7.I4]`

**Funcional.** Ninguna venta se enfría en silencio, de la consulta a la activación: se detecta a tiempo, hay un paso acordado para retomarla y la venta se da por concretada solo con la línea activa o el servicio instalado.

*Resultado:* Las ventas que se traban se detectan a tiempo y se retoman por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Cada portabilidad se sigue hasta que el número queda activo, y una venta firmada no cuenta como ganada mientras el cliente no tenga el servicio.

- Para cada etapa —también la entrega de la SIM o del equipo, la portabilidad y la instalación— está definido cuánto tiempo sin avance vuelve estancada una venta, y las estancadas se reconocen a tiempo. `[1.7.F1]`
- La reactivación usa al menos dos canales, por ejemplo una llamada desde la línea oficial y WhatsApp. `[1.7.F2]`
- Hay material de venta estandarizado —fichas de los planes y de los equipos, comparativos, mapas de cobertura y respuestas a las preguntas frecuentes— que ayuda a cerrar las ventas. `[1.7.F4]`
- Cada portabilidad se sigue hasta que el número queda activo: si se rechaza o se atrasa —por ejemplo, porque la SIM no llegó—, el ejecutivo lo sabe y retoma con el cliente dentro del plazo acordado. `[1.7.F801 · comprobable · hábito · requiere 1.1.F801]`
- Una venta se da por concretada solo cuando la línea está activa, el número portado o el servicio instalado: la firma del contrato no alcanza. `[1.7.F802 · comprobable]`

**Eficiente.** El seguimiento combina varios canales, el sistema le avisa al líder de lo que se traba y se mide cuántas ventas se caen entre la firma y la activación.

*Resultado:* Ninguna venta espera a la reunión para recibir ayuda: el líder se entera cuando se traba, el interesado que todavía no está listo sigue recibiendo ofertas hasta que lo esté, el cliente que puede crecer se trabaja como una venta y se sabe cuántas ventas se pierden entre la firma y la activación, y en qué paso.

- El seguimiento de las ventas que se enfrían combina al menos tres canales —por ejemplo, llamada, WhatsApp y SMS— en una secuencia definida. `[1.7.E1]`
- Los interesados que todavía no están listos para contratar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven al ejecutivo cuando muestran interés, por ejemplo cuando termina su contrato con otro operador o llega el equipo que esperaban. `[1.7.E2]`
- Los clientes con potencial de crecer que señala Servicio —por ejemplo, quien está por terminar su plazo de permanencia, quien usa más datos de los que su plan incluye o el hogar que puede sumar líneas— se trabajan como ventas, con responsable y siguiente paso. `[1.7.E5]`
- Se mide cuántas ventas se caen entre la firma y la activación o la instalación —la SIM que no llegó, la portabilidad rechazada, la instalación que no se pudo hacer— y en qué paso, y ese número se revisa cada mes. `[1.7.E801 · comprobable · hábito]`

**Óptimo.**

- Con las reglas que fijó el líder, la IA actúa sola en las ventas de más valor que se traban —por ejemplo, la venta de varias líneas a una empresa o una instalación que se reprogramó dos veces: envía el contenido o avisa a quien corresponde— y el líder revisa en el CRM lo que hizo. `[1.7.O3]`

*Se leen igual:* `1.7.D1`, `1.7.D3`, `1.7.I2`, `1.7.F3`, `1.7.F6`, `1.7.F7`, `1.7.E3`, `1.7.E4`, `1.7.E6`, `1.7.E7`, `1.7.O2`.

#### 1.8 Ventas ganadas y perdidas

¿Qué queda registrado cuando un interesado no contrata o una venta se cae antes de la activación?

*Descripción:* Mide si queda registrado por qué no se concreta cada venta —si la rechazó el operador o la dejó el cliente— y si el equipo revisa lo que gana y lo que pierde para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes ventas —el precio, el equipo, la cobertura, el crédito, la oferta de otro operador—: cada ejecutivo tiene su explicación, y sin un registro no hay cómo ver cuántas rechazó el operador y cuántas dejó el cliente.

**Deficiente.** Cuando una venta no se concreta, no se anota la razón: cada ejecutivo da su propia versión, de memoria.

- Las ventas que no se concretan se cierran sin anotar por qué: ni el precio, ni la cobertura, ni el crédito, ni el operador con que se quedó el cliente. `[1.8.D2]`

**Inicial.**

- Por qué no se concretó una venta se anota a veces y en texto libre, a criterio de cada ejecutivo, así que no se puede sumar. `[1.8.I1]`

**Funcional.** Cada venta que no se concreta queda con su razón, elegida de una lista fija que separa lo que rechazó el operador de lo que dejó el cliente, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no se concretan las ventas —cuántas rechazó el operador por el crédito, la cobertura o la portabilidad, cuántas dejó el cliente y por qué—, con datos del trimestre y no con impresiones.

- Toda venta creada desde la puesta en marcha del recorrido actual que no se concretó tiene registrada su razón. `[1.8.F1]`
- Las razones por las que no se concreta una venta se eligen de una lista definida —el precio, el equipo, la cobertura, el crédito, que el cliente se quedó con su operador o se fue con otro—, no se escriben en texto libre. `[1.8.F2]`
- Las razones separan lo que rechazó el operador —el crédito, la falta de cobertura, una portabilidad rechazada— de lo que dejó el cliente —el precio, el equipo, la demora, la oferta de otro operador—. `[1.8.F801 · comprobable]`

**Eficiente.** Cada trimestre se revisa por qué se concretan y por qué se caen las ventas, se sabe con qué operador se quedó o a cuál se fue cada interesado, lo aprendido cambia el proceso y el equipo se capacita con un calendario fijo.

- Al menos una vez por trimestre se revisan las ventas concretadas y las que no se concretaron —también las que se cayeron entre la firma y la activación— para encontrar lo que se repite. `[1.8.E1]`
- Cuando el interesado se queda con su operador o contrata con otro, queda registrado con cuál y por qué. `[1.8.E801 · comprobable]`

**Óptimo.**

- La IA analiza las llamadas con los interesados —también las de video— y le deja a cada ejecutivo recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1]`

*Se leen igual:* `1.8.D1`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.E4`, `1.8.O4`.

### Área 2 — Marketing

Mide el rendimiento del marketing del operador: cómo está montado por dentro y qué produce en interesados, ventas y clientes que vuelven a contratar —las campañas masivas sobre la base, los lanzamientos de equipos, las promociones de recarga y la portabilidad—. Vale igual si el marketing lo hace un equipo propio, una sola persona o una agencia que el operador dirige.

**Deficiente.** Tus campañas salen a toda la base con el mismo mensaje. Las bases llegan en archivos que alguien pide, arma y envía a mano, con números que ya no existen y clientes tratados como interesados; nadie sabe quién aceptó recibir mensajes por cada canal, y cada lanzamiento de un equipo se improvisa. Los interesados llegan, pero no sabes cuántos ni de dónde.

**Inicial.** Tienes marca, páginas de campaña y envíos por WhatsApp, SMS y correo, pero sin una estrategia detrás. Las bases se depuran a mano en cada campaña, la promoción de portabilidad le llega a quien ya es tu cliente y el plan que alguien ya paga se le vuelve a ofrecer. Los resultados se miden tarde y a mano, en envíos y clics, y lo aprendido no queda escrito.

**Funcional.** Tu marketing dejó de depender de una persona. La marca, la voz y los perfiles de cliente están escritos, cada plan y cada equipo tiene su página con su precio y cómo contratarlo, y tus clientes saben por qué canales les escribes y qué nunca les vas a pedir. Cada base de campaña pasa por el CRM, el calendario sigue los lanzamientos, las temporadas y las promociones de recarga, y tus campañas salen por segmento, coordinadas por los canales de tu plan y solo a quien aceptó cada canal. Sabes de dónde llega cada interesado y cuánto te cuesta en cada canal, y hasta la campaña de portabilidad, que nunca termina, se revisa cada mes.

**Eficiente.** Probar y ajustar ya es rutina, y lo aprendido cambia cómo se arma la siguiente campaña. Las bases llegan solas desde tus sistemas, los segmentos se arman con lo que cada cliente consume y recarga, y WhatsApp, SMS, correo y la app se coordinan en un mismo recorrido sin saturar a nadie. Sabes qué aportó cada canal a cada venta y cuánto te cuesta cada una, también las que se cierran en una tienda, y la IA asiste a tu equipo en su trabajo diario.

**Óptimo.** La IA produce y ajusta; tu equipo dirige. La IA predice quién va a pasar a pospago, cambiar de equipo o perder interés, decide qué mensaje recibe cada cliente, por qué canal y cuándo, y mueve la pauta entre canales dentro de los límites que fija el equipo; los clientes que Servicio vuelve promotores traen clientes nuevos. El equipo define la estrategia y valida lo que sale.

#### 2.1 Procesos y Rutinas

¿Cómo se arma en tu equipo una campaña —el lanzamiento de un equipo, una promoción de recarga, la de portabilidad—, desde que se decide hasta que sale a la base?

*Descripción:* Mide si las campañas de los planes, los equipos y las recargas salen de un calendario y un proceso compartidos, sin depender de quién las arma, y si el calendario sigue las fechas del negocio.

*Costo de quedarse:* Cada campaña depende de quien la arma: si esa persona falta, el lanzamiento del equipo nuevo sale tarde, la promoción de recarga se cruza con otra y la base se vuelve a armar desde cero.

**Deficiente.**

- No hay calendario de campañas: cada lanzamiento de un equipo, cada promoción de recarga y cada envío a la base se improvisan. `[2.1.D1]`
- Una agencia arma y envía las campañas —las piezas, las páginas de campaña, los mensajes a la base—, y nadie en el operador decide qué sale ni lo revisa. `[2.1.D3]`

**Inicial.**

- Las campañas dependen de quien las arma —una persona del equipo o la agencia—: el calendario, los accesos a las herramientas de envío y a las bases y los pasos a seguir están en sus manos. `[2.1.I3]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y el calendario sigue las fechas del negocio.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y los lanzamientos, las promociones y las campañas sobre la base siguen saliendo aunque cambie una persona: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- Existe un proceso de campaña escrito —del brief y la base a las piezas, el envío por cada canal y la publicación— que el equipo aplica de forma consistente. `[2.1.F2]`
- Si una agencia ejecuta todo o parte del trabajo —las piezas, las páginas de campaña, los envíos—, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia la agencia. `[2.1.F5]`
- El calendario de campañas sigue las fechas del negocio: los lanzamientos de equipos con su preregistro, las temporadas fuertes —el regreso a clases, el aguinaldo, el fin de año—, las promociones de recarga y las campañas largas, como la de portabilidad. `[2.1.F801 · declarado]`

**Eficiente.**

- Cada pieza —el mensaje de WhatsApp, el SMS, el correo o la página de la campaña— pasa por una revisión con lista escrita, por ejemplo, que el enlace lleve a la página de esa campaña y que el precio sea el vigente, y por una aprobación registrada. `[2.1.E5]`

**Óptimo.**

- El sistema detecta por sí mismo cuando una campaña se sale del proceso —un paso que se saltó, una base que no se cargó, una fecha que venció antes de un lanzamiento— y se lo avisa al líder y al responsable; el líder decide el ajuste, y cada aviso queda en el sistema. `[2.1.O4]`

*Se leen igual:* `2.1.D2`, `2.1.I1`, `2.1.I2`, `2.1.F1`, `2.1.F3`, `2.1.F4`, `2.1.F6`, `2.1.E4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien llena la página de una campaña, se preregistra para un equipo o te escribe por WhatsApp, y cuando sale una base de tus sistemas?

*Descripción:* Mide si las herramientas que paga el operador se usan, si lo que entra por las páginas de campaña, el preregistro, WhatsApp y las bases de sus sistemas llega solo al CRM, y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Cada campaña empieza con alguien que pide la base, la limpia y la sube a mano, con un día de atraso; quien llena la página de la campaña o te escribe por WhatsApp espera a que alguien lo pase a un ejecutivo, o se va con otro operador.

**Deficiente.**

- No hay un sistema donde registrar a los interesados: las bases de cada campaña y lo que responde la gente se llevan en hojas de cálculo o en el correo. `[2.2.D1]`
- Lo que llega por el sitio —como la página de una campaña— o por mensajes, como WhatsApp o las redes —una consulta por un plan, un pedido de portabilidad—, cae en el correo o el teléfono de alguien, y no queda registrado en ningún lado. `[2.2.D2]`

**Inicial.**

- Algunos formularios —el de una página de campaña, el del preregistro de un equipo— no están conectados al sistema, o ninguno de los canales conversacionales por los que se atiende lo está: lo que entra por ahí se pasa a mano o se pierde. `[2.2.I2]`
- Las bases de algunas campañas se envían desde una hoja o desde la herramienta de un canal, como la de SMS, sin pasar por el CRM: después nadie sabe a quién le llegó qué. `[2.2.I801 · declarado]`

**Funcional.** Las herramientas que se pagan se usan, lo que entra llega solo al sistema y recibe respuesta, cada base de campaña pasa por el CRM, y si el equipo usa IA, esta conoce la voz de marca y los perfiles de cliente.

*Resultado:* Todo lo que entra por las páginas de campaña, el preregistro y, si se usa, por WhatsApp o el chat llega al CRM y recibe respuesta; cada envío sale de una base cargada en el CRM, así que se sabe a quién le llegó qué, y no se paga por herramientas que nadie usa.

- Si el sitio tiene formularios para dejar datos —la página de una campaña, el preregistro de un equipo, pedir que llame un ejecutivo—, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Cada envío queda registrado en el CRM, también cuando un canal, como el SMS, sale con otra herramienta: en la ficha de cada contacto se ve qué campaña le llegó y de qué base salió. `[2.2.F801 · comprobable]`

**Eficiente.**

- Si el canal conversacional, como WhatsApp, es parte del plan de canales, sus campañas —la de portabilidad, la de un lanzamiento— están automatizadas, con segmentación y con caminos distintos según lo que hizo la persona: si leyó, entró a la página de la campaña o respondió. `[2.2.E2]`
- El traspaso de interesados es automático: cuando un interesado cumple los criterios para pasar a un ejecutivo, le llega con su historial —la campaña, el plan o el equipo que pidió— al ejecutivo o a la tienda que le corresponde, sin que nadie lo pase a mano. `[2.2.E3]`
- Si los contactos nacen o viven en otro sistema —como, en un operador, los de facturación, consumo y recargas, o la herramienta propia de envío de SMS—, ese sistema está integrado con el de marketing y los datos pasan solos, sin cargarlos a mano: las bases de cada campaña ya no se piden ni se suben. `[2.2.E8]`
- Si el operador abre un preregistro para el lanzamiento de un equipo, cada inscrito queda en el CRM con el modelo que pidió, y los avisos del lanzamiento —la fecha, la disponibilidad, cómo contratarlo— le salen solos según ese modelo, sin depurar la lista a mano. `[2.2.E801 · comprobable · requiere 2.2.F3]`

**Óptimo.**

- Lo que se calcula en el almacén central de datos del operador vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada contacto: la segmentación usa, por ejemplo, el consumo, las recargas y el valor de cada cliente, calculados afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D3`, `2.2.I1`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.F10`, `2.2.F11`, `2.2.E1`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.O1`, `2.2.O4`, `2.2.O5`, `2.2.O6`.

#### 2.3 Datos

¿Cómo sabes cuántos interesados te dejan tus campañas, de dónde vienen y cuántos terminan en una línea activa o un servicio instalado?

*Descripción:* Mide si los datos de marketing son confiables: de dónde viene cada interesado, si se distingue al cliente del interesado, si la base está limpia y si queda registrado el permiso de cada canal.

*Costo de quedarse:* Le escribes a números que ya no existen y le ofreces la portabilidad a quien ya es tu cliente; no sabes qué campaña trajo cada venta y, sin el permiso de cada canal registrado, te expones a reclamos y a una sanción.

**Deficiente.**

- No se registra de dónde llegó cada interesado: nadie sabe si vino por un envío de WhatsApp, un SMS, la pauta, la línea de atención o una tienda. `[2.3.D1]`

**Inicial.**

- No hay una regla de cuándo se limpian los datos: se corrigen a mano cuando alguien nota un problema —un número que ya no existe, un cliente que entró como interesado—, y a muchos contactos les faltan los datos que describen al cliente objetivo de cada plan y de cada servicio. `[2.3.I1]`
- Hay reportes, pero se arman a mano en una hoja cada vez, y a una parte de los interesados le falta el origen, como la campaña, el canal o la base de la que salieron. `[2.3.I2]`

**Funcional.** Cada interesado tiene su origen y su etapa, los reportes salen del sistema sin armarlos a mano y el permiso de cada canal queda registrado.

*Resultado:* El líder sabe de qué campaña y de qué canal llega cada interesado, distingue al cliente del que todavía no lo es, y sus reportes salen del sistema y no de una hoja armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por la página de una campaña, WhatsApp, la línea de atención, una tienda o la base de un sistema del operador— tiene su etapa del ciclo de vida, por ejemplo, si ya es cliente o todavía es interesado, y su origen. `[2.3.F1]`
- Los duplicados —la misma persona cargada una vez por cada línea, o como cliente y como interesado a la vez— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —cuántos interesados entran, de dónde vienen, como la campaña o el canal, y cuántos terminan en una venta— salen del sistema sin armarlos a mano. `[2.3.F5]`
- El permiso de cada contacto está registrado por canal —correo, SMS, WhatsApp, llamadas de telemercadeo, notificaciones de la app— y se respeta en cada envío. `[2.3.F9]`

**Eficiente.**

- Se sabe cuánto ingreso deja cada canal —el SMS, el correo, la pauta, la línea de atención—, también el conversacional, como WhatsApp, si se usa. `[2.3.E5]`
- Los duplicados se detectan y se unen solos con reglas que definió el equipo, también los de la misma persona con otro correo o sin correo, como quien solo dejó su número de teléfono. `[2.3.E6]`

**Óptimo.**

- Cada persona tiene una sola ficha que junta al momento lo que hace en todos los canales —la página de una campaña, WhatsApp, el SMS, la app, la tienda y la línea de atención—. `[2.3.O5]`

*Se leen igual:* `2.3.D2`, `2.3.F2`, `2.3.F6`, `2.3.F8`, `2.3.E1`, `2.3.E2`, `2.3.E7`, `2.3.O1`, `2.3.O6`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los interesados y las ventas que dejan sus campañas?

*Descripción:* Mide si cada persona sabe qué le toca en las campañas, si el equipo tiene metas y si decide qué promocionar y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué se promociona lo decide el lanzamiento del momento o quien insiste más, y nadie responde por una meta: el equipo no sabe qué se espera de él ni cuántas ventas dejó su última campaña.

**Deficiente.**

- Qué promocionar —qué plan, qué equipo, qué promoción de recarga— y cómo hacerlo se decide sobre la marcha, sin metas ni números. `[2.4.D2]`

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué base usar, qué mensaje aprobar, cuándo enviarlo— espera a que lo resuelva la gerencia general. `[2.4.I1]`

**Funcional.** Cada uno sabe qué le toca en las campañas, hay metas, y las decisiones y la rendición de cuentas se hacen con números del sistema.

*Resultado:* El equipo sabe qué se espera de cada uno, qué se promociona se defiende con números y no con opiniones, y la dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo.

- El líder tiene un tablero con 4 a 6 métricas clave —cuántos interesados entran, de qué campaña o canal vienen, cuántos terminan en una venta y, donde la venta pasa por un ejecutivo, cuántos pasan a uno— y lo consulta al menos una vez por semana. `[2.4.F2]`
- El equipo tiene metas mensuales o trimestrales —por ejemplo, por línea de negocio: móvil, hogar y empresas—, y en la reunión de resultados rinde cuentas por ellas. `[2.4.F3]`

**Eficiente.**

- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —el valor de vida de los clientes que trae: cuánto pagan cada mes y cuánto tiempo se quedan— frente a lo que cuesta. `[2.4.E8]`

**Óptimo.**

- Lo que la IA puede decidir sola en marketing —por ejemplo, a qué clientes de la base enviarles una promoción de recarga, por qué canal y en qué momento— está por escrito. `[2.4.O6]`

*Se leen igual:* `2.4.D1`, `2.4.D3`, `2.4.I2`, `2.4.F4`, `2.4.F5`, `2.4.F7`, `2.4.E2`, `2.4.E5`, `2.4.E6`, `2.4.E7`, `2.4.O1`, `2.4.O2`, `2.4.O5`.

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza, y qué encuentra un cliente cuando busca un plan o un equipo en tu sitio, o cuando recibe un mensaje a tu nombre?

*Descripción:* Mide si la marca se ve y suena igual en todo lo que sale, si está escrito a quién le habla, si cada plan y cada equipo tiene dónde mostrarse con su precio, si el sitio aparece en buscadores y si el cliente sabe reconocer un mensaje del operador.

*Costo de quedarse:* Cada pieza se ve y suena distinta a la anterior, quien busca el equipo nuevo encuentra la página de otro operador o una sin precio, y tus clientes no distinguen un mensaje tuyo de un fraude que usa tu nombre para pedirles un código o cambiarles la SIM.

**Deficiente.**

- No hay una guía de marca: ni logo, colores y tipografía definidos, ni una forma de escribir acordada, así que cada plan, cada equipo y cada promoción se anuncia a su manera. `[2.5.D1]`
- No está escrito a quién le habla el operador: no hay perfiles de cliente. `[2.5.D2]`

**Inicial.**

- Hay logo, colores y plantillas, pero el perfil de cliente es uno solo y tan general que sirve para cualquiera: no distingue a quien recarga cada semana del hogar que contrata internet o de la pyme que necesita varias líneas. `[2.5.I1]`
- Solo algunas páginas del sitio —por ejemplo, las de algunos planes o equipos— tienen título y descripción, o el sitio carga mal en el celular o tiene enlaces rotos. `[2.5.I2]`

**Funcional.** La marca, la voz y los perfiles de cliente están escritos y se usan, cada plan y cada equipo tiene su página, el sitio cumple lo básico para buscadores, se publica contenido propio cada mes y el cliente sabe por dónde le escribe el operador.

*Resultado:* La marca se ve y suena igual en todo lo que sale, quien busca un plan o un equipo encuentra su precio y cómo contratarlo, el cliente reconoce cuándo le escribe el operador y cuándo es un fraude, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Se publica al menos una vez por mes contenido propio que queda disponible —en el sitio, en un canal de video o en guías, como comparar planes, configurar el equipo nuevo o tener buen internet en toda la casa—, no solo publicaciones en redes. `[2.5.F5]`
- Cada plan, cada equipo en venta y cada servicio del hogar tiene su página en el sitio, con su precio —también en cuotas y con su plazo de permanencia, si lo tiene—, sus condiciones y cómo contratarlo: en línea, con un ejecutivo o en una tienda. `[2.5.F801 · comprobable]`
- El operador le dice al cliente, en su sitio, en la app y en los demás canales que tenga, desde qué números, perfiles y correos le escribe, y qué nunca le va a pedir, como una clave, el código que le llega por SMS o que confirme por mensaje un cambio de SIM. `[2.5.F802 · comprobable]`

**Eficiente.**

- Si el contenido propio se publica en el sitio, está organizado por temas —por ejemplo, elegir un plan, cambiarse de operador o tener buen internet en la casa—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido de compra está dibujado de punta a punta —por ejemplo, de la campaña y su página a la contratación, en línea, con un ejecutivo o en una tienda, la entrega de la SIM o del equipo y la activación o la instalación—, con los puntos de contacto de cada etapa. `[2.5.E4]`

**Óptimo.**

- La IA produce y ajusta el contenido de forma continua —como el de cada plan, cada equipo y cada promoción, y también para la búsqueda conversacional y los asistentes de IA—; el equipo valida cada pieza antes de publicarla, y en el sistema se ve qué produjo o cambió la IA y quién lo aprobó. `[2.5.O2]`

*Se leen igual:* `2.5.D3`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F3`, `2.5.F4`, `2.5.F6`, `2.5.F7`, `2.5.E3`, `2.5.E6`.

#### 2.6 Segmentación

¿Qué cambia en la campaña que recibe una persona según quién es y lo que ya tiene contratado: prepago, pospago, el hogar o una empresa?

*Descripción:* Mide si cada segmento recibe la campaña que le sirve, según cómo usa el servicio y lo que ya tiene con el operador, o si toda la base recibe la misma oferta.

*Costo de quedarse:* Le ofreces la portabilidad a quien ya es tu cliente y el plan que ya paga a quien lo tiene: gastas mensajes sobre bases enormes que nadie aprovecha, cansas a tus clientes y les das razones para pedir que no les escribas más.

**Deficiente.**

- No hay segmentos: las campañas salen a toda la base con el mismo mensaje, al cliente de prepago igual que al de pospago o al hogar con fibra. `[2.6.D1]`

**Inicial.** La base se separa por datos sueltos, como la provincia, el mensaje casi no cambia de un grupo a otro y las campañas le ofrecen a un cliente lo que ya tiene.

- La base se separa solo por datos generales —provincia, ciudad o edad—, no por lo que cada grupo necesita, como cuánto consume, cuánto recarga o qué tiene contratado. `[2.6.I1]`
- Las campañas le ofrecen a un cliente lo que ya tiene: la portabilidad a quien ya tiene su línea con el operador, o el plan que ya paga. `[2.6.I801 · comprobable]`

**Funcional.** Hay segmentos escritos, piezas pensadas para cada uno, nadie recibe la oferta de lo que ya tiene y, donde la venta pasa por un ejecutivo, criterios escritos para clasificar a los interesados.

*Resultado:* Cada segmento recibe la campaña que le sirve, nadie recibe la oferta de lo que ya tiene y, donde la venta pasa por un ejecutivo, este recibe interesados que Marketing ya clasificó con criterios escritos.

- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento: no le hablan igual al cliente de prepago que al de pospago, al hogar o a la pyme. `[2.6.F3]`
- Existen criterios escritos de qué es un suscriptor, un interesado y un interesado listo para pasar a un ejecutivo, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios. `[2.6.F4]`
- Las campañas no le llegan a quien ya tiene lo que ofrecen, salvo que sean para él —subir de plan, sumar una línea, renovar el equipo—: la base se cruza con los servicios activos de cada cliente antes de enviar, y la de portabilidad sale solo a quien todavía no tiene su línea con el operador. `[2.6.F801 · comprobable · requiere 1.3.F801]`

**Eficiente.**

- Cada segmento prioritario —por ejemplo, quien recarga cada semana, el pospago con equipo, el hogar con fibra y la pyme— tiene su perfil de cliente escrito. `[2.6.E6]`
- La segmentación usa datos de comportamiento —qué abrió, qué visitó, cuánto consume, cuándo recarga, cuándo termina su plazo de permanencia—, no solo lo que la persona declaró, y los segmentos se actualizan solos. `[2.6.E7]`

**Óptimo.**

- La IA predice quién va a contratar —pasar de prepago a pospago, cambiar de equipo, sumar una línea— y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F5`, `2.6.E1`, `2.6.E2`, `2.6.E3`, `2.6.E5`, `2.6.O3`, `2.6.O4`.

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por WhatsApp, SMS, correo, la pauta, la app y las tiendas, y a quién le llegan?

*Descripción:* Mide si los canales que el operador eligió salen con regularidad y bajo un mismo plan, solo a quien aceptó cada canal y nunca a quien pidió que no le escriban, y si se sabe lo que cuesta cada interesado y cada venta.

*Costo de quedarse:* Mandas el mismo mensaje por WhatsApp, SMS y correo el mismo día, a veces a quien pidió que no le escribieras: saturas a tus clientes, pagas envíos que nadie lee, te expones a una sanción y no sabes cuánto te cuesta cada venta.

**Deficiente.**

- No hay un plan que diga por qué canales sale el operador: WhatsApp, SMS, correo, la pauta, la app, las tiendas o el telemercadeo. `[2.7.D2]`

**Inicial.**

- La pauta y los correos salen cuando hay algo que promocionar —el lanzamiento de un equipo, una promoción de recarga—, sin presupuesto ni fechas fijados de antemano. `[2.7.I2]`
- Cada canal va por su cuenta —la tienda se entera por el cliente de la promoción que salió por SMS—: no hay calendario común ni campaña que los atraviese. `[2.7.I3]`

**Funcional.** Los canales que el operador eligió salen con regularidad, bajo un mismo plan y solo a quien aceptó recibir mensajes por cada uno.

*Resultado:* Una campaña sale coordinada por WhatsApp, SMS, correo y los demás canales del plan en vez de esfuerzos sueltos, solo a quien aceptó recibirla por ese canal, y el líder ve cuánto le cuesta cada interesado según el canal del que venga.

- Si el canal conversacional, como WhatsApp, es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario —la campaña de portabilidad, la de un lanzamiento, la de recarga—, no solo para responder lo que entra. `[2.7.F4]`
- En el sistema se ve cuánto costó cada interesado —o cada venta, donde se contrata sin ejecutivo, como la recarga o el plan contratado en la web— el último mes, al menos por canal. `[2.7.F6]`
- Quien pide no recibir más por un canal, o está en la lista de exclusión del operador, deja de recibir campañas por ese canal desde el siguiente envío. `[2.7.F801 · comprobable · requiere 2.3.F9]`

**Eficiente.**

- Si hay app, sus notificaciones son parte de las campañas —por ejemplo, la promoción de recarga o el equipo nuevo—, con el permiso de cada persona. `[2.7.E5]`
- Al menos tres canales —por ejemplo, el correo, el SMS y la app—, también WhatsApp si se usa, se coordinan en un mismo recorrido: uno continúa lo que empezó otro, con un límite de frecuencia y respetando el permiso de cada canal. `[2.7.E6]`
- Se sabe, por canal, cuánto costó cada venta concretada —la línea activa, el número portado o el servicio instalado—, contando también las que se cerraron en una tienda o con un ejecutivo, no solo en la web o la app. `[2.7.E801 · comprobable · requiere 1.3.F3]`

**Óptimo.**

- Los clientes que Servicio identifica como promotores se vuelven un canal de referidos —por ejemplo, para traer a su familia a un plan o pasar otro número por portabilidad— y de casos de éxito sin pedirlos a mano: el sistema los invita solo, el equipo elige qué casos se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.F1`, `2.7.F2`, `2.7.F5`, `2.7.F7`, `2.7.F8`, `2.7.E2`, `2.7.E3`, `2.7.E4`, `2.7.E7`, `2.7.E8`, `2.7.E9`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada campaña —un lanzamiento, una promoción de recarga, la de portabilidad— cuando termina, o mientras sigue corriendo?

*Descripción:* Mide si cada campaña se evalúa por las ventas y las recargas que dejó, también las campañas largas que no terminan, y si deja un aprendizaje.

*Costo de quedarse:* Repites los envíos de siempre porque nadie anota cuáles dejaron ventas: la campaña de portabilidad corre meses sin que nadie la revise, y cada lanzamiento empieza de cero.

**Deficiente.**

- No se mide qué trajo cada campaña —interesados, ventas o recargas—: solo se sabe cuántos mensajes salieron y lo que se gastó, o ni eso. `[2.8.D2]`

**Inicial.**

- Se miran envíos, aperturas, clics y visitas a la página de la campaña, no los interesados ni las ventas que trajo cada campaña. `[2.8.I1]`

**Funcional.** Los resultados de cada campaña están a la vista, y cada una deja una revisión escrita, también las que corren meses sin cerrarse.

*Resultado:* El equipo ve cuántas ventas dejó cada campaña sin armar el número a mano, y cada una deja una lección escrita para la siguiente, también la de portabilidad, que no espera a terminar para revisarse.

- Los resultados de cada campaña —los interesados, las ventas o las recargas que trajo: líneas activas, números portados, servicios instalados, no solo los envíos y los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`
- Las campañas que corren sin fecha de cierre —la de portabilidad, la de recargas— tienen una revisión escrita de qué funciona y qué no al menos una vez por mes, sin esperar a que terminen. `[2.8.F801 · declarado · hábito]`

**Eficiente.**

- La planificación de las campañas siguientes se ajusta con lo aprendido: el próximo lanzamiento o la próxima promoción de recarga se arma con lo que mostraron las pruebas y las revisiones de cierre. `[2.8.E4]`
- Hay pruebas A/B regulares —al menos una activa por mes, por ejemplo, dos versiones del SMS o dos páginas para la misma campaña—, cada una con su hipótesis escrita y su resultado registrado. `[2.8.E5]`

**Óptimo.**

- La IA ajusta las campañas mientras corren —deja de enviar la versión del mensaje que no funciona y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`
- Los mensajes que decide la IA se miden contra un grupo de control —por ejemplo, una parte de la base que no recibe la promoción de recarga—, y en el sistema se ve cuánto agregan; con eso el equipo revisa los límites que le fijó a la IA. `[2.8.O3]`

*Se leen igual:* `2.8.D1`, `2.8.D3`, `2.8.I2`, `2.8.F3`, `2.8.E3`.

### Área 3 — Servicio

Mide el rendimiento del servicio del operador, que cubre todo lo que pasa después de la activación o la instalación: las averías, los reclamos, la facturación y los cobros, los cambios de plan, de SIM y de titular, la renovación y la retención. Mira cómo está montado por dentro y qué produce en averías resueltas, reclamos respondidos dentro del plazo del regulador y clientes que se quedan.

**Deficiente.** El servicio se improvisa cliente por cliente. Cada tienda y cada ejecutivo de atención resuelve las averías y los reclamos a su manera, no hay un sistema donde queden los casos y nadie sabe si los reclamos se respondieron dentro del plazo que fija el regulador. Te enteras de que un cliente se fue cuando ya se llevó su número a otro operador.

**Inicial.** El conocimiento vive en una o dos personas que saben cómo se destraba una portabilidad o se corrige un cobro, y eso te deja con un punto único de fallo. Hay un sistema de casos, pero parte del equipo sigue atendiendo por fuera, en el WhatsApp de la tienda o en su correo; cada ejecutivo de atención tiene sus propias respuestas y cada quien verifica a su manera quién es el titular antes de entregar una SIM. La atención es frágil: para reportar una avería, el cliente tiene que llamar y esperar.

**Funcional.** Tu atención es consistente y ya no depende de quién atienda. Sabes qué tipos de cliente atiendes —prepago, pospago, hogar, pymes y empresas— y qué espera cada uno. Cada caso sigue un mismo recorrido en el sistema, con los servicios del cliente a la vista; cada avería tiene su número y el cliente se entera de cada cambio de estado, cada reclamo lleva el plazo que fija el regulador y sabes cuántos se respondieron dentro de él, y nadie entrega una SIM ni cambia un titular sin verificar la identidad. El cliente recarga, consulta su consumo, paga su factura y reporta una avería sin esperar a nadie. Todavía no hay alertas automáticas de quién se puede ir, pero el cliente ya recibe aviso antes de que termine su plazo de permanencia, antes de una suspensión por falta de pago y cuando una avería masiva lo afecta, y quien pide la baja recibe una razón para quedarse.

**Eficiente.** El servicio empieza a adelantarse al problema. Cada tipo de caso tiene su plazo, con alertas y escalación automática; la red abre sola la avería masiva, el cliente sigue sus casos y diagnostica su avería en la app, y la IA asiste a tu equipo en su trabajo diario. Mides tiempos, satisfacción y las averías que se repiten por cliente y por zona, y ningún caso se pierde entre la red, las instalaciones, la facturación y Servicio. Cada cliente tiene un indicador de salud, tus empresas más importantes tienen un responsable dedicado y quien da señales de irse —deja de recargar, baja su consumo, reclama más— recibe una acción de retención antes de decidirlo.

**Óptimo.** Un agente de IA resuelve casos en todos los canales donde atiende tu equipo —la app, el chat, WhatsApp y la línea de atención— y le pasa a una persona, con todo el contexto, lo que no puede resolver. Las rutinas corren solas mientras el equipo supervisa y atiende las excepciones; casi todas las fallas que detecta la red se resuelven antes de que el cliente las note, y un modelo anticipa qué cliente se puede ir a otro operador antes de que pida la portabilidad. Sumas clientes sin que crezca el equipo.

#### 3.1 Procesos y Rutinas

¿Cómo se atiende un caso en tu operador —una avería, un reclamo por un cobro o una gestión de la SIM—, desde que entra hasta que se cierra?

*Descripción:* Mide si las averías, los reclamos y las gestiones siguen un proceso definido, para que la atención no dependa de quién los tome en la tienda o en el centro de contacto.

*Costo de quedarse:* Una avería o un reclamo se resuelve distinto según quién lo tome: el cliente no sabe a qué atenerse, un plazo del regulador que se vence termina en una sanción y una SIM entregada sin verificar le abre la puerta al fraude.

**Deficiente.**

- Cada ejecutivo de atención resuelve los casos a su manera —las averías, los reclamos, las consultas y las gestiones—, en la tienda o en el centro de contacto. `[3.1.D1]`

**Inicial.**

- Hay un recorrido para atender los casos —las averías, los reclamos, las consultas y las gestiones— que el equipo sigue de palabra, sin configurar ni escribir. `[3.1.I1]`
- Todavía se depende de héroes: cuando falta la persona que sabe —por ejemplo, cómo se destraba una portabilidad o se corrige un cobro mal hecho—, los casos se traban. `[3.1.I2]`

**Funcional.** El equipo atiende en un mismo sistema, con el recorrido de atención configurado, los plazos del regulador escritos y la identidad del cliente verificada antes de cada cambio de SIM o de titular.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada cliente tiene a alguien que responde por él, cada reclamo lleva escrito el plazo que fija el regulador, y nadie entrega una SIM ni cambia un titular sin verificar antes quién es el cliente.

- El recorrido de atención está configurado con sus etapas y cubre cada caso —una avería, un reclamo, una consulta o una gestión como un cambio de plan—, de la recepción al cierre. `[3.1.F1]`
- Existe un proceso escrito para escalar los reclamos graves y los casos que quien atiende no puede resolver —por ejemplo, una avería que deja a una empresa sin servicio o un cambio de SIM que el titular no pidió—: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cada tipo de reclamo —un cobro, la calidad del servicio, una portabilidad— tiene escrito en el proceso el plazo de respuesta que fija el regulador de telecomunicaciones. `[3.1.F801 · declarado]`
- Si el área atiende cambios en las cuentas y las líneas, los pagos, los envíos o los datos personales —por ejemplo, entregar una SIM nueva, hacer un duplicado o cambiar el titular de una línea—, verifica la identidad del cliente con los pasos que define el proceso antes de atenderlos, en cualquier canal, y queda registrado en el caso. `[3.1.F8]`

**Eficiente.**

*Resultado:* El equipo sabe en cuánto tiempo debe resolver cada tipo de caso, también los que no tienen un plazo del regulador; cada momento clave de la relación del cliente con el operador tiene un dueño, una avería masiva se atiende con una guía y no improvisando, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de caso o prioridad —cuánto se tarda en reparar una avería del hogar, en responder una consulta o en hacer un cambio de plan—, también para lo que el regulador no fija. `[3.1.E1]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —la contratación, la activación o la instalación y, si lo hay, el fin del plazo de permanencia— y un responsable y un estándar para cada uno. `[3.1.E4]`
- Hay una guía escrita para la avería masiva: quién la declara, cómo se juntan los casos de los clientes afectados, qué se les dice y cada cuánto, y cuándo se da por cerrada. `[3.1.E801 · declarado]`

**Óptimo.**

- El sistema detecta, sin que nadie lo revise a mano, cuando una avería, un reclamo o una gestión se sale de las etapas o los pasos del proceso —por ejemplo, un cambio de SIM sin la verificación de identidad registrada—, y se lo señala al ejecutivo de atención y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3]`

*Se leen igual:* `3.1.D2`, `3.1.I3`, `3.1.I4`, `3.1.F2`, `3.1.F3`, `3.1.F5`, `3.1.F6`, `3.1.F7`, `3.1.E3`, `3.1.E5`, `3.1.E6`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega una avería, un reclamo o una gestión al sistema y a quien la tiene que atender, entre por la tienda, la línea de atención, WhatsApp o la app?

*Descripción:* Mide si cada caso, venga de la tienda, la línea de atención o la app, queda en el sistema y llega solo a quien lo atiende, y cuánto de la atención se automatiza.

*Costo de quedarse:* Las averías y los reclamos se reparten a mano y se pierden entre la tienda, la línea de atención y el WhatsApp de cada ejecutivo: el cliente tiene que llamar varias veces para saber cuándo vuelve su servicio.

**Deficiente.**

- Los casos —las averías, los reclamos, las consultas y las gestiones— se manejan en los celulares personales o el WhatsApp de cada ejecutivo de atención, o en correos individuales. `[3.2.D2]`

**Inicial.**

- Hay un sistema de casos, pero lo que entra —por ejemplo, por la tienda, la línea de atención o la app— se reparte a mano, o el equipo atiende por WhatsApp o chat y ninguno de esos canales llega al sistema. `[3.2.I2]`

**Funcional.** Los casos entran al sistema y se asignan solos, cada avería tiene su número y el cliente recibe cada cambio de estado, y el equipo le escribe al cliente solo desde los canales oficiales del operador.

*Resultado:* Lo que entra por los canales conectados llega al sistema y se le asigna a alguien sin que nadie lo reparta, el cliente sabe en qué va su avería y cuándo llega el técnico sin tener que llamar, y ningún cliente recibe un mensaje del operador desde un número que no sea oficial.

- Al entrar un caso, el sistema lo asigna solo según una regla simple: por ejemplo, las averías del hogar al equipo técnico y los reclamos por cobros a quien atiende la facturación. `[3.2.F5]`
- Si el equipo contacta clientes por WhatsApp o por teléfono, lo hace desde los canales verificados del operador y nunca pide claves ni códigos, como el PIN de la SIM o el código que llega por mensaje para un cambio de línea. `[3.2.F11]`
- Quien tiene que enterarse de un cambio de estado —por ejemplo, el cliente cuando su avería pasa a tener una visita técnica agendada, con su fecha y su franja horaria, o queda resuelta— recibe el aviso sin que nadie se lo mande. `[3.2.F10]`
- Cada avería que reporta un cliente queda en el sistema con un número que se le da en el momento, y con ese número el cliente consulta en qué va sin tener que contar de nuevo lo que le pasa. `[3.2.F801 · comprobable]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer —un reclamo cerca del plazo del regulador, una avería que no se reparó en el tiempo prometido— suben solos a quien los tiene que resolver; la avería masiva aparece en el sistema antes de que lleguen las llamadas, el cliente ve y abre sus casos en la app, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay un portal o una app donde el cliente ve y abre sus casos —una avería, un reclamo por su factura— y sigue en qué van. `[3.2.E2]`
- Si los servicios del cliente y lo que paga viven en otro sistema —el de facturación o el de la red—, una integración los trae a su ficha sin cargarlos a mano. `[3.2.E6]`
- Las alarmas de la red —una caída en una zona, un corte de fibra, una antena fuera de servicio— abren solas en el sistema la avería masiva y la relacionan con los clientes afectados, sin que nadie la cargue a mano. `[3.2.E801 · comprobable]`

**Óptimo.**

- Un agente de IA resuelve casos en todos los canales donde atiende el equipo —explica por qué cambió una factura, hace un cambio de plan, guía el reinicio del módem—, sin que intervenga una persona, y le pasa a un ejecutivo de atención, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, qué tan probable es que el cliente se lleve su número a otro operador. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.F4`, `3.2.F6`, `3.2.F8`, `3.2.F9`, `3.2.E1`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.E7`, `3.2.E8`, `3.2.O5`.

#### 3.3 Datos

¿De dónde sacas qué averías, reclamos y gestiones te llegan, cuántos, de qué clientes y de qué zonas?

*Descripción:* Mide si los datos de cada cliente —sus líneas, sus servicios y sus casos— están completos y ordenados para atender, decidir y responderle al regulador sin reconstruirlos.

*Costo de quedarse:* Cada vez que el cliente llama tiene que volver a decir qué plan tiene y qué le pasó, y no puedes demostrarle al regulador cuántos reclamos respondiste dentro del plazo.

**Deficiente.**

- La información de los clientes y sus casos está repartida entre correos, chats, hojas, el sistema de facturación, el de la red y otros que no se conectan, y no hay un lugar donde se vea junta. `[3.3.D1]`
- No se puede reconstruir qué le pasó a un cliente con su línea o su servicio del hogar —qué averías tuvo, qué reclamó, qué se le acreditó—: su historia no queda registrada en ningún lado. `[3.3.D2]`

**Inicial.**

- Los casos están en un solo sistema, pero la ficha del cliente sale incompleta: lo que tiene contratado —sus líneas, su plan, los servicios del hogar— hay que buscarlo en otro sistema, como el de facturación. `[3.3.I1]`
- Los números de casos —cuántas averías, reclamos, consultas y gestiones llegan y de qué tipo— se arman a mano, fuera del sistema. `[3.3.I2]`

**Funcional.** La historia y los servicios de cada cliente están a la vista, cada caso tiene su tipo y su motivo, y se sabe cuántos reclamos se respondieron dentro del plazo del regulador.

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cuántos reclamos se respondieron dentro del plazo que fija el regulador; quien atiende tiene la historia del cliente y sus servicios en segundos.

- La ficha del cliente muestra lo que tiene contratado —por ejemplo, el plan de cada línea, el internet del hogar o el equipo que paga en cuotas— y su valor para el operador, no solo sus casos. `[3.3.F2]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida: por ejemplo, una avería de la línea o del hogar, un reclamo por un cobro, un cambio de plan o de SIM, una baja o una portabilidad. `[3.3.F4]`
- Se sabe, con un reporte que sale del sistema, cuántos reclamos se respondieron dentro del plazo que fija el regulador y cuáles se vencieron. `[3.3.F801 · comprobable · requiere 3.1.F801]`

**Eficiente.**

*Resultado:* El operador sabe qué tan rápido y qué tan bien atiende, cuánto tarda un cliente nuevo en tener su servicio funcionando y dónde se repiten las averías, con la satisfacción medida y no supuesta; sabe además qué tan sano está cada cliente.

- Se mide cuánto tarda cada cliente nuevo en tener su servicio funcionando: el tiempo desde que contrata hasta que su línea queda activa o su servicio del hogar queda instalado y en uso. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente, que combina sus casos abiertos —como las averías que vuelven o los reclamos—, su satisfacción y su uso del servicio: por ejemplo, su consumo o, en el prepago, sus recargas. `[3.3.E5]`
- Se mide cuántas averías se repiten —en el mismo cliente dentro del plazo que fija el proceso y en la misma zona—, y ese número se revisa cada mes. `[3.3.E801 · comprobable · hábito]`

**Óptimo.**

- Un modelo predictivo de salud calcula para cada cliente qué tan probable es que se vaya —que pida la baja, se lleve su número a otro operador o deje de recargar— y si está logrando lo que busca con su servicio, a partir de su experiencia y de sus resultados; el puntaje se ve en su ficha y el responsable de cada cliente revisa a los que el modelo marca. `[3.3.O1]`
- Modelos con IA predicen lo que viene —por ejemplo, cuántas averías van a entrar después de una tormenta o cuántos reclamos llegan con el cierre de la facturación— y proponen qué hacer; lo que predicen se ve en los tableros del área y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.I3`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.F7`, `3.3.F8`, `3.3.F9`, `3.3.E1`, `3.3.E2`, `3.3.E6`, `3.3.E7`, `3.3.E8`, `3.3.O2`, `3.3.O5`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el equipo va al día con las averías, los reclamos y los plazos del regulador?

*Descripción:* Mide si cada persona de la atención sabe qué le toca, y si el líder sigue con datos el avance, los plazos de los reclamos y lo que resuelven las áreas técnicas, y pide cuentas.

*Costo de quedarse:* Nadie sabe bien a quién le toca la avería que la red no resolvió o el cobro que facturación no corrigió, y la gerencia se entera de un reclamo vencido cuando el cliente ya fue al regulador.

**Deficiente.**

- Nadie tiene claro qué le toca: entre la bienvenida de los clientes nuevos, las averías, los reclamos por cobros y las bajas, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.**

- El líder mira los números de vez en cuando, sobre todo cuando algo sale mal, como una avería masiva o un reclamo que llega al regulador. `[3.4.I2]`

**Funcional.** Cada persona tiene su rol por escrito, el líder sigue un tablero cada semana —con las averías abiertas y los reclamos cerca del plazo del regulador— y el equipo rinde cuentas en sus reuniones.

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día, cuántas averías siguen abiertas y si hay reclamos cerca de vencer su plazo.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, entre ellos las averías, reclamos cerca del plazo que fija el regulador, volumen, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`
- El equipo tiene metas escritas —tiempos de respuesta, tiempo de reparación de las averías, casos resueltos, satisfacción— y el líder las revisa cada mes. `[3.4.F4]`

**Eficiente.** El equipo rinde cuentas por sus plazos, el líder prepara a quien entra y acuerda con Ventas y con la red, las instalaciones y la facturación qué recibe y qué devuelve cada una.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, cada cliente nuevo llega de Ventas con lo que contrató y lo que se le prometió, y la red, las instalaciones y la facturación cumplen lo acordado con los casos que resuelven.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —los planes y la oferta vigente, la verificación de identidad, las averías y los reclamos—; no se le entrena de memoria. `[3.4.E2]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente —prepago, pospago, hogar, pymes y empresas— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.E8]`
- El acuerdo con las áreas que resuelven parte de los casos —la red, las instalaciones, propias o de contratistas, y la facturación— está escrito y se mide: qué reciben, en cuánto tiempo lo resuelven y por qué devuelven un caso. `[3.4.E801 · comprobable]`

**Óptimo.**

- El líder ya no reparte averías ni reclamos ni apaga incendios: dedica su tiempo a decidir qué se automatiza, qué se mide y qué se mejora. `[3.4.O2]`
- El equipo de servicio se mide por los clientes que retiene —los que no piden la baja ni se llevan su número a otro operador— y por los clientes con potencial que le pasa a Ventas, no solo por los casos que cierra. `[3.4.O5]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I3`, `3.4.F3`, `3.4.F5`, `3.4.E1`, `3.4.E4`, `3.4.E5`, `3.4.E6`, `3.4.E7`, `3.4.O1`, `3.4.O6`.

#### 3.5 Consistencia de Atención

¿En qué se apoya tu equipo para que una avería o un reclamo se resuelva igual en cualquier tienda o canal, lo atienda quien lo atienda?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y da la misma respuesta y el mismo criterio en cualquier tienda o canal, lo atienda quien lo atienda.

*Costo de quedarse:* A un cliente le acreditan los días sin servicio en una tienda y en la línea de atención se los niegan: lo nota, desconfía y se va a otro operador.

**Deficiente.**

- No hay respuestas guardadas: cada ejecutivo de atención, en la tienda o en el centro de contacto, escribe cada respuesta desde cero, a su manera, como la de una avería o la de un cobro. `[3.5.D1]`

**Inicial.**

- Hay algunas respuestas guardadas, pero cada ejecutivo de atención o cada tienda tiene las suyas: no están al alcance de todo el equipo. `[3.5.I1]`

**Funcional.** Los tipos de cliente están escritos, cada cliente nuevo arranca con una bienvenida definida, el equipo tiene respuestas guardadas para lo frecuente y cada tipo de reclamo tiene escritos sus criterios de resolución.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, el cliente nuevo arranca con una bienvenida clara hasta tener su servicio funcionando, y en cualquier tienda o canal quien atiende tiene a mano las mismas respuestas y los mismos criterios para acreditar una caída del servicio o ajustar un cobro.

- Existe un proceso escrito de bienvenida del cliente nuevo, con un resultado definido que debe alcanzar al terminarlo: por ejemplo, que su línea o su servicio del hogar funcione, que sepa usar la app y que entienda su primera factura. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende el área —por ejemplo, prepago, pospago, hogar, pymes y empresas—, qué necesita cada uno, qué espera del servicio y cuáles se consideran clientes clave, consultable por cualquier ejecutivo de atención. `[3.5.F4]`
- Cada tipo de reclamo tiene escritos sus criterios de resolución —cuándo se acreditan los días sin servicio, cuándo se ajusta un cobro que el cliente no reconoce, cuándo se cambia un equipo en garantía—, consultables por quien atiende, en la tienda o en el centro de contacto. `[3.5.F801 · declarado]`

**Eficiente.**

- El tono y la voz de marca se aplican a las respuestas, en la tienda, en la línea de atención y en cada canal escrito, no cada ejecutivo de atención con su estilo. `[3.5.E2]`
- Existe una guía de estilo de servicio documentada; por ejemplo, dice cómo se le habla al cliente durante una avería masiva, ante un cobro que no reconoce o antes de suspenderle un servicio por falta de pago. `[3.5.E3]`

**Óptimo.**

- Lo que la IA responde o escribe sola —en la app, el chat o WhatsApp, como el estado de una avería o la explicación de una factura— sigue la guía de tono y estilo de la marca; el equipo revisa una muestra de sus respuestas y corrige a la IA cuando se sale de la guía, y cada respuesta queda en el sistema. `[3.5.O1]`

*Se leen igual:* `3.5.F1`, `3.5.F3`, `3.5.F5`.

#### 3.6 Priorización de Clientes

¿Cómo se decide qué se atiende primero: una empresa sin servicio, un cambio de SIM que el titular no pidió o una consulta sobre la factura?

*Descripción:* Mide si una avería que deja al cliente sin servicio o un posible fraude con su línea se atienden antes que una consulta, y si cada cliente recibe la atención que le corresponde.

*Costo de quedarse:* La empresa que se quedó sin internet espera en la misma fila que una consulta de saldo, y quien denuncia que le cambiaron la SIM sin pedirlo espera su turno mientras alguien usa su número.

**Deficiente.**

- Los casos se atienden por orden de llegada o como prefiere cada ejecutivo de atención, sin mirar su gravedad —un cliente sin servicio, un cambio de SIM que nadie pidió— ni quién es el cliente. `[3.6.D1]`

**Inicial.**

- Se intenta atender primero lo urgente, como un cliente sin servicio, pero los casos no tienen una prioridad asignada: cada ejecutivo de atención decide a ojo, o se adelanta el cliente que más insiste. `[3.6.I1]`

**Funcional.** Cada caso tiene una prioridad que el equipo respeta, cada tipo de cliente recibe la atención que le corresponde y la empresa con un nivel de servicio contratado se atiende en el plazo de su contrato.

*Resultado:* Un cliente sin servicio o un posible fraude con su SIM se atiende primero, cada tipo de cliente recibe la atención que le corresponde, la empresa con un tiempo de reparación garantizado lo recibe, y quien atiende no tiene que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja; un cliente sin servicio o un cambio de SIM que el titular no pidió, por ejemplo, es urgente— y los ejecutivos de atención la respetan. `[3.6.F1]`
- El ejecutivo de atención usa la ficha del cliente —sus líneas, sus servicios, su plan y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`
- Si un cliente tiene contratado un nivel de servicio —por ejemplo, una empresa con un tiempo de reparación garantizado—, sus averías se atienden con el plazo y la prioridad que fija su contrato, y quien las atiende los ve en el caso. `[3.6.F801 · comprobable]`

**Eficiente.**

*Resultado:* La atención cambia según el momento en que está cada cliente, cada empresa importante tiene un responsable que la conoce, y el resto de la cartera no queda sola.

- Cada cliente clave —por ejemplo, la empresa con muchas líneas o con su conectividad contratada con el operador— tiene un responsable dedicado que lo conoce. `[3.6.E1]`

**Óptimo.**

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo en la app, y nunca tiene que volver a explicar lo que se le ofreció al contratar.

- En la app o la web, cada cliente ve lo que corresponde a su tipo, a sus servicios y a sus casos abiertos —por ejemplo, la empresa ve sus líneas y sus averías, y el cliente prepago su saldo y sus recargas—, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le ofreció al contratar, como una promoción o un precio por traer su número, y el segmento del que viene—, que quien lo atiende, ejecutivo de atención o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.F2`, `3.6.F4`, `3.6.F5`, `3.6.E4`, `3.6.E5`, `3.6.O2`.

#### 3.7 Proactividad y retención

¿Cómo te enteras de que un cliente tiene un problema con su servicio, o de que se está por ir a otro operador?

*Descripción:* Mide si el servicio avisa antes de lo que afecta al cliente —una avería masiva, el fin de su plazo de permanencia, una suspensión por falta de pago— y actúa antes de que pida la baja o se lleve su número.

*Costo de quedarse:* Te enteras de que un cliente estaba mal cuando ya se llevó su número a otro operador, y una avería masiva sin aviso o una suspensión sorpresa te llena la línea de atención de llamadas y de reclamos.

**Deficiente.**

- Aunque un cliente acumule averías que vuelven, un cobro que reclama cada mes o un reclamo sin resolver, nadie lo contacta: los problemas se atienden cuando estallan. `[3.7.D1]`
- El área nunca contacta al cliente por iniciativa propia: ni cuando una avería masiva lo afecta ni cuando se acerca el fin de su plazo de permanencia. `[3.7.D2]`

**Inicial.**

- Cuando un cliente tiene problemas repetidos —la misma avería que vuelve, un cobro que vuelve a aparecer—, a veces alguien lo contacta, pero depende de que lo note. `[3.7.I1]`

**Funcional.** Los problemas repetidos y los reclamos se detectan, aunque sea a mano, y los clientes clave reciben contacto antes de sus fechas críticas; el cliente recibe aviso antes del fin de su plazo de permanencia, antes de una suspensión por falta de pago y cuando una avería masiva lo afecta, y quien pide la baja recibe una razón para quedarse.

*Resultado:* Los problemas que se repiten, los reclamos y las fechas críticas de los clientes clave ya no toman al equipo por sorpresa: el cliente sabe antes cuándo termina su plazo de permanencia y cuándo se le va a suspender un servicio, se entera de una avería masiva sin tener que llamar, quien pide la baja recibe una razón para quedarse y, cuando alguno se va, se sabe por qué.

- Un cliente con casos repetidos por el mismo problema —una avería que vuelve, una señal que se cae en su casa, un cobro que vuelve a aparecer—, un reclamo sin resolver o, si se piden calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los clientes clave —por ejemplo, la empresa con muchas líneas— reciben contacto antes de sus fechas críticas —el fin de su contrato, la renovación de sus equipos o el vencimiento de un servicio contratado—, no después. `[3.7.F2]`
- Cada cliente que se va —da de baja sus servicios o se lleva su número a otro operador— deja registrada la razón de su salida: por ejemplo, el precio, la cobertura, una avería que no se resolvió o la oferta de otro operador. `[3.7.F3]`
- Quien pide la baja de una línea o de un servicio del hogar recibe, antes de que se procese, una razón para quedarse —un plan que le calce mejor, un descuento, un equipo nuevo—, no solo el trámite de la baja; también quien pide llevarse su número a otro operador, donde la regulación permite contactarlo. `[3.7.F801 · comprobable · hábito · relación continua]`
- Antes de que termine su plazo de permanencia, el cliente recibe un aviso con la fecha, lo que pasa después con su plan y su precio, y qué opciones tiene, sin tener que preguntarlo. `[3.7.F802 · comprobable · relación continua]`
- Cuando una avería masiva afecta una zona, los clientes afectados reciben un aviso con lo que pasa y cuándo se espera que vuelva el servicio, y otro cuando se restablece, sin tener que llamar. `[3.7.F803 · comprobable · hábito]`
- Antes de suspender un servicio por falta de pago, el cliente recibe un aviso con el monto pendiente, la fecha de la suspensión y cómo pagar. `[3.7.F804 · comprobable · relación continua]`

**Eficiente.** Ningún caso se pierde aunque lo resuelva la red, las instalaciones o la facturación, el cliente recibe lo que necesita saber antes de pedirlo y quien da señales de irse recibe una acción de retención antes de decidirlo.

*Resultado:* Los casos del cliente no se pierden entre áreas, el cliente sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que crezcan; el operador retiene clientes que antes se iban sin aviso, ve quién está listo para pasar a pospago o sumar un servicio, y sus empresas más importantes ven qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de que un cliente se puede ir —por ejemplo, porque dejó de recargar o bajó su consumo— o de que está listo para crecer, como pasar a pospago o sumar el internet del hogar. `[3.7.E1]`
- Si otras áreas resuelven casos del cliente —la red, las instalaciones o la facturación—, quedan en el mismo sistema y no se pierden. `[3.7.E4]`
- Los clientes en riesgo —por ejemplo, quien deja de recargar, baja su consumo o reclama más— reciben una acción de retención antes de decidir irse, y los que tienen potencial, como quien podría pasar a pospago o sumar una línea, se le señalan a Ventas con su contexto. `[3.7.E7]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —la visita técnica de su instalación, el fin de una promoción, un cambio en las condiciones de su plan—; sale sola, disparada por el evento y en el canal que el cliente prefiere, no cuando alguien se acuerda. `[3.7.E8]`

**Óptimo.**

- La mayoría de los problemas que detecta el sistema —por ejemplo, una falla de la red en una zona o un módem que se desconecta seguido— se resuelven antes de que el cliente los note: el equipo valida la solución y en el sistema se ve que el cliente no tuvo que abrir un caso. `[3.7.O2]`
- La IA decide qué acción proactiva recibe cada cliente —qué, cuándo y por qué canal, como una oferta para quedarse o una revisión de su plan— según su historia y sus señales, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada cliente. `[3.7.O3]`

*Se leen igual:* `3.7.F4`, `3.7.E3`, `3.7.E6`, `3.7.O5`, `3.7.O6`.

#### 3.8 Autoservicio

¿Qué pasa con lo que tus clientes preguntan y piden una y otra vez, como recargar, ver su consumo, pagar la factura o reportar una avería?

*Descripción:* Mide si el operador puede atender a más clientes sin que el equipo crezca al mismo ritmo, gracias a las respuestas publicadas, a las gestiones que el cliente hace solo y a lo que se aprende de los casos.

*Costo de quedarse:* La línea de atención se llena de llamadas para consultar un saldo, pagar una factura o reportar una avería, y cada cliente que sumas suma más llamadas a la fila.

**Deficiente.**

- No hay ninguna respuesta publicada —en el sitio o en la app— que el cliente pueda consultar por su cuenta. `[3.8.D1]`
- Hasta las preguntas que más se repiten —cómo recargar, por qué subió la factura, cómo reiniciar el módem— se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.** Hay algunas respuestas publicadas o un chatbot de menú, pero lo que más preguntan los clientes todavía no tiene respuesta publicada, y para reportar una avería hay que llamar y esperar a una persona.

- Hay un chatbot de menú fijo —en WhatsApp o en la app—, pero no responde las preguntas que más se repiten, como por qué cambió el monto de la factura. `[3.8.I1]`
- Para reportar una avería, el cliente tiene que llamar a la línea de atención y esperar a que lo atienda una persona. `[3.8.I801 · comprobable]`

**Funcional.** Las preguntas más frecuentes tienen respuesta publicada, y el cliente recarga, consulta su saldo y su consumo, paga su factura y reporta una avería sin esperar a nadie.

*Resultado:* El cliente consulta por su cuenta la respuesta a las preguntas de siempre y hace solo, a cualquier hora, lo que más pide —recargar, ver su consumo, pagar y descargar su factura, reportar una avería—; quien atiende remite a la respuesta publicada en vez de volver a escribirla.

- Las diez preguntas que más se repitieron en el último trimestre —o todas, si son menos— tienen una respuesta publicada que el cliente puede leer por su cuenta: por ejemplo, cómo consultar el saldo, por qué cambió el monto de la factura o cómo configurar el módem. `[3.8.F1]`
- El cliente puede hacer por su cuenta y a cualquier hora —en la app, la web o por mensaje— lo que corresponde a su servicio: recargar, consultar su saldo y su consumo, y pagar y descargar su factura, sin ir a una tienda ni llamar. `[3.8.F801 · comprobable]`
- El cliente puede reportar una avería a cualquier hora sin esperar a una persona —en la app, la web, WhatsApp o una línea automática—, y la avería queda registrada en el sistema. `[3.8.F802 · comprobable]`

**Eficiente.** El cliente diagnostica su avería en la app, se documenta lo que se aprende de los casos y el autoservicio empieza a liberar al equipo.

*Resultado:* El operador puede sumar clientes sin sumar ejecutivos de atención en la misma proporción, porque buena parte de lo que preguntan y piden se resuelve sin abrir un caso, también muchas averías.

- Al menos una vez por trimestre se revisan los casos que se repiten y, donde la relación es continua, las razones por las que los clientes se van —dan de baja sus servicios o se llevan su número a otro operador—. `[3.8.E2]`
- Se mide cuántos clientes resuelven en el autoservicio sin abrir un caso —recargan, pagan, cambian de plan o diagnostican una avería solos—, y ese número alcanza la meta que fijó el área. `[3.8.E4]`
- El cliente puede diagnosticar su avería desde la app —por ejemplo, ver si hay una falla en su zona, probar su línea o, en el hogar, reiniciar su módem a distancia— y, si no se resuelve, reportarla ahí mismo con el resultado del diagnóstico. `[3.8.E801 · comprobable]`

**Óptimo.**

- La IA detecta las preguntas nuevas que llegan —por ejemplo, sobre un plan, un equipo o un cobro nuevo— y redacta el artículo o la respuesta; el equipo lo revisa antes de publicarlo, y en la base de conocimiento se ve qué escribió la IA y quién lo aprobó. `[3.8.O1]`
- Los picos de demanda —una avería masiva, el lanzamiento de un equipo, el cierre de la facturación— los absorben la IA y el autoservicio: el equipo no crece cuando crece la cartera, y el líder ve en los tableros del área qué parte de la demanda resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`

*Se leen igual:* `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E5`, `3.8.O3`, `3.8.O4`.
