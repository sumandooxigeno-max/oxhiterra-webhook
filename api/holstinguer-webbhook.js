import { ethers } from 'ethers';

export default async function handler(req, res) {
    // CORS - Permitir todos los orígenes
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    // Manejar preflight OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.WEBHOOK_API_KEY) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const data = req.body;
        const order_id = data.id || data.order_id;
        const email = data.email || data.customer?.email;
        
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

        return res.status(200).json({
            success: true,
            message: `✅ ${totalMetrosCuadrados} m² procesados`,
            order_id: order_id,
            email: email,
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
