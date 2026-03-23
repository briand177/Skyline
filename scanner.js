import { CONFIG } from "./config.js";
import { currentMepRate, isUSD } from "./app.js";

const searchScannerInput = document.getElementById("searchScannerInput");
const toggleScannerViewBtn = document.getElementById("toggleScannerViewBtn");
const btnRefreshScanner = document.getElementById("btnRefreshScanner");
const scannerListView = document.getElementById("scannerListView");
const scannerDetailView = document.getElementById("scannerDetailView");
const scannerCompareView = document.getElementById("scannerCompareView");
const scannerDetailContent = document.getElementById("scannerDetailContent");

const scannerTechContainer = document.getElementById("scannerTechContainer");
const scannerFundContainer = document.getElementById("scannerFundContainer");
const scannerTechResults = document.getElementById("scannerTechResults");
const scannerFundResults = document.getElementById("scannerFundResults");

const btnToggleFilters = document.getElementById("btnToggleFilters");
const scannerFiltersPanel = document.getElementById("scannerFiltersPanel");
const btnApplyFilters = document.getElementById("btnApplyFilters");
const btnClearFilters = document.getElementById("btnClearFilters");

const compareTable = document.getElementById("compareTable");

let scannerViewMode = 'fund'; 
let scannerData = [];
let hasLoaded = false;
let compareSelection = [];
let savedScrollPosition = 0; 
let scannerSort = { col: 'ticker', asc: true };

const CACHE_KEY = 'skyline_sheets_scanner_data';
const CACHE_EXPIRATION = 12 * 60 * 60 * 1000; 

let currentFilters = { peMax: null, epsMin: null, betaMax: null, rsiMin: null, rsiMax: null, macd: "", distSmaMax: null, perf1YMin: null, trend: "" };

function fNum(val) {
    if (val === null || val === undefined || val === '-') return '-';
    let n = parseFloat(val); return isNaN(n) ? val : parseFloat(n.toFixed(2));
}

// CONVERSOR DINÁMICO
function cvt(val, nativeCurrency) {
    if (val === null || val === undefined || val === '-') return val;
    if (nativeCurrency === 'ARS' && isUSD && currentMepRate > 0) return val / currentMepRate;
    if (nativeCurrency === 'USD' && !isUSD && currentMepRate > 0) return val * currentMepRate;
    return val;
}

function toUSD(val, curr) {
    if (val === null || val === undefined || val === '-') return null;
    if (curr === 'ARS' && currentMepRate > 0) return val / currentMepRate;
    return val;
}

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
    if (val === null || val === undefined) return null;
    let str = String(val).toUpperCase().trim();
    if (str === '' || str === '-' || str === 'N/A' || str === '#N/A') return null;

    let multiplier = 1; let isPct = false;
    if (str.includes('%')) { isPct = true; str = str.replace(/%/g, ''); }
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
    let num = parseFloat(str); return isNaN(num) ? null : (isPct ? num : num * multiplier); 
}

function getVal(headers, row, aliases) {
    if (!headers || !row) return null;
    for (let a of aliases) {
        let idx = headers.findIndex(h => h === a.toLowerCase());
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') return row[idx].trim();
    }
    let cleanHeaders = headers.map(h => h.replace(/[^a-z0-9]/g, ''));
    for (let a of aliases) {
        let cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        let idx = cleanHeaders.findIndex(h => h === cleanA);
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') return row[idx].trim();
    }
    for (let a of aliases) {
        let cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        let idx = cleanHeaders.findIndex(h => h.includes(cleanA));
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') return row[idx].trim();
    }
    return null;
}

export async function initScanner(forceRefresh = false) {
    if (hasLoaded && !forceRefresh) return;
    scannerFundResults.innerHTML = "<tr><td colspan='12' style='text-align:center; padding: 30px;'>Conectando a bases de datos maestras... 🚀</td></tr>";
    scannerTechResults.innerHTML = "<tr><td colspan='14' style='text-align:center; padding: 30px;'>Procesando algoritmos Cuantitativos y Divisas... 🚀</td></tr>";

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached && !forceRefresh) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_EXPIRATION) { scannerData = parsed.data; hasLoaded = true; renderScanner(); return; }
    }

    try {
        let [finvizRes, argyRes] = await Promise.all([ fetch(CONFIG.FINVIZ_CSV_URL).catch(() => null), fetch(CONFIG.ARGY_CSV_URL).catch(() => null) ]);
        if (!finvizRes || !finvizRes.ok) finvizRes = await fetch(`${CONFIG.PROXY_URL}${encodeURIComponent(CONFIG.FINVIZ_CSV_URL)}`).catch(() => null);
        if (!argyRes || !argyRes.ok) argyRes = await fetch(`${CONFIG.PROXY_URL}${encodeURIComponent(CONFIG.ARGY_CSV_URL)}`).catch(() => null);

        let fvzData = {};
        if (finvizRes && finvizRes.ok) {
            const fvzArr = parseCSV(await finvizRes.text());
            if (fvzArr.length > 1) {
                const headers = fvzArr[0].map(h => h ? h.toLowerCase().trim() : '');
                for (let i = 1; i < fvzArr.length; i++) {
                    let row = fvzArr[i]; let ticker = getVal(headers, row, ['ticker', 'symbol']);
                    if (!ticker) continue; ticker = ticker.toUpperCase();
                    let price = parseSuperNum(getVal(headers, row, ['price', 'precio']));
                    
                    let h52Abs = null, l52Abs = null;
                    let rangeStr = getVal(headers, row, ['52w range', '52wrange', 'rango']);
                    if (rangeStr && rangeStr.includes('-')) {
                        let parts = rangeStr.split('-'); l52Abs = parseSuperNum(parts[0]); h52Abs = parseSuperNum(parts[1]);
                    } else if (price > 0) {
                        let h52D = parseSuperNum(getVal(headers, row, ['52w high', '52whigh', 'high52']));
                        let l52D = parseSuperNum(getVal(headers, row, ['52w low', '52wlow', 'low52']));
                        if (h52D !== null) h52Abs = price / (1 + (h52D / 100)); if (l52D !== null) l52Abs = price / (1 + (l52D / 100));
                    }

                    let sma20D = parseSuperNum(getVal(headers, row, ['sma20'])); let sma50D = parseSuperNum(getVal(headers, row, ['sma50'])); let sma200D = parseSuperNum(getVal(headers, row, ['sma200']));
                    let sma20Abs = null, sma50Abs = null, sma200Abs = null;
                    if (price > 0) {
                        if (sma20D !== null) sma20Abs = price / (1 + (sma20D / 100)); if (sma50D !== null) sma50Abs = price / (1 + (sma50D / 100)); if (sma200D !== null) sma200Abs = price / (1 + (sma200D / 100));
                    }
                    
                    let volAvg = parseSuperNum(getVal(headers, row, ['avg volume', 'volume', 'volumen']));
                    let valTraded = (price > 0 && volAvg > 0) ? price * volAvg : null;

                    fvzData[ticker] = {
                        company: getVal(headers, row, ['company', 'name', 'nombre']), sector: getVal(headers, row, ['sector', 'industry']), price: price,
                        pe: parseSuperNum(getVal(headers, row, ['p/e', 'pe', 'per'])), peg: parseSuperNum(getVal(headers, row, ['peg'])), ps: parseSuperNum(getVal(headers, row, ['p/s', 'price/sales', 'ventas'])),
                        pb: parseSuperNum(getVal(headers, row, ['p/b', 'price/book', 'valor libro'])), pc: parseSuperNum(getVal(headers, row, ['p/c', 'price/cash'])), pfcf: parseSuperNum(getVal(headers, row, ['p/fcf', 'pfcf', 'price/fcf', 'fcf'])),
                        divNominal: parseSuperNum(getVal(headers, row, ['dividend'])), divYield: parseSuperNum(getVal(headers, row, ['dividend.1', 'dividend1', 'dividend %'])), divTtm: parseSuperNum(getVal(headers, row, ['dividend ttm', 'dividendttm'])),
                        eps: parseSuperNum(getVal(headers, row, ['eps (ttm)', 'eps', 'bpa', 'beneficio'])), epsNextY: parseSuperNum(getVal(headers, row, ['eps next y', 'epsnexty'])),
                        epsQQ: parseSuperNum(getVal(headers, row, ['eps q/q', 'epsqq'])), salesQQ: parseSuperNum(getVal(headers, row, ['sales q/q', 'salesqq'])),
                        roe: parseSuperNum(getVal(headers, row, ['roe'])), roa: parseSuperNum(getVal(headers, row, ['roa'])), roi: parseSuperNum(getVal(headers, row, ['roi'])),
                        currR: parseSuperNum(getVal(headers, row, ['current ratio', 'currentratio'])), quickR: parseSuperNum(getVal(headers, row, ['quick ratio', 'quickratio'])), debtEq: parseSuperNum(getVal(headers, row, ['debt/eq', 'debteq'])),
                        profitMargin: parseSuperNum(getVal(headers, row, ['profit margin', 'profitmargin'])), targetPrice: parseSuperNum(getVal(headers, row, ['target price', 'targetprice'])), recom: parseSuperNum(getVal(headers, row, ['recom'])),
                        shortFloat: parseSuperNum(getVal(headers, row, ['short float', 'shortfloat'])), insiderTrans: parseSuperNum(getVal(headers, row, ['insider trans', 'insidertrans'])),
                        rsi: parseSuperNum(getVal(headers, row, ['rsi (14)', 'rsi14', 'rsi'])), atr: parseSuperNum(getVal(headers, row, ['atr'])), beta: parseSuperNum(getVal(headers, row, ['beta'])), macd: parseSuperNum(getVal(headers, row, ['macd'])),
                        high52: h52Abs, low52: l52Abs, sma20: sma20Abs, sma50: sma50Abs, sma200: sma200Abs, sma200Dist: sma200D,
                        volAvg: volAvg, valTraded: valTraded, relVolume: parseSuperNum(getVal(headers, row, ['rel volume', 'relvolume'])),
                        change: parseSuperNum(getVal(headers, row, ['change'])), perf1M: parseSuperNum(getVal(headers, row, ['perf month', 'perfmonth'])), perf6M: parseSuperNum(getVal(headers, row, ['perf half', 'perfhalf'])), perf1Y: parseSuperNum(getVal(headers, row, ['perf year', 'perfyear']))
                    };
                }
            }
        }

        let argyData = {};
        if (argyRes && argyRes.ok) {
            const argyArr = parseCSV(await argyRes.text());
            if (argyArr.length > 1) {
                const headers = argyArr[0].map(h => h ? h.toLowerCase().trim() : '');
                for (let i = 1; i < argyArr.length; i++) {
                    let row = argyArr[i]; let ticker = getVal(headers, row, ['ticker', 'symbol']);
                    if (!ticker) continue; ticker = ticker.toUpperCase();
                    argyData[ticker] = {
                        company: getVal(headers, row, ['nombre', 'name']), sector: getVal(headers, row, ['sector']), price: parseSuperNum(getVal(headers, row, ['precio', 'price'])),
                        pe: parseSuperNum(getVal(headers, row, ['pe'])), ps: parseSuperNum(getVal(headers, row, ['ps'])), pb: parseSuperNum(getVal(headers, row, ['pb'])), eps: parseSuperNum(getVal(headers, row, ['eps'])),
                        divYield: parseSuperNum(getVal(headers, row, ['divyield'])), mcap: parseSuperNum(getVal(headers, row, ['marketcap'])), rsi: parseSuperNum(getVal(headers, row, ['rsi'])), macd: parseSuperNum(getVal(headers, row, ['macd'])),
                        atr: parseSuperNum(getVal(headers, row, ['atr'])), sma20: parseSuperNum(getVal(headers, row, ['sma20'])), sma50: parseSuperNum(getVal(headers, row, ['sma50'])), sma200: parseSuperNum(getVal(headers, row, ['sma200'])),
                        bollUpper: parseSuperNum(getVal(headers, row, ['bollsup'])), bollLower: parseSuperNum(getVal(headers, row, ['bollinf'])),
                        perf1M: parseSuperNum(getVal(headers, row, ['perf1m'])), perf6M: parseSuperNum(getVal(headers, row, ['perf6m'])), perf1Y: parseSuperNum(getVal(headers, row, ['perf1y'])),
                        volAvg: parseSuperNum(getVal(headers, row, ['volavg'])), valTraded: parseSuperNum(getVal(headers, row, ['volumen operado', 'valuetraded'])), change: parseSuperNum(getVal(headers, row, ['change'])),
                        high52: parseSuperNum(getVal(headers, row, ['high52'])), low52: parseSuperNum(getVal(headers, row, ['low52'])), beta: parseSuperNum(getVal(headers, row, ['beta'])), relVolume: parseSuperNum(getVal(headers, row, ['relvolume']))
                    };
                }
            }
        }

        const finalTickers = [...new Set([...Object.keys(fvzData), ...Object.keys(argyData)])];
        let rawMapped = finalTickers.map(ticker => {
            let isArgy = !fvzData[ticker] && argyData[ticker];
            let raw = fvzData[ticker] || argyData[ticker];
            if (!raw || !raw.price) return null;

            let currency = isArgy ? 'ARS' : 'USD';
            let currentPrice = raw.price;
            
            let earnYield = null; if (raw.eps !== null && currentPrice > 0) earnYield = (raw.eps / currentPrice) * 100;
            let distSma200 = raw.sma200Dist || null; if (distSma200 === null && raw.sma200 !== null && currentPrice > 0) distSma200 = ((currentPrice - raw.sma200) / raw.sma200) * 100;

            let atr = raw.atr || null; let bollSup = raw.bollUpper || null; let bollInf = raw.bollLower || null;
            if (bollSup === null && raw.sma20 !== null && atr !== null) { bollSup = raw.sma20 + (2 * atr); bollInf = raw.sma20 - (2 * atr); }
            let trend = '-'; if (raw.sma50 !== null && raw.sma200 !== null) { trend = raw.sma50 > raw.sma200 ? 'Golden Cross 📈' : 'Death Cross 📉'; }
            let range52 = '-'; if (raw.high52 !== null && raw.low52 !== null) range52 = `${fNum(raw.low52)} - ${fNum(raw.high52)}`;
            let avwapProxy = null; if (currentPrice > 0 && raw.high52 !== null && raw.low52 !== null) avwapProxy = (currentPrice + raw.high52 + raw.low52) / 3;
            
            let distHigh = null; if (raw.high52 !== null && currentPrice > 0) distHigh = ((currentPrice - raw.high52) / raw.high52) * 100;
            let distLow = null; if (raw.low52 !== null && currentPrice > 0) distLow = ((currentPrice - raw.low52) / raw.low52) * 100;
            let targetGap = raw.targetGap || null; if (targetGap === null && raw.targetPrice && currentPrice > 0) targetGap = ((raw.targetPrice - currentPrice) / currentPrice) * 100;

            return {
                ticker: ticker, name: raw.company || '-', sector: raw.sector || '-', currency: currency, 
                price: currentPrice, mcap: raw.mcap || null, eps: raw.eps || null, divNominal: raw.divNominal || null, divTtm: raw.divTtm || null,
                targetPrice: raw.targetPrice || null, epsNextY: raw.epsNextY || null, atr: atr,
                sma20: raw.sma20 || null, sma50: raw.sma50 || null, sma200: raw.sma200 || null, avwap: avwapProxy,
                bollUpper: bollSup, bollLower: bollInf, high52: raw.high52 || null, low52: raw.low52 || null,
                pe: raw.pe || null, peg: raw.peg || null, ps: raw.ps || null, pb: raw.pb || null, pc: raw.pc || null, 
                divYield: raw.divYield || null, pfcf: raw.pfcf || null, earnYield: earnYield,
                epsQQ: raw.epsQQ || null, salesQQ: raw.salesQQ || null, roa: raw.roa || null, roi: raw.roi || null, roe: raw.roe || null,
                currR: raw.currR || null, quickR: raw.quickR || null, debtEq: raw.debtEq || null, profitMargin: raw.profitMargin || null,
                recom: raw.recom || null, shortFloat: raw.shortFloat || null, insiderTrans: raw.insiderTrans || null, 
                volAvg: raw.volAvg || null, valTraded: raw.valTraded || null, relVolume: raw.relVolume || null, beta: raw.beta || null, 
                rsi: raw.rsi || null, macd: raw.macd || null, distSma200: distSma200, crossStatus: trend, range52: range52,
                distHigh: distHigh, distLow: distLow, changePct: raw.change || null, perf1M: raw.perf1M || null, perf6M: raw.perf6M || null, perf1Y: raw.perf1Y || null
            };
        }).filter(item => item !== null);

        scannerData = rawMapped.sort((a, b) => a.ticker.localeCompare(b.ticker));
        if (scannerData.length > 0) { localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: scannerData })); } 
        hasLoaded = true; renderScanner();
    } catch (error) { console.error("Error Crítico en Scanner:", error); scannerFundResults.innerHTML = "<tr><td colspan='12' style='text-align:center; padding: 30px; color: #ff0044;'>Hubo un error de lectura. Revisá la consola.</td></tr>"; }
}

function fmtBigNum(value) { if (!value) return '-'; if (value >= 1e9) return fNum(value / 1e9) + 'B'; if (value >= 1e6) return fNum(value / 1e6) + 'M'; return value.toLocaleString(); }

function getColor(val, type, price = null) { 
    if (val === null || val === '-') return 'neutral'; 
    const num = parseFloat(val); 
    
    if (type === 'pe' || type === 'peg') { if (num < 0) return 'negative'; if (num < 15) return 'positive'; if (num > 25) return 'negative'; return 'warning'; } 
    if (type === 'pb' || type === 'ps') { if (num < 0) return 'negative'; if (num < 1.5) return 'positive'; if (num > 3) return 'negative'; return 'warning'; } 
    if (type === 'pc') { if (num < 0) return 'negative'; if (num < 15) return 'positive'; if (num > 25) return 'negative'; return 'warning'; }
    if (type === 'eps') { return num > 0 ? 'positive' : 'negative'; } 
    if (type === 'roe' || type === 'margin') { if (num > 15) return 'positive'; if (num < 5) return 'negative'; return 'warning'; } 
    if (type === 'divYield') { if (num >= 3) return 'positive'; if (num === 0) return 'neutral'; return 'warning'; } 
    if (type === 'rsi') { if (num > 70) return 'negative'; if (num < 35) return 'positive'; return 'warning'; } 
    if (type === 'macd') { return num > 0 ? 'positive' : 'negative'; } 
    if (type === 'change') { return num >= 0 ? 'positive' : 'negative'; } 
    if (type === 'distSMA') { if (num > 30) return 'negative'; if (num < -15) return 'positive'; return 'warning'; } 
    if (type === 'ey') { if (num < 3) return 'negative'; if (num > 5) return 'positive'; return 'warning'; } 
    if (type === 'debt') { if (num < 1) return 'positive'; if (num > 2) return 'negative'; return 'warning'; } 
    if (type === 'beta') { if (num < 1) return 'positive'; if (num > 1.2) return 'negative'; return 'warning'; } 
    if (type === 'target') { if (num > 10) return 'positive'; if (num < 0) return 'negative'; return 'warning'; }
    if (type === 'recom') { if (num <= 2.5) return 'positive'; if (num >= 3.5) return 'negative'; return 'warning'; }
    if (type === 'liquidity') { if (num > 1.5) return 'positive'; if (num < 1) return 'negative'; return 'neutral'; }
    if (type === 'short') { if (num > 15) return 'negative'; if (num < 5) return 'positive'; return 'warning'; }
    if (type === 'insider') { if (num > 0) return 'positive'; if (num < -5) return 'negative'; return 'neutral'; }
    
    if ((type === 'sma' || type === 'avwap') && price !== null) { if (price > num) return 'positive'; if (price < num) return 'negative'; return 'warning'; }
    if (type === 'atr' && price !== null && price > 0) { let pctVolatilidad = (num / price) * 100; if (pctVolatilidad < 2) return 'positive'; if (pctVolatilidad > 5) return 'negative'; return 'warning'; }
    return 'neutral'; 
}

function matchSearchScanner(text, searchStr) { 
    if (!searchStr) return true; 
    const normalize = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); 
    const normalizedText = normalize(text); const terms = normalize(searchStr).split(/\s+/).filter(t => t); 
    return terms.every(term => normalizedText.includes(term)); 
}

btnToggleFilters.addEventListener("click", () => { scannerFiltersPanel.style.display = scannerFiltersPanel.style.display === 'none' ? 'block' : 'none'; });
btnApplyFilters.addEventListener("click", () => { renderScanner(); });
btnClearFilters.addEventListener("click", () => { document.querySelectorAll("#scannerFiltersPanel input, #scannerFiltersPanel select").forEach(el => el.value = ""); renderScanner(); });

function renderScanner() {
    const search = searchScannerInput.value.trim();
    let peMax = parseFloat(document.getElementById("filterPeMax")?.value) || null; let epsMin = parseFloat(document.getElementById("filterEpsMin")?.value) || null;
    let betaMax = parseFloat(document.getElementById("filterBetaMax")?.value) || null; let rsiMin = parseFloat(document.getElementById("filterRsiMin")?.value) || null;
    let rsiMax = parseFloat(document.getElementById("filterRsiMax")?.value) || null; let macd = document.getElementById("filterMacd")?.value || "";
    let distSmaMax = parseFloat(document.getElementById("filterDistSmaMax")?.value) || null; let perf1YMin = parseFloat(document.getElementById("filterPerf1YMin")?.value) || null;
    let trend = document.getElementById("filterTrend")?.value || "";

    let filtered = scannerData.filter(item => {
        if (search !== "" && !matchSearchScanner(`${item.ticker} ${item.name} ${item.sector}`, search)) return false;
        if (peMax !== null && (item.pe === null || item.pe > peMax || item.pe <= 0)) return false;
        let cvtEps = cvt(item.eps, item.currency); if (epsMin !== null && (cvtEps === null || cvtEps < epsMin)) return false;
        if (betaMax !== null && (item.beta === null || item.beta > betaMax)) return false;
        if (rsiMin !== null && (item.rsi === null || item.rsi < rsiMin)) return false;
        if (rsiMax !== null && (item.rsi === null || item.rsi > rsiMax)) return false;
        if (macd === "pos" && (item.macd === null || item.macd <= 0)) return false;
        if (macd === "neg" && (item.macd === null || item.macd >= 0)) return false;
        if (distSmaMax !== null && (item.distSma200 === null || item.distSma200 > distSmaMax)) return false;
        if (perf1YMin !== null && (item.perf1Y === null || item.perf1Y < perf1YMin)) return false;
        if (trend !== "" && (!item.crossStatus || !item.crossStatus.includes(trend))) return false;
        return true;
    });

    filtered.sort((a, b) => {
        let valA = a[scannerSort.col]; let valB = b[scannerSort.col];
        const nominalCols = ['price', 'mcap', 'valTraded', 'eps', 'divNominal', 'divTtm', 'targetPrice', 'atr', 'sma20', 'sma50', 'sma200', 'avwap', 'bollUpper', 'bollLower', 'high52', 'low52'];
        if (nominalCols.includes(scannerSort.col)) { valA = toUSD(valA, a.currency); valB = toUSD(valB, b.currency); }
        let nullVal = scannerSort.asc ? Infinity : -Infinity;
        if (valA === null || valA === undefined || valA === '-') valA = nullVal;
        if (valB === null || valB === undefined || valB === '-') valB = nullVal;
        if (['ticker', 'name', 'currency', 'crossStatus', 'sector'].includes(scannerSort.col)) {
            valA = (valA === Infinity || valA === -Infinity) ? "zzzz" : valA.toString().toLowerCase();
            valB = (valB === Infinity || valB === -Infinity) ? "zzzz" : valB.toString().toLowerCase();
        } else { valA = parseFloat(valA); valB = parseFloat(valB); }
        if (valA < valB) return scannerSort.asc ? -1 : 1; if (valA > valB) return scannerSort.asc ? 1 : -1; return 0;
    });

    if (scannerViewMode === 'tech') buildTechTable(filtered); else buildFundTable(filtered);
    updateCompareUI();
}

document.querySelectorAll('#usaScannerView th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (scannerSort.col === col) { scannerSort.asc = !scannerSort.asc; } else { scannerSort.col = col; scannerSort.asc = true; }
        document.querySelectorAll('#usaScannerView th.sortable').forEach(el => el.classList.remove('asc', 'desc'));
        th.classList.add(scannerSort.asc ? 'asc' : 'desc');
        renderScanner();
    });
});

btnRefreshScanner.addEventListener("click", () => { initScanner(true); });
searchScannerInput.addEventListener("input", renderScanner); 
toggleScannerViewBtn.addEventListener("click", () => {
    scannerViewMode = scannerViewMode === 'tech' ? 'fund' : 'tech';
    toggleScannerViewBtn.innerText = scannerViewMode === 'tech' ? "Ver Fundamental" : "Ver Técnico";
    scannerFundContainer.style.display = scannerViewMode === 'tech' ? "none" : "block";
    scannerTechContainer.style.display = scannerViewMode === 'tech' ? "block" : "none";
    renderScanner();
});

function updateCompareUI() {
    const floatingPanel = document.getElementById("floatingComparePanel"); const tagsContainer = document.getElementById("compareTagsContainer");
    document.getElementById("compareCount").innerText = compareSelection.length;
    if (compareSelection.length > 0) { floatingPanel.style.display = "flex"; tagsContainer.innerHTML = compareSelection.map(ticker => `<div class="compare-tag"><strong>${ticker}</strong><span class="remove-tag-btn" data-ticker="${ticker}" title="Quitar">✕</span></div>`).join("");
    } else { floatingPanel.style.display = "none"; }
    document.querySelectorAll(".compare-cb").forEach(cb => { cb.checked = compareSelection.includes(cb.value); });
}

document.addEventListener("change", (e) => { 
    if (e.target.classList.contains("compare-cb")) {
        const ticker = e.target.value;
        if (e.target.checked) {
            if (compareSelection.length >= 3) { e.target.checked = false; alert("Máximo 3 activos."); return; }
            if (!compareSelection.includes(ticker)) compareSelection.push(ticker);
        } else { compareSelection = compareSelection.filter(t => t !== ticker); }
        updateCompareUI();
    }
});

document.addEventListener("click", (e) => {
    const clickableCell = e.target.closest('.clickable-cell');
    if (clickableCell) { const row = clickableCell.closest('.scanner-row'); if (row && row.dataset.ticker) { savedScrollPosition = window.scrollY; showAssetDetail(row.dataset.ticker); } }
    if (e.target.classList.contains("remove-tag-btn")) { compareSelection = compareSelection.filter(t => t !== e.target.dataset.ticker); updateCompareUI(); }
    if (e.target.id === "btnClearCompare") { compareSelection = []; updateCompareUI(); }
    if (e.target.id === "btnGoToCompare") { savedScrollPosition = window.scrollY; buildCompareView(); scannerListView.style.display = "none"; scannerCompareView.style.display = "block"; window.scrollTo(0, 0); }
    if (e.target.id === "btnBackToScanner" || e.target.closest("#btnBackToScanner")) { scannerDetailView.style.display = "none"; scannerListView.style.display = "block"; window.scrollTo(0, savedScrollPosition); }
    if (e.target.id === "btnBackFromCompare" || e.target.closest("#btnBackFromCompare")) { scannerCompareView.style.display = "none"; scannerListView.style.display = "block"; window.scrollTo(0, savedScrollPosition); }
});

function buildFundTable(data) {
    scannerFundResults.innerHTML = ""; if (data.length === 0) return;
    
    document.querySelector("#scannerFundContainer th:nth-child(6)").innerHTML = `PER <div class="tooltip">?<div class="tooltiptext">Años para recuperar inversión.<br><br><b style="color:#00ff00">Comprar:</b> &lt; 15<br><b style="color:#ff0044">Vender:</b> &gt; 25</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(7)").innerHTML = `PEG <div class="tooltip">?<div class="tooltiptext">PER ajustado por crecimiento.<br><br><b style="color:#00ff00">Comprar:</b> &lt; 1.0<br><b style="color:#ff0044">Vender:</b> &gt; 2.0</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(8)").innerHTML = `P/S <div class="tooltip">?<div class="tooltiptext">Precio / Ventas.<br><br><b style="color:#00ff00">Comprar:</b> &lt; 2.0<br><b style="color:#ff0044">Vender:</b> &gt; 5.0</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(9)").innerHTML = `P/B <div class="tooltip">?<div class="tooltiptext">Precio / Patrimonio Neto.<br><br><b style="color:#00ff00">Barato:</b> &lt; 1.5<br><b style="color:#ff0044">Caro:</b> &gt; 3.0</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(10)").innerHTML = `Div. Yield <div class="tooltip">?<div class="tooltiptext">Rendimiento por dividendos.<br><br><b style="color:#00ff00">Fuerte:</b> &gt; 3%<br><b style="color:#ff0044">Débil:</b> 0%</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(11)").innerHTML = `BPA (EPS) <div class="tooltip">?<div class="tooltiptext">Beneficio neto por acción.<br><br><b style="color:#00ff00">Comprar:</b> &gt; 0<br><b style="color:#ff0044">Vender:</b> &lt; 0</div></div>`;
    document.querySelector("#scannerFundContainer th:nth-child(12)").innerHTML = `Earn. Yield <div class="tooltip">?<div class="tooltiptext">Rentabilidad real (Inversa del PER).<br><br><b style="color:#00ff00">Comprar:</b> &gt; 5%<br><b style="color:#ff0044">Vender:</b> &lt; 3%</div></div>`;

    scannerFundResults.innerHTML = data.map(item => {
        const sym = item.currency === 'USD' ? 'u$s' : '$'; const colorMoneda = item.currency === 'USD' ? '#10b981' : '#00f7ff';
        let cbChecked = compareSelection.includes(item.ticker) ? "checked" : "";

        return `<tr class="scanner-row" data-ticker="${item.ticker}">
            <td><input type="checkbox" class="compare-cb" value="${item.ticker}" ${cbChecked}></td>
            <td class="clickable-cell"><strong>${item.ticker}</strong></td>
            <td class="clickable-cell"><div style="line-height:1.2;"><span style="color:#e5e7eb;">${item.name.substring(0, 18)}</span><br><small style="color:#6b7280; font-size:10px;">${item.sector}</small></div></td>
            <td class="clickable-cell"><small style="color:${colorMoneda}; font-weight:bold;">${item.currency}</small></td>
            <td class="clickable-cell">${sym} ${fNum(item.price)}</td>
            <td class="clickable-cell ${getColor(item.pe, 'pe')}">${fNum(item.pe)}</td>
            <td class="clickable-cell ${getColor(item.peg, 'peg')}">${fNum(item.peg)}</td>
            <td class="clickable-cell ${getColor(item.ps, 'ps')}">${fNum(item.ps)}</td>
            <td class="clickable-cell ${getColor(item.pb, 'pb')}">${fNum(item.pb)}</td>
            <td class="clickable-cell ${getColor(item.divYield, 'divYield')}">${item.divYield !== null ? fNum(item.divYield) + '%' : '-'}</td>
            <td class="clickable-cell ${getColor(item.eps, 'eps')}">${item.eps !== null ? sym + ' ' + fNum(item.eps) : '-'}</td>
            <td class="clickable-cell ${getColor(item.earnYield, 'ey')}">${item.earnYield !== null ? fNum(item.earnYield) + '%' : '-'}</td>
        </tr>`;
    }).join("");
}

function buildTechTable(data) {
    scannerTechResults.innerHTML = ""; if (data.length === 0) return;
    
    document.querySelector("#scannerTechContainer th:nth-child(6)").innerHTML = `RSI <div class="tooltip">?<div class="tooltiptext">Fuerza Relativa.<br><br><b style="color:#00ff00">Comprar:</b> &lt; 35 (Sobreventa)<br><b style="color:#ff0044">Vender:</b> &gt; 65 (Sobrecompra)</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(7)").innerHTML = `ATR <div class="tooltip">?<div class="tooltiptext">Variación diaria. Define tu Stop Loss.<br><br><b style="color:#00ff00">Baja Volat:</b> &lt; 2% del precio<br><b style="color:#ff0044">Alta Volat:</b> &gt; 5% del precio</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(8)").innerHTML = `AVWAP* <div class="tooltip">?<div class="tooltiptext">VWAP Sintético Anual.<br><br><b style="color:#00ff00">Alcista:</b> Precio &gt; AVWAP<br><b style="color:#ff0044">Bajista:</b> Precio &lt; AVWAP</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(9)").innerHTML = `Beta <div class="tooltip">?<div class="tooltiptext">Volatilidad frente al mercado.<br><br><b style="color:#00ff00">Defensa:</b> &lt; 1.0<br><b style="color:#ff0044">Agresiva:</b> &gt; 1.2</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(10)").innerHTML = `Boll Sup <div class="tooltip">?<div class="tooltiptext">Techo probabilístico.<br><br><b style="color:#ff0044">Vender:</b> Toca el techo</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(11)").innerHTML = `Boll Inf <div class="tooltip">?<div class="tooltiptext">Piso probabilístico.<br><br><b style="color:#00ff00">Comprar:</b> Toca el piso</div></div>`;
    document.querySelector("#scannerTechContainer th:nth-child(12)").innerHTML = `Tendencia <div class="tooltip">?<div class="tooltiptext">Cruce de Medias Móviles.<br><br><b style="color:#00ff00">Comprar:</b> Golden Cross<br><b style="color:#ff0044">Vender:</b> Death Cross</div></div>`;

    scannerTechResults.innerHTML = data.map(item => {
        let trendColor = item.crossStatus.includes('Golden') ? 'positive' : (item.crossStatus.includes('Death') ? 'negative' : 'warning');
        const sym = item.currency === 'USD' ? 'u$s' : '$'; const colorMoneda = item.currency === 'USD' ? '#10b981' : '#00f7ff';
        let cbChecked = compareSelection.includes(item.ticker) ? "checked" : "";

        return `<tr class="scanner-row" data-ticker="${item.ticker}">
            <td><input type="checkbox" class="compare-cb" value="${item.ticker}" ${cbChecked}></td>
            <td class="clickable-cell"><strong>${item.ticker}</strong></td>
            <td class="clickable-cell"><div style="line-height:1.2;"><span style="color:#e5e7eb;">${item.name.substring(0, 18)}</span><br><small style="color:#6b7280; font-size:10px;">${item.sector}</small></div></td>
            <td class="clickable-cell"><small style="color:${colorMoneda}; font-weight:bold;">${item.currency}</small></td>
            <td class="clickable-cell">${sym} ${fNum(item.price)}</td>
            <td class="clickable-cell ${getColor(item.rsi, 'rsi')}">${fNum(item.rsi)}</td>
            <td class="clickable-cell ${getColor(item.atr, 'atr', item.price)}">${fNum(item.atr)}</td>
            <td class="clickable-cell ${getColor(item.avwap, 'avwap', item.price)}">${fNum(item.avwap)}</td>
            <td class="clickable-cell ${getColor(item.beta, 'beta')}">${fNum(item.beta)}</td>
            <td class="clickable-cell" style="color:#ff0044;">${fNum(item.bollUpper)}</td>
            <td class="clickable-cell" style="color:#00ff00;">${fNum(item.bollLower)}</td>
            <td class="clickable-cell ${trendColor}" style="font-weight: bold;">${item.crossStatus.split(' ')[0]}</td>
        </tr>`;
    }).join("");
}

function buildCompareView() {
    const assets = compareSelection.map(ticker => scannerData.find(d => d.ticker === ticker)).filter(x => x);
    if(assets.length === 0) return;
    const gSym = isUSD ? 'u$s' : '$'; 

    compareTable.style.borderCollapse = "collapse"; compareTable.style.width = "100%";
    let headers = `<tr><th style="width: 250px; position: sticky; top: -1px; background-color: #0b0f1a; z-index: 20; border-bottom: 2px solid #374151; text-align: left; padding: 15px;">Índice / Métrica</th>`;
    assets.forEach(a => { headers += `<th style="position: sticky; top: -1px; background-color: #0b0f1a; z-index: 20; border-bottom: 2px solid #374151; text-align: center; padding: 15px;"><h3 style="color:#00f7ff; margin:0; font-size:24px;">${a.ticker}</h3><small style="color:#9ca3af;">${a.name}</small></th>`; });
    headers += `</tr>`;

    const createRow = (labelHTML, prop, isPct = false, useColor = null, isNativePrice = false, isUnifiedMacro = false) => {
        let row = `<tr><td style="padding: 10px; border-bottom: 1px solid #1f2937; background-color: #111827;"><strong>${labelHTML}</strong></td>`;
        assets.forEach(a => {
            let val = isUnifiedMacro ? cvt(a[prop], a.currency) : a[prop]; 
            let refPrice = a.price; 
            let colorClass = useColor ? getColor(a[prop], useColor, refPrice) : ""; 
            
            let displayVal = val !== null && val !== undefined ? val : '-';
            let sym = a.currency === 'USD' ? 'u$s' : '$'; 

            if (val !== null && val !== '-') {
                if (isPct) displayVal = fNum(val) + '%'; 
                else if (isUnifiedMacro) displayVal = `${gSym} ${fmtBigNum(val)}`; 
                else if (isNativePrice) displayVal = `${sym} ${fNum(val)}`; 
                else if (!isNaN(val) && prop !== 'crossStatus' && prop !== 'range52') displayVal = fNum(val);
            }
            if (prop === 'currency') displayVal = `<span style="font-weight:bold; color:${a.currency === 'USD' ? '#10b981' : '#00f7ff'};">${a.currency}</span>`;
            if (prop === 'range52' && a.high52 && a.low52) displayVal = `${sym} ${fNum(a.low52)} - ${sym} ${fNum(a.high52)}`;
            if (prop === 'crossStatus') displayVal = a.crossStatus;

            row += `<td class="${colorClass}" style="text-align:center; padding: 10px; border-bottom: 1px solid #1f2937; background-color: #111827;">${displayVal}</td>`;
        });
        row += `</tr>`; return row;
    };

    const ttStyle = `style="bottom: auto !important; top: 150% !important; z-index: 999999 !important;"`;

    let html = `<thead>${headers}</thead><tbody>`;
    html += createRow(`Sector`, "sector");
    html += createRow(`Moneda Origen`, "currency");
    html += createRow(`Precio Actual`, "price", false, null, true);
    
    html += `<tr><td colspan="${assets.length + 1}" style="background: rgba(255,255,255,0.05); color:#fff; font-weight:bold; text-align:center; padding: 10px;">FUNDAMENTALES</td></tr>`;
    html += createRow(`Market Cap`, "mcap", false, null, false, true);
    html += createRow(`Vol. Operado (Diario)`, "valTraded", false, null, false, true);
    html += createRow(`PER (P/E)`, "pe", false, 'pe');
    html += createRow(`PEG`, "peg", false, 'peg');
    html += createRow(`P/B (Price/Book)`, "pb", false, 'pb');
    html += createRow(`P/S (Price/Sales)`, "ps", false, 'ps');
    html += createRow(`P/C (Price/Cash)`, "pc", false, 'pc');
    html += createRow(`P/FCF`, "pfcf", false, 'pe');
    html += createRow(`BPA (EPS)`, "eps", false, 'eps', true);
    html += createRow(`Earn. Yield`, "earnYield", true, 'ey');
    html += createRow(`ROE`, "roe", true, 'roe');
    html += createRow(`Debt/Eq`, "debtEq", false, 'debt');
    html += createRow(`Div. Yield`, "divYield", true, 'divYield');

    html += `<tr><td colspan="${assets.length + 1}" style="background: rgba(255,255,255,0.05); color:#fff; font-weight:bold; text-align:center; padding: 10px;">TÉCNICOS Y TENDENCIA</td></tr>`;
    html += createRow(`Tendencia`, "crossStatus");
    html += createRow(`RSI (14)`, "rsi", false, 'rsi');
    html += createRow(`MACD`, "macd", false, 'macd');
    html += createRow(`ATR (Volat)`, "atr", false, 'atr', true);
    html += createRow(`AVWAP (Proxy)`, "avwap", false, 'avwap', true);
    html += createRow(`SMA 20`, "sma20", false, 'sma', true);
    html += createRow(`SMA 50`, "sma50", false, 'sma', true);
    html += createRow(`SMA 200`, "sma200", false, 'sma', true);
    html += createRow(`Dist. SMA 200`, "distSma200", true, 'distSMA');
    html += createRow(`Boll Sup`, "bollUpper", false, null, true);
    html += createRow(`Boll Inf`, "bollLower", false, null, true);
    
    html += `</tbody>`; compareTable.innerHTML = html;
}

function showAssetDetail(ticker) {
    const item = scannerData.find(d => d.ticker === ticker);
    if (!item) return;

    scannerListView.style.display = "none";
    scannerDetailView.style.display = "block";
    window.scrollTo(0, 0); 

    let tvTicker = item.tickerGoogle && item.tickerGoogle.startsWith('BCBA:') ? item.tickerGoogle : item.ticker;
    const sym = item.currency === 'USD' ? 'u$s' : '$'; const colorMoneda = item.currency === 'USD' ? '#10b981' : '#00f7ff';
    const gSym = isUSD ? 'u$s' : '$'; 
    
    const priceDisp = fNum(item.price);
    let range52 = '-'; if (item.high52 && item.low52) range52 = `${sym} ${fNum(item.low52)} - ${sym} ${fNum(item.high52)}`;

    const dMcap = cvt(item.mcap, item.currency);
    const dValTraded = cvt(item.valTraded, item.currency);

    // --- MOTOR QUANT EXACTO (Matemática Pura) ---
    
    // 1. SWING TRADING (MOMENTUM Y RUPTURAS)
    let score1M = 0;
    if (item.rsi !== null) { 
        if (item.rsi > 30 && item.rsi < 50) score1M += 1; // Saliendo de sobreventa
        if (item.rsi > 70) score1M -= 2; // Riesgo de corrección inmediata
    }
    if (item.macd !== null) { if (item.macd > 0) score1M += 1; else score1M -= 1; }
    if (item.price !== null && item.sma20 !== null) { if (item.price > item.sma20) score1M += 1; else score1M -= 1; }
    if (item.relVolume !== null && item.relVolume > 1.5) score1M += 1; // Fuerte inyección institucional
    if (item.shortFloat !== null && item.shortFloat > 15) score1M += 1; // Squeeze potencial

    let signal1M = "NEUTRAL"; let color1M = "#f59e0b"; 
    if (score1M >= 3) { signal1M = "COMPRAR"; color1M = "#00ff00"; } 
    else if (score1M <= -1) { signal1M = "VENDER"; color1M = "#ff0044"; }

    // 2. TREND FOLLOWING (CRECIMIENTO SOSTENIDO)
    let score6M = 0;
    if (item.crossStatus.includes('Golden')) score6M += 2; else score6M -= 2;
    if (item.distSma200 !== null) { 
        if (item.distSma200 > 0 && item.distSma200 < 20) score6M += 1; // Suba controlada
        else if (item.distSma200 > 35) score6M -= 2; // Fase de euforia
    }
    if (item.peg !== null) { if (item.peg > 0 && item.peg < 1.5) score6M += 1; else if (item.peg > 2.5) score6M -= 1; }
    if (item.epsQQ !== null) { if (item.epsQQ > 15) score6M += 1; else if (item.epsQQ < 0) score6M -= 1; } // Crecimiento real requerido
    if (item.salesQQ !== null) { if (item.salesQQ > 15) score6M += 1; else if (item.salesQQ < 0) score6M -= 1; }
    if (item.recom !== null) { if (item.recom <= 2.5) score6M += 1; else if (item.recom >= 3.5) score6M -= 1; }

    let signal6M = "NEUTRAL"; let color6M = "#f59e0b"; 
    if (score6M >= 4) { signal6M = "COMPRAR"; color6M = "#00ff00"; } 
    else if (score6M <= -1) { signal6M = "VENDER"; color6M = "#ff0044"; }

    // 3. DEEP VALUE (WARREN BUFFETT)
    let score3Y = 0;
    if (item.pe !== null) { if (item.pe > 0 && item.pe < 15) score3Y += 1; else if (item.pe > 25 || item.pe < 0) score3Y -= 1; }
    if (item.pb !== null) { if (item.pb > 0 && item.pb < 1.5) score3Y += 1; else if (item.pb > 3) score3Y -= 1; }
    if (item.pfcf !== null) { if (item.pfcf > 0 && item.pfcf < 20) score3Y += 1; else if (item.pfcf > 40) score3Y -= 1; }
    if (item.roe !== null) { if (item.roe > 15) score3Y += 1; else if (item.roe < 5) score3Y -= 1; }
    if (item.roa !== null) { if (item.roa > 8) score3Y += 1; }
    if (item.debtEq !== null) { if (item.debtEq < 1.0) score3Y += 1; else if (item.debtEq > 2.0) score3Y -= 1; }
    if (item.currR !== null) { if (item.currR > 1.5) score3Y += 1; else if (item.currR < 1.0) score3Y -= 1; }
    if (item.divYield !== null && item.divYield > 3) score3Y += 1;

    let signal3Y = "NEUTRAL"; let color3Y = "#f59e0b";
    if (score3Y >= 5) { signal3Y = "COMPRAR"; color3Y = "#00ff00"; } 
    else if (score3Y <= -1) { signal3Y = "VENDER"; color3Y = "#ff0044"; }

    let trendColor = item.crossStatus.includes('Golden') ? 'positive' : (item.crossStatus.includes('Death') ? 'negative' : 'warning');

    scannerDetailContent.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; background: rgba(255,255,255,0.02); padding: 15px 25px; border-radius: 12px; border: 1px solid #1f2937;">
            <div>
                <h2 style="color: #00f7ff; margin:0; font-size: 28px;">${item.ticker} <span style="font-size: 18px; color: #9ca3af;">(${sym} ${priceDisp})</span></h2>
                <span style="color:#9ca3af; font-size: 14px;">${item.name} | ${item.sector} | Moneda Origen: <span style="color:${colorMoneda}; font-weight:bold;">${item.currency}</span></span>
            </div>
            
            <div style="display: flex; gap: 15px;">
                <div style="background: rgba(0,0,0,0.2); border: 1px solid #374151; padding: 10px 15px; border-radius: 8px; text-align: center; min-width: 110px; position: relative;">
                    <div class="tooltip" style="position:absolute; top:5px; right:5px; font-size:10px;">?<div class="tooltiptext" style="width:200px; left:-180px;">Prioriza rupturas de volatilidad, cruces en MACD e inyección de volumen inusual.</div></div>
                    <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">1 Mes (Swing)</div>
                    <div style="font-weight: bold; color: ${color1M}; font-size: 16px; letter-spacing: 1px;">${signal1M}</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); border: 1px solid #374151; padding: 10px 15px; border-radius: 8px; text-align: center; min-width: 110px; position: relative;">
                    <div class="tooltip" style="position:absolute; top:5px; right:5px; font-size:10px;">?<div class="tooltiptext" style="width:200px; left:-180px;">Exige confirmación de tendencia macro (Golden Cross) sustentada en crecimiento real de EPS.</div></div>
                    <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">6 Meses (Trend)</div>
                    <div style="font-weight: bold; color: ${color6M}; font-size: 16px; letter-spacing: 1px;">${signal6M}</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); border: 1px solid #374151; padding: 10px 15px; border-radius: 8px; text-align: center; min-width: 110px; position: relative;">
                    <div class="tooltip" style="position:absolute; top:5px; right:5px; font-size:10px;">?<div class="tooltiptext" style="width:200px; left:-180px;">Test de estrés. Exige un precio de ganga (P/FCF bajo) pero con alta solvencia y liquidez.</div></div>
                    <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">2-3 Años (Value)</div>
                    <div style="font-weight: bold; color: ${color3Y}; font-size: 16px; letter-spacing: 1px;">${signal3Y}</div>
                </div>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 20px;">
            
            <div class="card complex-card">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color:#fff;">Fundamentales de Valoración</h3>
                <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 12px;">
                    <div class="kpi-box"><span class="label">Market Cap <div class="tooltip">?<div class="tooltiptext">Tamaño de empresa en bolsa.<br><br><b style="color:#00ff00">Comprar (Sólida):</b> > 10B<br><b style="color:#ff0044">Vender (Riesgo):</b> < 2B</div></div></span><span class="val" style="color:#00f7ff;">${dMcap !== null ? gSym + ' ' + fmtBigNum(dMcap) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Vol. Operado <div class="tooltip">?<div class="tooltiptext">Dinero operado diario. Indica liquidez.</div></div></span><span class="val" style="color:#00f7ff;">${dValTraded !== null ? gSym + ' ' + fmtBigNum(dValTraded) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">PER (P/E) <div class="tooltip">?<div class="tooltiptext">Años para recuperar inversión.<br><br><b style="color:#00ff00">Comprar:</b> < 15<br><b style="color:#ff0044">Vender:</b> > 25</div></div></span><span class="val ${getColor(item.pe, 'pe')}">${fNum(item.pe)}</span></div>
                    <div class="kpi-box"><span class="label">PEG <div class="tooltip">?<div class="tooltiptext">PER ajustado por crecimiento.<br><br><b style="color:#00ff00">Comprar:</b> < 1.0<br><b style="color:#ff0044">Vender:</b> > 2.0</div></div></span><span class="val ${getColor(item.peg, 'peg')}">${fNum(item.peg)}</span></div>
                    <div class="kpi-box"><span class="label">P/B (Book) <div class="tooltip">?<div class="tooltiptext">Precio / Patrimonio Neto.<br><br><b style="color:#00ff00">Barato:</b> < 1.5<br><b style="color:#ff0044">Caro:</b> > 3.0</div></div></span><span class="val ${getColor(item.pb, 'pb')}">${fNum(item.pb)}</span></div>
                    <div class="kpi-box"><span class="label">P/S (Sales) <div class="tooltip">?<div class="tooltiptext">Precio / Ventas.<br><br><b style="color:#00ff00">Comprar:</b> < 2.0<br><b style="color:#ff0044">Vender:</b> > 5.0</div></div></span><span class="val ${getColor(item.ps, 'ps')}">${fNum(item.ps)}</span></div>
                    <div class="kpi-box"><span class="label">P/C (Cash) <div class="tooltip">?<div class="tooltiptext">Precio / Flujo de caja libre.<br><br><b style="color:#00ff00">Comprar:</b> < 15<br><b style="color:#ff0044">Vender:</b> > 25</div></div></span><span class="val ${getColor(item.pc, 'pc')}">${fNum(item.pc)}</span></div>
                    <div class="kpi-box"><span class="label">P/FCF <div class="tooltip">?<div class="tooltiptext">Precio / Flujo de caja libre puro.<br><br><b style="color:#00ff00">Comprar:</b> < 20<br><b style="color:#ff0044">Vender:</b> > 40</div></div></span><span class="val ${getColor(item.pfcf, 'pe')}">${fNum(item.pfcf)}</span></div>
                    <div class="kpi-box"><span class="label">BPA (EPS) <div class="tooltip">?<div class="tooltiptext">Beneficio neto por acción.<br><br><b style="color:#00ff00">Comprar:</b> > 0<br><b style="color:#ff0044">Vender:</b> < 0</div></div></span><span class="val ${getColor(item.eps, 'eps')}">${item.eps !== null ? sym + ' ' + fNum(item.eps) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Earn. Yield <div class="tooltip">?<div class="tooltiptext">Inversa del PER (Rentabilidad real).<br><br><b style="color:#00ff00">Comprar:</b> > 5%<br><b style="color:#ff0044">Vender:</b> < 3%</div></div></span><span class="val ${getColor(item.earnYield, 'ey')}">${item.earnYield !== null ? fNum(item.earnYield) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">ROE <div class="tooltip">?<div class="tooltiptext">Retorno sobre Patrimonio.<br><br><b style="color:#00ff00">Excelente:</b> > 15%<br><b style="color:#ff0044">Malo:</b> < 5%</div></div></span><span class="val ${getColor(item.roe, 'roe')}">${item.roe !== null ? fNum(item.roe) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Debt / Eq <div class="tooltip">?<div class="tooltiptext">Deuda sobre Patrimonio.<br><br><b style="color:#00ff00">Sano:</b> < 1.0<br><b style="color:#ff0044">Peligro:</b> > 2.0</div></div></span><span class="val ${getColor(item.debtEq, 'debt')}">${fNum(item.debtEq)}</span></div>
                    <div class="kpi-box"><span class="label">Div. Nominal <div class="tooltip">?<div class="tooltiptext">Dividendo anual pagado por acción.</div></div></span><span class="val" style="color:#00ff00;">${item.divNominal !== null ? sym + ' ' + fNum(item.divNominal) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Div. Yield <div class="tooltip">?<div class="tooltiptext">Rendimiento por dividendos.<br><br><b style="color:#00ff00">Fuerte:</b> > 3%<br><b style="color:#ff0044">Débil:</b> 0%</div></div></span><span class="val ${getColor(item.divYield, 'divYield')}">${item.divYield !== null ? fNum(item.divYield) + '%' : '-'}</span></div>
                </div>
            </div>

            <div class="card complex-card">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color:#fff;">Crecimiento, Liquidez y Sentimiento</h3>
                <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 12px;">
                    <div class="kpi-box"><span class="label">EPS Q/Q <div class="tooltip">?<div class="tooltiptext">Crec. Ganancias vs Trimestre Anterior.<br><br><b style="color:#00ff00">Bueno:</b> > 10%<br><b style="color:#ff0044">Malo:</b> < 0%</div></div></span><span class="val ${getColor(item.epsQQ, 'change')}">${item.epsQQ !== null ? fNum(item.epsQQ) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Sales Q/Q <div class="tooltip">?<div class="tooltiptext">Crec. Ventas vs Trimestre Anterior.<br><br><b style="color:#00ff00">Bueno:</b> > 10%<br><b style="color:#ff0044">Malo:</b> < 0%</div></div></span><span class="val ${getColor(item.salesQQ, 'change')}">${item.salesQQ !== null ? fNum(item.salesQQ) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Current R. <div class="tooltip">?<div class="tooltiptext">Liquidez Corriente.<br><br><b style="color:#00ff00">Sano:</b> > 1.5<br><b style="color:#ff0044">Riesgo:</b> < 1.0</div></div></span><span class="val ${getColor(item.currR, 'liquidity')}">${fNum(item.currR)}</span></div>
                    <div class="kpi-box"><span class="label">Quick R. <div class="tooltip">?<div class="tooltiptext">Liquidez Ácida (Sin inventarios).<br><br><b style="color:#00ff00">Sano:</b> > 1.0<br><b style="color:#ff0044">Riesgo:</b> < 0.8</div></div></span><span class="val ${getColor(item.quickR, 'liquidity')}">${fNum(item.quickR)}</span></div>
                    <div class="kpi-box"><span class="label">ROA <div class="tooltip">?<div class="tooltiptext">Retorno sobre Activos.<br><br><b style="color:#00ff00">Sano:</b> > 8%</div></div></span><span class="val ${getColor(item.roa, 'change')}">${item.roa !== null ? fNum(item.roa) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Recom <div class="tooltip">?<div class="tooltiptext">Consenso Analistas (1=Fuerte Compra, 5=Venta).<br><br><b style="color:#00ff00">Comprar:</b> < 2.5<br><b style="color:#ff0044">Vender:</b> > 3.5</div></div></span><span class="val ${getColor(item.recom, 'recom')}">${fNum(item.recom)}</span></div>
                    <div class="kpi-box"><span class="label">Target Gap <div class="tooltip">?<div class="tooltiptext">Distancia al precio objetivo de Wall Street.<br><br><b style="color:#00ff00">Alcista:</b> > +10%</div></div></span><span class="val ${getColor(item.targetGap, 'target')}">${item.targetGap !== null ? '+' + fNum(item.targetGap) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Short Float <div class="tooltip">?<div class="tooltiptext">Acciones vendidas en corto.<br><br><b style="color:#00ff00">Sano:</b> < 5%<br><b style="color:#ff0044">Riesgo/Squeeze:</b> > 15%</div></div></span><span class="val ${getColor(item.shortFloat, 'short')}">${item.shortFloat !== null ? fNum(item.shortFloat) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Insider Tr. <div class="tooltip">?<div class="tooltiptext">Compras de directivos en últimos 6M.<br><br><b style="color:#00ff00">Compran:</b> > 0%<br><b style="color:#ff0044">Venden:</b> < -5%</div></div></span><span class="val ${getColor(item.insiderTrans, 'insider')}">${item.insiderTrans !== null ? fNum(item.insiderTrans) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Beta (Riesgo) <div class="tooltip">?<div class="tooltiptext">Volatilidad frente al mercado.<br><br><b style="color:#00ff00">Defensa:</b> < 1.0<br><b style="color:#ff0044">Agresiva:</b> > 1.2</div></div></span><span class="val ${getColor(item.beta, 'beta')}">${fNum(item.beta)}</span></div>
                </div>
            </div>

            <div class="card complex-card">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color:#fff;">Análisis Técnico de Momentum</h3>
                <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 12px;">
                    <div class="kpi-box"><span class="label">Tendencia <div class="tooltip">?<div class="tooltiptext">Cruce de Medias Móviles.<br><br><b style="color:#00ff00">Comprar:</b> Golden Cross<br><b style="color:#ff0044">Vender:</b> Death Cross</div></div></span><span class="val ${trendColor}" style="font-size:12px;">${item.crossStatus.split(' ')[0]}</span></div>
                    <div class="kpi-box"><span class="label">RSI (14) <div class="tooltip">?<div class="tooltiptext">Fuerza Relativa.<br><br><b style="color:#00ff00">Comprar:</b> < 35 (Sobreventa)<br><b style="color:#ff0044">Vender:</b> > 65 (Sobrecompra)</div></div></span><span class="val ${getColor(item.rsi, 'rsi')}">${fNum(item.rsi)}</span></div>
                    <div class="kpi-box"><span class="label">MACD <div class="tooltip">?<div class="tooltiptext">Impulso direccional.<br><br><b style="color:#00ff00">Comprar:</b> > 0<br><b style="color:#ff0044">Vender:</b> < 0</div></div></span><span class="val ${getColor(item.macd, 'macd')}">${fNum(item.macd)}</span></div>
                    <div class="kpi-box"><span class="label">ATR (Volat) <div class="tooltip">?<div class="tooltiptext">Variación diaria. Define tu Stop Loss.<br><br><b style="color:#00ff00">Baja Volat:</b> &lt; 2% del precio<br><b style="color:#ff0044">Alta Volat:</b> &gt; 5% del precio</div></div></span><span class="val ${getColor(item.atr, 'atr', item.price)}">${item.atr !== null ? sym + ' ' + fNum(item.atr) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">AVWAP* <div class="tooltip">?<div class="tooltiptext">VWAP Sintético Anual.<br><br><b style="color:#00ff00">Alcista:</b> Precio > AVWAP<br><b style="color:#ff0044">Bajista:</b> Precio < AVWAP</div></div></span><span class="val ${getColor(item.avwap, 'avwap', item.price)}">${item.avwap !== null ? sym + ' ' + fNum(item.avwap) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">SMA 20 <div class="tooltip">?<div class="tooltiptext">Media rápida (1 mes).<br><br><b style="color:#00ff00">Alcista:</b> Precio > SMA<br><b style="color:#ff0044">Bajista:</b> Precio < SMA</div></div></span><span class="val ${getColor(item.sma20, 'sma', item.price)}">${item.sma20 !== null ? sym + ' ' + fNum(item.sma20) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">SMA 50 <div class="tooltip">?<div class="tooltiptext">Media intermedia (3 meses).<br><br><b style="color:#00ff00">Alcista:</b> Precio > SMA<br><b style="color:#ff0044">Bajista:</b> Precio < SMA</div></div></span><span class="val ${getColor(item.sma50, 'sma', item.price)}">${item.sma50 !== null ? sym + ' ' + fNum(item.sma50) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">SMA 200 <div class="tooltip">?<div class="tooltiptext">Media histórica (1 año).<br><br><b style="color:#00ff00">Alcista:</b> Precio > SMA<br><b style="color:#ff0044">Bajista:</b> Precio < SMA</div></div></span><span class="val ${getColor(item.sma200, 'sma', item.price)}">${item.sma200 !== null ? sym + ' ' + fNum(item.sma200) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Dist. SMA 200 <div class="tooltip">?<div class="tooltiptext">Distancia a media anual.<br><br><b style="color:#00ff00">Comprar:</b> < -15%<br><b style="color:#ff0044">Vender:</b> > +30%</div></div></span><span class="val ${getColor(item.distSma200, 'distSMA')}">${item.distSma200 !== null ? fNum(item.distSma200) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Boll Sup <div class="tooltip">?<div class="tooltiptext">Techo probabilístico.<br><br><b style="color:#ff0044">Vender:</b> Toca el techo</div></div></span><span class="val" style="color:#ff0044;">${item.bollUpper !== null ? sym + ' ' + fNum(item.bollUpper) : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Boll Inf <div class="tooltip">?<div class="tooltiptext">Piso probabilístico.<br><br><b style="color:#00ff00">Comprar:</b> Toca el piso</div></div></span><span class="val" style="color:#00ff00;">${item.bollLower !== null ? sym + ' ' + fNum(item.bollLower) : '-'}</span></div>
                </div>
            </div>

            <div class="card complex-card">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid #1f2937; padding-bottom: 10px; color:#fff;">Rendimiento Histórico</h3>
                <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 12px;">
                    <div class="kpi-box"><span class="label">Var. Hoy <div class="tooltip">?<div class="tooltiptext">Cambio porcentual del día.<br><br><b style="color:#00ff00">Comprar:</b> > +2%<br><b style="color:#ff0044">Vender:</b> < -2%</div></div></span><span class="val ${getColor(item.changePct, 'change')}">${item.changePct !== null ? fNum(item.changePct) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Rend. 1 Mes <div class="tooltip">?<div class="tooltiptext">Evolución de 30 días.<br><br><b style="color:#00ff00">Bueno:</b> > 0%<br><b style="color:#ff0044">Malo:</b> < 0%</div></div></span><span class="val ${getColor(item.perf1M, 'change')}">${item.perf1M !== null ? fNum(item.perf1M) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Rend. 6 Meses <div class="tooltip">?<div class="tooltiptext">Evolución semestral.<br><br><b style="color:#00ff00">Bueno:</b> > 0%<br><b style="color:#ff0044">Malo:</b> < 0%</div></div></span><span class="val ${getColor(item.perf6M, 'change')}">${item.perf6M !== null ? fNum(item.perf6M) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Rend. 1 Año <div class="tooltip">?<div class="tooltiptext">Evolución interanual.<br><br><b style="color:#00ff00">Bueno:</b> > 0%<br><b style="color:#ff0044">Malo:</b> < 0%</div></div></span><span class="val ${getColor(item.perf1Y, 'change')}">${item.perf1Y !== null ? fNum(item.perf1Y) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Volumen <div class="tooltip">?<div class="tooltiptext">Acciones operadas hoy vs Promedio.</div></div></span><span class="val" style="color:#fff;">${fmtBigNum(item.volAvg)}</span></div>
                    <div class="kpi-box"><span class="label">Rango 52S <div class="tooltip">?<div class="tooltiptext">Piso y Techo del último año.</div></div></span><span class="val" style="color:#9ca3af; font-size:12px;">${range52}</span></div>
                    <div class="kpi-box"><span class="label">Dist. al Máx <div class="tooltip">?<div class="tooltiptext">Caída desde su pico anual.<br><br><b style="color:#00ff00">Comprar:</b> < -20%<br><b style="color:#ff0044">Vender:</b> > -5%</div></div></span><span class="val ${getColor(item.distHigh, 'change')}">${item.distHigh !== null ? fNum(item.distHigh) + '%' : '-'}</span></div>
                    <div class="kpi-box"><span class="label">Dist. al Mín <div class="tooltip">?<div class="tooltiptext">Subida desde el piso anual.<br><br><b style="color:#00ff00">Comprar:</b> < +5%<br><b style="color:#ff0044">Vender:</b> > +50%</div></div></span><span class="val ${getColor(item.distLow, 'change')}">${item.distLow !== null ? '+' + fNum(item.distLow) + '%' : '-'}</span></div>
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