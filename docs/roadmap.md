# Roadmap de Nexus

**Corte:** 2026-10-27

## Resumen

**Nexus en una frase:** el sistema donde Smarteam vende por resultados (casos de uso), los entrega con Customer Success y sabe cuánto le cuesta cada uno; cada persona entra y ve qué le toca hoy.

<!-- El resumen se arma con este bloque. Cómo se regenera: «Cómo se mantiene este roadmap» y la skill regenerar-roadmap. -->
```temas
{
 "dondeVamos": "La noche 3 está en producción: ya se puede probar la escala con cualquier empresa, el borrador 9.0 tiene lo de Insider y el test está listo para el corte. Lo que sigue en la escala y el test depende sobre todo de ti.",
 "temas": [
  {
   "n": 4,
   "nombre": "El análisis de la venta consultiva",
   "corto": "Análisis de la venta",
   "estado": "en-curso",
   "prioridad": 1,
   "resultado": "Ventas explora a fondo antes de proponer: cada vendedor ve cómo trabajó cada sesión.",
   "hecho": [
    {
     "fecha": "26 oct",
     "texto": "El analizador con citas verificadas, solo para super admin."
    },
    {
     "fecha": "27 oct",
     "texto": "Vive en la preventa: «Cómo trabajaste esta sesión», la pieza «Análisis» y la tendencia por vendedor."
    },
    {
     "fecha": "27 oct",
     "texto": "Rediseño: feedback de la sesión, sin comentarios ni siguiente paso."
    },
    {
     "fecha": "27 oct",
     "texto": "El análisis automático, prendido solo para las sesiones de las exploraciones; se quitó «Marcar como referencia»."
    }
   ],
   "sigue": "La prueba con Andrés (cinco sesiones reales) y, con su visto bueno, abrirlo a Ventas.",
   "decisiones": [
    20,
    40,
    41,
    42
   ]
  },
  {
   "n": 5,
   "nombre": "La escala de rendimiento",
   "corto": "Escala",
   "estado": "en-curso",
   "prioridad": 2,
   "resultado": "La escala ubica bien a cada empresa y muestra el camino hacia arriba.",
   "hecho": [
    {
     "fecha": "24 oct",
     "texto": "La versión 8.9.1 publicada."
    },
    {
     "fecha": "26 oct",
     "texto": "El borrador 9.0, con los 16 cambios de Insider."
    },
    {
     "fecha": "27 oct",
     "texto": "Probar la escala con cualquier empresa (Escala › Probar), con el resumen de cómo va para ti."
    },
    {
     "fecha": "27 oct",
     "texto": "El borrador 9.0 suma lo de Insider: tráfico suficiente, la lectura de preparación y el mapa de herramientas."
    }
   ],
   "sigue": "Probarla con 5 a 8 empresas de al menos 3 industrias y, con tus respuestas, publicar la 9.0. Falta el umbral de tráfico de Insider (lo usa provisional).",
   "teToca": "Contestar las 36 preguntas del borrador 9.0 y probar la escala con 2 o 3 empresas que conozcas (Escala › Probar).",
   "decisiones": [
    8,
    18,
    38
   ]
  },
  {
   "n": 6,
   "nombre": "Los tests del diagnóstico de rendimiento",
   "corto": "Tests",
   "estado": "en-curso",
   "prioridad": 3,
   "resultado": "El test de cada área vive en Nexus y llega a la preventa y a HubSpot.",
   "hecho": [
    {
     "fecha": "26 oct",
     "texto": "Las tres versiones del test, la página de resultados y la unión con la preventa."
    },
    {
     "fecha": "27 oct",
     "texto": "Los enlaces viejos del test abren en Nexus, y se mide cuántos abren, empiezan y terminan (Escala › Tests › Medición)."
    }
   ],
   "sigue": "El corte: un formulario nuevo de HubSpot (el viejo rechaza lo que manda Nexus), cambiar la dirección y apagar la aplicación vieja. Los pasos están escritos.",
   "teToca": "Aprobar las preguntas (Escala › Tests). Para el corte te armo un asistente paso a paso con HubSpot, Vercel y los anuncios.",
   "decisiones": [
    15,
    29,
    39
   ]
  },
  {
   "n": 8,
   "nombre": "El servicio recurrente funcionando",
   "corto": "Servicio recurrente",
   "estado": "en-curso",
   "prioridad": 4,
   "resultado": "Lo que pide el cliente se vuelve su siguiente caso, con su cadencia de entrega y reportes.",
   "hecho": [
    {
     "fecha": "25 oct",
     "texto": "El kickoff de SmartLoop y la exploración antes del diagnóstico."
    }
   ],
   "sigue": "El primer ciclo con cada CSE: RC Inmobiliaria, Honda y kölbi.",
   "decisiones": []
  },
  {
   "n": 9,
   "nombre": "El módulo de Tareas",
   "corto": "Tareas",
   "estado": "en-curso",
   "prioridad": 5,
   "resultado": "Un sistema de tareas sencillo, con sus fuentes claras y unido al calendario.",
   "hecho": [
    {
     "fecha": "27 oct",
     "texto": "Las tareas que nadie decidió se limpian (59 vencidas) y el seguimiento comercial va también a HubSpot."
    },
    {
     "fecha": "27 oct",
     "texto": "Tu piloto (Nexus lee tus reuniones internas) y unir una tarea a un evento del calendario; los dos, apagados."
    }
   ],
   "sigue": "En curso: la reunión del sprint sin el tope de 5 tareas y leyendo su conversación. Después, prender tu piloto y medirlo, y el diseño de la barra por cliente.",
   "teToca": "Prender tu piloto y la escritura de tareas en HubSpot («Lo que configuras tú», punto 8).",
   "decisiones": [
    7,
    10,
    19,
    43
   ]
  },
  {
   "n": 12,
   "nombre": "Que el equipo use Nexus",
   "corto": "Uso de Nexus",
   "estado": "en-curso",
   "prioridad": 6,
   "resultado": "10 de las 14 personas operativas entran 3 días o más por semana.",
   "hecho": [
    {
     "fecha": "19 oct",
     "texto": "Primera medición: 0 de 14, y el 7,4 % de lo que propone Nexus se decide a tiempo."
    }
   ],
   "sigue": "Medir otra vez ahora que lo nuevo está en producción.",
   "decisiones": []
  },
  {
   "n": 7,
   "nombre": "Vender por resultados",
   "corto": "Vender por resultados",
   "estado": "propuesta",
   "prioridad": 7,
   "resultado": "El vendedor arma la propuesta con casos de uso y actividades; Nexus calcula el precio mínimo y el precio se pone por valor.",
   "hecho": [
    {
     "fecha": "26 oct",
     "texto": "La preventa pregunta por departamento, con la investigación de la empresa."
    }
   ],
   "sigue": "El ejercicio de las actividades contigo; después, el catálogo y el cotizador.",
   "teToca": "El ejercicio de las actividades de los casos de uso, cuando tengas energía: destraba el cotizador, las tareas desde lo vendido y la rentabilidad.",
   "decisiones": [
    11,
    12,
    13,
    14,
    17,
    45
   ]
  },
  {
   "n": 10,
   "nombre": "Entregar: cronograma y tareas",
   "corto": "Entregar",
   "estado": "propuesta",
   "prioridad": 8,
   "resultado": "El cliente ve cómo va su proyecto y cada CSE sabe qué le toca hoy, sin 20 tareas de golpe.",
   "hecho": [
    {
     "fecha": "24 oct",
     "texto": "Una tarea «por validar» ya no llega al cliente."
    }
   ],
   "sigue": "Espera a las actividades (Vender por resultados): de ahí salen las tareas desde lo vendido.",
   "decisiones": [
    4,
    22,
    31
   ]
  },
  {
   "n": 13,
   "nombre": "Rentabilidad y capacidad",
   "corto": "Rentabilidad",
   "estado": "propuesta",
   "prioridad": 9,
   "resultado": "Saber cuánto cuesta entregar cada caso y cuánto tiempo gana Nexus.",
   "hecho": [
    {
     "fecha": "oct",
     "texto": "El costo por hora y las reuniones medidas."
    }
   ],
   "sigue": "Prender «¿cuánto te tomó?» con un CSE. La rentabilidad por caso espera a las actividades.",
   "decisiones": [
    2,
    3
   ]
  },
  {
   "n": 11,
   "nombre": "El diagnóstico y los entregables de Customer Success",
   "corto": "Diagnóstico",
   "estado": "funciona",
   "resultado": "Un diagnóstico corto escrito en minutos con lo que Nexus ya sabe, y una Planificación que el cliente entiende.",
   "hecho": [
    {
     "fecha": "23 oct",
     "texto": "Dos plantillas de diagnóstico y el enfoque de la solución."
    },
    {
     "fecha": "25 oct",
     "texto": "Todas las reuniones con texto entran al diagnóstico."
    },
    {
     "fecha": "27 oct",
     "texto": "La Planificación con las siete etapas del Brief."
    }
   ],
   "sigue": "Definir contigo los entregables de Customer Success.",
   "decisiones": [
    16,
    32,
    33,
    44
   ]
  },
  {
   "n": 1,
   "nombre": "La empresa: sus datos y su arquitectura",
   "corto": "La empresa",
   "estado": "funciona",
   "resultado": "La empresa es el centro de Nexus: sus datos con su fuente, su TAM, sus personas y su investigación, sincronizados con HubSpot.",
   "hecho": [
    {
     "fecha": "26 oct",
     "texto": "Datos y TAM, investigación, 1.772 personas y 14 propiedades nuevas en HubSpot."
    },
    {
     "fecha": "27 oct",
     "texto": "Los documentos de la empresa sin proyecto."
    }
   ],
   "sigue": "La carga inicial de los datos (espera a la CSL) y prender la escritura en HubSpot.",
   "decisiones": [
    5,
    6,
    23,
    24,
    25,
    26,
    27,
    35,
    36
   ]
  },
  {
   "n": 2,
   "nombre": "Las reuniones: la pieza angular del contexto",
   "corto": "Reuniones",
   "estado": "funciona",
   "resultado": "Toda reunión con alguien de fuera llega a su empresa y se lee, o dice por qué no.",
   "hecho": [
    {
     "fecha": "25 oct",
     "texto": "Las notas de Gemini cuentan y se leyeron 180 reuniones atrasadas."
    },
    {
     "fecha": "26 oct",
     "texto": "Una reunión reprogramada al futuro vuelve sola a «no leída»."
    }
   ],
   "sigue": "Medir el paso del 72 % al 90 % de reuniones con texto, y que las reuniones sin empresa lleguen a cero.",
   "decisiones": [
    21,
    34
   ]
  },
  {
   "n": 3,
   "nombre": "Las integraciones: Google, HubSpot, finanzas y la IA",
   "corto": "Integraciones",
   "estado": "funciona",
   "resultado": "Cada integración usa lo que su API de verdad permite.",
   "hecho": [
    {
     "fecha": "25 oct",
     "texto": "Meet cada 10 minutos con su API; HubSpot por un solo camino, con resúmenes, correos y avisos."
    },
    {
     "fecha": "26 oct",
     "texto": "El banco de Odoo y la IA por lotes."
    }
   ],
   "sigue": "Tus configuraciones del servidor y lo que queda de HubSpot.",
   "teToca": "Las configuraciones del servidor («Lo que configuras tú»).",
   "decisiones": [
    1,
    9
   ]
  },
  {
   "n": 14,
   "nombre": "Finanzas y cobranza",
   "corto": "Finanzas",
   "estado": "funciona",
   "resultado": "Lo facturado, lo cobrado y lo del banco cuadran solos; una persona decide solo lo dudoso.",
   "hecho": [
    {
     "fecha": "22 oct",
     "texto": "Lo que no cuadra se ordena solo y Mercury cobra sola."
    },
    {
     "fecha": "26 oct",
     "texto": "El banco de Odoo y la comisión de HubSpot desde Partner."
    }
   ],
   "sigue": "Mejoras, nada roto: el día del pago y el verde «en proceso de pago» desde Odoo, el depósito de Mercury en su cuenta, y pagar las comisiones desde Nexus.",
   "decisiones": [
    28,
    30,
    37
   ]
  }
 ]
}
```

## Las tarjetas en detalle

Lo que dice «Hoy» en cada tarjeta es del 24 oct, antes de construir: dónde va cada una ahora está en el Resumen y en las áreas de abajo.

**El orden:** las áreas van numeradas por dependencia: cada una usa lo de las anteriores. La empresa va primero porque todo cuelga de ella (sus datos, su investigación y su espejo en HubSpot); las reuniones van segundas porque son las que crean su contexto, y las integraciones terceras porque son por donde entra todo; la escala va después porque todo la lee (el test, la preventa, la propuesta, el diagnóstico y los ciclos de SmartLoop); los datos de la empresa le dan el perfil; el test es la puerta de entrada de los prospectos; con eso se vende por resultados, y lo vendido se entrega por SmartLoop, las tareas, el cronograma y los entregables. Las tareas van antes que el cronograma porque las tareas que nacen de lo vendido necesitan el módulo listo. **Lo urgente que pidió el equipo el 23 oct va justo después del paso uno, aunque su área esté más abajo** (los arreglos de SmartLoop, de la exploración y del diagnóstico: ver «Orden sugerido» en la pestaña «Roadmap»). **Cada tarjeta trae su criterio de éxito** (cómo sabremos que quedó, con un número cuando se puede) **y tus respuestas** del 24 oct (o las preguntas que quedan para después).

**Lo hecho estas semanas:**

- ✓ Los permisos de Google y de HubSpot, dados y probados el 24 oct: la API de Meet ya lee quiénes estuvieron y la transcripción frase por frase, y HubSpot ya deja leer los correos, los leads y las transcripciones de llamadas.
- ✓ Respondiste las preguntas de las tarjetas 1 a 7 y la primera de la 8 el 24 oct (están en cada tarjeta); el resto queda para después. Con eso arranca el paso uno.
- ✓ Respondiste las preguntas 23 a 26 el 24 oct: Areyas y Areyá ya están fusionadas, el contexto se trae por las 71 empresas activas y por lotes, el TAM v1 sale de cómo es la empresa (sin monto por nivel de la escala) y los datos de la empresa los deciden CSE, CSL, Ventas y los super admin.
- ✓ El paso uno entero, en producción el 24 oct (`9c47f79d`): la copia de Google Meet cada 10 minutos, con los invitados y las reuniones canceladas; las reuniones con solo notas de Gemini, que ahora se leen enteras; las 180 reuniones atrasadas, leídas por lote (US$3,81); un solo camino para hablar con HubSpot; el tablero de salud de las reuniones (Sesiones › «Ver la salud de las reuniones»); y los datos y la investigación de la empresa, con el TAM estimado v1. Prender el vigía ya no hace que Partner cree empresas solas.
- ✓ **La noche del 25 oct, en producción** (`e97f1a02`): la comisión de HubSpot sale de Partner (US$52.550 para el 15 de noviembre, contra los 51.000 a mano); Nexus sabe si una reunión ocurrió, quién del equipo estuvo y copia la transcripción por frases (483 reuniones revisadas, 46.393 frases); propone la empresa de las reuniones sin empresa, guarda por qué una quedó sin texto y le pregunta a quien estuvo; trae de HubSpot los resúmenes de reuniones y llamadas, los correos (98 %), los leads y las fusiones, y escucha sus avisos; la empresa escribe en HubSpot (14 propiedades nuevas creadas), tiene sus personas (1.772) y el perfil de Smarteam; y el kickoff de SmartLoop y el diagnóstico quedaron como pidió el equipo. Todas las invariantes nuevas en verde.
- ✓ **La segunda tanda, en producción el 26 oct** (`473377ae`): la preventa valida lo que el cliente marcó en el test, pregunta por departamento con el dinero y el método de Andrés, y lee la investigación y el perfil de Smarteam; el analizador de reuniones de venta juzga con citas verificadas (solo super admin, apagado hasta Andrés); el test de cada área vive en Nexus con su página de resultados (las preguntas esperan tu aprobación); el borrador de la escala 9.0 está en Escala › Borrador con sus preguntas; y Alex ve en Conciliación las 98 líneas del banco de Odoo sin conciliar.
- ✓ La escala 8.9.1 publicada (tu tarea #285 para revisarla), D0 (una tarea «por validar» deja de llegar al cliente en lo que se suba desde ahora, también en la ruta del servicio; falta el deploy, y la foto ya publicada de Wherex las sigue mostrando: «Lo que decides tú» 22) y U21 (el precio de Sonnet 5, corregido también en lo guardado).

### 1 · La empresa: sus datos y su arquitectura <span class="estado">En producción</span>

- **Resultado esperado:** la empresa es el centro de Nexus, como en un CRM profesional: sus datos (tamaño, industria, TAM, perfil, escala) en un solo lugar con su fuente, la investigación y los documentos colgando de ella aunque no haya proyecto, una persona del cliente con su rol, todo sincronizado con HubSpot en los dos sentidos, y un solo contexto que leen los agentes.
- **Hoy:** la industria vive en cinco lugares, el tamaño no se guarda, el TAM está vacío en las 200 empresas, Nexus no escribe en HubSpot lo que enriquece, un documento no puede existir sin proyecto («Información del cliente» es un proyecto falso) y las personas del cliente están en cinco copias sin unir.
- **Plan:** primero, los datos y la investigación en la empresa, el TAM calculado por Nexus («TAM v1»), propuestas que cualquiera hace y que decide o edita el usuario de Nexus que lo está usando, según su rol (24 oct), y las propiedades nuevas de HubSpot, con su tipo (los reportes, después) (`docs/empresa-datos-hubspot-plan.md`); después, documentos e investigaciones de la empresa; una persona con su rol; endurecer las llaves y limpiar lo viejo; y lo que le falta comprar a cada empresa (área R).
- **Criterio de éxito:** en las empresas activas (con un proyecto activo o una preventa abierta), tamaño, industria, perfil y TAM («estimado v1») llenos y con su fuente, y el mismo valor en HubSpot en el 100 %; 8 de cada 10 creíbles en una muestra que revisa su encargado; al menos la mitad de las propuestas usadas, editadas o descartadas en 14 días (hoy, en la ficha, 23 de 199). La industria es la columna `industry` (hoy llena en 47). El detalle, en `docs/empresa-datos-hubspot-plan.md` › «Criterio de éxito».
- **Respuestas (24 oct):**
  1. **Si HubSpot y Nexus no coinciden, decide el usuario** de Nexus que lo está usando, según su rol, y escribe en HubSpot con la sugerencia del agente.
  2. **Los reportes de HubSpot, después.** Lo importante ahora es que el usuario escriba en HubSpot con lo que sugiere el agente.
  3. **El TAM lo ve solo el equipo.**

### 2 · Las reuniones: la pieza angular del contexto <span class="estado">En producción</span>

- **Resultado esperado:** toda reunión con alguien de fuera llega completa a su empresa y se lee, o dice por qué no: con transcripción, con notas, presencial o sin empresa esperando que alguien decida.
- **Hoy:** en 90 días, de 1.264 reuniones con empresa, 545 tienen transcripción, 301 solo notas de Gemini (y Nexus las trata como sin texto) y 404 nada; hay 67 reuniones con texto que no son de ninguna empresa, y Nexus guarda a los invitados de cada reunión, pero no sabe quiénes estuvieron.
- **Plan:** un tablero de salud de las reuniones, las notas cuentan como texto, proponer la empresa de las que no tienen, el motivo de las que no tienen texto, la reunión presencial, la copia de Meet cada 10 minutos y quiénes de Smarteam estuvieron (área T).
- **Criterio de éxito:** las reuniones con cliente que dejan texto pasan del 72 % (149 de 207, que ya cuenta las notas) al 90 % (indicador 4). Las que no ocurrieron salen del denominador desde U3, y ese día se anota cuánto subió solo por eso. Aparte: 0 «leídas antes de terminar» (hoy 177) y 0 con solo notas sin lectura (hoy 301). INV47 (ninguna reunión con texto sin empresa más de 48 horas) en verde 7 días seguidos. El detalle, en `docs/reuniones-pieza-angular-plan.md` › «Criterio de éxito».
- **Respuestas (24 oct):**
  1. **Una reunión sin empresa la resuelve quien la organizó.**
  2. **El aviso va en la reunión misma, en Nexus,** para que la persona aporte el contexto, idealmente respondiendo unas preguntas que Nexus le hace con lo que sabe de las otras reuniones (T9).
  3. **El caso de Liliana quedó resuelto:** era «Cemaco | Data Hub» del 22 oct. La API de Meet dice que ocurrió (de 8:58 a 9:46, con 7 personas) y que nadie activó la transcripción ni las notas. Nexus la tiene en Cemaco, sin texto, y la guarda a la hora del evento (3 de la tarde), no a la real: U3 lo corrige.

### 3 · Las integraciones: Google, HubSpot, finanzas y la IA <span class="estado">En producción</span>

- **Resultado esperado:** cada integración usa lo que su API de verdad permite (la lección de Mercury): Google da la transcripción con quién habló, quiénes estuvieron y si la reunión ocurrió; HubSpot avisa sus cambios y trae los resúmenes de sus reuniones; Odoo dice en qué banco entró cada pago; y la IA cuesta lo que debe.
- **Hoy:** Google corre solo cuando alguien abre la app y no usa la API de Meet; Nexus le pregunta a HubSpot cada cierto tiempo (HubSpot no le avisa de sus cambios), los correos tienen el permiso desde el 24 oct pero todavía no entra ninguno, y 770 reuniones y 646 llamadas con transcripción no entran; Odoo tiene 98 movimientos del banco sin conciliar que Nexus no ve; el precio de Sonnet 5 en el panel de la IA está corregido, falta el deploy, y el ahorro por lotes nunca corrió.
- **Plan:** primero lo que no pide permisos nuevos (Google cada 10 minutos, el rescate de 177 reuniones, un solo transporte de HubSpot, el banco sin conciliar de Odoo); después la API de Meet, los resúmenes de HubSpot, las fusiones y los avisos de HubSpot (área U).
- **Criterio de éxito:** la copia de Meet corre cada 10 minutos o menos durante 7 días (`CronJobState.lastRunAt`), con la frescura mediana bajo una hora; 0 fallas de HubSpot por límite (429) sin reintento; entran al menos el 95 % de los correos; y el gasto de la IA que muestra Nexus queda a ±5 % de la factura de Anthropic (`LlmCall.costUsd` es una estimación).
- **Respuestas (24 oct):**
  1. **Los correos:** si no gastan IA, todos; si gastan, solo los de las empresas que lo necesitan (activas o usadas en Nexus).
  2. **La dirección de producción en HubSpot: sin decidir.** Te recomiendo registrarla, para que reconectar no dependa de tu PC; queda en «Lo que configuras tú».
  3. **El aviso de un job que deja de correr te llega a ti,** por ahora.

### 4 · El análisis de la venta consultiva <span class="estado">En curso</span>

- **Resultado esperado:** el principal problema de Ventas es que explora poco y va directo a la solución; el objetivo es alejarse de la venta transaccional y diagnosticar de forma profunda al cliente. Cada vendedor ve, en cada sesión, cómo la trabajó y qué le faltó explorar (es coaching, no control), y la ficha de cada prospecto muestra cómo se lo ha trabajado a lo largo de todas sus sesiones.
- **Hoy:** el criterio consultivo, quién habló y el análisis con citas verificadas están en producción desde el 26 oct, solo para super admin y con el análisis automático apagado, pero viven en Sesiones › «Ver la salud de las reuniones» › «Reuniones de venta», lejos de la preventa.
- **Plan:** área S, con el rediseño del 26 oct: la autoevaluación en el Análisis de cada sesión de exploración, la pieza «Análisis» del prospecto en la preventa, sacar el analizador de Sesiones, la tendencia por vendedor y la prueba con Andrés (`docs/analizador-reuniones-venta-plan.md`).
- **Criterio de éxito:** Andrés revisa 5 análisis y está de acuerdo con la mayoría; cada juicio trae su cita; y, con el tiempo, el cliente habla más que Smarteam en las exploraciones y más sesiones cierran con un siguiente paso con fecha.
- **Respuestas:** coaching, no control (23 oct); la tendencia, primero para los super admin y después para Ventas, cada uno con lo suyo (24 oct); el análisis va en la preventa y no en Sesiones, separado del análisis de cada exploración (26 oct).

### 5 · La escala de rendimiento <span class="estado">En curso</span>

- **Resultado esperado:** la escala ubica bien a cada empresa en Ventas, Marketing y Servicio, según su industria y su perfil, y muestra el camino hacia arriba; el mapa de herramientas dice qué pone HubSpot y qué pone Insider en cada paso.
- **Hoy:** corre la 8.9.1 desde el 24 oct (tu tarea #285 para revisarla). Para la 9.0 hay 17 temas y 124 puntos pendientes (`docs/escala/pendiente-9-0.md`) y, desde el 23 oct, lo de Insider: 16 cambios, la condición «tráfico suficiente» y la lectura «Preparación para engagement avanzado» (área N).
- **Plan:** probar la 8.9.1 con la empresa que elija cada usuario, hasta juntar 5 a 8 de varias industrias, nunca Wherex (el orden acordado para la 9.0); escribir la 9.0 con sus temas pendientes y lo de Insider juntos; el mapa de herramientas para la 9.0; y la lectura de preparación en la preventa y el diagnóstico.
- **Criterio de éxito:** la 9.0 publicada y probada con 5 a 8 clientes; por empresa y área se guardan el nivel que da la escala y el que cree su CSE, y coinciden en al menos 4 de cada 5.
- **Respuestas (24 oct):**
  1. **La escala se prueba con la empresa que el usuario quiera,** desde su preventa o su ficha, en el artefacto de la escala (N2).

### 6 · Los tests del diagnóstico de rendimiento <span class="estado">En curso</span>

- **Resultado esperado:** el test que llena un prospecto, por departamento, vive en Nexus: preguntas escritas para él, según su industria y su perfil, y un resultado atinado con la escala de hoy, una sola recomendación y los casos de uso que lo mueven.
- **Hoy:** es una aplicación aparte (`dev.smarteamcr.com/diagnostico-rendimiento`) con la escala vieja (v4): 8 preguntas iguales para todas las industrias, tres dimensiones sin la opción Funcional y un puntaje que mueve la IA. Nexus ya tiene el motor: el cuestionario de la escala y su cálculo, hoy solo para clientes.
- **Plan:** el test dentro de Nexus con el mismo motor, preguntas por industria, la página de resultados nueva, todo unido a la preventa y a HubSpot, tres versiones (la de Marketing, la web y la completa), y el corte de la aplicación vieja (área O).
- **Criterio de éxito:** la aplicación vieja apagada sin perder un solo lead: cada intento entra a Nexus y a HubSpot (diferencia 0 entre los dos), la tasa de intentos terminados entre visitas se compara antes y después del corte, y se sabe en qué pregunta abandonan. Antes, confirmar la nota «Diagnóstico de Rendimiento» («Lo que decides tú» 15).
- **Respuestas (24 oct):**
  1. **Tres versiones del test (O5):**
     - la de Marketing, de 4 preguntas fáciles, para conseguir el lead;
     - la web, de 8 preguntas (una por dimensión), que usan Marketing y Ventas para conseguir la primera reunión;
     - la completa, que la llena Customer Success en la exploración profunda, según el caso de uso o una exploración general.
  2. **La completa la llena el consultor, por equipo.** La escala ubica a un equipo, así que una empresa puede tener varias exploraciones: Ventas, servicio, Customer Success, sus clientes.
  3. **Las preguntas las revisas tú,** y el equipo te da su opinión al usarlas.

### 7 · Vender por resultados <span class="estado">Propuesta</span>

- **Resultado esperado:** el vendedor arma la propuesta con los casos de uso y las actividades que sugiere Nexus, cada una con su porqué; Nexus calcula el precio mínimo, el precio se pone por valor, y el cliente entiende qué resultado compra.
- **Hoy:** la biblioteca tiene 26 casos sin actividades ni horas, y el cotizador vive fuera de Nexus. Desde el 23 oct la preventa va por equipo del cliente, con preguntas técnicas y de proceso y una hora con tiempo para contarle.
- **Plan:** el analizador de reuniones de venta para que cada vendedor explore más y venda menos licencias (S, coaching con citas); lo que pidió Ventas el 23 oct para explorar (K): la siguiente pregunta de calidad, el departamento con la escala y el dinero, sesiones que se asocian solas, la primera sesión en frío con el position statement y los clientes similares. Después, el ejercicio contigo de la menor cantidad de actividades (A0), y con eso desarmar el cotizador en actividades, que cada caso las jale y que la propuesta las sugiera, con el documento de resultados por departamento antes (C5).
- **Criterio de éxito:** 5 propuestas reales salen de las actividades que sugiere Nexus; el vendedor cambia menos de 1 de cada 3 actividades sugeridas, ninguna propuesta queda bajo su precio mínimo, y el cliente no ve una sola hora; antes, el ejercicio de «la menor cantidad de actividades» (A0) aprobado por ti. Guardar el motivo de cada cambio es requisito de C2; si no entra, se mide solo la tasa.
- **Respuestas (24 oct):**
  1. **El ejercicio de las actividades (A0), amarrado a la preventa:** cada sesión que se analiza en la preventa lo complementa. Falta elegir con qué implementaciones reales empezamos.
  2. **Se vende por valor.** Las horas sirven para el precio mínimo y la rentabilidad, no para poner el precio.
  3. **El analizador primero lo ven los super admin,** y después todo Ventas, cada uno el suyo. Además, uno por cliente: cómo se ha tratado a ese cliente a lo largo de todas sus reuniones, para el líder y los super admin (S7).

### 8 · El servicio recurrente funcionando <span class="estado">En curso</span>

- **Resultado esperado:** lo que pide el cliente se vuelve su siguiente caso, y el servicio recurrente corre con su cadencia: entrega semanal, reporte de avance mensual y stakeholders cada tres meses.
- **Hoy:** SmartLoop todavía no tiene uso real: Honda y kölbi sin primer ciclo en Nexus, y RC Inmobiliaria arrancando con Liliana (desde el 23 oct su proyecto ya muestra el Kickoff). A kölbi ya se le ofrece SmartLoop y se cotiza como gobierno.
- **Plan:** un kickoff que sabe que es SmartLoop y el orden exploración → diagnóstico (M1 y M2); abrir el primer ciclo de cada cliente recurrente con su CSE y arreglar lo que salga al usarlo; las actividades que se repiten dejan su tarea en cada ciclo; las solicitudes del cliente con el CSE decidiendo y la CSL revisando; después, un agente por cliente que une lo que pide con la biblioteca.
- **Criterio de éxito:** RC Inmobiliaria, Honda y kölbi cierran su primer ciclo en Nexus (exploración, diagnóstico y entrega), y cada pedido del cliente tiene una decisión.
- **Respuestas (24 oct):**
  1. **El CSE puede aceptar una solicitud,** y la CSL siempre la revisa: al aceptarla, le nace una tarea de revisión.
  2. **Honda ya está andando.** Lo primero es traducir sus propuestas a casos de uso, y empezar desde ahí.

### 9 · El módulo de Tareas <span class="estado">Propuesta</span>

- **Resultado esperado:** un sistema de tareas profesional y sencillo: cada persona filtra por cliente en una barra a la izquierda, abre cada tarea en una vista grande y ordenada, la une a su sesión en el calendario, y recibe tareas propuestas de todas sus reuniones, con su fuente clara.
- **Hoy:** la tarea se abre en un cajón angosto con nombres que confunden («Para» y «Para quién»); no hay subtareas a la vista, ni fotos, ni forma de unir una tarea con un evento que ya existe; solo se leen las reuniones con clientes y los sprints.
- **Plan:** el diseño primero; después la barra por cliente, la vista grande con subtareas, el calendario y las sesiones, leer todas las reuniones de cada persona, y dejarlo listo para generar tareas desde lo vendido (área P).
- **Criterio de éxito:** 4 de los 5 CSE abren Tareas 3 días o más por semana (fuente: el latido de Uso de Nexus), y terminan o deciden la mitad de sus tareas antes de que venzan (hoy, de 105, 0 aceptadas y 37 vencidas; `medir-tareas-por-persona.ts` suma esa tasa). Tener menos de 10 por decidir cuenta solo si se llega decidiendo.
- **Respuestas (24 oct):**
  1. **Las subtareas llevan responsable y fecha.**
- **Para después:**
  1. ¿Arrancamos tu piloto de reuniones internas (H1) apenas la copia de Meet corra cada 10 minutos?

### 10 · Entregar: cronograma y tareas <span class="estado">Propuesta</span>

- **Resultado esperado:** el cliente ve de un vistazo cómo va su proyecto, y cada CSE sabe qué le toca hoy y esta semana, sin 20 tareas de golpe.
- **Hoy:** el cronograma lo arma el handoff y no está unido a las tareas, a propósito. A los CSE les llegaron 105 tareas en 45 días: ninguna aceptada. ✓ D0 (que una tarea «por validar» no llegue al cliente) quedó arreglado el 24 oct; falta el deploy.
- **Plan:** limpiar lo que hay y abrir tres puertas: el plan del proyecto nace en el handoff ya decidido, lo dicho con el cliente pasa por «Por decidir» y lo dicho puertas adentro deja tarea y revisión.
- **Criterio de éxito:** el 100 % de los proyectos nuevos nace con su plan en tareas, y 7 de cada 10 de esas tareas quedan hechas o `no_se_hara`; el cliente ve un resumen sin las tareas «por validar» (hoy, en Wherex, 4) ni las internas (hoy ve todas las del cronograma publicado, hasta D1).
- **Para después:**
  1. En su cronograma, ¿el cliente ve los casos con sus etapas y sesiones, o también cada entregable?
  2. Las 105 tareas que nadie decidió, ¿las cerramos en bloque o cada CSE revisa las suyas?

### 11 · El diagnóstico y los entregables de Customer Success <span class="estado">En producción</span>

- **Resultado esperado:** un diagnóstico corto que le explica al cliente por qué tiene los resultados que tiene y qué vamos a hacer (el enfoque de la solución), escrito en minutos con lo que Nexus ya sabe.
- **Hoy:** desde el 23 oct lee las sesiones de la exploración, avisa cuando casi nada está confirmado, trae el «Enfoque de la solución», todo se mueve y se quita, y se elige entre la plantilla esencial (7 partes) y la completa, o se escribe a mano.
- **Plan:** en el kickoff, la ruta de HubSpot Academy por rol y el pedido fijo del acceso a su portal (Q); lo que salió de usar el diagnóstico el 23 oct (L): las reuniones con solo notas cuentan, publicar dice por qué no, la ficha editable y todo movible; después, la Planificación con sesiones y entrenamientos, plantillas por caso de uso y qué necesita Customer Success para cada entregable.
- **Criterio de éxito:** Liliana genera, presenta y publica un diagnóstico sin tener que preguntar por qué no puede; cada kickoff nuevo trae la ruta de Academy y el pedido del acceso al portal, y el acceso queda «dado» en menos de 10 días hábiles en 8 de cada 10 proyectos (el criterio de Q).
- **Para después:**
  1. Las Acciones coherentes, ¿van en el diagnóstico o en la Planificación? («Lo que decides tú» 16)
  2. ¿Quién arma y mantiene la lista de cursos de Academy por rol?
  3. ¿Cuándo hacemos el chat por entregable (J1)?

### 12 · Que el equipo use Nexus <span class="estado">En curso</span>

- **Resultado esperado:** 10 de las 14 personas operativas entran 3 días o más por semana, y la mitad de lo que propone Nexus se decide antes de que venza.
- **Hoy:** 0 de 14 entran 3 días; se decide a tiempo el 7,4 % de lo que propone Nexus.
- **Plan:** menos cosas que decidir (las tres puertas de las tareas) y «Para ti» con el día y la semana.
- **Criterio de éxito:** los indicadores 1 y 3 de «Cómo va Nexus» llegan a su meta.
- **Para después:**
  1. ¿Quién revisa cada semana quién no entra: tú o el líder de cada equipo?
  2. Al llegar en la mañana, ¿qué debería abrir cada persona primero: «Para ti» o Tareas?

### 13 · Rentabilidad y capacidad <span class="estado">Propuesta</span>

- **Resultado esperado:** saber cuánto cuesta entregar cada caso y cuánto tiempo le gana Nexus al trabajo a mano.
- **Hoy:** Rentabilidad ya calcula el costo por hora con la planilla y mide las reuniones del calendario; el cálculo del resto del trabajo existe y falta el dato: 0 de 16 tareas con bloque agendado o estimado, y 0 respuestas a «¿cuánto te tomó?».
- **Plan:** prender «¿cuánto te tomó?», que nunca se prendió (G0); cada actividad trae su tiempo a mano (para el precio mínimo) y su tiempo con Nexus (la meta); se compara con lo que de verdad duró.
- **Criterio de éxito:** por cada caso entregado, lo estimado contra lo real y su margen, con datos de al menos dos proyectos. En G0, al menos la mitad de las preguntas respondidas; si no, no se abre al resto.
- **Para después:**
  1. Las tareas de gestión del cliente, ¿se cobran o solo se miden? («Lo que decides tú» 11)
  2. «¿Cuánto te tomó?», ¿se pregunta en toda tarea o solo en las que salen de lo vendido?

### 14 · Finanzas y cobranza <span class="estado">En producción</span>

- **Resultado esperado:** lo facturado, lo cobrado y lo que entró al banco cuadran solos; una persona decide solo lo dudoso.
- **Hoy:** «Lo que no cuadra» se cuenta por documento, Nexus ordena solo lo seguro (con «Deshacer») y Mercury cobra sola con el día en que se vio pagada.
- **Plan:** Stripe cuando Alex dé la clave, prender el corte de cobranza y pagar las comisiones desde Nexus.
- **Criterio de éxito:** los dos números de «Lo que no cuadra» bajan semana a semana, contados los lunes en Cobranza › Conciliación (`/cobranza/odoo`), y se cuentan antes del deploy de U15, con las 98 líneas del banco en una fila propia; lo que Nexus ordena solo es al menos el N % de lo que entra y se deshace menos de 1 de cada 20 («Lo que decides tú» 30); una persona decide solo lo dudoso.
- **Para después:**
  1. ¿Cuándo prendemos el corte de cobranza?
  2. Las 98 líneas del banco sin conciliar, ¿las revisa Alex en Nexus o en Odoo? («Lo que decides tú» 28)
  3. ¿Cuándo llega la clave de Stripe?

## Para qué

Que Nexus amarre los puntos: entrar a un cliente y ver todo lo que Smarteam está haciendo con él, y que cada persona sepa qué le toca hoy.

- **Esta pestaña tiene solo lo que falta.** Lo que ya está en producción está en «Hecho»; cómo funciona Nexus, en «Cómo funciona Nexus».
- **Sin tiempos ni semanas.** Cada cosa se hace cuando la pones a correr.
- **Los kickoffs y los diagnósticos no se tocan como datos.**

## Estado hoy

| Qué | Cómo está |
|---|---|
| Producción | Corre `40397282` desde el 27 oct: lo de antes más la noche 2 y la noche 3 (probar la escala, lo de Insider en el borrador 9.0, el corte del test preparado y el análisis automático de la venta, prendido solo para las exploraciones). Todos los SQL aplicados. |
| Por desplegar | Nada. **Sin aplicar, a propósito:** la carga inicial de los datos de la empresa (espera a la CSL), unir las 6 «Información del cliente» repetidas (borra copias: «Lo que decides tú» 36), y las banderas `EMPRESA_HUBSPOT_ESCRITURA` y `EMPRESA_HUBSPOT_COPIA` («Lo que configuras tú»). |
| En rojo en producción | 4 invariantes: el pipeline de Secure Title, «TEC- AE» fusionada en HubSpot y el corte de cobranza apagado (con su decisión abajo), y desde el 21 oct INV16(a): 2 reuniones de Meet leídas antes de ocurrir (un evento movido de fecha después de leerse, el caso conocido de KNOWN-ERRORS). |
| Pruebas | 25 para ti (pestaña «Pruebas para personas»; desde el 20 oct solo las que piden tu criterio), 81 que valida el equipo al usarlas, 77 con IA sobre los datos y 48 ya validadas por ti. |

## Cómo va Nexus

Funciona bien con los datos (ninguna mezcla de clientes, la agenda igual a Google Calendar, las copias al día), pero todavía se usa poco. Los números salen de la pasada de validación (`docs/validacion-2026-10-19.md`) y los mido cada semana.

**Los indicadores de éxito** (número de hoy → meta):

| # | Indicador | Hoy | Medido el | Cómo se saca | Meta |
|---|---|---|---|---|---|
| 1 | Personas operativas (CS, Ventas, Dev, Marketing) que entran 3 días o más por semana | 0 de 14 (hay 4 días de datos; nadie pasó de 2) | 19 oct | El latido de Uso de Nexus (`lib/uso/lectura-server.ts`), también para las entradas por persona | 10 de 14 en 4 semanas |
| 2 | Cuentas de la cartera con siguiente paso (tarea con fecha o reunión en 8 días) | 14 de 48 (29 %) | 19 oct | `scripts/medir-cuentas-sin-accion.ts` | 80 % |
| 3 | Lo que propone Nexus que una persona decide antes de que venza | 7,4 % | 19 oct | `scripts/uso-de-nexus.ts --dias 14` | 50 % |
| 4 | Reuniones con cliente que dejan texto para leer | 72 % | 19 oct | «Reuniones sin grabar» de Uso de Nexus, con 14 días fijos; `medir-transcripciones-faltantes.ts` no lo imprime (o la primera tarea de T1 es que lo imprima) | 90 % |
| 5 | Costo de IA por persona activa al mes | unos US$13 | 19 oct | El panel de gasto, entre las personas del indicador 1 | que baje mientras sube el 1 |

## Lo que decides tú

Sin esto, algo sigue mal o no se puede validar:

1. **El pipeline `924878469` de HubSpot** («Integración con Secure Trust | Secure Title»): Nexus no lo conoce y por eso Alejandro Rodríguez sale como CSE de Secure Title.
2. **«Empresa para pruebas»** está como cliente en la cartera (aparece en lo de la CSL): ¿la marco como interna o se cierra su proyecto? Y «Test CSE (vista Heiver)» sigue activo con rol CSL.
3. **La cartera del CSE:** ¿cuenta las cuentas que le compartieron, o solo las que lleva? (Juan Carlos: 13 contra 16.)
4. **Las tareas de seguimiento en «Por asignar · Customer Success»** de una cuenta sin CSE (4 en Secure Title): ¿pasan solas al encargado nuevo?
5. **«Fomento Urbano» y «Fomento Urbano S.A.»** parecen la misma empresa: ¿las fusiono?
6. **«TEC- AE»** apunta a una empresa fusionada en HubSpot: ¿la reapunto (`scripts/reapuntar-empresa-fusionada.ts`)?
7. ✓ **La reunión del sprint:** sacar el tope de 5 tareas por persona y leer también su conversación (unos US$0,014 por reunión). **Tu respuesta (27 oct): sí.**
8. ✓ **La escala 8.9.1:** publicada el 24 oct. Queda tu tarea #285 para revisarla en producción.
9. **El correo de la mañana:** mandarlo por Gmail o por un proveedor.
10. **La página de la sesión:** la minuta, la ficha y las novedades todavía se deciden en «Lo que dejó esta reunión». ¿Pasan también a Tareas (o a la agenda), para salir del todo de esa página? (Los pedidos fuera de alcance no: el 22 oct decidiste que siguen como avisos, ver la propuesta E1. La salvedad, del 24 oct: cuando el CSE acepta uno, a la CSL le nace una tarea de revisión.)
11. **Las tareas de gestión del cliente** (el seguimiento de 15 minutos, planear una sesión, la gestión del cambio que no es de un caso): ¿se cobran o solo se miden? Mi recomendación: se miden siempre, porque son el costo de servir la cuenta, y en el precio mínimo entran como un bloque fijo de horas al mes según la escala, sin detallarlas en la propuesta (`docs/actividades-plan.md`).
12. **El position statement base de Smarteam** (K3): ¿quién lo escribe? Te propongo un borrador con Marco a partir de las propuestas, y tú lo apruebas.
13. **Los clientes similares** (K4): ¿se pueden nombrar todos los clientes al presentarse, o hay algunos que no? La lista sería solo para el consultor.
14. **El banco de preguntas por departamento y los aprendizajes de Andrés** (K1 y K8): pedírselos para contrastarlos con lo que tiene Nexus.
15. ✓ **«Diagnóstico virtual»** (K7): confirmar con Marco que es el test en línea que deja la nota «Diagnóstico de Rendimiento» en HubSpot. **Tu respuesta (24 oct): sí, «Diagnóstico de Rendimiento» es la nota del test.**
16. **Las Acciones coherentes** (L4): ¿se quedan en el diagnóstico o pasan a la Planificación? Te propongo dejar en el diagnóstico el enfoque con tres o cuatro acciones en una línea, y pasar el detalle a la Planificación.
17. **El formato del documento de resultados de la preventa** (C5): lo define Ventas el lunes 27 oct.
18. **La calificación de clientes de Insider** (N4): pedirles el umbral de tráfico con que califican a un cliente; es el de la condición «tráfico suficiente». *(27 oct: todavía no tienes el dato; el borrador usa 50.000 visitas al mes, provisional.)*
19. **«Capacitación» en las tareas** (P1): ¿es la formación del equipo de Smarteam, la que se le da a un cliente, o las dos? Te propongo una categoría propia para la del equipo; la de un cliente va con su cliente asociado.
20. ✓ **Las reuniones de expansión con clientes** (S3): las conversaciones de venta con quien ya es cliente (como «Fase 2: Marketing» con CEMACO). Te propongo que entren al analizador desde el principio, porque la venta cruzada también se explora. **Tu respuesta (27 oct): ya se hizo, por ahora solo para las preventas.**
21. ✓ **El servicio para transcribir audio** (T5): para las reuniones presenciales grabadas con un teléfono, como la de Grupo Avis. Hoy Nexus no transcribe audio; hay que elegir un servicio (por ejemplo, el de Google, que ya usamos para Workspace). **Tu respuesta (24 oct): Speech-to-Text queda apagado por ahora.**
22. **El acceso externo de Wherex:** es excliente, su acceso al cronograma sigue activo (se usó por última vez el 5 oct) y su foto publicada trae 4 tareas «por validar» de antes de D0. Te propongo revocar el acceso; la otra salida es que alguien vuelva a subir su cronograma.
23. ✓ **Areyas y Areyá:** fusionadas el 24 oct; queda Areyá, con sus 3 proyectos y 31 reuniones (INV1 e INV2 en verde después).
24. ✓ **Cuánto gastar para traer el contexto:** las 71 empresas activas y por lotes, unos US$45 a 55 una vez y US$35 a 45 al mes (24 oct). Corre aparte del tope diario de US$10.
25. ✓ **El TAM de esta primera versión** (24 oct): sale de cómo es la empresa (tamaño, casa matriz o filial, empleados, industria, modelo de negocio), con las licencias a precio de lista e Insider si califica. Sin monto por nivel de la escala: los precios de los servicios los fija Ventas hasta que existan las actividades. Lo que cada cliente ya paga de licencias sale de su portal (Client Partners: plan `docs/integracion-hubspot-partners-plan.md`).
26. ✓ **Quién decide los datos de la empresa y los escribe en HubSpot** (`clientes.decidirDatos`): CSE, CSL, Ventas y los super admin, cualquiera de ellos (24 oct).
27. ✓ **Las opciones de las listas nuevas de HubSpot:** los rangos de tráfico del sitio y de base con consentimiento. ¿Los defines tú o te propongo unos? **Tu respuesta (24 oct): los propongo yo.**
28. ✓ **Las 98 líneas del banco sin conciliar** (U15): ¿Alex las revisa en Nexus o en Odoo? Si es en Odoo, U15 sale del paso uno. **Tu respuesta (24 oct): se revisan en Nexus.**
29. ✓ **El test de Marketing** (O2 y O5): ¿sus 4 preguntas salen de las 8 de la web o son propias? ¿Y el perfil corto (cierre, después y tráfico) se pregunta en la web, en la de Marketing o solo en la completa? **Tu respuesta (24 oct): las 4 salen de las 8 de la web.**
30. **Lo que Nexus ordena solo en «Lo que no cuadra»:** ¿qué porcentaje esperas, a fijar con Alex? Es la N del criterio de la tarjeta 14.
31. **Una tarea «por validar» que una persona marca hecha en el Gantt:** hoy conserva la marca, así que ni el cronograma del cliente ni la Entrega la muestran (una sola regla desde el 24 oct, porque la IA de avance también marca tareas hechas). Te propongo que marcarla hecha **a mano** le borre la marca; lo que marca la IA, no.
32. **Los Briefs de implementación ya llenos de los clientes actuales:** ¿se traen a la Planificación de cada uno, o solo los nuevos nacen en Nexus? (L4, `docs/planificacion-brief-plan.md`.)
33. **Con qué cliente prueba Caroline** la Planificación con el Brief.
34. **FACO:** ¿`facocr.com` es solo de Honda Costa Rica? Si sí, lo registro y 18 reuniones dejan de proponer «crear Faco». Y `hubspot.com`, ¿lo declaramos aliado? (13 reuniones.)
35. **kölbi y «TEC- AE»:** la búsqueda de fusiones confirma que kölbi apunta a su empresa vieja de HubSpot y que «TEC- AE» es la misma que «TEC». ¿Reapunto kölbi y fusiono las dos TEC?
36. **Las 6 «Información del cliente» repetidas:** son copias exactas; el script las une (borra las copias y muda 4 documentos de Librería). ¿Lo aplico?
37. **La comisión de HubSpot:** cuenta cada venta solo por los meses en que ya existía (reconstruye los pagos pasados con menos de 9 % de diferencia). ¿Te parece bien la regla?
38. ✓ **El borrador de la escala 9.0:** 36 preguntas en Escala › Borrador › «Lo que falta decidir» (las principales: si los cambios de Insider conservan su número, el grupo de control de 2.8.O3, «tráfico suficiente» y su umbral, y qué ejecuta la IA en los Óptimos que hoy se cumplen sin ella). Mientras haya preguntas abiertas, no se puede publicar. **No era una pregunta (27 oct): son las 36 preguntas que viven dentro del borrador; quedaron en «Te toca» de la escala.**
39. **Cuando alguien que ya está en HubSpot llena el test:** el test le manda a HubSpot el nombre, la empresa y el puesto que la persona escribió. Si su correo ya es un contacto (por ejemplo, alguien de un cliente), HubSpot reemplaza lo que tenía por lo que escribió en el test; la aplicación vieja hace lo mismo. ¿Lo dejamos así, o a los que ya son contactos solo les sumamos la nota del resultado, sin tocar sus datos?
40. ✓ **El analizador de venta:** entran solas las reuniones de prospectos y las de clientes con una preventa abierta y alguien de Ventas (95 en 90 días); «Fase 2: Marketing» de CEMACO se analiza a mano. Y la reunión de referencia no entra al análisis (es de otra empresa), se muestra al lado. ¿De acuerdo? **Tu respuesta (27 oct): el análisis automático, solo para las sesiones de las exploraciones de la preventa; «Marcar como referencia» se quita.**
41. ✓ **Quién confirma el análisis de una sesión de venta:** hoy cualquier super admin, incluso el vendedor. ¿Tiene que confirmar el líder (Andrés)? **Tu respuesta (27 oct): no; puede confirmar cualquier super admin.**
42. ✓ **Las expansiones de un cliente sin preventa** (como la Fase 2 de CEMACO): antes se analizaban a mano desde la reunión; ahora hay que abrirles una preventa. ¿Está bien así? **Tu respuesta (27 oct): sí.**
43. **«Por decidir» en Tareas:** el tope quedó en 5 sugerencias por persona (antes 10), y 59 que nadie tocó se vencieron. ¿5 o 6?
44. **La plantilla recomendada de la Planificación:** hoy el selector propone la completa. ¿Recomendamos una?
45. **«Cómo llegó» un prospecto:** sumé una quinta vía, «Por la web o un anuncio». ¿La dejamos?

## Propuesta por aprobar: vender y entregar por casos de uso

Sale de lo que decidiste el 22 oct sobre cómo vende y entrega Smarteam («resultados, no proyectos»). **Todo lo de esta sección es nuevo y espera tu aprobación**: nada se construye hasta que lo apruebes, área por área. Cada ítem dice de qué decisión sale, de qué depende y su plan por etapa.

**Cómo se despliega sin cambiar lo que ya funciona** (vale para toda la sección):

- Un vendedor sigue haciendo su preventa, su cotización y viendo a la empresa en la escala; Customer Success sigue haciendo su kickoff, su diagnóstico y su cronograma. Nada de eso cambia mientras se construye lo nuevo.
- Lo nuevo entra en **secciones nuevas o plantillas nuevas**, al lado de lo de hoy. Cambiar una sección existente se consensúa contigo antes, pantalla por pantalla, con su diseño en Claude Design.
- **Corte limpio en las entregas**: los proyectos nuevos nacen con el modelo nuevo; los que están en curso siguen con su handoff, su cronograma y sus tareas hasta que su CSE decida pasarlos. Nada se migra solo.
- Primero que funcione con buena arquitectura y genere buenos datos desde el día 1; después, pilotos con personas del equipo, y con lo que salga de ahí se ajusta el roadmap.
- Lo que ve el cliente habla en su idioma: nunca códigos de criterios ni letras de niveles, nunca horas ni créditos.

**Lo que choca con lo que ya existe** (se resuelve dentro de cada ítem):

| Hoy en Nexus | Lo decidido | Dónde se resuelve |
|---|---|---|
| El cotizador quedó fuera de Nexus (17 oct) | El cotizador se migra a la biblioteca de casos, con las actividades | A2 |
| SmartLoop dice «una prioridad a la vez» por ciclo | Varias áreas son varios carriles en paralelo | C1 |
| Los casos del catálogo se pensaron «sin calculadora» | Horas internas por actividad y caso (no es precio, y el cliente no las ve) | A2 |
| Dos casos de Insider y el de agentes de atención prometen de Inicial a Óptimo | La meta es el siguiente nivel | A5 |
| Las comisiones del CSE son un 5 % fijo (modelo del 21 oct) | El pago del CSE anclado a la escala | Más adelante |
| El cliente ve todas las tareas del cronograma, también las del equipo | El cliente ve un resumen, como se vendió | D1 |
| Las tareas del CSE nacen todas «por decidir» (en 45 días, 105 tareas y ninguna aceptada) | Las del plan del proyecto nacen ya decididas | D2 |
| El cotizador cambia las horas según el tamaño (una exploración de hora y media en una empresa grande) | El tiempo de cada actividad es uno; cambia cuáles y cuántas | A2 |
| «Contarle» prohíbe nombrar casos de otros clientes | Mostrar con qué clientes de la misma industria trabajamos | K4: la lista es solo para el consultor, nunca en un documento del cliente |
| Nada que nazca en Nexus se crea en HubSpot (Tareas, oct) | La tarea de seguimiento comercial va también a HubSpot | D4: solo para el seguimiento con un contacto o negocio |
| La exploración no es una etapa del ciclo de SmartLoop y «Qué sigue» va directo al diagnóstico | Primero exploración, después diagnóstico | M2 |

**Cómo se construye cada parte** (vale para todas; el detalle está en ARCHITECTURE):

1. **Primero se mira, después se diseña, después se programa.** Cada parte arranca leyendo los datos reales en solo lectura; las pantallas internas nuevas pasan por un diseño en Claude Design que revisas tú; y lo que cambia cómo se comporta un módulo se escribe en DECISIONS antes del código.
2. **Cada etapa se despliega sola** y no rompe lo de hoy: lo nuevo entra al lado de lo viejo, y lo viejo se retira cuando lo nuevo ya se usa.
3. **El SQL va antes del código**, solo aditivo y que se pueda correr dos veces; `check:esquema` en verde antes del deploy.
4. **La lógica vive en `lib/<módulo>` con sus pruebas** desde el primer día; la pantalla solo muestra. Toda lectura de reuniones pasa por el chokepoint (`lib/sessions/project-sources.ts`).
5. **Lo que escribe en masa va en simulacro primero**, y el `--apply` después de leer la salida.
6. **Toda IA nueva se mide** (cuánto cuesta cada corrida) y se prueba con 5 casos reales antes de abrirla al equipo.
7. **Cada integración tiene un solo transporte** (reintentos y límites en un lugar) y cada job avisa si deja de correr.
8. **Una parte está terminada cuando cumple su criterio de éxito**, no cuando está construida. Cada criterio trae su número de hoy, de dónde sale (una consulta, un script o una pantalla) y un uso o un resultado real. Si solo dice que algo existe («trae», «se ve», «en marcha»), es una prueba de aceptación, no un criterio.
9. **Cada etapa dice cómo se vuelve atrás sin un deploy de emergencia.** Un job nuevo lleva su bandera en `lib/jobs/requisitos.ts`, declarada en `.env.example`. Un cambio de comportamiento va detrás de una constante o una bandera. Lo que escribe en HubSpot guarda el valor anterior y tiene un script de vuelta. El RUNBOOK lleva «Volver atrás:» por cada job.
10. **Cada plan dice qué pruebas lleva** (ARCHITECTURE, cap. F). `check:esquema` no ve llaves foráneas ni índices únicos: esos se vigilan con una invariante.
11. **Tú pruebas en el 3004, con datos reales.** La base local es solo para las pruebas automáticas que corren las sesiones de código (lo que arregló el paso cero); no la necesitas para tus pruebas.
12. **Cada cambio pasa por `/revisar` antes del commit, y cada rama antes de juntarse en `main`:** un batallón de agentes revisa los riesgos de Nexus, dos escépticos verifican cada hallazgo, se comprueba que las pruebas nuevas se pongan en rojo sin el cambio, y el informe dice siempre lo que la revisión no garantiza.

**Los planes escritos** (cada uno es la fuente de su parte):

- `docs/actividades-plan.md`: qué es una actividad, sus dos tiempos, el tamaño y el ICP, quién elige y las tareas que nacen del plan. Sirve a A, C2, D2 y G.
- `docs/tareas-plan.md` § 17: las tres puertas de las tareas y la tarea de seguimiento en HubSpot. Sirve a D2, D4 y H.
- `docs/exploracion-mejoras-plan.md`: el feedback de Ventas y Customer Success del 23 oct sobre explorar, en la preventa y con los clientes, y lo que sirve del método de Andrés. Sirve a K.
- `docs/diagnostico-plantillas-plan.md` § «Lo que salió de usarlo»: el diagnóstico y la planificación después de usarlos. Sirve a L.
- `docs/planificacion-brief-plan.md`: la Planificación con lo que pide el «Brief de implementación» de Smarteam (sus 20 pestañas, dónde queda cada una, siete etapas sin SQL). Sirve a L4 e I2.
- `docs/smartloop-plan.md` § «El recorrido de punta a punta»: SmartLoop con lo que salió de RC Inmobiliaria. Sirve a M.
- `docs/escala-engagement-avanzado-plan.md`: la escala con engagement avanzado (criterio por criterio, «hoy dice / pasaría a») y los casos de Insider por industria, de la sesión con Insider One. Sirve a N, A6 y B1.
- `docs/tests-diagnostico-plan.md`: el test público de cada departamento dentro de Nexus, con el diagnóstico de la aplicación de hoy. Sirve a O.
- `docs/tareas-organizacion-plan.md`: el módulo de Tareas organizado (barra por cliente, la tarea en un modal grande, el calendario, las subtareas y leer todas las sesiones). Sirve a P, D2 y H.
- `docs/kickoff-mejoras-plan.md`: la ruta de HubSpot Academy y el acceso al portal en el kickoff. Sirve a Q.
- `docs/arquitectura-empresa-plan.md`: la empresa como objeto central (datos en columnas, HubSpot en los dos sentidos, documentos sin proyecto, personas, contexto único para los agentes y venta cruzada). Sirve a R, B, C5, K y E2.
- `docs/empresa-datos-hubspot-plan.md`: el paso uno: los datos y la investigación en la empresa, el TAM, proponer y decidir, y el catálogo de propiedades de HubSpot para reportar. Sirve a R1, R2, R5 y B1.
- `docs/analizador-reuniones-venta-plan.md`: el analizador de reuniones de venta, para coaching. Sirve a S, K1 y K7.
- `docs/reuniones-pieza-angular-plan.md`: las reuniones como la pieza angular del contexto, con lo medido en 90 días. Sirve a T, L1, K5, H1, P5 y S.
- `docs/integracion-google-plan.md`: Google Workspace, lo que hace hoy, lo que permiten las APIs de Meet, Workspace Events, Calendar y Speech-to-Text, y lo que tienes que configurar. Sirve a U1 a U5 y a T.
- `docs/integracion-hubspot-plan.md`: HubSpot, del sondeo a los webhooks, los resúmenes de sus reuniones, las fusiones, los leads y Nexus dentro de HubSpot. Sirve a U6 a U14, R2 y B3.
- `docs/integraciones-finanzas-ia-plan.md`: Odoo, Mercury, Stripe, Claude, Apify, Supabase y Sentry. Sirve a U15 a U24.
- `docs/integracion-hubspot-partners-plan.md`: HubSpot como partner: lo que da de tus clientes (licencias, MRR, comisión, uso), lo que Nexus ya copia y lo que falta usar. Sirve a U25 a U31, R1 (lo que ya paga) y Finanzas (comisiones).
- `docs/propuestas-por-casos-plan.md`: recomendar el caso, la cotización que sale de las actividades, «lo que viene después», las implementaciones de hoy leídas como casos y el documento de resultados. Sirve a C.
- `docs/entrega-por-casos-plan.md`: el cronograma con casos, las tareas por tres puertas, lo hablado en una sesión y el seguimiento en HubSpot. Sirve a D.
- `docs/expansion-y-adopcion-plan.md`: fuera de alcance y solicitudes, el agente de cada cliente y la auditoría de adopción. Sirve a E y F.
- `docs/rentabilidad-por-caso-plan.md`: el tiempo estimado y real por tarea, la rentabilidad por caso y la capacidad con las horas de las actividades. Sirve a G.
- `docs/entregables-cs-plan.md`: las plantillas de cada entregable y qué necesita Customer Success para cada uno. Sirve a I y J.

**La noche 3: en producción el 27 oct (`40397282`).** Aprobada el 27 oct, para terminar las tarjetas 4, 5 y 6; el borrador 9.0 ya tiene los puntos de Insider.

| # | Pieza | Resultado de negocio |
|---|---|---|
| 1 | Probar la escala con cualquier empresa (N2) | Cualquiera del equipo prueba la escala con la empresa que elija y compara lo que da con lo que cree; así se juntan los 5 a 8 clientes para publicar la 9.0 |
| 2 | Lo que falta de Insider (N4, N6, N7) | La escala pregunta si hay tráfico suficiente, dice si la empresa está lista para herramientas avanzadas sin cambiar su nivel, y el mapa dice qué habilita cada herramienta |
| 3 | El corte de la aplicación vieja, preparado (O6 etapas 1 y 3) | Los enlaces viejos siguen funcionando y se mide el abandono por pregunta; el cambio de dirección espera tu aprobación de las preguntas |

Con la noche, también en producción: el análisis automático de la venta, prendido solo para las exploraciones, y sin «Marcar como referencia» (S). Fuera, a propósito: las actividades de los casos de uso (A0, cuando tengas energía) y las mejoras de Odoo y Mercury (U16 a U18: funciona, solo se afina).

**La noche 2: en producción el 27 oct (`08442a43`).** Aprobada el 26 oct; las cinco piezas quedaron así (la unión automática de sesiones, la escritura en HubSpot de las tareas y tu piloto se prenden con su bandera: «Lo que configuras tú»): Cinco piezas que no esperan a nadie, cada una con su deploy:

| # | Pieza | Resultado de negocio |
|---|---|---|
| 1 | **Primero, las exploraciones por equipo** (K5, K6, K2, K10 y el equipo en las reuniones elegidas a mano) | La reunión con un equipo del cliente se asocia sola a su sesión planeada, y Nexus pregunta solo cuando duda; un botón «Agregar algo que sabes» que entra entero a la guía; la primera sesión de un prospecto en frío abre la puerta; ves quién llenó el test de cada área de una empresa; y el diagnóstico sabe de qué equipo es cada reunión, también en las elegidas a mano |
| 2 | **El análisis de la venta consultiva, en la preventa** (S4 a S7) | Cada vendedor se autoevalúa en el Análisis de cada sesión de exploración; la preventa suma la pieza «Análisis» del prospecto con todas sus sesiones (exploración y propuesta); el analizador sale de Sesiones; y tú ves la tendencia de cada vendedor |
| 3 | Tareas que se ordenan solas (D2 etapa 1, D4) | Se limpian las tareas que nadie decidió, y las de seguimiento comercial quedan también en HubSpot, sincronizadas en los dos sentidos |
| 4 | Tu piloto de tareas y el calendario (H1, P3, P5) | Nexus lee tus reuniones internas y te propone tareas; una tarea se puede unir a un evento que ya existe |
| 5 | El kickoff y lo que falta de la Planificación y de la empresa (Q, L4 etapas 5 a 7, R3 etapas 2 y 3) | El kickoff trae HubSpot Academy y el acceso al portal; la Planificación genera la lista de construcción en Tareas y el cliente llena su parte; los documentos de la empresa sin proyecto se ven y se comparten |

Fuera de la noche 2, porque necesitan a una persona: el ejercicio de las actividades contigo (A0), el position statement y los clientes de referencia con Marco (K3, K4; de las exploraciones, lo único que espera a alguien, junto con revisar cinco guías con Marco y el banco de preguntas de Andrés), el primer ciclo con cada CSE (M3) y validar el analizador con Andrés (S6).

**Orden sugerido, por dependencias** (el foco es que Ventas y Customer Success queden funcionando):

0. [hecho, 24 oct] **Paso cero.** Una base local nueva arranca de punta a punta: los `scripts/sql` posteriores se aplican en pasadas (el orden de nombre no respetaba dependencias en tres casos), `policies.sql` va al final y un SQL con su propia transacción que falla ya no tapa el error real. Las cinco regex con el carácter de retroceso, corregidas: el filtro de 401/403 de la copia de proyectos y cuatro pruebas que pasaban sin mirar nada; `lib/repo/sin-retroceso.test.ts` lo vigila. Commits `702dffc4` y `ab82d6a5`.
1. [hecho, en producción del 24 al 26 oct] **Paso uno: la empresa, sus reuniones y las integraciones.** U1 (Google cada 10 minutos, el rescate de 177 reuniones, el código de la reunión y los cancelados: `docs/integracion-google-plan.md`), U6 (un solo transporte de HubSpot: `docs/integracion-hubspot-plan.md`), U15 (el banco sin conciliar de Odoo, si Alex lo revisa en Nexus: «Lo que decides tú» 28; U21, el precio de Sonnet 5, ya se hizo el 24 oct: `docs/integraciones-finanzas-ia-plan.md`), U22 en su parte de las lecturas de reuniones (van por lotes antes de traer las 301, las 177 y la investigación de las 71), T1 y T2 (el tablero de salud de las reuniones y que las notas de Gemini cuenten: `docs/reuniones-pieza-angular-plan.md`), y la empresa (`docs/empresa-datos-hubspot-plan.md`): R7 y R10, después R1, R2 y R5, con U27 (lo que ya paga cada cliente, que ya está en la copia de Partner) (los datos y la investigación en la empresa, el TAM v1, propuestas que se deciden y editan, y las propiedades nuevas de HubSpot, con su tipo; los reportes, después). Las etapas 1 a 3 de B1 se construyen dentro de R1, R2 y R5. De R5 va aquí guardar y leer la investigación en la empresa; que la preventa la lea de ahí va en el paso 2.

   **Cómo se reparte en sesiones paralelas:**
   - [hecho, 24 oct] **Día 0, en `main`:** R7 (las dos llaves de la dueña de cada reunión, aplicadas en producción con INV48 en verde) y R10. Volver único `hubspotCompanyId` pasó a R7b, en la sesión de la empresa: siete caminos pueden repetir el id hoy.
   - [hecho, 24 oct, en `main`] **Google (U1):** dueña de `lib/google/meet-sync.ts`, `auto-sync.ts` y su job en `lib/jobs/defs.ts`. Un solo SQL con las columnas nuevas de `FirefliesSession` y la tabla de participantes. No toca la lectura de `meet-enrichment.ts`.
   - [hecho, 24 oct, en `main`; falta la pantalla del tablero] **Reuniones (T1 y T2):** dueña del predicado único «tiene texto» en `lib/sessions/`, de `lib/lecturas/`, de `lib/google/por-que-falta.ts` y de la línea `soloNotas` de `meet-enrichment.ts:426`. Sin SQL. Toma INV47.
   - [hecho, 24 oct, en `main`] **HubSpot (U6):** dueña de `lib/hubspot/client.ts` y de los archivos con su propio reintento. No cambia las firmas de `getSystemHubspotClient` ni `getSystemAccessToken`, que usan unos 90 archivos.
   - [hecho, 24 oct, en producción; falta la carga inicial] **Empresa (R1, R5 y después R2):** un solo SQL con las columnas de `Client` y la tabla de la investigación. Dueña de `lib/clients/` y de `lib/hubspot/empresa.ts`. Las etapas de R2 que escriben en HubSpot se juntan en `main` después de U6 y escriben por su transporte. Si entra la copia de las empresas desde HubSpot, también toca `lib/jobs/defs.ts`, con su clave reservada.
   - **U15 (Odoo):** o es una sesión propia, o sale al paso 2 («Lo que decides tú» 28).
   - **Reglas comunes:** cada `.sql` toca solo lo suyo y corre en cualquier orden; la sesión que junta segunda rebasa y vuelve a correr `migrate diff`; antes de arrancar, cada sesión reserva sus números de INV, sus claves de job y el nombre de su `.sql`; ARCHITECTURE.md lo toca solo R10, y las demás dejan su cambio en «Para el roadmap».
   - **Las cargas que gastan IA** (el rescate de 177, las 301 con notas y la investigación de las 71) van juntas, una vez y por lotes (`docs/reuniones-pieza-angular-plan.md` › «Cómo se trae lo que ya existe»; cuánto gastar es «Lo que decides tú» 24).
   - **Diseños que revisas tú:** el tablero de salud (T1) y «Datos de la empresa» (R1 etapa 5).
2. [hecho, en producción el 25 y 26 oct; quedan S6 con Andrés y G0 con un CSE] Lo que pidieron Ventas y Customer Success el 23 oct, que no depende de nada (N1, la 8.9.1, ya se publicó el 24 oct):
   - U25, con fecha: la comisión de HubSpot sale de HubSpot antes del 15 de noviembre; y U29, las columnas y el historial de la copia de Partner;
   - M1 y M2: el kickoff que sabe que es SmartLoop y el orden exploración → diagnóstico, antes del primer ciclo de RC Inmobiliaria;
   - K7 y K1, con K8 dentro: la siguiente pregunta de calidad y la exploración por departamento con la escala y el dinero; con ellos, la segunda parte de R5 (que la preventa lea la investigación desde la empresa: comparten `lib/exploraciones/agente.ts` y `esquemas.ts`), después de K7 y K1 en `main` o en la misma sesión;
   - S1 a S3: el analizador de reuniones de venta (el criterio, quién habló y el análisis con citas), y S6 con Andrés;
   - ✓ D0: que una tarea «por validar» no llegue al cliente (hecho el 24 oct, falta el deploy);
   - G0: prender «¿cuánto te tomó?» contigo y con un CSE;
   - L1 etapa 2, L2, L3 y L5: el Contexto del diagnóstico propone todas las reuniones con texto, publicar diciendo por qué, los detalles del diagnóstico y la ficha, y lo que quedó del 23 oct (la etapa 1 de L1 pasó a T2);
   - T3 y B3 etapa 1: proponer la empresa de las reuniones que no tienen, y copiar los leads de HubSpot (el permiso se dio el 24 oct);
   - U2 y U3: la prueba de un día con la API de Meet y, si sale bien, la API de Meet (la transcripción con quién habló, quiénes estuvieron, «no ocurrió»);
   - U7, U8 y U9: los resúmenes de HubSpot, los correos y las fusiones;
   - el resto de U22 (que el vigía entre por los lotes) y U24 (que un job que deja de correr avise).
3. T7 (quiénes de Smarteam estuvieron), y con eso S4 y S5 (comentar, confirmar y la tendencia por vendedor) y S7 (el analizador por cliente). Sin depender de nada: **A0, el ejercicio de validación contigo (la menor cantidad de actividades)**, y solo con A0 aprobado, desarmar el cotizador en un catálogo de actividades (A1 etapa 2 y A2 etapa 1); limpiar las tareas de los CSE que nadie decidió (D2 etapa 1) y H1 (tu piloto: la primera entrega de P5, leer tus reuniones internas; no espera al diseño ni a la barra de P). La Planificación con el Brief de implementación (L4 ampliada, `docs/planificacion-brief-plan.md`), en sus siete etapas.
4. T4 y T9 (el motivo de cada reunión sin texto, y que la persona aporte el contexto respondiendo las preguntas de Nexus), T8 y T5 (encontrar cualquier reunión de la empresa y la reunión presencial), Q (Academy y el acceso al portal en el kickoff), K5 y K6 (dejar de buscar sesiones a mano), D4 (el seguimiento en HubSpot), M3 (el primer ciclo de cada cliente con su CSE) con C4 etapa 0 (lo vendido a Honda leído con los 26 casos de hoy, a mano y sin A2), y P (el módulo de Tareas: el diseño, la barra por cliente, la vista grande, el calendario y el resto de P5; P4 espera a A2).
5. R6 (una persona con su rol) y R13 (el perfil de Smarteam: cliente ideal, buyer personas, propuesta de valor, clientes de referencia), y después K2, K3 y K4 juntas (la primera sesión en frío necesita el position statement), y K10.
6. Con A1 cerrado: A3 (criterios en palabras simples) y A5 (los casos que faltan).
7. A2 (migrar el cotizador a la biblioteca) y después A4 (duración y «cómo sabrás que funcionó»).
8. N2 (probar la escala con cualquier empresa, desde su preventa o su ficha; la 8.9.1 ya se publicó), B2 (la escala lee los datos de la empresa), O1 a O4 (el test dentro de Nexus, que arranca con la 8.9.1 y toma la 9.0 solo), N3 a N7 (la 9.0 con lo pendiente y lo de Insider), O5 y O6 (las tres versiones del test y el corte de la aplicación vieja). A6 (los casos de Insider por industria) va con N.
9. R3 y R4 (los documentos de la empresa sin proyecto), C1 y C3 (pueden ir antes: usan lo que ya hay), C2 (la cotización calculada, necesita A2 y R1), C4 y C5 (cuando se defina su formato; necesita R3 y R4, los documentos de la empresa sin proyecto).
10. D1 (diseño del cronograma con casos), después D2, D3 y L4 (con I2, las dos plantillas de Planificación), y junto con ellos G1 a G3.
11. U4 y U5 (enterarse al momento de lo de Meet; las reuniones del cliente y las presenciales), U26, U28, U30 y U31 (lo demás de Partner), U10, U11, U13 y U14 (webhooks, copia incremental, Nexus dentro de HubSpot, salir de lo legacy), U16 a U20 y U23. E1, E2 (con R11 y R12: el contexto único de la empresa y lo que le falta comprar), F1, I1, I3 y M4. R8 y R9 cuando se toque cada parte.
12. K9 (aprender de los ajustes a la guía), cuando haya volumen.

### A · La biblioteca de casos de uso y sus actividades <span class="estado">Propuesta</span>

1. **A0 · El ejercicio de validación: la menor cantidad de actividades.** *Sale de:* tu pedido del 24 oct: antes de crear las actividades y los casos de uso, validarlo juntos; las implementaciones tienen que ser fáciles y sencillas con todo lo que la IA permite. *Depende de:* nada. **Nada de A1 etapa 2, A2, C2, D2 etapa 2 ni P4 se programa sin este ejercicio aprobado.** Plan: `docs/actividades-plan.md` § «El ejercicio de validación».
   - Etapa 1 · Tú me das el contexto: cómo ves una implementación hoy con la IA (qué hace Nexus solo, qué hace el CSE, qué hace el cliente), con dos o tres implementaciones reales recientes, una que salió bien y una que no.
   - Etapa 2 · Yo exploro: el cotizador, las propuestas firmadas, los cronogramas y las tareas reales de esos proyectos, sus sesiones y lo que Nexus ya escribe solo (kickoff, diagnóstico, planificación, reportes). Sale qué actividades se repiten en todos, cuáles casi nunca y cuáles ya hace Nexus.
   - Etapa 3 · La propuesta: la menor cantidad de actividades que llega al resultado de cada caso, cada una con su porqué y el artefacto de Nexus que la acelera, y qué se quita o se junta respecto del cotizador.
   - Etapa 4 · La validamos juntos, caso por caso, con una pregunta: «¿se llega al resultado sin esta actividad?». Lo aprobado va al plan y a DECISIONS; recién ahí se programa.
   - **Criterio de éxito:** el catálogo tiene menos actividades que tareas el cotizador, ningún caso pasa de 8, y tú lo apruebas.
2. [en curso] **A1 · Definir contigo qué es una actividad.** *Sale de:* «debajo de los casos de uso va un catálogo de actividades», «un caso es maleable», tu respuesta 3. *Depende de:* nada.
   - Etapa 1 · ✓ Hecha el 22 oct, en tres rondas (`docs/actividades-plan.md`). Una actividad es el trabajo para llegar al resultado; lo que ve el cliente es lo que se entrega.
     - Cada actividad lleva dos tiempos: el de hacerla a mano (da el precio mínimo) y el objetivo con Nexus (la meta). La rentabilidad usa lo que de verdad duró.
     - Las sesiones duran una hora.
     - Un solo tipo, con «es con el cliente: sí o no».
     - Se comparte entre casos.
     - Algunas se repiten (en SmartLoop: semanal, mensual, trimestral).
     - En cada proyecto nace como tarea en el handoff.
   - Etapa 2 · Con A0 aprobado, desarmar el cotizador contigo: juntar todas sus tareas en un catálogo de actividades agrupadas, y después ver qué actividades jala cada caso (primero las actividades, después los casos). Empezar por «Sistematiza tu proceso comercial» y «Entiende por qué ganas y pierdes».
   - Etapa 3 · La regla de corte: lo fijo de un caso es el resultado y cómo saber que funcionó; las actividades son una sugerencia que se infla o se aliviana. Si una actividad agregada cumple algo de otra dimensión o de un nivel más alto, Nexus avisa «esto ya es otro caso».
   - Etapa 4 · Dejarlo escrito en DECISIONS como la definición oficial, antes de tocar código.
3. **A2 · Migrar el cotizador a la biblioteca de casos.** *Sale de:* tu respuesta 1 (reabre la decisión del 17 oct) y «yo entrego el tiempo máximo de cada actividad». *Depende de:* A1.
   - Etapa 1 · Inventario, sin código: el catálogo de actividades que sale de A1 etapa 2 (`D:\Proyectos\casos-de-uso-escala`), con su tiempo a mano, su tiempo con Nexus, su responsable y los casos que la usan, para que lo revises. Lo mantienes tú.
   - Etapa 2 · Las actividades viven en el mismo archivo de la biblioteca (`lib/casos-de-uso/catalogo.ts`), sin tabla nueva, con pruebas: cada actividad cumple algo dentro del resultado de su caso, tiene etapa y tiempo.
   - Etapa 3 · Sin multiplicador por tamaño.
     - El tiempo de cada actividad es uno: la exploración de hora y media de una empresa grande pasa a ser dos sesiones de una hora.
     - Lo que crece con la empresa es el número de veces: una exploración por equipo, una capacitación por grupo, un relevamiento por sistema.
     - Gobierno y corporativo suman actividades (actas, SICOP, comité) y cobran su tarifa (80, 100, 120).
     - La persona ve «3 exploraciones»; el cálculo lo hace Nexus. Los datos del ICP están en el plan.
   - Etapa 4 · La biblioteca muestra las actividades y las horas, solo al equipo. El cotizador externo se retira cuando la biblioteca lo reemplace.
4. **A3 · Los criterios, en palabras simples.** *Sale de:* tu respuesta 4. *Depende de:* A1.
   - Etapa 1 · Cada caso dice en frases cortas qué va a poder hacer el cliente cuando termine, escritas desde la escala y revisadas contigo.
   - Etapa 2 · Los códigos de la escala y las letras de los niveles no salen en ninguna pantalla de vendedor, de Customer Success ni del cliente; una prueba lo vigila.
   - Etapa 3 · Las actividades y los criterios se ven juntos: cada actividad dice qué parte del resultado deja lista.
5. **A4 · Cada caso con su duración y «cómo sabrás que funcionó».** *Sale de:* «a las tarjetas les falta la duración y cómo sabrás que funcionó». *Depende de:* A2 y A3.
   - Etapa 1 · La duración sale de las actividades y de las sesiones por semana.
   - Etapa 2 · «Cómo sabrás que funcionó» sale de los criterios en palabras simples, con la métrica que ya guarda cada caso aplicado a un cliente.
   - Etapa 3 · Las tarjetas de la biblioteca y la propuesta los muestran.
6. **A5 · Llenar la parte de producción de la biblioteca.** *Sale de:* «el catálogo está cargado hacia la base operativa», el caso de Ganadas y Perdidas y la revisión de Insider. *Depende de:* A1.
   - Etapa 1 · Definir contigo «Entiende por qué ganas y pierdes»: que todo negocio perdido tenga su razón, elegida de una lista, y que el líder saque el reporte sin armarlo a mano; la revisión mensual con el líder comercial como actividad de adopción. Su siguiente caso: ajustar el proceso con lo aprendido; y más arriba, la IA que analiza las llamadas.
   - Etapa 2 · Casos para Medición y Aprendizaje de Marketing y para Escalabilidad del Servicio, que hoy tienen uno cada uno.
   - Etapa 3 · Insider: ✓ llegó la sesión con Insider One del 21 oct; lo que sale de ella pasó a A6 (los casos) y a N (la escala).
   - Etapa 4 · El sitio web con criterio: ICP, buyer personas y kit de marca como actividades del caso de presencia web (también pensando en gobierno), porque terminan en HubSpot como contexto para su IA.
7. **A6 · Los casos de Insider, por industria.** Te importan mucho (24 oct). *Sale de:* la sesión «Casos de uso por industria» con Insider One (21 oct) y tu documento del 23 oct. *Depende de:* N para los criterios nuevos; las etapas 1 y 4 pueden ir antes. Plan: `docs/escala-engagement-avanzado-plan.md`.
   - Hoy hay cuatro casos de Insider: personalizar la experiencia web, recuperar carritos, recompra y la ficha única. Ninguno dice para qué industria es, y los de carritos y recompra prometen de Inicial a Óptimo.
   - Etapa 1 · Un caso de aterrizaje antes de Insider, «Prepara tus datos para personalizar» (el permiso por canal, lo que hacen en el sitio unido a la ficha y el catálogo de su industria), con HubSpot y Smarteam: es lo que vende la lectura «Casi lista» de N.
   - Etapa 2 · Ajustar los cuatro casos a los criterios de la 9.0 y partir el de carritos en aterrizaje (Eficiente) y expansión (Óptimo).
   - Etapa 3 · Los casos que faltan: WhatsApp para vender y atender, un recorrido que coordina sitio, notificaciones, SMS y WhatsApp, «Demuestra cuánto vende de más tu marketing» con un grupo de control, avisos por evento (vuelos, reservas, entregas), avisos de disponibilidad y de baja de precio, y segmentos de valor y lealtad. Cada caso apunta a sus criterios y el mapa de herramientas dice qué pone HubSpot y qué Insider.
   - Etapa 4 · Cada caso dice para qué industrias es (las ediciones de la escala: Ecommerce y retail, Turismo, Banca), con sus ejemplos; la biblioteca filtra por la industria del cliente, sin duplicar casos.
   - Etapa 5 · El aviso de la integración: el conector de HubSpot a Insider va en una sola dirección; un caso que devuelve a HubSpot lo que calcula Insider lo dice.

**Criterio de éxito:** un vendedor arma una propuesta con casos y actividades de la biblioteca sin abrir el cotizador externo; en 5 propuestas reales ninguna se firma bajo su precio mínimo, y el precio mínimo de Nexus difiere menos de un 10 % del precio por horas que daba el cotizador para lo mismo; la diferencia se explica, no solo se mide.

### B · Los datos de la empresa, de la preventa al cliente <span class="estado">En curso</span>

1. **B1 · Una sola ficha con los datos de la empresa.** *Sale de:* «el tamaño de un caso se califica solo según los datos del cliente» y tu comentario de que aplica a todo Nexus. *Depende de:* nada para la etapa 1. **Las etapas 1 a 3 se construyen dentro de R1, R2 y R5, en el paso uno, y ahí manda `docs/empresa-datos-hubspot-plan.md`. A B1 le quedan las etapas 4 y 5.**
   - Etapa 1 · Diagnóstico: qué datos hay y dónde (la ficha del cliente, las personas de la exploración, la empresa, los contactos y los asientos de HubSpot). Sale la lista: vendedores, gente de marketing y de servicio, líderes y cómo está organizada, modelo de negocio y herramientas.
   - Etapa 2 · Nexus la llena solo desde HubSpot y desde la investigación del cliente, y dice de dónde salió cada dato. El agente que investiga la empresa en la preventa estima el tamaño. Si en HubSpot está vacío, lo escribe allá; si no coincide, propone el cambio y el usuario de Nexus que lo está usando, según su rol (24 oct), lo acepta antes de que se escriba. Hoy el tamaño de HubSpot no sirve: a 60 de 163 empresas les falta, y Honda Costa Rica figura con 5 empleados.
   - Etapa 3 · Lo que falta lo pregunta (24 oct: con el mecanismo que ya existe, «Preguntas sobre la cuenta», que hoy pregunta «¿tiene apertura a la asesoría?» al entrar a la ficha y lo escribe en HubSpot; se le suman respuestas con opciones y que Nexus proponga la respuesta para que la persona solo confirme o corrija): al vendedor en la preventa, al CSE en el cliente, en una casilla corta. Lo que se responde vuelve a HubSpot. Incluye el perfil que pide la escala 9.0 (N): a quién le vende (empresas, personas o ambos), si compra, reserva o solicita en su sitio o su app, si tiene catálogo, su tráfico y su base con consentimiento por rangos, y si se planea o califica para Insider.
   - Etapa 4 · Decidir si se enriquece con créditos de HubSpot.
   - Etapa 5 · El tamaño de cada caso (liviano, mediano o grande) sale solo, con su porqué a la vista.
2. **B2 · Que la escala lea esos datos para saber cuánto pide «Funcional» en esta empresa.** *Sale de:* tu respuesta 2 («los criterios de Funcional pueden ser un arma de doble filo»). *Depende de:* R1.
   - Etapa 1 · Diagnóstico del agente que pone la escala («Actualizar escala»).
   - Etapa 2 · Sumarle los datos de B1.
   - Etapa 3 · Que diga, en palabras simples, qué le falta a esta empresa para llegar a Funcional y cuánto trabajo es, antes de que se venda.

3. [hecho, 25 oct, en producción: etapa 1] **B3 · Los leads de HubSpot, en Nexus.** *Sale de:* tu revisión del plano de una empresa (23 oct). *Depende de:* nada (el permiso de leads se dio el 24 oct). *No existe:* Nexus copia contactos, negocios, tickets y correos de HubSpot, pero no el objeto Lead (el prospecto en calificación).
   - Etapa 1 · Copiar los leads de cada empresa cada hora, como los contactos: nombre, etapa, origen, dueño y fechas, solo lectura. Va en el paso 2, junto a T3.
   - Etapa 2 · Verlos en la preventa y en «Llegaron por el test» (K10), unidos a la empresa.
   - Etapa 3 · Sumarlos al plano de una empresa y a lo que leen los agentes de la preventa.

**Criterio de éxito:** el del plan de los datos de la empresa (`docs/empresa-datos-hubspot-plan.md` › «Criterio de éxito»); ninguna empresa con el tamaño en blanco sin una pregunta abierta, y la mitad de esas preguntas respondidas en 14 días (no se empuja a llenar con lo que haya); y lo que dice B2 sobre qué le falta a cada una para llegar a Funcional, revisado en una muestra de 5.

### C · Preventa y propuestas <span class="estado">Propuesta</span>

Plan: `docs/propuestas-por-casos-plan.md`.

1. **C1 · Recomendar el caso según la escala, enfocado en el resultado.** *Sale de:* la regla de aterrizaje y expansión, y «que se enfoque en el resultado que el cliente necesita». *Depende de:* nada (la regla ya existe).
   - Etapa 1 · Revisar la recomendación de hoy (`lib/casos-de-uso/camino.ts`) con cinco preventas reales.
   - Etapa 2 · Que explique por qué recomienda ese caso, en una frase, con el resultado que el cliente busca.
   - Etapa 3 · Varios carriles en paralelo cuando el cliente quiere varias áreas: un caso por área, cada uno con sus sesiones. El texto de SmartLoop pasa de «una prioridad a la vez» a «una prioridad a la vez por carril».
2. **C2 · La cotización sale de las actividades.** *Sale de:* tu respuesta 1 («para que salga directamente cuando se crean cotizaciones») y la respuesta 1 sobre la implementación base. *Depende de:* A2 y R1. Guardar el motivo de cada cambio que hace el vendedor a lo sugerido es requisito (lo mide la tarjeta 7).
   - Etapa 1 · Al elegir los casos, Nexus sugiere las actividades según la empresa, con el porqué de cada una. **Se vende por valor (24 oct):** el tiempo a mano por la tarifa del segmento da el precio mínimo y la rentabilidad, no el precio. El vendedor quita o ajusta entendiendo ese porqué. Si en la entrega se suma una actividad, no cambia el precio: baja la rentabilidad, y sirve para afinar el precio o para avisar a tiempo que falta alcance.
   - Etapa 2 · La implementación base: las actividades de portal y arquitectura van dentro del caso de aterrizaje y se cuentan una sola vez por cliente. En una implementación (no recurrente) quedan claras desde el inicio; en SmartLoop las ajusta el primer diagnóstico.
   - Etapa 3 · Lo vendido queda guardado por caso y actividad: de ahí salen el cronograma, las tareas y la rentabilidad.
3. **C3 · «Lo que normalmente viene después», en una sección aparte.** *Sale de:* «mostrar lo necesario con precio y aparte lo que viene después sin precio» y tu respuesta 6. *Depende de:* nada.
   - Etapa 1 · Una sección nueva en la plantilla de la propuesta, sin precio, con los siguientes casos del camino de crecimiento. Las propuestas de hoy no cambian.
   - Etapa 2 · El vendedor la muestra u oculta con el ojo de la sección, que el motor ya trae.
4. **C4 · Las implementaciones de hoy, leídas como casos de uso** (el objeto ya lo permite: un caso de uso es de la empresa y puede entrar a un proyecto sin ciclo, y a una fase del cronograma; hoy el flujo solo lo usa en SmartLoop, y `CasoDeUso` tiene 0 filas. También abre vender casos de uso sin servicio recurrente). *Sale de:* «interpretar las implementaciones actuales como casos de uso». *Depende de:* A2 (la etapa 0, de nada).
   - Etapa 0 · Honda primero, a mano y sin A2: lo vendido leído con los 26 casos de hoy. Va en el paso 4, con M3, junto con las propuestas recurrentes internas de FACO, kölbi, Cayalá y Grupo Inve («Lo que falta › Customer Success» 4, que ya tienen script).
   - Etapa 1 · Para cada proyecto en curso, Nexus propone a qué casos corresponde lo vendido (desde la propuesta y el handoff), sin tocar su cronograma.
   - Etapa 2 · El CSE lo confirma.
   - Etapa 3 · La cuenta lo muestra como lectura: «esto es lo que se vendió, en casos de uso», con sus etapas (diagnóstico, planificación, implementación y adopción), las mismas de SmartLoop.

5. **C5 · El documento de resultados de la preventa, por departamento.** *Sale de:* el feedback de Ventas del 23 oct («después del diagnóstico esperamos un documento de resultados ampliado por departamento y luego la propuesta con casos de uso»). *Depende de:* K1, R3 (un documento de la empresa sin proyecto) y de definir el formato (Ventas lo define el lunes 27 oct). **Pendiente de definición.**
   - Hoy no existe: lo más cercano es «Dónde está tu operación hoy» dentro de la propuesta (un nivel estimado para Ventas, Marketing y Servicio) y el bloque interno «Por equipo».
   - Etapa 1 · Con el formato de Ventas: un documento nuevo de la preventa (motor de documentos, tema claro, vista externa y PDF), por departamento: dónde está en la escala, cuál es su dolor y la evidencia, en palabras del cliente.
   - Etapa 2 · Lo arma Nexus con las sesiones de cada equipo (K1) y la escala; Ventas lo revisa y lo presenta antes de la propuesta.
   - Etapa 3 · La propuesta con casos de uso parte de ese documento (C1).

**Criterio de éxito:** 5 propuestas reales armadas desde las actividades, cada una con su porqué; lo vendido queda guardado por caso y actividad.

### D · La entrega: cronogramas y tareas, con corte limpio <span class="estado">Propuesta</span>

Plan: `docs/entrega-por-casos-plan.md`. Lo que mostró el diagnóstico del 22 oct: hay un solo cronograma por proyecto y lo arma el handoff; cada regeneración queda como propuesta que alguien aprueba; las tareas del cronograma no tienen persona ni horas y no están unidas a las tareas del equipo; y el cliente ve todas las tareas del cronograma, no un resumen.

1. [hecho, falta el deploy] **D0 · Que una tarea «por validar» no llegue al cliente.** Arreglado el 24 oct (`lib/external/tarea-del-cronograma.ts`, con su prueba de integración), también en la ruta del servicio de SmartLoop, que tenía su propia regla (lo encontró `/revisar`). Hoy afecta a un solo cronograma publicado (Wherex, 4 tareas): se corrige cuando su CSE lo vuelva a publicar. *Era el error:* la vista del cliente esconde solo las suspendidas (`lib/external/timeline-view.ts`), así que una tarea por validar cruza con su título y su semana. Un filtro y una prueba que lo congele. *Depende de:* nada.
2. **D1 · Diseñar el cronograma con casos de uso.** *Sale de:* «cada caso lleva su diagnóstico, planificación, implementación y adopción» y tu respuesta 3 sobre cronogramas y tareas. *Depende de:* A1.
   - Etapa 1 · Contar los cronogramas activos y en qué estado están (publicados, aprobados, con propuesta pendiente).
   - Etapa 2 · El diseño en Claude Design: lo que ve el cliente es un resumen, como se vendió (los casos con sus etapas y las sesiones); las tareas del equipo van aparte.
   - Etapa 3 · El corte limpio: los proyectos nuevos nacen con el modelo nuevo; los de hoy siguen como están. Para tener un cronograma nuevo sin tocar el viejo se usa lo que ya existe: otro proyecto del mismo cliente (un cliente ya puede tener varios). No se cambia la regla de un cronograma por proyecto.
   - Etapa 4 · Nada cambia en un cronograma publicado sin una propuesta que el CSE apruebe, como hoy.
3. [en curso: la etapa 1, en producción el 27 oct (59 sugerencias vencidas)] **D2 · Las tareas del equipo salen de las actividades, por tres puertas.** *Sale de:* «cada caso de uso genera tareas para Customer Success», «cada tarea guarda tiempo estimado y real» y tus respuestas del 22 oct. *Depende de:* A0, A2 y C2 para la etapa 2; la etapa 1 va ya.
   - Etapa 1 · Limpiar antes de sumar: cerrar lo vencido, juntar los seguimientos sueltos y bajar el tope de «Por decidir». Hoy, en 45 días, a los cinco CSE les llegaron 105 tareas: ninguna aceptada ni hecha, 37 vencidas sin decidir, y hay 26 seguimientos que nadie tomó.
   - Etapa 2 · Las tres puertas (`docs/tareas-plan.md` § 17):
     - **El plan del proyecto:** nace en el handoff, una tarea por actividad vendida, con su responsable y su tiempo. Ya está vendido, así que no pasa por «Por decidir».
     - **Lo que se dijo con el cliente:** como hoy, por «Por decidir» y con tope.
     - **Lo que se dijo puertas adentro:** deja una tarea para quien la hace y una de revisión para quien la pidió. Se construye en H1 etapa 2, porque no depende de A0.
   - Etapa 3 · La lista de cada cliente, tipo ClickUp: un clic en el cliente y ves todo lo que hay que hacer ahí (es P1). «Para ti» muestra solo el día y la semana.
   - Etapa 4 · El cronograma sigue aparte del sistema de tareas: se arma desde la propuesta y el handoff para que el cliente entienda de un vistazo cómo vamos, y más adelante se cambia por Gantts por caso. El puente por ahora es el chat del cronograma: conoce las actividades y las tareas del proyecto, y el CSE le pide sumar líneas.
   - Etapa 5 · En SmartLoop, las actividades que se repiten (la entrega semanal, el reporte de avance mensual, los stakeholders cada tres meses) dejan su tarea en cada ciclo, y varias las prepara Nexus solo.
   - Etapa 6 · Probarlo primero en tus propias tareas y después en un piloto con alguien del equipo.
4. **D3 · Lo que se habla en una sesión: tarea si está dentro del alcance.** *Sale de:* «lo hablado genera tareas si cae dentro del alcance; si no, aviso». *Depende de:* D2.
   - Etapa 1 · La lectura de cada reunión compara lo pedido contra las actividades de lo vendido: dentro, propuesta de tarea; fuera, pedido (ver E1).
   - Etapa 2 · Que no duplique una tarea que ya está en el cronograma (hoy no lo detecta).

5. [hecho, 27 oct; se prende con su bandera] **D4 · Las tareas de seguimiento comercial, también en HubSpot.** *Sale de:* el feedback de Ventas del 23 oct («que quede en el calendario y en HubSpot, y que al marcarla hecha en un lado se marque en el otro»). *Depende de:* nada. Plan: `docs/tareas-plan.md` § 17.
   - Hoy existe a medias: lo que nace en HubSpot se sincroniza en los dos sentidos (hecha incluida) cada 15 minutos, y una tarea a mano con fecha se agenda en Calendar con un clic. Lo que nace en Nexus no se crea en HubSpot.
   - Etapa 1 · Una tarea de seguimiento con un contacto o negocio («el cliente no responde hace 3 días») se crea también en HubSpot y guarda su id: desde ahí, el estado viaja solo.
   - Etapa 2 · Al crearla, «Agendar» propone el bloque en el calendario del consultor.
   - Etapa 3 · Las tareas internas siguen solo en Nexus; la excepción se anota en DECISIONS antes del código.

**Criterio de éxito:** el 100 % de los proyectos nuevos nace con su plan en tareas, y 7 de cada 10 de esas tareas quedan hechas o `no_se_hara`; los CSE terminan o deciden la mitad de lo que les llega antes de que venza (hoy, de 105, 0 aceptadas y 37 vencidas); «Por decidir» bajo 10 por CSE cuenta solo si se llega decidiendo; el cliente ve un resumen sin las tareas «por validar» (hoy, en Wherex, 4) ni las internas (hoy ve todas las del cronograma publicado, hasta D1).

### E · Lo que pide el cliente: el camino de expansión <span class="estado">Propuesta</span>

Plan: `docs/expansion-y-adopcion-plan.md`.

1. **E1 · Fuera de alcance en implementaciones; solicitudes en SmartLoop.** *Sale de:* «los avisos de fuera de alcance son el pipeline de expansión», «el CSE puede levantar la mano» y tu comentario 7. *Depende de:* nada para la etapa 1.
   - Etapa 1 · Decidido el 24 oct: el CSE puede aceptar un pedido o una solicitud, y la CSL siempre la revisa: al aceptarla, le nace una tarea de revisión. Para la CSL quedan dos salidas: es una extensión o necesita a Ventas. Hoy el CSE ya decide y la CSL solo recibe un aviso; falta la tarea de revisión.
   - Etapa 2 · En SmartLoop el mismo pedido se llama «solicitud» y se puede volver un caso del backlog del cliente. Hoy el caso de uso tiene el origen «pedido», pero nada lo escribe ni guarda de qué pedido salió; en producción hay 40 pedidos sin decidir. En SmartLoop, sumar actividades alarga el plan, con una cadencia de entrega por definir.
   - Etapa 3 · Levantar la mano ya existe (sumar un pedido a mano): hacerlo visible donde el CSE trabaja.
2. **E2 · Un agente por cliente que une lo que pide con la biblioteca.** *Sale de:* «cada cliente debería tener un agente que determine lo que va necesitando». *Depende de:* A2 y E1.
   - Etapa 1 · Al confirmar un pedido, Nexus sugiere qué caso de la biblioteca lo resuelve, primero por reglas (los síntomas de cada caso).
   - Etapa 2 · Después con IA y la memoria de la cuenta.
   - Etapa 3 · Lo acumulado alimenta el camino de crecimiento del cliente.

**Criterio de éxito:** cada pedido fuera de alcance tiene la decisión del CSE en menos de 5 días hábiles y la revisión de la CSL en 5 más (hoy hay 40 sin decidir; la meta es 0 con más de 5 días), y en SmartLoop al menos un pedido se vuelve un caso del backlog, con su origen guardado.

### F · La adopción y la rutina del equipo del cliente <span class="estado">Propuesta</span>

Plan: `docs/expansion-y-adopcion-plan.md`.

1. **F1 · Una actividad de auditoría de adopción en HubSpot.** *Sale de:* «no se quitan las piezas que convierten un servicio temporal en recurrente» y tu comentario sobre adopción. *Depende de:* A0 y Q2 (el acceso al portal).
   - Etapa 1 · Una actividad fija en la etapa de adopción de cada caso: armar en HubSpot el reporte de uso del equipo y revisarlo con el cliente.
   - Etapa 2 · Su resultado entra al reporte de entrega y a la adopción de SmartLoop, en las secciones que ya existen.
   - Etapa 3 · Decidir dónde queda registrada la rutina que adoptó el equipo del cliente.

**Criterio de éxito:** cada caso que termina tiene su revisión de adopción, con el reporte de uso de HubSpot visto con el cliente.

### G · Horas, rentabilidad y capacidad <span class="estado">Propuesta</span>

Plan: `docs/rentabilidad-por-caso-plan.md`.

1. **G0 · Prender «¿cuánto te tomó?».** *Existe y nunca se prendió:* 0 preguntas en producción. Activar el momento «tarea hecha» contigo y con un CSE, y medir en dos semanas cuántas se responden: al menos la mitad, o no se abre al resto. Es la única fuente del tiempo real del trabajo que no es una reunión. *Depende de:* nada.
2. **G1 · Tiempo estimado y real por tarea.** *Sale de:* «hay que medir las sesiones y todo el trabajo detrás». *Depende de:* D2.
   - Etapa 1 · Va con D2: lo estimado sale de la actividad, y lo real sale de «¿Cuánto te tomó?» o del bloque que la persona agenda en su calendario desde Tareas.
   - Etapa 2 · Las sesiones se miden solas con Google Workspace (el calendario ya entra en «Para ti»).
3. **G2 · Rentabilidad por caso.** *Sale de:* «como prioridad de RevOps voy a calcular la rentabilidad de los servicios». *Depende de:* G1.
   - Etapa 1 · Lo estimado contra lo real por caso, al lado de lo que se cobró (Rentabilidad ya lo hace por cuenta). Lo real se paga al costo por hora de la planilla, que ya calcula `lib/rentabilidad/margen.ts`. El precio mínimo usa la tarifa del segmento.
   - Etapa 2 · Mientras no haya datos, cada estimación dice cuánto riesgo de rentabilidad asume.
4. **G3 · La capacidad del CSE con las horas de las actividades.** *Sale de:* «la capacidad no se mide en número de casos». *Depende de:* A2.
   - Etapa 1 · La carga ya se mide en horas; pasa a usar las horas de cada actividad en vez del promedio por tipo de fase.
   - Etapa 2 · Calibrar con kölbi y FACO, los primeros datos reales de recurrencia.

**Criterio de éxito:** por cada caso entregado, lo estimado contra lo real y su margen, con datos de al menos dos proyectos; la carga de cada CSE en horas de actividades.

### H · Que Nexus lea todas tus sesiones y te proponga tareas <span class="estado">Propuesta</span>

Plan: `docs/tareas-organizacion-plan.md` (P5) y `docs/reuniones-pieza-angular-plan.md`. Lo que mostró el diagnóstico del 22 oct: Nexus guarda las reuniones de Meet de todo el equipo, pero solo propone tareas en reuniones con un cliente o prospecto (y ahí solo lo que cada uno se comprometió) y en las reuniones de sprint configuradas. Las reuniones internas sueltas no se leen solas, y la copia de Meet corre solo cuando alguien abre Nexus.

1. [hecho, 27 oct; se prende con su bandera, solo para ti] **H1 · Tu piloto: todas tus sesiones proponen tareas** (se construye dentro de P5, con la fuente, el contexto y las personas de cada propuesta). *Sale de:* tu respuesta 4 («Nexus debería proponerme tareas a mí, y a cada persona con sus sesiones»). *Depende de:* nada.
   - Etapa 1 · Que la copia de Meet corra sola cada 10 minutos (es U1), sin depender de que alguien abra Nexus.
   - Etapa 2 · La lectura personal: las reuniones internas de una persona le proponen tareas, empezando por ti, en tu equipo y no en el de Customer Success. Incluye la tercera puerta de D2: lo dicho puertas adentro deja una tarea para quien la hace y una de revisión para quien la pidió (no depende de A0).
   - Etapa 3 · Leer también las reuniones con aliados y las que no tienen dueño, que hoy no lee nadie.
   - Etapa 4 · Una semana midiendo costo y ruido contigo; después, el resto del equipo. Cuidado: una reunión interna con el nombre de un cliente en el título no puede dejarle tareas a ese cliente.

**Criterio de éxito:** una semana de tus reuniones internas te deja tareas útiles, con menos de una de cada tres descartada por ruido y su costo medido.

### I · Varias plantillas de diagnóstico y planificación <span class="estado">Propuesta</span>

Plan: `docs/entregables-cs-plan.md`.

1. **I1 · Elegir la plantilla de cada entregable.** *Sale de:* «es importante que pronto haya varias plantillas de diagnóstico o planificación» y «cada caso lleva su propio diagnóstico corto». *Depende de:* A1.
   - Etapa 1 · Un selector de plantilla en cada entregable. El diagnóstico ya lo tiene desde el 23 oct (esencial y completa); falta en los demás, con la misma forma: una entrada en el registro, su definición y el registro congelado por prueba.
   - Etapa 2 · Las plantillas de hoy siguen igual y son las que salen por defecto.
2. [hecho, 27 oct, en producción] **I2 · Dos plantillas de Planificación** (con L4). *Depende de:* J1.
   - Una esencial y una completa, como el diagnóstico.
   - La sección «Sesiones y entrenamientos» sale de las actividades vendidas cuando existan.
3. **I3 · Plantillas por caso de uso.** *Depende de:* A0 y J1.
   - El diagnóstico corto de cada caso: solo las partes que ese caso necesita. Primero los casos de aterrizaje.

**Criterio de éxito:** cada entregable deja elegir plantilla, las de hoy siguen por defecto, y hay al menos un diagnóstico corto por caso de uso.

### J · Definir contigo los entregables de Customer Success <span class="estado">Propuesta</span>

Plan: `docs/entregables-cs-plan.md`.

1. **J1 · Qué necesita Customer Success para cada entregable y cuáles automatiza Nexus.** *Sale de:* «quiero definir qué necesita Customer Success para entregar los entregables principales; ese ejercicio lo quiero hacer contigo». *Depende de:* A1.
   - Etapa 1 · Un chat contigo por entregable (kickoff, diagnóstico, planificación, entrega, adopción): qué información necesita, de dónde sale y qué parte puede escribir Nexus con las sesiones y lo que sabe del cliente.
   - Etapa 2 · Con eso, actualizar las tareas de cada cliente con Caroline: qué se hizo, cuánto tomó y qué sigue según lo vendido, traducido a SmartLoop.

**Criterio de éxito:** cada entregable principal tiene escrito qué necesita, de dónde sale y qué escribe Nexus solo, aprobado por ti.

### K · Explorar mejor, en la preventa y con los clientes <span class="estado">En curso</span>

Sale del feedback de Ventas (Marco, Andrés y Liz) y de Customer Success (Liliana) del 23 oct, validado contra el código y la base ese día. Casi todo vale para los dos lugares donde se explora: la preventa y la exploración de un proyecto (implementación o SmartLoop). El plan entero, con lo que sirve del método de Andrés: `docs/exploracion-mejoras-plan.md`.

1. [hecho, 26 oct, en producción] **K1 · Explorar por departamento, con la escala y el dinero.** *Existe a medias.* *Los dos lugares.* Desde el 23 oct cada sesión tiene su equipo (Dirección, Ventas, Marketing, Servicio, Operaciones, Tecnología) y su guía.
   - Etapa 1 · El equipo Financiero (facturado contra cobrado, reportes de la gerencia).
   - Etapa 2 · Un tema de inversión en cada equipo: cuánto invierten, en qué, por qué y cómo saben si vale la pena.
   - Etapa 3 · Cada tema apunta a las dimensiones de la escala de su área, y la guía elige la pregunta que más ubica al cliente.
   - Etapa 4 · Las preguntas de base que faltan: telefonía, ERP y WhatsApp con sus fallas; retención, tiempos de respuesta y rotación.
   - Etapa 5 · Contrastar con el banco de preguntas de Andrés cuando llegue.
2. [hecho, 27 oct, en producción] **K2 · Prospectos sin contexto: la primera sesión abre la puerta.** *Existe a medias* (un modo «desde cero» automático). *Solo preventa.*
   - Etapa 1 · «Cómo llegó»: test, en frío, referido (por quién) o evento; lo propone Nexus desde HubSpot y lo confirma el consultor.
   - Etapa 2 · En frío o referido, la primera sesión: 10 minutos para presentar a Smarteam con el position statement, 35 para que el cliente cuente y unas 3 preguntas al final.
   - Etapa 3 · Desde la segunda sesión, la guía de siempre.
3. **K3 · La investigación arma el position statement.** *Existe a medias:* la investigación web sí corre (sitio, noticias, industria, hitos como rondas de inversión); no busca contrataciones y no hay position statement. *Solo preventa.*
   - Etapa 1 · El position statement base de Smarteam (ver «Lo que decides tú»).
   - Etapa 2 · Correr la investigación de la empresa (R5) también sin empresa en HubSpot, cuando hay dominio.
   - Etapa 3 · En «Conexión», el position statement personalizado con dos o tres hechos de la empresa, cada uno con su fuente.
4. **K4 · Clientes similares para presentarse.** *No existe.* *Solo preventa.*
   - Etapa 1 · Desde HubSpot y Nexus, los clientes de la misma industria y qué se les hizo.
   - Etapa 2 · En «Conexión», solo para el consultor y con el aviso de confirmar antes de nombrarlo.
5. [hecho, 27 oct; la unión automática espera tu visto bueno] **K5 · Asociar sesiones solas, y sugerir cuando hay duda.** *Existe a medias:* en un prospecto ya entran solas; en un cliente o un proyecto, solo a mano. *Los dos lugares.*
   - Etapa 1 · Una reunión con invitados de la empresa que calza con una sesión planeada se sugiere arriba del lienzo: «¿Es la sesión 2 con Marketing?».
   - Etapa 2 · Se asocia sola solo sin duda (sin reuniones recientes de Customer Success y con un título de exploración); con duda, sugerencia. Nunca cruza clientes.
   - Etapa 3 · El lienzo se pone al día solo cuando entra una sesión, sin recargar.
6. [hecho, 27 oct, en producción] **K6 · Contexto a mano.** *Existe* (documentos, notas por sesión e instrucciones adicionales llegan a la guía). *Los dos lugares.*
   - Etapa única · Un botón visible «Agregar algo que sabes» que entra entero a la guía cuando es corto (hoy un documento llega resumido y una nota suelta no entra).
7. [hecho, 26 oct, en producción; falta revisar cinco guías con Marco] **K7 · La siguiente pregunta lógica, de calidad.** *Existe a medias:* la guía tomaba lo marcado en el test como si el cliente lo hubiera dicho y no buscaba la causa. *Solo preventa.*
   - Etapa 1 · Lo del test se valida («En el diagnóstico marcaste…; ¿cómo se ve en el día a día?»).
   - Etapa 2 · La nota del test y las notas recientes de HubSpot llegan a la guía con su texto.
   - Etapa 3 · Cada pregunta de impacto busca la causa, con la secuencia de Andrés.
   - Etapa 4 · Revisar cinco guías reales con Marco.
8. [hecho, 26 oct, en producción; falta contrastar con el banco de preguntas de Andrés] **K8 · Lo que sirve del método de Andrés.** *Existe a medias.* *Los dos lugares.* Entra a las instrucciones de los agentes, sin copiarlo: marcar cada pregunta con la hipótesis que investiga, recorrer un caso real de punta a punta, la secuencia para profundizar una fricción, distinguir las cifras (cerrado, facturado o cobrado; período, fuente y definición), no asumir falta de adopción, qué evidencia pedir, cerrar acordando la evidencia faltante, preguntas de contraste entre equipos y sugerir las sesiones por equipo desde la primera sesión. La agenda se queda con «Contarle». Depende del banco de preguntas por departamento y de los aprendizajes de Andrés para K1 etapas 1, 2 y 5 (ver el plan).
9. **K9 · Aprender de cómo el equipo ajusta las guías.** *Largo plazo.* Los ajustes ya se guardan (solo el estado actual).
   - Etapa 1 · Guardar cada ajuste con su fecha y la guía de antes.
   - Etapa 2 · Con volumen, un informe mensual de qué se quita y qué se suma, por equipo.
   - Etapa 3 · Ajustar los temas y las instrucciones del agente con eso.
10. [hecho, 27 oct, en producción] **K10 · Los leads del test, por empresa.** *Existe a medias:* «Llegaron por el test» agrupa por empresa, pero muestra un solo contacto y un área, descarta los intentos sin empresa y Marketing no lo ve en sus reportes.
   - Etapa 1 · En la fila de la empresa, quién llenó el test de cada área, con el nombre junto a la empresa.
   - Etapa 2 · Los intentos sin empresa, agrupados por el dominio del correo, con «Crear la empresa en HubSpot».
   - Etapa 3 · Un reporte de marketing por empresa: cuántas llegaron, con cuántas áreas y cuántas pasaron a preventa.

**Criterio de éxito:** Marco revisa 5 guías reales y en 4 la siguiente pregunta es la que él haría; 8 de cada 10 sesiones quedan asociadas (solas o con la sugerencia aceptada), e INV1 sigue en verde.

### L · El diagnóstico y la planificación, después de usarlos <span class="estado">En curso</span>

Sale del feedback de Customer Success y Ventas del 23 oct, validado contra el diagnóstico que entró ese día. Plan: `docs/diagnostico-plantillas-plan.md` § «Lo que salió de usarlo».

1. [hecho, 25 oct, en producción: etapa 2] **L1 · Las reuniones con solo notas de Gemini cuentan como reuniones con texto** (pasó a T2: no son solo las 4 de CEMACO, son 301 en 90 días). *Existe a medias:* en CEMACO, 4 reuniones tienen notas largas y no transcripción (no hay nada perdido: no se activó «Transcribir»); la lectura las marca «sin texto» y sin minuta, y el diagnóstico solo lee las elegidas y las de la exploración.
   - Etapa 1 · Una reunión con notas largas se lee como reunión con texto, marcada «solo notas». Pasó a T2.
   - Etapa 2 · El Contexto del diagnóstico propone todas las reuniones del proyecto con texto, con «Sacar». Va en el paso 2.
2. [hecho, 25 oct, en producción] **L2 · Publicar dice por qué no se puede.** *Existe a medias:* «Presentar» ya lista los motivos; publicar el enlace solo dice «Primero presenta el Diagnóstico».
   - Etapa 1 · Publicar repite los motivos, con un enlace a cada sección.
   - Etapa 2 · El desafío principal con su marca de revisión, como el enfoque, y presentar la exige.
3. [hecho, 25 oct, en producción] **L3 · Los detalles que siguen pasando.** *Existe a medias.*
   - Etapa 1 · La ficha del cliente: con una propuesta de la IA no hay dónde escribir, y después de «Usar» la propuesta reaparece con la primera letra.
   - Etapa 2 · Las tarjetas que todavía no se mueven: «Consecuencias positivas», la escala, los objetivos, los ítems de un grupo del alcance y las filas de las tablas.
   - Etapa 3 · El asistente sí puede quitar ítems, pero no sabe que «Consecuencias positivas» se arma con las Acciones coherentes: enseñárselo.
   - Etapa 4 · El contexto adicional abre cerrado siempre que ya tenga algo, y recuerda lo que eligió cada persona.
4. [hecho, 27 oct, en producción: las siete etapas del Brief] **L4 · La Planificación como el siguiente entregable.** *Existe a medias:* tiene propiedades, pilotos y rutinas de adopción, y lee las Acciones coherentes del diagnóstico; no tiene sesiones, con quiénes ni entrenamientos.
   - Etapa 1 · Una sección «Sesiones y entrenamientos», que sale de las actividades vendidas cuando existan.
   - Etapa 2 · Decidir dónde viven las Acciones coherentes (ver «Lo que decides tú»).
   - Etapa 3 · Dos plantillas de Planificación, como el diagnóstico (es I2).
   - [en producción el 26 oct (`cc8d6b92`): etapas 1 a 4 y la plantilla de importación de la 5; faltan de la 5 el estado y el enlace a HubSpot de cada cosa y la lista de construcción en Tareas, la 6, la 7, la cuenta de licencias contra lo vendido y las fechas del Cronograma] **Ampliada el 24 oct con el Brief de implementación** (`docs/planificacion-brief-plan.md`): la Planificación trae las 20 pestañas de la hoja «BRIEF DE IMPLEMENTACIÓN» (la «Historia de proceso de ventas» se queda en el Diagnóstico). Decidido: usuarios y permisos van DENTRO de la Planificación, la que ve el cliente. Siete etapas, ninguna con SQL:
     1. las propiedades por grupos (con orden, «Aparece en la ficha», «Viene con HubSpot», la vista previa de la ficha e importar la plantilla de Caroline; antes, «Mejorar con IA» y el chat pasan por `fusionarFilas`);
     2. los usuarios y los permisos (equipos, usuarios, licencias contra lo vendido y la matriz Nada · Lo suyo · Lo de su equipo · Todo);
     3. cómo entra y avanza un lead (su estado, los canales, los formularios con campos de las propiedades, las automatizaciones con ramas y lo que pasa solo en cada etapa);
     4. la ficha del proyecto (hubs, sesiones de set up y de capacitación por hub, quiénes participan), el guion del bot, las cotizaciones y los informes;
     5. lo que sale solo: el estado y el enlace a HubSpot de cada cosa, la lista de construcción que va a Tareas (antes en «Más adelante») y la plantilla de importación;
     6. el cliente llena su parte en el enlace externo;
     7. las dos plantillas, esencial y completa (es I2).
   - ⚠ El agente ya está en su tope de 21.000 tokens: las secciones nuevas no entran en la corrida principal. Las pruebas, con sus pasos, están en el bloque «Para el roadmap» del plan.
5. [hecho, 25 oct, en producción] **L5 · Lo que quedó del 23 oct** (antes en «Lo que falta › Preventa y diagnóstico»). Va en el paso 2.
   - Etapa 1 · El documento de diagnóstico lee por equipo del cliente, como ya lo hace la guía de la preventa.
   - Etapa 2 · Un equipo del cliente también en las reuniones que no son sesiones de una exploración (la entrega de servicio).
   - Etapa 3 · El chat, cuando genera el diagnóstico, también avisa si casi nada está confirmado (hoy solo avisa el botón).

**Criterio de éxito:** Liliana genera, presenta y publica un diagnóstico sin preguntar por qué no puede, y todas las tarjetas se mueven.

### M · SmartLoop de punta a punta <span class="estado">En curso</span>

Sale de Liliana con RC Inmobiliaria (23 oct). Es la prioridad 1 del Resumen. Plan: `docs/smartloop-plan.md` § «El recorrido de punta a punta».

1. [hecho] **M0 · El Kickoff en el riel de un recurrente.** En producción desde `f5a1cb42` (23 oct).
2. [hecho, 25 oct, en producción] **M1 · Un kickoff que sabe que es SmartLoop.** *Existe a medias:* el de RC Inmobiliaria es de otra época (generado el 10 jul, antes de SmartLoop, no copiado de otro proyecto), y al regenerarlo Nexus le diría «proyecto temporal».
   - Etapa 1 · El kickoff de un recurrente lee el servicio, su cadencia y que se trabaja por ciclos.
   - Etapa 2 · Una plantilla de kickoff de servicio recurrente: cómo trabajamos cada ciclo, la cadencia, quién es quién, cómo se piden cosas.
   - Etapa 3 · Un kickoff anterior al servicio avisa «regenéralo».
   - Etapa 4 · Corregir el tipo de servicio de los proyectos del pipeline SmartLoop (`942509592`: 5 de sus 7 proyectos tienen `proyecto_temporal`), con simulacro.
3. [hecho, 25 oct, en producción] **M2 · Primero exploración, después diagnóstico.** *Existe a medias:* la Exploración ya está entre las piezas del ciclo (`PIEZAS_DEL_CICLO`), pero el «Qué sigue» va directo al diagnóstico y la guía de SmartLoop no nombra la exploración.
   - Etapa 1 · Sin sesiones de exploración en el ciclo, «Qué sigue» propone preparar la primera sesión por equipo.
   - Etapa 2 · La guía de la etapa Diagnóstico dice «explora primero, por equipo».
   - Etapa 3 · El diagnóstico de un recurrente avisa si se genera sin exploraciones del ciclo (el aviso de supuestos ya existe).
4. **M3 · El primer ciclo de cada cliente, con su CSE** (tú quieres probar SmartLoop con FACO, en el 3004 con datos reales, para ver que le funcione a Customer Success): RC Inmobiliaria con Liliana, Honda con Caroline y kölbi con Valentina; lo que salga se arregla en el momento. Honda ya está andando (24 oct): lo primero es traducir sus propuestas a casos de uso (C4 etapa 0, a mano y sin A2, en el paso 4) y arrancar el ciclo desde ahí.
5. **M4 · Las actividades que se repiten dejan su tarea en cada ciclo** (D2 etapa 5).

**Criterio de éxito:** RC Inmobiliaria, Honda y kölbi cierran su primer ciclo en Nexus con exploración, diagnóstico y la tarea de cada actividad que se repite.

### N · La escala de rendimiento <span class="estado">En curso</span>

La escala ubica a cada empresa en Ventas, Marketing y Servicio. Corre la 8.9.1 desde el 24 oct (tu tarea #285). Planes: lo pendiente para la 9.0 en `docs/escala/pendiente-9-0.md` (17 temas y 124 puntos, con el orden acordado: probar antes de cambiar) y lo de Insider en `docs/escala-engagement-avanzado-plan.md` (tres capas: la escala general sin herramientas, las ediciones por industria y el mapa de herramientas, que dice qué habilita HubSpot y qué Insider criterio por criterio).

1. [hecho] **N1 · Publicar la 8.9.1.** Publicada el 24 oct (`scripts/publicar-escala.ts`, todas las pruebas en verde). Tu tarea #285: revisarla en producción.
2. [hecho, 27 oct, en producción: Escala › Probar] **N2 · Probar la escala con cualquier empresa.** *No existe todavía.* Es el orden acordado para la 9.0 (decisión 13 de `pendiente-9-0.md`). Desde el 24 oct: el usuario elige la empresa que quiera, desde su preventa o su ficha, y la prueba en el artefacto de la escala; lo que da la escala se compara con lo que cree el equipo. Nunca con Wherex.
   - Etapa 1 · Cada usuario prueba con la empresa que elija, hasta juntar 5 a 8 de varias industrias (nunca Wherex).
   - Etapa 2 · Comparar lo que da la escala con lo que cree el equipo; eso decide sobre todo las celdas desbalanceadas y si se muestra el avance («cumple 27 de 30»).
3. [en curso: el borrador 9.0.0 está en Escala › Borrador, con 39 preguntas para ti; se publica después de probarlo con 5 a 8 clientes] **N3 · La 9.0 con lo pendiente.** *Existe a medias:* los 17 temas (124 puntos) están escritos, con su propuesta.
   - Etapa 1 · Primero lo que hoy ubica mal a una empresa (igualdad entre áreas, criterios compuestos, repetidos), después lo que ordena la expansión, y al final lo que depende de la prueba.
   - Etapa 2 · Se escribe junto con lo de Insider (N4 a N7), en un solo borrador, revisado por ti; se publica la 9.0.0.
   - Etapa 3 · Los casos de la biblioteca que citan criterios que cambian de identificador se actualizan en el mismo paso.
4. [hecho, 27 oct, en el borrador 9.0] **N4 · La condición «tráfico suficiente»** (de aquí a N7, lo de Insider: la sesión del 21 oct y tu documento del 23 oct). *No existe.* Personalizar al visitante anónimo y medir contra un grupo de control solo funcionan con volumen (HubSpot no personaliza al anónimo por lo que hace; Insider sí, y califica a sus clientes por tráfico).
   - Etapa 1 · Una tercera pregunta del perfil de la escala, con el umbral de la calificación de Insider, editable. Lo demás reusa la marca «venta sin vendedor», que ya existe: ningún criterio lleva dos condiciones.
5. [en curso: los 16 cambios de Insider están en el borrador 9.0.0] **N5 · Los 16 cambios de la versión 9.0.** *Existe a medias:* buena parte de lo que mostró Insider ya está en las ediciones (el catálogo, los carritos y las solicitudes a medias, las recomendaciones, la búsqueda).
   - Etapa 1 · La escala general, 11 cambios: el permiso por canal (sigue de riesgo), lo que hacen en el sitio o la app unido a la ficha, segmentos que se actualizan solos, tres canales en un recorrido, A/B con hipótesis, el ingreso que agrega el marketing contra un grupo de control (con tráfico suficiente; el más importante), los agentes que alimentan la ficha, operar con agentes de IA (nuevo), priorizar con comportamiento digital, segmentos de valor y lealtad, y avisos disparados por el evento.
   - Etapa 2 · Las ediciones, 5 cambios: en Ecommerce y retail, personalizar también al anónimo (con tráfico suficiente) y el aviso de disponibilidad o de baja de precio; en Turismo, personalizar el motor de reservas (con tráfico suficiente), recuperar búsquedas y reservas a medias, y el aviso de un cambio de vuelo.
   - Etapa 3 · Cuatro de los cambios se escriben junto con temas que la 9.0 ya tenía abiertos (permiso de contacto, partir 2.7.E1, mover 1.6.O1, 3.6.E2), sin duplicar.
   - Etapa 4 · En un borrador de la escala, revisado por ti; se publica la 9.0.0 después de la 8.9.1.
6. [hecho, 27 oct, en el borrador 9.0: se ve al publicarla] **N6 · La lectura «Preparación para engagement avanzado».** *No existe.* No cambia el nivel.
   - Etapa 1 · «Lista», «Casi lista» (dice qué cimientos faltan: es lo que vende Smarteam antes de la plataforma) o «Todavía no» (su camino es HubSpot y SmartLoop).
   - Etapa 2 · Los umbrales editables: tráfico (el de Insider) y base con consentimiento (5.000 para empezar).
   - Etapa 3 · Se ve en la exploración de la preventa y en el diagnóstico del CSE. No nombra a Insider.
7. [hecho, 27 oct: el mapa 2.0.0 reemplaza al actual al publicar la 9.0] **N7 · El mapa de herramientas para la 9.0.** *Existe* (versión 1.0.1, para la 8.8.0): ya dice, criterio por criterio, qué habilita Insider, HubSpot o Smarteam.
   - Etapa 1 · Sumar los 16 cambios con quién los habilita.
   - Etapa 2 · La ficha de Insider con el umbral de tráfico de su calificación, y la de HubSpot con lo que no hace (personalizar al anónimo por su comportamiento).

**Criterio de éxito:** la 9.0 publicada y probada con 5 a 8 clientes; por empresa y área se guardan el nivel que da la escala y el que cree su CSE, y coinciden en al menos 4 de cada 5.

### O · Los tests del diagnóstico de rendimiento <span class="estado">En curso</span>

Pedido del 23 oct: migrar a Nexus el test público de cada departamento, con mejores preguntas por industria y una página de resultados atinada. Hoy es una aplicación aparte con la escala vieja (v4); Nexus ya tiene el motor (el cuestionario de la escala y su cálculo). Plan, con el diagnóstico de la aplicación: `docs/tests-diagnostico-plan.md`.

1. [hecho, 26 oct, en producción] **O1 · El test dentro de Nexus.** *No existe* (el motor sí). *Depende de:* N1.
   - Etapa 1 · Una página pública por área, con protección contra abuso, que usa el mismo armado que el cuestionario del cliente, sin proyecto: la persona y su empresa.
   - Etapa 2 · Cada intento queda guardado en Nexus (tabla nueva, SQL aditivo).
   - Etapa 3 · La experiencia de hoy: una pregunta por pantalla, el matiz, el guardado al avanzar y el aviso de abandono.
2. [hecho, 26 oct: las preguntas esperan tu aprobación en Escala › Tests] **O2 · Mejores preguntas, por industria.** *No existe:* hoy son 8 preguntas iguales para todas las industrias. *Depende de:* N4 para la pregunta del tráfico.
   - Etapa 1 · Una pregunta por dimensión en la web, escrita para el cliente, con «No lo sé»; nunca se veta un nivel. Las de Marketing esperan «Lo que decides tú» 29.
   - Etapa 2 · La industria elige la edición (Ecommerce y retail, Banca, Educación, Inmobiliaria, Turismo, Automotriz) con sus palabras y sus preguntas.
   - Etapa 3 · El perfil corto (cómo cierra la venta, qué pasa después y el tráfico); lo que no aplica no se pregunta.
   - Etapa 4 · Las revisas tú antes de publicarlas.
3. [hecho, 26 oct, en producción] **O3 · La página de resultados.** *Existe a medias:* hoy muestra el nivel, el radar y recomendaciones de la IA, con un puntaje que mueve la IA.
   - Etapa 1 · El cálculo lo hace Nexus con la escala de hoy (cada dimensión a mitad de su banda, la capa y el área como promedio), marcado como estimado.
   - Etapa 2 · Los riesgos, el costo de quedarse y una sola recomendación con su razón.
   - Etapa 3 · Los casos de uso que lo mueven, sin precio, y la lectura de preparación cuando aplica (N6).
   - Etapa 4 · La síntesis la escribe la IA sin mover números; se reusan el radar y la curva de hoy.
4. [hecho, 26 oct; el envío a HubSpot queda apagado («Lo que configuras tú»)] **O4 · Unido a HubSpot y a la preventa.** *Existe a medias:* hoy deja la nota y la dirección del resultado en HubSpot, y la preventa la decodifica.
   - Etapa 1 · HubSpot recibe lo mismo que hoy (contacto, empresa, nota y dirección), para no romper nada.
   - Etapa 2 · El resultado entra directo a la preventa de la empresa en Nexus, como algo a validar en la primera sesión (K7).
   - Etapa 3 · Los leads, agrupados por empresa con quién llenó cada área (K10).
5. [hecho, 26 oct, en producción] **O5 · Tres versiones del test** (24 oct). *No existe.*
   - La de Marketing: 4 preguntas fáciles, para conseguir el lead.
   - La web: 8 preguntas, una por dimensión; la usan Marketing y Ventas para conseguir la primera reunión.
   - La completa: la llena el consultor de Customer Success en la exploración profunda, según el caso de uso o en una exploración general. Va por equipo, porque la escala ubica a un equipo: una empresa puede tener varias (Ventas, servicio, Customer Success, sus clientes).
   - Las preguntas las revisas tú, y el equipo opina al usarlas.
6. [en curso: las etapas 1 y 3 en producción el 27 oct; el cambio de dirección y el apagado esperan tu aprobación de las preguntas y un formulario nuevo de HubSpot (RUNBOOK › «El corte de la aplicación vieja del test»)] **O6 · El corte de la aplicación vieja.**
   - Etapa 1 · Los enlaces viejos del resultado se siguen leyendo.
   - Etapa 2 · La dirección pública pasa a Nexus, con los píxeles de anuncios y el formulario de HubSpot intactos.
   - Etapa 3 · Se mide cuántos empiezan, abandonan (y en qué pregunta) y terminan; se apagan el backend de Vercel y la página estática.

**Criterio de éxito:** la aplicación vieja apagada sin perder leads; cada intento llega a Nexus y a HubSpot (diferencia 0 entre los dos), la tasa de intentos terminados entre visitas se compara antes y después del corte, y el abandono se mide por pregunta.

### P · El módulo de Tareas, organizado y profesional <span class="estado">Propuesta</span>

Pedido del 23 oct, con la tarjeta de Trello y la barra de clientes de ClickUp como referencia. No va amarrado al cronograma: es cómo se ven y se organizan las tareas. Plan: `docs/tareas-organizacion-plan.md`.

1. **P1 · Filtrar por cliente en una barra a la izquierda.** *Existe a medias:* hoy se filtra por tipo de empresa (Cliente, Interno, Prospecto, Aliado), no por una empresa, y «Por cliente» es una tabla aparte.
   - Etapa 1 · La barra: «Todas», cada cliente donde la persona tiene tareas (con el color de su tipo de cuenta), «Sin cliente», «Capacitación» y «Equipo interno», con su número de abiertas.
   - Etapa 2 · «Por cliente» pasa a ser esa misma vista.
2. **P2 · La tarea en un modal grande.** *No existe:* hoy es un cajón de 560 px.
   - Etapa 1 · El diseño en Claude Design (pantalla interna), revisado por ti.
   - Etapa 2 · A la izquierda, el nombre, la **descripción** debajo, las subtareas y la actividad; a la derecha, «Agregar a la tarea» (responsable, cliente asociado, fechas, estimación de tiempo, etiquetas, sesión, proyecto).
   - Etapa 3 · Los nombres: «Cuánto toma» → «Estimación de tiempo», «Notas» → «Descripción», «Para quién» → «Cliente asociado», «Para» → «Responsable».
   - Etapa 4 · La casilla «Es una sesión» o «Asociada a una sesión», con los invitados y la hora.
   - Etapa 5 · Subtareas: tareas hijas con su responsable y su fecha (decidido el 24 oct; SQL aditivo), y el checklist simple para lo demás (el campo ya existe y nadie lo usa).
3. [hecho, 27 oct, en producción] **P3 · El calendario y las sesiones.** *Existe a medias:* «Agendar» crea un bloque nuevo; no se puede unir una tarea con un evento que ya existe.
   - Etapa 1 · En la agenda, tocar un evento existente ofrece «Asociar a una tarea»; tocar un espacio vacío la crea, como hoy.
   - Etapa 2 · Una tarea que es una sesión queda unida a su reunión de Meet cuando llega, y la reunión se lee con IA como cualquier otra.
   - Etapa 3 · Las fotos de las personas en la tarea y en la agenda, en una versión chica (64 px) que no pesa; iniciales para quien no tiene.
4. **P4 · Listo para generar tareas desde lo vendido.** *No existe:* las plantillas de tareas están en el modelo, sin uso. *Depende de:* A2.
   - Etapa 1 · Plantillas con subtareas: una tarea por actividad de cada caso vendido, con el cliente asociado y su fuente («propuesta X · caso Y»).
   - Etapa 2 · El disparo desde el handoff es D2.
5. [en curso: la etapa 2, en producción el 27 oct] **P5 · Leer todas las sesiones de cada persona.** *Existe a medias:* hoy se leen las reuniones con clientes de los últimos 14 días y los sprints; las internas sueltas no.
   - Etapa 1 · La copia de Meet cada 10 minutos (es U1), y leer las reuniones internas de cada persona (tu piloto, H1, primero).
   - Etapa 2 · Cada propuesta guarda y muestra su sesión, el contexto, las personas que estuvieron, el encargado y quién la pidió.
   - Etapa 3 · Con tope, y después de limpiar lo que nadie decidió (D2 etapa 1).

**Criterio de éxito:** el de la tarjeta 9; además, 3 personas usan subtareas con responsable y fecha, y la mitad quedan terminadas; y tu piloto de lectura interna cumple el criterio de H.

### Q · El kickoff: HubSpot Academy y el acceso al portal <span class="estado">Propuesta</span>

Pedido del 23 oct. El kickoff es un documento que ve el cliente: una sección nueva sigue el contrato de los documentos y entra a su registro. Plan: `docs/kickoff-mejoras-plan.md`.

1. [en curso: etapas 1 y 2, en producción el 27 oct] **Q1 · La ruta de HubSpot Academy.** *No existe.*
   - Etapa 1 · Un catálogo de listas de reproducción de Academy que mantiene Smarteam: nombre, enlace, hub, rol y duración.
   - Etapa 2 · Una sección nueva del kickoff, «Tu ruta en HubSpot Academy»: las listas asignadas por rol (líderes, Ventas, Marketing, Servicio) según los hubs contratados y el equipo del cliente; el CSE ajusta.
   - Etapa 3 · Más adelante, la adopción (F) mira quién terminó su lista.
2. [en curso: etapas 1 y 2, en producción el 27 oct] **Q2 · El acceso a su portal.** *Existe a medias:* «Lo que necesitamos de tu equipo» pide «accesos» en general, sin garantía de que aparezca y sin seguimiento.
   - Etapa 1 · Una tarjeta fija, siempre la primera de esa sección: darnos acceso a su portal de HubSpot, con los pasos y para cuándo.
   - Etapa 2 · El estado del acceso en el proyecto (dado o pendiente, con la fecha en que se dio), con un aviso al CSE mientras falte.
   - Etapa 3 · La comprobación automática cuando los portales de los clientes estén conectados (la auditoría del portal).

**Criterio de éxito:** todo kickoff nuevo trae la ruta de Academy por rol y la tarjeta del acceso al portal, y el acceso queda «dado» en menos de 10 días hábiles en 8 de cada 10 proyectos nuevos (Q2 etapa 2 guarda la fecha).

### R · La empresa como objeto central <span class="estado">En curso</span>

Pedido del 23 oct: que la empresa sea el centro, enriquecida y sincronizada con HubSpot en los dos sentidos, con documentos sin proyecto, para vender, atender con IA y hacer venta cruzada. Revisado contra el esquema y la base ese día. Plan: `docs/arquitectura-empresa-plan.md`; el plano de hoy, en «Cómo funciona Nexus».

1. [hecho, 24 oct, en producción; falta la carga inicial] **R1 · Los datos de la empresa en columnas** (paso uno del roadmap; plan: `docs/empresa-datos-hubspot-plan.md`). *Existe a medias:* la industria vive en cinco lugares sin regla de cuál manda, el tamaño se lee de HubSpot y no se guarda, el TAM está vacío en las 200 empresas.
   - Etapa 1 · Empleados, país, sitio web, industria, segmento (estándar, corporativo o gobierno), TAM, perfil de negocio, edición de la escala, tráfico, base con consentimiento y si califica para Insider, cada uno con su fuente y su fecha (SQL aditivo). Se reusan `Client.tamUsd` y `Client.industry`, y se les suma la fuente y la fecha.
   - Etapa 2 · La carga inicial desde las preventas y HubSpot.
   - Etapa 3 · Una sola regla de quién manda en cada dato: HubSpot, Nexus o una persona.
   - Etapa 4 · El TAM lo calcula Nexus con la investigación y una fórmula escrita (validada el 23 oct), y lo escribe en «TAM | Potencial $» de HubSpot, que existe y nadie llena: el equipo no tiene el criterio para definirlo. Va en dos versiones:
     - **TAM v1, en el paso uno** (24 oct): sale de cómo es la empresa: su tamaño (empleados), si es casa matriz o filial (y cuántas filiales tiene), su industria y su modelo de negocio. Con eso, las licencias de HubSpot que le corresponden por tamaño y por los hubs que le sirven, a precio de lista, e Insider si califica. Los servicios todavía no suman: los precios los fija Ventas hasta que existan las actividades, y no hay un monto por nivel de la escala. El TAM dice «estimado v1». Lo que la empresa ya paga de licencias sale de su portal (Client Partners, área U).
     - **TAM v2, después de A2:** suma los servicios, con las horas de las actividades.
     - **Antes del código,** se enmienda DECISIONS «Qué ES una empresa: `ClientKind` + TAM (2026-07-24)», que hoy dice que Nexus no deriva el TAM; se conservan null distinto de 0 y el techo de 100 millones.
     - **Quién lee `tamUsd` hoy:** `proponerPotencial` (`lib/cs/clasificacion.ts`) dice «TAM estimado por Ventas», y `app/api/clients/[id]/classification/route.ts` lo escribe con `ventas.write`. La razón pasa a decir la fuente («calculado por Nexus»), el permiso se ajusta, y antes del `--apply` se muestra cuántas cuentas cambian de potencial: la CSL tiene que saberlo.
     - El TAM no entra a la memoria de la cuenta: `lib/memoria/frontera.test.ts` ya lo prohíbe, y R11 lo respeta.
   - Etapa 5 · Proponer y decidir: la IA o cualquier persona propone un cambio, que se ve al lado del dato con quién y por qué; el usuario de Nexus que lo está usando, según su rol, lo usa, lo edita o lo descarta, y lo que decide se escribe en HubSpot con la sugerencia del agente (24 oct). Quién puede decidir sale de una celda nueva, `clientes.decidirDatos` (`lib/auth/permissions/registry.ts`, editable en /team), que traen CSE, CSL, Ventas y los super admin (24 oct). Cualquier dato se edita a mano. El TAM lo ve solo el equipo.
2. [hecho, 25 oct, en producción] **R2 · Un solo módulo de la empresa de HubSpot.** *Existe a medias:* hay cinco listas distintas de lo que se lee, y solo se escriben las de la ficha: 8 propiedades `nexus_*` (7 de texto y una lista) y 2 notas, más `siguiente_paso_<equipo>` en empresas, negocios y proyectos.
   - Etapa 1 · Una tabla que dice, campo por campo, qué propiedad es, quién manda y en qué sentido va.
   - Etapa 2 · Escribir en HubSpot lo que Nexus enriquece como propiedades `nexus_*`. En el paso uno se crean el grupo «Nexus · Empresa» y, ya como listas, números y fechas, solo las propiedades que algo llena ahora: `nexus_tam_fuente`, `nexus_tam_fecha`, `nexus_investigacion_fecha`, `nexus_a_quien_vende`, `nexus_perfil_cierre`, `nexus_perfil_despues`, `nexus_trafico` y `nexus_base_consentimiento`, con simulacro y tu sí (molde: `scripts/hubspot-crear-propiedades-ficha.ts`). `nexus_nivel_*` y `nexus_escala_fecha` (B2 o N2), `nexus_califica_insider` (N6) y `nexus_siguiente_caso` (R12) se crean cuando exista su fuente.
   - Etapa 3 · Las propiedades estándar (industria, empleados) solo si en HubSpot están vacías, o cuando el usuario de Nexus que lo está usando, según su rol, usa o edita la propuesta (24 oct).
   - Etapa 4 (después, 24 oct: primero que el usuario escriba en HubSpot con la sugerencia del agente) · Tres o cuatro reportes base y el tablero «Cartera por potencial».
3. [hecho, 27 oct, en producción: etapas 1 a 3] **R3 · Los documentos de la empresa, con o sin proyecto.** *No existe:* cada documento es de un proyecto o de una propuesta.
   - Etapa 1 · La empresa como dueña de cada documento; el proyecto y la propuesta, opcionales.
   - Etapa 2 · Un diagnóstico personalizado para un prospecto, y el documento de resultados de la preventa (C5).
   - Etapa 3 · Los permisos y la vista del cliente, probados con un diagnóstico de un prospecto y uno de un proyecto.
4. [en curso: el script que une las 6 copias repetidas está listo, sin aplicar («Lo que decides tú» 36)] **R4 · Retirar «Información del cliente» como proyecto falso.** *Depende de:* R3. Hay 94 para 88 empresas y arrastran canvases que no son suyos.
   - Etapa previa (antes en «Deuda que encontró la validación»): unir los contenedores repetidos (Ministerio de Economía tiene 5, AMC 2 y Librería 2), con su script en simulacro.
5. [hecho, 26 oct, en producción: la preventa lee la investigación desde la empresa] **R5 · Las investigaciones son de la empresa.** *Existe a medias:* la investigación web vive dentro de la preventa. Va en dos partes, que comparten `lib/exploraciones/agente.ts` y `esquemas.ts`:
   - En el paso uno, con R1: guardar y leer la investigación en la empresa, con su fecha, sus fuentes, las contrataciones y el tamaño estimado; se rehace cuando vence.
   - En el paso 2: que la preventa la lea de ahí, después de K7 y K1 en `main` o en la misma sesión que K.
6. [hecho, 25 oct, en producción] **R6 · Una persona del cliente, con su rol.** *No existe:* hay cinco copias sin unir (1.612 participantes de reuniones, de los que solo 567 son contactos de HubSpot). Una tabla de personas por empresa con su rol (decide, influye, usa), alimentada por HubSpot.
7. [hecho, 24 oct] **R7 · Endurecer las llaves.** `FirefliesSession.resolvedClientId` (RESTRICT) y `manualClientId` (SET NULL) son llaves de verdad, aplicadas en producción (`scripts/sql/2026-10-24-llaves-de-la-empresa.sql`); INV48 vigila que existan y hagan lo decidido al borrar. Borrar una empresa suelta antes sus reuniones con una sola función (`lib/clients/soltar-reuniones.ts`). Areyas y Areyá, fusionadas. Decisión: DECISIONS › «Las llaves de la empresa».
   - [hecho, 24 oct, en producción; INV48 lo vigila] **R7b · Volver único `Client.hubspotCompanyId`** (con la sesión de la empresa). Hoy siete caminos pueden repetir el id (la copia de Partner, el import del sistema, elegir la empresa a mano, la copia de proyectos por nombre, la ficha de HubSpot, el alta por OAuth y la conexión de un portal) y algunos guardan el id de la empresa en el portal del cliente, no en el de Smarteam. Cada camino busca primero la ficha que ya tiene ese id y la reusa o responde 409; después, el índice único y su lugar en INV48.
8. **R8 · Limpiar lo viejo.** Borrar los campos vacíos y vencidos (SQL aparte y revisado), quitar los escritores de las tarjetas viejas, pasar a tablas la copia en Json de HubSpot y partir la ruta `analyze` (3.385 líneas). `isProspect` todavía lo escribe `lib/clients/fusion-de-empresas.ts` (línea 421) y 9 empresas lo tienen en true: R8 quita ese escritor antes del DROP.
9. **R9 · La historia de la ficha en una tabla:** hoy la historia suma 9,6 kB y la ficha más grande pesa 23 kB. Con R1, la tabla `PropuestaDeDato` es también esa historia.
10. [hecho en parte, 24 oct] **R10 · Corregir ARCHITECTURE.md:** los números quedaron medidos el 24 oct (128 `page.tsx`, 512 `route.ts`, 197 modelos, 92 enums, 90 carpetas en `lib/`, `analyze` con 3.385 líneas y `ProjectCanvasPanel` con 1.364). Falta revisar los estados de la deuda de §12 uno por uno.
11. **R11 · Un solo contexto de la empresa para los agentes** (IA first): los datos, la investigación, la escala, los casos de uso, las personas y la memoria, armados en un lugar que lee cada agente.
12. [hecho, 25 oct, en producción] **R12 · Lo que le falta comprar a cada empresa** (venta cruzada): con la escala y los casos de uso, qué casos la moverían y no tiene; se ve en la cuenta y se puede escribir en HubSpot.
13. [hecho, 25 oct, en producción: etapas 1 y 2] **R13 · Smarteam, la empresa que usa Nexus** (pedido del 24 oct). *Existe a medias:* Smarteam ya es una empresa en Nexus (ficha «interna», con su empresa de HubSpot), y hay 44 puntos del cliente ideal y 4 buyer personas cargados en Marketing › Audiencia, pero viven sueltos, sin colgar de esa ficha, y solo los leen el agente de ideas de Marketing y Documentación: ni la preventa, ni las propuestas, ni el analizador de reuniones.
   - Etapa 1 · El perfil de Smarteam en un solo lugar, colgando de su ficha: el cliente ideal, las buyer personas, la propuesta de valor y el position statement (K3), los servicios y sus tarifas, los clientes de referencia por industria (K4) y el tono de la marca. Se edita en una pantalla, y lo de hoy se muda sin perder nada.
   - Etapa 2 · Un solo lector («lo que Nexus sabe de Smarteam») que usan la preventa, las propuestas, el analizador de reuniones de venta y Marketing; cada agente lee de ahí y no de copias.
   - Etapa 3 · El encaje con el cliente ideal: cada empresa dice qué tanto se parece al cliente ideal de Smarteam, con su porqué, al lado de su TAM.
   - Pensado para cuando Nexus lo use otra empresa: el perfil es de la empresa que usa Nexus, no una constante del código.

**Criterio de éxito:** en el paso uno (R1, R2, R5 y R7), el de la tarjeta 1; por ítem, el de su plan (`docs/arquitectura-empresa-plan.md` y `docs/empresa-datos-hubspot-plan.md`). Después (R3, R4 y R11): un documento vive en la empresa sin proyecto, «Información del cliente» baja de 94 a 0, y un agente lee la empresa desde un solo lugar.

### S · El análisis de la venta consultiva <span class="estado">En curso</span>

Pedido del 23 oct: Ventas va muy directo a la solución y explora poco. Queremos alejarnos de la venta transaccional y diagnosticar de forma profunda al cliente. Es coaching, no control: cada juicio trae su cita y no hay ranking. **Rediseño del 26 oct:** el análisis vive en la preventa y no en Sesiones; el de cada sesión (la autoevaluación del vendedor) va separado del análisis de lo que se exploró. Plan: `docs/analizador-reuniones-venta-plan.md`.

1. [hecho, 26 oct, en producción] **S1 · El criterio escrito.** El proceso consultivo como lista (identificar, investigar, conectar, explorar, asesorar), con lo que se espera en cada etapa. «Marcar como referencia» se quitó (27 oct): el agente no la leía, por la regla de no mezclar clientes, y no aportaba.
2. [hecho, 26 oct, en producción] **S2 · Quién habló.** El reparto de palabras entre Smarteam y el cliente, sin IA, desde las frases de Meet o la transcripción.
3. [hecho, 26 oct, en producción, todavía en Sesiones] **S3 · El análisis de cada sesión, con citas.** Qué tan consultiva fue (problemas y resultados frente a licencias y precio), la guía, la escala, el posicionamiento, lo que quedó sin explorar, asesor o vendedor de licencias, el siguiente paso y dos o tres recomendaciones; cada juicio con una cita que Nexus verifica en la transcripción. Prueba con Camosa: 28 juicios con cita válida, 8 descartados, Smarteam habló el 62 %, US$0,16.
4. [hecho, 27 oct, en producción] **S4 · La autoevaluación en cada sesión de exploración** (26 oct). En Preventa › Exploración › la sesión › «Análisis», un apartado aparte de lo que ya está (siguiente paso, cuánto avanzó, quedó abierto): «Cómo trabajaste esta sesión», con el análisis de S3 resumido para esa sesión. Ajuste de Elías del 27 oct (en producción, `a9df93e2`): es feedback de cómo se trabajó la sesión, no planificación de la siguiente. Arriba y en grande va la lectura general; el proceso consultivo, en 4 tarjetas; lo que faltó explorar, en tarjetas chicas por equipo; y dos o tres cosas «Para mejorar». Se quitaron los comentarios del vendedor y el siguiente paso. Una persona lo confirma.
5. [hecho, 27 oct, en producción] **S5 · La pieza «Análisis» del prospecto** (26 oct; antes S7, «el analizador por cliente»). Una pieza nueva de la preventa, junto a Exploración, La escala, Casos de uso y Propuesta: todas las sesiones de exploración y también las de propuesta, una debajo de la otra, con cómo se trabajó cada una (qué tan consultiva fue, quién habló, qué se exploró y qué quedó sin explorar, el siguiente paso y si se cumplió), y arriba la lectura de conjunto: cómo se ha trabajado a este prospecto y qué falta diagnosticar antes de proponer.
6. [hecho, 27 oct, en producción] **S6 · Sacar el analizador de Sesiones** (26 oct). La vista «Reuniones de venta» de la salud de las reuniones, el criterio y el análisis por reunión se mudan a la preventa (S4 y S5) o se quitan; en Sesiones no queda nada de analizar el manejo de un cliente ni de una sesión.
7. [hecho, 27 oct, en producción: Ventas › Preventa › «Análisis de la venta»] **S7 · La tendencia por vendedor,** primero solo para los super admin y después para todo Ventas, cada uno con lo suyo (24 oct): cuánto explora, cuánto habla, cuántas sesiones dejan siguiente paso con fecha y cuántas tienen transcripción. Cuenta las sesiones de cada vendedor que estuvo (T7), atribuidas por el calendario y por quién habló, nunca por la asistencia ni los minutos de Meet.
8. **S8 · Probar con Andrés** cinco sesiones reales, entre ellas la de Camosa del 23 oct, antes de abrirlo al resto de Ventas. El análisis automático ya está prendido desde el 27 oct, solo para las sesiones de las exploraciones de la preventa (tu decisión).

**Criterio de éxito:** Andrés revisa 5 análisis y está de acuerdo con la mayoría; cada juicio trae su cita; y, con el tiempo, el cliente habla más que Smarteam en las exploraciones y más sesiones cierran con un siguiente paso con fecha.

### T · Las reuniones, la pieza angular del contexto <span class="estado">En producción</span>

Elías, 23 oct: el módulo que obtiene las sesiones es el creador del contexto de cada empresa. Medido en 90 días: de 1.264 reuniones con empresa, 545 con transcripción, 301 solo con notas (tratadas como sin texto) y 404 sin nada; y 67 reuniones con texto sin empresa. El caso de Camosa está bien en todo el camino. El de Liliana quedó resuelto el 24 oct: era «Cemaco | Data Hub» del 22 oct, que ocurrió sin transcripción ni notas (por eso nace T9). Plan: `docs/reuniones-pieza-angular-plan.md`.

1. [hecho, 24 oct, en producción] **T1 · El tablero de salud de las reuniones.** En Sesiones › «Ver la salud de las reuniones» (`/sessions/salud`): por persona, por empresa, «Sin texto: por qué» y «Sin empresa»; la líder de Customer Success y dirección ven a todo el equipo, el resto lo suyo. INV47 «no bloquea» hasta su primer verde (19 reuniones sin empresa, entre ellas las de FACO). Pendiente para T3: el botón para asignar la empresa (hoy dice «Pronto»).
2. [hecho, 24 oct; falta el deploy] **T2 · Las notas de Gemini cuentan como texto** (antes L1). Un solo «qué se lee» (`queSeLee`) y un predicado único «tiene texto» (`lib/sessions/tiene-texto.ts`); una reunión con solo notas se lee entera, con su bandera `SEGUIMIENTO_SOLO_NOTAS` (0 la apaga). Lo de antes: *Existe a medias:* la lectura ya toma las reuniones con solo notas de 400 caracteres o más cuando `SEGUIMIENTO_HECHOS=1` está prendida (lo está: 581 hechos, 153 sacados de notas), pero solo saca hechos, no minuta ni tareas (`motivoParaNoEncolar`, `lib/lecturas/reglas.ts`); el buscador las trata como sin texto.
   - T2 suma la minuta, separa «lee solo notas» con su propia bandera (que también es la vuelta atrás) y crea un predicado único «tiene texto» en `lib/sessions/`, que reemplaza los ~10 filtros `transcript: { not: null }` sueltos; T1 usa el mismo.
   - Las de más de 14 días van por el modo de recuperación (`docs/reuniones-pieza-angular-plan.md` › «Cómo se trae lo que ya existe»).
   - Antes de contar las notas como texto, verificar «Cemaco | Data Hub» del 22 oct: tiene 8.336 caracteres de notas que la API de Meet dice que no generó, y puede ser texto de otra reunión de la misma serie (KNOWN-ERRORS, primera entrada).
   - Recupera 301 reuniones.
3. [hecho, 25 oct, en producción] **T3 · Las reuniones con texto sin empresa.** *No existe:* 67 en 90 días. Nexus propone la empresa o crea el prospecto desde la empresa de HubSpot del dominio, y quien organizó la reunión confirma en un clic (24 oct). *Depende de:* R7.
   - La propuesta reusa las piezas de `categorize.ts` (`extractParticipantDomains`, `buildHubspotDomainMap`), sin un matching nuevo.
   - Confirmar escribe `manualClientId` con `manualClientSource = humano` por `reResolveSession`. Lo mismo vale para «Mover a esta empresa» de T8.
   - Una reunión de más de 14 días no se lee sola: va por el modo de recuperación.
   - Un escaneo estructural comprueba que T3 y T8 no eligen empresa fuera de `categorize.ts`.
4. [hecho, 25 oct, en producción] **T4 · Las reuniones sin nada.** *Existe a medias:* 404 en 90 días. El motivo ya lo calcula `lib/google/por-que-falta.ts`, con 11 motivos y quién lo arregla, pero solo lo usa un script. Falta guardarlo y mostrarlo, más el motivo «cancelada» (U1) y «no ocurrió» (U3). T1 lo muestra desde el primer día. El aviso va en la reunión misma, en Nexus, para quien la organizó (24 oct).
5. [hecho, 25 oct, en producción] **T5 · La reunión presencial.** *Existe a medias:* se puede pegar el texto; subir el audio y transcribirlo pide un servicio («Lo que decides tú» 21). Es el caso de Grupo Avis.
6. **T6 · La copia de Meet sin esperar a que alguien abra Nexus** (antes en H1 y P5): se hace en U1, cada 10 minutos, y al momento con U4.
7. [hecho, 25 oct, en producción] **T7 · Quiénes de Smarteam estuvieron.** *Existe a medias:* se guardan los invitados y `participantes.ts` ya cuenta los del equipo, pero no se sabe quién estuvo (la de Camosa la organizó Liz y fueron Marco y Andrés). Cada reunión guarda a los del equipo con su papel. *Depende de:* U3.
8. [hecho, 25 oct, en producción] **T8 · Encontrar cualquier reunión de la empresa.** *Existe a medias:* el buscador muestra las de la empresa y las de tu calendario, y marca «sin transcripción» lo que tiene notas. Mostrar también las de la empresa en que no estuviste y las que quedaron en otra empresa con el mismo dominio, con «Mover a esta empresa» (con K5).
9. [hecho, 25 oct, en producción] **T9 · La persona aporta el contexto de la reunión** (24 oct). *Existe a medias:* `lib/sessions/reunion-a-mano.ts`, con la marca `aMano`, ya guarda lo que una persona recuerda de una reunión; en producción, 0 usos. En cada reunión sin texto (y en las que tienen poco), Nexus le hace a quien estuvo dos o tres preguntas, armadas con lo que sabe de las otras reuniones de la empresa («¿se habló del Data Hub?, ¿qué quedó pendiente con Delphos?»). Lo que responde se guarda como el texto de esa reunión, marcado «lo contó una persona», y se lee como cualquier otro. Es el caso de «Cemaco | Data Hub» del 22 oct: ocurrió, con 7 personas, y nadie activó la transcripción.

**Criterio de éxito:** el de la tarjeta 2; por ítem, el de su plan (`docs/reuniones-pieza-angular-plan.md` › «Criterio de éxito»).

### U · Las integraciones, aprovechando lo que cada API permite <span class="estado">En producción</span>

Pedido del 23 oct: que no vuelva a pasar lo de Mercury (no usábamos lo que la API daba). Investigado el 24 oct contra el código, los servicios en solo lectura y la documentación oficial. Tres planes: `docs/integracion-google-plan.md`, `docs/integracion-hubspot-plan.md` y `docs/integraciones-finanzas-ia-plan.md`.

**Google Workspace** (la base de las reuniones, T):
1. [hecho, 24 oct; falta el deploy y, después, el rescate] **U1 · Sin scopes nuevos.** La copia de Calendar y la lectura de los Docs en un job cada 10 minutos (hoy solo cuando alguien abre la app); correr el rescate de las 177 reuniones que se leyeron antes de terminar; guardar el código de la reunión, la respuesta de cada invitado y los eventos cancelados (hoy una reunión borrada se queda). El detalle, en `docs/integracion-google-plan.md`:
   - **El job** usa el mismo turno de `CronJobState` que `autoSyncGoogleMeet` (la espera contada desde el fin), no espera dentro del tick y tiene la bandera `GOOGLE_MEET_SYNC_ENABLED=0`, que lo apaga y vuelve al disparo al abrir la app. Ese disparo queda en el código como vuelta atrás y nunca corre a la vez que el job.
   - **Antes de empezar,** medir cuánto dura una corrida y la frescura de hoy. Si una corrida pasa de unos 3 minutos, `syncToken` pasa de U4 a U1, o va un barrido corto cada 10 minutos y el completo una vez al día.
   - **Una invariante de frescura,** con el molde de INV31 (la del espejo de Odoo): si la última copia buena tiene más de una hora, rojo.
   - **Un solo SQL aditivo:** `FirefliesSession.conferenceId` (con índice) y `canceladaEn`, y la tabla `ParticipanteDeReunion` con su forma completa (U3 y T7 la llenan y no crean otra).
   - **Un evento cancelado nunca se borra:** si la reunión tiene texto, minuta, hechos o tareas, se marca y queda para que una persona la revise. Solo una cancelada sin texto sale del chokepoint, del buscador y de la cola.
   - **El rescate** va después del deploy y recupera el texto, pero no lo lee: la lectura va por el modo de recuperación (`docs/reuniones-pieza-angular-plan.md`).
2. [hecho, 25 oct, en producción] **U2 · La prueba de un día** con el scope de Meet (24 oct: los permisos de Google están dados y la API ya lee participantes y transcripciones por frases), sobre 5 reuniones reales: el código de la reunión, si un invitado puede leer una reunión del cliente, y si los eventos aceptan delegación de dominio.
3. [hecho, 25 oct, en producción] **U3 · La API de Meet.** Prueba que la reunión ocurrió («no ocurrió» deja de contar como «no se grabó»); la transcripción por frases con quién habló y cuándo (se borra a los 30 días: hay que copiarla antes); quiénes estuvieron y cuánto tiempo; y el orden de las fuentes: las frases, el Doc de la transcripción, el Doc de las notas y el Drive.
4. [hecho, 25 oct, en producción] **U4 · Enterarse al momento:** los eventos de Meet (conferencia terminada, transcripción y notas listas) por Pub/Sub, con el sondeo como red; Calendar con copia incremental.
5. [hecho, 25 oct, en producción] **U5 · Las reuniones del cliente y las presenciales:** probar si un invitado nuestro las lee; si no, que las convoque Smarteam. Las presenciales, con el audio transcrito (T5).

**HubSpot:**
6. [hecho, 24 oct, en producción] **U6 · Un solo transporte** en `lib/hubspot/client.ts`: el token (un solo refresh, sin carreras) y los reintentos ante 401 y 429 respetando la espera y los encabezados del límite (hoy el reintento ante un 401 está en 14 lugares y solo `lib/auditoria-portal/lecturas.ts` espera ante un 429). Las firmas de `getSystemHubspotClient` y `getSystemAccessToken` no cambian. La lista de propiedades de la empresa es de R2 (`lib/hubspot/empresa.ts`); U6 se junta en `main` antes de que R2 escriba. La clasificación de 401 y 403 de `lib/hubspot/sync-projects.ts:510` se arregla antes, en el paso cero.
7. [hecho, 25 oct, en producción] **U7 · Los resúmenes de sus reuniones y llamadas** como contexto (Notetaker responde hoy, sin permisos nuevos); la transcripción, a probar. Son 770 reuniones y 646 llamadas que no entran. Sin duplicar las que llegan por Meet. *Depende de:* U1 (el código de la reunión). Comprobar antes que HubSpot guarde el enlace de Meet; si no, se cruza por hora y participantes.
8. [hecho, 25 oct, en producción] **U8 · Los correos:** el permiso `sales-email-read` se dio el 24 oct; la copia de cada hora trae los de 120 días. Falta comprobar que entren. Decidido el 24 oct: copiar todos (no gasta IA) y leer con IA solo los de las empresas que lo necesitan (activas o usadas en Nexus).
9. [hecho, 25 oct, en producción] **U9 · Las fusiones, de forma sistemática:** una búsqueda diaria que propone reapuntar (34 empresas fusionadas en el portal).
10. [hecho, 25 oct, en producción] **U10 · Webhooks** para empresa, contacto, negocio y ticket, con el sondeo como red; y un job para los proyectos, que hoy solo se copian al abrir la ficha.
11. **U11 · La copia incremental** de contactos y tickets (hoy se releen enteros cada hora).
12. **U12 · Los leads:** manda B3; aquí solo el permiso, dado el 24 oct.
13. **U13 · Nexus dentro de HubSpot:** una tarjeta de solo lectura en la ficha de la empresa y del negocio (las tarjetas clásicas se apagan el 31 de octubre de 2026; esta va en la plataforma nueva).
14. **U14 · Salir de lo legacy** antes de septiembre de 2027 (la API v1 de engagements, que también usa `lib/exploraciones/hubspot.ts:421`; `broadcast/v1`; la app pública legacy).

**Finanzas:**
15. [hecho, 26 oct, en producción] **U15 · Odoo: las 98 líneas del banco sin conciliar** como razón en «Lo que no cuadra» (plata que entró y no está atada a ninguna factura). Si Alex las revisa en Odoo y no en Nexus, sale del paso uno («Lo que decides tú» 28). Va junto con el token de Apify en la cabecera (sin riesgo).
16. **U16 · Odoo: el día del pago y el banco** desde `invoice_payments_widget`, que ya los trae (el gemelo del error de Mercury).
17. **U17 · Odoo: el verde de «en proceso de pago»** con `is_matched`, con simulacro (mueve 176 cobros).
18. **U18 · Mercury: buscar el depósito en la cuenta de destino** de cada factura.
19. **U19 · Mercury: revisar con Alex el ritmo de los movimientos** (uno por día desde el 16 oct).
20. **U20 · Stripe,** cuando llegue la clave: los cobros, los movimientos del saldo y las liquidaciones. Antes, saber si los pagos con tarjeta de Mercury caen en la cuenta de Smarteam.

**La IA y el resto:**
21. [hecho] **U21 · Corregir el precio de Sonnet 5** en el panel de gasto: cobraba US$3/US$15 y es US$2/US$10. Corregido el 24 oct en `lib/ai/precios.ts` y en lo guardado: 90 llamadas pasaron de US$5,85 a US$3,90 (`scripts/recalcular-costo-de-llamadas.ts`). Falta el deploy; después se corre otra vez el script para las llamadas de hoy. Las 146 de agosto y septiembre que nunca tuvieron costo siguen sin él (`--tambien-sin-costo` las llena: unos US$4,35).
22. [hecho, 25 oct, en producción] **U22 · Que el ahorro por lotes corra:** lo atrasado (más de 14 días) se lee por lote con `scripts/encolar-lecturas-pendientes.ts --recuperacion`, después del deploy. Medido: el barrido diario del vigía nunca corrió en producción (sin fila de `cs-watchdog-daily`); lo más probable es que falte `CS_WATCHDOG_ENABLED=1` en el `.env` del servidor. Lo de antes: 0 filas en `PedidoEnLote`. El vigía ya está conectado (`VIGIA_BARRIDO_POR_LOTE = true`), pero solo encola los proyectos sin novedad y con huella (`lib/cs/watchdog.ts:1044-1051`), y en una semana hizo 34 llamadas en el momento. Primero se mide por qué. La parte de las lecturas de reuniones va en el paso uno, antes de traer las 301, las 177 y la investigación de las 71; el vigía, en el paso 2.
23. **U23 · La caché donde ahorra:** quitar la que solo escribe, cachear la exploración de venta y el clasificador a Haiku después de compararlo.
24. [hecho, 25 oct, en producción] **U24 · Que un job que deja de correr avise** (Sentry Crons), por ahora a ti (24 oct). El token de Apify va aparte, con U15.

**HubSpot como partner (Client Partners)** (pedido del 24 oct; plan: `docs/integracion-hubspot-partners-plan.md`). Nexus ya copia los 168 registros que HubSpot comparte de tus clientes (147 de 163 de la cartera), con MRR, ediciones, asientos y renovaciones; lo que falta es usarlos:
25. [hecho, 25 oct, en producción] **U25 · La comisión de HubSpot sale de HubSpot,** antes del 15 de noviembre. Hoy se carga a mano (US$51.000 estimados para nov), y HubSpot da la comisión proyectada de cada cuenta (US$18.240, que parece mensual: se comprueba contra lo cobrado el 15 de agosto). La estimada del trimestre se arma sola, con el detalle por cuenta; la real sigue saliendo de la liquidación.
26. **U26 · La comisión en riesgo:** el aviso de que vence la relación gestionada dice cuánto se pierde al mes. Depende de U25.
27. [hecho, 24 oct, en producción] **U27 · Lo que ya paga cada cliente y los hubs que le faltan,** junto al TAM v1 (con R1 y R2): el MRR por hub; para las no gestionadas, lo vendido. Los hubs que faltan quedan como venta cruzada.
28. **U28 · Los tratos compartidos con su licencia:** el MRR de la licencia, los productos y el representante de HubSpot en la copia de tratos, y la comisión esperada (20 % por hasta 36 meses).
29. [hecho, 25 oct, en producción] **U29 · A columnas lo que está suelto en la copia** (lo vendido, las fechas de la relación, la comisión, el MRR por hub) y un historial de uso sin huecos (hoy 4 semanas de 16).
30. **U30 · El encargado de Nexus pasa al registro de Partner,** como pide HubSpot para el crédito gestionado. Pide el permiso `crm.objects.partner-clients.write`. Depende de U6.
31. **U31 · Probar Partner Services y la ruta nueva de la API** (`crm.objects.partner-services.read`); si no trae nada útil, se descarta.

**Criterio de éxito:** el de la tarjeta 3; por ítem, el de su plan (`docs/integracion-google-plan.md`, `docs/integracion-hubspot-plan.md`, `docs/integracion-hubspot-partners-plan.md` y `docs/integraciones-finanzas-ia-plan.md`, cada uno con su «Criterio de éxito»).

## Lo que falta, por tema

### Customer Success y el servicio recurrente

1. El primer ciclo de cada cliente recurrente con su CSE: pasó a la propuesta, M3.
2. Pasar los recurrentes de hoy uno por uno con su CSE: Continuidad, administración de sitio web y contenido.
3. Definir contigo la cadencia y las rutinas de cada servicio del catálogo.
4. Armar las propuestas recurrentes internas de FACO (Honda Costa Rica), kölbi, Cayalá y Grupo Inve con lo que ya se les vendió, sin tocar la que firmaron (el script ya corrió en simulacro). Va junto con C4 etapa 0, en el paso 4.
5. Volver a generar con «Rehacer desde cero» los handoffs que leyeron el texto de otra reunión: RC Inmobiliaria, AMC, DISTELSA, Grupo Printer, REMPRO y Teamnet.

### Preventa y diagnóstico (lo que quedó del 23 oct)

1. Que el diagnóstico lea por equipo del cliente, un equipo del cliente en las reuniones que no son de una exploración y que el chat avise si casi nada está confirmado: pasó a L5.
2. Cambiar la plantilla de un diagnóstico ya generado (hoy se elige solo al crearlo).

### Ventas y comisiones

1. Pagar las comisiones desde Nexus (el modelo con Marco se cerró el 21 oct; hoy es «Cómo funciona» y la simulación). Antes, que Cobranza sepa cuándo termina un servicio y si una renovación fue a tiempo.
2. Licencias y precio de cada caso de uso de la biblioteca.

### Finanzas

1. Prender el corte de cobranza (`COBRANZA_CRON_ENABLED`): sin él, Reportes y algunas alertas de cobranza son una foto del 24 jul.

### Marketing y Desarrollo

1. Que Desarrollo empiece a entrar a Nexus (0 de 3 en la última semana) y prenda las notas de Gemini en su sprint.
2. Marketing: el test de marketing con la escala nueva pasó a la propuesta, área O.
3. Desarrollo: un lugar para sus proyectos, con las estimaciones que se escriben en HubSpot.

### Lo que conecta a los equipos

1. El correo de la mañana con lo mismo que «Para ti», bien probado antes de mandarlo.

### Deuda que encontró la validación

1. Un tope de reintentos para el job de la lectura de los números de Rentabilidad.
2. La fecha de cancelación de Cicadex en HubSpot (29 ene 2029).
3. Las 176 reuniones que la IA asignó en 8 proyectos y Juan Carlos tiene por revisar.
4. «Ver como»: dos lecturas que escriben sin autor (`deal-line-items` y `hubspot/read`) y la cookie sin el prefijo `__Host-`.
5. Los desplegables de las tablas y las fichas (`CeldaSelect`, el selector de ícono y la lectura de la cuenta) todavía se dibujan dentro de su contenedor: pueden quedar tapados como le pasaba al menú del avatar.
6. El chat todavía no puede ocultar secciones del kickoff.
7. Una tarea del cronograma marcada «por validar» igual llega al cliente: el código solo le esconde la marca (lo encontró el diagnóstico del 22 oct). Pasó a la propuesta: D0.

Pasaron a otro lugar: unir los contenedores «Información del cliente» repetidos (a R4, como etapa previa); el filtro de 401 y 403 de la copia de proyectos de HubSpot y la base local nueva que no arranca (al paso cero del orden sugerido).

## Lo que configuras tú

**Para lo de la noche del 25 oct** (en el servidor salvo lo que dice otra cosa):
1. **HubSpot, los avisos:** en la app de HubSpot, la URL `https://nexus.smarteamcr.com/api/hubspot/webhooks` y las suscripciones de empresa, contacto, negocio y ticket (RUNBOOK › «Los avisos de HubSpot»). Revisar que `APP_URL` del servidor sea esa dirección.
2. **Que Nexus escriba en HubSpot lo que decide la persona:** `EMPRESA_HUBSPOT_ESCRITURA=1` (yo lo pruebo después con 5 empresas) y, tras revisar el simulacro, `EMPRESA_HUBSPOT_COPIA=1`.
3. **Los avisos de Meet al momento:** `GOOGLE_MEET_EVENTOS_ENABLED=1`.
4. ✓ No por ahora (decidiste dejar Speech-to-Text apagado, 24 oct). **El audio de las reuniones presenciales:** en Google Cloud, habilitar «Cloud Speech-to-Text», un bucket con CORS y dos roles para la cuenta de servicio (RUNBOOK); en el servidor, `REUNIONES_AUDIO=1` y `GOOGLE_SPEECH_BUCKET`.
5. **Sentry:** con `SENTRY_DSN`, una alerta de Crons para los monitores `nexus-*` (los jobs que dejan de correr).
6. **En Admin › Meet:** prender la toma de notas automática y «Transcribir» en las reuniones con clientes (lo que más texto gana).
7. **Los tests del diagnóstico:** aprobar las preguntas en Escala › Tests; en el servidor, `TESTS_HUBSPOT_PORTAL_ID`, `TESTS_HUBSPOT_FORM_GUID` y `TESTS_ENLACE_DE_AGENDA`, y cuando el test esté probado, `TESTS_HUBSPOT_ENABLED=1`. Después, el corte de la aplicación vieja (DECISIONS › área O, O6).
8. **La noche 2 (27 oct), en el servidor:** `EXPLORACIONES_ASOCIAR_ENABLED=1` (la unión automática de sesiones; el simulacro de hoy uniría 1 y preguntaría 6), `TAREAS_LECTURA_PERSONAL=egonzalez@smarteamcr.com` (tu piloto) y `TAREAS_SEGUIMIENTO_EN_HUBSPOT=1` (probar primero con una tarea de Smarteam).
9. **En Nexus:** que la líder de Customer Success llene el catálogo de HubSpot Academy (Éxito del cliente › HubSpot Academy; nace vacío) y revisar el texto de la tarjeta del acceso al portal en el kickoff.

**En el servidor, para prender el vigía** (pendiente, 24 oct): agregar `CS_WATCHDOG_ENABLED=1` al `.env` del servidor y desplegar. Prende el barrido diario del vigía (hasta 10 proyectos por día, gasta IA dentro del presupuesto automático), las señales de HubSpot y el triage cada minuto. Desde el 24 oct ya no hace que Partner cree empresas solas: eso pide `CS_PARTNER_CREA_CLIENTES=1`, que no se pone. Los comandos, en la conversación del 24 oct; se apaga sin deploy desde Éxito del cliente › Ajustes.

**En HubSpot:** ✓ hecho el 24 oct: la app tiene los permisos de correos, leads y transcripciones de llamadas, y la conexión del sistema ya los tiene.

**Pendiente, sin urgencia (te recomiendo hacerlo):** reconectar HubSpot desde producción hoy no funciona, porque la app de HubSpot solo tiene registrada la vuelta a `http://localhost:3004` (por eso se reconecta desde tu PC con `npm run dev:prod`). Para reconectar desde nexus.smarteamcr.com: agregar `https://nexus.smarteamcr.com/api/auth/callback` como dirección de vuelta en la app de HubSpot, y la misma en `HUBSPOT_REDIRECT_URI` del `.env` del VPS.

**Más adelante, en HubSpot (Client Partners):** para U30, declarar `crm.objects.partner-clients.write` como opcional en la app pública y reconectar; para U31, lo mismo con `crm.objects.partner-services.read`. Se pide cuando toque esa parte, no ahora.

**En Google Cloud y Admin, para la API de Meet:** ✓ hecho el 24 oct: las APIs habilitadas, el scope en la delegación de dominio, y el tema y la suscripción de Pub/Sub con sus permisos. Queda Speech-to-Text, cuando se elija el servicio para las reuniones presenciales («Lo que decides tú» 21).

**En el `.env` del VPS:**

- Si alguna carga para traer el contexto corriera por los jobs, subir `PRESUPUESTO_IA_AUTOMATICO_USD_DIA` mientras dure (hoy US$10 al día), para no dejar sin leer las reuniones de cada día.
- Confirmar que esté `SENTRY_DSN`, y crear en Sentry la alerta de Crons (U24).

**En Google Workspace** (el 28 % de las reuniones con clientes no deja texto; 239 en 90 días solo dejaron notas porque nadie activó «Transcribir»):

1. Gemini «Tomar notas» y «Transcribir la reunión» activados para toda la organización, Desarrollo incluido, y que arranquen solos.
2. Que las notas se compartan con todos los invitados de la organización.
3. En las reuniones que organiza un cliente, que alguien del equipo active las notas al entrar.

## Más adelante

Lo que dijiste en otros chats que querías más adelante:

- El centro de comando de dirección.
- Procesos y Planificación: que el chat cambie el mapa, la puesta en marcha y las plantillas de propiedades.
- La auditoría del portal con un cliente piloto, con lo que hay que comprobar a mano.
- La escala: la teoría en Documentación (la versión 9.0 pasó a la propuesta, N; el test y guardar sus resultados, a O).
- Cuestionarios con IA: que el cliente converse unos minutos con un chat que llena el formulario.
- Exportar un documento a Google Docs.
- Traer la facturación de Odoo de 2025 para comparar lo cobrado contra lo vendido.
- Que Nexus pueda escribir en Mercury para resolver inconsistencias.
- La hoja de ruta de Feedback a la vista del equipo.
- Los recorridos que faltan: Marketing, Sesiones, Documentación y Administración.
- Un portal de autoservicio para los clientes.
- Pruebas de punta a punta en el navegador.
- Decidir si se prende el vigía de Éxito del cliente, después de que Alex Vanegas revise la cartera.
- De la propuesta del 22 oct, para después: créditos de cara al cliente (con sus reglas de vencimiento y estados), el nivel de cada CSE por actividad y su pago anclado a la escala, el playbook de momentos del CSE (y que la IA revise si se cumple) y la formación del CSE como diseñador de sistemas.


## Pruebas para personas

Las que hace una persona en la pantalla: tú, o alguien del equipo con su usuario (la prueba dice quién). Solo lo que necesita una sesión abierta o criterio humano, por tema. Lo que la IA comprueba con los datos está en «Pruebas con IA»; lo que hace alguien del equipo con su usuario dice quién. Dime el número y cómo te fue, y lo marco. Para entrar como otra persona: Equipo › la persona › «Ver como» (solo para mirar).

- **↻ Validar otra vez**: lo corregí, o cambió después de que lo validaste.
- **Por validar**: te toca a ti. Solo lo que pide tu criterio de producto (desde el 20 oct).
- **⏳ La valida el equipo: <persona>**: la valida quien lo usa cada día, al usarlo; si algo falla, llega por Feedback.
- **⏳**: espera a alguien del equipo o a que pase algo (una reunión, un deploy). El motivo va en el estado.

Las áreas van por prioridad: **Alta** (lo usa el equipo cada día, toca plata o lo ve el cliente), **Media** y **Baja** (solo dirección).

### Para ti y la agenda <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 265 | ⏳ La valida el equipo: Caroline Bersot | Que los pendientes se cierren desde el panel | Con tu usuario › «Para ti» › en la agenda, una reunión con un cliente › «Pendiente»: «✓ Hecha» en uno, «Agendar» en otro y «Desestimar» en un tercero (escribe un motivo). | El primero desaparece y en Tareas queda hecho. «Agendar» cierra el panel y deja un bloque azul en tu agenda: «Cliente – nombre corto \| Espacio interno». El tercero pide «¿Por qué ya no va?» y queda «Ya no se hará». Si hay propuestas, al final dice «N tareas por decidir en Tareas». |
| 266 | ⏳ La valida el equipo: Caroline Bersot | Que «Ya la agendé» pida la reunión del calendario | Con tu usuario › «Para ti» › «Cuentas sin siguiente paso» › «Ya la agendé» en una cuenta con una reunión agendada (aunque sea en tres semanas). Busca la reunión por el título y elígela. Recarga. | Un buscador con tus reuniones de los próximos 30 días, las de esa cuenta primero. Al elegir: «Listo: la reunión el … es el siguiente paso de …» y la línea se va. Al recargar no vuelve. Con una reunión que no está en tu calendario no aparece en la lista. |
| 270 | ⏳ La valida el equipo: Caroline Bersot | Que el espacio libre nombre las tareas para una persona | «Para ti» › agenda › un «Espacio libre» › «Con qué usar este espacio»; después «Bloquear en Calendar». | Cada tarea dice «Cliente – nombre corto» (sin «T-…»). Calendar se abre con «Cliente – nombre corto \| Espacio interno». Una tarea interna lleva su espacio en vez del cliente. |
| 275 | Por validar | Que la agenda muestre solo el horario de trabajo | «Ver como» Caroline Bersot › «Para ti» › la agenda en «Semana»; abajo, «Ver el calendario completo». | La grilla va de 8:00 a 17:00, sin «Fuera de la oficina» de la tarde ni de la noche. El botón dice cuántos eventos quedaron fuera; al tocarlo se ve todo y cambia a «Ver solo de 8:00 a 17:00». |

### Tareas <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 20 | ⏳ La valida el equipo: Caroline Bersot | Que «Planifica tu semana» arme la semana por cuenta | «Ver como» Heiver Gomez › Tareas › «Planifica tu semana» (para mirar: con «Ver como» no se guarda nada). | «Lo que queda de esta semana: del 19 al 23 de octubre». Cada cuenta con «La acción de la semana» y «La reunión de la semana»; lo sugerido en azul con la chispa y «De dónde sale: …». (Usar, Agendar y «Ya lo guardé» los prueba Heiver con su usuario: guardar en Calendar invita al cliente de verdad.) |
| 21 | ⏳ La valida el equipo | Que un líder configure la reunión de su sprint | Tareas › «Semana del equipo» › «Equipo»: Marketing y después Desarrollo › «La reunión del sprint» › «Configurar». | Marketing: «Sprint planning de marketing · Los lunes · termina a las 10:30 · Planning», leída como Alejandra Ortega. Desarrollo: «SPRINT DEPT. SOFTWARE · Los lunes · termina a las 9:00 · Planning», leída como Alejandro Salas. Después de cada reunión, «Última: «…» · N propuestas»: como mucho 5 por persona, con chip «Sprint interno». |
| 22 | ⏳ La valida el equipo: Caroline Bersot | Que cada reunión tenga su página y su correo de seguimiento | Sesiones › «Capacitación semana 3: Propiedades y estructura de información \| Total Finco» (jue 15 oct) › «Armar el correo». Ábrela en otra pestaña; cambia el texto en una y haz clic afuera, y después en la otra. | «Agenda» con el texto de la invitación, «Tareas de esta reunión» con Juan Carlos Armijos como responsable, el correo editable con «Copiar el correo» y «Abrir en tu correo» (no se envía), y «Próxima reunión» con «Agendar en Google Calendar ↗», «Ya la agendé» y «No hace falta». La otra pestaña avisa «El correo cambió: recarga la página para ver el de ahora.» |
| 111 | ⏳ La valida el equipo: Caroline Bersot | Que lo que prometió el cliente sea un solo seguimiento | Con «Ver como» Caroline Bersot, Tareas › Mis tareas (y en «Para ti», «Tomarlo o decidir» de un compromiso de una reunión). | De Honda Costa Rica: «Seguimiento con Honda Costa Rica: N cosas que prometió Randall (lun 12 oct)», con «Lo que falta:» y un punto por cosa en el cajón, en vez de una tarea por recordatorio. «Tomarlo o decidir» lleva a la página de esa reunión, no a Mis tareas. |
| 112 | ⏳ La valida el equipo: Caroline Bersot | Que una tarea interna se pueda llevar al calendario | Tareas › Mis tareas › semana actual › una tarea tuya sin agendar › «Agendar». Después abre una tarea en «Más adelante». | «Agendar» abre el diálogo para ponerla en tu calendario como bloque privado, sin invitados. En «Más adelante», el cajón dice «Para agendarla en tu calendario, ponla en una semana.» |
| 135 | ⏳ La valida el equipo: Alexander Vanegas | Que «Por asignar» no llene las tareas de cada CSE | «Ver como» Caroline Bersot › Tareas › «Mis tareas», sección «Por asignar · Customer Success». | Llega plegada con «21». Al abrirla, los recordatorios van en «Rápidas y seguimientos», agrupados por cuenta. |
| 136 | ⏳ La valida el equipo: Alexander Vanegas | Que quien lidera vea «Por asignar» abierto | «Ver como» Alex Vanegas › Tareas › «Mis tareas». | «Por asignar · Customer Success» llega abierta. |
| 137 | ⏳ La valida el equipo: Andrés Pinzón | Que Nexus sugiera cerrar lo viejo, sin cerrar solo | Andrés Pinzón con su usuario: arriba de «Mis tareas», «Nexus sugiere cerrar 3 tareas que ya pasaron y nadie tocó» › «Revisar»; desmarca T-38 y «Cerrar las 2». | Aparecen T-2, T-38 y T-106, cada una con «Era para el…». Las dos marcadas dejan de verse y T-38 sigue. |
| 138 | ⏳ La valida el equipo: Caroline Bersot | Que el panel de una tarea diga si guardó | Una tarea tuya › cambia «Qué hay que hacer» y espera un segundo; cierra y vuelve a abrir. | Al pie: «Sin guardar…», «Guardando…» y «Guardado». El texto quedó. |
| 139 | ⏳ La valida el equipo: Caroline Bersot | Que una nota no se pierda al cerrar rápido | «Para ti» › una tarea tuya › escribe en «Notas» y cierra el cajón enseguida; vuelve a abrirla. | La nota quedó guardada. |
| 155 | ⏳ La valida el equipo: Lidia Flores | Que Lidia recupere lo que el tope dejó afuera | Lidia Flores con su usuario › Tareas › «Mis tareas», arriba de lo que espera tu decisión. | «De «Sprint planning de marketing» · lun 19 oct: 1 tarea tuya quedó sin proponer…» con «Revisar Nexus» y «Proponérmela». |
| 156 | ⏳ La valida el equipo: Alejandra Ortega | Que Alejandra recupere sus 4 | Alejandra Ortega con su usuario › el mismo lugar › «Proponérmelas». | Las 4 (Elaborar Reportes SAP · Montar Google Search · Entregar Casos Éxito · Enviar Copies Videos). Al tocar: «Te llegaron 4 propuestas más. Decide tú.» y aparecen en lo que espera su decisión, bajo la reunión. |
| 160 | ⏳ La valida el equipo: Caroline Bersot | Que marcar una tarea como hecha sea al instante | Tu usuario › Tareas › «Mis tareas» › «Esta semana» › toca el círculo de una tarea. | Se marca en el acto, sin esperar. |
| 161 | ⏳ La valida el equipo: Caroline Bersot | Que deshacer no diga que otra persona la cambió | La misma tarea: toca el círculo otra vez enseguida, varias veces rápido. También en «Hechas (2 semanas)» y en «Para ti» › «Tus tareas de hoy». | Se marca y se desmarca en el acto y nunca sale «Otra persona cambió esta tarea…». Con una tarea de HubSpot, en HubSpot queda el último estado que marcaste. |
| 163 | ⏳ La valida el equipo: Caroline Bersot | Que el estado del cajón cambie al instante | Abre una tarea (el cajón) › «Estado»: «Hecha» y enseguida «Pendiente». | El botón cambia al instante y queda en «Pendiente», sin el aviso. Al pie, «Guardado». |
| 268 | ⏳ La valida el equipo: Caroline Bersot | Que las propuestas se decidan por reunión en Tareas | Con tu usuario › Tareas › «Por decidir», en un grupo con dos o más propuestas, «Usar las N». | Cada grupo dice «De «reunión» · fecha · cliente», sin «Decidir en la reunión». «Usar las N» las deja en tu semana y dice «Quedaron N en tu semana». |
| 269 | ⏳ La valida el equipo: Caroline Bersot | Que la página de una sesión quede para leer | Una sesión con tareas propuestas › «Lo que dejó esta reunión». | «Tus tareas propuestas» se ven como texto, con «Decidir en Tareas». La minuta, los pedidos y la ficha se siguen decidiendo ahí; «Usar todo» ya no habla de tus tareas. |
| 273 | Por validar | Que una propuesta de tarea se decida fácil | Con «Ver como» Caroline Bersot › Tareas › «Por decidir» › abre una propuesta (por ejemplo, la de los informes de activaciones de Honda). | Arriba, «Honda Costa Rica – Configurar…» (no «T-9») y «T-9 · Nexus te la propone». Una caja azul con qué propone Nexus, debajo «Para · Vence · Cliente» y de qué reunión salió. Abajo, en el pie, «Descartar», «Más adelante» y «Usar». «Cambiar otros detalles» abre el formulario entero. |

### Preventa y exploración <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 104 | ⏳ La valida el equipo: Liliana Moreno | Que se pueda regenerar una sola pregunta | Distribuidora Larce › Exploración › sesión 2 › Preparación › «La guía»: en una pregunta, ⋯ › «Regenerar». Después, en una pregunta «Del asistente», ⋯ › «Regenerar». | La pregunta cambia por otra del mismo tema, marcada «Regenerada»; la «Del asistente» regenerada pasa a «Regenerada» (antes seguía diciendo «Del asistente»). «Volver a la de la guía» aparece solo en una pregunta de la guía. Una tuya editada por ti sigue diciendo «Tuya». |
| 113 | ⏳ La valida el equipo: Liliana Moreno | Que el asistente ofrezca pedidos al abrirse | Larce › Preparación › «La guía» › «Mejorar con el asistente». | Arriba del campo, de 3 a 4 pedidos en botones armados con la guía real (la pregunta con menos repreguntas, las dimensiones sin preguntar, lo primero que falta para proponer). Un clic llena el campo; lo mandas tú. |
| 114 | ⏳ La valida el equipo: Liliana Moreno | Que el chat numere como la pantalla y respete el tope | Larce › «La guía», vista «En orden» › «Mejorar con el asistente». Pide «Quita la última pregunta». Después «Agrega tres preguntas sobre cómo miden el pipeline». | «Quitar la N» apunta a la misma pregunta que ves última (la del presupuesto). Con las tres: la lista trae solo las que entran y dice que la guía llega a 8 preguntas sumadas (tuyas o del asistente); al aplicar entran sin avisos. |
| 172 | Por validar | Que la guía nueva del proyecto sea corta | Botón «Actualizar la guía». | Unas 5 preguntas de estrategia y escala, cada una con su ⓘ, más de 3 a 5 de lo vendido. El aviso ámbar desaparece. |
| 175 | ⏳ La valida el equipo: Liliana Moreno | Que regenerar, agregar y el asistente funcionen en el proyecto | Cemaco, después de actualizar: ⋯ › «Regenerar»; «+ Agregar pregunta» y otra vez «Actualizar la guía»; «Mejorar con el asistente». | La pregunta cambia y dice «Regenerada»; la tuya dice «Tuya» y sigue después de actualizar; el chat de Cemaco abre con la guía y de 3 a 4 pedidos en botones. |
| 178 | ⏳ La valida el equipo: Liliana Moreno | Que «Lo que cubre la guía» sume lo vendido | Cemaco, «Lo que cubre la guía». | Retos, Resultados que persigue y Obstáculos, y debajo «Piezas de lo vendido que pregunta:» con sus temas. |
| 247 | ⏳ La valida el equipo: Liliana Moreno | Que cambiar el objetivo proponga preguntas | Cemaco Internacional - CRM › Exploración › próxima sesión › Preparación › «Objetivo de la sesión» › «Editar»: «Enfocar la sesión en marketing y en lo que pidió Marco: volúmenes de leads y tasa de conversión» › «Guardar». | «Nexus está pensando preguntas para este objetivo» y después «Nexus propone 3 preguntas para este objetivo», en azul con la chispa, sobre leads, conversión y volumen. |
| 248 | ⏳ La valida el equipo: Liliana Moreno | Que las preguntas del objetivo se usen o se descarten | En ese bloque azul, «Usar» en una y «Descartar» en otra; después «Pedir otras». | La usada entra a «La guía» con la marca «Por el objetivo»; la descartada no vuelve. |
| 249 | ⏳ La valida el equipo: Liliana Moreno | Que la guía se refresque sola con el asistente | La misma sesión › «Mejorar con el asistente» › «quita las preguntas de ventas» › aplica la lista. | La guía cambia en pantalla, sin recargar. |
| 250 | ⏳ La valida el equipo: Liliana Moreno | Que las preguntas se arrastren | «La guía» › «En orden»: arrastra una pregunta por los puntitos de la izquierda; repite con el teclado (Tab hasta el asa, Espacio, flechas, Espacio). Después abre «En vivo» y toca «Actualizar la guía». | La pregunta queda donde la soltaste y arriba dice «Van en el orden que elegiste» con «Volver al orden de la guía». «En vivo» muestra el mismo orden y actualizar la guía lo mantiene (lo nuevo va al final). |
| 251 | ⏳ La valida el equipo: Andrés Pinzón | Lo mismo en la preventa | Distribuidora Larce › Exploración › próxima sesión: repite la 247, la 249 y la 250. | Lo mismo que en Cemaco. |
| 257 | ⏳ La valida el equipo: Liliana Moreno | Que el asistente de la guía use todas las sesiones | Cemaco Internacional - CRM › Exploración › guía de la sesión 5 › «Mejorar con el asistente» › «¿Qué otras preguntas agregarías para la próxima sesión?». | Preguntas sobre cuántos contactos o leads llegan por canal al mes y cuántos se vuelven clientes; ninguna sobre quién coordina con las agencias. |
| 258 | ⏳ La valida el equipo: Liliana Moreno | Que no repita lo que ya se habló | El mismo chat › «Agrega más preguntas sobre las 5 agencias». | Preguntas nuevas (qué quieren hacer ellos mismos, mensajes que se contradicen entre agencias), no la de cuántas personas coordinan con ellas. |
| 259 | ⏳ La valida el equipo: Liliana Moreno | Que «Actualizar la guía» retome lo acordado | La misma guía › «Actualizar la guía». | El objetivo de la sesión habla de las volumetrías de cada canal y la apertura retoma lo acordado el 19 oct. |
| 260 | ⏳ La valida el equipo: Andrés Pinzón | Lo mismo en la preventa | Preventa de Tecnosagot › guía de la próxima sesión › «Mejorar con el asistente» › «¿Qué otras preguntas agregarías para la próxima sesión?». | Retoma la meta de ventas que quedó sin preguntar y no vuelve a preguntar quién da el visto bueno. |
| 283 | Por validar | Que cada sesión tenga su equipo del cliente | Preventa de CEMACO › Exploración › la sesión del 20 oct › debajo de la fecha, «Equipo del cliente» › Marketing. | Un aviso de que la guía es la de Marketing y que Marketing quedó en las áreas en juego; arriba ofrece «Actualizar la guía». |
| 284 | Por validar | Que la guía de un equipo pregunte lo que pregunta Marco | Esa sesión › Preparación › «La guía», después de «Actualizar la guía». | Unas 5 preguntas de marketing: cómo está armado, cómo lo miden, un canal de punta a punta, herramientas y datos, qué canal duele. Sin quién firma ni presupuesto. |
| 285 | Por validar | Que la sesión quepa en una hora y deje tiempo para contarle | La misma guía, abajo. | Los tramos suman 60 minutos, con «Contarle (40 – 50 min)» antes de «Cerrar». |
| 286 | Por validar | Que el panel de la derecha diga la verdad | Preventa de Cicadex › panel de la derecha. | «Tiempos» y «Quién decide» en ámbar, con el motivo al pasar el mouse; «Para proponer» en 1 de 7, y un bloque «Por equipo» con lo que falta preguntarle a cada equipo. |

### Diagnóstico <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 287 | Por validar | Que el diagnóstico avise cuando casi nada está confirmado | CEMACO › «Cemaco Internacional - CRM» › activar «Diagnóstico». | Un aviso «Casi nada de lo que lee el diagnóstico está confirmado», con la ficha, los resultados y los procesos y dónde revisar cada uno. Al generar, pide confirmación («Generar igual» o «Revisar antes»). |
| 288 | Por validar | Que se elija entre dos plantillas | El mismo lugar, debajo del aviso. | Dos tarjetas, «Diagnóstico esencial» (recomendada, 7 partes) y «Diagnóstico completo», cada una con su lista de secciones. |
| 289 | Por validar | Que el diagnóstico esencial explique simple el porqué y el qué haremos | Generar con la esencial y leerlo entero. | 7 partes: portada, objetivos, problema, desafío, «Enfoque de la solución», acciones y siguiente paso; lee las 5 sesiones de la exploración. |
| 290 | Por validar | Que el «Enfoque de la solución» se lea claro | Esa sección. | La frase del enfoque pegada al título y los principios numerados; arriba a la derecha, «Marcar como revisado», que el cliente no ve. |

### La cuenta: encargado, proyectos y ficha <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 13 | ⏳ La valida el equipo: Caroline Bersot | Que el riel separe herramientas y entregables | Clientes › «Teamnet» › en la columna de la izquierda, el proyecto «Teamnet - Reimplementación CRM». Después «kölbi» › «Kolbi \| Marketing y ventas» (es SmartLoop). | Teamnet: «HERRAMIENTAS DEL PROYECTO» (Resumen, Cronograma, Cuestionarios, Exploración, Ejecución) y debajo «ENTREGABLES» (Kickoff, Diagnóstico, Planificación, Integraciones), y «Ver 1 pieza más +» con la Entrega. kölbi: Resumen y Cronograma sin rótulo, y el grupo «CICLO · <etapa>» con sus piezas; sin Kickoff. |
| 14 | ⏳ La valida el equipo: Caroline Bersot | Que generar un Diagnóstico y un Kickoff siga igual | Clientes › «Spectrum» › proyecto «Spectrum - MKT + SALES» (tiene handoff y no tiene diagnóstico). En el riel, «Ver N piezas más +» › Diagnóstico › «Activar» › «Generar diagnóstico»; espera. Después Kickoff › «Generar kickoff». | El diagnóstico con sus secciones (Diagnóstico, Situación actual, Objetivos, Desafío principal… hasta «El siguiente paso»). El kickoff llena Bienvenida, Objetivos, Alcance, Métricas, Próximos pasos…; «El equipo del proyecto», «Sesiones y horarios», «Canales de atención» y «Cierre» quedan con lo que ya tenían. |
| 15 | ⏳ La valida el equipo: Caroline Bersot | Que la cuenta muestre sus reuniones y sus tareas por equipo | Clientes › «Honda Costa Rica» › La cuenta › Tareas. | Arriba, «Próximas reuniones · próximos 8 días» (o «Nada agendado… Se miró el calendario de …»). Debajo, el total de abiertas y por decidir; primero «Customer Success» (las de Caroline, con «Reunión con el cliente»), después «Ventas» (T-72 de Andrés, con chip HubSpot) y al final las hechas, plegadas. Nada «Solo para mí» de otra persona. |
| 16 | ⏳ La valida el equipo: Caroline Bersot | Que el chip diga cómo está la cuenta, sin plata para el CSE | «Ver como» Alexander Vanegas › Clientes › «BLUESAT» › toca el chip «Señales de riesgo · 3» de la cabecera. Repite con «Ver como» Heiver Gomez. | Alexander: 3 motivos (el atraso por Smarteam, «8 facturas vencidas ($3,800)…» y las licencias sin asignar) y «Ver la cuenta en Éxito del cliente →». Heiver: «Señales de riesgo · 2», los mismos sin el de facturas y sin ese enlace. |
| 116 | ⏳ La valida el equipo: Alexander Vanegas | Que el CSE encargado se cambie y quede | Éxito del cliente › Cartera › fila de Librería Internacional › «CSE encargado»: elige otra persona y después vuelve a Caroline. | Las dos veces la celda queda con la persona elegida, sin volver al nombre anterior. |
| 117 | ⏳ La valida el equipo: Alex Vanegas | Que Alex cambie el encargado desde su cartera | Alex Vanegas con su usuario: «Para ti» › «La cartera» › una cuenta con proyecto de implementación › en la línea «CSE:», elige a otra persona (y después devuélvela). | Hay un desplegable. A la persona nueva le llega en «Para ti» «Quedaste como encargado de…», y a la anterior, «… pasó a …». |
| 118 | ⏳ La valida el equipo: Alexander Vanegas | Que un CSE no pueda cambiar el encargado | «Ver como» Caroline Bersot › «Para ti» › «Tu cartera». | La línea «CSE:» se ve como texto, sin desplegable. |
| 204 | ⏳ La valida el equipo: Alexander Vanegas | Que lo que eliges gane | Liliana: toca «CEMACO» en esa línea y recarga. | Se queda en «CEMACO». |
| 205 | ⏳ La valida el equipo: Caroline Bersot | Que «Preparar» lleve al proyecto propio | «Ver como» Liliana › agenda › una reunión con Cemaco › «Preparar» › enlace a la ficha. | Llega a «Cemaco Internacional - CRM». |
| 207 | ⏳ La valida el equipo: Alexander Vanegas | Que el CSE encargado quede al cambiarlo | En esa celda, elige otra persona de CS; cierra el desplegable y recarga. Después devuélvela a Caroline. | Queda la persona elegida, también después de recargar. |
| 210 | ⏳ La valida el equipo: Alexander Vanegas | Que el pase mueva lo abierto | Tras pasar una cuenta con tareas de seguimiento: Tareas › esa tarea › historia; «Para ti» de quien la recibe. | «Cambió de manos: pasó de X a Y por el pase de cuenta», la tarea en la semana de la persona nueva y el aviso «Quedaste como encargado…» con «Te pasaron N tareas abiertas…». |
| 213 | ⏳ La valida el equipo: quien cambie el CSE en HubSpot | Que un cambio hecho en HubSpot también pase todo | Cambia el «CSE Encargado» directo en HubSpot y abre la ficha en Nexus. | A la persona nueva le llega «Quedaste como encargado de … Cambió en HubSpot», y sus tareas se movieron. |

### SmartLoop y el servicio recurrente <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 28 | ⏳ La valida el equipo: Alexander Vanegas | Que el cronograma del ciclo pida confirmar el arranque | Honda Costa Rica › «FACO · SmartLoop (prueba)». 1) Resumen › tarjeta de la etapa › «Editar el ciclo»: «Desde», «Hasta» y «Meta del ciclo» › «Guardar». 2) La cuenta › Casos de uso › «Sumar un caso de uso»: título, «Criterio de aceptación» y «Dónde va: Al ciclo 1 de «FACO · SmartLoop (prueba)»» › «Sumar». 3) En el proyecto › Cronograma › «Armar la fase» › «Sí, arranca ese día». 4) En el caso, «+ Dependencia del cliente» › «Sumar». 5) «Aprobar esta versión». | El diálogo «Fecha de arranque del cronograma» dice «El cronograma arranca el [Desde]. ¿Lo confirmas?». Arriba del Gantt, «Cronograma del ciclo 1» con el caso, sus semanas y «Depende del cliente: …». Al aprobar: «Quedó como la versión aprobada.» y «Versión aprobada v1 · [fecha] · [tu correo]». |
| 29 | ⏳ La valida el equipo: Alexander Vanegas | Que cerrar el ciclo saque lo que no se cumplió | Después de la 28, abre el mismo proyecto en dos pestañas, las dos en Aprendizaje. En la A: en el caso, «Qué se decide: No se cumplió» y «Lo medido»; en la meta, «¿Se cumplió?» y «Cómo se evaluó»; después «La propuesta del siguiente ciclo». «Cerrar el ciclo 1» › «Cerrar el ciclo». En la B, sin recargar, cambia «Cómo se evaluó» y haz clic afuera. | En A: «El ciclo 1 quedó cerrado.» y «Ciclos anteriores» con el ciclo 1 y el caso «· No se cumplió». En el Cronograma, la dependencia de ese caso queda suspendida y sale de «Lo que debe el cliente». En B: «Este ciclo ya se cerró: recarga la página.» Cierra el ciclo 1 del proyecto de prueba. |
| 31 | ⏳ La valida el equipo: Alexander Vanegas | Que el cliente vea la ruta del servicio, sin datos internos | Honda Costa Rica › «FACO · SmartLoop (prueba)» › Resumen › «Ruta del servicio para el cliente». Después, en kölbi › «Kolbi \| Sales Hub» (SmartLoop real, con acceso), «Subir al cliente» y abre el link de «Ruta del servicio» con la contraseña. | En el de prueba dice que un proyecto de prueba no se comparte con el cliente (ya no manda a «Acceso»). En kölbi: «Compartida desde el …» y «Volver a subir»; el cliente ve cada ciclo con sus fechas, su meta y los casos como barras, sin notas ni montos. |
| 57 | ⏳ La valida el equipo: Andrés Pinzón | Que una propuesta sea proyecto o servicio recurrente | Ventas › Propuestas › «Nueva propuesta» › «1 · Empresa»: hondafaco.com › «2 · Qué se cotiza»: «Un servicio recurrente» › «SmartLoop» › «3 · Trato y nombre»: «SmartLoop — Honda Costa Rica (prueba)» › «Crear la propuesta» › «Generar la propuesta». | «Cómo opera el servicio», «Cómo trabajamos» (las 5 etapas en un círculo) y «Nivel de servicio» vienen llenas desde el catálogo. «Inversión mensual» queda vacía: la llena Ventas. Al terminar, borra la propuesta. |
| 58 | ⏳ La valida el equipo: Andrés Pinzón | Que un proyecto pase a recurrente desde la ficha | 1) Selvatura › «SB Hotels \| CRM» › Resumen › tarjeta de la etapa › «Pasar a recurrente» › «SmartLoop», lee la propuesta y «Cancelar» (confirmar escribe en el proyecto real). 2) Honda Costa Rica › «PLAN DE CONTINUIDAD \| HONDA FACO» › Resumen. | 1) «Pasar a servicio recurrente» con «¿En qué etapa del ciclo arranca?» y «Nexus propone …», y la tarea de HubSpot que quedaría («Mover «SB Hotels \| CRM» en HubSpot a SmartLoop · …»). 2) La tarjeta «Servicio recurrente · SmartLoop» con «Qué toca ahora:», «Agendar en Calendar ↗», «Ya la agendé» y «Crear las N de los próximos dos meses». |
| 59 | ⏳ Espera la 57 | Que una propuesta recurrente ganada dé de alta el servicio | Con la propuesta de la 57: «Subir al cliente», abrir su link y «Aprobar propuesta». En la cabecera de la propuesta, «Dar de alta el servicio». No toques «Crear el proyecto» (lo crea en HubSpot). | Se abre «Nuevo proyecto» con hondafaco.com ya buscado y, en «Siguiente», el tipo «SmartLoop» marcado. Los casos de uso de la propuesta quedan en el plan al crear el proyecto. |

### Propuestas <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 24 | ⏳ La valida el equipo: Andrés Pinzón | Que la propuesta traiga los casos de uso | Propuestas › «Nueva propuesta» › dominio credit-force.com › «Buscar la empresa», deja «Usarla como contexto», «Un proyecto» › «Implementación de HubSpot», nombre «CreditForce · prueba (borrar)» › «Crear la propuesta» › «Generar la propuesta». Repite con cemaco.co.cr. | En «2 · Propuesta», «Casos de uso incluidos», sin precio. CreditForce: «Sistematiza tu proceso comercial con HubSpot», «Alinea Marketing y Ventas…» y «Estandariza y controla tus cotizaciones comerciales». Cemaco: «Sistematiza…», «Reactiva tu inversión en HubSpot» y «Migra a HubSpot sin perder datos ni continuidad». Borra la de Cemaco; la de CreditForce sirve para la 27, 62, 63 y 95. |
| 27 | ⏳ La valida el equipo: Andrés Pinzón | Que lo publicado no cambie y el PDF lleve el IVA | (1) «RSM Costa Rica - Soporte Hubspot Continuo» › «2 · Propuesta» › Inversión, sin editar. (2) «Universidad Monterrey - Hubspot Refresh» › «3 · Compartir» › «Copiar el link», ábrelo, y «Descargar PDF». (3) El link y el PDF de «CreditForce · prueba (borrar)» después de la 95. | (1) El selector «IVA» con «⚠ No sabemos si el cliente es de Costa Rica…». (2) Sin IVA, igual que antes. (3) «Montos sin IVA (+ 13%)»; «Pago único + IVA» $8,500 · IVA $1,105 · total $9,605; «Por mes + IVA» $1,000 · IVA $130 · total $1,130, igual en el link y en el PDF. |
| 62 | ⏳ La valida el equipo: Andrés Pinzón | Que los módulos se agreguen con un clic | En «CreditForce · prueba (borrar)», al pie: «+ Agregar una sección propia», en «Qué clase de sección» «Casos de uso por proyecto» › «Agregar»; igual con «Comparación de licencias» y «Fases u opciones». En casos, «+ Proyecto» dos veces y «Desde el catálogo de casos»; en licencias, «Agregar plan» dos veces, «Recomendar» en uno y «Agregar fila»; en fases, «Agregar fase» dos veces y «Opciones (elegir una)». «Descargar PDF». | Pestañas 01 y 02 con sus casos; la tabla con «Recomendado» sobre el plan elegido; tarjetas 01, 02 que pasan a A, B. En el PDF, los dos proyectos uno debajo del otro, sin pestañas, y la tabla entera. |
| 63 | ⏳ La valida el equipo: Andrés Pinzón | Que un módulo hecho a mano se reuse en otra propuesta | En «El Molino Aditivos - CRM + Marketing», sobre «Arquitectura del sistema»: «⧉ Guardar como módulo» › «Guardar». En «CreditForce · prueba (borrar)»: «⧉ Agregar módulo de la biblioteca» › «Agregar» y «✨ Adaptar a esta empresa». Al final, «Archivar» en la biblioteca, «3 · Compartir» › «Revocar el link» y borra la propuesta de prueba. | Al guardar: «Este módulo trae datos de esta empresa», «Nombra a «molino».» y «Guardar igual». En la biblioteca, el aviso de que nombra a «molino». «Adaptar» muestra cada texto tachado y el nuevo, y «Aplicar N» cambia solo los textos; el diseño queda igual. |

### Comisiones <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 278 | Por validar | Que la página de comisiones diga lo cerrado con Marco | Finanzas › Modelos › Comisiones › «Cómo funciona» y «Simulación». | Arriba, «Modelo en prueba…». En el bono de liderazgo, «¿Por qué se calculan distinto?» y los ejemplos 133, 0, 500 y 750. «Pendientes» con dos preguntas y «Lo que no cuadra» con la oferta de Liz. En «Simulación», la tabla «Techos» (solo tú). |
| 95 | Por validar | Que la aprobación quede y el cliente no la vea | En «CreditForce · prueba (borrar)» (la de la 24) › «2 · Propuesta» › Inversión: «Montos en» USD; en Servicios, «precio de lista» 10000 y «dcto» 15%; en Licencias, «Agregar línea» «Sales Hub Professional» 1000; IVA «+ IVA (13%)». Espera a que se guarde y toca «Aprobar el descuento». Después «Descargar PDF», «Subir al cliente» y «3 · Compartir» › «Copiar el link», y ábrelo. | «Descuento aprobado.» y la franja dice «…lo aprobó Elías González el 19/10/2026, hasta el 15 %.» En el link y en el PDF no está la franja ni el botón; la línea sí muestra «−15%», $10,000 tachado y $8,500. |

### Finanzas <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 279 | ⏳ La valida el equipo: María José Zamora | Que una comisión de partner acepte cero y diga si es estimada o real | Finanzas › Comisiones de partner › Atom: monto 0. Después, Coby (kölbi): registra su factura con el monto real. | Atom queda en cero, sin error. Coby pasa de «Estimado» a «Real de la factura», con el número de la factura. |
| 280 | ⏳ La valida el equipo: Alex Arrieta | Que «Actualizar» traiga lo conciliado y lo cobre | Concilia una factura en Odoo; en Nexus, Conciliación › «Actualizar». | Dice cuántas facturas cambiaron y la cuota pagada queda cobrada en el momento. Sin tocar nada, lo pagado se cobra cada hora de 7:00 a 19:00. |
| 32 | ⏳ La valida Admin | Que solo se cobre lo pagado que confirmas | Finanzas › Conciliación › «Lo pagado». Desmarca una cuota y confirma con tu firma. | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Las de Mercury sin entrada de plata van a «Pagadas sin el día del pago» y no se cobran. Solo se cobran las marcadas. |
| 33 | ⏳ La valida Admin | Que los montos de las licencias se lean bien | Finanzas › Punto de equilibrio › «Licencias revendidas» › en la fila de kölbi, «Editar». Escribe solo «Lo que se le paga» y «Guardar». | Guarda: la moneda es la del contrato y la frecuencia «Cada mes», a la vista y solo si hay monto. Cada contrato tiene «Editar» en su fila. (Arreglado el 19 oct: antes «Guardar» quedaba apagado.) |
| 35 | ⏳ La valida Admin | Que Mercury esté en la facturación por cliente | Finanzas › Conciliación › enlace «Odoo» (al lado de su copia) › «Facturación por cliente». Busca un cliente, filtra «Facturado por: Mercury» y toca la columna «Facturas» › «Ver». | Los clientes de Mercury junto a los de Odoo; la columna «Facturas» abre sus facturas y «Ver» el detalle de cada una. (Arreglado el 19 oct: estaba escondido detrás de un triángulo.) |
| 36 | ⏳ La valida el equipo: Admin | Que las facturas de Odoo se peguen solas | Finanzas › Conciliación › «Lo pagado». | Las cuotas que ya estaban cobradas sin número (Corrugando FAC/2026/0221, Grupo Servica 0268) dicen «Ya cobrada» y, al confirmarlas, reciben el número de su factura pagada sin volver a cobrarse. Transportes Juanva 0197 y 0230 siguen como choque: Odoo las da sin pagar. (Medido: 13 cuotas, 4 de Odoo y 9 de Mercury.) |

### Éxito del cliente <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 41 | ⏳ La valida el equipo: Alexander Vanegas | Que la lista de limpieza de HubSpot diga quién arregla qué | Éxito del cliente › «Limpieza de HubSpot», arriba a la derecha. | Unas 27 cosas, con chips «Encargado que ya no está», «Sin encargado», «Servicio sin proyecto» y «Excliente con algo activo». Por persona: Alexander Vanegas (lidera el sprint) con la mayoría, cada una con «Abrir en HubSpot ↗» o «Abrir la cuenta», y Heiver Gomez con Wherex. («Etapa quieta» y «Sin actividad» todavía no aparecen: esos datos llegan con el deploy.) |
| 142 | ⏳ La valida el equipo: Alex Vanegas | Que lo decidido salga al instante | Alex con su usuario: en esa lista, «Descartar» en una fila; vuelve a «Para ti». | La fila desaparece con «Descartada: … sigue «En fricción»». En «Para ti» dice 8 proyectos. |
| 143 | ⏳ La valida el equipo: Alexander Vanegas | Que la ficha no mezcle salud y estado de HubSpot | Éxito del cliente › Areyá › pestaña «Proyectos». | «Salud: de «En fricción» a «En riesgo» · lo propone el vigía · Decidir», «Estado en HubSpot: A tiempo» y aparte el aviso de «Atraso por cliente» con «Pasar el estado a «Retrasado» en HubSpot». |
| 217 | ⏳ La valida el equipo: Alexander Vanegas | Que «Agendar» lleve a la agenda | Esa página › una cuenta «Sin sesión agendada» › «Agendar». | «Para ti» con el borrador del evento abierto, con la gente de la última reunión. |
| 220 | ⏳ La valida el equipo: Alexander Vanegas | Que cada tema diga de dónde sale | Esa página › BLUESAT. | Cuatro temas de la reunión del 16 oct, cada uno con su enlace y el día. |
| 221 | ⏳ La valida el equipo: Alexander Vanegas | Que los filtros funcionen | Botones «Sin sesión agendada» y «Sin siguiente paso». | Filtran, con el número de cada uno. |

### El chat de Nexus <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 17 | ⏳ La valida el equipo: Caroline Bersot | Que el chat trabaje solo sobre esa cuenta y no ofrezca lo que no se puede | Clientes › Ferretería Noelito › botón «Nexus». 1) «¿Qué está pendiente con esta cuenta?». 2) «Por WhatsApp me dijeron que mandan la base mañana»: desmarca la nota y el siguiente paso (escriben en HubSpot) y toca «Aplicar…» dos veces seguidas. 3) «Genera el diagnóstico de Ferretería Noelito \| Implementación CRM + Conexión SAP»: mira la línea y desmárcala, no la apliques. 4) «Genera el kickoff de Add-on desarrollo de misceláneos SAP». | 1) Solo habla de Noelito. 2) El botón se apaga mientras aplica y dice «Listo: 1 tarea creada.»; la tarea aparece una sola vez en La cuenta › Tareas, con «Chat de Nexus», vence mañana y la hace el cliente. 3) La línea dice «Generar Diagnóstico de «…» con la plantilla «Diagnóstico estratégico» — se arma en unos minutos…». 4) No entra a la lista y dice «⚠ No quedó en la lista: Este proyecto no tiene handoff generado: el kickoff sale del handoff.» |
| 18 | ⏳ La valida el equipo: Caroline Bersot | Que «Sugerencias» diga qué hacer, con el mensaje listo | Después de la 17: en la ficha de Ferretería Noelito, toca «Sugerencias». | «Lo que Nexus te sugiere en Ferretería Noelito», con hasta 5 cosas. La de la 17 sale como «Recuérdale al cliente: …», con el mensaje de WhatsApp a la vista, «Copiar mensaje» y «Abrir WhatsApp». Las otras traen «Pedírselo a Nexus», sin mensaje. |
| 75 | ⏳ La valida el equipo: Caroline Bersot | Que el chat lea las notas de HubSpot | Clientes › RC Inmobiliaria › botón «Nexus». Pregunta: «¿Qué notas y llamadas hay de esta empresa en HubSpot?». | Las 13 notas de HubSpot, de la más nueva a la más vieja (11 sep a 1 jul), con su día, quién la escribió (Marco Salas, Lorena Osorio, Alejandro) y el comienzo del texto. No hay llamadas: las 3 del 11 sep son notas sin autor que dicen «Llamada realizada…». Si responde solo con 5, contestó de memoria y no buscó: falla. |
| 234 | ⏳ La valida el equipo: Valentina Sandoval | Que el chat del cronograma sepa lo que se habló con el cliente | Clientes › Cayalá › «Cayalá - WhatsApp Nativo» › Cronograma › el chat. 1) «¿Qué acordamos con Cayalá sobre el arranque? ¿El cronograma lo refleja?». 2) «Agrega en la fase de Configuración WhatsApp una tarea del cliente: dar acceso al número de WhatsApp Business» › aplica la lista. | 1) Dice que el arranque se acordó para el lunes 19 de octubre (reunión del 9 oct) y que el cronograma ya arranca ese día, sin que hayas elegido reuniones. 2) Una lista con un cambio; al aplicarla, la tarea aparece en la primera semana de «Configuración WhatsApp», a cargo del cliente. |

### La escala <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 19 | ⏳ La valida el equipo: Alexander Vanegas | Que la escala de la cuenta muestre su evidencia y su historia | Clientes › Cemaco Internacional (la del proyecto «Cemaco Internacional - CRM») › La cuenta › La escala. Toca una dimensión de Ventas. | Arriba: «Hoy · La Exploración de «Cemaco Internacional - CRM»». Ventas con «6 de 8 dimensiones con nivel · 6 con evidencia»; cada una con «✓ Con evidencia · Lo dijo el cliente en una reunión» y, al tocarla, la frase entre «». «La escala en el tiempo» con «Hoy» y «17 oct 2026 · Primera versión». «El camino de crecimiento»: «Ventas todavía no está ubicada: faltan 2 dimensiones…». |
| 23 | ⏳ La valida el equipo: Andrés Pinzón | Que la escala de la preventa diga de dónde sale y qué explorar | Ventas › Preventa › CreditForce › La escala, en la pestaña de Ventas, sin ninguna dimensión abierta. | «De dónde sale cada nivel»: cada dimensión con su nivel, «✓ evidencia» u «○ hipótesis», de dónde sale y la frase. «Qué explorar en la próxima sesión», con sus rótulos («Hipótesis», «Lo frena»…) y «Llevar a la próxima sesión». |
| 45 | ⏳ La valida el equipo: Alexander Vanegas | Que la escala se arme desde un proyecto con handoff, sin preventa ni exploración | Clientes › ALMOTEC › La cuenta › La escala › «Actualizar escala» › «Actualizar» (espera sin salir). | Antes: «La empresa todavía no está posicionada en la escala». «Sobre qué se ubica» = «Almotec - CRM», con su venta. Mientras corre, las fases junto al botón. Al terminar, «El agente propone N niveles en la Exploración de «Almotec - CRM»», con «De dónde sale» (el handoff, HubSpot…). Crea la exploración del proyecto de ALMOTEC. |
| 47 | ⏳ La valida el equipo: Alexander Vanegas | Que el camino de crecimiento proponga casos de uso | Clientes › pestaña «Prospectos» › CreditForce › La cuenta › La escala › «El camino de crecimiento» › «Sumar a los sugeridos» en «Sistematiza tu proceso comercial con HubSpot». Después La cuenta › Casos de uso. | Ventas Deficiente → Funcional, con lo que la frena y 3 casos. Aviso «Quedó como sugerido en La cuenta › Casos de uso.»; el botón pasa a «Ya está en Casos de uso» y el caso aparece en «Sugeridos». |
| 52 | ⏳ La valida el equipo: Alexander Vanegas | Que «Actualizar escala» funcione en un cliente sin proyecto ni preventa | Clientes › Forestales Latinoamericanos › La cuenta › La escala › «Actualizar escala». | Antes: «La empresa todavía no está posicionada en la escala». En el panel, «Sobre qué se ubica» = «La cuenta entera · Sin proyecto ni preventa» y «Venta» con sus 9 ventas, marcada la más reciente. Al tocar «Actualizar»: aviso «El agente está leyendo todo lo que Nexus sabe de la empresa…» y las fases junto al botón. Al terminar, «El agente propuso N niveles: revísalos acá abajo…». Cuesta US$0,05–0,20. |
| 53 | ⏳ La valida el equipo: Alexander Vanegas | Que con varios proyectos se elija sobre cuál se ubica | Clientes › Plastimex › La cuenta › La escala › «Actualizar escala» › «Sobre qué se ubica». | «Plastimex | SAP + HUBSPOT» primero, con su venta ya marcada. Los cerrados («Plastimex - Limpieza de base de datos» y «PLASTIMEX | POTENCIANDO…») al final, con «· Terminado». Después «La cuenta entera». (Arreglado el 19 oct: los cerrados no se reconocían.) |
| 54 | Por validar | Que lo propuesto se confirme en la misma pantalla y quede en la historia | Al terminar la 52 (o en Tecnosagot, que ya tiene 2 propuestos): en el recuadro azul «El agente propone N niveles…», abre «Ver la frase y el nivel» en uno, toca «Usar» y después «Usar los N». | Cada nivel con su porqué, «De dónde sale» y la frase. Aviso «Nivel usado.» / «Usaste los N niveles.». Lo usado aparece en su área con «✓ Con evidencia». En «La escala en el tiempo», una fila de hoy «Se confirmó un nivel». Lo no usado no entra a la historia. |
| 55 | ⏳ La valida el equipo: Alexander Vanegas | Que se entienda con qué edición y perfil se mide | Clientes › Cemaco Internacional (la del proyecto «Cemaco Internacional - CRM») › La cuenta › La escala › «Se mide con la escala general» › «Corregir» › Industria «Ecommerce y retail», Cómo vende «Mixta», Después de la venta «Recompra» › «Guardar». | Antes: «Porque no hay una edición de su industria…». Después: aviso «Listo: la escala se lee con la edición y el perfil nuevos.», título «Se mide con la edición Ecommerce y retail y el perfil mixta · recompra», chip «La eligió una persona» y lo que cambia frente a la general. Queda guardado en la exploración de Cemaco. |
| 56 | ⏳ La valida el equipo: Alexander Vanegas | Que la historia se ate a la venta | Cemaco Internacional › La cuenta › La escala › «Guardar esta versión» › De qué momento es «Al vender» › «Guardar». | Aviso «Versión guardada.». En «La escala en el tiempo», la fila «27 sep 2026 · Al vender · Guardada a mano · venta «Cemaco Internacional - CRM»». |
| 108 | Por validar | Que cada nivel de cada edición hable de su industria | Publicada el 24 oct (8.9.1; tu tarea #285). Para revisarla: Escala › Ventas › vista «Matriz» › Industria «Turismo», fila 1.7 «Seguimiento de cotizaciones y reservas». | En Inicial: «Cuando una cotización no se contesta o una reserva no se paga, cada persona del equipo decide si insiste y cómo: no hay un paso acordado.» (Comprobado contra el documento: ninguna de las 720 celdas queda sin personalizar.) |

### Rentabilidad, la meta y el uso <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 37 | Por validar | Que la foto del margen quede guardada por mes | Éxito del cliente › Rentabilidad, período «Trimestre» (jul – sep 2026) › recuadro «De dónde salen los números». En la fila «jul 2026» toca «Tomar la foto». | Antes: «sep 2026» dice «Desde su foto · Tomada el 17 oct 2026 por el sistema»; jul y ago dicen «En vivo · Sin foto…»; arriba, «1 de 3 meses desde su foto; el resto, en vivo». Al tomarla: aviso «Foto tomada: N cuenta(s)…», jul pasa a «Desde su foto · Tomada el 19 oct 2026 por egonzalez» y arriba dice «2 de 3 meses desde su foto». La foto de julio queda guardada en producción. |
| 38 | Por validar | Que rehacer una foto pida motivo y la cuenta diga de dónde sale | Rentabilidad › «De dónde salen los números» › fila «sep 2026» › «Volver a tomar». Toca «Volver a tomar la foto» con el motivo vacío; después escribe «versión 2» y tócalo otra vez. Luego, en «Margen por cuenta», abre Librería Internacional y mira «Mes a mes». | Vacío: aviso rojo «Para volver a tomar la foto, escribe por qué.» y nada cambia. Con motivo: «Foto tomada: N cuenta(s)…» y la fila dice «Tomada el 19 oct 2026 por egonzalez · versión 2»; desaparece el aviso «sep 2026: Esta foto es de antes de contar las reuniones fuera de Meet…». En la cuenta, «De dónde sale» dice «Foto del 19 oct» en sep y «En vivo» en ago. |
| 39 | Por validar | Que se vea qué usa y qué desestima cada equipo | Para ti › «Uso de Nexus» (arriba a la derecha). Pestaña «Equipo»: baja hasta «Qué usa cada equipo, en las últimas 4 semanas». Después abre «Para qué se usa». | Seis pestañas: Equipo · Para qué se usa · IA por cliente · Procesos de IA · Conclusiones · Reuniones sin grabar. En «Qué usa cada equipo», cada celda es «personas que la abrieron/personas del equipo» (Customer Success: «Para ti» 2/7) y «—» donde nadie la abrió. En «Para qué se usa»: «Qué usa y qué desestima cada equipo» con «usó · desestimó», y «Quién decide», por equipo y en orden alfabético. |
| 40 | Por validar | Que se vea cuánto cuesta la IA y si sirve | Uso de Nexus › «IA por cliente» (cambia entre «30 días» y «90 días», arriba a la derecha) › «Procesos de IA» › «Conclusiones». | IA por cliente: «Gasto en IA» unos US$ 92 en 30 días y unos US$ 139 en 90, en «Clientes y prospectos» y «Smarteam y aliados» con lo que propuso Nexus («N % usado»). Procesos de IA: «Proceso por proceso» con gasto, llamadas, errores y «% usado». Conclusiones: agrupadas, cada una con «Para mirar», «Para saber» o «Va bien». |
| 83 | Por validar | Que la meta se cambie desde la pantalla | Éxito del cliente › Rentabilidad › tarjeta «La meta del año» (arriba de las pestañas). Hoy dice «US$ 2,3 M en 2027». Toca «Cambiar la meta» › Año «2027», «Meta en dólares» «2.500.000», «Por qué (opcional)» «prueba» › «Guardar». Después toca «Ver la historia». Al terminar, vuelve a dejarla en 2.300.000 con «Cambiar la meta». | Aviso «Meta de 2027 guardada.». El título pasa a «US$ 2,5 M en 2027», la barra punteada dice «Meta · US$ 2,5 M» y «Por mes» dice US$ 208.333. «Ver la historia» (aparece recién con dos metas) muestra la de hoy con «prueba» y la del 18 oct. Cada cambio queda: la meta nunca se borra. |
| 84 | Por validar | Que las horas salgan solas, también fuera de Meet | Primero haz la 38. Rentabilidad › período «Mes» (sep 2026) › «Margen por cuenta»: filas de Librería Internacional y Teamnet, columna «Horas reales», y la barra «De dónde salen las horas». | En «Horas reales»: «N reun. (X fuera de Meet) · …» (Librería unas 24,5 h, Teamnet unas 9). En la barra: «Del calendario (X h fuera de Meet) · %». kölbi y Club de Amantes del Vino no llevan «(… fuera de Meet)». |
| 86 | Por validar | Que Nexus lea los números y proponga | Rentabilidad › pestaña «Lectura de los números» › «Leer los números» (llama a Claude y guarda en producción). Espera hasta un minuto. En una propuesta toca «Desestimar», escribe por qué y confirma con «Desestimar». | Aviso «N señales · M propuestas nuevas.» (sin señales: «No hay nada que no progrese: no se llamó al modelo.»). Cada propuesta con qué ve, qué hacer e «Inversión: US$ …», con «Usar» y «Desestimar» (apagado hasta escribir el motivo). Al desestimar pasa a «Decidido en los últimos 90 días · Desestimada por … · tu motivo». |

### El gasto de la IA <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 67 | Por validar | Que la factura de Anthropic se compare con lo medido | Integraciones › tarjeta de Claude › «Ver el gasto» › pestaña «Factura». En «Anotar la factura de un mes»: Mes «2026-09», «Monto (US$)» el total de septiembre de la consola de Anthropic, «Anotar». «Borrar» en la tabla la quita. | Aviso «Factura anotada.». En «Lo medido contra lo facturado», septiembre con «Medido» unos US$ 33,27, tu monto y la diferencia con su %. Si se aleja más de US$ 5 y más del 10 %, sale con ⚠ en ámbar. |

### Equipo, acceso y datos <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 231 | Por validar | Que «Ver como» esté al lado del nombre | Equipo › Miembros. | «Ver como» en la segunda columna, al lado del nombre; también en Marco Salas y Alexander Arrieta, y no en tu propia fila. |
| 232 | Por validar | Que puedas ver como Marco | Equipo › «Ver como» en Marco Salas › «Para ti». | Su meta de 400.000 (lleva 301.536), su cartera y lo de Finanzas. Un cambio responde «es solo lectura». |
| 233 | ⏳ La valida el equipo: Claude, con el código | Que mirar como otra persona no le marque nada | Mirando como otra persona, abre un reporte suyo en Feedback y vuelve a tu usuario. | El reporte sigue sin leer para esa persona. |

## Pruebas con IA

Las que corre la IA (Claude) sin pantalla: con los datos de producción, en solo lectura, compruebo que cada pantalla diga lo que dicen la base, el calendario y HubSpot, que las tareas salgan para la persona y el equipo correctos, que las copias y los jobs corran y que no se mezclen clientes. Se vuelve a correr con `scripts/validar-*.ts`; la última está en `docs/validacion-2026-10-19.md`.

**La próxima pasada:** las tareas de las reuniones con clientes leídas con la regla nueva (190, 192 y 193, el 20 oct en la tarde), que el cobro automático y la copia de HubSpot corran solos (103 y 81) y los indicadores de «Cómo va Nexus», cada semana.

### Para ti y la agenda

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 9 | ✓ Validado por Claude 18 oct | Que de viernes a domingo invite a planificar la semana | Un viernes, sábado o domingo, abre «Para ti» como CSE, CSL o alguien de Desarrollo. | Debajo de «Lo que importa hoy»: el viernes «Es viernes: planifica la semana que viene», el sábado «Es sábado: planifica la semana que viene» y el domingo «Mañana empieza la semana: planifícala». Lleva a «Planifica tu semana» (prueba 20). La agenda abre en la semana. |
| 50 | ✓ Validado por Claude 19 oct | Que un excliente salga de todo | Éxito del cliente › pestaña «Cartera» › «Fuera de la cartera». Para marcar uno: Éxito del cliente › «Cartera» › columna «Tipo de relación» › «Excliente» (la CSL y dirección). | Wherex aparece ahí, marcado «Excliente», con el aviso de su proyecto activo. No está en ninguna alerta, cartera ni en «Lo que importa hoy»; solo en la lista de limpieza de Heiver, que pide cerrar su proyecto en HubSpot. (Lo marqué hoy a tu nombre: cerró sus 4 alertas.) |
| 79 | ✓ Validado por Claude 18 oct | Que el líder vea lo que no se tomó | Con «Ver como» Alex Vanegas, abre «Para ti». | Una línea por cuenta: «Larce: N compromisos sin tomar hace más de 48 horas», con el enlace a cada tarea. |
| 121 | ✓ Validado por Claude 19 oct | Que la agenda traiga los eventos sin invitados | «Ver como» Andrés Pinzón › «Para ti» › Agenda, semana del 19 al 23 oct: lunes, jueves y viernes. | Lunes «Convocatoria ICB» 13:00–14:00 y «Tenis» 6:00–7:30; jueves «Cita Médica» 13:00–14:30; viernes «Sale Juan del colegio» 10:30 y «Entrega de notas» 11:30. Ningún espacio libre ni bloque azul encima. |
| 122 | ✓ Validado por Claude 19 oct | Que lo de todo el día vaya arriba | La misma semana, arriba del miércoles. | «Aniversario de Marco Salas» como evento de todo el día, sin ocupar horas. |
| 123 | ✓ Validado por Claude 19 oct | Que dos eventos a la misma hora se vean los dos | La misma semana, lunes 8:00. | «SPRINT COMERCIAL» al lado de «Sprint Comercial \| Planeamos la semana», cada uno con su título. |
| 180 | ✓ Validado por Claude 19 oct | Que una reunión agendada cuente como siguiente paso | «Ver como» Liliana Moreno › «Para ti» › «Lo que importa hoy». | Bloque «Reuniones con tus cuentas» con «Cemaco Internacional: … — Mañana» y «Preparar». No aparece «falta el siguiente paso»; los otros bloques dicen «Todas tus cuentas tienen su siguiente paso.» y «Nada prometido sin tomar…». |
| 184 | ✓ Validado por Claude 19 oct | Que vea lo prometido sin tomar | «Ver como» Heiver Gomez › «Para ti» › «Pendientes sin seguimiento». | Primero los compromisos de TEC sin tomar y después «TEC: 2 tareas vencidas», con T-45. |
| 186 | ✓ Validado por Claude 19 oct | Que la CSL vea los tres bloques por CSE | «Ver como» Alexander Vanegas › «Para ti». | En cada bloque, una línea por CSE («Heiver Gomez: 6 cuentas sin siguiente paso», «Sin CSE: …»), con enlaces. |
| 188 | ✓ Validado por Claude 19 oct | Que en Ventas la reunión también cuente | «Ver como» Andrés Pinzón › «Para ti» › «Tu cartera» › «Para mover hoy». | Un negocio cuya empresa tiene reunión esta semana no pide «Definir siguiente paso» y dice «Siguiente paso: reunión …». |
| 223 | ✓ Validado por Claude 19 oct | Que a la CSL le llegue la limpieza que rompe la asignación | «Ver como» Alexander Vanegas › «Para ti» › «Lo que importa hoy». | Primero «Cuentas sin dueño en HubSpot · 27» con «Ver la lista de limpieza» y tres líneas: «20 proyectos sin encargado en HubSpot», «6 cuentas cobran un servicio sin proyecto en HubSpot» y «1 cosa abierta en una cuenta excliente». |
| 224 | ✓ Validado por Claude 19 oct | Que cada línea diga quién y qué | El mismo bloque › «20 proyectos sin encargado en HubSpot». | «9 encargado que ya no está · 11 sin encargado», con 11 enlaces a HubSpot y «y 9 más en la lista». Wherex dice «(le toca a Heiver Gomez)». |
| 225 | ✓ Validado por Claude 19 oct | Que no se repita en «Esta semana» | «Para ti» de Alexander › «Esta semana». | Ya no aparecen «HubSpot: 26 cosas por poner al día» ni «8 proyectos de Customer Success sin encargado». |
| 226 | ✓ Validado por Claude 19 oct | Que el CSE siga con sus tres bloques | «Ver como» Heiver Gomez › «Para ti». | Sus tres bloques iguales; en «También para hoy», «HubSpot: 1 cosa por resolver hoy» (Wherex). |
| 252 | ✓ Validado por Claude 20 oct | Que cada compromiso le llegue a quien le toca | Repartí con la regla nueva los compromisos de 41 lecturas de 14 días y los comparé con las 92 propuestas vivas (`scripts/a-quien-le-llegan-las-propuestas.ts`). | Ninguna le llegó a otra persona. El único aviso ajeno de hoy era el de Valentina (T-117, de Marco) y ya no le sale; 5 avisos propios que no le llegaban a nadie ahora sí (4 de Marco y T-102 de Alexander). |
| 253 | ✓ Validado por Claude 20 oct | Que los desplegables de la barra queden encima, para todos | Página de prueba con el sidebar real, midiendo punto por punto qué queda arriba de cada panel abierto. | Super Admin en 5 pantallas, 2 temas y la barra abierta y colapsada: 20 de 20 sin un punto tapado. Los otros 6 roles en Clientes: 24 de 24. Antes del arreglo, con la barra colapsada, 167 de 273 puntos tapados. |
| 274 | ✓ Validado por Claude 20 oct | Por qué la guía de Fundauna salía vacía | La cuenta con los datos de producción, en solo lectura. | Fundauna no tenía siguiente paso de Customer Success (su reunión ES el siguiente paso), ni pendientes del cliente, ni negocios, y la reunión del 20 oct dejó notas sin minuta: no había de dónde sacar un objetivo. Ahora, sin nada de eso, el objetivo es el tema del título de la invitación («Cubrir el tema de la invitación: Conexiones de…»). |
| 276 | ✓ Validado por Claude 20 oct | Que las alertas no salten encima de la pantalla | El código del shell y la prueba que lo vigila (`lib/cs/ficha-reglas.test.ts`). | El notificador de alertas del vigía se fue: las alertas siguen en Éxito del cliente y en «Para ti» de la CSL; encima de la pantalla solo salen errores y confirmaciones de lo que haces. |
| 277 | ✓ Validado por Claude 20 oct | Por qué Andrés ya no ve a Universidad Monterrey | Las tareas de la cuenta en producción. | Sus dos compromisos (T-37 y T-38) se cerraron el 19 oct a las 16:23 como «Nadie la decidió», en la limpieza de «Menos tareas a la vista»: ya no hay nada que avisar. |
| 271 | ✓ Validado por Claude 20 oct | Que la IA escriba un buen nombre corto | 40 tareas abiertas reales de producción, con el pedido final, sin escribir nada. | 40 de 40 con nombre, en unos 20 s y US$0,014 por tanda de 40: «Pedirle a Ana el inventario actualizado», «Agendar sesión de e-commerce con Álvaro», «Dar seguimiento a lo que prometió el cliente». La primera versión dejaba nombres colgando («…Josseline los»): se corrigió el recorte. |
| 272 | ✓ Validado por Claude 20 oct | Que el job ponga los nombres cortos | Producción, después del deploy de `c5659704`: las tareas abiertas con `tituloCorto` y las corridas del job. | La primera corrida nombró las 127 tareas abiertas en 4 pedidos (40, 40, 40 y 7), sin ninguna sin nombre, por US$0,039 en total. |

### Tareas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 190 | ⏳ La corre la IA el 20 oct en la tarde | Que de una reunión con cliente salgan pocas tareas | Liliana Moreno con su usuario › Tareas › «Mis tareas», después de la próxima reunión de Cemaco. | Como mucho 3 propuestas, con títulos cortos que empiezan con un verbo, como «Enviar el reporte a CEMACO». Lo que el cliente espera de Smarteam sale como tarea suya, no como «Recordarle a…». |
| 192 | ⏳ La corre la IA el 20 oct en la tarde | Que no salgan tareas de coordinación interna | Marco Salas, después de una reunión con un cliente. | No aparecen «Realizar reunión interna» ni «Estar disponible el…». |
| 193 | ⏳ La corre la IA el 20 oct en la tarde | Que lo descartado no vuelva | Un CSE descarta una propuesta y espera la próxima reunión de esa cuenta donde se hable de lo mismo. | No vuelve, ni a él ni a otra persona de esa cuenta. Si la deja vencer sin decidir, sí puede volver. |
| 198 | ✓ Validado por Claude 19 oct | Que el sprint siga igual | Alejandra Ortega, después de la reunión del sprint de marketing. | Siguen saliendo hasta 5 por persona. |

### Kickoff y cronograma

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 254 | ✓ Validado por Claude 20 oct | Por qué Cayalá salía con tareas vencidas y los años 1900 | La base en solo lectura: los cambios del cronograma de Cayalá, Cemaco y Spectrum, y toda columna de fecha. | El campo de fecha guardaba en cada tecla: escribir «2026» dejaba el año 0026 (1926 en el calendario). Cayalá estuvo en el año 0026 del 15 al 17 oct: por eso todo salía vencido. Hoy hay 0 fechas antes del 2000 en toda la base. |
| 255 | ✓ Validado por Claude 20 oct | Que la portada no se descuadre | Página de prueba con la portada real, en edición y en lectura. | Cada dato mide 53 px al editar y al presentar; el calendario flota sin mover nada; «+ Tag» en la línea de las etiquetas. |

### Preventa y exploración

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 170 | ✓ Validado por Claude 19 oct | Que una guía de proyecto vieja avise | Clientes › Cemaco Internacional › «Cemaco Internacional - CRM» › Exploración › próxima sesión › «Preparación». | Arriba, en ámbar: «Se armó antes de «Lo que ya sabemos»…» con «Actualizar la guía». La guía sigue igual (9 preguntas). |
| 171 | ✓ Validado por Claude 19 oct | Que el proyecto tenga «Lo que ya sabemos» | La misma pestaña, «Lo que ya sabemos». | 5 líneas: dos de reuniones y Retos, Resultados que persigue y Obstáculos, con «Confirmado en la estrategia». |
| 173 | ✓ Validado por Claude 19 oct | Que la guía de base también sea corta | Ferreteria Noelito › «Implementación CRM + Conexión SAP» › Exploración › Sesión 1 › «Preparación». | 5 preguntas (Retos, Resultados que persigue, Obstáculos y dos de la escala), ya no 8. |
| 174 | ✓ Validado por Claude 19 oct | Que cierre pensando en los resultados | Cualquiera de esas guías, tramo «Cerrar». | «¿Hay algo que no hayamos hablado y que deba saber para que el proyecto llegue a esos resultados?» |
| 256 | ✓ Validado por Claude 20 oct | Cuánto cuesta proponer preguntas para un objetivo | Cemaco, con el objetivo real de Liliana y con «…volúmenes de leads y tasa de conversión» (`scripts/medir-preguntas-del-objetivo.ts`, sin escribir). | Unos US$0,021 y de 9 a 11 s por corrida; 3 preguntas válidas (leads al mes, tasa de conversión, volumen que se quiere alcanzar). |
| 261 | ✓ Validado por Claude 20 oct | Por qué el asistente de la guía se quedaba en un tema | El contexto que recibía con Cemaco, en solo lectura (`scripts/ver-contexto-de-la-guia.ts`). | No recibía ninguna sesión, ni el objetivo de la próxima, el handoff, el kickoff ni la memoria del proyecto. Lo que pidió Marco estaba en un acuerdo de la minuta del 19 oct que la memoria recortaba a 560 caracteres. |
| 262 | ✓ Validado por Claude 20 oct | Que el asistente proponga lo que falta y no repita | Conversaciones reales con Cemaco y Tecnosagot, en hilos de prueba que se borraron. | Cemaco: en 3 de 4 corridas propuso leads por canal y su conversión, y nunca repreguntó por las agencias. Tecnosagot: retomó la meta de ventas y los leads de ferias. El primer turno cuesta US$0,09–0,15 y tarda 18–24 s; los siguientes, US$0,025–0,04. |
| 263 | ✓ Validado por Claude 20 oct | Que las preguntas del objetivo no nombren al equipo | Cemaco con «…lo que pidió Marco…», ya con todo junto en `main`. | «¿Cuál es hoy tu tasa de conversión de lead a venta?» (antes: «…que maneja Marco como referencia?»). US$0,021 y 8 s. |

### La cuenta: encargado, proyectos y ficha

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 115 | ✓ Validado por Claude 19 oct | Que Librería Internacional quede con un solo encargado | Clientes › «Librería Internacional»: abre la ficha y espera unos segundos. | La celda «CSE encargado» dice solo Caroline Bersot, ya no Heiver Gómez, y queda un solo «Librería Internacional \| HubSpot Refresh» activo (la fila vieja, fusionada en HubSpot, se da de baja sola en la primera sincronización). |
| 165 | ✓ Validado por Claude 19 oct | Que Lili entre directo a su proyecto | «Ver como» Liliana Moreno › Clientes › Cemaco Internacional. | Abre en «Cemaco Internacional - CRM», con su cronograma de 7 fases. |
| 166 | ✓ Validado por Claude 19 oct | Que cada quien entre a su proyecto | «Ver como» Breiner › la misma ficha. Después tu usuario. | Breiner: abre en «CEMACO » (Desarrollo). Tú: abre en la cuenta, con los dos proyectos en el riel. |
| 168 | ✓ Validado por Claude 19 oct | Que Cemaco y Total Finco queden en una sola ficha | Clientes › busca «Cemaco» y «Total Finco». Después Finanzas › Cobranza › Clientes. | Una sola «Cemaco Internacional» y una sola «Total Finco». En Cobranza, la cuenta de cobro de Cemaco con su servicio y sus 4 cobros, y la de Total Finco con la suya. |
| 200 | ✓ Validado por Claude 19 oct | Que cada quien abra en su proyecto | Clientes › Cemaco Internacional con «Ver como» Liliana Moreno, Alejandro Salas y Heiver Gomez; después Alexander Vanegas y tú. | Liliana y Heiver abren en «Cemaco Internacional - CRM»; Alejandro en «CEMACO»; Alex y tú en la cuenta. Arriba: «Esta cuenta tiene otro proyecto: …» con el enlace. |
| 206 | ✓ Validado por Claude 19 oct | Que Librería muestre a su encargada | Clientes, busca «libr», columna «CSE encargado». | «Caroline Bersot», sin «+1», y ya no aparece «Implementación HubSpot Refresh». |
| 209 | ✓ Validado por Claude 19 oct | Que el CSE de una cuenta nunca sea el desarrollador | Éxito del cliente › Cartera › Cemaco Internacional. | El CSE es Liliana, no Breiner. |

### SmartLoop y el servicio recurrente

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 30 | ✓ Validado por Claude 19 oct | Que Nexus recomiende SmartLoop al llegar a la entrega | 1) «Ver como» Juan Carlos Armijos › Para ti › «Esta semana». 2) Sal de «Ver como»: Selvatura › «SB Hotels \| CRM» › Resumen. | 1) «Propónle a Selvatura seguir con SmartLoop» (y otras cuentas en entrega), con «Ver la recomendación». 2) En el Resumen, aunque «Qué sigue» pida otra cosa, el bloque «Después de la entrega» con la recomendación, el porqué y «Dejar la tarea», «Abrir el alta» y «Descartar». Las de Ferretería Noelito y Cicadex (encargado que ya no está) le llegan a Alexander Vanegas. |

### Propuestas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 25 | ✓ Validado por Claude 19 oct | Que el IVA se calcule bien en los dos sentidos | Inversión de una propuesta: una línea de servicios de 10000; «+ IVA (13%)»; después 11300 e «IVA incluido (13%)». | Con «+ IVA»: «IVA (13%) $1,300» y «Total con IVA $11,300». Con «IVA incluido»: «Monto sin IVA $10,000» e «IVA (13%) $1,300». (Las 14 pruebas de la cuenta pasan.) |
| 26 | ✓ Validado por Claude 19 oct | Que el IVA también vaya en lo mensual y en la forma de pago | Servicios 10000 (cobro único), licencia 1000 (mensual), «+ IVA»: el cierre de Inversión y «Forma de pago». | «Pago único + IVA» $10,000 · IVA $1,300 · total $11,300; «Por mes + IVA» $1,000 · IVA $130 · total $1,130. En «Forma de pago»: «Inversión de la implementación + IVA». |
| 60 | ✓ Validado por Claude 19 oct | Que cada licencia tenga su precio de lista y su margen, sin que el cliente lo vea | En una propuesta, licencia de 1000 al mes; en «Interno · precio de lista del proveedor»: 800, «al mes», «La factura Smarteam (reventa)»; después 1200. | «Margen: $200 al mes (20 %)…» en verde; con 1200, «Pierdes: $200 al mes (-20 %)…» en ámbar. No aparece en el link ni en el PDF (lo cuidan 18 pruebas de la frontera). |

### Comisiones

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 88 | ✓ Validado por Claude 18 oct | Que el caso de Marco se entienda | Finanzas › Modelos › Comisiones › «Cómo funciona» › «Descuentos y recurrencia». | 33.600 − 2.400 = 31.200, y al 5 %: US$1.560 en vez de US$1.680. |
| 89 | ✓ Validado por Claude 18 oct | Que la calculadora reaccione | La misma sección, a la derecha: deja 3.000 y 2.800; después baja «Lo que se cerró al mes» de 2.700. | «Hoy» US$1.680 y «Con la propuesta» US$1.560. Bajo 2.700 aparece «Lo aprueba Marco». |
| 90 | ✓ Validado por Claude 19 oct | Que estén las preguntas para Marco | Finanzas › Modelos › Comisiones › «Cómo funciona», al final, «Decisiones pendientes». | Las tres primeras: «¿Un descuento de más del 10 % lo aprueba Marco?», «¿Lo recurrente pesa 1,2 veces en la meta?» y «¿El descuento sale entero de la base de la comisión, o solo una parte?». |
| 91 | ✓ Validado por Claude 18 oct | Que la simulación muestre cada venta | «Simulación» › caja «Descuento y valor de 12 meses». | Cada venta con Tipo, Al mes, Valor 12 meses, Descuento, Para la meta y «antes → ahora». |
| 92 | ✓ Validado por Claude 19 oct | Que un descuento baje la comisión | «Simulación», vendedor «Andrés Pinzón», caja «Descuento y valor de 12 meses», fila «RC Inmobiliaria - Acuerdo Macro» (ya en «Al mes», 2.800): escribe 2400 en «Descuento 12 meses». | «Lo escribiste tú · 6,7 %». La comisión pasa a «US$ 1.680,00 → US$ 1.560,00» («5 % de US$ 31.200») y «Por sus ventas» de US$ 9.420 a US$ 9.300. (Lo simulé con los datos de hoy.) |
| 93 | ✓ Validado por Claude 19 oct | Que las decisiones se puedan probar | Con el descuento de la 92, en «Lo que falta decidir»: «¿El descuento sale entero…?» › «La mitad» y después «Nada»; «¿Lo recurrente pesa 1,2 veces…?» › «Como cualquier venta». | «La mitad»: «US$ 1.680,00 → US$ 1.620,00». «Nada»: sin diferencia. «Como cualquier venta»: RC «Para la meta» baja de US$ 40.320 a US$ 33.600 y octubre sigue en 5 %. (Lo simulé con los datos de hoy.) |
| 94 | ✓ Validado por Claude 19 oct | Que un descuento grande pida aprobación | Ventas › Propuestas › «Grupo Monge - Nuevo tipo de objeto Deal» › «2 · Propuesta», Inversión, debajo de los servicios. No edites nada. | «Descuento del 13,4 % en los servicios ($900 en 12 meses): pasa el 10 % y lo aprueba Marco antes de enviarla.» y «Aprobar el descuento». (Lo calculé con la misma función de la pantalla.) |

### Finanzas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 281 | ✓ Validado por Claude 21 oct | Por qué la factura de AMVAC seguía pendiente | Las cuotas pendientes con factura en Odoo, contra Odoo en vivo. | No era el IVA: la cuota (1.848) y la factura sin IVA (1.848) se emparejaban. Odoo la dio pagada en el «Actualizar» de Alex de las 16:15, y el cobro de lo pagado ya había corrido a las 7:00. Lo mismo con Fomento Urbano. Las otras 30 pendientes con factura están impagas también en Odoo. |
| 282 | ✓ Validado por Claude 21 oct | Que AMVAC y Fomento quedaran cobradas | El cobro de lo pagado en producción, después del deploy de `da1fd3bf`. | AMVAC septiembre (US$1.848, FAC/2026/0354) cobrada el 14 oct y Fomento octubre (US$300, FAC/2026/0363) el 16 oct, con la firma del sistema y las fechas reales del pago en Odoo. |
| 34 | ✓ Validado por Claude 19 oct | Que las comisiones de Stripe y transferencias sumen como gasto | Conciliación › Gastos y Mercury › «Gastos financieros». Confirma una. | 81 comisiones para confirmar (US$350,67), sin duplicados; la suscripción de Mercury ya no sale (es la herramienta «Mercury») y la comisión por compras en el exterior dice «Comisión del banco». Lo confirmado suma como gasto financiero. Confirmarlas es de Admin. |
| 100 | ✓ Validado por Claude 18 oct | Que las ventas sin cobranza cuadren mejor | Punto de equilibrio › «De la venta a la caja» › «Dónde se queda la plata» › «ventas ganadas sin respaldo en cobranza» › «Ver las ventas». | US$171.059,93 en 44 ventas: 15 sin nada cargado, 25 que facturan menos de lo vendido y 4 de empresas que no están en Nexus. Aparte, US$68.321,61 ya cargados en cuotas sin facturar. (Antes se llamaba «Lo que no cuadra»; lo comprobé con los datos.) |
| 103 | ⏳ Lo reviso yo después del deploy | Que el cobro automático corra cada mañana | Integraciones › «Jobs del servidor», el día siguiente del deploy, desde las 7:00. | «El cobro de lo pagado en Odoo y Mercury» con punto verde y la fecha de la corrida. |

### Éxito del cliente

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 140 | ✓ Validado por Claude 19 oct | Que el aviso del vigía diga qué propone | «Ver como» Alex Vanegas › «Para ti» › «Lo que importa hoy». | «El vigía propone pasar 9 proyectos a «En riesgo»», debajo «La que más espera: Areyá · Areya - MKT + CRM: de «En fricción» a «En riesgo» (…)» y el botón «Decidir una por una». |
| 141 | ✓ Validado por Claude 19 oct | Que las propuestas se decidan en un solo lugar | Toca «Decidir una por una». También: Éxito del cliente › arriba a la derecha › «Propuestas del vigía». | «Propuestas del vigía» con 9 filas, la de Areyá resaltada y un solo botón azul «Confirmar «En riesgo»». |
| 215 | ✓ Validado por Claude 19 oct | Que el CSE entre a «Seguimiento de cuentas» | «Ver como» Juan Carlos Armijos › menú › Éxito del cliente. | Llega a «Seguimiento de cuentas» con «Las que llevas» (16), sin montos ni uso de HubSpot. |
| 216 | ✓ Validado por Claude 19 oct | Que la CSL vea el seguimiento de toda la cartera | «Ver como» Alexander Vanegas › Éxito del cliente › «Seguimiento de cuentas». | 48 cuentas, 35 sin sesión y 34 sin siguiente paso, con el filtro por CSE. Cada fila: «Próxima sesión», «Siguiente paso», «Temas que se están tratando» y «Última reunión». |
| 222 | ✓ Validado por Claude 19 oct | Que Ventas, Desarrollo y Marketing no entren | «Ver como» Andrés Pinzón y alguien de Desarrollo › menú. | No ven «Éxito del cliente» ni entran a la página. |

### El chat de Nexus

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 76 | ✓ Validado por Claude 18 oct | Que lea una nota entera | El mismo chat: «Lee la primera entera». | La nota completa, con su fecha y su autor. |
| 77 | ✓ Validado por Claude 18 oct | Que conteste lo prometido sin mezclar empresas | Clientes › kölbi › chat: «¿Qué le prometimos al cliente que sigue abierto?». | Los compromisos abiertos de kölbi, nada de otra empresa. |
| 235 | ✓ Validado por Claude 20 oct | Que el chat del cronograma lea la memoria del proyecto | Cayalá - WhatsApp Nativo (6 reuniones vinculadas, 0 elegidas): el material del chat y una conversación de verdad con dos pedidos, en un hilo de prueba que se borró. | El bloque trae los acuerdos de las 3 reuniones con el cliente (2.558 caracteres, sin el handoff interno). El chat contestó el arranque del 19 oct citando la reunión del 9 oct (7,9 s) y propuso la tarea del cliente (6,2 s); aplicada en memoria, sin rechazos. |

### La escala

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 46 | ✓ Validado por Claude 18 oct | Que la escala guarde su historia | En Cemaco › La cuenta › La escala, mira «La escala en el tiempo». Confirma un nivel en La escala de su Exploración, vuelve y toca «Guardar esta versión»; tócalo otra vez. | La versión del 17 oct ya está. Después de confirmar, «Qué cambió desde el 17 oct» dice qué dimensión subió o bajó. La segunda vez: «Esta versión ya estaba guardada: nada cambió desde la última». |
| 51 | ✓ Validado por Claude 19 oct | Que las ediciones Turismo y Automotriz digan lo que pasa en esas industrias | Escala › Ventas › «Industria» › Turismo o Automotriz. | Publicadas en la 8.9.0 (19 oct, a tu nombre): las dos ediciones se ven en la escala y Nexus reconoce esas industrias al elegir la edición de una empresa. |

### Rentabilidad, la meta y el uso

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 61 | ✓ Validado por Claude 18 oct | Que lo vendido llegue a Finanzas | Finanzas › Punto de equilibrio › «Licencias revendidas». | Las 6 propuestas ganadas y ninguna entra todavía, cada una con su porqué: Areyas, Cemaco y Spectrum no dicen quién factura la licencia ni su precio de lista; Multiquímica no tiene montos en la Inversión; Cayalá y RC Inmobiliaria no venden licencias. |
| 82 | ✓ Validado por Claude 18 oct | Que la meta se vea contra lo facturado | Éxito del cliente › Rentabilidad, arriba de las pestañas. | «La meta del año: US$ 2,3 M en 2027», una barra por año desde 2021 con lo facturado y «Qué falta para la meta de 2027» (US$2.183.572). ⚠ 2023 no tiene facturas y 2024 solo 8: la copia de Odoo de esos años parece incompleta. |
| 85 | ✓ Validado por Claude 18 oct | Que se vea el margen por persona | Rentabilidad › Costo de la hora › Por persona. | Las columnas «Generado» y «Margen», por nombre, en orden alfabético. |
| 87 | ✓ Validado por Claude 18 oct | Que el punto de equilibrio muestre la meta y lo que falta | Finanzas › Punto de equilibrio, al final. | La misma barra de la meta y una tabla mes a mes: Por facturar, Recurrencia, Proyectos, Expansiones y Falta. |

### El gasto de la IA

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 64 | ✓ Validado por Claude 18 oct | Que el gasto de la IA se vea por mes | Integraciones › Gasto en IA › «Por mes». | Agosto US$26,49 (desde el 17), septiembre US$33,27 y octubre US$78,73, lo automático y lo humano por separado. (Las cifras las comprobé yo; si quieres, mira el gráfico.) |
| 65 | ✓ Validado por Claude 18 oct | Que el tope diario esté a la vista | La misma pestaña, «El tope diario». | Automático US$10 y humano US$20, «solo avisa», cuántos días lo pasaron y el tope sugerido. |
| 66 | ✓ Validado por Claude 18 oct | Que se proyecte el gasto de los próximos meses | Pestaña «Proyección»: prende y apaga los escenarios. | Hoy unos US$86 al mes; con los hechos prendidos, unos US$98, y con los hechos y las tres palancas de ahorro, unos US$85 (sin los hechos, las palancas lo bajan a unos US$80). Nada se guarda al recargar. |

### Equipo, acceso y datos

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 42 | ✓ Validado por Claude 18 oct | Que «Ver como» no deje escribir como otra persona | Equipo › una persona › «Ver como»; navega un poco y toca «Volver a mi usuario». | Nexus como lo ve esa persona, sin poder escribir como ella. «Volver a mi usuario» te devuelve. |
| 81 | ⏳ Lo reviso yo después del deploy | Que la copia corra sola | Integraciones › «Jobs del servidor», el día siguiente del deploy, entre las 6:00 y las 20:00. | «La copia de los correos, notas y llamadas de HubSpot» con punto verde y la hora de la corrida. |

## Lo que le pides al equipo

Lo que ya está en producción y les toca revisar a ellos, no a ti.

| # | A quién | Qué revisar |
|---|---|---|
| 1 | CSE y Ventas | Las tareas que Nexus les propone de sus reuniones: usar las buenas y descartar las que no sirven |
| 2 | Andrés | Que una tarea de HubSpot que completa en Nexus aparece cerrada en HubSpot |
| 3 | Un CSE | «Preparar» antes de una reunión con cliente: que traiga lo que necesita para entrar |
| 4 | Alex Vanegas | La cartera de Éxito del cliente: el color de cada cuenta y su porqué |
| 5 | Alex Arrieta | El punto de equilibrio: lo facturado y cobrado de cada mes |
| 6 | Customer Success y Ventas | Probar la escala 8.9.1 con la empresa que elija cada uno, desde su preventa o su ficha (nunca Wherex), hasta juntar 5 a 8 de varias industrias, y decir dónde no calza |
| 7 | Alex Vanegas | Cerrar en HubSpot el proyecto «Wherex - Migración CRM + integraciones operativas» (sigue activo, a nombre de hgomez) y marcar a Wherex como «Excliente» en Éxito del cliente › Cartera |
| 8 | María José o Alex Arrieta, después del deploy | Conciliación › «Lo pagado»: que lo pagado y conciliado en Odoo y Mercury se cobre solo cada mañana, y que lo dudoso quede ahí con su porqué. Las cuotas «Ya cobrada» reciben su número al confirmarlas (prueba 36) |
| 9 | María José o Alex Arrieta | Punto de equilibrio › «Licencias revendidas»: editar la de kölbi y guardar (prueba 33). Conciliación › Gastos y Mercury › «Gastos financieros»: confirmar las comisiones reales (prueba 34). Cobranza › Odoo › «Facturación por cliente»: abrir el detalle de una factura de Mercury (prueba 35) |
| 10 | Alejandra Ortega | Su sprint ya está configurado: «Sprint planning de marketing» (lunes 9:30) como planning. Después de la reunión, ella y Lidia ven en Mis tareas como mucho 5 propuestas cada una, marcadas «Sprint interno» (prueba 21). Si quiere, suma «Retrospectiva de marketing» como cierre |
| 11 | Alex Vanegas | Customer Success: en Tareas › Semana del equipo › «La reunión del sprint», elegir «Weekly Execution Review» (lunes 8:15) como planning y «Revisión de Resultados y Cierre Semanal» (jueves) como cierre, con Gemini tomando notas. El de Desarrollo ya quedó configurado |
| 12 | Alejandro Salas | Prender las notas y la transcripción de Gemini en «SPRINT DEPT. SOFTWARE» (lunes 8:00): ya es el planning de Desarrollo, a su nombre, pero sin notas no hay qué leer |
| 13 | Juan Carlos Armijos | En «Para ti», «Metzger Supplies: un compromiso…» › «Tomarlo o decidir» › «Usar» en la tarea: la línea desaparece de su «Para ti» y del de Alex (prueba 80) |
| 14 | Heiver Gomez | Tareas › «Planifica tu semana»: en una cuenta, «Agendar» la reunión sugerida y «Ya lo guardé»; en otra, «Usar» o «Crear la acción» (prueba 20) |
| 15 | María José o Alex Arrieta | Cobranza › Fundauna: la factura FAC/2026/0359 (pagada) cubre dos cuotas sin el número anotado; anotarlo en las dos para que se cobren |
| 16 | María José o Alex Arrieta | Cobranza › Honda, septiembre: la cuota apunta a la FAC/2026/0347, que Odoo anuló; cambiarla a la 0348 |
| 17 | María José o Alex Arrieta | Ferretería Noelito INV-60: pagada en Mercury sin una entrada de plata con su fecha; confirmar el día del pago a mano |
| 18 | Todo el equipo | Toda reunión con un cliente o un prospecto por Google Meet, convocada por alguien de Smarteam (si la convoca el cliente, las notas quedan en su Drive y Nexus no las lee), con «Transcribir» y las notas de Gemini activadas. Una reunión presencial: grabarla y subirla. En 90 días, 643 reuniones con clientes quedaron sin transcripción, y unas 430 por esto |


## Hecho

Lo que ya está en producción, por tema. Cada tarjeta se abre para ver el detalle; las pruebas que ya validaste están al final.

### Para ti y la agenda <span class="estado">En producción</span>

1. [hecho] Un inicio por equipo: Ventas (meta, negocios y cartera), Customer Success (sus cuentas), la CSL (toda la cartera), Desarrollo y Marketing (sus tareas).
2. [hecho] «Lo que importa hoy» del CSE y la CSL en tres bloques: reuniones de los próximos días, cuentas sin siguiente paso y pendientes sin seguimiento. A la CSL le llega primero la limpieza de HubSpot que deja cuentas sin dueño.
3. [hecho] Una reunión agendada cuenta como el siguiente paso, también para Ventas.
4. [hecho] La agenda es la de Google Calendar: todos los eventos, lado a lado si se pisan, de lunes a viernes, sin abrir nada solo.
5. [hecho] Crear eventos y «Agendar» desde la agenda, con el borrador en Nexus antes de abrir Calendar; sugerencias del tamaño de cada tarea que respetan el almuerzo.
6. [hecho] Un evento propio o una reunión interna que nombra una cuenta se abre en el panel con lo de esa cuenta.
7. [hecho] La meta de HubSpot de cada vendedor, copiada cada hora, y el aviso cuando no hay meta.
8. [hecho] Lo que sale de una reunión le llega a quien le toca: lo de venta o negociación al dueño del negocio, y el aviso de las 48 horas a quien se le propuso, no a quien lleva la cuenta.
9. [hecho] Los menús de la barra lateral (el del avatar y los desplegables) se abren siempre encima del contenido, en todas las pantallas y temas.
10. [hecho] «Preparar» abre el panel de la reunión en la agenda, con la guía, la búsqueda en las reuniones y los pendientes que se marcan hechos, se desestiman o se agendan ahí mismo.
11. [hecho] «Ya la agendé» en una cuenta sin siguiente paso: se elige la reunión del calendario y Nexus la verifica; cuenta como siguiente paso hasta 30 días.
12. [hecho] Las tareas nuevas de las reuniones llegan en una sola línea a Tareas, y el espacio libre nombra cada tarea «Cliente – nombre corto».
13. [hecho] Las alertas del vigía ya no saltan encima de la pantalla: siguen en Éxito del cliente y en «Para ti» de la CSL.
14. [hecho] La agenda muestra solo de 8:00 a 17:00, con «Ver el calendario completo».
15. [hecho] La guía de una reunión sin otra fuente toma el tema del título de la invitación.

### Tareas <span class="estado">En producción</span>

1. [hecho] En la ficha de cada cliente, todas las tareas de Smarteam con esa cuenta, por equipo.
2. [hecho] Cada equipo configura su sprint; de su reunión salen hasta 5 tareas por persona, y lo que el tope deja afuera se recupera con «Proponérmelas».
3. [hecho] De las reuniones y los correos con clientes salen como mucho 3 tareas esenciales por persona («Enviar el reporte a CEMACO»), y lo descartado no vuelve.
4. [hecho] Un seguimiento por reunión y cuenta para lo que prometió el cliente; lo rápido plegado por cuenta; Nexus sugiere cerrar lo viejo.
5. [hecho] Marcar hecha y deshacer al instante; el panel de la tarea dice si guardó.
6. [hecho] «Planifica tu semana», de viernes a domingo.
7. [hecho] Las propuestas se deciden solo en Tareas, con «Usar las N» por reunión; la página de la sesión las muestra para leer.
8. [hecho] El nombre corto de cada tarea lo escribe la IA cada 10 minutos (job «titulos-cortos»).
9. [hecho] Una propuesta de tarea abre corta, con «Descartar», «Más adelante» y «Usar» abajo; el cajón se titula con el nombre de la tarea.

### Preventa y exploración <span class="estado">En producción</span>

1. [hecho] La guía lleva a la siguiente pregunta lógica: «Lo que ya sabemos», unas 5 preguntas cortas con su ⓘ y el cierre con lo que falta para proponer.
2. [hecho] Regenerar, editar, borrar y agregar preguntas, y el asistente que las mejora con un clic.
3. [hecho] La exploración de los proyectos de clientes con lo mismo, sobre la estrategia del cliente y lo vendido.
4. [hecho] El correo de seguimiento y la próxima reunión sugerida después de cada sesión.
5. [hecho] En la guía de una sesión (proyecto y preventa): el objetivo propone unas tres preguntas para usar o descartar, las preguntas se arrastran y la pantalla se pone al día sola cuando el asistente las cambia.
6. [hecho] El asistente y el agente de la guía leen todas las sesiones de la exploración (lo respondido, lo acordado para la próxima), el kickoff y la memoria del proyecto; en la preventa, lo de HubSpot.
7. [hecho] Cada sesión tiene su equipo del cliente (Dirección, Ventas, Marketing, Servicio al cliente, Operaciones o Tecnología) y la guía es la de ese equipo, con lo técnico y de proceso; la sesión dura una hora con «Contarle»; lo ya respondido no se repite; el panel de la derecha dice la verdad, con «Por equipo» (23 oct).

### La cuenta: encargado, proyectos y ficha <span class="estado">En producción</span>

1. [hecho] «Quién lleva la cuenta» sale de una sola regla; el CSE se cambia desde la ficha, Éxito del cliente y la cartera de la CSL, y queda.
2. [hecho] El pase de cuenta mueve lo abierto al encargado nuevo, también cuando cambia en HubSpot.
3. [hecho] Con varios proyectos, cada quien abre en el suyo, con el aviso «Esta cuenta tiene otro proyecto».
4. [hecho] Los proyectos fusionados en HubSpot se dan de baja solos; Cemaco, Total Finco y Librería Internacional quedaron en una sola ficha.
5. [hecho] El riel separa herramientas y entregables; los documentos tienen plantillas.

### SmartLoop y el servicio recurrente <span class="estado">En producción</span>

1. [hecho] Un catálogo de servicios recurrentes con su cadencia y sus rutinas; la guía del servicio en el Resumen y SmartLoop como ciclo.
2. [hecho] El cronograma del ciclo, el aprendizaje y el cierre, y la ruta del servicio para el cliente.
3. [hecho] Pasar un proyecto a recurrente desde la ficha, y la recomendación de SmartLoop al llegar a la entrega.

### Propuestas y comisiones <span class="estado">En producción</span>

1. [hecho] Proyecto o servicio recurrente al crear la propuesta; la plantilla recurrente con lo que se vendía a mano.
2. [hecho] Licencias aparte, con su precio de lista y su margen, que el cliente no ve; lo vendido llega a Finanzas.
3. [hecho] Módulos nativos (casos de uso, licencias, fases) y una biblioteca de módulos con «Adaptar a esta empresa».
4. [hecho] «+ IVA» o «IVA incluido» para Costa Rica.
5. [hecho] La propuesta de comisiones que cuida el valor de la cuenta, con su simulación, y la aprobación de descuentos de más del 10 %.
6. [hecho] El modelo de comisiones cerrado con Marco: sin el factor 1,2, el descuento contra la primera propuesta, el bono de liderazgo por persona, ventas que se caen en 90 días, renovaciones, venta compartida, techos (solo Super Admin) y quién ve qué.

### Finanzas <span class="estado">En producción</span>

1. [hecho] Lo pagado y conciliado en Odoo y Mercury se cobra solo cada mañana.
2. [hecho] El menú simplificado, Conciliación en una sola fila y el punto de equilibrio con solo lo del año.
3. [hecho] Licencias revendidas, gastos financieros y el detalle de cada factura.
4. [hecho] Las comisiones de partners aceptan cero y dicen si el monto es estimado o el real de la factura del aliado.
5. [hecho] «Actualizar» trae Odoo y Mercury y cobra lo pagado en el momento; las copias y el cobro corren cada hora de 7:00 a 19:00.
6. [hecho] Una cuota cargada con IVA que tiene el número de su factura queda unida a ella y espera en «Lo pagado».

### Éxito del cliente y rentabilidad <span class="estado">En producción</span>

1. [hecho] «Seguimiento de cuentas»: próxima sesión, siguiente paso y temas por cuenta; el CSE entra solo a esta página.
2. [hecho] Las propuestas del vigía se deciden en un solo lugar y dicen de qué a qué.
3. [hecho] La lista de limpieza de HubSpot, los exclientes fuera de todo y la cartera por proyectos.
4. [hecho] El margen por cuenta y por persona con las horas del calendario y las tareas, la meta del año y la lectura de los números.

### Diagnóstico <span class="estado">En producción</span>

1. [hecho] El diagnóstico lee enteras las sesiones de la exploración y lo que propuso Nexus, marcado como supuesto; avisa y pide confirmación cuando casi nada está confirmado (23 oct).
2. [hecho] «Política rectora» pasa a «Enfoque de la solución», con su marca de revisión arriba a la derecha que el cliente no ve (23 oct).
3. [hecho] El subtítulo, la intro y el cuerpo de cada sección se mueven y se quitan, y todas las secciones se pueden ocultar; un diseño más liviano, igual en la vista del cliente y en el PDF (23 oct).
4. [hecho] Dos plantillas, esencial (7 partes, la recomendada) y completa (la de siempre), o «Escribirlo yo» en blanco (23 oct).

### Kickoff y cronograma <span class="estado">En producción</span>

1. [hecho] La fecha de arranque del kickoff se elige en un calendario (propone la reunión de kickoff) y ya no deja años como 0026 o 1926; el servidor rechaza fechas fuera de 2000–2100.
2. [hecho] La fila de datos de la portada se edita como las etiquetas (agregar, quitar, reordenar, editar texto y etiqueta), alineada al editar y al presentar.
3. [hecho] Una sección oculta queda oculta aunque no se publique, y el cliente y el PDF ven lo mismo que por dentro.
4. [hecho] El chat del cronograma lee la memoria del proyecto: sabe lo que se habló con el cliente aunque nadie haya elegido reuniones.
5. [hecho] El calendario de la fecha de arranque se abre encima de la sección siguiente.

### Reuniones, memoria y la escala <span class="estado">En producción</span>

1. [hecho] Cada reunión se lee una vez y queda como memoria de la cuenta; los correos, notas y llamadas de HubSpot también entran.
2. [hecho] Cada reunión con su página, sus tareas y su correo de seguimiento.
3. [hecho] La escala con ediciones por industria (Turismo y Automotriz nuevas), «Actualizar escala» con todo el contexto y la historia amarrada a la venta.
4. [hecho] El chat de Nexus sobre la cuenta, con sugerencias y documentos con plantilla.
5. [hecho] El gasto de la IA por mes, con su proyección, el tope que frena y la factura.

### Pruebas que ya validaste

#### Para ti y la agenda

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 1 | ✓ Validado 17 oct | Que cada persona vea su propio inicio | Con «Ver como» Andrés, abre «Para ti»; después repite con un CSE. | Arriba, los números del día; al centro, la agenda como Google Calendar; a la derecha, «Tu cartera» (Andrés) o «Tus cuentas» (el CSE). |
| 2 | ✓ Validado 19 oct | Que las notas de una reunión no se pierdan y sean privadas | Con tu usuario, en «Para ti» › «Tu día», toca en la agenda una reunión tuya con un cliente de hoy y otra que ya pasó. Escribe algo en «Tus notas» y espera «Guardado». Cierra el panel y vuelve a abrirlo. Después, con «Ver como» Liliana Moreno, abre en su agenda una reunión de ella con un cliente. | En las dos aparece «Tus notas» y la nota sigue ahí al volver. Con «Ver como» Liliana, el panel trae su guía y lo pendiente; en lugar de las notas dice «Las notas son de cada persona: mientras ves Nexus como otra persona no se ven ni se escriben.» |
| 3 | ✓ Validado 17 oct | Que una cuenta sin acción ni reunión aparezca | Con «Ver como» un CSE que tenga una cuenta sin tarea esta semana, mira la primera tarjeta de «Para ti». | La línea «Sin acción ni reunión» con esa cuenta y el botón «Agendar». |
| 4 | ✓ Validado 17 oct | Que Marketing vea sus tareas internas | Con «Ver como» alguien de Marketing, abre «Para ti». | Sus tareas internas, ordenadas por ámbito (Smarteam, SmartAgro). |
| 5 | ✓ Validado 17 oct | Que «Lo que importa hoy» tenga como mucho 5 cosas | Abre «Para ti» con tu usuario y mira la primera tarjeta. Si una cuenta tiene varias cosas, abre su «+N». | Como mucho 5 cosas, una por cuenta. Lo demás de esa cuenta queda plegado en «+N en esta cuenta», y lo que no entra va a «También para hoy». |
| 6 | ✓ Validado 17 oct | Que se pueda crear un evento desde la agenda | Toca una hora vacía de hoy (por ejemplo, las 10). Escribe un título, busca un contacto por su nombre o su empresa, elígelo y toca «Abrir en Google Calendar». | Aparece un bloque azul «borrador» de una hora. Al elegir el contacto, la cuenta se llena sola. Google Calendar se abre con el título, la hora, el invitado y el enlace a la cuenta en la descripción. El bloque queda «abierto en Calendar, sin guardar», con «Ya lo guardé». |
| 10 | ✓ Validado 17 oct | Que el CSE tenga su cartera, armada con sus proyectos | Con «Ver como» un CSE, toca «Tu cartera». Prueba «Todos los proyectos», el buscador y una cuenta que le compartieron. | Sus empresas en «Para atender», cada una con el nombre grande, sus proyectos y su etapa, el último contacto, la próxima reunión y la acción de la semana (✓ u ○). Una compartida dice «Compartida», sin color ni monto. |
| 11 | ✓ Validado 17 oct | Que Alex vea toda la cartera de Customer Success, y no la de Ventas | Con «Ver como» Alex, abre «Para ti» › «La cartera». Abre «Por CSE»; después filtra «Pipeline» › Desarrollo. | No aparece la cartera de Ventas ni «Negocios traídos de HubSpot». «Por CSE» trae un bloque por CSE, en orden alfabético, con sus cuentas en riesgo, sin acción y sin contacto, y «Sin CSE» al final. Con el filtro, solo las empresas con un proyecto de desarrollo. |
| 12 | ✓ Validado 18 oct | Que el monto solo lo vea quien vende | Con «Ver como» Andrés, abre «Para ti» › «Tu cartera» y busca una empresa con un negocio abierto. Después, con «Ver como» un CSE que lleve esa empresa, mírala en su cartera. | Andrés ve «N negocios abiertos · US$ …» en la fila. El CSE ve la misma empresa sin el monto. (Con tu usuario no hay cartera: la tienen quienes venden y quienes llevan cuentas.) |
| 49 | ✓ Validado 19 oct | Que el CSE planifique la acción desde su cartera y vea el uso de HubSpot | Con «Ver como» Juan Carlos Armijos, «Para ti» › «Tu cartera» › vista «Para atender». En «ALFA+ (LISJ)» toca «Planificar acción». No lo guardes en Calendar. | Cada cuenta dice «Uso de HubSpot N de 100» con «↑ sube», «↓ baja» o «→ igual» (ALFA+: 55, baja); una cuenta sin relación gestionada lo dice con la fecha. Al tocar «Planificar acción» pasas a «Tu día», con un borrador en la agenda y su cuadro abierto («Reunión con ALFA+ (LISJ)», la hora, la cuenta y el contacto) y «Abrir en Google Calendar» y «Descartar». |
| 145 | ✓ Validado 19 oct | Que Liz vea su meta | «Ver como» Liz Navarro › «Para ti». | La tarjeta «Tu meta 2026» con «0 %» y «US$0 de 30K». En «Tu cartera», la primera tarjeta es «Tu meta 2026» con «0 % según HubSpot». |
| 150 | ✓ Validado 19 oct | Que un evento propio se abra en el panel | «Ver como» Andrés Pinzón › «Para ti» › semana del 19 al 23 oct › toca «Tenis». | El panel de la derecha con «Tenis», el día y la hora, «Evento tuyo, sin otros invitados» y «Abrir en Google Calendar» como enlace. No se abre otra pestaña. |
| 152 | ✓ Validado 19 oct | Que un evento personal no se asigne a un cliente | La misma agenda › toca «Cita Médica». | Solo el título, la hora y el enlace a Calendar, sin cuenta. |
| 153 | ✓ Validado 19 oct | Que las notas de un evento propio queden | Tu agenda, sin «Ver como» › un evento tuyo › escribe en «Tus notas» y vuelve a abrirlo. | Dice «Guardado» y la nota sigue ahí. |
| 8 | ✓ Validado 20 oct | Que los espacios libres sugieran con qué usarlos | En la agenda (semana), toca un «Espacio libre» punteado de hoy o de un día que viene. Toca «Usar» en una sugerencia. Después toca una hora vacía y mira «Evento nuevo». Toca afuera o la X. | La agenda es de lunes a viernes (un sábado o domingo muestra la semana que viene) y de 8 a 5. El panel dice «Espacio libre» y «Con qué usar este espacio»: tus tareas que caben, «Reunión con…» de una cuenta sin reunión y el siguiente paso. «Usar» deja el borrador lleno en esa hora. Una hora vacía trae las mismas sugerencias, y la usada dice «✓ Usando». Tocar afuera o la X lo suelta. |
| 78 | ✓ Validado 20 oct | Que avise de lo prometido sin tomar, y no de lo ya agendado ni de lo interno | Con «Ver como» Andrés Pinzón, abre «Para ti». Después, con «Ver como» Caroline Bersot. | A Andrés: «Universidad Monterrey: un compromiso en una reunión lleva N días sin que nadie lo tome» y lo mismo de Tecnosagot. Accesos Automáticos no avisa: la demo del 21 oct ya está en su calendario. A Caroline: los compromisos de Honda Costa Rica sin tomar. No avisan una reunión interna ni una mención de «la sesión» (T-103 de Seléctrica). |
| 80 | ⏳ La valida el equipo | Que el aviso se vaya al resolverlo | Juan Carlos Armijos, con su usuario (con «Ver como» no se puede usar una tarea): en «Para ti», «Metzger Supplies: un compromiso … sin que nadie lo tome» › «Tomarlo o decidir», y en la tarea toca «Usar». | La línea de Metzger ya no aparece en su «Para ti», ni en el de Alex. (La regla «si alguien la tomó, no avisa» está probada.) |
| 120 | ✓ Validado 20 oct | Que no se abra ninguna reunión sola | «Ver como» Andrés Pinzón › «Para ti». | No se abre ningún panel a la derecha hasta que tocas un evento o un espacio. |
| 124 | ✓ Validado 20 oct | Que las sugerencias sean del tamaño de la tarea y respeten el almuerzo | La misma semana: un bloque azul «Avanza T-…»; después mira de 12:00 a 13:00 cualquier día. | El bloque dice «Sugerido 13:00–14:00» (el tamaño de la tarea), nunca un espacio de varias horas. De 12:00 a 13:00 no hay sugerencias (Andrés no tiene almuerzo marcado). |
| 129 | ✓ Validado 20 oct | Que lo opcional o «quizás» se vea más claro | Con alguien que tenga un evento con «quizás» u opcional, en su agenda. | Ese evento se ve más claro y al pasar el mouse dice que igual ocupa su tiempo. |
| 148 | ✓ Validado 20 oct | Que las metas de antes sigan igual | «Ver como» Andrés Pinzón y Marco Salas › «Para ti». | «Tu meta 2026» con su avance: Andrés unos US$220K de 335K, Marco unos US$301K de 400K. |
| 151 | ✓ Validado 20 oct | Que una reunión interna que nombra una cuenta la muestre | «Ver como» Andrés Pinzón › «Para ti» › agenda › mié 21 › «Preparar demo para Accesos Automáticos» (9:00–10:00). Después «Andrés: rol, metas y esquema de comisiones». | Debajo del título, «Interna · Accesos Automáticos · prospecto», con «Unirse a Meet», «Abrir en Calendar» e «Ir a la cuenta», y más abajo «La próxima reunión», «El siguiente paso», «Pendiente», «La última vez» y «El negocio». La otra sigue «Interna», sin cuenta. |
| 182 | ✓ Validado 20 oct | Que el CSE vea las cuentas sin siguiente paso | «Ver como» Juan Carlos Armijos › «Para ti» › «Cuentas sin siguiente paso» › «Ver las 13 en la cartera». | 3 cuentas con «Agendar», «se ven 3 de 13…» y el enlace; sin «Estabilizar». La cartera abre en «Sin siguiente paso» y las cuentas con reunión dicen «✓ Siguiente paso: reunión …». |
| 187 | ✓ Validado 20 oct | Que «Sugerencias» no pida el paso si hay reunión | Ficha de Cemaco › chat de Nexus › «Sugerencias». | No aparece «Fija el siguiente paso de Customer Success con …». |
| 230 | ✓ Validado 20 oct | Que sin meta la tarjeta lo diga | «Ver como» Alexander Arrieta › «Para ti» y «Tu cartera». | La tarjeta «Tu meta 2026» con «—» y «Aún no tienes una meta configurada.» |
| 264 | ✓ Validado 20 oct | Que «Preparar» abra el panel de la reunión | Con «Ver como» Caroline Bersot › «Para ti» › «Lo que importa hoy» › en «Reuniones con tus cuentas», «Preparar» en una. | Se abre el panel a la derecha, sin cambiar de página, con la guía de la reunión, quién viene, «Pendiente» y «Buscar en las reuniones». Si la reunión es de otro día, la agenda va a ese día. |
| 267 | ✓ Validado 20 oct | Que las tareas nuevas lleguen en una sola línea | Con «Ver como» Caroline Bersot › «Para ti». | Una línea «Tienes tareas nuevas de las reuniones con …» con «Revisar en Tareas», que lleva a Tareas. Ningún botón de «Para ti» lleva a la página de una sesión para decidir; «Tomarlo o decidir» abre la tarea. |

#### Kickoff y cronograma

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 242 | ✓ Validado 20 oct | Que la fila de datos se edite como las etiquetas | La portada › «+ Dato»: escribe «3 integraciones» con la etiqueta «Alcance»; quita «Hoja de ruta» con la ×; arrastra el dato nuevo al primer lugar; recarga. | La fila queda en ese orden, también después de recargar. |
| 244 | ✓ Validado 20 oct | Que la portada se vea alineada | La portada, al editar y al presentar. | «+ Tag» en la misma línea que la última etiqueta y «+ Dato» al final de la fila de datos; todos los datos del mismo alto. |
| 245 | ✓ Validado 20 oct | Que una sección oculta siga oculta sin subir | Cualquier sección del kickoff › el ojo › ocultarla. No subas; recarga la página (y al día siguiente, otra vez). | Sigue oculta. |
| 246 | ✓ Validado 20 oct | Que el cliente vea lo mismo que por dentro | «Subir al cliente» y abre el enlace del cliente; después «Exportar PDF». | La portada con la fecha de arranque y los mismos datos que por dentro, en el enlace y en el PDF. |
| 241 | ✓ Validado 20 oct | Que la fecha de arranque se elija en un calendario | Clientes › Cayalá › «Cayalá - WhatsApp Nativo» › Kickoff › en la portada, clic en «26 oct 2026». Elige el 2 de noviembre y después vuelve al 26 de octubre. | Se abre un calendario en octubre de 2026, sin un campo encimado, y la fila no se mueve. La portada y el Gantt dicen la fecha elegida, sin años raros. (Arreglado el 20 oct: el calendario quedaba debajo de la sección siguiente.) |

#### Preventa y exploración

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 68 | ✓ Validado 18 oct | Que la guía arranque con lo que el cliente ya dijo | Ventas › Preventa › Distribuidora Larce › Exploración › la próxima sesión (si no hay: «+ Agregar sesión» › una sin reunión todavía) › Preparación. | Arriba de «La guía», «Lo que ya sabemos» con 5 líneas en palabras del cliente. La primera: «Cuando un deal se enfría no hay red de contención…», con «Nota del 15 oct» al lado. |
| 69 | ✓ Validado 18 oct | Que las preguntas sean cortas, con su fuente en un ⓘ | Larce › Exploración › la próxima sesión › Preparación › «La guía» › «Preguntar». Pasa el mouse por el ⓘ de una pregunta. | Cada pregunta es solo la pregunta, corta, sin «Dijiste que…» ni «En el diagnóstico dijeron…». El ⓘ muestra lo que dijo el cliente, con sus palabras, y de dónde sale. «Lo que ya sabemos» sigue con las palabras del cliente. |
| 70 | ✓ Validado 18 oct | Que la guía nueva lleve a la siguiente pregunta lógica | El aviso de arriba › «Actualizar la guía». Espera unos segundos. | 5 preguntas que nombran lo que dijo el cliente y preguntan cuánto le costó, cómo lo quiere resolver o con qué. Ninguna de «Para cuándo», porque ya se sabe. |
| 71 | ✓ Validado 19 oct | Que las repreguntas se mejoren con el asistente | En la guía › «Mejorar con el asistente» › escribe: «Mejora las repreguntas de la pregunta 2 para que bajen a números» › Aplicar. | El chat de la cuenta abre con la guía en foco y propone las repreguntas nuevas en una lista; al aplicar, la pregunta 2 trae esas repreguntas. |
| 72 | ✓ Validado 18 oct | Que siempre cierre | Baja a «Cerrar», al final de la guía. | La pregunta de cierre, el siguiente paso con fecha y lo que falta para proponer, sin espacios por completar. |
| 73 | ✓ Validado 18 oct | Que lo que cubre la guía vaya pegado a ella | Larce › Preparación, arriba de «Retos de su industria». Después quita una pregunta. | «Lo que cubre la guía»: los siete puntos para proponer (verde listo, azul lo cubre la guía, punteado no) y las dimensiones que pregunta. Al quitar la pregunta, cambia al instante. En el panel derecho queda solo «N de 7 listos». |
| 74 | ✓ Validado 18 oct | Que funcione igual en otras preventas | Ventas › Preventa › CreditForce (o Cicadex) › Exploración › Preparación › «Actualizar la guía». | «Lo que ya sabemos» con frases del test y 4 o 5 preguntas que parten de ahí. (Lo validé yo, en seco: CreditForce pasó de 7 a 4 preguntas y Cicadex de 7 a 5, y Cicadex ya no pregunta «para cuándo» porque ya se sabía.) |
| 105 | ✓ Validado 19 oct | Que se puedan agregar preguntas a mano | En la guía › «+ Agregar pregunta»: escribe una, guárdala, edítala. Después toca «Actualizar la guía». | La pregunta aparece al final marcada «Tuya» y sigue ahí después de actualizar la guía. Se puede quitar. |
| 106 | ✓ Validado 19 oct | Que el asistente arme la guía con lo que pides | En la guía › «Mejorar con el asistente» › «Agrega dos preguntas de la escala sobre cómo miden el pipeline» › Aplicar. | La caja dice «2 cambios para aplicar», sin repetir la lista en el texto, y responde en unos segundos. Al aplicar: «Listo: …», dos preguntas nuevas, cortas, marcadas «Del asistente», y «Lo que cubre la guía» suma esas dimensiones. Ninguna repite lo que ya dijo el cliente. |
| 107 | ✓ Validado 19 oct | Que el asistente no invente lo interno | En el mismo chat: «Agrega una pregunta sobre el presupuesto que nos dijeron». | No pone montos ni lo interno como si lo hubiera dicho el cliente: pregunta el rango o contra qué lo comparan. (Validada el 18 oct; el chat cambió después.) |

#### SmartLoop y el servicio recurrente

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 44 | ✓ Validado 17 oct | Que el paso de «Continuidad» a SmartLoop encuentre los proyectos | `npx tsx scripts/migrar-continuidad-a-smartloop.ts` (lo corrí yo, en simulacro) | Ministerio de Economía y TEC, los dos en Diagnóstico, a confirmar con Customer Success. No escribe nada. |

#### Finanzas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 96 | ✓ Validado 18 oct | Que el menú quede en lo que usas | Menú › Finanzas. | No están Pendientes, Comisiones de vendedor, Aguinaldo, Rentabilidad, Tipo de cambio ni Integraciones. Sí: Planilla, Conciliación, Punto de equilibrio, Caja neta, Reportes de cobranza y Comisiones. |
| 97 | ✓ Validado 19 oct | Que Odoo y Mercury estén dentro de Conciliación | Finanzas › Conciliación. Debajo del botón «Actualizar desde Odoo y Mercury» toca «Odoo», vuelve, y después «Mercury» e «Integraciones». | Una sola fila de pestañas: «Lo que no cuadra · Lo pagado · Emparejar · Libro de Alex · Gastos y Mercury». Debajo del botón: «Odoo: copia del … · Mercury: copia del … · Integraciones». Cada página abre con «‹ Conciliación» arriba del título, que te devuelve. El menú sigue marcando Conciliación. |
| 99 | ✓ Validado 18 oct | Que el tipo de cambio esté dentro del punto de equilibrio | Punto de equilibrio › arriba a la derecha › «Tipo de cambio». | La página del tipo de cambio con «← Punto de equilibrio» para volver. |
| 101 | ✓ Validado 18 oct | Que las hojas viejas de Costos lleven a la nueva | Escribe `/finanzas/costos` en la barra de direcciones; después `/finanzas/costos/tarjetas`. | Te lleva a Recurrentes, y la segunda a Tarjetas. |
| 102 | ✓ Validado 18 oct | Que «Volver» no lleve a una hoja vieja | Planilla › Comisiones de vendedor › «Volver». | Vuelve a la Planilla. |

#### Rentabilidad, la meta y el uso

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 43 | ✓ Validado 17 oct | Que la foto de los meses pasados se pueda armar | `npx tsx scripts/fotografiar-meses-del-margen.ts` (lo corrí yo, en simulacro) | Nueve meses, de enero a septiembre, cada uno con lo cobrado y facturado, la planilla y las horas, y «Simulacro: no se escribió nada». |

## Cómo funciona Nexus

En pocas palabras, para ubicarse. El detalle está en la Documentación de Nexus y en `docs/DECISIONS.md`.

- **Los objetos de una empresa, en un plano:** https://claude.ai/artifact/Dv1surKwZBcYoLrqCLwaHS (lo que Nexus sabe de un cliente o un prospecto y cómo se une).
- **La cuenta es el centro.** Todo lo que Smarteam hace con un cliente cuelga de su ficha: proyectos, reuniones, tareas, la escala, las propuestas, lo que se cobra.
- **Cada reunión se lee una vez** y deja su minuta, sus tareas propuestas y sus hechos; eso es la memoria de la cuenta, que leen los agentes, la preventa, el chat y los documentos. Los correos y notas de HubSpot entran igual.
- **El siguiente paso de una cuenta** es su próxima tarea con fecha o su próxima reunión agendada. Sin eso, la cuenta aparece en «Para ti» de quien la lleva.
- **Quién lleva la cuenta** sale de HubSpot («CSE Encargado») y de una sola regla en Nexus; de ahí salen las alertas, «Para ti», las carteras y las tareas.
- **«Para ti»** es lo primero que ve cada persona: lo que importa hoy, su agenda (la de Google Calendar) y su cartera.
- **Nexus propone y una persona decide.** Lo que propone la IA (tareas, niveles de la escala, campos de la ficha) espera un «Usar» o un «Descartar»; lo descartado no vuelve.
- **La escala** dice dónde está cada cliente y qué lo mueve: Ventas la usa para vender y Customer Success para planear cada ciclo.
- **Nada escribe solo en HubSpot, Google Calendar u Odoo** sin una persona, salvo el cobro de lo ya pagado y conciliado.

**Cómo se construye:** lo que cambia seguido es configuración y no código; una sola puerta por cosa; nada corre solo ni para todos; SQL solo aditivo, antes del deploy; cada regla es una función pura con su prueba; cada agente nuevo se mide desde el primer día; sin sobreingeniería.

## Cómo se mantiene este roadmap

1. **Lo edita una sola sesión: la que junta las ramas en `main`.** Las demás terminan con un bloque «Para el roadmap» y la que junta lo copia.
2. **El roadmap tiene solo lo que falta.** Lo que llega a producción pasa a «Hecho», por tema, en el mismo commit en que se despliega.
3. **Una prueba entra cuando su código está en `main`**, con el camino exacto, el cliente o la persona y un resultado que se ve en la pantalla.
4. **Antes de pedirte una prueba, la compruebo yo** con los datos de producción. Lo que se comprueba sin pantalla va a «Pruebas con IA». A ti te llegan solo las que piden tu criterio de producto; lo de pantalla de todos los días lo valida quien lo usa (Elías, 20 oct: «no tengo tanto tiempo»).
5. **Cuando algo validado cambia, vuelve a «↻ Validar otra vez».** Los números de prueba no se reusan.
6. **Cada vez que se junta algo:** `/revisar` sobre lo que se junta, tsc en 0, la suite en verde, «Estado hoy» al día y la vista publicada en la misma dirección (`node scripts/roadmap-vista.mjs` y el artefacto).
7. **El Resumen sale del bloque `temas`** (27 oct, pedido de Elías: entender en un minuto cómo va cada tema y qué necesita de él). Lo de arriba es lo que le toca; después, lo que está en marcha, lo que falta arrancar y, en segundo plano, lo que ya funciona. Se regenera con la skill `regenerar-roadmap` cuando Elías dice «regenera el roadmap» o después de cada deploy, y `scripts/roadmap-vista.mjs` no arma la vista si el bloque no cuadra con «Lo que decides tú».
8. **Cuando el roadmap cambia mucho, o antes de una tanda grande, se revisa con el workflow `revision-roadmap`** (`.claude/workflows/revision-roadmap.js`): ocho lentes (orden, verdad contra el código, división, criterios de éxito, ingeniería, coherencia, lo que falta y que se lea fácil), un escéptico por lente y una síntesis con la lista de cambios y las preguntas para ti. La primera pasada fue el 24 oct: 230 propuestas, 206 en pie.
