const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ruta de prueba
app.get('/', (req, res) => {
    // __dirname es la carpeta src actual, subimos un nivel si fuera necesario, 
    // pero aquí concatenamos directo hacia views
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// RUTA USUARIO (CLIENTE)
app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'user.html'));
});

// RUTA GERENTE DE SUCURSAL
app.get('/manager', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'manager.html'));
});

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});