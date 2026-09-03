const fs = require('fs');
const content = fs.readFileSync('c:/Programacion/Paginas Web/SantiagoCordova.com/extenciones web/Nueva Luz 3.0/content.js', 'utf8');
const lines = content.split('\n');
let start = -1, end = -1;
for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('function renderAnticipationWidget(')) start = i;
    if(start !== -1 && lines[i].includes('function checkLoginAnticipation() {')) { end = i; break; }
}

const replacement = `    function renderAnticipationWidget(clientData, isBatch, queueIndex, totalQueue, isSyncing, allClients = []) {
        const existing = document.getElementById('sri-anticipacion-widget');
        if (existing) existing.remove();

        if (isSyncing || !clientData) return;

        const widget = document.createElement('div');
        widget.id = 'sri-anticipacion-widget';
        
        // DISEÑO MINIMALISTA
        widget.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 999999; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #6366f1; border-radius: 12px; padding: 12px 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); font-family: 'Inter', sans-serif; color: #f8fafc; display: flex; align-items: center; gap: 16px; animation: sriSlideIn 0.3s ease-out;";
        
        const style = document.createElement('style');
        style.innerHTML = "@keyframes sriSlideIn { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }";
        widget.appendChild(style);

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = "<div style='font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;'>AUTO-INGRESO DETECTADO</div><div style='font-size: 13px; font-weight: 700; color: white;'>" + (clientData.name || clientData.ruc) + "</div>";
        
        const btnLogin = document.createElement('button');
        btnLogin.innerHTML = "▶ Llenar e Ingresar";
        btnLogin.style.cssText = "background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(99,102,241,0.3); transition: all 0.2s;";
        btnLogin.onmouseover = () => btnLogin.style.transform = "translateY(-1px)";
        btnLogin.onmouseout = () => btnLogin.style.transform = "translateY(0)";
        
        const btnClose = document.createElement('button');
        btnClose.innerHTML = "✕";
        btnClose.style.cssText = "background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 4px;";
        
        const clientPass = clientData.sriPassword || clientData.password || '';
        
        btnLogin.onclick = () => {
            executeLogin(clientData.ruc, clientPass);
        };
        
        btnClose.onclick = () => widget.remove();

        widget.appendChild(infoDiv);
        widget.appendChild(btnLogin);
        widget.appendChild(btnClose);
        
        document.body.appendChild(widget);
    }
`;

if (start !== -1 && end !== -1) {
    lines.splice(start, end - start, replacement);
    fs.writeFileSync('c:/Programacion/Paginas Web/SantiagoCordova.com/extenciones web/Nueva Luz 3.0/content.js', lines.join('\\n'), 'utf8');
    console.log("Success");
} else {
    console.log("Failed to find boundaries");
}
