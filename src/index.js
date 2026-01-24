const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const { getConnection } = require('./config/db');

// Controladores
const authController = require('./controllers/authController');
const appointmentController = require('./controllers/appointmentController');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- RUTAS DE AUTH ---
app.get('/', authController.showLogin); 
app.post('/', authController.login);
app.get('/register', authController.showRegister);
app.post('/register', authController.register);
app.get('/logout', authController.logout);

// --- RUTAS DE VISTAS ---
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/manager', (req, res) => res.sendFile(path.join(__dirname, 'views', 'manager.html')));
app.get('/user', (req, res) => res.sendFile(path.join(__dirname, 'views', 'user.html')));

// --- RUTAS API (CITAS) ---
app.get('/api/form-data', appointmentController.getDataForForm);
app.get('/api/empleados', appointmentController.getEmpleados);
app.get('/api/mis-citas', appointmentController.getMyAppointments);

// IMPORTANTE: ESTA ES LA RUTA QUE FALTABA O FALLABA
app.get('/api/slots', appointmentController.getAvailableSlots);

app.post('/cita/save', appointmentController.saveAppointment);
app.delete('/api/cita/:id_cita', appointmentController.cancelAppointment);

// --- START ---
getConnection().then((pool) => {
    if (pool) console.log('✅ Conexión a SQL Server exitosa');
    else console.error('❌ No se pudo conectar a la BD');
}).catch(err => console.error(err));

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});