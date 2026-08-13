/**
 * lib/landing/consejos-embed.ts — el brief que Nexus le pasa al Claude Code del vendedor.
 *
 * Ventas arma el HTML de una sección personalizada APARTE, con su propio agente de código, y
 * después lo pega acá. Ese agente no tiene forma de saber en qué caja va a correr: iframe con
 * origen opaco, sin red, con alto fijo y adentro de un documento que ya tiene encabezado y
 * marca. Y casi todo lo que este entorno bloquea falla EN SILENCIO —caja vacía, botón muerto,
 * animación que no arranca—, así que el vendedor vuelve diciendo "no funciona" sin un error
 * que mostrar. El botón "Copiar instrucciones para tu IA" del editor copia esto.
 *
 * ── POR QUÉ VIVE EN lib/ Y NO ADENTRO DEL COMPONENTE ─────────────────────────
 * Porque tiene que poder VERIFICARSE contra el contrato real (`consejos-embed.test.ts`, y el
 * project `unit` de vitest solo incluye `lib/**`). Un brief que afirma cosas del sandbox y de
 * la CSP envejece mal: el día que alguien toque la política, este texto pasa a mentirle a un
 * agente que va a escribir código creyéndole.
 *
 * ── LO QUE NO PUEDE DESINCRONIZARSE, NO SE ESCRIBE A MANO ────────────────────
 * La CSP y los números (alto default/mínimo/máximo, tope de caracteres) se INTERPOLAN de las
 * constantes reales. No es elegancia: es que esa parte del texto no puede quedar vieja aunque
 * nadie lea este archivo. Lo que sí está escrito a mano —el sandbox, la geometría del marco—
 * lo ata el test contra el componente y el CSS.
 */
import { EMBED_CSP } from "./html-embed";
import {
  EMBED_ALTO_DEFAULT,
  EMBED_ALTO_MAX,
  EMBED_ALTO_MIN,
  MAX_EMBED_CHARS,
} from "./custom-sections";

/** Ancho útil del documento, en px: `--stl-w-pagina-base` menos el padding de `.stl-wrap`
 *  (24 px por lado) menos el borde de 1 px del marco. El test lo recalcula desde el CSS. */
const ANCHO_MAX = 1280 - 48 - 2;
/** Piso realista: un teléfono de 320 px menos ese mismo padding y borde. */
const ANCHO_MIN = 320 - 48 - 2;

export const CONSEJOS_EMBED = `# Brief: bloque HTML embebido en una propuesta de Smarteam

Estás escribiendo UN bloque HTML que se va a pegar dentro de una propuesta comercial que
Smarteam le manda a un prospecto. La app (Nexus) lo monta en un iframe aislado: sin red, sin
acceso a la página que lo contiene y con alto FIJO. No es una página web: es una sección de un
documento que ya tiene su encabezado, su marca y su CTA de cierre.

Casi todo lo que este entorno bloquea falla EN SILENCIO —caja vacía, botón muerto, animación
que no arranca— y solo deja rastro en la consola. Nadie va a ver un error: el vendedor va a ver
que "no funciona". Por eso las reglas de abajo son duras.

## Qué entregas

1. UN solo archivo .html autocontenido: todo el CSS en <style> y todo el JS en <script>, adentro
   del mismo archivo. Nada de styles.css, app.js, imports relativos, Vite, React ni paso de build.
2. El número para el campo "Alto (px)" del editor. Calcúlalo con el layout de 360 px de ancho,
   que casi siempre es el más alto: el alto es UNO SOLO para todos los anchos.
3. Un párrafo corto para el campo "Texto que sale en el PDF". No describas la pieza: escribe su
   CONCLUSIÓN con los números del escenario base. Mal: "calculadora interactiva de ROI". Bien:
   "Con 40 leads al mes y un ticket de $4.500, automatizar el seguimiento recupera $18.000 al
   trimestre." El PDF NUNCA monta el embebido: imprime ese texto en su lugar, como UN párrafo
   (los saltos de línea se pierden, así que nada de viñetas).
4. El título que el vendedor tiene que escribir arriba de la sección. No lo dibujas tú, pero
   proponlo: el default es "Sección personalizada" y así queda si nadie lo cambia.

## Esqueleto de arranque (cópialo tal cual)

\`\`\`html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
  body {
    min-height: 100%;
    display: flex; flex-direction: column; justify-content: center;
    padding: 24px 20px;                 /* el iframe NO hereda el padding de la propuesta */
    box-sizing: border-box;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 16px; line-height: 1.6; color: #051849;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
</style>
</head>
<body>
  <!-- tu contenido acá -->
<script>
  // Todo número que el vendedor pueda querer cambiar por prospecto, ACÁ y con comentario:
  const CONFIG = {
    ticketPromedio: 4500,   // venta promedio en USD
    leadsPorMes: 40,        // leads que entran al mes
  };
</script>
</body>
</html>
\`\`\`

## Reglas duras, de lo que más rompe a lo que menos

### 1. Un solo archivo, cero rutas relativas

El HTML viaja como un string y su URL base es la de Nexus, no la tuya. Un ./styles.css, un
/app.js o un img/logo.png resuelven contra el dominio de Nexus y dan 404 mudo, y no se puede
corregir con <base>. Trae todo por CDN https (jsDelivr, unpkg, esm.sh) o pégalo adentro.

Imágenes: URL https absoluta, data: o SVG inline. Pueden viajar sin un Referer útil, así que un
host que valide hotlink puede devolver 403 y dejar la imagen rota: usa un CDN público.

### 2. Abre con <!DOCTYPE html>

Nexus inyecta su política de seguridad DENTRO de tu <head>, pero no agrega el doctype. Sin
doctype el iframe renderiza en quirks mode y el layout no es el que probaste. <header> es
seguro; lo único prohibido es que la cadena "<head" aparezca ANTES de tu <head> real (en un
comentario o en un string), porque el inyector busca la primera aparición. Y no pongas una meta
CSP propia: se intersecta con la de Nexus y gana la más restrictiva.

### 3. Nada atado al scroll de la propuesta

El scroll de la página NO llega al embebido: window.onscroll no dispara por él, y con eso mueren
GSAP ScrollTrigger, AOS, parallax y scroll-timeline atados al scroll del documento. (Si tu
contenido pasa el alto declarado, el embebido tiene su PROPIO scroll interno y ese sí dispara
onscroll — pero es un scroll que el prospecto casi nunca descubre: no cuentes con él.)

Usa IntersectionObserver: funciona y reporta la entrada al viewport real de la propuesta. Ojo:
Nexus ya le hace su propio fade-in de 800 ms a la sección completa cuando entra en pantalla
(solo en la propuesta publicada, no en el editor), y el iframe carga con loading="lazy". Tu
observer dispara por geometría y no espera ese fade: arranca con ~350 ms de retraso o con
threshold 0.35, y mantén la animación de entrada corta. Respeta prefers-reduced-motion: reduce
saltando al estado final.

Restricción dura: solo intersecta lo que está DENTRO del alto declarado. Un elemento en
opacity: 0 esperando su reveal por debajo de esa línea se queda invisible para siempre.

### 4. Sin red y sin memoria

fetch, XMLHttpRequest, WebSocket, EventSource y sendBeacon están bloqueados: no hay forma de
traer datos. (Sale un ping por imagen —new Image().src = "https://…"— pero no vuelve nada, así
que no sirve para cargar contenido.) Todos los datos van hardcodeados, y los que el vendedor
pueda querer cambiar por prospecto van en UN objeto CONFIG al principio del <script>, con un
comentario en castellano llano por línea: los edita a mano en el campo de HTML de Nexus.

localStorage, sessionStorage, document.cookie e IndexedDB lanzan SecurityError y MATAN el script
en esa línea (el frame tiene origen opaco). window.parent se puede leer y postMessage sale, pero
Nexus no escucha nada del embebido; cualquier propiedad del padre (window.parent.document) sí
lanza. El estado vive en variables en memoria y se pierde al recargar. Si usas una librería que
hace feature-detection de localStorage al arrancar, envuelve su init en try/catch.

Nunca cuelgues el render de un await: una promesa rechazada que nadie mira deja la pieza
congelada en "cargando…" delante del prospecto.

### 5. Sin formularios, sin navegación, sin popups, sin modales

- Un <form> con action, o form.submit(), no envía nada y no muestra ningún error. Usa un <div>
  con inputs y <button type="button"> con JS que solo toca el DOM. El type="button" explícito
  importa: dentro de un <form>, un <button> es submit por defecto.
- Cualquier cosa clickeable que no lleve a otra página es <button type="button">, incluidas las
  pestañas de un tabs y los pasos de un stepper. Nunca <a href="#">: acá el documento es
  about:srcdoc y esa navegación no hace lo que esperas.
- window.open devuelve null (y explota en la línea siguiente si no lo chequeas) y
  target="_blank" no hace nada.
- Un <a href> sin target es PEOR que fallar: navega el propio frame y reemplaza la sección por
  el sitio externo, sin botón de volver. Cero enlaces de salida: el CTA lo pone Nexus.
- alert() es no-op, confirm() devuelve siempre false y prompt() siempre null, sin lanzar. Un
  if (confirm(…)) toma siempre la rama de cancelar.
- No se puede descargar nada: un <a download> no baja ningún archivo. URL.createObjectURL sí
  funciona y las blob: valen como src de <img> y <video>.
- new Worker(…) lanza una excepción síncrona. El trabajo pesado va en el hilo principal,
  troceado con requestAnimationFrame, o precomputado.

### 6. Sin iframes anidados; el video, con límites

YouTube, Vimeo, Loom, Google Maps, Calendly y Spotify no cargan: queda un rectángulo vacío del
tamaño que reservaste. <object> y <embed> tampoco: usa <img src="….svg"> o SVG inline.

Un <video src="https://….mp4" controls poster="…"> sí carga, pero el frame va con allow="", así
que no hay autoplay ni pantalla completa (tampoco cámara, micrófono, geolocalización,
portapapeles ni sensores). Si el video es el argumento, va como link en otra sección.

### 7. Nada que se salga de la caja

position: fixed se ancla al viewport del EMBEBIDO, no a la propuesta: un lightbox "a pantalla
completa" queda encerrado en el rectángulo y no oscurece nada. Expande en el lugar (grilla →
detalle) o usa master-detail de dos columnas.

## Geometría (con números)

- Ancho: fluido, de ${ANCHO_MIN} px a ${ANCHO_MAX} px. El máximo sale de la propuesta (1280 px
  con 24 px de padding a cada lado, menos el borde de 1 px del marco); el mínimo es un teléfono
  de 320 px con esa misma cuenta. En el editor del vendedor es más angosto por el sidebar.
- Alto: FIJO en píxeles, lo escribe el vendedor. Default ${EMBED_ALTO_DEFAULT}; un número fuera
  de ${EMBED_ALTO_MIN}-${EMBED_ALTO_MAX} se capa en silencio a ese rango, y un campo vacío, 0,
  negativo o no numérico cae al ${EMBED_ALTO_DEFAULT} (no al mínimo). Adentro del iframe 100vh
  ES ese alto, así que 100vh y 100% son lo mismo. El alto no cambia en celular: si a 360 px tu
  pieza necesita 900 px y en escritorio 480, el número que entregas es 900 — o rediseñas para
  que a 360 px entre en 480.
- Marco: Nexus pinta un borde de 1 px con border-radius de 14 px y overflow: hidden. No pongas
  tu propia tarjeta, borde ni sombra, y no dejes nada crítico en los 14 px de las esquinas.
- Padding: adentro del iframe NO heredas ninguno. Usa 20 px de inset lateral y 24 px arriba y
  abajo (está en el esqueleto). Eso desalinea el contenido ~20 px respecto del título de la
  sección, a propósito: la caja se lee como una pieza aparte.
- Peso: apunta a menos de ${MAX_EMBED_CHARS.toLocaleString("en-US")} caracteres de HTML. No es
  un tope que bloquee —el editor solo pinta el contador en rojo— pero el HTML entero viaja en el
  documento publicado que el prospecto abre en cada visita. Imágenes por URL https, no base64.

## Marca (Smarteam)

Carga la tipografía tú mismo (Google Fonts funciona): 'Plus Jakarta Sans', system-ui,
sans-serif. Sin eso el bloque sale en Times New Roman dentro de una propuesta que no lo está.
Tamaños en px, base 16 px con line-height 1.6.

El fondo de la sección es blanco (#ffffff); si usas otro color, que llegue hasta el borde.

- Tinta principal (navy): #051849
- Texto secundario: #41527a · Texto atenuado: #5B6B95
- Azul interactivo (links, botones, acentos sobre claro): #0B58D3, hover #07429A
- Naranja de marca: #E8481C SOLO como fondo de botón o texto de tamaño display; para texto chico
  sobre claro, #C2400F
- Fondo suave para sub-bloques: #eef3fc · Crema para bloques positivos: #FBF1E4
- Bordes: #dbe4f3 · Radio de esquina del sistema: 14 px

No repitas el título de la sección: Nexus ya pinta un <h2> de 26-34 px justo encima. Tampoco
pongas logos (la propuesta ya los tiene en el hero) ni un CTA de cierre (la propuesta tiene el
suyo). Arranca directo en el contenido.

## Lo que SÍ funciona (no gastes esfuerzo en esquivarlo)

- JS inline y por CDN https, incluidos eval y new Function: Tailwind Play CDN, GSAP, anime.js y
  Three.js cargan bien. Los módulos ES por CDN exigen que el host mande
  Access-Control-Allow-Origin (jsDelivr, unpkg y esm.sh lo hacen; un host propio, no).
- CSS inline y por CDN (<style>, <link rel="stylesheet">), Google Fonts, imágenes https, data: y
  blob:, SVG inline con SMIL, Canvas 2D, WebGL, timers, requestAnimationFrame,
  IntersectionObserver, ResizeObserver y matchMedia.
- No hace falta prefijar clases, namespacear ids ni pelear especificidad: es un documento
  aparte, así que body, .card o #app no colisionan con nada de Nexus y ningún CSS del motor se
  te filtra.
- Degrada con dignidad: si el CDN no carga (red corporativa, adblock, caída) el contenido tiene
  que seguir legible. Nada que dependa de hover —la propuesta se lee mucho desde el celular— y
  deja el foco visible (:focus-visible): el contenido es tabulable.
- Declara lang en <html> y pregunta en qué idioma va la propuesta: también se publica en inglés.

## El contrato exacto que aplica Nexus

\`\`\`
sandbox="allow-scripts"        (sin allow-same-origin: el frame tiene origen opaco)
allow=""                       (ninguna feature de Permissions Policy)
referrerPolicy="no-referrer"
loading="lazy"

<meta http-equiv="Content-Security-Policy" content="
${EMBED_CSP}
">  ← Nexus la inyecta dentro de tu <head>. No es una cabecera HTTP.
\`\`\`

Ante cualquier contradicción entre este brief y esas líneas, manda el contrato.
`;
