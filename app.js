import { CONFIG } from "./config.js";
import { initScanner } from "./scanner.js";
import { drawHistoricalChart } from "./history-engine.js"; 
import { initFCI, renderFciPortfolio, renderFciHistory } from "./fci.js";

const txModal = document.getElementById("txModal");
const btnOpenTxModal = document.getElementById("btnOpenTxModal");
const closeTxModal = document.getElementById("closeTxModal");
const transactionForm = document.getElementById("transactionForm");
const txTickerInput = document.getElementById("txTicker");
const tickerSuggestions = document.getElementById("tickerSuggestions");
const portfolioResults = document.getElementById("portfolioResults");
const historyResults = document.getElementById("historyResults");
const currencySwitch = document.getElementById("currencySwitch");
const mepRateText = document.getElementById("mepRateText");
const chartAssetFilter = document.getElementById("chartAssetFilter");
const globalChartAssetFilter = document.getElementById("globalChartAssetFilter");
const marketResults = document.getElementById("results");

export let instruments = [];
export let isUSD = false;
export let currentMepRate = 1000; 
export let historicalMepRates = []; 
export let bolsaTotals = { actInvARS: 0, actInvUSD: 0, actCurARS: 0, actCurUSD: 0, clsInvARS: 0, clsInvUSD: 0, clsProARS: 0, clsProUSD: 0 };
export let bolsaHoldingsArr = [];
export let transactions = JSON.parse(localStorage.getItem('bolsa_transactions')) || [];
export let livePricesMap = {}; 

export function formatMonto(num) { return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0); }
export function getHistoricalMepRate(dateStr) {
    if (!historicalMepRates.length) return currentMepRate;
    const rate = historicalMepRates.find(d => d.fecha <= dateStr);
    return rate ? parseFloat(rate.venta) : currentMepRate;
}

export let lastFciTotals = { actInvARS: 0, actInvUSD: 0, actCurARS: 0, actCurUSD: 0, clsInvARS: 0, clsInvUSD: 0, clsProARS: 0, clsProUSD: 0 };
export let lastFciHoldings = [];
export let lastFciTxs = [];

let globalPieChartInstance = null;
let globalBarChartInstance = null;
let globalLineChartInstance = null;
let pieChartInstance = null;
let barChartInstance = null;
let lineChartInstance = null;
Chart.defaults.color = '#9ca3af'; 

export async function renderGlobalPortfolio(fciTotals = null, fciHoldings = null, fciTxs = null) {
    if(fciTotals) lastFciTotals = fciTotals;
    if(fciHoldings) lastFciHoldings = fciHoldings;
    if(fciTxs) lastFciTxs = fciTxs;

    const fci = lastFciTotals;
    const b = bolsaTotals;
    const sym = isUSD ? "u$s " : "$ ";

    const actInv = isUSD ? (b.actInvUSD + fci.actInvUSD) : (b.actInvARS + fci.actInvARS);
    const actCur = isUSD ? (b.actCurUSD + fci.actCurUSD) : (b.actCurARS + fci.actCurARS);
    const actPnl = actCur - actInv;
    const actPct = actInv > 0 ? (actPnl / actInv) * 100 : 0;
    document.getElementById("globalActiveInvested").innerText = sym + formatMonto(actInv);
    document.getElementById("globalActiveCurrent").innerText = sym + formatMonto(actCur);
    document.getElementById("globalActivePNL").innerText = `${sym}${formatMonto(actPnl)} (${actPct.toFixed(2)}%)`;
    document.getElementById("globalActivePNL").className = actPnl >= 0 ? "positive" : "negative";

    const clsInv = isUSD ? (b.clsInvUSD + fci.clsInvUSD) : (b.clsInvARS + fci.clsInvARS);
    const clsCur = isUSD ? (b.clsProUSD + fci.clsProUSD) : (b.clsProARS + fci.clsProARS);
    const clsPnl = clsCur - clsInv;
    const clsPct = clsInv > 0 ? (clsPnl / clsInv) * 100 : 0;
    document.getElementById("globalClosedInvested").innerText = sym + formatMonto(clsInv);
    document.getElementById("globalClosedCurrent").innerText = sym + formatMonto(clsCur);
    document.getElementById("globalClosedPNL").innerText = `${sym}${formatMonto(clsPnl)} (${clsPct.toFixed(2)}%)`;
    document.getElementById("globalClosedPNL").className = clsPnl >= 0 ? "positive" : "negative";

    const totInv = actInv + clsInv;
    const totCur = actCur + clsCur;
    const totPnl = totCur - totInv;
    const totPct = totInv > 0 ? (totPnl / totInv) * 100 : 0;
    document.getElementById("globalTotalInvested").innerText = sym + formatMonto(totInv);
    document.getElementById("globalTotalCurrent").innerText = sym + formatMonto(totCur);
    document.getElementById("globalTotalPNL").innerText = `${sym}${formatMonto(totPnl)} (${totPct.toFixed(2)}%)`;
    document.getElementById("globalTotalPNL").className = totPnl >= 0 ? "positive" : "negative";

    let combinedHoldings = [...bolsaHoldingsArr, ...lastFciHoldings];
    combinedHoldings.sort((a, b) => b.currentUSD - a.currentUSD);

    let html = combinedHoldings.map(h => {
        let dispCur = isUSD ? h.currentUSD : h.currentARS;
        let dispPnl = isUSD ? h.pnlUSD : h.pnlARS;
        
        // Muestra Precios en MONEDA ORIGEN, y Valor en MONEDA DEL SWITCH
        return `<tr>
            <td><strong>${h.ticker}</strong> <span style="font-size:10px; color:#9ca3af; border:1px solid #374151; padding:2px; border-radius:4px; margin-left:5px;">${h.tag}</span></td>
            <td>${h.qtyStr}</td>
            <td>${h.nativeSym}${formatMonto(h.nativePPC)}</td>
            <td>${h.nativeSym}${formatMonto(h.nativePrice)}</td>
            <td>${sym}${formatMonto(dispCur)}</td>
            <td class="${dispPnl >= 0 ? 'positive' : 'negative'}">${sym}${formatMonto(dispPnl)}</td>
            <td class="${dispPnl >= 0 ? 'positive' : 'negative'}">${h.pnlPct.toFixed(2)}%</td>
        </tr>`;
    }).join("");
    document.getElementById("globalPortfolioResults").innerHTML = html || "<tr><td colspan='7'>Sin activos en cartera</td></tr>";

    let labels = combinedHoldings.map(h => h.ticker);
    let values = combinedHoldings.map(h => isUSD ? h.currentUSD : h.currentARS);
    let pnlPcts = combinedHoldings.map(h => h.pnlPct);
    let colors = pnlPcts.map(p => p >= 0 ? '#00ff00' : '#ff0044');

    if (globalPieChartInstance) { globalPieChartInstance.data.labels = labels; globalPieChartInstance.data.datasets[0].data = values; globalPieChartInstance.update(); } 
    else { 
        globalPieChartInstance = new Chart(document.getElementById('globalPieChart'), { type: 'doughnut', plugins: [ChartDataLabels], data: { labels, datasets: [{ data: values, backgroundColor: ['#00f7ff', '#ff00ff', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'], borderWidth: 0 }] }, options: { plugins: { legend: { position: 'right', labels: {color: '#fff'} }, datalabels: { color: '#fff', font: {weight: 'bold'}, formatter: (value, ctx) => { let sum = 0; ctx.chart.data.datasets[0].data.forEach(data => { sum += data; }); if (sum === 0) return ""; let percentage = (value * 100 / sum); if (percentage < 3) return ""; return percentage.toFixed(1) + "%"; } } } } }); 
    }
    if (globalBarChartInstance) { globalBarChartInstance.data.labels = labels; globalBarChartInstance.data.datasets[0].data = pnlPcts; globalBarChartInstance.data.datasets[0].backgroundColor = colors; globalBarChartInstance.update(); } 
    else { globalBarChartInstance = new Chart(document.getElementById('globalBarChart'), { type: 'bar', plugins: [ChartDataLabels], data: { labels, datasets: [{ data: pnlPcts, backgroundColor: colors }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, datalabels: { color: '#fff', formatter: v => v.toFixed(1) + '%' } } } }); }

    let normalizedFciTxs = lastFciTxs.map(tx => {
        let txMep = getHistoricalMepRate(tx.date);
        let priceARS = tx.currency === 'USD' ? tx.price * txMep : tx.price;
        return { id: tx.id, ticker: tx.ticker, type: tx.type, qty: tx.qty / 1000, price: priceARS, commission: 0, date: tx.date };
    });
    let combinedTxs = [...transactions, ...normalizedFciTxs];
    
    let globalPricesMap = { ...livePricesMap };
    lastFciHoldings.forEach(h => { globalPricesMap[h.ticker] = { c: h.priceARS }; }); // Convierte a ARS para graficar la historia combinada

    const uniqueTickers = [...new Set(combinedTxs.map(t => t.ticker))].sort();
    const currentFilter = globalChartAssetFilter.value;
    if (globalChartAssetFilter.options.length !== uniqueTickers.length + 1) {
        globalChartAssetFilter.innerHTML = '<option value="ALL">Total Cartera</option>';
        uniqueTickers.forEach(t => {
            const opt = document.createElement('option'); opt.value = t; opt.innerText = t;
            if (t === currentFilter) opt.selected = true;
            globalChartAssetFilter.appendChild(opt);
        });
    }

    const filteredTxs = currentFilter === 'ALL' ? combinedTxs : combinedTxs.filter(t => t.ticker === currentFilter);
    try {
        globalLineChartInstance = await drawHistoricalChart(filteredTxs, globalLineChartInstance, isUSD, currentMepRate, historicalMepRates, globalPricesMap, 'globalLineChart');
        applyGlobalChartVisibility();
    } catch (e) {}
}

let currentCategory = "all";
let editingId = null;

txTickerInput.addEventListener("input", () => {
    const val = txTickerInput.value.toUpperCase();
    tickerSuggestions.innerHTML = "";
    if (!val) { tickerSuggestions.style.display = "none"; return; }
    const tickers = Object.keys(livePricesMap);
    const matches = tickers.filter(t => t.includes(val)).slice(0, 8); 
    if (matches.length > 0) {
        tickerSuggestions.style.display = "block";
        matches.forEach(match => { const li = document.createElement("li"); li.textContent = match; li.addEventListener("click", () => { txTickerInput.value = match; tickerSuggestions.style.display = "none"; }); tickerSuggestions.appendChild(li); });
    } else { tickerSuggestions.style.display = "none"; }
});

function setTodayDate() { document.getElementById("txDate").value = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]; }
function openModal() { if(txModal) txModal.classList.add("active"); document.body.style.overflow = "hidden"; if(!editingId) setTodayDate(); }
function closeModal() { if(txModal) txModal.classList.remove("active"); document.body.style.overflow = "auto"; transactionForm.reset(); setTodayDate(); document.getElementById("txComision").value = ""; editingId = null; document.getElementById("formTitle").innerText = "Agregar Transacción"; document.getElementById("btnSubmitTx").innerText = "Guardar"; document.getElementById("btnCancelEdit").style.display = "none"; tickerSuggestions.style.display = "none"; }

if(btnOpenTxModal) btnOpenTxModal.addEventListener("click", openModal);
if(closeTxModal) closeTxModal.addEventListener("click", closeModal);
window.addEventListener("click", (e) => { if (e.target === txModal) closeModal(); });

transactionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("btnSubmitTx"); if (submitBtn.disabled) return; submitBtn.disabled = true; 
    const tickerVal = txTickerInput.value.toUpperCase().trim();
    const typeVal = document.getElementById("txType").value;
    const qtyVal = parseInt(document.getElementById("txQty").value, 10);
    const priceVal = parseFloat(document.getElementById("txPrice").value);
    const commVal = parseFloat(document.getElementById("txComision").value) || 0;
    const dateVal = document.getElementById("txDate").value;

    const newTx = { id: editingId ? editingId : Date.now(), ticker: tickerVal, type: typeVal, qty: Math.abs(qtyVal), price: Math.abs(priceVal), commission: Math.abs(commVal), date: dateVal };
    if (editingId) { const idx = transactions.findIndex(t => t.id === editingId); if (idx !== -1) transactions[idx] = newTx; } else { transactions.push(newTx); }

    localStorage.setItem('bolsa_transactions', JSON.stringify(transactions));
    closeModal(); renderHistory(); renderPortfolio(); 
    setTimeout(() => { submitBtn.disabled = false; }, 500);
});

async function loadData(category = "all") {
    currentCategory = category;
    try {
        const mepRes = await fetch(CONFIG.DOLLAR_API);
        const dolares = await mepRes.json();
        const historicoBolsa = dolares.filter(d => d.casa === "bolsa");
        if (historicoBolsa.length > 0) {
            historicoBolsa.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            historicalMepRates = historicoBolsa;
            currentMepRate = parseFloat(historicoBolsa[0].venta);
            mepRateText.innerText = `(MEP: $${currentMepRate.toFixed(2)})`;
        }
        
        let data = [];
        if (category === "all") {
            const endpoints = Object.values(CONFIG.ENDPOINTS);
            const responses = await Promise.all(endpoints.map(ep => fetch(`${CONFIG.BASE_URL}/${ep}`).then(r => r.json())));
            data = responses.flat();
        } else {
            const response = await fetch(`${CONFIG.BASE_URL}/${CONFIG.ENDPOINTS[category]}`);
            data = await response.json();
        }

        instruments = data;
        instruments.forEach(i => { if(i.symbol) livePricesMap[i.symbol.toUpperCase()] = i; });
        
        renderHistory(); renderPortfolio(); renderMarketTable(); renderFciPortfolio(); 
    } catch (e) { console.error("Error cargando datos:", e); }
}

function renderPortfolio() {
    const holdings = {};
    let activeInvestedARS = 0; let activeInvestedUSD = 0;
    let activeCurrentARS = 0; let activeCurrentUSD = 0;
    let closedProceedsARS = 0; let closedProceedsUSD = 0;
    let closedInvestedARS = 0; let closedInvestedUSD = 0;

    let chartLabels = []; let chartValues = []; let chartColors = []; let chartPnlPct = [];
    bolsaHoldingsArr = []; 

    const uniqueTickers = [...new Set(transactions.map(t => t.ticker))].sort();
    const currentFilter = chartAssetFilter.value;
    
    if (chartAssetFilter.options.length !== uniqueTickers.length + 1) {
        chartAssetFilter.innerHTML = '<option value="ALL">Total Cartera</option>';
        uniqueTickers.forEach(t => {
            const opt = document.createElement('option'); opt.value = t; opt.innerText = t;
            if (t === currentFilter) opt.selected = true; chartAssetFilter.appendChild(opt);
        });
    }

    const sortedTxs = [...transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    sortedTxs.forEach(tx => {
        if (!holdings[tx.ticker]) holdings[tx.ticker] = { qty: 0, investedARS: 0, investedUSD: 0 };
        const txMep = getHistoricalMepRate(tx.date);
        if (tx.type === "buy") {
            const cost = (tx.qty * tx.price) + tx.commission;
            holdings[tx.ticker].qty += tx.qty; holdings[tx.ticker].investedARS += cost; holdings[tx.ticker].investedUSD += (cost / txMep);
        } else if (tx.type === "sell" && holdings[tx.ticker].qty > 0) {
            const soldQty = Math.min(tx.qty, holdings[tx.ticker].qty);
            const avgARS = holdings[tx.ticker].investedARS / holdings[tx.ticker].qty; const avgUSD = holdings[tx.ticker].investedUSD / holdings[tx.ticker].qty;
            closedInvestedARS += (avgARS * soldQty); closedInvestedUSD += (avgUSD * soldQty);
            const proceedsARS = (soldQty * tx.price) - tx.commission;
            closedProceedsARS += proceedsARS; closedProceedsUSD += (proceedsARS / txMep);
            holdings[tx.ticker].qty -= soldQty; holdings[tx.ticker].investedARS -= (avgARS * soldQty); holdings[tx.ticker].investedUSD -= (avgUSD * soldQty);
        }
    });

    const sym = isUSD ? "u$s " : "$ ";
    let html = "";

    for (let t in holdings) {
        const h = holdings[t];
        if (h.qty <= 0.001) continue; 
        const liveData = livePricesMap[t];
        let livePriceARS = liveData && liveData.c ? parseFloat(liveData.c) : (h.investedARS / h.qty);
        const price = isUSD ? livePriceARS / currentMepRate : livePriceARS;
        const invested = isUSD ? h.investedUSD : h.investedARS;
        const currentVal = h.qty * price;
        const pnl = currentVal - invested;
        const pnlP = invested > 0 ? (pnl / invested) * 100 : 0;

        activeInvestedARS += h.investedARS; activeInvestedUSD += h.investedUSD;
        activeCurrentARS += (isUSD ? currentVal * currentMepRate : currentVal); activeCurrentUSD += (isUSD ? currentVal : currentVal / currentMepRate);

        chartLabels.push(t); chartValues.push(currentVal); chartPnlPct.push(pnlP); chartColors.push(pnlP >= 0 ? '#00ff00' : '#ff0044');

        // Empaquetado NATIVO para la vista Global
        bolsaHoldingsArr.push({
            ticker: t, tag: "Bursátil", qtyStr: h.qty.toString(),
            nativeSym: "$ ", nativePPC: h.investedARS / h.qty, nativePrice: livePriceARS,
            currentARS: isUSD ? currentVal * currentMepRate : currentVal, currentUSD: isUSD ? currentVal : currentVal / currentMepRate,
            pnlARS: (isUSD ? currentVal * currentMepRate : currentVal) - h.investedARS, pnlUSD: (isUSD ? currentVal : currentVal / currentMepRate) - h.investedUSD, pnlPct: pnlP
        });

        html += `<tr><td><strong>${t}</strong></td><td>${h.qty}</td><td>${sym}${formatMonto(invested/h.qty)}</td><td>${sym}${formatMonto(price)}</td><td>${sym}${formatMonto(currentVal)}</td><td class="${pnl >= 0 ? 'positive' : 'negative'}">${sym}${formatMonto(pnl)}</td><td class="${pnl >= 0 ? 'positive' : 'negative'}">${pnlP.toFixed(2)}%</td></tr>`;
    }

    portfolioResults.innerHTML = html || "<tr><td colspan='7'>Sin activos en cartera</td></tr>";

    bolsaTotals = { actInvARS: activeInvestedARS, actInvUSD: activeInvestedUSD, actCurARS: activeCurrentARS, actCurUSD: activeCurrentUSD, clsInvARS: closedInvestedARS, clsInvUSD: closedInvestedUSD, clsProARS: closedProceedsARS, clsProUSD: closedProceedsUSD };
    renderGlobalPortfolio(); 

    const dispActiveInv = isUSD ? activeInvestedUSD : activeInvestedARS; const dispActiveCur = isUSD ? activeCurrentUSD : activeCurrentARS; const dispActivePNL = dispActiveCur - dispActiveInv;
    document.getElementById("activeInvested").innerText = sym + formatMonto(dispActiveInv); document.getElementById("activeCurrent").innerText = sym + formatMonto(dispActiveCur); document.getElementById("activePNL").innerText = `${sym}${formatMonto(dispActivePNL)} (${(dispActiveInv > 0 ? (dispActivePNL / dispActiveInv * 100) : 0).toFixed(2)}%)`; document.getElementById("activePNL").className = dispActivePNL >= 0 ? "positive" : "negative";

    const dispClosedInv = isUSD ? closedInvestedUSD : closedInvestedARS; const dispClosedCur = isUSD ? closedProceedsUSD : closedProceedsARS; const dispClosedPNL = dispClosedCur - dispClosedInv;
    document.getElementById("closedInvested").innerText = sym + formatMonto(dispClosedInv); document.getElementById("closedCurrent").innerText = sym + formatMonto(dispClosedCur); document.getElementById("closedPNL").innerText = `${sym}${formatMonto(dispClosedPNL)} (${(dispClosedInv > 0 ? (dispClosedPNL / dispClosedInv * 100) : 0).toFixed(2)}%)`; document.getElementById("closedPNL").className = dispClosedPNL >= 0 ? "positive" : "negative";

    const dispTotalInv = dispActiveInv + dispClosedInv; const dispTotalCur = dispActiveCur + dispClosedCur; const dispTotalPNL = dispTotalCur - dispTotalInv;
    document.getElementById("totalInvested").innerText = sym + formatMonto(dispTotalInv); document.getElementById("totalCurrent").innerText = sym + formatMonto(dispTotalCur); document.getElementById("totalPNL").innerText = `${sym}${formatMonto(dispTotalPNL)} (${(dispTotalInv > 0 ? (dispTotalPNL / dispTotalInv * 100) : 0).toFixed(2)}%)`; document.getElementById("totalPNL").className = dispTotalPNL >= 0 ? "positive" : "negative";

    updateCharts(chartLabels, chartValues, chartPnlPct, chartColors);
}

const toggleNominal = document.getElementById("toggleNominal"); const togglePct = document.getElementById("togglePct");
const globalToggleNominal = document.getElementById("globalToggleNominal"); const globalTogglePct = document.getElementById("globalTogglePct");

function applyChartVisibility() { if (lineChartInstance) { lineChartInstance.data.datasets[0].hidden = !toggleNominal.checked; lineChartInstance.options.scales.y.display = toggleNominal.checked; lineChartInstance.data.datasets[1].hidden = !togglePct.checked; lineChartInstance.options.scales.y1.display = togglePct.checked; lineChartInstance.update(); } }
function applyGlobalChartVisibility() { if (globalLineChartInstance) { globalLineChartInstance.data.datasets[0].hidden = !globalToggleNominal.checked; globalLineChartInstance.options.scales.y.display = globalToggleNominal.checked; globalLineChartInstance.data.datasets[1].hidden = !globalTogglePct.checked; globalLineChartInstance.options.scales.y1.display = globalTogglePct.checked; globalLineChartInstance.update(); } }

toggleNominal.addEventListener("change", applyChartVisibility); togglePct.addEventListener("change", applyChartVisibility);
globalToggleNominal.addEventListener("change", applyGlobalChartVisibility); globalTogglePct.addEventListener("change", applyGlobalChartVisibility);

async function updateCharts(labels, values, pnlPcts, colors) {
    if (pieChartInstance) { pieChartInstance.data.labels = labels; pieChartInstance.data.datasets[0].data = values; pieChartInstance.update(); } 
    else { pieChartInstance = new Chart(document.getElementById('pieChart'), { type: 'doughnut', plugins: [ChartDataLabels], data: { labels, datasets: [{ data: values, backgroundColor: ['#00f7ff', '#ff00ff', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6'], borderWidth: 0 }] }, options: { plugins: { legend: { position: 'right', labels: {color: '#fff'} }, datalabels: { color: '#fff', font: {weight: 'bold'}, formatter: (value, ctx) => { let sum = 0; ctx.chart.data.datasets[0].data.forEach(data => { sum += data; }); if (sum === 0) return ""; let percentage = (value * 100 / sum); if (percentage < 3) return ""; return percentage.toFixed(1) + "%"; } } } } }); }
    if (barChartInstance) { barChartInstance.data.labels = labels; barChartInstance.data.datasets[0].data = pnlPcts; barChartInstance.data.datasets[0].backgroundColor = colors; barChartInstance.update(); } 
    else { barChartInstance = new Chart(document.getElementById('barChart'), { type: 'bar', plugins: [ChartDataLabels], data: { labels, datasets: [{ data: pnlPcts, backgroundColor: colors }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, datalabels: { color: '#fff', formatter: v => v.toFixed(1) + '%' } } } }); }
    const filterVal = document.getElementById("chartAssetFilter").value; const filteredTxs = filterVal === 'ALL' ? [...transactions] : transactions.filter(t => t.ticker === filterVal);
    try { lineChartInstance = await drawHistoricalChart(filteredTxs, lineChartInstance, isUSD, currentMepRate, historicalMepRates, livePricesMap, 'lineChart'); applyChartVisibility(); } catch (error) {}
}

function renderHistory() {
    const sym = isUSD ? "u$s " : "$ ";
    historyResults.innerHTML = transactions.map(tx => `<tr><td>${tx.date}</td><td><strong>${tx.ticker}</strong></td><td class="${tx.type==='buy'?'positive':'negative'}">${tx.type==='buy'?'Compra':'Venta'}</td><td>${tx.qty}</td><td>${sym}${formatMonto(tx.price)}</td><td>${sym}${formatMonto(tx.commission)}</td><td><div class="action-buttons"><button class="btn-edit" data-id="${tx.id}">Editar</button><button class="btn-delete" data-id="${tx.id}">X</button></div></td></tr>`).join("");
}

historyResults.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("btn-delete")) {
        const idToProcess = target.dataset.id;
        if(confirm("¿Eliminar transacción?")) { transactions = transactions.filter(t => String(t.id) !== String(idToProcess)); localStorage.setItem('bolsa_transactions', JSON.stringify(transactions)); renderHistory(); renderPortfolio(); }
    } else if (target.classList.contains("btn-edit")) {
        const idToProcess = target.dataset.id; const tx = transactions.find(t => String(t.id) === String(idToProcess));
        if(tx) { editingId = tx.id; document.getElementById("txTicker").value = tx.ticker; document.getElementById("txType").value = tx.type; document.getElementById("txQty").value = tx.qty; document.getElementById("txPrice").value = tx.price; document.getElementById("txComision").value = tx.commission || ""; document.getElementById("txDate").value = tx.date; document.getElementById("formTitle").innerText = "Editando Transacción"; document.getElementById("btnCancelEdit").style.display = "block"; openModal(); }
    }
});

function renderMarketTable() {
    const sym = isUSD ? "u$s " : "$ "; const search = document.getElementById("searchInput").value.toLowerCase();
    marketResults.innerHTML = instruments.filter(i => i.symbol && i.symbol.toLowerCase().includes(search)).map(item => { const p = isUSD ? parseFloat(item.c) / currentMepRate : parseFloat(item.c); return `<tr><td>${item.symbol}</td><td>${sym}${formatMonto(p)}</td><td class="${item.pct_change >= 0 ? 'positive' : 'negative'}">${item.pct_change}%</td><td>${formatMonto(parseFloat(item.v))}</td><td>${formatMonto(parseFloat(item.px_bid))}</td><td>${formatMonto(parseFloat(item.px_ask))}</td></tr>`; }).join("");
}

document.getElementById("searchInput").addEventListener("keyup", renderMarketTable); document.getElementById("btnCancelEdit").onclick = closeModal;

currencySwitch.addEventListener("change", (e) => { isUSD = e.target.checked; renderPortfolio(); renderHistory(); renderMarketTable(); renderFciPortfolio(); renderFciHistory(); });
chartAssetFilter.addEventListener("change", renderPortfolio);
globalChartAssetFilter.addEventListener("change", renderGlobalPortfolio);

document.querySelectorAll(".tab-btn").forEach(btn => { 
    btn.addEventListener("click", () => { 
        document.querySelectorAll(".tab-btn, .view-section").forEach(el => el.classList.remove("active")); 
        btn.classList.add("active"); document.getElementById(btn.dataset.target).classList.add("active"); 
        if(btn.dataset.target === "usaScannerView") initScanner(); 
        if(btn.dataset.target === "fciView") initFCI();
    }); 
});

document.getElementById("btnExport").addEventListener("click", () => {
    if (transactions.length === 0) { alert("No hay transacciones para exportar."); return; }
    let csvContent = "\uFEFFid;ticker;type;qty;price;commission;date\n";
    transactions.forEach(t => { const pTxt = t.price.toString().replace('.', ','); const cTxt = t.commission.toString().replace('.', ','); csvContent += `${t.id};${t.ticker};${t.type};${t.qty};${pTxt};${cTxt};${t.date}\n`; });
    const hoy = new Date(); const fechaTxt = hoy.toISOString().split('T')[0];
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", `skyline_transacciones_${fechaTxt}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

const btnImport = document.getElementById("btnImport"); const fileImport = document.getElementById("fileImport");
btnImport.addEventListener("click", () => fileImport.click()); 
fileImport.addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result; const lines = text.replace(/\r/g, "").split("\n").filter(line => line.trim() !== "");
        if (lines.length <= 1) { alert("Archivo vacío o formato incorrecto."); return; }
        let importedTxs = [];
        for (let i = 1; i < lines.length; i++) {
            const separador = lines[i].includes(";") ? ";" : ","; const cols = lines[i].split(separador);
            if (cols.length >= 7) {
                let rawDate = cols[6].trim(); let parsedDate = rawDate;
                if (rawDate.includes('/')) { let p = rawDate.split('/'); if (p.length === 3) parsedDate = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`; }
                importedTxs.push({ id: cols[0].trim(), ticker: cols[1].trim().toUpperCase(), type: cols[2].trim().toLowerCase().includes("sell") ? "sell" : "buy", qty: Math.abs(parseInt(cols[3].replace(/,/g, '.'))), price: parseFloat(cols[4].replace(/,/g, '.')), commission: parseFloat(cols[5].replace(/,/g, '.')) || 0, date: parsedDate });
            }
        }
        if (importedTxs.length > 0) {
            if (confirm(`Se leyeron ${importedTxs.length} transacciones.\n\n¿REEMPLAZAR tu cartera actual?`)) { transactions = importedTxs; } 
            else { const existingIds = new Set(transactions.map(t => String(t.id))); importedTxs.forEach(t => { if (existingIds.has(String(t.id))) t.id = Date.now() + Math.random(); transactions.push(t); }); }
            localStorage.setItem('bolsa_transactions', JSON.stringify(transactions)); renderHistory(); renderPortfolio(); alert("¡Importado con éxito!");
        } else alert("Revisá el formato del archivo.");
        fileImport.value = ""; 
    }; reader.readAsText(file);
});

setTodayDate(); loadData("all"); setInterval(() => loadData(currentCategory), 30000);