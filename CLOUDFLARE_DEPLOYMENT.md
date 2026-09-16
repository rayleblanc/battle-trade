# BATTLE TRADE: Cloudflare Workers Deployment Manual (2026)

Este manual técnico explica detalladamente cómo desplegar el motor autónomo **BATTLE TRADE** en **Cloudflare Workers** utilizando bindings de **KV** para persistencia y **Cron Triggers** para la ejecución autónoma 24/7 sin servidor, manteniéndote 100% dentro de los límites del free-tier.

---

## 🛠️ Arquitectura en la Nube
El sistema se separa en dos componentes independientes de alto rendimiento:
1. **El Motor Autónomo (Worker principal)**:
   - Se ejecuta cada **1 o 2 minutos** de forma automática mediante un Cron Trigger de Cloudflare.
   - Lee/escribe el estado de la sesión, configuración, posiciones abiertas, historial de transacciones y matriz de aprendizaje en **Cloudflare KV**.
   - Evalúa latencia de RPCs públicas, audita contratos mediante la simulación de GoPlus y ejecuta el failover inteligente **Gemini ↔ Groq** solo para los mejores candidatos, descartando de antemano el ruido mediante el filtro adaptativo.
2. **El Panel de Control (Vite Single Page Application)**:
   - Desarrollado en React y Tailwind CSS.
   - Puede ser alojado en **Cloudflare Pages** o en el propio Worker.
   - Interactúa con el Worker principal a través de endpoints REST `/api/*` seguros para visualizar logs en vivo, rendimientos, session keys y configurar parámetros estratégicos.

---

## 📋 Requisitos Previos
1. Una cuenta gratuita en **Cloudflare**.
2. **Node.js** v18+ y **npm** instalados localmente.
3. Claves de API de los proveedores (introducidas como secretos seguros):
   - **Gemini API Key**: Desde Google AI Studio (Gratis).
   - **Groq API Key**: Desde Groq Console (Gratis para modelos como LLaMA 3.3).
   - **Telegram Bot Token & Chat ID** (Para alertas instantáneas de compras y circuito de seguridad).

---

## 🚀 Despliegue Paso a Paso

### Paso 1: Instalar Wrangler CLI e Iniciar Sesión
Si no tienes el CLI de Cloudflare instalado globalmente, puedes instalarlo o ejecutarlo usando `npx`:
```bash
npm install -g wrangler
# O iniciar sesión directamente:
wrangler login
```
Sigue el enlace en el navegador para dar acceso a tu cuenta de Cloudflare.

### Paso 2: Crear el KV Namespace de Persistencia
Crea el namespace en producción para guardar las posiciones y logs. Ejecuta en tu terminal:
```bash
wrangler kv:namespace create TRADING_KV
```
El comando te devolverá una salida similar a esta:
```toml
[[kv_namespaces]]
binding = "TRADING_KV"
id = "xxxx_tu_namespace_id_xxxx"
```
Copia ese fragmento y pégalo en tu archivo `wrangler.toml` para que la persistencia se vincule correctamente en producción.

### Paso 3: Configurar el Archivo `wrangler.toml`
Asegúrate de que tu `wrangler.toml` en la raíz contiene los campos necesarios para Cron y KV:

```toml
name = "battle-mode-trading-engine"
main = "server.ts"
compatibility_date = "2026-09-15"

[vars]
NODE_ENV = "production"
BASE_MAINNET_RPC = "https://mainnet.base.org"
BSC_MAINNET_RPC = "https://binance.llamarpc.com"

[[kv_namespaces]]
binding = "TRADING_KV"
id = "xxxx_tu_namespace_id_xxxx" # Pega aquí tu id real de KV

[triggers]
crons = ["*/1 * * * *"] # Ejecutar cada 1 minuto
```

### Paso 4: Añadir Secretos Seguros en Cloudflare
Para proteger tus API keys y evitar exponerlas en tu repositorio, súbelas de forma cifrada a Cloudflare:
```bash
wrangler secret put GEMINI_API_KEY
# Introduce tu clave de Gemini de Google AI Studio

wrangler secret put GROQ_API_KEY
# Introduce tu clave de Groq

wrangler secret put TELEGRAM_BOT_TOKEN
# Introduce el token de tu bot de Telegram

wrangler secret put TELEGRAM_CHAT_ID
# Introduce tu Chat ID de Telegram para alertas en vivo
```

### Paso 5: Compilar e Iniciar Despliegue
Para empaquetar todo el frontend de React en archivos estáticos optimizados y subir el código del Worker principal:
```bash
# 1. Compilar Frontend
npm run build

# 2. Desplegar a Cloudflare
wrangler deploy
```

---

## ⚡ Estructura del Entry Point para Cloudflare Workers (`index.ts` o exportación)
Si deseas convertir la estructura de Express directamente a un Worker nativo de Cloudflare con soporte para peticiones HTTP y eventos programados (Cron), usa el siguiente patrón de exportación estándar ES Module:

```typescript
export default {
  // Manejador de llamadas HTTP (REST API & Frontend serving)
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Rutas de API REST para el Dashboard
    if (url.pathname === "/api/state") {
      const state = await env.TRADING_KV.get("state_store") || "{}";
      return new Response(state, {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    if (url.pathname === "/api/config-update" && request.method === "POST") {
      const body = await request.json();
      await env.TRADING_KV.put("config", JSON.stringify(body));
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Retornar archivos estáticos para el frontend si es necesario, u hospedar en Pages
    return new Response("Battle Trade Engine API Active", { status: 200 });
  },

  // Manejador del Cron Trigger (Ejecución Autónoma cada 1-2 minutos)
  async scheduled(event: any, env: any, ctx: any) {
    console.log("Iniciando iteración autónoma del Battle Engine...");
    
    // Aquí se inyecta la lógica de:
    // 1. Obtener posiciones activas de env.TRADING_KV.
    // 2. Escaneo ligero de DEX Screener.
    // 3. Auditoría GoPlus rápida.
    // 4. Failover inteligente Gemini ↔ Groq para el mejor par.
    // 5. Ajuste dinámico de trailing stop y protección de capital (Principal Recovery).
    // 6. Alerta instantánea a Telegram.
    
    // Esta ejecución autónoma utiliza el CPU Time mínimo del plan free-tier (50ms).
  }
};
```

---

## 🐳 Simulación Local de Cloudflare Workers con Wrangler
Puedes probar toda la lógica de persistencia en KV localmente sin gastar recursos de tu cuenta ejecutando:
```bash
wrangler dev --local
```
Esto creará un almacenamiento local persistente que simula exactamente el comportamiento de Cloudflare Workers en producción.

---
**BATTLE TRADE** - Arquitectura de Trading Autónoma de Nivel Institucional.
