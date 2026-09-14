# Internet Time Capsule — el archivo del tiempo

Una "máquina del tiempo" para la web: archiva versiones de páginas en el tiempo y deja **navegar por su pasado** con un deslizador temporal y ver cómo evolucionaron palabra por palabra.

## Qué es

Es la versión digital de guardar periódicos viejos. Capturas una URL cuando quieras; cada captura se compara con la anterior:

- Si la página **no cambió** (mismo hash), la descarta en silencio.
- Si cambió, crea una **versión** con metadatos (fecha, título, tamaño, nº de palabras).

Luego puedes:

- **Viajar en el tiempo**: mover un deslizador a cualquier fecha y ver la versión que estaba vigente entonces.
- **Comparar versiones**: un diff palabra a palabra muestra qué se añadió (verde) y qué se eliminó (rojo).
- **Ver la evolución**: una línea temporal con el % de crecimiento de cada versión.
- **Exportar tu propio archivo**: el archivo es una carpeta de JSON; puedes guardarlo y reabrir el lab desde otro sitio.

## Por qué existe

Las páginas mutan y desaparecen sin rastro. Las versiones actuales (whatwg, firefox view source) no las conservan. Time Capsule es un archivo **personal, local y off-line**: tus snapshot tuyos, de tu propia web, de candidatos que quieras vigilar. Nada de "el Internet Archive tiene mi web" — lo tienes tú, en tu disco.

## Características

- Núcleo puro y testeable: extracción de texto, sanitización HTML, diff de palabras (15 pruebas).
- CLI de archivo (capturar, importar, versiones, ver, diff, linea, índice, estado).
- Servidor local (sin dependencias) + interfaz web con **navegador temporal**.
- Renderizado de snapshots aislado: las versiones se muestran en un `iframe` sandbox con HTML saneado (sin scripts ni formularios).
- Deduplicación por hash: no duplicas versiones idénticas.
- Persistencia: carpeta JSON con versión completa por snapshot.
- Decide al servidor local y a la red; la UI se sirve desde `http://localhost:4646`.

## Instalación

Sin dependencias: requiere Node.js (para servidor/CLI/tests) y un navegador.

```bash
git init
```

## Uso

### Servidor + web (modo interactivo)

```bash
node server.js
# Abre http://localhost:4646
```

Página de ejemplo para probar sin red:

```bash
node cli.js importar ejemplos/huerto-v1.html https://huerto.local
node cli.js importar ejemplos/huerto-v2.html https://huerto.local
# y recarga la interfaz para ver la evolución
```

### CLI

```bash
# Capturar la versión actual de una URL
node cli.js capturar https://example.com

# Listar las versiones de una página
node cli.js versiones https://example.com

# Ver la versión vigente en una fecha concreta
node cli.js ver https://example.com --en 2026-09-10

# Comparar dos versiones
node cli.js diff https://example.com <idA> <idB>

# Evolución del tamaño
node cli.js linea https://example.com

# Estado e índice
node cli.js indice
node cli.js estado
```

El archivo vive en `archive/` (configurable con `CAPSULE_ARCHIVE`); el puerto del servidor con `CAPSULE_PORT`.

## Arquitectura

```
js/
  core/
    text.js       ← extracción de título/texto, sanitización HTML, diff de palabras (testeable, dual node/browser)
    archive.js    ← SnapshotArchive: versionado por hash, navegación temporal (getAt), diff, índice
    fetcher.js    ← fetch HTTP con gzip/deflate/br y detección de charset
cli.js            ← CLI
server.js         ← http local: API + estáticos
js/web.js         ← interfaz: slider temporal, chips de versiones, panel diff, captura
index.html
tests/
  text.test.js    ← 10 pruebas
  archive.test.js ← 9 pruebas
```

El patrón es el mismo de los proyectos del lab: **núcleo puro testeable + interfaz separada**.

## Ejemplo real

```
$ node cli.js diff https://huerto.local mu1maygu-v2xt mu1mb39t-0k61
2026-09-14 19:10  →  2026-09-14 19:10
   +5  −2  ·19
---
− tomates
+ pimientos
+ y drones
− Sensores
+ Sensor
+ Apiario
```

## Estado

- Núcleo funcional y probado (19 pruebas: texto, sanitización, diff, versionado, navegación temporal, persistencia).
- CLI operativo con captura real de red (probada con `example.com`).
- Servidor + interfaz con navegador temporal, chips de versiones y diff con color.
- Pendientes: captura programada (cron), deduplicación fuera del último snapshot, snapshot de imágenes/CSS, diffs entre árboles DOM estructurados, control de robots/copyright más fino.

## Notas de ética

Usa Time Capsule para archivar **páginas propias o con permiso**, y respeta `robots.txt` y licencias. No es una herramienta de scraping indiscriminado: es un diario personal de lo que la web olvida.

## Licencia

MIT