# -*- coding: utf-8 -*-
# Reduce el catastro del SRI a lo unico que la extension necesita para SUGERIR
# a que se dedica un proveedor.
#
# El original pesa ~1 GB descomprimido y trae 21 columnas. Aca quedan cuatro
# datos por RUC, en ancho fijo y ordenados, para poder buscar por biseccion sin
# construir un Map de 283.000 entradas en el content script.
#
# NO se guarda la razon social: ya la da el portal en cada factura, y guardarla
# duplicaria el archivo sin agregar nada.
import zipfile, io, json, collections, os, sys

Z = 'SRI_RUC_El_Oro.zip'
DESTINO = 'extenciones web/01_Nueva_Luz_3.0/vendor'

# ── Una fila por RUC ───────────────────────────────────────────────────────
# El archivo trae una fila por ESTABLECIMIENTO, asi que un RUC se repite. Se
# queda la matriz (establecimiento 001) y, si no esta, la primera que aparezca.
por_ruc = {}
ciiu_desc = {}
filas = 0
estados = collections.Counter()

with zipfile.ZipFile(Z) as z:
    nombre = z.infolist()[0].filename
    with z.open(nombre) as bruto:
        f = io.TextIOWrapper(bruto, encoding='latin-1', newline='')
        cab = [c.strip() for c in f.readline().rstrip('\r\n').split('|')]
        n_cols = len(cab)
        C = {c: i for i, c in enumerate(cab)}
        for linea in f:
            p = linea.rstrip('\r\n').split('|')
            if len(p) != n_cols:
                continue                      # fila con las columnas corridas
            filas += 1
            ruc = p[C['NUMERO_RUC']].strip()
            if len(ruc) != 13:
                continue
            est = p[C['NUMERO_ESTABLECIMIENTO']].strip()
            ciiu = p[C['CODIGO_CIIU']].strip()
            estado = p[C['ESTADO_CONTRIBUYENTE']].strip().upper()
            agente = p[C['AGENTE_RETENCION']].strip().upper()
            actividad = p[C['ACTIVIDAD_ECONOMICA']].strip()

            estados[estado] += 1
            if ciiu and actividad and ciiu not in ciiu_desc:
                ciiu_desc[ciiu] = actividad

            # La matriz manda; si ya hay matriz guardada, no se pisa.
            previo = por_ruc.get(ruc)
            if previo and previo[3] == '001':
                continue
            por_ruc[ruc] = (ciiu, estado, agente, est)

print('filas leidas:      %s' % f'{filas:,}')
print('RUC distintos:     %s' % f'{len(por_ruc):,}')
print('codigos CIIU:      %s' % f'{len(ciiu_desc):,}')
print('estados:           %s' % ', '.join('%s=%s' % (k, f'{v:,}') for k, v in estados.most_common(4)))

# ── El archivo de ancho fijo ───────────────────────────────────────────────
# RUC(13) + CIIU(7, a la izquierda) + estado(1) + agente(1) = 22 + salto
EST = {'ACTIVO': 'A', 'SUSPENDIDO': 'S', 'PASIVO': 'P'}
lineas = []
for ruc in sorted(por_ruc):
    ciiu, estado, agente, _ = por_ruc[ruc]
    lineas.append('%s%-7s%s%s' % (ruc, ciiu[:7], EST.get(estado, '?'),
                                  'S' if agente == 'S' else 'N'))
texto = '\n'.join(lineas) + '\n'

os.makedirs(DESTINO, exist_ok=True)
ruta = os.path.join(DESTINO, 'catastro_eloro.txt')
io.open(ruta, 'w', encoding='ascii', newline='\n').write(texto)

ruta_ciiu = os.path.join(DESTINO, 'ciiu.json')
io.open(ruta_ciiu, 'w', encoding='utf-8', newline='\n').write(
    json.dumps(ciiu_desc, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n')

print('')
print('%-34s %6.2f MB  (%d bytes por linea)' % ('catastro_eloro.txt',
      os.path.getsize(ruta) / 1048576, len(lineas[0]) + 1))
print('%-34s %6.2f MB' % ('ciiu.json', os.path.getsize(ruta_ciiu) / 1048576))
