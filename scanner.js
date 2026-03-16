import { CONFIG } from "./config.js";

const searchScannerInput = document.getElementById("searchScannerInput");
const toggleScannerViewBtn = document.getElementById("toggleScannerViewBtn");
const btnRefreshScanner = document.getElementById("btnRefreshScanner");
const scannerListView = document.getElementById("scannerListView");
const scannerDetailView = document.getElementById("scannerDetailView");
const btnBackToScanner = document.getElementById("btnBackToScanner");
const scannerDetailContent = document.getElementById("scannerDetailContent");

const scannerTechContainer = document.getElementById("scannerTechContainer");
const scannerFundContainer = document.getElementById("scannerFundContainer");
const scannerTechResults = document.getElementById("scannerTechResults");
const scannerFundResults = document.getElementById("scannerFundResults");

let scannerViewMode = 'fund'; 
let scannerData = [];
let hasLoaded = false;

const CACHE_KEY = 'skyline_sheets_scanner_data';
const CACHE_EXPIRATION = 12 * 60 * 60 * 1000; 

export async function initScanner(forceRefresh = false) {
    if (hasLoaded && !forceRefresh) return;
    
    scannerFundResults.innerHTML = "<tr><td colspan='12' style='text-align:center; padding: 30px;'>Actualizando activos e índices... 🚀</td></tr>";
    scannerTechResults.innerHTML = "<tr><td colspan='11' style='text-align:center; padding: 30px;'>Actualizando activos e índices... 🚀</td></tr>";

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached && !forceRefresh) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_EXPIRATION) {
            scannerData = parsed.data;
            hasLoaded = true;
            renderScanner();
            return;
        }
    }

    try {
        let rawFundData = {};
        const sheetRes = await fetch(CONFIG.SHEETS_CSV_URL);
        const csvText = await sheetRes.text();
        
        const rows = csvText.split('\n').slice(1);
        const allTickers = [];

        rows.forEach(row => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length >= 11) {
                const ticker = cols[0].trim().replace(/"/g, '');
                if (!ticker) return;
                
                allTickers.push(ticker);
                rawFundData[ticker] = {
                    tickerGoogle: cols[1] ? cols[1].trim().replace(/"/g, '') : '',
                    price: parseFloat(cols[2].replace(/"/g, '')) || 0,
                    name: cols[3] ? cols[3].trim().replace(/"/g, '') : '',
                    pe: parseFloat(cols[4].replace(/"/g, '')) || null,
                    eps: parseFloat(cols[5].replace(/"/g, '')) || null,
                    mcap: parseFloat(cols[6].replace(/"/g, '')) || null,
                    volAvg: parseFloat(cols[7].replace(/"/g, '')) || null,
                    yearHigh: parseFloat(cols[8].replace(/"/g, '')) || null,
                    yearLow: parseFloat(cols[9].replace(/"/g, '')) || null,
                    beta: parseFloat(cols[10].replace(/"/g, '')) || null
                };
            }
        });

        const txs = JSON.parse(localStorage.getItem('bolsa_transactions')) || [];
        const userTickers = txs.map(t => t.ticker.replace('.BA', '')); 
        const finalTickers = [...new Set([...allTickers, ...userTickers])];

        const technicalData = await calculateTechnicalsMassive(finalTickers, rawFundData);

        let rawMapped = finalTickers.map(ticker => {
            const fund = rawFundData[ticker] || {};
            const tech = technicalData[ticker] || {};
            
            let validName = fund.name;
            if (!validName || validName === '' || validName.includes('#N/A')) validName = '-';

            let currency = 'USD';
            let nameLower = validName.toLowerCase();
            let tGoogle = fund.tickerGoogle || '';
            
            if (tGoogle.startsWith('BCBA:') || ticker.includes('.BA') || nameLower.includes('cedear') || nameLower.includes('cdr')) {
                currency = 'ARS';
            }

            let earnYield = null;
            if (fund.pe && fund.pe > 0) {
                earnYield = (1 / fund.pe) * 100;
            }

            let distHigh = null, distLow = null;
            let currentPrice = fund.price || tech.currentPrice || 0;
            if (currentPrice > 0 && fund.yearHigh) distHigh = ((currentPrice - fund.yearHigh) / fund.yearHigh) * 100;
            if (currentPrice > 0 && fund.yearLow) distLow = ((currentPrice - fund.yearLow) / fund.yearLow) * 100;

            return {
                ticker: ticker,
                tickerGoogle: tGoogle,
                name: validName,
                currency: currency, 
                price: currentPrice,
                
                mcap: fund.mcap || null,
                pe: fund.pe || null,
                eps: fund.eps || null,
                beta: fund.beta || null, 
                volAvg: fund.volAvg || null,
                yearHigh: fund.yearHigh || null,
                yearLow: fund.yearLow || null,
                earnYield: earnYield,
                distHigh: distHigh,
                distLow: distLow,
                perf1M: tech.perf1M || null,
                perf6M: tech.perf6M || null,
                perf1Y: tech.perf1Y || null,
                
                changePct: tech.changePct || null,
                sma20: tech.sma20 || null,
                sma50: tech.sma50 || null,
                sma200: tech.sma200 || null,
                ema20: tech.ema20 || null,
                ema50: tech.ema50 || null,
                distSMA200: tech.distSMA200 || null,
                crossStatus: tech.crossStatus || '-',
                rsi: tech.rsi || null,
                mfi: tech.mfi || null,
                macd: tech.macd || null,
                stochK: tech.stochK || null,
                atr: tech.atr || null,
                bollUpper: tech.bollUpper || null,
                bollLower: tech.bollLower || null
            };
        });

        let uniqueData = [];
        rawMapped.forEach(item => {
            if (item.price > 0 && item.name !== '-') {
                let isClone = false;
                let t = item.ticker.toUpperCase();
                let lastChar = t.slice(-1);
                
                if (lastChar === 'C' || lastChar === 'D') {
                    let baseTicker = t.slice(0, -1);
                    let baseItem = rawMapped.find(x => x.ticker.toUpperCase() === baseTicker);
                    
                    if (baseItem && baseItem.name !== '-') {
                        let nameClone = item.name.toLowerCase();
                        let nameBase = baseItem.name.toLowerCase();
                        
                        if (nameClone.includes('cedear') || nameClone.includes('cdr')) {
                            isClone = true;
                        } else {
                            let prefixClone = nameClone.replace(/[^a-z]/g, '').substring(0, 4);
                            let prefixBase = nameBase.replace(/[^a-z]/g, '').substring(0, 4);
                            if (prefixClone === prefixBase) {
                                isClone = true;
                            }
                        }
                    }
                }
                if (!isClone) uniqueData.push(item);
            }
        });

        scannerData = uniqueData.sort((a, b) => a.ticker.localeCompare(b.ticker));
        
        if (scannerData.length > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: scannerData }));
        }
        hasLoaded = true;
        renderScanner();

    } catch (error) {
        console.error("Error Crítico en Scanner:", error);
    }
}

// --- ALGORITMOS TÉCNICOS ---
async function calculateTechnicalsMassive(tickers, rawFundData) {
    let techMap = {};
    const oneYearAgo = Math.floor(Date.now() / 1000) - (400 * 86400); 
    const now = Math.floor(Date.now() / 1000);

    await Promise.allSettled(tickers.map(async (ticker) => {
        let yhTicker = ticker;
        let fund = rawFundData[ticker] || {};
        let tGoogle = fund.tickerGoogle || '';

        if (tGoogle.startsWith('BCBA:')) yhTicker = ticker + '.BA';
        else if (['PETR3', 'ABEV3', 'VALE3'].includes(ticker)) yhTicker = ticker + '.SA'; 
        
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yhTicker}?period1=${oneYearAgo}&period2=${now}&interval=1d`;
        const proxyUrl = `${CONFIG.PROXY_URL}${encodeURIComponent(targetUrl)}`;
        
        try {
            const res = await fetch(proxyUrl);
            if (!res.ok) return;
            const data = await res.json();
            
            const result = data.chart.result[0];
            const quote = result.indicators.quote[0];
            
            let closes=[], highs=[], lows=[], volumes=[];
            for(let i=0; i<quote.close.length; i++){
                if(quote.close[i] !== null && quote.high[i] !== null && quote.low[i] !== null && quote.volume[i] !== null) {
                    closes.push(quote.close[i]); highs.push(quote.high[i]); lows.push(quote.low[i]); volumes.push(quote.volume[i]);
                }
            }
            
            if (closes.length > 50) {
                const len = closes.length;
                const currentPrice = closes[len - 1];

                let dailyChange = len >= 2 ? (((currentPrice - closes[len - 2]) / closes[len - 2]) * 100) : null;
                let perf1M = len >= 21 ? (((currentPrice - closes[len - 21]) / closes[len - 21]) * 100) : null;
                let perf6M = len >= 126 ? (((currentPrice - closes[len - 126]) / closes[len - 126]) * 100) : null;
                let perf1Y = len >= 252 ? (((currentPrice - closes[len - 252]) / closes[len - 252]) * 100) : null;

                const sma50 = calcSMA(closes, 50); const sma200 = calcSMA(closes, 200);
                
                let distSMA200 = null;
                if (sma200 && sma200 > 0) distSMA200 = ((currentPrice - sma200) / sma200) * 100;

                let crossStatus = '-';
                if (sma50 && sma200) crossStatus = sma50 > sma200 ? 'Golden Cross 📈' : 'Death Cross 📉';

                techMap[ticker] = {
                    currentPrice: currentPrice, changePct: dailyChange ? dailyChange.toFixed(2) : null,
                    perf1M: perf1M ? perf1M.toFixed(2) : null, perf6M: perf6M ? perf6M.toFixed(2) : null, perf1Y: perf1Y ? perf1Y.toFixed(2) : null,
                    rsi: calcRSI(closes, 14), mfi: calcMFI(highs, lows, closes, volumes, 14), macd: calcMACD(closes),
                    stochK: calcStoch(highs, lows, closes, 14), atr: calcATR(highs, lows, closes, 14),
                    sma20: calcSMA(closes, 20), sma50: sma50, sma200: sma200, ema20: calcEMA(closes, 20), ema50: calcEMA(closes, 50),
                    distSMA200: distSMA200 ? distSMA200.toFixed(2) : null, crossStatus: crossStatus,
                    ...calcBollinger(closes, 20, 2)
                };
            }
        } catch (e) {}
    }));
    return techMap;
}

function calcSMA(data, period) { if (data.length < period) return null; let sum = 0; for (let i = data.length - period; i < data.length; i++) sum += data[i]; return +(sum / period).toFixed(2); }
function calcEMA(data, period) { if (data.length < period) return null; const k = 2 / (period + 1); let ema = data.slice(0, period).reduce((a,b)=>a+b) / period; for (let i = period; i < data.length; i++) ema = (data[i] * k) + (ema * (1 - k)); return +ema.toFixed(2); }
function calcRSI(data, period) { if (data.length < period + 1) return null; let gains = 0, losses = 0; for (let i = data.length - period; i < data.length; i++) { let diff = data[i] - data[i - 1]; if (diff >= 0) gains += diff; else losses -= diff; } let rs = (gains / period) / (losses / period || 1); return +(100 - (100 / (1 + rs))).toFixed(2); }
function calcMFI(highs, lows, closes, volumes, period) { if (closes.length < period + 1) return null; let posMF = 0, negMF = 0; for (let i = closes.length - period; i < closes.length; i++) { let typicalPrice = (highs[i] + lows[i] + closes[i]) / 3; let prevTypical = (highs[i-1] + lows[i-1] + closes[i-1]) / 3; let moneyFlow = typicalPrice * volumes[i]; if (typicalPrice > prevTypical) posMF += moneyFlow; else if (typicalPrice < prevTypical) negMF += moneyFlow; } let ratio = posMF / (negMF || 1); return +(100 - (100 / (1 + ratio))).toFixed(2); }
function calcMACD(data) { const ema12 = calcEMA(data, 12); const ema26 = calcEMA(data, 26); if(!ema12 || !ema26) return null; return +(ema12 - ema26).toFixed(2); }
function calcStoch(highs, lows, closes, period) { if (closes.length < period) return null; let recentHighs = highs.slice(-period); let recentLows = lows.slice(-period); let highestHigh = Math.max(...recentHighs); let lowestLow = Math.min(...recentLows); let currentClose = closes[closes.length - 1]; if(highestHigh === lowestLow) return 50; return +(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100).toFixed(2); }
function calcATR(highs, lows, closes, period) { if (closes.length < period + 1) return null; let trSum = 0; for (let i = closes.length - period; i < closes.length; i++) { let h = highs[i], l = lows[i], prevC = closes[i-1]; let tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)); trSum += tr; } return +(trSum / period).toFixed(2); }
function calcBollinger(data, period, multiplier) { const sma = calcSMA(data, period); if(!sma) return { bollUpper: null, bollLower: null }; let slice = data.slice(-period); let variance = slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / period; let stdDev = Math.sqrt(variance); return { bollUpper: +(sma + (stdDev * multiplier)).toFixed(2), bollLower: +(sma - (stdDev * multiplier)).toFixed(2) }; }
function fmtBigNum(value) { if (!value) return '-'; if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B'; if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M'; return value.toLocaleString(); }

function getColor(val, type) { 
    if (val === null || val === '-') return 'neutral'; 
    const num = parseFloat(val); 
    if (type === 'pe') { if (num < 0) return 'negative'; if (num < 15) return 'positive'; if (num > 25) return 'negative'; return 'warning'; } 
    if (type === 'eps') { return num > 0 ? 'positive' : 'negative'; } 
    if (type === 'beta') { if (num < 1) return 'positive'; if (num > 1.2) return 'negative'; return 'warning'; } 
    if (type === 'rsi' || type === 'mfi') { if (num > 70) return 'negative'; if (num < 30) return 'positive'; return 'warning'; } 
    if (type === 'macd') { return num > 0 ? 'positive' : 'negative'; } 
    if (type === 'stoch') { if (num > 80) return 'negative'; if (num < 20) return 'positive'; return 'warning'; } 
    if (type === 'change') { return num >= 0 ? 'positive' : 'negative'; } 
    if (type === 'distSMA') { if (num > 30) return 'negative'; if (num < -15) return 'positive'; return 'warning'; } 
    if (type === 'ey') { if (num < 3) return 'negative'; if (num > 5) return 'positive'; return 'warning'; } 
    return 'neutral'; 
}

function matchSearchScanner(text, searchStr) { 
    if (!searchStr) return true; 
    const normalize = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); 
    const normalizedText = normalize(text); 
    const terms = normalize(searchStr).split(/\s+/).filter(t => t); 
    return terms.every(term => normalizedText.includes(term)); 
}

function renderScanner() {
    const search = searchScannerInput.value.trim();
    let filtered = scannerData;
    if (search !== "") filtered = scannerData.filter(item => matchSearchScanner(`${item.ticker} ${item.name}`, search));
    if (scannerViewMode === 'tech') buildTechTable(filtered); else buildFundTable(filtered);
}

btnRefreshScanner.addEventListener("click", () => { initScanner(true); });
searchScannerInput.addEventListener("keyup", renderScanner); 
toggleScannerViewBtn.addEventListener("click", () => {
    if (scannerViewMode === 'tech') {
        scannerViewMode = 'fund'; toggleScannerViewBtn.innerText = "Ver Técnico";
        scannerTechContainer.style.display = "none"; scannerFundContainer.style.display = "block";
    } else {
        scannerViewMode = 'tech'; toggleScannerViewBtn.innerText = "Ver Fundamental";
        scannerFundContainer.style.display = "none"; scannerTechContainer.style.display = "block";
    }
    renderScanner();
});

function buildFundTable(data) {
    scannerFundResults.innerHTML = "";
    if (data.length === 0) return;
    document.querySelector("#scannerFundContainer th:nth-child(3)").innerText = "Moneda";

    // Actualizamos Tooltips de las columnas
    document.querySelector("#scannerFundContainer th:nth-child(5)").innerHTML = `Market Cap <div class="tooltip">?<div class="tooltiptext">Tamaño total de la empresa en bolsa.<br><br>Large Cap: > $10B<br>Mid Cap: $2B - $10B<br>Small Cap: < $2B</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(6)").innerHTML = `PER <div class="tooltip">?<div class="tooltiptext">Años para recuperar la inversión.<br><br><b style="color:#00ff00">Comprar (Barato):</b> < 15<br><b style="color:#ff0044">Vender (Caro):</b> > 25</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(7)").innerHTML = `BPA (EPS) <div class="tooltip">?<div class="tooltiptext">Beneficio neto por cada acción.<br><br><b style="color:#00ff00">Comprar:</b> > 0 (Gana dinero)<br><b style="color:#ff0044">Vender:</b> < 0 (Da pérdidas)</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(8)").innerHTML = `Beta <div class="tooltip">?<div class="tooltiptext">Volatilidad frente al mercado global.<br><br><b style="color:#00ff00">Defensiva:</b> < 1.0<br><b style="color:#ff0044">Agresiva:</b> > 1.2</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(9)").innerHTML = `Earn. Yield <div class="tooltip">?<div class="tooltiptext">Rentabilidad real anual de la empresa (Inversa del PER).<br><br><b style="color:#00ff00">Comprar:</b> > 5%<br><b style="color:#ff0044">Vender:</b> < 3%</div></div>`;

    scannerFundResults.innerHTML = data.map(item => {
        const sym = item.currency === 'USD' ? 'u$s' : '$';
        const colorMoneda = item.currency === 'USD' ? '#10b981' : '#00f7ff';
        const priceDisp = item.currency === 'ARS' ? new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(item.price) : item.price.toFixed(2);

        return `
            <tr class="scanner-row" data-ticker="${item.ticker}">
                <td><strong>${item.ticker}</strong></td>
                <td><small style="color:#9ca3af;">${item.name.substring(0, 15)}</small></td>
                <td><small style="color:${colorMoneda}; font-weight:bold;">${item.currency}</small></td>
                <td>${sym} ${priceDisp}</td>
                <td style="color:#00f7ff;">${fmtBigNum(item.mcap)}</td>
                <td class="${getColor(item.pe, 'pe')}">${item.pe ? item.pe.toFixed(2) : '-'}</td>
                <td class="${getColor(item.eps, 'eps')}">${item.eps ? item.eps.toFixed(2) : '-'}</td>
                <td class="${getColor(item.beta, 'beta')}">${item.beta ? item.beta.toFixed(2) : '-'}</td>
                <td class="${getColor(item.earnYield, 'ey')}">${item.earnYield ? item.earnYield.toFixed(2) + '%' : '-'}</td>
                <td>${fmtBigNum(item.volAvg)}</td>
                <td style="color:#f59e0b;">${item.yearLow ? item.yearLow.toFixed(2) : '-'}</td>
                <td style="color:#00ff00;">${item.yearHigh ? item.yearHigh.toFixed(2) : '-'}</td>
            </tr>
        `;
    }).join("");
}

function buildTechTable(data) {
    scannerTechResults.innerHTML = "";
    if (data.length === 0) return;

    // Actualizamos Tooltips de las columnas
    document.querySelector("#scannerTechContainer th:nth-child(3)").innerHTML = `RSI 14 <div class="tooltip">?<div class="tooltiptext">Índice de Fuerza Relativa.<br><br><b style="color:#00ff00">Comprar:</b> < 35 (Sobreventa)<br><b style="color:#ff0044">Vender:</b> > 65 (Sobrecompra)</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(4)").innerHTML = `MACD <div class="tooltip">?<div class="tooltiptext">Convergencia/Divergencia de Medias.<br><br><b style="color:#00ff00">Comprar:</b> > 0 (Fuerza alcista)<br><b style="color:#ff0044">Vender:</b> < 0 (Fuerza bajista)</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(5)").innerHTML = `Stoch %K <div class="tooltip">?<div class="tooltiptext">Oscilador Estocástico.<br><br><b style="color:#00ff00">Comprar:</b> < 20 (Sobreventa)<br><b style="color:#ff0044">Vender:</b> > 80 (Sobrecompra)</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(9)").innerHTML = `Boll Sup <div class="tooltip">?<div class="tooltiptext">Techo probabilístico del precio.<br><br><b style="color:#ff0044">Vender/Alerta:</b> Si el precio lo toca o supera.</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(10)").innerHTML = `Boll Inf <div class="tooltip">?<div class="tooltiptext">Piso probabilístico del precio.<br><br><b style="color:#00ff00">Comprar/Rebote:</b> Si el precio lo perfora o toca.</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(11)").innerHTML = `Tendencia <div class="tooltip">?<div class="tooltiptext">Cruce de Medias Móviles.<br><br><b style="color:#00ff00">Comprar (Golden):</b> SMA 50 > 200<br><b style="color:#ff0044">Vender (Death):</b> SMA 50 < 200</div></div>`;

    scannerTechResults.innerHTML = data.map(item => {
        let trendColor = item.crossStatus.includes('Golden') ? 'positive' : (item.crossStatus.includes('Death') ? 'negative' : 'warning');
        const sym = item.currency === 'USD' ? 'u$s' : '$';
        const priceDisp = item.currency === 'ARS' ? new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(item.price) : item.price.toFixed(2);

        return `
            <tr class="scanner-row" data-ticker="${item.ticker}">
                <td><strong>${item.ticker}</strong></td>
                <td>${sym} ${priceDisp}</td>
                <td class="${getColor(item.rsi, 'rsi')}" style="font-weight: bold;">${item.rsi || '-'}</td>
                <td class="${getColor(item.macd, 'macd')}">${item.macd || '-'}</td>
                <td class="${getColor(item.stochK, 'stoch')}">${item.stochK || '-'}</td>
                <td>${item.sma20 || '-'}</td>
                <td>${item.sma50 ? item.sma50.toFixed(2) : '-'}</td>
                <td style="border-right: 1px dashed #374151;">${item.sma200 ? item.sma200.toFixed(2) : '-'}</td>
                <td style="color:#ff0044;">${item.bollUpper || '-'}</td>
                <td style="color:#00ff00;">${item.bollLower || '-'}</td>
                <td class="${trendColor}" style="font-weight: bold;">${item.crossStatus.split(' ')[0]}</td>
            </tr>
        `;
    }).join("");
}

document.getElementById("scannerTechResults")?.addEventListener("click", (e) => { const row = e.target.closest('.scanner-row'); if (row && row.dataset.ticker) showAssetDetail(row.dataset.ticker); });
document.getElementById("scannerFundResults")?.addEventListener("click", (e) => { const row = e.target.closest('.scanner-row'); if (row && row.dataset.ticker) showAssetDetail(row.dataset.ticker); });

// --- VISTA DETALLE CON TOOLTIPS ESTANDARIZADOS ---
function showAssetDetail(ticker) {
    const item = scannerData.find(d => d.ticker === ticker);
    if (!item) return;

    scannerListView.style.display = "none";
    scannerDetailView.style.display = "block";

    let tvTicker = item.tickerGoogle && item.tickerGoogle.startsWith('BCBA:') ? item.tickerGoogle : item.ticker;
    const sym = item.currency === 'USD' ? 'u$s' : '$';
    const priceDisp = item.currency === 'ARS' ? new Intl.NumberFormat('es-AR', {maximumFractionDigits: 0}).format(item.price) : item.price.toFixed(2);

    let score6M = 0;
    if (item.rsi !== null) { if (item.rsi > 30 && item.rsi < 55) score6M++; else if (item.rsi > 65) score6M--; }
    if (item.macd !== null) { if (item.macd > 0) score6M++; else score6M--; }
    if (item.price !== null && item.ema50 !== null) { if (item.price > item.ema50) score6M++; else score6M--; }
    if (item.eps !== null) { if (item.eps > 0) score6M++; else score6M--; } 
    if (item.perf1M !== null) { if (item.perf1M > 0) score6M++; else score6M--; } 

    let signal6M = "NEUTRAL"; let color6M = "#f59e0b"; 
    if (score6M >= 2) { signal6M = "COMPRAR"; color6M = "#00ff00"; }
    else if (score6M <= -1) { signal6M = "VENDER"; color6M = "#ff0044"; }

    let score3Y = 0;
    if (item.pe !== null) { if (item.pe > 0 && item.pe < 18) score3Y++; else if (item.pe > 25 || item.pe < 0) score3Y--; }
    if (item.eps !== null) { if (item.eps > 0) score3Y++; else score3Y--; }
    if (item.earnYield !== null) { if (item.earnYield > 5) score3Y++; }
    if (item.distHigh !== null) { if (item.distHigh < -20) score3Y++; else if (item.distHigh > -5) score3Y--; }
    if (item.distSMA200 !== null) { if (item.distSMA200 > 30) score3Y--; }
    if (item.crossStatus.includes('Golden')) score3Y++;

    let signal3Y = "NEUTRAL"; let color3Y = "#f59e0b";
    if (score3Y >= 2) { signal3Y = "COMPRAR"; color3Y = "#00ff00"; }
    else if (score3Y <= -1) { signal3Y = "VENDER"; color3Y = "#ff0044"; }

    scannerDetailContent.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; background: rgba(255,255,255,0.02); padding: 15px 25px; border-radius: 12px; border: 1px solid #1f2937;">
            <div>
                <h2 style="color: #00f7ff; margin:0; font-size: 28px;">${item.ticker} <span style="font-size: 18px; color: #9ca3af;">(${sym} ${priceDisp})</span></h2>
                <span style="color:#9ca3af; font-size: 14px;">${item.name} | Moneda: ${item.currency}</span>
            </div>
            
            <div style="display: flex; gap: 15px;">
                <div style="background: rgba(0,0,0,0.2); border: 1px solid #374151; padding: 10px 15px; border-radius: 8px; text-align: center; min-width: 130px; position: relative;">
                    <div class="tooltip" style="position:absolute; top:5px; right:5px; font-size:10px;">?<div class="tooltiptext" style="width:200px; left:-180px;">Prioriza Tendencia y Momentum. Exige MACD positivo, Precio sobre EMA 50 y ganancias reales (BPA>0).</div></div>
                    <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">6 Meses (Híbrido)</div>
                    <div style="font-weight: bold; color: ${color6M}; font-size: 16px; letter-spacing: 1px;">${signal6M}</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); border: 1px solid #374151; padding: 10px 15px; border-radius: 8px; text-align: center; min-width: 130px; position: relative;">
                    <div class="tooltip" style="position:absolute; top:5px; right:5px; font-size:10px;">?<div class="tooltiptext" style="width:200px; left:-180px;">Prioriza Value Investing. Exige PER < 18, alto Earnings Yield y castigo en el precio (Drawdown > 20%).</div></div>
                    <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">2-3 Años (Valor)</div>
                    <div style="font-weight: bold; color: ${color3Y}; font-size: 16px; letter-spacing: 1px;">${signal3Y}</div>
                </div>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 20px;">
            
            <div class="card complex-card">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color:#fff;">Índices Técnicos y Tendencia</h3>
                <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 12px;">
                    
                    <div class="kpi-box"><span class="label">Var Hoy <div class="tooltip">?<div class="tooltiptext">Cambio porcentual del precio respecto a la rueda anterior.<br><br><b style="color:#00ff00">Fuerte:</b> > +2%<br><b style="color:#ff0044">Débil:</b> < -2%</div></div></span><span class="val ${getColor(item.changePct, 'change')}">${item.changePct ? item.changePct + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Tendencia <div class="tooltip">?<div class="tooltiptext">Cruce de Medias Móviles.<br><br><b style="color:#00ff00">Comprar (Golden):</b> SMA 50 > 200<br><b style="color:#ff0044">Vender (Death):</b> SMA 50 < 200</div></div></span><span class="val" style="color:#fff; font-size:12px;">${item.crossStatus}</span></div>
                    <div class="kpi-box"><span class="label">RSI (14) <div class="tooltip">?<div class="tooltiptext">Índice de Fuerza Relativa.<br><br><b style="color:#00ff00">Comprar:</b> < 35 (Sobreventa)<br><b style="color:#ff0044">Vender:</b> > 65 (Sobrecompra)</div></div></span><span class="val ${getColor(item.rsi, 'rsi')}">${item.rsi || '-'}</span></div>
                    <div class="kpi-box"><span class="label">MFI (Flujo) <div class="tooltip">?<div class="tooltiptext">Índice de Flujo de Dinero (RSI + Volumen).<br><br><b style="color:#00ff00">Comprar:</b> < 30 (Entra dinero)<br><b style="color:#ff0044">Vender:</b> > 70 (Sale dinero)</div></div></span><span class="val ${getColor(item.mfi, 'mfi')}">${item.mfi || '-'}</span></div>
                    <div class="kpi-box"><span class="label">MACD <div class="tooltip">?<div class="tooltiptext">Convergencia de Medias.<br><br><b style="color:#00ff00">Comprar:</b> > 0 (Fuerza alcista)<br><b style="color:#ff0044">Vender:</b> < 0 (Fuerza bajista)</div></div></span><span class="val ${getColor(item.macd, 'macd')}">${item.macd || '-'}</span></div>
                    <div class="kpi-box"><span class="label">Stoch %K <div class="tooltip">?<div class="tooltiptext">Oscilador Estocástico.<br><br><b style="color:#00ff00">Comprar:</b> < 20 (Sobreventa)<br><b style="color:#ff0044">Vender:</b> > 80 (Sobrecompra)</div></div></span><span class="val ${getColor(item.stochK, 'stoch')}">${item.stochK || '-'}</span></div>
                    <div class="kpi-box"><span class="label">ATR (Volat) <div class="tooltip">?<div class="tooltiptext">Variación diaria promedio del precio en dinero. Útil para definir dónde colocar el Stop Loss.</div></div></span><span class="val" style="color:#fff;">${item.atr || '-'}</span></div>
                    <div class="kpi-box"><span class="label">Dist. SMA 200 <div class="tooltip">?<div class="tooltiptext">Alejamiento porcentual de la media histórica anual.<br><br><b style="color:#00ff00">Comprar:</b> < -15% (Oportunidad)<br><b style="color:#ff0044">Vender:</b> > +30% (Burbuja)</div></div></span><span class="val ${getColor(item.distSMA200, 'distSMA')}">${item.distSMA200 ? item.distSMA200 + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">EMA 20 <div class="tooltip">?<div class="tooltiptext">Media Móvil Exponencial (1 mes).<br><br><b style="color:#00ff00">Alcista:</b> Precio > EMA 20</div></div></span><span class="val" style="color:#fff;">${item.ema20 || '-'}</span></div>
                    <div class="kpi-box"><span class="label">EMA 50 <div class="tooltip">?<div class="tooltiptext">Media Móvil Exponencial (1 trimestre).<br><br><b style="color:#00ff00">Alcista:</b> Precio > EMA 50</div></div></span><span class="val" style="color:#fff;">${item.ema50 || '-'}</span></div>
                    <div class="kpi-box"><span class="label">SMA 50 <div class="tooltip">?<div class="tooltiptext">Media Móvil Simple (Mediano Plazo). Actúa como soporte o resistencia dinámica.</div></div></span><span class="val" style="color:#fff;">${item.sma50 || '-'}</span></div>
                    <div class="kpi-box"><span class="label">SMA 200 <div class="tooltip">?<div class="tooltiptext">Media Móvil Simple (Largo Plazo). La frontera principal entre un mercado Bull (Toro) y Bear (Oso).</div></div></span><span class="val" style="color:#fff;">${item.sma200 || '-'}</span></div>
                    <div class="kpi-box"><span class="label">Boll Sup <div class="tooltip">?<div class="tooltiptext">Techo probabilístico del precio.<br><br><b style="color:#ff0044">Vender/Alerta:</b> Si el precio lo toca o supera.</div></div></span><span class="val" style="color:#ff0044;">${item.bollUpper || '-'}</span></div>
                    <div class="kpi-box"><span class="label">Boll Inf <div class="tooltip">?<div class="tooltiptext">Piso probabilístico del precio.<br><br><b style="color:#00ff00">Comprar/Rebote:</b> Si el precio lo perfora o toca.</div></div></span><span class="val" style="color:#00ff00;">${item.bollLower || '-'}</span></div>
                </div>
            </div>

            <div class="card complex-card">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color:#fff;">Fundamentales y Rendimiento Histórico</h3>
                <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 12px;">
                    
                    <div class="kpi-box"><span class="label">Rend. 1 Mes <div class="tooltip">?<div class="tooltiptext">Rendimiento del último mes.<br><br><b style="color:#00ff00">Momentum Positivo:</b> > 0%</div></div></span><span class="val ${getColor(item.perf1M, 'change')}">${item.perf1M ? item.perf1M + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Rend. 6 Meses <div class="tooltip">?<div class="tooltiptext">Rendimiento del último semestre.<br><br><b style="color:#00ff00">Tendencia Fuerte:</b> > 0%</div></div></span><span class="val ${getColor(item.perf6M, 'change')}">${item.perf6M ? item.perf6M + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Rend. 1 Año <div class="tooltip">?<div class="tooltiptext">Rendimiento de los últimos 12 meses.<br><br><b style="color:#00ff00">Año Positivo:</b> > 0%</div></div></span><span class="val ${getColor(item.perf1Y, 'change')}">${item.perf1Y ? item.perf1Y + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">PER <div class="tooltip">?<div class="tooltiptext">Años para recuperar la inversión.<br><br><b style="color:#00ff00">Comprar (Barato):</b> < 15<br><b style="color:#ff0044">Vender (Caro):</b> > 25</div></div></span><span class="val ${getColor(item.pe, 'pe')}">${item.pe ? item.pe.toFixed(2) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Earn. Yield <div class="tooltip">?<div class="tooltiptext">Rentabilidad real anual de la empresa (Inversa del PER).<br><br><b style="color:#00ff00">Atractivo:</b> > 5%<br><b style="color:#ff0044">Pobre:</b> < 3%</div></div></span><span class="val ${getColor(item.earnYield, 'ey')}">${item.earnYield ? item.earnYield.toFixed(2) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">BPA (EPS) <div class="tooltip">?<div class="tooltiptext">Beneficio neto por cada acción.<br><br><b style="color:#00ff00">Comprar:</b> > 0 (Empresa rentable)<br><b style="color:#ff0044">Vender:</b> < 0 (Da pérdidas)</div></div></span><span class="val ${getColor(item.eps, 'eps')}">${item.eps ? item.eps.toFixed(2) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Beta (Riesgo) <div class="tooltip">?<div class="tooltiptext">Volatilidad frente al mercado global.<br><br><b style="color:#00ff00">Defensiva:</b> < 1.0<br><b style="color:#ff0044">Agresiva/Volátil:</b> > 1.2</div></div></span><span class="val ${getColor(item.beta, 'beta')}">${item.beta ? item.beta.toFixed(2) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Market Cap <div class="tooltip">?<div class="tooltiptext">Tamaño total de la empresa en bolsa.<br><br>Large Cap: > $10B<br>Mid Cap: $2B - $10B<br>Small Cap: < $2B</div></div></span><span class="val" style="color:#00f7ff;">${fmtBigNum(item.mcap)}</span></div>
                    <div class="kpi-box"><span class="label">Vol Promedio <div class="tooltip">?<div class="tooltiptext">Cantidad media de acciones operadas por día. A mayor volumen, mayor liquidez y facilidad de venta.</div></div></span><span class="val" style="color:#fff;">${fmtBigNum(item.volAvg)}</span></div>
                    <div class="kpi-box"><span class="label">Máx 52s <div class="tooltip">?<div class="tooltiptext">Precio máximo alcanzado en el último año. Actúa como fuerte resistencia psicológica.</div></div></span><span class="val" style="color:#00ff00;">${item.yearHigh ? item.yearHigh.toFixed(2) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Mín 52s <div class="tooltip">?<div class="tooltiptext">Precio mínimo tocado en el último año. Actúa como fuerte soporte de compra.</div></div></span><span class="val" style="color:#ff0044;">${item.yearLow ? item.yearLow.toFixed(2) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Dist. al Máx <div class="tooltip">?<div class="tooltiptext">Caída desde su pico histórico anual (Drawdown).<br><br><b style="color:#00ff00">Comprar (Oferta):</b> < -20%</div></div></span><span class="val ${getColor(item.distHigh, 'change')}">${item.distHigh ? item.distHigh.toFixed(2) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Dist. al Mín <div class="tooltip">?<div class="tooltiptext">Subida desde su piso histórico anual.<br><br><b style="color:#ff0044">Riesgo de rebote/venta:</b> > +50%</div></div></span><span class="val ${getColor(item.distLow, 'change')}">${item.distLow ? '+' + item.distLow.toFixed(2) + '%' : '-'}</span></div>

                </div>
            </div>

        </div>

        <div id="tv_chart_${item.ticker.replace('.','_')}" style="height: 500px; width: 100%; margin-top: 30px; border-radius: 12px; overflow: hidden; border: 1px solid #1f2937;"></div>
    `;

    setTimeout(() => {
        new TradingView.widget({
          "autosize": true,
          "symbol": tvTicker,
          "interval": "D",
          "timezone": "America/Argentina/Buenos_Aires",
          "theme": "dark",
          "style": "1",
          "locale": "es",
          "enable_publishing": false,
          "backgroundColor": "#111827",
          "gridColor": "#1f2937",
          "hide_top_toolbar": false,
          "hide_legend": false,
          "save_image": false,
          "container_id": `tv_chart_${item.ticker.replace('.','_')}`
        });
    }, 100);
}

btnBackToScanner.addEventListener("click", () => {
    scannerDetailView.style.display = "none";
    scannerListView.style.display = "block";
});