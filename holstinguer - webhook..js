import { ethers } from 'ethers';

// ============================================================
// CONFIGURACIÓN
// ============================================================

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SHEETBEST_URL = process.env.SHEETBEST_URL;

const CONTRACT_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) public returns (bool)",
    "function decimals() view returns (uint8)",
    "function walletSAS() view returns (address)"
];

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // API Key
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.WEBHOOK_API_KEY) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const data = req.body;
        const order_id = data.id || data.order_id;
        const email = data.email || data.customer?.email;
        const nombreCompleto = data.customer?.first_name + ' ' + data.customer?.last_name || email;
        
        const lineItems = data.line_items || data.items || [];
        let totalMetrosCuadrados = 0;

        for (const item of lineItems) {
            const cinta = item.cinta || item.tag || item.badge || item.sku || '';
            const nombre = item.name || '';
            
            const esM2 = 
                cinta.toUpperCase().includes('M2') ||
                nombre.toLowerCase().includes('metro cuadrado') ||
                nombre.toLowerCase().includes('bosque') ||
                nombre.toLowerCase().includes('m2');

            if (esM2) {
                const cantidad = parseInt(item.quantity) || 1;
                totalMetrosCuadrados += cantidad;
            }
        }

        if (totalMetrosCuadrados === 0) {
            return res.status(200).json({
                success: true,
                message: 'Sin productos de m²',
                order_id: order_id
            });
        }

        if (!email) {
            return res.status(400).json({ error: 'Email requerido' });
        }

        // Buscar o crear wallet
        const walletAddress = await buscarOCrearWallet(email, nombreCompleto);
        const txHash = await transferirTokens(walletAddress, totalMetrosCuadrados);

        // Guardar en Sheets
        await guardarCompraSheets(email, nombreCompleto, walletAddress, totalMetrosCuadrados, order_id, txHash);

        return res.status(200).json({
            success: true,
            message: `✅ ${totalMetrosCuadrados} m² asignados a ${email}`,
            order_id: order_id,
            wallet: walletAddress,
            tx_hash: txHash,
            metros_cuadrados: totalMetrosCuadrados
        });

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({
            error: 'Error interno',
            details: error.message
        });
    }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

async function buscarOCrearWallet(email, nombre) {
    try {
        const respuesta = await fetch(SHEETBEST_URL);
        const filas = await respuesta.json();
        const usuario = filas.find(f => f["correo electronico"]?.toLowerCase() === email.toLowerCase());
        if (usuario?.wallet) return usuario.wallet;

        const wallet = ethers.Wallet.createRandom();
        await fetch(SHEETBEST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "correo electronico": email,
                "nombre / organizacion": nombre,
                "wallet": wallet.address,
                "private_key": wallet.privateKey,
                "metros cuadrados": 0
            })
        });
        return wallet.address;
    } catch (error) {
        console.error('Error en wallet:', error);
        throw error;
    }
}

async function transferirTokens(destinatario, cantidad) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    const decimals = await contract.decimals();
    const cantidadConDecimals = ethers.utils.parseUnits(cantidad.toString(), decimals);

    const walletSAS = await contract.walletSAS();
    const balanceSAS = await contract.balanceOf(walletSAS);
    
    if (balanceSAS.lt(cantidadConDecimals)) {
        throw new Error(`Saldo insuficiente. Disponible: ${ethers.utils.formatUnits(balanceSAS, decimals)} m²`);
    }

    const tx = await contract.transfer(destinatario, cantidadConDecimals);
    const receipt = await tx.wait();
    return receipt.transactionHash;
}

async function guardarCompraSheets(email, nombre, wallet, m2, orderId, txHash) {
    try {
        const respuesta = await fetch(SHEETBEST_URL);
        const filas = await respuesta.json();
        const index = filas.findIndex(f => f["correo electronico"]?.toLowerCase() === email.toLowerCase());

        if (index >= 0) {
            const id = filas[index]["id"];
            const m2Actuales = parseFloat(filas[index]["metros cuadrados"]) || 0;
            await fetch(`${SHEETBEST_URL}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "metros cuadrados": m2Actuales + m2,
                    "ultima_compra": new Date().toISOString(),
                    "ultimo_order": orderId,
                    "tx_hash": txHash
                })
            });
        } else {
            await fetch(SHEETBEST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "correo electronico": email,
                    "nombre / organizacion": nombre,
                    "metros cuadrados": m2,
                    "wallet": wallet,
                    "fecha_compra": new Date().toISOString(),
                    "order_id": orderId,
                    "tx_hash": txHash
                })
            });
        }
    } catch (error) {
        console.error('Error guardando:', error);
    }
}