import { CONFIG } from "./config.js";

const historicalPricesCache = {};
let lastFetchTime = 0;

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

export async function drawHistoricalChart(transactions, lineChartInstance, isUSD, currentMepRate, historicalMepRates, livePricesMap, canvasId = 'lineChart') {
    
    // DESTRUCCIÓN SEGURA SIEMPRE AL INICIO DE LA FUNCIÓN
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) existingChart.destroy();

    if (!transactions || transactions.length === 0) return null;

    const sym = isUSD ? "u$s " : "$ ";
    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstDateStr = sortedTxs[0].date;
    const firstDate = new Date(`${firstDateStr}T12:00:00`); 
    let today = new Date();
    
    const uniqueTickers = [...new Set(transactions.map(t => t.ticker))];

    let chartEndDate = new Date(today);
    if (uniqueTickers.length === 1) {
        let finalQty = 0;
        sortedTxs.forEach(tx => {
            if (tx.type === 'buy') finalQty += tx.qty;
            else finalQty -= tx.qty;
        });
        if (finalQty <= 0) {
            const lastTxDateStr = sortedTxs[sortedTxs.length - 1].date;
            chartEndDate = new Date(`${lastTxDateStr}T12:00:00`);
        }
    }

    const yearsDiff = Math.ceil((today - firstDate) / (1000 * 60 * 60 * 24 * 365));
    const range = yearsDiff > 1 ? `${yearsDiff}y` : '1y';

    function getMep(dateStr) {
        if (!historicalMepRates || !historicalMepRates.length) return currentMepRate;
        const rate = historicalMepRates.find(d => d.fecha <= dateStr);
        return rate ? parseFloat(rate.venta) : currentMepRate;
    }
    
    function isBonoOrLetra(ticker) {
        if (livePricesMap[ticker] && (livePricesMap[ticker].assetType === 'bonos' || livePricesMap[ticker].assetType === 'letras')) return true;
        return /^(AL|GD|AE|ME|TX|TV|T2|S[0-9]|X[0-9]|Y[0-9]|TD[0-9]|TC[0-9]|TO[0-9])/.test(ticker) && ticker.length <= 6;
    }

    async function fetchYahoo(tickerSymbol) {
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${tickerSymbol}?interval=1d&range=${range}&_=${Date.now()}`;
        const proxyUrl = `${CONFIG.PROXY_URL}${encodeURIComponent(targetUrl)}`;
        
        try {
            const res = await fetchWithTimeout(proxyUrl, {}, 5000);
            if (!res.ok) return null; 
            const json = await res.json();
            if (!json.chart || !json.chart.result) return null; 

            const timestamps = json.chart.result[0].timestamp;
            const closePrices = json.chart.result[0].indicators.quote[0].close;
            
            let result = {};
            for (let i = 0; i < timestamps.length; i++) {
                if (closePrices[i] !== null) {
                    const dateObj = new Date(timestamps[i] * 1000);
                    result[dateObj.toISOString().split('T')[0]] = closePrices[i];
                }
            }
            return Object.keys(result).length > 0 ? result : null;
        } catch (e) {
            return null;
        }
    }

    const now = Date.now();
    const missingTickers = uniqueTickers.filter(t => !historicalPricesCache[t] || Object.keys(historicalPricesCache[t]).length === 0);
    
    if (missingTickers.length > 0 || now - lastFetchTime > 3600000) { 
        
        // FILTRO SILENCIOSO: Evitamos mandar los Fondos Comunes a Yahoo para no ver el Error 404
        const validTickersForYahoo = missingTickers.filter(t => !t.includes(" - ") && !t.includes("Clase"));

        await Promise.all(validTickersForYahoo.map(async (ticker) => {
            let tickerBA = ticker.includes(".BA") ? ticker : `${ticker}.BA`;
            let tickerUS = ticker.replace(".BA", "");
            
            let dataARS = await fetchYahoo(tickerBA); 
            let useUSData = false;

            if (dataARS) {
                const firstTx = sortedTxs.find(t => t.ticker === ticker && t.type === 'buy');
                if (firstTx) {
                    const firstTxDateObj = new Date(`${firstTx.date}T12:00:00`);
                    const availableDates = Object.keys(dataARS).sort();
                    const earliestDataDate = new Date(`${availableDates[0]}T12:00:00`);
                    if ((earliestDataDate - firstTxDateObj) > 10 * 86400000) {
                        useUSData = true;
                    }
                }
            } else {
                useUSData = true;
            }

            if (dataARS && !useUSData) {
                historicalPricesCache[ticker] = dataARS;
            } else {
                let dataUS = await fetchYahoo(tickerUS);
                if (dataUS) {
                    let cedearRatio = 1;
                    const firstTx = sortedTxs.find(t => t.ticker === ticker && t.type === 'buy');
                    if (firstTx) {
                        const txMep = getMep(firstTx.date);
                        let usPriceOnBuyDate = null;
                        let tempD = new Date(`${firstTx.date}T12:00:00`);
                        
                        for(let i=0; i<10; i++) {
                            let dStr = tempD.toISOString().split('T')[0];
                            if (dataUS[dStr]) { usPriceOnBuyDate = dataUS[dStr]; break; }
                            tempD.setDate(tempD.getDate() - 1);
                        }
                        
                        if (usPriceOnBuyDate) {
                            const actualDivisor = isBonoOrLetra(firstTx.ticker) ? 100 : 1;
                            cedearRatio = firstTx.price / (usPriceOnBuyDate * txMep * actualDivisor);
                        } else if (livePricesMap && livePricesMap[ticker] && livePricesMap[ticker].c) {
                            let usDates = Object.keys(dataUS).sort();
                            let lastUSPrice = dataUS[usDates[usDates.length - 1]];
                            if (lastUSPrice) {
                                cedearRatio = parseFloat(livePricesMap[ticker].c) / (lastUSPrice * currentMepRate);
                            }
                        }
                    }

                    let transformedDataARS = {};
                    for (let date in dataUS) {
                        let pastMep = getMep(date);
                        transformedDataARS[date] = dataUS[date] * cedearRatio * pastMep;
                    }
                    historicalPricesCache[ticker] = transformedDataARS;
                } else {
                    historicalPricesCache[ticker] = {}; 
                }
            }
        }));
        lastFetchTime = now;
    }

    let progressDates = [];
    let progressPNL = [];
    let progressPNLPct = [];

    let currentHoldings = {};
    let accRealizedARS = 0; let accRealizedUSD = 0;
    let closedInvestedARS = 0; let closedInvestedUSD = 0;
    let lastKnownPrices = {}; 
    
    let firstBuyDate = {};
    sortedTxs.forEach(tx => {
        if (!firstBuyDate[tx.ticker]) firstBuyDate[tx.ticker] = tx.date;
    });

    for (let d = new Date(firstDate); d <= chartEndDate; d.setDate(d.getDate() + 1)) {
        let dateStr = d.toISOString().split('T')[0];
        let dailyMep = getMep(dateStr);
        
        const dailyTxs = sortedTxs.filter(tx => tx.date === dateStr);
        dailyTxs.forEach(tx => {
            const isBono = isBonoOrLetra(tx.ticker);
            const divisor = isBono ? 100 : 1;

            if (!currentHoldings[tx.ticker]) currentHoldings[tx.ticker] = { qty: 0, investedARS: 0, investedUSD: 0, divisor };
            
            if (tx.type === "buy") {
                const costARS = ((tx.qty / divisor) * tx.price) + tx.commission;
                currentHoldings[tx.ticker].qty += tx.qty;
                currentHoldings[tx.ticker].investedARS += costARS;
                currentHoldings[tx.ticker].investedUSD += (costARS / dailyMep);
            } else if (tx.type === "sell" && currentHoldings[tx.ticker].qty > 0) {
                const avgARS = currentHoldings[tx.ticker].investedARS / currentHoldings[tx.ticker].qty;
                const avgUSD = currentHoldings[tx.ticker].investedUSD / currentHoldings[tx.ticker].qty;
                const proceedsARS = ((tx.qty / divisor) * tx.price) - tx.commission;
                
                closedInvestedARS += (avgARS * tx.qty);
                closedInvestedUSD += (avgUSD * tx.qty);
                accRealizedARS += proceedsARS - (avgARS * tx.qty);
                accRealizedUSD += (proceedsARS / dailyMep) - (avgUSD * tx.qty);
                
                currentHoldings[tx.ticker].qty -= tx.qty;
                currentHoldings[tx.ticker].investedARS -= (avgARS * tx.qty);
                currentHoldings[tx.ticker].investedUSD -= (avgUSD * tx.qty);
            }
        });

        let activeInvestedARS = 0; let activeInvestedUSD = 0;
        let activeCurrentValARS = 0; let activeCurrentValUSD = 0;

        for (let t in currentHoldings) {
            if (currentHoldings[t].qty > 0) {
                activeInvestedARS += currentHoldings[t].investedARS;
                activeInvestedUSD += currentHoldings[t].investedUSD;
                
                const actualDivisor = currentHoldings[t].divisor;
                let livePriceARS = currentHoldings[t].investedARS / (currentHoldings[t].qty / actualDivisor);
                if (livePricesMap && livePricesMap[t] && livePricesMap[t].c) {
                    livePriceARS = parseFloat(livePricesMap[t].c);
                }

                let priceTodayARS = livePriceARS;
                const cacheT = historicalPricesCache[t];
                const cacheKeys = cacheT ? Object.keys(cacheT) : [];
                
                if (cacheKeys.length > 0) {
                    let lastYahoo = cacheT[cacheKeys[cacheKeys.length - 1]];
                    let scaleRatio = (livePriceARS > 0 && lastYahoo > 0) ? (livePriceARS / lastYahoo) : 1;
                    
                    let rawYahoo = cacheT[dateStr];
                    if (!rawYahoo) rawYahoo = lastKnownPrices[t]; 
                    
                    if (rawYahoo) {
                        lastKnownPrices[t] = rawYahoo;
                        priceTodayARS = rawYahoo * scaleRatio;
                    }
                } else {
                    let startD = new Date(`${firstBuyDate[t]}T12:00:00`);
                    let daysTotal = (chartEndDate - startD) / 86400000 || 1;
                    let daysElapsed = (d - startD) / 86400000;
                    let progress = Math.max(0, Math.min(1, daysElapsed / daysTotal));
                    let startPrice = currentHoldings[t].investedARS / (currentHoldings[t].qty / actualDivisor);
                    priceTodayARS = startPrice + (livePriceARS - startPrice) * progress;
                }

                if (dateStr === today.toISOString().split('T')[0] && livePricesMap && livePricesMap[t] && livePricesMap[t].c) {
                    priceTodayARS = parseFloat(livePricesMap[t].c);
                }

                activeCurrentValARS += ((currentHoldings[t].qty / actualDivisor) * priceTodayARS);
                activeCurrentValUSD += ((currentHoldings[t].qty / actualDivisor) * priceTodayARS) / dailyMep;
            }
        }

        const totalInvARS = activeInvestedARS + closedInvestedARS;
        const totalInvUSD = activeInvestedUSD + closedInvestedUSD;
        const totalPNL_ARS = accRealizedARS + (activeCurrentValARS - activeInvestedARS);
        const totalPNL_USD = accRealizedUSD + (activeCurrentValUSD - activeInvestedUSD);

        const plotPNL = isUSD ? totalPNL_USD : totalPNL_ARS;
        const plotInv = isUSD ? totalInvUSD : totalInvARS;
        const plotPct = plotInv > 0 ? (plotPNL / plotInv) * 100 : 0;

        progressDates.push(dateStr);
        progressPNL.push({ x: dateStr, y: plotPNL });
        progressPNLPct.push({ x: dateStr, y: plotPct });
    }

    const ctx = document.getElementById(canvasId);
    if(!ctx) return null;
    
    return new Chart(ctx, {
        type: 'line',
        data: { 
            datasets: [
                { label: 'P/L Nominal', data: progressPNL, borderColor: '#00f7ff', backgroundColor: 'rgba(0, 247, 255, 0.05)', fill: true, tension: 0.2, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y' }, 
                { label: 'Rentabilidad %', data: progressPNLPct, borderColor: '#ff00ff', borderDash: [], tension: 0.2, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1' }
            ] 
        },
        options: { 
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: { 
                x: { type: 'time', time: { unit: 'month', tooltipFormat: 'dd MMM yyyy' }, grid: { display: false } },
                y: { type: 'linear', position: 'left', grid: { color: '#1f2937' }, ticks: { callback: v => sym + new Intl.NumberFormat('es-AR').format(v) } }, 
                y1: { type: 'linear', position: 'right', grid: { display: false }, ticks: { callback: v => v.toFixed(2) + '%' } } 
            }, 
            plugins: { datalabels: { display: false } } 
        }
    });
}