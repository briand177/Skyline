import { isUSD, currentMepRate, getHistoricalMepRate, formatMonto, formatMontoEntero, formatPrecio, renderGlobalPortfolio, matchSearch, obfuscate } from "./app.js";

let fciData = [];
let hasLoadedFci = false;
let fciTransactions = JSON.parse(localStorage.getItem('skyline_fci_txs')) || [];
let editingFciId = null;

export async function initFCI() {
    if (hasLoadedFci) return; 
    const fciResults = document.getElementById("fciResults");
    
    fciResults.innerHTML = "<tr><td colspan='3'>Cargando listado de FCI...</td></tr>";

    try {
        const tipos = ['mercadoDinero', 'rentaVariable', 'rentaFija', 'rentaMixta'];
        let rawData = [];

        for (const tipo of tipos) {
            try {
                const url = `https://api.argentinadatos.com/v1/finanzas/fci/${tipo}/ultimo`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    rawData = rawData.concat(data.map(d => ({ ...d, tipoFondo: tipo })));
                } else throw new Error("Bloqueo CORS");
            } catch (e) {
                try {
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.argentinadatos.com/v1/finanzas/fci/${tipo}/ultimo`)}`;
                    const resProxy = await fetch(proxyUrl);
                    if (resProxy.ok) {
                        const jsonProxy = await resProxy.json();
                        const dataProxy = JSON.parse(jsonProxy.contents);
                        rawData = rawData.concat(dataProxy.map(d => ({ ...d, tipoFondo: tipo })));
                    }
                } catch (errProxy) {}
            }
        }
        fciData = parseFciData(rawData);
        hasLoadedFci = true;
        renderFciTable();
        renderFciPortfolio(); 
    } catch (error) {
        console.error("Error crítico FCIs:", error);
    }
}

function parseFciData(data) {
    const fondosValidos = data.filter(d => d.fondo && !d.fondo.startsWith("Region:") && !d.fondo.startsWith("Duration:"));
    const nombresTipos = { 'mercadoDinero': 'Money Market', 'rentaVariable': 'Renta Variable', 'rentaFija': 'Renta Fija', 'rentaMixta': 'Renta Mixta' };
    return fondosValidos.map(item => ({
        symbol: item.fondo,
        c: parseFloat(item.vcp) || 0,
        tipo: nombresTipos[item.tipoFondo] || 'Fondo Común',
        fecha: item.fecha || 'Sin fecha'
    })).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function renderFciTable() {
    const searchInput = document.getElementById("searchFciInput");
    const fciResults = document.getElementById("fciResults");
    if (!fciResults) return;

    const searchTerm = searchInput ? searchInput.value.trim() : "";
    let filtered = fciData;
    if (searchTerm !== "") {
        filtered = fciData.filter(item => matchSearch(`${item.symbol} ${item.tipo}`, searchTerm));
    }
    
    const dataToRender = searchTerm === "" ? filtered.slice(0, 100) : filtered;

    fciResults.innerHTML = dataToRender.map(item => {
        const formattedPrice = formatPrecio(item.c);
        return `
            <tr class="fci-row">
                <td><strong>${item.symbol}</strong></td>
                <td>$ ${formattedPrice}</td>
                <td><span style="color: #9ca3af; font-size: 13px; font-weight: bold;">${item.tipo}</span><br><small style="color: #00f7ff;">Cierre: ${item.fecha}</small></td>
            </tr>
        `;
    }).join("") || "<tr><td colspan='3'>Sin resultados.</td></tr>";
}

document.getElementById("searchFciInput")?.addEventListener("input", renderFciTable);

const fciModal = document.getElementById("fciTxModal");
document.getElementById("btnOpenFciTxModal").addEventListener("click", () => {
    fciModal.classList.add("active"); 
    document.body.style.overflow = "hidden";
    if (!editingFciId) {
        const today = new Date();
        document.getElementById("fciTxDate").value = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    }
});

document.getElementById("closeFciTxModal").addEventListener("click", closeFciModal);
document.getElementById("btnCancelFciEdit").addEventListener("click", closeFciModal);
window.addEventListener("click", (e) => { if (e.target === fciModal) closeFciModal(); });

function closeFciModal() {
    fciModal.classList.remove("active");
    document.body.style.overflow = "auto";
    document.getElementById("fciTransactionForm").reset();
    document.getElementById("fciTickerSuggestions").style.display = "none";
    editingFciId = null;
    document.getElementById("fciFormTitle").innerText = "Operación de FCI";
    document.getElementById("btnSubmitFciTx").innerText = "Guardar FCI";
    document.getElementById("btnCancelFciEdit").style.display = "none";
}

const fciTickerInput = document.getElementById("fciTxTicker");
const fciTickerSuggestions = document.getElementById("fciTickerSuggestions");
fciTickerInput.addEventListener("input", () => {
    const val = fciTickerInput.value.toLowerCase();
    fciTickerSuggestions.innerHTML = "";
    if (!val || fciData.length === 0) { fciTickerSuggestions.style.display = "none"; return; }
    
    const matches = fciData.filter(t => matchSearch(t.symbol, val)).slice(0, 10);
    if (matches.length > 0) {
        fciTickerSuggestions.style.display = "block";
        matches.forEach(match => {
            const li = document.createElement("li");
            li.textContent = match.symbol;
            li.addEventListener("click", () => {
                fciTickerInput.value = match.symbol;
                fciTickerSuggestions.style.display = "none";
            });
            fciTickerSuggestions.appendChild(li);
        });
    } else { fciTickerSuggestions.style.display = "none"; }
});

document.getElementById("fciTransactionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const newTx = {
        id: editingFciId ? editingFciId : Date.now(),
        ticker: document.getElementById("fciTxTicker").value.trim(),
        type: document.getElementById("fciTxType").value,
        currency: document.getElementById("fciTxCurrency").value, 
        qty: Math.abs(parseFloat(document.getElementById("fciTxQty").value)),
        price: Math.abs(parseFloat(document.getElementById("fciTxPrice").value)), 
        date: document.getElementById("fciTxDate").value
    };
    
    if (editingFciId) {
        const idx = fciTransactions.findIndex(t => String(t.id) === String(editingFciId));
        if (idx !== -1) fciTransactions[idx] = newTx;
    } else {
        fciTransactions.push(newTx);
    }
    
    localStorage.setItem('skyline_fci_txs', JSON.stringify(fciTransactions));
    closeFciModal();
    renderFciHistory();
    renderFciPortfolio();
});

export function renderFciPortfolio() {
    const holdings = {};
    let actInvARS = 0, actInvUSD = 0;
    let actCurARS = 0, actCurUSD = 0;
    let clsInvARS = 0, clsInvUSD = 0;
    let clsProARS = 0, clsProUSD = 0;
    let fciHoldingsArr = []; 

    const sorted = [...fciTransactions].sort((a,b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(tx => {
        if (!holdings[tx.ticker]) holdings[tx.ticker] = { qty: 0, invARS: 0, invUSD: 0, invNative: 0, isUSD: tx.currency === 'USD' };
        
        const txMep = getHistoricalMepRate(tx.date);
        const nativeCost = (tx.qty / 1000) * tx.price;
        const costARS = tx.currency === 'USD' ? nativeCost * txMep : nativeCost;
        const costUSD = tx.currency === 'USD' ? nativeCost : nativeCost / txMep;

        if (tx.type === "buy") {
            holdings[tx.ticker].qty += tx.qty;
            holdings[tx.ticker].invARS += costARS;
            holdings[tx.ticker].invUSD += costUSD;
            holdings[tx.ticker].invNative += nativeCost;
        } else if (tx.type === "sell" && holdings[tx.ticker].qty > 0) {
            const soldQty = Math.min(tx.qty, holdings[tx.ticker].qty);
            const avgARS = holdings[tx.ticker].invARS / holdings[tx.ticker].qty;
            const avgUSD = holdings[tx.ticker].invUSD / holdings[tx.ticker].qty;
            const avgNative = holdings[tx.ticker].invNative / holdings[tx.ticker].qty;
            
            clsInvARS += (avgARS * soldQty);
            clsInvUSD += (avgUSD * soldQty);

            const nativeProceeds = (soldQty / 1000) * tx.price;
            clsProARS += tx.currency === 'USD' ? nativeProceeds * txMep : nativeProceeds;
            clsProUSD += tx.currency === 'USD' ? nativeProceeds : nativeProceeds / txMep;

            holdings[tx.ticker].qty -= soldQty;
            holdings[tx.ticker].invARS -= (avgARS * soldQty);
            holdings[tx.ticker].invUSD -= (avgUSD * soldQty);
            holdings[tx.ticker].invNative -= (avgNative * soldQty);
        }
    });

    const sym = isUSD ? "u$s " : "$ ";

    for (let t in holdings) {
        const h = holdings[t];
        if (h.qty <= 0.001) continue;

        const liveData = fciData.find(item => item.symbol === t);
        let apiPriceUnit = liveData ? liveData.c : (h.invNative / (h.qty / 1000));
        let nativeCurrentVal = (h.qty / 1000) * apiPriceUnit;
        
        let currentValARS = h.isUSD ? nativeCurrentVal * currentMepRate : nativeCurrentVal;
        let currentValUSD = h.isUSD ? nativeCurrentVal : nativeCurrentVal / currentMepRate;

        actInvARS += h.invARS; actInvUSD += h.invUSD;
        actCurARS += currentValARS; actCurUSD += currentValUSD;

        const invested = isUSD ? h.invUSD : h.invARS;
        const currentVal = isUSD ? currentValUSD : currentValARS;
        const pnl = currentVal - invested;
        const pnlP = invested > 0 ? (pnl / invested) * 100 : 0;
        
        const displayBuyPrice = h.invNative / (h.qty / 1000);
        const nativeSym = h.isUSD ? "u$s " : "$ ";

        fciHoldingsArr.push({
            ticker: t, tag: "FCI", qtyStr: formatMonto(h.qty),
            nativeSym: nativeSym, 
            nativePPC: displayBuyPrice, 
            nativePrice: apiPriceUnit,
            currentARS: currentValARS, currentUSD: currentValUSD,
            pnlARS: currentValARS - h.invARS, pnlUSD: currentValUSD - h.invUSD, pnlPct: pnlP
        });
    }

    const filterText = document.getElementById("searchFciPortfolio")?.value || "";
    const filteredFci = fciHoldingsArr.filter(h => matchSearch(h.ticker, filterText));

    let html = filteredFci.map(h => `
        <tr>
            <td><strong>${h.ticker}</strong></td>
            <td><span style="font-size:12px; color:#9ca3af; padding:2px 6px; border:1px solid #374151; border-radius:4px;">${h.nativeSym === 'u$s ' ? 'USD' : 'ARS'}</span></td>
            <td>${obfuscate(h.qtyStr)}</td>
            <td>${obfuscate(h.nativeSym + formatPrecio(h.nativePPC))}</td>
            <td>${h.nativeSym}${formatPrecio(h.nativePrice)}</td>
            <td>${obfuscate(sym + formatMonto(isUSD ? h.currentUSD : h.currentARS))}</td>
            <td class="${(isUSD ? h.pnlUSD : h.pnlARS) >= 0 ? 'positive' : 'negative'}">${obfuscate(sym + formatMonto(isUSD ? h.pnlUSD : h.pnlARS))}</td>
            <td class="${h.pnlPct >= 0 ? 'positive' : 'negative'}">${obfuscate(h.pnlPct.toFixed(2) + '%')}</td>
        </tr>
    `).join("");

    document.getElementById("fciPortfolioResults").innerHTML = html || "<tr><td colspan='8'>Sin fondos en cartera</td></tr>";

    const dActInv = isUSD ? actInvUSD : actInvARS;
    const dActCur = isUSD ? actCurUSD : actCurARS;
    const dActPnl = dActCur - dActInv;
    document.getElementById("fciActiveInvested").innerText = obfuscate(sym + formatMontoEntero(dActInv));
    document.getElementById("fciActiveCurrent").innerText = obfuscate(sym + formatMontoEntero(dActCur));
    document.getElementById("fciActivePNL").innerText = obfuscate(`${sym}${formatMontoEntero(dActPnl)} (${(dActInv > 0 ? (dActPnl / dActInv * 100) : 0).toFixed(2)}%)`);
    document.getElementById("fciActivePNL").className = dActPnl >= 0 ? "positive" : "negative";

    const dClsInv = isUSD ? clsInvUSD : clsInvARS;
    const dClsCur = isUSD ? clsProUSD : clsProARS;
    const dClsPnl = dClsCur - dClsInv;
    document.getElementById("fciClosedInvested").innerText = obfuscate(sym + formatMontoEntero(dClsInv));
    document.getElementById("fciClosedCurrent").innerText = obfuscate(sym + formatMontoEntero(dClsCur));
    document.getElementById("fciClosedPNL").innerText = obfuscate(`${sym}${formatMontoEntero(dClsPnl)} (${(dClsInv > 0 ? (dClsPnl / dClsInv * 100) : 0).toFixed(2)}%)`);
    document.getElementById("fciClosedPNL").className = dClsPnl >= 0 ? "positive" : "negative";

    const dTotInv = dActInv + dClsInv;
    const dTotCur = dActCur + dClsCur;
    const dTotPnl = dTotCur - dTotInv;
    document.getElementById("fciTotalInvested").innerText = obfuscate(sym + formatMontoEntero(dTotInv));
    document.getElementById("fciTotalCurrent").innerText = obfuscate(sym + formatMontoEntero(dTotCur));
    document.getElementById("fciTotalPNL").innerText = obfuscate(`${sym}${formatMontoEntero(dTotPnl)} (${(dTotInv > 0 ? (dTotPnl / dTotInv * 100) : 0).toFixed(2)}%)`);
    document.getElementById("fciTotalPNL").className = dTotPnl >= 0 ? "positive" : "negative";

    renderGlobalPortfolio({ actInvARS, actInvUSD, actCurARS, actCurUSD, clsInvARS, clsInvUSD, clsProARS, clsProUSD }, fciHoldingsArr, fciTransactions);
}

export function renderFciHistory() {
    const filterText = document.getElementById("searchFciHistory")?.value || "";
    const filteredTxs = fciTransactions.filter(tx => matchSearch(`${tx.ticker} ${tx.type === 'buy' ? 'Suscripción' : 'Rescate'} ${tx.currency}`, filterText));

    document.getElementById("fciHistoryResults").innerHTML = filteredTxs.map(tx => {
        const nativeSym = tx.currency === 'USD' ? "u$s " : "$ ";
        return `<tr>
            <td>${tx.date}</td>
            <td><strong>${tx.ticker}</strong></td>
            <td class="${tx.type==='buy'?'positive':'negative'}">${tx.type==='buy'?'Suscripción':'Rescate'}</td>
            <td>${tx.currency}</td>
            <td>${obfuscate(formatMonto(tx.qty))}</td>
            <td>${obfuscate(nativeSym + formatPrecio(tx.price))}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" data-id="${tx.id}" onclick="editarFciTx('${tx.id}')">Editar</button>
                    <button class="btn-delete" data-id="${tx.id}" onclick="eliminarFciTx('${tx.id}')">X</button>
                </div>
            </td>
        </tr>`;
    }).join("") || "<tr><td colspan='7'>Sin operaciones</td></tr>";
}

document.getElementById("searchFciPortfolio")?.addEventListener("input", renderFciPortfolio);
document.getElementById("searchFciHistory")?.addEventListener("input", renderFciHistory);

window.editarFciTx = function(id) {
    const tx = fciTransactions.find(t => String(t.id) === String(id));
    if(tx) {
        editingFciId = tx.id;
        document.getElementById("fciTxTicker").value = tx.ticker;
        document.getElementById("fciTxType").value = tx.type;
        document.getElementById("fciTxCurrency").value = tx.currency || "ARS";
        document.getElementById("fciTxQty").value = tx.qty;
        document.getElementById("fciTxPrice").value = tx.price;
        document.getElementById("fciTxDate").value = tx.date;
        
        document.getElementById("fciFormTitle").innerText = "Editando Operación FCI";
        document.getElementById("btnSubmitFciTx").innerText = "Actualizar";
        document.getElementById("btnCancelFciEdit").style.display = "block";
        
        const fciModal = document.getElementById("fciTxModal");
        fciModal.classList.add("active"); 
        document.body.style.overflow = "hidden";
    }
}

window.eliminarFciTx = function(id) {
    if(confirm("¿Eliminar operación de FCI?")) { 
        fciTransactions = fciTransactions.filter(t => String(t.id) !== String(id)); 
        localStorage.setItem('skyline_fci_txs', JSON.stringify(fciTransactions)); 
        renderFciHistory(); 
        renderFciPortfolio(); 
    }
}

const btnExportFci = document.getElementById("btnExportFci");
if(btnExportFci) {
    btnExportFci.addEventListener("click", () => {
        if (fciTransactions.length === 0) { alert("No hay transacciones de FCI para exportar."); return; }
        let csvContent = "\uFEFFid;ticker;type;currency;qty;price;date\n";
        fciTransactions.forEach(t => {
            const pTxt = t.price.toString().replace('.', ',');
            const qTxt = t.qty.toString().replace('.', ',');
            csvContent += `${t.id};${t.ticker};${t.type};${t.currency};${qTxt};${pTxt};${t.date}\n`;
        });
        const hoy = new Date(); const fechaTxt = hoy.toISOString().split('T')[0];
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `skyline_fci_${fechaTxt}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

const btnImportFci = document.getElementById("btnImportFci");
const fileImportFci = document.getElementById("fileImportFci");
if(btnImportFci) btnImportFci.addEventListener("click", () => fileImportFci.click()); 

if(fileImportFci) {
    fileImportFci.addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            const text = event.target.result; 
            const lines = text.replace(/\r/g, "").split("\n").filter(line => line.trim() !== "");
            if (lines.length <= 1) { alert("Archivo vacío o formato incorrecto."); return; }
            
            let importedTxs = [];
            for (let i = 1; i < lines.length; i++) {
                const separador = lines[i].includes(";") ? ";" : ","; 
                const cols = lines[i].split(separador);
                if (cols.length >= 7) {
                    let rawDate = cols[6].trim(); let parsedDate = rawDate;
                    if (rawDate.includes('/')) { 
                        let p = rawDate.split('/'); 
                        if (p.length === 3) parsedDate = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`; 
                    }
                    importedTxs.push({ 
                        id: cols[0].trim(), 
                        ticker: cols[1].trim(), 
                        type: cols[2].trim().toLowerCase().includes("sell") ? "sell" : "buy", 
                        currency: cols[3].trim().toUpperCase() === "USD" ? "USD" : "ARS",
                        qty: Math.abs(parseFloat(cols[4].replace(/,/g, '.'))), 
                        price: parseFloat(cols[5].replace(/,/g, '.')), 
                        date: parsedDate 
                    });
                }
            }
            if (importedTxs.length > 0) {
                if (confirm(`Se leyeron ${importedTxs.length} operaciones de FCI.\n\n¿REEMPLAZAR tu historial actual de fondos?`)) { 
                    fciTransactions = importedTxs; 
                } else { 
                    const existingIds = new Set(fciTransactions.map(t => String(t.id))); 
                    importedTxs.forEach(t => { 
                        if (existingIds.has(String(t.id))) t.id = Date.now() + Math.random(); 
                        fciTransactions.push(t); 
                    }); 
                }
                localStorage.setItem('skyline_fci_txs', JSON.stringify(fciTransactions)); 
                renderFciHistory(); 
                renderFciPortfolio(); 
                alert("¡Fondos importados con éxito!");
            } else alert("Revisá el formato del archivo CSV.");
            fileImportFci.value = ""; 
        }; 
        reader.readAsText(file, 'windows-1252'); 
    });
}

document.addEventListener("DOMContentLoaded", () => { renderFciHistory(); renderFciPortfolio(); });