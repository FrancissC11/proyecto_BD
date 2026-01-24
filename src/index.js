const express = require('express');
const dotenv = require('dotenv');

// Configuración de variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware para archivos estáticos (tu carpeta public)
app.use(express.static('public'));

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('¡Hola! El servidor está funcionando correctamente.');
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});