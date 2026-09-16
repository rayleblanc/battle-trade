# 🛡️ BATTLE TRADE - Sistema de Trading de Memecoins de Alta Resiliencia con Aprendizaje Adaptativo

Este sistema es una infraestructura completa de nivel profesional para la detección, auditoría de seguridad automatizada, análisis de régimen de mercado en tiempo real, toma de decisiones asistida por IA (Gemini API) y ejecución autónoma de micro-posiciones en las redes **Base** (prioridad absoluta) y **BSC** a través de Exchanges Descentralizados (DEX).

El motor funciona bajo la filosofía de **selectividad extrema y modo batalla**: no competimos en velocidad de red bruta contra los grandes fondos institucionales, sino en **disciplina selectiva (descartando entre el 97% y el 99% de los tokens), protección implacable del principal, adaptabilidad en base al régimen de mercado y un circuito de retroalimentación de lecciones aprendidas (Self-Improvement)**.

---

## 🧠 Filosofía Táctica: "El Tiburón de Base"
En un mercado inundado de bots profesionales y trampas de liquidez, el trader individual suele ser el eslabón débil. Este bot elimina el factor humano e implementa reglas de supervivencia implacables:
- **Capital Mínimo e Inteligente**: Optimizado para micro-posiciones ($1.50 - $3.00 USD), limitando la exposición total y permitiendo que carteras de $10 - $50 USD sobrevivan semanas de entrenamiento en entornos hostiles.
- **Filtros de Seguridad Inflexibles**: Auditorías multifase integrando métricas simuladas de GoPlus Security, Honeypot.is, bloqueo de LP, quema de tokens de creador y simulación on-chain de gas (`eth_estimateGas`) para prever trampas antes de firmar transacciones.
- **Auto-Mejora y Retroalimentación con IA**: Cada operación ejecutada (sea ganadora o perdedora) se registra en un circuito de aprendizaje. La IA de Gemini analiza las condiciones del trade, extrae la lección aprendida y genera una sugerencia de ajuste táctico que retroalimenta dinámicamente las futuras decisiones de compra y venta.

---

## 📈 Algoritmo de Detección de Regímenes de Mercado
El motor monitorea las condiciones generales de liquidez y volatilidad cada 10 segundos para clasificar el mercado en uno de cuatro regímenes tácticos, adaptando las políticas de riesgo automáticamente:

1. **🚀 HIGH_VOLATILITY (Volatilidad Extrema / Narrativas Explosivas)**:
   - *Condición*: Variación promedio de precios en 5 minutos superior al 4% con alto volumen.
   - *Acción*: Aumenta la distancia del trailing stop (a 25%) para permitir respirar al token, reduce el tamaño de entrada un 20% para compensar el slippage salvaje, y exige un puntaje GoPlus superior a 90.
2. **📈 MOMENTUM (Alineación de Tendencia Fuerte)**:
   - *Condición*: Variación de precios positiva (> 1.5%) sostenida con volumen ascendente.
   - *Acción*: Estado óptimo de ataque. Habilita el tamaño de entrada configurado completo ($2.50 USD), utiliza stops estándar (15% trailing, 20% stop-loss) y busca capitalizar la aceleración.
3. **🌪️ CHOPPY (Mercado Picado / Ruido con Falsas Rupturas)**:
   - *Condición*: Precios oscilantes sin tendencia clara en el promedio de escaneos.
   - *Acción*: Reduce la meta de Take Profit de inmediato al 40% (para asegurar ganancias rápidas antes de la reversión), y reduce la racha de tolerancia a pérdidas consecutivas.
4. **💤 DEAD (Mercado Apático / Iliquidez Crítica)**:
   - *Condición*: Volumen plano y volatilidad menor a 0.5%.
   - *Acción*: **Modo Defensa Absoluta**. Reduce automáticamente el tamaño de entrada a la mitad ($1.25 USD) para evitar trampas de liquidez (liquidity traps) y eleva el umbral mínimo de seguridad GoPlus a un restrictivo **93/100** para rechazar el 99.5% de los tokens escaneados.

---

## 🛡️ Guía de Ejecución Real: Session Keys / EIP-7702

Para migrar este motor del modo simulación "paper trading" a operaciones on-chain reales sin comprometer la seguridad de tus fondos (sin guardar tus claves privadas maestras en servidores en la nube ni en bases de datos), la arquitectura de producción se diseña sobre **Cuentas Inteligentes (Smart Accounts)** y **Claves de Sesión (Session Keys)**, aprovechando las ventajas de la abstracción de cuenta nativa y el futuro estándar de actualización **EIP-7702** en Base.

### 🗺️ Paso a Paso para la Integración On-Chain:

#### 1. Creación de una Cuenta Inteligente (Smart Account)
En lugar de operar con una Clave Privada EOAs (Externally Owned Account) tradicional de MetaMask, el bot interactúa mediante una billetera multi-firma o Smart Account (ej. utilizando el SDK de **Safe Core**, **Biconomy** o **ZeroDev**):
- La billetera inteligente reside en un contrato on-chain controlado por tu firma principal (tu MetaMask).
- Cuenta con módulos conectables que permiten delegar la firma de transacciones bajo reglas condicionales ultra-estrictas.

#### 2. Generación de una Clave de Sesión Local (Session Key)
El servidor backend del bot genera un par de claves efímeras locales (una clave privada temporal almacenada únicamente en la memoria volátil del proceso o protegida en Cloudflare KV cifrado):
```typescript
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Generar una llave privada temporal para el bot
const sessionPrivateKey = generatePrivateKey();
const sessionAccount = privateKeyToAccount(sessionPrivateKey);
console.log("Dirección del Bot de Sesión:", sessionAccount.address);
```

#### 3. Registro y Autorización de la Session Key (On-Chain)
A través de tu MetaMask en el frontend, firmas una transacción única que autoriza la dirección de la `Session Key` temporal a interactuar con la Cuenta Inteligente on-chain bajo límites estrictos (Módulo de Session Keys):
- **Contratos Permitidos**: Únicamente los contratos de Swap aprobados (ej. Uniswap V3 SwapRouter en Base: `0x2626664c2603f2297d79d1dec4ec9780414cc22a` o PancakeSwap v3).
- **Tokens Permitidos**: Únicamente se permite gastar un máximo diario/por sesión de **WETH** o **USDC** (ej. límite de $20 USD).
- **Límite de Tiempo**: La sesión expira automáticamente en 24 horas (ej. `validUntil: Math.floor(Date.now() / 1000) + 86400`).
- **Acciones Bloqueadas**: La llave de sesión **NUNCA** puede realizar retiros de fondos directo a otras direcciones de billeteras, cambiar las llaves controladoras de la cuenta, ni interactuar con protocolos DeFi no aprobados.

```json
{
  "sessionKey": "0xBotSessionKeyAddress...",
  "permissions": [
    {
      "target": "0x2626664c2603f2297d79d1dec4ec9780414cc22a", // Uniswap V3 Router
      "selector": "0x414bf389", // Selector de función: exactInputSingle
      "rules": [
        {
          "offset": 0,
          "condition": "LESS_THAN_OR_EQUAL",
          "value": "2500000" // Máximo de 2.50 USD por transacción
        }
      ]
    }
  ],
  "validUntil": 1726485600
}
```

#### 4. Ejecución de Transacciones Firmadas por la Session Key
Cuando el motor decide comprar un token, firma la transacción de Swap localmente con su clave de sesión efímera. Luego, envía esta firma y el payload de transacción al retransmisor (Bundler de ERC-4337):
- El Bundler empaqueta la transacción como una **UserOperation**.
- El contrato de Smart Wallet verifica que la transacción cumple con los límites de sesión guardados (contrato Uniswap Router, monto menor a $2.50 USD, sesión vigente) y ejecuta el swap en Base o BSC.
- Si un atacante comprometiera el servidor del bot, lo máximo que podría perderse es el límite de gasto diario de la sesión (ej. $10 - $20 USD), mientras tu billetera principal y todos tus fondos mayores se mantienen completamente protegidos off-chain.

---

## 🛠️ Configuración de Entorno & API Keys

Para ejecutar este sistema en local o desplegarlo, crea tu archivo `.env` siguiendo las definiciones de `.env.example`:

```env
# Google AI Studio Gemini API Key (Gráficamente administrado de forma segura)
GEMINI_API_KEY="tu_clave_api_aquí"

# URL de la aplicación
APP_URL="http://localhost:3000"
```

### Ejecutar en Desarrollo:
1. Instala dependencias necesarias:
   ```bash
   npm install
   ```
2. Ejecuta el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```
3. Abre [http://localhost:3000](http://localhost:3000) para entrar al centro de mando "modo batalla".

---

## ⚠️ Descargo de Responsabilidad y Advertencia de Riesgo

**El trading en Exchanges Descentralizados de redes ultrarrápidas (Base y BSC) involucra riesgos financieros extremos.** La gran mayoría de los nuevos pares creados son estafas directas (rug pulls, honeypots, trampas de liquidez). Este software se proporciona única y exclusivamente con fines informativos, de desarrollo educativo y experimentación en simulador. **Nunca expongas fondos reales que no estés absolutamente dispuesto a perder en su totalidad.**
