import { instruments } from "./app.js";

const searchScannerInput = document.getElementById("searchScannerInput");
const toggleScannerViewBtn = document.getElementById("toggleScannerViewBtn");
const scannerListView = document.getElementById("scannerListView");
const scannerDetailView = document.getElementById("scannerDetailView");
const btnBackToScanner = document.getElementById("btnBackToScanner");
const scannerDetailContent = document.getElementById("scannerDetailContent");
const scannerTableContainer = document.getElementById("scannerTableContainer");
const scannerGridContainer = document.getElementById("scannerGridContainer");
const scannerTableResults = document.getElementById("scannerTableResults");
const scannerGridResults = document.getElementById("scannerGridResults");

let scannerViewMode = 'table'; 
let hasLoaded = false;
let scannerData = [];

const MI_API_TECNICA = "https://script.google.com/macros/s/AKfycbwzHoKNleP28QmACW1GSYiXWt4lI23rtK3bHSSQcl_6Pf9kAHZa5HIorXhKjmzY0O9U/exec";

export async function initScanner() {
    if (hasLoaded) return;
    scannerTableResults.innerHTML = "<tr><td colspan='9'>Analizando el mercado masivamente... (Puede tardar unos segundos)</td></tr>";

    try {
        const hardcodedTickers = ["SPY", "QQQ", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL", "VIST", "XOM", "CVX", "KO", "PEP", "MCD", "JNJ", "PFE", "V", "MA", "JPM", "BAC", "MELI", "BABA", "WMT", "PG", "DIS", "NFLX", "AMD", "INTC", "GGAL.BA", "YPFD.BA", "PAMP.BA"];
        const txs = JSON.parse(localStorage.getItem('bolsa_transactions')) || [];
        const userTickers = txs.map(t => t.ticker);
        const queryTickers = [...new Set([...hardcodedTickers, ...userTickers])].slice(0, 80);

        const response = await fetch(`${MI_API_TECNICA}?tickers=${queryTickers.join(',')}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        scannerData = data.filter(item => item && item.price > 0);
        scannerData.sort((a, b) => a.ticker.localeCompare(b.ticker));
        hasLoaded = true;
        renderScanner();
    } catch (error) {
        scannerTableResults.innerHTML = `<tr><td colspan='9' class='negative'>Error conectando a Yahoo. Refrescá la página.</td></tr>`;
    }
}

function renderScanner() {
    const search = searchScannerInput.value.toLowerCase().trim();
    let filtered = scannerData;
    if (search !== "") filtered = scannerData.filter(item => item.ticker.toLowerCase().includes(search));
    if (scannerViewMode === 'table') buildTable(filtered); else buildGrid(filtered);
}

searchScannerInput.addEventListener("keyup", async (e) => {
    renderScanner(); 
    if (e.key === "Enter") {
        const newTicker = searchScannerInput.value.toUpperCase().trim();
        if (newTicker && !scannerData.find(d => d.ticker === newTicker)) {
            const originalText = toggleScannerViewBtn.innerText;
            toggleScannerViewBtn.innerText = "Buscando...";
            try {
                const res = await fetch(`${MI_API_TECNICA}?tickers=${newTicker}`);
                const data = await res.json();
                if (data && data.length > 0 && data[0].price > 0) {
                    scannerData.unshift(data[0]); searchScannerInput.value = ""; renderScanner();
                } else alert(`No se encontró "${newTicker}". Agregá .BA si es acción local.`);
            } catch(error) {}
            toggleScannerViewBtn.innerText = originalText;
        }
    }
});

toggleScannerViewBtn.addEventListener("click", () => {
    if (scannerViewMode === 'table') {
        scannerViewMode = 'grid'; toggleScannerViewBtn.innerText = "Ver Técnico (Tabla)";
        scannerTableContainer.style.display = "none"; scannerGridContainer.style.display = "block";
    } else {
        scannerViewMode = 'table'; toggleScannerViewBtn.innerText = "Ver Fundamental (Tarjetas)";
        scannerGridContainer.style.display = "none"; scannerTableContainer.style.display = "block";
    }
    renderScanner();
});

// Colores
function getTechColor(val, type) {
    if (val === "-") return 'neutral'; const num = parseFloat(val);
    if (type === 'rsi') { if (num > 65) return 'negative'; if (num < 35) return 'positive'; return 'warning'; }
    if (type === 'trend') { if (num >= 3) return 'positive'; if (num <= -3) return 'negative'; return 'warning'; }
    if (type === 'score') { if (num >= 70) return 'positive'; if (num < 50) return 'negative'; return 'warning'; }
    if (type === 'distLow') { if (num < 15) return 'positive'; if (num > 40) return 'negative'; return 'warning'; }
    if (type === 'distHigh') { if (num > -5) return 'positive'; if (num < -20) return 'negative'; return 'warning'; }
    if (type === 'volRatio') { if (num >= 1.2) return 'positive'; if (num < 0.8) return 'negative'; return 'neutral'; }
    return 'neutral';
}
function getFundColor(val, type) {
    if (val === "-") return 'neutral'; const num = parseFloat(val);
    if (type === 'pe' || type === 'fpe') { if (num < 0) return 'negative'; if (num < 15) return 'positive'; if (num > 25) return 'negative'; return 'warning'; }
    if (type === 'pb') { if (num < 1.5) return 'positive'; if (num > 3.5) return 'negative'; return 'warning'; }
    if (type === 'div') { if (num >= 3) return 'positive'; if (num == 0) return 'warning'; return 'warning'; }
    if (type === 'beta') { if (num < 1) return 'positive'; if (num > 1.2) return 'negative'; return 'warning'; }
    return 'neutral';
}

function buildTable(data) {
    scannerTableResults.innerHTML = "";
    if (data.length === 0) return;
    scannerTableResults.innerHTML = data.map(item => {
        return `
            <tr class="scanner-row" data-ticker="${item.ticker}">
                <td><strong>${item.ticker}</strong></td>
                <td>u$s ${item.price}</td>
                <td class="${getTechColor(item.rsScore, 'score')}" style="font-weight: bold;">${item.rsScore}</td>
                <td class="${getTechColor(item.volRatio, 'volRatio')}">${item.volRatio}x</td>
                <td class="${getTechColor(item.distLow52, 'distLow')}">${item.distLow52 !== '-' ? '+' + item.distLow52 + '%' : '-'}</td>
                <td class="${getTechColor(item.distHigh52, 'distHigh')}">${item.distHigh52 !== '-' ? item.distHigh52 + '%' : '-'}</td>
                <td class="${getTechColor(item.rsi, 'rsi')}">${item.rsi}</td>
                <td class="${getTechColor(item.sma200, 'trend')}">${item.sma200 > 0 ? '+' : ''}${item.sma200}%</td>
                <td class="${getTechColor(item.sma50, 'trend')}">${item.sma50 > 0 ? '+' : ''}${item.sma50}%</td>
            </tr>
        `;
    }).join("");
}

function buildGrid(data) {
    scannerGridResults.innerHTML = "";
    if (data.length === 0) return;
    scannerGridResults.innerHTML = data.map(item => {
        const epsVal = parseFloat(item.eps); const fepsVal = parseFloat(item.feps);
        return `
            <div class="kpi-card scanner-card" data-ticker="${item.ticker}">
                <div class="kpi-header"><h4>${item.ticker}</h4><span>u$s ${item.price}</span></div>
                <div class="kpi-row"><span>PER Actual</span><div class="indicator ${getFundColor(item.pe, 'pe')}">${item.pe}</div></div>
                <div class="kpi-row"><span>PER Estimado</span><div class="indicator ${getFundColor(item.fpe, 'fpe')}">${item.fpe}</div></div>
                <div class="kpi-row"><span>BPA Actual</span><div class="indicator ${item.eps !== '-' ? (epsVal > 0 ? 'positive' : 'negative') : 'neutral'}">u$s ${item.eps}</div></div>
                <div class="kpi-row"><span>Precio / Libro</span><div class="indicator ${getFundColor(item.pb, 'pb')}">${item.pb}</div></div>
                <div class="kpi-row"><span>Div Yield</span><div class="indicator ${getFundColor(item.divYield, 'div')}">${item.divYield}%</div></div>
            </div>
        `;
    }).join("");
}

// --- VISTA DETALLE CON TRADINGVIEW ---
function showAssetDetail(ticker) {
    const item = scannerData.find(d => d.ticker === ticker);
    if (!item) return;

    scannerListView.style.display = "none";
    scannerDetailView.style.display = "block";

    // Formateo de Ticker para TradingView
    let tvTicker = item.ticker;
    if(tvTicker.includes(".BA")) {
        tvTicker = "BCBA:" + tvTicker.replace(".BA", "");
    } else {
        tvTicker = "NASDAQ:" + tvTicker; // Fallback para USA
    }

    scannerDetailContent.innerHTML = `
        <div class="detail-header-card">
            <h2 class="ticker-title">${item.ticker}</h2>
            <div class="price">u$s ${item.price}</div>
        </div>

        <div class="detail-dashboard">
            <div class="detail-panel">
                <h3 style="color: #00f7ff;">Análisis Técnico</h3>
                <div class="detail-panel-row"><span>RS Score</span><span class="val ${getTechColor(item.rsScore, 'score')}">${item.rsScore}</span></div>
                <div class="detail-panel-row"><span>RSI 14</span><span class="val ${getTechColor(item.rsi, 'rsi')}">${item.rsi}</span></div>
                <div class="detail-panel-row"><span>Dist. EMA 200</span><span class="val ${getTechColor(item.sma200, 'trend')}">${item.sma200 > 0 ? '+' : ''}${item.sma200}%</span></div>
            </div>
            <div class="detail-panel">
                <h3 style="color: #f59e0b;">Análisis Fundamental</h3>
                <div class="detail-panel-row"><span>PER Actual</span><span class="val ${getFundColor(item.pe, 'pe')}">${item.pe}</span></div>
                <div class="detail-panel-row"><span>BPA Actual</span><span class="val">u$s ${item.eps}</span></div>
                <div class="detail-panel-row"><span>Precio / Libro</span><span class="val ${getFundColor(item.pb, 'pb')}">${item.pb}</span></div>
            </div>
        </div>

        <div id="tv_chart_${item.ticker.replace('.','_')}" style="height: 500px; width: 100%; margin-top: 30px; border-radius: 12px; overflow: hidden; border: 1px solid #1f2937;"></div>
    `;

    // Inyectar el Widget luego de que el HTML exista
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

scannerTableResults.addEventListener("click", (e) => {
    const row = e.target.closest('.scanner-row');
    if (row && row.dataset.ticker) showAssetDetail(row.dataset.ticker);
});
scannerGridResults.addEventListener("click", (e) => {
    const card = e.target.closest('.scanner-card');
    if (card && card.dataset.ticker) showAssetDetail(card.dataset.ticker);
});