/**
 * lib/manual/contenido.ts — LO ÚNICO que se escribe a mano de la Documentación.
 *
 * ── LA REGLA DE ESTE MÓDULO ──────────────────────────────────────────────────
 * Acá va SOLO lo que ninguna estructura del código sabe: para qué sirve un documento, cuándo
 * lo abres, qué te ahorra. Todo lo demás —qué documentos existen, sus secciones, qué agente
 * los genera, en qué etapa se trabajan, el orden del recorrido, los pipelines de HubSpot— se
 * DERIVA de los registros que ya son fuente de verdad (ver `lib/manual/armar.ts`).
 *
 * El motivo es simple: una documentación escrita 100% a mano miente a los tres meses. Ésta se
 * actualiza sola cuando alguien agrega un canvas, y `lib/manual/manual.test.ts` falla si ese
 * canvas nuevo se quedó sin su párrafo — la omisión no puede pasar en silencio.
 *
 * ⚠ El recorrido fue el contraejemplo: hasta el 2026-08-02 las etapas estaban escritas a mano
 * acá, y decían SIETE mientras el motor tenía NUEVE. Ahora la lista y el orden se derivan; a
 * mano queda una frase por etapa, con su guard.
 *
 * ── AUDIENCIA ────────────────────────────────────────────────────────────────
 * El EQUIPO de Smarteam (CS, Ventas, Marketing, Finanzas). Lenguaje de negocio, tuteo, cero
 * jerga técnica: nada de nombres de tabla, de archivo ni de función. La documentación técnica
 * ya existe y vive en ARCHITECTURE.md / docs/DECISIONS.md — no se duplica acá.
 */

export interface DocDePieza {
  /** Qué problema resuelve, en una o dos frases. */
  paraQue: string;
  /** En qué momento del trabajo lo abres. */
  cuando: string;
}

/* ── LA NARRATIVA SE MUDÓ A LA PÁGINA (2026-09-11) ────────────────────────────
 * «Qué es Nexus», «Qué te ahorra», «Qué NO hace», las introducciones de cada sección y los dos
 * bloques de HubSpot vivían acá como constantes y se pintaban desde el código. Hoy son contenido
 * EDITABLE de la página «¿Cómo funciona Nexus?» de la base de conocimiento, sembrado por
 * `lib/documentacion/semillas/como-funciona.ts`.
 *
 * Lo que SIGUE acá es lo que alimenta a los bloques vivos —las frases que ningún registro sabe,
 * con su test que falla si falta alguna—: las etapas, los documentos, los agentes, el menú y los
 * roles. Esa mitad no se puede editar desde la app a propósito: se deriva, y por eso no envejece.
 */

/**
 * Una frase por etapa: qué pasa ahí, en lenguaje de negocio. TODO lo demás de esta sección
 * —el orden, los nombres, qué documento se trabaja, cuál la cierra, cuáles son hitos y cuáles
 * son solo del ciclo de continuidad— se deriva del motor de etapas.
 *
 * ⚠ Las claves son las etapas del motor. `manual.test.ts` falla si el motor gana una etapa y
 * acá no está — que es exactamente lo que pasó con la versión anterior de este bloque, escrita
 * entera a mano: decía siete etapas y el producto mostraba nueve.
 */
export const ETAPAS: Record<string, string> = {
  HAND_OFF:
    "Ventas cierra y le pasa el cliente a Customer Success. Se arma el traspaso con lo que se vendió y lo que se prometió, y con eso el documento de arranque que se le presenta al cliente.",
  EXPLORACION:
    "Entender el negocio del cliente de verdad: cómo trabaja hoy, qué nos dijo y qué estamos dando por supuesto sin que nadie lo haya confirmado.",
  DIAGNOSTICO:
    "Nombrar con evidencia qué encontramos: dónde pierde tiempo, dónde se le caen los datos, qué le está costando plata.",
  PLANIFICACION:
    "Qué vamos a hacer, en qué orden y para cuándo. Acá nace el cronograma que el cliente aprueba y contra el que se mide el resto del proyecto.",
  CONFIGURACION_TECNICA:
    "Se construye: lo que se configura en HubSpot y, si el proyecto lo incluye, lo que hay que desarrollar a la medida.",
  ADOPCION:
    "El cliente empieza a usarlo con acompañamiento. Ya no hay documento que generar: hay sesiones y seguimiento.",
  OPERACION_CONTINUA:
    "El ritmo normal de una cuenta de continuidad: se trabaja mes a mes sin el recorrido completo de una implementación.",
  VALIDACION_USO:
    "Confirmar que el cliente efectivamente lo usa, no solo que se lo entregamos. Es la diferencia entre una entrega y una adopción real.",
  ENTREGA: "Se cierra el proyecto y, si corresponde, arranca la continuidad.",
  FINALIZADO: "El proyecto terminó. Queda como historia consultable del cliente.",
};

// ── Los documentos ─────────────────────────────────────────────────────────────

/**
 * Un párrafo por documento. La CLAVE es el identificador estable de la pieza
 * (`lib/pieces/registry.ts`), no su nombre visible: renombrar el canvas no rompe la doc.
 *
 * ⚠ Agregar una pieza al registro SIN agregarla acá hace fallar `manual.test.ts`. Es a
 * propósito: un documento nuevo sin explicación aparecería como una tarjeta muda.
 */
export const DOC_PIEZAS: Record<string, DocDePieza> = {
  handoff: {
    paraQue:
      "El traspaso de Ventas a Customer Success. Reúne qué se vendió, qué se le prometió al cliente y quién es quién de su lado, sacado de las reuniones de venta.",
    cuando:
      "Al arrancar el proyecto, antes de la primera reunión con el cliente. Es la base de todo lo demás: si el traspaso está flojo, el resto sale flojo.",
  },
  kickoff: {
    paraQue:
      "El documento de arranque que se le presenta al cliente: qué compró, cómo vamos a trabajar, qué necesitamos de su equipo y cuáles son los próximos pasos.",
    cuando:
      "Para preparar y sostener la reunión de arranque. Se le publica al cliente cuando está revisado.",
  },
  timeline: {
    paraQue:
      "El plan del proyecto por semanas: fases, tareas, quién hace cada cosa y para cuándo. También es donde se registra el avance real y por qué se movió una fecha.",
    cuando:
      "Se arma en la planificación y se mantiene vivo durante todo el proyecto. Es el documento que más veces vas a abrir.",
  },
  exploration: {
    paraQue:
      "La guía para descubrir el negocio del cliente. Separa lo que ya nos dijo —y por lo tanto no hay que repreguntar— de lo que estamos dando por supuesto sin haberlo confirmado. De ahí salen las preguntas de las próximas reuniones.",
    cuando:
      "Después del arranque, antes de sentarte a diagnosticar. Es interna: el cliente no la ve nunca.",
  },
  diagnosis: {
    paraQue:
      "Qué encontramos al mirar cómo trabaja el cliente hoy: dónde pierde tiempo, dónde se le caen los datos, qué le está costando.",
    cuando: "Cuando ya entendiste el negocio y puedes nombrar los problemas con evidencia.",
  },
  planning: {
    paraQue:
      "Qué vamos a hacer con lo que encontramos en el diagnóstico, y en qué orden. Es el puente entre «esto es lo que duele» y el cronograma.",
    cuando: "Después del diagnóstico y antes de comprometer fechas.",
  },
  "tech-requirements": {
    paraQue:
      "Qué hay que construir a la medida: integraciones, automatizaciones y objetos que no salen de configurar HubSpot. Incluye la arquitectura y la estimación.",
    cuando:
      "Solo en proyectos con alcance técnico. Si el proyecto no lo tiene, este documento no aparece.",
  },
  implementation: {
    paraQue:
      "La guía de trabajo semanal: qué hay que dejar configurado en HubSpot según el cronograma, paso a paso.",
    cuando: "Durante la configuración técnica, semana a semana. Es tuya, no del cliente.",
  },
  delivery: {
    paraQue:
      "El documento con el que se cierra el proyecto: qué se construyó, qué se logró, cómo se cumplió el plan y qué sigue. Se le presenta y se le comparte al cliente, como el kickoff.",
    cuando:
      "Cuando el proyecto llega a la entrega. Los números —tareas hechas, fases cerradas, cuánto se corrió el cierre— los calcula Nexus del cronograma, no los escribe la IA.",
  },
  "client-info": {
    paraQue:
      "El contexto del cliente que se va acumulando reunión tras reunión, más los procesos que le mapeamos. No pertenece a un proyecto: es del cliente entero y sobrevive a los proyectos.",
    cuando:
      "Cuando necesitas entender al cliente por encima de un proyecto puntual, o cuando entra alguien nuevo a la cuenta.",
  },
  "business-case": {
    paraQue:
      "La propuesta que Ventas le arma a un prospecto: qué le duele, qué le proponemos, qué gana y cuánto cuesta.",
    cuando:
      "Antes de que el cliente compre. Es de Ventas y vive fuera del proyecto, porque todavía no hay proyecto.",
  },
};

/**
 * Los documentos que NO tienen secciones, y por qué. Sin esto la ficha simplemente no pinta
 * nada y el lector no puede distinguir «no aplica» de «falta documentar».
 */
export const SIN_SECCIONES: Record<string, string> = {
  timeline: "Su contenido son fases y tareas en una línea de tiempo, no secciones de texto.",
  "client-info": "Se arma con los bloques que los agentes van sumando reunión tras reunión.",
  "business-case": "Sus secciones dependen del tipo de propuesta que elija Ventas al crearla.",
};

// ── Sección "Los agentes" ──────────────────────────────────────────────────────

/**
 * Qué hace cada agente, en lenguaje de negocio.
 *
 * ── POR QUÉ ESTO NO SALE DE LA BASE ──────────────────────────────────────────
 * Hasta el 2026-08-02 esta pantalla mostraba `Agent.description`: texto libre de la base,
 * editable desde `/agents` sin deploy, sin test y sin regla de audiencia. En la única pantalla
 * que declara "cero jerga técnica" se leía «Extrae información de las cards generadas por otros
 * agentes» y «lista de ActionItems con owner y dueDate sugeridos». Peor: el guard de privacidad
 * solo prohíbe el prompt, así que nada impedía que alguien pegara uno en ese campo y quedara
 * publicado, sin gate, a toda la empresa.
 *
 * La clave es el GRUPO del agente, no su id: el del handoff es un cuid y el catálogo evita
 * hardcodearlo a propósito. `AGENT_GROUP_TO_CANVAS` es el registro estable de los grupos, y
 * `manual.test.ts` falla si aparece uno sin frase.
 */
export const DOC_AGENTES: Record<string, string> = {
  handoff:
    "Lee las reuniones de venta del proyecto y arma el traspaso: qué se vendió, qué se prometió, quién es quién del lado del cliente y una primera propuesta de fases.",
  kickoff:
    "Toma el traspaso y lo convierte en el documento de arranque que se le presenta al cliente, con el tono y la línea gráfica de Smarteam.",
  cronograma:
    "Baja las fases del proyecto a tareas por semana, con responsable y duración, para que el plan deje de ser un título y se pueda seguir.",
  exploracion:
    "Compara lo que el cliente ya nos dijo contra lo que estamos dando por supuesto, y de ahí saca las preguntas para las próximas reuniones.",
  diagnostico:
    "Junta lo que se entendió del negocio y lo ordena en hallazgos con evidencia: qué está roto, dónde duele y qué le cuesta al cliente.",
  planificacion:
    "Propone qué hacer con cada hallazgo del diagnóstico y en qué orden, antes de comprometer fechas.",
  desarrollo:
    "Describe qué hay que construir a la medida —integraciones, automatizaciones, objetos— con su arquitectura y su estimación.",
  implementacion:
    "Arma la guía de configuración semana a semana: qué hay que dejar listo en HubSpot según el cronograma.",
  entrega:
    "Redacta el documento de cierre con lo que pasó en el proyecto. Los números no los escribe él: se los da Nexus ya calculados desde el cronograma.",
  businesscase:
    "Escribe la propuesta comercial para un prospecto a partir de lo que se habló con él: qué le duele, qué le proponemos y qué gana.",
};

// ── El menú ────────────────────────────────────────────────────────────────────

/**
 * Qué hay en cada sección del menú, en una frase.
 *
 * La CLAVE es la `key` del ítem en `components/layout/nav-config.tsx`, que es el registro
 * estable: el label puede cambiar (pasó con «Configuración» → «Integraciones») sin que la
 * explicación se pierda. Los nombres, las direcciones y quién ve cada sección NO se escriben
 * acá: salen del mismo registro que dibuja el menú.
 *
 * ⚠ Agregar un módulo al menú SIN agregarlo acá hace fallar `manual.test.ts`. Es a propósito:
 * una sección nueva sin explicación aparecería como una fila muda.
 */
export const DOC_MENU: Record<string, string> = {
  clients:
    "La cartera: todas las empresas, con sus proyectos adentro. Es la pantalla donde se trabaja el día a día de un cliente.",
  marketing:
    "El contenido de Smarteam: ideas, temas, campañas, la voz de marca y a quién le hablamos.",
  "customer-success":
    "El tablero del líder de CS: cómo viene cada cuenta, qué está trabado y qué cliente está en riesgo.",
  sales:
    "Lo que se vende: las propuestas para prospectos, el catálogo de casos de uso y las licitaciones de SICOP.",
  finanzas:
    "La plata: qué se cobró, qué está vencido y —para dirección— los costos, la caja y el punto de equilibrio.",
  audits: "Fotos del portal de HubSpot de Smarteam, con el análisis que les hace la IA.",
  sessions:
    "Todas las reuniones de Google Meet, ordenadas por cliente, con su minuta y sus compromisos.",
  knowledge:
    "La biblioteca que leen los AGENTES: metodologías, procesos y especificaciones de HubSpot. No es esta base: acá escribimos para personas.",
  documentacion:
    "Esta base: cómo funciona Nexus y cómo trabajamos. La escribe el equipo y la lee todo el equipo.",
  agents:
    "El catálogo de los agentes de IA y su calibración. Los agentes se disparan desde su documento, no desde acá.",
  team: "El equipo, sus roles y la matriz de permisos. Solo dirección.",
  roles:
    "Los perfiles de puesto y las propuestas laborales, como documentos que se pueden compartir por enlace.",
  config:
    "Lo que Nexus conecta con el mundo: HubSpot, Google, Claude y Odoo, con el estado de cada conexión y cuánto se gasta en IA.",
};

// ── Sección "Roles" ────────────────────────────────────────────────────────────

/**
 * Qué hace cada rol, en una frase. La clave es el valor del enum `TeamRole`.
 *
 * ⚠ Los PERMISOS exactos no se escriben acá: se derivan del registro de permisos. Esto contesta
 * la otra pregunta, la que ningún registro sabe: para qué está ese rol en la empresa.
 */
export const DOC_ROLES: Record<string, string> = {
  CSE: "Lleva sus propios clientes de punta a punta: explora, diagnostica, arma el cronograma y acompaña la adopción.",
  VENTAS: "Vende: arma propuestas, cierra tratos y traspasa el cliente a Customer Success.",
  DEV: "Construye lo que no sale de configurar HubSpot: integraciones, automatizaciones y desarrollos a la medida.",
  CSL: "Lidera Customer Success: mira la cartera entera, reasigna cuentas y es quien regenera un cronograma con IA.",
  MARKETING: "Maneja el contenido y la presencia de Smarteam, y ve a todos los clientes.",
  ADMIN: "Asistente administrativo: cobranza y finanzas del día a día.",
  SUPER_ADMIN: "Dirección: puede todo, incluida la administración del equipo y de los permisos.",
};

