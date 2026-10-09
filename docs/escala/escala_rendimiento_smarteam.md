---
documento: Escala de Rendimiento Smarteam — Escalas departamentales
version: 8.8.0
fecha: 2026-10-09
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
- **Personalización** — a quién le da prioridad y cómo trata distinto a cada uno: en Ventas y en Servicio se mide como priorización, y en Marketing, como segmentación.
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

No todas las empresas venden igual, y la escala no cambia de estructura por eso: cambia qué criterios aplican. Cada unidad que se diagnostica tiene un perfil de negocio, que responde dos preguntas.

**Cómo se cierra la venta.** Con equipo, cuando una persona trabaja cada negocio; transaccional, cuando la venta se cierra sin que nadie la trabaje —en caja, en el sitio web o por autoservicio—; o mixta, cuando conviven las dos.

**Qué pasa después de la venta.** Relación única, cuando el cliente compra una vez; recompra, cuando vuelve a comprar sin contrato; o relación continua, cuando hay suscripción, contrato o servicio.

Los criterios que dependen del perfil llevan una marca: venta con equipo; venta sin vendedor, que vale para la venta transaccional y la mixta; cliente recurrente, que vale para recompra y relación continua; recompra; o relación continua. Si la marca no corresponde al perfil de la unidad, el criterio no aplica y sale de la cuenta. En la venta mixta aplican todos los que dependen de cómo se cierra la venta: los de venta con equipo se evalúan sobre el canal que vende con personas, y los de venta sin vendedor, sobre el que vende solo.

En la venta transaccional también hay pipeline y negocios: se crean solos, desde la tienda o el sitio web, y dan la reportería. Por eso los demás criterios de Ventas se leen sobre esa venta automática: el negocio es el pedido o el carrito, el vendedor es el canal, y la razón de pérdida es el punto donde se abandona la compra. Lo que un criterio dice de lo que hace un vendedor, y no tiene equivalente, no aplica. Si una dimensión se queda sin criterios que apliquen en Funcional —como Priorización de Leads en una venta transaccional—, la dimensión no aplica a ese perfil: se reporta así y no entra en el nivel ni en el puntaje de su capa.

**La próxima compra.** Donde el cliente vuelve a comprar sin contrato, la próxima compra se trata como un negocio más, se venda con equipo o sin vendedor: si no llega cuando se esperaba, es un negocio que se enfrió, y reactivarlo es trabajo de Ventas. La renovación de un contrato, en cambio, es de Servicio.

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
- Que el equipo **trabaje en el sistema central** y no por fuera —el CRM en Ventas, el sistema de marketing, el de atención en Servicio— es una rutina, y se asigna a **Procesos** de cada área (**1.1, 2.1 o 3.1**), igual que vigilar que el proceso se cumpla; que las **conversaciones con los prospectos** queden en el sistema se asigna a **Tecnología (1.2)**.
- **Mejorar el proceso con lo aprendido** se asigna a la dimensión de aprendizaje de cada área —**Aprendizaje de Ganadas y Perdidas (1.8)**, **Medición y Aprendizaje (2.8)** o **Escalabilidad del Servicio (3.8)**—: Procesos mide que el proceso exista y se siga, no cómo cambia. Lo único que Procesos de Ventas conserva, en Óptimo, es la disciplina de probar una técnica nueva en un piloto antes de sumarla al proceso. Las **pruebas** de Marketing —de creatividades y de audiencias— también son aprendizaje, y van en **2.8**; probar un canal nuevo es alcance, y sigue en **Canales y Alcance (2.7)**.
- La **IA como asistente del equipo** —redactar, resumir, preparar— se asigna a **Tecnología** de cada área (**1.2, 2.2 o 3.2**) y es Eficiente. En Funcional no es requisito: solo se pide que, si el equipo usa IA, esta trabaje con un contexto básico. Los **tableros en tiempo real** también son de **Tecnología**, en Eficiente: ver lo que pasa mientras pasa es una capacidad del sistema, no un nivel de autonomía.
- El **pronóstico** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1) ni a 1.5.
- En la **frontera Marketing ↔ Ventas**, cada pieza se asigna por quién la ejecuta: la definición de a quién sirve el equipo comercial (el cliente ideal) en **1.5 (Ventas)**; la segmentación y personalización del mensaje de marketing en **2.6 (Marketing)**; marcar MQL (lo clasifica Marketing) en **2.6 (Marketing)**; aceptar SQL (criterio del lado de Ventas) en **1.6 (Ventas)**; poblar el campo de etapa del ciclo de vida, como higiene de dato, en **Datos** del área que lo captura (1.3 o 2.3); el pipeline de ventas, con sus etapas y sus criterios de avance, en **Procesos (1.1)**. La definición de lead calificado es una sola y vive en 1.6; los criterios de avance de cada etapa del pipeline son otra cosa, y siguen en 1.1.
- En **Servicio**, la definición de los tipos de cliente que atiende el área —qué necesita cada uno y qué espera— se asigna a **Consistencia de Atención (3.5)**, como el cliente ideal a 1.5 y los buyer personas a 2.5; la diferenciación de la atención según esos tipos, a **Priorización de Clientes (3.6)**.
- También en **Servicio**, el **pipeline de servicio**, con sus etapas, se asigna a **Procesos (3.1)**, igual que **quién responde por cada cliente**. La **ficha del cliente** —lo que compró o tiene contratado y su valor— se asigna a **Datos (3.3)**, y que el agente la use al atender, a **Priorización de Clientes (3.6)**. La **prioridad de cada caso** es de **Priorización de Clientes (3.6)**; Datos pide su tipo y su motivo. La **escalación automática** es de **Tecnología (3.2)**. **Alimentar la base de conocimiento** y **buscar patrones** en el historial son de **Escalabilidad del Servicio (3.8)**, y **adelantarse al cliente**, de **Proactividad (3.7)**.
- Los **plazos de atención** se reparten así: definirlos es de **Procesos (3.1)**; avisar y escalar cuando están por vencer, de **Tecnología (3.2)** —si el caso lo resuelve otra área, de **Proactividad (3.7)**—; medir cuánto se tarda y cuánto se cumplen, de **Datos (3.3)**; y rendir cuentas por ellos, de **Equipo y Gobierno (3.4)**. Lo que Procesos vigila en Eficiente y en Óptimo es que cada caso siga las etapas y los pasos del proceso: un plazo que vence no cuenta ahí.
- El **puntaje de leads por reglas** se asigna a la dimensión de segmentación o priorización de cada área (**1.6 en Ventas, 2.6 en Marketing**), y es nivel Eficiente. No se confunde con lo que pide Funcional —calificar los leads en Ventas, clasificarlos en Marketing—: ahí basta aplicar criterios escritos, sea a mano o con una automatización simple sobre una propiedad; el puntaje de Eficiente es un modelo con varios atributos.
- El **canal conversacional y la bandeja** se asignan a **Tecnología** del área correspondiente (1.2, 2.2 o 3.2), y solo cuentan si el equipo atiende por ese canal: se puede ser Funcional atendiendo por correo y teléfono. Si se usa, un canal con bandeja básica es Funcional; varios canales en una bandeja unificada es Eficiente. Usar ese mismo canal para **salir** con cadencia —WhatsApp como canal de campaña— se asigna a Canales (2.7), no a Tecnología: una cosa es tenerlo conectado y otra es usarlo para llegar.
- El **análisis automático de conversaciones** se asigna a **1.8 (Ventas)**, no a Tecnología: es aprendizaje, no infraestructura. Lo que sale de ese análisis para mejorar el playbook es de 1.8; señalar a quien se sale del proceso es adherencia, y sigue en Procesos (1.1).
- La **siguiente mejor acción** que propone la IA se asigna a **Priorización de Leads (1.6)**; Tecnología (1.2) cuenta los agentes, la predicción de cierre y las respuestas sugeridas, no esa recomendación.
- Lo que la **IA decide enviar a cada persona** —qué, por qué canal y cuándo— se asigna a **Tecnología de Marketing (2.2)** en las campañas, a **Tracción del Negocio (1.7)** en los seguimientos de Ventas y a **Proactividad (3.7)** en los avisos a los clientes. Lo que la IA puede decidir sola se escribe en **Equipo y Gobierno** de cada área, y medirlo contra un grupo de control va en su dimensión de aprendizaje (**1.8, 2.8 o 3.8**).
- La **predicción por persona** va donde se usa: en **Segmentación (2.6)** cuando es de marketing, en **Tecnología de Ventas (1.2)** cuando es la probabilidad de cerrar un negocio y en **Datos de Servicio (3.3)** cuando es el riesgo de que un cliente se vaya.
- La **integración con ERP** u otros sistemas se asigna a **Tecnología** del área que la implementa; **Datos** solo declara el resultado (registros completos y trazables). Lo mismo vale para dónde vive la información: si no hay un sistema donde llevarla, o el que la tiene no se conecta con los demás, es de Tecnología; si el sistema existe y el equipo la lleva en hojas aparte, es de **Procesos**. Lo que eso provoca —que no haya un registro completo de los clientes, o que haya que armarlo a mano— sí lo describen las señales de Deficiente e Inicial de **Datos**; lo que lo arregla se cuenta en Tecnología o en Procesos.
- La **calidad de los datos** —campos vacíos, duplicados y cómo se corrigen— se asigna a **Datos** de cada área (**1.3, 2.3 o 3.3**), no a Equipo y Gobierno: lo único que Equipo y Gobierno de Marketing pide de ella, en Óptimo, es que haya responsables de cuidarla (**2.4**).
- La **orquestación entre áreas** (SLA, traspasos, rutinas conjuntas) se asigna a **Equipo y Gobierno** del área cuyo liderazgo sostiene la coordinación, y nunca es Funcional: su piso es Eficiente. El flujo automático que la habilita se asigna a Tecnología. Las dimensiones 1.7, 2.7 y 3.7 miden el alcance hacia el destinatario final, no la coordinación entre departamentos.
- La **respuesta a un negocio que se enfría** —reconocerlo a tiempo, reactivarlo, y que el líder se entere e intervenga— se asigna a **Tracción del Negocio (1.7)**, y Equipo y Gobierno no la vuelve a contar. La cadencia general de contacto sigue en Procesos (1.1), y la notificación que el sistema le manda al vendedor, en Tecnología (1.2).
- El **lead que todavía no está listo para comprar** —que vuelva a nutrición y regrese cuando muestra interés— se asigna a **Tracción del Negocio (1.7)**; el acuerdo con Marketing que lo hace posible es orquestación, y sigue en Equipo y Gobierno (1.4).
- La **próxima compra de un cliente que vuelve sin contrato** —recordarle la recompra, reactivar a quien dejó de comprar— se asigna a **Tracción del Negocio (1.7)**; retener a quien está por cancelar un contrato y atender sus quejas sigue en **Proactividad (3.7)**, y las campañas hacia el mercado, en **Canales y Alcance (2.7)**.
- La **venta ganada que se cae antes de la entrega** —un pedido que se cancela o se devuelve, una reserva que se desiste, una matrícula que no llega a clases— no se mide en la escala general: es de las ediciones que la traen como criterio propio, y ahí se asigna a **Aprendizaje de Ganadas y Perdidas (1.8)**, igual que una pérdida. La salida de un cliente que ya recibía el servicio sigue en **Proactividad (3.7)**.
- La **coherencia de la oferta entre canales** —precios, promociones y condiciones— se asigna a **Propuesta y Coherencia (1.5)**; la coordinación de una campaña entre canales sigue en **Canales y Alcance (2.7)**.
- Donde se vende sin vendedor, **lo que la tienda le muestra a cada comprador** —sugerencias, oferta, trato a sus mejores clientes— se asigna a la **personalización de Ventas (1.6)**; el mensaje de las campañas para cada segmento sigue en **Segmentación (2.6)**.
- La **disponibilidad de lo que se vende** —unidades, cupos o existencias, a la vista de quien vende— se asigna a **Tecnología de Ventas (1.2)**, y que cada venta quede asociada a un **cliente identificado**, a **Datos de Ventas (1.3)**.
- Las **reseñas y calificaciones públicas** —pedirlas y responderlas— se asignan a **Marca y Presencia (2.5)**, porque son parte de cómo el mercado ve a la empresa; la mala calificación de un cliente puntual se atiende en **Proactividad (3.7)**. El **programa de referidos** se asigna a **Canales y Alcance (2.7)**.
- La **protección contra la suplantación** —que el cliente sepa desde qué canales le escribe la empresa y qué nunca le va a pedir— se asigna a **Marca y Presencia (2.5)**, en las ediciones que la piden; **verificar la identidad del cliente** antes de atender una gestión es un paso del proceso, en **Procesos (3.1)**, y la herramienta que la verifica en línea es de **Tecnología** del área que la usa. **Propuesta y Coherencia (1.5)** mide la oferta, no la confianza en quien la hace.
- La **detección de riesgos y fechas críticas del cliente** —también los casos que resuelve otra área, como administración o cobros— se asigna a **Proactividad (3.7)**; el seguimiento de cada cliente por su responsable sigue en Procesos (3.1), y los acuerdos entre los líderes de esas áreas, en Equipo y Gobierno.
- Los **detalles para deleitar a los clientes actuales** —obsequios, beneficios, promociones de fidelización— se asignan a **Proactividad (3.7)**; las campañas hacia el mercado, a **Canales y Alcance (2.7)**.
- La **respuesta publicada para el cliente** a las preguntas frecuentes se asigna a **Escalabilidad del Servicio (3.8)**; las respuestas guardadas para los agentes siguen en Consistencia de Atención (3.5), y el portal con base de conocimiento en Tecnología (3.2), en Eficiente. Mantener vigentes las respuestas publicadas no decide el nivel: es el riesgo de contexto, en **Datos (3.3)**.
- Los **avisos automáticos al cliente** se asignan por lo que hacen: confirmarle que algo llegó o avisarle que cambió el estado de lo suyo es automatización simple, en **Tecnología** del área que lleva ese proceso (**1.2 o 3.2**); adelantarse a un momento clave de su relación —contarle antes lo que necesita saber de una entrega, un trámite o un vencimiento— es de **Proactividad (3.7)**.
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
- Hay un proceso de venta escrito y una cadencia de contacto definida —cuántos intentos y en cuántos días—, y la cadencia se cumple con la mayoría de los leads nuevos. `[1.1.F4 · comprobable · hábito]`
- La revisión del pipeline se hace en una fecha fija, cada semana o cada quince días. `[1.1.F5 · declarado · hábito]`
- Cualquier vendedor trabaja en el CRM, no en hojas ni notas aparte: lo abre para ver qué le toca hacer, no solo para cargar lo que ya hizo. `[1.1.F6 · evaluado · hábito · venta con equipo]`

**Eficiente.** El líder comprueba con datos que el proceso se cumple y, donde se vende con equipo, el equipo sigue una metodología y guías escritas.

*Resultado:* El líder sabe dónde se desvía el proceso y lo corrige con datos, no de memoria; donde se vende con equipo, además, todos venden con un mismo método.

- Hay metodología comercial formal en uso (SPIN, MEDDIC, BANT o equivalente). `[1.1.E1 · evaluado · hábito · venta con equipo]`
- Existen playbooks de descubrimiento de necesidades, calificación y manejo de objeciones que el equipo usa. `[1.1.E2 · evaluado · hábito · venta con equipo]`
- El líder comprueba con datos del sistema, no de memoria, que el proceso se cumple como está escrito. `[1.1.E3 · evaluado · hábito]`

**Óptimo.** La IA vigila que el proceso se cumpla y avisa cuando alguien se sale; el líder decide qué se corrige.

*Resultado:* Nadie tiene que vigilar a mano que el proceso se cumpla: la IA señala los negocios que se desvían, el líder decide qué se corrige y el equipo dedica su tiempo a probar mejoras en pilotos cortos.

- La IA detecta los negocios que se salen del proceso, los marca en el CRM y se los señala al líder y a quien corresponde; el líder decide qué se corrige. `[1.1.O1 · comprobable]`
- La mayoría de los negocios siguen el proceso como está escrito sin que nadie lo revise a mano, y el CRM lo muestra. `[1.1.O2 · comprobable · hábito · venta con equipo]`
- Las técnicas nuevas se prueban en pilotos de ciclo corto antes de sumarlas al proceso. `[1.1.O3 · declarado · hábito]`

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

**Eficiente.** Las secuencias se adaptan a cómo responde cada prospecto, los leads se asignan por varias condiciones, el CRM se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario.

*Resultado:* El vendedor recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen los negocios.

- Las cotizaciones se generan desde el sistema, no como documentos sueltos. `[1.2.E1 · comprobable · venta con equipo]`
- Hay secuencias de contacto de varios pasos que cambian según cómo responde el prospecto —si leyó, hizo clic o contestó—, y los leads se asignan por varias condiciones o por capacidad; si el equipo atiende por un canal conversacional, las conversaciones también, con control de quién ve y responde cada una. `[1.2.E2 · comprobable]`
- Si la empresa usa un ERP u otro sistema donde vive su operación —facturación, pedidos, inventario—, el CRM está conectado con él. `[1.2.E3 · comprobable]`
- Hay tableros en tiempo real de la conversión por etapa y por vendedor —o por canal, donde se compra sin vendedor— y, si el equipo atiende por un canal conversacional, de las conversaciones: cuánto tarda la primera respuesta y cuántas quedan sin seguimiento. `[1.2.E4 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar, resumir conversaciones o preparar una reunión—, y la IA trabaja con el contexto de los clientes y prospectos. `[1.2.E5 · evaluado · hábito · requiere 1.3.F5, 1.3.F6, 1.3.F7]`

**Óptimo.** La IA califica, agenda y calcula qué negocios van a cerrar; el vendedor valida y se queda con las conversaciones que deciden la venta.

*Resultado:* El vendedor dedica su tiempo a las conversaciones que deciden la venta: la IA califica y agenda, y él trabaja con la probabilidad de cierre de cada negocio y con las respuestas que la IA le propone.

- La IA calcula la probabilidad de cierre de cada negocio y propone respuestas según el contexto de cada conversación; las dos cosas se ven en el CRM y el vendedor decide qué usar. `[1.2.O1 · comprobable]`
- Si el equipo atiende por un canal conversacional, agentes de IA califican ahí los leads con la definición de lead calificado y agendan reuniones a cualquier hora; le pasan al vendedor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que calificaron. `[1.2.O2 · comprobable · requiere 1.6.F2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al CRM: el vendedor ve en la ficha, por ejemplo, el potencial de la cuenta, sin salir de su herramienta. `[1.2.O3 · comprobable · requiere 1.3.O4]`

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
- La documentación sobre el cliente ideal no se deja envejecer. `[1.3.F5 · declarado · riesgo · hábito · requiere 1.5.F1]`
- La definición de lead calificado no se deja envejecer. `[1.3.F6 · declarado · riesgo · hábito · venta con equipo · requiere 1.6.F2]`
- La documentación de lo que se ofrece —por ejemplo, qué resuelve cada solución— no se deja envejecer. `[1.3.F7 · declarado · riesgo · hábito]`
- Se sabe qué parte de las ventas sin vendedor queda asociada a un cliente identificado, y ese número se revisa al menos una vez al mes. `[1.3.F8 · comprobable · hábito · venta sin vendedor]`

**Eficiente.** Aparece un pronóstico confiable y la ficha del cliente empieza a reunir lo que viene de otros sistemas.

*Resultado:* La empresa puede comprometer un número de ventas con confianza, porque el pronóstico se acerca a lo que de verdad pasa.

- Hay un pronóstico de ventas que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% del pronóstico. `[1.3.E1 · comprobable · hábito]`
- Los duplicados se detectan y se unen solos, por reglas o con la función de unir del propio sistema. `[1.3.E2 · comprobable]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si la empresa usa otros sistemas —facturación, pedidos—, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3 · comprobable · requiere 1.2.E3]`
- La mayoría de las ventas sin vendedor quedan asociadas a un cliente identificado, no a un cliente genérico. `[1.3.E4 · comprobable · venta sin vendedor]`

**Óptimo.** Un modelo de IA calcula el pronóstico y la vista 360° de cada cliente se mantiene al día sin trabajo manual.

*Resultado:* El pronóstico se anticipa a lo que va a pasar, cruzando lo comercial con la facturación y el servicio, y los datos están al día sin que nadie tenga que acordarse de actualizarlos.

- Cada lead, contacto y negocio se asocia solo, al entrar, con lo que ya había de esa persona o empresa; la IA resuelve los dudosos y una persona valida solo las excepciones que el CRM le marca. `[1.3.O1 · comprobable]`
- Un modelo de IA calcula el pronóstico con la historia de los negocios; se ve en el sistema y el líder lo revisa antes de comprometerlo. `[1.3.O2 · comprobable]`
- La vista 360° está operativa: la ficha de cada cliente reúne lo comercial, la facturación, los casos de servicio y las conversaciones. `[1.3.O3 · comprobable]`
- Ventas se apoya en el almacén central de datos de la empresa para su pronóstico, cruzando lo comercial con la facturación y el servicio. `[1.3.O4 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: se capturan y se corrigen solos, y las personas solo validan las excepciones que el CRM les marca. `[1.3.O5 · comprobable]`

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

- Cada persona del equipo tiene rol definido por escrito. `[1.4.F1 · declarado]`
- El líder tiene un tablero con 4 a 6 métricas clave —valor del pipeline, negocios creados, tasa de cierre, volumen— y lo consulta al menos una vez por semana. `[1.4.F2 · evaluado · hábito · requiere 1.3.F4]`
- En la revisión del pipeline se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3 · evaluado · hábito · requiere 1.1.F5]`
- Cada vendedor —o cada canal, donde se compra sin vendedor— tiene una meta escrita, con un monto o una cantidad y un plazo, y su avance se reporta en una fecha fija, al menos una vez al mes. `[1.4.F4 · declarado · hábito]`
- El líder ve en reportes automáticos qué tareas cumplió cada vendedor y cuáles tiene pendientes. `[1.4.F5 · comprobable · venta con equipo · requiere 1.1.F6]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y, si recibe leads de Marketing, acuerda con esa área las reglas del traspaso.

*Resultado:* Un vendedor nuevo produce más rápido, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa leads, el traspaso tiene reglas que se cumplen.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[1.4.E2 · declarado]`
- Si Marketing le pasa leads a Ventas, el SLA de traspaso está escrito y se sigue en el sistema: en cuánto tiempo se responde, qué calidad se espera del lead y por qué se puede rechazar. `[1.4.E3 · comprobable · venta con equipo · requiere 1.6.F2]`
- Lo que el equipo señala que no funciona —del proceso, del CRM o del material de venta— se anota, se revisa y se le responde a quien lo dijo. `[1.4.E4 · evaluado · hábito]`

**Óptimo.** La dirección decide con números de fondo, el líder y el equipo eligen cada trimestre qué probar en la venta, y está por escrito quién valida lo que hace la IA y qué puede decidir sola.

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal deja más margen, qué vendedor aporta más y cuánto vale cada cliente en el tiempo.

- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo, cuánto margen deja cada canal y cuánto aporta cada vendedor. `[1.4.O1 · evaluado · hábito]`
- Al menos una vez por trimestre, el líder y el equipo se reúnen a decidir qué probar en la venta y revisan cómo les fue con lo que probaron antes. `[1.4.O2 · declarado · hábito]`
- Hay responsables de validar lo que hace la IA en ventas, y lo que puede decidir sola está por escrito. `[1.4.O3 · declarado]`

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

**Funcional.** El cliente ideal está escrito, y el mensaje y la propuesta son los mismos con cualquier vendedor.

*Resultado:* Dos prospectos parecidos reciben el mismo mensaje y una propuesta igual de sólida, sin importar qué vendedor les toque ni por qué canal lleguen.

- Hay un documento con la definición del cliente ideal —a quién le sirve lo que vende el equipo— que cualquier vendedor puede consultar. `[1.5.F1 · declarado]`
- El líder puede explicar quién es el cliente ideal sin consultar su documentación. `[1.5.F2 · evaluado]`
- Un cliente que habla con dos vendedores recibe el mismo mensaje de valor base. `[1.5.F3 · evaluado · hábito · venta con equipo]`
- Las propuestas están estandarizadas: tienen una estructura común reconocible, no armada desde cero cada vez. `[1.5.F4 · declarado · venta con equipo]`
- Si se vende por más de un canal, los precios, las promociones y las condiciones son los mismos en todos, o la diferencia es a propósito y está escrita. `[1.5.F5 · comprobable · venta sin vendedor]`

**Eficiente.** La propuesta de valor se distingue de la competencia y solo promete lo que se puede entregar.

*Resultado:* Los prospectos ven qué distingue a la empresa: la propuesta se diferencia de la competencia, dice lo mismo en el sitio, en las presentaciones y en boca del equipo, y promete lo que después se entrega.

- La propuesta de valor dice por escrito en qué se distingue de la competencia, y ese mensaje es el mismo en el sitio, en las presentaciones y en lo que dice el equipo. `[1.5.E2 · evaluado · hábito]`
- Las propuestas solo prometen lo que el equipo puede entregar: el alcance se valida antes de enviarlas. `[1.5.E3 · evaluado · hábito · venta con equipo]`

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

- El equipo segmenta los leads por los atributos del cliente ideal antes de trabajarlos: en empresas, tamaño, industria o geografía; en personas, presupuesto, zona o lo que buscan. `[1.6.F1 · comprobable · hábito · venta con equipo · requiere 1.5.F1]`
- Hay una definición escrita de lead calificado —los criterios para aceptar un lead como SQL— y se aplica de forma consistente. `[1.6.F2 · comprobable · hábito · venta con equipo]`
- El esfuerzo del equipo se enfoca en los leads que encajan con el cliente ideal. `[1.6.F3 · evaluado · hábito · venta con equipo · requiere 1.5.F1]`
- Los rasgos del cliente ideal son campos del CRM y de los formularios. `[1.6.F4 · comprobable · venta con equipo · requiere 1.5.F1]`

**Eficiente.** Los leads se ordenan con un puntaje que suma varios rasgos, las cuentas objetivo están en una lista escrita y cada segmento recibe su propio mensaje.

*Resultado:* Cada vendedor sabe cada mañana a quién contactar primero, y las cuentas que más importan se trabajan de forma deliberada.

- Hay un puntaje de leads por reglas activo: un modelo que suma puntos por varios atributos, no una regla sobre una propiedad. `[1.6.E1 · comprobable · venta con equipo]`
- Las cuentas objetivo o los segmentos prioritarios están en una lista escrita. `[1.6.E2 · comprobable · venta con equipo]`
- Los vendedores usan mensajes y plantillas distintos para cada segmento. `[1.6.E3 · comprobable · hábito · venta con equipo]`

**Óptimo.** La IA decide qué lead atender y qué hacer con él, con todo lo que se sabe de cada uno, y el vendedor valida.

*Resultado:* El vendedor sabe a quién atender, qué hacer y cuándo, con lo que saben Servicio y Marketing de cada cliente, incluido dónde hay riesgo o espacio para vender más.

- Agentes de IA analizan todo lo que se sabe de cada lead y deciden la siguiente mejor acción, que el vendedor ve en el CRM y valida antes de ejecutarla. `[1.6.O1 · comprobable · venta con equipo]`
- La IA detecta en cada cuenta el riesgo de perderla y el potencial de venderle más, lo marca en el CRM y el vendedor decide qué hacer. `[1.6.O2 · comprobable · venta con equipo]`
- Si en la decisión de compra participan varias personas, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el vendedor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3 · comprobable · venta con equipo]`
- La priorización usa señales de Servicio y de Marketing —qué clientes expanden, refieren o se van— para decidir qué perfiles perseguir. `[1.6.O4 · evaluado · venta con equipo]`

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

- Para cada etapa está definido cuánto tiempo sin avance vuelve estancado un negocio; los estancados se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada vendedor. `[1.7.F1 · evaluado · hábito]`
- La reactivación usa al menos dos canales, por ejemplo correo y llamada. `[1.7.F2 · comprobable · hábito]`
- El líder repasa los negocios estancados en cada revisión del pipeline y acuerda qué hacer con cada uno, sin esperar al cierre del trimestre. `[1.7.F3 · evaluado · hábito · venta con equipo · requiere 1.1.F5]`
- Hay material de venta estandarizado —presentaciones, casos de éxito, demos— que ayuda a cerrar las ventas. `[1.7.F4 · declarado · venta con equipo]`
- Los clientes identificados que ya deberían haber vuelto a comprar, según el plazo de recompra que define el proceso, se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos. `[1.7.F5 · comprobable · hábito · recompra · requiere 1.2.F6]`

**Eficiente.** El seguimiento combina varios canales, el sistema le avisa al líder de lo que se traba y el lead que no está listo sigue en nutrición.

*Resultado:* Ningún negocio espera a la reunión para recibir ayuda: el líder se entera cuando se traba, el lead que todavía no está listo sigue recibiendo contenido hasta que lo esté, y el vendedor encuentra el material de venta en un solo lugar.

- El seguimiento de los negocios que se enfrían combina al menos tres canales —por ejemplo, correo, llamada y el canal conversacional— en una secuencia definida. `[1.7.E1 · comprobable · requiere 1.2.E2]`
- Los leads que todavía no están listos para comprar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven al vendedor cuando muestran interés. `[1.7.E2 · comprobable · venta con equipo · requiere 1.4.E3]`
- El material de venta está en una biblioteca central, no en la computadora de cada vendedor. `[1.7.E3 · declarado · venta con equipo]`
- Cuando un negocio lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la revisión del pipeline. `[1.7.E4 · comprobable · venta con equipo · requiere 1.7.F1]`

**Óptimo.** La IA detecta qué negocios de más valor se traban y decide el canal y el momento de cada seguimiento; el equipo valida.

*Resultado:* Los negocios de más valor reciben ayuda justo cuando la necesitan: la IA detecta cuándo se traban y propone a quién movilizar.

- La IA detecta qué negocios de más valor se están trabando antes de que venza su plazo y propone a quién movilizar o qué contenido enviar; el líder valida, y todo queda en el CRM. `[1.7.O1 · comprobable]`
- La IA decide el canal y el momento de cada seguimiento, persona por persona y según cómo responde, dentro de los límites que fijó el equipo; el equipo revisa los resultados, y lo que decide la IA queda registrado en el CRM. `[1.7.O2 · comprobable · requiere 1.7.E1]`

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

**Óptimo.** La IA analiza las llamadas con los prospectos y propone correcciones al playbook; el líder decide cuáles se aplican.

*Resultado:* Cada vendedor recibe recomendaciones sobre sus propias llamadas, el líder corrige el playbook con lo que encuentra la IA y la dirección ajusta la estrategia con esa evidencia.

- La IA analiza las llamadas con los prospectos —también las de video— y le deja a cada vendedor recomendaciones que quedan registradas; el líder las revisa con él. `[1.8.O1 · comprobable · venta con equipo]`
- La IA propone correcciones al playbook a partir de lo que encuentra en las llamadas, y el líder decide cuáles se aplican; en el sistema queda cada propuesta y lo que se decidió con ella. `[1.8.O2 · comprobable · venta con equipo · requiere 1.1.E2]`
- La dirección ajusta la estrategia comercial con lo que muestran los datos de qué funciona. `[1.8.O3 · evaluado · hábito]`
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

- Cada pieza pasa por una revisión de calidad y una aprobación antes de publicarse. `[2.1.E2 · declarado · hábito]`
- El líder revisa con datos del sistema, no de memoria, que el proceso de campaña se cumpla. `[2.1.E4 · evaluado · hábito · requiere 2.1.F2]`

**Óptimo.** El sistema vigila que el proceso se cumpla y la IA se encarga de lo repetitivo; el equipo decide los ajustes.

*Resultado:* El equipo dedica su tiempo a la estrategia: la IA se encarga de lo repetitivo, y el sistema señala lo que se sale del proceso sin que nadie lo vigile.

- La IA hace las tareas repetitivas del proceso de campaña —como preparar el brief, adaptar cada pieza a su canal o cargar la campaña en el calendario—, el responsable de la campaña valida lo que hizo, y en el sistema se ve qué tareas hizo la IA. `[2.1.O1 · comprobable]`
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
- Si el sitio tiene formularios, cuando alguien envía uno el sistema le responde automáticamente y le avisa a quien corresponde. `[2.2.F5 · comprobable]`
- Si el equipo usa IA, esta tiene como contexto la voz de marca y los buyer personas. `[2.2.F9 · comprobable · requiere 2.5.F2, 2.5.F3]`

**Eficiente.** Las herramientas están integradas, las automatizaciones siguen reglas de varios pasos y la IA ayuda al equipo en su trabajo diario.

*Resultado:* Los leads reciben su nutrición sin que nadie la mande a mano, hasta que están listos para comprar —o para hablar con un vendedor, donde los hay—; la conversación con cada contacto no depende de que alguien se acuerde de escribirle, y, si se atiende por WhatsApp o chat, el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nutrición de varios pasos, con tiempos de espera y caminos distintos según quién es o lo que hace cada persona. `[2.2.E1 · comprobable]`
- Si el canal conversacional, como WhatsApp, es parte del plan de canales, sus campañas están automatizadas, con segmentación y con caminos distintos según lo que hizo la persona: si leyó, hizo clic o respondió. `[2.2.E2 · comprobable · requiere 2.6.F1]`
- El traspaso de leads a Ventas es automático: cuando un lead cumple los criterios de MQL, le llega con su historial al vendedor que corresponde, sin que nadie lo pase a mano. `[2.2.E3 · comprobable · venta con equipo · requiere 2.6.F4]`
- Si la empresa atiende por más de un canal conversacional, todos llegan a una sola bandeja. `[2.2.E4 · comprobable]`
- Si la empresa usa landing pages en sus campañas, se crean en el CMS conectado al sistema central, no en herramientas sueltas. `[2.2.E5 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar piezas, resumir resultados o preparar una campaña—, y la IA trabaja con el contexto del área: los buyer personas, los segmentos y la voz de marca. `[2.2.E6 · evaluado · hábito · requiere 2.3.F6]`
- Si la empresa atiende por un canal conversacional, hay un tablero en tiempo real de las conversaciones que generan las campañas: cuánto tarda la primera respuesta y cuántas quedan sin respuesta. `[2.2.E7 · comprobable · requiere 2.2.F4]`

**Óptimo.** La IA decide el recorrido de cada contacto y, si se atiende por WhatsApp o chat, conversa con él; el equipo fija los límites y revisa los resultados.

*Resultado:* Cada contacto vive un recorrido pensado para él: la IA decide el siguiente mensaje con lo que la empresa sabe de él en todos sus sistemas y, si se atiende por WhatsApp o chat, conversa con él en el momento.

- La IA decide qué mensaje recibe cada persona, por qué canal y en qué momento, dentro de las metas y los límites que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué decidió la IA para cada persona. `[2.2.O1 · comprobable · requiere 2.6.E4]`
- Si la empresa atiende por un canal conversacional, agentes de IA responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para comprar —o para hablar con un vendedor, donde los hay—; lo que no pueden resolver pasa a una persona con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O2 · comprobable · requiere 2.2.F4]`
- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada contacto: la segmentación usa, por ejemplo, el valor real de cada cliente calculado afuera. `[2.2.O3 · comprobable · requiere 2.3.O1]`

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
- Las propiedades que describen al cliente ideal —en empresas, la industria, el nombre de la empresa y el rol de la persona; en personas, lo que define a cada segmento— se piden en los formularios por donde entran los leads —o, si no hay formularios, donde se capturan sus datos— y están completas en la mayoría de los registros. `[2.3.F2 · comprobable · requiere 2.2.F3]`
- Los duplicados están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3 · comprobable · riesgo · hábito]`
- Los reportes básicos —cuántos leads entran, de dónde vienen y cuántos se convierten— salen del sistema sin armarlos a mano. `[2.3.F5 · comprobable]`
- El contexto que el área documentó —buyer personas, segmentos, voz de marca— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6 · declarado · riesgo · hábito · requiere 2.5.F2, 2.5.F3, 2.6.F1]`
- Cuando se pide un teléfono u otro dato de contacto, se pregunta si la persona acepta que le escriban por ese canal, y su respuesta queda registrada. `[2.3.F7 · comprobable · riesgo]`

**Eficiente.** Los datos se completan solos, los duplicados se unen solos y se sabe qué aportó cada canal a cada venta.

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta, no solo cuál trajo el primer clic.

- Los datos de cada contacto se completan solos con servicios de terceros, más allá de lo que la persona escribió. `[2.3.E1 · comprobable]`
- La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último, e incluye todos los canales, también el conversacional si se usa: se sabe cuánto ingreso deja cada uno. `[2.3.E2 · comprobable · requiere 2.2.F4]`
- Los duplicados se detectan y se unen solos, con reglas que definió el equipo o con la unión automática que trae el sistema. `[2.3.E3 · comprobable]`
- Lo que alguien hizo antes de dejar sus datos queda en su ficha cuando se identifica. `[2.3.E4 · comprobable]`

**Óptimo.** Los datos se capturan y se corrigen solos, cada persona tiene una sola ficha con todo lo que hace, y el equipo solo valida las excepciones.

*Resultado:* La atribución toma en cuenta todo lo que pasa en la empresa, no solo lo que ve Marketing, y los datos se mantienen confiables sin corregirlos a mano: el equipo solo valida las excepciones.

- Marketing se apoya en el almacén central de datos de la empresa, donde se junta la información de todas las herramientas, y sus reportes de atribución salen de esa vista completa. `[2.3.O1 · comprobable]`
- La IA completa sola los datos que faltan en cada contacto; el equipo revisa los que la IA marca como dudosos, y en la ficha se ve qué dato completó la IA y de dónde lo sacó. `[2.3.O3 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: se capturan y se corrigen solos, las personas solo validan las excepciones, y en el sistema queda qué se corrigió. `[2.3.O4 · comprobable]`
- Cada persona tiene una sola ficha que junta al momento lo que hace en todos los canales. `[2.3.O5 · comprobable · requiere 2.3.E3, 2.3.E4]`

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

- Cada persona del equipo tiene rol definido por escrito. `[2.4.F1 · declarado]`
- El líder tiene un tablero con 4 a 6 métricas clave —cuántos leads entran, de dónde vienen, cuántos se convierten y, donde hay vendedores, cuántos llegan a MQL— y lo consulta al menos una vez por semana. `[2.4.F2 · evaluado · hábito · requiere 2.3.F5]`
- El equipo tiene metas mensuales o trimestrales, y en la reunión de resultados rinde cuentas por ellas. `[2.4.F3 · evaluado · hábito · requiere 2.1.F3]`
- Las decisiones sobre qué hacer y en qué enfocarse citan datos del sistema, no opiniones. `[2.4.F4 · evaluado · hábito]`
- Cualquier persona del equipo sabe hacer sin ayuda externa las tareas de todos los días en el sistema, como armar una lista, enviar un correo o sacar un reporte, también cuando una agencia ejecuta todo o parte del trabajo. `[2.4.F5 · evaluado]`
- Si quien lidera marketing no es la dirección general, le envía a la dirección, cada mes, un reporte de cómo le fue a Marketing. `[2.4.F6 · declarado · hábito]`

**Eficiente.** El liderazgo prepara a quien entra, escucha al equipo y, donde hay vendedores, acuerda reglas con Ventas y con Servicio.

*Resultado:* Una persona nueva se integra rápido y, donde hay vendedores, Marketing trabaja con reglas acordadas con Ventas y con Servicio en vez de discutir cada vez quién se hace cargo de un lead o de un cliente.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[2.4.E2 · declarado]`
- El liderazgo coordina con Ventas —el traspaso de leads, los SLA y una reunión conjunta con fecha fija— y con Servicio. `[2.4.E3 · declarado · hábito · venta con equipo · requiere 1.4.E3, 2.6.F4]`
- El equipo da retroalimentación sobre el sistema y pide que evolucione. `[2.4.E4 · evaluado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar los datos, y lo que la IA puede decidir sola está por escrito.

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide según lo que dejan con el tiempo los clientes que trae cada canal, frente a lo que cuesta traerlos.

- Hay responsables de validar lo que produce la IA y de cuidar la calidad de los datos, y lo que la IA puede decidir sola está por escrito. `[2.4.O1 · declarado]`
- El líder dedica su tiempo a la estrategia y a mejorar el sistema, no a ejecutar campañas. `[2.4.O2 · evaluado · hábito]`
- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —el valor de vida de los clientes que trae— frente a lo que cuesta. `[2.4.O4 · evaluado · hábito]`

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
- Existe una guía corta de voz de marca, escrita, y las piezas del último trimestre la aplican. `[2.5.F2 · declarado]`
- Hay 2 o 3 buyer personas escritos, cada uno con su recorrido de compra básico, etapa por etapa. `[2.5.F3 · declarado]`
- El sitio cumple lo básico para buscadores: cada página tiene título y descripción, se puede indexar, carga bien en el celular y no tiene enlaces rotos. `[2.5.F4 · comprobable]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: en el blog o en el formato que use el negocio, como video, fichas o guías. `[2.5.F5 · comprobable · hábito]`

**Eficiente.** La presencia se afina por segmento y se prepara para buscadores y para asistentes de IA.

*Resultado:* La empresa aparece cuando sus clientes buscan lo que ofrece, tanto en buscadores como en asistentes de IA, con contenido pensado para cada segmento que importa, y cada reseña de sus clientes, buena o mala, recibe respuesta.

- Los segmentos que más valen tienen su propio buyer persona, escrito con detalle. `[2.5.E1 · declarado]`
- Si el contenido propio se publica en el sitio, está organizado por temas: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2 · comprobable]`
- El contenido está preparado para aparecer como respuesta en los asistentes de IA y en los buscadores que contestan preguntas, y se mide cuántas veces aparece. `[2.5.E3 · comprobable]`
- El recorrido de compra está dibujado de punta a punta, con los puntos de contacto de cada etapa. `[2.5.E4 · declarado]`
- Se les pide una reseña pública a los clientes después de la compra o la entrega, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo. `[2.5.E5 · comprobable · hábito]`

**Óptimo.** La IA produce y ajusta el contenido de forma continua, también para los asistentes de IA, y el equipo valida cada pieza antes de publicarla.

*Resultado:* La presencia se mantiene vigente sin que el equipo escriba cada pieza: la IA produce y ajusta el contenido para cada tipo de cliente y cada forma de buscar, y el equipo lo aprueba.

- Hay buyer personas para grupos muy chicos de clientes —o, cuando se vende a empresas, para cada cuenta importante—, no solo para los segmentos grandes. `[2.5.O1 · declarado]`
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

- Existen al menos 2 segmentos con criterios escritos según qué necesita o cómo decide cada grupo, no solo según dónde está. `[2.6.F1 · declarado]`
- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento. `[2.6.F3 · comprobable · hábito]`
- Existen criterios escritos de qué es un suscriptor, un lead y un MQL, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios. `[2.6.F4 · comprobable · hábito · venta con equipo]`

**Eficiente.** Los segmentos y el puntaje de leads se arman solos, y el mensaje se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los leads con más probabilidad de comprar se distinguen del resto: donde hay vendedores, Ventas los recibe primero.

- Hay secuencias distintas por segmento o por etapa del recorrido de compra. `[2.6.E1 · comprobable · requiere 2.2.E1]`
- El contenido se adapta por segmento de forma automática. `[2.6.E2 · comprobable]`
- Hay un puntaje de leads por reglas: un modelo que suma puntos por varios datos de cada persona, como su perfil o lo que hizo, y la clasifica al pasar un umbral —como MQL, donde hay vendedores—, y ese puntaje dispara las secuencias de nutrición. No es la clasificación de Funcional, que responde al valor de una propiedad, sin modelo de puntaje detrás. `[2.6.E3 · comprobable · requiere 2.2.E1]`
- La segmentación usa datos de comportamiento —qué abrió, qué visitó, qué compró—, no solo lo que la persona declaró. `[2.6.E4 · comprobable]`

**Óptimo.** La IA predice qué va a hacer cada persona y el contenido cambia según su comportamiento.

*Resultado:* Cada persona ve el contenido que le corresponde según lo que hizo antes, sin que nadie tenga que armar un segmento para ella.

- La IA predice quién va a comprar y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1 · comprobable]`
- Hay personalización uno a uno: la IA cambia en tiempo real lo que ve cada persona en los mensajes, el sitio web o la app según lo que hizo antes, dentro de las reglas que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué versión vio cada persona. `[2.6.O3 · comprobable · requiere 2.3.E4]`

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
- Si la pauta pagada es parte del plan de canales, hay al menos una campaña corriendo con presupuesto definido (Google, Meta o el canal que corresponda al negocio). `[2.7.F3 · comprobable]`
- Si el canal conversacional, como WhatsApp, es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario, no solo para responder lo que entra. `[2.7.F4 · comprobable · hábito · requiere 2.2.F4, 2.3.F7]`
- Los canales que la empresa eligió en su plan siguen el mismo calendario y la misma campaña: una promoción sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5 · declarado · hábito · requiere 2.1.F1]`
- En el sistema se ve cuánto costó cada lead —o cada venta, donde se compra sin vendedor— el último mes, al menos por canal. `[2.7.F6 · comprobable · requiere 2.3.F1]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, y el presupuesto se mueve según lo que cuesta cada lead o cada venta en cada canal.

*Resultado:* La inversión se mueve hacia el canal que mejor rinde, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Los canales —también el conversacional, si se usa— comparten datos y se alimentan entre sí: uno continúa lo que empezó otro, hay remarketing activo y las audiencias se construyen desde el CRM. `[2.7.E1 · comprobable]`
- Si los webinars o los eventos son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2 · declarado · hábito]`
- El presupuesto entre canales se revisa al menos una vez por mes y se mueve según lo que cuesta cada lead o cada venta en cada canal. `[2.7.E3 · comprobable · hábito · requiere 2.7.F6]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar, y cada referido queda registrado con quién lo trajo. `[2.7.E4 · comprobable]`
- Si hay app, sus notificaciones son parte de las campañas, con el permiso de cada persona. `[2.7.E5 · comprobable]`

**Óptimo.** La IA mueve el presupuesto entre canales dentro de los límites que fija el equipo, y se prueban canales nuevos de forma continua.

*Resultado:* La inversión se reparte sola donde más retorna, dentro de los límites que fija el equipo; los clientes satisfechos traen clientes nuevos, y la empresa prueba canales nuevos sin esperar a ver qué hace la competencia.

- Se prueban canales nuevos —creadores de contenido, comunidades, formatos nuevos— en ciclos de dos meses o menos. `[2.7.O1 · declarado · hábito]`
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

- Hay pruebas A/B regulares (al menos una activa por mes). `[2.8.E1 · comprobable · hábito]`
- Hay un proceso escrito para comparar, con los resultados de campañas anteriores, qué creatividades y audiencias funcionan. `[2.8.E2 · declarado]`
- El proceso de campaña y la planificación de las campañas siguientes se refinan con base en lo aprendido. `[2.8.E3 · declarado · hábito · requiere 2.1.F2, 2.8.F3]`

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

**Funcional.** El equipo atiende en un mismo sistema, con etapas de la recepción al cierre, y cada cliente tiene quién responda por él.

*Resultado:* Todo el equipo atiende en el mismo sistema, cada cliente tiene a alguien que responde por él, y un caso se atiende igual sin importar qué agente lo tome.

- El pipeline de servicio está configurado con sus etapas y cubre el flujo de atención, de la recepción al cierre. `[3.1.F1 · comprobable]`
- Cada cliente tiene registrado quién responde por él —una persona o, si la cartera es tan grande que no se asigna por persona, un equipo— y recibe un contacto de seguimiento a tiempo —en los momentos que fija el proceso de atención—, aunque no haya abierto casos; si responde un equipo, ese contacto puede ser un mensaje automático. `[3.1.F2 · comprobable · hábito]`
- Hay reuniones de equipo de Servicio con cadencia fija (al menos quincenal) que se sostienen. `[3.1.F3 · declarado · hábito]`
- Existe un proceso escrito para escalar las quejas graves y los casos que el agente no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4 · declarado]`
- Cualquier agente explica cómo se atiende un caso típico siguiendo el mismo flujo. `[3.1.F5 · evaluado]`
- Cualquier agente atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por otro canal. `[3.1.F6 · evaluado · hábito]`

**Eficiente.** Aparecen los SLA, los playbooks y el recorrido del cliente, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso, cada momento clave de la relación con el cliente tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de caso o prioridad. `[3.1.E1 · comprobable]`
- Hay playbooks de prevención y, donde la relación es continua, también de retención y expansión. `[3.1.E3 · declarado · cliente recurrente]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —el inicio, la entrega o el primer valor y, si la hay, la renovación o la recompra— y un responsable y un estándar para cada uno. `[3.1.E4 · declarado · requiere 3.5.F2]`
- El líder revisa con datos del sistema, no de memoria, que cada caso siga las etapas y los pasos del proceso de atención. `[3.1.E5 · evaluado · hábito]`

**Óptimo.** La IA ejecuta las rutinas repetitivas y el sistema vigila que cada caso siga el proceso; el equipo supervisa, corrige a la IA y resuelve las excepciones.

*Resultado:* El equipo deja de ejecutar rutinas y pasa a supervisarlas: la IA hace lo repetitivo, el sistema señala lo que se sale del proceso, y las personas se ocupan de las excepciones y de mejorar el sistema.

- La IA ejecuta las rutinas repetitivas del proceso de atención, como dar seguimiento a los casos y cerrarlos; el equipo supervisa, corrige a la IA y resuelve las excepciones, y en el sistema se ve qué hizo la IA y qué revisó una persona. `[3.1.O1 · evaluado · hábito]`
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
- Al entrar un caso, el sistema lo asigna automáticamente según una regla simple; las notificaciones de cambio de estado llegan a quien las necesita. `[3.2.F5 · comprobable]`
- Si hay chatbot, resuelve preguntas frecuentes con un árbol de decisión. `[3.2.F6 · comprobable]`
- Si el equipo usa IA, esta trabaja con lo que el sistema sabe de cada cliente —quién es, qué compró y sus casos—, no a ciegas. `[3.2.F8 · comprobable]`

**Eficiente.** Los plazos se vigilan solos, aparece el autoservicio y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el cliente puede ver y abrir sus casos y resolver lo simple sin esperar a un agente, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién— y, si el equipo tiene más de un agente, las conversaciones y los casos se enrutan por varias condiciones, como idioma, tema o habilidad del agente. `[3.2.E1 · comprobable · requiere 3.1.E1]`
- Hay un portal de autoservicio donde el cliente ve y abre sus casos, y una base de conocimiento interna y pública. `[3.2.E2 · comprobable]`
- Si el equipo atiende por más de un canal escrito —correo, WhatsApp, chat—, todos llegan a una sola bandeja. `[3.2.E3 · comprobable]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir casos o buscar en la base de conocimiento—, y la IA trabaja con el contexto del área: los tipos de cliente, la atención que recibe cada uno y las respuestas a las preguntas frecuentes. `[3.2.E4 · evaluado · hábito · requiere 3.3.F6]`
- Hay tableros en tiempo real de la atención: los casos abiertos, quién los tiene y cuántas conversaciones quedan sin atender. `[3.2.E5 · comprobable]`

**Óptimo.** Un agente de IA resuelve casos y le pasa a una persona lo que no puede, y lo que la empresa calcula de cada cliente —como su riesgo de fuga— aparece en su ficha.

*Resultado:* Buena parte de los casos se resuelve sin que intervenga una persona, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la empresa sabe de ese cliente a la vista.

- Un agente de IA resuelve casos en todos los canales donde atiende el equipo, sin que intervenga una persona, y le pasa a una persona, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1 · comprobable]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, el riesgo de fuga del cliente. `[3.2.O4 · comprobable · requiere 3.3.O2]`

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

**Funcional.** La historia y la ficha de cada cliente están a la vista, y cada caso tiene su tipo y su motivo.

*Resultado:* El líder sabe qué tipo de problemas llegan y cuántos, y cualquier agente tiene la historia del cliente en segundos.

- Cualquier agente ve el historial de casos de un cliente en menos de 10 segundos. `[3.3.F1 · comprobable]`
- La ficha del cliente muestra lo que compró o tiene contratado y su valor económico, no solo sus casos. `[3.3.F2 · comprobable]`
- Las propiedades clave del cliente —qué compró o qué plan tiene y desde cuándo es cliente— están pobladas en la mayoría de los registros. `[3.3.F3 · comprobable]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida. `[3.3.F4 · comprobable]`
- El líder saca del sistema, sin armarlo a mano, cuántos casos llegan de cada tipo. `[3.3.F5 · comprobable]`
- El contexto que el área documentó —tipos de cliente, la atención que recibe cada uno, respuestas a las preguntas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6 · declarado · riesgo · hábito · requiere 3.5.F4, 3.6.F2, 3.8.F1]`

**Eficiente.** Se miden tiempos y satisfacción, y los datos se unifican con Ventas.

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende y cuánto tarda un cliente nuevo en ver valor, con la satisfacción medida y no supuesta; donde el cliente vuelve, sabe además qué tan sano está cada uno.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los SLA, en todos los canales. `[3.3.E1 · comprobable · requiere 3.1.E1]`
- Se mide la satisfacción del cliente —con el NPS o el CSAT— con una cadencia definida, por ejemplo al cerrar cada caso o cada trimestre. `[3.3.E2 · comprobable · hábito]`
- Los datos del cliente están unificados entre Servicio y Ventas: los dos ven la misma información del cliente, en un mismo sistema o en sistemas conectados. `[3.3.E3 · comprobable]`
- Se mide cuánto tarda cada cliente nuevo en obtener valor: el tiempo desde que empieza hasta su primer resultado. `[3.3.E4 · comprobable · requiere 3.5.F2]`
- Hay un indicador de salud por reglas para cada cliente, que combina sus casos abiertos, su satisfacción y, si lo que compró se usa de forma continua, su uso. `[3.3.E5 · comprobable · cliente recurrente]`

**Óptimo.** Los datos se mantienen al día solos y, donde el cliente vuelve, un modelo de salud anticipa el riesgo antes de que el cliente lo diga.

*Resultado:* La empresa anticipa lo que va a pasar con sus clientes, con datos que se mantienen al día solos, y, donde el cliente vuelve, sabe quién está en riesgo y quién está logrando lo que buscaba antes de que ellos mismos lo digan.

- Un modelo predictivo de salud calcula para cada cliente su riesgo y si está logrando el resultado que persigue, a partir de su experiencia y de sus resultados; el puntaje se ve en su ficha y el responsable de cada cliente revisa a los que el modelo marca. `[3.3.O1 · comprobable · hábito · cliente recurrente]`
- Servicio se apoya en el almacén central de datos de la empresa, con reglas claras de quién accede y cómo se mantiene, para anticipar el riesgo de cada cliente. `[3.3.O2 · comprobable]`
- Modelos con IA predicen lo que viene —por ejemplo, cuántos casos van a entrar y de qué tipo— y proponen qué hacer; lo que predicen se ve en los tableros del área y el líder decide con eso. `[3.3.O3 · comprobable]`
- Los datos se mantienen al día sin depender de que alguien se acuerde de actualizarlos: se capturan y se corrigen solos, las personas solo validan las excepciones, y en el sistema queda qué se corrigió. `[3.3.O4 · comprobable]`

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

**Funcional.** Cada persona tiene su rol por escrito, el líder sigue un tablero cada semana y el equipo rinde cuentas en sus reuniones.

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día o se está atrasando.

- Cada persona del equipo tiene rol definido por escrito. `[3.4.F1 · declarado]`
- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, volumen, casos pendientes acumulados, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2 · evaluado · hábito · requiere 3.3.F5]`
- En las reuniones del equipo se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[3.4.F3 · evaluado · hábito · requiere 3.1.F3]`

**Eficiente.** El equipo rinde cuentas por los SLA, el líder prepara a quien entra y acuerda con Ventas qué recibe y qué devuelve Servicio.

*Resultado:* El equipo responde por sus tiempos de atención, un agente nuevo rinde rápido, cada cliente nuevo llega de Ventas con el resultado que persigue y, donde el cliente vuelve a comprar sin contrato, Ventas se entera cuando uno se puede estar yendo.

- En las reuniones del equipo se revisa el cumplimiento de los SLA de cada persona y se acuerda qué corregir. `[3.4.E1 · evaluado · hábito · requiere 3.1.F3, 3.3.E1]`
- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales; no se le entrena de memoria. `[3.4.E2 · declarado]`
- El líder de Servicio acuerda con Ventas qué trae cada cliente nuevo —el resultado que persigue— y el acuerdo se cumple: cada uno llega con ese resultado y, si el cliente vuelve a comprar sin contrato, Servicio le avisa a Ventas cuando se puede estar yendo. `[3.4.E4 · declarado · hábito]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento y, donde la relación es continua, el servicio se mide por los ingresos que retiene y hace crecer.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella; donde la relación es continua, Servicio se mide por los ingresos que retiene y hace crecer, no solo por los casos que cierra.

- Hay responsables de validar lo que responde la IA y de mantener al día la base de conocimiento, y lo que la IA puede resolver sola está por escrito. `[3.4.O1 · declarado]`
- El líder ya no reparte casos ni apaga incendios: dedica su tiempo a decidir qué se automatiza, qué se mide y qué se mejora. `[3.4.O2 · evaluado · hábito]`
- El equipo de servicio se mide por la retención y el crecimiento de sus clientes, no solo por los casos que cierra. `[3.4.O3 · declarado · hábito · relación continua]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.O4 · evaluado · hábito]`

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

**Eficiente.** Las respuestas guardadas se usan en el día a día y todas siguen el mismo tono de marca.

*Resultado:* El cliente reconoce la misma voz en cada respuesta, sea cual sea el agente.

- Los agentes usan en su día a día las respuestas guardadas para los casos frecuentes, no solo las tienen cargadas. `[3.5.E1 · comprobable · hábito]`
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
- Está escrito qué atención recibe cada tipo de cliente —por ejemplo, por qué canal y quién lo atiende—, y el equipo la aplica. `[3.6.F2 · evaluado · hábito · requiere 3.5.F4]`
- El agente usa la ficha del cliente —lo que compró o tiene contratado y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3 · evaluado · hábito · requiere 3.3.F2]`

**Eficiente.** La atención cambia según el momento de cada cliente y, donde el cliente vuelve, cada cliente clave tiene un responsable dedicado.

*Resultado:* La atención cambia según el momento en que está cada cliente y, donde el cliente vuelve, cada cliente clave tiene un dueño que lo conoce y el resto de la cartera no queda sola.

- Hay un modelo de atención por segmento: cada cliente clave tiene un responsable dedicado que lo conoce, y el resto de la cartera recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1 · comprobable · cliente recurrente · requiere 3.1.F2, 3.5.F4]`
- Los clientes se segmentan para acciones diferenciadas según el momento de su relación: donde el cliente vuelve, sanos, en riesgo o con potencial de crecer; donde compra una vez, por entregar, en garantía o listos para recomendar. `[3.6.E2 · comprobable · requiere 3.3.E5]`

**Óptimo.** Cada cliente se atiende con todo su contexto, lo atienda una persona o la IA, incluso en el autoservicio.

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló con Ventas.

- En el autoservicio, cada cliente ve lo que corresponde a su tipo, a lo que compró y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1 · comprobable · requiere 3.2.E2]`
- La IA ajusta cada respuesta a la persona mientras la atiende —según su historia, su caso y lo que acaba de hacer—, dentro de los límites que fijó el equipo; el equipo revisa una muestra de las respuestas, y en el sistema queda qué se le respondió. `[3.6.O2 · comprobable]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le prometió en la venta y el segmento del que viene—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3 · comprobable · requiere 3.3.E3]`

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

**Eficiente.** Los riesgos se ven venir, ningún caso se pierde aunque lo resuelva otra área, y el cliente recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los casos del cliente no se pierden entre áreas, el cliente sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la empresa retiene clientes que antes se perdían sin aviso, encuentra oportunidades en su propia cartera y sus clientes clave ven qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de riesgo de fuga o de oportunidad de crecer. `[3.7.E1 · comprobable · relación continua · requiere 3.3.E5]`
- Los clientes en riesgo reciben una acción de retención antes de decidir irse, y los que tienen potencial reciben una propuesta de expansión. `[3.7.E2 · comprobable · hábito · relación continua]`
- Los clientes clave revisan con la empresa, al menos cada trimestre, el resultado que persiguen: qué se logró y qué sigue. `[3.7.E3 · declarado · hábito · relación continua · requiere 3.4.E4, 3.5.F4]`
- Ningún caso del cliente se pierde entre áreas: si lo resuelve otra área —administración, cobros, entregas—, también queda en el sistema; y hay alertas automáticas, que le llegan a quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica —una entrega, una garantía, un vencimiento— o, si se piden calificaciones, cuando un cliente califica mal. `[3.7.E4 · comprobable]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —una entrega, un trámite, un vencimiento—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5 · comprobable · requiere 3.1.E4]`

**Óptimo.** Los problemas se resuelven antes de que el cliente los note, con acciones que la IA ajusta, y el cliente recibe detalles que lo deleitan.

*Resultado:* La mayoría de los problemas que detecta el sistema se resuelven antes de que el cliente los note, y cada cliente siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- Las revisiones de resultado llegan a todos los clientes: a los clave en persona y al resto con un informe que el sistema arma con sus datos y envía de forma automática; cada revisión queda registrada en la ficha del cliente. `[3.7.O1 · comprobable · hábito · relación continua · requiere 3.5.F4]`
- La mayoría de los problemas que detecta el sistema se resuelven antes de que el cliente los note: el equipo valida la solución y en el sistema se ve que el cliente no tuvo que abrir un caso. `[3.7.O2 · comprobable · hábito]`
- La IA decide qué acción proactiva recibe cada cliente —qué, cuándo y por qué canal— según su historia y sus señales, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada cliente. `[3.7.O3 · comprobable]`
- Los clientes reciben, sin pedirlos, detalles pensados para deleitarlos —obsequios, promociones, beneficios o experiencias—, elegidos según la historia de cada cliente y el momento de su relación, y en el sistema queda qué recibió cada uno. `[3.7.O4 · comprobable]`

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
- Al menos una vez por trimestre se revisan los casos que se repiten y, donde la relación es continua, las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2 · declarado · hábito · requiere 3.7.F3]`
- El autoservicio funciona: se mide cuántos clientes resuelven sin abrir un caso, y el equipo no crece al mismo ritmo que la cartera. `[3.8.E3 · comprobable · hábito]`

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
| x.6 | Personalización | Priorización de Leads | Segmentación | Priorización de Clientes |
| x.7 | Alcance | Tracción del Negocio | Canales y Alcance | Proactividad |
| x.8 | Aprendizaje | Aprendizaje de Ganadas y Perdidas | Medición y Aprendizaje | Escalabilidad del Servicio |

Todas las dimensiones, de base operativa y de producción, tienen los cinco niveles. No hay excepciones.

## Riesgos

Cuando un criterio de riesgo no se cumple, se le muestra al cliente con estos mensajes. Se escriben por su consecuencia de negocio: dicen qué le pasa al cliente si el riesgo sigue activo.

| Identificador | Criterio | Mensaje cuando no se cumple |
|:--|:--|:--|
| `1.3.F2`, `2.3.F3` | Los duplicados se revisan y se unen cada trimestre | Tus reportes pueden estar inflados y una misma persona puede recibir varias veces el mismo mensaje: hay contactos repetidos —la misma persona con varios correos— que nadie revisa hace más de un trimestre. |
| `1.3.F5`, `1.3.F6`, `1.3.F7`, `2.3.F6` | El contexto se revisa y actualiza cada trimestre | Tu equipo —y la IA, si la usas— puede estar trabajando con una idea vieja de a quién le vendes y qué le ofreces: lo que documentaste no se revisa hace más de un trimestre. |
| `3.3.F6` | El contexto y las respuestas publicadas se revisan y actualizan cada trimestre | Tus clientes pueden estar leyendo respuestas viejas, y tu equipo —y la IA, si la usas— atendiendo con información desactualizada: lo que documentaste no se revisa hace más de un trimestre. |
| `2.3.F7` | Las personas aceptaron que les escriban | Puedes estar escribiéndole a personas que no te dieron permiso: tus correos pueden terminar en spam y, si usas WhatsApp, tu número se puede bloquear. |

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

La matriz de la Parte 3 es la escala general, escrita para cualquier empresa. Una tienda, un banco, una universidad o una inmobiliaria se reconocen mejor en una escala que habla de lo suyo: por eso cada edición les pone a las dimensiones de producción el nombre que tienen en esa industria, hace las preguntas y dice los costos con sus palabras, y suma los criterios que solo tienen sentido ahí.

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

Una edición se escribe por áreas, y un área que la edición no escribe se mide con la escala general. Las cuatro ediciones de hoy —Ecommerce y retail, Banca y servicios financieros, Educación e Inmobiliaria— traen las tres áreas enteras.

## Cómo se escribe una edición

Igual que la matriz, y solo lo que cambia. Abre con para quién es, su clave —que no cambia aunque la edición cambie de nombre—, su perfil habitual y desde qué número van sus criterios propios. Siguen la tabla de palabras y, después, cada área y cada dimensión que cambia. Un criterio reescrito lleva en la etiqueta solo su identificador, y conserva lo que requiere en la matriz; uno propio lleva la etiqueta completa, con lo que requiere si no se puede cumplir sin otro. Al final de cada dimensión van los criterios de la matriz que no aplican y los que se leen igual.

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

**Inicial.** Tienes la tienda armada, pero cada canal va por su cuenta. Los pedidos entran a medias al sistema, los reportes se arman a mano y los recordatorios, si salen, son los mismos para todos.

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

- La IA detecta lo que se sale de lo normal en la operación —un producto sin existencias, un precio distinto entre canales, un paso del pago que falla—, lo marca en el sistema y se lo señala al líder y a quien tiene que actuar; el líder decide qué se corrige. `[1.1.O1]`

*No aplican:* `1.1.D2`, `1.1.I2`, `1.1.F4`.

*Se leen igual:* `1.1.F6`, `1.1.E1`, `1.1.E2`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien compra en la tienda en línea o en la caja?

*Descripción:* Mide si la tienda, la caja y el CRM trabajan como un solo sistema, y cuánto trabajo repetitivo se automatiza.

*Costo de quedarse:* Pasas datos a mano entre la tienda, la caja y el CRM, y el comprador espera la confirmación y el estado de su pedido, que podrían llegarle solos.

**Deficiente.** La tienda y la caja venden, pero sus datos no llegan a ningún sistema común.

- Los datos de los compradores viven en la plataforma de la tienda, en la caja, en un sistema aparte o en hojas sueltas, y no llegan a un sistema común. `[1.2.D1]`
- No hay un CRM donde montar una automatización: los pedidos y los datos de los compradores se pasan por correo, por chat o de palabra, y nadie recibe avisos del sistema. `[1.2.D2]`

**Inicial.** La tienda está conectada a medias: parte de los datos se pasa a mano.

- Los pedidos de algún canal se cargan a mano en el sistema, o no se cargan. `[1.2.I101 · comprobable]`

**Funcional.** Lo básico pasa solo: cada venta entra al sistema, el catálogo sale de un solo lugar a todos los canales y el comprador recibe la confirmación y el estado de su pedido.

*Resultado:* Cada venta llega sola al sistema sin que nadie la pase a mano, y el comprador recibe la confirmación de su pedido y los avisos de su estado sin que alguien tenga que escribirle.

- Cada venta de la tienda en línea y de la caja entra sola al sistema como un pedido, con su monto, su canal y su fecha, y con su cliente cuando el comprador se identifica. `[1.2.F6]`
- Si lo que se vende tiene existencias limitadas, el comprador ve en la tienda qué hay disponible antes de comprar, y el equipo lo ve en el sistema donde se lleva el inventario, sin preguntarle a otra persona. `[1.2.F8]`
- El comprador recibe sola la confirmación de su pedido y los avisos de cada cambio de estado. `[1.2.F101 · comprobable]`
- El catálogo —productos, precios y existencias— se administra en un solo lugar, y de ahí sale a todos los canales. `[1.2.F102 · comprobable]`

**Eficiente.** Las secuencias del carrito y de después de la compra se adaptan a lo que hace cada comprador, la tienda se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario.

*Resultado:* El equipo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué paso se cae la compra.

- Hay secuencias de varios pasos para el carrito y para después de la compra, que cambian según lo que hace el comprador —si abrió, hizo clic o compró—; si la tienda atiende por un canal conversacional, las conversaciones se asignan por varias condiciones o por capacidad, con control de quién ve y responde cada una. `[1.2.E2]`
- Si el inventario o la facturación se llevan en un sistema aparte —un ERP u otro—, la tienda está conectada con él. `[1.2.E3]`

**Óptimo.** La IA calcula qué clientes están por comprar y la tienda se ajusta con lo que aprende de cada compra; si la tienda atiende por un canal conversacional, agentes de IA atienden y venden ahí, y el equipo revisa lo que hacen y se queda con lo que no resuelven.

*Resultado:* La tienda ajusta lo que muestra con lo que aprende de cada compra y, si atiende por un canal conversacional, los agentes de IA responden y cierran las compras simples a cualquier hora, sin que el equipo tenga que estar.

- La IA calcula la probabilidad de compra de cada cliente y propone respuestas según el contexto de cada conversación; las dos cosas se ven en el CRM y el equipo decide qué usar. `[1.2.O1]`
- Si la tienda atiende por un canal conversacional, agentes de IA atienden ahí a cualquier hora: responden dudas de producto, ayudan a terminar la compra y le pasan a una persona, con el contexto, lo que no pueden resolver; el equipo revisa en el CRM lo que respondieron. `[1.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven a la tienda y al CRM: por ejemplo, el valor esperado de cada cliente decide qué oferta ve. `[1.2.O3]`

*Se leen igual:* `1.2.I1`, `1.2.I2`, `1.2.F2`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.E1`, `1.2.E4`, `1.2.E5`.

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
- La documentación de lo que vende la tienda —por ejemplo, qué resuelve cada línea de productos— no se deja envejecer. `[1.3.F7]`
- Se sabe qué parte de las ventas, en línea y en caja, queda asociada a un cliente identificado, y ese número se revisa al menos una vez al mes. `[1.3.F8]`

**Eficiente.** Aparece un pronóstico de ventas confiable, y los compradores dejan de ser anónimos.

*Resultado:* La empresa puede comprometer un número de ventas y planear sus existencias con confianza, y sabe quiénes son sus compradores.

- Hay un pronóstico de las ventas de la tienda que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo vendido quedó dentro de ±10% del pronóstico. `[1.3.E1]`
- La mayoría de las ventas, en línea y en caja, quedan asociadas a un cliente identificado, no a un cliente genérico. `[1.3.E4]`
- Cada cliente tiene calculado cuánto compra, cada cuánto y cuándo fue su última compra. `[1.3.E101 · comprobable]`

**Óptimo.**

- Cada visita, cliente y pedido se asocia solo, al entrar, con lo que ya había de esa persona; la IA resuelve los dudosos y una persona valida solo las excepciones que el sistema le marca. `[1.3.O1]`

*Se leen igual:* `1.3.D3`, `1.3.I1`, `1.3.F2`, `1.3.F5`, `1.3.F6`, `1.3.E2`, `1.3.E3`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué canal de la tienda va bien y cuál necesita ayuda?

*Descripción:* Mide si cada persona tiene su rol por escrito y cada canal una meta, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* Nadie responde por el número de la tienda: los precios y las promociones se deciden por costumbre, y los problemas aparecen cuando el mes ya cerró.

**Deficiente.** Nadie responde por las ventas de la tienda: cada quien trabaja sobre la marcha y los problemas se atienden cuando ya estallaron.

- Quienes llevan la tienda operan sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1]`

**Funcional.** Cada persona tiene su rol por escrito y cada canal su meta, el líder sigue un tablero cada semana y en la revisión de ventas cada quien rinde cuentas.

*Resultado:* Cada persona sabe qué parte de la tienda le toca, y el líder sabe cada semana qué canal va bien y cuál necesita ayuda, antes de que termine el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —ventas, pedidos, valor promedio del pedido, conversión, carritos abandonados— y lo consulta al menos una vez por semana. `[1.4.F2]`
- En la revisión de ventas se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3]`
- Cada canal de venta tiene una meta escrita, con un monto o una cantidad y un plazo, y su avance se reporta en una fecha fija, al menos una vez al mes. `[1.4.F4]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y se entera por una alerta cuando un canal cae o una meta está en riesgo.

*Resultado:* Una persona nueva opera la tienda más rápido, y el líder se entera de los riesgos por una alerta y no al cierre del mes.

- El líder recibe alertas automáticas de las ventas de cada canal: una caída o una meta en riesgo. `[1.4.E101 · comprobable]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué canal y qué producto dejan más margen, y cuánto vale cada cliente en el tiempo.

- Las decisiones de la dirección usan números de fondo: cuánto deja cada cliente en el tiempo y cuánto margen deja cada canal y cada producto. `[1.4.O1]`

*Se leen igual:* `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F5`, `1.4.E2`, `1.4.E3`, `1.4.E4`, `1.4.O2`, `1.4.O3`.

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

*Se leen igual:* `1.5.D2`, `1.5.I2`, `1.5.F2`, `1.5.F3`, `1.5.F4`, `1.5.F5`, `1.5.E2`, `1.5.E3`.

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

- La IA decide qué mostrarle a cada comprador —productos, orden y oferta— en tiempo real, según su comportamiento y dentro de las reglas que fijó el equipo; lo que decide queda registrado en el sistema y el equipo lo revisa. `[1.6.O101 · comprobable]`
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

**Funcional.** Ningún carrito se abandona en silencio, y cada cliente identificado recibe una invitación a volver.

*Resultado:* Las compras que quedaron a medias se recuperan por más de un canal, y cada cliente identificado recibe una invitación a volver a comprar, sin depender de que alguien se acuerde.

- Está definido cuánto tiempo sin avance vuelve abandonado un carrito o un pedido a medias; los abandonados se reconocen a tiempo y reciben un recordatorio acordado, no uno improvisado. `[1.7.F1]`
- La recuperación usa al menos dos canales, por ejemplo correo y el canal conversacional, como WhatsApp. `[1.7.F2]`
- Después de cada compra, el cliente identificado recibe de forma automática una invitación a volver: un recordatorio, una recomendación o un incentivo. `[1.7.F101 · comprobable · recompra · requiere 1.2.F6]`

**Eficiente.** La recuperación y la recompra combinan varios canales, se mide cuánto recuperan y, donde los productos se acaban, el recordatorio llega cuando toca.

*Resultado:* La tienda recupera compras y clientes por varios canales y sabe cuánto recupera con cada mensaje; donde los productos se acaban, cada cliente recibe el recordatorio justo cuando le toca volver.

- La recuperación de carritos y la recompra combinan al menos tres canales —por ejemplo, correo, el canal conversacional y notificaciones— en una secuencia definida. `[1.7.E1]`
- Si la tienda vende productos que se acaban o caducan, cada uno tiene medido cada cuánto se vuelve a comprar, y el recordatorio sale en ese momento. `[1.7.E101 · comprobable · recompra · requiere 1.3.E4]`
- Se mide cuántos carritos se recuperan y cuántos clientes vuelven a comprar, y con qué mensaje. `[1.7.E102 · comprobable]`

**Óptimo.** La IA calcula cuándo le toca volver a cada cliente y con qué oferta, y decide el canal y el momento de cada recordatorio; el equipo valida.

*Resultado:* Cada cliente recibe su recordatorio en el momento y por el canal en que más le sirve, sin que nadie lo programe.

- La IA detecta dónde se traba una compra antes de que se abandone y responde en el momento —una ayuda, una oferta o el aviso a una persona— dentro de las reglas que fijó el equipo; lo que hace queda registrado en el sistema y el líder lo revisa. `[1.7.O1]`
- La IA decide el canal y el momento de cada recordatorio, comprador por comprador y según cómo responde, dentro de los límites que fijó el equipo; el equipo revisa los resultados, y lo que decide la IA queda registrado en el sistema. `[1.7.O2]`
- La IA calcula cuándo le toca volver a comprar a cada cliente según su propio consumo y ajusta la oferta, dentro de los límites que fijó el equipo; el cálculo y la oferta se ven en la ficha del cliente y el equipo los revisa. `[1.7.O101 · comprobable · recompra]`

*No aplican:* `1.7.D1`, `1.7.I1`, `1.7.I2`.

*Se leen igual:* `1.7.D4`, `1.7.I3`, `1.7.F3`, `1.7.F4`, `1.7.F5`, `1.7.E2`, `1.7.E3`, `1.7.E4`.

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

*Se leen igual:* `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`.

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

- Cada pieza —un correo, un anuncio, una publicación— pasa por una revisión de calidad y una aprobación antes de publicarse. `[2.1.E2]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I2`, `2.1.I3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

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
- Si la tienda en línea tiene puntos donde dejar datos, quien se suscribe o deja sus datos recibe una respuesta automática —la bienvenida o el cupón prometido—, y el sistema avisa a quien corresponde. `[2.2.F5]`
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

- Si la tienda atiende por un canal conversacional, agentes de IA responden a quien contesta una campaña y mantienen la conversación con quien todavía no está listo para comprar —o para hablar con un vendedor, donde vende un equipo—; lo que no pueden resolver pasa a una persona con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O2]`
- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada comprador: las audiencias de los correos y de la pauta usan, por ejemplo, cuánto vale cada cliente en el tiempo, calculado afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D3`, `2.2.F2`, `2.2.E7`, `2.2.O1`.

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
- Los datos que describen al cliente ideal de la tienda —lo que define a cada segmento, como su zona o las categorías que le interesan— se piden donde se capturan sus datos —al suscribirse, al crear su cuenta o al comprar— y están completos en la mayoría de los registros. `[2.3.F2]`
- Los duplicados —el mismo comprador registrado dos veces, con otro correo o como invitado— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —visitas, conversión a compra y de dónde llega cada comprador— salen del sistema sin armarlos a mano. `[2.3.F5]`
- El contexto que el área documentó —los perfiles de comprador, los segmentos y la voz de la tienda— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[2.3.F6]`
- Cuando la tienda pide un correo o un teléfono —al suscribirse o al comprar—, pregunta si la persona acepta que la tienda le escriba por ese canal —correo, SMS o WhatsApp—, y su respuesta queda registrada. `[2.3.F7]`

**Eficiente.** Los datos de cada comprador se completan solos, sus registros repetidos se unen solos y se sabe cuánto aportó cada canal a cada venta.

*Resultado:* Marketing puede demostrar cuánto vendió cada canal y cada campaña, no solo cuál trajo el primer clic.

- La atribución reparte el mérito de cada venta entre todos los puntos de contacto, no solo el primero o el último, y en todos los canales, también el conversacional si se usa: se sabe cuánto vende cada uno —la pauta, el correo, las redes, WhatsApp—. `[2.3.E2]`
- Los registros repetidos del mismo comprador —por ejemplo, el de una compra como invitado y el de su cuenta— se detectan y se unen solos, con reglas que definió el equipo o con la unión automática que trae el sistema. `[2.3.E3]`

**Óptimo.**

*Resultado:* La atribución cruza todos los canales de venta que tenga la tienda, no solo lo que ve Marketing, y los datos de cada comprador se mantienen confiables sin corregirlos a mano: el equipo solo revisa los que la IA marca como dudosos.

- Marketing se apoya en el almacén central de datos de la empresa —donde se juntan los canales de venta que tenga la tienda y las herramientas de marketing—, y sus reportes de atribución de las ventas salen de esa vista completa. `[2.3.O1]`
- La IA completa sola los datos que faltan de cada comprador —por ejemplo, las categorías que le interesan o su talla—; el equipo revisa los que la IA marca como dudosos, y en la ficha se ve qué dato completó la IA y de dónde lo sacó. `[2.3.O3]`

*Se leen igual:* `2.3.D2`, `2.3.I2`, `2.3.E1`, `2.3.E4`, `2.3.O4`, `2.3.O5`.

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
- El liderazgo coordina con Ventas —el calendario de promociones, una reunión conjunta con fecha fija y, donde hay vendedores, el traspaso de leads y sus SLA— y con Servicio, por ejemplo para que sepa qué promoción viene. `[2.4.E3]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide con lo que dejan en el tiempo los compradores que trae cada canal frente a lo que cuesta traerlos.

- Las decisiones se toman con lo que deja cada canal de adquisición a lo largo del tiempo —cuánto compran los clientes que trae, no solo su primera compra— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

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

- Existe una guía corta de la voz de la tienda —cómo habla en sus correos, sus anuncios y sus publicaciones—, escrita, y las piezas del último trimestre la aplican. `[2.5.F2]`
- Hay 2 o 3 perfiles de comprador escritos, cada uno con su recorrido básico por etapa: cómo descubre la tienda, cómo compara y qué lo hace comprar. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: guías de compra, ideas de uso o de regalo, videos o el formato que use la tienda. `[2.5.F5]`
- Si la tienda tiene locales, cada uno aparece en los mapas y en los buscadores con su información completa: dirección, horario, teléfono y fotos. `[2.5.F101 · comprobable]`

**Eficiente.**

*Resultado:* La tienda aparece cuando alguien busca lo que vende, en los buscadores y en los asistentes de IA, con contenido pensado para cada tipo de comprador que importa, y cada reseña de sus compradores, buena o mala, recibe respuesta.

- Los perfiles de comprador están detallados para los segmentos de más valor para la tienda. `[2.5.E1]`
- Si la tienda publica su contenido propio en su sitio, está organizado por temas: una página central por tema —por ejemplo, una guía para elegir un producto— y contenido de apoyo que la refuerza. `[2.5.E2]`
- El contenido de la tienda está preparado para que ella y sus productos aparezcan como respuesta en los asistentes de IA y en los buscadores que contestan preguntas, y se mide cuántas veces aparecen. `[2.5.E3]`
- El recorrido del comprador está mapeado con sus puntos de contacto definidos: dónde conoce la tienda, dónde compara, dónde compra y qué recibe después. `[2.5.E4]`
- Después de la compra o la entrega, se les pide a los compradores una reseña pública del producto, en Google o en el marketplace donde compraron, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo. `[2.5.E5]`

**Óptimo.**

- Hay perfiles de comprador para grupos muy chicos de clientes, no solo para los segmentos grandes de la tienda. `[2.5.O1]`
- La IA produce y ajusta el contenido de la tienda de forma continua —guías, publicaciones y textos para los buscadores y los asistentes de IA—; el equipo valida cada pieza antes de publicarla, y en el sistema se ve qué produjo o cambió la IA y quién lo aprobó. `[2.5.O2]`

*Se leen igual:* `2.5.I3`, `2.5.F1`, `2.5.F4`.

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

- Existen al menos 2 segmentos de compradores con criterios escritos según qué necesita o cómo decide cada grupo —qué categorías le interesan, cómo compra o qué lo hace decidir—, no solo según dónde está. `[2.6.F1]`
- La mayoría de las campañas del último trimestre salieron con piezas distintas para cada segmento: otro producto, otra imagen u otro mensaje. `[2.6.F3]`

**Eficiente.** Los segmentos y el puntaje de cada suscriptor se arman solos, y el mensaje de cada campaña se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y a lo que hizo antes, y quien está más cerca de comprar recibe primero el empujón que le falta.

- Las secuencias de bienvenida y de nutrición cambian según el segmento o la etapa del recorrido de cada persona. `[2.6.E1]`
- El contenido de las campañas se adapta solo a cada segmento: por ejemplo, el mismo correo muestra otros productos según quién lo recibe. `[2.6.E2]`
- Hay un puntaje por reglas de qué tan cerca de comprar está cada suscriptor: suma puntos por varios atributos —lo que abre, lo que mira, cuántas veces vuelve a la tienda— y, al pasar un umbral, dispara la secuencia de nutrición que le corresponde. No basta con una regla sobre un solo dato. `[2.6.E3]`
- La segmentación usa lo que hace cada persona —qué correos abrió, qué miró en la tienda, qué compró y hace cuánto—, no solo lo que declaró. `[2.6.E4]`

**Óptimo.**

*Resultado:* Cada comprador recibe los mensajes y ve el contenido que le corresponde según lo que hizo antes, sin que nadie arme un segmento para él.

- La IA predice quién va a comprar —por primera vez o de nuevo— y quién va a perder interés en los mensajes de la tienda, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`
- Hay personalización uno a uno: la IA cambia en tiempo real lo que ve cada persona en los mensajes, en las páginas de campaña de la tienda en línea o en la app según lo que hizo antes, dentro de las reglas que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué versión vio cada persona. `[2.6.O3]`

*Se leen igual:* `2.6.D2`, `2.6.I2`, `2.6.F4`.

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
- Si la pauta pagada es parte del plan de canales, hay al menos una campaña corriendo con presupuesto definido: en Google, en Meta, en el marketplace donde vende la tienda o en el canal que le corresponda. `[2.7.F3]`
- Si WhatsApp u otro canal conversacional es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario —lanzamientos, promociones, novedades—, no solo para responder lo que entra. `[2.7.F4]`
- Los canales que la tienda eligió en su plan siguen el mismo calendario y la misma campaña: una promoción —el Black Friday, el Día de la Madre— sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada venta el último mes —o cada lead, donde vende un equipo—, al menos por canal. `[2.7.F6]`

**Eficiente.** Los canales comparten datos, la pauta se mueve cada mes según lo que cuesta cada venta en cada canal, y cada comprador que traen los clientes —o los creadores, si la tienda trabaja con ellos— queda registrado.

*Resultado:* La pauta se mueve hacia el canal que mejor rinde, los canales se refuerzan entre sí en vez de competir por el mismo comprador, y los clientes —y los creadores, si la tienda trabaja con ellos— traen compradores que se pueden contar.

- Los canales —también el conversacional, si se usa— comparten datos y se alimentan entre sí: una campaña que empieza en la pauta sigue en el correo, hay remarketing activo y las audiencias de la pauta se arman desde el CRM, por ejemplo para no mostrarle un anuncio de captación a quien ya compró. `[2.7.E1]`
- Si los eventos son parte del plan de canales —lanzamientos en la tienda, ventas en vivo por las redes o talleres—, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- El presupuesto entre canales se revisa al menos una vez por mes y se mueve según lo que cuesta cada venta en cada canal —o cada lead, donde vende un equipo—. `[2.7.E3]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar la tienda —con su enlace o su código—, y cada comprador nuevo que llega referido queda registrado con quién lo trajo. `[2.7.E4]`
- Si la tienda trabaja con creadores de contenido, tiene con ellos un programa activo de colaboraciones recurrentes, con fechas en el calendario: cada creador tiene su código o su enlace, y cada venta que trae queda registrada con quién la trajo. `[2.7.E101 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La pauta se reparte sola donde más vende, dentro de los límites que fija el equipo; los compradores contentos traen compradores nuevos, y la tienda prueba canales nuevos sin esperar a ver qué hace su competencia.

- Se prueban canales nuevos —una red que empieza a vender, un marketplace nuevo, comunidades o formatos nuevos— en ciclos de dos meses o menos. `[2.7.O1]`
- La IA mueve sola la pauta entre canales mientras las campañas corren, hacia donde más retorno deja lo invertido y dentro de los límites que fijó el equipo; el líder revisa los resultados, y en el sistema queda cada cambio con su razón. `[2.7.O2]`
- Los compradores que Servicio identifica como promotores se vuelven un canal de referidos y de contenido —sus fotos y videos con el producto— sin pedírselo a mano: el sistema los invita solo, el equipo elige qué contenido se publica, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.I1`, `2.7.I3`, `2.7.E5`.

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

- Hay pruebas A/B regulares en las campañas —un asunto de correo, una imagen, una audiencia—, al menos una activa por mes. `[2.8.E1]`
- Hay un proceso escrito para comparar, con los resultados de campañas y temporadas anteriores, qué piezas y audiencias funcionan. `[2.8.E2]`
- El proceso de campaña y el plan de las próximas campañas y temporadas se ajustan con lo aprendido. `[2.8.E3]`

**Óptimo.**

*Resultado:* Las campañas mejoran mientras están corriendo, no cuando la temporada ya pasó.

- La IA ajusta las campañas mientras corren —deja de mostrar la pieza o la audiencia que no vende y le da más espacio a la que sí—, dentro de los límites que fijó el equipo; el equipo revisa los cambios, y cada uno queda en el sistema con su razón. `[2.8.O2]`

*Se leen igual:* `2.8.I2`, `2.8.O3`.

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
- Cada comprador tiene registrado quién responde por él —una persona o, si son tantos que no se asignan por persona, un equipo— y recibe un contacto de seguimiento a tiempo —en los momentos que fija el proceso de posventa—, aunque no haya abierto casos, como la confirmación de que su pedido llegó bien; si responde un equipo, ese contacto puede ser un mensaje automático. `[3.1.F2]`
- Existe un proceso escrito para escalar los reclamos graves —un pedido que no llegó, un producto dañado, un reclamo público— y los casos que quien atiende no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cualquiera del equipo explica igual cómo se atiende un cambio o una devolución, paso a paso. `[3.1.F5]`
- Cualquiera del equipo atiende en el sistema central, no desde su teléfono ni desde la aplicación de cada red: es su herramienta de trabajo, no algo que se llena después de resolver por otro lado. `[3.1.F6]`

**Eficiente.** Aparecen los plazos de atención, las guías de acción y el recorrido del comprador, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso —una consulta, un cambio, una devolución—, cada momento después de la compra tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay plazos de respuesta y de resolución definidos por tipo de caso —una consulta, un cambio, una devolución, un reclamo— o por prioridad. `[3.1.E1]`
- Hay guías de acción para prevenir problemas —un atraso, un producto que se agotó después de pagado— y, donde hay suscripción, también para retener a quien quiere cancelar y para ofrecerle más a quien está contento. `[3.1.E3]`
- El recorrido del comprador después de pagar está definido de punta a punta —la confirmación, la espera, la entrega, el uso y, si la hay, la próxima compra—, con un responsable y un estándar para cada momento. `[3.1.E4]`

**Óptimo.**

- La IA ejecuta las rutinas repetitivas de la posventa —generar la guía de devolución, avisarle a la bodega, dar seguimiento a los casos y cerrarlos—; el equipo supervisa, corrige a la IA y resuelve las excepciones, y en el sistema se ve qué hizo la IA y qué revisó una persona. `[3.1.O1]`

*Se leen igual:* `3.1.I2`, `3.1.F3`, `3.1.E5`, `3.1.O3`, `3.1.O4`.

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
- Al entrar un caso, el sistema lo asigna solo según una regla simple —por ejemplo, por tipo: consulta, cambio o devolución—, y los avisos de cada cambio de estado del caso llegan a quien los necesita. `[3.2.F5]`
- Si hay un chatbot, resuelve preguntas frecuentes —horarios, costos de envío, cómo pedir un cambio— con un árbol de decisión. `[3.2.F6]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el comprador puede ver sus casos e iniciar un cambio o una devolución sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de los plazos —alertas antes de que venzan y escalación automática, con reglas de cuándo se escala y a quién— y, si el equipo tiene más de una persona, los casos y las conversaciones se reparten por varias condiciones, como el tipo de caso, el canal o el marketplace de donde vienen. `[3.2.E1]`
- Hay un portal de autoservicio donde el comprador ve sus casos y abre uno nuevo —por ejemplo, inicia un cambio o una devolución sin escribirle a nadie—, y hay base de conocimiento interna y pública. `[3.2.E2]`
- Si la tienda atiende por más de un canal escrito —correo, WhatsApp, chat, redes o los mensajes de los marketplaces—, todos llegan a una sola bandeja. `[3.2.E3]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir un caso o buscar en la política de cambios—, y la IA trabaja con el contexto del área: los tipos de cliente, la atención que recibe cada uno y las respuestas a las preguntas frecuentes. `[3.2.E4]`

**Óptimo.**

*Resultado:* Buena parte de los casos se resuelve sin que intervenga una persona, y cuando un caso pasa a alguien del equipo, llega con el pedido, la conversación y lo que la tienda sabe de ese comprador a la vista.

- Un agente de IA resuelve casos —dónde está un pedido, cómo hacer un cambio— en todos los canales donde atiende la tienda, sin que intervenga una persona, y le pasa a alguien del equipo, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de atención: quien atiende ve en la ficha del comprador, por ejemplo, cuánto vale en el tiempo o si está por dejar de comprar. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.F8`, `3.2.E5`.

#### 3.3 Datos

¿De dónde sacas cuántos casos te llegan de cada tipo —consultas, cambios, devoluciones— y de qué compradores?

*Descripción:* Mide si los datos de cada comprador, sus pedidos y sus casos están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que dar su número de pedido y volver a explicar todo, porque nadie ve su historia.

**Deficiente.**

- Es imposible reconstruir qué pasó con un comprador: qué pidió, qué le llegó y qué reclamó. `[3.3.D2]`

**Funcional.** La ficha y la historia de cada comprador están a la vista, y cada caso queda ligado a su pedido, con su tipo y su motivo.

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cualquiera del equipo ve en segundos la historia del comprador y en qué va el pedido del que habla.

- Cualquiera del equipo ve el historial de casos de un comprador en menos de 10 segundos. `[3.3.F1]`
- La ficha del comprador muestra sus pedidos y su valor para la tienda, no solo sus casos. `[3.3.F2]`
- Los datos clave del comprador —qué compró y desde cuándo compra en la tienda— están poblados en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene su tipo y su motivo, de una lista definida: por ejemplo, una consulta por el estado del pedido, un cambio de talla o un reclamo por un atraso. `[3.3.F4]`
- El líder saca del sistema, sin armarlo a mano, cuántos casos llegan de cada tipo: consultas, cambios, devoluciones y reclamos. `[3.3.F5]`
- Cada caso queda ligado al pedido del que habla, y quien atiende ve en qué va ese pedido —preparado, enviado, entregado— sin salir del sistema. `[3.3.F101 · comprobable · requiere 1.1.F2]`

**Eficiente.** Se miden los tiempos y la satisfacción, y la posventa ve los mismos datos que la venta.

*Resultado:* La tienda sabe qué tan rápido y qué tan bien atiende, cuánto tarda un comprador nuevo en tener lo que compró y, donde se vuelve a comprar, qué tan sano está cada cliente, con la satisfacción medida y no supuesta.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los plazos acordados, en todos los canales, también en las redes y en los marketplaces. `[3.3.E1]`
- Se mide la satisfacción del comprador —con el NPS o el CSAT— con una cadencia definida: por ejemplo, una encuesta después de cada entrega o al cerrar cada caso. `[3.3.E2]`
- Los datos de cada comprador están unificados entre la posventa y la venta: los dos lados ven los mismos pedidos, casos y datos de contacto, en un mismo sistema o en sistemas conectados, como la tienda en línea conectada al sistema de atención. `[3.3.E3]`
- Se mide cuánto tarda cada comprador nuevo en alcanzar el resultado de su primera compra: desde que paga hasta que lo recibe y lo usa sin problemas, sin abrir un caso ni devolverlo. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente, que combina cómo viene comprando, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Los datos se mantienen al día solos y, donde se vuelve a comprar, un modelo de salud anticipa quién puede dejar de comprar antes de que lo diga.

*Resultado:* La tienda sabe cuántos casos va a traer cada temporada, con datos que se mantienen al día solos, y, donde se vuelve a comprar, qué clientes pueden dejar de comprar por una mala experiencia antes de que lo digan.

- Un modelo predictivo de salud calcula para cada cliente si puede dejar de comprar y si lo que compra le está sirviendo, a partir de su experiencia con la tienda —entregas, casos y devoluciones— y de cómo viene comprando; el puntaje se ve en su ficha y quien responde por cada cliente revisa a los que el modelo marca. `[3.3.O1]`
- Modelos con IA predicen lo que viene —por ejemplo, cuántos casos traerá la próxima promoción y cuánta gente hará falta para atenderlos— y proponen qué hacer; lo que predicen se ve en los tableros de la posventa y el líder decide con eso. `[3.3.O3]`

*Se leen igual:* `3.3.D1`, `3.3.I1`, `3.3.I2`, `3.3.F6`, `3.3.O2`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si la posventa va al día con las consultas, los cambios y las devoluciones?

*Descripción:* Mide si alguien responde por la posventa: roles claros, un tablero con sus números y una revisión con cadencia.

*Costo de quedarse:* Nadie responde por la posventa: sus números no se miran, y los atrasos y los reclamos se descubren cuando ya estallaron.

**Deficiente.**

- Nadie tiene claro qué le toca: entre las consultas, los cambios, las devoluciones y los reclamos, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.** Cada quien sabe a grandes rasgos qué le toca y el líder mira algunos números de la posventa, pero sin una cadencia fija.

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si la posventa va al día o se está atrasando.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, casos por tipo, pedidos atrasados, cambios y devoluciones en curso— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por los plazos de atención, el líder prepara a quien entra y acuerda con Ventas qué recibe y qué le devuelve la posventa.

*Resultado:* El equipo responde por sus plazos de atención, una persona nueva atiende bien desde el principio, la posventa sabe qué espera cada comprador nuevo de su compra y, donde se vuelve a comprar sin suscripción, Ventas se entera de quién puede estar dejando de comprar.

- En las reuniones del equipo se revisa el cumplimiento de los plazos de atención de cada persona y se acuerda qué corregir. `[3.4.E1]`
- Cuando entra alguien nuevo a la posventa, hay un plan de inducción con sus pasos y materiales —la política de cambios, los casos frecuentes, el sistema—; no se le entrena de memoria. `[3.4.E2]`
- El líder de la posventa acuerda con Ventas qué trae cada comprador nuevo —lo que espera de su compra, según la ficha del producto y la promoción con la que compró— y el acuerdo se cumple: cada uno llega con eso y, si el comprador vuelve a comprar sin suscripción, la posventa le avisa a Ventas cuando puede estar dejando de comprar. `[3.4.E4]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento y, donde hay suscripción, la posventa se mide por los suscriptores que retiene y por cuánto crecen sus compras.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella, la posventa decide con lo que cuesta atender a cada tipo de cliente y, donde hay suscripción, se mide por los suscriptores que retiene y por cuánto crecen sus compras, no solo por los casos que cierra.

- El equipo de posventa se mide por cuántos suscriptores retiene y cuánto crecen sus compras, no solo por los casos que cierra. `[3.4.O3]`
- El sistema calcula cuánto cuesta atender a cada tipo de cliente —sus consultas, sus cambios, sus devoluciones— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.O4]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.O1`, `3.4.O2`.

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

*Se leen igual:* `3.5.F3`, `3.5.E1`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de Clientes

¿Cómo decide tu equipo qué caso se atiende primero: un pedido que no llegó, un cambio o una consulta de talla?

*Descripción:* Mide si los casos se atienden según su urgencia —qué pedido está en juego— y el tipo de cliente, no según quién insiste más.

*Costo de quedarse:* Un pedido que no llegó espera detrás de una consulta simple, y quien atiende responde sin saber qué compró esa persona ni qué le pasó antes.

**Deficiente.**

- Los casos se atienden por orden de llegada o como le parezca a quien atiende, sin mirar qué pedido está en juego ni quién es el comprador. `[3.6.D1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero —un pedido que no llegó antes que una consulta de talla—, cada tipo de cliente recibe la atención que le corresponde, y quien atiende no tiene que reconstruir la historia del comprador.

- Cada caso tiene una prioridad asignada —por ejemplo, un pedido que no llegó va antes que una consulta de talla— y el equipo la respeta. `[3.6.F1]`
- Está escrito qué atención recibe cada tipo de cliente —por ejemplo, por qué canal y quién atiende a quien compra en línea, en la tienda física o en un marketplace—, y el equipo la aplica. `[3.6.F2]`
- Quien atiende usa la ficha del comprador —sus pedidos y sus casos abiertos— para responder con contexto, sin pedirle sus datos otra vez ni reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** Los compradores se segmentan según su momento, para actuar distinto con cada grupo.

*Resultado:* La atención cambia según el momento de cada comprador: con un pedido en camino, dentro de su plazo de cambio o con un problema abierto.

- Los compradores se segmentan para acciones de posventa según su momento: con un pedido en camino, dentro de su plazo de cambio o de garantía, con un problema abierto o listos para recomendar; y, donde vuelven a comprar, sanos o en riesgo. `[3.6.E2]`

**Óptimo.**

*Resultado:* Cada comprador recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar qué compró ni qué le prometieron.

- En el autoservicio, el portal y el chat le muestran a cada comprador lo que corresponde a su tipo de cliente, a sus pedidos y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- La IA ajusta cada respuesta al comprador mientras lo atiende —según su historia, su caso y lo que está pasando con su pedido—, dentro de los límites que fijó el equipo; el equipo revisa una muestra de las respuestas, y en el sistema queda qué se le respondió. `[3.6.O2]`
- Cada comprador se atiende con el contexto de su compra —lo que le prometieron la ficha del producto y la promoción con la que compró, y la campaña de la que viene—, que quien lo atiende, persona o IA, ve en la ficha del comprador sin volver a preguntarlo. `[3.6.O3]`

*No aplican:* `3.6.E1`.

*Se leen igual:* `3.6.I1`.

#### 3.7 Seguimiento del pedido

¿Cómo te enteras de que un pedido viene con problemas: un atraso, un producto dañado, un comprador molesto?

*Descripción:* Mide si el comprador sabe cómo va su pedido sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera de un atraso cuando ya reclamó, y tú te enteras de que quedó mal cuando deja una mala reseña.

**Deficiente.** La posventa espera el reclamo: nadie mira los pedidos hasta que el comprador escribe.

- Aunque un comprador acumule casos repetidos o tenga un reclamo sin resolver, nadie lo contacta: los problemas con sus pedidos se atienden cuando ya estallaron. `[3.7.D1]`
- La posventa nunca le escribe al comprador por iniciativa propia: siempre espera a que él escriba. `[3.7.D2]`

**Inicial.** A veces alguien avisa de un atraso o llama a un comprador molesto, pero depende de quién lo note.

**Funcional.** Los atrasos, los problemas que se repiten y los reclamos se detectan, aunque sea a mano, y los clientes clave reciben contacto antes de sus fechas críticas.

*Resultado:* Los atrasos, los problemas que se repiten, los reclamos y las fechas críticas de los clientes clave ya no toman al equipo por sorpresa: el comprador se entera de un atraso antes de tener que reclamar, alguien actúa antes de que un problema crezca y, donde hay suscripción, se sabe por qué cancela cada cliente.

- Un comprador con casos repetidos por el mismo problema, un reclamo sin resolver —también uno público, en las redes— o, si la tienda pide calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los clientes clave reciben contacto antes de sus fechas críticas —el fin de su garantía o, si tienen suscripción, su renovación—, no después. `[3.7.F2]`
- Cada cliente que cancela su suscripción deja registrada la razón. `[3.7.F3]`
- Los pedidos que se van a atrasar se detectan antes de la fecha prometida, y el comprador recibe un aviso con la nueva fecha antes de tener que reclamar. `[3.7.F101 · comprobable · hábito]`

**Eficiente.** Los atrasos se ven venir, ningún caso del comprador se pierde aunque lo resuelva otra área —la bodega, el despacho o administración—, y el comprador recibe lo que necesita saber antes de pedirlo.

*Resultado:* Ningún caso del comprador se pierde entre la posventa, la bodega y el despacho, el comprador sabe lo que necesita antes de preguntarlo, quien tuvo un problema recibe algo para recuperarlo antes de irse con una mala impresión y, donde hay suscripción, quien está por cancelar recibe una razón para quedarse.

- Hay alertas tempranas, a partir del indicador de salud, de un suscriptor que puede cancelar o que está listo para comprar más. `[3.7.E1]`
- Ningún caso del comprador se pierde entre áreas: si lo resuelve otra área —la bodega, el despacho o administración—, también queda en el sistema; y hay alertas automáticas, que le llegan a quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica —una entrega, el fin de un plazo de cambio, una garantía— o, si la tienda pide calificaciones, cuando un comprador califica mal. `[3.7.E4]`
- Cada comprador recibe, sin tener que pedirla, la información que necesita antes de los momentos clave —lo que necesita para retirar o recibir su pedido, el fin de su plazo de cambio, el vencimiento de una garantía—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`
- Cada comprador con un pedido atrasado o que llegó mal recibe, sin tener que pedirla, una acción para recuperarlo: una disculpa, una compensación o una atención especial. `[3.7.E101 · comprobable · hábito]`
- Los suscriptores que dan señales de cancelar —pausan, se saltan entregas, reclaman— reciben una acción para quedarse antes de decidir irse. `[3.7.E102 · comprobable · hábito · relación continua]`

**Óptimo.** Los problemas con un pedido se resuelven antes de que el comprador los note, con avisos que la IA ajusta, y cada comprador recibe detalles que lo deleitan.

*Resultado:* La mayoría de los problemas con un pedido que detecta el sistema se resuelven antes de que el comprador los note, y cada comprador siente que la tienda se adelanta a lo que necesita y lo sorprende para bien.

- La mayoría de los problemas que detecta el sistema se resuelven antes de que el comprador los note —por ejemplo, un pedido que se iba a atrasar sale desde otra bodega o con otro transportista—: el equipo valida la solución y en el sistema se ve que el comprador no tuvo que abrir un caso. `[3.7.O2]`
- La IA decide qué aviso o qué acción de la posventa recibe cada comprador —qué, cuándo y por qué canal— según su historia y sus señales, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada comprador. `[3.7.O3]`
- Los compradores reciben, sin pedirlos, detalles pensados para deleitarlos —una nota escrita a mano, una muestra en el paquete, un regalo en su cumpleaños—, elegidos según la historia de cada comprador y el momento de su relación, y en el sistema queda qué recibió cada uno. `[3.7.O4]`

*No aplican:* `3.7.E2`, `3.7.E3`, `3.7.O1`.

*Se leen igual:* `3.7.I1`.

#### 3.8 Autoservicio

¿Qué pasa con las preguntas que tus compradores hacen una y otra vez, como dónde está su pedido o cuánto cuesta el envío?

*Descripción:* Mide si las preguntas de siempre tienen respuesta publicada y si lo aprendido se documenta, para atender más pedidos sin sumar gente al mismo ritmo.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas una y otra vez —dónde está mi pedido, cuánto cuesta el envío—, y en temporada alta esas preguntas atrasan todo lo demás.

**Deficiente.** Las preguntas de siempre se responden a mano, una por una: el comprador no tiene dónde ver su pedido ni respuestas publicadas.

- El comprador no puede ver solo en qué va su pedido ni encontrar respuestas publicadas. `[3.8.D1]`
- Hasta las preguntas que más se repiten —dónde está mi pedido, cuánto cuesta el envío, cómo pido un cambio— se responden a mano, una por una, cada vez que llegan. `[3.8.D2]`

**Inicial.** Hay preguntas frecuentes sueltas o un chatbot de menú, pero lo que más se consulta —dónde está mi pedido— todavía necesita a una persona.

**Funcional.** El comprador ve solo en qué va su pedido, y las preguntas más frecuentes tienen respuesta publicada.

*Resultado:* El comprador puede ver por su cuenta dónde está su pedido o la respuesta a las preguntas de siempre, y el equipo le envía el enlace en vez de volver a escribirla.

- Las diez preguntas que más se repitieron en el último trimestre —o todas, si son menos—, como dónde está mi pedido, cuánto cuesta el envío o cómo pido un cambio, tienen una respuesta que el comprador puede consultar por su cuenta: el seguimiento de su pedido o una pregunta frecuente publicada. `[3.8.F1]`
- Cuando entra un caso que ya tiene respuesta publicada, el equipo envía el enlace —al seguimiento del pedido o a la pregunta frecuente— en vez de volver a redactarla. `[3.8.F2]`

**Eficiente.**

*Resultado:* La tienda puede vender más, también en temporada alta, sin sumar gente en la misma proporción, porque buena parte de lo que preguntan los compradores se resuelve sin abrir un caso.

- Cada caso nuevo que se resuelve deja su solución escrita en la base de conocimiento: un producto que falla de una forma nueva, una duda de envío que no estaba. `[3.8.E1]`
- Al menos una vez por trimestre se revisan los casos que se repiten —por ejemplo, un producto que genera muchos casos— y, donde hay suscripción, las razones por las que se cancela, para encontrar patrones y mejorar. `[3.8.E2]`
- El autoservicio funciona: se mide cuántos compradores resuelven sin abrir un caso —ven dónde está su pedido o encuentran cómo hacer un cambio—, y el equipo no crece al mismo ritmo que los pedidos. `[3.8.E3]`

**Óptimo.**

*Resultado:* Los pedidos pueden crecer sin que crezca el equipo: las respuestas se generan a medida que aparecen preguntas nuevas, y la IA y el autoservicio absorben la temporada alta.

- La IA detecta las preguntas nuevas que llegan —por un producto recién lanzado o un cambio en los envíos— y redacta la respuesta; el equipo la revisa antes de publicarla, y en la base de conocimiento se ve qué escribió la IA y quién lo aprobó. `[3.8.O1]`
- Los picos de demanda —la temporada alta, una promoción grande— los absorben la IA y el autoservicio: el equipo no crece cuando crecen los pedidos, y el líder ve en los tableros del área qué parte de los casos resolvieron la IA y el autoservicio y qué pasó a alguien del equipo. `[3.8.O2]`
- La IA aplica lo que aprende de los casos a las respuestas guardadas, a la atención de cada tipo de cliente y a los avisos al comprador, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3]`

*Se leen igual:* `3.8.I1`, `3.8.I2`, `3.8.O4`.

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

**Funcional.** Todo el equipo sigue el mismo recorrido escrito de la solicitud en el CRM, con un plazo de respuesta en cada etapa comercial, una cadencia de seguimiento y una revisión fija de las solicitudes.

*Resultado:* Si rota un ejecutivo, el siguiente sabe en qué va cada solicitud, porque todo el equipo las trabaja igual: avanzan con los mismos criterios, cada etapa en manos del equipo comercial tiene su plazo de respuesta y se les da seguimiento con la cadencia acordada.

- Cualquier ejecutivo explica igual las etapas de una solicitud —ingreso, análisis, aprobación y desembolso— y qué tiene que cumplir para avanzar. `[1.1.F1]`
- Cada producto —crédito, tarjeta, cuenta— tiene su propio recorrido en el CRM, con lo que la solicitud tiene que cumplir para pasar de cada etapa a la siguiente. `[1.1.F2]`
- Cada etapa de la solicitud que está en manos del área comercial —recibirla, armar el expediente, comunicarle la respuesta al cliente y coordinar la firma— tiene un plazo de respuesta acordado, y se cumple en la mayoría de las solicitudes; el análisis de crédito queda fuera, porque su plazo se acuerda con esa área. `[1.1.F201 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El líder sabe dónde se desvía el proceso y lo corrige con datos, no de memoria; donde la venta pasa por un ejecutivo, además, todo el equipo asesora con un mismo método.

- Hay una metodología comercial formal en uso —SPIN, BANT o una de asesoría equivalente— que el ejecutivo sigue para conocer la necesidad del cliente antes de ofrecerle un producto. `[1.1.E1]`
- Existen guías de descubrimiento de necesidades, precalificación y manejo de objeciones —tasa, requisitos, plazo— que el equipo usa. `[1.1.E2]`

*Se leen igual:* `1.1.D1`, `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I1`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.E3`, `1.1.O1`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una solicitud o cambia de estado?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las solicitudes, registrar lo que entra por los canales digitales, avisarle al cliente en qué va su solicitud—, si el CRM está conectado con el core bancario y cómo usa el equipo la IA.

*Costo de quedarse:* Tus ejecutivos pierden horas en tareas que el sistema podría hacer: las solicitudes esperan a que alguien decida a quién le tocan, las que empiezan en la web se enfrían sin que nadie llame al cliente y el cliente tiene que llamar para saber en qué va la suya.

**Inicial.** Hay un CRM, pero las solicitudes se cargan y se reparten a mano, y el cliente tiene que llamar para saber en qué va la suya.

- Lo que el cliente contrata solo —por la web, la app o el autoservicio— se pasa a mano al sistema, cuando alguien tiene tiempo. `[1.2.I2]`
- El cliente tiene que llamar para saber en qué va su solicitud. `[1.2.I201 · evaluado]`

**Funcional.** Lo básico pasa solo: las solicitudes se reparten por una regla, lo que el cliente hace en los canales digitales entra al sistema aunque lo deje a medias, y el cliente recibe un aviso en cada cambio de estado.

*Resultado:* Ninguna solicitud se pierde por no saber a quién le toca: la que empieza en un canal digital entra sola, aunque quede a medias; el ejecutivo recibe el aviso de lo que le toca y el cliente sabe en qué va su solicitud sin tener que llamar.

- Las solicitudes y los pedidos de información que entran llegan a una bandeja o cola y se asignan por una regla simple: por turnos, por sucursal o por producto. `[1.2.F2]`
- Lo que el cliente contrata solo —por la web, la app o el autoservicio— entra solo al sistema como una solicitud, con su producto, su monto, su canal, su fecha y su cliente, que siempre se identifica al contratar. `[1.2.F6]`
- La solicitud que el cliente deja a medias en un canal digital queda guardada en el sistema, con sus datos de contacto. `[1.2.F201 · comprobable · venta sin vendedor]`
- En cada cambio de estado de su solicitud —recibida, en análisis, aprobada o qué le falta—, al cliente le llega un aviso automático. `[1.2.F202 · comprobable]`

**Eficiente.** El CRM se conecta con el core bancario, las simulaciones salen del sistema, el cliente firma sin ir a la sucursal y el equipo usa la IA en su trabajo diario.

*Resultado:* El ejecutivo recupera el tiempo que se le iba en tareas repetitivas, y el líder ve en tiempo real en qué etapa se caen las solicitudes.

- Las simulaciones y las ofertas se generan desde el sistema, con la tasa y las condiciones vigentes, no en hojas sueltas. `[1.2.E1]`
- El CRM está integrado con el core bancario y con el sistema donde se analiza el crédito. `[1.2.E3]`
- El cliente verifica su identidad —por ejemplo, con un código que le llega al teléfono o con la foto de su identificación—, entrega sus documentos y firma de forma digital, sin tener que ir a la sucursal. `[1.2.E201 · comprobable]`

**Óptimo.** La IA precalifica, agenda citas y calcula qué solicitudes se van a concretar; el ejecutivo valida y se queda con las conversaciones que deciden la colocación.

*Resultado:* El ejecutivo dedica su tiempo a las conversaciones que deciden la colocación: los agentes de IA precalifican y agendan, y él trabaja con la probabilidad de que se concrete cada solicitud y con las respuestas que la IA le propone.

- La IA calcula qué tan probable es que se concrete cada solicitud y propone respuestas según el contexto de cada conversación; las dos cosas se ven en el CRM y el ejecutivo decide qué usar. `[1.2.O1]`
- Si el equipo atiende por un canal conversacional, agentes de IA precalifican ahí a los prospectos con la definición de prospecto precalificado y agendan citas a cualquier hora; le pasan al ejecutivo, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que precalificaron. `[1.2.O2]`

*No aplican:* `1.2.F8`.

*Se leen igual:* `1.2.D1`, `1.2.D2`, `1.2.I1`, `1.2.F3`, `1.2.F4`, `1.2.F7`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.O3`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus solicitudes en curso antes de usarlo para decidir?

*Descripción:* Mide si los datos comerciales son confiables para decidir: solicitudes completas, su origen, la autorización del cliente y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de solicitudes en curso se arma a mano, cambia según quién lo arma y nadie sabe cuántas hay de verdad ni por qué canal llegó cada una.

**Deficiente.**

- No hay un registro de los prospectos: cada vez que se necesita la lista de quiénes pidieron un producto, hay que armarla a mano con hojas de cálculo, la libreta de cada ejecutivo y lo que guarda cada sistema. `[1.3.D3]`
- Las solicitudes que se concretan no quedan registradas en el área comercial con su producto, su monto y su fecha: lo que colocó cada ejecutivo, cada sucursal o cada canal se arma a mano con los reportes del core bancario. `[1.3.D4]`

**Funcional.** El reporte de solicitudes en curso sale del sistema, sin armarlo a mano, y la autorización de cada cliente para consultar su historial está registrada.

*Resultado:* El líder ve cuántas solicitudes hay en cada etapa cuando lo necesita, sin armar el reporte a mano, sabe por qué canal llegó cada una y puede demostrar que cada cliente autorizó que se consultara su historial.

- Toda solicitud creada desde la puesta en marcha del recorrido actual tiene producto, monto, fecha esperada de desembolso o de apertura y ejecutivo responsable. `[1.3.F1]`
- Toda solicitud creada desde la puesta en marcha del recorrido actual dice por qué canal llegó: sucursal, ejecutivo, campaña, web, app o referido. `[1.3.F3]`
- El reporte de solicitudes en curso se genera del sistema sin reconstruir números, y refleja el estado actual, no una proyección. `[1.3.F4]`
- La documentación sobre el cliente objetivo de cada producto no se deja envejecer. `[1.3.F5]`
- La definición de prospecto precalificado no se deja envejecer. `[1.3.F6]`
- La documentación de lo que ofrece la entidad —por ejemplo, qué resuelve cada producto— no se deja envejecer. `[1.3.F7]`
- Todo prospecto con el que se trabaja tiene registrada su autorización para consultar su historial crediticio, con su fecha. `[1.3.F201 · comprobable]`

**Eficiente.** Aparece una proyección de colocación confiable, y la ficha del cliente reúne sus productos, sus solicitudes y sus conversaciones.

*Resultado:* La entidad puede comprometer una meta de colocación con confianza, y el ejecutivo ve en un solo lugar qué tiene cada cliente y qué pidió.

- Hay una proyección de colocación que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses lo colocado quedó dentro de ±10% de la proyección. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con lo que viene del core bancario —sus productos, sus saldos y cómo ha pagado— y con su historial de conversaciones: la vista 360° empieza a tomar forma. `[1.3.E3]`

*No aplican:* `1.3.F8`, `1.3.E4`.

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.I1`, `1.3.I2`, `1.3.I3`, `1.3.F2`, `1.3.E2`, `1.3.O1`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué sucursal y qué ejecutivo van bien y quién necesita ayuda?

*Descripción:* Mide si cada ejecutivo tiene un rol y una meta por escrito, si cada sucursal y cada canal digital tienen la suya, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes de que la meta no se cumplió: no vio antes qué sucursal o qué ejecutivo se quedó atrás, ni por qué.

**Funcional.**

*Resultado:* Cada ejecutivo sabe qué se espera de él, y el líder sabe cada semana qué sucursal y qué ejecutivo van bien y quién necesita ayuda, antes de que cierre el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —solicitudes ingresadas, solicitudes aprobadas, monto colocado, tasa de aprobación, tiempo de respuesta— y lo consulta al menos una vez por semana. `[1.4.F2]`
- Cada ejecutivo, cada sucursal y cada canal digital tiene una meta escrita, con un monto o una cantidad de productos colocados y un plazo, y su avance se reporta en una fecha fija, al menos una vez al mes. `[1.4.F4]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con el área de crédito y, si Marketing pasa prospectos, también con Marketing.

*Resultado:* Un ejecutivo nuevo produce más rápido, el traspaso de expedientes con el área de crédito tiene reglas que se cumplen, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa prospectos, ese traspaso también tiene reglas que se cumplen.

- Cuando entra un ejecutivo nuevo, hay un plan de inducción con sus pasos y materiales —productos, política de crédito y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con el área de crédito está escrito y se mide: qué expediente se recibe, en cuánto tiempo se resuelve y por qué se devuelve. `[1.4.E201 · comprobable]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué producto y qué canal dejan más margen, qué ejecutivo aporta más y cuánto vale cada cliente en el tiempo.

- Las decisiones de la dirección usan números de fondo: cuánto margen deja cada producto y cada canal, cuánto deja cada cliente en el tiempo y cuánto aporta cada ejecutivo. `[1.4.O1]`

*Se leen igual:* `1.4.D1`, `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F3`, `1.4.F5`, `1.4.E3`, `1.4.E4`, `1.4.O2`, `1.4.O3`.

#### 1.5 Oferta y condiciones

¿Cómo sabe un ejecutivo que entra a tu equipo a quién va dirigido cada producto y con qué condiciones ofrecerlo?

*Descripción:* Mide si el equipo sabe a quién ofrecerle cada producto y si las condiciones se dicen igual en cada canal.

*Costo de quedarse:* El cliente escucha una tasa en la sucursal y otra por teléfono, o le piden un requisito que nadie le había dicho: desconfía, compara y se va con la entidad que le habló claro.

**Deficiente.** Nadie puede decir a quién va dirigido cada producto, y cada ejecutivo explica las condiciones de memoria y a su manera.

- Nadie puede decir con claridad a quién va dirigido cada producto, y las condiciones que escucha el cliente cambian según quién lo atienda o por dónde pregunte. `[1.5.D1]`

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

*Resultado:* Los prospectos ven qué distingue a la entidad: la oferta se diferencia de la de otras entidades, dice lo mismo en el sitio, en la app, en la sucursal y en boca de cada ejecutivo, y lo que se le ofrece al cliente es lo que después se le aprueba.

- Las ofertas solo prometen lo que se puede aprobar: el monto, la tasa y el plazo que se ofrecen se validan contra la política de crédito vigente antes de decírselos al cliente. `[1.5.E3]`
- Se mide cuántas ofertas terminan aprobadas con condiciones distintas de las ofrecidas, y se corrige el origen. `[1.5.E201 · comprobable · hábito]`

**Óptimo.** La IA revisa contra la oferta vigente de cada producto todo lo que se le dice a cada prospecto, y el equipo valida lo que se sale.

- La IA revisa en tiempo real, contra la oferta vigente de cada producto —su mensaje, su tasa, su plazo, sus costos y sus requisitos—, lo que se les dice a los prospectos, lo escriba ella o el equipo; lo que se sale queda marcado en el sistema y el equipo lo valida. `[1.5.O1]`

*Se leen igual:* `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.F3`, `1.5.E2`.

#### 1.6 Precalificación y priorización

¿Cómo decide tu equipo a qué prospectos dedicarles tiempo antes de armar un expediente?

*Descripción:* Mide si el equipo decide a quién dedicarle tiempo con criterios escritos, según el cliente objetivo de cada producto.

*Costo de quedarse:* Tus ejecutivos arman expedientes completos de clientes que no iban a calificar, mientras los que sí califican esperan su turno y se van a otra entidad.

**Deficiente.** Se atiende a los prospectos por orden de llegada, y se arma el expediente antes de saber si califican.

- Se arma el expediente completo antes de saber si el cliente califica. `[1.6.D201 · evaluado]`

**Funcional.** Los prospectos se separan por los rasgos del cliente objetivo de cada producto y hay una definición escrita de quién precalifica que el equipo aplica antes de armar el expediente.

*Resultado:* El equipo deja de armar expedientes de quien no encaja con el cliente objetivo del producto y concentra el esfuerzo en los prospectos que sí encajan y cumplen la definición de prospecto precalificado.

- El equipo segmenta a los prospectos por los atributos del cliente objetivo antes de trabajarlos: en personas, ingreso, tipo de empleo o zona; en pymes, actividad, antigüedad o ventas. `[1.6.F1]`
- Hay una definición escrita de prospecto precalificado —las condiciones básicas de cada producto: ingreso, antigüedad, nivel de endeudamiento— y se aplica de forma consistente antes de armar el expediente. `[1.6.F2]`
- El esfuerzo se enfoca en los prospectos que encajan con el cliente objetivo del producto. `[1.6.F3]`
- Los rasgos del cliente objetivo de cada producto son campos del CRM y de los formularios de solicitud. `[1.6.F4]`
- Antes de ofrecerle un producto a quien ya es cliente, se revisa qué tiene con la entidad y cómo ha pagado. `[1.6.F201 · evaluado · hábito]`

**Eficiente.** La precalificación es automática, y hay clientes preaprobados a quienes ofrecerles sin esperar a que pregunten.

*Resultado:* Cada ejecutivo sabe cada mañana a quién contactar primero, quien no califica lo sabe enseguida, y los clientes que ya califican reciben la oferta sin tener que pedirla.

- Hay un puntaje comercial por reglas activo: un modelo que suma puntos por varios atributos —producto de interés, perfil, comportamiento— para decidir a quién contactar primero; no reemplaza la evaluación de crédito. `[1.6.E1]`
- La precalificación es automática: con los datos de la solicitud, el sistema dice si el cliente cumple las condiciones básicas del producto antes de que alguien le dedique tiempo. `[1.6.E201 · comprobable · requiere 1.6.F2]`
- Hay listas de clientes preaprobados por producto, armadas con su comportamiento, y se les ofrece sin esperar a que pregunten. `[1.6.E202 · comprobable · requiere 1.3.E3]`

**Óptimo.** La IA calcula a quién ofrecerle qué producto y cuándo, con todo lo que se sabe de cada cliente; el ejecutivo valida antes de ofrecerlo y, en los canales digitales, se ofrece dentro de los límites que fijó la entidad.

*Resultado:* La entidad sabe qué cliente atender, con qué producto y cuándo, con lo que saben Servicio y Marketing de cada uno, incluido dónde hay riesgo o espacio para ofrecer más.

- Un modelo de IA calcula para cada cliente qué producto le conviene y cuándo ofrecérselo, con su comportamiento y con lo que saben Servicio y Marketing de él; la sugerencia se ve en el CRM, y el ejecutivo la valida antes de ofrecerla o, en los canales digitales, se ofrece dentro de los límites que fijó la entidad. `[1.6.O201 · comprobable]`

*Se leen igual:* `1.6.D1`, `1.6.I1`, `1.6.I2`, `1.6.E2`, `1.6.E3`, `1.6.O1`, `1.6.O2`, `1.6.O3`, `1.6.O4`.

#### 1.7 Avance de la solicitud

¿Qué pasa con una solicitud que se queda esperando un documento, una aprobación o una respuesta del cliente?

*Descripción:* Mide si alguien detecta cuando una solicitud deja de avanzar y si hay una respuesta acordada para retomarla a tiempo; donde el cliente vuelve a contratar sin tener un producto vigente, también si se le busca cuando su próxima contratación se atrasa.

*Costo de quedarse:* Las solicitudes se enfrían esperando un documento o una firma: nadie ve cuáles dejaron de avanzar, y el cliente termina el trámite en otra entidad.

**Deficiente.** El ejecutivo está solo con sus solicitudes, y las que se abandonan en los canales digitales no las ve nadie.

- Las solicitudes que el cliente deja a medias en la web o en la app no las retoma nadie. `[1.7.D201 · comprobable · venta sin vendedor]`

**Funcional.** Ninguna solicitud se enfría en silencio: se detecta a tiempo y hay un paso acordado para retomarla.

*Resultado:* Las solicitudes que se traban —falta un documento, una firma o una respuesta— se detectan a tiempo y se retoman por más de un canal; donde la venta pasa por un ejecutivo, con material de venta común y con el líder actuando mientras todavía hay margen. La solicitud que el cliente dejó a medias en un canal digital no se pierde y, donde el cliente vuelve a contratar sin tener un producto vigente, su próxima contratación tampoco se deja al azar.

- Para cada etapa de la solicitud está definido cuánto tiempo sin avance la vuelve detenida; las detenidas —por un documento, una firma o una respuesta pendiente— se reconocen a tiempo y tienen un paso acordado para retomarlas, no la improvisación de cada ejecutivo. `[1.7.F1]`
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

- La IA detecta cuáles de las solicitudes que más importan se están trabando antes de que venza el plazo de su etapa y propone qué hacer —un recordatorio al cliente, una alerta a la gerencia o un aviso al ejecutivo—; el líder valida, y todo queda en el CRM. `[1.7.O1]`
- La IA decide el canal y el momento de cada seguimiento, cliente por cliente y según cómo responde, dentro de los límites que fijó la entidad; el equipo revisa los resultados, y lo que decide la IA queda registrado en el CRM. `[1.7.O2]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.D4`, `1.7.I1`, `1.7.I2`, `1.7.I3`, `1.7.I4`, `1.7.F3`, `1.7.F4`, `1.7.F5`, `1.7.E3`.

#### 1.8 Aprobadas, rechazadas y desistidas

¿Qué queda registrado cuando una solicitud no termina en un producto colocado?

*Descripción:* Mide si queda registrado por qué cada solicitud se rechaza, se desiste o se abandona, y si el equipo revisa las que se concretan y las que no para mejorar su proceso.

*Costo de quedarse:* No sabes por qué se caen las solicitudes: cada quien tiene su explicación —una tasa, un requisito, una demora— y sin un registro no hay cómo ver cuántas rechazó la entidad y cuántas dejó el cliente.

**Deficiente.** Nadie mira por qué una solicitud no se concreta.

**Inicial.** De las solicitudes que no se concretan se habla de vez en cuando, y la razón se anota a veces, a criterio de cada ejecutivo.

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

**Óptimo.** La IA analiza las llamadas con los prospectos, encuentra en qué etapa y por qué se caen las solicitudes y propone correcciones; el líder decide cuáles se aplican.

- La IA detecta en qué etapa y por qué se caen las solicitudes y propone el cambio, que se ve en el CRM; el líder decide si se aplica. `[1.8.O201 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.D2`, `1.8.I1`, `1.8.E2`, `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`, `1.8.O4`.

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

**Inicial.** Hay un calendario y algunas reuniones, pero se cumplen cuando se puede, las campañas dependen de quien las arma y cumplimiento normativo revisa a última hora.

- Cumplimiento normativo revisa las piezas sin un paso acordado en el proceso: le llegan a última hora, y la campaña se atrasa esperando su visto bueno o sale sin él. `[2.1.I201 · declarado]`

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y cada pieza pasa por cumplimiento normativo antes de salir.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y las campañas de cada producto siguen saliendo aunque cambie una persona, con la revisión de cumplimiento normativo hecha: el calendario y el proceso no viven en la cabeza de nadie, y el líder sabe en qué va cada una sin tener que preguntar.

- Toda pieza que habla de un producto pasa por la revisión de cumplimiento normativo antes de publicarse, y su aprobación queda registrada. `[2.1.F201 · declarado · hábito]`

**Eficiente.**

*Resultado:* Cada pieza sale revisada en su calidad, no solo aprobada por cumplimiento normativo, y el líder sabe dónde se desvía el proceso y corrige con datos, no de memoria.

- Cada pieza pasa por una revisión de calidad y una aprobación antes de publicarse, aparte de la revisión de cumplimiento normativo. `[2.1.E2]`

*Se leen igual:* `2.1.D1`, `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.I3`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide información de un producto en tu sitio o te escribe por WhatsApp o por el chat?

*Descripción:* Mide si las herramientas que paga la entidad se usan, si quien pide información de un producto llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien pide información de un crédito en tu sitio o por mensaje espera a que alguien lo pase al sistema y le conteste, o se pierde, y parte de las herramientas que pagas no se usa.

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

- Si la entidad atiende por un canal conversacional, agentes de IA responden lo que generan las campañas y mantienen la conversación con quien todavía no está listo para contratar el producto o hablar con un ejecutivo; lo que no pueden resolver pasa a una persona con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O2]`
- Lo que se calcula en el almacén central de datos de la entidad vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada contacto: la segmentación usa, por ejemplo, la rentabilidad real de cada cliente, calculada afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D1`, `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.F5`, `2.2.F9`, `2.2.E1`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.O1`.

#### 2.3 Datos

¿Cómo sabes cuántos prospectos entran, de dónde vienen y cuántos llegan a una solicitud?

*Descripción:* Mide si los datos de marketing son confiables: de dónde viene cada prospecto, en qué etapa está, si los reportes salen del sistema sin rehacerlos y si queda registrado quién aceptó recibir ofertas.

*Costo de quedarse:* No sabes de dónde viene cada prospecto ni cuántos llegan a una solicitud, cada reporte hay que rehacerlo a mano antes de creerle, y no tienes registrado quién te dio permiso para escribirle ofertas: te expones a una sanción.

**Funcional.**

*Resultado:* El líder sabe de dónde viene cada prospecto, con reportes que salen del sistema y no de una hoja armada a mano.

- Cada contacto creado desde la puesta en marcha del sistema —entre por un formulario, una conversación, la app o la contratación de un producto— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Las propiedades que describen al cliente objetivo de cada producto —en personas, ingreso, tipo de empleo o zona; en pymes, actividad, antigüedad o ventas— se piden en los formularios por donde entran los prospectos, también los de la app y la sucursal, y están completas en la mayoría de los registros. `[2.3.F2]`
- Los duplicados —la misma persona como cliente y como prospecto, o con dos correos— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —cuántos prospectos entran, de dónde vienen y cuántos llegan a una solicitud— salen del sistema sin armarlos a mano. `[2.3.F5]`
- Cuando se pide un teléfono u otro dato de contacto, se pregunta si la persona acepta que le escriban por ese canal para ofrecerle productos, y su respuesta queda registrada. `[2.3.F7]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada producto colocado, no solo cuál trajo el primer clic.

**Óptimo.**

*Resultado:* La atribución toma en cuenta todo lo que pasa en la entidad, no solo lo que ve Marketing, y los datos se mantienen confiables sin corregirlos a mano: el equipo solo valida las excepciones.

- Marketing se apoya en el almacén central de datos de la entidad, donde se junta la información de todas las herramientas, y sus reportes de atribución salen de esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.D1`, `2.3.D2`, `2.3.I1`, `2.3.I2`, `2.3.F6`, `2.3.E1`, `2.3.E2`, `2.3.E3`, `2.3.E4`, `2.3.O3`, `2.3.O4`, `2.3.O5`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing ante la gerencia por sus resultados?

*Descripción:* Mide si cada persona sabe qué le toca, si el equipo tiene metas y si las decisiones —como qué producto promover— y la rendición de cuentas se apoyan en números del sistema.

*Costo de quedarse:* Se promueve el producto del área que más presiona, no el que más conviene, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué publicar, qué pieza aprobar— espera a que lo resuelva la gerencia general. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —cuántos prospectos entran, de dónde vienen, cuántos llegan a una solicitud y cuántos quedan listos para pasar a un ejecutivo, donde la venta pasa por uno— y lo consulta al menos una vez por semana. `[2.4.F2]`

**Eficiente.** El liderazgo prepara a quien entra, acuerda reglas con el área comercial y con cumplimiento normativo, y escucha al equipo.

*Resultado:* Una persona nueva se integra rápido, Marketing trabaja con reglas acordadas con el área comercial y con Servicio en vez de discutir cada vez quién se hace cargo de un prospecto o de un cliente, y ninguna campaña se queda esperando a cumplimiento normativo sin que se sepa por qué.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —productos, marca y lo que la regulación exige en una pieza—; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo coordina con el área comercial —el traspaso de prospectos a los ejecutivos y a las sucursales, sus plazos y una reunión conjunta con fecha fija— y con Servicio. `[2.4.E3]`
- El acuerdo con cumplimiento normativo está escrito y se mide: qué piezas revisa, en cuánto tiempo responde y por qué devuelve una. `[2.4.E201 · comprobable]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la gerencia decide con lo que deja cada canal en el tiempo —la rentabilidad de los clientes que trae— frente a lo que cuesta.

- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —la rentabilidad de los clientes que trae— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F3`, `2.4.F4`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

#### 2.5 Marca y confianza

¿Qué guía a tu equipo cuando arma una pieza que anuncia un producto?

*Descripción:* Mide si la marca se ve y suena igual en todo lo que sale, si está escrito a quién le habla, si el sitio aparece en buscadores y si el cliente puede confiar: ve el costo de cada producto y sabe reconocer un fraude que imita a la entidad.

*Costo de quedarse:* Cada pieza se ve y suena distinta a la anterior, tus clientes no distinguen un mensaje tuyo de un fraude que te imita, y un anuncio que esconde el costo te trae reclamos y una sanción.

**Funcional.** La marca, la voz y los buyer personas están escritos y se usan, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes; cada anuncio muestra el costo y el cliente sabe reconocer un fraude que imita a la entidad.

*Resultado:* La marca se ve y suena igual en todo lo que sale, cada anuncio dice cuánto cuesta el producto, el cliente sabe reconocer cuándo le escribe la entidad y cuándo es un fraude, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Hay 2 o 3 buyer personas escritos —por ejemplo, el asalariado que busca su primera tarjeta o el dueño de una pyme que necesita capital de trabajo—, cada uno con su recorrido básico, etapa por etapa. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible —por ejemplo, de educación financiera, de seguridad o de historias de clientes—, en el blog, en la app o en el formato que use la entidad. `[2.5.F5]`
- La entidad le dice al cliente, en su sitio y en los demás canales que tenga, desde qué números, perfiles y correos le escribe, y qué nunca le va a pedir, como su clave o un código de verificación. `[2.5.F201 · comprobable]`
- Toda pieza que anuncia una tasa, una cuota o un beneficio muestra también el costo total, los requisitos y las condiciones que exige la regulación, o enlaza a donde están. `[2.5.F202 · comprobable]`

**Eficiente.**

*Resultado:* La entidad aparece cuando la gente busca cómo ahorrar, usar bien el crédito o financiar su pyme, tanto en buscadores como en asistentes de IA, con contenido pensado para cada segmento que importa, y cada reseña de sus clientes, buena o mala, recibe respuesta.

- Los segmentos que más valen, como la banca preferente o las pymes, tienen su propio buyer persona, escrito con detalle. `[2.5.E1]`
- Si el contenido propio se publica en el sitio, está organizado por temas —por ejemplo, ahorrar, usar bien el crédito o financiar una pyme—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- Se les pide una reseña pública a los clientes —por ejemplo, de la app en las tiendas o de la sucursal— después de contratar un producto o de hacer una gestión, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo. `[2.5.E5]`

**Óptimo.**

- Hay buyer personas para grupos muy chicos de clientes —o, en la banca de empresas, para cada cuenta importante—, no solo para los segmentos grandes. `[2.5.O1]`

*Se leen igual:* `2.5.D1`, `2.5.D2`, `2.5.D3`, `2.5.I1`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F4`, `2.5.E3`, `2.5.E4`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en la campaña que recibe un prospecto según su segmento: persona, pyme o cliente de planilla o nómina?

*Descripción:* Mide si cada segmento recibe campañas del producto que le sirve, o si todos reciben la misma oferta.

*Costo de quedarse:* Le ofreces la tarjeta a quien ya la tiene y el crédito de pyme a un asalariado: gastas en campañas que nadie aprovecha y cansas a tus clientes.

**Inicial.** La base se separa por datos sueltos, como la zona, el mensaje casi no cambia de un grupo a otro y las campañas le ofrecen un producto a quien ya lo tiene.

- Las campañas le ofrecen un producto a quien ya lo tiene. `[2.6.I201 · comprobable]`

**Funcional.** Hay segmentos escritos, piezas pensadas para cada uno, nadie recibe la oferta de un producto que ya tiene y, donde la venta pasa por un ejecutivo, criterios escritos para clasificar los prospectos.

*Resultado:* Cada segmento recibe la campaña del producto que le sirve, nadie recibe la oferta de lo que ya tiene y, donde la venta pasa por un ejecutivo, este recibe prospectos que Marketing ya clasificó con criterios escritos.

- Existen al menos 2 segmentos con criterios escritos según qué necesita o cómo decide cada grupo, no solo según dónde está: por ejemplo, el asalariado que busca su primera tarjeta o la pyme que necesita capital de trabajo. `[2.6.F1]`
- Existen criterios escritos de qué es un suscriptor, un prospecto y un prospecto listo para pasar a un ejecutivo, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios. `[2.6.F4]`
- Las campañas de un producto no le llegan a quien ya lo tiene, salvo que sean para él —un aumento de límite, un segundo crédito—: la lista se cruza con los productos de cada cliente antes de enviar. `[2.6.F201 · comprobable]`

**Eficiente.** Los segmentos y el puntaje de prospectos se arman solos, y el mensaje se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los prospectos con más probabilidad de hacer una solicitud se distinguen del resto: donde la venta pasa por un ejecutivo, él los recibe primero.

- Hay un puntaje de prospectos por reglas —distinto del puntaje de crédito—: un modelo que suma puntos por varios datos de cada persona, como su perfil o lo que hizo, y la clasifica al pasar un umbral —como prospecto listo para pasar a un ejecutivo, donde la venta pasa por uno—, y ese puntaje dispara las secuencias de nutrición. No es la clasificación de Funcional, que responde al valor de una propiedad, sin modelo de puntaje detrás. `[2.6.E3]`
- La segmentación usa datos de comportamiento —qué abrió, qué visitó, cómo usa sus productos—, no solo lo que la persona declaró. `[2.6.E4]`

*Se leen igual:* `2.6.D1`, `2.6.D2`, `2.6.I1`, `2.6.I2`, `2.6.F3`, `2.6.E1`, `2.6.E2`, `2.6.O1`, `2.6.O3`.

#### 2.7 Canales y Alcance

¿Cómo salen las campañas de tus productos por los canales que usas, también la app y la sucursal?

*Descripción:* Mide si los canales que la entidad eligió, también los propios, salen con regularidad, bajo un mismo plan, solo a quien dio su permiso y con un costo conocido.

*Costo de quedarse:* Tus campañas salen sueltas y a veces a quien no dio permiso: no sabes cuánto te cuesta cada prospecto, y te expones a una sanción.

**Inicial.**

- Cada canal va por su lado: no hay calendario común ni campaña que los atraviese. `[2.7.I3]`

**Funcional.** Los canales que la entidad eligió —también los propios, como la app o la sucursal— salen con regularidad, bajo un mismo plan y solo a quien dio su permiso.

*Resultado:* La campaña de un producto sale coordinada por todos los canales del plan —también los propios, como la app o la sucursal— en vez de esfuerzos sueltos, solo a quien aceptó recibirla, y el líder ve cuánto le cuesta cada prospecto según el canal del que venga.

- Si la pauta pagada es parte del plan de canales, hay al menos una campaña corriendo con presupuesto definido —de un producto o de la marca— en Google, Meta o el canal que corresponda a la entidad. `[2.7.F3]`
- Los canales que la entidad eligió en su plan siguen el mismo calendario y la misma campaña: la de un producto sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada prospecto —o cada producto colocado, donde el cliente lo contrata solo en los canales digitales— el último mes, al menos por canal. `[2.7.F6]`
- Las campañas solo le llegan a quien aceptó recibir ofertas por ese canal, y quien pide no recibir más deja de recibirlas. `[2.7.F201 · comprobable · requiere 2.3.F7]`
- Las campañas dirigidas a clientes salen también por los canales propios que tenga la entidad —la app, la banca en línea, las sucursales—, con el mismo mensaje y en las mismas fechas. `[2.7.F202 · declarado · hábito]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, y el presupuesto se mueve según lo que cuesta cada prospecto o cada producto colocado en cada canal, también el que se coloca en la sucursal o con un ejecutivo.

*Resultado:* La inversión se mueve hacia el canal que mejor rinde —medido por los productos que coloca, no solo por los prospectos que trae—, y los canales se refuerzan entre sí en vez de competir por el mismo contacto.

- Si las charlas en línea o los eventos son parte del plan de canales —por ejemplo, de educación financiera para pymes o para los empleados de una empresa que paga su planilla con la entidad—, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- Hay un programa de referidos activo: los clientes saben cómo recomendar un producto —una tarjeta, una cuenta—, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- Se sabe, por canal, cuánto costó cada producto colocado, contando también lo que se colocó en la sucursal o con un ejecutivo, no solo en los canales digitales. `[2.7.E201 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más retorna, dentro de los límites que fija el equipo; los clientes satisfechos traen clientes nuevos, y la entidad prueba canales nuevos sin esperar a ver qué hacen otras entidades.

*No aplican:* `2.7.E5`.

*Se leen igual:* `2.7.D1`, `2.7.D2`, `2.7.I1`, `2.7.I2`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.E1`, `2.7.E3`, `2.7.O1`, `2.7.O2`, `2.7.O4`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de la campaña de un producto cuando termina?

*Descripción:* Mide si cada campaña se evalúa por las solicitudes y los productos colocados que dejó, y si deja un aprendizaje.

*Costo de quedarse:* Repites las campañas de siempre porque nadie anota cuáles colocaron productos: cada una empieza de cero, sin saber qué dejó la anterior.

**Funcional.**

- Los resultados de cada campaña —los prospectos, las solicitudes o los productos colocados que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.D3`, `2.8.I1`, `2.8.I2`, `2.8.F3`, `2.8.E1`, `2.8.E2`, `2.8.E3`, `2.8.O2`, `2.8.O3`.

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
- Cada cliente tiene registrado quién responde por él —una persona o, si la cartera es tan grande que no se asigna por persona, como en la banca masiva, un equipo— y recibe un contacto de seguimiento a tiempo —en los momentos que fija el proceso de atención—, aunque no haya abierto casos; si responde un equipo, ese contacto puede ser un mensaje automático. `[3.1.F2]`
- Existe un proceso escrito para escalar los reclamos graves —un fraude, un cargo no reconocido— y los casos que quien atiende no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cada tipo de reclamo tiene escrito en el proceso el plazo de respuesta que fija el regulador. `[3.1.F201 · declarado]`
- Antes de atender una gestión sobre un producto, se verifica la identidad del cliente con los pasos que define el proceso, en cualquier canal, y queda registrado en el caso. `[3.1.F202 · comprobable · hábito]`

**Eficiente.**

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de caso, también los que no tienen un plazo del regulador; cada momento clave de la relación del cliente con la entidad tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de caso o prioridad, también para lo que el regulador no fija: las consultas y las gestiones. `[3.1.E1]`
- Hay playbooks de prevención —qué hacer cuando un cliente vuelve a reclamar por lo mismo— y, donde la relación es continua, también de retención y expansión: qué hacer cuando un cliente deja de usar su tarjeta o pide cancelar un producto, o cuando está listo para uno más y hay que pasárselo al área comercial. `[3.1.E3]`
- El recorrido del cliente está definido de punta a punta, con sus momentos clave —la activación, el primer uso y, si los hay, la renovación o el vencimiento— y un responsable y un estándar para cada uno. `[3.1.E4]`

*Se leen igual:* `3.1.D2`, `3.1.I2`, `3.1.I3`, `3.1.F3`, `3.1.F5`, `3.1.F6`, `3.1.E5`, `3.1.O1`, `3.1.O3`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega un caso nuevo —un reclamo, una gestión— al sistema y a la persona que lo tiene que atender, entre por la sucursal, el teléfono o la app?

*Descripción:* Mide si cada caso, venga de la sucursal, el teléfono o la app, queda en el sistema y llega solo a quien lo atiende, y cuánto de la atención se automatiza.

*Costo de quedarse:* Tu equipo reparte y sigue los casos a mano, y se pierden entre la sucursal, el teléfono y WhatsApp: el cliente tiene que insistir para que lo atiendan.

**Funcional.**

- Al entrar un caso, el sistema lo asigna solo según una regla simple —por tipo, por producto o por sucursal—; los avisos de cambio de estado llegan a quien los necesita. `[3.2.F5]`

**Eficiente.** Los plazos se vigilan solos y los casos que están por vencer suben solos, el cliente sigue sus casos y hace sus gestiones más comunes en la app, y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer —un reclamo cerca del plazo del regulador, por ejemplo— suben solos a quien los tiene que resolver; el cliente ve y abre sus casos y hace sus gestiones más comunes en la app, sin esperar a que lo atienda una persona, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién— y, si el equipo tiene más de un agente, las conversaciones y los casos se enrutan por varias condiciones, como el tipo de caso, el producto o el segmento del cliente. `[3.2.E1]`
- En la app o la banca en línea, el cliente ve sus casos y abre uno nuevo —un reclamo, una consulta—, y hay base de conocimiento interna y pública. `[3.2.E2]`
- El cliente hace solo, en la app o la banca en línea, las gestiones más comunes —descargar su estado de cuenta, pedir una constancia—, sin ir a la sucursal ni llamar. `[3.2.E201 · comprobable]`

**Óptimo.** Un agente de IA resuelve casos y le pasa a una persona lo que no puede, y lo que la entidad calcula de cada cliente —como qué tan probable es que se vaya— aparece en su ficha.

*Resultado:* Buena parte de los casos se resuelve sin que intervenga una persona, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la entidad sabe de ese cliente a la vista.

- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, qué tan probable es que el cliente se vaya. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.D2`, `3.2.I2`, `3.2.F4`, `3.2.F6`, `3.2.F8`, `3.2.E3`, `3.2.E4`, `3.2.E5`, `3.2.O1`.

#### 3.3 Datos

¿De dónde sacas qué reclamos, consultas y gestiones te llegan, cuántos y de qué clientes?

*Descripción:* Mide si los datos de cada cliente —sus productos y sus casos— están completos y ordenados para atender, decidir y responderle al regulador sin reconstruirlos.

*Costo de quedarse:* Cada vez que el cliente llama tiene que volver a explicar qué producto tiene y qué pasó, y no puedes demostrarle al regulador cuántos reclamos respondiste dentro del plazo.

**Funcional.** La historia y los productos de cada cliente están a la vista, cada caso tiene su tipo y su motivo, y se sabe cuántos reclamos se respondieron dentro del plazo del regulador.

*Resultado:* El líder sabe qué tipo de casos llegan y cuántos, y cuántos reclamos se respondieron dentro del plazo que fija el regulador; quien atiende tiene la historia del cliente en segundos.

- La ficha del cliente muestra los productos que tiene contratados y su valor para la entidad, no solo sus casos. `[3.3.F2]`
- Las propiedades clave del cliente —qué productos tiene y desde cuándo es cliente— están pobladas en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene su tipo —reclamo, consulta o gestión— y su motivo, elegidos de una lista definida. `[3.3.F4]`
- Se sabe, con un reporte que sale del sistema, cuántos reclamos se respondieron dentro del plazo que fija el regulador y cuáles se vencieron. `[3.3.F201 · comprobable · requiere 3.1.F201]`

**Eficiente.** Se miden tiempos y satisfacción, y la información del cliente se une con la del área comercial.

*Resultado:* La entidad sabe qué tan rápido y qué tan bien atiende y cuánto tarda un cliente nuevo en usar lo que contrató, con la satisfacción medida y no supuesta; donde el cliente sigue con la entidad, sabe además qué tan sano está cada uno.

- La información del cliente está unificada entre Servicio y el área comercial: los dos ven los mismos datos del cliente, en un mismo sistema o en sistemas conectados. `[3.3.E3]`
- Se mide cuánto tarda cada cliente nuevo en usar lo que contrató: el tiempo desde la apertura hasta su primer uso, como la primera compra con su tarjeta o el primer depósito en su cuenta. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada cliente —distinto de su riesgo de crédito—, que combina sus casos abiertos, su satisfacción y, si tiene productos de uso continuo como una tarjeta o una cuenta, cómo los usa. `[3.3.E5]`

**Óptimo.** Los datos se mantienen al día solos y, donde el cliente sigue con la entidad, un modelo de salud anticipa quién se puede ir antes de que lo diga.

*Resultado:* La entidad anticipa lo que va a pasar con sus clientes, con datos que se mantienen al día solos, y, donde el cliente sigue con la entidad, sabe quién se puede ir y quién está logrando lo que buscaba con sus productos antes de que ellos mismos lo digan.

- Un modelo predictivo de salud, distinto del riesgo de crédito, calcula para cada cliente qué tan probable es que se vaya y si está logrando lo que buscaba con sus productos, a partir de su experiencia y de sus resultados; el puntaje se ve en su ficha y el responsable de cada cliente revisa a los que el modelo marca. `[3.3.O1]`
- Servicio se apoya en el almacén central de datos de la entidad, con reglas claras de quién accede y cómo se mantiene, para anticipar qué clientes se pueden ir. `[3.3.O2]`

*Se leen igual:* `3.3.D1`, `3.3.D2`, `3.3.I1`, `3.3.I2`, `3.3.F1`, `3.3.F5`, `3.3.F6`, `3.3.E1`, `3.3.E2`, `3.3.O3`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el equipo va al día con sus casos y dentro de los plazos del regulador?

*Descripción:* Mide si cada persona sabe qué le toca, y si el líder sigue con datos el avance y los plazos de los reclamos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien qué le toca a quién, y la gerencia se entera de un reclamo vencido cuando el cliente ya fue al regulador.

**Deficiente.**

- Nadie tiene claro qué le toca: entre la bienvenida de los clientes nuevos, la atención de los casos y el acompañamiento de los clientes clave, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si el equipo va al día o si hay reclamos cerca de vencer su plazo.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, reclamos cerca del plazo que fija el regulador, volumen, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por sus plazos, el líder prepara a quien entra y acuerda con el área comercial y con las áreas que resuelven parte de los casos qué recibe y qué devuelve cada una.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, cada cliente nuevo llega del área comercial con lo que busca con su producto, las áreas que resuelven parte de los casos cumplen lo acordado y, donde el cliente vuelve a contratar sin tener un producto vigente, el área comercial se entera cuando uno se puede estar yendo.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —productos, procedimientos de seguridad y reclamos—; no se le entrena de memoria. `[3.4.E2]`
- El líder de Servicio acuerda con el área comercial qué trae cada cliente nuevo —lo que busca con su producto— y el acuerdo se cumple: cada uno llega con eso y, si el cliente vuelve a contratar sin tener un producto vigente, Servicio le avisa al área comercial cuando se puede estar yendo. `[3.4.E4]`
- El acuerdo con las áreas que resuelven parte de los casos —tarjetas, fraude, operaciones— está escrito y se mide: qué reciben, en cuánto tiempo lo resuelven y por qué devuelven un caso. `[3.4.E201 · comprobable]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.E1`, `3.4.O1`, `3.4.O2`, `3.4.O3`, `3.4.O4`.

#### 3.5 Consistencia de Atención

¿En qué se apoya tu equipo para que un reclamo se resuelva igual en cualquier sucursal o canal, lo atienda quien lo atienda?

*Descripción:* Mide si el equipo conoce a sus tipos de cliente y da la misma respuesta en cualquier sucursal o canal, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo reclamo se acepta en una sucursal y se rechaza en otra: el cliente lo nota, desconfía y lo cuenta.

**Funcional.** Los tipos de cliente están escritos, cada cliente nuevo arranca con una bienvenida definida, el equipo tiene respuestas guardadas para lo frecuente y cada tipo de reclamo tiene escritos sus criterios de resolución.

*Resultado:* El equipo sabe qué tipos de cliente atiende y qué espera cada uno, el cliente nuevo arranca con una bienvenida clara hasta activar y usar su producto, y en cualquier sucursal o canal quien atiende tiene a mano las mismas respuestas y los mismos criterios para resolver un reclamo.

- Existe un proceso documentado de bienvenida del cliente nuevo, con un resultado definido que debe alcanzar al terminarlo: por ejemplo, que active su tarjeta y la use por primera vez. `[3.5.F2]`
- Existe un documento simple con los tipos de cliente que atiende el área —por ejemplo, personas, pymes y banca preferente—, qué necesita cada uno, qué espera del servicio y cuáles se consideran clientes clave, consultable por cualquier agente. `[3.5.F4]`
- Cada tipo de reclamo tiene escritos sus criterios de resolución —cuándo se devuelve un cobro, cuándo procede un cargo no reconocido—, consultables por quien atiende, en la sucursal o en el centro de contacto. `[3.5.F201 · declarado]`

*Se leen igual:* `3.5.D1`, `3.5.I1`, `3.5.F1`, `3.5.F3`, `3.5.E1`, `3.5.E2`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de Clientes

¿Cómo se decide qué se atiende primero: un fraude, el caso de un cliente preferente o una consulta simple?

*Descripción:* Mide si un fraude se atiende antes que una consulta, y si cada cliente recibe la atención que le corresponde.

*Costo de quedarse:* Tu cliente preferente espera en la misma fila que todos, y un cargo no reconocido se atiende después de una consulta simple.

**Funcional.**

*Resultado:* Un fraude o un cargo no reconocido se atiende primero, cada tipo de cliente recibe la atención que le corresponde, y quien atiende no tiene que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja; un fraude o un cargo no reconocido, por ejemplo, es urgente— y los agentes la respetan. `[3.6.F1]`
- Está escrito qué atención recibe cada tipo de cliente —por ejemplo, por qué canal y quién atiende a la banca preferente, a las pymes y a las personas—, y el equipo la aplica. `[3.6.F2]`
- El agente usa la ficha del cliente —sus productos y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.**

*Resultado:* La atención cambia según el momento en que está cada cliente y, donde el cliente sigue con la entidad, cada cliente de banca preferente y cada pyme importante tiene un responsable que lo conoce, y el resto de la cartera no queda sola.

- Hay un modelo de atención por segmento: cada cliente clave —por ejemplo, de banca preferente o una pyme importante— tiene un responsable dedicado que lo conoce, y el resto de la cartera recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1]`
- Los clientes se segmentan para acciones diferenciadas según el momento de su relación: los que siguen con la entidad, sanos, en riesgo de irse o con potencial para un producto más; los de una sola operación, recién desembolsados, en su primer pago o listos para recomendar. `[3.6.E2]`

**Óptimo.**

*Resultado:* Cada cliente recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que ya habló al contratar.

- En la app o la banca en línea, cada cliente ve lo que corresponde a su tipo, a sus productos y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- Cada cliente se atiende con el contexto de cómo llegó —lo que se le ofreció al contratar y el segmento del que viene—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.D1`, `3.6.I1`, `3.6.O2`.

#### 3.7 Proactividad

¿Cómo te enteras de que un cliente tiene un problema con su tarjeta, su cuenta o su crédito?

*Descripción:* Mide si el servicio avisa antes de cada cobro o vencimiento y actúa antes de que el cliente se vaya.

*Costo de quedarse:* Te enteras de que un cliente está mal cuando el problema ya creció o cuando ya se llevó su dinero a otra entidad, y un cobro sin aviso te trae un reclamo.

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
- Ningún caso del cliente se pierde entre áreas: si lo resuelve otra área —tarjetas, operaciones, cobranza—, también queda en el sistema; y hay alertas automáticas, que le llegan a quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica —un vencimiento, un cobro, la renovación de una tarjeta— o, si se piden calificaciones, cuando un cliente califica mal. `[3.7.E4]`
- Cada cliente recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su relación —un cobro, el vencimiento de un certificado, la renovación de su tarjeta, un cambio en las condiciones de su producto—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`
- Los clientes que dan señales de irse —dejan de usar su tarjeta, bajan su saldo, reclaman más— reciben una acción de retención antes de decidir irse. `[3.7.E201 · comprobable · hábito · relación continua]`

**Óptimo.**

*Resultado:* La mayoría de los problemas que detecta el sistema se resuelven antes de que el cliente los note, y cada cliente siente que la entidad se adelanta a lo que necesita y lo sorprende para bien.

- Los clientes reciben, sin pedirlos, detalles pensados para deleitarlos —la exoneración de una comisión, un beneficio en su aniversario como cliente—, elegidos según la historia de cada cliente y el momento de su relación, y en el sistema queda qué recibió cada uno. `[3.7.O4]`

*No aplican:* `3.7.E2`.

*Se leen igual:* `3.7.D1`, `3.7.D2`, `3.7.I1`, `3.7.O1`, `3.7.O2`, `3.7.O3`.

#### 3.8 Autoservicio

¿Qué pasa con las preguntas que tus clientes hacen una y otra vez, como cuánto cuesta una gestión o qué hacer si pierden su tarjeta?

*Descripción:* Mide si el equipo puede atender a más clientes sin crecer al mismo ritmo, gracias a las respuestas publicadas, al bloqueo de la tarjeta sin esperar y a lo que se aprende de los casos.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas una y otra vez, y quien perdió su tarjeta tiene que esperar en la línea para bloquearla.

**Inicial.** Hay algunas respuestas publicadas o un chatbot de menú, pero lo que más preguntan los clientes todavía no tiene respuesta publicada, y para bloquear una tarjeta hay que esperar a una persona.

- Para bloquear una tarjeta, el cliente tiene que llamar y esperar a que lo atienda una persona. `[3.8.I201 · comprobable]`

**Funcional.** Las preguntas más frecuentes de los clientes tienen respuesta publicada y, si la entidad emite tarjetas, el cliente bloquea la suya sin esperar a nadie.

*Resultado:* El cliente puede consultar por su cuenta la respuesta a las preguntas de siempre y, si tiene tarjeta, bloquearla al instante, a cualquier hora; quien atiende remite a la respuesta publicada en vez de volver a escribirla.

- Las diez preguntas que más se repitieron en el último trimestre —o todas, si son menos— tienen una respuesta publicada que el cliente puede leer por su cuenta: por ejemplo, cómo activar una tarjeta, cuánto cuesta una gestión o qué hacer si la pierde. `[3.8.F1]`
- Si la entidad emite tarjetas, el cliente puede bloquear la suya al instante y a cualquier hora —en la app o por teléfono—, sin esperar a que lo atienda una persona. `[3.8.F202 · comprobable]`

**Eficiente.**

*Resultado:* La entidad puede sumar clientes sin sumar personas en la misma proporción, porque buena parte de lo que preguntan se resuelve sin abrir un caso.

- Al menos una vez por trimestre se revisan los reclamos y los demás casos que se repiten y, donde la relación es continua, las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2]`

*Se leen igual:* `3.8.D1`, `3.8.D2`, `3.8.I1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E3`, `3.8.O1`, `3.8.O2`, `3.8.O3`, `3.8.O4`.

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
- Hay un proceso de admisión escrito y una cadencia de contacto definida —cuántos intentos y en cuántos días—, y la cadencia se cumple con la mayoría de los interesados nuevos. `[1.1.F4]`
- La reunión de seguimiento de admisiones se hace en una fecha fija, cada semana o cada quince días. `[1.1.F5]`
- Cualquier asesor trabaja en el CRM, no en hojas ni notas aparte: lo abre para ver qué le toca hacer, no solo para cargar lo que ya hizo. `[1.1.F6]`
- Cada período de matrícula tiene su calendario escrito antes de empezar —apertura, fechas límite y cierre—, y el equipo trabaja con él. `[1.1.F301 · declarado · hábito]`

**Eficiente.** El líder comprueba con datos que el proceso de admisión se cumple y, donde hay asesores de admisiones, todos siguen un método de asesoría y guías escritas.

*Resultado:* El líder sabe dónde se desvía el proceso de admisión y lo corrige con datos, no de memoria; donde hay asesores de admisiones, además, todos asesoran con un mismo método.

- Hay una metodología de asesoría formal en uso —una conocida, como SPIN o BANT, o una equivalente escrita por la institución— con la que el asesor indaga qué busca el aspirante y qué lo frena antes de recomendarle un programa. `[1.1.E1]`
- Existen guías de indagación, de calificación —si el aspirante cumple los requisitos y quiere ingresar en el período— y de manejo de objeciones —costo, tiempo, modalidad— que el equipo usa. `[1.1.E2]`

**Óptimo.**

*Resultado:* Nadie tiene que vigilar a mano que el proceso se cumpla: la IA señala a los aspirantes cuya admisión se desvía, el líder decide qué se corrige y el equipo dedica su tiempo a probar mejoras en pilotos cortos.

- La IA detecta a los aspirantes cuya admisión se sale del proceso, los marca en el CRM y se los señala al líder y a quien corresponde; el líder decide qué se corrige. `[1.1.O1]`
- La mayoría de las admisiones siguen el proceso como está escrito sin que nadie lo revise a mano, y el CRM lo muestra. `[1.1.O2]`

*Se leen igual:* `1.1.E3`, `1.1.O3`.

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
- Hay secuencias de contacto de varios pasos que cambian según cómo responde el aspirante —si leyó, hizo clic o contestó—, y los interesados se asignan por varias condiciones o por capacidad; si el equipo atiende por un canal conversacional, las conversaciones también, con control de quién ve y responde cada una. `[1.2.E2]`
- Si la institución lleva lo académico o los pagos en sistemas aparte del CRM, el CRM está conectado con ellos. `[1.2.E3]`
- Hay tableros en tiempo real de la conversión por etapa y por asesor —o por canal, donde el aspirante se matricula solo— y, si el equipo atiende por un canal conversacional, de las conversaciones: cuánto tarda la primera respuesta y cuántas quedan sin seguimiento. `[1.2.E4]`
- El equipo usa la IA en su trabajo diario —para redactar, resumir conversaciones o preparar una reunión—, y la IA trabaja con el contexto de los aspirantes y los estudiantes. `[1.2.E5]`
- El aspirante entrega sus documentos y firma su matrícula de forma digital, sin tener que ir a la sede. `[1.2.E301 · comprobable]`

**Óptimo.** La IA orienta, precalifica, agenda y calcula quién se va a matricular; el asesor valida y se queda con las conversaciones que deciden la matrícula.

*Resultado:* El asesor dedica su tiempo a las conversaciones que deciden la matrícula: los agentes de IA orientan y agendan, y él trabaja con la predicción de quién se va a matricular y con respuestas sugeridas para cada conversación.

- La IA calcula la probabilidad de que cada aspirante se matricule y propone respuestas según el contexto de cada conversación; las dos cosas se ven en el CRM y el asesor decide qué usar. `[1.2.O1]`
- Si el equipo atiende por un canal conversacional, agentes de IA orientan ahí a los interesados, los precalifican con la definición de aspirante calificado y agendan citas a cualquier hora; le pasan al asesor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que precalificaron. `[1.2.O2]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al CRM: el asesor ve en la ficha, por ejemplo, cuánto suelen permanecer los estudiantes con el perfil de ese aspirante, sin salir de su herramienta. `[1.2.O3]`

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
- La documentación sobre el perfil de estudiante de cada programa no se deja envejecer. `[1.3.F5]`
- La definición de aspirante calificado no se deja envejecer. `[1.3.F6]`
- La documentación de lo que ofrece cada programa —por ejemplo, qué formación da— no se deja envejecer. `[1.3.F7]`
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

*Se leen igual:* `1.3.I1`, `1.3.F2`, `1.3.E2`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder de admisiones, cada semana, qué programa y qué asesor van bien y cuáles necesitan ayuda?

*Descripción:* Mide si cada asesor tiene un rol por escrito, si cada programa y cada asesor tienen una meta escrita, y si el líder sigue los números y pide cuentas con datos.

*Costo de quedarse:* La dirección se entera de que un programa no abre cuando ya cerró la matrícula: no vio antes qué programa iba atrasado, ni por qué.

**Deficiente.**

- Cada asesor trabaja sobre la marcha, sin un rol ni responsabilidades claras. `[1.4.D1]`

**Funcional.** Cada asesor tiene un rol por escrito, cada programa y cada asesor tienen una meta escrita, el líder sigue un tablero cada semana y en la reunión de seguimiento de admisiones cada quien rinde cuentas.

*Resultado:* Cada asesor sabe qué se espera de él, y el líder sabe cada semana qué programa va bien y cuál necesita ayuda, antes de que cierre la matrícula.

- El líder tiene un tablero con 4 a 6 métricas clave —interesados, solicitudes, admitidos, matriculados, avance contra la meta de cada programa— y lo consulta al menos una vez por semana. `[1.4.F2]`
- En la reunión de seguimiento de admisiones se rinde cuentas: cada quien responde por lo que se comprometió en la anterior. `[1.4.F3]`
- Cada programa y cada asesor —y el canal en línea, donde el aspirante se matricula solo— tienen una meta de matrícula escrita, con una cantidad o un monto y un plazo, y su avance se reporta en una fecha fija, al menos una vez al mes. `[1.4.F4]`
- El líder ve en reportes automáticos qué tareas cumplió cada asesor y cuáles tiene pendientes. `[1.4.F5]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda plazos con las áreas académica y financiera y, si Marketing pasa interesados, las reglas del traspaso.

*Resultado:* Un asesor nuevo produce más rápido, las respuestas de lo académico y de lo financiero llegan en el plazo acordado, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —programas, costos, becas y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- Si Marketing le pasa interesados a Admisiones, el SLA de traspaso está escrito y se sigue en el sistema: en cuánto tiempo se responde, qué calidad se espera del interesado y por qué se puede rechazar. `[1.4.E3]`
- Lo que el equipo señala que no funciona —del proceso, del CRM o del material de admisión— se anota, se revisa y se le responde a quien lo dijo. `[1.4.E4]`
- El acuerdo con las áreas académica y financiera está escrito y se mide: en cuánto tiempo se resuelve una admisión, una convalidación o una beca. `[1.4.E301 · comprobable]`

**Óptimo.** La dirección decide con números de fondo, el líder y el equipo eligen cada trimestre qué probar en admisiones, y está por escrito quién valida lo que hace la IA y qué puede decidir sola.

*Resultado:* La dirección decide dónde invertir con números de fondo: qué programa y qué canal dejan más margen, qué cohorte permanece más y qué asesor aporta más.

- Las decisiones de la dirección usan números de fondo: cuánto margen deja cada programa y cada canal, cuánto permanece cada cohorte y cuánto aporta cada asesor. `[1.4.O1]`
- Al menos una vez por trimestre, el líder y el equipo se reúnen a decidir qué probar en admisiones y revisan cómo les fue con lo que probaron antes. `[1.4.O2]`
- Hay responsables de validar lo que hace la IA en admisiones, y lo que puede decidir sola está por escrito. `[1.4.O3]`

*Se leen igual:* `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`.

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

*Se leen igual:* `1.5.E2`.

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
- Hay una definición escrita de aspirante calificado —los criterios para que un asesor lo trabaje: cumple los requisitos del programa y quiere ingresar en el período— y se aplica de forma consistente. `[1.6.F2]`
- El esfuerzo se enfoca en los aspirantes que encajan con el perfil de estudiante del programa. `[1.6.F3]`
- Los rasgos del perfil de estudiante de cada programa son campos del CRM y de los formularios de interés y de solicitud. `[1.6.F4]`

**Eficiente.** Los aspirantes se ordenan con un puntaje que suma varios rasgos; los colegios, las empresas o los segmentos prioritarios están en una lista escrita, y cada segmento recibe su propio mensaje.

*Resultado:* Cada asesor sabe cada mañana a quién contactar primero, y los colegios, las empresas y los segmentos que más matrícula traen se trabajan de forma deliberada.

- Hay un puntaje de aspirantes por reglas activo: un modelo que suma puntos por varios atributos —programa, requisitos cumplidos, interacción, cercanía del período—, no una regla sobre una propiedad. `[1.6.E1]`
- Los colegios, las empresas o los segmentos prioritarios están en una lista escrita. `[1.6.E2]`
- Los asesores usan mensajes y plantillas distintos para cada segmento de aspirantes, por ejemplo según el programa que les interesa. `[1.6.E3]`

**Óptimo.** La IA decide a qué aspirante atender y qué hacer con él, con todo lo que se sabe de cada uno, y el asesor valida.

*Resultado:* El asesor sabe a qué aspirante atender, qué hacer y cuándo, con lo que saben Servicio y Marketing de cada uno.

- Agentes de IA analizan todo lo que se sabe de cada aspirante y deciden la siguiente mejor acción, que el asesor ve en el CRM y valida antes de ejecutarla. `[1.6.O1]`
- Si en la decisión participan varias personas —el aspirante y su familia o su empresa—, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el asesor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3]`
- La priorización usa señales de Servicio y de Marketing —qué estudiantes siguen con otro programa, recomiendan la institución o dejan sus estudios— para decidir qué perfiles perseguir. `[1.6.O4]`

*Se leen igual:* `1.6.O2`.

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

- Para cada etapa de la admisión está definido cuánto tiempo sin avance vuelve detenido a un aspirante —sin respuesta, sin documentos o sin pago—; los detenidos se reconocen a tiempo y tienen un paso acordado para retomarlos, no la improvisación de cada asesor. `[1.7.F1]`
- Para retomar a los aspirantes detenidos se usan al menos dos canales, por ejemplo correo y llamada. `[1.7.F2]`
- El líder repasa a los aspirantes detenidos en cada reunión de seguimiento de admisiones y acuerda qué hacer con cada uno, sin esperar al cierre de la matrícula. `[1.7.F3]`
- Hay material de admisión estandarizado —plan de estudios, testimonios, simulador de costos— que ayuda al aspirante a decidir su matrícula. `[1.7.F4]`
- Los estudiantes que ya deberían haberse inscrito en un curso siguiente, según el plazo que define el proceso, se reconocen a tiempo y reciben un recordatorio o un incentivo, sin esperar a que vuelvan solos. `[1.7.F5]`
- Todo aspirante admitido que no se ha matriculado recibe seguimiento hasta que se matricula o dice que no. `[1.7.F301 · comprobable · hábito]`
- Las solicitudes que el aspirante deja a medias en línea reciben un recordatorio o una llamada dentro del plazo acordado. `[1.7.F302 · comprobable · hábito · venta sin vendedor · requiere 1.2.F302]`

**Eficiente.** El seguimiento combina varios canales, el sistema le avisa al líder de lo que se traba y quien no ingresó este período sigue en nutrición para el siguiente.

*Resultado:* Ningún aspirante espera a la reunión para recibir ayuda, quien no ingresó este período vuelve a recibir la invitación para el siguiente, y se sabe cuántos de los que se enfrían se recuperan.

- El seguimiento de los aspirantes que se enfrían combina al menos tres canales —por ejemplo, correo, llamada y el canal conversacional— en una secuencia definida. `[1.7.E1]`
- Los aspirantes que no ingresan este período no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven al asesor cuando se acerca el siguiente o muestran interés. `[1.7.E2]`
- El material de admisión está en una biblioteca central, no en la computadora de cada asesor. `[1.7.E3]`
- Cuando un aspirante lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántos admitidos no se matriculan y cuántos aspirantes detenidos se recuperan, por programa. `[1.7.E301 · comprobable]`

**Óptimo.** La IA detecta qué aspirantes están por abandonar y decide el canal y el momento de cada seguimiento antes de que cierre la matrícula; el equipo valida.

*Resultado:* Los aspirantes con más posibilidades reciben ayuda justo cuando la necesitan: la IA detecta cuándo alguien deja de avanzar y propone a quién movilizar.

- La IA detecta qué aspirantes con más posibilidades están por abandonar el proceso antes de que venza su plazo y propone a quién movilizar o qué mensaje enviar; el líder valida, y todo queda en el CRM. `[1.7.O1]`
- La IA decide el canal y el momento de cada seguimiento, aspirante por aspirante y según cómo responde, dentro de los límites que fijó el equipo; el equipo revisa los resultados, y lo que decide la IA queda registrado en el CRM. `[1.7.O2]`

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
- La IA propone correcciones a las guías de asesoría a partir de lo que encuentra en las llamadas, y el líder decide cuáles se aplican; en el sistema queda cada propuesta y lo que se decidió con ella. `[1.8.O2]`
- La dirección ajusta la estrategia de admisiones con lo que muestran los datos de qué funciona. `[1.8.O3]`
- La IA detecta en qué paso y por qué se caen los aspirantes y propone qué cambiar; lo que propone se ve en el CRM y el líder decide qué se aplica. `[1.8.O301 · comprobable]`

*Se leen igual:* `1.8.E2`, `1.8.O4`.

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

*Se leen igual:* `2.1.D2`, `2.1.I2`, `2.1.I3`, `2.1.F2`, `2.1.F3`, `2.1.F4`, `2.1.F5`, `2.1.F6`, `2.1.E2`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

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

- Si la institución atiende por un canal conversacional, agentes de IA responden lo que generan las campañas y siguen la conversación con quien todavía no está listo para matricularse —o para hablar con un asesor de admisiones, donde los hay—; lo que no pueden resolver pasa a una persona del equipo con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O2]`
- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada interesado: la segmentación usa, por ejemplo, cuánto permanece cada perfil de estudiante, calculado con lo académico y lo financiero. `[2.2.O3]`

*Se leen igual:* `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F5`, `2.2.F9`, `2.2.E2`, `2.2.E6`, `2.2.O1`.

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
- Las propiedades que describen el perfil de estudiante de cada programa —programa de interés, nivel de estudios, colegio o empresa de donde viene y modalidad que busca— se piden en los formularios por donde entran los interesados —o, si no hay formularios, donde se capturan sus datos, como una feria— y están completas en la mayoría de los registros. `[2.3.F2]`
- Los duplicados —el mismo interesado que se registra en varias ferias o formularios— están bajo control: se revisan y se unen al menos una vez por trimestre, a mano o de forma automática, y no distorsionan los reportes. `[2.3.F3]`
- Los reportes básicos —cuántos interesados entran, de dónde vienen y cuántos llegan a la solicitud o a la matrícula— salen del sistema sin armarlos a mano. `[2.3.F5]`

**Eficiente.** Los datos se completan solos, los duplicados se unen solos y se sabe qué aportó cada canal a cada matrícula.

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada matrícula, no solo cuál trajo el primer clic.

- La atribución está configurada para repartir el mérito entre todos los puntos de contacto, no solo el primero o el último, e incluye todos los canales —también las ferias, las visitas y el conversacional, si se usa—: se sabe cuánto ingreso deja cada uno en matrículas. `[2.3.E2]`

**Óptimo.**

*Resultado:* La atribución toma en cuenta todo lo que pasa en la institución —admisiones, lo académico y los pagos—, no solo lo que ve Marketing, y los datos se mantienen confiables sin corregirlos a mano: el equipo solo valida las excepciones.

- Marketing se apoya en el almacén central de datos de la institución, donde se junta la información de todos sus sistemas —admisiones, lo académico y los pagos—, y sus reportes de atribución salen de esa vista completa. `[2.3.O1]`

*Se leen igual:* `2.3.D2`, `2.3.F6`, `2.3.F7`, `2.3.E1`, `2.3.E3`, `2.3.E4`, `2.3.O3`, `2.3.O4`, `2.3.O5`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los interesados y las solicitudes de cada período?

*Descripción:* Mide si cada persona del equipo sabe qué le toca, si hay metas de interesados y solicitudes, y si el equipo decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué programa se empuja se decide por costumbre o por quien insiste más, y nadie responde por una meta: el equipo no sabe cuántos interesados y solicitudes se esperan de él en cada período.

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué publicar, qué pieza aprobar— espera a que lo resuelva la rectoría o la dirección general. `[2.4.I1]`

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —cuántos interesados entran por programa, de dónde vienen, cuántos llegan a la solicitud y, donde hay asesores de admisiones, cuántos llegan a MQL— y lo consulta al menos una vez por semana. `[2.4.F2]`
- El equipo tiene metas mensuales o trimestrales —interesados y solicitudes por programa—, y en la reunión de resultados rinde cuentas por ellas. `[2.4.F3]`
- Las decisiones sobre qué programas empujar y en qué enfocar cada campaña citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.** El liderazgo prepara a quien entra, escucha al equipo y, donde hay asesores de admisiones, acuerda reglas con Admisiones y con Servicio.

*Resultado:* Una persona nueva se integra rápido y, donde hay asesores de admisiones, Marketing trabaja con reglas acordadas con Admisiones y con Servicio en vez de discutir cada vez quién se hace cargo de un aspirante o de un estudiante.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —la marca, los programas y las herramientas—; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo coordina con Admisiones —el traspaso de interesados, los SLA y una reunión conjunta con fecha fija— y con Servicio. `[2.4.E3]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide según lo que dejan con el tiempo los estudiantes que trae cada canal, frente a lo que cuesta traerlos.

- Las decisiones se toman con lo que deja cada canal a lo largo del tiempo —lo que pagan en toda su carrera los estudiantes que trae— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

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

- Existe una guía corta de la voz de la institución, escrita, y las piezas del último trimestre la aplican, también las de las facultades y los programas. `[2.5.F2]`
- Hay 2 o 3 buyer personas escritos —por ejemplo, el joven que sale del colegio, el adulto que estudia mientras trabaja y la familia que decide o paga—, cada uno con su recorrido básico de la primera búsqueda a la matrícula, etapa por etapa. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: en el blog o en el formato que use la institución, como videos de sus programas, historias de estudiantes o guías para elegir carrera. `[2.5.F5]`

**Eficiente.** La presencia se afina por programa y por tipo de aspirante, se prepara para buscadores y asistentes de IA, y las pruebas de la reputación de la institución están a la vista.

*Resultado:* La institución aparece cuando los aspirantes y sus familias buscan qué y dónde estudiar, tanto en buscadores como en asistentes de IA, con contenido pensado para cada programa y cada tipo de aspirante que importan; cada reseña de sus estudiantes, buena o mala, recibe respuesta, y las pruebas de su reputación —acreditaciones, rankings y lo que logran sus egresados— están a la vista.

- Los buyer personas están detallados para cada segmento de alto valor: por ejemplo, un posgrado o una carrera que la institución quiere hacer crecer. `[2.5.E1]`
- Si el contenido propio se publica en el sitio, está organizado por temas —por ejemplo, un área de estudio o una carrera—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido del aspirante —de la primera búsqueda a la matrícula, con sus ferias, visitas y conversaciones— está mapeado con puntos de contacto definidos. `[2.5.E4]`
- Se les pide una reseña pública a los estudiantes después de un momento clave, como terminar su primer período o graduarse, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo. `[2.5.E5]`
- Las pruebas de la reputación de la institución —las acreditaciones y los rankings que tenga, y lo que logran sus egresados— están a la vista en el sitio y en las campañas, y se actualizan cada período. `[2.5.E301 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La presencia se mantiene vigente sin que el equipo escriba cada pieza: la IA produce y ajusta el contenido para cada programa, cada tipo de aspirante y cada forma de buscar, y el equipo lo aprueba.

- Hay buyer personas para grupos muy chicos de aspirantes —o, cuando la institución forma al personal de empresas, para cada empresa importante—, no solo para los segmentos grandes. `[2.5.O1]`

*Se leen igual:* `2.5.D1`, `2.5.D3`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F4`, `2.5.E3`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un interesado según el programa, el nivel o la modalidad que busca?

*Descripción:* Mide si cada interesado y su familia reciben mensajes pensados para su programa, su nivel y su modalidad.

*Costo de quedarse:* Le mandas la misma campaña a quien busca un técnico que a quien busca un posgrado: el mensaje no le habla a nadie, y la familia que paga nunca recibe lo que necesita saber.

**Inicial.**

- Hay listas separadas por programa o por nivel, pero casi todas las campañas salen con la misma pieza para todas. `[2.6.I2]`

**Funcional.** Hay segmentos escritos, piezas pensadas para cada uno —también para la familia, si participa en la decisión— y, donde hay asesores de admisiones, criterios escritos para clasificar a los interesados.

*Resultado:* Cada programa y cada perfil reciben un mensaje pensado para ellos, la familia que participa en la decisión recibe lo que necesita saber y, donde hay asesores de admisiones, Admisiones recibe interesados que Marketing ya clasificó con criterios escritos.

- Existen al menos 2 segmentos con criterios escritos según qué busca o cómo decide cada grupo —por ejemplo, qué nivel o programa, en qué modalidad o quién decide con el aspirante—, no solo según dónde está. `[2.6.F1]`
- Existen criterios escritos de qué es un suscriptor, un interesado y un MQL, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre las propiedades que usan esos criterios, como el programa de interés o el nivel de estudios. `[2.6.F4]`
- Si la familia participa en la decisión —porque decide, acompaña o paga—, las campañas también le hablan a ella, con piezas propias y distintas de las del aspirante. `[2.6.F301 · comprobable · hábito]`

**Eficiente.** Los segmentos y el puntaje de interesados se arman solos, y el mensaje se adapta solo a cada segmento.

*Resultado:* El mensaje se adapta solo a quién lo recibe y en qué etapa está, y los interesados con más probabilidad de matricularse se distinguen del resto: donde hay asesores de admisiones, Admisiones los recibe primero.

- Hay secuencias distintas por segmento o por etapa del recorrido del aspirante. `[2.6.E1]`
- Hay un puntaje de interesados por reglas: un modelo que suma puntos por varios datos de cada persona, como el programa que le interesa, lo que hizo o si asistió a un evento, y la clasifica al pasar un umbral —como MQL, donde hay asesores de admisiones—, y ese puntaje dispara las secuencias de nutrición. No es la clasificación de Funcional, que responde al valor de una propiedad, sin modelo de puntaje detrás. `[2.6.E3]`
- La segmentación usa datos de comportamiento —qué abrió, qué páginas de programas visitó, a qué evento fue—, no solo lo que la persona declaró. `[2.6.E4]`

**Óptimo.**

- La IA predice quién se va a matricular y quién va a perder interés en los mensajes, y arma los segmentos con eso; el equipo revisa los segmentos antes de usarlos en una campaña, y en la ficha de cada persona se ve su predicción. `[2.6.O1]`

*Se leen igual:* `2.6.D1`, `2.6.D2`, `2.6.I1`, `2.6.F3`, `2.6.E2`, `2.6.O3`.

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

- Si la pauta pagada es parte del plan de canales, hay al menos una campaña corriendo con presupuesto definido (Google, Meta o el canal que usen sus aspirantes). `[2.7.F3]`
- Los canales que la institución eligió en su plan siguen el mismo calendario y la misma campaña: la de admisión de cada período sale coordinada en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada interesado —o cada matrícula, donde el estudiante se matricula solo en línea— el último mes, al menos por canal. `[2.7.F6]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, en el sistema se ve cuánto cuesta cada matrícula en cada canal, y el presupuesto se mueve según lo que cuesta cada interesado o cada matrícula.

*Resultado:* La inversión se mueve hacia el canal que trae matrículas al menor costo, los canales se refuerzan entre sí en vez de competir por el mismo interesado, y los estudiantes y egresados recomiendan la institución.

- Los canales —también el conversacional, si se usa— comparten datos y se alimentan entre sí: uno continúa lo que empezó otro —quien fue a una feria ve después la pauta de su programa—, hay remarketing activo y las audiencias se construyen desde el CRM. `[2.7.E1]`
- Si las ferias, las charlas en colegios, las visitas al campus, los días de puertas abiertas o los webinars son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- El presupuesto entre canales se revisa al menos una vez por mes y se mueve según lo que cuesta cada interesado o cada matrícula en cada canal. `[2.7.E3]`
- Hay un programa de embajadores activo: estudiantes y egresados saben cómo recomendar la institución, y cada aspirante referido queda registrado con quién lo trajo. `[2.7.E4]`
- En el sistema se ve cuánto costó cada matrícula del último período en cada canal —pauta, ferias, colegios, referidos—, no solo cada interesado. `[2.7.E301 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más matrículas deja, dentro de los límites que fija el equipo; los estudiantes y egresados satisfechos traen aspirantes nuevos, y la institución prueba canales nuevos sin esperar a ver qué hacen las demás.

- Los estudiantes y egresados que Servicio identifica como promotores se vuelven embajadores y testimonios de la institución sin pedirlos a mano: el sistema los invita solo, el equipo elige qué testimonios se publican, y en el sistema se ve qué aspirantes trajo cada uno. `[2.7.O4]`

*Se leen igual:* `2.7.I2`, `2.7.F1`, `2.7.F2`, `2.7.F4`, `2.7.E5`, `2.7.O1`, `2.7.O2`.

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

- El proceso de campaña y la planificación del siguiente período se refinan con base en lo aprendido. `[2.8.E3]`

**Óptimo.**

*Resultado:* Las campañas mejoran mientras están corriendo, no recién cuando cierra la matrícula.

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.I2`, `2.8.E1`, `2.8.E2`, `2.8.O2`, `2.8.O3`.

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
- Cada estudiante tiene registrado quién responde por él —una persona o, si son tantos que no se pueden asignar por persona, un equipo— y recibe un contacto de seguimiento a tiempo —en los momentos que fija el proceso de atención—, aunque no haya abierto casos; si responde un equipo, ese contacto puede ser un mensaje automático. `[3.1.F2]`
- Existe un proceso escrito para escalar las quejas graves —como un cobro que el estudiante no reconoce o una nota en disputa— y los casos que quien atiende no puede resolver: dice cuáles se escalan y a quién. `[3.1.F4]`
- Cualquier persona del equipo explica cómo se atiende un trámite típico —una constancia, un cambio de horario— siguiendo el mismo flujo. `[3.1.F5]`
- Cualquier persona del equipo atiende en el sistema central, no por fuera: es su herramienta de trabajo, no algo que se llena después de resolver por correo o en ventanilla. `[3.1.F6]`
- Cada período tiene su calendario de atención escrito antes de empezar: en qué semanas llegan la rematrícula, los pagos, el inicio de clases y los exámenes, y qué tiene que preparar el equipo para cada una. `[3.1.F301 · declarado · hábito]`

**Eficiente.** Aparecen los plazos de respuesta, los playbooks y el recorrido del estudiante, y el líder vigila con datos que el proceso se cumpla.

*Resultado:* El equipo sabe en cuánto tiempo debe responder cada tipo de trámite, cada momento clave del paso del estudiante por la institución tiene un dueño, y el líder sabe dónde se desvía la atención y corrige con datos, no de memoria.

- Hay SLA definidos por tipo de trámite o prioridad: cuánto puede tardar una constancia, una revisión de nota o un cambio de carrera. `[3.1.E1]`
- Hay playbooks de prevención y, donde la relación es continua, también de retención y expansión: qué hacer ante un estudiante en riesgo de dejar y cómo ofrecerle un siguiente programa al que está por terminar. `[3.1.E3]`
- El recorrido del estudiante está definido de punta a punta, con sus momentos clave —la inducción, el primer período, la graduación y, si el estudiante sigue un programa o vuelve por otro curso, cada vez que se vuelve a matricular— y un responsable y un estándar para cada uno. `[3.1.E4]`

**Óptimo.**

- El sistema detecta, sin que nadie lo revise a mano, cuando el caso de un estudiante se sale de las etapas o los pasos del proceso de atención, y se lo señala a quien lo atiende y al líder, que deciden cómo corregirlo; el aviso queda registrado en el caso. `[3.1.O3]`

*Se leen igual:* `3.1.I2`, `3.1.F3`, `3.1.E5`, `3.1.O1`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

¿Cómo llega el trámite de un estudiante —por ventanilla, correo o WhatsApp— al sistema y a la persona que lo tiene que atender?

*Descripción:* Mide si cada caso del estudiante —un trámite, una consulta, un reclamo— llega solo al sistema y a quien lo atiende, y cuánto de la atención se automatiza.

*Costo de quedarse:* Los casos se pierden entre correos, ventanillas y chats, y alguien tiene que repartirlos a mano en cada rematrícula: el estudiante tiene que insistir para que lo atiendan.

**Funcional.** Los casos de los estudiantes entran al sistema y se asignan solos con una regla simple; si el equipo atiende por WhatsApp o chat, ese canal está conectado, y si usa IA, trabaja con los datos de cada estudiante.

*Resultado:* Lo que el estudiante escribe por los canales conectados llega al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Si el equipo usa IA, esta trabaja con lo que el sistema sabe de cada estudiante —quién es, en qué programa está y sus casos—, no a ciegas. `[3.2.F8]`

**Eficiente.** Los plazos se vigilan solos y los casos que están por vencer suben solos, el estudiante hace en línea sus trámites de siempre y la IA asiste al equipo en su trabajo diario.

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el estudiante puede ver y abrir sus casos y hacer en línea sus trámites de siempre sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién— y, si el equipo tiene más de una persona que atiende, las conversaciones y los casos se enrutan por varias condiciones, como el tema, la sede o el programa del estudiante. `[3.2.E1]`
- Hay un portal de autoservicio donde el estudiante ve y abre sus casos, y una base de conocimiento interna y pública. `[3.2.E2]`
- El equipo usa la IA en su trabajo diario —para redactar respuestas, resumir casos o buscar en la base de conocimiento—, y la IA trabaja con el contexto del área: los tipos de estudiante, la atención que recibe cada uno y las respuestas a las preguntas frecuentes. `[3.2.E4]`
- Los trámites más frecuentes —constancias, rematrícula, pagos y cambios de horario— se hacen en línea de principio a fin, sin ir a una ventanilla. `[3.2.E301 · comprobable]`

**Óptimo.** Un agente de IA resuelve los casos de los estudiantes y le pasa a una persona lo que no puede, y lo que la institución calcula de cada estudiante —como su riesgo de dejar sus estudios— aparece en su ficha.

*Resultado:* Buena parte de los casos de los estudiantes se resuelve sin que intervenga una persona, y cuando un caso pasa a una persona, llega con el contexto completo y con lo que la institución sabe de ese estudiante a la vista.

- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de servicio: quien atiende ve en la ficha, por ejemplo, el riesgo de deserción del estudiante. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.D2`, `3.2.I2`, `3.2.F4`, `3.2.F5`, `3.2.F6`, `3.2.E3`, `3.2.E5`, `3.2.O1`.

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
- Las propiedades clave del estudiante —su programa, su modalidad y desde qué período estudia— están pobladas en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene tipo y motivo, con una lista definida: constancias, pagos, notas, cambios de carrera, reclamos. `[3.3.F4]`
- El contexto que el área documentó —tipos de estudiante, la atención que recibe cada uno, respuestas a las preguntas frecuentes— se revisa y se actualiza al menos una vez por trimestre; no se deja envejecer. `[3.3.F6]`

**Eficiente.** Se miden tiempos y satisfacción, y los datos del estudiante se unifican con los de Admisiones.

*Resultado:* La institución sabe qué tan rápido y qué tan bien atiende y cuánto tarda un estudiante nuevo en completar su inducción, con la satisfacción medida y no supuesta; donde el estudiante vuelve, sabe además cómo va cada uno.

- Se mide la satisfacción de los estudiantes —con el NPS o el CSAT— con una cadencia definida, por ejemplo al cerrar cada caso o al terminar cada período. `[3.3.E2]`
- Los datos del estudiante están unificados entre Servicio y Admisiones: los dos ven la misma información del estudiante, en un mismo sistema o en sistemas conectados. `[3.3.E3]`
- Se mide cuánto tarda cada estudiante nuevo en alcanzar el resultado de su inducción: el tiempo desde que se matricula hasta que lo logra. `[3.3.E4]`
- Hay un indicador de salud por reglas para cada estudiante, que combina su asistencia y su avance académico, sus casos abiertos y su satisfacción. `[3.3.E5]`

**Óptimo.** Los datos del estudiante se mantienen al día solos y, donde el estudiante vuelve, un modelo anticipa el riesgo de que deje sus estudios antes de que lo diga.

*Resultado:* La institución anticipa lo que va a pasar con sus estudiantes, con datos que se mantienen al día solos, y, donde el estudiante vuelve, sabe quién está en riesgo de dejar y quién va logrando lo que vino a buscar antes de que ellos mismos lo digan.

- Un modelo predictivo de salud calcula para cada estudiante su riesgo de dejar y si va logrando lo que vino a estudiar, a partir de su experiencia y de su avance; el puntaje se ve en su ficha y quien responde por cada estudiante revisa a los que el modelo marca. `[3.3.O1]`
- Servicio se apoya en el almacén central de datos de la institución —donde se juntan lo académico, los pagos y la atención—, con reglas claras de quién accede y cómo se mantiene, para anticipar el riesgo de cada estudiante. `[3.3.O2]`

*Se leen igual:* `3.3.I2`, `3.3.F5`, `3.3.E1`, `3.3.O3`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si el equipo va al día con los trámites de los estudiantes?

*Descripción:* Mide si cada persona y cada oficina sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien qué le toca a cada oficina, y el líder se entera de los atrasos cuando el estudiante ya se quejó.

**Deficiente.**

- Nadie tiene claro qué le toca: entre quien recibe a los estudiantes nuevos, quien atiende los trámites y quien los acompaña, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Inicial.** Hay roles de palabra entre las oficinas y el líder mira algunos números de vez en cuando, sobre todo cuando algo sale mal, pero sin una cadencia fija.

**Funcional.**

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, volumen, casos pendientes acumulados, casos por tipo de trámite— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por sus plazos de respuesta, el líder prepara a quien entra y acuerda con Admisiones y con las áreas académica y financiera qué recibe y qué devuelve Servicio.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, las áreas académica y financiera resuelven en el plazo acordado, cada estudiante nuevo llega de Admisiones con lo que vino a buscar y, donde el estudiante vuelve a matricularse curso por curso, sin seguir un programa, Admisiones se entera cuando uno se puede estar yendo.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —trámites, reglamentos y sistemas—; no se le entrena de memoria. `[3.4.E2]`
- El líder de Servicio acuerda con Admisiones qué trae cada estudiante nuevo —lo que vino a buscar— y el acuerdo se cumple: cada uno llega con eso y, si el estudiante vuelve a matricularse curso por curso, sin seguir un programa, Servicio le avisa a Admisiones cuando se puede estar yendo. `[3.4.E4]`
- El acuerdo con las áreas académica y financiera está escrito y se mide: en cuánto tiempo resuelven lo que les pasa Servicio, como una revisión de nota, un cambio de carrera o un arreglo de pago. `[3.4.E301 · comprobable]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento y, donde la relación es continua, el servicio se mide por los estudiantes que permanecen y siguen estudiando con la institución.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella; donde la relación es continua, Servicio se mide por los estudiantes que permanecen, se rematriculan y siguen estudiando con la institución, no solo por los casos que cierra.

- El equipo de servicio se mide por la permanencia de sus estudiantes y por cuántos siguen estudiando con la institución, no solo por los casos que cierra. `[3.4.O3]`
- El sistema calcula cuánto cuesta atender a cada tipo de estudiante frente a lo que deja a la institución, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.O4]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.E1`, `3.4.O1`, `3.4.O2`.

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

- Quienes atienden usan en su día a día las respuestas guardadas para los casos frecuentes, no solo las tienen cargadas. `[3.5.E1]`
- El tono y la voz de la institución se aplican a las respuestas, no cada persona con su estilo. `[3.5.E2]`

*Se leen igual:* `3.5.E3`, `3.5.O1`.

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
- Está escrito qué atención recibe cada tipo de estudiante —por ejemplo, por qué canal y qué oficina o persona lo atiende—, y el equipo la aplica. `[3.6.F2]`
- Quien atiende usa la ficha del estudiante —su programa, en qué período va y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** La atención cambia según el momento de cada estudiante y, donde el estudiante vuelve, los de los grupos clave tienen un consejero dedicado.

*Resultado:* La atención cambia según el momento en que está cada estudiante y, donde el estudiante vuelve, cada uno de los grupos clave tiene un consejero que lo conoce y el resto no queda solo.

- Hay un modelo de atención por segmento: cada estudiante de los grupos que la institución define como clave —por ejemplo, los de primer ingreso o los becados— tiene un consejero dedicado que lo conoce, y el resto recibe acompañamiento automatizado, de uno a muchos. `[3.6.E1]`
- Los estudiantes se segmentan para acciones diferenciadas según el momento de su paso por la institución: donde vuelven —porque siguen un programa o se matriculan en otro curso—, de primer ingreso, al día, en riesgo o con opción de seguir otro programa; donde toman un solo curso y no vuelven, por empezar, cursando o listos para recomendar. `[3.6.E2]`

**Óptimo.** Cada estudiante se atiende con todo su contexto, lo atienda una persona o la IA, incluso cuando hace sus trámites solo.

*Resultado:* Cada estudiante recibe una atención a su medida en cualquier canal, incluso cuando hace sus trámites solo, y nunca tiene que volver a explicar lo que ya habló con Admisiones.

- En el autoservicio, cada estudiante ve lo que corresponde a su tipo, a su programa y a sus casos abiertos, sin que nadie lo arme a mano; el equipo define qué corresponde a cada tipo. `[3.6.O1]`
- Cada estudiante se atiende con el contexto de cómo llegó —lo que se le prometió en su admisión y el perfil con que entró—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.O2`.

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

**Eficiente.** El riesgo de deserción se ve venir, ningún caso se pierde aunque lo resuelva otra oficina, y el estudiante recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los casos del estudiante no se pierden entre oficinas, el estudiante sabe lo que necesita antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la institución retiene estudiantes que antes dejaban sin aviso, sabe quiénes pueden seguir estudiando con ella y sus estudiantes de los grupos clave revisan qué lograron.

- Hay alertas tempranas, a partir del indicador de salud, de riesgo de deserción o de la oportunidad de que el estudiante siga con otro programa. `[3.7.E1]`
- Los estudiantes en riesgo reciben una acción de permanencia —una tutoría, un arreglo de pago, un cambio de horario— antes de decidir dejar, y los que pueden seguir estudiando reciben la propuesta de un siguiente programa. `[3.7.E2]`
- Los estudiantes de los grupos clave revisan con la institución, al menos cada trimestre, la meta que persiguen —por ejemplo, terminar en el plazo de su programa o mantener su beca—: qué se logró y qué sigue. `[3.7.E3]`
- Ningún caso del estudiante se pierde entre oficinas: si lo resuelve otra área —registro, cobros, la dirección de su carrera—, también queda en el sistema; y hay alertas automáticas, que le llegan a quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica —la rematrícula, un pago, un examen— o, si se piden calificaciones, cuando un estudiante califica mal la atención. `[3.7.E4]`
- Cada estudiante recibe, sin tener que pedirla, la información que necesita antes de los momentos clave de su período —la rematrícula, los pagos, los exámenes, la graduación—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`

**Óptimo.** Los problemas se resuelven antes de que el estudiante los note, con acciones que la IA ajusta, y el estudiante recibe detalles que lo hacen sentirse parte de la institución.

*Resultado:* La mayoría de los problemas que detecta el sistema se resuelven antes de que el estudiante los note, y cada estudiante siente que la institución se adelanta a lo que necesita y lo sorprende para bien.

- Las revisiones de avance llegan a todos los estudiantes: a los de los grupos clave en persona y al resto con un informe que el sistema arma con sus datos y envía de forma automática; cada revisión queda registrada en la ficha del estudiante. `[3.7.O1]`
- La mayoría de los problemas que detecta el sistema —un pago rechazado, un acceso que no funciona, un choque de horario— se resuelven antes de que el estudiante los note: el equipo valida la solución y en el sistema se ve que el estudiante no tuvo que abrir un caso. `[3.7.O2]`
- La IA decide qué acción proactiva recibe cada estudiante —qué, cuándo y por qué canal— según su historia y sus señales, como sus notas o su asistencia, dentro de los límites que fijó el equipo, que revisa los resultados; en el sistema queda qué decidió para cada estudiante. `[3.7.O3]`
- Los estudiantes reciben, sin pedirlos, detalles pensados para deleitarlos —un reconocimiento por su avance, beneficios o experiencias en el campus—, elegidos según la historia de cada estudiante y el momento de su paso por la institución, y en el sistema queda qué recibió cada uno. `[3.7.O4]`

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

- Al menos una vez por trimestre se revisan los casos que se repiten y, donde la relación es continua, las razones por las que los estudiantes dejan sus estudios, para encontrar patrones y mejorar. `[3.8.E2]`
- El autoservicio funciona: se mide cuántos estudiantes resuelven sin abrir un caso, y el equipo de atención no crece al mismo ritmo que la matrícula. `[3.8.E3]`
- Cada período se prepara con lo que dejó el anterior: cuántos casos llegaron, de qué tipo y en qué semanas; con eso se ajustan el equipo y las respuestas publicadas antes del pico. `[3.8.E301 · declarado · hábito · requiere 3.3.F4]`

**Óptimo.** La IA detecta las preguntas nuevas de los estudiantes y genera el contenido; la matrícula crece sin que crezca el equipo de atención.

*Resultado:* La matrícula puede crecer sin que crezca el equipo de atención: el conocimiento se genera a medida que aparecen preguntas nuevas, y la IA y el autoservicio absorben los picos de cada período.

- Los picos de cada período —la rematrícula, el inicio de clases, los exámenes— los absorben la IA y el autoservicio: el equipo de atención no crece cuando crece la matrícula, y el líder ve en los tableros del área qué parte de los casos resolvieron la IA y el autoservicio y qué pasó a una persona. `[3.8.O2]`
- La IA aplica lo que aprende de los casos a las respuestas guardadas, a la atención de cada tipo de estudiante y a los avisos que se adelantan a lo que necesita cada uno, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3]`

*Se leen igual:* `3.8.I1`, `3.8.F2`, `3.8.E1`, `3.8.O1`, `3.8.O4`.

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

**Funcional.** Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la firma, con una cadencia de contacto, un proceso de reserva escrito y una revisión fija de los negocios.

*Resultado:* Si rota un asesor, el siguiente sabe en qué va cada cliente, porque todo el equipo trabaja la venta igual en el CRM: los negocios avanzan con los mismos criterios, cada visita deja su siguiente paso, la reserva se hace siempre de la misma forma, cada interesado se contacta con la cadencia acordada y los negocios se revisan en cada reunión de seguimiento.

- Cualquier asesor explica igual las etapas de la venta —consulta, visita, reserva, promesa y firma— y qué tiene que cumplirse para avanzar. `[1.1.F1]`
- Cada proyecto o tipo de venta tiene su propio recorrido en el CRM, con lo que el negocio tiene que cumplir para pasar de cada etapa a la siguiente, hasta la reserva y la firma. `[1.1.F2]`
- Toda visita queda registrada con su resultado y su siguiente paso acordado. `[1.1.F401 · comprobable · hábito]`
- El proceso de reserva está escrito: qué se firma, qué se paga, cuánto dura y qué pasa si se vence. `[1.1.F402 · declarado]`

**Eficiente.**

- Hay una metodología de asesoría formal en uso —SPIN, BANT o una equivalente, con pasos definidos— con la que el asesor indaga, por ejemplo, qué busca el cliente, cómo va a pagar y quién decide. `[1.1.E1]`
- Existen guías de indagación, precalificación, visita y manejo de objeciones —precio, ubicación, plazo de entrega— que el equipo usa. `[1.1.E2]`

*Se leen igual:* `1.1.D1`, `1.1.D2`, `1.1.D3`, `1.1.D4`, `1.1.I1`, `1.1.I2`, `1.1.I3`, `1.1.I4`, `1.1.F4`, `1.1.F5`, `1.1.F6`, `1.1.E3`, `1.1.O1`, `1.1.O2`, `1.1.O3`.

#### 1.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se reserva una unidad?

*Descripción:* Mide cuánto del trabajo repetitivo hace el sistema —repartir las consultas, avisar qué toca, bloquear la unidad que se reserva y registrar las conversaciones— y cómo usa el equipo la automatización y la IA.

*Costo de quedarse:* Tus asesores copian a mano las consultas de los portales, dependen de su memoria para dar seguimiento y descubren que la unidad ya estaba reservada cuando el cliente ya se había ilusionado.

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

- La IA calcula la probabilidad de cierre de cada negocio y propone respuestas según el contexto de cada conversación con el interesado; las dos cosas se ven en el CRM y el asesor decide qué usar. `[1.2.O1]`
- Si el equipo atiende por un canal conversacional, agentes de IA responden ahí, precalifican a los interesados con la definición de interesado calificado y agendan visitas a cualquier hora; le pasan al asesor, con el contexto, a quien está listo, y el equipo revisa en el CRM lo que precalificaron. `[1.2.O2]`

*Se leen igual:* `1.2.D1`, `1.2.D2`, `1.2.I1`, `1.2.I2`, `1.2.F3`, `1.2.F4`, `1.2.F6`, `1.2.F7`, `1.2.E2`, `1.2.E4`, `1.2.E5`, `1.2.O3`.

#### 1.3 Datos

¿Qué tienes que hacer con el reporte de tus negocios y reservas antes de usarlo para decidir?

*Descripción:* Mide si los datos de ventas son confiables para decidir: negocios completos, el origen de cada uno, el inventario al día y reportes que salen del sistema sin armarlos a mano.

*Costo de quedarse:* Decides con números que no cuadran: el reporte de ventas se arma a mano cruzando el CRM con la hoja de inventario, y no sabes qué portal te trae compradores y cuál solo consultas.

**Funcional.** El reporte de negocios y reservas sale del sistema, sin armarlo a mano, y el estado de cada unidad está al día: a los dos se les puede creer.

*Resultado:* El líder ve el estado real de los negocios y de cada unidad cuando lo necesita, sin armar el reporte a mano, y sabe de dónde llegó cada interesado.

- Todo negocio creado desde la puesta en marcha del recorrido actual tiene la unidad o el tipo de unidad de interés, el monto, la fecha esperada de cierre y el asesor responsable. `[1.3.F1]`
- Todo negocio creado desde la puesta en marcha del recorrido actual dice por dónde llegó el interesado: portal, web, redes, valla, referido o sala de ventas. `[1.3.F3]`
- El reporte de negocios y de reservas se genera del sistema sin reconstruir números, y refleja el estado actual, no un pronóstico. `[1.3.F4]`
- La documentación sobre el comprador objetivo de cada proyecto no se deja envejecer. `[1.3.F5]`
- La definición de interesado calificado no se deja envejecer. `[1.3.F6]`
- La documentación de lo que se ofrece —qué tiene cada proyecto o cada unidad y para quién es— no se deja envejecer. `[1.3.F7]`
- El estado de cada unidad —disponible, reservada o vendida— está al día en el sistema y coincide con lo que se firmó. `[1.3.F401 · comprobable · requiere 1.2.F8]`

**Eficiente.** Aparece una proyección de ventas confiable, se mide qué tan rápido se vende o se alquila cada tipo de unidad y la ficha del cliente reúne su reserva, sus pagos y sus conversaciones.

*Resultado:* La empresa puede comprometer un ritmo de ventas con confianza y planear con ese número su flujo de caja y, si vende proyectos propios, la obra y su financiamiento.

- Hay una proyección de ventas —por proyecto, si la empresa vende proyectos propios— que se actualiza cada semana o cada quince días, y en al menos cinco de los últimos seis meses el total vendido quedó dentro de ±10% del total proyectado. `[1.3.E1]`
- La ficha de cada cliente reúne lo comercial con su historial de conversaciones y, si la empresa lleva en otros sistemas la reserva, los pagos o el trámite de crédito, con lo que viene de ellos: la vista 360° empieza a tomar forma. `[1.3.E3]`
- Se mide cuánto tarda en venderse o en alquilarse cada tipo de unidad —y, si la empresa vende proyectos propios, cada etapa del proyecto—, y ese ritmo se revisa. `[1.3.E401 · comprobable]`

*Se leen igual:* `1.3.D1`, `1.3.D2`, `1.3.D3`, `1.3.D4`, `1.3.I1`, `1.3.I2`, `1.3.I3`, `1.3.F2`, `1.3.F8`, `1.3.E2`, `1.3.E4`, `1.3.O1`, `1.3.O2`, `1.3.O3`, `1.3.O4`, `1.3.O5`.

#### 1.4 Equipo y Gobierno

¿Cómo sabe el líder, cada semana, qué asesores van bien y cuáles necesitan ayuda?

*Descripción:* Mide si cada asesor tiene un rol y una meta por escrito, y si el líder sigue los números de la venta y pide cuentas con datos.

*Costo de quedarse:* El líder se entera al cierre del mes de que el proyecto no vendió lo esperado: no vio antes qué asesor se quedó atrás ni en qué etapa se cayeron los negocios.

**Funcional.** Cada asesor tiene un rol y una meta por escrito, está claro a quién le corresponde cada cliente, el líder sigue un tablero cada semana y en la reunión de seguimiento cada quien rinde cuentas.

*Resultado:* Cada asesor sabe qué se espera de él y a quién le corresponde cada cliente, y el líder sabe cada semana qué asesor y qué proyecto van bien y quién necesita ayuda, antes de que termine el mes.

- El líder tiene un tablero con 4 a 6 métricas clave —consultas, visitas, reservas, ventas firmadas, desistimientos, unidades disponibles— y lo consulta al menos una vez por semana. `[1.4.F2]`
- Cada asesor —y, si la empresa vende proyectos propios, cada proyecto— tiene una meta escrita, con un monto o una cantidad de unidades y un plazo, y su avance se reporta en una fecha fija, al menos una vez al mes. `[1.4.F4]`
- Está escrito a quién le corresponde un cliente cuando lo atienden dos asesores, y cómo se reparte la comisión. `[1.4.F401 · declarado · venta con equipo]`

**Eficiente.** El líder prepara a quien entra, escucha al equipo y acuerda reglas con las áreas que cierran la venta y, si Marketing pasa interesados, también las del traspaso.

*Resultado:* Un asesor nuevo produce más rápido, el trámite de crédito y la firma no se traban entre áreas, lo que el equipo ve que no funciona llega a quien puede cambiarlo y, si Marketing pasa interesados, el traspaso tiene reglas que se cumplen.

- Cuando entra un asesor nuevo, hay un plan de inducción con sus pasos y materiales —proyectos, precios, financiamiento y sistemas—; no se le entrena de memoria. `[1.4.E2]`
- El acuerdo con las áreas que cierran la venta —legal, cobros y trámite de crédito— está escrito y se mide: qué recibe cada una y en cuánto tiempo responde. `[1.4.E401 · comprobable]`

**Óptimo.**

*Resultado:* La dirección decide dónde invertir con números de fondo: qué proyecto y qué canal dejan más margen, qué tipo de unidad se vende más rápido y qué asesor aporta más.

- Las decisiones de la dirección usan números de fondo: cuánto margen deja cada canal —y cada proyecto, si la empresa vende proyectos propios—, qué tan rápido se vende o se alquila cada tipo de unidad y cuánto aporta cada asesor. `[1.4.O1]`

*Se leen igual:* `1.4.D1`, `1.4.D2`, `1.4.I1`, `1.4.I2`, `1.4.F1`, `1.4.F3`, `1.4.F5`, `1.4.E3`, `1.4.E4`, `1.4.O2`, `1.4.O3`.

#### 1.5 Proyecto y propuesta

¿Cómo sabe un asesor que entra a tu equipo a quién le vende y con qué precios y condiciones?

*Descripción:* Mide si el equipo sabe para quién es cada proyecto, si el mensaje y la propuesta llegan igual con cualquier asesor y, si se vende por más de un canal, si los precios y las condiciones son coherentes en todos.

*Costo de quedarse:* Cada asesor cuenta el proyecto a su manera y cotiza con su propia hoja: el cliente recibe dos precios para la misma unidad, desconfía y se va a ver otro proyecto.

**Deficiente.** Nadie puede decir con claridad para quién es el proyecto, no hay una lista de precios que todos usen y cada asesor lo cuenta a su manera: el cliente recibe precios distintos según quién lo atienda.

- Hay más de una lista de precios circulando, y no se sabe cuál es la vigente. `[1.5.D401 · comprobable]`

**Inicial.** Hay una lista de precios y un brochure, pero cada asesor arma la cotización por su cuenta.

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

*Se leen igual:* `1.5.D1`, `1.5.D2`, `1.5.I1`, `1.5.I2`, `1.5.F3`, `1.5.F5`, `1.5.E2`.

#### 1.6 Priorización de interesados

¿Cómo decide tu equipo a qué interesados dedicarles tiempo y visitas primero?

*Descripción:* Mide si el equipo decide a qué interesados dedicar su tiempo con criterios escritos, según el comprador objetivo del proyecto.

*Costo de quedarse:* Tus asesores le dan visita a todo el que pregunta: pasan el fin de semana mostrando unidades a quien no puede pagarlas, y los compradores listos esperan su turno.

**Deficiente.** Se atiende a los interesados por orden de llegada, y se le da visita a todo el que pregunta.

- Se le da visita a todo el que pregunta, sin saber antes si puede comprar. `[1.6.D401 · evaluado]`

**Funcional.** Los interesados se separan por los rasgos del comprador objetivo —presupuesto, forma de pago, tipo de unidad— y hay una definición escrita de interesado calificado que el equipo aplica.

*Resultado:* El equipo deja de mostrarle unidades a quien no encaja con el comprador objetivo del proyecto y concentra las visitas en quien sí encaja y cumple la definición de interesado calificado, con su presupuesto, su forma de pago y su plazo de compra.

- El equipo segmenta a los interesados por los atributos del comprador objetivo antes de trabajarlos: presupuesto, forma de pago, zona, tipo de unidad o si compra para vivir o para invertir. `[1.6.F1]`
- Hay una definición escrita de interesado calificado —los criterios para dedicarle una visita: presupuesto, forma de pago y plazo de compra— y se aplica de forma consistente. `[1.6.F2]`
- El esfuerzo se enfoca en los interesados que encajan con el comprador objetivo del proyecto. `[1.6.F3]`
- Los rasgos del comprador objetivo —presupuesto, forma de pago, zona, tipo de unidad— son campos del CRM y de los formularios de consulta. `[1.6.F4]`

**Eficiente.** Los interesados se ordenan con un puntaje que suma varios rasgos, los segmentos de compradores prioritarios están en una lista escrita, cada segmento recibe su propio mensaje y la capacidad de pago se comprueba antes de reservar.

*Resultado:* Cada asesor sabe cada mañana a quién contactar primero, y las reservas que se firman son de quien sí puede terminar la compra.

- Hay un puntaje de interesados por reglas activo: un modelo que suma puntos por varios atributos —presupuesto, forma de pago, interacción, plazo de compra—, no una regla sobre un solo campo del CRM. `[1.6.E1]`
- Los segmentos de compradores prioritarios —inversionistas, primera vivienda, compradores del exterior— están en una lista escrita. `[1.6.E2]`
- La capacidad de pago del interesado se comprueba antes de reservar: carta de preaprobación, comprobante de fondos o plan de pagos aceptado. `[1.6.E401 · comprobable · venta con equipo]`

**Óptimo.**

- La IA detecta en cada cliente el riesgo de perderlo y el potencial de venderle más, como otra unidad, lo marca en el CRM y el asesor decide qué hacer. `[1.6.O2]`
- Si en la decisión de compra participan varias personas —la pareja, la familia o los socios de una inversión—, la IA adapta en tiempo real el mensaje a cada una, dentro de los límites que fijó el equipo; el asesor revisa lo que se envió, y en el CRM queda qué recibió cada persona. `[1.6.O3]`

*Se leen igual:* `1.6.D1`, `1.6.I1`, `1.6.I2`, `1.6.E3`, `1.6.O1`, `1.6.O4`.

#### 1.7 Seguimiento de visitas y reservas

¿Qué pasa con quien visitó y no volvió a contestar, o con la reserva que no avanza hacia la firma?

*Descripción:* Mide si alguien detecta cuando un negocio o una reserva deja de avanzar y si hay un paso acordado para retomarlos a tiempo; donde el comprador vuelve a comprar, como el inversionista que suma unidades, también si se le busca cuando su próxima compra se atrasa.

*Costo de quedarse:* Los clientes se enfrían después de la visita y las reservas se vencen sin que nadie llame: la unidad queda bloqueada semanas y la venta se cae cuando ya la dabas por hecha.

**Deficiente.** El asesor está solo con sus clientes, y después de la visita nadie da seguimiento.

- No hay material de venta —brochure, planos, fotos o recorrido virtual— para mostrarles a los interesados. `[1.7.D4]`
- Las reservas se vencen sin que nadie se dé cuenta. `[1.7.D401 · comprobable]`

**Funcional.** Ningún negocio se enfría en silencio después de la visita y ninguna reserva se vence sin aviso: se detectan a tiempo y hay un paso acordado para retomarlos.

*Resultado:* Los negocios que se traban se detectan a tiempo y se retoman por más de un canal; donde se vende con equipo, con material de venta común y con el líder actuando mientras todavía hay margen. Cada reserva tiene fecha, responsable y siguiente paso hasta la firma, y donde el comprador vuelve a comprar sin contrato, como el inversionista que suma unidades, la próxima compra tampoco se deja al azar.

- Para cada etapa está definido cuánto tiempo sin avance vuelve estancado un negocio —por ejemplo, después de una visita o de una cotización—; los estancados se reconocen a tiempo y tienen un paso de reactivación acordado, no la improvisación de cada asesor. `[1.7.F1]`
- Hay material de venta estandarizado —brochure, planos, recorrido virtual y, si la empresa vende proyectos propios, avance de obra— que ayuda a cerrar la venta. `[1.7.F4]`
- Toda visita recibe seguimiento dentro del plazo acordado. `[1.7.F401 · comprobable · hábito · requiere 1.1.F401]`
- Toda reserva tiene fecha de vencimiento y un responsable, y antes de que venza se contacta al cliente. `[1.7.F402 · comprobable · hábito · requiere 1.1.F402]`

**Eficiente.** El seguimiento es multicanal, el sistema le avisa al líder de lo que se traba y quien todavía no está listo sigue en nutrición.

*Resultado:* Ningún negocio espera a la reunión para recibir ayuda, quien todavía no está listo para comprar sigue en nutrición hasta que muestra interés o aparece una unidad para él, el cliente que ya reservó sabe cómo va su trámite, y se sabe cuánto de lo que se traba se recupera.

- Los interesados que todavía no están listos para comprar no se abandonan: pasan a nutrición —la de Marketing o una secuencia del propio equipo— y vuelven a un asesor cuando muestran interés o aparece una unidad que encaja con lo que buscan. `[1.7.E2]`
- Cuando un negocio o una reserva lleva sin avanzar más tiempo del que su etapa permite, el líder recibe un aviso del sistema, sin esperar a la reunión de seguimiento. `[1.7.E4]`
- Se mide cuántos negocios estancados y cuántas reservas en riesgo se recuperan. `[1.7.E401 · comprobable]`
- Entre la reserva y la firma, el cliente recibe avances de su trámite —y, si la empresa vende proyectos propios, de la obra— sin tener que pedirlos. `[1.7.E402 · comprobable · hábito]`

**Óptimo.** La IA detecta el negocio o la reserva que se va a caer y decide el canal y el momento de cada seguimiento; el equipo valida.

*Resultado:* Los negocios y las reservas que más importan reciben ayuda justo cuando la necesitan: la IA detecta cuándo se traban y propone a quién movilizar.

- La IA detecta qué negocios y qué reservas de más valor se están trabando antes de que venza su plazo y propone a quién movilizar —el asesor o la gerencia— o qué contenido enviar; el líder valida, y todo queda en el CRM. `[1.7.O1]`

*Se leen igual:* `1.7.D1`, `1.7.D2`, `1.7.D3`, `1.7.I1`, `1.7.I2`, `1.7.I3`, `1.7.I4`, `1.7.F2`, `1.7.F3`, `1.7.F5`, `1.7.E1`, `1.7.E3`, `1.7.O2`.

#### 1.8 Ventas, pérdidas y desistimientos

¿Qué queda registrado cuando un interesado no compra o una reserva se cae?

*Descripción:* Mide si queda registrado por qué no compra un interesado o por qué se cae una reserva, y si el equipo revisa las ventas que cierra, las que pierde y las reservas caídas para mejorar su proceso.

*Costo de quedarse:* No sabes por qué pierdes ventas ni por qué se caen las reservas —el precio, el crédito que no salió, la fecha de entrega—: cada asesor tiene su explicación, y sin un registro no hay cómo ver qué se repite.

**Funcional.** Cada negocio perdido y cada reserva caída quedan con su razón, elegida de una lista fija, y el líder saca del sistema el reporte del trimestre.

*Resultado:* El líder sabe por qué no compran los interesados y por qué se caen las reservas, con datos del trimestre y no con impresiones.

- Todo negocio creado desde la puesta en marcha del recorrido actual que se dio por perdido tiene registrada su razón. `[1.8.F1]`
- Cada reserva que se cae, porque el cliente desiste o porque se vence, deja registrada su razón: el crédito no salió, cambió de opinión o encontró otro proyecto. `[1.8.F401 · comprobable]`

**Eficiente.** Cada trimestre se revisan las ventas cerradas, las perdidas y las reservas caídas, lo aprendido cambia el proceso y el equipo se capacita con un calendario fijo.

*Resultado:* Los errores que más se repiten se corrigen y lo que hace vender se vuelve parte del proceso: lo que muestra la revisión de cada trimestre de las ventas cerradas, las perdidas y las reservas caídas cambia el proceso y la capacitación del equipo, y se sabe contra qué proyectos se pierde.

- Al menos una vez por trimestre se revisan las ventas cerradas, los negocios perdidos y las reservas caídas para encontrar lo que se repite. `[1.8.E1]`
- Cuando el cliente compró en otro proyecto, queda registrado en cuál y por qué. `[1.8.E401 · comprobable]`

*Se leen igual:* `1.8.D1`, `1.8.D2`, `1.8.I1`, `1.8.F2`, `1.8.F3`, `1.8.E2`, `1.8.E3`, `1.8.O1`, `1.8.O2`, `1.8.O3`, `1.8.O4`.

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

**Funcional.** Las campañas salen con un calendario y un proceso que el equipo sigue, sin depender de una persona, y cada proyecto propio tiene su plan por etapa de venta.

*Resultado:* Todo el equipo trabaja en el mismo sistema, y la promoción de cada proyecto sigue saliendo aunque cambie una persona: el plan de cada lanzamiento y el calendario no viven en la cabeza de nadie, y el líder sabe en qué va cada campaña sin tener que preguntar.

- El líder puede explicar qué campañas corren para cada proyecto y en qué etapa van, sin preguntarle al equipo. `[2.1.F4]`
- Si una agencia —o quien produce los renders y los videos— ejecuta todo o parte del trabajo, el equipo es dueño del calendario, del brief, de la aprobación y de los accesos, y las campañas no se detienen si cambia ese proveedor. `[2.1.F5]`
- Si la empresa vende proyectos propios, cada proyecto tiene su plan de marketing escrito para cada etapa de la venta —preventa, lanzamiento, venta durante la obra y últimas unidades—, con sus campañas y sus fechas. `[2.1.F401 · declarado]`

**Eficiente.**

- Cada pieza —un anuncio, un render o un video— pasa por una revisión de calidad y una aprobación antes de publicarse. `[2.1.E2]`

*Se leen igual:* `2.1.D2`, `2.1.D3`, `2.1.I1`, `2.1.I2`, `2.1.I3`, `2.1.F1`, `2.1.F2`, `2.1.F3`, `2.1.F6`, `2.1.E4`, `2.1.O1`, `2.1.O4`, `2.1.O5`.

#### 2.2 Tecnología y Automatización

¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o en la página de un proyecto, o te escribe por WhatsApp o el chat para preguntar por una unidad?

*Descripción:* Mide si las herramientas que se pagan se usan, si cada interesado que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo del marketing inmobiliario hacen las automatizaciones y la IA.

*Costo de quedarse:* Quien deja sus datos en tu sitio o te escribe por WhatsApp para preguntar por un proyecto espera a que alguien lo cargue y le conteste, o se pierde, y si pagas herramientas, como la de recorridos virtuales, parte de lo que pagas no se usa.

**Inicial.**

- Se pagan licencias o módulos que el equipo no usa, como la herramienta de recorridos virtuales o un módulo del CRM que quedó sin estrenar. `[2.2.I1]`

**Funcional.**

*Resultado:* Todo lo que entra por el sitio, por la página de cada proyecto y, si se usa, por WhatsApp o el chat llega al sistema y recibe respuesta, y no se paga por herramientas que nadie usa.

- Si el sitio o la página de cada proyecto tienen formularios para dejar datos, están conectados al CRM: lo que una persona llena entra solo como contacto. `[2.2.F3]`
- Si el sitio o la página de cada proyecto tienen formularios, cuando un interesado envía uno el sistema le responde automáticamente —por ejemplo, con el brochure del proyecto— y le avisa a quien corresponde. `[2.2.F5]`
- Si el equipo usa IA, esta tiene como contexto la voz de marca y los perfiles de comprador. `[2.2.F9]`

**Eficiente.**

*Resultado:* Los interesados reciben su nutrición sin que nadie la mande a mano, hasta que están listos para hablar con un asesor; la conversación con cada uno no depende de que alguien se acuerde de escribirle y, si se atiende por WhatsApp o chat, el líder ve en tiempo real qué conversaciones esperan respuesta.

- Hay secuencias de nutrición de varios pasos, con tiempos de espera y caminos distintos según quién es o lo que hace cada interesado, que lo acompañan mientras decide. `[2.2.E1]`
- El traspaso de interesados a los asesores es automático: cuando un interesado cumple los criterios para pasar a un asesor, le llega con su historial al asesor que corresponde, sin que nadie lo pase a mano. `[2.2.E3]`

**Óptimo.**

- Si la inmobiliaria atiende por un canal conversacional, como WhatsApp, agentes de IA responden lo que generan las campañas de cada proyecto y mantienen la conversación con quien todavía no está listo para hablar con un asesor; lo que no pueden resolver pasa a una persona del equipo con la conversación completa, y en el sistema queda cada conversación que atendió la IA. `[2.2.O2]`
- Lo que se calcula en el almacén central de datos vuelve a las herramientas de marketing sin que nadie lo cargue y se ve en la ficha de cada interesado: la segmentación usa, por ejemplo, qué tan cerca de comprar está cada uno, calculado afuera. `[2.2.O3]`

*Se leen igual:* `2.2.D1`, `2.2.D2`, `2.2.D3`, `2.2.I2`, `2.2.I3`, `2.2.F2`, `2.2.F4`, `2.2.E2`, `2.2.E4`, `2.2.E5`, `2.2.E6`, `2.2.E7`, `2.2.O1`.

#### 2.3 Datos

¿Cómo sabes cuántos interesados entran, de dónde vienen —un portal, la pauta, las redes o una feria— y cuántos llegan a una visita?

*Descripción:* Mide si los datos de marketing son confiables: de dónde llega cada interesado, en qué etapa está y si los reportes salen del sistema sin rehacerlos.

*Costo de quedarse:* No sabes de qué portal o de qué anuncio llega cada interesado ni cuántos terminan en una visita: cada reporte hay que rehacerlo o revisarlo a mano antes de creerle.

**Funcional.**

*Resultado:* El líder sabe de dónde llega cada interesado —un portal, la pauta, las redes, una feria o un referido—, con reportes que salen del sistema y no de una hoja de cálculo armada a mano.

- Cada interesado registrado desde la puesta en marcha del sistema —entre por un formulario, WhatsApp, un portal, una feria o la sala de ventas— tiene su etapa del ciclo de vida y su origen. `[2.3.F1]`
- Los datos que describen a cada tipo de comprador —como si compra para vivir o para invertir, o la zona que busca— se piden en los formularios por donde entran los interesados —o, si no hay formularios, donde se capturan sus datos, como la sala de ventas o una feria— y están completos en la mayoría de los registros. `[2.3.F2]`
- Los reportes básicos —cuántos interesados entran por proyecto, de dónde vienen y cuántos llegan a una visita— salen del sistema sin armarlos a mano. `[2.3.F5]`
- Cuando se pide un teléfono u otro dato de contacto —en un formulario o en una feria—, se pregunta si la persona acepta que le escriban por ese canal, y su respuesta queda registrada. `[2.3.F7]`

**Eficiente.**

*Resultado:* Marketing puede demostrar qué canal y qué contenido contribuyeron a cada venta de una unidad, no solo cuál trajo el primer clic.

- La atribución reparte el mérito de cada venta entre todos los puntos de contacto —portales, pauta, redes y ferias—, no solo el primero o el último, e incluye todos los canales, también el conversacional, como WhatsApp, si se usa: se sabe cuánto ingreso deja cada uno. `[2.3.E2]`

*Se leen igual:* `2.3.D1`, `2.3.D2`, `2.3.I1`, `2.3.I2`, `2.3.F3`, `2.3.F6`, `2.3.E1`, `2.3.E3`, `2.3.E4`, `2.3.O1`, `2.3.O3`, `2.3.O4`, `2.3.O5`.

#### 2.4 Equipo y Gobierno

¿Cómo rinde cuentas tu equipo de marketing por los resultados de la promoción de cada proyecto?

*Descripción:* Mide si cada persona sabe qué le toca en la promoción de los proyectos, si el equipo tiene metas y si decide y rinde cuentas con números del sistema.

*Costo de quedarse:* Qué se promociona en cada proyecto se decide por costumbre o por quien insiste más, y nadie responde por una meta: el equipo no sabe qué se espera de él.

**Inicial.**

- Los roles no están escritos, así que hasta lo del día a día —qué anuncio publicar, qué render aprobar— espera a que lo resuelva el gerente general. `[2.4.I1]`

**Funcional.**

*Resultado:* El equipo sabe qué se espera de cada uno, lo que se decide para cada proyecto se defiende con números y no con opiniones, y la dirección recibe cada mes cómo le fue a Marketing sin tener que pedirlo.

- El líder tiene un tablero con 4 a 6 métricas clave —interesados nuevos por proyecto, de dónde llegan, cuántos pasan a un asesor y cuántos llegan a visita— y lo consulta al menos una vez por semana. `[2.4.F2]`
- Las decisiones sobre qué promocionar y en qué enfocarse —qué proyecto, qué unidades, qué tipo de comprador— citan datos del sistema, no opiniones. `[2.4.F4]`

**Eficiente.**

*Resultado:* Una persona nueva se integra rápido y, donde hay asesores, Marketing trabaja con reglas acordadas con Ventas y con Servicio en vez de discutir cada vez quién se hace cargo de un interesado o de un comprador.

- Cuando entra alguien nuevo al equipo, hay un plan de inducción con sus pasos y materiales —los proyectos, la marca y las herramientas—; no se le entrena de memoria. `[2.4.E2]`
- El liderazgo coordina con Ventas —el traspaso de interesados a los asesores, los tiempos de respuesta acordados y una reunión conjunta con fecha fija— y con Servicio. `[2.4.E3]`

**Óptimo.**

*Resultado:* Lo que la IA puede decidir sola está escrito y tiene responsables, y la dirección decide con lo que deja cada canal frente a lo que cuesta, en unidades vendidas y en margen.

- Las decisiones se toman con lo que deja cada canal —el margen de las unidades que vende— frente a lo que cuesta. `[2.4.O4]`

*Se leen igual:* `2.4.D1`, `2.4.D2`, `2.4.D3`, `2.4.I2`, `2.4.F1`, `2.4.F3`, `2.4.F5`, `2.4.F6`, `2.4.E4`, `2.4.O1`, `2.4.O2`.

#### 2.5 Marca y Presencia

¿Qué guía a tu equipo cuando arma una pieza para publicar, como un anuncio, un render o un video?

*Descripción:* Mide si la marca y cada proyecto se ven y suenan igual en todo lo que sale, si está escrito a qué comprador le hablan y si el sitio aparece en buscadores.

*Costo de quedarse:* Cada anuncio se ve y suena distinto al anterior, tu mensaje no le habla a ningún tipo de comprador en particular y, cuando alguien busca tu marca o uno de tus proyectos, los buscadores muestran mal tu sitio, o no lo muestran.

**Funcional.** La marca, la voz y los perfiles de comprador están escritos y se usan, cada proyecto propio tiene su página, el sitio cumple lo básico para buscadores y se publica contenido propio cada mes.

*Resultado:* La marca y cada proyecto se ven y suenan igual en todo lo que sale, cada proyecto propio tiene dónde mostrarse completo, y el sitio es encontrable en buscadores con lo básico bien resuelto.

- Hay 2 o 3 perfiles de comprador escritos —por ejemplo, la familia que busca su primera vivienda o el inversionista—, cada uno con su recorrido de compra básico, etapa por etapa. `[2.5.F3]`
- Se publica contenido propio al menos una vez por mes, con cadencia previsible: videos del avance de obra, recorridos virtuales, guías para comprar o artículos del blog. `[2.5.F5]`
- Si la empresa vende proyectos propios, cada proyecto en venta tiene su propia página en el sitio, con renders, planos, ubicación, áreas comunes y fecha de entrega. `[2.5.F401 · comprobable]`

**Eficiente.**

*Resultado:* Los proyectos aparecen cuando alguien busca vivienda en su zona, tanto en buscadores como en asistentes de IA, con contenido pensado para cada tipo de comprador que importa, y cada reseña de quienes ya compraron, buena o mala, recibe respuesta.

- Los segmentos que más valen —como el inversionista o quien compra desde el exterior— tienen su propio perfil de comprador, escrito con detalle. `[2.5.E1]`
- Si el contenido propio se publica en el sitio, está organizado por temas —cada proyecto, cada zona, cómo comprar con crédito—: una página central por tema y contenido de apoyo que la refuerza. `[2.5.E2]`
- El recorrido de compra está dibujado de punta a punta, con los puntos de contacto de cada etapa: portales, redes, sala de ventas, visita y reserva. `[2.5.E4]`
- Se les pide una reseña pública —en buscadores, en los portales o en redes— a los compradores después de la firma o de la entrega de su unidad, y cada reseña, buena o mala, se responde dentro del plazo que fijó el equipo. `[2.5.E5]`

**Óptimo.**

*Resultado:* La presencia de cada proyecto se mantiene vigente sin que el equipo escriba cada pieza: la IA produce y ajusta el contenido para cada tipo de comprador y cada forma de buscar, y el equipo lo aprueba.

- Hay perfiles de comprador para grupos muy chicos de compradores, no solo para los segmentos grandes: por ejemplo, el inversionista del exterior que compra para alquilar por temporada. `[2.5.O1]`

*Se leen igual:* `2.5.D1`, `2.5.D2`, `2.5.D3`, `2.5.I1`, `2.5.I2`, `2.5.I3`, `2.5.F1`, `2.5.F2`, `2.5.F4`, `2.5.E3`, `2.5.O2`.

#### 2.6 Segmentación

¿Qué cambia en lo que recibe un interesado según su tipo de comprador y el proyecto que busca?

*Descripción:* Mide si cada interesado recibe un mensaje pensado para su tipo de comprador y el proyecto que busca.

*Costo de quedarse:* Le mandas la misma promoción a todos: el inversionista recibe el mensaje pensado para la familia que busca su primera casa, y ninguno de los dos se siente hablado.

**Funcional.** Los tipos de comprador están escritos, cada uno recibe piezas pensadas para él y hay criterios escritos para pasarle un interesado a un asesor.

*Resultado:* Cada tipo de comprador recibe un mensaje pensado para él, y los asesores reciben interesados que Marketing ya clasificó con criterios escritos.

- Existen al menos 2 segmentos con criterios escritos según qué busca o cómo decide cada grupo de compradores, no solo según dónde está: por ejemplo, quien compra para vivir y quien compra para invertir, o quien paga con crédito y quien paga de contado. `[2.6.F1]`
- La mayoría de las campañas del último trimestre tienen piezas distintas para cada segmento: no le hablan igual a la familia que busca su primera vivienda que al inversionista. `[2.6.F3]`
- Existen criterios escritos de qué es un suscriptor, un interesado y uno listo para pasar a un asesor —por ejemplo, porque pidió precios o una visita—, y Marketing clasifica cada contacto según ellos, a mano o con una automatización simple sobre los campos que usan esos criterios. `[2.6.F4]`

**Eficiente.**

*Resultado:* El mensaje se adapta solo a quién lo recibe y a la etapa de su búsqueda, y los asesores reciben primero a los interesados con más probabilidad de comprar.

- Hay secuencias distintas por segmento o por etapa del recorrido de compra: no recibe lo mismo quien recién mira proyectos que quien ya visitó uno. `[2.6.E1]`
- Hay un puntaje de interesados por reglas: un modelo que suma puntos por varios datos de cada interesado, como su perfil o lo que hizo, y lo clasifica al pasar un umbral —por ejemplo, como listo para pasar a un asesor—, y ese puntaje dispara las secuencias de nutrición. No es la clasificación de Funcional, que responde al valor de un campo, sin modelo de puntaje detrás. `[2.6.E3]`
- La segmentación usa datos de comportamiento —qué proyecto miró, qué recorrido virtual vio, qué correo abrió—, no solo lo que la persona declaró. `[2.6.E4]`

**Óptimo.**

*Resultado:* Cada interesado ve los proyectos y las unidades que le corresponden según lo que hizo antes, sin que nadie tenga que armar un segmento para él.

- Hay personalización uno a uno: la IA cambia en tiempo real lo que ve cada interesado en los mensajes, el sitio o la app según lo que hizo antes —como los proyectos y las unidades que miró—, dentro de las reglas que fijó el equipo; el equipo revisa los resultados, y en el sistema se ve qué versión vio cada interesado. `[2.6.O3]`

*Se leen igual:* `2.6.D1`, `2.6.D2`, `2.6.I1`, `2.6.I2`, `2.6.E2`, `2.6.O1`.

#### 2.7 Canales y Alcance

¿Cómo salen tus campañas por los canales que usas, como los portales, la pauta, las redes, el correo o WhatsApp?

*Descripción:* Mide si los canales que la inmobiliaria eligió salen con regularidad y bajo un mismo plan, si anuncian solo lo que está disponible y si se conoce lo que cuesta cada interesado.

*Costo de quedarse:* Tus proyectos llegan al mercado a ratos, o no llegan, sin un plan que coordine tus canales; cuando anuncias, ofreces unidades que ya se vendieron o se alquilaron, y no sabes cuánto te cuesta cada interesado.

**Funcional.** Los canales que la inmobiliaria eligió salen con regularidad y bajo un mismo plan, y anuncian solo las unidades disponibles.

*Resultado:* Una campaña sale coordinada por todos los canales del plan en vez de esfuerzos sueltos, lo que se anuncia está disponible, y el líder ve cuánto le cuesta cada interesado según el canal del que venga.

- Si la pauta pagada es parte del plan de canales, hay al menos una campaña corriendo con presupuesto definido: en buscadores, en redes o en los portales inmobiliarios. `[2.7.F3]`
- Si el canal conversacional, como WhatsApp, es parte del plan de canales, se usa para salir con la frecuencia que fija el calendario —el lanzamiento de un proyecto, una feria, una promoción—, no solo para responder lo que entra. `[2.7.F4]`
- Los canales que la inmobiliaria eligió en su plan —portales, pauta, redes, correo o WhatsApp— siguen el mismo calendario y la misma campaña: cada lanzamiento o promoción sale coordinado en todos ellos, no como esfuerzos sueltos. `[2.7.F5]`
- En el sistema se ve cuánto costó cada interesado —o cada venta, donde se compra sin asesor— el último mes, al menos por canal, como cada portal, la pauta o las redes. `[2.7.F6]`
- Los portales, la pauta y el sitio anuncian solo unidades disponibles: la que se reserva, se vende o se alquila deja de promocionarse dentro del plazo acordado. `[2.7.F401 · comprobable · hábito]`

**Eficiente.** Los canales comparten datos y uno continúa lo que empezó otro, la pauta se mueve entre canales según lo que cuesta cada interesado o cada venta, y se sabe cuánto cuesta cada visita y cada reserva.

*Resultado:* La inversión se mueve hacia el canal y el proyecto que traen visitas y reservas, los canales se refuerzan entre sí en vez de competir por el mismo interesado, y quienes ya compraron traen compradores nuevos.

- Los canales —también el conversacional, como WhatsApp, si se usa— comparten datos y se alimentan entre sí: uno continúa lo que empezó otro, hay remarketing activo a quien miró un proyecto y las audiencias se construyen desde el CRM. `[2.7.E1]`
- Si las ferias inmobiliarias, los eventos de lanzamiento, las jornadas de puertas abiertas o los webinars —por ejemplo, para inversionistas— son parte del plan de canales, se hacen como un canal recurrente, con fechas en el calendario. `[2.7.E2]`
- El presupuesto de pauta de cada proyecto se revisa al menos una vez por mes y se mueve entre canales según lo que cuesta cada interesado o cada venta en cada canal. `[2.7.E3]`
- Hay un programa de referidos activo: quienes ya compraron saben cómo recomendar el proyecto a un conocido, y cada referido queda registrado con quién lo trajo. `[2.7.E4]`
- En el sistema se ve cuánto cuesta cada visita y cada reserva en cada canal y en cada proyecto, no solo cada interesado. `[2.7.E401 · comprobable · requiere 1.3.F3]`

**Óptimo.**

*Resultado:* La inversión se reparte sola donde más reservas trae, dentro de los límites que fija el equipo; los compradores satisfechos traen compradores nuevos, y la empresa prueba canales nuevos sin esperar a ver qué hace la competencia.

- Los compradores que Servicio identifica como promotores se vuelven un canal de referidos y de testimonios sin pedirlos a mano: el sistema los invita solo, el equipo elige qué testimonios se publican, y en el sistema se ve quién trajo a quién. `[2.7.O4]`

*Se leen igual:* `2.7.D1`, `2.7.D2`, `2.7.I1`, `2.7.I2`, `2.7.I3`, `2.7.F1`, `2.7.F2`, `2.7.E5`, `2.7.O1`, `2.7.O2`.

#### 2.8 Medición y Aprendizaje

¿Qué te queda de cada lanzamiento o de cada campaña cuando termina?

*Descripción:* Mide si cada campaña se evalúa por los interesados y las reservas que trajo, y deja un aprendizaje.

*Costo de quedarse:* Repites en cada proyecto la pauta y los mensajes de siempre porque nadie anota cuáles trajeron interesados y reservas y cuáles no: cada lanzamiento empieza de cero, sin saber qué dejó el anterior.

**Funcional.**

*Resultado:* El equipo ve cómo le fue a cada campaña —los interesados o las reservas que trajo— sin armar el número a mano, y cada una deja una lección escrita para la siguiente.

- Cada campaña del calendario —un lanzamiento, una preventa o una feria, no cada publicación suelta— cierra con una revisión escrita de qué funcionó y qué no. `[2.8.F3]`
- Los resultados de cada campaña —los interesados o las reservas que trajo, no solo los clics— se ven en el sistema sin armarlos a mano. `[2.8.F5]`

**Eficiente.**

*Resultado:* El equipo sabe qué renders, mensajes y audiencias funcionan porque lo probó, no porque lo intuye, y lo aprendido cambia cómo se arma el lanzamiento siguiente.

- Hay pruebas A/B regulares (al menos una activa por mes): por ejemplo, dos renders o dos mensajes para el mismo proyecto. `[2.8.E1]`
- El proceso de campaña y la planificación de las campañas siguientes —también el lanzamiento del próximo proyecto— se refinan con base en lo aprendido. `[2.8.E3]`

*Se leen igual:* `2.8.D1`, `2.8.D2`, `2.8.D3`, `2.8.I1`, `2.8.I2`, `2.8.E2`, `2.8.O2`, `2.8.O3`.

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
- Cada comprador tiene registrado quién responde por él —una persona o, si son tantos que no se asignan por persona, un equipo— y recibe un contacto de seguimiento a tiempo —en los momentos que fija el proceso de posventa, por ejemplo, mientras espera su unidad o después de recibirla—, aunque no haya abierto casos; si responde un equipo, ese contacto puede ser un mensaje automático. `[3.1.F2]`
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

*Se leen igual:* `3.1.D2`, `3.1.I1`, `3.1.I2`, `3.1.E3`, `3.1.E5`, `3.1.O1`, `3.1.O4`.

#### 3.2 Tecnología y Automatización

Cuando un comprador escribe o llama, ¿cómo llega su caso al sistema y a quien lo tiene que atender?

*Descripción:* Mide si cada caso de un comprador llega solo al sistema y a quien lo atiende, y cuánto de la posventa se automatiza.

*Costo de quedarse:* Los reclamos se pierden entre el WhatsApp de quien vendió, el correo y las llamadas, y alguien tiene que repartirlos a mano: el comprador tiene que insistir para que lo atiendan.

**Deficiente.**

- Los reclamos y las consultas llegan al celular de quien vendió o al correo de cada persona. `[3.2.D2]`

**Funcional.**

*Resultado:* Cada consulta o reclamo que llega por los canales conectados entra al sistema y se le asigna a alguien sin que nadie lo reparta, y quien lo necesita se entera de cada cambio.

- Al entrar un caso, el sistema lo asigna automáticamente según una regla simple —por proyecto o por tipo de caso—; las notificaciones de cambio de estado llegan a quien las necesita. `[3.2.F5]`

**Eficiente.**

*Resultado:* Los plazos se vigilan solos y los casos que están por vencer suben solos a quien los tiene que resolver; el comprador puede ver y abrir sus casos y resolver lo simple sin esperar a nadie, y el líder ve en tiempo real cuánto hay abierto y qué quedó sin atender.

- Hay automatización de SLA —alertas antes del vencimiento y escalación automática, con reglas de cuándo se escala y a quién— y, si la posventa tiene más de una persona, las conversaciones y los casos se enrutan por varias condiciones, como el proyecto, el tipo de reclamo o el idioma. `[3.2.E1]`
- Hay un portal donde el comprador ve y abre sus casos —un reclamo de obra, un trámite—, y una base de conocimiento interna y pública. `[3.2.E2]`

**Óptimo.**

- Un agente de IA resuelve los casos de los compradores en todos los canales donde atiende la posventa, sin que intervenga una persona, y le pasa a una persona, con el contexto completo, lo que no puede resolver; el equipo revisa una muestra de sus respuestas y corrige lo que hace falta, y en el sistema se ve qué casos resolvió la IA y cuáles pasó. `[3.2.O1]`
- Las conclusiones que se calculan en el almacén central de datos vuelven al sistema de posventa: quien atiende ve en la ficha, por ejemplo, el riesgo de que un comprador desista antes de la escritura. `[3.2.O4]`

*Se leen igual:* `3.2.D1`, `3.2.I2`, `3.2.F4`, `3.2.F6`, `3.2.F8`, `3.2.E3`, `3.2.E4`, `3.2.E5`.

#### 3.3 Datos

¿De dónde sacas qué casos te llegan —reclamos, trámites, consultas—, cuántos y de qué compradores?

*Descripción:* Mide si los datos de cada comprador —su unidad y sus casos— están completos y ordenados para atender y decidir sin reconstruirlos.

*Costo de quedarse:* Cada vez que el comprador escribe tiene que decir qué unidad compró y volver a explicar su reclamo, porque nadie ve su historia completa.

**Funcional.**

*Resultado:* El líder sabe qué tipo de reclamos y consultas llegan y cuántos, y quien atiende tiene la historia de cada comprador en segundos.

- Cualquier persona de la posventa ve el historial de casos de un comprador en menos de 10 segundos. `[3.3.F1]`
- La ficha del comprador muestra la unidad que compró y su valor, no solo sus casos. `[3.3.F2]`
- Los datos clave del comprador —qué unidad compró y cuándo firmó— están completos en la mayoría de los registros. `[3.3.F3]`
- Cada caso tiene su tipo y su motivo, elegidos de una lista definida: por ejemplo, un reclamo de obra por humedad, por acabados o por instalaciones. `[3.3.F4]`

**Eficiente.**

*Resultado:* La empresa sabe qué tan rápido y qué tan bien atiende a sus compradores, cuánto tarda cada uno en tener su unidad sin pendientes y qué tan satisfechos quedan, con la satisfacción medida y no supuesta.

- Se mide el tiempo de primera respuesta y de resolución, y el cumplimiento de los SLA, en todos los canales, también en los reclamos de garantía. `[3.3.E1]`
- Se mide la satisfacción del comprador —con el NPS o el CSAT— con una cadencia definida, por ejemplo después de la entrega y al cerrar cada caso. `[3.3.E2]`
- Se mide cuánto tarda cada comprador en tener su unidad sin pendientes: el tiempo desde que empieza su entrega hasta que se cierra su último pendiente. `[3.3.E4]`

**Óptimo.** Los modelos anticipan los problemas de cada comprador antes de que los manifieste, con datos que se mantienen al día solos.

*Resultado:* La empresa sabe qué compradores están en riesgo de quedar mal con su entrega antes de que lo digan y, donde el cliente vuelve, cuáles están logrando lo que buscaban, con datos que se mantienen al día solos.

*Se leen igual:* `3.3.D1`, `3.3.D2`, `3.3.I1`, `3.3.I2`, `3.3.F5`, `3.3.F6`, `3.3.E3`, `3.3.E5`, `3.3.O1`, `3.3.O2`, `3.3.O3`, `3.3.O4`.

#### 3.4 Equipo y Gobierno

¿Cómo sabe el líder si la posventa va al día con los casos de los compradores?

*Descripción:* Mide si cada persona de la posventa sabe qué le toca, y si el líder sigue el avance con datos y pide cuentas.

*Costo de quedarse:* Nadie sabe bien a quién le toca acompañar la escritura, hacer la entrega o atender un reclamo, y el líder se entera de los atrasos cuando el comprador ya se quejó.

**Deficiente.**

- Nadie tiene claro qué le toca: entre acompañar la escritura, hacer la entrega y atender los reclamos, las tareas se pisan o quedan sin dueño. `[3.4.D1]`

**Funcional.**

*Resultado:* Cada persona sabe qué le toca, y el líder ve cada semana si la posventa va al día o se está atrasando.

- El líder tiene un tablero con 4 a 6 métricas clave —casos abiertos, reclamos por proyecto, pendientes de entrega, casos por tipo— y lo consulta al menos una vez por semana. `[3.4.F2]`

**Eficiente.** El equipo rinde cuentas por los plazos de atención, el líder prepara a quien entra, acuerda con Ventas qué trae cada comprador y, si un proyecto propio queda en condominio, el traspaso a su administración está acordado por escrito.

*Resultado:* El equipo responde por sus tiempos de atención, una persona nueva rinde rápido, cada comprador llega de Ventas con lo que se le prometió y, donde un proyecto propio queda en condominio, el paso a su administración no deja al propietario sin saber a quién acudir.

- Cuando entra alguien nuevo a la posventa, hay un plan de inducción con sus pasos y materiales —los proyectos, las garantías y los sistemas—; no se le entrena de memoria. `[3.4.E2]`
- El líder de la posventa acuerda con Ventas qué trae cada comprador —lo que busca y lo que se le prometió al vender— y el acuerdo se cumple: cada uno llega a la posventa con eso y, si los compradores vuelven a comprar otra unidad, la posventa le avisa a Ventas cuando uno se puede estar yendo. `[3.4.E4]`
- Si la empresa vende proyectos propios y el proyecto queda en condominio, el traspaso a su administración está acordado por escrito: qué se entrega, cuándo y a quién acude el propietario desde ese día para cada cosa. `[3.4.E401 · declarado]`

**Óptimo.** Hay responsables de validar la IA y de cuidar el conocimiento, y la posventa se mide por cómo reciben su unidad los compradores.

*Resultado:* Lo que la IA puede hacer sola está decidido y alguien responde por ella, y la posventa se mide por cómo reciben su unidad los compradores y por su disposición a recomendar —y, donde la relación es continua, por lo que retiene—, no solo por los casos que cierra.

- El sistema calcula cuánto cuesta atender a cada tipo de comprador —la posventa y, si las hay, las garantías— frente a lo que deja, y el líder usa ese dato para decidir cómo atenderlo. `[3.4.O4]`
- El equipo de posventa se mide por cómo reciben su unidad los compradores —entregas sin pendientes y su satisfacción— y por su disposición a recomendar, no solo por los casos que cierra. `[3.4.O401 · declarado · hábito · requiere 3.3.E2]`

*Se leen igual:* `3.4.D2`, `3.4.I1`, `3.4.I2`, `3.4.F1`, `3.4.F3`, `3.4.E1`, `3.4.O1`, `3.4.O2`, `3.4.O3`.

#### 3.5 Consistencia de la posventa

¿En qué se apoya tu equipo para que la respuesta y la entrega no cambien según quién atienda al comprador?

*Descripción:* Mide si el equipo conoce a sus tipos de comprador y si cada comprador recibe las mismas respuestas y la misma entrega, lo atienda quien lo atienda.

*Costo de quedarse:* El mismo reclamo se acepta o se rechaza según quién atienda, y cada entrega se hace a su manera: el comprador lo nota y se lo cuenta a sus vecinos.

**Deficiente.** No hay respuestas guardadas ni una forma común de entregar: cada persona responde y entrega a su manera.

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

- Quien atiende la posventa usa en su día a día las respuestas guardadas para los casos frecuentes —cómo reportar un pendiente, qué cubre la garantía—, no solo las tiene cargadas. `[3.5.E1]`
- El tono y la voz de marca se aplican a las respuestas, no cada persona con su estilo. `[3.5.E2]`

*Se leen igual:* `3.5.D1`, `3.5.E3`, `3.5.O1`.

#### 3.6 Priorización de compradores

¿Cómo decide tu equipo qué caso de un comprador se atiende primero?

*Descripción:* Mide si los casos se atienden según su gravedad y el tipo de comprador, y no según quién insiste más.

*Costo de quedarse:* Una filtración espera en la misma fila que una consulta sobre la escritura, y quien compró varias unidades recibe la misma atención que todos.

**Deficiente.**

- Los casos se atienden por orden de llegada o según quién los toma, sin mirar su gravedad ni quién es el comprador. `[3.6.D1]`

**Funcional.**

*Resultado:* Lo urgente se atiende primero y cada tipo de comprador recibe una atención acorde, sin que quien atiende tenga que reconstruir su historia.

- Cada caso tiene una prioridad asignada —urgente, alta, normal o baja— y el equipo la respeta: una filtración va antes que una consulta. `[3.6.F1]`
- Está escrito qué atención recibe cada tipo de comprador —por ejemplo, por qué canal se le atiende y quién lo acompaña—, y el equipo la aplica. `[3.6.F2]`
- Quien atiende usa la ficha del comprador —la unidad que compró y sus casos abiertos— para atenderlo con contexto, sin reconstruirlo a mano. `[3.6.F3]`

**Eficiente.** La atención cambia según el momento de cada comprador y, donde el cliente vuelve, cada cliente clave tiene un responsable dedicado.

*Resultado:* La atención cambia según el momento en que está cada comprador —por escriturar, por recibir su unidad, en garantía o listo para recomendar— y, donde el cliente vuelve, cada cliente clave tiene un dueño que lo conoce.

- Los compradores se segmentan para acciones diferenciadas según el momento de su relación: por escriturar, por recibir su unidad, en garantía o listos para recomendar; donde el cliente vuelve, sanos, en riesgo o con potencial de crecer. `[3.6.E2]`

**Óptimo.**

*Resultado:* Cada comprador recibe una atención a su medida en cualquier canal, incluso cuando se atiende solo, y nunca tiene que volver a explicar lo que se le prometió al vender.

- Cada comprador se atiende con el contexto de cómo llegó —el segmento del que viene y lo que se le prometió en la venta, como los acabados, las áreas comunes y la fecha de entrega—, que quien lo atiende, persona o IA, ve en su ficha sin volver a preguntarlo. `[3.6.O3]`

*Se leen igual:* `3.6.I1`, `3.6.E1`, `3.6.O1`, `3.6.O2`.

#### 3.7 Acompañamiento del comprador

¿Cómo te enteras de que un comprador tiene un problema con su unidad o con su entrega?

*Descripción:* Mide si el comprador sabe cómo va su unidad sin preguntar y si los problemas se atienden antes del reclamo.

*Costo de quedarse:* El comprador se entera del atraso de su entrega por un vecino o por la prensa, y tú te enteras de que quedó mal cuando lo publica en redes.

**Funcional.** Los reclamos que se repiten y las quejas se detectan, aunque sea a mano, los compradores clave reciben contacto antes de sus fechas críticas y, si la empresa vende proyectos propios, cada cambio en la fecha de entrega se avisa antes de que se cumpla la anterior.

*Resultado:* Los reclamos que se repiten, las quejas, las fechas críticas de los compradores clave y, si la empresa vende proyectos propios, los cambios en la fecha de entrega ya no toman al equipo por sorpresa: se actúa antes de que el problema crezca.

- Un comprador con reclamos repetidos por el mismo problema, una queja sin resolver o, si se piden calificaciones, una mala calificación se identifica, y alguien lo contacta antes de que el problema crezca. `[3.7.F1]`
- Los compradores clave —por ejemplo, quien compró varias unidades— reciben contacto antes de sus fechas críticas —la escritura, el fin de una garantía o, si la hay, una renovación—, no después. `[3.7.F2]`
- Si la empresa vende proyectos propios, cada comprador afectado por un cambio en la fecha de entrega recibe el aviso de la empresa —con la fecha nueva y la razón— antes de que se cumpla la fecha anterior. `[3.7.F401 · comprobable · hábito]`

**Eficiente.** Los problemas se ven venir, ningún caso del comprador se pierde aunque lo resuelva otra área —la obra, legal o cobros—, y el comprador recibe lo que necesita saber antes de pedirlo.

*Resultado:* Los casos del comprador no se pierden entre la posventa, la obra, legal y cobros, cada comprador sabe cómo va su unidad antes de preguntarlo y los problemas se atienden antes de que crezcan; donde la relación es continua, la empresa retiene clientes que antes se perdían sin aviso.

- Ningún caso del comprador se pierde entre áreas: si lo resuelve otra área —la obra, legal, cobros—, también queda en el sistema; y hay alertas automáticas, que le llegan a quien tiene que actuar, cuando un caso se atrasa, cuando se acerca una fecha crítica —una entrega, el fin de una garantía, una escritura— o, si se piden calificaciones, cuando un comprador califica mal. `[3.7.E4]`
- Cada comprador recibe, sin tener que pedirla, la información que necesita antes de los momentos clave —la escritura, la inspección previa, la entrega—, y sale de forma automática, no cuando alguien se acuerda. `[3.7.E5]`
- Si la empresa vende proyectos propios y la unidad se vende antes de terminarse, de la firma a la entrega cada comprador recibe en una cadencia fija cómo va la obra de su proyecto y la fecha de entrega vigente, sin tener que pedirlo. `[3.7.E401 · comprobable · hábito]`

**Óptimo.**

*Resultado:* La mayoría de los problemas que detecta el sistema —de la entrega, de la garantía o de un trámite— se resuelven antes de que el comprador los note, y cada comprador siente que la empresa se adelanta a lo que necesita y lo sorprende para bien.

- La mayoría de los problemas que detecta el sistema —de la entrega, de la garantía o de un trámite— se resuelven antes de que el comprador los note: el equipo valida la solución y en el sistema se ve que el comprador no tuvo que abrir un caso. `[3.7.O2]`
- Los compradores reciben, sin pedirlos, detalles pensados para deleitarlos —un obsequio al recibir la unidad, un beneficio en el aniversario de la entrega—, elegidos según la historia de cada comprador y el momento de su relación, y en el sistema queda qué recibió cada uno. `[3.7.O4]`

*Se leen igual:* `3.7.D1`, `3.7.D2`, `3.7.I1`, `3.7.F3`, `3.7.E1`, `3.7.E2`, `3.7.E3`, `3.7.O1`, `3.7.O3`.

#### 3.8 Escalabilidad de la posventa

¿Qué pasa con las preguntas que tus compradores hacen una y otra vez sobre la escritura, la entrega o la garantía?

*Descripción:* Mide si la posventa puede atender a más compradores sin crecer al mismo ritmo, gracias al autoservicio y al conocimiento documentado.

*Costo de quedarse:* Tu equipo responde a mano las mismas preguntas en cada proyecto, y cada unidad que entregas suma más de esas preguntas a la fila.

**Deficiente.** Las preguntas de siempre de los compradores se responden a mano, una por una: no hay nada publicado.

**Funcional.**

*Resultado:* El comprador puede consultar por su cuenta la respuesta a las preguntas de siempre —sobre la escritura, la entrega o la garantía—, y quien atiende la posventa remite a ella en vez de volver a escribirla.

- Las diez preguntas que más repitieron los compradores en el último trimestre —o todas, si son menos—, por ejemplo cómo usar la garantía, cómo reportar un pendiente o qué documentos pide la escritura, tienen una respuesta publicada que el comprador puede consultar por su cuenta, como el manual del propietario o las preguntas frecuentes. `[3.8.F1]`

**Eficiente.** Se documenta lo que enseñan los casos, el autoservicio empieza a liberar al equipo y, si la empresa vende proyectos propios, las fallas que se repiten llegan a quien diseña y construye.

*Resultado:* La empresa puede entregar más unidades sin sumar personas en la misma proporción, porque buena parte de lo que preguntan los compradores se resuelve sin abrir un caso, y, si vende proyectos propios, lo que enseñan los reclamos llega a quien construye el próximo proyecto.

- Al menos una vez por trimestre se revisan los casos que se repiten —por ejemplo, la misma falla en varias unidades de un proyecto— y, donde la relación es continua, las razones por las que se van los clientes, para encontrar patrones y mejorar. `[3.8.E2]`
- Si la empresa vende proyectos propios, los patrones de los reclamos de garantía se comparten con quien diseña y construye, para que el próximo proyecto no repita las mismas fallas. `[3.8.E401 · declarado · hábito]`

**Óptimo.**

- La IA aplica lo que aprende de los casos de los compradores a las respuestas guardadas, a la atención de cada tipo de comprador y a los avisos que reciben sin pedirlos, y el líder valida cada cambio; en el sistema queda qué cambió y de dónde salió. `[3.8.O3]`

*Se leen igual:* `3.8.D1`, `3.8.D2`, `3.8.I1`, `3.8.I2`, `3.8.F2`, `3.8.E1`, `3.8.E3`, `3.8.O1`, `3.8.O2`, `3.8.O4`.
