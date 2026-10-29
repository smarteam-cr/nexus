# Position statement de Smarteam (K3 y pregunta 12 del roadmap)

Pedido de Elías del 28 oct: el position statement base lo escribe él; Nexus lo guarda en **Marketing › Audiencia**, la
preventa lo personaliza con dos o tres hechos de cada empresa y lo que arma se **valida contra la base**.

## Lo que ya había

- `PerfilDeLaEmpresa.positionStatement` (R13): un texto libre, vacío en producción (medido el 28 oct), editable en la
  ficha de Smarteam. Lo leen la presentación de la primera sesión en frío (`lib/exploraciones/como-llego.ts`), la guía
  (`textoParaLaPreventa`) y el criterio del analizador de la venta.
- Audiencia (`/marketing/icp` y `/marketing/personas`) guarda en tablas propias (`IcpItem`, `BuyerPersona`) que cuelgan de
  la ficha de Smarteam, y se lee por un solo lector: `lib/smarteam/contexto.ts`.
- La preparación de la preventa (`lib/exploraciones/agente.ts`, modo `preparar`) usa la investigación vigente de la
  empresa (`InvestigacionDeEmpresa`, con contrataciones) o, si no hay, hace su propia radiografía (sitio, noticias,
  industria; **sin contrataciones**).

## Cómo queda

1. **Los datos.** La frase sigue en `positionStatement`; los tres frentes van en una columna nueva
   `PerfilDeLaEmpresa.frentes` (Json): por frente, nombre, herramienta, promesa, «qué logra» (título y detalle),
   «cuándo cabe» (condiciones) y una nota. SQL aditivo y repetible: `scripts/sql/2026-10-28-position-statement.sql`.
   Un solo escritor (`lib/smarteam/perfil-server.ts`) y un solo lector (`lib/smarteam/contexto.ts`).
2. **Audiencia.** Pestaña nueva «Position statement» (`/marketing/posicionamiento`): se ve y la edita quien tiene
   `marketing.write`. Un frente sin «qué logra» ni «cuándo cabe» se ve como pendiente (hoy, Acompañamiento). La ficha de
   Smarteam lo muestra sin editar y enlaza a Audiencia: un solo lugar para escribirlo.
3. **La carga.** `scripts/cargar-position-statement.ts` (simulacro por defecto, `--apply` con `ALLOW_PROD_WRITE=1`)
   escribe el texto de Elías tal cual.
4. **La preventa lo usa.** Al preparar (solo la preventa), después de la investigación, una llamada corta arma el
   position statement del prospecto: la frase de la base, palabra por palabra, más dos o tres hechos de la empresa
   elegidos de una lista que arma Nexus (los datos de la empresa que dicen en qué frente cabe —a quién vende, cómo
   cierra, su tráfico, su base con consentimiento—, el resumen, el sector, las noticias, las contrataciones y su
   industria), cada uno con su fuente; y el frente que calza, con la razón condición por condición. Se guarda en
   `propuesta.posicionamiento` de la exploración (Json, sin SQL) y se ve en Preparación › Conexión y en «Abrir la
   puerta». La guía de la primera sesión lo lee en su bloque SMARTEAM.
5. **La validación** (`lib/exploraciones/posicionamiento.ts`, puro, con pruebas):
   - el agente no escribe la promesa: elige por número qué «logra» y qué condición mira; lo que se muestra sale de la
     base. Un número que la base no tiene se descarta;
   - un hecho es uno de la lista de Nexus (con su fuente); uno inventado se descarta;
   - una condición «se cumple» o «a medias» sin un hecho que la respalde baja a «sin dato»;
   - una razón o un «ningún frente calza» que promete (garantiza, duplica, «veces más», un futuro como «venderán», o una
     cifra que no está entera en la base ni en los hechos) se cambia por uno armado por Nexus;
   - el frente: **calza** si cumple todas; **a medias** si cumple alguna y no fallan más de las que cumple (el empate,
     una que se cumple y una que no, va a medias), y lo dice: lo que falta confirmar y lo que ya se sabe que no se
     cumple, por separado; **no se propone** si no cumple ninguna o fallan más de las que cumple. «Se cumple» y «a
     medias» necesitan un hecho; «no se cumple» se respeta sin él;
   - un frente sin condiciones escritas (Acompañamiento hoy) no se puede proponer por calce.
6. **Contrataciones.** La radiografía de la preventa busca también los puestos que la empresa está contratando
   (LinkedIn, su sitio, bolsas de empleo), con la misma regla del enlace: uno que no salió en una búsqueda se descarta.
   Una búsqueda más (4 → 5, como la investigación de la empresa). Entran como hechos al position statement, a la fuente
   W1 y a la investigación que se guarda en la empresa.

## Fuera de esto

- El detalle de Acompañamiento lo escribe Elías (queda a la vista como pendiente).
- El criterio del analizador de la venta sigue leyendo la frase; los frentes no le cambian el juicio.
