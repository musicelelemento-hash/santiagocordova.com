const text = `FACTURA 001-002-000000374
PROCEL YIGUIN GLORIA BEATRIZ
RUC : 0701161002001
AMBIENTE TIPO DE EMISION
CLAVE DE ACCESO
PRODUCCIÓN NORMAL
2503202601070116100200120010020000003740000000015
DIRECCIÓN MATRIZ
SITIO EL PARAISO S/N SN
CONTRIBUYENTE ESPECIAL
OBLIGADO A LLEVAR CONTABILIDAD No
No
DIRECCIÓN SUCURSAL
SITIO EL PARAISO S/N Ò9#4:!'!0*" , *" EH !Í54Ó
FECHA Y HORA DE AUTORIZACIÓN : 25 mar. 2026 14:15:00
FECHA DE EMISIÓN
CLIENTE - RAZÓN SOCIAL CIUDAD
R.U.C. / C.I.
25 marzo /2026
ASOCIACION DE PEQUEÑOS PRODUCTORES AGROPECUARIOS TIERRA FERTIL PASAJE
0791755492001`;

function extractData(text) {
    const get = (re) => (text.match(re) || [])[1] || '';

    const clave = get(/CLAVE DE ACCESO[\s\S]*?(\d{49})/);
    
    // Issuer RUC is at 11-23 (length 13)
    const rucEmisor = clave.substring(10, 23);
    console.log("RUC Emisor (from Clave):", rucEmisor);

    // Current logic (first RUC found)
    const rucOld = (text.match(/(?:RUC|Identificaci[óo]n|CI|R\.U\.C).*?(\d{10,13})/) || [])[1] || '';
    console.log("RUC (Old logic):", rucOld);

    // Proposed logic:
    // 1. Find all potential RUCs
    const rucMatches = text.match(/\b\d{10,13}\b/g) || [];
    console.log("All RUC matches found:", rucMatches);
    
    // 2. Filter out the issuer's RUC
    const recipients = rucMatches.filter(r => r !== rucEmisor);
    console.log("Possible recipient RUCs:", recipients);
    
    // 3. Selection heuristic: first non-issuer RUC that appears LATER in the text (usually after headers)
    const rucNew = recipients[0] || '';
    console.log("RUC (New logic):", rucNew);

    return { rucEmisor, rucOld, rucNew };
}

extractData(text);
