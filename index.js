import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/holstinguer-webhook', (req, res) => {
    res.json({
        success: true,
        message: 'Webhook funcionando correctamente',
        received: req.body
    });
});

app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor funcionando' });
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
