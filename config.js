export const CONFIG = {
    BASE_URL: "https://data912.com/live",
    ENDPOINTS: {
        bonos: "arg_bonds",
        letras: "arg_notes",
        cedears: "arg_cedears",
        acciones: "arg_stocks"
    },
    DOLLAR_API: "https://api.argentinadatos.com/v1/cotizaciones/dolares",
    
    // Tu servidor Proxy Privado de Cloudflare (Para históricos y gráficos)
    PROXY_URL: "https://silent-flower-771c.brian-devesa7.workers.dev/?url=",
    
    // PEGA ACÁ EL LINK .CSV DE TU GOOGLE SHEETS (Tu nueva base de datos)
    SHEETS_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTzsP29en2U9T5Dq3051DnonK07rBQuy4_zazlxt0Cz_AqO75ZvV4r--1KylVpFOrBpT_qtOe3LvIUj/pub?gid=0&single=true&output=csv"
}