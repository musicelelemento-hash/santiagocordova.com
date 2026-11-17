#!/usr/bin/env node
/**
 * ci_estado.mjs — vigía del CI de las extensiones en GitHub Actions.
 *
 * POR QUÉ EXISTE
 * El workflow `.github/workflows/extensiones.yml` (job "Sintaxis · build · 909
 * bancos · suite") corre en cada push a una rama de extensiones. A veces falla
 * por INFRAESTRUCTURA, no por código: el caso conocido es el paso de bancos
 * muriendo con `❌ Error: Chrome no abrió el puerto de DevTools` en el runner de
 * GitHub; al re-ejecutar el run pasa. Mirar eso a mano en la web de GitHub
 * cuesta minutos y se olvida.
 *
 * Este script consulta la API de GitHub con el token del remoto `origin`, dice
 * el estado real del run del commit pedido y, si el fallo es de infraestructura,
 * lo re-ejecuta y espera el nuevo intento. Si el fallo es de bancos (o de
 * compilación/sintaxis/suite) NO reintenta: un reintento ahí esconde un fallo
 * de verdad.
 *
 * USO
 *   node "extenciones web/tools/ci_estado.mjs" --sha 1d2b2e1
 *   node "extenciones web/tools/ci_estado.mjs" --esperar
 *   node "extenciones web/tools/ci_estado.mjs" --esperar --reintentar-infra
 *   node "extenciones web/tools/ci_estado.mjs" --sha 227c60d --intento 1
 *
 * FLAGS
 *   --sha <sha>          Commit a consultar (corto o completo). Por defecto,
 *                        HEAD de la rama actual (git rev-parse HEAD).
 *   --esperar            Si el run todavía no terminó, espera hasta que termine
 *                        (máx. --limite-min minutos, 20 por defecto).
 *   --reintentar-infra   Si el fallo es de infraestructura, re-ejecuta el run
 *                        (hasta --intentos veces, 2 por defecto) y vuelve a
 *                        esperar. Nunca reintenta fallos reales.
 *   --intento <n>        Diagnóstico de un intento concreto de un run que ya se
 *                        re-ejecutó (por ejemplo `--intento 1` para ver por qué
 *                        falló la primera vez). Con este flag NO se reintenta:
 *                        la re-ejecución siempre actúa sobre el intento vigente.
 *   --limite-min <n>     Tope de espera en minutos (default 20).
 *   --cada <seg>         Intervalo de consulta en segundos (default 15).
 *   --intentos <n>       Máximo de re-ejecuciones por infraestructura (default 2).
 *   -h, --ayuda          Muestra esta ayuda.
 *
 * SALIDA
 * Imprime: run id, estado, conclusión, URL, intentos del run y —si falló— los
 * pasos fallidos con las líneas `✗` del log de bancos (o la evidencia de
 * infraestructura: mensaje de Chrome/DevTools, runner, etc.).
 *
 * CÓDIGOS DE SALIDA
 *   0  El run terminó en verde (o el reintento por infra lo dejó verde).
 *   1  Fallo real: bancos, build, sintaxis, suite o manifiestos. NO se reintenta.
 *   2  Fallo de infraestructura sin reintento (no se pasó --reintentar-infra),
 *      infraestructura que sigue fallando después de los reintentos, run
 *      cancelado, o no se pudo consultar GitHub (red/token/config).
 *
 * SEGURIDAD
 * El token sale del remoto `origin` (credenciales embebidas en la URL https) o,
 * si no hay, de `GITHUB_TOKEN`/`GH_TOKEN`. NUNCA se imprime: todo lo que se
 * escribe en pantalla pasa por `seguro()`, que lo reemplaza por `***`.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constantes ────────────────────────────────────────────────────────────
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
/** `extenciones web/tools/` → dos niveles arriba es la raíz del repo. */
const RAIZ_REPO = path.resolve(TOOLS, '..', '..');
const API = 'https://api.github.com';
const WORKFLOW = 'extensiones.yml';
const AGENTE = 'sc-pro-ci-vigia/1.0';

/** Mensajes/patrones que delatan un fallo de infraestructura, no de código. */
const MARCAS_INFRA = [
    { re: /Chrome no abri[oó] el puerto de DevTools/i, etiqueta: 'Chrome no abrió el puerto de DevTools' },
    { re: /Lost communication with the server/i, etiqueta: 'Lost communication with the server' },
    { re: /The runner has received a shutdown signal/i, etiqueta: 'el runner recibió una señal de apagado' },
    { re: /The runner (?:has )?(?:exited|encountered an error|was unable|is being shut down)/i, etiqueta: 'el runner falló' },
    { re: /(?:Failed to resolve action download info|unable to resolve action|Failed to download action)/i, etiqueta: 'no se pudo descargar una action' },
    { re: /(?:ECONNRESET|ETIMEDOUT|socket hang up|Temporary failure in name resolution)/i, etiqueta: 'error de red del runner' },
];

/**
 * Pasos que, si fallan, son de entorno y no del código del proyecto: el
 * runner no arrancó, no clonó, no instaló Node o no bajó dependencias.
 */
const PASO_DE_ENTORNO = /^(set up job|set up|checkout|node \d+|restore cache|dependencias|install|post |complete job|cache )/i;

const PASO_DE_BANCOS = /bancos?/i;

// ── Secretos y salida (nunca imprimir el token) ───────────────────────────
const SECRETOS = [];

function registrarSecreto(valor) {
    if (typeof valor === 'string' && valor.length > 0) SECRETOS.push(valor);
}

/** Reemplaza cualquier secreto conocido por `***`. */
function seguro(texto) {
    let salida = String(texto);
    for (const s of SECRETOS) salida = salida.split(s).join('***');
    return salida;
}

function log(...partes) {
    console.log(...partes.map((p) => (typeof p === 'string' ? seguro(p) : p)));
}

function err(...partes) {
    console.error(...partes.map((p) => (typeof p === 'string' ? seguro(p) : p)));
}

// ── Errores con código de salida ──────────────────────────────────────────
class ErrorCi extends Error {
    constructor(mensaje, codigo = 2, extra = {}) {
        super(mensaje);
        this.name = 'ErrorCi';
        this.codigo = codigo;
        this.extra = extra;
    }
}

// ── Utilidades ────────────────────────────────────────────────────────────
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fechaLegible(iso) {
    if (!iso) return '(sin fecha)';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    try {
        return d.toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return d.toISOString();
    }
}

function duracionLegible(run) {
    const ini = run.run_started_at || run.created_at;
    const fin = run.updated_at;
    if (!ini || !fin) return '(sin duración)';
    const seg = Math.max(0, Math.round((new Date(fin) - new Date(ini)) / 1000));
    if (seg < 60) return `${seg}s`;
    return `${Math.floor(seg / 60)}m ${seg % 60}s`;
}

const corto = (sha) => (sha ? String(sha).slice(0, 7) : '???????');

// ── Argumentos ────────────────────────────────────────────────────────────
function parsearArgumentos(argv) {
    const o = {
        sha: null,
        esperar: false,
        reintentarInfra: false,
        intento: null,
        limiteMin: 20,
        cadaSeg: 15,
        intentos: 2,
        ayuda: false,
    };

    const tomarValor = (i, flag) => {
        const v = argv[i + 1];
        if (!v || v.startsWith('--')) throw new ErrorCi(`Falta el valor de ${flag}.`, 2);
        return v;
    };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const [nombre, valorInline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
        const valor = () => (valorInline !== null ? valorInline : tomarValor(i, nombre));
        switch (nombre) {
            case '--sha':
                o.sha = valor();
                break;
            case '--esperar':
                o.esperar = true;
                break;
            case '--reintentar-infra':
                o.reintentarInfra = true;
                break;
            case '--intento':
                o.intento = Number(valor());
                break;
            case '--limite-min':
                o.limiteMin = Number(valor());
                break;
            case '--cada':
                o.cadaSeg = Number(valor());
                break;
            case '--intentos':
                o.intentos = Number(valor());
                break;
            case '-h':
            case '--ayuda':
            case '--help':
                o.ayuda = true;
                break;
            default:
                throw new ErrorCi(`Opción desconocida: ${nombre}. Probá con --ayuda.`, 2);
        }
        if (!a.includes('=')) {
            if (['--sha', '--intento', '--limite-min', '--cada', '--intentos'].includes(nombre)) i++;
        }
    }

    if (o.sha !== null && !/^[0-9a-f]{7,40}$/i.test(o.sha.trim())) {
        throw new ErrorCi(`--sha inválido: "${o.sha}". Pasá un sha hexadecimal de 7 a 40 caracteres.`, 2);
    }
    if (o.intento !== null && (!Number.isInteger(o.intento) || o.intento < 1)) {
        throw new ErrorCi('--intento debe ser un entero ≥ 1.', 2);
    }
    if (!Number.isFinite(o.limiteMin) || o.limiteMin <= 0) throw new ErrorCi('--limite-min debe ser un número mayor que 0.', 2);
    if (!Number.isFinite(o.cadaSeg) || o.cadaSeg <= 0) throw new ErrorCi('--cada debe ser un número mayor que 0.', 2);
    if (!Number.isInteger(o.intentos) || o.intentos < 0) throw new ErrorCi('--intentos debe ser un entero ≥ 0.', 2);
    return o;
}

function imprimirAyuda() {
    log(`
🔎 Vigía de CI · GitHub Actions

USO
  node "extenciones web/tools/ci_estado.mjs" [--sha <sha>] [--esperar] [--reintentar-infra]

FLAGS
  --sha <sha>          Commit a consultar (corto o completo). Default: HEAD de la rama actual.
  --esperar            Espera a que el run termine (máx. --limite-min, 20 por defecto).
  --reintentar-infra   Si el fallo es de infraestructura, re-ejecuta y espera (hasta --intentos).
  --intento <n>        Diagnóstico de un intento anterior del mismo run. No reintenta.
  --limite-min <n>     Tope de espera en minutos (default 20).
  --cada <seg>         Intervalo de consulta en segundos (default 15).
  --intentos <n>       Máximo de re-ejecuciones por infraestructura (default 2).
  -h, --ayuda          Esta ayuda.

SALIDA
  0 = run en verde · 1 = fallo real (bancos/código, no se reintenta)
  2 = fallo de infraestructura (sin reintento o tras los reintentos) / no se pudo consultar

El token se lee del remoto \`origin\` (o de GITHUB_TOKEN/GH_TOKEN) y nunca se imprime.
`.trim());
}

// ── Remoto `origin` y token ───────────────────────────────────────────────
function git(args) {
    try {
        return execFileSync('git', args, { cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        throw new ErrorCi(`No se pudo ejecutar git (${e.message.split('\n')[0]}). ¿Está git en el PATH?`, 2);
    }
}

/**
 * Parsea la URL https del remoto de GitHub.
 * Acepta: https://<token>@github.com/owner/repo.git
 *         https://usuario:<token>@github.com/owner/repo.git
 *         https://x-access-token:<token>@github.com/owner/repo.git
 * Devuelve null si la URL no es de GitHub o no tiene el formato esperado.
 */
function parsearRemoto(url) {
    if (!url) return null;
    let texto;
    try {
        texto = decodeURIComponent(url.trim());
    } catch {
        texto = url.trim();
    }
    const m = /^https?:\/\/(?:([^@/]+)@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(texto);
    if (!m) return null;

    const userinfo = m[1] || '';
    let usuario = '';
    let token = '';
    if (userinfo) {
        const dos = userinfo.indexOf(':');
        if (dos >= 0) {
            usuario = userinfo.slice(0, dos);
            token = userinfo.slice(dos + 1);
        } else {
            // GitHub acepta un PAT como "usuario" en la URL.
            token = userinfo;
            usuario = 'x-access-token';
        }
    }
    return {
        owner: m[2],
        repo: m[3],
        usuario,
        token,
    };
}

function leerRemoto() {
    let url = '';
    try {
        url = git(['config', '--get', 'remote.origin.url']);
    } catch {
        // Sin remoto configurado no hay repo: se avisa abajo.
    }
    if (!url) {
        try {
            url = git(['remote', 'get-url', 'origin']);
        } catch {
            throw new ErrorCi(
                'No hay remoto `origin` en este repo. Configuralo con: git remote add origin https://<token>@github.com/<owner>/<repo>.git',
                2
            );
        }
    }

    const remoto = parsearRemoto(url);
    if (!remoto) {
        throw new ErrorCi(
            'El remoto `origin` no es una URL https de GitHub reconocible. Se espera https://<token>@github.com/<owner>/<repo>.git (no se imprime la URL por seguridad).',
            2
        );
    }

    let fuente = 'origin';
    if (!remoto.token) {
        const delEntorno = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
        if (delEntorno) {
            remoto.token = delEntorno;
            fuente = 'GITHUB_TOKEN del entorno';
        } else {
            fuente = 'sin credenciales (consultas anónimas)';
        }
    }
    registrarSecreto(remoto.token);
    remoto.fuente = fuente;
    return remoto;
}

function shaDeHead() {
    try {
        return git(['rev-parse', 'HEAD']);
    } catch {
        throw new ErrorCi('No se pudo leer HEAD con git. Pasá el commit con --sha.', 2);
    }
}

// ── Cliente de la API de GitHub ───────────────────────────────────────────
async function gh(remoto, ruta, { metodo = 'GET', seguirRedirect = true } = {}) {
    const url = ruta.startsWith('http') ? ruta : `${API}${ruta}`;
    const cabeceras = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': AGENTE,
    };
    // Sólo se manda el token a la API; nunca a URLs absolutas (p. ej. el
    // redirect firmado de los logs, que no lo necesita).
    if (remoto.token && !ruta.startsWith('http')) cabeceras.Authorization = `Bearer ${remoto.token}`;

    let res;
    try {
        res = await fetch(url, {
            method: metodo,
            headers: cabeceras,
            redirect: seguirRedirect ? 'follow' : 'manual',
            signal: AbortSignal.timeout(45000),
        });
    } catch (e) {
        const detalle = e?.cause?.code || e?.name || e?.message || 'error desconocido';
        throw new ErrorCi(
            `No se pudo conectar con api.github.com (${detalle}). Revisá la red/proxy. Si es por autenticación, el token sale del remoto origin (o de GITHUB_TOKEN).`,
            2
        );
    }

    if (!seguirRedirect && res.status >= 300 && res.status < 400) {
        return { status: res.status, location: res.headers.get('location'), json: null, texto: null };
    }

    const tipo = res.headers.get('content-type') || '';
    let json = null;
    let texto = '';
    if (tipo.includes('application/json')) {
        json = await res.json();
    } else {
        texto = await res.text();
    }

    if (!res.ok) {
        const detalle = (json && json.message) || texto.slice(0, 200) || '(sin detalle)';
        let pista = '';
        if (res.status === 401) pista = ' — el token del remoto fue rechazado; revisá que no esté vencido.';
        else if (res.status === 403) pista = ' — puede faltar permiso sobre Actions (el token necesita Actions: read/write) o haberse agotado el límite de la API.';
        else if (res.status === 404) pista = ' — repo/run/job no encontrado, o el token no tiene acceso a este repositorio.';
        throw new ErrorCi(`GitHub respondió HTTP ${res.status}: ${detalle}${pista}`, 2, { status: res.status });
    }

    return { status: res.status, location: null, json, texto };
}

const rutaRepo = (owner, repo) => `/repos/${owner}/${repo}`;

async function obtenerRun(remoto, runId) {
    const { json } = await gh(remoto, `${rutaRepo(remoto.owner, remoto.repo)}/actions/runs/${runId}`);
    return json;
}

/** Todos los jobs del run, incluyendo los de intentos anteriores (`filter=all`). */
async function obtenerJobs(remoto, runId) {
    const todos = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
        const { json } = await gh(
            remoto,
            `${rutaRepo(remoto.owner, remoto.repo)}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${pagina}`
        );
        const lote = (json && json.jobs) || [];
        todos.push(...lote);
        if (lote.length < 100) break;
    }
    return todos;
}

/** Busca el run del commit pedido entre los últimos runs del repo. */
async function buscarRun(remoto, sha) {
    const buscado = sha.toLowerCase();
    const candidatos = [];
    for (let pagina = 1; pagina <= 3; pagina++) {
        const { json } = await gh(
            remoto,
            `${rutaRepo(remoto.owner, remoto.repo)}/actions/runs?per_page=100&page=${pagina}`
        );
        const lote = (json && json.workflow_runs) || [];
        candidatos.push(...lote);
        if (lote.length < 100) break;
        if (candidatos.some((r) => String(r.head_sha || '').toLowerCase().startsWith(buscado))) break;
    }

    const delSha = candidatos.filter((r) => String(r.head_sha || '').toLowerCase().startsWith(buscado));
    if (delSha.length === 0) return null;

    // Si hay varios (push + PR, por ejemplo), preferir el workflow de extensiones.
    const ordenados = delSha.slice().sort((a, b) => {
        const pa = String(a.path || '').endsWith(WORKFLOW) ? 1 : 0;
        const pb = String(b.path || '').endsWith(WORKFLOW) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return new Date(b.created_at) - new Date(a.created_at);
    });
    return ordenados[0];
}

// ── Logs de jobs ──────────────────────────────────────────────────────────
/**
 * Descarga el log crudo de un job. GitHub responde 302 hacia una URL firmada de
 * blob storage: el token NO viaja a esa URL. Devuelve null si no hay log
 * disponible (logs vencidos o job sin salida).
 */
async function obtenerLogJob(remoto, jobId) {
    const url = `${rutaRepo(remoto.owner, remoto.repo)}/actions/jobs/${jobId}/logs`;
    let res;
    try {
        res = await fetch(`${API}${url}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': AGENTE,
                ...(remoto.token ? { Authorization: `Bearer ${remoto.token}` } : {}),
            },
            redirect: 'manual',
            signal: AbortSignal.timeout(45000),
        });
    } catch {
        return null;
    }

    if (res.status >= 300 && res.status < 400) {
        const destino = res.headers.get('location');
        if (!destino) return null;
        try {
            const r2 = await fetch(destino, { signal: AbortSignal.timeout(60000) });
            if (!r2.ok) return null;
            return await r2.text();
        } catch {
            return null;
        }
    }
    if (!res.ok) return null;
    return await res.text();
}

/** Quita timestamps de GitHub, códigos ANSI y CR finales. */
function limpiarLineas(texto) {
    return String(texto)
        .split('\n')
        .map((linea) =>
            linea
                .replace(/\u001b\[[0-9;]*m/g, '')
                .replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s*/, '')
                .replace(/\r$/, '')
        );
}

const pareceRuido = (linea) =>
    /^\s*$/.test(linea) ||
    /^##\[group\]/.test(linea) ||
    /^##\[endgroup\]/.test(linea) ||
    /^\[command\]/.test(linea) ||
    /^(Post job cleanup|Cleaning up|Complete job)/.test(linea);

// ── Análisis de un intento ────────────────────────────────────────────────
async function conclusionDelIntento(remoto, run, numero) {
    if (!run.run_attempt || numero === run.run_attempt) return run.conclusion;
    try {
        const { json } = await gh(remoto, `${rutaRepo(remoto.owner, remoto.repo)}/actions/runs/${run.id}/attempts/${numero}`);
        return json.conclusion;
    } catch {
        return null;
    }
}

/**
 * Arma el diagnóstico del intento pedido: jobs, pasos fallidos, líneas `✗`,
 * resumen de la suite y marcas de infraestructura con su contexto.
 */
async function analizarIntento(remoto, run, numero) {
    const conclusion = await conclusionDelIntento(remoto, run, numero);
    const jobsTodos = await obtenerJobs(remoto, run.id);
    // Sólo los jobs del intento pedido: los de otro intento no explican nada.
    const jobs = jobsTodos.filter((j) => (j.run_attempt || 1) === numero);

    const analisis = {
        numero,
        conclusion,
        jobs,
        fallidos: [], // { job, pasos: [{numero, nombre, conclusion}] }
        lineasRombo: [],
        lineasResumen: [],
        lineasTimeOut: [],
        marcasInfra: [], // { etiqueta, lineas: [] }
        colaPasoFallido: [],
        sinLogs: false,
    };

    const conclusionesMalas = new Set(['failure', 'timed_out', 'cancelled']);
    const jobsFallidos = jobs.filter(
        (j) => conclusionesMalas.has(j.conclusion) || (j.steps || []).some((s) => conclusionesMalas.has(s.conclusion))
    );

    if (jobsFallidos.length === 0) {
        analisis.sinLogs = jobs.length === 0;
    }

    for (const job of jobsFallidos) {
        const pasos = (job.steps || [])
            .filter((s) => conclusionesMalas.has(s.conclusion))
            .map((s) => ({ numero: s.number, nombre: s.name, conclusion: s.conclusion }));
        const entrada = { job, pasos };
        analisis.fallidos.push(entrada);

        const texto = await obtenerLogJob(remoto, job.id);
        if (!texto) {
            analisis.sinLogs = true;
            continue;
        }
        const lineas = limpiarLineas(texto);

        // 1) Líneas de banco fallido y resumen de la suite.
        for (const linea of lineas) {
            if (linea.includes('✗')) analisis.lineasRombo.push({ paso: entrada, linea: linea.trim() });
            if (/fallaron de|comprobaciones, todas bien/.test(linea) && /❌|✅/.test(linea)) {
                analisis.lineasResumen.push(linea.trim());
            }
            if (/⏱.*no terminó/.test(linea)) analisis.lineasTimeOut.push(linea.trim());
        }

        // 2) Marcas de infraestructura, con la línea siguiente (stack).
        for (let i = 0; i < lineas.length; i++) {
            for (const marca of MARCAS_INFRA) {
                if (!marca.re.test(lineas[i])) continue;
                const contexto = [lineas[i].trim()];
                for (let k = 1; k <= 2 && i + k < lineas.length; k++) {
                    const siguiente = lineas[i + k];
                    if (pareceRuido(siguiente)) break;
                    contexto.push(siguiente.trim());
                }
                const ya = analisis.marcasInfra.find((m) => m.etiqueta === marca.etiqueta && m.lineas[0] === contexto[0]);
                if (!ya) analisis.marcasInfra.push({ etiqueta: marca.etiqueta, lineas: contexto.slice(0, 3) });
            }
        }

        // 3) Cola del tramo fallido (para cuando no hay líneas `✗`).
        if (analisis.colaPasoFallido.length === 0) {
            const idxError = lineas.reduce((acc, l, i) => (l.includes('##[error]') ? i : acc), -1);
            if (idxError >= 0) {
                let desde = 0;
                for (let i = idxError - 1; i >= 0; i--) {
                    if (lineas[i].includes('##[group]')) {
                        desde = i + 1;
                        break;
                    }
                }
                analisis.colaPasoFallido = lineas.slice(desde, idxError + 1).filter((l) => !pareceRuido(l)).slice(-22);
            } else {
                analisis.colaPasoFallido = lineas.filter((l) => !pareceRuido(l)).slice(-22);
            }
        }
    }

    // 4) Clasificación: ¿infraestructura o fallo real?
    analisis.clasificacion = clasificar(analisis, run);
    return analisis;
}

function clasificar(analisis, run) {
    const conclusion = analisis.conclusion || 'desconocida';
    if (conclusion === 'success') {
        return { tipo: 'verde', motivo: 'el run terminó en verde' };
    }
    if (!analisis.conclusion) {
        return {
            tipo: 'desconocido',
            motivo: `no se pudo leer la conclusión del intento ${analisis.numero} (¿ese intento existe?)`,
        };
    }
    if (analisis.marcasInfra.length > 0) {
        return {
            tipo: 'infra',
            motivo: `mensaje de infraestructura en el log: "${analisis.marcasInfra[0].lineas[0]}"`,
        };
    }
    if (conclusion === 'startup_failure') {
        return { tipo: 'infra', motivo: 'el workflow no llegó a arrancar (startup_failure)' };
    }
    if (conclusion === 'cancelled') {
        return {
            tipo: 'cancelado',
            motivo: 'el run fue cancelado (normalmente por un push más nuevo o a mano), no es un fallo de bancos',
        };
    }
    if (conclusion === 'action_required') {
        return { tipo: 'desconocido', motivo: 'el run quedó esperando una acción/aprobación manual' };
    }
    if (analisis.jobs.length === 0) {
        return {
            tipo: 'desconocido',
            motivo: `no se pudieron leer los jobs del intento ${analisis.numero} (¿logs vencidos o intento inexistente?)`,
        };
    }

    const pasos = analisis.fallidos.flatMap((f) => f.pasos);
    if (pasos.length > 0) {
        const todosEntorno = pasos.every((p) => PASO_DE_ENTORNO.test(p.nombre));
        const hayBancos = pasos.some((p) => PASO_DE_BANCOS.test(p.nombre));
        const hayTimeOut = pasos.some((p) => p.conclusion === 'timed_out');
        const jobsTimeOut = analisis.fallidos.some((f) => f.job.conclusion === 'timed_out');

        if (todosEntorno) {
            return {
                tipo: 'infra',
                motivo: `falló un paso de entorno (${pasos.map((p) => `"${p.nombre}"`).join(', ')}), no los bancos`,
            };
        }
        if (hayBancos) {
            if (hayTimeOut && !jobsTimeOut) {
                return {
                    tipo: 'real',
                    motivo: 'los bancos se quedaron sin tiempo (posible banco colgado o runner lento; se revisa, no se reintenta)',
                };
            }
            return { tipo: 'real', motivo: 'falló el paso de bancos de prueba' };
        }
        if (hayTimeOut && !jobsTimeOut) {
            return { tipo: 'real', motivo: `el paso "${pasos[0].nombre}" se quedó sin tiempo` };
        }
        return {
            tipo: 'real',
            motivo: `falló un paso de código (${pasos.map((p) => `"${p.nombre}"`).join(', ')}), no los bancos`,
        };
    }

    if (conclusion === 'timed_out') {
        return { tipo: 'infra', motivo: 'el job/run se quedó sin tiempo (timeout del runner)' };
    }
    if (conclusion === 'failure') {
        return {
            tipo: 'infra',
            motivo: 'el run falló sin un paso fallido identificable (fallo del runner/job)',
        };
    }
    if (!analisis.conclusion) {
        return {
            tipo: 'desconocido',
            motivo: `no se pudo leer la conclusión del intento ${analisis.numero} (¿ese intento existe?)`,
        };
    }
    return { tipo: 'desconocido', motivo: `conclusión no clasificada: ${conclusion}` };
}

// ── Impresión ─────────────────────────────────────────────────────────────
function imprimirRun(run) {
    log('');
    log(`📦 Run ${run.id} · "${run.name}"`);
    log(`   URL       : ${run.html_url || '(sin URL)'}`);
    log(`   Workflow  : ${run.path || '(no informado)'} · evento ${run.event || '?'}`);
    log(`   Commit    : ${corto(run.head_sha)} · rama ${run.head_branch || '(sin rama)'}`);
    log(`   Estado    : ${run.status} · conclusión ${run.conclusion || '(en curso)'} · intento ${run.run_attempt || 1}`);
    log(`   Creado    : ${fechaLegible(run.created_at)} · duración ${duracionLegible(run)}`);
}

async function imprimirHistorial(remoto, run) {
    const total = run.run_attempt || 1;
    if (total <= 1) return;
    const filas = [];
    for (let n = 1; n <= Math.min(total, 6); n++) {
        const conclusion = await conclusionDelIntento(remoto, run, n);
        filas.push(`intento ${n} → ${conclusion || '?'}`);
    }
    log(`   Intentos  : ${filas.join(' · ')}`);
}

function imprimirJobs(analisis) {
    if (!analisis.jobs || analisis.jobs.length === 0) return;
    log('');
    log('🧩 Jobs del intento:');
    for (const job of analisis.jobs) {
        const icono = job.conclusion === 'success' ? '✅' : job.conclusion === 'skipped' ? '⏭️' : job.conclusion ? '❌' : '⏳';
        log(`   ${icono} "${job.name}" (job ${job.id}) → ${job.status}/${job.conclusion || '?'}`);
    }
}

function imprimirPasosFallidos(analisis) {
    for (const fallido of analisis.fallidos) {
        log(`   ❌ job "${fallido.job.name}" (job ${fallido.job.id})`);
        if (fallido.pasos.length === 0) {
            log('      (sin pasos fallidos identificables)');
            continue;
        }
        for (const paso of fallido.pasos) {
            log(`      · paso ${paso.numero} "${paso.nombre}" → ${paso.conclusion}`);
        }
    }
    if (analisis.sinLogs) log('   ⚠️ No hay log disponible para los jobs fallidos (¿logs vencidos?).');
}

function imprimirFalloReal(analisis) {
    log('');
    log(`❌ Fallo REAL en el intento ${analisis.numero} — NO se reintenta.`);
    log(`   Motivo: ${analisis.clasificacion.motivo}`);
    imprimirJobs(analisis);
    imprimirPasosFallidos(analisis);

    log('');
    if (analisis.lineasRombo.length > 0) {
        log(`🏦 Líneas ✗ de bancos (${analisis.lineasRombo.length}):`);
        for (const { linea } of analisis.lineasRombo.slice(0, 40)) log(`   ${linea}`);
        if (analisis.lineasRombo.length > 40) log(`   … y ${analisis.lineasRombo.length - 40} más.`);
    } else {
        log('🏦 No hubo líneas "✗" en el log.');
        if (analisis.lineasTimeOut.length > 0) {
            log('   Bancos que no terminaron:');
            for (const linea of analisis.lineasTimeOut.slice(0, 20)) log(`   ${linea}`);
        }
        if (analisis.colaPasoFallido.length > 0) {
            log('   Últimas líneas del tramo fallido:');
            for (const linea of analisis.colaPasoFallido) log(`   │ ${linea.slice(0, 240)}`);
        }
    }
    if (analisis.lineasResumen.length > 0) {
        log('');
        log('📊 Resumen de la suite:');
        for (const linea of [...new Set(analisis.lineasResumen)]) log(`   ${linea}`);
    }
}

function imprimirInfra(analisis) {
    log('');
    log(`⚠️  Fallo de INFRAESTRUCTURA en el intento ${analisis.numero} — no es un fallo de bancos.`);
    log(`   Motivo: ${analisis.clasificacion.motivo}`);
    imprimirJobs(analisis);
    imprimirPasosFallidos(analisis);

    if (analisis.marcasInfra.length > 0) {
        log('');
        log('🧯 Evidencia de infraestructura:');
        for (const marca of analisis.marcasInfra.slice(0, 6)) {
            for (const linea of marca.lineas) log(`   │ ${linea.slice(0, 240)}`);
        }
    }
}

// ── Esperas y reintentos ──────────────────────────────────────────────────
function resumenEstado(run) {
    return `${run.status}${run.conclusion ? `/${run.conclusion}` : ''} · intento ${run.run_attempt || 1}`;
}

/**
 * Espera a que el run esté `completed` con intento ≥ `intentoMin`.
 * Lanza ErrorCi (código 2) si se pasa del tope de tiempo.
 */
async function esperarRun(remoto, runId, { intentoMin = 1, limiteMin, cadaSeg, etiqueta = '' }) {
    const inicio = Date.now();
    const tope = limiteMin * 60000;
    let ultimo = null;
    let ultimaVezQueAviso = 0;

    for (;;) {
        const run = await obtenerRun(remoto, runId);
        const estado = resumenEstado(run);
        if (estado !== ultimo) {
            log(`   👀 ${etiqueta}${estado} · ${corto(run.head_sha)}`);
            ultimo = estado;
        }

        if (run.status === 'completed' && (run.run_attempt || 1) >= intentoMin) return run;

        const transcurrido = Date.now() - inicio;
        if (transcurrido >= tope) {
            throw new ErrorCi(
                `El run ${runId} no terminó en ${limiteMin} min (estado actual: ${estado}). ` +
                    'Volvé a correr el script con --esperar y --limite-min más alto, o mirá la URL del run.',
                2
            );
        }

        if (transcurrido - ultimaVezQueAviso >= 60000) {
            const seg = Math.round(transcurrido / 1000);
            log(`   ⏳ esperando… ${Math.floor(seg / 60)}m ${seg % 60}s · ${estado}`);
            ultimaVezQueAviso = transcurrido;
        }

        await dormir(cadaSeg * 1000);
    }
}

/** POST rerun-failed-jobs (o rerun completo si el workflow no llegó a arrancar). */
async function pedirReintento(remoto, run) {
    const esStartup = (run.conclusion || '') === 'startup_failure';
    const accion = esStartup ? 'rerun' : 'rerun-failed-jobs';
    const ruta = `${rutaRepo(remoto.owner, remoto.repo)}/actions/runs/${run.id}/${accion}`;

    try {
        const { status } = await gh(remoto, ruta, { metodo: 'POST' });
        log(`🔁 Re-ejecución aceptada (HTTP ${status}) → ${accion}.`);
        return true;
    } catch (e) {
        if (e instanceof ErrorCi && e.extra && e.extra.status === 403) {
            if (/no failed jobs|cannot be retried/i.test(e.message)) {
                log('   GitHub dice que este run no tiene jobs fallidos que reintentar (¿ya está en verde?).');
            } else {
                log('   El token del remoto no tiene permiso de escritura sobre Actions; no se puede re-ejecutar desde acá.');
                log('   Un PAT de GitHub necesita el scope "workflow" (o un fine-grained token con Actions: write).');
            }
        }
        throw e;
    }
}

// ── Principal ─────────────────────────────────────────────────────────────
async function ejecutar(opciones) {
    if (opciones.ayuda) {
        imprimirAyuda();
        return 0;
    }

    const remoto = leerRemoto();
    const sha = (opciones.sha || shaDeHead()).toLowerCase();

    log('🔎 Vigía de CI · Soluciones Contables Pro');
    log(`   repositorio : ${remoto.owner}/${remoto.repo} (credenciales: ${remoto.fuente})`);
    log(`   commit      : ${corto(sha)}${sha.length > 7 ? '' : ' (corto)'}`);

    const run = await buscarRun(remoto, sha);
    if (!run) {
        log('');
        log(`ℹ️  No hay ningún run de GitHub Actions para el commit ${corto(sha)}.`);
        log('   Causas habituales: el commit todavía no se subió (push), no tocó "extenciones web/**"');
        log('   ni el workflow, o la rama no dispara el workflow. Subí el commit y volvé a correr.');
        return 2;
    }

    imprimirRun(run);
    await imprimirHistorial(remoto, run);

    // Intento a analizar: el pedido con --intento o el vigente.
    const vigente = run.run_attempt || 1;
    const numero = opciones.intento || vigente;
    const esDiagnosticoViejo = numero !== vigente;
    if (esDiagnosticoViejo) {
        log('');
        log(`🛈  Diagnóstico del intento ${numero} (el vigente es el ${vigente}); no se reintenta desde acá.`);
    }

    // Si el intento vigente no terminó, esperar (o avisar).
    let runActual = run;
    if (!esDiagnosticoViejo && runActual.status !== 'completed') {
        if (!opciones.esperar) {
            log('');
            log(`⏳ El run está ${runActual.status}. Volvé a correr con --esperar para seguir hasta el final.`);
            return 2;
        }
        log('');
        log(`⏳ Esperando a que termine (tope ${opciones.limiteMin} min)…`);
        runActual = await esperarRun(remoto, runActual.id, {
            intentoMin: vigente,
            limiteMin: opciones.limiteMin,
            cadaSeg: opciones.cadaSeg,
        });
        imprimirRun(runActual);
    }

    // Reintentos automáticos sólo para el intento vigente.
    let intentosHechos = 0;
    let analisis = await analizarIntento(remoto, runActual, numero);

    for (;;) {
        const { tipo } = analisis.clasificacion;

        if (tipo === 'verde') {
            log('');
            log(`✅ CI en verde para ${corto(sha)}${intentosHechos > 0 ? ` (tras ${intentosHechos} reintento(s) por infraestructura)` : ''}.`);
            log(`   ${runActual.html_url}`);
            return 0;
        }

        if (tipo === 'real') {
            imprimirFalloReal(analisis);
            log('');
            log('🛠️  Fallo real: hay que arreglar el código o el banco y volver a subir. NO se reintenta.');
            log('    Si el paso fallido es de bancos, el arreglo va en el banco que falla; no en un reintento.');
            return 1;
        }

        if (tipo === 'desconocido') {
            log('');
            log(`❔ No se pudo clasificar el resultado: ${analisis.clasificacion.motivo}`);
            imprimirJobs(analisis);
            imprimirPasosFallidos(analisis);
            log('');
            log('   No se reintenta. Revisá el run en GitHub.');
            return 2;
        }

        if (tipo === 'cancelado') {
            log('');
            log(`⏹️  ${analisis.clasificacion.motivo}.`);
            log('   No se reintenta: buscá el run del commit más nuevo (o volvé a correr sin --sha).');
            return 2;
        }

        // tipo === 'infra'
        imprimirInfra(analisis);

        if (esDiagnosticoViejo) {
            log('');
            log(`🛈  El intento ${numero} ya no es el vigente: un reintento actuaría sobre el intento ${vigente}.`);
            log('   Volvé a correr sin --intento para reintentar el run vigente.');
            return 2;
        }

        if (!opciones.reintentarInfra) {
            log('');
            log('🧯 Es infraestructura, no bancos. No se reintenta sin que se lo pidan.');
            log('   Para reintentar y esperar el resultado:');
            log(`     node "extenciones web/tools/ci_estado.mjs" --sha ${corto(sha)} --esperar --reintentar-infra`);
            return 2;
        }

        if (opciones.intentos === 0) {
            log('');
            log('❌ Es infraestructura y los reintentos están desactivados (--intentos 0).');
            log('   Volvé a correr con --reintentar-infra sin --intentos 0.');
            return 2;
        }

        if (intentosHechos >= opciones.intentos) {
            log('');
            log(`❌ Sigue fallando por infraestructura después de ${intentosHechos} reintento(s).`);
            log('   Revisá el estado de los runners de GitHub o probá más tarde; no es un problema de bancos.');
            return 2;
        }

        // Reintentar y esperar el nuevo intento.
        const intentoPrevio = runActual.run_attempt || 1;
        log('');
        log(`🔁 Reintentando por infraestructura (intento ${intentoPrevio} → ${intentoPrevio + 1}, hasta ${opciones.intentos} reintento(s))…`);
        await pedirReintento(remoto, runActual);
        intentosHechos++;

        runActual = await esperarRun(remoto, runActual.id, {
            intentoMin: intentoPrevio + 1,
            limiteMin: opciones.limiteMin,
            cadaSeg: opciones.cadaSeg,
            etiqueta: 'nuevo intento: ',
        });
        imprimirRun(runActual);
        await imprimirHistorial(remoto, runActual);
        analisis = await analizarIntento(remoto, runActual, runActual.run_attempt || 1);
    }
}

// ── Arranque ──────────────────────────────────────────────────────────────
let codigo = 2;
try {
    const opciones = parsearArgumentos(process.argv.slice(2));
    codigo = await ejecutar(opciones);
} catch (e) {
    if (e instanceof ErrorCi) {
        err('');
        err(`❌ ${e.message}`);
        codigo = e.codigo;
    } else {
        err('');
        err(`❌ Error inesperado: ${(e && e.stack) || e}`);
        codigo = 2;
    }
}
// Salida explícita: no dejar que un socket keep-alive de fetch retrase el cierre.
process.exit(codigo);
