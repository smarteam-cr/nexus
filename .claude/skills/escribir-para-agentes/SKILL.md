---
name: escribir-para-agentes
description: Cómo escribir documentos que lee un agente. Úsala al crear o editar una skill, CLAUDE.md, o un doc al que apunta CLAUDE.md (ARCHITECTURE, DECISIONS, GLOSSARY, KNOWN-ERRORS, RUNBOOK).
---

Referencia para escribir cualquier documento que consume un agente: una skill, `CLAUDE.md`, un doc al que se llega por un puntero. El empaque cambia; la escritura no. Las mismas palancas hacen que el agente siga el mismo _proceso_ en cada corrida, no que produzca la misma salida.

Si lo que escribes es una skill, lee [`MECANICA-DE-SKILLS.md`](MECANICA-DE-SKILLS.md) (frontmatter, quién la invoca, skills enrutadoras).

## En Nexus

- **Un `@` en `CLAUDE.md` no es un puntero: es contexto siempre cargado.** Importa el archivo entero en cada sesión. Un puntero es una línea que nombra el doc y la condición para abrirlo («antes de tocar Cobranza, lee DECISIONS › Cobranza»).
- Todo en español con **tuteo**, nunca voseo. Los términos del dominio son los de `docs/GLOSSARY.md`.
- Las reglas que se pueden verificar con código no se escriben: se construye el chequeo (regla de ESLint, ratchet en `lib/**/*.test.ts`, escaneo estructural, invariante). Es la doctrina del repo («construir el chequeo antes que escribir la regla»).
- El porqué de una decisión va en `docs/DECISIONS.md`, una sola vez. Los demás docs apuntan ahí, no lo copian.

## Punteros de contexto

Un **puntero de contexto** es una referencia que vive en el contexto del agente, nombra material que está fuera y dice la condición para ir a buscarlo. La descripción de una skill es uno; una línea de `CLAUDE.md` que nombra un doc es lo mismo. La _redacción_ del puntero, no su destino, decide cuándo el agente llega al material y con qué confianza. Un destino imprescindible detrás de un puntero mal escrito es un bug de varianza: primero afila la redacción, y mete el material en línea solo si afilar no alcanza.

Un puntero hace dos trabajos: dice qué es el material y lista las **ramas** que deben disparar la lectura (una rama es un caso distinto que el documento maneja, así que corridas distintas toman caminos distintos). Cada palabra de un puntero siempre cargado se paga en cada turno, así que se poda más fuerte que el cuerpo:

- **La palabra clave adelante**: ahí hace su trabajo de disparo.
- **Un disparador por rama.** Sinónimos de una misma rama son una rama escrita dos veces: júntalos y deja solo las ramas de verdad distintas.
- **Saca la identidad que ya dice el cuerpo.**

## Las dos cargas

Cada documento y cada puntero que sumas gasta uno de dos presupuestos:

- **Carga de contexto**: el costo de lo siempre cargado en la ventana del agente (una línea de `CLAUDE.md`, la descripción de una skill), que gasta tokens y atención se use o no.
- **Carga cognitiva**: el costo para la persona de saber qué documentos existen y cuándo ir a cada uno. La persona es el índice. No hay que minimizarla: es el precio de que la persona decida. Gástala donde importa el juicio humano y sácala donde no.

Lo que solo se alcanza por un puntero se salva de la carga de contexto a cambio de la línea del puntero; lo que no tiene puntero cae entero en la carga cognitiva.

## Jerarquía de la información

Un documento se arma con dos tipos de contenido: **pasos** (las acciones en orden que hace el agente) y **referencia** (definiciones, reglas, hechos que se consultan cuando hacen falta). Se mezclan libremente. La decisión central es en qué peldaño va cada pieza, según qué tan inmediato lo necesita el agente:

1. **Paso en el archivo**: el peldaño principal. Lo que hace el agente, en orden.
2. **Referencia en el archivo**: se consulta cuando hace falta. Muchas veces es un conjunto plano de pares (todas las reglas de una revisión en el mismo peldaño), y está bien así.
3. **Referencia aparte**: en otro archivo, alcanzada por un puntero, cargada solo cuando el puntero se dispara. Puede ser un archivo hermano en la misma carpeta o un doc externo al que cualquier documento apunta.

Si bajas muy poco, arriba se infla; si bajas demasiado, escondes lo que el agente sí necesita. Esa tensión es toda la decisión.

**Revelación progresiva** es bajar por la escalera (sacar del archivo principal y poner detrás de un puntero) para que arriba siga legible. No es ante todo un ahorro de tokens: es como se protege la jerarquía. La prueba más limpia es por ramas: en línea va lo que necesitan todas las ramas, detrás de un puntero lo que solo algunas alcanzan. Cuando un documento tiene pasos, la referencia en línea que debería estar aparte los entierra y vuelve una moneda al aire que el agente los atienda.

**Co-ubicación** es lo complementario dentro del archivo: la escalera decide _qué tan abajo_ va una pieza; la co-ubicación decide _qué va al lado_. La definición, las reglas y las salvedades de un concepto van bajo un mismo encabezado, no repartidas. La prueba: el documento se lee como documentación escrita para el agente. (No es duplicar: duplicar repite un significado en dos lugares; repartir parte un significado en muchos.)

**Desparramo** es la falla: un documento demasiado largo aunque cada línea esté viva y sea única. La atención se adelgaza en el exceso y cada línea extra es otra que mantener vigente. La cura es la escalera: referencia aparte detrás de punteros, y partir por rama o por secuencia para que cada camino lleve solo lo suyo.

## Pasos y criterios de terminado

Cada paso termina en un **criterio de terminado**: la condición que le dice al agente que el trabajo está hecho. Dos propiedades lo vuelven palanca:

- **Claridad**: ¿el agente distingue hecho de no hecho? Un límite vago («se entendió») invita a **terminar antes de tiempo**: cerrar el paso cuando la atención ya se fue a _haber terminado_. Los pasos que quedan a la vista tiran; la claridad del criterio es la resistencia. Se defiende en orden: **primero afila el límite** (local y barato); solo si es irreduciblemente difuso _y_ ves el apuro, esconde los pasos siguientes partiendo la secuencia. Esconder solo funciona a través de un corte real de contexto (un traspaso o un subagente; una llamada en línea deja los pasos siguientes en el contexto).
- **Exigencia**: cuánto pide. «Cada modelo modificado contemplado» obliga a un trabajo exhaustivo donde «arma una lista de cambios» no. La exigencia empuja la **excavación** (lo que el agente investiga dentro del trabajo, implícito en la redacción) y no depende de que haya pasos: «cada regla aplicada» ata un cuerpo de referencia plana igual que «cada paso hecho» ata una secuencia.

Los criterios más fuertes son verificables y exhaustivos.

## Cuándo partir

Partir un documento en dos gasta una de las dos cargas, así que parte solo cuando el corte se lo gana:

- **Por secuencia**: parte una tanda de pasos cuando los pasos siguientes tientan al agente a apurar el que tiene adelante. Fuera de la vista, el paso actual recibe más excavación. Al revés también: juntar secuencias expone cada paso a lo que sigue e invita a terminar antes de tiempo.
- **Por invocación**, propio de las skills: ver [`MECANICA-DE-SKILLS.md`](MECANICA-DE-SKILLS.md).

## Palabras ancla

Una **palabra ancla** es un concepto compacto que el modelo ya trae de su entrenamiento y con el que piensa mientras ejecuta el documento (_lección_, _niebla de guerra_, _balas trazadoras_). Repetida como palabra, nunca como frase, acumula una definición distribuida y ancla toda una zona de comportamiento con la menor cantidad de tokens, porque recluta lo que el modelo ya sabe. Inventar una propia funciona si la defines bien, pero una palabra inventada no recluta nada: pagas en tokens de definición lo que una palabra conocida da gratis. Busca primero una que exista.

Ancla dos veces. En el cuerpo, la _ejecución_: el agente vuelve al mismo comportamiento cada vez que aparece la palabra. En un puntero, la _invocación_: cuando la misma palabra vive en tus pedidos, tus docs y tu código, el agente la conecta con el material y llega a él con más confianza. En Nexus ya hay varias: _chokepoint_, _ratchet_, _dry-run_, _guard_, _frontera_.

Busca dónde refactorizar con palabras ancla: una tríada escrita en tres lugares, un puntero que gasta una frase para señalar una idea. Cada uno pide colapsar en una palabra:

- «rápido, determinista, barato» → _ajustado_ (un ciclo _ajustado_).
- «un ciclo en el que confías» → _en rojo_: convierte una compuerta difusa en un estado binario observable (el ciclo se pone _en rojo_ con el bug, o no).

Ganas dos veces: menos tokens y un gancho más firme donde el agente cuelga lo que piensa.

**La negación** es la falla de al lado: guiar por prohibición mete en el contexto el comportamiento prohibido y lo vuelve _más_ disponible. _No pienses en un elefante_, y solo queda el elefante. Escribe en **positivo**: di el comportamiento que buscas («comentarios de una línea») para que el prohibido no aparezca. Una prohibición se gana su lugar solo como barrera dura que no se puede decir en positivo, y aun así va con el objetivo positivo al lado (CLAUDE.md lo hace bien: «Prohibido el gris crudo» va con la lista de tokens que sí van).

## Poda

- Cada significado en **una sola fuente de verdad**: un lugar con autoridad, para que cambiar el comportamiento sea editar un solo lugar. **Duplicar** cuesta mantenimiento y tokens, e infla la importancia de un significado más allá de su peldaño real.
- El **entorno** también es fuente de verdad (los scripts de `package.json`, los archivos de config, la estructura de carpetas, el `--help`), y un documento que lo repite es una **caché**: una copia de una consulta, que se gana su carga solo cuando la consulta es cara. Cachea lo que el agente no encuentra mirando: la convención no escrita, el porqué de una decisión, la trampa que ninguna config confiesa. Las consultas de un archivo o un comando déjalas al entorno, donde no envejecen.
- Revisa la **vigencia** de cada línea: ¿todavía tiene que ver con lo que hace el documento? Una línea la pierde por no tocar nunca la tarea (pura explicación, o una rama que debería estar aparte) o por envejecer. Sin disciplina de poda, el destino es el **sedimento**: capas viejas que se asientan porque sumar parece seguro y sacar parece riesgoso.
- Caza los **no-ops** frase por frase: una instrucción que el modelo ya cumple por defecto paga carga para no decir nada. La prueba (¿cambia el comportamiento frente al defecto?) depende del modelo, no del lector, y se zanja corriendo el documento, no discutiendo. Si una frase falla, bórrala entera en vez de recortarle palabras. La prueba también califica las palabras ancla: una palabra demasiado débil para ganarle al defecto (_sé cuidadoso_) es un no-op, y la salida es una palabra más fuerte (_implacable_), no otra técnica.
