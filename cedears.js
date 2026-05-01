import { CONFIG } from "./config.js";
import { currentMepRate } from "./app.js";

const cedearsResults = document.getElementById("cedearsResults");
const searchCedearInput = document.getElementById("searchCedearInput");
const btnToggleTable = document.getElementById("btnToggleTable");
const btnToggleChart = document.getElementById("btnToggleChart");
const tableWrapper = document.getElementById("cedearsTableWrapper");
const chartWrapper = document.getElementById("cedearsChartWrapper");

const MIN_VOLUMEN_ARS = 500000;
let cedearData = [];
let cedearsSort = { col: 'ticker', asc: true }; 
let currentCclRate = 0;
let scatterChart = null; 

// --- LECTOR DE CSV ROBUSTO ---
function parseCSV(str) {
    if (!str || typeof str !== 'string') return [];
    let sep = ','; let firstLine = str.substring(0, str.indexOf('\n'));
    if (firstLine && firstLine.split(';').length > firstLine.split(',').length) sep = ';';
    let arr = []; let quote = false; let row = 0, col = 0;
    for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1]; arr[row] = arr[row] || []; arr[row][col] = arr[row][col] || '';
        if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
        if (cc === '"') { quote = !quote; continue; }
        if (cc === sep && !quote) { ++col; continue; }
        if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc === '\n' && !quote) { ++row; col = 0; continue; }
        if (cc === '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    return arr;
}

function parseSuperNum(val) {
    if (val === null || val === undefined || val === '') return null;
    let str = String(val).toUpperCase().trim();
    let multiplier = 1;
    if (str.includes('%')) str = str.replace(/%/g, '');
    if (str.endsWith('B')) { multiplier = 1e9; str = str.replace(/B/g, ''); }
    else if (str.endsWith('M')) { multiplier = 1e6; str = str.replace(/M/g, ''); }
    else if (str.endsWith('K')) { multiplier = 1e3; str = str.replace(/K/g, ''); }
    str = str.replace(/[$U\$S\s]/g, ''); 
    let lastDot = str.lastIndexOf('.'); let lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot && lastDot !== -1) { str = str.replace(/\./g, '').replace(/,/g, '.'); } 
    else if (lastDot > lastComma && lastComma !== -1) { str = str.replace(/,/g, ''); } 
    else if (lastComma !== -1 && lastDot === -1) {
        let parts = str.split(',');
        if (parts[parts.length - 1].length <= 2) str = str.replace(/,/g, '.');
        else str = str.replace(/,/g, '');
    }
    let num = parseFloat(str); return isNaN(num) ? null : num * multiplier; 
}

function getVal(headers, row, aliases) {
    if (!headers || !row) return null;
    let cleanHeaders = headers.map(h => h.replace(/[^a-z0-9]/g, ''));
    for (let a of aliases) {
        let cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        let idx = cleanHeaders.findIndex(h => h === cleanA);
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') return row[idx].trim();
    }
    return null;
}

export async function initCedears(force = false) {
    if (cedearData.length > 0 && !force) return;
    cedearsResults.innerHTML = "<tr><td colspan='8' style='text-align:center; padding:30px;'>Calculando Arbitrajes... 🚀</td></tr>";

    try {
        let [finvizRes, argyRes, dollarRes] = await Promise.all([
            fetch(CONFIG.FINVIZ_CSV_URL).catch(() => null),
            fetch(CONFIG.ARGY_CSV_URL).catch(() => null),
            fetch(CONFIG.DOLLAR_API).catch(() => null)
        ]);

        if (!finvizRes || !finvizRes.ok) finvizRes = await fetch(`${CONFIG.PROXY_URL}${encodeURIComponent(CONFIG.FINVIZ_CSV_URL)}`).catch(() => null);
        if (!argyRes || !argyRes.ok) argyRes = await fetch(`${CONFIG.PROXY_URL}${encodeURIComponent(CONFIG.ARGY_CSV_URL)}`).catch(() => null);

        if (dollarRes?.ok) {
            const dolares = await dollarRes.json();
            const ccl = dolares.filter(d => d.casa === "contadoconliqui").sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
            if (ccl.length > 0) currentCclRate = parseFloat(ccl[0].venta);
        }

        const fvzArr = parseCSV(await finvizRes.text());
        const argyArr = parseCSV(await argyRes.text());

        let fvzData = {};
        if (fvzArr.length > 1) {
            const h = fvzArr[0].map(x => x.toLowerCase().trim());
            for (let i = 1; i < fvzArr.length; i++) {
                let t = getVal(h, fvzArr[i], ['ticker', 'symbol']);
                if (t) fvzData[t.toUpperCase()] = parseSuperNum(getVal(h, fvzArr[i], ['price', 'precio']));
            }
        }

        let merged = {};
        if (argyArr.length > 1) {
            const h = argyArr[0].map(x => x.toLowerCase().trim());
            for (let i = 1; i < argyArr.length; i++) {
                let row = argyArr[i];
                let rawT = getVal(h, row, ['ticker', 'symbol']);
                if (!rawT) continue; rawT = rawT.toUpperCase();
                
                let base = rawT.replace(/[DC]$/, '');
                if (!merged[base]) merged[base] = { ticker: base, name: getVal(h, row, ['nombre', 'name']) || '-', pARS: 0, pMEP: 0, pCCL: 0, vol: 0, yield: parseSuperNum(getVal(h, row, ['divyield'])) || 0 };
                
                let p = parseSuperNum(getVal(h, row, ['precio', 'price', 'close']));
                if (rawT.endsWith('D') && rawT.length > 2 && !rawT.includes('MERV')) merged[base].pMEP = p;
                else if (rawT.endsWith('C') && rawT.length > 2 && !rawT.includes('MERV')) merged[base].pCCL = p;
                else { 
                    merged[base].pARS = p; 
                    merged[base].vol = parseSuperNum(getVal(h, row, ['volumen operado', 'valuetraded', 'volavg'])) || 0; 
                }
            }
        }

        cedearData = Object.values(merged).map(c => {
            let pUSA = fvzData[c.ticker] || null;
            if (!pUSA || !c.pARS) return null; 
            
            let ratio = null;
            if (c.pMEP > 0) ratio = Math.round(pUSA / c.pMEP);
            else if (c.pCCL > 0) ratio = Math.round(pUSA / c.pCCL);

            let implMep = c.pMEP > 0 ? (c.pARS / c.pMEP) : null;
            let implCcl = c.pCCL > 0 ? (c.pARS / c.pCCL) : null;
            
            return { ...c, pUSA, ratio, implMep, implCcl };
        }).filter(c => c !== null && c.vol > MIN_VOLUMEN_ARS);

        if (!currentCclRate) {
            let sum = 0, count = 0;
            cedearData.forEach(c => { if(c.implCcl > 0) { sum += c.implCcl; count++; }});
            currentCclRate = count > 0 ? sum / count : currentMepRate;
        }

        cedearData.sort((a, b) => a.ticker.localeCompare(b.ticker));

        renderCedears();
    } catch (e) { 
        console.error(e); 
        cedearsResults.innerHTML = "<tr><td colspan='8' style='text-align:center; color:red;'>Error crítico al cargar los datos. Revisá la consola (F12).</td></tr>";
    }
}

function renderCedears() {
    const search = searchCedearInput?.value.toLowerCase() || "";
    let filtered = cedearData.filter(c => c.ticker.toLowerCase().includes(search) || c.name.toLowerCase().includes(search));
    
    if (tableWrapper.style.display !== "none") {
        renderTable(filtered);
    } else {
        renderChart(filtered);
    }
}

function renderTable(data) {
    // --- LÓGICA MAGICA DE ORDENAMIENTO (Vacíos SIEMPRE al final) ---
    data.sort((a, b) => {
        let valA = a[cedearsSort.col];
        let valB = b[cedearsSort.col];

        // Definimos qué es "estar vacío" (null, undefined, rayita, o cero)
        let aEmpty = (valA === null || valA === undefined || valA === '-' || valA === 0);
        let bEmpty = (valB === null || valB === undefined || valB === '-' || valB === 0);

        if (aEmpty && !bEmpty) return 1;  // A está vacío, mandarlo abajo
        if (!aEmpty && bEmpty) return -1; // B está vacío, mandarlo abajo
        if (aEmpty && bEmpty) return 0;   // Ambos vacíos, dejarlos como están

        // Si son textos (ej: Ticker), ordenamos alfabéticamente
        if (typeof valA === 'string') {
            return cedearsSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        
        // Si son números (precios, dólares implícitos), orden matemático
        return cedearsSort.asc ? (valA - valB) : (valB - valA);
    });

    if (data.length === 0) {
        cedearsResults.innerHTML = "<tr><td colspan='8' style='text-align:center; padding:20px;'>No se encontraron activos con esos parámetros.</td></tr>";
        return;
    }

    cedearsResults.innerHTML = data.map(c => {
        let colorMep = c.implMep ? (c.implMep < currentMepRate * 0.98 ? 'positive' : (c.implMep > currentMepRate * 1.02 ? 'negative' : 'warning')) : 'neutral';
        let colorCcl = c.implCcl ? (c.implCcl < currentCclRate * 0.98 ? 'positive' : (c.implCcl > currentCclRate * 1.02 ? 'negative' : 'warning')) : 'neutral';
        return `
            <tr class="scanner-row">
                <td style="padding: 12px 15px;"><strong>${c.ticker}</strong><br><small style="color:#6b7280">${c.name.substring(0,20)}</small></td>
                <td style="text-align:center;">${c.ratio ? c.ratio + ':1' : '-'}</td>
                <td style="text-align:right;">$ ${c.pARS.toLocaleString('es-AR')}</td>
                <td style="text-align:right;">${c.pMEP ? 'u$s ' + c.pMEP.toFixed(2) : '-'}</td>
                <td style="text-align:right;">${c.pCCL ? 'u$s ' + c.pCCL.toFixed(2) : '-'}</td>
                <td style="text-align:right; color:#00f7ff;">${c.pUSA ? 'u$s ' + c.pUSA.toFixed(2) : '-'}</td>
                <td class="${colorMep}" style="text-align:center; font-weight:bold;">${c.implMep ? '$ ' + Math.round(c.implMep) : '-'}</td>
                <td class="${colorCcl}" style="text-align:center; font-weight:bold;">${c.implCcl ? '$ ' + Math.round(c.implCcl) : '-'}</td>
            </tr>`;
    }).join('');
}

function renderChart(data) {
    const ctx = document.getElementById('cedearsScatterChart').getContext('2d');
    
    const chartData = data.filter(c => c.implMep > 0 && c.implCcl > 0).map(c => ({
        x: c.implCcl,
        y: c.implMep,
        ticker: c.ticker
    }));

    if (scatterChart) scatterChart.destroy();

    scatterChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Cedears (CCL vs MEP)',
                data: chartData,
                backgroundColor: '#00f7ff',
                borderColor: '#fff',
                borderWidth: 1,
                pointRadius: 6,
                pointHoverRadius: 9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    title: { display: true, text: 'CCL Implícito (ARS)', color: '#9ca3af' },
                    grid: { color: '#1f2937' }
                },
                y: { 
                    title: { display: true, text: 'MEP Implícito (ARS)', color: '#9ca3af' },
                    grid: { color: '#1f2937' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const p = ctx.raw;
                            return ` ${p.ticker} | CCL: $${Math.round(p.x)} | MEP: $${Math.round(p.y)}`;
                        }
                    }
                },
                legend: { display: false }
            }
        }
    });
}

btnToggleTable.onclick = () => {
    btnToggleTable.classList.add('active');
    btnToggleChart.classList.remove('active');
    tableWrapper.style.display = "block";
    chartWrapper.style.display = "none";
    renderCedears();
};

btnToggleChart.onclick = () => {
    btnToggleChart.classList.add('active');
    btnToggleTable.classList.remove('active');
    tableWrapper.style.display = "none";
    chartWrapper.style.display = "block";
    renderCedears();
};

if (searchCedearInput) searchCedearInput.addEventListener("input", renderCedears);

document.querySelectorAll('#cedearsView th.sortable').forEach(th => {
    th.onclick = () => {
        const col = th.dataset.sort;
        cedearsSort.asc = (cedearsSort.col === col) ? !cedearsSort.asc : true;
        cedearsSort.col = col;
        document.querySelectorAll('#cedearsView th.sortable').forEach(el => el.classList.remove('asc', 'desc'));
        th.classList.add(cedearsSort.asc ? 'asc' : 'desc');
        renderCedears();
    };
});