import express from 'express';
import { ethers } from 'ethers';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// ✅ WEBHOOK ENDPOINT (LA RUTA CORRECTA)
app.post('/api/holstinguer-webhook', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== process.env.WEBHOOK_API_KEY) {
            return res.status(401).json({ error: 'No autorizado' });
        }

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
});

// Ruta de prueba (la que funciona ahora)
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Webhook funcionando' });
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
